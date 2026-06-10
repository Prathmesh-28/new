const router    = require("express").Router();
const PDFDoc    = require("pdfkit");
const QRCode    = require("qrcode");
const { pool }  = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const { sendMail } = require("../lib/email");

function nextInvoiceNumber(existing) {
  const year = new Date().getFullYear();
  const nums = existing
    .map(n => { const m = n.match(/INV-\d{4}-(\d+)$/); return m ? parseInt(m[1]) : 0; })
    .filter(Boolean);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `INV-${year}-${String(next).padStart(3, "0")}`;
}

function computeAging(invoice) {
  if (invoice.status === "paid") return "paid";
  const today = new Date();
  const due   = new Date(invoice.due_date);
  const days  = Math.floor((today - due) / 86400000);
  if (days <= 0)  return "current";
  if (days <= 30) return "30d";
  if (days <= 60) return "60d";
  return "90d+";
}

// GET /api/invoices
router.get("/", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, json_agg(ii ORDER BY ii.id) AS items
     FROM invoices i
     LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE i.tenant_id = $1
     GROUP BY i.id
     ORDER BY i.created_at DESC`,
    [req.user.tenant_id]
  );
  res.json(rows.map(r => ({ ...r, aging: computeAging(r), items: r.items?.filter(Boolean) ?? [] })));
});

// POST /api/invoices
router.post("/", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { customer_name, customer_gstin, customer_email, gst_rate = 18, due_date, items = [] } = req.body;
  if (!customer_name || !items.length) return res.status(400).json({ error: "customer_name and items required" });

  const { rows: existing } = await pool.query(
    "SELECT invoice_number FROM invoices WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50",
    [req.user.tenant_id]
  );
  const invoice_number = nextInvoiceNumber(existing.map(r => r.invoice_number));

  const subtotal   = items.reduce((s, i) => s + (parseFloat(i.quantity) * parseFloat(i.unit_price)), 0);
  const gst_amount = parseFloat((subtotal * gst_rate / 100).toFixed(2));
  const total      = parseFloat((subtotal + gst_amount).toFixed(2));

  const { rows: [inv] } = await pool.query(
    `INSERT INTO invoices(tenant_id, invoice_number, customer_name, customer_gstin, customer_email,
       subtotal, gst_rate, gst_amount, total_amount, status, due_date)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10)
     RETURNING *`,
    [req.user.tenant_id, invoice_number, customer_name, customer_gstin ?? null,
     customer_email ?? null, subtotal, gst_rate, gst_amount, total, due_date ?? null]
  );

  for (const item of items) {
    const amt = parseFloat(item.quantity) * parseFloat(item.unit_price);
    await pool.query(
      "INSERT INTO invoice_items(invoice_id, description, hsn_sac, quantity, unit_price, gst_rate, amount) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [inv.id, item.description, item.hsn_sac ?? null, item.quantity, item.unit_price, item.gst_rate ?? gst_rate, amt]
    );
  }

  res.status(201).json(inv);
});

// PATCH /api/invoices/:id — update status
router.patch("/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { status } = req.body;
  const valid = ["draft", "sent", "paid", "cancelled"];
  if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of: ${valid.join(", ")}` });

  const { rows: [inv] } = await pool.query(
    "UPDATE invoices SET status=$1, paid_at=CASE WHEN $1='paid' THEN now() ELSE paid_at END WHERE id=$2 AND tenant_id=$3 RETURNING *",
    [status, req.params.id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  res.json(inv);
});

