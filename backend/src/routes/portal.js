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

const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

/**
 * Resolve a presented token to its link row, or explain precisely why not.
 * Constant-ish work either way: the lookup is by hash, so a wrong token costs one indexed
 * miss and reveals nothing about which customers exist.
 */
async function resolve(token) {
  if (!token || String(token).length < 20) return { error: "This link isn't valid." };
  const { rows } = await pool.query(
    `SELECT l.*, c.name AS customer_name, c.email AS customer_email, c.opening_balance
       FROM customer_portal_links l JOIN customers c ON c.id = l.customer_id
      WHERE l.token_hash = $1`,
    [hashToken(token)]
  );
  const link = rows[0];
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

    // Explicitly tenant-scoped (this table is outside RLS by design — see migration 0038).
    const { rows: invoices } = await pool.query(
      `SELECT id, invoice_number, invoice_date, due_date, total_amount, paid_amount,
              COALESCE(credited_amount,0) AS credited_amount, status, currency,
              GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0), 0) AS outstanding
         FROM invoices
        WHERE tenant_id=$1 AND customer_id=$2 AND status <> 'draft' AND voided_at IS NULL
        ORDER BY invoice_date DESC NULLS LAST, created_at DESC LIMIT 100`,
      [link.tenant_id, link.customer_id]);

    const { rows: receipts } = await pool.query(
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
    const { rows } = await pool.query(
      "SELECT id FROM invoices WHERE id=$1 AND tenant_id=$2 AND customer_id=$3 AND status <> 'draft'",
      [req.params.id, link.tenant_id, link.customer_id]);
    if (!rows[0]) return res.status(404).json({ error: "That invoice isn't on this account." });

    // The same renderer the authenticated download uses (lib/invoicePdf.js), so the
    // customer's copy is byte-for-byte the document the firm sees.
    const out = await renderInvoicePdf(link.tenant_id, rows[0].id, res);
    if (out?.notFound) return res.status(404).json({ error: "That invoice isn't on this account." });
  } catch (e) { next(e); }
});

module.exports = { router, hashToken };
