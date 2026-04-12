import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import { config } from 'dotenv';
import { logger } from './lib/logger.js';
import { initializeDatabase } from './lib/database.js';
import { initializeRedis } from './lib/redis.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerOrganisationRoutes } from './routes/organisations.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { errorHandler } from './middleware/errorHandler.js';

config();

async function bootstrap() {
  // Initialize external services
  const db = await initializeDatabase();
  const redis = await initializeRedis();

  // Create Fastify instance
  const fastify = Fastify({
    logger: logger,
    disableRequestLogging: false,
    ajv: {
      customOptions: {
        removeAdditional: 'all',
        strictTypes: false,
      },
    },
  });

  // Register plugins
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  });

  await fastify.register(fastifyCors, {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '24h' },
  });

  // Rate limiting configuration
  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: redis,
    allowList: ['/health'],
    skip: (request) => {
      // Skip rate limiting for health checks
      return request.url === '/health';
    },
    keyGenerator: (request) => {
      // Rate limit by user ID if authenticated, otherwise by IP
      return request.user?.userId || request.ip;
    },
  });

  // Attach services to app context
  fastify.decorate('db', db);
  fastify.decorate('redis', redis);

  // Health check
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  });

  // Register route groups
  await registerAuthRoutes(fastify);
  await registerOrganisationRoutes(fastify);
  await registerWebhookRoutes(fastify);

  // Error handler
  fastify.setErrorHandler(errorHandler);

  // Start server
  try {
    const address = await fastify.listen({
      port: parseInt(process.env.PORT || '3001'),
      host: '0.0.0.0',
    });
    logger.info(`Server running at ${address}`);
    return fastify;
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

bootstrap().catch((err) => {
  logger.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
