// §9.3-adjacent — online collection links. Gateway-agnostic record; a live
// provider (Razorpay/Cashfree) would mint a hosted link when keys are present.
// markPaid posts a RECEIPT and allocates it against the invoice.
const { pool } = require("../../db");
const { money, toDb } = require("./money");
const { postVoucher, PostError } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");
const razorpay = require("../../lib/razorpay");

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
  const { rows } = await pool.query("SELECT * FROM book_payment_links WHERE provider_ref=$1 AND status<>'PAID'", [providerRef]);
  const link = rows[0];
  if (!link || !link.party_ledger_id) return null;
  const undep = await ledgerIdByName(link.tenant_id, "Undeposited Funds");
  if (!undep) return null;
  const r = await postVoucher(link.tenant_id, null,
    { voucherType: "RECEIPT", voucherDate: new Date().toISOString().slice(0, 10), narration: "Online payment (gateway)", source: "api", partyLedgerId: link.party_ledger_id },
    [{ ledgerId: undep, debit: toDb(link.amount), credit: "0" }, { ledgerId: link.party_ledger_id, debit: "0", credit: toDb(link.amount) }]);
  await pool.query("UPDATE book_payment_links SET status='PAID', receipt_voucher_id=$2 WHERE id=$1", [link.id, r.voucherId]);
  if (link.invoice_voucher_id) await pool.query("INSERT INTO book_allocations(tenant_id,source_voucher_id,target_voucher_id,amount) VALUES($1,$2,$3,$4)", [link.tenant_id, r.voucherId, link.invoice_voucher_id, toDb(link.amount)]);
  return { ok: true, voucherId: r.voucherId };
}

async function markPaid(tenantId, actorId, linkId, bankLedgerId) {
  const { rows: lr } = await pool.query("SELECT * FROM book_payment_links WHERE tenant_id=$1 AND id=$2", [tenantId, linkId]);
  const link = lr[0];
  if (!link) throw new PostError("NOT_FOUND", "Link not found", 404);
  if (link.status === "PAID") throw new PostError("BAD_STATE", "Already paid", 409);
  if (!bankLedgerId || !link.party_ledger_id) throw new PostError("BAD_INPUT", "bankLedgerId and a party on the link are required", 400);
  const r = await postVoucher(tenantId, actorId,
    { voucherType: "RECEIPT", voucherDate: new Date().toISOString().slice(0, 10), narration: "Online payment received", source: "api", partyLedgerId: link.party_ledger_id },
    [{ ledgerId: bankLedgerId, debit: toDb(link.amount), credit: "0" }, { ledgerId: link.party_ledger_id, debit: "0", credit: toDb(link.amount) }]);
  await pool.query("UPDATE book_payment_links SET status='PAID', receipt_voucher_id=$2 WHERE id=$1", [linkId, r.voucherId]);
  if (link.invoice_voucher_id) {
    await pool.query("INSERT INTO book_allocations(tenant_id,source_voucher_id,target_voucher_id,amount) VALUES($1,$2,$3,$4)", [tenantId, r.voucherId, link.invoice_voucher_id, toDb(link.amount)]);
  }
  return { id: link.id, status: "PAID", receipt: r };
}

module.exports = { createLink, markPaid, markPaidByProviderRef };
