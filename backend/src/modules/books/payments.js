// §9.3-adjacent — online collection links. Gateway-agnostic record; a live
// provider (Razorpay/Cashfree) would mint a hosted link when keys are present.
// markPaid posts a RECEIPT and allocates it against the invoice.
const crypto = require("crypto");
const { pool } = require("../../db");
const { money, toDb } = require("./money");
const { postVoucher, PostError } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");
const razorpay = require("../../lib/razorpay");
const retry = require("./paymentretry");

// ── Provider-abstraction seam ────────────────────────────────────────────────
// One thin interface every gateway implements; the rest of this module talks to a
// provider only through {key, isConfigured, webhookSecret, verifyWebhook}. Razorpay is
// the live path (HMAC-SHA256 today, but we verify with the configured algo below);
// Cashfree is a STUB gated on its own keys so it stays inert until those exist — no
// silent half-wired second gateway.
const PROVIDERS = {
  razorpay: {
    key: "razorpay",
    isConfigured: () => razorpay.isConfigured(),
    webhookSecret: () => (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim() || null,
    // Razorpay signs the raw body; some accounts are provisioned for SHA512. We accept
    // either by trying SHA512 first (the prompt's hardening target) then SHA256.
    sigHeader: "x-razorpay-signature",
    algos: ["sha512", "sha256"],
  },
  cashfree: {
    key: "cashfree",
    // STUB: only "configured" when its own keys are present, so this never activates by
    // accident. Wiring the live API (orders, payouts) is intentionally not done here.
    isConfigured: () => !!((process.env.CASHFREE_APP_ID || "").trim() && (process.env.CASHFREE_SECRET_KEY || "").trim()),
    webhookSecret: () => (process.env.CASHFREE_WEBHOOK_SECRET || "").trim() || null,
    sigHeader: "x-webhook-signature",
    algos: ["sha256"],
  },
};

function providerFor(name) {
  const p = PROVIDERS[String(name || "razorpay").toLowerCase()];
  if (!p) throw new PostError("BAD_INPUT", `Unknown payment provider '${name}'`, 400);
  return p;
}

async function createLink(tenantId, { invoiceVoucherId, partyLedgerId, amount, provider }) {
  if (amount == null) throw new PostError("BAD_INPUT", "amount required", 400);
  const { rows } = await pool.query(
    "INSERT INTO book_payment_links(tenant_id,invoice_voucher_id,party_ledger_id,provider,amount,status) VALUES($1,$2,$3,$4,$5,'CREATED') RETURNING *",
    [tenantId, invoiceVoucherId || null, partyLedgerId || null, provider || "manual", toDb(amount)]
  );
  const link = rows[0];
  // Live: mint a real Razorpay hosted link (test or live keys). Fall back cleanly.
  if (razorpay.isConfigured()) {
    try {
      const rl = await razorpay.createPaymentLink({
        amount: Math.round(Number(amount) * 100), description: `Payment for ${invoiceVoucherId ? "invoice" : "account"}`,
        referenceId: link.id, notes: { tenant: tenantId, link_id: link.id },
      });
      await pool.query("UPDATE book_payment_links SET provider='razorpay', provider_ref=$2, link_url=$3 WHERE id=$1", [link.id, rl.id, rl.short_url || null]);
      return { ...link, provider: "razorpay", provider_ref: rl.id, link_url: rl.short_url };
    } catch (e) {
      await pool.query("UPDATE book_payment_links SET link_url=$2 WHERE id=$1", [link.id, null]);
      return { ...link, link_url: null, note: `Razorpay link couldn't be created (${e.message}) — mark paid manually.` };
    }
  }
  const url = `pending-gateway://link/${link.id}`;
  await pool.query("UPDATE book_payment_links SET link_url=$2 WHERE id=$1", [link.id, url]);
  return { ...link, link_url: url, note: "No live payment gateway configured — mark paid manually, or set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to mint a hosted link." };
}

// Webhook settlement: find the link by gateway ref and post the receipt into
// Undeposited Funds (online collections sit there until batch-deposited to bank).
async function markPaidByProviderRef(providerRef) {
  // Read the link first (only to learn ledger/amount); the actual settlement is
  // gated below by a conditional UPDATE so exactly one caller can post.
  const { rows } = await pool.query("SELECT * FROM book_payment_links WHERE provider_ref=$1 AND status<>'PAID'", [providerRef]);
  const link = rows[0];
  if (!link || !link.party_ledger_id) return null;
  const undep = await ledgerIdByName(link.tenant_id, "Undeposited Funds");
  if (!undep) return null;
  // Claim the row: only the caller whose UPDATE flips status<>'PAID'→'PAID' wins.
  // A concurrent double-click / duplicate webhook gets rowCount 0 and bails.
  const claim = await pool.query("UPDATE book_payment_links SET status='PAID' WHERE id=$1 AND status<>'PAID'", [link.id]);
  if (claim.rowCount !== 1) return null;
  // postVoucher dedupes on idempotencyKey, so even an in-flight retry posts once.
  const r = await postVoucher(link.tenant_id, null,
    { voucherType: "RECEIPT", voucherDate: new Date().toISOString().slice(0, 10), narration: "Online payment (gateway)", source: "api", partyLedgerId: link.party_ledger_id },
    [{ ledgerId: undep, debit: toDb(link.amount), credit: "0" }, { ledgerId: link.party_ledger_id, debit: "0", credit: toDb(link.amount) }],
    { idempotencyKey: `recv:${link.id}` });
  await pool.query("UPDATE book_payment_links SET receipt_voucher_id=$2 WHERE id=$1", [link.id, r.voucherId]);
  if (link.invoice_voucher_id) await pool.query("INSERT INTO book_allocations(tenant_id,source_voucher_id,target_voucher_id,amount) VALUES($1,$2,$3,$4)", [link.tenant_id, r.voucherId, link.invoice_voucher_id, toDb(link.amount)]);
  return { ok: true, voucherId: r.voucherId };
}

async function markPaid(tenantId, actorId, linkId, bankLedgerId) {
  const { rows: lr } = await pool.query("SELECT * FROM book_payment_links WHERE tenant_id=$1 AND id=$2", [tenantId, linkId]);
  const link = lr[0];
  if (!link) throw new PostError("NOT_FOUND", "Link not found", 404);
  if (link.status === "PAID") throw new PostError("BAD_STATE", "Already paid", 409);
  if (!bankLedgerId || !link.party_ledger_id) throw new PostError("BAD_INPUT", "bankLedgerId and a party on the link are required", 400);
  // Claim the row before posting: the conditional UPDATE is the real gate, so a
  // TOCTOU race / double-click lets exactly one caller through (rowCount 1).
  // The loser sees rowCount 0 and gets the same 409 as an already-paid link.
  const claim = await pool.query("UPDATE book_payment_links SET status='PAID' WHERE tenant_id=$1 AND id=$2 AND status<>'PAID'", [tenantId, linkId]);
  if (claim.rowCount !== 1) throw new PostError("BAD_STATE", "Already paid", 409);
  // Deterministic key so an in-flight posting retry still posts the receipt once.
  const r = await postVoucher(tenantId, actorId,
    { voucherType: "RECEIPT", voucherDate: new Date().toISOString().slice(0, 10), narration: "Online payment received", source: "api", partyLedgerId: link.party_ledger_id },
    [{ ledgerId: bankLedgerId, debit: toDb(link.amount), credit: "0" }, { ledgerId: link.party_ledger_id, debit: "0", credit: toDb(link.amount) }],
    { idempotencyKey: `recv:${link.id}` });
  await pool.query("UPDATE book_payment_links SET receipt_voucher_id=$2 WHERE id=$1", [linkId, r.voucherId]);
  if (link.invoice_voucher_id) {
    await pool.query("INSERT INTO book_allocations(tenant_id,source_voucher_id,target_voucher_id,amount) VALUES($1,$2,$3,$4)", [tenantId, r.voucherId, link.invoice_voucher_id, toDb(link.amount)]);
  }
  return { id: link.id, status: "PAID", receipt: r };
}

// ── Hardened webhook handling ────────────────────────────────────────────────
// FAIL CLOSED at every gate: no secret → reject; bad signature → reject; replayed
// event_id → ack-but-skip; stale (out-of-order) update → ack-but-skip.

// HMAC verify over the EXACT raw bytes the gateway signed (server.js captures
// req.rawBody). Tries each algo the provider may use (SHA512 then SHA256) with a
// constant-time compare so a length/timing oracle can't leak the secret.
function verifySignature(provider, rawBody, signature) {
  const secret = provider.webhookSecret();
  if (!secret) return { ok: false, reason: "webhook_not_configured" };
  if (!signature) return { ok: false, reason: "missing_signature" };
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody == null ? "" : rawBody));
  const got = Buffer.from(String(signature));
  for (const algo of provider.algos) {
    const expected = Buffer.from(crypto.createHmac(algo, secret).update(payload).digest("hex"));
    if (expected.length === got.length && crypto.timingSafeEqual(expected, got)) return { ok: true, algo };
  }
  return { ok: false, reason: "invalid_signature" };
}

