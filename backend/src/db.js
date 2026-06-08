const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    -- ── Core ──────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'owner',
      tenant_id   TEXT NOT NULL DEFAULT 'default',
      full_name   TEXT,
      phone       TEXT,
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

    -- ── Accounts & Transactions ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      account_name    TEXT NOT NULL,
      account_type    TEXT NOT NULL DEFAULT 'checking',
      provider        TEXT NOT NULL DEFAULT 'manual',
      currency        CHAR(3) NOT NULL DEFAULT 'INR',
      current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
      balance_as_of   TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_primary      BOOLEAN NOT NULL DEFAULT false,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id            TEXT NOT NULL,
      bank_account_id      UUID REFERENCES bank_accounts(id),
      amount               NUMERIC(15,2) NOT NULL,
      currency             CHAR(3) NOT NULL DEFAULT 'INR',
      description_raw      TEXT,
      merchant_name        TEXT,
      category             TEXT DEFAULT 'uncategorized',
      category_confidence  NUMERIC(4,3) DEFAULT 1.000,
      is_recurring         BOOLEAN NOT NULL DEFAULT false,
      recurrence_cadence   TEXT,
      transaction_date     DATE NOT NULL,
      source               TEXT NOT NULL DEFAULT 'manual',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ── Forecasts ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS forecasts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      horizon_days    INTEGER NOT NULL DEFAULT 90,
      model_version   TEXT NOT NULL DEFAULT 'v1',
      is_current      BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS forecast_datapoints (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      forecast_id      UUID NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
      forecast_date    DATE NOT NULL,
      balance_p10      NUMERIC(15,2),
      balance_p50      NUMERIC(15,2),
      balance_p90      NUMERIC(15,2),
      inflow_expected  NUMERIC(15,2),
      outflow_expected NUMERIC(15,2),
      UNIQUE(forecast_id, forecast_date)
    );

    CREATE TABLE IF NOT EXISTS forecast_scenarios (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      name            TEXT NOT NULL,
      type            TEXT NOT NULL,
      parameters      JSONB NOT NULL DEFAULT '{}',
      is_active       BOOLEAN NOT NULL DEFAULT false,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ── Alerts ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS alerts (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   TEXT NOT NULL,
      rule_id     TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'medium',
      title       TEXT NOT NULL,
      message     TEXT NOT NULL,
      is_read     BOOLEAN NOT NULL DEFAULT false,
      is_resolved BOOLEAN NOT NULL DEFAULT false,
      meta        JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ── Credit ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS credit_applications (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'pending',
      requested_amount    NUMERIC(15,2),
      underwriting_score  INTEGER,
      score_breakdown     JSONB,
      fraud_check_status  TEXT DEFAULT 'pass',
      decline_reason      TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at          TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS credit_offers (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id   UUID NOT NULL REFERENCES credit_applications(id),
      tenant_id        TEXT NOT NULL,
      lender_partner   TEXT NOT NULL,
      product_type     TEXT NOT NULL,
      offer_amount     NUMERIC(15,2) NOT NULL,
      factor_rate      NUMERIC(6,4),
      apr_equivalent   NUMERIC(6,4),
      repayment_pct    NUMERIC(5,4),
      term_months      INTEGER,
      status           TEXT NOT NULL DEFAULT 'active',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS active_loans (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           TEXT NOT NULL,
      offer_id            UUID NOT NULL REFERENCES credit_offers(id),
      disbursed_amount    NUMERIC(15,2) NOT NULL,
      disbursed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      total_repaid        NUMERIC(15,2) NOT NULL DEFAULT 0,
      outstanding_balance NUMERIC(15,2) NOT NULL,
      status              TEXT NOT NULL DEFAULT 'current',
      next_payment_at     TIMESTAMPTZ
    );

    -- ── Capital ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS capital_raises (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      name            TEXT NOT NULL,
      raise_type      TEXT NOT NULL DEFAULT 'rev_share',
      target_amount   NUMERIC(15,2) NOT NULL,
      raised_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'draft',
      started_at      TIMESTAMPTZ,
      closes_at       TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS investors (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   TEXT NOT NULL,
      raise_id    UUID NOT NULL REFERENCES capital_raises(id),
      name        TEXT NOT NULL,
      email       TEXT,
      amount      NUMERIC(15,2) NOT NULL,
      status      TEXT NOT NULL DEFAULT 'committed',
      invested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ── Indexes ───────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS kv_tenant_ns         ON kv_store(tenant_id, namespace);
    CREATE INDEX IF NOT EXISTS notes_entity         ON notes(tenant_id, entity, entity_id);
    CREATE INDEX IF NOT EXISTS txn_tenant_date      ON transactions(tenant_id, transaction_date DESC);
    CREATE INDEX IF NOT EXISTS forecast_tenant      ON forecasts(tenant_id, is_current, generated_at DESC);
    CREATE INDEX IF NOT EXISTS alerts_tenant        ON alerts(tenant_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS credit_app_tenant    ON credit_applications(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS credit_offers_app    ON credit_offers(application_id);
    CREATE INDEX IF NOT EXISTS loans_tenant         ON active_loans(tenant_id);
    CREATE INDEX IF NOT EXISTS raises_tenant        ON capital_raises(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS investors_raise      ON investors(raise_id);
  `);
}

module.exports = { pool, initDb };
