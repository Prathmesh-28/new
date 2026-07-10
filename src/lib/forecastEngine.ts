// ─────────────────────────────────────────────────────────────────────────────
// Headroom Forecast Engine - pure, dependency-free, DETERMINISTIC.
//
// A probabilistic 90-day daily cash-flow model that competitors don't ship:
//   • Recurring vs variable split (auto-detected periodic flows scheduled exactly)
//   • Day-of-week / day-of-month / month seasonality decomposition
//   • Receivables-aware collection timing (per-customer pay-lag + default risk)
//   • Monte-Carlo simulation (seeded) → honest P10/P50/P90 bands that WIDEN
//   • Risk analytics: Cash-Flow-at-Risk, probability-of-breach (+ by-day hazard),
//     expected time-to-breach, expected shortfall, runway distribution
//   • Built-in stress tests + a capital-readiness score with track fit
//
// Same store + same `today` → byte-identical output (all randomness from a seed
// derived from the store). Targets <50ms for 90 days × 1000 sims.
// ─────────────────────────────────────────────────────────────────────────────
import type { AppStore, Transaction, Invoice, ForecastPoint, Scenario } from "@/data/types";
import { computeFinancialSnapshot, monthlyAggregates, cmgr, dso } from "@/lib/finance";

const DAY = 86_400_000;

// ── Config & result types ────────────────────────────────────────────────────
export interface ForecastConfig {
  horizonDays?: number;
  numSims?: number;
  seed?: number;
  historyDays?: number;
  scenarios?: Scenario[];
  revenueFactor?: number; // slow-month multiplier on variable + invoice inflows
  burnFactor?: number;   // outflow multiplier - e.g. 1.2 means 20% higher costs
}

export interface RecurringSeries {
  signature: string;
  category: Transaction["category"];
  sign: 1 | -1;
  periodDays: number;
  cadence: "weekly" | "monthly" | "quarterly" | "irregular";
  dayOfMonth: number | null;
  meanAmount: number; // signed
  amountCv: number;
  confidence: number;
  occurrences: number;
  lastDate: string;
  nextDates: string[];
}

export interface ResidualModel {
  baseDailyInflow: number;
  baseDailyOutflow: number;
  dowFactor: number[];
  domFactor: number[];
  monFactor: number[];
  sigmaLogInflow: number;
  sigmaLogOutflow: number;
  driftMonthly: number;
  residualSigmaDaily: number;
}

export interface DayLedger { dayIndex: number; date: string; deterministicNet: number; scheduledOutflow: number; }

export interface CustomerPaymentProfile {
  customer: string; invoiceCount: number; openAmount: number;
  avgPayLagDays: number; perCustomerDso: number; lateRate: number;
  defaultProb: number; expectedCollectibleNow: number; reliability: number;
}
export interface CollectionDraw { invoiceId: string; customer: string; amount: number; meanCollectDay: number; sdCollectDay: number; collectProb: number; }
export interface ReceivablesAnalysis { profiles: CustomerPaymentProfile[]; draws: CollectionDraw[]; expectedInflowInHorizon: number; }

export interface CashFlowRisk {
  thresholdCash: number;
  cfar95: number;
  minBalanceP10: number;
  probBreach: number;
  probBreachByDay: number[];
  expectedTimeToBreachDays: number | null;
  p10TimeToBreachDays: number | null;
  expectedShortfall: number;
  pressureDayP10: number | null;
  runwayDist: { p10: number; p50: number; p90: number };
}

export type StressId = "revenue_down_20" | "ar_slip_15d" | "lose_top_customer" | "seasonal_trough";
export interface StressResult {
  id: StressId; label: string; minCashBase: number; minCashStressed: number;
  cashImpactAtTrough: number; endCashDelta: number; worstDay: string; breaches: boolean;
}

export type CapitalTrack =
  | "invoice_discounting" | "working_capital_loan" | "overdraft_line"
  | "revenue_based_financing" | "equity_raise" | "not_fundable_yet";
export interface ReadinessComponent { key: string; label: string; score: number; weight: number; detail: string; }
export interface CapitalReadiness {
  score: number; grade: string; components: ReadinessComponent[];
  recommendedTrack: CapitalTrack; rationale: string; maxPrudentDraw: number; fitConfidence: number;
}

export interface ForecastDiagnostics {
  residualSigmaDaily: number; driftMonthlyPct: number; recurringCoveragePct: number;
  collectedInvoiceCount: number; lowData: boolean; forecastability: number; seasonalAdjBurnMonthly: number;
}

export interface ForecastResult {
  points: ForecastPoint[];
  startBalance: number;
  recurring: RecurringSeries[];
  diagnostics: ForecastDiagnostics;
  risk: CashFlowRisk;
  receivables: ReceivablesAnalysis;
  stresses: StressResult[];
  capital: CapitalReadiness;
}

