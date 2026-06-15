import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth, BASE } from "@/context/AuthContext";
import { formatCurrency } from "@/lib/utils";
import { Navigate, useNavigate } from "react-router-dom";
import { Users, Building2, ShieldCheck, Eye, Trash2, KeyRound, UserPlus, Search, Crown, Copy, Briefcase, Activity, DatabaseZap, Plus, Mail, Shield, Clock, Flag, Megaphone, ScrollText, Gauge, HeartPulse, Wrench, Power } from "lucide-react";
import { toast } from "sonner";
import { ROLE_META, roleLabel, roleBadge } from "@/data/roles";
import { useFeatureState } from "@/hooks/useFeatureState";
import { format, differenceInCalendarDays } from "date-fns";

type Tab = "overview" | "companies" | "users" | "ca-workspace" | "usage" | "retention" | "flags" | "announce" | "audit-log" | "quotas" | "health" | "maintenance";

type AdminUser = { id: string; email: string; role: string; tenant_id: string; first_login: boolean; created_at: string };
type Company = {
  tenant_id: string; company_name: string | null; owner_email: string | null; user_count: number;
  created_at: string | null; last_activity: string | null;
  cash: number; revenue: number; expense: number; transactions: number; accounts: number; openReceivables: number;
};
type Stats = {
  companies: number; users: number; byRole: Record<string, number>;
  totalCash: number; totalRevenue: number; totalTransactions: number; totalReceivables: number; activeCompanies: number;
};

const ALL_ROLE_OPTIONS = Object.values(ROLE_META);

export default function AdminPage() {
  const { user } = useAuth();
  const { canAccess, setSelectedClient } = useApp();
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
    if (tab === "users") loadUsers();
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

  const TABS = [
    { id: "overview",     label: "Platform Overview", icon: ShieldCheck },
    { id: "companies",    label: "Companies",          icon: Building2 },
    { id: "users",        label: "Users",              icon: Users },
    { id: "ca-workspace", label: "CA Workspace",       icon: Briefcase },
    { id: "usage",        label: "Usage Analytics",    icon: Activity },
    { id: "retention",    label: "Data Retention",     icon: DatabaseZap },
    { id: "flags",        label: "Feature Flags",      icon: Flag },
    { id: "announce",     label: "Announcements",      icon: Megaphone },
    { id: "audit-log",    label: "Audit Log",          icon: ScrollText },
    { id: "quotas",       label: "Seats & Quotas",     icon: Gauge },
    { id: "health",       label: "System Health",      icon: HeartPulse },
    { id: "maintenance",  label: "Maintenance",        icon: Wrench },
  ] as const satisfies { id: Tab; label: string; icon: React.ElementType }[];
  const Spinner = () => <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const filteredUsers = users.filter(u =>
    !q || u.email.toLowerCase().includes(q.toLowerCase()) || u.tenant_id.toLowerCase().includes(q.toLowerCase()) || u.role.includes(q.toLowerCase()));
  const filteredCompanies = companies.filter(c =>
    !q || (c.company_name || "").toLowerCase().includes(q.toLowerCase()) || c.tenant_id.toLowerCase().includes(q.toLowerCase()) || (c.owner_email || "").toLowerCase().includes(q.toLowerCase()));

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

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setQ(""); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded font-medium whitespace-nowrap transition-colors ${tab === t.id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <t.icon size={13} /> {t.label}
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
            <table className="w-full text-sm min-w-[820px]">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  {["Company", "Owner", "Users", "Cash", "Revenue", "Receivables", "Txns", ""].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 || i === 1 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredCompanies.map(c => (
                  <tr key={c.tenant_id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{c.company_name || "—"}</p>
                      <p className="text-[10px] text-[var(--color-muted)] font-mono truncate max-w-[160px]">{c.tenant_id}</p>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] truncate max-w-[160px]">{c.owner_email || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.user_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(c.cash)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{formatCurrency(c.revenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-yellow-400">{formatCurrency(c.openReceivables)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{c.transactions}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => inspect(c)} className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline whitespace-nowrap">
                        <Eye size={12} /> Inspect
                      </button>
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
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  {["Email", "Role", "Tenant", "Status", "Actions"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredUsers.map(u => {
                  const isSelf = u.id === user?.id;
                  return (
                    <tr key={u.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5">{u.email}{isSelf && <span className="ml-2 text-[10px] text-[var(--color-muted)]">(you)</span>}</td>
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
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)] truncate max-w-[160px]">{u.tenant_id}</td>
                      <td className="px-4 py-2.5">{u.first_login ? <span className="text-yellow-400 text-xs">Pending login</span> : <span className="text-green-400 text-xs">Active</span>}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-3">
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

      {tab === "ca-workspace" && <CaWorkspace companies={companies} loadCompanies={loadCompanies} />}
      {tab === "usage" && <UsageAnalytics />}
      {tab === "retention" && <RetentionSettings />}
      {tab === "flags" && <FeatureFlagManager />}
      {tab === "announce" && <AnnouncementComposer />}
      {tab === "audit-log" && <AuditLogViewer />}
      {tab === "quotas" && <SeatQuotaTracker stats={stats} companies={companies} loadCompanies={loadCompanies} />}
      {tab === "health" && <SystemHealthBoard stats={stats} />}
      {tab === "maintenance" && <MaintenanceMode />}
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
