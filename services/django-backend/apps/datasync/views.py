from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.models import BankConnection
from .tasks import sync_transactions, sync_balances, sync_all_connectors
from .serializers import ConnectionStatusSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def health(request):
    from .connectors import CONNECTOR_MAP
    return Response({"status": "healthy", "service": "data-sync", "providers": list(CONNECTOR_MAP.keys())})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def trigger_sync(request, connection_id):
    since = request.query_params.get("since") or request.data.get("since")
    task = sync_transactions.delay(str(connection_id), since)
    return Response({"message": "Sync task enqueued", "connection_id": str(connection_id), "task_id": task.id})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def trigger_balance_sync(request, connection_id):
    task = sync_balances.delay(str(connection_id))
    return Response({"message": "Balance sync task enqueued", "connection_id": str(connection_id), "task_id": task.id})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sync_status(request, connection_id):
    try:
        conn = BankConnection.objects.get(pk=connection_id)
    except BankConnection.DoesNotExist:
        return Response({"detail": "Connection not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(ConnectionStatusSerializer(conn).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def trigger_all_syncs(request):
    task = sync_all_connectors.delay()
    return Response({"message": "All-connector sync enqueued", "task_id": task.id})
