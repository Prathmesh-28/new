import uuid
from django.db import models
from apps.core.models import Tenant


class Alert(models.Model):
    class Severity(models.TextChoices):
        CRITICAL = "critical", "Critical"
        HIGH = "high", "High"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="alerts")
    alert_type = models.CharField(max_length=100, blank=True, null=True)
    severity = models.CharField(max_length=50, choices=Severity.choices, blank=True, null=True)
    message = models.TextField(blank=True, null=True)
    is_read = models.BooleanField(default=False)
    action_url = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "alerts"
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["is_read"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.severity}] {self.alert_type} — {self.tenant.name}"
