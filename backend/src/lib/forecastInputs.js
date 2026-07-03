"use strict";
// Forecast real-data bridge. Assembles the forecast engine's authoritative drivers
// from the REAL system-of-record tables — so the (deep, client-side) forecast runs on
// the tenant's actual money instead of the hand-kept KV AppStore:
//
//   • startBalance  ← Books GL cash + bank ledger balances (debit-positive signed sum)
//   • receivables   ← open invoices (invoices table) with due dates
//   • obligations   ← upcoming loan installments (loan_schedule)   [payroll/GST next]
//
// RLS NOTE: `loans`/`loan_schedule` AND `invoices` (migration 0015) are FORCE-RLS (tenant
// GUC) — they MUST be read via q(tenantId,...) or a plain pool.query returns 0 rows in prod.
// `book_*` are NOT RLS'd, so they use pool.query scoped by tenant_id in the WHERE clause.
const { pool } = require("../db");
const { q } = require("./tenantDb");
const { trialBalance } = require("../modules/books/reports");
const { financialYearFor } = require("../modules/books/fy");

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function assembleForecastInputs(tenantId) {
  const asOf = new Date().toISOString().slice(0, 10);

  // ── Start balance: cash + bank ledgers from the GL (assets are debit-positive) ──
  let startBalance = 0;
  let startBalanceSource = "books";
  try {
    const tb = await trialBalance(tenantId, financialYearFor(new Date()), asOf);
    startBalance = tb.ledgers
      .filter((l) => l.nature === "ASSET" && /(bank|cash)/i.test(l.name))
      .reduce((s, l) => s + (Number(l.debit) - Number(l.credit)), 0);
    startBalance = Math.round(startBalance * 100) / 100;
  } catch {
    startBalanceSource = "unavailable"; // books not initialised for this tenant
  }

  // ── Receivables: open invoices (not draft/paid/cancelled/void) with due dates ──
  const { rows: rec } = await q(tenantId, // invoices is FORCE-RLS (0015) → read via q()
    `SELECT id, invoice_number, customer_name, total_amount, due_date, status, created_at
       FROM invoices
      WHERE tenant_id = $1
        AND status NOT IN ('draft','paid','cancelled','void')
        AND total_amount > 0
      ORDER BY due_date NULLS LAST
      LIMIT 500`,
    [tenantId]
  );
  const receivables = rec.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    customer: r.customer_name,
    amount: Number(r.total_amount),
    issueDate: iso(r.created_at), // real issue date — the engine's DSO/90-day-sales key
    dueDate: iso(r.due_date),
    status: r.status,
  }));

  // ── Obligations: upcoming loan installments from the repayment schedule ──
  //    (RLS-scoped via q; the GUC filters both loan_schedule and loans to the tenant.)
  const obligations = [];
  try {
    const { rows: sch } = await q(
      tenantId,
      `SELECT s.id, s.installment_no, s.due_date,
              (s.principal_due + s.interest_due) AS amount, l.kind
         FROM loan_schedule s
         JOIN loans l ON l.id = s.loan_id AND l.tenant_id = $1
        WHERE l.tenant_id = $1
          AND s.status IN ('due','overdue','partial')
          AND (s.principal_due + s.interest_due) > 0
        ORDER BY s.due_date
        LIMIT 200`,
      [tenantId]
    );
    for (const r of sch) {
      obligations.push({
        id: `loan:${r.id}`,
        type: "loan",
        label: `Loan (${r.kind}) installment ${r.installment_no}`,
        amount: Number(r.amount),
        dueDate: iso(r.due_date),
      });
    }
  } catch {
    /* lending tables absent for this tenant → no loan obligations */
  }

  return {
    asOf,
    startBalance,
    startBalanceSource,
    receivables,
    obligations,
    meta: {
      receivablesCount: receivables.length,
      obligationsCount: obligations.length,
      // Next drivers to bridge in: payroll (HRMS runs) + GST/TDS liability due dates.
      pending: ["payroll", "gst"],
    },
  };
}

module.exports = { assembleForecastInputs };
