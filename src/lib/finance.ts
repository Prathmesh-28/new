// ─────────────────────────────────────────────────────────────────────────────
// Headroom Finance Engine
// Pure, dependency-free calculation layer. Every metric on the Financial
// Health, Working Capital, Debt, Valuation and Compliance pages derives from
// the AppStore through computeFinancialSnapshot() so all modules stay in sync.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  AppStore, Transaction, Invoice, ActiveLoan, InventoryItem, ProcurementOrder,
  CashObligation,
} from "@/data/types";

const DAY_MS = 86_400_000;

function iso(d: Date): string { return d.toISOString().split("T")[0]; }
function daysAgo(today: Date, n: number): string { return iso(new Date(today.getTime() - n * DAY_MS)); }

// ── Loan / time-value math ────────────────────────────────────────────────────

/** Standard reducing-balance EMI. Rate is annual %, term in months. */
export function emi(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export interface AmortRow {
  month: number;
  opening: number;
  payment: number;
  interest: number;
  principal: number;
  closing: number;
}

export function amortizationSchedule(principal: number, annualRatePct: number, months: number): AmortRow[] {
  const pay = emi(principal, annualRatePct, months);
  const r = annualRatePct / 100 / 12;
  const rows: AmortRow[] = [];
  let bal = principal;
  for (let m = 1; m <= months && bal > 0.01; m++) {
    const interest = bal * r;
    const princ = Math.min(pay - interest, bal);
    rows.push({ month: m, opening: bal, payment: princ + interest, interest, principal: princ, closing: bal - princ });
    bal -= princ;
  }
  return rows;
}

export function totalInterest(principal: number, annualRatePct: number, months: number): number {
  return amortizationSchedule(principal, annualRatePct, months).reduce((s, r) => s + r.interest, 0);
}

/** Effect of a one-time lump-sum prepayment keeping the same EMI. */
export function prepaymentImpact(outstanding: number, annualRatePct: number, remainingMonths: number, lumpSum: number): {
  monthsSaved: number; interestSaved: number; newTermMonths: number;
} {
  const base = totalInterest(outstanding, annualRatePct, remainingMonths);
  const newPrincipal = Math.max(0, outstanding - lumpSum);
  if (newPrincipal === 0) return { monthsSaved: remainingMonths, interestSaved: base, newTermMonths: 0 };
  // Same EMI, smaller principal → fewer months
  const pay = emi(outstanding, annualRatePct, remainingMonths);
  const r = annualRatePct / 100 / 12;
  let newMonths: number;
  if (r === 0) newMonths = Math.ceil(newPrincipal / pay);
  else newMonths = Math.ceil(Math.log(pay / (pay - newPrincipal * r)) / Math.log(1 + r));
  newMonths = Math.min(newMonths, remainingMonths);
  const newInterest = amortizationSchedule(newPrincipal, annualRatePct, newMonths).reduce((s, x) => s + x.interest, 0);
  return { monthsSaved: remainingMonths - newMonths, interestSaved: Math.max(0, base - newInterest), newTermMonths: newMonths };
}

/** NPV of monthly cashflows (cf[0] at t=0). Rate is annual %. */
export function npv(annualRatePct: number, cashflows: number[]): number {
  const r = annualRatePct / 100 / 12;
  return cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
}

/** IRR (annual %) of monthly cashflows via bisection; null if no sign change. */
export function irr(cashflows: number[]): number | null {
  const hasPos = cashflows.some(c => c > 0), hasNeg = cashflows.some(c => c < 0);
  if (!hasPos || !hasNeg) return null;
  let lo = -0.99, hi = 10; // monthly rate bounds
  const f = (rm: number) => cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + rm, t), 0);
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  return ((lo + hi) / 2) * 12 * 100;
}

/** Annualized return of taking an early-payment discount (e.g. "2/10 net 30"). */
export function earlyPayAnnualizedReturn(discountPct: number, daysEarly: number): number {
  if (daysEarly <= 0 || discountPct <= 0 || discountPct >= 100) return 0;
  return (discountPct / (100 - discountPct)) * (365 / daysEarly) * 100;
}

export function effectiveAnnualRate(nominalPct: number, compoundsPerYear = 12): number {
  return (Math.pow(1 + nominalPct / 100 / compoundsPerYear, compoundsPerYear) - 1) * 100;
}

// ── Series helpers ────────────────────────────────────────────────────────────

