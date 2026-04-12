"""
Plaid webhook receiver — FastAPI endpoint.

Verification: HMAC-SHA256 over raw request body using PLAID_WEBHOOK_SECRET.
On receipt of TRANSACTIONS/DEFAULT_UPDATE or INITIAL_UPDATE:
  • Enqueues a sync_transactions Celery task
On ITEM/ERROR:
  • Marks the bank_connection as error and surfaces an alert
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

PLAID_WEBHOOK_SECRET = os.getenv("PLAID_WEBHOOK_SECRET", "")


def _verify_signature(headers: Dict[str, str], raw_body: bytes) -> None:
    """
    Verify Plaid HMAC-SHA256 webhook signature.
    Raises HTTP 401 if the signature is missing or does not match.
    """
    if not PLAID_WEBHOOK_SECRET:
        logger.warning("PLAID_WEBHOOK_SECRET not set — skipping webhook signature verification")
        return

    provided_sig = headers.get("plaid-verification", "")
    if not provided_sig:
        raise HTTPException(status_code=401, detail="Missing plaid-verification header")

    expected = hmac.new(
        PLAID_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(provided_sig, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")


@router.post("/plaid")
async def plaid_webhook(request: Request):
    """
    Plaid webhook handler.

    Supported events:
      TRANSACTIONS / DEFAULT_UPDATE   → enqueue sync_transactions
      TRANSACTIONS / INITIAL_UPDATE   → enqueue sync_transactions
      ITEM / ERROR                    → mark connection as errored, raise alert
    """
    raw_body = await request.body()
    _verify_signature(dict(request.headers), raw_body)

    try:
        payload: Dict[str, Any] = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    webhook_type = payload.get("webhook_type", "")
    webhook_code = payload.get("webhook_code", "")
    item_id = payload.get("item_id", "")

    logger.info(
        "Plaid webhook received: type=%s code=%s item_id=%s",
        webhook_type, webhook_code, item_id,
    )

    if webhook_type == "TRANSACTIONS":
        if webhook_code in ("DEFAULT_UPDATE", "INITIAL_UPDATE"):
            await _handle_transactions_update(item_id, payload)

    elif webhook_type == "ITEM":
        if webhook_code == "ERROR":
            await _handle_item_error(item_id, payload)
        elif webhook_code == "PENDING_EXPIRATION":
            await _handle_pending_expiration(item_id)

    return {"received": True}


# ---------------------------------------------------------------------------
# Internal handlers
# ---------------------------------------------------------------------------

async def _handle_transactions_update(item_id: str, payload: Dict[str, Any]) -> None:
    """
    Resolve item_id → connection_id and enqueue a sync task.
    Publishes to the events table so the worker can pick it up,
    decoupling the webhook from the Celery task queue.
    """
    import psycopg2

    db_dsn = (
        f"host={os.getenv('DB_HOST', 'localhost')} "
        f"port={os.getenv('DB_PORT', '5432')} "
        f"dbname={os.getenv('DB_NAME', 'headroom')} "
        f"user={os.getenv('DB_USER', 'postgres')} "
        f"password={os.getenv('DB_PASSWORD', 'postgres')}"
    )
    conn = psycopg2.connect(db_dsn)
    try:
        with conn.cursor() as cur:
            # Look up the tenant from the Plaid item ID stored in metadata
            cur.execute(
                """
                SELECT id, tenant_id FROM bank_connections
                WHERE metadata->>'plaid_item_id' = %s
                LIMIT 1
                """,
                (item_id,),
            )
            row = cur.fetchone()

        if not row:
            logger.warning("No bank_connection found for item_id=%s", item_id)
            return

        connection_id, tenant_id = str(row[0]), str(row[1])

        # Publish event → process_event_queue task will pick this up
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO events (tenant_id, event_type, payload)
                VALUES (%s, 'plaid.transactions.sync', %s)
                """,
                (tenant_id, json.dumps({"item_id": item_id, "connection_id": connection_id, **payload})),
            )
        conn.commit()
        logger.info(
            "Queued transaction sync for connection=%s tenant=%s",
            connection_id, tenant_id,
        )

        # Also directly enqueue (belt-and-suspenders for low-latency path)
        from data_sync.tasks import sync_transactions  # local import avoids circular on startup
        sync_transactions.delay(connection_id)

    finally:
        conn.close()


async def _handle_item_error(item_id: str, payload: Dict[str, Any]) -> None:
    """Mark the connection as errored and surface an alert to the tenant."""
    import psycopg2

    error_detail = payload.get("error", {})
    error_msg = error_detail.get("error_message", "Plaid item error — reconnection required")

    db_dsn = (
        f"host={os.getenv('DB_HOST', 'localhost')} "
        f"port={os.getenv('DB_PORT', '5432')} "
        f"dbname={os.getenv('DB_NAME', 'headroom')} "
        f"user={os.getenv('DB_USER', 'postgres')} "
        f"password={os.getenv('DB_PASSWORD', 'postgres')}"
    )
    conn = psycopg2.connect(db_dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE bank_connections
                SET status = 'error', sync_error = %s, updated_at = NOW()
                WHERE metadata->>'plaid_item_id' = %s
                """,
                (error_msg[:500], item_id),
            )
            cur.execute(
                """
                INSERT INTO alerts (tenant_id, alert_type, severity, message)
                SELECT tenant_id, 'reconnection_required', 'high',
                       'Bank connection requires re-authentication. Please reconnect.'
                FROM bank_connections
                WHERE metadata->>'plaid_item_id' = %s
                LIMIT 1
                """,
                (item_id,),
            )
        conn.commit()
        logger.warning("Marked Plaid item %s as errored: %s", item_id, error_msg)
    finally:
        conn.close()


async def _handle_pending_expiration(item_id: str) -> None:
    """Surface a warning alert before the access token expires."""
    import psycopg2

    db_dsn = (
        f"host={os.getenv('DB_HOST', 'localhost')} "
        f"port={os.getenv('DB_PORT', '5432')} "
        f"dbname={os.getenv('DB_NAME', 'headroom')} "
        f"user={os.getenv('DB_USER', 'postgres')} "
        f"password={os.getenv('DB_PASSWORD', 'postgres')}"
    )
    conn = psycopg2.connect(db_dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO alerts (tenant_id, alert_type, severity, message)
                SELECT tenant_id, 'token_expiring', 'medium',
                       'Bank connection access will expire soon. Please re-authenticate.'
                FROM bank_connections
                WHERE metadata->>'plaid_item_id' = %s
                LIMIT 1
                """,
                (item_id,),
            )
        conn.commit()
    finally:
        conn.close()