// ── Small utilities ──────────────────────────────────────────────────────────
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const clamp01 = (x: number) => clamp(x, 0, 1);
const finite = (x: number, fallback = 0) => (Number.isFinite(x) ? x : fallback);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const dayDiff = (a: string, b: Date) => Math.round((new Date(a).getTime() - b.getTime()) / DAY);

function mean(xs: number[]): number { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; }
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
export function quantileSorted(sortedAsc: number[] | Float64Array, p: number): number {
  const n = sortedAsc.length; if (!n) return 0;
  const idx = (n - 1) * clamp01(p); const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

// ── Deterministic RNG (mulberry32) + Gaussian (Box-Muller, cached) ───────────
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gaussian(rng: () => number): () => number {
  let spare: number | null = null;
  return function () {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0;
    while (u <= 1e-12) u = rng();
    v = rng();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

// FNV-1a over the cashflow-relevant fields → seed. Irrelevant fields don't shift it.
export function hashStore(store: AppStore, cfg?: ForecastConfig): number {
  let h = 2166136261;
  const add = (str: string) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } };
  for (const t of store.transactions ?? []) add(`${t.id}${t.amount}${t.date}`);
  for (const a of store.bankAccounts ?? []) add(`${a.id}${a.balance}`);
  for (const i of store.invoices ?? []) if (i.status !== "paid") add(`${i.id}${i.amount}${i.dueDate}${i.status}`);
  for (const l of store.activeLoans ?? []) add(`${l.id}${l.monthlyEmi}${l.nextPaymentDate}${l.outstanding}`);
  for (const o of store.obligations ?? []) add(`${o.id}${o.amount}${o.dueDate}`);
  add(`${store.firm?.safetyThresholdDays ?? 14}`);
  add(`${cfg?.revenueFactor ?? 1}`);
  add(JSON.stringify((cfg?.scenarios ?? []).filter(s => s.active).map(s => [s.type, s.params])));
  return h >>> 0;
}

// ── STEP 2 - Recurring detection ─────────────────────────────────────────────
export function detectRecurring(txns: Transaction[], today: Date, historyDays: number): RecurringSeries[] {
  const start = addDays(today, -historyDays);
  const hist = txns.filter(t => t.category !== "transfer" && new Date(t.date) >= start && new Date(t.date) <= today);
  const groups = new Map<string, Transaction[]>();
  for (const t of hist) {
    const sign = t.amount >= 0 ? 1 : -1;
    const sig = `${t.counterparty || "?"}|${t.category}|${sign}`;
    (groups.get(sig) ?? groups.set(sig, []).get(sig)!).push(t);
  }
  const out: RecurringSeries[] = [];
  for (const [sig, list] of groups) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    const days = sorted.map(t => new Date(t.date).getTime() / DAY);
    const gaps: number[] = [];
    for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
    const periodDays = median(gaps);
    if (periodDays <= 0) continue;
    const cadence: RecurringSeries["cadence"] =
      Math.abs(periodDays - 7) <= 2 ? "weekly" :
      Math.abs(periodDays - 30) <= 6 ? "monthly" :
      Math.abs(periodDays - 91) <= 12 ? "quarterly" : "irregular";
    const amounts = sorted.map(t => t.amount);
    const amtMean = mean(amounts);
    const gapCv = mean(gaps) ? stdev(gaps) / mean(gaps) : 1;
    const amountCv = Math.abs(amtMean) > 1 ? stdev(amounts) / Math.abs(amtMean) : 1;
    const expectedCount = historyDays / periodDays;
    const anyRecurring = sorted.some(t => t.isRecurring);
    const confidence = clamp01(Math.min(1, list.length / Math.max(1, expectedCount)) * Math.exp(-gapCv) * Math.exp(-amountCv) + (anyRecurring ? 0.15 : 0));
    if (confidence < 0.35 || cadence === "irregular") continue;
    // modal day-of-month for monthly cadence
    let dayOfMonth: number | null = null;
    if (cadence === "monthly") {
      const counts = new Map<number, number>();
      for (const t of sorted) { const d = new Date(t.date).getDate(); counts.set(d, (counts.get(d) ?? 0) + 1); }
      dayOfMonth = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    out.push({
      signature: sig, category: sorted[0].category, sign: amtMean >= 0 ? 1 : -1,
      periodDays, cadence, dayOfMonth, meanAmount: median(amounts), amountCv,
      confidence, occurrences: list.length, lastDate: sorted[sorted.length - 1].date, nextDates: [],
    });
  }
  return out;
}

// ── STEP 3 - Residual / seasonality model ────────────────────────────────────
export function fitResidualModel(txns: Transaction[], recurring: RecurringSeries[], today: Date, historyDays: number): ResidualModel {
  const start = addDays(today, -historyDays);
  const hist = txns.filter(t => t.category !== "transfer" && new Date(t.date) >= start && new Date(t.date) <= today);
  // recurring amount attributed per calendar day (by signature schedule is approximated by removing the group's mean per occurrence date)
  const recurringDates = new Set<string>();
  for (const r of recurring) recurringDates.add(r.signature);
  // daily net residual = signed net per day minus recurring contributions occurring that day
  const byDay = new Map<string, number>();
  for (const t of hist) {
    const sign = t.amount >= 0 ? 1 : -1;
    const sig = `${t.counterparty || "?"}|${t.category}|${sign}`;
    if (recurringDates.has(sig)) continue; // remove recurring → leaves variable residual
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount);
  }
  const dayKeys = [...byDay.keys()].sort();
  const residuals = dayKeys.map(k => byDay.get(k)!);
  // winsorise at p1/p99
  const sortedR = [...residuals].sort((a, b) => a - b);
  const lo = quantileSorted(sortedR, 0.01), hi = quantileSorted(sortedR, 0.99);
  const wins = residuals.map(r => clamp(r, lo, hi));

  const inflowsRaw = wins.filter(r => r > 0);
  const outflowsRaw = wins.filter(r => r < 0).map(r => -r);
  const recentN = Math.min(90, dayKeys.length);
  const recentKeys = dayKeys.slice(-recentN);
  const recentIn: number[] = [], recentOut: number[] = [];
  for (const k of recentKeys) { const v = byDay.get(k)!; if (v > 0) recentIn.push(v); else if (v < 0) recentOut.push(-v); }
  const baseDailyInflow = finite(median(recentIn.length ? recentIn : inflowsRaw));
  const baseDailyOutflow = finite(median(recentOut.length ? recentOut : outflowsRaw));

  // multiplicative seasonal factors from |residual| magnitudes
  const mags = new Map<string, number>(); for (const k of dayKeys) mags.set(k, Math.abs(byDay.get(k)!));
  const grand = mean([...mags.values()]) || 1;
  const factor = (bucketOf: (d: Date) => number, size: number): number[] => {
    const sums = new Array(size).fill(0), counts = new Array(size).fill(0);
    for (const k of dayKeys) { const b = bucketOf(new Date(k)); sums[b] += mags.get(k)!; counts[b]++; }
    const raw = sums.map((s, i) => counts[i] ? s / counts[i] / grand : 1);
    const rm = mean(raw) || 1;
    return raw.map(x => clamp(finite(x / rm, 1), 0.25, 4)); // normalise mean→1, floor 0.25
  };
  const dowFactor = factor(d => d.getDay(), 7);
  const domFactor = factor(d => d.getDate() - 1, 31);
  const monFactor = factor(d => d.getMonth(), 12);

  const cvIn = baseDailyInflow > 0 ? stdev(recentIn.length ? recentIn : inflowsRaw) / baseDailyInflow : 0.5;
  const cvOut = baseDailyOutflow > 0 ? stdev(recentOut.length ? recentOut : outflowsRaw) / baseDailyOutflow : 0.5;
  const sigmaLog = (cv: number) => clamp(Math.sqrt(Math.log(1 + Math.max(0, cv) ** 2)), 0.05, 1.2);
  const revSeries = monthlyAggregates(txns, 12, today).map(m => m.revenue);
  const driftMonthly = clamp(finite((cmgr(revSeries) ?? 0) / 100), -0.03, 0.06);
  const residualSigmaDaily = finite(stdev(wins));

  const spannedActive = dayKeys.length;
  const lowData = spannedActive < 60 || (recurring.length === 0 && spannedActive < 90);
  const widen = lowData ? Math.sqrt(60 / Math.max(1, spannedActive)) : 1;

  return {
    baseDailyInflow, baseDailyOutflow, dowFactor, domFactor, monFactor,
    sigmaLogInflow: clamp(sigmaLog(cvIn) * widen, 0.05, 1.5),
    sigmaLogOutflow: clamp(sigmaLog(cvOut) * widen, 0.05, 1.5),
    driftMonthly, residualSigmaDaily,
  };
}