export interface MonthAgg { key: string; label: string; revenue: number; expense: number; net: number }

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthlyAggregates(transactions: Transaction[], n: number, today = new Date()): MonthAgg[] {
  const out: MonthAgg[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const mTxns = transactions.filter(t => t.date.startsWith(key));
    const revenue = mTxns.filter(t => t.amount > 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0);
    const expense = Math.abs(mTxns.filter(t => t.amount < 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0));
    out.push({ key, label: MONTH_LABEL[d.getMonth()], revenue, expense, net: revenue - expense });
  }
  return out;
}

/** Compound monthly growth rate (%) of a positive series; null if not computable. */
export function cmgr(series: number[]): number | null {
  const vals = series.filter(v => v > 0);
  if (vals.length < 2) return null;
  const first = series.find(v => v > 0)!;
  const last = [...series].reverse().find(v => v > 0)!;
  const span = series.lastIndexOf(last) - series.indexOf(first);
  if (span <= 0 || first <= 0) return null;
  return (Math.pow(last / first, 1 / span) - 1) * 100;
}

// ── Working-capital cycle ─────────────────────────────────────────────────────

/** Days Sales Outstanding: open receivables ÷ daily credit sales (last 90d invoiced). */
export function dso(invoices: Invoice[], today = new Date()): number {
  const open = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const cutoff = daysAgo(today, 90);
  const sales90 = invoices.filter(i => i.invoiceDate >= cutoff).reduce((s, i) => s + i.amount, 0);
  if (sales90 <= 0) return open > 0 ? 90 : 0;
  return Math.round(open / (sales90 / 90));
}

/** Days Inventory Outstanding: inventory value ÷ daily COGS (procurement received, 90d proxy). */
export function dio(inventory: InventoryItem[], procurement: ProcurementOrder[], today = new Date()): number {
  const invValue = inventory.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  if (invValue <= 0) return 0;
  const cutoff = daysAgo(today, 90);
  const cogs90 = procurement
    .filter(p => p.status === "received" && p.createdAt.slice(0, 10) >= cutoff)
    .reduce((s, p) => s + p.totalValue, 0);
  if (cogs90 <= 0) return 60; // inventory held but no recent purchases → assume 60d
  return Math.round(invValue / (cogs90 / 90));
}

/** Days Payables Outstanding: open payables ÷ daily purchases (90d). */
export function dpo(procurement: ProcurementOrder[], today = new Date()): number {
  const openAP = procurement.filter(p => p.status === "ordered" || p.status === "approved").reduce((s, p) => s + p.totalValue, 0);
  const cutoff = daysAgo(today, 90);
  const purchases90 = procurement.filter(p => p.createdAt.slice(0, 10) >= cutoff).reduce((s, p) => s + p.totalValue, 0);
  if (purchases90 <= 0) return openAP > 0 ? 30 : 0;
  return Math.round(openAP / (purchases90 / 90));
}

export interface AgingBucket { label: string; amount: number; count: number }

export function agingBuckets(invoices: Invoice[], today = new Date()): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: "Not due", amount: 0, count: 0 },
    { label: "1–30 days", amount: 0, count: 0 },
    { label: "31–60 days", amount: 0, count: 0 },
    { label: "61–90 days", amount: 0, count: 0 },
    { label: "90+ days", amount: 0, count: 0 },
  ];
  const t = iso(today);
  invoices.filter(i => i.status !== "paid").forEach(i => {
    const overdueDays = Math.floor((new Date(t).getTime() - new Date(i.dueDate).getTime()) / DAY_MS);
    const idx = overdueDays <= 0 ? 0 : overdueDays <= 30 ? 1 : overdueDays <= 60 ? 2 : overdueDays <= 90 ? 3 : 4;
    buckets[idx].amount += i.amount;
    buckets[idx].count += 1;
  });
  return buckets;
}

// ── Concentration risk ────────────────────────────────────────────────────────

/** Herfindahl–Hirschman Index on revenue shares (0–10,000). >2,500 = concentrated. */
export function hhi(amounts: number[]): number {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return Math.round(amounts.reduce((s, a) => s + Math.pow((a / total) * 100, 2), 0));
}

// ── Indian tax ────────────────────────────────────────────────────────────────

export interface GstSummary { outputTax: number; inputCredit: number; netPayable: number; taxableSales: number; taxablePurchases: number }

