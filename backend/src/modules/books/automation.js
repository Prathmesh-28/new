// §M8 - automation: approval rules + queue, configurable document numbering,
// late-fee / overdue reminders. Pure helpers are exported for testing.
const { pool } = require("../../db");
const { money, toDb, toRupees, gt } = require("./money");
const { PostError, postVoucher } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");

// ── Pure ─────────────────────────────────────────────────────────────────────
function formatDocNumber(fmt, number, fy) {
  const pad = String(number).padStart(fmt.pad || 0, "0");
  const mid = fmt.include_fy && fy ? `${fy}-${pad}` : pad;
  return `${fmt.prefix || ""}${mid}${fmt.suffix || ""}`;
}
function computeLateFee(amount, daysOverdue, ratePerAnnum) {
  if (daysOverdue <= 0) return money(0);
  return money(amount).mul(ratePerAnnum).div(100).mul(daysOverdue).div(365);
}
function ruleRequiresApproval(rules, entityType, amount) {
  return rules.some((r) => r.entity_type === entityType && money(amount).greaterThanOrEqualTo(r.min_amount));
}

// ── Approvals ────────────────────────────────────────────────────────────────
async function createRule(tenantId, r) {
  const { rows } = await pool.query("INSERT INTO book_approval_rules(tenant_id,entity_type,min_amount,approver_role) VALUES($1,$2,$3,$4) RETURNING *", [tenantId, r.entityType, toDb(r.minAmount || 0), r.approverRole || "owner"]);
  return rows[0];
}
async function requiresApproval(tenantId, entityType, amount) {
  const { rows } = await pool.query("SELECT * FROM book_approval_rules WHERE tenant_id=$1 AND entity_type=$2", [tenantId, entityType]);
  return ruleRequiresApproval(rows, entityType, amount);
}
async function requestApproval(tenantId, actorId, a) {
  const { rows } = await pool.query("INSERT INTO book_approvals(tenant_id,entity_type,entity_id,amount,requested_by,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [tenantId, a.entityType, a.entityId || null, toDb(a.amount || 0), actorId || null, a.note || null]);
  return rows[0];
}
async function decideApproval(tenantId, actorId, id, approve, note) {
  const { rows } = await pool.query("UPDATE book_approvals SET status=$3, decided_by=$4, note=COALESCE($5,note), decided_at=now() WHERE tenant_id=$1 AND id=$2 AND status='PENDING' RETURNING *", [tenantId, id, approve ? "APPROVED" : "REJECTED", actorId || null, note || null]);
  if (!rows[0]) throw new PostError("BAD_STATE", "Approval not found or already decided", 409);
  return rows[0];
}
async function listApprovals(tenantId, status) {
  const { rows } = status
    ? await pool.query("SELECT * FROM book_approvals WHERE tenant_id=$1 AND status=$2 ORDER BY created_at DESC", [tenantId, status])
    : await pool.query("SELECT * FROM book_approvals WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500", [tenantId]);
  return rows;
}

// ── Configurable numbering ───────────────────────────────────────────────────
async function setNumberFormat(tenantId, f) {
  const { rows } = await pool.query("INSERT INTO book_number_formats(tenant_id,doc_type,prefix,pad,suffix,include_fy) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,doc_type) DO UPDATE SET prefix=EXCLUDED.prefix,pad=EXCLUDED.pad,suffix=EXCLUDED.suffix,include_fy=EXCLUDED.include_fy RETURNING *", [tenantId, f.docType, f.prefix || "", f.pad || 4, f.suffix || "", f.includeFy !== false]);
  return rows[0];
}
async function formattedNumber(tenantId, docType, number, fy) {
  const { rows } = await pool.query("SELECT * FROM book_number_formats WHERE tenant_id=$1 AND doc_type=$2", [tenantId, docType]);
  const fmt = rows[0] || { prefix: `${docType.slice(0, 3).toUpperCase()}-`, pad: 4, suffix: "", include_fy: true };
  return formatDocNumber(fmt, number, fy);
}

// ── Overdue + late fees (reads outstanding SALES from the ledger) ────────────
async function overdue(tenantId, asOf, ratePerAnnum) {
  const today = asOf || new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT v.id, v.voucher_number, v.voucher_date, v.reference, v.party_ledger_id,
            COALESCE(pl.credit_period_days, 0) AS credit_period_days,
            COALESCE((SELECT SUM(e.debit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS gross,
            COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.target_voucher_id=v.id),0) AS allocated
       FROM book_vouchers v
       LEFT JOIN book_ledgers pl ON pl.id=v.party_ledger_id AND pl.tenant_id=v.tenant_id
      WHERE v.tenant_id=$1 AND v.voucher_type='SALES' AND v.is_cancelled=false`,
    [tenantId]
  );
  const invoices = [];
  const todayMs = new Date(today).getTime();
  for (const r of rows) {
    const outstanding = money(r.gross).minus(r.allocated);
    if (!gt(outstanding, 0)) continue;
    // Due date = voucher_date + credit_period_days; only count days past the due date.
    const creditDays = Number(r.credit_period_days) || 0;
    const dueMs = new Date(r.voucher_date).getTime() + creditDays * 86400000;
    const days = Math.max(0, Math.round((todayMs - dueMs) / 86400000));
    if (days <= 0) continue; // not yet due / due today - exclude from overdue list
    invoices.push({ voucherId: r.id, number: r.voucher_number, reference: r.reference, partyLedgerId: r.party_ledger_id, outstanding: toRupees(outstanding), daysOverdue: days, suggestedLateFee: toRupees(computeLateFee(outstanding, days, ratePerAnnum || 0)) });
  }
  return { asOf: today, ratePerAnnum: ratePerAnnum || 0, invoices };
}
async function postLateFee(tenantId, actorId, { partyLedgerId, amount, date }) {
  const lf = await ledgerIdByName(tenantId, "Late Fee Income");
  if (!lf) throw new PostError("NOT_SEEDED", "Late Fee Income ledger missing - seed first", 422);
  if (!partyLedgerId || amount == null) throw new PostError("BAD_INPUT", "partyLedgerId and amount required", 400);
  return postVoucher(tenantId, actorId, { voucherType: "JOURNAL", voucherDate: date || new Date().toISOString().slice(0, 10), narration: "Late fee", source: "api", partyLedgerId },
    [{ ledgerId: partyLedgerId, debit: toDb(amount), credit: "0" }, { ledgerId: lf, debit: "0", credit: toDb(amount) }]);
}

// Dunning - reads the book_reminders cadence (which was previously dead config) and
// returns the overdue invoices that have crossed a reminder stage, with the stage name
// and the suggested late fee. The owner-facing "who to chase" list; channel delivery
// (email/WhatsApp to the customer) is layered on top where contact + transport exist.
async function dunningDue(tenantId, asOf) {
  const { rows: rem } = await pool.query("SELECT * FROM book_reminders WHERE tenant_id=$1 ORDER BY days_after_due", [tenantId]);
  if (!rem.length) return { reminders: [], due: [] };
  const maxRate = Math.max(0, ...rem.map((r) => Number(r.fee_percent_pa) || 0));
  const od = await overdue(tenantId, asOf, maxRate);
  const due = od.invoices.map((inv) => {
    const stage = rem.filter((r) => inv.daysOverdue >= Number(r.days_after_due)).sort((a, b) => b.days_after_due - a.days_after_due)[0];
    return stage ? { ...inv, reminderStage: stage.name, daysAfterDue: stage.days_after_due } : null;
  }).filter(Boolean);
  return { asOf: od.asOf, reminders: rem, due };
}

// ── Numbering audit (gaps + duplicates) ──────────────────────────────────────
// The counter is gap-free by design (book_voucher_counters.next_number), but
// cancellations and any manual/legacy gaps should still surface as a control
// report. For each voucher_type in the FY (or just `voucherType` if given) we
// scan non-cancelled vouchers and report missing numbers in 1..max and any
// duplicate voucher_numbers. Read-only.
async function numberGaps(tenantId, fy, voucherType) {
  const params = [tenantId, fy];
  let typeFilter = "";
  if (voucherType) { params.push(voucherType); typeFilter = " AND voucher_type=$3"; }
  const { rows } = await pool.query(
    `SELECT voucher_type, voucher_number, COUNT(*)::int AS cnt
       FROM book_vouchers
      WHERE tenant_id=$1 AND financial_year=$2 AND is_cancelled=false${typeFilter}
      GROUP BY voucher_type, voucher_number
      ORDER BY voucher_type, voucher_number`,
    params
  );
  const byType = new Map();
  for (const r of rows) {
    const n = Number(r.voucher_number);
    let g = byType.get(r.voucher_type);
    if (!g) { g = { voucherType: r.voucher_type, max: 0, present: new Set(), duplicates: [] }; byType.set(r.voucher_type, g); }
    if (n > g.max) g.max = n;
    g.present.add(n);
    if (Number(r.cnt) > 1) g.duplicates.push(n);
  }
  const out = [];
  for (const g of byType.values()) {
    const missing = [];
    for (let n = 1; n <= g.max; n++) if (!g.present.has(n)) missing.push(n);
    out.push({ voucherType: g.voucherType, max: g.max, missing, duplicates: g.duplicates.sort((a, b) => a - b) });
  }
  return out;
}

module.exports = { formatDocNumber, computeLateFee, ruleRequiresApproval, createRule, requiresApproval, requestApproval, decideApproval, listApprovals, setNumberFormat, formattedNumber, overdue, postLateFee, dunningDue, numberGaps };
