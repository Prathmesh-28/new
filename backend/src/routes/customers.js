"use strict";
// ── Customer master ──────────────────────────────────────────────────────────
// The product had no customers table at all: a customer existed only as free text on an
// invoice. This is the record everything about a customer now hangs off — contacts,
// addresses, place of supply, payment terms, credit limit, opening balance, and the
// ledger that answers "what does this customer actually owe us?".
//
//   GET    /api/customers                 list (paged/sorted/searchable)
//   POST   /api/customers                 create
//   GET    /api/customers/:id             one, with contacts + balance
//   PATCH  /api/customers/:id             update
//   DELETE /api/customers/:id             → Trash (30-day undo)
//   POST   /api/customers/:id/archive     deactivate without deleting
//   GET    /api/customers/:id/ledger      every invoice, receipt and credit note, running balance
//   GET    /api/customers/:id/statement   statement of account for a period
//   POST   /api/customers/merge           fold a duplicate into the one you're keeping
//   GET/POST/PATCH/DELETE .../contacts    people at the customer
const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { q, withTenant } = require("../lib/tenantDb");
const { auditReq } = require("../lib/audit");
const listQuery = require("../lib/listQuery");
const trash = require("../lib/trash");
const { isValidGstin, isValidPan, gstinInfo } = require("../lib/validators");
const { GST_STATES, stateName } = require("../lib/gstInvoice");

const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant", "sales"];
const canWrite = (req, res, next) =>
  WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "You don't have permission to change customers" });

const GST_TREATMENTS = new Set(["regular", "composition", "unregistered", "overseas", "sez", "deemed_export"]);

// Fields a client may set. Anything not listed here (ids, timestamps, tenant) is ignored
// rather than trusted.
const WRITABLE = [
  "name", "display_name", "gstin", "pan", "email", "phone",
  "billing_line1", "billing_line2", "billing_city", "billing_state", "billing_state_code", "billing_pincode", "billing_country",
  "shipping_same", "shipping_line1", "shipping_line2", "shipping_city", "shipping_state", "shipping_state_code", "shipping_pincode",
  "place_of_supply_code", "gst_treatment", "tds_section",
  "payment_terms_days", "credit_limit", "opening_balance", "opening_balance_date",
  "notes", "tags",
];

