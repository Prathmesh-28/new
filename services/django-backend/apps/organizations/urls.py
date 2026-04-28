from django.urls import path
from . import views

urlpatterns = [
    path("<uuid:org_id>/accounts", views.accounts, name="org-accounts"),
    path("<uuid:org_id>/transactions", views.transactions, name="org-transactions"),
    path("<uuid:org_id>/forecast", views.forecast_latest, name="org-forecast"),
    path("<uuid:org_id>/forecast/trigger", views.forecast_trigger, name="org-forecast-trigger"),
    path("<uuid:org_id>/forecast/scenarios", views.scenarios, name="org-scenarios"),
    path("<uuid:org_id>/alerts", views.org_alerts, name="org-alerts"),
]
