import { useMemo, useState, useEffect } from "react";
import { useT } from "@/i18n";
import { useFeatureState } from "@/hooks/useFeatureState";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import AiInsight from "@/components/ai/AiInsight";
import { formatCurrency } from "@/lib/utils";
import {
  ShieldCheck, AlertTriangle, Calendar, CheckCircle2, ChevronRight,
  TrendingUp, FileText, Plus, ArrowRight, Calculator, Scale, Clock,
  Receipt, FileSearch, Search, FileCheck, Layers, Repeat,
  FilePlus2, Globe, PiggyBank, ShoppingCart, CalendarClock, Gavel,
  Home, Building2, Percent, Truck, Umbrella, Heart, Coins, Banknote,
  Landmark, Users, UserPlus, Gift, Wallet,
  HandCoins, BadgePercent, GitCompare, Sigma,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays, startOfYear } from "date-fns";
import DataFreshnessBadge from "@/components/DataFreshnessBadge";

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
    deadlines.push({ label: "Advance Tax", desc: `${installment} instalment - ${pct}% of annual liability`, date: d, type: "advance_tax", installment, pct });
  });

  // GSTR-3B: 20th of each month for next 4 months
  for (let i = 0; i < 4; i++) {
    const base = new Date(today.getFullYear(), today.getMonth() + i, 20);
    if (base > today) {
      deadlines.push({ label: "GSTR-3B", desc: `Monthly GST return - ${format(base, "MMMM yyyy")}`, date: base, type: "gstr3b" });
    }
  }

  // TDS deposit: 7th of each month
  for (let i = 0; i < 3; i++) {
    const base = new Date(today.getFullYear(), today.getMonth() + i, 7);
    if (base > today) {
      deadlines.push({ label: "TDS Deposit", desc: `Tax deducted at source - ${format(base, "MMMM yyyy")}`, date: base, type: "tds" });
    }
  }

  // ITR filing: Jul 31 (current year's FY filing)
  const itr = new Date(year, 6, 31);
  if (itr >= today) deadlines.push({ label: "ITR Filing", desc: `Income Tax Return - FY ${year - 1}-${String(year).slice(2)}`, date: itr, type: "itr" });

  return deadlines.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 10);
}

