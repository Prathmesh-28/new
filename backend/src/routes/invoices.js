const router    = require("express").Router();
const PDFDoc    = require("pdfkit");
const QRCode    = require("qrcode");
const { pool }  = require("../db");
const { q, withTenant } = require("../lib/tenantDb"); // invoices is FORCE-RLS (0015) — its access MUST set the tenant GUC
const { authenticate } = require("../middleware/auth");
const { sendMail } = require("../lib/email");
const { sendWhatsApp } = require("../lib/whatsapp");
const platformConfig = require("../lib/platformConfig");

const { round2, applyReceipt, remainingToSettle, effectiveTotal, creditableBalance } = require("../lib/invoicePaymentMath");
const { taxSplit } = require("../lib/gstInvoice");

const WRITE_ROLES = ["super_admin","owner","finance_manager","accountant","sales"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });
// Payment modes accepted on a receipt. Kept small + closed so the mode column stays reportable.
const PAY_MODES = new Set(["cash", "upi", "bank", "neft", "cheque", "card", "other"]);

// The SMB's own firm name - so a reminder a CUSTOMER receives is signed by the
// business, not the logged-in user's display name or a generic "your supplier".
async function firmNameOf(tenantId) {
  try {
    const { rows } = await pool.query("SELECT value FROM kv_store WHERE tenant_id=$1 AND key='store'", [tenantId]);
    for (const r of rows) { const n = r.value?.value?.firm?.name; if (n) return n; }
  } catch { /* fall through */ }
  return null;
}

