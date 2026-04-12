"""
Signal collection for the underwriting engine.

Pulls all financial signals needed to score a credit application from
the database. Returns a typed Signals dataclass that every scorer receives.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta
from statistics import mean, stdev
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)


@dataclass
class Signals:
    # --- Revenue ---
    monthly_revenues: List[float]          # last 12 months of monthly inflows
    revenue_trend_3m: float                # avg MoM revenue growth rate, last 3M
    avg_monthly_revenue: float

    # --- Consistency ---
    revenue_cv: float                      # coefficient of variation (σ/μ) of monthly revenue

    # --- Business age ---
    first_transaction_date: Optional[date]
    account_age_days: int

    # --- Concentration ---
    top_customer_revenue_pct: float        # % of revenue from single largest counterparty
    top_3_customer_revenue_pct: float

    # --- Payment behavior ---
    avg_days_to_pay: float                 # avg days from invoice issue to receipt
    late_payment_rate: float               # fraction of invoices paid late (>30d)

    # --- Overdraft frequency ---
    overdraft_days_last_90: int            # days with negative closing balance in last 90d
    overdraft_rate: float                  # overdraft_days / 90

    # --- Debt service coverage ---
    total_monthly_debt_obligations: float  # sum of existing loan repayments per month
    dscr: float                            # avg_monthly_revenue / total_monthly_debt_obligations

    # --- Behavioral ---
    logins_last_30d: int
    forecasts_viewed_last_30d: int

    # --- Forecast quality ---
    avg_forecast_confidence: float         # mean confidence_level of latest forecast

    # --- Meta ---
    industry: str
    tenant_id: str

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["first_transaction_date"] = (
            self.first_transaction_date.isoformat()
            if self.first_transaction_date else None
        )
        return d


def collect_signals(tenant_id: str, conn: psycopg2.extensions.connection) -> Signals:
    """Query DB and return a fully-populated Signals object."""

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

        # ── Monthly revenues (last 12 months) ────────────────────────────
        cur.execute(
            """
            SELECT
                DATE_TRUNC('month', date) AS month,
                SUM(amount) AS total
            FROM transactions
            WHERE tenant_id = %s
              AND amount > 0
              AND date >= CURRENT_DATE - INTERVAL '12 months'
            GROUP BY 1
            ORDER BY 1 ASC
            """,
            (tenant_id,),
        )
        rev_rows = cur.fetchall()
        monthly_revenues = [float(r["total"]) for r in rev_rows]
        avg_monthly_revenue = mean(monthly_revenues) if monthly_revenues else 0.0

        # Revenue CoV (consistency)
        if len(monthly_revenues) >= 2:
            revenue_cv = stdev(monthly_revenues) / avg_monthly_revenue if avg_monthly_revenue else 1.0
        else:
            revenue_cv = 1.0

        # 3-month revenue trend (MoM growth)
        recent_3 = monthly_revenues[-3:] if len(monthly_revenues) >= 3 else monthly_revenues
        if len(recent_3) >= 2:
            growth_rates = [
                (recent_3[i] - recent_3[i - 1]) / recent_3[i - 1]
                for i in range(1, len(recent_3))
                if recent_3[i - 1] > 0
            ]
            revenue_trend_3m = mean(growth_rates) if growth_rates else 0.0
        else:
            revenue_trend_3m = 0.0

        # ── Business age ─────────────────────────────────────────────────
        cur.execute(
            "SELECT MIN(date) FROM transactions WHERE tenant_id = %s",
            (tenant_id,),
        )
        row = cur.fetchone()
        first_txn_date = list(row.values())[0] if row else None
        account_age_days = (
            (date.today() - first_txn_date).days
            if first_txn_date else 0
        )

        # ── Revenue concentration ─────────────────────────────────────────
        cur.execute(
            """
            SELECT counterparty,
                   SUM(amount) AS total
            FROM transactions
            WHERE tenant_id = %s
              AND amount > 0
              AND date >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY counterparty
            ORDER BY total DESC
            LIMIT 10
            """,
            (tenant_id,),
        )
        cust_rows = cur.fetchall()
        total_rev_6m = sum(float(r["total"]) for r in cust_rows)
        if cust_rows and total_rev_6m > 0:
            top1_pct = float(cust_rows[0]["total"]) / total_rev_6m
            top3_pct = sum(float(r["total"]) for r in cust_rows[:3]) / total_rev_6m
        else:
            top1_pct = 0.0
            top3_pct = 0.0

        # ── Payment behavior (invoice → payment lag) ──────────────────────
        # Approximate using QuickBooks/Xero invoice due dates stored in future_obligations
        cur.execute(
            """
            SELECT
                AVG(EXTRACT(EPOCH FROM (t.date - fo.due_date)) / 86400) AS avg_days,
                COUNT(*) FILTER (
                    WHERE EXTRACT(EPOCH FROM (t.date - fo.due_date)) / 86400 > 30
                )::float / NULLIF(COUNT(*), 0) AS late_rate
            FROM future_obligations fo
            JOIN transactions t ON t.source_ref = fo.source_ref
                                AND t.tenant_id = fo.tenant_id
            WHERE fo.tenant_id = %s
              AND fo.obligation_type = 'invoice_due'
              AND fo.due_date >= CURRENT_DATE - INTERVAL '6 months'
            """,
            (tenant_id,),
        )
        pay_row = cur.fetchone()
        avg_days_to_pay = float(pay_row["avg_days"] or 15.0) if pay_row else 15.0
        late_payment_rate = float(pay_row["late_rate"] or 0.1) if pay_row else 0.1

        # ── Overdraft frequency (last 90 days) ───────────────────────────
        # We approximate using days where cumulative daily flow went negative
        cur.execute(
            """
            SELECT COUNT(*) AS neg_days
            FROM (
                SELECT date,
                       SUM(amount) OVER (
                           PARTITION BY tenant_id
                           ORDER BY date
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                       ) AS running_balance
                FROM transactions
                WHERE tenant_id = %s
                  AND date >= CURRENT_DATE - INTERVAL '90 days'
            ) sub
            WHERE running_balance < 0
            """,
            (tenant_id,),
        )
        od_row = cur.fetchone()
        overdraft_days = int(od_row["neg_days"] or 0) if od_row else 0
        overdraft_rate = overdraft_days / 90.0

        # ── Debt service ─────────────────────────────────────────────────
        cur.execute(
            """
            SELECT COALESCE(SUM(ABS(amount)), 0) AS monthly_debt
            FROM transactions
            WHERE tenant_id = %s
              AND category = 'loan_payment'
              AND date >= CURRENT_DATE - INTERVAL '3 months'
            """,
            (tenant_id,),
        )
        debt_row = cur.fetchone()
        monthly_debt = float(debt_row["monthly_debt"] or 0) / 3.0 if debt_row else 0.0
        dscr = avg_monthly_revenue / monthly_debt if monthly_debt > 0 else 10.0  # cap at 10 when no debt

        # ── Behavioral signals (audit log) ───────────────────────────────
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE action = 'login')           AS logins,
                COUNT(*) FILTER (WHERE resource_type = 'forecast') AS forecasts_viewed
            FROM audit_log
            WHERE tenant_id = %s
              AND timestamp >= NOW() - INTERVAL '30 days'
            """,
            (tenant_id,),
        )
        beh_row = cur.fetchone()
        logins = int(beh_row["logins"] or 0) if beh_row else 0
        forecasts_viewed = int(beh_row["forecasts_viewed"] or 0) if beh_row else 0

        # ── Forecast quality ─────────────────────────────────────────────
        cur.execute(
            """
            SELECT AVG(fd.confidence_level) AS avg_confidence
            FROM forecast_datapoints fd
            JOIN forecasts f ON fd.forecast_id = f.id
            WHERE f.tenant_id = %s
              AND f.status = 'complete'
              AND f.generated_at >= NOW() - INTERVAL '7 days'
            """,
            (tenant_id,),
        )
        fc_row = cur.fetchone()
        avg_forecast_confidence = float(fc_row["avg_confidence"] or 0.5) if fc_row else 0.5

        # ── Industry ─────────────────────────────────────────────────────
        cur.execute(
            "SELECT features->>'industry' AS industry FROM tenants WHERE id = %s",
            (tenant_id,),
        )
        t_row = cur.fetchone()
        industry = (t_row["industry"] or "other") if t_row else "other"

    return Signals(
        monthly_revenues=monthly_revenues,
        revenue_trend_3m=revenue_trend_3m,
        avg_monthly_revenue=avg_monthly_revenue,
        revenue_cv=revenue_cv,
        first_transaction_date=first_txn_date,
        account_age_days=account_age_days,
        top_customer_revenue_pct=top1_pct,
        top_3_customer_revenue_pct=top3_pct,
        avg_days_to_pay=avg_days_to_pay,
        late_payment_rate=late_payment_rate,
        overdraft_days_last_90=overdraft_days,
        overdraft_rate=overdraft_rate,
        total_monthly_debt_obligations=monthly_debt,
        dscr=dscr,
        logins_last_30d=logins,
        forecasts_viewed_last_30d=forecasts_viewed,
        avg_forecast_confidence=avg_forecast_confidence,
        industry=industry,
        tenant_id=tenant_id,
    )
