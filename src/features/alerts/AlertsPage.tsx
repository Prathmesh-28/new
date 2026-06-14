import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, monthlyBurn } from "@/lib/utils";
import { useFeatureState } from "@/hooks/useFeatureState";
import { AlertTriangle, Bell, Info, CheckCircle2, X, Settings2, SlidersHorizontal, CalendarClock, Droplets, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const INP = "w-full text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 outline-none focus:border-[var(--color-primary)]";

const SEV: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  critical: { color: "text-red-400",    bg: "bg-red-950/20 border-red-800/40",     icon: AlertTriangle, label: "Critical" },
  high:     { color: "text-orange-400", bg: "bg-orange-950/20 border-orange-800/40", icon: AlertTriangle, label: "High" },
  medium:   { color: "text-yellow-400", bg: "bg-yellow-950/20 border-yellow-800/40", icon: Bell,          label: "Warning" },
  low:      { color: "text-blue-400",   bg: "bg-blue-950/20 border-blue-800/40",     icon: Info,          label: "Info" },
};

export default function AlertsPage() {
  const { store, markAlertRead, deleteAlert, addAlert, updateFirm, resolveAlert } = useApp();
  const { alerts, transactions } = store;
  const safetyDays = store.firm.safetyThresholdDays ?? 14;

  const [tab,         setTab]         = useState<"active" | "history" | "thresholds" | "compliance" | "liquidity" | "fraud">("active");
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
    toast.success("Alert marked as resolved");
    setActionText(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleDismiss = (id: string) => {
    markAlertRead(id);
    toast.success("Alert dismissed");
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
          <h1 className="text-xl font-bold">Alerts Centre</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">{active.length} active · {history.length} resolved</p>
        </div>
        <button onClick={() => setShowConfig(v => !v)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          <Settings2 size={12} /> Configure
        </button>
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
              <p><strong className="text-[var(--color-text)]">Critical</strong> — balance goes negative within 30 days → in-app + email + WhatsApp</p>
              <p><strong className="text-[var(--color-text)]">Warning</strong> — below safety buffer within 45 days → in-app + email</p>
              <p><strong className="text-[var(--color-text)]">Info</strong> — unusual spend detected → in-app only</p>
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
          ["active",     `Active (${active.length})`,     Bell],
          ["history",    `Resolved (${history.length})`,  CheckCircle2],
          ["thresholds", "Threshold Builder",             SlidersHorizontal],
          ["compliance", "Compliance Due-Dates",          CalendarClock],
          ["liquidity",  "Cash-Low / Overdraft",          Droplets],
          ["fraud",      "Fraud / Anomaly",               ShieldAlert],
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
              <h2 className="text-base font-semibold mb-1">All clear</h2>
              <p className="text-sm text-[var(--color-muted)]">No active alerts. The system checks your cash position every 4 hours.</p>
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
                      <button onClick={() => deleteAlert(a.id)} className="p-1 text-[var(--color-muted)] hover:text-red-400 rounded">
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

      {tab === "thresholds" && <ThresholdAlertBuilder />}
      {tab === "compliance" && <ComplianceDueDateAlerts />}
      {tab === "liquidity"  && <CashLowOverdraftAlert />}
      {tab === "fraud"      && <FraudAnomalyAlerts />}
    </div>
  );
}

// ── #182 Smart Threshold Alert Builder ───────────────────────────────────────────
// "Alert me when metric X crosses Y" — user-defined rules persisted via
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Define your own rules — "alert me when balance is below ₹5,00,000" or "runway below 60 days". Each rule is evaluated live against your latest synced data, so a breach shows up the moment your numbers cross the line.</p>
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
      ) : <p className="text-center py-8 text-sm text-[var(--color-muted)]">No rules yet — add one above to start monitoring a metric.</p>}

      {triggered.length > 0 && (
        <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {triggered.length} rule{triggered.length > 1 ? "s" : ""} breached right now</p>
          <ul className="text-xs text-[var(--color-muted)] mt-1.5 space-y-0.5 list-disc list-inside">
            {triggered.map(r => <li key={r.id}>{METRICS[r.metric].label} is {fmtVal(r.metric, live[r.metric])} ({r.op} {fmtVal(r.metric, r.value)})</li>)}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Rules persist and sync across your devices. Evaluation is on the latest store snapshot — connect more bank feeds for a complete balance picture.</p>
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
    const d = new Date(item.dueDate);
    if (item.recurrence === "monthly") d.setMonth(d.getMonth() + 1);
    else if (item.recurrence === "quarterly") d.setMonth(d.getMonth() + 3);
    else if (item.recurrence === "annual") d.setFullYear(d.getFullYear() + 1);
    else return;
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Track statutory deadlines with escalating reminders — Upcoming → Due this week → Due ≤3 days → Overdue. Recurring items roll forward to the next cycle once filed.</p>
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
      ) : <p className="text-center py-8 text-sm text-[var(--color-muted)]">No deadlines tracked — add one above or pick a preset.</p>}
      <p className="text-[10px] text-[var(--color-muted)]">Reminders escalate automatically as the date approaches. Verify exact statutory due dates with your CA — they shift with extensions and weekends/holidays.</p>
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
  else if (data.runway <= 30) warnings.push({ sev: "high", text: `Runway is ${data.runway} days — below the 30-day comfort line.` });
  if (floor > 0 && data.balance < floor) warnings.push({ sev: "high", text: `Balance ${fc(data.balance)} is below your minimum floor of ${fc(floor)}.` });
  else if (floor > 0 && daysToFloor <= 30 && daysToFloor >= 0) warnings.push({ sev: "medium", text: `At current burn you hit your ${fc(floor)} floor in ${daysToFloor} days.` });

  const SEVCLS = { critical: "text-red-400 bg-red-950/20 border-red-800/40", high: "text-orange-400 bg-orange-950/20 border-orange-800/40", medium: "text-yellow-400 bg-yellow-950/20 border-yellow-800/40" };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Droplets size={14} className="text-[var(--color-primary)]" /> Cash-Low / Overdraft Alert</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Proactive liquidity warnings from your live bank balances and burn rate — flags overdrawn accounts, thin runway, and how long until you hit a minimum-balance floor you set.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Minimum-balance floor (₹) — optional</label>
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
          <p className="text-sm text-green-400 font-medium">Liquidity is healthy — no accounts overdrawn and runway is comfortable.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Runway uses last-30-day burn — seasonal or one-off outflows can distort it. Set a floor that covers payroll + statutory dues for at least one cycle.</p>
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

    // Outsized payments — beyond mean + N·σ.
    const outsized = outflows.filter(t => Math.abs(t.amount || 0) > threshold && sd > 0)
      .map(t => ({ id: t.id, kind: "Large payment" as const, party: t.counterparty || t.description, detail: `${fc(Math.abs(t.amount))} — ${((Math.abs(t.amount) - mean) / (sd || 1)).toFixed(1)}σ above your average outflow`, date: t.date }));

    // New payees — counterparty first seen within the last 30 days.
    const firstSeen = new Map<string, number>();
    [...txns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(t => {
      const cp = (t.counterparty || "").trim();
      if (cp && !firstSeen.has(cp)) firstSeen.set(cp, new Date(t.date).getTime());
    });
    const cutoff = Date.now() - 30 * 86400000;
    const newPayees = outflows.filter(t => {
      const cp = (t.counterparty || "").trim();
      return cp && (firstSeen.get(cp) ?? 0) >= cutoff;
    }).map(t => ({ id: t.id, kind: "New payee" as const, party: t.counterparty, detail: `First payment to this payee — ${fc(Math.abs(t.amount))}`, date: t.date }));

    // Round-trips — a counterparty with both inflow and outflow (money cycled).
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
      .map(([party, v]) => ({ id: `rt-${party}`, kind: "Round-trip" as const, party, detail: `Both paid (${fc(v.out)}) and received (${fc(v.in)}) — possible circular flow`, date: "" }));

    const flaggedManual = txns.filter(t => t.flagged)
      .map(t => ({ id: `fl-${t.id}`, kind: "Manually flagged" as const, party: t.counterparty || t.description, detail: `${fc(Math.abs(t.amount || 0))} — flagged for review`, date: t.date }));

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
        <p className="text-xs text-[var(--color-muted)] mb-4">Scans your transactions for unusual patterns — outsized payments (statistical outliers), brand-new payees, and round-trips where money flows out and back to the same party. Tune the outlier sensitivity below.</p>
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
          <p className="text-sm text-green-400 font-medium">No anomalies at this sensitivity — lower the σ threshold to scan more aggressively.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Heuristic detection — outliers and new payees are often legitimate (a large vendor settlement, a new supplier). Treat these as a review queue, not proof of fraud. Inter-account transfers are excluded.</p>
    </div>
  );
}
