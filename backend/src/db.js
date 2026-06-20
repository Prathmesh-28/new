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

  // ── Wave-1c depth tables: real master/persistence behind features that were stubs ──
  await pool.query(`
    -- Company UPI/VPA — used by sales "Accept → create order" + invoice payment links.
    ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS upi_id TEXT;

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
