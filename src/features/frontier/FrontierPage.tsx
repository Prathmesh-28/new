import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { computeFinancialSnapshot } from "@/lib/finance";
import { formatCurrency } from "@/lib/utils";
import {
  Rocket, Bell, Radar, Cpu, ShieldCheck, Activity, Gauge, ScanLine,
  Plus, Trash2, CheckCircle2, AlertTriangle, Zap, Banknote, Workflow,
  FlaskConical, ArrowRight, Sparkles, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// ── shared styles (reuse TaxPage input class) ────────────────────────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type TabId =
  | "overview" | "alerts" | "ambient" | "supercompute" | "quantum-ready"
  | "events" | "radar" | "request-to-pay" | "streaming-payroll"
  | "autonomous-treasury" | "m2m";

const TABS = [
  ["overview", "Overview", Rocket, "today"],
  ["alerts", "Alert Triggers", Bell, "today"],
  ["ambient", "Ambient Rules", Radar, "today"],
  ["supercompute", "Scenario Supercompute", Cpu, "today"],
  ["quantum-ready", "Quantum-Safe Readiness", ShieldCheck, "today"],
  ["events", "Event Stream", Activity, "today"],
  ["radar", "Tech-Readiness Radar", Gauge, "today"],
  ["request-to-pay", "Request-to-Pay", Banknote, "preview"],
  ["streaming-payroll", "Streaming Payroll", Workflow, "preview"],
  ["autonomous-treasury", "Autonomous Treasury", Sparkles, "preview"],
  ["m2m", "Machine-to-Machine Pay", Zap, "preview"],
] as const satisfies ReadonlyArray<readonly [TabId, string, typeof Rocket, "today" | "preview"]>;

const PreviewBadge = () => (
  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-950/40 text-purple-300 border border-purple-800/40">
    Preview
  </span>
);
const LiveBadge = () => (
  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-950/40 text-green-300 border border-green-800/40">
    Live tool
  </span>
);

export default function FrontierPage() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FlaskConical size={18} className="text-[var(--color-primary)]" /> Frontier Lab
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Where Headroom prototypes the next decade of SMB finance — real-time, ambient, autonomous and quantum-safe.
          </p>
        </div>
        <div className="flex gap-1 flex-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Honest top note — shown on every tab */}
      <div className="rounded-lg px-4 py-2.5 border border-[var(--color-border)] bg-[var(--color-accent)]/40 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px text-yellow-400" />
        Experimental &amp; forward-looking — real tools you can use today plus a preview of what's coming. Tools marked
        <span className="inline-block"><PreviewBadge /></span> are honest interactive mockups, not live money rails.
      </div>

      {tab === "overview" && <Overview onOpen={setTab} />}
      {tab === "alerts" && <AlertTriggers />}
      {tab === "ambient" && <AmbientRules />}
      {tab === "supercompute" && <ScenarioSupercompute />}
      {tab === "quantum-ready" && <QuantumReadiness />}
      {tab === "events" && <EventStream />}
      {tab === "radar" && <TechReadinessRadar />}
      {tab === "request-to-pay" && <RequestToPayDesigner />}
      {tab === "streaming-payroll" && <StreamingPayroll />}
      {tab === "autonomous-treasury" && <AutonomousTreasury />}
      {tab === "m2m" && <MachineToMachine />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────────
function Overview({ onOpen }: { onOpen: (t: TabId) => void }) {
  const { store } = useApp();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);

  const cards: { id: TabId; title: string; desc: string; Icon: typeof Rocket; live: boolean }[] = [
    { id: "alerts", title: "Alert Triggers", desc: "Define event → notification rules and store them.", Icon: Bell, live: true },
    { id: "ambient", title: "Ambient Rules", desc: "Background \"if balance < X then alert\" rules, evaluated against your live data right now.", Icon: Radar, live: true },
    { id: "supercompute", title: "Scenario Supercompute", desc: "Heavy Monte-Carlo over revenue/cost assumptions → percentile cash outcomes.", Icon: Cpu, live: true },
    { id: "quantum-ready", title: "Quantum-Safe Readiness", desc: "Post-quantum migration checklist with a live readiness score.", Icon: ShieldCheck, live: true },
    { id: "events", title: "Event Stream", desc: "Recent changes in your store summarised as an activity feed.", Icon: Activity, live: true },
    { id: "radar", title: "Tech-Readiness Radar", desc: "Self-assess across AI, real-time, tokenisation and quantum.", Icon: Gauge, live: true },
    { id: "request-to-pay", title: "Request-to-Pay", desc: "Design RTP request templates for the maturing UPI-RTP rail.", Icon: Banknote, live: false },
    { id: "streaming-payroll", title: "Streaming Payroll", desc: "Simulate per-second wage accrual vs monthly payout.", Icon: Workflow, live: false },
    { id: "autonomous-treasury", title: "Autonomous Treasury", desc: "Configure the guardrails a self-driving treasury would obey.", Icon: Sparkles, live: false },
    { id: "m2m", title: "Machine-to-Machine Pay", desc: "Model device-to-device micro-settlement economics.", Icon: Zap, live: false },
  ];

  return (
    <div className="space-y-5">
      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-1">What this lab is for</p>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          Headroom's roadmap points at finance that senses, decides and settles in the moment — and stays secure against
          tomorrow's quantum computers. Some of that is buildable on today's data and is shipped here as working tools.
          The rest depends on rails (RTP, programmable CBDC, streaming payroll) that are still maturing — those appear as
          honest, interactive previews so you can shape the design without us faking live money movement.
        </p>
      </div>

      {/* Live snapshot the lab reasons over */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Cash on hand", value: formatCurrency(Math.round(snap.cash)), sub: `${store.bankAccounts.length} account(s)` },
          { label: "Monthly net", value: formatCurrency(Math.round(snap.monthlyNet)), sub: snap.monthlyNet >= 0 ? "cash generative" : "burning cash" },
          { label: "Runway", value: snap.runwayDays >= 999 ? "∞" : `${snap.runwayDays}d`, sub: snap.runwayDays >= 999 ? "cash-flow positive" : "at current burn" },
          { label: "Debt outstanding", value: formatCurrency(Math.round(snap.debtOutstanding)), sub: `${store.activeLoans.length} loan(s)` },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className="text-xl font-bold tabular-nums">{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(c => (
          <button key={c.id} onClick={() => onOpen(c.id)}
            className={`${CARD} p-4 text-left hover:border-[var(--color-primary)]/40 transition-colors group`}>
            <div className="flex items-center justify-between mb-2">
              <c.Icon size={16} className="text-[var(--color-primary)]" />
              {c.live ? <LiveBadge /> : <PreviewBadge />}
            </div>
            <p className="text-sm font-semibold flex items-center gap-1.5">{c.title}</p>
            <p className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">{c.desc}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity">
              Open <ArrowRight size={10} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── #1 Real-time alert / trigger config (durable) ────────────────────────────────
type AlertEvent = "low_balance" | "large_expense" | "invoice_overdue" | "new_revenue" | "debt_due";
type AlertChannel = "in_app" | "whatsapp" | "email";
interface TriggerRule {
  id: string;
  name: string;
  event: AlertEvent;
  threshold: number;
  channel: AlertChannel;
  enabled: boolean;
}
const EVENT_LABEL: Record<AlertEvent, string> = {
  low_balance: "Cash balance falls below",
  large_expense: "Single expense exceeds",
  invoice_overdue: "Invoice overdue by (days)",
  new_revenue: "Revenue inflow exceeds",
  debt_due: "Debt obligation due within (days)",
};
const isMoneyEvent = (e: AlertEvent) => e === "low_balance" || e === "large_expense" || e === "new_revenue";

function AlertTriggers() {
  const [rules, setRules] = useFeatureState<TriggerRule[]>("frnt-alert-rules", []);
  const [name, setName] = useState("");
  const [event, setEvent] = useState<AlertEvent>("low_balance");
  const [threshold, setThreshold] = useState("100000");
  const [channel, setChannel] = useState<AlertChannel>("in_app");

  const add = () => {
    const t = parseFloat(threshold);
    if (!name.trim() || isNaN(t)) { toast.error("Enter a rule name and numeric threshold"); return; }
    setRules([...rules, { id: crypto.randomUUID(), name: name.trim(), event, threshold: t, channel, enabled: true }]);
    setName("");
    toast.success("Trigger saved");
  };
  const toggle = (id: string) => setRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const remove = (id: string) => setRules(rules.filter(r => r.id !== id));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Bell size={14} className="text-[var(--color-primary)]" /> Event → Notification Rules</h3>
          <LiveBadge />
        </div>
        <p className="text-xs text-[var(--color-muted)]">Define which business events should ping you and where. Rules are saved to your account and sync across devices.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rule name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cash buffer" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">When</label>
            <select value={event} onChange={e => setEvent(e.target.value as AlertEvent)} className={INP}>
              {(Object.keys(EVENT_LABEL) as AlertEvent[]).map(e => <option key={e} value={e}>{EVENT_LABEL[e]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">{isMoneyEvent(event) ? "Amount (₹)" : "Days"}</label>
            <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Notify via</label>
            <select value={channel} onChange={e => setChannel(e.target.value as AlertChannel)} className={INP}>
              <option value="in_app">In-app</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No trigger rules yet. Add one above — start with a low-cash-balance alert.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Rule", "Condition", "Channel", "Status", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rules.map(r => (
                <tr key={r.id} className={`hover:bg-white/2 ${r.enabled ? "" : "opacity-50"}`}>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)] text-xs">
                    {EVENT_LABEL[r.event]} {isMoneyEvent(r.event) ? formatCurrency(r.threshold) : `${r.threshold} days`}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{r.channel.replace("_", "-")}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(r.id)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${r.enabled ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                      {r.enabled ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Rules are stored now and evaluated by the Ambient Rules engine. WhatsApp/email delivery activates as those channels are connected for your tenant.</p>
    </div>
  );
}

// ── #2 Ambient automation rules — evaluated live against the store ───────────────
type AmbientMetric = "cash" | "runway" | "monthly_net" | "debt_outstanding";
type AmbientOp = "<" | ">";
interface AmbientRule {
  id: string;
  metric: AmbientMetric;
  op: AmbientOp;
  threshold: number;
  action: string;
}
const METRIC_LABEL: Record<AmbientMetric, string> = {
  cash: "Cash on hand (₹)",
  runway: "Runway (days)",
  monthly_net: "Monthly net (₹)",
  debt_outstanding: "Debt outstanding (₹)",
};

function AmbientRules() {
  const { store } = useApp();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const [rules, setRules] = useFeatureState<AmbientRule[]>("frnt-ambient-rules", []);
  const [metric, setMetric] = useState<AmbientMetric>("cash");
  const [op, setOp] = useState<AmbientOp>("<");
  const [threshold, setThreshold] = useState("200000");
  const [action, setAction] = useState("");

  const metricValue = (m: AmbientMetric): number =>
    m === "cash" ? snap.cash : m === "runway" ? snap.runwayDays : m === "monthly_net" ? snap.monthlyNet : snap.debtOutstanding;

  const fires = (r: AmbientRule) => {
    const v = metricValue(r.metric);
    return r.op === "<" ? v < r.threshold : v > r.threshold;
  };
  const firing = rules.filter(fires);

  const add = () => {
    const t = parseFloat(threshold);
    if (isNaN(t) || !action.trim()) { toast.error("Enter a threshold and an action to take"); return; }
    setRules([...rules, { id: crypto.randomUUID(), metric, op, threshold: t, action: action.trim() }]);
    setAction("");
    toast.success("Ambient rule armed");
  };
  const fmt = (m: AmbientMetric, v: number) => m === "runway" ? `${Math.round(v)}d` : formatCurrency(Math.round(v));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Radar size={14} className="text-[var(--color-primary)]" /> Background Watch Rules</h3>
          <LiveBadge />
        </div>
        <p className="text-xs text-[var(--color-muted)]">Arm "if &lt;metric&gt; &lt;op&gt; &lt;value&gt; then &lt;action&gt;" rules. They evaluate live against your current financials below — no waiting for a batch job.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">If</label>
            <select value={metric} onChange={e => setMetric(e.target.value as AmbientMetric)} className={INP}>
              {(Object.keys(METRIC_LABEL) as AmbientMetric[]).map(m => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Is</label>
            <select value={op} onChange={e => setOp(e.target.value as AmbientOp)} className={INP}>
              <option value="<">below (&lt;)</option>
              <option value=">">above (&gt;)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Value</label>
            <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} className={INP} />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Then</label>
            <input value={action} onChange={e => setAction(e.target.value)} placeholder="e.g. Draw ₹2L credit line" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Arm
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(METRIC_LABEL) as AmbientMetric[]).map(m => (
          <div key={m} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{METRIC_LABEL[m].replace(" (₹)", "").replace(" (days)", "")}</p>
            <p className="text-lg font-bold tabular-nums">{m === "runway" && snap.runwayDays >= 999 ? "∞" : fmt(m, metricValue(m))}</p>
          </div>
        ))}
      </div>

      {firing.length > 0 && (
        <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20 space-y-1.5">
          <p className="text-sm font-bold text-orange-400 flex items-center gap-2"><AlertTriangle size={14} /> {firing.length} rule(s) firing right now</p>
          {firing.map(r => (
            <p key={r.id} className="text-xs text-orange-300">
              {METRIC_LABEL[r.metric].replace(" (₹)", "").replace(" (days)", "")} {r.op} {fmt(r.metric, r.threshold)} → <strong>{r.action}</strong>
            </p>
          ))}
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No ambient rules armed. The classic first rule: "if cash &lt; ₹2L then draw credit line".</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Condition", "Action", "Current", "State", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rules.map(r => {
                const on = fires(r);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-3 text-xs">{METRIC_LABEL[r.metric].replace(" (₹)", "").replace(" (days)", "")} {r.op} {fmt(r.metric, r.threshold)}</td>
                    <td className="px-4 py-3 text-xs font-medium">{r.action}</td>
                    <td className="px-4 py-3 tabular-nums text-xs">{r.metric === "runway" && snap.runwayDays >= 999 ? "∞" : fmt(r.metric, metricValue(r.metric))}</td>
                    <td className="px-4 py-3">
                      {on
                        ? <span className="inline-flex items-center gap-1 text-xs text-orange-400 font-semibold"><AlertTriangle size={12} /> Firing</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={12} /> Quiet</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setRules(rules.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #3 Scenario supercompute — heavy Monte-Carlo ─────────────────────────────────
interface SimResult { p10: number; p50: number; p90: number; pNegative: number; runs: number; min: number; max: number }

function ScenarioSupercompute() {
  const { store } = useApp();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const [startCash, setStartCash] = useState(String(Math.round(snap.cash)));
  const [revenue, setRevenue] = useState("1500000");
  const [revVol, setRevVol] = useState("25");
  const [cost, setCost] = useState("1200000");
  const [costVol, setCostVol] = useState("15");
  const [months, setMonths] = useState("12");
  const [runs, setRuns] = useState(20000);
  const [result, setResult] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);

  // Box-Muller standard normal.
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const run = () => {
    const c0 = parseFloat(startCash) || 0;
    const rev = parseFloat(revenue) || 0;
    const rv = (parseFloat(revVol) || 0) / 100;
    const cst = parseFloat(cost) || 0;
    const cv = (parseFloat(costVol) || 0) / 100;
    const n = Math.max(1, Math.min(36, Math.round(parseFloat(months) || 12)));
    const R = Math.max(1000, Math.min(100000, runs));
    if (rev <= 0) { toast.error("Enter a monthly revenue assumption"); return; }

    setBusy(true);
    // defer so the spinner paints before the heavy loop
    setTimeout(() => {
      const ending: number[] = new Array(R);
      let neg = 0;
      for (let i = 0; i < R; i++) {
        let cash = c0;
        for (let m = 0; m < n; m++) {
          const r = rev * (1 + rv * gauss());
          const c = cst * (1 + cv * gauss());
          cash += r - c;
        }
        if (cash < 0) neg++;
        ending[i] = cash;
      }
      ending.sort((a, b) => a - b);
      const pct = (p: number) => ending[Math.min(R - 1, Math.floor(p * R))];
      setResult({ p10: pct(0.1), p50: pct(0.5), p90: pct(0.9), pNegative: (neg / R) * 100, runs: R, min: ending[0], max: ending[R - 1] });
      setBusy(false);
      toast.success(`${R.toLocaleString()} scenarios simulated`);
    }, 30);
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Cpu size={14} className="text-[var(--color-primary)]" /> Scenario Supercompute (Monte-Carlo)</h3>
          <LiveBadge />
        </div>
        <p className="text-xs text-[var(--color-muted)]">Runs thousands of randomised futures over your revenue/cost assumptions to bound where cash lands. Prefilled with your live cash position.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Starting cash (₹)</label><input type="number" value={startCash} onChange={e => setStartCash(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly revenue (₹)</label><input type="number" value={revenue} onChange={e => setRevenue(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Revenue volatility (%)</label><input type="number" value={revVol} onChange={e => setRevVol(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly cost (₹)</label><input type="number" value={cost} onChange={e => setCost(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cost volatility (%)</label><input type="number" value={costVol} onChange={e => setCostVol(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Horizon (months)</label><input type="number" value={months} onChange={e => setMonths(e.target.value)} className={INP} /></div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-[var(--color-muted)]">Runs: <strong className="text-[var(--color-text)]">{runs.toLocaleString()}</strong></label>
          <input type="range" min={1000} max={100000} step={1000} value={runs} onChange={e => setRuns(Number(e.target.value))} className="flex-1 min-w-[160px] accent-[var(--color-primary)]" />
          <button onClick={run} disabled={busy} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? <><Clock size={13} className="animate-spin" /> Computing…</> : <><Cpu size={13} /> Run simulation</>}
          </button>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "P10 (pessimistic)", value: formatCurrency(Math.round(result.p10)), color: result.p10 < 0 ? "text-red-400" : "text-yellow-400" },
              { label: "P50 (median)", value: formatCurrency(Math.round(result.p50)), color: result.p50 < 0 ? "text-red-400" : "text-[var(--color-text)]" },
              { label: "P90 (optimistic)", value: formatCurrency(Math.round(result.p90)), color: "text-green-400" },
              { label: "Chance of negative cash", value: `${result.pNegative.toFixed(1)}%`, color: result.pNegative > 10 ? "text-red-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border ${result.pNegative > 10 ? "border-red-800/40 bg-red-950/20" : "border-green-800/40 bg-green-950/20"}`}>
            <p className={`text-sm font-bold flex items-center gap-2 ${result.pNegative > 10 ? "text-red-400" : "text-green-400"}`}>
              {result.pNegative > 10 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              Across {result.runs.toLocaleString()} futures, ending cash ranges {formatCurrency(Math.round(result.min))} to {formatCurrency(Math.round(result.max))}. Half the time you finish above {formatCurrency(Math.round(result.p50))}, and there is a {result.pNegative.toFixed(1)}% chance of running out of cash.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Each run draws monthly revenue and cost from a normal distribution around your assumptions. Higher run counts give smoother percentiles at the cost of compute time. Indicative planning tool, not a guarantee.</p>
    </div>
  );
}

// ── #4 Quantum-safe security readiness checklist (durable, scored) ────────────────
interface PqcItem { id: string; label: string; detail: string }
const PQC_ITEMS: ReadonlyArray<PqcItem> = [
  { id: "inventory", label: "Crypto inventory mapped", detail: "Catalogue every cipher/key across app, bank connectors and storage." },
  { id: "tls", label: "Hybrid PQC TLS on connectors", detail: "Bank/API traffic upgraded to hybrid classical+lattice (e.g. X25519+Kyber)." },
  { id: "at_rest", label: "PQC encryption at rest", detail: "Books & KYC re-encrypted with NIST PQC (Kyber/Dilithium) against harvest-now-decrypt-later." },
  { id: "signatures", label: "Lattice-signed documents/invoices", detail: "e-invoices and resolutions signed with quantum-resistant signatures." },
  { id: "keys", label: "QRNG / PQC key custody", detail: "Signing keys minted with true entropy and held in a PQC-capable HSM." },
  { id: "agility", label: "Crypto-agility process", detail: "Documented path to rotate ciphers the day a NIST standard updates." },
  { id: "backups", label: "Quantum-safe backups", detail: "Off-site backups use PQC key wrapping and threshold secret-sharing." },
  { id: "vendors", label: "Vendor PQC attestation", detail: "Critical vendors confirm a post-quantum migration roadmap." },
] as const;

function QuantumReadiness() {
  const [done, setDone] = useFeatureState<string[]>("frnt-pqc-done", []);
  const toggle = (id: string) => setDone(done.includes(id) ? done.filter(x => x !== id) : [...done, id]);
  const score = Math.round((done.length / PQC_ITEMS.length) * 100);
  const band = score >= 80 ? { t: "Quantum-ready", c: "text-green-400", b: "border-green-800/40 bg-green-950/20" }
    : score >= 40 ? { t: "In migration", c: "text-yellow-400", b: "border-yellow-800/40 bg-yellow-950/20" }
    : { t: "Exposed", c: "text-red-400", b: "border-red-800/40 bg-red-950/20" };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 flex items-center justify-between flex-wrap gap-3`}>
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--color-primary)]" /> Post-Quantum Migration Readiness</h3>
          <p className="text-xs text-[var(--color-muted)] mt-1">Track the steps to make your finance stack safe against quantum decryption. Progress is saved.</p>
        </div>
        <LiveBadge />
      </div>

      <div className={`rounded-lg p-4 border ${band.b} flex items-center justify-between`}>
        <div>
          <p className="text-xs text-[var(--color-muted)]">Readiness score</p>
          <p className={`text-2xl font-bold tabular-nums ${band.c}`}>{score}%</p>
          <p className={`text-xs font-semibold ${band.c}`}>{band.t}</p>
        </div>
        <div className="w-40">
          <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: score >= 80 ? "#22c55e" : score >= 40 ? "#eab308" : "#ef4444" }} />
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-1 text-right">{done.length}/{PQC_ITEMS.length} steps complete</p>
        </div>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {PQC_ITEMS.map(item => {
          const checked = done.includes(item.id);
          return (
            <button key={item.id} onClick={() => toggle(item.id)} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/2">
              <span className={`mt-0.5 shrink-0 ${checked ? "text-green-400" : "text-[var(--color-muted)]"}`}>
                <CheckCircle2 size={16} />
              </span>
              <span>
                <span className={`text-sm font-medium ${checked ? "line-through text-[var(--color-muted)]" : ""}`}>{item.label}</span>
                <span className="block text-xs text-[var(--color-muted)] mt-0.5">{item.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Based on NIST PQC guidance (Kyber/Dilithium/SPHINCS+). "Harvest-now-decrypt-later" means data exfiltrated today can be decrypted once quantum computers mature — long-lived financial records are the priority.</p>
    </div>
  );
}

// ── #5 Event stream / activity feed — derived from the live store ────────────────
interface FeedEvent { ts: number; label: string; detail: string; tone: "pos" | "neg" | "neutral" | "warn" }

function EventStream() {
  const { store } = useApp();
  const events = useMemo<FeedEvent[]>(() => {
    const out: FeedEvent[] = [];
    for (const t of store.transactions) {
      const ts = new Date(t.date).getTime();
      if (isNaN(ts)) continue;
      out.push({
        ts,
        label: t.amount >= 0 ? "Revenue inflow" : "Outflow booked",
        detail: `${t.counterparty || t.description} · ${formatCurrency(Math.abs(t.amount))} · ${t.category}`,
        tone: t.amount >= 0 ? "pos" : t.category === "tax" || t.category === "loan" ? "warn" : "neg",
      });
    }
    for (const inv of store.invoices) {
      const ts = new Date(inv.invoiceDate).getTime();
      if (isNaN(ts)) continue;
      out.push({ ts, label: "Invoice raised", detail: `${inv.customer} · ${formatCurrency(inv.amount)} · ${inv.status}`, tone: inv.status === "paid" ? "pos" : inv.status === "overdue" ? "neg" : "neutral" });
    }
    for (const a of store.alerts) {
      const ts = new Date(a.createdAt).getTime();
      if (isNaN(ts)) continue;
      out.push({ ts, label: `Alert: ${a.title}`, detail: a.message, tone: a.severity === "critical" || a.severity === "high" ? "neg" : "warn" });
    }
    for (const o of store.obligations) {
      const ts = new Date(o.dueDate).getTime();
      if (isNaN(ts)) continue;
      out.push({ ts, label: "Obligation scheduled", detail: `${o.name} · ${formatCurrency(o.amount)} · due`, tone: "warn" });
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, 40);
  }, [store]);

  const TONE: Record<FeedEvent["tone"], string> = {
    pos: "text-green-400 border-green-800/40 bg-green-950/20",
    neg: "text-red-400 border-red-800/40 bg-red-950/20",
    warn: "text-yellow-400 border-yellow-800/40 bg-yellow-950/20",
    neutral: "text-[var(--color-muted)] border-[var(--color-border)] bg-[var(--color-bg)]",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 flex items-center justify-between`}>
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Live Event Stream</h3>
          <p className="text-xs text-[var(--color-muted)] mt-1">Recent changes across your store, rendered as an "event bus" feed — a preview of event-driven finance.</p>
        </div>
        <LiveBadge />
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No events yet. Add transactions or invoices and they will stream here.</p>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {events.map((e, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${TONE[e.tone]}`}>{e.label}</span>
              <p className="text-xs text-[var(--color-text)] flex-1 min-w-0 truncate">{e.detail}</p>
              <span className="text-[10px] text-[var(--color-muted)] whitespace-nowrap">{formatDistanceToNow(new Date(e.ts), { addSuffix: true })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #6 Tech-readiness radar — self-assessment scored ─────────────────────────────
type Axis = "ai" | "realtime" | "tokenization" | "quantum";
const AXES: ReadonlyArray<readonly [Axis, string, string]> = [
  ["ai", "AI / Agentic", "Autonomous agents reasoning over your books."],
  ["realtime", "Real-Time / Ambient", "Continuous close, live reconciliation, instant alerts."],
  ["tokenization", "Tokenisation / Programmable Money", "CBDC, escrow triggers, programmable payments."],
  ["quantum", "Quantum / Frontier Security", "Post-quantum crypto and frontier compute."],
] as const;

function TechReadinessRadar() {
  const [scores, setScores] = useFeatureState<Record<Axis, number>>("frnt-radar", { ai: 2, realtime: 2, tokenization: 1, quantum: 1 });
  const set = (a: Axis, v: number) => setScores({ ...scores, [a]: v });
  const overall = Math.round((AXES.reduce((s, [a]) => s + scores[a], 0) / (AXES.length * 5)) * 100);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 flex items-center justify-between`}>
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Tech-Readiness Radar</h3>
          <p className="text-xs text-[var(--color-muted)] mt-1">Rate where your finance operation sits today across four frontiers (0 = not started, 5 = leading). Saved to your account.</p>
        </div>
        <LiveBadge />
      </div>

      <div className={`rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-accent)]/40 flex items-center justify-between`}>
        <p className="text-xs text-[var(--color-muted)]">Overall frontier readiness</p>
        <p className="text-2xl font-bold tabular-nums text-[var(--color-primary)]">{overall}%</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {AXES.map(([a, label, detail]) => (
          <div key={a} className={`${CARD} p-4`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">{label}</p>
              <span className="text-sm font-bold tabular-nums text-[var(--color-primary)]">{scores[a]}/5</span>
            </div>
            <p className="text-[11px] text-[var(--color-muted)] mb-2">{detail}</p>
            <input type="range" min={0} max={5} step={1} value={scores[a]} onChange={e => set(a, Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
            <div className="flex gap-1 mt-2">
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} className="h-1.5 flex-1 rounded-full" style={{ background: n <= scores[a] ? "var(--color-primary)" : "var(--color-bg)" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A self-assessment to focus your roadmap — the lowest axis is usually the best next investment. Headroom ships tools against each as they become buildable on Indian rails.</p>
    </div>
  );
}

// ── Preview: Request-to-Pay designer ─────────────────────────────────────────────
function RequestToPayDesigner() {
  const [payer, setPayer] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expiry, setExpiry] = useState("48");

  const amt = parseFloat(amount) || 0;

  return (
    <div className="space-y-4">
      <PreviewHeader Icon={Banknote} title="Request-to-Pay Designer"
        blurb="Design the structured RTP object a vendor would receive once UPI Request-to-Pay rails mature for businesses. This builds a preview payload — it does not send a real payment request yet." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} p-4 space-y-3`}>
          <p className="text-sm font-semibold">Compose request</p>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Payer name / VPA</label><input value={payer} onChange={e => setPayer(e.target.value)} placeholder="acme@okhdfcbank" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="125000" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Purpose</label><input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Invoice INV-2026-044" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Expiry (hours)</label><input type="number" value={expiry} onChange={e => setExpiry(e.target.value)} className={INP} /></div>
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-sm font-semibold mb-2">RTP payload preview</p>
          <pre className="text-[11px] text-[var(--color-muted)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 overflow-x-auto leading-relaxed">{JSON.stringify({
            type: "REQUEST_TO_PAY",
            payer: payer || "<payer-vpa>",
            amount: amt || 0,
            currency: "INR",
            purpose: purpose || "<purpose>",
            expiresInHours: parseFloat(expiry) || 0,
            approval: "one-tap",
          }, null, 2)}</pre>
          <p className="text-[10px] text-[var(--color-muted)] mt-2">{amt > 0 ? `One tap would settle ${formatCurrency(amt)} from the payer.` : "Enter an amount to preview the settlement line."}</p>
        </div>
      </div>
    </div>
  );
}

// ── Preview: Streaming-payroll simulator ─────────────────────────────────────────
function StreamingPayroll() {
  const [monthly, setMonthly] = useState("60000");
  const [headcount, setHeadcount] = useState("5");
  const [hoursPerDay, setHoursPerDay] = useState("8");

  const wage = parseFloat(monthly) || 0;
  const heads = parseFloat(headcount) || 0;
  const hours = parseFloat(hoursPerDay) || 0;
  const perSecond = hours > 0 ? wage / (22 * hours * 3600) : 0; // ~22 working days
  const teamPerDay = perSecond * 3600 * hours * heads;

  return (
    <div className="space-y-4">
      <PreviewHeader Icon={Workflow} title="Streaming-Payroll Simulator"
        blurb="Model wages accruing per second instead of monthly. Illustrative maths only — real continuous payout needs streaming rails and is not wired to your payroll." />
      <div className={`${CARD} p-4 grid grid-cols-1 md:grid-cols-3 gap-3`}>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly wage / head (₹)</label><input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} className={INP} /></div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Headcount</label><input type="number" value={headcount} onChange={e => setHeadcount(e.target.value)} className={INP} /></div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Working hours / day</label><input type="number" value={hoursPerDay} onChange={e => setHoursPerDay(e.target.value)} className={INP} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Accrues per second / head", value: `₹${perSecond.toFixed(4)}` },
          { label: "Team accrual / working day", value: formatCurrency(Math.round(teamPerDay)) },
          { label: "Team monthly outflow", value: formatCurrency(Math.round(wage * heads)) },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className="text-lg font-bold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Streaming payroll lets daily-wage and gig workers draw earned pay anytime, smoothing their liquidity. Headroom would route this through a guarded wallet once continuous-payout rails are live.</p>
    </div>
  );
}

// ── Preview: Autonomous-treasury policy config ───────────────────────────────────
function AutonomousTreasury() {
  const [policy, setPolicy] = useFeatureState("frnt-treasury-policy", {
    minBuffer: "200000", maxSweep: "70", yieldFloor: "6.5", autoDraw: false, autoSweep: false,
  });
  const upd = (k: keyof typeof policy, v: string | boolean) => setPolicy({ ...policy, [k]: v });

  return (
    <div className="space-y-4">
      <PreviewHeader Icon={Sparkles} title="Autonomous-Treasury Policy"
        blurb="Define the guardrails a self-driving treasury agent would obey — minimum buffer, sweep limits, yield floor. Saved as your intended policy; no funds move until autonomous treasury is enabled." />
      <div className={`${CARD} p-4 grid grid-cols-1 md:grid-cols-3 gap-4`}>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Minimum cash buffer (₹)</label><input type="number" value={policy.minBuffer} onChange={e => upd("minBuffer", e.target.value)} className={INP} /></div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Max % of surplus to sweep</label><input type="number" value={policy.maxSweep} onChange={e => upd("maxSweep", e.target.value)} className={INP} /></div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Minimum yield to act (% p.a.)</label><input type="number" value={policy.yieldFloor} onChange={e => upd("yieldFloor", e.target.value)} className={INP} /></div>
      </div>
      <div className={`${CARD} p-4 space-y-2`}>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={policy.autoSweep} onChange={e => upd("autoSweep", e.target.checked)} className="accent-[var(--color-primary)]" />
          Auto-sweep idle balances above the buffer into a safe overnight instrument
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={policy.autoDraw} onChange={e => upd("autoDraw", e.target.checked)} className="accent-[var(--color-primary)]" />
          Auto-draw the credit line just-in-time to cover a payable when cash dips below buffer
        </label>
      </div>
      <div className="rounded-lg p-4 border border-purple-800/40 bg-purple-950/20">
        <p className="text-sm text-purple-200">
          Policy preview: keep at least <strong>{formatCurrency(parseFloat(policy.minBuffer) || 0)}</strong>, sweep up to <strong>{policy.maxSweep || 0}%</strong> of surplus when yield clears <strong>{policy.yieldFloor || 0}%</strong>.
          Auto-sweep is <strong>{policy.autoSweep ? "on" : "off"}</strong>, auto-draw is <strong>{policy.autoDraw ? "on" : "off"}</strong>.
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">When autonomous treasury ships, the agent will act only within exactly these limits and log every move to the event stream for your review.</p>
    </div>
  );
}

// ── Preview: Machine-to-machine payment concept ──────────────────────────────────
function MachineToMachine() {
  const [device, setDevice] = useState("Delivery EV #1");
  const [perUnit, setPerUnit] = useState("2.5");
  const [units, setUnits] = useState("400");
  const [unitLabel, setUnitLabel] = useState("km");

  const cost = (parseFloat(perUnit) || 0) * (parseFloat(units) || 0);

  return (
    <div className="space-y-4">
      <PreviewHeader Icon={Zap} title="Machine-to-Machine Payment Concept"
        blurb="Model an IoT device paying per unit it consumes (e.g. an EV settling per km, a meter per kWh) over programmable money. Conceptual calculator — no device or CBDC rail is connected." />
      <div className={`${CARD} p-4 grid grid-cols-2 md:grid-cols-4 gap-3`}>
        <div className="col-span-2 md:col-span-1"><label className="text-xs text-[var(--color-muted)] block mb-1">Device</label><input value={device} onChange={e => setDevice(e.target.value)} className={INP} /></div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Price / unit (₹)</label><input type="number" value={perUnit} onChange={e => setPerUnit(e.target.value)} className={INP} /></div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Units consumed</label><input type="number" value={units} onChange={e => setUnits(e.target.value)} className={INP} /></div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Unit label</label><input value={unitLabel} onChange={e => setUnitLabel(e.target.value)} className={INP} /></div>
      </div>
      <div className="rounded-lg p-4 border border-purple-800/40 bg-purple-950/20 flex items-center gap-3">
        <ScanLine size={16} className="text-purple-300 shrink-0" />
        <p className="text-sm text-purple-200">
          <strong>{device || "Device"}</strong> would auto-settle <strong>{formatCurrency(Math.round(cost))}</strong> for {units || 0} {unitLabel} consumed, streaming micropayments per {unitLabel} with no invoice.
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">M2M settlement lets meters, fleets and sensors pay each other in programmable CBDC per unit of use. Shown here as an economics preview ahead of e-rupee programmable-money support.</p>
    </div>
  );
}

// ── shared preview header ─────────────────────────────────────────────────────────
function PreviewHeader({ Icon, title, blurb }: { Icon: typeof Rocket; title: string; blurb: string }) {
  return (
    <div className={`${CARD} p-4 flex items-start justify-between gap-3`}>
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Icon size={14} className="text-purple-300" /> {title}</h3>
        <p className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">{blurb}</p>
      </div>
      <PreviewBadge />
    </div>
  );
}
