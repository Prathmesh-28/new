// §14 — API surface for the books module. Mounted at /api/books. Tenant- and
// auth-scoped; money crosses as strings; Idempotency-Key honoured on posts.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const { pool } = require("../../db");
const { postVoucher, reverseVoucher, PostError } = require("./posting-engine");
const reports = require("./reports");
const { seedBooks, ledgerIdByName } = require("./seed");
const { buildSalesVoucher, buildReceiptVoucher, buildPurchaseVoucher, buildCreditNote, buildPaymentVoucher } = require("./mappers");
const { financialYearFor } = require("./fy");
const docs = require("./documents");
const inv = require("./inventory");
const gst = require("./gst");
const recon = require("./recon");
const payments = require("./payments");
const fx = require("./fx");
const assets = require("./assets");
const auto = require("./automation");
const ops = require("./ops");

router.use(authenticate);

// §12.2 RBAC — who may post to the books.
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
    const allowed = ["name", "group_id", "gstin", "pan", "state_code", "billing_address", "credit_period_days", "account_number", "ifsc", "is_active"];
    const sets = [], vals = [];
    for (const k of allowed) if (k in (req.body || {})) { sets.push(`${k}=$${sets.length + 1}`); vals.push(req.body[k]); }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    vals.push(tenantOf(req), req.params.id);
    const { rows } = await pool.query(`UPDATE book_ledgers SET ${sets.join(",")} WHERE tenant_id=$${vals.length - 1} AND id=$${vals.length} RETURNING *`, vals);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) { fail(res, e); }
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
      return res.status(422).json({ error: "Sales/tax ledgers missing — POST /api/books/seed first", code: "NOT_SEEDED" });
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
router.get("/reports/day-book", async (req, res) => { try { res.json(await reports.dayBook(tenantOf(req), req.query.from || "1900-01-01", req.query.to || "2999-12-31")); } catch (e) { fail(res, e); } });
router.get("/ledgers/:id/statement", async (req, res) => {
  try { const r = await reports.ledgerStatement(tenantOf(req), req.params.id, fyOf(req)); if (!r) return res.status(404).json({ error: "Ledger not found" }); res.json(r); } catch (e) { fail(res, e); }
});

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
    if (!ctx.salesReturnsLedgerId) return res.status(422).json({ error: "Sales Returns ledger missing — seed first", code: "NOT_SEEDED" });
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

// ── M2: allocations, deposits, recurring ─────────────────────────────────────
router.post("/allocations", canPost, async (req, res) => {
  try { const b = req.body || {}; res.status(201).json(await docs.allocate(tenantOf(req), req.user.id, b.sourceVoucherId, b.targetVoucherId, b.amount)); } catch (e) { fail(res, e); }
});
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
router.post("/inventory/receive", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.itemId || b.qty == null || b.rate == null) return res.status(400).json({ error: "itemId, qty, rate required" }); res.json(await inv.receive(tenantOf(req), b.itemId, b.qty, b.rate, { warehouseId: b.warehouseId, voucherId: b.voucherId, date: b.date })); } catch (e) { fail(res, e); } });
router.post("/inventory/issue", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.itemId || b.qty == null) return res.status(400).json({ error: "itemId, qty required" }); res.json(await inv.issue(tenantOf(req), b.itemId, b.qty, { warehouseId: b.warehouseId, voucherId: b.voucherId })); } catch (e) { fail(res, e); } });
router.post("/inventory/transfer", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await inv.transfer(tenantOf(req), b.itemId, b.fromWh, b.toWh, b.qty)); } catch (e) { fail(res, e); } });
router.post("/inventory/stock-journal", canPost, async (req, res) => { try { res.json(await inv.postStockValueJournal(tenantOf(req), req.user.id, (req.body || {}).date || new Date().toISOString().slice(0, 10))); } catch (e) { fail(res, e); } });

// ── M4: GST returns ──────────────────────────────────────────────────────────
const reqPeriod = (req, res) => { const p = req.query.period; if (!p || !/^\d{4}-\d{2}$/.test(p)) { res.status(400).json({ error: "period=YYYY-MM required" }); return null; } return p; };
router.get("/gst/gstr1", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.gstr1(tenantOf(req), p)); } catch (e) { fail(res, e); } });
router.get("/gst/gstr3b", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.gstr3b(tenantOf(req), p)); } catch (e) { fail(res, e); } });
router.post("/gst/gstr2b/reconcile", canPost, async (req, res) => { try { const b = req.body || {}; if (!b.period) return res.status(400).json({ error: "period required" }); res.json(await gst.gstr2bReconcile(tenantOf(req), b.period, b.rows || [])); } catch (e) { fail(res, e); } });
router.get("/gst/gstr9", async (req, res) => { try { res.json(await gst.gstr9(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); } });
router.get("/gst/tds", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.deductionReport(tenantOf(req), p, "TDS")); } catch (e) { fail(res, e); } });
router.get("/gst/tcs", async (req, res) => { try { const p = reqPeriod(req, res); if (p) res.json(await gst.deductionReport(tenantOf(req), p, "TCS")); } catch (e) { fail(res, e); } });

