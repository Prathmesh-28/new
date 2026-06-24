// Central reader for super-admin-controlled platform settings (the platform_settings
// table written by routes/platform.js). Lets ANY route pull a tunable value the
// super-admin set in the console — with the old hardcoded value as the fallback, so
// nothing breaks if a setting is unset. Cached ~60s; routes/platform.js calls bust()
// on save so edits take effect immediately.
//
//   const cfg = require("../lib/platformConfig");
//   const cap = await cfg.num("limits", "maxBulkRows", 100);   // → super-admin value or 100
//   const flag = await cfg.bool("features", "enableAgents", true);
//   const anyKey = await cfg.num("custom", "myThreshold", 7);   // the custom escape-hatch group
const { pool } = require("../db");

let _cache = null;
let _at = 0;
const TTL_MS = 60_000;

async function _loadAll() {
  if (_cache && Date.now() - _at < TTL_MS) return _cache;
  try {
    const { rows } = await pool.query("SELECT key, value FROM platform_settings");
    const out = {};
    for (const r of rows) out[r.key] = r.value || {};
    _cache = out;
    _at = Date.now();
  } catch {
    _cache = _cache || {}; // keep last good cache (or empty) on a transient DB error
  }
  return _cache;
}

async function num(group, key, fallback) {
  const all = await _loadAll();
  const v = all[group] ? all[group][key] : undefined;
  if (v === "" || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function str(group, key, fallback) {
  const all = await _loadAll();
  const v = all[group] ? all[group][key] : undefined;
  return typeof v === "string" && v.length ? v : fallback;
}

async function bool(group, key, fallback) {
  const all = await _loadAll();
  const v = all[group] ? all[group][key] : undefined;
  return typeof v === "boolean" ? v : fallback;
}

// Whole group object (e.g. the arbitrary `custom` group), defaults to {}.
async function raw(group) {
  const all = await _loadAll();
  return all[group] || {};
}

// Drop the cache so the very next read reflects a just-saved setting.
function bust() { _cache = null; _at = 0; }

module.exports = { num, str, bool, raw, bust };
