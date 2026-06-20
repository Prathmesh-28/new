import type {
  AppStore, Transaction, Invoice, ActiveLoan, BankAccount, CashObligation, FixedAsset,
  Alert, Scenario, CreditApplication, CreditOffer, CapitalRaise, CapitalInvestment,
  BankConnector, Order, InventoryItem, ProcurementOrder, Budget,
} from "@/data/types";
import { DEMO_FEATURE_DATA } from "./demoFeatureData";

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

  // A small fixed-asset register so the P&L shows real depreciation and the
  // balance sheet shows net fixed assets from day one.
  const y = today.getFullYear();
  const fixedAssets: FixedAsset[] = [
    { id: "demo-fa-1", name: "CNC milling machine", category: "Plant & Machinery", cost: 2_800_000, purchaseDate: `${y - 2}-05-12`, usefulLifeYears: 15, method: "wdv", salvageValue: 140000 },
    { id: "demo-fa-2", name: "Delivery van (Tata Ace)", category: "Vehicles", cost: 850_000, purchaseDate: `${y - 1}-08-03`, usefulLifeYears: 8, method: "wdv", salvageValue: 85000 },
    { id: "demo-fa-3", name: "Workstations & laptops (x12)", category: "Computers & IT", cost: 960_000, purchaseDate: `${y - 1}-01-20`, usefulLifeYears: 3, method: "straight_line", salvageValue: 0 },
    { id: "demo-fa-4", name: "Factory furniture & fittings", category: "Furniture & Fixtures", cost: 540_000, purchaseDate: `${y - 3}-11-01`, usefulLifeYears: 10, method: "straight_line", salvageValue: 54000 },
  ];

  // ── Alerts: mixed severity, deterministic, anchored around today ──────────────
  const alerts: Alert[] = [
    { id: "demo-alert-1", type: "low_cash", severity: "critical", title: "Cash runway under 3 weeks",
      message: "Projected balance dips to ₹2.1L on " + addDaysIso(today, 18) + " — below your 21-day safety buffer.",
      isRead: false, createdAt: addDaysIso(today, -1) },
    { id: "demo-alert-2", type: "overdue", severity: "high", title: "₹4.6L in overdue invoices",
      message: "Sharma Textiles and Gupta Traders are past due. Send a WhatsApp reminder ladder.",
      isRead: false, createdAt: addDaysIso(today, -2) },
    { id: "demo-alert-3", type: "gst_due", severity: "high", title: "GSTR-3B due in 7 days",
      message: "GST liability of ₹1.85L for the month is due on " + addDaysIso(today, 7) + ".",
      isRead: false, createdAt: addDaysIso(today, -3) },
    { id: "demo-alert-4", type: "credit_offer", severity: "medium", title: "New credit offer from Lendingkart",
      message: "Pre-approved ₹15L working-capital line at 15.5% based on your cash flows.",
      isRead: true, actionTaken: "viewed", createdAt: addDaysIso(today, -5) },
    { id: "demo-alert-5", type: "anomaly", severity: "medium", title: "Marketing spend up 38% MoM",
      message: "Meta Ads spend jumped to ₹84K this month vs ₹61K average. Review campaign performance.",
      isRead: true, createdAt: addDaysIso(today, -8) },
    { id: "demo-alert-6", type: "payroll", severity: "low", title: "Payroll run scheduled",
      message: "Monthly payroll of ₹4.1L is scheduled for " + addDaysIso(today, 15) + ".",
      isRead: true, createdAt: addDaysIso(today, -10) },
  ];

  // ── Scenarios: what-if levers (new hire / contract won / loan draw) ───────────
  const scenarios: Scenario[] = [
    { id: "demo-scn-1", name: "Hire 2 senior engineers", type: "new_hire",
      params: { count: 2, monthlySalary: 180000, startDate: addDaysIso(today, 30) }, active: true, createdAt: addDaysIso(today, -14) },
    { id: "demo-scn-2", name: "Win Reddy Industries contract", type: "contract_won",
      params: { monthlyRevenue: 650000, durationMonths: 12, startDate: addDaysIso(today, 21) }, active: false, createdAt: addDaysIso(today, -20) },
    { id: "demo-scn-3", name: "Draw ₹25L term loan", type: "loan_draw",
      params: { amount: 2500000, rate: 13.5, termMonths: 48, drawDate: addDaysIso(today, 45) }, active: false, createdAt: addDaysIso(today, -25) },
  ];

  // ── Credit applications + offers (offers linked to an application) ────────────
  const creditApplications: CreditApplication[] = [
    { id: "demo-capp-1", status: "approved", loanAmount: 1500000, termMonths: 24, purpose: "Working capital — raw material procurement",
      underwritingScore: 742, approvedAmount: 1500000, createdAt: addDaysIso(today, -40), updatedAt: addDaysIso(today, -12) },
    { id: "demo-capp-2", status: "submitted", loanAmount: 2500000, termMonths: 36, purpose: "Capex — new CNC line",
      underwritingScore: 718, approvedAmount: 0, createdAt: addDaysIso(today, -9), updatedAt: addDaysIso(today, -4) },
    { id: "demo-capp-3", status: "draft", loanAmount: 800000, termMonths: 12, purpose: "Invoice discounting facility",
      underwritingScore: 0, approvedAmount: 0, createdAt: addDaysIso(today, -2), updatedAt: addDaysIso(today, -2) },
  ];
  const creditOffers: CreditOffer[] = [
    { id: "demo-coff-1", applicationId: "demo-capp-1", lender: "Lendingkart", amount: 1500000, rate: 15.5, termMonths: 24, status: "accepted" },
    { id: "demo-coff-2", applicationId: "demo-capp-1", lender: "FlexiLoans", amount: 1200000, rate: 16.2, termMonths: 24, status: "declined" },
    { id: "demo-coff-3", applicationId: "demo-capp-2", lender: "Kotak Mahindra Bank", amount: 2200000, rate: 13.9, termMonths: 36, status: "pending" },
  ];

  // ── Capital raises + investments (investments linked to a raise) ──────────────
  const capitalRaises: CapitalRaise[] = [
    { id: "demo-raise-1", track: "rev_share", targetAmount: 5000000, raisedAmount: 3200000, status: "active",
      createdAt: addDaysIso(today, -60), updatedAt: addDaysIso(today, -3) },
    { id: "demo-raise-2", track: "reg_cf", targetAmount: 12000000, raisedAmount: 0, status: "draft",
      createdAt: addDaysIso(today, -7), updatedAt: addDaysIso(today, -7) },
  ];
  const capitalInvestments: CapitalInvestment[] = [
    { id: "demo-inv-cap-1", raiseId: "demo-raise-1", investorEmail: "anand.rao@angelinvestor.in", amount: 1500000, equityPct: 3.0, status: "confirmed", createdAt: addDaysIso(today, -45) },
    { id: "demo-inv-cap-2", raiseId: "demo-raise-1", investorEmail: "priya.menon@venturefund.in", amount: 1000000, equityPct: 2.0, status: "confirmed", createdAt: addDaysIso(today, -30) },
    { id: "demo-inv-cap-3", raiseId: "demo-raise-1", investorEmail: "vikram.shah@familyoffice.in", amount: 700000, equityPct: 1.4, status: "committed", createdAt: addDaysIso(today, -15) },
    { id: "demo-inv-cap-4", raiseId: "demo-raise-1", investorEmail: "deepa.iyer@hnwi.in", amount: 500000, equityPct: 1.0, status: "pending", createdAt: addDaysIso(today, -5) },
  ];

  // ── Connectors: varied providers + statuses ───────────────────────────────────
  const connectors: BankConnector[] = [
    { id: "demo-conn-1", provider: "aa_network", label: "Account Aggregator", accountName: "HDFC Current A/C", status: "connected", lastSync: today.toISOString(), accountCount: 2, consentExpiry: addDaysIso(today, 330) },
    { id: "demo-conn-2", provider: "razorpay", label: "Razorpay Payments", accountName: "Razorpay Settlement", status: "connected", lastSync: addDaysIso(today, -1) + "T06:30:00.000Z", accountCount: 1, consentExpiry: null },
    { id: "demo-conn-3", provider: "tally", label: "Tally Prime", accountName: "Acme Manufacturing Books", status: "pending", lastSync: null, accountCount: 0, consentExpiry: null },
    { id: "demo-conn-4", provider: "zoho_books", label: "Zoho Books", accountName: "Acme Manufacturing Pvt Ltd", status: "error", lastSync: addDaysIso(today, -6) + "T09:15:00.000Z", accountCount: 1, consentExpiry: addDaysIso(today, 120) },
  ];

  // ── Orders: varied source/status, each with line items ────────────────────────
  const orders: Order[] = [
    { id: "demo-ord-1", orderNumber: "ORD-2601", source: "whatsapp", buyerName: "Mehta Corp", buyerPhone: "+919820012345", status: "delivered", totalValue: 285000, notes: "Repeat buyer, net-30 terms",
      items: [{ id: "demo-oi-1", productName: "Steel bracket A1", sku: "SKU-SB-A1", quantity: 500, unitPrice: 420 }, { id: "demo-oi-2", productName: "Mounting kit", sku: "SKU-MK-09", quantity: 250, unitPrice: 300 }],
      createdAt: addDaysIso(today, -28), updatedAt: addDaysIso(today, -20) },
    { id: "demo-ord-2", orderNumber: "ORD-2602", source: "email", buyerName: "Reddy Industries", buyerPhone: "+919845067890", status: "dispatched", totalValue: 540000, notes: "Priority shipment",
      items: [{ id: "demo-oi-3", productName: "CNC machined flange", sku: "SKU-CF-22", quantity: 300, unitPrice: 1800 }],
      createdAt: addDaysIso(today, -14), updatedAt: addDaysIso(today, -2) },
    { id: "demo-ord-3", orderNumber: "ORD-2603", source: "excel", buyerName: "Sharma Textiles", buyerPhone: "+919811122233", status: "processing", totalValue: 168000, notes: "Bulk import order",
      items: [{ id: "demo-oi-4", productName: "Loom spare gear", sku: "SKU-LG-07", quantity: 240, unitPrice: 700 }],
      createdAt: addDaysIso(today, -9), updatedAt: addDaysIso(today, -3) },
    { id: "demo-ord-4", orderNumber: "ORD-2604", source: "manual", buyerName: "Kapoor Electronics", buyerPhone: "+919830044556", status: "confirmed", totalValue: 96000, notes: "",
      items: [{ id: "demo-oi-5", productName: "Aluminium enclosure", sku: "SKU-AE-15", quantity: 120, unitPrice: 800 }],
      createdAt: addDaysIso(today, -6), updatedAt: addDaysIso(today, -5) },
    { id: "demo-ord-5", orderNumber: "ORD-2605", source: "phone", buyerName: "Gupta Traders", buyerPhone: "+919812233445", status: "pending", totalValue: 312000, notes: "Awaiting advance payment",
      items: [{ id: "demo-oi-6", productName: "Steel bracket A1", sku: "SKU-SB-A1", quantity: 400, unitPrice: 420 }, { id: "demo-oi-7", productName: "CNC machined flange", sku: "SKU-CF-22", quantity: 80, unitPrice: 1800 }],
      createdAt: addDaysIso(today, -4), updatedAt: addDaysIso(today, -4) },
    { id: "demo-ord-6", orderNumber: "ORD-2606", source: "whatsapp", buyerName: "Singh Distributors", buyerPhone: "+919876554433", status: "confirmed", totalValue: 144000, notes: "",
      items: [{ id: "demo-oi-8", productName: "Mounting kit", sku: "SKU-MK-09", quantity: 480, unitPrice: 300 }],
      createdAt: addDaysIso(today, -3), updatedAt: addDaysIso(today, -2) },
    { id: "demo-ord-7", orderNumber: "ORD-2607", source: "email", buyerName: "Patel Exports", buyerPhone: "+919900011223", status: "cancelled", totalValue: 210000, notes: "Buyer cancelled — spec mismatch",
      items: [{ id: "demo-oi-9", productName: "Loom spare gear", sku: "SKU-LG-07", quantity: 300, unitPrice: 700 }],
      createdAt: addDaysIso(today, -11), updatedAt: addDaysIso(today, -7) },
    { id: "demo-ord-8", orderNumber: "ORD-2608", source: "manual", buyerName: "Nair Solutions", buyerPhone: "+919745566778", status: "pending", totalValue: 75000, notes: "New customer",
      items: [{ id: "demo-oi-10", productName: "Aluminium enclosure", sku: "SKU-AE-15", quantity: 60, unitPrice: 800 }, { id: "demo-oi-11", productName: "Mounting kit", sku: "SKU-MK-09", quantity: 90, unitPrice: 300 }],
      createdAt: addDaysIso(today, -1), updatedAt: addDaysIso(today, -1) },
  ];

  // ── Inventory ─────────────────────────────────────────────────────────────────
  const inventory: InventoryItem[] = [
    { id: "demo-itm-1", productName: "Steel bracket A1", sku: "SKU-SB-A1", category: "Brackets", quantity: 1850, unit: "pcs", unitCost: 260, reorderLevel: 500, updatedAt: addDaysIso(today, -2) },
    { id: "demo-itm-2", productName: "CNC machined flange", sku: "SKU-CF-22", category: "Machined parts", quantity: 420, unit: "pcs", unitCost: 1150, reorderLevel: 200, updatedAt: addDaysIso(today, -3) },
    { id: "demo-itm-3", productName: "Mounting kit", sku: "SKU-MK-09", category: "Kits", quantity: 140, unit: "pcs", unitCost: 175, reorderLevel: 300, updatedAt: addDaysIso(today, -1) },
    { id: "demo-itm-4", productName: "Loom spare gear", sku: "SKU-LG-07", category: "Spares", quantity: 680, unit: "pcs", unitCost: 410, reorderLevel: 250, updatedAt: addDaysIso(today, -5) },
    { id: "demo-itm-5", productName: "Aluminium enclosure", sku: "SKU-AE-15", category: "Enclosures", quantity: 95, unit: "pcs", unitCost: 520, reorderLevel: 150, updatedAt: addDaysIso(today, -4) },
    { id: "demo-itm-6", productName: "Mild steel sheet 4x8", sku: "SKU-MS-48", category: "Raw material", quantity: 320, unit: "sheets", unitCost: 2400, reorderLevel: 100, updatedAt: addDaysIso(today, -6) },
    { id: "demo-itm-7", productName: "Hex bolt M12", sku: "SKU-HB-M12", category: "Fasteners", quantity: 12400, unit: "pcs", unitCost: 9, reorderLevel: 5000, updatedAt: addDaysIso(today, -2) },
    { id: "demo-itm-8", productName: "Industrial paint (grey)", sku: "SKU-IP-GR", category: "Consumables", quantity: 38, unit: "litres", unitCost: 380, reorderLevel: 60, updatedAt: addDaysIso(today, -7) },
  ];

  // ── Procurement orders ────────────────────────────────────────────────────────
  const procurement: ProcurementOrder[] = [
    { id: "demo-po-1", supplierName: "Jindal Steel Depot", status: "received", totalValue: 768000, expectedDate: addDaysIso(today, -5),
      items: [{ productName: "Mild steel sheet 4x8", sku: "SKU-MS-48", quantity: 320, unitCost: 2400 }], createdAt: addDaysIso(today, -18) },
    { id: "demo-po-2", supplierName: "Bharat Fasteners Pvt Ltd", status: "ordered", totalValue: 90000, expectedDate: addDaysIso(today, 6),
      items: [{ productName: "Hex bolt M12", sku: "SKU-HB-M12", quantity: 10000, unitCost: 9 }], createdAt: addDaysIso(today, -4) },
    { id: "demo-po-3", supplierName: "Asian Paints Industrial", status: "approved", totalValue: 38000, expectedDate: addDaysIso(today, 10),
      items: [{ productName: "Industrial paint (grey)", sku: "SKU-IP-GR", quantity: 100, unitCost: 380 }], createdAt: addDaysIso(today, -3) },
    { id: "demo-po-4", supplierName: "Precision Castings Co", status: "draft", totalValue: 460000, expectedDate: addDaysIso(today, 20),
      items: [{ productName: "CNC machined flange", sku: "SKU-CF-22", quantity: 400, unitCost: 1150 }], createdAt: addDaysIso(today, -1) },
  ];

  // ── Budgets (category caps with chart colors) ─────────────────────────────────
  const budgets: Budget[] = [
    { id: "demo-bud-1", category: "payroll", label: "Payroll", monthlyLimit: 450000, color: "#6366f1" },
    { id: "demo-bud-2", category: "marketing", label: "Marketing", monthlyLimit: 90000, color: "#ec4899" },
    { id: "demo-bud-3", category: "rent", label: "Rent & facilities", monthlyLimit: 130000, color: "#f59e0b" },
    { id: "demo-bud-4", category: "software", label: "Software & cloud", monthlyLimit: 60000, color: "#10b981" },
    { id: "demo-bud-5", category: "utilities", label: "Utilities", monthlyLimit: 35000, color: "#06b6d4" },
    { id: "demo-bud-6", category: "procurement", label: "Raw material", monthlyLimit: 800000, color: "#8b5cf6" },
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
    fixedAssets,
    alerts,
    scenarios,
    creditApplications,
    creditOffers,
    capitalRaises,
    capitalInvestments,
    connectors,
    orders,
    inventory,
    procurement,
    budgets,
    whatsappPreferences: {
      low_cash: true, overdue: true, gst_due: true, credit_offer: true, payroll: true, weekly: true,
    },
    featureData: DEMO_FEATURE_DATA,
  };
}
