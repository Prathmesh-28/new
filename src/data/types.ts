// ── Auth ──────────────────────────────────────────────────────────────────────
export type UserRole = "super_admin" | "owner" | "accountant" | "investor";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenant_id: string;
  first_login: boolean;
  display_name?: string;
}

// ── Role config ───────────────────────────────────────────────────────────────
export interface RoleConfig {
  id: UserRole;
  label: string;
  accessibleTabs: string[];
  visibleTabs: string[];
  canExport: boolean;
  canAddNotes: boolean;
  namespaces: string[];
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
export type ConnectorProvider = "aa_network" | "finbox" | "tally" | "zoho_books" | "quickbooks" | "manual";

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
  super_admin: ["app", "forecast", "credit", "capital", "operations"],
  owner:       ["app", "forecast", "credit", "capital", "operations"],
  accountant:  ["app", "forecast", "operations"],
  investor:    ["app", "capital"],
};
