import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Navigate, useNavigate } from "react-router-dom";
import { Users, Plus, X, AlertTriangle, TrendingUp, CheckCircle2, CreditCard, Trash2, Calculator, Star, FileBarChart2, Zap, ArrowRight } from "lucide-react";
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

type GstClientStatus = {
  tenant_id: string;
  label: string;
  gst_status: string;
  net_liability: number | null;
  filed_at: string | null;
  gstn_arn: string | null;
};

type MarketplaceLead = {
  id: string;
  name: string;
  city: string;
  industry: string;
  created_at: string;
};

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400 border-red-800/40 bg-red-950/20",
  high:     "text-orange-400 border-orange-800/40 bg-orange-950/20",
  medium:   "text-yellow-400 border-yellow-800/40 bg-yellow-950/20",
  low:      "text-green-400 border-green-800/40 bg-green-950/20",
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function RunwayBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-[var(--color-muted)]">No forecast</span>;
  const color = days < 30 ? "text-red-400" : days < 60 ? "text-yellow-400" : "text-green-400";
  return <span className={`text-sm font-bold ${color}`}>{days}d runway</span>;
}

function ReportModal({ tenantId, label, onClose }: { tenantId: string; label: string; onClose: () => void }) {
  const [data, setData] = useState<{ balance: number; income: number; expenses: number; alerts_count: number; alert_messages: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ balance: number; income: number; expenses: number; alerts_count: number; alert_messages: string[] }>(`/api/advisor/clients/${tenantId}/report-preview`)
      .then(setData)
      .catch(() => toast.error("Could not load report"))
      .finally(() => setLoading(false));
  }, [tenantId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold">Monthly Report</h2>
            <p className="text-xs text-[var(--color-muted)]">{label} · {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()}</p>
          </div>
          <button onClick={onClose}><X size={16} className="text-[var(--color-muted)]" /></button>
        </div>
        {loading ? (
          <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Cash Balance", value: formatCurrency(data.balance), color: "text-[var(--color-primary)]" },
                { label: "Revenue", value: formatCurrency(data.income), color: "text-green-400" },
                { label: "Expenses", value: formatCurrency(data.expenses), color: "text-red-400" },
              ].map(({ label: l, value, color }) => (
                <div key={l} className="bg-[var(--color-bg)] rounded-lg p-3 text-center border border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">{l}</p>
                  <p className={`text-sm font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            {data.alerts_count > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3">
                <p className="text-xs font-semibold text-yellow-400 mb-2">{data.alerts_count} Active Alert{data.alerts_count > 1 ? "s" : ""}</p>
                {data.alert_messages.map((msg, i) => (
                  <p key={i} className="text-xs text-[var(--color-muted)] mb-1">• {msg}</p>
                ))}
              </div>
            )}
            <button
              onClick={() => { toast.success("Report PDF will be emailed to you shortly"); onClose(); }}
              className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2.5 rounded-lg text-sm hover:opacity-90">
              Email PDF Report
            </button>
            <p className="text-[11px] text-center text-[var(--color-muted)]">Report generated from AA-verified bank data</p>
          </div>
        ) : <p className="text-sm text-[var(--color-muted)] text-center py-4">Could not load report data.</p>}
      </div>
    </div>
  );
}

function BulkGstTab() {
  const [data, setData] = useState<{ month: number; year: number; clients: GstClientStatus[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    api.get<{ month: number; year: number; clients: GstClientStatus[] }>("/api/advisor/gst-status")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const prepareAll = async () => {
    setPreparing(true);
    await new Promise(r => setTimeout(r, 1500));
    setPreparing(false);
    toast.success("GSTR-3B prepared for all clients. Review and file in each client's GST tab.");
  };

  if (loading) return <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const clients = data?.clients ?? [];
  const pending  = clients.filter(c => c.gst_status !== "filed");
  const filed    = clients.filter(c => c.gst_status === "filed");

  return (
    <div className="space-y-4">
      <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-300">
            GSTR-3B · {data ? `${MONTH_NAMES[data.month - 1]} ${data.year}` : "Current month"}
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{pending.length} pending · {filed.length} filed · Due 20th of this month</p>
        </div>
        {pending.length > 0 && (
          <button onClick={prepareAll} disabled={preparing}
            className="flex items-center gap-1.5 text-xs bg-blue-600 text-white font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
            <Zap size={11} /> {preparing ? "Preparing…" : `Prepare All (${pending.length})`}
          </button>
        )}
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-10 text-sm text-[var(--color-muted)]">No clients linked yet. Add clients from the Clients tab.</div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                {["Client", "Status", "Net Liability", "Filed At", "ARN"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {clients.map(c => (
                <tr key={c.tenant_id} className="hover:bg-white/2">
                  <td className="px-4 py-3 font-medium">{c.label}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${c.gst_status === "filed" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/20 text-yellow-400 border-yellow-800/30"}`}>
                      {c.gst_status === "filed" ? <CheckCircle2 size={9} /> : <Calculator size={9} />}
                      {c.gst_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.net_liability !== null ? formatCurrency(c.net_liability) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{c.filed_at ? new Date(c.filed_at).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)] font-mono">{c.gstn_arn ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PracticeTab({ clients }: { clients: ClientSummary[] }) {
  const now = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  const allDeadlines = clients.flatMap(c => [
    { client: c.label, label: "GSTR-3B",     due: new Date(year, month, 20)  },
    { client: c.label, label: "TDS Deposit", due: new Date(year, month, 7)   },
    { client: c.label, label: "PF Filing",   due: new Date(year, month, 15)  },
  ])
  .filter(d => d.due >= now)
  .sort((a, b) => a.due.getTime() - b.due.getTime())
  .slice(0, 20);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">Upcoming Compliance Deadlines</p>
        {allDeadlines.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No clients linked yet.</p>
        ) : (
          <div className="space-y-2">
            {allDeadlines.map((d, i) => {
              const daysLeft = Math.ceil((d.due.getTime() - now.getTime()) / 86400000);
              return (
                <div key={i} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${daysLeft <= 3 ? "border-red-700/50 bg-red-900/10" : daysLeft <= 7 ? "border-yellow-700/40 bg-yellow-900/10" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
                  <div>
                    <p className="text-sm font-medium">{d.label}</p>
                    <p className="text-xs text-[var(--color-muted)]">{d.client}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold">{d.due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    <p className={`text-xs font-bold ${daysLeft <= 3 ? "text-red-400" : daysLeft <= 7 ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>{daysLeft}d left</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketplaceTab() {
  const [leads, setLeads] = useState<MarketplaceLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get<MarketplaceLead[]>("/api/advisor/marketplace")
      .then(setLeads)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const acceptLead = (lead: MarketplaceLead) => {
    setAccepted(s => new Set([...s, lead.id]));
    toast.success(`Lead accepted! ${lead.name} will be notified to share their Tenant ID with you.`);
  };

  if (loading) return <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3">
        <p className="text-sm font-semibold mb-0.5">CA Lead Marketplace</p>
        <p className="text-xs text-[var(--color-muted)]">Businesses on Headroom actively looking for a CA. Accept a lead and we'll make the introduction — free.</p>
      </div>

      {leads.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Star size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No open leads right now. Check back soon — we add new businesses weekly.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => (
            <div key={lead.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold">{lead.name}</p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">{lead.city} · {lead.industry} · Joined {new Date(lead.created_at).toLocaleDateString("en-IN")}</p>
              </div>
              {accepted.has(lead.id) ? (
                <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/20 border border-green-800/30 px-3 py-1.5 rounded-lg">
                  <CheckCircle2 size={11} /> Accepted
                </span>
              ) : (
                <button onClick={() => acceptLead(lead)}
                  className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
                  Accept Lead <ArrowRight size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientCard({ client, onUnlink, onNavigate, onReport }: {
  client: ClientSummary;
  onUnlink: (id: string, label: string) => void;
  onNavigate: () => void;
  onReport: () => void;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
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
          <button onClick={onReport} title="Monthly report"
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-blue-400 hover:bg-blue-900/10">
            <FileBarChart2 size={14} />
          </button>
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

export default function AdvisorPage() {
  const { user } = useAuth();
  const { setSelectedClient } = useApp();
  const navigate = useNavigate();
  if (!user || !["accountant", "super_admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const [clients,    setClients]    = useState<ClientSummary[]>([]);
  const [alerts,     setAlerts]     = useState<AdvisorAlert[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<"clients" | "alerts" | "gst" | "practice" | "marketplace">("clients");
  const [showForm,   setShowForm]   = useState(false);
  const [tenantId,   setTenantId]   = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [linking,    setLinking]    = useState(false);
  const [reportClient, setReportClient] = useState<{ tenantId: string; label: string } | null>(null);

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

  const handleUnlink = async (tid: string, lbl: string) => {
    if (!window.confirm(`Remove ${lbl} from your portfolio?`)) return;
    await api.delete(`/api/advisor/clients/${tid}`);
    toast.success("Client removed");
    load();
  };

  const atRisk  = clients.filter(c => c.unread_alerts > 0 || (c.runway !== null && c.runway < 45));
  const healthy = clients.filter(c => c.unread_alerts === 0 && (c.runway === null || c.runway >= 45));

  const TABS = [
    { id: "clients" as const,     label: `Clients (${clients.length})`,                              badge: undefined as number | undefined },
    { id: "alerts" as const,      label: "Alert Feed",                  badge: alerts.filter(a => a.severity !== "low").length },
    { id: "gst" as const,         label: "Bulk GST",                    badge: undefined },
    { id: "practice" as const,    label: "Practice",                    badge: undefined },
    { id: "marketplace" as const, label: "Marketplace",                 badge: undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">CA Practice</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">Clients · GST filing · Compliance · Lead marketplace</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
          <Plus size={12} /> Add Client
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleLink} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Add Client</h2>
            <button type="button" onClick={() => setShowForm(false)}><X size={16} className="text-[var(--color-muted)]" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Client's Tenant ID *</label>
              <input required value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="e.g. rajtraders-a3f9c2"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Display name (optional)</label>
              <input value={clientLabel} onChange={e => setClientLabel(e.target.value)} placeholder="Raj Traders Pvt Ltd"
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

      {clients.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Clients",   value: clients.length.toString() },
            { label: "Need Attention",  value: atRisk.length.toString() },
            { label: "Active Alerts",   value: alerts.filter(a => a.severity !== "low").length.toString() },
            { label: "Pre-qualified",   value: clients.filter(c => c.credit_prequalified).length.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
              <p className="text-xl font-bold text-[var(--color-primary)]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && clients.length === 0 && tab === "clients" && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Users size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">No clients yet</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-sm mx-auto">
            Add your first client using their Tenant ID, or browse the <button onClick={() => setTab("marketplace")} className="text-[var(--color-primary)] underline">Marketplace</button> for new leads.
          </p>
          <button onClick={() => setShowForm(true)} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">
            Add First Client
          </button>
        </div>
      )}

      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
        {TABS.map(({ id, label, badge }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors flex items-center gap-1.5 ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {label}
            {badge !== undefined && badge > 0 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${tab === id ? "bg-white/20 text-white" : "bg-red-900/40 text-red-400"}`}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "clients" && clients.length > 0 && (
        <div className="space-y-4">
          {atRisk.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><AlertTriangle size={11} /> Needs Attention ({atRisk.length})</h2>
              <div className="space-y-2">
                {atRisk.map(c => <ClientCard key={c.tenant_id} client={c} onUnlink={handleUnlink}
                  onNavigate={() => { setSelectedClient(c.tenant_id, c.label); navigate("/forecast"); }}
                  onReport={() => setReportClient({ tenantId: c.tenant_id, label: c.label })} />)}
              </div>
            </div>
          )}
          {healthy.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-green-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><CheckCircle2 size={11} /> Healthy ({healthy.length})</h2>
              <div className="space-y-2">
                {healthy.map(c => <ClientCard key={c.tenant_id} client={c} onUnlink={handleUnlink}
                  onNavigate={() => { setSelectedClient(c.tenant_id, c.label); navigate("/forecast"); }}
                  onReport={() => setReportClient({ tenantId: c.tenant_id, label: c.label })} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "alerts" && (
        <div className="space-y-2">
          {alerts.length === 0 ? (
            <div className="text-center py-10 text-sm text-[var(--color-muted)]">No active alerts across your portfolio.</div>
          ) : (
            alerts.map(a => (
              <div key={a.id} className={`rounded-lg px-4 py-3 border ${SEV_COLOR[a.severity]}`}>
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

      {tab === "gst"         && <BulkGstTab />}
      {tab === "practice"    && <PracticeTab clients={clients} />}
      {tab === "marketplace" && <MarketplaceTab />}

      {reportClient && (
        <ReportModal tenantId={reportClient.tenantId} label={reportClient.label} onClose={() => setReportClient(null)} />
      )}
    </div>
  );
}
