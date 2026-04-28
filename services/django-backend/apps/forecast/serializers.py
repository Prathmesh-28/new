from rest_framework import serializers
from .models import Forecast, ForecastDatapoint, ForecastScenario, FutureObligation


class ForecastDatapointSerializer(serializers.ModelSerializer):
    class Meta:
        model = ForecastDatapoint
        fields = ("date", "best_case", "expected_case", "downside_case", "confidence_level")


class ForecastSerializer(serializers.ModelSerializer):
    datapoints = ForecastDatapointSerializer(many=True, read_only=True)
    tenant_id = serializers.UUIDField(source="tenant_id", read_only=True)

    class Meta:
        model = Forecast
        fields = ("id", "tenant_id", "forecast_date", "generated_at", "days_forecasted", "status", "datapoints")


class ForecastRequestSerializer(serializers.Serializer):
    tenant_id = serializers.UUIDField()
    window_days = serializers.IntegerField(default=90, min_value=1, max_value=365)


class ForecastScenarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = ForecastScenario
        fields = ("id", "name", "type", "parameters", "version", "active", "created_at")
        read_only_fields = ("id", "version", "created_at")


class FutureObligationSerializer(serializers.ModelSerializer):
    class Meta:
        model = FutureObligation
        fields = ("id", "due_date", "amount", "obligation_type", "description", "source_ref", "created_at")
        read_only_fields = ("id", "created_at")
