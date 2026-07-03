"use strict";
// Shared payouts rail — data + lifecycle layer. requestPayout() is the single entry point the
// four callers use (lending disbursal, BNPL, EWA, treasury sweep). It creates a payout, tries
// the resolved provider (or leaves it 'pending' for manual confirmation), and is idempotent on
// the caller's business key. recordPayoutResult() advances the state machine and — only on a
// CONFIRMED settlement — posts the books entry (idempotent per payout). GL degrades gracefully
// when the chart isn't seeded (best-effort, mirrors lending). payout_requests/payout_events are
// FORCE-RLS (migration 0016) → all access via q(tenantId).
const { q } = require("../../lib/tenantDb");
const { postVoucher } = require("../books/posting-engine");
const { payoutProvider, createProviderPayout } = require("./providers");

class PayoutError extends Error {
  constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; }
}
const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const last4 = (s) => (s ? String(s).replace(/\s+/g, "").slice(-4) : null);
const VALID_KINDS = ["disbursal", "bnpl", "ewa", "treasury", "vendor", "refund", "other"];

async function logEvent(tenantId, payoutId, event, extra = {}) {
  try {
    await q(tenantId,
      `INSERT INTO payout_events(tenant_id, payout_id, event, provider, signature_valid, payload_hash, detail)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, payoutId, event, extra.provider || null, extra.signatureValid ?? null, extra.payloadHash || null, JSON.stringify(extra.detail || {})]);
  } catch (e) { console.warn("[payouts] event log skipped:", e.message); }
}

// Create + attempt a payout. Idempotent on idempotencyKey: a retry returns the existing payout
// (never double-sends). The full beneficiary account is used for the rail call but only the
// last4 is persisted. When no rail is configured the payout stays 'pending' (manual mode).
async function requestPayout(tenantId, {
  kind = "vendor", amount, beneficiary = {}, purpose, refType, refId,
  idempotencyKey, preferredProvider, actorId,
} = {}) {
  const amt = r2(amount);
  if (!VALID_KINDS.includes(kind)) throw new PayoutError("BAD_INPUT", `kind must be one of ${VALID_KINDS.join(", ")}`, 400);
  if (!(amt > 0)) throw new PayoutError("BAD_INPUT", "amount must be > 0", 400);

  // Idempotency: a completed request with this key already exists → return it.
  if (idempotencyKey) {
    const { rows: ex } = await q(tenantId, "SELECT * FROM payout_requests WHERE tenant_id=$1 AND idempotency_key=$2", [tenantId, idempotencyKey]);
    if (ex[0]) return { ...shape(ex[0]), replayed: true };
  }
  const provider = payoutProvider.resolve(preferredProvider);

  let row;
  try {
    ({ rows: [row] } = await q(tenantId,
      `INSERT INTO payout_requests
         (tenant_id, kind, beneficiary_name, beneficiary_upi, beneficiary_ifsc, beneficiary_account_last4,
          amount, purpose, ref_type, ref_id, provider, idempotency_key, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [tenantId, kind, beneficiary.name || null, beneficiary.upi || null, beneficiary.ifsc || null, last4(beneficiary.account),
       amt, purpose || null, refType || null, refId || null, provider, idempotencyKey || null, actorId || null]));
  } catch (e) {
    // uq_payout_requests_idem: a concurrent identical request won the race → return it.
    if (e.code === "23505" && idempotencyKey) {
      const { rows } = await q(tenantId, "SELECT * FROM payout_requests WHERE tenant_id=$1 AND idempotency_key=$2", [tenantId, idempotencyKey]);
      if (rows[0]) return { ...shape(rows[0]), replayed: true };
    }
    throw e;
  }
  await logEvent(tenantId, row.id, "created", { provider, detail: { kind, amount: amt } });

  // Attempt the real rail (if one is configured). On success: queued/processing (+ provider_ref).
  // On failure: leave 'pending' with a reason so retryPending can pick it up — never faked.
  if (provider !== "manual") {
    try {
      const res = await createProviderPayout(provider, {
        amountRupees: amt, account: beneficiary.account, ifsc: beneficiary.ifsc, upi: beneficiary.upi,
        name: beneficiary.name, referenceId: row.id, notes: { tenant_id: tenantId, payout_id: row.id },
      });
      await q(tenantId, "UPDATE payout_requests SET status=$2, provider_ref=$3, utr=COALESCE($4,utr), updated_at=now() WHERE tenant_id=$1 AND id=$5",
        [tenantId, res.status, res.providerRef, res.utr, row.id]);
      await logEvent(tenantId, row.id, "provider_queued", { provider, detail: { providerRef: res.providerRef, status: res.status } });
      // Some rails settle synchronously (IMPS same-second) — post GL immediately if so.
      if (res.status === "settled") await recordPayoutResult(tenantId, row.id, "settled", { utr: res.utr, actorId, via: "provider_sync" });
    } catch (e) {
      await q(tenantId, "UPDATE payout_requests SET failure_reason=$2, updated_at=now() WHERE tenant_id=$1 AND id=$3", [tenantId, e.message?.slice(0, 300) || "provider error", row.id]);
      await logEvent(tenantId, row.id, "failed", { provider, detail: { attempt: "create", error: e.message } });
    }
  }
  return shape((await q(tenantId, "SELECT * FROM payout_requests WHERE tenant_id=$1 AND id=$2", [tenantId, row.id])).rows[0]);
}

