from rest_framework import serializers


class UnderwritingResponseSerializer(serializers.Serializer):
    tenant_id = serializers.CharField()
    application_id = serializers.CharField(allow_null=True, required=False)
    score = serializers.IntegerField()
    approved_amount = serializers.FloatField()
    approved_amount_min = serializers.FloatField()
    recommended_product = serializers.CharField()
    decline_reason = serializers.CharField(allow_null=True, required=False)
    fraud_risk = serializers.CharField()
    breakdown = serializers.DictField()
