// §13.3 (M10) — customer & vendor portals. PUBLIC (no login): access is via an
// HMAC-signed link token. Customers view/pay an invoice; vendors submit a bill.
// Also hosts the Razorpay webhook (confirms paid via the API, then posts a receipt).
const router = require("express").Router();
const crypto = require("crypto");
const { pool } = require("../../db");
const { money, toRupees } = require("./money");
const razorpay = require("../../lib/razorpay");
const payments = require("./payments");
const documents = require("./documents");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-in-prod";

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}
function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
}

async function invoiceOutstanding(tenantId, voucherId) {
  const { rows } = await pool.query(
    `SELECT v.voucher_number, v.voucher_date, v.reference, v.party_ledger_id,
            COALESCE((SELECT SUM(e.debit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS gross,
            COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.target_voucher_id=v.id),0) AS allocated
       FROM book_vouchers v WHERE v.tenant_id=$1 AND v.id=$2 AND v.is_cancelled=false`,
    [tenantId, voucherId]
  );
  if (!rows[0]) return null;
  const outstanding = money(rows[0].gross).minus(rows[0].allocated);
  return { number: rows[0].voucher_number, date: rows[0].voucher_date, reference: rows[0].reference, partyLedgerId: rows[0].party_ledger_id, outstanding };
}

// Customer: view an invoice + (optionally) get a hosted pay link.
router.get("/invoice/:token", async (req, res) => {
  const p = verifyToken(req.params.token);
  if (!p || p.kind !== "invoice") return res.status(401).json({ error: "Invalid or expired link" });
  const inv = await invoiceOutstanding(p.tenant, p.voucherId);
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  res.json({ number: inv.number, date: inv.date, reference: inv.reference, outstanding: toRupees(inv.outstanding), currency: "INR" });
});
router.post("/invoice/:token/pay", async (req, res) => {
  const p = verifyToken(req.params.token);
  if (!p || p.kind !== "invoice") return res.status(401).json({ error: "Invalid or expired link" });
  const inv = await invoiceOutstanding(p.tenant, p.voucherId);
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  try {
    const link = await payments.createLink(p.tenant, { invoiceVoucherId: p.voucherId, partyLedgerId: inv.partyLedgerId, amount: toRupees(inv.outstanding) });
    res.json({ payUrl: link.link_url, status: link.status, note: link.note });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Vendor: submit a bill → a pending PURCHASE_ORDER document for owner approval.
router.post("/vendor-bill/:token", async (req, res) => {
  const p = verifyToken(req.params.token);
  if (!p || p.kind !== "vendor") return res.status(401).json({ error: "Invalid or expired link" });
  const b = req.body || {};
  try {
    const doc = await documents.createDocument(p.tenant, null, {
      docKind: "PURCHASE_ORDER", docDate: b.date || new Date().toISOString().slice(0, 10), partyLedgerId: p.vendorLedgerId,
      subtotal: b.amount || 0, gstRate: b.gstRate || 0, interState: !!b.interState, narration: "Vendor-submitted bill", reference: b.reference,
    });
    res.status(201).json({ ok: true, documentId: doc.id, status: "pending owner approval" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Razorpay webhook — confirm via the API (never trust the raw payload), then post.
router.post("/webhook/razorpay", async (req, res) => {
  try {
    const ev = req.body || {};
    const linkId = ev?.payload?.payment_link?.entity?.id;
    if (linkId && razorpay.isConfigured()) {
      const link = await razorpay.getPaymentLink(linkId).catch(() => null);
      if (link && link.status === "paid") await payments.markPaidByProviderRef(linkId);
    }
  } catch (e) { console.error("[rzp-webhook]", e.message); }
  res.json({ ok: true });
});

module.exports = { router, signToken, verifyToken };
