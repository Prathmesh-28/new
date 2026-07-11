import { useState, useEffect, useCallback, useMemo, Fragment, type ReactNode } from "react";
import { useT } from "@/i18n";
import { useAuth, BASE } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
} from "recharts";
import {
  ShieldCheck, Building2, Users as UsersIcon, CreditCard, ScrollText, Server,
  Search, Copy, X, Pencil, KeyRound, Crown, Trash2, LogIn, Zap, Power, UserPlus,
  Download, RefreshCw, Ghost, Wallet, TrendingUp, Receipt, Activity, Check, Upload, Eye, Mail, ChevronDown,
} from "lucide-react";

// BASE is imported per the spec; referenced here so the import is never dropped.
void BASE;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export type PlanTier = "free" | "starter" | "growth" | "pro";
type UserRole =
  | "super_admin" | "owner" | "finance_manager" | "accountant"
  | "sales" | "operations_manager" | "viewer" | "investor";

export interface AdminUser {
  id: string;
  email: string;
  display_name?: string;
  role: string;
  tenant_id: string;
  subscription_plan?: PlanTier;
  first_login: boolean;
  created_at: string;
  last_login_at?: string | null;
  last_active_at?: string | null;
  login_count: number;
  status?: string;
}

export interface Company {
  tenant_id: string;
  company_name: string | null;
  owner_email: string | null;
  user_count: number;
  plan: PlanTier;
  status: "active" | "suspended";
  created_at: string;
  last_login_at?: string | null;
  last_activity: string | null;
  cash: number;
  revenue: number;
  expense: number;
  transactions: number;
  openReceivables: number;
  // Real tenant_billing record (A9): who actually billed this plan, and how.
  billing_provider?: string | null;
  billing_status?: string | null;
  billing_updated_at?: string | null;
}

interface Stats {
  companies: number;
  users: number;
  byRole: Record<string, number>;
  totalCash: number;
  totalRevenue: number;
  totalTransactions: number;
  totalReceivables: number;
  activeCompanies: number;
}

interface Metrics {
  mrr: number;
  arr: number;
  paidTenants: number;
  confirmedMrr: number;
  confirmedArr: number;
  confirmedPaidTenants: number;
  downgradedToFree30d: number;
  currency: string;
  planMix: { free: number; starter: number; growth: number; pro: number };
  signupsByMonth: { month: string; n: number }[];
  activeUsers30d: number;
  pendingInvites: number;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entity_id: string;
  // audit meta is intentionally untyped - server-emitted, shape varies per action.
  meta: unknown;
  created_at: string;
  actor_email: string;
  actor_role: string;
}

type SectionId = "overview" | "companies" | "users" | "plans" | "audit" | "platform";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
export function relTime(iso?: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return formatDistanceToNow(d, { addSuffix: true });
}

