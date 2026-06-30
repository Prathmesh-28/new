const { pool } = require("../db");

// Fire-and-forget audit trail. Admin/org mutations call this so there's an
// accountable record of "who changed what". Never block or fail the request on
// an audit write - swallow errors.
async function writeAudit(userId, action, entity, entityId, meta) {
  try {
    await pool.query(
      "INSERT INTO audit_log(user_id, action, entity, entity_id, meta) VALUES($1,$2,$3,$4,$5)",
      [userId || null, action, entity || null, entityId != null ? String(entityId) : null, meta || null]
    );
  } catch {
    /* auditing must never break the action it records */
  }
}

module.exports = { writeAudit };
