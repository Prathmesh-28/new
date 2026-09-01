// Vendor master - /api/vendors. A real, persisted profile per vendor (GSTIN, PAN,
// payment terms, bank/UPI, MSME/Udyam) so vendor compliance & history travel with
// the record instead of being re-typed across the vendors tabs. Tenant-scoped.
const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const fc = require("../lib/fieldcrypto");
const listQuery = require("../lib/listQuery");
const trash = require("../lib/trash");
const { auditReq } = require("../lib/audit");

// Vendor PAN + bank account encrypted at rest (decrypted on read for authorised roles).
const VENDOR_PII = ["pan", "bank_account"];
const decV = (r) => fc.decryptFields(r, VENDOR_PII);
const encV = (v) => { const o = { ...v }; for (const f of VENDOR_PII) if (f in o) o[f] = fc.encrypt(o[f]); return o; };

const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "operations_manager"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });

router.use(authenticate);
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);

const FIELDS = ["name", "gstin", "pan", "contact_name", "phone", "email", "upi", "bank_account", "bank_ifsc", "payment_terms_days", "is_msme", "msme_category", "udyam", "udyam_registered_on", "udyam_doc_url", "category", "notes"];
const pick = (body) => {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
  return out;
};

// List vendors — paged, sorted and searchable via the shared list contract. It used to
// return EVERY vendor with no search and no ordering beyond name, so a firm with a few
// hundred suppliers had to scroll.
//
// `?all=1` keeps the old whole-set shape for the pages that still aggregate over it.
router.get("/", async (req, res, next) => {
  try {
    const tenantId = tenantOf(req);
    const parsed = listQuery.parseList(req, {
      sortable: ["name", "created_at", "payment_terms_days", "category"],
      defaultSort: "name", defaultOrder: "asc",
      // pan and bank_account are encrypted at rest, so they are deliberately NOT
      // searchable — an ILIKE against ciphertext would silently match nothing.
      searchable: ["name", "gstin", "email", "phone", "contact_name", "category"],
    });
    const vals = [tenantId];
    const conditions = ["tenant_id = $1"];
    if (req.query.msme === "1") conditions.push("is_msme = true");
    if (req.query.category) { vals.push(String(req.query.category)); conditions.push(`category = $${vals.length}`); }
    const srch = listQuery.search(parsed, "", vals.length + 1);
    if (srch.clause) { conditions.push(srch.clause); vals.push(...srch.params); }
    const where = conditions.join(" AND ");
    const page = listQuery.paginate(parsed, vals.length + 1);

    const [data, count] = await Promise.all([
      pool.query(`SELECT * FROM vendor_master WHERE ${where} ${listQuery.orderBy(parsed)} ${page.clause}`, [...vals, ...page.params]),
      pool.query(`SELECT count(*)::int AS n FROM vendor_master WHERE ${where}`, vals),
    ]);
    const rows = data.rows.map(decV);
    // Legacy callers asked for a bare array; keep that shape for ?all=1 only.
    if (parsed.all) return res.json(rows);
    res.json(listQuery.envelope(rows, count.rows[0].n, parsed));
  } catch (e) { next(e); }
});

// GET /api/vendors/:id — one vendor, with what we've bought from them and what's owed.
router.get("/:id([0-9a-fA-F-]{36})", async (req, res, next) => {
  try {
    const tenantId = tenantOf(req);
    const { rows } = await pool.query("SELECT * FROM vendor_master WHERE id=$1 AND tenant_id=$2", [req.params.id, tenantId]);
    if (!rows[0]) return res.status(404).json({ error: "Vendor not found" });
    const vendor = decV(rows[0]);

    // Purchase history = PURCHASE vouchers on this vendor's ledger — the same source the
    // AP ageing uses (modules/vendorBills), so this page and the books cannot disagree.
    // (Wave 8 shipped this against a vendor_bills table that doesn't exist; the try/catch
    // hid it and every vendor showed zero history. Fixed to the real source.)
    let bills = [], totals = { outstanding: 0, billed: 0, count: 0 };
    try {
      const raw = await require("../modules/vendorBills").listBills(tenantId, vendor.id);
      bills = raw.slice(0, 25).map((b) => ({
        id: b.id, bill_number: b.voucher_number, bill_date: b.voucher_date,
        total_amount: b.gross, paid_amount: b.allocated,
        status: b.is_cancelled ? "cancelled" : (Number(b.gross) - Number(b.allocated) <= 0.005 ? "paid" : "open"),
        due_date: null,
      }));
      const live = raw.filter((b) => !b.is_cancelled);
      totals = {
        outstanding: Math.round(live.reduce((s, b) => s + Math.max(0, Number(b.gross) - Number(b.allocated)), 0) * 100) / 100,
        billed: Math.round(live.reduce((s, b) => s + Number(b.gross), 0) * 100) / 100,
        count: live.length,
      };
    } catch { /* vendor never billed via the books → empty history is the truth */ }

    res.json({ ...vendor, bills, ...totals });
  } catch (e) { next(e); }
});

