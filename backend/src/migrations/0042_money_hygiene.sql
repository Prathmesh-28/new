-- ── Wave 15: money-out hygiene ───────────────────────────────────────────────
-- Three gaps from the audit's money section:
--   106  a bank credit could not be matched to the invoice it pays — reconciliation was
--        eyeballs and memory, so the same receipt could be keyed twice or never;
--   107  a small residual balance had no write-off action, so 40-paise leftovers aged in
--        the receivables report forever;
--   108/9 an advance from a customer had nowhere to live: it was either keyed as a fake
--        receipt against a not-yet-existing invoice, or forgotten.

-- Provenance both ways between the bank line and the receipt it became — so a matched
-- credit can never be matched twice, and a receipt can say which bank line proved it.
ALTER TABLE transactions    ADD COLUMN IF NOT EXISTS matched_invoice_id UUID;
ALTER TABLE transactions    ADD COLUMN IF NOT EXISTS matched_payment_id UUID;
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS transaction_id    UUID;
CREATE INDEX IF NOT EXISTS idx_txn_matched ON transactions(tenant_id, matched_invoice_id) WHERE matched_invoice_id IS NOT NULL;

-- Write-offs: the residue is absorbed into the invoice's settlement (credited_amount —
-- the same field the entire outstanding calculation already nets off, so every existing
-- aggregate stays correct WITHOUT touching its SQL), while this table keeps the honest
-- record of what was written off, why, and by whom. Deliberately NOT a credit note:
-- a bad-debt write-off must not reverse output GST, and credit notes are GSTR-visible.
CREATE TABLE IF NOT EXISTS invoice_writeoffs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount     NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  reason     TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_writeoffs ON invoice_writeoffs(tenant_id, invoice_id);

-- Advances: money received BEFORE any invoice exists, held against the customer and
-- allocated to invoices later. applied/refunded can never exceed amount (enforced here,
-- not just in code).
CREATE TABLE IF NOT EXISTS customer_advances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  advance_number  TEXT NOT NULL,
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  applied_amount  NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (applied_amount >= 0),
  refunded_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  mode            TEXT NOT NULL DEFAULT 'other',
  reference       TEXT,
  notes           TEXT,
  received_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT advance_never_overdrawn CHECK (applied_amount + refunded_amount <= amount)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_advance_number ON customer_advances(tenant_id, advance_number);
CREATE INDEX IF NOT EXISTS idx_advances_customer ON customer_advances(tenant_id, customer_id);

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoice_writeoffs','customer_advances'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
  END LOOP;
END
$rls$;
