import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def evaluate_alerts_task(self, tenant_id: str):
    """Celery task: run the alert engine for one tenant."""
    from .engine import AlertEngine
    try:
        engine = AlertEngine()
        fired = engine.evaluate(tenant_id)
        logger.info("Alert evaluation complete for tenant %s — %d alerts fired", tenant_id, len(fired))
        return {"tenant_id": tenant_id, "alerts_fired": len(fired)}
    except Exception as exc:
        logger.exception("Alert evaluation failed for tenant %s: %s", tenant_id, exc)
        raise self.retry(exc=exc)


@shared_task
def poll_forecast_events():
    """
    Beat task: polls the events table for unprocessed forecast.completed events
    and triggers alert evaluation — replaces the asyncio poller from alert-engine.
    """
    from apps.core.models import Event
    from django.utils import timezone

    events = list(
        Event.objects.filter(event_type="forecast.completed", processed=False)
        .select_for_update(skip_locked=True)[:20]
    )
    for event in events:
        tenant_id = str(event.tenant_id)
        try:
            evaluate_alerts_task.delay(tenant_id)
        finally:
            event.processed = True
            event.processed_at = timezone.now()
            event.save(update_fields=["processed", "processed_at"])