const { createInvoiceTx } = require("../lib/invoiceCreate"); // shared with the recurring-invoice cron

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
  const { rows } = await q(req.user.tenant_id,
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
router.post("/", authenticate, canWrite, async (req, res) => {
  const { customer_name, customer_gstin, customer_email, customer_phone, gst_rate = 18, due_date, items = [] } = req.body;
  if (!customer_name || !items.length) return res.status(400).json({ error: "customer_name and items required" });

  // One tenant-scoped transaction (RLS GUC set once): next-number read + invoice insert +
  // line items — atomic, via the factory shared with the recurring-invoice cron.
  const inv = await withTenant(req.user.tenant_id, (client) =>
    createInvoiceTx(client, req.user.tenant_id, { customer_name, customer_gstin, customer_email, customer_phone, gst_rate, due_date, items })
  );

  require("../modules/flows/runner").emitEvent(req.user.tenant_id, "invoice.created", { invoice: inv }).catch(() => {});
  require("../modules/analytics").track(req.user.tenant_id, req.user.id, { event: "invoice_created", props: { total: Number(inv.total_amount) } }).catch(() => {});
  res.status(201).json(inv);
});

// PATCH /api/invoices/:id - update status
router.patch("/:id", authenticate, canWrite, async (req, res) => {
  const { status } = req.body;
  const valid = ["draft", "sent", "paid", "cancelled"];
  if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of: ${valid.join(", ")}` });
  const tenantId = req.user.tenant_id;

  // Marking paid must settle only the OUTSTANDING balance (partial receipts may already be
  // booked) and must be a no-op on an already-paid invoice — otherwise the settling receipt
  // double-posts against those partials or against a historical full receipt.
  if (status === "paid") {
    let outcome;
    try {
      outcome = await withTenant(tenantId, async (client) => {
      const { rows: [cur] } = await client.query("SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [req.params.id, tenantId]);
      if (!cur) return { notFound: true };
      if (cur.status === "paid") return { inv: cur, already: true }; // idempotent: nothing left to post
      const remaining = remainingToSettle({ total: cur.total_amount, paidAmount: cur.paid_amount || 0, creditedAmount: cur.credited_amount || 0 });
      // Record the settling remainder as a receipt so sum(invoice_payments)==paid_amount holds.
      // Strict > 0: amounts are paise-quantized, so even a 1-paise residual gets a settling
      // receipt — otherwise the GL debtor keeps an uncleared residual on a "paid" invoice.
      let settle = null;
      if (remaining > 0) {
        const { rows: [p] } = await client.query(
          "INSERT INTO invoice_payments(tenant_id, invoice_id, amount, mode, reference, created_by) VALUES($1,$2,$3,'other','Marked paid',$4) RETURNING *",
          [tenantId, cur.id, remaining, req.user.id || null]);
        settle = p;
      }
      const { rows: [upd] } = await client.query(
        // Paid means the customer settled the EFFECTIVE total (net of credit notes) — never
        // claim more cash was received than was actually collectible.
        "UPDATE invoices SET status='paid', paid_at=now(), paid_amount=total_amount-credited_amount WHERE id=$1 AND tenant_id=$2 RETURNING *",
        [cur.id, tenantId]);
      return { inv: upd, settle, remaining };
      });
    } catch (e) { console.error("[invoices] mark paid failed:", e.message); return res.status(500).json({ error: "Internal error" }); }
    if (outcome.notFound) return res.status(404).json({ error: "Invoice not found" });
    if (!outcome.already) {
      require("../modules/flows/runner").emitEvent(tenantId, "invoice.paid", { invoice: outcome.inv }).catch(() => {});
      if (outcome.settle) // book only the remainder; shared :settle key so a concurrent manual-mark + Razorpay webhook dedup to one, while partial :p: keys never collide
        require("../lib/invoiceGl").postInvoiceReceipt(tenantId, outcome.inv, { amount: outcome.settle.amount, ref: outcome.inv.invoice_number, idempotencyKey: `recv:inv:${outcome.inv.id}:settle` }).catch(() => {});
      // Invoice-financing wedge (self-liquidating): if this invoice backs an active advance,
      // auto-recover the loan. The Razorpay webhook does the same; onInvoicePaid uses a stable
      // per-invoice recovery ref so a manual + webhook (or concurrent) double-fire dedups to one.
      require("../modules/lending").onInvoicePaid(tenantId, outcome.inv.id).catch(() => {});
    }
    return res.json(outcome.inv);
  }

  const { rows: [inv] } = await q(tenantId,
    "UPDATE invoices SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *",
    [status, req.params.id, tenantId]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  if (status === "sent") {
    require("../lib/invoiceGl").postInvoiceSale(req.user.tenant_id, inv).catch(() => {}); // accrual: recognise revenue + output GST on issue
    // Issued & unpaid = the moment an invoice becomes financeable. Flows can trigger on this
    // (e.g. the "issue invoice → offer an advance" automation).
    require("../modules/flows/runner").emitEvent(req.user.tenant_id, "invoice.sent", { invoice: inv }).catch(() => {});
  }
  res.json(inv);
});

// DELETE /api/invoices/:id - remove an invoice (and its line items), tenant-scoped.
// The Receivables page calls this to sync a deletion to the ledger.
router.delete("/:id", authenticate, canWrite, async (req, res) => {
  const deleted = await withTenant(req.user.tenant_id, async (client) => {
    const { rows: [inv] } = await client.query(
      "DELETE FROM invoices WHERE id=$1 AND tenant_id=$2 RETURNING id",
      [req.params.id, req.user.tenant_id]
    );
    if (!inv) return false;
    await client.query("DELETE FROM invoice_items WHERE invoice_id=$1", [inv.id]).catch(() => {});
    return true;
  });
  if (!deleted) return res.status(404).json({ error: "Invoice not found" });
  res.status(204).end();
});

// GET /api/invoices/:id/pdf - generate PDF with PDFKit
router.get("/:id/pdf", authenticate, async (req, res) => {
  const { rows: [inv] } = await q(req.user.tenant_id,
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

  // Tax split for the document — same seller-GSTIN source as the GL bridge (tenant_profile,
  // falling back to the firm KV) and the same derivation (lib/gstInvoice), so the printed
  // CGST/SGST-vs-IGST can never disagree with what was posted to the books.
  const { rows: profRows } = await pool.query("SELECT gstin FROM tenant_profile WHERE tenant_id=$1 LIMIT 1", [req.user.tenant_id]).catch(() => ({ rows: [] }));
  const split = taxSplit({
    gstAmount: inv.gst_amount, gstRate: inv.gst_rate,
    buyerGstin: inv.customer_gstin, sellerGstin: profRows[0]?.gstin || firm.gstNumber || null,
  });

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

  // Bill To (+ place of supply — Rule 46 wants it on the face of the tax invoice)
  doc.fillColor("#000").font("Helvetica-Bold").text("Bill To:", 50, 140);
  doc.font("Helvetica").text(inv.customer_name, 50, 156);
  if (inv.customer_gstin) doc.text(`GSTIN: ${inv.customer_gstin}`, 50, 170);
  if (split.placeOfSupply) {
    doc.fillColor("#666").fontSize(9)
      .text(`Place of Supply: ${split.placeOfSupply.name ? `${split.placeOfSupply.name} (${split.placeOfSupply.code})` : split.placeOfSupply.code} · ${split.interState ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}`, 50, inv.customer_gstin ? 184 : 170)
      .fillColor("#000").fontSize(10);
  }

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
    ["Subtotal", parseFloat(inv.subtotal)],
    // CGST+SGST for intra-state, IGST for inter-state — matches the GL posting exactly.
    ...split.lines.map((l) => [l.label, l.amount]),
    ["Total", parseFloat(inv.total_amount)],
  ];
  const paidSoFar = round2(inv.paid_amount);
  const credited = round2(inv.credited_amount);
  const netBalance = remainingToSettle({ total: inv.total_amount, paidAmount: paidSoFar, creditedAmount: credited });
  if (credited > 0) totals.push(["Less: Credit Notes", credited]);
  if ((paidSoFar > 0 || credited > 0) && netBalance > 0) {
    if (paidSoFar > 0) totals.push(["Received", paidSoFar]);
    totals.push(["Balance Due", netBalance]);
  }
  for (const [label, val] of totals) {
    const bold = label === "Total" || label === "Balance Due";
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(bold ? "#1A6B55" : "#000")
       .text(label, 380, y, { width: 120, align: "right" })
       .text(`₹${Number(val).toLocaleString("en-IN")}`, 450, y, { width: 95, align: "right" });
    y += 18;
  }

  // Footer
  doc.font("Helvetica").fillColor("#999").fontSize(8)
    .text("Thank you for your business. Payment due as per agreed terms.", 50, 760, { align: "center", width: 500 });

  doc.end();
});

// POST /:id/remind - Send WhatsApp reminder with UPI link
router.post("/:id/remind", authenticate, canWrite, async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;
  try {
    // The invoice row already carries the customer's contact details - there is
    // no separate tenants table to join (the previous LEFT JOIN tenants crashed).
    const { rows } = await q(tenantId,
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    // Spam-guard: protect the SMB's relationship with its customer. The cap (per
    // 7-day window) is a super-admin-tunable platform setting, defaulting to 3.
    const reminderCap = await platformConfig.num("limits", "reminderMaxPer7d", 3);
    const { rows: recent } = await pool.query(
      "SELECT count(*)::int AS n FROM invoice_reminders WHERE invoice_id=$1 AND tenant_id=$2 AND created_at > now() - interval '7 days'",
      [id, tenantId]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if (reminderCap > 0 && (recent[0]?.n ?? 0) >= reminderCap) {
      return res.status(429).json({ error: `You've already sent ${reminderCap} reminders for this invoice in the last 7 days - give the customer some space before nudging again.` });
    }

    const amount = Number(invoice.total_amount || 0);
    const sender = (await firmNameOf(tenantId)) || req.user.display_name || "your supplier";
    const baseMsg = `Reminder from ${sender}: invoice ${invoice.invoice_number} for ₹${amount.toLocaleString("en-IN")} is due${invoice.due_date ? ` on ${new Date(invoice.due_date).toLocaleDateString("en-IN")}` : ""}.`;
    const msg = baseMsg + (invoice.upi_link ? ` Pay here: ${invoice.upi_link}` : "");

    // Try WhatsApp first (if we have a phone), then email. Record what happened.
    let channel = null, delivered = false;
    if (invoice.customer_phone) {
      channel = "whatsapp";
      delivered = await sendWhatsApp(invoice.customer_phone, msg).catch(() => false);
    } else if (invoice.customer_email) {
      channel = "email";
      const esc = baseMsg.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const payBtn = invoice.upi_link
        ? `<p style="margin:18px 0"><a href="${invoice.upi_link}" style="background:#5FBE7C;color:#0d0d09;font-weight:700;padding:11px 20px;border-radius:8px;text-decoration:none;display:inline-block">Pay ₹${amount.toLocaleString("en-IN")} now</a></p>`
        : "";
      delivered = await sendMail({
        to: invoice.customer_email,
        subject: `Payment reminder - invoice ${invoice.invoice_number}`,
        html: `<div style="font-family:system-ui,-apple-system,sans-serif"><p>${esc}</p>${payBtn}<p style="color:#8a8a8a;font-size:12px;margin-top:20px">Sent by ${sender}.</p></div>`,
      }).then(() => true).catch(() => false);
    }
    if (!channel) {
      return res.status(400).json({ error: "No customer phone or email on this invoice" });
    }

    await pool.query(
      `INSERT INTO invoice_reminders (invoice_id, tenant_id, channel, status)
       VALUES ($1, $2, $3, $4)`,
      [id, tenantId, channel, delivered ? "sent" : "queued"]
    ).catch(() => {});

    // Move a still-draft invoice to "sent" once a reminder goes out.
    if (invoice.status === "draft") {
      await q(tenantId, `UPDATE invoices SET status='sent' WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    }

    res.json({
      success: true,
      channel,
      delivered,
      message: delivered
        ? `Reminder sent via ${channel}`
        : `Reminder recorded (${channel} not delivered - provider not configured)`,
    });
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

// ── AR balance confirmations (auditor-style, one letter per customer) ─────────
// The letter is composed SERVER-SIDE from that customer's real open invoice rows
// (never client-supplied text), so this can't be used as an open relay. Contact
// details are persisted onto the customer's invoice rows, then sent to the
// stored value - and a send only counts when the channel actually accepted it.

// GET /api/invoices/confirmations/log - latest confirmation sent per customer
router.get("/confirmations/log", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (customer_name) customer_name, channel, sent_to, as_of, total_amount, created_at
       FROM ar_confirmation_log WHERE tenant_id=$1
      ORDER BY customer_name, created_at DESC`,
    [req.user.tenant_id]
  ).catch(() => ({ rows: [] }));
  res.json(rows);
});

// POST /api/invoices/confirmations/send { customer, channel, asOf?, email?, phone? }
router.post("/confirmations/send", authenticate, canWrite, async (req, res) => {
  const tenantId = req.user.tenant_id;
  const customer = String(req.body?.customer || "").trim();
  const channel  = String(req.body?.channel || "").toLowerCase();
  if (!customer) return res.status(400).json({ error: "customer required" });
  if (channel !== "whatsapp" && channel !== "email") {
    return res.status(422).json({ error: "channel must be 'whatsapp' or 'email'" });
  }
  const asOfRaw = String(req.body?.asOf || "").slice(0, 10);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : new Date().toISOString().slice(0, 10);

  try {
    // Optionally persist fresh contact details onto this customer's invoice rows first.
    const newEmail = String(req.body?.email || "").trim();
    const newPhone = String(req.body?.phone || "").trim();
    if (newEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return res.status(422).json({ error: "Invalid email" });
      await q(tenantId, "UPDATE invoices SET customer_email=$1 WHERE tenant_id=$2 AND customer_name=$3", [newEmail, tenantId, customer]);
    }
    if (newPhone) {
      const digits = newPhone.replace(/[^\d+]/g, "");
      if (!/^\+?[1-9]\d{7,14}$/.test(digits)) return res.status(422).json({ error: "Invalid phone - use country code, e.g. +919876543210" });
      await q(tenantId, "UPDATE invoices SET customer_phone=$1 WHERE tenant_id=$2 AND customer_name=$3", [digits.startsWith("+") ? digits : `+${digits}`, tenantId, customer]);
    }

    const { rows: open } = await q(tenantId,
      `SELECT invoice_number, total_amount, due_date, created_at, customer_email, customer_phone
         FROM invoices
        WHERE tenant_id=$1 AND customer_name=$2 AND status NOT IN ('paid','cancelled')
        ORDER BY created_at ASC`,
      [tenantId, customer]
    );
    if (!open.length) return res.status(404).json({ error: "No open invoices for this customer" });

    // Spam-guard: max 2 confirmations per customer per 7 days.
    const { rows: recent } = await pool.query(
      "SELECT count(*)::int AS n FROM ar_confirmation_log WHERE tenant_id=$1 AND customer_name=$2 AND created_at > now() - interval '7 days'",
      [tenantId, customer]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if ((recent[0]?.n ?? 0) >= 2) {
      return res.status(429).json({ error: "Already sent 2 confirmations to this customer in the last 7 days." });
    }

    const total = open.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const firm = (await firmNameOf(tenantId)) || "our company";
    const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const lines = open.map((r) => `  • ${r.invoice_number} dated ${fmtDate(r.created_at)} - ₹${Number(r.total_amount).toLocaleString("en-IN")}`).join("\n");
    const body = `Dear ${customer},\n\nFor audit purposes, please confirm the balance receivable by ${firm} from you as on ${fmtDate(asOf)}.\n\nAs per our books, the outstanding balance is ₹${total.toLocaleString("en-IN")}, comprising:\n${lines}\n\nKindly reply confirming whether this balance agrees with your records. If you note any discrepancy, please share details.\n\nThank you,\n${firm}`;
    const subject = `Balance confirmation request as on ${fmtDate(asOf)} - ${firm}`;

    let sentTo;
    if (channel === "whatsapp") {
      const phone = open.find((r) => r.customer_phone)?.customer_phone || (newPhone || null);
      if (!phone) return res.status(422).json({ error: "No phone on file for this customer - enter one and retry." });
      const delivered = await sendWhatsApp(phone, `*${subject}*\n\n${body}`).catch(() => false);
      if (!delivered) return res.status(503).json({ error: "WhatsApp isn't configured on the server (missing Twilio keys) - nothing was sent." });
      sentTo = phone;
    } else {
      const email = open.find((r) => r.customer_email)?.customer_email || (newEmail || null);
      if (!email) return res.status(422).json({ error: "No email on file for this customer - enter one and retry." });
      if (!process.env.SMTP_USER) return res.status(503).json({ error: "Email isn't configured on the server (missing SMTP keys) - nothing was sent." });
      const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await sendMail({
        to: email, subject,
        html: `<tr><td style="padding:24px 32px"><p style="font-size:14px;color:#e8e8dc;font-family:system-ui,sans-serif;white-space:pre-wrap;margin:0">${esc(body)}</p></td></tr>`,
      });
      sentTo = email;
    }

    await pool.query(
      "INSERT INTO ar_confirmation_log(tenant_id, customer_name, channel, sent_to, as_of, total_amount) VALUES($1,$2,$3,$4,$5,$6)",
      [tenantId, customer, channel, sentTo, asOf, total]
    ).catch(() => {});
    res.json({ ok: true, channel, to: sentTo, total, invoices: open.length });
  } catch (err) {
    console.error("ar confirmation error", err);
    res.status(500).json({ error: "Failed to send confirmation" });
  }
});

// POST /api/invoices/:id/send - email invoice
router.post("/:id/send", authenticate, canWrite, async (req, res) => {
  const { rows: [inv] } = await q(req.user.tenant_id,
    "SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  if (!inv.customer_email) return res.status(400).json({ error: "Invoice has no customer email" });

  await sendMail({
    to:      inv.customer_email,
    subject: `Invoice ${inv.invoice_number} - ₹${parseFloat(inv.total_amount).toLocaleString("en-IN")}`,
    text:    `Please find your invoice ${inv.invoice_number} for ₹${parseFloat(inv.total_amount).toLocaleString("en-IN")}. Due by ${inv.due_date || "on receipt"}.`,
    html:    `<p>Dear ${inv.customer_name},</p><p>Please find your invoice <strong>${inv.invoice_number}</strong> for <strong>₹${parseFloat(inv.total_amount).toLocaleString("en-IN")}</strong>.</p><p>Due date: <strong>${inv.due_date || "On receipt"}</strong></p><p>Thank you for your business.</p>`,
  }).catch(() => {});

  await q(req.user.tenant_id, "UPDATE invoices SET status='sent' WHERE id=$1 AND tenant_id=$2", [inv.id, req.user.tenant_id]);
  require("../lib/invoiceGl").postInvoiceSale(req.user.tenant_id, { ...inv, status: "sent" }).catch(() => {}); // accrual: Dr Debtor / Cr Sales + Output GST on issue
  res.json({ ok: true });
});

// POST /api/invoices/:id/upi-link - generate UPI QR (Razorpay optional, fallback to static UPI)
router.post("/:id/upi-link", authenticate, canWrite, async (req, res) => {
  const { rows: [inv] } = await q(req.user.tenant_id,
    "SELECT i.*, kv.value AS kv FROM invoices i LEFT JOIN kv_store kv ON kv.tenant_id=i.tenant_id AND kv.namespace='app' AND kv.key='store' WHERE i.id=$1 AND i.tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const firm = inv.kv?.value?.firm ?? {};
  // Never fabricate a payee VPA - a placeholder/wrong UPI id sends the customer's
  // money to the wrong place. Require the firm's real UPI ID (set in Settings).
  const upiId = firm.upiId || null;
  if (!upiId) return res.status(400).json({ error: "Add your UPI ID in Settings before generating a payment link - we won't send a placeholder account to your customer." });
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(firm.name || "")}&am=${inv.total_amount}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`;

  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(upiLink, { width: 200 });
  } catch { /* ok */ }

  await q(req.user.tenant_id, "UPDATE invoices SET upi_link=$1 WHERE id=$2 AND tenant_id=$3", [upiLink, inv.id, req.user.tenant_id]);
  res.json({ upi_link: upiLink, qr: qrDataUrl });
});

// ── Payments / receipts (partial & advance both supported) ──
// GET /:id/payments — the receipt ledger for an invoice + its running balance.
router.get("/:id/payments", authenticate, async (req, res) => {
  try {
  const t = req.user.tenant_id;
  const rows = await withTenant(t, async (client) => {
    const { rows: [inv] } = await client.query("SELECT total_amount, paid_amount, credited_amount FROM invoices WHERE id=$1 AND tenant_id=$2", [req.params.id, t]);
    if (!inv) return null;
    const { rows: pays } = await client.query(
      "SELECT id, amount, mode, reference, received_at, created_at FROM invoice_payments WHERE tenant_id=$1 AND invoice_id=$2 ORDER BY received_at, created_at",
      [t, req.params.id]);
    return {
      total_amount: Number(inv.total_amount), paid_amount: Number(inv.paid_amount || 0),
      credited_amount: Number(inv.credited_amount || 0),
      balance_due: remainingToSettle({ total: inv.total_amount, paidAmount: inv.paid_amount || 0, creditedAmount: inv.credited_amount || 0 }),
      payments: pays,
    };
  });
  if (!rows) return res.status(404).json({ error: "Invoice not found" });
  res.json(rows);
  } catch (e) { console.error("[invoices] payments list failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// POST /:id/payments — record a receipt (partial or full). Updates paid_amount, flips status to
// 'paid' only when fully settled, and posts a GL RECEIPT for THIS amount (idempotent per payment
// id) so the books track partial collection. Overpayment is refused so AR is never driven negative.
router.post("/:id/payments", authenticate, canWrite, async (req, res) => {
  try {
  const t = req.user.tenant_id;
  const amount = round2(req.body?.amount);
  const mode = String(req.body?.mode || "other").toLowerCase();
  const reference = req.body?.reference ? String(req.body.reference).slice(0, 120) : null;
  const receivedAt = req.body?.received_at ? String(req.body.received_at).slice(0, 10) : null;
  if (!(amount > 0)) return res.status(400).json({ error: "amount must be greater than 0" });
  if (!PAY_MODES.has(mode)) return res.status(400).json({ error: `mode must be one of: ${[...PAY_MODES].join(", ")}` });
  if (receivedAt && !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt)) return res.status(400).json({ error: "received_at must be YYYY-MM-DD" });

  const outcome = await withTenant(t, async (client) => {
    const { rows: [inv] } = await client.query("SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [req.params.id, t]);
    if (!inv) return { notFound: true };
    if (inv.status === "cancelled") return { cancelled: true };
    const eff = applyReceipt({ total: inv.total_amount, paidAmount: inv.paid_amount || 0, creditedAmount: inv.credited_amount || 0 }, amount);
    if (!eff.ok) return { over: true, balance: eff.balanceBefore };
    const { rows: [pay] } = await client.query(
      "INSERT INTO invoice_payments(tenant_id, invoice_id, amount, mode, reference, received_at, created_by) VALUES($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE),$7) RETURNING *",
      [t, inv.id, amount, mode, reference, receivedAt, req.user.id || null]);
    const { rows: [upd] } = await client.query(
      `UPDATE invoices SET paid_amount=$1,
         status=CASE WHEN $2 THEN 'paid' WHEN status='draft' THEN 'sent' ELSE status END,
         paid_at=CASE WHEN $2 THEN now() ELSE paid_at END
       WHERE id=$3 AND tenant_id=$4 RETURNING *`,
      [eff.newPaid, eff.fullyPaid, inv.id, t]);
    return { inv: upd, pay, fullyPaid: eff.fullyPaid };
  });
  if (outcome.notFound) return res.status(404).json({ error: "Invoice not found" });
  if (outcome.cancelled) return res.status(400).json({ error: "Can't record a payment against a cancelled invoice." });
  if (outcome.over) return res.status(400).json({ error: `That's more than the ₹${outcome.balance.toLocaleString("en-IN")} still outstanding — record the balance or less.` });

  // GL receipt for THIS payment only, keyed per payment id → no double-post vs the settling receipt.
  require("../lib/invoiceGl").postInvoiceReceipt(t, outcome.inv, { amount: outcome.pay.amount, ref: reference || outcome.inv.invoice_number, idempotencyKey: `recv:inv:${outcome.inv.id}:p:${outcome.pay.id}` }).catch(() => {});
  require("../modules/flows/runner").emitEvent(t, outcome.fullyPaid ? "invoice.paid" : "invoice.payment", { invoice: outcome.inv, payment: outcome.pay }).catch(() => {});
  if (outcome.fullyPaid) require("../modules/lending").onInvoicePaid(t, outcome.inv.id).catch(() => {});
  require("../modules/analytics").track(t, req.user.id, { event: "invoice_payment", props: { amount: outcome.pay.amount, fully_paid: outcome.fullyPaid } }).catch(() => {});
  res.status(201).json({ payment: outcome.pay, invoice: { ...outcome.inv, aging: computeAging(outcome.inv) }, balance_due: remainingToSettle({ total: outcome.inv.total_amount, paidAmount: outcome.inv.paid_amount, creditedAmount: outcome.inv.credited_amount || 0 }) });
  } catch (e) { console.error("[invoices] record payment failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// ── Credit notes (real documents: numbered, GL-posted, GSTR-visible) ──
// GET /credit-notes/all — every note for the tenant (newest first), for the tool tab.
router.get("/credit-notes/all", authenticate, async (req, res) => {
  try {
    const { rows } = await q(req.user.tenant_id,
      `SELECT cn.*, i.invoice_number, i.customer_name FROM invoice_credit_notes cn
       JOIN invoices i ON i.id = cn.invoice_id
       WHERE cn.tenant_id=$1 ORDER BY cn.created_at DESC LIMIT 200`,
      [req.user.tenant_id]);
    res.json(rows);
  } catch (e) { console.error("[invoices] credit notes list failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// GET /:id/credit-notes — notes against one invoice + how much more is creditable.
router.get("/:id/credit-notes", authenticate, async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const out = await withTenant(t, async (client) => {
      const { rows: [inv] } = await client.query("SELECT total_amount, paid_amount, credited_amount FROM invoices WHERE id=$1 AND tenant_id=$2", [req.params.id, t]);
      if (!inv) return null;
      const { rows: notes } = await client.query(
        "SELECT id, note_number, reason, subtotal, gst_amount, total_amount, created_at FROM invoice_credit_notes WHERE tenant_id=$1 AND invoice_id=$2 ORDER BY created_at",
        [t, req.params.id]);
      return { credited_amount: Number(inv.credited_amount || 0), creditable: creditableBalance({ total: inv.total_amount, paidAmount: inv.paid_amount || 0, creditedAmount: inv.credited_amount || 0 }), notes };
    });
    if (!out) return res.status(404).json({ error: "Invoice not found" });
    res.json(out);
  } catch (e) { console.error("[invoices] credit notes failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// POST /:id/credit-notes — issue a credit note for `amount` (GST-inclusive) with a reason.
// GST is carved out in the invoice's own proportion, the note gets a CN-YYYY-NNN number, the
// invoice's credited_amount rises (balance = total − paid − credited everywhere), and the GL
// books a CREDIT_NOTE voucher that flows into GSTR-1 CDNR / GSTR-3B 4I via the existing engine.
// Capped at the UNCOLLECTED balance: crediting money already received is a refund — a different,
// payout-gated flow we refuse to fake.
router.post("/:id/credit-notes", authenticate, canWrite, async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const amount = round2(req.body?.amount);
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!(amount > 0)) return res.status(400).json({ error: "amount must be greater than 0" });
    if (!reason) return res.status(400).json({ error: "A reason is required on a credit note (it appears on the GST document)." });

    const outcome = await withTenant(t, async (client) => {
      const { rows: [inv] } = await client.query("SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [req.params.id, t]);
      if (!inv) return { notFound: true };
      if (inv.status === "draft") return { err: "Send the invoice first — a credit note adjusts an ISSUED document." };
      if (inv.status === "cancelled") return { err: "Can't credit a cancelled invoice." };
      const creditable = creditableBalance({ total: inv.total_amount, paidAmount: inv.paid_amount || 0, creditedAmount: inv.credited_amount || 0 });
      if (amount > creditable) return { err: `Only ₹${creditable.toLocaleString("en-IN")} is still uncollected on this invoice — a credit note can't exceed that (refunding received money is a separate flow).` };

      // Carve GST out of the credited amount in the invoice's own proportion, so the note's
      // tax exactly reverses its share of the original output GST.
      const gstShare = Number(inv.total_amount) > 0 ? Number(inv.gst_amount) / Number(inv.total_amount) : 0;
      const noteGst = round2(amount * gstShare);
      const noteSubtotal = round2(amount - noteGst);

      // CN-YYYY-NNN per tenant, same style as invoice numbering.
      const { rows: existing } = await client.query(
        "SELECT note_number FROM invoice_credit_notes WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50", [t]);
      const year = new Date().getFullYear();
      const nums = existing.map((r) => { const m = r.note_number.match(/CN-\d{4}-(\d+)$/); return m ? parseInt(m[1]) : 0; }).filter(Boolean);
      const note_number = `CN-${year}-${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;

      const { rows: [note] } = await client.query(
        "INSERT INTO invoice_credit_notes(tenant_id, invoice_id, note_number, reason, subtotal, gst_amount, total_amount, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [t, inv.id, note_number, reason, noteSubtotal, noteGst, amount, req.user.id || null]);

      const newCredited = round2(round2(inv.credited_amount || 0) + amount);
      const paid = round2(inv.paid_amount || 0);
      const balanceAfter = round2(round2(inv.total_amount) - newCredited - paid);
      // Fully credited with nothing collected → the invoice is voided by the note.
      // Balance zeroed with money collected → settled (cash + adjustment).
      const newStatus = balanceAfter <= 0 ? (paid > 0 ? "paid" : "cancelled") : inv.status;
      const { rows: [upd] } = await client.query(
        `UPDATE invoices SET credited_amount=$1, status=$2,
           paid_at=CASE WHEN $2='paid' AND paid_at IS NULL THEN now() ELSE paid_at END
         WHERE id=$3 AND tenant_id=$4 RETURNING *`,
        [newCredited, newStatus, inv.id, t]);
      return { inv: upd, note, balanceAfter };
    });
    if (outcome.notFound) return res.status(404).json({ error: "Invoice not found" });
    if (outcome.err) return res.status(400).json({ error: outcome.err });

    // GL CREDIT_NOTE voucher (Dr Sales + Output GST / Cr Debtor), idempotent per note id.
    require("../lib/invoiceGl").postInvoiceCreditNote(t, outcome.inv, outcome.note).catch(() => {});
    require("../modules/flows/runner").emitEvent(t, "invoice.credit_note", { invoice: outcome.inv, note: outcome.note }).catch(() => {});
    require("../modules/analytics").track(t, req.user.id, { event: "credit_note_issued", props: { amount: Number(outcome.note.total_amount) } }).catch(() => {});
    res.status(201).json({ note: outcome.note, invoice: { ...outcome.inv, aging: computeAging(outcome.inv) }, balance_due: outcome.balanceAfter });
  } catch (e) { console.error("[invoices] credit note failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// ── Recurring invoice schedules (real generation via the daily books cron) ──
const CADENCES = new Set(["weekly", "monthly", "quarterly"]);

router.get("/recurring", authenticate, async (req, res) => {
  try {
    const { rows } = await q(req.user.tenant_id,
      "SELECT * FROM invoice_recurring WHERE tenant_id=$1 ORDER BY created_at DESC", [req.user.tenant_id]);
    res.json(rows);
  } catch (e) { console.error("[invoices] recurring list failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

router.post("/recurring", authenticate, canWrite, async (req, res) => {
  try {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items.filter((i) => i && i.description && parseFloat(i.quantity) > 0 && parseFloat(i.unit_price) >= 0) : [];
    if (!b.customer_name || !items.length) return res.status(400).json({ error: "customer_name and at least one item are required" });
    if (!CADENCES.has(b.cadence)) return res.status(400).json({ error: `cadence must be one of: ${[...CADENCES].join(", ")}` });
    const nextRun = String(b.next_run || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextRun)) return res.status(400).json({ error: "next_run must be YYYY-MM-DD" });
    const dom = b.day_of_month != null ? Number(b.day_of_month) : Number(nextRun.slice(8, 10));
    if (!(dom >= 1 && dom <= 31)) return res.status(400).json({ error: "day_of_month must be 1-31" });
    if (b.auto_send && !b.customer_email) return res.status(400).json({ error: "auto_send needs a customer email to send to." });
    const { rows: [row] } = await q(req.user.tenant_id,
      `INSERT INTO invoice_recurring(tenant_id, customer_name, customer_gstin, customer_email, customer_phone,
         gst_rate, items, cadence, day_of_month, next_run, due_in_days, auto_send, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.tenant_id, String(b.customer_name).trim(), b.customer_gstin || null, b.customer_email || null,
       b.customer_phone || null, Number(b.gst_rate) || 18, JSON.stringify(items), b.cadence, dom, nextRun,
       Math.min(Math.max(Number(b.due_in_days) || 15, 0), 180), !!b.auto_send, req.user.id || null]);
    res.status(201).json(row);
  } catch (e) { console.error("[invoices] recurring create failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

router.patch("/recurring/:rid", authenticate, canWrite, async (req, res) => {
  try {
    const b = req.body || {};
    // Only the safe, individually-validated fields are patchable.
    const sets = [], vals = [];
    const put = (col, val) => { vals.push(val); sets.push(`${col}=$${vals.length}`); };
    if (b.active != null) put("active", !!b.active);
    if (b.auto_send != null) put("auto_send", !!b.auto_send);
    if (b.next_run != null) {
      const d = String(b.next_run).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: "next_run must be YYYY-MM-DD" });
      put("next_run", d);
    }
    if (b.cadence != null) {
      if (!CADENCES.has(b.cadence)) return res.status(400).json({ error: `cadence must be one of: ${[...CADENCES].join(", ")}` });
      put("cadence", b.cadence);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    vals.push(req.params.rid, req.user.tenant_id);
    const { rows: [row] } = await q(req.user.tenant_id,
      `UPDATE invoice_recurring SET ${sets.join(", ")} WHERE id=$${vals.length - 1} AND tenant_id=$${vals.length} RETURNING *`, vals);
    if (!row) return res.status(404).json({ error: "Schedule not found" });
    res.json(row);
  } catch (e) { console.error("[invoices] recurring patch failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

router.delete("/recurring/:rid", authenticate, canWrite, async (req, res) => {
  try {
    const { rowCount } = await q(req.user.tenant_id,
      "DELETE FROM invoice_recurring WHERE id=$1 AND tenant_id=$2", [req.params.rid, req.user.tenant_id]);
    if (!rowCount) return res.status(404).json({ error: "Schedule not found" });
    res.status(204).end();
  } catch (e) { console.error("[invoices] recurring delete failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// Generate this schedule's invoice NOW (doesn't wait for the cron); advances next_run.
router.post("/recurring/:rid/run-now", authenticate, canWrite, async (req, res) => {
  try {
    const inv = await require("../lib/recurringInvoices").generateForSchedule(req.user.tenant_id, req.params.rid, { force: true });
    if (!inv) return res.status(400).json({ error: "Schedule not found, inactive, or has no items." });
    res.status(201).json(inv);
  } catch (e) { console.error("[invoices] recurring run-now failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

module.exports = router;