/** Validate + normalise an incoming customer body. Returns { values, errors }. */
function clean(body, { partial } = {}) {
  const errors = {};
  const v = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) errors.name = "A customer name is required";
    else if (name.length > 200) errors.name = "That name is too long (max 200 characters)";
    else v.name = name;
  }

  if (body.gstin !== undefined) {
    const g = String(body.gstin ?? "").trim().toUpperCase();
    if (!g) v.gstin = null;
    else if (!isValidGstin(g)) errors.gstin = "That GSTIN isn't valid (15 characters, and the check digit must match)";
    else {
      v.gstin = g;
      // The state code is IN the GSTIN — deriving it here means one less thing to get wrong,
      // and the invoice's IGST-vs-CGST/SGST decision stops being a guess.
      const info = gstinInfo(g);
      if (info.valid) {
        v.place_of_supply_code = body.place_of_supply_code || info.stateCode;
        if (!body.pan) v.pan = info.pan;
        if (!body.gst_treatment) v.gst_treatment = "regular";
      }
    }
  }

  if (body.pan !== undefined && v.pan === undefined) {
    const p = String(body.pan ?? "").trim().toUpperCase();
    if (!p) v.pan = null;
    else if (!isValidPan(p)) errors.pan = "That PAN isn't valid (five letters, four digits, one letter)";
    else v.pan = p;
  }

  if (body.email !== undefined) {
    const e = String(body.email ?? "").trim();
    if (!e) v.email = null;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) errors.email = "That email address doesn't look right";
    else v.email = e;
  }

  if (body.phone !== undefined) {
    const raw = String(body.phone ?? "").trim();
    if (!raw) v.phone = null;
    else {
      const digits = raw.replace(/[^\d]/g, "");
      // Accept 10-digit Indian mobiles and +91-prefixed forms; store E.164 so WhatsApp and
      // SMS senders don't each have to re-guess the format.
      if (/^[6-9]\d{9}$/.test(digits)) v.phone = `+91${digits}`;
      else if (/^91[6-9]\d{9}$/.test(digits)) v.phone = `+${digits}`;
      else if (digits.length >= 8 && digits.length <= 15) v.phone = raw.startsWith("+") ? `+${digits}` : `+${digits}`;
      else errors.phone = "That phone number doesn't look right";
    }
  }

  if (body.gst_treatment !== undefined && v.gst_treatment === undefined) {
    const t = String(body.gst_treatment || "unregistered");
    if (!GST_TREATMENTS.has(t)) errors.gst_treatment = `GST treatment must be one of: ${[...GST_TREATMENTS].join(", ")}`;
    else v.gst_treatment = t;
  }

  if (body.place_of_supply_code !== undefined && v.place_of_supply_code === undefined) {
    const c = String(body.place_of_supply_code ?? "").trim();
    if (!c) v.place_of_supply_code = null;
    else if (!GST_STATES[c]) errors.place_of_supply_code = "That isn't a GST state code";
    else v.place_of_supply_code = c;
  }

  for (const key of ["payment_terms_days"]) {
    if (body[key] !== undefined) {
      const n = parseInt(body[key], 10);
      if (!Number.isFinite(n) || n < 0 || n > 365) errors[key] = "Payment terms must be between 0 and 365 days";
      else v[key] = n;
    }
  }
  for (const key of ["credit_limit", "opening_balance"]) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0) errors[key] = "That amount can't be negative";
      else v[key] = n;
    }
  }
  if (body.billing_pincode !== undefined) {
    const p = String(body.billing_pincode ?? "").trim();
    if (p && !/^\d{6}$/.test(p)) errors.billing_pincode = "An Indian PIN code is 6 digits";
    else v.billing_pincode = p || null;
  }
  if (body.tags !== undefined) v.tags = Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t) => String(t).slice(0, 40)) : [];
  if (body.shipping_same !== undefined) v.shipping_same = !!body.shipping_same;

  for (const key of WRITABLE) {
    if (v[key] === undefined && body[key] !== undefined && !(key in errors)) {
      v[key] = body[key] === "" ? null : body[key];
    }
  }
  // Keep the human-readable state name in step with the code so lists don't have to join.
  if (v.place_of_supply_code) v.billing_state = v.billing_state || stateName(v.place_of_supply_code);

  return { values: v, errors };
}

// ── List ─────────────────────────────────────────────────────────────────────
router.get("/", authenticate, async (req, res, next) => {
  try {
    const parsed = listQuery.parseList(req, {
      sortable: ["name", "created_at", "credit_limit", "payment_terms_days"],
      defaultSort: "name", defaultOrder: "asc",
      searchable: ["name", "gstin", "email", "phone", "billing_city"],
    });
    const vals = [req.user.tenant_id];
    const conditions = ["c.tenant_id = $1"];
    if (req.query.archived === "1") conditions.push("c.archived_at IS NOT NULL");
    else conditions.push("c.archived_at IS NULL");
    if (req.query.gst_treatment) { vals.push(String(req.query.gst_treatment)); conditions.push(`c.gst_treatment = $${vals.length}`); }

    const srch = listQuery.search(parsed, "c", vals.length + 1);
    if (srch.clause) { conditions.push(srch.clause); vals.push(...srch.params); }
    const where = conditions.join(" AND ");
    const page = listQuery.paginate(parsed, vals.length + 1);

    // Outstanding is joined in, because a customer list without "what do they owe" is a
    // phone book, not a receivables tool.
    const [rows, count] = await Promise.all([
      q(req.user.tenant_id, `
        SELECT c.*,
               COALESCE(b.outstanding, 0) + c.opening_balance AS outstanding,
               COALESCE(b.invoice_count, 0)                   AS invoice_count,
               b.last_invoice_at
          FROM customers c
          LEFT JOIN LATERAL (
            SELECT SUM(GREATEST(i.total_amount - i.paid_amount - COALESCE(i.credited_amount,0), 0))
                     FILTER (WHERE i.status NOT IN ('paid','cancelled')) AS outstanding,
                   COUNT(*)                                              AS invoice_count,
                   MAX(i.created_at)                                     AS last_invoice_at
              FROM invoices i WHERE i.customer_id = c.id AND i.tenant_id = c.tenant_id
          ) b ON true
         WHERE ${where}
         ${listQuery.orderBy(parsed, "c")}
         ${page.clause}`, [...vals, ...page.params]),
      q(req.user.tenant_id, `SELECT count(*)::int AS n FROM customers c WHERE ${where}`, vals),
    ]);
    res.json(listQuery.envelope(rows.rows, count.rows[0].n, parsed));
  } catch (e) { next(e); }
});

