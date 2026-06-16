// ── Auth ──────────────────────────────────────────────────────────────────────
export type UserRole =
  | "super_admin"
  | "owner"
  | "finance_manager"
  | "accountant"
  | "sales"
  | "operations_manager"
  | "viewer"
  | "investor";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenant_id: string;
  first_login: boolean;
  display_name?: string;
  plan?: PlanTier;
}

// ── Subscription plans / entitlements ──────────────────────────────────────────
export type PlanTier = "free" | "starter" | "growth" | "pro";

export const PLAN_RANK: Record<PlanTier, number> = { free: 0, starter: 1, growth: 2, pro: 3 };

export const PLAN_LABEL: Record<PlanTier, string> = { free: "Free", starter: "Starter", growth: "Growth", pro: "Pro" };

// Which plan a module needs, keyed by route slug. Aligned to the marketing plans:
//   Free    — invoicing, GST basics, transactions, dashboard, docs (core daily use)
//   Starter — get-paid-faster: collections + receivables
//   Growth  — payroll, cash forecast, working capital, analytics & AI CFO
//   Pro     — credit/lending, treasury, valuation/cap-table, API/connectors, advanced
// Tabs not listed stay open on every plan (core surfaces + role-landing pages).
// super_admin bypasses ALL gates (see RouteGuard).
export const FEATURE_ENTITLEMENTS: Record<string, PlanTier> = {
  // Starter — "get paid faster"
  collections:  "starter",
  receivables:  "starter",
  // Growth — payroll, cash & intelligence
  payroll:          "growth",
  "working-capital": "growth",
  forecast:         "growth",
  analytics:        "growth",
  "cfo-brief":      "growth",
  predict:          "growth",
  benchmarks:       "growth",
  scenarios:        "growth",
  health:           "growth",
  spend:            "growth",
  // Pro — capital, treasury, multi-entity, API
  credit:       "pro",
  capital:      "pro",
  treasury:     "pro",
  valuation:    "pro",
  "term-sheet": "pro",
  lenders:      "pro",
  investor:     "pro",
  connectors:   "pro",
  automation:   "pro",
  network:      "pro",
  marketplace:  "pro",
  global:       "pro",
  tokens:       "pro",
  frontier:     "pro",
};

