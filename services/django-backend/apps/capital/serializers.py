from rest_framework import serializers
from .models import CapitalRaise, CapitalInvestor


class CapitalInvestorSerializer(serializers.ModelSerializer):
    class Meta:
        model = CapitalInvestor
        fields = ("id", "investor_email", "investment_amount", "equity_percentage", "status", "created_at")
        read_only_fields = fields


class CapitalRaiseSerializer(serializers.ModelSerializer):
    investors = CapitalInvestorSerializer(many=True, read_only=True)
    tenant_id = serializers.UUIDField(source="tenant_id", read_only=True)

    class Meta:
        model = CapitalRaise
        fields = ("id", "tenant_id", "track", "target_amount", "raised_amount", "status",
                  "start_date", "end_date", "created_at", "investors")
        read_only_fields = ("id", "raised_amount", "created_at", "investors", "tenant_id")


class CreateRaiseSerializer(serializers.Serializer):
    tenant_id = serializers.UUIDField()
    track = serializers.ChoiceField(choices=CapitalRaise.Track.choices)
    target_amount = serializers.FloatField(min_value=1)


class InvestSerializer(serializers.Serializer):
    investor_email = serializers.EmailField()
    amount = serializers.FloatField(min_value=1)
    accredited = serializers.BooleanField(default=False)
