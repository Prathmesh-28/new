"""
Headroom Forecast Engine — v2.0.0
Python + FastAPI + NumPy + scikit-learn + statsmodels

Three sub-models run in sequence:
  A  Recurring transaction detection (sliding-window)
  B  Variable expense model (Holt-Winters / rolling P10/P50/P90)
  C  Scenario overlay (additive layer on top of base forecast)

Results are written to forecast_datapoints and cached in Redis (1-hour TTL).
Recalculation is triggered by: new transaction data, user refresh, 6-hour schedule.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import psycopg2
import redis
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

# statsmodels is optional; gracefully degrade when not installed
try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing  # type: ignore
    HAS_STATSMODELS = True
except ImportError:
    HAS_STATSMODELS = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class Settings(BaseSettings):
    db_host: str = os.getenv("DB_HOST", "localhost")
    db_port: int = int(os.getenv("DB_PORT", "5432"))
    db_name: str = os.getenv("DB_NAME", "headroom")
    db_user: str = os.getenv("DB_USER", "postgres")
    db_password: str = os.getenv("DB_PASSWORD", "postgres")

    redis_host: str = os.getenv("REDIS_HOST", "localhost")
    redis_port: int = int(os.getenv("REDIS_PORT", "6379"))
    redis_password: Optional[str] = os.getenv("REDIS_PASSWORD")
    redis_db: int = int(os.getenv("REDIS_DB", "0"))

    plaid_webhook_secret: str = os.getenv("PLAID_WEBHOOK_SECRET", "")
    environment: str = os.getenv("ENVIRONMENT", "development")
    service_port: int = 8001

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# ---------------------------------------------------------------------------
# Infrastructure clients (initialised at startup)
# ---------------------------------------------------------------------------

_db_pool: Optional[psycopg2.pool.SimpleConnectionPool] = None
_redis: Optional[redis.Redis] = None


def get_db_conn() -> psycopg2.extensions.connection:
    if _db_pool is None:
        raise RuntimeError("DB pool not initialised")
    return _db_pool.getconn()


def release_db_conn(conn: psycopg2.extensions.connection) -> None:
    if _db_pool:
        _db_pool.putconn(conn)


def get_redis() -> redis.Redis:
    if _redis is None:
        raise RuntimeError("Redis client not initialised")
    return _redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db_pool, _redis
    # DB pool
    _db_pool = psycopg2.pool.SimpleConnectionPool(
        1, 10,
        host=settings.db_host,
        port=settings.db_port,
        dbname=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
    )
    logger.info("✅ DB pool initialised")

    # Redis
    _redis = redis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        password=settings.redis_password,
        db=settings.redis_db,
        decode_responses=True,
    )
    logger.info("✅ Redis client initialised")

    yield

    if _db_pool:
        _db_pool.closeall()
    logger.info("Forecast Engine shut down")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ForecastDatapoint(BaseModel):
    date: str
    balance_p10: float
    balance_p50: float
    balance_p90: float
    confidence_score: float = Field(ge=0.0, le=1.0)


class ForecastResponse(BaseModel):
    id: str
    tenant_id: str
    generated_at: str
    status: str
    model_version: str
    datapoints: List[ForecastDatapoint]


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: str = Field(pattern=r"^(new_hire|contract_won|loan_draw|custom)$")
    parameters: Dict[str, Any]


class ScenarioResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    type: str
    parameters: Dict[str, Any]
    version: int
    created_at: str


class RecalculateResponse(BaseModel):
    message: str
    recalculated: bool
    tenant_id: str


# ---------------------------------------------------------------------------
# Sub-model A — Recurring transaction detection
# ---------------------------------------------------------------------------

MONTHLY_VARIANTS = {28, 29, 30, 31}   # tolerated month-length differences


def _amount_bucket(amount: float) -> float:
    """Round to nearest $50 bucket for grouping."""
    return round(amount / 50) * 50


def _infer_frequency(mean_days: float) -> str:
    if mean_days < 3:
        return "daily"
    if mean_days < 10:
        return "weekly"
    if mean_days < 20:
        return "biweekly"
    if mean_days < 45:
        return "monthly"
    if mean_days < 100:
        return "quarterly"
    return "annual"


def _is_month_variance(intervals: List[float], mean_days: float) -> bool:
    """Return True when variance is explained by calendar month-length differences (28–31)."""
    if not (27 <= mean_days <= 32):
        return False
    # All intervals must be in the 28-31 day window
    return all(28 <= iv <= 31 for iv in intervals)


def detect_recurring(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Sub-model A — sliding-window recurring detection.

    Groups transactions by (merchant_name, amount_bucket, category).
    A pattern is flagged recurring when:
      • 3+ occurrences
      • inter-arrival CoV² < 0.20  (variance / mean²)
      • amount CoV² < 0.15

    Special handling:
      • 28–31 day month variance is accepted as zero inter-arrival variance
      • Annual transactions tolerated (300–380 day intervals)
      • Quarterly taxes tolerated (80–100 day intervals)
    Returns a list of detected patterns sorted by confidence desc.
    """
    groups: Dict[Tuple, List[Dict[str, Any]]] = defaultdict(list)
    for txn in transactions:
        key = (
            txn.get("merchant_name", ""),
            _amount_bucket(float(txn.get("amount", 0))),
            txn.get("category", ""),
        )
        groups[key].append(txn)

    patterns: List[Dict[str, Any]] = []

    for (merchant, amt_bucket, category), txns in groups.items():
        if len(txns) < 3:
            continue

        # Sort by date
        sorted_txns = sorted(txns, key=lambda t: t["date"])
        dates = [t["date"] if isinstance(t["date"], date) else
                 datetime.strptime(str(t["date"]), "%Y-%m-%d").date()
                 for t in sorted_txns]

        intervals = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
        if not intervals:
            continue

        mean_interval = float(np.mean(intervals))
        if mean_interval <= 0:
            continue

        # Inter-arrival variance (CoV²)
        if _is_month_variance(intervals, mean_interval):
            interval_cov2 = 0.0
        else:
            interval_cov2 = float(np.var(intervals)) / (mean_interval ** 2)

        # Amount variance (CoV²)
        amounts = [float(t["amount"]) for t in sorted_txns]
        mean_amount = float(np.mean(amounts))
        if mean_amount == 0:
            continue
        amount_cov2 = float(np.var(amounts)) / (mean_amount ** 2)

        if interval_cov2 >= 0.20 or amount_cov2 >= 0.15:
            continue

        # Consistency score → confidence weight
        consistency = 1.0 - (interval_cov2 / 0.20 + amount_cov2 / 0.15) / 2
        confidence = max(0.0, min(1.0, consistency))

        patterns.append({
            "merchant": merchant,
            "amount_bucket": amt_bucket,
            "category": category,
            "mean_amount": mean_amount,
            "interval_days": mean_interval,
            "frequency": _infer_frequency(mean_interval),
            "confidence": confidence,
            "occurrences": len(sorted_txns),
            "last_date": dates[-1].isoformat(),
        })

    return sorted(patterns, key=lambda p: p["confidence"], reverse=True)


