import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { Users, Plus, X, AlertTriangle, TrendingUp, CheckCircle2, CreditCard, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

type ClientSummary = {
  tenant_id: string;
  label: string;
  balance: number;
  runway: number | null;
  unread_alerts: number;
  top_alert: { severity: string; message: string } | null;
  last_forecast_at: string | null;
  credit_prequalified: boolean;
  credit_score: number | null;
};

type AdvisorAlert = {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  title: string;
  client_label: string;
  created_at: string;
};

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400 border-red-800/40 bg-red-950/20",
  high:     "text-orange-400 border-orange-800/40 bg-orange-950/20",
  medium:   "text-yellow-400 border-yellow-800/40 bg-yellow-950/20",
  low:      "text-green-400 border-green-800/40 bg-green-950/20",
};

function RunwayBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-[var(--color-muted)]">No forecast</span>;
  const color = days < 30 ? "text-red-400" : days < 60 ? "text-yellow-400" : "text-green-400";
  return <span className={`text-sm font-bold ${color}`}>{days}d runway</span>;
}

export default function AdvisorPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user || !["accountant", "super_admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const [clients,    setClients]    = useState<ClientSummary[]>([]);
  const [alerts,     setAlerts]     = useState<AdvisorAlert[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<"clients" | "alerts">("clients");
  const [showForm,   setShowForm]   = useState(false);
  const [tenantId,   setTenantId]   = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [linking,    setLinking]    = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cData, aData] = await Promise.allSettled([
        api.get<{ clients: ClientSummary[] }>("/api/advisor/clients"),
        api.get<AdvisorAlert[]>("/api/advisor/alerts"),
      ]);
      if (cData.status === "fulfilled") setClients(cData.value.clients ?? []);
      if (aData.status === "fulfilled") setAlerts(aData.value ?? []);
    } catch {
      toast.error("Could not load advisor data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId.trim()) return;
    setLinking(true);
    try {
      await api.post("/api/advisor/clients", { client_tenant_id: tenantId.trim(), client_label: clientLabel || undefined });
      toast.success("Client added to your portfolio");
      setShowForm(false); setTenantId(""); setClientLabel("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add client");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (tenantId: string, label: string) => {
    if (!window.confirm(`Remove ${label} from your portfolio?`)) return;
    await api.del(`/api/advisor/clients/${tenantId}`);
    toast.success("Client removed");
    load();
  };

  const atRisk  = clients.filter(c => c.unread_alerts > 0 || (c.runway !== null && c.runway < 45));
  const healthy = clients.filter(c => c.unread_alerts === 0 && (c.runway === null || c.runway >= 45));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Client Portfolio</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">Live cash view across all your clients</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
          <Plus size={12} /> Add Client
        </button>
      </div>

      {/* Add client form */}
      {showForm && (
        <form onSubmit={handleLink} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Add Client</h2>
            <button type="button" onClick={() => setShowForm(false)}><X size={16} className="text-[var(--color-muted)]" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Client's Tenant ID *</label>
              <input required value={tenantId} onChange={e => setTenantId(e.target.value)}
                placeholder="e.g. rajtraders-a3f9c2"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Display name (optional)</label>
              <input value={clientLabel} onChange={e => setClientLabel(e.target.value)}
                placeholder="Raj Traders Pvt Ltd"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted)] bg-[var(--color-accent)] rounded-lg p-2">
            Ask the business owner to share their Tenant ID from <strong className="text-[var(--color-text)]">Settings → Tenant ID</strong>.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={linking}
              className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40">
              <Users size={13} /> {linking ? "Linking…" : "Add to Portfolio"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-[var(--color-accent)]">Cancel</button>
          </div>
        </form>
      )}

      {/* Summary stats */}
      {clients.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Clients",   value: clients.length.toString() },
            { label: "Need Attention",  value: atRisk.length.toString() },
            { label: "Active Alerts",   value: alerts.filter(a => a.severity !== "low").length.toString() },
            { label: "Pre-qualified",   value: clients.filter(c => c.credit_prequalified).length.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
              <p className="text-xl font-bold text-[var(--color-primary)]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && clients.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-2xl p-10 text-center">
          <Users size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">No clients yet</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-sm mx-auto">
            Add your first client using their Tenant ID from Settings. You'll get live cash view, runway alerts, and credit signals for every client.
          </p>
          <button onClick={() => setShowForm(true)} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-xl text-sm hover:opacity-90">
            Add First Client
          </button>
        </div>
      )}

      {/* Tabs */}
      {clients.length > 0 && (
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
          {([["clients", "Clients"], ["alerts", "Alert Feed"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {label}{id === "alerts" && alerts.filter(a => a.severity !== "low").length > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {alerts.filter(a => a.severity !== "low").length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Clients tab */}
      {tab === "clients" && clients.length > 0 && (
        <div className="space-y-4">
          {atRisk.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><AlertTriangle size={11} /> Needs Attention ({atRisk.length})</h2>
              <div className="space-y-2">
                {atRisk.map(c => <ClientCard key={c.tenant_id} client={c} onUnlink={handleUnlink} onNavigate={() => navigate("/forecast")} />)}
              </div>
            </div>
          )}
          {healthy.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-green-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><CheckCircle2 size={11} /> Healthy ({healthy.length})</h2>
              <div className="space-y-2">
                {healthy.map(c => <ClientCard key={c.tenant_id} client={c} onUnlink={handleUnlink} onNavigate={() => navigate("/forecast")} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alert feed tab */}
      {tab === "alerts" && (
        <div className="space-y-2">
          {alerts.length === 0 ? (
            <div className="text-center py-10 text-sm text-[var(--color-muted)]">No active alerts across your portfolio.</div>
          ) : (
            alerts.map(a => (
              <div key={a.id} className={`rounded-xl px-4 py-3 border ${SEV_COLOR[a.severity]}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider">{a.severity} · {a.client_label}</span>
                  <span className="text-[10px] text-[var(--color-muted)]">{new Date(a.created_at).toLocaleDateString("en-IN")}</span>
                </div>
                <p className="text-sm">{a.message}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ClientCard({ client, onUnlink, onNavigate }: {
  client: ClientSummary;
  onUnlink: (id: string, label: string) => void;
  onNavigate: () => void;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-semibold">{client.label}</p>
            {client.credit_prequalified && (
              <span className="flex items-center gap-0.5 text-[10px] bg-green-900/30 text-green-400 border border-green-800/30 px-1.5 py-0.5 rounded-full">
                <CreditCard size={9} /> Pre-qualified
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-[var(--color-muted)]">Balance</p>
              <p className="text-base font-bold text-[var(--color-primary)]">{formatCurrency(client.balance)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Runway</p>
              <RunwayBadge days={client.runway} />
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Alerts</p>
              <p className={`text-sm font-bold ${client.unread_alerts > 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{client.unread_alerts}</p>
            </div>
            {client.credit_score && (
              <div>
                <p className="text-xs text-[var(--color-muted)]">UW Score</p>
                <p className={`text-sm font-bold ${client.credit_score >= 70 ? "text-green-400" : client.credit_score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{client.credit_score}/100</p>
              </div>
            )}
          </div>
          {client.top_alert && (
            <div className={`mt-2 text-xs rounded-lg px-2 py-1.5 border ${SEV_COLOR[client.top_alert.severity]}`}>
              {client.top_alert.message}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 ml-3">
          <button onClick={onNavigate} title="View forecast"
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-accent)]">
            <TrendingUp size={14} />
          </button>
          <button onClick={() => onUnlink(client.tenant_id, client.label)}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-red-950/20">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
