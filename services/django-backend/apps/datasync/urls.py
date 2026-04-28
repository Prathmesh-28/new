from django.urls import path
from . import views

urlpatterns = [
    path("health", views.health, name="datasync-health"),
    path("all", views.trigger_all_syncs, name="datasync-all"),
    path("<uuid:connection_id>", views.trigger_sync, name="datasync-trigger"),
    path("<uuid:connection_id>/balance", views.trigger_balance_sync, name="datasync-balance"),
    path("<uuid:connection_id>/status", views.sync_status, name="datasync-status"),
]