// Idempotency + ordering store. Returns a verdict the caller acts on:
//   {accept:true}                       → first time we've seen this event_id; process it.
//   {accept:false, reason:'duplicate'}  → already processed (≥24h retention) — ack, skip.
//   {accept:false, reason:'stale'}      → an OLDER update than one we've already applied
//                                          for this resource — ack, skip (ordering guard).
// `updatedAt` is the gateway's own event/resource timestamp (epoch seconds, ms, or ISO).
async function recordWebhookEvent(provider, eventId, resourceKey, updatedAt, eventType) {
  if (!eventId) return { accept: false, reason: "missing_event_id" };
  const updTs = toEpochMs(updatedAt);
  const upd = updTs == null ? null : new Date(updTs).toISOString();
  // INSERT … ON CONFLICT DO NOTHING is the idempotency claim: exactly one inserter wins.
  const ins = await pool.query(
    `INSERT INTO book_payment_webhook_events(provider, event_id, event_type, resource_key, updated_at)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`,
    [provider.key, String(eventId), eventType || null, resourceKey || null, upd]
  );
  if (ins.rowCount === 0) return { accept: false, reason: "duplicate" };
  // Ordering guard: if we've already applied a NEWER update for this resource, this
  // event is stale even though its event_id is new (gateways can deliver out of order).
  if (resourceKey && updTs != null) {
    const { rows } = await pool.query(
      `SELECT max(updated_at) AS latest FROM book_payment_webhook_events
       WHERE provider=$1 AND resource_key=$2 AND id<>$3 AND updated_at IS NOT NULL`,
      [provider.key, resourceKey, ins.rows[0].id]
    );
    const latest = rows[0] && rows[0].latest ? new Date(rows[0].latest).getTime() : null;
    if (latest != null && latest > updTs) return { accept: false, reason: "stale", latest: new Date(latest).toISOString() };
  }
  return { accept: true, id: ins.rows[0].id };
}

