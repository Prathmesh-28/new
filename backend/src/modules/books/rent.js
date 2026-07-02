"use strict";
// Rent register with §194-I TDS + escalation (roadmap #194). Tracks rent agreements and derives
// the escalated current rent, the 194-I TDS (10% land/building, 2% plant & machinery; 20% under
// §206AA when the landlord has no PAN; only when annual rent crosses the ₹2,40,000 threshold),
// and a forward monthly schedule. Pure computation over a non-RLS book_ table.
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");

const TDS_THRESHOLD = 240000; // §194-I annual aggregate (per landlord)
const r2 = (x) => Math.round(Number(x) * 100) / 100;
const monthsBetween = (from, to) => { const a = new Date(from), b = new Date(to); return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); };

// Rent for a given date, applying stepped escalation from the start date.
function rentOn(ag, onDate) {
  const escEvery = Number(ag.escalation_months) || 0;
  const elapsed = Math.max(0, monthsBetween(ag.start_date, onDate));
  const steps = escEvery > 0 ? Math.floor(elapsed / escEvery) : 0;
  return r2(Number(ag.monthly_rent) * Math.pow(1 + Number(ag.escalation_pct || 0) / 100, steps));
}

// §194-I TDS on a monthly rent (annualised for the threshold test).
function tdsFor(monthlyRent, ag) {
  const annual = monthlyRent * 12;
  if (ag.direction !== "paid" || annual <= TDS_THRESHOLD) return { applicable: false, rate: 0, amount: 0 };
  const rate = ag.landlord_pan ? Number(ag.tds_rate || 10) : 20; // 206AA: no PAN → 20%
  return { applicable: true, rate, amount: r2((monthlyRent * rate) / 100), no_pan: !ag.landlord_pan };
}

function decorate(ag, asOf = new Date()) {
  const rent = rentOn(ag, asOf);
  const tds = tdsFor(rent, ag);
  return {
    ...ag,
    monthly_rent: Number(ag.monthly_rent), deposit: Number(ag.deposit),
    current_rent: rent, annual_rent: r2(rent * 12),
    tds, net_payable: r2(rent - tds.amount),
  };
}

async function createRentAgreement(tenantId, actorId, r = {}) {
  if (!r.landlord || r.monthlyRent == null || !r.startDate) throw new PostError("BAD_INPUT", "landlord, monthlyRent, startDate required", 400);
  if (!(Number(r.monthlyRent) > 0)) throw new PostError("BAD_INPUT", "monthlyRent must be > 0", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_rent_agreements(tenant_id,landlord,landlord_pan,property,monthly_rent,deposit,start_date,end_date,escalation_pct,escalation_months,tds_rate,direction,notes,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [tenantId, r.landlord, r.landlordPan || null, r.property || null, r.monthlyRent, r.deposit || 0, r.startDate, r.endDate || null,
      r.escalationPct || 0, r.escalationMonths != null ? Math.round(r.escalationMonths) : 12, r.tdsRate != null ? r.tdsRate : 10,
      r.direction === "received" ? "received" : "paid", r.notes || null, actorId || null]);
  return decorate(rows[0]);
}

async function listRentAgreements(tenantId) {
  const { rows } = await pool.query("SELECT * FROM book_rent_agreements WHERE tenant_id=$1 ORDER BY status, landlord", [tenantId]);
  return rows.map((r) => decorate(r));
}

// Forward monthly schedule (default 12 months) with escalation + per-month §194-I TDS.
async function rentSchedule(tenantId, id, months = 12) {
  const { rows } = await pool.query("SELECT * FROM book_rent_agreements WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  const ag = rows[0];
  if (!ag) throw new PostError("NOT_FOUND", "Agreement not found", 404);
  const start = new Date(); start.setDate(1);
  const out = [];
  let totalRent = 0, totalTds = 0;
  for (let i = 0; i < Math.min(60, Math.max(1, months)); i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    if (ag.end_date && d > new Date(ag.end_date)) break;
    const rent = rentOn(ag, d);
    const tds = tdsFor(rent, ag);
    totalRent = r2(totalRent + rent); totalTds = r2(totalTds + tds.amount);
    out.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, rent, tds: tds.amount, net: r2(rent - tds.amount) });
  }
  return { agreement: decorate(ag), months: out, total_rent: totalRent, total_tds: totalTds, total_net: r2(totalRent - totalTds) };
}

async function endRentAgreement(tenantId, id) {
  const { rowCount } = await pool.query("UPDATE book_rent_agreements SET status='ended' WHERE tenant_id=$1 AND id=$2 AND status='active'", [tenantId, id]);
  if (!rowCount) throw new PostError("NOT_FOUND", "Active agreement not found", 404);
  return { ended: true };
}

module.exports = { createRentAgreement, listRentAgreements, rentSchedule, endRentAgreement, rentOn, tdsFor, TDS_THRESHOLD };
