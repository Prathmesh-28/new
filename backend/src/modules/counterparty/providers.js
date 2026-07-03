"use strict";
// Gated enrichment providers. Each external registry (GSTN filing status, MCA corporate extract,
// GSP GSTIN validation, Udyam MSME lookup) needs its own credential. Without it, isConfigured is
// false and lookup() returns { status:'gated' } — we never fabricate registry data. When a
// credential + base URL are configured, lookup() performs a real HTTP GET against the operator's
// endpoint (a genuine adapter, not a stub) and returns the parsed payload. Mirrors the
// isConfigured/manual seam used by payouts + lending mandates.
const ENV = {
  gstn:  { key: "GSTN_API_KEY",  base: "GSTN_API_BASE",  path: (id) => `/gstin/${encodeURIComponent(id)}/returns` },
  mca:   { key: "MCA_API_KEY",   base: "MCA_API_BASE",   path: (id) => `/company/${encodeURIComponent(id)}` },
  gsp:   { key: "GSP_API_KEY",   base: "GSP_API_BASE",   path: (id) => `/gstin/${encodeURIComponent(id)}` },
  udyam: { key: "UDYAM_API_KEY", base: "UDYAM_API_BASE", path: (id) => `/udyam/${encodeURIComponent(id)}` },
  ecourts: { key: "ECOURTS_API_KEY", base: "ECOURTS_API_BASE", path: (id) => `/search?query=${encodeURIComponent(id)}` }, // litigation screening (gated)
};
const VALID = Object.keys(ENV);

const enrichmentProvider = {
  isConfigured(kind) {
    const e = ENV[kind];
    return !!(e && process.env[e.key] && process.env[e.base]);
  },
  status() {
    const out = {};
    for (const k of VALID) out[k] = { configured: this.isConfigured(k), problem: this.isConfigured(k) ? null : `Set ${ENV[k].key} + ${ENV[k].base} to enable live ${k.toUpperCase()} lookups.` };
    return out;
  },
  // Real HTTP call when configured; honest 'gated' otherwise. Never fabricates.
  async lookup(kind, identifier) {
    if (!VALID.includes(kind)) return { status: "error", message: `Unknown kind '${kind}'` };
    if (!this.isConfigured(kind)) return { status: "gated", message: `${kind.toUpperCase()} lookups are not configured — enable the provider to fetch live data.`, data: {} };
    const base = process.env[ENV[kind].base].replace(/\/$/, "");
    const url = base + ENV[kind].path(identifier);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${process.env[ENV[kind].key]}`, Accept: "application/json" }, signal: ctrl.signal });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return { status: "error", message: data?.error || `Provider returned ${resp.status}`, data: {} };
      return { status: "ok", data };
    } catch (err) {
      return { status: "error", message: err.name === "AbortError" ? "Timed out reaching provider" : err.message, data: {} };
    } finally { clearTimeout(timer); }
  },
};

module.exports = { enrichmentProvider, VALID };