function toEpochMs(t) {
  if (t == null || t === "") return null;
  if (typeof t === "number" || /^\d+$/.test(String(t))) {
    const n = Number(t);
    return n < 1e12 ? n * 1000 : n; // seconds → ms heuristic
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

// Internal webhook entry point (POST /payments/webhook/verify). Verifies the signature,
// dedupes/orders via the event store, and — on a settlement event — posts the receipt
// through the existing idempotent markPaidByProviderRef. Never throws to the caller for
// a replay/stale event: those are acknowledged (200) so the gateway stops retrying.
async function handleWebhook({ providerName, headers, rawBody, body }) {
  const provider = providerFor(providerName);
  const sig = verifySignature(provider, rawBody, headers && (headers[provider.sigHeader] || headers[provider.sigHeader.toLowerCase()]));
  if (!sig.ok) {
    const http = sig.reason === "webhook_not_configured" ? 503 : 403;
    throw new PostError(sig.reason.toUpperCase(), sig.reason, http);
  }
  const evt = body || {};
  // Extract a provider-agnostic event id + the settled resource ref + update timestamp.
  const eventId = evt.id || evt.event_id || (headers && (headers["x-razorpay-event-id"] || headers["x-webhook-id"])) || null;
  const eventType = evt.event || evt.type || null;
  const payment = evt.payload && (evt.payload.payment_link || evt.payload.payment) && (evt.payload.payment_link?.entity || evt.payload.payment?.entity);
  const resourceRef = (payment && (payment.id || payment.reference_id)) || evt.reference_id || evt.order_id || null;
  const updatedAt = (payment && (payment.updated_at || payment.created_at)) || evt.created_at || evt.created || null;

  const verdict = await recordWebhookEvent(provider, eventId, resourceRef, updatedAt, eventType);
  if (!verdict.accept) return { ok: true, skipped: verdict.reason };

  // Settlement events post a receipt; everything else is acknowledged + recorded only.
  const isPaid = /paid|captured|success/i.test(String(eventType || "")) || (payment && /paid|captured/i.test(String(payment.status || "")));
  if (isPaid && resourceRef) {
    const settled = await markPaidByProviderRef(resourceRef);
    return { ok: true, event_id: eventId, settled: !!settled, voucherId: settled && settled.voucherId };
  }
  return { ok: true, event_id: eventId, settled: false };
}

// Thin pass-throughs so HTTP routes don't import paymentretry directly.
const classifyDecline = (provider, code) => retry.classifyDecline(provider, code);
const retryPolicy = () => retry.retryPolicy();

module.exports = {
  createLink, markPaid, markPaidByProviderRef,
  PROVIDERS, providerFor, verifySignature, recordWebhookEvent, handleWebhook,
  classifyDecline, retryPolicy,
};
