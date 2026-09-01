-- ── Wave 3: the customer master ──────────────────────────────────────────────
-- Until now there was no customers table. `invoices.customer_name` was free text, so:
--   • "Acme Traders", "Acme traders" and "Acme Traders " were three customers;
--   • there was no customer ledger, no contact list, no address, no opening balance;
--   • credit limits lived in three different name-keyed maps that disagreed with each
--     other (found in the 2026-07 audit) because there was nowhere authoritative to put one;
--   • place of supply had to be guessed from the buyer's GSTIN, which does not exist for
--     an unregistered (B2C) buyer — so the CGST/SGST vs IGST split was a guess for exactly
--     the customers where it is easiest to get wrong.
--
-- Existing invoices are backfilled into customers by name, so no history is orphaned and
-- the ledger works from day one.

CREATE TABLE IF NOT EXISTS customers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            TEXT NOT NULL,
  name                 TEXT NOT NULL,
  display_name         TEXT,
  gstin                TEXT,
  pan                  TEXT,
  email                TEXT,
  phone                TEXT,

  billing_line1        TEXT,
  billing_line2        TEXT,
  billing_city         TEXT,
  billing_state        TEXT,
  billing_state_code   TEXT,
  billing_pincode      TEXT,
  billing_country      TEXT NOT NULL DEFAULT 'India',

  -- Ship-to differs from bill-to often enough (and changes the place of supply for goods)
  -- that keeping only one address quietly produces wrong tax.
  shipping_same        BOOLEAN NOT NULL DEFAULT true,
  shipping_line1       TEXT,
  shipping_line2       TEXT,
  shipping_city        TEXT,
  shipping_state       TEXT,
  shipping_state_code  TEXT,
  shipping_pincode     TEXT,

  -- Stated, not inferred: this is what decides IGST vs CGST+SGST.
  place_of_supply_code TEXT,
  gst_treatment        TEXT NOT NULL DEFAULT 'unregistered',  -- regular|composition|unregistered|overseas|sez|deemed_export
  tds_section          TEXT,

  payment_terms_days   INTEGER NOT NULL DEFAULT 0,
  credit_limit         NUMERIC(15,2) NOT NULL DEFAULT 0,
  opening_balance      NUMERIC(15,2) NOT NULL DEFAULT 0,
  opening_balance_date DATE,

  notes                TEXT,
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  archived_at          TIMESTAMPTZ,
  created_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One customer per name per firm. This is the constraint that stops the duplicate-by-typo
-- problem at the source rather than cleaning it up afterwards.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_name ON customers(tenant_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_customers_gstin ON customers(tenant_id, gstin) WHERE gstin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(tenant_id, archived_at);

-- More than one human per customer: the owner who signs and the accounts-payable clerk who
-- actually pays are rarely the same person, and reminders should reach the second one.
CREATE TABLE IF NOT EXISTS customer_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT,
  email       TEXT,
  phone       TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_contacts ON customer_contacts(tenant_id, customer_id);

-- ── Link invoices to the master ──────────────────────────────────────────────
-- customer_name stays on the invoice: it is the name AS BILLED and must not silently
-- change when someone later corrects the master. customer_id is the join for the ledger.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(tenant_id, customer_id);

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- invoices is FORCE-RLS (0015) and this migration runs with no app.current_tenant GUC, so
-- a plain SELECT would see zero rows. Lift FORCE for the backfill and restore it — the
-- same maintenance pattern as 0026/0031, all inside this migration's transaction.
ALTER TABLE invoices NO FORCE ROW LEVEL SECURITY;

-- One customer per (tenant, trimmed lowercase name). The most recent invoice for that name
-- wins for contact details, because it is the most likely to be current.
INSERT INTO customers (tenant_id, name, gstin, email, phone, place_of_supply_code, gst_treatment, created_at)
SELECT DISTINCT ON (i.tenant_id, lower(btrim(i.customer_name)))
       i.tenant_id,
       btrim(i.customer_name),
       NULLIF(btrim(COALESCE(i.customer_gstin, '')), ''),
       NULLIF(btrim(COALESCE(i.customer_email, '')), ''),
       NULLIF(btrim(COALESCE(i.customer_phone, '')), ''),
       CASE WHEN i.customer_gstin ~ '^[0-9]{2}' THEN substr(btrim(i.customer_gstin), 1, 2) END,
       CASE WHEN NULLIF(btrim(COALESCE(i.customer_gstin, '')), '') IS NOT NULL THEN 'regular' ELSE 'unregistered' END,
       min(i.created_at) OVER (PARTITION BY i.tenant_id, lower(btrim(i.customer_name)))
  FROM invoices i
 WHERE btrim(COALESCE(i.customer_name, '')) <> ''
 ORDER BY i.tenant_id, lower(btrim(i.customer_name)), i.created_at DESC
ON CONFLICT DO NOTHING;

UPDATE invoices i SET customer_id = c.id
  FROM customers c
 WHERE c.tenant_id = i.tenant_id
   AND lower(btrim(c.name)) = lower(btrim(i.customer_name))
   AND i.customer_id IS NULL;

ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','customer_contacts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
  END LOOP;
END
$rls$;
