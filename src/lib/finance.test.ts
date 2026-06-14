import { describe, it, expect } from "vitest";
import {
  emi, amortizationSchedule, totalInterest, prepaymentImpact, npv, irr,
  earlyPayAnnualizedReturn, effectiveAnnualRate, monthlyAggregates, cmgr,
  dso, agingBuckets, hhi, gstSummary, advanceTaxSchedule, gstLatePenalty,
  dcfValuation, dilution, financingOptions, computeFinancialSnapshot,
  paymentTermsSuggestions,
} from "./finance";
import { defaultConfig } from "@/data/defaultConfig";
import type { AppStore, Invoice, Transaction } from "@/data/types";

describe("loan math", () => {
  it("computes the standard EMI", () => {
    // ₹10L @ 12% for 12 months → ₹88,849 (textbook value)
    expect(emi(1_000_000, 12, 12)).toBeCloseTo(88_849, 0);
  });

  it("zero-rate EMI is straight-line", () => {
    expect(emi(120_000, 0, 12)).toBe(10_000);
  });

  it("amortization schedule fully repays principal and matches EMI", () => {
    const rows = amortizationSchedule(500_000, 18, 24);
    expect(rows).toHaveLength(24);
    expect(rows[23].closing).toBeCloseTo(0, 1);
    const principalSum = rows.reduce((s, r) => s + r.principal, 0);
    expect(principalSum).toBeCloseTo(500_000, 0);
    expect(rows[0].payment).toBeCloseTo(emi(500_000, 18, 24), 2);
  });

  it("interest declines over the schedule", () => {
    const rows = amortizationSchedule(500_000, 18, 24);
    expect(rows[0].interest).toBeGreaterThan(rows[23].interest);
  });

  it("prepayment saves interest and shortens term", () => {
    const r = prepaymentImpact(1_000_000, 14, 36, 200_000);
    expect(r.interestSaved).toBeGreaterThan(0);
    expect(r.monthsSaved).toBeGreaterThan(0);
    expect(r.newTermMonths).toBeLessThan(36);
  });

  it("full prepayment wipes out all interest", () => {
    const base = totalInterest(300_000, 15, 12);
    const r = prepaymentImpact(300_000, 15, 12, 300_000);
    expect(r.interestSaved).toBeCloseTo(base, 2);
    expect(r.newTermMonths).toBe(0);
  });
});

