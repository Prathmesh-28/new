from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.models import Tenant
from .models import CapitalRaise, CapitalInvestor
from .serializers import CapitalRaiseSerializer, CreateRaiseSerializer, InvestSerializer


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_raise(request):
    serializer = CreateRaiseSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        tenant = Tenant.objects.get(pk=data["tenant_id"])
    except Tenant.DoesNotExist:
        return Response({"error": "Tenant not found"}, status=status.HTTP_404_NOT_FOUND)

    raise_obj = CapitalRaise.objects.create(
        tenant=tenant,
        track=data["track"],
        target_amount=data["target_amount"],
        status=CapitalRaise.Status.DRAFT,
    )
    return Response({"raise_id": str(raise_obj.id), "status": raise_obj.status}, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_raise(request, raise_id):
    try:
        raise_obj = CapitalRaise.objects.get(pk=raise_id)
    except CapitalRaise.DoesNotExist:
        return Response({"error": "Capital raise not found"}, status=status.HTTP_404_NOT_FOUND)

    new_status = request.data.get("status")
    if not new_status:
        return Response({"error": "status is required"}, status=status.HTTP_400_BAD_REQUEST)

    raise_obj.status = new_status
    raise_obj.save(update_fields=["status", "updated_at"])
    return Response({"raise_id": str(raise_id), "status": new_status})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def publish_raise(request, raise_id):
    try:
        raise_obj = CapitalRaise.objects.get(pk=raise_id)
    except CapitalRaise.DoesNotExist:
        return Response({"error": "Capital raise not found"}, status=status.HTTP_404_NOT_FOUND)

    raise_obj.status = CapitalRaise.Status.ACTIVE
    raise_obj.save(update_fields=["status", "updated_at"])
    return Response({
        "raise_id": str(raise_id),
        "status": "active",
        "public_url": f"/capital/raises/{raise_id}",
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invest(request, raise_id):
    serializer = InvestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        raise_obj = CapitalRaise.objects.get(pk=raise_id)
    except CapitalRaise.DoesNotExist:
        return Response({"error": "Capital raise not found"}, status=status.HTTP_404_NOT_FOUND)

    target = float(raise_obj.target_amount or 0)
    amount = data["amount"]
    equity_pct = round((amount / target * 100), 2) if target > 0 else 0

    with transaction.atomic():
        investor = CapitalInvestor.objects.create(
            capital_raise=raise_obj,
            investor_email=data["investor_email"],
            investment_amount=amount,
            equity_percentage=equity_pct,
            status="pending",
        )
        new_raised = float(raise_obj.raised_amount or 0) + amount
        raise_obj.raised_amount = new_raised
        raise_obj.save(update_fields=["raised_amount", "updated_at"])

    return Response({
        "investment_id": str(investor.id),
        "status": "pending",
        "equity_percentage": equity_pct,
        "raised_amount": new_raised,
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dataroom(request, raise_id):
    return Response({
        "raise_id": str(raise_id),
        "documents": [
            {"name": "Offering Deck", "url": "/assets/offering-deck.pdf"},
            {"name": "Financial Model", "url": "/assets/financial-model.xlsx"},
            {"name": "Investor Presentation", "url": "/assets/investor-presentation.pdf"},
        ],
    })
