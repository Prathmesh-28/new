import hashlib
import hmac
import logging

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.models import BankConnection, Tenant, Event
from apps.datasync.tasks import sync_transactions

logger = logging.getLogger(__name__)


def _verify_plaid_signature(request) -> bool:
    """Verify Plaid webhook signature using HMAC-SHA256."""
    secret = getattr(settings, "PLAID_SECRET", "")
    if not secret:
        return True  # Skip verification in dev if no secret configured
    sig = request.headers.get("Plaid-Verification", "")
    body = request.body
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


@api_view(["POST"])
@permission_classes([AllowAny])
def plaid_webhook(request):
    """
    Receive Plaid webhooks and enqueue the appropriate sync task.
    Replaces the FastAPI plaid webhook router from data-sync service.
    """
    if not _verify_plaid_signature(request):
        return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

    data = request.data
    webhook_type = data.get("webhook_type", "")
    webhook_code = data.get("webhook_code", "")
    item_id = data.get("item_id", "")

    logger.info("Plaid webhook: type=%s code=%s item_id=%s", webhook_type, webhook_code, item_id)

    # Store raw event for audit trail
    Event.objects.create(
        event_type=f"plaid.{webhook_type.lower()}.{webhook_code.lower()}",
        payload=data,
    )

    if webhook_type == "TRANSACTIONS":
        if webhook_code in ("INITIAL_UPDATE", "HISTORICAL_UPDATE", "DEFAULT_UPDATE"):
            conn = BankConnection.objects.filter(
                metadata__contains={"item_id": item_id}
            ).first()
            if conn:
                sync_transactions.delay(str(conn.id))
                logger.info("Enqueued sync for connection %s (item_id=%s)", conn.id, item_id)
            else:
                logger.warning("No connection found for Plaid item_id=%s", item_id)

    elif webhook_type == "ITEM":
        if webhook_code == "ERROR":
            BankConnection.objects.filter(
                metadata__contains={"item_id": item_id}
            ).update(status=BankConnection.Status.ERROR, sync_error=str(data.get("error", {})))

    return Response({"received": True})


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "healthy", "service": "webhooks"})
