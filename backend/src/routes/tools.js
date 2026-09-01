"use strict";
// ── Small paper tools (Wave 16) ──────────────────────────────────────────────
// POST /api/tools/cheque → a print-ready cheque PDF. Firms that pay by cheque were
// hand-writing amount-in-words on every one (and a corrected cheque is a bounced cheque).
// Laid out for a standard CTS-2010 cheque leaf placed in a printer: date boxes top-right,
// payee line, amount in words over two lines, amount box, A/c payee crossing.
const router = require("express").Router();
const PDFDoc = require("pdfkit");
const { authenticate } = require("../middleware/auth");
const { inWords } = require("../lib/invoiceTotals");
const { auditReq } = require("../lib/audit");

const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant"];

// Standard cheque leaf ≈ 202 × 92 mm → 572 × 261 pt.
const W = 572, H = 261;

router.post("/cheque", authenticate, (req, res) => {
  if (!WRITE_ROLES.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  const payee = String(req.body?.payee || "").trim();
  const amount = Math.round((Number(req.body?.amount) || 0) * 100) / 100;
  const date = String(req.body?.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const acPayee = req.body?.acPayee !== false;
  if (!payee) return res.status(400).json({ error: "Who is the cheque for?", errors: { payee: "Required" } });
  if (!(amount > 0)) return res.status(400).json({ error: "The amount must be greater than zero", errors: { amount: "Required" } });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  auditReq(req, "cheque_printed", "tools", null, { payee, amount });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="cheque-${payee.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf"`);
  const doc = new PDFDoc({ size: [W, H], margin: 0 });
  doc.pipe(res);

  // Alignment aid, drawn faintly: the user prints once on plain paper, holds it against a
  // leaf, and nudges the offsets below if their bank's layout differs.
  doc.rect(1, 1, W - 2, H - 2).lineWidth(0.5).strokeOpacity(0.15).stroke("#888").strokeOpacity(1);

  // Date boxes, DDMMYYYY, top right.
  const dd = date.slice(8, 10), mm = date.slice(5, 7), yyyy = date.slice(0, 4);
  const digits = `${dd}${mm}${yyyy}`;
  let x = W - 8 - 8 * 17;
  doc.font("Helvetica").fontSize(11).fillColor("#000");
  for (const ch of digits) { doc.text(ch, x + 5, 22, { width: 12 }); x += 17; }

  // A/c payee crossing.
  if (acPayee) {
    doc.save().translate(50, 40).rotate(-20)
      .fontSize(8).fillColor("#000")
      .moveTo(-6, -4).lineTo(84, -4).lineWidth(0.8).stroke()
      .text("A/C PAYEE ONLY", 0, 0)
      .moveTo(-6, 12).lineTo(84, 12).stroke()
      .restore();
  }

  // Payee, on the "Pay" line.
  doc.font("Helvetica-Bold").fontSize(12).text(payee.toUpperCase(), 70, 66, { width: 400 });

  // Amount in words over the "Rupees" area (two lines), terminated with a strike so
  // nothing can be appended.
  const words = inWords(amount).replace(/^Rupees /, "").replace(/ Only$/, "");
  doc.font("Helvetica").fontSize(10).text(`${words} Only /-`, 70, 96, { width: 380, lineGap: 8 });

  // Amount box.
  doc.font("Helvetica-Bold").fontSize(12)
    .text(`**${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}/-`, W - 150, 118, { width: 130, align: "left" });

  doc.end();
});

module.exports = router;
