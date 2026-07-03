"use strict";
// Company-law / ROC secretarial backend. The frontend CompliancePage renders rich register UIs
// but they lived in the KV bag (not queryable, reportable, or auditable). This persists the four
// statutory registers (members, directors, charges, related-party) in real tables, computes the
// AOC-4 / MGT-7 prep sheets from the ledger, and runs the Section 188 RPT threshold test.
const { pool } = require("../../db");
const reports = require("./reports");
const { writeAudit } = require("../../lib/audit");

class RocError extends Error { constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; } }
const n = (v) => (v == null ? 0 : Number(v));

// Generic register helpers keyed to the four tables + their writable columns.
const REGISTERS = {
  members:   { table: "book_members_register",   cols: ["name", "pan", "folio", "share_class", "shares_held", "holding_pct", "is_sbo", "joined_on", "ceased_on", "notes"], order: "name" },
  directors: { table: "book_directors_register", cols: ["name", "din", "designation", "pan", "is_kmp", "appointed_on", "resigned_on", "dsc_expires_on", "notes"], order: "name" },
  charges:   { table: "book_charges_register",   cols: ["charge_holder", "charge_id", "charge_type", "amount", "asset_desc", "created_on", "satisfied_on", "status", "notes"], order: "created_on DESC NULLS LAST" },
  rpt:       { table: "book_rpt_register",        cols: ["fy", "party_name", "relation", "nature", "amount", "arms_length", "board_approved_on", "shareholder_approved_on", "notes"], order: "created_at DESC" },
};
function reg(kind) { const r = REGISTERS[kind]; if (!r) throw new RocError("BAD_INPUT", `Unknown register '${kind}'`, 400); return r; }

