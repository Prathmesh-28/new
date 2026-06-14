import { useState, useMemo, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount, monthlyBurn, runwayDays } from "@/lib/utils";
import { Sparkles, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, CheckCircle2, Clock, ChevronRight, Download, FileText, Presentation, ShieldAlert, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { subMonths, format, startOfMonth, endOfMonth } from "date-fns";

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

type CfoView = "ai-brief" | "variance" | "board-deck" | "watchlist";

export default function CfoBriefPage() {
  const [view, setView] = useState<CfoView>("ai-brief");

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
        {([["ai-brief", "AI Brief", Sparkles], ["variance", "Variance Commentary", FileText], ["board-deck", "Board-Deck Generator", Presentation], ["watchlist", "Risk & Watchlist", ShieldAlert]] as const).map(([id, label, Icon]) => (
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
    </div>
  );
}

function AiBriefView() {
  const { store } = useApp();
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
          {brief && (
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
  const { store } = useApp();
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
          <button onClick={exportDeck} disabled={!activeSlides.length} className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
            <Download size={13} /> Export Deck
          </button>
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
    const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
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
