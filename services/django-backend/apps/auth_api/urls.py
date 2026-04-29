from django.urls import path
from . import views

urlpatterns = [
    path("login",    views.LoginView.as_view(), name="auth-login"),
    path("refresh",  views.RefreshView.as_view(), name="auth-refresh"),
    path("register", views.register, name="auth-register"),
    path("logout",   views.logout,   name="auth-logout"),
    path("me",       views.me,       name="auth-me"),
    path("google",   views.google_oauth, name="auth-google"),
]
