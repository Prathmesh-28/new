from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List

from .rules import ALERT_RULES, AlertRule

logger = logging.getLogger(__name__)


class AlertEngine:
    """
    Django-native port of the alert engine.
    Operates via Django ORM instead of raw psycopg2.
    """

    def evaluate(self, tenant_id: str) -> List[Dict[str, Any]]:
        from apps.forecast.models import Forecast, ForecastDatapoint
        from apps.core.models import Transaction, Tenant
        from .models import Alert

        try:
            tenant = Tenant.objects.select_related().get(pk=tenant_id)
        except Tenant.DoesNotExist:
            logger.warning("AlertEngine: tenant %s not found", tenant_id)
            return []

        try:
            forecast = Forecast.objects.filter(tenant=tenant, status="complete").latest("generated_at")
        except Forecast.DoesNotExist:
            logger.warning("AlertEngine: no complete forecast for tenant %s", tenant_id)
            return []

        today = date.today()
        raw_datapoints = list(
            ForecastDatapoint.objects.filter(forecast=forecast)
            .order_by("date")
            .values("date", "best_case", "expected_case", "downside_case", "confidence_level")
        )

        datapoints = [
            {
                "date": dp["date"],
                "balance_p90": float(dp["best_case"] or 0),
                "balance_p50": float(dp["expected_case"] or 0),
                "balance_p10": float(dp["downside_case"] or 0),
                "confidence_level": float(dp["confidence_level"] or 0),
                "days_out": (dp["date"] - today).days,
            }
            for dp in raw_datapoints
        ]

        transactions = list(
            Transaction.objects.filter(
                tenant=tenant,
                date__gte=today - timedelta(days=90),
                amount__lt=0,
            ).values("date", "amount", "category", "counterparty")[:500]
        )

        features = tenant.features or {}
        org_context: Dict[str, Any] = {
            "safety_threshold": features.get("safety_threshold"),
        }
        org_context["_unusual_txns"] = self._detect_unusual_spend(transactions)
        org_context.update(self._compute_burn_spike(transactions))

        fired: List[Dict[str, Any]] = []

        for rule in ALERT_RULES:
            try:
                if not rule.condition(datapoints, org_context):
                    continue
            except Exception as exc:
                logger.error("Rule %s condition error: %s", rule.id, exc)
                continue

            if self._in_cooldown(tenant_id, rule):
                logger.debug("Rule %s in cooldown for tenant %s", rule.id, tenant_id)
                continue

            try:
                message = rule.message(datapoints, org_context)
            except Exception as exc:
                logger.error("Rule %s message error: %s", rule.id, exc)
                message = f"Alert: {rule.id}"

            alert = Alert.objects.create(
                tenant=tenant,
                alert_type=rule.id,
                severity=rule.severity,
                message=message,
            )

            from apps.core.models import Event
            Event.objects.create(
                tenant=tenant,
                event_type="alert.fired",
                payload={
                    "alert_id": str(alert.id),
                    "alert_type": rule.id,
                    "severity": rule.severity,
                    "message": message,
                    "channels": rule.channels,
                },
            )

            fired.append({
                "id": str(alert.id),
                "tenant_id": tenant_id,
                "alert_type": rule.id,
                "severity": rule.severity,
                "message": message,
                "channels": rule.channels,
            })
            logger.info("Alert fired: rule=%s severity=%s tenant=%s", rule.id, rule.severity, tenant_id)

        return fired

    def _in_cooldown(self, tenant_id: str, rule: AlertRule) -> bool:
        from .models import Alert
        from django.utils import timezone
        cutoff = timezone.now() - timedelta(hours=rule.cooldown_h)
        return Alert.objects.filter(
            tenant_id=tenant_id, alert_type=rule.id, created_at__gt=cutoff
        ).exists()

    def _detect_unusual_spend(self, transactions: list) -> list:
        cat_amounts: dict = defaultdict(list)
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
                    "merchant_name": txn.get("counterparty", ""),
                    "date": str(txn["date"]),
                    "category_avg": avg,
                })
        return sorted(unusual, key=lambda t: t["amount"], reverse=True)

    def _compute_burn_spike(self, transactions: list) -> Dict[str, Any]:
        today = date.today()
        this_month_start = today.replace(day=1)
        last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)
        this_month = last_month = 0.0
        for txn in transactions:
            txn_date = txn["date"] if isinstance(txn["date"], date) else datetime.strptime(str(txn["date"]), "%Y-%m-%d").date()
            amount = abs(float(txn["amount"]))
            if txn_date >= this_month_start:
                this_month += amount
            elif txn_date >= last_month_start:
                last_month += amount
        pct = ((this_month - last_month) / last_month * 100) if last_month > 0 else 0.0
        return {
            "burn_spike_pct": max(0.0, pct),
            "burn_spike_amount": max(0.0, this_month - last_month),
        }