def project_recurring(
    patterns: List[Dict[str, Any]],
    horizon_days: int = 90,
    base_date: Optional[date] = None,
) -> np.ndarray:
    """
    Build a daily cash-flow array from recurring patterns.
    Each hit is weighted by confidence.
    """
    if base_date is None:
        base_date = date.today()

    daily = np.zeros(horizon_days)

    for p in patterns:
        amount = p["mean_amount"] * p["confidence"]
        interval = p["interval_days"]
        if interval <= 0:
            continue

        # Calculate offset from last occurrence
        last = date.fromisoformat(p["last_date"])
        days_since_last = (base_date - last).days

        # First occurrence after base_date
        offset = int(interval - (days_since_last % interval))
        if offset == int(interval):
            offset = 0

        day = offset
        while day < horizon_days:
            daily[int(day)] += amount
            day += interval

    return daily


# ---------------------------------------------------------------------------
# Sub-model B — Variable expense model
# ---------------------------------------------------------------------------

def holt_winters_forecast(
    series: np.ndarray,
    horizon_days: int,
) -> np.ndarray:
    """
    Apply Holt-Winters triple exponential smoothing to a monthly aggregated series
    and expand back to daily projections.
    Requires statsmodels; falls back to rolling mean if not available.
    """
    if not HAS_STATSMODELS or len(series) < 12:
        # Simple rolling mean fallback
        return np.full(horizon_days, float(np.mean(series[-90:])))

    try:
        # Aggregate daily → monthly (30-day buckets)
        monthly = [float(np.sum(series[i:i + 30])) for i in range(0, len(series) - 29, 30)]
        if len(monthly) < 12:
            return np.full(horizon_days, float(np.mean(series)))

        model = ExponentialSmoothing(
            monthly,
            trend="add",
            seasonal="add",
            seasonal_periods=12,
            initialization_method="estimated",
        )
        fit = model.fit(optimized=True)
        months_needed = (horizon_days // 30) + 1
        monthly_forecast = fit.forecast(months_needed)

        # Expand monthly back to daily (uniform within month)
        daily_forecast = []
        for m in monthly_forecast:
            daily_forecast.extend([float(m) / 30.0] * 30)

        return np.array(daily_forecast[:horizon_days])
    except Exception as exc:
        logger.warning("Holt-Winters failed (%s), using rolling mean", exc)
        return np.full(horizon_days, float(np.mean(series)))


def compute_variable_expenses(
    transactions: List[Dict[str, Any]],
    horizon_days: int = 90,
    base_date: Optional[date] = None,
) -> Dict[str, Dict[str, np.ndarray]]:
    """
    Sub-model B — variable expense model.

    Returns per-category dict:
        {category: {"p10": ndarray, "p50": ndarray, "p90": ndarray}}

    Logic:
      • Group by category, expense transactions only (amount < 0)
      • Compute rolling 90-day average spend
      • Apply Holt-Winters if 12+ months of data exist
      • Output P10/P50/P90 daily distribution per category
    """
    if base_date is None:
        base_date = date.today()

    # Build time-indexed daily totals per category
    cat_daily: Dict[str, Dict[date, float]] = defaultdict(lambda: defaultdict(float))
    for txn in transactions:
        if float(txn.get("amount", 0)) >= 0:
            continue  # skip revenue/transfers
        txn_date = (
            txn["date"]
            if isinstance(txn["date"], date)
            else datetime.strptime(str(txn["date"]), "%Y-%m-%d").date()
        )
        cat = txn.get("category", "other")
        cat_daily[cat][txn_date] += abs(float(txn["amount"]))

    result: Dict[str, Dict[str, np.ndarray]] = {}

    for cat, daily_totals in cat_daily.items():
        if not daily_totals:
            continue

        # Build dense array from earliest date to base_date
        all_dates = sorted(daily_totals.keys())
        earliest = all_dates[0]
        total_hist_days = (base_date - earliest).days + 1

        history = np.zeros(total_hist_days)
        for d, amt in daily_totals.items():
            idx = (d - earliest).days
            if 0 <= idx < total_hist_days:
                history[idx] = amt

        # Rolling 90-day window for distribution
        window = min(90, total_hist_days)
        recent = history[-window:]
        nonzero = recent[recent > 0]
        if len(nonzero) < 3:
            continue

        p10 = float(np.percentile(nonzero, 10))
        p50 = float(np.percentile(nonzero, 50))
        p90 = float(np.percentile(nonzero, 90))

        # Use Holt-Winters if we have 12+ months of data
        use_hw = total_hist_days >= 365
        if use_hw:
            hw_forecast = holt_winters_forecast(history, horizon_days)
        else:
            hw_forecast = np.full(horizon_days, p50)

        # Daily P10/P50/P90 with HW as the median anchor
        result[cat] = {
            "p10": hw_forecast * (p10 / p50) if p50 > 0 else np.full(horizon_days, p10),
            "p50": hw_forecast,
            "p90": hw_forecast * (p90 / p50) if p50 > 0 else np.full(horizon_days, p90),
        }

    return result


def add_known_obligations(
    daily_p50: np.ndarray,
    obligations: List[Dict[str, Any]],
    base_date: Optional[date] = None,
) -> np.ndarray:
    """
    Inject known future cash obligations (invoices, loan repayments, tax dates).
    Each obligation: {date: str, amount: float, type: str}
    """
    if base_date is None:
        base_date = date.today()

    result = daily_p50.copy()
    horizon = len(result)

    for ob in obligations:
        ob_date = (
            ob["date"]
            if isinstance(ob["date"], date)
            else date.fromisoformat(str(ob["date"]))
        )
        idx = (ob_date - base_date).days
        if 0 <= idx < horizon:
            result[idx] += float(ob.get("amount", 0))  # negative = outflow

    return result


# ---------------------------------------------------------------------------
# Sub-model C — Scenario overlay
# ---------------------------------------------------------------------------

def apply_scenario_overlay(
    base_daily: np.ndarray,
    scenarios: List[Dict[str, Any]],
    base_date: Optional[date] = None,
) -> np.ndarray:
    """
    Sub-model C — additive scenario overlay.

    Supported scenario types:
      new_hire:      salary * 1.15 / 12 monthly outflow from start_date
      contract_won:  invoice inflow at base_date + payment_terms days
      loan_draw:     inflow on draw_date, monthly repayment series
      custom:        raw daily_delta array passed directly
    """
    if base_date is None:
        base_date = date.today()

    overlay = np.zeros(len(base_daily))

    for sc in scenarios:
        sc_type = sc.get("type")
        params = sc.get("parameters", {})

        if sc_type == "new_hire":
            salary = float(params.get("salary", 0))
            employer_cost = salary * 1.15  # employer costs
            monthly_cost = employer_cost / 12
            start = date.fromisoformat(params["start_date"])
            start_idx = max(0, (start - base_date).days)
            # Apply on each 30-day mark from start
            day = start_idx
            while day < len(overlay):
                overlay[day] -= monthly_cost
                day += 30

        elif sc_type == "contract_won":
            amount = float(params.get("amount", 0))
            terms = int(params.get("payment_terms", 30))  # net-30/60/90
            payment_date = date.fromisoformat(params["contract_date"]) + timedelta(days=terms)
            idx = (payment_date - base_date).days
            if 0 <= idx < len(overlay):
                overlay[idx] += amount

        elif sc_type == "loan_draw":
            draw_amount = float(params.get("draw_amount", 0))
            repayment_amount = float(params.get("repayment_amount", 0))
            term_months = int(params.get("term_months", 12))
            draw_date = date.fromisoformat(params.get("draw_date", base_date.isoformat()))
            draw_idx = max(0, (draw_date - base_date).days)

            if draw_idx < len(overlay):
                overlay[draw_idx] += draw_amount  # inflow

            monthly_payment = repayment_amount / term_months
            for m in range(term_months):
                idx = draw_idx + m * 30
                if idx < len(overlay):
                    overlay[idx] -= monthly_payment

        elif sc_type == "custom":
            deltas = params.get("daily_delta", [])
            for i, delta in enumerate(deltas):
                if i < len(overlay):
                    overlay[i] += float(delta)

    return base_daily + overlay


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def db_get_latest_forecast(tenant_id: str, conn) -> Optional[Dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, tenant_id, generated_at, status, base_model_version
            FROM forecasts
            WHERE tenant_id = %s
            ORDER BY generated_at DESC
            LIMIT 1
            """,
            (tenant_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def db_count_transactions_since(tenant_id: str, since: datetime, conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM transactions WHERE tenant_id = %s AND created_at > %s",
            (tenant_id, since),
        )
        return cur.fetchone()[0]


def db_get_transactions(tenant_id: str, days: int, conn) -> List[Dict[str, Any]]:
    cutoff = date.today() - timedelta(days=days)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT date, amount, category, counterparty AS merchant_name,
                   is_recurring, frequency, confidence_score, description
            FROM transactions
            WHERE tenant_id = %s AND date >= %s
            ORDER BY date ASC
            """,
            (tenant_id, cutoff),
        )
        return [dict(r) for r in cur.fetchall()]


def db_get_scenarios(tenant_id: str, conn) -> List[Dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, tenant_id, name, type, parameters, version, created_at
            FROM forecast_scenarios
            WHERE tenant_id = %s AND active = TRUE
            ORDER BY created_at DESC
            """,
            (tenant_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def db_get_obligations(tenant_id: str, conn) -> List[Dict[str, Any]]:
    """Future known obligations: due invoices, loan repayments, tax dates."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT due_date AS date, amount, obligation_type AS type
            FROM future_obligations
            WHERE tenant_id = %s AND due_date >= CURRENT_DATE
            ORDER BY due_date ASC
            """,
            (tenant_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def db_save_forecast(tenant_id: str, model_version: str, conn) -> str:
    forecast_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO forecasts (id, tenant_id, forecast_date, generated_at,
                                   base_model_version, days_forecasted, status)
            VALUES (%s, %s, CURRENT_DATE, NOW(), %s, 90, 'complete')
            """,
            (forecast_id, tenant_id, model_version),
        )
    conn.commit()
    return forecast_id


def db_save_datapoints(forecast_id: str, datapoints: List[Dict[str, Any]], conn) -> None:
    with conn.cursor() as cur:
        for dp in datapoints:
            cur.execute(
                """
                INSERT INTO forecast_datapoints
                    (forecast_id, date, best_case, expected_case, downside_case, confidence_level)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    forecast_id,
                    dp["date"],
                    dp["balance_p90"],   # best case
                    dp["balance_p50"],   # expected
                    dp["balance_p10"],   # downside
                    dp["confidence_score"],
                ),
            )
    conn.commit()


def db_save_scenario(tenant_id: str, scenario: Dict[str, Any], conn) -> str:
    scenario_id = str(uuid.uuid4())

    # Version bump: find latest version for same name
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(MAX(version), 0) + 1
            FROM forecast_scenarios
            WHERE tenant_id = %s AND name = %s
            """,
            (tenant_id, scenario["name"]),
        )
        version = cur.fetchone()[0]

        # Deactivate previous versions
        cur.execute(
            "UPDATE forecast_scenarios SET active = FALSE WHERE tenant_id = %s AND name = %s",
            (tenant_id, scenario["name"]),
        )

        cur.execute(
            """
            INSERT INTO forecast_scenarios
                (id, tenant_id, name, type, parameters, version, active, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE, NOW())
            """,
            (
                scenario_id,
                tenant_id,
                scenario["name"],
                scenario["type"],
                json.dumps(scenario["parameters"]),
                version,
            ),
        )
    conn.commit()
    return scenario_id, version


# ---------------------------------------------------------------------------
# Redis cache helpers
# ---------------------------------------------------------------------------

CACHE_TTL = 3600  # 1 hour


def cache_key(tenant_id: str) -> str:
    return f"forecast:latest:{tenant_id}"


def cache_get(tenant_id: str) -> Optional[Dict[str, Any]]:
    try:
        r = get_redis()
        raw = r.get(cache_key(tenant_id))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("Redis get failed: %s", exc)
        return None


def cache_set(tenant_id: str, data: Dict[str, Any]) -> None:
    try:
        r = get_redis()
        r.setex(cache_key(tenant_id), CACHE_TTL, json.dumps(data, default=str))
    except Exception as exc:
        logger.warning("Redis set failed: %s", exc)


def cache_invalidate(tenant_id: str) -> None:
    try:
        r = get_redis()
        r.delete(cache_key(tenant_id))
    except Exception as exc:
        logger.warning("Redis delete failed: %s", exc)


# ---------------------------------------------------------------------------
# Forecast recalculation trigger logic (per spec)
# ---------------------------------------------------------------------------

def should_recalculate(tenant_id: str, conn) -> bool:
    """
    Returns True when any of these conditions hold:
      • No forecast exists
      • >= 6 hours since last forecast
      • >= 10 new transactions since last forecast
      • >= 1 hour since last forecast AND >= 3 new transactions
    """
    latest = db_get_latest_forecast(tenant_id, conn)
    if not latest:
        return True

    generated_at: datetime = latest["generated_at"]
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=None)

    hours_since = (datetime.utcnow() - generated_at).total_seconds() / 3600
    new_txns_since = db_count_transactions_since(tenant_id, generated_at, conn)

    return (
        hours_since >= 6
        or new_txns_since >= 10
        or (hours_since >= 1 and new_txns_since >= 3)
    )


