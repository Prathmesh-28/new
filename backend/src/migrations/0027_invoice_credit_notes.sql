-- Credit notes against the standalone invoices table. Until now "credit notes" were a client-side
-- tracker with no numbering, no GL posting and no GSTR impact. This adds the real document:
--   • invoice_credit_notes — numbered CN-YYYY-NNN per tenant, linked to the invoice, carrying its
--     own subtotal/GST/total. The GL bridge posts a CREDIT_NOTE voucher (Dr Sales + Output GST /
--     Cr Debtor) whose tax rows flow into GSTR-1 CDNR and GSTR-3B 4I via the existing engine.
--   • invoices.credited_amount — running total credited; the balance everywhere becomes
--     total − paid − credited, and receipts can never collect credited money.
-- FORCE-RLS like invoices (0015): EVERY access routes through q()/withTenant().
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS credited_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS invoice_credit_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  note_number  TEXT NOT NULL,
  reason       TEXT NOT NULL,
  subtotal     NUMERIC(15,2) NOT NULL CHECK (subtotal >= 0),
  gst_amount   NUMERIC(15,2) NOT NULL CHECK (gst_amount >= 0),
  total_amount NUMERIC(15,2) NOT NULL CHECK (total_amount > 0),
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_credit_notes_tenant ON invoice_credit_notes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_credit_notes_invoice ON invoice_credit_notes(tenant_id, invoice_id);
-- Two concurrent issuances must not mint the same CN number: the number is read outside a
-- table lock (same pattern as invoice numbering), so enforce uniqueness here — the loser's
-- transaction rolls back loudly instead of silently duplicating a statutory document number.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_credit_notes_number ON invoice_credit_notes(tenant_id, note_number);

DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE invoice_credit_notes ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE invoice_credit_notes FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON invoice_credit_notes';
  EXECUTE $p$CREATE POLICY tenant_isolation ON invoice_credit_notes
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
END
$rls$;
