import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import {
  ShieldCheck, AlertTriangle, Calendar, CheckCircle2, ChevronRight,
  TrendingUp, FileText, Plus, ArrowRight, Calculator,
} from "lucide-react";
import { toast } from "sonner";
import { addDays, format, differenceInCalendarDays, startOfYear } from "date-fns";

interface TaxDeadline {
  label: string;
  desc: string;
  date: Date;
  type: "advance_tax" | "gstr3b" | "tds" | "itr";
  installment?: string;
  pct?: number;
}

function computeTaxCalendar(today: Date): TaxDeadline[] {
  const year = today.getFullYear();
  const deadlines: TaxDeadline[] = [];

  // Advance tax: Jun 15 (15%), Sep 15 (45%), Dec 15 (75%), Mar 15 (100%)
  const advanceTax = [
    { month: 5,  day: 15, pct: 15, installment: "1st" },
    { month: 8,  day: 15, pct: 45, installment: "2nd" },
    { month: 11, day: 15, pct: 75, installment: "3rd" },
    { month: 2,  day: 15, pct: 100, installment: "Final", year: year + 1 },
  ];
  advanceTax.forEach(({ month, day, pct, installment, year: y }) => {
    const d = new Date(y ?? year, month, day);
    deadlines.push({ label: "Advance Tax", desc: `${installment} instalment — ${pct}% of annual liability`, date: d, type: "advance_tax", installment, pct });
  });

  // GSTR-3B: 20th of each month for next 4 months
  for (let i = 0; i < 4; i++) {
    const base = new Date(today.getFullYear(), today.getMonth() + i, 20);
    if (base > today) {
      deadlines.push({ label: "GSTR-3B", desc: `Monthly GST return — ${format(base, "MMMM yyyy")}`, date: base, type: "gstr3b" });
    }
  }

  // TDS deposit: 7th of each month
  for (let i = 0; i < 3; i++) {
    const base = new Date(today.getFullYear(), today.getMonth() + i, 7);
    if (base > today) {
      deadlines.push({ label: "TDS Deposit", desc: `Tax deducted at source — ${format(base, "MMMM yyyy")}`, date: base, type: "tds" });
    }
  }

  // ITR filing: Jul 31 (current year's FY filing)
  const itr = new Date(year, 6, 31);
  if (itr >= today) deadlines.push({ label: "ITR Filing", desc: `Income Tax Return — FY ${year - 1}-${String(year).slice(2)}`, date: itr, type: "itr" });

  return deadlines.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 10);
}