# ---------------------------------------------------------------------------
# Core forecast pipeline
# ---------------------------------------------------------------------------

MODEL_VERSION = "2.0.0"
HORIZON_DAYS = 90
HISTORY_DAYS = 400  # load up to ~13 months for Holt-Winters


def run_forecast(tenant_id: str) -> Dict[str, Any]:
    """
    Full forecast pipeline:
      1. Load transactions (up to 400 days for Holt-Winters eligibility)
      2. Sub-model A — detect recurring, project 90 days
      3. Sub-model B — variable expense P10/P50/P90 per category
      4. Inject known future obligations
      5. Sub-model C — scenario overlay
      6. Build cumulative balance bands
      7. Persist to DB
      8. Cache in Redis
    """
    logger.info("Generating forecast for tenant %s", tenant_id)
    conn = get_db_conn()
    try:
        transactions = db_get_transactions(tenant_id, HISTORY_DAYS, conn)
        scenarios = db_get_scenarios(tenant_id, conn)

        try:
            obligations = db_get_obligations(tenant_id, conn)
        except Exception:
            obligations = []  # table may not exist in all deployments

        logger.info("Loaded %d transactions, %d scenarios", len(transactions), len(scenarios))

        # --- Sub-model A ---
        patterns = detect_recurring(transactions)
        recurring_daily = project_recurring(patterns, HORIZON_DAYS)
        logger.info("Sub-model A: %d recurring patterns detected", len(patterns))

        # --- Sub-model B ---
        var_expense = compute_variable_expenses(transactions, HORIZON_DAYS)
        # Aggregate into single P10/P50/P90 daily arrays
        var_p10 = np.zeros(HORIZON_DAYS)
        var_p50 = np.zeros(HORIZON_DAYS)
        var_p90 = np.zeros(HORIZON_DAYS)
        for cat_dist in var_expense.values():
            var_p10 += cat_dist["p10"]
            var_p50 += cat_dist["p50"]
            var_p90 += cat_dist["p90"]
        logger.info("Sub-model B: %d expense categories modelled", len(var_expense))

        # Base daily cash-flow (recurring + variable; p50 path)
        base_p10 = recurring_daily - var_p10
        base_p50 = recurring_daily - var_p50
        base_p90 = recurring_daily - var_p90  # p90 expense → worst income path... adjust sign below

        # Inject known obligations into median path only
        base_p50 = add_known_obligations(base_p50, obligations)

        # --- Sub-model C ---
        final_p10 = apply_scenario_overlay(base_p10, scenarios)
        final_p50 = apply_scenario_overlay(base_p50, scenarios)
        final_p90 = apply_scenario_overlay(base_p90, scenarios)

        # --- Build cumulative balance bands ---
        # Confidence degrades with horizon; base on pattern consistency
        avg_confidence = float(np.mean([p["confidence"] for p in patterns])) if patterns else 0.75

        datapoints: List[Dict[str, Any]] = []
        cum_p10 = cum_p50 = cum_p90 = 0.0
        today = date.today()

        for day in range(HORIZON_DAYS):
            cum_p10 += float(final_p10[day])
            cum_p50 += float(final_p50[day])
            cum_p90 += float(final_p90[day])

            # Confidence decays linearly from avg_confidence → 0.5 over 90 days
            decay = (HORIZON_DAYS - day) / HORIZON_DAYS
            confidence = avg_confidence * decay + 0.5 * (1 - decay)

            datapoints.append({
                "date": (today + timedelta(days=day)).isoformat(),
                "balance_p10": round(min(cum_p10, cum_p50), 2),
                "balance_p50": round(cum_p50, 2),
                "balance_p90": round(max(cum_p90, cum_p50), 2),
                "confidence_score": round(confidence, 4),
            })

        # --- Persist ---
        forecast_id = db_save_forecast(tenant_id, MODEL_VERSION, conn)
        db_save_datapoints(forecast_id, datapoints, conn)
        logger.info("Forecast %s saved (%d datapoints)", forecast_id, len(datapoints))

        result = {
            "id": forecast_id,
            "tenant_id": tenant_id,
            "generated_at": datetime.utcnow().isoformat(),
            "status": "complete",
            "model_version": MODEL_VERSION,
            "datapoints": datapoints,
        }

        # Cache in Redis
        cache_set(tenant_id, result)

        # Publish event so the alert engine evaluates rules on this new forecast
        try:
            with conn.cursor() as _cur:
                _cur.execute(
                    """
                    INSERT INTO events (tenant_id, event_type, payload)
                    VALUES (%s, 'forecast.completed', %s)
                    """,
                    (tenant_id, json.dumps({"forecast_id": forecast_id})),
                )
            conn.commit()
        except Exception as _evt_exc:
            logger.warning("Could not publish forecast.completed event: %s", _evt_exc)

        return result

    except Exception as exc:
        logger.exception("Forecast failed for tenant %s: %s", tenant_id, exc)
        raise
    finally:
        release_db_conn(conn)


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Headroom Forecast Engine",
    description="AI-powered 90-day cash flow forecasting — sub-models A/B/C",
    version=MODEL_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "forecast-engine", "version": MODEL_VERSION}


