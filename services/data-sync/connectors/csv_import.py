"""
CSV import connector — file upload, immediate processing.
Accepts any transaction format via an auto-detecting parser.

Column detection priority (case-insensitive, partial match):
  date      : date, txn_date, transaction_date, posted_date, value_date
  amount    : amount, debit/credit split, net_amount, transaction_amount
  description: description, memo, narration, details, particulars, remarks
  category  : category, type, account, ledger
  merchant  : merchant, vendor, payee, counterparty, name
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from .base import SyncConnector

logger = logging.getLogger(__name__)

# Column name aliases — first match wins
_DATE_ALIASES = {"date", "txn_date", "transaction_date", "posted_date", "value_date", "posting_date"}
_DEBIT_ALIASES = {"debit", "debit_amount", "withdrawal", "expense"}
_CREDIT_ALIASES = {"credit", "credit_amount", "deposit", "income"}
_AMOUNT_ALIASES = {"amount", "net_amount", "transaction_amount", "value"}
_DESC_ALIASES = {"description", "memo", "narration", "details", "particulars", "remarks", "reference"}
_CAT_ALIASES = {"category", "type", "account", "ledger", "account_name"}
_MERCHANT_ALIASES = {"merchant", "vendor", "payee", "counterparty", "name", "merchant_name", "party"}


def _match(header: str, aliases: set) -> bool:
    return header.strip().lower().replace(" ", "_") in aliases


def _detect_columns(headers: List[str]) -> Dict[str, Optional[int]]:
    mapping: Dict[str, Optional[int]] = {
        "date": None, "amount": None,
        "debit": None, "credit": None,
        "description": None, "category": None, "merchant": None,
    }
    for i, h in enumerate(headers):
        if mapping["date"] is None and _match(h, _DATE_ALIASES):
            mapping["date"] = i
        elif mapping["debit"] is None and _match(h, _DEBIT_ALIASES):
            mapping["debit"] = i
        elif mapping["credit"] is None and _match(h, _CREDIT_ALIASES):
            mapping["credit"] = i
        elif mapping["amount"] is None and _match(h, _AMOUNT_ALIASES):
            mapping["amount"] = i
        elif mapping["description"] is None and _match(h, _DESC_ALIASES):
            mapping["description"] = i
        elif mapping["category"] is None and _match(h, _CAT_ALIASES):
            mapping["category"] = i
        elif mapping["merchant"] is None and _match(h, _MERCHANT_ALIASES):
            mapping["merchant"] = i
    return mapping


def _parse_amount(value: str) -> Optional[float]:
    """Parse amount string handling parenthetical negatives and currency symbols."""
    if not value:
        return None
    clean = value.replace(",", "").replace("$", "").replace("£", "").replace("€", "").strip()
    negative = clean.startswith("(") and clean.endswith(")")
    clean = clean.strip("()")
    try:
        amount = float(clean)
        return -amount if negative else amount
    except ValueError:
        return None


def _parse_date(value: str) -> Optional[str]:
    formats = [
        "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y",
        "%d %b %Y", "%d %B %Y", "%Y/%m/%d",
    ]
    clean = value.strip()
    for fmt in formats:
        try:
            return datetime.strptime(clean, fmt).date().isoformat()
        except ValueError:
            continue
    return None


class CSVImportConnector(SyncConnector):
    """
    CSV import connector.
    Credentials expected:
      csv_content: str  (raw CSV text, passed directly after upload)
      filename: str     (original filename, informational only)
    """

    provider = "csv"

    def __init__(self, tenant_id: str, credentials: Dict[str, Any]):
        super().__init__(tenant_id, credentials)
        self._csv_content: str = credentials.get("csv_content", "")
        self._filename: str = credentials.get("filename", "upload.csv")

    # fetch_accounts is not meaningful for CSV; return a synthetic entry
    def fetch_accounts(self) -> List[Dict[str, Any]]:
        return [{
            "account_id": f"csv_{self.tenant_id}",
            "account_name": f"CSV Import ({self._filename})",
            "account_type": "manual",
            "currency": "USD",
        }]

    def fetch_transactions(self, since: datetime) -> List[Dict[str, Any]]:
        if not self._csv_content:
            logger.warning("CSVImportConnector: no content provided")
            return []

        reader = csv.reader(io.StringIO(self._csv_content))
        rows = list(reader)
        if not rows:
            return []

        headers = rows[0]
        col = _detect_columns(headers)

        if col["date"] is None:
            logger.error("CSV missing date column (headers: %s)", headers)
            return []

        if col["amount"] is None and col["debit"] is None and col["credit"] is None:
            logger.error("CSV missing amount/debit/credit column (headers: %s)", headers)
            return []

        normalised: List[Dict[str, Any]] = []
        since_date = since.date().isoformat()

        for i, row in enumerate(rows[1:], start=2):
            if not row or all(c.strip() == "" for c in row):
                continue

            def cell(idx: Optional[int]) -> str:
                return row[idx].strip() if idx is not None and idx < len(row) else ""

            raw_date = cell(col["date"])
            parsed_date = _parse_date(raw_date)
            if not parsed_date:
                logger.debug("Row %d: unparseable date '%s', skipping", i, raw_date)
                continue
            if parsed_date < since_date:
                continue

            # Amount resolution: prefer dedicated amount column, else debit/credit split
            amount: Optional[float] = None
            if col["amount"] is not None:
                amount = _parse_amount(cell(col["amount"]))
            if amount is None:
                debit = _parse_amount(cell(col["debit"])) or 0.0
                credit = _parse_amount(cell(col["credit"])) or 0.0
                if debit or credit:
                    amount = credit - debit  # credit = inflow, debit = outflow
            if amount is None:
                continue

            description = cell(col["description"]) or ""
            category = self.normalise_category(cell(col["category"]))
            merchant = cell(col["merchant"]) or description[:60]

            normalised.append({
                "source_id": f"csv_{self._filename}_{i}",
                "date": parsed_date,
                "amount": amount,
                "description": description,
                "category": category,
                "merchant_name": merchant,
                "raw_data": dict(zip(headers, row)),
            })

        logger.info(
            "CSVImportConnector: parsed %d transactions from %s",
            len(normalised),
            self._filename,
        )
        return normalised

    def fetch_balance(self) -> Dict[str, float]:
        """CSV uploads don't carry live balance data; return empty."""
        return {}
