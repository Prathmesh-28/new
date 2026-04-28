from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

SARDINE_BASE_URL = "https://api.sardine.ai/v1"


@dataclass
class FraudResult:
    risk: str
    score: Optional[float]
    signals: Dict[str, Any]
    session_key: Optional[str]


def run_fraud_gate(tenant_id: str, org_context: Dict[str, Any]) -> FraudResult:
    api_key = getattr(settings, "SARDINE_API_KEY", "")
    if not api_key:
        logger.warning("Sardine credentials not configured — defaulting to MEDIUM risk")
        return FraudResult(risk="MEDIUM", score=None, signals={}, session_key=None)

    payload = {
        "flow": "kyb",
        "sessionKey": f"uw-{tenant_id}",
        "customer": {
            "id": tenant_id,
            "emailAddress": org_context.get("email", ""),
            "phone": org_context.get("phone", ""),
        },
        "transaction": {
            "id": f"uw-{tenant_id}",
            "type": "credit_application",
            "amount": str(org_context.get("requested_amount", 0)),
            "currencyCode": "INR",
            "actionType": "Credit",
        },
        "business": {
            "name": org_context.get("business_name", ""),
            "taxId": org_context.get("tax_id", ""),
            "entityType": "COMPANY",
        },
    }

    try:
        token = base64.b64encode(f":{api_key}".encode()).decode()
        resp = requests.post(
            f"{SARDINE_BASE_URL}/customers/score",
            json=payload,
            headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return FraudResult(
            risk=data.get("level", "MEDIUM").upper(),
            score=data.get("fraudScore"),
            signals=data.get("signals", {}),
            session_key=data.get("sessionKey"),
        )
    except requests.Timeout:
        logger.error("Sardine API timeout for tenant %s", tenant_id)
        return FraudResult(risk="MEDIUM", score=None, signals={"error": "timeout"}, session_key=None)
    except Exception as exc:
        logger.error("Sardine API error for tenant %s: %s", tenant_id, exc)
        return FraudResult(risk="MEDIUM", score=None, signals={"error": str(exc)}, session_key=None)