describe("time value", () => {
  it("NPV at 0% is the plain sum", () => {
    expect(npv(0, [-100, 60, 60])).toBeCloseTo(20, 6);
  });

  it("IRR recovers the rate of a fair loan", () => {
    // Lend 100, receive 12 monthly payments of EMI(100, 12%, 12) → IRR ≈ 12% annual
    const pay = emi(100_000, 12, 12);
    const rate = irr([-100_000, ...Array(12).fill(pay)]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(12, 0);
  });

  it("IRR returns null without a sign change", () => {
    expect(irr([100, 100])).toBeNull();
  });

  it("2/10 net 30 annualizes to ~37%", () => {
    expect(earlyPayAnnualizedReturn(2, 20)).toBeCloseTo(37.2, 0);
  });

  it("EAR exceeds nominal rate", () => {
    expect(effectiveAnnualRate(18, 12)).toBeGreaterThan(18);
  });
});

describe("working capital", () => {
  const today = new Date("2026-06-11");

  it("DSO scales with open receivables", () => {
    const invoices = [
      { id: "1", customer: "A", amount: 90_000, invoiceDate: "2026-05-01", dueDate: "2026-05-31", description: "", status: "pending" as const },
      { id: "2", customer: "B", amount: 90_000, invoiceDate: "2026-05-15", dueDate: "2026-06-14", description: "", status: "paid" as const },
    ];
    // open 90k, 90d sales 180k → daily 2k → DSO 45
    expect(dso(invoices, today)).toBe(45);
  });

  it("aging buckets classify overdue invoices", () => {
    const buckets = agingBuckets([
      { id: "1", customer: "A", amount: 100, invoiceDate: "2026-06-01", dueDate: "2026-07-01", description: "", status: "pending" },
      { id: "2", customer: "B", amount: 200, invoiceDate: "2026-04-01", dueDate: "2026-05-22", description: "", status: "overdue" },
      { id: "3", customer: "C", amount: 300, invoiceDate: "2026-01-01", dueDate: "2026-02-01", description: "", status: "overdue" },
    ], today);
    expect(buckets[0].amount).toBe(100); // not due
    expect(buckets[1].amount).toBe(200); // 20 days late
    expect(buckets[4].amount).toBe(300); // 90+ days
  });

  it("HHI is 10000 for a single customer and lower when diversified", () => {
    expect(hhi([100])).toBe(10_000);
    expect(hhi([25, 25, 25, 25])).toBe(2_500);
  });
});

describe("Indian tax", () => {
  it("GST nets output tax against input credit", () => {
    const txns = [
      { id: "1", date: "2026-06-05", amount: 118_000, description: "", category: "revenue" as const, counterparty: "X", isRecurring: false, bankAccountId: "b" },
      { id: "2", date: "2026-06-07", amount: -59_000, description: "", category: "expense" as const, counterparty: "Y", isRecurring: false, bankAccountId: "b" },
    ];
    const g = gstSummary(txns, 18, "2026-06");
    expect(g.outputTax).toBe(18_000);
    expect(g.inputCredit).toBe(9_000);
    expect(g.netPayable).toBe(9_000);
  });

  it("advance tax follows the 15/45/75/100 schedule", () => {
    const sched = advanceTaxSchedule(1_000_000, new Date("2026-06-11"), 25);
    expect(sched.map(s => s.cumulativePct)).toEqual([15, 45, 75, 100]);
    expect(sched[3].cumulativeTax).toBe(250_000);
    expect(sched.reduce((s, x) => s + x.installment, 0)).toBe(250_000);
  });

  it("late GST filing accrues fee and interest", () => {
    const p = gstLatePenalty(100_000, 30);
    expect(p.lateFee).toBe(1_500);
    expect(p.interest).toBeCloseTo(1_479, 0);
  });
});

describe("valuation", () => {
  it("DCF enterprise value is positive and includes terminal value", () => {
    const d = dcfValuation({ baseAnnualFcf: 1_000_000, growthPct: 20, discountPct: 22 });
    expect(d.years).toHaveLength(5);
    expect(d.enterpriseValue).toBeGreaterThan(0);
    expect(d.enterpriseValue).toBeGreaterThan(d.terminalPv);
  });

  it("dilution splits post-money correctly", () => {
    const d = dilution(40_000_000, 10_000_000);
    expect(d.postMoney).toBe(50_000_000);
    expect(d.investorPct).toBe(20);
    expect(d.founderRetainedPct).toBe(80);
  });
});

describe("financing options", () => {
  it("returns nothing when there is no gap", () => {
    expect(financingOptions(0, 0)).toEqual([]);
  });

  it("is sorted by effective annual cost and skips invoice discounting without AR", () => {
    const opts = financingOptions(1_000_000, 0);
    expect(opts.find(o => o.key === "invoice_discounting")).toBeUndefined();
    for (let i = 1; i < opts.length; i++) {
      expect(opts[i].effectiveAnnualCostPct).toBeGreaterThanOrEqual(opts[i - 1].effectiveAnnualCostPct);
    }
  });
});

describe("computeFinancialSnapshot", () => {
  it("handles a completely empty store", () => {
    const snap = computeFinancialSnapshot(defaultConfig);
    expect(snap.health.score).toBe(0);
    expect(snap.runwayDays).toBe(999);
    expect(snap.cccDays).toBe(0);
    expect(snap.debtOutstanding).toBe(0);
  });

  it("derives cross-module metrics from a populated store", () => {
    const today = new Date("2026-06-11");
    const monthKey = "2026-06";
    const store: AppStore = {
      ...defaultConfig,
      bankAccounts: [{ id: "b1", name: "HDFC", provider: "hdfc", balance: 2_000_000, lastSync: "", status: "connected" }],
      transactions: [
        { id: "t1", date: `${monthKey}-01`, amount: 500_000, description: "Sales", category: "revenue", counterparty: "Acme", isRecurring: false, bankAccountId: "b1" },
        { id: "t2", date: `${monthKey}-02`, amount: -300_000, description: "Rent", category: "expense", counterparty: "Lessor", isRecurring: true, bankAccountId: "b1" },
      ],
      invoices: [{ id: "i1", customer: "Acme", amount: 250_000, invoiceDate: "2026-05-20", dueDate: "2026-06-01", description: "", status: "overdue" }],
      activeLoans: [{ id: "l1", lender: "Bank", principal: 1_000_000, outstanding: 600_000, rate: 14, termMonths: 36, monthlyEmi: 34_000, startDate: "2025-01-01", nextPaymentDate: "2026-07-01", nextPaymentAmount: 34_000 }],
    };
    const snap = computeFinancialSnapshot(store, today);
    expect(snap.cash).toBe(2_000_000);
    expect(snap.accountsReceivable).toBe(250_000);
    expect(snap.overdueReceivable).toBe(250_000);
    expect(snap.debtOutstanding).toBe(600_000);
    expect(snap.monthlyDebtService).toBe(34_000);
    expect(snap.dscr).not.toBeNull();
    expect(snap.health.score).toBeGreaterThan(0);
    expect(snap.health.score).toBeLessThanOrEqual(100);
    expect(snap.health.components.reduce((s, c) => s + c.weight, 0)).toBe(100);
    expect(snap.gstThisMonth.netPayable).toBeGreaterThan(0);
  });
});

describe("payment-terms negotiator", () => {
  const recent = (daysAgo: number) => {
    const d = new Date(); d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split("T")[0];
  };
  const inv = (id: string, customer: string, amount: number, dueDaysAgo: number): Invoice => ({
    id, customer, amount, invoiceDate: recent(dueDaysAgo + 30), dueDate: recent(dueDaysAgo),
    description: "", status: dueDaysAgo > 0 ? "overdue" : "pending",
  });
  const txn = (id: string, counterparty: string, amount: number, daysAgo: number): Transaction => ({
    id, date: recent(daysAgo), amount, description: counterparty, category: "expense",
    counterparty, isRecurring: false, bankAccountId: "b1",
  });

  it("suggests pulling in a large overdue customer and freeing a big vendor", () => {
    const store: AppStore = {
      ...defaultConfig,
      invoices: [inv("i1", "Big Customer", 500_000, 40), inv("i2", "Small", 5_000, 2)],
      transactions: [txn("t1", "Major Vendor", -150_000, 10), txn("t2", "Major Vendor", -150_000, 40)],
    };
    const s = paymentTermsSuggestions(store);
    const cust = s.find(x => x.party === "Big Customer");
    const vend = s.find(x => x.party === "Major Vendor");
    expect(cust?.side).toBe("customer");
    expect(cust?.cashImpact).toBe(500_000);
    expect(vend?.side).toBe("vendor");
    expect(vend!.cashImpact).toBeGreaterThan(0);
  });

  it("ignores trivial vendors and returns nothing on an empty store", () => {
    expect(paymentTermsSuggestions(defaultConfig)).toHaveLength(0);
    const tiny: AppStore = { ...defaultConfig, transactions: [txn("t1", "Tiny", -1000, 5)] };
    expect(paymentTermsSuggestions(tiny).some(x => x.side === "vendor")).toBe(false);
  });
});
