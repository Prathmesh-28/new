"""
SyncConnector — abstract base interface for all data source connectors.

Every connector must implement:
  fetch_accounts()              → list of normalised account dicts
  fetch_transactions(since)     → list of normalised transaction dicts
  fetch_balance()               → dict {account_id: balance}

Common normalised transaction schema:
  {
    "source_id":      str,       # external transaction ID
    "date":           str,       # ISO 8601 date
    "amount":         float,     # positive = credit, negative = debit
    "description":    str,
    "category":       str,       # maps to transaction_category enum
    "merchant_name":  str,
    "raw_data":       dict,      # original payload
  }
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class SyncConnector(ABC):
    """Abstract base class that every data-source connector must implement."""

    provider: str = "unknown"

    def __init__(self, tenant_id: str, credentials: Dict[str, Any]):
        self.tenant_id = tenant_id
        self.credentials = credentials

    # ------------------------------------------------------------------
    # Required interface
    # ------------------------------------------------------------------

    @abstractmethod
    def fetch_accounts(self) -> List[Dict[str, Any]]:
        """
        Return a list of accounts associated with this connection.

        Each dict must contain at minimum:
          account_id, account_name, account_type, currency
        """
        ...

    @abstractmethod
    def fetch_transactions(self, since: datetime) -> List[Dict[str, Any]]:
        """
        Return transactions created or modified since `since`.

        Returns normalised transaction dicts (see module docstring).
        """
        ...

    @abstractmethod
    def fetch_balance(self) -> Dict[str, float]:
        """
        Return current balances keyed by account_id.
          {account_id: balance_float}
        """
        ...

    # ------------------------------------------------------------------
    # Optional helpers with default no-op implementations
    # ------------------------------------------------------------------

    def validate_credentials(self) -> bool:
        """Subclasses may override to check token validity before syncing."""
        return True

    def refresh_credentials(self) -> Dict[str, Any]:
        """Subclasses may override to implement OAuth token refresh."""
        return self.credentials

    # ------------------------------------------------------------------
    # Normalisation helpers (shared across connectors)
    # ------------------------------------------------------------------

    @staticmethod
    def normalise_category(raw_category: str) -> str:
        """Map provider-specific category strings to Headroom's enum."""
        mapping = {
            # revenue
            "payment": "revenue",
            "invoice payment": "revenue",
            "sales": "revenue",
            "revenue": "revenue",
            # payroll
            "payroll": "payroll",
            "salary": "payroll",
            "wages": "payroll",
            # operating expenses
            "expense": "operating_expense",
            "bill": "operating_expense",
            "software": "operating_expense",
            "utilities": "operating_expense",
            "marketing": "operating_expense",
            "rent": "operating_expense",
            # capital
            "asset": "capital_expense",
            "equipment": "capital_expense",
            # loan / tax / transfer
            "loan": "loan_payment",
            "tax": "tax",
            "transfer": "transfer",
        }
        lower = (raw_category or "").lower()
        for k, v in mapping.items():
            if k in lower:
                return v
        return "other"

    @staticmethod
    def parse_date(value: Any) -> str:
        """Return ISO date string from a date/datetime/string value."""
        if isinstance(value, datetime):
            return value.date().isoformat()
        if hasattr(value, "isoformat"):  # date
            return value.isoformat()
        return str(value)[:10]
