const { pool } = require("../db");

// Fire-and-forget audit trail. Admin/org mutations call this so there's an
// accountable record of "who changed what". Never block or fail the request on
// an audit write - swallow errors.
// tenantId is what makes the per-record activity timeline possible (0033 added the
// column): without it, "show me this invoice's history" could only be answered by
// scanning entity_id across every tenant. Callers that know the ACTING tenant should
// pass it — under impersonation or a multi-firm switch it differs from the actor's home
// firm; when omitted we fall back to the actor's own tenant so old call sites still record.
async function writeAudit(userId, action, entity, entityId, meta, tenantId) {
  try {
    await pool.query(
      `INSERT INTO audit_log(user_id, action, entity, entity_id, meta, tenant_id)
       VALUES($1,$2,$3,$4,$5, COALESCE($6, (SELECT tenant_id FROM users WHERE id=$1)))`,
      [userId || null, action, entity || null, entityId != null ? String(entityId) : null, meta || null, tenantId || null]
    );
  } catch {
    /* auditing must never break the action it records */
  }
}

// Convenience wrapper for route handlers: pulls the acting tenant off the request so a
// caller can never forget it.
const auditReq = (req, action, entity, entityId, meta) =>
  writeAudit(req.user?.id, action, entity, entityId, meta, req.user?.tenant_id);

module.exports = { writeAudit, auditReq };
