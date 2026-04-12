import pkg from 'pg';
const { Pool } = pkg;
import { logger } from './logger.js';

let pool: pkg.Pool | null = null;

export async function initializeDatabase(): Promise<pkg.Pool> {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'headroom',
    max: parseInt(process.env.DB_POOL_SIZE || '20'),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err);
  });

  try {
    const result = await pool.query('SELECT NOW()');
    logger.info(`Database connected: ${result.rows[0].now}`);
  } catch (err) {
    logger.error('Failed to connect to database:', err);
    throw err;
  }

  return pool;
}

export function getDatabase(): pkg.Pool {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
}

export async function withTenantContext<T>(
  tenantId: string,
  callback: (client: pkg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getDatabase().connect();
  try {
    // Set tenant context for RLS enforcement
    await client.query(
      'SELECT set_tenant_context($1::UUID)',
      [tenantId]
    );

    return await callback(client);
  } finally {
    client.release();
  }
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
