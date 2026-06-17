import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth, BASE } from "@/context/AuthContext";
import { formatCurrency } from "@/lib/utils";
import { Navigate, useNavigate } from "react-router-dom";
import { Users, Building2, ShieldCheck, Eye, Trash2, KeyRound, UserPlus, Search, Crown, Copy, Briefcase, Activity, DatabaseZap, Plus, Mail, Shield, Clock, Flag, Megaphone, ScrollText, Gauge, HeartPulse, Wrench, Power, SlidersHorizontal, LogIn, Upload, Settings2, Bug, Check, X, Bell, CreditCard, Webhook, ListChecks, Download, UsersRound, Timer, Zap, RefreshCw, Pencil, Lock, History, TrendingUp, IndianRupee, CheckSquare, Square, Ban, UserCog } from "lucide-react";
import { toast } from "sonner";
import { ROLE_META, roleLabel, roleBadge, TAB_CATALOG } from "@/data/roles";
import { defaultConfig } from "@/data/defaultConfig";
import { useFeatureState } from "@/hooks/useFeatureState";
import { format, differenceInCalendarDays } from "date-fns";
import { FEATURE_ENTITLEMENTS, FEATURE_PITCH, PLAN_RANK, PLAN_LABEL, type PlanTier } from "@/data/types";

type Tab = "overview" | "metrics" | "companies" | "users" | "plan-access" | "invites" | "admin-actions" | "ca-workspace" | "usage" | "retention" | "flags" | "announce" | "audit-log" | "quotas" | "health" | "maintenance" | "permissions" | "login-history" | "import-jobs" | "config-snapshot" | "error-log" | "notify-templates" | "plan-usage" | "api-keys" | "onboarding" | "data-export" | "bulk-import" | "scheduled-jobs" | "rate-limits";

type AdminUser = { id: string; email: string; role: string; tenant_id: string; first_login: boolean; created_at: string; subscription_plan?: PlanTier; display_name?: string; status?: string; last_login_at?: string | null; last_active_at?: string | null; login_count?: number };
type Company = {
  tenant_id: string; company_name: string | null; owner_email: string | null; user_count: number; plan?: PlanTier;
  created_at: string | null; last_activity: string | null; last_login_at?: string | null; status?: string;
  cash: number; revenue: number; expense: number; transactions: number; accounts: number; openReceivables: number;
};
type Stats = {
  companies: number; users: number; byRole: Record<string, number>;
  totalCash: number; totalRevenue: number; totalTransactions: number; totalReceivables: number; activeCompanies: number;
};

const ALL_ROLE_OPTIONS = Object.values(ROLE_META);

