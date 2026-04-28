from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.utils import timezone


def health(request):
    return JsonResponse({"status": "ok", "timestamp": timezone.now().isoformat(), "version": "1.0.0"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health", health),

    # Auth
    path("auth/", include("apps.auth_api.urls")),

    # Organisations / tenants
    path("organisations/", include("apps.organizations.urls")),

    # Forecast
    path("forecast/", include("apps.forecast.urls")),

    # Alerts
    path("alerts/", include("apps.alerts.urls")),

    # Data sync
    path("sync/", include("apps.datasync.urls")),

    # Underwriting
    path("underwrite/", include("apps.underwriting.urls")),

    # Credit marketplace
    path("credit/", include("apps.credit.urls")),

    # Capital raising
    path("capital/", include("apps.capital.urls")),

    # Webhooks
    path("webhooks/", include("apps.webhooks.urls")),
]
