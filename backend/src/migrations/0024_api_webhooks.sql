-- Outbound webhooks (#148/#185): fan internal events (invoice.paid, advance.recovered, payout.*,
-- expiry.due, …) out to tenant-registered URLs, HMAC-signed. Not RLS'd — dispatch runs inside the
-- flows event bus with an explicit tenant filter (book_* convention); owner management is
-- tenant-scoped in the route. Deliveries are logged for debugging.
CREATE TABLE IF NOT EXISTS api_webhooks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  url        TEXT NOT NULL,
  events     TEXT[] NOT NULL DEFAULT ARRAY['*'],   -- '*' = all events
  secret     TEXT NOT NULL,                         -- HMAC-SHA256 signing secret
  active     BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_webhooks_tenant ON api_webhooks(tenant_id, active);

CREATE TABLE IF NOT EXISTS api_webhook_deliveries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  webhook_id  UUID,
  event       TEXT NOT NULL,
  status_code INT,
  ok          BOOLEAN NOT NULL DEFAULT false,
  error       TEXT,
  attempt     INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries ON api_webhook_deliveries(tenant_id, created_at DESC);
