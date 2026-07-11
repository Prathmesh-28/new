-- A won deal's raiseInvoice() pre-fills a new invoice from deal.value but nothing linked
-- the two records, so the invoice could be freely edited afterward (discount, line-item
-- changes, partial delivery) and the CRM's "Won Value" would silently drift from what was
-- actually invoiced/collected with no way to tell. This links a deal to the real invoice
-- it produced, so the pipeline can reconcile against invoices.total_amount/paid_amount
-- instead of trusting the static deal.value forever once a deal has converted.
-- ON DELETE SET NULL: deleting the invoice must not block (a bare FK would make the
-- invoice undeletable once linked) nor cascade away the deal - the deal just degrades
-- back to showing its typed pipeline value, which the unlinked branch already handles.
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_deals_invoice ON crm_deals(invoice_id) WHERE invoice_id IS NOT NULL;
