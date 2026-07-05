"use strict";
// Data-retention automation (D5, 2026-07 gap audit). Until now retention was entirely
// unimplemented: deletion_requests only ever received INSERTs (nothing ever read or
// processed them), and no job aged out anything, anywhere. Three independent pieces:
//   1. processDeletionRequests — executes a tenant's own erasure request after a grace
//      window (self-requested via POST /api/account/deletion-request; never someone else's).
//   2. purgeAuditLog — ages out audit_log past the 1-2yr window docs/COMPLIANCE.md commits to.
//   3. purgeStatutoryRecords — ages out invoices/transactions/loans past the 8yr GST/IT-Act
//      window. This is genuinely destructive at scale, so it is DRY-RUN by default: it only
//      counts and logs what WOULD be purged unless RETENTION_PURGE_ENFORCE=true is set,
//      mirroring how other high-blast-radius toggles in this codebase (e.g. entitlements
//      enforcement) default off until explicitly turned on.
const { pool } = require("../db");
const { q } = require("./tenantDb");
const { writeAudit } = require("./audit");

const GRACE_DAYS = 7; // time to notice/cancel an accidental self-deletion request
const AUDIT_LOG_RETENTION_YEARS = 2;
const STATUTORY_RETENTION_YEARS = 8; // GST Act / Income Tax Act record-keeping requirement
const ENFORCE = () => process.env.RETENTION_PURGE_ENFORCE === "true";

// The exact tenant wipe POST /api/admin/org's DELETE route already performs — shared here
// so a self-requested deletion and an admin-initiated one can never drift apart.
async function wipeTenant(tenantId) {
  await pool.query("DELETE FROM users WHERE tenant_id=$1", [tenantId]);
  await pool.query("DELETE FROM kv_store WHERE tenant_id=$1", [tenantId]);
  await pool.query("DELETE FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
  await pool.query("DELETE FROM tenant_billing WHERE tenant_id=$1", [tenantId]);
}

async function processDeletionRequests() {
  const { rows } = await pool.query(
    `SELECT id, tenant_id FROM deletion_requests
      WHERE status = 'pending' AND created_at < now() - interval '${GRACE_DAYS} days'`
  );
  let processed = 0;
  for (const r of rows) {
    try {
      await wipeTenant(r.tenant_id);
      await pool.query("UPDATE deletion_requests SET status='completed' WHERE id=$1", [r.id]);
      writeAudit(null, "tenant.erasure_completed", "tenant", r.tenant_id, { deletion_request_id: r.id, grace_days: GRACE_DAYS });
      processed++;
    } catch (e) {
      console.error("[retention] deletion request failed for", r.tenant_id, e.message);
    }
  }
  return processed;
}

async function purgeAuditLog() {
  const { rowCount } = await pool.query(
    `DELETE FROM audit_log WHERE created_at < now() - interval '${AUDIT_LOG_RETENTION_YEARS} years'`
  );
  return rowCount || 0;
}

// FORCE-RLS tables need q(tenantId,...); transactions/active_loans aren't RLS'd, so a
// plain tenant-filtered pool.query is correct and matches how those tables are read
// elsewhere in the codebase.
async function purgeStatutoryRecords() {
  const enforce = ENFORCE();
  const cutoff = `now() - interval '${STATUTORY_RETENTION_YEARS} years'`;
  const { rows: tenants } = await pool.query("SELECT DISTINCT tenant_id FROM users WHERE tenant_id IS NOT NULL");
  const counts = { invoices: 0, transactions: 0, loans: 0 };
  for (const { tenant_id: tenantId } of tenants) {
    try {
      if (enforce) {
        const inv = await q(tenantId, `DELETE FROM invoices WHERE tenant_id=$1 AND created_at < ${cutoff}`, [tenantId]);
        counts.invoices += inv.rowCount || 0;
        const loan = await q(tenantId, `DELETE FROM loans WHERE tenant_id=$1 AND created_at < ${cutoff} AND status IN ('closed','written_off')`, [tenantId]);
        counts.loans += loan.rowCount || 0;
        const txn = await pool.query(`DELETE FROM transactions WHERE tenant_id=$1 AND created_at < ${cutoff}`, [tenantId]);
        counts.transactions += txn.rowCount || 0;
      } else {
        const inv = await q(tenantId, `SELECT COUNT(*)::int AS n FROM invoices WHERE tenant_id=$1 AND created_at < ${cutoff}`, [tenantId]);
        counts.invoices += inv.rows[0]?.n || 0;
        const loan = await q(tenantId, `SELECT COUNT(*)::int AS n FROM loans WHERE tenant_id=$1 AND created_at < ${cutoff} AND status IN ('closed','written_off')`, [tenantId]);
        counts.loans += loan.rows[0]?.n || 0;
        const txn = await pool.query(`SELECT COUNT(*)::int AS n FROM transactions WHERE tenant_id=$1 AND created_at < ${cutoff}`, [tenantId]);
        counts.transactions += txn.rows[0]?.n || 0;
      }
    } catch (e) {
      console.error("[retention] statutory scan failed for", tenantId, e.message);
    }
  }
  if (!enforce && (counts.invoices || counts.transactions || counts.loans)) {
    console.log(`[retention] DRY RUN — would purge (set RETENTION_PURGE_ENFORCE=true to actually delete):`, counts);
  }
  return { enforced: enforce, ...counts };
}

module.exports = { processDeletionRequests, purgeAuditLog, purgeStatutoryRecords, wipeTenant, GRACE_DAYS };
