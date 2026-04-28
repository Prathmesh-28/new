from rest_framework import serializers
from apps.core.models import BankConnection


class ConnectionStatusSerializer(serializers.ModelSerializer):
    connection_id = serializers.UUIDField(source="id", read_only=True)

    class Meta:
        model = BankConnection
        fields = ("connection_id", "provider", "status", "last_sync", "sync_error")
        read_only_fields = fields


class SyncTriggerResponseSerializer(serializers.Serializer):
    message = serializers.CharField()
    connection_id = serializers.CharField()
    task_id = serializers.CharField(allow_null=True, required=False)
