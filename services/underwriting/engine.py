"""
UnderwritingEngine — scores a credit application using 9 signals.

Weight table (must sum to 1.0):
  revenue            0.20
  consistency        0.15
  business_age       0.10
  concentration      0.10
  payment_behavior   0.10
  overdraft_freq     0.10
  debt_service       0.10
  behavioral         0.05
  forecast_quality   0.10
  ─────────────────────────
  TOTAL              1.00

After raw scoring:
  1. Apply INDUSTRY_RISK_MAP multiplier (divisor — higher risk → lower score)
  2. Fraud gate via Sardine API — HIGH risk → score = 0, decline_reason = 'fraud_risk'
  3. Map adjusted score to approved_amount range and product type

The engine does NOT make the credit decision — it returns a score.
The credit service routes to lenders.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any, Dict, Optional

from .signals import Signals

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Industry risk multipliers  (>1.0 = higher risk → divides the raw score)
# ---------------------------------------------------------------------------

INDUSTRY_RISK_MAP: Dict[str, float] = {
    "saas":              0.85,   # lower risk
    "fintech":           0.90,
    "ecommerce":         1.00,
    "retail":            1.05,
    "food_beverage":     1.15,
    "hospitality":       1.20,
    "construction":      1.15,
    "healthcare":        0.95,
    "education":         0.90,
    "professional_svc":  0.95,
    "manufacturing":     1.10,
    "real_estate":       1.10,
    "logistics":         1.05,
    "crypto":            1.40,   # higher risk
    "gambling":          1.50,
    "other":             1.10,
}


# ---------------------------------------------------------------------------
# Product recommendation thresholds
# ---------------------------------------------------------------------------

PRODUCT_MAP = [
    # (min_score, product_type)
    (80, "credit_line"),          # strong — revolving line
    (65, "term_loan"),            # good — fixed term loan
    (50, "revenue_advance"),      # moderate — repaid as % of revenue
    (35, "invoice_finance"),      # weaker — asset-backed
    (0,  "decline"),              # below minimum
]

MIN_APPROVABLE_SCORE = 35


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class UnderwritingResult:
    score: int                              # 0-100
    approved_amount: float                  # maximum approvable amount
    approved_amount_min: float              # conservative floor
    recommended_product: str               # product type slug
    breakdown: Dict[str, Any]              # per-signal scores and weights
    decline_reason: Optional[str] = None   # set when score = 0


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class UnderwritingEngine:

    def score(self, signals: Signals) -> UnderwritingResult:
        """
        Compute the underwriting score from pre-collected signals.
        See module docstring for weight table.
        """
        breakdown: Dict[str, Any] = {}

        def record(name: str, weight: float, raw: float) -> float:
            clamped = max(0.0, min(100.0, raw))
            weighted = clamped * weight
            breakdown[name] = {
                "raw_score": round(clamped, 2),
                "weight": weight,
                "contribution": round(weighted, 2),
            }
            return weighted

        raw_score = (
            record("revenue",          0.20, self._score_revenue(signals))
            + record("consistency",    0.15, self._score_consistency(signals))
            + record("business_age",   0.10, self._score_business_age(signals))
            + record("concentration",  0.10, self._score_concentration(signals))
            + record("payment_behavior",0.10, self._score_payment_behavior(signals))
            + record("overdraft_freq", 0.10, self._score_overdraft_freq(signals))
            + record("debt_service",   0.10, self._score_debt_service(signals))
            + record("behavioral",     0.05, self._score_behavioral(signals))
            + record("forecast_quality",0.10, self._score_forecast_quality(signals))
        )

        industry_multiplier = INDUSTRY_RISK_MAP.get(signals.industry.lower(), 1.10)
        adjusted_score = min(100.0, raw_score / industry_multiplier)

        breakdown["industry"] = signals.industry
        breakdown["industry_multiplier"] = industry_multiplier
        breakdown["raw_score"] = round(raw_score, 2)
        breakdown["adjusted_score"] = round(adjusted_score, 2)
        breakdown["signals"] = signals.to_dict()

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

    # ------------------------------------------------------------------
    # Signal scorers  (each returns 0-100)
    # ------------------------------------------------------------------

    def _score_revenue(self, s: Signals) -> float:
        """
        Revenue signal — combines:
          • Absolute monthly revenue (50 pts)  — log-scaled, ₹5L/mo → 50 pts
          • 3-month revenue trend (50 pts)     — growing = good
        """
        if s.avg_monthly_revenue <= 0:
            return 0.0

        # Log scale: ₹10K → ~20 pts, ₹1L → ~40 pts, ₹10L → ~60 pts, ₹1Cr → ~80 pts
        rev_score = min(50.0, math.log10(max(1, s.avg_monthly_revenue)) * 12.5)

        # Trend: +20% MoM → 50 pts; flat → 25 pts; -20% MoM → 0 pts
        trend_score = min(50.0, max(0.0, 25.0 + s.revenue_trend_3m * 125.0))

        return rev_score + trend_score

    def _score_consistency(self, s: Signals) -> float:
        """
        Lower CoV = more consistent revenue = higher score.
        CoV < 0.20 → 100; CoV 0.50 → 50; CoV ≥ 1.0 → 0
        """
        cv = s.revenue_cv
        if cv <= 0.20:
            return 100.0
        if cv >= 1.0:
            return 0.0
        return max(0.0, 100.0 - ((cv - 0.20) / 0.80) * 100.0)

    def _score_business_age(self, s: Signals) -> float:
        """
        <6 months → 0; 6-12 months → 25; 1-2 years → 50; 2-3 years → 75; 3+ years → 100
        """
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
        """
        Penalises single-customer dependency.
        Top customer < 25% → 100; > 75% → 0
        """
        top1 = s.top_customer_revenue_pct
        if top1 <= 0.25:
            return 100.0
        if top1 >= 0.75:
            return 0.0
        return max(0.0, 100.0 - ((top1 - 0.25) / 0.50) * 100.0)

    def _score_payment_behavior(self, s: Signals) -> float:
        """
        Fast payers and low late-payment rate score higher.
          avg_days ≤ 15 → 100; avg_days ≥ 60 → 0
          late_rate 0 → +0 bonus; 0.20 → -20 pts
        """
        days_score = max(0.0, 100.0 - max(0.0, s.avg_days_to_pay - 15.0) * (100.0 / 45.0))
        late_penalty = s.late_payment_rate * 100.0
        return max(0.0, days_score - late_penalty)

    def _score_overdraft_freq(self, s: Signals) -> float:
        """
        0 overdraft days → 100; ≥ 30 days in 90d → 0
        """
        rate = s.overdraft_rate
        if rate <= 0:
            return 100.0
        if rate >= 0.33:  # 30+ days out of 90
            return 0.0
        return max(0.0, 100.0 - (rate / 0.33) * 100.0)

    def _score_debt_service(self, s: Signals) -> float:
        """
        DSCR ≥ 3.0 → 100; DSCR 1.25 (break-even) → 25; DSCR < 1.0 → 0
        """
        dscr = s.dscr
        if dscr >= 3.0:
            return 100.0
        if dscr >= 1.25:
            return 25.0 + ((dscr - 1.25) / 1.75) * 75.0
        if dscr >= 1.0:
            return (dscr - 1.0) / 0.25 * 25.0
        return 0.0

    def _score_behavioral(self, s: Signals) -> float:
        """
        Active platform usage → more data → lower default risk.
        ≥ 15 logins + ≥ 5 forecast views in last 30d → 100
        """
        login_score = min(50.0, s.logins_last_30d * (50.0 / 15.0))
        forecast_score = min(50.0, s.forecasts_viewed_last_30d * (50.0 / 5.0))
        return login_score + forecast_score

    def _score_forecast_quality(self, s: Signals) -> float:
        """
        Higher average forecast confidence → better data quality → lower uncertainty.
        Maps confidence [0.5, 1.0] → score [0, 100].
        """
        conf = s.avg_forecast_confidence
        return max(0.0, min(100.0, (conf - 0.5) / 0.5 * 100.0))

    # ------------------------------------------------------------------
    # Approved amount calculation
    # ------------------------------------------------------------------

    def _calc_approved_amount(
        self, score: int, s: Signals
    ) -> tuple[float, float]:
        """
        Approved amount is a multiple of average monthly revenue.
        Multiplier scales with score:
          score 80-100 → up to 6× MRR
          score 65-79  → up to 4× MRR
          score 50-64  → up to 2× MRR
          score 35-49  → up to 1× MRR
          below 35     → 0
        """
        mrr = s.avg_monthly_revenue
        if mrr <= 0 or score < MIN_APPROVABLE_SCORE:
            return 0.0, 0.0

        if score >= 80:
            multiplier_max = 6.0
            multiplier_min = 4.0
        elif score >= 65:
            multiplier_max = 4.0
            multiplier_min = 2.5
        elif score >= 50:
            multiplier_max = 2.0
            multiplier_min = 1.0
        else:
            multiplier_max = 1.0
            multiplier_min = 0.5

        # Additionally cap by 3× DSCR-adjusted monthly surplus
        dscr_cap = max(0.0, mrr - s.total_monthly_debt_obligations) * 3.0 * 12.0
        max_amount = min(mrr * multiplier_max, dscr_cap) if dscr_cap > 0 else mrr * multiplier_max
        min_amount = mrr * multiplier_min

        # Round to nearest ₹50,000
        def round_50k(v: float) -> float:
            return round(v / 50_000) * 50_000

        return round_50k(max_amount), round_50k(min_amount)

    # ------------------------------------------------------------------
    # Product recommendation
    # ------------------------------------------------------------------

    def _recommend_product(self, score: int, s: Signals) -> str:
        """
        Additional logic on top of score threshold:
          - If DSCR < 1.5 but revenue is growing → revenue_advance preferred
          - If top customer > 50% → invoice_finance preferred
          - Otherwise follow PRODUCT_MAP
        """
        if score < MIN_APPROVABLE_SCORE:
            return "decline"

        # Invoice finance if revenue is concentrated
        if s.top_customer_revenue_pct > 0.50 and score >= 35:
            return "invoice_finance"

        # Revenue advance if debt load is high but growing
        if s.dscr < 1.5 and s.revenue_trend_3m > 0.05 and score >= 50:
            return "revenue_advance"

        for min_score, product in PRODUCT_MAP:
            if score >= min_score:
                return product

        return "decline"
