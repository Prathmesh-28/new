from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.models import Tenant
from .models import Forecast, ForecastDatapoint, ForecastScenario, FutureObligation
from .serializers import (
    ForecastSerializer, ForecastRequestSerializer,
    ForecastScenarioSerializer, FutureObligationSerializer,
)
from .tasks import generate_forecast_task


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_forecast(request):
    """Enqueue forecast generation and return immediately."""
    serializer = ForecastRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    tenant_id = str(serializer.validated_data["tenant_id"])
    window_days = serializer.validated_data["window_days"]
    task = generate_forecast_task.delay(tenant_id, window_days)
    return Response({"task_id": task.id, "tenant_id": tenant_id, "status": "queued"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_forecast(request, forecast_id):
    try:
        forecast = Forecast.objects.prefetch_related("datapoints").get(pk=forecast_id)
    except Forecast.DoesNotExist:
        return Response({"detail": "Forecast not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(ForecastSerializer(forecast).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def latest_forecast(request, tenant_id):
    try:
        forecast = Forecast.objects.filter(tenant_id=tenant_id, status="complete").latest("generated_at")
    except Forecast.DoesNotExist:
        return Response({"detail": "No forecast found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(ForecastSerializer(forecast).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def recalculate_forecast(request):
    tenant_id = request.data.get("tenant_id") or str(request.user.tenant_id)
    task = generate_forecast_task.delay(tenant_id, 90)
    return Response({"task_id": task.id, "tenant_id": tenant_id, "status": "queued"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_scenarios(request, tenant_id):
    qs = ForecastScenario.objects.filter(tenant_id=tenant_id, active=True)
    return Response(ForecastScenarioSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_scenario(request, tenant_id):
    try:
        tenant = Tenant.objects.get(pk=tenant_id)
    except Tenant.DoesNotExist:
        return Response({"detail": "Tenant not found."}, status=status.HTTP_404_NOT_FOUND)
    serializer = ForecastScenarioSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    scenario = serializer.save(tenant=tenant)
    return Response(ForecastScenarioSerializer(scenario).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def future_obligations(request, tenant_id):
    if request.method == "GET":
        qs = FutureObligation.objects.filter(tenant_id=tenant_id).order_by("due_date")
        return Response(FutureObligationSerializer(qs, many=True).data)

    try:
        tenant = Tenant.objects.get(pk=tenant_id)
    except Tenant.DoesNotExist:
        return Response({"detail": "Tenant not found."}, status=status.HTTP_404_NOT_FOUND)
    serializer = FutureObligationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    obligation = serializer.save(tenant=tenant)
    return Response(FutureObligationSerializer(obligation).data, status=status.HTTP_201_CREATED)
