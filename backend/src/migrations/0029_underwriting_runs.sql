-- Underwriting run persistence (KreditBee-grade plan #2). Until now every score was
-- recomputed stateless and thrown away — no backtesting was ever possible, and a repeat
-- borrower scored identically to a stranger. One row per compute (INCLUDING declines):
-- the full inputs snapshot (factor vector + breakdown), the scorecard version that
-- produced it, and — filled in later by the nightly labeler — the observed outcome
-- (good/bad) once a loan originated near the run matures. Every month of scores not
-- captured is training data lost forever; capture starts now.
-- NOT RLS'd (matches gst_returns/transactions): explicit tenant_id on every query; the
-- nightly labeler and the future portfolio pack read cross-tenant by design.
CREATE TABLE IF NOT EXISTS underwriting_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger          TEXT NOT NULL DEFAULT 'unspecified',   -- score|report|apply|enrich|lender_api|lending_offer|flows|cron|unspecified
  actor_id         TEXT,
  scorecard_version TEXT NOT NULL,
  score            INT NOT NULL,
  grade            TEXT NOT NULL,
  decision         TEXT NOT NULL,                          -- pre_qualified | refer | declined
  eligible_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  product          TEXT,
  factors          JSONB NOT NULL,                         -- the full factor vector (key/score/weight/contribution)
  breakdown        JSONB NOT NULL,                         -- the inputs snapshot (revenue/dsr/runway/gst/…)
  -- Outcome labelling (nightly job): a loan originated within the attribution window
  -- after this run, and how it behaved. bad = crossed the DPD threshold (60; 30 for
  -- invoice finance) or written off; good = closed clean. NULL = no loan yet / immature.
  outcome_label    TEXT CHECK (outcome_label IN ('good','bad')),
  outcome_at       TIMESTAMPTZ,
  outcome_loan_id  UUID,
  observed_max_dpd INT
);
CREATE INDEX IF NOT EXISTS idx_underwriting_runs_tenant ON underwriting_runs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_underwriting_runs_unlabeled ON underwriting_runs(created_at) WHERE outcome_label IS NULL;