// Advance a payout to a terminal state. On 'settled' → post the books entry (idempotent per
// payout) and stamp UTR. Idempotent: re-settling an already-settled payout is a no-op.
async function recordPayoutResult(tenantId, payoutId, status, { utr, failureReason, actorId, via = "manual_settle" } = {}) {
  const VALID = ["processing", "settled", "failed", "reversed", "cancelled"];
  if (!VALID.includes(status)) throw new PayoutError("BAD_INPUT", `status must be one of ${VALID.join(", ")}`, 400);
  const { rows } = await q(tenantId, "SELECT * FROM payout_requests WHERE tenant_id=$1 AND id=$2", [tenantId, payoutId]);
  const p = rows[0];
  if (!p) throw new PayoutError("NOT_FOUND", "Payout not found", 404);
  if (["settled", "reversed", "cancelled"].includes(p.status)) {
    return { ...shape(p), replayed: true }; // already terminal → idempotent no-op
  }

  if (status === "settled") {
    const voucherId = await postSettlementGl(tenantId, actorId, p);
    await q(tenantId,
      "UPDATE payout_requests SET status='settled', settled_at=now(), utr=COALESCE($2,utr), gl_voucher_id=COALESCE($3,gl_voucher_id), updated_at=now() WHERE tenant_id=$1 AND id=$4",
      [tenantId, utr || null, voucherId, payoutId]);
    await logEvent(tenantId, payoutId, "settled", { provider: p.provider, detail: { via, utr: utr || null, glPosted: !!voucherId } });
  } else {
    await q(tenantId, "UPDATE payout_requests SET status=$2, failure_reason=COALESCE($3,failure_reason), updated_at=now() WHERE tenant_id=$1 AND id=$4",
      [tenantId, status, failureReason || null, payoutId]);
    await logEvent(tenantId, payoutId, status, { provider: p.provider, detail: { via, reason: failureReason || null } });
  }
  return shape((await q(tenantId, "SELECT * FROM payout_requests WHERE tenant_id=$1 AND id=$2", [tenantId, payoutId])).rows[0]);
}

// Webhook path: the provider only knows its own ref. Caller has already read tenant_id off the
// (signed) payload and verified the signature. Resolve the payout, then advance it idempotently.
async function recordByProviderRef(tenantId, provider, providerRef, status, meta = {}) {
  const { rows } = await q(tenantId, "SELECT * FROM payout_requests WHERE tenant_id=$1 AND provider=$2 AND provider_ref=$3", [tenantId, provider, providerRef]);
  const p = rows[0];
  if (!p) throw new PayoutError("NOT_FOUND", "Payout not found for provider ref", 404);
  await logEvent(tenantId, p.id, "webhook", { provider, signatureValid: meta.signatureValid, payloadHash: meta.payloadHash, detail: { status } });
  return recordPayoutResult(tenantId, p.id, status, { utr: meta.utr, failureReason: meta.failureReason, via: "webhook" });
}

// Re-attempt payouts that are still 'pending' on a configured rail (a lost/failed create call).
// Uses the payout id as the provider reference so the rail dedupes if the first call did land.
async function retryPending(tenantId) {
  const { rows } = await q(tenantId,
    "SELECT * FROM payout_requests WHERE tenant_id=$1 AND status='pending' AND provider<>'manual' ORDER BY created_at LIMIT 50", [tenantId]);
  let retried = 0;
  for (const p of rows) {
    try {
      const res = await createProviderPayout(p.provider, { amountRupees: n(p.amount), referenceId: p.id, notes: { tenant_id: tenantId, payout_id: p.id } });
      await q(tenantId, "UPDATE payout_requests SET status=$2, provider_ref=$3, updated_at=now() WHERE tenant_id=$1 AND id=$4", [tenantId, res.status, res.providerRef, p.id]);
      await logEvent(tenantId, p.id, "retry", { provider: p.provider, detail: { status: res.status } });
      retried++;
    } catch (e) { await logEvent(tenantId, p.id, "retry", { provider: p.provider, detail: { error: e.message } }); }
  }
  return { candidates: rows.length, retried };
}

