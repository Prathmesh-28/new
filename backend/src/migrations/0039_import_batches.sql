-- ── Wave 11: imports you can undo ────────────────────────────────────────────
-- Bulk imports were one-way: a wrong-column CSV landed hundreds of bad rows with no way to
-- take back just that upload. Every bulk insert now belongs to a batch, and the batch can
-- be rolled back as a unit — deleting exactly the rows IT created and nothing else.
CREATE TABLE IF NOT EXISTS import_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,
  entity       TEXT NOT NULL,               -- transactions | customers | ...
  filename     TEXT,
  row_count    INTEGER NOT NULL DEFAULT 0,
  skipped_dupes INTEGER NOT NULL DEFAULT 0,
  skipped_errors INTEGER NOT NULL DEFAULT 0,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID
);
CREATE INDEX IF NOT EXISTS idx_import_batches ON import_batches(tenant_id, created_at DESC);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_batch_id UUID;
CREATE INDEX IF NOT EXISTS idx_txn_import_batch ON transactions(tenant_id, import_batch_id) WHERE import_batch_id IS NOT NULL;

DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE import_batches FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON import_batches';
  EXECUTE $p$CREATE POLICY tenant_isolation ON import_batches
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
END
$rls$;
