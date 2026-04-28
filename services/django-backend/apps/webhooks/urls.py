from django.urls import path
from . import views

urlpatterns = [
    path("plaid", views.plaid_webhook, name="webhook-plaid"),
    path("health", views.health, name="webhook-health"),
]
