"use strict";
// Rewards (pre-order) crowdfunding — Keep-it-All core. Self-contained tenant-scoped
// tables; only dependency is collab_uuidv7() (applied earlier in initDb) for sortable
// PKs + keyset pagination. A backer is a CUSTOMER (own table) — NOT an investor, so
// this never touches the equity capital_raises/investors model. The campaigns.status
// enum IS the state machine (guarded in http.js / index.js).
const CROWDFUNDING_SCHEMA = `
CREATE TABLE IF NOT EXISTS crowd_campaigns (
  id               UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  tenant_id        TEXT NOT NULL,
  name             TEXT NOT NULL,
  slug             TEXT,
  description      TEXT,
  hero_image_url   TEXT,
  target_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  raised_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  fulfillment_type TEXT NOT NULL DEFAULT 'keep_it_all'
                     CHECK (fulfillment_type IN ('keep_it_all','all_or_nothing')),
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','pending_review','approved','rejected','preview',
                                       'active','closed_pending_settlement','funded',
                                       'refunding','refunded','fulfilling','completed')),
  public_token     TEXT,
  deadline         TIMESTAMPTZ,
  created_by       UUID,
  started_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crowd_campaigns_tenant ON crowd_campaigns(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crowd_perks (
  id             UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  campaign_id    UUID NOT NULL REFERENCES crowd_campaigns(id) ON DELETE CASCADE,
  tenant_id      TEXT NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  unit_price     NUMERIC(15,2) NOT NULL DEFAULT 0,
  quantity_limit INT,
  quantity_sold  INT NOT NULL DEFAULT 0,
  stock_item_id  UUID,                 -- optional link to book_stock_items (COGS/fulfilment); no FK to stay self-contained
  delivery_date  DATE,
  image_url      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crowd_perks_campaign ON crowd_perks(campaign_id);

CREATE TABLE IF NOT EXISTS crowd_backers (
  id                 UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  campaign_id        UUID NOT NULL REFERENCES crowd_campaigns(id) ON DELETE CASCADE,
  perk_id            UUID REFERENCES crowd_perks(id),
  tenant_id          TEXT NOT NULL,
  backer_name        TEXT,
  backer_email       TEXT,
  backer_phone       TEXT,
  amount             NUMERIC(15,2) NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pledged'
                       CHECK (status IN ('pledged','paid','refunded','failed')),
  fulfillment_status TEXT NOT NULL DEFAULT 'pending'
                       CHECK (fulfillment_status IN ('pending','packed','shipped','delivered','failed')),
  payment_ref        TEXT,             -- razorpay payment/link id; idempotency anchor
  pay_url            TEXT,
  gl_voucher_id      UUID,             -- the RECEIPT voucher posted on payment (null if books not seeded)
  tracking           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crowd_backers_campaign ON crowd_backers(campaign_id, created_at DESC);
-- one paid row per gateway payment ref → webhook retries can't double-count raised_amount
CREATE UNIQUE INDEX IF NOT EXISTS uq_crowd_backers_payref ON crowd_backers(payment_ref) WHERE payment_ref IS NOT NULL;
`;

module.exports = { CROWDFUNDING_SCHEMA };
