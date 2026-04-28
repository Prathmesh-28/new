from django.urls import path
from . import views

urlpatterns = [
    path("raises", views.create_raise, name="capital-create"),
    path("raises/<uuid:raise_id>", views.update_raise, name="capital-update"),
    path("raises/<uuid:raise_id>/publish", views.publish_raise, name="capital-publish"),
    path("raises/<uuid:raise_id>/dataroom", views.dataroom, name="capital-dataroom"),
    path("investors/<uuid:raise_id>/invest", views.invest, name="capital-invest"),
]