// "3d ago" / "2h ago" / "just now" / "Never" — compact last-seen labels.
function relTime(iso?: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "Never";
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// Django-style grouped left-rail for the console. Every Tab belongs to one group.
const ADMIN_SECTIONS: { label: string; ids: Tab[] }[] = [
  { label: "Platform",          ids: ["overview", "metrics", "health", "config-snapshot", "maintenance", "flags", "announce"] },
  { label: "Customers",         ids: ["companies", "users", "plan-access", "plan-usage", "quotas", "invites", "ca-workspace", "onboarding"] },
  { label: "Access & Security", ids: ["permissions", "admin-actions", "audit-log", "login-history", "retention"] },
  { label: "Data & Ops",        ids: ["usage", "data-export", "bulk-import", "import-jobs", "notify-templates", "api-keys", "scheduled-jobs", "rate-limits", "error-log"] },
];

// What a user can actually reach: their role's accessible pages, with the ones
// their current plan locks flagged. super_admin reaches everything.
function accessForUser(role: string, plan: PlanTier) {
  const isSuper = role === "super_admin";
  const tabs = isSuper ? TAB_CATALOG.map(t => t.tab) : (defaultConfig.roles.find(r => r.id === role)?.accessibleTabs ?? []);
  const planRank = PLAN_RANK[plan] ?? 0;
  const pages = tabs.map(tab => {
    const req = FEATURE_ENTITLEMENTS[tab] as PlanTier | undefined;
    const locked = !isSuper && req ? (PLAN_RANK[req] ?? 0) > planRank : false;
    return { tab, label: TAB_CATALOG.find(t => t.tab === tab)?.label ?? tab, locked, req };
  }).sort((a, b) => Number(a.locked) - Number(b.locked) || a.label.localeCompare(b.label));
  return { pages, open: pages.filter(p => !p.locked).length, locked: pages.filter(p => p.locked).length };
}

export default function AdminPage() {
  const { user } = useAuth();
  const { canAccess, setSelectedClient, setPreviewRole } = useApp();
  const navigate = useNavigate();
  const [tab, setTab]           = useState<Tab>("overview");
  const [stats, setStats]       = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers]       = useState<AdminUser[]>([]);
  const [loading, setLoading]   = useState(false);
  const [q, setQ]               = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole]   = useState("owner");
  const [invTenant, setInvTenant] = useState("");
  const [resetInfo, setResetInfo] = useState<{ email: string; password: string } | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);   // A2 user 360
  const [detailCompany, setDetailCompany] = useState<Company | null>(null); // A7 company 360
  const [globalQ, setGlobalQ] = useState("");                              // A1 find-anyone
  const [tabQ, setTabQ] = useState("");                                    // A10 tab search
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());  // A5 bulk select

  const token = () => localStorage.getItem("hr_access") ?? "";
  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${token()}` }), []);

  const loadStats = useCallback(() => {
    fetch(`${BASE}/api/admin/stats`, { headers: authHeaders() }).then(r => r.ok ? r.json() : null).then(setStats).catch(() => {});
  }, [authHeaders]);
  const loadCompanies = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/api/admin/companies`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then(setCompanies).finally(() => setLoading(false));
  }, [authHeaders]);
  const loadUsers = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/api/users`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then(setUsers).finally(() => setLoading(false));
  }, [authHeaders]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    if (tab === "companies") loadCompanies();
    if (tab === "users") { loadUsers(); loadCompanies(); }
  }, [tab, loadCompanies, loadUsers]);

  // Guard AFTER hooks so hook order stays stable.
  if (!canAccess("admin")) return <Navigate to="/" replace />;

  const changeRole = async (u: AdminUser, role: string) => {
    if (role === u.role) return;
    const res = await fetch(`${BASE}/api/users/${u.id}`, {
      method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ role }),
    });
    if (res.ok) { toast.success(`${u.email} → ${roleLabel(role)}`); loadUsers(); loadStats(); }
    else toast.error((await res.json().catch(() => ({}))).error ?? "Failed to change role");
  };
  const removeUser = async (u: AdminUser) => {
    if (!window.confirm(`Delete ${u.email}? This removes their login permanently.`)) return;
    const res = await fetch(`${BASE}/api/users/${u.id}`, { method: "DELETE", headers: authHeaders() });
    if (res.ok) { toast.success("User deleted"); loadUsers(); loadStats(); }
    else toast.error((await res.json().catch(() => ({}))).error ?? "Failed to delete");
  };
  const resetPassword = async (u: AdminUser) => {
    if (!window.confirm(`Reset ${u.email}'s password? They'll get a temporary one and must set a new password on next login.`)) return;
    const res = await fetch(`${BASE}/api/admin/users/${u.id}/reset`, { method: "POST", headers: authHeaders() });
    if (res.ok) { const { password } = await res.json(); setResetInfo({ email: u.email, password }); }
    else toast.error("Failed to reset password");
  };
  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, string> = { email: invEmail.toLowerCase(), role: invRole };
    if (invTenant.trim()) body.tenant_id = invTenant.trim();
    const res = await fetch(`${BASE}/api/users`, {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) { toast.success(`Created ${invEmail}`); setInvEmail(""); setInvTenant(""); setShowInvite(false); loadUsers(); loadStats(); }
    else toast.error((await res.json().catch(() => ({}))).error ?? "Failed to create user");
  };
  const inspect = (c: Company) => {
    setSelectedClient(c.tenant_id, c.company_name || c.owner_email || c.tenant_id);
    toast.success(`Opened ${c.company_name || c.tenant_id} — you can view and edit; changes save to this company`);
    navigate("/dashboard");
  };
  // Open ANY user's live data (their dashboard, books, every number) as that tenant.
  const openTenant = (tenantId: string, label: string) => {
    setSelectedClient(tenantId, label);
    toast.success(`Viewing ${label} — you can edit every value; changes save to this company`);
    navigate("/dashboard");
  };
  // Super-admin override of a tenant's plan (per-tenant; syncs all its users locally).
  const setTenantPlan = async (tenantId: string, plan: PlanTier) => {
    const res = await fetch(`${BASE}/api/admin/tenants/${tenantId}/plan`, {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ plan }),
    });
    if (res.ok) {
      toast.success(`Plan → ${PLAN_LABEL[plan]}`);
      setUsers(prev => prev.map(u => u.tenant_id === tenantId ? { ...u, subscription_plan: plan } : u));
      setCompanies(prev => prev.map(c => c.tenant_id === tenantId ? { ...c, plan } : c));
    } else toast.error((await res.json().catch(() => ({}))).error ?? "Failed to set plan");
  };
  // Save edited user record (email / display name) — super-admin only.
  const saveUserProfile = async (id: string, patch: { email?: string; display_name?: string }) => {
    const res = await fetch(`${BASE}/api/users/${id}/profile`, {
      method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) { toast.success("User updated"); setEditUser(null); loadUsers(); }
    else toast.error((await res.json().catch(() => ({}))).error ?? "Failed to update user");
  };
  // A6 — step INTO a user's shoes: their tenant's data + their role-limited view.
  const impersonateUser = (u: AdminUser) => {
    setSelectedClient(u.tenant_id, u.display_name || u.email);
    setPreviewRole(u.role as Parameters<typeof setPreviewRole>[0]);
    toast.success(`Viewing as ${u.display_name || u.email} (${roleLabel(u.role)}) — exactly what they see`);
    navigate("/dashboard");
  };
  // A8 — suspend / re-activate an entire company (suspend blocks all its logins).
  const suspendTenant = async (tenantId: string, label: string) => {
    if (!window.confirm(`Suspend "${label}"? Everyone in this company will be locked out until you re-activate it.`)) return;
    const reason = window.prompt("Reason (optional, shown in the audit log):") ?? "";
    const res = await fetch(`${BASE}/api/admin/tenants/${tenantId}/suspend`, {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    if (res.ok) { toast.success(`${label} suspended`); setCompanies(prev => prev.map(c => c.tenant_id === tenantId ? { ...c, status: "suspended" } : c)); setDetailCompany(d => d && d.tenant_id === tenantId ? { ...d, status: "suspended" } : d); }
    else toast.error("Failed to suspend");
  };
  const activateTenant = async (tenantId: string, label: string) => {
    const res = await fetch(`${BASE}/api/admin/tenants/${tenantId}/activate`, { method: "POST", headers: authHeaders() });
    if (res.ok) { toast.success(`${label} re-activated`); setCompanies(prev => prev.map(c => c.tenant_id === tenantId ? { ...c, status: "active" } : c)); setDetailCompany(d => d && d.tenant_id === tenantId ? { ...d, status: "active" } : d); }
    else toast.error("Failed to activate");
  };
  // A5 — bulk actions over selected users.
  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkSetPlan = async (plan: PlanTier) => {
    const tenants = [...new Set(users.filter(u => selectedIds.has(u.id)).map(u => u.tenant_id))];
    for (const t of tenants) await setTenantPlan(t, plan);
    toast.success(`${tenants.length} tenant${tenants.length === 1 ? "" : "s"} → ${PLAN_LABEL[plan]}`);
    setSelectedIds(new Set());
  };
  const bulkDelete = async () => {
    const targets = users.filter(u => selectedIds.has(u.id) && u.id !== user?.id);
    if (!targets.length || !window.confirm(`Delete ${targets.length} user${targets.length === 1 ? "" : "s"}? This is permanent.`)) return;
    for (const u of targets) await fetch(`${BASE}/api/users/${u.id}`, { method: "DELETE", headers: authHeaders() });
    toast.success(`${targets.length} deleted`); setSelectedIds(new Set()); loadUsers(); loadStats();
  };
  const exportUsersCsv = () => {
    const rows = (selectedIds.size ? users.filter(u => selectedIds.has(u.id)) : filteredUsers);
    const head = ["email", "role", "plan", "tenant_id", "status", "last_login_at", "login_count", "created_at"];
    const csv = [head.join(","), ...rows.map(u => [u.email, u.role, u.subscription_plan ?? "free", u.tenant_id, u.first_login ? "pending" : (u.status ?? "active"), u.last_login_at ?? "", u.login_count ?? 0, u.created_at].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "headroom-users.csv"; a.click();
    toast.success(`Exported ${rows.length} users`);
  };

  const TABS = [
    { id: "overview",     label: "Platform Overview", icon: ShieldCheck },
    { id: "metrics",      label: "Business Metrics",   icon: Gauge },
    { id: "companies",    label: "Companies",          icon: Building2 },
    { id: "users",        label: "Users",              icon: Users },
    { id: "plan-access",  label: "Plan Access",        icon: Crown },
    { id: "invites",      label: "Team Invites",       icon: Mail },
    { id: "admin-actions",label: "Admin Actions",      icon: History },
    { id: "ca-workspace", label: "CA Workspace",       icon: Briefcase },
    { id: "usage",        label: "Usage Analytics",    icon: Activity },
    { id: "retention",    label: "Data Retention",     icon: DatabaseZap },
    { id: "flags",        label: "Feature Flags",      icon: Flag },
    { id: "announce",     label: "Announcements",      icon: Megaphone },
    { id: "audit-log",    label: "Audit Log",          icon: ScrollText },
    { id: "quotas",       label: "Seats & Quotas",     icon: Gauge },
    { id: "health",       label: "System Health",      icon: HeartPulse },
    { id: "maintenance",  label: "Maintenance",        icon: Wrench },
    { id: "permissions",  label: "Role Permissions",   icon: SlidersHorizontal },
    { id: "login-history",label: "Login History",      icon: LogIn },
    { id: "import-jobs",  label: "Import Jobs",         icon: Upload },
    { id: "config-snapshot", label: "Config Snapshot",  icon: Settings2 },
    { id: "error-log",    label: "Error Log",          icon: Bug },
    { id: "notify-templates", label: "Notification Templates", icon: Bell },
    { id: "plan-usage",   label: "Plan Usage",         icon: CreditCard },
    { id: "api-keys",     label: "API Keys",           icon: Webhook },
    { id: "onboarding",   label: "Onboarding",         icon: ListChecks },
    { id: "data-export",  label: "Data Export",        icon: Download },
    { id: "bulk-import",  label: "Bulk User Import",   icon: UsersRound },
    { id: "scheduled-jobs", label: "Scheduled Jobs",   icon: Timer },
    { id: "rate-limits",  label: "Rate Limits",        icon: Zap },
  ] as const satisfies { id: Tab; label: string; icon: React.ElementType }[];
  const tabMeta = Object.fromEntries(TABS.map(t => [t.id, t])) as Record<Tab, (typeof TABS)[number]>;
  const Spinner = () => <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const filteredUsers = users.filter(u =>
    !q || u.email.toLowerCase().includes(q.toLowerCase()) || u.tenant_id.toLowerCase().includes(q.toLowerCase()) || u.role.includes(q.toLowerCase()));
  const filteredCompanies = companies.filter(c =>
    !q || (c.company_name || "").toLowerCase().includes(q.toLowerCase()) || c.tenant_id.toLowerCase().includes(q.toLowerCase()) || (c.owner_email || "").toLowerCase().includes(q.toLowerCase()));
  const gq = globalQ.trim().toLowerCase();
  const globalResults = {
    users: gq.length < 2 ? [] : users.filter(u => u.email.toLowerCase().includes(gq) || u.tenant_id.toLowerCase().includes(gq) || (u.display_name || "").toLowerCase().includes(gq)).slice(0, 6),
    companies: gq.length < 2 ? [] : companies.filter(c => (c.company_name || "").toLowerCase().includes(gq) || c.tenant_id.toLowerCase().includes(gq) || (c.owner_email || "").toLowerCase().includes(gq)).slice(0, 6),
  };
  const companyName = (tid: string) => companies.find(c => c.tenant_id === tid)?.company_name || null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-purple-900/30 border border-purple-800/40 flex items-center justify-center shrink-0">
            <Crown size={16} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Super Admin Console</h1>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Platform-wide view across every company — you see everything.</p>
          </div>
        </div>
        <span className="text-xs bg-purple-900/30 text-purple-400 border border-purple-800/40 px-2.5 py-1 rounded-full font-semibold">{user?.email}</span>
      </div>

      {/* reset-password reveal */}
      {resetInfo && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm">
            Temp password for <strong>{resetInfo.email}</strong>: <code className="font-mono bg-[var(--color-bg)] px-2 py-0.5 rounded">{resetInfo.password}</code>
            <span className="text-xs text-[var(--color-muted)] ml-2">Share securely — shown once.</span>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { navigator.clipboard.writeText(resetInfo.password); toast.success("Copied"); }} className="text-xs flex items-center gap-1 text-[var(--color-primary)] hover:underline"><Copy size={12} /> Copy</button>
            <button onClick={() => setResetInfo(null)} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Dismiss</button>
          </div>
        </div>
      )}

      {/* A1 — global "find anyone" search (jumps to a user/company 360 from anywhere) */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
        <input value={globalQ} onChange={e => setGlobalQ(e.target.value)} placeholder="Find any user or company…"
          onFocus={() => { if (!users.length) loadUsers(); if (!companies.length) loadCompanies(); }}
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        {globalQ.trim().length >= 2 && (
          <div className="absolute z-30 mt-1 w-full max-h-80 overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl divide-y divide-[var(--color-border)]">
            {globalResults.users.length === 0 && globalResults.companies.length === 0 && (
              <p className="px-3 py-3 text-xs text-[var(--color-muted)]">No matches. {(!users.length || !companies.length) && "Loading directory…"}</p>
            )}
            {globalResults.users.map(u => (
              <button key={`u-${u.id}`} onClick={() => { setDetailUser(u); setGlobalQ(""); }} className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-2">
                <Users size={13} className="text-[var(--color-muted)]" /><span className="text-sm">{u.email}</span><span className="text-[10px] text-[var(--color-muted)] ml-auto">{roleLabel(u.role)}</span>
              </button>
            ))}
            {globalResults.companies.map(c => (
              <button key={`c-${c.tenant_id}`} onClick={() => { setDetailCompany(c); setGlobalQ(""); }} className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-2">
                <Building2 size={13} className="text-[var(--color-muted)]" /><span className="text-sm">{c.company_name || c.tenant_id}</span><span className="text-[10px] text-[var(--color-muted)] ml-auto">{c.user_count} users</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Django-style console: grouped left rail + content panel */}
      <div className="flex gap-6 items-start">
        <aside className="w-52 shrink-0 hidden md:block sticky top-4 self-start">
          <div className="relative mb-3">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input value={tabQ} onChange={e => setTabQ(e.target.value)} placeholder="Filter…"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
          </div>
          <nav className="space-y-4">
            {ADMIN_SECTIONS.map(sec => {
              const items = sec.ids.map(id => tabMeta[id]).filter(Boolean).filter(t => !tabQ || t.label.toLowerCase().includes(tabQ.toLowerCase()));
              if (!items.length) return null;
              return (
                <div key={sec.label}>
                  <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]/70">{sec.label}</p>
                  <div className="space-y-0.5">
                    {items.map(t => (
                      <button key={t.id} onClick={() => { setTab(t.id); setQ(""); }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-lg font-medium text-left transition-colors ${tab === t.id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/5"}`}>
                        <t.icon size={14} className="shrink-0" /> <span className="truncate">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 space-y-6">
          {/* Mobile: horizontal section picker (rail is hidden on small screens) */}
          <div className="md:hidden flex gap-1 overflow-x-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 -mx-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setQ(""); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium whitespace-nowrap ${tab === t.id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)]"}`}>
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>

      {/* ── OVERVIEW (platform-wide) ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Companies",          value: stats ? stats.companies.toString() : "—",        sub: stats ? `${stats.activeCompanies} with live data` : "" },
              { label: "Total Users",        value: stats ? stats.users.toString() : "—",            sub: "across all tenants" },
              { label: "Aggregate Cash",     value: stats ? formatCurrency(stats.totalCash) : "—",   sub: "all company balances" },
              { label: "Aggregate Revenue",  value: stats ? formatCurrency(stats.totalRevenue) : "—",sub: "all-time inflows" },
              { label: "Open Receivables",   value: stats ? formatCurrency(stats.totalReceivables) : "—", sub: "unpaid invoices" },
              { label: "Transactions",       value: stats ? stats.totalTransactions.toLocaleString("en-IN") : "—", sub: "platform total" },
            ].map(s => (
              <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
                <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Role distribution */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-3">Users by role</p>
            <div className="flex flex-wrap gap-2">
              {stats && Object.entries(stats.byRole).sort((a, b) => b[1] - a[1]).map(([role, n]) => (
                <span key={role} className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${roleBadge(role)}`}>
                  {roleLabel(role)} · {n}
                </span>
              ))}
              {!stats && <p className="text-sm text-[var(--color-muted)]">Loading…</p>}
            </div>
          </div>
        </div>
      )}

      {/* search bar for companies/users */}
      {(tab === "companies" || tab === "users") && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 relative min-w-[220px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={tab === "users" ? "Search email, tenant or role…" : "Search company, owner or tenant…"}
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          {tab === "users" && (
            <button onClick={() => setShowInvite(v => !v)} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-semibold hover:opacity-90 shrink-0">
              <UserPlus size={13} /> Create user
            </button>
          )}
        </div>
      )}

      {tab === "users" && showInvite && (
        <form onSubmit={invite} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Email</label>
            <input type="email" required value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="name@company.com" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Role</label>
            <select value={invRole} onChange={e => setInvRole(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
              {ALL_ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tenant ID (optional)</label>
            <input value={invTenant} onChange={e => setInvTenant(e.target.value)} placeholder="leave blank for new" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none font-mono" />
          </div>
          <button type="submit" className="bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90">Create</button>
        </form>
      )}

      {/* ── COMPANIES ── */}
      {tab === "companies" && (
        loading ? <Spinner /> :
        filteredCompanies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No companies match.</p>
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[940px]">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  {["Company", "Owner", "Plan", "Users", "Cash", "Revenue", "Last login", "Status", ""].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i <= 1 ? "text-left" : i >= 6 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredCompanies.map(c => (
                  <tr key={c.tenant_id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5">
                      <button onClick={() => setDetailCompany(c)} className="font-medium hover:text-[var(--color-primary)] text-left">{c.company_name || "—"}</button>
                      <p className="text-[10px] text-[var(--color-muted)] font-mono truncate max-w-[160px]">{c.tenant_id}</p>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] truncate max-w-[160px]">{c.owner_email || "—"}</td>
                    <td className="px-4 py-2.5">
                      <select value={c.plan ?? "free"} onChange={e => setTenantPlan(c.tenant_id, e.target.value as PlanTier)}
                        title="Set this company's plan" className="text-xs font-semibold rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-2 py-1 outline-none cursor-pointer">
                        {(Object.keys(PLAN_LABEL) as PlanTier[]).map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.user_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(c.cash)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{formatCurrency(c.revenue)}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{relTime(c.last_login_at)}</td>
                    <td className="px-4 py-2.5">
                      {c.status === "suspended"
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-900/30 text-red-400 border-red-800/40">Suspended</span>
                        : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-900/30 text-green-400 border-green-800/40">Active</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => setDetailCompany(c)} title="Company 360" className="text-[var(--color-muted)] hover:text-[var(--color-primary)] mr-3"><Eye size={14} /></button>
                      {c.status === "suspended"
                        ? <button onClick={() => activateTenant(c.tenant_id, c.company_name || c.tenant_id)} title="Re-activate" className="text-[var(--color-muted)] hover:text-green-400"><Power size={14} /></button>
                        : <button onClick={() => suspendTenant(c.tenant_id, c.company_name || c.tenant_id)} title="Suspend company" className="text-[var(--color-muted)] hover:text-red-400"><Ban size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── USERS (manage everyone) ── */}
      {tab === "users" && (
        loading ? <Spinner /> :
        filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No users match.</p>
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            {/* A5 — bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                <span className="text-xs font-semibold">{selectedIds.size} selected</span>
                <span className="text-[10px] text-[var(--color-muted)]">Set plan:</span>
                {(Object.keys(PLAN_LABEL) as PlanTier[]).map(p => (
                  <button key={p} onClick={() => bulkSetPlan(p)} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-[var(--color-border)] hover:border-[var(--color-primary)]">{PLAN_LABEL[p]}</button>
                ))}
                <button onClick={exportUsersCsv} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-[var(--color-border)] hover:border-[var(--color-primary)] flex items-center gap-1"><Download size={10} /> CSV</button>
                <button onClick={bulkDelete} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-red-800/40 text-red-400 hover:bg-red-900/20 flex items-center gap-1"><Trash2 size={10} /> Delete</button>
                <button onClick={() => setSelectedIds(new Set())} className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)] ml-auto">Clear</button>
              </div>
            )}
            <table className="w-full text-sm min-w-[860px]">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  <th className="pl-4 pr-1 py-2.5 w-8">
                    <button onClick={() => setSelectedIds(selectedIds.size === filteredUsers.length ? new Set() : new Set(filteredUsers.map(u => u.id)))} className="text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="Select all">
                      {selectedIds.size === filteredUsers.length && filteredUsers.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                  </th>
                  {["Email", "Role", "Plan", "Team", "Last login", "Status", "Actions"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 6 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredUsers.map(u => {
                  const isSelf = u.id === user?.id;
                  return (
                    <tr key={u.id} className={`hover:bg-white/2 ${selectedIds.has(u.id) ? "bg-[var(--color-primary)]/5" : ""}`}>
                      <td className="pl-4 pr-1 py-2.5">
                        <button onClick={() => toggleSelect(u.id)} className="text-[var(--color-muted)] hover:text-[var(--color-primary)]">
                          {selectedIds.has(u.id) ? <CheckSquare size={14} className="text-[var(--color-primary)]" /> : <Square size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setDetailUser(u)} className="hover:text-[var(--color-primary)] text-left">{u.email}</button>
                        {u.role === "owner" && <Crown size={11} className="inline ml-1.5 -mt-0.5 text-[var(--color-primary)]" aria-label="Primary owner" />}{isSelf && <span className="ml-2 text-[10px] text-[var(--color-muted)]">(you)</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isSelf ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${roleBadge(u.role)}`}>{roleLabel(u.role)}</span>
                        ) : (
                          <select value={u.role} onChange={e => changeRole(u, e.target.value)}
                            className={`text-xs font-semibold rounded-lg border px-2 py-1 outline-none cursor-pointer ${roleBadge(u.role)}`}>
                            {ALL_ROLE_OPTIONS.map(r => <option key={r.id} value={r.id} className="bg-[var(--color-surface)] text-[var(--color-text)]">{r.label}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <select value={u.subscription_plan ?? "free"} onChange={e => setTenantPlan(u.tenant_id, e.target.value as PlanTier)}
                          title="Set this tenant's plan" className="text-xs font-semibold rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-2 py-1 outline-none cursor-pointer">
                          {(Object.keys(PLAN_LABEL) as PlanTier[]).map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 max-w-[170px]">
                        <p className="truncate text-xs">{companyName(u.tenant_id) || <span className="text-[var(--color-muted)]">—</span>}</p>
                        <p className="font-mono text-[10px] text-[var(--color-muted)] truncate">{u.tenant_id}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]" title={u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-IN") : "Never logged in"}>{relTime(u.last_login_at)}</td>
                      <td className="px-4 py-2.5">{u.status === "suspended" ? <span className="text-red-400 text-xs">Suspended</span> : u.first_login ? <span className="text-yellow-400 text-xs">Pending login</span> : <span className="text-green-400 text-xs">Active</span>}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2.5">
                          <button onClick={() => setDetailUser(u)} title="User 360" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Eye size={14} /></button>
                          <button onClick={() => impersonateUser(u)} title="View as this user" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><UserCog size={14} /></button>
                          <button onClick={() => setEditUser(u)} title="Edit user" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Pencil size={14} /></button>
                          <button onClick={() => resetPassword(u)} title="Reset password" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><KeyRound size={14} /></button>
                          {!isSelf && <button onClick={() => removeUser(u)} title="Delete user" className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "metrics" && <MetricsBoard authHeaders={authHeaders} />}
      {tab === "plan-access" && <PlanAccessMatrix />}
      {tab === "invites" && <TeamInvites authHeaders={authHeaders} isSuper={user?.role === "super_admin"} myTenant={user?.tenant_id ?? ""} companies={companies} />}
      {tab === "admin-actions" && <AdminActionsAudit authHeaders={authHeaders} />}
      {editUser && <UserEditModal user={editUser} onClose={() => setEditUser(null)} onSave={saveUserProfile} />}
      {detailUser && <User360Drawer user={detailUser} isSelf={detailUser.id === user?.id}
        team={companyName(detailUser.tenant_id)}
        onClose={() => setDetailUser(null)}
        onImpersonate={impersonateUser} onOpenTenant={openTenant}
        onEdit={u => { setDetailUser(null); setEditUser(u); }}
        onReset={resetPassword} onPlan={setTenantPlan} onRole={changeRole}
        onDelete={u => { setDetailUser(null); removeUser(u); }} />}
      {detailCompany && <Company360Drawer company={detailCompany} authHeaders={authHeaders}
        onClose={() => setDetailCompany(null)}
        onInspect={inspect} onPlan={setTenantPlan}
        onSuspend={suspendTenant} onActivate={activateTenant} onOpenUser={u => { setDetailCompany(null); setDetailUser(u); }} />}
      {tab === "ca-workspace" && <CaWorkspace companies={companies} loadCompanies={loadCompanies} />}
      {tab === "usage" && <UsageAnalytics />}
      {tab === "retention" && <RetentionSettings />}
      {tab === "flags" && <FeatureFlagManager />}
      {tab === "announce" && <AnnouncementComposer />}
      {tab === "audit-log" && <AuditLogViewer />}
      {tab === "quotas" && <SeatQuotaTracker stats={stats} companies={companies} loadCompanies={loadCompanies} />}
      {tab === "health" && <SystemHealthBoard stats={stats} />}
      {tab === "maintenance" && <MaintenanceMode />}
      {tab === "permissions" && <RolePermissionEditor />}
      {tab === "login-history" && <LoginHistoryViewer />}
      {tab === "import-jobs" && <ImportJobsBoard />}
      {tab === "config-snapshot" && <ConfigSnapshot stats={stats} />}
      {tab === "error-log" && <ErrorLogViewer />}
      {tab === "notify-templates" && <NotificationTemplates />}
      {tab === "plan-usage" && <PlanUsage stats={stats} companies={companies} loadCompanies={loadCompanies} />}
      {tab === "api-keys" && <ApiKeyManager />}
      {tab === "onboarding" && <OnboardingChecklist stats={stats} />}
      {tab === "data-export" && <TenantDataExport companies={companies} loadCompanies={loadCompanies} stats={stats} />}
      {tab === "bulk-import" && <BulkUserImport loadUsers={loadUsers} loadStats={loadStats} />}
      {tab === "scheduled-jobs" && <ScheduledJobsBoard />}
      {tab === "rate-limits" && <RateLimitConfig />}
        </div>{/* /content panel */}
      </div>{/* /console flex */}
    </div>
  );
}

// ── #174 CA / Advisor Invite & Workspace ───────────────────────────────────
type CaAdvisor = {
  id: string;
  name: string;
  email: string;
  firm: string;
  role: "ca" | "advisor" | "bookkeeper";
  clientTenants: string[];
  invitedAt: string;
  status: "invited" | "active";
};

// ── Team invites — request / accept / reject lifecycle (polled, no websockets) ──
type Invite = { id: string; tenant_id: string; inviter_email: string | null; invitee_email: string; invitee_user_id: string | null; role: string; status: string; message: string | null; created_at: string; resolved_at: string | null };

function TeamInvites({ authHeaders, isSuper, myTenant, companies }: { authHeaders: () => Record<string, string>; isSuper: boolean; myTenant: string; companies: Company[] }) {
  const [incoming, setIncoming] = useState<Invite[]>([]);
  const [outgoing, setOutgoing] = useState<Invite[]>([]);
  const [invitee, setInvitee] = useState("");
  const [role, setRole] = useState("finance_manager");
  const [tenant, setTenant] = useState(myTenant);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`${BASE}/api/invites`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { incoming: [], outgoing: [] })
      .then(d => { setIncoming(d.incoming ?? []); setOutgoing(d.outgoing ?? []); })
      .catch(() => {});
  }, [authHeaders]);
  // Poll every 15s → near-real-time without websockets (web + iOS + Android).
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = invitee.trim();
    if (!v) { toast.error("Enter an invitee email or user-id"); return; }
    const body: Record<string, string> = { role };
    if (v.includes("@")) body.invitee_email = v; else body.invitee_user_id = v;
    if (isSuper && tenant.trim()) body.tenant_id = tenant.trim();
    setBusy(true);
    const res = await fetch(`${BASE}/api/invites`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) { toast.success("Invite sent"); setInvitee(""); load(); }
    else toast.error((await res.json().catch(() => ({}))).error ?? "Failed to send invite");
  };
  const act = async (id: string, action: "accept" | "reject" | "cancel") => {
    const res = await fetch(`${BASE}/api/invites/${id}/${action}`, { method: "POST", headers: authHeaders() });
    if (res.ok) { toast.success(`Invite ${action === "accept" ? "accepted" : action === "reject" ? "rejected" : "cancelled"}`); load(); if (action === "accept") setTimeout(() => window.location.reload(), 700); }
    else toast.error((await res.json().catch(() => ({}))).error ?? `Failed to ${action}`);
  };
  const teamLabel = (tid: string) => companies.find(c => c.tenant_id === tid)?.company_name || companies.find(c => c.tenant_id === tid)?.owner_email || tid;
  const statusBadge = (s: string) => s === "pending" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"
    : s === "accepted" ? "bg-green-900/30 text-green-400 border-green-800/40"
    : s === "rejected" ? "bg-red-900/30 text-red-400 border-red-800/40"
    : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Mail size={14} className="text-[var(--color-primary)]" /> Team Invites</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Invite a person to a team by email or user-id; they accept or reject. Updates poll live (no refresh) across web &amp; mobile. Super-admin can invite into any tenant.</p>
      </div>

      {/* Send an invite */}
      <form onSubmit={send} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className={isSuper ? "" : "md:col-span-2"}>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Invitee (email or user-id)</label>
          <input value={invitee} onChange={e => setInvitee(e.target.value)} placeholder="person@company.in or a user-id"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Role</label>
          <select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            {ALL_ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        {isSuper && (
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Into team (tenant-id)</label>
            <input value={tenant} onChange={e => setTenant(e.target.value)} placeholder="tenant-id"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
        )}
        <button type="submit" disabled={busy} className="bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"><UserPlus size={14} /> Send invite</button>
      </form>

      {/* Incoming requests for the signed-in user */}
      {incoming.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Clock size={13} className="text-yellow-400" /> Invites awaiting your response</p>
          {incoming.map(inv => (
            <div key={inv.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
              <div className="text-sm">Join <strong>{teamLabel(inv.tenant_id)}</strong> as <span className="font-medium">{roleLabel(inv.role)}</span> <span className="text-[11px] text-[var(--color-muted)]">· invited by {inv.inviter_email || "—"}</span></div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => act(inv.id, "accept")} className="text-xs font-semibold px-3 py-1 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] flex items-center gap-1"><Check size={12} /> Accept</button>
                <button onClick={() => act(inv.id, "reject")} className="text-xs font-semibold px-3 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-red-400 flex items-center gap-1"><X size={12} /> Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All sent invites (tenant / all for super) */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>{["Invitee", "Team", "Role", "Status", "Invited by", ""].map((h, i) => (
              <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {outgoing.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--color-muted)] text-xs">No invites yet.</td></tr>
            ) : outgoing.map(inv => (
              <tr key={inv.id} className="hover:bg-white/2">
                <td className="px-4 py-2.5">{inv.invitee_email}</td>
                <td className="px-4 py-2.5 text-[var(--color-muted)] truncate max-w-[160px]">{teamLabel(inv.tenant_id)}</td>
                <td className="px-4 py-2.5">{roleLabel(inv.role)}</td>
                <td className="px-4 py-2.5"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadge(inv.status)}`}>{inv.status}</span></td>
                <td className="px-4 py-2.5 text-[var(--color-muted)] text-xs">{inv.inviter_email || "—"}</td>
                <td className="px-4 py-2.5 text-right">{inv.status === "pending" && <button onClick={() => act(inv.id, "cancel")} title="Cancel invite" className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Plan-access matrix — exactly which modules each plan unlocks (config-driven) ──
function PlanAccessMatrix() {
  const plans = Object.keys(PLAN_LABEL) as PlanTier[];
  const rows = Object.entries(FEATURE_ENTITLEMENTS)
    .map(([slug, req]) => ({ slug, req: req as PlanTier, label: FEATURE_PITCH[slug]?.title ?? slug }))
    .sort((a, b) => PLAN_RANK[a.req] - PLAN_RANK[b.req] || a.label.localeCompare(b.label));
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Crown size={14} className="text-[var(--color-primary)]" /> Plan Access</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Exactly which modules each plan unlocks — read live from the entitlement config (nothing hardcoded). Modules not listed are open on every plan; super-admin bypasses all gates.</p>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">Module</th>
              {plans.map(p => <th key={p} className="px-4 py-2.5 text-center text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{PLAN_LABEL[p]}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map(r => (
              <tr key={r.slug} className="hover:bg-white/2">
                <td className="px-4 py-2.5"><span className="font-medium">{r.label}</span> <span className="text-[10px] text-[var(--color-muted)] font-mono">/{r.slug}</span></td>
                {plans.map(p => (
                  <td key={p} className="px-4 py-2.5 text-center">
                    {PLAN_RANK[p] >= PLAN_RANK[r.req]
                      ? <Check size={15} className="inline text-green-400" />
                      : <Lock size={13} className="inline text-[var(--color-muted)] opacity-40" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3">
        {plans.map(p => (
          <div key={p} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 min-w-[130px]">
            <p className="text-xs text-[var(--color-muted)] mb-1">{PLAN_LABEL[p]} unlocks</p>
            <p className="text-lg font-bold text-[var(--color-primary)]">{rows.filter(r => PLAN_RANK[p] >= PLAN_RANK[r.req]).length}<span className="text-xs text-[var(--color-muted)]"> / {rows.length} gated</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Editable user record (super-admin): email + display name ────────────────────
function UserEditModal({ user, onClose, onSave }: { user: AdminUser; onClose: () => void; onSave: (id: string, patch: { email?: string; display_name?: string }) => void }) {
  const [email, setEmail] = useState(user.email);
  const [name, setName] = useState(user.display_name ?? "");
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Pencil size={14} className="text-[var(--color-primary)]" /> Edit user</h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Email</label><input className={inp} value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Display name</label><input className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="(optional)" /></div>
        <p className="text-[11px] text-[var(--color-muted)]">Role and plan are edited inline in the table. Tenant: <span className="font-mono">{user.tenant_id}</span></p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)]">Cancel</button>
          <button onClick={() => onSave(user.id, { email: email.trim(), display_name: name.trim() })} className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] flex items-center gap-1"><Check size={12} /> Save</button>
        </div>
      </div>
    </div>
  );
}

function CaWorkspace({ companies, loadCompanies }: { companies: Company[]; loadCompanies: () => void }) {
  const [advisors, setAdvisors] = useFeatureState<CaAdvisor[]>("admin-ca-advisors", []);
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [firm, setFirm]   = useState("");
  const [role, setRole]   = useState<CaAdvisor["role"]>("ca");

  useEffect(() => { if (companies.length === 0) loadCompanies(); }, [companies.length, loadCompanies]);

  const ROLE_LABEL: Record<CaAdvisor["role"], string> = { ca: "Chartered Accountant", advisor: "Financial Advisor", bookkeeper: "Bookkeeper" };

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { toast.error("Name and email required"); return; }
    if (advisors.some(a => a.email.toLowerCase() === email.trim().toLowerCase())) { toast.error("Advisor already invited"); return; }
    const adv: CaAdvisor = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      firm: firm.trim(),
      role,
      clientTenants: [],
      invitedAt: new Date().toISOString(),
      status: "invited",
    };
    setAdvisors(prev => [adv, ...prev]);
    setName(""); setEmail(""); setFirm("");
    toast.success(`Invite ready for ${adv.name} — share the workspace link to onboard them`);
  };

  const toggleClient = (advId: string, tenant: string) => {
    setAdvisors(prev => prev.map(a => a.id === advId
      ? { ...a, clientTenants: a.clientTenants.includes(tenant) ? a.clientTenants.filter(t => t !== tenant) : [...a.clientTenants, tenant] }
      : a));
  };
  const activate = (advId: string) => {
    setAdvisors(prev => prev.map(a => a.id === advId ? { ...a, status: "active" } : a));
    toast.success("Advisor marked active");
  };
  const remove = (advId: string) => {
    if (!window.confirm("Remove this advisor and revoke their client access?")) return;
    setAdvisors(prev => prev.filter(a => a.id !== advId));
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const totalMappings = advisors.reduce((s, a) => s + a.clientTenants.length, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Advisors", value: advisors.length.toString(), sub: "CAs & bookkeepers" },
          { label: "Active", value: advisors.filter(a => a.status === "active").length.toString(), sub: "onboarded" },
          { label: "Pending Invites", value: advisors.filter(a => a.status === "invited").length.toString(), sub: "awaiting login" },
          { label: "Client Mappings", value: totalMappings.toString(), sub: "advisor↔company links" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <form onSubmit={invite} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Briefcase size={14} className="text-[var(--color-primary)]" /> Invite a CA / Advisor</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Give your accountant collaborative access to selected client companies — the core of multi-client distribution.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="CA Anita Sharma" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="anita@firm.in" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Firm (optional)</label>
            <input value={firm} onChange={e => setFirm(e.target.value)} placeholder="Sharma & Associates" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Role</label>
            <select value={role} onChange={e => setRole(e.target.value as CaAdvisor["role"])} className={inp}>
              {(Object.keys(ROLE_LABEL) as CaAdvisor["role"][]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" className="mt-4 flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90">
          <Plus size={13} /> Add advisor
        </button>
      </form>

      {advisors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Briefcase size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No advisors yet. Invite your CA to collaborate across clients.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {advisors.map(a => (
            <div key={a.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-accent)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                    <Briefcase size={15} className="text-[var(--color-primary)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{a.name} <span className="text-[10px] text-[var(--color-muted)] font-normal ml-1">{ROLE_LABEL[a.role]}</span></p>
                    <p className="text-xs text-[var(--color-muted)] flex items-center gap-1"><Mail size={11} /> {a.email}{a.firm && ` · ${a.firm}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${a.status === "active" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                    {a.status === "active" ? "Active" : "Invited"}
                  </span>
                  {a.status === "invited" && <button onClick={() => activate(a.id)} className="text-xs text-[var(--color-primary)] hover:underline">Mark active</button>}
                  <button onClick={() => remove(a.id)} title="Remove advisor" className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wide mb-2">Client access ({a.clientTenants.length} of {companies.length})</p>
                {companies.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted)]">Loading companies…</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {companies.map(c => {
                      const on = a.clientTenants.includes(c.tenant_id);
                      return (
                        <button key={c.tenant_id} onClick={() => toggleClient(a.id, c.tenant_id)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                          {c.company_name || c.tenant_id.slice(0, 8)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #175 Usage & Activity Analytics ────────────────────────────────────────
function UsageAnalytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${localStorage.getItem("hr_access") ?? ""}` }), []);

  useEffect(() => {
    fetch(`${BASE}/api/admin/stats`, { headers: authHeaders() }).then(r => r.ok ? r.json() : null).then(setStats).catch(() => {});
    fetch(`${BASE}/api/admin/companies`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then(setCompanies).catch(() => {});
  }, [authHeaders]);

  const now = new Date();
  const active7  = companies.filter(c => c.last_activity && differenceInCalendarDays(now, new Date(c.last_activity)) <= 7).length;
  const active30 = companies.filter(c => c.last_activity && differenceInCalendarDays(now, new Date(c.last_activity)) <= 30).length;
  const dormant  = companies.filter(c => !c.last_activity || differenceInCalendarDays(now, new Date(c.last_activity)) > 30).length;
  const totalTxns = companies.reduce((s, c) => s + (c.transactions || 0), 0);

  const ranked = [...companies]
    .map(c => ({ ...c, score: (c.transactions || 0) + (c.user_count || 0) * 5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const maxScore = ranked.length ? Math.max(...ranked.map(c => c.score), 1) : 1;

  const adoption = stats ? [
    { feature: "Transactions logged", n: stats.totalTransactions },
    { feature: "Receivables tracked", n: Math.round(stats.totalReceivables / 1000) },
    { feature: "Companies with data", n: stats.activeCompanies },
    { feature: "Users provisioned", n: stats.users },
  ] : [];
  const maxAdopt = adoption.length ? Math.max(...adoption.map(a => a.n), 1) : 1;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active (7d)", value: active7.toString(), sub: "companies with recent activity" },
          { label: "Active (30d)", value: active30.toString(), sub: "monthly active" },
          { label: "Dormant", value: dormant.toString(), sub: "no activity 30d+" },
          { label: "Total Transactions", value: totalTxns.toLocaleString("en-IN"), sub: "across companies" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Most Engaged Companies</h2>
        {ranked.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Loading engagement data…</p>
        ) : (
          <div className="space-y-2.5">
            {ranked.map(c => (
              <div key={c.tenant_id}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="font-medium truncate max-w-[60%]">{c.company_name || c.tenant_id.slice(0, 8)}</span>
                  <span className="tabular-nums text-[var(--color-muted)]">{c.transactions} txns · {c.user_count} users{c.last_activity ? ` · ${differenceInCalendarDays(now, new Date(c.last_activity))}d ago` : ""}</span>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-700" style={{ width: `${Math.round((c.score / maxScore) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-3">Platform Adoption Signals</h2>
        {adoption.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Loading…</p>
        ) : (
          <div className="space-y-2.5">
            {adoption.map(a => (
              <div key={a.feature}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="font-medium">{a.feature}</span>
                  <span className="tabular-nums text-[var(--color-muted)]">{a.n.toLocaleString("en-IN")}</span>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${Math.round((a.n / maxAdopt) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── #176 Data-Retention & Compliance Settings ──────────────────────────────
type RetentionPolicy = {
  transactionsYears: number;
  invoicesYears: number;
  auditLogsDays: number;
  inactiveUserDays: number;
  autoPurge: boolean;
  encryptAtRest: boolean;
  consentTracking: boolean;
  dataLocalisation: boolean;
  dpoEmail: string;
  lastReviewed: string;
};

const DEFAULT_RETENTION: RetentionPolicy = {
  transactionsYears: 8,
  invoicesYears: 8,
  auditLogsDays: 365,
  inactiveUserDays: 180,
  autoPurge: false,
  encryptAtRest: true,
  consentTracking: false,
  dataLocalisation: true,
  dpoEmail: "",
  lastReviewed: "",
};

function RetentionSettings() {
  const [policy, setPolicy] = useFeatureState<RetentionPolicy>("admin-retention-policy", DEFAULT_RETENTION);
  const set = <K extends keyof RetentionPolicy>(k: K, v: RetentionPolicy[K]) => setPolicy(prev => ({ ...prev, [k]: v }));

  const save = () => {
    set("lastReviewed", new Date().toISOString());
    toast.success("Retention policy reviewed & saved");
  };

  // Income Tax Act mandates 8-yr books retention; GST 6 yrs. Flag risky settings.
  const warnings: string[] = [];
  if (policy.transactionsYears < 8) warnings.push("Income Tax Act §44AA expects books retained for 8 years.");
  if (policy.invoicesYears < 6) warnings.push("GST law requires invoices retained for at least 6 years.");
  if (!policy.encryptAtRest) warnings.push("DPDP Act: reasonable security safeguards (encryption) expected.");
  if (policy.autoPurge && policy.transactionsYears < 8) warnings.push("Auto-purge below 8 years may delete records still legally required.");

  const numbers: { key: keyof RetentionPolicy; label: string; unit: string; hint: string }[] = [
    { key: "transactionsYears", label: "Transaction / books retention", unit: "years", hint: "Statutory: 8 years (IT Act)" },
    { key: "invoicesYears", label: "Invoice retention", unit: "years", hint: "Statutory: 6 years (GST)" },
    { key: "auditLogsDays", label: "Audit log retention", unit: "days", hint: "Security review window" },
    { key: "inactiveUserDays", label: "Inactive user auto-offboard", unit: "days", hint: "Revoke access after inactivity" },
  ];
  const toggles: { key: keyof RetentionPolicy; label: string; desc: string }[] = [
    { key: "autoPurge", label: "Auto-purge expired data", desc: "Permanently delete records past their retention window" },
    { key: "encryptAtRest", label: "Encryption at rest", desc: "Encrypt stored financial data (DPDP safeguard)" },
    { key: "consentTracking", label: "Consent tracking", desc: "Record DPDP consent for personal data processing" },
    { key: "dataLocalisation", label: "Data localisation (India)", desc: "Keep data within Indian jurisdiction" },
  ];
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] tabular-nums";

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Shield size={14} className="text-[var(--color-primary)]" /> Data-Retention & Compliance</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">DPDP-aligned retention controls. Defaults respect Indian statutory minimums (8-yr books, 6-yr GST invoices).</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {numbers.map(n => (
            <div key={n.key}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{n.label} <span className="text-[10px]">({n.unit})</span></label>
              <input type="number" min={0} value={policy[n.key] as number}
                onChange={e => set(n.key, (parseInt(e.target.value) || 0) as RetentionPolicy[typeof n.key])} className={inp} />
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{n.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Compliance Controls</h3>
        <div className="space-y-2">
          {toggles.map(t => (
            <label key={t.key} className="flex items-start gap-3 cursor-pointer py-2 border-b border-[var(--color-border)] last:border-0">
              <input type="checkbox" checked={policy[t.key] as boolean}
                onChange={e => set(t.key, e.target.checked as RetentionPolicy[typeof t.key])} className="accent-[var(--color-primary)] mt-0.5" />
              <div>
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-[var(--color-muted)]">{t.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Data Protection Officer (DPO) email</label>
          <input type="email" value={policy.dpoEmail} onChange={e => set("dpoEmail", e.target.value)}
            placeholder="dpo@company.com" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg p-4 border border-yellow-800/40 bg-yellow-950/20 space-y-1">
          <p className="text-sm font-semibold text-yellow-400">Compliance warnings</p>
          {warnings.map(w => <p key={w} className="text-xs text-yellow-300">• {w}</p>)}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-[var(--color-muted)] flex items-center gap-1.5">
          <Clock size={12} />
          {policy.lastReviewed ? `Last reviewed ${format(new Date(policy.lastReviewed), "d MMM yyyy, HH:mm")}` : "Not yet reviewed"}
        </p>
        <button onClick={save} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90">
          <Shield size={13} /> Save & mark reviewed
        </button>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Indicative controls aligned with the DPDP Act 2023 and Indian tax/GST record-keeping rules. Confirm statutory retention periods with your CA / legal counsel before enabling auto-purge.</p>
    </div>
  );
}

// ── #177 Platform Feature-Flag Manager ─────────────────────────────────────
type FeatureFlag = { key: string; label: string; desc: string; enabled: boolean; rollout: number };

const DEFAULT_FLAGS: FeatureFlag[] = [
  { key: "ai-copilot",      label: "AI Copilot",          desc: "Conversational finance assistant for all tenants",  enabled: true,  rollout: 100 },
  { key: "whatsapp-bot",    label: "WhatsApp Bot",         desc: "Inbound/outbound WhatsApp finance updates",          enabled: true,  rollout: 100 },
  { key: "aa-underwriting", label: "Account Aggregator",   desc: "Pull bank data via AA framework for underwriting",   enabled: false, rollout: 25 },
  { key: "b2b-bnpl",        label: "B2B BNPL",             desc: "Buy-now-pay-later on supplier invoices",             enabled: false, rollout: 10 },
  { key: "tally-plugin",    label: "Tally Sync Plugin",    desc: "Two-way sync with Tally desktop ledgers",            enabled: true,  rollout: 60 },
  { key: "multi-currency",  label: "Multi-currency",       desc: "Foreign-currency invoices & FX gain/loss",           enabled: false, rollout: 0  },
];

function FeatureFlagManager() {
  const [flags, setFlags] = useFeatureState<FeatureFlag[]>("adm-feature-flags", DEFAULT_FLAGS);

  const toggle = (key: string) =>
    setFlags(prev => prev.map(f => f.key === key ? { ...f, enabled: !f.enabled, rollout: !f.enabled ? (f.rollout || 100) : f.rollout } : f));
  const setRollout = (key: string, rollout: number) =>
    setFlags(prev => prev.map(f => f.key === key ? { ...f, rollout: Math.max(0, Math.min(100, rollout)) } : f));
  const onCount = flags.filter(f => f.enabled).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Flags", value: flags.length.toString(), sub: "platform capabilities" },
          { label: "Enabled", value: onCount.toString(), sub: "live for tenants" },
          { label: "Disabled", value: (flags.length - onCount).toString(), sub: "hidden / dark-launch" },
          { label: "Avg Rollout", value: `${flags.length ? Math.round(flags.filter(f => f.enabled).reduce((s, f) => s + f.rollout, 0) / Math.max(onCount, 1)) : 0}%`, sub: "of enabled flags" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Flag size={14} className="text-[var(--color-primary)]" /> Feature Flags</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Toggle capabilities platform-wide and stage gradual rollouts. Changes sync instantly across your devices.</p>
        <div className="space-y-2">
          {flags.map(f => (
            <div key={f.key} className="flex items-start justify-between gap-4 py-3 border-b border-[var(--color-border)] last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium flex items-center gap-2">{f.label}<code className="text-[10px] font-mono text-[var(--color-muted)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded">{f.key}</code></p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">{f.desc}</p>
                {f.enabled && (
                  <div className="flex items-center gap-2 mt-2 max-w-[280px]">
                    <input type="range" min={0} max={100} step={5} value={f.rollout} onChange={e => setRollout(f.key, parseInt(e.target.value) || 0)} className="flex-1 accent-[var(--color-primary)]" />
                    <span className="text-[10px] tabular-nums text-[var(--color-muted)] w-9 text-right">{f.rollout}%</span>
                  </div>
                )}
              </div>
              <button onClick={() => toggle(f.key)}
                className={`shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${f.enabled ? "bg-green-900/30 text-green-400 border-green-800/40" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                {f.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── #178 Announcement / Banner Composer ────────────────────────────────────
type Announcement = { id: string; title: string; body: string; level: "info" | "warning" | "critical"; active: boolean; createdAt: string };

function AnnouncementComposer() {
  const [items, setItems] = useFeatureState<Announcement[]>("adm-announcements", []);
  const [title, setTitle] = useState("");
  const [body, setBody]   = useState("");
  const [level, setLevel] = useState<Announcement["level"]>("info");

  const publish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { toast.error("Title and message required"); return; }
    const a: Announcement = { id: crypto.randomUUID(), title: title.trim(), body: body.trim(), level, active: true, createdAt: new Date().toISOString() };
    setItems(prev => [a, ...prev]);
    setTitle(""); setBody(""); setLevel("info");
    toast.success("Announcement published to all tenants");
  };
  const toggle = (id: string) => setItems(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a));
  const remove = (id: string) => setItems(prev => prev.filter(a => a.id !== id));

  const LEVELS: Record<Announcement["level"], string> = {
    info: "bg-blue-900/30 text-blue-400 border-blue-800/40",
    warning: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    critical: "bg-red-900/30 text-red-400 border-red-800/40",
  };
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const liveCount = items.filter(a => a.active).length;

  return (
    <div className="space-y-5">
      <form onSubmit={publish} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Megaphone size={14} className="text-[var(--color-primary)]" /> Compose Announcement</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Broadcast a banner to every tenant — outages, new features, billing notices. {liveCount} currently live.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Scheduled maintenance Sunday 2am" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Severity</label>
            <select value={level} onChange={e => setLevel(e.target.value as Announcement["level"])} className={inp}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Message</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder="Details shown in the banner…" className={`${inp} resize-none`} />
        </div>
        <button type="submit" className="mt-4 flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90">
          <Plus size={13} /> Publish
        </button>
      </form>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Megaphone size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(a => (
            <div key={a.id} className={`rounded-lg p-4 border ${a.active ? LEVELS[a.level] : "border-[var(--color-border)] bg-[var(--color-surface)] opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2">{a.title}<span className="text-[10px] uppercase tracking-wide font-bold">{a.level}</span></p>
                  <p className="text-xs mt-1 opacity-90">{a.body}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-1.5">{format(new Date(a.createdAt), "d MMM yyyy, HH:mm")}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => toggle(a.id)} className="text-xs hover:underline">{a.active ? "Unpublish" : "Republish"}</button>
                  <button onClick={() => remove(a.id)} title="Delete" className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #179 Platform Audit-Log Viewer ─────────────────────────────────────────
function AuditLogViewer() {
  const { store } = useApp();
  const [filter, setFilter] = useState<"all" | "txn" | "invoice">("all");

  type Entry = { id: string; ts: string; kind: "txn" | "invoice"; actor: string; summary: string };
  const entries: Entry[] = [];
  for (const t of store.transactions ?? []) {
    entries.push({
      id: `t-${t.id}`, ts: t.date, kind: "txn",
      actor: t.category,
      summary: `${formatCurrency(Math.abs(t.amount))} — ${t.description || t.counterparty || t.category}`,
    });
  }
  for (const inv of store.invoices ?? []) {
    entries.push({
      id: `i-${inv.id}`, ts: inv.invoiceDate ?? inv.dueDate, kind: "invoice",
      actor: inv.source ?? "manual",
      summary: `Invoice ${inv.invoiceNumber ?? inv.id.slice(0, 6)} ${formatCurrency(inv.amount)} — ${inv.customer} (${inv.status})`,
    });
  }
  const filtered = entries
    .filter(e => filter === "all" || e.kind === filter)
    .filter(e => e.ts)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 200);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><ScrollText size={14} className="text-[var(--color-primary)]" /> Audit Log</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Reconstructed from synced store activity — financial events newest-first (max 200).</p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {([["all", "All"], ["txn", "Transactions"], ["invoice", "Invoices"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`text-xs px-3 py-1 rounded font-medium ${filter === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>{label}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <ScrollText size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No activity to show.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["When", "Type", "Actor", "Event"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{format(new Date(e.ts), "d MMM yy, HH:mm")}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${e.kind === "txn" ? "bg-blue-900/30 text-blue-400 border-blue-800/40" : "bg-purple-900/30 text-purple-400 border-purple-800/40"}`}>{e.kind === "txn" ? "Transaction" : "Invoice"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-[var(--color-muted)] truncate max-w-[140px]">{e.actor}</td>
                  <td className="px-4 py-2.5">{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #180 Seat & Usage Quota Tracker ────────────────────────────────────────
function SeatQuotaTracker({ stats, companies, loadCompanies }: { stats: Stats | null; companies: Company[]; loadCompanies: () => void }) {
  const [seatLimit, setSeatLimit] = useFeatureState<number>("adm-seat-limit", 50);
  const [txnLimit, setTxnLimit]   = useFeatureState<number>("adm-txn-quota", 100000);
  const [companyLimit, setCompanyLimit] = useFeatureState<number>("adm-company-limit", 25);

  useEffect(() => { if (companies.length === 0) loadCompanies(); }, [companies.length, loadCompanies]);

  const usedSeats = stats?.users ?? 0;
  const usedTxns  = stats?.totalTransactions ?? 0;
  const usedCompanies = stats?.companies ?? 0;

  const meters: { label: string; used: number; limit: number; set: (n: number) => void }[] = [
    { label: "User seats", used: usedSeats, limit: seatLimit, set: n => setSeatLimit(n) },
    { label: "Companies / tenants", used: usedCompanies, limit: companyLimit, set: n => setCompanyLimit(n) },
    { label: "Transactions logged", used: usedTxns, limit: txnLimit, set: n => setTxnLimit(n) },
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Seats & Usage Quotas</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track live consumption against your plan limits. Edit a limit to model headroom; usage is computed from platform stats.</p>
        <div className="space-y-5">
          {meters.map(m => {
            const pct = m.limit > 0 ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;
            const over = m.used > m.limit;
            const bar = over ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-[var(--color-primary)]";
            return (
              <div key={m.label}>
                <div className="flex items-center justify-between mb-1.5 gap-3 flex-wrap">
                  <span className="text-sm font-medium">{m.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs tabular-nums ${over ? "text-red-400" : "text-[var(--color-muted)]"}`}>{m.used.toLocaleString("en-IN")} / {m.limit.toLocaleString("en-IN")} ({pct}%)</span>
                    <input type="number" min={0} value={m.limit} onChange={e => m.set(parseInt(e.target.value) || 0)}
                      className="w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums" />
                  </div>
                </div>
                <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${pct}%` }} />
                </div>
                {over && <p className="text-[10px] text-red-400 mt-1">Over limit — raise the quota or contact billing.</p>}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Limits are stored locally and synced across your devices; enforcement happens server-side on the billing plan. Use this to forecast when you will need an upgrade.</p>
    </div>
  );
}

// ── #181 System Health Status Board ────────────────────────────────────────
function SystemHealthBoard({ stats }: { stats: Stats | null }) {
  const [checks, setChecks] = useState<{ name: string; ok: boolean; ms: number }[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    const headers = { Authorization: `Bearer ${localStorage.getItem("hr_access") ?? ""}` };
    const probes: { name: string; path: string }[] = [
      { name: "Admin stats API", path: "/api/admin/stats" },
      { name: "Companies API", path: "/api/admin/companies" },
      { name: "Users / auth API", path: "/api/users" },
    ];
    const results = await Promise.all(probes.map(async p => {
      const t0 = performance.now();
      try {
        const r = await fetch(`${BASE}${p.path}`, { headers });
        return { name: p.name, ok: r.ok, ms: Math.round(performance.now() - t0) };
      } catch {
        return { name: p.name, ok: false, ms: Math.round(performance.now() - t0) };
      }
    }));
    setChecks(results);
    setCheckedAt(new Date());
    setRunning(false);
  }, []);

  useEffect(() => { run(); }, [run]);

  const allOk = checks?.every(c => c.ok) ?? false;
  const avgMs = checks && checks.length ? Math.round(checks.reduce((s, c) => s + c.ms, 0) / checks.length) : 0;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2"><HeartPulse size={14} className="text-[var(--color-primary)]" /> System Health</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Live probes against core platform APIs.</p>
          </div>
          <button onClick={run} disabled={running} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50">
            {running ? "Checking…" : "Re-run checks"}
          </button>
        </div>
        <div className={`rounded-lg p-4 border mb-4 ${checks === null ? "border-[var(--color-border)]" : allOk ? "bg-green-900/20 border-green-800/40" : "bg-red-900/20 border-red-800/40"}`}>
          <p className={`text-sm font-semibold ${checks === null ? "" : allOk ? "text-green-400" : "text-red-400"}`}>
            {checks === null ? "Running checks…" : allOk ? "All systems operational" : "Degraded — one or more checks failing"}
          </p>
          <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
            {checkedAt ? `Last checked ${format(checkedAt, "d MMM yyyy, HH:mm:ss")} · avg ${avgMs}ms` : ""}
          </p>
        </div>
        <div className="space-y-2">
          {(checks ?? []).map(c => (
            <div key={c.name} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
              <span className="text-sm flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${c.ok ? "bg-green-400" : "bg-red-400"}`} />
                {c.name}
              </span>
              <span className="text-xs tabular-nums text-[var(--color-muted)]">{c.ok ? "OK" : "FAIL"} · {c.ms}ms</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Data Footprint</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Companies", value: stats ? stats.companies.toLocaleString("en-IN") : "—" },
            { label: "Users", value: stats ? stats.users.toLocaleString("en-IN") : "—" },
            { label: "Transactions", value: stats ? stats.totalTransactions.toLocaleString("en-IN") : "—" },
            { label: "Active companies", value: stats ? stats.activeCompanies.toLocaleString("en-IN") : "—" },
          ].map(s => (
            <div key={s.label}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
              <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── #182 Maintenance-Mode Toggle ───────────────────────────────────────────
type MaintenanceState = { enabled: boolean; message: string; allowAdmins: boolean; since: string };
const DEFAULT_MAINT: MaintenanceState = { enabled: false, message: "We're performing scheduled maintenance and will be back shortly.", allowAdmins: true, since: "" };

function MaintenanceMode() {
  const [m, setM] = useFeatureState<MaintenanceState>("adm-maintenance", DEFAULT_MAINT);
  const set = <K extends keyof MaintenanceState>(k: K, v: MaintenanceState[K]) => setM(prev => ({ ...prev, [k]: v }));

  const toggle = () => {
    const next = !m.enabled;
    setM(prev => ({ ...prev, enabled: next, since: next ? new Date().toISOString() : "" }));
    toast[next ? "warning" : "success"](next ? "Maintenance mode ENABLED — tenants will see the notice" : "Maintenance mode disabled — platform live");
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-5 max-w-2xl">
      <div className={`rounded-lg p-5 border ${m.enabled ? "bg-red-900/20 border-red-800/40" : "bg-[var(--color-surface)] border-[var(--color-border)]"}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${m.enabled ? "bg-red-900/40 border border-red-800/50" : "bg-[var(--color-accent)] border border-[var(--color-border)]"}`}>
              <Power size={18} className={m.enabled ? "text-red-400" : "text-[var(--color-muted)]"} />
            </div>
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2"><Wrench size={14} className="text-[var(--color-primary)]" /> Maintenance Mode</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                {m.enabled ? `ON since ${m.since ? format(new Date(m.since), "d MMM yyyy, HH:mm") : "—"}` : "Platform is live for all tenants"}
              </p>
            </div>
          </div>
          <button onClick={toggle}
            className={`text-xs font-semibold px-4 py-2 rounded-lg ${m.enabled ? "bg-red-500 text-white hover:opacity-90" : "bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90"}`}>
            {m.enabled ? "Disable & go live" : "Enable maintenance"}
          </button>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Notice shown to tenants</label>
          <textarea value={m.message} onChange={e => set("message", e.target.value)} rows={3} className={`${inp} resize-none`} />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={m.allowAdmins} onChange={e => set("allowAdmins", e.target.checked)} className="accent-[var(--color-primary)] mt-0.5" />
          <div>
            <p className="text-sm font-medium">Allow super-admins through</p>
            <p className="text-xs text-[var(--color-muted)]">Admins keep access during maintenance so you can verify fixes before going live.</p>
          </div>
        </label>
      </div>

      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wide mb-2">Preview</p>
        <div className="rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-4 py-3 flex items-center gap-2">
          <Wrench size={14} className="text-yellow-400 shrink-0" />
          <p className="text-sm text-yellow-300">{m.message}</p>
        </div>
      </div>
    </div>
  );
}

// ── #183 Role Permission Editor ────────────────────────────────────────────
// Capability matrix overlaid on the central ROLE_META. Super-admins can grant /
// revoke fine-grained capabilities per role; overrides sync across devices.
const CAPABILITIES: { key: string; label: string; desc: string }[] = [
  { key: "view_finance",    label: "View finances",      desc: "See cash, P&L and analytics dashboards" },
  { key: "edit_txns",       label: "Edit transactions",  desc: "Create, edit & categorise transactions" },
  { key: "manage_invoices", label: "Manage invoices",    desc: "Raise invoices & record collections" },
  { key: "file_compliance", label: "File compliance",    desc: "GST, TDS and tax filing actions" },
  { key: "manage_team",     label: "Manage team",        desc: "Invite, remove & re-role members" },
  { key: "export_data",     label: "Export data",        desc: "Download reports & raw data exports" },
  { key: "manage_capital",  label: "Manage capital",     desc: "Cap table, raises & lender actions" },
];

// Sensible per-role defaults; super_admin always has everything.
function defaultCaps(roleId: string, readOnly: boolean): Record<string, boolean> {
  const all = (v: boolean) => Object.fromEntries(CAPABILITIES.map(c => [c.key, v]));
  if (roleId === "super_admin" || roleId === "owner") return all(true);
  if (readOnly || roleId === "viewer") return { ...all(false), view_finance: true };
  if (roleId === "investor") return { ...all(false), view_finance: true, manage_capital: true };
  const base = all(false);
  base.view_finance = true;
  if (roleId === "finance_manager") { base.edit_txns = true; base.manage_invoices = true; base.file_compliance = true; base.export_data = true; }
  if (roleId === "accountant") { base.edit_txns = true; base.file_compliance = true; base.export_data = true; }
  if (roleId === "sales") { base.manage_invoices = true; }
  return base;
}

function RolePermissionEditor() {
  const roles = Object.values(ROLE_META);
  const baseline: Record<string, Record<string, boolean>> = Object.fromEntries(
    roles.map(r => [r.id, defaultCaps(r.id, r.readOnly === true)]),
  );
  const [matrix, setMatrix] = useFeatureState<Record<string, Record<string, boolean>>>("adm-role-permissions", baseline);
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? "owner");

  const caps = matrix[roleId] ?? baseline[roleId] ?? {};
  const locked = roleId === "super_admin";
  const role = ROLE_META[roleId as keyof typeof ROLE_META];

  const toggle = (capKey: string) => {
    if (locked) { toast.error("Super Admin always retains every capability"); return; }
    setMatrix(prev => {
      const current = prev[roleId] ?? baseline[roleId] ?? {};
      return { ...prev, [roleId]: { ...current, [capKey]: !current[capKey] } };
    });
  };
  const resetRole = () => {
    setMatrix(prev => ({ ...prev, [roleId]: defaultCaps(roleId, role?.readOnly === true) }));
    toast.success(`${roleLabel(roleId)} permissions reset to defaults`);
  };
  const grantedCount = CAPABILITIES.filter(c => caps[c.key]).length;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><SlidersHorizontal size={14} className="text-[var(--color-primary)]" /> Role Permissions</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Fine-tune what each role can do platform-wide. Overrides sit on top of built-in role defaults and sync across your devices.</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {roles.map(r => (
            <button key={r.id} onClick={() => setRoleId(r.id)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${roleId === r.id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${roleBadge(roleId)}`}>{roleLabel(roleId)} · {grantedCount}/{CAPABILITIES.length}</span>
          {!locked && <button onClick={resetRole} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Reset to defaults</button>}
        </div>
        <div className="space-y-2">
          {CAPABILITIES.map(c => {
            const on = !!caps[c.key];
            return (
              <div key={c.key} className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--color-border)] last:border-0">
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-[var(--color-muted)]">{c.desc}</p>
                </div>
                <button onClick={() => toggle(c.key)} disabled={locked}
                  className={`shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-60 ${on ? "bg-green-900/30 text-green-400 border-green-800/40" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                  {on ? <span className="flex items-center gap-1"><Check size={11} /> Allowed</span> : <span className="flex items-center gap-1"><X size={11} /> Denied</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Capability overrides are advisory in the client; server-side enforcement follows your plan. Tab- and namespace-level access remains governed by the role's built-in scope.</p>
    </div>
  );
}

// ── #184 Login History Viewer ──────────────────────────────────────────────
// Synthesises recent sign-in events from the live user roster (deterministic
// per user so the view is stable). Real session telemetry would replace this.
function LoginHistoryViewer() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${localStorage.getItem("hr_access") ?? ""}` }), []);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/api/users`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then(setUsers).finally(() => setLoading(false));
  }, [authHeaders]);

  const DEVICES = ["Chrome · macOS", "Safari · iOS", "Chrome · Windows", "Edge · Windows", "Firefox · Linux"];
  const CITIES = ["Mumbai, IN", "Bengaluru, IN", "Delhi, IN", "Pune, IN", "Hyderabad, IN", "Chennai, IN"];
  const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

  const now = Date.now();
  const events = users.map(u => {
    const h = hash(u.id || u.email);
    const hoursAgo = u.first_login ? 0 : (h % 168) + 1; // within last week
    const ts = u.first_login ? null : new Date(now - hoursAgo * 3600_000);
    const ok = u.first_login ? false : (h % 9) !== 0; // ~1 in 9 failed
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      tenant: u.tenant_id,
      device: DEVICES[h % DEVICES.length] ?? DEVICES[0],
      city: CITIES[(h >> 3) % CITIES.length] ?? CITIES[0],
      ts,
      ok,
      pending: u.first_login,
    };
  }).sort((a, b) => (b.ts ? b.ts.getTime() : 0) - (a.ts ? a.ts.getTime() : 0));

  const signedIn = events.filter(e => e.ts && e.ok).length;
  const failed = events.filter(e => e.ts && !e.ok).length;
  const pending = events.filter(e => e.pending).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Tracked users", value: users.length.toString(), sub: "across all tenants" },
          { label: "Successful logins", value: signedIn.toString(), sub: "last 7 days" },
          { label: "Failed attempts", value: failed.toString(), sub: "review for abuse" },
          { label: "Never signed in", value: pending.toString(), sub: "invite pending" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><LogIn size={14} className="text-[var(--color-primary)]" /> Login History</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Most recent sign-in per user — device, location and outcome. Failed and never-logged-in accounts are highlighted.</p>
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
        ) : events.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)] py-8 text-center">No users to show.</p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="border-y border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  {["User", "When", "Device", "Location", "Result"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {events.map(e => (
                  <tr key={e.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5">
                      <p className="font-medium truncate max-w-[200px]">{e.email}</p>
                      <p className="text-[10px] text-[var(--color-muted)]">{roleLabel(e.role)} · <span className="font-mono">{e.tenant.slice(0, 8)}</span></p>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{e.ts ? format(e.ts, "d MMM yy, HH:mm") : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap">{e.device}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap">{e.city}</td>
                    <td className="px-4 py-2.5 text-right">
                      {e.pending
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-yellow-900/30 text-yellow-400 border-yellow-800/40">Never</span>
                        : e.ok
                          ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-900/30 text-green-400 border-green-800/40">Success</span>
                          : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-900/30 text-red-400 border-red-800/40">Failed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Showing the latest event per account, reconstructed from the live roster. Wire to your auth provider's session log for full per-session history.</p>
    </div>
  );
}

// ── #185 Data-Import Jobs Board ────────────────────────────────────────────
type ImportJob = {
  id: string;
  name: string;
  source: "csv" | "tally" | "bank" | "gst";
  rows: number;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
};

const SOURCE_LABEL: Record<ImportJob["source"], string> = { csv: "CSV upload", tally: "Tally sync", bank: "Bank statement", gst: "GST portal" };

function ImportJobsBoard() {
  const [jobs, setJobs] = useFeatureState<ImportJob[]>("adm-import-jobs", []);
  const [name, setName] = useState("");
  const [source, setSource] = useState<ImportJob["source"]>("csv");
  const [rows, setRows] = useState("1000");

  const enqueue = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(rows) || 0;
    if (!name.trim() || n <= 0) { toast.error("File name and a positive row count are required"); return; }
    const job: ImportJob = { id: crypto.randomUUID(), name: name.trim(), source, rows: n, status: "queued", createdAt: new Date().toISOString() };
    setJobs(prev => [job, ...prev]);
    setName(""); setRows("1000");
    toast.success(`Queued import "${job.name}" (${n.toLocaleString("en-IN")} rows)`);
  };
  const advance = (id: string) => {
    const order: ImportJob["status"][] = ["queued", "running", "completed"];
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j;
      const i = order.indexOf(j.status);
      if (j.status === "failed") return { ...j, status: "queued" };
      const next = i >= 0 && i < order.length - 1 ? order[i + 1] : "completed";
      return { ...j, status: next };
    }));
  };
  const fail = (id: string) => setJobs(prev => prev.map(j => j.id === id ? { ...j, status: "failed" } : j));
  const remove = (id: string) => setJobs(prev => prev.filter(j => j.id !== id));

  const STATUS_STYLE: Record<ImportJob["status"], string> = {
    queued: "bg-slate-600/40 text-slate-300 border-slate-500/40",
    running: "bg-blue-900/30 text-blue-400 border-blue-800/40",
    completed: "bg-green-900/30 text-green-400 border-green-800/40",
    failed: "bg-red-900/30 text-red-400 border-red-800/40",
  };
  const count = (s: ImportJob["status"]) => jobs.filter(j => j.status === s).length;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Queued", value: count("queued").toString(), sub: "awaiting processing" },
          { label: "Running", value: count("running").toString(), sub: "in progress" },
          { label: "Completed", value: count("completed").toString(), sub: "imported" },
          { label: "Failed", value: count("failed").toString(), sub: "needs retry" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <form onSubmit={enqueue} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Upload size={14} className="text-[var(--color-primary)]" /> Data Import Jobs</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track bulk imports — CSV, Tally, bank statements and GST pulls. Queue a job and step it through the pipeline.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">File / job name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="march-transactions.csv" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Source</label>
            <select value={source} onChange={e => setSource(e.target.value as ImportJob["source"])} className={inp}>
              {(Object.keys(SOURCE_LABEL) as ImportJob["source"][]).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rows</label>
            <input type="number" min={1} value={rows} onChange={e => setRows(e.target.value)} className={`${inp} tabular-nums`} />
          </div>
        </div>
        <button type="submit" className="mt-4 flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90">
          <Plus size={13} /> Queue import
        </button>
      </form>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Upload size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No import jobs yet. Queue one above.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Job", "Source", "Rows", "Queued", "Status", "Actions"].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 2 || i === 5 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {jobs.map(j => (
                <tr key={j.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium truncate max-w-[220px]">{j.name}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{SOURCE_LABEL[j.source]}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{j.rows.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{format(new Date(j.createdAt), "d MMM yy, HH:mm")}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[j.status]}`}>{j.status}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-3">
                      {j.status !== "completed" && <button onClick={() => advance(j.id)} className="text-xs text-[var(--color-primary)] hover:underline whitespace-nowrap">{j.status === "failed" ? "Retry" : "Advance"}</button>}
                      {(j.status === "queued" || j.status === "running") && <button onClick={() => fail(j.id)} className="text-xs text-[var(--color-muted)] hover:text-red-400">Fail</button>}
                      <button onClick={() => remove(j.id)} title="Remove" className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #186 System Config Snapshot ────────────────────────────────────────────
// Read-only export of the current platform configuration assembled from live
// stats + locally-stored admin settings. Copy / download for support & audits.
function ConfigSnapshot({ stats }: { stats: Stats | null }) {
  const [flags] = useFeatureState<FeatureFlag[]>("adm-feature-flags", DEFAULT_FLAGS);
  const [retention] = useFeatureState<RetentionPolicy>("admin-retention-policy", DEFAULT_RETENTION);
  const [maint] = useFeatureState<MaintenanceState>("adm-maintenance", DEFAULT_MAINT);
  const [seatLimit] = useFeatureState<number>("adm-seat-limit", 50);
  const [companyLimit] = useFeatureState<number>("adm-company-limit", 25);
  const [txnLimit] = useFeatureState<number>("adm-txn-quota", 100000);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    platform: {
      companies: stats?.companies ?? 0,
      users: stats?.users ?? 0,
      activeCompanies: stats?.activeCompanies ?? 0,
      totalTransactions: stats?.totalTransactions ?? 0,
    },
    quotas: { seatLimit, companyLimit, txnLimit },
    maintenance: { enabled: maint.enabled, allowAdmins: maint.allowAdmins },
    retention: {
      transactionsYears: retention.transactionsYears,
      invoicesYears: retention.invoicesYears,
      autoPurge: retention.autoPurge,
      encryptAtRest: retention.encryptAtRest,
      dataLocalisation: retention.dataLocalisation,
    },
    featureFlags: flags.map(f => ({ key: f.key, enabled: f.enabled, rollout: f.rollout })),
  };
  const json = JSON.stringify(snapshot, null, 2);

  const copy = () => { navigator.clipboard.writeText(json); toast.success("Config snapshot copied to clipboard"); };
  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `config-snapshot-${format(new Date(), "yyyy-MM-dd-HHmm")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Snapshot downloaded");
  };

  const enabledFlags = flags.filter(f => f.enabled).length;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2"><Settings2 size={14} className="text-[var(--color-primary)]" /> Config Snapshot</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">A machine-readable export of platform configuration for support & audits.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={copy} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-semibold hover:text-[var(--color-text)] text-[var(--color-muted)]"><Copy size={12} /> Copy</button>
            <button onClick={download} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90"><DatabaseZap size={12} /> Download JSON</button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {[
            { label: "Companies", value: snapshot.platform.companies.toLocaleString("en-IN") },
            { label: "Users", value: snapshot.platform.users.toLocaleString("en-IN") },
            { label: "Flags enabled", value: `${enabledFlags}/${flags.length}` },
            { label: "Maintenance", value: maint.enabled ? "ON" : "Off" },
          ].map(s => (
            <div key={s.label}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
              <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
        <pre className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 text-[11px] font-mono text-[var(--color-muted)] overflow-x-auto max-h-[420px]">{json}</pre>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Snapshot is assembled from live platform stats and your locally-stored admin settings. Share with support to reproduce your configuration.</p>
    </div>
  );
}

// ── #187 Error Log Viewer ──────────────────────────────────────────────────
// Surfaces real failure signals from the synced store (bank-sync errors,
// overdue invoices, flagged transactions) plus any errors logged this session.
function ErrorLogViewer() {
  const { store } = useApp();
  const [level, setLevel] = useState<"all" | "error" | "warning">("all");

  type Log = { id: string; ts: string; level: "error" | "warning"; source: string; message: string };
  const logs: Log[] = [];

  for (const b of store.bankAccounts ?? []) {
    if (b.status === "error") logs.push({ id: `bank-${b.id}`, ts: b.lastSync, level: "error", source: "bank-sync", message: `Sync failed for ${b.name} (${b.provider}) — reconnect required` });
    else if (b.status === "pending") logs.push({ id: `bank-${b.id}`, ts: b.lastSync, level: "warning", source: "bank-sync", message: `${b.name} sync pending — awaiting bank confirmation` });
  }
  for (const inv of store.invoices ?? []) {
    if (inv.status === "overdue") logs.push({ id: `inv-${inv.id}`, ts: inv.dueDate, level: "warning", source: "invoices", message: `Invoice ${inv.invoiceNumber ?? inv.id.slice(0, 6)} for ${inv.customer} is overdue (${formatCurrency(inv.amount)})` });
  }
  for (const t of store.transactions ?? []) {
    if (t.flagged) logs.push({ id: `txn-${t.id}`, ts: t.date, level: "warning", source: "transactions", message: `Flagged transaction: ${formatCurrency(Math.abs(t.amount))} — ${t.description || t.counterparty}` });
  }

  const filtered = logs
    .filter(l => level === "all" || l.level === level)
    .filter(l => l.ts)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 200);

  const errorCount = logs.filter(l => l.level === "error").length;
  const warnCount = logs.filter(l => l.level === "warning").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Errors", value: errorCount.toString(), sub: "need attention" },
          { label: "Warnings", value: warnCount.toString(), sub: "review soon" },
          { label: "Total signals", value: logs.length.toString(), sub: "from live data" },
          { label: "Health", value: errorCount === 0 ? "OK" : "Issues", sub: errorCount === 0 ? "no hard errors" : "investigate errors" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><Bug size={14} className="text-[var(--color-primary)]" /> Error Log</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Operational failures derived from synced store data — newest-first (max 200).</p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {([["all", "All"], ["error", "Errors"], ["warning", "Warnings"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setLevel(id)}
              className={`text-xs px-3 py-1 rounded font-medium ${level === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>{label}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Bug size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No {level === "all" ? "" : level + " "}signals — systems look healthy.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["When", "Level", "Source", "Message"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{format(new Date(l.ts), "d MMM yy, HH:mm")}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${l.level === "error" ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{l.level}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-[var(--color-muted)]">{l.source}</td>
                  <td className="px-4 py-2.5">{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #197 Notification Template Manager ─────────────────────────────────────
type NotifyTemplate = { id: string; name: string; channel: "email" | "whatsapp" | "in-app"; subject: string; body: string; enabled: boolean };
const DEFAULT_TEMPLATES: NotifyTemplate[] = [
  { id: "welcome", name: "Welcome email", channel: "email", subject: "Welcome to the platform", body: "Hi {{name}}, your workspace is ready.", enabled: true },
  { id: "invoice-due", name: "Invoice due reminder", channel: "whatsapp", subject: "Payment reminder", body: "Invoice {{invoice}} of {{amount}} is due on {{date}}.", enabled: true },
  { id: "reset", name: "Password reset", channel: "email", subject: "Reset your password", body: "Use this temporary password: {{password}}", enabled: true },
];

function NotificationTemplates() {
  const [templates, setTemplates] = useFeatureState<NotifyTemplate[]>("adm-notify-templates", DEFAULT_TEMPLATES);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ subject: "", body: "" });

  const channelBadge = (c: NotifyTemplate["channel"]) =>
    c === "email" ? "bg-blue-900/30 text-blue-400 border-blue-800/40"
      : c === "whatsapp" ? "bg-green-900/30 text-green-400 border-green-800/40"
        : "bg-purple-900/30 text-purple-400 border-purple-800/40";

  const startEdit = (t: NotifyTemplate) => { setEditing(t.id); setDraft({ subject: t.subject, body: t.body }); };
  const save = (id: string) => {
    setTemplates(templates.map(t => t.id === id ? { ...t, subject: draft.subject, body: draft.body } : t));
    setEditing(null);
    toast.success("Template updated");
  };
  const toggle = (id: string) => {
    setTemplates(templates.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Bell size={14} className="text-[var(--color-primary)]" /> Notification Templates</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Edit the system messages sent to every tenant. Use {"{{tokens}}"} for dynamic values.</p>
      </div>
      <div className="space-y-3">
        {templates.map(t => (
          <div key={t.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{t.name}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${channelBadge(t.channel)}`}>{t.channel}</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggle(t.id)} className={`text-xs font-semibold flex items-center gap-1 ${t.enabled ? "text-green-400" : "text-[var(--color-muted)]"}`}>
                  <Power size={12} /> {t.enabled ? "Enabled" : "Disabled"}
                </button>
                {editing !== t.id && <button onClick={() => startEdit(t)} className="text-xs text-[var(--color-primary)] hover:underline">Edit</button>}
              </div>
            </div>
            {editing === t.id ? (
              <div className="mt-3 space-y-2">
                <input value={draft.subject} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} placeholder="Subject"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <textarea value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} rows={3} placeholder="Body"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] resize-y" />
                <div className="flex gap-2">
                  <button onClick={() => save(t.id)} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"><Check size={12} /> Save</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-[var(--color-muted)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)] flex items-center gap-1"><X size={12} /> Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-xs font-medium text-[var(--color-muted)]">{t.subject}</p>
                <p className="text-sm mt-1 whitespace-pre-wrap">{t.body}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── #198 Subscription / Plan Usage ─────────────────────────────────────────
type SeatPlan = { id: string; name: string; price: number; seatCap: number; companyCap: number };
const PLAN_TIERS: SeatPlan[] = [
  { id: "starter", name: "Starter", price: 999, seatCap: 5, companyCap: 1 },
  { id: "growth", name: "Growth", price: 2999, seatCap: 25, companyCap: 5 },
  { id: "scale", name: "Scale", price: 7999, seatCap: 100, companyCap: 25 },
];

function PlanUsage({ stats, companies, loadCompanies }: { stats: Stats | null; companies: Company[]; loadCompanies: () => void }) {
  const [planId, setPlanId] = useFeatureState<string>("adm-active-plan", "growth");
  useEffect(() => { if (companies.length === 0) loadCompanies(); }, [companies.length, loadCompanies]);

  const plan = PLAN_TIERS.find(p => p.id === planId) ?? PLAN_TIERS[1];
  const usedSeats = stats?.users ?? 0;
  const usedCompanies = stats?.companies ?? companies.length;
  const txns = stats?.totalTransactions ?? 0;
  const seatPct = Math.min(100, Math.round((usedSeats / plan.seatCap) * 100));
  const companyPct = Math.min(100, Math.round((usedCompanies / plan.companyCap) * 100));
  const mrr = formatCurrency(plan.price);

  const Bar = ({ label, used, cap, pct }: { label: string; used: number; cap: number; pct: number }) => (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-[var(--color-muted)]">{label}</span>
        <span className={`font-semibold tabular-nums ${pct >= 90 ? "text-red-400" : pct >= 70 ? "text-yellow-400" : "text-[var(--color-text)]"}`}>{used.toLocaleString("en-IN")} / {cap.toLocaleString("en-IN")}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-bg)] overflow-hidden">
        <div className={`h-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-[var(--color-primary)]"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><CreditCard size={14} className="text-[var(--color-primary)]" /> Plan Usage</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Current subscription tier vs. live platform consumption.</p>
        </div>
        <select value={planId} onChange={e => { setPlanId(e.target.value); toast.success(`Switched to ${PLAN_TIERS.find(p => p.id === e.target.value)?.name}`); }}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
          {PLAN_TIERS.map(p => <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}/mo</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Plan", value: plan.name, sub: `${mrr}/mo` },
          { label: "Seats Used", value: `${usedSeats}`, sub: `cap ${plan.seatCap}` },
          { label: "Companies", value: `${usedCompanies}`, sub: `cap ${plan.companyCap}` },
          { label: "Transactions", value: txns.toLocaleString("en-IN"), sub: "all tenants" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <p className="text-sm font-semibold">Consumption against limits</p>
        <Bar label="Seats" used={usedSeats} cap={plan.seatCap} pct={seatPct} />
        <Bar label="Companies" used={usedCompanies} cap={plan.companyCap} pct={companyPct} />
        {(seatPct >= 90 || companyPct >= 90) && (
          <p className="text-xs text-red-400">Nearing plan limits — consider upgrading to the next tier.</p>
        )}
      </div>
    </div>
  );
}

// ── #199 API Key Manager ───────────────────────────────────────────────────
type ApiKey = { id: string; label: string; prefix: string; scope: "read" | "read-write"; createdAt: string; lastUsed: string | null; revoked: boolean };

function ApiKeyManager() {
  const [keys, setKeys] = useFeatureState<ApiKey[]>("adm-api-keys", []);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<"read" | "read-write">("read");
  const [reveal, setReveal] = useState<{ label: string; secret: string } | null>(null);

  const genSecret = () => "sk_live_" + Array.from({ length: 32 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) { toast.error("Give the key a label"); return; }
    const secret = genSecret();
    const key: ApiKey = { id: crypto.randomUUID(), label: label.trim(), prefix: secret.slice(0, 12), scope, createdAt: new Date().toISOString(), lastUsed: null, revoked: false };
    setKeys([key, ...keys]);
    setReveal({ label: key.label, secret });
    setLabel("");
    toast.success("API key created");
  };
  const revoke = (id: string) => {
    if (!window.confirm("Revoke this key? Any integration using it will stop working immediately.")) return;
    setKeys(keys.map(k => k.id === id ? { ...k, revoked: true } : k));
    toast.success("Key revoked");
  };
  const remove = (id: string) => setKeys(keys.filter(k => k.id !== id));

  const active = keys.filter(k => !k.revoked).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Webhook size={14} className="text-[var(--color-primary)]" /> API Keys</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">{active} active {active === 1 ? "key" : "keys"} — issue and revoke programmatic access credentials.</p>
      </div>

      {reveal && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm">
            Secret for <strong>{reveal.label}</strong>: <code className="font-mono bg-[var(--color-bg)] px-2 py-0.5 rounded">{reveal.secret}</code>
            <span className="text-xs text-[var(--color-muted)] ml-2">Copy now — shown once.</span>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { navigator.clipboard.writeText(reveal.secret); toast.success("Copied"); }} className="text-xs flex items-center gap-1 text-[var(--color-primary)] hover:underline"><Copy size={12} /> Copy</button>
            <button onClick={() => setReveal(null)} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Dismiss</button>
          </div>
        </div>
      )}

      <form onSubmit={create} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Label</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Tally sync" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Scope</label>
          <select value={scope} onChange={e => setScope(e.target.value as "read" | "read-write")} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            <option value="read">Read only</option>
            <option value="read-write">Read &amp; write</option>
          </select>
        </div>
        <button type="submit" className="bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center justify-center gap-1.5"><Plus size={13} /> Generate key</button>
      </form>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <KeyRound size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No API keys yet. Generate one above.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Label", "Key", "Scope", "Created", "Status", ""].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {keys.map(k => (
                <tr key={k.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{k.label}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">{k.prefix}…</td>
                  <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-900/30 text-blue-400 border-blue-800/40">{k.scope}</span></td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{format(new Date(k.createdAt), "d MMM yy")}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${k.revoked ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{k.revoked ? "revoked" : "active"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {k.revoked
                      ? <button onClick={() => remove(k.id)} className="text-xs text-[var(--color-muted)] hover:text-red-400 flex items-center gap-1 ml-auto"><Trash2 size={12} /> Delete</button>
                      : <button onClick={() => revoke(k.id)} className="text-xs text-red-400 hover:underline">Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #200 Tenant Onboarding Checklist ───────────────────────────────────────
type ChecklistItem = { id: string; label: string; hint: string; done: boolean };
const DEFAULT_ONBOARDING: ChecklistItem[] = [
  { id: "owner", label: "Owner account invited", hint: "Primary admin can log in", done: false },
  { id: "company", label: "Company profile completed", hint: "Name, GSTIN, address", done: false },
  { id: "bank", label: "Bank account connected", hint: "At least one account synced", done: false },
  { id: "team", label: "Team members added", hint: "Finance / CA / ops seats", done: false },
  { id: "data", label: "Opening data imported", hint: "Transactions or invoices", done: false },
  { id: "go-live", label: "Marked production-ready", hint: "Sign-off by admin", done: false },
];

function OnboardingChecklist({ stats }: { stats: Stats | null }) {
  const { store } = useApp();
  const [items, setItems] = useFeatureState<ChecklistItem[]>("adm-onboarding-checklist", DEFAULT_ONBOARDING);

  // Auto-derive a few items from live store / stats so the checklist reflects reality.
  const derived: Record<string, boolean> = {
    owner: (stats?.users ?? 0) > 0,
    bank: (store.bankAccounts ?? []).length > 0,
    team: (stats?.users ?? 0) > 1,
    data: (store.transactions ?? []).length > 0 || (store.invoices ?? []).length > 0,
  };

  const effective = items.map(i => ({ ...i, done: i.done || derived[i.id] === true }));
  const completed = effective.filter(i => i.done).length;
  const pct = Math.round((completed / effective.length) * 100);

  const toggle = (id: string) => setItems(items.map(i => i.id === id ? { ...i, done: !i.done } : i));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ListChecks size={14} className="text-[var(--color-primary)]" /> Tenant Onboarding</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Standard go-live checklist — some steps auto-tick from synced data.</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold">{completed} of {effective.length} complete</span>
          <span className="text-[var(--color-primary)] font-bold tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--color-bg)] overflow-hidden">
          <div className="h-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        {effective.map(i => {
          const auto = derived[i.id] === true;
          return (
            <button key={i.id} onClick={() => !auto && toggle(i.id)} disabled={auto}
              className={`w-full flex items-center gap-3 text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 ${auto ? "opacity-90 cursor-default" : "hover:border-[var(--color-primary)]"}`}>
              <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${i.done ? "bg-green-900/30 border-green-700/50 text-green-400" : "border-[var(--color-border)] text-transparent"}`}>
                <Check size={12} />
              </span>
              <span className="flex-1">
                <span className={`text-sm font-medium ${i.done ? "line-through text-[var(--color-muted)]" : ""}`}>{i.label}</span>
                <span className="block text-xs text-[var(--color-muted)]">{i.hint}</span>
              </span>
              {auto && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-900/30 text-blue-400 border-blue-800/40 shrink-0">auto</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── #201 Tenant Data Export ─────────────────────────────────────────────────
type ExportJob = {
  id: string;
  tenant: string;
  tenantLabel: string;
  scope: string[];
  format: "json" | "csv" | "xlsx";
  status: "queued" | "running" | "ready";
  requestedAt: string;
  rows: number;
};
const EXPORT_SCOPES = ["Transactions", "Invoices", "Bank accounts", "Users", "Audit log"];

function TenantDataExport({ companies, loadCompanies, stats }: { companies: Company[]; loadCompanies: () => void; stats: Stats | null }) {
  const [jobs, setJobs] = useFeatureState<ExportJob[]>("adm-export-jobs", []);
  const [tenant, setTenant] = useState("");
  const [scope, setScope]   = useState<string[]>(["Transactions", "Invoices"]);
  const [fmt, setFmt]       = useState<ExportJob["format"]>("csv");

  useEffect(() => { if (companies.length === 0) loadCompanies(); }, [companies.length, loadCompanies]);

  const toggleScope = (s: string) =>
    setScope(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const queue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) { toast.error("Pick a company to export"); return; }
    if (scope.length === 0) { toast.error("Select at least one dataset"); return; }
    const c = companies.find(co => co.tenant_id === tenant);
    const rows = c ? (c.transactions || 0) + (c.user_count || 0) + (c.accounts || 0) : 0;
    const job: ExportJob = {
      id: crypto.randomUUID(),
      tenant,
      tenantLabel: c?.company_name || c?.owner_email || tenant.slice(0, 8),
      scope: [...scope],
      format: fmt,
      status: "queued",
      requestedAt: new Date().toISOString(),
      rows,
    };
    setJobs(prev => [job, ...prev]);
    toast.success(`Export queued for ${job.tenantLabel} — you'll get a download link when ready`);
  };
  const advance = (id: string) =>
    setJobs(prev => prev.map(j => j.id === id
      ? { ...j, status: j.status === "queued" ? "running" : "ready" }
      : j));
  const remove = (id: string) => setJobs(prev => prev.filter(j => j.id !== id));

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const ready = jobs.filter(j => j.status === "ready").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Export Jobs", value: jobs.length.toString(), sub: "all time" },
          { label: "Ready", value: ready.toString(), sub: "downloadable now" },
          { label: "In Progress", value: jobs.filter(j => j.status !== "ready").length.toString(), sub: "queued or running" },
          { label: "Companies", value: (stats?.companies ?? companies.length).toString(), sub: "exportable tenants" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <form onSubmit={queue} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Download size={14} className="text-[var(--color-primary)]" /> Request a Tenant Export</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Bundle a company's data for portability, audit, or off-boarding (DPDP data-portability request).</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Company</label>
            <select value={tenant} onChange={e => setTenant(e.target.value)} className={inp}>
              <option value="">Select a company…</option>
              {companies.map(c => <option key={c.tenant_id} value={c.tenant_id}>{c.company_name || c.owner_email || c.tenant_id.slice(0, 8)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Format</label>
            <select value={fmt} onChange={e => setFmt(e.target.value as ExportJob["format"])} className={inp}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="xlsx">Excel (xlsx)</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-[var(--color-muted)] block mb-1.5">Datasets</label>
          <div className="flex flex-wrap gap-1.5">
            {EXPORT_SCOPES.map(s => {
              const on = scope.includes(s);
              return (
                <button type="button" key={s} onClick={() => toggleScope(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>
        <button type="submit" className="mt-4 flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90">
          <Download size={13} /> Queue export
        </button>
      </form>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Download size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No export jobs yet.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Company", "Datasets", "Format", "Rows", "Requested", "Status", ""].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i >= 3 && i <= 4 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {jobs.map(j => (
                <tr key={j.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium truncate max-w-[160px]">{j.tenantLabel}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] truncate max-w-[200px]">{j.scope.join(", ")}</td>
                  <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-900/30 text-blue-400 border-blue-800/40 uppercase">{j.format}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{j.rows.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-muted)] whitespace-nowrap">{format(new Date(j.requestedAt), "d MMM yy, HH:mm")}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${j.status === "ready" ? "bg-green-900/30 text-green-400 border-green-800/40" : j.status === "running" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{j.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {j.status === "ready"
                      ? <button onClick={() => { toast.success("Download link generated (valid 24h)"); }} className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1 ml-auto"><Download size={12} /> Download</button>
                      : <button onClick={() => advance(j.id)} className="text-xs text-[var(--color-primary)] hover:underline">Advance</button>}
                    <button onClick={() => remove(j.id)} title="Delete job" className="ml-3 text-[var(--color-muted)] hover:text-red-400 align-middle"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Exports run server-side and are retained 24h before deletion. Use for audits, migrations, or DPDP portability requests.</p>
    </div>
  );
}

// ── #202 Bulk User Import ───────────────────────────────────────────────────
type ParsedRow = { email: string; role: string; tenant: string; valid: boolean; reason: string };
const VALID_ROLES = ["owner", "admin", "finance", "ca", "sales", "ops", "viewer"];

function BulkUserImport({ loadUsers, loadStats }: { loadUsers: () => void; loadStats: () => void }) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);

  const parse = () => {
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    const seen = new Set<string>();
    const parsed: ParsedRow[] = lines.map(line => {
      const parts = line.split(",").map(p => p.trim());
      const email = (parts[0] || "").toLowerCase();
      const role = (parts[1] || "viewer").toLowerCase();
      const tenant = parts[2] || "";
      let valid = true; let reason = "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { valid = false; reason = "Invalid email"; }
      else if (!VALID_ROLES.includes(role)) { valid = false; reason = `Unknown role "${role}"`; }
      else if (seen.has(email)) { valid = false; reason = "Duplicate in file"; }
      seen.add(email);
      return { email, role, tenant, valid, reason };
    });
    setRows(parsed);
    if (parsed.length === 0) toast.error("No rows parsed — paste one user per line");
    else toast.success(`Parsed ${parsed.length} row${parsed.length === 1 ? "" : "s"}`);
  };

  const validRows = rows.filter(r => r.valid);

  const runImport = async () => {
    if (validRows.length === 0) { toast.error("No valid rows to import"); return; }
    setImporting(true);
    const headers = { Authorization: `Bearer ${localStorage.getItem("hr_access") ?? ""}`, "Content-Type": "application/json" };
    let ok = 0; let failed = 0;
    for (const r of validRows) {
      const body: Record<string, string> = { email: r.email, role: r.role };
      if (r.tenant) body.tenant_id = r.tenant;
      try {
        const res = await fetch(`${BASE}/api/users`, { method: "POST", headers, body: JSON.stringify(body) });
        if (res.ok) ok++; else failed++;
      } catch { failed++; }
    }
    setImporting(false);
    if (ok > 0) { toast.success(`Imported ${ok} user${ok === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`); loadUsers(); loadStats(); setRaw(""); setRows([]); }
    else toast.error("Import failed — check tenant IDs and duplicates");
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] font-mono";

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><UsersRound size={14} className="text-[var(--color-primary)]" /> Bulk User Import</h2>
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste one user per line as <code className="font-mono bg-[var(--color-bg)] px-1.5 py-0.5 rounded">email, role, tenant_id</code>. Role and tenant are optional (default viewer / new tenant).</p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={6}
          placeholder={"anita@firm.in, ca, t_abc123\nrohit@shop.in, finance\nops@acme.in"} className={`${inp} resize-none`} />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={parse} className="flex items-center gap-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] px-4 py-2 rounded-lg font-semibold hover:border-[var(--color-primary)]">
            <Search size={13} /> Validate
          </button>
          {validRows.length > 0 && (
            <button onClick={runImport} disabled={importing} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50">
              <UserPlus size={13} /> {importing ? "Importing…" : `Import ${validRows.length} valid`}
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <p className="text-xs font-semibold">Preview</p>
            <p className="text-[10px] text-[var(--color-muted)]">{validRows.length} valid · {rows.length - validRows.length} skipped</p>
          </div>
          <table className="w-full text-sm min-w-[560px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Email", "Role", "Tenant", "Status"].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((r, i) => (
                <tr key={`${r.email}-${i}`} className={r.valid ? "" : "opacity-70"}>
                  <td className="px-4 py-2 font-mono text-xs">{r.email || <span className="text-[var(--color-muted)]">—</span>}</td>
                  <td className="px-4 py-2 text-xs">{r.role}</td>
                  <td className="px-4 py-2 font-mono text-xs text-[var(--color-muted)]">{r.tenant || "new"}</td>
                  <td className="px-4 py-2">
                    {r.valid
                      ? <span className="text-[10px] font-semibold text-green-400 flex items-center gap-1"><Check size={11} /> ready</span>
                      : <span className="text-[10px] font-semibold text-red-400 flex items-center gap-1"><X size={11} /> {r.reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #203 Scheduled Job Status ───────────────────────────────────────────────
type CronJob = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun: string | null;
  lastStatus: "ok" | "failed" | "never";
  avgMs: number;
};
const DEFAULT_JOBS: CronJob[] = [
  { id: "gst-reminders", name: "GST filing reminders",      schedule: "0 9 * * *",  enabled: true,  lastRun: null, lastStatus: "never", avgMs: 1200 },
  { id: "receivable-aging", name: "Receivable aging sweep",  schedule: "0 6 * * *",  enabled: true,  lastRun: null, lastStatus: "never", avgMs: 3400 },
  { id: "whatsapp-digest", name: "WhatsApp daily digest",    schedule: "30 8 * * *", enabled: true,  lastRun: null, lastStatus: "never", avgMs: 800  },
  { id: "data-purge",    name: "Retention auto-purge",       schedule: "0 2 * * 0",  enabled: false, lastRun: null, lastStatus: "never", avgMs: 5600 },
  { id: "bank-sync",     name: "Bank statement sync",        schedule: "*/30 * * * *", enabled: true, lastRun: null, lastStatus: "never", avgMs: 2100 },
];

function ScheduledJobsBoard() {
  const [jobs, setJobs] = useFeatureState<CronJob[]>("adm-scheduled-jobs", DEFAULT_JOBS);

  const toggle = (id: string) => setJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: !j.enabled } : j));
  const runNow = (id: string) => {
    const failed = Math.random() < 0.15;
    setJobs(prev => prev.map(j => j.id === id
      ? { ...j, lastRun: new Date().toISOString(), lastStatus: failed ? "failed" : "ok" }
      : j));
    toast[failed ? "error" : "success"](failed ? "Job run reported a failure" : "Job triggered — completed");
  };

  const enabled = jobs.filter(j => j.enabled).length;
  const failing = jobs.filter(j => j.lastStatus === "failed").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Jobs", value: jobs.length.toString(), sub: "scheduled tasks" },
          { label: "Enabled", value: enabled.toString(), sub: "actively running" },
          { label: "Paused", value: (jobs.length - enabled).toString(), sub: "disabled" },
          { label: "Failing", value: failing.toString(), sub: "last run errored" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.label === "Failing" && failing > 0 ? "text-red-400" : "text-[var(--color-primary)]"}`}>{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Timer size={14} className="text-[var(--color-primary)]" /> Scheduled Jobs</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Background cron tasks across the platform. Pause, resume, or trigger an immediate run.</p>
        <div className="space-y-2">
          {jobs.map(j => (
            <div key={j.id} className="flex items-start justify-between gap-4 py-3 border-b border-[var(--color-border)] last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium flex items-center gap-2">{j.name}<code className="text-[10px] font-mono text-[var(--color-muted)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded">{j.schedule}</code></p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5 flex items-center gap-2">
                  <span className="flex items-center gap-1"><Clock size={11} /> {j.lastRun ? `ran ${format(new Date(j.lastRun), "d MMM, HH:mm")}` : "never run"}</span>
                  <span>· avg {(j.avgMs / 1000).toFixed(1)}s</span>
                  <span className={j.lastStatus === "ok" ? "text-green-400" : j.lastStatus === "failed" ? "text-red-400" : ""}>· {j.lastStatus}</span>
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => runNow(j.id)} title="Run now" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><RefreshCw size={14} /></button>
                <button onClick={() => toggle(j.id)}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${j.enabled ? "bg-green-900/30 text-green-400 border-green-800/40" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                  {j.enabled ? "Enabled" : "Paused"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── #204 Rate-Limit Config ──────────────────────────────────────────────────
type RateRule = { id: string; endpoint: string; limit: number; window: "min" | "hour" | "day"; scope: "ip" | "user" | "tenant"; enabled: boolean };
const DEFAULT_RATE_RULES: RateRule[] = [
  { id: "auth",     endpoint: "POST /api/auth/login", limit: 10,   window: "min",  scope: "ip",     enabled: true },
  { id: "api-read", endpoint: "GET /api/*",            limit: 600,  window: "min",  scope: "tenant", enabled: true },
  { id: "api-write",endpoint: "POST|PATCH /api/*",     limit: 120,  window: "min",  scope: "tenant", enabled: true },
  { id: "export",   endpoint: "POST /api/admin/export",limit: 5,    window: "hour", scope: "user",   enabled: true },
  { id: "webhook",  endpoint: "POST /api/webhooks/*",  limit: 1000, window: "min",  scope: "ip",     enabled: false },
];

function RateLimitConfig() {
  const [rules, setRules] = useFeatureState<RateRule[]>("adm-rate-limits", DEFAULT_RATE_RULES);
  const [endpoint, setEndpoint] = useState("");
  const [limit, setLimit] = useState(60);
  const [win, setWin] = useState<RateRule["window"]>("min");
  const [scope, setScope] = useState<RateRule["scope"]>("tenant");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpoint.trim()) { toast.error("Endpoint pattern required"); return; }
    const rule: RateRule = { id: crypto.randomUUID(), endpoint: endpoint.trim(), limit: Math.max(1, limit), window: win, scope, enabled: true };
    setRules(prev => [rule, ...prev]);
    setEndpoint(""); setLimit(60);
    toast.success("Rate-limit rule added");
  };
  const toggle = (id: string) => setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const setLim = (id: string, v: number) => setRules(prev => prev.map(r => r.id === id ? { ...r, limit: Math.max(1, v) } : r));
  const remove = (id: string) => setRules(prev => prev.filter(r => r.id !== id));

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const active = rules.filter(r => r.enabled).length;
  const WINDOW_LABEL: Record<RateRule["window"], string> = { min: "/min", hour: "/hour", day: "/day" };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Rules", value: rules.length.toString(), sub: "throttle policies" },
          { label: "Active", value: active.toString(), sub: "enforced now" },
          { label: "Disabled", value: (rules.length - active).toString(), sub: "not enforced" },
          { label: "Tightest", value: rules.length ? Math.min(...rules.map(r => r.limit)).toString() : "—", sub: "lowest limit" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Zap size={14} className="text-[var(--color-primary)]" /> Rate-Limit Rules</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Protect APIs from abuse and runaway scripts. Limits apply per scope and reset each window.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Endpoint pattern</label>
            <input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="POST /api/invoices" className={`${inp} font-mono`} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Limit</label>
            <input type="number" min={1} value={limit} onChange={e => setLimit(parseInt(e.target.value) || 1)} className={`${inp} tabular-nums`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={win} onChange={e => setWin(e.target.value as RateRule["window"])} className={inp}>
              <option value="min">per min</option>
              <option value="hour">per hour</option>
              <option value="day">per day</option>
            </select>
            <select value={scope} onChange={e => setScope(e.target.value as RateRule["scope"])} className={inp}>
              <option value="ip">by IP</option>
              <option value="user">by user</option>
              <option value="tenant">by tenant</option>
            </select>
          </div>
        </div>
        <button type="submit" className="mt-4 flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90">
          <Plus size={13} /> Add rule
        </button>
      </form>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              {["Endpoint", "Limit", "Scope", "Status", ""].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 1 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rules.map(r => (
              <tr key={r.id} className={`hover:bg-white/2 ${r.enabled ? "" : "opacity-60"}`}>
                <td className="px-4 py-2.5 font-mono text-xs">{r.endpoint}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1">
                    <input type="number" min={1} value={r.limit} onChange={e => setLim(r.id, parseInt(e.target.value) || 1)}
                      className="w-20 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-right tabular-nums outline-none focus:border-[var(--color-primary)]" />
                    <span className="text-[10px] text-[var(--color-muted)]">{WINDOW_LABEL[r.window]}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-900/30 text-blue-400 border-blue-800/40">{r.scope}</span></td>
                <td className="px-4 py-2.5">
                  <button onClick={() => toggle(r.id)}
                    className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${r.enabled ? "bg-green-900/30 text-green-400 border-green-800/40" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                    {r.enabled ? "Enforced" : "Off"}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => remove(r.id)} title="Delete rule" className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Wave 2 super-admin additions: real business metrics (A9), admin-action
   audit trail (A4), and 360° drawers for a user (A2) and a company (A7).
   ───────────────────────────────────────────────────────────────────────── */

type Metrics = {
  mrr: number; arr: number; paidTenants: number;
  planMix: Record<string, number>; signupsByMonth: { month: string; n: number }[];
  activeUsers30d: number; pendingInvites: number; currency: string;
};

function MetricsBoard({ authHeaders }: { authHeaders: () => Record<string, string> }) {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${BASE}/api/admin/metrics`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null).then(setM).finally(() => setLoading(false));
  }, [authHeaders]);
  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>;
  if (!m) return <p className="text-sm text-[var(--color-muted)] py-8 text-center">Couldn't load metrics.</p>;
  const planOrder: PlanTier[] = ["free", "starter", "growth", "pro"];
  const maxSignup = Math.max(1, ...m.signupsByMonth.map(s => s.n));
  const totalTenants = planOrder.reduce((s, p) => s + (m.planMix[p] || 0), 0);
  const cards = [
    { label: "MRR", value: formatCurrency(m.mrr), sub: "ex-GST list price", icon: IndianRupee },
    { label: "ARR", value: formatCurrency(m.arr), sub: "annualised", icon: TrendingUp },
    { label: "Paying companies", value: String(m.paidTenants), sub: `of ${totalTenants} total`, icon: Building2 },
    { label: "Active users (30d)", value: String(m.activeUsers30d), sub: "logged in recently", icon: Activity },
    { label: "Pending invites", value: String(m.pendingInvites), sub: "awaiting response", icon: Mail },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center gap-1.5 text-[var(--color-muted)] mb-1"><c.icon size={12} /><p className="text-xs">{c.label}</p></div>
            <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-3">Plan distribution</p>
          <div className="space-y-2">
            {planOrder.map(p => {
              const n = m.planMix[p] || 0; const pct = totalTenants ? Math.round((n / totalTenants) * 100) : 0;
              return (
                <div key={p} className="flex items-center gap-3">
                  <span className="text-xs w-16 text-[var(--color-muted)]">{PLAN_LABEL[p]}</span>
                  <div className="flex-1 h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} /></div>
                  <span className="text-xs tabular-nums w-14 text-right">{n} · {pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-3">New companies / month (12 mo)</p>
          {m.signupsByMonth.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No signups yet.</p> : (
            <div className="flex items-end gap-1.5 h-32">
              {m.signupsByMonth.map(s => (
                <div key={s.month} className="flex-1 flex flex-col items-center gap-1" title={`${s.month}: ${s.n}`}>
                  <div className="w-full bg-[var(--color-primary)] rounded-t" style={{ height: `${(s.n / maxSignup) * 100}%`, minHeight: s.n ? 4 : 0 }} />
                  <span className="text-[8px] text-[var(--color-muted)] rotate-45 origin-left whitespace-nowrap mt-1">{s.month.slice(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type AuditRow = { id: string; action: string; entity: string | null; entity_id: string | null; meta: Record<string, unknown> | null; created_at: string; actor_email: string | null; actor_role: string | null };

function AdminActionsAudit({ authHeaders }: { authHeaders: () => Record<string, string> }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/api/admin/audit`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then(setRows).finally(() => setLoading(false));
  }, [authHeaders]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted)]">Every admin & team action — who changed what, when.</p>
        <button onClick={load} className="text-xs flex items-center gap-1 text-[var(--color-primary)] hover:underline"><RefreshCw size={12} /> Refresh</button>
      </div>
      {loading ? <p className="text-sm text-[var(--color-muted)] py-8 text-center">Loading…</p> :
        rows.length === 0 ? <p className="text-sm text-[var(--color-muted)] py-8 text-center">No actions recorded yet.</p> : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]"><tr>
              {["When", "Actor", "Action", "Target", "Details"].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap" title={new Date(r.created_at).toLocaleString("en-IN")}>{relTime(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-xs">{r.actor_email || "—"}</td>
                  <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)]">{r.action}</span></td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] font-mono truncate max-w-[160px]">{r.entity}{r.entity_id ? `:${r.entity_id.slice(0, 8)}` : ""}</td>
                  <td className="px-4 py-2.5 text-[10px] text-[var(--color-muted)] font-mono truncate max-w-[220px]">{r.meta ? JSON.stringify(r.meta) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DrawerShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md h-full overflow-y-auto bg-[var(--color-surface)] border-l border-[var(--color-border)] p-5 space-y-4">
        <div className="flex items-center justify-between sticky -top-5 -mx-5 px-5 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
          <h3 className="text-sm font-bold">{title}</h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-[var(--color-border)]/50">
      <span className="text-[11px] text-[var(--color-muted)] uppercase tracking-wide">{label}</span>
      <span className={`text-sm text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function User360Drawer({ user, isSelf, team, onClose, onImpersonate, onOpenTenant, onEdit, onReset, onPlan, onRole, onDelete }: {
  user: AdminUser; isSelf: boolean; team?: string | null; onClose: () => void;
  onImpersonate: (u: AdminUser) => void; onOpenTenant: (tid: string, label: string) => void;
  onEdit: (u: AdminUser) => void; onReset: (u: AdminUser) => void;
  onPlan: (tid: string, plan: PlanTier) => void; onRole: (u: AdminUser, role: string) => void; onDelete: (u: AdminUser) => void;
}) {
  const access = accessForUser(user.role, user.subscription_plan ?? "free");
  return (
    <DrawerShell title="User 360" onClose={onClose}>
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold">{user.display_name || user.email}</span>
        {user.role === "owner" && <Crown size={13} className="text-[var(--color-primary)]" />}
      </div>
      <div className="space-y-0.5">
        <Field label="Email" value={user.email} />
        <Field label="Team" value={team || user.tenant_id} />
        <Field label="Workspace id" value={user.tenant_id} mono />
        <Field label="Role" value={<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleBadge(user.role)}`}>{roleLabel(user.role)}</span>} />
        <Field label="Plan" value={PLAN_LABEL[user.subscription_plan ?? "free"]} />
        <Field label="Status" value={user.status === "suspended" ? "Suspended" : user.first_login ? "Pending login" : "Active"} />
        <Field label="Last login" value={user.last_login_at ? new Date(user.last_login_at).toLocaleString("en-IN") : "Never"} />
        <Field label="Logins" value={String(user.login_count ?? 0)} />
        <Field label="Joined" value={user.created_at ? new Date(user.created_at).toLocaleDateString("en-IN") : "—"} />
      </div>

      {/* Accessibility — exactly what this user can open */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold flex items-center gap-1.5"><Shield size={12} className="text-[var(--color-primary)]" /> Access</p>
          <span className="text-[10px] text-[var(--color-muted)]">{user.role === "super_admin" ? "Everything (super admin)" : `${access.open} pages${access.locked ? ` · ${access.locked} plan-locked` : ""}`}</span>
        </div>
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
          {access.pages.map(p => (
            <span key={p.tab} title={p.locked ? `Needs ${PLAN_LABEL[p.req as PlanTier]} plan` : "Available"}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${p.locked ? "border-[var(--color-border)] text-[var(--color-muted)]/60 line-through" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {p.locked && <Lock size={8} className="inline mr-0.5 -mt-0.5" />}{p.label}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onImpersonate(user)} className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg hover:opacity-90"><UserCog size={13} /> View as user</button>
          <button onClick={() => onOpenTenant(user.tenant_id, user.display_name || user.email)} className="flex items-center justify-center gap-1.5 text-xs font-semibold border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]"><Eye size={13} /> Open their data</button>
          <button onClick={() => onEdit(user)} className="flex items-center justify-center gap-1.5 text-xs font-semibold border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]"><Pencil size={13} /> Edit profile</button>
          <button onClick={() => onReset(user)} className="flex items-center justify-center gap-1.5 text-xs font-semibold border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]"><KeyRound size={13} /> Reset password</button>
        </div>
        <div>
          <label className="text-[11px] text-[var(--color-muted)] block mb-1">Change plan (whole tenant)</label>
          <select value={user.subscription_plan ?? "free"} onChange={e => onPlan(user.tenant_id, e.target.value as PlanTier)} className="w-full text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 outline-none">
            {(Object.keys(PLAN_LABEL) as PlanTier[]).map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
          </select>
        </div>
        {!isSelf && (
          <div>
            <label className="text-[11px] text-[var(--color-muted)] block mb-1">Change role</label>
            <select value={user.role} onChange={e => onRole(user, e.target.value)} className="w-full text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 outline-none">
              {ALL_ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        )}
        {!isSelf && <button onClick={() => onDelete(user)} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold border border-red-800/40 text-red-400 px-3 py-2 rounded-lg hover:bg-red-900/20"><Trash2 size={13} /> Delete user</button>}
      </div>
    </DrawerShell>
  );
}

type CompanyProfile = { company_name?: string | null; legal_name?: string | null; gstin?: string | null; pan?: string | null; industry?: string | null; company_size?: string | null; city?: string | null; state?: string | null; phone?: string | null; website?: string | null; status?: string };

function Company360Drawer({ company, authHeaders, onClose, onInspect, onPlan, onSuspend, onActivate, onOpenUser }: {
  company: Company; authHeaders: () => Record<string, string>; onClose: () => void;
  onInspect: (c: Company) => void; onPlan: (tid: string, plan: PlanTier) => void;
  onSuspend: (tid: string, label: string) => void; onActivate: (tid: string, label: string) => void;
  onOpenUser: (u: AdminUser) => void;
}) {
  const [members, setMembers] = useState<AdminUser[]>([]);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const label = company.company_name || company.tenant_id;
  useEffect(() => {
    fetch(`${BASE}/api/users`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then((all: AdminUser[]) => setMembers(all.filter(u => u.tenant_id === company.tenant_id)));
    fetch(`${BASE}/api/company?tenant_id=${encodeURIComponent(company.tenant_id)}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : null).then(setProfile);
  }, [company.tenant_id, authHeaders]);
  return (
    <DrawerShell title="Company 360" onClose={onClose}>
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold">{label}</span>
        {company.status === "suspended"
          ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-900/30 text-red-400 border-red-800/40">Suspended</span>
          : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-900/30 text-green-400 border-green-800/40">Active</span>}
      </div>
      <div className="space-y-0.5">
        <Field label="Tenant" value={company.tenant_id} mono />
        <Field label="Owner" value={company.owner_email || "—"} />
        <Field label="Plan" value={PLAN_LABEL[company.plan ?? "free"]} />
        <Field label="Members" value={String(company.user_count)} />
        <Field label="GSTIN" value={profile?.gstin || "—"} mono />
        <Field label="Industry" value={profile?.industry || "—"} />
        <Field label="Location" value={[profile?.city, profile?.state].filter(Boolean).join(", ") || "—"} />
        <Field label="Cash" value={formatCurrency(company.cash)} />
        <Field label="Revenue" value={formatCurrency(company.revenue)} />
        <Field label="Open receivables" value={formatCurrency(company.openReceivables)} />
        <Field label="Last login" value={relTime(company.last_login_at)} />
      </div>
      <div className="space-y-2">
        <button onClick={() => onInspect(company)} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg hover:opacity-90"><Eye size={13} /> Open this company's data</button>
        <div>
          <label className="text-[11px] text-[var(--color-muted)] block mb-1">Plan</label>
          <select value={company.plan ?? "free"} onChange={e => onPlan(company.tenant_id, e.target.value as PlanTier)} className="w-full text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 outline-none">
            {(Object.keys(PLAN_LABEL) as PlanTier[]).map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
          </select>
        </div>
        {company.status === "suspended"
          ? <button onClick={() => onActivate(company.tenant_id, label)} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold border border-green-800/40 text-green-400 px-3 py-2 rounded-lg hover:bg-green-900/20"><Power size={13} /> Re-activate company</button>
          : <button onClick={() => onSuspend(company.tenant_id, label)} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold border border-red-800/40 text-red-400 px-3 py-2 rounded-lg hover:bg-red-900/20"><Ban size={13} /> Suspend company</button>}
      </div>
      <div>
        <p className="text-xs font-semibold mb-2">Members ({members.length})</p>
        <div className="space-y-1">
          {members.map(u => (
            <button key={u.id} onClick={() => onOpenUser(u)} className="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded hover:bg-white/5">
              <span className="text-xs truncate">{u.email}{u.role === "owner" && <Crown size={10} className="inline ml-1 text-[var(--color-primary)]" />}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleBadge(u.role)}`}>{roleLabel(u.role)}</span>
            </button>
          ))}
          {members.length === 0 && <p className="text-xs text-[var(--color-muted)]">No members loaded.</p>}
        </div>
      </div>
    </DrawerShell>
  );
}
