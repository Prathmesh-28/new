"""
Django ORM port of underwriting signal collection.
Replaces the psycopg2-based collect_signals() from services/underwriting/signals.py.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from statistics import mean, stdev
from typing import Any

from django.db import connection
from django.db.models import Sum, Avg, Count, Q

from .engine import Signals

logger = logging.getLogger(__name__)


def collect_signals(tenant_id: str) -> Signals:
    from apps.core.models import Transaction, Tenant, AuditLog
    from apps.forecast.models import Forecast, ForecastDatapoint, FutureObligation

    today = date.today()
    twelve_months_ago = today - timedelta(days=365)
    six_months_ago = today - timedelta(days=180)
    three_months_ago = today - timedelta(days=90)

    # ── Monthly revenues (last 12 months) ──────────────────────────────────
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT DATE_TRUNC('month', date) AS month, SUM(amount) AS total
            FROM transactions
            WHERE tenant_id = %s AND amount > 0 AND date >= %s
            GROUP BY 1 ORDER BY 1 ASC
            """,
            [tenant_id, twelve_months_ago],
        )
        rev_rows = cur.fetchall()

    monthly_revenues = [float(r[1]) for r in rev_rows]
    avg_monthly_revenue = mean(monthly_revenues) if monthly_revenues else 0.0
    revenue_cv = (stdev(monthly_revenues) / avg_monthly_revenue if avg_monthly_revenue and len(monthly_revenues) >= 2 else 1.0)

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

    # ── Business age ───────────────────────────────────────────────────────
    first_txn = Transaction.objects.filter(tenant_id=tenant_id).order_by("date").values_list("date", flat=True).first()
    account_age_days = (today - first_txn).days if first_txn else 0

    # ── Revenue concentration ──────────────────────────────────────────────
    cust_rows = list(
        Transaction.objects.filter(
            tenant_id=tenant_id, amount__gt=0, date__gte=six_months_ago
        )
        .values("counterparty")
        .annotate(total=Sum("amount"))
        .order_by("-total")[:10]
    )
    total_rev_6m = sum(float(r["total"]) for r in cust_rows)
    if cust_rows and total_rev_6m > 0:
        top1_pct = float(cust_rows[0]["total"]) / total_rev_6m
        top3_pct = sum(float(r["total"]) for r in cust_rows[:3]) / total_rev_6m
    else:
        top1_pct = top3_pct = 0.0

    # ── Payment behavior ────────────────────────────────────────────────────
    avg_days_to_pay, late_payment_rate = 15.0, 0.1
    try:
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT
                    AVG(EXTRACT(EPOCH FROM (t.date - fo.due_date)) / 86400),
                    COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (t.date - fo.due_date)) / 86400 > 30)::float
                        / NULLIF(COUNT(*), 0)
                FROM future_obligations fo
                JOIN transactions t ON t.source_id = fo.source_ref AND t.tenant_id = fo.tenant_id
                WHERE fo.tenant_id = %s AND fo.obligation_type = 'invoice_due'
                  AND fo.due_date >= %s
                """,
                [tenant_id, six_months_ago],
            )
            row = cur.fetchone()
            if row and row[0] is not None:
                avg_days_to_pay = float(row[0])
                late_payment_rate = float(row[1] or 0.0)
    except Exception as exc:
        logger.warning("Payment behavior query failed: %s", exc)

    # ── Overdraft frequency ────────────────────────────────────────────────
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) FROM (
                SELECT date, SUM(amount) OVER (
                    PARTITION BY tenant_id ORDER BY date
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS running_balance
                FROM transactions
                WHERE tenant_id = %s AND date >= %s
            ) sub WHERE running_balance < 0
            """,
            [tenant_id, three_months_ago],
        )
        row = cur.fetchone()
    overdraft_days = int(row[0]) if row else 0
    overdraft_rate = overdraft_days / 90.0

    # ── Debt service ───────────────────────────────────────────────────────
    debt_result = Transaction.objects.filter(
        tenant_id=tenant_id, category="loan_payment", date__gte=three_months_ago
    ).aggregate(total=Sum("amount"))
    monthly_debt = abs(float(debt_result["total"] or 0)) / 3.0
    dscr = avg_monthly_revenue / monthly_debt if monthly_debt > 0 else 10.0

    # ── Behavioral ─────────────────────────────────────────────────────────
    thirty_days_ago = today - timedelta(days=30)
    beh = AuditLog.objects.filter(
        tenant_id=tenant_id, timestamp__date__gte=thirty_days_ago
    ).aggregate(
        logins=Count("id", filter=Q(action="login")),
        forecasts_viewed=Count("id", filter=Q(resource_type="forecast")),
    )
    logins = beh["logins"] or 0
    forecasts_viewed = beh["forecasts_viewed"] or 0

    # ── Forecast quality ──────────────────────────────────────────────────
    seven_days_ago = today - timedelta(days=7)
    fc_result = ForecastDatapoint.objects.filter(
        forecast__tenant_id=tenant_id,
        forecast__status="complete",
        forecast__generated_at__date__gte=seven_days_ago,
    ).aggregate(avg=Avg("confidence_level"))
    avg_forecast_confidence = float(fc_result["avg"] or 0.5)

    # ── Industry ──────────────────────────────────────────────────────────
    try:
        from apps.core.models import Tenant
        tenant = Tenant.objects.get(pk=tenant_id)
        industry = (tenant.features or {}).get("industry", "other")
    except Exception:
        industry = "other"

    return Signals(
        monthly_revenues=monthly_revenues,
        revenue_trend_3m=revenue_trend_3m,
        avg_monthly_revenue=avg_monthly_revenue,
        revenue_cv=revenue_cv,
        first_transaction_date=first_txn,
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
