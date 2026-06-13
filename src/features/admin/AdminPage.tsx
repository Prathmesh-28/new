import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth, BASE } from "@/context/AuthContext";
import { formatCurrency } from "@/lib/utils";
import { Navigate, useNavigate } from "react-router-dom";
import { Users, Building2, ShieldCheck, Eye, Trash2, KeyRound, UserPlus, Search, Crown, Copy } from "lucide-react";
import { toast } from "sonner";
import { ROLE_META, roleLabel, roleBadge } from "@/data/roles";

type Tab = "overview" | "companies" | "users";

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
    toast.success(`Inspecting ${c.company_name || c.tenant_id} — read-only`);
    navigate("/dashboard");
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview",  label: "Platform Overview", icon: ShieldCheck },
    { id: "companies", label: "Companies",          icon: Building2 },
    { id: "users",     label: "Users",              icon: Users },
  ];
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
      {tab !== "overview" && (
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
    </div>
  );
}
