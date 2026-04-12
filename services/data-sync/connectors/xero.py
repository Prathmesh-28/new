"""
Xero connector — OAuth 2.0, webhook + 2-hour scheduled sync.
Fetches: transactions, invoices, contacts.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List

import httpx

from .base import SyncConnector

logger = logging.getLogger(__name__)

XERO_BASE = "https://api.xero.com/api.xro/2.0"
XERO_TOKEN_URL = "https://identity.xero.com/connect/token"


class XeroConnector(SyncConnector):
    """
    Xero connector.
    Credentials expected:
      access_token, refresh_token, tenant_id (Xero tenant), client_id, client_secret
    """

    provider = "xero"

    def __init__(self, tenant_id: str, credentials: Dict[str, Any]):
        super().__init__(tenant_id, credentials)
        self._xero_tenant_id = credentials["xero_tenant_id"]
        self._access_token = credentials["access_token"]

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Xero-tenant-id": self._xero_tenant_id,
            "Accept": "application/json",
        }

    def _get(self, path: str, params: Dict[str, Any] | None = None) -> Any:
        resp = httpx.get(
            f"{XERO_BASE}/{path}",
            headers=self._headers(),
            params=params or {},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def refresh_credentials(self) -> Dict[str, Any]:
        resp = httpx.post(
            XERO_TOKEN_URL,
            data={
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
        self.credentials["refresh_token"] = tokens.get("refresh_token", self.credentials["refresh_token"])
        self._access_token = tokens["access_token"]
        return self.credentials

    # ------------------------------------------------------------------
    # Interface implementation
    # ------------------------------------------------------------------

    def fetch_accounts(self) -> List[Dict[str, Any]]:
        data = self._get("Accounts")
        accounts = []
        for acct in data.get("Accounts", []):
            accounts.append({
                "account_id": acct.get("AccountID", ""),
                "account_name": acct.get("Name", ""),
                "account_type": acct.get("Type", ""),
                "currency": acct.get("CurrencyCode", "USD"),
                "code": acct.get("Code", ""),
            })
        return accounts

    def fetch_transactions(self, since: datetime) -> List[Dict[str, Any]]:
        since_str = since.strftime("%Y-%m-%dT%H:%M:%S")
        normalised: List[Dict[str, Any]] = []

        # Bank transactions
        txn_data = self._get(
            "BankTransactions",
            params={"where": f'Date >= DateTime({since_str})', "pageSize": 100},
        )
        for txn in txn_data.get("BankTransactions", []):
            txn_type = txn.get("Type", "")
            # SPEND = outflow, RECEIVE = inflow
            amount = float(txn.get("Total", 0))
            if txn_type == "SPEND":
                amount = -amount

            normalised.append({
                "source_id": txn.get("BankTransactionID", ""),
                "date": self.parse_date(txn.get("DateString", txn.get("Date", ""))[:10]),
                "amount": amount,
                "description": txn.get("Reference", ""),
                "category": self.normalise_category(txn.get("LineItemType", "")),
                "merchant_name": txn.get("Contact", {}).get("Name", ""),
                "raw_data": txn,
            })

        # Invoices
        inv_data = self._get(
            "Invoices",
            params={
                "where": f'Date >= DateTime({since_str})',
                "Statuses": "AUTHORISED,PAID",
                "pageSize": 100,
            },
        )
        for inv in inv_data.get("Invoices", []):
            inv_type = inv.get("Type", "")  # ACCREC = receivable, ACCPAY = payable
            amount = float(inv.get("Total", 0))
            if inv_type == "ACCPAY":
                amount = -amount

            normalised.append({
                "source_id": inv.get("InvoiceID", ""),
                "date": self.parse_date(inv.get("DateString", inv.get("Date", ""))[:10]),
                "amount": amount,
                "description": f"Invoice {inv.get('InvoiceNumber', '')}",
                "category": "revenue" if inv_type == "ACCREC" else "operating_expense",
                "merchant_name": inv.get("Contact", {}).get("Name", ""),
                "raw_data": inv,
            })

        return normalised

    def fetch_balance(self) -> Dict[str, float]:
        data = self._get("Accounts", params={"where": "Class=='ASSET'"})
        return {
            acct["AccountID"]: float(acct.get("ReportingCodeUpdatedDateUTC", 0))
            for acct in data.get("Accounts", [])
            if acct.get("AccountID")
        }
