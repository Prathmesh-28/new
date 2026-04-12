"""
Fraud gate — Sardine API integration.

Called as the final step of underwriting before returning a score.
If Sardine returns HIGH risk the application is declined immediately
with decline_reason='fraud_risk'.

Sardine docs: https://docs.sardine.ai/
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

SARDINE_API_KEY = os.getenv("SARDINE_API_KEY", "")
SARDINE_CLIENT_ID = os.getenv("SARDINE_CLIENT_ID", "")
SARDINE_BASE_URL = os.getenv("SARDINE_BASE_URL", "https://api.sardine.ai/v1")


@dataclass
class FraudResult:
    risk: str                    # HIGH | MEDIUM | LOW
    score: Optional[float]       # 0-100 where 100 = highest fraud risk
    signals: Dict[str, Any]      # raw Sardine response signals
    session_key: Optional[str]   # Sardine session key for audit


def run_fraud_gate(
    tenant_id: str,
    org_context: Dict[str, Any],
) -> FraudResult:
    """
    Call Sardine's /customers/score endpoint.

    org_context should contain:
      email, phone, business_name, tax_id (if available), ip_address

    Falls back to MEDIUM risk on API failure to avoid blocking all
    applications when Sardine is unavailable.
    """
    if not SARDINE_API_KEY or not SARDINE_CLIENT_ID:
        logger.warning("Sardine credentials not configured — defaulting to MEDIUM risk")
        return FraudResult(risk="MEDIUM", score=None, signals={}, session_key=None)

    payload = {
        "flow": "kyb",
        "sessionKey": f"uw-{tenant_id}",
        "customer": {
            "id": tenant_id,
            "emailAddress": org_context.get("email", ""),
            "phone": org_context.get("phone", ""),
            "isPhoneVerified": False,
            "isEmailVerified": True,
        },
        "transaction": {
            "id": f"uw-{tenant_id}",
            "type": "credit_application",
            "amount": str(org_context.get("requested_amount", 0)),
            "currencyCode": "INR",
            "actionType": "Credit",
            "itemCategory": "business_credit",
        },
        "business": {
            "name": org_context.get("business_name", ""),
            "taxId": org_context.get("tax_id", ""),
            "entityType": "COMPANY",
        },
    }

    try:
        resp = httpx.post(
            f"{SARDINE_BASE_URL}/customers/score",
            json=payload,
            headers={
                "Authorization": f"Basic {_basic_auth()}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        level = data.get("level", "MEDIUM").upper()  # HIGH | MEDIUM | LOW
        score = data.get("fraudScore")
        signals = data.get("signals", {})
        session_key = data.get("sessionKey")

        logger.info(
            "Sardine fraud gate: tenant=%s level=%s score=%s",
            tenant_id, level, score,
        )
        return FraudResult(risk=level, score=score, signals=signals, session_key=session_key)

    except httpx.TimeoutException:
        logger.error("Sardine API timeout for tenant %s", tenant_id)
        return FraudResult(risk="MEDIUM", score=None, signals={"error": "timeout"}, session_key=None)
    except Exception as exc:
        logger.error("Sardine API error for tenant %s: %s", tenant_id, exc)
        return FraudResult(risk="MEDIUM", score=None, signals={"error": str(exc)}, session_key=None)


def _basic_auth() -> str:
    import base64
    token = base64.b64encode(f"{SARDINE_CLIENT_ID}:{SARDINE_API_KEY}".encode()).decode()
    return token
