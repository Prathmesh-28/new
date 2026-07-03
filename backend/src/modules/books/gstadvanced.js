"use strict";
// GST-advanced compute: the buildable-now gaps that are pure ledger math over the existing
// gst.js engine (gstr1/gstr3b/gstLiabilityVsPaid). No new source of truth, so they reconcile to
// the books. ACTUAL filing (CMP-08/GSTR-4/QRMP/GSTR-6/RFD-01) stays GSP-gated — this computes the
// figures + payable, never files.
//  #49 Composition CMP-08 (flat-rate over quarterly outward turnover)
//  #50 QRMP quarter aggregation + 35% fixed-sum challan
//  #58 Rule 86B cash-payment restriction monitor
//  #60 late-fee + interest calculator
//  #56 B2C dynamic UPI QR payload (gated on the tenant VPA)
const { pool } = require("../../db");
const gst = require("./gst");

const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const sum4 = (o) => n(o.CGST) + n(o.SGST) + n(o.IGST) + n(o.CESS);
const QUARTERS = { Q1: [4, 5, 6], Q2: [7, 8, 9], Q3: [10, 11, 12], Q4: [1, 2, 3] };
// A quarter's 'YYYY-MM' month keys, given the FY-start year (Q4 falls in the next calendar year).
function quarterMonths(fyStartYear, quarter) {
  const months = QUARTERS[quarter] || QUARTERS.Q1;
  return months.map((m) => `${quarter === "Q4" ? fyStartYear + 1 : fyStartYear}-${String(m).padStart(2, "0")}`);
}
async function turnover(tenantId, period) {
  try { const g1 = await gst.gstr1(tenantId, period); return r2((g1.rows || []).reduce((s, r) => s + (n(r.taxable) || 0), 0)); }
  catch { return 0; }
}

