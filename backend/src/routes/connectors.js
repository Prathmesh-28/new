const router    = require("express").Router();
const { pool }  = require("../db");
const { authenticate } = require("../middleware/auth");
const { normaliseMany } = require("../lib/normalise");

const WRITE_ROLES = ["super_admin", "owner", "finance_manager"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });

// GET /api/connectors
router.get("/", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM connector_consents WHERE tenant_id=$1 ORDER BY created_at",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/connectors
router.post("/", authenticate, canWrite, async (req, res) => {
  const { provider, account_name = "", consent_id, access_token, consent_expiry } = req.body;
  if (!provider) return res.status(400).json({ error: "provider required" });

  const { rows } = await pool.query(
    `INSERT INTO connector_consents
       (tenant_id, provider, account_name, status, consent_id, access_token, consent_expiry)
     VALUES($1,$2,$3,'pending',$4,$5,$6)
     ON CONFLICT(tenant_id, provider, account_name) DO UPDATE SET
       status        = EXCLUDED.status,
       consent_id    = COALESCE(EXCLUDED.consent_id,    connector_consents.consent_id),
       access_token  = COALESCE(EXCLUDED.access_token,  connector_consents.access_token),
       consent_expiry= COALESCE(EXCLUDED.consent_expiry,connector_consents.consent_expiry)
     RETURNING *`,
    [req.user.tenant_id, provider, account_name, consent_id ?? null, access_token ?? null, consent_expiry ?? null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/connectors/:id
router.patch("/:id", authenticate, canWrite, async (req, res) => {
  const { status, account_count } = req.body;
  const updates = []; const vals = []; let i = 1;
  if (status        !== undefined) { updates.push(`status=$${i++}`);        vals.push(status); }
  if (account_count !== undefined) { updates.push(`account_count=$${i++}`); vals.push(account_count); }
  if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
  vals.push(req.params.id, req.user.tenant_id);
  const { rows } = await pool.query(
    `UPDATE connector_consents SET ${updates.join(",")}, last_sync=now() WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// DELETE /api/connectors/:id
router.delete("/:id", authenticate, canWrite, async (req, res) => {
  await pool.query("DELETE FROM connector_consents WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

// POST /api/connectors/:id/sync - trigger provider sync
router.post("/:id/sync", authenticate, canWrite, async (req, res) => {
  const { rows: c } = await pool.query(
    "SELECT * FROM connector_consents WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!c[0]) return res.status(404).json({ error: "Not found" });

  switch (c[0].provider) {
    case "finbox":
      if (!process.env.FINBOX_API_KEY) return res.status(503).json({ error: "Set FINBOX_API_KEY to enable Finbox sync" });
      break;
    case "aa_network":
      if (!process.env.AA_CLIENT_ID) return res.status(503).json({ error: "Set AA_CLIENT_ID to enable Account Aggregator sync" });
      break;
    case "tally":
      // Tally pushes via webhook; this just marks last_sync
      break;
    case "zoho_books":
      if (!process.env.ZOHO_CLIENT_ID) return res.status(503).json({ error: "Set ZOHO_CLIENT_ID to enable Zoho sync" });
      break;
    case "quickbooks":
      if (!process.env.QB_CLIENT_ID) return res.status(503).json({ error: "Set QB_CLIENT_ID to enable QuickBooks sync" });
      break;
    default:
      break;
  }

  await pool.query(
    "UPDATE connector_consents SET last_sync=now(), status='connected' WHERE id=$1",
    [c[0].id]
  );
  res.json({ ok: true, synced: 0 });
});

// POST /api/connectors/normalise - normalise a batch of raw transactions
router.post("/normalise", authenticate, (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ error: "transactions array required" });
  res.json(normaliseMany(transactions));
});

// Constant-time secret check for the unauthenticated Tally push endpoint.
// Fails CLOSED: if no secret is configured the endpoint is disabled entirely,
// so it can never be left wide open in production.
const crypto = require("crypto");
function tallyAuthorised(req) {
  const expected = process.env.TALLY_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = String(req.headers["x-tally-secret"] || "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// POST /api/connectors/tally/webhook - Tally sync push (shared-secret protected)
router.post("/tally/webhook", async (req, res) => {
  if (!tallyAuthorised(req)) {
    return res.status(process.env.TALLY_WEBHOOK_SECRET ? 401 : 503)
      .json({ error: process.env.TALLY_WEBHOOK_SECRET ? "Invalid Tally webhook secret" : "Tally webhook not configured" });
  }
  const { tenant_id, transactions: txns } = req.body;
  if (!tenant_id || !Array.isArray(txns)) return res.status(400).json({ error: "tenant_id and transactions required" });

  const normalised = normaliseMany(txns);
  let imported = 0;
  for (const t of normalised) {
    const date = t.date || t.transaction_date || new Date().toISOString().slice(0, 10);
    const desc = t.description || t.description_raw || "";
    // Idempotency key: prefer a real Tally voucher id; else a deterministic hash
    // of the voucher's natural key so re-syncing the same data is a no-op.
    const extId = String(
      t.external_id || t.voucher_id || t.guid || t.id ||
      crypto.createHash("sha1").update(`${date}|${t.amount}|${desc}`).digest("hex")
    );
    const { rowCount } = await pool.query(
      `INSERT INTO transactions(tenant_id, amount, description_raw, merchant_name, category, transaction_date, source, external_id)
       VALUES($1,$2,$3,$4,$5,$6,'tally',$7)
       ON CONFLICT (tenant_id, source, external_id) DO NOTHING`,
      [tenant_id, t.amount, desc, t.merchant_name, t.category, date, extId]
    );
    imported += rowCount;
  }
  await pool.query(
    "UPDATE connector_consents SET last_sync=now(), status='connected' WHERE tenant_id=$1 AND provider='tally'",
    [tenant_id]
  );
  res.json({ ok: true, received: normalised.length, imported });
});

module.exports = router;
