"""
AlertEngine — evaluates ALERT_RULES against the latest forecast datapoints.

Called after every forecast recalculation (triggered by the forecast-engine
via an event on the events table, or invoked directly via POST /alerts/evaluate).

Deduplication: a rule will not re-fire for the same org within its cooldown
window — checked against the alerts table (most recent un-resolved alert of
the same type).

Category average computation (for large_unusual_spend rule) runs over the
org's last 90 days of transactions and is cached in the org_context dict.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras

from .rules import ALERT_RULES, AlertRule
from .notifications import dispatch

logger = logging.getLogger(__name__)


class AlertEngine:
    def __init__(self, db_conn: psycopg2.extensions.connection):
        self._conn = db_conn

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def evaluate(self, tenant_id: str) -> List[Dict[str, Any]]:
        """
        Evaluate all rules for a tenant against the latest forecast.
        Returns the list of alerts that fired.
        """
        logger.info("AlertEngine.evaluate: tenant=%s", tenant_id)

        datapoints = self._load_forecast_datapoints(tenant_id)
        if not datapoints:
            logger.warning("No forecast datapoints for tenant %s — skipping", tenant_id)
            return []

        org_context = self._build_org_context(tenant_id, datapoints)
        tenant_contacts = self._load_tenant_contacts(tenant_id)

        fired: List[Dict[str, Any]] = []

        for rule in ALERT_RULES:
            try:
                if not rule.condition(datapoints, org_context):
                    continue
            except Exception as exc:
                logger.error("Rule %s condition raised: %s", rule.id, exc)
                continue

            # Cooldown check
            if self._in_cooldown(tenant_id, rule):
                logger.debug("Rule %s in cooldown for tenant %s", rule.id, tenant_id)
                continue

            # Render message
            try:
                message = rule.message(datapoints, org_context)
            except Exception as exc:
                logger.error("Rule %s message render raised: %s", rule.id, exc)
                message = f"Alert: {rule.id}"

            alert = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "alert_type": rule.id,
                "severity": rule.severity,
                "message": message,
                "channels": rule.channels,
                "fired_at": datetime.utcnow().isoformat(),
            }

            # Persist to alerts table
            self._save_alert(alert)

            # Publish to event bus (notification service picks this up)
            self._publish_event(tenant_id, alert)

            # Dispatch external channels (email, whatsapp)
            channel_results = dispatch(alert, tenant_contacts)
            alert["channel_results"] = channel_results

            fired.append(alert)
            logger.info(
                "Alert fired: rule=%s severity=%s tenant=%s channels=%s",
                rule.id, rule.severity, tenant_id, channel_results,
            )

        return fired

    # ------------------------------------------------------------------
    # Data loaders
    # ------------------------------------------------------------------

    def _load_forecast_datapoints(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Load the latest forecast's datapoints, enriched with days_out."""
        with self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT fd.date, fd.best_case AS balance_p90,
                       fd.expected_case AS balance_p50,
                       fd.downside_case AS balance_p10,
                       fd.confidence_level,
                       (fd.date - CURRENT_DATE) AS days_out
                FROM forecast_datapoints fd
                JOIN forecasts f ON fd.forecast_id = f.id
                WHERE f.tenant_id = %s
                  AND f.status = 'complete'
                ORDER BY f.generated_at DESC, fd.date ASC
                LIMIT 90
                """,
                (tenant_id,),
            )
            rows = cur.fetchall()

        return [dict(r) for r in rows]

    def _build_org_context(
        self, tenant_id: str, datapoints: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Collect org-level context needed by the rules:
          safety_threshold   from tenants.features JSONB
          _unusual_txns      transactions > 2.5× their category average (last 90d)
          burn_spike_pct     MoM operating expense change
          burn_spike_amount  absolute spend increase
        """
        ctx: Dict[str, Any] = {}

        with self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Safety threshold from tenant features
            cur.execute(
                "SELECT features FROM tenants WHERE id = %s",
                (tenant_id,),
            )
            row = cur.fetchone()
            if row:
                features = row["features"] or {}
                ctx["safety_threshold"] = features.get("safety_threshold")

            # Last 90 days of expense transactions for unusual spend detection
            cur.execute(
                """
                SELECT date, amount, category, counterparty AS merchant_name
                FROM transactions
                WHERE tenant_id = %s
                  AND date >= CURRENT_DATE - INTERVAL '90 days'
                  AND amount < 0
                ORDER BY date DESC
                LIMIT 500
                """,
                (tenant_id,),
            )
            transactions = [dict(r) for r in cur.fetchall()]

        ctx["_unusual_txns"] = self._detect_unusual_spend(transactions)
        ctx.update(self._compute_burn_spike(transactions))

        return ctx

    def _detect_unusual_spend(
        self, transactions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Flag transactions > 2.5× their category average (last 90 days)."""
        cat_amounts: Dict[str, List[float]] = defaultdict(list)
        for txn in transactions:
            cat_amounts[txn["category"]].append(abs(float(txn["amount"])))

        cat_avg = {cat: sum(v) / len(v) for cat, v in cat_amounts.items()}

        unusual = []
        for txn in transactions:
            cat = txn["category"]
            avg = cat_avg.get(cat, 0)
            if avg > 0 and abs(float(txn["amount"])) > avg * 2.5:
                unusual.append({
                    "category": cat,
                    "amount": abs(float(txn["amount"])),
                    "merchant_name": txn.get("merchant_name", ""),
                    "date": str(txn["date"]),
                    "category_avg": avg,
                })

        return sorted(unusual, key=lambda t: t["amount"], reverse=True)

    def _compute_burn_spike(
        self, transactions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Compare this month vs last month operating expenses."""
        now = datetime.utcnow().date()
        this_month_start = now.replace(day=1)
        last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)

        this_month_spend = 0.0
        last_month_spend = 0.0

        for txn in transactions:
            txn_date = txn["date"] if hasattr(txn["date"], "year") else \
                       datetime.strptime(str(txn["date"]), "%Y-%m-%d").date()
            amount = abs(float(txn["amount"]))

            if txn_date >= this_month_start:
                this_month_spend += amount
            elif txn_date >= last_month_start:
                last_month_spend += amount

        if last_month_spend > 0:
            pct_change = ((this_month_spend - last_month_spend) / last_month_spend) * 100
        else:
            pct_change = 0.0

        return {
            "burn_spike_pct": max(0, pct_change),
            "burn_spike_amount": max(0, this_month_spend - last_month_spend),
        }

    def _load_tenant_contacts(self, tenant_id: str) -> Dict[str, Any]:
        """Load the primary owner's email and phone for notifications."""
        with self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT u.email,
                       t.features->>'notification_phone' AS phone
                FROM users u
                JOIN tenants t ON u.tenant_id = t.id
                WHERE u.tenant_id = %s
                  AND u.role = 'owner'
                  AND u.status = 'active'
                ORDER BY u.created_at ASC
                LIMIT 1
                """,
                (tenant_id,),
            )
            row = cur.fetchone()
        return dict(row) if row else {}

    # ------------------------------------------------------------------
    # Cooldown
    # ------------------------------------------------------------------

    def _in_cooldown(self, tenant_id: str, rule: AlertRule) -> bool:
        """Return True if this rule fired for this tenant within its cooldown window."""
        with self._conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM alerts
                WHERE tenant_id = %s
                  AND alert_type = %s
                  AND created_at > NOW() - INTERVAL '1 hour' * %s
                LIMIT 1
                """,
                (tenant_id, rule.id, rule.cooldown_h),
            )
            return cur.fetchone() is not None

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _save_alert(self, alert: Dict[str, Any]) -> None:
        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO alerts
                    (id, tenant_id, alert_type, severity, message, is_read, created_at)
                VALUES (%s, %s, %s, %s, %s, FALSE, NOW())
                """,
                (
                    alert["id"],
                    alert["tenant_id"],
                    alert["alert_type"],
                    alert["severity"],
                    alert["message"],
                ),
            )
        self._conn.commit()

    def _publish_event(self, tenant_id: str, alert: Dict[str, Any]) -> None:
        """Write event for the notification service to consume."""
        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO events (tenant_id, event_type, payload)
                VALUES (%s, 'alert.fired', %s)
                """,
                (
                    tenant_id,
                    json.dumps({
                        "alert_id": alert["id"],
                        "alert_type": alert["alert_type"],
                        "severity": alert["severity"],
                        "message": alert["message"],
                        "channels": alert["channels"],
                    }),
                ),
            )
        self._conn.commit()
