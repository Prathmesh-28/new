-- Brand kit (#184): document brand colours, letterhead header/footer lines, and the signatory
-- block, persisted on the tenant profile so every document renderer + the seal/letterhead
-- generators read one source of truth. Idempotent.
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS brand_primary          TEXT;
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS brand_accent           TEXT;
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS letterhead_header      TEXT;
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS letterhead_footer      TEXT;
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS signatory_name         TEXT;
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS signatory_designation  TEXT;
