"""
Plaid connector — OAuth link token, real-time webhook + 4-hour scheduled sync.
Fetches: transactions, balances, account info.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List

import httpx

from .base import SyncConnector

logger = logging.getLogger(__name__)

PLAID_BASE_URLS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


class PlaidConnector(SyncConnector):
    """
    Plaid connector using the /transactions/sync endpoint (incremental).
    Credentials expected:
      access_token, client_id, secret, environment (sandbox|development|production)
    """

    provider = "plaid"

    def __init__(self, tenant_id: str, credentials: Dict[str, Any]):
        super().__init__(tenant_id, credentials)
        env = credentials.get("environment", "sandbox")
        self._base_url = PLAID_BASE_URLS.get(env, PLAID_BASE_URLS["sandbox"])
        self._client_id = credentials["client_id"]
        self._secret = credentials["secret"]
        self._access_token = credentials["access_token"]

    def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self._base_url}{path}"
        payload = {
            "client_id": self._client_id,
            "secret": self._secret,
            "access_token": self._access_token,
            **body,
        }
        resp = httpx.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    # Interface implementation
    # ------------------------------------------------------------------

    def fetch_accounts(self) -> List[Dict[str, Any]]:
        data = self._post("/accounts/get", {})
        accounts = []
        for acct in data.get("accounts", []):
            accounts.append({
                "account_id": acct["account_id"],
                "account_name": acct.get("name", ""),
                "account_type": acct.get("type", ""),
                "account_subtype": acct.get("subtype", ""),
                "currency": acct.get("balances", {}).get("iso_currency_code", "USD"),
                "mask": acct.get("mask"),
            })
        return accounts

    def fetch_transactions(self, since: datetime) -> List[Dict[str, Any]]:
        """
        Use /transactions/sync for incremental fetches.
        Falls back to /transactions/get when cursor is unavailable.
        """
        cursor = self.credentials.get("sync_cursor")
        added: List[Dict[str, Any]] = []
        has_more = True

        while has_more:
            body: Dict[str, Any] = {"count": 500}
            if cursor:
                body["cursor"] = cursor

            data = self._post("/transactions/sync", body)
            added.extend(data.get("added", []))
            # Also include modified transactions
            added.extend(data.get("modified", []))
            cursor = data.get("next_cursor")
            has_more = data.get("has_more", False)

        # Persist new cursor (caller is responsible for saving back to DB)
        self.credentials["sync_cursor"] = cursor

        normalised = []
        for txn in added:
            txn_date = self.parse_date(txn.get("date", ""))
            if txn_date < since.date().isoformat():
                continue
            normalised.append({
                "source_id": txn["transaction_id"],
                "date": txn_date,
                "amount": -float(txn.get("amount", 0)),  # Plaid: positive = debit
                "description": txn.get("name", ""),
                "category": self.normalise_category(
                    (txn.get("personal_finance_category") or {}).get("primary", "")
                    or (txn.get("category") or [""])[0]
                ),
                "merchant_name": txn.get("merchant_name") or txn.get("name", ""),
                "raw_data": txn,
            })

        return normalised

    def fetch_balance(self) -> Dict[str, float]:
        data = self._post("/accounts/balance/get", {})
        return {
            acct["account_id"]: float(acct.get("balances", {}).get("current", 0))
            for acct in data.get("accounts", [])
        }

    def validate_credentials(self) -> bool:
        try:
            self._post("/item/get", {})
            return True
        except Exception:
            return False
