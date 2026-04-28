from django.urls import path
from . import views

urlpatterns = [
    path("<uuid:tenant_id>", views.get_alerts, name="alerts-list"),
    path("evaluate/<uuid:tenant_id>", views.evaluate_alerts, name="alerts-evaluate"),
    path("<uuid:tenant_id>/<uuid:alert_id>/read", views.mark_alert_read, name="alerts-mark-read"),
    path("<uuid:tenant_id>/read-all", views.mark_all_read, name="alerts-mark-all-read"),
]
