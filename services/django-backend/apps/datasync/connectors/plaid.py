from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import requests
from django.conf import settings

from .base import BaseConnector

logger = logging.getLogger(__name__)

PLAID_URLS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


class PlaidConnector(BaseConnector):
    provider = "plaid"

    def __init__(self, connection):
        super().__init__(connection)
        base_url = PLAID_URLS.get(settings.PLAID_ENV, PLAID_URLS["sandbox"])
        self._base = base_url
        self._headers = {"Content-Type": "application/json"}
        self._auth = {
            "client_id": settings.PLAID_CLIENT_ID,
            "secret": settings.PLAID_SECRET,
            "access_token": connection.access_token,
        }

    def fetch_transactions(self, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        start = since or (datetime.utcnow() - timedelta(days=90))
        end = datetime.utcnow()
        payload = {
            **self._auth,
            "start_date": start.strftime("%Y-%m-%d"),
            "end_date": end.strftime("%Y-%m-%d"),
        }
        resp = requests.post(f"{self._base}/transactions/get", json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("transactions", [])

    def fetch_balance(self) -> Dict[str, Any]:
        resp = requests.post(
            f"{self._base}/accounts/balance/get",
            json=self._auth,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def normalize_transaction(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        amount = -float(raw.get("amount", 0))  # Plaid: positive = debit, we store negative = outflow
        return {
            "date": raw.get("date"),
            "amount": amount,
            "description": raw.get("name", ""),
            "category": self._map_category(raw.get("category", [])),
            "counterparty": raw.get("merchant_name") or raw.get("name", ""),
            "is_recurring": False,
            "frequency": None,
            "source_id": raw.get("transaction_id"),
            "raw_data": raw,
        }

    @staticmethod
    def _map_category(plaid_cats: list) -> str:
        if not plaid_cats:
            return "other"
        primary = (plaid_cats[0] or "").lower()
        mapping = {
            "food and drink": "operating_expense",
            "shops": "operating_expense",
            "transfer": "transfer",
            "payroll": "payroll",
            "tax": "tax",
            "loan payments": "loan_payment",
            "income": "revenue",
        }
        for key, val in mapping.items():
            if key in primary:
                return val
        return "other"