export function fmtINR(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

const PLAN_STYLE: Record<PlanTier, { pill: string; label: string }> = {
  pro:     { pill: "bg-purple-900/40 text-purple-300 border border-purple-700/50", label: "PRO" },
  growth:  { pill: "bg-blue-900/40 text-blue-300 border border-blue-700/50",       label: "GROWTH" },
  starter: { pill: "bg-amber-900/40 text-amber-300 border border-amber-700/50",    label: "STARTER" },
  free:    { pill: "bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]", label: "FREE" },
};

const ROLE_STYLE: Record<string, string> = {
  super_admin:        "bg-red-900/40 text-red-300 border border-red-700/50",
  owner:              "bg-green-900/40 text-green-300 border border-green-700/50",
  finance_manager:    "bg-cyan-900/40 text-cyan-300 border border-cyan-700/50",
  accountant:         "bg-blue-900/40 text-blue-300 border border-blue-700/50",
  sales:              "bg-pink-900/40 text-pink-300 border border-pink-700/50",
  operations_manager: "bg-amber-900/40 text-amber-300 border border-amber-700/50",
  investor:           "bg-teal-900/40 text-teal-300 border border-teal-700/50",
  viewer:             "bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]",
};

const PLAN_PRICE: Record<PlanTier, number> = { free: 0, starter: 799, growth: 2499, pro: 5999 };
const PLAN_ORDER: PlanTier[] = ["free", "starter", "growth", "pro"];

// Chart fills for plan distribution (recharts needs literal colours per Cell).
const PLAN_FILL: Record<PlanTier, string> = {
  free:    "#64748b", // slate
  starter: "#f59e0b", // amber
  growth:  "#3b82f6", // blue
  pro:     "#a855f7", // purple
};

export function roleLabel(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function errMsg(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Failed";
}

// A10 (2026-07 gap audit): destructive actions get a real undo, not just a confirm dialog.
// The caller applies its optimistic UI change FIRST, then hands the actual commit (the API
// call) here — it's delayed 5s behind a dismissible toast, so clicking Undo means the
// destructive call never fires at all (not a reversal-after-the-fact).
function undoableAction(message: string, commit: () => void, revert: () => void) {
  let undone = false;
  toast(message, {
    duration: 5000,
    action: { label: "Undo", onClick: () => { undone = true; revert(); } },
  });
  setTimeout(() => { if (!undone) commit(); }, 5000);
}

// Deterministic avatar background from an email (one of a small palette).
export function avatarBg(email: string): string {
  const palette = [
    "bg-purple-700", "bg-blue-700", "bg-emerald-700", "bg-amber-700",
    "bg-pink-700", "bg-cyan-700", "bg-rose-700", "bg-indigo-700",
  ];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function initials(u: AdminUser): string {
  const base = (u.display_name || u.email || "?").trim();
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

// A user's displayed status is derived purely from its own fields (no per-user
// status write exists - suspend/activate is a tenant-level operation).
export function userStatus(u: AdminUser): "active" | "pending" | "suspended" {
  if (u.status === "suspended") return "suspended";
  if (u.first_login) return "pending";
  return "active";
}

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
export function PlanPill({ plan }: { plan: PlanTier }) {
  const s = PLAN_STYLE[plan] ?? PLAN_STYLE.free;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.pill}`}>{s.label}</span>;
}

export function RolePill({ role }: { role: string }) {
  const cls = ROLE_STYLE[role] ?? ROLE_STYLE.viewer;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{roleLabel(role)}</span>;
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-[var(--color-muted)]">{icon}</span>}
        <p className="text-xs text-[var(--color-muted)]">{label}</p>
      </div>
      <p className="text-xl font-bold text-[var(--color-primary)] tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

function SkelRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-[var(--color-border)]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 rounded bg-white/10 animate-pulse" style={{ width: `${50 + ((i * 17) % 40)}%` }} />
        </td>
      ))}
    </tr>
  );
}

function ConfirmPopover({
  message, onConfirm, onCancel, confirmLabel = "Confirm", danger = false,
}: { message: string; onConfirm: () => void; onCancel: () => void; confirmLabel?: string; danger?: boolean }) {
  return (
    <div className="absolute right-0 top-full mt-1 z-40 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-3 text-left">
      <p className="text-xs text-[var(--color-text)] mb-2.5">{message}</p>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="text-[11px] px-2 py-1 rounded text-[var(--color-muted)] hover:text-[var(--color-text)]">Cancel</button>
        <button
          onClick={onConfirm}
          className={`text-[11px] font-semibold px-2.5 py-1 rounded ${danger ? "bg-red-600 text-white hover:bg-red-500" : "bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90"}`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function CopyId({ id, chars = 8 }: { id: string; chars?: number }) {
  const short = id.length > chars ? id.slice(0, chars) + "…" : id;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(id); toast.success("Copied!"); }}
      title={id}
      className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--color-muted)] hover:text-[var(--color-primary)]"
    >
      {short} <Copy size={10} />
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED FILTER-BAR PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
const inputCls = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const selectCls = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[var(--color-primary)] cursor-pointer";
const thCls = "px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide whitespace-nowrap";

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 min-w-[200px]">
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`w-full pl-8 ${inputCls}`} />
    </div>
  );
}

function PillTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex items-center gap-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-0.5 overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`text-xs font-medium px-2.5 py-1.5 rounded whitespace-nowrap ${value === o.id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatusDot({ active, labelActive = "Active", labelInactive = "Suspended", pending = false }: { active: boolean; labelActive?: string; labelInactive?: string; pending?: boolean }) {
  const color = pending ? "bg-amber-400" : active ? "bg-green-400" : "bg-red-400";
  const text = pending ? "text-amber-400" : active ? "text-green-400" : "text-red-400";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className={text}>{active ? labelActive : labelInactive}</span>
    </span>
  );
}

function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 text-[var(--color-muted)] opacity-30">{icon}</div>
      <p className="text-sm text-[var(--color-muted)]">{message}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
// Super-admin editor for all super-admin-editable platform settings - social links,
// brand/contact, footer legal links, and the site-wide announcement banner. Each card
// PUTs its own group to /api/platform/settings/:group and goes live immediately.
type FieldType = "text" | "number" | "bool" | "url" | "email" | "textarea" | "select";
interface FieldDef { key: string; label: string; type?: FieldType; options?: string[] }
interface PlatformGroup { title: string; hint: string; fields: FieldDef[]; custom?: boolean; list?: boolean }
const PLATFORM_GROUPS: Record<string, PlatformGroup> = {
  brand: { title: "Brand & contact", hint: "Company identity used in the footer and documents.", fields: [{ key: "companyName", label: "Company name" }, { key: "supportEmail", label: "Support email", type: "email" }, { key: "salesEmail", label: "Sales email", type: "email" }, { key: "phone", label: "Phone" }, { key: "address", label: "Address" }, { key: "tagline", label: "Tagline" }] },
  social: { title: "Social links (footer icons)", hint: "Full https:// URLs. Blank hides that icon.", fields: [{ key: "linkedin", label: "LinkedIn", type: "url" }, { key: "instagram", label: "Instagram", type: "url" }, { key: "twitter", label: "X / Twitter", type: "url" }, { key: "youtube", label: "YouTube", type: "url" }, { key: "facebook", label: "Facebook", type: "url" }] },
  links: { title: "Footer legal links", hint: "Privacy / Terms / Security URLs shown in the footer.", fields: [{ key: "privacyUrl", label: "Privacy URL", type: "url" }, { key: "termsUrl", label: "Terms URL", type: "url" }, { key: "securityUrl", label: "Security URL", type: "url" }] },
  banner: { title: "Announcement banner", hint: "A site-wide banner (shown in-app). Off by default.", fields: [{ key: "enabled", label: "Show banner", type: "bool" }, { key: "text", label: "Banner text" }, { key: "linkUrl", label: "Link URL", type: "url" }, { key: "linkLabel", label: "Link label" }] },
  payments: { title: "Payments & collections", hint: "Default UPI ID used on invoice payment links when a business hasn't set its own. Shown to customers - use a real VPA you control.", fields: [{ key: "upiId", label: "UPI ID (VPA)" }, { key: "payeeName", label: "Payee name" }, { key: "paymentNote", label: "Payment note", type: "textarea" }] },
  features: { title: "Feature switches", hint: "Turn whole modules on or off across the app - instantly.", fields: [{ key: "enableAgents", label: "AI Agents", type: "bool" }, { key: "enableWhatsapp", label: "WhatsApp", type: "bool" }, { key: "enableMarketplace", label: "Marketplace", type: "bool" }, { key: "enableInvestor", label: "Investor portal", type: "bool" }, { key: "enableEsg", label: "ESG", type: "bool" }, { key: "enableGlobal", label: "Global", type: "bool" }, { key: "enableTokens", label: "Tokens", type: "bool" }] },
  localization: { title: "Localization", hint: "Currency, locale, timezone and fiscal year used across the app.", fields: [{ key: "currency", label: "Currency" }, { key: "locale", label: "Locale" }, { key: "timezone", label: "Timezone" }, { key: "fiscalYearStart", label: "FY start (MM-DD)" }, { key: "dateFormat", label: "Date format" }] },
  support: { title: "Support & help", hint: "Help / docs / status links and support contact shown in-app.", fields: [{ key: "helpUrl", label: "Help URL", type: "url" }, { key: "docsUrl", label: "Docs URL", type: "url" }, { key: "statusUrl", label: "Status URL", type: "url" }, { key: "whatsappNumber", label: "WhatsApp number" }, { key: "hours", label: "Support hours" }] },
  seo: { title: "SEO / meta", hint: "Default page title, description and social share image.", fields: [{ key: "title", label: "Meta title" }, { key: "description", label: "Meta description", type: "textarea" }, { key: "ogImageUrl", label: "OG image URL", type: "url" }, { key: "keywords", label: "Keywords" }] },
  maintenance: { title: "Maintenance mode", hint: "Show a site-wide maintenance message. Off by default.", fields: [{ key: "enabled", label: "Maintenance mode on", type: "bool" }, { key: "message", label: "Message", type: "textarea" }] },
  ai: { title: "AI engine defaults", hint: "Default models used when a tenant hasn't picked their own. Runs on your OpenRouter key.", fields: [{ key: "defaultModel", label: "Default chat model" }, { key: "visionModel", label: "Vision model" }, { key: "embedModel", label: "Embedding model" }, { key: "allowByoKey", label: "Allow tenant's own key", type: "bool" }, { key: "engineNote", label: "Engine note", type: "textarea" }] },
  limits: { title: "Limits & quotas", hint: "Platform caps & thresholds - changes take effect immediately. 0 means unlimited.", fields: [{ key: "maxAgentsPerTenant", label: "Max agents / tenant", type: "number" }, { key: "monthlyTokenCap", label: "Monthly token cap", type: "number" }, { key: "maxUploadMb", label: "Max upload (MB)", type: "number" }, { key: "maxBulkRows", label: "Max bulk rows", type: "number" }, { key: "trialDays", label: "Trial days", type: "number" }, { key: "reminderMaxPer7d", label: "Max reminders / invoice / 7d", type: "number" }, { key: "creditMinScore", label: "Credit pre-qual min score", type: "number" }] },
  signup: { title: "Signup", hint: "How new accounts are created and what they default to.", fields: [{ key: "mode", label: "Signup mode", type: "select", options: ["open", "invite-only", "closed"] }, { key: "defaultPlan", label: "Default plan", type: "select", options: ["free", "starter", "growth", "pro"] }, { key: "defaultRole", label: "Default role" }, { key: "allowAdvisorSignup", label: "Allow advisor signup", type: "bool" }] },
  // NOTE: no "Pricing" group here anymore. Real plan pricing is served publicly
  // from GET /api/billing/plans, read directly from the same constants Razorpay
  // checkout charges (backend routes/billing.js) - an editable second copy here
  // would just drift out of sync with what customers are actually charged again
  // (which is exactly the bug an audit found: three different price sets).
  faqs: { title: "FAQs (public homepage)", hint: "Shown on the public marketing site. Edit anytime - goes live immediately, no redeploy.", fields: [], list: true },
  custom: { title: "Custom settings", hint: "Add ANY key/value you need - now or in future. Read it anywhere via the platform settings API. Your zero-code escape hatch.", fields: [], custom: true },
};

const SETTING_INPUT = "flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]";

// Dynamic key/value editor for the `custom` group - add/edit/remove arbitrary settings.
function CustomSettingsEditor({ value, onChange }: { value: Record<string, any>; onChange: (v: Record<string, any>) => void }) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(value || {});
  const setVal = (k: string, v: any) => onChange({ ...value, [k]: v });
  const remove = (k: string) => { const next = { ...value }; delete next[k]; onChange(next); };
  const add = () => {
    const k = newKey.trim();
    if (!k || !/^[A-Za-z0-9_.-]{1,64}$/.test(k) || value[k] !== undefined) return;
    onChange({ ...value, [k]: "" });
    setNewKey("");
  };
  return (
    <div className="space-y-2.5">
      {entries.length === 0 && <p className="text-xs text-[var(--color-muted)]">No custom settings yet - add one below.</p>}
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3">
          <label className="w-40 shrink-0 text-xs font-mono text-[var(--color-muted)] truncate" title={k}>{k}</label>
          <input value={typeof v === "boolean" ? String(v) : (v ?? "")} onChange={e => setVal(k, e.target.value)} className={SETTING_INPUT} />
          <button onClick={() => remove(k)} className="shrink-0 text-[var(--color-muted)] hover:text-red-400 text-xs px-2 py-1">Remove</button>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="new_key_name"
          onKeyDown={e => { if (e.key === "Enter") add(); }}
          className="w-40 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-mono outline-none focus:border-[var(--color-primary)]" />
        <button onClick={add} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs hover:border-[var(--color-primary)]">+ Add field</button>
      </div>
    </div>
  );
}

// Array-of-{q,a} editor for the `faqs` group - the public homepage's FAQ section.
interface FaqItemT { q: string; a: string }
function FaqListEditor({ value, onChange }: { value: { items?: FaqItemT[] }; onChange: (v: { items: FaqItemT[] }) => void }) {
  const items = value?.items || [];
  const update = (i: number, patch: Partial<FaqItemT>) => onChange({ items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const remove = (i: number) => onChange({ items: items.filter((_, idx) => idx !== i) });
  const add = () => onChange({ items: [...items, { q: "", a: "" }] });
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-xs text-[var(--color-muted)]">No FAQs yet - add one below.</p>}
      {items.map((it, i) => (
        <div key={i} className="border border-[var(--color-border)] rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={it.q} onChange={e => update(i, { q: e.target.value })} placeholder="Question" className={SETTING_INPUT} />
            <button onClick={() => remove(i)} className="shrink-0 text-[var(--color-muted)] hover:text-red-400 text-xs px-2 py-1">Remove</button>
          </div>
          <textarea value={it.a} onChange={e => update(i, { a: e.target.value })} placeholder="Answer" rows={2} className={`${SETTING_INPUT} w-full`} />
        </div>
      ))}
      <button onClick={add} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs hover:border-[var(--color-primary)]">+ Add FAQ</button>
    </div>
  );
}

// Read-only panel for the `stats` group - the public homepage's stat strip. These
// are computed server-side (backend lib/platformStats.js), never hand-typed; the
// admin can only trigger a fresh computation, not edit the numbers themselves.
interface PlatformStatsT {
  smbCount?: number; cashTrackedInr?: number;
  forecastAccuracyPct?: number | null; forecastAccuracySamples?: number;
  avgDaysToFirstInsight?: number | null; avgDaysToFirstInsightSamples?: number;
  minAccuracySamples?: number; minInsightSamples?: number;
  computedAt?: string | null;
}
function PlatformStatsPanel() {
  const [stats, setStats] = useState<PlatformStatsT | null>(null);
  const [loading, setLoading] = useState(false);
  const load = () => api.get<Record<string, any>>("/api/platform/settings/all").then(d => setStats(d?.stats || null)).catch(() => { /* keep last good values */ });
  useEffect(() => { load(); }, []);
  const recompute = async () => {
    setLoading(true);
    try { const res = await api.post<PlatformStatsT>("/api/platform/settings/stats/recompute", {}); setStats(res); toast.success("Stats recomputed"); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setLoading(false); }
  };
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <h3 className="text-sm font-semibold mb-1">Public marketing stats</h3>
      <p className="text-xs text-[var(--color-muted)] mb-4">Computed from real data - never hand-typed. A stat with not-enough-data-yet is hidden on the public site rather than shown as a placeholder.</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mb-4">
        <div><span className="text-[var(--color-muted)]">SMBs on platform:</span> {stats?.smbCount ?? "—"}</div>
        <div><span className="text-[var(--color-muted)]">Cash tracked:</span> {stats?.cashTrackedInr != null ? `₹${Number(stats.cashTrackedInr).toLocaleString("en-IN")}` : "—"}</div>
        <div>
          <span className="text-[var(--color-muted)]">Forecast accuracy:</span>{" "}
          {stats?.forecastAccuracyPct != null
            ? `${stats.forecastAccuracyPct}% (${stats.forecastAccuracySamples} samples)`
            : `not enough data yet (${stats?.forecastAccuracySamples ?? 0}/${stats?.minAccuracySamples ?? "?"} samples)`}
        </div>
        <div>
          <span className="text-[var(--color-muted)]">Avg days to first insight:</span>{" "}
          {stats?.avgDaysToFirstInsight != null
            ? `${stats.avgDaysToFirstInsight} days (${stats.avgDaysToFirstInsightSamples} samples)`
            : `not enough data yet (${stats?.avgDaysToFirstInsightSamples ?? 0}/${stats?.minInsightSamples ?? "?"} samples)`}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mb-3">{stats?.computedAt ? `Last computed ${new Date(stats.computedAt).toLocaleString()}` : "Not computed yet"}</p>
      <button onClick={recompute} disabled={loading}
        className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-bg)] disabled:opacity-50">
        {loading ? "Recomputing…" : "Recompute now"}
      </button>
    </div>
  );
}

// A1 (2026-07 gap audit): a single header-level search reachable from every admin
// section, matching BOTH users and companies — the old box lived buried in the
// Platform tab and matched users only. Jumps straight into Users/Companies pre-filtered.
function GlobalOmnibox({
  companies, users, onFindUser, onFindCompany,
}: {
  companies: Company[];
  users: AdminUser[];
  onFindUser: (q: string) => void;
  onFindCompany: (q: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const userMatches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return users.filter((u) =>
      u.email.toLowerCase().includes(needle) || (u.display_name || "").toLowerCase().includes(needle) || u.tenant_id.toLowerCase().includes(needle)
    ).slice(0, 5);
  }, [q, users]);

  const companyMatches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return companies.filter((c) =>
      (c.company_name || "").toLowerCase().includes(needle) || (c.owner_email || "").toLowerCase().includes(needle) || c.tenant_id.toLowerCase().includes(needle)
    ).slice(0, 5);
  }, [q, companies]);

  const hasResults = userMatches.length > 0 || companyMatches.length > 0;

  return (
    <div className="relative mb-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Find anyone or any company — email, name, company, tenant id…"
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
        />
      </div>
      {open && q.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl max-h-80 overflow-y-auto">
          {!hasResults && <p className="px-3 py-3 text-xs text-[var(--color-muted)]">No matches.</p>}
          {userMatches.length > 0 && (
            <div className="py-1">
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Users</p>
              {userMatches.map((u) => (
                <button key={u.id} onClick={() => onFindUser(u.email)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center justify-between gap-2">
                  <span className="truncate">{u.display_name || u.email}</span>
                  <span className="text-[var(--color-muted)] shrink-0">{u.tenant_id}</span>
                </button>
              ))}
            </div>
          )}
          {companyMatches.length > 0 && (
            <div className="py-1 border-t border-[var(--color-border)]">
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Companies</p>
              {companyMatches.map((c) => (
                <button key={c.tenant_id} onClick={() => onFindCompany(c.company_name || c.owner_email || c.tenant_id)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center justify-between gap-2">
                  <span className="truncate">{c.company_name || c.tenant_id}</span>
                  <span className="text-[var(--color-muted)] shrink-0">{c.owner_email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlatformSettingsAdmin() {
  const [data, setData] = useState<Record<string, Record<string, any>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Save is DISABLED until the live values actually loaded: PUT replaces the whole
  // group, so saving blank fields rendered after a failed load silently ERASED live
  // footer/FAQ/banner content behind a "Saved - live now" toast.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadAll = () => {
    setLoadFailed(false);
    api.get<Record<string, Record<string, any>>>("/api/platform/settings/all")
      .then(d => { setData(d || {}); setLoadFailed(false); })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoaded(true));
  };
  useEffect(() => { loadAll(); }, []);
  const set = (g: string, k: string, v: any) => setData(s => ({ ...s, [g]: { ...(s[g] || {}), [k]: v } }));
  const save = async (g: string) => {
    if (loadFailed) { toast.error("Settings didn't load - saving now would wipe the live values. Retry loading first."); return; }
    setSaving(g);
    try { const res = await api.put<Record<string, any>>(`/api/platform/settings/${g}`, data[g] || {}); setData(s => ({ ...s, [g]: res })); toast.success("Saved - live now"); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setSaving(null); }
  };
  const field = (g: string, f: FieldDef) => {
    const v = data[g]?.[f.key];
    if (f.type === "bool") return (
      <label key={f.key} className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={!!v} onChange={e => set(g, f.key, e.target.checked)} /> {f.label}
      </label>
    );
    if (f.type === "select") return (
      <div key={f.key} className="flex items-center gap-3">
        <label className="w-40 shrink-0 text-xs text-[var(--color-muted)]">{f.label}</label>
        <select value={v ?? ""} onChange={e => set(g, f.key, e.target.value)} className={SETTING_INPUT}>
          {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
    if (f.type === "textarea") return (
      <div key={f.key} className="flex items-start gap-3">
        <label className="w-40 shrink-0 text-xs text-[var(--color-muted)] pt-1.5">{f.label}</label>
        <textarea value={v ?? ""} onChange={e => set(g, f.key, e.target.value)} rows={2} className={SETTING_INPUT} />
      </div>
    );
    return (
      <div key={f.key} className="flex items-center gap-3">
        <label className="w-40 shrink-0 text-xs text-[var(--color-muted)]">{f.label}</label>
        <input type={f.type === "number" ? "number" : "text"} value={v ?? ""}
          onChange={e => set(g, f.key, f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
          className={SETTING_INPUT} />
      </div>
    );
  };
  if (!loaded) return <div className="text-xs text-[var(--color-muted)]">Loading platform settings…</div>;
  if (loadFailed) return (
    <div className="text-xs bg-red-950/30 border border-red-800/40 text-red-400 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
      <span>Couldn't load the live settings - editing now would risk overwriting them with blanks.</span>
      <button onClick={loadAll} className="shrink-0 border border-red-700/40 rounded-lg px-3 py-1 hover:bg-red-900/20">Retry</button>
    </div>
  );
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-muted)]">Everything below is editable here and goes live immediately - no redeploy.</p>
      <PlatformStatsPanel />
      {Object.entries(PLATFORM_GROUPS).map(([g, cfg]) => (
        <div key={g} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-1">{cfg.title}</h3>
          <p className="text-xs text-[var(--color-muted)] mb-4">{cfg.hint}</p>
          {cfg.custom ? (
            <CustomSettingsEditor value={data[g] || {}} onChange={v => setData(s => ({ ...s, [g]: v }))} />
          ) : cfg.list ? (
            <FaqListEditor value={data[g] || {}} onChange={v => setData(s => ({ ...s, [g]: v }))} />
          ) : (
            <div className="space-y-2.5">{cfg.fields.map(f => field(g, f))}</div>
          )}
          <button onClick={() => save(g)} disabled={saving === g}
            className="mt-4 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-bg)] disabled:opacity-50">
            {saving === g ? "Saving…" : "Save"}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const tr = useT();
  const { user } = useAuth();
  const { setSelectedClient } = useApp();
  const navigate = useNavigate();

  // ── Section + lazy-load tracking (loaded gates one-time fetches per section) ──
  const [section, setSection] = useState<SectionId>("overview");
  const [loaded, setLoaded] = useState<Set<SectionId>>(new Set());
  void loaded;

  // ── Data ──
  const [stats, setStats] = useState<Stats | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  // ── Loading flags ──
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // ── Cross-section presets ──
  const [companyPlanPreset, setCompanyPlanPreset] = useState<PlanTier | "all">("all");
  const [usersSearchPreset, setUsersSearchPreset] = useState("");
  const [companiesSearchPreset, setCompaniesSearchPreset] = useState("");

  // ── Fetchers (each try/catch → toast.error; never throws) ──
  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const [s, m] = await Promise.all([
        api.get<Stats>("/api/admin/stats"),
        api.get<Metrics>("/api/admin/metrics"),
      ]);
      setStats(s);
      setMetrics(m);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const data = await api.get<Company[]>("/api/admin/companies");
      setCompanies(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await api.get<AdminUser[]>("/api/users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const data = await api.get<AuditRow[]>("/api/admin/audit?limit=500");
      setAudit(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  // Open a section, fetching its data only the first time it's seen.
  const openSection = useCallback((id: SectionId) => {
    setSection(id);
    setLoaded((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      if (id === "overview") fetchOverview();
      if (id === "companies") fetchCompanies();
      if (id === "users") { fetchUsers(); fetchCompanies(); }
      if (id === "audit") fetchAudit();
      if (id === "plans") { fetchCompanies(); fetchUsers(); }
      if (id === "platform") { fetchOverview(); fetchCompanies(); fetchUsers(); }
      return next;
    });
  }, [fetchOverview, fetchCompanies, fetchUsers, fetchAudit]);

  // Load the default section on mount. Also eagerly load companies+users regardless of
  // which section is active (A1) — the header omnibox below searches both, and it would
  // otherwise show nothing until the user happened to visit Companies or Users first.
  useEffect(() => { openSection("overview"); fetchCompanies(); fetchUsers(); }, [openSection, fetchCompanies, fetchUsers]);

  // Navigate to Companies pre-filtered to a plan (used by Plans & Platform).
  const gotoCompaniesWithPlan = useCallback((plan: PlanTier | "all") => {
    setCompanyPlanPreset(plan);
    openSection("companies");
  }, [openSection]);

  const gotoUsersWithSearch = useCallback((q: string) => {
    setUsersSearchPreset(q);
    openSection("users");
  }, [openSection]);

  const gotoCompaniesWithSearch = useCallback((q: string) => {
    setCompaniesSearchPreset(q);
    openSection("companies");
  }, [openSection]);

  // ── Mutations shared across sections ──
  // Plan changes are TENANT-level - they apply to the whole org.
  const setTenantPlan = useCallback(async (tenantId: string, plan: PlanTier) => {
    const prevCompanies = companies;
    const prevUsers = users;
    setCompanies((cs) => cs.map((c) => (c.tenant_id === tenantId ? { ...c, plan } : c)));
    setUsers((us) => us.map((u) => (u.tenant_id === tenantId ? { ...u, subscription_plan: plan } : u)));
    try {
      await api.post(`/api/admin/tenants/${tenantId}/plan`, { plan });
      toast.success(`Plan → ${PLAN_STYLE[plan].label}`);
    } catch (err) {
      setCompanies(prevCompanies);
      setUsers(prevUsers);
      toast.error(errMsg(err));
    }
  }, [companies, users]);

  const setTenantStatus = useCallback((tenantId: string, suspend: boolean) => {
    const prevCompanies = companies;
    setCompanies((cs) => cs.map((c) => (c.tenant_id === tenantId ? { ...c, status: suspend ? "suspended" : "active" } : c)));
    // Reactivating isn't destructive - apply immediately. Suspending locks every user in
    // the company out, so it gets the undo window (A10).
    if (!suspend) {
      api.post(`/api/admin/tenants/${tenantId}/activate`, {})
        .then(() => toast.success("Company activated"))
        .catch((err) => { setCompanies(prevCompanies); toast.error(errMsg(err)); });
      return;
    }
    undoableAction("Company will be suspended", async () => {
      try {
        await api.post(`/api/admin/tenants/${tenantId}/suspend`, { reason: "Admin suspension" });
        toast.success("Company suspended");
      } catch (err) {
        setCompanies(prevCompanies);
        toast.error(errMsg(err));
      }
    }, () => setCompanies(prevCompanies));
  }, [companies]);

  const enterTenant = useCallback((c: Company) => {
    const label = c.company_name || c.owner_email || c.tenant_id;
    setSelectedClient(c.tenant_id, label);
    toast.success(`Opened ${label}`);
    navigate("/dashboard");
  }, [setSelectedClient, navigate]);

  // A6's "view as role" now lives on the routed AdminUserDetailPage (A2) instead of here —
  // it needs the same setSelectedClient/setPreviewRole/preview-role-endpoint combination,
  // reimplemented there since that page isn't a child of this component.

  // ── Guard (declared AFTER all hooks so hook order stays stable) ──
  // While `user` is still resolving, render nothing rather than bouncing - a transient
  // null must not kick the real super_admin to /dashboard. Only a CONFIRMED non-admin redirects.
  if (!user) return null;
  if (user.role !== "super_admin") return <Navigate to="/dashboard" replace />;

  const NAV: { id: SectionId; label: string; icon: typeof ShieldCheck }[] = [
    { id: "overview", label: tr("admin.nav.overview"), icon: ShieldCheck },
    { id: "companies", label: tr("admin.nav.companies"), icon: Building2 },
    { id: "users", label: tr("admin.nav.users"), icon: UsersIcon },
    { id: "plans", label: tr("admin.nav.plansBilling"), icon: CreditCard },
    { id: "audit", label: tr("admin.nav.auditLog"), icon: ScrollText },
    { id: "platform", label: tr("admin.nav.platform"), icon: Server },
  ];

  return (
    <div className="w-full">
      <GlobalOmnibox companies={companies} users={users} onFindUser={gotoUsersWithSearch} onFindCompany={gotoCompaniesWithSearch} />
      <div className="flex flex-col md:flex-row gap-6 items-start">
      {/* Secondary in-page left rail (renders inside the app's outer Sidebar). */}
      <aside className="w-full md:w-[200px] shrink-0 md:sticky md:top-4 bg-[var(--color-surface)] border border-[var(--color-border)] md:border-0 md:border-r rounded-lg md:rounded-none md:pr-4">
        <div className="hidden md:block px-2 pt-2 pb-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-green-400" />
            <h2 className="text-sm font-bold">{tr("admin.consoleTitle")}</h2>
          </div>
          <span className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-900/40 text-green-300 border border-green-700/50">{tr("admin.superAdmin")}</span>
        </div>
        {/* Mobile: horizontal scroll strip. Desktop: vertical nav. */}
        <nav className="flex md:flex-col gap-1 overflow-x-auto p-1.5 md:p-0">
          {NAV.map((n) => {
            const active = section === n.id;
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => openSection(n.id)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap text-left transition-colors md:border-l-2 ${
                  active
                    ? "bg-green-900/15 text-[var(--color-text)] md:border-green-400"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/5 md:border-transparent"
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span>{n.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 w-full">
        {section === "overview" && <OverviewSection stats={stats} metrics={metrics} loading={loadingOverview} />}
        {section === "companies" && (
          <CompaniesSection
            companies={companies}
            users={users}
            loading={loadingCompanies}
            planPreset={companyPlanPreset}
            setPlanPreset={setCompanyPlanPreset}
            searchPreset={companiesSearchPreset}
            onEnter={enterTenant}
            onSetPlan={setTenantPlan}
            onSetStatus={setTenantStatus}
            reload={() => { fetchCompanies(); fetchUsers(); }}
          />
        )}
        {section === "users" && (
          <UsersSection
            users={users}
            loading={loadingUsers}
            selfId={user.id}
            searchPreset={usersSearchPreset}
            setSearchPreset={setUsersSearchPreset}
            onSetPlan={setTenantPlan}
            reload={fetchUsers}
            setUsers={setUsers}
          />
        )}
        {section === "plans" && (
          <PlansSection companies={companies} users={users} metrics={metrics} onViewCompanies={gotoCompaniesWithPlan} />
        )}
        {section === "audit" && <AuditSection rows={audit} loading={loadingAudit} />}
        {section === "platform" && (
          <div className="space-y-5">
            <PlatformSection
              stats={stats}
              metrics={metrics}
              companies={companies}
              users={users}
              onFindUser={gotoUsersWithSearch}
              onBulkPlan={gotoCompaniesWithPlan}
              onRefresh={() => { fetchOverview(); fetchCompanies(); fetchUsers(); }}
            />
            <PlatformSettingsAdmin />
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 - OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
function OverviewSection({ stats, metrics, loading }: { stats: Stats | null; metrics: Metrics | null; loading: boolean }) {
  const tr = useT();
  if (loading || !stats || !metrics) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="h-3 w-20 rounded bg-white/10 animate-pulse mb-2" />
              <div className="h-6 w-24 rounded bg-white/10 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 h-[244px]">
              <div className="h-3 w-32 rounded bg-white/10 animate-pulse mb-3" />
              <div className="h-40 w-full rounded bg-white/5 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const planMixData = PLAN_ORDER.map((p) => ({ plan: p, label: PLAN_STYLE[p].label, n: metrics.planMix[p] ?? 0 }));
  const roleRows = Object.entries(stats.byRole).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={tr("admin.stat.totalCompanies")} value={stats.companies.toLocaleString("en-IN")} sub={`${stats.activeCompanies} active`} icon={<Building2 size={13} />} />
        <StatCard label={tr("admin.stat.totalUsers")} value={stats.users.toLocaleString("en-IN")} sub="across all tenants" icon={<UsersIcon size={13} />} />
        <StatCard label={tr("admin.stat.active30d")} value={metrics.activeUsers30d.toLocaleString("en-IN")} sub="users seen recently" icon={<Activity size={13} />} />
        <StatCard label={tr("admin.stat.mrr")} value={fmtINR(metrics.mrr)} sub={`ARR ${fmtINR(metrics.arr)}`} icon={<TrendingUp size={13} />} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-sm font-semibold mb-3">{tr("admin.chart.signupsByMonth")}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={metrics.signupsByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={24} />
              <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="n" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-sm font-semibold mb-3">{tr("admin.chart.planDistribution")}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={planMixData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={60} />
              <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="n" radius={[0, 3, 3, 0]}>
                {planMixData.map((d) => <Cell key={d.plan} fill={PLAN_FILL[d.plan]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Platform Cash" value={fmtINR(stats.totalCash)} icon={<Wallet size={13} />} />
        <StatCard label="Total Revenue" value={fmtINR(stats.totalRevenue)} icon={<TrendingUp size={13} />} />
        <StatCard label="Transactions" value={stats.totalTransactions.toLocaleString()} icon={<Receipt size={13} />} />
        <StatCard label="Open Receivables" value={fmtINR(stats.totalReceivables)} icon={<Wallet size={13} />} />
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-sm font-semibold mb-3">Role breakdown</p>
        <div className="flex flex-wrap gap-2">
          {roleRows.length === 0 && <p className="text-sm text-[var(--color-muted)]">No users yet.</p>}
          {roleRows.map(([role, n]) => (
            <span key={role} className="inline-flex items-center gap-1.5">
              <RolePill role={role} />
              <span className="text-xs text-[var(--color-muted)] tabular-nums">{n}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 - COMPANIES
// ─────────────────────────────────────────────────────────────────────────────
type CompanySort = "newest" | "users" | "cash" | "active";

function PlanPicker({ current, onPick, onClose }: { current: PlanTier; onPick: (p: PlanTier) => void; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-full mt-1 z-40 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-3">
      <p className="text-[10px] text-[var(--color-muted)] mb-2 uppercase tracking-wide">Change plan (whole org)</p>
      <div className="grid grid-cols-2 gap-2">
        {PLAN_ORDER.map((p) => (
          <button
            key={p}
            onClick={() => { onPick(p); onClose(); }}
            className={`text-left rounded-lg border px-2.5 py-2 ${p === current ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10" : "border-[var(--color-border)] hover:border-[var(--color-primary)]"}`}
          >
            <div className="flex items-center justify-between">
              <PlanPill plan={p} />
              {p === current && <Check size={12} className="text-[var(--color-primary)]" />}
            </div>
            <p className="text-[11px] text-[var(--color-muted)] mt-1 tabular-nums">{PLAN_PRICE[p] ? fmtINR(PLAN_PRICE[p]) + "/mo" : "Free"}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

interface CompanyInvite { id: string; invitee_email: string; role: string; status: string; tenant_id?: string }

function CompaniesSection({
  companies, users, loading, planPreset, setPlanPreset, searchPreset, onEnter, onSetPlan, onSetStatus, reload,
}: {
  companies: Company[];
  users: AdminUser[];
  loading: boolean;
  planPreset: PlanTier | "all";
  setPlanPreset: (p: PlanTier | "all") => void;
  searchPreset: string;
  onEnter: (c: Company) => void;
  onSetPlan: (tenantId: string, plan: PlanTier) => void;
  onSetStatus: (tenantId: string, suspend: boolean) => void;
  reload: () => void;
}) {
  const [q, setQ] = useState(searchPreset);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [sort, setSort] = useState<CompanySort>("newest");
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPlanOpen, setBulkPlanOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [invites, setInvites] = useState<CompanyInvite[]>([]);

  // A7: pending invites, fetched once (super_admin sees every tenant's) and filtered
  // per-company when a row expands. Members reuse the `users` list already loaded.
  useEffect(() => {
    api.get<{ outgoing?: CompanyInvite[] }>("/api/invites").then((d) => setInvites(d.outgoing ?? [])).catch(() => {});
  }, []);

  const toggleSelect = (tid: string) => setSelected((s) => { const n = new Set(s); n.has(tid) ? n.delete(tid) : n.add(tid); return n; });

  // A5: bulk plan / suspend / export across selected companies.
  const bulkSetPlan = (plan: PlanTier) => {
    const targets = [...selected];
    setBulkPlanOpen(false);
    setSelected(new Set());
    targets.forEach((tid) => onSetPlan(tid, plan));
  };
  const bulkSuspend = () => {
    const targets = [...selected];
    setSelected(new Set());
    targets.forEach((tid) => onSetStatus(tid, true));
  };
  const bulkExport = () => {
    const rows = companies.filter((c) => selected.has(c.tenant_id));
    downloadJSON("headroom-companies-export.json", rows);
    toast.success(`Exported ${rows.length} compan${rows.length === 1 ? "y" : "ies"}`);
  };

  // A8: the DELETE /api/admin/org endpoint already existed but was never exposed in the
  // console — this is the most destructive action here, so it gets the undo window too.
  const deleteCompany = (c: Company) => {
    const label = c.company_name || c.owner_email || c.tenant_id;
    setConfirmDelete(null);
    undoableAction(`${label} and all its data will be permanently deleted`, async () => {
      try {
        await api.delete(`/api/admin/org?tenant_id=${encodeURIComponent(c.tenant_id)}`);
        toast.success(`${label} deleted`);
        reload();
      } catch (err) {
        toast.error(errMsg(err));
      }
    }, () => {});
  };

  const planCounts = useMemo(() => {
    const c: Record<string, number> = { all: companies.length, free: 0, starter: 0, growth: 0, pro: 0 };
    companies.forEach((co) => { c[co.plan] = (c[co.plan] ?? 0) + 1; });
    return c;
  }, [companies]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = companies.filter((c) => {
      if (planPreset !== "all" && c.plan !== planPreset) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        (c.company_name || "").toLowerCase().includes(needle) ||
        (c.owner_email || "").toLowerCase().includes(needle) ||
        c.tenant_id.toLowerCase().includes(needle)
      );
    });
    return [...rows].sort((a, b) => {
      if (sort === "users") return b.user_count - a.user_count;
      if (sort === "cash") return b.cash - a.cash;
      if (sort === "active") return new Date(b.last_login_at || b.last_activity || 0).getTime() - new Date(a.last_login_at || a.last_activity || 0).getTime();
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [companies, q, planPreset, statusFilter, sort]);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-[var(--color-bg)] pb-3 pt-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search company, owner or tenant…" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "suspended")} className={selectCls}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as CompanySort)} className={selectCls}>
            <option value="newest">Newest</option>
            <option value="users">Most Users</option>
            <option value="cash">Highest Cash</option>
            <option value="active">Last Active</option>
          </select>
        </div>
        <PillTabs<PlanTier | "all">
          value={planPreset}
          onChange={setPlanPreset}
          options={[
            { id: "all", label: `All (${planCounts.all})` },
            { id: "free", label: `Free (${planCounts.free})` },
            { id: "starter", label: `Starter (${planCounts.starter})` },
            { id: "growth", label: `Growth (${planCounts.growth})` },
            { id: "pro", label: `Pro (${planCounts.pro})` },
          ]}
        />
        {/* A5: bulk actions across selected companies */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2.5 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold">{selected.size} selected</span>
            <div className="relative">
              <button onClick={() => setBulkPlanOpen((v) => !v)} className="text-xs font-semibold px-2.5 py-1 rounded border border-[var(--color-border)] hover:border-[var(--color-primary)]">Change plan</button>
              {bulkPlanOpen && <PlanPicker current="free" onPick={bulkSetPlan} onClose={() => setBulkPlanOpen(false)} />}
            </div>
            <button onClick={bulkSuspend} className="text-xs font-semibold px-2.5 py-1 rounded border border-[var(--color-border)] hover:border-red-400 hover:text-red-400">Suspend</button>
            <button onClick={bulkExport} className="text-xs font-semibold px-2.5 py-1 rounded border border-[var(--color-border)] hover:border-[var(--color-primary)]">Export</button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] ml-auto">Clear</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full"><tbody>{Array.from({ length: 6 }).map((_, i) => <SkelRow key={i} cols={8} />)}</tbody></table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Building2 size={28} />} message="No companies match." />
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                <th className={`${thCls} text-left w-8`}>
                  <input type="checkbox" checked={filtered.length > 0 && filtered.every((c) => selected.has(c.tenant_id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((c) => c.tenant_id)) : new Set())}
                    className="accent-[var(--color-primary)]" aria-label="Select all" />
                </th>
                <th className={`${thCls} text-left`}>Company</th>
                <th className={`${thCls} text-left`}>Owner</th>
                <th className={`${thCls} text-right`}>Users</th>
                <th className={`${thCls} text-left`}>Plan</th>
                <th className={`${thCls} text-right`}>Cash</th>
                <th className={`${thCls} text-right`}>Revenue</th>
                <th className={`${thCls} text-left`}>Last login</th>
                <th className={`${thCls} text-left`}>Status</th>
                <th className={`${thCls} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtered.map((c) => {
                const label = c.company_name || c.owner_email || c.tenant_id;
                const isOpen = expanded === c.tenant_id;
                const members = users.filter((u) => u.tenant_id === c.tenant_id);
                const pending = invites.filter((i) => i.tenant_id === c.tenant_id && i.status === "pending");
                return (
                  <Fragment key={c.tenant_id}>
                  <tr className="group hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <input type="checkbox" checked={selected.has(c.tenant_id)} onChange={() => toggleSelect(c.tenant_id)} className="accent-[var(--color-primary)]" aria-label={`Select ${label}`} />
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => setExpanded(isOpen ? null : c.tenant_id)} className="font-semibold hover:text-[var(--color-primary)] flex items-center gap-1">
                        {c.company_name || c.owner_email || "-"}
                        <ChevronDown size={12} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      <CopyId id={c.tenant_id} chars={10} />
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] truncate max-w-[170px]">{c.owner_email || "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.user_count}</td>
                    <td className="px-4 py-2.5"><PlanPill plan={c.plan} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtINR(c.cash)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{fmtINR(c.revenue)}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{relTime(c.last_login_at)}</td>
                    <td className="px-4 py-2.5"><StatusDot active={c.status !== "suspended"} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onEnter(c)} title="Enter company" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><LogIn size={14} /></button>
                        <div className="relative">
                          <button onClick={() => setOpenPlan(openPlan === c.tenant_id ? null : c.tenant_id)} title="Change plan" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><CreditCard size={14} /></button>
                          {openPlan === c.tenant_id && (
                            <PlanPicker current={c.plan} onPick={(p) => onSetPlan(c.tenant_id, p)} onClose={() => setOpenPlan(null)} />
                          )}
                        </div>
                        <div className="relative">
                          {c.status === "suspended" ? (
                            <button onClick={() => onSetStatus(c.tenant_id, false)} title="Activate" className="text-[var(--color-muted)] hover:text-green-400"><Power size={14} /></button>
                          ) : (
                            <button onClick={() => setConfirmSuspend(confirmSuspend === c.tenant_id ? null : c.tenant_id)} title="Suspend" className="text-[var(--color-muted)] hover:text-red-400"><Power size={14} /></button>
                          )}
                          {confirmSuspend === c.tenant_id && (
                            <ConfirmPopover
                              danger
                              confirmLabel="Suspend"
                              message={`Suspend "${label}"? Everyone in this company is locked out until reactivated.`}
                              onConfirm={() => { onSetStatus(c.tenant_id, true); setConfirmSuspend(null); }}
                              onCancel={() => setConfirmSuspend(null)}
                            />
                          )}
                        </div>
                        <div className="relative">
                          <button onClick={() => setConfirmDelete(confirmDelete === c.tenant_id ? null : c.tenant_id)} title="Delete company" className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                          {confirmDelete === c.tenant_id && (
                            <ConfirmPopover
                              danger
                              confirmLabel="Delete permanently"
                              message={`Permanently delete "${label}" — all ${c.user_count} user(s), invoices, transactions and books? This cannot be undone after a few seconds.`}
                              onConfirm={() => deleteCompany(c)}
                              onCancel={() => setConfirmDelete(null)}
                            />
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${c.tenant_id}-detail`}>
                      <td colSpan={10} className="bg-[var(--color-bg)] px-6 py-4">
                        {/* A7: members + pending invites for this company in one place */}
                        <div className="grid md:grid-cols-2 gap-6 text-xs">
                          <div>
                            <p className="font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Members ({members.length})</p>
                            {members.length === 0 ? <p className="text-[var(--color-muted)]">No members loaded.</p> : (
                              <div className="space-y-1.5">
                                {members.map((m) => (
                                  <div key={m.id} className="flex items-center justify-between gap-2">
                                    <span className="truncate">{m.display_name || m.email}</span>
                                    <RolePill role={m.role} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Pending invites ({pending.length})</p>
                            {pending.length === 0 ? <p className="text-[var(--color-muted)]">None pending.</p> : (
                              <div className="space-y-1.5">
                                {pending.map((i) => (
                                  <div key={i.id} className="flex items-center justify-between gap-2">
                                    <span className="truncate">{i.invitee_email}</span>
                                    <span className="text-[var(--color-muted)]">{roleLabel(i.role)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 - USERS
// ─────────────────────────────────────────────────────────────────────────────
const USER_ROLES: UserRole[] = ["super_admin", "owner", "finance_manager", "accountant", "sales", "operations_manager", "viewer", "investor"];
const PAGE_SIZE = 25;

// Short, human "what can this role reach" summary for the access-levels legend.
const ROLE_SCOPE: Record<string, string> = {
  super_admin: "Everything - platform-wide, all companies",
  owner: "Full access to their own organisation",
  finance_manager: "Cash, invoices, GST, payroll, forecasts",
  accountant: "Books, GST, compliance, statements",
  sales: "Invoices, receivables, collections",
  operations_manager: "Operations, vendors, inventory",
  investor: "Cap table, valuation, investor views",
  viewer: "Read-only dashboards",
};

function UsersSection({
  users, loading, selfId, searchPreset, setSearchPreset, onSetPlan, reload, setUsers,
}: {
  users: AdminUser[];
  loading: boolean;
  selfId: string;
  searchPreset: string;
  setSearchPreset: (q: string) => void;
  onSetPlan: (tenantId: string, plan: PlanTier) => void;
  reload: () => void;
  setUsers: React.Dispatch<React.SetStateAction<AdminUser[]>>;
}) {
  const [q, setQ] = useState(searchPreset);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "suspended">("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals & inline action state
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [resetInfo, setResetInfo] = useState<{ email: string; password: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmOwner, setConfirmOwner] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [bulkRoleOpen, setBulkRoleOpen] = useState(false);
  const [bulkPlanOpen, setBulkPlanOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const navigate = useNavigate();

  // Apply a preset search coming from another section, then clear it.
  useEffect(() => {
    if (searchPreset) { setQ(searchPreset); setSearchPreset(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setPage(0); }, [q, roleFilter, planFilter, statusFilter]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (planFilter !== "all" && (u.subscription_plan ?? "free") !== planFilter) return false;
      if (statusFilter !== "all" && userStatus(u) !== statusFilter) return false;
      if (!needle) return true;
      return (
        u.email.toLowerCase().includes(needle) ||
        (u.display_name || "").toLowerCase().includes(needle) ||
        u.id.toLowerCase().includes(needle) ||
        u.tenant_id.toLowerCase().includes(needle)
      );
    });
  }, [users, q, roleFilter, planFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(pageClamped * PAGE_SIZE, pageClamped * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : pageClamped * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (pageClamped + 1) * PAGE_SIZE);

  const pendingCount = users.filter((u) => userStatus(u) === "pending").length;
  const suspendedCount = users.filter((u) => userStatus(u) === "suspended").length;

  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((u) => selected.has(u.id));
  const toggleSelectPage = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allOnPageSelected) pageRows.forEach((u) => next.delete(u.id));
    else pageRows.forEach((u) => next.add(u.id));
    return next;
  });

  // ── Per-user mutations ──
  const saveEdit = async (u: AdminUser, displayName: string, role: string, plan: PlanTier) => {
    const prev = users;
    const calls: Promise<unknown>[] = [];
    // Display-name edits use the /profile endpoint; role edits use PATCH /:id.
    if (displayName !== (u.display_name ?? "")) calls.push(api.patch(`/api/users/${u.id}/profile`, { display_name: displayName }));
    if (role !== u.role) calls.push(api.patch(`/api/users/${u.id}`, { role }));
    setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, display_name: displayName, role } : x)));
    try {
      await Promise.all(calls);
      // Plan is tenant-level - routed through the shared mutation.
      if (plan !== (u.subscription_plan ?? "free")) onSetPlan(u.tenant_id, plan);
      toast.success("User updated");
      setEditUser(null);
    } catch (err) {
      setUsers(prev);
      toast.error(errMsg(err));
    }
  };

  const resetPassword = async (u: AdminUser) => {
    try {
      const { password } = await api.post<{ password: string }>(`/api/admin/users/${u.id}/reset`, {});
      setResetInfo({ email: u.email, password });
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const makeOwner = async (u: AdminUser) => {
    try {
      await api.post(`/api/users/${u.id}/make-owner`, {});
      toast.success(`${u.email} is now owner`);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const deleteUser = (u: AdminUser) => {
    const prev = users;
    setUsers((us) => us.filter((x) => x.id !== u.id));
    setSelected((s) => { const n = new Set(s); n.delete(u.id); return n; });
    undoableAction(`${u.email} will be deleted`, async () => {
      try {
        await api.delete(`/api/users/${u.id}`);
        toast.success("User deleted");
      } catch (err) {
        setUsers(prev);
        toast.error(errMsg(err));
      }
    }, () => setUsers(prev));
  };

  // Per-user activate / deactivate. A suspended user is locked out immediately.
  const toggleActive = async (u: AdminUser) => {
    const next = userStatus(u) === "suspended" ? "active" : "suspended";
    const prev = users;
    setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, status: next } : x)));
    try {
      await api.post(`/api/users/${u.id}/status`, { status: next });
      toast.success(next === "suspended" ? `${u.email} deactivated` : `${u.email} reactivated`);
    } catch (err) {
      setUsers(prev);
      toast.error(errMsg(err));
    }
  };

  // ── Bulk mutations (sequential per wiring; reload after) ──
  const bulkChangeRole = async (role: string) => {
    const targets = users.filter((u) => selected.has(u.id) && u.id !== selfId);
    setBulkRoleOpen(false);
    try {
      for (const u of targets) await api.patch(`/api/users/${u.id}`, { role });
      toast.success(`${targets.length} user(s) → ${roleLabel(role)}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSelected(new Set());
      reload();
    }
  };

  const bulkChangePlan = async (plan: PlanTier) => {
    // Dedupe tenant_ids → one /plan call each.
    const tenants = [...new Set(users.filter((u) => selected.has(u.id)).map((u) => u.tenant_id))];
    setBulkPlanOpen(false);
    try {
      for (const t of tenants) await api.post(`/api/admin/tenants/${t}/plan`, { plan });
      toast.success(`${tenants.length} org(s) → ${PLAN_STYLE[plan].label}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSelected(new Set());
      reload();
    }
  };

  const bulkDelete = () => {
    const targets = users.filter((u) => selected.has(u.id) && u.id !== selfId);
    const prev = users;
    setConfirmBulkDelete(false);
    setUsers((us) => us.filter((x) => !targets.some((t) => t.id === x.id)));
    setSelected(new Set());
    undoableAction(`${targets.length} user(s) will be deleted`, async () => {
      try {
        for (const u of targets) await api.delete(`/api/users/${u.id}`);
        toast.success(`${targets.length} user(s) deleted`);
      } catch (err) {
        toast.error(errMsg(err));
      } finally {
        reload();
      }
    }, () => setUsers(prev));
  };

  const onInvited = (u: AdminUser) => { setUsers((us) => [u, ...us]); };
  const bulkDeletableCount = users.filter((u) => selected.has(u.id) && u.id !== selfId).length;
  const orgCount = new Set(users.map((u) => u.tenant_id)).size;

  // Export the currently-filtered users (every field) as a CSV download.
  const CSV_COLS = ["id", "email", "display_name", "role", "tenant_id", "subscription_plan", "status", "first_login", "login_count", "created_at", "last_login_at", "last_active_at"] as const;
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [CSV_COLS.join(",")];
    for (const u of filtered) {
      lines.push([u.id, u.email, u.display_name ?? "", u.role, u.tenant_id, u.subscription_plan ?? "free", userStatus(u), u.first_login, u.login_count ?? 0, u.created_at, u.last_login_at ?? "", u.last_active_at ?? ""].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `headroom-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${filtered.length} user(s)`);
  };

  return (
    <div className="space-y-4">
      {/* WHERE CHANGES APPEAR - what this section actually controls */}
      <div className="rounded-lg border border-amber-700/40 bg-amber-900/15 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1.5">Where changes appear</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-amber-200/90">
          <span>→ Who can log in</span>
          <span>→ Role-based tab access</span>
          <span>→ All protected API endpoints</span>
          <span>→ Audit log</span>
        </div>
        <p className="text-[11px] text-amber-200/70 mt-2 italic">Deactivating a user immediately revokes their sessions. Role changes apply on their next page load.</p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="px-2.5 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]">Total <strong className="text-[var(--color-text)]">{users.length}</strong></span>
          <span className="px-2.5 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]">Orgs <strong className="text-[var(--color-text)]">{orgCount}</strong></span>
          <span className="px-2.5 py-1 rounded-full bg-amber-900/30 text-amber-300 border border-amber-700/40">Pending <strong>{pendingCount}</strong></span>
          <span className="px-2.5 py-1 rounded-full bg-red-900/30 text-red-300 border border-red-700/40">Suspended <strong>{suspendedCount}</strong></span>
          <span className="text-[var(--color-muted)]">· Changes take effect immediately</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reload} title="Refresh" className="flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]">
            <RefreshCw size={13} />
          </button>
          <button onClick={exportCsv} title="Export filtered users as CSV" className="flex items-center gap-1.5 text-xs font-semibold border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]">
            <Download size={13} /> Export CSV
          </button>
          <button onClick={() => setShowImport(true)} title="Bulk-import users from CSV" className="flex items-center gap-1.5 text-xs font-semibold border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]">
            <Upload size={13} /> Import CSV
          </button>
          <button onClick={() => setShowInvite(true)} className="flex items-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg hover:opacity-90">
            <UserPlus size={13} /> Invite User
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search email, name, id or tenant…" />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={selectCls}>
          <option value="all">All roles</option>
          {USER_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
        </select>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className={selectCls}>
          <option value="all">All plans</option>
          {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_STYLE[p].label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "pending" | "suspended")} className={selectCls}>
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="pending">Pending setup</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2.5">
          <span className="text-xs font-semibold">{selected.size} selected</span>
          <div className="relative">
            <button onClick={() => setBulkRoleOpen((v) => !v)} className="text-xs px-2.5 py-1 rounded border border-[var(--color-border)] hover:border-[var(--color-primary)]">Change Role ▾</button>
            {bulkRoleOpen && (
              <div className="absolute left-0 top-full mt-1 z-40 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-1">
                {USER_ROLES.map((r) => (
                  <button key={r} onClick={() => bulkChangeRole(r)} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-white/5">{roleLabel(r)}</button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setBulkPlanOpen((v) => !v)} className="text-xs px-2.5 py-1 rounded border border-[var(--color-border)] hover:border-[var(--color-primary)]">Change Plan ▾</button>
            {bulkPlanOpen && (
              <div className="absolute left-0 top-full mt-1 z-40 w-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-1">
                {PLAN_ORDER.map((p) => (
                  <button key={p} onClick={() => bulkChangePlan(p)} className="w-full flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-white/5">
                    <PlanPill plan={p} /><span className="text-[var(--color-muted)]">{PLAN_PRICE[p] ? fmtINR(PLAN_PRICE[p]) : "Free"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setConfirmBulkDelete((v) => !v)} className="text-xs px-2.5 py-1 rounded border border-red-700/50 text-red-300 hover:bg-red-900/20 flex items-center gap-1"><Trash2 size={12} /> Delete Selected</button>
            {confirmBulkDelete && (
              <ConfirmPopover danger confirmLabel="Delete" message={`Delete ${bulkDeletableCount} user(s)? This is permanent.`} onConfirm={bulkDelete} onCancel={() => setConfirmBulkDelete(false)} />
            )}
          </div>
          <button onClick={() => setSelected(new Set())} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] ml-auto">Clear</button>
        </div>
      )}

      {loading ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full"><tbody>{Array.from({ length: 8 }).map((_, i) => <SkelRow key={i} cols={10} />)}</tbody></table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<UsersIcon size={28} />} message="No users match." />
      ) : (
        <>
          <div className="space-y-2">
            {pageRows.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] px-1 cursor-pointer">
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectPage} className="accent-[var(--color-primary)]" /> Select all on page
              </label>
            )}
            {pageRows.map((u) => {
              const isSelf = u.id === selfId;
              const st = userStatus(u);
              return (
                <div key={u.id} className={`flex items-center justify-between gap-3 bg-[var(--color-surface)] border rounded-lg px-4 py-3 transition-colors ${selected.has(u.id) ? "border-[var(--color-primary)]/50" : "border-[var(--color-border)] hover:border-[var(--color-border)] hover:bg-white/[0.02]"}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} className="accent-[var(--color-primary)] shrink-0" aria-label="Select user" />
                    <button onClick={() => navigate(`/admin/users/${u.id}`)} className="flex items-center gap-3 text-left min-w-0 hover:opacity-90">
                      <span className={`w-9 h-9 rounded-full ${avatarBg(u.email)} text-white text-xs font-semibold flex items-center justify-center shrink-0`}>{initials(u)}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold truncate">{u.display_name || u.email.split("@")[0]}{isSelf && <span className="ml-1 text-[10px] text-[var(--color-muted)] font-normal">(you)</span>}</span>
                          <RolePill role={u.role} />
                          <PlanPill plan={u.subscription_plan ?? "free"} />
                          {st === "active" && <Check size={13} className="text-[var(--color-primary)]" aria-label="Active" />}
                          {st === "pending" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-300 border border-amber-700/40">Invite pending</span>}
                          {st === "suspended" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-700/40">Deactivated</span>}
                        </div>
                        <p className="text-[11px] text-[var(--color-muted)] truncate">{u.email} · {st === "pending" ? "Awaiting first login" : `Last login: ${relTime(u.last_login_at)}`}</p>
                      </div>
                    </button>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {st === "pending" && <button onClick={() => resetPassword(u)} title="Re-issue credentials" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Mail size={15} /></button>}
                    <button onClick={() => navigate(`/admin/users/${u.id}`)} title="View details" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Eye size={15} /></button>
                    <button onClick={() => setEditUser(u)} title="Edit" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Pencil size={15} /></button>
                    <button onClick={() => resetPassword(u)} title="Reset password" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><KeyRound size={15} /></button>
                    <div className="relative">
                      <button onClick={() => setConfirmOwner(confirmOwner === u.id ? null : u.id)} title="Make owner" className="text-[var(--color-muted)] hover:text-green-400"><Crown size={15} /></button>
                      {confirmOwner === u.id && (
                        <ConfirmPopover confirmLabel="Make owner" message={`Make ${u.email} the owner of this org?`} onConfirm={() => { makeOwner(u); setConfirmOwner(null); }} onCancel={() => setConfirmOwner(null)} />
                      )}
                    </div>
                    {!isSelf && (
                      <>
                        <button onClick={() => toggleActive(u)} title={st === "suspended" ? "Reactivate" : "Deactivate"} className={`text-[var(--color-muted)] ${st === "suspended" ? "hover:text-green-400" : "hover:text-amber-400"}`}><Power size={15} /></button>
                        <div className="relative">
                          <button onClick={() => setConfirmDelete(confirmDelete === u.id ? null : u.id)} title="Delete" className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={15} /></button>
                          {confirmDelete === u.id && (
                            <ConfirmPopover danger confirmLabel="Delete" message={`Delete ${u.email}? This is permanent.`} onConfirm={() => { deleteUser(u); setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Showing {from}-{to} of {filtered.length}</span>
            <div className="flex items-center gap-2">
              <button disabled={pageClamped === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-2.5 py-1 rounded border border-[var(--color-border)] disabled:opacity-30 hover:border-[var(--color-primary)]">Prev</button>
              <span>{pageClamped + 1} / {totalPages}</span>
              <button disabled={pageClamped + 1 >= totalPages} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} className="px-2.5 py-1 rounded border border-[var(--color-border)] disabled:opacity-30 hover:border-[var(--color-primary)]">Next</button>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-3">Role access levels</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5">
              {USER_ROLES.map((r) => (
                <div key={r} className="flex items-start gap-2 text-xs">
                  <RolePill role={r} />
                  <span className="text-[var(--color-muted)] mt-0.5">{ROLE_SCOPE[r] ?? "-"}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={saveEdit} />}
      {resetInfo && <ResetPasswordModal info={resetInfo} onClose={() => setResetInfo(null)} />}
      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} onInvited={onInvited} />}
      {showImport && <ImportUsersModal onClose={() => setShowImport(false)} onSetPlan={onSetPlan} onDone={reload} />}
    </div>
  );
}

function EditUserModal({ user, onClose, onSave }: { user: AdminUser; onClose: () => void; onSave: (u: AdminUser, name: string, role: string, plan: PlanTier) => void }) {
  const [name, setName] = useState(user.display_name ?? "");
  const [role, setRole] = useState(user.role);
  const [plan, setPlan] = useState<PlanTier>(user.subscription_plan ?? "free");
  return (
    <Modal title="Edit user" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={`w-full ${selectCls}`}>
            {USER_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Plan <span className="text-[10px]">(tenant-level - applies to the whole org)</span></label>
          <select value={plan} onChange={(e) => setPlan(e.target.value as PlanTier)} className={`w-full ${selectCls}`}>
            {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_STYLE[p].label} · {PLAN_PRICE[p] ? fmtINR(PLAN_PRICE[p]) + "/mo" : "Free"}</option>)}
          </select>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] font-mono break-all">{user.email}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)]">Cancel</button>
          <button onClick={() => onSave(user, name.trim(), role, plan)} className="text-sm font-semibold px-4 py-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90">Save</button>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ info, onClose }: { info: { email: string; password: string }; onClose: () => void }) {
  return (
    <Modal title="Temporary password" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm">Temp password for <strong>{info.email}</strong>. Shown once - share it securely.</p>
        <div className="flex items-center gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
          <code className="font-mono text-sm flex-1 break-all">{info.password}</code>
          <button onClick={() => { navigator.clipboard.writeText(info.password); toast.success("Copied!"); }} className="text-[var(--color-primary)] hover:opacity-80 shrink-0"><Copy size={15} /></button>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="text-sm font-semibold px-4 py-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90">Done</button>
        </div>
      </div>
    </Modal>
  );
}

function InviteUserModal({ onClose, onInvited }: { onClose: () => void; onInvited: (u: AdminUser) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("owner");
  const [tenant, setTenant] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim()) { toast.error("Email is required"); return; }
    setBusy(true);
    try {
      const body: Record<string, string> = { email: email.trim().toLowerCase(), role };
      if (tenant.trim()) body.tenant_id = tenant.trim();
      const created = await api.post<AdminUser>("/api/users", body);
      onInvited(created);
      toast.success(`Created ${created.email}`);
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Invite user" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Email <span className="text-red-400">*</span></label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={`w-full ${selectCls}`}>
            {USER_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Tenant ID <span className="text-[10px]">(optional - blank creates a new org)</span></label>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="leave blank for new" className={`w-full font-mono ${inputCls}`} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)]">Cancel</button>
          <button onClick={submit} disabled={busy} className="text-sm font-semibold px-4 py-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 disabled:opacity-50">Create</button>
        </div>
      </div>
    </Modal>
  );
}


// Minimal quoted-CSV line parser (handles "" escapes inside quoted fields).
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === ",") { out.push(cur); cur = ""; }
    else if (ch === '"') inQ = true;
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Bulk-import users from CSV (header row required; only `email` is mandatory).
function ImportUsersModal({ onClose, onSetPlan, onDone }: {
  onClose: () => void; onSetPlan: (tid: string, plan: PlanTier) => void; onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);

  const run = async () => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast.error("Paste a CSV with a header row + at least one user"); return; }
    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const col = (n: string) => header.indexOf(n);
    const ei = col("email");
    if (ei < 0) { toast.error('CSV must have an "email" column'); return; }
    const ri = col("role"), ti = col("tenant_id"), ni = col("display_name");
    const pi = col("subscription_plan") >= 0 ? col("subscription_plan") : col("plan");
    setBusy(true);
    let ok = 0, fail = 0; const errors: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const c = parseCsvLine(lines[i]);
      const email = (c[ei] || "").trim().toLowerCase();
      if (!email) continue;
      const role = ri >= 0 && c[ri] ? c[ri].trim() : "viewer";
      const tenant_id = ti >= 0 ? (c[ti] || "").trim() : "";
      const name = ni >= 0 ? (c[ni] || "").trim() : "";
      const plan = pi >= 0 ? (c[pi] || "").trim().toLowerCase() : "";
      try {
        const body: Record<string, string> = { email, role };
        if (tenant_id) body.tenant_id = tenant_id;
        const created = await api.post<AdminUser>("/api/users", body);
        if (name) await api.patch(`/api/users/${created.id}/profile`, { display_name: name }).catch(() => {});
        if (["starter", "growth", "pro"].includes(plan) && created.tenant_id) onSetPlan(created.tenant_id, plan as PlanTier);
        ok++;
      } catch (err) { fail++; if (errors.length < 8) errors.push(`${email}: ${errMsg(err)}`); }
    }
    setBusy(false);
    setResult({ ok, fail, errors });
    if (ok) { toast.success(`Imported ${ok} user(s)`); onDone(); }
    else if (fail) toast.error(`All ${fail} row(s) failed`);
  };

  return (
    <Modal title="Import users from CSV" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-[var(--color-muted)]">
          Header row required. Columns: <code className="text-[var(--color-text)]">email</code> (required), and optionally <code className="text-[var(--color-text)]">role, tenant_id, display_name, plan</code>. Blank <code>tenant_id</code> creates a new org per user.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setText); }} className="text-xs text-[var(--color-muted)] file:mr-2 file:text-xs file:rounded file:border file:border-[var(--color-border)] file:bg-[var(--color-bg)] file:px-2 file:py-1 file:text-[var(--color-text)]" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={"email,role,tenant_id,display_name,plan\npriya@acme.in,finance_manager,,Priya Shah,growth"} className={`w-full font-mono text-xs ${inputCls}`} />
        {result && (
          <div className="text-xs rounded-lg border border-[var(--color-border)] p-2.5 space-y-1">
            <p><span className="text-green-400 font-semibold">{result.ok} imported</span>{result.fail ? <span className="text-red-400 font-semibold"> · {result.fail} failed</span> : null}</p>
            {result.errors.map((e, i) => <p key={i} className="text-[var(--color-muted)] truncate">{e}</p>)}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)]">Close</button>
          <button onClick={run} disabled={busy} className="text-sm font-semibold px-4 py-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"><Upload size={13} /> {busy ? "Importing…" : "Import"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 - PLANS & BILLING
// ─────────────────────────────────────────────────────────────────────────────
const FEATURE_ROWS = ["Forecast", "Analytics", "Payroll", "Credit", "AI CFO", "Connectors", "Automation", "Scenarios", "Priority Support"] as const;
type FeatureRow = (typeof FEATURE_ROWS)[number];

// Per spec: growth gets these; pro gets everything; free/starter get none of these.
const GROWTH_FEATURES: Set<FeatureRow> = new Set(["Forecast", "Analytics", "Payroll", "AI CFO", "Scenarios"]);

function planHasFeature(plan: PlanTier, feature: FeatureRow): boolean {
  if (plan === "pro") return true;
  if (plan === "growth") return GROWTH_FEATURES.has(feature);
  return false;
}

function PlansSection({ companies, users, metrics, onViewCompanies }: { companies: Company[]; users: AdminUser[]; metrics: Metrics | null; onViewCompanies: (plan: PlanTier) => void }) {
  const byPlan = useMemo(() => {
    const map: Record<PlanTier, { companies: number; users: number; confirmed: number }> = {
      free: { companies: 0, users: 0, confirmed: 0 }, starter: { companies: 0, users: 0, confirmed: 0 },
      growth: { companies: 0, users: 0, confirmed: 0 }, pro: { companies: 0, users: 0, confirmed: 0 },
    };
    companies.forEach((c) => {
      map[c.plan].companies += 1;
      map[c.plan].users += c.user_count;
      // Confirmed = actually billed via a payment provider, not an admin comp/override
      // (A9): the real fact behind the plan flag, not just "what the flag says."
      if (c.billing_provider && c.billing_provider !== "admin") map[c.plan].confirmed += 1;
    });
    // Fall back to user records if company list hasn't loaded user counts yet.
    if (companies.length === 0) {
      users.forEach((u) => { const p = u.subscription_plan ?? "free"; map[p].users += 1; });
    }
    return map;
  }, [companies, users]);

  const totalMRR = PLAN_ORDER.reduce((sum, p) => sum + byPlan[p].companies * PLAN_PRICE[p], 0);
  const totalCompanies = PLAN_ORDER.reduce((s, p) => s + byPlan[p].companies, 0);
  const totalUsers = PLAN_ORDER.reduce((s, p) => s + byPlan[p].users, 0);

  return (
    <div className="space-y-5">
      {/* Confirmed (billed) vs list-price MRR, and the one real downgrade signal available
          today — no cancellation webhook exists yet, so this can't see self-serve churn. */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="List-price MRR" value={fmtINR(metrics.mrr)} sub={`${metrics.paidTenants} on a paid plan`} icon={<Wallet size={13} />} />
          <StatCard label="Confirmed MRR (billed)" value={fmtINR(metrics.confirmedMrr)} sub={`${metrics.confirmedPaidTenants} paid via Razorpay`} icon={<CreditCard size={13} />} />
          <StatCard label="Admin-granted plans" value={String(metrics.paidTenants - metrics.confirmedPaidTenants)} sub="Comp / trial / manual override" icon={<Crown size={13} />} />
          <StatCard label="Downgraded to Free (30d)" value={String(metrics.downgradedToFree30d)} sub="Recorded plan_change events only" icon={<TrendingUp size={13} />} />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PLAN_ORDER.map((p) => {
          const mrr = byPlan[p].companies * PLAN_PRICE[p];
          return (
            <div key={p} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <PlanPill plan={p} />
                <span className="text-xs text-[var(--color-muted)] tabular-nums">{PLAN_PRICE[p] ? fmtINR(PLAN_PRICE[p]) + "/mo" : "Free"}</span>
              </div>
              <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{byPlan[p].companies} <span className="text-xs font-normal text-[var(--color-muted)]">companies</span></p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">{byPlan[p].users} users</p>
              {PLAN_PRICE[p] > 0 && <p className="text-xs text-[var(--color-muted)] mt-0.5">{byPlan[p].confirmed} confirmed billed · {byPlan[p].companies - byPlan[p].confirmed} admin-granted</p>}
              <p className="text-xs text-[var(--color-muted)] mt-1">MRR <strong className="text-[var(--color-text)]">{fmtINR(mrr)}</strong></p>
              <button onClick={() => onViewCompanies(p)} className="text-xs text-[var(--color-primary)] hover:underline mt-auto pt-2 text-left">View companies →</button>
            </div>
          );
        })}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <p className="text-sm font-semibold px-4 pt-4 pb-2">Feature comparison</p>
        <table className="w-full text-sm min-w-[520px]">
          <thead className="border-y border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              <th className={`${thCls} text-left`}>Feature</th>
              {PLAN_ORDER.map((p) => <th key={p} className={`${thCls} text-center`}>{PLAN_STYLE[p].label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {FEATURE_ROWS.map((f) => (
              <tr key={f} className="hover:bg-white/5">
                <td className="px-4 py-2.5 font-medium">{f}</td>
                {PLAN_ORDER.map((p) => (
                  <td key={p} className="px-4 py-2.5 text-center">
                    {planHasFeature(p, f) ? <Check size={15} className="inline text-green-400" /> : <span className="text-[var(--color-muted)]">-</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <p className="text-sm font-semibold px-4 pt-4 pb-2">MRR breakdown</p>
        <table className="w-full text-sm min-w-[520px]">
          <thead className="border-y border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              <th className={`${thCls} text-left`}>Plan</th>
              <th className={`${thCls} text-right`}>Companies</th>
              <th className={`${thCls} text-right`}>Users</th>
              <th className={`${thCls} text-right`}>Monthly</th>
              <th className={`${thCls} text-right`}>Annual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {PLAN_ORDER.map((p) => {
              const monthly = byPlan[p].companies * PLAN_PRICE[p];
              return (
                <tr key={p} className="hover:bg-white/5">
                  <td className="px-4 py-2.5"><PlanPill plan={p} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{byPlan[p].companies}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{byPlan[p].users}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtINR(monthly)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtINR(monthly * 12)}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-[var(--color-border)] font-semibold bg-[var(--color-bg)]">
              <td className="px-4 py-2.5">Total</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{totalCompanies}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{totalUsers}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{fmtINR(totalMRR)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{fmtINR(totalMRR * 12)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 - AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────
const AUDIT_PAGE = 50;
type DateRange = "today" | "7d" | "30d" | "all";

function actionPillClass(action: string): string {
  if (action.endsWith(".delete")) return "bg-red-900/30 text-red-300";
  if (action.endsWith(".create")) return "bg-green-900/30 text-green-300";
  if (action.endsWith(".update")) return "bg-blue-900/30 text-blue-300";
  if (action.startsWith("tenant.")) return "bg-purple-900/30 text-purple-300";
  if (action.startsWith("user.")) return "bg-amber-900/30 text-amber-300";
  if (action.startsWith("admin.")) return "bg-orange-900/30 text-orange-300";
  return "bg-[var(--color-bg)] text-[var(--color-muted)]";
}

function metaToString(meta: unknown): string {
  if (meta == null) return "-";
  try { return typeof meta === "string" ? meta : JSON.stringify(meta); } catch { return String(meta); }
}

function metaToPre(meta: unknown): string {
  if (meta == null) return "-";
  try { return JSON.stringify(meta, null, 2) ?? "-"; } catch { return String(meta); }
}

// Date guards - server timestamps can be null/invalid; never let date-fns throw.
function safeFmt(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : format(d, "dd MMM, HH:mm");
}
function safeIso(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
function tms(iso?: string | null): number {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

function AuditSection({ rows, loading }: { rows: AuditRow[]; loading: boolean }) {
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("all");
  const [actionType, setActionType] = useState("all");
  const [range, setRange] = useState<DateRange>("all");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { setPage(0); }, [q, actor, actionType, range]);

  const actors = useMemo(() => [...new Set(rows.map((r) => r.actor_email).filter(Boolean))].sort(), [rows]);
  const actions = useMemo(() => [...new Set(rows.map((r) => r.action).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const now = Date.now();
    const cutoff = range === "today" ? now - 86400000 : range === "7d" ? now - 7 * 86400000 : range === "30d" ? now - 30 * 86400000 : 0;
    return rows
      .filter((r) => {
        if (actor !== "all" && r.actor_email !== actor) return false;
        if (actionType !== "all" && r.action !== actionType) return false;
        if (cutoff && tms(r.created_at) < cutoff) return false;
        if (!needle) return true;
        return (
          r.action.toLowerCase().includes(needle) ||
          r.entity.toLowerCase().includes(needle) ||
          (r.actor_email || "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => tms(b.created_at) - tms(a.created_at));
  }, [rows, q, actor, actionType, range]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE));
  const pageClamped = Math.min(page, totalPages - 1);
  const start = pageClamped * AUDIT_PAGE;
  const pageRows = filtered.slice(start, start + AUDIT_PAGE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search action, entity or actor…" />
        <select value={actor} onChange={(e) => setActor(e.target.value)} className={`max-w-[180px] ${selectCls}`}>
          <option value="all">All actors</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={actionType} onChange={(e) => setActionType(e.target.value)} className={`max-w-[180px] ${selectCls}`}>
          <option value="all">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {/* One-click: review every god-mode edit you made inside a customer's account. */}
        <button type="button"
          onClick={() => setActionType(actionType === "impersonated_write" ? "all" : "impersonated_write")}
          title="Show only edits made while impersonating a tenant (super-admin god-mode writes)"
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${actionType === "impersonated_write" ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}>
          🛡 God-mode edits
        </button>
        <PillTabs<DateRange>
          value={range}
          onChange={setRange}
          options={[
            { id: "today", label: "Today" },
            { id: "7d", label: "7d" },
            { id: "30d", label: "30d" },
            { id: "all", label: "All" },
          ]}
        />
      </div>

      {loading ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full"><tbody>{Array.from({ length: 8 }).map((_, i) => <SkelRow key={i} cols={5} />)}</tbody></table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Ghost size={28} />} message="No audit events yet" />
      ) : (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  <th className={`${thCls} text-left`}>Time</th>
                  <th className={`${thCls} text-left`}>Actor</th>
                  <th className={`${thCls} text-left`}>Action</th>
                  <th className={`${thCls} text-left`}>Entity</th>
                  <th className={`${thCls} text-left`}>Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {pageRows.map((r) => (
                  <AuditRowView key={r.id} row={r} open={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Showing {start + 1}-{Math.min(start + AUDIT_PAGE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-2">
              <button disabled={pageClamped === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-2.5 py-1 rounded border border-[var(--color-border)] disabled:opacity-30 hover:border-[var(--color-primary)]">Prev</button>
              <span>{pageClamped + 1} / {totalPages}</span>
              <button disabled={pageClamped + 1 >= totalPages} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} className="px-2.5 py-1 rounded border border-[var(--color-border)] disabled:opacity-30 hover:border-[var(--color-primary)]">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// A single audit row plus its expandable full-meta <pre>. Wraps both sibling rows
// so each carries a stable key cleanly.
function AuditRowView({ row, open, onToggle }: { row: AuditRow; open: boolean; onToggle: () => void }) {
  const detail = metaToString(row.meta);
  const truncated = detail.length > 80 ? detail.slice(0, 80) + "…" : detail;
  return (
    <>
      <tr className="hover:bg-white/5 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5 text-xs whitespace-nowrap text-[var(--color-muted)]" title={safeIso(row.created_at)}>{safeFmt(row.created_at)}</td>
        <td className="px-4 py-2.5">
          <div className="flex flex-col gap-1">
            <span className="text-xs">{row.actor_email || "-"}</span>
            <RolePill role={row.actor_role} />
          </div>
        </td>
        <td className="px-4 py-2.5"><span className={`font-mono text-[10px] px-2 py-0.5 rounded ${actionPillClass(row.action)}`}>{row.action}</span></td>
        <td className="px-4 py-2.5">
          <span className="text-xs">{row.entity}</span>
          {row.entity_id && <span className="ml-2"><CopyId id={row.entity_id} /></span>}
        </td>
        <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] font-mono max-w-[260px] truncate">{truncated}</td>
      </tr>
      {open && (
        <tr className="bg-[var(--color-bg)]">
          <td colSpan={5} className="px-4 py-3">
            <pre className="text-[11px] font-mono text-[var(--color-muted)] whitespace-pre-wrap break-all">{metaToPre(row.meta)}</pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 - PLATFORM
// ─────────────────────────────────────────────────────────────────────────────
function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function PlatformSection({
  stats, metrics, companies, users, onFindUser, onBulkPlan, onRefresh,
}: {
  stats: Stats | null;
  metrics: Metrics | null;
  companies: Company[];
  users: AdminUser[];
  onFindUser: (q: string) => void;
  onBulkPlan: (plan: PlanTier) => void;
  onRefresh: () => void;
}) {
  const [findQ, setFindQ] = useState("");
  const [bulkPlan, setBulkPlan] = useState<PlanTier>("growth");

  const matches = useMemo(() => {
    const needle = findQ.trim().toLowerCase();
    if (needle.length < 2) return [];
    return users
      .filter((u) => u.email.toLowerCase().includes(needle) || (u.display_name || "").toLowerCase().includes(needle) || u.tenant_id.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [findQ, users]);

  const activeWindow = Date.now() - 30 * 86400000;
  const activeCompanies = companies.filter((c) => c.last_login_at && new Date(c.last_login_at).getTime() >= activeWindow).length;
  const avgUsers = stats && stats.companies > 0 ? (stats.users / stats.companies).toFixed(1) : "0.0";
  const conversion = metrics && stats && stats.companies > 0 ? `${((metrics.paidTenants / stats.companies) * 100).toFixed(0)}%` : "-";

  return (
    <div className="space-y-5">
      {/* Card A - Quick Actions */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <p className="text-sm font-semibold">Quick Actions</p>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Find user</label>
            <input value={findQ} onChange={(e) => setFindQ(e.target.value)} placeholder="email, name or tenant…" className={`w-full ${inputCls}`} />
            {matches.length > 0 && (
              <div className="mt-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
                {matches.map((u) => (
                  <button key={u.id} onClick={() => onFindUser(u.email)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 truncate">{u.email}</button>
                ))}
              </div>
            )}
            {findQ.trim().length >= 2 && matches.length === 0 && <p className="text-xs text-[var(--color-muted)] mt-1">No matches.</p>}
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Bulk plan change</label>
            <div className="flex gap-2">
              <select value={bulkPlan} onChange={(e) => setBulkPlan(e.target.value as PlanTier)} className={`flex-1 ${selectCls}`}>
                {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_STYLE[p].label}</option>)}
              </select>
              <button onClick={() => onBulkPlan(bulkPlan)} className="text-xs font-semibold px-3 py-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 whitespace-nowrap">Go to Companies</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Export data</label>
            <button onClick={() => downloadJSON("headroom-export.json", { stats, companies })} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]">
              <Download size={13} /> Export stats + companies
            </button>
          </div>
        </div>
      </div>

      {/* Card B - Platform Health */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <p className="text-sm font-semibold">Platform Health</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active companies (30d)" value={activeCompanies.toLocaleString("en-IN")} icon={<Activity size={13} />} />
          <StatCard label="Avg users / company" value={avgUsers} icon={<UsersIcon size={13} />} />
          <StatCard label="Paid conversion" value={conversion} sub={metrics ? `${metrics.paidTenants} paid` : ""} icon={<TrendingUp size={13} />} />
          <StatCard label="Pending invites" value={(metrics?.pendingInvites ?? 0).toLocaleString("en-IN")} icon={<UserPlus size={13} />} />
        </div>
      </div>

      {/* Card C - Danger Zone */}
      <div className="bg-[var(--color-surface)] border border-red-700/40 rounded-lg p-5 space-y-4">
        <p className="text-sm font-semibold text-red-300">Danger Zone</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => downloadJSON("headroom-full-export.json", { stats, companies, users })} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[var(--color-border)] hover:border-red-500">
            <Download size={13} /> Export All Data
          </button>
          <button onClick={onRefresh} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]">
            <RefreshCw size={13} /> Force Refresh All
          </button>
          <button onClick={() => toast("Coming soon")} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[var(--color-border)] hover:border-red-500 text-red-300">
            <Trash2 size={13} /> Purge Caches
          </button>
        </div>
      </div>
    </div>
  );
}
