import logging
from datetime import datetime, timezone as tz

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.models import Tenant
from .models import CreditApplication, CreditOffer
from .serializers import (
    CreditApplicationSerializer, CreateApplicationSerializer,
    SubmitApplicationSerializer, CreditOfferSerializer,
)
from .lender_router import route_to_lenders

logger = logging.getLogger(__name__)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def create_application(request):
    if request.method == "GET":
        tenant_id = request.query_params.get("tenant_id")
        if not tenant_id:
            return Response({"error": "tenant_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        qs = CreditApplication.objects.filter(tenant_id=tenant_id).order_by("-created_at")
        return Response(CreditApplicationSerializer(qs, many=True).data)

    serializer = CreateApplicationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    tenant_id = serializer.validated_data["tenant_id"]
    try:
        tenant = Tenant.objects.get(pk=tenant_id)
    except Tenant.DoesNotExist:
        return Response({"error": "Tenant not found"}, status=status.HTTP_404_NOT_FOUND)

    app = CreditApplication.objects.create(tenant=tenant, status=CreditApplication.Status.DRAFT)
    return Response({"application_id": str(app.id), "status": app.status}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_application(request, application_id):
    serializer = SubmitApplicationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        app = CreditApplication.objects.get(pk=application_id)
    except CreditApplication.DoesNotExist:
        return Response({"error": "Application not found"}, status=status.HTTP_404_NOT_FOUND)

    app.loan_amount = data["loan_amount"]
    app.term_months = data["term_months"]
    app.status = CreditApplication.Status.SUBMITTED
    app.save(update_fields=["loan_amount", "term_months", "status", "updated_at"])

    # Call underwriting synchronously
    from apps.underwriting.signals_collector import collect_signals
    from apps.underwriting.engine import UnderwritingEngine
    from apps.underwriting.fraud import run_fraud_gate

    tenant_id = str(data["tenant_id"])

    try:
        signals = collect_signals(tenant_id)
        engine = UnderwritingEngine()
        result = engine.score(signals)
        fraud = run_fraud_gate(tenant_id, {"application_id": str(application_id)})
    except Exception as exc:
        logger.exception("Underwriting call failed: %s", exc)
        return Response({"error": "Underwriting failed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if fraud.risk == "HIGH" or result.decline_reason:
        app.status = CreditApplication.Status.REJECTED
        app.underwriting_score = 0
        app.fraud_check_status = fraud.risk.lower()
        app.save(update_fields=["status", "underwriting_score", "fraud_check_status", "updated_at"])
        return Response({
            "application_id": str(app.id),
            "status": "rejected",
            "decline_reason": result.decline_reason or "fraud_risk",
            "underwriting_score": 0,
            "offers": [],
        })

    score = result.score
    approved_amount = min(data["loan_amount"], result.approved_amount)
    product = result.recommended_product

    lender_offers = route_to_lenders(tenant_id, approved_amount, data["term_months"], score, product)

    for offer in lender_offers:
        CreditOffer.objects.create(
            credit_application=app,
            lender_partner=offer["lender"],
            product_type=product,
            offer_amount=offer["amount"],
            apr_equivalent=offer["interest_rate"],
            term_months_est=offer["term_months"],
            expires_at=datetime.fromisoformat(offer["expires_at"]).replace(tzinfo=tz.utc),
        )

    app.status = CreditApplication.Status.APPROVED
    app.credit_score = score
    app.underwriting_score = score
    app.fraud_check_status = fraud.risk.lower()
    app.save(update_fields=["status", "credit_score", "underwriting_score", "fraud_check_status", "updated_at"])

    return Response({
        "application_id": str(app.id),
        "status": "approved",
        "underwriting_score": score,
        "recommended_product": product,
        "approved_amount": approved_amount,
        "fraud_risk": fraud.risk,
        "offers": lender_offers,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_application(request, application_id):
    try:
        app = CreditApplication.objects.prefetch_related("offers").get(pk=application_id)
    except CreditApplication.DoesNotExist:
        return Response({"error": "Application not found"}, status=status.HTTP_404_NOT_FOUND)
    return Response(CreditApplicationSerializer(app).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_offer(request, offer_id):
    try:
        offer = CreditOffer.objects.get(pk=offer_id)
    except CreditOffer.DoesNotExist:
        return Response({"error": "Offer not found"}, status=status.HTTP_404_NOT_FOUND)
    offer.status = "accepted"
    offer.save(update_fields=["status", "updated_at"])
    return Response({"accepted": True, "offer_id": str(offer_id)})
