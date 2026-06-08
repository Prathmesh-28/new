const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'owner',
      tenant_id   TEXT NOT NULL DEFAULT 'default',
      first_login BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS kv_store (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  TEXT NOT NULL,
      namespace  TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, namespace, key)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID REFERENCES users(id),
      action     TEXT NOT NULL,
      entity     TEXT,
      entity_id  TEXT,
      meta       JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS files (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   TEXT NOT NULL,
      uploader_id UUID REFERENCES users(id),
      name        TEXT NOT NULL,
      mime_type   TEXT NOT NULL,
      size        INTEGER NOT NULL,
      data        BYTEA NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notes (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  TEXT NOT NULL,
      author_id  UUID REFERENCES users(id),
      entity     TEXT NOT NULL,
      entity_id  TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS kv_tenant_ns ON kv_store(tenant_id, namespace);
    CREATE INDEX IF NOT EXISTS notes_entity ON notes(tenant_id, entity, entity_id);
  `);
}

module.exports = { pool, initDb };
