"""
Alert Engine Service — FastAPI entry-point.

Called:
  • Automatically after every forecast recalculation (via events table poll)
  • Via POST /alerts/evaluate/{tenant_id} for on-demand evaluation
  • Via GET  /alerts/{tenant_id} to fetch unread in-app alerts

Runs as a lightweight FastAPI app alongside a background poller that watches
the events table for `forecast.completed` events and triggers evaluation.
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .engine import AlertEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_DB_DSN = (
    f"host={os.getenv('DB_HOST', 'localhost')} "
    f"port={os.getenv('DB_PORT', '5432')} "
    f"dbname={os.getenv('DB_NAME', 'headroom')} "
    f"user={os.getenv('DB_USER', 'postgres')} "
    f"password={os.getenv('DB_PASSWORD', 'postgres')}"
)

_poller_task: Optional[asyncio.Task] = None


async def _poll_forecast_events():
    """
    Background loop — polls the events table every 30 seconds for
    `forecast.completed` events and triggers alert evaluation.
    """
    logger.info("Alert engine event poller started")
    while True:
        try:
            conn = psycopg2.connect(_DB_DSN)
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute(
                        """
                        SELECT id, tenant_id, payload
                        FROM events
                        WHERE event_type = 'forecast.completed'
                          AND processed = FALSE
                        ORDER BY created_at ASC
                        LIMIT 20
                        FOR UPDATE SKIP LOCKED
                        """
                    )
                    events = [dict(r) for r in cur.fetchall()]

                for event in events:
                    tenant_id = str(event["tenant_id"])
                    try:
                        engine = AlertEngine(conn)
                        engine.evaluate(tenant_id)
                    except Exception as exc:
                        logger.error("Alert eval failed for tenant %s: %s", tenant_id, exc)
                    finally:
                        with conn.cursor() as cur:
                            cur.execute(
                                "UPDATE events SET processed = TRUE, processed_at = NOW() WHERE id = %s",
                                (str(event["id"]),),
                            )
                        conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            logger.error("Poller error: %s", exc)

        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _poller_task
    _poller_task = asyncio.create_task(_poll_forecast_events())
    logger.info("Alert engine started")
    yield
    if _poller_task:
        _poller_task.cancel()
    logger.info("Alert engine stopped")


app = FastAPI(
    title="Headroom Alert Engine",
    description="Rule-based alert evaluation on forecast datapoints",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AlertOut(BaseModel):
    id: str
    tenant_id: str
    alert_type: str
    severity: str
    message: str
    is_read: bool
    created_at: str


class EvaluateResponse(BaseModel):
    tenant_id: str
    alerts_fired: int
    alerts: List[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "alert-engine", "version": "1.0.0"}


@app.post("/alerts/evaluate/{tenant_id}", response_model=EvaluateResponse)
async def evaluate_alerts(tenant_id: str):
    """
    Trigger immediate alert evaluation for a tenant.
    Idempotent — cooldown logic prevents duplicate alerts.
    """
    conn = psycopg2.connect(_DB_DSN)
    try:
        engine = AlertEngine(conn)
        fired = engine.evaluate(tenant_id)
        return EvaluateResponse(
            tenant_id=tenant_id,
            alerts_fired=len(fired),
            alerts=fired,
        )
    except Exception as exc:
        logger.exception("evaluate_alerts failed for tenant %s: %s", tenant_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()


@app.get("/alerts/{tenant_id}", response_model=List[AlertOut])
async def get_alerts(tenant_id: str, unread_only: bool = False, limit: int = 50):
    """Return in-app alerts for a tenant, newest first."""
    conn = psycopg2.connect(_DB_DSN)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            base_q = """
                SELECT id, tenant_id, alert_type, severity, message, is_read, created_at
                FROM alerts
                WHERE tenant_id = %s
            """
            params: list = [tenant_id]
            if unread_only:
                base_q += " AND is_read = FALSE"
            base_q += " ORDER BY created_at DESC LIMIT %s"
            params.append(limit)
            cur.execute(base_q, params)
            rows = cur.fetchall()
        return [
            AlertOut(
                id=str(r["id"]),
                tenant_id=str(r["tenant_id"]),
                alert_type=r["alert_type"],
                severity=r["severity"],
                message=r["message"],
                is_read=r["is_read"],
                created_at=r["created_at"].isoformat(),
            )
            for r in rows
        ]
    finally:
        conn.close()


@app.patch("/alerts/{tenant_id}/{alert_id}/read")
async def mark_alert_read(tenant_id: str, alert_id: str):
    """Mark a single alert as read."""
    conn = psycopg2.connect(_DB_DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE alerts SET is_read = TRUE WHERE id = %s AND tenant_id = %s",
                (alert_id, tenant_id),
            )
        conn.commit()
        return {"marked_read": True, "alert_id": alert_id}
    finally:
        conn.close()


@app.patch("/alerts/{tenant_id}/read-all")
async def mark_all_read(tenant_id: str):
    """Mark all alerts for a tenant as read."""
    conn = psycopg2.connect(_DB_DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE alerts SET is_read = TRUE WHERE tenant_id = %s AND is_read = FALSE",
                (tenant_id,),
            )
            count = cur.rowcount
        conn.commit()
        return {"marked_read": count}
    finally:
        conn.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("SERVICE_PORT", "8004")),
        reload=os.getenv("ENVIRONMENT", "development") == "development",
    )
