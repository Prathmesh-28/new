from rest_framework import serializers
from apps.core.models import Tenant, BankConnection, Transaction


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ("id", "name", "company_name", "subscription_tier", "status", "max_bank_connections", "features", "created_at")
        read_only_fields = ("id", "created_at")


class BankConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankConnection
        fields = ("id", "provider", "account_name", "account_number", "status", "last_sync", "created_at")
        read_only_fields = ("id", "status", "last_sync", "created_at")


class BankConnectionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankConnection
        fields = ("provider", "access_token", "account_name")

    def create(self, validated_data):
        return BankConnection.objects.create(**validated_data)


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = (
            "id", "date", "amount", "description", "category",
            "counterparty", "is_recurring", "frequency", "confidence_score", "created_at",
        )
        read_only_fields = fields
