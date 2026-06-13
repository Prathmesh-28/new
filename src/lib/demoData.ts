import type { AppStore, Transaction, Invoice, ActiveLoan, BankAccount, CashObligation } from "@/data/types";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic multi-year demo dataset spanning FY23 → FY28 (Indian FY, Apr–Mar:
// Apr-2022 through Mar-2028). Generates realistic monthly revenue/expense/payroll/
// tax/loan transactions with growth + seasonality, plus invoices, a loan and
// upcoming obligations — enough to light up every statement, chart and forecast.
// ─────────────────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  "Mehta Corp", "Reddy Industries", "Sharma Textiles", "Kapoor Electronics",
  "Gupta Traders", "Singh Distributors", "Patel Exports", "Nair Solutions",
];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.toISOString().split("T")[0];
const addDaysIso = (d: Date, n: number) => iso(new Date(d.getTime() + n * 86400000));

export function generateDemoData(today = new Date()): Partial<AppStore> {
  const txns: Transaction[] = [];
  let seq = 0;
  const accId = "demo-acc-1";
  const mk = (
    date: string, amount: number, description: string,
    category: Transaction["category"], counterparty: string, isRecurring: boolean,
  ): Transaction => ({
    id: `demo-txn-${++seq}`, date, amount, description, category, counterparty, isRecurring, bankAccountId: accId,
  });

  const START_ABS = 2022 * 12 + 3; // April 2022 (months since year 0)
  const MONTHS = 72;               // 6 financial years → Mar 2028
  for (let i = 0; i < MONTHS; i++) {
    const abs = START_ABS + i;
    const year = Math.floor(abs / 12);
    const m0 = abs % 12;
    const ym = `${year}-${pad(m0 + 1)}`;
    const seasonal = 1 + 0.18 * Math.sin((2 * Math.PI * m0) / 12 - 1);
    const growth = Math.pow(1.022, i);            // ~2.2% compounding monthly
    const baseRev = 850000 * growth * seasonal;

    const c1 = CUSTOMERS[i % CUSTOMERS.length];
    const c2 = CUSTOMERS[(i + 3) % CUSTOMERS.length];
    txns.push(mk(`${ym}-08`, Math.round(baseRev * 0.6),  `Payment received — ${c1}`, "revenue", c1, true));
    txns.push(mk(`${ym}-21`, Math.round(baseRev * 0.4),  `Payment received — ${c2}`, "revenue", c2, false));
    txns.push(mk(`${ym}-28`, -Math.round(baseRev * 0.34), "Monthly payroll", "payroll", "Team Payroll", true));
    txns.push(mk(`${ym}-05`, -120000,                     "Office rent", "expense", "Office Landlord", true));
    txns.push(mk(`${ym}-12`, -Math.round(38000 * growth), "Software & cloud (AWS, Google)", "expense", "AWS India", true));
    txns.push(mk(`${ym}-15`, -Math.round(baseRev * 0.07), "Digital marketing", "expense", "Meta Ads", false));
    txns.push(mk(`${ym}-18`, -Math.round(22000 + i * 120),"Electricity & internet", "expense", "BESCOM / Airtel", true));
    txns.push(mk(`${ym}-20`, -Math.round(baseRev * 0.6 * 0.18 * 0.4), "GST payment (GSTR-3B)", "tax", "GST Portal", false));
    if (i >= 12) txns.push(mk(`${ym}-10`, -65000, "Loan EMI — working capital", "loan", "HDFC Bank", true));
  }
  // One-time loan disbursal at start of FY24
  txns.push(mk("2023-04-10", 2000000, "Working capital loan disbursed", "loan", "HDFC Bank", false));

  const bankAccounts: BankAccount[] = [
    { id: "demo-acc-1", name: "HDFC Current A/C",      provider: "HDFC Bank",      balance: 4280000, lastSync: today.toISOString(), status: "connected" },
    { id: "demo-acc-2", name: "ICICI Savings",         provider: "ICICI Bank",     balance: 1820000, lastSync: today.toISOString(), status: "connected" },
    { id: "demo-acc-3", name: "Razorpay Settlement",   provider: "Razorpay",       balance: 640000,  lastSync: today.toISOString(), status: "connected" },
  ];

  // Recent invoices: mix of paid / pending / overdue around today
  const invoices: Invoice[] = Array.from({ length: 12 }, (_, k) => {
    const issued = new Date(today.getTime() - (k * 6 + 4) * 86400000);
    const dueDate = addDaysIso(issued, 30);
    const overdue = dueDate < iso(today);
    const status: Invoice["status"] = k % 3 === 0 ? "paid" : overdue ? "overdue" : "pending";
    return {
      id: `demo-inv-${k + 1}`,
      customer: CUSTOMERS[k % CUSTOMERS.length],
      amount: 150000 + k * 42000,
      invoiceNumber: `INV-26${pad(k + 1)}`,
      invoiceDate: iso(issued),
      dueDate,
      description: "Professional services rendered",
      status,
    };
  });

  const activeLoans: ActiveLoan[] = [{
    id: "demo-loan-1", lender: "HDFC Bank", principal: 2000000, outstanding: 1180000,
    rate: 14, termMonths: 36, monthlyEmi: 65000, startDate: "2023-04-10",
    nextPaymentDate: addDaysIso(today, 12), nextPaymentAmount: 65000,
  }];

  const obligations: CashObligation[] = [
    { id: "demo-obl-1", name: "GST payment (GSTR-3B)", amount: 185000, dueDate: addDaysIso(today, 7),  type: "tax" },
    { id: "demo-obl-2", name: "Advance tax — Q instalment", amount: 320000, dueDate: addDaysIso(today, 24), type: "tax" },
    { id: "demo-obl-3", name: "Monthly payroll", amount: 410000, dueDate: addDaysIso(today, 15), type: "payroll" },
    { id: "demo-obl-4", name: "Loan EMI", amount: 65000, dueDate: addDaysIso(today, 12), type: "loan" },
  ];

  return {
    firm: {
      name: "Acme Manufacturing Co",
      legalName: "Acme Manufacturing Pvt. Ltd.",
      industry: "Manufacturing",
      foundedYear: 2021,
      safetyThresholdDays: 21,
      gstRegistered: true,
      gstNumber: "29ABCDE1234F1Z5",
      gstRate: 18,
    },
    bankAccounts,
    transactions: txns,
    invoices,
    activeLoans,
    obligations,
  };
}
