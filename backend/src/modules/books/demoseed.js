// §DEMO - investor-demo data seeder. Populates the books module for a tenant with
// a realistic FY2025-26 dataset: a few customers/vendors, ~6 sales invoices, ~4
// purchase bills, receipt/payment vouchers, manual journals, inventory items with
// opening stock, a subscription plan + active subscription + usage events, and a
// GST output rate.
//
// EVERYTHING routes through the REAL module functions (the same posting engine,
// mappers and masters the HTTP API uses) - nothing writes the ledger tables
// directly except party/bank ledger masters, which are created with an idempotent
// ON CONFLICT INSERT exactly the way http.js POST /ledgers does.
//
// SAFE TO RE-RUN: party/bank ledgers and the GST rate upsert/ignore on conflict;
// every posted voucher carries a deterministic idempotencyKey so a second run
// REPLAYS (returns the existing voucher) instead of double-posting; createItem is
// guarded so a duplicate item name (unique violation) is tolerated; the plan +
// subscription + usage steps tolerate duplicates. Each sub-step is wrapped in its
// own try/catch and pushes to `errors` so one failure never aborts the rest.
//
// CommonJS. Exports exactly: async function seedDemo(tenantId, actorId).
const { pool } = require("../../db");
const { seedBooks, ledgerIdByName } = require("./seed");
const { salesCtx, purchaseCtx } = require("./documents");
const {
  buildSalesVoucher,
  buildPurchaseVoucher,
  buildReceiptVoucher,
  buildPaymentVoucher,
} = require("./mappers");
const { postVoucher } = require("./posting-engine");
const inventory = require("./inventory");
const subscriptions = require("./subscriptions");
const usage = require("./usage");
const gst = require("./gst");

// Seller is in Maharashtra (state code 27); a buyer in another state makes the
// supply inter-state (IGST), same state makes it intra-state (CGST+SGST). The
// `interState` flag below is what actually drives the GST split in the mappers.
const SELLER_STATE = "27";

// Deterministic idempotency key so re-running seedDemo replays vouchers rather
// than posting duplicates (postVoucher returns the existing row on a key hit).
function ik(tenantId, tag) {
  return `demoseed:${tenantId}:${tag}`;
}

// Create (or fetch) a ledger master by name under a named group. Idempotent via
// ON CONFLICT(tenant_id,name) DO NOTHING - mirrors http.js POST /ledgers. Returns
// the ledger id (existing or newly inserted).
async function ensureLedger(tenantId, name, groupName, extra = {}) {
  const { rows: g } = await pool.query(
    "SELECT id FROM book_account_groups WHERE tenant_id=$1 AND name=$2",
    [tenantId, groupName]
  );
  if (!g[0]) throw new Error(`group "${groupName}" not found - seedBooks must run first`);
  await pool.query(
    `INSERT INTO book_ledgers
       (tenant_id,name,group_id,is_party,is_bank,gstin,state_code,opening_balance,opening_is_debit)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(tenant_id,name) DO NOTHING`,
    [
      tenantId, name, g[0].id,
      !!extra.isParty, !!extra.isBank,
      extra.gstin || null, extra.stateCode || null,
      extra.openingBalance || 0, extra.openingIsDebit !== false,
    ]
  );
  const id = await ledgerIdByName(tenantId, name);
  if (!id) throw new Error(`failed to create/find ledger "${name}"`);
  return id;
}

