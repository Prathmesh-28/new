import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

export interface Event {
  event: string;
  payload: any;
  timestamp: string;
  correlationId?: string;
}

export interface EventHandler {
  eventType: string;
  handler: (payload: any, event: Event) => Promise<void>;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  private subscriber: any = null;
  private isSubscribed = false;

  async publish(event: string, payload: any, correlationId?: string): Promise<void> {
    const eventData: Event = {
      event,
      payload,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    const redis = getRedis();
    const message = JSON.stringify(eventData);

    try {
      await redis.publish('headroom.events', message);
      logger.info(`Published event: ${event}`, { correlationId, payloadSize: message.length });
    } catch (error) {
      logger.error(`Failed to publish event: ${event}`, { error, correlationId });
      throw error;
    }
  }

  registerHandler(handler: EventHandler): void {
    if (!this.handlers.has(handler.eventType)) {
      this.handlers.set(handler.eventType, []);
    }
    this.handlers.get(handler.eventType)!.push(handler);
    logger.info(`Registered handler for event: ${handler.eventType}`);
  }

  async subscribe(): Promise<void> {
    if (this.isSubscribed) {
      return;
    }

    const redis = getRedis();
    this.subscriber = redis.duplicate();

    await this.subscriber.subscribe('headroom.events', async (message: string) => {
      try {
        const eventData: Event = JSON.parse(message);
        await this.processEvent(eventData);
      } catch (error) {
        logger.error('Failed to process event message', { error, message });
      }
    });

    this.isSubscribed = true;
    logger.info('Subscribed to event bus');
  }

  private async processEvent(event: Event): Promise<void> {
    const { event: eventType, payload, correlationId } = event;
    const handlers = this.handlers.get(eventType) || [];

    if (handlers.length === 0) {
      logger.warn(`No handlers registered for event: ${eventType}`, { correlationId });
      return;
    }

    for (const handlerConfig of handlers) {
      try {
        await this.executeHandler(handlerConfig, payload, event);
        logger.info(`Successfully processed event: ${eventType}`, {
          correlationId,
          handler: handlerConfig.handler.name,
        });
      } catch (error) {
        logger.error(`Handler failed for event: ${eventType}`, {
          error,
          correlationId,
          handler: handlerConfig.handler.name,
        });

        // Implement retry logic if configured
        if (handlerConfig.retryPolicy) {
          await this.retryHandler(handlerConfig, payload, event);
        }
      }
    }
  }

  private async executeHandler(
    handlerConfig: EventHandler,
    payload: any,
    event: Event
  ): Promise<void> {
    const timeoutMs = 30000; // 30 second timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Handler timeout')), timeoutMs);
    });

    await Promise.race([
      handlerConfig.handler(payload, event),
      timeoutPromise,
    ]);
  }

  private async retryHandler(
    handlerConfig: EventHandler,
    payload: any,
    event: Event
  ): Promise<void> {
    const { maxRetries, backoffMs } = handlerConfig.retryPolicy!;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, backoffMs * attempt));
        await this.executeHandler(handlerConfig, payload, event);
        logger.info(`Retry successful for event: ${event.event}`, {
          attempt,
          correlationId: event.correlationId,
        });
        return;
      } catch (error) {
        logger.warn(`Retry ${attempt} failed for event: ${event.event}`, {
          error,
          attempt,
          maxRetries,
          correlationId: event.correlationId,
        });
      }
    }

    logger.error(`All retries exhausted for event: ${event.event}`, {
      correlationId: event.correlationId,
    });
  }

  async unsubscribe(): Promise<void> {
    if (this.subscriber && this.isSubscribed) {
      await this.subscriber.unsubscribe('headroom.events');
      this.isSubscribed = false;
      logger.info('Unsubscribed from event bus');
    }
  }

  getHandlerCount(eventType?: string): number {
    if (eventType) {
      return this.handlers.get(eventType)?.length || 0;
    }
    return Array.from(this.handlers.values()).reduce((sum, handlers) => sum + handlers.length, 0);
  }
}

// Global event bus instance
export const eventBus = new EventBus();

// Convenience functions
export async function publishEvent(event: string, payload: any, correlationId?: string): Promise<void> {
  return eventBus.publish(event, payload, correlationId);
}

export function registerEventHandler(handler: EventHandler): void {
  eventBus.registerHandler(handler);
}

export async function startEventBus(): Promise<void> {
  await eventBus.subscribe();
}

export async function stopEventBus(): Promise<void> {
  await eventBus.unsubscribe();
}
