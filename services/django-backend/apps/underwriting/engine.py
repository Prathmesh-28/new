"""
UnderwritingEngine — scores a credit application using 9 signals.
Ported from services/underwriting/engine.py to use Signals dataclass
directly (no psycopg2; Django ORM feeds the signals).
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

INDUSTRY_RISK_MAP: Dict[str, float] = {
    "saas": 0.85,
    "fintech": 0.90,
    "ecommerce": 1.00,
    "retail": 1.05,
    "food_beverage": 1.15,
    "hospitality": 1.20,
    "construction": 1.15,
    "healthcare": 0.95,
    "education": 0.90,
    "professional_svc": 0.95,
    "manufacturing": 1.10,
    "real_estate": 1.10,
    "logistics": 1.05,
    "crypto": 1.40,
    "gambling": 1.50,
    "other": 1.10,
}

PRODUCT_MAP = [
    (80, "credit_line"),
    (65, "term_loan"),
    (50, "revenue_advance"),
    (35, "invoice_finance"),
    (0, "decline"),
]

MIN_APPROVABLE_SCORE = 35


@dataclass
class Signals:
    monthly_revenues: list
    revenue_trend_3m: float
    avg_monthly_revenue: float
    revenue_cv: float
    first_transaction_date: Any
    account_age_days: int
    top_customer_revenue_pct: float
    top_3_customer_revenue_pct: float
    avg_days_to_pay: float
    late_payment_rate: float
    overdraft_days_last_90: int
    overdraft_rate: float
    total_monthly_debt_obligations: float
    dscr: float
    logins_last_30d: int
    forecasts_viewed_last_30d: int
    avg_forecast_confidence: float
    industry: str
    tenant_id: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            k: (v.isoformat() if hasattr(v, "isoformat") else v)
            for k, v in self.__dict__.items()
        }


@dataclass
class UnderwritingResult:
    score: int
    approved_amount: float
    approved_amount_min: float
    recommended_product: str
    breakdown: Dict[str, Any]
    decline_reason: Optional[str] = None


class UnderwritingEngine:

    def score(self, signals: Signals) -> UnderwritingResult:
        breakdown: Dict[str, Any] = {}

        def record(name: str, weight: float, raw: float) -> float:
            clamped = max(0.0, min(100.0, raw))
            weighted = clamped * weight
            breakdown[name] = {"raw_score": round(clamped, 2), "weight": weight, "contribution": round(weighted, 2)}
            return weighted

        raw_score = (
            record("revenue", 0.20, self._score_revenue(signals))
            + record("consistency", 0.15, self._score_consistency(signals))
            + record("business_age", 0.10, self._score_business_age(signals))
            + record("concentration", 0.10, self._score_concentration(signals))
            + record("payment_behavior", 0.10, self._score_payment_behavior(signals))
            + record("overdraft_freq", 0.10, self._score_overdraft_freq(signals))
            + record("debt_service", 0.10, self._score_debt_service(signals))
            + record("behavioral", 0.05, self._score_behavioral(signals))
            + record("forecast_quality", 0.10, self._score_forecast_quality(signals))
        )

        industry_multiplier = INDUSTRY_RISK_MAP.get(signals.industry.lower(), 1.10)
        adjusted_score = min(100.0, raw_score / industry_multiplier)
        breakdown.update({
            "industry": signals.industry,
            "industry_multiplier": industry_multiplier,
            "raw_score": round(raw_score, 2),
            "adjusted_score": round(adjusted_score, 2),
            "signals": signals.to_dict(),
        })

        final_score = round(adjusted_score)
        approved_amount, approved_min = self._calc_approved_amount(final_score, signals)
        product = self._recommend_product(final_score, signals)

        return UnderwritingResult(
            score=final_score,
            approved_amount=approved_amount,
            approved_amount_min=approved_min,
            recommended_product=product,
            breakdown=breakdown,
        )

    def _score_revenue(self, s: Signals) -> float:
        if s.avg_monthly_revenue <= 0:
            return 0.0
        rev_score = min(50.0, math.log10(max(1, s.avg_monthly_revenue)) * 12.5)
        trend_score = min(50.0, max(0.0, 25.0 + s.revenue_trend_3m * 125.0))
        return rev_score + trend_score

    def _score_consistency(self, s: Signals) -> float:
        cv = s.revenue_cv
        if cv <= 0.20:
            return 100.0
        if cv >= 1.0:
            return 0.0
        return max(0.0, 100.0 - ((cv - 0.20) / 0.80) * 100.0)

    def _score_business_age(self, s: Signals) -> float:
        days = s.account_age_days
        if days < 180:
            return 0.0
        if days < 365:
            return 25.0
        if days < 730:
            return 50.0 + (days - 365) / 365 * 25.0
        if days < 1095:
            return 75.0 + (days - 730) / 365 * 25.0
        return 100.0

    def _score_concentration(self, s: Signals) -> float:
        top1 = s.top_customer_revenue_pct
        if top1 <= 0.25:
            return 100.0
        if top1 >= 0.75:
            return 0.0
        return max(0.0, 100.0 - ((top1 - 0.25) / 0.50) * 100.0)

    def _score_payment_behavior(self, s: Signals) -> float:
        days_score = max(0.0, 100.0 - max(0.0, s.avg_days_to_pay - 15.0) * (100.0 / 45.0))
        return max(0.0, days_score - s.late_payment_rate * 100.0)

    def _score_overdraft_freq(self, s: Signals) -> float:
        if s.overdraft_rate <= 0:
            return 100.0
        if s.overdraft_rate >= 0.33:
            return 0.0
        return max(0.0, 100.0 - (s.overdraft_rate / 0.33) * 100.0)

    def _score_debt_service(self, s: Signals) -> float:
        dscr = s.dscr
        if dscr >= 3.0:
            return 100.0
        if dscr >= 1.25:
            return 25.0 + ((dscr - 1.25) / 1.75) * 75.0
        if dscr >= 1.0:
            return (dscr - 1.0) / 0.25 * 25.0
        return 0.0

    def _score_behavioral(self, s: Signals) -> float:
        login_score = min(50.0, s.logins_last_30d * (50.0 / 15.0))
        forecast_score = min(50.0, s.forecasts_viewed_last_30d * (50.0 / 5.0))
        return login_score + forecast_score

    def _score_forecast_quality(self, s: Signals) -> float:
        return max(0.0, min(100.0, (s.avg_forecast_confidence - 0.5) / 0.5 * 100.0))

    def _calc_approved_amount(self, score: int, s: Signals):
        mrr = s.avg_monthly_revenue
        if mrr <= 0 or score < MIN_APPROVABLE_SCORE:
            return 0.0, 0.0
        if score >= 80:
            multiplier_max, multiplier_min = 6.0, 4.0
        elif score >= 65:
            multiplier_max, multiplier_min = 4.0, 2.5
        elif score >= 50:
            multiplier_max, multiplier_min = 2.0, 1.0
        else:
            multiplier_max, multiplier_min = 1.0, 0.5

        dscr_cap = max(0.0, mrr - s.total_monthly_debt_obligations) * 3.0 * 12.0
        max_amount = min(mrr * multiplier_max, dscr_cap) if dscr_cap > 0 else mrr * multiplier_max

        def round_50k(v): return round(v / 50_000) * 50_000
        return round_50k(max_amount), round_50k(mrr * multiplier_min)

    def _recommend_product(self, score: int, s: Signals) -> str:
        if score < MIN_APPROVABLE_SCORE:
            return "decline"
        if s.top_customer_revenue_pct > 0.50 and score >= 35:
            return "invoice_finance"
        if s.dscr < 1.5 and s.revenue_trend_3m > 0.05 and score >= 50:
            return "revenue_advance"
        for min_score, product in PRODUCT_MAP:
            if score >= min_score:
                return product
        return "decline"
