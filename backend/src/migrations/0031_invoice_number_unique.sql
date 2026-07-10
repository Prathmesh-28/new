-- One number, one document (per tenant). An audit found nextInvoiceNumber computed
-- max+1 from an unlocked SELECT with NO unique constraint, so two concurrent creates
-- (double-click, retry, cron + manual) could mint the same INV number - and the
-- Razorpay payment webhook resolves invoices BY NUMBER (collections.js "LIMIT 1
-- FOR UPDATE", no ORDER BY), so a same-tenant duplicate could mark the WRONG
-- customer's invoice as paid. Credit notes had the identical pattern.
--
-- This migration (runs once, in its own transaction):
--   1. suffixes any pre-existing duplicates -D2/-D3/... (earliest keeps the number),
--   2. adds the unique indexes that make recurrence impossible.
-- FORCE RLS is lifted for the dedup only - the owner must see ALL tenants' rows to
-- dedup them; it is restored before the transaction commits. The application-side
-- numbering also now takes a per-tenant advisory lock (lib/invoiceCreate.js), so the
-- index is the backstop, not the primary mechanism.
ALTER TABLE invoices NO FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_credit_notes NO FORCE ROW LEVEL SECURITY;

UPDATE invoices i SET invoice_number = i.invoice_number || '-D' || d.rn
  FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id, invoice_number ORDER BY created_at, id) AS rn
          FROM invoices) d
 WHERE d.id = i.id AND d.rn > 1;

UPDATE invoice_credit_notes n SET note_number = n.note_number || '-D' || d.rn
  FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id, note_number ORDER BY created_at, id) AS rn
          FROM invoice_credit_notes) d
 WHERE d.id = n.id AND d.rn > 1;

ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_credit_notes FORCE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_tenant_number ON invoices(tenant_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_notes_tenant_number ON invoice_credit_notes(tenant_id, note_number);
