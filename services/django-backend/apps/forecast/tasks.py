import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_forecast_task(self, tenant_id: str, window_days: int = 90):
    """Celery task: run the 6-layer ensemble and persist forecast datapoints."""
    from apps.core.models import Tenant, Transaction
    from apps.forecast.models import Forecast, ForecastDatapoint
    from apps.organizations.forecasting import transactions_to_observations, forecast_cashflow

    try:
        tenant = Tenant.objects.get(pk=tenant_id)
        tx_qs  = Transaction.objects.filter(tenant=tenant).order_by("date")[:2000]
        obs    = transactions_to_observations(tx_qs)
        pts    = forecast_cashflow(obs, horizon_days=window_days)

        forecast = Forecast.objects.create(
            tenant=tenant,
            forecast_date=timezone.now().date(),
            days_forecasted=window_days,
            status=Forecast.Status.PENDING,
            base_model_version="2.0-ensemble",
        )

        ForecastDatapoint.objects.bulk_create([
            ForecastDatapoint(
                forecast=forecast,
                date=p.date,
                best_case=p.balance_p90,
                expected_case=p.balance_p50,
                downside_case=p.balance_p10,
                confidence_level=p.confidence_score,
            )
            for p in pts
        ])

        forecast.status = Forecast.Status.COMPLETE
        forecast.save(update_fields=["status"])

        from apps.core.models import Event
        Event.objects.create(
            tenant=tenant,
            event_type="forecast.completed",
            payload={"forecast_id": str(forecast.id), "tenant_id": tenant_id},
        )

        from apps.alerts.tasks import evaluate_alerts_task
        evaluate_alerts_task.delay(tenant_id)

        logger.info("Forecast %s generated for tenant %s (%d points)", forecast.id, tenant_id, len(pts))
        return str(forecast.id)

    except Exception as exc:
        logger.exception("Forecast task failed for tenant %s: %s", tenant_id, exc)
        raise self.retry(exc=exc)


@shared_task
def schedule_daily_forecasts():
    from apps.core.models import Tenant
    for tenant in Tenant.objects.filter(status="active"):
        generate_forecast_task.delay(str(tenant.id))
