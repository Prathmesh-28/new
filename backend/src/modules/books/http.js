// §14 - API surface for the books module. Mounted at /api/books. Tenant- and
// auth-scoped; money crosses as strings; Idempotency-Key honoured on posts.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const { pool } = require("../../db");
const { postVoucher, reverseVoucher, PostError } = require("./posting-engine");
const reports = require("./reports");
const { seedBooks, ledgerIdByName } = require("./seed");
const { buildSalesVoucher, buildReceiptVoucher, buildPurchaseVoucher, buildCreditNote, buildPaymentVoucher, computeLineGst, buildDebitNote, buildRefund, buildRcmBill, buildBadDebt, buildAdvanceReceipt, buildVendorAdvance } = require("./mappers");
const billwise = require("./billwise");
const tds = require("./tds");
const ewb = require("./ewaybill");
const importer = require("./importer");
const closing = require("./closing");
const ledgersadmin = require("./ledgersadmin");
const items = require("./items");
const vt = require("./vouchertools");
const taxfiling = require("./taxfiling");
const incometax = require("./incometax");
const pricing = require("./pricing");
const payterms = require("./payterms");
const subs = require("./subscriptions");
const importers = require("./importers");
const usage = require("./usage");
const demoseed = require("./demoseed");
const itr = require("./itr");
const billofentry = require("./billofentry");
const llm = require("./llm");
const agents = require("./agents");
const agenttools = require("./agenttools");
const agentrag = require("./agentrag");
const agenttemplates = require("./agenttemplates");
const reposting = require("./reposting");
const landedcost = require("./landedcost");
const rules = require("./rules");
const importcfg = require("./importconfig");
const dunning = require("./dunning");
const integrity = require("./integrity");
const settlement = require("./settlement");
const recurrence = require("./recurrence");
const validators = require("../../lib/validators");
// Reject a malformed GSTIN/PAN (checksum-verified) before it hits the ledger.
const badId = (b) => {
  if (b.gstin && !validators.isValidGstin(String(b.gstin).toUpperCase())) return "Invalid GSTIN (checksum failed)";
  if (b.pan && !validators.isValidPan(String(b.pan).toUpperCase())) return "Invalid PAN";
  return null;
};
const { financialYearFor } = require("./fy");
const { money, toRupees } = require("./money");
const email = require("../../lib/email");
const whatsapp = require("../../lib/whatsapp");
const docs = require("./documents");
const inv = require("./inventory");
const gst = require("./gst");
const recon = require("./recon");
const payments = require("./payments");
const fx = require("./fx");
const assets = require("./assets");
const auto = require("./automation");
const ops = require("./ops");
const einvoice = require("./einvoice");
const ocr = require("./ocr");
const portal = require("./portal");
const cc = require("./costcentres");

// GET /documents/:id/print is opened in a new browser tab (window.open) which can't
// set an Authorization header - accept the short-lived access token as ?token= for
// that print GET only, promoting it into the header the auth middleware expects.
router.use((req, _res, next) => {
  if (req.method === "GET" && /\/print$/.test(req.path) && !req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
});
router.use(authenticate);

// §12.2 RBAC - who may post to the books.
const POST_ROLES = ["super_admin", "owner", "finance_manager", "accountant"];
const canPost = (req, res, next) => (POST_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
// super_admin may target any tenant via ?tenant_id; everyone else is scoped to their own.
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const fyOf = (req) => (req.query.fy ? String(req.query.fy) : financialYearFor(new Date()));
const fail = (res, err) => {
  if (err instanceof PostError) return res.status(err.http).json({ error: err.message, code: err.code });
  console.error("[books]", err.message);
  return res.status(500).json({ error: "Internal error" });
};
const idem = (req) => req.get("Idempotency-Key") || undefined;

// ── Bootstrap ────────────────────────────────────────────────────────────────
router.post("/seed", canPost, async (req, res) => {
  try { res.json({ ok: true, ...(await seedBooks(tenantOf(req))) }); } catch (e) { fail(res, e); }
});

// ── Groups ───────────────────────────────────────────────────────────────────
router.get("/groups", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id,name,parent_id,nature,affects_pl,is_system FROM book_account_groups WHERE tenant_id=$1 ORDER BY nature,name", [tenantOf(req)]);
    res.json(rows);
  } catch (e) { fail(res, e); }
});
router.post("/groups", canPost, async (req, res) => {
  try {
    const { name, parent_id, nature, affects_pl } = req.body || {};
    if (!name || !nature) return res.status(400).json({ error: "name and nature required" });
    const { rows } = await pool.query("INSERT INTO book_account_groups(tenant_id,name,parent_id,nature,affects_pl) VALUES($1,$2,$3,$4,$5) RETURNING *", [tenantOf(req), name, parent_id || null, nature, !!affects_pl]);
    res.status(201).json(rows[0]);
  } catch (e) { fail(res, e); }
});

