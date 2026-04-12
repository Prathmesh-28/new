import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import { withTenantContext } from '../lib/database.js';
import { getRedis } from '../lib/redis.js';
import { NotFoundError } from '../middleware/errorHandler.js';

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(1000).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const transactionFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
});

const forecastTriggerSchema = z.object({
  force: z.boolean().default(false),
});

const creditApplicationSchema = z.object({
  amountRequested: z.coerce.number().min(1000).max(1000000),
  useCase: z.string().min(10).max(500),
});

const scenarioSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['new_hire', 'contract_won', 'loan_draw', 'custom']),
  parameters: z.record(z.any()),
});

export async function registerOrganisationRoutes(fastify: FastifyInstance) {
  // GET /organisations/:orgId/accounts
  fastify.get('/organisations/:orgId/accounts', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
      querystring: paginationSchema,
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { limit, offset } = request.query as z.infer<typeof paginationSchema>;

    const result = await withTenantContext(orgId, async (client) => {
      return client.query(
        `SELECT id, provider, provider_account_id, account_name, account_type, status, last_sync
         FROM bank_connections
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [orgId, limit, offset]
      );
    });

    return {
      data: result.rows,
      pagination: { limit, offset, total: result.rows.length },
    };
  });

  // POST /organisations/:orgId/accounts
  fastify.post('/organisations/:orgId/accounts', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
      body: z.object({
        provider: z.enum(['plaid', 'quickbooks', 'xero', 'tally']),
        accessToken: z.string(),
        accountName: z.string().min(1).max(100),
      }),
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { provider, accessToken, accountName } = request.body as any;

    // In a real implementation, this would validate the access token
    // and create the bank connection record
    const result = await withTenantContext(orgId, async (client) => {
      return client.query(
        `INSERT INTO bank_connections (tenant_id, provider, access_token, account_name, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, provider, account_name, status, created_at`,
        [orgId, provider, accessToken, accountName]
      );
    });

    reply.status(201);
    return result.rows[0];
  });

  // GET /organisations/:orgId/transactions
  fastify.get('/organisations/:orgId/transactions', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
      querystring: paginationSchema.merge(transactionFiltersSchema),
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { limit, offset, startDate, endDate, category, minAmount, maxAmount } =
      request.query as z.infer<typeof paginationSchema & typeof transactionFiltersSchema>;

    const result = await withTenantContext(orgId, async (client) => {
      let query = `
        SELECT id, date, amount, description, category, is_recurring, merchant_name
        FROM transactions
        WHERE tenant_id = $1
      `;
      const params = [orgId];
      let paramIndex = 2;

      if (startDate) {
        query += ` AND date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND date <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (minAmount !== undefined) {
        query += ` AND amount >= $${paramIndex}`;
        params.push(minAmount);
        paramIndex++;
      }

      if (maxAmount !== undefined) {
        query += ` AND amount <= $${paramIndex}`;
        params.push(maxAmount);
        paramIndex++;
      }

      query += ` ORDER BY date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      return client.query(query, params);
    });

    return {
      data: result.rows,
      pagination: { limit, offset, total: result.rows.length },
    };
  });

  // GET /organisations/:orgId/forecast
  fastify.get('/organisations/:orgId/forecast', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    // Check Redis cache first
    const redis = getRedis();
    const cacheKey = `forecast:${orgId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Get from database
    const result = await withTenantContext(orgId, async (client) => {
      return client.query(
        `SELECT f.id, f.generated_at, f.status, f.model_version,
                dp.date, dp.balance_p10, dp.balance_p50, dp.balance_p90
         FROM forecasts f
         LEFT JOIN forecast_datapoints dp ON dp.forecast_id = f.id
         WHERE f.tenant_id = $1 AND f.status = 'complete'
         ORDER BY f.generated_at DESC, dp.date ASC
         LIMIT 90`,
        [orgId]
      );
    });

    if (result.rows.length === 0) {
      throw new NotFoundError('No forecast available for this organisation');
    }

    const forecast = {
      id: result.rows[0].id,
      generatedAt: result.rows[0].generated_at,
      status: result.rows[0].status,
      modelVersion: result.rows[0].model_version,
      datapoints: result.rows.map(row => ({
        date: row.date,
        balanceP10: row.balance_p10,
        balanceP50: row.balance_p50,
        balanceP90: row.balance_p90,
      })),
    };

    // Cache for 1 hour
    await redis.set(cacheKey, JSON.stringify(forecast), { EX: 3600 });

    return forecast;
  });

  // POST /organisations/:orgId/forecast/trigger
  fastify.post('/organisations/:orgId/forecast/trigger', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
      body: forecastTriggerSchema,
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { force } = request.body as z.infer<typeof forecastTriggerSchema>;

    // Rate limit forecast triggers to 10 per minute per org
    const redis = getRedis();
    const rateLimitKey = `forecast_trigger:${orgId}`;
    const currentCount = await redis.incr(rateLimitKey);
    await redis.expire(rateLimitKey, 60); // 1 minute window

    if (currentCount > 10 && !force) {
      reply.status(429);
      return {
        error: 'Rate limit exceeded',
        message: 'Forecast can only be triggered 10 times per minute',
        retryAfter: 60,
      };
    }

    // Trigger forecast calculation (would publish to event bus)
    // For now, just return success
    return {
      success: true,
      message: 'Forecast calculation triggered',
      organisationId: orgId,
    };
  });

  // GET /organisations/:orgId/forecast/scenarios
  fastify.get('/organisations/:orgId/forecast/scenarios', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
      querystring: paginationSchema,
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { limit, offset } = request.query as z.infer<typeof paginationSchema>;

    const result = await withTenantContext(orgId, async (client) => {
      return client.query(
        `SELECT id, name, type, parameters, created_at
         FROM forecast_scenarios
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [orgId, limit, offset]
      );
    });

    return {
      data: result.rows,
      pagination: { limit, offset, total: result.rows.length },
    };
  });

  // POST /organisations/:orgId/forecast/scenarios
  fastify.post('/organisations/:orgId/forecast/scenarios', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
      body: scenarioSchema,
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { name, type, parameters } = request.body as z.infer<typeof scenarioSchema>;

    const result = await withTenantContext(orgId, async (client) => {
      return client.query(
        `INSERT INTO forecast_scenarios (tenant_id, name, type, parameters)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, type, parameters, created_at`,
        [orgId, name, type, JSON.stringify(parameters)]
      );
    });

    reply.status(201);
    return result.rows[0];
  });

  // GET /organisations/:orgId/alerts
  fastify.get('/organisations/:orgId/alerts', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
      querystring: paginationSchema.merge(z.object({
        severity: z.enum(['critical', 'warning', 'info']).optional(),
        resolved: z.coerce.boolean().default(false),
      })),
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { limit, offset, severity, resolved } = request.query as any;

    const result = await withTenantContext(orgId, async (client) => {
      let query = `
        SELECT id, type, severity, message, projected_date, projected_balance,
               threshold_balance, created_at, resolved_at
        FROM alerts
        WHERE tenant_id = $1
      `;
      const params = [orgId];
      let paramIndex = 2;

      if (severity) {
        query += ` AND severity = $${paramIndex}`;
        params.push(severity);
        paramIndex++;
      }

      if (!resolved) {
        query += ` AND resolved_at IS NULL`;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      return client.query(query, params);
    });

    return {
      data: result.rows,
      pagination: { limit, offset, total: result.rows.length },
    };
  });

  // POST /organisations/:orgId/credit/apply
  fastify.post('/organisations/:orgId/credit/apply', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
      body: creditApplicationSchema,
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { amountRequested, useCase } = request.body as z.infer<typeof creditApplicationSchema>;

    const result = await withTenantContext(orgId, async (client) => {
      return client.query(
        `INSERT INTO credit_applications (tenant_id, amount_requested, use_case, status)
         VALUES ($1, $2, $3, 'draft')
         RETURNING id, amount_requested, use_case, status, created_at`,
        [orgId, amountRequested, useCase]
      );
    });

    reply.status(201);
    return result.rows[0];
  });

  // GET /organisations/:orgId/credit/offers
  fastify.get('/organisations/:orgId/credit/offers', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
      querystring: paginationSchema,
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { limit, offset } = request.query as z.infer<typeof paginationSchema>;

    const result = await withTenantContext(orgId, async (client) => {
      return client.query(
        `SELECT co.id, co.lender_partner, co.product_type, co.amount, co.apr_equivalent,
                co.repayment_pct, co.repayment_floor, co.repayment_ceil_pct,
                co.term_months_est, co.status, co.created_at,
                ca.amount_requested, ca.use_case
         FROM credit_offers co
         JOIN credit_applications ca ON ca.id = co.credit_application_id
         WHERE ca.tenant_id = $1
         ORDER BY co.created_at DESC
         LIMIT $2 OFFSET $3`,
        [orgId, limit, offset]
      );
    });

    return {
      data: result.rows,
      pagination: { limit, offset, total: result.rows.length },
    };
  });

  // POST /organisations/:orgId/credit/accept/:offerId
  fastify.post('/organisations/:orgId/credit/accept/:offerId', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({
        orgId: z.string().uuid(),
        offerId: z.string().uuid(),
      }),
    },
  }, async (request, reply) => {
    const { orgId, offerId } = request.params as { orgId: string; offerId: string };

    // Update offer status and create active loan
    const result = await withTenantContext(orgId, async (client) => {
      // First, mark offer as accepted
      await client.query(
        `UPDATE credit_offers SET status = 'accepted' WHERE id = $1`,
        [offerId]
      );

      // Create active loan record
      return client.query(
        `INSERT INTO credit_active_loans (
           tenant_id, credit_offer_id, status, disbursed_amount, outstanding_balance
         )
         SELECT $1, $2, 'active', amount, amount
         FROM credit_offers
         WHERE id = $2
         RETURNING id, disbursed_amount, outstanding_balance, status`,
        [orgId, offerId]
      );
    });

    return {
      success: true,
      loan: result.rows[0],
    };
  });

  // GET /organisations/:orgId/loans
  fastify.get('/organisations/:orgId/loans', {
    preHandler: [requireAuth, requireOrgAccess],
    schema: {
      params: z.object({ orgId: z.string().uuid() }),
      querystring: paginationSchema,
    },
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { limit, offset } = request.query as z.infer<typeof paginationSchema>;

    const result = await withTenantContext(orgId, async (client) => {
      return client.query(
        `SELECT cal.id, cal.status, cal.disbursed_amount, cal.outstanding_balance,
                cal.next_payment_date, cal.next_payment_amount, cal.created_at,
                co.lender_partner, co.product_type, co.apr_equivalent
         FROM credit_active_loans cal
         JOIN credit_offers co ON co.id = cal.credit_offer_id
         WHERE cal.tenant_id = $1
         ORDER BY cal.created_at DESC
         LIMIT $2 OFFSET $3`,
        [orgId, limit, offset]
      );
    });

    return {
      data: result.rows,
      pagination: { limit, offset, total: result.rows.length },
    };
  });
}