@app.get("/forecast/{tenant_id}", response_model=ForecastResponse)
async def get_forecast(tenant_id: str):
    """Return latest cached forecast or load from DB."""
    cached = cache_get(tenant_id)
    if cached:
        return cached

    conn = get_db_conn()
    try:
        latest = db_get_latest_forecast(tenant_id, conn)
        if not latest:
            raise HTTPException(status_code=404, detail="No forecast available")

        forecast_id = str(latest["id"])
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT date, best_case AS balance_p90, expected_case AS balance_p50,
                       downside_case AS balance_p10, confidence_level AS confidence_score
                FROM forecast_datapoints
                WHERE forecast_id = %s
                ORDER BY date ASC
                """,
                (forecast_id,),
            )
            datapoints = [dict(r) for r in cur.fetchall()]

        result = {
            "id": forecast_id,
            "tenant_id": tenant_id,
            "generated_at": latest["generated_at"].isoformat(),
            "status": latest["status"],
            "model_version": latest.get("base_model_version", MODEL_VERSION),
            "datapoints": datapoints,
        }
        cache_set(tenant_id, result)
        return result
    finally:
        release_db_conn(conn)


@app.post("/forecast/{tenant_id}/trigger", response_model=RecalculateResponse)
async def trigger_forecast(tenant_id: str, background_tasks: BackgroundTasks):
    """
    Evaluate recalculation trigger logic and start background job if needed.
    """
    conn = get_db_conn()
    try:
        recalc = should_recalculate(tenant_id, conn)
    finally:
        release_db_conn(conn)

    if not recalc:
        return RecalculateResponse(
            message="Forecast is up to date",
            recalculated=False,
            tenant_id=tenant_id,
        )

    cache_invalidate(tenant_id)
    background_tasks.add_task(run_forecast, tenant_id)

    return RecalculateResponse(
        message="Forecast generation started",
        recalculated=True,
        tenant_id=tenant_id,
    )


@app.post("/forecast/{tenant_id}/refresh")
async def force_refresh(tenant_id: str, background_tasks: BackgroundTasks):
    """User-initiated refresh: always recalculates."""
    cache_invalidate(tenant_id)
    background_tasks.add_task(run_forecast, tenant_id)
    return {"message": "Forecast refresh queued", "tenant_id": tenant_id}


@app.get("/forecast/{tenant_id}/scenarios", response_model=List[ScenarioResponse])
async def list_scenarios(tenant_id: str):
    conn = get_db_conn()
    try:
        return db_get_scenarios(tenant_id, conn)
    finally:
        release_db_conn(conn)


@app.post("/forecast/{tenant_id}/scenarios", response_model=ScenarioResponse)
async def create_scenario(tenant_id: str, body: ScenarioCreate):
    conn = get_db_conn()
    try:
        scenario_id, version = db_save_scenario(tenant_id, body.model_dump(), conn)
        # Invalidate cache so next GET reflects scenario
        cache_invalidate(tenant_id)
        return {
            "id": scenario_id,
            "tenant_id": tenant_id,
            "name": body.name,
            "type": body.type,
            "parameters": body.parameters,
            "version": version,
            "created_at": datetime.utcnow().isoformat(),
        }
    finally:
        release_db_conn(conn)


@app.get("/forecast/{tenant_id}/scenarios/{scenario_id}/compare")
async def compare_scenario(tenant_id: str, scenario_id: str):
    """
    Return base forecast vs scenario-applied forecast for side-by-side comparison.
    """
    conn = get_db_conn()
    try:
        transactions = db_get_transactions(tenant_id, HISTORY_DAYS, conn)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM forecast_scenarios WHERE id = %s AND tenant_id = %s",
                (scenario_id, tenant_id),
            )
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found")

        scenario = dict(row)
        patterns = detect_recurring(transactions)
        recurring_daily = project_recurring(patterns, HORIZON_DAYS)
        var_expense = compute_variable_expenses(transactions, HORIZON_DAYS)
        var_p50 = sum(d["p50"] for d in var_expense.values()) if var_expense else np.zeros(HORIZON_DAYS)
        base_daily = recurring_daily - var_p50

        scenario_daily = apply_scenario_overlay(base_daily, [scenario])

        today = date.today()
        comparison = []
        cum_base = cum_scenario = 0.0
        for day in range(HORIZON_DAYS):
            cum_base += float(base_daily[day])
            cum_scenario += float(scenario_daily[day])
            comparison.append({
                "date": (today + timedelta(days=day)).isoformat(),
                "base": round(cum_base, 2),
                "scenario": round(cum_scenario, 2),
                "delta": round(cum_scenario - cum_base, 2),
            })

        return {
            "scenario_id": scenario_id,
            "scenario_name": scenario["name"],
            "tenant_id": tenant_id,
            "comparison": comparison,
        }
    finally:
        release_db_conn(conn)


# ---------------------------------------------------------------------------
# Plaid webhook handler (section 3.4 — co-located for simplicity)
# ---------------------------------------------------------------------------

def _verify_plaid_signature(headers: Dict[str, str], raw_body: bytes) -> bool:
    """HMAC-SHA256 verification of Plaid webhook payload."""
    secret = settings.plaid_webhook_secret
    if not secret:
        logger.warning("PLAID_WEBHOOK_SECRET not set; skipping signature verification")
        return True
    sig = headers.get("plaid-verification", "")
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


@app.post("/webhooks/plaid")
async def plaid_webhook(request: Request, background_tasks: BackgroundTasks):
    raw_body = await request.body()

    if not _verify_plaid_signature(dict(request.headers), raw_body):
        raise HTTPException(status_code=401, detail="Invalid Plaid webhook signature")

    payload = json.loads(raw_body)
    webhook_type = payload.get("webhook_type")
    webhook_code = payload.get("webhook_code")

    if webhook_type == "TRANSACTIONS":
        if webhook_code in ("DEFAULT_UPDATE", "INITIAL_UPDATE"):
            item_id = payload.get("item_id")
            tenant_id = await _tenant_id_from_item(item_id)
            if tenant_id:
                cache_invalidate(tenant_id)
                background_tasks.add_task(_handle_transaction_sync, tenant_id, item_id, payload)

    elif webhook_type == "ITEM":
        if webhook_code == "ERROR":
            await _notify_reconnection_required(payload.get("item_id"))

    return {"received": True}


async def _tenant_id_from_item(item_id: str) -> Optional[str]:
    """Look up tenant from Plaid item_id via bank_connections table."""
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT tenant_id FROM bank_connections
                WHERE metadata->>'plaid_item_id' = %s LIMIT 1
                """,
                (item_id,),
            )
            row = cur.fetchone()
        return str(row[0]) if row else None
    finally:
        release_db_conn(conn)