// ── Ledgers ──────────────────────────────────────────────────────────────────
router.get("/ledgers", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id,name,group_id,is_party,is_bank,gstin,state_code,opening_balance,opening_is_debit,is_active FROM book_ledgers WHERE tenant_id=$1 ORDER BY name", [tenantOf(req)]);
    const q = (req.query.q || "").toString().toLowerCase();
    res.json(q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows);
  } catch (e) { fail(res, e); }
});
router.post("/ledgers", canPost, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.group_id) return res.status(400).json({ error: "name and group_id required" });
    const idErr = badId(b); if (idErr) return res.status(400).json({ error: idErr });
    const { rows } = await pool.query(
      `INSERT INTO book_ledgers(tenant_id,name,group_id,opening_balance,opening_is_debit,is_party,gstin,pan,state_code,billing_address,credit_period_days,is_bank,account_number,ifsc,ext_account_id,ext_party_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [tenantOf(req), b.name, b.group_id, b.opening_balance || 0, b.opening_is_debit !== false, !!b.is_party, b.gstin || null, b.pan || null, b.state_code || null, b.billing_address || null, b.credit_period_days || null, !!b.is_bank, b.account_number || null, b.ifsc || null, b.ext_account_id || null, b.ext_party_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { fail(res, e); }
});
router.patch("/ledgers/:id", canPost, async (req, res) => {
  try {
    const idErr = badId(req.body || {}); if (idErr) return res.status(400).json({ error: idErr });
    const allowed = ["name", "group_id", "gstin", "pan", "state_code", "billing_address", "credit_period_days", "account_number", "ifsc", "is_active", "opening_balance", "opening_is_debit", "gst_registration_type", "credit_limit", "email", "phone", "maintain_billwise"];
    const sets = [], vals = [];
    for (const k of allowed) if (k in (req.body || {})) { sets.push(`${k}=$${sets.length + 1}`); vals.push(req.body[k]); }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    vals.push(tenantOf(req), req.params.id);
    const { rows } = await pool.query(`UPDATE book_ledgers SET ${sets.join(",")} WHERE tenant_id=$${vals.length - 1} AND id=$${vals.length} RETURNING *`, vals);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) { fail(res, e); }
});

// Ledger cleanup - merge duplicates / delete unused.
router.post("/ledgers/merge", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await ledgersadmin.mergeLedger(tenantOf(req), b.fromId, b.toId)); } catch (e) { fail(res, e); } });
router.delete("/ledgers/:id", canPost, async (req, res) => { try { res.json(await ledgersadmin.deleteLedger(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
// Group rename / reparent / delete.
router.patch("/groups/:id", canPost, async (req, res) => {
  try {
    const b = req.body || {}; const sets = [], vals = [];
    for (const k of ["name", "parent_id"]) if (k in b) { sets.push(`${k}=$${sets.length + 1}`); vals.push(b[k]); }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    vals.push(tenantOf(req), req.params.id);
    const { rows } = await pool.query(`UPDATE book_account_groups SET ${sets.join(",")} WHERE tenant_id=$${vals.length - 1} AND id=$${vals.length} AND is_system=false RETURNING *`, vals);
    if (!rows[0]) return res.status(404).json({ error: "Group not found or is a system group" });
    res.json(rows[0]);
  } catch (e) { fail(res, e); }
});
router.delete("/groups/:id", canPost, async (req, res) => {
  try {
    const t = tenantOf(req);
    const { rows: u } = await pool.query("SELECT 1 FROM book_ledgers WHERE tenant_id=$1 AND group_id=$2 LIMIT 1", [t, req.params.id]);
    if (u[0]) return res.status(409).json({ error: "Group has ledgers - move them first", code: "IN_USE" });
    const { rows } = await pool.query("DELETE FROM book_account_groups WHERE tenant_id=$1 AND id=$2 AND is_system=false RETURNING id", [t, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Group not found or is a system group" });
    res.json({ ok: true, deleted: rows[0].id });
  } catch (e) { fail(res, e); }
});

// Bulk / editable opening balances (onboarding + auditor corrections).
router.post("/opening-balances", canPost, async (req, res) => {
  try { res.json(await ops.setOpeningBalances(tenantOf(req), (req.body || {}).entries)); } catch (e) { fail(res, e); }
});

// ── Cost centres (master + cost-centre-wise P&L) ─────────────────────────────
router.get("/cost-centres", async (req, res) => {
  try { res.json(await cc.listCostCentres(tenantOf(req))); } catch (e) { fail(res, e); }
});
router.post("/cost-centres", canPost, async (req, res) => {
  try { res.status(201).json(await cc.createCostCentre(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); }
});
router.patch("/cost-centres/:id", canPost, async (req, res) => {
  try { res.json(await cc.updateCostCentre(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); }
});
router.get("/cost-centres/report", async (req, res) => {
  try { res.json(await cc.costCentreReport(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); }
});

// ── Period lock / close (write side) + list ──────────────────────────────────
router.get("/periods", async (req, res) => {
  try { res.json(await ops.listPeriods(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); }
});
router.post("/periods/status", canPost, async (req, res) => {
  try { const b = req.body || {}; res.json(await ops.setPeriodStatus(tenantOf(req), req.user.id, b.financial_year || fyOf(req), b.period_month, b.status)); } catch (e) { fail(res, e); }
});

// ── Audit-log viewer ─────────────────────────────────────────────────────────
router.get("/audit", async (req, res) => {
  try { res.json(await ops.readAuditLog(tenantOf(req), { entity: req.query.entity, entityId: req.query.entityId, limit: req.query.limit })); } catch (e) { fail(res, e); }
});

// ── Vouchers ─────────────────────────────────────────────────────────────────
router.post("/vouchers", canPost, async (req, res) => {
  try {
    const { voucher, entries, taxes } = req.body || {};
    if (!voucher || !Array.isArray(entries)) return res.status(400).json({ error: "voucher and entries required" });
    const r = await postVoucher(tenantOf(req), req.user.id, voucher, entries, { idempotencyKey: idem(req), taxes });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
router.post("/vouchers/:id/reverse", canPost, async (req, res) => {
  try { res.json(await reverseVoucher(tenantOf(req), req.user.id, req.params.id, { date: (req.body || {}).date })); } catch (e) { fail(res, e); }
});
router.get("/vouchers/:id", async (req, res) => {
  try {
    const t = tenantOf(req);
    const { rows: vh } = await pool.query("SELECT * FROM book_vouchers WHERE tenant_id=$1 AND id=$2", [t, req.params.id]);
    if (!vh[0]) return res.status(404).json({ error: "Not found" });
    const { rows: entries } = await pool.query("SELECT e.*, l.name AS ledger_name FROM book_voucher_entries e JOIN book_ledgers l ON l.id=e.ledger_id WHERE e.voucher_id=$1 ORDER BY e.entry_order", [req.params.id]);
    const { rows: taxes } = await pool.query("SELECT * FROM book_tax_entries WHERE voucher_id=$1", [req.params.id]);
    res.json({ ...vh[0], entries, taxes });
  } catch (e) { fail(res, e); }
});
router.get("/vouchers", async (req, res) => {
  try {
    const t = tenantOf(req);
    const params = [t]; const where = ["tenant_id=$1"];
    if (req.query.type) { params.push(req.query.type); where.push(`voucher_type=$${params.length}`); }
    if (req.query.party) { params.push(req.query.party); where.push(`party_ledger_id=$${params.length}`); }
    if (req.query.from) { params.push(req.query.from); where.push(`voucher_date>=$${params.length}`); }
    if (req.query.to) { params.push(req.query.to); where.push(`voucher_date<=$${params.length}`); }
    const { rows } = await pool.query(`SELECT id,voucher_type,voucher_number,voucher_date,financial_year,narration,reference,party_ledger_id,is_cancelled,source FROM book_vouchers WHERE ${where.join(" AND ")} ORDER BY voucher_date DESC, created_at DESC LIMIT 500`, params);
    res.json(rows);
  } catch (e) { fail(res, e); }
});

// ── Documents (mapped → posted) ──────────────────────────────────────────────
router.post("/documents/sales", canPost, async (req, res) => {
  try {
    const t = tenantOf(req); const b = req.body || {};
    if (!b.customerLedgerId || b.lineTotal == null || b.gstRate == null || !b.date) return res.status(400).json({ error: "customerLedgerId, lineTotal, gstRate, date required" });
    const ctx = {
      customerLedgerId: b.customerLedgerId,
      salesLedgerId: b.salesLedgerId || (await ledgerIdByName(t, "Sales")),
      cgstLedgerId: await ledgerIdByName(t, "CGST Output"),
      sgstLedgerId: await ledgerIdByName(t, "SGST Output"),
      igstLedgerId: await ledgerIdByName(t, "IGST Output"),
    };
    if (!ctx.salesLedgerId || (b.interState ? !ctx.igstLedgerId : (!ctx.cgstLedgerId || !ctx.sgstLedgerId))) {
      return res.status(422).json({ error: "Sales/tax ledgers missing - POST /api/books/seed first", code: "NOT_SEEDED" });
    }
    const m = buildSalesVoucher(b, ctx);
    const r = await postVoucher(t, req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req), taxes: m.taxes });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
router.post("/documents/receipt", canPost, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.bankLedgerId || !b.partyLedgerId || b.amount == null || !b.date) return res.status(400).json({ error: "bankLedgerId, partyLedgerId, amount, date required" });
    const m = buildReceiptVoucher(b, { bankLedgerId: b.bankLedgerId, partyLedgerId: b.partyLedgerId });
    const r = await postVoucher(tenantOf(req), req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req) });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});

// ── Reports ──────────────────────────────────────────────────────────────────
router.get("/reports/trial-balance", async (req, res) => { try { res.json(await reports.trialBalance(tenantOf(req), fyOf(req), req.query.asOf)); } catch (e) { fail(res, e); } });
router.get("/reports/profit-loss", async (req, res) => { try { res.json(await reports.profitLoss(tenantOf(req), fyOf(req), req.query.asOf)); } catch (e) { fail(res, e); } });
router.get("/reports/balance-sheet", async (req, res) => { try { res.json(await reports.balanceSheet(tenantOf(req), fyOf(req), req.query.asOf)); } catch (e) { fail(res, e); } });
router.get("/reports/owner-capital", async (req, res) => { try { res.json(await reports.ownerCapital(tenantOf(req), fyOf(req), req.query.asOf)); } catch (e) { fail(res, e); } });
// Business-continuity vault — owner-only (holds sensitive emergency access details).
const continuity = require("./continuity");
const canOwner = (req, res, next) => (["owner", "super_admin"].includes(req.user.role) ? next() : res.status(403).json({ error: "Owner access only" }));
router.get("/continuity", canOwner, async (req, res) => { try { res.json(await continuity.listContinuityItems(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/continuity", canOwner, async (req, res) => { try { res.status(201).json(await continuity.createContinuityItem(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.patch("/continuity/:id", canOwner, async (req, res) => { try { res.json(await continuity.updateContinuityItem(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.delete("/continuity/:id", canOwner, async (req, res) => { try { res.json(await continuity.removeContinuityItem(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.get("/reports/schedule-iii", async (req, res) => { try { res.json(await reports.scheduleIII(tenantOf(req), fyOf(req), req.query.asOf)); } catch (e) { fail(res, e); } });
router.get("/reports/branch-trial-balance", async (req, res) => { try { if (!req.query.branchId) return res.status(400).json({ error: "branchId required" }); res.json(await reports.branchTrialBalance(tenantOf(req), fyOf(req), req.query.branchId, req.query.asOf)); } catch (e) { fail(res, e); } });
router.get("/reports/branch-pl", async (req, res) => { try { if (!req.query.branchId) return res.status(400).json({ error: "branchId required" }); res.json(await reports.branchPL(tenantOf(req), fyOf(req), req.query.branchId, req.query.asOf)); } catch (e) { fail(res, e); } });
router.get("/reports/day-book", async (req, res) => { try { res.json(await reports.dayBook(tenantOf(req), req.query.from || "1900-01-01", req.query.to || "2999-12-31")); } catch (e) { fail(res, e); } });
router.get("/ledgers/:id/statement", async (req, res) => {
  try { const r = await reports.ledgerStatement(tenantOf(req), req.params.id, fyOf(req)); if (!r) return res.status(404).json({ error: "Ledger not found" }); res.json(r); } catch (e) { fail(res, e); }
});
// AR/AP aging (buckets, per party, as-of date) + date-range party statement.
router.get("/reports/ar-aging", async (req, res) => { try { res.json(await reports.arAging(tenantOf(req), req.query.asOf)); } catch (e) { fail(res, e); } });
router.get("/reports/ap-aging", async (req, res) => { try { res.json(await reports.apAging(tenantOf(req), req.query.asOf)); } catch (e) { fail(res, e); } });
router.get("/reports/party-statement", async (req, res) => {
  try {
    if (!req.query.ledgerId) return res.status(400).json({ error: "ledgerId required" });
    res.json(await reports.partyStatement(tenantOf(req), req.query.ledgerId, req.query.from || "1900-01-01", req.query.to || "2999-12-31"));
  } catch (e) { fail(res, e); }
});
// Bill-wise outstanding + validated settlement (book_allocations).
router.get("/parties/:id/open-bills", async (req, res) => { try { res.json(await billwise.openBills(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/allocations", canPost, async (req, res) => { try { res.status(201).json(await billwise.allocateBill(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });

// ── M2: Purchase (bill), credit note, payment documents ──────────────────────
router.post("/documents/purchase", canPost, async (req, res) => {
  try {
    const t = tenantOf(req); const b = req.body || {};
    if (!b.vendorLedgerId || b.lineTotal == null || b.gstRate == null || !b.date) return res.status(400).json({ error: "vendorLedgerId, lineTotal, gstRate, date required" });
    const ctx = await docs.purchaseCtx(t, b.vendorLedgerId);
    const m = buildPurchaseVoucher(b, ctx);
    const r = await postVoucher(t, req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req), taxes: m.taxes });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
router.post("/documents/credit-note", canPost, async (req, res) => {
  try {
    const t = tenantOf(req); const b = req.body || {};
    if (!b.customerLedgerId || b.lineTotal == null || b.gstRate == null || !b.date) return res.status(400).json({ error: "customerLedgerId, lineTotal, gstRate, date required" });
    const ctx = {
      customerLedgerId: b.customerLedgerId, salesReturnsLedgerId: await ledgerIdByName(t, "Sales Returns"),
      cgstLedgerId: await ledgerIdByName(t, "CGST Output"), sgstLedgerId: await ledgerIdByName(t, "SGST Output"), igstLedgerId: await ledgerIdByName(t, "IGST Output"),
    };
    if (!ctx.salesReturnsLedgerId) return res.status(422).json({ error: "Sales Returns ledger missing - seed first", code: "NOT_SEEDED" });
    const m = buildCreditNote(b, ctx);
    const r = await postVoucher(t, req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req), taxes: m.taxes });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
router.post("/documents/payment", canPost, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.bankLedgerId || !b.partyLedgerId || b.amount == null || !b.date) return res.status(400).json({ error: "bankLedgerId, partyLedgerId, amount, date required" });
    const m = buildPaymentVoucher(b, { bankLedgerId: b.bankLedgerId, partyLedgerId: b.partyLedgerId });
    const r = await postVoucher(tenantOf(req), req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req) });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
// RCM bill (reverse charge) - vendor billed at taxable only; GST self-assessed as
// output liability + matching ITC, tagged supplyType:'RCM'.
router.post("/documents/rcm-bill", canPost, async (req, res) => {
  try {
    const t = tenantOf(req); const b = req.body || {};
    if (!b.vendorLedgerId || b.lineTotal == null || b.gstRate == null || !b.date) return res.status(400).json({ error: "vendorLedgerId, lineTotal, gstRate, date required" });
    const ctx = await docs.purchaseCtx(t, b.vendorLedgerId);
    ctx.cgstOutputLedgerId = await ledgerIdByName(t, "CGST Output");
    ctx.sgstOutputLedgerId = await ledgerIdByName(t, "SGST Output");
    ctx.igstOutputLedgerId = await ledgerIdByName(t, "IGST Output");
    if (!ctx.cgstOutputLedgerId || !ctx.igstOutputLedgerId) return res.status(422).json({ error: "GST Output ledgers missing - seed first", code: "NOT_SEEDED" });
    const m = buildRcmBill(b, ctx);
    const r = await postVoucher(t, req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req), taxes: m.taxes });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
// Vendor debit note / purchase return - Dr vendor, Cr Purchases + reverse GST Input.
router.post("/documents/debit-note", canPost, async (req, res) => {
  try {
    const t = tenantOf(req); const b = req.body || {};
    if (!b.vendorLedgerId || b.lineTotal == null || b.gstRate == null || !b.date) return res.status(400).json({ error: "vendorLedgerId, lineTotal, gstRate, date required" });
    const ctx = await docs.purchaseCtx(t, b.vendorLedgerId);
    const m = buildDebitNote(b, ctx);
    const r = await postVoucher(t, req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req), taxes: m.taxes });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
// Customer refund of an advance / unapplied credit - Dr customer, Cr bank/cash.
router.post("/documents/refund", canPost, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.partyLedgerId || !b.paidFromLedgerId || b.amount == null || !b.date) return res.status(400).json({ error: "partyLedgerId, paidFromLedgerId, amount, date required" });
    const m = buildRefund(b);
    const r = await postVoucher(tenantOf(req), req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req) });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
// Bad-debt write-off - Dr Bad Debts, Cr customer.
router.post("/documents/write-off", canPost, async (req, res) => {
  try {
    const t = tenantOf(req); const b = req.body || {};
    if (!b.partyLedgerId || b.amount == null || !b.date) return res.status(400).json({ error: "partyLedgerId, amount, date required" });
    const badDebtsLedgerId = await ledgerIdByName(t, "Bad Debts");
    if (!badDebtsLedgerId) return res.status(422).json({ error: "Bad Debts ledger missing - seed first", code: "NOT_SEEDED" });
    const m = buildBadDebt(b, { badDebtsLedgerId });
    const r = await postVoucher(t, req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req) });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
// GST-compliant customer advance receipt - Dr bank, Cr customer (advance) + GST output.
router.post("/documents/advance-receipt", canPost, async (req, res) => {
  try {
    const t = tenantOf(req); const b = req.body || {};
    if (!b.partyLedgerId || !b.bankLedgerId || b.amount == null || !b.date) return res.status(400).json({ error: "partyLedgerId, bankLedgerId, amount, date required" });
    const ctx = { bankLedgerId: b.bankLedgerId, cgstLedgerId: await ledgerIdByName(t, "CGST Output"), sgstLedgerId: await ledgerIdByName(t, "SGST Output"), igstLedgerId: await ledgerIdByName(t, "IGST Output") };
    const m = buildAdvanceReceipt(b, ctx);
    const r = await postVoucher(t, req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req), taxes: m.taxes });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
// Advance paid to a supplier - Dr vendor (advance), Cr bank.
router.post("/documents/vendor-advance", canPost, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.partyLedgerId || !b.bankLedgerId || b.amount == null || !b.date) return res.status(400).json({ error: "partyLedgerId, bankLedgerId, amount, date required" });
    const m = buildVendorAdvance(b, { bankLedgerId: b.bankLedgerId });
    const r = await postVoucher(tenantOf(req), req.user.id, m.voucher, m.entries, { idempotencyKey: idem(req) });
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) { fail(res, e); }
});
// TCS (tax collected at source).
router.get("/tcs/sections", async (_req, res) => { res.json(tds.TCS_SECTIONS); });
router.post("/tcs/compute", async (req, res) => { try { res.json(tds.computeTcs(req.body || {})); } catch (e) { fail(res, e); } });

// ── Tax filing (TDS/TCS return file, Form 16A, lower-deduction certs, 26AS, ITR) ──
router.post("/tax/tds-return", canPost, async (req, res) => { try { res.json(await taxfiling.tdsReturnFile(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/tax/form16a", async (req, res) => { try { const html = await taxfiling.form16A(tenantOf(req), { partyLedgerId: req.query.partyLedgerId, quarter: req.query.quarter, fy: fyOf(req) }); res.type("text/html").send(html); } catch (e) { fail(res, e); } });
router.post("/tax/tds-certificates", canPost, async (req, res) => { try { res.status(201).json(await taxfiling.addTdsCertificate(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/tax/tds-certificates", async (req, res) => { try { res.json(await taxfiling.listTdsCertificates(tenantOf(req), req.query.partyLedgerId)); } catch (e) { fail(res, e); } });
router.post("/tax/26as-reconcile", canPost, async (req, res) => { try { res.json(await taxfiling.reconcile26AS(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/tax/advance-tax", async (req, res) => { try { res.json(incometax.advanceTaxSchedule(req.body || {})); } catch (e) { fail(res, e); } });
router.post("/tax/income-tax", async (req, res) => { try { res.json(incometax.computeIncomeTax(req.body || {})); } catch (e) { fail(res, e); } });
// Rules-as-data inspector: the dated tax legislation (slabs/rebate/surcharge/cess, TDS/TCS rates) as inspectable parameters.
router.get("/tax/params", async (req, res) => { try { res.json({ params: incometax.taxParams, validated: (incometax.validateParams(), true) }); } catch (e) { fail(res, e); } });
router.get("/tax/itr-summary", async (req, res) => {
  try {
    const q = req.query;
    res.json(await incometax.itrSummary(tenantOf(req), fyOf(req), { otherIncome: Number(q.otherIncome) || 0, capitalGains: Number(q.capitalGains) || 0, deductions: Number(q.deductions) || 0, regime: q.regime, entityType: q.entityType }));
  } catch (e) { fail(res, e); }
});

// ── M2: non-posting document pipelines ───────────────────────────────────────
router.post("/documents", canPost, async (req, res) => {
  try { res.status(201).json(await docs.createDocument(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); }
});
router.get("/documents", async (req, res) => {
  try { res.json(await docs.listDocuments(tenantOf(req), { kind: req.query.kind, status: req.query.status, party: req.query.party })); } catch (e) { fail(res, e); }
});
router.post("/documents/:id/convert", canPost, async (req, res) => {
  try { res.json(await docs.convertDocument(tenantOf(req), req.user.id, req.params.id, (req.body || {}).toKind, { date: (req.body || {}).date })); } catch (e) { fail(res, e); }
});
router.post("/documents/:id/cancel", canPost, async (req, res) => {
  try { res.json(await docs.cancelDocument(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});

// ── M2: document PRINT (branded HTML, client print-to-PDF) + SEND ────────────
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (m) => "₹" + Number(toRupees(m)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Indian-system amount in words (rupees + paise). Pure, no deps.
function rupeesInWords(amount) {
  const a = money(amount);
  const whole = a.floor();
  const paise = a.minus(whole).mul(100).round();
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n) => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  const three = (n) => (n >= 100 ? ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + two(n % 100) : "") : two(n));
  function conv(num) {
    num = Number(num);
    if (num === 0) return "Zero";
    let out = "";
    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh = Math.floor(num / 100000); num %= 100000;
    const thousand = Math.floor(num / 1000); num %= 1000;
    if (crore) out += three(crore) + " Crore ";
    if (lakh) out += two(lakh) + " Lakh ";
    if (thousand) out += two(thousand) + " Thousand ";
    if (num) out += three(num);
    return out.trim();
  }
  let words = conv(whole.toNumber()) + " Rupees";
  if (paise.greaterThan(0)) words += " and " + conv(paise.toNumber()) + " Paise";
  return words + " Only";
}

async function tenantCompany(tenantId) {
  const { rows } = await pool.query("SELECT company_name, legal_name, gstin, pan, address, city, state, pincode, phone, website, logo_url, upi_id FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
  return rows[0] || {};
}
async function partyLedger(tenantId, ledgerId) {
  if (!ledgerId) return {};
  const { rows } = await pool.query("SELECT name, gstin, state_code, billing_address, account_number, ifsc FROM book_ledgers WHERE tenant_id=$1 AND id=$2", [tenantId, ledgerId]);
  return rows[0] || {};
}

// Build the printable HTML for a document (estimate/invoice/etc). Tenant-scoped.
async function renderDocumentHtml(tenantId, docId) {
  const { rows: dr } = await pool.query("SELECT * FROM book_documents WHERE tenant_id=$1 AND id=$2", [tenantId, docId]);
  const doc = dr[0];
  if (!doc) return null;
  const co = await tenantCompany(tenantId);
  const party = await partyLedger(tenantId, doc.party_ledger_id);
  const interState = !!doc.inter_state;
  const lines = Array.isArray(doc.lines) ? doc.lines : [];
  const hasLines = lines.length > 0;

  // Compute totals: line-itemised when lines[] present, else single-rate fallback.
  let detail, taxable, cgst, sgst, igst, gross;
  if (hasLines) {
    const g = computeLineGst(lines, interState);
    detail = g.lines; taxable = g.taxable; cgst = g.cgst; sgst = g.sgst; igst = g.igst; gross = g.gross;
  } else {
    const g = computeLineGst([{ description: doc.narration || "Goods/Services", qty: 1, rate: doc.subtotal, discount: 0, hsn: doc.hsn_sac, gst_rate: doc.gst_rate }], interState);
    detail = g.lines; taxable = g.taxable; cgst = g.cgst; sgst = g.sgst; igst = g.igst; gross = g.gross;
  }

  const titleMap = { ESTIMATE: "Estimate / Quotation", SALES_ORDER: "Sales Order", DELIVERY_CHALLAN: "Delivery Challan", PURCHASE_ORDER: "Purchase Order", GRN: "Goods Receipt Note" };
  const title = titleMap[doc.doc_kind] || "Invoice";
  const companyName = co.company_name || co.legal_name || "Your Company";
  const companyAddr = [co.address, co.city, [co.state, co.pincode].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const rows = detail.map((l, i) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eee">${i + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(l.description)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${esc(l.hsn || "")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${esc(toRupees(l.qty))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${inr(l.rate)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${money(l.discount).greaterThan(0) ? inr(l.discount) : "-"}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${esc(toRupees(l.gstRate))}%</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${inr(l.net)}</td>
      </tr>`).join("");

  const taxRows = interState
    ? `<tr><td style="padding:4px 0;color:#555">IGST</td><td style="padding:4px 0;text-align:right">${inr(igst)}</td></tr>`
    : `<tr><td style="padding:4px 0;color:#555">CGST</td><td style="padding:4px 0;text-align:right">${inr(cgst)}</td></tr>
       <tr><td style="padding:4px 0;color:#555">SGST</td><td style="padding:4px 0;text-align:right">${inr(sgst)}</td></tr>`;

  const bankFooter = (co.upi_id || party.account_number) ? `
    <div style="margin-top:24px;padding:14px 16px;background:#faf8f0;border:1px solid #e7e0c8;border-radius:8px;font-size:12px;color:#555">
      <strong style="color:#333">Payment details</strong><br>
      ${co.upi_id ? `UPI: <strong>${esc(co.upi_id)}</strong><br>` : ""}
      ${co.gstin ? `GSTIN: ${esc(co.gstin)}` : ""}
    </div>` : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} #${esc(doc.doc_number)} - ${esc(companyName)}</title>
