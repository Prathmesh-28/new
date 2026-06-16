import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { computeFinancialSnapshot, type FinancialSnapshot } from "@/lib/finance";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  Bot, Sparkles, ListChecks, Send, MessageSquareText, Target, Bell,
  ShieldCheck, ToggleRight, ScrollText, CalendarRange, ArrowRight, Info,
  TrendingDown, AlertTriangle, CheckCircle2, Plus, Search, Wand2,
  ClipboardCheck, Calculator, Wallet, CalendarClock, ShieldAlert,
  Scissors, Gauge, Presentation, Circle,
  LineChart, HandCoins, FilePlus2, Timer, ListTodo, Lightbulb, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── shared styles (mirrors TaxPage / DebtPage input + card conventions) ──────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type TabId =
  | "overview" | "brief" | "actions" | "launcher" | "qa" | "goal"
  | "attention" | "guardrails" | "autopilot" | "audit" | "review"
  | "close" | "explain" | "prioritize" | "compliance-digest" | "risks"
  | "savings" | "targets" | "eod"
  | "cash-watch" | "collect-first" | "invoice-now" | "vendor-timing"
  | "this-week" | "kpi-explainer";

const TABS = [
  ["overview", "Overview", Bot],
  ["brief", "Daily CFO Brief", Sparkles],
  ["actions", "Recommended Actions", ListChecks],
  ["launcher", "Quick-Action Launcher", Send],
  ["qa", "Ask the Copilot", MessageSquareText],
  ["goal", "Runway Goal Planner", Target],
  ["close", "Month-End Close", ClipboardCheck],
  ["explain", "Explain a Number", Calculator],
  ["prioritize", "Payment Prioritizer", Wallet],
  ["compliance-digest", "Due This Week", CalendarClock],
  ["risks", "Top Risks", ShieldAlert],
  ["savings", "Savings Finder", Scissors],
  ["targets", "KPI Targets", Gauge],
  ["eod", "End-of-Day Brief", Presentation],
  ["cash-watch", "Cash Early-Warning", LineChart],
  ["collect-first", "Collect-First", HandCoins],
  ["invoice-now", "Invoice Now", FilePlus2],
  ["vendor-timing", "Pay Now vs Later", Timer],
  ["this-week", "This Week", ListTodo],
  ["kpi-explainer", "Off-Track KPI", Lightbulb],
  ["attention", "Attention Feed", Bell],
  ["guardrails", "Guardrails & Limits", ShieldCheck],
  ["autopilot", "Autopilot Toggles", ToggleRight],
  ["audit", "Action Log", ScrollText],
  ["review", "Weekly Review", CalendarRange],
] as const;

// Live signals the rule engine reads from the store snapshot.
interface Signals {
  cash: number;
  runwayDays: number;
  monthlyNet: number;
  monthlyExpense: number;
  overdueReceivable: number;
  accountsReceivable: number;
  dueToday: number;
  dueTodayCount: number;
  overdueInvoiceCount: number;
  obligationsDue90: number;
  topCustomerPct: number;
  dscr: number | null;
  healthScore: number;
  healthGrade: string;
}

function runwayLabel(days: number): string {
  if (days >= 999) return "cash-flow positive";
  if (days >= 365) return `${(days / 30).toFixed(0)} months`;
  return `${days} days`;
}

export default function CopilotPage() {
  const { store } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("overview");

  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);

  const signals = useMemo<Signals>(() => {
    const todayIso = new Date().toISOString().split("T")[0];
    const open = store.invoices.filter(i => i.status !== "paid");
    const dueTodayInv = open.filter(i => i.dueDate === todayIso);
    const dueObl = store.obligations.filter(o => o.dueDate === todayIso);
    return {
      cash: snap.cash,
      runwayDays: snap.runwayDays,
      monthlyNet: snap.monthlyNet,
      monthlyExpense: snap.monthlyExpense,
      overdueReceivable: snap.overdueReceivable,
      accountsReceivable: snap.accountsReceivable,
      dueToday: dueTodayInv.reduce((s, i) => s + i.amount, 0) + dueObl.reduce((s, o) => s + o.amount, 0),
      dueTodayCount: dueTodayInv.length + dueObl.length,
      overdueInvoiceCount: open.filter(i => i.dueDate < todayIso).length,
      obligationsDue90: snap.obligationsDue90,
      topCustomerPct: snap.topCustomerPct,
      dscr: snap.dscr,
      healthScore: snap.health.score,
      healthGrade: snap.health.grade,
    };
  }, [store, snap]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bot size={18} className="text-[var(--color-primary)]" /> AI CFO Copilot
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            An assistive layer over your live numbers — daily briefs, recommended actions and plain-language answers, all computed from your own data.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-accent)]/40 px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        <Info size={13} className="shrink-0 mt-px text-[var(--color-primary)]" />
        <span>
          The copilot is <strong className="text-[var(--color-text)]">assistive, not autonomous</strong>. Every suggestion is a rule-based read of your live data and every "action" is a preview that links you to the right page — nothing moves money or files anything on its own.
        </span>
      </div>

      {tab === "overview" && <Overview signals={signals} navigate={navigate} />}
      {tab === "brief" && <DailyBrief signals={signals} navigate={navigate} />}
      {tab === "actions" && <RecommendedActions signals={signals} navigate={navigate} />}
      {tab === "launcher" && <QuickActionLauncher navigate={navigate} />}
      {tab === "qa" && <CopilotQA signals={signals} />}
      {tab === "goal" && <RunwayGoalPlanner signals={signals} navigate={navigate} />}
      {tab === "close" && <MonthEndClose snap={snap} navigate={navigate} />}
      {tab === "explain" && <ExplainNumber snap={snap} signals={signals} navigate={navigate} />}
      {tab === "prioritize" && <PaymentPrioritizer signals={signals} navigate={navigate} />}
      {tab === "compliance-digest" && <ComplianceDigest snap={snap} navigate={navigate} />}
      {tab === "risks" && <TopRisks snap={snap} signals={signals} navigate={navigate} />}
      {tab === "savings" && <SavingsFinder navigate={navigate} />}
      {tab === "targets" && <KpiTargets snap={snap} signals={signals} />}
      {tab === "eod" && <EndOfDayBrief snap={snap} signals={signals} />}
      {tab === "cash-watch" && <CashEarlyWarning snap={snap} signals={signals} navigate={navigate} />}
      {tab === "collect-first" && <CollectFirstWorklist navigate={navigate} />}
      {tab === "invoice-now" && <InvoiceNowCandidates navigate={navigate} />}
      {tab === "vendor-timing" && <PayNowVsLater signals={signals} navigate={navigate} />}
      {tab === "this-week" && <ThisWeekFocus snap={snap} signals={signals} navigate={navigate} />}
      {tab === "kpi-explainer" && <KpiOffTrackExplainer snap={snap} signals={signals} navigate={navigate} />}
      {tab === "attention" && <AttentionFeed signals={signals} navigate={navigate} />}
      {tab === "guardrails" && <GuardrailsConfig />}
      {tab === "autopilot" && <AutopilotToggles />}
      {tab === "audit" && <ActionLog />}
      {tab === "review" && <WeeklyReview signals={signals} />}
    </div>
  );
}