// ── Create ───────────────────────────────────────────────────────────────────
router.post("/", authenticate, canWrite, async (req, res, next) => {
  const { values, errors } = clean(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], errors });
  try {
    const cols = Object.keys(values);
    const { rows } = await q(req.user.tenant_id,
      `INSERT INTO customers (tenant_id, created_by, ${cols.join(", ")})
       VALUES ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}) RETURNING *`,
      [req.user.tenant_id, req.user.id, ...cols.map((c) => values[c])]);
    auditReq(req, "created", "customer", rows[0].id, { name: rows[0].name });
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({
      error: `You already have a customer called "${values.name}". Open that one instead of creating a duplicate.`,
      code: "DUPLICATE_CUSTOMER",
    });
    next(e);
  }
});

// ── Read one ─────────────────────────────────────────────────────────────────
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const { rows } = await q(req.user.tenant_id, "SELECT * FROM customers WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tenant_id]);
    if (!rows[0]) return res.status(404).json({ error: "Customer not found" });
    const [contacts, bal] = await Promise.all([
      q(req.user.tenant_id, "SELECT * FROM customer_contacts WHERE customer_id=$1 AND tenant_id=$2 ORDER BY is_primary DESC, name", [req.params.id, req.user.tenant_id]),
      q(req.user.tenant_id, `
        SELECT COALESCE(SUM(GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0), 0))
                 FILTER (WHERE status NOT IN ('paid','cancelled')), 0) AS outstanding,
               COALESCE(SUM(GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0), 0))
                 FILTER (WHERE status NOT IN ('paid','cancelled') AND due_date < CURRENT_DATE), 0) AS overdue,
               COALESCE(SUM(total_amount) FILTER (WHERE status <> 'cancelled'), 0) AS lifetime_billed,
               COUNT(*)::int AS invoice_count,
               MAX(created_at) AS last_invoice_at
          FROM invoices WHERE customer_id=$1 AND tenant_id=$2`, [req.params.id, req.user.tenant_id]),
    ]);
    const b = bal.rows[0];
    const outstanding = Number(b.outstanding) + Number(rows[0].opening_balance || 0);
    res.json({
      ...rows[0],
      contacts: contacts.rows,
      outstanding,
      overdue: Number(b.overdue),
      lifetime_billed: Number(b.lifetime_billed),
      invoice_count: b.invoice_count,
      last_invoice_at: b.last_invoice_at,
      // A credit limit that nothing checks is decoration; say plainly where they stand.
      credit_available: Number(rows[0].credit_limit) > 0 ? Number(rows[0].credit_limit) - outstanding : null,
      over_limit: Number(rows[0].credit_limit) > 0 && outstanding > Number(rows[0].credit_limit),
    });
  } catch (e) { next(e); }
});

