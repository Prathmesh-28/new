import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useT } from "@/i18n";
import {
  Database, RefreshCw, Download, Search, Copy, X, LogIn, Zap, Power,
  Pencil, KeyRound, Crown, Trash2, Building2, Users as UsersIcon,
  Receipt, FileText, Activity, Wallet, TrendingUp, ArrowRight, ChevronDown,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type PlanTier = "free" | "starter" | "growth" | "pro";
type UserRole =
  | "super_admin" | "owner" | "finance_manager" | "accountant"
  | "sales" | "operations_manager" | "viewer" | "investor";

interface AdminUser {
  id: string;
  email: string;
  display_name?: string;
  role: string;
  tenant_id: string;
  subscription_plan: PlanTier;
  first_login: boolean;
  created_at: string;
  last_login_at?: string | null;
  last_active_at?: string | null;
  login_count: number;
  status?: string;
}

interface Company {
  tenant_id: string;
  company_name: string | null;
  owner_email: string | null;
  user_count: number;
  plan: PlanTier;
  status: string;
  created_at: string | null;
  last_login_at?: string | null;
  last_activity?: string | null;
  cash: number;
  revenue: number;
  expense: number;
  transactions: number;
  openReceivables: number;
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

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entity_id: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  actor_email: string;
  actor_role: string;
}

type TabId = "companies" | "users" | "transactions" | "invoices" | "activity";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function relTime(iso?: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return "Never";
  const diff = Date.now() - t;
  if (diff < 0) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(mo / 12);
  return `${yr}y ago`;
}

function fmtINR(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function fmtNum(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-IN");
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

function roleLabel(role: string): string {
  return (role || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "-";
}

function errMsg(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Failed";
}

const AVATAR_PALETTE = [
  "bg-purple-700", "bg-blue-700", "bg-emerald-700", "bg-amber-700",
  "bg-pink-700", "bg-cyan-700", "bg-rose-700", "bg-indigo-700",
];

function avatarBg(seed: string): string {
  const s = seed || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initials(nameOrEmail: string): string {
  const base = (nameOrEmail || "?").trim();
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return base.slice(0, 2).toUpperCase() || "?";
}

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function PlanPill({ plan }: { plan: PlanTier }) {
  const s = PLAN_STYLE[plan] ?? PLAN_STYLE.free;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.pill}`}>{s.label}</span>;
}

function RolePill({ role }: { role: string }) {
  const cls = ROLE_STYLE[role] ?? ROLE_STYLE.viewer;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{roleLabel(role)}</span>;
}

function CopyId({ id, chars = 8 }: { id: string; chars?: number }) {
  const val = id || "";
  const shown = val.length > chars ? `${val.slice(0, chars)}…` : val || "-";
  const onCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!val) return;
      navigator.clipboard?.writeText(val).then(
        () => toast.success("Copied"),
        () => toast.error("Copy failed"),
      );
    },
    [val],
  );
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[11px] text-[var(--color-muted)]" title={val}>{shown}</span>
      <button
        type="button"
        onClick={onCopy}
        className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        title="Copy id"
      >
        <Copy size={11} />
      </button>
    </span>
  );
}

function Avatar({ seed, label }: { seed: string; label: string }) {
  return (
    <span className={`flex-shrink-0 w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold text-white ${avatarBg(seed)}`}>
      {initials(label)}
    </span>
  );
}

function StatusDot({ tone, text }: { tone: "green" | "amber" | "red"; text: string }) {
  const c = tone === "green" ? "bg-emerald-400" : tone === "amber" ? "bg-amber-400" : "bg-red-400";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text)]">
      <span className={`w-2 h-2 rounded-full ${c}`} />
      {text}
    </span>
  );
}

function KpiTile({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 min-w-[140px] flex-1">
      <div className="flex items-center gap-1.5 mb-1 text-[var(--color-muted)]">
        {icon}
        <p className="text-[11px]">{label}</p>
      </div>
      <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

// Skeleton rows shown while loading.
function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, r) => (
        <tr key={r} className="border-b border-[var(--color-border)]">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-3">
              <div className="h-3 rounded bg-[var(--color-border)] animate-pulse" style={{ width: `${40 + ((r + c) % 4) * 15}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS DERIVATION
// ─────────────────────────────────────────────────────────────────────────────
const DAY = 86_400_000;

function companyStatus(c: Company): { tone: "green" | "amber" | "red"; text: string } {
  if ((c.status || "").toLowerCase() === "suspended") return { tone: "red", text: "Suspended" };
  const last = c.last_login_at;
  if (!last) return { tone: "amber", text: "Pending" };
  const t = new Date(last).getTime();
  if (Number.isNaN(t)) return { tone: "amber", text: "Pending" };
  const age = Date.now() - t;
  if (age > 30 * DAY) return { tone: "red", text: "Dormant" };
  if (age <= 7 * DAY) return { tone: "green", text: "Active" };
  return { tone: "amber", text: "Idle" };
}

function userStatus(u: AdminUser): { tone: "green" | "amber" | "red"; text: string } {
  if ((u.status || "").toLowerCase() === "suspended") return { tone: "red", text: "Suspended" };
  if (u.first_login) return { tone: "amber", text: "Pending" };
  return { tone: "green", text: "Active" };
}

function actionTone(action: string): string {
  const a = (action || "").toLowerCase();
  if (a.endsWith(".delete") || a.includes("delete")) return "bg-red-900/40 text-red-300";
  if (a.endsWith(".create") || a.includes("create")) return "bg-emerald-900/40 text-emerald-300";
  if (a.endsWith(".update") || a.includes("update")) return "bg-blue-900/40 text-blue-300";
  if (a.startsWith("tenant.")) return "bg-purple-900/40 text-purple-300";
  if (a.startsWith("user.")) return "bg-amber-900/40 text-amber-300";
  return "bg-[var(--color-bg)] text-[var(--color-muted)]";
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

export default function AllDataPage() {
  const { user } = useAuth();
  if (user?.role !== "super_admin") return <Navigate to="/dashboard" replace />;

  const tr = useT();
  const { setSelectedClient } = useApp();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  const [tab, setTab] = useState<TabId>("companies");
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | PlanTier>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);

  const [drawer, setDrawer] = useState<{ kind: "company" | "user"; data: Company | AdminUser } | null>(null);
  const [drawerRaw, setDrawerRaw] = useState(false);
  const [planPopover, setPlanPopover] = useState<string | null>(null); // tenant_id
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [resetModal, setResetModal] = useState<{ email: string; password: string } | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, u, a] = await Promise.all([
        api.get<Stats>("/api/admin/stats"),
        api.get<Company[]>("/api/admin/companies"),
        api.get<AdminUser[]>("/api/users"),
        api.get<AuditRow[]>("/api/admin/audit?limit=500"),
      ]);
      setStats(s);
      setCompanies(Array.isArray(c) ? c : []);
      setUsers(Array.isArray(u) ? u : []);
      setAudit(Array.isArray(a) ? a : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Reset paging when the tab or any filter changes.
  useEffect(() => { setPage(0); }, [tab, query, planFilter, statusFilter, sort]);

  // Escape closes the drawer / modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (resetModal) setResetModal(null);
      else if (editUser) setEditUser(null);
      else if (drawer) setDrawer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, editUser, resetModal]);

  // ── Derived KPIs ─────────────────────────────────────────────────────────────
  const pendingUsers = useMemo(() => users.filter((u) => u.first_login).length, [users]);
  const mrr = useMemo(
    () => companies.reduce((sum, c) => sum + (PLAN_PRICE[c.plan] ?? 0), 0),
    [companies],
  );
  const sumTransactions = useMemo(
    () => companies.reduce((sum, c) => sum + (Number.isFinite(c.transactions) ? c.transactions : 0), 0),
    [companies],
  );
  const invoiceCompanies = useMemo(
    () => companies.filter((c) => (c.openReceivables ?? 0) > 0).length,
    [companies],
  );

  // ── Tab counts ───────────────────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; count: number; icon: ReactNode }[] = [
    { id: "companies",    label: tr("alld.tabCompanies"),    count: companies.length, icon: <Building2 size={14} /> },
    { id: "users",        label: tr("alld.tabUsers"),        count: users.length,     icon: <UsersIcon size={14} /> },
    { id: "transactions", label: tr("alld.tabTransactions"), count: sumTransactions,  icon: <Receipt size={14} /> },
    { id: "invoices",     label: tr("alld.tabInvoices"),     count: invoiceCompanies, icon: <FileText size={14} /> },
    { id: "activity",     label: tr("alld.tabActivity"),     count: audit.length,     icon: <Activity size={14} /> },
  ];

  // ── Filtering / sorting (per tab) ─────────────────────────────────────────────
  const q = query.trim().toLowerCase();

  const filteredCompanies = useMemo(() => {
    let rows = companies.filter((c) => {
      if (q) {
        const hay = `${c.company_name || ""} ${c.owner_email || ""} ${c.tenant_id || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (planFilter !== "all" && c.plan !== planFilter) return false;
      if (statusFilter !== "all" && companyStatus(c).text.toLowerCase() !== statusFilter) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "users") return (b.user_count || 0) - (a.user_count || 0);
      if (sort === "cash") return (b.cash || 0) - (a.cash || 0);
      if (sort === "active") {
        const ta = new Date(a.last_login_at || a.last_activity || 0).getTime() || 0;
        const tb = new Date(b.last_login_at || b.last_activity || 0).getTime() || 0;
        return tb - ta;
      }
      const ca = new Date(a.created_at || 0).getTime() || 0;
      const cb = new Date(b.created_at || 0).getTime() || 0;
      return cb - ca;
    });
    return rows;
  }, [companies, q, planFilter, statusFilter, sort]);

  const filteredUsers = useMemo(() => {
    let rows = users.filter((u) => {
      if (q) {
        const hay = `${u.display_name || ""} ${u.email || ""} ${u.id || ""} ${u.tenant_id || ""} ${u.role || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (planFilter !== "all" && u.subscription_plan !== planFilter) return false;
      if (statusFilter !== "all" && userStatus(u).text.toLowerCase() !== statusFilter) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "active") {
        const ta = new Date(a.last_login_at || 0).getTime() || 0;
        const tb = new Date(b.last_login_at || 0).getTime() || 0;
        return tb - ta;
      }
      if (sort === "users") return (b.login_count || 0) - (a.login_count || 0);
      const ca = new Date(a.created_at || 0).getTime() || 0;
      const cb = new Date(b.created_at || 0).getTime() || 0;
      return cb - ca;
    });
    return rows;
  }, [users, q, planFilter, statusFilter, sort]);

  const filteredAudit = useMemo(() => {
    let rows = audit.filter((r) => {
      if (!q) return true;
      const hay = `${r.actor_email || ""} ${r.action || ""} ${r.entity || ""} ${r.entity_id || ""}`.toLowerCase();
      return hay.includes(q);
    });
    rows = [...rows].sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime() || 0;
      const tb = new Date(b.created_at || 0).getTime() || 0;
      return tb - ta;
    });
    return rows;
  }, [audit, q, sort]);

  // The "total" set for the current tab (for paging + "Showing X of Y").
  const totalForTab =
    tab === "companies" ? filteredCompanies.length :
    tab === "users" ? filteredUsers.length :
    tab === "activity" ? filteredAudit.length :
    companies.length;

  const pageStart = page * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;

  const pagedCompanies = filteredCompanies.slice(pageStart, pageEnd);
  const pagedUsers = filteredUsers.slice(pageStart, pageEnd);
  const pagedAudit = filteredAudit.slice(pageStart, pageEnd);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const enterCompany = useCallback(
    (c: Company) => {
      const label = c.company_name || c.owner_email || c.tenant_id;
      setSelectedClient(c.tenant_id, label);
      toast.success(`Entered ${label}`);
      navigate("/dashboard");
    },
    [setSelectedClient, navigate],
  );

  const changePlan = useCallback(async (tenantId: string, plan: PlanTier) => {
    const prev = companies;
    setCompanies((cs) => cs.map((c) => (c.tenant_id === tenantId ? { ...c, plan } : c)));
    setPlanPopover(null);
    try {
      await api.post(`/api/admin/tenants/${tenantId}/plan`, { plan });
      toast.success(`Plan changed to ${PLAN_STYLE[plan].label}`);
    } catch (e) {
      setCompanies(prev);
      toast.error(errMsg(e));
    }
  }, [companies]);

  const toggleSuspend = useCallback(async (c: Company) => {
    const suspend = (c.status || "").toLowerCase() !== "suspended";
    const verb = suspend ? "Suspend" : "Activate";
    if (!window.confirm(`${verb} ${c.company_name || c.owner_email || c.tenant_id}?`)) return;
    const prev = companies;
    const nextStatus = suspend ? "suspended" : "active";
    setCompanies((cs) => cs.map((x) => (x.tenant_id === c.tenant_id ? { ...x, status: nextStatus } : x)));
    try {
      if (suspend) await api.post(`/api/admin/tenants/${c.tenant_id}/suspend`, { reason: "Admin" });
      else await api.post(`/api/admin/tenants/${c.tenant_id}/activate`, {});
      toast.success(`${verb}d`);
    } catch (e) {
      setCompanies(prev);
      toast.error(errMsg(e));
    }
  }, [companies]);

  const resetPassword = useCallback(async (u: AdminUser) => {
    try {
      const res = await api.post<{ password: string }>(`/api/admin/users/${u.id}/reset`, {});
      setResetModal({ email: u.email || u.id, password: res?.password || "" });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);

  const makeOwner = useCallback(async (u: AdminUser) => {
    if (!window.confirm(`Make ${u.email || u.id} the owner of their workspace?`)) return;
    try {
      await api.post(`/api/users/${u.id}/make-owner`, {});
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, role: "owner" } : x)));
      toast.success("Promoted to owner");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);

  const deleteUser = useCallback(async (u: AdminUser) => {
    if (u.id === user?.id) { toast.error("You cannot delete yourself"); return; }
    if (!window.confirm(`Delete ${u.email || u.id}? This cannot be undone.`)) return;
    const prev = users;
    setUsers((us) => us.filter((x) => x.id !== u.id));
    try {
      await api.delete(`/api/users/${u.id}`);
      toast.success("User deleted");
    } catch (e) {
      setUsers(prev);
      toast.error(errMsg(e));
    }
  }, [users, user?.id]);

  const saveUserEdit = useCallback(async (orig: AdminUser, next: { display_name: string; role: string; plan: PlanTier }) => {
    const prev = users;
    setUsers((us) => us.map((x) => (x.id === orig.id ? { ...x, display_name: next.display_name, role: next.role, subscription_plan: next.plan } : x)));
    try {
      if (next.display_name !== (orig.display_name || "")) {
        await api.patch(`/api/users/${orig.id}/profile`, { display_name: next.display_name });
      }
      if (next.role !== orig.role) {
        await api.patch(`/api/users/${orig.id}`, { role: next.role });
      }
      if (next.plan !== orig.subscription_plan) {
        await api.post(`/api/admin/tenants/${orig.tenant_id}/plan`, { plan: next.plan });
        setCompanies((cs) => cs.map((c) => (c.tenant_id === orig.tenant_id ? { ...c, plan: next.plan } : c)));
      }
      toast.success("User updated");
      setEditUser(null);
    } catch (e) {
      setUsers(prev);
      toast.error(errMsg(e));
    }
  }, [users]);

  const exportAll = useCallback(() => {
    try {
      const blob = new Blob(
        [JSON.stringify({ stats, companies, users, audit }, null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `headroom-all-data-${format(new Date(), "yyyy-MM-dd")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported all data");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [stats, companies, users, audit]);

  // ── Status filter options (per tab) ──────────────────────────────────────────
  const statusOptions =
    tab === "companies" ? ["all", "active", "pending", "idle", "dormant", "suspended"] :
    tab === "users" ? ["all", "active", "pending", "suspended"] :
    ["all"];

  const sortOptions =
    tab === "users"
      ? [["newest", tr("alld.sortNewest")], ["active", tr("alld.sortLastActive")], ["users", tr("alld.sortMostLogins")]]
      : [["newest", tr("alld.sortNewest")], ["users", tr("alld.sortMostUsers")], ["cash", tr("alld.sortHighestCash")], ["active", tr("alld.sortLastActive")]];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* HEADER BAND */}
      <div className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 sm:px-6 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Database size={20} className="text-[var(--color-primary)]" />
              {tr("alld.title")}
            </h1>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">{tr("alld.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-primary)] transition-colors"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> {tr("alld.refresh")}
            </button>
            <button
              type="button"
              onClick={exportAll}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold hover:opacity-90 transition-opacity"
            >
              <Download size={13} /> {tr("alld.exportAll")}
            </button>
          </div>
        </div>

        {/* KPI TILES */}
        <div className="flex flex-wrap gap-2 mt-4">
          <KpiTile label={tr("alld.kpiCompanies")} value={fmtNum(stats?.companies ?? companies.length)} sub={tr("alld.kpiCompaniesSub", { count: String(stats?.activeCompanies ?? 0) })} icon={<Building2 size={13} />} />
          <KpiTile label={tr("alld.kpiUsers")} value={fmtNum(stats?.users ?? users.length)} sub={tr("alld.kpiUsersSub", { count: String(pendingUsers) })} icon={<UsersIcon size={13} />} />
          <KpiTile label={tr("alld.kpiPlatformCash")} value={fmtINR(stats?.totalCash ?? 0)} icon={<Wallet size={13} />} />
          <KpiTile label={tr("alld.kpiTotalRevenue")} value={fmtINR(stats?.totalRevenue ?? 0)} icon={<TrendingUp size={13} />} />
          <KpiTile label={tr("alld.kpiMrr")} value={fmtINR(mrr)} sub={tr("alld.kpiMrrSub")} icon={<TrendingUp size={13} />} />
          <KpiTile label={tr("alld.kpiTransactions")} value={fmtNum(stats?.totalTransactions ?? sumTransactions)} icon={<Receipt size={13} />} />
        </div>
      </div>

      {/* TAB BAR */}
      <div className="px-4 sm:px-6 border-b border-[var(--color-border)] bg-[var(--color-surface)]/40">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative inline-flex items-center gap-1.5 px-3 py-3 text-sm whitespace-nowrap transition-colors ${
                  active ? "text-[var(--color-primary)] font-semibold" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {t.icon}
                {t.label}
                <span className="ml-1 text-[10px] tabular-nums px-1.5 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)]">
                  {fmtNum(t.count)}
                </span>
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)] rounded-full" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* UNIVERSAL TOOLBAR */}
      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("alld.searchPlaceholder")}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as "all" | PlanTier)}
          className="text-sm px-2 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] outline-none"
        >
          <option value="all">{tr("alld.allPlans")}</option>
          {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_STYLE[p].label}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm px-2 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] outline-none capitalize"
        >
          {statusOptions.map((s) => <option key={s} value={s}>{s === "all" ? tr("alld.allStatuses") : s}</option>)}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-sm px-2 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] outline-none"
        >
          {sortOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="ml-auto text-xs text-[var(--color-muted)] tabular-nums">
          {tr("alld.showingOf", {
            shown: String(Math.min(totalForTab, pageStart + (
              tab === "companies" ? pagedCompanies.length :
              tab === "users" ? pagedUsers.length :
              tab === "activity" ? pagedAudit.length : 0
            ))),
            total: String(tab === "transactions" || tab === "invoices" ? companies.length : totalForTab),
          })}
        </span>
      </div>

      {/* TABLE AREA */}
      <div className="px-4 sm:px-6 pb-8">
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
          <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
            {tab === "companies" && (
              <CompaniesTable
                rows={pagedCompanies} loading={loading}
                onRow={(c) => { setDrawer({ kind: "company", data: c }); setDrawerRaw(false); }}
                onEnter={enterCompany}
                planPopover={planPopover} setPlanPopover={setPlanPopover}
                onChangePlan={changePlan} onToggleSuspend={toggleSuspend}
              />
            )}
            {tab === "users" && (
              <UsersTable
                rows={pagedUsers} loading={loading} selfId={user?.id}
                onRow={(u) => { setDrawer({ kind: "user", data: u }); setDrawerRaw(false); }}
                onEdit={(u) => setEditUser(u)}
                onReset={resetPassword} onMakeOwner={makeOwner} onDelete={deleteUser}
              />
            )}
            {tab === "transactions" && (
              <PlaceholderTab kind="transactions" companies={companies} loading={loading} />
            )}
            {tab === "invoices" && (
              <PlaceholderTab kind="invoices" companies={companies} loading={loading} />
            )}
            {tab === "activity" && (
              <ActivityTable rows={pagedAudit} loading={loading} expanded={expandedAudit} setExpanded={setExpandedAudit} />
            )}
          </div>
        </div>

        {/* PAGINATION (only for paged tabs) */}
        {(tab === "companies" || tab === "users" || tab === "activity") && totalForTab > 0 && (
          <div className="flex items-center justify-between mt-3 text-xs text-[var(--color-muted)]">
            <span className="tabular-nums">
              {tr("alld.showingRange", { from: String(pageStart + 1), to: String(Math.min(pageEnd, totalForTab)), total: String(totalForTab) })}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-3 py-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] disabled:opacity-40 hover:border-[var(--color-primary)] transition-colors"
              >
                {tr("alld.prev")}
              </button>
              <button
                type="button"
                disabled={pageEnd >= totalForTab}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] disabled:opacity-40 hover:border-[var(--color-primary)] transition-colors"
              >
                {tr("alld.next")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DETAIL DRAWER */}
      {drawer && (
        <DetailDrawer
          drawer={drawer} raw={drawerRaw} setRaw={setDrawerRaw}
          onClose={() => setDrawer(null)}
        />
      )}

      {/* EDIT USER MODAL */}
      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={saveUserEdit} />
      )}

      {/* RESET PASSWORD MODAL */}
      {resetModal && (
        <ResetModal data={resetModal} onClose={() => setResetModal(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANIES TABLE
// ─────────────────────────────────────────────────────────────────────────────
function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] bg-[var(--color-surface)] ${className}`}>
      {children}
    </th>
  );
}

function CompaniesTable({
  rows, loading, onRow, onEnter, planPopover, setPlanPopover, onChangePlan, onToggleSuspend,
}: {
  rows: Company[]; loading: boolean;
  onRow: (c: Company) => void;
  onEnter: (c: Company) => void;
  planPopover: string | null;
  setPlanPopover: (id: string | null) => void;
  onChangePlan: (tid: string, p: PlanTier) => void;
  onToggleSuspend: (c: Company) => void;
}) {
  const tr = useT();
  return (
    <table className="w-full text-sm border-collapse">
      <thead className="sticky top-0 z-[1]">
        <tr className="border-b border-[var(--color-border)]">
          <Th>{tr("alld.colCompany")}</Th><Th>{tr("alld.colOwnerEmail")}</Th><Th className="text-right">{tr("alld.colUsers")}</Th>
          <Th>{tr("alld.colPlan")}</Th><Th className="text-right">{tr("alld.colCash")}</Th><Th className="text-right">{tr("alld.colRevenue")}</Th>
          <Th className="text-right">{tr("alld.colTxns")}</Th><Th>{tr("alld.colLastActive")}</Th><Th>{tr("alld.colStatus")}</Th><Th className="text-right">{tr("alld.colActions")}</Th>
        </tr>
      </thead>
      <tbody>
        {loading ? <SkeletonRows cols={10} /> : rows.length === 0 ? (
          <tr><td colSpan={10} className="px-3 py-10 text-center text-[var(--color-muted)]">{tr("alld.noCompaniesMatch")}</td></tr>
        ) : rows.map((c) => {
          const label = c.company_name || c.owner_email || c.tenant_id;
          const st = companyStatus(c);
          return (
            <tr
              key={c.tenant_id}
              onClick={() => onRow(c)}
              className="group border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]/40 cursor-pointer transition-colors"
            >
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Avatar seed={c.tenant_id} label={label} />
                  <div className="min-w-0">
                    <p className="truncate max-w-[180px] font-medium">{label}</p>
                    <CopyId id={c.tenant_id} />
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-[var(--color-muted)] truncate max-w-[180px]">{c.owner_email || "-"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(c.user_count)}</td>
              <td className="px-3 py-2.5"><PlanPill plan={c.plan} /></td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtINR(c.cash)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtINR(c.revenue)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(c.transactions)}</td>
              <td className="px-3 py-2.5 text-[var(--color-muted)] text-xs">{relTime(c.last_login_at || c.last_activity)}</td>
              <td className="px-3 py-2.5"><StatusDot tone={st.tone} text={st.text} /></td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity relative">
                  <button type="button" title="Enter company" onClick={(e) => { e.stopPropagation(); onEnter(c); }}
                    className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-[var(--color-primary)]"><LogIn size={14} /></button>
                  <button type="button" title="Change plan" onClick={(e) => { e.stopPropagation(); setPlanPopover(planPopover === c.tenant_id ? null : c.tenant_id); }}
                    className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-[var(--color-muted)]"><Zap size={14} /></button>
                  <button type="button" title={(c.status || "").toLowerCase() === "suspended" ? "Activate" : "Suspend"} onClick={(e) => { e.stopPropagation(); onToggleSuspend(c); }}
                    className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-[var(--color-muted)]"><Power size={14} /></button>
                  {planPopover === c.tenant_id && (
                    <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-2 shadow-xl w-44">
                      <p className="text-[10px] text-[var(--color-muted)] mb-1 px-1">Change plan</p>
                      {PLAN_ORDER.map((p) => (
                        <button key={p} type="button" onClick={() => onChangePlan(c.tenant_id, p)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs hover:bg-[var(--color-bg)] ${c.plan === p ? "ring-1 ring-[var(--color-primary)]" : ""}`}>
                          <PlanPill plan={p} />
                          <span className="tabular-nums text-[var(--color-muted)]">{PLAN_PRICE[p] ? fmtINR(PLAN_PRICE[p]) : "Free"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS TABLE
// ─────────────────────────────────────────────────────────────────────────────
function UsersTable({
  rows, loading, selfId, onRow, onEdit, onReset, onMakeOwner, onDelete,
}: {
  rows: AdminUser[]; loading: boolean; selfId?: string;
  onRow: (u: AdminUser) => void;
  onEdit: (u: AdminUser) => void;
  onReset: (u: AdminUser) => void;
  onMakeOwner: (u: AdminUser) => void;
  onDelete: (u: AdminUser) => void;
}) {
  const tr = useT();
  return (
    <table className="w-full text-sm border-collapse">
      <thead className="sticky top-0 z-[1]">
        <tr className="border-b border-[var(--color-border)]">
          <Th>{tr("alld.colUser")}</Th><Th>{tr("alld.colUserId")}</Th><Th>{tr("alld.colTenant")}</Th><Th>{tr("alld.colRole")}</Th><Th>{tr("alld.colPlan")}</Th>
          <Th>{tr("alld.colLastSeen")}</Th><Th className="text-right">{tr("alld.colLogins")}</Th><Th>{tr("alld.colStatus")}</Th><Th className="text-right">{tr("alld.colActions")}</Th>
        </tr>
      </thead>
      <tbody>
        {loading ? <SkeletonRows cols={9} /> : rows.length === 0 ? (
          <tr><td colSpan={9} className="px-3 py-10 text-center text-[var(--color-muted)]">{tr("alld.noUsersMatch")}</td></tr>
        ) : rows.map((u) => {
          const label = u.display_name || u.email || u.id;
          const st = userStatus(u);
          const isSelf = u.id === selfId;
          return (
            <tr
              key={u.id}
              onClick={() => onRow(u)}
              className="group border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]/40 cursor-pointer transition-colors"
            >
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Avatar seed={u.email || u.id} label={label} />
                  <div className="min-w-0">
                    <p className="truncate max-w-[160px] font-medium">{u.display_name || "-"}</p>
                    <p className="truncate max-w-[160px] text-[11px] text-[var(--color-muted)]">{u.email || "-"}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5"><CopyId id={u.id} /></td>
              <td className="px-3 py-2.5"><CopyId id={u.tenant_id} chars={12} /></td>
              <td className="px-3 py-2.5"><RolePill role={u.role} /></td>
              <td className="px-3 py-2.5"><PlanPill plan={u.subscription_plan} /></td>
              <td className="px-3 py-2.5 text-[var(--color-muted)] text-xs">{relTime(u.last_login_at)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(u.login_count)}</td>
              <td className="px-3 py-2.5"><StatusDot tone={st.tone} text={st.text} /></td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(u); }}
                    className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-[var(--color-muted)]"><Pencil size={14} /></button>
                  <button type="button" title="Reset password" onClick={(e) => { e.stopPropagation(); onReset(u); }}
                    className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-[var(--color-muted)]"><KeyRound size={14} /></button>
                  <button type="button" title="Make owner" onClick={(e) => { e.stopPropagation(); onMakeOwner(u); }}
                    className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-[var(--color-muted)]"><Crown size={14} /></button>
                  <button type="button" title={isSelf ? "You cannot delete yourself" : "Delete"} disabled={isSelf} onClick={(e) => { e.stopPropagation(); onDelete(u); }}
                    className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER TAB (transactions / invoices)
// ─────────────────────────────────────────────────────────────────────────────
function PlaceholderTab({ kind, companies, loading }: { kind: "transactions" | "invoices"; companies: Company[]; loading: boolean }) {
  const tr = useT();
  const isTxn = kind === "transactions";
  const kindLabel = isTxn ? tr("alld.kindTransactions") : tr("alld.kindInvoices");
  const rows = useMemo(() => {
    const list = isTxn
      ? companies.filter((c) => (c.transactions ?? 0) > 0)
      : companies.filter((c) => (c.openReceivables ?? 0) > 0);
    return [...list].sort((a, b) => (isTxn ? (b.transactions ?? 0) - (a.transactions ?? 0) : (b.openReceivables ?? 0) - (a.openReceivables ?? 0)));
  }, [companies, isTxn]);

  return (
    <div className="p-6">
      <div className="max-w-md mx-auto text-center bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-6 mb-6">
        {isTxn ? <Receipt size={28} className="mx-auto text-[var(--color-muted)] mb-2" /> : <FileText size={28} className="mx-auto text-[var(--color-muted)] mb-2" />}
        <p className="text-sm font-medium">{tr("alld.noPlatformFeed", { kind: kindLabel })}</p>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          {tr("alld.perCompanyHint", { kind: kindLabel })}
        </p>
        <p className="text-xs text-[var(--color-primary)] mt-3 inline-flex items-center gap-1">{tr("alld.enterCompany")} <ArrowRight size={12} /></p>
      </div>

      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-2">
        {isTxn ? tr("alld.byCompanyTxn") : tr("alld.byCompanyReceivables")}
      </p>
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-[1]">
          <tr className="border-b border-[var(--color-border)]">
            <Th>{tr("alld.colCompany")}</Th><Th>{tr("alld.colPlan")}</Th>
            <Th className="text-right">{isTxn ? tr("alld.colTransactions") : tr("alld.colOpenReceivables")}</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? <SkeletonRows cols={3} /> : rows.length === 0 ? (
            <tr><td colSpan={3} className="px-3 py-8 text-center text-[var(--color-muted)]">{tr("alld.noCompaniesWithKind", { kind: kindLabel })}</td></tr>
          ) : rows.map((c) => {
            const label = c.company_name || c.owner_email || c.tenant_id;
            return (
              <tr key={c.tenant_id} className="border-b border-[var(--color-border)]">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar seed={c.tenant_id} label={label} />
                    <span className="truncate max-w-[220px] font-medium">{label}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5"><PlanPill plan={c.plan} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {isTxn ? fmtNum(c.transactions) : fmtINR(c.openReceivables)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY TABLE
// ─────────────────────────────────────────────────────────────────────────────
function ActivityTable({
  rows, loading, expanded, setExpanded,
}: {
  rows: AuditRow[]; loading: boolean;
  expanded: string | null; setExpanded: (id: string | null) => void;
}) {
  const tr = useT();
  return (
    <table className="w-full text-sm border-collapse">
      <thead className="sticky top-0 z-[1]">
        <tr className="border-b border-[var(--color-border)]">
          <Th>{tr("alld.colTime")}</Th><Th>{tr("alld.colActor")}</Th><Th>{tr("alld.colAction")}</Th><Th>{tr("alld.colEntity")}</Th><Th>{tr("alld.colDetail")}</Th>
        </tr>
      </thead>
      <tbody>
        {loading ? <SkeletonRows cols={5} /> : rows.length === 0 ? (
          <tr><td colSpan={5} className="px-3 py-10 text-center text-[var(--color-muted)]">{tr("alld.noActivity")}</td></tr>
        ) : rows.map((r) => {
          const open = expanded === r.id;
          const d = new Date(r.created_at);
          const timeText = Number.isNaN(d.getTime()) ? "-" : format(d, "dd MMM, HH:mm");
          let metaStr = "";
          try { metaStr = r.meta ? JSON.stringify(r.meta) : ""; } catch { metaStr = ""; }
          const metaShort = metaStr.length > 80 ? `${metaStr.slice(0, 80)}…` : metaStr;
          return (
            <tr key={r.id} onClick={() => setExpanded(open ? null : r.id)}
              className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]/40 cursor-pointer align-top">
              <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap" title={r.created_at}>{timeText}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-col gap-1">
                  <span className="text-xs truncate max-w-[160px]">{r.actor_email || "-"}</span>
                  <RolePill role={r.actor_role} />
                </div>
              </td>
              <td className="px-3 py-2.5">
                <span className={`font-mono text-[11px] px-2 py-0.5 rounded ${actionTone(r.action)}`}>{r.action || "-"}</span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs">{r.entity || "-"}</span>
                  {r.entity_id && <CopyId id={r.entity_id} />}
                </div>
              </td>
              <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">
                {open ? (
                  <pre className="whitespace-pre-wrap break-all text-[11px] bg-[var(--color-bg)] p-2 rounded border border-[var(--color-border)] max-w-[360px]">
                    {r.meta ? JSON.stringify(r.meta, null, 2) : "-"}
                  </pre>
                ) : (metaShort || "-")}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL DRAWER
// ─────────────────────────────────────────────────────────────────────────────
function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[var(--color-border)]">
      <span className="text-xs text-[var(--color-muted)]">{k}</span>
      <span className="text-xs text-right break-all max-w-[60%]">{v}</span>
    </div>
  );
}

function DetailDrawer({
  drawer, raw, setRaw, onClose,
}: {
  drawer: { kind: "company" | "user"; data: Company | AdminUser };
  raw: boolean; setRaw: (b: boolean) => void; onClose: () => void;
}) {
  const tr = useT();
  const isCompany = drawer.kind === "company";
  const data = drawer.data as unknown as Record<string, unknown>;
  const title = isCompany
    ? ((drawer.data as Company).company_name || (drawer.data as Company).owner_email || (drawer.data as Company).tenant_id)
    : ((drawer.data as AdminUser).display_name || (drawer.data as AdminUser).email || (drawer.data as AdminUser).id);

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="ml-auto relative h-full w-full max-w-md bg-[var(--color-surface)] border-l border-[var(--color-border)] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar seed={isCompany ? (drawer.data as Company).tenant_id : (drawer.data as AdminUser).email || (drawer.data as AdminUser).id} label={title} />
            <div className="min-w-0">
              <p className="font-semibold truncate">{title}</p>
              <p className="text-[10px] text-[var(--color-muted)] capitalize">{isCompany ? tr("alld.companyRecord") : tr("alld.userRecord")}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-[var(--color-muted)]"><X size={16} /></button>
        </div>

        <div className="px-4 py-3">
          {isCompany ? <CompanyKVs c={drawer.data as Company} /> : <UserKVs u={drawer.data as AdminUser} />}

          <button type="button" onClick={() => setRaw(!raw)}
            className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
            <ChevronDown size={13} className={`transition-transform ${raw ? "rotate-180" : ""}`} /> {tr("alld.rawJson")}
          </button>
          {raw && (
            <pre className="mt-2 text-[11px] bg-[var(--color-bg)] p-3 rounded-lg border border-[var(--color-border)] overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function CompanyKVs({ c }: { c: Company }) {
  const tr = useT();
  const st = companyStatus(c);
  return (
    <div>
      <KV k={tr("alld.kvCompanyName")} v={c.company_name || "-"} />
      <KV k={tr("alld.kvTenantId")} v={<CopyId id={c.tenant_id} chars={20} />} />
      <KV k={tr("alld.kvOwnerEmail")} v={c.owner_email || "-"} />
      <KV k={tr("alld.kvPlan")} v={<PlanPill plan={c.plan} />} />
      <KV k={tr("alld.kvStatus")} v={<StatusDot tone={st.tone} text={st.text} />} />
      <KV k={tr("alld.kvUsers")} v={<span className="tabular-nums">{fmtNum(c.user_count)}</span>} />
      <KV k={tr("alld.kvCash")} v={<span className="tabular-nums">{fmtINR(c.cash)}</span>} />
      <KV k={tr("alld.kvRevenue")} v={<span className="tabular-nums">{fmtINR(c.revenue)}</span>} />
      <KV k={tr("alld.kvExpense")} v={<span className="tabular-nums">{fmtINR(c.expense)}</span>} />
      <KV k={tr("alld.kvTransactions")} v={<span className="tabular-nums">{fmtNum(c.transactions)}</span>} />
      <KV k={tr("alld.kvOpenReceivables")} v={<span className="tabular-nums">{fmtINR(c.openReceivables)}</span>} />
      <KV k={tr("alld.kvMrr")} v={<span className="tabular-nums">{fmtINR(PLAN_PRICE[c.plan] ?? 0)}</span>} />
      <KV k={tr("alld.kvCreated")} v={c.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : "-"} />
      <KV k={tr("alld.kvLastLogin")} v={relTime(c.last_login_at)} />
      <KV k={tr("alld.kvLastActivity")} v={relTime(c.last_activity)} />
    </div>
  );
}

function UserKVs({ u }: { u: AdminUser }) {
  const tr = useT();
  const st = userStatus(u);
  return (
    <div>
      <KV k={tr("alld.kvDisplayName")} v={u.display_name || "-"} />
      <KV k={tr("alld.kvEmail")} v={u.email || "-"} />
      <KV k={tr("alld.kvUserId")} v={<CopyId id={u.id} chars={20} />} />
      <KV k={tr("alld.kvTenantId")} v={<CopyId id={u.tenant_id} chars={20} />} />
      <KV k={tr("alld.kvRole")} v={<RolePill role={u.role} />} />
      <KV k={tr("alld.kvPlan")} v={<PlanPill plan={u.subscription_plan} />} />
      <KV k={tr("alld.kvStatus")} v={<StatusDot tone={st.tone} text={st.text} />} />
      <KV k={tr("alld.kvLoginCount")} v={<span className="tabular-nums">{fmtNum(u.login_count)}</span>} />
      <KV k={tr("alld.kvFirstLoginPending")} v={u.first_login ? tr("alld.yes") : tr("alld.no")} />
      <KV k={tr("alld.kvCreated")} v={u.created_at ? format(new Date(u.created_at), "dd MMM yyyy") : "-"} />
      <KV k={tr("alld.kvLastLogin")} v={relTime(u.last_login_at)} />
      <KV k={tr("alld.kvLastActive")} v={relTime(u.last_active_at)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDIT USER MODAL
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_OPTIONS: UserRole[] = [
  "owner", "finance_manager", "accountant", "sales", "operations_manager", "viewer", "investor",
];

function EditUserModal({
  user, onClose, onSave,
}: {
  user: AdminUser;
  onClose: () => void;
  onSave: (orig: AdminUser, next: { display_name: string; role: string; plan: PlanTier }) => void;
}) {
  const tr = useT();
  const [name, setName] = useState(user.display_name || "");
  const [role, setRole] = useState<string>(user.role || "viewer");
  const [plan, setPlan] = useState<PlanTier>(user.subscription_plan || "free");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{tr("alld.editUser")}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-muted)]"><X size={16} /></button>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3 truncate">{user.email || user.id}</p>

        <label className="block text-xs text-[var(--color-muted)] mb-1">{tr("alld.fieldDisplayName")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full mb-3 px-2.5 py-1.5 text-sm rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none" />

        <label className="block text-xs text-[var(--color-muted)] mb-1">{tr("alld.fieldRole")}</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="w-full mb-3 px-2.5 py-1.5 text-sm rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] outline-none capitalize">
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
        </select>

        <label className="block text-xs text-[var(--color-muted)] mb-1">{tr("alld.fieldPlanWorkspace")}</label>
        <select value={plan} onChange={(e) => setPlan(e.target.value as PlanTier)}
          className="w-full mb-4 px-2.5 py-1.5 text-sm rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] outline-none">
          {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_STYLE[p].label}</option>)}
        </select>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-[var(--color-border)] hover:bg-[var(--color-bg)]">{tr("alld.cancel")}</button>
          <button type="button" onClick={() => onSave(user, { display_name: name.trim(), role, plan })}
            className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold hover:opacity-90">{tr("alld.save")}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESET PASSWORD MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ResetModal({ data, onClose }: { data: { email: string; password: string }; onClose: () => void }) {
  const tr = useT();
  const copy = () => {
    navigator.clipboard?.writeText(data.password).then(
      () => toast.success("Copied"),
      () => toast.error("Copy failed"),
    );
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><KeyRound size={16} className="text-[var(--color-primary)]" /> {tr("alld.passwordReset")}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-muted)]"><X size={16} /></button>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">
          {tr("alld.newPasswordFor")} <span className="text-[var(--color-text)]">{data.email}</span>. {tr("alld.shareSecurely")}
        </p>
        <div className="flex items-center gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-3 py-2">
          <code className="flex-1 font-mono text-sm break-all">{data.password || "-"}</code>
          <button type="button" onClick={copy} disabled={!data.password}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface)] text-[var(--color-muted)] disabled:opacity-40"><Copy size={14} /></button>
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold hover:opacity-90">{tr("alld.done")}</button>
        </div>
      </div>
    </div>
  );
}
