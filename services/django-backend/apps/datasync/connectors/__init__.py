from .base import BaseConnector
from .plaid import PlaidConnector

CONNECTOR_MAP = {
    "plaid": PlaidConnector,
}

__all__ = ["BaseConnector", "PlaidConnector", "CONNECTOR_MAP"]
