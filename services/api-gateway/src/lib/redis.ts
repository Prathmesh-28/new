import { createClient, RedisClientType } from 'redis';
import { logger } from './logger.js';

let redisClient: RedisClientType | null = null;

export async function initializeRedis(): Promise<RedisClientType> {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    database: parseInt(process.env.REDIS_DB || '0'),
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Failed to reconnect to Redis after 10 attempts');
          return new Error('Retry time exhausted');
        }
        return Math.min(retries * 50, 500);
      },
    },
  });

  redisClient.on('error', (err) => {
    logger.error('Redis error:', err);
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  try {
    await redisClient.connect();
    const result = await redisClient.ping();
    logger.info(`Redis ping response: ${result}`);
  } catch (err) {
    logger.error('Failed to connect to Redis:', err);
    throw err;
  }

  return redisClient;
}

export function getRedis(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis not initialized');
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}
