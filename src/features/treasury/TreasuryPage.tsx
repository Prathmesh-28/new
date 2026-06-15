import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Wallet, Layers, GitCompareArrows, PieChart, Calculator, Landmark,
  Target, Users, Percent, CalendarClock, Droplets, Plus, TrendingUp,
  AlertTriangle, CheckCircle2, Repeat, Scale, ShieldCheck, Building2,
  Coins, CreditCard, Gift, Receipt, Scale3d, LineChart, Waves,
  Gem, Building, Activity, ShieldAlert, FileText, Clock, ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, addMonths, differenceInCalendarDays } from "date-fns";

// shared styles (reused from TaxPage/DebtPage input convention)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type Tab =
  | "overview" | "sweep" | "ladder" | "compare" | "allocate" | "yield"
  | "tbill" | "goal" | "split" | "posttax" | "maturity"
  | "sip" | "debteq" | "emergency" | "sweepfd" | "corpfd" | "smallsave"
  | "swod" | "income" | "capgain" | "rebalance" | "xirr" | "waterfall"
  | "gold" | "reit" | "mtm" | "dicgc" | "policy" | "accrued" | "almatch";

export default function TreasuryPage() {
  const { store } = useApp();
  const totalBalance = useMemo(
    () => store.bankAccounts.reduce((s, b) => s + (b.balance || 0), 0),
    [store.bankAccounts],
  );
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet size={18} className="text-[var(--color-primary)]" /> Wealth &amp; Treasury
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Turn idle current-account cash into risk-graded, tax-efficient yield — sweeps, FD ladders, T-bills and goal buckets.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", "Overview", Wallet],
            ["sweep", "Idle-Cash Sweep", Droplets],
            ["ladder", "FD/RD Ladder", Layers],
            ["compare", "Liquid vs FD", GitCompareArrows],
            ["allocate", "Surplus Allocator", PieChart],
            ["yield", "Yield Calculator", Calculator],
            ["tbill", "T-Bill / G-Sec", Landmark],
            ["goal", "Goal Planner", Target],
            ["split", "Owner Split", Users],
            ["posttax", "Post-Tax Return", Percent],
            ["maturity", "Maturity Calendar", CalendarClock],
            ["sip", "SIP Planner", Repeat],
            ["debteq", "Debt vs Equity", Scale],
            ["emergency", "Emergency Fund", ShieldCheck],
            ["sweepfd", "Sweep-FD Config", Waves],
            ["corpfd", "Corporate FD", Building2],
            ["smallsave", "NSC/KVP/SGB", Coins],
            ["swod", "Sweep vs OD", CreditCard],
            ["income", "Income Tracker", Receipt],
            ["capgain", "Cap-Gains Tax", Scale3d],
            ["rebalance", "Rebalancer", LineChart],
            ["xirr", "Portfolio XIRR", TrendingUp],
            ["waterfall", "Deploy Waterfall", Gift],
            ["gold", "Gold / SGB Planner", Gem],
            ["reit", "REIT / InvIT Income", Building],
            ["mtm", "Mark-to-Market", Activity],
            ["dicgc", "Bank Exposure (DICGC)", ShieldAlert],
            ["policy", "Treasury Policy", FileText],
            ["accrued", "Accrued Interest", Clock],
            ["almatch", "Asset-Liability Match", ArrowLeftRight],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview totalBalance={totalBalance} />}
      {tab === "sweep" && <IdleCashSweepPlanner totalBalance={totalBalance} />}
      {tab === "ladder" && <LadderBuilder />}
      {tab === "compare" && <LiquidVsFdComparator />}
      {tab === "allocate" && <SurplusAllocator totalBalance={totalBalance} />}
      {tab === "yield" && <YieldCalculator />}
      {tab === "tbill" && <TBillEstimator />}
      {tab === "goal" && <GoalPlanner />}
      {tab === "split" && <OwnerSplit />}
      {tab === "posttax" && <PostTaxCalculator />}
      {tab === "maturity" && <MaturityCalendar />}
      {tab === "sip" && <SipPlanner />}
      {tab === "debteq" && <DebtEquityAllocator />}
      {tab === "emergency" && <EmergencyFundCalculator />}
      {tab === "sweepfd" && <SweepFdConfig totalBalance={totalBalance} />}
      {tab === "corpfd" && <CorporateFdComparator />}
      {tab === "smallsave" && <SmallSavingsCalculator />}
      {tab === "swod" && <SweepVsOverdraft />}
      {tab === "income" && <IncomeTracker />}
      {tab === "capgain" && <CapitalGainsEstimator />}
      {tab === "rebalance" && <PortfolioRebalancer />}
      {tab === "xirr" && <XirrCalculator />}
      {tab === "waterfall" && <SurplusWaterfall totalBalance={totalBalance} />}
      {tab === "gold" && <GoldSgbPlanner />}
      {tab === "reit" && <ReitInvitEstimator />}
      {tab === "mtm" && <MarkToMarketTracker />}
      {tab === "dicgc" && <BankExposureLimits />}
      {tab === "policy" && <TreasuryPolicyConfig />}
      {tab === "accrued" && <AccruedInterestCalculator />}
      {tab === "almatch" && <AssetLiabilityMatcher />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ totalBalance }: { totalBalance: number }) {
  const { store } = useApp();
  // Treat a configurable buffer as 8 weeks of payroll/opex proxy; default ₹5L floor.
  const buffer = Math.max(500000, Math.round(totalBalance * 0.35));
  const investable = Math.max(0, totalBalance - buffer);
  // Yield forgone: idle cash at ~3% savings vs ~7% liquid fund on the investable slice.
  const annualForgone = Math.round(investable * (0.07 - 0.03));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Cash (all banks)", value: formatCurrency(totalBalance), color: "text-[var(--color-text)]", sub: `${store.bankAccounts.length} account(s)` },
          { label: "Operating Buffer (est.)", value: formatCurrency(buffer), color: "text-yellow-400", sub: "Keep liquid for opex / payroll" },
          { label: "Investable Surplus", value: formatCurrency(investable), color: "text-green-400", sub: "Above buffer — can earn yield" },
          { label: "Yield Forgone / yr", value: formatCurrency(annualForgone), color: "text-red-400", sub: "Idle @ 3% vs liquid @ 7%" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-2 flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /> Where to put surplus cash</p>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          A working treasury keeps a few weeks of runway liquid, then ladders the rest across instruments by how soon you'll need the money. India-aware defaults below — use the tools to model your own numbers.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { horizon: "0–7 days", instrument: "Overnight / Liquid funds", yield: "~6.5–7%", note: "T+1 redemption, near-zero risk. Best for buffer overflow." },
            { horizon: "1–6 months", instrument: "Short-duration debt / FDs", yield: "~7–7.5%", note: "Ladder maturities to match GST, advance-tax, payroll." },
            { horizon: "6m–3 yrs", instrument: "Corporate FD / G-Secs / T-Bills", yield: "~7.5–8%", note: "Sovereign or AAA only. Lock-in for known future outflows." },
          ].map(r => (
            <div key={r.horizon} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-1">{r.horizon}</p>
              <p className="text-sm font-semibold">{r.instrument}</p>
              <p className="text-xs text-green-400 tabular-nums mt-0.5">{r.yield} p.a.</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-1.5">{r.note}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        Buffer and yields are illustrative estimates, not advice. Liquid/debt fund returns are market-linked and not guaranteed; FD interest above ₹40,000/yr (₹50,000 for seniors) attracts 10% TDS under Sec 194A. Confirm rates and risk with your bank or CA before parking funds.
      </p>
    </div>
  );
}

// ── #1 Idle-Cash Sweep Planner ─────────────────────────────────────────────────
function IdleCashSweepPlanner({ totalBalance }: { totalBalance: number }) {
  const [balance, setBalance] = useState(String(Math.round(totalBalance) || ""));
  const [bufferWeeks, setBufferWeeks] = useState(6);
  const [weeklyOpex, setWeeklyOpex] = useState("");
  const [sweepPct, setSweepPct] = useState(80);
  const [liquidYield, setLiquidYield] = useState("7");

  const bal = parseFloat(balance) || 0;
  const opex = parseFloat(weeklyOpex) || 0;
  const buffer = opex > 0 ? opex * bufferWeeks : Math.round(bal * 0.35);
  const overflow = Math.max(0, bal - buffer);
  const sweep = Math.round(overflow * (sweepPct / 100));
  const kept = bal - sweep;
  const annualYield = Math.round(sweep * (parseFloat(liquidYield) || 0) / 100);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Droplets size={14} className="text-[var(--color-primary)]" /> Idle-Cash Sweep Planner</h3>
        <p className="text-xs text-[var(--color-muted)]">Keep a runway buffer liquid, then sweep the rest into a liquid/overnight fund. Set your weekly operating spend so the buffer is real, not a guess.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Current cash (₹)</label>
            <input type="number" value={balance} onChange={e => setBalance(e.target.value)} placeholder="2500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Weekly opex (₹)</label>
            <input type="number" value={weeklyOpex} onChange={e => setWeeklyOpex(e.target.value)} placeholder="200000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Liquid fund yield (% p.a.)</label>
            <input type="number" value={liquidYield} onChange={e => setLiquidYield(e.target.value)} placeholder="7" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Buffer: <strong className="text-[var(--color-text)]">{bufferWeeks} wk</strong></label>
            <input type="range" min={2} max={16} step={1} value={bufferWeeks} onChange={e => setBufferWeeks(Number(e.target.value))} className="w-full mt-2 accent-[var(--color-primary)]" />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Sweep <strong className="text-[var(--color-text)]">{sweepPct}%</strong> of the cash above buffer</label>
          <input type="range" min={0} max={100} step={5} value={sweepPct} onChange={e => setSweepPct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      {bal > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Buffer held liquid", value: formatCurrency(Math.round(buffer)), color: "text-yellow-400", sub: opex > 0 ? `${bufferWeeks} wk × opex` : "~35% of cash (no opex set)" },
              { label: "Surplus above buffer", value: formatCurrency(Math.round(overflow)), color: "text-[var(--color-text)]", sub: "Eligible to sweep" },
              { label: "Recommended sweep", value: formatCurrency(sweep), color: "text-green-400", sub: `${sweepPct}% of surplus` },
              { label: "Extra yield / year", value: formatCurrency(annualYield), color: "text-green-400", sub: `@ ${liquidYield || 0}% p.a.` },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
            <p className="text-sm font-bold text-green-400 flex items-center gap-2">
              <CheckCircle2 size={14} /> Park {formatCurrency(sweep)} in a liquid fund, keep {formatCurrency(Math.round(kept))} for {opex > 0 ? `~${bufferWeeks} weeks of runway` : "your buffer"}. Liquid funds redeem T+1 (₹50k/25% instant) so the swept cash stays reachable.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Liquid-fund returns are market-linked, not guaranteed. Gains on debt funds bought after Apr-2023 are taxed at slab rates. Keep enough liquid for committed payables and payroll before sweeping.</p>
    </div>
  );
}

// ── #2 FD / RD Ladder Builder ──────────────────────────────────────────────────
function LadderBuilder() {
  const [mode, setMode] = useState<"fd" | "rd">("fd");
  const [amount, setAmount] = useState("");
  const [rungs, setRungs] = useState(4);
  const [tenureMonths, setTenureMonths] = useState("12");
  const [rate, setRate] = useState("7.25");

  const total = parseFloat(amount) || 0;
  const r = (parseFloat(rate) || 0) / 100;
  const maxTenure = Math.max(1, Math.round(parseFloat(tenureMonths) || 12));
  const today = new Date();

  const ladder = useMemo(() => {
    if (total <= 0 || rungs <= 0) return [];
    const step = maxTenure / rungs;
    const perRung = total / rungs;
    return Array.from({ length: rungs }, (_, i) => {
      const months = Math.round(step * (i + 1));
      const years = months / 12;
      if (mode === "fd") {
        // Quarterly compounding FD.
        const maturity = perRung * Math.pow(1 + r / 4, 4 * years);
        return { rung: i + 1, months, invested: perRung, maturity, interest: maturity - perRung, date: addMonths(today, months) };
      }
      // RD: `months` monthly instalments of perRung, compounded quarterly (approx).
      const monthlyRate = r / 12;
      const fv = monthlyRate > 0
        ? perRung * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate)
        : perRung * months;
      const invested = perRung * months;
      return { rung: i + 1, months, invested, maturity: fv, interest: fv - invested, date: addMonths(today, months) };
    });
  }, [total, rungs, maxTenure, r, mode, today]);

  const totalInvested = ladder.reduce((s, l) => s + l.invested, 0);
  const totalMaturity = ladder.reduce((s, l) => s + l.maturity, 0);
  const totalInterest = totalMaturity - totalInvested;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> FD / RD Ladder Builder</h3>
        <p className="text-xs text-[var(--color-muted)]">Split a lump sum across staggered maturities so cash frees up at intervals — beats locking everything in one long FD and losing flexibility.</p>
        <div className="flex gap-2">
          {(["fd", "rd"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${mode === m ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {m === "fd" ? "Fixed Deposit (lump sum)" : "Recurring Deposit (monthly)"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">{mode === "fd" ? "Total to invest (₹)" : "Monthly per rung (₹)"}</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder={mode === "fd" ? "1000000" : "25000"} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Interest rate (% p.a.)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="7.25" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Longest tenure (months)</label>
            <input type="number" value={tenureMonths} onChange={e => setTenureMonths(e.target.value)} placeholder="12" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rungs: <strong className="text-[var(--color-text)]">{rungs}</strong></label>
            <input type="range" min={2} max={8} step={1} value={rungs} onChange={e => setRungs(Number(e.target.value))} className="w-full mt-2 accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {ladder.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total invested", value: formatCurrency(Math.round(totalInvested)), color: "text-[var(--color-text)]" },
              { label: "Total at maturity", value: formatCurrency(Math.round(totalMaturity)), color: "text-green-400" },
              { label: "Total interest", value: formatCurrency(Math.round(totalInterest)), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Ladder rungs</p></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Rung", "Tenure", "Matures on", mode === "fd" ? "Principal" : "Total deposited", "Maturity value", "Interest"].map(h =>
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {ladder.map(l => (
                    <tr key={l.rung} className="hover:bg-white/2">
                      <td className="px-5 py-2.5 tabular-nums">{l.rung}</td>
                      <td className="px-5 py-2.5 tabular-nums">{l.months} mo</td>
                      <td className="px-5 py-2.5">{format(l.date, "d MMM yyyy")}</td>
                      <td className="px-5 py-2.5 tabular-nums">{formatCurrency(Math.round(l.invested))}</td>
                      <td className="px-5 py-2.5 tabular-nums font-semibold">{formatCurrency(Math.round(l.maturity))}</td>
                      <td className="px-5 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(l.interest))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter an amount and rate to build the ladder.</p>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">FD interest is taxed at your slab; banks deduct 10% TDS once interest crosses ₹40,000/yr (₹50,000 seniors). FD assumes quarterly compounding; RD assumes monthly instalments compounded quarterly. Actual bank formulas vary slightly.</p>
    </div>
  );
}

// ── #3 Liquid Fund vs FD Yield Comparator ──────────────────────────────────────
function LiquidVsFdComparator() {
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState("12");
  const [fdRate, setFdRate] = useState("7.25");
  const [liquidRate, setLiquidRate] = useState("7");
  const [slab, setSlab] = useState("30");

  const P = parseFloat(amount) || 0;
  const n = Math.max(1, Math.round(parseFloat(months) || 12));
  const years = n / 12;
  const slabRate = (parseFloat(slab) || 0) / 100;

  // FD: quarterly compounding, interest fully taxed at slab.
  const fdGross = P * Math.pow(1 + (parseFloat(fdRate) || 0) / 100 / 4, 4 * years) - P;
  const fdTax = fdGross * slabRate;
  const fdNet = fdGross - fdTax;

  // Liquid/debt fund post-Apr-2023: gains taxed at slab too (no LTCG benefit), but
  // taxed only on redemption (deferral) and no TDS on accrual.
  const liquidGross = P * Math.pow(1 + (parseFloat(liquidRate) || 0) / 100, years) - P;
  const liquidTax = liquidGross * slabRate;
  const liquidNet = liquidGross - liquidTax;

  const ready = P > 0;
  const fdWins = fdNet >= liquidNet;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><GitCompareArrows size={14} className="text-[var(--color-primary)]" /> Liquid Fund vs FD — after-tax yield</h3>
        <p className="text-xs text-[var(--color-muted)]">Both are taxed at your slab post-Budget 2023, so the winner comes down to rate and timing. FD interest is taxed yearly (with TDS); fund gains only on redemption.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Horizon (months)</label>
            <input type="number" value={months} onChange={e => setMonths(e.target.value)} placeholder="12" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Your tax slab (%)</label>
            <input type="number" value={slab} onChange={e => setSlab(e.target.value)} placeholder="30" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">FD rate (% p.a.)</label>
            <input type="number" value={fdRate} onChange={e => setFdRate(e.target.value)} placeholder="7.25" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Liquid fund yield (% p.a.)</label>
            <input type="number" value={liquidRate} onChange={e => setLiquidRate(e.target.value)} placeholder="7" className={INP} />
          </div>
        </div>
      </div>

      {ready && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: "Fixed Deposit", gross: fdGross, tax: fdTax, net: fdNet, win: fdWins },
              { name: "Liquid Fund", gross: liquidGross, tax: liquidTax, net: liquidNet, win: !fdWins },
            ].map(c => (
              <div key={c.name} className={`${CARD} p-4 ${c.win ? "border-green-700/50" : ""}`}>
                <p className="text-sm font-semibold flex items-center gap-1.5">{c.name}{c.win && <span className="text-[9px] text-green-400 font-bold">BETTER</span>}</p>
                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-xs text-[var(--color-muted)]">Gross gain</span><span className="tabular-nums">{formatCurrency(Math.round(c.gross))}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-[var(--color-muted)]">Tax @ {slab}%</span><span className="tabular-nums text-red-400">({formatCurrency(Math.round(c.tax))})</span></div>
                  <div className="flex justify-between pt-1.5 border-t border-[var(--color-border)]"><span className="font-semibold text-xs">Net gain</span><span className={`tabular-nums font-bold ${c.win ? "text-green-400" : ""}`}>{formatCurrency(Math.round(c.net))}</span></div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-bg)]">
            <p className="text-sm text-[var(--color-muted)]">
              On {formatCurrency(P)} over {n} months, the <strong className="text-[var(--color-text)]">{fdWins ? "FD" : "liquid fund"}</strong> leaves you {formatCurrency(Math.round(Math.abs(fdNet - liquidNet)))} more after tax. The fund also defers tax to redemption and lets you redeem anytime (T+1) without a break penalty.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Debt-fund gains bought on/after 1-Apr-2023 are taxed at slab with no indexation. FD interest is taxed each year as it accrues; this model applies slab tax on total gain for comparison. Fund returns are not guaranteed.</p>
    </div>
  );
}

// ── #4 Surplus-Cash Allocator (risk-graded tiers) ──────────────────────────────
type AllocTier = "conservative" | "balanced" | "growth";
function SurplusAllocator({ totalBalance }: { totalBalance: number }) {
  const [surplus, setSurplus] = useState(String(Math.max(0, Math.round(totalBalance * 0.5)) || ""));
  const [tier, setTier] = useState<AllocTier>("balanced");

  const S = parseFloat(surplus) || 0;
  // (bucket, weight%, assumed yield%)
  const MIXES: Record<AllocTier, { name: string; weight: number; yield: number; color: string }[]> = {
    conservative: [
      { name: "Overnight / Liquid funds", weight: 60, yield: 6.8, color: "#22c55e" },
      { name: "Short-duration FD", weight: 30, yield: 7.2, color: "#3b82f6" },
      { name: "T-Bills (91/182d)", weight: 10, yield: 7.0, color: "#a855f7" },
    ],
    balanced: [
      { name: "Liquid funds", weight: 40, yield: 6.8, color: "#22c55e" },
      { name: "Short-duration debt", weight: 35, yield: 7.4, color: "#3b82f6" },
      { name: "Corporate FD (AAA)", weight: 15, yield: 7.8, color: "#a855f7" },
      { name: "G-Secs / SGB", weight: 10, yield: 7.2, color: "#f59e0b" },
    ],
    growth: [
      { name: "Liquid funds", weight: 25, yield: 6.8, color: "#22c55e" },
      { name: "Short-duration debt", weight: 30, yield: 7.4, color: "#3b82f6" },
      { name: "Hybrid funds", weight: 30, yield: 9.5, color: "#a855f7" },
      { name: "Index ETF (long surplus)", weight: 15, yield: 11.0, color: "#f59e0b" },
    ],
  };
  const mix = MIXES[tier];
  const blendedYield = mix.reduce((s, m) => s + m.weight * m.yield, 0) / 100;
  const annualReturn = Math.round(S * blendedYield / 100);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> Surplus-Cash Allocator</h3>
        <p className="text-xs text-[var(--color-muted)]">Pick a risk tier and the surplus splits across instruments. Growth adds equity exposure — only for cash you won't need for 3+ years.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Surplus to allocate (₹)</label>
            <input type="number" value={surplus} onChange={e => setSurplus(e.target.value)} placeholder="1500000" className={INP} />
          </div>
          <div className="flex gap-2">
            {(["conservative", "balanced", "growth"] as const).map(t => (
              <button key={t} onClick={() => setTier(t)}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg border capitalize transition-all ${tier === t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {S > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">Blended yield (est.)</p>
              <p className="text-xl font-bold tabular-nums text-[var(--color-text)]">{blendedYield.toFixed(2)}%</p>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">Est. annual return</p>
              <p className="text-xl font-bold tabular-nums text-green-400">{formatCurrency(annualReturn)}</p>
            </div>
          </div>
          <div className={`${CARD} p-4 space-y-3`}>
            {mix.map(m => {
              const amt = Math.round(S * m.weight / 100);
              return (
                <div key={m.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{m.name} <span className="text-[var(--color-muted)]">· {m.weight}% · ~{m.yield}%</span></span>
                    <span className="tabular-nums font-semibold">{formatCurrency(amt)}</span>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${m.weight}%`, background: m.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Illustrative allocations, not investment advice. Yields are indicative and not guaranteed — hybrid/equity values fluctuate and can fall. Match instrument to when you'll actually need the cash.</p>
    </div>
  );
}

// ── #5 Treasury Yield Calculator (compounding) ─────────────────────────────────
function YieldCalculator() {
  const [P, setP] = useState("");
  const [rate, setRate] = useState("7");
  const [years, setYears] = useState("3");
  const [freq, setFreq] = useState<"1" | "2" | "4" | "12">("4");

  const principal = parseFloat(P) || 0;
  const r = (parseFloat(rate) || 0) / 100;
  const t = parseFloat(years) || 0;
  const n = parseInt(freq);
  const fv = principal * Math.pow(1 + r / n, n * t);
  const interest = fv - principal;
  const effectiveYield = principal > 0 && t > 0 ? (Math.pow(fv / principal, 1 / t) - 1) * 100 : 0;

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> Treasury Yield Calculator</h3>
        <p className="text-xs text-[var(--color-muted)]">Compound any parked amount and see the effective annualised yield once compounding is accounted for.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Principal (₹)</label>
            <input type="number" value={P} onChange={e => setP(e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Nominal rate (% p.a.)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="7" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Years</label>
            <input type="number" value={years} onChange={e => setYears(e.target.value)} placeholder="3" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Compounding</label>
            <select value={freq} onChange={e => setFreq(e.target.value as typeof freq)} className={INP}>
              <option value="1">Annual</option>
              <option value="2">Half-yearly</option>
              <option value="4">Quarterly</option>
              <option value="12">Monthly</option>
            </select>
          </div>
        </div>
      </div>

      {principal > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Maturity value", value: formatCurrency(Math.round(fv)), color: "text-[var(--color-text)]" },
            { label: "Total interest", value: formatCurrency(Math.round(interest)), color: "text-green-400" },
            { label: "Effective yield", value: `${effectiveYield.toFixed(2)}%`, color: "text-[var(--color-primary)]" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Effective yield is the annual compound rate equivalent. Returns shown are pre-tax; FD interest is taxed at slab and debt-fund gains at slab on redemption.</p>
    </div>
  );
}

// ── #6 T-Bill / G-Sec Return Estimator ─────────────────────────────────────────
function TBillEstimator() {
  const [face, setFace] = useState("100000");
  const [discountRate, setDiscountRate] = useState("6.9");
  const [tenor, setTenor] = useState<"91" | "182" | "364">("91");

  const F = parseFloat(face) || 0;
  const dr = (parseFloat(discountRate) || 0) / 100;
  const days = parseInt(tenor);
  // T-bills are zero-coupon, sold at a discount, redeemed at face value.
  // Price = F / (1 + dr * days/365); yield is the annualised return on price.
  const price = F / (1 + dr * days / 365);
  const gain = F - price;
  const annualisedYield = price > 0 ? (gain / price) * (365 / days) * 100 : 0;

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> T-Bill / G-Sec Return Estimator</h3>
        <p className="text-xs text-[var(--color-muted)]">Treasury Bills are sovereign zero-coupon instruments sold at a discount via RBI Retail Direct. Buy below face value, redeem at face value at maturity.</p>
        <div className="flex gap-2">
          {(["91", "182", "364"] as const).map(d => (
            <button key={d} onClick={() => setTenor(d)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${tenor === d ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {d}-day
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Face value (₹)</label>
            <input type="number" value={face} onChange={e => setFace(e.target.value)} placeholder="100000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Discount / cut-off yield (% p.a.)</label>
            <input type="number" value={discountRate} onChange={e => setDiscountRate(e.target.value)} placeholder="6.9" className={INP} />
          </div>
        </div>
      </div>

      {F > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Purchase price", value: formatCurrency(Math.round(price)), color: "text-[var(--color-text)]", sub: `for ${formatCurrency(F)} face` },
            { label: "Redemption (face)", value: formatCurrency(F), color: "text-[var(--color-text)]", sub: `at ${days} days` },
            { label: "Gain", value: formatCurrency(Math.round(gain)), color: "text-green-400", sub: "Tax-treated as interest" },
            { label: "Annualised yield", value: `${annualisedYield.toFixed(2)}%`, color: "text-[var(--color-primary)]", sub: "On price invested" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Sovereign-backed (lowest credit risk). Buy through RBI Retail Direct (no brokerage). The discount gain is taxed as interest income at your slab. Cut-off yields are set at weekly RBI auctions — enter the latest auction yield.</p>
    </div>
  );
}

// ── #7 Goal-Based Savings Planner ──────────────────────────────────────────────
type Goal = { id: string; name: string; target: number; saved: number; deadline: string; rate: number };
function GoalPlanner() {
  const [goals, setGoals] = useFeatureState<Goal[]>("trez-goals", []);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("0");
  const [deadline, setDeadline] = useState(() => format(addMonths(new Date(), 12), "yyyy-MM-dd"));
  const [rate, setRate] = useState("7");
  const today = new Date();

  const addGoal = () => {
    const t = parseFloat(target);
    if (!name.trim() || isNaN(t) || t <= 0) { toast.error("Enter a goal name and a positive target"); return; }
    setGoals([...goals, { id: crypto.randomUUID(), name: name.trim(), target: t, saved: parseFloat(saved) || 0, deadline, rate: parseFloat(rate) || 0 }]);
    setName(""); setTarget(""); setSaved("0");
    toast.success("Goal added");
  };

  const calc = (g: Goal) => {
    const monthsLeft = Math.max(1, Math.round(differenceInCalendarDays(new Date(g.deadline), today) / 30));
    const gap = Math.max(0, g.target - g.saved);
    const monthlyRate = g.rate / 100 / 12;
    // Required monthly contribution with growth (annuity-due-ish, end-of-month).
    const monthly = monthlyRate > 0
      ? (gap * monthlyRate) / (Math.pow(1 + monthlyRate, monthsLeft) - 1)
      : gap / monthsLeft;
    const pct = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
    return { monthsLeft, gap, monthly, pct };
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Target size={14} className="text-[var(--color-primary)]" /> Goal-Based Savings Planner</h3>
        <p className="text-xs text-[var(--color-muted)]">Earmark yield-bearing buckets for GST, advance-tax, Diwali bonus, capex. We compute the monthly contribution to hit each target on time, accounting for growth.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Goal</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Capex fund" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Target (₹)</label>
            <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="2000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Already saved (₹)</label>
            <input type="number" value={saved} onChange={e => setSaved(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Deadline</label>
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Yield %</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="7" className={INP} />
          </div>
          <button onClick={addGoal} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {goals.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No goals yet. Add reserves you want to build toward a deadline.</p>
      ) : (
        <div className="space-y-3">
          {goals.map(g => {
            const c = calc(g);
            return (
              <div key={g.id} className={`${CARD} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold">{g.name}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">{formatCurrency(g.saved)} of {formatCurrency(g.target)} · {c.monthsLeft} mo left · by {format(new Date(g.deadline), "d MMM yyyy")}</p>
                  </div>
                  <button onClick={() => setGoals(goals.filter(x => x.id !== g.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${c.pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-muted)]">{c.pct}% funded · gap {formatCurrency(Math.round(c.gap))}</span>
                  <span className="font-semibold text-[var(--color-primary)]">Save {formatCurrency(Math.round(c.monthly))}/mo @ {g.rate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Monthly contribution assumes end-of-month investing into a fund earning the stated yield. Growth is market-linked and not guaranteed; for tax/GST reserves prefer a liquid fund or sweep FD over equity.</p>
    </div>
  );
}

// ── #8 Owner Personal-vs-Business Split ────────────────────────────────────────
function OwnerSplit() {
  const [monthlyProfit, setMonthlyProfit] = useState("");
  const [drawPct, setDrawPct] = useState(40);
  const [personalSavePct, setPersonalSavePct] = useState(30);
  const [bizYield, setBizYield] = useState("7");
  const [personalYield, setPersonalYield] = useState("11");

  const profit = parseFloat(monthlyProfit) || 0;
  const draw = Math.round(profit * drawPct / 100);
  const retained = profit - draw;
  const personalSave = Math.round(draw * personalSavePct / 100);
  const personalSpend = draw - personalSave;
  const bizAnnualYield = Math.round(retained * 12 * (parseFloat(bizYield) || 0) / 100);
  const personalAnnualYield = Math.round(personalSave * 12 * (parseFloat(personalYield) || 0) / 100);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Owner Personal-vs-Business Split</h3>
        <p className="text-xs text-[var(--color-muted)]">Founders blur personal and firm money. Split monthly profit into owner drawings vs retained treasury, then ring-fence a personal savings track.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly net profit (₹)</label>
            <input type="number" value={monthlyProfit} onChange={e => setMonthlyProfit(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Business treasury yield (%)</label>
            <input type="number" value={bizYield} onChange={e => setBizYield(e.target.value)} placeholder="7" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Personal investing yield (%)</label>
            <input type="number" value={personalYield} onChange={e => setPersonalYield(e.target.value)} placeholder="11" className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Owner drawings: <strong className="text-[var(--color-text)]">{drawPct}%</strong> of profit</label>
            <input type="range" min={0} max={100} step={5} value={drawPct} onChange={e => setDrawPct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Of drawings, save: <strong className="text-[var(--color-text)]">{personalSavePct}%</strong></label>
            <input type="range" min={0} max={100} step={5} value={personalSavePct} onChange={e => setPersonalSavePct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {profit > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Retained in business", value: formatCurrency(retained), color: "text-blue-400", sub: `${100 - drawPct}% of profit/mo` },
              { label: "Owner drawings", value: formatCurrency(draw), color: "text-[var(--color-text)]", sub: `${drawPct}% of profit/mo` },
              { label: "Personal savings", value: formatCurrency(personalSave), color: "text-green-400", sub: `${personalSavePct}% of drawings` },
              { label: "Personal spend", value: formatCurrency(personalSpend), color: "text-[var(--color-muted)]", sub: "Lifestyle" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-bg)] text-sm">
            <p className="text-[var(--color-muted)]">At this split, the business treasury earns ~<strong className="text-green-400">{formatCurrency(bizAnnualYield)}</strong>/yr and your personal track ~<strong className="text-green-400">{formatCurrency(personalAnnualYield)}</strong>/yr on fresh savings. Keeping the two ledgers separate protects business runway from lifestyle drift.</p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Drawings from a company may be salary or dividend with different tax treatment — consult your CA on the optimal mix. Figures are simple annual estimates on fresh monthly savings.</p>
    </div>
  );
}

// ── #9 Post-Tax Return Calculator (incl. 194A TDS) ─────────────────────────────
function PostTaxCalculator() {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("7.25");
  const [slab, setSlab] = useState("30");
  const [type, setType] = useState<"fd" | "debt" | "tbill">("fd");
  const [senior, setSenior] = useState(false);

  const P = parseFloat(amount) || 0;
  const grossInterest = P * (parseFloat(rate) || 0) / 100; // 1-year gross
  const slabRate = (parseFloat(slab) || 0) / 100;
  const tax = grossInterest * slabRate;
  const netInterest = grossInterest - tax;
  const postTaxYield = P > 0 ? (netInterest / P) * 100 : 0;

  // TDS @10% under 194A applies to bank FD interest above ₹40k (₹50k seniors).
  // Debt funds / T-bills: no TDS on accrual (tax paid on redemption / in ITR).
  const tdsThreshold = senior ? 50000 : 40000;
  const tds = type === "fd" && grossInterest > tdsThreshold ? Math.round(grossInterest * 0.10) : 0;

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Post-Tax Return Calculator</h3>
        <p className="text-xs text-[var(--color-muted)]">Headline rates are pre-tax. See what you actually keep after slab tax — and whether the bank deducts TDS on the way.</p>
        <div className="flex gap-2">
          {([["fd", "Bank FD"], ["debt", "Debt fund"], ["tbill", "T-Bill / G-Sec"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setType(id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${type === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (% p.a.)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="7.25" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Your slab (%)</label>
            <input type="number" value={slab} onChange={e => setSlab(e.target.value)} placeholder="30" className={INP} />
          </div>
        </div>
        {type === "fd" && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={senior} onChange={e => setSenior(e.target.checked)} className="accent-[var(--color-primary)]" />
            Senior citizen (TDS threshold ₹50,000 instead of ₹40,000)
          </label>
        )}
      </div>

      {P > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Gross interest (1 yr)", value: formatCurrency(Math.round(grossInterest)), color: "text-[var(--color-text)]" },
              { label: "Tax @ slab", value: `(${formatCurrency(Math.round(tax))})`, color: "text-red-400" },
              { label: "Net interest", value: formatCurrency(Math.round(netInterest)), color: "text-green-400" },
              { label: "Post-tax yield", value: `${postTaxYield.toFixed(2)}%`, color: "text-[var(--color-primary)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border ${tds > 0 ? "border-yellow-800/40 bg-yellow-950/20" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
            <p className="text-sm flex items-start gap-2">
              {tds > 0
                ? <><AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" /><span className="text-yellow-300">The bank will deduct ~{formatCurrency(tds)} TDS (10% under Sec 194A) since interest crosses ₹{(tdsThreshold / 1000)}k. Credited against your final tax — file Form 15G/15H if your total income is below the taxable limit to avoid it.</span></>
                : <><CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" /><span className="text-[var(--color-muted)]">{type === "fd" ? "No TDS — interest is within the ₹" + (tdsThreshold / 1000) + "k threshold." : "No TDS on accrual for this instrument; you self-report the income at filing."}</span></>}
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Interest/gains on FDs, debt funds and T-bills are all taxed at your income slab. TDS is an advance credit, not an extra cost. Surcharge/cess may apply at higher incomes. Consult your CA.</p>
    </div>
  );
}

// ── #10 Maturity Calendar ──────────────────────────────────────────────────────
type Holding = { id: string; name: string; instrument: string; amount: number; maturity: number; date: string };
function MaturityCalendar() {
  const [holdings, setHoldings] = useFeatureState<Holding[]>("trez-holdings", []);
  const [name, setName] = useState("");
  const [instrument, setInstrument] = useState("FD");
  const [amount, setAmount] = useState("");
  const [maturity, setMaturity] = useState("");
  const [date, setDate] = useState(() => format(addDays(new Date(), 90), "yyyy-MM-dd"));
  const today = new Date();

  const add = () => {
    const amt = parseFloat(amount), mat = parseFloat(maturity);
    if (!name.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter a label and invested amount"); return; }
    setHoldings([...holdings, { id: crypto.randomUUID(), name: name.trim(), instrument, amount: amt, maturity: isNaN(mat) ? amt : mat, date }]);
    setName(""); setAmount(""); setMaturity("");
    toast.success("Holding added");
  };

  const sorted = [...holdings].sort((a, b) => a.date.localeCompare(b.date));
  const totalInvested = holdings.reduce((s, h) => s + h.amount, 0);
  const totalMaturity = holdings.reduce((s, h) => s + h.maturity, 0);
  const next90 = holdings.filter(h => { const d = differenceInCalendarDays(new Date(h.date), today); return d >= 0 && d <= 90; }).reduce((s, h) => s + h.maturity, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Maturity Calendar</h3>
        <p className="text-xs text-[var(--color-muted)]">Track every FD, RD, T-bill and fund lock-in in one place so cash availability is never a surprise — and you don't auto-renew at a poor rate.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Label</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="HDFC FD" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={instrument} onChange={e => setInstrument(e.target.value)} className={INP}>
              {["FD", "RD", "T-Bill", "G-Sec", "Liquid fund", "Debt fund", "Corporate FD"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Invested (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Maturity value (₹)</label>
            <input type="number" value={maturity} onChange={e => setMaturity(e.target.value)} placeholder="535000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Matures on</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {holdings.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total invested", value: formatCurrency(Math.round(totalInvested)), color: "text-[var(--color-text)]" },
            { label: "Total at maturity", value: formatCurrency(Math.round(totalMaturity)), color: "text-green-400" },
            { label: "Maturing in 90 days", value: formatCurrency(Math.round(next90)), color: "text-yellow-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No holdings tracked. Add your deposits and funds to see the maturity timeline.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Label", "Type", "Invested", "Maturity", "Date", "In", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {sorted.map(h => {
                  const days = differenceInCalendarDays(new Date(h.date), today);
                  const past = days < 0;
                  return (
                    <tr key={h.id} className={`hover:bg-white/2 ${past ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{h.name}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)] text-xs">{h.instrument}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(h.amount))}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-green-400">{formatCurrency(Math.round(h.maturity))}</td>
                      <td className="px-4 py-2.5">{format(new Date(h.date), "d MMM yyyy")}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${past ? "bg-[var(--color-accent)] text-[var(--color-muted)]" : days <= 30 ? "bg-yellow-950/30 text-yellow-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>
                          {past ? "Matured" : days === 0 ? "Today" : `${days}d`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setHoldings(holdings.filter(x => x.id !== h.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A maturity laddering view stops you auto-renewing FDs at the bank's default (often low) rate and helps match maturities to GST/advance-tax/payroll outflows.</p>
    </div>
  );
}

// ── #11 SIP / Recurring-Investment Planner ─────────────────────────────────────
function SipPlanner() {
  const [monthly, setMonthly] = useState("25000");
  const [years, setYears] = useState("5");
  const [rate, setRate] = useState("11");
  const [stepUp, setStepUp] = useState(0);

  const m = parseFloat(monthly) || 0;
  const yrs = Math.max(0, parseFloat(years) || 0);
  const annualRate = (parseFloat(rate) || 0) / 100;
  const monthlyRate = annualRate / 12;
  const su = stepUp / 100;

  const { invested, future } = useMemo(() => {
    let fv = 0, inv = 0, contrib = m;
    const totalMonths = Math.round(yrs * 12);
    for (let i = 0; i < totalMonths; i++) {
      // Step-up the SIP each completed year.
      if (i > 0 && i % 12 === 0) contrib = contrib * (1 + su);
      fv = (fv + contrib) * (1 + monthlyRate);
      inv += contrib;
    }
    return { invested: inv, future: fv };
  }, [m, yrs, monthlyRate, su]);

  const gain = future - invested;

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> SIP / Recurring-Investment Planner</h3>
        <p className="text-xs text-[var(--color-muted)]">Drip a fixed amount each month into a fund or RD to average your entry. Add an annual step-up to grow contributions as the business grows.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly amount (₹)</label>
            <input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="25000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Years</label>
            <input type="number" value={years} onChange={e => setYears(e.target.value)} placeholder="5" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Expected return (% p.a.)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="11" className={INP} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Annual step-up: <strong className="text-[var(--color-text)]">{stepUp}%</strong></label>
          <input type="range" min={0} max={25} step={5} value={stepUp} onChange={e => setStepUp(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      {m > 0 && yrs > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total invested", value: formatCurrency(Math.round(invested)), color: "text-[var(--color-text)]" },
            { label: "Est. corpus", value: formatCurrency(Math.round(future)), color: "text-green-400" },
            { label: "Est. gain", value: formatCurrency(Math.round(gain)), color: "text-[var(--color-primary)]" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Returns are illustrative and market-linked, not guaranteed. Equity SIPs suit 5+ year horizons; for short-term reserves use an RD or liquid-fund STP instead. ELSS SIPs carry a 3-year lock-in.</p>
    </div>
  );
}

// ── #12 Debt-Fund vs Equity-Fund Allocator ─────────────────────────────────────
function DebtEquityAllocator() {
  const [amount, setAmount] = useState("");
  const [horizonYears, setHorizonYears] = useState("3");
  const [riskTolerance, setRiskTolerance] = useState(50);
  const [debtReturn, setDebtReturn] = useState("7");
  const [equityReturn, setEquityReturn] = useState("11");

  const A = parseFloat(amount) || 0;
  const yrs = Math.max(0.1, parseFloat(horizonYears) || 1);

  // Horizon caps equity exposure: <1yr → 0, 1-3yr → up to 40%, 3-5yr → 70%, 5+yr → 90%.
  const horizonCap = yrs < 1 ? 0 : yrs < 3 ? 40 : yrs < 5 ? 70 : 90;
  const equityPct = Math.min(horizonCap, riskTolerance);
  const debtPct = 100 - equityPct;
  const equityAmt = Math.round(A * equityPct / 100);
  const debtAmt = A - equityAmt;
  const blended = (debtPct * (parseFloat(debtReturn) || 0) + equityPct * (parseFloat(equityReturn) || 0)) / 100;
  const projected = Math.round(A * Math.pow(1 + blended / 100, yrs));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Debt-Fund vs Equity-Fund Allocator</h3>
        <p className="text-xs text-[var(--color-muted)]">Splits a surplus between debt and equity funds. The horizon caps equity exposure — short-horizon money stays in debt no matter your risk appetite.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Horizon (years)</label>
            <input type="number" value={horizonYears} onChange={e => setHorizonYears(e.target.value)} placeholder="3" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Debt return (% p.a.)</label>
            <input type="number" value={debtReturn} onChange={e => setDebtReturn(e.target.value)} placeholder="7" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Equity return (% p.a.)</label>
            <input type="number" value={equityReturn} onChange={e => setEquityReturn(e.target.value)} placeholder="11" className={INP} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Risk appetite (target equity): <strong className="text-[var(--color-text)]">{riskTolerance}%</strong></label>
          <input type="range" min={0} max={100} step={10} value={riskTolerance} onChange={e => setRiskTolerance(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      {A > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Debt funds", value: formatCurrency(debtAmt), color: "text-blue-400", sub: `${debtPct}% — stability` },
              { label: "Equity funds", value: formatCurrency(equityAmt), color: "text-green-400", sub: `${equityPct}% — growth` },
              { label: "Blended return", value: `${blended.toFixed(2)}%`, color: "text-[var(--color-primary)]", sub: "weighted p.a." },
              { label: `Value in ${yrs}y`, value: formatCurrency(projected), color: "text-green-400", sub: "est. pre-tax" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          {equityPct < riskTolerance && (
            <div className="rounded-lg p-4 border border-yellow-800/40 bg-yellow-950/20">
              <p className="text-sm flex items-start gap-2 text-yellow-300"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> Equity capped at {equityPct}% (below your {riskTolerance}% appetite) because a {yrs}-year horizon is too short to ride out equity volatility safely.</p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Equity-oriented fund gains held over 12 months are LTCG (12.5% above ₹1.25L/yr); under 12 months STCG at 20%. Debt-fund gains are taxed at slab. Equity values can fall — only allocate money you won't need for the full horizon.</p>
    </div>
  );
}

// ── #13 Emergency-Fund Target Calculator ───────────────────────────────────────
function EmergencyFundCalculator() {
  const [monthlyOpex, setMonthlyOpex] = useState("");
  const [monthsCover, setMonthsCover] = useState(6);
  const [alreadySet, setAlreadySet] = useState("0");
  const [topUpMonths, setTopUpMonths] = useState("12");

  const opex = parseFloat(monthlyOpex) || 0;
  const target = opex * monthsCover;
  const have = parseFloat(alreadySet) || 0;
  const gap = Math.max(0, target - have);
  const months = Math.max(1, Math.round(parseFloat(topUpMonths) || 12));
  const monthlyTopUp = gap / months;
  const pct = target > 0 ? Math.min(100, Math.round((have / target) * 100)) : 0;

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--color-primary)]" /> Emergency-Fund Target Calculator</h3>
        <p className="text-xs text-[var(--color-muted)]">Size a contingency reserve for the business — enough months of fixed outgoings (rent, payroll, EMIs) to survive a revenue shock without breaking long-term investments.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly fixed opex (₹)</label>
            <input type="number" value={monthlyOpex} onChange={e => setMonthlyOpex(e.target.value)} placeholder="400000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Already reserved (₹)</label>
            <input type="number" value={alreadySet} onChange={e => setAlreadySet(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Build over (months)</label>
            <input type="number" value={topUpMonths} onChange={e => setTopUpMonths(e.target.value)} placeholder="12" className={INP} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Months of cover: <strong className="text-[var(--color-text)]">{monthsCover}</strong></label>
          <input type="range" min={3} max={12} step={1} value={monthsCover} onChange={e => setMonthsCover(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      {opex > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Target reserve", value: formatCurrency(Math.round(target)), color: "text-[var(--color-text)]", sub: `${monthsCover} mo cover` },
              { label: "Already set aside", value: formatCurrency(Math.round(have)), color: "text-blue-400", sub: `${pct}% funded` },
              { label: "Remaining gap", value: formatCurrency(Math.round(gap)), color: "text-yellow-400", sub: "still to build" },
              { label: "Monthly top-up", value: formatCurrency(Math.round(monthlyTopUp)), color: "text-green-400", sub: `over ${months} mo` },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Hold the emergency fund in instant-access instruments (liquid fund or sweep FD), not equity or locked deposits. Services firms often target 6 months; inventory-heavy or seasonal businesses lean toward 9–12.</p>
    </div>
  );
}

// ── #14 Sweep-In FD Auto-Threshold Config ──────────────────────────────────────
type SweepFdRule = { id: string; account: string; floor: number; sweepTo: number; chunk: number };
function SweepFdConfig({ totalBalance }: { totalBalance: number }) {
  const { store } = useApp();
  const [rules, setRules] = useFeatureState<SweepFdRule[]>("trez-sweepfd-rules", []);
  const [account, setAccount] = useState(store.bankAccounts[0]?.name || "Current A/c");
  const [floor, setFloor] = useState("500000");
  const [sweepTo, setSweepTo] = useState("200000");
  const [chunk, setChunk] = useState("25000");

  const add = () => {
    const f = parseFloat(floor), s = parseFloat(sweepTo), c = parseFloat(chunk);
    if (isNaN(f) || f <= 0 || isNaN(s) || isNaN(c) || c <= 0) { toast.error("Enter a valid floor, sweep-back and chunk size"); return; }
    if (s >= f) { toast.error("Sweep-back floor must be below the trigger threshold"); return; }
    setRules([...rules, { id: crypto.randomUUID(), account, floor: f, sweepTo: s, chunk: c }]);
    toast.success("Sweep-FD rule saved");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Waves size={14} className="text-[var(--color-primary)]" /> Sweep-In FD Auto-Threshold Config</h3>
        <p className="text-xs text-[var(--color-muted)]">A sweep-in (flexi) FD auto-converts balance above a trigger into a linked FD, and breaks back in slices only when the account dips below a floor — so you keep liquidity without losing interest on the whole deposit.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account</label>
            <select value={account} onChange={e => setAccount(e.target.value)} className={INP}>
              {(store.bankAccounts.length ? store.bankAccounts.map(b => b.name) : ["Current A/c"]).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sweep trigger (₹)</label>
            <input type="number" value={floor} onChange={e => setFloor(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Keep liquid floor (₹)</label>
            <input type="number" value={sweepTo} onChange={e => setSweepTo(e.target.value)} placeholder="200000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Break chunk (₹)</label>
            <input type="number" value={chunk} onChange={e => setChunk(e.target.value)} placeholder="25000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Save rule
          </button>
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">Total cash across banks today: <strong className="text-[var(--color-text)]">{formatCurrency(Math.round(totalBalance))}</strong></p>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No sweep-FD rules yet. Configure thresholds, then ask your bank to enable a flexi/sweep-in FD on the account.</p>
      ) : (
        <div className="space-y-3">
          {rules.map(r => (
            <div key={r.id} className={`${CARD} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">{r.account}</p>
                <button onClick={() => setRules(rules.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                When balance exceeds <strong className="text-green-400">{formatCurrency(r.floor)}</strong>, sweep the excess into a linked FD, keeping <strong className="text-yellow-400">{formatCurrency(r.sweepTo)}</strong> liquid. Break back in <strong className="text-[var(--color-text)]">{formatCurrency(r.chunk)}</strong> slices on a shortfall.
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">This stores your intended thresholds; the actual sweep is set up at your bank (HDFC SweepIn, ICICI Money Multiplier, SBI MOD, etc.). Broken slices earn FD rate for the period held; the un-broken balance keeps compounding.</p>
    </div>
  );
}

// ── #15 Corporate-FD Comparator ────────────────────────────────────────────────
type CorpFd = { id: string; issuer: string; rating: string; rate: number; tenure: number };
function CorporateFdComparator() {
  const [amount, setAmount] = useState("500000");
  const [rows, setRows] = useFeatureState<CorpFd[]>("trez-corpfd", [
    { id: "seed-1", issuer: "Bank FD (SBI)", rating: "Sovereign-ish", rate: 6.8, tenure: 24 },
    { id: "seed-2", issuer: "Bajaj Finance", rating: "AAA", rate: 7.9, tenure: 24 },
    { id: "seed-3", issuer: "Shriram Finance", rating: "AA+", rate: 8.5, tenure: 24 },
  ]);
  const [issuer, setIssuer] = useState("");
  const [rating, setRating] = useState("AAA");
  const [rate, setRate] = useState("");
  const [tenure, setTenure] = useState("24");

  const A = parseFloat(amount) || 0;
  const add = () => {
    const r = parseFloat(rate), t = parseFloat(tenure);
    if (!issuer.trim() || isNaN(r) || r <= 0 || isNaN(t) || t <= 0) { toast.error("Enter issuer, rate and tenure"); return; }
    setRows([...rows, { id: crypto.randomUUID(), issuer: issuer.trim(), rating, rate: r, tenure: t }]);
    setIssuer(""); setRate("");
    toast.success("Deposit added");
  };

  const computed = rows.map(rw => {
    const years = rw.tenure / 12;
    const maturity = A * Math.pow(1 + rw.rate / 100 / 4, 4 * years); // quarterly compounding
    return { ...rw, maturity, interest: maturity - A };
  }).sort((a, b) => b.maturity - a.maturity);
  const best = computed[0];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 size={14} className="text-[var(--color-primary)]" /> Corporate-FD Comparator</h3>
        <p className="text-xs text-[var(--color-muted)]">AAA corporate deposits (Bajaj, Shriram, etc.) often beat bank FD rates — but carry credit risk. Compare maturity value on the same amount, then weigh yield against rating.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Issuer</label>
            <input value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="LIC HFL" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rating</label>
            <select value={rating} onChange={e => setRating(e.target.value)} className={INP}>
              {["AAA", "AA+", "AA", "AA-", "A+", "Sovereign-ish"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (% p.a.)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="7.9" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tenure (months)</label>
            <input type="number" value={tenure} onChange={e => setTenure(e.target.value)} placeholder="24" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {A > 0 && computed.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Issuer", "Rating", "Rate", "Tenure", "Maturity value", "Interest", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {computed.map(rw => (
                  <tr key={rw.id} className={`hover:bg-white/2 ${best && rw.id === best.id ? "bg-green-950/15" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">{rw.issuer}{best && rw.id === best.id && <span className="ml-1.5 text-[9px] text-green-400 font-bold">BEST</span>}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rw.rating === "AAA" || rw.rating === "Sovereign-ish" ? "bg-green-950/30 text-green-400" : "bg-yellow-950/30 text-yellow-400"}`}>{rw.rating}</span></td>
                    <td className="px-4 py-2.5 tabular-nums">{rw.rate}%</td>
                    <td className="px-4 py-2.5 tabular-nums">{rw.tenure} mo</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold text-green-400">{formatCurrency(Math.round(rw.maturity))}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(rw.interest))}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== rw.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Corporate deposits are NOT covered by the ₹5L DICGC bank-deposit insurance. Stick to AAA-rated issuers, cap exposure per issuer, and check the latest CRISIL/ICRA rating. Interest is taxed at slab; TDS applies above ₹5,000/yr for company deposits.</p>
    </div>
  );
}

// ── #16 NSC / KVP / SGB Return Calculator ──────────────────────────────────────
function SmallSavingsCalculator() {
  const [instrument, setInstrument] = useState<"nsc" | "kvp" | "sgb">("nsc");
  const [amount, setAmount] = useState("100000");
  const [goldRate, setGoldRate] = useState("8");

  const A = parseFloat(amount) || 0;
  // Current scheme parameters (illustrative, India post-office / RBI).
  const CFG = {
    nsc: { label: "NSC (National Savings Certificate)", rate: 7.7, years: 5, note: "5-yr lock-in, compounded annually, paid at maturity. Eligible for 80C deduction." },
    kvp: { label: "KVP (Kisan Vikas Patra)", rate: 7.5, years: 9.5, note: "Doubles your money in ~115 months at the current rate. No 80C benefit." },
    sgb: { label: "SGB (Sovereign Gold Bond)", rate: 2.5, years: 8, note: "2.5% fixed coupon p.a. PLUS gold price movement. 8-yr tenure, exit after 5." },
  };
  const cfg = CFG[instrument];

  const result = useMemo(() => {
    if (instrument === "sgb") {
      // Coupon (taxable) + assumed gold appreciation (LTCG-exempt if held to maturity).
      const couponTotal = A * (cfg.rate / 100) * cfg.years;
      const gold = (parseFloat(goldRate) || 0) / 100;
      const priceGain = A * Math.pow(1 + gold, cfg.years) - A;
      const total = A + couponTotal + priceGain;
      return { maturity: total, gain: couponTotal + priceGain, couponTotal, priceGain };
    }
    const maturity = A * Math.pow(1 + cfg.rate / 100, cfg.years);
    return { maturity, gain: maturity - A, couponTotal: 0, priceGain: 0 };
  }, [instrument, A, cfg, goldRate]);

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> NSC / KVP / SGB Calculator</h3>
        <p className="text-xs text-[var(--color-muted)]">Sovereign-backed small-savings instruments for a slice of long-horizon reserve. Pick one to see maturity value at current scheme rates.</p>
        <div className="flex gap-2">
          {([["nsc", "NSC"], ["kvp", "KVP"], ["sgb", "SGB (Gold)"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setInstrument(id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${instrument === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100000" className={INP} />
          </div>
          {instrument === "sgb" && (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Assumed gold gain (% p.a.)</label>
              <input type="number" value={goldRate} onChange={e => setGoldRate(e.target.value)} placeholder="8" className={INP} />
            </div>
          )}
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">{cfg.label} · {cfg.rate}% {instrument === "sgb" ? "coupon" : "p.a."} · {cfg.years}-yr term</p>
      </div>

      {A > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Maturity value", value: formatCurrency(Math.round(result.maturity)), color: "text-green-400" },
              { label: "Total gain", value: formatCurrency(Math.round(result.gain)), color: "text-[var(--color-primary)]" },
              { label: "Effective gain %", value: `${A > 0 ? ((result.gain / A) * 100).toFixed(1) : 0}%`, color: "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          {instrument === "sgb" && (
            <div className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-bg)] text-sm">
              <p className="text-[var(--color-muted)]">Of the gain, ~<strong className="text-[var(--color-text)]">{formatCurrency(Math.round(result.couponTotal))}</strong> is the 2.5% coupon (taxed at slab) and ~<strong className="text-green-400">{formatCurrency(Math.round(result.priceGain))}</strong> is gold appreciation (LTCG-exempt if held to the 8-yr maturity).</p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">{cfg.note} Rates are revised quarterly by the government — confirm the current quarter's rate before investing. Gold price is volatile; the assumed appreciation is illustrative, not a forecast.</p>
    </div>
  );
}

// ── #17 Sweep-FD vs Overdraft Cost Compare ─────────────────────────────────────
function SweepVsOverdraft() {
  const [shortfall, setShortfall] = useState("300000");
  const [days, setDays] = useState("20");
  const [odRate, setOdRate] = useState("12");
  const [fdRate, setFdRate] = useState("7");
  const [breakPenalty, setBreakPenalty] = useState("1");

  const S = parseFloat(shortfall) || 0;
  const d = Math.max(0, parseFloat(days) || 0);

  // Option A: use overdraft / cash-credit for the shortfall.
  const odCost = S * (parseFloat(odRate) || 0) / 100 * d / 365;
  // Option B: break a sweep/flexi FD — lose FD interest on the broken slice for the
  // remaining period (proxied by `days`) plus a premature-break rate penalty.
  const fdInterestForgone = S * (parseFloat(fdRate) || 0) / 100 * d / 365;
  const penalty = S * (parseFloat(breakPenalty) || 0) / 100 * d / 365;
  const breakCost = fdInterestForgone + penalty;

  const ready = S > 0;
  const odCheaper = odCost <= breakCost;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CreditCard size={14} className="text-[var(--color-primary)]" /> Sweep-FD vs Overdraft — cost of a short cash gap</h3>
        <p className="text-xs text-[var(--color-muted)]">When you're short for a few days, is it cheaper to draw on the OD/CC line or break a sweep FD? Compare the real cost of each for the gap period.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Shortfall (₹)</label>
            <input type="number" value={shortfall} onChange={e => setShortfall(e.target.value)} placeholder="300000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Days short</label>
            <input type="number" value={days} onChange={e => setDays(e.target.value)} placeholder="20" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">OD / CC rate (% p.a.)</label>
            <input type="number" value={odRate} onChange={e => setOdRate(e.target.value)} placeholder="12" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">FD rate forgone (% p.a.)</label>
            <input type="number" value={fdRate} onChange={e => setFdRate(e.target.value)} placeholder="7" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Break penalty (% p.a.)</label>
            <input type="number" value={breakPenalty} onChange={e => setBreakPenalty(e.target.value)} placeholder="1" className={INP} />
          </div>
        </div>
      </div>

      {ready && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: "Use Overdraft / CC", cost: odCost, win: odCheaper, sub: `interest for ${d} days` },
              { name: "Break Sweep FD", cost: breakCost, win: !odCheaper, sub: "interest forgone + penalty" },
            ].map(c => (
              <div key={c.name} className={`${CARD} p-4 ${c.win ? "border-green-700/50" : ""}`}>
                <p className="text-sm font-semibold flex items-center gap-1.5">{c.name}{c.win && <span className="text-[9px] text-green-400 font-bold">CHEAPER</span>}</p>
                <p className={`text-2xl font-bold tabular-nums mt-2 ${c.win ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(c.cost))}</p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-bg)]">
            <p className="text-sm text-[var(--color-muted)]">For a {formatCurrency(S)} gap over {d} days, <strong className="text-[var(--color-text)]">{odCheaper ? "drawing the OD/CC line" : "breaking the sweep FD"}</strong> costs {formatCurrency(Math.round(Math.abs(odCost - breakCost)))} less. A flexi/sweep FD only breaks the exact slice you need, so the rest keeps earning.</p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">OD/CC interest is charged only on the amount and days used. Sweep FDs break in slices, limiting interest loss. Some banks waive the premature penalty on sweep-linked FDs — set the penalty to 0 if so.</p>
    </div>
  );
}

// ── #18 Dividend / Interest Income Tracker ─────────────────────────────────────
type IncomeEntry = { id: string; source: string; type: string; amount: number; tds: number; date: string };
function IncomeTracker() {
  const [entries, setEntries] = useFeatureState<IncomeEntry[]>("trez-income", []);
  const [source, setSource] = useState("");
  const [type, setType] = useState("FD interest");
  const [amount, setAmount] = useState("");
  const [tds, setTds] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const add = () => {
    const amt = parseFloat(amount);
    if (!source.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter a source and a positive amount"); return; }
    setEntries([...entries, { id: crypto.randomUUID(), source: source.trim(), type, amount: amt, tds: parseFloat(tds) || 0, date }]);
    setSource(""); setAmount(""); setTds("");
    toast.success("Income logged");
  };

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const totalIncome = entries.reduce((s, e) => s + e.amount, 0);
  const totalTds = entries.reduce((s, e) => s + e.tds, 0);
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach(e => map.set(e.type, (map.get(e.type) || 0) + e.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> Dividend / Interest Income Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Log every interest, dividend and coupon credit with TDS deducted, so reconciling to Form 26AS at filing time is painless and no income slips through.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Source</label>
            <input value={source} onChange={e => setSource(e.target.value)} placeholder="HDFC FD" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className={INP}>
              {["FD interest", "Savings interest", "Debt-fund dividend", "Equity dividend", "G-Sec/T-Bill", "Coupon", "Other"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="12500" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">TDS deducted (₹)</label>
            <input type="number" value={tds} onChange={e => setTds(e.target.value)} placeholder="1250" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Total income logged", value: formatCurrency(Math.round(totalIncome)), color: "text-green-400" },
            { label: "Total TDS deducted", value: formatCurrency(Math.round(totalTds)), color: "text-yellow-400", sub: "claim against final tax" },
            { label: "Net received", value: formatCurrency(Math.round(totalIncome - totalTds)), color: "text-[var(--color-text)]" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              {k.sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {byType.length > 0 && (
        <div className={`${CARD} p-4 space-y-2`}>
          <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">By type</p>
          {byType.map(([t, v]) => (
            <div key={t} className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-muted)]">{t}</span>
              <span className="tabular-nums font-medium">{formatCurrency(Math.round(v))}</span>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No income logged yet. Add interest and dividend credits as they arrive.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Date", "Source", "Type", "Amount", "TDS", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {sorted.map(e => (
                  <tr key={e.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5">{format(new Date(e.date), "d MMM yyyy")}</td>
                    <td className="px-4 py-2.5 font-medium">{e.source}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] text-xs">{e.type}</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(e.amount))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-yellow-400">{e.tds > 0 ? formatCurrency(Math.round(e.tds)) : "—"}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setEntries(entries.filter(x => x.id !== e.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">All interest income is taxable at slab and must be declared even if no TDS was cut. Reconcile this log against Form 26AS / AIS before filing. Equity dividends above ₹5,000/payer attract 10% TDS under Sec 194.</p>
    </div>
  );
}

// ── #19 Capital-Gains-on-Redemption Estimator (STCG / LTCG) ────────────────────
function CapitalGainsEstimator() {
  const [assetType, setAssetType] = useState<"equity" | "debt">("equity");
  const [buy, setBuy] = useState("");
  const [sell, setSell] = useState("");
  const [holdMonths, setHoldMonths] = useState("18");
  const [slab, setSlab] = useState("30");

  const cost = parseFloat(buy) || 0;
  const proceeds = parseFloat(sell) || 0;
  const gain = proceeds - cost;
  const months = Math.max(0, parseFloat(holdMonths) || 0);
  const slabRate = (parseFloat(slab) || 0) / 100;

  // India FY25 rules: equity LTCG (>12m) 12.5% above ₹1.25L exemption; STCG (<12m) 20%.
  // Debt funds bought after Apr-2023: always slab (no LTCG benefit).
  const result = useMemo(() => {
    if (gain <= 0) return { kind: assetType === "equity" ? (months >= 12 ? "LTCG" : "STCG") : "Slab", taxable: 0, tax: 0, exemption: 0, rate: 0 };
    if (assetType === "equity") {
      if (months >= 12) {
        const exemption = Math.min(gain, 125000);
        const taxable = Math.max(0, gain - 125000);
        return { kind: "LTCG @ 12.5%", taxable, tax: taxable * 0.125, exemption, rate: 12.5 };
      }
      return { kind: "STCG @ 20%", taxable: gain, tax: gain * 0.20, exemption: 0, rate: 20 };
    }
    // debt
    return { kind: "Slab (post-Apr-2023 debt)", taxable: gain, tax: gain * slabRate, exemption: 0, rate: slabRate * 100 };
  }, [assetType, gain, months, slabRate]);

  const net = gain - result.tax;
  const ready = cost > 0 && proceeds > 0;

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Scale3d size={14} className="text-[var(--color-primary)]" /> Capital-Gains-on-Redemption Estimator</h3>
        <p className="text-xs text-[var(--color-muted)]">Before redeeming a fund, see the STCG/LTCG hit. Equity held over 12 months gets the ₹1.25L LTCG exemption; debt is always taxed at slab.</p>
        <div className="flex gap-2">
          {([["equity", "Equity fund"], ["debt", "Debt fund"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setAssetType(id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${assetType === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Buy / cost (₹)</label>
            <input type="number" value={buy} onChange={e => setBuy(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sell / proceeds (₹)</label>
            <input type="number" value={sell} onChange={e => setSell(e.target.value)} placeholder="650000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Held (months)</label>
            <input type="number" value={holdMonths} onChange={e => setHoldMonths(e.target.value)} placeholder="18" className={INP} />
          </div>
          {assetType === "debt" && (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Your slab (%)</label>
              <input type="number" value={slab} onChange={e => setSlab(e.target.value)} placeholder="30" className={INP} />
            </div>
          )}
        </div>
      </div>

      {ready && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Gross gain", value: formatCurrency(Math.round(gain)), color: gain >= 0 ? "text-green-400" : "text-red-400" },
              { label: "Treatment", value: result.kind, color: "text-[var(--color-text)]", small: true },
              { label: "Tax payable", value: `(${formatCurrency(Math.round(result.tax))})`, color: "text-red-400" },
              { label: "Net in hand", value: formatCurrency(Math.round(net)), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`${k.small ? "text-sm" : "text-lg"} font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          {result.exemption > 0 && (
            <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
              <p className="text-sm flex items-start gap-2 text-green-300"><CheckCircle2 size={14} className="shrink-0 mt-0.5" /> {formatCurrency(Math.round(result.exemption))} of this LTCG is tax-free under the ₹1.25L/yr equity exemption. Spread redemptions across financial years to use the exemption twice.</p>
            </div>
          )}
          {assetType === "equity" && months < 12 && gain > 0 && (
            <div className="rounded-lg p-4 border border-yellow-800/40 bg-yellow-950/20">
              <p className="text-sm flex items-start gap-2 text-yellow-300"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> Held only {months} months — STCG at 20%. Waiting until 12 months would qualify it as LTCG at 12.5% with a ₹1.25L exemption.</p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">FY2024-25 rules: equity LTCG (held &gt;12m) at 12.5% above ₹1.25L/yr; equity STCG (≤12m) at 20%; debt funds bought on/after 1-Apr-2023 taxed at slab with no holding-period benefit. Surcharge/cess extra. Confirm with your CA.</p>
    </div>
  );
}

// ── #20 Asset-Allocation Rebalancer ────────────────────────────────────────────
type AssetRow = { id: string; name: string; current: number; target: number };
function PortfolioRebalancer() {
  const [rows, setRows] = useFeatureState<AssetRow[]>("trez-rebalance", [
    { id: "seed-1", name: "Liquid / cash", current: 600000, target: 30 },
    { id: "seed-2", name: "Debt funds", current: 800000, target: 40 },
    { id: "seed-3", name: "Equity funds", current: 600000, target: 30 },
  ]);
  const [name, setName] = useState("");
  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");

  const add = () => {
    const c = parseFloat(current), t = parseFloat(target);
    if (!name.trim() || isNaN(c) || c < 0 || isNaN(t) || t < 0) { toast.error("Enter a label, current value and target %"); return; }
    setRows([...rows, { id: crypto.randomUUID(), name: name.trim(), current: c, target: t }]);
    setName(""); setCurrent(""); setTarget("");
    toast.success("Asset added");
  };

  const totalValue = rows.reduce((s, r) => s + r.current, 0);
  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const computed = rows.map(r => {
    const currentPct = totalValue > 0 ? (r.current / totalValue) * 100 : 0;
    const targetValue = totalValue * r.target / 100;
    const delta = targetValue - r.current; // +buy / -sell
    return { ...r, currentPct, targetValue, delta };
  });

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><LineChart size={14} className="text-[var(--color-primary)]" /> Asset-Allocation Rebalancer</h3>
        <p className="text-xs text-[var(--color-muted)]">Set a target mix; the tool shows how far each sleeve has drifted and the exact buy/sell to get back to target. Rebalancing locks in gains from what ran up.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Asset / sleeve</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Hybrid funds" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Current value (₹)</label>
            <input type="number" value={current} onChange={e => setCurrent(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Target (%)</label>
            <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="20" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
        {Math.round(totalTarget) !== 100 && rows.length > 0 && (
          <p className="text-[11px] text-yellow-400 flex items-center gap-1.5"><AlertTriangle size={11} /> Targets sum to {totalTarget.toFixed(0)}% — adjust so they total 100%.</p>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Total portfolio</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(Math.round(totalValue))}</p>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Sleeve", "Current", "Current %", "Target %", "Target value", "Action", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {computed.map(r => {
                    const sizable = Math.abs(r.delta) >= totalValue * 0.01;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.name}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.current))}</td>
                        <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.currentPct.toFixed(1)}%</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.target.toFixed(1)}%</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.targetValue))}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold">
                          {!sizable ? <span className="text-[var(--color-muted)]">On target</span>
                            : r.delta > 0 ? <span className="text-green-400">Buy {formatCurrency(Math.round(r.delta))}</span>
                            : <span className="text-red-400">Sell {formatCurrency(Math.round(-r.delta))}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Selling to rebalance can trigger STCG/LTCG — prefer rebalancing with fresh inflows or within a year-end window. A 5% drift band avoids over-trading. Use the Cap-Gains tab to estimate tax before any sell.</p>
    </div>
  );
}

// ── #21 Portfolio XIRR Calculator ──────────────────────────────────────────────
type CashFlow = { id: string; date: string; amount: number; note: string };
function XirrCalculator() {
  const [flows, setFlows] = useFeatureState<CashFlow[]>("trez-xirr", []);
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const add = (sign: 1 | -1) => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a positive amount"); return; }
    setFlows([...flows, { id: crypto.randomUUID(), date, amount: sign * amt, note: note.trim() || (sign < 0 ? "Investment" : "Redemption/value") }]);
    setAmount(""); setNote("");
    toast.success(sign < 0 ? "Investment added" : "Inflow added");
  };

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));

  // XIRR via Newton-Raphson on the NPV-of-irregular-cashflows equation.
  const xirr = useMemo(() => {
    if (sorted.length < 2) return null;
    const hasNeg = sorted.some(f => f.amount < 0), hasPos = sorted.some(f => f.amount > 0);
    if (!hasNeg || !hasPos) return null;
    const t0 = new Date(sorted[0].date).getTime();
    const years = (f: CashFlow) => (new Date(f.date).getTime() - t0) / (365 * 24 * 3600 * 1000);
    const npv = (rate: number) => sorted.reduce((s, f) => s + f.amount / Math.pow(1 + rate, years(f)), 0);
    const dNpv = (rate: number) => sorted.reduce((s, f) => { const y = years(f); return s - y * f.amount / Math.pow(1 + rate, y + 1); }, 0);
    let rate = 0.1;
    for (let i = 0; i < 100; i++) {
      const v = npv(rate), d = dNpv(rate);
      if (Math.abs(d) < 1e-10) break;
      const next = rate - v / d;
      if (!isFinite(next) || next <= -0.999) { rate = NaN; break; }
      if (Math.abs(next - rate) < 1e-7) { rate = next; break; }
      rate = next;
    }
    return isFinite(rate) ? rate * 100 : null;
  }, [sorted]);

  const invested = flows.filter(f => f.amount < 0).reduce((s, f) => s - f.amount, 0);
  const returned = flows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /> Portfolio XIRR Calculator</h3>
        <p className="text-xs text-[var(--color-muted)]">XIRR is the true annualised return on irregular cashflows. Log each investment (outflow) and redemption or current value (inflow) by date — the dates matter, not just the totals.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100000" className={INP} />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Lump sum / SIP" className={INP} />
          </div>
          <button onClick={() => add(-1)} className="flex items-center justify-center gap-1 border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-3 py-2 text-xs font-medium hover:border-[var(--color-primary)]">
            <Plus size={12} /> Invested
          </button>
          <button onClick={() => add(1)} className="flex items-center justify-center gap-1 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-xs font-medium">
            <Plus size={12} /> Inflow / value
          </button>
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">Tip: add today's current portfolio value as a final inflow to compute live XIRR.</p>
      </div>

      {flows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total invested", value: formatCurrency(Math.round(invested)), color: "text-[var(--color-text)]" },
            { label: "Total inflows / value", value: formatCurrency(Math.round(returned)), color: "text-green-400" },
            { label: "XIRR", value: xirr === null ? "—" : `${xirr.toFixed(2)}%`, color: xirr === null ? "text-[var(--color-muted)]" : xirr >= 0 ? "text-[var(--color-primary)]" : "text-red-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add at least one investment and one inflow (or current value) on different dates to compute XIRR.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Date", "Flow", "Amount", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {sorted.map(f => (
                  <tr key={f.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5">{format(new Date(f.date), "d MMM yyyy")}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] text-xs">{f.note}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-semibold ${f.amount < 0 ? "text-red-400" : "text-green-400"}`}>{f.amount < 0 ? "−" : "+"}{formatCurrency(Math.round(Math.abs(f.amount)))}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setFlows(flows.filter(x => x.id !== f.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">XIRR weights each cashflow by its date, so it beats a simple return % for SIPs or staggered investing. Returns are computed pre-tax; a positive XIRR isn't guaranteed to repeat.</p>
    </div>
  );
}

// ── #22 Surplus-Deployment Waterfall ───────────────────────────────────────────
function SurplusWaterfall({ totalBalance }: { totalBalance: number }) {
  const [surplus, setSurplus] = useState(String(Math.round(totalBalance) || ""));
  const [bufferWeeks, setBufferWeeks] = useState("6");
  const [weeklyOpex, setWeeklyOpex] = useState("");
  const [gstDue, setGstDue] = useState("");
  const [advanceTax, setAdvanceTax] = useState("");
  const [emergencyTarget, setEmergencyTarget] = useState("");
  const [highCostDebt, setHighCostDebt] = useState("");

  const S = parseFloat(surplus) || 0;
  const opex = parseFloat(weeklyOpex) || 0;
  const weeks = parseFloat(bufferWeeks) || 0;

  // Priority waterfall: each tier consumes from remaining cash before the next.
  const steps = useMemo(() => {
    let rem = S;
    const take = (need: number) => { const a = Math.min(rem, Math.max(0, need)); rem -= a; return a; };
    const buffer = take(opex * weeks);
    const gst = take(parseFloat(gstDue) || 0);
    const tax = take(parseFloat(advanceTax) || 0);
    const emergency = take(parseFloat(emergencyTarget) || 0);
    const debt = take(parseFloat(highCostDebt) || 0);
    const invest = Math.max(0, rem);
    return [
      { name: "1. Operating buffer", desc: `${weeks} wk × weekly opex — keep liquid`, amount: buffer, color: "text-yellow-400", bg: "#eab308" },
      { name: "2. GST liability vault", desc: "Park in liquid fund until the 20th", amount: gst, color: "text-blue-400", bg: "#3b82f6" },
      { name: "3. Advance-tax reserve", desc: "Set aside before the next due date", amount: tax, color: "text-purple-400", bg: "#a855f7" },
      { name: "4. Emergency fund top-up", desc: "Instant-access contingency reserve", amount: emergency, color: "text-cyan-400", bg: "#06b6d4" },
      { name: "5. Prepay high-cost debt", desc: "Clears interest > any safe yield", amount: debt, color: "text-orange-400", bg: "#f97316" },
      { name: "6. Deploy to yield", desc: "FD ladder / debt funds / T-bills", amount: invest, color: "text-green-400", bg: "#22c55e" },
    ];
  }, [S, opex, weeks, gstDue, advanceTax, emergencyTarget, highCostDebt]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Gift size={14} className="text-[var(--color-primary)]" /> Surplus-Deployment Waterfall</h3>
        <p className="text-xs text-[var(--color-muted)]">One surplus, many claims. This pours cash through a priority waterfall — buffer, then committed liabilities, then debt, then yield — so you never invest money that's already spoken for.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Surplus to deploy (₹)</label>
            <input type="number" value={surplus} onChange={e => setSurplus(e.target.value)} placeholder="3000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Weekly opex (₹)</label>
            <input type="number" value={weeklyOpex} onChange={e => setWeeklyOpex(e.target.value)} placeholder="250000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Buffer weeks</label>
            <input type="number" value={bufferWeeks} onChange={e => setBufferWeeks(e.target.value)} placeholder="6" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GST due soon (₹)</label>
            <input type="number" value={gstDue} onChange={e => setGstDue(e.target.value)} placeholder="180000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Advance tax (₹)</label>
            <input type="number" value={advanceTax} onChange={e => setAdvanceTax(e.target.value)} placeholder="200000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Emergency top-up (₹)</label>
            <input type="number" value={emergencyTarget} onChange={e => setEmergencyTarget(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">High-cost debt (₹)</label>
            <input type="number" value={highCostDebt} onChange={e => setHighCostDebt(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {S > 0 && (
        <div className="space-y-2.5">
          {steps.map(st => {
            const pct = S > 0 ? (st.amount / S) * 100 : 0;
            return (
              <div key={st.name} className={`${CARD} p-4`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <p className="text-sm font-semibold">{st.name}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">{st.desc}</p>
                  </div>
                  <p className={`text-base font-bold tabular-nums ${st.color}`}>{formatCurrency(Math.round(st.amount))}</p>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: st.bg }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Tiers fill top-down: each claim is fully met before the next gets a rupee. If surplus runs out before the yield tier, nothing is invested — exactly the point. Set high-cost debt to 0 if you have none. Estimates, not advice.</p>
    </div>
  );
}

// ── #24 Gold / SGB Allocation Planner ──────────────────────────────────────────
function GoldSgbPlanner() {
  const [portfolio, setPortfolio] = useState("");
  const [goldPct, setGoldPct] = useState(10);
  const [years, setYears] = useState("5");
  const [goldCagr, setGoldCagr] = useState("9");
  const [sgbCoupon, setSgbCoupon] = useState("2.5");

  const P = parseFloat(portfolio) || 0;
  const t = parseFloat(years) || 0;
  const goldAlloc = Math.round(P * goldPct / 100);
  const cagr = (parseFloat(goldCagr) || 0) / 100;
  const coupon = (parseFloat(sgbCoupon) || 0) / 100;
  // SGB: 2.5% p.a. coupon (taxable) on issue price + price appreciation (LTCG-exempt if held to 8y maturity).
  const priceGrowth = goldAlloc * (Math.pow(1 + cagr, t) - 1);
  const couponIncome = goldAlloc * coupon * t;
  const sgbTotal = priceGrowth + couponIncome;
  // Physical/ETF gold: only price growth, no coupon; LTCG taxed.
  const ready = P > 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Gem size={14} className="text-[var(--color-primary)]" /> Gold / SGB Allocation Planner</h3>
        <p className="text-xs text-[var(--color-muted)]">Park a sliver of long-horizon reserve in Sovereign Gold Bonds — you earn a 2.5% p.a. coupon on top of gold price moves, and capital gains are tax-free if held to the 8-year maturity. Keep gold a small inflation hedge, not a core holding.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Investable portfolio (₹)</label>
            <input type="number" value={portfolio} onChange={e => setPortfolio(e.target.value)} placeholder="2000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Horizon (years)</label>
            <input type="number" value={years} onChange={e => setYears(e.target.value)} placeholder="5" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gold CAGR (% p.a.)</label>
            <input type="number" value={goldCagr} onChange={e => setGoldCagr(e.target.value)} placeholder="9" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">SGB coupon (% p.a.)</label>
            <input type="number" value={sgbCoupon} onChange={e => setSgbCoupon(e.target.value)} placeholder="2.5" className={INP} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Gold allocation: <strong className="text-[var(--color-text)]">{goldPct}%</strong> of portfolio</label>
          <input type="range" min={0} max={25} step={1} value={goldPct} onChange={e => setGoldPct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      {ready && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Allocated to gold", value: formatCurrency(goldAlloc), color: "text-[var(--color-text)]", sub: `${goldPct}% of portfolio` },
              { label: "Coupon income", value: formatCurrency(Math.round(couponIncome)), color: "text-green-400", sub: `${sgbCoupon || 0}% × ${years || 0}y (taxable)` },
              { label: "Price appreciation", value: formatCurrency(Math.round(priceGrowth)), color: "text-green-400", sub: "LTCG-free at maturity" },
              { label: "Total gain (SGB)", value: formatCurrency(Math.round(sgbTotal)), color: "text-[var(--color-primary)]", sub: `over ${years || 0} years` },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-bg)] text-sm">
            <p className="text-[var(--color-muted)]">SGBs beat physical gold and gold ETFs by the extra <strong className="text-green-400">{formatCurrency(Math.round(couponIncome))}</strong> coupon over {years || 0} years, with no making charges or storage risk. The trade-off: SGBs have an 8-year tenor (early exit only via the exchange, often at a discount), so size the allocation to cash you truly won't touch.</p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Gold CAGR is an assumption, not a guarantee — gold can fall for years. SGB coupon is taxed at your slab; capital gains are exempt only if held to the 8-year maturity (gains on exchange exit before that are taxable). Fresh SGB tranches depend on RBI issuance.</p>
    </div>
  );
}

// ── #25 REIT / InvIT Income Estimator ──────────────────────────────────────────
function ReitInvitEstimator() {
  const [amount, setAmount] = useState("");
  const [distYield, setDistYield] = useState("6.5");
  const [interestShare, setInterestShare] = useState(60);
  const [dividendShare, setDividendShare] = useState(25);
  const [slab, setSlab] = useState("30");

  const P = parseFloat(amount) || 0;
  const gross = P * (parseFloat(distYield) || 0) / 100;
  const slabRate = (parseFloat(slab) || 0) / 100;
  // REIT/InvIT payout splits: interest (taxed at slab), dividend (taxable at slab if SPV opted concessional regime),
  // and return-of-capital / amortisation (reduces cost, effectively tax-deferred). Remainder = RoC.
  const intPart = gross * interestShare / 100;
  const divPart = gross * dividendShare / 100;
  const rocPart = Math.max(0, gross - intPart - divPart);
  const tax = (intPart + divPart) * slabRate;
  const netIncome = gross - tax;
  const postTaxYield = P > 0 ? (netIncome / P) * 100 : 0;
  const ready = P > 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Building size={14} className="text-[var(--color-primary)]" /> REIT / InvIT Income Estimator</h3>
        <p className="text-xs text-[var(--color-muted)]">Listed REITs (Embassy, Mindspace, Brookfield) and InvITs distribute rent/toll income quarterly. The payout is a mix of interest, dividend and return-of-capital, each taxed differently — so the headline distribution yield overstates what you keep.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount invested (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Distribution yield (% p.a.)</label>
            <input type="number" value={distYield} onChange={e => setDistYield(e.target.value)} placeholder="6.5" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Your tax slab (%)</label>
            <input type="number" value={slab} onChange={e => setSlab(e.target.value)} placeholder="30" className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Interest portion: <strong className="text-[var(--color-text)]">{interestShare}%</strong></label>
            <input type="range" min={0} max={100} step={5} value={interestShare} onChange={e => setInterestShare(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Dividend portion: <strong className="text-[var(--color-text)]">{dividendShare}%</strong></label>
            <input type="range" min={0} max={100} step={5} value={dividendShare} onChange={e => setDividendShare(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {ready && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Gross distribution / yr", value: formatCurrency(Math.round(gross)), color: "text-[var(--color-text)]", sub: `${distYield || 0}% of capital` },
              { label: "Taxable (int + div)", value: formatCurrency(Math.round(intPart + divPart)), color: "text-yellow-400", sub: `${interestShare + dividendShare}% of payout` },
              { label: "Return-of-capital", value: formatCurrency(Math.round(rocPart)), color: "text-blue-400", sub: "Tax-deferred (cuts cost base)" },
              { label: "Post-tax yield", value: `${postTaxYield.toFixed(2)}%`, color: "text-green-400", sub: formatCurrency(Math.round(netIncome)) + "/yr net" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-bg)] text-sm">
            <p className="text-[var(--color-muted)]">The return-of-capital slice isn't taxed now but reduces your cost base, so it surfaces as capital gains when you sell. REITs/InvITs are market-traded — unit prices move with interest rates and occupancy, so treat this as long-horizon income, not a parking spot for buffer cash.</p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Payout components vary every quarter and per trust — check the actual distribution breakup in the trust's filing. Dividend taxability depends on whether the SPV opted for the concessional tax regime. Unit prices fluctuate; capital is at risk. Not advice.</p>
    </div>
  );
}

// ── #26 Mark-to-Market Tracker ─────────────────────────────────────────────────
type MtmHolding = { id: string; name: string; units: string; cost: string; price: string };
function MarkToMarketTracker() {
  const [rows, setRows] = useFeatureState<MtmHolding[]>("trez-mtm", []);
  const [name, setName] = useState("");
  const [units, setUnits] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");

  const add = () => {
    const u = parseFloat(units), c = parseFloat(cost);
    if (!name.trim() || isNaN(u) || u <= 0 || isNaN(c) || c <= 0) { toast.error("Enter holding, units and avg cost"); return; }
    setRows([...rows, { id: crypto.randomUUID(), name: name.trim(), units, cost, price: price || cost }]);
    setName(""); setUnits(""); setCost(""); setPrice("");
    toast.success("Holding added");
  };
  const setPx = (id: string, px: string) => setRows(rows.map(r => r.id === id ? { ...r, price: px } : r));

  const calc = (r: MtmHolding) => {
    const u = parseFloat(r.units) || 0, c = parseFloat(r.cost) || 0, p = parseFloat(r.price) || 0;
    const invested = u * c, value = u * p, pnl = value - invested;
    const pct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, value, pnl, pct };
  };
  const totInvested = rows.reduce((s, r) => s + calc(r).invested, 0);
  const totValue = rows.reduce((s, r) => s + calc(r).value, 0);
  const totPnl = totValue - totInvested;
  const totPct = totInvested > 0 ? (totPnl / totInvested) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Mark-to-Market Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Enter current NAV/price for each treasury holding to see live unrealised gain/loss across the book — the number your CA marks at year-end and lenders look at for net worth.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Holding</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Liquid fund" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Units</label>
            <input type="number" value={units} onChange={e => setUnits(e.target.value)} placeholder="1000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Avg cost / unit (₹)</label>
            <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="100" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Current price (₹)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="105" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No holdings yet. Add funds, bonds or deposits to mark to market.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Invested", value: formatCurrency(Math.round(totInvested)), color: "text-[var(--color-text)]" },
              { label: "Market value", value: formatCurrency(Math.round(totValue)), color: "text-[var(--color-text)]" },
              { label: "Unrealised P&L", value: formatCurrency(Math.round(totPnl)), color: totPnl >= 0 ? "text-green-400" : "text-red-400" },
              { label: "Return", value: `${totPct >= 0 ? "+" : ""}${totPct.toFixed(2)}%`, color: totPct >= 0 ? "text-green-400" : "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Holding", "Units", "Cost", "Price", "Value", "P&L", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const c = calc(r);
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.name}</td>
                        <td className="px-4 py-2.5 tabular-nums">{parseFloat(r.units).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(parseFloat(r.cost) || 0)}</td>
                        <td className="px-4 py-2.5">
                          <input type="number" value={r.price} onChange={e => setPx(r.id, e.target.value)} className="w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]" />
                        </td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(Math.round(c.value))}</td>
                        <td className={`px-4 py-2.5 tabular-nums ${c.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(c.pnl))} <span className="text-[10px]">({c.pct >= 0 ? "+" : ""}{c.pct.toFixed(1)}%)</span></td>
                        <td className="px-4 py-2.5"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Unrealised gains aren't taxed until you redeem; this is a position snapshot, not a realised-gains statement. Update prices/NAVs manually from your fund or broker. FDs hold at face value (no MTM).</p>
    </div>
  );
}

// ── #27 Counterparty / Bank Exposure (DICGC) Limits ────────────────────────────
type BankExp = { id: string; bank: string; amount: string };
function BankExposureLimits() {
  const [rows, setRows] = useFeatureState<BankExp[]>("trez-dicgc", []);
  const [bank, setBank] = useState("");
  const [amount, setAmount] = useState("");
  const COVER = 500000; // DICGC deposit insurance: ₹5L per depositor per bank.

  const add = () => {
    const a = parseFloat(amount);
    if (!bank.trim() || isNaN(a) || a <= 0) { toast.error("Enter bank and deposit amount"); return; }
    setRows([...rows, { id: crypto.randomUUID(), bank: bank.trim(), amount }]);
    setBank(""); setAmount("");
    toast.success("Bank added");
  };

  const totDeposit = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const totInsured = rows.reduce((s, r) => s + Math.min(parseFloat(r.amount) || 0, COVER), 0);
  const totUninsured = totDeposit - totInsured;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Counterparty / Bank Exposure (DICGC)</h3>
        <p className="text-xs text-[var(--color-muted)]">DICGC insures only ₹5,00,000 per depositor per bank (principal + interest, across all branches). Spread large deposits across banks so a single bank failure can't take more than the cover. This flags every bank where you're over the limit.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Bank</label>
            <input value={bank} onChange={e => setBank(e.target.value)} placeholder="HDFC Bank" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total deposit (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1200000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No banks added. Enter your deposit per bank to check DICGC coverage.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total deposits", value: formatCurrency(Math.round(totDeposit)), color: "text-[var(--color-text)]" },
              { label: "Insured (DICGC)", value: formatCurrency(Math.round(totInsured)), color: "text-green-400" },
              { label: "Uninsured", value: formatCurrency(Math.round(totUninsured)), color: totUninsured > 0 ? "text-red-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2.5">
            {rows.map(r => {
              const amt = parseFloat(r.amount) || 0;
              const over = Math.max(0, amt - COVER);
              const pct = amt > 0 ? Math.min(100, (COVER / amt) * 100) : 100;
              return (
                <div key={r.id} className={`${CARD} p-4`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-1.5">{r.bank}{over > 0 && <span className="text-[9px] text-red-400 font-bold flex items-center gap-0.5"><AlertTriangle size={10} /> OVER COVER</span>}</p>
                      <p className="text-[11px] text-[var(--color-muted)]">{formatCurrency(amt)} deposited · {over > 0 ? `${formatCurrency(Math.round(over))} uninsured` : "fully insured"}</p>
                    </div>
                    <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${over > 0 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {totUninsured > 0 && (
            <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
              <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {formatCurrency(Math.round(totUninsured))} sits above DICGC cover. Move the excess to other banks (₹5L each), or to T-bills/G-Secs which carry sovereign rather than bank risk.</p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">DICGC cover is ₹5,00,000 per depositor per bank (same PAN, across branches), including principal and interest. Deposits in different banks are separately insured. Current accounts also count toward the limit. Cover is per bank, not per account.</p>
    </div>
  );
}

// ── #28 Treasury Policy Config ─────────────────────────────────────────────────
type TreasuryPolicy = {
  bufferWeeks: number; minRating: string; maxIssuerPct: number; maxSingleBankPct: number;
  allowEquity: boolean; dualApprovalAbove: string; allowedInstruments: string[];
};
const ALL_INSTRUMENTS = ["Liquid funds", "Overnight funds", "Short-duration debt", "Bank FD", "Corporate FD (AAA)", "T-Bills / G-Secs", "SGB", "Index ETF"];
function TreasuryPolicyConfig() {
  const [policy, setPolicy] = useFeatureState<TreasuryPolicy>("trez-policy", {
    bufferWeeks: 6, minRating: "AAA", maxIssuerPct: 20, maxSingleBankPct: 25,
    allowEquity: false, dualApprovalAbove: "1000000", allowedInstruments: ["Liquid funds", "Overnight funds", "Bank FD", "T-Bills / G-Secs"],
  });
  const set = <K extends keyof TreasuryPolicy>(k: K, v: TreasuryPolicy[K]) => setPolicy({ ...policy, [k]: v });
  const toggleInst = (i: string) => set("allowedInstruments", policy.allowedInstruments.includes(i)
    ? policy.allowedInstruments.filter(x => x !== i) : [...policy.allowedInstruments, i]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> Treasury Policy &amp; Limits</h3>
        <p className="text-xs text-[var(--color-muted)]">A board-ready written policy is what separates disciplined treasury from cash kept on vibes. Set the rules once — buffer, credit floor, concentration caps, approval threshold — and use it as the mandate any sweep or investment must obey.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Min runway buffer (weeks)</label>
            <input type="number" value={policy.bufferWeeks} onChange={e => set("bufferWeeks", Number(e.target.value) || 0)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Min credit rating</label>
            <select value={policy.minRating} onChange={e => set("minRating", e.target.value)} className={INP}>
              {["AAA", "AA+", "AA", "A+", "Sovereign only"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Max per issuer (%)</label>
            <input type="number" value={policy.maxIssuerPct} onChange={e => set("maxIssuerPct", Number(e.target.value) || 0)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Max per bank (%)</label>
            <input type="number" value={policy.maxSingleBankPct} onChange={e => set("maxSingleBankPct", Number(e.target.value) || 0)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Dual approval above (₹)</label>
            <input type="number" value={policy.dualApprovalAbove} onChange={e => set("dualApprovalAbove", e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div className="flex items-end">
            <button onClick={() => set("allowEquity", !policy.allowEquity)}
              className={`w-full py-2 text-xs font-semibold rounded-lg border transition-all ${policy.allowEquity ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              Equity {policy.allowEquity ? "allowed" : "blocked"}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-2">Permitted instruments</label>
          <div className="flex flex-wrap gap-2">
            {ALL_INSTRUMENTS.map(i => {
              const on = policy.allowedInstruments.includes(i);
              return (
                <button key={i} onClick={() => toggleInst(i)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-all ${on ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                  {on ? "✓ " : ""}{i}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3 flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> Generated policy statement</p>
        <ul className="text-sm text-[var(--color-muted)] space-y-2 list-disc pl-5">
          <li>Maintain a minimum operating buffer of <strong className="text-[var(--color-text)]">{policy.bufferWeeks} weeks</strong> of operating expenses in liquid form before any surplus is invested.</li>
          <li>Invest only in instruments rated <strong className="text-[var(--color-text)]">{policy.minRating}</strong> or higher.</li>
          <li>No single issuer may exceed <strong className="text-[var(--color-text)]">{policy.maxIssuerPct}%</strong> of the treasury, and no single bank more than <strong className="text-[var(--color-text)]">{policy.maxSingleBankPct}%</strong>.</li>
          <li>Equity / index exposure is <strong className="text-[var(--color-text)]">{policy.allowEquity ? "permitted for long-horizon surplus only" : "not permitted"}</strong>.</li>
          <li>Any single transaction above <strong className="text-[var(--color-text)]">{formatCurrency(parseFloat(policy.dualApprovalAbove) || 0)}</strong> requires dual sign-off (owner + finance).</li>
          <li>Permitted instruments: <strong className="text-[var(--color-text)]">{policy.allowedInstruments.length ? policy.allowedInstruments.join(", ") : "none selected"}</strong>.</li>
        </ul>
        <button onClick={() => { navigator.clipboard?.writeText(
          `TREASURY INVESTMENT POLICY\n\n` +
          `1. Maintain a minimum operating buffer of ${policy.bufferWeeks} weeks of opex in liquid form before investing surplus.\n` +
          `2. Invest only in instruments rated ${policy.minRating} or higher.\n` +
          `3. Max ${policy.maxIssuerPct}% per issuer; max ${policy.maxSingleBankPct}% per bank.\n` +
          `4. Equity/index exposure: ${policy.allowEquity ? "permitted for long-horizon surplus only" : "not permitted"}.\n` +
          `5. Transactions above ${formatCurrency(parseFloat(policy.dualApprovalAbove) || 0)} require dual sign-off (owner + finance).\n` +
          `6. Permitted instruments: ${policy.allowedInstruments.join(", ") || "none"}.`
        ); toast.success("Policy copied to clipboard"); }}
          className="mt-4 flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-xs font-medium">
          <FileText size={12} /> Copy policy text
        </button>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A template, not legal/financial advice — adapt limits to your size and risk appetite, and have your CA or board ratify it. Settings are saved on this device.</p>
    </div>
  );
}

// ── #29 Accrued-Interest Calculator ────────────────────────────────────────────
function AccruedInterestCalculator() {
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("7.25");
  const [start, setStart] = useState(() => format(addDays(new Date(), -90), "yyyy-MM-dd"));
  const [asOf, setAsOf] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [basis, setBasis] = useState<"365" | "360">("365");

  const P = parseFloat(principal) || 0;
  const r = (parseFloat(rate) || 0) / 100;
  const days = Math.max(0, differenceInCalendarDays(new Date(asOf), new Date(start)));
  const dayBasis = parseInt(basis);
  // Simple accrual: P × r × days / basis.
  const accrued = P * r * days / dayBasis;
  const perDay = P * r / dayBasis;
  const ready = P > 0 && days >= 0;

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Clock size={14} className="text-[var(--color-primary)]" /> Accrued-Interest Calculator</h3>
        <p className="text-xs text-[var(--color-muted)]">Interest earned but not yet credited — needed to value an FD/bond mid-tenure, book a month-end accrual entry, or settle a deposit transfer between dates.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Principal / face (₹)</label>
            <input type="number" value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Coupon / rate (% p.a.)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="7.25" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Last paid / start date</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">As-of date</label>
            <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className={INP} />
          </div>
        </div>
        <div className="flex gap-2">
          {(["365", "360"] as const).map(b => (
            <button key={b} onClick={() => setBasis(b)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${basis === b ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              Actual/{b} {b === "365" ? "(FD/bond)" : "(money mkt)"}
            </button>
          ))}
        </div>
      </div>

      {ready && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Days accrued", value: `${days}`, color: "text-[var(--color-text)]" },
            { label: "Interest / day", value: formatCurrency(Math.round(perDay)), color: "text-[var(--color-muted)]" },
            { label: "Accrued interest", value: formatCurrency(Math.round(accrued)), color: "text-green-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Simple (non-compounded) accrual on a day-count basis — fine for FD/bond mid-period valuation and accounting accruals. Banks typically use Actual/365; money-market conventions use Actual/360. Actual credited interest may compound and differ slightly.</p>
    </div>
  );
}

// ── #30 Asset-Liability (Cash-Flow) Matcher ────────────────────────────────────
type AlItem = { id: string; kind: "asset" | "liability"; name: string; amount: string; date: string };
function AssetLiabilityMatcher() {
  const [items, setItems] = useFeatureState<AlItem[]>("trez-almatch", []);
  const [kind, setKind] = useState<"asset" | "liability">("liability");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => format(addDays(new Date(), 30), "yyyy-MM-dd"));

  const add = () => {
    const a = parseFloat(amount);
    if (!name.trim() || isNaN(a) || a <= 0) { toast.error("Enter a name and amount"); return; }
    setItems([...items, { id: crypto.randomUUID(), kind, name: name.trim(), amount, date }]);
    setName(""); setAmount("");
    toast.success(`${kind === "asset" ? "Inflow" : "Outflow"} added`);
  };

  const today = new Date();
  const buckets = useMemo(() => {
    const ranges = [
      { label: "0–30 days", lo: 0, hi: 30 },
      { label: "31–90 days", lo: 31, hi: 90 },
      { label: "91–180 days", lo: 91, hi: 180 },
      { label: "180+ days", lo: 181, hi: Infinity },
    ];
    return ranges.map(rg => {
      const inSlice = items.filter(it => {
        const d = differenceInCalendarDays(new Date(it.date), today);
        return d >= rg.lo && d <= rg.hi;
      });
      const assets = inSlice.filter(i => i.kind === "asset").reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
      const liabs = inSlice.filter(i => i.kind === "liability").reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
      return { ...rg, assets, liabs, gap: assets - liabs };
    });
  }, [items, today]);

  const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ArrowLeftRight size={14} className="text-[var(--color-primary)]" /> Asset-Liability (Cash-Flow) Matcher</h3>
        <p className="text-xs text-[var(--color-muted)]">Line up maturing investments (inflows) against known outflows — GST, advance-tax, payroll, vendor dues — by time bucket. A negative gap means you'll have to break a deposit or borrow; match maturities to dues so cash lands just in time.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={kind} onChange={e => setKind(e.target.value as "asset" | "liability")} className={INP}>
              <option value="liability">Outflow (due)</option>
              <option value="asset">Inflow (matures)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="GST payment" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="300000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No flows yet. Add maturing investments and upcoming dues to check the match.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {buckets.map(b => (
              <div key={b.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{b.label}</p>
                <p className={`text-lg font-bold tabular-nums ${b.gap >= 0 ? "text-green-400" : "text-red-400"}`}>{b.gap >= 0 ? "+" : ""}{formatCurrency(Math.round(b.gap))}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">in {formatCurrency(Math.round(b.assets))} · out {formatCurrency(Math.round(b.liabs))}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Date", "Type", "Item", "Amount", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {sorted.map(it => (
                    <tr key={it.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5">{format(new Date(it.date), "d MMM yyyy")}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-bold ${it.kind === "asset" ? "text-green-400" : "text-red-400"}`}>{it.kind === "asset" ? "INFLOW" : "OUTFLOW"}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium">{it.name}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${it.kind === "asset" ? "text-green-400" : "text-red-400"}`}>{it.kind === "asset" ? "+" : "-"}{formatCurrency(parseFloat(it.amount) || 0)}</td>
                      <td className="px-4 py-2.5"><button onClick={() => setItems(items.filter(x => x.id !== it.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Gaps are within-bucket only and don't carry surplus forward between buckets — read them as timing warnings, not a full liquidity forecast. A negative near-term gap means plan a maturity or credit line before that bucket.</p>
    </div>
  );
}
