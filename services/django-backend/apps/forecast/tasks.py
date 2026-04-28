import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_forecast_task(self, tenant_id: str, window_days: int = 90):
    """Celery task: generate and persist a forecast for one tenant."""
    from apps.core.models import Tenant, Transaction
    from apps.forecast.models import Forecast, ForecastDatapoint
    from apps.forecast.engine import generate_forecast_datapoints

    try:
        tenant = Tenant.objects.get(pk=tenant_id)
        transactions = list(
            Transaction.objects.filter(tenant=tenant).order_by("-date")[:1000]
        )

        datapoints = generate_forecast_datapoints(transactions, window_days)

        forecast = Forecast.objects.create(
            tenant=tenant,
            forecast_date=timezone.now().date(),
            days_forecasted=window_days,
            status=Forecast.Status.PENDING,
        )

        ForecastDatapoint.objects.bulk_create([
            ForecastDatapoint(
                forecast=forecast,
                date=dp["date"],
                best_case=dp["best_case"],
                expected_case=dp["expected_case"],
                downside_case=dp["downside_case"],
                confidence_level=dp["confidence_level"],
            )
            for dp in datapoints
        ])

        forecast.status = Forecast.Status.COMPLETE
        forecast.save(update_fields=["status"])

        # Emit event so alert engine can react
        from apps.core.models import Event
        Event.objects.create(
            tenant=tenant,
            event_type="forecast.completed",
            payload={"forecast_id": str(forecast.id), "tenant_id": tenant_id},
        )

        # Enqueue alert evaluation
        from apps.alerts.tasks import evaluate_alerts_task
        evaluate_alerts_task.delay(tenant_id)

        logger.info("Forecast %s generated for tenant %s (%d datapoints)", forecast.id, tenant_id, len(datapoints))
        return str(forecast.id)

    except Exception as exc:
        logger.exception("Forecast task failed for tenant %s: %s", tenant_id, exc)
        raise self.retry(exc=exc)


@shared_task
def schedule_daily_forecasts():
    """Beat task: trigger forecast regeneration for all active tenants daily."""
    from apps.core.models import Tenant
    for tenant in Tenant.objects.filter(status="active"):
        generate_forecast_task.delay(str(tenant.id))
