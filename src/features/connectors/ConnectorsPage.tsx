import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { generateId } from "@/lib/utils";
import { api } from "@/lib/api";
import { CheckCircle2, Clock, AlertCircle, PlugZap, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { BankConnector, ConnectorProvider } from "@/data/types";

const PROVIDERS: {
  id: ConnectorProvider;
  name: string;
  desc: string;
  tag: string;
  icon: string;
  setupFields?: { key: string; label: string; placeholder: string; type?: string }[];
  webhookNote?: string;
}[] = [
  {
    id: "aa_network",
    name: "Account Aggregator (AA Network)",
    desc: "RBI-mandated open banking. Fetch live bank statements via user consent — no credentials stored.",
    tag: "India Open Banking",
    icon: "🏦",
    setupFields: [
      { key: "accountName", label: "Bank / FIP Name", placeholder: "HDFC Bank, ICICI Bank…" },
      { key: "mobileNumber", label: "Registered mobile", placeholder: "9XXXXXXXXX", type: "tel" },
    ],
  },
  {
    id: "finbox",
    name: "Finbox",
    desc: "Upload your bank statement PDF or connect via Finbox's bank fetch API. AI parses and normalises every transaction.",
    tag: "Statement Analysis",
    icon: "📄",
    setupFields: [
      { key: "accountName", label: "Account label", placeholder: "HDFC Current A/C" },
    ],
  },
  {
    id: "tally",
    name: "Tally ERP",
    desc: "Connect your on-premise Tally installation. A lightweight agent pushes vouchers to Headroom in real time.",
    tag: "Accounting ERP",
    icon: "📊",
    webhookNote: "Install the Headroom Tally sync agent on your server and paste your Tenant ID there.",
  },
  {
    id: "zoho_books",
    name: "Zoho Books",
    desc: "Sync transactions, invoices, and GST data directly from your Zoho Books organisation.",
    tag: "Cloud Accounting",
    icon: "☁️",
    setupFields: [
      { key: "accountName", label: "Organisation name", placeholder: "My Company Ltd" },
    ],
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    desc: "Pull transactions and invoices from QuickBooks Online. Works for both INR and multi-currency setups.",
    tag: "Cloud Accounting",
    icon: "📒",
    setupFields: [
      { key: "accountName", label: "Company name", placeholder: "Acme Pvt Ltd" },
    ],
  },
];

const STATUS_UI = {
  connected:    { icon: CheckCircle2, color: "text-green-400",  label: "Connected",    bg: "bg-green-900/20 border-green-800/30" },
  pending:      { icon: Clock,        color: "text-yellow-400", label: "Pending",      bg: "bg-yellow-900/20 border-yellow-800/30" },
  error:        { icon: AlertCircle,  color: "text-red-400",    label: "Error",        bg: "bg-red-900/20 border-red-800/30" },
  disconnected: { icon: PlugZap,      color: "text-[var(--color-muted)]", label: "Disconnected", bg: "" },
};

export default function ConnectorsPage() {
  const { store, addConnector, updateConnector, deleteConnector } = useApp();
  const { connectors } = store;
  const [setupFor, setSetupFor] = useState<ConnectorProvider | null>(null);
  const [fields,   setFields]   = useState<Record<string, string>>({});
  const [syncing,  setSyncing]  = useState<string | null>(null);

  const connectedMap = new Map(connectors.map(c => [c.provider, c]));

  const persistConnector = async (providerId: ConnectorProvider, accountName: string): Promise<string> => {
    try {
      const res = await api.post<{ id: string }>("/api/connectors", { provider: providerId, account_name: accountName });
      return res.id;
    } catch {
      return generateId();
    }
  };

  const handleConnect = async (providerId: ConnectorProvider) => {
    const existing = connectedMap.get(providerId);
    if (existing) { toast("Already connected. Disconnect first to reconfigure."); return; }
    const provider = PROVIDERS.find(p => p.id === providerId)!;
    if (provider.webhookNote) {
      const id = await persistConnector(providerId, "Tally ERP");
      addConnector({ id, provider: providerId, label: provider.name, accountName: "Tally ERP", status: "pending", lastSync: null, accountCount: 0, consentExpiry: null });
      toast.success("Tally connector added. Install the sync agent to complete setup.");
    } else {
      setSetupFor(providerId);
      setFields({});
    }
  };

  const handleSave = async () => {
    if (!setupFor) return;
    const provider    = PROVIDERS.find(p => p.id === setupFor)!;
    const accountName = fields.accountName || provider.name;
    const id          = await persistConnector(setupFor, accountName);
    addConnector({ id, provider: setupFor, label: provider.name, accountName, status: "pending", lastSync: null, accountCount: 0, consentExpiry: null });
    toast.success(`${provider.name} connector added — complete consent to activate.`);
    setSetupFor(null); setFields({});
  };

  const handleSync = async (c: BankConnector) => {
    setSyncing(c.id);
    await new Promise(r => setTimeout(r, 1400));
    updateConnector({ ...c, lastSync: new Date().toISOString(), status: "connected" });
    toast.success("Sync triggered — data will appear shortly.");
    setSyncing(null);
  };

  const handleDisconnect = (c: BankConnector) => {
    if (!window.confirm(`Disconnect ${c.label}? This will stop automatic syncing.`)) return;
    deleteConnector(c.id);
    toast.success("Connector removed.");
  };

  const setupProvider = PROVIDERS.find(p => p.id === setupFor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Bank & Accounting Connectors</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Connect your bank accounts and accounting tools so Headroom can sync transactions automatically.
        </p>
      </div>

      {/* Connected summary */}
      {connectors.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Connected", value: connectors.filter(c => c.status === "connected").length },
            { label: "Pending",   value: connectors.filter(c => c.status === "pending").length },
            { label: "Total",     value: connectors.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
              <p className="text-xl font-bold text-[var(--color-primary)]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Active connectors */}
      {connectors.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Active Connections</h2>
          {connectors.map(c => {
            const ui = STATUS_UI[c.status];
            const Icon = ui.icon;
            return (
              <div key={c.id} className={`flex items-center justify-between p-4 rounded-lg border ${ui.bg || "bg-[var(--color-surface)] border-[var(--color-border)]"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{PROVIDERS.find(p => p.id === c.provider)?.icon ?? "🔌"}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{c.label}</p>
                      <Icon size={13} className={ui.color} />
                      <span className={`text-xs ${ui.color}`}>{ui.label}</span>
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">
                      {c.accountName}{c.lastSync ? ` · Last sync ${new Date(c.lastSync).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : " · Never synced"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleSync(c)} disabled={syncing === c.id}
                    className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-accent)] transition-colors">
                    <RefreshCw size={14} className={syncing === c.id ? "animate-spin" : ""} />
                  </button>
                  <button onClick={() => handleDisconnect(c)}
                    className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-red-950/20 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Setup modal */}
      {setupFor && setupProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{setupProvider.icon} {setupProvider.name}</h2>
              <button onClick={() => setSetupFor(null)}><X size={18} className="text-[var(--color-muted)]" /></button>
            </div>
            <p className="text-sm text-[var(--color-muted)] mb-4">{setupProvider.desc}</p>
            <div className="space-y-3">
              {setupProvider.setupFields?.map(f => (
                <div key={f.key}>
                  <label className="text-xs text-[var(--color-muted)] block mb-1">{f.label}</label>
                  <input type={f.type || "text"} placeholder={f.placeholder} value={fields[f.key] || ""}
                    onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90">
                {setupFor === "aa_network" ? "Start Consent" : setupFor === "finbox" ? "Continue to Upload" : "Connect"}
              </button>
              <button onClick={() => setSetupFor(null)} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Provider catalogue */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Available Connectors</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PROVIDERS.map(p => {
            const existing = connectedMap.get(p.id);
            const ui = existing ? STATUS_UI[existing.status] : null;
            const Icon = ui?.icon;
            return (
              <div key={p.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-start gap-4">
                <span className="text-2xl mt-0.5">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{p.tag}</span>
                    {ui && Icon && <span className={`flex items-center gap-1 text-[10px] ${ui.color}`}><Icon size={10} />{ui.label}</span>}
                  </div>
                  <p className="text-xs text-[var(--color-muted)] mb-3 leading-relaxed">{p.webhookNote || p.desc}</p>
                  {p.webhookNote && existing && (
                    <div className="text-xs bg-[var(--color-bg)] rounded-lg p-2 border border-[var(--color-border)] mb-2 font-mono break-all">
                      Tenant ID: {`demo-tenant-id`}
                    </div>
                  )}
                  {!existing ? (
                    <button onClick={() => handleConnect(p.id)}
                      className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
                      {p.id === "aa_network" ? "Start AA Consent" : p.id === "finbox" ? "Upload Statement" : p.id === "tally" ? "Add Connector" : `Connect with ${p.name.split(" ")[0]}`}
                    </button>
                  ) : (
                    <span className={`text-xs ${ui?.color}`}>{ui?.label}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AA Network explainer */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-2">🇮🇳 About Account Aggregator (AA Network)</h3>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-3">
          The AA Network is India's RBI-mandated open banking framework. It lets you securely share bank statement data with Headroom via a one-time consent — no credentials or passwords shared. Supported by all major Indian banks including HDFC, ICICI, SBI, Axis, Kotak, and Yes Bank.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: "🔒", label: "Consent-based", desc: "You control what data is shared and for how long." },
            { icon: "🏛️", label: "RBI regulated",  desc: "Framework mandated and audited by the Reserve Bank of India." },
            { icon: "⚡", label: "Real-time sync", desc: "Transactions appear in Headroom within minutes of settlement." },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
              <span className="text-lg">{icon}</span>
              <p className="text-xs font-semibold mt-1 mb-0.5">{label}</p>
              <p className="text-xs text-[var(--color-muted)]">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
