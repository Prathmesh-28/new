"use strict";
// Forward-only SQL migration runner. The audit flagged that schema changes were
// hand-edited into db.js initDb() with `ALTER … IF NOT EXISTS` and no record of what
// ran. This adds a proper, ordered, recorded mechanism for FUTURE changes:
//   • initDb() stays the baseline (idempotent create-if-not-exists);
//   • numbered files in backend/src/migrations/ run AFTER it, once each, in order;
//   • each runs in its OWN transaction — a failure rolls back and is NOT recorded, so
//     boot fails loudly rather than leaving a half-applied schema.
// Add a change: drop NNNN_description.sql in the migrations dir (zero-padded, ordered).
const fs = require("fs");
const path = require("path");

const DEFAULT_DIR = path.join(__dirname, "..", "migrations");

async function runMigrations(pool, dir = DEFAULT_DIR) {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort(); }
  catch { return { applied: [], skipped: 0 }; } // no migrations dir yet → nothing to do
  const done = new Set((await pool.query("SELECT id FROM schema_migrations")).rows.map((r) => r.id));
  const applied = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // A backfill over a years-old audit_log/invoices table can legitimately take longer
      // than the pool's 30s statement_timeout — a migration must never die to the app's
      // query budget. Scoped to this transaction only.
      await client.query("SET LOCAL statement_timeout = '15min'");
      // One migrator at a time across instances: a second booting instance blocks here
      // instead of racing the same file and crashing on a duplicate-object error.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('hr:migrations'))");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(id) VALUES($1)", [file]);
      await client.query("COMMIT");
      applied.push(file);
      console.log(`[migrate] applied ${file}`);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`migration ${file} failed (rolled back): ${e.message}`);
    } finally {
      client.release();
    }
  }
  return { applied, skipped: files.length - applied.length };
}

module.exports = { runMigrations, DEFAULT_DIR };
