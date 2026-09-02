"use strict";
// ── The customer portal ──────────────────────────────────────────────────────
// There was no way for a CUSTOMER to see what they owe. Everything about collections
// pointed inwards: the firm chased, the customer replied "send it again", and a person
// re-attached a PDF. A link they can open — open invoices, their statement, a way to pay —
// removes most of that loop, which is why it was the highest-value item in the audit's
// money-hygiene section.
//
// PUBLIC (no auth — the token is the authorisation):
//   GET /api/portal/:token                 what they owe, and the documents behind it
//   GET /api/portal/:token/invoice/:id/pdf one invoice as a PDF
// AUTHENTICATED (on the customer record):
//   POST   /api/customers/:id/portal-link  create or replace the link
//   DELETE /api/customers/:id/portal-link  revoke it
const router = require("express").Router();
const crypto = require("crypto");
const { pool } = require("../db");
const { renderInvoicePdf } = require("../lib/invoicePdf");
// invoices/invoice_payments are FORCE-RLS: reads MUST carry the link's tenant GUC (q),
// or the production role sees zero rows. The link tables themselves are non-RLS by design.
const { q } = require("../lib/tenantDb");

const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

/**
 * Resolve a presented token to its link row, or explain precisely why not.
 * Constant-ish work either way: the lookup is by hash, so a wrong token costs one indexed
 * miss and reveals nothing about which customers exist.
 */
async function resolve(token) {
  if (!token || String(token).length < 20) return { error: "This link isn't valid." };
  // Two steps on purpose: the link row is non-RLS (no tenant context exists yet), but
  // customers is FORCE-RLS — joining it here returned zero rows for the production role.
  const { rows } = await pool.query(
    "SELECT * FROM customer_portal_links WHERE token_hash = $1", [hashToken(token)]);
  let link = rows[0];
  if (link) {
    const { rows: cust } = await q(link.tenant_id,
      "SELECT name, email, opening_balance FROM customers WHERE id=$1 AND tenant_id=$2",
      [link.customer_id, link.tenant_id]);
    if (!cust[0]) link = undefined; // customer deleted → the link is dead too
    else link = { ...link, customer_name: cust[0].name, customer_email: cust[0].email, opening_balance: cust[0].opening_balance };
  }
  if (!link) return { error: "This link isn't valid. Ask your supplier for a new one." };
  if (link.revoked_at) return { error: "This link has been turned off. Ask your supplier for a new one." };
  if (link.expires_at && new Date(link.expires_at) < new Date())
    return { error: "This link has expired. Ask your supplier for a new one." };
  return { link };
}

