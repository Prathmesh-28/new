import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Wallet, Layers, GitCompareArrows, PieChart, Calculator, Landmark,
  Target, Users, Percent, CalendarClock, Droplets, Plus, TrendingUp,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, addMonths, differenceInCalendarDays } from "date-fns";

// shared styles (reused from TaxPage/DebtPage input convention)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type Tab =
  | "overview" | "sweep" | "ladder" | "compare" | "allocate" | "yield"
  | "tbill" | "goal" | "split" | "posttax" | "maturity";

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
