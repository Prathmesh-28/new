# Event Bus Architecture

## Overview

The event bus enables loose coupling between services while maintaining data consistency. Services communicate through events rather than direct database queries.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   Event Bus     │────│ Forecast Engine │
│                 │    │                 │    │                 │
│ POST /forecast/ │    │ forecast.trigger│    │ Process Event   │
│ trigger         │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
       │                                           │
       │                                           │
       ▼                                           ▼
┌─────────────────┐                         ┌─────────────────┐
│   Database      │◄────────────────────────┤   Database      │
│   (API writes)  │                         │   (Engine writes)│
└─────────────────┘                         └─────────────────┘
```

## Event Types

### forecast.trigger
**Publisher**: API Gateway  
**Consumer**: Forecast Engine  
**Payload**:
```json
{
  "event": "forecast.trigger",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "triggered_by": "api",
  "force": false,
  "timestamp": "2024-01-15T14:32:00Z"
}
```

### forecast.completed
**Publisher**: Forecast Engine  
**Consumer**: API Gateway, Notification Service  
**Payload**:
```json
{
  "event": "forecast.completed",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "forecast_id": "forecast-123",
  "status": "success",
  "datapoints_count": 90,
  "alerts_generated": 2,
  "timestamp": "2024-01-15T14:37:00Z"
}
```

### transaction.sync
**Publisher**: Bank Sync Service  
**Consumer**: Forecast Engine, Credit Service  
**Payload**:
```json
{
  "event": "transaction.sync",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "connection_id": "conn-123",
  "new_transactions": 25,
  "date_range": {
    "start": "2024-01-01",
    "end": "2024-01-15"
  },
  "timestamp": "2024-01-15T12:00:00Z"
}
```

### credit.application.submitted
**Publisher**: API Gateway  
**Consumer**: Credit Service  
**Payload**:
```json
{
  "event": "credit.application.submitted",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "application_id": "app-456",
  "amount_requested": 50000,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### alert.generated
**Publisher**: Forecast Engine  
**Consumer**: Notification Service  
**Payload**:
```json
{
  "event": "alert.generated",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "alert_type": "LOW_CASH_WARNING",
  "severity": "critical",
  "message": "Cash balance projected below $10k on 2024-02-15",
  "projected_date": "2024-02-15",
  "projected_balance": 8500,
  "threshold_balance": 10000,
  "timestamp": "2024-01-15T14:37:00Z"
}
```

## Implementation

### Redis-based Event Bus

```typescript
// Publisher
import { getRedis } from '../lib/redis.js';

export async function publishEvent(event: string, payload: any) {
  const redis = getRedis();
  const message = JSON.stringify({
    event,
    payload,
    timestamp: new Date().toISOString(),
  });

  await redis.publish('headroom.events', message);
}

// Consumer
import { getRedis } from '../lib/redis.js';

export async function subscribeToEvents(handler: (event: string, payload: any) => Promise<void>) {
  const redis = getRedis();

  const subscriber = redis.duplicate();
  await subscriber.subscribe('headroom.events', (message) => {
    try {
      const { event, payload } = JSON.parse(message);
      handler(event, payload);
    } catch (err) {
      console.error('Failed to parse event:', err);
    }
  });
}
```

### Service Integration

```typescript
// In API Gateway - forecast trigger
app.post('/organisations/:orgId/forecast/trigger', async (req, reply) => {
  const { orgId } = req.params;

  // Publish event instead of direct call
  await publishEvent('forecast.trigger', {
    tenant_id: orgId,
    triggered_by: 'api',
    force: req.body.force || false,
  });

  reply.send({ message: 'Forecast trigger queued' });
});

// In Forecast Engine - event handler
subscribeToEvents(async (event, payload) => {
  if (event === 'forecast.trigger') {
    const { tenant_id, force } = payload;

    if (force || shouldRecalculate(tenant_id)) {
      await generateForecast(tenant_id);
    }
  }
});
```

## Benefits

1. **Loose Coupling**: Services don't need to know about each other
2. **Scalability**: Easy to add new consumers for events
3. **Reliability**: Events can be retried if processing fails
4. **Observability**: All inter-service communication is logged
5. **Testing**: Easy to mock events for unit testing

## Event Schema Validation

All events must include:
- `event`: Event type string
- `payload`: Event-specific data
- `timestamp`: ISO 8601 timestamp

Event payloads are validated using Zod schemas:

```typescript
import { z } from 'zod';

const forecastTriggerSchema = z.object({
  event: z.literal('forecast.trigger'),
  payload: z.object({
    tenant_id: z.string().uuid(),
    triggered_by: z.string(),
    force: z.boolean().default(false),
  }),
  timestamp: z.string().datetime(),
});
```

## Error Handling

- Failed event processing is logged and can trigger alerts
- Critical events may be retried with exponential backoff
- Event processing failures don't block the publisher
- Dead letter queue for persistently failing events

## Monitoring

Events are tracked for:
- Publication rate per event type
- Processing latency per consumer
- Error rates per event type
- Queue depth (Redis pub/sub doesn't persist, but we can monitor)

## Future Extensions

- **Event Sourcing**: Store all events for audit trails
- **Event Replay**: Reprocess historical events for debugging
- **Event-driven Sagas**: Complex multi-service transactions
- **Event Streaming**: Replace Redis with Kafka for high-volume scenarios
