import { useState, useMemo, type ReactNode } from "react";
import { useApp } from "@/context/AppContext";
import { generateId, formatCurrency } from "@/lib/utils";
import { useFeatureState } from "@/hooks/useFeatureState";
import { api } from "@/lib/api";
import { CheckCircle2, Clock, AlertCircle, PlugZap, RefreshCw, Trash2, X, Banknote, GitCompareArrows, ShoppingCart, Activity, Link2, Upload, XCircle, ArrowDownUp, Store, CalendarClock, Workflow, KeyRound, Webhook, History, Eye, EyeOff, Copy, Send, Plus, Server, FileCheck2, Calculator, ShieldCheck, FlaskConical, CreditCard, Users, Truck, Wallet, Route, PackageCheck, MessageCircle, Globe } from "lucide-react";
import { toast } from "sonner";
import type { BankConnector, ConnectorProvider } from "@/data/types";
import PreviewBadge from "@/components/PreviewBadge";
import { useT } from "@/i18n";

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
    desc: "RBI-mandated open banking. Fetch live bank statements via user consent - no credentials stored.",
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
  const tr = useT();
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
    toast.success(`${provider.name} connector added - complete consent to activate.`);
    setSetupFor(null); setFields({});
  };

  const handleSync = async (c: BankConnector) => {
    setSyncing(c.id);
    try {
      const res = await api.post<{ ok?: boolean; synced?: number; status?: string; last_sync?: string }>(`/api/connectors/${c.id}/sync`, {});
      // Backend marks the connector connected with a fresh last_sync on success.
      updateConnector({
        ...c,
        status: (res.status as BankConnector["status"]) ?? "connected",
        lastSync: res.last_sync ?? new Date().toISOString(),
      });
      toast.success(
        typeof res.synced === "number"
          ? `Sync complete - ${res.synced} transaction${res.synced === 1 ? "" : "s"} pulled.`
          : "Sync complete."
      );
    } catch (err) {
      // Surface the real backend error (e.g. 503 "Set AA_CLIENT_ID…") - never fake a synced state.
      const raw = err instanceof Error ? err.message : String(err);
      let msg = raw;
      const jsonStart = raw.indexOf("{");
      if (jsonStart !== -1) {
        try {
          const parsed = JSON.parse(raw.slice(jsonStart));
          if (parsed?.error) msg = String(parsed.error);
        } catch { /* keep the raw message */ }
      }
      toast.error(`Sync failed: ${msg}`);
    } finally {
      setSyncing(null);
    }
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
        <h1 className="text-xl font-bold flex items-center gap-2">{tr("conn.title")} <PreviewBadge capability="bankSync" /></h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          {tr("conn.subtitle")}
        </p>
      </div>

      {/* Connected summary */}
      {connectors.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: tr("conn.statConnected"), value: connectors.filter(c => c.status === "connected").length },
            { label: tr("conn.statPending"),   value: connectors.filter(c => c.status === "pending").length },
            { label: tr("conn.statTotal"),     value: connectors.length },
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
          <h2 className="text-sm font-semibold">{tr("conn.activeConnections")}</h2>
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
        <h2 className="text-sm font-semibold mb-3">{tr("conn.availableConnectors")}</h2>
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
          The AA Network is India's RBI-mandated open banking framework. It lets you securely share bank statement data with Headroom via a one-time consent - no credentials or passwords shared. Supported by all major Indian banks including HDFC, ICICI, SBI, Axis, Kotak, and Yes Bank.
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

      {/* #166-#169 - Connector tools */}
      {([["bank-upi-feed", "Bank / UPI Feed", Banknote], ["gateway-recon", "Gateway Recon", GitCompareArrows], ["ecom-sync", "E-commerce Sync", ShoppingCart], ["sync-monitor", "Sync Monitor", Activity], ["conn-catalog", "Catalog", Store], ["conn-schedule", "Schedules", CalendarClock], ["conn-mapping", "Field Mapping", Workflow], ["conn-vault", "Credential Vault", KeyRound], ["conn-webhooks", "Webhooks", Webhook], ["conn-history", "Sync History", History], ["conn-erp-agent", "ERP Agent", Server], ["conn-gstn", "GSTN Portal", FileCheck2], ["conn-cost", "Cost Estimate", Calculator], ["conn-dataflow", "Data Flow", ShieldCheck], ["conn-environment", "Sandbox/Prod", FlaskConical], ["conn-pos", "POS System", CreditCard], ["conn-payroll", "Payroll Software", Wallet], ["conn-crm", "CRM", Users], ["conn-shipping", "Shipping / Logistics", Truck], ["conn-eway", "E-Way Bill API", Route], ["conn-awb", "Courier AWB / Labels", PackageCheck], ["conn-whatsapp-bsp", "WhatsApp BSP", MessageCircle], ["conn-fx-rates", "FX Rate Feed", Globe]] as const).map(([id, label, Icon]) => (
        <a key={id} href={`#${id}`} className="sr-only">{label} <Icon size={10} /></a>
      ))}
      <BankUpiFeedConnector />
      <PaymentGatewayReconciliation />
      <EcommerceMarketplaceSync />
      <ConnectorHealthMonitor />
      <ConnectorCatalog />
      <SyncScheduleConfig />
      <FieldMappingStudio />
      <CredentialVault />
      <WebhookRegistry />
      <SyncHistoryTimeline />
      <ErpAgentConfig />
      <GstnPortalConnect />
      <IntegrationCostEstimator />
      <DataFlowAudit />
      <EnvironmentToggle />
      <PosSystemConnector />
      <PayrollSoftwareConnector />
      <CrmConnector />
      <ShippingLogisticsConnector />
      <EWayBillConnector />
      <CourierAwbConnector />
      <WhatsappBspConnector />
      <FxRateFeedConnector />
    </div>
  );
}

const FC_INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

// ── #166 Bank / UPI Feed Connector ──────────────────────────────────────────────
// AA-style consent connect flow + simulated last-sync state. No real bank link -
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
    toast.success("Consent request raised - approve in your bank's AA app to activate (simulated).");
  };

  const approveConsent = (id: string) => {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, consentStatus: "active" } : a));
    toast.success("Consent approved - feed is live.");
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
        Raise an Account Aggregator consent to auto-pull bank statement &amp; UPI transactions. No credentials are stored -
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
          <p className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-border)] rounded-lg">No feeds yet - start a consent above.</p>
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
                      <td className="px-3 py-2 text-xs text-[var(--color-muted)]">-</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-muted)]">-</td>
                      <td className="px-3 py-2 text-[10px] text-red-400">Not settled yet</td>
                    </tr>
                  ))}
                  {result.orphanSettlements.map(r => (
                    <tr key={`o-${r.ref}`}>
                      <td className="px-3 py-2 text-xs font-mono">{r.ref}</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-muted)]">-</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-muted)]">-</td>
                      <td className="px-3 py-2 text-[10px] text-yellow-400">Payout with no order</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.mismatched.length === 0 && result.missingSettlement.length === 0 && result.orphanSettlements.length === 0 && (
            <p className="text-xs text-green-400 flex items-center gap-1.5"><CheckCircle2 size={13} /> Fully reconciled - every order matches a settlement within tolerance.</p>
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
    if (preview.length === 0) { toast.error("No valid rows found - check the CSV format."); return; }
    const batch: EcomBatch = { id: generateId(), marketplace, importedAt: new Date().toISOString(), orders: preview };
    setBatches(prev => [batch, ...prev]);
    setCsv("");
    toast.success(`Imported ${preview.length} ${marketplace} orders - net payout ${formatCurrency(previewNet)}.`);
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
        Demo: CSV import only - no live Amazon SP-API / Flipkart connection. Net payout excludes TCS &amp; reserve holds.
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
    toast.success("Retry succeeded - connector back online.");
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
          <p className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-border)] rounded-lg">No active connectors - connect one above to monitor it here.</p>
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

const DemoNote = ({ children }: { children: ReactNode }) => (
  <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
    <AlertCircle size={12} className="shrink-0 mt-px" />
    {children}
  </div>
);

// ── Connector Catalog / Marketplace ───────────────────────────────────────────────
// Browse a catalogue of integrations and "connect" them. Connection state is durable
// per-app (useFeatureState) but entirely simulated - no real OAuth handshake.
type CatalogItem = { id: string; name: string; category: string; icon: string; desc: string };
const CATALOG: CatalogItem[] = [
  { id: "shopify", name: "Shopify", category: "E-commerce", icon: "🛍️", desc: "Sync store orders, refunds & payouts." },
  { id: "woocommerce", name: "WooCommerce", category: "E-commerce", icon: "🟣", desc: "Pull WordPress store sales." },
  { id: "cashfree", name: "Cashfree", category: "Payments", icon: "🟢", desc: "Settlements & payout reconciliation." },
  { id: "payu", name: "PayU", category: "Payments", icon: "🟡", desc: "Import gateway transactions." },
  { id: "icici_corp", name: "ICICI Corporate API", category: "Banking", icon: "🏦", desc: "Direct corporate bank statement feed." },
  { id: "hdfc_corp", name: "HDFC Corporate API", category: "Banking", icon: "🏛️", desc: "Live current-account balances." },
  { id: "xero", name: "Xero", category: "Accounting", icon: "🔵", desc: "Two-way ledger & invoice sync." },
  { id: "sap_b1", name: "SAP Business One", category: "ERP", icon: "🟦", desc: "Push journal entries to SAP." },
  { id: "shiprocket", name: "Shiprocket", category: "Logistics", icon: "🚚", desc: "COD remittance reconciliation." },
  { id: "gsuite_sheets", name: "Google Sheets", category: "Data", icon: "📗", desc: "Export ledgers to a live sheet." },
];