<style>@media print{.no-print{display:none}}body{margin:0}</style></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;background:#f4f4f0;margin:0;padding:24px">
  <div class="no-print" style="max-width:820px;margin:0 auto 16px;text-align:right">
    <button onclick="window.print()" style="background:#C9A227;color:#0d0d09;border:0;font-weight:700;font-size:13px;padding:10px 20px;border-radius:8px;cursor:pointer">Print / Save as PDF</button>
  </div>
  <div style="max-width:820px;margin:0 auto;background:#fff;border:1px solid #e2e2d8;border-radius:12px;padding:40px">
    <table width="100%" style="border-collapse:collapse"><tr>
      <td style="vertical-align:top">
        ${co.logo_url ? `<img src="${esc(co.logo_url)}" alt="logo" style="max-height:56px;max-width:200px;margin-bottom:8px">` : ""}
        <div style="font-size:22px;font-weight:800;color:#0d0d09">${esc(companyName)}</div>
        ${companyAddr ? `<div style="font-size:12px;color:#666;margin-top:4px;max-width:320px">${esc(companyAddr)}</div>` : ""}
        ${co.gstin ? `<div style="font-size:12px;color:#666;margin-top:2px">GSTIN: ${esc(co.gstin)}</div>` : ""}
        ${co.phone ? `<div style="font-size:12px;color:#666">Ph: ${esc(co.phone)}</div>` : ""}
      </td>
      <td style="vertical-align:top;text-align:right">
        <div style="font-size:26px;font-weight:800;letter-spacing:1px;color:#C9A227;text-transform:uppercase">${esc(title)}</div>
        <div style="font-size:13px;color:#444;margin-top:8px"># <strong>${esc(doc.doc_number)}</strong></div>
        <div style="font-size:13px;color:#444">Date: ${esc(String(doc.doc_date).slice(0, 10))}</div>
        ${doc.reference ? `<div style="font-size:12px;color:#888;margin-top:2px">Ref: ${esc(doc.reference)}</div>` : ""}
      </td>
    </tr></table>

    <div style="margin:28px 0 16px;padding:14px 16px;background:#fafaf7;border:1px solid #ececdf;border-radius:8px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999">Bill to</div>
      <div style="font-size:15px;font-weight:700;margin-top:4px">${esc(party.name || "-")}</div>
      ${party.billing_address ? `<div style="font-size:12px;color:#666;margin-top:2px">${esc(party.billing_address)}</div>` : ""}
      ${party.gstin ? `<div style="font-size:12px;color:#666;margin-top:2px">GSTIN: ${esc(party.gstin)}</div>` : ""}
      <div style="font-size:11px;color:#999;margin-top:4px">${interState ? "Inter-state supply (IGST)" : "Intra-state supply (CGST + SGST)"}</div>
    </div>

    <table width="100%" style="border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#0d0d09;color:#fff;text-align:left">
        <th style="padding:9px 10px">#</th><th style="padding:9px 10px">Description</th>
        <th style="padding:9px 10px;text-align:center">HSN/SAC</th><th style="padding:9px 10px;text-align:right">Qty</th>
        <th style="padding:9px 10px;text-align:right">Rate</th><th style="padding:9px 10px;text-align:right">Disc</th>
        <th style="padding:9px 10px;text-align:center">GST%</th><th style="padding:9px 10px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <table width="100%" style="margin-top:20px;border-collapse:collapse"><tr>
      <td style="vertical-align:top;width:55%">
        <div style="font-size:12px;color:#777">Amount in words</div>
        <div style="font-size:13px;font-weight:600;margin-top:4px;max-width:380px">${esc(rupeesInWords(gross))}</div>
        ${bankFooter}
      </td>
      <td style="vertical-align:top">
        <table width="100%" style="border-collapse:collapse;font-size:13px">
          <tr><td style="padding:4px 0;color:#555">Subtotal</td><td style="padding:4px 0;text-align:right">${inr(taxable)}</td></tr>
          ${taxRows}
          <tr style="border-top:2px solid #0d0d09"><td style="padding:8px 0;font-weight:800;font-size:15px">Total</td><td style="padding:8px 0;text-align:right;font-weight:800;font-size:15px">${inr(gross)}</td></tr>
        </table>
      </td>
    </tr></table>

    <div style="margin-top:32px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:14px">
      This is a computer-generated document. Generated via Headroom.
    </div>
  </div>
