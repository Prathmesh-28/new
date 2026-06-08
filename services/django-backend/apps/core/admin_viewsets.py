from rest_framework import viewsets, permissions, serializers
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from .models import Tenant, User, BankConnection, Transaction, AuditLog
from apps.forecast.models import Forecast, ForecastScenario
from apps.credit.models import CreditApplication
from apps.capital.models import CapitalRaise
from apps.alerts.models import Alert


class IsSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.is_staff or getattr(request.user, "role", "") == "admin"


# ── Tenants ───────────────────────────────────────────────────────────────────

class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = "__all__"

class TenantViewSet(viewsets.ModelViewSet):
    queryset = Tenant.objects.all().order_by("-created_at")
    serializer_class = TenantSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["subscription_tier", "status"]
    search_fields = ["name", "company_name"]
    ordering_fields = ["created_at", "name", "subscription_tier"]


# ── Users ─────────────────────────────────────────────────────────────────────

class UserAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        exclude = ["password"]

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related("tenant").all().order_by("-created_at")
    serializer_class = UserAdminSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["role", "status", "tenant"]
    search_fields = ["email", "full_name"]
    ordering_fields = ["created_at", "email", "role"]


# ── Bank Connections ──────────────────────────────────────────────────────────

class BankConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankConnection
        fields = "__all__"

class BankConnectionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BankConnection.objects.select_related("tenant").all().order_by("-created_at")
    serializer_class = BankConnectionSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["provider", "status"]
    search_fields = ["account_name", "tenant__name"]


# ── Transactions ──────────────────────────────────────────────────────────────

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = "__all__"

class TransactionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Transaction.objects.select_related("tenant").all().order_by("-date")
    serializer_class = TransactionSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["category", "is_recurring"]
    search_fields = ["description", "counterparty"]
    ordering_fields = ["date", "amount"]


# ── Alerts ────────────────────────────────────────────────────────────────────

class AlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alert
        fields = "__all__"

class AlertViewSet(viewsets.ModelViewSet):
    queryset = Alert.objects.select_related("tenant").all().order_by("-created_at")
    serializer_class = AlertSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["severity", "is_read", "alert_type"]
    search_fields = ["message", "tenant__name"]


# ── Credit Applications ───────────────────────────────────────────────────────

class CreditApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CreditApplication
        fields = "__all__"

class CreditApplicationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CreditApplication.objects.select_related("tenant").all().order_by("-created_at")
    serializer_class = CreditApplicationSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["status", "fraud_check_status"]
    search_fields = ["tenant__name"]
    ordering_fields = ["created_at", "loan_amount", "underwriting_score"]


# ── Capital Raises ────────────────────────────────────────────────────────────

class CapitalRaiseSerializer(serializers.ModelSerializer):
    class Meta:
        model = CapitalRaise
        fields = "__all__"

class CapitalRaiseViewSet(viewsets.ModelViewSet):
    queryset = CapitalRaise.objects.select_related("tenant").all().order_by("-created_at")
    serializer_class = CapitalRaiseSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["track", "status"]
    search_fields = ["tenant__name"]


# ── Forecasts ─────────────────────────────────────────────────────────────────

class ForecastSerializer(serializers.ModelSerializer):
    class Meta:
        model = Forecast
        fields = "__all__"

class ForecastViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Forecast.objects.select_related("tenant").all().order_by("-forecast_date")
    serializer_class = ForecastSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["status"]
    search_fields = ["tenant__name"]


# ── Audit Logs ────────────────────────────────────────────────────────────────

class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = "__all__"

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("tenant", "user").all().order_by("-timestamp")
    serializer_class = AuditLogSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["action", "resource_type"]
    search_fields = ["resource_id", "tenant__name"]
    ordering_fields = ["timestamp"]
