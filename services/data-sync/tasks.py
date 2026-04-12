"""
Celery tasks for data sync workers.

Task routing:
  sync_transactions   — pull transactions from a connector and upsert to DB
  sync_balances       — update current balances for a bank connection
  sync_all_connectors — fan-out task that enqueues per-connection syncs

Workers are triggered by:
  • SQS messages (from Plaid/other webhooks → events table → worker picks up)
  • Beat schedule (periodic polling — see celery beat config in main.py)
  • Direct task invocation via API
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras
from celery import Task
from celery.utils.log import get_task_logger

from .worker import celery_app
from .connectors import get_connector

logger = get_task_logger(__name__)

# ---------------------------------------------------------------------------
# DB helpers (separate from forecast-engine pool)
# ---------------------------------------------------------------------------

_DB_DSN = (
    f"host={os.getenv('DB_HOST', 'localhost')} "
    f"port={os.getenv('DB_PORT', '5432')} "
    f"dbname={os.getenv('DB_NAME', 'headroom')} "
    f"user={os.getenv('DB_USER', 'postgres')} "
    f"password={os.getenv('DB_PASSWORD', 'postgres')}"
)


def _get_conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(_DB_DSN)


# ---------------------------------------------------------------------------
# Core sync logic
# ---------------------------------------------------------------------------

def _load_connection(connection_id: str, conn) -> Optional[Dict[str, Any]]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM bank_connections WHERE id = %s",
            (connection_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def _upsert_transactions(
    tenant_id: str,
    bank_connection_id: str,
    transactions: List[Dict[str, Any]],
    conn,
) -> int:
    """
    Upsert normalised transactions into the transactions table.
    Returns count of rows inserted/updated.
    """
    if not transactions:
        return 0

    inserted = 0
    with conn.cursor() as cur:
        for txn in transactions:
            cur.execute(
                """
                INSERT INTO transactions
                    (tenant_id, bank_connection_id, date, amount, description,
                     category, counterparty, source_id, raw_data, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (source_id) DO UPDATE
                    SET amount       = EXCLUDED.amount,
                        description  = EXCLUDED.description,
                        category     = EXCLUDED.category,
                        counterparty = EXCLUDED.counterparty,
                        raw_data     = EXCLUDED.raw_data,
                        updated_at   = NOW()
                """,
                (
                    tenant_id,
                    bank_connection_id,
                    txn["date"],
                    txn["amount"],
                    txn.get("description", ""),
                    txn.get("category", "other"),
                    txn.get("merchant_name", ""),
                    txn.get("source_id", ""),
                    json.dumps(txn.get("raw_data", {})),
                ),
            )
            inserted += cur.rowcount
    conn.commit()
    return inserted


def _update_last_sync(connection_id: str, error: Optional[str], conn) -> None:
    with conn.cursor() as cur:
        if error:
            cur.execute(
                """
                UPDATE bank_connections
                SET status = 'error', sync_error = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (error[:500], connection_id),
            )
        else:
            cur.execute(
                """
                UPDATE bank_connections
                SET status = 'connected', last_sync = NOW(),
                    sync_error = NULL, updated_at = NOW()
                WHERE id = %s
                """,
                (connection_id,),
            )
    conn.commit()


