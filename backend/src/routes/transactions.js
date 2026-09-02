const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const trash = require("../lib/trash");
const { q, withTenant: withTenantTx } = require("../lib/tenantDb");
const { recordReceiptTx } = require("../lib/receipts");
const { idempotent } = require("../middleware/idempotency");
const { auditReq } = require("../lib/audit");

const WRITE_ROLES = ["super_admin","owner","finance_manager","accountant"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });

const CATEGORIES = ["revenue","payroll","rent","software","inventory","utilities","marketing","tax","loan_repayment","transfer","uncategorized"];

// GET /api/transactions?page=1&limit=50&category=&from=&to=&account_id=
router.get("/", authenticate, async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(200, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const conditions = ["t.tenant_id=$1"];
  const vals = [req.user.tenant_id];
  let p = 2;

  if (req.query.q) {
    // The list paged but had no search: finding one payment meant clicking through pages.
    conditions.push(`(COALESCE(t.description_raw,'') ILIKE $${p} OR COALESCE(t.merchant_name,'') ILIKE $${p} OR COALESCE(t.category,'') ILIKE $${p})`);
    vals.push(`%${String(req.query.q).slice(0, 120)}%`); p++;
  }
  if (req.query.minAmount) { conditions.push(`abs(t.amount) >= $${p++}`); vals.push(Number(req.query.minAmount)); }
  if (req.query.maxAmount) { conditions.push(`abs(t.amount) <= $${p++}`); vals.push(Number(req.query.maxAmount)); }
  if (req.query.direction === "in")  conditions.push("t.amount > 0");
  if (req.query.direction === "out") conditions.push("t.amount < 0");
  if (req.query.category)   { conditions.push(`t.category=$${p++}`);          vals.push(req.query.category); }
  if (req.query.account_id) { conditions.push(`t.bank_account_id=$${p++}`);   vals.push(req.query.account_id); }
  if (req.query.from)       { conditions.push(`t.transaction_date>=$${p++}`); vals.push(req.query.from); }
  if (req.query.to)         { conditions.push(`t.transaction_date<=$${p++}`); vals.push(req.query.to); }
  if (req.query.q)          { conditions.push(`(t.description_raw ILIKE $${p} OR t.merchant_name ILIKE $${p})`); vals.push(`%${req.query.q}%`); p++; }

  const where = conditions.join(" AND ");
  // Allowlist-only, like every other list (lib/listQuery): a client string is never
  // interpolated into an ORDER BY.
  const SORTABLE = { transaction_date: "t.transaction_date", amount: "t.amount", merchant_name: "t.merchant_name", category: "t.category", created_at: "t.created_at" };
  const sortCol = SORTABLE[String(req.query.sort || "")] || "t.transaction_date";
  const sortDir = String(req.query.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const orderBy = `ORDER BY ${sortCol} ${sortDir} NULLS LAST, t.created_at DESC`;

  const [dataRes, countRes] = await Promise.all([
    pool.query(
      `SELECT t.*, b.account_name FROM transactions t LEFT JOIN bank_accounts b ON b.id=t.bank_account_id
       WHERE ${where} ${orderBy} LIMIT $${p} OFFSET $${p+1}`,
      [...vals, limit, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM transactions t WHERE ${where}`, vals),
  ]);

  res.json({
    data:  dataRes.rows,
    total: countRes.rows[0].total,
    page, limit,
    pages: Math.ceil(countRes.rows[0].total / limit),
  });
});

// GET /api/transactions/summary - category totals for the last N days
router.get("/summary", authenticate, async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const { rows } = await pool.query(
    `SELECT category,
       SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS outflow,
       SUM(CASE WHEN amount > 0 THEN amount        ELSE 0 END) AS inflow,
       COUNT(*) AS count
     FROM transactions
     WHERE tenant_id=$1 AND transaction_date >= CURRENT_DATE - $2::int
     GROUP BY category ORDER BY outflow DESC`,
    [req.user.tenant_id, days]
  );
  res.json(rows);
});

// The client-side bank-account picker can carry an account created purely in the local KV
// store (DashboardPage's "Add Account" modal uses generateId() - a Math.random() base36
// string, never a real backend bank_accounts row). Sending that as bank_account_id crashes
// the INSERT (invalid UUID for the FK column) and, with no per-row isolation, aborted the
// WHOLE batch on one bad row. Never trust a client-supplied FK to be well-formed.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asBankAccountId = (v) => (v && UUID_RE.test(v) ? v : null);

// POST /api/transactions - manual entry or bulk import
router.post("/", authenticate, canWrite, async (req, res) => {
  const isBulk = Array.isArray(req.body); // bulk import must isolate a bad row; single add should surface its own error honestly
  const items = isBulk ? req.body : [req.body];
  const inserted = [];
  let skippedDuplicates = 0, skippedErrors = 0;

  // Every bulk upload gets a batch id stamped on its rows, so a bad CSV can be taken back
  // as a unit (POST /api/transactions/imports/:batchId/rollback) instead of hunting rows.
  let batchId = null;
  if (isBulk && items.length) {
    try {
      const b = await q(req.user.tenant_id,
        "INSERT INTO import_batches(tenant_id, entity, filename, created_by) VALUES($1,'transactions',$2,$3) RETURNING id",
        [req.user.tenant_id, String(req.headers["x-import-filename"] || "").slice(0, 200) || null, req.user.id]);
      batchId = b.rows[0].id;
    } catch { /* batch tracking must never block the import itself */ }
  }

  // Statement-import dedupe: re-importing an overlapping statement must never double-count.
  // For source:"import" rows, load the ledger's (date|amount|description) signatures over the
  // incoming date range once, and skip exact matches (and repeats within the same upload).
  const importRows = items.filter((t) => t && t.source === "import" && t.amount && t.transaction_date);
  const existingSigs = new Set();
  if (importRows.length) {
    const dates = importRows.map((t) => String(t.transaction_date).slice(0, 10)).sort();
    const { rows: existing } = await pool.query(
      "SELECT transaction_date::date AS d, amount, COALESCE(description_raw,'') AS descr FROM transactions WHERE tenant_id=$1 AND transaction_date BETWEEN $2 AND $3",
      [req.user.tenant_id, dates[0], dates[dates.length - 1]]
    );
    for (const r of existing) existingSigs.add(`${String(r.d).slice(0, 10)}|${Number(r.amount)}|${r.descr}`);
  }

  for (const t of items) {
    const { bank_account_id, amount, description_raw, merchant_name, category = "uncategorized", transaction_date, source = "manual", is_recurring = false, recurrence_cadence } = t;
    if (!amount || !transaction_date) continue;
    if (source === "import") {
      const sig = `${String(transaction_date).slice(0, 10)}|${Number(amount)}|${description_raw || ""}`;
      if (existingSigs.has(sig)) { skippedDuplicates++; continue; }
      existingSigs.add(sig);
    }

    const insertOne = () => pool.query(
      `INSERT INTO transactions(tenant_id, bank_account_id, amount, description_raw, merchant_name, category, is_recurring, recurrence_cadence, transaction_date, source, import_batch_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.tenant_id, asBankAccountId(bank_account_id), amount, description_raw || null, merchant_name || null, category, is_recurring, recurrence_cadence || null, transaction_date, source, batchId]
    );
    if (isBulk) {
      // A per-row failure (unexpected constraint, etc.) must never abort the rest of the
      // batch - that would silently drop every transaction after it with no way to tell
      // which succeeded. Isolate each insert; keep going.
      try { inserted.push((await insertOne()).rows[0]); }
      catch (e) { console.error("[transactions] row insert failed, skipping:", e.message); skippedErrors++; }
    } else {
      inserted.push((await insertOne()).rows[0]); // single add: let a genuine failure surface as a real error
    }
  }

  // Fire a transaction.created event ONLY for a single manual add (never on bulk import, to
  // avoid flooding the Flows engine). Powers automation rules that watch new transactions.
  if (items.length === 1 && inserted[0]) {
    const t = inserted[0];
    require("../modules/flows/runner").emitEvent(req.user.tenant_id, "transaction.created", {
      transaction: { amount: Number(t.amount), category: t.category, counterparty: t.merchant_name || "", description: t.description_raw || "" },
    }).catch(() => {});
  }

  if (isBulk) {
    if (batchId) {
      q(req.user.tenant_id,
        "UPDATE import_batches SET row_count=$3, skipped_dupes=$4, skipped_errors=$5 WHERE id=$1 AND tenant_id=$2",
        [batchId, req.user.tenant_id, inserted.length, skippedDuplicates, skippedErrors]).catch(() => {});
    }
    return res.status(201).json({ inserted, skipped_duplicates: skippedDuplicates, skipped_errors: skippedErrors, import_batch_id: batchId });
  }
  res.status(201).json(inserted.length === 1 ? inserted[0] : inserted);
});

// PATCH /api/transactions/:id - update category, merchant etc.
router.patch("/:id", authenticate, canWrite, async (req, res) => {
  const { category, merchant_name, description_raw, is_recurring, recurrence_cadence } = req.body;

  const { rows: existing } = await pool.query(
    "SELECT * FROM transactions WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!existing[0]) return res.status(404).json({ error: "Not found" });

  const updates = [];
  const vals = [];
  let i = 1;
  if (category          !== undefined && CATEGORIES.includes(category)) { updates.push(`category=$${i++}`);          vals.push(category); }
  if (merchant_name     !== undefined) { updates.push(`merchant_name=$${i++}`);     vals.push(merchant_name); }
  if (description_raw   !== undefined) { updates.push(`description_raw=$${i++}`);   vals.push(description_raw); }
  if (is_recurring      !== undefined) { updates.push(`is_recurring=$${i++}`);      vals.push(is_recurring); }
  if (recurrence_cadence !== undefined) { updates.push(`recurrence_cadence=$${i++}`); vals.push(recurrence_cadence); }

  if (!updates.length) return res.json(existing[0]);

  vals.push(req.params.id, req.user.tenant_id);
  const { rows } = await pool.query(
    `UPDATE transactions SET ${updates.join(",")} WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`,
    vals
  );
  res.json(rows[0]);
});

// DELETE /api/transactions/:id — into the 30-day bin, not gone.
router.delete("/:id", authenticate, canWrite, async (req, res, next) => {
  try {
    const out = await trash.softDelete(req.user.tenant_id, "transaction", req.params.id, req.user.id);
    auditReq(req, "deleted", "transaction", req.params.id, { label: out.label });
    res.json({ ok: true, trashId: out.trashId, label: out.label });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: "Not found" });
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// GET /api/transactions/:id — one transaction. There was no way to fetch a single one,
// which is why no transaction had a URL of its own. UUID-constrained and registered last
// so it can never shadow /summary.
router.get("/:id([0-9a-fA-F-]{36})", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, b.account_name, b.account_type, b.provider
         FROM transactions t LEFT JOIN bank_accounts b ON b.id = t.bank_account_id AND b.tenant_id = t.tenant_id
        WHERE t.id=$1 AND t.tenant_id=$2`,
      [req.params.id, req.user.tenant_id]);
    if (!rows[0]) return res.status(404).json({ error: "Transaction not found" });

    // The other transactions this one sits between, so the user can see it in context
    // instead of losing their place when they open it.
    const { rows: nearby } = await pool.query(
      `SELECT id, transaction_date, amount, merchant_name, description_raw
         FROM transactions
        WHERE tenant_id=$1 AND bank_account_id IS NOT DISTINCT FROM $2 AND id <> $3
          AND transaction_date BETWEEN $4::date - 3 AND $4::date + 3
        ORDER BY transaction_date DESC, created_at DESC LIMIT 8`,
      [req.user.tenant_id, rows[0].bank_account_id, rows[0].id, rows[0].transaction_date]);

    res.json({ ...rows[0], nearby });
  } catch (e) { next(e); }
});

// ── Bank ↔ invoice matching (Wave 15) ────────────────────────────────────────
// Reconciliation was eyeballs and memory: a bank credit sat in the ledger, the invoice it
// paid sat in receivables, and a human held the join in their head — so the same receipt
// could be keyed twice, or never. Suggestions are scored, and applying one records the
// receipt through the SAME code path as a manual payment (lib/receipts.js), stamping
// provenance both ways so a credit can never be matched twice.
router.get("/match-suggestions", authenticate, async (req, res, next) => {
  try {
    const t = req.user.tenant_id;
    const { rows: credits } = await pool.query(
      `SELECT id, amount, description_raw, merchant_name, transaction_date FROM transactions
        WHERE tenant_id=$1 AND amount > 0 AND matched_invoice_id IS NULL
          AND transaction_date >= CURRENT_DATE - 90
        ORDER BY transaction_date DESC LIMIT 100`, [t]);
    const { rows: open } = await q(t,
      `SELECT id, invoice_number, customer_name, invoice_date, due_date,
              GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0), 0) AS outstanding
         FROM invoices
        WHERE tenant_id=$1 AND status NOT IN ('paid','cancelled') AND voided_at IS NULL
          AND GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0), 0) > 0`, [t]);

    const norm = (x) => String(x || "").toLowerCase();
    const suggestions = [];
    for (const c of credits) {
      const hay = norm(c.description_raw) + " " + norm(c.merchant_name);
      const amt = Number(c.amount);
      const cands = [];
      for (const i of open) {
        const out = Number(i.outstanding);
        let score = 0;
        const reasons = [];
        // The signals a human actually uses, in the order they trust them.
        if (hay.includes(norm(i.invoice_number))) { score += 60; reasons.push("narration quotes the invoice number"); }
        if (Math.abs(out - amt) < 0.01) { score += 30; reasons.push("amount matches the outstanding exactly"); }
        else if (out > 0 && Math.abs(out - amt) / out <= 0.02) { score += 15; reasons.push("amount within 2% of the outstanding"); }
        else if (amt < out) { score += 4; reasons.push("could be a part payment"); }
        const nameTokens = norm(i.customer_name).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
        if (nameTokens.some((w) => hay.includes(w))) { score += 20; reasons.push("narration mentions the customer"); }
        if (score >= 20) cands.push({ invoice_id: i.id, invoice_number: i.invoice_number, customer_name: i.customer_name, outstanding: out, score, reasons });
      }
      cands.sort((a, b) => b.score - a.score);
      if (cands.length) suggestions.push({
        transaction: { id: c.id, amount: amt, date: c.transaction_date, narration: c.merchant_name || c.description_raw },
        candidates: cands.slice(0, 3),
      });
    }
    suggestions.sort((a, b) => b.candidates[0].score - a.candidates[0].score);
    res.json({ suggestions, unmatched_credits: credits.length, open_invoices: open.length });
  } catch (e) { next(e); }
});

router.post("/:id([0-9a-fA-F-]{36})/match", authenticate, canWrite, idempotent(), async (req, res, next) => {
  const t = req.user.tenant_id;
  const invoiceId = req.body?.invoiceId;
  if (!invoiceId) return res.status(400).json({ error: "Say which invoice this credit pays (invoiceId)" });
  try {
    const outcome = await withTenantTx(t, async (client) => {
      const { rows: [txn] } = await client.query(
        "SELECT * FROM transactions WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [req.params.id, t]);
      if (!txn) throw Object.assign(new Error("Bank line not found"), { status: 404 });
      if (Number(txn.amount) <= 0) throw Object.assign(new Error("Only a credit (money in) can be matched to an invoice"), { status: 400 });
      if (txn.matched_invoice_id) throw Object.assign(new Error("This bank line is already matched — unmatch it first if that was wrong"), { status: 409 });

      // Cap at the invoice's outstanding: a credit larger than the balance still matches,
      // but only the balance is applied (the rest stays a plain bank line to deal with).
      const { rows: [inv0] } = await client.query(
        `SELECT GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0),0) AS outstanding
           FROM invoices WHERE id=$1 AND tenant_id=$2`, [invoiceId, t]);
      if (!inv0) throw Object.assign(new Error("Invoice not found"), { status: 404 });
      const applied = Math.min(Number(txn.amount), Number(inv0.outstanding));
      if (!(applied > 0)) throw Object.assign(new Error("Nothing is outstanding on that invoice"), { status: 400 });

      const rec = await recordReceiptTx(client, t, {
        invoiceId, amount: applied, mode: "bank",
        reference: (txn.merchant_name || txn.description_raw || "bank credit").slice(0, 120),
        receivedAt: txn.transaction_date, userId: req.user.id, transactionId: txn.id,
      });
      await client.query(
        "UPDATE transactions SET matched_invoice_id=$2, matched_payment_id=$3 WHERE id=$1", [txn.id, invoiceId, rec.pay.id]);
      return { ...rec, applied, txnAmount: Number(txn.amount) };
    });

    require("../lib/invoiceGl").postInvoiceReceipt(t, outcome.inv,
      { amount: outcome.pay.amount, ref: outcome.pay.reference, idempotencyKey: `recv:inv:${outcome.inv.id}:p:${outcome.pay.id}` }).catch(() => {});
    auditReq(req, "bank_matched", "invoice", invoiceId, { transaction: req.params.id, applied: outcome.applied });
    res.status(201).json({
      payment: outcome.pay, invoice: outcome.inv, applied: outcome.applied,
      note: outcome.applied < outcome.txnAmount
        ? `₹${(outcome.txnAmount - outcome.applied).toLocaleString("en-IN")} of this credit exceeded the invoice balance and stays unallocated.`
        : undefined,
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    if (e.code === "OVERPAYMENT" || e.code === "CANCELLED") return res.status(400).json({ error: e.message });
    next(e);
  }
});

// ── Import batches: see them, take one back (Wave 11) ────────────────────────
// A wrong-column CSV used to land hundreds of bad rows with no way to remove just that
// upload. Rollback deletes exactly the rows the batch created — already-deleted rows are
// simply gone, edited rows still carry the stamp and go with the batch (documented).
router.get("/imports", authenticate, async (req, res, next) => {
  try {
    const { rows } = await q(req.user.tenant_id,
      `SELECT b.*, u.email AS created_by_email FROM import_batches b
        LEFT JOIN users u ON u.id = b.created_by
       WHERE b.tenant_id=$1 AND b.entity='transactions' ORDER BY b.created_at DESC LIMIT 50`,
      [req.user.tenant_id]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post("/imports/:batchId/rollback", authenticate, canWrite, async (req, res, next) => {
  try {
    const out = await withTenantTx(req.user.tenant_id, async (c) => {
      const { rows: [b] } = await c.query(
        "SELECT * FROM import_batches WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [req.params.batchId, req.user.tenant_id]);
      if (!b) throw Object.assign(new Error("Import not found"), { status: 404 });
      if (b.rolled_back_at) throw Object.assign(new Error("That import was already rolled back"), { status: 409 });
      const del = await c.query(
        "DELETE FROM transactions WHERE tenant_id=$1 AND import_batch_id=$2", [req.user.tenant_id, b.id]);
      await c.query(
        "UPDATE import_batches SET rolled_back_at=now(), rolled_back_by=$3 WHERE id=$1 AND tenant_id=$2",
        [b.id, req.user.tenant_id, req.user.id]);
      return { removed: del.rowCount, batch: b.id, filename: b.filename };
    });
    auditReq(req, "import_rolled_back", "import_batch", req.params.batchId, out);
    res.json(out);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
