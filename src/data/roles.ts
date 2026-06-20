import type { UserRole } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Central role metadata — the single source of truth for how every role is
// labelled, described and badged across the app (Settings, Sidebar, Header).
// Tab-level access for each role lives in defaultConfig.ts (accessibleTabs) and
// data-namespace access in types.ts (ROLE_NAMESPACES). This file is purely the
// human-facing presentation + which roles an owner is allowed to hand out.
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamRoleMeta {
  id: UserRole;
  label: string;
  blurb: string;        // one-line summary of what this person can do
  badge: string;        // tailwind classes for the role pill
  assignable: boolean;  // can a workspace owner assign this when inviting?
  readOnly?: boolean;   // true → cannot create/edit/delete anything
  scope: string[];      // bullet list shown in the permissions reference
}

export const ROLE_META: Record<UserRole, TeamRoleMeta> = {
  owner: {
    id: "owner",
    label: "Business Owner",
    blurb: "Full access — finances, capital, team and settings.",
    badge: "bg-[var(--color-primary)]/20 text-[var(--color-primary)] border-[var(--color-primary)]/30",
    assignable: true,
    scope: ["Everything in the workspace", "Invite & manage team", "Capital raises & cap table", "Business settings"],
  },
  finance_manager: {
    id: "finance_manager",
    label: "Finance Manager",
    blurb: "Runs day-to-day finance: cash, AR/AP, GST, tax, payroll, debt.",
    badge: "bg-cyan-900/30 text-cyan-400 border-cyan-800/30",
    assignable: true,
    scope: ["Transactions & forecast", "Invoices, GST, tax & payroll", "Debt & working capital", "No cap table or team admin"],
  },
  accountant: {
    id: "accountant",
    label: "Accountant / CA",
    blurb: "Books, compliance, GST/tax filing and advisory views.",
    badge: "bg-blue-900/30 text-blue-400 border-blue-800/30",
    assignable: true,
    scope: ["Transactions & books", "GST & tax filing", "Compliance calendar", "Advisor portal (own clients)"],
  },
  sales: {
    id: "sales",
    label: "Sales / Collections",
    blurb: "Raises invoices, tracks receivables and chases collections.",
    badge: "bg-pink-900/30 text-pink-400 border-pink-800/30",
    assignable: true,
    scope: ["Invoices & receivables", "Collections & reminders", "Revenue analytics", "No costs, payroll or banking"],
  },
  operations_manager: {
    id: "operations_manager",
    label: "Operations Manager",
    blurb: "Manages orders, inventory, procurement, vendors and spend.",
    badge: "bg-amber-900/30 text-amber-400 border-amber-800/30",
    assignable: true,
    scope: ["Orders & inventory", "Procurement & vendors", "Spend intelligence", "No banking or payroll"],
  },
  viewer: {
    id: "viewer",
    label: "Viewer (Read-only)",
    blurb: "Sees dashboards, analytics and health — cannot make changes.",
    badge: "bg-slate-600/40 text-slate-300 border-slate-500/40",
    assignable: true,
    readOnly: true,
    scope: ["Dashboard & analytics", "Financial health score", "CFO brief & forecast", "Read-only — no edits or export"],
  },
  investor: {
    id: "investor",
    label: "Investor / Banker",
    blurb: "Portfolio, live raises, valuation and lender views only.",
    badge: "bg-green-900/30 text-green-400 border-green-800/30",
    assignable: true,
    scope: ["Investor portfolio", "Capital raises marketplace", "Valuation & lenders"],
  },
  super_admin: {
    id: "super_admin",
    label: "Super Admin",
    blurb: "Platform administration across all tenants.",
    badge: "bg-purple-900/30 text-purple-400 border-purple-800/30",
    assignable: false,
    scope: ["All tabs", "All tenants", "Admin panel & connectors"],
  },
};

/** Roles a workspace owner may assign when inviting a team member. */
export const ASSIGNABLE_ROLES: TeamRoleMeta[] = Object.values(ROLE_META).filter(r => r.assignable);

