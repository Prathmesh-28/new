"""
Merge.dev connector — API key, 4-hour scheduled sync.
Unified accounting schema for 40+ platforms via Merge Accounting API.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from .base import SyncConnector

logger = logging.getLogger(__name__)

MERGE_BASE = "https://api.merge.dev/api/accounting/v1"


class MergeDevConnector(SyncConnector):
    """
    Merge.dev unified accounting connector.
    Credentials expected:
      api_key (Merge production API key), account_token (per-linked-account token)
    """

    provider = "merge_dev"

    def __init__(self, tenant_id: str, credentials: Dict[str, Any]):
        super().__init__(tenant_id, credentials)
        self._api_key = credentials["api_key"]
        self._account_token = credentials["account_token"]

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "X-Account-Token": self._account_token,
            "Accept": "application/json",
        }

    def _get_all(self, path: str, params: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
        """Paginate through all results using Merge's cursor pagination."""
        results: List[Dict[str, Any]] = []
        url = f"{MERGE_BASE}/{path}"
        p = dict(params or {})
        p.setdefault("page_size", 100)

        while url:
            resp = httpx.get(url, headers=self._headers(), params=p, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            results.extend(data.get("results", []))
            url = data.get("next")  # Merge returns full next URL
            p = {}  # params already baked into next URL

        return results

    # ------------------------------------------------------------------
    # Interface implementation
    # ------------------------------------------------------------------

    def fetch_accounts(self) -> List[Dict[str, Any]]:
        rows = self._get_all("accounts")
        accounts = []
        for acct in rows:
            accounts.append({
                "account_id": acct.get("id", ""),
                "account_name": acct.get("name", ""),
                "account_type": acct.get("classification", ""),
                "currency": acct.get("currency", "USD"),
                "remote_id": acct.get("remote_id", ""),
            })
        return accounts

    def fetch_transactions(self, since: datetime) -> List[Dict[str, Any]]:
        modified_after = since.strftime("%Y-%m-%dT%H:%M:%SZ")
        normalised: List[Dict[str, Any]] = []

        # Journal entries (most platforms expose all transactions here)
        entries = self._get_all("journal-entries", {"modified_after": modified_after})
        for je in entries:
            for line in je.get("lines", []):
                net_amount = float(line.get("net_amount", 0) or 0)
                normalised.append({
                    "source_id": f"merge_{je.get('id', '')}_{line.get('id', '')}",
                    "date": self.parse_date(
                        je.get("transaction_date") or je.get("modified_at", "")[:10]
                    ),
                    "amount": net_amount,
                    "description": je.get("memo", ""),
                    "category": self.normalise_category(
                        line.get("account", {}).get("classification", "") if isinstance(line.get("account"), dict)
                        else ""
                    ),
                    "merchant_name": je.get("company", {}).get("name", "") if isinstance(je.get("company"), dict) else "",
                    "raw_data": line,
                })

        # Invoices
        invoices = self._get_all("invoices", {"modified_after": modified_after})
        for inv in invoices:
            inv_type = inv.get("type", "ACCOUNTS_RECEIVABLE")
            amount = float(inv.get("total_amount", 0) or 0)
            if inv_type == "ACCOUNTS_PAYABLE":
                amount = -amount
            normalised.append({
                "source_id": f"merge_inv_{inv.get('id', '')}",
                "date": self.parse_date(inv.get("issue_date") or inv.get("modified_at", "")[:10]),
                "amount": amount,
                "description": f"Invoice {inv.get('number', '')}",
                "category": "revenue" if inv_type == "ACCOUNTS_RECEIVABLE" else "operating_expense",
                "merchant_name": inv.get("contact", {}).get("name", "") if isinstance(inv.get("contact"), dict) else "",
                "raw_data": inv,
            })

        return normalised

    def fetch_balance(self) -> Dict[str, float]:
        rows = self._get_all("accounts", {"classification": "ASSET"})
        balances: Dict[str, float] = {}
        for acct in rows:
            acct_id = acct.get("id", "")
            balance = acct.get("current_balance")
            if acct_id and balance is not None:
                balances[acct_id] = float(balance)
        return balances
