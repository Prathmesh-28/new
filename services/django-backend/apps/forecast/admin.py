from django.contrib import admin
from .models import Forecast, ForecastDatapoint, ForecastScenario, FutureObligation


class ForecastDatapointInline(admin.TabularInline):
    model = ForecastDatapoint
    extra = 0
    readonly_fields = ("date", "best_case", "expected_case", "downside_case", "confidence_level")
    can_delete = False


@admin.register(Forecast)
class ForecastAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant", "forecast_date", "days_forecasted", "status", "generated_at")
    list_filter = ("status", "tenant")
    inlines = [ForecastDatapointInline]
    readonly_fields = ("generated_at",)


@admin.register(ForecastScenario)
class ForecastScenarioAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "tenant", "active", "created_at")
    list_filter = ("type", "active")


@admin.register(FutureObligation)
class FutureObligationAdmin(admin.ModelAdmin):
    list_display = ("due_date", "amount", "obligation_type", "tenant", "created_at")
    list_filter = ("obligation_type",)
    date_hierarchy = "due_date"