/** GST position for a month (key "YYYY-MM"); amounts treated as GST-inclusive. */
export function gstSummary(transactions: Transaction[], ratePct: number, monthKey: string): GstSummary {
  const r = ratePct / 100;
  const mTxns = transactions.filter(t => t.date.startsWith(monthKey));
  const sales = mTxns.filter(t => t.amount > 0 && t.category === "revenue").reduce((s, t) => s + t.amount, 0);
  const purchases = Math.abs(mTxns.filter(t => t.amount < 0 && t.category === "expense").reduce((s, t) => s + t.amount, 0));
  const outputTax = sales - sales / (1 + r);
  const inputCredit = purchases - purchases / (1 + r);
  return {
    outputTax: Math.round(outputTax),
    inputCredit: Math.round(inputCredit),
    netPayable: Math.round(Math.max(0, outputTax - inputCredit)),
    taxableSales: Math.round(sales),
    taxablePurchases: Math.round(purchases),
  };
}

export interface AdvanceTaxInstallment {
  label: string;
  dueDate: string;
  cumulativePct: number;
  cumulativeTax: number;
  installment: number;
  status: "paid_window" | "upcoming" | "overdue";
}

/** Indian advance-tax schedule (§208/211): 15% / 45% / 75% / 100% by Jun/Sep/Dec/Mar 15. Corporate rate 25%. */
export function advanceTaxSchedule(estAnnualProfit: number, today = new Date(), taxRatePct = 25): AdvanceTaxInstallment[] {
  const tax = Math.max(0, estAnnualProfit) * (taxRatePct / 100);
  // Financial year: Apr–Mar. FY start year:
  const fyStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const defs = [
    { label: "Q1 · 15 Jun", date: new Date(fyStart, 5, 15), pct: 15 },
    { label: "Q2 · 15 Sep", date: new Date(fyStart, 8, 15), pct: 45 },
    { label: "Q3 · 15 Dec", date: new Date(fyStart, 11, 15), pct: 75 },
    { label: "Q4 · 15 Mar", date: new Date(fyStart + 1, 2, 15), pct: 100 },
  ];
  let prevCum = 0;
  return defs.map(d => {
    const cum = (tax * d.pct) / 100;
    const inst = cum - prevCum;
    prevCum = cum;
    const status: AdvanceTaxInstallment["status"] =
      d.date.getTime() < today.getTime() ? "paid_window" : "upcoming";
    return {
      label: d.label, dueDate: iso(d.date), cumulativePct: d.pct,
      cumulativeTax: Math.round(cum), installment: Math.round(inst), status,
    };
  });
}

/** GSTR-3B late fee (₹50/day, capped) + 18% p.a. interest on unpaid liability. */
export function gstLatePenalty(netPayable: number, daysLate: number): { lateFee: number; interest: number; total: number } {
  if (daysLate <= 0) return { lateFee: 0, interest: 0, total: 0 };
  const lateFee = Math.min(daysLate * 50, 10_000);
  const interest = netPayable * 0.18 * (daysLate / 365);
  return { lateFee: Math.round(lateFee), interest: Math.round(interest), total: Math.round(lateFee + interest) };
}

// ── Valuation ─────────────────────────────────────────────────────────────────

export interface DcfYear { year: number; fcf: number; pv: number }
export interface DcfResult { years: DcfYear[]; terminalValue: number; terminalPv: number; enterpriseValue: number }

export function dcfValuation(opts: {
  baseAnnualFcf: number; growthPct: number; discountPct: number; years?: number; terminalGrowthPct?: number;
}): DcfResult {
  const { baseAnnualFcf, growthPct, discountPct, years = 5, terminalGrowthPct = 4 } = opts;
  const g = growthPct / 100, d = discountPct / 100, tg = Math.min(terminalGrowthPct, discountPct - 1) / 100;
  const rows: DcfYear[] = [];
  let fcf = baseAnnualFcf;
  for (let y = 1; y <= years; y++) {
    fcf = fcf * (1 + g);
    rows.push({ year: y, fcf, pv: fcf / Math.pow(1 + d, y) });
  }
  const lastFcf = rows[rows.length - 1]?.fcf ?? baseAnnualFcf;
  const terminalValue = d > tg ? (lastFcf * (1 + tg)) / (d - tg) : 0;
  const terminalPv = terminalValue / Math.pow(1 + d, years);
  return {
    years: rows,
    terminalValue,
    terminalPv,
    enterpriseValue: rows.reduce((s, r) => s + r.pv, 0) + terminalPv,
  };
}

