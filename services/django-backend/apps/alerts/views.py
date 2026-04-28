from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .engine import AlertEngine
from .models import Alert
from .serializers import AlertSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_alerts(request, tenant_id):
    unread_only = request.query_params.get("unread_only", "false").lower() == "true"
    limit = int(request.query_params.get("limit", 50))
    qs = Alert.objects.filter(tenant_id=tenant_id)
    if unread_only:
        qs = qs.filter(is_read=False)
    qs = qs[:limit]
    return Response(AlertSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def evaluate_alerts(request, tenant_id):
    engine = AlertEngine()
    try:
        fired = engine.evaluate(str(tenant_id))
    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    return Response({"tenant_id": str(tenant_id), "alerts_fired": len(fired), "alerts": fired})


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def mark_alert_read(request, tenant_id, alert_id):
    updated = Alert.objects.filter(pk=alert_id, tenant_id=tenant_id).update(is_read=True)
    if not updated:
        return Response({"detail": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response({"marked_read": True, "alert_id": str(alert_id)})


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def mark_all_read(request, tenant_id):
    count = Alert.objects.filter(tenant_id=tenant_id, is_read=False).update(is_read=True)
    return Response({"marked_read": count})
