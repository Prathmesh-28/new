from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class BaseConnector(ABC):
    """Base class for all data-source connectors."""

    provider: str = "base"

    def __init__(self, connection):
        """
        :param connection: BankConnection Django model instance
        """
        self.connection = connection
        self.tenant = connection.tenant

    @abstractmethod
    def fetch_transactions(self, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Fetch raw transactions from the provider since `since`."""

    @abstractmethod
    def fetch_balance(self) -> Dict[str, Any]:
        """Return current account balance info."""

    def normalize_transaction(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map provider-specific fields to Headroom's Transaction model fields.
        Override in subclasses for provider-specific mapping.
        """
        return {
            "date": raw.get("date"),
            "amount": raw.get("amount"),
            "description": raw.get("description", ""),
            "category": raw.get("category", "other"),
            "counterparty": raw.get("counterparty", ""),
            "is_recurring": raw.get("is_recurring", False),
            "frequency": raw.get("frequency"),
            "source_id": raw.get("source_id") or raw.get("id"),
            "raw_data": raw,
        }

    def upsert_transactions(self, transactions: List[Dict[str, Any]]) -> int:
        """Persist normalized transactions using Django ORM upsert."""
        from apps.core.models import Transaction
        saved = 0
        for txn in transactions:
            normalized = self.normalize_transaction(txn)
            source_id = normalized.pop("source_id", None)
            if source_id:
                _, created = Transaction.objects.update_or_create(
                    source_id=source_id,
                    defaults={**normalized, "tenant": self.tenant, "bank_connection": self.connection},
                )
            else:
                Transaction.objects.create(
                    **normalized, tenant=self.tenant, bank_connection=self.connection
                )
                created = True
            if created:
                saved += 1
        return saved
