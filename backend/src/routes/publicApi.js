"use strict";
// Public REST API v1 (#185) — mounted at /api/v1, authenticated by an API key (not the app JWT).
// Read-only surface over existing, already-correct module functions, scoped to the key's tenant.
// Every response is derived from the same engines the app uses, so it always reconciles.
const router = require("express").Router();
const { apiKeyAuth, requireScope } = require("../middleware/apiKeyAuth");
const { q } = require("../lib/tenantDb");
const { pool } = require("../db");
const reports = require("../modules/books/reports");
const { financialYearFor } = require("../modules/books/fy");
const { score: underwrite } = require("../lib/underwriting");

const fail = (res, e) => { console.error("[api/v1]", e.message); res.status(500).json({ error: "Internal error" }); };

// ── Public: OpenAPI spec + a tiny landing (no key needed, so devs can explore) ──
const OPENAPI = {
  openapi: "3.0.0",
  info: { title: "Headroom Public API", version: "1.0.0", description: "Read-only access to your business data. Authenticate with an API key (X-API-Key header) minted in Settings → Developer." },
  servers: [{ url: "/api/v1" }],
  components: { securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" } } },
  security: [{ ApiKey: [] }],
  paths: {
    "/ping": { get: { summary: "Verify the key + see its scopes", responses: { 200: { description: "OK" } } } },
    "/invoices": { get: { summary: "List invoices", parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }, { name: "status", in: "query", schema: { type: "string" } }], responses: { 200: { description: "Invoices" } } } },
    "/vendors": { get: { summary: "List vendors (master)", responses: { 200: { description: "Vendors" } } } },
    "/credit-score": { get: { summary: "Your underwriting score + grade + eligible limit", responses: { 200: { description: "Score" } } } },
    "/reports/trial-balance": { get: { summary: "Trial balance for an FY", parameters: [{ name: "fy", in: "query", schema: { type: "string", example: "2024-25" } }], responses: { 200: { description: "Trial balance" } } } },
  },
};
router.get("/openapi.json", (_req, res) => res.json(OPENAPI));

// ── Everything below requires a valid API key ──
router.use(apiKeyAuth);

router.get("/ping", (req, res) => res.json({ ok: true, tenant: req.apiTenant, scopes: req.apiScopes, ts: new Date().toISOString() }));

router.get("/invoices", requireScope("read"), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const params = [req.apiTenant]; let where = "tenant_id=$1";
    if (req.query.status) { params.push(String(req.query.status)); where += ` AND status=$${params.length}`; }
    params.push(limit);
    const { rows } = await q(req.apiTenant, `SELECT id, invoice_number, customer_name, total_amount, status, due_date, created_at FROM invoices WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    res.json({ data: rows.map((r) => ({ ...r, total_amount: Number(r.total_amount) })), count: rows.length });
  } catch (e) { fail(res, e); }
});

router.get("/vendors", requireScope("read"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name, gstin, msme_category, payment_terms_days, category FROM vendor_master WHERE tenant_id=$1 ORDER BY name", [req.apiTenant]);
    res.json({ data: rows, count: rows.length });
  } catch (e) { fail(res, e); }
});

router.get("/credit-score", requireScope("read"), async (req, res) => {
  try {
    const uw = await underwrite(req.apiTenant, pool);
    if (!uw) return res.status(404).json({ error: "Insufficient data to score." });
    res.json({ score: uw.score, grade: uw.grade, approved_amount: uw.approved_amount, decision: uw.decision?.outcome || uw.decision || null, factors: (uw.factors || []).map((f) => ({ label: f.label, score: f.score })) });
  } catch (e) { fail(res, e); }
});

router.get("/reports/trial-balance", requireScope("read"), async (req, res) => {
  try { res.json(await reports.trialBalance(req.apiTenant, req.query.fy ? String(req.query.fy) : financialYearFor(new Date()))); } catch (e) { fail(res, e); }
});

module.exports = router;
