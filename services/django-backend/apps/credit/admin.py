from django.contrib import admin
from .models import CreditApplication, CreditOffer


class CreditOfferInline(admin.TabularInline):
    model = CreditOffer
    extra = 0
    readonly_fields = ("lender_partner", "product_type", "offer_amount", "apr_equivalent", "status", "expires_at")
    can_delete = False


@admin.register(CreditApplication)
class CreditApplicationAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant", "status", "loan_amount", "underwriting_score", "fraud_check_status", "created_at")
    list_filter = ("status", "fraud_check_status")
    search_fields = ("tenant__name",)
    inlines = [CreditOfferInline]
    readonly_fields = ("created_at", "updated_at")


@admin.register(CreditOffer)
class CreditOfferAdmin(admin.ModelAdmin):
    list_display = ("lender_partner", "product_type", "offer_amount", "apr_equivalent", "status", "created_at")
    list_filter = ("lender_partner", "product_type", "status")