type Nav = ReturnType<typeof useNavigate>;

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ signals, navigate }: { signals: Signals; navigate: Nav }) {
  const cards = [
    { label: "Cash on hand", value: formatAmount(signals.cash), color: "text-[var(--color-text)]", sub: "Across all bank accounts" },
    { label: "Runway", value: runwayLabel(signals.runwayDays), color: signals.runwayDays >= 999 ? "text-green-400" : signals.runwayDays < 90 ? "text-red-400" : "text-yellow-400", sub: signals.monthlyNet >= 0 ? "Net cash positive" : `Burning ${formatAmount(-signals.monthlyNet)}/mo` },
    { label: "Overdue receivables", value: formatAmount(signals.overdueReceivable), color: signals.overdueReceivable > 0 ? "text-red-400" : "text-green-400", sub: `${signals.overdueInvoiceCount} invoice(s) past due` },
    { label: "Health score", value: `${Math.round(signals.healthScore)} · ${signals.healthGrade}`, color: signals.healthScore >= 65 ? "text-green-400" : signals.healthScore >= 45 ? "text-yellow-400" : "text-red-400", sub: "Composite financial health" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Sparkles size={14} className="text-[var(--color-primary)]" /> What the copilot does</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          Think of it as a finance analyst that has read every number in your workspace. It summarises, ranks, and answers — then hands you to the page that does the real work.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            ["Daily CFO Brief", "A one-screen digest of cash, runway, overdue and what's due today.", "brief"],
            ["Recommended Actions", "Heuristic next-best-steps ranked by cash impact, each deep-linking to the right tool.", "actions"],
            ["Quick-Action Launcher", "Type what you want ('chase overdue', 'forecast') and jump straight there.", "launcher"],
            ["Ask the Copilot", "Plain-language answers to 'why is cash down?' grounded only in your metrics.", "qa"],
            ["Runway Goal Planner", "Set a runway target; the planner proposes a mix of collect / cut / borrow.", "goal"],
            ["Attention Feed", "Anomalies and risks surfaced from your data, newest first.", "attention"],
          ].map(([title, desc]) => (
            <button key={title} onClick={() => navigate("/copilot") /* in-page */}
              className="text-left bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 hover:border-[var(--color-primary)]/40 transition-colors">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-3">Jump to a related module</h2>
        <div className="flex flex-wrap gap-2">
          {[
            ["Forecast", "/forecast"], ["Collections", "/collections"], ["Receivables", "/receivables"],
            ["Spend", "/spend"], ["Credit", "/credit"], ["CFO Brief", "/cfo-brief"], ["Health", "/health"],
          ].map(([label, path]) => (
            <button key={path} onClick={() => navigate(path)}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] px-3 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40">
              {label} <ArrowRight size={11} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Daily CFO Brief ────────────────────────────────────────────────────────────
function DailyBrief({ signals, navigate }: { signals: Signals; navigate: Nav }) {
  const today = new Date();
  const lines: { text: string; tone: "good" | "warn" | "bad" | "info" }[] = [];

  lines.push({ tone: "info", text: `You're holding ${formatCurrency(Math.round(signals.cash))} in cash with ${runwayLabel(signals.runwayDays)} of runway at the current burn.` });
  if (signals.monthlyNet >= 0) lines.push({ tone: "good", text: `Operations are net cash positive (~${formatCurrency(Math.round(signals.monthlyNet))}/month).` });
  else lines.push({ tone: signals.runwayDays < 90 ? "bad" : "warn", text: `You're burning ~${formatCurrency(Math.round(-signals.monthlyNet))}/month. ${signals.runwayDays < 90 ? "Runway is under 3 months — act on the planner." : "Watch the burn."}` });
  if (signals.overdueReceivable > 0) lines.push({ tone: "warn", text: `${formatCurrency(Math.round(signals.overdueReceivable))} across ${signals.overdueInvoiceCount} invoice(s) is overdue — chasing it is the fastest cash you can raise.` });
  else lines.push({ tone: "good", text: "No overdue receivables — collections are clean." });
  if (signals.dueTodayCount > 0) lines.push({ tone: "warn", text: `${signals.dueTodayCount} item(s) worth ${formatCurrency(Math.round(signals.dueToday))} fall due today.` });
  if (signals.obligationsDue90 > 0) lines.push({ tone: "info", text: `${formatCurrency(Math.round(signals.obligationsDue90))} of obligations are due within 90 days — make sure the forecast covers them.` });
  if (signals.topCustomerPct >= 30) lines.push({ tone: "warn", text: `Your top customer is ${signals.topCustomerPct.toFixed(0)}% of revenue — concentration risk worth diversifying.` });

  const toneClass: Record<string, string> = {
    good: "text-green-400", warn: "text-yellow-400", bad: "text-red-400", info: "text-[var(--color-text)]",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Sparkles size={14} className="text-[var(--color-primary)]" /> Daily CFO Brief</h2>
          <span className="text-[10px] text-[var(--color-muted)]">{format(today, "EEEE, d MMM yyyy")} · auto-computed</span>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">A plain-language digest of the numbers that matter today. Refreshes automatically as your data changes.</p>
        <ul className="space-y-2.5">
          {lines.map((l, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${l.tone === "good" ? "bg-green-400" : l.tone === "warn" ? "bg-yellow-400" : l.tone === "bad" ? "bg-red-400" : "bg-[var(--color-primary)]"}`} />
              <span className={toneClass[l.tone]}>{l.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => navigate("/cfo-brief")} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">
            Open full CFO Brief <ArrowRight size={11} />
          </button>
          <button onClick={() => { navigator.clipboard?.writeText(lines.map(l => `• ${l.text}`).join("\n")); toast.success("Brief copied to clipboard"); }}
            className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">
            Copy brief
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recommended Actions ──────────────────────────────────────────────────────
interface ActionRec { id: string; title: string; why: string; impact: number; severity: "high" | "med" | "low"; path: string; cta: string }

function buildRecs(s: Signals): ActionRec[] {
  const recs: ActionRec[] = [];
  if (s.overdueReceivable > 0) recs.push({ id: "collect", title: "Chase overdue invoices", why: `${formatCurrency(Math.round(s.overdueReceivable))} across ${s.overdueInvoiceCount} invoice(s) is past due.`, impact: s.overdueReceivable, severity: "high", path: "/collections", cta: "Open Collections" });
  if (s.runwayDays < 120 && s.monthlyNet < 0) recs.push({ id: "runway", title: "Extend runway", why: `Only ${runwayLabel(s.runwayDays)} left at the current burn.`, impact: Math.round(-s.monthlyNet * 3), severity: s.runwayDays < 60 ? "high" : "med", path: "/credit", cta: "Arrange working capital" });
  if (s.monthlyExpense > 0 && s.monthlyNet < 0) recs.push({ id: "spend", title: "Review spend for cuts", why: "You're burning cash — trimming non-essential spend buys runway with no financing cost.", impact: Math.round(s.monthlyExpense * 0.1), severity: "med", path: "/spend", cta: "Open Spend" });
  if (s.obligationsDue90 > s.cash) recs.push({ id: "forecast", title: "Stress-test the forecast", why: `Obligations due in 90 days (${formatCurrency(Math.round(s.obligationsDue90))}) exceed current cash.`, impact: s.obligationsDue90, severity: "high", path: "/forecast", cta: "Open Forecast" });
  if (s.topCustomerPct >= 30) recs.push({ id: "concentration", title: "Diversify customer base", why: `Top customer is ${s.topCustomerPct.toFixed(0)}% of revenue — losing them would hurt.`, impact: 0, severity: "low", path: "/analytics", cta: "View concentration" });
  if (s.dscr !== null && s.dscr < 1.25) recs.push({ id: "debt", title: "Improve debt coverage", why: `DSCR is ${s.dscr.toFixed(2)}x, below the typical 1.25x lender bar.`, impact: 0, severity: "med", path: "/debt", cta: "Open Debt Manager" });
  if (recs.length === 0) recs.push({ id: "clear", title: "Nothing urgent", why: "No high-priority actions from your current data. Keep collections tight and the forecast fresh.", impact: 0, severity: "low", path: "/dashboard", cta: "Open Dashboard" });
  const order = { high: 0, med: 1, low: 2 };
  return recs.sort((a, b) => order[a.severity] - order[b.severity] || b.impact - a.impact);
}

function RecommendedActions({ signals, navigate }: { signals: Signals; navigate: Nav }) {
  const recs = useMemo(() => buildRecs(signals), [signals]);
  const [done, setDone] = useFeatureState<string[]>("cop-actions-dismissed", []);
  const sevColor: Record<string, string> = {
    high: "text-red-400 bg-red-950/30 border-red-800/30",
    med: "text-yellow-400 bg-yellow-950/30 border-yellow-800/30",
    low: "text-[var(--color-muted)] bg-[var(--color-accent)] border-[var(--color-border)]",
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted)] px-1">Heuristic next-best-steps, ranked by urgency and cash impact. Acting on one opens the page that actually does it — the copilot never executes by itself.</p>
      {recs.map(r => {
        const isDone = done.includes(r.id);
        return (
          <div key={r.id} className={`${CARD} p-4 flex items-start gap-4 ${isDone ? "opacity-50" : ""}`}>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 mt-0.5 ${sevColor[r.severity]}`}>
              {r.severity === "high" ? "HIGH" : r.severity === "med" ? "MED" : "LOW"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{r.why}</p>
              {r.impact > 0 && <p className="text-[11px] font-semibold text-green-400 mt-1">Potential cash impact: {formatCurrency(Math.round(r.impact))}</p>}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <button onClick={() => navigate(r.path)} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-medium whitespace-nowrap">
                {r.cta} <ArrowRight size={11} />
              </button>
              <button onClick={() => setDone(isDone ? done.filter(x => x !== r.id) : [...done, r.id])}
                className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)]">
                {isDone ? "Restore" : "Mark handled"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Quick-Action Launcher ────────────────────────────────────────────────────
interface Command { keywords: string[]; label: string; path: string }
const COMMANDS: Command[] = [
  { keywords: ["overdue", "chase", "collect", "dunning", "remind"], label: "Chase overdue invoices", path: "/collections" },
  { keywords: ["forecast", "cash flow", "projection", "13 week", "runway chart"], label: "Open the cash forecast", path: "/forecast" },
  { keywords: ["invoice", "bill", "raise", "receivable"], label: "Manage invoices & receivables", path: "/receivables" },
  { keywords: ["spend", "expense", "cut", "cost", "budget"], label: "Review spend & expenses", path: "/spend" },
  { keywords: ["loan", "credit", "borrow", "finance", "working capital"], label: "Explore credit options", path: "/credit" },
  { keywords: ["debt", "emi", "refinance", "prepay", "dscr"], label: "Open the Debt Manager", path: "/debt" },
  { keywords: ["tax", "gst", "advance tax", "tds", "compliance"], label: "Open Tax Autopilot", path: "/tax" },
  { keywords: ["scenario", "what if", "simulate", "model"], label: "Run a scenario", path: "/scenarios" },
  { keywords: ["valuation", "worth", "value", "equity"], label: "Check valuation", path: "/valuation" },
  { keywords: ["health", "score", "kpi", "ratio"], label: "Open Financial Health", path: "/health" },
  { keywords: ["report", "brief", "board", "investor"], label: "Open the CFO Brief", path: "/cfo-brief" },
  { keywords: ["payroll", "salary", "staff"], label: "Open Payroll", path: "/payroll" },
];

function QuickActionLauncher({ navigate }: { navigate: Nav }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return COMMANDS.slice(0, 6);
    const scored = COMMANDS
      .map(c => ({ c, score: c.keywords.reduce((s, k) => s + (term.includes(k) || k.includes(term) ? k.length : 0), 0) + (c.label.toLowerCase().includes(term) ? 5 : 0) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map(x => x.c);
  }, [q]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Send size={14} className="text-[var(--color-primary)]" /> Quick-Action Launcher</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Type what you want to do in plain words — the launcher matches keywords and takes you straight to the right module. It only navigates; it doesn't perform the task for you.</p>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="e.g. chase overdue, run a what-if, file GST…" className={`${INP} pl-9`} />
        </div>
      </div>
      {matches.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No matching action. Try words like “collect”, “forecast”, “spend” or “tax”.</p>
      ) : (
        <div className="space-y-2">
          {matches.map(m => (
            <button key={m.path} onClick={() => { toast.success(`Opening: ${m.label}`); navigate(m.path); }}
              className={`${CARD} w-full p-3 flex items-center justify-between hover:border-[var(--color-primary)]/40 transition-colors text-left`}>
              <span className="text-sm flex items-center gap-2"><Wand2 size={13} className="text-[var(--color-primary)]" /> {m.label}</span>
              <ArrowRight size={13} className="text-[var(--color-muted)]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Ask the Copilot (rule-based Q&A) ──────────────────────────────────────────
function answerQuestion(q: string, s: Signals): string {
  const t = q.toLowerCase();
  if (/runway|how long|last/.test(t)) return `At your current burn you have ${runwayLabel(s.runwayDays)} of runway on ${formatCurrency(Math.round(s.cash))} of cash. ${s.monthlyNet >= 0 ? "You're net cash positive, so runway is effectively indefinite." : `You're burning ${formatCurrency(Math.round(-s.monthlyNet))}/month.`}`;
  if (/cash down|why.*cash|burn|losing/.test(t)) return s.monthlyNet < 0 ? `Cash is falling because monthly outflows (${formatCurrency(Math.round(s.monthlyExpense))}) exceed inflows — a net burn of ${formatCurrency(Math.round(-s.monthlyNet))}. The fastest lever is the ${formatCurrency(Math.round(s.overdueReceivable))} in overdue receivables.` : `Cash isn't falling on an operating basis — you're net positive by ${formatCurrency(Math.round(s.monthlyNet))}/month. Any dip is timing of one-off items.`;
  if (/overdue|collect|owe|receivable/.test(t)) return `${formatCurrency(Math.round(s.overdueReceivable))} is overdue across ${s.overdueInvoiceCount} invoice(s), out of ${formatCurrency(Math.round(s.accountsReceivable))} total open receivables. Chasing it is your cheapest source of cash.`;
  if (/health|score|how.*doing/.test(t)) return `Your composite financial health is ${Math.round(s.healthScore)}/100 (grade ${s.healthGrade}). Open the Health page to see the per-driver breakdown.`;
  if (/debt|loan|emi|dscr|coverage/.test(t)) return s.dscr === null ? "You have no active debt on record, so debt-coverage isn't a concern right now." : `Your DSCR is ${s.dscr.toFixed(2)}x ${s.dscr >= 1.25 ? "— comfortably above the usual 1.25x lender bar." : "— below the 1.25x lender bar, which can limit refinancing."}`;
  if (/customer|concentration|biggest/.test(t)) return `Your largest customer is about ${s.topCustomerPct.toFixed(0)}% of revenue. ${s.topCustomerPct >= 30 ? "That's meaningful concentration — worth diversifying." : "Concentration looks healthy."}`;
  if (/due today|today|pay/.test(t)) return s.dueTodayCount > 0 ? `${s.dueTodayCount} item(s) worth ${formatCurrency(Math.round(s.dueToday))} fall due today.` : "Nothing falls due today.";
  return `I answer from your live metrics. Try: “what's my runway?”, “why is cash down?”, “how much is overdue?”, “what's my health score?” or “how's my debt coverage?”.`;
}

function CopilotQA({ signals }: { signals: Signals }) {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; a: string }[]>([]);
  const ask = () => {
    const question = q.trim();
    if (!question) return;
    setLog(prev => [{ q: question, a: answerQuestion(question, signals) }, ...prev]);
    setQ("");
  };
  const suggestions = ["What's my runway?", "Why is cash down?", "How much is overdue?", "What's my health score?", "How's my debt coverage?"];
  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><MessageSquareText size={14} className="text-[var(--color-primary)]" /> Ask the Copilot</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Plain-language answers grounded only in your stored metrics — no outside data, no guessing. Pattern-matched, so keep questions about cash, runway, receivables, debt or health.</p>
        <div className="flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()} placeholder="Ask about your finances…" className={INP} />
          <button onClick={ask} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium shrink-0"><Send size={13} /> Ask</button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {suggestions.map(sug => (
            <button key={sug} onClick={() => { setLog(prev => [{ q: sug, a: answerQuestion(sug, signals) }, ...prev]); }}
              className="text-[10px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40">
              {sug}
            </button>
          ))}
        </div>
      </div>
      {log.length > 0 && (
        <div className="space-y-3">
          {log.map((entry, i) => (
            <div key={i} className={`${CARD} p-4`}>
              <p className="text-sm font-medium flex items-start gap-2"><MessageSquareText size={13} className="text-[var(--color-primary)] mt-0.5 shrink-0" /> {entry.q}</p>
              <p className="text-sm text-[var(--color-muted)] mt-2 pl-5">{entry.a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Runway Goal Planner ───────────────────────────────────────────────────────
function RunwayGoalPlanner({ signals, navigate }: { signals: Signals; navigate: Nav }) {
  const [targetMonths, setTargetMonths] = useState(12);
  const monthlyBurn = Math.max(0, -signals.monthlyNet);
  const currentMonths = signals.runwayDays >= 999 ? 999 : signals.runwayDays / 30;

  const plan = useMemo(() => {
    if (monthlyBurn <= 0) return null;
    const cashNeeded = targetMonths * monthlyBurn;
    const gap = Math.max(0, cashNeeded - signals.cash);
    // Heuristic split of the gap across the three classic levers.
    const collect = Math.min(gap, signals.overdueReceivable);
    const afterCollect = gap - collect;
    const cut = Math.min(afterCollect, signals.monthlyExpense * 0.1 * targetMonths); // ~10% spend trim over the horizon
    const borrow = Math.max(0, afterCollect - cut);
    return { cashNeeded, gap, collect, cut, borrow };
  }, [targetMonths, monthlyBurn, signals]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Target size={14} className="text-[var(--color-primary)]" /> Runway Goal Planner</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Set a runway target and the planner proposes a heuristic mix of collecting, cutting and borrowing to close the gap. It's a suggestion to act on — not an instruction to anything.</p>
        <label className="text-xs text-[var(--color-muted)] block mb-1">Target runway: <strong className="text-[var(--color-text)]">{targetMonths} months</strong></label>
        <input type="range" min={3} max={24} step={1} value={targetMonths} onChange={e => setTargetMonths(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        <p className="text-[11px] text-[var(--color-muted)] mt-2">Today: {currentMonths >= 999 ? "cash-flow positive" : `${currentMonths.toFixed(1)} months`} of runway on {formatCurrency(Math.round(signals.cash))}.</p>
      </div>

      {monthlyBurn <= 0 ? (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm font-bold text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> You're net cash positive — runway is effectively unlimited. No funding gap to plan for.</p>
        </div>
      ) : plan && plan.gap === 0 ? (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm font-bold text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> Your current cash already covers {targetMonths} months of burn — no gap to close.</p>
        </div>
      ) : plan && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Cash needed", value: formatAmount(plan.cashNeeded), color: "text-[var(--color-text)]" },
              { label: "Funding gap", value: formatAmount(plan.gap), color: "text-red-400" },
              { label: "Monthly burn", value: formatAmount(monthlyBurn), color: "text-yellow-400" },
              { label: "Target", value: `${targetMonths} mo`, color: "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} p-5 space-y-3`}>
            <p className="text-sm font-semibold">Suggested plan to close the {formatCurrency(Math.round(plan.gap))} gap</p>
            {[
              { label: "Collect overdue receivables", amt: plan.collect, path: "/collections", cta: "Chase now" },
              { label: "Trim ~10% of discretionary spend", amt: plan.cut, path: "/spend", cta: "Review spend" },
              { label: "Arrange working-capital credit", amt: plan.borrow, path: "/credit", cta: "Explore credit" },
            ].filter(step => step.amt > 0).map(step => (
              <div key={step.label} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm">{step.label}</p>
                  <p className="text-[11px] font-semibold text-green-400 mt-0.5">{formatCurrency(Math.round(step.amt))}</p>
                </div>
                <button onClick={() => navigate(step.path)} className="flex items-center gap-1 text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--color-primary)]/25 whitespace-nowrap">
                  {step.cta} <ArrowRight size={11} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Attention Feed (anomalies / risks) ────────────────────────────────────────
function AttentionFeed({ signals, navigate }: { signals: Signals; navigate: Nav }) {
  const { store } = useApp();
  const items = useMemo(() => {
    const out: { id: string; severity: "high" | "med" | "low"; text: string; path: string }[] = [];
    if (signals.runwayDays < 90 && signals.monthlyNet < 0) out.push({ id: "runway", severity: "high", text: `Runway has dropped below 3 months (${runwayLabel(signals.runwayDays)}).`, path: "/forecast" });
    if (signals.overdueReceivable > 0) out.push({ id: "overdue", severity: signals.overdueInvoiceCount > 3 ? "high" : "med", text: `${signals.overdueInvoiceCount} invoice(s) overdue totalling ${formatCurrency(Math.round(signals.overdueReceivable))}.`, path: "/collections" });
    if (signals.dueTodayCount > 0) out.push({ id: "duetoday", severity: "med", text: `${signals.dueTodayCount} item(s) due today (${formatCurrency(Math.round(signals.dueToday))}).`, path: "/receivables" });
    // Spike detection: any single expense > 3x the median expense this month.
    const exp = store.transactions.filter(t => t.amount < 0).map(t => Math.abs(t.amount)).sort((a, b) => a - b);
    if (exp.length >= 4) {
      const median = exp[Math.floor(exp.length / 2)];
      const max = exp[exp.length - 1];
      if (median > 0 && max > median * 3) out.push({ id: "spike", severity: "med", text: `Unusual expense detected: ${formatCurrency(Math.round(max))} is over 3× your typical outflow.`, path: "/spend" });
    }
    if (signals.topCustomerPct >= 30) out.push({ id: "conc", severity: "low", text: `Customer concentration: top customer is ${signals.topCustomerPct.toFixed(0)}% of revenue.`, path: "/analytics" });
    if (signals.dscr !== null && signals.dscr < 1.25) out.push({ id: "dscr", severity: "med", text: `DSCR at ${signals.dscr.toFixed(2)}x is below the 1.25x lender bar.`, path: "/debt" });
    const order = { high: 0, med: 1, low: 2 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [signals, store.transactions]);

  const sevColor: Record<string, string> = {
    high: "text-red-400 bg-red-950/30 border-red-800/30",
    med: "text-yellow-400 bg-yellow-950/30 border-yellow-800/30",
    low: "text-[var(--color-muted)] bg-[var(--color-accent)] border-[var(--color-border)]",
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted)] px-1">Things the copilot flagged from your data, most urgent first. These are heuristic detections — review before acting.</p>
      {items.length === 0 ? (
        <div className="rounded-lg p-6 text-center border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <CheckCircle2 size={22} className="mx-auto text-green-400 mb-2" />
          <p className="text-sm font-medium">Nothing needs your attention</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">No anomalies or risks in your current data.</p>
        </div>
      ) : items.map(it => (
        <div key={it.id} className={`${CARD} p-4 flex items-start gap-3`}>
          <AlertTriangle size={15} className={`shrink-0 mt-0.5 ${it.severity === "high" ? "text-red-400" : it.severity === "med" ? "text-yellow-400" : "text-[var(--color-muted)]"}`} />
          <div className="flex-1 min-w-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${sevColor[it.severity]}`}>{it.severity.toUpperCase()}</span>
            <p className="text-sm mt-1.5">{it.text}</p>
          </div>
          <button onClick={() => navigate(it.path)} className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline shrink-0 mt-1">Investigate <ArrowRight size={11} /></button>
        </div>
      ))}
    </div>
  );
}

// ── Guardrails & Spending Limits (stored config) ──────────────────────────────
interface Guardrails {
  perActionLimit: number;
  dailyLimit: number;
  requireApprovalOver: number;
  allowlistOnly: boolean;
  quietHours: boolean;
}
const DEFAULT_GUARDRAILS: Guardrails = { perActionLimit: 25000, dailyLimit: 100000, requireApprovalOver: 10000, allowlistOnly: true, quietHours: true };

function GuardrailsConfig() {
  const [g, setG] = useFeatureState<Guardrails>("cop-guardrails", DEFAULT_GUARDRAILS);
  const set = <K extends keyof Guardrails>(k: K, v: Guardrails[K]) => setG({ ...g, [k]: v });
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-4 py-2.5 text-[11px] text-yellow-300">
        <Info size={13} className="shrink-0 mt-px" />
        These limits are saved as <strong>your stated policy</strong>. Because the copilot is assistive only, nothing enforces them automatically yet — they document the boundaries any future automation must respect.
      </div>
      <div className={`${CARD} p-5 space-y-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--color-primary)]" /> Guardrails & Spending Limits</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([
            ["perActionLimit", "Per-action limit (₹)"],
            ["dailyLimit", "Daily total limit (₹)"],
            ["requireApprovalOver", "Require approval over (₹)"],
          ] as const).map(([k, label]) => (
            <div key={k}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{label}</label>
              <input type="number" value={g[k]} onChange={e => set(k, Number(e.target.value) || 0)} className={INP} />
            </div>
          ))}
        </div>
        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={g.allowlistOnly} onChange={e => set("allowlistOnly", e.target.checked)} className="accent-[var(--color-primary)]" />
            Restrict any payments to approved counterparties only (allowlist)
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={g.quietHours} onChange={e => set("quietHours", e.target.checked)} className="accent-[var(--color-primary)]" />
            Defer non-urgent suggestions and nudges to working hours
          </label>
        </div>
        <button onClick={() => { setG(DEFAULT_GUARDRAILS); toast.success("Guardrails reset to safe defaults"); }}
          className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">
          Reset to safe defaults
        </button>
      </div>
      <div className={`${CARD} p-4 grid grid-cols-2 md:grid-cols-3 gap-3`}>
        {[
          { label: "Per-action cap", value: formatCurrency(g.perActionLimit) },
          { label: "Daily cap", value: formatCurrency(g.dailyLimit) },
          { label: "Approval threshold", value: formatCurrency(g.requireApprovalOver) },
        ].map(k => (
          <div key={k.label}>
            <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{k.label}</p>
            <p className="text-base font-bold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Autopilot Toggles (simulated, clearly labelled) ───────────────────────────
interface AutopilotState { brief: boolean; collections: boolean; spend: boolean; compliance: boolean; forecast: boolean }
const AUTOPILOT_META: { key: keyof AutopilotState; label: string; desc: string }[] = [
  { key: "brief", label: "Daily brief", desc: "Compile a morning CFO digest from your numbers." },
  { key: "collections", label: "Collections nudges", desc: "Draft reminders for overdue invoices for you to send." },
  { key: "spend", label: "Spend watch", desc: "Flag unusual expenses in the attention feed." },
  { key: "compliance", label: "Compliance radar", desc: "Surface upcoming tax/GST deadlines." },
  { key: "forecast", label: "Forecast refresh", desc: "Recompute runway as new data arrives." },
];

function AutopilotToggles() {
  const [state, setState] = useFeatureState<AutopilotState>("cop-autopilot", { brief: true, collections: false, spend: true, compliance: true, forecast: true });
  const toggle = (k: keyof AutopilotState) => setState({ ...state, [k]: !state[k] });
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-4 py-2.5 text-[11px] text-yellow-300">
        <Info size={13} className="shrink-0 mt-px" />
        <span><strong>Simulated preview.</strong> These toggles record which assists you'd want on. They only control which suggestions and feeds the copilot prepares — none of them move money, send messages, or file anything automatically.</span>
      </div>
      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {AUTOPILOT_META.map(m => (
          <div key={m.key} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-medium">{m.label}</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{m.desc}</p>
            </div>
            <button onClick={() => toggle(m.key)} role="switch" aria-checked={state[m.key]}
              className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${state[m.key] ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--color-bg)] transition-transform ${state[m.key] ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Action / Audit Log ────────────────────────────────────────────────────────
interface LogEntry { id: string; ts: string; text: string }
function ActionLog() {
  const [log, setLog] = useFeatureState<LogEntry[]>("cop-audit-log", []);
  const [note, setNote] = useState("");
  const add = () => {
    if (!note.trim()) { toast.error("Describe the action you took"); return; }
    setLog([{ id: crypto.randomUUID(), ts: new Date().toISOString(), text: note.trim() }, ...log]);
    setNote("");
    toast.success("Logged");
  };
  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ScrollText size={14} className="text-[var(--color-primary)]" /> Action Log</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">A manual record of actions you took on the copilot's advice — your own assistive audit trail. Useful for CA review and for tracking what worked.</p>
        <div className="flex gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="e.g. Chased 3 overdue invoices after the daily brief" className={INP} />
          <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium shrink-0"><Plus size={13} /> Log</button>
        </div>
      </div>
      {log.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No entries yet. Anything you log here is stored with your workspace.</p>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {log.map(e => (
            <div key={e.id} className="flex items-start gap-3 p-3.5">
              <CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{e.text}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{format(new Date(e.ts), "d MMM yyyy, h:mm a")}</p>
              </div>
              <button onClick={() => setLog(log.filter(x => x.id !== e.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400 shrink-0">Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Weekly Review generator ────────────────────────────────────────────────────
function WeeklyReview({ signals }: { signals: Signals }) {
  const today = new Date();
  const review = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Weekly Review — ${format(today, "d MMM yyyy")}`);
    lines.push("");
    lines.push(`Cash: ${formatCurrency(Math.round(signals.cash))} · Runway: ${runwayLabel(signals.runwayDays)} · Health: ${Math.round(signals.healthScore)}/100 (${signals.healthGrade})`);
    lines.push(`Monthly net: ${signals.monthlyNet >= 0 ? "+" : ""}${formatCurrency(Math.round(signals.monthlyNet))}`);
    lines.push("");
    lines.push("Wins:");
    if (signals.monthlyNet >= 0) lines.push("• Operations are net cash positive.");
    if (signals.overdueReceivable === 0) lines.push("• No overdue receivables.");
    if (signals.dscr !== null && signals.dscr >= 1.25) lines.push(`• Debt coverage healthy (DSCR ${signals.dscr.toFixed(2)}x).`);
    if (signals.healthScore >= 65) lines.push(`• Strong overall health grade (${signals.healthGrade}).`);
    lines.push("");
    lines.push("Watch-outs:");
    if (signals.overdueReceivable > 0) lines.push(`• ${formatCurrency(Math.round(signals.overdueReceivable))} overdue across ${signals.overdueInvoiceCount} invoice(s).`);
    if (signals.monthlyNet < 0) lines.push(`• Net burn of ${formatCurrency(Math.round(-signals.monthlyNet))}/month.`);
    if (signals.runwayDays < 120) lines.push(`• Runway under 4 months.`);
    if (signals.topCustomerPct >= 30) lines.push(`• Customer concentration at ${signals.topCustomerPct.toFixed(0)}%.`);
    if (signals.obligationsDue90 > 0) lines.push(`• ${formatCurrency(Math.round(signals.obligationsDue90))} of obligations due in 90 days.`);
    return lines.join("\n");
  }, [signals, today]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarRange size={14} className="text-[var(--color-primary)]" /> Weekly Review</h2>
          <button onClick={() => { navigator.clipboard?.writeText(review); toast.success("Weekly review copied"); }}
            className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40 flex items-center gap-1.5">
            <TrendingDown size={11} className="rotate-180" /> Copy
          </button>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">An auto-generated wins / watch-outs summary built from this week's numbers. Paste it into your team update or board notes.</p>
        <pre className="text-xs whitespace-pre-wrap bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 leading-relaxed text-[var(--color-text)] font-sans">{review}</pre>
      </div>
    </div>
  );
}

// ── Month-End Close Checklist (auto-status from store) ─────────────────────────
// A pre-close checklist whose status is read from your live data where the data
// can answer it, and manually tickable where only you can. Assistive only — it
// tells you what looks done vs. open; it doesn't post or file anything.
function MonthEndClose({ snap, navigate }: { snap: FinancialSnapshot; navigate: Nav }) {
  const { store } = useApp();
  const monthLabel = format(new Date(), "MMMM yyyy");

  const auto = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const unflagged = store.transactions.filter(t => t.date.startsWith(monthKey) && (t.counterparty || "").trim() === "").length;
    const draftPo = store.procurement.filter(p => p.status === "draft").length;
    const overdueObl = store.obligations.filter(o => o.dueDate < new Date().toISOString().split("T")[0]).length;
    const items: { id: string; label: string; detail: string; status: "done" | "open" | "review"; path?: string }[] = [
      {
        id: "txns", label: "All transactions categorised",
        detail: unflagged === 0 ? "Every transaction this month has a counterparty." : `${unflagged} transaction(s) this month have no counterparty — label them.`,
        status: unflagged === 0 ? "done" : "review", path: "/transactions",
      },
      {
        id: "ar", label: "Receivables reviewed",
        detail: snap.overdueReceivable === 0 ? "No overdue invoices outstanding." : `${formatCurrency(Math.round(snap.overdueReceivable))} overdue — chase or write-off before close.`,
        status: snap.overdueReceivable === 0 ? "done" : "review", path: "/receivables",
      },
      {
        id: "ap", label: "Payables / POs settled",
        detail: draftPo === 0 ? "No draft purchase orders pending." : `${draftPo} draft PO(s) awaiting approval.`,
        status: draftPo === 0 ? "done" : "open", path: "/spend",
      },
      {
        id: "obl", label: "Obligations current",
        detail: overdueObl === 0 ? "No overdue obligations on the calendar." : `${overdueObl} obligation(s) past due.`,
        status: overdueObl === 0 ? "done" : "review", path: "/compliance",
      },
      {
        id: "gst", label: "GST position computed",
        detail: `Net GST payable this month ≈ ${formatCurrency(snap.gstThisMonth.netPayable)} (ITC ${formatCurrency(snap.gstThisMonth.inputCredit)}).`,
        status: "review", path: "/tax",
      },
    ];
    return items;
  }, [store, snap]);

  // Manual sign-offs the data can't verify (durable).
  const MANUAL = [
    { id: "bank", label: "Bank statements reconciled" },
    { id: "depr", label: "Depreciation & accruals posted" },
    { id: "payroll", label: "Payroll & statutory dues run" },
    { id: "review", label: "Owner / CA sign-off on numbers" },
  ];
  const [checked, setChecked] = useFeatureState<string[]>("cop-close-checklist", []);
  const toggle = (id: string) => setChecked(checked.includes(id) ? checked.filter(x => x !== id) : [...checked, id]);

  const autoDone = auto.filter(a => a.status === "done").length;
  const manualDone = MANUAL.filter(m => checked.includes(m.id)).length;
  const total = auto.length + MANUAL.length;
  const done = autoDone + manualDone;
  const pct = Math.round((done / total) * 100);

  const statusDot: Record<string, string> = { done: "text-green-400", open: "text-[var(--color-muted)]", review: "text-yellow-400" };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck size={14} className="text-[var(--color-primary)]" /> Month-End Close · {monthLabel}</h2>
          <span className="text-[10px] text-[var(--color-muted)]">{done}/{total} steps · {pct}%</span>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Status is auto-read from your data where possible and tickable where only you can confirm. This is a checklist, not an automation — nothing closes the books for you.</p>
        <div className="h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
          <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {auto.map(a => (
          <div key={a.id} className="flex items-start gap-3 p-4">
            {a.status === "done"
              ? <CheckCircle2 size={15} className="text-green-400 shrink-0 mt-0.5" />
              : <AlertTriangle size={15} className={`shrink-0 mt-0.5 ${statusDot[a.status]}`} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{a.label} <span className="text-[10px] text-[var(--color-muted)] font-normal">· auto</span></p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{a.detail}</p>
            </div>
            {a.path && a.status !== "done" && (
              <button onClick={() => navigate(a.path!)} className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline shrink-0 mt-0.5">Open <ArrowRight size={11} /></button>
            )}
          </div>
        ))}
        {MANUAL.map(m => {
          const isDone = checked.includes(m.id);
          return (
            <button key={m.id} onClick={() => toggle(m.id)} className="w-full flex items-start gap-3 p-4 text-left hover:bg-[var(--color-accent)]/40 transition-colors">
              {isDone ? <CheckCircle2 size={15} className="text-green-400 shrink-0 mt-0.5" /> : <Circle size={15} className="text-[var(--color-muted)] shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isDone ? "line-through text-[var(--color-muted)]" : ""}`}>{m.label} <span className="text-[10px] text-[var(--color-muted)] font-normal no-underline">· manual sign-off</span></p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Explain a Number (drill-down helper) ──────────────────────────────────────
// Pick a headline metric and the copilot shows how it was built from your data —
// the inputs, the formula in words, and where to dig further. Read-only.
function ExplainNumber({ snap, signals, navigate }: { snap: FinancialSnapshot; signals: Signals; navigate: Nav }) {
  type Metric = { id: string; label: string; value: string; formula: string; rows: { k: string; v: string }[]; path: string };
  const metrics = useMemo<Metric[]>(() => [
    {
      id: "runway", label: "Runway", value: runwayLabel(signals.runwayDays), path: "/forecast",
      formula: "Cash on hand ÷ daily net burn (3-month average).",
      rows: [
        { k: "Cash on hand", v: formatCurrency(Math.round(signals.cash)) },
        { k: "Avg monthly revenue (3mo)", v: formatCurrency(Math.round(snap.monthlyRevenue)) },
        { k: "Avg monthly expense (3mo)", v: formatCurrency(Math.round(snap.monthlyExpense)) },
        { k: "Monthly net", v: `${signals.monthlyNet >= 0 ? "+" : ""}${formatCurrency(Math.round(signals.monthlyNet))}` },
        { k: "Daily burn", v: signals.monthlyNet < 0 ? formatCurrency(Math.round(-signals.monthlyNet / 30)) : "—" },
      ],
    },
    {
      id: "margin", label: "Gross margin", value: snap.grossMarginPct === null ? "n/a" : `${snap.grossMarginPct.toFixed(0)}%`, path: "/analytics",
      formula: "(6-month revenue − 6-month expense) ÷ 6-month revenue.",
      rows: [
        { k: "Revenue (6mo)", v: formatCurrency(Math.round(snap.months.reduce((s, m) => s + m.revenue, 0))) },
        { k: "Expense (6mo)", v: formatCurrency(Math.round(snap.months.reduce((s, m) => s + m.expense, 0))) },
      ],
    },
    {
      id: "dscr", label: "Debt coverage (DSCR)", value: snap.dscr === null ? "no debt" : `${snap.dscr.toFixed(2)}x`, path: "/debt",
      formula: "(Monthly net + monthly debt service) ÷ monthly debt service.",
      rows: [
        { k: "Monthly net", v: `${signals.monthlyNet >= 0 ? "+" : ""}${formatCurrency(Math.round(signals.monthlyNet))}` },
        { k: "Monthly debt service", v: formatCurrency(Math.round(snap.monthlyDebtService)) },
        { k: "Lender bar", v: "≥ 1.25x" },
      ],
    },
    {
      id: "ccc", label: "Cash conversion cycle", value: `${snap.cccDays} days`, path: "/working-capital",
      formula: "DSO + DIO − DPO (days cash is tied up in the operating cycle).",
      rows: [
        { k: "Days sales outstanding (DSO)", v: `${snap.dsoDays} d` },
        { k: "Days inventory outstanding (DIO)", v: `${snap.dioDays} d` },
        { k: "Days payables outstanding (DPO)", v: `${snap.dpoDays} d` },
        { k: "Cash tied up", v: formatCurrency(Math.round(snap.workingCapitalGap)) },
      ],
    },
    {
      id: "health", label: "Health score", value: `${Math.round(signals.healthScore)} · ${signals.healthGrade}`, path: "/health",
      formula: "Weighted average of seven driver scores (liquidity 25%, profitability 20%, …).",
      rows: snap.health.components.map(c => ({ k: `${c.label} (${c.weight}%)`, v: `${Math.round(c.score)}/100` })),
    },
  ], [snap, signals]);

  const [sel, setSel] = useState<string>("runway");
  const m = metrics.find(x => x.id === sel) ?? metrics[0];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> Explain a Number</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Pick a headline figure and see exactly how it was computed from your data — the inputs, the formula in plain words, and where to dig in. Nothing here changes a value.</p>
        <div className="flex flex-wrap gap-1.5">
          {metrics.map(x => (
            <button key={x.id} onClick={() => setSel(x.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${sel === x.id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
          <p className="text-sm text-[var(--color-muted)]">{m.label}</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-text)]">{m.value}</p>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] mb-4 italic">{m.formula}</p>
        <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {m.rows.map(r => (
            <div key={r.k} className="flex items-center justify-between py-2 text-sm">
              <span className="text-[var(--color-muted)]">{r.k}</span>
              <span className="tabular-nums font-medium">{r.v}</span>
            </div>
          ))}
        </div>
        <button onClick={() => navigate(m.path)} className="mt-4 flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">
          See the underlying detail <ArrowRight size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Payment Prioritizer (which to pay first within available cash) ─────────────
// Ranks upcoming obligations and approved POs by urgency, then walks down the
// list spending only the cash you have — a suggestion to triage, never a payment.
function PaymentPrioritizer({ signals, navigate }: { signals: Signals; navigate: Nav }) {
  const { store } = useApp();
  const [reserve, setReserve] = useFeatureState<number>("cop-pay-reserve", 0);

  const ranked = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const horizon = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    // Urgency weight per obligation type — statutory first, then payroll, loans, other.
    const typeRank: Record<string, number> = { tax: 0, payroll: 1, loan: 2, other: 3 };
    type Bill = { id: string; name: string; amount: number; dueDate: string; kind: string; rank: number };
    const bills: Bill[] = [];
    store.obligations
      .filter(o => o.dueDate <= horizon)
      .forEach(o => bills.push({ id: `obl-${o.id}`, name: o.name, amount: o.amount, dueDate: o.dueDate, kind: o.type, rank: typeRank[o.type] ?? 3 }));
    store.procurement
      .filter(p => p.status === "approved" || p.status === "ordered")
      .slice(0, 8)
      .forEach(p => bills.push({ id: `po-${p.id}`, name: `${p.supplierName} (PO)`, amount: p.totalValue, dueDate: p.expectedDate, kind: "supplier", rank: 4 }));
    // Sort: overdue first, then by type urgency, then by due date.
    return bills.sort((a, b) => {
      const ao = a.dueDate < today ? 0 : 1, bo = b.dueDate < today ? 0 : 1;
      return ao - bo || a.rank - b.rank || a.dueDate.localeCompare(b.dueDate);
    });
  }, [store]);

  const spendable = Math.max(0, signals.cash - reserve);
  let running = 0;
  const plan = ranked.map(b => {
    const before = running;
    running += b.amount;
    const covered = before + b.amount <= spendable;
    const partial = !covered && before < spendable;
    return { ...b, covered, partial, payNow: covered ? b.amount : partial ? spendable - before : 0 };
  });
  const totalDue = ranked.reduce((s, b) => s + b.amount, 0);
  const shortfall = Math.max(0, totalDue - spendable);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Payment Prioritizer</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">When cash is tight, this ranks what's due in the next 30 days — statutory dues and payroll first — and walks down the list spending only the cash you have. It's triage advice; it never releases a payment.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Cash on hand", value: formatAmount(signals.cash), color: "text-[var(--color-text)]" },
            { label: "Spendable now", value: formatAmount(spendable), color: "text-green-400" },
            { label: "Due (30 days)", value: formatAmount(totalDue), color: "text-yellow-400" },
            { label: "Shortfall", value: formatAmount(shortfall), color: shortfall > 0 ? "text-red-400" : "text-green-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
        <label className="text-xs text-[var(--color-muted)] block mt-4 mb-1">Keep a cash reserve untouched (₹)</label>
        <input type="number" value={reserve} onChange={e => setReserve(Math.max(0, Number(e.target.value) || 0))} className={INP} />
      </div>

      {plan.length === 0 ? (
        <div className="rounded-lg p-6 text-center border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <CheckCircle2 size={22} className="mx-auto text-green-400 mb-2" />
          <p className="text-sm font-medium">Nothing due in the next 30 days</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">No obligations or approved POs to prioritise.</p>
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {plan.map((b, i) => (
            <div key={b.id} className="flex items-center gap-3 p-4">
              <span className="text-xs font-bold text-[var(--color-muted)] w-5 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{b.name}</p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                  {formatCurrency(Math.round(b.amount))} · {b.kind} · due {format(new Date(b.dueDate), "d MMM")}
                  {b.dueDate < new Date().toISOString().split("T")[0] && <span className="text-red-400"> · overdue</span>}
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${b.covered ? "text-green-400 bg-green-950/30 border-green-800/30" : b.partial ? "text-yellow-400 bg-yellow-950/30 border-yellow-800/30" : "text-red-400 bg-red-950/30 border-red-800/30"}`}>
                {b.covered ? "PAY NOW" : b.partial ? `PARTIAL ${formatCurrency(Math.round(b.payNow))}` : "DEFER"}
              </span>
            </div>
          ))}
        </div>
      )}
      {shortfall > 0 && (
        <button onClick={() => navigate("/credit")} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">
          {formatCurrency(Math.round(shortfall))} short — explore working capital <ArrowRight size={11} />
        </button>
      )}
    </div>
  );
}

// ── Compliance / Tax Due-This-Week digest ─────────────────────────────────────
// Pulls the advance-tax schedule and obligation calendar into one "what's due
// soon" list. Surfaces deadlines; filing still happens on the relevant page.
function ComplianceDigest({ snap, navigate }: { snap: FinancialSnapshot; navigate: Nav }) {
  const { store } = useApp();
  const [horizon, setHorizon] = useState(7);

  const items = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const end = new Date(now.getTime() + horizon * 86400000).toISOString().split("T")[0];
    const out: { id: string; name: string; amount: number; dueDate: string; kind: string; overdue: boolean }[] = [];
    store.obligations.forEach(o => {
      if (o.dueDate <= end) out.push({ id: `o-${o.id}`, name: o.name, amount: o.amount, dueDate: o.dueDate, kind: o.type, overdue: o.dueDate < today });
    });
    snap.advanceTax.filter(a => a.dueDate >= today && a.dueDate <= end).forEach((a, i) => {
      out.push({ id: `at-${i}`, name: `Advance tax · ${a.label.split("·")[0].trim()}`, amount: a.installment, dueDate: a.dueDate, kind: "tax", overdue: false });
    });
    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [store.obligations, snap.advanceTax, horizon]);

  const total = items.reduce((s, i) => s + i.amount, 0);
  const copy = () => {
    const txt = `Due in the next ${horizon} days (total ${formatCurrency(Math.round(total))}):\n` +
      items.map(i => `• ${format(new Date(i.dueDate), "d MMM")} — ${i.name}: ${formatCurrency(Math.round(i.amount))}${i.overdue ? " (OVERDUE)" : ""}`).join("\n");
    navigator.clipboard?.writeText(txt);
    toast.success("Digest copied");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Due This Week</h2>
          <div className="flex gap-1">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setHorizon(d)} className={`text-[10px] px-2 py-1 rounded border ${horizon === d ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{d}d</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Tax, statutory and obligation deadlines landing in your chosen window, soonest first — plus the advance-tax installments from your schedule. It reminds you; the actual filing/payment happens on its own page.</p>
        {items.length > 0 && <p className="text-sm font-semibold mt-3">Total due: <span className="tabular-nums">{formatCurrency(Math.round(total))}</span></p>}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg p-6 text-center border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <CheckCircle2 size={22} className="mx-auto text-green-400 mb-2" />
          <p className="text-sm font-medium">Nothing due in the next {horizon} days</p>
        </div>
      ) : (
        <>
          <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
            {items.map(it => (
              <div key={it.id} className="flex items-center gap-3 p-4">
                <CalendarClock size={15} className={`shrink-0 ${it.overdue ? "text-red-400" : "text-[var(--color-primary)]"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{it.name}</p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{it.kind} · {format(new Date(it.dueDate), "EEE d MMM")}{it.overdue && <span className="text-red-400"> · overdue</span>}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(Math.round(it.amount))}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate("/compliance")} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">Open compliance calendar <ArrowRight size={11} /></button>
            <button onClick={copy} className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">Copy digest</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Top Risks summarizer (ranked from health components + signals) ─────────────
// Distils the seven health drivers plus a couple of live signals into the three
// things most worth your attention, each with a one-line "why" and a fix link.
function TopRisks({ snap, signals, navigate }: { snap: FinancialSnapshot; signals: Signals; navigate: Nav }) {
  const risks = useMemo(() => {
    type Risk = { id: string; title: string; why: string; weight: number; path: string; cta: string };
    const out: Risk[] = [];
    // Lowest-scoring health drivers are the structural risks.
    snap.health.components
      .filter(c => c.score < 60)
      .forEach(c => out.push({ id: `h-${c.key}`, title: c.label, why: c.detail, weight: (60 - c.score) * c.weight, path: c.fixPath, cta: c.fixLabel }));
    // Acute live signals layered on top.
    if (signals.overdueReceivable > 0) out.push({ id: "od", title: "Overdue receivables", why: `${formatCurrency(Math.round(signals.overdueReceivable))} across ${signals.overdueInvoiceCount} invoice(s) past due.`, weight: signals.overdueReceivable / 1000, path: "/collections", cta: "Chase now" });
    if (signals.runwayDays < 90 && signals.monthlyNet < 0) out.push({ id: "rw", title: "Short runway", why: `Only ${runwayLabel(signals.runwayDays)} of cash left at current burn.`, weight: 5000, path: "/forecast", cta: "Open forecast" });
    if (snap.obligationsDue90 > signals.cash) out.push({ id: "obl", title: "Obligations exceed cash", why: `${formatCurrency(Math.round(snap.obligationsDue90))} due in 90 days vs ${formatCurrency(Math.round(signals.cash))} cash.`, weight: 4000, path: "/forecast", cta: "Stress-test" });
    // Dedupe by title, keep heaviest, take top 3.
    const seen = new Set<string>();
    return out.sort((a, b) => b.weight - a.weight).filter(r => (seen.has(r.title) ? false : (seen.add(r.title), true))).slice(0, 3);
  }, [snap, signals]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted)] px-1">The three issues that most drag on your financial health right now, ranked by how much they cost your score and cash. A focusing aid — review before acting.</p>
      {risks.length === 0 ? (
        <div className="rounded-lg p-6 text-center border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <CheckCircle2 size={22} className="mx-auto text-green-400 mb-2" />
          <p className="text-sm font-medium">No material risks flagged</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Every health driver is scoring above 60 and no acute signals are firing.</p>
        </div>
      ) : risks.map((r, i) => (
        <div key={r.id} className={`${CARD} p-4 flex items-start gap-3`}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] text-sm font-bold">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5"><ShieldAlert size={13} className="text-yellow-400" /> {r.title}</p>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{r.why}</p>
          </div>
          <button onClick={() => navigate(r.path)} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-medium whitespace-nowrap shrink-0">{r.cta} <ArrowRight size={11} /></button>
        </div>
      ))}
    </div>
  );
}

// ── Smart-Savings Finder (recurring / duplicate spend) ─────────────────────────
// Groups outflows by counterparty to surface recurring spend and likely
// duplicates worth reviewing to cut. It flags candidates; you decide what to cut.
function SavingsFinder({ navigate }: { navigate: Nav }) {
  const { store } = useApp();
  const [cut, setCut] = useFeatureState<string[]>("cop-savings-cut", []);

  const findings = useMemo(() => {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
    const map = new Map<string, { name: string; total: number; count: number; recurring: boolean }>();
    store.transactions
      .filter(t => t.amount < 0 && t.category === "expense" && t.date >= cutoff)
      .forEach(t => {
        const name = (t.counterparty || t.description || "Unlabelled").trim();
        const key = name.toLowerCase();
        const e = map.get(key) ?? { name, total: 0, count: 0, recurring: false };
        e.total += Math.abs(t.amount);
        e.count += 1;
        if (t.isRecurring) e.recurring = true;
        map.set(key, e);
      });
    return [...map.values()]
      .map(e => {
        const monthly = e.total / 3;
        const repeated = e.recurring || e.count >= 3;
        const tag = e.recurring ? "recurring" : e.count >= 3 ? "frequent" : "one-off";
        return { ...e, monthly, repeated, tag };
      })
      .filter(e => e.repeated && e.monthly >= 5000)
      .sort((a, b) => b.monthly - a.monthly)
      .slice(0, 12);
  }, [store.transactions]);

  const toggle = (name: string) => setCut(cut.includes(name) ? cut.filter(x => x !== name) : [...cut, name]);
  const targetedMonthly = findings.filter(f => cut.includes(f.name)).reduce((s, f) => s + f.monthly, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Scissors size={14} className="text-[var(--color-primary)]" /> Savings Finder</h2>
        <p className="text-xs text-[var(--color-muted)] mb-3">Recurring and frequently-repeated outflows over the last 90 days, ranked by monthly cost — the usual place to find subscriptions and duplicate spend to trim. Tick what you'd cut to tally the saving; it doesn't cancel anything.</p>
        {targetedMonthly > 0 && (
          <p className="text-sm font-semibold text-green-400">Earmarked to cut: {formatCurrency(Math.round(targetedMonthly))}/mo <span className="text-[var(--color-muted)] font-normal">(≈ {formatCurrency(Math.round(targetedMonthly * 12))}/yr)</span></p>
        )}
      </div>

      {findings.length === 0 ? (
        <div className="rounded-lg p-6 text-center border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <CheckCircle2 size={22} className="mx-auto text-green-400 mb-2" />
          <p className="text-sm font-medium">No recurring spend over ₹5,000/mo found</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Either spend is well spread or there isn't enough labelled history yet.</p>
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {findings.map(f => {
            const isCut = cut.includes(f.name);
            return (
              <div key={f.name} className={`flex items-center gap-3 p-4 ${isCut ? "bg-green-950/10" : ""}`}>
                <button onClick={() => toggle(f.name)} className="shrink-0">
                  {isCut ? <CheckCircle2 size={16} className="text-green-400" /> : <Circle size={16} className="text-[var(--color-muted)]" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{f.count} payment(s) in 90d · {f.tag}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(Math.round(f.monthly))}/mo</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{formatCurrency(Math.round(f.total))} total</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button onClick={() => navigate("/spend")} className="flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">Review full spend <ArrowRight size={11} /></button>
    </div>
  );
}

// ── KPI Target Nudge Tracker ───────────────────────────────────────────────────
// Set targets for a few core KPIs; the tracker compares them to live values and
// nudges with the gap and direction. Targets are durable; values are read-only.
interface KpiTargetState { runwayMonths: number; marginPct: number; dsoDays: number; healthScore: number }
const DEFAULT_KPI_TARGETS: KpiTargetState = { runwayMonths: 12, marginPct: 20, dsoDays: 45, healthScore: 70 };

function KpiTargets({ snap, signals }: { snap: FinancialSnapshot; signals: Signals }) {
  const [t, setT] = useFeatureState<KpiTargetState>("cop-kpi-targets", DEFAULT_KPI_TARGETS);
  const set = <K extends keyof KpiTargetState>(k: K, v: number) => setT({ ...t, [k]: v });

  const rows = useMemo(() => {
    const runwayMonths = signals.runwayDays >= 999 ? 999 : signals.runwayDays / 30;
    const margin = snap.grossMarginPct ?? 0;
    return [
      { id: "runwayMonths", label: "Runway (months)", target: t.runwayMonths, actual: runwayMonths, fmt: (n: number) => n >= 999 ? "∞" : n.toFixed(1), higherBetter: true },
      { id: "marginPct", label: "Gross margin (%)", target: t.marginPct, actual: margin, fmt: (n: number) => `${n.toFixed(0)}%`, higherBetter: true },
      { id: "dsoDays", label: "DSO (days)", target: t.dsoDays, actual: snap.dsoDays, fmt: (n: number) => `${Math.round(n)}d`, higherBetter: false },
      { id: "healthScore", label: "Health score", target: t.healthScore, actual: signals.healthScore, fmt: (n: number) => `${Math.round(n)}`, higherBetter: true },
    ] as const;
  }, [t, snap, signals]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> KPI Targets</h2>
        <p className="text-xs text-[var(--color-muted)]">Set a target for each core KPI; the tracker compares it to the live value and nudges you on the gap. Targets are saved with your workspace — the actuals are read straight from your data.</p>
      </div>

      <div className="space-y-3">
        {rows.map(r => {
          const met = r.higherBetter ? r.actual >= r.target : r.actual <= r.target;
          const gap = r.higherBetter ? r.target - r.actual : r.actual - r.target;
          const pct = r.higherBetter
            ? Math.min(100, r.target > 0 ? (r.actual / r.target) * 100 : 100)
            : Math.min(100, r.actual > 0 ? (r.target / r.actual) * 100 : 100);
          return (
            <div key={r.id} className={`${CARD} p-4`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    {met ? <CheckCircle2 size={13} className="text-green-400" /> : <AlertTriangle size={13} className="text-yellow-400" />} {r.label}
                  </p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                    Now <strong className="text-[var(--color-text)]">{r.fmt(r.actual)}</strong> · target {r.fmt(r.target)}
                    {met ? <span className="text-green-400"> · on target</span> : <span className="text-yellow-400"> · {r.fmt(Math.abs(gap))} {r.higherBetter ? "below" : "above"}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--color-muted)]">Target</span>
                  <input type="number" value={r.target} onChange={e => set(r.id, Math.max(0, Number(e.target.value) || 0))} className="w-20 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm text-right tabular-nums outline-none focus:border-[var(--color-primary)]" />
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden mt-3">
                <div className={`h-full transition-all ${met ? "bg-green-400" : "bg-yellow-400"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={() => { setT(DEFAULT_KPI_TARGETS); toast.success("Targets reset to defaults"); }}
        className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">
        Reset targets
      </button>
    </div>
  );
}

// ── End-of-Day / Meeting-Prep Brief ────────────────────────────────────────────
// A copy-ready end-of-day or meeting-prep summary: the position, what moved
// today, and the open items. Generated from the same live numbers.
function EndOfDayBrief({ snap, signals }: { snap: FinancialSnapshot; signals: Signals }) {
  const { store } = useApp();
  const today = new Date();

  const brief = useMemo(() => {
    const todayIso = today.toISOString().split("T")[0];
    const todays = store.transactions.filter(t => t.date === todayIso && t.category !== "transfer");
    const inToday = todays.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const outToday = Math.abs(todays.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const L: string[] = [];
    L.push(`End-of-Day Brief — ${format(today, "EEEE, d MMM yyyy")}`);
    L.push("");
    L.push("Position:");
    L.push(`• Cash ${formatCurrency(Math.round(signals.cash))} · runway ${runwayLabel(signals.runwayDays)} · health ${Math.round(signals.healthScore)}/100 (${signals.healthGrade})`);
    L.push("");
    L.push("Today's movement:");
    L.push(`• Money in: ${formatCurrency(Math.round(inToday))} across ${todays.filter(t => t.amount > 0).length} txn(s)`);
    L.push(`• Money out: ${formatCurrency(Math.round(outToday))} across ${todays.filter(t => t.amount < 0).length} txn(s)`);
    L.push(`• Net for the day: ${inToday - outToday >= 0 ? "+" : ""}${formatCurrency(Math.round(inToday - outToday))}`);
    L.push("");
    L.push("Open items:");
    if (signals.overdueReceivable > 0) L.push(`• ${formatCurrency(Math.round(signals.overdueReceivable))} overdue across ${signals.overdueInvoiceCount} invoice(s)`);
    if (signals.dueTodayCount > 0) L.push(`• ${signals.dueTodayCount} item(s) worth ${formatCurrency(Math.round(signals.dueToday))} due today`);
    if (snap.gstThisMonth.netPayable > 0) L.push(`• GST payable this month ≈ ${formatCurrency(snap.gstThisMonth.netPayable)}`);
    if (signals.runwayDays < 120 && signals.monthlyNet < 0) L.push(`• Runway under 4 months — watch the burn`);
    if (L[L.length - 1] === "Open items:") L.push("• Nothing outstanding — clean slate.");
    return L.join("\n");
  }, [store.transactions, snap, signals, today]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Presentation size={14} className="text-[var(--color-primary)]" /> End-of-Day / Meeting-Prep Brief</h2>
          <button onClick={() => { navigator.clipboard?.writeText(brief); toast.success("Brief copied"); }}
            className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40">
            Copy
          </button>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">A copy-ready wrap of where the business stands, what moved today and what's still open — paste it into a standup, a WhatsApp update or your meeting notes. Built from your live numbers.</p>
        <pre className="text-xs whitespace-pre-wrap bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 leading-relaxed text-[var(--color-text)] font-sans">{brief}</pre>
      </div>
    </div>
  );
}

// ── Cash-Shortfall Early-Warning ───────────────────────────────────────────────
// Projects cash forward week-by-week: starting balance, minus dated obligations
// and open invoices due, plus the operating run-rate. Flags the first week cash
// would dip below your safety buffer. Read-only forecast — moves nothing.
function CashEarlyWarning({ snap, signals, navigate }: { snap: FinancialSnapshot; signals: Signals; navigate: Nav }) {
  const { store } = useApp();
  const buffer = Math.round(snap.monthlyExpense * 0.5); // ~2 weeks of expense as a safety floor

  const weeks = useMemo(() => {
    const now = new Date();
    const dailyNet = signals.monthlyNet / 30; // operating run-rate, +ve or -ve
    const openInv = store.invoices.filter(i => i.status !== "paid");
    let balance = signals.cash;
    const out: { idx: number; start: string; end: string; outflow: number; inflow: number; close: number; breach: boolean }[] = [];
    for (let w = 0; w < 8; w++) {
      const start = new Date(now.getTime() + w * 7 * 86400000);
      const end = new Date(now.getTime() + (w + 1) * 7 * 86400000 - 86400000);
      const startIso = start.toISOString().split("T")[0];
      const endIso = end.toISOString().split("T")[0];
      const inWindow = (d: string) => d >= startIso && d <= endIso;
      const oblOut = store.obligations.filter(o => inWindow(o.dueDate)).reduce((s, o) => s + o.amount, 0);
      // Expected collections: invoices due in window, conservatively (full amount).
      const invIn = openInv.filter(i => inWindow(i.dueDate)).reduce((s, i) => s + i.amount, 0);
      const opNet = dailyNet * 7;
      balance = balance + opNet + invIn - oblOut;
      out.push({ idx: w, start: startIso, end: endIso, outflow: oblOut, inflow: invIn, close: balance, breach: balance < buffer });
    }
    return out;
  }, [store, signals, buffer]);

  const firstBreach = weeks.find(w => w.breach);
  const lowest = weeks.reduce((m, w) => (w.close < m.close ? w : m), weeks[0]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><LineChart size={14} className="text-[var(--color-primary)]" /> Cash Early-Warning</h2>
        <p className="text-xs text-[var(--color-muted)] mb-3">An 8-week projection of your closing cash — opening balance plus operating run-rate, expected collections and dated obligations. It warns when cash would dip below a ~2-week expense buffer. A preview, not a guarantee; nothing here moves money.</p>
        {firstBreach ? (
          <div className="rounded-lg p-3 border border-red-800/40 bg-red-950/20 text-sm text-red-300 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>Projected cash falls below your {formatCurrency(buffer)} buffer in week of <strong>{format(new Date(firstBreach.start), "d MMM")}</strong> (closing ≈ {formatCurrency(Math.round(firstBreach.close))}). Act before then.</span>
          </div>
        ) : (
          <div className="rounded-lg p-3 border border-green-800/40 bg-green-950/20 text-sm text-green-300 flex items-start gap-2">
            <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            <span>Cash stays above your {formatCurrency(buffer)} buffer across the next 8 weeks. Lowest point ≈ {formatCurrency(Math.round(lowest.close))} (week of {format(new Date(lowest.start), "d MMM")}).</span>
          </div>
        )}
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {weeks.map(w => (
          <div key={w.idx} className={`flex items-center gap-3 p-3.5 ${w.breach ? "bg-red-950/10" : ""}`}>
            <span className="text-[11px] text-[var(--color-muted)] w-24 shrink-0">{format(new Date(w.start), "d MMM")}–{format(new Date(w.end), "d MMM")}</span>
            <div className="flex-1 min-w-0 text-[11px] text-[var(--color-muted)]">
              <span className="text-green-400">+{formatCurrency(Math.round(w.inflow))}</span> in · <span className="text-red-400">−{formatCurrency(Math.round(w.outflow))}</span> due
            </div>
            <span className={`text-sm font-semibold tabular-nums shrink-0 ${w.breach ? "text-red-400" : w.close < buffer * 1.5 ? "text-yellow-400" : "text-[var(--color-text)]"}`}>{formatCurrency(Math.round(w.close))}</span>
          </div>
        ))}
      </div>

      {firstBreach && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate("/collections")} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">Pull collections forward <ArrowRight size={11} /></button>
          <button onClick={() => navigate("/forecast")} className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">Open full forecast</button>
        </div>
      )}
    </div>
  );
}

// ── Collect-First Worklist ─────────────────────────────────────────────────────
// Ranks open invoices by collection priority — amount weighted by how overdue
// they are — so you chase the biggest, oldest balances first. Suggests an order;
// the actual chasing happens in Collections.
function CollectFirstWorklist({ navigate }: { navigate: Nav }) {
  const { store } = useApp();
  const [done, setDone] = useFeatureState<string[]>("cop-collect-first-done", []);

  const worklist = useMemo(() => {
    const today = new Date();
    const todayIso = today.toISOString().split("T")[0];
    return store.invoices
      .filter(i => i.status !== "paid")
      .map(i => {
        const daysOverdue = i.dueDate < todayIso
          ? Math.round((today.getTime() - new Date(i.dueDate).getTime()) / 86400000)
          : 0;
        // Priority = amount scaled up the longer it's been overdue.
        const score = i.amount * (1 + daysOverdue / 30);
        return { id: i.id, customer: i.customer, amount: i.amount, dueDate: i.dueDate, daysOverdue, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [store.invoices]);

  const toggle = (id: string) => setDone(done.includes(id) ? done.filter(x => x !== id) : [...done, id]);
  const outstanding = worklist.filter(w => !done.includes(w.id)).reduce((s, w) => s + w.amount, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><HandCoins size={14} className="text-[var(--color-primary)]" /> Collect-First Worklist</h2>
        <p className="text-xs text-[var(--color-muted)]">Your open invoices ranked by collection priority — bigger balances and the longest-overdue ones rise to the top, so a morning of chasing recovers the most cash. Tick as you work through them; the copilot never contacts anyone for you.</p>
        {outstanding > 0 && <p className="text-sm font-semibold mt-3">Still to chase: <span className="tabular-nums">{formatCurrency(Math.round(outstanding))}</span></p>}
      </div>

      {worklist.length === 0 ? (
        <div className="rounded-lg p-6 text-center border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <CheckCircle2 size={22} className="mx-auto text-green-400 mb-2" />
          <p className="text-sm font-medium">No open invoices to chase</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Everything is paid — collections are clean.</p>
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {worklist.map((w, i) => {
            const isDone = done.includes(w.id);
            return (
              <div key={w.id} className={`flex items-center gap-3 p-4 ${isDone ? "opacity-50" : ""}`}>
                <span className="text-xs font-bold text-[var(--color-muted)] w-5 shrink-0">{i + 1}</span>
                <button onClick={() => toggle(w.id)} className="shrink-0">
                  {isDone ? <CheckCircle2 size={16} className="text-green-400" /> : <Circle size={16} className="text-[var(--color-muted)]" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isDone ? "line-through" : ""}`}>{w.customer}</p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                    due {format(new Date(w.dueDate), "d MMM")}
                    {w.daysOverdue > 0 ? <span className="text-red-400"> · {w.daysOverdue}d overdue</span> : <span className="text-[var(--color-muted)]"> · not yet due</span>}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(Math.round(w.amount))}</span>
              </div>
            );
          })}
        </div>
      )}
      <button onClick={() => navigate("/collections")} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">Open Collections <ArrowRight size={11} /></button>
    </div>
  );
}

// ── Invoice-Now Candidates ─────────────────────────────────────────────────────
// Delivered/dispatched orders that have no matching invoice yet — revenue you've
// earned but haven't billed. Surfaces the gap; raising the invoice happens on the
// Receivables page.
function InvoiceNowCandidates({ navigate }: { navigate: Nav }) {
  const { store } = useApp();

  const candidates = useMemo(() => {
    const billedCustomers = new Set(store.invoices.map(i => i.customer.trim().toLowerCase()));
    return store.orders
      .filter(o => (o.status === "delivered" || o.status === "dispatched") && o.totalValue > 0)
      .map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        buyerName: o.buyerName,
        totalValue: o.totalValue,
        status: o.status,
        updatedAt: o.updatedAt,
        // Heuristic: if we have no invoice for this buyer at all, it's very likely unbilled.
        likelyUnbilled: !billedCustomers.has((o.buyerName || "").trim().toLowerCase()),
      }))
      .sort((a, b) => Number(b.likelyUnbilled) - Number(a.likelyUnbilled) || b.totalValue - a.totalValue)
      .slice(0, 12);
  }, [store.orders, store.invoices]);

  const unbilledTotal = candidates.filter(c => c.likelyUnbilled).reduce((s, c) => s + c.totalValue, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FilePlus2 size={14} className="text-[var(--color-primary)]" /> Invoice-Now Candidates</h2>
        <p className="text-xs text-[var(--color-muted)]">Delivered and dispatched orders matched against your invoice list — anything fulfilled but seemingly unbilled is revenue waiting to be raised. It points out the gap; you raise the invoice on Receivables.</p>
        {unbilledTotal > 0 && <p className="text-sm font-semibold mt-3 text-yellow-400">Likely unbilled: <span className="tabular-nums">{formatCurrency(Math.round(unbilledTotal))}</span></p>}
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-lg p-6 text-center border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <CheckCircle2 size={22} className="mx-auto text-green-400 mb-2" />
          <p className="text-sm font-medium">No fulfilled orders pending an invoice</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Either nothing is delivered yet or it all appears to be billed.</p>
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {candidates.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-4">
              <Receipt size={15} className={`shrink-0 ${c.likelyUnbilled ? "text-yellow-400" : "text-[var(--color-muted)]"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.buyerName} <span className="text-[10px] text-[var(--color-muted)] font-normal">· {c.orderNumber}</span></p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                  {c.status} · {format(new Date(c.updatedAt), "d MMM")}
                  {c.likelyUnbilled ? <span className="text-yellow-400"> · no matching invoice</span> : <span className="text-[var(--color-muted)]"> · invoice likely exists</span>}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(Math.round(c.totalValue))}</span>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => navigate("/receivables")} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">Raise invoices on Receivables <ArrowRight size={11} /></button>
    </div>
  );
}

// ── Vendor Pay-Now-vs-Later ────────────────────────────────────────────────────
// Splits upcoming obligations into "pay now" (due within a few days or overdue)
// and "can wait", given your spendable cash. A timing suggestion to preserve
// cash — it never schedules or releases a payment.
function PayNowVsLater({ signals, navigate }: { signals: Signals; navigate: Nav }) {
  const { store } = useApp();
  const [windowDays, setWindowDays] = useState(7);

  const groups = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const soon = new Date(now.getTime() + windowDays * 86400000).toISOString().split("T")[0];
    const horizon = new Date(now.getTime() + 45 * 86400000).toISOString().split("T")[0];
    type Item = { id: string; name: string; amount: number; dueDate: string; kind: string };
    const payNow: Item[] = [];
    const canWait: Item[] = [];
    store.obligations
      .filter(o => o.dueDate <= horizon)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .forEach(o => {
        const item: Item = { id: o.id, name: o.name, amount: o.amount, dueDate: o.dueDate, kind: o.type };
        // Statutory/payroll due within the window, or anything already overdue → pay now.
        const urgent = o.dueDate < today || (o.dueDate <= soon && (o.type === "tax" || o.type === "payroll" || o.type === "loan")) || o.dueDate <= soon;
        (urgent ? payNow : canWait).push(item);
      });
    return { payNow, canWait };
  }, [store.obligations, windowDays]);

  const payNowTotal = groups.payNow.reduce((s, i) => s + i.amount, 0);
  const canWaitTotal = groups.canWait.reduce((s, i) => s + i.amount, 0);
  const coversNow = signals.cash >= payNowTotal;

  const Row = ({ name, amount, dueDate, kind, overdue }: { name: string; amount: number; dueDate: string; kind: string; overdue: boolean }) => (
    <div className="flex items-center gap-3 p-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{kind} · due {format(new Date(dueDate), "d MMM")}{overdue && <span className="text-red-400"> · overdue</span>}</p>
      </div>
      <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(Math.round(amount))}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Timer size={14} className="text-[var(--color-primary)]" /> Pay Now vs Later</h2>
          <div className="flex gap-1">
            {[3, 7, 14].map(d => (
              <button key={d} onClick={() => setWindowDays(d)} className={`text-[10px] px-2 py-1 rounded border ${windowDays === d ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{d}d</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Splits upcoming obligations into what genuinely needs paying within {windowDays} days — statutory dues, payroll, loans and anything overdue — versus what can safely wait, so you hold onto cash without missing a deadline. Timing advice only; it releases nothing.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "Pay now", value: formatAmount(payNowTotal), color: "text-red-400" },
            { label: "Can wait", value: formatAmount(canWaitTotal), color: "text-[var(--color-text)]" },
            { label: "Cash on hand", value: formatAmount(signals.cash), color: coversNow ? "text-green-400" : "text-yellow-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
        {!coversNow && payNowTotal > 0 && (
          <p className="text-[11px] text-yellow-400 mt-3">Pay-now total exceeds cash on hand — open the Payment Prioritizer to sequence within available funds.</p>
        )}
      </div>

      {groups.payNow.length === 0 && groups.canWait.length === 0 ? (
        <div className="rounded-lg p-6 text-center border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <CheckCircle2 size={22} className="mx-auto text-green-400 mb-2" />
          <p className="text-sm font-medium">No obligations in the next 45 days</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className={`${CARD} overflow-hidden`}>
            <p className="text-xs font-semibold px-4 pt-3 pb-2 text-red-400 flex items-center gap-1.5"><AlertTriangle size={12} /> Pay now ({groups.payNow.length})</p>
            <div className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {groups.payNow.length === 0
                ? <p className="text-[11px] text-[var(--color-muted)] p-4">Nothing due in the next {windowDays} days.</p>
                : groups.payNow.map(i => <Row key={i.id} name={i.name} amount={i.amount} dueDate={i.dueDate} kind={i.kind} overdue={i.dueDate < new Date().toISOString().split("T")[0]} />)}
            </div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <p className="text-xs font-semibold px-4 pt-3 pb-2 text-[var(--color-muted)] flex items-center gap-1.5"><Timer size={12} /> Can wait ({groups.canWait.length})</p>
            <div className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {groups.canWait.length === 0
                ? <p className="text-[11px] text-[var(--color-muted)] p-4">Nothing deferrable in this window.</p>
                : groups.canWait.map(i => <Row key={i.id} name={i.name} amount={i.amount} dueDate={i.dueDate} kind={i.kind} overdue={false} />)}
            </div>
          </div>
        </div>
      )}
      <button onClick={() => navigate("/spend")} className="flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">Review payables on Spend <ArrowRight size={11} /></button>
    </div>
  );
}

// ── This-Week Focus List ───────────────────────────────────────────────────────
// Picks the handful of actions most worth doing this week, ranked by impact, and
// renders them as a tickable, copy-ready list. A focusing aid built from the same
// signals the rest of the copilot reads.
function ThisWeekFocus({ snap, signals, navigate }: { snap: FinancialSnapshot; signals: Signals; navigate: Nav }) {
  const { store } = useApp();
  const [done, setDone] = useFeatureState<string[]>("cop-this-week-done", []);

  const tasks = useMemo(() => {
    const today = new Date();
    const todayIso = today.toISOString().split("T")[0];
    const weekEnd = new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0];
    const out: { id: string; text: string; rank: number; path: string }[] = [];
    if (signals.overdueReceivable > 0) out.push({ id: "tw-overdue", text: `Chase ${formatCurrency(Math.round(signals.overdueReceivable))} overdue across ${signals.overdueInvoiceCount} invoice(s).`, rank: 100 + signals.overdueReceivable / 1000, path: "/collections" });
    const oblThisWeek = store.obligations.filter(o => o.dueDate >= todayIso && o.dueDate <= weekEnd);
    if (oblThisWeek.length > 0) {
      const amt = oblThisWeek.reduce((s, o) => s + o.amount, 0);
      out.push({ id: "tw-obl", text: `Settle ${oblThisWeek.length} obligation(s) due this week (${formatCurrency(Math.round(amt))}).`, rank: 90, path: "/compliance" });
    }
    snap.advanceTax.filter(a => a.dueDate >= todayIso && a.dueDate <= weekEnd).forEach((a, i) => {
      out.push({ id: `tw-tax-${i}`, text: `Pay advance-tax installment (${formatCurrency(Math.round(a.installment))}) due ${format(new Date(a.dueDate), "d MMM")}.`, rank: 85, path: "/tax" });
    });
    const unbilled = store.orders.filter(o => o.status === "delivered" || o.status === "dispatched").length;
    if (unbilled > 0) out.push({ id: "tw-invoice", text: `Review ${unbilled} fulfilled order(s) for unbilled revenue to invoice.`, rank: 70, path: "/receivables" });
    if (signals.runwayDays < 120 && signals.monthlyNet < 0) out.push({ id: "tw-runway", text: `Runway is ${runwayLabel(signals.runwayDays)} — trim spend or line up working capital.`, rank: 80, path: "/spend" });
    if (signals.dscr !== null && signals.dscr < 1.25) out.push({ id: "tw-dscr", text: `DSCR is ${signals.dscr.toFixed(2)}x — review debt before any new borrowing.`, rank: 50, path: "/debt" });
    if (out.length === 0) out.push({ id: "tw-clear", text: "Nothing pressing — keep the forecast fresh and collections tight.", rank: 0, path: "/dashboard" });
    return out.sort((a, b) => b.rank - a.rank).slice(0, 6);
  }, [store, snap, signals]);

  const toggle = (id: string) => setDone(done.includes(id) ? done.filter(x => x !== id) : [...done, id]);
  const copy = () => {
    const txt = `This week's focus — ${format(new Date(), "d MMM yyyy")}\n` + tasks.map(t => `• ${t.text}`).join("\n");
    navigator.clipboard?.writeText(txt);
    toast.success("Focus list copied");
  };
  const remaining = tasks.filter(t => !done.includes(t.id)).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-sm font-semibold flex items-center gap-2"><ListTodo size={14} className="text-[var(--color-primary)]" /> This Week's Focus</h2>
          <button onClick={copy} className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40">Copy list</button>
        </div>
        <p className="text-xs text-[var(--color-muted)]">The handful of moves most worth your time this week, ranked by impact and read straight from your numbers. Tick them off as you go — it's a to-do list, not an executor.</p>
        <p className="text-[11px] text-[var(--color-muted)] mt-2">{remaining} of {tasks.length} remaining</p>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {tasks.map(t => {
          const isDone = done.includes(t.id);
          return (
            <div key={t.id} className={`flex items-center gap-3 p-4 ${isDone ? "opacity-50" : ""}`}>
              <button onClick={() => toggle(t.id)} className="shrink-0">
                {isDone ? <CheckCircle2 size={16} className="text-green-400" /> : <Circle size={16} className="text-[var(--color-muted)]" />}
              </button>
              <p className={`flex-1 min-w-0 text-sm ${isDone ? "line-through text-[var(--color-muted)]" : ""}`}>{t.text}</p>
              <button onClick={() => navigate(t.path)} className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline shrink-0">Open <ArrowRight size={11} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI Off-Track Explainer ────────────────────────────────────────────────────
// Reads your saved KPI targets, finds the one furthest off, and explains in plain
// words why it's off and which levers move it. Read-only; it links to the page
// where each lever actually lives.
function KpiOffTrackExplainer({ snap, signals, navigate }: { snap: FinancialSnapshot; signals: Signals; navigate: Nav }) {
  const [targets] = useFeatureState<KpiTargetState>("cop-kpi-targets", DEFAULT_KPI_TARGETS);

  const analysis = useMemo(() => {
    const runwayMonths = signals.runwayDays >= 999 ? 999 : signals.runwayDays / 30;
    const margin = snap.grossMarginPct ?? 0;
    type Kpi = { id: string; label: string; actual: number; target: number; higherBetter: boolean; gapPct: number; why: string; levers: { text: string; path: string }[] };
    const rows: Kpi[] = [
      {
        id: "runway", label: "Runway (months)", actual: runwayMonths, target: targets.runwayMonths, higherBetter: true,
        gapPct: targets.runwayMonths > 0 ? ((targets.runwayMonths - runwayMonths) / targets.runwayMonths) * 100 : 0,
        why: signals.monthlyNet < 0 ? `You're burning ${formatCurrency(Math.round(-signals.monthlyNet))}/month, so cash drains faster than the target allows.` : "Operations are net positive; the shortfall is just a low opening cash balance.",
        levers: [{ text: "Collect overdue receivables", path: "/collections" }, { text: "Trim discretionary spend", path: "/spend" }, { text: "Arrange working capital", path: "/credit" }],
      },
      {
        id: "margin", label: "Gross margin (%)", actual: margin, target: targets.marginPct, higherBetter: true,
        gapPct: targets.marginPct > 0 ? ((targets.marginPct - margin) / targets.marginPct) * 100 : 0,
        why: "Expenses are consuming too much of revenue over the trailing 6 months — either pricing is low or costs have crept up.",
        levers: [{ text: "Find recurring spend to cut", path: "/spend" }, { text: "Review pricing & sales mix", path: "/analytics" }],
      },
      {
        id: "dso", label: "DSO (days)", actual: snap.dsoDays, target: targets.dsoDays, higherBetter: false,
        gapPct: snap.dsoDays > 0 ? ((snap.dsoDays - targets.dsoDays) / snap.dsoDays) * 100 : 0,
        why: `Customers are taking ~${snap.dsoDays} days to pay against your ${targets.dsoDays}-day target — cash is stuck in receivables.`,
        levers: [{ text: "Chase overdue invoices", path: "/collections" }, { text: "Tighten invoice terms", path: "/receivables" }],
      },
      {
        id: "health", label: "Health score", actual: signals.healthScore, target: targets.healthScore, higherBetter: true,
        gapPct: targets.healthScore > 0 ? ((targets.healthScore - signals.healthScore) / targets.healthScore) * 100 : 0,
        why: "Your composite score is dragged down by its weakest drivers — see the breakdown for which ones.",
        levers: [{ text: "See health driver breakdown", path: "/health" }],
      },
    ];
    const offTrack = rows.filter(r => (r.higherBetter ? r.actual < r.target : r.actual > r.target));
    const worst = offTrack.sort((a, b) => b.gapPct - a.gapPct)[0] ?? null;
    return { worst, offTrackCount: offTrack.length, total: rows.length };
  }, [snap, signals, targets]);

  const fmt = (id: string, n: number) =>
    id === "runway" ? (n >= 999 ? "∞" : `${n.toFixed(1)} mo`)
    : id === "margin" ? `${n.toFixed(0)}%`
    : id === "dso" ? `${Math.round(n)}d`
    : `${Math.round(n)}`;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Lightbulb size={14} className="text-[var(--color-primary)]" /> Off-Track KPI Explainer</h2>
        <p className="text-xs text-[var(--color-muted)]">Compares your saved KPI targets to live values, picks the one furthest off, and explains in plain words why it's off and which levers move it. Diagnosis only — set targets on the KPI Targets tab; act via the linked pages.</p>
      </div>

      {!analysis.worst ? (
        <div className="rounded-lg p-6 text-center border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <CheckCircle2 size={22} className="mx-auto text-green-400 mb-2" />
          <p className="text-sm font-medium">Every tracked KPI is on or above target</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Nothing off-track against your saved targets right now.</p>
        </div>
      ) : (
        <div className={`${CARD} p-5 space-y-4`}>
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold flex items-center gap-1.5"><AlertTriangle size={14} className="text-yellow-400" /> {analysis.worst.label} is your most off-track KPI</p>
            <span className="text-[10px] text-[var(--color-muted)]">{analysis.offTrackCount} of {analysis.total} KPIs off target</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Now", value: fmt(analysis.worst.id, analysis.worst.actual), color: "text-yellow-400" },
              { label: "Target", value: fmt(analysis.worst.id, analysis.worst.target), color: "text-[var(--color-text)]" },
              { label: "Gap", value: `${Math.round(Math.abs(analysis.worst.gapPct))}%`, color: "text-red-400" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1">Why it's off</p>
            <p className="text-sm">{analysis.worst.why}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">Levers that move it</p>
            <div className="space-y-2">
              {analysis.worst.levers.map(l => (
                <button key={l.path + l.text} onClick={() => navigate(l.path)} className="w-full flex items-center justify-between gap-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 hover:border-[var(--color-primary)]/40 text-left">
                  <span className="text-sm">{l.text}</span>
                  <ArrowRight size={13} className="text-[var(--color-muted)] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
