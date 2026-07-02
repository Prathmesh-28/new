"use strict";
// e-NACH / UPI-Autopay auto-collection mandates for loans. This is the buildable, in-house
// core — the mandate STATE MACHINE (initiated → active → paused/revoked/failed) and the
// PRESENTATION scheduling against the repayment schedule, with the repayment linkage:
//   • a SUCCESSFUL presentation records a repayment (via lending.recordRepayment)
//   • a BOUNCED presentation leaves the installment unpaid, so the daily servicing DPD run
//     escalates it (overdue → NPA) and penal interest accrues.
// The provider's actual debit API (Razorpay/Digio) is a GATED SEAM: without creds a mandate is
// still usable in MANUAL mode (an offline NACH mandate; results recorded by an operator or a
// future webhook). We never fabricate a debit.
const { q } = require("../../lib/tenantDb");
const lending = require("./index");

class MandateError extends Error { constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; } }
const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
const n = (v) => (v == null ? 0 : Number(v));

const mandateProvider = {
  // Which auto-debit providers are configured (creds present). 'manual' is always available
  // (operator records NACH results by hand); 'razorpay'/'digio' automate register + debit.
  isConfigured(provider) {
    if (provider === "razorpay") return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    if (provider === "digio") return !!(process.env.DIGIO_CLIENT_ID && process.env.DIGIO_CLIENT_SECRET);
    return provider === "manual"; // manual is always usable
  },
};

const VALID_PROVIDERS = ["manual", "razorpay", "digio"];

