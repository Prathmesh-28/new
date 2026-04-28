import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin


class Tenant(models.Model):
    class SubscriptionTier(models.TextChoices):
        STARTER = "starter", "Starter"
        GROWTH = "growth", "Growth"
        PRO = "pro", "Pro"
        CAPITAL = "capital", "Capital"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        SUSPENDED = "suspended", "Suspended"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    company_name = models.CharField(max_length=255, blank=True, null=True)
    subscription_tier = models.CharField(
        max_length=50, choices=SubscriptionTier.choices, default=SubscriptionTier.STARTER
    )
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.ACTIVE)
    max_bank_connections = models.IntegerField(default=2)
    features = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "tenants"
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return self.name


class UserManager(BaseUserManager):
    def create_user(self, email, tenant, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, tenant=tenant, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        tenant, _ = Tenant.objects.get_or_create(
            name="system",
            defaults={"company_name": "System", "subscription_tier": "pro"},
        )
        return self.create_user(email, tenant=tenant, password=password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ACCOUNTANT = "accountant", "Accountant"
        INVESTOR = "investor", "Investor"
        ADMIN = "admin", "Admin"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        INVITED = "invited", "Invited"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="users")
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255, blank=True, null=True)
    full_name = models.CharField(max_length=255, blank=True, null=True)
    role = models.CharField(max_length=50, choices=Role.choices, default=Role.OWNER)
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.ACTIVE)
    external_id = models.CharField(max_length=255, blank=True, null=True)
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "users"
        unique_together = [("tenant", "email")]
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["email"]),
            models.Index(fields=["role"]),
        ]

    def __str__(self):
        return f"{self.email} ({self.tenant.name})"


class Session(models.Model):
    token = models.CharField(max_length=255, primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="sessions")
    expires_at = models.DateTimeField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sessions"
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["tenant"]),
            models.Index(fields=["expires_at"]),
        ]


class BankConnection(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONNECTED = "connected", "Connected"
        DISCONNECTED = "disconnected", "Disconnected"
        ERROR = "error", "Error"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="bank_connections")
    provider = models.CharField(max_length=100)
    account_name = models.CharField(max_length=255, blank=True, null=True)
    account_number = models.CharField(max_length=50, blank=True, null=True)
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.PENDING)
    access_token = models.CharField(max_length=500, blank=True, null=True)
    refresh_token = models.CharField(max_length=500, blank=True, null=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    last_sync = models.DateTimeField(null=True, blank=True)
    sync_error = models.CharField(max_length=500, blank=True, null=True)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "bank_connections"
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.provider} — {self.tenant.name}"


class Transaction(models.Model):
    class Category(models.TextChoices):
        REVENUE = "revenue", "Revenue"
        OPERATING_EXPENSE = "operating_expense", "Operating Expense"
        CAPITAL_EXPENSE = "capital_expense", "Capital Expense"
        PAYROLL = "payroll", "Payroll"
        LOAN_PAYMENT = "loan_payment", "Loan Payment"
        TAX = "tax", "Tax"
        TRANSFER = "transfer", "Transfer"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="transactions")
    bank_connection = models.ForeignKey(
        BankConnection, on_delete=models.SET_NULL, null=True, blank=True, related_name="transactions"
    )
    date = models.DateField()
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    description = models.CharField(max_length=500, blank=True, null=True)
    category = models.CharField(max_length=50, choices=Category.choices, blank=True, null=True)
    counterparty = models.CharField(max_length=255, blank=True, null=True)
    is_recurring = models.BooleanField(default=False)
    frequency = models.CharField(max_length=50, blank=True, null=True)
    confidence_score = models.DecimalField(max_digits=3, decimal_places=2, null=True, blank=True)
    source_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    raw_data = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "transactions"
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["bank_connection"]),
            models.Index(fields=["date"]),
            models.Index(fields=["category"]),
        ]

    def __str__(self):
        return f"{self.date} {self.amount} ({self.tenant.name})"


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="audit_logs")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=100, blank=True, null=True)
    resource_type = models.CharField(max_length=100, blank=True, null=True)
    resource_id = models.CharField(max_length=255, blank=True, null=True)
    changes = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_log"
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["user"]),
            models.Index(fields=["timestamp"]),
        ]


class Event(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="events", null=True, blank=True
    )
    event_type = models.CharField(max_length=100)
    payload = models.JSONField()
    processed = models.BooleanField(default=False)
    error_message = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "events"
        indexes = [
            models.Index(fields=["tenant"]),
            models.Index(fields=["event_type"]),
            models.Index(fields=["processed"]),
        ]

    def __str__(self):
        return f"{self.event_type} (processed={self.processed})"
