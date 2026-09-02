-- ── Wave 4: make the invoice a real tax invoice ──────────────────────────────
-- The invoices table was missing fields an Indian tax invoice cannot legally or
-- practically do without:
--   • NO invoice_date. The document date was created_at — its database insert timestamp —
--     so an invoice could never be back-dated to the actual date of supply, and every
--     invoice raised in a catch-up session carried today's date.
--   • NO place of supply and NO CGST/SGST/IGST columns. The split was DERIVED at print
--     time from the buyer's GSTIN, which does not exist for an unregistered buyer, so for
--     B2C sales the document simply guessed.
--   • NO currency, PO number, terms, notes, discount, shipping or round-off — so export
--     sales were impossible, a customer's PO could not be quoted back to them, and the
--     rounded total on the page never tied to the sum of its lines.
--   • NO void: cancelling meant deleting, which destroyed the number sequence.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date         DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS place_of_supply_code TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_inter_state       BOOLEAN;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reverse_charge       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst_amount          NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst_amount          NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS igst_amount          NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cess_amount          NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency             TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate        NUMERIC(14,6) NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS po_number            TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reference            TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms                TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes                TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount      NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shipping_amount      NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS round_off            NUMERIC(8,2)  NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_at            TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_by            UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason          TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS version              INTEGER NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ;

-- Per-line discount and unit of measure. "2 boxes @ 500 less 10%" was previously
-- expressible only by the user doing the arithmetic themselves and typing the result.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS uom             TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_pct    NUMERIC(6,3) NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS taxable_value   NUMERIC(15,2);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_amount      NUMERIC(15,2);

-- ── Revision history ─────────────────────────────────────────────────────────
-- "What did this invoice say before someone edited it?" had no answer. Each edit stores
-- the PREVIOUS state, so the trail reconstructs the document as issued.
CREATE TABLE IF NOT EXISTS invoice_revisions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  snapshot   JSONB NOT NULL,
  reason     TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_revisions ON invoice_revisions(tenant_id, invoice_id, version DESC);

-- ── Attachments on a record ──────────────────────────────────────────────────
-- The signed PO, the delivery proof, the customer's email approving the price — all of it
-- lived in someone's inbox because a record could not hold a file.
CREATE TABLE IF NOT EXISTS record_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  label       TEXT,
  uploaded_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_record_attachments ON record_attachments(tenant_id, entity, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_record_attachment ON record_attachments(tenant_id, entity, entity_id, file_id);

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Every existing invoice gets the document date it always implicitly had (the date it was
-- created) and its tax split written down explicitly, so nothing has to re-derive it later.
-- FORCE RLS is lifted for the maintenance statements and restored, as in 0026/0031/0034.
ALTER TABLE invoices NO FORCE ROW LEVEL SECURITY;
-- customers (0034) is FORCE-RLS too, and the place-of-supply backfill below reads it via
-- a subquery. As the production (non-superuser) role that subquery would silently return
-- NULL for every row — a superuser dev database hides this. Lift for the DML, restore after.
ALTER TABLE customers NO FORCE ROW LEVEL SECURITY;

UPDATE invoices SET invoice_date = created_at::date WHERE invoice_date IS NULL;
UPDATE invoices SET updated_at   = created_at       WHERE updated_at IS NULL;

-- Place of supply from the buyer's GSTIN where we have one; else from the customer master.
UPDATE invoices i SET place_of_supply_code =
  COALESCE(
    CASE WHEN i.customer_gstin ~ '^[0-9]{2}' THEN substr(btrim(i.customer_gstin), 1, 2) END,
    (SELECT c.place_of_supply_code FROM customers c WHERE c.id = i.customer_id)
  )
 WHERE i.place_of_supply_code IS NULL;

-- Inter-state = both states known AND different. Unknown stays NULL rather than guessing
-- "intra" — a wrong confident answer here misstates the tax on the document.
-- CASE, not a boolean AND-chain: with AND, an unknown place of supply evaluates to FALSE,
-- which asserts "intra-state" (CGST+SGST) for a supply whose state nobody knows — the
-- exact confident-wrong-answer this file's own comment says to avoid. Unknown stays NULL.
UPDATE invoices i SET is_inter_state = CASE
    WHEN i.place_of_supply_code IS NULL OR p.seller_state IS NULL THEN NULL
    ELSE i.place_of_supply_code <> p.seller_state
  END
  FROM (SELECT tenant_id, substr(btrim(gstin), 1, 2) AS seller_state FROM tenant_profile WHERE gstin ~ '^[0-9]{2}') p
 WHERE p.tenant_id = i.tenant_id AND i.is_inter_state IS NULL;

-- Write the split down. SGST takes the odd paise so the two halves always sum exactly to
-- the GST amount — the same rule lib/gstInvoice.js uses for display.
-- Only invoices whose split is actually KNOWN get one written. Where is_inter_state is
-- NULL the three columns stay zero and gst_amount still carries the total, so the document
-- says "split not stated" rather than asserting a split it cannot support.
UPDATE invoices SET
  igst_amount = CASE WHEN is_inter_state IS TRUE  THEN gst_amount ELSE 0 END,
  cgst_amount = CASE WHEN is_inter_state IS FALSE THEN round(gst_amount / 2, 2) ELSE 0 END,
  sgst_amount = CASE WHEN is_inter_state IS FALSE THEN gst_amount - round(gst_amount / 2, 2) ELSE 0 END
 WHERE gst_amount > 0 AND is_inter_state IS NOT NULL
   AND cgst_amount = 0 AND sgst_amount = 0 AND igst_amount = 0;

-- Line-level taxable value and tax, so GSTR-1 and the printed document agree line by line.
UPDATE invoice_items SET taxable_value = amount WHERE taxable_value IS NULL;
UPDATE invoice_items SET tax_amount = round(amount * gst_rate / 100, 2) WHERE tax_amount IS NULL;

ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

-- invoice_date is now mandatory for new rows; the backfill above guarantees every existing
-- row already has one.
ALTER TABLE invoices ALTER COLUMN invoice_date SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(tenant_id, invoice_date DESC);

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoice_revisions','record_attachments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
  END LOOP;
END
$rls$;
