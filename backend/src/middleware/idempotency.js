"use strict";
// ── Idempotency for money-moving POSTs ───────────────────────────────────────
// A double-click, a mobile retry on a flaky connection, or a cron re-run could create
// the same invoice, receipt or payout twice — and nothing in the stack prevented it.
// (Invoice NUMBERING was made race-safe in 0031, but the request itself was still
// replayable.) This is the standard Stripe-style contract:
//
//   Client sends  Idempotency-Key: <uuid>
//   1st request   → runs, response stored against the key
//   replay        → the SAME response body + status, nothing runs twice
//   still running → 409 { code: "IN_FLIGHT" }, client retries shortly
//   key reused with a different body → 422, because that is a client bug, not a retry
//
// Keys are tenant-scoped, so two firms can never collide.
const crypto = require("crypto");
const { withTenant } = require("../lib/tenantDb");

const hashBody = (req) =>
  crypto.createHash("sha256")
    .update(`${req.method}:${req.originalUrl.split("?")[0]}:${JSON.stringify(req.body ?? {})}`)
    .digest("hex");

function idempotent(options = {}) {
  const required = options.required === true;

  return async function idempotencyMiddleware(req, res, next) {
    const key = String(req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || "").trim();
    if (!key) {
      if (required) return res.status(400).json({ error: "Idempotency-Key header is required for this request", code: "IDEMPOTENCY_KEY_REQUIRED" });
      return next();
    }
    if (key.length > 200) return res.status(400).json({ error: "Idempotency-Key too long" });

    const tenantId = req.user?.tenant_id;
    if (!tenantId) return next(); // unauthenticated routes have no tenant to scope by

    const path = req.originalUrl.split("?")[0];
    const reqHash = hashBody(req);

    let claimed = false;
    try {
      const ins = await withTenant(tenantId, (c) => c.query(
        `INSERT INTO idempotency_keys(tenant_id, key, method, path, request_hash)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, key) DO NOTHING RETURNING key`,
        [tenantId, key, req.method, path, reqHash]
      ));
      claimed = ins.rows.length > 0;
    } catch (e) {
      // Never let the safety net take down the request it was protecting.
      req.log?.warn?.({ err: e.message }, "idempotency insert failed; proceeding unguarded");
      return next();
    }

    if (!claimed) {
      const { rows } = await withTenant(tenantId, (c) => c.query(
        `SELECT * FROM idempotency_keys WHERE tenant_id=$1 AND key=$2`, [tenantId, key]
      ));
      const prev = rows[0];
      if (!prev) return next(); // vanished (purged mid-flight) — treat as fresh
      if (prev.request_hash !== reqHash) {
        return res.status(422).json({
          error: "This Idempotency-Key was already used for a different request. Use a new key.",
          code: "IDEMPOTENCY_KEY_REUSED",
        });
      }
      if (prev.in_flight) {
        return res.status(409).json({ error: "That request is still being processed. Try again in a moment.", code: "IN_FLIGHT" });
      }
      res.setHeader("Idempotent-Replay", "true");
      return res.status(prev.status_code || 200).json(prev.response ?? {});
    }

    // We own the key: capture the response so a replay can be served from it.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode || 200;
      const finish = status < 500
        ? withTenant(tenantId, (c) => c.query(
            `UPDATE idempotency_keys SET status_code=$3, response=$4, in_flight=false WHERE tenant_id=$1 AND key=$2`,
            [tenantId, key, status, body ?? {}]
          ))
        // A 5xx is not a durable outcome — release the key so the client's retry can
        // actually run instead of replaying a server error forever.
        : withTenant(tenantId, (c) => c.query(
            `DELETE FROM idempotency_keys WHERE tenant_id=$1 AND key=$2`, [tenantId, key]
          ));
      finish.catch(() => {});
      return originalJson(body);
    };
    next();
  };
}

module.exports = { idempotent };
