from rest_framework import serializers
from .models import CreditApplication, CreditOffer


class CreditOfferSerializer(serializers.ModelSerializer):
    credit_application_id = serializers.UUIDField(source="credit_application_id", read_only=True)

    class Meta:
        model = CreditOffer
        fields = (
            "id", "credit_application_id", "lender_partner", "product_type", "offer_amount",
            "apr_equivalent", "term_months_est", "expires_at", "status", "created_at",
        )
        read_only_fields = fields


class CreditApplicationSerializer(serializers.ModelSerializer):
    offers = CreditOfferSerializer(many=True, read_only=True)
    tenant_id = serializers.UUIDField(source="tenant_id", read_only=True)

    class Meta:
        model = CreditApplication
        fields = (
            "id", "tenant_id", "status", "loan_amount", "term_months",
            "underwriting_score", "credit_score", "fraud_check_status",
            "offers", "created_at", "updated_at",
        )
        read_only_fields = fields


class CreateApplicationSerializer(serializers.Serializer):
    tenant_id = serializers.UUIDField()


class SubmitApplicationSerializer(serializers.Serializer):
    tenant_id = serializers.UUIDField()
    loan_amount = serializers.FloatField(min_value=1000)
    term_months = serializers.IntegerField(min_value=1, max_value=120)
    purpose = serializers.CharField(required=False, allow_blank=True)
