"""
Alert rule definitions.

Each rule is a dataclass with:
  id          unique rule identifier (also stored in alerts.alert_type)
  severity    critical | warning | info
  condition   callable(datapoints, org_context) → bool
  message     callable(datapoints, org_context) → str
  channels    list of delivery channels for this rule
  cooldown_h  hours before the same rule can fire again for the same org
              prevents alert spam on every 6-hour recalculation

Rules are evaluated in order; the engine short-circuits per-rule after first fire.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


@dataclass
class AlertRule:
    id: str
    severity: str                         # critical | warning | info
    condition: Callable[..., bool]
    message: Callable[..., str]
    channels: List[str]
    cooldown_h: int = 6                   # suppress re-fire within this window


# ---------------------------------------------------------------------------
# Helper functions used by rule lambdas
# ---------------------------------------------------------------------------

def _first_negative_day(datapoints: List[Dict[str, Any]]) -> int:
    """Return how many days out the first negative P50 balance occurs."""
    for dp in sorted(datapoints, key=lambda d: d["days_out"]):
        if dp["balance_p50"] < 0:
            return dp["days_out"]
    return -1


def _days_below_threshold(datapoints: List[Dict[str, Any]], threshold: float) -> int:
    """Return how many days out cash first drops below threshold."""
    for dp in sorted(datapoints, key=lambda d: d["days_out"]):
        if dp["balance_p50"] < threshold:
            return dp["days_out"]
    return -1


def _format_inr(amount: float) -> str:
    """Format a number in Indian rupee style with comma separators."""
    try:
        s = f"{int(abs(amount)):,}"
        return s
    except Exception:
        return str(int(abs(amount)))


# ---------------------------------------------------------------------------
# Rule set  (mirrors spec ALERT_RULES)
# ---------------------------------------------------------------------------

ALERT_RULES: List[AlertRule] = [

    # ── RULE 1: Cash goes negative within 30 days ────────────────────────
    AlertRule(
        id="cash_negative_30d",
        severity="critical",
        condition=lambda dp, org: any(
            d["balance_p50"] < 0 for d in dp if d["days_out"] <= 30
        ),
        message=lambda dp, org: (
            f"Your cash goes negative in {_first_negative_day(dp)} days (expected case)"
        ),
        channels=["in_app", "email", "whatsapp"],
        cooldown_h=12,
    ),

    # ── RULE 2: Cash drops below org safety threshold within 45 days ─────
    AlertRule(
        id="below_safety_threshold",
        severity="warning",
        condition=lambda dp, org: (
            org.get("safety_threshold") is not None
            and any(
                d["balance_p50"] < org["safety_threshold"]
                for d in dp
                if d["days_out"] <= 45
            )
        ),
        message=lambda dp, org: (
            f"You drop below your ₹{_format_inr(org['safety_threshold'])} "
            f"safety buffer in "
            f"{_days_below_threshold(dp, org['safety_threshold'])} days"
        ),
        channels=["in_app", "email"],
        cooldown_h=24,
    ),

    # ── RULE 3: Unusually large spend (2.5× category average) ────────────
    AlertRule(
        id="large_unusual_spend",
        severity="info",
        condition=lambda dp, org: bool(
            org.get("_unusual_txns")  # pre-computed list passed in org context
        ),
        message=lambda dp, org: (
            f"Unusual {org['_unusual_txns'][0]['category']} charge: "
            f"₹{_format_inr(org['_unusual_txns'][0]['amount'])} "
            f"at {org['_unusual_txns'][0]['merchant_name']}"
        ),
        channels=["in_app"],
        cooldown_h=1,
    ),

    # ── RULE 4: Burn rate spike (MoM operating expenses up > 30%) ────────
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

    # ── RULE 5: Runway under 60 days ─────────────────────────────────────
    AlertRule(
        id="runway_under_60d",
        severity="warning",
        condition=lambda dp, org: (
            all(d["balance_p50"] >= 0 for d in dp if d["days_out"] <= 30)  # not already flagged by rule 1
            and any(d["balance_p50"] < 0 for d in dp if d["days_out"] <= 60)
        ),
        message=lambda dp, org: (
            f"Your runway drops to zero in approximately "
            f"{_first_negative_day([d for d in dp if d['days_out'] <= 60])} days "
            f"(expected case)"
        ),
        channels=["in_app", "email"],
        cooldown_h=24,
    ),
]
