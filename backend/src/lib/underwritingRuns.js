"use strict";
// Underwriting run persistence + outcome labelling (KreditBee-grade plan #2).
// recordRun is called from INSIDE the scorecard on every compute — best-effort, never
// blocks or fails a scoring call. labelOutcomes runs nightly: it attributes loans
// originated shortly after a run to that run and labels the run good/bad from the loan's
// observed conduct — the loop that turns every repayment into a training label.
const { pool } = require("../db");
const { q } = require("./tenantDb"); // loans/loan_servicing_events are FORCE-RLS → per-tenant reads

// Attribution window: a loan disbursed within this many days after a run is treated as
// the loan that run underwrote.
const ATTRIBUTION_DAYS = 45;
// Bad thresholds by product kind (invoice finance tenors are 30-90d, so 30+ DPD is bad).
const badThresholdFor = (kind) => (/invoice/i.test(String(kind || "")) ? 30 : 60);

// Persist one scoring run. Never throws (a scoring READ must not fail because analytics
// insert failed); returns the run id or null.
async function recordRun(tenantId, result, { trigger = "unspecified", actorId = null } = {}) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO underwriting_runs(tenant_id, trigger, actor_id, scorecard_version, score, grade, decision, eligible_amount, product, factors, breakdown)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [tenantId, trigger, actorId, result.breakdown?.scorecard_version || "unknown",
       result.score, result.grade, result.decision?.outcome || "unknown",
       Number(result.approved_amount) || 0, result.recommended_product || null,
       JSON.stringify(result.factors || []), JSON.stringify(result.breakdown || {})]);
    return rows[0]?.id || null;
  } catch (e) {
    // Table may predate the migration on a not-yet-migrated DB; anything else logs once.
    if (!/underwriting_runs.*does not exist/i.test(e.message)) console.warn("[underwriting-runs] record failed:", e.message);
    return null;
  }
}

// Nightly: label unlabeled runs from loan conduct. For each tenant with unlabeled runs,
// pull its loans + historical max DPD (loan_servicing_events, RLS'd → q()) once, then
// attribute: the FIRST loan disbursed within ATTRIBUTION_DAYS after the run.
//   bad  = written_off, or historical max DPD ≥ threshold for the product kind
//   good = closed AND never crossed the threshold
//   else = leave NULL (still maturing) — never guess.
async function labelOutcomes() {
  const { rows: tenants } = await pool.query(
    "SELECT DISTINCT tenant_id FROM underwriting_runs WHERE outcome_label IS NULL"
  ).catch(() => ({ rows: [] }));
  let labeled = 0;
  for (const { tenant_id: tenantId } of tenants) {
    try {
      const { rows: loans } = await q(tenantId,
        `SELECT l.id, l.kind, l.status, l.dpd, l.disbursed_at, l.created_at,
                COALESCE((SELECT MAX(e.dpd) FROM loan_servicing_events e WHERE e.loan_id=l.id AND e.tenant_id=l.tenant_id), l.dpd) AS max_dpd,
                COALESCE((SELECT SUM(s.waiver_amount) FROM loan_settlements s WHERE s.loan_id=l.id AND s.tenant_id=l.tenant_id),0) AS waived
           FROM loans l WHERE l.tenant_id=$1`, [tenantId]);
      if (!loans.length) continue;
      const { rows: runs } = await pool.query(
        "SELECT id, created_at FROM underwriting_runs WHERE tenant_id=$1 AND outcome_label IS NULL ORDER BY created_at",
        [tenantId]);
      for (const run of runs) {
        const runAt = new Date(run.created_at).getTime();
        const candidates = loans
          .filter((l) => {
            const t = new Date(l.disbursed_at || l.created_at).getTime();
            return t >= runAt && t - runAt <= ATTRIBUTION_DAYS * 86400000;
          })
          .sort((a, b) => new Date(a.disbursed_at || a.created_at) - new Date(b.disbursed_at || b.created_at));
        const loan = candidates[0];
        if (!loan) continue;
        const threshold = badThresholdFor(loan.kind);
        const maxDpd = Number(loan.max_dpd) || 0;
        let label = null;
        // A waiver settlement is a realized CREDIT LOSS — it must label bad even though the
        // loan reads "closed" (the old settlement flow made it look like a clean payer).
        if (loan.status === "written_off" || maxDpd >= threshold || Number(loan.waived) > 0) label = "bad";
        else if (loan.status === "closed") label = "good";
        if (!label) continue; // still maturing
        await pool.query(
          "UPDATE underwriting_runs SET outcome_label=$1, outcome_at=now(), outcome_loan_id=$2, observed_max_dpd=$3 WHERE id=$4 AND tenant_id=$5 AND outcome_label IS NULL",
          [label, loan.id, maxDpd, run.id, tenantId]);
        labeled++;
      }
    } catch (e) { console.error("[underwriting-runs] labelling failed for", tenantId, e.message); }
  }
  return labeled;
}

module.exports = { recordRun, labelOutcomes, ATTRIBUTION_DAYS, badThresholdFor };