// ── STEP 4 - Deterministic ledger (recurring + obligations + EMI) ────────────
export function buildLedger(store: AppStore, recurring: RecurringSeries[], today: Date, horizon: number): DayLedger[] {
  const ledger: DayLedger[] = [];
  for (let t = 0; t < horizon; t++) ledger.push({ dayIndex: t, date: iso(addDays(today, t + 1)), deterministicNet: 0, scheduledOutflow: 0 });
  const idxOf = (dateStr: string) => dayDiff(dateStr, today) - 1; // day t holds date today+t+1
  const place = (t: number, amt: number) => {
    if (t < 0 || t >= horizon) return;
    ledger[t].deterministicNet += amt;
    if (amt < 0) ledger[t].scheduledOutflow += -amt;
  };

  // (a) recurring series projected forward.
  // De-dup vs. authoritative obligations is PER OCCURRENCE, not per category: an audit
  // found the old category-existence skip dropped EVERY future recurring GST outflow the
  // moment ONE tax obligation existed (the app auto-adds exactly one next-due GSTR-3B),
  // and even a stale past-due obligation kept suppressing the whole series forever -
  // systematically overstating cash for GST-registered tenants. Now a projected
  // occurrence is skipped only when an obligation of the same type is due within a week
  // of it (that specific payment is authoritatively covered); "loan" keeps the blanket
  // skip because the backend bridges the loan's FULL schedule into obligations.
  const obligationCats = new Set((store.obligations ?? []).map(o => o.type));
  const OCCURRENCE_WINDOW_DAYS = 7;
  const covered = (category: string, dateStr: string): boolean => {
    const type = category === "payroll" ? "payroll" : category === "tax" ? "tax" : null;
    if (!type) return false;
    return (store.obligations ?? []).some(o =>
      o.type === type && Math.abs(dayDiff(o.dueDate, new Date(dateStr))) <= OCCURRENCE_WINDOW_DAYS);
  };
  for (const r of recurring) {
    if (r.cadence === "irregular") continue;
    if (r.category === "loan" && obligationCats.has("loan")) continue;
    const step = r.cadence === "weekly" ? 7 : r.cadence === "quarterly" ? 91 : 30;
    let cursor = new Date(r.lastDate);
    // advance to first occurrence after today
    let guard = 0;
    while (cursor <= today && guard++ < 5000) cursor = addDays(cursor, step);
    guard = 0;
    while (cursor <= addDays(today, horizon) && guard++ < 5000) {
      if (!covered(r.category, iso(cursor))) place(idxOf(iso(cursor)), r.meanAmount);
      cursor = addDays(cursor, step);
    }
  }
  // (b) cash obligations on their due dates (outflows)
  for (const o of store.obligations ?? []) place(idxOf(o.dueDate), -Math.abs(o.amount));
  // (c) active loan EMIs from nextPaymentDate, monthly through horizon
  for (const l of store.activeLoans ?? []) {
    if (!l.monthlyEmi || !l.nextPaymentDate) continue;
    let cursor = new Date(l.nextPaymentDate);
    let guard = 0;
    while (cursor <= addDays(today, horizon) && guard++ < 60) {
      if (cursor > today) place(idxOf(iso(cursor)), -Math.abs(l.monthlyEmi));
      cursor = addDays(cursor, 30);
    }
  }
  return ledger;
}

