from django.utils import timezone
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.models import BankConnection, Transaction, Tenant
from apps.forecast.models import Forecast, ForecastDatapoint, ForecastScenario
from apps.alerts.models import Alert
from .serializers import (
    TenantSerializer, BankConnectionSerializer,
    BankConnectionCreateSerializer, TransactionSerializer,
)


def _check_org_access(request, org_id):
    """Returns (tenant, error_response) — error_response is None if access granted."""
    try:
        tenant = Tenant.objects.get(pk=org_id)
    except Tenant.DoesNotExist:
        return None, Response({"detail": "Organisation not found."}, status=status.HTTP_404_NOT_FOUND)
    if str(request.user.tenant_id) != str(org_id) and not request.user.is_staff:
        return None, Response({"detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
    return tenant, None


# ── Bank accounts ──────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def accounts(request, org_id):
    tenant, err = _check_org_access(request, org_id)
    if err:
        return err

    if request.method == "GET":
        limit = int(request.query_params.get("limit", 50))
        offset = int(request.query_params.get("offset", 0))
        qs = BankConnection.objects.filter(tenant=tenant)[offset: offset + limit]
        return Response({
            "data": BankConnectionSerializer(qs, many=True).data,
            "pagination": {"limit": limit, "offset": offset, "total": qs.count()},
        })

    serializer = BankConnectionCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    conn = serializer.save(tenant=tenant, status=BankConnection.Status.PENDING)
    return Response(BankConnectionSerializer(conn).data, status=status.HTTP_201_CREATED)


# ── Transactions ───────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def transactions(request, org_id):
    tenant, err = _check_org_access(request, org_id)
    if err:
        return err

    qs = Transaction.objects.filter(tenant=tenant).order_by("-date")

    start_date = request.query_params.get("startDate")
    end_date = request.query_params.get("endDate")
    category = request.query_params.get("category")
    min_amount = request.query_params.get("minAmount")
    max_amount = request.query_params.get("maxAmount")

    if start_date:
        qs = qs.filter(date__gte=start_date)
    if end_date:
        qs = qs.filter(date__lte=end_date)
    if category:
        qs = qs.filter(category=category)
    if min_amount:
        qs = qs.filter(amount__gte=min_amount)
    if max_amount:
        qs = qs.filter(amount__lte=max_amount)

    limit = int(request.query_params.get("limit", 50))
    offset = int(request.query_params.get("offset", 0))
    page = qs[offset: offset + limit]

    return Response({
        "data": TransactionSerializer(page, many=True).data,
        "pagination": {"limit": limit, "offset": offset},
    })


# ── Forecast ───────────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def forecast_latest(request, org_id):
    tenant, err = _check_org_access(request, org_id)
    if err:
        return err

    cache_key = f"forecast:{org_id}"
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    try:
        forecast = Forecast.objects.filter(tenant=tenant, status="complete").latest("generated_at")
    except Forecast.DoesNotExist:
        return Response({"detail": "No forecast available."}, status=status.HTTP_404_NOT_FOUND)

    datapoints = ForecastDatapoint.objects.filter(forecast=forecast).order_by("date")
    payload = {
        "id": str(forecast.id),
        "generated_at": forecast.generated_at.isoformat(),
        "status": forecast.status,
        "days_forecasted": forecast.days_forecasted,
        "datapoints": [
            {
                "date": dp.date.isoformat(),
                "best_case": float(dp.best_case or 0),
                "expected_case": float(dp.expected_case or 0),
                "downside_case": float(dp.downside_case or 0),
                "confidence_level": float(dp.confidence_level or 0),
            }
            for dp in datapoints
        ],
    }
    cache.set(cache_key, payload, timeout=3600)
    return Response(payload)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def forecast_trigger(request, org_id):
    tenant, err = _check_org_access(request, org_id)
    if err:
        return err

    rate_key = f"forecast_trigger:{org_id}"
    count = cache.get(rate_key, 0)
    force = request.data.get("force", False)
    if count >= 10 and not force:
        return Response(
            {"error": "Rate limit exceeded", "retryAfter": 60},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    cache.set(rate_key, count + 1, timeout=60)

    from apps.forecast.tasks import generate_forecast_task
    generate_forecast_task.delay(str(tenant.id))

    return Response({"success": True, "message": "Forecast calculation triggered", "organisation_id": str(org_id)})


# ── Scenarios ──────────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def scenarios(request, org_id):
    tenant, err = _check_org_access(request, org_id)
    if err:
        return err

    if request.method == "GET":
        limit = int(request.query_params.get("limit", 50))
        offset = int(request.query_params.get("offset", 0))
        qs = ForecastScenario.objects.filter(tenant=tenant)[offset: offset + limit]
        data = [
            {"id": str(s.id), "name": s.name, "type": s.type, "parameters": s.parameters, "created_at": s.created_at.isoformat()}
            for s in qs
        ]
        return Response({"data": data, "pagination": {"limit": limit, "offset": offset}})

    name = request.data.get("name")
    stype = request.data.get("type")
    params = request.data.get("parameters", {})

    if not name or not stype:
        return Response({"error": "name and type are required"}, status=status.HTTP_400_BAD_REQUEST)

    scenario = ForecastScenario.objects.create(tenant=tenant, name=name, type=stype, parameters=params)
    return Response(
        {"id": str(scenario.id), "name": scenario.name, "type": scenario.type,
         "parameters": scenario.parameters, "created_at": scenario.created_at.isoformat()},
        status=status.HTTP_201_CREATED,
    )


# ── Alerts ─────────────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def org_alerts(request, org_id):
    tenant, err = _check_org_access(request, org_id)
    if err:
        return err

    qs = Alert.objects.filter(tenant=tenant)
    severity = request.query_params.get("severity")
    unread_only = request.query_params.get("unread_only", "false").lower() == "true"

    if severity:
        qs = qs.filter(severity=severity)
    if unread_only:
        qs = qs.filter(is_read=False)

    limit = int(request.query_params.get("limit", 50))
    offset = int(request.query_params.get("offset", 0))
    page = qs.order_by("-created_at")[offset: offset + limit]

    data = [
        {
            "id": str(a.id), "alert_type": a.alert_type, "severity": a.severity,
            "message": a.message, "is_read": a.is_read, "created_at": a.created_at.isoformat(),
        }
        for a in page
    ]
    return Response({"data": data, "pagination": {"limit": limit, "offset": offset}})
