from .base import SyncConnector
from .plaid import PlaidConnector
from .quickbooks import QuickBooksConnector
from .xero import XeroConnector
from .zoho import ZohoConnector
from .tally import TallyConnector
from .merge_dev import MergeDevConnector
from .csv_import import CSVImportConnector

CONNECTOR_MAP = {
    "plaid": PlaidConnector,
    "quickbooks": QuickBooksConnector,
    "xero": XeroConnector,
    "zoho": ZohoConnector,
    "tally": TallyConnector,
    "merge_dev": MergeDevConnector,
    "csv": CSVImportConnector,
}


def get_connector(provider: str, tenant_id: str, credentials: dict) -> SyncConnector:
    cls = CONNECTOR_MAP.get(provider)
    if not cls:
        raise ValueError(f"Unknown provider: {provider!r}. Available: {list(CONNECTOR_MAP)}")
    return cls(tenant_id, credentials)


__all__ = [
    "SyncConnector",
    "PlaidConnector",
    "QuickBooksConnector",
    "XeroConnector",
    "ZohoConnector",
    "TallyConnector",
    "MergeDevConnector",
    "CSVImportConnector",
    "CONNECTOR_MAP",
    "get_connector",
]