export function dilution(preMoney: number, raiseAmount: number): { postMoney: number; investorPct: number; founderRetainedPct: number } {
  const postMoney = preMoney + raiseAmount;
  const investorPct = postMoney > 0 ? (raiseAmount / postMoney) * 100 : 0;
  return { postMoney, investorPct, founderRetainedPct: 100 - investorPct };
}

// ── Composite snapshot ────────────────────────────────────────────────────────

export interface HealthComponent {
  key: string;
  label: string;
  score: number;       // 0–100
  weight: number;      // sums to 100
  detail: string;
  fixPath: string;     // deep link to the module that improves this
  fixLabel: string;
}

export interface HealthResult { score: number; grade: string; components: HealthComponent[] }

export interface FinancialSnapshot {
  // Liquidity
  cash: number;
  monthlyRevenue: number;        // 3-month average
  monthlyExpense: number;
  monthlyNet: number;
  runwayDays: number;            // 999 = cash-flow positive
  revenueGrowthPct: number | null;
  grossMarginPct: number | null;
  burnMultiple: number | null;
  // Working capital
  accountsReceivable: number;
  overdueReceivable: number;
  inventoryValue: number;
  accountsPayable: number;
  dsoDays: number;
  dioDays: number;
  dpoDays: number;
  cccDays: number;
  workingCapitalGap: number;     // cash tied up in the cycle
  currentRatio: number | null;
  quickRatio: number | null;
  netWorkingCapital: number;
  // Debt
  debtOutstanding: number;
  monthlyDebtService: number;
  monthlyInterest: number;
  weightedAvgRatePct: number | null;
  dscr: number | null;
  interestCoverage: number | null;
  // Concentration & tax
  customerHhi: number;
  topCustomerPct: number;
  gstThisMonth: GstSummary;
  estAnnualProfit: number;
  advanceTax: AdvanceTaxInstallment[];
  obligationsDue90: number;
  // Composite
  health: HealthResult;
  months: MonthAgg[];
}

