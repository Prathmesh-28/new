from django.urls import path
from . import views

urlpatterns = [
    path("<uuid:tenant_id>", views.underwrite, name="underwriting-score"),
    path("<uuid:tenant_id>/latest", views.latest_score, name="underwriting-latest"),
]
