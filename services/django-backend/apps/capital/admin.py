from django.contrib import admin
from .models import CapitalRaise, CapitalInvestor


class CapitalInvestorInline(admin.TabularInline):
    model = CapitalInvestor
    extra = 0
    readonly_fields = ("investor_email", "investment_amount", "equity_percentage", "status", "created_at")
    can_delete = False


@admin.register(CapitalRaise)
class CapitalRaiseAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant", "track", "target_amount", "raised_amount", "status", "created_at")
    list_filter = ("track", "status")
    search_fields = ("tenant__name",)
    inlines = [CapitalInvestorInline]
    readonly_fields = ("created_at", "updated_at")


@admin.register(CapitalInvestor)
class CapitalInvestorAdmin(admin.ModelAdmin):
    list_display = ("investor_email", "investment_amount", "equity_percentage", "status", "created_at")
    list_filter = ("status",)
