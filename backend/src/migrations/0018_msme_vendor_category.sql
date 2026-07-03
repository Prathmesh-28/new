-- MSME depth: split the is_msme boolean into a micro/small/medium classification. Section
-- 43B(h) (45-day payment / deduction-disallowance) fires ONLY for Micro & Small enterprises,
-- NOT Medium — the boolean masked that distinction, producing wrong disallowance flags. Plus
-- Udyam registration metadata for the certificate vault. Existing DBs get the columns here;
-- fresh DBs get them from db.js. Idempotent.
ALTER TABLE vendor_master ADD COLUMN IF NOT EXISTS msme_category       TEXT;
ALTER TABLE vendor_master ADD COLUMN IF NOT EXISTS udyam_registered_on DATE;
ALTER TABLE vendor_master ADD COLUMN IF NOT EXISTS udyam_doc_url       TEXT;
-- Backfill: an MSME vendor with no category yet is treated as 'small' (the common case, and the
-- conservative 43B(h) default — still in scope). Owners refine micro/small/medium per vendor.
UPDATE vendor_master SET msme_category='small' WHERE is_msme=true AND msme_category IS NULL;
