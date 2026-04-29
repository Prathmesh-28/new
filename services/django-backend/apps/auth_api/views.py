import logging
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.exceptions import TokenError

from .serializers import CustomTokenObtainPairSerializer, RegisterSerializer, UserSerializer

logger = logging.getLogger(__name__)


# ── Standard JWT login ────────────────────────────────────────────────────────

class LoginView(TokenObtainPairView):
    permission_classes = (AllowAny,)
    serializer_class   = CustomTokenObtainPairSerializer


class RefreshView(TokenRefreshView):
    permission_classes = (AllowAny,)


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user    = serializer.save()
    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "access_token":  str(refresh.access_token),
            "refresh_token": str(refresh),
            "user":          UserSerializer(user).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    try:
        refresh_token = request.data.get("refresh_token") or request.data.get("refreshToken")
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
    except TokenError:
        pass
    return Response({"success": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


# ── Google OAuth ──────────────────────────────────────────────────────────────

def _verify_google_token(credential: str) -> dict | None:
    """
    Verify a Google ID token (from Google One Tap / Sign-In button).
    Returns the token payload dict, or None on failure.
    """
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        client_id = settings.GOOGLE_OAUTH_CLIENT_ID
        if not client_id:
            logger.error("GOOGLE_OAUTH_CLIENT_ID is not configured")
            return None

        payload = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
        return payload
    except Exception as exc:
        logger.warning("Google token verification failed: %s", exc)
        return None


def _get_or_create_google_user(payload: dict):
    """
    Find an existing user by Google sub (external_id) or email,
    or create a new one with auto-provisioned tenant.
    """
    from apps.core.models import User, Tenant

    google_sub   = payload["sub"]
    email        = payload.get("email", "").lower().strip()
    full_name    = payload.get("name", "")
    email_verified = payload.get("email_verified", False)

    if not email or not email_verified:
        return None, "Google account must have a verified email"

    # Domain restriction check
    allowed_domains = getattr(settings, "GOOGLE_OAUTH_ALLOWED_DOMAINS", [])
    if allowed_domains:
        domain = email.split("@")[-1]
        if domain not in allowed_domains:
            return None, f"Email domain '{domain}' is not allowed"

    # Try by Google sub first (most stable identifier)
    user = User.objects.filter(external_id=google_sub, status="active").first()

    if not user:
        # Try by email
        user = User.objects.filter(email=email, status="active").first()
        if user:
            # Link Google sub to existing account
            user.external_id = google_sub
            user.save(update_fields=["external_id"])

    if not user:
        # Auto-provision: create tenant from email domain, create user
        domain    = email.split("@")[-1]
        org_name  = full_name.split()[0] + "'s Workspace" if full_name else domain
        tenant, _ = Tenant.objects.get_or_create(
            name=org_name,
            defaults={"company_name": org_name},
        )
        user = User.objects.create(
            email=email,
            full_name=full_name,
            tenant=tenant,
            external_id=google_sub,
            role=User.Role.OWNER,
            status=User.Status.ACTIVE,
        )
        user.set_unusable_password()
        user.save()
        logger.info("Auto-provisioned Google user %s", email)

    return user, None


@api_view(["POST"])
@permission_classes([AllowAny])
def google_oauth(request):
    """
    POST /auth/google
    Body: { "credential": "<Google ID token>" }
    Returns: { access_token, refresh_token, user }

    The frontend obtains `credential` from Google Identity Services:
      google.accounts.id.initialize({ client_id: '...', callback: (res) => POST res.credential })
    """
    credential = request.data.get("credential", "").strip()
    if not credential:
        return Response({"error": "credential is required"}, status=status.HTTP_400_BAD_REQUEST)

    payload = _verify_google_token(credential)
    if not payload:
        return Response({"error": "Invalid or expired Google token"}, status=status.HTTP_401_UNAUTHORIZED)

    user, error = _get_or_create_google_user(payload)
    if error:
        return Response({"error": error}, status=status.HTTP_403_FORBIDDEN)

    refresh = RefreshToken.for_user(user)
    # Inject custom claims
    refresh["email"]             = user.email
    refresh["role"]              = user.role
    refresh["tenant_id"]         = str(user.tenant_id)
    refresh["organisation_name"] = user.tenant.name

    return Response({
        "access_token":  str(refresh.access_token),
        "refresh_token": str(refresh),
        "user": {
            "id":                str(user.id),
            "email":             user.email,
            "full_name":         user.full_name,
            "role":              user.role,
            "tenant_id":         str(user.tenant_id),
            "organisation_name": user.tenant.name,
            "avatar":            payload.get("picture", ""),
        },
    })