// ── STEP 5 - Receivables collection model ────────────────────────────────────
export function customerPaymentProfiles(store: AppStore, today: Date): CustomerPaymentProfile[] {
  const invoices = store.invoices ?? [];
  const open = invoices.filter(i => i.status !== "paid");
  const byCust = new Map<string, Invoice[]>();
  for (const i of open) (byCust.get(i.customer) ?? byCust.set(i.customer, []).get(i.customer)!).push(i);
  const firmDso = finite(dso(invoices, today), 45);
  // 90-day sales per customer (from invoices issued in last 90d as a proxy)
  const sales90 = new Map<string, number>();
  for (const i of invoices) {
    if (dayDiff(i.invoiceDate, today) >= -90) sales90.set(i.customer, (sales90.get(i.customer) ?? 0) + i.amount);
  }
  const totalOpen = open.reduce((s, i) => s + i.amount, 0) || 1;
  const profiles: CustomerPaymentProfile[] = [];
  for (const [customer, list] of byCust) {
    const openAmount = list.reduce((s, i) => s + i.amount, 0);
    const s90 = sales90.get(customer) ?? 0;
    const perCustomerDso = s90 > 0 ? clamp(openAmount / (s90 / 90), 0, 180) : firmDso;
    const avgPayLagDays = clamp(perCustomerDso - 30, 0, 60);
    const overdue = list.filter(i => i.status === "overdue").length;
    const lateRate = list.length ? overdue / list.length : 0;
    const ageOver = Math.max(0, ...list.map(i => Math.max(0, -dayDiff(i.dueDate, today))));
    const concShare = openAmount / totalOpen;
    const z = -3.2 + 0.018 * ageOver + 1.6 * lateRate + 0.4 * concShare;
    const defaultProb = clamp(1 / (1 + Math.exp(-z)), 0, 0.6);
    const reliability = Math.round(100 * clamp01(1 - (avgPayLagDays / 45) * 0.5 - lateRate * 0.3 - defaultProb * 0.5));
    profiles.push({
      customer, invoiceCount: list.length, openAmount, avgPayLagDays, perCustomerDso,
      lateRate, defaultProb, expectedCollectibleNow: openAmount * (1 - defaultProb), reliability,
    });
  }
  return profiles.sort((a, b) => b.openAmount - a.openAmount);
}