export default function TaxPage() {
  const tr = useT();
  const { store, addObligation } = useApp();
  const { transactions, firm } = store;
  const navigate = useNavigate();
  const today = new Date();
  const [pushed, setPushed] = useState<Set<string>>(new Set());
  const [taxTab, setTaxTab] = useState<"overview" | "44ad" | "cg" | "audit" | "tcs" | "mat" | "angel" | "regime" | "advtax"
    | "tds-return" | "form26as" | "tds-finder" | "ldc-197" | "depreciation" | "loss-setoff"
    | "itr-prefill" | "form15ca" | "sec80" | "eq-levy" | "advtax-calendar" | "tax-notice"
    | "hra" | "house-prop" | "44ae" | "gratuity" | "relief-89" | "donation-80g" | "cg-exempt" | "interest-234"
    | "115ba" | "partner-remun" | "80jjaa" | "esop-tax" | "buyback"
    | "194n" | "43bh" | "presumptive-cmp" | "surcharge" | "tax-depth">("overview");
  const [aaScheme,   setAaScheme]   = useState<"44ad" | "44ada">("44ad");
  const [aaTurnover, setAaTurnover] = useState("");
  const [aaDigital,  setAaDigital]  = useState(false);
  // Capital Gains state
  const [cgAsset,      setCgAsset]      = useState<"equity" | "debt" | "property">("equity");
  const [cgBuy,        setCgBuy]        = useState("");
  const [cgSell,       setCgSell]       = useState("");
  const [cgHoldMonths, setCgHoldMonths] = useState("");
  const [cgSlabRate,   setCgSlabRate]   = useState(30); // slab rate for debt gains (taxed at slab post-Apr 2023)

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
    if (amount <= 0) { toast.error("No liability estimated yet - add transactions first"); return; }
    addObligation({ id: crypto.randomUUID(), name: `${d.label} - ${d.installment ?? format(d.date, "MMM")}`, amount, dueDate: d.date.toISOString().split("T")[0], type: "tax" });
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
            <ShieldCheck size={18} className="text-[var(--color-primary)]" /> {tr("tax.title")}
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{tr("tax.subtitle")}</p>
        </div>
        <div className="flex gap-1 flex-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {([["overview", tr("tax.tab.overview"), ShieldCheck], ["regime", tr("tax.tab.regime"), Scale], ["advtax", tr("tax.tab.advtax"), Clock], ["44ad", tr("tax.tab.presumptive44ad"), Calculator], ["cg", tr("tax.tab.capitalGains"), TrendingUp], ["audit", tr("tax.tab.audit44ab"), AlertTriangle], ["tcs", tr("tax.tab.tcsTracker"), FileText], ["mat", tr("tax.tab.matCheck"), AlertTriangle], ["angel", "Angel Tax", AlertTriangle],
            ["tds-return", "TDS Return (24Q/26Q)", Receipt], ["form26as", "26AS / AIS Recon", FileSearch], ["tds-finder", "TDS Section Finder", Search], ["ldc-197", "Lower-Deduction (197)", FileCheck], ["depreciation", "Depreciation Schedule", Layers], ["loss-setoff", "Loss Set-off & C/F", Repeat], ["itr-prefill", "ITR Pre-Fill Pack", FilePlus2], ["form15ca", "Form 15CA/CB", Globe], ["sec80", "Sec 80 Maximiser", PiggyBank], ["eq-levy", "Equalisation Levy / 194O", ShoppingCart], ["advtax-calendar", "Adv. Tax Calendar", CalendarClock], ["tax-notice", "Notice / Demand 143(1)", Gavel],
            ["hra", "HRA Exemption 10(13A)", Home], ["house-prop", "House Property 24(b)", Building2], ["44ae", "Presumptive 44AE (Transport)", Truck], ["gratuity", "Gratuity / Leave Encash", Umbrella], ["relief-89", "Arrears Relief 89(1)", Banknote], ["donation-80g", "Donations 80G", Heart], ["cg-exempt", "CG Exemption 54/54EC/54F", Coins], ["interest-234", "Interest 234A/B/C", Percent],
            ["115ba", "Corporate Rate 115BAA/BAB", Landmark], ["partner-remun", "Partner Remuneration 40(b)", Users], ["80jjaa", "New-Employee 80JJAA", UserPlus], ["esop-tax", "ESOP Tax", Gift], ["buyback", "Share Buyback 115QA", Wallet],
            ["194n", "Cash Withdrawal 194N", HandCoins], ["43bh", "MSME 43B(h) Disallowance", BadgePercent], ["presumptive-cmp", "Presumptive vs Books", GitCompare], ["surcharge", "Surcharge & Marginal Relief", Sigma], ["tax-depth", "Tax Depth (server)", Percent]] as const).map(([id, label, Icon]) => (
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
        // Section 87A rebate (new regime): full rebate if taxable income ≤ ₹7L
        if (netTaxable <= 700000) slabTax = 0;
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
              <p className="text-xs text-[var(--color-muted)] mb-4">Section 44AD (businesses) and 44ADA (professionals) let eligible assessees declare income as a % of turnover - no books required.</p>

              <div className="space-y-3">
                <div className="flex gap-2">
                  {(["44ad", "44ada"] as const).map(s => (
                    <button key={s} onClick={() => setAaScheme(s)}
                      className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-all ${aaScheme === s ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                      {s === "44ad" ? "Sec 44AD - Business" : "Sec 44ADA - Profession"}
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
                    <p className="text-xs text-red-300">Turnover exceeds the {aaScheme === "44ad" ? "₹3 crore" : "₹75 lakh"} limit - presumptive scheme not available. Tax audit (44AB) mandatory.</p>
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
        // Debt MF/bonds (post-Apr 2023) are taxed at the assessee's slab rate, not a fixed rate.
        const rate = cgAsset === "debt"
          ? (Number.isFinite(cgSlabRate) ? cgSlabRate : 30)
          : (isLtcg ? rates.ltcg : rates.stcg);
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
                {cgAsset === "debt" && (
                  <div>
                    <label className="block text-xs text-[var(--color-muted)] mb-1">Your income-tax slab rate (debt gains taxed at slab)</label>
                    <select value={cgSlabRate} onChange={e => setCgSlabRate(parseInt(e.target.value) || 0)}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]">
                      {[0, 5, 10, 15, 20, 30].map(r => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </select>
                  </div>
                )}
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
                    {isLtcg ? "LTCG" : "STCG"} - {months}mo holding
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
                  <p className="text-xs text-green-400 mt-3 pt-2 border-t border-[var(--color-border)]">Capital loss of {formatCurrency(Math.abs(gain))} - can be set off against capital gains of the same year (STCL vs LTCL rules apply). Carry forward for 8 years.</p>
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
            sub: `${format(startOfYear(today), "d MMM")} - today`,
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
            value: nextDeadline ? `${nextDays}d` : "-",
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

      <AiInsight
        collapsed
        title="✨ AI insight"
        question="Based on my YTD P&L and computed tax position, what are my upcoming liabilities and what should I set aside or act on now? Flag the nearest deadline and any advance-tax / TDS / GST instalment that needs cash."
        context={{
          ytd: { revenue: ytdRevenue, expenses: ytdExpenses, profit: ytdProfit, from: format(startOfYear(today), "yyyy-MM-dd") },
          annualTaxEstimate: annualTaxEst,
          effectiveRate,
          advanceTaxInstalments: installmentDue,
          tdsThisMonth: { estimate: tdsEst, base: tdsBase },
          gst: { registered: firm?.gstRegistered ?? false, rate: gstRate, liabilityLastMonth: gstLiability },
          nextDeadline: nextDeadline ? { label: nextDeadline.label, desc: nextDeadline.desc, date: nextDeadline.date.toISOString().split("T")[0], inDays: nextDays } : null,
          upcomingDeadlines: deadlines.map(d => ({ label: d.label, date: d.date.toISOString().split("T")[0], type: d.type })),
        }}
      />

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
              <h2 className="text-sm font-semibold mb-1">Tax Audit Threshold - Sec 44AB</h2>
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
                  <label className="block text-xs text-[var(--color-muted)] mb-1">Annual turnover / gross receipts (₹) - auto-filled from transactions</label>
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
              <h3 className="text-sm font-semibold mb-3">Quick Reference - 44AB Thresholds</h3>
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
              <h2 className="text-sm font-semibold mb-1">TCS Tracker - Tax Collected at Source</h2>
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
      {taxTab === "hra"             && <HraExemptionCalc />}
      {taxTab === "house-prop"      && <HousePropertyCalc />}
      {taxTab === "44ae"            && <Presumptive44AE />}
      {taxTab === "gratuity"        && <GratuityLeaveExemption />}
      {taxTab === "relief-89"       && <Relief89Calc />}
      {taxTab === "donation-80g"    && <Donation80GCalc />}
      {taxTab === "cg-exempt"       && <CapitalGainExemptionPlanner />}
      {taxTab === "interest-234"    && <Interest234Calc />}
      {taxTab === "115ba"           && <CorporateRate115BA />}
      {taxTab === "partner-remun"   && <PartnerRemuneration40b />}
      {taxTab === "80jjaa"          && <NewEmployee80JJAA />}
      {taxTab === "esop-tax"        && <EsopTaxPlanner />}
      {taxTab === "buyback"         && <BuybackTax115QA />}
      {taxTab === "194n"            && <CashWithdrawal194N />}
      {taxTab === "43bh"            && <Msme43BhChecker />}
      {taxTab === "presumptive-cmp" && <PresumptiveVsBooks />}
      {taxTab === "surcharge"       && <SurchargeMarginalRelief />}
      {taxTab === "tax-depth"       && <TaxDepthServer />}
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
            ? `⚠ MAT applies - pay ${entityType === "company" ? "MAT" : "AMT"} of ${fc(matLiability)} (higher than normal tax ${fc(normalTax)}). MAT credit ${fc(matCredit)} can be carried forward 15 years.`
            : `✓ Normal tax applies - ${entityType === "company" ? "MAT" : "AMT"} of ${fc(matLiability)} is lower than normal tax ${fc(normalTax)}. No MAT credit arises.`}
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
      <p className="text-[10px] text-[var(--color-muted)]">MAT: Sec 115JB - companies pay higher of normal tax or 15% of adjusted book profit. AMT: Sec 115JC - LLPs/individuals claiming profit-linked deductions. MAT credit under Sec 115JAA. Consult CA for full computation.</p>
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
            ? `✓ Exempt from Angel Tax - ${dpiitReg ? "DPIIT recognition" : aifCat1 ? "Cat-I/II AIF exemption" : "Foreign investor (FEMA route)"}`
            : excessPremium > 0
              ? `⚠ Angel Tax applies - ${fc(excessPremium)} excess premium is taxable as 'Income from Other Sources' in the company's hands`
              : "✓ No excess premium - issue price ≤ FMV. No angel tax liability."}
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
          { label: "Tax - New Regime", value: fc(newTotal), color: cheaper === "New" ? "text-green-400" : "text-[var(--color-text)]" },
          { label: "Tax - Old Regime", value: fc(oldTotal), color: cheaper === "Old" ? "text-green-400" : "text-[var(--color-text)]" },
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
    { label: "1st - 15 Jun", pct: 15, months: 3 },
    { label: "2nd - 15 Sep", pct: 45, months: 3 },
    { label: "3rd - 15 Dec", pct: 75, months: 3 },
    { label: "4th - 15 Mar", pct: 100, months: 1 },
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
        {!applicable && <p className="text-xs text-green-400">Liability ≤ ₹10,000 - advance tax is not mandatory (Sec 208).</p>}
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
                <td className="px-4 py-2.5 tabular-nums text-red-400">{r.shortfall > 0 ? fc(r.shortfall) : "-"}</td>
                <td className="px-4 py-2.5 tabular-nums text-orange-400">{r.interest234C > 0 ? fc(r.interest234C) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {below90 && applicable && (
        <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20">
          <p className="text-sm font-bold text-orange-400"><DataFreshnessBadge kind="indicative" className="mr-1.5" />⚠ Less than 90% paid - Sec 234B interest of ~{fc(interest234B)} applies (1%/month on shortfall from 1 April, indicative).</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Sec 234C: 1% per month on installment shortfall (×3 months for Jun/Sep/Dec, ×1 for Mar). Sec 234B: 1% per month if &lt; 90% paid by year-end. Presumptive 44AD/44ADA taxpayers may pay 100% by 15 Mar. Indicative - consult a CA.</p>
    </div>
  );
}

// Shared input class (matches existing `inp` pattern across this file)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

// TDS section master - section / rate / threshold / payee logic (FY 2024-25)
type TdsSection = {
  section: string; nature: string; rate: number; rateNonPan: number;
  threshold: number; form: "24Q" | "26Q" | "27Q"; note?: string;
};
const TDS_SECTIONS: TdsSection[] = [
  { section: "192",   nature: "Salary",                              rate: 0,   rateNonPan: 0,  threshold: 0,        form: "24Q", note: "As per slab - projected via payroll 192" },
  { section: "194A",  nature: "Interest (other than securities)",    rate: 10,  rateNonPan: 20, threshold: 40000,    form: "26Q" },
  { section: "194C",  nature: "Contractor - individual/HUF",         rate: 1,   rateNonPan: 20, threshold: 30000,    form: "26Q", note: "₹1L aggregate p.a. limit also applies" },
  { section: "194C2", nature: "Contractor - company/firm",           rate: 2,   rateNonPan: 20, threshold: 30000,    form: "26Q" },
  { section: "194H",  nature: "Commission / brokerage",              rate: 5,   rateNonPan: 20, threshold: 15000,    form: "26Q" },
  { section: "194I-L",nature: "Rent - land/building/furniture",      rate: 10,  rateNonPan: 20, threshold: 240000,   form: "26Q" },
  { section: "194I-P",nature: "Rent - plant/machinery/equipment",    rate: 2,   rateNonPan: 20, threshold: 240000,   form: "26Q" },
  { section: "194J-P",nature: "Professional fees / royalty",         rate: 10,  rateNonPan: 20, threshold: 30000,    form: "26Q" },
  { section: "194J-T",nature: "Technical services / call-centre",    rate: 2,   rateNonPan: 20, threshold: 30000,    form: "26Q" },
  { section: "194Q",  nature: "Purchase of goods > ₹50L",            rate: 0.1, rateNonPan: 5,  threshold: 5000000,  form: "26Q", note: "Buyer turnover > ₹10 Cr; on value above ₹50L" },
  { section: "194O",  nature: "E-commerce participant payments",     rate: 1,   rateNonPan: 5,  threshold: 500000,   form: "26Q", note: "Operator deducts on gross sales (₹5L limit for individuals)" },
  { section: "206C1H",nature: "TCS - sale of goods > ₹50L",          rate: 0.1, rateNonPan: 1,  threshold: 5000000,  form: "27Q", note: "Collected by seller (turnover > ₹10 Cr)" },
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
            {TDS_SECTIONS.filter(s => s.section !== "192").map(s => <option key={s.section} value={s.section}>{s.section} - {s.nature}</option>)}
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
    if (diff < 0) return { label: "Short in 26AS - chase deductor", cls: "bg-red-900/30 text-red-400 border-red-800/40" };
    return { label: "Extra in 26AS - claim it", cls: "bg-blue-900/30 text-blue-400 border-blue-800/40" };
  };

  const totalBooks = rows.reduce((s, r) => s + r.booksTds, 0);
  const total26 = rows.reduce((s, r) => s + r.as26Tds, 0);
  const claimable = Math.min(totalBooks, total26);
  const atRisk = Math.max(0, totalBooks - total26);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileSearch size={14} className="text-[var(--color-primary)]" /> Form 26AS / AIS Reconciliation</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Match TDS credit per your books against what the deductor reported in 26AS / AIS. Only TDS appearing in 26AS can be claimed in the ITR - chase mismatches before filing.</p>
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
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${diff < 0 ? "text-red-400" : diff > 0 ? "text-blue-400" : "text-green-400"}`}>{diff === 0 ? "-" : fc(diff)}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${v.cls}`}>{v.label}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Download 26AS from TRACES and AIS from the e-filing portal. A short credit in 26AS usually means the deductor hasn't filed/deposited - file a grievance or get a revised TDS return from them. Reconcile before the 31 Jul / 31 Oct ITR due date.</p>
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Pick the nature of payment to get the correct section, rate and threshold - including 194Q (0.1%), 194C (1/2%), 194J (10/2%), 194I (10/2%) and 206C.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Nature of payment</label>
            <select value={secId} onChange={e => setSecId(e.target.value)} className={INP}>
              {TDS_SECTIONS.map(s => <option key={s.section} value={s.section}>{s.section} - {s.nature}</option>)}
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
          { label: "Threshold", value: sec.threshold === 0 ? "-" : fc(sec.threshold), color: "text-blue-400" },
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
              : `No TDS - amount ${amt < sec.threshold ? `below the ${fc(sec.threshold)} threshold` : "rate not applicable"} for section ${sec.section}.`}
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
                  <td className="px-2 py-1.5 tabular-nums">{s.threshold === 0 ? "-" : fc(s.threshold)}</td>
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Vendors with a Sec 197 certificate get TDS at a reduced rate. Apply the certificate rate only while it is valid - deduct at the normal rate once it expires.</p>
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
                    <td className="px-3 py-2.5 text-xs">{r.validTill || "-"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-blue-400">{fc(appliedTds)} @ {eff}%</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${expired ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{expired ? "Expired - normal rate" : "Valid"}</span></td>
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
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Depreciation Schedule (IT Act - Block of Assets, WDV)</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Written-down-value method by block. Assets put to use for &lt; 180 days in the year get half the normal rate. Companies Act SLM/WDV differs - maintain dual books.</p>
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
    if (!m) return "-";
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
      <p className="text-[10px] text-[var(--color-muted)]">Intra-head set-off first, then inter-head (subject to restrictions - e.g. business loss can't set off salary; LTCL only vs LTCG). Unabsorbed depreciation carries forward indefinitely. House-property loss inter-head set-off capped at ₹2L/year.</p>
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
    { section: "Sch BP - Business & Profession", items: [
      { label: "Gross revenue / turnover", value: revenue },
      { label: "Total expenses debited to P&L", value: -expenses },
      { label: "Net profit before adjustments", value: netProfit },
    ]},
    { section: "Part B-TI - Total Income", items: [
      { label: "Income from business / profession", value: Math.max(0, netProfit) },
      { label: "Gross total income (PGBP only)", value: Math.max(0, netProfit) },
    ]},
    { section: "Sch BS - Balance Sheet (cross-check)", items: [
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
                <span className="tabular-nums text-xs">{it.value === 0 ? "-" : it.value < 0 ? `(${fc(Math.abs(it.value))})` : fc(it.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Pre-fill is indicative - book-to-tax adjustments (disallowances u/s 40/43B, depreciation per IT Act, MAT) must be applied before filing. Reconcile with 26AS/AIS and the Balance Sheet module. Your CA finalises the return.</p>
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
    part = "Part D"; needs15CB = false; detail = "Remittance not chargeable to tax (e.g. certain imports) - no 15CB; Part D only.";
  } else if (amt <= annualThreshold) {
    part = "Part A"; needs15CB = false; detail = "Taxable but aggregate ≤ ₹5L in the FY - Part A, no CA certificate needed.";
  } else {
    part = "Part C"; needs15CB = true; detail = "Taxable and > ₹5L - Part C requires a CA's Form 15CB certificate.";
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
        <p className={`text-sm font-bold ${needs15CB ? "text-orange-400" : "text-green-400"}`}>{part} - {detail}</p>
        <p className="text-[11px] text-[var(--color-muted)] mt-1">Purpose: {purpose}. File 15CA online before remitting; the bank requires the acknowledgement.</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold mb-2">Form 15CA Parts (Rule 37BB)</p>
        <ul className="space-y-1.5 text-xs text-[var(--color-muted)]">
          <li><span className="text-[var(--color-text)] font-medium">Part A</span> - taxable remittance, aggregate ≤ ₹5L in FY. No 15CB.</li>
          <li><span className="text-[var(--color-text)] font-medium">Part B</span> - &gt; ₹5L where AO order/certificate u/s 195(2)/197 obtained.</li>
          <li><span className="text-[var(--color-text)] font-medium">Part C</span> - &gt; ₹5L taxable; CA's Form 15CB mandatory.</li>
          <li><span className="text-[var(--color-text)] font-medium">Part D</span> - not chargeable to tax (per the specified list of 33 items).</li>
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
  // 80JJAA - 30% of additional employee cost, for 3 years
  const addlWages = parseFloat(newEmpWages) || 0;
  const ded80jjaa = Math.round(addlWages * 0.30);
  // 35AD - 100% capital expenditure deduction for specified businesses
  const ded35ad = parseFloat(d35ad) || 0;
  const totalDed = ded80g + ded80jjaa + ded35ad;
  const taxSaved = Math.round(totalDed * 0.25); // assumed 25% corporate rate

  const ITEMS = [
    { key: "80G", title: "80G - Donations", detail: "50% or 100% of eligible donations to notified funds/institutions (subject to 10% of GTI limit for some)." },
    { key: "80JJAA", title: "80JJAA - New Employment", detail: "30% of additional employee cost (wages ≤ ₹25k/month) deductible for 3 assessment years." },
    { key: "35AD", title: "35AD - Capital Expenditure", detail: "100% deduction of capex for specified businesses (cold chain, warehousing, hospitals, etc.)." },
  ];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><PiggyBank size={14} className="text-[var(--color-primary)]" /> Section 80 Deduction Maximiser (Entity)</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Beyond personal 80C - entity-level deductions: 80G donations, 80JJAA new-employment incentive (30% of additional wages × 3 yrs) and 35AD capex. Note: not available under the new concessional regimes 115BAA/115BAB.</p>
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
            <label className="text-xs text-[var(--color-muted)] block mb-1">80JJAA - additional employee wages (₹/yr)</label>
            <input type="number" value={newEmpWages} onChange={e => setNewEmpWages(e.target.value)} placeholder="e.g. 1200000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">35AD - specified-business capex (₹)</label>
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
    "el-ads":  { label: "Equalisation Levy - online ads (6%)", rate: 6, desc: "On payments > ₹1L/yr to a non-resident for online advertising (Sec 165)." },
    "el-ecom": { label: "EL - e-commerce supply (2%)",         rate: 2, desc: "On consideration to non-resident e-commerce operators (Sec 165A) - withdrawn w.e.f. 1 Aug 2024." },
    "194o":    { label: "TDS 194O - e-commerce participant (1%)", rate: 1, desc: "Operator deducts 1% on gross sales of resident participants." },
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Track the 6% EL on online advertising to non-residents and the 1% TDS u/s 194O for e-commerce operators. (The 2% e-commerce EL stands withdrawn from 1 Aug 2024 - retained here for prior-period entries.)</p>
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Nets TDS already deducted on your receipts against the advance-tax liability and lays out the cash outgo by due date - so you can plan runway around 15 Jun / Sep / Dec / Mar.</p>
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
    toast.success("Notice logged - track the response deadline");
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
                    <td className="px-3 py-2.5 text-xs tabular-nums text-red-400">{r.demand > 0 ? fc(r.demand) : "-"}</td>
                    <td className={`px-3 py-2.5 text-xs ${isOverdue ? "text-red-400 font-semibold" : ""}`}>{r.dueDate || "-"}{isOverdue ? " ⚠" : ""}</td>
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
      <p className="text-[10px] text-[var(--color-muted)]">Most notices carry a 15-30 day response window from the date of the notice. Rectification u/s 154 corrects mistakes apparent from record; appeal to CIT(A) within 30 days of a demand. Always respond via the e-filing portal e-Proceedings and keep the DIN. Consult your CA.</p>
    </div>
  );
}

// ── HRA Exemption Calculator (Sec 10(13A), Rule 2A) ─────────────────────────────
function HraExemptionCalc() {
  const [basic, setBasic]     = useState("");
  const [hra, setHra]         = useState("");
  const [rent, setRent]       = useState("");
  const [metro, setMetro]     = useState(true);
  const fc = formatCurrency;

  const b = parseFloat(basic) || 0;          // basic + DA, annual
  const hraReceived = parseFloat(hra) || 0;  // annual
  const rentPaid = parseFloat(rent) || 0;    // annual

  // Three limbs of Rule 2A - least is exempt
  const limbActual  = hraReceived;
  const limbPct     = (metro ? 0.50 : 0.40) * b;
  const limbRent    = Math.max(0, rentPaid - 0.10 * b);
  const exempt      = Math.round(Math.max(0, Math.min(limbActual, limbPct, limbRent)));
  const taxable     = Math.max(0, hraReceived - exempt);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Home size={14} className="text-[var(--color-primary)]" /> HRA Exemption Calculator (Sec 10(13A))</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Exemption is the least of: actual HRA received, 50%/40% of (Basic+DA), or rent paid minus 10% of (Basic+DA). Available only in the Old Regime. Enter annual figures.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Basic + DA (annual ₹)</label>
            <input type="number" value={basic} onChange={e => setBasic(e.target.value)} placeholder="e.g. 600000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">HRA received (annual ₹)</label>
            <input type="number" value={hra} onChange={e => setHra(e.target.value)} placeholder="e.g. 240000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rent paid (annual ₹)</label>
            <input type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="e.g. 300000" className={INP} />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {([["metro", "Metro (50%)", true], ["non", "Non-metro (40%)", false]] as const).map(([k, lbl, val]) => (
            <button key={k} onClick={() => setMetro(val)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${metro === val ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{lbl}</button>
          ))}
        </div>
      </div>

      {b > 0 && hraReceived > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Computation (least of three is exempt)</h3>
          <div className="space-y-2">
            {[
              { label: "Actual HRA received", value: fc(Math.round(limbActual)), win: exempt === Math.round(limbActual) },
              { label: `${metro ? "50%" : "40%"} of Basic+DA`, value: fc(Math.round(limbPct)), win: exempt === Math.round(limbPct) },
              { label: "Rent paid − 10% of Basic+DA", value: fc(Math.round(limbRent)), win: exempt === Math.round(limbRent) },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}{r.win && exempt > 0 ? " ✓ (least)" : ""}</span>
                <span className={`tabular-nums ${r.win && exempt > 0 ? "text-green-400 font-semibold" : "text-[var(--color-text)]"}`}>{r.value}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-green-950/20 border border-green-800/30 rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)]">Exempt HRA</p>
              <p className="text-lg font-bold tabular-nums text-green-400">{fc(exempt)}</p>
            </div>
            <div className="bg-orange-950/20 border border-orange-800/30 rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)]">Taxable HRA</p>
              <p className="text-lg font-bold tabular-nums text-orange-400">{fc(taxable)}</p>
            </div>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Metro = Delhi, Mumbai, Kolkata, Chennai (50%); all other cities 40%. If annual rent &gt; ₹1L, landlord PAN must be reported. HRA exemption is not available under the New Regime. Consult your CA.</p>
    </div>
  );
}

// ── House Property Income (Sec 22-24) ───────────────────────────────────────────
function HousePropertyCalc() {
  const [mode, setMode]       = useState<"letout" | "self">("letout");
  const [rent, setRent]       = useState("");
  const [muniTax, setMuniTax] = useState("");
  const [interest, setInterest] = useState("");
  const fc = formatCurrency;

  const annualRent = parseFloat(rent) || 0;
  const mt = parseFloat(muniTax) || 0;
  const intPaid = parseFloat(interest) || 0;

  const nav = mode === "letout" ? Math.max(0, annualRent - mt) : 0;          // Net Annual Value
  const stdDeduction = mode === "letout" ? Math.round(nav * 0.30) : 0;        // 30% u/s 24(a)
  // Self-occupied: interest capped at ₹2L; let-out: full interest (loss capped at ₹2L set-off)
  const intDeduction = mode === "self" ? Math.min(intPaid, 200000) : intPaid;
  const income = nav - stdDeduction - intDeduction;
  const setOffLoss = Math.max(0, -income);
  const allowedLoss = Math.min(setOffLoss, 200000);                           // ₹2L cap on set-off vs other heads
  const carryForward = Math.max(0, setOffLoss - 200000);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Building2 size={14} className="text-[var(--color-primary)]" /> Income from House Property (Sec 22-24)</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Net Annual Value = rent − municipal taxes. Less 30% standard deduction (Sec 24(a)) and home-loan interest (Sec 24(b)). Self-occupied: NAV nil, interest capped at ₹2L.</p>
        <div className="flex gap-2 mb-4">
          {([["letout", "Let-out / Deemed let-out"], ["self", "Self-occupied"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${mode === k ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{lbl}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {mode === "letout" && <>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Annual rent received (₹)</label>
              <input type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="e.g. 360000" className={INP} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Municipal taxes paid (₹)</label>
              <input type="number" value={muniTax} onChange={e => setMuniTax(e.target.value)} placeholder="e.g. 12000" className={INP} />
            </div>
          </>}
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Home loan interest (₹)</label>
            <input type="number" value={interest} onChange={e => setInterest(e.target.value)} placeholder="e.g. 200000" className={INP} />
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Computation</h3>
        <div className="space-y-2">
          {[
            { label: "Net Annual Value (NAV)", value: fc(nav) },
            { label: "Less: Standard Deduction (30% u/s 24a)", value: `(${fc(stdDeduction)})` },
            { label: "Less: Interest on borrowed capital (24b)", value: `(${fc(Math.round(intDeduction))})` },
            { label: income >= 0 ? "Income from House Property" : "Loss from House Property", value: fc(income), bold: true },
          ].map(r => (
            <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
              <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
              <span className={`tabular-nums ${r.bold ? (income >= 0 ? "text-[var(--color-text)] font-semibold" : "text-red-400 font-semibold") : "text-[var(--color-text)]"}`}>{r.value}</span>
            </div>
          ))}
        </div>
        {setOffLoss > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-green-950/20 border border-green-800/30 rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)]">Loss set-off this year (cap ₹2L)</p>
              <p className="text-base font-bold tabular-nums text-green-400">{fc(allowedLoss)}</p>
            </div>
            <div className="bg-orange-950/20 border border-orange-800/30 rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)]">Carry forward (8 years)</p>
              <p className="text-base font-bold tabular-nums text-orange-400">{fc(carryForward)}</p>
            </div>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Loss from house property set-off against other heads is capped at ₹2L per year (Sec 71(3A)); the balance carries forward 8 years. Self-occupied interest is restricted to ₹2L (₹30k if not acquired/constructed within 5 years). New Regime disallows the let-out loss set-off against other heads. Consult your CA.</p>
    </div>
  );
}

// ── Presumptive 44AE - Goods Carriages ──────────────────────────────────────────
function Presumptive44AE() {
  const [heavy, setHeavy]   = useState("");   // GVW > 12,000 kg
  const [light, setLight]   = useState("");   // other vehicles
  const [months, setMonths] = useState("12");
  const [tonnage, setTonnage] = useState("15");
  const fc = formatCurrency;

  const nHeavy = parseInt(heavy) || 0;
  const nLight = parseInt(light) || 0;
  const m = Math.min(12, Math.max(0, parseInt(months) || 0));
  const tons = parseFloat(tonnage) || 0;

  // Heavy goods vehicle: ₹1,000 per ton of GVW per month. Other: ₹7,500 per month.
  const heavyIncome = nHeavy * tons * 1000 * m;
  const lightIncome = nLight * 7500 * m;
  const presumptiveIncome = Math.round(heavyIncome + lightIncome);
  const totalVehicles = nHeavy + nLight;
  const eligible = totalVehicles <= 10;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Truck size={14} className="text-[var(--color-primary)]" /> Presumptive Income - Goods Transport (Sec 44AE)</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">For transporters owning ≤10 goods carriages. Heavy vehicle (GVW &gt; 12 t): ₹1,000 per ton of gross vehicle weight per month. Other vehicles: ₹7,500 per month each.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Heavy vehicles (count)</label>
            <input type="number" min={0} value={heavy} onChange={e => setHeavy(e.target.value)} placeholder="e.g. 3" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Avg GVW per heavy (tons)</label>
            <input type="number" min={0} value={tonnage} onChange={e => setTonnage(e.target.value)} placeholder="e.g. 15" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Other vehicles (count)</label>
            <input type="number" min={0} value={light} onChange={e => setLight(e.target.value)} placeholder="e.g. 2" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Months held (per vehicle)</label>
            <input type="number" min={0} max={12} value={months} onChange={e => setMonths(e.target.value)} placeholder="12" className={INP} />
          </div>
        </div>
      </div>

      {totalVehicles > 0 && (
        <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${eligible ? "border-[var(--color-border)]" : "border-red-700/40"}`}>
          {!eligible && (
            <div className="flex items-center gap-2 mb-3 p-2.5 bg-red-950/20 border border-red-800/30 rounded-lg">
              <AlertTriangle size={12} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-300">{totalVehicles} vehicles exceed the 10-vehicle limit - 44AE not available. Maintain books and get a tax audit (44AB).</p>
            </div>
          )}
          <div className="space-y-2">
            {[
              { label: `Heavy vehicles (${nHeavy} × ${tons}t × ₹1,000 × ${m}mo)`, value: fc(Math.round(heavyIncome)) },
              { label: `Other vehicles (${nLight} × ₹7,500 × ${m}mo)`, value: fc(Math.round(lightIncome)) },
              { label: "Presumptive Income (Sec 44AE)", value: fc(presumptiveIncome), bold: true },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.bold ? "text-[var(--color-primary)] font-bold" : "text-[var(--color-text)]"}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Sec 44AE applies if you own ≤10 goods carriages at any time in the year. Income is computed per vehicle per month (part of a month = full month). Actual income, if higher, may be declared. No further business expense deduction is allowed. Consult your CA.</p>
    </div>
  );
}

// ── Gratuity & Leave Encashment Exemption (Sec 10(10), 10(10AA)) ─────────────────
function GratuityLeaveExemption() {
  const [kind, setKind]     = useState<"gratuity" | "leave">("gratuity");
  const [salary, setSalary] = useState("");   // last drawn monthly (basic + DA)
  const [years, setYears]   = useState("");
  const [received, setReceived] = useState("");
  const [leaveDays, setLeaveDays] = useState("");
  const [covered, setCovered] = useState(true);   // covered by Payment of Gratuity Act
  const fc = formatCurrency;

  const sal = parseFloat(salary) || 0;
  const yrs = parseFloat(years) || 0;
  const rec = parseFloat(received) || 0;
  const lDays = parseFloat(leaveDays) || 0;

  let limbs: { label: string; value: number }[] = [];
  let statutoryCap = 0;
  if (kind === "gratuity") {
    statutoryCap = 2000000; // ₹20L lifetime cap
    const formula = covered
      ? Math.round((15 / 26) * sal * Math.round(yrs))            // covered: 15/26 × last salary × years
      : Math.round((15 / 30) * sal * Math.floor(yrs));           // not covered: half-month avg × completed years
    limbs = [
      { label: "Actual gratuity received", value: rec },
      { label: covered ? "15/26 × salary × years" : "½ month × completed years", value: formula },
      { label: "Statutory cap (₹20 lakh)", value: statutoryCap },
    ];
  } else {
    statutoryCap = 2500000; // ₹25L cap (non-govt) per CBDT notification 2023
    const avgMonthly = sal;
    const earnedDays = Math.max(0, lDays);
    const leaveValue = Math.round(avgMonthly / 30 * earnedDays);
    const tenMonthCap = Math.round(avgMonthly * 10);
    limbs = [
      { label: "Actual leave encashment received", value: rec },
      { label: "Cash equiv. of earned leave", value: leaveValue },
      { label: "10 months' avg salary", value: tenMonthCap },
      { label: "Statutory cap (₹25 lakh)", value: statutoryCap },
    ];
  }

  const exempt = Math.round(Math.max(0, Math.min(...limbs.map(l => l.value))));
  const taxable = Math.max(0, rec - exempt);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Umbrella size={14} className="text-[var(--color-primary)]" /> Gratuity / Leave Encashment Exemption</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Exemption is the least of statutory limbs (Sec 10(10) for gratuity, Sec 10(10AA) for leave encashment). For non-government employees. Enter last-drawn monthly Basic+DA.</p>
        <div className="flex gap-2 mb-4">
          {([["gratuity", "Gratuity 10(10)"], ["leave", "Leave Encashment 10(10AA)"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setKind(k)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${kind === k ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{lbl}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Last-drawn salary (monthly ₹)</label>
            <input type="number" value={salary} onChange={e => setSalary(e.target.value)} placeholder="e.g. 50000" className={INP} />
          </div>
          {kind === "gratuity" ? (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Years of service</label>
              <input type="number" value={years} onChange={e => setYears(e.target.value)} placeholder="e.g. 12" className={INP} />
            </div>
          ) : (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Unutilised earned-leave days</label>
              <input type="number" value={leaveDays} onChange={e => setLeaveDays(e.target.value)} placeholder="e.g. 300" className={INP} />
            </div>
          )}
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount received (₹)</label>
            <input type="number" value={received} onChange={e => setReceived(e.target.value)} placeholder="e.g. 1500000" className={INP} />
          </div>
        </div>
        {kind === "gratuity" && (
          <label className="flex items-center gap-2 text-xs cursor-pointer mt-3">
            <input type="checkbox" checked={covered} onChange={e => setCovered(e.target.checked)} className="accent-[var(--color-primary)]" />
            Covered by the Payment of Gratuity Act, 1972 (15/26 formula)
          </label>
        )}
      </div>

      {rec > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Exemption (least of the following)</h3>
          <div className="space-y-2">
            {limbs.map(l => (
              <div key={l.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
                <span className="text-xs text-[var(--color-muted)]">{l.label}{Math.round(l.value) === exempt && exempt > 0 ? " ✓ (least)" : ""}</span>
                <span className={`tabular-nums ${Math.round(l.value) === exempt && exempt > 0 ? "text-green-400 font-semibold" : "text-[var(--color-text)]"}`}>{fc(Math.round(l.value))}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-green-950/20 border border-green-800/30 rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)]">Exempt amount</p>
              <p className="text-lg font-bold tabular-nums text-green-400">{fc(exempt)}</p>
            </div>
            <div className="bg-orange-950/20 border border-orange-800/30 rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)]">Taxable as salary</p>
              <p className="text-lg font-bold tabular-nums text-orange-400">{fc(taxable)}</p>
            </div>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Government employees: gratuity and leave encashment are fully exempt. Non-government: limits above (gratuity ₹20L lifetime, leave encashment ₹25L per CBDT Notification 31/2023). "Salary" means Basic + DA (+ commission as % of turnover, if applicable). Consult your CA.</p>
    </div>
  );
}

// ── Salary Arrears Relief u/s 89(1) ─────────────────────────────────────────────
function Relief89Calc() {
  const [arrears, setArrears]       = useState("");
  const [curIncome, setCurIncome]   = useState("");   // current year income excl. arrears
  const [prevIncome, setPrevIncome] = useState("");   // earlier year(s) income to which arrears relate
  const fc = formatCurrency;

  // New regime slabs (FY 2024-25) reused for an indicative computation
  const BANDS: SlabBand[] = NEW_BANDS;
  const taxOf = (inc: number) => {
    const t = slabTax(Math.max(0, inc), BANDS);
    return Math.round(t * 1.04); // + 4% cess
  };

  const arr = parseFloat(arrears) || 0;
  const cur = parseFloat(curIncome) || 0;
  const prev = parseFloat(prevIncome) || 0;

  // Tax on current year with and without arrears
  const taxCurWith = taxOf(cur + arr);
  const taxCurWithout = taxOf(cur);
  const incrCurrent = Math.max(0, taxCurWith - taxCurWithout);

  // Tax on prior year with and without the arrears portion
  const taxPrevWith = taxOf(prev + arr);
  const taxPrevWithout = taxOf(prev);
  const incrPrior = Math.max(0, taxPrevWith - taxPrevWithout);

  const relief = Math.max(0, incrCurrent - incrPrior);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Banknote size={14} className="text-[var(--color-primary)]" /> Salary Arrears Relief (Sec 89(1))</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">When you receive arrears taxed in a higher slab now, Sec 89(1) gives relief = extra tax on arrears this year minus extra tax had they been taxed in the year they related to. File Form 10E before the ITR.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Arrears received (₹)</label>
            <input type="number" value={arrears} onChange={e => setArrears(e.target.value)} placeholder="e.g. 300000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Current-year income (excl. arrears) (₹)</label>
            <input type="number" value={curIncome} onChange={e => setCurIncome(e.target.value)} placeholder="e.g. 1100000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Earlier-year income (₹)</label>
            <input type="number" value={prevIncome} onChange={e => setPrevIncome(e.target.value)} placeholder="e.g. 500000" className={INP} />
          </div>
        </div>
      </div>

      {arr > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Relief Computation (Form 10E)</h3>
          <div className="space-y-2">
            {[
              { label: "Extra tax on arrears - current year", value: fc(incrCurrent), color: "text-orange-400" },
              { label: "Extra tax on arrears - earlier year", value: fc(incrPrior), color: "text-blue-400" },
              { label: "Relief u/s 89(1)", value: fc(relief), color: "text-green-400 font-bold" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg p-3 border border-green-800/40 bg-green-950/20">
            <p className="text-sm font-bold text-green-400">{relief > 0 ? `✓ You can claim ${fc(relief)} relief - reduce your tax payable after filing Form 10E.` : "No relief - the arrears do not push you into a higher effective rate than the earlier year."}</p>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative computation using current (new-regime) slabs for both years; the actual Form 10E uses each year's own slabs. Form 10E must be filed on the e-filing portal before submitting the ITR, else relief is disallowed. Consult your CA.</p>
    </div>
  );
}

// ── Donations 80G Deduction Calculator ──────────────────────────────────────────
type DonationRow = { id: string; donee: string; amount: number; category: "100nl" | "50nl" | "100ql" | "50ql"; mode: "digital" | "cash" };
const DONATION_CATS: Record<DonationRow["category"], { label: string; pct: number; qualifying: boolean }> = {
  "100nl": { label: "100% - no limit (PM CARES, National Defence Fund)", pct: 100, qualifying: false },
  "50nl":  { label: "50% - no limit (PM Drought Relief, Jawaharlal Nehru Fund)", pct: 50, qualifying: false },
  "100ql": { label: "100% - subject to 10% of AGTI (Govt for family planning)", pct: 100, qualifying: true },
  "50ql":  { label: "50% - subject to 10% of AGTI (most charitable trusts)", pct: 50, qualifying: true },
};
function Donation80GCalc() {
  const [rows, setRows] = useFeatureState<DonationRow[]>("tax-80g-donations", []);
  const [agti, setAgti] = useFeatureState<string>("tax-80g-agti", "");
  const [donee, setDonee] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<DonationRow["category"]>("50ql");
  const [mode, setMode] = useState<DonationRow["mode"]>("digital");
  const fc = formatCurrency;

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (!donee || amt <= 0) { toast.error("Enter donee name and amount"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), donee, amount: amt, category, mode }]);
    setDonee(""); setAmount("");
    toast.success("Donation recorded");
  };

  const agtiVal = parseFloat(agti) || 0;
  const qualifyingCap = agtiVal * 0.10;

  // Eligible donations: cash > ₹2,000 is disallowed
  const eligible = rows.map(r => ({ ...r, allowedDonation: r.mode === "cash" && r.amount > 2000 ? 0 : r.amount }));
  const nonQualSum = eligible.filter(r => !DONATION_CATS[r.category].qualifying).reduce((s, r) => s + Math.round(r.allowedDonation * DONATION_CATS[r.category].pct / 100), 0);
  const qualGross = eligible.filter(r => DONATION_CATS[r.category].qualifying).reduce((s, r) => s + r.allowedDonation, 0);
  const qualCapped = agtiVal > 0 ? Math.min(qualGross, qualifyingCap) : qualGross;
  const qualDeduction = eligible.filter(r => DONATION_CATS[r.category].qualifying)
    .reduce((s, r) => {
      const share = qualGross > 0 ? r.allowedDonation / qualGross : 0;
      return s + Math.round(qualCapped * share * DONATION_CATS[r.category].pct / 100);
    }, 0);
  const totalDeduction = nonQualSum + qualDeduction;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Heart size={14} className="text-[var(--color-primary)]" /> Donations 80G Deduction Calculator</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Deduction depends on the donee category (100%/50%) and whether it is capped at 10% of Adjusted Gross Total Income. Cash donations above ₹2,000 are disallowed. Old Regime only.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input value={donee} onChange={e => setDonee(e.target.value)} placeholder="Donee / institution *" className={INP} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Donation amount (₹) *" className={INP} />
          <select value={category} onChange={e => setCategory(e.target.value as DonationRow["category"])} className={INP}>
            {(Object.keys(DONATION_CATS) as DonationRow["category"][]).map(k => <option key={k} value={k}>{DONATION_CATS[k].label}</option>)}
          </select>
          <select value={mode} onChange={e => setMode(e.target.value as DonationRow["mode"])} className={INP}>
            <option value="digital">Digital / cheque</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Adjusted Gross Total Income (₹) - for 10% cap</label>
            <input type="number" value={agti} onChange={e => setAgti(e.target.value)} placeholder="e.g. 1500000" className={INP} />
          </div>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add donation</button>
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total donated", value: fc(rows.reduce((s, r) => s + r.amount, 0)), color: "text-[var(--color-text)]" },
            { label: "Qualifying-limit cap (10% AGTI)", value: agtiVal > 0 ? fc(Math.round(qualifyingCap)) : "-", color: "text-blue-400" },
            { label: "Eligible 80G deduction", value: fc(totalDeduction), color: "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Donee", "Amount", "Category", "Mode", "Eligible", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {eligible.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{r.donee}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.amount)}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{DONATION_CATS[r.category].pct}%{DONATION_CATS[r.category].qualifying ? " · QL" : ""}</td>
                  <td className="px-3 py-2.5 text-xs capitalize">{r.mode}</td>
                  <td className={`px-3 py-2.5 text-xs tabular-nums ${r.allowedDonation === 0 ? "text-red-400" : "text-green-400"}`}>{r.allowedDonation === 0 ? "Cash >₹2k" : fc(r.allowedDonation)}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">From FY 2023-24, 80G claims need the donee's Form 10BE certificate and the donation must reflect in your AIS. Qualifying-limit donations are restricted to 10% of Adjusted GTI. 80G is not available under the New Regime. Consult your CA.</p>
    </div>
  );
}

// ── Capital-Gains Exemption Planner (Sec 54 / 54EC / 54F) ───────────────────────
function CapitalGainExemptionPlanner() {
  const [section, setSection] = useState<"54" | "54EC" | "54F">("54");
  const [gain, setGain]       = useState("");      // LTCG (54/54EC) - capital gain
  const [netConsideration, setNetConsideration] = useState(""); // for 54F - full sale value
  const [reinvest, setReinvest] = useState("");    // amount reinvested
  const fc = formatCurrency;

  const cg = parseFloat(gain) || 0;
  const nc = parseFloat(netConsideration) || 0;
  const inv = parseFloat(reinvest) || 0;

  let exemption = 0;
  let cap = 0;
  let note = "";
  if (section === "54") {
    // Exemption = lower of capital gain or amount invested in new residential house
    exemption = Math.min(cg, inv);
    cap = cg;
    note = "Reinvest the LTCG from a residential house into another residential house (1 yr before / 2 yrs after purchase, or 3 yrs construction).";
  } else if (section === "54EC") {
    // Invest in NHAI/REC bonds, capped at ₹50L
    const bondCap = 5000000;
    exemption = Math.min(cg, inv, bondCap);
    cap = Math.min(cg, bondCap);
    note = "Invest LTCG from land/building into 54EC bonds (NHAI/REC/PFC/IRFC) within 6 months. Max ₹50 lakh, 5-year lock-in.";
  } else {
    // 54F - exemption proportionate to net consideration reinvested; full only if entire NC invested
    exemption = nc > 0 ? Math.round(cg * Math.min(inv, nc) / nc) : 0;
    cap = cg;
    note = "Reinvest the entire net sale consideration of any LTCA (other than a house) into one residential house. Proportionate exemption if part-invested.";
  }
  exemption = Math.max(0, Math.min(exemption, cap));
  const taxableGain = Math.max(0, cg - exemption);
  const taxSaved = Math.round(exemption * 0.125); // LTCG @ 12.5% (Budget 2024)

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> Capital-Gains Exemption Planner (54 / 54EC / 54F)</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Defer or eliminate LTCG by reinvesting in a house (54/54F) or specified bonds (54EC). Model how much to reinvest to wipe out the tax.</p>
        <div className="flex gap-2 mb-4">
          {([["54", "Sec 54 - House → House"], ["54EC", "Sec 54EC - Bonds"], ["54F", "Sec 54F - Any asset → House"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setSection(k)}
              className={`flex-1 py-2 text-[11px] font-semibold rounded-lg border transition-colors ${section === k ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{lbl}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Long-term capital gain (₹)</label>
            <input type="number" value={gain} onChange={e => setGain(e.target.value)} placeholder="e.g. 4000000" className={INP} />
          </div>
          {section === "54F" && (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Net sale consideration (₹)</label>
              <input type="number" value={netConsideration} onChange={e => setNetConsideration(e.target.value)} placeholder="e.g. 10000000" className={INP} />
            </div>
          )}
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">{section === "54EC" ? "Amount in 54EC bonds (₹)" : "Amount reinvested in house (₹)"}</label>
            <input type="number" value={reinvest} onChange={e => setReinvest(e.target.value)} placeholder="e.g. 4000000" className={INP} />
          </div>
        </div>
      </div>

      {cg > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Exemption &amp; Residual Tax</h3>
          <div className="space-y-2">
            {[
              { label: "Capital gain", value: fc(cg), color: "text-[var(--color-text)]" },
              { label: `Exemption u/s ${section}`, value: fc(exemption), color: "text-green-400" },
              { label: "Taxable gain after exemption", value: fc(taxableGain), color: taxableGain > 0 ? "text-orange-400" : "text-green-400" },
              { label: "Approx. LTCG tax saved (@12.5%)", value: fc(taxSaved), color: "text-[var(--color-primary)] font-semibold" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg p-3 border border-blue-800/30 bg-blue-950/20">
            <p className="text-xs text-blue-300">{note}</p>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Sec 54/54F exemption (for residential house) is itself capped at ₹10 crore of investment from FY 2023-24. 54EC bonds: ₹50L max, 5-year lock-in. Unutilised gains must be parked in a Capital Gains Account Scheme before the ITR due date. Tax saved shown at the 12.5% LTCG rate (indicative). Consult your CA.</p>
    </div>
  );
}

// ── Interest u/s 234A / 234B / 234C Calculator ──────────────────────────────────
function Interest234Calc() {
  const [assessedTax, setAssessedTax] = useState(""); // tax liability less TDS/TCS/relief
  const [advancePaid, setAdvancePaid] = useState("");
  const [monthsLate, setMonthsLate] = useState("0"); // months after due date for 234A (self-assessment)
  const fc = formatCurrency;
  // Precise (server-computed) 234A/B/C from actual dates + cumulative advance paid.
  const nowY = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const defaultAy = `${nowY + 1}-${String((nowY + 2) % 100).padStart(2, "0")}`;
  const [pDue, setPDue] = useState(`${nowY + 1}-07-31`);
  const [pFiled, setPFiled] = useState(new Date().toISOString().slice(0, 10));
  const [pCum, setPCum] = useState({ jun: "", sep: "", dec: "", mar: "" });
  const [precise, setPrecise] = useState<null | { s234A: { interest: number; months: number }; s234B: { interest: number; months: number }; s234C: { interest: number }; totalInterest: number; note: string }>(null);
  const [pLoading, setPLoading] = useState(false);
  const computePrecise = async () => {
    setPLoading(true);
    try {
      const num = (s: string) => (s === "" ? undefined : Number(s));
      const anyCum = pCum.jun || pCum.sep || pCum.dec || pCum.mar;
      const res = await api.post<typeof precise>("/api/books/tax/interest-234", {
        ay: defaultAy, assessedTax: parseFloat(assessedTax) || 0, tds: 0,
        advanceTaxPaid: parseFloat(advancePaid) || 0, returnDueDate: pDue, returnFiledOn: pFiled,
        paidCumulative: anyCum ? { jun: num(pCum.jun) || 0, sep: num(pCum.sep) || 0, dec: num(pCum.dec) || 0, mar: num(pCum.mar) || (parseFloat(advancePaid) || 0) } : undefined,
      });
      setPrecise(res);
    } catch (e) { toast.error((e as Error).message); } finally { setPLoading(false); }
  };

  const tax = parseFloat(assessedTax) || 0;
  const paid = parseFloat(advancePaid) || 0;
  const lateM = Math.max(0, parseInt(monthsLate) || 0);

  // 234A: 1%/month on unpaid tax for late ITR filing
  const unpaid = Math.max(0, tax - paid);
  const int234A = Math.round(unpaid * 0.01 * lateM);

  // 234B: 1%/month if advance tax < 90% of assessed tax (assume ~4 months Apr-Jul till filing, indicative)
  const below90 = paid < tax * 0.90 && tax > 10000;
  const int234B = below90 ? Math.round(unpaid * 0.01 * 4) : 0;

  // 234C: shortfall in each installment (15/45/75/100), 1%/month ×3,3,3,1
  const cuts = [
    { label: "By 15 Jun (15%)", duePct: 0.15, months: 3 },
    { label: "By 15 Sep (45%)", duePct: 0.45, months: 3 },
    { label: "By 15 Dec (75%)", duePct: 0.75, months: 3 },
    { label: "By 15 Mar (100%)", duePct: 1.00, months: 1 },
  ];
  // Assume advance paid evenly is unknown; use cumulative paid vs cumulative due with single 'paid' as final - indicative
  const int234C = cuts.reduce((s, c) => {
    const due = tax * c.duePct;
    const expectedPaidByThen = paid * c.duePct; // proportional assumption
    const shortfall = Math.max(0, due - expectedPaidByThen);
    return s + Math.round(shortfall * 0.01 * c.months);
  }, 0);

  const totalInterest = int234A + int234B + int234C;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Interest u/s 234A / 234B / 234C</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Estimate penal interest at 1% per month - 234A (late ITR), 234B (under-paid advance tax), 234C (installment shortfall). Enter tax net of TDS/TCS.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Assessed tax (net of TDS) (₹)</label>
            <input type="number" value={assessedTax} onChange={e => setAssessedTax(e.target.value)} placeholder="e.g. 200000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Advance tax paid (₹)</label>
            <input type="number" value={advancePaid} onChange={e => setAdvancePaid(e.target.value)} placeholder="e.g. 120000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Months ITR filed late (234A)</label>
            <input type="number" min={0} value={monthsLate} onChange={e => setMonthsLate(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {tax > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Interest Breakup (indicative)</h3>
          <div className="space-y-2">
            {[
              { label: `234A - late filing (${lateM} mo × 1%)`, value: fc(int234A), color: int234A > 0 ? "text-orange-400" : "text-green-400" },
              { label: "234B - advance tax < 90% (≈4 mo × 1%)", value: fc(int234B), color: int234B > 0 ? "text-orange-400" : "text-green-400" },
              { label: "234C - installment shortfall", value: fc(int234C), color: int234C > 0 ? "text-orange-400" : "text-green-400" },
              { label: "Total interest", value: fc(totalInterest), color: "text-red-400 font-bold" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)]">Tax + interest payable</p>
              <p className="text-lg font-bold tabular-nums text-red-400">{fc(Math.max(0, tax - paid) + totalInterest)}</p>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)]">Effective interest cost</p>
              <p className="text-lg font-bold tabular-nums text-orange-400">{tax > 0 ? `${((totalInterest / tax) * 100).toFixed(1)}%` : "-"}</p>
            </div>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">The estimate above uses proportional assumptions. For the authoritative figure, compute precisely from your actual dates below.</p>

      {/* Precise, server-computed 234A/B/C from actual filing dates + cumulative advance paid */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Compute precisely (AY {defaultAy})</h3>
        <p className="text-xs text-[var(--color-muted)] mb-3">Uses the “assessed tax” and “advance tax paid” entered above, with the exact return dates + cumulative advance paid by each instalment.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Return due date</label><input type="date" value={pDue} onChange={e => setPDue(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Return filed on</label><input type="date" value={pFiled} onChange={e => setPFiled(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cum. paid by 15 Jun</label><input type="number" value={pCum.jun} onChange={e => setPCum({ ...pCum, jun: e.target.value })} placeholder="optional" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">by 15 Sep</label><input type="number" value={pCum.sep} onChange={e => setPCum({ ...pCum, sep: e.target.value })} placeholder="optional" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">by 15 Dec</label><input type="number" value={pCum.dec} onChange={e => setPCum({ ...pCum, dec: e.target.value })} placeholder="optional" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">by 15 Mar</label><input type="number" value={pCum.mar} onChange={e => setPCum({ ...pCum, mar: e.target.value })} placeholder="optional" className={INP} /></div>
          <div className="flex items-end"><button onClick={computePrecise} disabled={pLoading} className="w-full text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-semibold disabled:opacity-50">{pLoading ? "Computing…" : "Compute"}</button></div>
        </div>
        {precise && (
          <div className="mt-4 space-y-2">
            {[
              { label: `234A — late filing (${precise.s234A.months} mo)`, value: fc(precise.s234A.interest) },
              { label: `234B — advance-tax default (${precise.s234B.months} mo)`, value: fc(precise.s234B.interest) },
              { label: "234C — instalment deferment", value: fc(precise.s234C.interest) },
              { label: "Total interest (precise)", value: fc(precise.totalInterest) },
            ].map((r, i) => (
              <div key={i} className={`flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 ${i === 3 ? "font-bold text-red-400" : ""}`}>
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span><span className="tabular-nums">{r.value}</span>
              </div>
            ))}
            <p className="text-[10px] text-[var(--color-muted)]">{precise.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Concessional Corporate Rate Optimizer (Sec 115BAA / 115BAB) ──────────────
function CorporateRate115BA() {
  const [profit,    setProfit]    = useState("");          // taxable business income (₹)
  const [incentives, setIncentives] = useState("");        // deductions foregone if opting in (₹)
  const [isNewMfg,  setIsNewMfg]  = useState(false);       // eligible new manufacturer (115BAB)
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const pbt = parseFloat(profit)     || 0;
  const inc = parseFloat(incentives) || 0;

  // Surcharge under concessional regimes is flat 10%; cess 4%.
  const calc = (rate: number, base: number) => {
    const t = base * rate / 100;
    const sur = t * 0.10;
    const cess = (t + sur) * 0.04;
    return Math.round(t + sur + cess);
  };

  // Regular regime (assume turnover ≤ ₹400cr → 25% base) on profit, normal surcharge bands; deductions allowed.
  const regularBase = Math.max(0, pbt);
  const regularTaxRaw = regularBase * 0.25;
  const regSur = regularBase > 100000000 ? regularTaxRaw * 0.12 : regularBase > 10000000 ? regularTaxRaw * 0.07 : 0;
  const regularTax = Math.round(regularTaxRaw + regSur + (regularTaxRaw + regSur) * 0.04);

  // 115BAA: 22% on income WITHOUT specified deductions/incentives (so add them back).
  const baaBase = Math.max(0, pbt + inc);
  const baaTax  = calc(22, baaBase);

  // 115BAB: 15% for eligible new manufacturing companies (incorporated/began before cut-off).
  const babBase = Math.max(0, pbt + inc);
  const babTax  = isNewMfg ? calc(15, babBase) : null;

  const options: { key: string; label: string; rate: string; tax: number; note: string }[] = [
    { key: "reg", label: "Regular Regime", rate: "25% + sur + 4% cess", tax: regularTax, note: "All deductions/incentives retained; MAT @15% applies." },
    { key: "baa", label: "Sec 115BAA", rate: "22% + 10% sur + 4% cess (eff. 25.17%)", tax: baaTax, note: "No MAT. Foregoes specified deductions (80-IA/IB, add'l depreciation, etc.)." },
    ...(babTax !== null ? [{ key: "bab", label: "Sec 115BAB", rate: "15% + 10% sur + 4% cess (eff. 17.16%)", tax: babTax, note: "New manufacturing cos only - production before the notified cut-off." }] : []),
  ];
  const best = pbt > 0 ? options.reduce((a, b) => (b.tax < a.tax ? b : a)) : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Concessional Corporate Rate Optimizer (115BAA / 115BAB)</h2>
        <p className="text-xs text-[var(--color-muted)]">Domestic companies may opt into a lower flat rate by giving up most incentives. This compares your effective tax across regimes for the year.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Taxable business income (₹)</label>
            <input type="number" min={0} value={profit} onChange={e => setProfit(e.target.value)} placeholder="e.g. 20000000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Incentives/deductions foregone if opting in (₹)</label>
            <input type="number" min={0} value={incentives} onChange={e => setIncentives(e.target.value)} placeholder="e.g. 1500000" className={inp} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={isNewMfg} onChange={e => setIsNewMfg(e.target.checked)} className="accent-[var(--color-primary)]" />
          <span>Eligible new manufacturing company (qualifies for 115BAB @15%)</span>
        </label>
      </div>

      {pbt > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3">
            {options.map(o => (
              <div key={o.key} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${best && best.key === o.key ? "border-green-700/50" : "border-[var(--color-border)]"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{o.label}{best && best.key === o.key && <span className="ml-2 text-[10px] text-green-400">★ lowest</span>}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{o.rate}</p>
                  </div>
                  <p className="text-lg font-bold tabular-nums text-orange-400">{fc(o.tax)}</p>
                </div>
                <p className="text-[10px] text-[var(--color-muted)] mt-1">{o.note}</p>
              </div>
            ))}
          </div>
          {best && (
            <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
              <p className="text-sm font-bold text-green-400">✓ Lowest liability: {best.label} at {fc(best.tax)} - saves {fc(Math.max(...options.map(o => o.tax)) - best.tax)} vs the costliest option this year.</p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Once exercised, the 115BAA/115BAB option is irrevocable for all future years. Surcharge is a flat 10% (no slabs) under both. MAT (115JB) does not apply to companies that opt in. Indicative - confirm eligibility with your CA.</p>
    </div>
  );
}

// ── Partner Remuneration Limit (Sec 40(b)) ───────────────────────────────────
function PartnerRemuneration40b() {
  const [bookProfit, setBookProfit] = useState("");        // book profit before partner remuneration (₹)
  const [paid,       setPaid]       = useState("");        // remuneration actually paid (₹)
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const bp   = parseFloat(bookProfit) || 0;
  const paidV = parseFloat(paid)      || 0;

  // FY 2024-25 (AY 2025-26) revised 40(b) slabs (Finance (No.2) Act 2024):
  // up to ₹6,00,000 of book profit (or loss): higher of ₹3,00,000 or 90%
  // balance above ₹6,00,000: 60%
  const slab1Cap = 600000;
  const tier1 = bp <= 0 ? 300000 : Math.max(300000, Math.min(bp, slab1Cap) * 0.90);
  const tier2 = bp > slab1Cap ? (bp - slab1Cap) * 0.60 : 0;
  const allowable = Math.round(tier1 + tier2);
  const disallowed = Math.max(0, Math.round(paidV - allowable));
  const within = paidV <= allowable;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Partner Remuneration Limit (Sec 40(b))</h2>
        <p className="text-xs text-[var(--color-muted)]">Working-partner salary deductible by a firm/LLP is capped by book profit. Revised FY25 slabs: higher of ₹3L or 90% on the first ₹6L, plus 60% on the balance.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Book profit (before remuneration) (₹)</label>
            <input type="number" value={bookProfit} onChange={e => setBookProfit(e.target.value)} placeholder="e.g. 2500000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Remuneration actually paid (₹)</label>
            <input type="number" min={0} value={paid} onChange={e => setPaid(e.target.value)} placeholder="e.g. 2000000" className={inp} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "On first ₹6L (90% / min ₹3L)", value: fc(Math.round(tier1)), color: "text-blue-400" },
          { label: "On balance (60%)",             value: fc(Math.round(tier2)), color: "text-blue-400" },
          { label: "Max allowable u/s 40(b)",       value: fc(allowable),         color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {paidV > 0 && (
        <div className={`rounded-lg p-4 border ${within ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
          <p className={`text-sm font-bold ${within ? "text-green-400" : "text-red-400"}`}>
            {within
              ? `✓ Remuneration of ${fc(paidV)} is within the ₹${(allowable/100000).toFixed(1)}L limit - fully deductible. Headroom: ${fc(allowable - paidV)}.`
              : `⚠ ${fc(disallowed)} exceeds the 40(b) limit and is disallowed - add it back to the firm's income (the partner is still taxed on the full amount received).`}
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Applies only to working partners with remuneration authorised by the partnership deed. Interest to partners is separately capped at 12% p.a. Remuneration is taxable as business income in the partner's hands under Sec 28(v). Indicative - verify with your CA.</p>
    </div>
  );
}

// ── New-Employee Deduction (Sec 80JJAA) ──────────────────────────────────────
function NewEmployee80JJAA() {
  const [newEmployees, setNewEmployees] = useState("");    // count of additional employees
  const [monthlyWage,  setMonthlyWage]  = useState("");    // monthly emoluments per employee (₹)
  const [daysWorked,   setDaysWorked]   = useState("300"); // days employed in the year
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const n    = parseInt(newEmployees) || 0;
  const wage = parseFloat(monthlyWage) || 0;
  const days = parseInt(daysWorked)    || 0;

  const wageCapOk = wage <= 25000;       // emolument cap ₹25,000/month
  const daysOk    = days >= 240;         // ≥240 days (≥150 for apparel/footwear/leather)
  const eligible  = wageCapOk && daysOk && n > 0;

  const additionalWages = eligible ? n * wage * 12 : 0;
  const yearDeduction   = Math.round(additionalWages * 0.30); // 30% of additional employee cost
  const threeYearBenefit = yearDeduction * 3;                 // claimable for 3 consecutive AYs

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><UserPlus size={14} className="text-[var(--color-primary)]" /> New-Employee Deduction (Sec 80JJAA)</h2>
        <p className="text-xs text-[var(--color-muted)]">Businesses subject to tax audit get an extra 30% deduction on the cost of additional employees, for three consecutive assessment years.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Additional employees</label>
            <input type="number" min={0} value={newEmployees} onChange={e => setNewEmployees(e.target.value)} placeholder="e.g. 10" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly emoluments/employee (₹)</label>
            <input type="number" min={0} value={monthlyWage} onChange={e => setMonthlyWage(e.target.value)} placeholder="e.g. 22000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Days employed in year</label>
            <input type="number" min={0} value={daysWorked} onChange={e => setDaysWorked(e.target.value)} placeholder="e.g. 300" className={inp} />
          </div>
        </div>
        <div className="space-y-1">
          <p className={`text-[11px] flex items-center gap-1.5 ${wageCapOk ? "text-green-400" : "text-red-400"}`}>{wageCapOk ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} Emoluments ≤ ₹25,000/month {wageCapOk ? "" : "- wage exceeds cap, employee ineligible"}</p>
          <p className={`text-[11px] flex items-center gap-1.5 ${daysOk ? "text-green-400" : "text-red-400"}`}>{daysOk ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} Employed ≥ 240 days {daysOk ? "" : "- short tenure; carry to next year if 240 days met"}</p>
        </div>
      </div>

      {n > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "Additional employee cost (yr)", value: fc(additionalWages), color: "text-blue-400" },
            { label: "Deduction this year (30%)",      value: fc(yearDeduction),   color: "text-[var(--color-primary)]" },
            { label: "Total over 3 AYs",               value: fc(threeYearBenefit), color: "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {n > 0 && !eligible && (
        <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
          <p className="text-sm font-bold text-red-400">⚠ Not eligible this year - emoluments must be ≤ ₹25,000/month and the employee must work ≥ 240 days (≥ 150 for apparel/footwear/leather). Payments must be via non-cash mode.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Requires Form 10DA from a CA. Employees who join after PF-registration and remain ≥ 240 days count as "additional". Casual employees and those whose full PF is paid by government are excluded. Indicative - confirm with your CA.</p>
    </div>
  );
}

// ── ESOP Perquisite & Capital Gains Tax ──────────────────────────────────────
function EsopTaxPlanner() {
  const [shares,    setShares]    = useState("");          // shares exercised
  const [exercise,  setExercise]  = useState("");          // exercise/strike price per share (₹)
  const [fmvExer,   setFmvExer]   = useState("");          // FMV per share at exercise (₹)
  const [salePrice, setSalePrice] = useState("");          // sale price per share (₹), optional
  const [holdMonths, setHoldMonths] = useState("");        // months held after exercise
  const [listed,    setListed]    = useState(true);        // listed shares?
  const [slabRate,  setSlabRate]  = useState("30");        // employee's marginal slab %
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const qty  = parseFloat(shares)    || 0;
  const ex   = parseFloat(exercise)  || 0;
  const fmvE = parseFloat(fmvExer)   || 0;
  const sale = parseFloat(salePrice) || 0;
  const mo   = parseInt(holdMonths)  || 0;
  const rate = parseFloat(slabRate)  || 0;

  // Stage 1 - perquisite at exercise = (FMV - exercise) × shares, taxed at slab + 4% cess.
  const perqPerShare = Math.max(0, fmvE - ex);
  const perquisite   = perqPerShare * qty;
  const perqTax      = Math.round(perquisite * rate / 100 * 1.04);

  // Stage 2 - capital gain at sale = (Sale - FMV-at-exercise) × shares.
  const cgPerShare = sale > 0 ? sale - fmvE : 0;
  const capGain    = cgPerShare * qty;
  const ltThreshold = listed ? 12 : 24;
  const isLong = mo >= ltThreshold;
  // Listed: STCG 20%, LTCG 12.5% above ₹1.25L. Unlisted: STCG at slab, LTCG 12.5%.
  let cgTax = 0;
  if (capGain > 0) {
    if (listed) {
      const taxable = isLong ? Math.max(0, capGain - 125000) : capGain;
      cgTax = Math.round(taxable * (isLong ? 12.5 : 20) / 100 * 1.04);
    } else {
      cgTax = Math.round(capGain * (isLong ? 12.5 : rate) / 100 * 1.04);
    }
  }
  const totalTax = perqTax + cgTax;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Gift size={14} className="text-[var(--color-primary)]" /> ESOP Tax - Perquisite + Capital Gains</h2>
        <p className="text-xs text-[var(--color-muted)]">ESOPs are taxed twice: a salary perquisite at exercise (FMV − strike), then capital gains at sale (sale − FMV-at-exercise).</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Shares exercised</label>
            <input type="number" min={0} value={shares} onChange={e => setShares(e.target.value)} placeholder="e.g. 1000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Exercise/strike price (₹)</label>
            <input type="number" min={0} value={exercise} onChange={e => setExercise(e.target.value)} placeholder="e.g. 50" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">FMV at exercise (₹)</label>
            <input type="number" min={0} value={fmvExer} onChange={e => setFmvExer(e.target.value)} placeholder="e.g. 200" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sale price/share (₹, optional)</label>
            <input type="number" min={0} value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="e.g. 350" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Months held after exercise</label>
            <input type="number" min={0} value={holdMonths} onChange={e => setHoldMonths(e.target.value)} placeholder="e.g. 18" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Your marginal slab (%)</label>
            <input type="number" min={0} max={30} value={slabRate} onChange={e => setSlabRate(e.target.value)} placeholder="30" className={inp} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={listed} onChange={e => setListed(e.target.checked)} className="accent-[var(--color-primary)]" />
          <span>Listed shares (STT paid) - uncheck for unlisted/startup shares</span>
        </label>
      </div>

      {qty > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Perquisite at exercise", value: fc(perquisite), color: "text-blue-400" },
              { label: "Tax on perquisite",      value: fc(perqTax),    color: "text-orange-400" },
              { label: `Capital gain (${isLong ? "LTCG" : "STCG"})`, value: fc(Math.max(0, capGain)), color: "text-blue-400" },
              { label: "Tax on capital gain",    value: fc(cgTax),      color: "text-orange-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
            <p className="text-sm font-bold text-red-400">Total ESOP tax: {fc(totalTax)}{sale === 0 && " (perquisite only - enter a sale price to add capital gains)"}.</p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Eligible-startup (Sec 80-IAC / DPIIT) employees may defer the perquisite TDS up to the earliest of 5 years, sale, or leaving. FMV of unlisted shares needs a merchant-banker valuation. Listed LTCG enjoys the ₹1.25L exemption shared across all equity. Indicative - confirm with your CA.</p>
    </div>
  );
}

// ── Share Buyback Tax (Sec 115QA → 194 from Oct 2024) ────────────────────────
function BuybackTax115QA() {
  const [regime,    setRegime]    = useState<"new" | "old">("new"); // post / pre 1-Oct-2024
  const [amount,    setAmount]    = useState("");          // total buyback consideration (₹)
  const [issuePrice, setIssuePrice] = useState("");        // amount originally received on issue (₹)
  const [slabRate,  setSlabRate]  = useState("30");        // shareholder marginal slab (%)
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const amt  = parseFloat(amount)     || 0;
  const issue = parseFloat(issuePrice) || 0;
  const rate = parseFloat(slabRate)   || 0;

  // OLD regime (until 30-Sep-2024): company pays 20% (115QA) on (buyback − issue proceeds);
  // proceeds exempt for shareholder under Sec 10(34A).
  const oldDistributed = Math.max(0, amt - issue);
  const oldCompanyTax  = Math.round(oldDistributed * 0.20 * 1.12 * 1.04); // 20% + 12% sur + 4% cess
  // NEW regime (from 1-Oct-2024): full buyback amount is a deemed dividend taxed in the
  // shareholder's hands at slab; issue cost becomes a capital loss to carry/set off.
  const newDividend   = amt;
  const newShareholderTax = Math.round(newDividend * rate / 100 * 1.04);
  const newCapitalLoss = issue; // available to set off against capital gains

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Share Buyback Tax (115QA → 194)</h2>
        <p className="text-xs text-[var(--color-muted)]">From 1 Oct 2024 the buyback-tax shifted from the company (20% u/s 115QA) to the shareholder, where the whole consideration is a deemed dividend taxed at slab.</p>
        <div className="flex gap-2">
          {([["new","From 1-Oct-2024 (deemed dividend)"],["old","Until 30-Sep-2024 (115QA @20%)"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setRegime(k)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${regime === k ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total buyback consideration (₹)</label>
            <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 1000000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount received on original issue (₹)</label>
            <input type="number" min={0} value={issuePrice} onChange={e => setIssuePrice(e.target.value)} placeholder="e.g. 200000" className={inp} />
          </div>
          {regime === "new" && (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Shareholder marginal slab (%)</label>
              <input type="number" min={0} max={30} value={slabRate} onChange={e => setSlabRate(e.target.value)} placeholder="30" className={inp} />
            </div>
          )}
        </div>
      </div>

      {amt > 0 && regime === "old" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Distributed income (buyback − issue)</p>
            <p className="text-lg font-bold tabular-nums text-blue-400">{fc(oldDistributed)}</p>
          </div>
          <div className="bg-[var(--color-surface)] border border-red-800/30 rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Company buyback tax (20% + sur + cess)</p>
            <p className="text-lg font-bold tabular-nums text-red-400">{fc(oldCompanyTax)}</p>
          </div>
          <p className="md:col-span-2 text-[11px] text-green-400 flex items-center gap-1.5"><CheckCircle2 size={11} /> Proceeds are exempt in the shareholder's hands under Sec 10(34A).</p>
        </div>
      )}

      {amt > 0 && regime === "new" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "Deemed dividend (full amount)", value: fc(newDividend), color: "text-blue-400" },
            { label: "Shareholder tax at slab",        value: fc(newShareholderTax), color: "text-red-400" },
            { label: "Capital loss available (c/f)",   value: fc(newCapitalLoss), color: "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />New regime: the company has no 115QA tax but must withhold TDS u/s 194 (10% for residents) on the consideration; the cost of acquisition is treated as a capital loss the shareholder can carry forward 8 years. Indicative - confirm with your CA.</p>
    </div>
  );
}

function CashWithdrawal194N() {
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc = formatCurrency;
  const [withdrawal, setWithdrawal] = useState("");
  const [filedReturns, setFiledReturns] = useState(true); // filed ITR for all 3 preceding years?
  const [coopOrPost, setCoopOrPost] = useState(false);    // co-operative society payer (₹3cr threshold)

  const amt = parseFloat(withdrawal) || 0;
  // Filer: threshold ₹1 cr (₹3 cr for co-op society). Non-filer (3 yrs): ₹20L-₹1cr @2%, above ₹1cr @5%.
  const baseThreshold = coopOrPost ? 30000000 : 10000000;
  let tds = 0;
  const breakup: { label: string; value: number }[] = [];
  if (filedReturns) {
    if (amt > baseThreshold) {
      const slab = amt - baseThreshold;
      tds = Math.round(slab * 0.02);
      breakup.push({ label: `2% on excess over ${fc(baseThreshold)}`, value: tds });
    }
  } else {
    const t1Lo = 2000000, t1Hi = baseThreshold;
    const band2 = Math.max(0, Math.min(amt, t1Hi) - t1Lo); // 20L-1cr @2%
    const band5 = Math.max(0, amt - t1Hi);                 // above 1cr @5%
    const tds2 = Math.round(band2 * 0.02);
    const tds5 = Math.round(band5 * 0.05);
    tds = tds2 + tds5;
    if (band2 > 0) breakup.push({ label: `2% on ${fc(t1Lo)}-${fc(t1Hi)} band`, value: tds2 });
    if (band5 > 0) breakup.push({ label: `5% on amount above ${fc(t1Hi)}`, value: tds5 });
  }
  const netReceived = amt - tds;

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><HandCoins size={14} className="text-[var(--color-primary)]" /> TDS on Cash Withdrawal (Sec 194N)</h2>
        <p className="text-xs text-[var(--color-muted)]">Banks/post offices deduct TDS on aggregate cash withdrawals in a financial year. The threshold and rate depend on whether you have filed income-tax returns for the three preceding years.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Aggregate cash withdrawn this FY (₹)</label>
          <input type="number" min={0} value={withdrawal} onChange={e => setWithdrawal(e.target.value)} placeholder="e.g. 15000000" className={inp} />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={filedReturns} onChange={e => setFiledReturns(e.target.checked)} className="accent-[var(--color-primary)]" />
          <span>ITR filed for all 3 preceding years (threshold ₹1 cr, flat 2%)</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={coopOrPost} onChange={e => setCoopOrPost(e.target.checked)} className="accent-[var(--color-primary)]" />
          <span>Payer is a co-operative society (threshold raised to ₹3 cr)</span>
        </label>
      </div>

      {amt > 0 && (
        <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${tds > 0 ? "border-orange-700/40" : "border-green-700/40"}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${tds > 0 ? "bg-orange-950/30 text-orange-400 border-orange-800/30" : "bg-green-950/30 text-green-400 border-green-800/30"}`}>
              {tds > 0 ? "194N TDS applies" : "Below threshold"}
            </span>
            <span className="text-xs text-[var(--color-muted)]">{filedReturns ? "Filer" : "Non-filer"} status</span>
          </div>
          <div className="space-y-2">
            {[
              { label: "Cash withdrawn", value: fc(amt), color: "text-[var(--color-text)]" },
              ...breakup.map(b => ({ label: b.label, value: fc(b.value), color: "text-orange-400" })),
              { label: "Total TDS u/s 194N", value: fc(tds), color: "text-red-400 font-bold" },
              { label: "Net amount received", value: fc(netReceived), color: "text-green-400 font-semibold" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3 pt-2 border-t border-[var(--color-border)]">194N TDS is not an expense - it is creditable against your final tax liability and shows in Form 26AS. Claim it while filing your ITR.</p>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Filer: 2% above ₹1 cr. Non-filer (no ITR for 3 years): 2% between ₹20 lakh and ₹1 cr, 5% above ₹1 cr. Co-operative society payers get a ₹3 cr threshold (Finance Act 2023). Indicative - confirm with your bank/CA.
      </div>
    </div>
  );
}

function Msme43BhChecker() {
  type DueEntry = { id: string; vendor: string; amount: number; hasAgreement: boolean; daysOutstanding: number };
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc = formatCurrency;
  const [entries, setEntries] = useFeatureState<DueEntry[]>("tax-43bh-entries", []);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [hasAgreement, setHasAgreement] = useState(true);
  const [days, setDays] = useState("");

  // 43B(h): payments to Micro/Small enterprises must be paid within 45 days (written agreement) or 15 days (no agreement),
  // else the expense is disallowed in the year of accrual and allowed only in the year of actual payment.
  const limitFor = (e: { hasAgreement: boolean }) => (e.hasAgreement ? 45 : 15);
  const isDisallowed = (e: DueEntry) => e.daysOutstanding > limitFor(e);

  const addEntry = () => {
    const amt = parseFloat(amount) || 0;
    const d = parseInt(days) || 0;
    if (!vendor.trim() || amt <= 0) { toast.error("Enter vendor name and amount"); return; }
    setEntries(prev => [...prev, { id: crypto.randomUUID(), vendor: vendor.trim(), amount: amt, hasAgreement, daysOutstanding: d }]);
    setVendor(""); setAmount(""); setDays("");
    toast.success("MSME due added");
  };

  const disallowed = entries.filter(isDisallowed);
  const totalDisallowed = disallowed.reduce((s, e) => s + e.amount, 0);
  const totalDue = entries.reduce((s, e) => s + e.amount, 0);
  const taxImpact = Math.round(totalDisallowed * 0.30); // ~30% notional rate on disallowed deduction

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><BadgePercent size={14} className="text-[var(--color-primary)]" /> MSME Payment Disallowance (Sec 43B(h))</h2>
        <p className="text-xs text-[var(--color-muted)]">Amounts owed to Micro/Small enterprises (registered under the MSMED Act) unpaid beyond 45 days (with a written agreement) or 15 days (without) are disallowed as a deduction until actually paid. Track ageing here.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="MSME vendor name *" className={inp} />
          <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount payable (₹) *" className={inp} />
          <input type="number" min={0} value={days} onChange={e => setDays(e.target.value)} placeholder="Days outstanding" className={inp} />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={hasAgreement} onChange={e => setHasAgreement(e.target.checked)} className="accent-[var(--color-primary)]" />
          <span>Written agreement exists (45-day limit; otherwise 15 days)</span>
        </label>
        <button onClick={addEntry} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add MSME due</button>
      </div>

      {entries.length > 0 && (<>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total MSME dues", value: fc(totalDue), color: "text-blue-400" },
            { label: "At-risk disallowance", value: fc(totalDisallowed), color: totalDisallowed > 0 ? "text-red-400" : "text-green-400" },
            { label: "Est. extra tax (~30%)", value: fc(taxImpact), color: taxImpact > 0 ? "text-orange-400" : "text-green-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Vendor", "Amount", "Limit", "Days", "Status", ""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {entries.map(e => {
                const bad = isDisallowed(e);
                return (
                  <tr key={e.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 font-medium text-xs">{e.vendor}</td>
                    <td className="px-3 py-2.5 tabular-nums text-xs">{fc(e.amount)}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{limitFor(e)}d</td>
                    <td className="px-3 py-2.5 tabular-nums text-xs">{e.daysOutstanding}d</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${bad ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>
                        {bad ? "Disallowed" : "Within limit"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><button onClick={() => setEntries(prev => prev.filter(x => x.id !== e.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>)}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        43B(h) applies only to Micro and Small enterprises (not Medium) holding MSME registration. Clearing the dues before 31 March restores the deduction. Verify each vendor's Udyam status - confirm with your CA.
      </div>
    </div>
  );
}

function PresumptiveVsBooks() {
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc = formatCurrency;
  const [scheme, setScheme] = useState<"44ad" | "44ada">("44ad");
  const [turnover, setTurnover] = useState("");
  const [digital, setDigital] = useState(false);
  const [actualExpenses, setActualExpenses] = useState("");

  const slabTax = (taxable: number) => {
    const slabs: [number, number, number][] = [
      [0, 300000, 0], [300000, 700000, 0.05], [700000, 1000000, 0.10],
      [1000000, 1200000, 0.15], [1200000, 1500000, 0.20], [1500000, Infinity, 0.30],
    ];
    let tax = 0, rem = taxable;
    for (const [lo, hi, r] of slabs) { if (rem <= 0) break; const t = Math.min(rem, hi - lo); tax += t * r; rem -= t; }
    return Math.round(tax * 1.04); // incl 4% cess
  };

  const t = parseFloat(turnover) || 0;
  const exp = parseFloat(actualExpenses) || 0;
  const presumptivePct = scheme === "44ad" ? (digital ? 6 : 8) : 50;
  const presumptiveIncome = Math.round(t * presumptivePct / 100);
  const booksIncome = Math.max(0, t - exp);
  const presumptiveTax = slabTax(presumptiveIncome);
  const booksTax = slabTax(booksIncome);
  const cheaper = presumptiveTax <= booksTax ? "presumptive" : "books";
  const saving = Math.abs(presumptiveTax - booksTax);

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><GitCompare size={14} className="text-[var(--color-primary)]" /> Presumptive vs Regular Books</h2>
        <p className="text-xs text-[var(--color-muted)]">If your actual profit margin is lower than the presumptive 6%/8% (or 50%), maintaining books and getting audited may save tax. Compare both paths side-by-side.</p>
        <div className="flex gap-2">
          {([["44ad", "44AD - Business"], ["44ada", "44ADA - Profession"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setScheme(k)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${scheme === k ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">{scheme === "44ad" ? "Turnover" : "Gross receipts"} (₹)</label>
            <input type="number" min={0} value={turnover} onChange={e => setTurnover(e.target.value)} placeholder="e.g. 5000000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Actual expenses (₹)</label>
            <input type="number" min={0} value={actualExpenses} onChange={e => setActualExpenses(e.target.value)} placeholder="e.g. 4000000" className={inp} />
          </div>
        </div>
        {scheme === "44ad" && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={digital} onChange={e => setDigital(e.target.checked)} className="accent-[var(--color-primary)]" />
            <span>All receipts digital (6% presumptive rate instead of 8%)</span>
          </label>
        )}
      </div>

      {t > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([
            { key: "presumptive", title: `Presumptive (${presumptivePct}%)`, income: presumptiveIncome, tax: presumptiveTax },
            { key: "books", title: "Regular Books", income: booksIncome, tax: booksTax },
          ] as const).map(c => (
            <div key={c.key} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${cheaper === c.key ? "border-green-700/50" : "border-[var(--color-border)]"}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold">{c.title}</p>
                {cheaper === c.key && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-800/40 font-medium">Cheaper</span>}
              </div>
              <p className="text-[11px] text-[var(--color-muted)]">Taxable income</p>
              <p className="text-sm font-semibold tabular-nums mb-2">{fc(c.income)}</p>
              <p className="text-[11px] text-[var(--color-muted)]">Tax (incl. cess)</p>
              <p className={`text-lg font-bold tabular-nums ${cheaper === c.key ? "text-green-400" : "text-orange-400"}`}>{fc(c.tax)}</p>
            </div>
          ))}
        </div>
      )}

      {t > 0 && saving > 0 && (
        <div className="bg-green-950/20 border border-green-800/30 rounded-lg px-4 py-3 text-xs text-green-300">
          Opting for <span className="font-semibold">{cheaper === "presumptive" ? "presumptive scheme" : "regular books"}</span> saves about <span className="font-bold">{fc(saving)}</span> in tax. {cheaper === "books" ? "Note: books route requires bookkeeping and a tax audit if you previously opted out of presumptive." : "Presumptive avoids audit and bookkeeping burden."}
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Declaring below the presumptive rate while above the basic exemption requires books and audit u/s 44AB. Opting out of 44AD locks you out for 5 years. Indicative slabs (new regime) - confirm with your CA.
      </div>
    </div>
  );
}

function SurchargeMarginalRelief() {
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc = formatCurrency;
  const [income, setIncome] = useState("");
  const [regime, setRegime] = useState<"new" | "old">("new");

  // Surcharge slabs (individuals). New regime caps surcharge at 25%.
  const surchargeRate = (inc: number) => {
    if (inc <= 5000000) return 0;
    if (inc <= 10000000) return 0.10;
    if (inc <= 20000000) return 0.15;
    if (regime === "new") return 0.25; // new regime: max 25% above ₹2 cr
    if (inc <= 50000000) return 0.25;
    return 0.37;
  };

  const baseTax = (taxable: number) => {
    const slabsNew: [number, number, number][] = [
      [0, 300000, 0], [300000, 700000, 0.05], [700000, 1000000, 0.10],
      [1000000, 1200000, 0.15], [1200000, 1500000, 0.20], [1500000, Infinity, 0.30],
    ];
    const slabsOld: [number, number, number][] = [
      [0, 250000, 0], [250000, 500000, 0.05], [500000, 1000000, 0.20], [1000000, Infinity, 0.30],
    ];
    const slabs = regime === "new" ? slabsNew : slabsOld;
    let tax = 0, rem = taxable;
    for (const [lo, hi, r] of slabs) { if (rem <= 0) break; const t = Math.min(rem, hi - lo); tax += t * r; rem -= t; }
    return tax;
  };

  const inc = parseFloat(income) || 0;
  const tax = baseTax(inc);
  const sr = surchargeRate(inc);
  const surchargeRaw = tax * sr;

  // Marginal relief: surcharge cannot exceed the income above the threshold beyond the extra tax+surcharge.
  const thresholds = [5000000, 10000000, 20000000, 50000000];
  let marginalRelief = 0;
  if (sr > 0) {
    const applicableThreshold = thresholds.filter(th => inc > th).reduce((a, b) => Math.max(a, b), 0);
    const taxAtThreshold = baseTax(applicableThreshold);
    const surchargeAtThreshold = taxAtThreshold * surchargeRate(applicableThreshold);
    const totalWithSurcharge = tax + surchargeRaw;
    const totalAtThreshold = taxAtThreshold + surchargeAtThreshold;
    const incomeAboveThreshold = inc - applicableThreshold;
    const excessTax = totalWithSurcharge - totalAtThreshold;
    if (excessTax > incomeAboveThreshold) marginalRelief = excessTax - incomeAboveThreshold;
  }

  const surchargeAfterRelief = Math.max(0, surchargeRaw - marginalRelief);
  const cess = Math.round((tax + surchargeAfterRelief) * 0.04);
  const totalTax = Math.round(tax + surchargeAfterRelief + cess);

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Sigma size={14} className="text-[var(--color-primary)]" /> Surcharge & Marginal Relief</h2>
        <p className="text-xs text-[var(--color-muted)]">High incomes attract a surcharge on the income tax. Marginal relief ensures the extra tax never exceeds the income earned above the surcharge threshold.</p>
        <div className="flex gap-2">
          {([["new", "New Regime (cap 25%)"], ["old", "Old Regime (up to 37%)"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setRegime(k)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${regime === k ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {lbl}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Total taxable income (₹)</label>
          <input type="number" min={0} value={income} onChange={e => setIncome(e.target.value)} placeholder="e.g. 5200000" className={inp} />
        </div>
      </div>

      {inc > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold px-2 py-0.5 rounded border bg-orange-950/30 text-orange-400 border-orange-800/30">Surcharge {Math.round(sr * 100)}%</span>
            {marginalRelief > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded border bg-green-950/30 text-green-400 border-green-800/30">Marginal relief applies</span>}
          </div>
          <div className="space-y-2">
            {[
              { label: "Income tax (before surcharge)", value: fc(Math.round(tax)), color: "text-[var(--color-text)]" },
              { label: `Surcharge @ ${Math.round(sr * 100)}%`, value: fc(Math.round(surchargeRaw)), color: "text-orange-400" },
              ...(marginalRelief > 0 ? [{ label: "Less: Marginal relief", value: `(${fc(Math.round(marginalRelief))})`, color: "text-green-400" }] : []),
              { label: "Surcharge after relief", value: fc(Math.round(surchargeAfterRelief)), color: "text-[var(--color-text)]" },
              { label: "Health & Education Cess (4%)", value: fc(cess), color: "text-orange-400" },
              { label: "Total tax payable", value: fc(totalTax), color: "text-red-400 font-bold" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Surcharge: 10% &gt;₹50L, 15% &gt;₹1cr, 25% &gt;₹2cr, 37% &gt;₹5cr (old regime only; new regime caps at 25%). Surcharge on capital gains/dividends is capped at 15%. Indicative individual rates - confirm with your CA.
      </div>
    </div>
  );
}

// ── Tax Depth (server-backed /api/books/tax): 194Q/206C, 269ST, depreciation recon, ITR variance ──
function TaxDepthServer() {
  const fc = formatCurrency;
  const [q, setQ] = useState({ myTurnoverPrevFy: "", counterpartyTurnoverPrevFy: "", aggregateValueFy: "", iAmBuyer: true });
  const [qRes, setQRes] = useState<any>(null);
  const [st, setSt] = useState<any>(null);
  const [dep, setDep] = useState<any>(null);
  const [variance, setVariance] = useState<any>(null);
  useEffect(() => {
    api.get("/api/books/tax/269st").then(setSt).catch(() => {});
    api.get("/api/books/tax/depreciation-recon").then(setDep).catch(() => {});
    api.get("/api/books/tax/itr-variance").then(setVariance).catch(() => {});
  }, []);
  const runQ = async () => {
    try { setQRes(await api.post("/api/books/tax/194q-206c", { myTurnoverPrevFy: Number(q.myTurnoverPrevFy) || 0, counterpartyTurnoverPrevFy: Number(q.counterpartyTurnoverPrevFy) || 0, aggregateValueFy: Number(q.aggregateValueFy) || 0, iAmBuyer: q.iAmBuyer })); }
    catch (e) { toast.error((e as Error).message); }
  };
  const card = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5";
  const row = "flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0";
  return (
    <div className="space-y-4 max-w-3xl">
      {/* 194Q vs 206C(1H) */}
      <div className={card}>
        <h3 className="text-sm font-semibold mb-1">194Q (buyer TDS) vs 206C(1H) (seller TCS) — applicability</h3>
        <p className="text-xs text-[var(--color-muted)] mb-3">0.1% on value over ₹50L when the liable party's prior-FY turnover &gt; ₹10cr. 194Q takes precedence over 206C(1H).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">My turnover (prev FY) ₹</label><input type="number" className={INP} value={q.myTurnoverPrevFy} onChange={e => setQ({ ...q, myTurnoverPrevFy: e.target.value })} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Counterparty turnover ₹</label><input type="number" className={INP} value={q.counterpartyTurnoverPrevFy} onChange={e => setQ({ ...q, counterpartyTurnoverPrevFy: e.target.value })} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Transaction value (FY) ₹</label><input type="number" className={INP} value={q.aggregateValueFy} onChange={e => setQ({ ...q, aggregateValueFy: e.target.value })} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">My role</label><select className={INP} value={q.iAmBuyer ? "buyer" : "seller"} onChange={e => setQ({ ...q, iAmBuyer: e.target.value === "buyer" })}><option value="buyer">Buyer</option><option value="seller">Seller</option></select></div>
        </div>
        <button onClick={runQ} className="mt-3 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold">Check applicability</button>
        {qRes && (
          <div className="mt-3 text-sm">
            <p className="font-semibold">{qRes.section === "none" ? "Neither applies" : `${qRes.section} — ${qRes.who}`}{qRes.section !== "none" && ` @ ${qRes.rate_pct}% = ${fc(qRes.amount)}`}</p>
            <p className="text-xs text-[var(--color-muted)] mt-1">{qRes.precedence_note} {qRes.liable_on_me ? "This obligation is on YOU." : ""}</p>
          </div>
        )}
      </div>

      {/* Depreciation recon + deferred tax */}
      <div className={card}>
        <h3 className="text-sm font-semibold mb-2">Book vs IT depreciation → deferred tax</h3>
        {dep ? (
          <div className="space-y-2">
            <div className={row}><span className="text-xs text-[var(--color-muted)]">Book depreciation (Companies Act)</span><span className="tabular-nums">{fc(dep.book_depreciation)}</span></div>
            <div className={row}><span className="text-xs text-[var(--color-muted)]">IT-Act block depreciation</span><span className="tabular-nums">{fc(dep.it_depreciation)}</span></div>
            <div className={row}><span className="text-xs text-[var(--color-muted)]">Timing difference</span><span className="tabular-nums">{fc(dep.timing_difference)}</span></div>
            <div className={row}><span className="text-xs font-semibold">{dep.deferred_tax_liability ? "Deferred Tax Liability" : "Deferred Tax Asset"} @ {dep.tax_rate_pct}%</span><span className="tabular-nums font-bold text-orange-400">{fc(dep.deferred_tax_liability || dep.deferred_tax_asset)}</span></div>
            <p className="text-[10px] text-[var(--color-muted)]">{dep.note}</p>
          </div>
        ) : <p className="text-xs text-[var(--color-muted)]">Loading…</p>}
      </div>

      {/* 269ST + ITR variance */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className="text-sm font-semibold mb-2">269ST cash-receipt alerts</h3>
          {st ? (st.breaches.length === 0 ? <p className="text-xs text-emerald-400">No cash receipts ≥ ₹2L flagged.</p> : (
            <div className="space-y-1">
              {st.breaches.slice(0, 6).map((b: any, i: number) => <p key={i} className="text-xs text-red-400">⚠ {b.date} · {b.party}: {fc(b.cash_received)}</p>)}
              <p className="text-[10px] text-[var(--color-muted)]">{st.note}</p>
            </div>
          )) : <p className="text-xs text-[var(--color-muted)]">Loading…</p>}
        </div>
        <div className={card}>
          <h3 className="text-sm font-semibold mb-2">ITR-to-books variance</h3>
          {variance ? (
            <div className="space-y-1 text-xs">
              <p>Books net profit: <b className="text-[var(--color-text)]">{fc(variance.books_net_profit)}</b></p>
              {variance.adjustments.map((a: any, i: number) => <p key={i} className="text-[var(--color-muted)]">{a.effect === "add to income" ? "+" : "−"} {a.item}: {fc(Math.abs(a.amount))}</p>)}
              <p className="font-semibold pt-1">Est. business income: {fc(variance.estimated_business_income)}</p>
            </div>
          ) : <p className="text-xs text-[var(--color-muted)]">Loading…</p>}
        </div>
      </div>
    </div>
  );
}
