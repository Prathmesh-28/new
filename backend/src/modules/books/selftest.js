// Pure-logic correctness checks for the books engine — no DB needed.
// Run: `node src/modules/books/selftest.js` from backend/. Exits non-zero on failure.
const assert = require("assert");
const { money, sum, eq, toDb, toRupees } = require("./money");
const { financialYearFor, periodMonthFor } = require("./fy");
const { validateEntries, PostError } = require("./posting-engine");
const { splitGst, buildSalesVoucher, buildPurchaseVoucher, buildCreditNote } = require("./mappers");
const { NEXT } = require("./documents");
const { applyInwardWAvg, applyOutwardWAvg, consumeFifo } = require("./inventory");
const { monthRange } = require("./gst");
const { classifyLine, daysBetween, lineMatches } = require("./recon");
const { cashFlowActivity } = require("./reports");
const { fxConvert, realizedFx } = require("./fx");
const { depreciationMonthly } = require("./assets");
const { formatDocNumber, computeLateFee, ruleRequiresApproval } = require("./automation");
const { signToken, verifyToken } = require("./portal");
const { buildIrpPayload } = require("./einvoice");
const ocrMod = require("./ocr");

let n = 0;
const ok = (name) => { n++; console.log(`  ✓ ${name}`); };
const throws = (fn, code) => { try { fn(); } catch (e) { assert.strictEqual(e instanceof PostError && e.code, code, `expected ${code}, got ${e.code || e.message}`); return; } assert.fail(`expected throw ${code}`); };

// 1. Money is exact (the float trap).
assert.ok(eq(money("0.1").plus(money("0.2")), money("0.3"))); ok("0.1 + 0.2 === 0.3 (decimal, not float)");
assert.strictEqual(toDb(money("11800")), "11800.0000"); ok("toDb → NUMERIC(19,4) string");

// 2. Indian FY / period.
assert.strictEqual(financialYearFor("2026-06-15"), "2026-27"); ok("June 2026 → FY 2026-27");
assert.strictEqual(financialYearFor("2026-02-15"), "2025-26"); ok("Feb 2026 → FY 2025-26 (Jan–Mar = prev FY)");
assert.strictEqual(periodMonthFor("2026-04-01"), 1); ok("April → period 1");
assert.strictEqual(periodMonthFor("2026-03-31"), 12); ok("March → period 12");

// 3. Balance invariant.
validateEntries([{ debit: "100", credit: "0" }, { debit: "0", credit: "100" }]); ok("balanced voucher passes");
throws(() => validateEntries([{ debit: "100", credit: "0" }, { debit: "0", credit: "90" }]), "UNBALANCED"); ok("Σdr≠Σcr → UNBALANCED");
throws(() => validateEntries([{ debit: "100", credit: "5" }, { debit: "0", credit: "95" }]), "BAD_LINE"); ok("line with both sides → BAD_LINE");
throws(() => validateEntries([]), "EMPTY_VOUCHER"); ok("no lines → EMPTY_VOUCHER");
throws(() => validateEntries([{ debit: "0", credit: "0" }]), "BAD_LINE"); ok("zero line → BAD_LINE");

// 4. GST split — intra-state (CGST+SGST) and inter-state (IGST).
const intra = splitGst("10000", "18", false);
assert.ok(eq(intra.cgst, "900") && eq(intra.sgst, "900") && eq(intra.igst, "0") && eq(intra.gross, "11800")); ok("intra-state 18% → CGST 900 + SGST 900, gross 11800");
const inter = splitGst("10000", "18", true);
assert.ok(eq(inter.igst, "1800") && eq(inter.cgst, "0") && eq(inter.gross, "11800")); ok("inter-state 18% → IGST 1800, gross 11800");

// 5. Sales mapper produces a balanced voucher.
const ctx = { customerLedgerId: "c", salesLedgerId: "s", cgstLedgerId: "cg", sgstLedgerId: "sg", igstLedgerId: "ig" };
const sale = buildSalesVoucher({ lineTotal: "10000", gstRate: "18", interState: false, date: "2026-06-15" }, ctx);
const dr = sum(sale.entries.map((e) => e.debit)); const cr = sum(sale.entries.map((e) => e.credit));
assert.ok(eq(dr, cr) && eq(dr, "11800")); ok("sales mapper voucher balances (Σdr = Σcr = 11800)");
validateEntries(sale.entries); ok("sales mapper voucher passes engine validation");

