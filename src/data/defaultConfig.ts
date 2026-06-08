import type { AppStore } from "./types";

const today = new Date();
const d = (offset: number) => {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().split("T")[0];
};
const ts = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString();

export const defaultConfig: AppStore = {
  firm: {
    name: "Headroom",
    legalName: "Headroom Financial Technologies Pvt. Ltd.",
    industry: "SaaS / Fintech",
    foundedYear: 2023,
  },

  roles: [
    {
      id: "super_admin",
      label: "Super Admin",
      accessibleTabs: ["dashboard", "forecast", "credit", "capital", "admin"],
      visibleTabs:    ["dashboard", "forecast", "credit", "capital", "admin"],
      canExport: true,
      canAddNotes: true,
      namespaces: ["app", "forecast", "credit", "capital"],
    },
    {
      id: "owner",
      label: "Business Owner",
      accessibleTabs: ["dashboard", "forecast", "credit", "capital"],
      visibleTabs:    ["dashboard", "forecast", "credit", "capital"],
      canExport: true,
      canAddNotes: true,
      namespaces: ["app", "forecast", "credit", "capital"],
    },
    {
      id: "accountant",
      label: "Accountant",
      accessibleTabs: ["dashboard", "forecast"],
      visibleTabs:    ["dashboard", "forecast"],
      canExport: true,
      canAddNotes: false,
      namespaces: ["app", "forecast"],
    },
    {
      id: "investor",
      label: "Investor",
      accessibleTabs: ["capital"],
      visibleTabs:    ["capital"],
      canExport: false,
      canAddNotes: false,
      namespaces: ["app", "capital"],
    },
  ],

  bankAccounts: [
    { id: "ba1", name: "HDFC Current Account", provider: "Plaid", balance: 1420000, lastSync: ts(-1), status: "connected" },
    { id: "ba2", name: "ICICI Savings",         provider: "Plaid", balance: 380000,  lastSync: ts(-2), status: "connected" },
    { id: "ba3", name: "Razorpay Escrow",        provider: "Manual", balance: 95000,  lastSync: ts(0),  status: "pending"   },
  ],

  transactions: [
    { id: "t1",  date: d(-1),  amount: 250000,  description: "Client payment – Acme Corp",      category: "revenue",  counterparty: "Acme Corp",       isRecurring: false, bankAccountId: "ba1" },
    { id: "t2",  date: d(-2),  amount: -120000, description: "AWS Infrastructure",               category: "expense",  counterparty: "Amazon Web Services", isRecurring: true, bankAccountId: "ba1" },
    { id: "t3",  date: d(-3),  amount: -85000,  description: "Payroll – October",                category: "payroll",  counterparty: "Razorpay Payroll",   isRecurring: true, bankAccountId: "ba1" },
    { id: "t4",  date: d(-5),  amount: 180000,  description: "Monthly SaaS subscriptions",       category: "revenue",  counterparty: "Stripe",             isRecurring: true, bankAccountId: "ba1" },
    { id: "t5",  date: d(-7),  amount: -42000,  description: "Office rent",                      category: "expense",  counterparty: "Brigade Group",       isRecurring: true, bankAccountId: "ba2" },
    { id: "t6",  date: d(-10), amount: 95000,   description: "Consulting – Beta Corp",           category: "revenue",  counterparty: "Beta Corp",           isRecurring: false, bankAccountId: "ba1" },
    { id: "t7",  date: d(-12), amount: -28000,  description: "Google Workspace + Tools",         category: "expense",  counterparty: "Google",              isRecurring: true, bankAccountId: "ba2" },
    { id: "t8",  date: d(-15), amount: -15000,  description: "GST Payment Q3",                   category: "tax",      counterparty: "Income Tax Dept",     isRecurring: false, bankAccountId: "ba1" },
    { id: "t9",  date: d(-20), amount: 320000,  description: "Enterprise deal – Delta Ltd",      category: "revenue",  counterparty: "Delta Ltd",           isRecurring: false, bankAccountId: "ba1" },
    { id: "t10", date: d(-25), amount: -60000,  description: "Loan EMI – HDFC Business Loan",    category: "loan",     counterparty: "HDFC Bank",           isRecurring: true, bankAccountId: "ba1" },
  ],

  alerts: [
    { id: "al1", type: "cash_runway",    severity: "critical", message: "Cash runway drops below 30 days in 18 days based on current burn rate.", isRead: false, createdAt: ts(-1) },
    { id: "al2", type: "burn_spike",     severity: "high",     message: "Payroll expenses increased 22% month-over-month.",                        isRead: false, createdAt: ts(-2) },
    { id: "al3", type: "revenue_gap",    severity: "medium",   message: "Expected revenue of ₹3.2L not received from Acme Corp — 7 days late.",    isRead: false, createdAt: ts(-3) },
    { id: "al4", type: "low_confidence", severity: "low",      message: "Forecast confidence below 60% beyond day 45 due to variable income.",    isRead: true,  createdAt: ts(-5) },
  ],

  forecast: Array.from({ length: 90 }, (_, i) => {
    const base = 1800000;
    const burn = -1200000 / 30;
    const noise = Math.sin(i * 0.3) * 80000;
    const p50 = base + burn * i + noise;
    return { date: d(i), p10: p50 * 0.85, p50, p90: p50 * 1.15 };
  }),

  scenarios: [
    { id: "sc1", name: "New Sales Hire @ ₹1.2L/mo", type: "new_hire",     params: { salary: 120000, startDate: d(15) }, active: false, createdAt: ts(-5) },
    { id: "sc2", name: "Enterprise Contract Won",    type: "contract_won", params: { amount: 800000, date: d(10), paymentTerms: 30 }, active: true, createdAt: ts(-3) },
  ],

  obligations: [
    { id: "ob1", name: "HDFC Business Loan EMI",  amount: 60000,  dueDate: d(5),  type: "loan"    },
    { id: "ob2", name: "Advance Tax Q3",           amount: 85000,  dueDate: d(15), type: "tax"     },
    { id: "ob3", name: "November Payroll",         amount: 390000, dueDate: d(10), type: "payroll" },
  ],

  creditApplications: [
    {
      id: "ca1", status: "approved", loanAmount: 2000000, termMonths: 24,
      purpose: "Working capital for enterprise sales expansion",
      underwritingScore: 78, approvedAmount: 1800000,
      createdAt: ts(-10), updatedAt: ts(-8),
    },
    {
      id: "ca2", status: "draft", loanAmount: 500000, termMonths: 12,
      purpose: "Equipment purchase",
      underwritingScore: 0, approvedAmount: 0,
      createdAt: ts(-2), updatedAt: ts(-2),
    },
  ],

  creditOffers: [
    { id: "co1", applicationId: "ca1", lender: "Stripe Capital",  amount: 1800000, rate: 14.5, termMonths: 24, status: "pending" },
    { id: "co2", applicationId: "ca1", lender: "OnDeck",          amount: 1500000, rate: 16.0, termMonths: 18, status: "pending" },
    { id: "co3", applicationId: "ca1", lender: "Lendingkart",     amount: 1800000, rate: 15.5, termMonths: 24, status: "pending" },
  ],

  capitalRaises: [
    {
      id: "cr1", track: "reg_cf", targetAmount: 5000000, raisedAmount: 1850000,
      status: "active", createdAt: ts(-30), updatedAt: ts(-1),
    },
  ],

  capitalInvestments: [
    { id: "ci1", raiseId: "cr1", investorEmail: "raj.mehta@vc.in",    amount: 750000,  equityPct: 0.8,  status: "confirmed", createdAt: ts(-20) },
    { id: "ci2", raiseId: "cr1", investorEmail: "priya.k@angels.in",  amount: 500000,  equityPct: 0.55, status: "confirmed", createdAt: ts(-15) },
    { id: "ci3", raiseId: "cr1", investorEmail: "sundar.v@family.in", amount: 350000,  equityPct: 0.38, status: "confirmed", createdAt: ts(-10) },
    { id: "ci4", raiseId: "cr1", investorEmail: "anita.r@invest.in",  amount: 250000,  equityPct: 0.28, status: "pending",   createdAt: ts(-5)  },
  ],
};
