// Headroom Collab - tenant context (Phase 0).
//
// The collab tables have FORCE ROW LEVEL SECURITY keyed on the `app.current_tenant`
// session GUC (see ./schema.js). Postgres connections are pooled, so the GUC MUST
// be set with transaction scope (SET LOCAL) on a dedicated checked-out client and
// can never be a plain SET (that would leak to the next request reusing the
// connection). withTenant() is the ONLY sanctioned way to touch collab tables:
// it opens a transaction, sets the GUC for that transaction, runs the callback,
// and commits/rolls back - the GUC resets automatically on release.
//
// RLS is the backstop, not the primary guard. Routes still do the authoritative
// org-membership + conversation-membership checks in the app layer (spec §8).

const { pool } = require("../../db");

/**
 * Run `fn(client)` inside a transaction with app.current_tenant set to `tenantId`.
 * All queries the callback issues on `client` are tenant-scoped by RLS. Commits on
 * success, rolls back on throw. Returns the callback's resolved value.
 *
 * @template T
 * @param {string} tenantId
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTenant(tenantId, fn) {
  if (!tenantId) throw new Error("withTenant: tenantId is required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // set_config(name, value, is_local=true) === SET LOCAL - transaction-scoped,
    // auto-reset on COMMIT/ROLLBACK, never leaks across pooled connections.
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

/**
 * Convenience for a single tenant-scoped statement.
 * @param {string} tenantId
 * @param {string} sql
 * @param {any[]} [params]
 */
function q(tenantId, sql, params = []) {
  return withTenant(tenantId, (client) => client.query(sql, params));
}

/**
 * Resolve the tenant id for a request the same way the rest of Headroom does:
 * req.user.tenant_id, already overridden by the super-admin X-Tenant-Id
 * impersonation handling in middleware/auth.js. Kept as one helper so collab
 * routes stay consistent with that behaviour.
 */
function tenantOf(req) {
  return req.user && req.user.tenant_id;
}

/**
 * Express middleware: require an authenticated user and stamp collab context onto
 * the request. Mount AFTER the existing `authenticate` middleware. This is the
 * "auth middleware that sets the tenant context" from the spec - the actual GUC
 * is applied per-query by withTenant() (pool-safe), and req.collab carries the
 * resolved identity plus a pre-bound query helper for handlers.
 */
function collabContext(req, res, next) {
  const tenantId = tenantOf(req);
  const userId = req.user && req.user.id;
  if (!tenantId || !userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  req.collab = {
    tenantId,
    userId,
    role: req.user.role,
    /** Tenant-scoped query helper bound to this request's tenant. */
    withTenant: (fn) => withTenant(tenantId, fn),
    query: (sql, params) => q(tenantId, sql, params),
  };
  next();
}

module.exports = { withTenant, q, tenantOf, collabContext };
