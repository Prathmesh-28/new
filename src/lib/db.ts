import { Pool, PoolClient } from "pg";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

// PostgreSQL connection pool
let _pool: Pool | null = null;

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
  idleTimeoutMillis: number;
}

function getDbConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "headroom",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    max: 20,
    idleTimeoutMillis: 30000,
  };
}

export function getPool(): Pool {
  if (_pool) return _pool;

  const config = getDbConfig();
  _pool = new Pool(config);
  
  _pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
  });

  return _pool;
}

export async function getDb(): Promise<PoolClient> {
  const pool = getPool();
  return pool.connect();
}

export async function initSchema(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // Read and execute schema
    const schemaPath = path.join(process.cwd(), "src", "db", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");
    
    await client.query(schema);

    // Execute seed data
    const seedPath = path.join(process.cwd(), "src", "db", "seed.sql");
    const seed = fs.readFileSync(seedPath, "utf-8");
    
    await client.query(seed);

    console.log("✅ Database schema initialized successfully");
  } catch (error: any) {
    // Schema may already exist, which is fine
    if (!error.message.includes("already exists")) {
      console.error("⚠️ Schema initialization warning:", error.message);
    }
  } finally {
    client.release();
  }
}

export async function queryDb(
  query: string,
  params?: (string | number | boolean | null)[]
): Promise<any> {
  const pool = getPool();
  return pool.query(query, params);
}

// Legacy function for backward compatibility with existing auth code
export async function getAdminSession(token: string): Promise<any> {
  const query = `
    SELECT s.token, s.user_id, s.expires_at, u.email as username
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = $1
    AND s.expires_at > NOW()
    LIMIT 1
  `;
  
  const result = await queryDb(query, [token]);
  return result.rows[0] || null;
}

export async function createSession(
  userId: string,
  tenantId: string,
  expiresIn: number = 8 * 60 * 60 * 1000 // 8 hours
): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + expiresIn);
  
  const query = `
    INSERT INTO sessions (token, user_id, tenant_id, expires_at, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING token
  `;
  
  const result = await queryDb(query, [token, userId, tenantId, expiresAt.toISOString()]);
  return result.rows[0].token;
}

export async function destroySession(token: string): Promise<void> {
  const query = `DELETE FROM sessions WHERE token = $1`;
  await queryDb(query, [token]);
}

export function generateSessionToken(): string {
  return require("crypto").randomBytes(32).toString("hex");
}

// Legacy admin user authentication
export async function authAdminUser(email: string, password: string): Promise<any> {
  const query = `
    SELECT id, email, role, tenant_id, password_hash
    FROM users
    WHERE email = $1
    AND role = 'admin'
    AND status = 'active'
    LIMIT 1
  `;
  
  const result = await queryDb(query, [email]);

  if (!result.rows[0]) return null;

  const user = result.rows[0];

  if (!user.password_hash) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return user;
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