def _update_credentials(connection_id: str, credentials: Dict[str, Any], conn) -> None:
    """Persist refreshed OAuth tokens back to bank_connections."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE bank_connections
            SET access_token = %s, refresh_token = %s, metadata = metadata || %s::jsonb,
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                credentials.get("access_token"),
                credentials.get("refresh_token"),
                json.dumps({k: v for k, v in credentials.items()
                            if k not in ("access_token", "refresh_token", "secret", "password")}),
                connection_id,
            ),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Celery tasks
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="data_sync.sync_transactions",
)
def sync_transactions(self: Task, connection_id: str, since_iso: Optional[str] = None) -> Dict[str, Any]:
    """
    Sync transactions for a single bank connection.

    Args:
        connection_id: UUID of the bank_connections row
        since_iso:     ISO datetime string; defaults to last_sync or 90 days ago
    """
    logger.info("sync_transactions: connection_id=%s since=%s", connection_id, since_iso)
    db_conn = _get_conn()
    try:
        bc = _load_connection(connection_id, db_conn)
        if not bc:
            logger.error("bank_connection %s not found", connection_id)
            return {"status": "error", "detail": "connection not found"}

        tenant_id = str(bc["tenant_id"])
        provider = bc["provider"]

        # Determine `since`
        if since_iso:
            since = datetime.fromisoformat(since_iso)
        elif bc.get("last_sync"):
            since = bc["last_sync"]
        else:
            since = datetime.utcnow() - timedelta(days=90)

        # Build credentials dict from bank_connections row
        credentials: Dict[str, Any] = {
            "access_token": bc.get("access_token", ""),
            "refresh_token": bc.get("refresh_token", ""),
            **(bc.get("metadata") or {}),
        }

        connector = get_connector(provider, tenant_id, credentials)

        # Refresh OAuth tokens if needed
        if not connector.validate_credentials():
            logger.info("Refreshing credentials for connection %s", connection_id)
            try:
                credentials = connector.refresh_credentials()
                _update_credentials(connection_id, credentials, db_conn)
            except Exception as exc:
                _update_last_sync(connection_id, f"Token refresh failed: {exc}", db_conn)
                raise self.retry(exc=exc)

        # Fetch & upsert
        try:
            transactions = connector.fetch_transactions(since)
        except Exception as exc:
            logger.error("fetch_transactions failed for %s: %s", connection_id, exc)
            _update_last_sync(connection_id, str(exc), db_conn)
            raise self.retry(exc=exc)

        inserted = _upsert_transactions(tenant_id, connection_id, transactions, db_conn)
        _update_last_sync(connection_id, None, db_conn)

        # Persist updated sync cursor (Plaid) or metadata
        if credentials.get("sync_cursor") != (bc.get("metadata") or {}).get("sync_cursor"):
            _update_credentials(connection_id, credentials, db_conn)

        logger.info(
            "sync_transactions done: connection=%s inserted=%d",
            connection_id, inserted,
        )
        return {"status": "ok", "inserted": inserted, "connection_id": connection_id}

    except Exception as exc:
        if not self.request.retries < self.max_retries:
            _update_last_sync(connection_id, str(exc), db_conn)
        raise
    finally:
        db_conn.close()


@celery_app.task(
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    name="data_sync.sync_balances",
)
def sync_balances(self: Task, connection_id: str) -> Dict[str, Any]:
    """Fetch and store current balances for all accounts under this connection."""
    logger.info("sync_balances: connection_id=%s", connection_id)
    db_conn = _get_conn()
    try:
        bc = _load_connection(connection_id, db_conn)
        if not bc:
            return {"status": "error", "detail": "connection not found"}

        credentials = {
            "access_token": bc.get("access_token", ""),
            "refresh_token": bc.get("refresh_token", ""),
            **(bc.get("metadata") or {}),
        }
        connector = get_connector(bc["provider"], str(bc["tenant_id"]), credentials)

        try:
            balances = connector.fetch_balance()
        except Exception as exc:
            raise self.retry(exc=exc)

        # Store balances in metadata field of bank_connections
        with db_conn.cursor() as cur:
            cur.execute(
                """
                UPDATE bank_connections
                SET metadata = metadata || %s::jsonb, updated_at = NOW()
                WHERE id = %s
                """,
                (json.dumps({"balances": balances, "balances_at": datetime.utcnow().isoformat()}),
                 connection_id),
            )
        db_conn.commit()

        return {"status": "ok", "balances": balances, "connection_id": connection_id}
    finally:
        db_conn.close()


@celery_app.task(name="data_sync.sync_all_connectors")
def sync_all_connectors() -> Dict[str, Any]:
    """
    Scheduled fan-out task: enqueue sync_transactions for every active
    bank connection that is due for refresh.
    Called by Celery Beat every 4 hours (see beat_schedule in worker.py).
    """
    logger.info("sync_all_connectors: enqueuing per-connection syncs")
    db_conn = _get_conn()
    enqueued = 0
    try:
        with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, provider, last_sync
                FROM bank_connections
                WHERE status = 'connected'
                ORDER BY last_sync ASC NULLS FIRST
                """
            )
            connections = [dict(r) for r in cur.fetchall()]

        for bc in connections:
            connection_id = str(bc["id"])
            provider = bc["provider"]
            last_sync = bc.get("last_sync")

            # Per-provider sync interval (hours)
            sync_intervals = {
                "plaid": 4,
                "quickbooks": 2,
                "xero": 2,
                "zoho": 2,
                "tally": 4,
                "merge_dev": 4,
                "csv": None,  # manual only
            }
            interval_hours = sync_intervals.get(provider)
            if interval_hours is None:
                continue

            if last_sync:
                hours_since = (datetime.utcnow() - last_sync).total_seconds() / 3600
                if hours_since < interval_hours:
                    continue

            sync_transactions.delay(connection_id)
            enqueued += 1

        logger.info("sync_all_connectors: enqueued %d tasks", enqueued)
        return {"enqueued": enqueued}
    finally:
        db_conn.close()


@celery_app.task(name="data_sync.process_event_queue")
def process_event_queue() -> Dict[str, Any]:
    """
    Poll the events table for unprocessed sync events published by the
    forecast-engine webhook handler (e.g. plaid.transactions.sync).
    Runs every 30 seconds via Celery Beat.
    """
    db_conn = _get_conn()
    processed = 0
    try:
        with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, event_type, payload
                FROM events
                WHERE processed = FALSE
                  AND event_type LIKE '%.sync'
                ORDER BY created_at ASC
                LIMIT 50
                FOR UPDATE SKIP LOCKED
                """
            )
            events = [dict(r) for r in cur.fetchall()]

        for event in events:
            event_id = str(event["id"])
            payload = event["payload"] if isinstance(event["payload"], dict) else json.loads(event["payload"])

            try:
                if event["event_type"] == "plaid.transactions.sync":
                    item_id = payload.get("item_id")
                    # Resolve connection_id from item_id
                    with db_conn.cursor() as cur:
                        cur.execute(
                            "SELECT id FROM bank_connections WHERE metadata->>'plaid_item_id' = %s LIMIT 1",
                            (item_id,),
                        )
                        row = cur.fetchone()
                    if row:
                        sync_transactions.delay(str(row[0]))
                        processed += 1

                # Mark as processed
                with db_conn.cursor() as cur:
                    cur.execute(
                        "UPDATE events SET processed = TRUE, processed_at = NOW() WHERE id = %s",
                        (event_id,),
                    )
                db_conn.commit()

            except Exception as exc:
                logger.error("Failed to process event %s: %s", event_id, exc)
                with db_conn.cursor() as cur:
                    cur.execute(
                        "UPDATE events SET error_message = %s WHERE id = %s",
                        (str(exc)[:500], event_id),
                    )
                db_conn.commit()

        return {"processed": processed}
    finally:
        db_conn.close()
