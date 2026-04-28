from rest_framework import serializers
from .models import Alert


class AlertSerializer(serializers.ModelSerializer):
    tenant_id = serializers.UUIDField(source="tenant_id", read_only=True)

    class Meta:
        model = Alert
        fields = ("id", "tenant_id", "alert_type", "severity", "message", "is_read", "action_url", "created_at")
        read_only_fields = fields
