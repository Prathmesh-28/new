"use strict";
// Fraud Sentinel (#142) — read-only forensic scans over the ledger. No new source of truth, no
// external creds: it surfaces patterns a bookkeeper/auditor looks for. Every finding links to
// real vouchers/ledgers so the owner can verify. Nothing is auto-actioned — these are flags.
//   • ghost vendors  — paid parties with NO GSTIN and NO PAN (unverifiable payees)
//   • structured cash — same party, same day, multiple sub-₹10k cash payments summing over (40A(3))
//   • round-tripping  — a counterparty that is both a customer AND a vendor with material 2-way volume
//   • duplicate pays  — same party + same amount within a short window
const { pool } = require("../../db");
const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round(Number(v) * 100) / 100;

// Paid parties with neither GSTIN nor PAN — unverifiable payees (a classic ghost-vendor tell).
async function ghostVendors(tenantId, { minTotal = 25000 } = {}) {
  const { rows } = await pool.query(
    `SELECT pl.id, pl.name,
            COUNT(DISTINCT v.id) AS payments,
            COALESCE(SUM((SELECT SUM(e.debit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id)),0) AS total
       FROM book_vouchers v
       JOIN book_ledgers pl ON pl.id=v.party_ledger_id AND pl.tenant_id=v.tenant_id
      WHERE v.tenant_id=$1 AND v.voucher_type='PAYMENT' AND v.is_cancelled=false
        AND COALESCE(NULLIF(TRIM(pl.gstin),''),NULL) IS NULL AND COALESCE(NULLIF(TRIM(pl.pan),''),NULL) IS NULL
      GROUP BY pl.id, pl.name
     HAVING COALESCE(SUM((SELECT SUM(e.debit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id)),0) >= $2
      ORDER BY total DESC LIMIT 100`, [tenantId, minTotal]).catch(() => ({ rows: [] }));
  return rows.map((r) => ({ ledger_id: r.id, name: r.name, payments: Number(r.payments), total_paid: r2(n(r.total)), risk: "No GSTIN/PAN on file — verify the payee is genuine." }));
}

// Structured cash payments: same party + same day, ≥2 cash payments each under ₹10,000 but
// summing to ₹10,000+ — a pattern that games the 40A(3) cash-disallowance limit.
async function structuredCash(tenantId) {
  const { rows } = await pool.query(
    `SELECT v.id, v.voucher_date, COALESCE(pl.name,'(no party)') AS party, v.party_ledger_id,
            (SELECT SUM(e.credit) FROM book_voucher_entries e JOIN book_ledgers l ON l.id=e.ledger_id
               WHERE e.voucher_id=v.id AND l.is_bank=false AND LOWER(l.name) LIKE '%cash%') AS cash_out
       FROM book_vouchers v
       LEFT JOIN book_ledgers pl ON pl.id=v.party_ledger_id
      WHERE v.tenant_id=$1 AND v.voucher_type='PAYMENT' AND v.is_cancelled=false AND v.party_ledger_id IS NOT NULL`,
    [tenantId]).catch(() => ({ rows: [] }));
  const byKey = new Map();
  for (const r of rows) {
    const c = n(r.cash_out); if (!(c > 0)) continue;
    const key = `${r.party_ledger_id}|${new Date(r.voucher_date).toISOString().slice(0, 10)}`;
    const g = byKey.get(key) || { party: r.party, date: new Date(r.voucher_date).toISOString().slice(0, 10), count: 0, total: 0, maxSingle: 0 };
    g.count++; g.total = r2(g.total + c); g.maxSingle = Math.max(g.maxSingle, c);
    byKey.set(key, g);
  }
  return [...byKey.values()].filter((g) => g.count >= 2 && g.maxSingle < 10000 && g.total >= 10000)
    .sort((a, b) => b.total - a.total).slice(0, 100)
    .map((g) => ({ party: g.party, date: g.date, payments: g.count, total: r2(g.total), risk: "Multiple sub-₹10k cash payments same day summing over the 40A(3) limit — possible structuring." }));
}