// #49 — Composition CMP-08: flat-rate tax on quarterly outward turnover.
async function compositionCmp08(tenantId, { fyStartYear, quarter = "Q1", ratePct = 1 } = {}) {
  const y = Number(fyStartYear) || (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const months = quarterMonths(y, quarter);
  const perMonth = [];
  let total = 0;
  for (const p of months) { const t = await turnover(tenantId, p); perMonth.push({ period: p, turnover: t }); total += t; }
  const tax = r2(total * n(ratePct) / 100);
  return {
    quarter, months: perMonth, outward_turnover: r2(total), rate_pct: n(ratePct), tax_payable: tax,
    note: "CMP-08: flat rate on outward turnover (1% trader/mfg, 5% restaurant, 6% other services). Composition dealers issue a bill of supply (no tax charged). Filing is GSP-gated.",
  };
}

// #50 — QRMP: aggregate the quarter's GSTR-3B + the 35% fixed-sum PMT-06 challan for months 1 & 2.
async function qrmp(tenantId, { fyStartYear, quarter = "Q1" } = {}) {
  const y = Number(fyStartYear) || (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const months = quarterMonths(y, quarter);
  const monthly = [];
  let qNet = 0;
  for (const p of months) { const b = await gst.gstr3b(tenantId, p); const net = sum4(b.netLiability); monthly.push({ period: p, net_liability: r2(net), output: r2(sum4(b.outputTax)), itc: r2(sum4(b.inputTaxCredit)) }); qNet += net; }
  // Fixed-sum method: months 1 & 2 pay 35% of the PRECEDING quarter's cash tax via PMT-06.
  const priorQ = quarter === "Q1" ? null : `Q${Number(quarter[1]) - 1}`;
  let priorNet = 0;
  if (priorQ) for (const p of quarterMonths(y, priorQ)) { const b = await gst.gstr3b(tenantId, p); priorNet += sum4(b.netLiability); }
  return {
    quarter, monthly, quarter_net_liability: r2(qNet),
    pmt06_35pct_challan: priorQ ? r2(priorNet * 0.35) : null,
    iff_note: "IFF (months 1 & 2): upload B2B invoices from GSTR-1 sections so buyers see ITC early; the quarterly GSTR-1 carries the rest.",
    note: "QRMP: quarterly GSTR-1/3B with monthly PMT-06 challans. The 35% fixed-sum challan is 35% of the preceding quarter's cash tax. Filing is GSP-gated.",
  };
}

// #58 — Rule 86B: if monthly taxable turnover > ₹50L, at least 1% of the output tax liability must
// be paid in cash (ITC can discharge at most 99%). Flags applicability + the minimum cash payable.
async function rule86B(tenantId, { period } = {}) {
  const p = period || new Date().toISOString().slice(0, 7);
  const b = await gst.gstr3b(tenantId, p);
  const t = await turnover(tenantId, p);
  const output = r2(sum4(b.outputTax));
  const itc = r2(sum4(b.inputTaxCredit));
  const applicable = t > 5000000; // > ₹50L monthly taxable turnover
  const minCash = applicable ? r2(output * 0.01) : 0;
  const maxItcUsable = applicable ? r2(output * 0.99) : output;
  return {
    period: p, taxable_turnover: t, output_tax: output, itc_available: itc,
    rule_86b_applicable: applicable, min_cash_payable: minCash, max_itc_usable: maxItcUsable,
    would_breach: applicable && itc >= maxItcUsable && output > 0,
    note: "Rule 86B applies when monthly taxable turnover > ₹50L: ≥1% of output tax must be paid in cash. Exemptions: >₹1L income-tax paid (each of last 2 FYs), govt/PSU, refund > ₹1L received, or ≥1% cash already paid cumulatively.",
  };
}

// #60 — late-fee + interest on a late/short GSTR-3B.
async function lateFeeInterest(tenantId, { period, filedOn, dueDate } = {}) {
  const p = period || new Date().toISOString().slice(0, 7);
  const liab = await gst.gstLiabilityVsPaid(tenantId, p);
  const unpaid = Math.max(0, r2(sum4(liab.netToPay)));
  const [yy, mm] = p.split("-").map(Number);
  const due = dueDate || `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-20`; // 20th of the next month
  const filed = filedOn || new Date().toISOString().slice(0, 10);
  const daysLate = Math.max(0, Math.floor((new Date(filed).getTime() - new Date(due).getTime()) / 86400000));
  const isNil = unpaid <= 0;
  const perDay = isNil ? 20 : 50;                 // ₹20/day nil, else ₹50/day (CGST+SGST)
  const lateFee = Math.min(daysLate * perDay, 5000); // capped
  const interest = r2(unpaid * 0.18 * daysLate / 365); // 18% p.a. on net cash tax paid late
  return {
    period: p, due_date: due, filed_on: filed, days_late: daysLate,
    unpaid_tax: unpaid, late_fee: lateFee, interest, total_payable: r2(lateFee + interest),
    note: "Late fee ₹50/day (₹20 nil-return), commonly capped; interest 18% p.a. on the net cash tax discharged late. Confirm the current cap for your turnover slab.",
  };
}

// #56 — B2C dynamic UPI QR payload (mandatory for B2C supplies by registered persons > ₹500cr).
// Gated on the tenant's VPA — never fabricated.
async function b2cUpiQr(tenantId, { amount, invoiceNo } = {}) {
  const { rows } = await pool.query("SELECT company_name, upi_id FROM tenant_profile WHERE tenant_id=$1", [tenantId]).catch(() => ({ rows: [] }));
  const vpa = rows[0]?.upi_id;
  if (!vpa) return { configured: false, note: "Set your UPI ID (Company profile) to generate the B2C dynamic QR — not fabricated." };
  const pn = encodeURIComponent((rows[0].company_name || "Merchant").slice(0, 40));
  const am = n(amount) > 0 ? `&am=${r2(amount)}` : "";
  const tn = invoiceNo ? `&tn=${encodeURIComponent(String(invoiceNo).slice(0, 30))}` : "";
  return { configured: true, payload: `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${pn}${am}&cu=INR${tn}`, vpa, note: "Render this string as a QR on the B2C invoice. Mandatory for registered persons with aggregate turnover > ₹500cr." };
}

// Per-branch outward turnover in a month (drives ISD + cross-charge allocation ratios).
function monthBounds(period) {
  const [y, m] = String(period).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}
async function branchTurnover(tenantId, period) {
  const { from, to } = monthBounds(period || new Date().toISOString().slice(0, 7));
  const { rows } = await pool.query(
    `SELECT b.id, b.name, b.gstin, COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS turnover
       FROM book_branches b
       LEFT JOIN book_vouchers v ON v.branch_id=b.id AND v.tenant_id=b.tenant_id AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3
       LEFT JOIN book_tax_entries te ON te.voucher_id=v.id AND te.is_input=false
      WHERE b.tenant_id=$1 AND b.is_active=true
      GROUP BY b.id, b.name, b.gstin ORDER BY turnover DESC`, [tenantId, from, to]);
  return rows.map((r) => ({ id: r.id, name: r.name, gstin: r.gstin, turnover: n(r.turnover) }));
}

// #52 — ISD: distribute a common ITC pool across branch GSTINs by turnover ratio (GSTR-6 basis).
async function isdDistribution(tenantId, { period, commonItc = 0 } = {}) {
  const branches = await branchTurnover(tenantId, period);
  const total = branches.reduce((s, b) => s + b.turnover, 0);
  const pool_ = n(commonItc);
  const allocation = branches.map((b) => {
    const pct = total > 0 ? r2((b.turnover / total) * 100) : 0;
    return { branch: b.name, gstin: b.gstin, turnover: b.turnover, share_pct: pct, itc_allocated: total > 0 ? r2(pool_ * b.turnover / total) : 0 };
  });
  return { period: period || new Date().toISOString().slice(0, 7), common_itc: r2(pool_), total_turnover: r2(total), allocation, note: total > 0 ? "ISD credit distributed pro-rata to each branch's turnover (GSTR-6 basis). Filing is GSP-gated." : "No branch turnover in this period — add branches / tag vouchers to a branch." };
}

// #53 — Cross-charge: allocate a head-office common cost across branches by turnover, each leg an
// inter-branch supply (Schedule I) attracting IGST (default 18%).
async function crossCharge(tenantId, { period, hoCost = 0, igstRate = 18 } = {}) {
  const branches = await branchTurnover(tenantId, period);
  const total = branches.reduce((s, b) => s + b.turnover, 0);
  const cost = n(hoCost);
  const allocation = branches.map((b) => {
    const alloc = total > 0 ? r2(cost * b.turnover / total) : 0;
    return { branch: b.name, gstin: b.gstin, turnover: b.turnover, allocated_cost: alloc, igst: r2(alloc * n(igstRate) / 100) };
  });
  return { period: period || new Date().toISOString().slice(0, 7), ho_cost: r2(cost), igst_rate_pct: n(igstRate), total_turnover: r2(total), allocation, note: "HO common cost cross-charged to branches pro-rata (Schedule I inter-branch supply); each leg attracts IGST. Post as inter-branch invoices." };
}

module.exports = { compositionCmp08, qrmp, rule86B, lateFeeInterest, b2cUpiQr, isdDistribution, crossCharge };