function grade(score: number): string {
  return score >= 85 ? "A+" : score >= 75 ? "A" : score >= 65 ? "B+" : score >= 55 ? "B" : score >= 45 ? "C" : score >= 35 ? "D" : "E";
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function computeFinancialSnapshot(store: AppStore, today = new Date()): FinancialSnapshot {
  const { transactions, bankAccounts, invoices, inventory, procurement, activeLoans, obligations } = store;

  const months = monthlyAggregates(transactions, 6, today);
  const last3 = months.slice(-3);
  const monthlyRevenue = last3.reduce((s, m) => s + m.revenue, 0) / 3;
  const monthlyExpense = last3.reduce((s, m) => s + m.expense, 0) / 3;
  const monthlyNet = monthlyRevenue - monthlyExpense;

  const cash = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const dailyBurn = monthlyNet < 0 ? -monthlyNet / 30 : 0;
  const runway = dailyBurn > 0 ? Math.floor(cash / dailyBurn) : 999;

  const revenueGrowthPct = cmgr(months.map(m => m.revenue));
  const totalRev6 = months.reduce((s, m) => s + m.revenue, 0);
  const totalExp6 = months.reduce((s, m) => s + m.expense, 0);
  const grossMarginPct = totalRev6 > 0 ? ((totalRev6 - totalExp6) / totalRev6) * 100 : null;
  const burnMultiple = monthlyNet < 0 && revenueGrowthPct !== null && revenueGrowthPct > 0
    ? -monthlyNet / (monthlyRevenue * (revenueGrowthPct / 100))
    : null;

  // Working capital
  const openInvoices = invoices.filter(i => i.status !== "paid");
  const accountsReceivable = openInvoices.reduce((s, i) => s + i.amount, 0);
  const todayIso = iso(today);
  const overdueReceivable = openInvoices.filter(i => i.dueDate < todayIso).reduce((s, i) => s + i.amount, 0);
  const inventoryValue = inventory.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const accountsPayable = procurement.filter(p => p.status === "ordered" || p.status === "approved").reduce((s, p) => s + p.totalValue, 0);

  const dsoDays = dso(invoices, today);
  const dioDays = dio(inventory, procurement, today);
  const dpoDays = dpo(procurement, today);
  const cccDays = dsoDays + dioDays - dpoDays;
  const workingCapitalGap = Math.max(0, (cccDays / 30) * monthlyExpense);

  const obligationsDue90 = obligations
    .filter(o => o.dueDate >= todayIso && o.dueDate <= daysFromNow(today, 90))
    .reduce((s, o) => s + o.amount, 0);

  // Debt
  const debtOutstanding = activeLoans.reduce((s, l) => s + l.outstanding, 0);
  const monthlyDebtService = activeLoans.reduce((s, l) => s + l.monthlyEmi, 0);
  const monthlyInterest = activeLoans.reduce((s, l) => s + (l.outstanding * (l.rate / 100)) / 12, 0);
  const weightedAvgRatePct = debtOutstanding > 0
    ? activeLoans.reduce((s, l) => s + l.rate * l.outstanding, 0) / debtOutstanding
    : null;

  const currentAssets = cash + accountsReceivable + inventoryValue;
  const currentLiabilities = accountsPayable + obligationsDue90 + monthlyDebtService * 3;
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : null;
  const quickRatio = currentLiabilities > 0 ? (currentAssets - inventoryValue) / currentLiabilities : null;
  const netWorkingCapital = currentAssets - currentLiabilities;

  const operatingCashFlow = monthlyNet + monthlyDebtService; // add back debt service ≈ pre-debt cash flow
  const dscr = monthlyDebtService > 0 ? operatingCashFlow / monthlyDebtService : null;
  const interestCoverage = monthlyInterest > 0 ? operatingCashFlow / monthlyInterest : null;

  // Concentration
  const custRev: Record<string, number> = {};
  transactions.filter(t => t.amount > 0 && t.category === "revenue" && t.counterparty).forEach(t => {
    custRev[t.counterparty] = (custRev[t.counterparty] ?? 0) + t.amount;
  });
  invoices.forEach(i => { custRev[i.customer] = (custRev[i.customer] ?? 0) + i.amount; });
  const shares = Object.values(custRev);
  const customerHhi = hhi(shares);
  const totalShares = shares.reduce((a, b) => a + b, 0);
  const topCustomerPct = totalShares > 0 ? (Math.max(...shares, 0) / totalShares) * 100 : 0;

  // Tax
  const monthKey = todayIso.slice(0, 7);
  const gstThisMonth = gstSummary(transactions, store.firm.gstRate ?? 18, monthKey);
  const estAnnualProfit = Math.max(0, monthlyNet) * 12;
  const advanceTax = advanceTaxSchedule(estAnnualProfit, today);

  // ── Composite health score ──
  const hasData = transactions.length > 0 || bankAccounts.length > 0;
  const components: HealthComponent[] = [
    {
      key: "liquidity", label: "Liquidity & Runway", weight: 25,
      score: runway >= 999 ? 100 : clamp((runway / 180) * 100),
      detail: runway >= 999 ? "Cash-flow positive" : `${runway} days of runway at current burn`,
      fixPath: "/credit", fixLabel: "Arrange working capital",
    },
    {
      key: "profitability", label: "Profitability", weight: 20,
      score: grossMarginPct === null ? 50 : clamp(50 + grossMarginPct * 1.5),
      detail: grossMarginPct === null ? "No revenue history yet" : `${grossMarginPct.toFixed(0)}% net margin over 6 months`,
      fixPath: "/budgets", fixLabel: "Tighten budgets",
    },
    {
      key: "collections", label: "Collections (DSO)", weight: 15,
      score: accountsReceivable === 0 ? 80 : clamp(100 - dsoDays - (overdueReceivable / Math.max(1, accountsReceivable)) * 40),
      detail: `DSO ${dsoDays}d · ${accountsReceivable > 0 ? Math.round((overdueReceivable / accountsReceivable) * 100) : 0}% of AR overdue`,
      fixPath: "/receivables", fixLabel: "Chase overdue invoices",
    },
    {
      key: "leverage", label: "Debt Coverage (DSCR)", weight: 15,
      score: dscr === null ? 85 : clamp(dscr * 40),
      detail: dscr === null ? "No active debt" : `DSCR ${dscr.toFixed(2)}x (lenders want ≥ 1.25x)`,
      fixPath: "/debt", fixLabel: "Restructure debt",
    },
    {
      key: "growth", label: "Revenue Growth", weight: 10,
      score: revenueGrowthPct === null ? 50 : clamp(50 + revenueGrowthPct * 4),
      detail: revenueGrowthPct === null ? "Not enough history" : `${revenueGrowthPct.toFixed(1)}% compound monthly growth`,
      fixPath: "/analytics", fixLabel: "Analyse revenue",
    },
    {
      key: "concentration", label: "Customer Concentration", weight: 10,
      score: shares.length === 0 ? 60 : clamp(100 - Math.max(0, (topCustomerPct - 15) * 2)),
      detail: shares.length === 0 ? "No customer data" : `Top customer is ${topCustomerPct.toFixed(0)}% of revenue · HHI ${customerHhi}`,
      fixPath: "/invoices", fixLabel: "Diversify customers",
    },
    {
      key: "compliance", label: "Tax & Compliance", weight: 5,
      score: (store.firm.gstRegistered ? 70 : 40) + (obligations.filter(o => o.dueDate < todayIso).length === 0 ? 30 : 0),
      detail: `${store.firm.gstRegistered ? "GST registered" : "Not GST registered"} · ${obligations.filter(o => o.dueDate < todayIso).length} overdue obligation(s)`,
      fixPath: "/compliance", fixLabel: "Open compliance calendar",
    },
  ];
  const score = hasData
    ? Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / 100)
    : 0;

  return {
    cash, monthlyRevenue, monthlyExpense, monthlyNet, runwayDays: runway,
    revenueGrowthPct, grossMarginPct, burnMultiple,
    accountsReceivable, overdueReceivable, inventoryValue, accountsPayable,
    dsoDays, dioDays, dpoDays, cccDays, workingCapitalGap,
    currentRatio, quickRatio, netWorkingCapital,
    debtOutstanding, monthlyDebtService, monthlyInterest, weightedAvgRatePct, dscr, interestCoverage,
    customerHhi, topCustomerPct, gstThisMonth, estAnnualProfit, advanceTax, obligationsDue90,
    health: { score, grade: grade(score), components },
    months,
  };
}

