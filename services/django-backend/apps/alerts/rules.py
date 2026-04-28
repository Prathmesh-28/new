from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List


@dataclass
class AlertRule:
    id: str
    severity: str
    condition: Callable[..., bool]
    message: Callable[..., str]
    channels: List[str]
    cooldown_h: int = 6


def _first_negative_day(datapoints: List[Dict[str, Any]]) -> int:
    for dp in sorted(datapoints, key=lambda d: d["days_out"]):
        if dp["balance_p50"] < 0:
            return dp["days_out"]
    return -1


def _days_below_threshold(datapoints: List[Dict[str, Any]], threshold: float) -> int:
    for dp in sorted(datapoints, key=lambda d: d["days_out"]):
        if dp["balance_p50"] < threshold:
            return dp["days_out"]
    return -1


def _format_inr(amount: float) -> str:
    try:
        return f"{int(abs(amount)):,}"
    except Exception:
        return str(int(abs(amount)))


ALERT_RULES: List[AlertRule] = [
    AlertRule(
        id="cash_negative_30d",
        severity="critical",
        condition=lambda dp, org: any(d["balance_p50"] < 0 for d in dp if d["days_out"] <= 30),
        message=lambda dp, org: (
            f"Your cash goes negative in {_first_negative_day(dp)} days (expected case)"
        ),
        channels=["in_app", "email", "whatsapp"],
        cooldown_h=12,
    ),
    AlertRule(
        id="below_safety_threshold",
        severity="warning",
        condition=lambda dp, org: (
            org.get("safety_threshold") is not None
            and any(d["balance_p50"] < org["safety_threshold"] for d in dp if d["days_out"] <= 45)
        ),
        message=lambda dp, org: (
            f"You drop below your ₹{_format_inr(org['safety_threshold'])} "
            f"safety buffer in {_days_below_threshold(dp, org['safety_threshold'])} days"
        ),
        channels=["in_app", "email"],
        cooldown_h=24,
    ),
    AlertRule(
        id="large_unusual_spend",
        severity="info",
        condition=lambda dp, org: bool(org.get("_unusual_txns")),
        message=lambda dp, org: (
            f"Unusual {org['_unusual_txns'][0]['category']} charge: "
            f"₹{_format_inr(org['_unusual_txns'][0]['amount'])} "
            f"at {org['_unusual_txns'][0]['merchant_name']}"
        ),
        channels=["in_app"],
        cooldown_h=1,
    ),
    AlertRule(
        id="burn_rate_spike",
        severity="warning",
        condition=lambda dp, org: org.get("burn_spike_pct", 0) >= 30,
        message=lambda dp, org: (
            f"Operating expenses are up {org['burn_spike_pct']:.0f}% vs last month — "
            f"₹{_format_inr(org.get('burn_spike_amount', 0))} more than usual"
        ),
        channels=["in_app", "email"],
        cooldown_h=48,
    ),
    AlertRule(
        id="runway_under_60d",
        severity="warning",
        condition=lambda dp, org: (
            all(d["balance_p50"] >= 0 for d in dp if d["days_out"] <= 30)
            and any(d["balance_p50"] < 0 for d in dp if d["days_out"] <= 60)
        ),
        message=lambda dp, org: (
            f"Your runway drops to zero in approximately "
            f"{_first_negative_day([d for d in dp if d['days_out'] <= 60])} days (expected case)"
        ),
        channels=["in_app", "email"],
        cooldown_h=24,
    ),
]
