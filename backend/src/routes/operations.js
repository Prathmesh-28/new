const router   = require("express").Router();
const crypto   = require("crypto");
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const { normalise } = require("../lib/normalise");
const { validateSignature } = require("../lib/whatsapp");

// ── ORDERS ─────────────────────────────────────────────────────────────────────

// GET /api/operations/orders
router.get("/orders", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.*, COALESCE(json_agg(oi.*) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
     FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
     WHERE o.tenant_id=$1 GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200`,
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/operations/orders
router.post("/orders", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { buyer_name, buyer_phone, buyer_email, source = "manual", notes, items = [] } = req.body;
  if (!buyer_name) return res.status(400).json({ error: "buyer_name required" });

  const orderNum = `ORD-${Date.now().toString(36).toUpperCase()}`;
  const totalValue = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unit_price)), 0);

  const { rows: orderRows } = await pool.query(
    "INSERT INTO orders(tenant_id, order_number, source, buyer_name, buyer_phone, buyer_email, total_value, notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [req.user.tenant_id, orderNum, source, buyer_name, buyer_phone || null, buyer_email || null, totalValue, notes || null]
  );
  const order = orderRows[0];

  for (const item of items) {
    await pool.query(
      "INSERT INTO order_items(order_id, product_name, sku, quantity, unit_price) VALUES($1,$2,$3,$4,$5)",
      [order.id, item.product_name, item.sku || null, item.quantity, item.unit_price]
    );
  }

  res.status(201).json(order);
});

// PATCH /api/operations/orders/:id/status
router.patch("/orders/:id/status", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { status } = req.body;
  const valid = ["pending","confirmed","processing","dispatched","delivered","cancelled"];
  if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });

  const { rows } = await pool.query(
    "UPDATE orders SET status=$1, updated_at=now() WHERE id=$2 AND tenant_id=$3 RETURNING *",
    [status, req.params.id, req.user.tenant_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  // When confirmed → create a revenue transaction automatically
  if (status === "confirmed") {
    await pool.query(
      `INSERT INTO transactions(tenant_id, amount, description_raw, category, transaction_date, source)
       VALUES($1,$2,$3,'revenue',CURRENT_DATE,'operations') ON CONFLICT DO NOTHING`,
      [req.user.tenant_id, rows[0].total_value, `Order ${rows[0].order_number} - ${rows[0].buyer_name}`]
    );
  }

  res.json(rows[0]);
});

// DELETE /api/operations/orders/:id
router.delete("/orders/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  await pool.query("DELETE FROM orders WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

// ── INVENTORY ──────────────────────────────────────────────────────────────────

// GET /api/operations/inventory
router.get("/inventory", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM inventory WHERE tenant_id=$1 ORDER BY product_name",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/operations/inventory
router.post("/inventory", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { product_name, sku, category = "general", quantity = 0, unit = "units", unit_cost = 0, reorder_level = 10 } = req.body;
  if (!product_name) return res.status(400).json({ error: "product_name required" });

  const { rows } = await pool.query(
    `INSERT INTO inventory(tenant_id, product_name, sku, category, quantity, unit, unit_cost, reorder_level)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(tenant_id, product_name) DO UPDATE SET
       sku=$3, category=$4, quantity=$5, unit=$6, unit_cost=$7, reorder_level=$8, updated_at=now()
     RETURNING *`,
    [req.user.tenant_id, product_name, sku || null, category, quantity, unit, unit_cost, reorder_level]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/operations/inventory/:id
router.patch("/inventory/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { quantity, unit_cost, reorder_level } = req.body;
  const updates = []; const vals = []; let i = 1;
  if (quantity      !== undefined) { updates.push(`quantity=$${i++}`);      vals.push(quantity); }
  if (unit_cost     !== undefined) { updates.push(`unit_cost=$${i++}`);     vals.push(unit_cost); }
  if (reorder_level !== undefined) { updates.push(`reorder_level=$${i++}`); vals.push(reorder_level); }
  if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
  vals.push(req.params.id, req.user.tenant_id);
  const { rows } = await pool.query(
    `UPDATE inventory SET ${updates.join(",")}, updated_at=now() WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// DELETE /api/operations/inventory/:id
router.delete("/inventory/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  await pool.query("DELETE FROM inventory WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

// ── PROCUREMENT ────────────────────────────────────────────────────────────────

// GET /api/operations/procurement
router.get("/procurement", authenticate, async (req, res) => {
  const { rows: pos } = await pool.query(
    `SELECT po.*, COALESCE(json_agg(poi.*) FILTER (WHERE poi.id IS NOT NULL),'[]') AS items
     FROM procurement_orders po LEFT JOIN procurement_items poi ON poi.po_id=po.id
     WHERE po.tenant_id=$1 GROUP BY po.id ORDER BY po.created_at DESC`,
    [req.user.tenant_id]
  );

  // Low-stock suggestions
  const { rows: low } = await pool.query(
    "SELECT * FROM inventory WHERE tenant_id=$1 AND quantity <= reorder_level ORDER BY (reorder_level - quantity) DESC LIMIT 10",
    [req.user.tenant_id]
  );

  res.json({ orders: pos, suggestions: low });
});

// POST /api/operations/procurement
router.post("/procurement", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { supplier_name, expected_date, items = [] } = req.body;
  if (!supplier_name) return res.status(400).json({ error: "supplier_name required" });

  const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost), 0);
  const { rows: poRows } = await pool.query(
    "INSERT INTO procurement_orders(tenant_id, supplier_name, total_value, expected_date) VALUES($1,$2,$3,$4) RETURNING *",
    [req.user.tenant_id, supplier_name, total, expected_date || null]
  );
  const po = poRows[0];

  for (const item of items) {
    await pool.query(
      "INSERT INTO procurement_items(po_id, product_name, sku, quantity, unit_cost) VALUES($1,$2,$3,$4,$5)",
      [po.id, item.product_name, item.sku || null, item.quantity, item.unit_cost]
    );
  }

  res.status(201).json(po);
});