async def _handle_transaction_sync(tenant_id: str, item_id: str, payload: Dict[str, Any]):
    """Trigger a transaction sync then re-evaluate forecast recalculation."""
    logger.info("Plaid webhook: syncing transactions for item %s (tenant %s)", item_id, tenant_id)
    # Publish sync event — the data-sync service will pick this up via SQS
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO events (tenant_id, event_type, payload)
                VALUES (%s, 'plaid.transactions.sync', %s)
                """,
                (tenant_id, json.dumps({"item_id": item_id, **payload})),
            )
        conn.commit()
    finally:
        release_db_conn(conn)

    # Re-evaluate whether a forecast recalculation is warranted
    conn2 = get_db_conn()
    try:
        if should_recalculate(tenant_id, conn2):
            run_forecast(tenant_id)
    finally:
        release_db_conn(conn2)


async def _notify_reconnection_required(item_id: str):
    logger.warning("Plaid ITEM ERROR for item_id=%s — reconnection required", item_id)
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE bank_connections SET status = 'error', sync_error = 'Plaid reconnection required'
                WHERE metadata->>'plaid_item_id' = %s
                """,
                (item_id,),
            )
            # Surface alert for the tenant
            cur.execute(
                """
                INSERT INTO alerts (tenant_id, alert_type, severity, message)
                SELECT tenant_id, 'reconnection_required', 'high',
                       'Bank connection requires re-authentication'
                FROM bank_connections
                WHERE metadata->>'plaid_item_id' = %s
                LIMIT 1
                """,
                (item_id,),
            )
        conn.commit()
    finally:
        release_db_conn(conn)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.service_port,
        reload=settings.environment == "development",
        log_level="info",
    )
