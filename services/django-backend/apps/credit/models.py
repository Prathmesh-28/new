import uuid
from django.db import models
from apps.core.models import Tenant


class CreditApplication(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        FUNDED = "funded", "Funded"
        REPAID = "repaid", "Repaid"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="credit_applications")
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.DRAFT)
    loan_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    interest_rate = models.DecimalField(max_digits=5, decimal_places=3, null=True, blank=True)
    term_months = models.IntegerField(null=True, blank=True)
    monthly_payment = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    credit_score = models.IntegerField(null=True, blank=True)
    underwriting_score = models.IntegerField(null=True, blank=True)
    score_breakdown = models.JSONField(null=True, blank=True)
    fraud_check_status = models.CharField(max_length=50, default="pending", blank=True)
    funded_date = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credit_applications"
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["status"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"CreditApp {self.id} — {self.tenant.name} ({self.status})"


class CreditOffer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    credit_application = models.ForeignKey(
        CreditApplication, on_delete=models.CASCADE, related_name="offers"
    )
    lender_partner = models.CharField(max_length=255)
    product_type = models.CharField(max_length=100)
    offer_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    factor_rate = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    apr_equivalent = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)
    repayment_pct = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    repayment_floor = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    repayment_ceil_pct = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    term_months_est = models.IntegerField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=50, default="active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credit_offers"
        indexes = [
            models.Index(fields=["credit_application"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.lender_partner} — {self.product_type} (${self.offer_amount})"
