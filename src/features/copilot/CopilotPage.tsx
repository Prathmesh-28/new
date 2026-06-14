import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { computeFinancialSnapshot } from "@/lib/finance";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  Bot, Sparkles, ListChecks, Send, MessageSquareText, Target, Bell,
  ShieldCheck, ToggleRight, ScrollText, CalendarRange, ArrowRight, Info,
  TrendingDown, AlertTriangle, CheckCircle2, Plus, Search, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── shared styles (mirrors TaxPage / DebtPage input + card conventions) ──────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type TabId =
  | "overview" | "brief" | "actions" | "launcher" | "qa" | "goal"
  | "attention" | "guardrails" | "autopilot" | "audit" | "review";

const TABS = [
  ["overview", "Overview", Bot],
  ["brief", "Daily CFO Brief", Sparkles],
  ["actions", "Recommended Actions", ListChecks],
  ["launcher", "Quick-Action Launcher", Send],
  ["qa", "Ask the Copilot", MessageSquareText],
  ["goal", "Runway Goal Planner", Target],
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
          ].map(([title, desc, t]) => (
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
