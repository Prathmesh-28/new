"""
Zoho Books connector — OAuth 2.0, webhook + 2-hour scheduled sync.
Fetches: invoices, bills, chart of accounts.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List

import httpx

from .base import SyncConnector

logger = logging.getLogger(__name__)

ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token"


def _books_base(region: str = "com") -> str:
    return f"https://books.zoho.{region}/api/v3"


class ZohoConnector(SyncConnector):
    """
    Zoho Books connector.
    Credentials expected:
      access_token, refresh_token, client_id, client_secret,
      organization_id, region (com|in|eu|com.au|jp)
    """

    provider = "zoho"

    def __init__(self, tenant_id: str, credentials: Dict[str, Any]):
        super().__init__(tenant_id, credentials)
        self._org_id = credentials["organization_id"]
        self._access_token = credentials["access_token"]
        self._base = _books_base(credentials.get("region", "com"))

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Zoho-oauthtoken {self._access_token}"}

    def _get(self, path: str, params: Dict[str, Any] | None = None) -> Any:
        p = {"organization_id": self._org_id, **(params or {})}
        resp = httpx.get(f"{self._base}/{path}", headers=self._headers(), params=p, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def refresh_credentials(self) -> Dict[str, Any]:
        resp = httpx.post(
            ZOHO_TOKEN_URL,
            params={
                "grant_type": "refresh_token",
                "refresh_token": self.credentials["refresh_token"],
                "client_id": self.credentials["client_id"],
                "client_secret": self.credentials["client_secret"],
            },
            timeout=15,
        )
        resp.raise_for_status()
        tokens = resp.json()
        self.credentials["access_token"] = tokens["access_token"]
        self._access_token = tokens["access_token"]
        return self.credentials

    # ------------------------------------------------------------------
    # Interface implementation
    # ------------------------------------------------------------------

    def fetch_accounts(self) -> List[Dict[str, Any]]:
        data = self._get("chartofaccounts", {"account_type": "all"})
        accounts = []
        for acct in data.get("chartofaccounts", []):
            accounts.append({
                "account_id": acct.get("account_id", ""),
                "account_name": acct.get("account_name", ""),
                "account_type": acct.get("account_type", ""),
                "currency": acct.get("currency_id", "USD"),
            })
        return accounts

    def fetch_transactions(self, since: datetime) -> List[Dict[str, Any]]:
        since_str = since.strftime("%Y-%m-%d")
        normalised: List[Dict[str, Any]] = []

        # --- Invoices ---
        page = 1
        while True:
            data = self._get("invoices", {"date_after": since_str, "page": page, "per_page": 200})
            for inv in data.get("invoices", []):
                normalised.append({
                    "source_id": f"zoho_inv_{inv.get('invoice_id', '')}",
                    "date": self.parse_date(inv.get("date", "")),
                    "amount": float(inv.get("total", 0)),
                    "description": f"Invoice {inv.get('invoice_number', '')}",
                    "category": "revenue",
                    "merchant_name": inv.get("customer_name", ""),
                    "raw_data": inv,
                })
            if not data.get("page_context", {}).get("has_more_page"):
                break
            page += 1

        # --- Bills ---
        page = 1
        while True:
            data = self._get("bills", {"date_after": since_str, "page": page, "per_page": 200})
            for bill in data.get("bills", []):
                normalised.append({
                    "source_id": f"zoho_bill_{bill.get('bill_id', '')}",
                    "date": self.parse_date(bill.get("date", "")),
                    "amount": -float(bill.get("total", 0)),
                    "description": f"Bill {bill.get('bill_number', '')}",
                    "category": self.normalise_category(bill.get("account_name", "")),
                    "merchant_name": bill.get("vendor_name", ""),
                    "raw_data": bill,
                })
            if not data.get("page_context", {}).get("has_more_page"):
                break
            page += 1

        return normalised

    def fetch_balance(self) -> Dict[str, float]:
        data = self._get("chartofaccounts", {"filter_by": "AccountType.Bank"})
        return {
            acct["account_id"]: float(acct.get("balance", 0))
            for acct in data.get("chartofaccounts", [])
        }