</body></html>`;
  return { doc, html, title, gross, companyName, party };
}

router.get("/documents/:id/print", async (req, res) => {
  try {
    const r = await renderDocumentHtml(tenantOf(req), req.params.id);
    if (!r) return res.status(404).json({ error: "Document not found" });
    res.set("Content-Type", "text/html; charset=utf-8").send(r.html);
  } catch (e) { fail(res, e); }
});

router.post("/documents/:id/send", canPost, async (req, res) => {
  try {
    const t = tenantOf(req); const b = req.body || {};
    const r = await renderDocumentHtml(t, req.params.id);
    if (!r) return res.status(404).json({ error: "Document not found" });
    const to = b.email || null;
    const phone = b.phone || null;
    const link = b.link || null; // optional public link the caller already minted
    const subject = b.subject || `${r.title} #${r.doc.doc_number} from ${r.companyName} - ${inr(r.gross)}`;
    const channels = [];

    // EMAIL - reuse lib/email.sendMail({to,subject,html}). Honest about config.
    if (to) {
      if (process.env.SMTP_USER) {
        await email.sendMail({ to, subject, html: r.html });
        channels.push({ channel: "email", to, delivered: true });
      } else {
        channels.push({ channel: "email", to, delivered: false, reason: "SMTP not configured (SMTP_USER unset)" });
      }
    }

    // WHATSAPP - reuse lib/whatsapp.sendWhatsApp(to, body). It returns false when
    // Twilio isn't configured (logs a mock); surface that truthfully.
    if (phone) {
      const body = `${r.companyName}: ${r.title} #${r.doc.doc_number} for ${inr(r.gross)}.` + (link ? ` View/pay: ${link}` : "");
      const delivered = await whatsapp.sendWhatsApp(phone, body);
      channels.push({ channel: "whatsapp", to: phone, delivered, ...(delivered ? {} : { reason: "Twilio WhatsApp not configured" }) });
    }

    if (!channels.length) return res.status(400).json({ error: "Provide email and/or phone to send to" });
    const anyDelivered = channels.some((c) => c.delivered);
    res.status(anyDelivered ? 200 : 202).json({ ok: anyDelivered, document: r.doc.id, subject, channels });
  } catch (e) { fail(res, e); }
});