// PATCH /api/operations/procurement/:id/status
router.patch("/procurement/:id/status", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { status } = req.body;
  const valid = ["draft","approved","ordered","received","cancelled"];
  if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });

  const { rows } = await pool.query(
    "UPDATE procurement_orders SET status=$1, updated_at=now() WHERE id=$2 AND tenant_id=$3 RETURNING *",
    [status, req.params.id, req.user.tenant_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  // When received → create expense transaction + update inventory
  if (status === "received") {
    await pool.query(
      `INSERT INTO transactions(tenant_id, amount, description_raw, category, transaction_date, source)
       VALUES($1,$2,$3,'expense',CURRENT_DATE,'operations')`,
      [req.user.tenant_id, -Math.abs(rows[0].total_value), `Procurement from ${rows[0].supplier_name}`]
    );
    // Update inventory quantities
    const { rows: items } = await pool.query("SELECT * FROM procurement_items WHERE po_id=$1", [rows[0].id]);
    for (const item of items) {
      await pool.query(
        `UPDATE inventory SET quantity = quantity + $1, updated_at=now()
         WHERE tenant_id=$2 AND (product_name=$3 OR sku=$4)`,
        [item.quantity, req.user.tenant_id, item.product_name, item.sku]
      );
    }
  }

  res.json(rows[0]);
});

// ── WHATSAPP WEBHOOK ──────────────────────────────────────────────────────────
// POST /api/operations/whatsapp/webhook?tenant_id=… — Twilio push (order intake)
//
// SECURITY: this writes an order row scoped to the tenant_id in the query string,
// so it MUST NOT be callable anonymously (else anyone could inject orders into any
// company's books). We require a genuine, signature-verified Twilio request: only
// the tenant's own configured Twilio integration — which signs the exact webhook
// URL (incl. ?tenant_id=…) with that tenant's auth token — can produce a valid
// signature. If Twilio isn't configured at all, the endpoint stays closed.
router.post("/whatsapp/webhook", async (req, res) => {
  if (!process.env.TWILIO_AUTH_TOKEN || !validateSignature(req)) {
    return res.status(403).send("Forbidden");
  }
  const body = req.body;
  const tenant_id = req.query.tenant_id;
  if (!tenant_id) return res.status(400).send("tenant_id required");

  const from = body.From || body.from || "";
  const text = body.Body || body.text || body.message || "";

  if (text) {
    const amtMatch = text.match(/[\d,]+/g);
    const total = amtMatch ? parseInt(amtMatch[amtMatch.length - 1].replace(/,/g, ""), 10) : 0;
    await pool.query(
      "INSERT INTO orders(tenant_id, order_number, source, buyer_name, buyer_phone, total_value, notes) VALUES($1,$2,'whatsapp',$3,$4,$5,$6)",
      [tenant_id, `WA-${Date.now().toString(36).toUpperCase()}`, from, from, total, text]
    );
  }

  res.status(200).send("OK");
});

module.exports = router;
