const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const trash = require("../lib/trash");
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
      `INSERT INTO transactions(tenant_id, bank_account_id, amount, description_raw, merchant_name, category, is_recurring, recurrence_cadence, transaction_date, source)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.tenant_id, asBankAccountId(bank_account_id), amount, description_raw || null, merchant_name || null, category, is_recurring, recurrence_cadence || null, transaction_date, source]
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

  if (isBulk) return res.status(201).json({ inserted, skipped_duplicates: skippedDuplicates, skipped_errors: skippedErrors });
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
         FROM transactions t LEFT JOIN bank_accounts b ON b.id = t.bank_account_id
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

module.exports = router;