// Round-tripping: a counterparty appearing as BOTH a customer (SALES) and a vendor (PURCHASE)
// with material volume both ways — a circular-billing tell.
async function roundTripping(tenantId, { minEachSide = 50000 } = {}) {
  const { rows } = await pool.query(
    `SELECT LOWER(pl.name) AS key, MAX(pl.name) AS name,
            COALESCE(SUM(CASE WHEN v.voucher_type='SALES'    THEN (SELECT SUM(e.credit)-SUM(e.debit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id) ELSE 0 END),0) AS sales,
            COALESCE(SUM(CASE WHEN v.voucher_type='PURCHASE' THEN (SELECT SUM(e.credit)-SUM(e.debit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id) ELSE 0 END),0) AS purchase
       FROM book_vouchers v JOIN book_ledgers pl ON pl.id=v.party_ledger_id AND pl.tenant_id=v.tenant_id
      WHERE v.tenant_id=$1 AND v.is_cancelled=false AND v.voucher_type IN ('SALES','PURCHASE')
      GROUP BY LOWER(pl.name)`, [tenantId]).catch(() => ({ rows: [] }));
  return rows.map((r) => ({ name: r.name, sales: r2(Math.abs(n(r.sales))), purchase: r2(Math.abs(n(r.purchase))) }))
    .filter((r) => r.sales >= minEachSide && r.purchase >= minEachSide)
    .sort((a, b) => (b.sales + b.purchase) - (a.sales + a.purchase)).slice(0, 100)
    .map((r) => ({ ...r, risk: "Same party is both a customer and a vendor with material two-way volume — check for circular/round-trip billing." }));
}

// Duplicate payments: same party + same amount within 7 days (potential double payment).
async function duplicatePayments(tenantId) {
  const { rows: pays } = await pool.query(
    `SELECT pl.name AS party, v.voucher_date,
            (SELECT SUM(e.debit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id) AS amt
       FROM book_vouchers v JOIN book_ledgers pl ON pl.id=v.party_ledger_id
      WHERE v.tenant_id=$1 AND v.voucher_type='PAYMENT' AND v.is_cancelled=false AND v.party_ledger_id IS NOT NULL`,
    [tenantId]).catch(() => ({ rows: [] }));
  const byPartyAmt = new Map();
  for (const p of pays) {
    const amt = r2(n(p.amt)); if (!(amt > 0)) continue;
    const key = `${p.party}|${amt}`;
    const g = byPartyAmt.get(key) || { party: p.party, amount: amt, dates: [] };
    g.dates.push(new Date(p.voucher_date).getTime());
    byPartyAmt.set(key, g);
  }
  const out = [];
  for (const g of byPartyAmt.values()) {
    if (g.dates.length < 2) continue;
    g.dates.sort((a, b) => a - b);
    for (let i = 1; i < g.dates.length; i++) {
      if ((g.dates[i] - g.dates[i - 1]) <= 7 * 86400000) { out.push({ party: g.party, amount: g.amount, count: g.dates.length, risk: "Same party paid the same amount within 7 days — possible duplicate payment." }); break; }
    }
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, 100);
}

async function scan(tenantId) {
  const [ghost, structured, roundtrip, dupes] = await Promise.all([
    ghostVendors(tenantId), structuredCash(tenantId), roundTripping(tenantId), duplicatePayments(tenantId),
  ]);
  const total = ghost.length + structured.length + roundtrip.length + dupes.length;
  return {
    scanned_at: new Date().toISOString(),
    summary: { ghost_vendors: ghost.length, structured_cash: structured.length, round_tripping: roundtrip.length, duplicate_payments: dupes.length, total_findings: total },
    risk_level: total === 0 ? "clean" : total <= 3 ? "low" : total <= 10 ? "medium" : "high",
    ghost_vendors: ghost, structured_cash: structured, round_tripping: roundtrip, duplicate_payments: dupes,
    note: "Read-only forensic flags — not proof of fraud. Review each against the underlying vouchers before acting.",
  };
}

module.exports = { scan, ghostVendors, structuredCash, roundTripping, duplicatePayments };
