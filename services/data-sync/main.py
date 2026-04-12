"""
Data Sync Service — FastAPI entry-point.

Exposes:
  POST /sync/{connection_id}         — manually trigger a sync for one connection
  POST /sync/{connection_id}/balance — fetch current balance
  GET  /sync/{connection_id}/status  — connection sync status
  POST /webhooks/plaid               — Plaid webhook receiver

The Celery worker (worker.py) runs independently alongside this FastAPI app.
Start both with:
  uvicorn main:app --port 8010
  celery -A data_sync.worker worker --loglevel=info -Q headroom-data-sync
  celery -A data_sync.worker beat  --loglevel=info   (for scheduled tasks)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .webhooks import plaid_router
from .tasks import sync_transactions, sync_balances, sync_all_connectors
from .connectors import CONNECTOR_MAP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_DB_DSN = (
    f"host={os.getenv('DB_HOST', 'localhost')} "
    f"port={os.getenv('DB_PORT', '5432')} "
    f"dbname={os.getenv('DB_NAME', 'headroom')} "
    f"user={os.getenv('DB_USER', 'postgres')} "
    f"password={os.getenv('DB_PASSWORD', 'postgres')}"
)

app = FastAPI(
    title="Headroom Data Sync Service",
    description="Connector workers for Plaid, QuickBooks, Xero, Zoho, Tally, Merge.dev, CSV",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register webhook routes
app.include_router(plaid_router)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class SyncTriggerResponse(BaseModel):
    message: str
    connection_id: str
    task_id: Optional[str] = None


class ConnectionStatus(BaseModel):
    connection_id: str
    provider: str
    status: str
    last_sync: Optional[str]
    sync_error: Optional[str]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "data-sync", "version": "1.0.0",
            "providers": list(CONNECTOR_MAP.keys())}


@app.post("/sync/{connection_id}", response_model=SyncTriggerResponse)
async def trigger_sync(connection_id: str, since: Optional[str] = None):
    """
    Manually trigger a transaction sync for a single bank connection.
    `since` is an optional ISO datetime string; defaults to last_sync.
    """
    task = sync_transactions.delay(connection_id, since)
    return SyncTriggerResponse(
        message="Sync task enqueued",
        connection_id=connection_id,
        task_id=task.id,
    )


@app.post("/sync/{connection_id}/balance", response_model=SyncTriggerResponse)
async def trigger_balance_sync(connection_id: str):
    """Trigger a balance refresh for a bank connection."""
    task = sync_balances.delay(connection_id)
    return SyncTriggerResponse(
        message="Balance sync task enqueued",
        connection_id=connection_id,
        task_id=task.id,
    )


@app.get("/sync/{connection_id}/status", response_model=ConnectionStatus)
async def get_sync_status(connection_id: str):
    conn = psycopg2.connect(_DB_DSN)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, provider, status, last_sync, sync_error FROM bank_connections WHERE id = %s",
                (connection_id,),
            )
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Connection not found")
        r = dict(row)
        return ConnectionStatus(
            connection_id=str(r["id"]),
            provider=r["provider"],
            status=r["status"],
            last_sync=r["last_sync"].isoformat() if r.get("last_sync") else None,
            sync_error=r.get("sync_error"),
        )
    finally:
        conn.close()


@app.post("/sync/all")
async def trigger_all_syncs():
    """Fan-out: enqueue syncs for all due connections."""
    task = sync_all_connectors.delay()
    return {"message": "All-connector sync enqueued", "task_id": task.id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8010, reload=True)
