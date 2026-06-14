import { useState, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, formatAmount, monthlyBurn, runwayDays } from "@/lib/utils";
import { Sparkles, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, CheckCircle2, Clock, ChevronRight, Download } from "lucide-react";
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

export default function CfoBriefPage() {
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