async function listRegister(tenantId, kind) {
  const r = reg(kind);
  const { rows } = await pool.query(`SELECT * FROM ${r.table} WHERE tenant_id=$1 ORDER BY ${r.order}`, [tenantId]);
  return rows;
}
async function addRegisterRow(tenantId, actorId, kind, body = {}) {
  const r = reg(kind);
  const cols = r.cols.filter((c) => body[c] !== undefined);
  if (!cols.length) throw new RocError("BAD_INPUT", "nothing to insert", 400);
  const vals = cols.map((_, i) => `$${i + 2}`);
  const { rows } = await pool.query(
    `INSERT INTO ${r.table}(tenant_id, ${cols.join(", ")}) VALUES($1, ${vals.join(", ")}) RETURNING *`,
    [tenantId, ...cols.map((c) => body[c])]);
  writeAudit(actorId, "roc.register.add", kind, rows[0].id, { table: r.table }).catch(() => {});
  return rows[0];
}
async function updateRegisterRow(tenantId, actorId, kind, id, body = {}) {
  const r = reg(kind);
  const cols = r.cols.filter((c) => body[c] !== undefined);
  if (!cols.length) throw new RocError("BAD_INPUT", "nothing to update", 400);
  const sets = cols.map((c, i) => `${c}=$${i + 3}`);
  const { rows } = await pool.query(
    `UPDATE ${r.table} SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [tenantId, id, ...cols.map((c) => body[c])]);
  if (!rows[0]) throw new RocError("NOT_FOUND", "Row not found", 404);
  writeAudit(actorId, "roc.register.update", kind, id, { table: r.table }).catch(() => {});
  return rows[0];
}
async function removeRegisterRow(tenantId, actorId, kind, id) {
  const r = reg(kind);
  const { rowCount } = await pool.query(`DELETE FROM ${r.table} WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
  if (!rowCount) throw new RocError("NOT_FOUND", "Row not found", 404);
  writeAudit(actorId, "roc.register.remove", kind, id, { table: r.table }).catch(() => {});
  return { removed: true };
}

// AOC-4 (financial statements) + MGT-7 (annual return) prep sheet — figures from the ledger,
// register counts from the persisted registers, due dates from the AGM date.
async function rocPrep(tenantId, fy, { agmDate, entityType = "private" } = {}) {
  if (!fy) throw new RocError("BAD_INPUT", "fy required", 400);
  const pl = await reports.profitLoss(tenantId, fy);
  const bs = await reports.balanceSheet(tenantId, fy);
  const [{ rows: mem }, { rows: dir }, { rows: chg }] = await Promise.all([
    pool.query("SELECT COUNT(*)::int c, COALESCE(SUM(shares_held),0) s FROM book_members_register WHERE tenant_id=$1 AND ceased_on IS NULL", [tenantId]),
    pool.query("SELECT COUNT(*)::int c FROM book_directors_register WHERE tenant_id=$1 AND resigned_on IS NULL", [tenantId]),
    pool.query("SELECT COUNT(*)::int c FROM book_charges_register WHERE tenant_id=$1 AND status='open'", [tenantId]),
  ]);
  // Due dates: AOC-4 within 30 days of AGM; MGT-7 within 60 days of AGM.
  let aoc4Due = null, mgt7Due = null;
  if (agmDate) {
    const a = new Date(agmDate);
    aoc4Due = new Date(a.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    mgt7Due = new Date(a.getTime() + 60 * 86400000).toISOString().slice(0, 10);
  }
  const smallCompany = entityType === "small" || entityType === "opc";
  return {
    financial_year: fy, agm_date: agmDate || null, entity_type: entityType,
    aoc4: {
      form: smallCompany ? "AOC-4" : "AOC-4 / AOC-4 XBRL",
      due: aoc4Due,
      turnover: n(pl.totalIncome), net_profit: n(pl.netProfit),
      total_assets: n(bs.totalAssets), total_liabilities: n(bs.totalLiabilities), net_worth: n(bs.totalEquity),
    },
    mgt7: {
      form: smallCompany ? "MGT-7A" : "MGT-7",
      due: mgt7Due,
      members: mem[0].c, shares_outstanding: n(mem[0].s), directors: dir[0].c, open_charges: chg[0].c,
    },
    note: "Prep sheet — figures from the ledger + statutory registers. Verify against signed financials before filing on the MCA portal.",
  };
}

// Section 188 threshold test: which RPTs in the FY cross the limits that need a shareholder
// ordinary resolution (Rule 15 of the Companies (Meetings of Board) Rules).
async function section188(tenantId, fy) {
  const useFy = fy || (() => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; })();
  const pl = await reports.profitLoss(tenantId, useFy);
  const bs = await reports.balanceSheet(tenantId, useFy);
  const turnover = n(pl.totalIncome), netWorth = n(bs.totalEquity);
  const { rows } = await pool.query("SELECT * FROM book_rpt_register WHERE tenant_id=$1 AND (fy=$2 OR fy IS NULL) ORDER BY amount DESC", [tenantId, useFy]);
  // Threshold basis: property → 10% of net worth; else → 10% of turnover.
  const checks = rows.map((r) => {
    const propertyLike = /property/i.test(r.nature || "");
    const base = propertyLike ? netWorth : turnover;
    const thresholdAmt = base * 0.10;
    const needsShareholder = base > 0 && n(r.amount) > thresholdAmt;
    const approvalOk = !needsShareholder || !!r.shareholder_approved_on;
    return {
      id: r.id, party_name: r.party_name, relation: r.relation, nature: r.nature, amount: n(r.amount),
      arms_length: r.arms_length, basis: propertyLike ? "net_worth" : "turnover", threshold: Math.round(thresholdAmt),
      needs_shareholder_approval: needsShareholder,
      board_approved: !!r.board_approved_on, shareholder_approved: !!r.shareholder_approved_on,
      compliant: (r.arms_length || !!r.board_approved_on) && approvalOk,
    };
  });
  return {
    fy: useFy, turnover, net_worth: netWorth,
    transactions: checks,
    breaches: checks.filter((c) => !c.compliant),
    note: "Sec 188: RPTs above 10% of turnover (goods/services/lease) or 10% of net worth (property) need a shareholder ordinary resolution; non-arm's-length RPTs need board approval and AOC-2 disclosure.",
  };
}

module.exports = {
  RocError, listRegister, addRegisterRow, updateRegisterRow, removeRegisterRow, rocPrep, section188,
};