// ── M5: reconciliation bridge ────────────────────────────────────────────────
router.post("/recon/import", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await recon.importLines(tenantOf(req), b.bankLedgerId, b.lines)); } catch (e) { fail(res, e); } });
router.post("/recon/auto-match", canPost, async (req, res) => { try { res.json(await recon.autoMatch(tenantOf(req), (req.body || {}).toleranceDays || 3)); } catch (e) { fail(res, e); } });
router.get("/recon/inbox", async (req, res) => { try { res.json(await recon.inbox(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/recon/confirm", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await recon.confirmLine(tenantOf(req), req.user.id, b.lineId, b.counterLedgerId)); } catch (e) { fail(res, e); } });
router.post("/recon/ignore", canPost, async (req, res) => { try { res.json(await recon.ignoreLine(tenantOf(req), (req.body || {}).lineId)); } catch (e) { fail(res, e); } });
router.get("/recon/statement", async (req, res) => { try { if (!req.query.bankLedgerId) return res.status(400).json({ error: "bankLedgerId required" }); res.json(await recon.bankRecStatement(tenantOf(req), req.query.bankLedgerId)); } catch (e) { fail(res, e); } });

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
router.post("/assets", canPost, async (req, res) => { try { res.status(201).json(await assets.createAsset(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/assets", async (req, res) => { try { const { rows } = await pool.query("SELECT * FROM book_fixed_assets WHERE tenant_id=$1 ORDER BY acquired_on DESC", [tenantOf(req)]); res.json(rows); } catch (e) { fail(res, e); } });
router.post("/assets/depreciation/run", canPost, async (req, res) => { try { res.json(await assets.runDepreciation(tenantOf(req), req.user.id, (req.body || {}).asOf || new Date().toISOString().slice(0, 10))); } catch (e) { fail(res, e); } });

// ── M8: automation + ops ─────────────────────────────────────────────────────
router.post("/approval-rules", canPost, async (req, res) => { try { res.status(201).json(await auto.createRule(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/approvals", async (req, res) => { try { res.json(await auto.listApprovals(tenantOf(req), req.query.status)); } catch (e) { fail(res, e); } });
router.post("/approvals", canPost, async (req, res) => { try { res.status(201).json(await auto.requestApproval(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/approvals/:id/decide", canPost, async (req, res) => { try { const b = req.body || {}; res.json(await auto.decideApproval(tenantOf(req), req.user.id, req.params.id, !!b.approve, b.note)); } catch (e) { fail(res, e); } });
router.post("/number-formats", canPost, async (req, res) => { try { res.status(201).json(await auto.setNumberFormat(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/overdue", async (req, res) => { try { res.json(await auto.overdue(tenantOf(req), req.query.asOf, Number(req.query.ratePerAnnum) || 0)); } catch (e) { fail(res, e); } });
router.post("/late-fee", canPost, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await auto.postLateFee(tenantOf(req), req.user.id, b)); } catch (e) { fail(res, e); } });
router.post("/expenses", canPost, async (req, res) => { try { res.status(201).json(await ops.createExpense(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/projects", canPost, async (req, res) => { try { res.status(201).json(await ops.createProject(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/projects", async (req, res) => { try { const { rows } = await pool.query("SELECT * FROM book_projects WHERE tenant_id=$1 ORDER BY name", [tenantOf(req)]); res.json(rows); } catch (e) { fail(res, e); } });
router.post("/timesheets", canPost, async (req, res) => { try { res.status(201).json(await ops.logTime(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/projects/:id/billable", async (req, res) => { try { res.json(await ops.billableSummary(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/attachments", canPost, async (req, res) => { try { res.status(201).json(await ops.addAttachment(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/attachments", async (req, res) => { try { res.json(await ops.listAttachments(tenantOf(req), req.query.entityType, req.query.entityId)); } catch (e) { fail(res, e); } });

module.exports = router;
