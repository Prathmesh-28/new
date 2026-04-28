from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Tenant, User, Session, BankConnection, Transaction, AuditLog, Event


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "company_name", "subscription_tier", "status", "created_at")
    list_filter = ("subscription_tier", "status")
    search_fields = ("name", "company_name")
    ordering = ("-created_at",)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "tenant", "role", "status", "is_staff", "created_at")
    list_filter = ("role", "status", "is_staff", "tenant")
    search_fields = ("email", "full_name")
    ordering = ("-created_at",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal", {"fields": ("full_name", "tenant", "role", "status", "external_id")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login",)}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "tenant", "password1", "password2")}),
    )
    filter_horizontal = ("groups", "user_permissions")


@admin.register(BankConnection)
class BankConnectionAdmin(admin.ModelAdmin):
    list_display = ("provider", "tenant", "account_name", "status", "last_sync")
    list_filter = ("provider", "status")
    search_fields = ("tenant__name", "account_name")


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("date", "amount", "category", "tenant", "is_recurring", "counterparty")
    list_filter = ("category", "is_recurring", "tenant")
    search_fields = ("description", "counterparty", "tenant__name")
    date_hierarchy = "date"


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "resource_type", "resource_id", "tenant", "user", "timestamp")
    list_filter = ("action", "resource_type")
    readonly_fields = ("timestamp",)


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("event_type", "tenant", "processed", "created_at", "processed_at")
    list_filter = ("event_type", "processed")
    readonly_fields = ("created_at",)


admin.site.register(Session)