// Create a vendor (owner/admin).
router.post("/", canWrite, async (req, res) => {
  try {
    const v = encV(pick(req.body || {}));
    if (!v.name) return res.status(400).json({ error: "Vendor name is required" });
    const cols = Object.keys(v);
    const vals = cols.map((_, i) => `$${i + 2}`);
    const { rows } = await pool.query(
      `INSERT INTO vendor_master (tenant_id, ${cols.join(", ")}) VALUES ($1, ${vals.join(", ")})
       ON CONFLICT (tenant_id, name) DO UPDATE SET ${cols.map(c => `${c}=EXCLUDED.${c}`).join(", ")}, updated_at=now()
       RETURNING *`,
      [tenantOf(req), ...cols.map(c => v[c])]
    );
    res.status(201).json(decV(rows[0]));
  } catch (e) { console.error("[vendors]", e.message); res.status(500).json({ error: "Internal error" }); }
});

// Update a vendor (owner/admin).
router.patch("/:id", canWrite, async (req, res) => {
  try {
    const v = encV(pick(req.body || {}));
    const cols = Object.keys(v);
    if (cols.length === 0) return res.status(400).json({ error: "Nothing to update" });
    const sets = cols.map((c, i) => `${c}=$${i + 3}`);
    const { rows } = await pool.query(
      `UPDATE vendor_master SET ${sets.join(", ")}, updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, tenantOf(req), ...cols.map(c => v[c])]
    );
    if (!rows[0]) return res.status(404).json({ error: "Vendor not found" });
    res.json(decV(rows[0]));
  } catch (e) { console.error("[vendors]", e.message); res.status(500).json({ error: "Internal error" }); }
});

// Delete a vendor (owner/admin) — into the 30-day bin. It also used to answer {ok:true}
// for an id that never existed, so a mistyped delete looked like it had worked.
router.delete("/:id", canWrite, async (req, res, next) => {
  try {
    const out = await trash.softDelete(tenantOf(req), "vendor", req.params.id, req.user.id);
    auditReq(req, "deleted", "vendor", req.params.id, { label: out.label });
    res.json({ ok: true, trashId: out.trashId, label: out.label });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: "Vendor not found" });
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// ── Vendor portal link (Wave 16) ─────────────────────────────────────────────
// Same contract as the customer portal on the customers route: token shown once, stored
// hashed, one live link per vendor, replace supersedes, revoke kills immediately.
router.get("/:id/portal-link", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, token_hint, expires_at, view_count, last_viewed_at, created_at
         FROM vendor_portal_links WHERE tenant_id=$1 AND vendor_id=$2 AND revoked_at IS NULL`,
      [tenantOf(req), req.params.id]);
    res.json(rows[0] || null);
  } catch (e) { next(e); }
});

router.post("/:id/portal-link", canWrite, async (req, res, next) => {
  try {
    const tenantId = tenantOf(req);
    const { rows: [v] } = await pool.query("SELECT id, name FROM vendor_master WHERE id=$1 AND tenant_id=$2", [req.params.id, tenantId]);
    if (!v) return res.status(404).json({ error: "Vendor not found" });
    const token = require("crypto").randomBytes(24).toString("base64url");
    const days = Math.min(365, Math.max(1, parseInt(req.body?.expiresInDays, 10) || 90));
    await pool.query("UPDATE vendor_portal_links SET revoked_at=now() WHERE tenant_id=$1 AND vendor_id=$2 AND revoked_at IS NULL", [tenantId, v.id]);
    const { hashToken } = require("./portal");
    const { rows } = await pool.query(
      `INSERT INTO vendor_portal_links(tenant_id, vendor_id, token_hash, token_hint, expires_at, created_by)
       VALUES($1,$2,$3,$4, now() + ($5 || ' days')::interval, $6)
       RETURNING id, token_hint, expires_at, created_at`,
      [tenantId, v.id, hashToken(token), token.slice(-4), String(days), req.user.id]);
    auditReq(req, "vendor_portal_link_created", "vendor", v.id, { expiresInDays: days });
    res.status(201).json({ ...rows[0], token, path: `/vendor-portal/${token}` });
  } catch (e) { next(e); }
});

router.delete("/:id/portal-link", canWrite, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE vendor_portal_links SET revoked_at=now() WHERE tenant_id=$1 AND vendor_id=$2 AND revoked_at IS NULL",
      [tenantOf(req), req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "There's no live link to turn off" });
    auditReq(req, "vendor_portal_link_revoked", "vendor", req.params.id, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
