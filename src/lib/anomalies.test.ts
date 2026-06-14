import { describe, it, expect } from "vitest";
import { detectAnomalies } from "./anomalies";
import type { Transaction } from "@/data/types";

const NOW = new Date("2026-06-14");
let n = 0;
function tx(date: string, amount: number, counterparty: string, isRecurring = false): Transaction {
  return {
    id: `t${n++}`, date, amount, description: counterparty, category: "expense",
    counterparty, isRecurring, bankAccountId: "b1",
  };
}

describe("detectAnomalies", () => {
  it("flags a duplicate payment (same payee + amount within the window)", () => {
    const txns = [tx("2026-06-10", -50000, "Acme Supplies"), tx("2026-06-12", -50000, "Acme Supplies")];
    const found = detectAnomalies(txns, { now: NOW });
    const dup = found.find(a => a.type === "duplicate");
    expect(dup).toBeTruthy();
    expect(dup!.txnIds).toHaveLength(2);
    expect(dup!.severity).toBe("high");
  });

  it("does NOT flag same-amount payments far apart as duplicates", () => {
    const txns = [tx("2026-01-10", -50000, "Acme"), tx("2026-06-12", -50000, "Acme")];
    expect(detectAnomalies(txns, { now: NOW }).some(a => a.type === "duplicate")).toBe(false);
  });

  it("flags a spike vs the payee's own history", () => {
    const txns = [
      tx("2026-05-01", -10000, "CloudCo"), tx("2026-05-08", -10500, "CloudCo"),
      tx("2026-05-15", -9800, "CloudCo"), tx("2026-05-22", -10200, "CloudCo"),
      tx("2026-06-01", -90000, "CloudCo"),
    ];
    expect(detectAnomalies(txns, { now: NOW }).some(a => a.type === "spike")).toBe(true);
  });

  it("flags subscription creep on a monthly recurring payee", () => {
    const txns = [
      tx("2026-03-01", -20000, "SaaS Inc", true), tx("2026-04-01", -20000, "SaaS Inc", true),
      tx("2026-05-01", -20000, "SaaS Inc", true), tx("2026-06-01", -28000, "SaaS Inc", true),
    ];
    expect(detectAnomalies(txns, { now: NOW }).some(a => a.type === "subscription_creep")).toBe(true);
  });

  it("returns nothing on clean, varied spend", () => {
    const txns = [
      tx("2026-06-01", -10000, "A"), tx("2026-06-02", -3000, "B"), tx("2026-06-03", -7000, "C"),
    ];
    expect(detectAnomalies(txns, { now: NOW })).toHaveLength(0);
  });
});