async function seedDemo(tenantId, actorId) {
  if (!tenantId) throw new Error("tenantId required");
  const created = {
    groups: 0, ledgers: 0,
    customers: 0, vendors: 0,
    salesInvoices: 0, purchaseBills: 0,
    receipts: 0, payments: 0,
    journals: 0, items: 0,
    plans: 0, subscriptions: 0, usageEvents: 0,
    gstRates: 0,
  };
  const errors = [];
  const note = (step, e) => errors.push({ step, error: e && e.code ? `${e.code}: ${e.message}` : String(e && e.message ? e.message : e) });

  // ── 0. Chart of accounts (idempotent) ──────────────────────────────────────
  try {
    const r = await seedBooks(tenantId);
    created.groups = r.groups || 0;
    created.ledgers = r.ledgers || 0;
  } catch (e) {
    note("seedBooks", e);
    // If the COA can't be seeded, almost everything downstream will fail; but we
    // still proceed so any pre-existing COA can be used.
  }

  // ── 1. Party + bank ledgers ─────────────────────────────────────────────────
  // Customers (Sundry Debtors) - a mix of in-state (27) and out-of-state buyers.
  const CUSTOMERS = [
    { name: "Demo Customer - Acme Retail Pvt Ltd", stateCode: "27", gstin: "27AAAAA0000A1Z5", interState: false },
    { name: "Demo Customer - Blue Ocean Traders",  stateCode: "29", gstin: "29BBBBB0000B1Z4", interState: true },
    { name: "Demo Customer - Crest Solutions LLP",  stateCode: "27", gstin: "27CCCCC0000C1Z3", interState: false },
    { name: "Demo Customer - Delta Enterprises",    stateCode: "07", gstin: "07DDDDD0000D1Z2", interState: true },
  ];
  const VENDORS = [
    { name: "Demo Vendor - Pioneer Supplies Co",    stateCode: "27", gstin: "27EEEEE0000E1Z1", interState: false },
    { name: "Demo Vendor - Summit Components Pvt",   stateCode: "24", gstin: "24FFFFF0000F1Z9", interState: true },
    { name: "Demo Vendor - Harbor Logistics",        stateCode: "27", gstin: "27GGGGG0000G1Z8", interState: false },
  ];

  const customers = [];
  for (const c of CUSTOMERS) {
    try {
      const id = await ensureLedger(tenantId, c.name, "Sundry Debtors", { isParty: true, gstin: c.gstin, stateCode: c.stateCode });
      customers.push({ ...c, id });
      created.customers++;
    } catch (e) { note(`customer:${c.name}`, e); }
  }
  const vendors = [];
  for (const v of VENDORS) {
    try {
      const id = await ensureLedger(tenantId, v.name, "Sundry Creditors", { isParty: true, gstin: v.gstin, stateCode: v.stateCode });
      vendors.push({ ...v, id });
      created.vendors++;
    } catch (e) { note(`vendor:${v.name}`, e); }
  }

  // Bank ledger for receipts/payments (idempotent).
  let bankLedgerId = null;
  try {
    bankLedgerId = await ensureLedger(tenantId, "Demo Bank - HDFC Current A/c", "Bank Accounts", { isBank: true });
  } catch (e) {
    note("bankLedger", e);
    // Fall back to seeded Cash ledger so downstream receipt/payment steps still run.
    try { bankLedgerId = await ledgerIdByName(tenantId, "Cash"); } catch (e2) { note("bankLedger:fallbackCash", e2); }
  }

  // Sales/purchase posting contexts (resolve the Sales/Purchase + GST ledgers).
  let sCtxBase = null, pCtxBase = null;
  try { sCtxBase = await salesCtx(tenantId, null); } catch (e) { note("salesCtx", e); }
  try { pCtxBase = await purchaseCtx(tenantId, null); } catch (e) { note("purchaseCtx", e); }

  // ── 2. ~6 SALES INVOICES (varied parties/dates in FY2025-26, GST 18%) ────────
  // Posted directly through buildSalesVoucher + postVoucher (the same path the
  // document→invoice conversion uses), with a deterministic idempotency key.
  const SALES = [
    { cust: 0, date: "2025-04-12", lineTotal: 45000, ref: "DEMO-INV-001", hsn: "8471" },
    { cust: 1, date: "2025-05-20", lineTotal: 128000, ref: "DEMO-INV-002", hsn: "8471" },
    { cust: 2, date: "2025-07-03", lineTotal: 32500,  ref: "DEMO-INV-003", hsn: "9983" },
    { cust: 3, date: "2025-08-18", lineTotal: 76000,  ref: "DEMO-INV-004", hsn: "8528" },
    { cust: 0, date: "2025-10-09", lineTotal: 59500,  ref: "DEMO-INV-005", hsn: "8471" },
    { cust: 2, date: "2026-01-15", lineTotal: 91200,  ref: "DEMO-INV-006", hsn: "9983" },
  ];
  const salesVouchers = []; // { voucherId, custId } - used to back the receipts.
  if (sCtxBase && customers.length) {
    for (const s of SALES) {
      const cust = customers[s.cust % customers.length];
      if (!cust) continue;
      try {
        const ctx = { ...sCtxBase, customerLedgerId: cust.id };
        const m = buildSalesVoucher(
          {
            lineTotal: s.lineTotal, gstRate: 18, interState: cust.interState,
            date: s.date, reference: s.ref, hsn: s.hsn,
            placeOfSupply: cust.stateCode, counterpartyGstin: cust.gstin,
            narration: `Demo sales invoice ${s.ref}`,
          },
          ctx
        );
        const r = await postVoucher(tenantId, actorId, m.voucher, m.entries, { taxes: m.taxes, idempotencyKey: ik(tenantId, `sales:${s.ref}`) });
        salesVouchers.push({ voucherId: r.voucherId, custId: cust.id, amount: s.lineTotal });
        created.salesInvoices++;
      } catch (e) { note(`salesInvoice:${s.ref}`, e); }
    }
  }

  // ── 3. ~4 PURCHASE BILLS (varied vendors/dates, GST 18%) ────────────────────
  const PURCHASES = [
    { vend: 0, date: "2025-04-05", lineTotal: 28000, ref: "DEMO-BILL-001", hsn: "8471" },
    { vend: 1, date: "2025-06-22", lineTotal: 64000, ref: "DEMO-BILL-002", hsn: "8473" },
    { vend: 2, date: "2025-09-11", lineTotal: 15500, ref: "DEMO-BILL-003", hsn: "9965" },
    { vend: 0, date: "2025-12-01", lineTotal: 41000, ref: "DEMO-BILL-004", hsn: "8471" },
  ];
  const purchaseVouchers = []; // { voucherId, vendId } - used to back the payments.
  if (pCtxBase && vendors.length) {
    for (const p of PURCHASES) {
      const vend = vendors[p.vend % vendors.length];
      if (!vend) continue;
      try {
        const ctx = { ...pCtxBase, vendorLedgerId: vend.id };
        const m = buildPurchaseVoucher(
          {
            lineTotal: p.lineTotal, gstRate: 18, interState: vend.interState,
            date: p.date, reference: p.ref, hsn: p.hsn,
            placeOfSupply: vend.stateCode,
            narration: `Demo purchase bill ${p.ref}`,
          },
          ctx
        );
        const r = await postVoucher(tenantId, actorId, m.voucher, m.entries, { taxes: m.taxes, idempotencyKey: ik(tenantId, `purchase:${p.ref}`) });
        purchaseVouchers.push({ voucherId: r.voucherId, vendId: vend.id, amount: p.lineTotal });
        created.purchaseBills++;
      } catch (e) { note(`purchaseBill:${p.ref}`, e); }
    }
  }

  // ── 4. RECEIPT vouchers (money in from customers) ───────────────────────────
  if (bankLedgerId && salesVouchers.length) {
    const RECEIPTS = [
      { from: 0, date: "2025-04-30", amount: 53100, ref: "DEMO-RCT-001" }, // ~ INV-001 incl GST
      { from: 1, date: "2025-06-05", amount: 100000, ref: "DEMO-RCT-002" }, // part-payment of INV-002
      { from: 2, date: "2025-07-20", amount: 38350,  ref: "DEMO-RCT-003" }, // ~ INV-003 incl GST
    ];
    for (const rc of RECEIPTS) {
      const sv = salesVouchers[rc.from % salesVouchers.length];
      if (!sv) continue;
      try {
        const m = buildReceiptVoucher(
          { amount: rc.amount, date: rc.date, reference: rc.ref, narration: `Demo receipt ${rc.ref}` },
          { bankLedgerId, partyLedgerId: sv.custId }
        );
        await postVoucher(tenantId, actorId, m.voucher, m.entries, { taxes: m.taxes, idempotencyKey: ik(tenantId, `receipt:${rc.ref}`) });
        created.receipts++;
      } catch (e) { note(`receipt:${rc.ref}`, e); }
    }
  }

  // ── 5. PAYMENT vouchers (money out to vendors) ──────────────────────────────
  if (bankLedgerId && purchaseVouchers.length) {
    const PAYMENTS = [
      { to: 0, date: "2025-05-10", amount: 33040, ref: "DEMO-PAY-001" }, // ~ BILL-001 incl GST
      { to: 1, date: "2025-07-15", amount: 50000, ref: "DEMO-PAY-002" }, // part-payment of BILL-002
    ];
    for (const pmt of PAYMENTS) {
      const pv = purchaseVouchers[pmt.to % purchaseVouchers.length];
      if (!pv) continue;
      try {
        const m = buildPaymentVoucher(
          { amount: pmt.amount, date: pmt.date, reference: pmt.ref, narration: `Demo payment ${pmt.ref}` },
          { bankLedgerId, partyLedgerId: pv.vendId }
        );
        await postVoucher(tenantId, actorId, m.voucher, m.entries, { taxes: m.taxes, idempotencyKey: ik(tenantId, `payment:${pmt.ref}`) });
        created.payments++;
      } catch (e) { note(`payment:${pmt.ref}`, e); }
    }
  }

  // ── 6. MANUAL JOURNAL vouchers (via the posting engine) ─────────────────────
  // 6a. Bank charges: Dr Indirect Expenses (Round Off as a present P&L ledger) / Cr Bank.
  if (bankLedgerId) {
    try {
      const roundOff = await ledgerIdByName(tenantId, "Round Off");
      if (roundOff) {
        await postVoucher(
          tenantId, actorId,
          { voucherType: "JOURNAL", voucherDate: "2025-06-30", narration: "Demo: bank charges for the quarter", source: "manual" },
          [
            { ledgerId: roundOff, debit: "1200", credit: "0" },
            { ledgerId: bankLedgerId, debit: "0", credit: "1200" },
          ],
          { idempotencyKey: ik(tenantId, "journal:bank-charges") }
        );
        created.journals++;
      }
    } catch (e) { note("journal:bank-charges", e); }
  }
  // 6b. Reclass: move a balance between two indirect-expense ledgers.
  try {
    const badDebts = await ledgerIdByName(tenantId, "Bad Debts");
    const roundOff = await ledgerIdByName(tenantId, "Round Off");
    if (badDebts && roundOff) {
      await postVoucher(
        tenantId, actorId,
        { voucherType: "JOURNAL", voucherDate: "2025-11-30", narration: "Demo: provision reclassification", source: "manual" },
        [
          { ledgerId: badDebts, debit: "2500", credit: "0" },
          { ledgerId: roundOff, debit: "0", credit: "2500" },
        ],
        { idempotencyKey: ik(tenantId, "journal:reclass") }
      );
      created.journals++;
    }
  } catch (e) { note("journal:reclass", e); }

  // ── 7. INVENTORY: 4 items with opening stock ─────────────────────────────────
  // createItem seeds opening_qty/opening_value directly onto the master (no
  // movement needed). A duplicate name raises a unique violation (23505) which we
  // swallow so re-running is safe.
  const ITEMS = [
    { name: "Demo Item - Wireless Mouse",   unit: "Nos", hsn: "8471", gstRate: 18, openingQty: 120, openingValue: 36000 },
    { name: "Demo Item - Mechanical Keyboard", unit: "Nos", hsn: "8471", gstRate: 18, openingQty: 60,  openingValue: 48000 },
    { name: "Demo Item - USB-C Cable",       unit: "Nos", hsn: "8544", gstRate: 18, openingQty: 500, openingValue: 25000 },
    { name: "Demo Item - 27in Monitor",      unit: "Nos", hsn: "8528", gstRate: 18, openingQty: 25,  openingValue: 187500 },
  ];
  for (const it of ITEMS) {
    try {
      await inventory.createItem(tenantId, it);
      created.items++;
    } catch (e) {
      if (e && e.code === "23505") { /* already seeded - tolerate */ }
      else note(`item:${it.name}`, e);
    }
  }

  // ── 8. SUBSCRIPTION: 1 plan + 1 active subscription + usage events ───────────
  let planId = null;
  try {
    // Reuse a previously-seeded demo plan if present (createPlan is not idempotent).
    const { rows: ep } = await pool.query(
      "SELECT id FROM book_subscription_plans WHERE tenant_id=$1 AND name=$2 LIMIT 1",
      [tenantId, "Demo Plan - Pro (Monthly)"]
    );
    if (ep[0]) {
      planId = ep[0].id;
    } else {
      const plan = await subscriptions.createPlan(tenantId, {
        name: "Demo Plan - Pro (Monthly)",
        price: 2999, interval: "monthly", intervalCount: 1,
        gstRate: 18, hsnSac: "9983",
      });
      planId = plan.id;
      created.plans++;
    }
  } catch (e) { note("plan", e); }

  let subscriptionId = null;
  if (planId && customers.length) {
    try {
      const party = customers[0];
      // Reuse an existing active demo subscription for this party+plan if present.
      const { rows: es } = await pool.query(
        "SELECT id FROM book_subscriptions WHERE tenant_id=$1 AND plan_id=$2 AND party_ledger_id=$3 LIMIT 1",
        [tenantId, planId, party.id]
      );
      if (es[0]) {
        subscriptionId = es[0].id;
      } else {
        const sub = await subscriptions.createSubscription(tenantId, {
          partyLedgerId: party.id, planId, qty: 1, startDate: "2025-04-01",
        });
        subscriptionId = sub.id;
        created.subscriptions++;
      }
    } catch (e) { note("subscription", e); }
  }

  if (subscriptionId) {
    // Usage events with deterministic dedup keys → re-running de-duplicates them.
    const EVENTS = [
      { metric: "api_calls", value: 1200, eventTime: "2025-04-08T10:00:00Z", dedupKey: ik(tenantId, "usage:1") },
      { metric: "api_calls", value: 1850, eventTime: "2025-04-19T14:30:00Z", dedupKey: ik(tenantId, "usage:2") },
      { metric: "api_calls", value: 940,  eventTime: "2025-05-02T09:15:00Z", dedupKey: ik(tenantId, "usage:3") },
      { metric: "seats",     value: 12,   eventTime: "2025-05-10T08:00:00Z", dedupKey: ik(tenantId, "usage:4") },
      { metric: "api_calls", value: 2100, eventTime: "2025-05-21T16:45:00Z", dedupKey: ik(tenantId, "usage:5") },
    ];
    for (const ev of EVENTS) {
      try {
        const r = await usage.ingestUsage(tenantId, { subscriptionId, ...ev });
        if (r && !r.deduplicated) created.usageEvents++;
      } catch (e) { note(`usage:${ev.dedupKey}`, e); }
    }
  }

  // ── 9. GST OUTPUT RATE (HSN → 18%) - upsert, idempotent ──────────────────────
  try {
    await gst.setGstRate(tenantId, { hsn: "8471", rate: 18, description: "Demo: Automatic data processing machines (18%)" });
    created.gstRates++;
  } catch (e) { note("gstRate", e); }

  return { created, errors };
}

module.exports = { seedDemo };
