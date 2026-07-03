-- #161 e-Courts as a gated enrichment kind + #167 post-transaction ratings.
-- (1) widen the enrichments kind CHECK on existing DBs to include 'ecourts' (fresh DBs get it
--     from schema.js). (2) FORCE-RLS the new counterparty_ratings table (created via schema.js),
--     matching the tenant-isolation on counterparty_enrichments / counterparty_invites (0019).
DO $mig$
BEGIN
  -- Widen the kind CHECK (drop the auto-named constraint, re-add including ecourts).
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='counterparty_enrichments_kind_check') THEN
    EXECUTE 'ALTER TABLE counterparty_enrichments DROP CONSTRAINT counterparty_enrichments_kind_check';
  END IF;
  EXECUTE $c$ALTER TABLE counterparty_enrichments ADD CONSTRAINT counterparty_enrichments_kind_check CHECK (kind IN ('gstn','mca','gsp','udyam','ecourts'))$c$;

  -- RLS on ratings (table itself is created idempotently by COUNTERPARTY_SCHEMA before migrations).
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='counterparty_ratings') THEN
    EXECUTE 'ALTER TABLE counterparty_ratings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE counterparty_ratings FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON counterparty_ratings';
    EXECUTE $p$CREATE POLICY tenant_isolation ON counterparty_ratings
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
  END IF;
END
$mig$;
