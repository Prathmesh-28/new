"use strict";
// ── Invoice PDF rendering ────────────────────────────────────────────────────
// Extracted from routes/invoices.js so the SAME renderer serves both the authenticated
// download and the customer portal. The alternative — the portal re-entering the Express
// route with a synthetic request — meant one document could silently drift from the other,
// which is the last place a mismatch is acceptable.
//
// Renders straight to `res`. Returns { notFound: true } when the invoice isn't there, so
// the caller decides what a 404 looks like for its audience.
const PDFDoc = require("pdfkit");
const { pool } = require("../db");
const { q } = require("./tenantDb");
const { taxSplit, stateName } = require("./gstInvoice");
const { inWords } = require("./invoiceTotals");
const { round2, remainingToSettle } = require("./invoicePaymentMath");

// DATE columns arrive as plain "YYYY-MM-DD" strings (db.js); pushing one through a Date
// would re-introduce the timezone shift that fix removed.
const fmtDate = (v) => {
  const s = String(v || "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(s).toLocaleDateString("en-IN");
};
// PDFKit's built-in Helvetica is WinAnsi-encoded and has no glyph for the rupee sign, so
// "₹" printed as "¹" on every invoice a customer received. "Rs." is the conventional
// fallback on Indian invoices; a non-INR invoice prints its ISO code. Money always carries
// two decimals — amounts used to render as 499.5 next to 4,945 on the same document.
const money = (v, currency = "INR") => {
  const n = Number(v) || 0;
  const b = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${currency === "INR" ? "Rs. " : `${currency} `}${b}`;
};
const qty = (v) => (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

async function renderInvoicePdf(tenantId, invoiceId, res) {
  const { rows: [inv] } = await q(tenantId,
    `SELECT i.*, json_agg(ii ORDER BY ii.id) AS items
     FROM invoices i LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE i.id=$1 AND i.tenant_id=$2 GROUP BY i.id`,
    [invoiceId, tenantId]
  );
  if (!inv) return { notFound: true };

  const { rows: kvRows } = await pool.query(
    "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='app' AND key='store' LIMIT 1",
    [tenantId]
  );
  const firm = kvRows[0]?.value?.value?.firm ?? {};
  const items = (inv.items ?? []).filter(Boolean);

  // Tax split for the document — same seller-GSTIN source as the GL bridge (tenant_profile,
  // falling back to the firm KV) and the same derivation (lib/gstInvoice), so the printed
  // CGST/SGST-vs-IGST can never disagree with what was posted to the books.
  const { rows: profRows } = await pool.query("SELECT gstin FROM tenant_profile WHERE tenant_id=$1 LIMIT 1", [tenantId]).catch(() => ({ rows: [] }));
  // Wave 4 stores the split ON the invoice at creation, so the printed document and the GL
  // can never drift apart. taxSplit() is still used for invoices raised before that (their
  // stored split is zero) — the derivation it uses is the one the migration backfilled with.
  const stored = Number(inv.cgst_amount) + Number(inv.sgst_amount) + Number(inv.igst_amount) > 0;
  const derived = taxSplit({
    gstAmount: inv.gst_amount, gstRate: inv.gst_rate,
    buyerGstin: inv.customer_gstin, sellerGstin: profRows[0]?.gstin || firm.gstNumber || null,
  });
  const halfRate = round2(Number(inv.gst_rate) / 2);
  const split = stored ? {
    interState: inv.is_inter_state === true,
    placeOfSupply: inv.place_of_supply_code
      ? { code: inv.place_of_supply_code, name: stateName(inv.place_of_supply_code) }
      : derived.placeOfSupply,
    lines: Number(inv.igst_amount) > 0
      ? [{ label: `IGST (${Number(inv.gst_rate)}%)`, amount: Number(inv.igst_amount) }]
      : [{ label: `CGST (${halfRate}%)`, amount: Number(inv.cgst_amount) },
         { label: `SGST (${halfRate}%)`, amount: Number(inv.sgst_amount) }],
  } : derived;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${inv.invoice_number}.pdf"`);

  const doc = new PDFDoc({ margin: 50, size: "A4" });
  doc.pipe(res);

  // Header
  // A void invoice must never be mistaken for a live one, so it says so across the page.
  if (inv.voided_at) {
    doc.save().rotate(-30, { origin: [300, 400] })
      .fontSize(72).fillColor("#e11d48").opacity(0.12).font("Helvetica-Bold")
      .text("VOID", 120, 360, { width: 400, align: "center" })
      .opacity(1).restore();
  }
  doc.fontSize(20).font("Helvetica-Bold").fillColor("#000")
    .text(inv.reverse_charge ? "TAX INVOICE (REVERSE CHARGE)" : "TAX INVOICE", 50, 50, { width: 330 });
  doc.fontSize(10).font("Helvetica").fillColor("#666")
    .text(inv.invoice_number, 50, 76)
    // The document date, not the row's insert timestamp: an invoice can be dated to the
    // actual date of supply, which is what a back-dated entry needs.
    .text(`Date: ${fmtDate(inv.invoice_date || inv.created_at)}`, 50, 90);
  let hy = 104;
  if (inv.due_date) { doc.text(`Due: ${fmtDate(inv.due_date)}`, 50, hy); hy += 14; }
  if (inv.po_number) { doc.text(`Your PO: ${inv.po_number}`, 50, hy); hy += 14; }
  if (inv.reference) { doc.text(`Ref: ${inv.reference}`, 50, hy); hy += 14; }

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
    .text("Rate",          380, tableTop + 6, { width: 70, align: "right" })
    .text("Amount",        450, tableTop + 6, { width: 95, align: "right" });

  let y = tableTop + 28;
  doc.font("Helvetica").fillColor("#000").fontSize(9);
  for (const item of items) {
    doc.text(item.uom ? `${item.description} (${item.uom})` : item.description, 55, y, { width: 220 })
       .text(item.hsn_sac || "-", 280, y, { width: 60 })
       .text(qty(item.quantity), 340, y, { width: 40, align: "right" })
       .text(qty(item.unit_price), 380, y, { width: 70, align: "right" })
       .text(qty(item.amount), 450, y, { width: 95, align: "right" });
    // A per-line discount has to be visible, or the rate and the amount look like they
    // disagree and the customer queries the invoice.
    if (Number(item.discount_amount) > 0) {
      y += 11;
      doc.fillColor("#888").fontSize(8)
        .text(`less discount ${Number(item.discount_pct) > 0 ? `${Number(item.discount_pct)}% ` : ""}(${qty(item.discount_amount)})`, 55, y, { width: 380 })
        .fillColor("#000").fontSize(9);
    }
    y += 20;
    if (y > 680) { doc.addPage(); y = 50; }
  }

  // Totals
  y += 10;
  doc.moveTo(50, y).lineTo(550, y).stroke("#ddd");
  y += 12;
  const disc = round2(inv.discount_amount);
  const ship = round2(inv.shipping_amount);
  const roundOff = round2(inv.round_off);
  const totals = [
    // Show the arithmetic, not just the answer: gross, what came off, what went on, the
    // taxable value the GST is actually charged on, then the tax.
    ...(disc > 0 || ship > 0 ? [["Gross value", round2(Number(inv.subtotal) + disc - ship)]] : []),
    ...(disc > 0 ? [["Less: Discount", -disc]] : []),
    ...(ship > 0 ? [["Add: Freight / packing", ship]] : []),
    [disc > 0 || ship > 0 ? "Taxable value" : "Subtotal", parseFloat(inv.subtotal)],
    // CGST+SGST for intra-state, IGST for inter-state — matches the GL posting exactly.
    ...split.lines.map((l) => [l.label, l.amount]),
    ...(inv.reverse_charge ? [["(Tax payable by recipient under RCM)", 0]] : []),
    ...(roundOff !== 0 ? [["Round off", roundOff]] : []),
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
       .text(label, 330, y, { width: 170, align: "right" })
       .text(money(val, inv.currency || "INR"), 450, y, { width: 95, align: "right" });
    y += 18;
  }

  // Amount in words — expected on the face of an Indian tax invoice, and the thing a
  // reviewer checks the figures against.
  y += 6;
  doc.font("Helvetica-Bold").fillColor("#000").fontSize(9)
    .text(inWords(inv.total_amount, inv.currency || "INR"), 50, y, { width: 320 });
  y += 26;

  // Where to actually send the money. Without this the customer has to email and ask,
  // which is a day added to every collection.
  const bank = firm.bank || {};
  if (bank.accountNumber || bank.ifsc || firm.upiVpa) {
    doc.font("Helvetica-Bold").fillColor("#000").fontSize(9).text("Payment details", 50, y);
    y += 13;
    doc.font("Helvetica").fillColor("#444").fontSize(8.5);
    for (const [label, value] of [
      ["Bank", bank.bankName], ["A/c name", bank.accountName || firm.name],
      ["A/c no.", bank.accountNumber], ["IFSC", bank.ifsc], ["UPI", firm.upiVpa],
    ]) { if (value) { doc.text(`${label}: ${value}`, 50, y, { width: 320 }); y += 11; } }
    y += 6;
  }

  if (inv.terms) {
    doc.font("Helvetica-Bold").fillColor("#000").fontSize(9).text("Terms", 50, y); y += 12;
    doc.font("Helvetica").fillColor("#444").fontSize(8.5).text(String(inv.terms).slice(0, 600), 50, y, { width: 320 });
    y = doc.y + 8;
  }
  if (inv.notes) {
    doc.font("Helvetica-Bold").fillColor("#000").fontSize(9).text("Notes", 50, y); y += 12;
    doc.font("Helvetica").fillColor("#444").fontSize(8.5).text(String(inv.notes).slice(0, 600), 50, y, { width: 320 });
  }
  if (inv.voided_at) {
    doc.font("Helvetica-Bold").fillColor("#e11d48").fontSize(9)
      .text(`VOID — ${inv.void_reason || "cancelled"}`, 50, 740, { width: 500 });
  }

  // Footer
  doc.font("Helvetica").fillColor("#999").fontSize(8)
    .text("Thank you for your business. Payment due as per agreed terms.", 50, 760, { align: "center", width: 500 });

  doc.end();
}


