import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  ShieldAlert, ShieldCheck, Activity, Copy, Repeat, UserPlus, Landmark,
  ListChecks, History, Gauge, FileWarning, CheckSquare, AlertTriangle,
  CheckCircle2, Search, TrendingUp,
  CalendarClock, BarChart3, Zap, Scissors, Moon, Receipt, Users, GitMerge,
  Undo2, RefreshCw,
  FileSearch, Network, Download, KeyRound, Banknote, ScrollText,
  CircleDollarSign, Fingerprint, ShieldQuestion, ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays, parseISO, format } from "date-fns";

// shared styles (mirrors TaxPage / DebtPage input + card conventions)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type TabId =
  | "overview" | "anomaly" | "duplicate" | "roundtrip" | "newpayee" | "bankchange"
  | "rules" | "access" | "scorecard" | "invoice" | "hygiene"
  | "weekend" | "benford" | "velocity" | "threshold" | "dormant" | "expense"
  | "sod" | "vendordedupe" | "refund" | "recurring"
  | "gstitc" | "iplog" | "dataexport" | "keyrotation" | "cashspike" | "paniclog"
  | "roundamt" | "payrollbank" | "newacctlimit" | "selfassess";

const TABS = [
  ["overview", "Overview", ShieldCheck],
  ["anomaly", "Anomaly Scanner", Activity],
  ["duplicate", "Duplicate Payments", Copy],
  ["roundtrip", "Round-Trip Detector", Repeat],
  ["newpayee", "New-Payee Watch", UserPlus],
  ["bankchange", "Vendor Bank Change", Landmark],
  ["rules", "Monitoring Rules", ListChecks],
  ["access", "Access Review Log", History],
  ["scorecard", "Fraud Risk Score", Gauge],
  ["invoice", "Suspicious Invoices", FileWarning],
  ["hygiene", "Security Checklist", CheckSquare],
  ["weekend", "Off-Hours Payments", CalendarClock],
  ["benford", "Benford's-Law Audit", BarChart3],
  ["velocity", "Payment Velocity", Zap],
  ["threshold", "Under-Limit Splitting", Scissors],
  ["dormant", "Dormant Reactivation", Moon],
  ["expense", "Expense-Policy Flags", Receipt],
  ["sod", "Duties Separation", Users],
  ["vendordedupe", "Vendor Dedupe", GitMerge],
  ["refund", "Refund Anomalies", Undo2],
  ["recurring", "Recurring-Charge Watch", RefreshCw],
  ["gstitc", "Fake-ITC Risk", FileSearch],
  ["iplog", "IP / Device Allowlist", Network],
  ["dataexport", "Data-Export Audit", Download],
  ["keyrotation", "Key Rotation", KeyRound],
  ["cashspike", "Cash Spike Monitor", Banknote],
  ["paniclog", "Sensitive-Action Log", ScrollText],
  ["roundamt", "Round-Amount Flags", CircleDollarSign],
  ["payrollbank", "Payroll-vs-Vendor Bank", Fingerprint],
  ["newacctlimit", "New-Account Over Limit", ShieldQuestion],
  ["selfassess", "Control Self-Assessment", ClipboardCheck],
] as const;

const DISCLAIMER = "These are heuristic flags - suspects, not verdicts. Confirm with source documents and the counterparty before acting.";

// ── Shared helpers ────────────────────────────────────────────────────────────
type Txn = {
  id: string; date: string; amount: number; description: string;
  category: string; counterparty: string; isRecurring?: boolean;
};

function outflows(txns: Txn[]): Txn[] {
  return txns.filter(t => t.amount < 0);
}
function daysBetween(a: string, b: string): number {
  try { return Math.abs(differenceInCalendarDays(parseISO(a), parseISO(b))); } catch { return Infinity; }
}
function safeFormatDate(d: string): string {
  try { return format(parseISO(d), "d MMM yyyy"); } catch { return d; }
}

export default function SecurityPage() {
  const { store } = useApp();
  const txns = store.transactions as Txn[];
  const [tab, setTab] = useState<TabId>("overview");

  // Cheap top-level flag counts for the overview summary cards.
  const counts = useMemo(() => {
    const out = outflows(txns);
    // anomalies: σ-outliers among outflows
    const amts = out.map(t => Math.abs(t.amount));
    const mean = amts.length ? amts.reduce((s, n) => s + n, 0) / amts.length : 0;
    const variance = amts.length ? amts.reduce((s, n) => s + (n - mean) ** 2, 0) / amts.length : 0;
    const sd = Math.sqrt(variance);
    const anomalies = sd > 0 ? out.filter(t => Math.abs(Math.abs(t.amount) - mean) > 2 * sd).length : 0;

    // duplicates: same payee + same amount within 7 days
    let dupes = 0;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (
          out[i].counterparty === out[j].counterparty &&
          Math.round(Math.abs(out[i].amount)) === Math.round(Math.abs(out[j].amount)) &&
          daysBetween(out[i].date, out[j].date) <= 7
        ) { dupes++; break; }
      }
    }

    // new payees: first-time counterparties in the last 30 days
    const firstSeen = new Map<string, string>();
    [...txns].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
      if (!firstSeen.has(t.counterparty)) firstSeen.set(t.counterparty, t.date);
    });
    const today = new Date().toISOString().slice(0, 10);
    let newPayees = 0;
    firstSeen.forEach(d => { if (daysBetween(d, today) <= 30) newPayees++; });

    return { anomalies, dupes, newPayees, total: txns.length };
  }, [txns]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert size={18} className="text-[var(--color-primary)]" /> Fraud, Security &amp; Trust
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Self-checks on your ledger - anomaly, duplicate, round-trip and new-payee detection plus access &amp; hygiene reviews, all computed from live data.
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

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Payment Anomalies", value: counts.anomalies, color: counts.anomalies > 0 ? "text-orange-400" : "text-green-400", sub: "σ-outlier outflows (>2σ)" },
              { label: "Duplicate Suspects", value: counts.dupes, color: counts.dupes > 0 ? "text-red-400" : "text-green-400", sub: "same payee + amount ≤7d" },
              { label: "New Payees (30d)", value: counts.newPayees, color: counts.newPayees > 0 ? "text-yellow-400" : "text-green-400", sub: "first-time counterparties" },
              { label: "Transactions Scanned", value: counts.total, color: "text-[var(--color-text)]", sub: "live ledger size" },
            ].map(c => (
              <div key={c.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className={`${CARD} p-5`}>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--color-primary)]" /> What this module does</h2>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              A first line of defence against the payment fraud that hits Indian SMBs hardest: double-pays, business-email-compromise bank reroutes, ghost vendors and structured payments under approval limits. Every tool runs on the same transactions and invoices you already track - nothing leaves your device.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                ["Anomaly Scanner", "Statistical outlier payments worth a second look."],
                ["Duplicate Payments", "Same payee + amount paid twice in a short window."],
                ["Round-Trip Detector", "Money out then back from the same party - circular flow."],
                ["New-Payee Watch", "First-time counterparties getting real money."],
                ["Vendor Bank Change", "Track payee bank details; confirm changes out-of-band."],
                ["Monitoring Rules", "Your own no-code if-then flags on every transaction."],
                ["Access Review Log", "Record who can do what, last reviewed when."],
                ["Fraud Risk Score", "A weighted scorecard rolling up every signal."],
                ["Suspicious Invoices", "Round numbers, gaps and dupes in your AR."],
                ["Security Checklist", "Hygiene controls every finance team should have."],
              ].map(([t, d]) => (
                <div key={t} className="flex items-start gap-2 text-xs py-1.5 border-b border-[var(--color-border)] last:border-0">
                  <CheckCircle2 size={12} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
                  <span><span className="font-medium text-[var(--color-text)]">{t}</span> - <span className="text-[var(--color-muted)]">{d}</span></span>
                </div>
              ))}
            </div>
          </div>
          <Note />
        </div>
      )}

      {tab === "anomaly" && <AnomalyScanner txns={txns} />}
      {tab === "duplicate" && <DuplicatePaymentDetector txns={txns} />}
      {tab === "roundtrip" && <RoundTripDetector txns={txns} />}
      {tab === "newpayee" && <NewPayeeWatch txns={txns} />}
      {tab === "bankchange" && <VendorBankChangeFlag txns={txns} />}
      {tab === "rules" && <MonitoringRules txns={txns} />}
      {tab === "access" && <AccessReviewLog />}
      {tab === "scorecard" && <FraudScorecard txns={txns} invoices={store.invoices} />}
      {tab === "invoice" && <SuspiciousInvoices invoices={store.invoices} />}
      {tab === "hygiene" && <SecurityChecklist />}
      {tab === "weekend" && <OffHoursPayments txns={txns} />}
      {tab === "benford" && <BenfordAudit txns={txns} />}
      {tab === "velocity" && <PaymentVelocity txns={txns} />}
      {tab === "threshold" && <UnderLimitSplitting txns={txns} />}
      {tab === "dormant" && <DormantReactivation txns={txns} />}
      {tab === "expense" && <ExpensePolicyFlags txns={txns} />}
      {tab === "sod" && <DutiesSeparation txns={txns} />}
      {tab === "vendordedupe" && <VendorDedupe txns={txns} />}
      {tab === "refund" && <RefundAnomalies txns={txns} />}
      {tab === "recurring" && <RecurringChargeWatch txns={txns} />}
      {tab === "gstitc" && <FakeItcRisk txns={txns} />}
      {tab === "iplog" && <IpAllowlistRegister />}
      {tab === "dataexport" && <DataExportAudit />}
      {tab === "keyrotation" && <KeyRotationReminder />}
      {tab === "cashspike" && <CashSpikeMonitor txns={txns} />}
      {tab === "paniclog" && <SensitiveActionLog />}
      {tab === "roundamt" && <RoundAmountFlags txns={txns} />}
      {tab === "payrollbank" && <PayrollVendorBankMatch txns={txns} />}
      {tab === "newacctlimit" && <NewAccountOverLimit txns={txns} />}
      {tab === "selfassess" && <ControlSelfAssessment />}
    </div>
  );
}

function Note() {
  return (
    <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
      <AlertTriangle size={12} className="shrink-0 mt-px" />
      {DISCLAIMER}
    </div>
  );
}

function Empty({ icon: Icon, msg }: { icon: typeof Search; msg: string }) {
  return (
    <div className={`${CARD} border-dashed p-10 text-center`}>
      <Icon size={22} className="mx-auto text-[var(--color-muted)] mb-2 opacity-50" />
      <p className="text-sm text-[var(--color-muted)]">{msg}</p>
    </div>
  );
}

