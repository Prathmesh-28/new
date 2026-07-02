import { useState, useMemo, useEffect, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { useT } from "@/i18n";
import { formatCurrency, monthlyBurn } from "@/lib/utils";
import { useFeatureState } from "@/hooks/useFeatureState";
import { api } from "@/lib/api";
import { AlertTriangle, Bell, Info, CheckCircle2, X, Settings2, SlidersHorizontal, CalendarClock, Droplets, ShieldAlert, BellOff, Mail, Users, FileText, Wallet, Boxes, ArrowUpRight, PieChart, Inbox, Layers, BadgeCheck, HandCoins, Repeat, Landmark, CheckCheck, Cloud, CloudOff } from "lucide-react";
import { toast } from "sonner";
import { addMonths, addQuarters, addYears } from "date-fns";

// ── Backend alert read-state sync ─────────────────────────────────────────────
// The Active/History UI renders from the synced client store (context), but alert
// read / resolved state is also persisted server-side via backend/src/routes/alerts.js
// so it survives across devices and matches the unread badge the rest of the app uses.
// Endpoints: GET /api/alerts, GET /api/alerts/unread-count, PATCH /api/alerts/:id,
// POST /api/alerts/mark-all-read. Everything is best-effort: if the backend is
// unreachable the page still works fully on the local KV store.
type ServerAlert = { id: string; is_read?: boolean; is_resolved?: boolean };
type AlertsListResponse = { data?: ServerAlert[]; total?: number };

const INP = "w-full text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 outline-none focus:border-[var(--color-primary)]";

const SEV: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  critical: { color: "text-red-400",    bg: "bg-red-950/20 border-red-800/40",     icon: AlertTriangle, label: "Critical" },
  high:     { color: "text-orange-400", bg: "bg-orange-950/20 border-orange-800/40", icon: AlertTriangle, label: "High" },
  medium:   { color: "text-yellow-400", bg: "bg-yellow-950/20 border-yellow-800/40", icon: Bell,          label: "Warning" },
  low:      { color: "text-blue-400",   bg: "bg-blue-950/20 border-blue-800/40",     icon: Info,          label: "Info" },
};