// ── Tab catalog — every configurable page, grouped by user-flow category. This
// is the single source of truth for categorisation: the Sidebar nav, the team
// permission editor (Settings) and the ⌘K command palette all read these groups,
// so a page lives in exactly one place everywhere. (Super-admin-only surfaces
// like /admin are intentionally absent — they are not owner-configurable tabs.)
export interface TabDef { tab: string; label: string; group: string }
export const TAB_CATALOG: TabDef[] = [
  // Overview — understand the business
  { tab: "dashboard",       label: "Dashboard",        group: "Overview" },
  { tab: "analytics",       label: "Analytics",        group: "Overview" },
  { tab: "insights",        label: "Insights",         group: "Overview" },
  { tab: "health",          label: "Financial Health", group: "Overview" },
  { tab: "cfo-brief",       label: "CFO Brief",        group: "Overview" },
  { tab: "benchmarks",      label: "Benchmarks",       group: "Overview" },
  // Sales & CRM — win and bill customers
  { tab: "crm",             label: "CRM",              group: "Sales & CRM" },
  { tab: "sales",           label: "Sales Pipeline",   group: "Sales & CRM" },
  { tab: "invoices",        label: "Invoices",         group: "Sales & CRM" },
  { tab: "receivables",     label: "Receivables",      group: "Sales & CRM" },
  { tab: "collections",     label: "Collections",      group: "Sales & CRM" },
  // Accounting & Tax — record and comply
  { tab: "transactions",    label: "Transactions",     group: "Accounting & Tax" },
  { tab: "books",           label: "Books (GL)",       group: "Accounting & Tax" },
  { tab: "gst",             label: "GST",              group: "Accounting & Tax" },
  { tab: "tax",             label: "Tax Autopilot",    group: "Accounting & Tax" },
  { tab: "statements",      label: "Statements",       group: "Accounting & Tax" },
  { tab: "payments",        label: "Payments",         group: "Accounting & Tax" },
  { tab: "banking",         label: "Banking",          group: "Accounting & Tax" },
  // Operations — inventory, procurement, supply
  { tab: "erp",             label: "ERP / Manufacturing", group: "Operations" },
  { tab: "operations",      label: "Operations",       group: "Operations" },
  { tab: "vendors",         label: "Vendors",          group: "Operations" },
  { tab: "suppliers",       label: "Suppliers",        group: "Operations" },
  { tab: "spend",           label: "Spend Intel",      group: "Operations" },
  { tab: "connectors",      label: "Connectors",       group: "Operations" },
  // People — HR and payroll
  { tab: "hrms",            label: "HRMS",             group: "People" },
  { tab: "payroll",         label: "Payroll",          group: "People" },
  // Planning — forecast and control
  { tab: "forecast",        label: "Forecast",         group: "Planning" },
  { tab: "budgets",         label: "Budgets",          group: "Planning" },
  { tab: "working-capital", label: "Working Capital",  group: "Planning" },
  { tab: "scenarios",       label: "Scenarios",        group: "Planning" },
  { tab: "predict",         label: "Predict",          group: "Planning" },
  { tab: "compliance",      label: "Compliance",       group: "Planning" },
  // Capital & Treasury — fund and invest
  { tab: "capital",         label: "Capital",          group: "Capital & Treasury" },
  { tab: "credit",          label: "Credit",           group: "Capital & Treasury" },
  { tab: "debt",            label: "Debt",             group: "Capital & Treasury" },
  { tab: "valuation",       label: "Valuation",        group: "Capital & Treasury" },
  { tab: "term-sheet",      label: "Term Sheet",       group: "Capital & Treasury" },
  { tab: "lenders",         label: "Lenders",          group: "Capital & Treasury" },
  { tab: "investor",        label: "Investor Portfolio", group: "Capital & Treasury" },
  { tab: "treasury",        label: "Treasury",         group: "Capital & Treasury" },
  { tab: "insurance",       label: "Insurance",        group: "Capital & Treasury" },
  // AI & Automation — assist and automate
  { tab: "copilot",         label: "AI CFO",           group: "AI & Automation" },
  { tab: "automation",      label: "Automation",       group: "AI & Automation" },
  { tab: "whatsapp",        label: "WhatsApp",         group: "AI & Automation" },
  { tab: "voice",           label: "Voice",            group: "AI & Automation" },
  { tab: "documents",       label: "Documents",        group: "AI & Automation" },
  { tab: "advisor",         label: "Advisor / CA Portal", group: "AI & Automation" },
  { tab: "alerts",          label: "Alerts",           group: "AI & Automation" },
  { tab: "field",           label: "Field / Offline",  group: "AI & Automation" },
  // Markets & Labs — extend the platform
  { tab: "marketplace",     label: "Marketplace",      group: "Markets & Labs" },
  { tab: "network",         label: "B2B Network",      group: "Markets & Labs" },
  { tab: "global",          label: "Global",           group: "Markets & Labs" },
  { tab: "esg",             label: "ESG",              group: "Markets & Labs" },
  { tab: "tokens",          label: "Tokens",           group: "Markets & Labs" },
  { tab: "frontier",        label: "Frontier Lab",     group: "Markets & Labs" },
  // Organization — administer the workspace
  { tab: "settings",        label: "Settings",         group: "Organization" },
  { tab: "data",            label: "Data & Import",    group: "Organization" },
  { tab: "security",        label: "Security",         group: "Organization" },
  { tab: "privacy",         label: "Privacy",          group: "Organization" },
];

export const TAB_GROUPS = [
  "Overview", "Sales & CRM", "Accounting & Tax", "Operations", "People",
  "Planning", "Capital & Treasury", "AI & Automation", "Markets & Labs", "Organization",
];

/** Roles whose access an owner can reshape (excludes super_admin god-mode + owner self). */
export const CONFIGURABLE_ROLES: TeamRoleMeta[] = ASSIGNABLE_ROLES.filter(r => r.id !== "owner");

export function roleLabel(role: string): string {
  return ROLE_META[role as UserRole]?.label ?? role;
}
export function roleBadge(role: string): string {
  return ROLE_META[role as UserRole]?.badge ?? "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]";
}
export function isReadOnlyRole(role: string): boolean {
  return ROLE_META[role as UserRole]?.readOnly === true;
}
