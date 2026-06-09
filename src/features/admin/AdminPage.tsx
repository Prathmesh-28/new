import { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth, BASE } from "@/context/AuthContext";
import { formatCurrency } from "@/lib/utils";
import { Navigate } from "react-router-dom";
import { AlertTriangle, ArrowLeftRight, Users, Building2 } from "lucide-react";

type Tab = "overview" | "users" | "tenants" | "transactions" | "alerts";

type AdminUser = {
  id: string; email: string; role: string; tenant_id: string; first_login: boolean; created_at: string;
};
type TenantRow = {
  tenant_id: string; user_count: number; owner_email: string | null;
};

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-purple-900/30 text-purple-400 border-purple-800/30",
  owner:       "bg-[var(--color-primary)]/20 text-[var(--color-primary)] border-[var(--color-primary)]/30",
  accountant:  "bg-blue-900/30 text-blue-400 border-blue-800/30",
  investor:    "bg-green-900/30 text-green-400 border-green-800/30",
};

export default function AdminPage() {
  const { user } = useAuth();
  const { store, canAccess, deleteAlert, deleteTransaction } = useApp();
  const [tab,      setTab]      = useState<Tab>("overview");
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [tenants,  setTenants]  = useState<TenantRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  if (!canAccess("admin")) return <Navigate to="/" replace />;

  const { bankAccounts, transactions, alerts, creditApplications, capitalRaises } = store;
  const totalBalance  = bankAccounts.reduce((a, b) => a + b.balance, 0);
  const totalRevenue  = transactions.filter(t => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const totalExpenses = Math.abs(transactions.filter(t => t.amount < 0).reduce((a, t) => a + t.amount, 0));

  const token = () => localStorage.getItem("hr_access") ?? "";

  useEffect(() => {
    if (tab === "users" && allUsers.length === 0) {
      setLoading(true);
      fetch(`${BASE}/api/users`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.ok ? r.json() : [])
        .then(setAllUsers)
        .finally(() => setLoading(false));
    }
    if (tab === "tenants" && tenants.length === 0) {
      setLoading(true);
      fetch(`${BASE}/api/admin/tenants`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.ok ? r.json() : [])
        .then(setTenants)
        .finally(() => setLoading(false));
    }
  }, [tab]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview",     label: "Overview"     },
    { id: "users",        label: "Users"        },
    { id: "tenants",      label: "Tenants"      },
    { id: "transactions", label: "Transactions" },
    { id: "alerts",       label: "Alerts"       },
  ];

  const Spinner = () => (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Admin Panel</h1>
        <span className="text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded-full">
          {user?.role}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm rounded font-medium whitespace-nowrap transition-colors ${tab === t.id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Balance",  value: formatCurrency(totalBalance) },
            { label: "Total Revenue",  value: formatCurrency(totalRevenue) },
            { label: "Total Expenses", value: formatCurrency(totalExpenses) },
            { label: "Transactions",   value: transactions.length.toString() },
            { label: "Unread Alerts",  value: alerts.filter(a => !a.isRead).length.toString() },
            { label: "Credit Apps",    value: creditApplications.length.toString() },
            { label: "Capital Raises", value: capitalRaises.length.toString() },
            { label: "Bank Accounts",  value: bankAccounts.length.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
              <p className="text-lg font-bold text-[var(--color-primary)]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Users */}
      {tab === "users" && (
        loading ? <Spinner /> :
        allUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No users found.</p>
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Email", "Role", "Tenant ID", "First Login", "Joined"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allUsers.map(u => (
                  <tr key={u.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)] transition-colors">
                    <td className="px-4 py-2.5">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ROLE_BADGE[u.role] ?? "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                        {u.role.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)] truncate max-w-[180px]">{u.tenant_id}</td>
                    <td className="px-4 py-2.5">{u.first_login ? <span className="text-yellow-400 text-xs">Pending</span> : <span className="text-green-400 text-xs">Done</span>}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{u.created_at ? new Date(u.created_at).toLocaleDateString("en-IN") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Tenants */}
      {tab === "tenants" && (
        loading ? <Spinner /> :
        tenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No tenants data — endpoint may not be configured yet.</p>
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Tenant ID", "Users", "Owner Email"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.tenant_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-mono text-xs">{t.tenant_id}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{t.user_count}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{t.owner_email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Transactions */}
      {tab === "transactions" && (
        transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ArrowLeftRight size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No transactions yet.</p>
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Date","Description","Category","Counterparty","Amount",""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{t.date}</td>
                    <td className="px-4 py-2.5 max-w-[200px] truncate">{t.description}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{t.category}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{t.counterparty}</td>
                    <td className={`px-4 py-2.5 font-medium ${t.amount > 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.amount > 0 ? "+" : ""}{formatCurrency(t.amount)}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => deleteTransaction(t.id)} className="text-xs text-[var(--color-muted)] hover:text-red-400">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Alerts */}
      {tab === "alerts" && (
        alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle size={28} className="mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No alerts.</p>
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Severity","Title","Message","Read",""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold uppercase ${a.severity === "critical" ? "text-red-400" : a.severity === "high" ? "text-orange-400" : a.severity === "medium" ? "text-yellow-400" : "text-green-400"}`}>
                        {a.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium max-w-[160px] truncate">{a.title}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[300px] truncate">{a.message}</td>
                    <td className="px-4 py-2.5">{a.isRead ? "✓" : "—"}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => deleteAlert(a.id)} className="text-xs text-[var(--color-muted)] hover:text-red-400">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
