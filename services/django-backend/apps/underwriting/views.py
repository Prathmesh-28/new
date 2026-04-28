import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .engine import UnderwritingEngine, UnderwritingResult
from .signals_collector import collect_signals
from .fraud import run_fraud_gate
from .serializers import UnderwritingResponseSerializer

logger = logging.getLogger(__name__)
_engine = UnderwritingEngine()


def _org_context(tenant_id: str) -> dict:
    from apps.core.models import Tenant, User
    ctx = {}
    try:
        tenant = Tenant.objects.get(pk=tenant_id)
        ctx["business_name"] = tenant.company_name or tenant.name
        ctx["tax_id"] = (tenant.features or {}).get("tax_id", "")
        ctx["notification_phone"] = (tenant.features or {}).get("notification_phone", "")
        owner = User.objects.filter(tenant=tenant, role="owner", status="active").first()
        if owner:
            ctx["email"] = owner.email
    except Exception as exc:
        logger.warning("Failed to load org context for tenant %s: %s", tenant_id, exc)
    return ctx


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def underwrite(request, tenant_id):
    application_id = request.query_params.get("application_id") or request.data.get("application_id")

    try:
        signals = collect_signals(str(tenant_id))
    except Exception as exc:
        logger.exception("Signal collection failed for tenant %s: %s", tenant_id, exc)
        return Response({"detail": f"Signal collection failed: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    result = _engine.score(signals)
    org_ctx = _org_context(str(tenant_id))
    if application_id:
        org_ctx["application_id"] = application_id

    fraud = run_fraud_gate(str(tenant_id), org_ctx)

    if fraud.risk == "HIGH":
        result = UnderwritingResult(
            score=0,
            approved_amount=0.0,
            approved_amount_min=0.0,
            recommended_product="decline",
            breakdown=result.breakdown,
            decline_reason="fraud_risk",
        )

    # Persist to credit_applications if application_id provided
    if application_id:
        try:
            from apps.credit.models import CreditApplication
            CreditApplication.objects.filter(pk=application_id, tenant_id=tenant_id).update(
                underwriting_score=result.score,
                score_breakdown=result.breakdown,
                fraud_check_status=fraud.risk.lower(),
            )
        except Exception as exc:
            logger.warning("Failed to persist underwriting score: %s", exc)

    payload = {
        "tenant_id": str(tenant_id),
        "application_id": application_id,
        "score": result.score,
        "approved_amount": result.approved_amount,
        "approved_amount_min": result.approved_amount_min,
        "recommended_product": result.recommended_product,
        "decline_reason": result.decline_reason,
        "fraud_risk": fraud.risk,
        "breakdown": result.breakdown,
    }
    return Response(UnderwritingResponseSerializer(payload).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def latest_score(request, tenant_id):
    from apps.credit.models import CreditApplication
    app = (
        CreditApplication.objects.filter(tenant_id=tenant_id, underwriting_score__isnull=False)
        .order_by("-updated_at")
        .first()
    )
    if not app:
        return Response({"detail": "No underwriting score found."}, status=status.HTTP_404_NOT_FOUND)

    bd = app.score_breakdown or {}
    payload = {
        "tenant_id": str(tenant_id),
        "application_id": str(app.id),
        "score": app.underwriting_score or 0,
        "approved_amount": bd.get("approved_amount", 0.0),
        "approved_amount_min": bd.get("approved_amount_min", 0.0),
        "recommended_product": bd.get("recommended_product", "unknown"),
        "fraud_risk": (app.fraud_check_status or "unknown").upper(),
        "breakdown": bd,
    }
    return Response(UnderwritingResponseSerializer(payload).data)
