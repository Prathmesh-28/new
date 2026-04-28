"""
Lender routing logic — ported from services/credit-service/src/index.ts.
Maps underwriting score + product type to a ranked list of lender offers.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Dict, Any


def route_to_lenders(
    tenant_id: str,
    amount: float,
    term_months: int,
    score: int,
    product: str,
) -> List[Dict[str, Any]]:
    offers: List[Dict[str, Any]] = []
    now = datetime.utcnow()

    if score >= 65:
        offers.append({
            "lender": "stripe_capital",
            "amount": amount,
            "interest_rate": round(0.099 + max(0, (80 - score) / 80) * 0.10, 4),
            "term_months": term_months,
            "monthly_payment": round((amount * 0.14) / term_months, 2),
            "expires_at": (now + timedelta(days=7)).isoformat(),
        })

    if score >= 50 and product == "credit_line":
        offers.append({
            "lender": "fundbox",
            "amount": round(amount * 0.75, 2),
            "interest_rate": 0.149,
            "term_months": 12,
            "monthly_payment": round((amount * 0.75 * 0.149) / 12, 2),
            "expires_at": (now + timedelta(days=5)).isoformat(),
        })

    if score >= 40 and product == "revenue_advance":
        offers.append({
            "lender": "capchase",
            "amount": amount,
            "interest_rate": 0.129,
            "term_months": term_months,
            "monthly_payment": round((amount * 0.129) / term_months, 2),
            "expires_at": (now + timedelta(days=10)).isoformat(),
        })

    if score >= 35:
        offers.append({
            "lender": "lendio",
            "amount": round(amount * 0.80, 2),
            "interest_rate": 0.199,
            "term_months": term_months,
            "monthly_payment": round((amount * 0.80 * 0.199) / term_months, 2),
            "expires_at": (now + timedelta(days=14)).isoformat(),
        })

    return sorted(offers, key=lambda o: o["interest_rate"])
