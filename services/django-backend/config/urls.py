from django.urls import path, include
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.routers import DefaultRouter

from apps.core.admin_viewsets import (
    TenantViewSet, UserViewSet, BankConnectionViewSet, TransactionViewSet,
    AlertViewSet, CreditApplicationViewSet, CapitalRaiseViewSet,
    ForecastViewSet, AuditLogViewSet,
)


def health(request):
    return JsonResponse({"status": "ok", "timestamp": timezone.now().isoformat(), "version": "1.0.0"})


admin_router = DefaultRouter()
admin_router.register(r"tenants",             TenantViewSet,            basename="admin-tenant")
admin_router.register(r"users",               UserViewSet,              basename="admin-user")
admin_router.register(r"bank-connections",    BankConnectionViewSet,    basename="admin-bankconn")
admin_router.register(r"transactions",        TransactionViewSet,        basename="admin-txn")
admin_router.register(r"alerts",              AlertViewSet,             basename="admin-alert")
admin_router.register(r"credit-applications", CreditApplicationViewSet, basename="admin-credit")
admin_router.register(r"capital-raises",      CapitalRaiseViewSet,      basename="admin-capital")
admin_router.register(r"forecasts",           ForecastViewSet,          basename="admin-forecast")
admin_router.register(r"audit-logs",          AuditLogViewSet,          basename="admin-auditlog")


urlpatterns = [
    path("health", health),

    # ── React Admin API ───────────────────────────────────────────────────────
    path("admin-api/", include(admin_router.urls)),

    # ── Auth ──────────────────────────────────────────────────────────────────
    path("auth/", include("apps.auth_api.urls")),

    # ── Organisations / tenants ───────────────────────────────────────────────
    path("organisations/", include("apps.organizations.urls")),

    # ── Forecast ──────────────────────────────────────────────────────────────
    path("forecast/", include("apps.forecast.urls")),

    # ── Alerts ────────────────────────────────────────────────────────────────
    path("alerts/", include("apps.alerts.urls")),

    # ── Data sync ─────────────────────────────────────────────────────────────
    path("sync/", include("apps.datasync.urls")),

    # ── Underwriting ──────────────────────────────────────────────────────────
    path("underwrite/", include("apps.underwriting.urls")),

    # ── Credit marketplace ────────────────────────────────────────────────────
    path("credit/", include("apps.credit.urls")),

    # ── Capital raising ───────────────────────────────────────────────────────
    path("capital/", include("apps.capital.urls")),

    # ── Webhooks ──────────────────────────────────────────────────────────────
    path("webhooks/", include("apps.webhooks.urls")),
]