// ── Update ───────────────────────────────────────────────────────────────────
router.patch("/:id", authenticate, canWrite, async (req, res, next) => {
  const { values, errors } = clean(req.body || {}, { partial: true });
  if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], errors });
  const cols = Object.keys(values);
  if (!cols.length) return res.status(400).json({ error: "Nothing to update" });
  try {
    const { rows } = await q(req.user.tenant_id,
      `UPDATE customers SET ${cols.map((c, i) => `${c}=$${i + 3}`).join(", ")}, updated_at=now()
        WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, req.user.tenant_id, ...cols.map((c) => values[c])]);
    if (!rows[0]) return res.status(404).json({ error: "Customer not found" });
    auditReq(req, "updated", "customer", req.params.id, { fields: cols });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Another customer already has that name", code: "DUPLICATE_CUSTOMER" });
    next(e);
  }
});

// ── Archive (the safe alternative to deleting) ───────────────────────────────
router.post("/:id/archive", authenticate, canWrite, async (req, res, next) => {
  try {
    const on = req.body?.archived !== false;
    const { rows } = await q(req.user.tenant_id,
      "UPDATE customers SET archived_at = CASE WHEN $3 THEN now() ELSE NULL END, updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *",
      [req.params.id, req.user.tenant_id, on]);
    if (!rows[0]) return res.status(404).json({ error: "Customer not found" });
    auditReq(req, on ? "archived" : "unarchived", "customer", req.params.id, { name: rows[0].name });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ── Delete → Trash ───────────────────────────────────────────────────────────
router.delete("/:id", authenticate, canWrite, async (req, res, next) => {
  try {
    // Deleting a customer who has been invoiced would orphan the history. Archiving keeps
    // the ledger intact, so say so instead of silently doing the destructive thing.
    const { rows } = await q(req.user.tenant_id,
      "SELECT count(*)::int AS n FROM invoices WHERE customer_id=$1 AND tenant_id=$2", [req.params.id, req.user.tenant_id]);
    if (rows[0].n > 0) return res.status(409).json({
      error: `This customer has ${rows[0].n} invoice${rows[0].n === 1 ? "" : "s"}. Archive them instead — deleting would leave that history without a customer.`,
      code: "HAS_INVOICES", invoice_count: rows[0].n,
    });
    const out = await trash.softDelete(req.user.tenant_id, "customer", req.params.id, req.user.id);
    auditReq(req, "deleted", "customer", req.params.id, { label: out.label });
    res.json({ ok: true, trashId: out.trashId, label: out.label });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// ── Ledger ───────────────────────────────────────────────────────────────────
// Every document that moved this customer's balance, oldest first, with a running total.
router.get("/:id/ledger", authenticate, async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const cust = await q(tenantId, "SELECT id, name, opening_balance, opening_balance_date FROM customers WHERE id=$1 AND tenant_id=$2", [req.params.id, tenantId]);
    if (!cust.rows[0]) return res.status(404).json({ error: "Customer not found" });

    const { rows } = await q(tenantId, `
      SELECT * FROM (
        SELECT i.created_at AS at, 'invoice' AS kind, i.id AS ref_id, i.invoice_number AS ref,
               i.total_amount AS debit, 0::numeric AS credit, i.status AS note
          FROM invoices i WHERE i.customer_id=$1 AND i.tenant_id=$2 AND i.status <> 'cancelled'
        UNION ALL
        SELECT p.received_at::timestamptz AS at, 'receipt' AS kind, p.id, COALESCE(p.reference, p.mode),
               0::numeric, p.amount, p.mode
          FROM invoice_payments p
          JOIN invoices i2 ON i2.id = p.invoice_id
         WHERE i2.customer_id=$1 AND p.tenant_id=$2
        UNION ALL
        SELECT n.created_at AS at, 'credit_note' AS kind, n.id, n.note_number,
               0::numeric, n.total_amount, COALESCE(n.reason, '')
          FROM invoice_credit_notes n
          JOIN invoices i3 ON i3.id = n.invoice_id
         WHERE i3.customer_id=$1 AND n.tenant_id=$2
      ) t
      -- Statement order, not raw timestamp order: receipts carry a DATE (midnight) while
      -- invoices carry a timestamp, so sorting purely on that column puts the day's receipt BEFORE
      -- the invoice it settles and shows a negative running balance. Group by day, then
      -- invoices before the money that pays them.
      ORDER BY at::date ASC, CASE kind WHEN 'invoice' THEN 0 ELSE 1 END, at ASC`,
      [req.params.id, tenantId]);

    let balance = Number(cust.rows[0].opening_balance || 0);
    const entries = rows.map((r) => {
      balance += Number(r.debit) - Number(r.credit);
      return { ...r, debit: Number(r.debit), credit: Number(r.credit), balance: Math.round(balance * 100) / 100 };
    });
    res.json({
      customer: cust.rows[0],
      opening_balance: Number(cust.rows[0].opening_balance || 0),
      entries,
      closing_balance: Math.round(balance * 100) / 100,
    });
  } catch (e) { next(e); }
});

// ── Merge duplicates ─────────────────────────────────────────────────────────
// Free-text names produced duplicates for years; this is how they get cleaned up without
// losing either side's history.
router.post("/merge", authenticate, canWrite, async (req, res, next) => {
  const { keepId, mergeIds } = req.body || {};
  if (!keepId || !Array.isArray(mergeIds) || !mergeIds.length)
    return res.status(400).json({ error: "Tell me which customer to keep (keepId) and which to fold into it (mergeIds)" });
  if (mergeIds.includes(keepId)) return res.status(400).json({ error: "A customer can't be merged into itself" });
  try {
    const out = await withTenant(req.user.tenant_id, async (c) => {
      const keep = await c.query("SELECT * FROM customers WHERE id=$1 AND tenant_id=$2", [keepId, req.user.tenant_id]);
      if (!keep.rows[0]) throw Object.assign(new Error("The customer you want to keep wasn't found"), { status: 404 });

      const losers = await c.query("SELECT * FROM customers WHERE id = ANY($1::uuid[]) AND tenant_id=$2", [mergeIds, req.user.tenant_id]);
      if (!losers.rows.length) throw Object.assign(new Error("None of those duplicates were found"), { status: 404 });

      // Move every invoice across first — losing an invoice here would be unrecoverable.
      const moved = await c.query("UPDATE invoices SET customer_id=$1 WHERE customer_id = ANY($2::uuid[]) AND tenant_id=$3",
        [keepId, mergeIds, req.user.tenant_id]);
      await c.query("UPDATE customer_contacts SET customer_id=$1 WHERE customer_id = ANY($2::uuid[]) AND tenant_id=$3",
        [keepId, mergeIds, req.user.tenant_id]);

      // Opening balances add up: two duplicate records each carrying part of the history
      // must not lose either part.
      const addedOpening = losers.rows.reduce((s, l) => s + Number(l.opening_balance || 0), 0);
      // Fill blanks on the survivor from the duplicates rather than discarding real data.
      const fill = {};
      for (const f of ["gstin", "pan", "email", "phone", "billing_line1", "billing_city", "billing_state", "billing_state_code", "billing_pincode", "place_of_supply_code", "notes"]) {
        if (!keep.rows[0][f]) { const donor = losers.rows.find((l) => l[f]); if (donor) fill[f] = donor[f]; }
      }
      const sets = Object.keys(fill);
      await c.query(
        `UPDATE customers SET opening_balance = opening_balance + $2, updated_at=now()
         ${sets.length ? ", " + sets.map((k, i) => `${k}=$${i + 3}`).join(", ") : ""}
         WHERE id=$1`,
        [keepId, addedOpening, ...sets.map((k) => fill[k])]);

      await c.query("DELETE FROM customers WHERE id = ANY($1::uuid[]) AND tenant_id=$2", [mergeIds, req.user.tenant_id]);
      return { kept: keep.rows[0].name, merged: losers.rows.map((l) => l.name), invoices_moved: moved.rowCount, opening_balance_added: addedOpening };
    });
    auditReq(req, "merged", "customer", keepId, out);
    res.json(out);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// ── Contacts ─────────────────────────────────────────────────────────────────
router.post("/:id/contacts", authenticate, canWrite, async (req, res, next) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "A contact needs a name" });
  try {
    const { rows } = await q(req.user.tenant_id,
      `INSERT INTO customer_contacts(tenant_id, customer_id, name, role, email, phone, is_primary)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.tenant_id, req.params.id, name, req.body.role || null, req.body.email || null, req.body.phone || null, !!req.body.is_primary]);
    if (req.body.is_primary) {
      await q(req.user.tenant_id, "UPDATE customer_contacts SET is_primary=false WHERE customer_id=$1 AND tenant_id=$2 AND id<>$3",
        [req.params.id, req.user.tenant_id, rows[0].id]);
    }
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.delete("/:id/contacts/:contactId", authenticate, canWrite, async (req, res, next) => {
  try {
    const { rowCount } = await q(req.user.tenant_id,
      "DELETE FROM customer_contacts WHERE id=$1 AND customer_id=$2 AND tenant_id=$3",
      [req.params.contactId, req.params.id, req.user.tenant_id]);
    if (!rowCount) return res.status(404).json({ error: "Contact not found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GST state codes, so the UI's place-of-supply dropdown and the server agree on one list.
router.get("/meta/states", authenticate, (_req, res) =>
  res.json(Object.entries(GST_STATES).map(([code, name]) => ({ code, name }))));

module.exports = router;