export default function TaxPage() {
  const { store, addObligation } = useApp();
  const { transactions, firm } = store;
  const navigate = useNavigate();
  const today = new Date();
  const [pushed, setPushed] = useState<Set<string>>(new Set());
  const [taxTab, setTaxTab] = useState<"overview" | "44ad" | "cg" | "audit">("overview");
  const [aaScheme,   setAaScheme]   = useState<"44ad" | "44ada">("44ad");
  const [aaTurnover, setAaTurnover] = useState("");
  const [aaDigital,  setAaDigital]  = useState(false);
  // Capital Gains state
  const [cgAsset,      setCgAsset]      = useState<"equity" | "debt" | "property">("equity");
  const [cgBuy,        setCgBuy]        = useState("");
  const [cgSell,       setCgSell]       = useState("");
  const [cgHoldMonths, setCgHoldMonths] = useState("");

  const deadlines = useMemo(() => computeTaxCalendar(today), []);

  // Compute YTD financials
  const ytdStart  = startOfYear(today).toISOString().split("T")[0];
  const ytdRevenue = transactions.filter(t => t.amount > 0  && t.date >= ytdStart).reduce((s, t) => s + t.amount, 0);
  const ytdExpenses = transactions.filter(t => t.amount < 0 && t.date >= ytdStart).reduce((s, t) => s + Math.abs(t.amount), 0);
  const ytdProfit  = ytdRevenue - ytdExpenses;

  // Advance tax estimate (25% effective rate on net profit)
  const effectiveRate    = 0.25;
  const annualTaxEst     = ytdProfit > 0 ? Math.round(ytdProfit * effectiveRate) : 0;
  const installmentDue: Record<string, number> = {
    "1st":   Math.round(annualTaxEst * 0.15),
    "2nd":   Math.round(annualTaxEst * 0.45),
    "3rd":   Math.round(annualTaxEst * 0.75),
    "Final": annualTaxEst,
  };

  // TDS estimate: 2% on deductable payments this month
  const thisM   = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const tdsBase = transactions.filter(t => t.amount < 0 && t.date.startsWith(thisM) && t.category === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
  const tdsEst  = Math.round(tdsBase * 0.02);

  // GST liability
  const gstRate = firm?.gstRate ?? 18;
  const lastM   = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMStr = `${lastM.getFullYear()}-${String(lastM.getMonth() + 1).padStart(2, "0")}`;
  const lastMRevenue = transactions.filter(t => t.amount > 0 && t.date.startsWith(lastMStr)).reduce((s, t) => s + t.amount, 0);
  const gstLiability = firm?.gstRegistered && lastMRevenue > 0 ? Math.round(lastMRevenue * (gstRate / 100)) : 0;

  const TYPE_COLOR: Record<string, string> = {
    advance_tax: "text-orange-400 bg-orange-950/30 border-orange-800/30",
    gstr3b:      "text-blue-400 bg-blue-950/30 border-blue-800/30",
    tds:         "text-purple-400 bg-purple-950/30 border-purple-800/30",
    itr:         "text-green-400 bg-green-950/30 border-green-800/30",
  };
  const TYPE_LABEL: Record<string, string> = {
    advance_tax: "Advance Tax",
    gstr3b:      "GST",
    tds:         "TDS",
    itr:         "ITR",
  };

  const pushToForecast = (d: TaxDeadline, amount: number) => {
    if (amount <= 0) { toast.error("No liability estimated yet — add transactions first"); return; }
    addObligation({ id: crypto.randomUUID(), name: `${d.label} — ${d.installment ?? format(d.date, "MMM")}`, amount, dueDate: d.date.toISOString().split("T")[0], type: "tax" });
    setPushed(s => new Set([...s, d.label + d.date.toISOString()]));
    toast.success(`${d.label} added to Forecast as a cash obligation`);
    navigate("/forecast");
  };

  const nextDeadline = deadlines.find(d => d.date >= today);
  const nextDays     = nextDeadline ? differenceInCalendarDays(nextDeadline.date, today) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck size={18} className="text-[var(--color-primary)]" /> Tax Autopilot
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Advance tax · GST · TDS · ITR — computed from your live P&L</p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {([["overview", "Overview", ShieldCheck], ["44ad", "Presumptive (44AD)", Calculator], ["cg", "Capital Gains", TrendingUp], ["audit", "Tax Audit (44AB)", AlertTriangle]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTaxTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${taxTab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {taxTab === "44ad" && (() => {
        const turnover = parseFloat(aaTurnover) || 0;
        const presumptivePct = aaScheme === "44ad" ? (aaDigital ? 6 : 8) : 50;
        const presumptiveIncome = Math.round(turnover * presumptivePct / 100);
        const stdDeduction = 75000;
        const netTaxable = Math.max(0, presumptiveIncome - stdDeduction);
        const slabs: [number, number, number][] = [
          [0, 300000, 0], [300000, 700000, 0.05], [700000, 1000000, 0.10],
          [1000000, 1200000, 0.15], [1200000, 1500000, 0.20], [1500000, Infinity, 0.30],
        ];
        let slabTax = 0;
        let rem = netTaxable;
        for (const [lo, hi, r] of slabs) { if (rem <= 0) break; const t = Math.min(rem, hi - lo); slabTax += t * r; rem -= t; }
        const cess = Math.round(slabTax * 0.04);
        const totalTax = Math.round(slabTax + cess);
        const limit44AD  = 30000000; // ₹3 crore (digital only above ₹2 crore)
        const limit44ADA = 7500000;  // ₹75 lakh
        const eligible = aaScheme === "44ad"
          ? turnover <= limit44AD
          : turnover <= limit44ADA;

        return (
          <div className="space-y-4 max-w-xl">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> Presumptive Tax Estimator</h2>
              <p className="text-xs text-[var(--color-muted)] mb-4">Section 44AD (businesses) and 44ADA (professionals) let eligible assessees declare income as a % of turnover — no books required.</p>

              <div className="space-y-3">
                <div className="flex gap-2">
                  {(["44ad", "44ada"] as const).map(s => (
                    <button key={s} onClick={() => setAaScheme(s)}
                      className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-all ${aaScheme === s ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                      {s === "44ad" ? "Sec 44AD — Business" : "Sec 44ADA — Profession"}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-muted)] mb-1">
                    {aaScheme === "44ad" ? "Annual Turnover (₹)" : "Gross Receipts (₹)"}
                    <span className="ml-2 text-[10px]">Limit: {aaScheme === "44ad" ? "₹3 cr" : "₹75 lakh"}</span>
                  </label>
                  <input
                    type="number" min={0}
                    value={aaTurnover}
                    onChange={e => setAaTurnover(e.target.value)}
                    placeholder={aaScheme === "44ad" ? "e.g. 5000000" : "e.g. 3000000"}
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                {aaScheme === "44ad" && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={aaDigital} onChange={e => setAaDigital(e.target.checked)} className="accent-[var(--color-primary)]" />
                    <span>All receipts via digital mode (qualifies for 6% rate instead of 8%)</span>
                  </label>
                )}
              </div>
            </div>

            {turnover > 0 && (
              <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${!eligible ? "border-red-700/40" : "border-[var(--color-border)]"}`}>
                {!eligible && (
                  <div className="flex items-center gap-2 mb-3 p-2.5 bg-red-950/20 border border-red-800/30 rounded-lg">
                    <AlertTriangle size={12} className="text-red-400 shrink-0" />
                    <p className="text-xs text-red-300">Turnover exceeds the {aaScheme === "44ad" ? "₹3 crore" : "₹75 lakh"} limit — presumptive scheme not available. Tax audit (44AB) mandatory.</p>
                  </div>
                )}
                <h3 className="text-sm font-semibold mb-3">Tax Computation</h3>
                <div className="space-y-2">
                  {[
                    { label: `Presumptive Income (${presumptivePct}% of turnover)`, value: formatCurrency(presumptiveIncome), color: "text-[var(--color-text)]" },
                    { label: "Less: Standard Deduction", value: `(${formatCurrency(Math.min(stdDeduction, presumptiveIncome))})`, color: "text-green-400" },
                    { label: "Net Taxable Income", value: formatCurrency(netTaxable), color: "text-[var(--color-text)] font-semibold" },
                    { label: "Income Tax (new regime slabs)", value: formatCurrency(Math.round(slabTax)), color: "text-orange-400" },
                    { label: "Health & Education Cess (4%)", value: formatCurrency(cess), color: "text-orange-400" },
                    { label: "Total Tax Payable", value: formatCurrency(totalTax), color: "text-red-400 font-bold" },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                      <span className="text-xs text-[var(--color-muted)]">{row.label}</span>
                      <span className={`tabular-nums text-sm ${row.color}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
                {totalTax > 0 && (
                  <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
                    <p className="text-xs text-[var(--color-muted)]">Advance tax instalments (if tax &gt; ₹10,000/year):</p>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {[["1st Jun", Math.round(totalTax * 0.15)], ["2nd Sep", Math.round(totalTax * 0.45)], ["3rd Dec", Math.round(totalTax * 0.75)], ["Final Mar", totalTax]].map(([label, amt]) => (
                        <div key={label as string} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5 text-center">
                          <p className="text-[10px] text-[var(--color-muted)]">{label as string}</p>
                          <p className="text-xs font-bold tabular-nums text-orange-400 mt-0.5">{formatCurrency(amt as number)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
              <AlertTriangle size={12} className="shrink-0 mt-px" />
              44AD: businesses with turnover ≤₹3 crore (digital-only receipts). 44ADA: specified professions (doctors, lawyers, engineers, CAs, architects) with gross receipts ≤₹75 lakh. Consult your CA before opting in.
            </div>
          </div>
        );
      })()}

      {taxTab === "cg" && (() => {
        const buyPrice  = parseFloat(cgBuy)  || 0;
        const sellPrice = parseFloat(cgSell) || 0;
        const months    = parseInt(cgHoldMonths) || 0;
        const gain      = sellPrice - buyPrice;

        // Determine if LTCG or STCG
        const ltcgThreshold = cgAsset === "equity" ? 12 : cgAsset === "property" ? 24 : 36;
        const isLtcg = months >= ltcgThreshold;

        // Tax rates
        const RATES: Record<string, { stcg: number; ltcg: number; ltcgExempt?: number }> = {
          equity:   { stcg: 20, ltcg: 12.5, ltcgExempt: 125000 }, // post-Budget 2024
          debt:     { stcg: 30, ltcg: 20 },   // debt MF/bonds taxed at slab/20% post-2023
          property: { stcg: 30, ltcg: 12.5 }, // LTCG 12.5% without indexation (Budget 2024)
        };
        const rates = RATES[cgAsset];
        const taxableGain = isLtcg && cgAsset === "equity"
          ? Math.max(0, gain - (rates.ltcgExempt ?? 0))
          : Math.max(0, gain);
        const rate = isLtcg ? rates.ltcg : rates.stcg;
        const tax  = gain > 0 ? Math.round(taxableGain * rate / 100) : 0;
        const cess = Math.round(tax * 0.04);
        const totalTax = tax + cess;

        const ASSET_THRESHOLDS: Record<string, string> = {
          equity:   "12 months (listed equity/equity MF)",
          debt:     "36 months (debt MF/bonds)",
          property: "24 months (land/building)",
        };

        return (
          <div className="space-y-4 max-w-xl">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
                <TrendingUp size={14} className="text-[var(--color-primary)]" /> Capital Gains Tax Calculator
              </h2>
              <p className="text-xs text-[var(--color-muted)] mb-4">Rates as per Finance Act 2024 (Budget July 2024). Equity LTCG: 12.5% above ₹1.25L exemption. Debt: taxed at slab/20%.</p>

              <div className="space-y-3">
                <div className="flex gap-2">
                  {(["equity", "debt", "property"] as const).map(a => (
                    <button key={a} onClick={() => setCgAsset(a)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all capitalize ${cgAsset === a ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                      {a === "equity" ? "Equity / MF" : a === "debt" ? "Debt / Bonds" : "Property"}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--color-muted)]">LTCG threshold: {ASSET_THRESHOLDS[cgAsset]}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--color-muted)] mb-1">Purchase price (₹)</label>
                    <input type="number" min={0} value={cgBuy} onChange={e => setCgBuy(e.target.value)}
                      placeholder="e.g. 500000"
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-muted)] mb-1">Sale price (₹)</label>
                    <input type="number" min={0} value={cgSell} onChange={e => setCgSell(e.target.value)}
                      placeholder="e.g. 800000"
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-muted)] mb-1">Holding period (months)</label>
                  <input type="number" min={0} value={cgHoldMonths} onChange={e => setCgHoldMonths(e.target.value)}
                    placeholder="e.g. 18"
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
                </div>
              </div>
            </div>

            {buyPrice > 0 && sellPrice > 0 && months > 0 && (
              <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${gain < 0 ? "border-green-700/40" : "border-orange-700/40"}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${isLtcg ? "bg-blue-950/30 text-blue-400 border-blue-800/30" : "bg-orange-950/30 text-orange-400 border-orange-800/30"}`}>
                    {isLtcg ? "LTCG" : "STCG"} — {months}mo holding
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">{rate}% rate applies</span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: "Capital Gain / (Loss)", value: formatCurrency(gain), color: gain >= 0 ? "text-orange-400" : "text-green-400" },
                    ...(isLtcg && cgAsset === "equity" && gain > 0 ? [{ label: `LTCG Exemption (₹1.25L)`, value: `(${formatCurrency(Math.min(gain, 125000))})`, color: "text-green-400" }] : []),
                    { label: "Taxable Gain", value: formatCurrency(taxableGain), color: "text-[var(--color-text)]" },
                    { label: `Income Tax @ ${rate}%`, value: formatCurrency(tax), color: "text-orange-400" },
                    { label: "Health & Education Cess (4%)", value: formatCurrency(cess), color: "text-orange-400" },
                    { label: "Total Tax Payable", value: formatCurrency(totalTax), color: "text-red-400 font-bold" },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                      <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                      <span className={`tabular-nums ${r.color}`}>{r.value}</span>
                    </div>
                  ))}
                </div>
                {gain < 0 && (
                  <p className="text-xs text-green-400 mt-3 pt-2 border-t border-[var(--color-border)]">Capital loss of {formatCurrency(Math.abs(gain))} — can be set off against capital gains of the same year (STCL vs LTCL rules apply). Carry forward for 8 years.</p>
                )}
              </div>
            )}

            <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
              <AlertTriangle size={12} className="shrink-0 mt-px" />
              Debt MF gains post-Apr 2023 are taxed at slab rates (no LTCG benefit). Property sold after Jul 2024: LTCG is 12.5% without indexation. Surcharge applies for gains &gt;₹50L. Consult a CA.
            </div>
          </div>
        );
      })()}

      {taxTab === "overview" && <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "YTD Net Profit",
            value: formatCurrency(ytdProfit),
            color: ytdProfit >= 0 ? "text-green-400" : "text-red-400",
            sub: `${format(startOfYear(today), "d MMM")} – today`,
          },
          {
            label: "Annual Tax Estimate",
            value: formatCurrency(annualTaxEst),
            color: "text-orange-400",
            sub: `~${effectiveRate * 100}% effective rate`,
          },
          {
            label: "GST This Month",
            value: gstLiability > 0 ? formatCurrency(gstLiability) : "Not registered",
            color: "text-blue-400",
            sub: `${gstRate}% on last month revenue`,
          },
          {
            label: "Next Deadline",
            value: nextDeadline ? `${nextDays}d` : "—",
            color: nextDays !== null && nextDays <= 10 ? "text-red-400" : nextDays !== null && nextDays <= 30 ? "text-yellow-400" : "text-green-400",
            sub: nextDeadline?.label ?? "All clear",
          },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* YTD P&L bar */}
      {ytdRevenue > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">YTD P&L Snapshot</h2>
          <div className="space-y-2">
            {[
              { label: "Revenue",  value: ytdRevenue,  color: "#22c55e" },
              { label: "Expenses", value: ytdExpenses, color: "#ef4444" },
              { label: "Profit",   value: Math.max(ytdProfit, 0), color: "#3b82f6" },
            ].map(({ label, value, color }) => {
              const pct = ytdRevenue > 0 ? (value / ytdRevenue) * 100 : 0;
              return (
                <div key={label}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-medium">{label}</span>
                    <span className="tabular-nums" style={{ color }}>{formatCurrency(value)}</span>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TDS quick card */}
      {tdsEst > 0 && (
        <div className="bg-purple-950/20 border border-purple-800/30 rounded-lg p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-purple-300">TDS Deposit Due</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Estimated ~{formatCurrency(tdsEst)} (2% on ₹{(tdsBase / 100000).toFixed(1)}L expenses this month)
            </p>
          </div>
          <span className="text-xs font-bold text-purple-400 bg-purple-950/40 border border-purple-800/40 px-2.5 py-1 rounded-lg whitespace-nowrap">
            7th of next month
          </span>
        </div>
      )}

      {/* Deadline timeline */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Calendar size={14} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold">Upcoming Deadlines</h2>
          <span className="ml-auto text-[10px] text-[var(--color-muted)]">Auto-computed · Add to Forecast to track cash impact</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {deadlines.map((d, i) => {
            const days    = differenceInCalendarDays(d.date, today);
            const urgent  = days <= 10;
            const soon    = days <= 30;
            const isPast  = days < 0;
            const key     = d.label + d.date.toISOString();
            const amount  = d.type === "advance_tax" && d.installment
              ? installmentDue[d.installment] ?? 0
              : d.type === "gstr3b"
              ? gstLiability
              : d.type === "tds"
              ? tdsEst
              : 0;
            const alreadyPushed = pushed.has(key);

            return (
              <div key={i} className={`flex items-center gap-4 px-4 py-3.5 ${isPast ? "opacity-40" : ""}`}>
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded border ${TYPE_COLOR[d.type]}`}>
                  {TYPE_LABEL[d.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{d.label}</p>
                  <p className="text-[11px] text-[var(--color-muted)] truncate">{d.desc}</p>
                  {amount > 0 && (
                    <p className="text-[11px] font-semibold text-orange-400 mt-0.5">
                      Estimated: {formatCurrency(amount)}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isPast   ? "bg-[var(--color-accent)] text-[var(--color-muted)]" :
                    urgent   ? "bg-red-950/30 text-red-400" :
                    soon     ? "bg-yellow-950/30 text-yellow-400" :
                               "bg-[var(--color-accent)] text-[var(--color-muted)]"
                  }`}>
                    {isPast ? "Past" : days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `${days}d`}
                  </span>
                  <span className="text-[10px] text-[var(--color-muted)]">{format(d.date, "d MMM yyyy")}</span>
                  {amount > 0 && !isPast && (
                    <button
                      onClick={() => pushToForecast(d, amount)}
                      disabled={alreadyPushed}
                      className="flex items-center gap-1 text-[10px] text-[var(--color-primary)] hover:underline disabled:opacity-40 disabled:no-underline"
                    >
                      {alreadyPushed ? <><CheckCircle2 size={9} /> Added</> : <><Plus size={9} /> Add to Forecast</>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* GST filing CTA */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText size={15} className="text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold">GST Return Filing</p>
            <p className="text-xs text-[var(--color-muted)]">View GSTR-1, GSTR-3B, and reconciliation in the GST module</p>
          </div>
        </div>
        <button onClick={() => navigate("/gst")}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] px-3 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40 whitespace-nowrap">
          Go to GST <ArrowRight size={11} />
        </button>
      </div>

      {ytdProfit <= 0 && (
        <div className="bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-lg p-6 text-center">
          <TrendingUp size={24} className="mx-auto mb-2 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">Import transactions to compute your advance tax obligations</p>
          <button onClick={() => navigate("/transactions")}
            className="mt-3 text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1 mx-auto">
            Add transactions <ChevronRight size={11} />
          </button>
        </div>
      )}
      </>}

      {taxTab === "audit" && (() => {
        const annualRevenue  = store.transactions.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);

        const THRESHOLD_BUSINESS      = 1_00_00_000;  // ₹1 crore
        const THRESHOLD_BUSINESS_DIG  = 10_00_00_000; // ₹10 crore (95%+ digital)
        const THRESHOLD_PROFESSIONAL  = 50_00_000;    // ₹50 lakh

        const [mode, setMode]         = useState<"business" | "professional">("business");
        const [manualTurnover, setManualTurnover] = useState("");
        const [digitalPct, setDigitalPct]         = useState(80);

        const turnover    = parseFloat(manualTurnover) || annualRevenue;
        const threshold   = mode === "professional" ? THRESHOLD_PROFESSIONAL :
                            digitalPct >= 95        ? THRESHOLD_BUSINESS_DIG : THRESHOLD_BUSINESS;
        const auditReqd   = turnover >= threshold;
        const headroom    = Math.max(0, threshold - turnover);
        const pct         = threshold > 0 ? Math.min(100, Math.round((turnover / threshold) * 100)) : 0;

        return (
          <div className="space-y-5 max-w-xl">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-1">Tax Audit Threshold — Sec 44AB</h2>
              <p className="text-xs text-[var(--color-muted)] mb-4">Audit by a CA is mandatory if turnover/receipts cross the threshold. Penalty for non-compliance: 0.5% of turnover (max ₹1.5L).</p>

              <div className="flex gap-2 mb-4">
                {(["business", "professional"] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${mode === m ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                    {m === "business" ? "Business / Trading" : "Professional"}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[var(--color-muted)] mb-1">Annual turnover / gross receipts (₹) — auto-filled from transactions</label>
                  <input type="number" value={manualTurnover} onChange={e => setManualTurnover(e.target.value)}
                    placeholder={`${Math.round(annualRevenue)} (from transactions)`}
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                </div>
                {mode === "business" && (
                  <div>
                    <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1">
                      <span>Digital / banking receipts %</span>
                      <span className="font-semibold text-[var(--color-text)]">{digitalPct}%</span>
                    </label>
                    <input type="range" min={0} max={100} value={digitalPct} onChange={e => setDigitalPct(Number(e.target.value))}
                      className="w-full accent-[var(--color-primary)]" />
                    <p className="text-[10px] text-[var(--color-muted)] mt-0.5">≥95% digital → threshold rises to ₹10 Cr (Finance Act 2020)</p>
                  </div>
                )}
              </div>
            </div>

            <div className={`rounded-lg border p-5 ${auditReqd ? "bg-red-950/30 border-red-800/40" : "bg-green-950/30 border-green-800/40"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className={auditReqd ? "text-red-400" : "text-green-400"} />
                  <p className="font-semibold text-sm">{auditReqd ? "Tax Audit REQUIRED" : "Tax Audit NOT required"}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${auditReqd ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>
                  {auditReqd ? "44AB applies" : "Below threshold"}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-xs text-[var(--color-muted)]">Your turnover</span><span className="tabular-nums font-semibold">{formatCurrency(Math.round(turnover))}</span></div>
                <div className="flex justify-between"><span className="text-xs text-[var(--color-muted)]">Applicable threshold</span><span className="tabular-nums">{formatCurrency(threshold)}</span></div>
                {!auditReqd && <div className="flex justify-between"><span className="text-xs text-[var(--color-muted)]">Headroom remaining</span><span className="tabular-nums text-green-400 font-semibold">{formatCurrency(Math.round(headroom))}</span></div>}
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-[var(--color-muted)] mb-1"><span>0</span><span>{pct}%</span><span>{formatCurrency(threshold)}</span></div>
                <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: auditReqd ? "#ef4444" : pct > 80 ? "#f97316" : "#22c55e" }} />
                </div>
              </div>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <h3 className="text-sm font-semibold mb-3">Quick Reference — 44AB Thresholds</h3>
              <div className="space-y-2.5 text-xs">
                {[
                  { who: "Business (default)",                 limit: "₹1 crore",  note: "Standard threshold for all business entities" },
                  { who: "Business (≥95% digital receipts)",   limit: "₹10 crore", note: "Raised by Finance Act 2020 to promote digital transactions" },
                  { who: "Professionals (doctors, CAs, etc.)", limit: "₹50 lakh",  note: "Gross receipts from professional services" },
                  { who: "Presumptive scheme (44AD/44ADA)",    limit: "N/A",        note: "Audit not required even if above threshold, if opting for presumptive" },
                ].map(r => (
                  <div key={r.who} className="flex items-start gap-3 pb-2.5 border-b border-[var(--color-border)] last:border-0 last:pb-0">
                    <div className="flex-1">
                      <p className="font-medium text-[var(--color-text)]">{r.who}</p>
                      <p className="text-[var(--color-muted)] mt-0.5">{r.note}</p>
                    </div>
                    <span className="font-bold tabular-nums text-[var(--color-primary)] shrink-0">{r.limit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