function ConnectorCatalog() {
  const [connected, setConnected] = useFeatureState<Record<string, string>>("conn-catalog-connected", {});
  const [filter, setFilter] = useState<string>("All");
  const [busy, setBusy] = useState<string | null>(null);

  const categories = ["All", ...Array.from(new Set(CATALOG.map(c => c.category)))];
  const shown = CATALOG.filter(c => filter === "All" || c.category === filter);

  const connect = async (item: CatalogItem) => {
    setBusy(item.id);
    await new Promise(r => setTimeout(r, 900));
    setConnected(prev => ({ ...prev, [item.id]: new Date().toISOString() }));
    setBusy(null);
    toast.success(`${item.name} connected (simulated).`);
  };
  const disconnect = (item: CatalogItem) => {
    setConnected(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    toast.success(`${item.name} disconnected.`);
  };

  const connectedCount = Object.keys(connected).length;

  return (
    <section id="conn-catalog" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Store size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Connector Catalog</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{connectedCount} connected</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Browse Headroom's integration marketplace. Tap connect to add an integration - connections are remembered on this device.
      </p>

      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${filter === cat ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {shown.map(item => {
          const isConnected = !!connected[item.id];
          return (
            <div key={item.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 flex items-start gap-3">
              <span className="text-2xl mt-0.5">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold">{item.name}</p>
                  <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{item.category}</span>
                  {isConnected && <span className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle2 size={10} />Connected</span>}
                </div>
                <p className="text-xs text-[var(--color-muted)] mb-2 leading-relaxed">{item.desc}</p>
                {isConnected ? (
                  <button onClick={() => disconnect(item)} className="text-[11px] text-[var(--color-muted)] border border-[var(--color-border)] px-2.5 py-1 rounded-lg hover:text-red-400">Disconnect</button>
                ) : (
                  <button onClick={() => connect(item)} disabled={busy === item.id}
                    className="flex items-center gap-1 text-[11px] bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-2.5 py-1 rounded-lg hover:opacity-90">
                    {busy === item.id ? <RefreshCw size={11} className="animate-spin" /> : <PlugZap size={11} />} Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <DemoNote>Demo: the marketplace is a static catalogue; "connect" stores a flag locally - no real OAuth or API handshake happens.</DemoNote>
    </section>
  );
}

// ── Sync Schedule Config ──────────────────────────────────────────────────────────
// Per-connector sync cadence + window. Computes the next run client-side. Nothing is
// actually scheduled on a server.
type SyncSchedule = { freq: "manual" | "hourly" | "daily" | "weekly"; hour: number; enabled: boolean };
const FREQ_LABEL: Record<SyncSchedule["freq"], string> = { manual: "Manual only", hourly: "Every hour", daily: "Once a day", weekly: "Once a week" };

function nextRun(s: SyncSchedule): string {
  if (!s.enabled || s.freq === "manual") return "-";
  const now = new Date();
  const next = new Date(now);
  if (s.freq === "hourly") { next.setHours(now.getHours() + 1, 0, 0, 0); }
  else { next.setHours(s.hour, 0, 0, 0); if (next <= now) next.setDate(next.getDate() + (s.freq === "weekly" ? 7 : 1)); }
  return next.toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function SyncScheduleConfig() {
  const { store } = useApp();
  const { connectors } = store;
  const [schedules, setSchedules] = useFeatureState<Record<string, SyncSchedule>>("conn-schedules", {});

  const get = (id: string): SyncSchedule => schedules[id] ?? { freq: "daily", hour: 9, enabled: false };
  const set = (id: string, patch: Partial<SyncSchedule>) =>
    setSchedules(prev => ({ ...prev, [id]: { ...get(id), ...patch } }));

  return (
    <section id="conn-schedule" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Sync Schedule</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">Auto-pull cadence per connector</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Set how often each connected source pulls fresh data and when the daily/weekly window opens.
      </p>

      {connectors.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-border)] rounded-lg">No active connectors - connect one above to schedule its syncs.</p>
      ) : (
        <div className="space-y-2">
          {connectors.map(c => {
            const s = get(c.id);
            return (
              <div key={c.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold truncate">{c.label}</p>
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)] cursor-pointer">
                    <input type="checkbox" checked={s.enabled} onChange={e => set(c.id, { enabled: e.target.checked })} />
                    Auto-sync
                  </label>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-[10px] text-[var(--color-muted)] block mb-1">Frequency</label>
                    <select value={s.freq} onChange={e => set(c.id, { freq: e.target.value as SyncSchedule["freq"] })} className={FC_INP}>
                      {(Object.keys(FREQ_LABEL) as SyncSchedule["freq"][]).map(f => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                    </select>
                  </div>
                  {(s.freq === "daily" || s.freq === "weekly") && (
                    <div>
                      <label className="text-[10px] text-[var(--color-muted)] block mb-1">Hour of day</label>
                      <select value={s.hour} onChange={e => set(c.id, { hour: Number(e.target.value) })} className={FC_INP}>
                        {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                      </select>
                    </div>
                  )}
                  <p className="text-[11px] text-[var(--color-muted)] pb-2">
                    Next run: <span className="font-semibold text-[var(--color-text)]">{nextRun(s)}</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DemoNote>Demo: schedules are stored locally and the next-run time is computed in-browser. No background job actually runs.</DemoNote>
    </section>
  );
}

// ── Field Mapping Studio ──────────────────────────────────────────────────────────
// Map incoming connector fields to Headroom's canonical transaction schema.
type FieldMap = Record<string, string>;
const HEADROOM_FIELDS = ["date", "amount", "description", "counterparty", "category", "reference"] as const;

function FieldMappingStudio() {
  const [maps, setMaps] = useFeatureState<Record<string, FieldMap>>("conn-field-maps", {});
  const [connector, setConnector] = useState("Razorpay");
  const [sourceField, setSourceField] = useState("");
  const [target, setTarget] = useState<typeof HEADROOM_FIELDS[number]>("amount");

  const current = maps[connector] ?? {};
  const addMapping = () => {
    if (!sourceField.trim()) { toast.error("Enter the source field name"); return; }
    setMaps(prev => ({ ...prev, [connector]: { ...(prev[connector] ?? {}), [sourceField.trim()]: target } }));
    setSourceField("");
    toast.success(`Mapped "${sourceField.trim()}" → ${target}`);
  };
  const removeMapping = (src: string) =>
    setMaps(prev => { const n = { ...(prev[connector] ?? {}) }; delete n[src]; return { ...prev, [connector]: n }; });

  const mapped = Object.entries(current);
  const coveredTargets = new Set(Object.values(current));
  const missing = HEADROOM_FIELDS.filter(f => !coveredTargets.has(f));

  return (
    <section id="conn-mapping" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Workflow size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Field Mapping Studio</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">Source → Headroom schema</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Map the column names a connector sends to Headroom's canonical transaction fields, so imports land in the right place.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Connector</label>
          <input value={connector} onChange={e => setConnector(e.target.value)} placeholder="Razorpay" className={FC_INP} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Source field</label>
          <input value={sourceField} onChange={e => setSourceField(e.target.value)} placeholder="e.g. settlement_amount" className={FC_INP} />
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Maps to</label>
          <select value={target} onChange={e => setTarget(e.target.value as typeof HEADROOM_FIELDS[number])} className={FC_INP}>
            {HEADROOM_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <button onClick={addMapping} className="flex items-center gap-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg text-sm hover:opacity-90">
          <Plus size={13} /> Map
        </button>
      </div>

      {missing.length > 0 && (
        <p className="text-[11px] text-yellow-400 flex items-center gap-1.5">
          <AlertCircle size={12} /> Unmapped Headroom fields for {connector || "this connector"}: {missing.join(", ")}
        </p>
      )}

      <div className="space-y-2">
        {mapped.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-border)] rounded-lg">No mappings yet for "{connector}".</p>
        ) : mapped.map(([src, tgt]) => (
          <div key={src} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <code className="font-mono text-xs truncate">{src}</code>
              <ArrowDownUp size={12} className="text-[var(--color-muted)] shrink-0 rotate-90" />
              <span className="font-semibold text-[var(--color-primary)]">{tgt}</span>
            </div>
            <button onClick={() => removeMapping(src)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-red-950/20 transition-colors shrink-0">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <DemoNote>Demo: mappings are saved locally for reference. They are not yet applied to a live import pipeline.</DemoNote>
    </section>
  );
}

// ── Credential Vault ──────────────────────────────────────────────────────────────
// Store API keys/secrets per connector, masked by default. Stored in-browser only -
// honest warning that this is NOT a production secret store.
type Credential = { id: string; connector: string; keyName: string; secret: string; addedAt: string };

function maskSecret(s: string): string {
  if (s.length <= 4) return "•".repeat(s.length);
  return s.slice(0, 2) + "•".repeat(Math.max(4, s.length - 6)) + s.slice(-4);
}

function CredentialVault() {
  const [creds, setCreds] = useFeatureState<Credential[]>("conn-credentials", []);
  const [connector, setConnector] = useState("");
  const [keyName, setKeyName] = useState("");
  const [secret, setSecret] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const add = () => {
    if (!connector.trim() || !keyName.trim() || !secret.trim()) { toast.error("Fill connector, key name and secret"); return; }
    setCreds(prev => [{ id: generateId(), connector: connector.trim(), keyName: keyName.trim(), secret: secret.trim(), addedAt: new Date().toISOString() }, ...prev]);
    setConnector(""); setKeyName(""); setSecret("");
    toast.success("Credential stored (masked).");
  };
  const remove = (id: string) => { setCreds(prev => prev.filter(c => c.id !== id)); setRevealed(prev => { const n = new Set(prev); n.delete(id); return n; }); };
  const toggle = (id: string) => setRevealed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const copy = (c: Credential) => { navigator.clipboard?.writeText(c.secret); toast.success("Secret copied to clipboard."); };

  return (
    <section id="conn-vault" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Credential Vault</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{creds.length} stored · masked</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Keep API keys and webhook secrets for your connectors in one place. Values are masked by default; reveal or copy when needed.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input value={connector} onChange={e => setConnector(e.target.value)} placeholder="Connector (Stripe)" className={FC_INP} />
        <input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Key name (Secret key)" className={FC_INP} />
        <input type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder="sk_live_…" className={FC_INP} />
        <button onClick={add} className="flex items-center justify-center gap-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded-lg text-sm hover:opacity-90">
          <Plus size={13} /> Store key
        </button>
      </div>

      <div className="space-y-2">
        {creds.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-border)] rounded-lg">No credentials stored yet.</p>
        ) : creds.map(c => {
          const open = revealed.has(c.id);
          return (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{c.connector} · <span className="font-normal text-[var(--color-muted)]">{c.keyName}</span></p>
                <code className="text-[11px] font-mono text-[var(--color-muted)] break-all">{open ? c.secret : maskSecret(c.secret)}</code>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggle(c.id)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-accent)] transition-colors">
                  {open ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button onClick={() => copy(c)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-accent)] transition-colors">
                  <Copy size={13} />
                </button>
                <button onClick={() => remove(c.id)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-red-950/20 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <DemoNote>Security note: this demo stores secrets in your browser's local state only - NOT encrypted or production-safe. Never paste real live keys here.</DemoNote>
    </section>
  );
}

// ── Webhook Endpoint Registry ───────────────────────────────────────────────────────
// Register inbound webhook endpoints and fire a simulated test ping with a 2xx/timeout
// result. No actual HTTP request is made.
type WebhookEntry = { id: string; label: string; url: string; events: string; lastPing: string | null; lastStatus: number | null };

function WebhookRegistry() {
  const [hooks, setHooks] = useFeatureState<WebhookEntry[]>("conn-webhooks", []);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("payment.captured");
  const [pinging, setPinging] = useState<string | null>(null);

  const add = () => {
    if (!url.trim()) { toast.error("Enter a webhook URL"); return; }
    if (!/^https?:\/\//i.test(url.trim())) { toast.error("URL must start with http(s)://"); return; }
    setHooks(prev => [{ id: generateId(), label: label.trim() || "Endpoint", url: url.trim(), events: events.trim(), lastPing: null, lastStatus: null }, ...prev]);
    setLabel(""); setUrl("");
    toast.success("Webhook endpoint registered.");
  };
  const remove = (id: string) => setHooks(prev => prev.filter(h => h.id !== id));
  const testPing = async (id: string) => {
    setPinging(id);
    await new Promise(r => setTimeout(r, 1000));
    const ok = Math.random() > 0.25;
    const status = ok ? 200 : (Math.random() > 0.5 ? 500 : 0);
    setHooks(prev => prev.map(h => h.id === id ? { ...h, lastPing: new Date().toISOString(), lastStatus: status } : h));
    setPinging(null);
    if (status === 200) toast.success("Test ping delivered - 200 OK (simulated).");
    else if (status === 0) toast.error("Test ping failed - connection timed out (simulated).");
    else toast.error(`Test ping failed - ${status} from endpoint (simulated).`);
  };

  return (
    <section id="conn-webhooks" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Webhook size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Webhook Registry</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{hooks.length} endpoints</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Register endpoints that should receive connector events, then fire a test ping to check delivery.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (Orders hook)" className={FC_INP} />
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.you.com/hook" className={`${FC_INP} md:col-span-2`} />
        <button onClick={add} className="flex items-center justify-center gap-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded-lg text-sm hover:opacity-90">
          <Plus size={13} /> Register
        </button>
      </div>
      <div className="max-w-md">
        <label className="text-[10px] text-[var(--color-muted)] block mb-1">Subscribed events (comma-separated)</label>
        <input value={events} onChange={e => setEvents(e.target.value)} placeholder="payment.captured, refund.created" className={FC_INP} />
      </div>

      <div className="space-y-2">
        {hooks.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-border)] rounded-lg">No webhook endpoints registered.</p>
        ) : hooks.map(h => {
          const statusColor = h.lastStatus === 200 ? "text-green-400" : h.lastStatus === null ? "text-[var(--color-muted)]" : "text-red-400";
          const statusText = h.lastStatus === null ? "Never pinged" : h.lastStatus === 0 ? "Timed out" : `${h.lastStatus}`;
          return (
            <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{h.label}</p>
                  <span className={`text-[10px] font-medium ${statusColor}`}>{statusText}</span>
                </div>
                <code className="text-[11px] font-mono text-[var(--color-muted)] break-all">{h.url}</code>
                <p className="text-[10px] text-[var(--color-muted)] truncate">{h.events || "all events"}{h.lastPing ? ` · pinged ${new Date(h.lastPing).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => testPing(h.id)} disabled={pinging === h.id}
                  className="flex items-center gap-1 text-[10px] text-[var(--color-primary)] border border-[var(--color-border)] px-2 py-1 rounded-lg hover:bg-[var(--color-accent)]">
                  {pinging === h.id ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />} Test
                </button>
                <button onClick={() => remove(h.id)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-red-950/20 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <DemoNote>Demo: test pings do not make a real HTTP request - the 200/500/timeout outcome is simulated client-side.</DemoNote>
    </section>
  );
}

// ── Sync History Timeline ───────────────────────────────────────────────────────────
// Append-only log of sync events across connectors. Lets you record a simulated run
// and review the recent timeline. Persisted locally.
type SyncEvent = { id: string; connector: string; at: string; records: number; outcome: "success" | "partial" | "failed" };

function SyncHistoryTimeline() {
  const { store } = useApp();
  const { connectors } = store;
  const [events, setEvents] = useFeatureState<SyncEvent[]>("conn-sync-history", []);
  const [connector, setConnector] = useState("");

  const options = Array.from(new Set([...connectors.map(c => c.label), "Razorpay", "Stripe", "AA Network", "Tally ERP"]));

  const record = async () => {
    const name = connector || options[0] || "Connector";
    const roll = Math.random();
    const outcome: SyncEvent["outcome"] = roll > 0.8 ? "failed" : roll > 0.6 ? "partial" : "success";
    const records = outcome === "failed" ? 0 : 3 + Math.floor(Math.random() * 60);
    setEvents(prev => [{ id: generateId(), connector: name, at: new Date().toISOString(), records, outcome }, ...prev].slice(0, 50));
    if (outcome === "success") toast.success(`${name}: pulled ${records} records.`);
    else if (outcome === "partial") toast(`${name}: partial sync - ${records} records, some skipped.`);
    else toast.error(`${name}: sync failed.`);
  };
  const clear = () => { setEvents([]); toast.success("History cleared."); };

  const OUTCOME_UI: Record<SyncEvent["outcome"], { color: string; Icon: typeof CheckCircle2; label: string }> = {
    success: { color: "text-green-400", Icon: CheckCircle2, label: "Success" },
    partial: { color: "text-yellow-400", Icon: AlertCircle, label: "Partial" },
    failed: { color: "text-red-400", Icon: XCircle, label: "Failed" },
  };

  const totalRecords = events.reduce((s, e) => s + e.records, 0);

  return (
    <section id="conn-history" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <History size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Sync History</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{events.length} runs · {totalRecords} records</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        A running timeline of every sync run across your connectors. Record a run to see how success, partial and failed outcomes appear.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Connector</label>
          <select value={connector} onChange={e => setConnector(e.target.value)} className={FC_INP}>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <button onClick={record} className="flex items-center gap-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg text-sm hover:opacity-90">
          <RefreshCw size={13} /> Record sync run
        </button>
        {events.length > 0 && (
          <button onClick={clear} className="text-xs text-[var(--color-muted)] border border-[var(--color-border)] px-3 py-2 rounded-lg hover:text-red-400">Clear</button>
        )}
      </div>

      <div className="space-y-0">
        {events.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-border)] rounded-lg">No sync runs recorded yet.</p>
        ) : (
          <ol className="relative border-l border-[var(--color-border)] ml-2 space-y-3 py-1">
            {events.map(e => {
              const ui = OUTCOME_UI[e.outcome];
              const Icon = ui.Icon;
              return (
                <li key={e.id} className="ml-4">
                  <span className={`absolute -left-[7px] mt-0.5 ${ui.color}`}><Icon size={13} /></span>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{e.connector} <span className={`text-[10px] font-medium ${ui.color}`}>{ui.label}</span></p>
                    <span className="text-[10px] text-[var(--color-muted)]">{new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)]">{e.outcome === "failed" ? "No records pulled" : `${e.records} records pulled`}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <DemoNote>Demo: sync runs here are simulated and logged locally. Production wires this to real connector run events.</DemoNote>
    </section>
  );
}

// ── Tally / Busy On-Prem ERP Agent ──────────────────────────────────────────────────
// Configure the lightweight sync agent that pushes vouchers from an on-premise Tally /
// Busy install. Generates a pairing token and tracks a simulated agent heartbeat.
type ErpAgent = {
  id: string;
  software: "Tally Prime" | "Tally ERP 9" | "Busy" | "Marg";
  company: string;
  port: string;
  token: string;
  pushVouchers: boolean;
  pushMasters: boolean;
  paired: boolean;
  lastBeat: string | null;
};

function ErpAgentConfig() {
  const [agents, setAgents] = useFeatureState<ErpAgent[]>("conn-erp-agents", []);
  const [software, setSoftware] = useState<ErpAgent["software"]>("Tally Prime");
  const [company, setCompany] = useState("");
  const [port, setPort] = useState("9000");
  const [beating, setBeating] = useState<string | null>(null);

  const create = () => {
    if (!company.trim()) { toast.error("Enter the Tally / Busy company name"); return; }
    const token = `hr_agent_${generateId().slice(0, 12)}`;
    setAgents(prev => [{
      id: generateId(),
      software,
      company: company.trim(),
      port: port.trim() || "9000",
      token,
      pushVouchers: true,
      pushMasters: false,
      paired: false,
      lastBeat: null,
    }, ...prev]);
    setCompany("");
    toast.success("Agent profile created - paste the token into the on-prem sync agent to pair.");
  };

  const togglePush = (id: string, key: "pushVouchers" | "pushMasters") =>
    setAgents(prev => prev.map(a => a.id === id ? { ...a, [key]: !a[key] } : a));

  const pair = async (id: string) => {
    setBeating(id);
    await new Promise(r => setTimeout(r, 1100));
    setAgents(prev => prev.map(a => a.id === id ? { ...a, paired: true, lastBeat: new Date().toISOString() } : a));
    setBeating(null);
    toast.success("Agent paired - heartbeat received (simulated).");
  };

  const heartbeat = async (id: string) => {
    setBeating(id);
    await new Promise(r => setTimeout(r, 800));
    setAgents(prev => prev.map(a => a.id === id ? { ...a, lastBeat: new Date().toISOString() } : a));
    setBeating(null);
    toast.success("Heartbeat received - agent is online (simulated).");
  };

  const copyToken = (t: string) => { navigator.clipboard?.writeText(t); toast.success("Pairing token copied."); };
  const remove = (id: string) => setAgents(prev => prev.filter(a => a.id !== id));

  return (
    <section id="conn-erp-agent" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Server size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Tally / Busy ERP Agent</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">On-prem sync agent · pairing token</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Configure the lightweight agent that runs alongside your on-premise Tally / Busy install and pushes vouchers to Headroom.
        Create a profile, then paste its pairing token into the agent on your server.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Software</label>
          <select value={software} onChange={e => setSoftware(e.target.value as ErpAgent["software"])} className={FC_INP}>
            {(["Tally Prime", "Tally ERP 9", "Busy", "Marg"] as const).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Company name (as in ledger)</label>
          <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Trading Co" className={FC_INP} />
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Local port</label>
          <input value={port} onChange={e => setPort(e.target.value)} placeholder="9000" className={FC_INP} />
        </div>
      </div>
      <button onClick={create} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90">
        <Plus size={13} /> Create agent profile
      </button>

      <div className="space-y-2">
        {agents.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] text-center py-3 border border-dashed border-[var(--color-border)] rounded-lg">No agent profiles yet.</p>
        ) : agents.map(a => (
          <div key={a.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{a.company}</p>
                  <span className={`flex items-center gap-1 text-[10px] ${a.paired ? "text-green-400" : "text-yellow-400"}`}>
                    {a.paired ? <CheckCircle2 size={10} /> : <Clock size={10} />}{a.paired ? "Paired" : "Awaiting pairing"}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-muted)]">
                  {a.software} · localhost:{a.port}{a.lastBeat ? ` · heartbeat ${new Date(a.lastBeat).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {a.paired ? (
                  <button onClick={() => heartbeat(a.id)} disabled={beating === a.id}
                    className="flex items-center gap-1 text-[10px] text-[var(--color-primary)] border border-[var(--color-border)] px-2 py-1 rounded-lg hover:bg-[var(--color-accent)]">
                    <RefreshCw size={11} className={beating === a.id ? "animate-spin" : ""} /> Ping
                  </button>
                ) : (
                  <button onClick={() => pair(a.id)} disabled={beating === a.id}
                    className="flex items-center gap-1 text-[10px] text-green-400 border border-green-800/40 bg-green-950/20 px-2 py-1 rounded-lg hover:opacity-90">
                    {beating === a.id ? <RefreshCw size={11} className="animate-spin" /> : <Link2 size={11} />} Pair
                  </button>
                )}
                <button onClick={() => remove(a.id)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-red-950/20 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5">
              <code className="text-[11px] font-mono text-[var(--color-muted)] truncate">{a.token}</code>
              <button onClick={() => copyToken(a.token)} className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-primary)] shrink-0"><Copy size={12} /></button>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)] cursor-pointer">
                <input type="checkbox" checked={a.pushVouchers} onChange={() => togglePush(a.id, "pushVouchers")} /> Push vouchers
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)] cursor-pointer">
                <input type="checkbox" checked={a.pushMasters} onChange={() => togglePush(a.id, "pushMasters")} /> Push ledger masters
              </label>
            </div>
          </div>
        ))}
      </div>

      <DemoNote>Demo: pairing tokens and heartbeats are generated locally - no agent actually connects to a Tally / Busy instance.</DemoNote>
    </section>
  );
}

// ── GSTN Portal Connect ─────────────────────────────────────────────────────────────
// Simulated GST portal login (GSTIN + OTP) to enable returns / e-invoice pull. No real
// GSTN / GSP call - OTP and session are faked client-side.
type GstnSession = { gstin: string; legalName: string; connectedAt: string; scopes: string[] };
const GSTN_SCOPES = ["GSTR-1 (outward)", "GSTR-2B (ITC)", "GSTR-3B summary", "e-Invoice IRN", "e-Way bills"] as const;

function validGstin(g: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g.trim().toUpperCase());
}

function GstnPortalConnect() {
  const [session, setSession] = useFeatureState<GstnSession | null>("conn-gstn-session", null);
  const [gstin, setGstin] = useState("");
  const [legalName, setLegalName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["GSTR-1 (outward)", "GSTR-2B (ITC)"]);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");

  const toggleScope = (s: string) =>
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const sendOtp = () => {
    if (!validGstin(gstin)) { toast.error("Enter a valid 15-character GSTIN"); return; }
    if (scopes.length === 0) { toast.error("Select at least one data scope"); return; }
    setOtpSent(true);
    toast.success("OTP sent to the registered mobile / email (simulated).");
  };

  const verify = () => {
    if (otp.trim().length < 6) { toast.error("Enter the 6-digit OTP"); return; }
    setSession({
      gstin: gstin.trim().toUpperCase(),
      legalName: legalName.trim() || "Registered Taxpayer",
      connectedAt: new Date().toISOString(),
      scopes,
    });
    setOtpSent(false); setOtp(""); setGstin(""); setLegalName("");
    toast.success("GSTN portal connected - returns can now sync.");
  };

  const disconnect = () => {
    if (!window.confirm("Disconnect the GSTN portal session?")) return;
    setSession(null);
    toast.success("GSTN session disconnected.");
  };

  return (
    <section id="conn-gstn" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <FileCheck2 size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">GSTN Portal Connect</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">GSTIN + OTP · returns / e-invoice</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Authorise Headroom to pull your GST returns and e-invoice data via the GST portal. Verify with the OTP sent to your
        registered contact, then choose which datasets to share.
      </p>

      {session ? (
        <div className="bg-[var(--color-bg)] border border-green-800/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                {session.legalName} <span className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle2 size={10} /> Connected</span>
              </p>
              <p className="text-[11px] text-[var(--color-muted)] font-mono">{session.gstin}</p>
            </div>
            <button onClick={disconnect} className="text-[11px] text-[var(--color-muted)] border border-[var(--color-border)] px-2.5 py-1 rounded-lg hover:text-red-400">Disconnect</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {session.scopes.map(s => (
              <span key={s} className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-2 py-0.5 rounded">{s}</span>
            ))}
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Linked {new Date(session.connectedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[var(--color-muted)] block mb-1">GSTIN *</label>
              <input value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} maxLength={15} placeholder="27AAAAA0000A1Z5" className={`${FC_INP} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-[var(--color-muted)] block mb-1">Legal name (optional)</label>
              <input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Acme Pvt Ltd" className={FC_INP} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1.5">Data scopes</label>
            <div className="flex flex-wrap gap-2">
              {GSTN_SCOPES.map(s => {
                const on = scopes.includes(s);
                return (
                  <button key={s} onClick={() => toggleScope(s)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${on ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          {!otpSent ? (
            <button onClick={sendOtp} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90">
              <Send size={13} /> Send OTP
            </button>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-[10px] text-[var(--color-muted)] block mb-1">Enter 6-digit OTP</label>
                <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" className={`${FC_INP} font-mono max-w-[140px] tracking-widest`} />
              </div>
              <button onClick={verify} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90">
                <CheckCircle2 size={13} /> Verify & connect
              </button>
              <button onClick={() => { setOtpSent(false); setOtp(""); }} className="text-xs text-[var(--color-muted)] px-3 py-2 hover:text-[var(--color-text)]">Cancel</button>
            </div>
          )}
        </div>
      )}

      <DemoNote>Demo: no real GST portal / GSP authentication occurs. The GSTIN format is validated but the OTP and session are simulated locally.</DemoNote>
    </section>
  );
}

// ── Integration Cost Estimator ──────────────────────────────────────────────────────
// Estimate monthly cost of running connectors based on per-source pricing and expected
// transaction volume. Pure client-side calculator - pricing is illustrative.
type CostSource = { id: string; name: string; perTxn: number; monthlyFee: number; defaultVolume: number };
const COST_SOURCES: CostSource[] = [
  { id: "aa", name: "Account Aggregator fetch", perTxn: 0.5, monthlyFee: 0, defaultVolume: 800 },
  { id: "gw", name: "Payment gateway sync", perTxn: 0.2, monthlyFee: 99, defaultVolume: 1500 },
  { id: "ecom", name: "Marketplace settlement import", perTxn: 0.1, monthlyFee: 199, defaultVolume: 600 },
  { id: "gstn", name: "GSTN returns pull", perTxn: 0, monthlyFee: 149, defaultVolume: 0 },
  { id: "erp", name: "Tally / Busy agent", perTxn: 0.05, monthlyFee: 249, defaultVolume: 2000 },
];

function IntegrationCostEstimator() {
  const [enabled, setEnabled] = useFeatureState<Record<string, boolean>>("conn-cost-enabled", { aa: true, gw: true });
  const [volumes, setVolumes] = useFeatureState<Record<string, number>>("conn-cost-volumes", {});

  const rows = COST_SOURCES.map(s => {
    const on = enabled[s.id] ?? false;
    const vol = volumes[s.id] ?? s.defaultVolume;
    const usage = vol * s.perTxn;
    const total = on ? s.monthlyFee + usage : 0;
    return { s, on, vol, usage, total };
  });

  const monthlyTotal = rows.reduce((a, r) => a + r.total, 0);
  const annualTotal = monthlyTotal * 12;
  const activeCount = rows.filter(r => r.on).length;

  const toggle = (id: string) => setEnabled(prev => ({ ...prev, [id]: !(prev[id] ?? false) }));
  const setVol = (id: string, v: number) => setVolumes(prev => ({ ...prev, [id]: Math.max(0, v) }));

  return (
    <section id="conn-cost" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Calculator size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Integration Cost Estimator</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{activeCount} sources · monthly run-rate</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Toggle the connectors you plan to run and set expected monthly volume. Headroom estimates the per-transaction and
        platform-fee run-rate so you can budget before switching anything on.
      </p>

      <div className="space-y-2">
        {rows.map(({ s, on, vol, usage, total }) => (
          <div key={s.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 cursor-pointer min-w-0">
                <input type="checkbox" checked={on} onChange={() => toggle(s.id)} />
                <span className="text-sm font-semibold truncate">{s.name}</span>
              </label>
              <span className={`text-sm font-bold tabular-nums shrink-0 ${on ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>{formatCurrency(total)}</span>
            </div>
            {on && (
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <div>
                  <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Monthly txns</label>
                  <input type="number" min={0} value={vol} onChange={e => setVol(s.id, Number(e.target.value))} className={`${FC_INP} max-w-[120px] py-1`} />
                </div>
                <p className="text-[11px] text-[var(--color-muted)]">
                  Platform <span className="tabular-nums text-[var(--color-text)]">{formatCurrency(s.monthlyFee)}</span>
                  {s.perTxn > 0 && <> · usage <span className="tabular-nums text-[var(--color-text)]">{formatCurrency(usage)}</span> @ {formatCurrency(s.perTxn)}/txn</>}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-[10px] text-[var(--color-muted)] mb-0.5">Estimated monthly</p>
          <p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(monthlyTotal)}</p>
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-[10px] text-[var(--color-muted)] mb-0.5">Annualised</p>
          <p className="text-lg font-bold tabular-nums text-[var(--color-text)]">{formatCurrency(annualTotal)}</p>
        </div>
      </div>

      <DemoNote>Demo: pricing figures are illustrative placeholders for budgeting only - they are not Headroom's commercial rates.</DemoNote>
    </section>
  );
}

// ── Data-Flow & Scope Audit ─────────────────────────────────────────────────────────
// Show exactly what data each connector reads/writes and the OAuth-style scopes it
// requests, with a toggle to grant/revoke each scope. Reference + simulated grants.
type FlowEntry = { connector: string; reads: string[]; writes: string[]; scopes: string[] };
const DATA_FLOWS: FlowEntry[] = [
  { connector: "Account Aggregator", reads: ["Bank statements", "Account balance"], writes: [], scopes: ["statements.read", "balance.read"] },
  { connector: "Payment Gateway", reads: ["Settlements", "Refunds"], writes: ["Transaction tags"], scopes: ["settlements.read", "refunds.read", "tags.write"] },
  { connector: "Tally / Busy Agent", reads: ["Vouchers", "Ledger masters"], writes: ["Reconciled flags"], scopes: ["vouchers.read", "masters.read", "recon.write"] },
  { connector: "GSTN Portal", reads: ["GSTR-1", "GSTR-2B", "e-Invoices"], writes: [], scopes: ["returns.read", "einvoice.read"] },
  { connector: "Marketplace", reads: ["Orders", "Settlement fees"], writes: [], scopes: ["orders.read", "payouts.read"] },
];

function DataFlowAudit() {
  const [granted, setGranted] = useFeatureState<Record<string, boolean>>("conn-dataflow-grants", {});

  const isGranted = (scope: string) => granted[scope] ?? true; // scopes granted by default
  const toggle = (scope: string) => setGranted(prev => ({ ...prev, [scope]: !(prev[scope] ?? true) }));

  const allScopes = DATA_FLOWS.flatMap(f => f.scopes);
  const writeScopes = allScopes.filter(s => s.endsWith(".write"));
  const revoked = allScopes.filter(s => !isGranted(s)).length;

  return (
    <section id="conn-dataflow" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Data-Flow & Scope Audit</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{writeScopes.length} write scopes · {revoked} revoked</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        See exactly what each connector reads from and writes back to your systems, plus the permission scopes it requests.
        Revoke any scope you are not comfortable granting.
      </p>

      <div className="space-y-3">
        {DATA_FLOWS.map(f => (
          <div key={f.connector} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 space-y-2">
            <p className="text-sm font-semibold">{f.connector}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
              <div>
                <p className="text-[var(--color-muted)] mb-1 flex items-center gap-1"><ArrowDownUp size={10} className="rotate-180" /> Reads</p>
                <div className="flex flex-wrap gap-1">
                  {f.reads.length === 0 ? <span className="text-[var(--color-muted)]">-</span> : f.reads.map(r => (
                    <span key={r} className="bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{r}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[var(--color-muted)] mb-1 flex items-center gap-1"><ArrowDownUp size={10} /> Writes back</p>
                <div className="flex flex-wrap gap-1">
                  {f.writes.length === 0 ? <span className="text-green-400">Read-only</span> : f.writes.map(w => (
                    <span key={w} className="bg-orange-950/30 text-orange-400 px-1.5 py-0.5 rounded">{w}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[var(--color-border)]">
              {f.scopes.map(scope => {
                const on = isGranted(scope);
                const isWrite = scope.endsWith(".write");
                return (
                  <button key={scope} onClick={() => toggle(scope)}
                    className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${on ? (isWrite ? "border-orange-800/40 text-orange-400" : "border-green-800/40 text-green-400") : "border-[var(--color-border)] text-[var(--color-muted)] line-through opacity-70"}`}>
                    {on ? <CheckCircle2 size={9} /> : <XCircle size={9} />} {scope}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <DemoNote>Demo: scopes and data-flows are a reference map. Grant/revoke toggles are stored locally and do not change any live integration permissions.</DemoNote>
    </section>
  );
}

// ── Sandbox vs Production Environment Toggle ─────────────────────────────────────────
// Per-connector environment switch (test sandbox vs live). Live mode requires an
// explicit confirmation. All state is local - no environment is actually switched.
type Environment = "sandbox" | "production";

function EnvironmentToggle() {
  const { store } = useApp();
  const { connectors } = store;
  const [envs, setEnvs] = useFeatureState<Record<string, Environment>>("conn-environments", {});

  const targets = connectors.length > 0
    ? connectors.map(c => ({ id: c.id, label: c.label }))
    : [
        { id: "aa_network", label: "Account Aggregator" },
        { id: "razorpay", label: "Razorpay" },
        { id: "stripe", label: "Stripe" },
        { id: "tally", label: "Tally ERP" },
      ];

  const get = (id: string): Environment => envs[id] ?? "sandbox";

  const setEnv = (id: string, label: string, env: Environment) => {
    if (env === "production" && !window.confirm(`Switch ${label} to LIVE production? Real data and money movement may be affected.`)) return;
    setEnvs(prev => ({ ...prev, [id]: env }));
    toast(env === "production" ? `${label} set to Production (simulated).` : `${label} set to Sandbox.`);
  };

  const liveCount = targets.filter(t => get(t.id) === "production").length;

  return (
    <section id="conn-environment" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <FlaskConical size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Sandbox vs Production</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{liveCount} live · {targets.length - liveCount} sandbox</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Run each connector against a test sandbox before going live. Switching to production needs an explicit confirmation
        so you never accidentally move real money or data.
      </p>

      <div className="space-y-2">
        {targets.map(t => {
          const env = get(t.id);
          return (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{t.label}</p>
                <p className={`text-[11px] flex items-center gap-1 ${env === "production" ? "text-orange-400" : "text-[var(--color-muted)]"}`}>
                  {env === "production" ? <AlertCircle size={10} /> : <FlaskConical size={10} />}
                  {env === "production" ? "Live production" : "Sandbox / test"}
                </p>
              </div>
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden shrink-0">
                {(["sandbox", "production"] as const).map(e => (
                  <button key={e} onClick={() => setEnv(t.id, t.label, e)}
                    className={`text-[11px] font-semibold px-3 py-1.5 transition-colors ${env === e ? (e === "production" ? "bg-orange-500 text-white" : "bg-[var(--color-primary)] text-[var(--color-bg)]") : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                    {e === "sandbox" ? "Sandbox" : "Live"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <DemoNote>Demo: the environment switch is stored locally for planning only - no connector actually changes between test and live endpoints.</DemoNote>
    </section>
  );
}

// ── #185 POS System Connector ──────────────────────────────────────────────
// Link a point-of-sale system to auto-import daily sales into Headroom. Simulated import.
type PosLink = {
  id: string;
  provider: string;
  outletName: string;
  status: "connected" | "paused";
  lastImport: string | null;
  salesImported: number;
  connectedAt: string;
};
const POS_PROVIDERS = ["Petpooja", "PineLabs", "Posist", "Square", "Zomato POS", "Custom / CSV"] as const;

function PosSystemConnector() {
  const [links, setLinks] = useFeatureState<PosLink[]>("conn-pos-links", []);
  const [provider, setProvider] = useState<string>(POS_PROVIDERS[0]);
  const [outletName, setOutletName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const connect = () => {
    if (!outletName.trim()) { toast.error("Enter the outlet / store name"); return; }
    const link: PosLink = {
      id: generateId(), provider, outletName: outletName.trim(),
      status: "connected", lastImport: null, salesImported: 0,
      connectedAt: new Date().toISOString(),
    };
    setLinks(prev => [link, ...prev]);
    setOutletName("");
    toast.success(`${provider} linked for ${link.outletName} (simulated).`);
  };

  const importNow = async (id: string) => {
    setBusy(id);
    await new Promise(r => setTimeout(r, 1100));
    const amt = 5000 + Math.floor(Math.random() * 60000);
    setLinks(prev => prev.map(l => l.id === id
      ? { ...l, lastImport: new Date().toISOString(), salesImported: l.salesImported + amt } : l));
    setBusy(null);
    toast.success(`Imported ${formatCurrency(amt)} of sales (simulated).`);
  };

  const togglePause = (id: string) => setLinks(prev => prev.map(l => l.id === id
    ? { ...l, status: l.status === "connected" ? "paused" : "connected" } : l));
  const remove = (id: string) => setLinks(prev => prev.filter(l => l.id !== id));

  const totalImported = links.reduce((s, l) => s + l.salesImported, 0);

  return (
    <section id="conn-pos" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <CreditCard size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">POS System Connector</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{formatCurrency(totalImported)} imported · #185</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Link your point-of-sale to auto-import daily sales totals into Headroom - keeping revenue and cash reconciliation current per outlet.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select value={provider} onChange={e => setProvider(e.target.value)} className={FC_INP}>
          {POS_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={outletName} onChange={e => setOutletName(e.target.value)} placeholder="Outlet / store name" className={FC_INP} />
        <button onClick={connect} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold rounded-lg px-3 py-2">
          <PlugZap size={14} /> Connect POS
        </button>
      </div>

      <div className="space-y-2">
        {links.length === 0 && <p className="text-xs text-[var(--color-muted)] italic">No POS systems linked yet.</p>}
        {links.map(l => (
          <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{l.outletName} <span className="text-[var(--color-muted)] font-normal">· {l.provider}</span></p>
              <p className="text-[11px] text-[var(--color-muted)]">
                {l.status === "connected" ? "Connected" : "Paused"} · {l.lastImport ? `last import ${new Date(l.lastImport).toLocaleString()}` : "no imports yet"} · {formatCurrency(l.salesImported)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => importNow(l.id)} disabled={busy === l.id || l.status === "paused"} className="flex items-center gap-1 text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5 disabled:opacity-40">
                <RefreshCw size={12} className={busy === l.id ? "animate-spin" : ""} /> Import
              </button>
              <button onClick={() => togglePause(l.id)} className="text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5">{l.status === "connected" ? "Pause" : "Resume"}</button>
              <button onClick={() => remove(l.id)} className="text-[var(--color-muted)] hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <DemoNote>Demo: POS links and imported sales totals are simulated and stored locally - no real POS API is called.</DemoNote>
    </section>
  );
}

// ── #186 Payroll Software Connector ─────────────────────────────────────────
// Sync employee count & monthly payroll cost from external payroll tools. Simulated.
type PayrollLink = {
  id: string;
  provider: string;
  status: "connected" | "error";
  headcount: number;
  monthlyCost: number;
  lastSync: string | null;
  connectedAt: string;
};
const PAYROLL_PROVIDERS = ["RazorpayX Payroll", "Keka", "GreytHR", "Zoho Payroll", "Quikchex", "Manual / Spreadsheet"] as const;

function PayrollSoftwareConnector() {
  const [links, setLinks] = useFeatureState<PayrollLink[]>("conn-payroll-links", []);
  const [provider, setProvider] = useState<string>(PAYROLL_PROVIDERS[0]);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const connect = () => {
    if (!apiKey.trim()) { toast.error("Enter an API key / token"); return; }
    if (links.some(l => l.provider === provider)) { toast.error("That payroll provider is already linked"); return; }
    const link: PayrollLink = {
      id: generateId(), provider, status: "connected",
      headcount: 0, monthlyCost: 0, lastSync: null, connectedAt: new Date().toISOString(),
    };
    setLinks(prev => [link, ...prev]);
    setApiKey("");
    toast.success(`${provider} connected (simulated - key not stored).`);
  };

  const syncNow = async (id: string) => {
    setBusy(id);
    await new Promise(r => setTimeout(r, 1100));
    const headcount = 4 + Math.floor(Math.random() * 30);
    const monthlyCost = headcount * (25000 + Math.floor(Math.random() * 40000));
    setLinks(prev => prev.map(l => l.id === id
      ? { ...l, headcount, monthlyCost, status: "connected", lastSync: new Date().toISOString() } : l));
    setBusy(null);
    toast.success(`Synced ${headcount} employees · ${formatCurrency(monthlyCost)}/mo (simulated).`);
  };

  const remove = (id: string) => setLinks(prev => prev.filter(l => l.id !== id));
  const totalCost = links.reduce((s, l) => s + l.monthlyCost, 0);

  return (
    <section id="conn-payroll" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Wallet size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Payroll Software Connector</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{formatCurrency(totalCost)}/mo · #186</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Pull headcount and monthly payroll cost from your payroll platform so salary outflow flows straight into cash-flow and burn calculations.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select value={provider} onChange={e => setProvider(e.target.value)} className={FC_INP}>
          {PAYROLL_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API key / token" type="password" className={FC_INP} />
        <button onClick={connect} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold rounded-lg px-3 py-2">
          <PlugZap size={14} /> Connect
        </button>
      </div>

      <div className="space-y-2">
        {links.length === 0 && <p className="text-xs text-[var(--color-muted)] italic">No payroll software linked yet.</p>}
        {links.map(l => (
          <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{l.provider}</p>
              <p className="text-[11px] text-[var(--color-muted)]">
                {l.headcount} employees · {formatCurrency(l.monthlyCost)}/mo · {l.lastSync ? `synced ${new Date(l.lastSync).toLocaleString()}` : "not synced yet"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => syncNow(l.id)} disabled={busy === l.id} className="flex items-center gap-1 text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5 disabled:opacity-40">
                <RefreshCw size={12} className={busy === l.id ? "animate-spin" : ""} /> Sync
              </button>
              <button onClick={() => remove(l.id)} className="text-[var(--color-muted)] hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <DemoNote>Demo: payroll provider links, headcount and cost figures are simulated locally - no real payroll API is contacted and no key is stored.</DemoNote>
    </section>
  );
}

// ── #187 CRM Connector ──────────────────────────────────────────────────────
// Link a CRM to sync the sales pipeline value into revenue forecasting. Simulated.
type CrmLink = {
  id: string;
  provider: string;
  status: "connected" | "paused";
  openDeals: number;
  pipelineValue: number;
  lastSync: string | null;
  connectedAt: string;
};
const CRM_PROVIDERS = ["Zoho CRM", "HubSpot", "Salesforce", "Freshsales", "Pipedrive", "LeadSquared"] as const;

function CrmConnector() {
  const [links, setLinks] = useFeatureState<CrmLink[]>("conn-crm-links", []);
  const [provider, setProvider] = useState<string>(CRM_PROVIDERS[0]);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const connect = () => {
    if (!domain.trim()) { toast.error("Enter your CRM workspace / domain"); return; }
    const link: CrmLink = {
      id: generateId(), provider, status: "connected",
      openDeals: 0, pipelineValue: 0, lastSync: null, connectedAt: new Date().toISOString(),
    };
    setLinks(prev => [link, ...prev]);
    setDomain("");
    toast.success(`${provider} linked (simulated OAuth).`);
  };

  const syncNow = async (id: string) => {
    setBusy(id);
    await new Promise(r => setTimeout(r, 1100));
    const openDeals = 5 + Math.floor(Math.random() * 40);
    const pipelineValue = openDeals * (50000 + Math.floor(Math.random() * 300000));
    setLinks(prev => prev.map(l => l.id === id
      ? { ...l, openDeals, pipelineValue, lastSync: new Date().toISOString() } : l));
    setBusy(null);
    toast.success(`Synced ${openDeals} open deals · ${formatCurrency(pipelineValue)} pipeline (simulated).`);
  };

  const togglePause = (id: string) => setLinks(prev => prev.map(l => l.id === id
    ? { ...l, status: l.status === "connected" ? "paused" : "connected" } : l));
  const remove = (id: string) => setLinks(prev => prev.filter(l => l.id !== id));

  const totalPipeline = links.reduce((s, l) => s + l.pipelineValue, 0);

  return (
    <section id="conn-crm" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">CRM Connector</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{formatCurrency(totalPipeline)} pipeline · #187</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Connect your CRM to pull open-deal count and pipeline value into Headroom's revenue forecast - so projected cash reflects your real sales funnel.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select value={provider} onChange={e => setProvider(e.target.value)} className={FC_INP}>
          {CRM_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="Workspace / domain" className={FC_INP} />
        <button onClick={connect} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold rounded-lg px-3 py-2">
          <PlugZap size={14} /> Connect CRM
        </button>
      </div>

      <div className="space-y-2">
        {links.length === 0 && <p className="text-xs text-[var(--color-muted)] italic">No CRM linked yet.</p>}
        {links.map(l => (
          <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{l.provider} <span className={`font-normal ${l.status === "paused" ? "text-[var(--color-muted)]" : "text-emerald-400"}`}>· {l.status}</span></p>
              <p className="text-[11px] text-[var(--color-muted)]">
                {l.openDeals} open deals · {formatCurrency(l.pipelineValue)} · {l.lastSync ? `synced ${new Date(l.lastSync).toLocaleString()}` : "not synced yet"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => syncNow(l.id)} disabled={busy === l.id || l.status === "paused"} className="flex items-center gap-1 text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5 disabled:opacity-40">
                <RefreshCw size={12} className={busy === l.id ? "animate-spin" : ""} /> Sync
              </button>
              <button onClick={() => togglePause(l.id)} className="text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5">{l.status === "connected" ? "Pause" : "Resume"}</button>
              <button onClick={() => remove(l.id)} className="text-[var(--color-muted)] hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <DemoNote>Demo: CRM links, deal counts and pipeline values are simulated and stored locally - no real CRM OAuth or API call happens.</DemoNote>
    </section>
  );
}

// ── #188 Shipping / Logistics Connector ─────────────────────────────────────
// Link a courier aggregator to track shipments & COD remittance owed. Simulated.
type ShipLink = {
  id: string;
  provider: string;
  status: "connected" | "paused";
  activeShipments: number;
  codPending: number;
  lastSync: string | null;
  connectedAt: string;
};
const SHIP_PROVIDERS = ["Shiprocket", "Delhivery", "Blue Dart", "DTDC", "Ekart", "XpressBees"] as const;

function ShippingLogisticsConnector() {
  const [links, setLinks] = useFeatureState<ShipLink[]>("conn-shipping-links", []);
  const [provider, setProvider] = useState<string>(SHIP_PROVIDERS[0]);
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const connect = () => {
    if (!account.trim()) { toast.error("Enter your courier account / seller ID"); return; }
    if (links.some(l => l.provider === provider)) { toast.error("That courier is already linked"); return; }
    const link: ShipLink = {
      id: generateId(), provider, status: "connected",
      activeShipments: 0, codPending: 0, lastSync: null, connectedAt: new Date().toISOString(),
    };
    setLinks(prev => [link, ...prev]);
    setAccount("");
    toast.success(`${provider} linked (simulated).`);
  };

  const syncNow = async (id: string) => {
    setBusy(id);
    await new Promise(r => setTimeout(r, 1100));
    const activeShipments = Math.floor(Math.random() * 120);
    const codPending = activeShipments * (300 + Math.floor(Math.random() * 2000));
    setLinks(prev => prev.map(l => l.id === id
      ? { ...l, activeShipments, codPending, lastSync: new Date().toISOString() } : l));
    setBusy(null);
    toast.success(`${activeShipments} shipments in transit · ${formatCurrency(codPending)} COD owed (simulated).`);
  };

  const togglePause = (id: string) => setLinks(prev => prev.map(l => l.id === id
    ? { ...l, status: l.status === "connected" ? "paused" : "connected" } : l));
  const remove = (id: string) => setLinks(prev => prev.filter(l => l.id !== id));

  const totalCod = links.reduce((s, l) => s + l.codPending, 0);

  return (
    <section id="conn-shipping" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Truck size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Shipping / Logistics Connector</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{formatCurrency(totalCod)} COD owed · #188</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Link a courier aggregator to track in-transit shipments and COD remittance owed back to you - surfacing cash that's stuck in delivery as a receivable.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select value={provider} onChange={e => setProvider(e.target.value)} className={FC_INP}>
          {SHIP_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={account} onChange={e => setAccount(e.target.value)} placeholder="Courier account / seller ID" className={FC_INP} />
        <button onClick={connect} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold rounded-lg px-3 py-2">
          <PlugZap size={14} /> Connect
        </button>
      </div>

      <div className="space-y-2">
        {links.length === 0 && <p className="text-xs text-[var(--color-muted)] italic">No courier linked yet.</p>}
        {links.map(l => (
          <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{l.provider} <span className={`font-normal ${l.status === "paused" ? "text-[var(--color-muted)]" : "text-emerald-400"}`}>· {l.status}</span></p>
              <p className="text-[11px] text-[var(--color-muted)]">
                {l.activeShipments} in transit · {formatCurrency(l.codPending)} COD owed · {l.lastSync ? `synced ${new Date(l.lastSync).toLocaleString()}` : "not synced yet"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => syncNow(l.id)} disabled={busy === l.id || l.status === "paused"} className="flex items-center gap-1 text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5 disabled:opacity-40">
                <RefreshCw size={12} className={busy === l.id ? "animate-spin" : ""} /> Sync
              </button>
              <button onClick={() => togglePause(l.id)} className="text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5">{l.status === "connected" ? "Pause" : "Resume"}</button>
              <button onClick={() => remove(l.id)} className="text-[var(--color-muted)] hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <DemoNote>Demo: courier links, shipment counts and COD figures are simulated and stored locally - no real logistics API is contacted.</DemoNote>
    </section>
  );
}

// ── #189 E-Way Bill API Connector ─────────────────────────────────────────────────
// NIC E-Way Bill (EWB) GSP credential config + simulated EWB generation log.
// No real NIC/GSP call - generation and validity are simulated client-side.
type EwbEntry = { id: string; ewbNo: string; docNo: string; value: number; toState: string; validTill: string; createdAt: string };
const EWB_STATES = ["Maharashtra", "Karnataka", "Gujarat", "Delhi", "Tamil Nadu", "Uttar Pradesh", "West Bengal", "Telangana"] as const;

function EWayBillConnector() {
  const [creds, setCreds] = useFeatureState<{ gstin: string; gspUser: string; linked: boolean }>("conn-eway-creds", { gstin: "", gspUser: "", linked: false });
  const [entries, setEntries] = useFeatureState<EwbEntry[]>("conn-eway-entries", []);
  const [gstin, setGstin] = useState(creds.gstin);
  const [gspUser, setGspUser] = useState(creds.gspUser);
  const [docNo, setDocNo] = useState("");
  const [value, setValue] = useState("");
  const [toState, setToState] = useState<string>(EWB_STATES[0]);
  const [busy, setBusy] = useState(false);

  const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;

  const linkGsp = () => {
    if (!GSTIN_RE.test(gstin.trim().toUpperCase())) { toast.error("Enter a valid 15-character GSTIN"); return; }
    if (!gspUser.trim()) { toast.error("Enter your EWB portal / GSP username"); return; }
    setCreds({ gstin: gstin.trim().toUpperCase(), gspUser: gspUser.trim(), linked: true });
    toast.success("EWB GSP credentials linked (simulated).");
  };
  const unlink = () => { setCreds({ gstin: "", gspUser: "", linked: false }); toast.success("EWB credentials cleared."); };

  const generate = async () => {
    if (!creds.linked) { toast.error("Link your EWB GSP credentials first"); return; }
    const v = Number(value);
    if (!docNo.trim()) { toast.error("Enter the invoice / document number"); return; }
    if (!Number.isFinite(v) || v < 50000) { toast.error("EWB is required only for consignments above ₹50,000"); return; }
    setBusy(true);
    await new Promise(r => setTimeout(r, 1100));
    const ewbNo = String(Math.floor(1e11 + Math.random() * 9e11));
    const validTill = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    setEntries(prev => [{ id: generateId(), ewbNo, docNo: docNo.trim(), value: v, toState, validTill, createdAt: new Date().toISOString() }, ...prev]);
    setDocNo(""); setValue("");
    setBusy(false);
    toast.success(`E-Way Bill ${ewbNo} generated (simulated).`);
  };

  const cancel = (id: string) => setEntries(prev => prev.filter(e => e.id !== id));
  const totalValue = entries.reduce((s, e) => s + e.value, 0);

  return (
    <section id="conn-eway" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Route size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">E-Way Bill API Connector</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{entries.length} EWBs · {formatCurrency(totalValue)} · #189</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Link your NIC E-Way Bill portal via a GST Suvidha Provider (GSP) and auto-generate EWBs for consignments above ₹50,000 - keeping logistics compliant without re-keying invoice data.
      </p>

      {!creds.linked ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="GSTIN (27ABCDE1234F1Z5)" className={FC_INP} />
          <input value={gspUser} onChange={e => setGspUser(e.target.value)} placeholder="EWB portal / GSP username" className={FC_INP} />
          <button onClick={linkGsp} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold rounded-lg px-3 py-2">
            <PlugZap size={14} /> Link GSP
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-800/30 bg-emerald-900/20 gap-3">
          <p className="text-xs"><span className="font-semibold text-emerald-400">Linked</span> · {creds.gstin} · user {creds.gspUser}</p>
          <button onClick={unlink} className="text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5">Unlink</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input value={docNo} onChange={e => setDocNo(e.target.value)} placeholder="Invoice / doc no." className={FC_INP} />
        <input value={value} onChange={e => setValue(e.target.value)} placeholder="Consignment value ₹" inputMode="numeric" className={FC_INP} />
        <select value={toState} onChange={e => setToState(e.target.value)} className={FC_INP}>
          {EWB_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={generate} disabled={busy} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold rounded-lg px-3 py-2 disabled:opacity-40">
          <FileCheck2 size={14} className={busy ? "animate-pulse" : ""} /> Generate EWB
        </button>
      </div>

      <div className="space-y-2">
        {entries.length === 0 && <p className="text-xs text-[var(--color-muted)] italic">No E-Way Bills generated yet.</p>}
        {entries.map(e => (
          <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">EWB {e.ewbNo} <span className="font-normal text-[var(--color-muted)]">· {e.docNo}</span></p>
              <p className="text-[11px] text-[var(--color-muted)]">{formatCurrency(e.value)} → {e.toState} · valid till {new Date(e.validTill).toLocaleString()}</p>
            </div>
            <button onClick={() => cancel(e.id)} className="text-[var(--color-muted)] hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <DemoNote>Demo: no NIC / GSP call is made. EWB numbers, validity and the GSTIN check are simulated locally - never paste production GSP credentials here.</DemoNote>
    </section>
  );
}

// ── #190 Courier AWB / Label Connector ─────────────────────────────────────────────
// Generate simulated Air-Waybill numbers + shipping labels per courier API key.
// Distinct from the shipping tracker: this issues AWBs, not COD reconciliation.
type AwbShipment = { id: string; courier: string; awb: string; orderRef: string; weightKg: number; status: "manifested" | "picked_up" | "cancelled"; createdAt: string };
const AWB_COURIERS = ["Delhivery", "Blue Dart", "DTDC", "Ecom Express", "Shadowfax", "India Post"] as const;

function CourierAwbConnector() {
  const [apiKey, setApiKey] = useFeatureState<{ courier: string; key: string }>("conn-awb-key", { courier: AWB_COURIERS[0], key: "" });
  const [shipments, setShipments] = useFeatureState<AwbShipment[]>("conn-awb-shipments", []);
  const [keyDraft, setKeyDraft] = useState(apiKey.key);
  const [courier, setCourier] = useState<string>(apiKey.courier);
  const [orderRef, setOrderRef] = useState("");
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);

  const saveKey = () => {
    if (!keyDraft.trim()) { toast.error("Paste the courier API key"); return; }
    setApiKey({ courier, key: keyDraft.trim() });
    toast.success(`${courier} API key saved (simulated).`);
  };

  const book = async () => {
    if (!apiKey.key) { toast.error("Save a courier API key first"); return; }
    const w = Number(weight);
    if (!orderRef.trim()) { toast.error("Enter your order reference"); return; }
    if (!Number.isFinite(w) || w <= 0) { toast.error("Enter a valid weight in kg"); return; }
    setBusy(true);
    await new Promise(r => setTimeout(r, 1000));
    const awb = String(Math.floor(1e12 + Math.random() * 9e12));
    setShipments(prev => [{ id: generateId(), courier: apiKey.courier, awb, orderRef: orderRef.trim(), weightKg: w, status: "manifested", createdAt: new Date().toISOString() }, ...prev]);
    setOrderRef(""); setWeight("");
    setBusy(false);
    toast.success(`AWB ${awb} booked - label ready (simulated).`);
  };

  const markPicked = (id: string) => setShipments(prev => prev.map(s => s.id === id ? { ...s, status: "picked_up" } : s));
  const cancel = (id: string) => setShipments(prev => prev.map(s => s.id === id ? { ...s, status: "cancelled" } : s));
  const remove = (id: string) => setShipments(prev => prev.filter(s => s.id !== id));
  const downloadLabel = (s: AwbShipment) => toast.success(`Label PDF for AWB ${s.awb} downloaded (simulated).`);

  const active = shipments.filter(s => s.status !== "cancelled").length;

  return (
    <section id="conn-awb" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <PackageCheck size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Courier AWB / Label Connector</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{active} active AWBs · #190</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Plug in a courier's shipping API to generate Air-Waybill numbers and printable labels straight from an order - so dispatch and the books stay in lock-step.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select value={courier} onChange={e => setCourier(e.target.value)} className={FC_INP}>
          {AWB_COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={keyDraft} onChange={e => setKeyDraft(e.target.value)} type="password" placeholder="Courier API key" className={FC_INP} />
        <button onClick={saveKey} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold rounded-lg px-3 py-2">
          <KeyRound size={14} /> Save key
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="Order reference" className={FC_INP} />
        <input value={weight} onChange={e => setWeight(e.target.value)} placeholder="Weight (kg)" inputMode="decimal" className={FC_INP} />
        <button onClick={book} disabled={busy} className="flex items-center justify-center gap-1.5 border border-[var(--color-border)] text-sm font-semibold rounded-lg px-3 py-2 disabled:opacity-40">
          <PackageCheck size={14} className={busy ? "animate-pulse" : ""} /> Book AWB
        </button>
      </div>

      <div className="space-y-2">
        {shipments.length === 0 && <p className="text-xs text-[var(--color-muted)] italic">No AWBs generated yet.</p>}
        {shipments.map(s => (
          <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{s.courier} · AWB {s.awb} <span className={`font-normal ${s.status === "cancelled" ? "text-red-400" : "text-emerald-400"}`}>· {s.status.replace("_", " ")}</span></p>
              <p className="text-[11px] text-[var(--color-muted)]">{s.orderRef} · {s.weightKg} kg · {new Date(s.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => downloadLabel(s)} className="flex items-center gap-1 text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5"><Upload size={12} className="rotate-180" /> Label</button>
              {s.status === "manifested" && <button onClick={() => markPicked(s.id)} className="text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5">Mark picked</button>}
              {s.status !== "cancelled" && <button onClick={() => cancel(s.id)} className="text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5">Cancel</button>}
              <button onClick={() => remove(s.id)} className="text-[var(--color-muted)] hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <DemoNote>Demo: AWB numbers and label downloads are simulated locally - no courier shipping API is called and no real label is produced.</DemoNote>
    </section>
  );
}

// ── #191 WhatsApp BSP Connector ─────────────────────────────────────────────────────
// WhatsApp Business Solution Provider (Meta Cloud API / BSP) phone-number + template
// registration. Connection, OTP and template approval are all simulated locally.
type WaTemplate = { id: string; name: string; category: "MARKETING" | "UTILITY" | "AUTHENTICATION"; status: "pending" | "approved" | "rejected"; body: string };

function WhatsappBspConnector() {
  const [num, setNum] = useFeatureState<{ phone: string; wabaId: string; verified: boolean }>("conn-whatsapp-num", { phone: "", wabaId: "", verified: false });
  const [templates, setTemplates] = useFeatureState<WaTemplate[]>("conn-whatsapp-templates", []);
  const [phone, setPhone] = useState(num.phone);
  const [waba, setWaba] = useState(num.wabaId);
  const [tplName, setTplName] = useState("");
  const [tplCat, setTplCat] = useState<WaTemplate["category"]>("UTILITY");
  const [tplBody, setTplBody] = useState("");
  const [busy, setBusy] = useState(false);

  const register = async () => {
    if (!/^\+?[0-9]{10,15}$/.test(phone.trim())) { toast.error("Enter a valid WhatsApp business number"); return; }
    if (!waba.trim()) { toast.error("Enter your WABA (WhatsApp Business Account) ID"); return; }
    setBusy(true);
    await new Promise(r => setTimeout(r, 1000));
    setNum({ phone: phone.trim(), wabaId: waba.trim(), verified: true });
    setBusy(false);
    toast.success("Business number verified via BSP (simulated OTP).");
  };
  const disconnect = () => { setNum({ phone: "", wabaId: "", verified: false }); toast.success("WhatsApp number disconnected."); };

  const submitTemplate = () => {
    if (!num.verified) { toast.error("Register & verify a business number first"); return; }
    const name = tplName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!name) { toast.error("Enter a template name"); return; }
    if (!tplBody.trim()) { toast.error("Enter the template body"); return; }
    if (templates.some(t => t.name === name)) { toast.error("A template with that name already exists"); return; }
    setTemplates(prev => [{ id: generateId(), name, category: tplCat, status: "pending", body: tplBody.trim() }, ...prev]);
    setTplName(""); setTplBody("");
    toast.success(`Template "${name}" submitted for approval (simulated).`);
  };
  const approve = (id: string) => setTemplates(prev => prev.map(t => t.id === id ? { ...t, status: "approved" } : t));
  const remove = (id: string) => setTemplates(prev => prev.filter(t => t.id !== id));

  const approved = templates.filter(t => t.status === "approved").length;

  return (
    <section id="conn-whatsapp-bsp" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <MessageCircle size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">WhatsApp BSP Connector</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{approved}/{templates.length} templates live · #191</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Register your WhatsApp business number through a BSP (Meta Cloud API) and manage approved message templates - the channel used to send payment reminders and invoice links to customers.
      </p>

      {!num.verified ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Business number +91…" type="tel" className={FC_INP} />
          <input value={waba} onChange={e => setWaba(e.target.value)} placeholder="WABA ID" className={FC_INP} />
          <button onClick={register} disabled={busy} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold rounded-lg px-3 py-2 disabled:opacity-40">
            <PlugZap size={14} className={busy ? "animate-pulse" : ""} /> Register
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-800/30 bg-emerald-900/20 gap-3">
          <p className="text-xs"><span className="font-semibold text-emerald-400">Verified</span> · {num.phone} · WABA {num.wabaId}</p>
          <button onClick={disconnect} className="text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5">Disconnect</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Template name" className={FC_INP} />
        <select value={tplCat} onChange={e => setTplCat(e.target.value as WaTemplate["category"])} className={FC_INP}>
          {(["UTILITY", "MARKETING", "AUTHENTICATION"] as const).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={tplBody} onChange={e => setTplBody(e.target.value)} placeholder="Body, e.g. Hi {{1}}, your invoice…" className={FC_INP} />
        <button onClick={submitTemplate} className="flex items-center justify-center gap-1.5 border border-[var(--color-border)] text-sm font-semibold rounded-lg px-3 py-2">
          <Send size={14} /> Submit template
        </button>
      </div>

      <div className="space-y-2">
        {templates.length === 0 && <p className="text-xs text-[var(--color-muted)] italic">No message templates submitted yet.</p>}
        {templates.map(t => (
          <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{t.name} <span className="font-normal text-[var(--color-muted)]">· {t.category}</span> <span className={`font-normal ${t.status === "approved" ? "text-emerald-400" : t.status === "rejected" ? "text-red-400" : "text-yellow-400"}`}>· {t.status}</span></p>
              <p className="text-[11px] text-[var(--color-muted)] truncate">{t.body}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {t.status === "pending" && <button onClick={() => approve(t.id)} className="text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5">Approve</button>}
              <button onClick={() => remove(t.id)} className="text-[var(--color-muted)] hover:text-red-400 p-1.5"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <DemoNote>Demo: BSP registration, OTP verification and template approval are all simulated locally - no message is sent and no Meta / BSP API is contacted.</DemoNote>
    </section>
  );
}

// ── #192 FX Rate Feed Connector ─────────────────────────────────────────────────────
// Multi-currency exchange-rate provider config + simulated rate snapshot. Rates are
// generated client-side around plausible mid-points - not a live market feed.
type FxRate = { ccy: string; rate: number };
const FX_PROVIDERS = ["RBI Reference Rate", "Open Exchange Rates", "Fixer.io", "ExchangeRate-API", "Wise"] as const;
const FX_BASE: { ccy: string; mid: number }[] = [
  { ccy: "USD", mid: 83.2 }, { ccy: "EUR", mid: 90.1 }, { ccy: "GBP", mid: 105.4 },
  { ccy: "AED", mid: 22.7 }, { ccy: "SGD", mid: 61.8 }, { ccy: "AUD", mid: 55.3 },
];

function FxRateFeedConnector() {
  const [cfg, setCfg] = useFeatureState<{ provider: string; apiKey: string; linked: boolean; lastSync: string | null }>("conn-fx-cfg", { provider: FX_PROVIDERS[0], apiKey: "", linked: false, lastSync: null });
  const [rates, setRates] = useFeatureState<FxRate[]>("conn-fx-rates", []);
  const [provider, setProvider] = useState<string>(cfg.provider);
  const [keyDraft, setKeyDraft] = useState(cfg.apiKey);
  const [busy, setBusy] = useState(false);

  const link = () => {
    setCfg(prev => ({ ...prev, provider, apiKey: keyDraft.trim(), linked: true }));
    toast.success(`${provider} linked (simulated).`);
  };
  const unlink = () => { setCfg({ provider: FX_PROVIDERS[0], apiKey: "", linked: false, lastSync: null }); setRates([]); toast.success("FX feed disconnected."); };

  const refresh = async () => {
    if (!cfg.linked) { toast.error("Link a rate provider first"); return; }
    setBusy(true);
    await new Promise(r => setTimeout(r, 900));
    const next = FX_BASE.map(b => ({ ccy: b.ccy, rate: Number((b.mid * (1 + (Math.random() - 0.5) * 0.02)).toFixed(4)) }));
    setRates(next);
    setCfg(prev => ({ ...prev, lastSync: new Date().toISOString() }));
    setBusy(false);
    toast.success("FX rates refreshed (simulated snapshot).");
  };

  return (
    <section id="conn-fx-rates" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Globe size={16} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">FX Rate Feed Connector</h2>
        <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] px-1.5 py-0.5 rounded">{rates.length} pairs · #192</span>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
        Connect an exchange-rate provider to value foreign-currency invoices and bank balances in INR - pulling a daily INR mid-rate snapshot for every currency you trade in.
      </p>

      {!cfg.linked ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select value={provider} onChange={e => setProvider(e.target.value)} className={FC_INP}>
            {FX_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={keyDraft} onChange={e => setKeyDraft(e.target.value)} type="password" placeholder="API key (blank for RBI free feed)" className={FC_INP} />
          <button onClick={link} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold rounded-lg px-3 py-2">
            <PlugZap size={14} /> Link feed
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-800/30 bg-emerald-900/20 gap-3">
          <p className="text-xs"><span className="font-semibold text-emerald-400">Linked</span> · {cfg.provider} · {cfg.lastSync ? `synced ${new Date(cfg.lastSync).toLocaleString()}` : "not synced yet"}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={refresh} disabled={busy} className="flex items-center gap-1 text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5 disabled:opacity-40">
              <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={unlink} className="text-[11px] font-semibold border border-[var(--color-border)] rounded-lg px-2 py-1.5">Unlink</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {rates.length === 0 && <p className="text-xs text-[var(--color-muted)] italic col-span-full">No rates pulled yet.</p>}
        {rates.map(r => (
          <div key={r.ccy} className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
            <p className="text-[11px] text-[var(--color-muted)]">1 {r.ccy} =</p>
            <p className="text-sm font-semibold">{formatCurrency(r.rate)}</p>
          </div>
        ))}
      </div>

      <DemoNote>Demo: rates are generated client-side around illustrative mid-points and are NOT a live market feed - do not use them for actual settlement or accounting.</DemoNote>
    </section>
  );
}
