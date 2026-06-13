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

export function roleLabel(role: string): string {
  return ROLE_META[role as UserRole]?.label ?? role;
}
export function roleBadge(role: string): string {
  return ROLE_META[role as UserRole]?.badge ?? "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]";
}
export function isReadOnlyRole(role: string): boolean {
  return ROLE_META[role as UserRole]?.readOnly === true;
}