export function projectCollections(store: AppStore, profiles: CustomerPaymentProfile[], today: Date, _horizon: number): CollectionDraw[] {
  const byCust = new Map(profiles.map(p => [p.customer, p]));
  const draws: CollectionDraw[] = [];
  for (const inv of (store.invoices ?? [])) {
    if (inv.status === "paid") continue;
    const p = byCust.get(inv.customer);
    const lag = p?.avgPayLagDays ?? 30;
    const lateRate = p?.lateRate ?? 0.2;
    const dueIdx = dayDiff(inv.dueDate, today) - 1;
    const meanCollectDay = dueIdx < 0 ? Math.round(lateRate * 7) : Math.max(0, dueIdx + Math.round(lag));
    const sdCollectDay = clamp(0.5 * lag, 3, 20);
    draws.push({ invoiceId: inv.id, customer: inv.customer, amount: inv.amount, meanCollectDay, sdCollectDay, collectProb: 1 - (p?.defaultProb ?? 0.1) });
  }
  return draws;
}

// ── STEP 6 - Scenario overlay (additive ₹/day) ───────────────────────────────
export function scenarioToDailyDelta(scenarios: Scenario[], horizon: number, today: Date): number[] {
  const delta = new Array(horizon).fill(0);
  const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const startIdx = (p: Record<string, unknown>, def: number) => {
    const sd = p.startDate as string | undefined;
    if (sd) { const i = dayDiff(sd, today) - 1; return i >= 0 && i < horizon ? i : def; }
    return def;
  };
  for (const sc of scenarios) {
    if (!sc.active) continue;
    const p = sc.params || {};
    if (sc.type === "contract_won") { const i = startIdx(p, 10); if (i < horizon) delta[i] += num(p.amount); }
    else if (sc.type === "new_hire") { const s = startIdx(p, 15); const perDay = num(p.salary ?? p.amount) / 30; for (let t = s; t < horizon; t++) delta[t] -= perDay; }
    else if (sc.type === "loan_draw") {
      const s = startIdx(p, 0); const amt = num(p.amount); const months = num(p.termMonths, 12);
      const e = months > 0 ? (amt * (0.18 / 12)) / (1 - (1 + 0.18 / 12) ** -months) : 0;
      if (s < horizon) delta[s] += amt;
      for (let t = s + 30; t < horizon; t += 30) delta[t] -= e;
    } else if (sc.type === "custom") {
      const i = startIdx(p, 0);
      const monthly = num(p.monthlyAmount);
      if (monthly !== 0) {
        // Recurring monthly impact spread per-day over a duration (the Scenario
        // Planner models "₹X/month for D months").
        const durDays = num(p.durationDays, 30);
        const perDay = monthly / 30;
        for (let t = Math.max(0, i); t < Math.min(horizon, i + durDays); t++) delta[t] += perDay;
      } else if (i < horizon) {
        delta[i] += num(p.amount); // one-time
      }
    }
  }
  return delta;
}

// ── STEP 7 - Monte-Carlo simulation ──────────────────────────────────────────
export function simulatePaths(
  startBal: number, ledger: DayLedger[], model: ResidualModel, draws: CollectionDraw[],
  scenarioDelta: number[], revenueFactor: number, rng: () => number, n: number, horizon: number, today: Date,
): Float64Array {
  const g = gaussian(rng);
  // precompute seasonal factor per day index
  const inF = new Float64Array(horizon), outF = new Float64Array(horizon);
  for (let t = 0; t < horizon; t++) {
    const d = addDays(today, t + 1);
    const seas = model.dowFactor[d.getDay()] * model.domFactor[d.getDate() - 1] * model.monFactor[d.getMonth()] * (1 + model.driftMonthly) ** (t / 30);
    inF[t] = model.baseDailyInflow * seas * revenueFactor;
    outF[t] = model.baseDailyOutflow * seas;
  }
  const detNet = new Float64Array(horizon);
  for (let t = 0; t < horizon; t++) detNet[t] = ledger[t].deterministicNet + scenarioDelta[t];
  const sIn = model.sigmaLogInflow, sOut = model.sigmaLogOutflow;
  const balances = new Float64Array(n * horizon);
  const invDay = new Float64Array(horizon);
  for (let s = 0; s < n; s++) {
    invDay.fill(0);
    // sample each invoice's collection day once per path (fixed order → deterministic)
    for (let k = 0; k < draws.length; k++) {
      const dr = draws[k];
      const day = Math.round(dr.meanCollectDay + g() * dr.sdCollectDay);
      const hit = rng() < dr.collectProb;
      if (hit && day >= 0 && day < horizon) invDay[day] += dr.amount * revenueFactor;
    }
    let bal = startBal;
    const base = s * horizon;
    for (let t = 0; t < horizon; t++) {
      bal += detNet[t];
      bal += inF[t] * Math.exp(g() * sIn - 0.5 * sIn * sIn);
      bal -= outF[t] * Math.exp(g() * sOut - 0.5 * sOut * sOut);
      bal += invDay[t];
      balances[base + t] = bal;
    }
  }
  return balances;
}

