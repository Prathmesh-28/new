"use strict";
// Debt covenant tracker (roadmap #21 slice). Loan covenants (DSCR >= x, leverage <= y, …) as real
// rows with periodic test results — recording an actual value auto-evaluates met/breached against
// the operator+threshold, so breaches are queryable/alertable instead of buried in a KV blob.
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");

const OPERATORS = { gte: (a, b) => a >= b, lte: (a, b) => a <= b, gt: (a, b) => a > b, lt: (a, b) => a < b };
const OP_LABEL = { gte: "≥", lte: "≤", gt: ">", lt: "<" };
const num = (v) => Number(v);

function evaluate(operator, actual, threshold) {
  const fn = OPERATORS[operator];
  return fn && fn(num(actual), num(threshold)) ? "met" : "breached";
}

async function createCovenant(tenantId, actorId, c = {}) {
  if (!c.name || !c.metric || c.threshold == null) throw new PostError("BAD_INPUT", "name, metric, threshold required", 400);
  if (!OPERATORS[c.operator]) throw new PostError("BAD_INPUT", "operator must be gte|lte|gt|lt", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_debt_covenants(tenant_id,name,lender,metric,operator,threshold,frequency,notes,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [tenantId, c.name, c.lender || null, c.metric, c.operator, c.threshold, c.frequency || "quarterly", c.notes || null, actorId || null]);
  return decorate(rows[0], null);
}

function decorate(cov, latest) {
  return {
    ...cov, threshold: num(cov.threshold),
    condition: `${cov.metric} ${OP_LABEL[cov.operator]} ${num(cov.threshold)}`,
    latest_test: latest ? { as_of: latest.as_of, actual_value: num(latest.actual_value), result: latest.result } : null,
    current_status: latest ? latest.result : "untested",
  };
}

async function listCovenants(tenantId) {
  const { rows } = await pool.query("SELECT * FROM book_debt_covenants WHERE tenant_id=$1 ORDER BY status, name", [tenantId]);
  const out = [];
  for (const cov of rows) {
    const { rows: t } = await pool.query("SELECT * FROM book_covenant_tests WHERE covenant_id=$1 ORDER BY as_of DESC LIMIT 1", [cov.id]);
    out.push(decorate(cov, t[0] || null));
  }
  return out;
}

// Record a test reading → auto-evaluate met/breached.
async function recordTest(tenantId, covenantId, { asOf, actualValue } = {}) {
  if (actualValue == null || isNaN(num(actualValue))) throw new PostError("BAD_INPUT", "actualValue (number) required", 400);
  const { rows: cr } = await pool.query("SELECT * FROM book_debt_covenants WHERE tenant_id=$1 AND id=$2", [tenantId, covenantId]);
  const cov = cr[0];
  if (!cov) throw new PostError("NOT_FOUND", "Covenant not found", 404);
  const result = evaluate(cov.operator, actualValue, cov.threshold);
  const { rows } = await pool.query(
    "INSERT INTO book_covenant_tests(covenant_id,tenant_id,as_of,actual_value,result) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [covenantId, tenantId, asOf || new Date().toISOString().slice(0, 10), actualValue, result]);
  return { test: { ...rows[0], actual_value: num(rows[0].actual_value) }, result, breached: result === "breached", condition: `${cov.metric} ${OP_LABEL[cov.operator]} ${num(cov.threshold)}` };
}

async function listTests(tenantId, covenantId) {
  const { rows } = await pool.query("SELECT * FROM book_covenant_tests WHERE tenant_id=$1 AND covenant_id=$2 ORDER BY as_of DESC", [tenantId, covenantId]);
  return rows.map((r) => ({ ...r, actual_value: num(r.actual_value) }));
}

async function closeCovenant(tenantId, id) {
  const { rowCount } = await pool.query("UPDATE book_debt_covenants SET status='closed' WHERE tenant_id=$1 AND id=$2 AND status='active'", [tenantId, id]);
  if (!rowCount) throw new PostError("NOT_FOUND", "Active covenant not found", 404);
  return { closed: true };
}

module.exports = { createCovenant, listCovenants, recordTest, listTests, closeCovenant, evaluate };
