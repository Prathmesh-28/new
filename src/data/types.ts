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
export type PlanTier = "free" | "growth" | "pro";

export const PLAN_RANK: Record<PlanTier, number> = { free: 0, growth: 1, pro: 2 };

export const PLAN_LABEL: Record<PlanTier, string> = { free: "Free", growth: "Growth", pro: "Pro" };

// Which plan a premium feature needs, keyed by the route slug (path's first
// segment). Tabs not listed here are available on every plan — core daily-use
// surfaces and role-landing pages (advisor/investor) stay open; only high-leverage
// analysis modules are gated, so a scoped team member is never locked out of their
// own home. super_admin bypasses all gates (see RouteGuard).
export const FEATURE_ENTITLEMENTS: Record<string, PlanTier> = {
  benchmarks:  "growth",
  valuation:   "growth",
  "term-sheet": "growth",
  scenarios:   "growth",
  capital:     "pro",
};

// Human-facing pitch for each gated feature — shown on the upsell screen.
export const FEATURE_PITCH: Record<string, { title: string; blurb: string; perks: string[] }> = {
  benchmarks:   { title: "Peer Benchmarks", blurb: "See exactly how your margins, runway, and burn stack up against similar SMBs.", perks: ["Percentiles from your own 12-month history", "Margin, runway, AR-days, payroll & burn", "Spot where you're an outlier — and fix it"] },
  valuation:    { title: "Business Valuation", blurb: "Know what your company is worth before you raise or sell.", perks: ["Revenue & EBITDA multiple models", "Scenario-driven valuation ranges", "Investor-ready summary"] },
  "term-sheet": { title: "Term Sheet Builder", blurb: "Model dilution and build investor-ready term sheets in minutes.", perks: ["Pre/post-money & dilution math", "Multiple round modelling", "Export to PDF for investors"] },
  scenarios:    { title: "Scenario Planning", blurb: "Stress-test hiring, big contracts, and loan draws against your cash.", perks: ["What-if cash forecasting", "Stack multiple scenarios", "See the runway impact instantly"] },
  capital:      { title: "Capital Raising", blurb: "Raise from the people who believe in your business — built into Headroom.", perks: ["Revenue-based financing, angel & SME-IPO tracks", "Live investor portal & cap table", "Compliance handled for you"] },
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
