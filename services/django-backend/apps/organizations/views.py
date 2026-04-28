import logging
from django.utils import timezone
from django.core.cache import cache, InvalidCacheBackendError
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

logger = logging.getLogger(__name__)


# ── Cache helpers (never crash if Redis is down) ───────────────────────────────

def _cache_get(key):
    try:
        return cache.get(key)
    except Exception:
        return None


def _cache_set(key, value, timeout=3600):
    try:
        cache.set(key, value, timeout=timeout)
    except Exception:
        pass


def _cache_incr(key, timeout=60):
    try:
        count = cache.get(key, 0)
        cache.set(key, count + 1, timeout=timeout)
        return count + 1
    except Exception:
        return 0


# ── Access guard ───────────────────────────────────────────────────────────────

def _check_org_access(request, org_id):
    try:
        tenant = Tenant.objects.get(pk=org_id)
    except Tenant.DoesNotExist:
        return None, Response({"detail": "Organisation not found."}, status=status.HTTP_404_NOT_FOUND)
    if str(getattr(request.user, "tenant_id", "")) != str(org_id) and not request.user.is_staff:
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
        limit  = int(request.query_params.get("limit", 50))
        offset = int(request.query_params.get("offset", 0))
        qs     = BankConnection.objects.filter(tenant=tenant)[offset: offset + limit]
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
    end_date   = request.query_params.get("endDate")
    category   = request.query_params.get("category")
    min_amount = request.query_params.get("minAmount")
    max_amount = request.query_params.get("maxAmount")

    if start_date:  qs = qs.filter(date__gte=start_date)
    if end_date:    qs = qs.filter(date__lte=end_date)
    if category:    qs = qs.filter(category=category)
    if min_amount:  qs = qs.filter(amount__gte=min_amount)
    if max_amount:  qs = qs.filter(amount__lte=max_amount)

    limit  = int(request.query_params.get("limit", 50))
    offset = int(request.query_params.get("offset", 0))

    return Response({
        "data": TransactionSerializer(qs[offset: offset + limit], many=True).data,
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
    cached = _cache_get(cache_key)
    if cached:
        return Response(cached)

    # Try stored forecast first
    forecast_obj = None
    try:
        forecast_obj = Forecast.objects.filter(tenant=tenant, status="complete").latest("generated_at")
    except Forecast.DoesNotExist:
        pass

    if forecast_obj:
        datapoints = ForecastDatapoint.objects.filter(forecast=forecast_obj).order_by("date")
        payload = {
            "id": str(forecast_obj.id),
            "tenant_id": str(forecast_obj.tenant_id),
            "generated_at": forecast_obj.generated_at.isoformat(),
            "status": forecast_obj.status,
            "model_version": forecast_obj.base_model_version or "2.0",
            "days_forecasted": forecast_obj.days_forecasted,
            "datapoints": [
                {
                    "date": dp.date.isoformat(),
                    "balance_p90": float(dp.best_case     or 0),
                    "balance_p50": float(dp.expected_case or 0),
                    "balance_p10": float(dp.downside_case or 0),
                    "confidence_score": float(dp.confidence_level or 0),
                }
                for dp in datapoints
            ],
        }
        _cache_set(cache_key, payload, timeout=3600)
        return Response(payload)

    # No stored forecast — run the 6-layer engine inline (first-time / on-demand)
    try:
        from .forecasting import transactions_to_observations, forecast_cashflow
        tx_qs = Transaction.objects.filter(tenant=tenant).order_by("date")[:2000]
        obs   = transactions_to_observations(tx_qs)
        pts   = forecast_cashflow(obs, horizon_days=90)

        import uuid
        from datetime import date as _date
        gen_id = str(uuid.uuid4())
        payload = {
            "id": gen_id,
            "tenant_id": str(tenant.id),
            "generated_at": timezone.now().isoformat(),
            "status": "complete",
            "model_version": "2.0-ensemble",
            "days_forecasted": 90,
            "datapoints": [
                {
                    "date": p.date.isoformat(),
                    "balance_p10": p.balance_p10,
                    "balance_p50": p.balance_p50,
                    "balance_p90": p.balance_p90,
                    "confidence_score": p.confidence_score,
                }
                for p in pts
            ],
        }
        _cache_set(cache_key, payload, timeout=1800)
        return Response(payload)
    except Exception as exc:
        logger.exception("Inline forecast failed for tenant %s: %s", org_id, exc)
        return Response({"detail": "No forecast available. Trigger one via POST /forecast/trigger."}, status=status.HTTP_404_NOT_FOUND)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def forecast_trigger(request, org_id):
    tenant, err = _check_org_access(request, org_id)
    if err:
        return err

    rate_key = f"forecast_trigger:{org_id}"
    count    = _cache_incr(rate_key, timeout=60)
    force    = request.data.get("force", False)

    if count > 10 and not force:
        return Response(
            {"error": "Rate limit exceeded", "retryAfter": 60},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    try:
        from apps.forecast.tasks import generate_forecast_task
        generate_forecast_task.delay(str(tenant.id))
    except Exception as exc:
        # Celery may not be running; fall back to synchronous execution
        logger.warning("Celery unavailable (%s), running forecast synchronously", exc)
        try:
            from .forecasting import transactions_to_observations, forecast_cashflow
            from apps.forecast.models import ForecastDatapoint
            tx_qs = Transaction.objects.filter(tenant=tenant).order_by("date")[:2000]
            obs   = transactions_to_observations(tx_qs)
            pts   = forecast_cashflow(obs, horizon_days=90)

            fc = Forecast.objects.create(
                tenant=tenant,
                forecast_date=timezone.now().date(),
                days_forecasted=90,
                status=Forecast.Status.PENDING,
                base_model_version="2.0-ensemble",
            )
            ForecastDatapoint.objects.bulk_create([
                ForecastDatapoint(
                    forecast=fc,
                    date=p.date,
                    best_case=p.balance_p90,
                    expected_case=p.balance_p50,
                    downside_case=p.balance_p10,
                    confidence_level=p.confidence_score,
                )
                for p in pts
            ])
            fc.status = Forecast.Status.COMPLETE
            fc.save(update_fields=["status"])
            _cache_set(f"forecast:{org_id}", None)  # invalidate cache
        except Exception as sync_exc:
            logger.exception("Synchronous forecast failed: %s", sync_exc)

    return Response({"success": True, "message": "Forecast queued", "organisation_id": str(org_id)})


# ── Scenarios ──────────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def scenarios(request, org_id):
    tenant, err = _check_org_access(request, org_id)
    if err:
        return err

    if request.method == "GET":
        qs = ForecastScenario.objects.filter(tenant=tenant).order_by("-created_at")[:50]
        data = [
            {
                "id": str(s.id), "tenant_id": str(s.tenant_id), "name": s.name,
                "type": s.type, "parameters": s.parameters, "version": s.version,
                "created_at": s.created_at.isoformat(),
            }
            for s in qs
        ]
        return Response(data)

    name   = request.data.get("name")
    stype  = request.data.get("type")
    params = request.data.get("parameters", {})

    if not name or not stype:
        return Response({"error": "name and type are required"}, status=status.HTTP_400_BAD_REQUEST)

    scenario = ForecastScenario.objects.create(tenant=tenant, name=name, type=stype, parameters=params)
    return Response(
        {
            "id": str(scenario.id), "tenant_id": str(scenario.tenant_id),
            "name": scenario.name, "type": scenario.type,
            "parameters": scenario.parameters, "version": scenario.version,
            "created_at": scenario.created_at.isoformat(),
        },
        status=status.HTTP_201_CREATED,
    )


# ── Scenario compare ───────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def scenario_compare(request, org_id, scenario_id):
    tenant, err = _check_org_access(request, org_id)
    if err:
        return err

    try:
        scenario = ForecastScenario.objects.get(pk=scenario_id, tenant=tenant)
    except ForecastScenario.DoesNotExist:
        return Response({"detail": "Scenario not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        forecast = Forecast.objects.filter(tenant=tenant, status="complete").latest("generated_at")
    except Forecast.DoesNotExist:
        return Response({"detail": "No forecast available."}, status=status.HTTP_404_NOT_FOUND)

    datapoints = ForecastDatapoint.objects.filter(forecast=forecast).order_by("date")
    params     = scenario.parameters or {}
    comparison = []

    for dp in datapoints:
        base         = float(dp.expected_case or 0)
        scenario_val = base
        if scenario.type == "new_hire":
            monthly_cost = float(params.get("salary", 0)) * (1 + float(params.get("benefits_multiplier", 0.15))) / 12
            scenario_val = base - monthly_cost
        elif scenario.type == "contract_won":
            scenario_val = base + float(params.get("amount", 0))
        elif scenario.type == "loan_draw":
            scenario_val = base + float(params.get("draw_amount", 0)) - float(params.get("repayment_amount", 0)) / max(int(params.get("term_months", 12)), 1)
        comparison.append({
            "date": dp.date.isoformat(),
            "base": base,
            "scenario": round(scenario_val, 2),
            "delta": round(scenario_val - base, 2),
        })

    return Response({"scenario_name": scenario.name, "comparison": comparison})


# ── Alerts ─────────────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def org_alerts(request, org_id):
    tenant, err = _check_org_access(request, org_id)
    if err:
        return err

    qs         = Alert.objects.filter(tenant=tenant)
    severity   = request.query_params.get("severity")
    unread_only = request.query_params.get("unread_only", "false").lower() == "true"

    if severity:    qs = qs.filter(severity=severity)
    if unread_only: qs = qs.filter(is_read=False)

    limit  = int(request.query_params.get("limit", 50))
    offset = int(request.query_params.get("offset", 0))
    page   = qs.order_by("-created_at")[offset: offset + limit]

    return Response({
        "data": [
            {
                "id": str(a.id), "tenant_id": str(a.tenant_id),
                "alert_type": a.alert_type, "severity": a.severity,
                "message": a.message, "is_read": a.is_read,
                "created_at": a.created_at.isoformat(),
            }
            for a in page
        ],
        "pagination": {"limit": limit, "offset": offset},
    })
