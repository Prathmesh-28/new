const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

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

  if (req.query.category)   { conditions.push(`t.category=$${p++}`);          vals.push(req.query.category); }
  if (req.query.account_id) { conditions.push(`t.bank_account_id=$${p++}`);   vals.push(req.query.account_id); }
  if (req.query.from)       { conditions.push(`t.transaction_date>=$${p++}`); vals.push(req.query.from); }
  if (req.query.to)         { conditions.push(`t.transaction_date<=$${p++}`); vals.push(req.query.to); }
  if (req.query.q)          { conditions.push(`(t.description_raw ILIKE $${p} OR t.merchant_name ILIKE $${p})`); vals.push(`%${req.query.q}%`); p++; }

  const where = conditions.join(" AND ");

  const [dataRes, countRes] = await Promise.all([
    pool.query(
      `SELECT t.*, b.account_name FROM transactions t LEFT JOIN bank_accounts b ON b.id=t.bank_account_id
       WHERE ${where} ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT $${p} OFFSET $${p+1}`,
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

// POST /api/transactions - manual entry or bulk import
router.post("/", authenticate, canWrite, async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const inserted = [];

  for (const t of items) {
    const { bank_account_id, amount, description_raw, merchant_name, category = "uncategorized", transaction_date, source = "manual", is_recurring = false, recurrence_cadence } = t;
    if (!amount || !transaction_date) continue;

    const { rows } = await pool.query(
      `INSERT INTO transactions(tenant_id, bank_account_id, amount, description_raw, merchant_name, category, is_recurring, recurrence_cadence, transaction_date, source)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.tenant_id, bank_account_id || null, amount, description_raw || null, merchant_name || null, category, is_recurring, recurrence_cadence || null, transaction_date, source]
    );
    inserted.push(rows[0]);
  }

  // Fire a transaction.created event ONLY for a single manual add (never on bulk import, to
  // avoid flooding the Flows engine). Powers automation rules that watch new transactions.
  if (items.length === 1 && inserted[0]) {
    const t = inserted[0];
    require("../modules/flows/runner").emitEvent(req.user.tenant_id, "transaction.created", {
      transaction: { amount: Number(t.amount), category: t.category, counterparty: t.merchant_name || "", description: t.description_raw || "" },
    }).catch(() => {});
  }

  res.status(201).json(inserted.length === 1 ? inserted[0] : inserted);
});

// PATCH /api/transactions/:id - update category, merchant etc.
router.patch("/:id", authenticate, canWrite, async (req, res) => {
  const { category, merchant_name, is_recurring, recurrence_cadence } = req.body;

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

// DELETE /api/transactions/:id
router.delete("/:id", authenticate, canWrite, async (req, res) => {
  const { rowCount } = await pool.query(
    "DELETE FROM transactions WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!rowCount) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

module.exports = router;