// Human-facing pitch for each gated feature — shown on the upsell screen.
export const FEATURE_PITCH: Record<string, { title: string; blurb: string; perks: string[] }> = {
  benchmarks:   { title: "Peer Benchmarks", blurb: "See exactly how your margins, runway, and burn stack up against similar SMBs.", perks: ["Percentiles from your own 12-month history", "Margin, runway, AR-days, payroll & burn", "Spot where you're an outlier — and fix it"] },
  valuation:    { title: "Business Valuation", blurb: "Know what your company is worth before you raise or sell.", perks: ["Revenue & EBITDA multiple models", "Scenario-driven valuation ranges", "Investor-ready summary"] },
  "term-sheet": { title: "Term Sheet Builder", blurb: "Model dilution and build investor-ready term sheets in minutes.", perks: ["Pre/post-money & dilution math", "Multiple round modelling", "Export to PDF for investors"] },
  scenarios:    { title: "Scenario Planning", blurb: "Stress-test hiring, big contracts, and loan draws against your cash.", perks: ["What-if cash forecasting", "Stack multiple scenarios", "See the runway impact instantly"] },
  capital:      { title: "Capital Raising", blurb: "Raise from the people who believe in your business — built into Headroom.", perks: ["Revenue-based financing, angel & SME-IPO tracks", "Live investor portal & cap table", "Compliance handled for you"] },
  collections:  { title: "Collections Suite", blurb: "Get paid faster — automated WhatsApp & UPI reminders that chase every overdue invoice for you.", perks: ["WhatsApp / UPI / email reminder ladders", "DSO & promise-to-pay tracking", "Customer statements in one tap"] },
  receivables:  { title: "Receivables Intelligence", blurb: "See exactly who owes you, who's slipping, and where your cash is stuck.", perks: ["Ageing buckets & overdue heatmap", "Customer risk scoring", "Collection forecast"] },
  payroll:      { title: "Payroll", blurb: "Run compliant Indian payroll — PF, ESI, PT, TDS and payslips — without a separate tool.", perks: ["Full statutory payroll (PF/ESI/PT/TDS)", "Salary slips & Form 16", "Direct salary payouts"] },
  "working-capital": { title: "Working Capital", blurb: "Optimise your cash-conversion cycle and unlock the cash trapped in your business.", perks: ["CCC dashboard & drawing power", "Discount-vs-borrow decisions", "Funding-gap sizing"] },
  forecast:     { title: "Cash-Flow Forecast", blurb: "Know your runway and never be surprised by a cash crunch again.", perks: ["13-week & 90-day rolling forecasts", "Best / base / worst scenarios", "Zero-cash early warning"] },
  analytics:    { title: "Analytics", blurb: "Turn your numbers into decisions — profitability, cohorts and unit economics.", perks: ["Profit by product / customer / region", "Margin & expense trends", "Cohorts & unit economics"] },
  "cfo-brief":  { title: "AI CFO Brief", blurb: "Your always-on CFO — a daily brief on cash, risk and what to do next.", perks: ["Daily cash & risk snapshot", "Plain-English variance commentary", "Board-ready summaries"] },
  predict:      { title: "Predictive Intelligence", blurb: "Forecast cash, payments and churn before they happen.", perks: ["Cash-balance projection", "Invoice pay-date prediction", "Early-warning signals"] },
  health:       { title: "Financial Health", blurb: "A live fitness score for your business — liquidity, solvency and distress risk.", perks: ["Altman Z-score & ratios", "Liquidity stress test", "Health trend over time"] },
  spend:        { title: "Spend Intelligence", blurb: "See where every rupee goes and stop the leaks.", perks: ["Category & vendor concentration", "Duplicate / anomaly detection", "Budget-vs-actual"] },
  credit:       { title: "Credit & Lending", blurb: "Unlock working-capital loans underwritten on your real cash flows — not collateral.", perks: ["AA-data underwriting & eligibility", "Invoice discounting & BNPL", "Loan management"] },
  treasury:     { title: "Treasury", blurb: "Put idle cash to work — sweeps, FD ladders and yield, managed in-app.", perks: ["Idle-cash sweep & FD laddering", "Yield & post-tax return", "Liquidity tiering"] },
  lenders:      { title: "Lenders", blurb: "Manage every lender relationship, covenant and drawdown in one place.", perks: ["Covenant dashboard", "Borrowing-base certificate", "Lender MIS pack"] },
  investor:     { title: "Investor Relations", blurb: "Keep investors updated and your cap table clean — automatically.", perks: ["Auto investor updates", "Board-deck generator", "Cap-table waterfall"] },
  connectors:   { title: "Connectors & API", blurb: "Plug Headroom into your bank, gateway, POS and accounting stack.", perks: ["Bank / UPI / gateway feeds", "Tally & e-commerce sync", "API access"] },
  automation:   { title: "Automation", blurb: "Put your finance ops on autopilot with no-code rules.", perks: ["IF-THEN rule builder", "Approval chains & SLAs", "Scheduled reports"] },
  network:      { title: "B2B Network", blurb: "Reconcile and transact with your buyers and suppliers on a shared graph.", perks: ["Two-sided invoice confirmation", "Counterparty reconciliation", "Mutual-credit netting"] },
  marketplace:  { title: "Marketplace Finance", blurb: "Reconcile every Amazon/Flipkart/ONDC settlement and protect your margin.", perks: ["Settlement & fee reconciliation", "GSTR-8 / TCS-52", "SKU P&L"] },
  global:       { title: "Cross-Border", blurb: "Bill, get paid and stay FEMA-compliant across currencies.", perks: ["Multi-currency P&L & FX", "Export invoices & LUT", "FIRC / BRC tracking"] },
};

// ── Role config ───────────────────────────────────────────────────────────────
export interface RoleConfig {
  id: UserRole;
  label: string;
  accessibleTabs: string[];
  visibleTabs: string[];
  canExport: boolean;
  canAddNotes: boolean;
  namespaces: string[];
  custom?: boolean;  // true once an owner has edited this role's access in the UI
}