async function getPayout(tenantId, id) {
  const { rows } = await q(tenantId, "SELECT * FROM payout_requests WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rows[0]) throw new PayoutError("NOT_FOUND", "Payout not found", 404);
  const { rows: ev } = await q(tenantId, "SELECT event, provider, signature_valid, detail, created_at FROM payout_events WHERE payout_id=$1 ORDER BY created_at", [id]);
  return { ...shape(rows[0]), events: ev };
}
async function listPayouts(tenantId, { kind, status } = {}) {
  const params = [tenantId]; let where = "tenant_id=$1";
  if (kind) { params.push(kind); where += ` AND kind=$${params.length}`; }
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  const { rows } = await q(tenantId, `SELECT * FROM payout_requests WHERE ${where} ORDER BY created_at DESC LIMIT 200`, params);
  return rows.map(shape);
}

const shape = (p) => ({ ...p, amount: n(p.amount), provider_configured: payoutProvider.isConfigured(p.provider) });

// ── Settlement GL (SMB books; best-effort; null when the chart isn't seeded) ──────
// Reuses lending's ledger helpers (lazy require — avoids a load-time cycle since lending also
// calls payouts). Per kind: money genuinely leaving the bank posts a PAYMENT; a BNPL drawdown
// clears the supplier payable against a new borrowing (no bank leg — the lender fronts it); a
// lending disbursal is NOT posted here (the lending module already books cash-in/Borrowings).
async function postSettlementGl(tenantId, actorId, payout) {
  if (payout.kind === "disbursal") return null; // lending owns its disbursal voucher
  try {
    const { firstBankLedger, ledgerByName, ensureByNature } = require("../lending/index");
    const amt = n(payout.amount);
    if (!(amt > 0)) return null;
    let entries, voucherType = "PAYMENT";
    if (payout.kind === "ewa") {
      const adv = await ensureByNature(tenantId, "Employee Advances", "ASSET");
      const bank = await firstBankLedger(tenantId);
      if (!adv || !bank) return null;
      entries = [{ ledgerId: adv, debit: amt, credit: 0 }, { ledgerId: bank, debit: 0, credit: amt }];
    } else if (payout.kind === "treasury") {
      const inv = await ensureByNature(tenantId, payout.purpose || "Investments", "ASSET");
      const bank = await firstBankLedger(tenantId);
      if (!inv || !bank) return null;
      entries = [{ ledgerId: inv, debit: amt, credit: 0 }, { ledgerId: bank, debit: 0, credit: amt }];
    } else if (payout.kind === "bnpl") {
      const creditors = await ledgerByName(tenantId, "Sundry Creditors");
      const borrow = await ensureByNature(tenantId, "Borrowings", "LIABILITY");
      if (!creditors || !borrow) return null;
      voucherType = "JOURNAL";
      entries = [{ ledgerId: creditors, debit: amt, credit: 0 }, { ledgerId: borrow, debit: 0, credit: amt }];
    } else { // vendor | refund | other → pay a creditor / customer out of the bank
      const creditors = await ensureByNature(tenantId, "Sundry Creditors", "LIABILITY");
      const bank = await firstBankLedger(tenantId);
      if (!creditors || !bank) return null;
      entries = [{ ledgerId: creditors, debit: amt, credit: 0 }, { ledgerId: bank, debit: 0, credit: amt }];
    }
    const res = await postVoucher(tenantId, actorId || null,
      { voucherType, voucherDate: new Date().toISOString().slice(0, 10), narration: `Payout ${payout.kind} ${payout.id}`, reference: payout.ref_id || null, source: "payouts" },
      entries, { idempotencyKey: `payout:${payout.id}` });
    return res.voucherId || null;
  } catch (e) { console.warn("[payouts] settlement GL skipped:", e.message); return null; }
}

module.exports = {
  PayoutError, payoutProvider,
  requestPayout, recordPayoutResult, recordByProviderRef, retryPending,
  getPayout, listPayouts,
};