// 6. Reversal mirror nets a voucher to zero.
const mirror = sale.entries.map((e) => ({ debit: e.credit, credit: e.debit }));
const combined = [...sale.entries, ...mirror];
assert.ok(eq(sum(combined.map((e) => e.debit)), sum(combined.map((e) => e.credit)))); ok("original + reversal nets to zero");

// 7. M2 — purchase (bill) mapper balances.
const pctx = { vendorLedgerId: "v", purchaseLedgerId: "p", cgstInputLedgerId: "ci", sgstInputLedgerId: "si", igstInputLedgerId: "ii" };
const bill = buildPurchaseVoucher({ lineTotal: "10000", gstRate: "18", interState: false, date: "2026-06-15" }, pctx);
assert.ok(eq(sum(bill.entries.map((e) => e.debit)), sum(bill.entries.map((e) => e.credit))) && eq(sum(bill.entries.map((e) => e.debit)), "11800")); ok("purchase/bill mapper balances (Σ = 11800)");
validateEntries(bill.entries); ok("purchase voucher passes engine validation");

// 8. M2 — credit note (sales return) mapper balances.
const cnctx = { customerLedgerId: "c", salesReturnsLedgerId: "sr", cgstLedgerId: "cg", sgstLedgerId: "sg", igstLedgerId: "ig" };
const cn = buildCreditNote({ lineTotal: "10000", gstRate: "18", interState: true, date: "2026-06-15" }, cnctx);
assert.ok(eq(sum(cn.entries.map((e) => e.debit)), sum(cn.entries.map((e) => e.credit)))); ok("credit-note mapper balances");

// 9. M2 — document transitions.
assert.ok(NEXT.ESTIMATE.includes("SALES_ORDER") && NEXT.ESTIMATE.includes("INVOICE")); ok("estimate → sales-order/invoice allowed");
assert.ok(!(NEXT.ESTIMATE || []).includes("GRN")); ok("estimate → GRN rejected (wrong pipeline)");
assert.ok(NEXT.PURCHASE_ORDER.includes("BILL") && NEXT.GRN.includes("BILL")); ok("PO/GRN → bill allowed");

// 10. M3 — weighted-average valuation.
let st = { qty: "0", value: "0" };
st = applyInwardWAvg(st, "10", "100"); assert.ok(eq(st.qty, "10") && eq(st.value, "1000") && eq(st.avg, "100")); ok("WAvg inward 10@100 → avg 100");
st = applyInwardWAvg(st, "10", "120"); assert.ok(eq(st.qty, "20") && eq(st.value, "2200") && eq(st.avg, "110")); ok("WAvg inward 10@120 → avg 110");
const outw = applyOutwardWAvg(st, "5"); assert.ok(eq(outw.cogs, "550") && eq(outw.qty, "15") && eq(outw.value, "1650")); ok("WAvg issue 5 → COGS 550 @ avg 110");

// 11. M3 — FIFO consumption oldest-first.
const fifo = consumeFifo([{ id: "a", qtyRemaining: "10", rate: "100" }, { id: "b", qtyRemaining: "10", rate: "120" }], "15");
assert.ok(eq(fifo.cogs, "1600") && eq(fifo.remaining, "0")); ok("FIFO issue 15 → COGS 1600 (10@100 + 5@120)");
const short = consumeFifo([{ id: "a", qtyRemaining: "10", rate: "100" }], "15");
assert.ok(eq(short.remaining, "5")); ok("FIFO short stock surfaces remaining 5");

// 12. M4 — GST period range (UTC-safe month boundaries).
assert.deepStrictEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" }); ok("monthRange Feb 2026 → 01..28 (non-leap)");
assert.deepStrictEqual(monthRange("2024-02"), { from: "2024-02-01", to: "2024-02-29" }); ok("monthRange Feb 2024 → 01..29 (leap)");
assert.deepStrictEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2026-12-31" }); ok("monthRange Dec → 01..31");

