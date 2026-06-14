import { useMemo, useState } from "react";
import { useFeatureState } from "@/hooks/useFeatureState";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import {
  ShieldCheck, AlertTriangle, Calendar, CheckCircle2, ChevronRight,
  TrendingUp, FileText, Plus, ArrowRight, Calculator, Scale, Clock,
  Receipt, FileSearch, Search, FileCheck, Layers, Repeat,
  FilePlus2, Globe, PiggyBank, ShoppingCart, CalendarClock, Gavel,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays, startOfYear } from "date-fns";

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
  const [taxTab, setTaxTab] = useState<"overview" | "44ad" | "cg" | "audit" | "tcs" | "mat" | "angel" | "regime" | "advtax"
    | "tds-return" | "form26as" | "tds-finder" | "ldc-197" | "depreciation" | "loss-setoff"
    | "itr-prefill" | "form15ca" | "sec80" | "eq-levy" | "advtax-calendar" | "tax-notice">("overview");
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
          {([["overview", "Overview", ShieldCheck], ["regime", "Regime Optimizer", Scale], ["advtax", "Advance Tax", Clock], ["44ad", "Presumptive (44AD)", Calculator], ["cg", "Capital Gains", TrendingUp], ["audit", "Tax Audit (44AB)", AlertTriangle], ["tcs", "TCS Tracker", FileText], ["mat", "MAT Check", AlertTriangle], ["angel", "Angel Tax", AlertTriangle],
            ["tds-return", "TDS Return (24Q/26Q)", Receipt], ["form26as", "26AS / AIS Recon", FileSearch], ["tds-finder", "TDS Section Finder", Search], ["ldc-197", "Lower-Deduction (197)", FileCheck], ["depreciation", "Depreciation Schedule", Layers], ["loss-setoff", "Loss Set-off & C/F", Repeat], ["itr-prefill", "ITR Pre-Fill Pack", FilePlus2], ["form15ca", "Form 15CA/CB", Globe], ["sec80", "Sec 80 Maximiser", PiggyBank], ["eq-levy", "Equalisation Levy / 194O", ShoppingCart], ["advtax-calendar", "Adv. Tax Calendar", CalendarClock], ["tax-notice", "Notice / Demand 143(1)", Gavel]] as const).map(([id, label, Icon]) => (
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

      {taxTab === "tcs" && (() => {
        type TcsEntry = { id: string; buyer: string; goods: string; saleAmount: number; tcsRate: number; date: string; deposited: boolean };
        const TCS_RATES = [
          { goods: "Scrap (Sec 206C(1))",                rate: 1   },
          { goods: "Timber from forest lease",            rate: 2.5 },
          { goods: "Timber from other sources",           rate: 2.5 },
          { goods: "Tendu leaves",                        rate: 5   },
          { goods: "Forest produce (other)",              rate: 2.5 },
          { goods: "Minerals (coal, lignite, iron ore)",  rate: 1   },
          { goods: "Liquor for human consumption",        rate: 1   },
          { goods: "Motor vehicles >₹10L",                rate: 1   },
          { goods: "Sale of goods >₹50L (Sec 206C(1H))", rate: 0.1 },
        ];

        const [entries, setEntries] = useFeatureState<TcsEntry[]>("tcs-entries", []);
        const [buyer,   setBuyer]   = useState("");
        const [goods,   setGoods]   = useState(TCS_RATES[0].goods);
        const [saleAmt, setSaleAmt] = useState("");
        const [tcsRate, setTcsRate] = useState(TCS_RATES[0].rate);
        const [date,    setDate]    = useState(() => new Date().toISOString().split("T")[0]);

        const addEntry = () => {
          if (!buyer || !saleAmt) return;
          setEntries(prev => [...prev, { id: Math.random().toString(36).slice(2), buyer, goods, saleAmount: parseFloat(saleAmt), tcsRate, date, deposited: false }]);
          setBuyer(""); setSaleAmt("");
        };

        const totalTcs       = entries.reduce((s,e) => s + Math.round(e.saleAmount * e.tcsRate / 100), 0);
        const totalDeposited = entries.filter(e => e.deposited).reduce((s,e) => s + Math.round(e.saleAmount * e.tcsRate / 100), 0);
        const pending        = totalTcs - totalDeposited;

        return (
          <div className="space-y-4 max-w-2xl">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-1">TCS Tracker — Tax Collected at Source</h2>
              <p className="text-xs text-[var(--color-muted)] mb-4">Under Sec 206C, sellers of specified goods must collect TCS at source. Deposit by the 7th of the following month. File Form 27EQ quarterly.</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input value={buyer} onChange={e=>setBuyer(e.target.value)} placeholder="Buyer / party name *"
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <input type="number" value={saleAmt} onChange={e=>setSaleAmt(e.target.value)} placeholder="Sale amount (₹) *"
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <select value={goods} onChange={e => { setGoods(e.target.value); setTcsRate(TCS_RATES.find(r=>r.goods===e.target.value)?.rate ?? 1); }}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
                  {TCS_RATES.map(r => <option key={r.goods} value={r.goods}>{r.goods}</option>)}
                </select>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              </div>
              {saleAmt && <p className="text-xs text-[var(--color-muted)] mb-3">TCS @ {tcsRate}% = <span className="font-semibold text-[var(--color-primary)]">{formatCurrency(Math.round(parseFloat(saleAmt) * tcsRate / 100))}</span></p>}
              <button onClick={addEntry} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add entry</button>
            </div>

            {entries.length > 0 && <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total TCS to collect", value: formatCurrency(totalTcs),   color: "text-blue-400" },
                  { label: "Deposited",             value: formatCurrency(totalDeposited), color: "text-green-400" },
                  { label: "Pending deposit",       value: formatCurrency(pending),    color: pending > 0 ? "text-red-400" : "text-green-400" },
                ].map(k => (
                  <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                    <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                    <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        {["Buyer","Goods","Sale Amount","Rate","TCS","Date","Status",""].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {entries.map(e => {
                        const tcsAmt = Math.round(e.saleAmount * e.tcsRate / 100);
                        return (
                          <tr key={e.id} className="hover:bg-white/2">
                            <td className="px-3 py-2.5 font-medium text-xs">{e.buyer}</td>
                            <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] max-w-[140px] truncate">{e.goods}</td>
                            <td className="px-3 py-2.5 tabular-nums text-xs">{formatCurrency(e.saleAmount)}</td>
                            <td className="px-3 py-2.5 tabular-nums text-xs">{e.tcsRate}%</td>
                            <td className="px-3 py-2.5 tabular-nums text-xs font-semibold text-blue-400">{formatCurrency(tcsAmt)}</td>
                            <td className="px-3 py-2.5 text-xs">{e.date}</td>
                            <td className="px-3 py-2.5">
                              <button onClick={() => setEntries(prev => prev.map(x => x.id === e.id ? { ...x, deposited: !x.deposited } : x))}
                                className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${e.deposited ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                                {e.deposited ? "Deposited" : "Pending"}
                              </button>
                            </td>
                            <td className="px-3 py-2.5"><button onClick={() => setEntries(prev => prev.filter(x => x.id !== e.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>}

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs font-semibold mb-2">TCS Rates Quick Reference (Sec 206C)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {TCS_RATES.map(r => (
                  <div key={r.goods} className="flex items-center justify-between text-xs py-1 border-b border-[var(--color-border)] last:border-0">
                    <span className="text-[var(--color-muted)] truncate pr-2">{r.goods}</span>
                    <span className="font-semibold tabular-nums shrink-0">{r.rate}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {taxTab === "mat" && (() => {
        return <MatChecker />;
      })()}

      {taxTab === "angel" && (() => {
        return <AngelTaxChecker />;
      })()}

      {taxTab === "regime" && (() => {
        return <RegimeOptimizer />;
      })()}

      {taxTab === "advtax" && (() => {
        return <AdvanceTaxEstimator />;
      })()}

      {taxTab === "tds-return"      && <TdsReturnGenerator />}
      {taxTab === "form26as"        && <Form26ASRecon />}
      {taxTab === "tds-finder"      && <TdsSectionFinder />}
      {taxTab === "ldc-197"         && <LowerDeductionTracker />}
      {taxTab === "depreciation"    && <DepreciationSchedule />}
      {taxTab === "loss-setoff"     && <LossSetoffPlanner />}
      {taxTab === "itr-prefill"     && <ItrPrefillPack />}
      {taxTab === "form15ca"        && <Form15CAHelper />}
      {taxTab === "sec80"           && <Sec80Maximiser />}
      {taxTab === "eq-levy"         && <EqualisationLevyTracker />}
      {taxTab === "advtax-calendar" && <AdvTaxCashCalendar />}
      {taxTab === "tax-notice"      && <TaxNoticeResponder />}
    </div>
  );
}

function MatChecker() {
  const [bookProfit,   setBookProfit]   = useState("");
  const [netIncome,    setNetIncome]    = useState("");
  const [additions,    setAdditions]    = useState("");   // items added back to book profit
  const [deductions,   setDeductions]   = useState("");   // items deducted
  const [entityType,   setEntityType]   = useState<"company" | "llp">("company");

  const bp = parseFloat(bookProfit)  || 0;
  const ni = parseFloat(netIncome)   || 0;
  const add = parseFloat(additions)  || 0;
  const ded = parseFloat(deductions) || 0;

  const adjBookProfit = bp + add - ded;
  const matRate       = entityType === "company" ? 15 : 0; // MAT applies to companies; AMT (18.5%) for others
  const amtRate       = 18.5;
  const matLiability  = entityType === "company" ? adjBookProfit * matRate / 100 : adjBookProfit * amtRate / 100;
  const normalTax     = ni * 0.25; // Sec 115BAA flat 25% simplified
  const matApplies    = matLiability > normalTax;
  const matCredit     = matApplies ? matLiability - normalTax : 0; // carry forward 15 yrs

  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const ADDITIONS_LIST  = ["Depreciation as per books","Income tax paid/payable","Deferred tax (Dr)","Provision for losses of subsidiaries","Dividend paid/proposed","Expenditure on CSR (Sec 135)"];
  const DEDUCTIONS_LIST = ["Depreciation as per Sch II","Deferred tax credit (Cr)","Withdrawal from reserves","Amount carried to profits of company","Income exempt under Sec 10 (part)"];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">MAT / AMT Calculator (Sec 115JB / 115JC)</h3>
          <div className="flex gap-2">
            {(["company","llp"] as const).map(t => (
              <button key={t} onClick={() => setEntityType(t)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors ${entityType === t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                {t === "company" ? "Company (MAT)" : "LLP/Individual (AMT)"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Book Profit as per P&L (₹)</label>
            <input type="number" value={bookProfit} onChange={e => setBookProfit(e.target.value)} placeholder="e.g. 5000000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Additions to Book Profit (₹)</label>
            <input type="number" value={additions} onChange={e => setAdditions(e.target.value)} placeholder="e.g. 200000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Deductions from Book Profit (₹)</label>
            <input type="number" value={deductions} onChange={e => setDeductions(e.target.value)} placeholder="e.g. 100000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Normal Taxable Income (₹)</label>
            <input type="number" value={netIncome} onChange={e => setNetIncome(e.target.value)} placeholder="e.g. 3000000" className={inp} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Adj. Book Profit",     value: fc(adjBookProfit), color: "text-[var(--color-primary)]" },
          { label: `${entityType === "company" ? "MAT" : "AMT"} Liability (${entityType === "company" ? matRate : amtRate}%)`, value: fc(matLiability), color: "text-orange-400" },
          { label: "Normal Tax Est (25%)",  value: fc(normalTax),    color: "text-blue-400" },
          { label: "MAT Credit (c/f 15yr)", value: fc(matCredit),    color: matApplies ? "text-yellow-400" : "text-[var(--color-muted)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-lg p-4 border ${matApplies ? "border-orange-800/40 bg-orange-950/20" : "border-green-800/40 bg-green-950/20"}`}>
        <p className={`text-sm font-bold ${matApplies ? "text-orange-400" : "text-green-400"}`}>
          {matApplies
            ? `⚠ MAT applies — pay ${entityType === "company" ? "MAT" : "AMT"} of ${fc(matLiability)} (higher than normal tax ${fc(normalTax)}). MAT credit ${fc(matCredit)} can be carried forward 15 years.`
            : `✓ Normal tax applies — ${entityType === "company" ? "MAT" : "AMT"} of ${fc(matLiability)} is lower than normal tax ${fc(normalTax)}. No MAT credit arises.`}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Common Additions to Book Profit</p>
          <ul className="space-y-1">{ADDITIONS_LIST.map(i => <li key={i} className="text-xs text-[var(--color-muted)] flex gap-2"><span className="text-orange-400">+</span>{i}</li>)}</ul>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Common Deductions from Book Profit</p>
          <ul className="space-y-1">{DEDUCTIONS_LIST.map(i => <li key={i} className="text-xs text-[var(--color-muted)] flex gap-2"><span className="text-green-400">−</span>{i}</li>)}</ul>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">MAT: Sec 115JB — companies pay higher of normal tax or 15% of adjusted book profit. AMT: Sec 115JC — LLPs/individuals claiming profit-linked deductions. MAT credit under Sec 115JAA. Consult CA for full computation.</p>
    </div>
  );
}

function AngelTaxChecker() {
  const [issuePrice,    setIssuePrice]    = useState("");
  const [fmv,           setFmv]           = useState("");
  const [sharesIssued,  setSharesIssued]  = useState("");
  const [investorType,  setInvestorType]  = useState<"resident" | "foreign">("resident");
  const [dpiitReg,      setDpiitReg]      = useState(false);
  const [aifCat1,       setAifCat1]       = useState(false);

  const ip   = parseFloat(issuePrice)   || 0;
  const fv   = parseFloat(fmv)          || 0;
  const qty  = parseFloat(sharesIssued) || 0;

  const totalPremium  = ip * qty;
  const fmvTotal      = fv * qty;
  const excessPremium = Math.max(0, totalPremium - fmvTotal);

  const exempt = dpiitReg || aifCat1 || investorType === "foreign";
  const taxLiability = exempt ? 0 : excessPremium * 0.30;
  const surcharge    = taxLiability > 10000000 ? taxLiability * 0.12 : taxLiability > 1000000 ? taxLiability * 0.07 : 0;
  const totalTax     = taxLiability + surcharge;

  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const EXEMPTIONS = [
    { key: "dpiit",   label: "DPIIT-recognised startup (Form 2)",        active: dpiitReg,    set: setDpiitReg },
    { key: "aif",     label: "Investment from Cat-I/II AIF registered with SEBI", active: aifCat1, set: setAifCat1 },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold">Angel Tax Exposure (Sec 56(2)(viib))</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Issue Price per Share (₹)</label>
            <input type="number" value={issuePrice} onChange={e => setIssuePrice(e.target.value)} placeholder="e.g. 100" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">FMV per Share (₹)</label>
            <input type="number" value={fmv} onChange={e => setFmv(e.target.value)} placeholder="e.g. 80" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Shares Issued</label>
            <input type="number" value={sharesIssued} onChange={e => setSharesIssued(e.target.value)} placeholder="e.g. 10000" className={inp} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-2">Investor Type</label>
          <div className="flex gap-2">
            {(["resident","foreign"] as const).map(t => (
              <button key={t} onClick={() => setInvestorType(t)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${investorType === t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                {t === "resident" ? "Resident Indian" : "Foreign Investor (FEMA)"}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-[var(--color-muted)] block">Exemptions available</label>
          {EXEMPTIONS.map(ex => (
            <label key={ex.key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={ex.active} onChange={e => ex.set(e.target.checked)} className="accent-[var(--color-primary)]" />
              <span className="text-xs">{ex.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Premium Received", value: fc(totalPremium),  color: "text-[var(--color-primary)]" },
          { label: "FMV of Shares",          value: fc(fmvTotal),      color: "text-blue-400" },
          { label: "Excess Premium (Taxable)",value: fc(excessPremium), color: excessPremium > 0 ? "text-orange-400" : "text-green-400" },
          { label: "Tax Liability (30%+SC)", value: fc(totalTax),      color: totalTax > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-lg p-4 border ${exempt ? "border-green-800/40 bg-green-950/20" : excessPremium > 0 ? "border-red-800/40 bg-red-950/20" : "border-green-800/40 bg-green-950/20"}`}>
        <p className={`text-sm font-bold ${exempt ? "text-green-400" : excessPremium > 0 ? "text-red-400" : "text-green-400"}`}>
          {exempt
            ? `✓ Exempt from Angel Tax — ${dpiitReg ? "DPIIT recognition" : aifCat1 ? "Cat-I/II AIF exemption" : "Foreign investor (FEMA route)"}`
            : excessPremium > 0
              ? `⚠ Angel Tax applies — ${fc(excessPremium)} excess premium is taxable as 'Income from Other Sources' in the company's hands`
              : "✓ No excess premium — issue price ≤ FMV. No angel tax liability."}
        </p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Key Exemption Routes</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {[
            { title: "DPIIT Registration", detail: "File Form 2 with DPIIT. Entire premium exempt irrespective of FMV. Fastest route for startups." },
            { title: "Cat-I / II AIF", detail: "Investment from SEBI-registered Category I or II Alternative Investment Fund is exempt." },
            { title: "Foreign Investor", detail: "Sec 56(2)(viib) applies only to resident investors. FDI/FEMA route avoids angel tax entirely." },
          ].map(r => (
            <div key={r.title} className="bg-[var(--color-accent)] rounded-lg p-3">
              <p className="font-semibold text-[var(--color-primary)] mb-1">{r.title}</p>
              <p className="text-[var(--color-muted)]">{r.detail}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Sec 56(2)(viib): if a closely-held company issues shares at a premium exceeding FMV, the excess is taxed as IFOS in the company. FMV via DCF or NAV method (Rule 11UA). DPIIT notification S.O. 1131(E) provides full exemption.</p>
    </div>
  );
}

// ── REGIME OPTIMIZER (Old vs New, FY 2024-25 / AY 2025-26) ──────────────────────
type SlabBand = { upTo: number; rate: number };
function slabTax(income: number, bands: SlabBand[]): number {
  let tax = 0, prev = 0;
  for (const b of bands) {
    if (income <= prev) break;
    const portion = Math.min(income, b.upTo) - prev;
    if (portion > 0) tax += portion * (b.rate / 100);
    prev = b.upTo;
  }
  return tax;
}

const NEW_BANDS: SlabBand[] = [
  { upTo: 300000, rate: 0 }, { upTo: 700000, rate: 5 }, { upTo: 1000000, rate: 10 },
  { upTo: 1200000, rate: 15 }, { upTo: 1500000, rate: 20 }, { upTo: Infinity, rate: 30 },
];
const OLD_BANDS: SlabBand[] = [
  { upTo: 250000, rate: 0 }, { upTo: 500000, rate: 5 }, { upTo: 1000000, rate: 20 }, { upTo: Infinity, rate: 30 },
];

function RegimeOptimizer() {
  const [gross,    setGross]    = useState("");
  const [d80c,     setD80c]     = useState("");
  const [d80d,     setD80d]     = useState("");
  const [d80ccd,   setD80ccd]   = useState("");
  const [homeLoan, setHomeLoan] = useState("");
  const [hra,      setHra]      = useState("");
  const [senior,   setSenior]   = useState(false);

  const g = parseFloat(gross) || 0;
  const ded80c   = Math.min(parseFloat(d80c)   || 0, 150000);
  const ded80d   = Math.min(parseFloat(d80d)   || 0, senior ? 50000 : 25000);
  const ded80ccd = Math.min(parseFloat(d80ccd) || 0, 50000);
  const dedHome  = Math.min(parseFloat(homeLoan) || 0, 200000);
  const dedHra   = parseFloat(hra) || 0;
  const oldDeductions = ded80c + ded80d + ded80ccd + dedHome + dedHra;

  // New regime
  const newTaxable = Math.max(0, g - 75000);
  const newSlab    = slabTax(newTaxable, NEW_BANDS);
  const newRebate  = newTaxable <= 700000 ? newSlab : 0;
  const newAfter   = newSlab - newRebate;
  const newCess    = newAfter * 0.04;
  const newTotal   = Math.round(newAfter + newCess);

  // Old regime
  const oldTaxable = Math.max(0, g - 50000 - oldDeductions);
  const oldSlab    = slabTax(oldTaxable, OLD_BANDS);
  const oldRebate  = oldTaxable <= 500000 ? Math.min(oldSlab, 12500) : 0;
  const oldAfter   = oldSlab - oldRebate;
  const oldCess    = oldAfter * 0.04;
  const oldTotal   = Math.round(oldAfter + oldCess);

  const cheaper = newTotal <= oldTotal ? "New" : "Old";
  const savings = Math.abs(newTotal - oldTotal);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const breakdown = [
    { label: "Gross Income",        nw: g,            od: g },
    { label: "Standard Deduction",  nw: -75000,       od: -50000 },
    { label: "Chapter VI-A & 24(b)", nw: 0,           od: -oldDeductions },
    { label: "Taxable Income",      nw: newTaxable,   od: oldTaxable, bold: true },
    { label: "Slab Tax",            nw: Math.round(newSlab), od: Math.round(oldSlab) },
    { label: "Less: 87A Rebate",    nw: -Math.round(newRebate), od: -Math.round(oldRebate) },
    { label: "Health & Edu Cess 4%", nw: Math.round(newCess), od: Math.round(oldCess) },
    { label: "Total Tax",           nw: newTotal,     od: oldTotal, bold: true },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold">Old vs New Regime Optimizer (FY 2024-25)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gross Annual Income (₹)</label>
            <input type="number" value={gross} onChange={e => setGross(e.target.value)} placeholder="e.g. 1200000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">80C (max ₹1.5L)</label>
            <input type="number" value={d80c} onChange={e => setD80c(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">80D Health (max ₹{senior ? "50k" : "25k"})</label>
            <input type="number" value={d80d} onChange={e => setD80d(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">80CCD(1B) NPS (max ₹50k)</label>
            <input type="number" value={d80ccd} onChange={e => setD80ccd(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Home Loan Int. 24(b) (max ₹2L)</label>
            <input type="number" value={homeLoan} onChange={e => setHomeLoan(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">HRA Exemption</label>
            <input type="number" value={hra} onChange={e => setHra(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <input type="checkbox" checked={senior} onChange={e => setSenior(e.target.checked)} className="accent-[var(--color-primary)]" />
              Senior citizen (80D ₹50k)
            </label>
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Deductions apply only in the Old Regime. New Regime allows only the ₹75,000 standard deduction (and 80CCD(2) employer NPS, not modelled here).</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Tax — New Regime", value: fc(newTotal), color: cheaper === "New" ? "text-green-400" : "text-[var(--color-text)]" },
          { label: "Tax — Old Regime", value: fc(oldTotal), color: cheaper === "Old" ? "text-green-400" : "text-[var(--color-text)]" },
          { label: "You Save",         value: fc(savings),  color: "text-[var(--color-primary)]" },
          { label: "Recommended",      value: `${cheaper} Regime`, color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Particulars", "New Regime", "Old Regime"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakdown.map(r => (
              <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.nw < 0 ? `(${fc(Math.abs(r.nw))})` : fc(r.nw)}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.od < 0 ? `(${fc(Math.abs(r.od))})` : fc(r.od)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
        <p className="text-sm font-bold text-green-400">✓ {cheaper} Regime is cheaper by {fc(savings)}/year for this income & deduction profile.</p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">FY 2024-25 (AY 2025-26) slabs. Surcharge for income &gt; ₹50L is not modelled. 87A rebate: NIL tax if taxable ≤ ₹7L (new) / ≤ ₹5L (old). Verify with your CA.</p>
    </div>
  );
}

// ── ADVANCE TAX ESTIMATOR (Sec 208/211, interest 234B/234C) ─────────────────────
function AdvanceTaxEstimator() {
  const { store } = useApp();
  const defaultLiability = useMemo(() => {
    const txns = store.transactions ?? [];
    const months = Math.max(txns.length / 30, 1);
    const rev = txns.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const cost = txns.filter(t => t.category === "expense" || t.category === "payroll").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const annualProfit = ((rev - cost) / months) * 12;
    return Math.max(0, Math.round(annualProfit * 0.25));
  }, [store.transactions]);

  const [liabilityInput, setLiabilityInput] = useState("");
  const liability = parseFloat(liabilityInput) || defaultLiability;
  const [paid, setPaid] = useState<number[]>([0, 0, 0, 0]);

  const SCHEDULE = [
    { label: "1st — 15 Jun", pct: 15, months: 3 },
    { label: "2nd — 15 Sep", pct: 45, months: 3 },
    { label: "3rd — 15 Dec", pct: 75, months: 3 },
    { label: "4th — 15 Mar", pct: 100, months: 1 },
  ];

  const rows = SCHEDULE.map((s, i) => {
    const cumulativeDue  = Math.round(liability * s.pct / 100);
    const cumulativePaid = paid.slice(0, i + 1).reduce((a, b) => a + (b || 0), 0);
    const shortfall      = Math.max(0, cumulativeDue - cumulativePaid);
    const interest234C   = Math.round(shortfall * 0.01 * s.months);
    return { ...s, cumulativeDue, cumulativePaid, shortfall, interest234C };
  });

  const totalPaid     = paid.reduce((a, b) => a + (b || 0), 0);
  const total234C     = rows.reduce((s, r) => s + r.interest234C, 0);
  const below90       = totalPaid < liability * 0.9;
  const interest234B  = below90 ? Math.round((liability - totalPaid) * 0.01 * 1) : 0; // indicative 1 month
  const totalInterest = total234C + interest234B;
  const applicable    = liability > 10000;
  const fc = formatCurrency;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Advance Tax Estimator (Sec 208 / 211)</h3>
        <div className="max-w-sm">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Estimated Annual Tax Liability (₹)</label>
          <input type="number" value={liabilityInput} onChange={e => setLiabilityInput(e.target.value)}
            placeholder={`Auto: ${fc(defaultLiability)}`}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        {!applicable && <p className="text-xs text-green-400">Liability ≤ ₹10,000 — advance tax is not mandatory (Sec 208).</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Liability", value: fc(liability),      color: "text-[var(--color-primary)]" },
          { label: "Total Paid",      value: fc(totalPaid),      color: "text-blue-400" },
          { label: "Shortfall",       value: fc(Math.max(0, liability - totalPaid)), color: totalPaid < liability ? "text-red-400" : "text-green-400" },
          { label: "Est. Interest 234B+C", value: fc(totalInterest), color: totalInterest > 0 ? "text-orange-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Clock size={13} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Installment Schedule</span>
        </div>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Installment", "Cum. %", "Cum. Due", "Paid (editable)", "Shortfall", "234C Interest"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 font-medium">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.pct}%</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(r.cumulativeDue)}</td>
                <td className="px-4 py-2.5">
                  <input type="number" value={paid[i] || ""} onChange={e => { const next = [...paid]; next[i] = parseFloat(e.target.value) || 0; setPaid(next); }}
                    placeholder="0" className="w-28 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none tabular-nums" />
                </td>
                <td className="px-4 py-2.5 tabular-nums text-red-400">{r.shortfall > 0 ? fc(r.shortfall) : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-orange-400">{r.interest234C > 0 ? fc(r.interest234C) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {below90 && applicable && (
        <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20">
          <p className="text-sm font-bold text-orange-400">⚠ Less than 90% paid — Sec 234B interest of ~{fc(interest234B)} applies (1%/month on shortfall from 1 April, indicative).</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Sec 234C: 1% per month on installment shortfall (×3 months for Jun/Sep/Dec, ×1 for Mar). Sec 234B: 1% per month if &lt; 90% paid by year-end. Presumptive 44AD/44ADA taxpayers may pay 100% by 15 Mar. Indicative — consult a CA.</p>
    </div>
  );
}

// Shared input class (matches existing `inp` pattern across this file)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

// TDS section master — section / rate / threshold / payee logic (FY 2024-25)
type TdsSection = {
  section: string; nature: string; rate: number; rateNonPan: number;
  threshold: number; form: "24Q" | "26Q" | "27Q"; note?: string;
};
const TDS_SECTIONS: TdsSection[] = [
  { section: "192",   nature: "Salary",                              rate: 0,   rateNonPan: 0,  threshold: 0,        form: "24Q", note: "As per slab — projected via payroll 192" },
  { section: "194A",  nature: "Interest (other than securities)",    rate: 10,  rateNonPan: 20, threshold: 40000,    form: "26Q" },
  { section: "194C",  nature: "Contractor — individual/HUF",         rate: 1,   rateNonPan: 20, threshold: 30000,    form: "26Q", note: "₹1L aggregate p.a. limit also applies" },
  { section: "194C2", nature: "Contractor — company/firm",           rate: 2,   rateNonPan: 20, threshold: 30000,    form: "26Q" },
  { section: "194H",  nature: "Commission / brokerage",              rate: 5,   rateNonPan: 20, threshold: 15000,    form: "26Q" },
  { section: "194I-L",nature: "Rent — land/building/furniture",      rate: 10,  rateNonPan: 20, threshold: 240000,   form: "26Q" },
  { section: "194I-P",nature: "Rent — plant/machinery/equipment",    rate: 2,   rateNonPan: 20, threshold: 240000,   form: "26Q" },
  { section: "194J-P",nature: "Professional fees / royalty",         rate: 10,  rateNonPan: 20, threshold: 30000,    form: "26Q" },
  { section: "194J-T",nature: "Technical services / call-centre",    rate: 2,   rateNonPan: 20, threshold: 30000,    form: "26Q" },
  { section: "194Q",  nature: "Purchase of goods > ₹50L",            rate: 0.1, rateNonPan: 5,  threshold: 5000000,  form: "26Q", note: "Buyer turnover > ₹10 Cr; on value above ₹50L" },
  { section: "194O",  nature: "E-commerce participant payments",     rate: 1,   rateNonPan: 5,  threshold: 500000,   form: "26Q", note: "Operator deducts on gross sales (₹5L limit for individuals)" },
  { section: "206C1H",nature: "TCS — sale of goods > ₹50L",          rate: 0.1, rateNonPan: 1,  threshold: 5000000,  form: "27Q", note: "Collected by seller (turnover > ₹10 Cr)" },
];

// ── #14 TDS Return (24Q/26Q) Generator ──────────────────────────────────────────
type DeductionRow = { id: string; deductee: string; pan: string; section: string; amount: number; date: string; deposited: boolean };
function TdsReturnGenerator() {
  const [rows, setRows] = useFeatureState<DeductionRow[]>("tds-return-rows", []);
  const [deductee, setDeductee] = useState("");
  const [pan, setPan] = useState("");
  const [section, setSection] = useState(TDS_SECTIONS[2].section);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const fc = formatCurrency;

  const quarterOf = (d: string): "Q1" | "Q2" | "Q3" | "Q4" => {
    const m = new Date(d).getMonth(); // FY quarters: Apr-Jun Q1 ...
    if (m >= 3 && m <= 5) return "Q1";
    if (m >= 6 && m <= 8) return "Q2";
    if (m >= 9 && m <= 11) return "Q3";
    return "Q4";
  };
  const tdsOf = (r: DeductionRow) => {
    const sec = TDS_SECTIONS.find(s => s.section === r.section);
    if (!sec) return 0;
    const rate = r.pan.trim().length === 10 ? sec.rate : sec.rateNonPan;
    return Math.round(r.amount * rate / 100);
  };

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (!deductee || amt <= 0) { toast.error("Enter deductee name and amount"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), deductee, pan: pan.toUpperCase(), section, amount: amt, date, deposited: false }]);
    setDeductee(""); setPan(""); setAmount("");
    toast.success("Deduction added to challan register");
  };

  const grouped = useMemo(() => {
    const map: Record<string, { form: string; quarter: string; tds: number; count: number }> = {};
    rows.forEach(r => {
      const sec = TDS_SECTIONS.find(s => s.section === r.section);
      const form = sec?.form ?? "26Q";
      const q = quarterOf(r.date);
      const key = `${form}-${q}`;
      if (!map[key]) map[key] = { form, quarter: q, tds: 0, count: 0 };
      map[key].tds += tdsOf(r); map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => a.form.localeCompare(b.form) || a.quarter.localeCompare(b.quarter));
  }, [rows]);

  const totalTds = rows.reduce((s, r) => s + tdsOf(r), 0);
  const pendingTds = rows.filter(r => !r.deposited).reduce((s, r) => s + tdsOf(r), 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> TDS Return Generator (24Q / 26Q / 27Q)</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Log each deduction, auto-pick the rate (20% if PAN missing), and group into quarterly e-TDS statements for the FVU. Deposit by 7th of next month; file return by end of next month after the quarter.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={deductee} onChange={e => setDeductee(e.target.value)} placeholder="Deductee name *" className={INP} />
          <input value={pan} onChange={e => setPan(e.target.value)} placeholder="PAN (blank → 20%)" maxLength={10} className={INP} />
          <select value={section} onChange={e => setSection(e.target.value)} className={INP}>
            {TDS_SECTIONS.filter(s => s.section !== "192").map(s => <option key={s.section} value={s.section}>{s.section} — {s.nature}</option>)}
          </select>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Payment amount (₹) *" className={INP} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add deduction</button>
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total TDS deducted", value: fc(totalTds), color: "text-blue-400" },
            { label: "Pending deposit", value: fc(pendingTds), color: pendingTds > 0 ? "text-red-400" : "text-green-400" },
            { label: "Statements to file", value: String(grouped.length), color: "text-orange-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs font-semibold mb-2">Quarterly Statement Summary</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {grouped.map(g => (
              <div key={g.form + g.quarter} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)]">{g.form} · {g.quarter}</p>
                <p className="text-sm font-bold tabular-nums text-[var(--color-primary)]">{fc(g.tds)}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{g.count} deductee{g.count > 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Deductee", "PAN", "Section", "Amount", "TDS", "Qtr/Form", "Date", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const sec = TDS_SECTIONS.find(s => s.section === r.section);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.deductee}</td>
                    <td className="px-3 py-2.5 text-xs">{r.pan || <span className="text-red-400">No PAN</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.section}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.amount)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-blue-400">{fc(tdsOf(r))}</td>
                    <td className="px-3 py-2.5 text-xs">{quarterOf(r.date)} · {sec?.form}</td>
                    <td className="px-3 py-2.5 text-xs">{r.date}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => setRows(prev => prev.map(x => x.id === r.id ? { ...x, deposited: !x.deposited } : x))}
                        className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.deposited ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                        {r.deposited ? "Deposited" : "Pending"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">24Q = salary (192), 26Q = resident non-salary, 27Q = non-resident payments. PAN-less deductees attract higher rate u/s 206AA (min 20%). Late filing fee ₹200/day u/s 234E. Generate the FVU via NSDL RPU before upload.</p>
    </div>
  );
}

// ── #15 Form 26AS / AIS Reconciliation ──────────────────────────────────────────
type RecRow = { id: string; party: string; section: string; booksTds: number; as26Tds: number };
function Form26ASRecon() {
  const [rows, setRows] = useFeatureState<RecRow[]>("form26as-rows", []);
  const [party, setParty] = useState("");
  const [section, setSection] = useState("194J-P");
  const [booksTds, setBooksTds] = useState("");
  const [as26Tds, setAs26Tds] = useState("");
  const fc = formatCurrency;

  const add = () => {
    if (!party) { toast.error("Enter party / deductor name"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), party, section, booksTds: parseFloat(booksTds) || 0, as26Tds: parseFloat(as26Tds) || 0 }]);
    setParty(""); setBooksTds(""); setAs26Tds("");
  };

  const verdict = (r: RecRow): { label: string; cls: string } => {
    const diff = r.as26Tds - r.booksTds;
    if (Math.abs(diff) < 1) return { label: "Matched", cls: "bg-green-900/30 text-green-400 border-green-800/40" };
    if (diff < 0) return { label: "Short in 26AS — chase deductor", cls: "bg-red-900/30 text-red-400 border-red-800/40" };
    return { label: "Extra in 26AS — claim it", cls: "bg-blue-900/30 text-blue-400 border-blue-800/40" };
  };

  const totalBooks = rows.reduce((s, r) => s + r.booksTds, 0);
  const total26 = rows.reduce((s, r) => s + r.as26Tds, 0);
  const claimable = Math.min(totalBooks, total26);
  const atRisk = Math.max(0, totalBooks - total26);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileSearch size={14} className="text-[var(--color-primary)]" /> Form 26AS / AIS Reconciliation</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Match TDS credit per your books against what the deductor reported in 26AS / AIS. Only TDS appearing in 26AS can be claimed in the ITR — chase mismatches before filing.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <input value={party} onChange={e => setParty(e.target.value)} placeholder="Deductor / party *" className={INP} />
          <select value={section} onChange={e => setSection(e.target.value)} className={INP}>
            {TDS_SECTIONS.map(s => <option key={s.section} value={s.section}>{s.section}</option>)}
          </select>
          <input type="number" value={booksTds} onChange={e => setBooksTds(e.target.value)} placeholder="TDS per books (₹)" className={INP} />
          <input type="number" value={as26Tds} onChange={e => setAs26Tds(e.target.value)} placeholder="TDS in 26AS (₹)" className={INP} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add line</button>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "TDS per books", value: fc(totalBooks), color: "text-[var(--color-text)]" },
            { label: "Claimable (in 26AS)", value: fc(claimable), color: "text-green-400" },
            { label: "At risk (chase deductor)", value: fc(atRisk), color: atRisk > 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Deductor", "Section", "Books", "26AS", "Diff", "Verdict", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const v = verdict(r); const diff = r.as26Tds - r.booksTds;
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.party}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.section}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.booksTds)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.as26Tds)}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${diff < 0 ? "text-red-400" : diff > 0 ? "text-blue-400" : "text-green-400"}`}>{diff === 0 ? "—" : fc(diff)}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${v.cls}`}>{v.label}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Download 26AS from TRACES and AIS from the e-filing portal. A short credit in 26AS usually means the deductor hasn't filed/deposited — file a grievance or get a revised TDS return from them. Reconcile before the 31 Jul / 31 Oct ITR due date.</p>
    </div>
  );
}

// ── #16 TDS Rate & Section Finder ───────────────────────────────────────────────
function TdsSectionFinder() {
  const [secId, setSecId] = useState(TDS_SECTIONS[2].section);
  const [amount, setAmount] = useState("");
  const [hasPan, setHasPan] = useState(true);
  const fc = formatCurrency;
  const sec = TDS_SECTIONS.find(s => s.section === secId)!;
  const amt = parseFloat(amount) || 0;
  const rate = hasPan ? sec.rate : sec.rateNonPan;
  const applies = amt >= sec.threshold && rate > 0;
  const tds = applies ? Math.round(amt * rate / 100) : 0;
  const net = amt - tds;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Search size={14} className="text-[var(--color-primary)]" /> TDS Section &amp; Rate Finder</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Pick the nature of payment to get the correct section, rate and threshold — including 194Q (0.1%), 194C (1/2%), 194J (10/2%), 194I (10/2%) and 206C.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Nature of payment</label>
            <select value={secId} onChange={e => setSecId(e.target.value)} className={INP}>
              {TDS_SECTIONS.map(s => <option key={s.section} value={s.section}>{s.section} — {s.nature}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payment amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 100000" className={INP} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer mt-3">
          <input type="checkbox" checked={hasPan} onChange={e => setHasPan(e.target.checked)} className="accent-[var(--color-primary)]" />
          Deductee has furnished valid PAN (else higher rate u/s 206AA applies)
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Section", value: sec.section, color: "text-[var(--color-primary)]" },
          { label: "Applicable rate", value: `${rate}%`, color: "text-orange-400" },
          { label: "Threshold", value: sec.threshold === 0 ? "—" : fc(sec.threshold), color: "text-blue-400" },
          { label: "TDS to deduct", value: fc(tds), color: tds > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {amt > 0 && (
        <div className={`rounded-lg p-4 border ${applies ? "border-orange-800/40 bg-orange-950/20" : "border-green-800/40 bg-green-950/20"}`}>
          <p className={`text-sm font-bold ${applies ? "text-orange-400" : "text-green-400"}`}>
            {applies
              ? `Deduct ${fc(tds)} (${rate}% u/s ${sec.section}) and pay ${fc(net)} net. File in Form ${sec.form}.`
              : `No TDS — amount ${amt < sec.threshold ? `below the ${fc(sec.threshold)} threshold` : "rate not applicable"} for section ${sec.section}.`}
          </p>
          {sec.note && <p className="text-[11px] text-[var(--color-muted)] mt-1">{sec.note}</p>}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold mb-2">Rate Quick Reference (FY 2024-25)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[520px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Section", "Nature", "Rate", "No-PAN", "Threshold", "Form"].map(h => <th key={h} className="px-2 py-2 text-left text-[var(--color-muted)] font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {TDS_SECTIONS.map(s => (
                <tr key={s.section}>
                  <td className="px-2 py-1.5 font-medium">{s.section}</td>
                  <td className="px-2 py-1.5 text-[var(--color-muted)]">{s.nature}</td>
                  <td className="px-2 py-1.5 tabular-nums">{s.rate}%</td>
                  <td className="px-2 py-1.5 tabular-nums">{s.rateNonPan}%</td>
                  <td className="px-2 py-1.5 tabular-nums">{s.threshold === 0 ? "—" : fc(s.threshold)}</td>
                  <td className="px-2 py-1.5">{s.form}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── #17 Lower-Deduction Certificate (197) Tracker ───────────────────────────────
type LdcRow = { id: string; vendor: string; certNo: string; section: string; certRate: number; validTill: string; payment: number };
function LowerDeductionTracker() {
  const [rows, setRows] = useFeatureState<LdcRow[]>("ldc-197-rows", []);
  const [vendor, setVendor] = useState("");
  const [certNo, setCertNo] = useState("");
  const [section, setSection] = useState("194J-P");
  const [certRate, setCertRate] = useState("");
  const [validTill, setValidTill] = useState("");
  const [payment, setPayment] = useState("");
  const fc = formatCurrency;
  const today = new Date().toISOString().split("T")[0];

  const add = () => {
    if (!vendor || !certNo) { toast.error("Enter vendor and certificate number"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), vendor, certNo, section, certRate: parseFloat(certRate) || 0, validTill, payment: parseFloat(payment) || 0 }]);
    setVendor(""); setCertNo(""); setCertRate(""); setValidTill(""); setPayment("");
    toast.success("197 certificate recorded");
  };

  const normalRate = (s: string) => TDS_SECTIONS.find(x => x.section === s)?.rate ?? 10;
  const totalSaved = rows.reduce((s, r) => {
    const expired = r.validTill && r.validTill < today;
    const eff = expired ? normalRate(r.section) : r.certRate;
    return s + Math.round(r.payment * (normalRate(r.section) - eff) / 100);
  }, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileCheck size={14} className="text-[var(--color-primary)]" /> Lower-Deduction Certificate (Sec 197) Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Vendors with a Sec 197 certificate get TDS at a reduced rate. Apply the certificate rate only while it is valid — deduct at the normal rate once it expires.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor name *" className={INP} />
          <input value={certNo} onChange={e => setCertNo(e.target.value)} placeholder="Certificate no. *" className={INP} />
          <select value={section} onChange={e => setSection(e.target.value)} className={INP}>
            {TDS_SECTIONS.map(s => <option key={s.section} value={s.section}>{s.section} (normal {s.rate}%)</option>)}
          </select>
          <input type="number" value={certRate} onChange={e => setCertRate(e.target.value)} placeholder="Cert. rate %" className={INP} />
          <input type="date" value={validTill} onChange={e => setValidTill(e.target.value)} className={INP} />
          <input type="number" value={payment} onChange={e => setPayment(e.target.value)} placeholder="Payment YTD (₹)" className={INP} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add certificate</button>
      </div>

      {rows.length > 0 && <>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Total TDS saved via 197 certificates (valid ones)</p>
          <p className="text-xl font-bold tabular-nums text-green-400">{fc(totalSaved)}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Vendor", "Cert No.", "Section", "Cert %", "Valid till", "Applied TDS", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const expired = !!r.validTill && r.validTill < today;
                const eff = expired ? normalRate(r.section) : r.certRate;
                const appliedTds = Math.round(r.payment * eff / 100);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.vendor}</td>
                    <td className="px-3 py-2.5 text-xs">{r.certNo}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.section}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.certRate}%</td>
                    <td className="px-3 py-2.5 text-xs">{r.validTill || "—"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-blue-400">{fc(appliedTds)} @ {eff}%</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${expired ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{expired ? "Expired — normal rate" : "Valid"}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Sec 197: the deductee obtains a certificate from the AO for NIL/lower TDS. Validity is for the FY stated on the certificate. Quote the certificate number in your TDS return. Always verify on TRACES before applying.</p>
    </div>
  );
}

// ── #18 Depreciation Schedule (IT Act block-of-assets, WDV) ──────────────────────
type DepAsset = { id: string; name: string; block: string; openWdv: number; additions: number; halfYear: boolean };
const DEP_BLOCKS = [
  { block: "Buildings (residential)", rate: 5 },
  { block: "Buildings (general)", rate: 10 },
  { block: "Furniture & fittings", rate: 10 },
  { block: "Plant & machinery (general)", rate: 15 },
  { block: "Motor vehicles", rate: 15 },
  { block: "Computers & software", rate: 40 },
  { block: "Books (professional)", rate: 40 },
  { block: "Intangible assets / know-how", rate: 25 },
];
function DepreciationSchedule() {
  const [assets, setAssets] = useFeatureState<DepAsset[]>("depreciation-assets", []);
  const [name, setName] = useState("");
  const [block, setBlock] = useState(DEP_BLOCKS[3].block);
  const [openWdv, setOpenWdv] = useState("");
  const [additions, setAdditions] = useState("");
  const [halfYear, setHalfYear] = useState(false);
  const fc = formatCurrency;
  const rateOf = (b: string) => DEP_BLOCKS.find(x => x.block === b)?.rate ?? 15;

  const add = () => {
    if (!name) { toast.error("Enter asset name"); return; }
    setAssets(prev => [...prev, { id: crypto.randomUUID(), name, block, openWdv: parseFloat(openWdv) || 0, additions: parseFloat(additions) || 0, halfYear }]);
    setName(""); setOpenWdv(""); setAdditions(""); setHalfYear(false);
  };

  const computed = assets.map(a => {
    const rate = rateOf(a.block);
    // Full rate on opening WDV + additions held ≥180 days; half rate on additions held <180 days
    const fullBase = a.openWdv + (a.halfYear ? 0 : a.additions);
    const halfBase = a.halfYear ? a.additions : 0;
    const dep = Math.round(fullBase * rate / 100 + halfBase * (rate / 2) / 100);
    const closeWdv = a.openWdv + a.additions - dep;
    return { ...a, rate, dep, closeWdv };
  });
  const totalDep = computed.reduce((s, c) => s + c.dep, 0);
  const totalClose = computed.reduce((s, c) => s + c.closeWdv, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Depreciation Schedule (IT Act — Block of Assets, WDV)</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Written-down-value method by block. Assets put to use for &lt; 180 days in the year get half the normal rate. Companies Act SLM/WDV differs — maintain dual books.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Asset name *" className={INP} />
          <select value={block} onChange={e => setBlock(e.target.value)} className={INP}>
            {DEP_BLOCKS.map(b => <option key={b.block} value={b.block}>{b.block} ({b.rate}%)</option>)}
          </select>
          <input type="number" value={openWdv} onChange={e => setOpenWdv(e.target.value)} placeholder="Opening WDV (₹)" className={INP} />
          <input type="number" value={additions} onChange={e => setAdditions(e.target.value)} placeholder="Additions in year (₹)" className={INP} />
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={halfYear} onChange={e => setHalfYear(e.target.checked)} className="accent-[var(--color-primary)]" />
            Additions used &lt; 180 days (half rate)
          </label>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add asset</button>
        </div>
      </div>

      {computed.length > 0 && <>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total depreciation (year)", value: fc(totalDep), color: "text-orange-400" },
            { label: "Closing WDV (carried forward)", value: fc(totalClose), color: "text-blue-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Asset", "Block", "Rate", "Open WDV", "Additions", "Depreciation", "Close WDV", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {computed.map(c => (
                <tr key={c.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{c.name}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] max-w-[150px] truncate">{c.block}{c.halfYear ? " ·½" : ""}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{c.rate}%</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{fc(c.openWdv)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{fc(c.additions)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-orange-400">{fc(c.dep)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-blue-400">{fc(c.closeWdv)}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setAssets(prev => prev.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Rates per Appendix I, Income-tax Rules. Block WDV continues until the block is empty (no asset-wise gain/loss). Additional depreciation (20%) for new plant in manufacturing may apply separately. Companies Act depreciation (Sch II useful-life) is tracked separately.</p>
    </div>
  );
}

// ── #19 Loss Set-off & Carry-Forward Planner ────────────────────────────────────
type LossHead = "business" | "speculative" | "stcl" | "ltcl" | "house" | "other";
type LossRow = { id: string; head: LossHead; ay: string; amount: number };
function LossSetoffPlanner() {
  const [rows, setRows] = useFeatureState<LossRow[]>("loss-setoff-rows", []);
  const [head, setHead] = useState<LossHead>("business");
  const [ay, setAy] = useState("");
  const [amount, setAmount] = useState("");
  const fc = formatCurrency;

  const RULES: Record<LossHead, { label: string; cfYears: number; setoff: string }> = {
    business:    { label: "Business loss (non-spec)", cfYears: 8, setoff: "Any head except salary; c/f set off only vs business income" },
    speculative: { label: "Speculative business",      cfYears: 4, setoff: "Only against speculative profits" },
    stcl:        { label: "Short-term capital loss",   cfYears: 8, setoff: "Against STCG or LTCG" },
    ltcl:        { label: "Long-term capital loss",    cfYears: 8, setoff: "Only against LTCG" },
    house:       { label: "House property loss",        cfYears: 8, setoff: "Set off ≤₹2L vs other heads; c/f vs HP income" },
    other:       { label: "Owning & maintaining horses", cfYears: 4, setoff: "Only against same activity" },
  };

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { toast.error("Enter loss amount"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), head, ay: ay || "AY 2025-26", amount: amt }]);
    setAmount(""); setAy("");
  };

  const expiryAy = (cfYears: number, fromAy: string) => {
    const m = fromAy.match(/(\d{4})/);
    if (!m) return "—";
    const start = parseInt(m[1]);
    return `AY ${start + cfYears}-${String(start + cfYears + 1).slice(2)}`;
  };
  const grouped = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach(r => { map[r.head] = (map[r.head] || 0) + r.amount; });
    return map;
  }, [rows]);
  const totalLoss = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> Loss Set-off &amp; Carry-Forward Planner</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Record losses by head to see how many years they can be carried forward (8 years for business / capital losses, 4 for speculative) and the AY they expire. Carry-forward requires filing the ITR by the due date.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <select value={head} onChange={e => setHead(e.target.value as LossHead)} className={INP}>
            {(Object.keys(RULES) as LossHead[]).map(h => <option key={h} value={h}>{RULES[h].label}</option>)}
          </select>
          <input value={ay} onChange={e => setAy(e.target.value)} placeholder="AY incurred (e.g. AY 2024-25)" className={INP} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Loss amount (₹)" className={INP} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add loss</button>
        <p className="text-[11px] text-[var(--color-muted)] mt-2">Set-off rule: <span className="text-[var(--color-text)]">{RULES[head].setoff}</span> · Carry forward {RULES[head].cfYears} years.</p>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Total carried-forward loss</p>
            <p className="text-xl font-bold tabular-nums text-red-400">{fc(totalLoss)}</p>
          </div>
          {Object.entries(grouped).map(([h, amt]) => (
            <div key={h} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{RULES[h as LossHead].label}</p>
              <p className="text-lg font-bold tabular-nums text-orange-400">{fc(amt)}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Head", "AY incurred", "Amount", "Set-off against", "Expires", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{RULES[r.head].label}</td>
                  <td className="px-3 py-2.5 text-xs">{r.ay}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-red-400">{fc(r.amount)}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] max-w-[200px]">{RULES[r.head].setoff}</td>
                  <td className="px-3 py-2.5 text-xs text-orange-400">{expiryAy(RULES[r.head].cfYears, r.ay)}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Intra-head set-off first, then inter-head (subject to restrictions — e.g. business loss can't set off salary; LTCL only vs LTCG). Unabsorbed depreciation carries forward indefinitely. House-property loss inter-head set-off capped at ₹2L/year.</p>
    </div>
  );
}

// ── #20 ITR Pre-Fill Pack ────────────────────────────────────────────────────────
function ItrPrefillPack() {
  const { store } = useApp();
  const fc = formatCurrency;
  const txns = store.transactions ?? [];
  const revenue = txns.filter(t => t.category === "revenue" || (t.amount > 0)).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const expenses = txns.filter(t => t.category === "expense" || t.category === "payroll" || (t.amount < 0)).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const netProfit = revenue - expenses;

  const [entity, setEntity] = useState<"individual" | "huf" | "firm" | "company">("firm");
  const FORM_FOR: Record<string, string> = { individual: "ITR-3 / ITR-4", huf: "ITR-3 / ITR-4", firm: "ITR-5", company: "ITR-6" };

  const lines = [
    { section: "Sch BP — Business & Profession", items: [
      { label: "Gross revenue / turnover", value: revenue },
      { label: "Total expenses debited to P&L", value: -expenses },
      { label: "Net profit before adjustments", value: netProfit },
    ]},
    { section: "Part B-TI — Total Income", items: [
      { label: "Income from business / profession", value: Math.max(0, netProfit) },
      { label: "Gross total income (PGBP only)", value: Math.max(0, netProfit) },
    ]},
    { section: "Sch BS — Balance Sheet (cross-check)", items: [
      { label: "Use Balance Sheet module for assets/liabilities", value: 0 },
    ]},
  ];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FilePlus2 size={14} className="text-[var(--color-primary)]" /> ITR Pre-Fill Pack</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Assembles the key ITR line items (Sch BP / Part B-TI) from your live P&amp;L so your CA can transcribe straight into the return. Pick the entity to see the applicable form.</p>
        <div className="flex flex-wrap gap-2">
          {(["individual", "huf", "firm", "company"] as const).map(e => (
            <button key={e} onClick={() => setEntity(e)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border capitalize transition-colors ${entity === e ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {e}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-3">Applicable form: <span className="font-semibold text-[var(--color-primary)]">{FORM_FOR[entity]}</span></p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Turnover", value: fc(revenue), color: "text-blue-400" },
          { label: "Total expenses", value: fc(expenses), color: "text-orange-400" },
          { label: "Net profit (PGBP)", value: fc(netProfit), color: netProfit >= 0 ? "text-green-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {lines.map(grp => (
        <div key={grp.section} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs font-semibold mb-2">{grp.section}</p>
          <div className="space-y-2">
            {grp.items.map(it => (
              <div key={it.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-[var(--color-muted)]">{it.label}</span>
                <span className="tabular-nums text-xs">{it.value === 0 ? "—" : it.value < 0 ? `(${fc(Math.abs(it.value))})` : fc(it.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-[var(--color-muted)]">Pre-fill is indicative — book-to-tax adjustments (disallowances u/s 40/43B, depreciation per IT Act, MAT) must be applied before filing. Reconcile with 26AS/AIS and the Balance Sheet module. Your CA finalises the return.</p>
    </div>
  );
}

// ── #21 Form 15CA/15CB Helper (foreign remittance TDS) ───────────────────────────
function Form15CAHelper() {
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("Import of goods");
  const [taxable, setTaxable] = useState(true);
  const [dtaaRate, setDtaaRate] = useState("");
  const fc = formatCurrency;
  const amt = parseFloat(amount) || 0;
  const annualThreshold = 500000; // ₹5 lakh aggregate in FY

  // Part determination per Rule 37BB
  let part: string; let needs15CB: boolean; let detail: string;
  if (!taxable) {
    part = "Part D"; needs15CB = false; detail = "Remittance not chargeable to tax (e.g. certain imports) — no 15CB; Part D only.";
  } else if (amt <= annualThreshold) {
    part = "Part A"; needs15CB = false; detail = "Taxable but aggregate ≤ ₹5L in the FY — Part A, no CA certificate needed.";
  } else {
    part = "Part C"; needs15CB = true; detail = "Taxable and > ₹5L — Part C requires a CA's Form 15CB certificate.";
  }

  const rate = parseFloat(dtaaRate) || 0;
  const tds = taxable ? Math.round(amt * rate / 100) : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Globe size={14} className="text-[var(--color-primary)]" /> Form 15CA / 15CB Helper</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Determines which part of Form 15CA applies to a foreign remittance and whether a CA's 15CB certificate is needed (Rule 37BB). Apply DTAA-beneficial rate where a TRC is on file.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Remittance amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 800000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purpose</label>
            <select value={purpose} onChange={e => setPurpose(e.target.value)} className={INP}>
              {["Import of goods", "Royalty / fees for technical services", "Interest", "Dividend", "Software / IT services", "Professional fees", "Other"].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Withholding / DTAA rate %</label>
            <input type="number" value={dtaaRate} onChange={e => setDtaaRate(e.target.value)} placeholder="e.g. 10" className={INP} />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer md:mt-6">
            <input type="checkbox" checked={taxable} onChange={e => setTaxable(e.target.checked)} className="accent-[var(--color-primary)]" />
            Remittance is chargeable to tax in India
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Form 15CA part", value: part, color: "text-[var(--color-primary)]" },
          { label: "15CB (CA cert.)", value: needs15CB ? "Required" : "Not required", color: needs15CB ? "text-orange-400" : "text-green-400" },
          { label: "TDS / withholding (Sec 195)", value: fc(tds), color: tds > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-lg p-4 border ${needs15CB ? "border-orange-800/40 bg-orange-950/20" : "border-green-800/40 bg-green-950/20"}`}>
        <p className={`text-sm font-bold ${needs15CB ? "text-orange-400" : "text-green-400"}`}>{part} — {detail}</p>
        <p className="text-[11px] text-[var(--color-muted)] mt-1">Purpose: {purpose}. File 15CA online before remitting; the bank requires the acknowledgement.</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold mb-2">Form 15CA Parts (Rule 37BB)</p>
        <ul className="space-y-1.5 text-xs text-[var(--color-muted)]">
          <li><span className="text-[var(--color-text)] font-medium">Part A</span> — taxable remittance, aggregate ≤ ₹5L in FY. No 15CB.</li>
          <li><span className="text-[var(--color-text)] font-medium">Part B</span> — &gt; ₹5L where AO order/certificate u/s 195(2)/197 obtained.</li>
          <li><span className="text-[var(--color-text)] font-medium">Part C</span> — &gt; ₹5L taxable; CA's Form 15CB mandatory.</li>
          <li><span className="text-[var(--color-text)] font-medium">Part D</span> — not chargeable to tax (per the specified list of 33 items).</li>
        </ul>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Sec 195 governs TDS on payments to non-residents. Grossing-up may apply if tax is borne by the remitter. Keep the Tax Residency Certificate (TRC) and Form 10F for DTAA benefit. CA to certify 15CB.</p>
    </div>
  );
}

// ── #22 Section 80 Deduction Maximiser (entity) ──────────────────────────────────
function Sec80Maximiser() {
  const [d80g, setD80g] = useState("");
  const [d80gPct, setD80gPct] = useState<50 | 100>(50);
  const [newEmpWages, setNewEmpWages] = useState("");
  const [d35ad, setD35ad] = useState("");
  const fc = formatCurrency;

  const donation = parseFloat(d80g) || 0;
  const ded80g = Math.round(donation * d80gPct / 100);
  // 80JJAA — 30% of additional employee cost, for 3 years
  const addlWages = parseFloat(newEmpWages) || 0;
  const ded80jjaa = Math.round(addlWages * 0.30);
  // 35AD — 100% capital expenditure deduction for specified businesses
  const ded35ad = parseFloat(d35ad) || 0;
  const totalDed = ded80g + ded80jjaa + ded35ad;
  const taxSaved = Math.round(totalDed * 0.25); // assumed 25% corporate rate

  const ITEMS = [
    { key: "80G", title: "80G — Donations", detail: "50% or 100% of eligible donations to notified funds/institutions (subject to 10% of GTI limit for some)." },
    { key: "80JJAA", title: "80JJAA — New Employment", detail: "30% of additional employee cost (wages ≤ ₹25k/month) deductible for 3 assessment years." },
    { key: "35AD", title: "35AD — Capital Expenditure", detail: "100% deduction of capex for specified businesses (cold chain, warehousing, hospitals, etc.)." },
  ];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><PiggyBank size={14} className="text-[var(--color-primary)]" /> Section 80 Deduction Maximiser (Entity)</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Beyond personal 80C — entity-level deductions: 80G donations, 80JJAA new-employment incentive (30% of additional wages × 3 yrs) and 35AD capex. Note: not available under the new concessional regimes 115BAA/115BAB.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">80G donations (₹)</label>
            <input type="number" value={d80g} onChange={e => setD80g(e.target.value)} placeholder="e.g. 200000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">80G eligibility</label>
            <div className="flex gap-2">
              {([50, 100] as const).map(p => (
                <button key={p} onClick={() => setD80gPct(p)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${d80gPct === p ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                  {p}% deduction
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">80JJAA — additional employee wages (₹/yr)</label>
            <input type="number" value={newEmpWages} onChange={e => setNewEmpWages(e.target.value)} placeholder="e.g. 1200000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">35AD — specified-business capex (₹)</label>
            <input type="number" value={d35ad} onChange={e => setD35ad(e.target.value)} placeholder="e.g. 5000000" className={INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "80G deduction", value: fc(ded80g), color: "text-blue-400" },
          { label: "80JJAA (30%)", value: fc(ded80jjaa), color: "text-blue-400" },
          { label: "35AD capex", value: fc(ded35ad), color: "text-blue-400" },
          { label: "Est. tax saved @25%", value: fc(taxSaved), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
        <p className="text-sm font-bold text-green-400">Total entity deductions: {fc(totalDed)} → estimated tax saving {fc(taxSaved)} (at 25% corporate rate).</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {ITEMS.map(i => (
            <div key={i.key} className="bg-[var(--color-accent)] rounded-lg p-3">
              <p className="font-semibold text-[var(--color-primary)] mb-1">{i.title}</p>
              <p className="text-[var(--color-muted)]">{i.detail}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Chapter VI-A deductions (except 80JJAA) are forfeited if the company opts for 115BAA/115BAB. 80G needs the institution's 80G registration + donation receipt. 80JJAA requires Form 10DA from a CA. Verify eligibility with your CA.</p>
    </div>
  );
}

// ── #23 Equalisation Levy / TDS-194O Tracker ─────────────────────────────────────
type ElRow = { id: string; party: string; type: "el-ads" | "el-ecom" | "194o"; amount: number; date: string };
function EqualisationLevyTracker() {
  const [rows, setRows] = useFeatureState<ElRow[]>("eq-levy-rows", []);
  const [party, setParty] = useState("");
  const [type, setType] = useState<ElRow["type"]>("194o");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const fc = formatCurrency;

  const RATES: Record<ElRow["type"], { label: string; rate: number; desc: string }> = {
    "el-ads":  { label: "Equalisation Levy — online ads (6%)", rate: 6, desc: "On payments > ₹1L/yr to a non-resident for online advertising (Sec 165)." },
    "el-ecom": { label: "EL — e-commerce supply (2%)",         rate: 2, desc: "On consideration to non-resident e-commerce operators (Sec 165A) — withdrawn w.e.f. 1 Aug 2024." },
    "194o":    { label: "TDS 194O — e-commerce participant (1%)", rate: 1, desc: "Operator deducts 1% on gross sales of resident participants." },
  };

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (!party || amt <= 0) { toast.error("Enter party and amount"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), party, type, amount: amt, date }]);
    setParty(""); setAmount("");
  };

  const levyOf = (r: ElRow) => Math.round(r.amount * RATES[r.type].rate / 100);
  const total = rows.reduce((s, r) => s + levyOf(r), 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ShoppingCart size={14} className="text-[var(--color-primary)]" /> Equalisation Levy / TDS-194O Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track the 6% EL on online advertising to non-residents and the 1% TDS u/s 194O for e-commerce operators. (The 2% e-commerce EL stands withdrawn from 1 Aug 2024 — retained here for prior-period entries.)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <input value={party} onChange={e => setParty(e.target.value)} placeholder="Payee / participant *" className={INP} />
          <select value={type} onChange={e => setType(e.target.value as ElRow["type"])} className={INP}>
            {(Object.keys(RATES) as ElRow["type"][]).map(k => <option key={k} value={k}>{RATES[k].label}</option>)}
          </select>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹) *" className={INP} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
        </div>
        <p className="text-[11px] text-[var(--color-muted)] mb-3">{RATES[type].desc}</p>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add entry</button>
      </div>

      {rows.length > 0 && <>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Total levy / TDS payable</p>
          <p className="text-xl font-bold tabular-nums text-orange-400">{fc(total)}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Party", "Type", "Amount", "Rate", "Levy/TDS", "Date", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{r.party}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] max-w-[180px] truncate">{RATES[r.type].label}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.amount)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{RATES[r.type].rate}%</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-orange-400">{fc(levyOf(r))}</td>
                  <td className="px-3 py-2.5 text-xs">{r.date}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">EL on ads (6%): deposit by the 7th of next month, file Form 1 annually by 30 Jun. 194O TDS: deposit by 7th, report in 26Q. Failure to deduct EL disallows the expense u/s 40(a). Consult your CA.</p>
    </div>
  );
}

// ── #24 Advance Tax vs TDS Cash-Flow Calendar ────────────────────────────────────
function AdvTaxCashCalendar() {
  const { store } = useApp();
  const fc = formatCurrency;
  const autoLiability = useMemo(() => {
    const txns = store.transactions ?? [];
    const months = Math.max(txns.length / 30, 1);
    const rev = txns.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const cost = txns.filter(t => t.category === "expense" || t.category === "payroll").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    return Math.max(0, Math.round(((rev - cost) / months) * 12 * 0.25));
  }, [store.transactions]);

  const [liabilityInput, setLiabilityInput] = useState("");
  const [tdsCreditInput, setTdsCreditInput] = useState("");
  const liability = parseFloat(liabilityInput) || autoLiability;
  const tdsCredit = parseFloat(tdsCreditInput) || 0;
  const netLiability = Math.max(0, liability - tdsCredit); // advance tax payable net of TDS

  const SCHEDULE = [
    { label: "1st instalment", due: "15 Jun", cumPct: 15 },
    { label: "2nd instalment", due: "15 Sep", cumPct: 45 },
    { label: "3rd instalment", due: "15 Dec", cumPct: 75 },
    { label: "Final instalment", due: "15 Mar", cumPct: 100 },
  ];
  const rows = SCHEDULE.map((s, i) => {
    const cum = Math.round(netLiability * s.cumPct / 100);
    const prevCum = i === 0 ? 0 : Math.round(netLiability * SCHEDULE[i - 1].cumPct / 100);
    return { ...s, cum, instalment: cum - prevCum };
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Advance Tax vs TDS Cash-Flow Calendar</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Nets TDS already deducted on your receipts against the advance-tax liability and lays out the cash outgo by due date — so you can plan runway around 15 Jun / Sep / Dec / Mar.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Estimated annual tax liability (₹)</label>
            <input type="number" value={liabilityInput} onChange={e => setLiabilityInput(e.target.value)} placeholder={`Auto: ${fc(autoLiability)}`} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">TDS credit expected (₹)</label>
            <input type="number" value={tdsCreditInput} onChange={e => setTdsCreditInput(e.target.value)} placeholder="e.g. 50000" className={INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Gross liability", value: fc(liability), color: "text-[var(--color-text)]" },
          { label: "Less: TDS credit", value: fc(tdsCredit), color: "text-green-400" },
          { label: "Advance tax payable", value: fc(netLiability), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Due date", "Instalment", "Cum %", "Pay this date", "Cumulative"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 font-medium">{r.due}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.cumPct}%</td>
                <td className="px-4 py-2.5 tabular-nums font-semibold text-orange-400">{fc(r.instalment)}</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(r.cum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Advance tax is computed net of TDS (Sec 209). If net liability ≤ ₹10,000, advance tax is not mandatory. Use the Advance Tax tab for 234B/234C interest on shortfalls. Overlay these dates on your Forecast runway.</p>
    </div>
  );
}

// ── #25 Tax Notice / Demand (143(1)) Responder ───────────────────────────────────
type NoticeRow = { id: string; refNo: string; ay: string; type: string; demand: number; dueDate: string; status: "open" | "responded" | "closed" };
function TaxNoticeResponder() {
  const [rows, setRows] = useFeatureState<NoticeRow[]>("tax-notice-rows", []);
  const [refNo, setRefNo] = useState("");
  const [ay, setAy] = useState("");
  const [type, setType] = useState("143(1) Intimation");
  const [demand, setDemand] = useState("");
  const [dueDate, setDueDate] = useState("");
  const fc = formatCurrency;
  const today = new Date().toISOString().split("T")[0];

  const NOTICE_TYPES: Record<string, string> = {
    "143(1) Intimation": "Adjustment/processing intimation. If you agree, pay; else file rectification u/s 154 or online disagreement within 30 days.",
    "139(9) Defective": "Return treated as defective. Respond/revise within 15 days or the return becomes invalid.",
    "143(2) Scrutiny": "Case selected for scrutiny. Submit details/documents online by the date specified.",
    "148 Reassessment": "Income escaping assessment. File return in response and seek reasons recorded.",
    "245 Adjustment": "Refund proposed to be adjusted against demand. Respond within 30 days to agree/disagree.",
    "156 Demand": "Notice of demand. Pay within 30 days or file stay/appeal (CIT-A within 30 days).",
  };

  const add = () => {
    if (!refNo) { toast.error("Enter notice reference number"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), refNo, ay: ay || "AY 2024-25", type, demand: parseFloat(demand) || 0, dueDate, status: "open" }]);
    setRefNo(""); setAy(""); setDemand(""); setDueDate("");
    toast.success("Notice logged — track the response deadline");
  };

  const cycle = (s: NoticeRow["status"]): NoticeRow["status"] => s === "open" ? "responded" : s === "responded" ? "closed" : "open";
  const totalDemand = rows.filter(r => r.status !== "closed").reduce((s, r) => s + r.demand, 0);
  const overdue = rows.filter(r => r.status === "open" && r.dueDate && r.dueDate < today).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Gavel size={14} className="text-[var(--color-primary)]" /> Tax Notice / Demand Responder</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Log income-tax notices (143(1), 139(9), 143(2), 148, 156…), track the response deadline and outstanding demand, and see the recommended action for each notice type.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Notice / DIN ref no. *" className={INP} />
          <input value={ay} onChange={e => setAy(e.target.value)} placeholder="AY (e.g. AY 2024-25)" className={INP} />
          <select value={type} onChange={e => setType(e.target.value)} className={INP}>
            {Object.keys(NOTICE_TYPES).map(t => <option key={t}>{t}</option>)}
          </select>
          <input type="number" value={demand} onChange={e => setDemand(e.target.value)} placeholder="Demand amount (₹)" className={INP} />
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INP} />
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Log notice</button>
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">Action for {type}: <span className="text-[var(--color-text)]">{NOTICE_TYPES[type]}</span></p>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Open demand", value: fc(totalDemand), color: totalDemand > 0 ? "text-red-400" : "text-green-400" },
            { label: "Open notices", value: String(rows.filter(r => r.status === "open").length), color: "text-orange-400" },
            { label: "Overdue responses", value: String(overdue), color: overdue > 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Ref no.", "AY", "Type", "Demand", "Due", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const isOverdue = r.status === "open" && !!r.dueDate && r.dueDate < today;
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.refNo}</td>
                    <td className="px-3 py-2.5 text-xs">{r.ay}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] max-w-[150px] truncate">{r.type}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-red-400">{r.demand > 0 ? fc(r.demand) : "—"}</td>
                    <td className={`px-3 py-2.5 text-xs ${isOverdue ? "text-red-400 font-semibold" : ""}`}>{r.dueDate || "—"}{isOverdue ? " ⚠" : ""}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: cycle(x.status) } : x))}
                        className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${r.status === "closed" ? "bg-green-900/30 text-green-400 border-green-800/40" : r.status === "responded" ? "bg-blue-900/30 text-blue-400 border-blue-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                        {r.status}
                      </button>
                    </td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Most notices carry a 15–30 day response window from the date of the notice. Rectification u/s 154 corrects mistakes apparent from record; appeal to CIT(A) within 30 days of a demand. Always respond via the e-filing portal e-Proceedings and keep the DIN. Consult your CA.</p>
    </div>
  );
}
