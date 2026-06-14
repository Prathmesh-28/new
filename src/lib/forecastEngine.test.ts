import { describe, it, expect } from "vitest";
import { runForecast, detectRecurring, hashStore } from "@/lib/forecastEngine";
import { generateDemoData } from "@/lib/demoData";
import { defaultConfig } from "@/data/defaultConfig";
import type { AppStore, Scenario } from "@/data/types";

const TODAY = new Date("2026-06-14T00:00:00Z");
const store: AppStore = { ...defaultConfig, ...generateDemoData(TODAY) } as AppStore;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const allFinite = (xs: number[]) => xs.every(Number.isFinite);

describe("forecastEngine", () => {
  it("is deterministic — same store+today → identical output", () => {
    const a = runForecast(store, {}, TODAY);
    const b = runForecast(store, {}, TODAY);
    expect(JSON.stringify(a.points)).toBe(JSON.stringify(b.points));
    expect(JSON.stringify(a.risk)).toBe(JSON.stringify(b.risk));
    expect(a.capital.score).toBe(b.capital.score);
  });

  it("emits 90 daily points with no NaN/Infinity", () => {
    const r = runForecast(store, {}, TODAY);
    expect(r.points).toHaveLength(90);
    expect(allFinite(r.points.flatMap(p => [p.p10, p.p50, p.p90]))).toBe(true);
    expect(allFinite([r.risk.cfar95, r.risk.probBreach, r.risk.expectedShortfall, r.risk.minBalanceP10])).toBe(true);
    expect(allFinite(r.risk.probBreachByDay)).toBe(true);
    expect(Number.isFinite(r.capital.score)).toBe(true);
  });

  it("bands never cross: p10 <= p50 <= p90 every day", () => {
    const r = runForecast(store, {}, TODAY);
    for (const p of r.points) { expect(p.p10).toBeLessThanOrEqual(p.p50); expect(p.p50).toBeLessThanOrEqual(p.p90); }
  });

  it("uncertainty widens with horizon (spread grows)", () => {
    const r = runForecast(store, {}, TODAY);
    const spread = (p: { p10: number; p90: number }) => p.p90 - p.p10;
    expect(spread(r.points[89])).toBeGreaterThanOrEqual(spread(r.points[0]));
  });

  it("probability metrics are well-formed", () => {
    const r = runForecast(store, {}, TODAY);
    expect(r.risk.probBreach).toBeGreaterThanOrEqual(0);
    expect(r.risk.probBreach).toBeLessThanOrEqual(1);
    for (let t = 1; t < r.risk.probBreachByDay.length; t++) {
      expect(r.risk.probBreachByDay[t]).toBeGreaterThanOrEqual(r.risk.probBreachByDay[t - 1]); // monotone hazard
      expect(r.risk.probBreachByDay[t]).toBeLessThanOrEqual(1);
    }
    if (r.risk.probBreach === 0) expect(r.risk.expectedTimeToBreachDays).toBeNull();
  });

  it("detects the recurring rent / payroll / EMI in demo data", () => {
    const rec = detectRecurring(store.transactions, TODAY, 540);
    const monthly = rec.filter(r => r.cadence === "monthly" && r.confidence >= 0.4);
    expect(monthly.length).toBeGreaterThanOrEqual(2); // rent, payroll, cloud, EMI, etc.
    // at least one large fixed outflow (rent/EMI) with stable amount
    expect(rec.some(r => r.sign === -1 && r.amountCv < 0.15)).toBe(true);
  });

  it("hashStore reacts to cashflow fields, ignores cosmetic ones", () => {
    const base = hashStore(store);
    expect(hashStore({ ...store, firm: { ...store.firm, legalName: "Totally Different Ltd" } })).toBe(base); // cosmetic
    expect(hashStore({ ...store, firm: { ...store.firm, safetyThresholdDays: 99 } })).not.toBe(base); // relevant
    expect(hashStore({ ...store, bankAccounts: store.bankAccounts.map((a, i) => i === 0 ? { ...a, balance: a.balance + 1 } : a) })).not.toBe(base);
  });

  it("scenarios bake into BOTH bands (fixed seed isolates the delta)", () => {
    const SEED = 12345;
    const base = runForecast(store, { seed: SEED }, TODAY);
    const contract: Scenario = { id: "s1", name: "Big contract", type: "contract_won", params: { amount: 5_000_000, startDate: iso(new Date(TODAY.getTime() + 5 * 86400000)) }, active: true, createdAt: iso(TODAY) };
    const withContract = runForecast(store, { seed: SEED, scenarios: [contract] }, TODAY);
    expect(withContract.points[89].p50).toBeGreaterThan(base.points[89].p50); // +5M persists

    const hire: Scenario = { id: "s2", name: "Senior hire", type: "new_hire", params: { salary: 200000, startDate: iso(new Date(TODAY.getTime() + 5 * 86400000)) }, active: true, createdAt: iso(TODAY) };
    const withHire = runForecast(store, { seed: SEED, scenarios: [hire] }, TODAY);
    expect(withHire.points[89].p50).toBeLessThan(base.points[89].p50); // payroll drains

    // slow month lowers BOTH p10 and p90 (fixes the old asymmetric-band bug)
    const slow = runForecast(store, { seed: SEED, revenueFactor: 0.5 }, TODAY);
    expect(slow.points[89].p10).toBeLessThan(base.points[89].p10);
    expect(slow.points[89].p90).toBeLessThan(base.points[89].p90);
  });

  it("capital readiness is sane", () => {
    const { capital } = runForecast(store, {}, TODAY);
    expect(capital.score).toBeGreaterThanOrEqual(0);
    expect(capital.score).toBeLessThanOrEqual(100);
    expect(capital.maxPrudentDraw).toBeGreaterThanOrEqual(0);
    expect(["invoice_discounting", "working_capital_loan", "overdraft_line", "revenue_based_financing", "equity_raise", "not_fundable_yet"]).toContain(capital.recommendedTrack);
  });

  it("receivables: collectible never exceeds open invoice total", () => {
    const r = runForecast(store, {}, TODAY);
    const openTotal = store.invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
    expect(r.receivables.expectedInflowInHorizon).toBeLessThanOrEqual(openTotal + 1);
    for (const d of r.receivables.draws) { expect(d.meanCollectDay).toBeGreaterThanOrEqual(0); expect(d.collectProb).toBeGreaterThan(0.39); expect(d.collectProb).toBeLessThanOrEqual(1); }
  });

  it("runs 90d × 1000 sims in <80ms", () => {
    const t0 = performance.now();
    runForecast(store, { numSims: 1000, horizonDays: 90 }, TODAY);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(80);
  });

  it("a custom recurring-expense scenario lowers the projected balance (Scenario Planner)", () => {
    const base = runForecast(store, { horizonDays: 120, numSims: 500, seed: 7 }, TODAY);
    const drain: Scenario = {
      id: "s1", name: "Big recurring cost", type: "custom", active: true, createdAt: iso(TODAY),
      params: { monthlyAmount: -300000, startDate: iso(TODAY), durationDays: 120 },
    };
    const withScenario = runForecast(store, { horizonDays: 120, numSims: 500, seed: 7, scenarios: [drain] }, TODAY);
    const baseEnd = base.points[base.points.length - 1].p50;
    const scenEnd = withScenario.points[withScenario.points.length - 1].p50;
    expect(scenEnd).toBeLessThan(baseEnd);
    expect(allFinite(withScenario.points.map(p => p.p50))).toBe(true);
  });
});