// 13. M5 — reconciliation matching.
assert.strictEqual(classifyLine("500"), "RECEIPT"); ok("inflow → RECEIPT");
assert.strictEqual(classifyLine("-500"), "PAYMENT"); ok("outflow → PAYMENT");
assert.strictEqual(daysBetween("2026-06-15", "2026-06-12"), 3); ok("daysBetween = 3");
assert.ok(lineMatches({ amount: "500", txn_date: "2026-06-15" }, { debit: "500", credit: "0" }, "2026-06-14", 3)); ok("inflow matches a 500 debit within tolerance");
assert.ok(!lineMatches({ amount: "500", txn_date: "2026-06-15" }, { debit: "500", credit: "0" }, "2026-06-01", 3)); ok("match rejected when out of date tolerance");
assert.ok(lineMatches({ amount: "-500", txn_date: "2026-06-15" }, { debit: "0", credit: "500" }, "2026-06-15", 3)); ok("outflow matches a 500 credit");

// 14. M6 — cash-flow activity classification.
assert.strictEqual(cashFlowActivity("Fixed Assets"), "INVESTING"); ok("Fixed Assets → Investing");
assert.strictEqual(cashFlowActivity("Loans (Liability)"), "FINANCING"); ok("Loans → Financing");
assert.strictEqual(cashFlowActivity("Sundry Debtors"), "OPERATING"); ok("Debtors → Operating");
assert.strictEqual(cashFlowActivity("Sales Accounts"), "OPERATING"); ok("Sales → Operating");

// 15. M7 — multi-currency + depreciation.
assert.ok(eq(fxConvert("100", "83"), "8300")); ok("fxConvert 100 USD @83 → ₹8300");
assert.ok(eq(realizedFx("100", "80", "83"), "300")); ok("realised FX 100 @80→83 → ₹300 gain");
assert.ok(eq(depreciationMonthly("SLM", "120000", "0", "10"), "1000")); ok("SLM 10% on 120000 → 1000/month");
assert.ok(eq(depreciationMonthly("WDV", "120000", "12000", "10"), "900")); ok("WDV 10% on 108000 WDV → 900/month");

// 16. M8 — automation pure helpers.
assert.strictEqual(formatDocNumber({ prefix: "INV-", pad: 4, suffix: "", include_fy: true }, 7, "2026-27"), "INV-2026-27-0007"); ok("number format → INV-2026-27-0007");
assert.strictEqual(formatDocNumber({ prefix: "BILL/", pad: 5, suffix: "/A", include_fy: false }, 42, "2026-27"), "BILL/00042/A"); ok("number format (no FY) → BILL/00042/A");
assert.strictEqual(toRupees(computeLateFee("10000", 30, "18")), "147.95"); ok("late fee 18%pa on 10000 for 30d → ₹147.95");
assert.strictEqual(toRupees(computeLateFee("10000", 0, "18")), "0.00"); ok("late fee 0 days → 0");
assert.ok(ruleRequiresApproval([{ entity_type: "PAYMENT", min_amount: "100000" }], "PAYMENT", "150000")); ok("payment ≥ ₹1L needs approval");
assert.ok(!ruleRequiresApproval([{ entity_type: "PAYMENT", min_amount: "100000" }], "PAYMENT", "50000")); ok("payment < ₹1L auto-ok");

// 17. M10 — portal HMAC tokens.
const tok = signToken({ kind: "invoice", tenant: "acme-1", voucherId: "v123" });
const decoded = verifyToken(tok);
assert.ok(decoded && decoded.kind === "invoice" && decoded.voucherId === "v123"); ok("portal token signs + verifies (round-trip)");
assert.strictEqual(verifyToken(tok.slice(0, -2) + "xx"), null); ok("tampered portal token rejected");
assert.strictEqual(verifyToken("garbage"), null); ok("garbage token rejected");

// 18. M10 — e-invoice IRP payload shape + OCR fallback.
const irp = buildIrpPayload({ voucher_type: "SALES", voucher_number: 7, voucher_date: "2026-06-15" }, [{ tax_kind: "CGST", taxable_value: "10000", tax_amount: "900", hsn_sac: "1234", rate: "9" }], { gstin: "27ABCDE1234F1Z5" }, { name: "Gupta Traders" });
assert.strictEqual(irp.docNo, "SALES-7"); ok("IRP payload docNo → SALES-7");
assert.ok(irp.seller.gstin === "27ABCDE1234F1Z5" && irp.items.length === 1); ok("IRP payload carries seller GSTIN + items");
assert.strictEqual(ocrMod.isConfigured(), false); ok("OCR not configured by default (manual-entry fallback)");

console.log(`\n${n} checks passed.`);
