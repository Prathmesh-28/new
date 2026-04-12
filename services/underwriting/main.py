"""
Underwriting Service — FastAPI entry-point.

Called synchronously by the credit service's POST /credit/applications/:id/submit
endpoint. Returns a score, breakdown, approved amount range, and recommended product.

Does NOT make the credit decision — that is the credit service's responsibility.

Endpoint:
  POST /underwrite/{tenant_id}
    Returns UnderwritingResult
"""

from __future__ import annotations

import logging
import os
from dataclasses import asdict
from typing import Any, Dict, Optional

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .signals import collect_signals
from .engine import UnderwritingEngine, UnderwritingResult
from .fraud import run_fraud_gate, FraudResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_DB_DSN = (
    f"host={os.getenv('DB_HOST', 'localhost')} "
    f"port={os.getenv('DB_PORT', '5432')} "
    f"dbname={os.getenv('DB_NAME', 'headroom')} "
    f"user={os.getenv('DB_USER', 'postgres')} "
    f"password={os.getenv('DB_PASSWORD', 'postgres')}"
)

engine = UnderwritingEngine()

app = FastAPI(
    title="Headroom Underwriting Service",
    description="9-signal underwriting scorer for credit applications",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic response model
# ---------------------------------------------------------------------------

class UnderwritingResponse(BaseModel):
    tenant_id: str
    application_id: Optional[str] = None
    score: int
    approved_amount: float
    approved_amount_min: float
    recommended_product: str
    decline_reason: Optional[str] = None
    fraud_risk: str
    breakdown: Dict[str, Any]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_org_context(tenant_id: str, conn) -> Dict[str, Any]:
    """Load tenant contact info for Sardine fraud gate."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT t.company_name AS business_name,
                   t.features->>'tax_id' AS tax_id,
                   u.email,
                   t.features->>'notification_phone' AS phone
            FROM tenants t
            LEFT JOIN users u ON u.tenant_id = t.id AND u.role = 'owner' AND u.status = 'active'
            WHERE t.id = %s
            LIMIT 1
            """,
            (tenant_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else {}


def _persist_score(
    tenant_id: str,
    application_id: Optional[str],
    result: UnderwritingResult,
    fraud: FraudResult,
    conn,
) -> None:
    """Write the underwriting score back to credit_applications."""
    if not application_id:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE credit_applications
            SET underwriting_score  = %s,
                score_breakdown     = %s,
                fraud_check_status  = %s,
                updated_at          = NOW()
            WHERE id = %s
              AND tenant_id = %s
            """,
            (
                result.score,
                psycopg2.extras.Json(result.breakdown),
                fraud.risk.lower(),
                application_id,
                tenant_id,
            ),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "underwriting", "version": "1.0.0"}


@app.post("/underwrite/{tenant_id}", response_model=UnderwritingResponse)
async def underwrite(tenant_id: str, application_id: Optional[str] = None):
    """
    Score a credit application for `tenant_id`.

    Flow:
      1. Collect 9 financial signals from DB
      2. Run UnderwritingEngine.score()
      3. Apply industry multiplier
      4. Call Sardine fraud gate
      5. Persist score to credit_applications
      6. Return result
    """
    conn = psycopg2.connect(_DB_DSN)
    try:
        # 1. Collect signals
        try:
            signals = collect_signals(tenant_id, conn)
        except Exception as exc:
            logger.exception("Signal collection failed for tenant %s: %s", tenant_id, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Signal collection failed: {exc}",
            )

        # 2 + 3. Score
        result = engine.score(signals)

        # 4. Fraud gate
        org_ctx = _load_org_context(tenant_id, conn)
        if application_id:
            org_ctx["application_id"] = application_id

        fraud = run_fraud_gate(tenant_id, org_ctx)

        if fraud.risk == "HIGH":
            result = UnderwritingResult(
                score=0,
                approved_amount=0.0,
                approved_amount_min=0.0,
                recommended_product="decline",
                breakdown=result.breakdown,
                decline_reason="fraud_risk",
            )

        # 5. Persist
        _persist_score(tenant_id, application_id, result, fraud, conn)

        # 6. Return
        return UnderwritingResponse(
            tenant_id=tenant_id,
            application_id=application_id,
            score=result.score,
            approved_amount=result.approved_amount,
            approved_amount_min=result.approved_amount_min,
            recommended_product=result.recommended_product,
            decline_reason=result.decline_reason,
            fraud_risk=fraud.risk,
            breakdown=result.breakdown,
        )

    finally:
        conn.close()


@app.get("/underwrite/{tenant_id}/latest", response_model=UnderwritingResponse)
async def get_latest_score(tenant_id: str):
    """Return the most recently stored underwriting score for this tenant."""
    conn = psycopg2.connect(_DB_DSN)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, underwriting_score, score_breakdown, fraud_check_status
                FROM credit_applications
                WHERE tenant_id = %s
                  AND underwriting_score IS NOT NULL
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (tenant_id,),
            )
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No underwriting score found")

        bd = row["score_breakdown"] or {}
        return UnderwritingResponse(
            tenant_id=tenant_id,
            application_id=str(row["id"]),
            score=int(row["underwriting_score"] or 0),
            approved_amount=bd.get("approved_amount", 0.0),
            approved_amount_min=bd.get("approved_amount_min", 0.0),
            recommended_product=bd.get("recommended_product", "unknown"),
            fraud_risk=(row["fraud_check_status"] or "unknown").upper(),
            breakdown=bd,
        )
    finally:
        conn.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("SERVICE_PORT", "8005")),
        reload=os.getenv("ENVIRONMENT", "development") == "development",
    )
