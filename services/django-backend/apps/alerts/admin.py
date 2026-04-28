from django.contrib import admin
from .models import Alert


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ("alert_type", "severity", "tenant", "is_read", "created_at")
    list_filter = ("severity", "is_read", "alert_type")
    search_fields = ("tenant__name", "message")
    date_hierarchy = "created_at"
    actions = ["mark_as_read"]

    @admin.action(description="Mark selected alerts as read")
    def mark_as_read(self, request, queryset):
        queryset.update(is_read=True)