// ── PUBLIC: what this customer owes ─────────────────────────────────────────
router.get("/:token", async (req, res, next) => {
  try {
    const { link, error } = await resolve(req.params.token);
    if (error) return res.status(404).json({ error });

    // Count the view, but never let a stats write break the page the customer came for.
    pool.query("UPDATE customer_portal_links SET view_count = view_count + 1, last_viewed_at = now() WHERE id=$1", [link.id]).catch(() => {});

    // invoices is FORCE-RLS — the read must set the tenant GUC (q), not just filter by
    // column: as the production role a plain pool.query returns zero rows here.
    const { rows: invoices } = await q(link.tenant_id,
      `SELECT id, invoice_number, invoice_date, due_date, total_amount, paid_amount,
              COALESCE(credited_amount,0) AS credited_amount, status, currency,
              GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0), 0) AS outstanding
         FROM invoices
        WHERE tenant_id=$1 AND customer_id=$2 AND status <> 'draft' AND voided_at IS NULL
        ORDER BY invoice_date DESC NULLS LAST, created_at DESC LIMIT 100`,
      [link.tenant_id, link.customer_id]);

    const { rows: receipts } = await q(link.tenant_id,
      `SELECT p.id, p.amount, p.mode, p.reference, p.received_at, p.receipt_number, i.invoice_number
         FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE p.tenant_id=$1 AND i.customer_id=$2
        ORDER BY p.received_at DESC LIMIT 50`,
      [link.tenant_id, link.customer_id]);

    // The supplier's own identity — the customer needs to know who is asking, and where to
    // send the money.
    const { rows: prof } = await pool.query(
      "SELECT company_name, gstin FROM tenant_profile WHERE tenant_id=$1", [link.tenant_id]).catch(() => ({ rows: [] }));
    let firmName = prof[0]?.company_name || null;
    if (!firmName) {
      const { rows: kv } = await pool.query(
        "SELECT value FROM kv_store WHERE tenant_id=$1 AND key='store' LIMIT 1", [link.tenant_id]).catch(() => ({ rows: [] }));
      firmName = kv[0]?.value?.value?.firm?.name || "Your supplier";
    }

    const open = invoices.filter((i) => i.status !== "paid" && i.status !== "cancelled");
    const totalDue = open.reduce((s, i) => s + Number(i.outstanding), 0) + Number(link.opening_balance || 0);
    const today = new Date().toISOString().slice(0, 10);
    const overdue = open.filter((i) => i.due_date && i.due_date < today);

    res.json({
      supplier: { name: firmName, gstin: prof[0]?.gstin || null },
      customer: { name: link.customer_name },
      summary: {
        total_due: Math.round(totalDue * 100) / 100,
        overdue_amount: Math.round(overdue.reduce((s, i) => s + Number(i.outstanding), 0) * 100) / 100,
        open_count: open.length,
        overdue_count: overdue.length,
        opening_balance: Number(link.opening_balance || 0),
      },
      invoices,
      receipts,
      as_of: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

// ── PUBLIC: one invoice as a PDF ────────────────────────────────────────────
// Reuses the authenticated PDF generator by proving the invoice belongs to THIS link's
// customer first — the token grants access to their own documents and nothing else.
router.get("/:token/invoice/:id/pdf", async (req, res, next) => {
  try {
    const { link, error } = await resolve(req.params.token);
    if (error) return res.status(404).json({ error });
    const { rows } = await q(link.tenant_id,
      "SELECT id FROM invoices WHERE id=$1 AND tenant_id=$2 AND customer_id=$3 AND status <> 'draft'",
      [req.params.id, link.tenant_id, link.customer_id]);
    if (!rows[0]) return res.status(404).json({ error: "That invoice isn't on this account." });

    // The same renderer the authenticated download uses (lib/invoicePdf.js), so the
    // customer's copy is byte-for-byte the document the firm sees.
    const out = await renderInvoicePdf(link.tenant_id, rows[0].id, res);
    if (out?.notFound) return res.status(404).json({ error: "That invoice isn't on this account." });
  } catch (e) { next(e); }
});

// ── PUBLIC: the vendor portal (Wave 16) ──────────────────────────────────────
// The mirror for suppliers: which of their bills are booked, what's been paid, what's
// still due to them. Bills are PURCHASE vouchers on the vendor's ledger (the same source
// the AP ageing uses), so this page and the firm's books cannot disagree.
router.get("/vendor/:token", async (req, res, next) => {
  try {
    if (!req.params.token || String(req.params.token).length < 20)
      return res.status(404).json({ error: "This link isn't valid." });
    const { rows } = await pool.query(
      `SELECT l.*, v.name AS vendor_name FROM vendor_portal_links l
        JOIN vendor_master v ON v.id = l.vendor_id
       WHERE l.token_hash = $1`, [hashToken(req.params.token)]);
    const link = rows[0];
    if (!link) return res.status(404).json({ error: "This link isn't valid. Ask your customer for a new one." });
    if (link.revoked_at) return res.status(404).json({ error: "This link has been turned off. Ask your customer for a new one." });
    if (link.expires_at && new Date(link.expires_at) < new Date())
      return res.status(404).json({ error: "This link has expired. Ask your customer for a new one." });

    pool.query("UPDATE vendor_portal_links SET view_count=view_count+1, last_viewed_at=now() WHERE id=$1", [link.id]).catch(() => {});

    // Deliberately NOT swallowed: an empty list here is indistinguishable from "nothing is
    // owed", and answering a supplier with a confident Rs 0.00 when the query actually
    // failed is worse than answering with an error they can act on.
    const bills = await require("../modules/vendorBills").listBills(link.tenant_id, link.vendor_id);
    // listBills returns camelCase (voucherNumber/billNumber/date/cancelled/outstanding) and
    // already computes `outstanding` and `status`. Reading snake_case here made every
    // identifier undefined AND made `!b.is_cancelled` always true — so a bill the buyer
    // had CANCELLED was shown to the supplier as money still owed, with no bill number.
    const live = bills.filter((b) => !b.cancelled);
    const open = live.filter((b) => Number(b.outstanding) > 0.005);
    const totalDue = open.reduce((s, b) => s + Number(b.outstanding), 0);

    const { rows: prof } = await pool.query(
      "SELECT company_name, gstin FROM tenant_profile WHERE tenant_id=$1", [link.tenant_id]).catch(() => ({ rows: [] }));
    let firmName = prof[0]?.company_name || null;
    if (!firmName) {
      const { rows: kv } = await pool.query(
        "SELECT value FROM kv_store WHERE tenant_id=$1 AND key='store' LIMIT 1", [link.tenant_id]).catch(() => ({ rows: [] }));
      firmName = kv[0]?.value?.value?.firm?.name || "Your customer";
    }

    res.json({
      buyer: { name: firmName, gstin: prof[0]?.gstin || null },
      vendor: { name: link.vendor_name },
      summary: {
        total_due_to_you: Math.round(totalDue * 100) / 100,
        open_bills: open.length,
        bills_on_record: live.length,
      },
      bills: live.slice(0, 100).map((b) => ({
        voucher_number: b.voucherNumber, date: b.date, reference: b.billNumber,
        gross: Number(b.gross), paid: Number(b.allocated),
        outstanding: Math.max(0, Math.round(Number(b.outstanding) * 100) / 100),
        cancelled: !!b.cancelled,
      })),
      as_of: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

module.exports = { router, hashToken };
