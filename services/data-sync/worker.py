"""
Celery application for data-sync workers.

Broker:  AWS SQS  (via kombu's SQS transport)
Backend: Redis    (task result storage)

Beat schedule:
  sync_all_connectors  — every 4 hours
  process_event_queue  — every 30 seconds
"""

from __future__ import annotations

import os

from celery import Celery
from celery.schedules import crontab

# ---------------------------------------------------------------------------
# SQS broker URL
# SQS transport: sqs://ACCESS_KEY:SECRET_KEY@
# Credentials are picked up from env / IAM role automatically by boto3
# ---------------------------------------------------------------------------

_AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
_SQS_QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "headroom-data-sync")
_REDIS_URL = (
    f"redis://:{os.getenv('REDIS_PASSWORD', '')}@"
    f"{os.getenv('REDIS_HOST', 'localhost')}:"
    f"{os.getenv('REDIS_PORT', '6379')}/1"
)

celery_app = Celery(
    "data_sync",
    broker=f"sqs://",
    backend=_REDIS_URL,
    include=["data_sync.tasks"],
)

celery_app.conf.update(
    # SQS transport settings
    broker_transport_options={
        "region": _AWS_REGION,
        "predefined_queues": {
            _SQS_QUEUE_NAME: {
                "url": os.getenv("SQS_QUEUE_URL", ""),
            }
        },
        "visibility_timeout": 3600,
        "polling_interval": 1,
        "wait_time_seconds": 20,   # long polling
    },
    task_default_queue=_SQS_QUEUE_NAME,

    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,

    # Reliability
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # Beat schedule
    beat_schedule={
        "sync-all-connectors-4h": {
            "task": "data_sync.sync_all_connectors",
            "schedule": crontab(minute=0, hour="*/4"),
        },
        "process-event-queue-30s": {
            "task": "data_sync.process_event_queue",
            "schedule": 30.0,  # every 30 seconds
        },
    },
)