function daysFromNow(today: Date, n: number): string { return iso(new Date(today.getTime() + n * DAY_MS)); }

// ── Financing comparison (working-capital page) ───────────────────────────────

export interface FinancingOption {
  key: string;
  name: string;
  description: string;
  effectiveAnnualCostPct: number;
  monthlyCost: number;
  speed: string;
  path: string;
  cta: string;
}

/** Compare ways to fund a working-capital gap, ranked by effective annual cost. */
export function financingOptions(gap: number, accountsReceivable: number): FinancingOption[] {
  if (gap <= 0) return [];
  const opts: FinancingOption[] = [];

  // Invoice discounting: ~1.4%/month on financed AR, only if AR exists
  if (accountsReceivable > 0) {
    const financeable = Math.min(gap, accountsReceivable * 0.8);
    opts.push({
      key: "invoice_discounting", name: "Invoice discounting",
      description: `Advance 80% of ₹${Math.round(accountsReceivable).toLocaleString("en-IN")} receivables · 1.4%/mo`,
      effectiveAnnualCostPct: effectiveAnnualRate(1.4 * 12, 12),
      monthlyCost: financeable * 0.014,
      speed: "24–48 hrs", path: "/receivables", cta: "Finance receivables",
    });
  }

  // Working-capital term loan @18% reducing
  opts.push({
    key: "term_loan", name: "Working-capital loan",
    description: "12-month reducing-balance loan @ 18% p.a.",
    effectiveAnnualCostPct: effectiveAnnualRate(18, 12),
    monthlyCost: emi(gap, 18, 12) - gap / 12,
    speed: "3–5 days", path: "/credit", cta: "Apply for credit",
  });

  // Overdraft / credit line @16% on drawn amount (assume 60% utilization)
  opts.push({
    key: "credit_line", name: "Overdraft line",
    description: "Pay interest only on what you draw · 16% p.a. (60% avg utilisation)",
    effectiveAnnualCostPct: 16 * 0.6,
    monthlyCost: (gap * 0.6 * 0.16) / 12,
    speed: "5–7 days", path: "/lenders", cta: "Get lender quotes",
  });

  // Stretch payables via supplier early-pay marketplace (give up 2/10 discount = cost)
  opts.push({
    key: "stretch_payables", name: "Negotiate supplier terms",
    description: "Extend DPO 15 days — forgo 2/10 early-pay discounts (implied cost)",
    effectiveAnnualCostPct: earlyPayAnnualizedReturn(2, 20),
    monthlyCost: (gap * earlyPayAnnualizedReturn(2, 20)) / 100 / 12,
    speed: "Immediate", path: "/suppliers", cta: "Open supplier hub",
  });

  return opts.sort((a, b) => a.effectiveAnnualCostPct - b.effectiveAnnualCostPct);
}
