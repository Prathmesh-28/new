import uuid
from django.db import models
from apps.core.models import Tenant


class Forecast(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETE = "complete", "Complete"
        ERROR = "error", "Error"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="forecasts")
    forecast_date = models.DateField()
    generated_at = models.DateTimeField(auto_now_add=True)
    base_model_version = models.CharField(max_length=50, blank=True, null=True)
    days_forecasted = models.IntegerField(default=90)
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.PENDING)
    model_error = models.CharField(max_length=500, blank=True, null=True)
    metadata = models.JSONField(default=dict)

    class Meta:
        db_table = "forecasts"
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["forecast_date"]),
        ]
        ordering = ["-generated_at"]

    def __str__(self):
        return f"Forecast {self.id} — {self.tenant.name} ({self.status})"


class ForecastDatapoint(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    forecast = models.ForeignKey(Forecast, on_delete=models.CASCADE, related_name="datapoints")
    date = models.DateField()
    best_case = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    expected_case = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    downside_case = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    confidence_level = models.DecimalField(max_digits=3, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "forecast_datapoints"
        indexes = [
            models.Index(fields=["forecast"]),
            models.Index(fields=["date"]),
        ]
        ordering = ["date"]


class ForecastScenario(models.Model):
    class Type(models.TextChoices):
        NEW_HIRE = "new_hire", "New Hire"
        CONTRACT_WON = "contract_won", "Contract Won"
        LOAN_DRAW = "loan_draw", "Loan Draw"
        CUSTOM = "custom", "Custom"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="forecast_scenarios")
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=50, choices=Type.choices)
    parameters = models.JSONField(default=dict)
    version = models.IntegerField(default=1)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "forecast_scenarios"
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["active"]),
        ]


class FutureObligation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="future_obligations")
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    obligation_type = models.CharField(max_length=100, blank=True, null=True)
    description = models.CharField(max_length=500, blank=True, null=True)
    source_ref = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "future_obligations"
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["due_date"]),
        ]