export default function AlertsPage() {
  const tr = useT();
  const { store, markAlertRead, deleteAlert, updateFirm, resolveAlert } = useApp();
  const { alerts, transactions } = store;
  const safetyDays = store.firm.safetyThresholdDays ?? 14;

  // Backend read-state sync. `synced` is null until the first probe completes,
  // then true (server reachable) or false (offline → KV-only fallback).
  const [synced, setSynced] = useState<boolean | null>(null);
  const [serverUnread, setServerUnread] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const refreshServerCount = useCallback(async () => {
    try {
      const r = await api.get<{ count: number }>("/api/alerts/unread-count");
      setServerUnread(typeof r?.count === "number" ? r.count : null);
      setSynced(true);
      return true;
    } catch {
      setSynced(false);
      return false;
    }
  }, []);

  // On mount, pull the server's read/resolved state and reconcile the local
  // store so a dismissal made on another device shows here too. Best-effort.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await refreshServerCount();
      if (!ok || cancelled) return;
      try {
        const r = await api.get<AlertsListResponse>("/api/alerts?limit=100");
        if (cancelled) return;
        const localById = new Map(store.alerts.map(a => [a.id, a]));
        for (const sa of r?.data ?? []) {
          const local = localById.get(sa.id);
          if (!local) continue;
          if ((sa.is_read || sa.is_resolved) && !local.isRead) markAlertRead(sa.id);
        }
      } catch {
        /* list pull optional - count probe already set synced */
      }
    })();
    return () => { cancelled = true; };
    // run once on mount; store/actions are stable refs from context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror a single read-state change to the backend (no-op on failure).
  const pushRead = useCallback(async (id: string, body: { is_read?: boolean; is_resolved?: boolean }) => {
    try {
      await api.patch(`/api/alerts/${encodeURIComponent(id)}`, body);
      void refreshServerCount();
    } catch {
      setSynced(false);
    }
  }, [refreshServerCount]);

  const markAllRead = async () => {
    if (active.length === 0) return;
    setMarkingAll(true);
    // Optimistically clear locally; the context update is the source of truth for render.
    active.forEach(a => markAlertRead(a.id));
    try {
      const r = await api.post<{ updated: number }>("/api/alerts/mark-all-read", {});
      toast.success(`Marked ${r?.updated ?? active.length} alert${(r?.updated ?? active.length) === 1 ? "" : "s"} as read`);
      void refreshServerCount();
    } catch {
      setSynced(false);
      toast.success("Marked all read on this device (offline - will not sync)");
    } finally {
      setMarkingAll(false);
    }
  };

  const [tab,         setTab]         = useState<"active" | "history" | "thresholds" | "compliance" | "liquidity" | "fraud" | "mute" | "digest" | "escalation" | "receivables" | "payables" | "kpi" | "inventory" | "largetxn" | "budget" | "concentration" | "inbox" | "licenses" | "emicover" | "recurring" | "taxsetaside">("active");
  const [showConfig,  setShowConfig]  = useState(false);
  const [newThreshold, setNewThreshold] = useState(String(safetyDays));
  const [actionText,  setActionText]  = useState<Record<string, string>>({});

  const burn = monthlyBurn(transactions);
  const safetyBuffer = (burn / 30) * safetyDays;

  const active   = alerts.filter(a => !a.isRead).sort((a, b) => {
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4);
  });
  const history  = alerts.filter(a => a.isRead);

  const critical = active.filter(a => a.severity === "critical");
  const high     = active.filter(a => a.severity === "high");
  const medium   = active.filter(a => a.severity === "medium");
  const low      = active.filter(a => a.severity === "low");

  const handleMarkResolved = (id: string) => {
    // Persist the note the user typed (was previously computed then dropped, so
    // the history's "✓ {actionTaken}" line never showed what was done).
    resolveAlert(id, actionText[id]);
    void pushRead(id, { is_read: true, is_resolved: true });
    toast.success("Alert marked as resolved");
    setActionText(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleDismiss = (id: string) => {
    markAlertRead(id);
    void pushRead(id, { is_read: true });
    toast.success("Alert dismissed");
  };

  // History delete has no backend equivalent (no DELETE route); mark it read on
  // the server so it stays out of the cross-device unread count, then drop locally.
  const handleDelete = (id: string) => {
    void pushRead(id, { is_read: true });
    deleteAlert(id);
  };

  const handleSaveThreshold = () => {
    const val = parseInt(newThreshold);
    if (isNaN(val) || val < 1 || val > 180) { toast.error("Enter a value between 1 and 180 days"); return; }
    updateFirm({ safetyThresholdDays: val });
    toast.success(`Safety buffer updated to ${val} days`);
    setShowConfig(false);
  };

  const AlertCard = ({ a }: { a: typeof alerts[0] }) => {
    const { color, bg, icon: Icon, label } = SEV[a.severity] ?? SEV.low;
    return (
      <div className={`rounded-lg border px-4 py-3.5 ${bg}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <Icon size={15} className={`${color} mt-0.5 shrink-0`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{new Date(a.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {a.title && <p className="text-sm font-semibold mb-0.5">{a.title}</p>}
              <p className="text-sm text-[var(--color-muted)] leading-snug">{a.message}</p>
              <div className="flex items-center gap-2 mt-2">
                <input
                  value={actionText[a.id] ?? ""}
                  onChange={e => setActionText(prev => ({ ...prev, [a.id]: e.target.value }))}
                  placeholder="Log action taken (optional)…"
                  className="flex-1 text-xs bg-black/20 border border-[var(--color-border)] rounded-lg px-2.5 py-1 outline-none focus:border-[var(--color-primary)]"
                />
                <button onClick={() => handleMarkResolved(a.id)}
                  className="flex items-center gap-1 text-xs bg-green-900/40 text-green-400 border border-green-800/40 px-2 py-1 rounded-lg hover:bg-green-900/60 whitespace-nowrap">
                  <CheckCircle2 size={11} /> Resolve
                </button>
                <button onClick={() => handleDismiss(a.id)}
                  className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)] rounded-lg hover:bg-black/20">
                  <X size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Section = ({ title, items, colorCls }: { title: string; items: typeof alerts; colorCls: string }) => {
    if (items.length === 0) return null;
    return (
      <div>
        <h2 className={`text-xs font-bold uppercase tracking-wider mb-2 ${colorCls}`}>{title} ({items.length})</h2>
        <div className="space-y-2">
          {items.map(a => <AlertCard key={a.id} a={a} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{tr("alerts.title")}</h1>
            {synced === true && (
              <span title={`Synced to your account${serverUnread != null ? ` · ${serverUnread} unread server-side` : ""}`}
                className="inline-flex items-center gap-1 text-[10px] text-green-400 border border-green-800/40 bg-green-950/20 px-1.5 py-0.5 rounded-full">
                <Cloud size={10} /> Synced
              </span>
            )}
            {synced === false && (
              <span title="Backend unreachable - read-state is kept on this device only"
                className="inline-flex items-center gap-1 text-[10px] text-[var(--color-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">
                <CloudOff size={10} /> Offline
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">{active.length} active · {history.length} resolved</p>
        </div>
        <div className="flex items-center gap-2">
          {active.length > 0 && (
            <button onClick={markAllRead} disabled={markingAll}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40 disabled:opacity-50">
              <CheckCheck size={12} /> {tr("alerts.markAllRead")}
            </button>
          )}
          <button onClick={() => setShowConfig(v => !v)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
            <Settings2 size={12} /> {tr("alerts.configure")}
          </button>
        </div>
      </div>

      {/* Safety buffer config */}
      {showConfig && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Alert Threshold Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Safety buffer (days of expenses)</label>
              <div className="flex items-center gap-3">
                <input type="range" min="7" max="60" value={newThreshold} onChange={e => setNewThreshold(e.target.value)}
                  className="flex-1 accent-[var(--color-primary)]" />
                <span className="text-sm font-bold text-[var(--color-primary)] w-16 text-right">{newThreshold} days</span>
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Current buffer = {formatCurrency(safetyBuffer)} ({safetyDays} days × daily burn)
              </p>
            </div>
            <div className="space-y-1 text-xs text-[var(--color-muted)]">
              <p><strong className="text-[var(--color-text)]">Critical</strong> - balance goes negative within 30 days → in-app + email + WhatsApp</p>
              <p><strong className="text-[var(--color-text)]">Warning</strong> - below safety buffer within 45 days → in-app + email</p>
              <p><strong className="text-[var(--color-text)]">Info</strong> - unusual spend detected → in-app only</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveThreshold} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold text-sm px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowConfig(false)} className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-[var(--color-accent)]">Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {([
          ["active",     `${tr("alerts.tab.active")} (${active.length})`,     Bell],
          ["history",    `${tr("alerts.tab.resolved")} (${history.length})`,  CheckCircle2],
          ["thresholds", "Threshold Builder",             SlidersHorizontal],
          ["compliance", "Compliance Due-Dates",          CalendarClock],
          ["liquidity",  "Cash-Low / Overdraft",          Droplets],
          ["fraud",      "Fraud / Anomaly",               ShieldAlert],
          ["mute",       "Snooze / Mute",                 BellOff],
          ["digest",     "Alert Digest",                  Mail],
          ["escalation", "Escalation Rules",              Users],
          ["receivables","Overdue Receivables",           FileText],
          ["payables",   "Payment-Due Alerts",            Wallet],
          ["kpi",        "KPI Target Alerts",             SlidersHorizontal],
          ["inventory",  "Low-Stock Alerts",              Boxes],
          ["largetxn",   "Large-Transaction",             ArrowUpRight],
          ["budget",     "Budget-Overrun",                Layers],
          ["concentration", "Customer Concentration",     PieChart],
          ["inbox",      "Priority Inbox",                Inbox],
          ["licenses",   "Licence Expiry",                BadgeCheck],
          ["emicover",   "EMI Coverage",                  HandCoins],
          ["recurring",  "Recurring-Spend Watch",         Repeat],
          ["taxsetaside","Tax Set-Aside",                 Landmark],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Active alerts */}
      {tab === "active" && (
        <>
          {active.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
              <CheckCircle2 size={28} className="mx-auto mb-3 text-green-400 opacity-50" />
              <h2 className="text-base font-semibold mb-1">{tr("alerts.empty.title")}</h2>
              <p className="text-sm text-[var(--color-muted)]">{tr("alerts.empty.subtitle")}</p>
            </div>
          ) : (
            <div className="space-y-5">
              <Section title="Critical" items={critical} colorCls="text-red-400" />
              <Section title="High"     items={high}     colorCls="text-orange-400" />
              <Section title="Warning"  items={medium}   colorCls="text-yellow-400" />
              <Section title="Info"     items={low}      colorCls="text-blue-400" />
            </div>
          )}
        </>
      )}

      {/* History */}
      {tab === "history" && (
        <>
          {history.length === 0 ? (
            <p className="text-center py-10 text-sm text-[var(--color-muted)]">No resolved alerts yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map(a => {
                const { color, bg, label } = SEV[a.severity] ?? SEV.low;
                return (
                  <div key={a.id} className={`rounded-lg border px-4 py-3 opacity-60 ${bg}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
                        <span className="text-[10px] text-[var(--color-muted)] ml-2">{new Date(a.createdAt).toLocaleDateString("en-IN")}</span>
                        {a.title && <p className="text-sm font-semibold mt-0.5">{a.title}</p>}
                        <p className="text-xs text-[var(--color-muted)]">{a.message}</p>
                        {a.actionTaken && <p className="text-xs text-[var(--color-muted)] italic mt-1">✓ {a.actionTaken}</p>}
                      </div>
                      <button onClick={() => handleDelete(a.id)} className="p-1 text-[var(--color-muted)] hover:text-red-400 rounded">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "thresholds"  && <ThresholdAlertBuilder />}
      {tab === "compliance"  && <ComplianceDueDateAlerts />}
      {tab === "liquidity"   && <CashLowOverdraftAlert />}
      {tab === "fraud"       && <FraudAnomalyAlerts />}
      {tab === "mute"        && <SnoozeMuteConfig />}
      {tab === "digest"      && <AlertDigestScheduler />}
      {tab === "escalation"  && <EscalationRules />}
      {tab === "receivables" && <OverdueReceivablesAlerts />}
      {tab === "payables"    && <PaymentDueAlerts />}
      {tab === "kpi"         && <KpiTargetAlerts />}
      {tab === "inventory"   && <LowStockAlerts />}
      {tab === "largetxn"    && <LargeTransactionAlerts />}
      {tab === "budget"      && <BudgetOverrunAlerts />}
      {tab === "concentration" && <CustomerConcentrationAlerts />}
      {tab === "inbox"       && <PriorityInbox />}
      {tab === "licenses"    && <LicenceExpiryAlerts />}
      {tab === "emicover"    && <EmiCoverageAlerts />}
      {tab === "recurring"   && <RecurringSpendWatch />}
      {tab === "taxsetaside" && <TaxSetAsideAlerts />}
    </div>
  );
}

// ── #182 Smart Threshold Alert Builder ───────────────────────────────────────────
// "Alert me when metric X crosses Y" - user-defined rules persisted via
// useFeatureState and evaluated live against the synced store every render.
type Metric = "balance" | "burn" | "runway" | "revenue30" | "expense30";
type Op = "below" | "above";
type ThresholdRule = { id: string; metric: Metric; op: Op; value: number; createdAt: string };

const METRICS: Record<Metric, { label: string; unit: "money" | "days"; help: string }> = {
  balance:   { label: "Total bank balance",        unit: "money", help: "Sum of all connected bank-account balances." },
  burn:      { label: "Monthly burn",              unit: "money", help: "Net cash outflow over the last 30 days, annualised to a month." },
  runway:    { label: "Runway",                    unit: "days",  help: "Days of cash left at current burn." },
  revenue30: { label: "Revenue (last 30 days)",    unit: "money", help: "Total revenue-category inflow in the last 30 days." },
  expense30: { label: "Expense (last 30 days)",    unit: "money", help: "Total expense + payroll outflow in the last 30 days." },
};

function ThresholdAlertBuilder() {
  const { store } = useApp();
  const [rules, setRules] = useFeatureState<ThresholdRule[]>("alert-threshold-rules", []);
  const [metric, setMetric] = useState<Metric>("balance");
  const [op, setOp] = useState<Op>("below");
  const [value, setValue] = useState("");
  const fc = formatCurrency;

  const live = useMemo(() => {
    const txns = store.transactions ?? [];
    const balance = (store.bankAccounts ?? []).reduce((s, a) => s + (a.balance || 0), 0);
    const burn = monthlyBurn(txns);
    const runway = burn > 0 ? Math.round(balance / (burn / 30)) : 9999;
    const cutoff = Date.now() - 30 * 86400000;
    const recent = txns.filter(t => new Date(t.date).getTime() >= cutoff);
    const revenue30 = recent.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const expense30 = recent.filter(t => t.category === "expense" || t.category === "payroll").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    return { balance, burn, runway, revenue30, expense30 } as Record<Metric, number>;
  }, [store.transactions, store.bankAccounts]);

  const fmtVal = (m: Metric, v: number) => METRICS[m].unit === "days" ? `${v} days` : fc(v);

  const add = () => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) { toast.error("Enter a valid threshold value"); return; }
    setRules(prev => [...prev, { id: crypto.randomUUID(), metric, op, value: num, createdAt: new Date().toISOString() }]);
    setValue("");
    toast.success("Threshold rule added");
  };

  const breached = (r: ThresholdRule) => r.op === "below" ? live[r.metric] < r.value : live[r.metric] > r.value;
  const triggered = rules.filter(breached);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><SlidersHorizontal size={14} className="text-[var(--color-primary)]" /> Smart Threshold Alert Builder</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Define your own rules - "alert me when balance is below ₹5,00,000" or "runway below 60 days". Each rule is evaluated live against your latest synced data, so a breach shows up the moment your numbers cross the line.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Metric</label>
            <select value={metric} onChange={e => setMetric(e.target.value as Metric)} className={INP}>
              {(Object.keys(METRICS) as Metric[]).map(m => <option key={m} value={m}>{METRICS[m].label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Condition</label>
            <select value={op} onChange={e => setOp(e.target.value as Op)} className={INP}>
              <option value="below">crosses below</option>
              <option value="above">crosses above</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Value ({METRICS[metric].unit === "days" ? "days" : "₹"})</label>
            <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder={METRICS[metric].unit === "days" ? "e.g. 60" : "e.g. 500000"} className={INP} />
          </div>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add rule</button>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] mt-2">{METRICS[metric].help} Current value: <span className="text-[var(--color-text)] font-medium tabular-nums">{fmtVal(metric, live[metric])}</span></p>
      </div>

      {rules.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Rule", "Threshold", "Current", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rules.map(r => {
                const hit = breached(r);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{METRICS[r.metric].label} {r.op === "below" ? "below" : "above"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fmtVal(r.metric, r.value)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fmtVal(r.metric, live[r.metric])}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${hit ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{hit ? "Breached" : "OK"}</span>
                    </td>
                    <td className="px-3 py-2.5"><button onClick={() => setRules(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="text-center py-8 text-sm text-[var(--color-muted)]">No rules yet - add one above to start monitoring a metric.</p>}

      {triggered.length > 0 && (
        <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {triggered.length} rule{triggered.length > 1 ? "s" : ""} breached right now</p>
          <ul className="text-xs text-[var(--color-muted)] mt-1.5 space-y-0.5 list-disc list-inside">
            {triggered.map(r => <li key={r.id}>{METRICS[r.metric].label} is {fmtVal(r.metric, live[r.metric])} ({r.op} {fmtVal(r.metric, r.value)})</li>)}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Rules persist and sync across your devices. Evaluation is on the latest store snapshot - connect more bank feeds for a complete balance picture.</p>
    </div>
  );
}

// ── #183 Compliance Due-Date Alerts ──────────────────────────────────────────────
// Escalating reminders before statutory deadlines. Recurring obligations have an
// auto-rolling next due-date; the closer the deadline the higher the urgency band.
type ComplianceItem = { id: string; name: string; dueDate: string; recurrence: "once" | "monthly" | "quarterly" | "annual" };

function ComplianceDueDateAlerts() {
  const [items, setItems] = useFeatureState<ComplianceItem[]>("compliance-due-items", []);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<ComplianceItem["recurrence"]>("monthly");

  const PRESETS: { name: string; recurrence: ComplianceItem["recurrence"] }[] = [
    { name: "GSTR-3B filing", recurrence: "monthly" },
    { name: "GSTR-1 filing", recurrence: "monthly" },
    { name: "TDS payment", recurrence: "monthly" },
    { name: "PF & ESI deposit", recurrence: "monthly" },
    { name: "TDS return (24Q/26Q)", recurrence: "quarterly" },
    { name: "Advance tax instalment", recurrence: "quarterly" },
    { name: "ROC AOC-4 / MGT-7", recurrence: "annual" },
    { name: "Income-tax return", recurrence: "annual" },
  ];

  const addPreset = (p: { name: string; recurrence: ComplianceItem["recurrence"] }) => {
    setName(p.name); setRecurrence(p.recurrence);
  };

  const add = () => {
    if (!name || !dueDate) { toast.error("Enter a name and next due date"); return; }
    setItems(prev => [...prev, { id: crypto.randomUUID(), name, dueDate, recurrence }]);
    setName(""); setDueDate("");
    toast.success("Compliance deadline added");
  };

  // Roll a recurring item's due date forward to the next cycle after it lapses.
  const rollForward = (item: ComplianceItem) => {
    let d = new Date(item.dueDate);
    if (isNaN(d.getTime())) { toast.error("Invalid due date"); return; }
    const step = (base: Date): Date =>
      item.recurrence === "monthly" ? addMonths(base, 1)
      : item.recurrence === "quarterly" ? addQuarters(base, 1)
      : item.recurrence === "annual" ? addYears(base, 1)
      : base;
    if (item.recurrence !== "monthly" && item.recurrence !== "quarterly" && item.recurrence !== "annual") return;
    // Roll forward (date-fns clamps to month-end, avoiding Jan31→Mar overflow)
    // until the new due date is no longer in the past - covers multiple lapsed cycles.
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
    do { d = step(d); } while (d.getTime() < cutoff.getTime());
    setItems(prev => prev.map(x => x.id === item.id ? { ...x, dueDate: d.toISOString().split("T")[0] } : x));
    toast.success(`${item.name} rolled to next cycle`);
  };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysTo = (d: string) => Math.round((new Date(d).getTime() - today.getTime()) / 86400000);
  // Escalating reminder bands by days remaining.
  const band = (days: number) => days < 0 ? { sev: "critical", color: "text-red-400", bg: "bg-red-950/20 border-red-800/40", label: "Overdue" }
    : days <= 3 ? { sev: "high", color: "text-orange-400", bg: "bg-orange-950/20 border-orange-800/40", label: "Due ≤3 days" }
    : days <= 7 ? { sev: "medium", color: "text-yellow-400", bg: "bg-yellow-950/20 border-yellow-800/40", label: "Due this week" }
    : days <= 30 ? { sev: "low", color: "text-blue-400", bg: "bg-blue-950/20 border-blue-800/40", label: "Upcoming" }
    : { sev: "ok", color: "text-[var(--color-muted)]", bg: "bg-[var(--color-surface)] border-[var(--color-border)]", label: "Scheduled" };

  const sorted = [...items].sort((a, b) => daysTo(a.dueDate) - daysTo(b.dueDate));
  const urgent = sorted.filter(i => daysTo(i.dueDate) <= 7).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Compliance Due-Date Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track statutory deadlines with escalating reminders - Upcoming → Due this week → Due ≤3 days → Overdue. Recurring items roll forward to the next cycle once filed.</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PRESETS.map(p => <button key={p.name} onClick={() => addPreset(p)} className="text-[11px] bg-[var(--color-accent)] border border-[var(--color-border)] px-2 py-1 rounded-lg hover:border-[var(--color-primary)]/40">{p.name}</button>)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Obligation *" className={INP} />
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INP} />
          <select value={recurrence} onChange={e => setRecurrence(e.target.value as ComplianceItem["recurrence"])} className={INP}>
            <option value="once">One-time</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add deadline</button>
        </div>
      </div>

      {urgent > 0 && (
        <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20">
          <p className="text-sm font-bold text-orange-400 flex items-center gap-2"><AlertTriangle size={14} /> {urgent} deadline{urgent > 1 ? "s" : ""} due within 7 days</p>
        </div>
      )}

      {sorted.length > 0 ? (
        <div className="space-y-2">
          {sorted.map(i => {
            const days = daysTo(i.dueDate);
            const b = band(days);
            return (
              <div key={i.id} className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${b.bg}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${b.color}`}>{b.label}</span>
                    <span className="text-[10px] text-[var(--color-muted)] capitalize">{i.recurrence}</span>
                  </div>
                  <p className="text-sm font-semibold mt-0.5">{i.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">Due {new Date(i.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "due today" : `in ${days} days`}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {i.recurrence !== "once" && <button onClick={() => rollForward(i)} className="text-[11px] bg-green-900/40 text-green-400 border border-green-800/40 px-2 py-1 rounded-lg hover:bg-green-900/60 whitespace-nowrap">Filed → next</button>}
                  <button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))} className="p-1 text-[var(--color-muted)] hover:text-red-400 rounded"><X size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className="text-center py-8 text-sm text-[var(--color-muted)]">No deadlines tracked - add one above or pick a preset.</p>}
      <p className="text-[10px] text-[var(--color-muted)]">Reminders escalate automatically as the date approaches. Verify exact statutory due dates with your CA - they shift with extensions and weekends/holidays.</p>
    </div>
  );
}

// ── #184 Cash-Low / Overdraft Alert ──────────────────────────────────────────────
// Proactive liquidity warnings derived from live bank balances + burn, plus
// per-account overdraft detection and a user-set minimum-balance floor.
function CashLowOverdraftAlert() {
  const { store } = useApp();
  const [floorInput, setFloorInput] = useFeatureState<string>("liquidity-min-floor", "");
  const fc = formatCurrency;

  const data = useMemo(() => {
    const accts = store.bankAccounts ?? [];
    const balance = accts.reduce((s, a) => s + (a.balance || 0), 0);
    const burn = monthlyBurn(store.transactions ?? []);
    const dailyBurn = burn / 30;
    const runway = dailyBurn > 0 ? Math.round(balance / dailyBurn) : 9999;
    const overdrawn = accts.filter(a => (a.balance || 0) < 0);
    return { accts, balance, burn, dailyBurn, runway, overdrawn };
  }, [store.bankAccounts, store.transactions]);

  const floor = parseFloat(floorInput) || 0;
  const daysToFloor = data.dailyBurn > 0 ? Math.round((data.balance - floor) / data.dailyBurn) : 9999;

  const warnings: { sev: "critical" | "high" | "medium"; text: string }[] = [];
  if (data.overdrawn.length > 0) warnings.push({ sev: "critical", text: `${data.overdrawn.length} account(s) overdrawn: ${data.overdrawn.map(a => `${a.name} (${fc(a.balance)})`).join(", ")}` });
  if (data.balance < 0) warnings.push({ sev: "critical", text: `Aggregate cash is negative at ${fc(data.balance)}.` });
  else if (data.runway <= 14) warnings.push({ sev: "critical", text: `Only ${data.runway} days of runway left at current burn.` });
  else if (data.runway <= 30) warnings.push({ sev: "high", text: `Runway is ${data.runway} days - below the 30-day comfort line.` });
  if (floor > 0 && data.balance < floor) warnings.push({ sev: "high", text: `Balance ${fc(data.balance)} is below your minimum floor of ${fc(floor)}.` });
  else if (floor > 0 && daysToFloor <= 30 && daysToFloor >= 0) warnings.push({ sev: "medium", text: `At current burn you hit your ${fc(floor)} floor in ${daysToFloor} days.` });

  const SEVCLS = { critical: "text-red-400 bg-red-950/20 border-red-800/40", high: "text-orange-400 bg-orange-950/20 border-orange-800/40", medium: "text-yellow-400 bg-yellow-950/20 border-yellow-800/40" };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Droplets size={14} className="text-[var(--color-primary)]" /> Cash-Low / Overdraft Alert</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Proactive liquidity warnings from your live bank balances and burn rate - flags overdrawn accounts, thin runway, and how long until you hit a minimum-balance floor you set.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Minimum-balance floor (₹) - optional</label>
          <input type="number" value={floorInput} onChange={e => setFloorInput(e.target.value)} placeholder="e.g. 200000" className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total balance", value: fc(data.balance), color: data.balance < 0 ? "text-red-400" : data.balance < floor ? "text-orange-400" : "text-green-400" },
          { label: "Monthly burn", value: fc(data.burn), color: "text-[var(--color-text)]" },
          { label: "Runway", value: data.runway >= 9999 ? "∞" : `${data.runway} days`, color: data.runway <= 14 ? "text-red-400" : data.runway <= 30 ? "text-orange-400" : "text-green-400" },
          { label: floor > 0 ? "Days to floor" : "Accounts", value: floor > 0 ? (daysToFloor >= 9999 ? "∞" : `${Math.max(daysToFloor, 0)} days`) : String(data.accts.length), color: floor > 0 && daysToFloor <= 30 ? "text-orange-400" : "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {warnings.length > 0 ? (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className={`rounded-lg border px-4 py-3 flex items-start gap-2.5 ${SEVCLS[w.sev]}`}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <p className="text-sm leading-snug">{w.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">Liquidity is healthy - no accounts overdrawn and runway is comfortable.</p>
        </div>
      )}

      {data.accts.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Account", "Provider", "Balance"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.accts.map(a => (
                <tr key={a.id}>
                  <td className="px-4 py-2.5 text-xs font-medium">{a.name}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{a.provider}</td>
                  <td className={`px-4 py-2.5 text-xs tabular-nums font-semibold ${(a.balance || 0) < 0 ? "text-red-400" : ""}`}>{fc(a.balance || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Runway uses last-30-day burn - seasonal or one-off outflows can distort it. Set a floor that covers payroll + statutory dues for at least one cycle.</p>
    </div>
  );
}

// ── #185 Fraud / Anomaly Alerts ──────────────────────────────────────────────────
// Heuristic anomaly detection over transactions: outsized payments, brand-new
// payees, and round-trips (money out and back with the same counterparty).
function FraudAnomalyAlerts() {
  const { store } = useApp();
  const [sigmaInput, setSigmaInput] = useState("2.5");
  const fc = formatCurrency;
  const sigma = parseFloat(sigmaInput) || 2.5;

  const findings = useMemo(() => {
    const txns = (store.transactions ?? []).filter(t => t.category !== "transfer");
    const outflows = txns.filter(t => (t.amount || 0) < 0);
    const amts = outflows.map(t => Math.abs(t.amount || 0));
    const mean = amts.length ? amts.reduce((s, v) => s + v, 0) / amts.length : 0;
    const sd = amts.length ? Math.sqrt(amts.reduce((s, v) => s + (v - mean) ** 2, 0) / amts.length) : 0;
    const threshold = mean + sigma * sd;

    // Outsized payments - beyond mean + N·σ.
    const outsized = outflows.filter(t => Math.abs(t.amount || 0) > threshold && sd > 0)
      .map(t => ({ id: t.id, kind: "Large payment" as const, party: t.counterparty || t.description, detail: `${fc(Math.abs(t.amount))} - ${((Math.abs(t.amount) - mean) / (sd || 1)).toFixed(1)}σ above your average outflow`, date: t.date }));

    // New payees - counterparty first seen within the last 30 days.
    const firstSeen = new Map<string, number>();
    [...txns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(t => {
      const cp = (t.counterparty || "").trim();
      if (cp && !firstSeen.has(cp)) firstSeen.set(cp, new Date(t.date).getTime());
    });
    const cutoff = Date.now() - 30 * 86400000;
    const newPayees = outflows.filter(t => {
      const cp = (t.counterparty || "").trim();
      return cp && (firstSeen.get(cp) ?? 0) >= cutoff;
    }).map(t => ({ id: t.id, kind: "New payee" as const, party: t.counterparty, detail: `First payment to this payee - ${fc(Math.abs(t.amount))}`, date: t.date }));

    // Round-trips - a counterparty with both inflow and outflow (money cycled).
    const byParty = new Map<string, { in: number; out: number }>();
    txns.forEach(t => {
      const cp = (t.counterparty || "").trim();
      if (!cp) return;
      const e = byParty.get(cp) ?? { in: 0, out: 0 };
      if ((t.amount || 0) >= 0) e.in += t.amount || 0; else e.out += Math.abs(t.amount || 0);
      byParty.set(cp, e);
    });
    const roundTrips = [...byParty.entries()]
      .filter(([, v]) => v.in > 0 && v.out > 0)
      .map(([party, v]) => ({ id: `rt-${party}`, kind: "Round-trip" as const, party, detail: `Both paid (${fc(v.out)}) and received (${fc(v.in)}) - possible circular flow`, date: "" }));

    const flaggedManual = txns.filter(t => t.flagged)
      .map(t => ({ id: `fl-${t.id}`, kind: "Manually flagged" as const, party: t.counterparty || t.description, detail: `${fc(Math.abs(t.amount || 0))} - flagged for review`, date: t.date }));

    return { mean, sd, threshold, all: [...outsized, ...newPayees, ...roundTrips, ...flaggedManual] };
  }, [store.transactions, sigma]);

  const KCLS: Record<string, string> = {
    "Large payment": "text-red-400 bg-red-950/20 border-red-800/40",
    "New payee": "text-yellow-400 bg-yellow-950/20 border-yellow-800/40",
    "Round-trip": "text-orange-400 bg-orange-950/20 border-orange-800/40",
    "Manually flagged": "text-blue-400 bg-blue-950/20 border-blue-800/40",
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Fraud / Anomaly Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Scans your transactions for unusual patterns - outsized payments (statistical outliers), brand-new payees, and round-trips where money flows out and back to the same party. Tune the outlier sensitivity below.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Outlier sensitivity (σ above average): {sigma}</label>
          <input type="range" min="1.5" max="4" step="0.5" value={sigmaInput} onChange={e => setSigmaInput(e.target.value)} className="w-full accent-[var(--color-primary)]" />
          <p className="text-[11px] text-[var(--color-muted)] mt-1">Avg outflow {fc(Math.round(findings.mean))} · flag above {fc(Math.round(findings.threshold))}</p>
        </div>
      </div>

      {findings.all.length > 0 ? (
        <>
          <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20">
            <p className="text-sm font-bold text-orange-400 flex items-center gap-2"><AlertTriangle size={14} /> {findings.all.length} anomal{findings.all.length > 1 ? "ies" : "y"} detected for review</p>
          </div>
          <div className="space-y-2">
            {findings.all.map(f => (
              <div key={f.id} className={`rounded-lg border px-4 py-3 ${KCLS[f.kind] ?? KCLS["New payee"]}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider">{f.kind}</span>
                  {f.date && <span className="text-[10px] text-[var(--color-muted)]">{new Date(f.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>}
                </div>
                <p className="text-sm font-semibold">{f.party || "Unknown party"}</p>
                <p className="text-xs text-[var(--color-muted)]">{f.detail}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">No anomalies at this sensitivity - lower the σ threshold to scan more aggressively.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Heuristic detection - outliers and new payees are often legitimate (a large vendor settlement, a new supplier). Treat these as a review queue, not proof of fraud. Inter-account transfers are excluded.</p>
    </div>
  );
}

// ── Snooze / Mute Config ─────────────────────────────────────────────────────────
// Mute whole alert categories (by `type`) for a chosen window. Active mutes hide
// matching live alerts and auto-expire; nothing is deleted, only suppressed.
type MuteRule = { id: string; type: string; until: string; createdAt: string };

function SnoozeMuteConfig() {
  const { store } = useApp();
  const [rules, setRules] = useFeatureState<MuteRule[]>("alr-mute-rules", []);
  const [type, setType] = useState("");
  const [hours, setHours] = useState("24");

  // Distinct alert types currently present, so the user mutes real categories.
  const types = useMemo(() => {
    const s = new Set<string>();
    (store.alerts ?? []).forEach(a => { if (a.type) s.add(a.type); });
    return [...s].sort();
  }, [store.alerts]);

  const now = Date.now();
  const active = rules.filter(r => new Date(r.until).getTime() > now);
  const isMuted = (t: string) => active.some(r => r.type === t);

  const add = () => {
    const t = type || types[0];
    if (!t) { toast.error("No alert types available to mute"); return; }
    const h = parseInt(hours);
    if (isNaN(h) || h < 1) { toast.error("Enter a valid number of hours"); return; }
    const until = new Date(now + h * 3600000).toISOString();
    setRules(prev => [...prev.filter(r => r.type !== t), { id: crypto.randomUUID(), type: t, until, createdAt: new Date().toISOString() }]);
    toast.success(`Muted "${t}" for ${h}h`);
  };

  const liveActive = (store.alerts ?? []).filter(a => !a.isRead);
  const suppressed = liveActive.filter(a => isMuted(a.type)).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><BellOff size={14} className="text-[var(--color-primary)]" /> Snooze / Mute Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Temporarily silence a noisy alert category - say you already know runway is tight and don't want the reminder every few hours. Mutes auto-expire after the window you set; the underlying alert is never deleted.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Alert type</label>
            <select value={type} onChange={e => setType(e.target.value)} className={INP}>
              {types.length === 0 && <option value="">No alert types yet</option>}
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Mute for (hours)</label>
            <select value={hours} onChange={e => setHours(e.target.value)} className={INP}>
              {["1", "4", "8", "24", "72", "168"].map(h => <option key={h} value={h}>{h === "168" ? "1 week" : h === "72" ? "3 days" : h === "24" ? "1 day" : `${h} hours`}</option>)}
            </select>
          </div>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Mute category</button>
        </div>
        {suppressed > 0 && <p className="text-[11px] text-[var(--color-muted)] mt-2">{suppressed} active alert{suppressed > 1 ? "s are" : " is"} currently suppressed by your mute rules.</p>}
      </div>

      {active.length > 0 ? (
        <div className="space-y-2">
          {active.map(r => {
            const mins = Math.round((new Date(r.until).getTime() - now) / 60000);
            const rem = mins >= 1440 ? `${Math.round(mins / 1440)}d` : mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}m`;
            return (
              <div key={r.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{r.type}</p>
                  <p className="text-xs text-[var(--color-muted)]">Muted until {new Date(r.until).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {rem} left</p>
                </div>
                <button onClick={() => setRules(prev => prev.filter(x => x.id !== r.id))} className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] px-2 py-1 rounded-lg">Unmute</button>
              </div>
            );
          })}
        </div>
      ) : <p className="text-center py-8 text-sm text-[var(--color-muted)]">No active mutes - all alert categories are live.</p>}
      <p className="text-[10px] text-[var(--color-muted)]">Muting suppresses notifications, not the condition itself. Critical liquidity alerts will still surface on the dashboard.</p>
    </div>
  );
}

// ── Alert Digest Scheduler ───────────────────────────────────────────────────────
// Configure a daily/weekly roll-up email of unread alerts, plus a live preview of
// what the next digest would contain based on the current store.
function AlertDigestScheduler() {
  const { store } = useApp();
  const [enabled, setEnabled] = useFeatureState<boolean>("alr-digest-enabled", false);
  const [freq, setFreq] = useFeatureState<"daily" | "weekly">("alr-digest-freq", "daily");
  const [hour, setHour] = useFeatureState<string>("alr-digest-hour", "9");
  const [channel, setChannel] = useFeatureState<"email" | "whatsapp" | "both">("alr-digest-channel", "email");

  const unread = (store.alerts ?? []).filter(a => !a.isRead);
  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>;
    unread.forEach(a => { c[a.severity] = (c[a.severity] ?? 0) + 1; });
    return c;
  }, [store.alerts]);

  const save = () => { toast.success(`Digest ${enabled ? "scheduled" : "disabled"}`); };
  const hourLabel = (h: number) => h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Mail size={14} className="text-[var(--color-primary)]" /> Alert Digest Scheduler</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Instead of a ping per alert, get one tidy roll-up at a fixed time. Pick daily or weekly, the delivery hour, and the channel. The preview below shows what your next digest would carry right now.</p>
        <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="accent-[var(--color-primary)]" />
          <span className="text-sm font-medium">Send me a periodic alert digest</span>
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Frequency</label>
            <select value={freq} onChange={e => setFreq(e.target.value as "daily" | "weekly")} disabled={!enabled} className={INP}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (Monday)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Delivery hour</label>
            <select value={hour} onChange={e => setHour(e.target.value)} disabled={!enabled} className={INP}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={String(h)}>{hourLabel(h)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as "email" | "whatsapp" | "both")} disabled={!enabled} className={INP}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="both">Email + WhatsApp</option>
            </select>
          </div>
        </div>
        <button onClick={save} className="mt-3 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save schedule</button>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">Next digest preview {enabled && <span className="text-[var(--color-primary)] normal-case">· {freq}, {hourLabel(parseInt(hour) || 0)}, via {channel}</span>}</p>
        {unread.length === 0 ? (
          <p className="text-sm text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> No unread alerts - your digest would be empty.</p>
        ) : (
          <>
            <p className="text-sm mb-3"><span className="font-bold">{unread.length}</span> unread alert{unread.length > 1 ? "s" : ""}: <span className="text-red-400">{counts.critical} critical</span> · <span className="text-orange-400">{counts.high} high</span> · <span className="text-yellow-400">{counts.medium} warning</span> · <span className="text-blue-400">{counts.low} info</span></p>
            <ul className="space-y-1.5">
              {unread.slice(0, 6).map(a => (
                <li key={a.id} className="text-xs text-[var(--color-muted)] flex items-start gap-2">
                  <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${SEV[a.severity]?.color.replace("text-", "bg-")}`} />
                  <span><span className="text-[var(--color-text)] font-medium">{a.title || a.type}</span> - {a.message}</span>
                </li>
              ))}
              {unread.length > 6 && <li className="text-xs text-[var(--color-muted)]">…and {unread.length - 6} more</li>}
            </ul>
          </>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Digest settings persist and sync across devices. Critical alerts are still delivered immediately regardless of digest timing.</p>
    </div>
  );
}

// ── Escalation Rules ─────────────────────────────────────────────────────────────
// Define who gets notified at each severity tier (recipient + channel), so a
// critical cash event reaches the founder while routine info stays with finance.
type EscalationRule = { id: string; severity: "critical" | "high" | "medium" | "low"; recipient: string; channel: "email" | "whatsapp" | "call"; createdAt: string };

function EscalationRules() {
  const { store } = useApp();
  const [rules, setRules] = useFeatureState<EscalationRule[]>("alr-escalation-rules", []);
  const [severity, setSeverity] = useState<EscalationRule["severity"]>("critical");
  const [recipient, setRecipient] = useState("");
  const [channel, setChannel] = useState<EscalationRule["channel"]>("whatsapp");

  const activeBySev = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>;
    (store.alerts ?? []).filter(a => !a.isRead).forEach(a => { c[a.severity] = (c[a.severity] ?? 0) + 1; });
    return c;
  }, [store.alerts]);

  const add = () => {
    if (!recipient.trim()) { toast.error("Enter a recipient name or contact"); return; }
    setRules(prev => [...prev, { id: crypto.randomUUID(), severity, recipient: recipient.trim(), channel, createdAt: new Date().toISOString() }]);
    setRecipient("");
    toast.success("Escalation rule added");
  };

  const ORDER: EscalationRule["severity"][] = ["critical", "high", "medium", "low"];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Escalation Rules</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Route alerts to the right people by severity - a critical cash shortfall pings the founder on WhatsApp, while routine info stays with your accountant over email. Add one or more recipients per tier.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Severity</label>
            <select value={severity} onChange={e => setSeverity(e.target.value as EscalationRule["severity"])} className={INP}>
              {ORDER.map(s => <option key={s} value={s}>{SEV[s]?.label ?? s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Notify</label>
            <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Name / phone / email" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as EscalationRule["channel"])} className={INP}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="call">Phone call</option>
            </select>
          </div>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add rule</button>
        </div>
      </div>

      <div className="space-y-3">
        {ORDER.map(sev => {
          const tier = rules.filter(r => r.severity === sev);
          const sevMeta = SEV[sev];
          return (
            <div key={sev} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${sevMeta?.color}`}>{sevMeta?.label ?? sev}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{activeBySev[sev] ?? 0} active now · {tier.length} recipient{tier.length === 1 ? "" : "s"}</span>
              </div>
              {tier.length > 0 ? (
                <div className="space-y-1.5">
                  {tier.map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                      <span><span className="font-medium">{r.recipient}</span> <span className="text-[var(--color-muted)] capitalize">· {r.channel}</span></span>
                      <button onClick={() => setRules(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-[var(--color-muted)] italic">No recipients - alerts at this tier go to in-app only.</p>}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Rules persist and sync. Phone-call escalation requires a connected voice provider; WhatsApp uses your verified business number.</p>
    </div>
  );
}

// ── Overdue Receivables Alerts ───────────────────────────────────────────────────
// Live aging of unpaid invoices into buckets, with a configurable "alert me when
// overdue exceeds" amount so AR drift surfaces before it bites cashflow.
function OverdueReceivablesAlerts() {
  const { store } = useApp();
  const [thresholdInput, setThresholdInput] = useFeatureState<string>("alr-recv-threshold", "");
  const fc = formatCurrency;

  const data = useMemo(() => {
    const today = Date.now();
    const open = (store.invoices ?? []).filter(i => i.status !== "paid");
    const buckets = { current: 0, b1: 0, b30: 0, b60: 0, b90: 0 };
    const overdueRows: { id: string; customer: string; amount: number; days: number }[] = [];
    let overdueTotal = 0;
    open.forEach(i => {
      const days = Math.round((today - new Date(i.dueDate).getTime()) / 86400000);
      const amt = i.amount || 0;
      if (days <= 0) buckets.current += amt;
      else {
        overdueTotal += amt;
        overdueRows.push({ id: i.id, customer: i.customer, amount: amt, days });
        if (days <= 30) buckets.b1 += amt;
        else if (days <= 60) buckets.b30 += amt;
        else if (days <= 90) buckets.b60 += amt;
        else buckets.b90 += amt;
      }
    });
    overdueRows.sort((a, b) => b.days - a.days);
    return { open, buckets, overdueRows, overdueTotal };
  }, [store.invoices]);

  const threshold = parseFloat(thresholdInput) || 0;
  const breached = threshold > 0 && data.overdueTotal > threshold;

  const BUCKETS = [
    { label: "Not yet due", value: data.buckets.current, color: "text-green-400" },
    { label: "1-30 days", value: data.buckets.b1, color: "text-yellow-400" },
    { label: "31-60 days", value: data.buckets.b30, color: "text-orange-400" },
    { label: "61-90 days", value: data.buckets.b60, color: "text-orange-400" },
    { label: "90+ days", value: data.buckets.b90, color: "text-red-400" },
  ];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> Overdue Receivables Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Watches your open invoices and ages them automatically. Set a ceiling for total overdue AR and we flag the moment it's crossed - so slipping collections never quietly drain your runway.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Alert when total overdue exceeds (₹) - optional</label>
          <input type="number" value={thresholdInput} onChange={e => setThresholdInput(e.target.value)} placeholder="e.g. 500000" className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {BUCKETS.map(b => (
          <div key={b.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{b.label}</p>
            <p className={`text-base font-bold tabular-nums ${b.value > 0 ? b.color : "text-[var(--color-muted)]"}`}>{fc(b.value)}</p>
          </div>
        ))}
      </div>

      {breached ? (
        <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400 leading-snug">Total overdue AR is {fc(data.overdueTotal)} - above your {fc(threshold)} alert ceiling.</p>
        </div>
      ) : data.overdueTotal > 0 ? (
        <div className="rounded-lg border border-orange-800/40 bg-orange-950/20 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle size={14} className="text-orange-400 mt-0.5 shrink-0" />
          <p className="text-sm text-orange-400 leading-snug">{fc(data.overdueTotal)} across {data.overdueRows.length} invoice{data.overdueRows.length > 1 ? "s" : ""} is overdue.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-green-800/40 bg-green-950/20 px-4 py-3 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">No overdue invoices - collections are on track.</p>
        </div>
      )}

      {data.overdueRows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Customer", "Overdue by", "Amount"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.overdueRows.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 text-xs font-medium">{r.customer}</td>
                  <td className={`px-4 py-2.5 text-xs ${r.days > 90 ? "text-red-400" : r.days > 30 ? "text-orange-400" : "text-yellow-400"}`}>{r.days} days</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums font-semibold">{fc(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Aging uses each invoice's due date against today. Mark invoices paid in Receivables to clear them from this view.</p>
    </div>
  );
}

// ── Payment-Due Alerts ───────────────────────────────────────────────────────────
// Upcoming outflow obligations (loans, tax, payroll, other) with a configurable
// look-ahead window so you can pre-fund what's about to leave your account.
function PaymentDueAlerts() {
  const { store } = useApp();
  const [windowInput, setWindowInput] = useFeatureState<string>("alr-payable-window", "14");
  const fc = formatCurrency;
  const lookAhead = Math.max(parseInt(windowInput) || 14, 1);

  const data = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const horizon = today.getTime() + lookAhead * 86400000;
    const rows = (store.obligations ?? []).map(o => ({
      ...o,
      days: Math.round((new Date(o.dueDate).getTime() - today.getTime()) / 86400000),
    }));
    const overdue = rows.filter(o => o.days < 0).sort((a, b) => a.days - b.days);
    const upcoming = rows.filter(o => o.days >= 0 && new Date(o.dueDate).getTime() <= horizon).sort((a, b) => a.days - b.days);
    const dueSoon = [...overdue, ...upcoming];
    const total = dueSoon.reduce((s, o) => s + (o.amount || 0), 0);
    return { dueSoon, total, overdueCount: overdue.length };
  }, [store.obligations, lookAhead]);

  const TYPECLS: Record<string, string> = {
    loan: "text-orange-400", tax: "text-red-400", payroll: "text-blue-400", other: "text-[var(--color-muted)]",
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Payment-Due Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Surfaces loan EMIs, tax payments, payroll and other obligations falling due inside a window you choose - so you can pre-fund the account before money leaves. Overdue items are always shown.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Look-ahead window (days)</label>
          <input type="number" value={windowInput} onChange={e => setWindowInput(e.target.value)} placeholder="14" className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Due in {lookAhead} days</p>
          <p className="text-lg font-bold tabular-nums">{fc(data.total)}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Obligations</p>
          <p className="text-lg font-bold tabular-nums">{data.dueSoon.length}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Overdue</p>
          <p className={`text-lg font-bold tabular-nums ${data.overdueCount > 0 ? "text-red-400" : "text-green-400"}`}>{data.overdueCount}</p>
        </div>
      </div>

      {data.dueSoon.length > 0 ? (
        <div className="space-y-2">
          {data.dueSoon.map(o => (
            <div key={o.id} className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${o.days < 0 ? "bg-red-950/20 border-red-800/40" : o.days <= 3 ? "bg-orange-950/20 border-orange-800/40" : "bg-[var(--color-surface)] border-[var(--color-border)]"}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{o.name}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${TYPECLS[o.type] ?? TYPECLS.other}`}>{o.type}</span>
                </div>
                <p className="text-xs text-[var(--color-muted)]">{o.days < 0 ? `${Math.abs(o.days)} days overdue` : o.days === 0 ? "due today" : `due in ${o.days} days`} · {new Date(o.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
              </div>
              <span className="text-sm font-bold tabular-nums shrink-0">{fc(o.amount || 0)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-green-800/40 bg-green-950/20 px-4 py-3 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">Nothing due in the next {lookAhead} days.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Obligations come from your scheduled outflows. Add loan EMIs and statutory dues so this stays a complete picture of what's leaving your account.</p>
    </div>
  );
}

// ── KPI Target Alerts ────────────────────────────────────────────────────────────
// Set targets on core operating KPIs (gross margin, monthly revenue, expense ratio)
// and get a pass/miss read computed live from the last-30-day transaction window.
type KpiKey = "revenue30" | "margin" | "expenseRatio" | "newRevenueShare";
type KpiTarget = { id: string; kpi: KpiKey; goal: "atLeast" | "atMost"; value: number; createdAt: string };

const KPIS: Record<KpiKey, { label: string; unit: "money" | "pct"; help: string }> = {
  revenue30:       { label: "Revenue (30d)",        unit: "money", help: "Total revenue booked in the last 30 days." },
  margin:          { label: "Gross margin %",       unit: "pct",   help: "(Revenue − expenses) ÷ revenue over the last 30 days." },
  expenseRatio:    { label: "Expense ratio %",      unit: "pct",   help: "Expenses as a share of revenue over the last 30 days." },
  newRevenueShare: { label: "Recurring revenue %",  unit: "pct",   help: "Share of last-30-day revenue tagged as recurring." },
};

function KpiTargetAlerts() {
  const { store } = useApp();
  const [targets, setTargets] = useFeatureState<KpiTarget[]>("alr-kpi-targets", []);
  const [kpi, setKpi] = useState<KpiKey>("revenue30");
  const [goal, setGoal] = useState<KpiTarget["goal"]>("atLeast");
  const [value, setValue] = useState("");
  const fc = formatCurrency;

  const live = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const recent = (store.transactions ?? []).filter(t => new Date(t.date).getTime() >= cutoff);
    const revenue30 = recent.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const expense30 = recent.filter(t => t.category === "expense" || t.category === "payroll").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const recurringRev = recent.filter(t => t.category === "revenue" && t.isRecurring).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const margin = revenue30 > 0 ? ((revenue30 - expense30) / revenue30) * 100 : 0;
    const expenseRatio = revenue30 > 0 ? (expense30 / revenue30) * 100 : 0;
    const newRevenueShare = revenue30 > 0 ? (recurringRev / revenue30) * 100 : 0;
    return { revenue30, margin, expenseRatio, newRevenueShare } as Record<KpiKey, number>;
  }, [store.transactions]);

  const fmt = (k: KpiKey, v: number) => KPIS[k].unit === "money" ? fc(v) : `${v.toFixed(1)}%`;

  const add = () => {
    const num = parseFloat(value);
    if (isNaN(num)) { toast.error("Enter a target value"); return; }
    setTargets(prev => [...prev, { id: crypto.randomUUID(), kpi, goal, value: num, createdAt: new Date().toISOString() }]);
    setValue("");
    toast.success("KPI target added");
  };

  const missed = (t: KpiTarget) => t.goal === "atLeast" ? live[t.kpi] < t.value : live[t.kpi] > t.value;
  const missing = targets.filter(missed);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><SlidersHorizontal size={14} className="text-[var(--color-primary)]" /> KPI Target Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Set goals on the operating metrics that matter - "revenue at least ₹10L/month" or "gross margin at least 40%" - and see a live pass/miss read computed from your last-30-day transactions.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">KPI</label>
            <select value={kpi} onChange={e => setKpi(e.target.value as KpiKey)} className={INP}>
              {(Object.keys(KPIS) as KpiKey[]).map(k => <option key={k} value={k}>{KPIS[k].label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Goal</label>
            <select value={goal} onChange={e => setGoal(e.target.value as KpiTarget["goal"])} className={INP}>
              <option value="atLeast">at least</option>
              <option value="atMost">at most</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Target ({KPIS[kpi].unit === "money" ? "₹" : "%"})</label>
            <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder={KPIS[kpi].unit === "money" ? "e.g. 1000000" : "e.g. 40"} className={INP} />
          </div>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add target</button>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] mt-2">{KPIS[kpi].help} Current: <span className="text-[var(--color-text)] font-medium tabular-nums">{fmt(kpi, live[kpi])}</span></p>
      </div>

      {targets.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["KPI", "Target", "Current", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {targets.map(t => {
                const miss = missed(t);
                return (
                  <tr key={t.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{KPIS[t.kpi].label} {t.goal === "atLeast" ? "≥" : "≤"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fmt(t.kpi, t.value)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fmt(t.kpi, live[t.kpi])}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${miss ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{miss ? "Missing" : "On track"}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setTargets(prev => prev.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="text-center py-8 text-sm text-[var(--color-muted)]">No KPI targets yet - add one above to start tracking.</p>}

      {missing.length > 0 && (
        <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {missing.length} KPI target{missing.length > 1 ? "s" : ""} off track</p>
          <ul className="text-xs text-[var(--color-muted)] mt-1.5 space-y-0.5 list-disc list-inside">
            {missing.map(t => <li key={t.id}>{KPIS[t.kpi].label} is {fmt(t.kpi, live[t.kpi])} (target {t.goal === "atLeast" ? "≥" : "≤"} {fmt(t.kpi, t.value)})</li>)}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">KPIs use a rolling 30-day transaction window - margin and ratios need revenue in that window to be meaningful. Targets persist and sync across devices.</p>
    </div>
  );
}

// ── Low-Stock Alerts ─────────────────────────────────────────────────────────────
// Watches inventory quantity against each item's reorder level, with an optional
// safety-buffer multiplier so you re-order before you actually hit the floor.
function LowStockAlerts() {
  const { store } = useApp();
  const [bufferInput, setBufferInput] = useFeatureState<string>("alr-stock-buffer", "1");
  const fc = formatCurrency;
  const buffer = Math.max(parseFloat(bufferInput) || 1, 1);

  const data = useMemo(() => {
    const items = store.inventory ?? [];
    const rows = items.map(i => {
      const trigger = (i.reorderLevel || 0) * buffer;
      const out = i.quantity <= 0;
      const low = !out && i.quantity <= trigger && trigger > 0;
      const shortfall = Math.max(trigger - i.quantity, 0);
      return { ...i, trigger, out, low, shortfall, exposure: shortfall * (i.unitCost || 0) };
    });
    const flagged = rows.filter(r => r.out || r.low).sort((a, b) => (a.out === b.out ? a.quantity - b.quantity : a.out ? -1 : 1));
    const reorderCost = flagged.reduce((s, r) => s + r.exposure, 0);
    return { total: items.length, flagged, outCount: rows.filter(r => r.out).length, reorderCost };
  }, [store.inventory, buffer]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Boxes size={14} className="text-[var(--color-primary)]" /> Low-Stock Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Flags every SKU that has fallen to or below its reorder level so you replenish before a stock-out costs you a sale. Add a safety multiplier to trigger earlier when lead times are long.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Safety multiplier on reorder level: {buffer}×</label>
          <input type="range" min="1" max="3" step="0.25" value={bufferInput} onChange={e => setBufferInput(e.target.value)} className="w-full accent-[var(--color-primary)]" />
          <p className="text-[11px] text-[var(--color-muted)] mt-1">An item with reorder level 50 alerts at quantity ≤ {Math.round(50 * buffer)}.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Items tracked", value: String(data.total), color: "text-[var(--color-text)]" },
          { label: "Need re-order", value: String(data.flagged.length), color: data.flagged.length > 0 ? "text-orange-400" : "text-green-400" },
          { label: "Out of stock", value: String(data.outCount), color: data.outCount > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {data.flagged.length > 0 ? (
        <>
          <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20">
            <p className="text-sm font-bold text-orange-400 flex items-center gap-2"><AlertTriangle size={14} /> {data.flagged.length} SKU{data.flagged.length > 1 ? "s" : ""} at or below reorder level · est. re-order cost {fc(Math.round(data.reorderCost))}</p>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Product", "SKU", "On hand", "Reorder at", "Status"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.flagged.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.productName}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.sku}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${r.out ? "text-red-400" : "text-orange-400"}`}>{r.quantity} {r.unit}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{Math.round(r.trigger)} {r.unit}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${r.out ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-orange-900/30 text-orange-400 border-orange-800/40"}`}>{r.out ? "Out" : "Low"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">{data.total === 0 ? "No inventory tracked yet - add items in Operations to monitor stock." : "All SKUs are above their reorder level."}</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Re-order cost estimates the spend to refill back to the trigger quantity at last-known unit cost. Set realistic reorder levels per SKU in Operations for sharper alerts.</p>
    </div>
  );
}

// ── Large-Transaction Alerts ─────────────────────────────────────────────────────
// Flags any single transaction above an amount you set, scoped by direction
// (outflow / inflow / either), so big money movements never slip past unnoticed.
function LargeTransactionAlerts() {
  const { store } = useApp();
  const [amountInput, setAmountInput] = useFeatureState<string>("alr-largetxn-amount", "100000");
  const [direction, setDirection] = useFeatureState<"out" | "in" | "either">("alr-largetxn-dir", "out");
  const fc = formatCurrency;
  const threshold = parseFloat(amountInput) || 0;

  const matches = useMemo(() => {
    const txns = (store.transactions ?? []).filter(t => t.category !== "transfer");
    return txns
      .filter(t => {
        const amt = t.amount || 0;
        if (direction === "out" && amt >= 0) return false;
        if (direction === "in" && amt < 0) return false;
        return Math.abs(amt) >= threshold && threshold > 0;
      })
      .sort((a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0))
      .slice(0, 50);
  }, [store.transactions, threshold, direction]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ArrowUpRight size={14} className="text-[var(--color-primary)]" /> Large-Transaction Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Get a heads-up on any single transaction above a threshold you set - a hard rupee floor rather than a statistical outlier. Useful for sign-off on big vendor payments or spotting an unexpectedly large inflow.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Alert when amount is at least (₹)</label>
            <input type="number" value={amountInput} onChange={e => setAmountInput(e.target.value)} placeholder="e.g. 100000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Direction</label>
            <select value={direction} onChange={e => setDirection(e.target.value as "out" | "in" | "either")} className={INP}>
              <option value="out">Outflows (money leaving)</option>
              <option value="in">Inflows (money in)</option>
              <option value="either">Either direction</option>
            </select>
          </div>
        </div>
      </div>

      {matches.length > 0 ? (
        <>
          <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20">
            <p className="text-sm font-bold text-orange-400 flex items-center gap-2"><AlertTriangle size={14} /> {matches.length} transaction{matches.length > 1 ? "s" : ""} at or above {fc(threshold)}{matches.length >= 50 ? " (showing top 50)" : ""}</p>
          </div>
          <div className="space-y-2">
            {matches.map(t => {
              const out = (t.amount || 0) < 0;
              return (
                <div key={t.id} className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${out ? "bg-red-950/20 border-red-800/40" : "bg-green-950/20 border-green-800/40"}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{t.counterparty || t.description}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">{t.category}</span>
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">{new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{t.description && t.counterparty ? ` · ${t.description}` : ""}</p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${out ? "text-red-400" : "text-green-400"}`}>{out ? "−" : "+"}{fc(Math.abs(t.amount || 0))}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">{threshold <= 0 ? "Set a threshold above to start flagging large transactions." : `No transactions at or above ${fc(threshold)} in this direction.`}</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Inter-account transfers are excluded so internal sweeps don't trigger. This is a fixed-amount rule - use Fraud / Anomaly for statistical outlier detection.</p>
    </div>
  );
}

// ── Budget-Overrun Alerts ────────────────────────────────────────────────────────
// Compares each budget's monthly limit against actual last-30-day spend in that
// category, flagging overruns and a configurable "approaching" warning band.
function BudgetOverrunAlerts() {
  const { store } = useApp();
  const [warnInput, setWarnInput] = useFeatureState<string>("alr-budget-warn", "80");
  const fc = formatCurrency;
  const warnPct = Math.min(Math.max(parseFloat(warnInput) || 80, 1), 100);

  const rows = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const recent = (store.transactions ?? []).filter(t => new Date(t.date).getTime() >= cutoff && (t.amount || 0) < 0);
    const spentByCat = new Map<string, number>();
    recent.forEach(t => spentByCat.set(t.category, (spentByCat.get(t.category) ?? 0) + Math.abs(t.amount || 0)));
    return (store.budgets ?? []).map(b => {
      const spent = spentByCat.get(b.category) ?? 0;
      const limit = b.monthlyLimit || 0;
      const pct = limit > 0 ? (spent / limit) * 100 : 0;
      const over = limit > 0 && spent > limit;
      const near = !over && pct >= warnPct;
      return { ...b, spent, limit, pct, over, near };
    }).sort((a, b) => b.pct - a.pct);
  }, [store.transactions, store.budgets, warnPct]);

  const overCount = rows.filter(r => r.over).length;
  const nearCount = rows.filter(r => r.near).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Budget-Overrun Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Tracks last-30-day spend per category against the monthly budgets you've set. Flags categories that have blown the limit, plus an early warning when they cross a percentage you choose.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Warn when spend reaches: {warnPct}% of budget</label>
          <input type="range" min="50" max="100" step="5" value={warnInput} onChange={e => setWarnInput(e.target.value)} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      {(overCount > 0 || nearCount > 0) && (
        <div className={`rounded-lg p-4 border ${overCount > 0 ? "border-red-800/40 bg-red-950/20" : "border-yellow-800/40 bg-yellow-950/20"}`}>
          <p className={`text-sm font-bold flex items-center gap-2 ${overCount > 0 ? "text-red-400" : "text-yellow-400"}`}><AlertTriangle size={14} /> {overCount > 0 ? `${overCount} budget${overCount > 1 ? "s" : ""} over limit` : `${nearCount} budget${nearCount > 1 ? "s" : ""} approaching limit`}</p>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map(r => {
            const barColor = r.over ? "bg-red-400" : r.near ? "bg-yellow-400" : "bg-green-400";
            const txtColor = r.over ? "text-red-400" : r.near ? "text-yellow-400" : "text-green-400";
            return (
              <div key={r.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold">{r.label || r.category}</span>
                  <span className={`text-xs font-bold tabular-nums ${txtColor}`}>{fc(r.spent)} / {fc(r.limit)} · {Math.round(r.pct)}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-bg)] overflow-hidden">
                  <div className={`h-full ${barColor}`} style={{ width: `${Math.min(r.pct, 100)}%` }} />
                </div>
                {r.over && <p className="text-[11px] text-red-400 mt-1">Over budget by {fc(r.spent - r.limit)} this period.</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center py-8 text-sm text-[var(--color-muted)]">No budgets defined - set category budgets to monitor overruns here.</p>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Actuals use a rolling 30-day window of outflows matched on transaction category. Make sure transactions are categorised for accurate budget tracking.</p>
    </div>
  );
}

// ── Customer Concentration Alerts ────────────────────────────────────────────────
// Flags over-reliance on a single customer - what share of open receivables (and
// of all-time invoiced revenue) sits with your top accounts, above a risk ceiling.
function CustomerConcentrationAlerts() {
  const { store } = useApp();
  const [ceilingInput, setCeilingInput] = useFeatureState<string>("alr-concentration-pct", "30");
  const fc = formatCurrency;
  const ceiling = Math.min(Math.max(parseFloat(ceilingInput) || 30, 1), 100);

  const data = useMemo(() => {
    const invoices = store.invoices ?? [];
    const openByCust = new Map<string, number>();
    const allByCust = new Map<string, number>();
    let openTotal = 0;
    let allTotal = 0;
    invoices.forEach(i => {
      const amt = i.amount || 0;
      const c = i.customer || "Unknown";
      allByCust.set(c, (allByCust.get(c) ?? 0) + amt);
      allTotal += amt;
      if (i.status !== "paid") {
        openByCust.set(c, (openByCust.get(c) ?? 0) + amt);
        openTotal += amt;
      }
    });
    const rows = [...allByCust.entries()].map(([customer, all]) => {
      const open = openByCust.get(customer) ?? 0;
      const openShare = openTotal > 0 ? (open / openTotal) * 100 : 0;
      const allShare = allTotal > 0 ? (all / allTotal) * 100 : 0;
      return { customer, open, all, openShare, allShare };
    }).sort((a, b) => b.openShare - a.openShare);
    const breached = rows.filter(r => r.openShare > ceiling);
    return { rows: rows.slice(0, 20), breached, openTotal, custCount: allByCust.size };
  }, [store.invoices, ceiling]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> Customer Concentration Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Warns when too much of your open receivables sits with one customer - a concentration risk if that account pays late or churns. Set the share above which a single customer should raise a flag.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Flag a customer above: {ceiling}% of open AR</label>
          <input type="range" min="10" max="80" step="5" value={ceilingInput} onChange={e => setCeilingInput(e.target.value)} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      {data.breached.length > 0 ? (
        <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20">
          <p className="text-sm font-bold text-orange-400 flex items-center gap-2"><AlertTriangle size={14} /> {data.breached.length} customer{data.breached.length > 1 ? "s" : ""} above your {ceiling}% concentration ceiling</p>
          <ul className="text-xs text-[var(--color-muted)] mt-1.5 space-y-0.5 list-disc list-inside">
            {data.breached.map(r => <li key={r.customer}>{r.customer} holds {Math.round(r.openShare)}% of open AR ({fc(r.open)})</li>)}
          </ul>
        </div>
      ) : data.custCount > 0 ? (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">Receivables are well spread - no single customer exceeds {ceiling}% of open AR.</p>
        </div>
      ) : null}

      {data.rows.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Customer", "Open AR", "% of open", "% of all-time"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.rows.map(r => (
                <tr key={r.customer} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{r.customer}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.open)}</td>
                  <td className={`px-3 py-2.5 text-xs tabular-nums font-semibold ${r.openShare > ceiling ? "text-orange-400" : "text-[var(--color-text)]"}`}>{r.openShare.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.allShare.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-center py-8 text-sm text-[var(--color-muted)]">No invoices yet - add receivables to assess customer concentration.</p>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">"Open AR" excludes paid invoices; "all-time" includes every invoice on record. A diversified book reduces the cashflow hit if one big customer slips.</p>
    </div>
  );
}

// ── Priority Inbox ───────────────────────────────────────────────────────────────
// A triage view of active alerts ordered by severity, with one-tap dismiss and
// bulk actions to clear a whole severity tier at once - built for fast morning sweeps.
function PriorityInbox() {
  const { store, markAlertRead } = useApp();
  const [filter, setFilter] = useState<"all" | "critical" | "high" | "medium" | "low">("all");

  const data = useMemo(() => {
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const open = (store.alerts ?? []).filter(a => !a.isRead);
    const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>;
    open.forEach(a => { counts[a.severity] = (counts[a.severity] ?? 0) + 1; });
    const visible = open
      .filter(a => filter === "all" || a.severity === filter)
      .sort((a, b) => (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { open, counts, visible };
  }, [store.alerts, filter]);

  const clearTier = (sev: string) => {
    const ids = data.open.filter(a => a.severity === sev).map(a => a.id);
    ids.forEach(id => markAlertRead(id));
    toast.success(`Cleared ${ids.length} ${sev} alert${ids.length === 1 ? "" : "s"}`);
  };

  const TABS: { key: "all" | "critical" | "high" | "medium" | "low"; label: string }[] = [
    { key: "all", label: "All" }, { key: "critical", label: "Critical" }, { key: "high", label: "High" }, { key: "medium", label: "Warning" }, { key: "low", label: "Info" },
  ];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Inbox size={14} className="text-[var(--color-primary)]" /> Priority Inbox</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">A single triage queue of every active alert, ordered by severity then recency. Filter to one tier, dismiss individually, or clear a whole band in one tap - built for a fast morning sweep.</p>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(t => {
            const n = t.key === "all" ? data.open.length : (data.counts[t.key] ?? 0);
            return (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${filter === t.key ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-accent)] border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/40"}`}>
                {t.label} ({n})
              </button>
            );
          })}
        </div>
      </div>

      {filter !== "all" && (data.counts[filter] ?? 0) > 0 && (
        <button onClick={() => clearTier(filter)} className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          Clear all {filter} ({data.counts[filter]})
        </button>
      )}

      {data.visible.length > 0 ? (
        <div className="space-y-2">
          {data.visible.map(a => {
            const meta = SEV[a.severity] ?? SEV.low;
            const Icon = meta.icon;
            return (
              <div key={a.id} className={`rounded-lg border px-4 py-3 flex items-start justify-between gap-3 ${meta.bg}`}>
                <div className="flex items-start gap-3 min-w-0">
                  <Icon size={14} className={`${meta.color} mt-0.5 shrink-0`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                      <span className="text-[10px] text-[var(--color-muted)]">{new Date(a.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {a.title && <p className="text-sm font-semibold">{a.title}</p>}
                    <p className="text-xs text-[var(--color-muted)] leading-snug">{a.message}</p>
                  </div>
                </div>
                <button onClick={() => { markAlertRead(a.id); toast.success("Alert dismissed"); }}
                  className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)] rounded-lg hover:bg-black/20 shrink-0">
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">{data.open.length === 0 ? "Inbox zero - no active alerts." : "Nothing in this tier right now."}</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Dismissing moves an alert to Resolved without a note. To log what you did, use the Active tab's resolve box instead.</p>
    </div>
  );
}

// ── Licence Expiry Alerts ────────────────────────────────────────────────────────
// One-time, non-recurring registrations & licences (trade licence, FSSAI, insurance,
// ISO, domain/SSL) with escalating reminder bands as their expiry date approaches.
type Licence = { id: string; name: string; expiryDate: string; createdAt: string };

function LicenceExpiryAlerts() {
  const [items, setItems] = useFeatureState<Licence[]>("alr-licence-items", []);
  const [name, setName] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const PRESETS = ["Trade licence", "FSSAI licence", "Shops & Establishment", "Fire NOC", "Professional tax registration", "GST registration", "ISO certification", "Insurance policy", "Domain / SSL", "Import-Export Code"];

  const add = () => {
    if (!name.trim() || !expiryDate) { toast.error("Enter a licence name and expiry date"); return; }
    setItems(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), expiryDate, createdAt: new Date().toISOString() }]);
    setName(""); setExpiryDate("");
    toast.success("Licence added");
  };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysTo = (d: string) => Math.round((new Date(d).getTime() - today.getTime()) / 86400000);
  const band = (days: number) => days < 0 ? { color: "text-red-400", bg: "bg-red-950/20 border-red-800/40", label: "Expired" }
    : days <= 15 ? { color: "text-orange-400", bg: "bg-orange-950/20 border-orange-800/40", label: "Expiring ≤15 days" }
    : days <= 45 ? { color: "text-yellow-400", bg: "bg-yellow-950/20 border-yellow-800/40", label: "Renew soon" }
    : { color: "text-[var(--color-muted)]", bg: "bg-[var(--color-surface)] border-[var(--color-border)]", label: "Valid" };

  const sorted = [...items].sort((a, b) => daysTo(a.expiryDate) - daysTo(b.expiryDate));
  const urgent = sorted.filter(i => daysTo(i.expiryDate) <= 45).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><BadgeCheck size={14} className="text-[var(--color-primary)]" /> Licence Expiry Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track licences, registrations and certificates that lapse on a fixed date - trade licence, FSSAI, fire NOC, insurance, SSL. Reminders escalate from "Renew soon" to "Expired" so a lapsed permit never catches you out.</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PRESETS.map(p => <button key={p} onClick={() => setName(p)} className="text-[11px] bg-[var(--color-accent)] border border-[var(--color-border)] px-2 py-1 rounded-lg hover:border-[var(--color-primary)]/40">{p}</button>)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Licence / certificate *" className={INP} />
          <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={INP} />
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add licence</button>
        </div>
      </div>

      {urgent > 0 && (
        <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20">
          <p className="text-sm font-bold text-orange-400 flex items-center gap-2"><AlertTriangle size={14} /> {urgent} licence{urgent > 1 ? "s" : ""} expired or expiring within 45 days</p>
        </div>
      )}

      {sorted.length > 0 ? (
        <div className="space-y-2">
          {sorted.map(i => {
            const days = daysTo(i.expiryDate);
            const b = band(days);
            return (
              <div key={i.id} className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${b.bg}`}>
                <div className="min-w-0">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${b.color}`}>{b.label}</span>
                  <p className="text-sm font-semibold mt-0.5">{i.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">Expires {new Date(i.expiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {days < 0 ? `${Math.abs(days)} days ago` : days === 0 ? "today" : `in ${days} days`}</p>
                </div>
                <button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))} className="p-1 text-[var(--color-muted)] hover:text-red-400 rounded shrink-0"><X size={13} /></button>
              </div>
            );
          })}
        </div>
      ) : <p className="text-center py-8 text-sm text-[var(--color-muted)]">No licences tracked - add one above or pick a preset.</p>}
      <p className="text-[10px] text-[var(--color-muted)]">For licences that renew on a cycle (GST returns, TDS), use Compliance Due-Dates instead - this tab is for fixed-expiry registrations. Start renewals early; some need inspections.</p>
    </div>
  );
}

// ── EMI Coverage Alerts ──────────────────────────────────────────────────────────
// Checks whether your current bank balance can cover loan/EMI obligations falling
// due inside a window - surfacing a funding shortfall before a payment bounces.
function EmiCoverageAlerts() {
  const { store } = useApp();
  const [windowInput, setWindowInput] = useFeatureState<string>("alr-emicover-window", "30");
  const fc = formatCurrency;
  const lookAhead = Math.max(parseInt(windowInput) || 30, 1);

  const data = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const horizon = today.getTime() + lookAhead * 86400000;
    const balance = (store.bankAccounts ?? []).reduce((s, a) => s + (a.balance || 0), 0);
    const emis = (store.obligations ?? [])
      .filter(o => o.type === "loan")
      .map(o => ({ ...o, days: Math.round((new Date(o.dueDate).getTime() - today.getTime()) / 86400000) }))
      .filter(o => new Date(o.dueDate).getTime() <= horizon)
      .sort((a, b) => a.days - b.days);
    const due = emis.reduce((s, o) => s + (o.amount || 0), 0);
    const after = balance - due;
    return { balance, emis, due, after };
  }, [store.bankAccounts, store.obligations, lookAhead]);

  const shortfall = data.after < 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><HandCoins size={14} className="text-[var(--color-primary)]" /> EMI Coverage Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Adds up your loan EMIs due inside a window and checks them against your live bank balance - so you know whether you can cover every instalment, or need to arrange funds before a payment bounces and dents your credit.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Coverage window (days)</label>
          <input type="number" value={windowInput} onChange={e => setWindowInput(e.target.value)} placeholder="30" className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total balance", value: fc(data.balance), color: "text-[var(--color-text)]" },
          { label: `EMIs due (${lookAhead}d)`, value: fc(data.due), color: data.due > 0 ? "text-orange-400" : "text-[var(--color-text)]" },
          { label: "Balance after EMIs", value: fc(data.after), color: data.after < 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {shortfall ? (
        <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400 leading-snug">Projected shortfall of {fc(Math.abs(data.after))} - your balance won't cover all EMIs due in the next {lookAhead} days. Arrange funds or talk to your lender before the due date.</p>
        </div>
      ) : data.due > 0 ? (
        <div className="rounded-lg border border-green-800/40 bg-green-950/20 px-4 py-3 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">Balance covers all EMIs due in this window with {fc(data.after)} to spare.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 flex items-center gap-2">
          <Info size={15} className="text-blue-400" />
          <p className="text-sm text-[var(--color-muted)]">No loan EMIs due in the next {lookAhead} days. Add loan obligations in Forecast to track instalment coverage.</p>
        </div>
      )}

      {data.emis.length > 0 && (
        <div className="space-y-2">
          {data.emis.map(o => (
            <div key={o.id} className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${o.days < 0 ? "bg-red-950/20 border-red-800/40" : "bg-[var(--color-surface)] border-[var(--color-border)]"}`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{o.name}</p>
                <p className="text-xs text-[var(--color-muted)]">{o.days < 0 ? `${Math.abs(o.days)} days overdue` : o.days === 0 ? "due today" : `due in ${o.days} days`} · {new Date(o.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
              </div>
              <span className="text-sm font-bold tabular-nums shrink-0">{fc(o.amount || 0)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Only obligations typed as loans are counted here - see Payment-Due for tax and payroll. Balance is the live sum across connected accounts; expected inflows in the window are not netted in.</p>
    </div>
  );
}

// ── Recurring-Spend Watch ────────────────────────────────────────────────────────
// Surfaces every recurring expense/subscription on file, totals the committed
// monthly outflow, and flags subscription creep against a budget ceiling you set.
function RecurringSpendWatch() {
  const { store } = useApp();
  const [ceilingInput, setCeilingInput] = useFeatureState<string>("alr-recurring-ceiling", "");
  const fc = formatCurrency;
  const ceiling = parseFloat(ceilingInput) || 0;

  const data = useMemo(() => {
    const recurring = (store.transactions ?? []).filter(t => t.isRecurring && (t.category === "expense" || t.category === "payroll") && (t.amount || 0) < 0);
    // Latest recurring charge per counterparty - treat each as one monthly commitment.
    const latest = new Map<string, { id: string; party: string; amount: number; date: string }>();
    [...recurring].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(t => {
      const key = (t.counterparty || t.description || t.id).trim();
      latest.set(key, { id: t.id, party: t.counterparty || t.description || "Recurring charge", amount: Math.abs(t.amount || 0), date: t.date });
    });
    const rows = [...latest.values()].sort((a, b) => b.amount - a.amount);
    const monthly = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, monthly, count: rows.length };
  }, [store.transactions]);

  const breached = ceiling > 0 && data.monthly > ceiling;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> Recurring-Spend Watch</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Lists every recurring charge on file - SaaS subscriptions, rent, retainers - and totals your committed monthly outflow. Set a ceiling to catch subscription creep before it quietly eats your margin.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Alert when recurring spend exceeds (₹/mo) - optional</label>
          <input type="number" value={ceilingInput} onChange={e => setCeilingInput(e.target.value)} placeholder="e.g. 200000" className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Recurring charges", value: String(data.count), color: "text-[var(--color-text)]" },
          { label: "Committed / month", value: fc(data.monthly), color: breached ? "text-red-400" : "text-[var(--color-text)]" },
          { label: "Committed / year", value: fc(data.monthly * 12), color: "text-[var(--color-muted)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {breached ? (
        <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400 leading-snug">Recurring spend is {fc(data.monthly)}/mo - above your {fc(ceiling)} ceiling. Review subscriptions for ones you can pause or downgrade.</p>
        </div>
      ) : data.count > 0 ? (
        <div className="rounded-lg border border-green-800/40 bg-green-950/20 px-4 py-3 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">Recurring commitments are within your ceiling.</p>
        </div>
      ) : null}

      {data.rows.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Charge", "Last seen", "Monthly amount"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 text-xs font-medium">{r.party}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums font-semibold">{fc(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-center py-8 text-sm text-[var(--color-muted)]">No recurring charges found - mark subscription and rent transactions as recurring to track them here.</p>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Built from transactions flagged recurring, one commitment per counterparty at its latest amount. Annualised figure assumes the charge repeats monthly - adjust for quarterly or annual billing.</p>
    </div>
  );
}

// ── Tax Set-Aside Alerts ─────────────────────────────────────────────────────────
// Estimates how much tax you should be reserving from recent revenue at a rate you
// set, and warns if your bank balance can't cover that provision.
function TaxSetAsideAlerts() {
  const { store } = useApp();
  const [rateInput, setRateInput] = useFeatureState<string>("alr-taxsetaside-rate", "25");
  const fc = formatCurrency;
  const rate = Math.min(Math.max(parseFloat(rateInput) || 25, 0), 100);

  const data = useMemo(() => {
    const cutoff = Date.now() - 90 * 86400000;
    const recent = (store.transactions ?? []).filter(t => new Date(t.date).getTime() >= cutoff);
    const revenue = recent.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const expenses = recent.filter(t => t.category === "expense" || t.category === "payroll").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const profit = Math.max(revenue - expenses, 0);
    const provision = profit * (rate / 100);
    // Tax already paid out in the quarter offsets what still needs setting aside.
    const taxPaid = recent.filter(t => t.category === "tax").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const stillOwed = Math.max(provision - taxPaid, 0);
    const balance = (store.bankAccounts ?? []).reduce((s, a) => s + (a.balance || 0), 0);
    return { revenue, expenses, profit, provision, taxPaid, stillOwed, balance };
  }, [store.transactions, store.bankAccounts, rate]);

  const underReserved = data.stillOwed > data.balance;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Tax Set-Aside Alerts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Estimates the tax you should be parking from the last 90 days of profit at a rate you set, nets off tax already paid, and warns if your balance can't cover what's still owed - so advance-tax season never blindsides you.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Effective tax rate on profit: {rate}%</label>
          <input type="range" min="0" max="40" step="1" value={rateInput} onChange={e => setRateInput(e.target.value)} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Profit (90d)", value: fc(data.profit), color: "text-[var(--color-text)]" },
          { label: "Provision needed", value: fc(Math.round(data.provision)), color: "text-[var(--color-text)]" },
          { label: "Tax already paid", value: fc(data.taxPaid), color: "text-green-400" },
          { label: "Still to set aside", value: fc(Math.round(data.stillOwed)), color: data.stillOwed > 0 ? "text-orange-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {underReserved ? (
        <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400 leading-snug">You should be reserving {fc(Math.round(data.stillOwed))} for tax but hold only {fc(data.balance)} in the bank. Build the reserve before the next advance-tax instalment.</p>
        </div>
      ) : data.stillOwed > 0 ? (
        <div className="rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-4 py-3 flex items-start gap-2.5">
          <Info size={14} className="text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-400 leading-snug">Set aside about {fc(Math.round(data.stillOwed))} for tax on this quarter's profit. Your balance covers it - ring-fence it so it isn't spent.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-green-800/40 bg-green-950/20 px-4 py-3 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <p className="text-sm text-green-400 font-medium">{data.profit <= 0 ? "No taxable profit in the last 90 days at the moment." : "Tax already paid covers the estimated provision for this period."}</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A rough provisioning aid, not a tax computation - it ignores carry-forward losses, depreciation, exemptions and surcharge. Confirm your actual liability and instalment dates with your CA.</p>
    </div>
  );
}
