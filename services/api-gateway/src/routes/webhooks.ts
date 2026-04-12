import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logger } from '../lib/logger.js';

const plaidWebhookSchema = z.object({
  webhook_type: z.string(),
  webhook_code: z.string(),
  item_id: z.string(),
  new_transactions: z.number().optional(),
});

const stripeWebhookSchema = z.object({
  id: z.string(),
  object: z.string(),
  type: z.string(),
  data: z.object({
    object: z.record(z.any()),
  }),
});

export async function registerWebhookRoutes(fastify: FastifyInstance) {
  // POST /webhooks/plaid
  fastify.post('/webhooks/plaid', {
    schema: {
      body: plaidWebhookSchema,
    },
  }, async (request, reply) => {
    const webhook = request.body as z.infer<typeof plaidWebhookSchema>;

    logger.info('Received Plaid webhook', {
      type: webhook.webhook_type,
      code: webhook.webhook_code,
      itemId: webhook.item_id,
      newTransactions: webhook.new_transactions,
    });

    // Process webhook based on type
    switch (webhook.webhook_code) {
      case 'INITIAL_UPDATE':
      case 'HISTORICAL_UPDATE':
        // Trigger transaction sync for this item
        logger.info('Triggering transaction sync for item', webhook.item_id);
        // TODO: Publish to event bus for transaction sync service
        break;

      case 'DEFAULT_UPDATE':
        // New transactions available
        logger.info('New transactions available', {
          itemId: webhook.item_id,
          count: webhook.new_transactions,
        });
        // TODO: Publish to event bus for transaction sync service
        break;

      case 'ERROR':
        logger.error('Plaid webhook error', webhook);
        break;

      default:
        logger.warn('Unknown Plaid webhook code', webhook.webhook_code);
    }

    // Always respond with 200 to acknowledge receipt
    reply.status(200);
    return { received: true };
  });

  // POST /webhooks/stripe
  fastify.post('/webhooks/stripe', {
    schema: {
      body: stripeWebhookSchema,
    },
  }, async (request, reply) => {
    const webhook = request.body as z.infer<typeof stripeWebhookSchema>;

    logger.info('Received Stripe webhook', {
      id: webhook.id,
      type: webhook.type,
      object: webhook.object,
    });

    // Process webhook based on type
    switch (webhook.type) {
      case 'invoice.payment_succeeded':
        // Payment successful - update subscription status
        logger.info('Payment succeeded', webhook.data.object);
        // TODO: Update subscription status in database
        break;

      case 'invoice.payment_failed':
        // Payment failed - handle accordingly
        logger.error('Payment failed', webhook.data.object);
        // TODO: Send notification, update subscription status
        break;

      case 'customer.subscription.deleted':
        // Subscription cancelled
        logger.info('Subscription cancelled', webhook.data.object);
        // TODO: Update tenant subscription status
        break;

      default:
        logger.info('Unhandled Stripe webhook type', webhook.type);
    }

    // Always respond with 200 to acknowledge receipt
    reply.status(200);
    return { received: true };
  });
}
