-- Recurring invoice schedules that actually GENERATE (audit: the old tab was a client-side
-- tracker with no scheduler — schedules were cosmetic). One row per schedule; the daily books
-- cron generates a real invoice when next_run falls due, advances next_run (skipping missed
-- periods rather than back-billing a surprise catch-up), and optionally auto-sends.
-- FORCE-RLS like invoices (0015): EVERY access via q()/withTenant(); the cron enumerates
-- tenants from users and works per-tenant under the GUC (same pattern as lib/reminders.js).
CREATE TABLE IF NOT EXISTS invoice_recurring (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  customer_name   TEXT NOT NULL,
  customer_gstin  TEXT,
  customer_email  TEXT,
  customer_phone  TEXT,
  gst_rate        NUMERIC(5,2) NOT NULL DEFAULT 18,
  items           JSONB NOT NULL,          -- [{description, hsn_sac, quantity, unit_price, gst_rate}]
  cadence         TEXT NOT NULL CHECK (cadence IN ('weekly','monthly','quarterly')),
  day_of_month    INT CHECK (day_of_month BETWEEN 1 AND 31),
  next_run        DATE NOT NULL,
  due_in_days     INT NOT NULL DEFAULT 15 CHECK (due_in_days BETWEEN 0 AND 180),
  auto_send       BOOLEAN NOT NULL DEFAULT false,  -- email + accrue on generation (needs customer_email)
  active          BOOLEAN NOT NULL DEFAULT true,
  last_run        DATE,
  last_invoice_id UUID,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_recurring_due ON invoice_recurring(tenant_id, active, next_run);

DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE invoice_recurring ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE invoice_recurring FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON invoice_recurring';
  EXECUTE $p$CREATE POLICY tenant_isolation ON invoice_recurring
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
END
$rls$;
