import { useState, useMemo, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount, monthlyBurn, runwayDays } from "@/lib/utils";
import { Sparkles, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, CheckCircle2, Clock, ChevronRight, Download, FileText, Presentation, ShieldAlert, Copy, Gauge, Wallet, Percent, CalendarClock, ListChecks, Scale, LineChart, Receipt, Banknote, GitCompareArrows, Droplets, Rocket, Users, Coins } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { subMonths, format, startOfMonth, endOfMonth } from "date-fns";
import type { Transaction } from "@/data/types";

interface BriefSection {
  title: string;
  icon: string;
  content: string;
  type: "insight" | "alert" | "action" | "metric";
}

function parseBrief(raw: string): BriefSection[] {
  const sections: BriefSection[] = [];
  const lines = raw.split("\n").filter(l => l.trim());

  let current: BriefSection | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("##") || trimmed.startsWith("**")) {
      if (current) sections.push(current);
      const title = trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/:$/, "").trim();
      const type: BriefSection["type"] = title.toLowerCase().includes("alert") || title.toLowerCase().includes("risk") ? "alert"
        : title.toLowerCase().includes("action") ? "action"
        : title.toLowerCase().includes("metric") || title.toLowerCase().includes("kpi") ? "metric"
        : "insight";
      current = { title, icon: type === "alert" ? "⚠️" : type === "action" ? "✅" : type === "metric" ? "📊" : "💡", content: "", type };
    } else if (current && trimmed) {
      current.content += (current.content ? "\n" : "") + trimmed;
    }
  }
  if (current) sections.push(current);

  if (sections.length === 0 && raw.trim()) {
    const chunks = raw.split(/\n\n+/).filter(c => c.trim().length > 20);
    const typeMap: BriefSection["type"][] = ["metric", "insight", "alert", "action", "insight"];
    const iconMap = ["📊", "💡", "⚠️", "✅", "💡"];
    const titleMap = ["Key Metrics", "Revenue Analysis", "Cash & Risk Alerts", "Action Items", "Strategic Observations"];
    chunks.slice(0, 5).forEach((chunk, i) => {
      sections.push({ title: titleMap[i] || "Insight", icon: iconMap[i] || "💡", content: chunk.trim(), type: typeMap[i] || "insight" });
    });
  }

  return sections;
}

const SECTION_STYLE: Record<BriefSection["type"], string> = {
  metric:  "border-[var(--color-border)] bg-[var(--color-surface)]",
  insight: "border-blue-800/30 bg-blue-950/10",
  alert:   "border-orange-800/30 bg-orange-950/10",
  action:  "border-green-800/30 bg-green-950/10",
};

type CfoView = "ai-brief" | "variance" | "board-deck" | "watchlist" | "scorecard" | "cash-snapshot" | "margins" | "calendar" | "actions" | "one-pager" | "ratios" | "trend" | "expense-control" | "covenant" | "what-changed" | "liquidity" | "growth-burn" | "top-accounts" | "working-capital";