// ── M2: deposits, recurring ──────────────────────────────────────────────────
// (POST /allocations is registered earlier via billwise.allocateBill - the
// duplicate docs.allocate handler that used to sit here was unreachable, so removed.)
router.get("/allocations", async (req, res) => {
  try {
    const t = tenantOf(req); const v = req.query.voucher;
    const { rows } = v
      ? await pool.query("SELECT * FROM book_allocations WHERE tenant_id=$1 AND (source_voucher_id=$2 OR target_voucher_id=$2) ORDER BY created_at DESC", [t, v])
      : await pool.query("SELECT * FROM book_allocations WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500", [t]);
    res.json(rows);
  } catch (e) { fail(res, e); }
});
router.post("/deposit", canPost, async (req, res) => {
  try { const b = req.body || {}; res.status(201).json(await docs.recordDeposit(tenantOf(req), req.user.id, b.bankLedgerId, b.amount, b.date)); } catch (e) { fail(res, e); }
});
router.post("/recurring", canPost, async (req, res) => {
  try { res.status(201).json(await docs.createRecurring(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); }
});
router.get("/recurring", async (req, res) => {
  try { const { rows } = await pool.query("SELECT * FROM book_recurring WHERE tenant_id=$1 ORDER BY next_run", [tenantOf(req)]); res.json(rows); } catch (e) { fail(res, e); }
});
router.post("/recurring/run", canPost, async (req, res) => {
  try { res.json(await docs.runRecurringDue(tenantOf(req), req.user.id, (req.body || {}).asOf)); } catch (e) { fail(res, e); }
});

// ── M3: items + inventory ────────────────────────────────────────────────────
router.post("/inventory/items", canPost, async (req, res) => { try { res.status(201).json(await inv.createItem(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/inventory/items", async (req, res) => {
  try { const { rows } = await pool.query("SELECT id,name,unit,hsn_sac,gst_rate,valuation_method,reorder_level,current_qty,current_value,is_active FROM book_stock_items WHERE tenant_id=$1 ORDER BY name", [tenantOf(req)]); res.json(rows); } catch (e) { fail(res, e); }
});
router.get("/inventory/items/:id/ledger", async (req, res) => { try { res.json(await inv.itemLedger(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.get("/inventory/low-stock", async (req, res) => { try { res.json(await inv.lowStock(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/inventory/warehouses", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await inv.createWarehouse(tenantOf(req), b.name, b.address)); } catch (e) { fail(res, e); } });
router.get("/inventory/warehouses", async (req, res) => { try { const { rows } = await pool.query("SELECT * FROM book_warehouses WHERE tenant_id=$1 ORDER BY name", [tenantOf(req)]); res.json(rows); } catch (e) { fail(res, e); } });
router.post("/inventory/price-lists", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await inv.createPriceList(tenantOf(req), b.name, b.currency)); } catch (e) { fail(res, e); } });
router.post("/inventory/price-lists/:id/items", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await inv.setPrice(tenantOf(req), req.params.id, b.itemId, b.price)); } catch (e) { fail(res, e); } });
router.post("/inventory/receive", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.itemId || b.qty == null || b.rate == null) return res.status(400).json({ error: "itemId, qty, rate required" }); res.json(await inv.receive(tenantOf(req), b.itemId, b.qty, b.rate, { warehouseId: b.warehouseId, voucherId: b.voucherId, date: b.date, batchNo: b.batchNo, mfgDate: b.mfgDate, expiryDate: b.expiryDate })); } catch (e) { fail(res, e); } });
router.post("/inventory/issue", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.itemId || b.qty == null) return res.status(400).json({ error: "itemId, qty required" }); res.json(await inv.issue(tenantOf(req), b.itemId, b.qty, { warehouseId: b.warehouseId, voucherId: b.voucherId, fefo: b.fefo })); } catch (e) { fail(res, e); } });
router.post("/inventory/transfer", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await inv.transfer(tenantOf(req), b.itemId, b.fromWh, b.toWh, b.qty)); } catch (e) { fail(res, e); } });
router.post("/inventory/stock-journal", canPost, async (req, res) => { try { res.json(await inv.postStockValueJournal(tenantOf(req), req.user.id, (req.body || {}).date || new Date().toISOString().slice(0, 10))); } catch (e) { fail(res, e); } });
// Wave-5 inventory depth: near-expiry, manufacture/stock-entry, physical adjustment, UoM, stock summary.
router.get("/inventory/near-expiry", async (req, res) => { try { res.json(await inv.nearExpiry(tenantOf(req), Number(req.query.days) || 90)); } catch (e) { fail(res, e); } });
router.post("/inventory/stock-entry", canPost, async (req, res) => { try { res.status(201).json(await inv.stockEntry(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/inventory/physical-adjust", canPost, async (req, res) => { try { res.status(201).json(await inv.physicalAdjust(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/inventory/items/:id/uom", canPost, async (req, res) => { try { res.json(await inv.setUomConversions(tenantOf(req), req.params.id, (req.body || {}).conversions || [])); } catch (e) { fail(res, e); } });
router.get("/reports/stock-summary", async (req, res) => { try { res.json(await reports.stockSummary(tenantOf(req), req.query.from || "1900-01-01", req.query.to || "2999-12-31")); } catch (e) { fail(res, e); } });
// Serial numbers, kits, variants, barcode.
router.post("/inventory/receive-serials", canPost, async (req, res) => { try { res.status(201).json(await inv.receiveSerials(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/inventory/issue-serials", canPost, async (req, res) => { try { res.status(201).json(await inv.issueSerials(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/inventory/items/:id/serials", async (req, res) => { try { res.json(await inv.listSerials(tenantOf(req), req.params.id, req.query.status)); } catch (e) { fail(res, e); } });
router.post("/inventory/build-kit", canPost, async (req, res) => { try { res.status(201).json(await inv.buildKit(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/inventory/items/:id/variants", canPost, async (req, res) => { try { res.status(201).json(await items.createVariant(tenantOf(req), { ...req.body, parentItemId: req.params.id })); } catch (e) { fail(res, e); } });
router.get("/inventory/items/:id/variants", async (req, res) => { try { res.json(await items.listVariants(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/inventory/items/:id/kit", canPost, async (req, res) => { try { res.json(await items.setKitComponents(tenantOf(req), req.params.id, (req.body || {}).components || [])); } catch (e) { fail(res, e); } });
router.get("/inventory/items/:id/kit", async (req, res) => { try { res.json(await items.getKitComponents(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/inventory/items/:id/barcode", canPost, async (req, res) => { try { res.json(await items.setBarcode(tenantOf(req), req.params.id, (req.body || {}).barcode)); } catch (e) { fail(res, e); } });
router.get("/inventory/barcode/:code", async (req, res) => { try { res.json(await items.findByBarcode(tenantOf(req), req.params.code)); } catch (e) { fail(res, e); } });

// ── M4: GST returns ──────────────────────────────────────────────────────────
const reqPeriod = (req, res) => { const p = req.query.period; if (!p || !/^\d{4}-\d{2}$/.test(p)) { res.status(400).json({ error: "period=YYYY-MM required" }); return null; } return p; };
router.get("/gst/gstr1", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.gstr1(tenantOf(req), p)); } catch (e) { fail(res, e); } });
router.get("/gst/gstr3b", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.gstr3b(tenantOf(req), p)); } catch (e) { fail(res, e); } });
router.post("/gst/gstr2b/reconcile", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.period) return res.status(400).json({ error: "period required" }); res.json(await gst.gstr2bReconcile(tenantOf(req), b.period, b.rows || [])); } catch (e) { fail(res, e); } });
router.post("/gst/gstr2b/match", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.period) return res.status(400).json({ error: "period required" }); res.json(await gst.gstr2bMatch(tenantOf(req), b.period, b.portalInvoices || b.rows || [])); } catch (e) { fail(res, e); } });
// Identifier validation (GSTIN/PAN/Aadhaar/IFSC/… checksums).
router.get("/validate", async (req, res) => { try { res.json(validators.validate(req.query.kind, req.query.value)); } catch (e) { fail(res, e); } });
router.get("/validate/gstin", async (req, res) => { try { res.json(validators.gstinInfo(String(req.query.value || ""))); } catch (e) { fail(res, e); } });

// ── Subscriptions (recurring billing) ────────────────────────────────────────
router.post("/subscription-plans", canPost, async (req, res) => { try { res.status(201).json(await subs.createPlan(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/subscription-plans", async (req, res) => { try { res.json(await subs.listPlans(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/subscriptions", canPost, async (req, res) => { try { res.status(201).json(await subs.createSubscription(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/subscriptions", async (req, res) => { try { res.json(await subs.listSubscriptions(tenantOf(req), req.query.status)); } catch (e) { fail(res, e); } });
router.post("/subscriptions/:id/change-plan", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await subs.changePlan(tenantOf(req), { subscriptionId: req.params.id, newPlanId: b.newPlanId, prorate: b.prorate !== false })); } catch (e) { fail(res, e); } });
router.post("/subscriptions/:id/cancel", canPost, async (req, res) => { try { res.json(await subs.cancelSubscription(tenantOf(req), req.params.id, (req.body || {}).atPeriodEnd !== false)); } catch (e) { fail(res, e); } });
router.post("/subscriptions/run", canPost, async (req, res) => { try { res.status(201).json(await subs.generateDueInvoices(tenantOf(req), (req.body || {}).asOf || new Date().toISOString().slice(0, 10))); } catch (e) { fail(res, e); } });
// Investor-demo seeder: populate the books module (GL, invoices, GST, inventory, subscriptions, usage) for this tenant.
router.post("/demo-seed", canPost, async (req, res) => { try { res.status(201).json(await demoseed.seedDemo(tenantOf(req), req.user.id)); } catch (e) { fail(res, e); } });
// Usage / metered billing.
router.post("/usage/ingest", canPost, async (req, res) => { try { res.status(201).json(await usage.ingestUsage(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/usage/aggregate", async (req, res) => { try { const q = req.query; res.json(await usage.aggregateUsage(tenantOf(req), { subscriptionId: q.subscriptionId, metric: q.metric, from: q.from, to: q.to, aggregation: q.aggregation })); } catch (e) { fail(res, e); } });
router.get("/subscriptions/:id/usage-charge", async (req, res) => { try { res.json(await usage.usageChargeForPeriod(tenantOf(req), req.params.id, req.query.from, req.query.to)); } catch (e) { fail(res, e); } });
router.get("/gst/gstr9", async (req, res) => { try { res.json(await gst.gstr9(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); } });
router.get("/gst/tds", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.deductionReport(tenantOf(req), p, "TDS")); } catch (e) { fail(res, e); } });
router.get("/gst/tcs", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.deductionReport(tenantOf(req), p, "TCS")); } catch (e) { fail(res, e); } });
// GST rate master + challan (PMT-06) + blocked ITC.
router.post("/gst/rates", canPost, async (req, res) => { try { res.status(201).json(await gst.setGstRate(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/gst/rates", async (req, res) => { try { res.json(await gst.listGstRates(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/gst/challans", canPost, async (req, res) => { try { res.status(201).json(await gst.recordChallan(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/gst/challans", async (req, res) => { try { res.json(await gst.listChallans(tenantOf(req), req.query.period)); } catch (e) { fail(res, e); } });
router.get("/gst/liability-vs-paid", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.gstLiabilityVsPaid(tenantOf(req), p)); } catch (e) { fail(res, e); } });
router.get("/gst/blocked-itc", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.blockedItcSummary(tenantOf(req), p)); } catch (e) { fail(res, e); } });
// GSTR-1 statutory sections, HSN summary, portal JSON.
router.get("/gst/gstr1-sections", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.gstr1Sections(tenantOf(req), p)); } catch (e) { fail(res, e); } });
router.get("/gst/hsn-summary",    async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.hsnSummary(tenantOf(req), p)); } catch (e) { fail(res, e); } });
router.get("/gst/gstr1-json",     async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.gstr1Json(tenantOf(req), p)); } catch (e) { fail(res, e); } });

// ── TDS at source ────────────────────────────────────────────────────────────
router.get("/tds/sections", async (_req, res) => { res.json(tds.TDS_SECTIONS); });
router.post("/tds/compute", async (req, res) => { try { res.json(tds.computeTds(req.body || {})); } catch (e) { fail(res, e); } });

// ── E-way bill ───────────────────────────────────────────────────────────────
router.get("/documents/:id/eway/payload", async (req, res) => { try { res.json(await ewb.buildEwbPayload(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/documents/:id/eway/generate", canPost, async (req, res) => { try { res.json(await ewb.generateEwayBill(tenantOf(req), req.user.id, req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/documents/:id/eway/status", async (req, res) => { try { res.json(await ewb.ewbStatus(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
// ── Wave A1 (depth): e-way lifecycle, GSTR-9/9C + GSTR-1 extras, ITR JSON, Bill-of-Entry/ITC-04 ──
router.post("/documents/:id/eway/update-vehicle", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await ewb.updateVehicle(tenantOf(req), req.user.id, { voucherId: req.params.id, vehicleNo: b.vehicleNo, vehicleType: b.vehicleType, transMode: b.transMode, transDocNo: b.transDocNo, transDocDate: b.transDocDate, reasonCode: b.reasonCode, reasonRem: b.reasonRem })); } catch (e) { fail(res, e); } });
router.post("/documents/:id/eway/update-transporter", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await ewb.updateTransporter(tenantOf(req), req.user.id, { voucherId: req.params.id, transporterId: b.transporterId })); } catch (e) { fail(res, e); } });
router.post("/documents/:id/eway/extend", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await ewb.extendValidity(tenantOf(req), req.user.id, { voucherId: req.params.id, remainingDistance: b.remainingDistance, consignmentStatus: b.consignmentStatus, transitType: b.transitType, vehicleNo: b.vehicleNo, vehicleType: b.vehicleType, transMode: b.transMode, transDocNo: b.transDocNo, transDocDate: b.transDocDate, reasonCode: b.reasonCode, reasonRem: b.reasonRem })); } catch (e) { fail(res, e); } });
router.post("/documents/:id/eway/cancel", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await ewb.cancelEwb(tenantOf(req), req.user.id, { voucherId: req.params.id, reasonCode: b.reasonCode, reasonRem: b.reasonRem })); } catch (e) { fail(res, e); } });
router.post("/gst/gstr9", canPost, async (req, res) => { try { res.json(await gst.gstr9(tenantOf(req), req.body && req.body.fy ? String(req.body.fy) : fyOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/gst/gstr9c", canPost, async (req, res) => { try { res.json(await gst.gstr9c(tenantOf(req), req.body && req.body.fy ? String(req.body.fy) : fyOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/gst/gstr9c", async (req, res) => { try { res.json(await gst.gstr9c(tenantOf(req), fyOf(req), {})); } catch (e) { fail(res, e); } });
router.get("/gst/gstr1-doc-issue", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.gstr1DocIssue(tenantOf(req), p)); } catch (e) { fail(res, e); } });
router.get("/gst/gstr1-advances", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.gstr1Advances(tenantOf(req), p)); } catch (e) { fail(res, e); } });
router.post("/gst/gstr1-json", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.period || !/^\d{4}-\d{2}$/.test(b.period)) return res.status(400).json({ error: "period=YYYY-MM required" }); res.json(await gst.gstr1Json(tenantOf(req), b.period, b)); } catch (e) { fail(res, e); } });
router.post("/tax/itr-json", async (req, res) => { try { const b = req.body || {}; res.json(await itr.buildItrJson(tenantOf(req), { ay: b.ay, regime: b.regime, form: b.form, entityType: b.entityType, otherIncome: b.otherIncome, capitalGains: b.capitalGains, deductions: b.deductions, deductionsBreakup: b.deductionsBreakup, rateRegime: b.rateRegime, companyRate25: b.companyRate25 })); } catch (e) { fail(res, e); } });
router.get("/tax/itr-forms", async (_req, res) => { try { res.json(itr.listForms()); } catch (e) { fail(res, e); } });
router.post("/boe", canPost, async (req, res) => { try { res.status(201).json(await billofentry.createBoe(tenantOf(req), req.user.id, req.body || {}, { idempotencyKey: idem(req) })); } catch (e) { fail(res, e); } });
router.get("/boe", async (req, res) => { try { res.json(await billofentry.listBoe(tenantOf(req), { from: req.query.from, to: req.query.to, vendorLedgerId: req.query.vendorLedgerId })); } catch (e) { fail(res, e); } });
router.post("/itc04", canPost, async (req, res) => { try { res.status(201).json(await billofentry.createItc04Challan(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/itc04", async (req, res) => { try { res.json(await billofentry.listItc04Challans(tenantOf(req), { direction: req.query.direction, from: req.query.from, to: req.query.to, jobWorkerGstin: req.query.jobWorkerGstin })); } catch (e) { fail(res, e); } });
// ── Wave A2 (depth): reposting, landed cost, FX revaluation, auto-FIFO, rules, import configs, dunning, payment retry, integrity, settlement, recurrence ──
router.post("/inventory/repost", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.itemId && !b.allOpen && !b.fromDate) return res.status(400).json({ error: "fromDate (and itemId or allOpen) required" }); res.json(await reposting.repostFromDate(tenantOf(req), { itemId: b.itemId, warehouseId: b.warehouseId, fromDate: b.fromDate, allOpen: !!b.allOpen, actorId: req.user.id, reason: b.reason })); } catch (e) { fail(res, e); } });
router.post("/inventory/repost/recover", canPost, async (req, res) => { try { res.json(await reposting.recoverFailedReposts(tenantOf(req), req.user.id)); } catch (e) { fail(res, e); } });
router.get("/inventory/repost", async (req, res) => { try { res.json(await reposting.listRepostRuns(tenantOf(req), { itemId: req.query.itemId, status: req.query.status })); } catch (e) { fail(res, e); } });
router.post("/inventory/landed-cost", canPost, async (req, res) => { try { res.status(201).json(await landedcost.createLandedCost(tenantOf(req), req.user.id, req.body || {}, { idempotencyKey: idem(req) })); } catch (e) { fail(res, e); } });
router.get("/inventory/landed-cost", async (req, res) => { try { res.json(await landedcost.listLandedCost(tenantOf(req), { from: req.query.from, to: req.query.to })); } catch (e) { fail(res, e); } });
router.post("/fx/revalue-all", canPost, async (req, res) => { try { const b = req.body || {}; const asOf = b.asOf || b.asOfDate || req.query.asOf; if (!asOf) return res.status(400).json({ error: "asOf (as-of date) required" }); res.json(await fx.revalueAll(tenantOf(req), req.user.id, asOf)); } catch (e) { fail(res, e); } });
router.get("/fx/open-position", async (req, res) => { try { res.json(await fx.openPosition(tenantOf(req), { partyLedgerId: req.query.partyLedgerId, currency: req.query.currency })); } catch (e) { fail(res, e); } });
router.post("/billwise/auto-allocate", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await billwise.autoAllocate(tenantOf(req), req.user.id, { partyLedgerId: b.partyLedgerId, receiptVoucherId: b.receiptVoucherId, amount: b.amount })); } catch (e) { fail(res, e); } });
router.get("/rules/groups", async (req, res) => { try { res.json(await rules.listRuleGroups(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/rules/groups", canPost, async (req, res) => { try { res.status(201).json(await rules.createRuleGroup(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/rules", async (req, res) => { try { res.json(await rules.listRules(tenantOf(req), req.query.groupId)); } catch (e) { fail(res, e); } });
router.post("/rules", canPost, async (req, res) => { try { res.status(201).json(await rules.createRule(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.patch("/rules/:id", canPost, async (req, res) => { try { res.json(await rules.updateRule(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.delete("/rules/:id", canPost, async (req, res) => { try { res.json(await rules.deleteRule(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/rules/apply", async (req, res) => { try { res.json(await rules.applyRules(tenantOf(req), (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.get("/import-configs", async (req, res) => { try { res.json(await importcfg.listConfigs(tenantOf(req))); } catch (e) { fail(res, e); } });
router.get("/import-configs/:id", async (req, res) => { try { res.json(await importcfg.getConfig(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/import-configs", canPost, async (req, res) => { try { res.status(201).json(await importcfg.createConfig(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.patch("/import-configs/:id", canPost, async (req, res) => { try { res.json(await importcfg.updateConfig(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.delete("/import-configs/:id", canPost, async (req, res) => { try { res.json(await importcfg.deleteConfig(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/import-configs/:id/run", canPost, async (req, res) => { try { res.status(201).json(await importcfg.runImport(tenantOf(req), { configId: req.params.id, content: (req.body || {}).content })); } catch (e) { fail(res, e); } });
router.get("/dunning/procedure", async (req, res) => { try { res.json(await dunning.listDunningLevels(tenantOf(req), req.query.procedure)); } catch (e) { fail(res, e); } });
router.post("/dunning/procedure", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await dunning.setDunningProcedure(tenantOf(req), { name: b.name || b.procedure, levels: b.levels })); } catch (e) { fail(res, e); } });
router.get("/dunning/due", async (req, res) => { try { res.json(await dunning.dueDunnings(tenantOf(req), { asOfDate: req.query.asOf, procedure: req.query.procedure })); } catch (e) { fail(res, e); } });
router.post("/dunning/run", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await dunning.generateDunnings(tenantOf(req), b.asOf || b.asOfDate, { procedure: b.procedure, actorId: req.user.id, dryRun: !!b.dryRun })); } catch (e) { fail(res, e); } });
router.get("/payments/retry-policy", (req, res) => { try { res.json(payments.retryPolicy()); } catch (e) { fail(res, e); } });
router.post("/payments/classify-decline", (req, res) => { try { const { provider, code } = req.body || {}; if (!code) return res.status(400).json({ error: "code required" }); res.json(payments.classifyDecline(provider, code)); } catch (e) { fail(res, e); } });
router.post("/integrity/assert-balance", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await integrity.assertBalance(tenantOf(req), { ledgerId: b.ledgerId, asOfDate: b.asOfDate, expected: b.expected, tolerance: b.tolerance, isDebit: b.isDebit, dir: b.dir, note: b.note })); } catch (e) { fail(res, e); } });
router.post("/integrity/pad-opening", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await integrity.padOpening(tenantOf(req), req.user.id, { ledgerId: b.ledgerId, asOfDate: b.asOfDate, target: b.target, isDebit: b.isDebit, dir: b.dir, narration: b.narration }, { idempotencyKey: idem(req) })); } catch (e) { fail(res, e); } });
router.get("/integrity/checks", async (req, res) => { try { res.json(await integrity.runChecks(tenantOf(req), { fy: req.query.fy, from: req.query.from, to: req.query.to, limit: req.query.limit })); } catch (e) { fail(res, e); } });
router.post("/settlement/ingest", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await settlement.ingestPayout(tenantOf(req), { provider: b.provider, rows: b.rows })); } catch (e) { fail(res, e); } });
router.post("/settlement/reconcile", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await settlement.reconcile(tenantOf(req), { toleranceDays: b.toleranceDays, feeBand: b.feeBand })); } catch (e) { fail(res, e); } });
router.get("/settlement/exceptions", async (req, res) => { try { res.json(await settlement.listExceptions(tenantOf(req), { status: req.query.status, kind: req.query.kind, limit: req.query.limit })); } catch (e) { fail(res, e); } });
router.get("/recurrences", async (req, res) => { try { res.json(await recurrence.listRecurrences(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/recurrences", canPost, async (req, res) => { try { res.status(201).json(await recurrence.createRecurrence(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/recurrences/:id", async (req, res) => { try { res.json(await recurrence.getRecurrence(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.patch("/recurrences/:id", canPost, async (req, res) => { try { res.json(await recurrence.updateRecurrence(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.delete("/recurrences/:id", canPost, async (req, res) => { try { res.json(await recurrence.deleteRecurrence(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.get("/recurrences/:id/preview", async (req, res) => { try { res.json(await recurrence.preview(tenantOf(req), req.params.id, req.query.count)); } catch (e) { fail(res, e); } });
router.post("/recurrences/run", canPost, async (req, res) => { try { res.json(await recurrence.runDue(tenantOf(req), (req.body || {}).asOf, req.user.id)); } catch (e) { fail(res, e); } });
// ── Bulk upload (CSV template → rows): { rows:[...] } → { created, failed, errors:[{row,error}] } ──
router.post("/ledgers/bulk", canPost, async (req, res) => { try { res.json(await ledgersadmin.bulkCreateLedgers(tenantOf(req), req.user.id, (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.post("/inventory/items/bulk", canPost, async (req, res) => { try { res.status(201).json(await items.bulkCreateItems(tenantOf(req), req.user.id, (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.post("/cost-centres/bulk", canPost, async (req, res) => { try { res.status(201).json(await cc.bulkCreateCostCentres(tenantOf(req), req.user.id, (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.post("/projects/bulk", canPost, async (req, res) => { try { res.status(201).json(await cc.bulkCreateProjects(tenantOf(req), req.user.id, (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.post("/pricing/bulk", canPost, async (req, res) => { try { res.json(await pricing.bulkUpsertPrices(tenantOf(req), req.user.id, (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.post("/boe/bulk", canPost, async (req, res) => { try { res.json(await billofentry.bulkCreateBoe(tenantOf(req), req.user.id, (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.post("/itc04/bulk", canPost, async (req, res) => { try { res.json(await billofentry.bulkCreateItc04(tenantOf(req), req.user.id, (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.post("/documents/bulk", canPost, async (req, res) => { try { res.json(await docs.bulkCreateInvoices(tenantOf(req), req.user.id, (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
// ── SMB AI agents (per-tenant LLM engine + read-only agents). Specific paths before /:id. ──
router.get("/agents/tools", async (_req, res) => { try { res.json(agenttools.toolCatalog()); } catch (e) { fail(res, e); } });
router.get("/agents/usage", async (req, res) => { try { res.json(await agents.usageSummary(tenantOf(req))); } catch (e) { fail(res, e); } });
router.get("/agents/llm-config", async (req, res) => { try { res.json(await llm.getTenantLlm(tenantOf(req))); } catch (e) { fail(res, e); } });
router.put("/agents/llm-config", canPost, async (req, res) => { try { const b = req.body || {}; await llm.setTenantLlm(tenantOf(req), { baseUrl: b.baseUrl, model: b.model, apiKey: b.apiKey, embedModel: b.embedModel }); res.json(await llm.getTenantLlm(tenantOf(req))); } catch (e) { fail(res, e); } });
router.get("/agents/templates", async (_req, res) => { try { res.json(agenttemplates.listTemplates()); } catch (e) { fail(res, e); } });
router.post("/agents/templates/:id/clone", canPost, async (req, res) => { try { res.status(201).json(await agenttemplates.cloneTemplate(tenantOf(req), req.params.id, req.user.id)); } catch (e) { fail(res, e); } });
router.post("/agents/llm-config/test", async (req, res) => { try { await llm.chat(tenantOf(req), { messages: [{ role: "user", content: "ping" }] }); res.json({ ok: true }); } catch (e) { res.json({ ok: false, error: e.message }); } });
router.post("/agents/run-scheduled", canPost, async (_req, res) => { try { res.json(await agents.runScheduledAgents(new Date())); } catch (e) { fail(res, e); } });
router.get("/agents", async (req, res) => { try { res.json(await agents.listAgents(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/agents", canPost, async (req, res) => { try { res.status(201).json(await agents.createAgent(tenantOf(req), { ...(req.body || {}), created_by: req.user.id })); } catch (e) { fail(res, e); } });
router.get("/agents/:id", async (req, res) => { try { res.json(await agents.getAgent(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.patch("/agents/:id", canPost, async (req, res) => { try { res.json(await agents.updateAgent(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.delete("/agents/:id", canPost, async (req, res) => { try { res.json(await agents.deleteAgent(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/agents/:id/run", async (req, res) => { try { res.json(await agents.runAgent(tenantOf(req), req.user.id, req.params.id, (req.body || {}).message || "")); } catch (e) { fail(res, e); } });
// Live-streaming run (SSE): emits the agent's reasoning + tool steps as they happen.
router.post("/agents/:id/run/stream", async (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  res.write("retry: 3000\n\n");
  const controller = new AbortController();
  req.on("close", () => controller.abort());
  const emit = (ev) => { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { /* socket closed */ } };
  try {
    await agents.runAgentStream(tenantOf(req), req.user.id, req.params.id, (req.body || {}).message || "", emit, controller.signal);
  } catch (e) {
    emit({ type: "error", message: e.message || String(e) });
    emit({ type: "done", status: "error" });
  }
  res.end();
});
router.post("/agents/:id/swarm", async (req, res) => { try { res.json(await agents.runSwarm(tenantOf(req), req.user.id, req.params.id, (req.body || {}).message || "")); } catch (e) { fail(res, e); } });
// Past runs (chat history) - so the workspace transcript survives a reload instead of living only in browser memory.
router.get("/agents/:id/runs", async (req, res) => { try { res.json(await agents.listRuns(tenantOf(req), req.params.id, req.query.limit)); } catch (e) { fail(res, e); } });
// Approve a proposed write action (human-in-the-loop) - re-checks the actor's role.
router.post("/agents/:id/confirm", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await agents.confirmAction(tenantOf(req), req.user.id, { tool: b.tool, args: b.args, role: req.user.role })); } catch (e) { fail(res, e); } });
// Agent knowledge (RAG) docs.
router.post("/agents/:id/docs", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await agentrag.addDoc(tenantOf(req), req.params.id, { title: b.title, content: b.content })); } catch (e) { fail(res, e); } });
router.get("/agents/:id/docs", async (req, res) => { try { res.json(await agentrag.listDocs(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.delete("/agents/:id/docs/:title", canPost, async (req, res) => { try { res.json(await agentrag.deleteDoc(tenantOf(req), req.params.id, decodeURIComponent(req.params.title))); } catch (e) { fail(res, e); } });

// ── M5: reconciliation bridge ────────────────────────────────────────────────
router.post("/recon/import", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await recon.importLines(tenantOf(req), b.bankLedgerId, b.lines)); } catch (e) { fail(res, e); } });
// Import a real bank-statement FILE (OFX/QFX/QIF/CAMT.053/MT940/CSV) → parsed lines.
router.post("/recon/import-file", canPost, async (req, res) => { try { const b = req.body || {}; const lines = importers.parseStatement(b.format, b.content); res.status(201).json({ parsed: lines.length, ...(await recon.importLines(tenantOf(req), b.bankLedgerId, lines)) }); } catch (e) { fail(res, e); } });
router.post("/recon/auto-match", canPost, async (req, res) => { try { res.json(await recon.autoMatch(tenantOf(req), (req.body || {}).toleranceDays || 3)); } catch (e) { fail(res, e); } });
router.get("/recon/inbox", async (req, res) => { try { res.json(await recon.inbox(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/recon/confirm", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await recon.confirmLine(tenantOf(req), req.user.id, b.lineId, b.counterLedgerId)); } catch (e) { fail(res, e); } });
router.post("/recon/ignore", canPost, async (req, res) => { try { res.json(await recon.ignoreLine(tenantOf(req), (req.body || {}).lineId)); } catch (e) { fail(res, e); } });
router.get("/recon/statement", async (req, res) => { try { if (!req.query.bankLedgerId) return res.status(400).json({ error: "bankLedgerId required" }); res.json(await recon.bankRecStatement(tenantOf(req), req.query.bankLedgerId)); } catch (e) { fail(res, e); } });
router.post("/recon/mark-cleared", canPost, async (req, res) => { try { res.status(201).json(await recon.markCleared(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/recon/apply-rules", async (req, res) => { try { const b = req.body || {}; res.json(await recon.applyRules(tenantOf(req), b.lines || [], b.rules || [])); } catch (e) { fail(res, e); } });

// ── M5: payment links ────────────────────────────────────────────────────────
router.post("/payments/links", canPost, async (req, res) => { try { res.status(201).json(await payments.createLink(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/payments/links/:id/paid", canPost, async (req, res) => { try { res.status(201).json(await payments.markPaid(tenantOf(req), req.user.id, req.params.id, (req.body || {}).bankLedgerId)); } catch (e) { fail(res, e); } });
router.get("/payments/links", async (req, res) => { try { const { rows } = await pool.query("SELECT * FROM book_payment_links WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500", [tenantOf(req)]); res.json(rows); } catch (e) { fail(res, e); } });

// ── M6: reporting depth ──────────────────────────────────────────────────────
router.get("/reports/cash-flow", async (req, res) => { try { res.json(await reports.cashFlow(tenantOf(req), req.query.from || "1900-01-01", req.query.to || "2999-12-31")); } catch (e) { fail(res, e); } });
router.get("/reports/profit-loss/comparative", async (req, res) => { try { res.json(await reports.comparativePL(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); } });
router.get("/reports/by-tag", async (req, res) => { try { if (!req.query.dimension) return res.status(400).json({ error: "dimension required" }); res.json(await reports.byTag(tenantOf(req), fyOf(req), String(req.query.dimension))); } catch (e) { fail(res, e); } });
router.get("/reports/budget-vs-actual", async (req, res) => { try { res.json(await reports.budgetVsActual(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); } });
router.post("/budgets", canPost, async (req, res) => { try { res.status(201).json(await reports.createBudget(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/tags", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await reports.createTag(tenantOf(req), b.dimension, b.value)); } catch (e) { fail(res, e); } });

// ── M7: branches/GSTINs, multi-currency, fixed assets ────────────────────────
router.post("/branches", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.name) return res.status(400).json({ error: "name required" }); const { rows } = await pool.query("INSERT INTO book_branches(tenant_id,name,gstin,state_code) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,name) DO UPDATE SET gstin=EXCLUDED.gstin,state_code=EXCLUDED.state_code RETURNING *", [tenantOf(req), b.name, b.gstin || null, b.stateCode || null]); res.status(201).json(rows[0]); } catch (e) { fail(res, e); } });
router.get("/branches", async (req, res) => { try { const { rows } = await pool.query("SELECT * FROM book_branches WHERE tenant_id=$1 ORDER BY name", [tenantOf(req)]); res.json(rows); } catch (e) { fail(res, e); } });
router.get("/fx/convert", async (req, res) => { try { res.json({ base: fx.fxConvert(req.query.amount || 0, req.query.rate || 1).toFixed(2) }); } catch (e) { fail(res, e); } });
router.post("/fx/settlement", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await fx.postFxSettlement(tenantOf(req), req.user.id, { partyLedgerId: b.partyLedgerId, gainLoss: b.gainLoss, date: b.date || new Date().toISOString().slice(0, 10) })); } catch (e) { fail(res, e); } });
// Exchange-rate master + revaluation (multi-currency).
router.post("/fx/rates", canPost, async (req, res) => { try { res.status(201).json(await fx.setRate(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/fx/rates", async (req, res) => { try { if (!req.query.currency) return res.status(400).json({ error: "currency required" }); res.json(await fx.listRates(tenantOf(req), req.query.currency)); } catch (e) { fail(res, e); } });
router.post("/fx/revalue", canPost, async (req, res) => { try { res.json(await fx.revalue(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });

// ── Bulk import (onboarding/migration) ───────────────────────────────────────
router.post("/import/ledgers", canPost, async (req, res) => { try { res.json(await importer.importLedgers(tenantOf(req), (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.post("/import/items", canPost, async (req, res) => { try { res.json(await importer.importItems(tenantOf(req), (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.post("/import/opening-balances", canPost, async (req, res) => { try { res.json(await importer.importOpeningBalances(tenantOf(req), (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });

// ── Year-end closing (posts a closing voucher + locks the FY) ────────────────
router.post("/period/close", canPost, async (req, res) => { try { res.status(201).json(await closing.yearEndClose(tenantOf(req), req.user.id, (req.body || {}).fy || fyOf(req))); } catch (e) { fail(res, e); } });
router.post("/assets", canPost, async (req, res) => { try { res.status(201).json(await assets.createAsset(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/assets", async (req, res) => { try { const { rows } = await pool.query("SELECT * FROM book_fixed_assets WHERE tenant_id=$1 ORDER BY acquired_on DESC", [tenantOf(req)]); res.json(rows); } catch (e) { fail(res, e); } });
router.post("/assets/depreciation/run", canPost, async (req, res) => { try { res.json(await assets.runDepreciation(tenantOf(req), req.user.id, (req.body || {}).asOf || new Date().toISOString().slice(0, 10))); } catch (e) { fail(res, e); } });
router.get("/assets/register", async (req, res) => { try { res.json(await assets.assetRegister(tenantOf(req), { status: req.query.status })); } catch (e) { fail(res, e); } });
router.post("/assets/:id/dispose", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await assets.disposeAsset(tenantOf(req), req.user.id, { assetId: req.params.id, disposalValue: b.disposalValue, date: b.date, bankLedgerId: b.bankLedgerId })); } catch (e) { fail(res, e); } });
router.patch("/assets/:id/group", canPost, async (req, res) => { try { res.json(await assets.setAssetGroup(tenantOf(req), req.params.id, (req.body || {}).group)); } catch (e) { fail(res, e); } });
router.patch("/assets/:id/it-block", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await assets.setAssetItBlock(tenantOf(req), req.params.id, { itBlock: b.itBlock ?? b.it_block, itRate: b.itRate ?? b.it_rate })); } catch (e) { fail(res, e); } });
// Income-Tax Act block depreciation for a FY (dual-book). GET computes; POST commits the rollforward.
router.get("/assets/it-depreciation", async (req, res) => { try { res.json(await assets.itActDepreciation(tenantOf(req), req.query.fy)); } catch (e) { fail(res, e); } });
router.post("/assets/it-depreciation/close", canPost, async (req, res) => { try { res.json(await assets.itActDepreciation(tenantOf(req), (req.body || {}).fy, { commit: true })); } catch (e) { fail(res, e); } });
// Exit / diligence readiness score (books hygiene + compliance + receivables + documentation).
router.get("/exit-readiness", async (req, res) => { try { res.json(await require("../../lib/exitReadiness").exitReadiness(tenantOf(req))); } catch (e) { fail(res, e); } });
// Diligence data-room: a manifest of financials/compliance/contracts/assets/ownership on file.
router.get("/data-room", async (req, res) => { try { res.json(await require("../../lib/dataRoom").dataRoom(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); } });
// Renewals / expiry registry (licenses, DSC, AMC, agreements, registrations, insurance).
const expiry = require("./expiry");
router.get("/expiry-items", async (req, res) => { try { res.json(await expiry.listExpiryItems(tenantOf(req), { kind: req.query.kind, status: req.query.status })); } catch (e) { fail(res, e); } });
router.get("/expiry-items/due", async (req, res) => { try { res.json(await expiry.dueSoon(tenantOf(req), Number(req.query.within) || 30)); } catch (e) { fail(res, e); } });
router.post("/expiry-items", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await expiry.createExpiryItem(tenantOf(req), req.user.id, { kind: b.kind, name: b.name, identifier: b.identifier, counterparty: b.counterparty, amount: b.amount, issuedOn: b.issued_on, expiresOn: b.expires_on, reminderDays: b.reminder_days, notes: b.notes })); } catch (e) { fail(res, e); } });
router.post("/expiry-items/:id/renew", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await expiry.renewExpiryItem(tenantOf(req), req.params.id, { newExpiresOn: b.new_expires_on, amount: b.amount, issuedOn: b.issued_on })); } catch (e) { fail(res, e); } });
router.delete("/expiry-items/:id", canPost, async (req, res) => { try { res.json(await expiry.removeExpiryItem(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
// Rent register + §194-I TDS + escalation schedules.
const rent = require("./rent");
router.get("/rent", async (req, res) => { try { res.json(await rent.listRentAgreements(tenantOf(req))); } catch (e) { fail(res, e); } });
router.get("/rent/:id/schedule", async (req, res) => { try { res.json(await rent.rentSchedule(tenantOf(req), req.params.id, Number(req.query.months) || 12)); } catch (e) { fail(res, e); } });
router.post("/rent", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await rent.createRentAgreement(tenantOf(req), req.user.id, { landlord: b.landlord, landlordPan: b.landlord_pan, property: b.property, monthlyRent: b.monthly_rent, deposit: b.deposit, startDate: b.start_date, endDate: b.end_date, escalationPct: b.escalation_pct, escalationMonths: b.escalation_months, tdsRate: b.tds_rate, direction: b.direction, notes: b.notes })); } catch (e) { fail(res, e); } });
router.post("/rent/:id/end", canPost, async (req, res) => { try { res.json(await rent.endRentAgreement(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
// Profitability reports + Tally XML export + numbering audit.
router.get("/reports/profitability/party", async (req, res) => { try { res.json(await reports.profitabilityByParty(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); } });
router.get("/reports/profitability/item", async (req, res) => { try { res.json(await reports.profitabilityByItem(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); } });
router.get("/reports/profitability/project", async (req, res) => { try { res.json(await reports.profitabilityByProject(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); } });
router.get("/reports/tally-xml", async (req, res) => { try { const xml = await reports.tallyXml(tenantOf(req), fyOf(req)); res.type("application/xml").send(xml); } catch (e) { fail(res, e); } });
router.get("/audit/number-gaps", async (req, res) => { try { res.json(await auto.numberGaps(tenantOf(req), fyOf(req), req.query.voucherType)); } catch (e) { fail(res, e); } });

// ── M8: automation + ops ─────────────────────────────────────────────────────
router.post("/approval-rules", canPost, async (req, res) => { try { res.status(201).json(await auto.createRule(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/approvals", async (req, res) => { try { res.json(await auto.listApprovals(tenantOf(req), req.query.status)); } catch (e) { fail(res, e); } });
router.post("/approvals", canPost, async (req, res) => { try { res.status(201).json(await auto.requestApproval(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/approvals/:id/decide", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await auto.decideApproval(tenantOf(req), req.user.id, req.params.id, !!b.approve, b.note)); } catch (e) { fail(res, e); } });
router.post("/number-formats", canPost, async (req, res) => { try { res.status(201).json(await auto.setNumberFormat(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/overdue", async (req, res) => { try { res.json(await auto.overdue(tenantOf(req), req.query.asOf, Number(req.query.ratePerAnnum) || 0)); } catch (e) { fail(res, e); } });
router.post("/late-fee", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await auto.postLateFee(tenantOf(req), req.user.id, b)); } catch (e) { fail(res, e); } });
router.get("/dunning/due", async (req, res) => { try { res.json(await auto.dunningDue(tenantOf(req), req.query.asOf)); } catch (e) { fail(res, e); } });
// Reversing journal + voucher templates + post-dated cheques + delivery/GRN stock.
router.post("/journals/reversing", canPost, async (req, res) => { try { res.status(201).json(await vt.reversingJournal(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/voucher-templates", canPost, async (req, res) => { try { res.status(201).json(await vt.saveTemplate(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/voucher-templates", async (req, res) => { try { res.json(await vt.listTemplates(tenantOf(req))); } catch (e) { fail(res, e); } });
router.delete("/voucher-templates/:id", canPost, async (req, res) => { try { res.json(await vt.deleteTemplate(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/pdc", canPost, async (req, res) => { try { res.status(201).json(await vt.createPdc(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/pdc", async (req, res) => { try { res.json(await vt.listPdc(tenantOf(req), req.query.status)); } catch (e) { fail(res, e); } });
router.post("/pdc/:id/clear", canPost, async (req, res) => { try { res.json(await vt.clearPdc(tenantOf(req), req.user.id, req.params.id)); } catch (e) { fail(res, e); } });
router.post("/pdc/:id/bounce", canPost, async (req, res) => { try { res.json(await vt.bouncePdc(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/documents/:id/post-stock", canPost, async (req, res) => { try { res.status(201).json(await docs.postDocumentStock(tenantOf(req), req.user.id, req.params.id)); } catch (e) { fail(res, e); } });

// ── Pricing rules + promo schemes + coupons + shipping rules ─────────────────
router.post("/pricing-rules", canPost, async (req, res) => { try { res.status(201).json(await pricing.createPricingRule(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/pricing-rules", async (req, res) => { try { res.json(await pricing.listPricingRules(tenantOf(req))); } catch (e) { fail(res, e); } });
router.delete("/pricing-rules/:id", canPost, async (req, res) => { try { res.json(await pricing.deletePricingRule(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/pricing/apply", async (req, res) => { try { res.json(await pricing.applyPricing(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/coupons", canPost, async (req, res) => { try { res.status(201).json(await pricing.createCoupon(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/coupons/redeem", canPost, async (req, res) => { try { res.json(await pricing.redeemCoupon(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/shipping-rules", canPost, async (req, res) => { try { res.status(201).json(await pricing.createShippingRule(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/shipping/charge", async (req, res) => { try { res.json(await pricing.shippingCharge(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });

// ── Payment terms / installment schedule + bulk payment reconciliation ───────
router.post("/payment-terms", canPost, async (req, res) => { try { res.status(201).json(await payterms.savePaymentTerms(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/payment-terms", async (req, res) => { try { res.json(await payterms.listPaymentTerms(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/documents/:id/schedule", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await payterms.buildSchedule(tenantOf(req), { voucherId: req.params.id, total: b.total, invoiceDate: b.invoiceDate, templateName: b.templateName, installments: b.installments })); } catch (e) { fail(res, e); } });
router.get("/documents/:id/schedule", async (req, res) => { try { res.json(await payterms.scheduleStatus(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.get("/parties/:id/unapplied", async (req, res) => { try { res.json(await payterms.unappliedForParty(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/parties/:id/auto-apply", canPost, async (req, res) => { try { res.status(201).json(await payterms.autoApply(tenantOf(req), req.user.id, { partyLedgerId: req.params.id })); } catch (e) { fail(res, e); } });
router.post("/expenses", canPost, async (req, res) => { try { res.status(201).json(await ops.createExpense(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/advances", async (req, res) => { try { res.json(await ops.listAdvances(tenantOf(req), req.query.status)); } catch (e) { fail(res, e); } });
// Voice / natural-language expense parse → a structured draft (rule parser + optional LLM refine).
router.post("/expenses/parse", canPost, async (req, res) => { try { res.json(await require("./voiceExpense").parseExpenseText(tenantOf(req), (req.body || {}).text)); } catch (e) { fail(res, e); } });
// Agreement obligation extraction → lock-ins/renewals/escalations/notice/payments (rule + LLM).
router.post("/agreements/extract", canPost, async (req, res) => { try { res.json(await require("./agreements").extractObligations(tenantOf(req), (req.body || {}).text)); } catch (e) { fail(res, e); } });
router.post("/advances", canPost, async (req, res) => { try { res.status(201).json(await ops.grantAdvance(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/advances/:id/settle", canPost, async (req, res) => { try { res.json(await ops.settleAdvance(tenantOf(req), req.user.id, { advanceId: req.params.id, ...(req.body || {}) })); } catch (e) { fail(res, e); } });
router.post("/projects", canPost, async (req, res) => { try { res.status(201).json(await ops.createProject(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/projects", async (req, res) => { try { const { rows } = await pool.query("SELECT * FROM book_projects WHERE tenant_id=$1 ORDER BY name", [tenantOf(req)]); res.json(rows); } catch (e) { fail(res, e); } });
router.post("/timesheets", canPost, async (req, res) => { try { res.status(201).json(await ops.logTime(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/projects/:id/billable", async (req, res) => { try { res.json(await ops.billableSummary(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/attachments", canPost, async (req, res) => { try { res.status(201).json(await ops.addAttachment(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/attachments", async (req, res) => { try { res.json(await ops.listAttachments(tenantOf(req), req.query.entityType, req.query.entityId)); } catch (e) { fail(res, e); } });

// ── M10: e-invoice, OCR, portal-link minting ─────────────────────────────────
router.post("/einvoice/:voucherId", canPost, async (req, res) => { try { res.status(202).json(await einvoice.enqueue(tenantOf(req), req.params.voucherId)); } catch (e) { fail(res, e); } });
router.get("/einvoice/:voucherId", async (req, res) => { try { res.json(await einvoice.status(tenantOf(req), req.params.voucherId)); } catch (e) { fail(res, e); } });
router.post("/einvoice/:voucherId/cancel", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await einvoice.cancelIrn(tenantOf(req), req.user.id, { voucherId: req.params.voucherId, reason: b.reason, remarks: b.remarks })); } catch (e) { fail(res, e); } });
router.post("/expenses/ocr", canPost, async (req, res) => { try { res.json(await ocr.parseReceipt({ imageUrl: (req.body || {}).imageUrl })); } catch (e) { fail(res, e); } });
// Mint a public portal link (the owner shares the returned URL with a customer/vendor).
router.post("/portal/invoice-link", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.voucherId) return res.status(400).json({ error: "voucherId required" }); const token = portal.signToken({ kind: "invoice", tenant: tenantOf(req), voucherId: b.voucherId }); res.status(201).json({ token, path: `/api/portal/invoice/${token}` }); } catch (e) { fail(res, e); } });
router.post("/portal/vendor-link", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.vendorLedgerId) return res.status(400).json({ error: "vendorLedgerId required" }); const token = portal.signToken({ kind: "vendor", tenant: tenantOf(req), vendorLedgerId: b.vendorLedgerId }); res.status(201).json({ token, path: `/api/portal/vendor-bill/${token}` }); } catch (e) { fail(res, e); } });

module.exports = router;
