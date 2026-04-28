import logging
from datetime import datetime
from typing import Optional

from celery import shared_task
from django.utils import timezone

from .connectors import CONNECTOR_MAP

logger = logging.getLogger(__name__)


def _get_connector(connection_id: str):
    from apps.core.models import BankConnection
    conn = BankConnection.objects.get(pk=connection_id)
    cls = CONNECTOR_MAP.get(conn.provider)
    if not cls:
        raise ValueError(f"No connector for provider: {conn.provider}")
    return cls(conn), conn


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_transactions(self, connection_id: str, since: Optional[str] = None):
    """Fetch and upsert transactions for a bank connection."""
    from apps.core.models import BankConnection
    try:
        connector, conn = _get_connector(connection_id)
        since_dt = datetime.fromisoformat(since) if since else conn.last_sync
        transactions = connector.fetch_transactions(since=since_dt)
        saved = connector.upsert_transactions(transactions)

        conn.last_sync = timezone.now()
        conn.sync_error = None
        conn.status = BankConnection.Status.CONNECTED
        conn.save(update_fields=["last_sync", "sync_error", "status"])

        logger.info("sync_transactions: connection=%s saved=%d", connection_id, saved)
        return {"connection_id": connection_id, "saved": saved}
    except Exception as exc:
        from apps.core.models import BankConnection
        try:
            BankConnection.objects.filter(pk=connection_id).update(
                sync_error=str(exc)[:500],
                status=BankConnection.Status.ERROR,
            )
        except Exception:
            pass
        logger.exception("sync_transactions failed for connection %s: %s", connection_id, exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_balances(self, connection_id: str):
    """Refresh balance for a bank connection."""
    try:
        connector, conn = _get_connector(connection_id)
        balance = connector.fetch_balance()
        conn.metadata = {**conn.metadata, "balance": balance}
        conn.last_sync = timezone.now()
        conn.save(update_fields=["metadata", "last_sync"])
        return {"connection_id": connection_id, "balance": balance}
    except Exception as exc:
        logger.exception("sync_balances failed for connection %s: %s", connection_id, exc)
        raise self.retry(exc=exc)


@shared_task
def sync_all_connectors():
    """Fan-out: enqueue sync for all due bank connections."""
    from apps.core.models import BankConnection
    from django.utils import timezone
    from datetime import timedelta

    due = BankConnection.objects.filter(
        status__in=[BankConnection.Status.CONNECTED, BankConnection.Status.PENDING]
    ).exclude(
        last_sync__gte=timezone.now() - timedelta(hours=6)
    )
    count = 0
    for conn in due:
        sync_transactions.delay(str(conn.id))
        count += 1
    logger.info("sync_all_connectors: enqueued %d syncs", count)
    return {"enqueued": count}
