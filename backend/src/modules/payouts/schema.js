"use strict";
// Shared PAYOUTS rail — the single module every "money out to a beneficiary" feature calls
// (lending disbursal, BNPL supplier payout, EWA advance, treasury sweep, vendor pay). Before
// this, each of those had its own stub/comment and no real lifecycle. This models the payout
// STATE MACHINE (pending → queued → processing → settled / failed / reversed) with a stable
// business idempotency key, the provider seam (RazorpayX / Setu — gated), and an append-only
// event log for webhook auditing. The actual rail call is credential-gated; without creds a
// payout still works in MANUAL mode (an operator confirms the offline transfer). We NEVER
// fabricate a settlement. GL is posted (idempotent) only when a payout is CONFIRMED settled.
const PAYOUTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS payout_requests (
  id                     UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  tenant_id              TEXT NOT NULL,
  kind                   TEXT NOT NULL DEFAULT 'vendor'
                           CHECK (kind IN ('disbursal','bnpl','ewa','treasury','vendor','refund','other')),
  beneficiary_name       TEXT,
  beneficiary_upi        TEXT,                                 -- VPA (masked-ok for display)
  beneficiary_ifsc       TEXT,
  beneficiary_account_last4 TEXT,                              -- full account is passed to the rail, never persisted
  amount                 NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  currency               TEXT NOT NULL DEFAULT 'INR',
  purpose                TEXT,
  ref_type               TEXT,                                 -- 'loan' | 'bnpl_drawdown' | 'employee' | 'treasury_sweep' | 'bill'
  ref_id                 TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','queued','processing','settled','failed','reversed','cancelled')),
  provider               TEXT NOT NULL DEFAULT 'manual'
                           CHECK (provider IN ('manual','razorpayx','setu')),
  provider_ref           TEXT,                                 -- provider payout id (RazorpayX pout_… / Setu id)
  idempotency_key        TEXT,                                 -- caller's stable business key (e.g. bnpl:<id>)
  utr                    TEXT,                                 -- bank UTR on settlement
  failure_reason         TEXT,
  gl_voucher_id          UUID,                                 -- the settlement GL voucher (books)
  created_by             UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payout_requests_tenant ON payout_requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(tenant_id, status);
-- One payout per business key (idempotent create): a retried disbursal/drawdown/advance collapses
-- to the same row. Partial + IS NOT NULL so rows without a key are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_requests_idem ON payout_requests(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Webhook lookup path: the provider only knows its own ref. Partial index, tenant-scoped by
-- the caller after it reads notes.tenant_id off the (authenticated, signed) webhook payload.
CREATE INDEX IF NOT EXISTS idx_payout_requests_provider_ref ON payout_requests(provider, provider_ref) WHERE provider_ref IS NOT NULL;

-- Append-only-ish audit of every provider interaction (create, webhook, manual settle, retry).
-- Kept for reconciliation + dispute evidence; one row per event, never updated.
CREATE TABLE IF NOT EXISTS payout_events (
  id              UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  tenant_id       TEXT NOT NULL,
  payout_id       UUID REFERENCES payout_requests(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,                               -- created | provider_queued | webhook | settled | failed | manual_settle | retry
  provider        TEXT,
  signature_valid BOOLEAN,
  payload_hash    TEXT,
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_events_payout ON payout_events(payout_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_events_tenant ON payout_events(tenant_id, created_at DESC);
`;

module.exports = { PAYOUTS_SCHEMA };
