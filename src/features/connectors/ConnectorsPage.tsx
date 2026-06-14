import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { generateId, formatCurrency } from "@/lib/utils";
import { useFeatureState } from "@/hooks/useFeatureState";
import { api } from "@/lib/api";
import { CheckCircle2, Clock, AlertCircle, PlugZap, RefreshCw, Trash2, X, Banknote, GitCompareArrows, ShoppingCart, Activity, Link2, Upload, XCircle, ArrowDownUp } from "lucide-react";
import { toast } from "sonner";
import type { BankConnector, ConnectorProvider } from "@/data/types";
import PreviewBadge from "@/components/PreviewBadge";

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
  {
    id: "razorpay",
    name: "Razorpay",
    desc: "Sync all Razorpay settlements, payment links, and refunds as transactions automatically. Real-time webhooks.",
    tag: "Indian Payments",
    icon: "💙",
    setupFields: [
      { key: "accountName", label: "Razorpay account name", placeholder: "My Business" },
      { key: "webhookSecret", label: "Webhook secret key", placeholder: "whsec_…", type: "password" },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    desc: "Automatically import Stripe payouts, charges, and refunds. Ideal for SaaS and e-commerce revenue tracking.",
    tag: "Global Payments",
    icon: "💳",
    setupFields: [
      { key: "accountName", label: "Stripe account name", placeholder: "My Company" },
      { key: "webhookSecret", label: "Stripe webhook secret", placeholder: "whsec_…", type: "password" },
    ],
    webhookNote: undefined,
  },
  {
    id: "phonepe",
    name: "PhonePe Business",
    desc: "Pull PhonePe Business settlement data and reconcile UPI receipts automatically with your cash balance.",
    tag: "UPI Payments",
    icon: "📱",
    setupFields: [
      { key: "accountName", label: "Merchant ID", placeholder: "PGTESTPAYUAT" },
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
        <h1 className="text-xl font-bold flex items-center gap-2">Bank & Accounting Connectors <PreviewBadge capability="bankSync" /></h1>
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

      {/* #166–#169 — Connector tools */}
      {([["bank-upi-feed", "Bank / UPI Feed", Banknote], ["gateway-recon", "Gateway Recon", GitCompareArrows], ["ecom-sync", "E-commerce Sync", ShoppingCart], ["sync-monitor", "Sync Monitor", Activity]] as const).map(([id, label, Icon]) => (
        <a key={id} href={`#${id}`} className="sr-only">{label} <Icon size={10} /></a>
      ))}
      <BankUpiFeedConnector />
      <PaymentGatewayReconciliation />
      <EcommerceMarketplaceSync />
      <ConnectorHealthMonitor />
    </div>
  );
}

const FC_INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

// ── #166 Bank / UPI Feed Connector ──────────────────────────────────────────────
// AA-style consent connect flow + simulated last-sync state. No real bank link —
// honest in-UI disclaimer; consent/sync is simulated client-side only.
type FeedAccount = {
  id: string;
  fipName: string;       // bank / FIP
  vpa: string;           // UPI handle
  consentStatus: "active" | "pending" | "revoked";
  lastSync: string | null;
  txnPulled: number;
  connectedAt: string;
};

function BankUpiFeedConnector() {
  const [accounts, setAccounts] = useFeatureState<FeedAccount[]>("connector-bank-upi-feeds", []);
  const [fipName, setFipName] = useState("");
  const [vpa, setVpa] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const startConsent = () => {
    if (!fipName.trim()) { toast.error("Enter the bank / FIP name"); return; }
    const acct: FeedAccount = {
      id: generateId(),
      fipName: fipName.trim(),
      vpa: vpa.trim(),
      consentStatus: "pending",
      lastSync: null,
      txnPulled: 0,
      connectedAt: new Date().toISOString(),
    };
    setAccounts(prev => [acct, ...prev]);
    setFipName(""); setVpa("");
    toast.success("Consent request raised — approve in your bank's AA app to activate (simulated).");
  };

  const approveConsent = (id: string) => {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, consentStatus: "active" } : a));
    toast.success("Consent approved — feed is live.");
  };

  const syncNow = async (id: string) => {
    setBusy(id);
    await new Promise(r => setTimeout(r, 1200));
    const pulled = 8 + Math.floor(Math.random() * 40); // simulated batch size
    setAccounts(prev => prev.map(a => a.id === id
      ? { ...a, lastSync: new Date().toISOString(), txnPulled: a.txnPulled + pulled }
      : a));
    setBusy(null);
    toast.success(`Pulled ${pulled} transactions (simulated AA fetch).`);
  };

  const revoke = (id: string) => {
    if (!window.confirm("Revoke consent for this feed? Auto-pull will stop.")) return;
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, consentStatus: "revoked", lastSync: a.lastSync } : a));
    toast.success("Consent revoked.");
  };

  const remove = (id: string) => setAccounts(prev => prev.filter(a => a.id !== id));

  const active = accounts.filter(a => a.consentStatus === "active").length;
  const totalPulled = accounts.reduce((s, a) => s + a.txnPulled, 0);

  return (
    <section id="bank-upi-feed" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Banknote size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Bank / UPI Feed Connector</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">AA-based auto-pull · #166</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Raise an Account Aggregator consent to auto-pull bank statement &amp; UPI transactions. No credentials are stored —
        you approve each consent in your bank's AA app.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Bank / FIP name *</label>
          <input value={fipName} onChange={e => setFipName(e.target.value)} placeholder="HDFC Bank, ICICI…" className={FC_INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">UPI handle (optional)</label>
          <input value={vpa} onChange={e => setVpa(e.target.value)} placeholder="name@okhdfcbank" className={FC_INP} />
        </div>
        <div className="flex items-end">
          <button onClick={startConsent} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded-lg text-sm hover:opacity-90">
            <Link2 size={13} /> Start AA Consent
          </button>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active feeds", value: String(active) },
            { label: "Total feeds", value: String(accounts.length) },
            { label: "Txns pulled", value: String(totalPulled) },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{k.label}</p>
              <p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {accounts.length === 0 && (
          <p className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-border)] rounded-lg">No feeds yet — start a consent above.</p>
        )}
        {accounts.map(a => {
          const statusUi = a.consentStatus === "active"
            ? { color: "text-green-400", Icon: CheckCircle2, label: "Active" }
            : a.consentStatus === "pending"
            ? { color: "text-yellow-400", Icon: Clock, label: "Awaiting approval" }
            : { color: "text-[var(--color-muted)]", Icon: XCircle, label: "Revoked" };
          const SIcon = statusUi.Icon;
          return (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{a.fipName}</p>
                  <span className={`flex items-center gap-1 text-[10px] ${statusUi.color}`}><SIcon size={10} />{statusUi.label}</span>
                </div>
                <p className="text-[11px] text-[var(--color-muted)] truncate">
                  {a.vpa || "No UPI handle"}
                  {a.lastSync ? ` · Last sync ${new Date(a.lastSync).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · ${a.txnPulled} txns` : " · Never synced"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {a.consentStatus === "pending" && (
                  <button onClick={() => approveConsent(a.id)} className="text-[10px] text-green-400 border border-green-800/40 bg-green-950/20 px-2 py-1 rounded-lg hover:opacity-90">Approve</button>
                )}
                {a.consentStatus === "active" && (
                  <>
                    <button onClick={() => syncNow(a.id)} disabled={busy === a.id} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-accent)] transition-colors">
                      <RefreshCw size={13} className={busy === a.id ? "animate-spin" : ""} />
                    </button>
                    <button onClick={() => revoke(a.id)} className="text-[10px] text-[var(--color-muted)] border border-[var(--color-border)] px-2 py-1 rounded-lg hover:text-red-400">Revoke</button>
                  </>
                )}
                <button onClick={() => remove(a.id)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-red-950/20 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertCircle size={12} className="shrink-0 mt-px" />
        Demo: consent &amp; transaction pulls are simulated client-side. Live AA fetch requires a registered FIU integration.
      </div>
    </section>
  );
}

// ── #167 Payment-Gateway Reconciliation ──────────────────────────────────────────
// Match gateway settlements against your orders (Razorpay/PayU style). Inputs are
// pasted; matching is exact-then-amount tolerance. No live gateway call.
type ReconRow = { ref: string; amount: number };
function parseReconLines(raw: string): ReconRow[] {
  return raw.split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split(/[,\t]/).map(p => p.trim());
    const ref = parts[0] ?? "";
    const amount = parseFloat((parts[1] ?? "").replace(/[^0-9.-]/g, "")) || 0;
    return { ref, amount };
  }).filter(r => r.ref);
}