// ── STEP 8 + 9 - Bands & risk metrics from the N×H matrix ────────────────────
function bandsFromMatrix(balances: Float64Array, n: number, horizon: number, today: Date): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  const col = new Float64Array(n);
  for (let t = 0; t < horizon; t++) {
    for (let s = 0; s < n; s++) col[s] = balances[s * horizon + t];
    const sorted = Float64Array.prototype.slice.call(col).sort((a, b) => a - b);
    points.push({
      date: iso(addDays(today, t + 1)),
      p10: Math.round(quantileSorted(sorted, 0.10)),
      p50: Math.round(quantileSorted(sorted, 0.50)),
      p90: Math.round(quantileSorted(sorted, 0.90)),
    });
  }
  return points;
}

export function computeRisk(balances: Float64Array, points: ForecastPoint[], startBal: number, thresholdCash: number, n: number, horizon: number): CashFlowRisk {
  const minBal = new Float64Array(n);
  const firstBreach: number[] = [];
  const breachByDay = new Array(horizon).fill(0);
  for (let s = 0; s < n; s++) {
    const base = s * horizon; let mn = Infinity; let fb = -1;
    for (let t = 0; t < horizon; t++) {
      const b = balances[base + t];
      if (b < mn) mn = b;
      if (fb < 0 && b < thresholdCash) fb = t;
    }
    minBal[s] = mn;
    if (fb >= 0) { firstBreach.push(fb); for (let t = fb; t < horizon; t++) breachByDay[t]++; }
  }
  const minSorted = Float64Array.prototype.slice.call(minBal).sort((a, b) => a - b);
  const probBreachByDay = breachByDay.map(c => c / n);
  const probBreach = firstBreach.length / n;
  const fbSorted = [...firstBreach].sort((a, b) => a - b);
  const breachMins = Array.from(minBal).filter(m => m < thresholdCash);
  const bandCross = (key: "p10" | "p50" | "p90") => { const i = points.findIndex(p => p[key] < thresholdCash); return i < 0 ? horizon : i; };
  return {
    thresholdCash: Math.round(thresholdCash),
    cfar95: Math.round(startBal - quantileSorted(minSorted, 0.05)),
    minBalanceP10: Math.round(quantileSorted(minSorted, 0.10)),
    probBreach,
    probBreachByDay,
    expectedTimeToBreachDays: firstBreach.length ? Math.round(mean(firstBreach)) : null,
    p10TimeToBreachDays: fbSorted.length ? Math.round(quantileSorted(fbSorted, 0.10)) : null,
    expectedShortfall: Math.round(breachMins.length ? mean(breachMins) : thresholdCash),
    pressureDayP10: (() => { const i = points.findIndex(p => p.p10 < 0); return i < 0 ? null : i; })(),
    runwayDist: { p10: bandCross("p10"), p50: bandCross("p50"), p90: bandCross("p90") },
  };
}

// ── STEP 10 - Stress tests (deterministic, off the median path) ──────────────
export function runStressTests(basePoints: ForecastPoint[], store: AppStore, draws: CollectionDraw[], thresholdCash: number, today: Date): StressResult[] {
  const snap = computeFinancialSnapshot(store, today);
  const H = basePoints.length;
  const baseP50 = basePoints.map(p => p.p50);
  const minCashBase = Math.min(...baseP50);
  const dailyRev = snap.monthlyRevenue / 30;
  const profiles = customerPaymentProfiles(store, today);
  const topCust = profiles[0]?.customer;

  const build = (id: StressId, label: string, shocked: number[]): StressResult => {
    const minCashStressed = Math.min(...shocked);
    let worstT = 0, worstDev = Infinity;
    for (let t = 0; t < H; t++) { const dev = shocked[t] - baseP50[t]; if (dev < worstDev) { worstDev = dev; worstT = t; } }
    return {
      id, label,
      minCashBase: Math.round(minCashBase), minCashStressed: Math.round(minCashStressed),
      cashImpactAtTrough: Math.round(minCashBase - minCashStressed),
      endCashDelta: Math.round(shocked[H - 1] - baseP50[H - 1]),
      worstDay: basePoints[worstT].date, breaches: shocked.some(v => v < thresholdCash),
    };
  };

  // revenue −20%: subtract cumulative 20% of daily revenue run-rate
  const revDown = baseP50.map((v, t) => v - 0.20 * dailyRev * (t + 1));
  // AR slip +15d: lose the receipts that would have landed in the first 15 days (cumulative, capped)
  const slipByDay = new Array(H).fill(0);
  for (const dr of draws) { const d = Math.round(dr.meanCollectDay); if (d < H) slipByDay[d] += dr.amount * dr.collectProb; }
  let slipCum = 0; const arSlip = baseP50.map((v, t) => { slipCum += t < 15 ? slipByDay[t] : 0; return v - Math.min(slipCum, slipByDay.slice(0, 15).reduce((a, b) => a + b, 0)); });
  // lose top customer: remove their draws + their share of run-rate
  const topShare = (snap.topCustomerPct || 0) / 100;
  const topByDay = new Array(H).fill(0);
  for (const dr of draws) if (dr.customer === topCust) { const d = Math.round(dr.meanCollectDay); if (d < H) topByDay[d] += dr.amount * dr.collectProb; }
  let topCum = 0; const loseTop = baseP50.map((v, t) => { topCum += topByDay[t]; return v - topCum - topShare * dailyRev * (t + 1); });
  // seasonal trough: ~25% lower variable revenue for 30 days
  const trough = baseP50.map((v, t) => v - (t < 30 ? 0.25 * dailyRev * (t + 1) : 0.25 * dailyRev * 30));

  return [
    build("revenue_down_20", "Revenue −20%", revDown),
    build("ar_slip_15d", "Receivables slip +15 days", arSlip),
    build("lose_top_customer", `Lose top customer${topCust ? ` (${topCust})` : ""}`, loseTop),
    build("seasonal_trough", "Seasonal trough (30d)", trough),
  ];
}

