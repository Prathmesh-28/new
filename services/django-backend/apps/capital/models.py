import uuid
from django.db import models
from apps.core.models import Tenant


class CapitalRaise(models.Model):
    class Track(models.TextChoices):
        REV_SHARE = "rev_share", "Revenue Share"
        REG_CF = "reg_cf", "Reg CF"
        REG_A_PLUS = "reg_a_plus", "Reg A+"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        CLOSED = "closed", "Closed"
        FUNDED = "funded", "Funded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="capital_raises")
    track = models.CharField(max_length=50, choices=Track.choices)
    target_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    raised_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.DRAFT)
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "capital_raises"
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["status"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.track} raise — {self.tenant.name} ({self.status})"


class CapitalInvestor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    capital_raise = models.ForeignKey(CapitalRaise, on_delete=models.CASCADE, related_name="investors")
    investor_email = models.EmailField(blank=True, null=True)
    investment_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    equity_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=50, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "capital_investors"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.investor_email} — ${self.investment_amount}"
