from django.urls import path
from . import views

urlpatterns = [
    path("generate", views.generate_forecast, name="forecast-generate"),
    path("recalculate", views.recalculate_forecast, name="forecast-recalculate"),
    path("<uuid:forecast_id>", views.get_forecast, name="forecast-detail"),
    path("tenant/<uuid:tenant_id>/latest", views.latest_forecast, name="forecast-latest"),
    path("tenant/<uuid:tenant_id>/scenarios", views.list_scenarios, name="forecast-scenarios-list"),
    path("tenant/<uuid:tenant_id>/scenarios/create", views.create_scenario, name="forecast-scenarios-create"),
    path("tenant/<uuid:tenant_id>/obligations", views.future_obligations, name="forecast-obligations"),
]
