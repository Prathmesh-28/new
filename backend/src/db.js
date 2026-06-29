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
      first_login  BOOLEAN NOT NULL DEFAULT true,
      display_name TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
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
    -- Document-vault metadata (category / tags / expiry) on uploaded files.
    ALTER TABLE files ADD COLUMN IF NOT EXISTS category   TEXT;
    ALTER TABLE files ADD COLUMN IF NOT EXISTS tags       TEXT[];
    ALTER TABLE files ADD COLUMN IF NOT EXISTS expires_at DATE;

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

    -- ── Account lockout columns ───────────────────────────────────────────────
    ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

    -- ── Password-reset OTP (stored separately so a reset request can never
    --    overwrite/destroy the user's real password — see auth.js) ─────────────
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_expiry TIMESTAMPTZ;

    -- ── Profile ───────────────────────────────────────────────────────────────
    ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

    -- ── Connectors ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS connector_consents (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      provider        TEXT NOT NULL,
      account_name    TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'pending',
      consent_id      TEXT,
      access_token    TEXT,
      consent_expiry  TIMESTAMPTZ,
      last_sync       TIMESTAMPTZ,
      account_count   INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, provider, account_name)
    );

    -- ── WhatsApp bindings ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS whatsapp_bindings (
      phone      TEXT PRIMARY KEY,
      tenant_id  TEXT NOT NULL,
      user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS wa_tenant ON whatsapp_bindings(tenant_id);

    -- ── WhatsApp OTP verification (short-lived codes) ─────────────────────────
    CREATE TABLE IF NOT EXISTS whatsapp_otps (
      phone      TEXT PRIMARY KEY,
      tenant_id  TEXT NOT NULL,
      code       TEXT NOT NULL,
      attempts   INT  NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ── Advisor links ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS advisor_client_links (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      advisor_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_tenant_id TEXT NOT NULL,
      client_label     TEXT,
      linked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(advisor_id, client_tenant_id)
    );

    -- ── Operations: Orders ────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS orders (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    TEXT NOT NULL,
      order_number TEXT NOT NULL,
      source       TEXT NOT NULL DEFAULT 'manual',
      buyer_name   TEXT,
      buyer_phone  TEXT,
      buyer_email  TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',
      total_value  NUMERIC(15,2) NOT NULL DEFAULT 0,
      notes        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      sku          TEXT,
      quantity     INTEGER NOT NULL DEFAULT 1,
      unit_price   NUMERIC(15,2) NOT NULL DEFAULT 0
    );

    -- ── Operations: Inventory ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS inventory (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     TEXT NOT NULL,
      product_name  TEXT NOT NULL,
      sku           TEXT,
      category      TEXT NOT NULL DEFAULT 'general',
      quantity      INTEGER NOT NULL DEFAULT 0,
      unit          TEXT NOT NULL DEFAULT 'units',
      unit_cost     NUMERIC(15,2) NOT NULL DEFAULT 0,
      reorder_level INTEGER NOT NULL DEFAULT 10,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, product_name)
    );

    -- ── Operations: Procurement ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS procurement_orders (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'draft',
      total_value   NUMERIC(15,2) NOT NULL DEFAULT 0,
      expected_date DATE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS procurement_items (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      po_id        UUID NOT NULL REFERENCES procurement_orders(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      sku          TEXT,
      quantity     INTEGER NOT NULL DEFAULT 1,
      unit_cost    NUMERIC(15,2) NOT NULL DEFAULT 0
    );

    -- ── Invoices ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS invoices (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      customer_name  TEXT NOT NULL,
      customer_gstin TEXT,
      customer_email TEXT,
      subtotal       NUMERIC(15,2) NOT NULL DEFAULT 0,
      gst_rate       NUMERIC(5,2)  NOT NULL DEFAULT 18,
      gst_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
      total_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'draft',
      due_date       DATE,
      paid_at        TIMESTAMPTZ,
      irn            TEXT,
      qr_code_url    TEXT,
      upi_link       TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Customer phone (E.164) for WhatsApp payment reminders.
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_phone TEXT;

    -- Reminder history for invoices (used by /:id/remind and /:id/reminders).
    CREATE TABLE IF NOT EXISTS invoice_reminders (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      tenant_id   TEXT NOT NULL,
      reminded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      channel     TEXT NOT NULL DEFAULT 'whatsapp',
      status      TEXT NOT NULL DEFAULT 'sent'
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description  TEXT NOT NULL,
      hsn_sac      TEXT,
      quantity     NUMERIC(10,3) NOT NULL DEFAULT 1,
      unit_price   NUMERIC(15,2) NOT NULL DEFAULT 0,
      gst_rate     NUMERIC(5,2)  NOT NULL DEFAULT 18,
      amount       NUMERIC(15,2) NOT NULL DEFAULT 0
    );

    -- ── GST returns ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS gst_returns (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id        TEXT NOT NULL,
      return_type      TEXT NOT NULL,
      period_month     INTEGER NOT NULL,
      period_year      INTEGER NOT NULL,
      output_tax       NUMERIC(15,2) NOT NULL DEFAULT 0,
      input_tax_credit NUMERIC(15,2) NOT NULL DEFAULT 0,
      net_liability    NUMERIC(15,2) NOT NULL DEFAULT 0,
      status           TEXT NOT NULL DEFAULT 'draft',
      filed_at         TIMESTAMPTZ,
      gstn_arn         TEXT,
      computed_data    JSONB,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, return_type, period_month, period_year)
    );

    -- ── Payroll ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS employees (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    TEXT NOT NULL,
      name         TEXT NOT NULL,
      email        TEXT,
      pan          TEXT,
      bank_account TEXT,
      bank_ifsc    TEXT,
      gross_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
      tds_monthly  NUMERIC(15,2) NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'active',
      joining_date DATE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    TEXT NOT NULL,
      run_month    INTEGER NOT NULL,
      run_year     INTEGER NOT NULL,
      total_gross  NUMERIC(15,2) NOT NULL DEFAULT 0,
      total_tds    NUMERIC(15,2) NOT NULL DEFAULT 0,
      total_net    NUMERIC(15,2) NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'draft',
      disbursed_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, run_month, run_year)
    );

    -- ── B2B BNPL ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS bnpl_facilities (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      credit_limit    NUMERIC(15,2) NOT NULL DEFAULT 0,
      utilized_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'active',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS bnpl_drawdowns (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      facility_id    UUID NOT NULL REFERENCES bnpl_facilities(id),
      tenant_id      TEXT NOT NULL,
      po_id          UUID REFERENCES procurement_orders(id),
      supplier_name  TEXT NOT NULL,
      amount         NUMERIC(15,2) NOT NULL,
      fee_pct        NUMERIC(5,4) NOT NULL DEFAULT 0.025,
      fee_amount     NUMERIC(15,2) NOT NULL,
      repayment_date DATE NOT NULL,
      status         TEXT NOT NULL DEFAULT 'active',
      disbursed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      repaid_at      TIMESTAMPTZ
    );

    -- ── Auto-categorizer + benchmarks ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS merchant_categories (
      merchant_name TEXT NOT NULL,
      tenant_id     TEXT,
      category      TEXT NOT NULL,
      confidence    NUMERIC(4,3) NOT NULL DEFAULT 1.000,
      source        TEXT NOT NULL DEFAULT 'ai',
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (merchant_name, tenant_id)
    );

    CREATE TABLE IF NOT EXISTS benchmark_metrics (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      industry     TEXT NOT NULL,
      revenue_band TEXT NOT NULL,
      metric_name  TEXT NOT NULL,
      p25          NUMERIC(15,2),
      p50          NUMERIC(15,2),
      p75          NUMERIC(15,2),
      sample_count INTEGER NOT NULL DEFAULT 0,
      computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(industry, revenue_band, metric_name)
    );

    -- ── Billing / subscriptions (Stripe) ──────────────────────────────────────
    ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'free';

    CREATE TABLE IF NOT EXISTS tenant_billing (
      tenant_id              TEXT PRIMARY KEY,
      plan                   TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id     TEXT,
      stripe_subscription_id TEXT,
      status                 TEXT,
      current_period_end     TIMESTAMPTZ,
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Gateway-agnostic columns (Stripe or Razorpay paid the subscription)
    ALTER TABLE tenant_billing ADD COLUMN IF NOT EXISTS provider TEXT;
    ALTER TABLE tenant_billing ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;

    -- ── Team invites (request / accept / reject join-a-team lifecycle) ─────────
    CREATE TABLE IF NOT EXISTS team_invites (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      inviter_id      UUID REFERENCES users(id),
      inviter_email   TEXT,
      invitee_email   TEXT NOT NULL,
      invitee_user_id UUID REFERENCES users(id),
      role            TEXT NOT NULL DEFAULT 'finance_manager',
      status          TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | rejected | cancelled
      message         TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at     TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS invites_invitee ON team_invites(invitee_email, status);
    CREATE INDEX IF NOT EXISTS invites_tenant  ON team_invites(tenant_id, status);
    -- invite (owner → person) vs request (person → company "let me join")
    ALTER TABLE team_invites ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'invite';

    -- ── Activity / lifecycle signals on users (last login, status) ────────────
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at  TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count    INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status         TEXT NOT NULL DEFAULT 'active';  -- active | suspended

    -- ── Company / tenant profile (identity beyond the email-derived tenant id) ─
    CREATE TABLE IF NOT EXISTS tenant_profile (
      tenant_id     TEXT PRIMARY KEY,
      company_name  TEXT,
      legal_name    TEXT,
      gstin         TEXT,
      pan           TEXT,
      industry      TEXT,
      company_size  TEXT,
      address       TEXT,
      city          TEXT,
      state         TEXT,
      pincode       TEXT,
      phone         TEXT,
      website       TEXT,
      logo_url      TEXT,
      status        TEXT NOT NULL DEFAULT 'active',  -- active | suspended
      suspend_reason TEXT,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Workspace settings (admin-console Organisation tab) + role permission matrix
    ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS timezone          TEXT;
    ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS fiscal_year_start TEXT;
    ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS base_currency     TEXT;
    ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS role_permissions  JSONB NOT NULL DEFAULT '{}';

    -- ── Push notification device tokens ──────────────────────────────────────
    CREATE TABLE IF NOT EXISTS push_tokens (
      token      TEXT PRIMARY KEY,
      tenant_id  TEXT NOT NULL,
      user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
      platform   TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS push_tenant ON push_tokens(tenant_id);

    -- ── DPDP / privacy: consent ledger + erasure requests ─────────────────────
    CREATE TABLE IF NOT EXISTS consents (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  TEXT NOT NULL,
      user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
      purpose    TEXT NOT NULL,
      granted    BOOLEAN NOT NULL DEFAULT true,
      version    TEXT NOT NULL DEFAULT '1',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, purpose)
    );
    CREATE TABLE IF NOT EXISTS deletion_requests (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    TEXT NOT NULL,
      user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
      requested_by TEXT,
      reason       TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS consents_user      ON consents(user_id);
    CREATE INDEX IF NOT EXISTS deletion_req_tenant ON deletion_requests(tenant_id, status);

    -- ── Idempotent column additions ───────────────────────────────────────────
    ALTER TABLE merchant_categories ADD COLUMN IF NOT EXISTS tenant_id TEXT;

    -- External id for idempotent imports (e.g. a Tally voucher GUID) so the same
    -- voucher re-synced doesn't create duplicate transactions. NULLs stay distinct,
    -- so manually-entered rows (no external id) are unaffected.
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id TEXT;

    -- ── Indexes ───────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS kv_tenant_ns         ON kv_store(tenant_id, namespace);
    CREATE INDEX IF NOT EXISTS notes_entity         ON notes(tenant_id, entity, entity_id);
    CREATE INDEX IF NOT EXISTS txn_tenant_date      ON transactions(tenant_id, transaction_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS txn_tenant_source_extid ON transactions(tenant_id, source, external_id);
    CREATE INDEX IF NOT EXISTS forecast_tenant      ON forecasts(tenant_id, is_current, generated_at DESC);
    CREATE INDEX IF NOT EXISTS alerts_tenant        ON alerts(tenant_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS credit_app_tenant    ON credit_applications(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS credit_offers_app    ON credit_offers(application_id);
    CREATE INDEX IF NOT EXISTS loans_tenant         ON active_loans(tenant_id);
    CREATE INDEX IF NOT EXISTS raises_tenant        ON capital_raises(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS investors_raise      ON investors(raise_id);
    CREATE INDEX IF NOT EXISTS orders_tenant        ON orders(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS inventory_tenant     ON inventory(tenant_id);
    CREATE INDEX IF NOT EXISTS po_tenant            ON procurement_orders(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS advisor_links        ON advisor_client_links(advisor_id);
    CREATE INDEX IF NOT EXISTS connector_tenant     ON connector_consents(tenant_id);
    CREATE INDEX IF NOT EXISTS invoices_tenant      ON invoices(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS gst_returns_tenant   ON gst_returns(tenant_id, period_year DESC, period_month DESC);
    CREATE INDEX IF NOT EXISTS employees_tenant     ON employees(tenant_id);
    CREATE INDEX IF NOT EXISTS payroll_runs_tenant  ON payroll_runs(tenant_id, run_year DESC, run_month DESC);
    CREATE INDEX IF NOT EXISTS bnpl_tenant          ON bnpl_drawdowns(tenant_id, disbursed_at DESC);
    CREATE INDEX IF NOT EXISTS merchant_cat_tenant  ON merchant_categories(tenant_id);
  `);
  // books module (double-entry GL) — §5 data model
  await pool.query(require("./modules/books/schema").BOOKS_SCHEMA);
  // business modules layered on books + Headroom tenancy
  await pool.query(require("./modules/crm/schema").CRM_SCHEMA);
  await pool.query(require("./modules/erp/schema").ERP_SCHEMA);
  await pool.query(require("./modules/hrms/schema").HRMS_SCHEMA);
  await pool.query(require("./modules/insights/schema").INSIGHTS_SCHEMA);
  // collab module (Teams-style real-time collaboration) — Phase 0 data model + RLS
  await pool.query(require("./modules/collab/schema").COLLAB_SCHEMA);
  // studio module (App Builder) — Phase 0; reuses collab_uuidv7() (applied above)
  await pool.query(require("./modules/studio/schema").STUDIO_SCHEMA);
  // flows module (native workflow automation engine) — reuses collab_uuidv7()
  await pool.query(require("./modules/flows/schema").FLOWS_SCHEMA);
  // crowdfunding module (rewards / pre-order campaigns) — reuses collab_uuidv7()
  await pool.query(require("./modules/crowdfunding/schema").CROWDFUNDING_SCHEMA);

  // Platform-level settings (super-admin editable, e.g. social links) — key/value JSON.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // SMB AI-agent platform — per-tenant LLM engine + agents + run audit.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_llm_config (
      tenant_id   TEXT PRIMARY KEY,
      base_url    TEXT NOT NULL DEFAULT 'https://openrouter.ai/api/v1',
      model       TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4.6',
      embed_model TEXT DEFAULT 'openai/text-embedding-3-small',
      api_key_enc TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE tenant_llm_config ADD COLUMN IF NOT EXISTS embed_model TEXT DEFAULT 'openai/text-embedding-3-small';
    CREATE TABLE IF NOT EXISTS book_agents (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    TEXT NOT NULL,
      name         TEXT NOT NULL,
      instructions TEXT,
      model        TEXT,
      tools        JSONB NOT NULL DEFAULT '[]',
      enabled      BOOLEAN NOT NULL DEFAULT true,
      created_by   UUID,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_agents ON book_agents(tenant_id, created_at DESC);
    -- Phase 3: scheduled/triggered autonomous runs.
    ALTER TABLE book_agents ADD COLUMN IF NOT EXISTS schedule      TEXT DEFAULT 'off';
    ALTER TABLE book_agents ADD COLUMN IF NOT EXISTS schedule_hour INT DEFAULT 9;
    ALTER TABLE book_agents ADD COLUMN IF NOT EXISTS schedule_dow  INT;
    ALTER TABLE book_agents ADD COLUMN IF NOT EXISTS trigger_prompt TEXT;
    ALTER TABLE book_agents ADD COLUMN IF NOT EXISTS last_run_at   TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS book_agent_runs (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  TEXT NOT NULL,
      agent_id   UUID,
      actor_id   UUID,
      input      TEXT,
      reply      TEXT,
      steps      JSONB,
      status     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_agent_runs ON book_agent_runs(tenant_id, agent_id, created_at DESC);
    -- Agent knowledge (RAG): one row per chunk; embedding stored as JSONB (no pgvector dependency).
    CREATE TABLE IF NOT EXISTS book_agent_docs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   TEXT NOT NULL,
      agent_id    UUID NOT NULL,
      title       TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      content     TEXT NOT NULL,
      embedding   JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_agent_docs ON book_agent_docs(tenant_id, agent_id);
  `);

  // ── Wave-1c depth tables: real master/persistence behind features that were stubs ──
  await pool.query(`
    -- Company UPI/VPA — used by sales "Accept → create order" + invoice payment links.
    ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS upi_id TEXT;
    -- Deductor TAN — used on TDS/TCS return files + Form 16A.
    ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS tan TEXT;

    -- Per-employee payroll-run breakdown (PF/ESI/PT/TDS → net) persisted so it
    -- survives reload instead of being recomputed/lost.
    ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS breakdown JSONB;

    -- Books Wave-5 inventory depth: batch identity + mfg/expiry on FIFO lots (FEFO),
    -- and alternate-unit conversion factors on items.
    ALTER TABLE book_stock_lots  ADD COLUMN IF NOT EXISTS batch_no    TEXT;
    ALTER TABLE book_stock_lots  ADD COLUMN IF NOT EXISTS mfg_date    DATE;
    ALTER TABLE book_stock_lots  ADD COLUMN IF NOT EXISTS expiry_date DATE;
    ALTER TABLE book_stock_items ADD COLUMN IF NOT EXISTS uom_conversions JSONB;

    -- Books must-haves: party GST registration type + credit limit on the ledger.
    ALTER TABLE book_ledgers ADD COLUMN IF NOT EXISTS gst_registration_type TEXT;
    ALTER TABLE book_ledgers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(19,4);

    -- Books should-haves (masters): party contact (for statements/dunning delivery)
    -- + bill-wise tracking flag.
    ALTER TABLE book_ledgers ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE book_ledgers ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE book_ledgers ADD COLUMN IF NOT EXISTS maintain_billwise BOOLEAN NOT NULL DEFAULT false;

    -- Books should-haves (assets): disposal/sale + asset grouping (blocks).
    ALTER TABLE book_fixed_assets ADD COLUMN IF NOT EXISTS disposed_on    DATE;
    ALTER TABLE book_fixed_assets ADD COLUMN IF NOT EXISTS disposal_value NUMERIC(19,4);
    ALTER TABLE book_fixed_assets ADD COLUMN IF NOT EXISTS asset_group    TEXT;

    -- Books should-haves (inventory depth): barcode, variant attributes, kits, serials.
    ALTER TABLE book_stock_items ADD COLUMN IF NOT EXISTS barcode    TEXT;
    ALTER TABLE book_stock_items ADD COLUMN IF NOT EXISTS attributes JSONB;
    ALTER TABLE book_stock_items ADD COLUMN IF NOT EXISTS is_kit     BOOLEAN NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS book_serials (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     TEXT NOT NULL,
      item_id       UUID NOT NULL,
      serial_no     TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'IN_STOCK',
      warehouse_id  UUID,
      batch_no      TEXT,
      in_voucher_id UUID,
      out_voucher_id UUID,
      received_on   DATE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, item_id, serial_no)
    );
    CREATE INDEX IF NOT EXISTS idx_book_serials ON book_serials(tenant_id, item_id, status);
    CREATE TABLE IF NOT EXISTS book_item_components (
      tenant_id         TEXT NOT NULL,
      parent_item_id    UUID NOT NULL,
      component_item_id UUID NOT NULL,
      qty               NUMERIC(19,4) NOT NULL DEFAULT 1,
      PRIMARY KEY (tenant_id, parent_item_id, component_item_id)
    );

    -- Books should-haves (vouchers): saved entry templates + post-dated cheque register.
    CREATE TABLE IF NOT EXISTS book_voucher_templates (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    TEXT NOT NULL,
      name         TEXT NOT NULL,
      voucher_type TEXT NOT NULL,
      template     JSONB NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, name)
    );
    CREATE TABLE IF NOT EXISTS book_pdc (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         TEXT NOT NULL,
      kind              TEXT NOT NULL DEFAULT 'RECEIVABLE',
      party_ledger_id   UUID,
      bank_ledger_id    UUID,
      amount            NUMERIC(19,4) NOT NULL DEFAULT 0,
      cheque_no         TEXT,
      cheque_date       DATE,
      status            TEXT NOT NULL DEFAULT 'PENDING',
      cleared_voucher_id UUID,
      note              TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_pdc ON book_pdc(tenant_id, status, cheque_date);

    -- Books should-haves (GST depth): HSN→rate master + GST challan (PMT-06) register.
    CREATE TABLE IF NOT EXISTS book_gst_rates (
      tenant_id   TEXT NOT NULL,
      hsn         TEXT NOT NULL,
      rate        NUMERIC(9,4) NOT NULL DEFAULT 0,
      cess_rate   NUMERIC(9,4) NOT NULL DEFAULT 0,
      description TEXT,
      PRIMARY KEY (tenant_id, hsn)
    );
    CREATE TABLE IF NOT EXISTS book_gst_challans (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  TEXT NOT NULL,
      period     TEXT NOT NULL,
      cgst       NUMERIC(19,4) NOT NULL DEFAULT 0,
      sgst       NUMERIC(19,4) NOT NULL DEFAULT 0,
      igst       NUMERIC(19,4) NOT NULL DEFAULT 0,
      cess       NUMERIC(19,4) NOT NULL DEFAULT 0,
      cin        TEXT,
      bank_ref   TEXT,
      paid_on    DATE,
      status     TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_gst_challans ON book_gst_challans(tenant_id, period);

    -- Tax filing: s.197 lower-deduction certificates + ingested 26AS/AIS rows.
    CREATE TABLE IF NOT EXISTS book_tds_certificates (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      party_ledger_id UUID,
      pan             TEXT,
      section         TEXT NOT NULL,
      certificate_no  TEXT,
      rate            NUMERIC(9,4) NOT NULL DEFAULT 0,
      threshold_limit NUMERIC(19,4),
      valid_from      DATE,
      valid_to        DATE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_tds_certs ON book_tds_certificates(tenant_id, party_ledger_id, section);
    CREATE TABLE IF NOT EXISTS book_26as_entries (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     TEXT NOT NULL,
      kind          TEXT NOT NULL DEFAULT 'TDS',
      deductor_tan  TEXT,
      deductor_name TEXT,
      section       TEXT,
      period        TEXT,
      amount        NUMERIC(19,4) NOT NULL DEFAULT 0,
      tax           NUMERIC(19,4) NOT NULL DEFAULT 0,
      matched_voucher_id UUID,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_26as ON book_26as_entries(tenant_id, period);

    -- Selling/pricing: pricing rules (+ BXGY schemes), coupons, shipping (freight) rules.
    CREATE TABLE IF NOT EXISTS book_pricing_rules (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   TEXT NOT NULL,
      title       TEXT NOT NULL,
      applies_on  TEXT NOT NULL DEFAULT 'all',
      scope_value TEXT,
      party_scope TEXT NOT NULL DEFAULT 'all',
      party_value TEXT,
      min_qty     NUMERIC(19,4) DEFAULT 0,
      max_qty     NUMERIC(19,4),
      min_amount  NUMERIC(19,4) DEFAULT 0,
      action      TEXT NOT NULL DEFAULT 'discount_pct',
      value       NUMERIC(19,4) NOT NULL DEFAULT 0,
      scheme      TEXT NOT NULL DEFAULT 'none',
      free_item_id UUID,
      free_qty    NUMERIC(19,4) DEFAULT 0,
      priority    INT NOT NULL DEFAULT 0,
      valid_from  DATE,
      valid_to    DATE,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_pricing_rules ON book_pricing_rules(tenant_id, is_active, priority DESC);
    CREATE TABLE IF NOT EXISTS book_coupons (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   TEXT NOT NULL,
      code        TEXT NOT NULL,
      disc_type   TEXT NOT NULL DEFAULT 'pct',
      value       NUMERIC(19,4) NOT NULL DEFAULT 0,
      valid_from  DATE,
      valid_to    DATE,
      max_redemptions INT,
      redeemed    INT NOT NULL DEFAULT 0,
      once_per_customer BOOLEAN NOT NULL DEFAULT false,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, code)
    );
    CREATE TABLE IF NOT EXISTS book_shipping_rules (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id        TEXT NOT NULL,
      name             TEXT NOT NULL,
      basis            TEXT NOT NULL DEFAULT 'amount',
      slabs            JSONB NOT NULL DEFAULT '[]'::jsonb,
      account_ledger_id UUID,
      is_active        BOOLEAN NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- AR/AP: payment-terms templates + per-invoice installment schedule.
    CREATE TABLE IF NOT EXISTS book_payment_terms (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    TEXT NOT NULL,
      name         TEXT NOT NULL,
      installments JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, name)
    );
    CREATE TABLE IF NOT EXISTS book_payment_schedule (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   TEXT NOT NULL,
      voucher_id  UUID NOT NULL,
      installment INT NOT NULL DEFAULT 1,
      due_date    DATE,
      amount      NUMERIC(19,4) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'PENDING',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_pay_sched ON book_payment_schedule(tenant_id, voucher_id, due_date);

    -- Subscription billing (ported from Lago/KillBill concepts).
    CREATE TABLE IF NOT EXISTS book_subscription_plans (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      name            TEXT NOT NULL,
      price           NUMERIC(19,4) NOT NULL DEFAULT 0,
      interval        TEXT NOT NULL DEFAULT 'monthly',
      interval_count  INT NOT NULL DEFAULT 1,
      gst_rate        NUMERIC(9,4) NOT NULL DEFAULT 0,
      hsn_sac         TEXT,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS book_subscriptions (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id            TEXT NOT NULL,
      party_ledger_id      UUID NOT NULL,
      plan_id              UUID NOT NULL,
      qty                  NUMERIC(19,4) NOT NULL DEFAULT 1,
      status               TEXT NOT NULL DEFAULT 'active',
      trial_end            DATE,
      current_period_start DATE,
      next_invoice_date    DATE,
      started_at           DATE,
      cancelled_at         DATE,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_subs ON book_subscriptions(tenant_id, status, next_invoice_date);
    -- Usage / metered billing (ported from OpenMeter/Lago).
    ALTER TABLE book_subscription_plans ADD COLUMN IF NOT EXISTS metric      TEXT;
    ALTER TABLE book_subscription_plans ADD COLUMN IF NOT EXISTS unit_price  NUMERIC(19,4);
    ALTER TABLE book_subscription_plans ADD COLUMN IF NOT EXISTS aggregation TEXT DEFAULT 'sum';
    CREATE TABLE IF NOT EXISTS book_usage_events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      subscription_id UUID,
      metric          TEXT NOT NULL,
      value           NUMERIC(19,4) NOT NULL DEFAULT 0,
      event_time      TIMESTAMPTZ NOT NULL DEFAULT now(),
      dedup_key       TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_book_usage_dedup ON book_usage_events(tenant_id, dedup_key) WHERE dedup_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_book_usage ON book_usage_events(tenant_id, subscription_id, metric, event_time);

    -- ── Books Wave A1 (depth): tax / GST / compliance ──────────────────────────
    -- Deductor TAN + first-class TDS section (24Q/26Q/27EQ + 26AS matching).
    ALTER TABLE tenant_profile   ADD COLUMN IF NOT EXISTS tan         TEXT;
    ALTER TABLE book_tax_entries ADD COLUMN IF NOT EXISTS tds_section TEXT;
    -- Income-tax: advance-tax / self-assessment challan register (feeds ITR credits).
    CREATE TABLE IF NOT EXISTS book_advance_tax (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'ADVANCE' CHECK (kind IN ('ADVANCE','SELF_ASSESSMENT')),
      bsr_code   TEXT,
      challan_no TEXT,
      paid_on    DATE,
      amount     NUMERIC(19,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_advance_tax ON book_advance_tax(tenant_id, paid_on);
    -- e-invoice cancel + e-way bill lifecycle fields on book_einvoices.
    ALTER TABLE book_einvoices ADD COLUMN IF NOT EXISTS cancel_reason       TEXT;
    ALTER TABLE book_einvoices ADD COLUMN IF NOT EXISTS cancel_remarks      TEXT;
    ALTER TABLE book_einvoices ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ;
    ALTER TABLE book_einvoices ADD COLUMN IF NOT EXISTS eway_valid_upto     TEXT;
    ALTER TABLE book_einvoices ADD COLUMN IF NOT EXISTS eway_status         TEXT;
    ALTER TABLE book_einvoices ADD COLUMN IF NOT EXISTS eway_vehicle_no     TEXT;
    ALTER TABLE book_einvoices ADD COLUMN IF NOT EXISTS eway_transporter_id TEXT;
    ALTER TABLE book_einvoices ADD COLUMN IF NOT EXISTS eway_cancel_reason  TEXT;
    ALTER TABLE book_einvoices ADD COLUMN IF NOT EXISTS eway_cancelled_at   TIMESTAMPTZ;
    -- Imports: Bill of Entry (customs + import IGST) + ITC-04 job-work challans.
    CREATE TABLE IF NOT EXISTS book_bill_of_entry (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           TEXT NOT NULL,
      boe_no              TEXT NOT NULL,
      boe_date            DATE NOT NULL,
      port_code           TEXT,
      vendor_ledger_id    UUID REFERENCES book_ledgers(id),
      assessable_value    NUMERIC(19,4) NOT NULL DEFAULT 0,
      bcd                 NUMERIC(19,4) NOT NULL DEFAULT 0,
      sws                 NUMERIC(19,4) NOT NULL DEFAULT 0,
      import_igst         NUMERIC(19,4) NOT NULL DEFAULT 0,
      landed_cost         NUMERIC(19,4) NOT NULL DEFAULT 0,
      customs_payable     NUMERIC(19,4) NOT NULL DEFAULT 0,
      hsn_sac             TEXT,
      reference           TEXT,
      narration           TEXT,
      voucher_id          UUID REFERENCES book_vouchers(id),
      created_by          UUID,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, boe_no)
    );
    CREATE INDEX IF NOT EXISTS idx_book_boe_date   ON book_bill_of_entry(tenant_id, boe_date);
    CREATE INDEX IF NOT EXISTS idx_book_boe_vendor ON book_bill_of_entry(tenant_id, vendor_ledger_id);
    CREATE TABLE IF NOT EXISTS book_itc04_challans (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           TEXT NOT NULL,
      direction           TEXT NOT NULL CHECK (direction IN ('SENT','RECEIVED')),
      challan_no          TEXT NOT NULL,
      challan_date        DATE NOT NULL,
      job_worker_gstin    TEXT,
      job_worker_name     TEXT,
      item_description    TEXT,
      hsn_sac             TEXT,
      qty                 NUMERIC(19,4) NOT NULL DEFAULT 0,
      uom                 TEXT,
      taxable_value       NUMERIC(19,4) NOT NULL DEFAULT 0,
      goods_type          TEXT NOT NULL DEFAULT 'INPUT' CHECK (goods_type IN ('INPUT','CAPITAL_GOODS')),
      original_challan_no TEXT,
      narration           TEXT,
      created_by          UUID,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_itc04_dir ON book_itc04_challans(tenant_id, direction, challan_date);
    CREATE INDEX IF NOT EXISTS idx_book_itc04_jw  ON book_itc04_challans(tenant_id, job_worker_gstin);

    -- ── Books Wave A2 (depth): GL / inventory / payments ────────────────────────
    -- (1) Persistent Stock-Ledger-Entry columns + reposting journal (back-dated recompute).
    ALTER TABLE book_stock_movements ADD COLUMN IF NOT EXISTS posting_date DATE;
    ALTER TABLE book_stock_movements ADD COLUMN IF NOT EXISTS qty_after    NUMERIC(19,4);
    ALTER TABLE book_stock_movements ADD COLUMN IF NOT EXISTS value_after  NUMERIC(19,4);
    ALTER TABLE book_stock_movements ADD COLUMN IF NOT EXISTS fifo_queue   JSONB;
    ALTER TABLE book_stock_movements ADD COLUMN IF NOT EXISTS reposted_at  TIMESTAMPTZ;
    UPDATE book_stock_movements SET posting_date = created_at::date WHERE posting_date IS NULL;
    CREATE INDEX IF NOT EXISTS idx_book_stock_mv_chron ON book_stock_movements(tenant_id, item_id, posting_date, created_at, id);
    CREATE TABLE IF NOT EXISTS book_repost_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL,
      item_id UUID NOT NULL REFERENCES book_stock_items(id), warehouse_id UUID, from_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','REWRITTEN','POSTED','FAILED')),
      voucher_id UUID REFERENCES book_vouchers(id), detail JSONB, created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, item_id, from_date)
    );
    CREATE INDEX IF NOT EXISTS idx_book_repost_runs_status ON book_repost_runs(tenant_id, status, updated_at);
    -- Landed-cost voucher header + per-item apportionment lines.
    CREATE TABLE IF NOT EXISTS book_landed_cost_vouchers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL,
      voucher_id UUID NOT NULL REFERENCES book_vouchers(id), lcv_date DATE NOT NULL,
      reference TEXT, narration TEXT, total_charge NUMERIC(19,4) NOT NULL DEFAULT 0,
      charges JSONB, created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_lcv ON book_landed_cost_vouchers(tenant_id, lcv_date);
    CREATE TABLE IF NOT EXISTS book_landed_cost_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL,
      lcv_id UUID NOT NULL REFERENCES book_vouchers(id), item_id UUID NOT NULL REFERENCES book_stock_items(id),
      applied_amount NUMERIC(19,4) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_lci ON book_landed_cost_items(tenant_id, lcv_id);
    -- (2) FX per-party foreign-currency open-position subledger (exchange-rate revaluation).
    CREATE TABLE IF NOT EXISTS book_fx_open_position (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL,
      party_ledger_id UUID NOT NULL REFERENCES book_ledgers(id), currency TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('RECEIVABLE','PAYABLE')),
      fc_amount NUMERIC(19,4) NOT NULL CHECK (fc_amount > 0), booked_rate NUMERIC(18,6) NOT NULL CHECK (booked_rate > 0),
      fc_settled NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (fc_settled >= 0), booked_date DATE NOT NULL,
      ref_voucher_id UUID REFERENCES book_vouchers(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_fx_open_pos ON book_fx_open_position(tenant_id, party_ledger_id, currency, kind, booked_date);
    CREATE INDEX IF NOT EXISTS idx_book_fx_open_pos_live ON book_fx_open_position(tenant_id, currency) WHERE fc_amount > fc_settled;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_book_fx_open_pos_ref ON book_fx_open_position(tenant_id, ref_voucher_id) WHERE ref_voucher_id IS NOT NULL;
    -- (5) Transaction rules engine (Firefly-III style) + categorisation slots on bank lines.
    CREATE TABLE IF NOT EXISTS book_rule_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT, order_index INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_book_rule_groups ON book_rule_groups(tenant_id, order_index);
    CREATE TABLE IF NOT EXISTS book_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL,
      group_id UUID NOT NULL REFERENCES book_rule_groups(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT,
      strict_mode TEXT NOT NULL DEFAULT 'AND' CHECK (strict_mode IN ('AND','OR')), is_active BOOLEAN NOT NULL DEFAULT true,
      stop_processing BOOLEAN NOT NULL DEFAULT false, order_index INTEGER NOT NULL DEFAULT 0,
      triggers JSONB NOT NULL DEFAULT '[]', actions JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_rules ON book_rules(tenant_id, group_id, order_index);
    ALTER TABLE book_bank_lines ADD COLUMN IF NOT EXISTS category            TEXT;
    ALTER TABLE book_bank_lines ADD COLUMN IF NOT EXISTS suggested_ledger_id UUID REFERENCES book_ledgers(id);
    ALTER TABLE book_bank_lines ADD COLUMN IF NOT EXISTS tags                TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE book_bank_lines ADD COLUMN IF NOT EXISTS flagged             BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE book_bank_lines ADD COLUMN IF NOT EXISTS applied_rule_id     UUID REFERENCES book_rules(id);
    -- (6) Bank-statement importer Configuration + hash-based idempotent dedup.
    CREATE TABLE IF NOT EXISTS book_import_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL, name TEXT NOT NULL,
      format TEXT NOT NULL CHECK (format IN ('ofx','qfx','qif','camt053','camt','mt940','csv')),
      bank_ledger_id UUID REFERENCES book_ledgers(id), date_format TEXT,
      mappings JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_book_import_configs ON book_import_configs(tenant_id, bank_ledger_id);
    CREATE TABLE IF NOT EXISTS book_import_hashes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL,
      bank_ledger_id UUID REFERENCES book_ledgers(id),
      config_id UUID REFERENCES book_import_configs(id) ON DELETE SET NULL,
      line_hash TEXT NOT NULL, imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, bank_ledger_id, line_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_book_import_hashes ON book_import_hashes(tenant_id, bank_ledger_id);
    -- (7) Dunning ladder config + run history (tenant_id TEXT to match the rest of the schema).
    CREATE TABLE IF NOT EXISTS book_dunning_levels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL,
      procedure TEXT NOT NULL DEFAULT 'Default', level INTEGER NOT NULL, name TEXT NOT NULL,
      min_overdue_days INTEGER NOT NULL, interest_pct NUMERIC(9,4) NOT NULL DEFAULT 0,
      fee NUMERIC(19,4) NOT NULL DEFAULT 0, tone TEXT NOT NULL DEFAULT 'firm',
      subject TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT book_dunning_levels_uq UNIQUE (tenant_id, procedure, level)
    );
    CREATE TABLE IF NOT EXISTS book_dunning_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL, voucher_id UUID NOT NULL,
      party_ledger_id UUID, procedure TEXT NOT NULL DEFAULT 'Default', level INTEGER NOT NULL, level_name TEXT,
      tone TEXT, as_of_date DATE NOT NULL, days_overdue INTEGER NOT NULL, outstanding NUMERIC(19,4) NOT NULL,
      interest NUMERIC(19,4) NOT NULL DEFAULT 0, fee NUMERIC(19,4) NOT NULL DEFAULT 0, total_due NUMERIC(19,4) NOT NULL,
      subject TEXT, body TEXT, created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- (8) Payment webhook idempotency + ordering store.
    CREATE TABLE IF NOT EXISTS book_payment_webhook_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider TEXT NOT NULL, event_id TEXT NOT NULL,
      event_type TEXT, resource_key TEXT, updated_at TIMESTAMPTZ, received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_book_pay_webhook_evt ON book_payment_webhook_events(provider, event_id);
    CREATE INDEX IF NOT EXISTS idx_book_pay_webhook_resource ON book_payment_webhook_events(provider, resource_key, updated_at);
    CREATE INDEX IF NOT EXISTS idx_book_pay_webhook_received ON book_payment_webhook_events(received_at);
    -- (9) Balance-assertion / reconciliation integrity layer.
    CREATE TABLE IF NOT EXISTS book_balance_assertions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL,
      ledger_id UUID NOT NULL REFERENCES book_ledgers(id), as_of_date DATE NOT NULL,
      expected_signed NUMERIC(19,4) NOT NULL, actual_signed NUMERIC(19,4) NOT NULL, diff_signed NUMERIC(19,4) NOT NULL,
      tolerance NUMERIC(19,4) NOT NULL DEFAULT 0, passed BOOLEAN NOT NULL, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_assertions_ledger ON book_balance_assertions(tenant_id, ledger_id, as_of_date);
    CREATE INDEX IF NOT EXISTS idx_book_assertions_failed ON book_balance_assertions(tenant_id, passed, created_at DESC);
    -- (10) PSP settlement reconciliation lines + exceptions.
    CREATE TABLE IF NOT EXISTS book_settlement_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL, provider TEXT NOT NULL,
      financial_year TEXT NOT NULL, ext_key TEXT NOT NULL, txn_ref TEXT, order_id TEXT, utr TEXT,
      gross NUMERIC(19,4) NOT NULL, fee NUMERIC(19,4) NOT NULL DEFAULT 0, tax NUMERIC(19,4) NOT NULL DEFAULT 0,
      net NUMERIC(19,4) NOT NULL, settled_on DATE,
      status TEXT NOT NULL DEFAULT 'EXPECTED' CHECK (status IN ('EXPECTED','POSTED','CANCELLED')),
      bank_line_id UUID REFERENCES book_bank_lines(id), receipt_voucher_id UUID REFERENCES book_vouchers(id),
      raw JSONB, reconciled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, provider, ext_key)
    );
    CREATE INDEX IF NOT EXISTS idx_book_settlement_lines ON book_settlement_lines(tenant_id, provider, status);
    CREATE INDEX IF NOT EXISTS idx_book_settlement_lines_utr ON book_settlement_lines(tenant_id, utr);
    CREATE TABLE IF NOT EXISTS book_settlement_exceptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL,
      settlement_line_id UUID NOT NULL REFERENCES book_settlement_lines(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('FEE','SHORT','OVER','MISSING_DEPOSIT','MISSING_RECEIPT')),
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','IGNORED')),
      amount NUMERIC(19,4), detail JSONB, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, settlement_line_id, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_book_settlement_exc ON book_settlement_exceptions(tenant_id, status, kind);
    ALTER TABLE book_bank_lines ADD COLUMN IF NOT EXISTS settlement_line_id UUID REFERENCES book_settlement_lines(id);
    CREATE INDEX IF NOT EXISTS idx_book_bank_lines_settle ON book_bank_lines(tenant_id, settlement_line_id);
    -- (11) Firefly-III-style recurrence model.
    CREATE TABLE IF NOT EXISTS book_recurrences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id TEXT NOT NULL, name TEXT NOT NULL,
      template_kind TEXT NOT NULL CHECK (template_kind IN ('SALES_INVOICE','BILL','JOURNAL')),
      template JSONB NOT NULL DEFAULT '{}'::jsonb, start_date DATE NOT NULL,
      rep_type TEXT NOT NULL CHECK (rep_type IN ('daily','weekly','monthly','yearly','ndom')),
      rep_moment TEXT, rep_skip INTEGER NOT NULL DEFAULT 0,
      rep_weekend TEXT NOT NULL DEFAULT 'do-nothing' CHECK (rep_weekend IN ('do-nothing','skip','prev-workday','next-workday')),
      end_kind TEXT NOT NULL DEFAULT 'none' CHECK (end_kind IN ('none','date','count')), end_date DATE, end_count INTEGER,
      next_run DATE, last_run DATE, occurrences_done INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true,
      created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_book_recurrences ON book_recurrences(tenant_id, active, next_run);

    -- Books Wave-6: dated exchange-rate master (multi-currency + forex gain/loss).
    CREATE TABLE IF NOT EXISTS book_fx_rates (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  TEXT NOT NULL,
      currency   TEXT NOT NULL,
      rate_date  DATE NOT NULL,
      rate       NUMERIC(18,6) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, currency, rate_date)
    );
    CREATE INDEX IF NOT EXISTS idx_book_fx_rates ON book_fx_rates(tenant_id, currency, rate_date DESC);

    -- Vendor master (vendors page): a real profile per vendor, not just a txn string.
    CREATE TABLE IF NOT EXISTS vendor_master (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       TEXT NOT NULL,
      name            TEXT NOT NULL,
      gstin           TEXT,
      pan             TEXT,
      contact_name    TEXT,
      phone           TEXT,
      email           TEXT,
      upi             TEXT,
      bank_account    TEXT,
      bank_ifsc       TEXT,
      payment_terms_days INT DEFAULT 30,
      is_msme         BOOLEAN DEFAULT false,
      udyam           TEXT,
      category        TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT now(),
      updated_at      TIMESTAMPTZ DEFAULT now(),
      UNIQUE (tenant_id, name)
    );
    CREATE INDEX IF NOT EXISTS vendor_master_tenant ON vendor_master(tenant_id);

    -- Advisor workspace (CA practice-management trackers): server-side per-advisor KV
    -- so the whole firm sees the same board, not one browser's localStorage.
    CREATE TABLE IF NOT EXISTS advisor_workspace (
      advisor_id  UUID NOT NULL,
      key         TEXT NOT NULL,
      value       JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at  TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (advisor_id, key)
    );

    -- Treasury portfolio: the owner records an actual FD/liquid-fund/T-bill once and
    -- it becomes the source of truth for the overview + maturity reminders.
    CREATE TABLE IF NOT EXISTS treasury_holdings (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     TEXT NOT NULL,
      kind          TEXT NOT NULL DEFAULT 'fd',
      label         TEXT,
      bank          TEXT,
      amount        NUMERIC(16,2) NOT NULL DEFAULT 0,
      rate          NUMERIC(6,3),
      start_date    DATE,
      maturity_date DATE,
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS treasury_holdings_tenant ON treasury_holdings(tenant_id, maturity_date);

    -- Lender co-lending auction: real borrower applications + persisted lender bids.
    CREATE TABLE IF NOT EXISTS lender_applications (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     TEXT NOT NULL,
      company_name  TEXT,
      amount        NUMERIC(16,2) NOT NULL DEFAULT 0,
      purpose       TEXT,
      tenure_months INT DEFAULT 12,
      status        TEXT NOT NULL DEFAULT 'open',
      created_by    UUID,
      created_at    TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS lender_applications_status ON lender_applications(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS lender_applications_tenant ON lender_applications(tenant_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS lender_bids (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id UUID NOT NULL REFERENCES lender_applications(id) ON DELETE CASCADE,
      lender_id      UUID,
      lender_label   TEXT,
      rate           NUMERIC(6,3),
      amount         NUMERIC(16,2),
      note           TEXT,
      created_at     TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS lender_bids_app ON lender_bids(application_id, created_at DESC);
  `);
}

module.exports = { pool, initDb };
