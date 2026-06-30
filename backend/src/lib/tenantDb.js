"use strict";
// Shared tenant-scoped DB context for the platform-wide RLS rollout — the generalized
// form of the proven collab pattern (modules/collab/tenantContext.js), so any module
// can adopt RLS the same way without duplicating the wrapper.
//
// Postgres connections are POOLED, so the tenant GUC MUST be set with transaction scope
// (set_config(..., is_local=true) === SET LOCAL): it auto-resets on COMMIT/ROLLBACK and
// can never leak to the next request reusing the connection. withTenant() is the ONLY
// sanctioned way to touch a table that has FORCE ROW LEVEL SECURITY keyed on
// app.current_tenant — a plain pool.query would have no GUC and RLS would return 0 rows.
const { pool } = require("../db");

async function withTenant(tenantId, fn) {
  if (!tenantId) throw new Error("withTenant: tenantId is required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [String(tenantId)]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Single tenant-scoped statement.
const q = (tenantId, sql, params = []) => withTenant(tenantId, (c) => c.query(sql, params));

module.exports = { withTenant, q };