export default function CfoBriefPage() {
  const [view, setView] = useState<CfoView>("ai-brief");

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
        {([["ai-brief", "AI Brief", Sparkles], ["variance", "Variance Commentary", FileText], ["board-deck", "Board-Deck Generator", Presentation], ["watchlist", "Risk & Watchlist", ShieldAlert], ["scorecard", "KPI Scorecard", Gauge], ["cash-snapshot", "Cash Snapshot", Wallet], ["margins", "Margin Snapshot", Percent], ["calendar", "Financial Calendar", CalendarClock], ["actions", "Top Actions", ListChecks], ["one-pager", "One-Page Summary", FileText], ["ratios", "Financial Ratios", Scale], ["trend", "Profitability Trend", LineChart], ["expense-control", "Expense Control", Receipt], ["covenant", "Loan & Covenant", Banknote], ["what-changed", "What Changed", GitCompareArrows], ["liquidity", "Liquidity Position", Droplets], ["growth-burn", "Growth vs Burn", Rocket], ["top-accounts", "Top Accounts", Users], ["working-capital", "Working Capital", Coins]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${view === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {view === "ai-brief" && <AiBriefView />}
      {view === "variance" && <VarianceCommentary />}
      {view === "board-deck" && <BoardDeckGenerator />}
      {view === "watchlist" && <RiskWatchlistBrief />}
      {view === "scorecard" && <KpiScorecard />}
      {view === "cash-snapshot" && <CashFlowSnapshot />}
      {view === "margins" && <MarginSnapshot />}
      {view === "calendar" && <FinancialCalendar />}
      {view === "actions" && <TopActionsThisWeek />}
      {view === "one-pager" && <OnePageSummary />}
      {view === "ratios" && <FinancialRatios />}
      {view === "trend" && <ProfitabilityTrend />}
      {view === "expense-control" && <ExpenseControlScorecard />}
      {view === "covenant" && <CovenantBrief />}
      {view === "what-changed" && <WhatChangedThisWeek />}
      {view === "liquidity" && <LiquidityPositionBrief />}
      {view === "growth-burn" && <GrowthVsBurnBrief />}
      {view === "top-accounts" && <TopAccountsBrief />}
      {view === "working-capital" && <WorkingCapitalBrief />}
    </div>
  );
}

function AiBriefView() {
  const { store, canExport } = useApp();
  const { transactions, bankAccounts, firm, alerts, activeLoans } = store;

  const [brief,     setBrief]     = useState<BriefSection[] | null>(null);
  const [rawBrief,  setRawBrief]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [generated, setGenerated] = useState<Date | null>(null);
  const [mode,      setMode]      = useState<"brief" | "investor">("brief");
  const isInvestor = mode === "investor";

  // Switching audience clears the stale output so an investor update never shows
  // under the CFO-brief heading (and vice versa).
  const switchMode = (m: "brief" | "investor") => { if (m !== mode) { setMode(m); setBrief(null); setRawBrief(""); setGenerated(null); } };

  const burn    = monthlyBurn(transactions);
  const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const runway  = runwayDays(bankAccounts.map(b => b.balance), burn);

  const now  = new Date();
  const m1s  = startOfMonth(now).toISOString().split("T")[0];
  const m1e  = endOfMonth(now).toISOString().split("T")[0];
  const m2s  = startOfMonth(subMonths(now, 1)).toISOString().split("T")[0];
  const m2e  = endOfMonth(subMonths(now, 1)).toISOString().split("T")[0];

  const thisMonthTxns = transactions.filter(t => t.date >= m1s && t.date <= m1e);
  const lastMonthTxns = transactions.filter(t => t.date >= m2s && t.date <= m2e);

  const thisMRev = thisMonthTxns.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const thisMExp = Math.abs(thisMonthTxns.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0));
  const lastMRev = lastMonthTxns.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const lastMExp = Math.abs(lastMonthTxns.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0));

  const topVendors = Object.entries(
    transactions.filter(t=>t.amount<0&&t.counterparty)
      .reduce((acc,t)=>{ acc[t.counterparty]=(acc[t.counterparty]||0)+Math.abs(t.amount); return acc; },{} as Record<string,number>)
  ).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,v])=>`${n}: ${formatAmount(v)}`).join(", ");

  const unreadAlerts = alerts.filter(a => !a.isRead);
  const totalDebt    = activeLoans.reduce((s, l) => s + l.outstanding, 0);
  const totalEmi     = activeLoans.reduce((s, l) => s + l.monthlyEmi, 0);

  const momPct = lastMRev > 0 ? `${thisMRev >= lastMRev ? "+" : ""}${Math.round(((thisMRev - lastMRev) / lastMRev) * 100)}%` : "n/a";

  const DATA_BLOCK = `- Cash balance: ${formatCurrency(balance)}
- Cash runway: ${runway} days
- Monthly burn rate: ${formatAmount(burn)}
- This month revenue: ${formatAmount(thisMRev)} (vs last month ${formatAmount(lastMRev)}, MoM ${momPct})
- This month expenses: ${formatAmount(thisMExp)} (vs last month ${formatAmount(lastMExp)})
- Active loans: ${activeLoans.length} loans, ${formatAmount(totalDebt)} outstanding, ${formatAmount(totalEmi)}/month EMI
- Open alerts/risks: ${unreadAlerts.length} (${unreadAlerts.slice(0,2).map(a=>a.title).join(", ") || "none"})
- Top 3 vendors by spend: ${topVendors || "none"}
- Industry: ${firm.industry || "unknown"}`;

  const buildPrompt = useCallback(() => {
    if (isInvestor) {
      return `You are the founder of ${firm.name || "this business"} writing a transparent MONTHLY INVESTOR / BOARD UPDATE. Use ONLY the real data below — never invent metrics you don't have.

DATA:
${DATA_BLOCK}

Write the update in these exact sections with ## headers:
## Headline
## Performance
## Cash & Runway
## Risks & Mitigations
## Asks

In "Headline" give two sentences capturing the month. In "Asks" be specific about help/intros/capital needed; if there's nothing material, write "No asks this month." Tone: confident, candid, concise. Use ₹ and L/Cr. Max 350 words. Do not fabricate any number.`;
    }
    return `You are the CFO of ${firm.name || "this business"}. Write a concise weekly CFO brief for the business owner. Use the following real financial data:

FINANCIALS:
${DATA_BLOCK}

Write the brief in these exact sections with ## headers:
## Key Metrics
## Revenue Analysis
## Cash & Risk Alerts
## Top 3 Action Items
## Strategic Observations

Be specific with numbers. Use ₹ for amounts. Max 400 words total. Speak directly to the business owner.`;
  }, [isInvestor, DATA_BLOCK, firm]);

  const generate = async () => {
    setLoading(true);
    setBrief(null);
    try {
      const result = await api.post<{ content: string }>("/api/ai/ask", {
        messages: [{ role: "user", content: buildPrompt() }],
        system: isInvestor
          ? "You are a founder writing a transparent monthly update to investors/board for an Indian SMB. Be specific and honest; never invent numbers. Use Indian formatting (L for lakhs, Cr for crores)."
          : "You are a senior CFO writing a weekly brief for an Indian SMB owner. Be specific, data-driven, and actionable. Use Indian number formatting (L for lakhs, Cr for crores).",
      });
      const raw = result.content || "";
      setRawBrief(raw);
      setBrief(parseBrief(raw));
      setGenerated(new Date());
      toast.success(isInvestor ? "Investor update generated" : "CFO Brief generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate — AI not configured");
      // Deterministic fallback built from the same real numbers (no AI needed).
      const metrics = `Cash balance: ${formatCurrency(balance)}\nRunway: ${runway} days\nMonthly burn: ${formatAmount(burn)}\nThis month revenue: ${formatAmount(thisMRev)} (MoM ${momPct})\nThis month expenses: ${formatAmount(thisMExp)}`;
      const fallbackRaw = isInvestor
        ? `## Headline\n${firm.name || "We"} ended the month with ${formatAmount(balance)} cash and ${runway} days of runway; revenue is ${momPct} MoM.\n\n## Performance\nRevenue ${formatAmount(thisMRev)} vs ${formatAmount(lastMRev)} last month. Expenses ${formatAmount(thisMExp)}.\n\n## Cash & Runway\n${formatCurrency(balance)} in the bank, ~${runway} days at the current ${formatAmount(burn)}/mo burn.\n\n## Risks & Mitigations\n${unreadAlerts.length} open alert(s). ${runway < 90 ? "Runway under 90 days — tightening spend and accelerating collections." : "Runway healthy."}\n\n## Asks\n${runway < 90 ? "Intros to working-capital lenders would help us extend runway." : "No asks this month."}`
        : `## Key Metrics\n${metrics}\n\n## Cash & Risk Alerts\n${runway < 60 ? `⚠️ Runway is only ${runway} days — below the recommended 90-day threshold.` : `Cash runway of ${runway} days is healthy.`}\n\n## Top 3 Action Items\n1. Review overdue receivables and send collection reminders\n2. Reconcile this month's GST liability before the 20th\n3. ${runway < 90 ? "Consider a credit facility before runway drops below 60 days" : "Review top vendor spend for optimization"}`;
      setRawBrief(fallbackRaw);
      setBrief(parseBrief(fallbackRaw));
      setGenerated(new Date());
    } finally {
      setLoading(false);
    }
  };

  const downloadTxt = () => {
    if (!rawBrief) return;
    const heading = isInvestor ? "Investor Update" : "CFO Brief";
    const blob = new Blob([`${heading} — ${firm.name}\nGenerated: ${generated?.toLocaleString("en-IN")}\n\n${rawBrief}`], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = isInvestor ? "investor-update.txt" : "cfo-brief.txt"; a.click();
  };

  const quickStats = [
    { label: "Cash Balance",    value: formatAmount(balance),     color: balance > burn * 3 ? "text-green-400" : "text-red-400" },
    { label: "Runway",          value: `${runway}d`,              color: runway > 90 ? "text-green-400" : runway > 45 ? "text-yellow-400" : "text-red-400" },
    { label: "MoM Revenue",     value: lastMRev > 0 ? `${thisMRev >= lastMRev ? "+" : ""}${Math.round(((thisMRev-lastMRev)/lastMRev)*100)}%` : "—", color: thisMRev >= lastMRev ? "text-green-400" : "text-red-400" },
    { label: "Active Alerts",   value: unreadAlerts.length.toString(), color: unreadAlerts.length > 0 ? "text-orange-400" : "text-green-400" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{isInvestor ? "AI Investor Update" : "AI CFO Brief"}</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {isInvestor
              ? "Board-ready monthly update drafted from your live numbers — no fabricated metrics"
              : "Weekly executive summary generated from your live financial data"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {brief && canExport() && (
            <button onClick={downloadTxt} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
              <Download size={12} /> Export
            </button>
          )}
          <button onClick={generate} disabled={loading}
            className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
            {loading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {loading ? "Generating…" : brief ? "Regenerate" : isInvestor ? "Generate Update" : "Generate Brief"}
          </button>
        </div>
      </div>

      {/* Audience toggle */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {([["brief", "CFO Brief (you)"], ["investor", "Investor Update (board)"]] as const).map(([m, label]) => (
          <button key={m} onClick={() => switchMode(m)}
            className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${mode === m ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Quick stats always visible */}
      <div className="grid grid-cols-4 gap-3">
        {quickStats.map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {!brief && !loading && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-12 text-center">
          <Sparkles size={32} className="mx-auto mb-4 text-[var(--color-primary)] opacity-50" />
          <h2 className="text-base font-semibold mb-2">{isInvestor ? "Your investor update is ready to draft" : "Your CFO Brief is ready to generate"}</h2>
          <p className="text-sm text-[var(--color-muted)] max-w-sm mx-auto mb-6">
            {isInvestor
              ? "AI drafts a board-ready monthly update — performance, cash & runway, risks, and asks — straight from your live numbers. Review, edit, and send."
              : "AI analyses your live cash data, revenue trends, burn rate, and alerts to write a concise executive brief — like having a CFO on call."}
          </p>
          <button onClick={generate}
            className="flex items-center gap-2 mx-auto bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-6 py-3 rounded-lg hover:opacity-90">
            <Sparkles size={16} /> {isInvestor ? "Draft My Investor Update" : "Generate My CFO Brief"}
          </button>
        </div>
      )}

      {loading && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-10 text-center">
          <div className="w-10 h-10 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-semibold mb-1">Analysing your financials…</p>
          <p className="text-xs text-[var(--color-muted)]">Reading {transactions.length} transactions, {bankAccounts.length} accounts, {alerts.length} alerts</p>
        </div>
      )}

      {brief && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Clock size={11} />
            Generated {generated?.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brief.map((section, i) => (
              <div key={i} className={`border rounded-xl p-5 ${SECTION_STYLE[section.type]}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{section.icon}</span>
                  <h3 className="text-sm font-bold text-[var(--color-text)]">{section.title}</h3>
                </div>
                <div className="text-sm text-[var(--color-muted)] leading-relaxed whitespace-pre-line">
                  {section.content.split("\n").map((line, j) => (
                    <p key={j} className={`mb-1 ${line.startsWith("⚠️") ? "text-orange-400" : line.startsWith("✅") || line.startsWith("1.") || line.startsWith("2.") || line.startsWith("3.") ? "text-[var(--color-text)]" : ""}`}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
            This brief is generated by AI from your connected bank data. Numbers are derived from actual transactions. Always verify before making major financial decisions.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers shared by the three CFO tools below ─────────────────────────────────
// Returns the YYYY-MM-DD bounds for the calendar month `back` months ago (0 = current).
function monthBounds(back: number) {
  const d = subMonths(new Date(), back);
  return { start: startOfMonth(d).toISOString().split("T")[0], end: endOfMonth(d).toISOString().split("T")[0], label: format(d, "MMM yyyy") };
}

// Net flow / inflow / outflow for a transaction list in a date window.
function flowsIn(txns: { date: string; amount: number }[], start: string, end: string) {
  const win = txns.filter(t => t.date >= start && t.date <= end);
  const inflow = win.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outflow = Math.abs(win.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  return { inflow, outflow, net: inflow - outflow };
}

function pctChange(now: number, prev: number): number | null {
  if (prev === 0) return now === 0 ? 0 : null;
  return Math.round(((now - prev) / Math.abs(prev)) * 100);
}

// #151 ── AUTO VARIANCE COMMENTARY ───────────────────────────────────────────────
// Plain-English "why" behind month-on-month movements, derived entirely from the
// live transaction store: it isolates the categories & counterparties that drove
// each line item's change so the owner sees the cause, not just the delta.
function VarianceCommentary() {
  const { store } = useApp();
  const { transactions } = store;

  const cur = useMemo(() => monthBounds(0), []);
  const prev = useMemo(() => monthBounds(1), []);

  const lines = useMemo(() => {
    const curWin = transactions.filter(t => t.date >= cur.start && t.date <= cur.end);
    const prevWin = transactions.filter(t => t.date >= prev.start && t.date <= prev.end);

    // Per-category net movement.
    const cats = Array.from(new Set([...curWin, ...prevWin].map(t => t.category)));
    const rows = cats.map(category => {
      const c = curWin.filter(t => t.category === category).reduce((s, t) => s + t.amount, 0);
      const p = prevWin.filter(t => t.category === category).reduce((s, t) => s + t.amount, 0);
      const delta = c - p;

      // Biggest counterparty swing inside the category explains the "why".
      const byParty: Record<string, number> = {};
      curWin.filter(t => t.category === category).forEach(t => { byParty[t.counterparty || "Unattributed"] = (byParty[t.counterparty || "Unattributed"] || 0) + t.amount; });
      prevWin.filter(t => t.category === category).forEach(t => { byParty[t.counterparty || "Unattributed"] = (byParty[t.counterparty || "Unattributed"] || 0) - t.amount; });
      const driver = Object.entries(byParty).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

      return { category, cur: c, prev: p, delta, pct: pctChange(c, p), driver: driver && Math.abs(driver[1]) > 0 ? driver : null };
    }).filter(r => Math.abs(r.delta) > 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return rows;
  }, [transactions, cur, prev]);

  const commentary = useMemo(() => lines.map(r => {
    const moved = r.delta >= 0 ? "increased" : "decreased";
    const dirWord = r.category === "revenue" ? (r.delta >= 0 ? "favourably" : "unfavourably") : (r.delta >= 0 ? "unfavourably" : "favourably");
    const pctTxt = r.pct === null ? "(no comparable prior activity)" : `${r.pct >= 0 ? "+" : ""}${r.pct}%`;
    const driverTxt = r.driver ? ` — chiefly ${r.driver[0]} (${r.driver[1] >= 0 ? "+" : ""}${formatAmount(r.driver[1])})` : "";
    return `${capitalise(r.category)} ${moved} ${formatAmount(Math.abs(r.delta))} ${pctTxt} MoM, moving ${dirWord}${driverTxt}.`;
  }), [lines]);

  const copyAll = () => {
    const txt = `Variance Commentary — ${prev.label} → ${cur.label}\n\n${commentary.join("\n")}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Commentary copied"), () => toast.error("Copy failed"));
  };

  const hasData = lines.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FileText size={18} className="text-[var(--color-primary)]" /> Auto Variance Commentary</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">The plain-English "why" behind every month-on-month movement — {prev.label} vs {cur.label}</p>
        </div>
        {hasData && (
          <button onClick={copyAll} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
            <Copy size={12} /> Copy commentary
          </button>
        )}
      </div>

      {!hasData ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-12 text-center">
          <FileText size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No movement to explain yet — transactions across two consecutive months are needed to compute variance.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lines.map(r => {
            const favourable = r.category === "revenue" ? r.delta >= 0 : r.delta <= 0;
            return (
              <div key={r.category} className={`border rounded-xl p-5 ${favourable ? "border-green-800/30 bg-green-950/10" : "border-orange-800/30 bg-orange-950/10"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {favourable ? <TrendingUp size={14} className="text-green-400" /> : <TrendingDown size={14} className="text-orange-400" />}
                    <h3 className="text-sm font-bold capitalize">{r.category}</h3>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${favourable ? "text-green-400" : "text-orange-400"}`}>
                    {r.delta >= 0 ? "+" : ""}{formatAmount(r.delta)} {r.pct !== null && <span className="text-xs">({r.pct >= 0 ? "+" : ""}{r.pct}%)</span>}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                  <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5">
                    <p className="text-[10px] text-[var(--color-muted)]">{prev.label}</p>
                    <p className="tabular-nums font-semibold">{formatCurrency(r.prev)}</p>
                  </div>
                  <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5">
                    <p className="text-[10px] text-[var(--color-muted)]">{cur.label}</p>
                    <p className="tabular-nums font-semibold">{formatCurrency(r.cur)}</p>
                  </div>
                </div>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  {capitalise(r.category)} {r.delta >= 0 ? "increased" : "decreased"} by {formatAmount(Math.abs(r.delta))}
                  {r.driver ? <> — chiefly driven by <span className="text-[var(--color-text)] font-medium">{r.driver[0]}</span> ({r.driver[1] >= 0 ? "+" : ""}{formatAmount(r.driver[1])}).</> : "."}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function capitalise(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// #152 ── BOARD-DECK GENERATOR ───────────────────────────────────────────────────
// Assembles a board-ready set of financial slides (text sections) from live data,
// lets the owner toggle which slides to include, then exports/copies the deck.
interface DeckSlide { id: string; title: string; bullets: string[] }

function BoardDeckGenerator() {
  const { store, canExport } = useApp();
  const { transactions, bankAccounts, firm, activeLoans, alerts } = store;

  // Which slides to include — durable so the owner's deck template persists.
  const [enabled, setEnabled] = useFeatureState<Record<string, boolean>>("cfo-deck-slides", {});
  const isOn = (id: string) => enabled[id] !== false; // default on
  const toggle = (id: string) => setEnabled(prev => ({ ...prev, [id]: prev[id] === false ? true : false }));

  const slides = useMemo<DeckSlide[]>(() => {
    const cur = monthBounds(0), prev = monthBounds(1);
    const c = flowsIn(transactions, cur.start, cur.end);
    const p = flowsIn(transactions, prev.start, prev.end);
    const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
    const burn = monthlyBurn(transactions);
    const runway = runwayDays(bankAccounts.map(b => b.balance), burn);
    const revPct = pctChange(c.inflow, p.inflow);
    const totalDebt = activeLoans.reduce((s, l) => s + l.outstanding, 0);
    const totalEmi = activeLoans.reduce((s, l) => s + l.monthlyEmi, 0);
    const openRisks = alerts.filter(a => !a.isRead);

    const topCustomers = Object.entries(
      transactions.filter(t => t.amount > 0 && t.date >= cur.start && t.date <= cur.end && t.counterparty)
        .reduce((acc, t) => { acc[t.counterparty] = (acc[t.counterparty] || 0) + t.amount; return acc; }, {} as Record<string, number>)
    ).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return [
      { id: "title", title: `${firm.name || "Company"} — Board Review (${cur.label})`, bullets: [
        `Industry: ${firm.industry || "—"}`,
        `Prepared from live financial data on ${format(new Date(), "d MMM yyyy")}`,
      ] },
      { id: "summary", title: "Executive Summary", bullets: [
        `Revenue ${formatCurrency(c.inflow)} this month (${revPct === null ? "n/a" : `${revPct >= 0 ? "+" : ""}${revPct}%`} MoM)`,
        `Net cash flow ${c.net >= 0 ? "positive" : "negative"} at ${formatCurrency(c.net)}`,
        `${formatCurrency(balance)} cash on hand, ~${runway} days runway`,
        `${openRisks.length} open risk${openRisks.length === 1 ? "" : "s"} flagged`,
      ] },
      { id: "pnl", title: "P&L Snapshot", bullets: [
        `Inflow: ${formatCurrency(c.inflow)} (prev ${formatCurrency(p.inflow)})`,
        `Outflow: ${formatCurrency(c.outflow)} (prev ${formatCurrency(p.outflow)})`,
        `Net: ${formatCurrency(c.net)} (prev ${formatCurrency(p.net)})`,
        `Monthly burn rate: ${formatCurrency(burn)}`,
      ] },
      { id: "cash", title: "Cash & Runway", bullets: [
        `Total cash across ${bankAccounts.length} account${bankAccounts.length === 1 ? "" : "s"}: ${formatCurrency(balance)}`,
        `Runway at current burn: ~${runway} days`,
        runway < 90 ? "Runway below 90 days — prioritise collections / financing." : "Runway healthy (>90 days).",
      ] },
      { id: "customers", title: "Top Revenue Concentration", bullets: topCustomers.length
        ? topCustomers.map(([n, v]) => `${n}: ${formatCurrency(v)} (${c.inflow > 0 ? Math.round((v / c.inflow) * 100) : 0}% of month)`)
        : ["No customer revenue recorded this month."] },
      { id: "debt", title: "Debt & Obligations", bullets: activeLoans.length
        ? [`${activeLoans.length} active loan${activeLoans.length === 1 ? "" : "s"}, ${formatCurrency(totalDebt)} outstanding`, `Total EMI commitment: ${formatCurrency(totalEmi)}/month`]
        : ["No active loans — debt-free."] },
      { id: "risks", title: "Key Risks", bullets: openRisks.length
        ? openRisks.slice(0, 4).map(a => `[${a.severity}] ${a.title}`)
        : ["No open alerts this period."] },
      { id: "asks", title: "Asks / Next Steps", bullets: [
        runway < 90 ? "Approve a working-capital facility to extend runway." : "Maintain current cash discipline.",
        c.net < 0 ? "Review discretionary spend to restore positive cash flow." : "Reinvest surplus into growth levers.",
      ] },
    ];
  }, [transactions, bankAccounts, firm, activeLoans, alerts]);

  const activeSlides = slides.filter(s => isOn(s.id));

  const deckText = useMemo(() => activeSlides.map((s, i) =>
    `Slide ${i + 1}: ${s.title}\n${s.bullets.map(b => `  • ${b}`).join("\n")}`
  ).join("\n\n"), [activeSlides]);

  const copyDeck = () => navigator.clipboard.writeText(deckText).then(() => toast.success("Deck copied to clipboard"), () => toast.error("Copy failed"));
  const exportDeck = () => {
    const blob = new Blob([`${firm.name || "Company"} — Board Deck\n${"=".repeat(40)}\n\n${deckText}`], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "board-deck.txt"; a.click();
    toast.success("Board deck exported");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Presentation size={18} className="text-[var(--color-primary)]" /> Board-Deck Generator</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Board-ready financial slides assembled from your live numbers — toggle, copy, or export</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyDeck} disabled={!activeSlides.length} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg disabled:opacity-40">
            <Copy size={12} /> Copy
          </button>
          {canExport() && (
            <button onClick={exportDeck} disabled={!activeSlides.length} className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
              <Download size={13} /> Export Deck
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {slides.map((s, i) => {
          const on = isOn(s.id);
          return (
            <div key={s.id} className={`border rounded-xl p-5 transition-opacity ${on ? "border-[var(--color-border)] bg-[var(--color-surface)]" : "border-[var(--color-border)] bg-[var(--color-surface)] opacity-40"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[var(--color-muted)] tabular-nums">{i + 1}</span>
                  <h3 className="text-sm font-bold text-[var(--color-text)]">{s.title}</h3>
                </div>
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted)] cursor-pointer shrink-0">
                  <input type="checkbox" checked={on} onChange={() => toggle(s.id)} className="accent-[var(--color-primary)]" />
                  {on ? "Included" : "Hidden"}
                </label>
              </div>
              <ul className="space-y-1.5">
                {s.bullets.map((b, j) => (
                  <li key={j} className="text-sm text-[var(--color-muted)] leading-relaxed flex gap-2">
                    <ChevronRight size={13} className="shrink-0 mt-0.5 text-[var(--color-primary)]" />{b}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        {activeSlides.length} of {slides.length} slides selected. All figures are computed from your connected bank data. Review before presenting to your board.
      </div>
    </div>
  );
}

// #153 ── RISK & WATCHLIST BRIEF ─────────────────────────────────────────────────
// Surfaces the top financial risks this period by scoring live signals: short
// runway, negative cash flow, revenue concentration, debt-service load, and open
// alerts — each with a plain-English explanation and severity.
interface RiskItem { id: string; title: string; detail: string; severity: "critical" | "high" | "medium" | "low"; score: number }

const RISK_STYLE: Record<RiskItem["severity"], string> = {
  critical: "border-red-800/40 bg-red-950/20 text-red-400",
  high:     "border-orange-800/40 bg-orange-950/20 text-orange-400",
  medium:   "border-yellow-800/40 bg-yellow-950/20 text-yellow-400",
  low:      "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]",
};

function RiskWatchlistBrief() {
  const { store } = useApp();
  const { transactions, bankAccounts, activeLoans, alerts } = store;

  const risks = useMemo<RiskItem[]>(() => {
    const out: RiskItem[] = [];
    const cur = monthBounds(0);
    const c = flowsIn(transactions, cur.start, cur.end);
    const burn = monthlyBurn(transactions);
    const runway = runwayDays(bankAccounts.map(b => b.balance), burn);

    // 1. Runway risk
    if (runway < 30) out.push({ id: "runway", title: "Critical cash runway", detail: `Only ~${runway} days of runway at the current ${formatAmount(burn)}/mo burn. Immediate financing or spend cuts needed.`, severity: "critical", score: 100 - runway });
    else if (runway < 90) out.push({ id: "runway", title: "Tightening cash runway", detail: `~${runway} days of runway — below the recommended 90-day buffer. Accelerate collections.`, severity: "high", score: 100 - runway });

    // 2. Cash-flow risk
    if (c.net < 0) out.push({ id: "burn", title: "Negative net cash flow", detail: `This month's outflow (${formatAmount(c.outflow)}) exceeds inflow (${formatAmount(c.inflow)}) by ${formatAmount(Math.abs(c.net))}.`, severity: c.net < -burn ? "high" : "medium", score: Math.min(90, Math.round(Math.abs(c.net) / Math.max(burn, 1) * 40)) });

    // 3. Revenue concentration
    const byCustomer = Object.entries(
      transactions.filter(t => t.amount > 0 && t.date >= cur.start && t.date <= cur.end && t.counterparty)
        .reduce((acc, t) => { acc[t.counterparty] = (acc[t.counterparty] || 0) + t.amount; return acc; }, {} as Record<string, number>)
    ).sort((a, b) => b[1] - a[1]);
    if (byCustomer.length && c.inflow > 0) {
      const topShare = Math.round((byCustomer[0][1] / c.inflow) * 100);
      if (topShare >= 40) out.push({ id: "concentration", title: "High revenue concentration", detail: `${byCustomer[0][0]} accounts for ${topShare}% of this month's revenue — losing them would materially hit cash.`, severity: topShare >= 60 ? "high" : "medium", score: topShare });
    }

    // 4. Debt-service load
    const totalEmi = activeLoans.reduce((s, l) => s + l.monthlyEmi, 0);
    if (totalEmi > 0 && c.inflow > 0) {
      const dscr = Math.round((totalEmi / c.inflow) * 100);
      if (dscr >= 30) out.push({ id: "debt", title: "Heavy debt-service load", detail: `EMIs of ${formatAmount(totalEmi)}/mo consume ${dscr}% of monthly revenue across ${activeLoans.length} loan(s).`, severity: dscr >= 50 ? "high" : "medium", score: dscr });
    }

    // 5. Open critical/high alerts from the live store
    alerts.filter(a => !a.isRead && (a.severity === "critical" || a.severity === "high")).slice(0, 5).forEach(a => {
      out.push({ id: `alert-${a.id}`, title: a.title, detail: a.message, severity: a.severity, score: a.severity === "critical" ? 95 : 70 });
    });

    return out.sort((a, b) => b.score - a.score);
  }, [transactions, bankAccounts, activeLoans, alerts]);

  const counts = useMemo(() => ({
    critical: risks.filter(r => r.severity === "critical").length,
    high: risks.filter(r => r.severity === "high").length,
    medium: risks.filter(r => r.severity === "medium").length,
  }), [risks]);

  const copyBrief = () => {
    const txt = `Risk & Watchlist Brief — ${monthBounds(0).label}\n\n${risks.length ? risks.map((r, i) => `${i + 1}. [${r.severity.toUpperCase()}] ${r.title}\n   ${r.detail}`).join("\n\n") : "No material financial risks detected this period."}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Risk brief copied"), () => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ShieldAlert size={18} className="text-[var(--color-primary)]" /> Risk & Watchlist Brief</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Top financial risks this period, scored from your live cash, revenue, debt & alert signals</p>
        </div>
        {risks.length > 0 && (
          <button onClick={copyBrief} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
            <Copy size={12} /> Copy brief
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Critical", value: counts.critical, color: counts.critical > 0 ? "text-red-400" : "text-green-400" },
          { label: "High", value: counts.high, color: counts.high > 0 ? "text-orange-400" : "text-green-400" },
          { label: "Medium", value: counts.medium, color: counts.medium > 0 ? "text-yellow-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label} risks</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {risks.length === 0 ? (
        <div className="border border-green-800/30 bg-green-950/10 rounded-xl p-10 text-center">
          <CheckCircle2 size={28} className="mx-auto mb-3 text-green-400" />
          <p className="text-sm font-semibold text-green-400 mb-1">No material financial risks detected</p>
          <p className="text-xs text-[var(--color-muted)]">Runway, cash flow, concentration, and debt load are all within healthy ranges this period.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {risks.map(r => (
            <div key={r.id} className={`border rounded-xl p-5 ${RISK_STYLE[r.severity]}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} />
                  <h3 className="text-sm font-bold text-[var(--color-text)]">{r.title}</h3>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-current">{r.severity}</span>
              </div>
              <p className="text-sm text-[var(--color-muted)] leading-relaxed">{r.detail}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        Risks are scored heuristically from your connected bank data and open alerts. This is decision support, not financial advice.
      </div>
    </div>
  );
}

// #154 ── WEEKLY KPI SCORECARD ───────────────────────────────────────────────────
// A compact scorecard of the headline finance KPIs with MoM deltas and a RAG
// (red/amber/green) status per metric, computed entirely from the live store.
function KpiScorecard() {
  const { store } = useApp();
  const { transactions, bankAccounts, activeLoans } = store;

  const rows = useMemo(() => {
    const cur = monthBounds(0), prev = monthBounds(1);
    const c = flowsIn(transactions, cur.start, cur.end);
    const p = flowsIn(transactions, prev.start, prev.end);
    const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
    const burn = monthlyBurn(transactions);
    const runway = runwayDays(bankAccounts.map(b => b.balance), burn);
    const totalEmi = activeLoans.reduce((s, l) => s + l.monthlyEmi, 0);
    const dscr = c.inflow > 0 ? Math.round((totalEmi / c.inflow) * 100) : 0;

    type Rag = "green" | "amber" | "red";
    const mk = (label: string, value: string, delta: number | null, rag: Rag, hint: string) => ({ label, value, delta, rag, hint });

    return [
      mk("Revenue (MoM)", formatCurrency(c.inflow), pctChange(c.inflow, p.inflow), c.inflow >= p.inflow ? "green" : c.inflow >= p.inflow * 0.9 ? "amber" : "red", `vs ${formatAmount(p.inflow)} last month`),
      mk("Net cash flow", formatCurrency(c.net), pctChange(c.net, p.net), c.net > 0 ? "green" : c.net === 0 ? "amber" : "red", `inflow − outflow this month`),
      mk("Cash balance", formatCurrency(balance), null, balance > burn * 3 ? "green" : balance > burn ? "amber" : "red", `${(burn > 0 ? balance / burn : 0).toFixed(1)}× monthly burn`),
      mk("Runway", `${runway}d`, null, runway > 90 ? "green" : runway > 45 ? "amber" : "red", `at ${formatAmount(burn)}/mo burn`),
      mk("Monthly burn", formatCurrency(burn), pctChange(c.outflow, p.outflow), c.outflow <= p.outflow ? "green" : c.outflow <= p.outflow * 1.1 ? "amber" : "red", `outflow ${formatAmount(c.outflow)} this month`),
      mk("Debt-service ratio", `${dscr}%`, null, dscr < 20 ? "green" : dscr < 35 ? "amber" : "red", `EMI ${formatAmount(totalEmi)}/mo vs revenue`),
    ];
  }, [transactions, bankAccounts, activeLoans]);

  const ragDot: Record<string, string> = { green: "bg-green-400", amber: "bg-yellow-400", red: "bg-red-400" };

  const copy = () => {
    const txt = `Weekly KPI Scorecard — ${monthBounds(0).label}\n\n${rows.map(r => `${r.label}: ${r.value}${r.delta !== null ? ` (${r.delta >= 0 ? "+" : ""}${r.delta}% MoM)` : ""} [${r.rag.toUpperCase()}]`).join("\n")}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Scorecard copied"), () => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Gauge size={18} className="text-[var(--color-primary)]" /> Weekly KPI Scorecard</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Headline finance KPIs with MoM deltas and red/amber/green status — straight from your live data</p>
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
          <Copy size={12} /> Copy scorecard
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(r => (
          <div key={r.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--color-muted)]">{r.label}</p>
              <span className={`w-2.5 h-2.5 rounded-full ${ragDot[r.rag]}`} />
            </div>
            <p className="text-2xl font-bold tabular-nums mb-1">{r.value}</p>
            <div className="flex items-center gap-2 text-[11px]">
              {r.delta !== null && (
                <span className={`flex items-center gap-0.5 font-medium ${r.delta >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {r.delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{r.delta >= 0 ? "+" : ""}{r.delta}%
                </span>
              )}
              <span className="text-[var(--color-muted)]">{r.hint}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// #155 ── CASH-FLOW SNAPSHOT (Sources & Uses) ────────────────────────────────────
// A one-screen sources-and-uses view of this month's cash: where money came from
// (by category) and where it went, with each line as a share of the side total.
function CashFlowSnapshot() {
  const { store } = useApp();
  const { transactions, bankAccounts } = store;

  const data = useMemo(() => {
    const cur = monthBounds(0);
    const win = transactions.filter(t => t.date >= cur.start && t.date <= cur.end);
    const sourcesMap: Record<string, number> = {};
    const usesMap: Record<string, number> = {};
    win.forEach(t => {
      if (t.amount > 0) sourcesMap[t.category] = (sourcesMap[t.category] || 0) + t.amount;
      else usesMap[t.category] = (usesMap[t.category] || 0) + Math.abs(t.amount);
    });
    const sources = Object.entries(sourcesMap).sort((a, b) => b[1] - a[1]);
    const uses = Object.entries(usesMap).sort((a, b) => b[1] - a[1]);
    const inflow = sources.reduce((s, [, v]) => s + v, 0);
    const outflow = uses.reduce((s, [, v]) => s + v, 0);
    const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
    return { sources, uses, inflow, outflow, net: inflow - outflow, opening: balance - (inflow - outflow), closing: balance, label: cur.label };
  }, [transactions, bankAccounts]);

  const Side = ({ title, rows, total, positive }: { title: string; rows: [string, number][]; total: number; positive: boolean }) => (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
        {positive ? <TrendingUp size={14} className="text-green-400" /> : <TrendingDown size={14} className="text-orange-400" />}{title}
      </h3>
      {rows.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No activity this month.</p> : (
        <div className="space-y-2.5">
          {rows.map(([cat, v]) => {
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="capitalize">{cat}</span>
                  <span className="tabular-nums font-medium">{formatCurrency(v)} <span className="text-[var(--color-muted)]">({pct}%)</span></span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
                  <div className={`h-full ${positive ? "bg-green-400" : "bg-orange-400"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between text-sm font-bold pt-2 border-t border-[var(--color-border)]">
            <span>Total</span><span className={`tabular-nums ${positive ? "text-green-400" : "text-orange-400"}`}>{formatCurrency(total)}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Wallet size={18} className="text-[var(--color-primary)]" /> Cash-Flow Snapshot</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Sources &amp; uses of cash for {data.label} — where money came from and where it went</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Opening cash", value: formatAmount(data.opening), color: "text-[var(--color-text)]" },
          { label: "Sources", value: `+${formatAmount(data.inflow)}`, color: "text-green-400" },
          { label: "Uses", value: `−${formatAmount(data.outflow)}`, color: "text-orange-400" },
          { label: "Closing cash", value: formatAmount(data.closing), color: data.net >= 0 ? "text-green-400" : "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Side title="Sources of cash" rows={data.sources} total={data.inflow} positive />
        <Side title="Uses of cash" rows={data.uses} total={data.outflow} positive={false} />
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        Opening cash is derived as closing balance minus this month's net flow. Figures come from your connected bank transactions.
      </div>
    </div>
  );
}

// #156 ── PROFITABILITY / MARGIN SNAPSHOT ────────────────────────────────────────
// Gross-style margin view: revenue minus direct costs (expense + payroll), then
// net margin after tax & interest, with this month vs last month deltas.
function MarginSnapshot() {
  const { store } = useApp();
  const { transactions } = store;

  const calc = (start: string, end: string) => {
    const win = transactions.filter(t => t.date >= start && t.date <= end);
    const sum = (cat: Transaction["category"]) => Math.abs(win.filter(t => t.category === cat).reduce((s, t) => s + t.amount, 0));
    const revenue = win.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const directCost = sum("expense") + sum("payroll");
    const overheads = sum("tax") + sum("loan");
    const grossProfit = revenue - directCost;
    const netProfit = grossProfit - overheads;
    return { revenue, directCost, overheads, grossProfit, netProfit,
      grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0,
      netMargin: revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0 };
  };

  const { cur, prev } = useMemo(() => {
    const c = monthBounds(0), p = monthBounds(1);
    return { cur: { ...calc(c.start, c.end), label: c.label }, prev: { ...calc(p.start, p.end), label: p.label } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);

  const rows: { label: string; cur: number; prev: number; isPct?: boolean; good: "high" | "low" }[] = [
    { label: "Revenue", cur: cur.revenue, prev: prev.revenue, good: "high" },
    { label: "Direct costs (expense + payroll)", cur: cur.directCost, prev: prev.directCost, good: "low" },
    { label: "Gross profit", cur: cur.grossProfit, prev: prev.grossProfit, good: "high" },
    { label: "Gross margin", cur: cur.grossMargin, prev: prev.grossMargin, isPct: true, good: "high" },
    { label: "Overheads (tax + interest)", cur: cur.overheads, prev: prev.overheads, good: "low" },
    { label: "Net profit", cur: cur.netProfit, prev: prev.netProfit, good: "high" },
    { label: "Net margin", cur: cur.netMargin, prev: prev.netMargin, isPct: true, good: "high" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Percent size={18} className="text-[var(--color-primary)]" /> Margin Snapshot</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Gross &amp; net margins for {cur.label} vs {prev.label}, computed from categorised transactions</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Gross margin ({cur.label})</p>
          <p className={`text-2xl font-bold tabular-nums ${cur.grossMargin >= 0 ? "text-green-400" : "text-red-400"}`}>{cur.grossMargin}%</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Net margin ({cur.label})</p>
          <p className={`text-2xl font-bold tabular-nums ${cur.netMargin >= 0 ? "text-green-400" : "text-red-400"}`}>{cur.netMargin}%</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-[var(--color-muted)] border-b border-[var(--color-border)]">
              <th className="text-left font-medium px-4 py-2.5">Line</th>
              <th className="text-right font-medium px-4 py-2.5">{prev.label}</th>
              <th className="text-right font-medium px-4 py-2.5">{cur.label}</th>
              <th className="text-right font-medium px-4 py-2.5">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const delta = r.cur - r.prev;
              const improved = r.good === "high" ? delta >= 0 : delta <= 0;
              return (
                <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5">{r.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{r.isPct ? `${r.prev}%` : formatCurrency(r.prev)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{r.isPct ? `${r.cur}%` : formatCurrency(r.cur)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${improved ? "text-green-400" : "text-orange-400"}`}>
                    {delta >= 0 ? "+" : ""}{r.isPct ? `${delta}pp` : formatAmount(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        A cash-basis approximation: direct costs = expense + payroll, overheads = tax + interest. Use as a directional margin read, not a statutory P&amp;L.
      </div>
    </div>
  );
}

// #157 ── FINANCIAL CALENDAR (dues this month) ───────────────────────────────────
// Consolidates upcoming financial obligations — loan EMIs, payable/overdue
// invoices, and a fixed GST filing date — into a single dated to-do for the month.
function FinancialCalendar() {
  const { store } = useApp();
  const { activeLoans, invoices } = store;

  const events = useMemo(() => {
    const cur = monthBounds(0);
    type Ev = { date: string; label: string; amount: number; kind: "emi" | "ar" | "compliance" };
    const out: Ev[] = [];

    activeLoans.forEach(l => {
      if (l.nextPaymentDate >= cur.start && l.nextPaymentDate <= cur.end) {
        out.push({ date: l.nextPaymentDate, label: `EMI — ${l.lender}`, amount: l.nextPaymentAmount || l.monthlyEmi, kind: "emi" });
      }
    });

    invoices.filter(i => i.status !== "paid" && i.dueDate >= cur.start && i.dueDate <= cur.end).forEach(i => {
      out.push({ date: i.dueDate, label: `Receivable due — ${i.customer}`, amount: i.amount, kind: "ar" });
    });

    // GST filing — standard 20th-of-month deadline.
    const gstDate = `${cur.start.slice(0, 7)}-20`;
    out.push({ date: gstDate, label: "GSTR-3B filing deadline", amount: 0, kind: "compliance" });

    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [activeLoans, invoices]);

  const todayStr = new Date().toISOString().split("T")[0];
  const outflow = events.filter(e => e.kind === "emi").reduce((s, e) => s + e.amount, 0);
  const inflow = events.filter(e => e.kind === "ar").reduce((s, e) => s + e.amount, 0);

  const kindStyle: Record<string, string> = {
    emi: "border-orange-800/30 bg-orange-950/10",
    ar: "border-green-800/30 bg-green-950/10",
    compliance: "border-blue-800/30 bg-blue-950/10",
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><CalendarClock size={18} className="text-[var(--color-primary)]" /> Financial Calendar</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Everything due in {monthBounds(0).label} — EMIs, receivables and the GST deadline, in date order</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Expected in (AR)", value: `+${formatAmount(inflow)}`, color: "text-green-400" },
          { label: "Committed out (EMI)", value: `−${formatAmount(outflow)}`, color: "text-orange-400" },
          { label: "Events this month", value: events.length.toString(), color: "text-[var(--color-text)]" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {events.map((e, i) => {
          const overdue = e.date < todayStr;
          return (
            <div key={i} className={`border rounded-xl p-4 flex items-center justify-between gap-3 ${kindStyle[e.kind]}`}>
              <div className="flex items-center gap-3">
                <div className="text-center shrink-0 w-12">
                  <p className="text-lg font-bold tabular-nums leading-none">{format(new Date(e.date), "d")}</p>
                  <p className="text-[10px] text-[var(--color-muted)] uppercase">{format(new Date(e.date), "MMM")}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{e.label}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">{overdue ? <span className="text-red-400 font-medium">Overdue</span> : `Due ${format(new Date(e.date), "EEE d MMM")}`}</p>
                </div>
              </div>
              {e.amount > 0 && <span className={`text-sm font-bold tabular-nums ${e.kind === "ar" ? "text-green-400" : "text-orange-400"}`}>{e.kind === "ar" ? "+" : "−"}{formatAmount(e.amount)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// #158 ── TOP ACTIONS THIS WEEK ──────────────────────────────────────────────────
// Ranks the most valuable finance actions the owner should take this week from
// live signals (overdue AR, runway, idle cash, open alerts) with a check-off list
// that persists. Each action carries the rupee impact that justifies its rank.
function TopActionsThisWeek() {
  const { store } = useApp();
  const { transactions, bankAccounts, invoices, activeLoans, alerts } = store;

  const [done, setDone] = useFeatureState<Record<string, boolean>>("cfo-actions-done", {});

  const actions = useMemo(() => {
    type Act = { id: string; title: string; detail: string; impact: number; weight: number };
    const out: Act[] = [];
    const cur = monthBounds(0);
    const c = flowsIn(transactions, cur.start, cur.end);
    const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
    const burn = monthlyBurn(transactions);
    const runway = runwayDays(bankAccounts.map(b => b.balance), burn);

    const overdue = invoices.filter(i => i.status === "overdue");
    const overdueAmt = overdue.reduce((s, i) => s + i.amount, 0);
    if (overdue.length) out.push({ id: "collect", title: `Chase ${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}`, detail: `${formatAmount(overdueAmt)} is past due — sending reminders frees up working capital fast.`, impact: overdueAmt, weight: 90 });

    if (runway < 90) out.push({ id: "runway", title: "Shore up runway", detail: `Runway is ~${runway} days. Line up a working-capital facility or trim discretionary spend before it tightens further.`, impact: burn, weight: 100 - runway });

    if (c.net < 0) out.push({ id: "cashflow", title: "Reverse negative cash flow", detail: `Outflow exceeded inflow by ${formatAmount(Math.abs(c.net))} this month — review the largest expense categories.`, impact: Math.abs(c.net), weight: 70 });

    const idle = balance - burn * 3;
    if (idle > burn) out.push({ id: "idle", title: "Park idle cash", detail: `~${formatAmount(idle)} sits above a 3-month buffer — sweep into a liquid fund or FD to earn yield.`, impact: Math.round(idle * 0.06 / 12), weight: 30 });

    const due = activeLoans.filter(l => l.nextPaymentDate >= cur.start && l.nextPaymentDate <= cur.end);
    const dueAmt = due.reduce((s, l) => s + (l.nextPaymentAmount || l.monthlyEmi), 0);
    if (due.length) out.push({ id: "emi", title: `Fund ${due.length} EMI payment${due.length === 1 ? "" : "s"} due this month`, detail: `${formatAmount(dueAmt)} in EMIs fall due — ensure the balance is available to avoid penalties.`, impact: dueAmt, weight: 50 });

    alerts.filter(a => !a.isRead && (a.severity === "critical" || a.severity === "high")).slice(0, 3).forEach(a => {
      out.push({ id: `alert-${a.id}`, title: `Resolve: ${a.title}`, detail: a.message, impact: 0, weight: a.severity === "critical" ? 85 : 60 });
    });

    return out.sort((a, b) => b.weight - a.weight).slice(0, 5);
  }, [transactions, bankAccounts, invoices, activeLoans, alerts]);

  const completed = actions.filter(a => done[a.id]).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ListChecks size={18} className="text-[var(--color-primary)]" /> Top Actions This Week</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">The five highest-impact finance moves for the week, ranked from your live signals — {completed}/{actions.length} done</p>
        </div>
      </div>

      {actions.length === 0 ? (
        <div className="border border-green-800/30 bg-green-950/10 rounded-xl p-10 text-center">
          <CheckCircle2 size={28} className="mx-auto mb-3 text-green-400" />
          <p className="text-sm font-semibold text-green-400 mb-1">Nothing urgent this week</p>
          <p className="text-xs text-[var(--color-muted)]">No overdue receivables, runway pressure, or open critical alerts detected.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((a, i) => {
            const isDone = !!done[a.id];
            return (
              <button key={a.id} onClick={() => setDone(prev => ({ ...prev, [a.id]: !prev[a.id] }))}
                className={`w-full text-left border rounded-xl p-5 flex items-start gap-3 transition-opacity ${isDone ? "border-green-800/30 bg-green-950/10 opacity-50" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
                <div className="shrink-0 mt-0.5">
                  {isDone ? <CheckCircle2 size={18} className="text-green-400" /> : <span className="flex items-center justify-center w-[18px] h-[18px] rounded-full border border-[var(--color-muted)] text-[10px] font-bold text-[var(--color-muted)]">{i + 1}</span>}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`text-sm font-bold ${isDone ? "line-through text-[var(--color-muted)]" : "text-[var(--color-text)]"}`}>{a.title}</h3>
                    {a.impact > 0 && <span className="text-[11px] font-medium text-[var(--color-muted)] shrink-0 tabular-nums">~{formatAmount(a.impact)} impact</span>}
                  </div>
                  <p className="text-sm text-[var(--color-muted)] leading-relaxed mt-1">{a.detail}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// #159 ── ONE-PAGE FINANCIAL SUMMARY ─────────────────────────────────────────────
// A single printable/exportable page distilling the whole financial position into
// four blocks: position, performance, obligations, and headline takeaway.
function OnePageSummary() {
  const { store, canExport } = useApp();
  const { transactions, bankAccounts, activeLoans, invoices, firm, alerts } = store;

  const s = useMemo(() => {
    const cur = monthBounds(0), prev = monthBounds(1);
    const c = flowsIn(transactions, cur.start, cur.end);
    const p = flowsIn(transactions, prev.start, prev.end);
    const balance = bankAccounts.reduce((a, b) => a + b.balance, 0);
    const burn = monthlyBurn(transactions);
    const runway = runwayDays(bankAccounts.map(b => b.balance), burn);
    const totalDebt = activeLoans.reduce((a, l) => a + l.outstanding, 0);
    const totalEmi = activeLoans.reduce((a, l) => a + l.monthlyEmi, 0);
    const ar = invoices.filter(i => i.status !== "paid").reduce((a, i) => a + i.amount, 0);
    const overdue = invoices.filter(i => i.status === "overdue").reduce((a, i) => a + i.amount, 0);
    const revPct = pctChange(c.inflow, p.inflow);
    const openRisks = alerts.filter(a => !a.isRead).length;
    return { cur, balance, burn, runway, totalDebt, totalEmi, ar, overdue, inflow: c.inflow, outflow: c.outflow, net: c.net, revPct, openRisks };
  }, [transactions, bankAccounts, activeLoans, invoices, alerts]);

  const takeaway = s.net >= 0 && s.runway > 90
    ? "Healthy position: positive cash flow this month and over 90 days of runway. Focus on growth and collections discipline."
    : s.runway < 45
      ? "Caution: runway is short — prioritise collections and financing this week."
      : "Stable but watch cash: keep outflow in check and accelerate receivables to extend runway.";

  const exportTxt = () => {
    const txt = `${firm.name || "Company"} — One-Page Financial Summary (${s.cur.label})
${"=".repeat(48)}

POSITION
  Cash balance        ${formatCurrency(s.balance)}
  Runway              ${s.runway} days
  Receivables (open)  ${formatCurrency(s.ar)} (overdue ${formatCurrency(s.overdue)})

PERFORMANCE (this month)
  Revenue             ${formatCurrency(s.inflow)} (${s.revPct === null ? "n/a" : `${s.revPct >= 0 ? "+" : ""}${s.revPct}% MoM`})
  Expenses            ${formatCurrency(s.outflow)}
  Net cash flow       ${formatCurrency(s.net)}
  Monthly burn        ${formatCurrency(s.burn)}

OBLIGATIONS
  Debt outstanding    ${formatCurrency(s.totalDebt)}
  EMI / month         ${formatCurrency(s.totalEmi)}
  Open risks          ${s.openRisks}

TAKEAWAY
  ${takeaway}`;
    const blob = new Blob([txt], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "financial-summary.txt"; a.click();
    toast.success("Summary exported");
  };

  const Block = ({ title, rows }: { title: string; rows: [string, string, string?][] }) => (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-3">{title}</h3>
      <div className="space-y-2">
        {rows.map(([k, v, color]) => (
          <div key={k} className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-muted)]">{k}</span>
            <span className={`tabular-nums font-semibold ${color || ""}`}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FileText size={18} className="text-[var(--color-primary)]" /> One-Page Financial Summary</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">The whole picture on one page for {s.cur.label} — position, performance, obligations and the takeaway</p>
        </div>
        {canExport() && (
          <button onClick={exportTxt} className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
            <Download size={13} /> Export
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Block title="Position" rows={[
          ["Cash balance", formatCurrency(s.balance)],
          ["Runway", `${s.runway}d`, s.runway > 90 ? "text-green-400" : s.runway > 45 ? "text-yellow-400" : "text-red-400"],
          ["Open receivables", formatCurrency(s.ar)],
          ["Overdue AR", formatCurrency(s.overdue), s.overdue > 0 ? "text-orange-400" : undefined],
        ]} />
        <Block title="Performance (MTD)" rows={[
          ["Revenue", formatCurrency(s.inflow), s.revPct !== null && s.revPct >= 0 ? "text-green-400" : "text-red-400"],
          ["Expenses", formatCurrency(s.outflow)],
          ["Net cash flow", formatCurrency(s.net), s.net >= 0 ? "text-green-400" : "text-red-400"],
          ["Monthly burn", formatCurrency(s.burn)],
        ]} />
        <Block title="Obligations" rows={[
          ["Debt outstanding", formatCurrency(s.totalDebt)],
          ["EMI / month", formatCurrency(s.totalEmi)],
          ["Open risks", s.openRisks.toString(), s.openRisks > 0 ? "text-orange-400" : "text-green-400"],
        ]} />
      </div>

      <div className={`border rounded-xl p-5 ${s.net >= 0 && s.runway > 90 ? "border-green-800/30 bg-green-950/10" : s.runway < 45 ? "border-red-800/40 bg-red-950/20" : "border-yellow-800/30 bg-yellow-950/10"}`}>
        <h3 className="text-sm font-bold mb-1 flex items-center gap-2"><Sparkles size={14} className="text-[var(--color-primary)]" /> Takeaway</h3>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">{takeaway}</p>
      </div>
    </div>
  );
}

// #160 ── FINANCIAL RATIOS SNAPSHOT ──────────────────────────────────────────────
// Headline liquidity, leverage and efficiency ratios computed from the live store,
// each benchmarked against a healthy band with a plain-English read of what it means.
function FinancialRatios() {
  const { store } = useApp();
  const { transactions, bankAccounts, activeLoans, invoices } = store;

  const ratios = useMemo(() => {
    const cur = monthBounds(0);
    const c = flowsIn(transactions, cur.start, cur.end);
    const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
    const burn = monthlyBurn(transactions);
    const ar = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
    const totalDebt = activeLoans.reduce((s, l) => s + l.outstanding, 0);
    const totalEmi = activeLoans.reduce((s, l) => s + l.monthlyEmi, 0);

    type Ratio = { label: string; value: string; status: "good" | "watch" | "poor"; band: string; read: string };
    const out: Ratio[] = [];

    // Current ratio (proxy): liquid assets (cash + open AR) vs near-term EMI obligation.
    const liquidAssets = balance + ar;
    const nearObligation = totalEmi > 0 ? totalEmi : 1;
    const currentRatio = liquidAssets / nearObligation;
    out.push({ label: "Liquidity coverage", value: `${currentRatio.toFixed(1)}×`, status: currentRatio >= 3 ? "good" : currentRatio >= 1.5 ? "watch" : "poor", band: "≥ 3× healthy", read: "Cash plus open receivables against this month's EMI load." });

    // Cash-to-burn months.
    const cashMonths = burn > 0 ? balance / burn : 99;
    out.push({ label: "Cash-to-burn", value: `${cashMonths.toFixed(1)} mo`, status: cashMonths >= 6 ? "good" : cashMonths >= 3 ? "watch" : "poor", band: "≥ 6 months healthy", read: "How many months of burn the current cash covers." });

    // Debt-to-revenue (annualised).
    const annualRev = c.inflow * 12;
    const debtToRev = annualRev > 0 ? totalDebt / annualRev : 0;
    out.push({ label: "Debt-to-revenue", value: `${Math.round(debtToRev * 100)}%`, status: debtToRev <= 0.3 ? "good" : debtToRev <= 0.6 ? "watch" : "poor", band: "≤ 30% healthy", read: "Outstanding debt as a share of annualised revenue." });

    // Debt-service coverage: revenue vs EMI.
    const dscr = totalEmi > 0 ? c.inflow / totalEmi : 99;
    out.push({ label: "Debt-service coverage", value: `${dscr.toFixed(1)}×`, status: dscr >= 2 ? "good" : dscr >= 1.25 ? "watch" : "poor", band: "≥ 2× healthy", read: "Monthly revenue against monthly EMI commitments." });

    // Receivables intensity: open AR vs monthly revenue.
    const arIntensity = c.inflow > 0 ? ar / c.inflow : 0;
    out.push({ label: "Receivables intensity", value: `${arIntensity.toFixed(1)}×`, status: arIntensity <= 1 ? "good" : arIntensity <= 2 ? "watch" : "poor", band: "≤ 1× healthy", read: "Open receivables relative to a month of revenue." });

    // Expense ratio: outflow vs inflow this month.
    const expenseRatio = c.inflow > 0 ? c.outflow / c.inflow : (c.outflow > 0 ? 99 : 0);
    out.push({ label: "Expense ratio", value: `${Math.round(expenseRatio * 100)}%`, status: expenseRatio <= 0.85 ? "good" : expenseRatio <= 1 ? "watch" : "poor", band: "≤ 85% healthy", read: "This month's outflow as a share of inflow." });

    return out;
  }, [transactions, bankAccounts, activeLoans, invoices]);

  const statusStyle: Record<string, string> = { good: "text-green-400", watch: "text-yellow-400", poor: "text-red-400" };
  const dot: Record<string, string> = { good: "bg-green-400", watch: "bg-yellow-400", poor: "bg-red-400" };

  const copy = () => {
    const txt = `Financial Ratios — ${monthBounds(0).label}\n\n${ratios.map(r => `${r.label}: ${r.value} (${r.band}) [${r.status.toUpperCase()}]`).join("\n")}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Ratios copied"), () => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Scale size={18} className="text-[var(--color-primary)]" /> Financial Ratios Snapshot</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Liquidity, leverage and efficiency ratios benchmarked against healthy bands — from your live data</p>
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
          <Copy size={12} /> Copy ratios
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ratios.map(r => (
          <div key={r.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--color-muted)]">{r.label}</p>
              <span className={`w-2.5 h-2.5 rounded-full ${dot[r.status]}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums mb-1 ${statusStyle[r.status]}`}>{r.value}</p>
            <p className="text-[11px] text-[var(--color-muted)] mb-1.5">{r.band}</p>
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">{r.read}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        Cash-basis approximations derived from your connected bank data, open receivables and active loans. Directional ratios, not statutory financials.
      </div>
    </div>
  );
}

// #161 ── PROFITABILITY-BY-MONTH TREND ───────────────────────────────────────────
// A six-month rolling trend of revenue, expenses and net profit so the owner sees
// the trajectory rather than a single snapshot, with mini bars and a verdict.
function ProfitabilityTrend() {
  const { store } = useApp();
  const { transactions } = store;

  const months = useMemo(() => {
    const out: { label: string; revenue: number; expense: number; net: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const b = monthBounds(i);
      const f = flowsIn(transactions, b.start, b.end);
      out.push({ label: b.label, revenue: f.inflow, expense: f.outflow, net: f.net });
    }
    return out;
  }, [transactions]);

  const maxRev = Math.max(1, ...months.map(m => m.revenue));
  const profitable = months.filter(m => m.net > 0).length;
  const first = months[0];
  const last = months[months.length - 1];
  const trendPct = pctChange(last.net, first.net);

  const verdict = profitable >= 5
    ? "Consistently profitable across the window — a strong, durable trajectory."
    : profitable >= 3
      ? "Mixed: profitable in most months but with loss-making swings to watch."
      : "Mostly loss-making — net profit needs structural attention, not one-off fixes.";

  const copy = () => {
    const txt = `Profitability Trend (6 months)\n\n${months.map(m => `${m.label}: rev ${formatAmount(m.revenue)}, exp ${formatAmount(m.expense)}, net ${formatAmount(m.net)}`).join("\n")}\n\n${verdict}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Trend copied"), () => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><LineChart size={18} className="text-[var(--color-primary)]" /> Profitability Trend</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Revenue, expenses and net profit over the last six months — the trajectory, not just today</p>
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
          <Copy size={12} /> Copy trend
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Profitable months", value: `${profitable}/6`, color: profitable >= 4 ? "text-green-400" : profitable >= 2 ? "text-yellow-400" : "text-red-400" },
          { label: `Net (${last.label})`, value: formatAmount(last.net), color: last.net >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Net trend (6mo)", value: trendPct === null ? "—" : `${trendPct >= 0 ? "+" : ""}${trendPct}%`, color: (trendPct ?? 0) >= 0 ? "text-green-400" : "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-3">
        {months.map(m => {
          const revW = Math.round((m.revenue / maxRev) * 100);
          const expW = Math.round((m.expense / maxRev) * 100);
          return (
            <div key={m.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">{m.label}</span>
                <span className={`tabular-nums font-semibold ${m.net >= 0 ? "text-green-400" : "text-red-400"}`}>{m.net >= 0 ? "+" : ""}{formatAmount(m.net)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden mb-1">
                <div className="h-full bg-green-400" style={{ width: `${revW}%` }} />
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
                <div className="h-full bg-orange-400" style={{ width: `${expW}%` }} />
              </div>
            </div>
          );
        })}
        <div className="flex items-center gap-4 text-[11px] text-[var(--color-muted)] pt-1">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-1.5 rounded-full bg-green-400" /> Revenue</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-1.5 rounded-full bg-orange-400" /> Expenses</span>
        </div>
      </div>

      <div className={`border rounded-xl p-5 ${profitable >= 5 ? "border-green-800/30 bg-green-950/10" : profitable >= 3 ? "border-yellow-800/30 bg-yellow-950/10" : "border-red-800/40 bg-red-950/20"}`}>
        <h3 className="text-sm font-bold mb-1 flex items-center gap-2"><Sparkles size={14} className="text-[var(--color-primary)]" /> Verdict</h3>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">{verdict}</p>
      </div>
    </div>
  );
}

// #162 ── EXPENSE-CONTROL SCORECARD ──────────────────────────────────────────────
// Grades spending discipline per expense category by comparing this month's spend
// to a trailing 3-month average, flagging the categories that are creeping up.
function ExpenseControlScorecard() {
  const { store } = useApp();
  const { transactions } = store;

  const rows = useMemo(() => {
    const cur = monthBounds(0);
    const curWin = transactions.filter(t => t.date >= cur.start && t.date <= cur.end && t.amount < 0);

    // Trailing 3-month average baseline (months 1..3 back).
    const baseMonths = [1, 2, 3].map(b => monthBounds(b));
    const spendIn = (cat: string, start: string, end: string) =>
      Math.abs(transactions.filter(t => t.amount < 0 && t.category === cat && t.date >= start && t.date <= end).reduce((s, t) => s + t.amount, 0));

    const cats = Array.from(new Set(curWin.map(t => t.category)));
    return cats.map(category => {
      const current = spendIn(category, cur.start, cur.end);
      const baseline = baseMonths.reduce((s, m) => s + spendIn(category, m.start, m.end), 0) / 3;
      const pct = pctChange(current, baseline);
      const status: "controlled" | "watch" | "overrun" =
        pct === null ? "watch" : pct <= 5 ? "controlled" : pct <= 20 ? "watch" : "overrun";
      return { category, current, baseline, pct, status };
    }).sort((a, b) => b.current - a.current);
  }, [transactions]);

  const overruns = rows.filter(r => r.status === "overrun").length;
  const grade = overruns === 0 ? "A" : overruns === 1 ? "B" : overruns <= 3 ? "C" : "D";
  const gradeColor = overruns === 0 ? "text-green-400" : overruns <= 2 ? "text-yellow-400" : "text-red-400";

  const statusStyle: Record<string, string> = {
    controlled: "border-green-800/30 bg-green-950/10 text-green-400",
    watch: "border-yellow-800/30 bg-yellow-950/10 text-yellow-400",
    overrun: "border-red-800/40 bg-red-950/20 text-red-400",
  };

  const copy = () => {
    const txt = `Expense-Control Scorecard — ${monthBounds(0).label} (Grade ${grade})\n\n${rows.map(r => `${capitalise(r.category)}: ${formatAmount(r.current)} vs ${formatAmount(r.baseline)} avg (${r.pct === null ? "n/a" : `${r.pct >= 0 ? "+" : ""}${r.pct}%`}) [${r.status.toUpperCase()}]`).join("\n")}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Scorecard copied"), () => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Receipt size={18} className="text-[var(--color-primary)]" /> Expense-Control Scorecard</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">This month's spend per category vs its trailing 3-month average — catching the creep early</p>
        </div>
        {rows.length > 0 && (
          <button onClick={copy} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
            <Copy size={12} /> Copy scorecard
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Control grade", value: grade, color: gradeColor },
          { label: "Categories tracked", value: rows.length.toString(), color: "text-[var(--color-text)]" },
          { label: "Overruns", value: overruns.toString(), color: overruns > 0 ? "text-red-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-12 text-center">
          <Receipt size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No expense activity this month to grade yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.category} className={`border rounded-xl p-5 ${statusStyle[r.status]}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {r.status === "controlled" ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                  <h3 className="text-sm font-bold text-[var(--color-text)] capitalize">{r.category}</h3>
                </div>
                <span className="text-sm font-bold tabular-nums">
                  {r.pct === null ? "new" : `${r.pct >= 0 ? "+" : ""}${r.pct}%`}
                </span>
              </div>
              <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                Spent <span className="text-[var(--color-text)] font-medium">{formatCurrency(r.current)}</span> this month vs a 3-month average of {formatCurrency(r.baseline)}.
                {r.status === "overrun" ? " Running well above trend — review the drivers." : r.status === "watch" ? " Drifting up — keep an eye on it." : " Within trend — well controlled."}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        Baseline is the trailing three full months' average per category. Grade weights the count of categories overrunning by more than 20%.
      </div>
    </div>
  );
}

// #163 ── LOAN & COVENANT BRIEF ──────────────────────────────────────────────────
// A per-loan brief with the headline covenant most lenders track — debt-service
// coverage — plus repayment progress and the next payment due, from the live store.
function CovenantBrief() {
  const { store } = useApp();
  const { activeLoans, transactions } = store;

  const data = useMemo(() => {
    const cur = monthBounds(0);
    const revenue = flowsIn(transactions, cur.start, cur.end).inflow;
    const totalDebt = activeLoans.reduce((s, l) => s + l.outstanding, 0);
    const totalEmi = activeLoans.reduce((s, l) => s + l.monthlyEmi, 0);
    const portfolioDscr = totalEmi > 0 ? revenue / totalEmi : null;

    const loans = activeLoans.map(l => {
      const repaid = l.principal > 0 ? Math.round(((l.principal - l.outstanding) / l.principal) * 100) : 0;
      // Per-loan DSCR allocates revenue by this loan's share of total EMI.
      const dscr = l.monthlyEmi > 0 ? revenue / l.monthlyEmi : null;
      const breach = dscr !== null && dscr < 1.25;
      return { ...l, repaid: Math.max(0, Math.min(100, repaid)), dscr, breach };
    }).sort((a, b) => b.outstanding - a.outstanding);

    return { revenue, totalDebt, totalEmi, portfolioDscr, loans, label: cur.label };
  }, [activeLoans, transactions]);

  const copy = () => {
    const txt = `Loan & Covenant Brief — ${data.label}\n\nPortfolio DSCR: ${data.portfolioDscr === null ? "n/a" : `${data.portfolioDscr.toFixed(2)}×`}\nTotal outstanding: ${formatAmount(data.totalDebt)}\nTotal EMI: ${formatAmount(data.totalEmi)}/mo\n\n${data.loans.map(l => `${l.lender}: ${formatAmount(l.outstanding)} outstanding, ${l.repaid}% repaid, DSCR ${l.dscr === null ? "n/a" : `${l.dscr.toFixed(2)}×`}${l.breach ? " [COVENANT WATCH]" : ""}`).join("\n")}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Covenant brief copied"), () => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Banknote size={18} className="text-[var(--color-primary)]" /> Loan & Covenant Brief</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Repayment progress and debt-service coverage per loan — the covenant lenders actually watch</p>
        </div>
        {data.loans.length > 0 && (
          <button onClick={copy} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
            <Copy size={12} /> Copy brief
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Portfolio DSCR", value: data.portfolioDscr === null ? "—" : `${data.portfolioDscr.toFixed(2)}×`, color: data.portfolioDscr === null ? "text-[var(--color-text)]" : data.portfolioDscr >= 2 ? "text-green-400" : data.portfolioDscr >= 1.25 ? "text-yellow-400" : "text-red-400" },
          { label: "Total outstanding", value: formatAmount(data.totalDebt), color: "text-[var(--color-text)]" },
          { label: "Total EMI / month", value: formatAmount(data.totalEmi), color: "text-orange-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {data.loans.length === 0 ? (
        <div className="border border-green-800/30 bg-green-950/10 rounded-xl p-10 text-center">
          <CheckCircle2 size={28} className="mx-auto mb-3 text-green-400" />
          <p className="text-sm font-semibold text-green-400 mb-1">No active loans</p>
          <p className="text-xs text-[var(--color-muted)]">You are debt-free — no covenants to monitor this period.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.loans.map(l => (
            <div key={l.id} className={`border rounded-xl p-5 ${l.breach ? "border-red-800/40 bg-red-950/20" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-[var(--color-text)]">{l.lender}</h3>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${l.breach ? "border-red-400 text-red-400" : "border-green-700/50 text-green-400"}`}>
                  {l.breach ? "Covenant watch" : "Covenant OK"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-xs">
                <div><p className="text-[10px] text-[var(--color-muted)]">Outstanding</p><p className="tabular-nums font-semibold">{formatCurrency(l.outstanding)}</p></div>
                <div><p className="text-[10px] text-[var(--color-muted)]">EMI</p><p className="tabular-nums font-semibold">{formatCurrency(l.monthlyEmi)}</p></div>
                <div><p className="text-[10px] text-[var(--color-muted)]">DSCR</p><p className={`tabular-nums font-semibold ${l.dscr === null ? "" : l.dscr >= 2 ? "text-green-400" : l.dscr >= 1.25 ? "text-yellow-400" : "text-red-400"}`}>{l.dscr === null ? "n/a" : `${l.dscr.toFixed(2)}×`}</p></div>
                <div><p className="text-[10px] text-[var(--color-muted)]">Next payment</p><p className="tabular-nums font-semibold">{format(new Date(l.nextPaymentDate), "d MMM")}</p></div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)] mb-1">
                <span>Repayment progress</span><span className="tabular-nums">{l.repaid}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
                <div className="h-full bg-[var(--color-primary)]" style={{ width: `${l.repaid}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        DSCR uses this month's revenue against the EMI commitment. "Covenant watch" flags coverage below 1.25× — a common minimum lenders require.
      </div>
    </div>
  );
}

// #164 ── WHAT CHANGED THIS WEEK ─────────────────────────────────────────────────
// A snapshot diff: it captures the key headline metrics on demand, stores them
// durably, and on the next capture shows exactly what moved since last time.
function WhatChangedThisWeek() {
  const { store } = useApp();
  const { transactions, bankAccounts, activeLoans, invoices } = store;

  interface Snapshot { takenAt: string; balance: number; runway: number; revenueMtd: number; netMtd: number; openAr: number; overdueAr: number; totalDebt: number }

  const current = useMemo<Snapshot>(() => {
    const cur = monthBounds(0);
    const c = flowsIn(transactions, cur.start, cur.end);
    const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
    const burn = monthlyBurn(transactions);
    return {
      takenAt: new Date().toISOString(),
      balance,
      runway: runwayDays(bankAccounts.map(b => b.balance), burn),
      revenueMtd: c.inflow,
      netMtd: c.net,
      openAr: invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0),
      overdueAr: invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0),
      totalDebt: activeLoans.reduce((s, l) => s + l.outstanding, 0),
    };
  }, [transactions, bankAccounts, activeLoans, invoices]);

  const [baseline, setBaseline] = useFeatureState<Snapshot | null>("cfo-whatchanged-baseline", null);

  const capture = () => {
    setBaseline(current);
    toast.success("Snapshot captured — changes will show against this baseline");
  };

  const diffs = useMemo(() => {
    if (!baseline) return [];
    type Diff = { label: string; from: number; to: number; isCurrency: boolean; goodUp: boolean };
    const mk = (label: string, from: number, to: number, isCurrency: boolean, goodUp: boolean): Diff => ({ label, from, to, isCurrency, goodUp });
    return [
      mk("Cash balance", baseline.balance, current.balance, true, true),
      mk("Runway (days)", baseline.runway, current.runway, false, true),
      mk("Revenue MTD", baseline.revenueMtd, current.revenueMtd, true, true),
      mk("Net cash flow MTD", baseline.netMtd, current.netMtd, true, true),
      mk("Open receivables", baseline.openAr, current.openAr, true, false),
      mk("Overdue receivables", baseline.overdueAr, current.overdueAr, true, false),
      mk("Debt outstanding", baseline.totalDebt, current.totalDebt, true, false),
    ].filter(d => d.from !== d.to);
  }, [baseline, current]);

  const fmt = (v: number, isCurrency: boolean) => isCurrency ? formatAmount(v) : `${v}d`;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><GitCompareArrows size={18} className="text-[var(--color-primary)]" /> What Changed This Week</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {baseline ? `Movement since your last snapshot — ${format(new Date(baseline.takenAt), "d MMM, h:mma")}` : "Capture a baseline, then return next week to see exactly what moved"}
          </p>
        </div>
        <button onClick={capture} className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
          <GitCompareArrows size={13} /> {baseline ? "Re-baseline now" : "Capture snapshot"}
        </button>
      </div>

      {!baseline ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-12 text-center">
          <GitCompareArrows size={28} className="mx-auto mb-3 text-[var(--color-primary)] opacity-50" />
          <p className="text-sm font-semibold mb-1">No baseline captured yet</p>
          <p className="text-sm text-[var(--color-muted)] max-w-sm mx-auto">Capture today's headline metrics. Next time you open this, it will show the delta on cash, runway, revenue, receivables and debt.</p>
        </div>
      ) : diffs.length === 0 ? (
        <div className="border border-[var(--color-border)] bg-[var(--color-surface)] rounded-xl p-10 text-center">
          <CheckCircle2 size={28} className="mx-auto mb-3 text-[var(--color-muted)]" />
          <p className="text-sm font-semibold mb-1">Nothing has changed</p>
          <p className="text-xs text-[var(--color-muted)]">Every tracked metric matches your last snapshot.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {diffs.map(d => {
            const delta = d.to - d.from;
            const improved = d.goodUp ? delta > 0 : delta < 0;
            return (
              <div key={d.label} className={`border rounded-xl p-5 ${improved ? "border-green-800/30 bg-green-950/10" : "border-orange-800/30 bg-orange-950/10"}`}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-[var(--color-text)]">{d.label}</h3>
                  <span className={`text-sm font-bold tabular-nums flex items-center gap-1 ${improved ? "text-green-400" : "text-orange-400"}`}>
                    {improved ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{delta >= 0 ? "+" : "−"}{fmt(Math.abs(delta), d.isCurrency)}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-muted)] tabular-nums">{fmt(d.from, d.isCurrency)} <ChevronRight size={11} className="inline" /> {fmt(d.to, d.isCurrency)}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        Compares your current headline metrics against the last snapshot you captured. Re-baseline whenever you want a fresh starting point.
      </div>
    </div>
  );
}

// #181 ── LIQUIDITY POSITION BRIEF ───────────────────────────────────────────────
// Tests whether available cash covers near-term commitments: it nets total bank
// balance against EMIs and dated obligations falling due in the next 30/60/90 days
// to surface any liquidity shortfall before it bites.
function LiquidityPositionBrief() {
  const { store } = useApp();
  const { bankAccounts, activeLoans, obligations } = store;

  const data = useMemo(() => {
    const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
    const today = new Date();
    const horizonDue = (days: number) => {
      const cutoff = format(subMonths(today, -Math.ceil(days / 30)), "yyyy-MM-dd");
      const obl = obligations.filter(o => o.dueDate >= format(today, "yyyy-MM-dd") && o.dueDate <= cutoff).reduce((s, o) => s + o.amount, 0);
      const emiMonths = Math.ceil(days / 30);
      const emi = activeLoans.reduce((s, l) => s + l.monthlyEmi, 0) * emiMonths;
      return obl + emi;
    };
    const buckets = [30, 60, 90].map(days => {
      const due = horizonDue(days);
      const cover = due > 0 ? balance / due : Infinity;
      return { days, due, cover, ok: balance >= due };
    });
    return { balance, buckets };
  }, [bankAccounts, activeLoans, obligations]);

  const copy = () => {
    const txt = `Liquidity Position — cash ${formatAmount(data.balance)}\n\n${data.buckets.map(b => `Next ${b.days} days: due ${formatAmount(b.due)} — ${b.ok ? "covered" : "SHORTFALL " + formatAmount(b.due - data.balance)}`).join("\n")}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Liquidity brief copied"), () => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Droplets size={18} className="text-[var(--color-primary)]" /> Liquidity Position Brief</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Can today's cash of {formatAmount(data.balance)} cover EMIs and dated obligations as they fall due?</p>
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
          <Copy size={12} /> Copy brief
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {data.buckets.map(b => (
          <div key={b.days} className={`border rounded-xl p-5 ${b.ok ? "border-green-800/30 bg-green-950/10" : "border-red-800/40 bg-red-950/20"}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--color-muted)]">Next {b.days} days</p>
              {b.ok ? <CheckCircle2 size={14} className="text-green-400" /> : <AlertTriangle size={14} className="text-red-400" />}
            </div>
            <p className="text-2xl font-bold tabular-nums mb-1">{formatCurrency(b.due)}</p>
            <p className={`text-xs font-medium ${b.ok ? "text-green-400" : "text-red-400"}`}>
              {b.ok
                ? `Covered ${Number.isFinite(b.cover) ? `(${b.cover.toFixed(1)}× cash)` : "(no commitments)"}`
                : `Shortfall of ${formatAmount(b.due - data.balance)}`}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        Nets your total bank balance against scheduled EMIs and dated obligations in each window. Inflows from receivables are excluded — this is a worst-case liquidity test.
      </div>
    </div>
  );
}

// #182 ── GROWTH vs BURN BRIEF ───────────────────────────────────────────────────
// The "burn multiple" view: how much cash is consumed for each rupee of net-new
// revenue. Compares this month's revenue growth against net cash burned so the
// owner can see whether growth is efficient or bought expensively.
function GrowthVsBurnBrief() {
  const { store } = useApp();
  const { transactions } = store;

  const data = useMemo(() => {
    const cur = monthBounds(0), prev = monthBounds(1);
    const c = flowsIn(transactions, cur.start, cur.end);
    const p = flowsIn(transactions, prev.start, prev.end);
    const netNewRev = c.inflow - p.inflow;
    const burned = c.net < 0 ? Math.abs(c.net) : 0;
    const multiple = netNewRev > 0 ? burned / netNewRev : null;
    const verdict = c.net >= 0 ? "self-funding" : multiple === null ? "burning-no-growth" : multiple < 1 ? "efficient" : multiple < 2 ? "acceptable" : "expensive";
    return { cur, prev, c, p, netNewRev, burned, multiple, verdict, revPct: pctChange(c.inflow, p.inflow) };
  }, [transactions]);

  const VERDICT: Record<string, { label: string; cls: string }> = {
    "self-funding": { label: "Self-funding — net cash positive", cls: "border-green-800/30 bg-green-950/10 text-green-400" },
    "efficient": { label: "Efficient growth (<1× burn multiple)", cls: "border-green-800/30 bg-green-950/10 text-green-400" },
    "acceptable": { label: "Acceptable growth (1–2× burn multiple)", cls: "border-yellow-800/30 bg-yellow-950/10 text-yellow-400" },
    "expensive": { label: "Expensive growth (>2× burn multiple)", cls: "border-orange-800/40 bg-orange-950/20 text-orange-400" },
    "burning-no-growth": { label: "Burning cash without revenue growth", cls: "border-red-800/40 bg-red-950/20 text-red-400" },
  };
  const v = VERDICT[data.verdict];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Rocket size={18} className="text-[var(--color-primary)]" /> Growth vs Burn Brief</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">How much cash you burn for each rupee of net-new revenue — {data.prev.label} vs {data.cur.label}</p>
      </div>

      <div className={`border rounded-xl p-5 ${v.cls}`}>
        <div className="flex items-center gap-2 mb-1">
          {data.c.net >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <h3 className="text-sm font-bold text-[var(--color-text)]">{v.label}</h3>
        </div>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">
          Revenue moved {data.netNewRev >= 0 ? "+" : ""}{formatAmount(data.netNewRev)} MoM ({data.revPct === null ? "n/a" : `${data.revPct >= 0 ? "+" : ""}${data.revPct}%`}) while net cash flow was {formatAmount(data.c.net)}.
          {data.multiple !== null && <> That is a burn multiple of <span className="text-[var(--color-text)] font-bold">{data.multiple.toFixed(2)}×</span> — {formatAmount(data.burned)} burned per {formatAmount(data.netNewRev)} of new revenue.</>}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Net-new revenue", value: `${data.netNewRev >= 0 ? "+" : ""}${formatAmount(data.netNewRev)}`, color: data.netNewRev >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Net cash flow", value: formatAmount(data.c.net), color: data.c.net >= 0 ? "text-green-400" : "text-orange-400" },
          { label: "Cash burned", value: formatAmount(data.burned), color: data.burned > 0 ? "text-orange-400" : "text-green-400" },
          { label: "Burn multiple", value: data.multiple === null ? "—" : `${data.multiple.toFixed(2)}×`, color: data.multiple !== null && data.multiple < 1 ? "text-green-400" : data.multiple !== null && data.multiple < 2 ? "text-yellow-400" : "text-orange-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        Burn multiple = cash burned this month ÷ net-new revenue vs last month. Below 1× is best-in-class; above 2× means growth is costing you heavily. Self-funding months have no multiple.
      </div>
    </div>
  );
}

// #183 ── TOP CUSTOMERS & VENDORS BRIEF ──────────────────────────────────────────
// Side-by-side ranking of the counterparties that brought in the most cash and
// took the most out this month, each as a share of its side — the relationships
// that matter most to protect (customers) or renegotiate (vendors).
function TopAccountsBrief() {
  const { store } = useApp();
  const { transactions } = store;

  const data = useMemo(() => {
    const cur = monthBounds(0);
    const win = transactions.filter(t => t.date >= cur.start && t.date <= cur.end && t.counterparty);
    const rank = (positive: boolean) => {
      const map: Record<string, number> = {};
      win.filter(t => positive ? t.amount > 0 : t.amount < 0).forEach(t => { map[t.counterparty] = (map[t.counterparty] || 0) + Math.abs(t.amount); });
      const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((s, [, v]) => s + v, 0);
      return { rows: rows.slice(0, 5), total };
    };
    return { customers: rank(true), vendors: rank(false), label: cur.label };
  }, [transactions]);

  const copy = () => {
    const side = (title: string, d: { rows: [string, number][]; total: number }) =>
      `${title}\n${d.rows.length ? d.rows.map(([n, v]) => `  ${n}: ${formatAmount(v)} (${d.total > 0 ? Math.round((v / d.total) * 100) : 0}%)`).join("\n") : "  none"}`;
    const txt = `Top Accounts — ${data.label}\n\n${side("Customers (inflow)", data.customers)}\n\n${side("Vendors (outflow)", data.vendors)}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Brief copied"), () => toast.error("Copy failed"));
  };

  const Side = ({ title, d, positive }: { title: string; d: { rows: [string, number][]; total: number }; positive: boolean }) => (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
        {positive ? <TrendingUp size={14} className="text-green-400" /> : <TrendingDown size={14} className="text-orange-400" />}{title}
        <span className="ml-auto text-xs text-[var(--color-muted)] tabular-nums">{formatAmount(d.total)}</span>
      </h3>
      {d.rows.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No activity this month.</p> : (
        <div className="space-y-2.5">
          {d.rows.map(([name, v], i) => {
            const pct = d.total > 0 ? Math.round((v / d.total) * 100) : 0;
            return (
              <div key={name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="truncate"><span className="text-[var(--color-muted)] tabular-nums mr-1.5">{i + 1}.</span>{name}</span>
                  <span className="tabular-nums font-medium shrink-0 ml-2">{formatCurrency(v)} <span className="text-[var(--color-muted)]">({pct}%)</span></span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
                  <div className={`h-full ${positive ? "bg-green-400" : "bg-orange-400"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Users size={18} className="text-[var(--color-primary)]" /> Top Customers &amp; Vendors</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">The counterparties driving the most cash in and out this {data.label} — who to protect and who to renegotiate</p>
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
          <Copy size={12} /> Copy brief
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Side title="Top customers (inflow)" d={data.customers} positive />
        <Side title="Top vendors (outflow)" d={data.vendors} positive={false} />
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        Ranked from this month's transactions by counterparty. A high share on the customer side flags concentration risk; on the vendor side it flags negotiating leverage.
      </div>
    </div>
  );
}

// #184 ── WORKING CAPITAL BRIEF ──────────────────────────────────────────────────
// A snapshot of net working capital from live data: receivables (with the overdue
// slice) against near-term payables (this-month obligations + one EMI cycle), plus
// a simple AR-days read so the owner sees how much cash is tied up in the cycle.
function WorkingCapitalBrief() {
  const { store } = useApp();
  const { invoices, obligations, activeLoans, transactions } = store;

  const data = useMemo(() => {
    const openAr = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
    const overdueAr = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
    const cur = monthBounds(0);
    const oblDue = obligations.filter(o => o.dueDate >= cur.start && o.dueDate <= cur.end).reduce((s, o) => s + o.amount, 0);
    const emi = activeLoans.reduce((s, l) => s + l.monthlyEmi, 0);
    const payables = oblDue + emi;
    const netWc = openAr - payables;
    // AR days: open receivables relative to recent daily revenue (last full month inflow).
    const prevRev = flowsIn(transactions, monthBounds(1).start, monthBounds(1).end).inflow;
    const arDays = prevRev > 0 ? Math.round(openAr / (prevRev / 30)) : null;
    return { openAr, overdueAr, payables, netWc, arDays, oblDue, emi };
  }, [invoices, obligations, activeLoans, transactions]);

  const copy = () => {
    const txt = `Working Capital Brief\n\nOpen receivables: ${formatAmount(data.openAr)} (overdue ${formatAmount(data.overdueAr)})\nNear-term payables: ${formatAmount(data.payables)}\nNet working capital: ${formatAmount(data.netWc)}\nAR days: ${data.arDays === null ? "n/a" : data.arDays + " days"}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Working-capital brief copied"), () => toast.error("Copy failed"));
  };

  const stats = [
    { label: "Open receivables", value: formatAmount(data.openAr), color: "text-green-400", hint: `${formatAmount(data.overdueAr)} overdue` },
    { label: "Near-term payables", value: formatAmount(data.payables), color: "text-orange-400", hint: `${formatAmount(data.oblDue)} dues + ${formatAmount(data.emi)} EMI` },
    { label: "Net working capital", value: formatAmount(data.netWc), color: data.netWc >= 0 ? "text-green-400" : "text-red-400", hint: data.netWc >= 0 ? "receivables cover payables" : "payables exceed receivables" },
    { label: "AR days", value: data.arDays === null ? "—" : `${data.arDays}d`, color: data.arDays !== null && data.arDays > 60 ? "text-orange-400" : "text-[var(--color-text)]", hint: "cash tied up in collections" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Coins size={18} className="text-[var(--color-primary)]" /> Working Capital Brief</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Receivables vs near-term payables — how much cash is locked in your operating cycle right now</p>
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
          <Copy size={12} /> Copy brief
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums mb-0.5 ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)]">{s.hint}</p>
          </div>
        ))}
      </div>

      <div className={`border rounded-xl p-5 ${data.netWc >= 0 ? "border-green-800/30 bg-green-950/10" : "border-orange-800/40 bg-orange-950/20"}`}>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">
          {data.netWc >= 0
            ? <>Your open receivables of <span className="text-[var(--color-text)] font-medium">{formatAmount(data.openAr)}</span> more than cover near-term payables of {formatAmount(data.payables)}, leaving {formatAmount(data.netWc)} of positive working-capital headroom.</>
            : <>Near-term payables of <span className="text-[var(--color-text)] font-medium">{formatAmount(data.payables)}</span> exceed open receivables of {formatAmount(data.openAr)} by {formatAmount(Math.abs(data.netWc))} — prioritise collections{data.overdueAr > 0 ? `, starting with the ${formatAmount(data.overdueAr)} already overdue` : ""}.</>}
        </p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
        Net working capital = open receivables − (this-month obligations + one EMI cycle). AR days estimates how long cash stays locked in receivables relative to last month's revenue.
      </div>
    </div>
  );
}
