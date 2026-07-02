"use strict";
// Diligence data-room generator (roadmap #198). Assembles the index a lender/investor expects —
// financial statements, statutory compliance, contracts/documents, assets/banking, ownership —
// marking each item present or missing (with counts and the report endpoint to pull it), plus a
// completeness %. Complements the exit-readiness SCORE (#199): this is the organised MANIFEST.
const { pool } = require("../db");

async function scalar(db, sql, params, def = 0) {
  try { const { rows } = await db.query(sql, params); return Number(Object.values(rows[0] || {})[0] ?? def); }
  catch { return def; }
}

async function dataRoom(tenantId, fy, db = pool) {
  const [vTotal, gstN, tdsN, auditN, attachN, rentN, expiryN, assetN, bankN, equityMoves] = await Promise.all([
    scalar(db, "SELECT count(*) FROM book_vouchers WHERE tenant_id=$1 AND is_cancelled=false", [tenantId]),
    scalar(db, "SELECT count(*) FROM gst_returns WHERE tenant_id=$1", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_tax_entries WHERE tenant_id=$1 AND tax_kind='TDS'", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_audit_log WHERE tenant_id=$1", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_attachments WHERE tenant_id=$1", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_rent_agreements WHERE tenant_id=$1", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_expiry_items WHERE tenant_id=$1 AND status='active'", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_fixed_assets WHERE tenant_id=$1", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_ledgers WHERE tenant_id=$1 AND is_bank=true", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_voucher_entries e JOIN book_ledgers l ON l.id=e.ledger_id JOIN book_account_groups g ON g.id=l.group_id AND g.nature='EQUITY' WHERE e.tenant_id=$1", [tenantId]),
  ]);
  const hasBooks = vTotal > 0;

  const sections = [
    {
      title: "Financial statements", items: [
        { name: "Trial Balance", available: hasBooks, endpoint: `/api/books/reports/trial-balance?fy=${fy}` },
        { name: "Profit & Loss", available: hasBooks, endpoint: `/api/books/reports/profit-loss?fy=${fy}` },
        { name: "Balance Sheet", available: hasBooks, endpoint: `/api/books/reports/balance-sheet?fy=${fy}` },
        { name: "Cash Flow", available: hasBooks, endpoint: `/api/books/reports/cash-flow?fy=${fy}` },
      ],
    },
    {
      title: "Statutory compliance", items: [
        { name: "GST returns", available: gstN > 0, count: gstN },
        { name: "TDS entries (26Q)", available: tdsN > 0, count: tdsN, endpoint: "/api/books/tax/tds-return" },
        { name: "Tamper-proof audit trail", available: auditN > 0, count: auditN, endpoint: "/api/audit/verify" },
      ],
    },
    {
      title: "Contracts & documents", items: [
        { name: "Supporting documents / attachments", available: attachN > 0, count: attachN },
        { name: "Rent / lease agreements", available: rentN > 0, count: rentN, endpoint: "/api/books/rent" },
        { name: "Licenses & renewals tracked", available: expiryN > 0, count: expiryN, endpoint: "/api/books/expiry-items" },
      ],
    },
    {
      title: "Assets & banking", items: [
        { name: "Fixed-asset register", available: assetN > 0, count: assetN, endpoint: "/api/books/assets/register" },
        { name: "Bank accounts", available: bankN > 0, count: bankN },
      ],
    },
    {
      title: "Ownership & capital", items: [
        { name: "Capital account activity", available: equityMoves > 0, endpoint: `/api/books/reports/owner-capital?fy=${fy}` },
      ],
    },
  ];

  const all = sections.flatMap((s) => s.items);
  const available = all.filter((i) => i.available).length;
  const completeness = all.length ? Math.round((100 * available) / all.length) : 0;
  const missing = all.filter((i) => !i.available).map((i) => i.name);

  return {
    financialYear: fy,
    sections,
    completeness,
    items_total: all.length,
    items_available: available,
    missing,
    note: "A shareable diligence index of what's on file. Pull each present item from its endpoint; complete the missing items to make the data-room investor-ready.",
  };
}

module.exports = { dataRoom };