// ── Firm ──────────────────────────────────────────────────────────────────────
export interface FirmSettings {
  name: string;
  legalName: string;
  industry: string;
  foundedYear: number;
  safetyThresholdDays: number;
  gstRegistered?: boolean;
  gstNumber?: string;
  gstRate?: number;  // output tax rate: 5 | 12 | 18 | 28
}

export interface ActiveLoan {
  id: string;
  lender: string;
  principal: number;
  outstanding: number;
  rate: number;
  termMonths: number;
  monthlyEmi: number;
  startDate: string;
  nextPaymentDate: string;
  nextPaymentAmount: number;
  applicationId?: string;
}

// ── Dashboard entities ────────────────────────────────────────────────────────
export interface BankAccount {
  id: string;
  name: string;
  provider: string;
  balance: number;
  lastSync: string;
  status: "connected" | "pending" | "error";
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: "revenue" | "expense" | "payroll" | "loan" | "tax" | "transfer";
  counterparty: string;
  isRecurring: boolean;
  bankAccountId: string;
  notes?: string;
  flagged?: boolean;
}

export interface Alert {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  message: string;
  isRead: boolean;
  actionTaken?: string;
  createdAt: string;
}

// ── Forecast entities ─────────────────────────────────────────────────────────
export interface ForecastPoint {
  date: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface Scenario {
  id: string;
  name: string;
  type: "new_hire" | "contract_won" | "loan_draw" | "custom";
  params: Record<string, unknown>;
  active: boolean;
  createdAt: string;
}

export interface CashObligation {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  type: "loan" | "tax" | "payroll" | "other";
}

// ── Credit entities ───────────────────────────────────────────────────────────
export interface CreditApplication {
  id: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "funded";
  loanAmount: number;
  termMonths: number;
  purpose: string;
  underwritingScore: number;
  approvedAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditOffer {
  id: string;
  applicationId: string;
  lender: string;
  amount: number;
  rate: number;
  termMonths: number;
  status: "pending" | "accepted" | "declined";
}

// ── Capital entities ──────────────────────────────────────────────────────────
export interface CapitalRaise {
  id: string;
  track: "rev_share" | "reg_cf" | "reg_a_plus";
  targetAmount: number;
  raisedAmount: number;
  status: "draft" | "active" | "closed" | "funded";
  createdAt: string;
  updatedAt: string;
}

export interface CapitalInvestment {
  id: string;
  raiseId: string;
  investorEmail: string;
  amount: number;
  equityPct: number;
  status: "pending" | "confirmed";
  createdAt: string;
}

// ── Connectors ────────────────────────────────────────────────────────────────
export type ConnectorProvider = "aa_network" | "finbox" | "tally" | "zoho_books" | "quickbooks" | "manual" | "razorpay" | "stripe" | "phonepe";

export interface BankConnector {
  id: string;
  provider: ConnectorProvider;
  label: string;
  accountName: string;
  status: "connected" | "pending" | "error" | "disconnected";
  lastSync: string | null;
  accountCount: number;
  consentExpiry: string | null;
}

// ── Operations entities ───────────────────────────────────────────────────────
export type OrderSource = "whatsapp" | "email" | "excel" | "manual" | "phone";
export type OrderStatus = "pending" | "confirmed" | "processing" | "dispatched" | "delivered" | "cancelled";

export interface OrderItem {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  source: OrderSource;
  buyerName: string;
  buyerPhone: string;
  status: OrderStatus;
  totalValue: number;
  notes: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  productName: string;
  sku: string;
  category: string;
  quantity: number;
  unit: string;
  unitCost: number;
  reorderLevel: number;
  updatedAt: string;
}

export interface ProcurementOrder {
  id: string;
  supplierName: string;
  status: "draft" | "approved" | "ordered" | "received" | "cancelled";
  totalValue: number;
  expectedDate: string;
  items: { productName: string; sku: string; quantity: number; unitCost: number }[];
  createdAt: string;
}

// ── WhatsApp alert preferences ──────────────────────────────────────────────
// Which proactive alerts the morning WhatsApp brief includes. Persisted per-tenant
// in the KV 'app' namespace so the backend digest (getTenantData) can honour them.
export interface WhatsAppPreferences {
  low_cash: boolean;
  overdue: boolean;
  gst_due: boolean;
  credit_offer: boolean;
  payroll: boolean;
  weekly: boolean;
}

export const DEFAULT_WA_PREFS: WhatsAppPreferences = {
  low_cash: true, overdue: true, gst_due: true, credit_offer: false, payroll: true, weekly: true,
};

// ── Fixed assets ────────────────────────────────────────────────────────────
export interface FixedAsset {
  id: string;
  name: string;
  category?: string;          // e.g. "Plant & Machinery", "Computers", "Furniture"
  cost: number;
  purchaseDate: string;       // YYYY-MM-DD
  usefulLifeYears: number;
  method: "straight_line" | "wdv";
  salvageValue?: number;      // residual value; default 0
  wdvRate?: number;           // optional explicit WDV % (Companies Act Schedule II)
  disposalDate?: string;      // set when sold/scrapped — depreciation freezes here
}

// ── Receivables ───────────────────────────────────────────────────────────────
export interface Invoice {
  id: string;
  customer: string;
  amount: number;
  invoiceNumber?: string;
  invoiceDate: string;
  dueDate: string;
  description: string;
  status: "pending" | "overdue" | "paid";
  // Where the invoice originated. "backend" invoices are mirrored from the
  // /api/invoices table (the InvoicesPage source) into the shared store so the
  // analytics engine, Collections and Dashboard all see one unified AR list.
  source?: "backend" | "import" | "manual";
}

// ── Budget entity ───────────────────────────────────────────────────────────
export interface Budget {
  id: string;
  category: string;
  label: string;
  monthlyLimit: number;
  color: string;
}

// ── App store ─────────────────────────────────────────────────────────────────
export interface AppStore {
  firm: FirmSettings;
  roles: RoleConfig[];
  bankAccounts: BankAccount[];
  transactions: Transaction[];
  alerts: Alert[];
  forecast: ForecastPoint[];
  scenarios: Scenario[];
  obligations: CashObligation[];
  creditApplications: CreditApplication[];
  creditOffers: CreditOffer[];
  activeLoans: ActiveLoan[];
  capitalRaises: CapitalRaise[];
  capitalInvestments: CapitalInvestment[];
  connectors: BankConnector[];
  invoices: Invoice[];
  fixedAssets: FixedAsset[];
  orders: Order[];
  inventory: InventoryItem[];
  procurement: ProcurementOrder[];
  budgets: Budget[];
  whatsappPreferences: WhatsAppPreferences;
  // Generic synced bag for the record-keeping feature tools (cap table, ESOP,
  // payables, recurring templates, insurance, GST refunds, etc.). Each tool owns
  // a unique key inside this object via the useFeatureState hook, so its records
  // persist + sync across devices through the normal KV machinery without needing
  // a dedicated top-level field per feature.
  featureData: Record<string, unknown>;
}

// ── KV namespace map ──────────────────────────────────────────────────────────
export const FIELD_NAMESPACE: Record<keyof AppStore, string> = {
  firm:                "app",
  roles:               "app",
  bankAccounts:        "app",
  transactions:        "app",
  alerts:              "app",
  connectors:          "app",
  invoices:            "app",
  fixedAssets:         "app",
  forecast:            "forecast",
  scenarios:           "forecast",
  obligations:         "forecast",
  creditApplications:  "credit",
  creditOffers:        "credit",
  activeLoans:         "credit",
  capitalRaises:       "capital",
  capitalInvestments:  "capital",
  orders:              "operations",
  inventory:           "operations",
  procurement:         "operations",
  budgets:             "app",
  whatsappPreferences: "app",
  featureData:         "app",
};

export const ROLE_NAMESPACES: Record<UserRole, string[]> = {
  super_admin:        ["app", "forecast", "credit", "capital", "operations"],
  owner:              ["app", "forecast", "credit", "capital", "operations"],
  finance_manager:    ["app", "forecast", "credit", "operations"],
  accountant:         ["app", "forecast", "operations"],
  sales:              ["app"],
  operations_manager: ["app", "operations"],
  viewer:             ["app", "forecast"],
  investor:           ["app", "capital"],
};
