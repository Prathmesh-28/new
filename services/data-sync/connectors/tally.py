"""
Tally ERP connector — TDL connector (local), 4-hour scheduled pull.
Fetches: trial balance, ledger, vouchers via XML.

Tally exposes a local HTTP server (default port 9000) that accepts
TDL (Tally Definition Language) XML requests and returns XML responses.
The connector polls this endpoint from a sync agent running in the customer's
network (or via an on-prem proxy that forwards to our service).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List
from xml.etree import ElementTree as ET

import httpx

from .base import SyncConnector

logger = logging.getLogger(__name__)

# TDL request templates
_VOUCHER_REQUEST = """\
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Voucher Register</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>{from_date}</SVFROMDATE>
        <SVTODATE>{to_date}</SVTODATE>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>
"""

_TRIAL_BALANCE_REQUEST = """\
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Trial Balance</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>{from_date}</SVFROMDATE>
        <SVTODATE>{to_date}</SVTODATE>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>
"""


def _parse_tally_amount(value: str) -> float:
    """Parse Tally amount string like '12,345.00 Dr' or '-5,000.00 Cr'."""
    if not value:
        return 0.0
    clean = value.replace(",", "").strip()
    suffix = ""
    for s in ("Dr", "Cr"):
        if clean.endswith(s):
            suffix = s
            clean = clean[: -len(s)].strip()
            break
    try:
        amount = float(clean)
    except ValueError:
        return 0.0
    # Debit = outflow (negative), Credit = inflow (positive)
    return amount if suffix == "Cr" else -amount


class TallyConnector(SyncConnector):
    """
    Tally ERP connector via local TDL HTTP gateway.
    Credentials expected:
      host (default 127.0.0.1), port (default 9000), company_name
    """

    provider = "tally"

    def __init__(self, tenant_id: str, credentials: Dict[str, Any]):
        super().__init__(tenant_id, credentials)
        host = credentials.get("host", "127.0.0.1")
        port = credentials.get("port", 9000)
        self._base_url = f"http://{host}:{port}"
        self._company = credentials.get("company_name", "")

    def _post_tdl(self, xml_body: str) -> ET.Element:
        resp = httpx.post(
            self._base_url,
            content=xml_body.encode("utf-8"),
            headers={"Content-Type": "application/xml"},
            timeout=60,
        )
        resp.raise_for_status()
        return ET.fromstring(resp.content)

    # ------------------------------------------------------------------
    # Interface implementation
    # ------------------------------------------------------------------

    def fetch_accounts(self) -> List[Dict[str, Any]]:
        """Return ledger accounts from trial balance."""
        today = datetime.today()
        xml_req = _TRIAL_BALANCE_REQUEST.format(
            from_date=f"1-Apr-{today.year - 1}",
            to_date=today.strftime("%-d-%b-%Y"),
        )
        root = self._post_tdl(xml_req)
        accounts: List[Dict[str, Any]] = []
        for ledger in root.iter("LEDGER"):
            name = ledger.findtext("NAME", "")
            if not name:
                continue
            accounts.append({
                "account_id": name,
                "account_name": name,
                "account_type": ledger.findtext("PARENT", ""),
                "currency": "INR",
            })
        return accounts

    def fetch_transactions(self, since: datetime) -> List[Dict[str, Any]]:
        from_date_str = since.strftime("%-d-%b-%Y")
        to_date_str = datetime.today().strftime("%-d-%b-%Y")
        xml_req = _VOUCHER_REQUEST.format(from_date=from_date_str, to_date=to_date_str)
        root = self._post_tdl(xml_req)

        normalised: List[Dict[str, Any]] = []
        for voucher in root.iter("VOUCHER"):
            vch_date_str = voucher.findtext("DATE", "")
            if not vch_date_str:
                continue
            try:
                vch_date = datetime.strptime(vch_date_str, "%Y%m%d").date().isoformat()
            except ValueError:
                continue

            vch_no = voucher.findtext("VOUCHERNUMBER", "")
            narration = voucher.findtext("NARRATION", "")
            vch_type = voucher.findtext("VOUCHERTYPENAME", "")

            for entry in voucher.iter("ALLLEDGERENTRIES.LIST"):
                ledger_name = entry.findtext("LEDGERNAME", "")
                amount_str = entry.findtext("AMOUNT", "0")
                amount = _parse_tally_amount(amount_str)
                normalised.append({
                    "source_id": f"tally_{vch_no}_{ledger_name}",
                    "date": vch_date,
                    "amount": amount,
                    "description": narration or vch_type,
                    "category": self.normalise_category(vch_type),
                    "merchant_name": ledger_name,
                    "raw_data": {
                        "voucher_number": vch_no,
                        "voucher_type": vch_type,
                        "ledger": ledger_name,
                        "amount_raw": amount_str,
                    },
                })

        return normalised

    def fetch_balance(self) -> Dict[str, float]:
        """Return current closing balance per ledger from trial balance."""
        today = datetime.today()
        xml_req = _TRIAL_BALANCE_REQUEST.format(
            from_date=f"1-Apr-{today.year - 1}",
            to_date=today.strftime("%-d-%b-%Y"),
        )
        root = self._post_tdl(xml_req)
        balances: Dict[str, float] = {}
        for ledger in root.iter("LEDGER"):
            name = ledger.findtext("NAME", "")
            closing = ledger.findtext("CLOSINGBALANCE", "0")
            if name:
                balances[name] = _parse_tally_amount(closing)
        return balances
