from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from apps.core.models import User


class ServiceKeyAuthentication(BaseAuthentication):
    """Authenticates requests coming from the Next.js proxy using a shared service key + user ID header."""

    def authenticate(self, request):
        service_key = request.headers.get("X-Service-Key", "")
        if not service_key:
            return None

        expected = getattr(settings, "DJANGO_SERVICE_KEY", "")
        if not expected or service_key != expected:
            return None

        user_id = request.headers.get("X-User-Id", "")
        if not user_id:
            raise AuthenticationFailed("X-User-Id header required with service key")

        try:
            user = User.objects.get(pk=user_id, status="active")
            return (user, None)
        except User.DoesNotExist:
            raise AuthenticationFailed("User not found")

    def authenticate_header(self, request):
        return "ServiceKey"
