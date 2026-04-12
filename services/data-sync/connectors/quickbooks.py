"""
QuickBooks Online connector — OAuth 2.0, webhook + 2-hour scheduled sync.
Fetches: invoices, bills, journal entries, P&L.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx

from .base import SyncConnector

logger = logging.getLogger(__name__)

QBO_BASE = "https://quickbooks.api.intuit.com/v3/company"
QBO_AUTH_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"


class QuickBooksConnector(SyncConnector):
    """
    QuickBooks Online connector.
    Credentials expected:
      access_token, refresh_token, realm_id (company ID), client_id, client_secret
    """

    provider = "quickbooks"

    def __init__(self, tenant_id: str, credentials: Dict[str, Any]):
        super().__init__(tenant_id, credentials)
        self._realm_id = credentials["realm_id"]
        self._access_token = credentials["access_token"]
        self._base = f"{QBO_BASE}/{self._realm_id}"

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Accept": "application/json",
            "Content-Type": "application/text",
        }

    def _query(self, sql: str) -> List[Dict[str, Any]]:
        url = f"{self._base}/query"
        params = {"query": sql, "minorversion": "65"}
        resp = httpx.get(url, params=params, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        query_response = data.get("QueryResponse", {})
        # Response key varies by entity type; return whatever list is present
        for key, val in query_response.items():
            if isinstance(val, list):
                return val
        return []

    def refresh_credentials(self) -> Dict[str, Any]:
        resp = httpx.post(
            QBO_AUTH_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": self.credentials["refresh_token"],
            },
            auth=(self.credentials["client_id"], self.credentials["client_secret"]),
            timeout=15,
        )
        resp.raise_for_status()
        tokens = resp.json()
        self.credentials["access_token"] = tokens["access_token"]
        self.credentials["refresh_token"] = tokens.get("refresh_token", self.credentials["refresh_token"])
        self._access_token = tokens["access_token"]
        return self.credentials

    # ------------------------------------------------------------------
    # Interface implementation
    # ------------------------------------------------------------------

    def fetch_accounts(self) -> List[Dict[str, Any]]:
        rows = self._query("SELECT * FROM Account WHERE Active = true MAXRESULTS 1000")
        accounts = []
        for acct in rows:
            accounts.append({
                "account_id": str(acct.get("Id", "")),
                "account_name": acct.get("Name", ""),
                "account_type": acct.get("AccountType", ""),
                "currency": acct.get("CurrencyRef", {}).get("value", "USD"),
            })
        return accounts

    def fetch_transactions(self, since: datetime) -> List[Dict[str, Any]]:
        since_str = since.strftime("%Y-%m-%d")
        normalised: List[Dict[str, Any]] = []

        # --- Invoices (revenue) ---
        invoices = self._query(
            f"SELECT * FROM Invoice WHERE TxnDate >= '{since_str}' MAXRESULTS 1000"
        )
        for inv in invoices:
            due_date = inv.get("DueDate", inv.get("TxnDate", ""))
            amount = float(inv.get("TotalAmt", 0))
            normalised.append({
                "source_id": f"qbo_inv_{inv['Id']}",
                "date": self.parse_date(inv.get("TxnDate", "")),
                "amount": amount,
                "description": f"Invoice #{inv.get('DocNumber', '')} — {inv.get('CustomerRef', {}).get('name', '')}",
                "category": "revenue",
                "merchant_name": inv.get("CustomerRef", {}).get("name", ""),
                "due_date": due_date,
                "raw_data": inv,
            })

        # --- Bills (operating expenses) ---
        bills = self._query(
            f"SELECT * FROM Bill WHERE TxnDate >= '{since_str}' MAXRESULTS 1000"
        )
        for bill in bills:
            amount = float(bill.get("TotalAmt", 0))
            normalised.append({
                "source_id": f"qbo_bill_{bill['Id']}",
                "date": self.parse_date(bill.get("TxnDate", "")),
                "amount": -amount,
                "description": f"Bill — {bill.get('VendorRef', {}).get('name', '')}",
                "category": "operating_expense",
                "merchant_name": bill.get("VendorRef", {}).get("name", ""),
                "raw_data": bill,
            })

        # --- Journal entries ---
        journals = self._query(
            f"SELECT * FROM JournalEntry WHERE TxnDate >= '{since_str}' MAXRESULTS 500"
        )
        for je in journals:
            for line in je.get("Line", []):
                detail = line.get("JournalEntryLineDetail", {})
                posting_type = detail.get("PostingType", "Debit")
                amount = float(line.get("Amount", 0))
                if posting_type == "Credit":
                    amount = -amount
                normalised.append({
                    "source_id": f"qbo_je_{je['Id']}_{line.get('Id', '0')}",
                    "date": self.parse_date(je.get("TxnDate", "")),
                    "amount": amount,
                    "description": line.get("Description", "Journal entry"),
                    "category": self.normalise_category(
                        detail.get("AccountRef", {}).get("name", "")
                    ),
                    "merchant_name": "",
                    "raw_data": line,
                })

        return normalised

    def fetch_balance(self) -> Dict[str, float]:
        rows = self._query(
            "SELECT Id, Name, CurrentBalance FROM Account WHERE Active = true MAXRESULTS 1000"
        )
        return {
            str(acct["Id"]): float(acct.get("CurrentBalance", 0))
            for acct in rows
        }