// ── Payment receipt ──────────────────────────────────────────────────────────
// Small, numbered, printable proof of payment. Lives beside the invoice renderer so the
// two documents share formatting rules (money, dates, the Rs. fallback).
function renderReceiptPdf(res, { payment: p, firmName, firmGstin }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${p.receipt_number || "receipt"}.pdf"`);
  const doc = new PDFDoc({ margin: 50, size: "A5" });
  doc.pipe(res);

  doc.fontSize(16).font("Helvetica-Bold").text("PAYMENT RECEIPT", 50, 50);
  doc.fontSize(9).font("Helvetica").fillColor("#666")
    .text(p.receipt_number || "(unnumbered — recorded before receipt numbering)", 50, 72)
    .text(`Date: ${fmtDate(p.received_at)}`, 50, 84);

  doc.fillColor("#000").font("Helvetica-Bold").fontSize(10).text(firmName, 50, 110);
  if (firmGstin) doc.font("Helvetica").fillColor("#666").fontSize(8.5).text(`GSTIN: ${firmGstin}`, 50, 124);

  let y = 150;
  const row = (k, v, bold) => {
    doc.font("Helvetica").fillColor("#666").fontSize(9).text(k, 50, y, { width: 130 });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor("#000").text(String(v), 190, y, { width: 200 });
    y += 16;
  };
  row("Received from", p.customer_name, true);
  row("Amount", money(p.amount), true);
  row("Against invoice", p.invoice_number);
  row("Mode", p.mode);
  if (p.reference) row("Reference", p.reference);
  const remaining = Math.max(0, round2(Number(p.total_amount) - Number(p.paid_amount) - Number(p.credited_amount || 0)));
  row("Balance on invoice after receipts", remaining > 0 ? money(remaining) : "Nil — settled");

  y += 8;
  doc.font("Helvetica-Bold").fillColor("#000").fontSize(9)
    .text(inWords(p.amount), 50, y, { width: 340 });

  doc.font("Helvetica").fillColor("#999").fontSize(7.5)
    .text("System-generated receipt. Subject to realisation of the instrument where applicable.", 50, doc.page.height - 60, { width: 340 });
  doc.end();
}

module.exports = { renderInvoicePdf, renderReceiptPdf, fmtDate, money };