function PaymentGatewayReconciliation() {
  const [ordersRaw, setOrdersRaw] = useState("");
  const [settleRaw, setSettleRaw] = useState("");
  const [tolerance, setTolerance] = useState("1");

  const result = useMemo(() => {
    const orders = parseReconLines(ordersRaw);
    const settlements = parseReconLines(settleRaw);
    const tol = parseFloat(tolerance) || 0;
    const settleByRef = new Map(settlements.map(s => [s.ref.toLowerCase(), s]));
    const usedSettle = new Set<string>();

    const matched: { ref: string; orderAmt: number; settleAmt: number; diff: number }[] = [];
    const mismatched: { ref: string; orderAmt: number; settleAmt: number; diff: number }[] = [];
    const missingSettlement: ReconRow[] = [];

    for (const o of orders) {
      const s = settleByRef.get(o.ref.toLowerCase());
      if (!s) { missingSettlement.push(o); continue; }
      usedSettle.add(o.ref.toLowerCase());
      const diff = Math.round((o.amount - s.amount) * 100) / 100;
      const row = { ref: o.ref, orderAmt: o.amount, settleAmt: s.amount, diff };
      if (Math.abs(diff) <= tol) matched.push(row); else mismatched.push(row);
    }
    const orphanSettlements = settlements.filter(s => !usedSettle.has(s.ref.toLowerCase()));

    const orderTotal = orders.reduce((a, o) => a + o.amount, 0);
    const settleTotal = settlements.reduce((a, s) => a + s.amount, 0);
    return { orders, settlements, matched, mismatched, missingSettlement, orphanSettlements, orderTotal, settleTotal };
  }, [ordersRaw, settleRaw, tolerance]);

  const has = result.orders.length > 0 || result.settlements.length > 0;

  return (
    <section id="gateway-recon" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <GitCompareArrows size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Payment-Gateway Reconciliation</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">Razorpay / PayU settlement vs orders · #167</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Paste your <strong>orders</strong> and the gateway <strong>settlement report</strong> (one per line: <code>reference, amount</code>).
        Headroom matches by reference and flags amount mismatches and missing payouts.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Your orders ({result.orders.length})</label>
          <textarea value={ordersRaw} onChange={e => setOrdersRaw(e.target.value)} rows={6}
            placeholder={"order_001, 1200\norder_002, 4999\norder_003, 750"}
            className={`${FC_INP} font-mono text-xs resize-y`} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Gateway settlements ({result.settlements.length})</label>
          <textarea value={settleRaw} onChange={e => setSettleRaw(e.target.value)} rows={6}
            placeholder={"order_001, 1200\norder_002, 4979\norder_004, 300"}
            className={`${FC_INP} font-mono text-xs resize-y`} />
        </div>
      </div>
      <div className="max-w-[200px]">
        <label className="text-xs text-[var(--color-muted)] block mb-1">Amount tolerance (₹)</label>
        <input type="number" min={0} value={tolerance} onChange={e => setTolerance(e.target.value)} className={FC_INP} />
        <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Differences within this are treated as matched (covers gateway fees rounding).</p>
      </div>

      {has && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Matched", value: String(result.matched.length), color: "text-green-400" },
              { label: "Amount mismatch", value: String(result.mismatched.length), color: result.mismatched.length ? "text-orange-400" : "text-[var(--color-text)]" },
              { label: "Missing settlement", value: String(result.missingSettlement.length), color: result.missingSettlement.length ? "text-red-400" : "text-[var(--color-text)]" },
              { label: "Unmatched payouts", value: String(result.orphanSettlements.length), color: result.orphanSettlements.length ? "text-yellow-400" : "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
            <span className="text-[var(--color-muted)]">Order total <span className="font-semibold text-[var(--color-text)] tabular-nums">{formatCurrency(result.orderTotal)}</span></span>
            <ArrowDownUp size={12} className="text-[var(--color-muted)]" />
            <span className="text-[var(--color-muted)]">Settled total <span className="font-semibold text-[var(--color-text)] tabular-nums">{formatCurrency(result.settleTotal)}</span></span>
            <span className={`font-semibold tabular-nums ${result.orderTotal - result.settleTotal === 0 ? "text-green-400" : "text-orange-400"}`}>
              Gap {formatCurrency(result.orderTotal - result.settleTotal)}
            </span>
          </div>

          {(result.mismatched.length > 0 || result.missingSettlement.length > 0 || result.orphanSettlements.length > 0) && (
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {["Reference", "Order", "Settled", "Diff", "Issue"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {result.mismatched.map(r => (
                    <tr key={`m-${r.ref}`}>
                      <td className="px-3 py-2 text-xs font-mono">{r.ref}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{formatCurrency(r.orderAmt)}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{formatCurrency(r.settleAmt)}</td>
                      <td className="px-3 py-2 text-xs tabular-nums text-orange-400">{formatCurrency(r.diff)}</td>
                      <td className="px-3 py-2 text-[10px] text-orange-400">Amount mismatch</td>
                    </tr>
                  ))}
                  {result.missingSettlement.map(r => (
                    <tr key={`ms-${r.ref}`}>
                      <td className="px-3 py-2 text-xs font-mono">{r.ref}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-muted)]">—</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-muted)]">—</td>
                      <td className="px-3 py-2 text-[10px] text-red-400">Not settled yet</td>
                    </tr>
                  ))}
                  {result.orphanSettlements.map(r => (
                    <tr key={`o-${r.ref}`}>
                      <td className="px-3 py-2 text-xs font-mono">{r.ref}</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-muted)]">—</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-muted)]">—</td>
                      <td className="px-3 py-2 text-[10px] text-yellow-400">Payout with no order</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.mismatched.length === 0 && result.missingSettlement.length === 0 && result.orphanSettlements.length === 0 && (
            <p className="text-xs text-green-400 flex items-center gap-1.5"><CheckCircle2 size={13} /> Fully reconciled — every order matches a settlement within tolerance.</p>
          )}
        </>
      )}
    </section>
  );
}

// ── #168 E-commerce (Amazon / Flipkart) Sync ──────────────────────────────────────
// Import marketplace orders/settlements from a pasted CSV. Computes net payout
// after fees. Persisted as a durable import batch list. No live marketplace API.
type EcomOrder = { orderId: string; sku: string; qty: number; gross: number; fees: number; net: number };
type EcomBatch = { id: string; marketplace: string; importedAt: string; orders: EcomOrder[] };

function parseEcomCsv(raw: string): EcomOrder[] {
  const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  // Skip an optional header row if first cell isn't numeric in the gross column
  const looksLikeHeader = /order|sku|gross|amount|fee/i.test(lines[0]);
  const body = looksLikeHeader ? lines.slice(1) : lines;
  return body.map(l => {
    const c = l.split(/[,\t]/).map(p => p.trim());
    const gross = parseFloat((c[3] ?? "").replace(/[^0-9.-]/g, "")) || 0;
    const fees = parseFloat((c[4] ?? "").replace(/[^0-9.-]/g, "")) || 0;
    return {
      orderId: c[0] ?? "",
      sku: c[1] ?? "",
      qty: parseInt(c[2] ?? "1") || 1,
      gross,
      fees,
      net: Math.round((gross - fees) * 100) / 100,
    };
  }).filter(o => o.orderId);
}

function EcommerceMarketplaceSync() {
  const [batches, setBatches] = useFeatureState<EcomBatch[]>("connector-ecom-batches", []);
  const [marketplace, setMarketplace] = useState<"Amazon" | "Flipkart" | "Meesho">("Amazon");
  const [csv, setCsv] = useState("");

  const preview = useMemo(() => parseEcomCsv(csv), [csv]);
  const previewNet = preview.reduce((s, o) => s + o.net, 0);

  const importBatch = () => {
    if (preview.length === 0) { toast.error("No valid rows found — check the CSV format."); return; }
    const batch: EcomBatch = { id: generateId(), marketplace, importedAt: new Date().toISOString(), orders: preview };
    setBatches(prev => [batch, ...prev]);
    setCsv("");
    toast.success(`Imported ${preview.length} ${marketplace} orders — net payout ${formatCurrency(previewNet)}.`);
  };

  const removeBatch = (id: string) => setBatches(prev => prev.filter(b => b.id !== id));

  const allOrders = batches.flatMap(b => b.orders);
  const totalGross = allOrders.reduce((s, o) => s + o.gross, 0);
  const totalFees = allOrders.reduce((s, o) => s + o.fees, 0);
  const totalNet = allOrders.reduce((s, o) => s + o.net, 0);

  return (
    <section id="ecom-sync" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <ShoppingCart size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">E-commerce (Amazon / Flipkart) Sync</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">Marketplace orders/settlements · #168</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Export your settlement report from Seller Central / Flipkart and paste it as CSV:
        <code> order_id, sku, qty, gross, fees</code>. Headroom computes the net payout after marketplace fees.
      </p>

      <div className="flex gap-2">
        {(["Amazon", "Flipkart", "Meesho"] as const).map(m => (
          <button key={m} onClick={() => setMarketplace(m)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${marketplace === m ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {m}
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs text-[var(--color-muted)] block mb-1">{marketplace} settlement CSV ({preview.length} rows detected)</label>
        <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6}
          placeholder={"order_id, sku, qty, gross, fees\n403-1234567, TSHIRT-M, 2, 1198, 215\n403-7654321, MUG-01, 1, 349, 70"}
          className={`${FC_INP} font-mono text-xs resize-y`} />
        {preview.length > 0 && (
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            Preview net payout: <span className="font-semibold text-green-400 tabular-nums">{formatCurrency(previewNet)}</span> across {preview.length} orders.
          </p>
        )}
      </div>
      <button onClick={importBatch} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90">
        <Upload size={13} /> Import batch
      </button>

      {batches.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Gross sales", value: formatCurrency(totalGross), color: "text-[var(--color-text)]" },
              { label: "Marketplace fees", value: formatCurrency(totalFees), color: "text-orange-400" },
              { label: "Net payout", value: formatCurrency(totalNet), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {batches.map(b => (
              <div key={b.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold">{b.marketplace} · {b.orders.length} orders</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--color-muted)]">{new Date(b.importedAt).toLocaleDateString("en-IN")}</span>
                    <button onClick={() => removeBatch(b.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--color-muted)]">
                  Net payout <span className="font-semibold text-green-400 tabular-nums">{formatCurrency(b.orders.reduce((s, o) => s + o.net, 0))}</span>
                  {" · "}fees <span className="tabular-nums">{formatCurrency(b.orders.reduce((s, o) => s + o.fees, 0))}</span>
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertCircle size={12} className="shrink-0 mt-px" />
        Demo: CSV import only — no live Amazon SP-API / Flipkart connection. Net payout excludes TCS &amp; reserve holds.
      </div>
    </section>
  );
}

// ── #169 Connector Health & Sync Monitor ─────────────────────────────────────────
// Dashboard over the live connectors store: last-sync, simulated failures, retry.
type ConnectorIncident = { connectorId: string; failedAt: string; reason: string };

function ConnectorHealthMonitor() {
  const { store, updateConnector } = useApp();
  const { connectors } = store;
  const [incidents, setIncidents] = useFeatureState<ConnectorIncident[]>("connector-sync-incidents", []);
  const [retrying, setRetrying] = useState<string | null>(null);

  const STALE_MS = 24 * 60 * 60 * 1000; // 24h since last sync = stale
  const now = Date.now();

  const rows = connectors.map(c => {
    const lastMs = c.lastSync ? new Date(c.lastSync).getTime() : null;
    const stale = c.status === "connected" && (lastMs === null || now - lastMs > STALE_MS);
    const failure = incidents.find(i => i.connectorId === c.id);
    const health: "healthy" | "stale" | "error" | "pending" =
      c.status === "error" || failure ? "error" :
      c.status === "pending" ? "pending" :
      stale ? "stale" : "healthy";
    return { c, health, failure };
  });

  const counts = {
    healthy: rows.filter(r => r.health === "healthy").length,
    stale: rows.filter(r => r.health === "stale").length,
    error: rows.filter(r => r.health === "error").length,
    pending: rows.filter(r => r.health === "pending").length,
  };

  const simulateFailure = (connectorId: string) => {
    const reasons = ["AA consent expired", "Gateway webhook timeout", "Auth token revoked", "Rate limit exceeded"];
    const reason = reasons[Math.floor(Math.random() * reasons.length)];
    setIncidents(prev => [{ connectorId, failedAt: new Date().toISOString(), reason }, ...prev.filter(i => i.connectorId !== connectorId)]);
    const c = connectors.find(x => x.id === connectorId);
    if (c) updateConnector({ ...c, status: "error" });
    toast.error(`Sync failed: ${reason}`);
  };

  const retry = async (connectorId: string) => {
    setRetrying(connectorId);
    await new Promise(r => setTimeout(r, 1100));
    setIncidents(prev => prev.filter(i => i.connectorId !== connectorId));
    const c = connectors.find(x => x.id === connectorId);
    if (c) updateConnector({ ...c, status: "connected", lastSync: new Date().toISOString() });
    setRetrying(null);
    toast.success("Retry succeeded — connector back online.");
  };

  const HEALTH_UI: Record<string, { color: string; bg: string; label: string }> = {
    healthy: { color: "text-green-400", bg: "bg-green-950/20 border-green-800/30", label: "Healthy" },
    stale: { color: "text-yellow-400", bg: "bg-yellow-950/20 border-yellow-800/30", label: "Stale" },
    error: { color: "text-red-400", bg: "bg-red-950/20 border-red-800/30", label: "Failing" },
    pending: { color: "text-[var(--color-muted)]", bg: "", label: "Pending" },
  };

  return (
    <section id="sync-monitor" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Activity size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Connector Health &amp; Sync Monitor</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">Last-sync · failures · retry · #169</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Monitors every active connector. A connection is flagged <strong>stale</strong> after 24h with no sync. Simulate a
        failure to see how retry recovers it.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Healthy", value: counts.healthy, color: "text-green-400" },
          { label: "Stale", value: counts.stale, color: "text-yellow-400" },
          { label: "Failing", value: counts.error, color: "text-red-400" },
          { label: "Pending", value: counts.pending, color: "text-[var(--color-muted)]" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-border)] rounded-lg">No active connectors — connect one above to monitor it here.</p>
        )}
        {rows.map(({ c, health, failure }) => {
          const ui = HEALTH_UI[health];
          return (
            <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border ${ui.bg || "bg-[var(--color-bg)] border-[var(--color-border)]"}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{c.label}</p>
                  <span className={`text-[10px] font-medium ${ui.color}`}>{ui.label}</span>
                </div>
                <p className="text-[11px] text-[var(--color-muted)] truncate">
                  {c.lastSync ? `Last sync ${new Date(c.lastSync).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Never synced"}
                  {failure ? ` · ${failure.reason}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {health === "error" ? (
                  <button onClick={() => retry(c.id)} disabled={retrying === c.id}
                    className="flex items-center gap-1 text-[10px] text-[var(--color-primary)] border border-[var(--color-border)] px-2 py-1 rounded-lg hover:bg-[var(--color-accent)]">
                    <RefreshCw size={11} className={retrying === c.id ? "animate-spin" : ""} /> Retry
                  </button>
                ) : (
                  <button onClick={() => simulateFailure(c.id)}
                    className="text-[10px] text-[var(--color-muted)] border border-[var(--color-border)] px-2 py-1 rounded-lg hover:text-red-400">
                    Simulate failure
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertCircle size={12} className="shrink-0 mt-px" />
        Demo: failures &amp; retries are simulated. In production this surfaces real webhook errors and AA consent expiries.
      </div>
    </section>
  );
}