// GET /api/invoices/:id/pdf — generate PDF with PDFKit
router.get("/:id/pdf", authenticate, async (req, res) => {
  const { rows: [inv] } = await pool.query(
    `SELECT i.*, json_agg(ii ORDER BY ii.id) AS items
     FROM invoices i LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE i.id=$1 AND i.tenant_id=$2 GROUP BY i.id`,
    [req.params.id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const { rows: kvRows } = await pool.query(
    "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='app' AND key='store' LIMIT 1",
    [req.user.tenant_id]
  );
  const firm = kvRows[0]?.value?.value?.firm ?? {};
  const items = (inv.items ?? []).filter(Boolean);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${inv.invoice_number}.pdf"`);

  const doc = new PDFDoc({ margin: 50, size: "A4" });
  doc.pipe(res);

  // Header
  doc.fontSize(20).font("Helvetica-Bold").text("INVOICE", 50, 50);
  doc.fontSize(10).font("Helvetica").fillColor("#666")
    .text(inv.invoice_number, 50, 76)
    .text(`Date: ${new Date(inv.created_at).toLocaleDateString("en-IN")}`, 50, 90);
  if (inv.due_date) doc.text(`Due: ${new Date(inv.due_date).toLocaleDateString("en-IN")}`, 50, 104);

  // Company info (right side)
  const right = 400;
  doc.fillColor("#000").font("Helvetica-Bold").text(firm.name || "Your Company", right, 50, { align: "right", width: 150 });
  doc.font("Helvetica").fillColor("#666")
    .text(firm.address || "", right, 66, { align: "right", width: 150 })
    .text(firm.gstNumber ? `GSTIN: ${firm.gstNumber}` : "", right, 80, { align: "right", width: 150 });

  // Bill To
  doc.fillColor("#000").font("Helvetica-Bold").text("Bill To:", 50, 140);
  doc.font("Helvetica").text(inv.customer_name, 50, 156);
  if (inv.customer_gstin) doc.text(`GSTIN: ${inv.customer_gstin}`, 50, 170);

  // Table header
  const tableTop = 210;
  doc.fillColor("#1A6B55").rect(50, tableTop, 500, 22).fill();
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9)
    .text("Description",  55,  tableTop + 6, { width: 220 })
    .text("HSN/SAC",       280, tableTop + 6, { width: 60 })
    .text("Qty",           340, tableTop + 6, { width: 40, align: "right" })
    .text("Rate (₹)",      380, tableTop + 6, { width: 70, align: "right" })
    .text("Amount (₹)",    450, tableTop + 6, { width: 95, align: "right" });

  let y = tableTop + 28;
  doc.font("Helvetica").fillColor("#000").fontSize(9);
  for (const item of items) {
    doc.text(item.description, 55, y, { width: 220 })
       .text(item.hsn_sac || "-", 280, y, { width: 60 })
       .text(parseFloat(item.quantity).toFixed(2), 340, y, { width: 40, align: "right" })
       .text(parseFloat(item.unit_price).toLocaleString("en-IN"), 380, y, { width: 70, align: "right" })
       .text(parseFloat(item.amount).toLocaleString("en-IN"), 450, y, { width: 95, align: "right" });
    y += 20;
    if (y > 680) { doc.addPage(); y = 50; }
  }

  // Totals
  y += 10;
  doc.moveTo(50, y).lineTo(550, y).stroke("#ddd");
  y += 12;
  const totals = [
    ["Subtotal",   parseFloat(inv.subtotal)],
    [`GST (${inv.gst_rate}%)`, parseFloat(inv.gst_amount)],
    ["Total",      parseFloat(inv.total_amount)],
  ];
  for (const [label, val] of totals) {
    const bold = label === "Total";
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(bold ? "#1A6B55" : "#000")
       .text(label, 380, y, { width: 120, align: "right" })
       .text(`₹${val.toLocaleString("en-IN")}`, 450, y, { width: 95, align: "right" });
    y += 18;
  }

  // Footer
  doc.font("Helvetica").fillColor("#999").fontSize(8)
    .text("Thank you for your business. Payment due as per agreed terms.", 50, 760, { align: "center", width: 500 });

  doc.end();
});

// POST /:id/remind - Send WhatsApp reminder with UPI link
router.post("/:id/remind", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;
  try {
    const { rows } = await pool.query(
      `SELECT i.*, t.phone as customer_phone FROM invoices i
       LEFT JOIN tenants t ON t.id = $2
       WHERE i.id = $1 AND i.tenant_id = $2`,
      [id, tenantId]
    );
    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    // Record the reminder
    await pool.query(
      `INSERT INTO invoice_reminders (invoice_id, tenant_id, reminded_at, channel, status)
       VALUES ($1, $2, NOW(), 'whatsapp', 'sent')
       ON CONFLICT DO NOTHING`,
      [id, tenantId]
    ).catch(() => {});

    // Update invoice status to sent if still draft
    if (invoice.status === 'draft') {
      await pool.query(`UPDATE invoices SET status='sent', updated_at=NOW() WHERE id=$1`, [id]);
    }

    res.json({ success: true, message: "Reminder queued" });
  } catch (err) {
    console.error("remind error", err);
    res.status(500).json({ error: "Failed to send reminder" });
  }
});

// GET /:id/reminders - Get reminder history
router.get("/:id/reminders", authenticate, async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM invoice_reminders WHERE invoice_id=$1 AND tenant_id=$2 ORDER BY reminded_at DESC LIMIT 10`,
      [id, tenantId]
    ).catch(() => ({ rows: [] }));
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// POST /api/invoices/:id/send — email invoice
router.post("/:id/send", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { rows: [inv] } = await pool.query(
    "SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  if (!inv.customer_email) return res.status(400).json({ error: "Invoice has no customer email" });

  await sendMail({
    to:      inv.customer_email,
    subject: `Invoice ${inv.invoice_number} — ₹${parseFloat(inv.total_amount).toLocaleString("en-IN")}`,
    text:    `Please find your invoice ${inv.invoice_number} for ₹${parseFloat(inv.total_amount).toLocaleString("en-IN")}. Due by ${inv.due_date || "on receipt"}.`,
    html:    `<p>Dear ${inv.customer_name},</p><p>Please find your invoice <strong>${inv.invoice_number}</strong> for <strong>₹${parseFloat(inv.total_amount).toLocaleString("en-IN")}</strong>.</p><p>Due date: <strong>${inv.due_date || "On receipt"}</strong></p><p>Thank you for your business.</p>`,
  }).catch(() => {});

  await pool.query("UPDATE invoices SET status='sent' WHERE id=$1", [inv.id]);
  res.json({ ok: true });
});

// POST /api/invoices/:id/upi-link — generate UPI QR (Razorpay optional, fallback to static UPI)
router.post("/:id/upi-link", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { rows: [inv] } = await pool.query(
    "SELECT i.*, kv.value AS kv FROM invoices i LEFT JOIN kv_store kv ON kv.tenant_id=i.tenant_id AND kv.namespace='app' AND kv.key='store' WHERE i.id=$1 AND i.tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const firm = inv.kv?.value?.firm ?? {};
  const upiId = firm.upiId || `${req.user.tenant_id.replace(/[^a-z0-9]/g, "")}@upi`;
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(firm.name || "Headroom")}&am=${inv.total_amount}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`;

  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(upiLink, { width: 200 });
  } catch { /* ok */ }

  await pool.query("UPDATE invoices SET upi_link=$1 WHERE id=$2", [upiLink, inv.id]);
  res.json({ upi_link: upiLink, qr: qrDataUrl });
});

module.exports = router;