// ── #1 Anomaly Scanner (σ-outlier payments) ─────────────────────────────────────
function AnomalyScanner({ txns }: { txns: Txn[] }) {
  const [sigma, setSigma] = useState(2);
  const out = useMemo(() => outflows(txns), [txns]);

  const stats = useMemo(() => {
    const amts = out.map(t => Math.abs(t.amount));
    if (amts.length === 0) return null;
    const mean = amts.reduce((s, n) => s + n, 0) / amts.length;
    const variance = amts.reduce((s, n) => s + (n - mean) ** 2, 0) / amts.length;
    const sd = Math.sqrt(variance);
    return { mean, sd };
  }, [out]);

  const flagged = useMemo(() => {
    if (!stats || stats.sd === 0) return [];
    return out
      .map(t => ({ t, z: (Math.abs(t.amount) - stats.mean) / stats.sd }))
      .filter(r => Math.abs(r.z) >= sigma)
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  }, [out, stats, sigma]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Statistical Anomaly Scanner</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Flags outgoing payments whose size is far from your typical payment - a classic early signal of a fat-finger error, fraudulent transfer or unusual vendor demand.</p>
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {[
              { label: "Avg outflow", value: formatCurrency(Math.round(stats.mean)) },
              { label: "Std deviation (σ)", value: formatCurrency(Math.round(stats.sd)) },
              { label: "Threshold band", value: `±${sigma}σ` },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className="text-base font-bold tabular-nums">{k.value}</p>
              </div>
            ))}
          </div>
        )}
        <label className="text-xs text-[var(--color-muted)] block mb-1">Sensitivity: flag payments beyond <strong className="text-[var(--color-text)]">{sigma}σ</strong> (lower = stricter)</label>
        <input type="range" min={1} max={4} step={0.5} value={sigma} onChange={e => setSigma(Number(e.target.value))} className="w-full max-w-md accent-[var(--color-primary)]" />
      </div>

      {flagged.length === 0 ? (
        <Empty icon={Activity} msg={stats ? "No payments breach the threshold - nothing unusual at this sensitivity." : "No outgoing payments to analyse yet."} />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{flagged.length} outlier payment(s)</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Date", "Payee", "Amount", "Deviation", "Description"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {flagged.map(r => (
                  <tr key={r.t.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 tabular-nums text-xs">{safeFormatDate(r.t.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{r.t.counterparty || "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(Math.abs(r.t.amount)))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{r.z > 0 ? "+" : ""}{r.z.toFixed(1)}σ</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] max-w-[260px] truncate">{r.t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #2 Duplicate-Payment Detector (same payee + amount within N days) ────────────
function DuplicatePaymentDetector({ txns }: { txns: Txn[] }) {
  const [windowDays, setWindowDays] = useState(7);
  const out = useMemo(() => outflows(txns), [txns]);

  const groups = useMemo(() => {
    const byKey = new Map<string, Txn[]>();
    out.forEach(t => {
      const key = `${t.counterparty.trim().toLowerCase()}|${Math.round(Math.abs(t.amount))}`;
      byKey.set(key, [...(byKey.get(key) ?? []), t]);
    });
    const result: { payee: string; amount: number; rows: Txn[] }[] = [];
    byKey.forEach(rows => {
      if (rows.length < 2) return;
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      // any consecutive pair within the window makes this a suspect group
      const close = sorted.some((r, i) => i > 0 && daysBetween(r.date, sorted[i - 1].date) <= windowDays);
      if (close) result.push({ payee: rows[0].counterparty, amount: Math.abs(rows[0].amount), rows: sorted });
    });
    return result.sort((a, b) => b.amount - a.amount);
  }, [out, windowDays]);

  const exposure = groups.reduce((s, g) => s + g.amount * (g.rows.length - 1), 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Copy size={14} className="text-[var(--color-primary)]" /> Duplicate-Payment Detector</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Catches the same payee being paid the same amount more than once inside a short window - the signature of an accidental double-pay or a re-submitted invoice.</p>
        <label className="text-xs text-[var(--color-muted)] block mb-1">Window: payments within <strong className="text-[var(--color-text)]">{windowDays} days</strong> count as duplicates</label>
        <input type="range" min={1} max={30} step={1} value={windowDays} onChange={e => setWindowDays(Number(e.target.value))} className="w-full max-w-md accent-[var(--color-primary)]" />
      </div>

      {groups.length === 0 ? (
        <Empty icon={Copy} msg="No duplicate payment patterns found in this window." />
      ) : (
        <>
          <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-4">
            <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {groups.length} suspected duplicate group(s) - up to {formatCurrency(Math.round(exposure))} may be recoverable if these are genuine double-pays.</p>
          </div>
          <div className="space-y-3">
            {groups.map((g, i) => (
              <div key={i} className={`${CARD} p-4`}>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <p className="text-sm font-semibold">{g.payee || "Unknown payee"} · {formatCurrency(Math.round(g.amount))} × {g.rows.length}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-950/30 text-red-400 border border-red-800/40 font-semibold">{g.rows.length - 1} possible overpay(s)</span>
                </div>
                <div className="space-y-1">
                  {g.rows.map(r => (
                    <div key={r.id} className="flex items-center justify-between text-xs py-1 border-b border-[var(--color-border)] last:border-0">
                      <span className="text-[var(--color-muted)]">{safeFormatDate(r.date)} · {r.description}</span>
                      <span className="tabular-nums text-red-400">{formatCurrency(Math.round(Math.abs(r.amount)))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <Note />
    </div>
  );
}

// ── #3 Round-Trip Detector (money out then back from same party) ─────────────────
function RoundTripDetector({ txns }: { txns: Txn[] }) {
  const [windowDays, setWindowDays] = useState(30);
  const [tolerancePct, setTolerancePct] = useState(20);

  const pairs = useMemo(() => {
    const result: { payee: string; out: Txn; back: Txn; returnedPct: number }[] = [];
    const outs = txns.filter(t => t.amount < 0);
    const ins = txns.filter(t => t.amount > 0);
    outs.forEach(o => {
      const key = o.counterparty.trim().toLowerCase();
      const match = ins.find(i =>
        i.counterparty.trim().toLowerCase() === key &&
        i.date >= o.date &&
        daysBetween(i.date, o.date) <= windowDays &&
        Math.abs(i.amount - Math.abs(o.amount)) <= (Math.abs(o.amount) * tolerancePct) / 100
      );
      if (match) result.push({ payee: o.counterparty, out: o, back: match, returnedPct: Math.round((match.amount / Math.abs(o.amount)) * 100) });
    });
    return result.sort((a, b) => Math.abs(b.out.amount) - Math.abs(a.out.amount));
  }, [txns, windowDays, tolerancePct]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> Round-Trip Payment Detector</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Surfaces money paid out to a party and then received back from the same party shortly after - a pattern that can indicate circular billing, fund-parking or shell-entity activity.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Return window: <strong className="text-[var(--color-text)]">{windowDays} days</strong></label>
            <input type="range" min={3} max={90} step={1} value={windowDays} onChange={e => setWindowDays(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount match tolerance: <strong className="text-[var(--color-text)]">±{tolerancePct}%</strong></label>
            <input type="range" min={0} max={50} step={5} value={tolerancePct} onChange={e => setTolerancePct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {pairs.length === 0 ? (
        <Empty icon={Repeat} msg="No round-trip patterns detected with these settings." />
      ) : (
        <div className="space-y-3">
          {pairs.map((p, i) => (
            <div key={i} className={`${CARD} p-4`}>
              <p className="text-sm font-semibold mb-2">{p.payee || "Unknown party"} <span className="text-[10px] font-normal text-orange-400 ml-1">~{p.returnedPct}% returned</span></p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-red-950/15 border border-red-800/30 rounded-lg p-3">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">Paid out · {safeFormatDate(p.out.date)}</p>
                  <p className="tabular-nums font-bold text-red-400">{formatCurrency(Math.round(Math.abs(p.out.amount)))}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-1 truncate">{p.out.description}</p>
                </div>
                <div className="bg-green-950/15 border border-green-800/30 rounded-lg p-3">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">Came back · {safeFormatDate(p.back.date)}</p>
                  <p className="tabular-nums font-bold text-green-400">{formatCurrency(Math.round(p.back.amount))}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-1 truncate">{p.back.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #4 New-Payee Watch (first-time counterparties) ──────────────────────────────
function NewPayeeWatch({ txns }: { txns: Txn[] }) {
  const [lookback, setLookback] = useState(30);
  const today = new Date().toISOString().slice(0, 10);

  const payees = useMemo(() => {
    const firstSeen = new Map<string, { date: string; firstTxn: Txn; total: number; count: number }>();
    [...txns].filter(t => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
      const key = t.counterparty.trim().toLowerCase() || "(blank)";
      const cur = firstSeen.get(key);
      if (!cur) firstSeen.set(key, { date: t.date, firstTxn: t, total: Math.abs(t.amount), count: 1 });
      else { cur.total += Math.abs(t.amount); cur.count += 1; }
    });
    return [...firstSeen.values()]
      .filter(p => daysBetween(p.date, today) <= lookback)
      .sort((a, b) => b.total - a.total);
  }, [txns, lookback, today]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><UserPlus size={14} className="text-[var(--color-primary)]" /> New-Payee Watch</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Counterparties you paid for the first time recently. New payees deserve a quick verification - confirm the entity exists and the bank details are correct before the next payment.</p>
        <label className="text-xs text-[var(--color-muted)] block mb-1">Show payees first paid in the last <strong className="text-[var(--color-text)]">{lookback} days</strong></label>
        <input type="range" min={7} max={120} step={1} value={lookback} onChange={e => setLookback(Number(e.target.value))} className="w-full max-w-md accent-[var(--color-primary)]" />
      </div>

      {payees.length === 0 ? (
        <Empty icon={UserPlus} msg="No first-time payees in this window." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{payees.length} new payee(s)</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Payee", "First paid", "Payments since", "Total paid"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {payees.map((p, i) => (
                  <tr key={i} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium text-xs">{p.firstTxn.counterparty || "(blank)"}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{safeFormatDate(p.date)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{p.count}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(p.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #5 Vendor Bank-Change Risk Flag ─────────────────────────────────────────────
type VendorBank = { id: string; vendor: string; account: string; ifsc: string; recordedAt: string; lastChangedAt?: string };
function VendorBankChangeFlag({ txns }: { txns: Txn[] }) {
  const [records, setRecords] = useFeatureState<VendorBank[]>("sec-vendor-banks", []);
  const [vendor, setVendor] = useState("");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");

  const knownVendors = useMemo(
    () => [...new Set(txns.filter(t => t.amount < 0).map(t => t.counterparty).filter(Boolean))].sort(),
    [txns],
  );

  const save = () => {
    if (!vendor.trim() || !account.trim()) { toast.error("Enter a vendor and an account number"); return; }
    const now = new Date().toISOString();
    const key = vendor.trim().toLowerCase();
    const existing = records.find(r => r.vendor.trim().toLowerCase() === key);
    if (existing) {
      if (existing.account === account.trim() && existing.ifsc === ifsc.trim()) { toast("No change - details already on file"); return; }
      setRecords(records.map(r => r.id === existing.id ? { ...r, account: account.trim(), ifsc: ifsc.trim(), lastChangedAt: now } : r));
      toast.warning(`Bank details changed for ${existing.vendor} - verify out-of-band before paying`);
    } else {
      setRecords([...records, { id: crypto.randomUUID(), vendor: vendor.trim(), account: account.trim(), ifsc: ifsc.trim(), recordedAt: now }]);
      toast.success("Vendor bank details recorded");
    }
    setVendor(""); setAccount(""); setIfsc("");
  };

  const changed = records.filter(r => r.lastChangedAt);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Vendor Bank-Change Risk Flag</h2>
        <p className="text-xs text-[var(--color-muted)]">Record each vendor's bank account on file. If you later enter different details for the same vendor, the change is flagged - the textbook sign of business-email-compromise where a fraudster reroutes a genuine vendor's payments.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div className="md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Vendor</label>
            <input list="sec-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor name" className={INP} />
            <datalist id="sec-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account number</label>
            <input value={account} onChange={e => setAccount(e.target.value)} placeholder="XXXXXXXX1234" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">IFSC</label>
            <input value={ifsc} onChange={e => setIfsc(e.target.value)} placeholder="HDFC0000123" className={INP} />
          </div>
          <button onClick={save} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">Record / update</button>
        </div>
      </div>

      {changed.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-4">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {changed.length} vendor(s) changed bank details since first recorded - confirm by phone using a known number, not one from the request.</p>
        </div>
      )}

      {records.length === 0 ? (
        <Empty icon={Landmark} msg="No vendor bank details on file yet. Record them to detect future changes." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Vendor", "Account", "IFSC", "Status", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.vendor}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{r.account}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.ifsc || "-"}</td>
                    <td className="px-4 py-2.5">
                      {r.lastChangedAt
                        ? <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold"><AlertTriangle size={11} /> Changed {safeFormatDate(r.lastChangedAt.slice(0, 10))}</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={11} /> Stable</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setRecords(records.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #6 Transaction Monitoring Rules Engine ──────────────────────────────────────
type MonRule = { id: string; name: string; field: "amount" | "counterparty" | "description"; operator: "gt" | "lt" | "contains"; value: string; enabled: boolean };
function MonitoringRules({ txns }: { txns: Txn[] }) {
  const [rules, setRules] = useFeatureState<MonRule[]>("sec-monitoring-rules", []);
  const [name, setName] = useState("");
  const [field, setField] = useState<MonRule["field"]>("amount");
  const [operator, setOperator] = useState<MonRule["operator"]>("gt");
  const [value, setValue] = useState("");

  const matches = (r: MonRule, t: Txn): boolean => {
    if (r.field === "amount") {
      const v = parseFloat(r.value) || 0;
      const amt = Math.abs(t.amount);
      return r.operator === "gt" ? amt > v : r.operator === "lt" ? amt < v : false;
    }
    const hay = (r.field === "counterparty" ? t.counterparty : t.description).toLowerCase();
    return r.operator === "contains" ? hay.includes(r.value.trim().toLowerCase()) : false;
  };

  const hits = useMemo(() => {
    const active = rules.filter(r => r.enabled);
    return txns
      .filter(t => t.amount < 0)
      .map(t => ({ t, matched: active.filter(r => matches(r, t)) }))
      .filter(x => x.matched.length > 0)
      .sort((a, b) => b.t.date.localeCompare(a.t.date));
  }, [rules, txns]);

  const addRule = () => {
    if (!name.trim()) { toast.error("Name the rule"); return; }
    if (field === "amount" && isNaN(parseFloat(value))) { toast.error("Enter a numeric amount"); return; }
    if (field !== "amount" && !value.trim()) { toast.error("Enter text to match"); return; }
    const op: MonRule["operator"] = field === "amount" ? operator === "contains" ? "gt" : operator : "contains";
    setRules([...rules, { id: crypto.randomUUID(), name: name.trim(), field, operator: op, value: value.trim(), enabled: true }]);
    setName(""); setValue("");
    toast.success("Rule added");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ListChecks size={14} className="text-[var(--color-primary)]" /> Transaction Monitoring Rules</h2>
        <p className="text-xs text-[var(--color-muted)]">No-code if-then rules that flag any outgoing transaction crossing a limit or matching a keyword - your own watchlist on top of the automatic detectors.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rule name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Large cash-out" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Field</label>
            <select value={field} onChange={e => setField(e.target.value as MonRule["field"])} className={INP}>
              <option value="amount">Amount</option>
              <option value="counterparty">Payee</option>
              <option value="description">Description</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Condition</label>
            {field === "amount" ? (
              <select value={operator === "contains" ? "gt" : operator} onChange={e => setOperator(e.target.value as MonRule["operator"])} className={INP}>
                <option value="gt">greater than</option>
                <option value="lt">less than</option>
              </select>
            ) : (
              <div className={`${INP} text-[var(--color-muted)] flex items-center`}>contains</div>
            )}
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">{field === "amount" ? "Amount (₹)" : "Text"}</label>
            <input value={value} onChange={e => setValue(e.target.value)} placeholder={field === "amount" ? "100000" : "cash"} className={INP} />
          </div>
          <button onClick={addRule} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">Add rule</button>
        </div>
      </div>

      {rules.length > 0 && (
        <div className={`${CARD} p-4`}>
          <p className="text-sm font-semibold mb-2">Active rules</p>
          <div className="flex flex-wrap gap-2">
            {rules.map(r => (
              <span key={r.id} className={`inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border ${r.enabled ? "border-[var(--color-primary)]/40 text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-muted)] line-through"}`}>
                {r.name}: {r.field} {r.operator === "gt" ? ">" : r.operator === "lt" ? "<" : "contains"} {r.field === "amount" ? formatCurrency(parseFloat(r.value) || 0) : `"${r.value}"`}
                <button onClick={() => setRules(rules.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">{r.enabled ? "mute" : "on"}</button>
                <button onClick={() => setRules(rules.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400">✕</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {rules.filter(r => r.enabled).length === 0 ? (
        <Empty icon={ListChecks} msg="Add a rule to start flagging transactions." />
      ) : hits.length === 0 ? (
        <Empty icon={CheckCircle2} msg="No transactions match your active rules - all clear." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{hits.length} flagged transaction(s)</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Date", "Payee", "Amount", "Triggered rules"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {hits.map(x => (
                  <tr key={x.t.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 tabular-nums text-xs">{safeFormatDate(x.t.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{x.t.counterparty || "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(Math.abs(x.t.amount)))}</td>
                    <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{x.matched.map(m => <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-950/30 text-orange-400 border border-orange-800/40">{m.name}</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #7 Login / Access Review Log ────────────────────────────────────────────────
type AccessEntry = { id: string; person: string; role: string; scope: string; lastReviewed: string; status: "active" | "suspended" };
function AccessReviewLog() {
  const [entries, setEntries] = useFeatureState<AccessEntry[]>("sec-access-log", []);
  const [person, setPerson] = useState("");
  const [role, setRole] = useState("");
  const [scope, setScope] = useState("");

  const add = () => {
    if (!person.trim() || !role.trim()) { toast.error("Enter a person and a role"); return; }
    setEntries([...entries, { id: crypto.randomUUID(), person: person.trim(), role: role.trim(), scope: scope.trim() || "All modules", lastReviewed: new Date().toISOString().slice(0, 10), status: "active" }]);
    setPerson(""); setRole(""); setScope("");
    toast.success("Access entry recorded");
  };

  const today = new Date().toISOString().slice(0, 10);
  const stale = entries.filter(e => daysBetween(e.lastReviewed, today) > 90 && e.status === "active");

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><History size={14} className="text-[var(--color-primary)]" /> Access Review Log</h2>
        <p className="text-xs text-[var(--color-muted)]">Keep a living record of who has access to what. Reviewing access quarterly and removing leavers promptly is the single cheapest control against insider fraud and stale credentials.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Person</label>
            <input value={person} onChange={e => setPerson(e.target.value)} placeholder="e.g. Priya (CA)" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Role</label>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Finance manager" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Scope</label>
            <input value={scope} onChange={e => setScope(e.target.value)} placeholder="e.g. Payments, Reports" className={INP} />
          </div>
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">Add entry</button>
        </div>
      </div>

      {stale.length > 0 && (
        <div className="bg-yellow-950/20 border border-yellow-800/40 rounded-lg p-4">
          <p className="text-sm font-bold text-yellow-400 flex items-center gap-2"><AlertTriangle size={14} /> {stale.length} access grant(s) not reviewed in over 90 days - re-confirm they are still needed.</p>
        </div>
      )}

      {entries.length === 0 ? (
        <Empty icon={History} msg="No access entries recorded yet." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Person", "Role", "Scope", "Last reviewed", "Status", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {entries.map(e => {
                  const isStale = daysBetween(e.lastReviewed, today) > 90 && e.status === "active";
                  return (
                    <tr key={e.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium text-xs">{e.person}</td>
                      <td className="px-4 py-2.5 text-xs">{e.role}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{e.scope}</td>
                      <td className={`px-4 py-2.5 text-xs ${isStale ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>{safeFormatDate(e.lastReviewed)}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setEntries(entries.map(x => x.id === e.id ? { ...x, status: x.status === "active" ? "suspended" : "active" } : x))}
                          className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${e.status === "active" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                          {e.status === "active" ? "Active" : "Suspended"}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-2">
                        <button onClick={() => setEntries(entries.map(x => x.id === e.id ? { ...x, lastReviewed: today } : x))} className="text-[10px] text-[var(--color-primary)] hover:underline">Mark reviewed</button>
                        <button onClick={() => setEntries(entries.filter(x => x.id !== e.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #8 Fraud-Risk Scorecard ──────────────────────────────────────────────────────
function FraudScorecard({ txns, invoices }: { txns: Txn[]; invoices: { amount: number; invoiceNumber?: string }[] }) {
  const result = useMemo(() => {
    const out = outflows(txns);
    const amts = out.map(t => Math.abs(t.amount));
    const mean = amts.length ? amts.reduce((s, n) => s + n, 0) / amts.length : 0;
    const sd = amts.length ? Math.sqrt(amts.reduce((s, n) => s + (n - mean) ** 2, 0) / amts.length) : 0;
    const anomalies = sd > 0 ? out.filter(t => Math.abs(Math.abs(t.amount) - mean) > 2 * sd).length : 0;

    let dupes = 0;
    const seen = new Set<number>();
    for (let i = 0; i < out.length; i++) {
      if (seen.has(i)) continue;
      for (let j = i + 1; j < out.length; j++) {
        if (out[i].counterparty === out[j].counterparty && Math.round(Math.abs(out[i].amount)) === Math.round(Math.abs(out[j].amount)) && daysBetween(out[i].date, out[j].date) <= 7) { dupes++; seen.add(j); }
      }
    }

    // round-number bias: payments that are exact multiples of 10,000
    const roundCount = out.filter(t => Math.abs(t.amount) >= 10000 && Math.abs(t.amount) % 10000 === 0).length;
    const roundPct = out.length ? Math.round((roundCount / out.length) * 100) : 0;

    // missing invoice numbers
    const missingInv = invoices.filter(iv => !iv.invoiceNumber || !iv.invoiceNumber.trim()).length;

    const signals = [
      { label: "Outlier payments (>2σ)", count: anomalies, weight: 8, max: 5 },
      { label: "Duplicate-payment suspects", count: dupes, weight: 12, max: 4 },
      { label: "Round-number payments", count: roundPct, weight: 0.4, max: 100, unit: "%" },
      { label: "Invoices missing numbers", count: missingInv, weight: 5, max: 6 },
    ];
    let raw = 0;
    signals.forEach(s => { raw += Math.min(s.count, s.max) * s.weight; });
    const score = Math.min(100, Math.round(raw));
    const band = score >= 60 ? "High" : score >= 30 ? "Elevated" : "Low";
    const color = band === "High" ? "text-red-400" : band === "Elevated" ? "text-yellow-400" : "text-green-400";
    return { signals, score, band, color, anomalies, dupes, roundPct, missingInv };
  }, [txns, invoices]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Fraud-Risk Scorecard</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">A single weighted score rolling up every detector on this page. It is a relative health gauge, not an accusation - a high score means it is worth a closer look, not that fraud has occurred.</p>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <p className={`text-5xl font-bold tabular-nums ${result.color}`}>{result.score}</p>
            <p className="text-xs text-[var(--color-muted)]">/ 100 risk index</p>
          </div>
          <span className={`text-sm font-bold px-3 py-1 rounded-full border ${result.band === "High" ? "bg-red-950/30 text-red-400 border-red-800/40" : result.band === "Elevated" ? "bg-yellow-950/30 text-yellow-400 border-yellow-800/40" : "bg-green-950/30 text-green-400 border-green-800/40"}`}>{result.band} risk</span>
        </div>
        <div className="w-full h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden mt-4">
          <div className="h-full rounded-full transition-all" style={{ width: `${result.score}%`, background: result.band === "High" ? "#ef4444" : result.band === "Elevated" ? "#eab308" : "#22c55e" }} />
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp size={13} className="text-[var(--color-primary)]" /> Signal breakdown</p>
        <div className="space-y-2">
          {result.signals.map(s => (
            <div key={s.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
              <span className="text-xs text-[var(--color-muted)]">{s.label}</span>
              <span className={`tabular-nums font-semibold ${s.count > 0 ? "text-orange-400" : "text-green-400"}`}>{s.count}{"unit" in s ? s.unit : ""}</span>
            </div>
          ))}
        </div>
      </div>
      <Note />
    </div>
  );
}

// ── #9 Suspicious-Invoice Flags ──────────────────────────────────────────────────
type Inv = { id: string; customer: string; amount: number; invoiceNumber?: string; invoiceDate: string; status: string };
function SuspiciousInvoices({ invoices }: { invoices: Inv[] }) {
  const flags = useMemo(() => {
    const result: { invoice: Inv; reasons: string[] }[] = [];

    // sequence gaps: numeric suffixes of invoice numbers
    const numbered = invoices
      .map(iv => ({ iv, n: parseInt((iv.invoiceNumber ?? "").replace(/\D/g, ""), 10) }))
      .filter(x => !isNaN(x.n))
      .sort((a, b) => a.n - b.n);
    const gapIds = new Set<string>();
    for (let i = 1; i < numbered.length; i++) {
      if (numbered[i].n - numbered[i - 1].n > 1) gapIds.add(numbered[i].iv.id);
    }

    // duplicate invoice numbers
    const byNum = new Map<string, number>();
    invoices.forEach(iv => { const k = (iv.invoiceNumber ?? "").trim().toLowerCase(); if (k) byNum.set(k, (byNum.get(k) ?? 0) + 1); });

    invoices.forEach(iv => {
      const reasons: string[] = [];
      if (!iv.invoiceNumber || !iv.invoiceNumber.trim()) reasons.push("No invoice number");
      else if ((byNum.get(iv.invoiceNumber.trim().toLowerCase()) ?? 0) > 1) reasons.push("Duplicate invoice number");
      if (iv.amount >= 10000 && iv.amount % 10000 === 0) reasons.push("Suspiciously round amount");
      if (gapIds.has(iv.id)) reasons.push("Sequence gap before this number");
      if (reasons.length) result.push({ invoice: iv, reasons });
    });
    return result.sort((a, b) => b.invoice.amount - a.invoice.amount);
  }, [invoices]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileWarning size={14} className="text-[var(--color-primary)]" /> Suspicious-Invoice Flags</h2>
        <p className="text-xs text-[var(--color-muted)]">Scans your receivables for the tell-tales of fabricated or manipulated billing: missing or duplicate invoice numbers, suspiciously round amounts and gaps in your numbering sequence (a classic revenue-skimming signal).</p>
      </div>

      {flags.length === 0 ? (
        <Empty icon={FileWarning} msg={invoices.length ? "No suspicious invoice patterns found." : "No invoices to scan yet."} />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{flags.length} invoice(s) worth reviewing</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Invoice #", "Customer", "Amount", "Date", "Flags"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {flags.map(f => (
                  <tr key={f.invoice.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 text-xs font-medium">{f.invoice.invoiceNumber || "-"}</td>
                    <td className="px-4 py-2.5 text-xs">{f.invoice.customer}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{formatCurrency(Math.round(f.invoice.amount))}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{safeFormatDate(f.invoice.invoiceDate)}</td>
                    <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{f.reasons.map(r => <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-950/30 text-orange-400 border border-orange-800/40">{r}</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #10 Security-Hygiene Checklist ───────────────────────────────────────────────
const HYGIENE_ITEMS = [
  { id: "2fa", label: "Two-factor authentication enabled on banking & email", why: "Stops most account-takeover attempts cold." },
  { id: "maker-checker", label: "Second approver required for payments above a set limit", why: "A single compromised user can't move large sums alone." },
  { id: "vendor-verify", label: "Vendor bank details verified out-of-band before first payment", why: "Defeats business-email-compromise reroutes." },
  { id: "access-review", label: "Quarterly access review - leavers removed promptly", why: "Closes the door on ex-staff and stale credentials." },
  { id: "recon", label: "Monthly bank-to-ledger reconciliation completed", why: "Surfaces unexplained debits before they compound." },
  { id: "unique-pw", label: "Unique passwords / a password manager in use", why: "Credential reuse is the #1 breach vector." },
  { id: "device-lock", label: "Shared finance devices auto-lock when idle", why: "Prevents walk-up access on shared machines." },
  { id: "backups", label: "Encrypted, tested backups of financial data", why: "Recovery path against ransomware and loss." },
  { id: "least-priv", label: "Staff have least-privilege access (only what they need)", why: "Limits the blast radius of any one account." },
  { id: "incident-plan", label: "A written who-to-call plan for suspected fraud", why: "Speed matters - recall windows are short." },
] as const;
function SecurityChecklist() {
  const [done, setDone] = useFeatureState<Record<string, boolean>>("sec-hygiene", {});
  const total = HYGIENE_ITEMS.length;
  const completed = HYGIENE_ITEMS.filter(i => done[i.id]).length;
  const pct = Math.round((completed / total) * 100);
  const color = pct >= 80 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CheckSquare size={14} className="text-[var(--color-primary)]" /> Security-Hygiene Checklist</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">The baseline controls every small finance team should have. Most fraud losses trace back to a missing item on this list.</p>
        <div className="flex items-center gap-4">
          <p className={`text-3xl font-bold tabular-nums ${color}`}>{pct}%</p>
          <div className="flex-1">
            <p className="text-xs text-[var(--color-muted)] mb-1">{completed} of {total} controls in place</p>
            <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 80 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444" }} />
            </div>
          </div>
        </div>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {HYGIENE_ITEMS.map(item => {
          const checked = !!done[item.id];
          return (
            <label key={item.id} className="flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-white/2">
              <input type="checkbox" checked={checked} onChange={() => setDone({ ...done, [item.id]: !checked })} className="mt-0.5 accent-[var(--color-primary)]" />
              <div className="flex-1">
                <p className={`text-sm font-medium ${checked ? "text-[var(--color-muted)] line-through" : "text-[var(--color-text)]"}`}>{item.label}</p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{item.why}</p>
              </div>
              {checked && <CheckCircle2 size={15} className="text-green-400 shrink-0 mt-0.5" />}
            </label>
          );
        })}
      </div>
      <Note />
    </div>
  );
}

// ── #11 Off-Hours / Weekend Payment Flags ────────────────────────────────────────
function OffHoursPayments({ txns }: { txns: Txn[] }) {
  const flagged = useMemo(() => {
    return outflows(txns)
      .map(t => {
        let dow = -1;
        try { dow = parseISO(t.date).getDay(); } catch { dow = -1; }
        const isWeekend = dow === 0 || dow === 6;
        return { t, dow, isWeekend };
      })
      .filter(r => r.isWeekend)
      .sort((a, b) => Math.abs(b.t.amount) - Math.abs(a.t.amount));
  }, [txns]);

  const total = flagged.reduce((s, r) => s + Math.abs(r.t.amount), 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Off-Hours &amp; Weekend Payments</h2>
        <p className="text-xs text-[var(--color-muted)]">Outgoing payments dated on a Saturday or Sunday - when oversight is thinnest. Insider and business-email-compromise fraud disproportionately happens outside business hours, so weekend disbursements are worth a deliberate second look.</p>
      </div>

      {flagged.length === 0 ? (
        <Empty icon={CalendarClock} msg="No outgoing payments dated on a weekend." />
      ) : (
        <>
          <div className="bg-yellow-950/20 border border-yellow-800/40 rounded-lg p-4">
            <p className="text-sm font-bold text-yellow-400 flex items-center gap-2"><AlertTriangle size={14} /> {flagged.length} weekend payment(s) totalling {formatCurrency(Math.round(total))} - suspects, confirm each was authorised before acting.</p>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Date", "Day", "Payee", "Amount", "Description"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {flagged.map(r => (
                    <tr key={r.t.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 tabular-nums text-xs">{safeFormatDate(r.t.date)}</td>
                      <td className="px-4 py-2.5 text-xs text-yellow-400 font-medium">{r.dow === 0 ? "Sunday" : "Saturday"}</td>
                      <td className="px-4 py-2.5 font-medium text-xs">{r.t.counterparty || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(Math.abs(r.t.amount)))}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] max-w-[260px] truncate">{r.t.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <Note />
    </div>
  );
}

// ── #12 Benford's-Law First-Digit Audit ──────────────────────────────────────────
function BenfordAudit({ txns }: { txns: Txn[] }) {
  const result = useMemo(() => {
    const amts = outflows(txns).map(t => Math.abs(t.amount)).filter(a => a >= 1);
    const n = amts.length;
    const observed = Array<number>(10).fill(0); // index 1..9 used
    amts.forEach(a => {
      const d = parseInt(String(Math.round(a)).replace(/^0+/, "").charAt(0), 10);
      if (d >= 1 && d <= 9) observed[d]++;
    });
    const expectedPct = [0, 30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];
    const rows = [] as { digit: number; obsCount: number; obsPct: number; expPct: number; diff: number }[];
    let chi = 0;
    for (let d = 1; d <= 9; d++) {
      const obsPct = n ? (observed[d] / n) * 100 : 0;
      const expCount = n ? (expectedPct[d] / 100) * n : 0;
      if (expCount > 0) chi += ((observed[d] - expCount) ** 2) / expCount;
      rows.push({ digit: d, obsCount: observed[d], obsPct, expPct: expectedPct[d], diff: obsPct - expectedPct[d] });
    }
    // chi-square critical value at 8 d.o.f.: ~15.51 (p=0.05), ~20.09 (p=0.01)
    const verdict = n < 50 ? "insufficient" : chi > 20.09 ? "high" : chi > 15.51 ? "elevated" : "normal";
    return { n, rows, chi, verdict };
  }, [txns]);

  const vColor = result.verdict === "high" ? "text-red-400" : result.verdict === "elevated" ? "text-yellow-400" : result.verdict === "normal" ? "text-green-400" : "text-[var(--color-muted)]";
  const vLabel = result.verdict === "high" ? "Strong deviation" : result.verdict === "elevated" ? "Mild deviation" : result.verdict === "normal" ? "Conforms to Benford" : "Too few payments";

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><BarChart3 size={14} className="text-[var(--color-primary)]" /> Benford's-Law Ledger Audit</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">In genuine spend the leading digit follows Benford's distribution - 1 appears about 30% of the time, 9 under 5%. Fabricated or padded numbers tend to break this. A large gap is a prompt to investigate, never proof on its own.</p>
        {result.n < 50 ? (
          <p className="text-xs text-[var(--color-muted)]">Need at least 50 outgoing payments for a meaningful test - you have {result.n}.</p>
        ) : (
          <div className="flex items-end gap-4 flex-wrap">
            <div><p className={`text-3xl font-bold tabular-nums ${vColor}`}>{result.chi.toFixed(1)}</p><p className="text-xs text-[var(--color-muted)]">χ² statistic (8 d.o.f.)</p></div>
            <span className={`text-sm font-bold px-3 py-1 rounded-full border ${result.verdict === "high" ? "bg-red-950/30 text-red-400 border-red-800/40" : result.verdict === "elevated" ? "bg-yellow-950/30 text-yellow-400 border-yellow-800/40" : "bg-green-950/30 text-green-400 border-green-800/40"}`}>{vLabel}</span>
          </div>
        )}
      </div>

      {result.n >= 50 && (
        <div className={`${CARD} p-5`}>
          <p className="text-sm font-semibold mb-3">Leading-digit distribution</p>
          <div className="space-y-2">
            {result.rows.map(r => {
              const flag = Math.abs(r.diff) >= 5;
              return (
                <div key={r.digit} className="flex items-center gap-3 text-xs">
                  <span className="w-4 font-bold tabular-nums">{r.digit}</span>
                  <div className="flex-1 h-3 bg-[var(--color-bg)] rounded-full overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 border-r border-dashed border-[var(--color-muted)]/50" style={{ width: `${r.expPct}%` }} />
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.obsPct)}%`, background: flag ? "#eab308" : "var(--color-primary)" }} />
                  </div>
                  <span className="w-14 text-right tabular-nums text-[var(--color-muted)]">{r.obsPct.toFixed(1)}%</span>
                  <span className="w-12 text-right tabular-nums text-[10px] text-[var(--color-muted)]">exp {r.expPct}%</span>
                  <span className={`w-12 text-right tabular-nums ${flag ? "text-yellow-400 font-semibold" : "text-[var(--color-muted)]"}`}>{r.diff > 0 ? "+" : ""}{r.diff.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-3">Dashed line = Benford-expected share. Bars highlighted where observed differs from expected by 5 points or more.</p>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #13 Payment Velocity Burst Detector ──────────────────────────────────────────
function PaymentVelocity({ txns }: { txns: Txn[] }) {
  const [windowDays, setWindowDays] = useState(3);
  const [minCount, setMinCount] = useState(3);

  const bursts = useMemo(() => {
    const byPayee = new Map<string, Txn[]>();
    outflows(txns).forEach(t => {
      const k = t.counterparty.trim().toLowerCase() || "(blank)";
      byPayee.set(k, [...(byPayee.get(k) ?? []), t]);
    });
    const result: { payee: string; rows: Txn[]; total: number; spanDays: number }[] = [];
    byPayee.forEach(rows => {
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      // sliding window: find the densest run of payments within the window
      let best: Txn[] = [];
      for (let i = 0; i < sorted.length; i++) {
        const run = [sorted[i]];
        for (let j = i + 1; j < sorted.length; j++) {
          if (daysBetween(sorted[j].date, sorted[i].date) <= windowDays) run.push(sorted[j]);
          else break;
        }
        if (run.length > best.length) best = run;
      }
      if (best.length >= minCount) {
        const span = best.length > 1 ? daysBetween(best[0].date, best[best.length - 1].date) : 0;
        result.push({ payee: best[0].counterparty || "(blank)", rows: best, total: best.reduce((s, r) => s + Math.abs(r.amount), 0), spanDays: span });
      }
    });
    return result.sort((a, b) => b.rows.length - a.rows.length);
  }, [txns, windowDays, minCount]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Zap size={14} className="text-[var(--color-primary)]" /> Payment Velocity Burst</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Flags a single payee receiving an unusual flurry of payments in a short window - a pattern seen in mule activity, salami-style siphoning and runaway auto-mandates.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Window: <strong className="text-[var(--color-text)]">{windowDays} days</strong></label>
            <input type="range" min={1} max={14} step={1} value={windowDays} onChange={e => setWindowDays(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">At least <strong className="text-[var(--color-text)]">{minCount} payments</strong> in the window</label>
            <input type="range" min={2} max={10} step={1} value={minCount} onChange={e => setMinCount(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {bursts.length === 0 ? (
        <Empty icon={Zap} msg="No payment bursts match these settings." />
      ) : (
        <div className="space-y-3">
          {bursts.map((b, i) => (
            <div key={i} className={`${CARD} p-4`}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p className="text-sm font-semibold">{b.payee} · {b.rows.length} payments in {b.spanDays} day(s)</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-950/30 text-orange-400 border border-orange-800/40 font-semibold">{formatCurrency(Math.round(b.total))} total</span>
              </div>
              <div className="space-y-1">
                {b.rows.map(r => (
                  <div key={r.id} className="flex items-center justify-between text-xs py-1 border-b border-[var(--color-border)] last:border-0">
                    <span className="text-[var(--color-muted)]">{safeFormatDate(r.date)} · {r.description}</span>
                    <span className="tabular-nums text-red-400">{formatCurrency(Math.round(Math.abs(r.amount)))}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #14 Under-Limit Splitting / Structuring Detector ─────────────────────────────
function UnderLimitSplitting({ txns }: { txns: Txn[] }) {
  const [limit, setLimit] = useFeatureState<number>("sec-approval-limit", 100000);
  const [bandPct, setBandPct] = useState(10);

  const justUnder = useMemo(() => {
    const lo = limit * (1 - bandPct / 100);
    return outflows(txns)
      .filter(t => { const a = Math.abs(t.amount); return a >= lo && a < limit; })
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [txns, limit, bandPct]);

  // split pattern: a payee paid multiple just-under amounts close together that would breach the limit if combined
  const splits = useMemo(() => {
    const byPayee = new Map<string, Txn[]>();
    justUnder.forEach(t => { const k = t.counterparty.trim().toLowerCase() || "(blank)"; byPayee.set(k, [...(byPayee.get(k) ?? []), t]); });
    const result: { payee: string; rows: Txn[]; combined: number }[] = [];
    byPayee.forEach(rows => {
      if (rows.length < 2) return;
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const close = sorted.some((r, i) => i > 0 && daysBetween(r.date, sorted[i - 1].date) <= 7);
      if (close) result.push({ payee: rows[0].counterparty || "(blank)", rows: sorted, combined: rows.reduce((s, r) => s + Math.abs(r.amount), 0) });
    });
    return result.sort((a, b) => b.combined - a.combined);
  }, [justUnder]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Scissors size={14} className="text-[var(--color-primary)]" /> Under-Limit Splitting Detector</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Surfaces payments that sit just below your approval threshold - the signature of structuring, where a larger payment is split to dodge the second-approver check.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Approval limit (₹)</label>
            <input type="number" value={limit} onChange={e => setLimit(Math.max(0, Number(e.target.value)))} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Flag band: within <strong className="text-[var(--color-text)]">{bandPct}%</strong> below the limit</label>
            <input type="range" min={1} max={25} step={1} value={bandPct} onChange={e => setBandPct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {splits.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-4">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {splits.length} payee(s) received multiple just-under-limit payments within a week - possible deliberate splitting.</p>
        </div>
      )}

      {justUnder.length === 0 ? (
        <Empty icon={Scissors} msg="No payments fall in the just-under-limit band." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{justUnder.length} payment(s) just below {formatCurrency(limit)}</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Date", "Payee", "Amount", "% of limit", "Description"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {justUnder.map(t => (
                  <tr key={t.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 tabular-nums text-xs">{safeFormatDate(t.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{t.counterparty || "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(Math.abs(t.amount)))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400 text-xs">{limit ? Math.round((Math.abs(t.amount) / limit) * 100) : 0}%</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] max-w-[240px] truncate">{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #15 Dormant-Account Reactivation Flag ─────────────────────────────────────────
function DormantReactivation({ txns }: { txns: Txn[] }) {
  const [dormantDays, setDormantDays] = useState(180);

  const reactivated = useMemo(() => {
    const byParty = new Map<string, Txn[]>();
    txns.forEach(t => { const k = t.counterparty.trim().toLowerCase(); if (!k) return; byParty.set(k, [...(byParty.get(k) ?? []), t]); });
    const result: { party: string; gapDays: number; lastBefore: Txn; reactivation: Txn }[] = [];
    byParty.forEach(rows => {
      if (rows.length < 2) return;
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < sorted.length; i++) {
        const gap = daysBetween(sorted[i].date, sorted[i - 1].date);
        if (gap >= dormantDays) {
          result.push({ party: sorted[i].counterparty, gapDays: gap, lastBefore: sorted[i - 1], reactivation: sorted[i] });
        }
      }
    });
    return result.sort((a, b) => b.gapDays - a.gapDays);
  }, [txns, dormantDays]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Moon size={14} className="text-[var(--color-primary)]" /> Dormant-Account Reactivation</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Counterparties that went quiet for a long stretch and then suddenly transacted again. Long-idle accounts that reawaken are a known hijack and ghost-vendor signal - verify the party is still who you think before transacting.</p>
        <label className="text-xs text-[var(--color-muted)] block mb-1">Treat a gap of <strong className="text-[var(--color-text)]">{dormantDays} days</strong> or more as dormancy</label>
        <input type="range" min={60} max={540} step={30} value={dormantDays} onChange={e => setDormantDays(Number(e.target.value))} className="w-full max-w-md accent-[var(--color-primary)]" />
      </div>

      {reactivated.length === 0 ? (
        <Empty icon={Moon} msg="No dormant accounts reactivated within this threshold." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{reactivated.length} reactivation event(s)</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Counterparty", "Quiet since", "Reactivated", "Idle gap", "Amount"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {reactivated.map((r, i) => (
                  <tr key={i} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.party || "-"}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{safeFormatDate(r.lastBefore.date)}</td>
                    <td className="px-4 py-2.5 text-xs text-yellow-400">{safeFormatDate(r.reactivation.date)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400 text-xs">{r.gapDays} days</td>
                    <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.reactivation.amount < 0 ? "text-red-400" : "text-green-400"}`}>{formatCurrency(Math.round(Math.abs(r.reactivation.amount)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #16 Expense-Policy Violation Detector ─────────────────────────────────────────
type ExpPolicy = { perTxnCap: number; flagWeekend: boolean; keywords: string };
function ExpensePolicyFlags({ txns }: { txns: Txn[] }) {
  const [policy, setPolicy] = useFeatureState<ExpPolicy>("sec-expense-policy", { perTxnCap: 50000, flagWeekend: true, keywords: "alcohol, bar, gift, cash, entertainment" });

  const flags = useMemo(() => {
    const kws = policy.keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
    return outflows(txns)
      .filter(t => t.category === "expense")
      .map(t => {
        const reasons: string[] = [];
        const amt = Math.abs(t.amount);
        if (policy.perTxnCap > 0 && amt > policy.perTxnCap) reasons.push(`Over ${formatCurrency(policy.perTxnCap)} cap`);
        let dow = -1; try { dow = parseISO(t.date).getDay(); } catch { /* noop */ }
        if (policy.flagWeekend && (dow === 0 || dow === 6)) reasons.push("Weekend spend");
        const hay = `${t.description} ${t.counterparty}`.toLowerCase();
        const hit = kws.find(k => hay.includes(k));
        if (hit) reasons.push(`Restricted: "${hit}"`);
        return { t, reasons };
      })
      .filter(x => x.reasons.length > 0)
      .sort((a, b) => Math.abs(b.t.amount) - Math.abs(a.t.amount));
  }, [txns, policy]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> Expense-Policy Violation Detector</h2>
        <p className="text-xs text-[var(--color-muted)]">Checks expense transactions against your own policy - a per-transaction cap, weekend spend, and restricted keywords. Matches are suspects to review against the receipt, not automatic violations.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Per-transaction cap (₹)</label>
            <input type="number" value={policy.perTxnCap} onChange={e => setPolicy({ ...policy, perTxnCap: Math.max(0, Number(e.target.value)) })} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Restricted keywords (comma-separated)</label>
            <input value={policy.keywords} onChange={e => setPolicy({ ...policy, keywords: e.target.value })} className={INP} />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] py-2 cursor-pointer">
            <input type="checkbox" checked={policy.flagWeekend} onChange={e => setPolicy({ ...policy, flagWeekend: e.target.checked })} className="accent-[var(--color-primary)]" />
            Flag weekend-dated expenses
          </label>
        </div>
      </div>

      {flags.length === 0 ? (
        <Empty icon={Receipt} msg="No expense transactions breach this policy." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{flags.length} expense(s) to review</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Date", "Payee", "Amount", "Violations"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {flags.map(f => (
                  <tr key={f.t.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 tabular-nums text-xs">{safeFormatDate(f.t.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{f.t.counterparty || "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(Math.abs(f.t.amount)))}</td>
                    <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{f.reasons.map(r => <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-950/30 text-orange-400 border border-orange-800/40">{r}</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #17 Segregation-of-Duties Checker ─────────────────────────────────────────────
type SodMap = { id: string; payee: string; creator: string; approver: string };
function DutiesSeparation({ txns }: { txns: Txn[] }) {
  const [maps, setMaps] = useFeatureState<SodMap[]>("sec-sod-map", []);
  const [payee, setPayee] = useState("");
  const [creator, setCreator] = useState("");
  const [approver, setApprover] = useState("");

  const knownPayees = useMemo(
    () => [...new Set(outflows(txns).map(t => t.counterparty).filter(Boolean))].sort(),
    [txns],
  );

  const add = () => {
    if (!payee.trim() || !creator.trim() || !approver.trim()) { toast.error("Enter payee, creator and approver"); return; }
    setMaps([...maps, { id: crypto.randomUUID(), payee: payee.trim(), creator: creator.trim(), approver: approver.trim() }]);
    setPayee(""); setCreator(""); setApprover("");
    toast.success("Duty assignment recorded");
  };

  const conflicts = maps.filter(m => m.creator.trim().toLowerCase() === m.approver.trim().toLowerCase());

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Segregation-of-Duties Checker</h2>
        <p className="text-xs text-[var(--color-muted)]">Record who creates and who approves payments for each vendor. When the same person does both, no independent check exists - the classic gap that lets a single insider move money unchecked.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Vendor / payee</label>
            <input list="sec-sod-payees" value={payee} onChange={e => setPayee(e.target.value)} placeholder="Vendor" className={INP} />
            <datalist id="sec-sod-payees">{knownPayees.map(v => <option key={v} value={v} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Created by</label>
            <input value={creator} onChange={e => setCreator(e.target.value)} placeholder="e.g. Rohit" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Approved by</label>
            <input value={approver} onChange={e => setApprover(e.target.value)} placeholder="e.g. Priya" className={INP} />
          </div>
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">Add entry</button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-4">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {conflicts.length} vendor(s) where one person both creates and approves - assign a separate approver.</p>
        </div>
      )}

      {maps.length === 0 ? (
        <Empty icon={Users} msg="No duty assignments recorded yet." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Vendor", "Created by", "Approved by", "Status", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {maps.map(m => {
                  const conflict = m.creator.trim().toLowerCase() === m.approver.trim().toLowerCase();
                  return (
                    <tr key={m.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium text-xs">{m.payee}</td>
                      <td className="px-4 py-2.5 text-xs">{m.creator}</td>
                      <td className="px-4 py-2.5 text-xs">{m.approver}</td>
                      <td className="px-4 py-2.5">
                        {conflict
                          ? <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold"><AlertTriangle size={11} /> Same person</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={11} /> Separated</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setMaps(maps.filter(x => x.id !== m.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #18 Near-Duplicate Vendor Dedupe ──────────────────────────────────────────────
function VendorDedupe({ txns }: { txns: Txn[] }) {
  const pairs = useMemo(() => {
    const vendors = [...new Set(outflows(txns).map(t => t.counterparty.trim()).filter(Boolean))];
    const norm = (s: string) => s.toLowerCase().replace(/\b(pvt|ltd|llp|inc|co|company|limited|private|the|and|&)\b/g, "").replace(/[^a-z0-9]/g, "");
    // Levenshtein distance for close-but-not-identical names
    const lev = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      if (!m) return n; if (!n) return m;
      let prev = Array.from({ length: n + 1 }, (_, i) => i);
      for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
          cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
        }
        prev = cur;
      }
      return prev[n];
    };
    const result: { a: string; b: string; dist: number; reason: string }[] = [];
    for (let i = 0; i < vendors.length; i++) {
      for (let j = i + 1; j < vendors.length; j++) {
        const na = norm(vendors[i]), nb = norm(vendors[j]);
        if (!na || !nb) continue;
        if (na === nb) { result.push({ a: vendors[i], b: vendors[j], dist: 0, reason: "Identical after normalising" }); continue; }
        const d = lev(na, nb);
        const maxLen = Math.max(na.length, nb.length);
        if (maxLen >= 4 && d > 0 && d <= 2) result.push({ a: vendors[i], b: vendors[j], dist: d, reason: `${d} character(s) apart` });
      }
    }
    return result.sort((a, b) => a.dist - b.dist);
  }, [txns]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><GitMerge size={14} className="text-[var(--color-primary)]" /> Near-Duplicate Vendor Dedupe</h2>
        <p className="text-xs text-[var(--color-muted)]">Finds vendor names that are suspiciously similar - typos, extra spaces or a swapped suffix. Twin vendor records let the same payee be paid twice or enable split-payment and ghost-vendor padding.</p>
      </div>

      {pairs.length === 0 ? (
        <Empty icon={GitMerge} msg="No near-duplicate vendor names found." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{pairs.length} possible duplicate vendor pair(s)</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Vendor A", "Vendor B", "Why flagged"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {pairs.map((p, i) => (
                  <tr key={i} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium text-xs">{p.a}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{p.b}</td>
                    <td className="px-4 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-950/30 text-orange-400 border border-orange-800/40">{p.reason}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #19 Refund-Anomaly Flags ──────────────────────────────────────────────────────
function RefundAnomalies({ txns }: { txns: Txn[] }) {
  const flags = useMemo(() => {
    // refunds = inbound revenue reversals (negative-amount revenue) OR outbound payments whose description mentions refund
    const refundLike = txns.filter(t =>
      /\brefund|reversal|chargeback|return\b/i.test(t.description) ||
      (t.category === "revenue" && t.amount < 0),
    );
    // also count refunds per counterparty to flag unusually frequent refunders
    const countByParty = new Map<string, number>();
    refundLike.forEach(t => { const k = t.counterparty.trim().toLowerCase() || "(blank)"; countByParty.set(k, (countByParty.get(k) ?? 0) + 1); });
    return refundLike
      .map(t => {
        const reasons: string[] = [];
        const k = t.counterparty.trim().toLowerCase() || "(blank)";
        const cnt = countByParty.get(k) ?? 0;
        if (cnt >= 3) reasons.push(`${cnt} refunds to this party`);
        if (Math.abs(t.amount) >= 10000 && Math.abs(t.amount) % 10000 === 0) reasons.push("Round-number refund");
        if (t.amount < 0 && t.category === "revenue") reasons.push("Revenue reversal");
        if (reasons.length === 0) reasons.push("Refund / reversal entry");
        return { t, reasons };
      })
      .sort((a, b) => Math.abs(b.t.amount) - Math.abs(a.t.amount));
  }, [txns]);

  const total = flags.reduce((s, f) => s + Math.abs(f.t.amount), 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Undo2 size={14} className="text-[var(--color-primary)]" /> Refund-Anomaly Flags</h2>
        <p className="text-xs text-[var(--color-muted)]">Surfaces refunds, reversals and chargebacks in your ledger and highlights the abuse patterns - the same party refunded repeatedly, round-number refunds and revenue reversals - which can mask skimming or collusion.</p>
      </div>

      {flags.length === 0 ? (
        <Empty icon={Undo2} msg="No refund or reversal entries detected." />
      ) : (
        <>
          <div className="bg-yellow-950/20 border border-yellow-800/40 rounded-lg p-4">
            <p className="text-sm font-bold text-yellow-400 flex items-center gap-2"><AlertTriangle size={14} /> {flags.length} refund/reversal entr(ies) totalling {formatCurrency(Math.round(total))} - suspects, confirm against original transactions.</p>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Date", "Counterparty", "Amount", "Flags", "Description"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {flags.map(f => (
                    <tr key={f.t.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 tabular-nums text-xs">{safeFormatDate(f.t.date)}</td>
                      <td className="px-4 py-2.5 font-medium text-xs">{f.t.counterparty || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-orange-400 font-semibold">{formatCurrency(Math.round(Math.abs(f.t.amount)))}</td>
                      <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{f.reasons.map(r => <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-950/30 text-orange-400 border border-orange-800/40">{r}</span>)}</div></td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] max-w-[220px] truncate">{f.t.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <Note />
    </div>
  );
}

// ── #20 Recurring-Charge Sentinel ─────────────────────────────────────────────────
function RecurringChargeWatch({ txns }: { txns: Txn[] }) {
  const result = useMemo(() => {
    // group recurring outflows by payee; detect new recurring charges and amount creep
    const byPayee = new Map<string, Txn[]>();
    outflows(txns).filter(t => t.isRecurring).forEach(t => {
      const k = t.counterparty.trim().toLowerCase() || "(blank)";
      byPayee.set(k, [...(byPayee.get(k) ?? []), t]);
    });
    const today = new Date().toISOString().slice(0, 10);
    const rows: { payee: string; count: number; latest: number; first: number; changePct: number; firstDate: string; isNew: boolean }[] = [];
    byPayee.forEach(arr => {
      const sorted = [...arr].sort((a, b) => a.date.localeCompare(b.date));
      const first = Math.abs(sorted[0].amount);
      const latest = Math.abs(sorted[sorted.length - 1].amount);
      const changePct = first > 0 ? Math.round(((latest - first) / first) * 100) : 0;
      const isNew = daysBetween(sorted[0].date, today) <= 60;
      rows.push({ payee: sorted[0].counterparty || "(blank)", count: sorted.length, latest, first, changePct, firstDate: sorted[0].date, isNew });
    });
    return rows.sort((a, b) => b.latest - a.latest);
  }, [txns]);

  const monthlyTotal = result.reduce((s, r) => s + r.latest, 0);
  const newCount = result.filter(r => r.isNew).length;
  const creepCount = result.filter(r => r.changePct >= 15).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><RefreshCw size={14} className="text-[var(--color-primary)]" /> Recurring-Charge Sentinel</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Tracks your recurring outflows - subscriptions and auto-mandates. New recurring debits and quiet price creep are how subscription leakage and unauthorised mandates drain cash unnoticed.</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Recurring payees", value: String(result.length), color: "text-[var(--color-text)]" },
            { label: "New (≤60d)", value: String(newCount), color: newCount > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Price creep ≥15%", value: String(creepCount), color: creepCount > 0 ? "text-orange-400" : "text-green-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
        {result.length > 0 && <p className="text-[10px] text-[var(--color-muted)] mt-2">Latest recurring outflow run-rate ≈ {formatCurrency(Math.round(monthlyTotal))}.</p>}
      </div>

      {result.length === 0 ? (
        <Empty icon={RefreshCw} msg="No recurring outflows in the ledger yet." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Payee", "Started", "Charges", "Latest", "Change", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.map((r, i) => (
                  <tr key={i} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.payee}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{safeFormatDate(r.firstDate)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{r.count}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(r.latest))}</td>
                    <td className={`px-4 py-2.5 tabular-nums text-xs ${r.changePct >= 15 ? "text-orange-400 font-semibold" : "text-[var(--color-muted)]"}`}>{r.changePct > 0 ? "+" : ""}{r.changePct}%</td>
                    <td className="px-4 py-2.5">{r.isNew && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-950/30 text-yellow-400 border border-yellow-800/40">New</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #21 GST Fake-ITC Risk Flags ───────────────────────────────────────────────────
// A valid GSTIN is 15 chars: 2-digit state code + 10-char PAN + 1 entity + 'Z' + 1 checksum.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
function FakeItcRisk({ txns }: { txns: Txn[] }) {
  type Rec = { id: string; vendor: string; gstin: string };
  const [recs, setRecs] = useFeatureState<Rec[]>("sec-vendor-gstins", []);
  const [vendor, setVendor] = useState("");
  const [gstin, setGstin] = useState("");

  const knownVendors = useMemo(
    () => [...new Set(outflows(txns).map(t => t.counterparty).filter(Boolean))].sort(),
    [txns],
  );

  const add = () => {
    const g = gstin.trim().toUpperCase();
    if (!vendor.trim() || !g) { toast.error("Enter a vendor and a GSTIN"); return; }
    setRecs([...recs, { id: crypto.randomUUID(), vendor: vendor.trim(), gstin: g }]);
    setVendor(""); setGstin("");
    toast.success("Supplier GSTIN recorded");
  };

  const analysed = useMemo(() => {
    const byGstin = new Map<string, Set<string>>();
    recs.forEach(r => {
      const set = byGstin.get(r.gstin) ?? new Set<string>();
      set.add(r.vendor.trim().toLowerCase());
      byGstin.set(r.gstin, set);
    });
    return recs.map(r => {
      const reasons: string[] = [];
      if (!GSTIN_RE.test(r.gstin)) reasons.push("Malformed GSTIN");
      const stateCode = parseInt(r.gstin.slice(0, 2), 10);
      if (GSTIN_RE.test(r.gstin) && (isNaN(stateCode) || stateCode < 1 || stateCode > 38)) reasons.push("Invalid state code");
      if ((byGstin.get(r.gstin)?.size ?? 0) > 1) reasons.push("Same GSTIN, multiple vendors");
      return { rec: r, reasons };
    }).sort((a, b) => b.reasons.length - a.reasons.length);
  }, [recs]);

  const risky = analysed.filter(a => a.reasons.length > 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileSearch size={14} className="text-[var(--color-primary)]" /> GST Fake-ITC Risk Flags</h2>
        <p className="text-xs text-[var(--color-muted)]">Record each supplier's GSTIN, then screen for the structural tells of bogus-firm ITC fraud: malformed GSTINs, impossible state codes, and one GSTIN reused across several "independent" vendors. These are leads to verify on the GST portal - never proof on their own.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Supplier</label>
            <input list="sec-itc-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Supplier name" className={INP} />
            <datalist id="sec-itc-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GSTIN</label>
            <input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="27AAPFU0939F1ZV" className={INP} />
          </div>
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">Add supplier</button>
        </div>
      </div>

      {risky.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-4">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {risky.length} supplier GSTIN(s) carry risk markers - verify validity and 2B match before claiming ITC.</p>
        </div>
      )}

      {recs.length === 0 ? (
        <Empty icon={FileSearch} msg="No supplier GSTINs recorded yet. Add them to screen for fake-ITC risk." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Supplier", "GSTIN", "Risk markers", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {analysed.map(a => (
                  <tr key={a.rec.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium text-xs">{a.rec.vendor}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{a.rec.gstin}</td>
                    <td className="px-4 py-2.5">
                      {a.reasons.length === 0
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={11} /> Looks valid</span>
                        : <div className="flex flex-wrap gap-1">{a.reasons.map(r => <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-950/30 text-orange-400 border border-orange-800/40">{r}</span>)}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setRecs(recs.filter(x => x.id !== a.rec.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #22 IP / Device Allowlist Register ────────────────────────────────────────────
function IpAllowlistRegister() {
  type Entry = { id: string; label: string; kind: "ip" | "device"; value: string; addedAt: string; trusted: boolean };
  const [entries, setEntries] = useFeatureState<Entry[]>("sec-ip-allowlist", []);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"ip" | "device">("ip");
  const [value, setValue] = useState("");

  const IPV4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  const add = () => {
    if (!label.trim() || !value.trim()) { toast.error("Enter a label and a value"); return; }
    if (kind === "ip" && !IPV4.test(value.trim())) { toast.error("Enter a valid IPv4 address or CIDR (e.g. 203.0.113.5)"); return; }
    setEntries([...entries, { id: crypto.randomUUID(), label: label.trim(), kind, value: value.trim(), addedAt: new Date().toISOString().slice(0, 10), trusted: true }]);
    setLabel(""); setValue("");
    toast.success(`${kind === "ip" ? "IP" : "Device"} added to allowlist`);
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Network size={14} className="text-[var(--color-primary)]" /> IP / Device Allowlist Register</h2>
        <p className="text-xs text-[var(--color-muted)]">Maintain the office IPs and known devices that should ever touch banking and payment functions. A short, deliberate allowlist shrinks the attack surface - anything outside it is worth a step-up check before it moves money.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Head office, Priya's laptop" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={kind} onChange={e => setKind(e.target.value as "ip" | "device")} className={INP}>
              <option value="ip">IP / CIDR</option>
              <option value="device">Device</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">{kind === "ip" ? "IPv4 / CIDR" : "Device ID / name"}</label>
            <input value={value} onChange={e => setValue(e.target.value)} placeholder={kind === "ip" ? "203.0.113.0/24" : "MacBook-Pro-Finance"} className={INP} />
          </div>
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">Add to allowlist</button>
        </div>
      </div>

      {entries.length === 0 ? (
        <Empty icon={Network} msg="No allowlisted IPs or devices yet." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Label", "Type", "Value", "Added", "Status", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium text-xs">{e.label}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{e.kind === "ip" ? "IP / CIDR" : "Device"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{e.value}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{safeFormatDate(e.addedAt)}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => setEntries(entries.map(x => x.id === e.id ? { ...x, trusted: !x.trusted } : x))}
                        className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${e.trusted ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                        {e.trusted ? "Trusted" : "Revoked"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setEntries(entries.filter(x => x.id !== e.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #23 Data-Export Audit Log ──────────────────────────────────────────────────────
function DataExportAudit() {
  type Export = { id: string; at: string; who: string; what: string; rows: number; reason: string; containsPii: boolean };
  const [logs, setLogs] = useFeatureState<Export[]>("sec-export-audit", []);
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("Transactions");
  const [rows, setRows] = useState("");
  const [reason, setReason] = useState("");
  const [pii, setPii] = useState(false);

  const add = () => {
    if (!who.trim() || !reason.trim()) { toast.error("Enter who exported and why"); return; }
    setLogs([{ id: crypto.randomUUID(), at: new Date().toISOString(), who: who.trim(), what, rows: Math.max(0, parseInt(rows, 10) || 0), reason: reason.trim(), containsPii: pii }, ...logs]);
    setWho(""); setRows(""); setReason(""); setPii(false);
    toast.success("Export logged");
  };

  const today = new Date().toISOString().slice(0, 10);
  const piiCount = logs.filter(l => l.containsPii).length;
  const last30 = logs.filter(l => daysBetween(l.at.slice(0, 10), today) <= 30).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Download size={14} className="text-[var(--color-primary)]" /> Data-Export Audit Log</h2>
        <p className="text-xs text-[var(--color-muted)]">Record every bulk export of financial or customer data - who pulled it, what, and why. A standing export log is the cheapest deterrent against insider data exfiltration and the evidence trail a DPDP audit expects.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Exported by</label>
            <input value={who} onChange={e => setWho(e.target.value)} placeholder="e.g. Rohit" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Dataset</label>
            <select value={what} onChange={e => setWhat(e.target.value)} className={INP}>
              {["Transactions", "Invoices", "Customers", "Vendors", "Payroll", "Full backup"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rows</label>
            <input value={rows} onChange={e => setRows(e.target.value)} placeholder="e.g. 1200" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reason</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. CA audit pack" className={INP} />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] cursor-pointer">
              <input type="checkbox" checked={pii} onChange={e => setPii(e.target.checked)} className="accent-[var(--color-primary)]" /> Has PII
            </label>
            <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">Log</button>
          </div>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Exports logged", value: String(logs.length), color: "text-[var(--color-text)]" },
            { label: "Last 30 days", value: String(last30), color: last30 > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Containing PII", value: String(piiCount), color: piiCount > 0 ? "text-orange-400" : "text-green-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {logs.length === 0 ? (
        <Empty icon={Download} msg="No exports logged yet." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["When", "By", "Dataset", "Rows", "Reason", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{safeFormatDate(l.at.slice(0, 10))}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{l.who}</td>
                    <td className="px-4 py-2.5 text-xs">{l.what}{l.containsPii && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-orange-950/30 text-orange-400 border border-orange-800/40">PII</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{l.rows || "-"}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] max-w-[220px] truncate">{l.reason}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setLogs(logs.filter(x => x.id !== l.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #24 API-Key / Credential Rotation Reminder ─────────────────────────────────────
function KeyRotationReminder() {
  type Cred = { id: string; name: string; lastRotated: string; intervalDays: number };
  const [creds, setCreds] = useFeatureState<Cred[]>("sec-key-rotation", []);
  const [name, setName] = useState("");
  const [lastRotated, setLastRotated] = useState(new Date().toISOString().slice(0, 10));
  const [intervalDays, setIntervalDays] = useState(90);

  const add = () => {
    if (!name.trim()) { toast.error("Name the credential"); return; }
    setCreds([...creds, { id: crypto.randomUUID(), name: name.trim(), lastRotated, intervalDays }]);
    setName("");
    toast.success("Credential added to rotation tracker");
  };

  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => creds.map(c => {
    const age = daysBetween(c.lastRotated, today);
    const dueIn = c.intervalDays - age;
    const state: "overdue" | "soon" | "ok" = dueIn < 0 ? "overdue" : dueIn <= 14 ? "soon" : "ok";
    return { c, age, dueIn, state };
  }).sort((a, b) => a.dueIn - b.dueIn), [creds, today]);

  const overdue = rows.filter(r => r.state === "overdue").length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><KeyRound size={14} className="text-[var(--color-primary)]" /> API-Key / Credential Rotation</h2>
        <p className="text-xs text-[var(--color-muted)]">Track every API key, bank token and shared password against a rotation schedule. Stale, never-rotated credentials are a quiet liability - this tracker tells you what is overdue before an attacker does.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Credential</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Razorpay API key" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Last rotated</label>
            <input type="date" value={lastRotated} max={today} onChange={e => setLastRotated(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rotate every (days)</label>
            <input type="number" value={intervalDays} onChange={e => setIntervalDays(Math.max(1, Number(e.target.value)))} className={INP} />
          </div>
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">Track</button>
        </div>
      </div>

      {overdue > 0 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-4">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {overdue} credential(s) overdue for rotation - rotate them now and revoke the old values.</p>
        </div>
      )}

      {creds.length === 0 ? (
        <Empty icon={KeyRound} msg="No credentials tracked yet. Add your keys and tokens to schedule rotation." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Credential", "Last rotated", "Age", "Due", "Status", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.c.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium text-xs">{r.c.name}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{safeFormatDate(r.c.lastRotated)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{r.age}d</td>
                    <td className={`px-4 py-2.5 tabular-nums text-xs ${r.state === "overdue" ? "text-red-400 font-semibold" : r.state === "soon" ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>{r.dueIn < 0 ? `${-r.dueIn}d overdue` : `in ${r.dueIn}d`}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${r.state === "overdue" ? "bg-red-950/30 text-red-400 border-red-800/40" : r.state === "soon" ? "bg-yellow-950/30 text-yellow-400 border-yellow-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{r.state === "overdue" ? "Overdue" : r.state === "soon" ? "Due soon" : "OK"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-2">
                      <button onClick={() => setCreds(creds.map(x => x.id === r.c.id ? { ...x, lastRotated: today } : x))} className="text-[10px] text-[var(--color-primary)] hover:underline">Mark rotated</button>
                      <button onClick={() => setCreds(creds.filter(x => x.id !== r.c.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── #25 Cash Transaction Spike Monitor ─────────────────────────────────────────────
function CashSpikeMonitor({ txns }: { txns: Txn[] }) {
  const [threshold, setThreshold] = useFeatureState<number>("sec-cash-threshold", 200000);

  const result = useMemo(() => {
    const cashRe = /\bcash\b|atm|withdrawal|deposit/i;
    const cash = txns.filter(t => cashRe.test(t.description) || cashRe.test(t.category));
    const byMonth = new Map<string, { total: number; count: number }>();
    cash.forEach(t => {
      const m = t.date.slice(0, 7);
      const cur = byMonth.get(m) ?? { total: 0, count: 0 };
      cur.total += Math.abs(t.amount); cur.count += 1;
      byMonth.set(m, cur);
    });
    const months = [...byMonth.entries()].map(([m, v]) => ({ month: m, ...v })).sort((a, b) => a.month.localeCompare(b.month));
    const vals = months.map(m => m.total);
    const mean = vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : 0;
    const spikeMonths = months.filter(m => mean > 0 && m.total > mean * 1.5);
    const bigSingles = cash.filter(t => Math.abs(t.amount) >= threshold).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return { months, mean, spikeMonths, bigSingles, totalCash: vals.reduce((s, n) => s + n, 0) };
  }, [txns, threshold]);

  const maxMonth = Math.max(1, ...result.months.map(m => m.total));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Banknote size={14} className="text-[var(--color-primary)]" /> Cash Transaction Spike Monitor</h2>
        <p className="text-xs text-[var(--color-muted)]">Cash-heavy months and large single cash movements draw AML scrutiny and mask skimming. This tracks cash entries by month, flags months running 50%+ above your average, and lists single cash transactions above your reporting threshold.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Large-cash threshold (₹)</label>
          <input type="number" value={threshold} onChange={e => setThreshold(Math.max(0, Number(e.target.value)))} className={INP} />
        </div>
      </div>

      {result.months.length === 0 ? (
        <Empty icon={Banknote} msg="No cash-tagged transactions found in the ledger." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total cash moved", value: formatCurrency(Math.round(result.totalCash)), color: "text-[var(--color-text)]" },
              { label: "Avg / month", value: formatCurrency(Math.round(result.mean)), color: "text-[var(--color-text)]" },
              { label: "Spike months", value: String(result.spikeMonths.length), color: result.spikeMonths.length > 0 ? "text-orange-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className={`${CARD} p-5`}>
            <p className="text-sm font-semibold mb-3">Cash movement by month</p>
            <div className="space-y-2">
              {result.months.map(m => {
                const spike = result.mean > 0 && m.total > result.mean * 1.5;
                return (
                  <div key={m.month} className="flex items-center gap-3 text-xs">
                    <span className="w-16 tabular-nums text-[var(--color-muted)]">{m.month}</span>
                    <div className="flex-1 h-3 bg-[var(--color-bg)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(m.total / maxMonth) * 100}%`, background: spike ? "#eab308" : "var(--color-primary)" }} />
                    </div>
                    <span className={`w-28 text-right tabular-nums ${spike ? "text-yellow-400 font-semibold" : "text-[var(--color-muted)]"}`}>{formatCurrency(Math.round(m.total))}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {result.bigSingles.length > 0 && (
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{result.bigSingles.length} single cash transaction(s) ≥ {formatCurrency(threshold)}</p></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[var(--color-border)]"><tr>{["Date", "Counterparty", "Amount", "Description"].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {result.bigSingles.map(t => (
                      <tr key={t.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 tabular-nums text-xs">{safeFormatDate(t.date)}</td>
                        <td className="px-4 py-2.5 font-medium text-xs">{t.counterparty || "-"}</td>
                        <td className="px-4 py-2.5 tabular-nums text-orange-400 font-semibold">{formatCurrency(Math.round(Math.abs(t.amount)))}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] max-w-[260px] truncate">{t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      <Note />
    </div>
  );
}

// ── #26 Sensitive / Privileged-Action Log ──────────────────────────────────────────
function SensitiveActionLog() {
  type Action = { id: string; at: string; actor: string; action: string; detail: string };
  const ACTIONS = ["Changed approval limit", "Edited vendor bank details", "Granted access", "Revoked access", "Rotated key / password", "Exported data", "Deleted records", "Other"] as const;
  const [logs, setLogs] = useFeatureState<Action[]>("sec-action-log", []);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState<string>(ACTIONS[0]);
  const [detail, setDetail] = useState("");

  const add = () => {
    if (!actor.trim()) { toast.error("Enter who performed the action"); return; }
    setLogs([{ id: crypto.randomUUID(), at: new Date().toISOString(), actor: actor.trim(), action, detail: detail.trim() }, ...logs]);
    setActor(""); setDetail("");
    toast.success("Sensitive action logged");
  };

  const today = new Date().toISOString().slice(0, 10);
  const last7 = logs.filter(l => daysBetween(l.at.slice(0, 10), today) <= 7).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ScrollText size={14} className="text-[var(--color-primary)]" /> Sensitive-Action Log</h2>
        <p className="text-xs text-[var(--color-muted)]">An append-style record of the privileged actions that move money or change controls - limit changes, bank-detail edits, access grants, key rotations. Logging them as they happen makes privilege abuse visible and gives auditors a clean trail.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Performed by</label>
            <input value={actor} onChange={e => setActor(e.target.value)} placeholder="e.g. Owner" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Action</label>
            <select value={action} onChange={e => setAction(e.target.value)} className={INP}>
              {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Detail</label>
            <input value={detail} onChange={e => setDetail(e.target.value)} placeholder="e.g. raised to ₹2,00,000" className={INP} />
          </div>
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">Log action</button>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)]"><strong className="text-[var(--color-text)]">{logs.length}</strong> privileged action(s) on record · <strong className="text-[var(--color-text)]">{last7}</strong> in the last 7 days.</p>
        </div>
      )}

      {logs.length === 0 ? (
        <Empty icon={ScrollText} msg="No sensitive actions logged yet." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["When", "By", "Action", "Detail", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{safeFormatDate(l.at.slice(0, 10))}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{l.actor}</td>
                    <td className="px-4 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent)] text-[var(--color-text)] border border-[var(--color-border)]">{l.action}</span></td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] max-w-[240px] truncate">{l.detail || "-"}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setLogs(logs.filter(x => x.id !== l.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── Round-Amount Payment Flags ───────────────────────────────────────────────────
function RoundAmountFlags({ txns }: { txns: Txn[] }) {
  const [step, setStep] = useState(10000);
  const [minAmt, setMinAmt] = useState(25000);
  const out = useMemo(() => outflows(txns), [txns]);

  const flagged = useMemo(() => {
    return out
      .filter(t => {
        const a = Math.round(Math.abs(t.amount));
        return a >= minAmt && a % step === 0;
      })
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [out, step, minAmt]);

  const total = flagged.reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CircleDollarSign size={14} className="text-[var(--color-primary)]" /> Round-Amount Payment Flags</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Genuine invoices rarely land on perfectly round figures. Large payments that are exact multiples of a round step are worth a second look - they correlate with estimates, kickbacks and fabricated bills.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Round step: multiples of <strong className="text-[var(--color-text)]">{formatCurrency(step)}</strong></label>
            <input type="range" min={1000} max={50000} step={1000} value={step} onChange={e => setStep(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Only payments above <strong className="text-[var(--color-text)]">{formatCurrency(minAmt)}</strong></label>
            <input type="range" min={5000} max={500000} step={5000} value={minAmt} onChange={e => setMinAmt(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {flagged.length === 0 ? (
        <Empty icon={CircleDollarSign} msg="No round-amount payments match these settings." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <p className="text-sm font-semibold">{flagged.length} round-amount payment(s) - suspects, confirm</p>
            <p className="text-xs text-[var(--color-muted)] tabular-nums">{formatCurrency(Math.round(total))} total</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Date", "Payee", "Amount", "Description"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {flagged.map(t => (
                  <tr key={t.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 tabular-nums text-xs">{safeFormatDate(t.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{t.counterparty || "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400 font-semibold">{formatCurrency(Math.round(Math.abs(t.amount)))}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] max-w-[260px] truncate">{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── Payroll-vs-Vendor Bank-Account Match ──────────────────────────────────────────
type StaffBank = { id: string; name: string; account: string };
function PayrollVendorBankMatch({ txns }: { txns: Txn[] }) {
  const [staff, setStaff] = useFeatureState<StaffBank[]>("sec-staff-banks", []);
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");

  const knownVendors = useMemo(
    () => [...new Set(txns.filter(t => t.amount < 0).map(t => t.counterparty).filter(Boolean))].sort(),
    [txns],
  );

  const add = () => {
    if (!name.trim() || !account.trim()) { toast.error("Enter an employee name and account number"); return; }
    const acct = account.trim();
    const clash = staff.find(s => s.account === acct);
    if (clash) { toast.warning(`That account is already on file for ${clash.name}`); return; }
    setStaff([...staff, { id: crypto.randomUUID(), name: name.trim(), account: acct }]);
    setName(""); setAccount("");
    toast.success("Employee bank account recorded");
  };

  const collisions = useMemo(() => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const result: { staff: StaffBank; vendor: string }[] = [];
    staff.forEach(s => {
      const sn = norm(s.name);
      if (!sn) return;
      knownVendors.forEach(v => {
        const vn = norm(v);
        if (vn && (vn === sn || vn.includes(sn) || sn.includes(vn))) result.push({ staff: s, vendor: v });
      });
    });
    return result;
  }, [staff, knownVendors]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Fingerprint size={14} className="text-[var(--color-primary)]" /> Payroll-vs-Vendor Bank Match</h2>
        <p className="text-xs text-[var(--color-muted)]">Record your employees' salary bank accounts here. The tool then checks whether any vendor you pay shares an employee's name - a strong sign of a ghost vendor set up to divert funds to staff.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Employee name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rahul Sharma" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Salary account number</label>
            <input value={account} onChange={e => setAccount(e.target.value)} placeholder="XXXXXXXX1234" className={INP} />
          </div>
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">Add employee</button>
        </div>
      </div>

      {collisions.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-4">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> {collisions.length} vendor(s) share an employee name - suspects, confirm these are not self-payments.</p>
          <div className="mt-2 space-y-1">
            {collisions.map((c, i) => (
              <p key={i} className="text-xs text-[var(--color-muted)]">Vendor <span className="text-[var(--color-text)] font-medium">{c.vendor}</span> matches employee <span className="text-[var(--color-text)] font-medium">{c.staff.name}</span></p>
            ))}
          </div>
        </div>
      )}

      {staff.length === 0 ? (
        <Empty icon={Fingerprint} msg="No employee accounts on file yet. Add them to detect ghost-vendor overlaps." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Employee", "Account", "Status", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {staff.map(s => {
                  const flagged = collisions.some(c => c.staff.id === s.id);
                  return (
                    <tr key={s.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium text-xs">{s.name}</td>
                      <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{s.account}</td>
                      <td className="px-4 py-2.5">
                        {flagged
                          ? <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold"><AlertTriangle size={11} /> Name overlap</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={11} /> Clear</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setStaff(staff.filter(x => x.id !== s.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── Payment to New Account Over Threshold ─────────────────────────────────────────
function NewAccountOverLimit({ txns }: { txns: Txn[] }) {
  const [threshold, setThreshold] = useState(50000);
  const [firstDays, setFirstDays] = useState(14);

  const flagged = useMemo(() => {
    const firstSeen = new Map<string, string>();
    [...txns].filter(t => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
      const key = t.counterparty.trim().toLowerCase() || "(blank)";
      if (!firstSeen.has(key)) firstSeen.set(key, t.date);
    });
    return outflows(txns)
      .filter(t => {
        const key = t.counterparty.trim().toLowerCase() || "(blank)";
        const first = firstSeen.get(key);
        if (!first) return false;
        return Math.abs(t.amount) >= threshold && daysBetween(t.date, first) <= firstDays;
      })
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [txns, threshold, firstDays]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ShieldQuestion size={14} className="text-[var(--color-primary)]" /> Large Payment to a Brand-New Account</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">A big payment to a counterparty you have only just started paying is the highest-risk combination - exactly how invoice-redirection and advance-fee scams play out. These deserve an out-of-band check before release.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount over <strong className="text-[var(--color-text)]">{formatCurrency(threshold)}</strong></label>
            <input type="range" min={10000} max={500000} step={10000} value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Within <strong className="text-[var(--color-text)]">{firstDays} days</strong> of first-ever payment</label>
            <input type="range" min={1} max={60} step={1} value={firstDays} onChange={e => setFirstDays(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {flagged.length === 0 ? (
        <Empty icon={ShieldQuestion} msg="No large early-stage payments match these settings." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{flagged.length} high-risk payment(s) - suspects, confirm</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Date", "New payee", "Amount", "Description"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {flagged.map(t => (
                  <tr key={t.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 tabular-nums text-xs">{safeFormatDate(t.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{t.counterparty || "(blank)"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(Math.abs(t.amount)))}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] max-w-[260px] truncate">{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Note />
    </div>
  );
}

// ── Control Self-Assessment ───────────────────────────────────────────────────────
type CsaAnswer = "yes" | "partial" | "no";
type CsaState = Record<string, CsaAnswer>;
const CSA_ITEMS: { id: string; q: string }[] = [
  { id: "dual", q: "Payments above a set limit need a second approver." },
  { id: "bankverify", q: "Vendor bank-detail changes are verified by phone before paying." },
  { id: "recon", q: "Bank statements are reconciled against the ledger at least monthly." },
  { id: "access", q: "User access is reviewed and leavers are removed quarterly." },
  { id: "segregation", q: "The person who raises a payment cannot also approve it." },
  { id: "backups", q: "Financial data is backed up and a restore has been tested." },
  { id: "mfa", q: "Banking and accounting logins are protected with 2-factor auth." },
  { id: "petty", q: "Petty cash and reimbursements require supporting receipts." },
];
function ControlSelfAssessment() {
  const [answers, setAnswers] = useFeatureState<CsaState>("sec-control-csa", {});

  const set = (id: string, val: CsaAnswer) => setAnswers({ ...answers, [id]: val });

  const score = useMemo(() => {
    let pts = 0;
    CSA_ITEMS.forEach(it => {
      const a = answers[it.id];
      pts += a === "yes" ? 1 : a === "partial" ? 0.5 : 0;
    });
    return Math.round((pts / CSA_ITEMS.length) * 100);
  }, [answers]);

  const gaps = CSA_ITEMS.filter(it => answers[it.id] !== "yes");
  const band = score >= 80 ? "Strong" : score >= 50 ? "Developing" : "Weak";
  const color = band === "Strong" ? "text-green-400" : band === "Developing" ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ClipboardCheck size={14} className="text-[var(--color-primary)]" /> Control Self-Assessment</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">A quick honesty check on the basic financial controls every SMB should have. Answer each one - the maturity score and gap list update live and stay on this device.</p>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <p className={`text-5xl font-bold tabular-nums ${color}`}>{score}</p>
            <p className="text-xs text-[var(--color-muted)]">/ 100 control maturity</p>
          </div>
          <span className={`text-sm font-bold px-3 py-1 rounded-full border ${band === "Strong" ? "bg-green-950/30 text-green-400 border-green-800/40" : band === "Developing" ? "bg-yellow-950/30 text-yellow-400 border-yellow-800/40" : "bg-red-950/30 text-red-400 border-red-800/40"}`}>{band}</span>
        </div>
        <div className="w-full h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden mt-4">
          <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: band === "Strong" ? "#22c55e" : band === "Developing" ? "#eab308" : "#ef4444" }} />
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-2`}>
        {CSA_ITEMS.map(it => (
          <div key={it.id} className="flex items-center justify-between gap-3 text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
            <span className="text-xs">{it.q}</span>
            <div className="flex gap-1 shrink-0">
              {(["yes", "partial", "no"] as CsaAnswer[]).map(opt => (
                <button key={opt} onClick={() => set(it.id, opt)}
                  className={`text-[10px] px-2 py-1 rounded-full border font-medium capitalize ${answers[it.id] === opt
                    ? opt === "yes" ? "bg-green-900/30 text-green-400 border-green-800/40" : opt === "partial" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-red-900/30 text-red-400 border-red-800/40"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {gaps.length > 0 && (
        <div className="bg-yellow-950/20 border border-yellow-800/40 rounded-lg p-4">
          <p className="text-sm font-bold text-yellow-400 flex items-center gap-2 mb-2"><AlertTriangle size={14} /> {gaps.length} control(s) not fully in place</p>
          <ul className="space-y-1">
            {gaps.map(g => <li key={g.id} className="text-xs text-[var(--color-muted)]">• {g.q}</li>)}
          </ul>
        </div>
      )}
      <Note />
    </div>
  );
}
