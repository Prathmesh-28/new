-- ── Wave 9: the customer portal ──────────────────────────────────────────────
-- There was no way for a CUSTOMER to see what they owe. Everything about collections
-- pointed inwards: the firm chased, the customer replied "send me the invoice again", and
-- a person re-attached a PDF. A link the customer can open — their open invoices, their
-- statement, and a way to pay — removes most of that loop.
--
-- The token is stored HASHED. A share link ends up in email, WhatsApp and browser history;
-- a database dump must not hand out working links to every customer's ledger.
CREATE TABLE IF NOT EXISTS customer_portal_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT NOT NULL,
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,
  -- The last 4 characters of the token, so the UI can show WHICH link is which without
  -- being able to reconstruct it.
  token_hint     TEXT NOT NULL,
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  view_count     INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_links_customer ON customer_portal_links(tenant_id, customer_id);

-- One live link per customer at a time: several simultaneous links are impossible to
-- reason about when revoking. Revoked and expired rows stay for the audit trail.
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_link_active
  ON customer_portal_links(tenant_id, customer_id) WHERE revoked_at IS NULL;

-- Payment receipts. A customer who paid got no acknowledgement from the system — the
-- receipt existed only as a row in invoice_payments.
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS receipt_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_number ON invoice_payments(tenant_id, receipt_number) WHERE receipt_number IS NOT NULL;

-- NOTE ON RLS, deliberately different from every other table added in these waves:
-- this one is NOT under FORCE row-level security. The whole point of a portal link is that
-- it is resolved by a request with NO tenant context — the customer is not a user of the
-- product — so there is no app.current_tenant to set, and under FORCE RLS the lookup would
-- return zero rows for everyone including the owner role. This follows the existing
-- convention for public-token tables (credit_passports, 0022): the token IS the
-- authorisation, and every authenticated query below scopes by tenant_id explicitly.
-- The token is stored hashed, is single-use-per-customer, expires, and is revocable.