// ── STEP 11 - Capital readiness ──────────────────────────────────────────────
function gradeOf(score: number): string {
  if (score >= 90) return "A+"; if (score >= 80) return "A"; if (score >= 70) return "B";
  if (score >= 60) return "C"; if (score >= 45) return "D"; return "E";
}
export function capitalReadiness(store: AppStore, risk: CashFlowRisk, receivables: ReceivablesAnalysis, today: Date): CapitalReadiness {
  const snap = computeFinancialSnapshot(store, today);
  const meanReliability = receivables.profiles.length ? mean(receivables.profiles.map(p => p.reliability)) : 60;
  const meanDefault = receivables.profiles.length ? mean(receivables.profiles.map(p => p.defaultProb)) : 0.1;
  const overdueShare = snap.accountsReceivable > 0 ? snap.overdueReceivable / snap.accountsReceivable : 0;
  const dscr = snap.dscr ?? (snap.debtOutstanding > 0 ? 1 : 3);
  const monthlyRevenue = snap.monthlyRevenue || 1;
  const netSeries = snap.months.map(m => m.net);
  const volatility = mean(netSeries) ? stdev(netSeries) / Math.abs(mean(netSeries)) : 1;

  const comps: ReadinessComponent[] = [
    { key: "collections", label: "Collections quality", weight: 20, score: clamp(meanReliability, 0, 100), detail: `Avg customer reliability ${Math.round(meanReliability)}/100` },
    { key: "dscr", label: "Debt-service coverage", weight: 20, score: clamp(dscr * 40, 0, 100), detail: `DSCR ${dscr.toFixed(2)}×` },
    { key: "runway", label: "Runway buffer", weight: 20, score: clamp(clamp(snap.runwayDays / 180, 0, 1) * 100 - risk.probBreach * 40, 0, 100), detail: `${snap.runwayDays >= 999 ? "cash-flow positive" : snap.runwayDays + "d runway"}, breach risk ${Math.round(risk.probBreach * 100)}%` },
    { key: "leverage", label: "Leverage headroom", weight: 15, score: clamp(100 - (snap.debtOutstanding / (monthlyRevenue * 12 + 1)) * 150, 0, 100), detail: `Debt ${(snap.debtOutstanding / (monthlyRevenue * 12 + 1)).toFixed(2)}× annual revenue` },
    { key: "ar", label: "Receivables quality", weight: 15, score: clamp(100 - overdueShare * 120 - meanDefault * 80, 0, 100), detail: `${Math.round(overdueShare * 100)}% overdue` },
    { key: "growth", label: "Growth stability", weight: 10, score: clamp(50 + (snap.revenueGrowthPct ?? 0) * 4 - volatility * 20, 0, 100), detail: `${snap.revenueGrowthPct?.toFixed(1) ?? "0"}% MoM, volatility ${volatility.toFixed(2)}` },
  ];
  const score = Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / 100);

  // safe draw: serviceable so post-draw DSCR ≥ 1.25 (annualised operating cash above 1.25× current debt service)
  const opCashAnnual = Math.max(0, snap.monthlyNet) * 12 + snap.monthlyDebtService * 12;
  const maxPrudentDraw = Math.max(0, Math.round((opCashAnnual / 1.25 - snap.monthlyDebtService * 12)));
  const arDraw = Math.round(snap.accountsReceivable * 0.8);

  let track: CapitalTrack = "not_fundable_yet"; let rationale = "";
  if (score < 35 || (snap.runwayDays < 30 && snap.accountsReceivable === 0)) { track = "not_fundable_yet"; rationale = "Stabilise cash and collections before raising - runway and score are too thin to service new capital."; }
  else if (snap.accountsReceivable > 0 && overdueShare < 0.4) { track = "invoice_discounting"; rationale = `Strong, mostly-current receivables (₹${Math.round(snap.accountsReceivable / 1e5)}L) make invoice discounting the cheapest, fastest unlock.`; }
  else if (dscr >= 1.25 && score >= 60) { track = "working_capital_loan"; rationale = `DSCR ${dscr.toFixed(2)}× comfortably covers a term facility; use it for planned working-capital needs.`; }
  else if ((snap.revenueGrowthPct ?? 0) > 0 && dscr >= 1.0) { track = "overdraft_line"; rationale = "A revolving overdraft fits - draw only against the forecast dips, pay interest on usage."; }
  else if (dscr < 1.0 && (snap.revenueGrowthPct ?? 0) > 3) { track = "revenue_based_financing"; rationale = "Tight coverage but strong growth → revenue-based financing flexes repayment with your sales."; }
  else if (score >= 70) { track = "equity_raise"; rationale = "Healthy fundamentals and low leverage - an equity raise can fund a step-change without debt strain."; }
  else { track = "overdraft_line"; rationale = "A modest overdraft line is the safest incremental option at this profile."; }

  const fitConfidence = clamp01(1 - (receivables.profiles.length === 0 ? 0.4 : 0) - meanDefault * 0.3);
  return {
    score: clamp(score, 0, 100), grade: gradeOf(score), components: comps,
    recommendedTrack: track, rationale,
    maxPrudentDraw: track === "invoice_discounting" ? Math.min(arDraw, Math.max(arDraw, maxPrudentDraw)) : maxPrudentDraw,
    fitConfidence,
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
export function runForecast(store: AppStore, cfg: ForecastConfig = {}, today = new Date()): ForecastResult {
  const H = cfg.horizonDays ?? 90;
  const N = cfg.numSims ?? 1000;
  const historyDays = cfg.historyDays ?? 540;
  const revenueFactor = cfg.revenueFactor ?? 1;
  const burnFactor = cfg.burnFactor ?? 1;
  const seed = cfg.seed ?? hashStore(store, cfg);
  const rng = makeRng(seed);

  const B0 = (store.bankAccounts ?? []).reduce((s, a) => s + (a.balance || 0), 0);
  const snap = computeFinancialSnapshot(store, today);
  const dailyBurn = snap.monthlyNet < 0 ? -snap.monthlyNet / 30 : Math.max(1, snap.monthlyExpense / 30);
  const thresholdCash = (store.firm?.safetyThresholdDays ?? 14) * dailyBurn;

  const txns = store.transactions ?? [];
  const recurring = detectRecurring(txns, today, historyDays);
  const model = fitResidualModel(txns, recurring, today, historyDays);
  // Apply burn-rate inflation multiplier to outflow before simulation
  const modelWithBurn = burnFactor !== 1
    ? { ...model, baseDailyOutflow: model.baseDailyOutflow * burnFactor }
    : model;
  const ledger = buildLedger(store, recurring, today, H);
  const profiles = customerPaymentProfiles(store, today);
  const draws = projectCollections(store, profiles, today, H);
  const scenarioDelta = scenarioToDailyDelta(cfg.scenarios ?? [], H, today);

  const balances = simulatePaths(B0, ledger, modelWithBurn, draws, scenarioDelta, revenueFactor, rng, N, H, today);
  const points = bandsFromMatrix(balances, N, H, today);
  const risk = computeRisk(balances, points, B0, thresholdCash, N, H);

  const expectedInflowInHorizon = draws.reduce((s, d) => s + (d.meanCollectDay < H ? d.amount * d.collectProb : 0), 0);
  const receivables: ReceivablesAnalysis = { profiles, draws, expectedInflowInHorizon };
  const stresses = runStressTests(points, store, draws, thresholdCash, today);
  const capital = capitalReadiness(store, risk, receivables, today);

  // diagnostics
  const sched30 = ledger.slice(0, 30).reduce((s, d) => s + d.scheduledOutflow, 0);
  const recurringCoveragePct = clamp(100 * sched30 / Math.max(1, sched30 + model.baseDailyOutflow * 30), 0, 100);
  const totalVar = model.residualSigmaDaily ** 2 + model.baseDailyInflow ** 2 * 0.0001 + 1;
  const diagnostics: ForecastDiagnostics = {
    residualSigmaDaily: Math.round(model.residualSigmaDaily),
    driftMonthlyPct: +(model.driftMonthly * 100).toFixed(2),
    recurringCoveragePct: Math.round(recurringCoveragePct),
    collectedInvoiceCount: draws.filter(d => d.meanCollectDay < H).length,
    lowData: txns.filter(t => new Date(t.date) >= addDays(today, -historyDays)).length < 60 || recurring.length === 0,
    forecastability: clamp01(1 - model.residualSigmaDaily ** 2 / totalVar),
    seasonalAdjBurnMonthly: Math.round(snap.monthlyExpense / (model.monFactor[today.getMonth()] || 1)),
  };

  return { points, startBalance: Math.round(B0), recurring, diagnostics, risk, receivables, stresses, capital };
}

/** Back-compat: ForecastPage's localForecast() replacement. */
export function generateForecast(store: AppStore, today = new Date()): ForecastPoint[] {
  return runForecast(store, {}, today).points;
}