async function createMandate(tenantId, loanId, { provider = "manual", maxAmount, frequency = "as_presented", debitAccount, actorId } = {}) {
  if (!VALID_PROVIDERS.includes(provider)) throw new MandateError("BAD_INPUT", `provider must be one of ${VALID_PROVIDERS.join(", ")}`, 400);
  const { rows: lr } = await q(tenantId, "SELECT * FROM loans WHERE tenant_id=$1 AND id=$2", [tenantId, loanId]);
  const loan = lr[0];
  if (!loan) throw new MandateError("NOT_FOUND", "Loan not found", 404);
  // One live mandate per loan.
  const { rows: ex } = await q(tenantId, "SELECT id FROM loan_mandates WHERE tenant_id=$1 AND loan_id=$2 AND status IN ('initiated','active','paused')", [tenantId, loanId]);
  if (ex[0]) throw new MandateError("EXISTS", "This loan already has a live mandate", 409);
  const cap = maxAmount != null ? n(maxAmount) : n(loan.principal);
  const { rows } = await q(tenantId,
    `INSERT INTO loan_mandates(loan_id,tenant_id,provider,max_amount,frequency,debit_account,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [loanId, tenantId, provider, cap, frequency, debitAccount || null, actorId || null]);
  return { ...rows[0], provider_configured: mandateProvider.isConfigured(provider) };
}

// Move a mandate to 'active'. With a real provider this is the register/authorise webhook;
// in manual mode it's the operator confirming an offline NACH mandate is in place.
async function activateMandate(tenantId, mandateId, { providerRef } = {}) {
  const m = await _get(tenantId, mandateId);
  if (m.status !== "initiated" && m.status !== "paused") throw new MandateError("BAD_STATE", `Cannot activate a ${m.status} mandate`, 409);
  const { rows } = await q(tenantId,
    "UPDATE loan_mandates SET status='active', activated_at=COALESCE(activated_at, now()), provider_ref=COALESCE($3, provider_ref) WHERE tenant_id=$1 AND id=$2 RETURNING *",
    [tenantId, mandateId, providerRef || null]);
  return rows[0];
}
async function pauseMandate(tenantId, mandateId) {
  const m = await _get(tenantId, mandateId);
  if (m.status !== "active") throw new MandateError("BAD_STATE", `Only an active mandate can be paused (is ${m.status})`, 409);
  const { rows } = await q(tenantId, "UPDATE loan_mandates SET status='paused' WHERE tenant_id=$1 AND id=$2 RETURNING *", [tenantId, mandateId]);
  return rows[0];
}
async function revokeMandate(tenantId, mandateId) {
  const m = await _get(tenantId, mandateId);
  if (m.status === "revoked") return m;
  const { rows } = await q(tenantId, "UPDATE loan_mandates SET status='revoked', revoked_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *", [tenantId, mandateId]);
  return rows[0];
}

async function _get(tenantId, mandateId) {
  const { rows } = await q(tenantId, "SELECT * FROM loan_mandates WHERE tenant_id=$1 AND id=$2", [tenantId, mandateId]);
  if (!rows[0]) throw new MandateError("NOT_FOUND", "Mandate not found", 404);
  return rows[0];
}

// Schedule presentations for every active mandate's earliest unpaid due installment (that
// doesn't already have one). The actual debit is provider-gated; the presentation is created as
// 'scheduled' and resolved later by recordPresentationResult (a webhook, or an operator).
async function presentDue(tenantId, asOf = iso(new Date())) {
  const { rows: mandates } = await q(tenantId, "SELECT * FROM loan_mandates WHERE tenant_id=$1 AND status='active'", [tenantId]);
  let scheduled = 0, pendingProvider = 0;
  for (const m of mandates) {
    const { rows: inst } = await q(tenantId,
      `SELECT s.* FROM loan_schedule s
        WHERE s.loan_id=$1 AND s.status IN ('due','overdue','partial') AND s.due_date <= $2::date
          AND NOT EXISTS (SELECT 1 FROM loan_mandate_presentations p WHERE p.mandate_id=$3 AND p.installment_no=s.installment_no)
        ORDER BY s.installment_no LIMIT 1`, [m.loan_id, asOf, m.id]);
    if (!inst[0]) continue;
    const s = inst[0];
    const amount = Math.min(n(s.total_due), n(m.max_amount) || n(s.total_due));
    await q(tenantId,
      `INSERT INTO loan_mandate_presentations(mandate_id,loan_id,tenant_id,installment_no,amount,due_date,status)
       VALUES($1,$2,$3,$4,$5,$6,'scheduled') ON CONFLICT(mandate_id,installment_no) DO NOTHING`,
      [m.id, m.loan_id, tenantId, s.installment_no, amount, iso(s.due_date)]);
    scheduled++;
    if (!mandateProvider.isConfigured(m.provider) || m.provider === "manual") pendingProvider++;
  }
  return { scheduled, pendingProvider };
}

// Resolve a scheduled presentation. success → record the repayment (auto-collect fired);
// bounced → leave the installment unpaid (servicing DPD escalates it). Idempotent: only a
// 'scheduled' presentation can be resolved.
async function recordPresentationResult(tenantId, presentationId, result, { ref, actorId } = {}) {
  if (!["success", "bounced"].includes(result)) throw new MandateError("BAD_INPUT", "result must be 'success' or 'bounced'", 400);
  const { rows } = await q(tenantId, "SELECT * FROM loan_mandate_presentations WHERE tenant_id=$1 AND id=$2", [tenantId, presentationId]);
  const p = rows[0];
  if (!p) throw new MandateError("NOT_FOUND", "Presentation not found", 404);
  if (p.status !== "scheduled") throw new MandateError("BAD_STATE", `Presentation already ${p.status}`, 409);

  if (result === "success") {
    const rep = await lending.recordRepayment(tenantId, p.loan_id, { amount: n(p.amount), method: "nach", ref: ref || `nach:${presentationId}`, actorId });
    await q(tenantId, "UPDATE loan_mandate_presentations SET status='success', result_at=now(), provider_ref=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, presentationId, ref || null]);
    return { result: "success", repayment: rep };
  }
  await q(tenantId, "UPDATE loan_mandate_presentations SET status='bounced', result_at=now(), provider_ref=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, presentationId, ref || null]);
  // Escalate the mandate to 'failed' after 3 bounces so we stop presenting a dead mandate.
  const { rows: bc } = await q(tenantId, "SELECT COUNT(*)::int AS n FROM loan_mandate_presentations WHERE tenant_id=$1 AND mandate_id=$2 AND status='bounced'", [tenantId, p.mandate_id]);
  if (n(bc[0].n) >= 3) await q(tenantId, "UPDATE loan_mandates SET status='failed' WHERE tenant_id=$1 AND id=$2 AND status='active'", [tenantId, p.mandate_id]);
  return { result: "bounced", bounces: n(bc[0].n) };
}

async function listMandates(tenantId, loanId) {
  const params = [tenantId];
  let where = "m.tenant_id=$1";
  if (loanId) { params.push(loanId); where += ` AND m.loan_id=$${params.length}`; }
  const { rows } = await q(tenantId,
    `SELECT m.*, (SELECT count(*) FROM loan_mandate_presentations p WHERE p.mandate_id=m.id) AS presentations,
            (SELECT count(*) FROM loan_mandate_presentations p WHERE p.mandate_id=m.id AND p.status='success') AS collected,
            (SELECT count(*) FROM loan_mandate_presentations p WHERE p.mandate_id=m.id AND p.status='bounced') AS bounced
       FROM loan_mandates m WHERE ${where} ORDER BY m.created_at DESC`, params);
  return rows.map((m) => ({ ...m, max_amount: n(m.max_amount), provider_configured: mandateProvider.isConfigured(m.provider) }));
}
async function listPresentations(tenantId, mandateId) {
  const { rows } = await q(tenantId, "SELECT * FROM loan_mandate_presentations WHERE tenant_id=$1 AND mandate_id=$2 ORDER BY installment_no", [tenantId, mandateId]);
  return rows.map((p) => ({ ...p, amount: n(p.amount) }));
}

// Cron driver: schedule presentations for every tenant with active mandates (same enumeration
// approach as servicing — mandates are FORCE-RLS so we can't read them cross-tenant).
async function presentDueAll(asOf = iso(new Date())) {
  const { pool } = require("../../db");
  let tenants = [];
  try { tenants = (await pool.query("SELECT DISTINCT tenant_id FROM users WHERE tenant_id IS NOT NULL")).rows.map((r) => r.tenant_id); }
  catch (e) { console.warn("[lending] mandate tenant enumeration failed:", e.message); return { tenants: 0, scheduled: 0 }; }
  let scheduled = 0;
  for (const t of tenants) {
    try { const r = await presentDue(t, asOf); scheduled += r.scheduled; }
    catch (e) { console.error(`[lending] presentDue ${t} failed:`, e.message); }
  }
  return { tenants: tenants.length, scheduled };
}

module.exports = {
  MandateError, mandateProvider,
  createMandate, activateMandate, pauseMandate, revokeMandate,
  presentDue, recordPresentationResult, listMandates, listPresentations, presentDueAll,
};
