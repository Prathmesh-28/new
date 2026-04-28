from django.urls import path
from . import views

urlpatterns = [
    path("applications", views.create_application, name="credit-apply"),
    path("applications/<uuid:application_id>", views.get_application, name="credit-application-detail"),
    path("applications/<uuid:application_id>/submit", views.submit_application, name="credit-submit"),
    path("offers/<uuid:offer_id>/accept", views.accept_offer, name="credit-offer-accept"),
]
