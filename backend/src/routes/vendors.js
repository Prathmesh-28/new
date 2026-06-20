// Vendor master — /api/vendors. A real, persisted profile per vendor (GSTIN, PAN,
// payment terms, bank/UPI, MSME/Udyam) so vendor compliance & history travel with
// the record instead of being re-typed across the vendors tabs. Tenant-scoped.
const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");

router.use(authenticate);
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);

const FIELDS = ["name", "gstin", "pan", "contact_name", "phone", "email", "upi", "bank_account", "bank_ifsc", "payment_terms_days", "is_msme", "udyam", "category", "notes"];
const pick = (body) => {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
  return out;
};

// List all vendors for the tenant.
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM vendor_master WHERE tenant_id=$1 ORDER BY name", [tenantOf(req)]);
    res.json(rows);
  } catch (e) { console.error("[vendors]", e.message); res.status(500).json({ error: "Internal error" }); }
});

// Create a vendor (owner/admin).
router.post("/", requireOwnerOrAdmin, async (req, res) => {
  try {
    const v = pick(req.body || {});
    if (!v.name) return res.status(400).json({ error: "Vendor name is required" });
    const cols = Object.keys(v);
    const vals = cols.map((_, i) => `$${i + 2}`);
    const { rows } = await pool.query(
      `INSERT INTO vendor_master (tenant_id, ${cols.join(", ")}) VALUES ($1, ${vals.join(", ")})
       ON CONFLICT (tenant_id, name) DO UPDATE SET ${cols.map(c => `${c}=EXCLUDED.${c}`).join(", ")}, updated_at=now()
       RETURNING *`,
      [tenantOf(req), ...cols.map(c => v[c])]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error("[vendors]", e.message); res.status(500).json({ error: "Internal error" }); }
});

// Update a vendor (owner/admin).
router.patch("/:id", requireOwnerOrAdmin, async (req, res) => {
  try {
    const v = pick(req.body || {});
    const cols = Object.keys(v);
    if (cols.length === 0) return res.status(400).json({ error: "Nothing to update" });
    const sets = cols.map((c, i) => `${c}=$${i + 3}`);
    const { rows } = await pool.query(
      `UPDATE vendor_master SET ${sets.join(", ")}, updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, tenantOf(req), ...cols.map(c => v[c])]
    );
    if (!rows[0]) return res.status(404).json({ error: "Vendor not found" });
    res.json(rows[0]);
  } catch (e) { console.error("[vendors]", e.message); res.status(500).json({ error: "Internal error" }); }
});

// Delete a vendor (owner/admin).
router.delete("/:id", requireOwnerOrAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM vendor_master WHERE id=$1 AND tenant_id=$2", [req.params.id, tenantOf(req)]);
    res.json({ ok: true });
  } catch (e) { console.error("[vendors]", e.message); res.status(500).json({ error: "Internal error" }); }
});

module.exports = router;
