import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  Landmark, Wallet, GitCompareArrows, Hash, Receipt, Route,
  FileCheck2, ShieldAlert, AlertTriangle, Plus, CheckCircle2, ArrowRight,
  Banknote, Coins, Clock,
  ShieldCheck, Repeat, FileText, Percent, ListChecks, UserCheck,
  Split, Gauge, PiggyBank, CalendarClock,
  ClipboardCheck, Globe, CopyCheck, ArrowLeftRight, Award, FolderCheck, Activity,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays, parseISO } from "date-fns";

// ── shared styles (mirrors TaxPage/DebtPage input + card classes) ────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type Tab =
  | "overview" | "balances" | "reconcile" | "cash-position" | "sweep"
  | "virtual-accounts" | "fees" | "rail" | "cheques" | "charge-recovery" | "idle-alert"
  | "positive-pay" | "mandates" | "guarantees" | "od-interest" | "statement-import"
  | "beneficiaries" | "transfer-planner" | "min-balance" | "savings-interest" | "payment-date"
  | "balance-confirmation" | "forex-tracker" | "duplicate-payment" | "netting"
  | "interest-cert" | "doc-checklist" | "runway";

export default function BankingPage() {
  const { store } = useApp();
  const accounts = store.bankAccounts;
  const [tab, setTab] = useState<Tab>("overview");

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts]);
  const connected = accounts.filter(a => a.status === "connected").length;
  const issues = accounts.filter(a => a.status === "error").length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Landmark size={18} className="text-[var(--color-primary)]" /> Banking &amp; Cash
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Every rupee across every bank — balances, reconciliation, rail choice, fees and idle-cash, India-first (NEFT/RTGS/IMPS/UPI).
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", "Overview", Landmark],
            ["balances", "Multi-Bank Balances", Wallet],
            ["reconcile", "Reconciliation", GitCompareArrows],
            ["cash-position", "Daily Cash Position", Banknote],
            ["sweep", "Sweep Planner", Coins],
            ["virtual-accounts", "Virtual Accounts", Hash],
            ["fees", "Bank-Fee Analyzer", Receipt],
            ["rail", "Payment Rail", Route],
            ["cheques", "Cheque Register", FileCheck2],
            ["charge-recovery", "Charge Recovery", ShieldAlert],
            ["idle-alert", "Idle-Balance Alert", Clock],
            ["positive-pay", "Positive Pay", ShieldCheck],
            ["mandates", "NACH Mandates", Repeat],
            ["guarantees", "BG / LC Limits", FileText],
            ["od-interest", "OD/CC Interest", Percent],
            ["statement-import", "Statement Import", ListChecks],
            ["beneficiaries", "Beneficiaries", UserCheck],
            ["transfer-planner", "Transfer Planner", Split],
            ["min-balance", "Min-Balance Check", Gauge],
            ["savings-interest", "Savings Interest", PiggyBank],
            ["payment-date", "Payment Date", CalendarClock],
            ["balance-confirmation", "Balance Confirmation", ClipboardCheck],
            ["forex-tracker", "Forex Spread", Globe],
            ["duplicate-payment", "Duplicate Payments", CopyCheck],
            ["netting", "Counterparty Netting", ArrowLeftRight],
            ["interest-cert", "Interest Certificates", Award],
            ["doc-checklist", "A/C Opening Docs", FolderCheck],
            ["runway", "Cash Runway", Activity],
          ] as const).map(([id, label, Icon]) => (
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
              { label: "Total Cash (all banks)", value: formatCurrency(totalBalance), color: "text-[var(--color-text)]", sub: `${accounts.length} account(s)` },
              { label: "Connected Feeds", value: `${connected}/${accounts.length}`, color: connected === accounts.length ? "text-green-400" : "text-yellow-400", sub: "Live balance feeds" },
              { label: "Feed Issues", value: `${issues}`, color: issues > 0 ? "text-red-400" : "text-green-400", sub: issues > 0 ? "Re-consent needed" : "All healthy" },
              { label: "Largest Balance", value: accounts.length ? formatAmount(Math.max(...accounts.map(a => a.balance))) : "—", color: "text-blue-400", sub: "Concentration check" },
            ].map(c => (
              <div key={c.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-1">{c.sub}</p>
              </div>
            ))}
          </div>

          {accounts.length === 0 ? (
            <div className={`${CARD} border-dashed p-10 text-center`}>
              <Wallet size={24} className="mx-auto text-[var(--color-muted)] mb-3" />
              <p className="text-sm font-medium mb-1">No bank accounts linked yet</p>
              <p className="text-xs text-[var(--color-muted)]">Connect or import accounts from the Data module — balances and reconciliation populate automatically.</p>
            </div>
          ) : (
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-[var(--color-border)]">
                <p className="text-sm font-semibold">Accounts at a glance</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[var(--color-border)]">
                    <tr>{["Account", "Provider", "Balance", "% of total", "Status", "Last sync"].map(h =>
                      <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {accounts.map(a => {
                      const pct = totalBalance > 0 ? Math.round((a.balance / totalBalance) * 100) : 0;
                      return (
                        <tr key={a.id} className="hover:bg-white/2">
                          <td className="px-5 py-3 font-medium">{a.name}</td>
                          <td className="px-5 py-3 text-[var(--color-muted)] capitalize">{a.provider}</td>
                          <td className="px-5 py-3 tabular-nums font-semibold">{formatCurrency(a.balance)}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                                <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-[var(--color-muted)] tabular-nums">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                              a.status === "connected" ? "bg-green-950/30 text-green-400 border-green-800/40" :
                              a.status === "pending" ? "bg-yellow-950/30 text-yellow-400 border-yellow-800/40" :
                              "bg-red-950/30 text-red-400 border-red-800/40"}`}>
                              {a.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-[var(--color-muted)] text-xs">{a.lastSync ? a.lastSync : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "balances" && <BalanceDashboard />}
      {tab === "reconcile" && <ReconciliationWorkbench />}
      {tab === "cash-position" && <DailyCashPosition />}
      {tab === "sweep" && <SweepPlanner />}
      {tab === "virtual-accounts" && <VirtualAccountTracker />}
      {tab === "fees" && <BankFeeAnalyzer />}
      {tab === "rail" && <PaymentRailChooser />}
      {tab === "cheques" && <ChequeRegister />}
      {tab === "charge-recovery" && <ChargeRecoveryTracker />}
      {tab === "idle-alert" && <IdleBalanceAlert />}
      {tab === "positive-pay" && <PositivePayRegister />}
      {tab === "mandates" && <MandateTracker />}
      {tab === "guarantees" && <GuaranteeLimitTracker />}
      {tab === "od-interest" && <OdInterestCalculator />}
      {tab === "statement-import" && <StatementImporter />}
      {tab === "beneficiaries" && <BeneficiaryWhitelist />}
      {tab === "transfer-planner" && <FundTransferPlanner />}
      {tab === "min-balance" && <MinBalanceChecker />}
      {tab === "savings-interest" && <SavingsInterestEstimator />}
      {tab === "payment-date" && <PaymentDatePicker />}
      {tab === "balance-confirmation" && <BalanceConfirmationGenerator />}
      {tab === "forex-tracker" && <ForexSpreadTracker />}
      {tab === "duplicate-payment" && <DuplicatePaymentDetector />}
      {tab === "netting" && <CounterpartyNetting />}
      {tab === "interest-cert" && <InterestCertificateTracker />}
      {tab === "doc-checklist" && <AccountOpeningChecklist />}
      {tab === "runway" && <CashRunwayMeter />}
    </div>
  );
}

// ── 1. Multi-bank balance dashboard (live from store.bankAccounts) ───────────────
function BalanceDashboard() {
  const { store } = useApp();
  const accounts = store.bankAccounts;
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const [concentrationCap, setConcentrationCap] = useState(40);

  const rows = useMemo(() =>
    [...accounts]
      .sort((a, b) => b.balance - a.balance)
      .map(a => ({ ...a, pct: total > 0 ? (a.balance / total) * 100 : 0 })),
    [accounts, total]);
  const overConcentrated = rows.filter(r => r.pct > concentrationCap);

  if (accounts.length === 0) return <EmptyHint text="No linked accounts. Import or connect banks from the Data module to see a consolidated balance view." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total balance", value: formatCurrency(total), color: "text-[var(--color-text)]" },
          { label: "Accounts", value: `${accounts.length}`, color: "text-blue-400" },
          { label: "Avg per account", value: formatAmount(accounts.length ? Math.round(total / accounts.length) : 0), color: "text-[var(--color-text)]" },
          { label: "Over-concentrated", value: `${overConcentrated.length}`, color: overConcentrated.length ? "text-red-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4`}>
        <label className="text-xs text-[var(--color-muted)] block mb-1">
          Flag any account holding more than <strong className="text-[var(--color-text)]">{concentrationCap}%</strong> of total cash (DICGC insures only ₹5L per bank)
        </label>
        <input type="range" min={10} max={100} step={5} value={concentrationCap}
          onChange={e => setConcentrationCap(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Balances by account (largest first)</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Account", "Provider", "Balance", "Share", "Status"].map(h =>
                <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className={`hover:bg-white/2 ${r.pct > concentrationCap ? "bg-red-950/10" : ""}`}>
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3 text-[var(--color-muted)] capitalize">{r.provider}</td>
                  <td className="px-5 py-3 tabular-nums font-semibold">{formatCurrency(r.balance)}</td>
                  <td className={`px-5 py-3 tabular-nums ${r.pct > concentrationCap ? "text-red-400 font-semibold" : ""}`}>{r.pct.toFixed(1)}%</td>
                  <td className="px-5 py-3"><span className="text-xs text-[var(--color-muted)] capitalize">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {overConcentrated.length > 0 && (
        <Callout tone="warn" icon={AlertTriangle}>
          {overConcentrated.length} account(s) hold more than {concentrationCap}% of your cash. Consider spreading balances or sweeping surplus into FDs to reduce single-bank exposure.
        </Callout>
      )}
    </div>
  );
}

// ── 2. Bank reconciliation workbench (book vs pasted statement lines) ────────────
type StmtLine = { date: string; amount: number; narration: string };
function parseStatement(raw: string): StmtLine[] {
  // Accept CSV / tab / pipe lines: date, amount, narration (amount may have ₹, commas, Dr/Cr)
  return raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[\t,|]/).map(p => p.trim());
    if (parts.length < 2) return null;
    const date = parts[0];
    let rawAmt = parts[1].replace(/[₹,\s]/g, "");
    let sign = 1;
    const dcField = (parts[3] ?? parts[2] ?? "").toLowerCase();
    if (/dr|debit|-/.test(rawAmt) || /\bdr\b|debit/.test(dcField)) sign = -1;
    rawAmt = rawAmt.replace(/dr|cr|debit|credit/gi, "");
    const amount = sign * Math.abs(parseFloat(rawAmt) || 0);
    if (!amount) return null;
    const narration = parts.slice(2).join(" ").replace(/\bdr\b|\bcr\b|debit|credit/gi, "").trim() || parts[2] || "";
    return { date, amount, narration };
  }).filter((x): x is StmtLine => x !== null);
}

function ReconciliationWorkbench() {
  const { store } = useApp();
  const [acctId, setAcctId] = useState(store.bankAccounts[0]?.id ?? "");
  const [raw, setRaw] = useState("");
  const [tolerance, setTolerance] = useState(1);

  const book = useMemo(
    () => store.transactions.filter(t => !acctId || t.bankAccountId === acctId),
    [store.transactions, acctId]);

  const stmt = useMemo(() => parseStatement(raw), [raw]);

  const result = useMemo(() => {
    const bookRemaining = book.map(t => ({ t, used: false }));
    const matched: { stmt: StmtLine; bookId: string; bookDesc: string }[] = [];
    const unmatchedStmt: StmtLine[] = [];
    for (const s of stmt) {
      const hit = bookRemaining.find(b => !b.used && Math.abs(b.t.amount - s.amount) <= tolerance);
      if (hit) { hit.used = true; matched.push({ stmt: s, bookId: hit.t.id, bookDesc: hit.t.description }); }
      else unmatchedStmt.push(s);
    }
    const unmatchedBook = bookRemaining.filter(b => !b.used).map(b => b.t);
    return { matched, unmatchedStmt, unmatchedBook };
  }, [book, stmt, tolerance]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><GitCompareArrows size={14} className="text-[var(--color-primary)]" /> Reconciliation Workbench</h3>
        <p className="text-xs text-[var(--color-muted)]">Paste statement lines from your bank (one per line: <code>date, amount, narration</code> — Dr/Cr or a minus sign marks debits). We match them against your book transactions by amount within tolerance.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account</label>
            <select value={acctId} onChange={e => setAcctId(e.target.value)} className={INP}>
              <option value="">All accounts</option>
              {store.bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount tolerance (₹)</label>
            <input type="number" value={tolerance} onChange={e => setTolerance(Math.max(0, Number(e.target.value) || 0))} className={INP} />
          </div>
        </div>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={6}
          placeholder={"2026-06-01, 50000, NEFT INFOSYS\n2026-06-02, 12500 Dr, UPI VENDOR PAY\n2026-06-03, -3400, BANK CHARGES"}
          className={`${INP} font-mono text-xs`} />
      </div>

      {stmt.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Matched", value: `${result.matched.length}`, color: "text-green-400" },
              { label: "On statement, not in books", value: `${result.unmatchedStmt.length}`, color: result.unmatchedStmt.length ? "text-red-400" : "text-green-400" },
              { label: "In books, not on statement", value: `${result.unmatchedBook.length}`, color: result.unmatchedBook.length ? "text-yellow-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <UnmatchedList title="On statement, missing from books" tone="red" lines={result.unmatchedStmt} />
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold text-yellow-400">In books, not on statement ({result.unmatchedBook.length})</p></div>
              <div className="max-h-72 overflow-y-auto divide-y divide-[var(--color-border)]">
                {result.unmatchedBook.length === 0
                  ? <p className="px-5 py-4 text-xs text-[var(--color-muted)]">Everything in your books appears on the statement.</p>
                  : result.unmatchedBook.map(t => (
                    <div key={t.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0"><p className="text-xs font-medium truncate">{t.description}</p><p className="text-[10px] text-[var(--color-muted)]">{t.date}</p></div>
                      <span className={`text-xs tabular-nums font-semibold ${t.amount < 0 ? "text-red-400" : "text-green-400"}`}>{formatCurrency(t.amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Matching is by amount within tolerance and is greedy (first available book line wins). Use it to surface gaps; confirm each match before posting to your ledger.</p>
        </>
      )}
    </div>
  );
}

function UnmatchedList({ title, tone, lines }: { title: string; tone: "red"; lines: StmtLine[] }) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className={`text-sm font-semibold ${tone === "red" ? "text-red-400" : ""}`}>{title} ({lines.length})</p></div>
      <div className="max-h-72 overflow-y-auto divide-y divide-[var(--color-border)]">
        {lines.length === 0
          ? <p className="px-5 py-4 text-xs text-[var(--color-muted)]">No unmatched lines.</p>
          : lines.map((l, i) => (
            <div key={i} className="px-5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-medium truncate">{l.narration || "—"}</p><p className="text-[10px] text-[var(--color-muted)]">{l.date}</p></div>
              <span className={`text-xs tabular-nums font-semibold ${l.amount < 0 ? "text-red-400" : "text-green-400"}`}>{formatCurrency(l.amount)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── 3. Daily cash position (live transactions + pending debits) ──────────────────
type PendingItem = { id: string; label: string; amount: number; date: string };
function DailyCashPosition() {
  const { store } = useApp();
  const today = new Date();
  const openingBalance = store.bankAccounts.reduce((s, a) => s + a.balance, 0);

  const [pending, setPending] = useFeatureState<PendingItem[]>("bank-pending-debits", []);
  const [pLabel, setPLabel] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pDate, setPDate] = useState(() => format(today, "yyyy-MM-dd"));

  const todayStr = format(today, "yyyy-MM-dd");
  const inflowToday = store.transactions.filter(t => t.amount > 0 && t.date === todayStr).reduce((s, t) => s + t.amount, 0);
  const outflowToday = store.transactions.filter(t => t.amount < 0 && t.date === todayStr).reduce((s, t) => s + Math.abs(t.amount), 0);

  const pendingHolds = pending.reduce((s, p) => s + p.amount, 0);
  const availableNow = openingBalance - pendingHolds;

  const addPending = () => {
    const amt = parseFloat(pAmount);
    if (!pLabel.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter a label and a positive amount"); return; }
    setPending([...pending, { id: crypto.randomUUID(), label: pLabel.trim(), amount: amt, date: pDate }]);
    setPLabel(""); setPAmount("");
    toast.success("Pending debit added");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Bank balance (book)", value: formatCurrency(openingBalance), color: "text-[var(--color-text)]" },
          { label: "Inflows today", value: formatCurrency(inflowToday), color: "text-green-400" },
          { label: "Outflows today", value: formatCurrency(outflowToday), color: "text-red-400" },
          { label: "Available (net of holds)", value: formatCurrency(availableNow), color: availableNow < 0 ? "text-red-400" : "text-blue-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Banknote size={14} className="text-[var(--color-primary)]" /> Pending debits &amp; holds</h3>
        <p className="text-xs text-[var(--color-muted)]">Cheques not yet cleared, scheduled standing instructions, holds — these reduce truly available cash even though the bank balance still shows them.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Description</label>
            <input value={pLabel} onChange={e => setPLabel(e.target.value)} placeholder="PDC to vendor" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={pAmount} onChange={e => setPAmount(e.target.value)} placeholder="50000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Clears on</label>
            <input type="date" value={pDate} onChange={e => setPDate(e.target.value)} className={INP} />
          </div>
          <button onClick={addPending} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>

        {pending.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Description", "Clears", "Amount", ""].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {pending.map(p => (
                  <tr key={p.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 font-medium">{p.label}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{p.date}</td>
                    <td className="px-3 py-2.5 tabular-nums text-red-400">{formatCurrency(p.amount)}</td>
                    <td className="px-3 py-2.5 text-right"><button onClick={() => setPending(pending.filter(x => x.id !== p.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {availableNow < 0 && (
        <Callout tone="warn" icon={AlertTriangle}>
          Pending holds ({formatCurrency(pendingHolds)}) exceed your bank balance — you risk a returned cheque or failed auto-debit. Arrange funds or reschedule a debit.
        </Callout>
      )}
    </div>
  );
}

// ── 4. Sweep-rule planner (idle surplus → overnight FD yield) ────────────────────
function SweepPlanner() {
  const { store } = useApp();
  const accounts = store.bankAccounts;
  const [acctId, setAcctId] = useState(accounts[0]?.id ?? "");
  const [threshold, setThreshold] = useState("500000");
  const [fdRate, setFdRate] = useState("6.5");
  const [ccRate, setCcRate] = useState("3");

  const acct = accounts.find(a => a.id === acctId) ?? accounts[0] ?? null;
  const balance = acct?.balance ?? 0;
  const buffer = parseFloat(threshold) || 0;
  const sweepable = Math.max(0, balance - buffer);
  const fdR = parseFloat(fdRate) || 0;
  const ccR = parseFloat(ccRate) || 0;

  const fdAnnual = Math.round(sweepable * fdR / 100);
  const idleNow = Math.round(sweepable * ccR / 100);
  const extraYield = fdAnnual - idleNow;

  if (accounts.length === 0) return <EmptyHint text="Link a bank account to plan a sweep rule for idle balances." />;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> Sweep-Rule Planner</h3>
        <p className="text-xs text-[var(--color-muted)]">Keep an operating buffer in the current account; sweep anything above it into an auto-renew FD / liquid fund. See the extra annual yield.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account</label>
            <select value={acctId} onChange={e => setAcctId(e.target.value)} className={INP}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Buffer to retain (₹)</label>
            <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sweep/FD rate (% p.a.)</label>
            <input type="number" value={fdRate} onChange={e => setFdRate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Current a/c yield (% p.a.)</label>
            <input type="number" value={ccRate} onChange={e => setCcRate(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Current balance", value: formatCurrency(balance), color: "text-[var(--color-text)]" },
          { label: "Sweepable surplus", value: formatCurrency(sweepable), color: "text-blue-400" },
          { label: "Yield if swept (yr)", value: formatCurrency(fdAnnual), color: "text-green-400" },
          { label: "Extra vs leaving idle", value: formatCurrency(extraYield), color: extraYield > 0 ? "text-green-400" : "text-[var(--color-muted)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {sweepable > 0 && extraYield > 0 && (
        <Callout tone="ok" icon={CheckCircle2}>
          Sweeping {formatCurrency(sweepable)} above a {formatCurrency(buffer)} buffer earns about {formatCurrency(extraYield)} more per year. Set a daily sweep-in/sweep-out rule with your bank so liquidity stays one click away.
        </Callout>
      )}
    </div>
  );
}

// ── 5. Virtual-account tracker (collections mapped to customers) ─────────────────
type VirtualAccount = { id: string; customer: string; vaNumber: string; expected: number; received: number };
function VirtualAccountTracker() {
  const [vas, setVas] = useFeatureState<VirtualAccount[]>("bank-virtual-accounts", []);
  const [customer, setCustomer] = useState("");
  const [expected, setExpected] = useState("");

  const genVa = (seed: string) => "VA" + Math.abs([...seed].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)).toString().padStart(10, "0").slice(0, 10);

  const add = () => {
    const exp = parseFloat(expected) || 0;
    if (!customer.trim()) { toast.error("Enter a customer name"); return; }
    setVas([...vas, { id: crypto.randomUUID(), customer: customer.trim(), vaNumber: genVa(customer + crypto.randomUUID()), expected: exp, received: 0 }]);
    setCustomer(""); setExpected("");
    toast.success("Virtual account issued");
  };
  const totalExpected = vas.reduce((s, v) => s + v.expected, 0);
  const totalReceived = vas.reduce((s, v) => s + v.received, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Hash size={14} className="text-[var(--color-primary)]" /> Virtual-Account Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Issue a dedicated virtual account number per customer so every inflow auto-identifies who paid — no more guessing from cryptic NEFT/UPI narrations.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Acme Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Expected inflow (₹)</label>
            <input type="number" value={expected} onChange={e => setExpected(e.target.value)} placeholder="200000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Issue VA</button>
        </div>
      </div>

      {vas.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Virtual accounts", value: `${vas.length}`, color: "text-blue-400" },
              { label: "Expected", value: formatAmount(totalExpected), color: "text-[var(--color-text)]" },
              { label: "Received", value: formatAmount(totalReceived), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Customer", "Virtual A/C", "Expected", "Received", "Mark inflow", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {vas.map(v => (
                    <tr key={v.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{v.customer}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">{v.vaNumber}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(v.expected)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(v.received)}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setVas(vas.map(x => x.id === v.id ? { ...x, received: x.expected } : x))}
                          className="text-[10px] text-[var(--color-primary)] hover:underline">Mark received</button>
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setVas(vas.filter(x => x.id !== v.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── 6. Bank-fee / charge analyzer (detects charges in transactions) ──────────────
const FEE_KEYWORDS = ["charge", "chrg", "fee", "neft chg", "rtgs chg", "imps", "amc", "annual maint", "sms charge", "cash handling", "min bal", "gst on", "commission", "penal"];
function BankFeeAnalyzer() {
  const { store } = useApp();
  const [benchmarkBps, setBenchmarkBps] = useState("15"); // expected fees as bps of debit volume

  const feeTxns = useMemo(() =>
    store.transactions.filter(t => t.amount < 0 && FEE_KEYWORDS.some(k => t.description.toLowerCase().includes(k))),
    [store.transactions]);

  const totalFees = feeTxns.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalDebits = store.transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const actualBps = totalDebits > 0 ? (totalFees / totalDebits) * 10000 : 0;
  const benchBps = parseFloat(benchmarkBps) || 0;
  const expectedFees = totalDebits * benchBps / 10000;
  const overcharge = totalFees - expectedFees;

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of feeTxns) {
      const k = FEE_KEYWORDS.find(kw => t.description.toLowerCase().includes(kw)) ?? "other";
      map.set(k, (map.get(k) ?? 0) + Math.abs(t.amount));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [feeTxns]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> Bank-Fee Analyzer</h3>
        <p className="text-xs text-[var(--color-muted)]">Scans your transactions for fee/charge debits (NEFT/RTGS chg, AMC, min-balance, GST on charges) and benchmarks them against an expected cost of your debit volume.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Expected fee benchmark (bps of debit volume)</label>
          <input type="number" value={benchmarkBps} onChange={e => setBenchmarkBps(e.target.value)} className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Fee debits found", value: `${feeTxns.length}`, color: "text-blue-400" },
          { label: "Total fees paid", value: formatCurrency(Math.round(totalFees)), color: "text-red-400" },
          { label: "Fees as bps of debits", value: `${actualBps.toFixed(1)} bps`, color: actualBps > benchBps ? "text-red-400" : "text-green-400" },
          { label: "Over benchmark", value: overcharge > 0 ? formatCurrency(Math.round(overcharge)) : "—", color: overcharge > 0 ? "text-red-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {byType.length > 0 ? (
        <div className={`${CARD} p-4`}>
          <p className="text-sm font-semibold mb-3">Fees by type</p>
          <div className="space-y-2">
            {byType.map(([k, v]) => {
              const pct = totalFees > 0 ? (v / totalFees) * 100 : 0;
              return (
                <div key={k}>
                  <div className="flex justify-between text-xs mb-0.5"><span className="capitalize font-medium">{k}</span><span className="tabular-nums text-red-400">{formatCurrency(Math.round(v))}</span></div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full bg-red-500/70 rounded-full" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      ) : <EmptyHint text="No fee/charge debits detected in your transactions. Import a statement to analyze bank charges." />}

      {overcharge > 0 && (
        <Callout tone="warn" icon={AlertTriangle}>
          You paid about {formatCurrency(Math.round(overcharge))} more in fees than your {benchBps} bps benchmark. Raise these with your relationship manager — many charges (min-balance, SMS, AMC) are negotiable for business accounts.
        </Callout>
      )}
    </div>
  );
}

// ── 7. Payment-rail chooser (NEFT/RTGS/IMPS/UPI limits, cutoffs, cost) ────────────
type Rail = { id: string; name: string; min: number; max: number; instant: boolean; cost: string; cutoff: string; note: string };
const RAILS: Rail[] = [
  { id: "upi", name: "UPI", min: 1, max: 100000, instant: true, cost: "Free", cutoff: "24x7", note: "₹1L/txn (₹2L–₹5L for some categories). Best for small, instant payments." },
  { id: "imps", name: "IMPS", min: 1, max: 500000, instant: true, cost: "₹5–₹15 + GST", cutoff: "24x7", note: "Instant up to ₹5L. Good when UPI limit is exceeded." },
  { id: "neft", name: "NEFT", min: 1, max: Infinity, instant: false, cost: "₹2–₹25 + GST", cutoff: "24x7 (half-hourly batches)", note: "No upper limit; settles in batches. Cheapest for non-urgent bulk." },
  { id: "rtgs", name: "RTGS", min: 200000, instant: true, max: Infinity, cost: "₹20–₹50 + GST", cutoff: "24x7", note: "Real-time, ₹2L minimum. Use for large, urgent transfers." },
];
function PaymentRailChooser() {
  const [amount, setAmount] = useState("");
  const [urgent, setUrgent] = useState(true);
  const amt = parseFloat(amount) || 0;

  const eligible = RAILS.filter(r => amt >= r.min && amt <= r.max);
  const recommended = useMemo(() => {
    if (amt <= 0) return null;
    const pool = urgent ? eligible.filter(r => r.instant) : eligible;
    const list = pool.length ? pool : eligible;
    // Prefer free/cheaper, then instant when urgent.
    const order = ["upi", "imps", "rtgs", "neft"];
    if (urgent) return list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))[0] ?? null;
    // non-urgent: prefer cheapest (NEFT/UPI)
    const cheapOrder = ["upi", "neft", "imps", "rtgs"];
    return list.sort((a, b) => cheapOrder.indexOf(a.id) - cheapOrder.indexOf(b.id))[0] ?? null;
  }, [amt, urgent, eligible]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Route size={14} className="text-[var(--color-primary)]" /> Payment-Rail Chooser</h3>
        <p className="text-xs text-[var(--color-muted)]">Pick the right rail — NEFT, RTGS, IMPS or UPI — for an outgoing payment based on amount, urgency, limits and cost.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payment amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="250000" className={INP} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="accent-[var(--color-primary)]" />
            Needs to settle instantly (else prefer the cheapest rail)
          </label>
        </div>
      </div>

      {amt > 0 && recommended && (
        <Callout tone="ok" icon={CheckCircle2}>
          For {formatCurrency(amt)}{urgent ? " (urgent)" : ""}, use <strong>{recommended.name}</strong> — {recommended.note}
        </Callout>
      )}

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Rail comparison</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)]"><tr>{["Rail", "Per-txn range", "Speed", "Typical cost", "Window", "Eligible"].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {RAILS.map(r => {
                const ok = amt > 0 && amt >= r.min && amt <= r.max;
                return (
                  <tr key={r.id} className={`hover:bg-white/2 ${recommended?.id === r.id ? "bg-green-950/20" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">{r.name}{recommended?.id === r.id && <span className="ml-1.5 text-[9px] text-green-400 font-semibold">PICK</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{formatAmount(r.min)} – {r.max === Infinity ? "no limit" : formatAmount(r.max)}</td>
                    <td className="px-4 py-2.5 text-xs">{r.instant ? "Instant" : "Batch (mins)"}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.cost}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.cutoff}</td>
                    <td className="px-4 py-2.5">{amt <= 0 ? <span className="text-[var(--color-muted)] text-xs">—</span> : ok ? <CheckCircle2 size={13} className="text-green-400" /> : <span className="text-[10px] text-red-400">limit</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Limits and charges are indicative per RBI norms; your bank may cap UPI/IMPS lower or waive NEFT/RTGS online fees. RTGS is for ₹2 lakh and above. Confirm your bank&apos;s schedule.</p>
    </div>
  );
}

// ── 8. Cheque register + status ──────────────────────────────────────────────────
type ChequeStatus = "issued" | "presented" | "cleared" | "bounced" | "cancelled";
type Cheque = { id: string; number: string; party: string; amount: number; type: "issued" | "received"; date: string; status: ChequeStatus };
function ChequeRegister() {
  const [cheques, setCheques] = useFeatureState<Cheque[]>("bank-cheques", []);
  const [number, setNumber] = useState("");
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"issued" | "received">("issued");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const add = () => {
    const amt = parseFloat(amount);
    if (!number.trim() || !party.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter cheque number, party and amount"); return; }
    setCheques([...cheques, { id: crypto.randomUUID(), number: number.trim(), party: party.trim(), amount: amt, type, date, status: "issued" }]);
    setNumber(""); setParty(""); setAmount("");
    toast.success("Cheque added");
  };
  const cycle: ChequeStatus[] = ["issued", "presented", "cleared", "bounced", "cancelled"];
  const advance = (id: string) => setCheques(cheques.map(c => c.id === id ? { ...c, status: cycle[(cycle.indexOf(c.status) + 1) % cycle.length] } : c));

  const pending = cheques.filter(c => c.status === "issued" || c.status === "presented");
  const pendingOut = pending.filter(c => c.type === "issued").reduce((s, c) => s + c.amount, 0);
  const bounced = cheques.filter(c => c.status === "bounced").length;

  const STATUS_CLR: Record<ChequeStatus, string> = {
    issued: "bg-blue-950/30 text-blue-400 border-blue-800/40",
    presented: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40",
    cleared: "bg-green-950/30 text-green-400 border-green-800/40",
    bounced: "bg-red-950/30 text-red-400 border-red-800/40",
    cancelled: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileCheck2 size={14} className="text-[var(--color-primary)]" /> Cheque &amp; PDC Register</h3>
        <p className="text-xs text-[var(--color-muted)]">Track issued and received cheques (including post-dated) through their lifecycle — click a status chip to advance it.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cheque no.</label>
            <input value={number} onChange={e => setNumber(e.target.value)} placeholder="000123" className={INP} />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Party</label>
            <input value={party} onChange={e => setParty(e.target.value)} placeholder="Vendor / customer" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as "issued" | "received")} className={INP}>
              <option value="issued">Issued</option>
              <option value="received">Received</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {cheques.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pending cheques", value: `${pending.length}`, color: "text-yellow-400" },
              { label: "Outflow pending", value: formatAmount(pendingOut), color: "text-red-400" },
              { label: "Bounced", value: `${bounced}`, color: bounced ? "text-red-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Cheque", "Party", "Type", "Amount", "Date", "Status", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {cheques.map(c => (
                    <tr key={c.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-mono text-xs">{c.number}</td>
                      <td className="px-4 py-2.5 font-medium">{c.party}</td>
                      <td className="px-4 py-2.5 text-xs capitalize text-[var(--color-muted)]">{c.type}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${c.type === "issued" ? "text-red-400" : "text-green-400"}`}>{formatCurrency(c.amount)}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{c.date}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => advance(c.id)} className={`text-[9px] px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_CLR[c.status]}`}>{c.status}</button>
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setCheques(cheques.filter(x => x.id !== c.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {bounced > 0 && (
            <Callout tone="warn" icon={AlertTriangle}>
              {bounced} cheque(s) bounced. A bounced cheque you issued can attract penal charges and, under Sec 138 of the Negotiable Instruments Act, legal consequences. Re-issue promptly and inform the party.
            </Callout>
          )}
        </>
      )}
    </div>
  );
}

// ── 9. Bank-charge recovery tracker (disputed charges & refunds) ─────────────────
type Dispute = { id: string; charge: string; amount: number; raisedOn: string; status: "open" | "recovered" | "rejected" };
function ChargeRecoveryTracker() {
  const [disputes, setDisputes] = useFeatureState<Dispute[]>("bank-charge-disputes", []);
  const [charge, setCharge] = useState("");
  const [amount, setAmount] = useState("");
  const [raisedOn, setRaisedOn] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const add = () => {
    const amt = parseFloat(amount);
    if (!charge.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter the charge and amount"); return; }
    setDisputes([...disputes, { id: crypto.randomUUID(), charge: charge.trim(), amount: amt, raisedOn, status: "open" }]);
    setCharge(""); setAmount("");
    toast.success("Dispute logged");
  };
  const setStatus = (id: string, status: Dispute["status"]) => setDisputes(disputes.map(d => d.id === id ? { ...d, status } : d));

  const open = disputes.filter(d => d.status === "open");
  const recovered = disputes.filter(d => d.status === "recovered").reduce((s, d) => s + d.amount, 0);
  const inFlight = open.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Bank-Charge Recovery Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Log wrongly-levied charges (min-balance, duplicate AMC, SMS, failed-txn reversals) you have disputed, and track recovery. Banks must reverse failed-transaction debits within RBI TAT.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Charge description</label>
            <input value={charge} onChange={e => setCharge(e.target.value)} placeholder="Failed UPI not reversed" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="3500" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Raised on</label>
            <input type="date" value={raisedOn} onChange={e => setRaisedOn(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Log</button>
        </div>
      </div>

      {disputes.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Open disputes", value: `${open.length}`, color: open.length ? "text-yellow-400" : "text-green-400" },
              { label: "Amount in flight", value: formatCurrency(Math.round(inFlight)), color: "text-yellow-400" },
              { label: "Recovered", value: formatCurrency(Math.round(recovered)), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Charge", "Amount", "Raised", "Status", "Update", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {disputes.map(d => (
                    <tr key={d.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{d.charge}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(d.amount)}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{d.raisedOn}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${
                          d.status === "recovered" ? "bg-green-950/30 text-green-400 border-green-800/40" :
                          d.status === "rejected" ? "bg-red-950/30 text-red-400 border-red-800/40" :
                          "bg-yellow-950/30 text-yellow-400 border-yellow-800/40"}`}>{d.status}</span>
                      </td>
                      <td className="px-4 py-2.5 flex gap-2">
                        <button onClick={() => setStatus(d.id, "recovered")} className="text-[10px] text-green-400 hover:underline">Recovered</button>
                        <button onClick={() => setStatus(d.id, "rejected")} className="text-[10px] text-red-400 hover:underline">Rejected</button>
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setDisputes(disputes.filter(x => x.id !== d.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── 10. Idle-balance alert (foregone yield on idle cash) ──────────────────────────
function IdleBalanceAlert() {
  const { store } = useApp();
  const accounts = store.bankAccounts;
  const today = new Date();
  const [buffer, setBuffer] = useState("300000");
  const [yieldPct, setYieldPct] = useState("6.5");

  const lastTxnByAcct = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of store.transactions) {
      const prev = map.get(t.bankAccountId);
      if (!prev || t.date > prev) map.set(t.bankAccountId, t.date);
    }
    return map;
  }, [store.transactions]);

  const buf = parseFloat(buffer) || 0;
  const rate = parseFloat(yieldPct) || 0;

  const rows = accounts.map(a => {
    const idleAmt = Math.max(0, a.balance - buf);
    const last = lastTxnByAcct.get(a.id);
    const daysIdle = last ? differenceInCalendarDays(today, parseISO(last)) : null;
    const foregoneAnnual = Math.round(idleAmt * rate / 100);
    return { ...a, idleAmt, daysIdle, foregoneAnnual };
  });
  const totalIdle = rows.reduce((s, r) => s + r.idleAmt, 0);
  const totalForegone = rows.reduce((s, r) => s + r.foregoneAnnual, 0);

  if (accounts.length === 0) return <EmptyHint text="Link a bank account to detect idle balances and quantify foregone yield." />;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Clock size={14} className="text-[var(--color-primary)]" /> Idle-Balance Alert</h3>
        <p className="text-xs text-[var(--color-muted)]">Anything above your operating buffer that has not moved is idle cash earning ~nothing in a current account. We quantify the yield you are giving up.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-md">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Operating buffer per account (₹)</label>
            <input type="number" value={buffer} onChange={e => setBuffer(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Achievable yield (% p.a.)</label>
            <input type="number" value={yieldPct} onChange={e => setYieldPct(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Total idle cash", value: formatCurrency(totalIdle), color: "text-yellow-400" },
          { label: "Yield foregone per year", value: formatCurrency(totalForegone), color: "text-red-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]"><tr>{["Account", "Balance", "Idle (above buffer)", "Days since activity", "Yield foregone/yr"].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className={`hover:bg-white/2 ${r.idleAmt > 0 ? "bg-yellow-950/10" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.balance)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-yellow-400">{r.idleAmt > 0 ? formatCurrency(r.idleAmt) : "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{r.daysIdle === null ? "—" : `${r.daysIdle}d`}</td>
                  <td className="px-4 py-2.5 tabular-nums text-red-400">{r.foregoneAnnual > 0 ? formatCurrency(r.foregoneAnnual) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalForegone > 0 && (
        <Callout tone="warn" icon={ArrowRight}>
          You could earn about {formatCurrency(totalForegone)} a year by sweeping {formatCurrency(totalIdle)} of idle cash into an FD or liquid fund at {rate}%. Use the Sweep Planner to set this up.
        </Callout>
      )}
    </div>
  );
}

// ── 11. Positive-pay cheque register (high-value cheque pre-confirmation) ─────────
type PpCheque = { id: string; number: string; payee: string; amount: number; date: string; confirmed: boolean };
function PositivePayRegister() {
  const [items, setItems] = useFeatureState<PpCheque[]>("bank-positive-pay", []);
  const [threshold, setThreshold] = useFeatureState<number>("bank-positive-pay-threshold", 500000);
  const [number, setNumber] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const add = () => {
    const amt = parseFloat(amount);
    if (!number.trim() || !payee.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter cheque number, payee and amount"); return; }
    setItems([...items, { id: crypto.randomUUID(), number: number.trim(), payee: payee.trim(), amount: amt, date, confirmed: false }]);
    setNumber(""); setPayee(""); setAmount("");
    toast.success("Cheque logged for Positive Pay");
  };

  const needsPp = items.filter(i => i.amount >= threshold);
  const unconfirmed = needsPp.filter(i => !i.confirmed);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--color-primary)]" /> Positive Pay Register</h3>
        <p className="text-xs text-[var(--color-muted)]">RBI mandates Positive Pay confirmation for cheques at or above ₹50,000 (banks often set ₹5L). Log issued cheques here, then mark each as confirmed once you submit its details to the bank.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Positive-Pay threshold (₹)</label>
          <input type="number" value={threshold} onChange={e => setThreshold(Math.max(0, Number(e.target.value) || 0))} className={INP} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cheque no.</label>
            <input value={number} onChange={e => setNumber(e.target.value)} placeholder="000456" className={INP} />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payee</label>
            <input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Supplier name" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="600000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Cheques logged", value: `${items.length}`, color: "text-blue-400" },
              { label: "Need Positive Pay", value: `${needsPp.length}`, color: needsPp.length ? "text-yellow-400" : "text-green-400" },
              { label: "Not yet confirmed", value: `${unconfirmed.length}`, color: unconfirmed.length ? "text-red-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Cheque", "Payee", "Amount", "Date", "Positive Pay", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {items.map(i => {
                    const due = i.amount >= threshold;
                    return (
                      <tr key={i.id} className={`hover:bg-white/2 ${due && !i.confirmed ? "bg-yellow-950/10" : ""}`}>
                        <td className="px-4 py-2.5 font-mono text-xs">{i.number}</td>
                        <td className="px-4 py-2.5 font-medium">{i.payee}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(i.amount)}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{i.date}</td>
                        <td className="px-4 py-2.5">
                          {!due ? <span className="text-[10px] text-[var(--color-muted)]">Not required</span>
                            : <button onClick={() => setItems(items.map(x => x.id === i.id ? { ...x, confirmed: !x.confirmed } : x))}
                                className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${i.confirmed ? "bg-green-950/30 text-green-400 border-green-800/40" : "bg-red-950/30 text-red-400 border-red-800/40"}`}>
                                {i.confirmed ? "Confirmed" : "Confirm"}
                              </button>}
                        </td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setItems(items.filter(x => x.id !== i.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {unconfirmed.length > 0 && (
            <Callout tone="warn" icon={AlertTriangle}>
              {unconfirmed.length} high-value cheque(s) above {formatCurrency(threshold)} are not yet confirmed under Positive Pay. Submit their details to your bank, or they may be returned at presentation.
            </Callout>
          )}
        </>
      )}
    </div>
  );
}

// ── 12. NACH / eNACH mandate tracker (recurring auto-debits) ──────────────────────
type Mandate = { id: string; ref: string; party: string; amount: number; frequency: "monthly" | "quarterly" | "yearly"; nextDebit: string; status: "active" | "paused" | "cancelled" };
function MandateTracker() {
  const [mandates, setMandates] = useFeatureState<Mandate[]>("bank-nach-mandates", []);
  const [ref, setRef] = useState("");
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Mandate["frequency"]>("monthly");
  const [nextDebit, setNextDebit] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const add = () => {
    const amt = parseFloat(amount);
    if (!ref.trim() || !party.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter UMRN/ref, party and amount"); return; }
    setMandates([...mandates, { id: crypto.randomUUID(), ref: ref.trim(), party: party.trim(), amount: amt, frequency, nextDebit, status: "active" }]);
    setRef(""); setParty(""); setAmount("");
    toast.success("Mandate added");
  };
  const setStatus = (id: string, status: Mandate["status"]) => setMandates(mandates.map(m => m.id === id ? { ...m, status } : m));

  const monthlyOut = mandates.filter(m => m.status === "active").reduce((s, m) => {
    const factor = m.frequency === "monthly" ? 1 : m.frequency === "quarterly" ? 1 / 3 : 1 / 12;
    return s + m.amount * factor;
  }, 0);
  const active = mandates.filter(m => m.status === "active").length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> NACH / eNACH Mandate Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">One console for every recurring auto-debit — EMIs, SIPs, utility and SaaS subscriptions running on NACH or UPI AutoPay. Pause or cancel a mandate from one place to stop silent leakage.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">UMRN / ref</label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="HDFC0001234" className={INP} />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Party</label>
            <input value={party} onChange={e => setParty(e.target.value)} placeholder="Bajaj Finance EMI" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="25000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Frequency</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value as Mandate["frequency"])} className={INP}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Next debit</label>
            <input type="date" value={nextDebit} onChange={e => setNextDebit(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {mandates.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Active mandates", value: `${active}`, color: "text-blue-400" },
              { label: "Total mandates", value: `${mandates.length}`, color: "text-[var(--color-text)]" },
              { label: "Equiv. monthly outflow", value: formatCurrency(Math.round(monthlyOut)), color: "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]"><tr>{["UMRN/ref", "Party", "Amount", "Frequency", "Next debit", "Status", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {mandates.map(m => (
                    <tr key={m.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-mono text-xs">{m.ref}</td>
                      <td className="px-4 py-2.5 font-medium">{m.party}</td>
                      <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(m.amount)}</td>
                      <td className="px-4 py-2.5 text-xs capitalize text-[var(--color-muted)]">{m.frequency}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{m.nextDebit}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${
                          m.status === "active" ? "bg-green-950/30 text-green-400 border-green-800/40" :
                          m.status === "paused" ? "bg-yellow-950/30 text-yellow-400 border-yellow-800/40" :
                          "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{m.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right flex justify-end gap-2">
                        {m.status === "active"
                          ? <button onClick={() => setStatus(m.id, "paused")} className="text-[10px] text-yellow-400 hover:underline">Pause</button>
                          : m.status === "paused"
                            ? <button onClick={() => setStatus(m.id, "active")} className="text-[10px] text-green-400 hover:underline">Resume</button>
                            : null}
                        <button onClick={() => setStatus(m.id, "cancelled")} className="text-[10px] text-red-400 hover:underline">Cancel</button>
                        <button onClick={() => setMandates(mandates.filter(x => x.id !== m.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── 13. Bank-guarantee / LC limit tracker ─────────────────────────────────────────
type Facility = { id: string; type: "BG" | "LC"; beneficiary: string; amount: number; expiry: string };
function GuaranteeLimitTracker() {
  const [facilities, setFacilities] = useFeatureState<Facility[]>("bank-bg-lc", []);
  const [sanctioned, setSanctioned] = useFeatureState<number>("bank-bg-lc-limit", 5000000);
  const [type, setType] = useState<Facility["type"]>("BG");
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [expiry, setExpiry] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const today = new Date();

  const add = () => {
    const amt = parseFloat(amount);
    if (!beneficiary.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter beneficiary and amount"); return; }
    setFacilities([...facilities, { id: crypto.randomUUID(), type, beneficiary: beneficiary.trim(), amount: amt, expiry }]);
    setBeneficiary(""); setAmount("");
    toast.success(`${type} added`);
  };

  const utilised = facilities.reduce((s, f) => s + f.amount, 0);
  const available = Math.max(0, sanctioned - utilised);
  const utilPct = sanctioned > 0 ? (utilised / sanctioned) * 100 : 0;
  const expiringSoon = facilities.filter(f => differenceInCalendarDays(parseISO(f.expiry), today) <= 30 && differenceInCalendarDays(parseISO(f.expiry), today) >= 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> Bank-Guarantee / LC Limit Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Track outstanding bank guarantees and letters of credit against your sanctioned non-fund limit, and catch expiries before they lapse (a BG left to lapse may still need to be returned to release margin).</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Sanctioned BG/LC (non-fund) limit (₹)</label>
          <input type="number" value={sanctioned} onChange={e => setSanctioned(Math.max(0, Number(e.target.value) || 0))} className={INP} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as Facility["type"])} className={INP}>
              <option value="BG">Bank Guarantee</option>
              <option value="LC">Letter of Credit</option>
            </select>
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Beneficiary</label>
            <input value={beneficiary} onChange={e => setBeneficiary(e.target.value)} placeholder="NHAI / Supplier" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Expiry</label>
            <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Sanctioned limit", value: formatCurrency(sanctioned), color: "text-[var(--color-text)]" },
          { label: "Utilised", value: formatCurrency(utilised), color: utilPct > 90 ? "text-red-400" : "text-yellow-400" },
          { label: "Available headroom", value: formatCurrency(available), color: "text-green-400" },
          { label: "Utilisation", value: `${utilPct.toFixed(0)}%`, color: utilPct > 90 ? "text-red-400" : "text-blue-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {facilities.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Type", "Beneficiary", "Amount", "Expiry", "Days left", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {facilities.map(f => {
                  const days = differenceInCalendarDays(parseISO(f.expiry), today);
                  return (
                    <tr key={f.id} className={`hover:bg-white/2 ${days < 0 ? "bg-red-950/10" : days <= 30 ? "bg-yellow-950/10" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{f.type}</td>
                      <td className="px-4 py-2.5">{f.beneficiary}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(f.amount)}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{f.expiry}</td>
                      <td className={`px-4 py-2.5 tabular-nums text-xs ${days < 0 ? "text-red-400" : days <= 30 ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>{days < 0 ? "Expired" : `${days}d`}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setFacilities(facilities.filter(x => x.id !== f.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {utilPct > 90 && (
        <Callout tone="warn" icon={AlertTriangle}>
          You have used {utilPct.toFixed(0)}% of your sanctioned BG/LC limit. New guarantees may be declined — ask your bank for an enhancement or release a closed BG to free up headroom.
        </Callout>
      )}
      {expiringSoon.length > 0 && (
        <Callout tone="warn" icon={Clock}>
          {expiringSoon.length} facility(ies) expire within 30 days. Arrange renewal or return the instrument to release the margin money held against it.
        </Callout>
      )}
    </div>
  );
}

// ── 14. OD / CC interest accrual calculator ───────────────────────────────────────
function OdInterestCalculator() {
  const [limit, setLimit] = useState("2000000");
  const [drawn, setDrawn] = useState("1200000");
  const [rate, setRate] = useState("11.5");
  const [days, setDays] = useState("30");

  const lim = parseFloat(limit) || 0;
  const dr = Math.max(0, parseFloat(drawn) || 0);
  const r = parseFloat(rate) || 0;
  const d = Math.max(0, parseFloat(days) || 0);

  const utilisation = lim > 0 ? (dr / lim) * 100 : 0;
  const dailyInterest = dr * (r / 100) / 365;
  const periodInterest = dailyInterest * d;
  const monthlyInterest = dailyInterest * 30;
  const annualInterest = dr * (r / 100);
  const headroom = Math.max(0, lim - dr);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> OD / CC Interest Accrual</h3>
        <p className="text-xs text-[var(--color-muted)]">Overdraft and cash-credit interest is charged daily on the amount actually drawn, not the sanctioned limit. Estimate what your drawn balance is costing you and watch utilisation against the limit.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sanctioned limit (₹)</label>
            <input type="number" value={limit} onChange={e => setLimit(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount drawn (₹)</label>
            <input type="number" value={drawn} onChange={e => setDrawn(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Interest rate (% p.a.)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Days drawn</label>
            <input type="number" value={days} onChange={e => setDays(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Utilisation", value: `${utilisation.toFixed(0)}%`, color: utilisation > 90 ? "text-red-400" : "text-blue-400" },
          { label: "Interest / day", value: formatCurrency(Math.round(dailyInterest)), color: "text-yellow-400" },
          { label: `Interest for ${d} day(s)`, value: formatCurrency(Math.round(periodInterest)), color: "text-red-400" },
          { label: "Headroom left", value: formatCurrency(headroom), color: "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4`}>
        <p className="text-sm font-semibold mb-3">If this drawn balance persists</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Cost per month (~30 days)", value: formatCurrency(Math.round(monthlyInterest)) },
            { label: "Cost per year", value: formatCurrency(Math.round(annualInterest)) },
          ].map(k => (
            <div key={k.label}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className="text-lg font-bold tabular-nums text-red-400">{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {utilisation > 90 && (
        <Callout tone="warn" icon={AlertTriangle}>
          You are using {utilisation.toFixed(0)}% of your OD/CC limit. Repayments slow when you are near the limit, and a breach attracts penal interest. Sweep idle balances in to cut the daily interest.
        </Callout>
      )}
    </div>
  );
}

// ── 15. Account-statement importer (paste → categorize → totals) ──────────────────
type ImportCat = "income" | "vendor" | "salary" | "tax" | "bank-charge" | "transfer" | "other";
const IMPORT_RULES: { cat: ImportCat; words: string[] }[] = [
  { cat: "salary", words: ["salary", "payroll", "wages", "stipend"] },
  { cat: "tax", words: ["gst", "tds", "income tax", "advance tax", "challan", "cbdt"] },
  { cat: "bank-charge", words: ["charge", "chrg", "fee", "amc", "min bal", "commission", "penal"] },
  { cat: "transfer", words: ["self", "own a/c", "sweep", "transfer to", "neft self"] },
  { cat: "vendor", words: ["upi", "vendor", "payment to", "purchase", "supplier", "rtgs", "neft"] },
];
function categorize(narration: string, amount: number): ImportCat {
  const n = narration.toLowerCase();
  for (const rule of IMPORT_RULES) if (rule.words.some(w => n.includes(w))) return rule.cat;
  return amount > 0 ? "income" : "other";
}
function StatementImporter() {
  const [raw, setRaw] = useState("");
  const lines = useMemo(() => parseStatement(raw).map(l => ({ ...l, cat: categorize(l.narration, l.amount) })), [raw]);

  const byCat = useMemo(() => {
    const map = new Map<ImportCat, { count: number; total: number }>();
    for (const l of lines) {
      const e = map.get(l.cat) ?? { count: 0, total: 0 };
      e.count += 1; e.total += Math.abs(l.amount);
      map.set(l.cat, e);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [lines]);

  const credits = lines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const debits = lines.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);

  const CAT_CLR: Record<ImportCat, string> = {
    income: "text-green-400", vendor: "text-blue-400", salary: "text-purple-400",
    tax: "text-yellow-400", "bank-charge": "text-red-400", transfer: "text-[var(--color-muted)]", other: "text-[var(--color-muted)]",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ListChecks size={14} className="text-[var(--color-primary)]" /> Statement Importer &amp; Categorizer</h3>
        <p className="text-xs text-[var(--color-muted)]">Paste raw statement lines (<code>date, amount, narration</code> — Dr/Cr or minus marks debits). Each line is auto-bucketed into salary, vendor, tax, bank-charge, transfer or income so you get an instant spend breakdown without uploading anything.</p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={6}
          placeholder={"2026-06-01, 200000, NEFT CR INFOSYS\n2026-06-02, 45000 Dr, SALARY PAYROLL JUNE\n2026-06-03, 11800 Dr, GST CHALLAN\n2026-06-04, 354 Dr, SMS CHARGE GST"}
          className={`${INP} font-mono text-xs`} />
      </div>

      {lines.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Lines parsed", value: `${lines.length}`, color: "text-blue-400" },
              { label: "Total credits", value: formatCurrency(credits), color: "text-green-400" },
              { label: "Total debits", value: formatCurrency(debits), color: "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className={`${CARD} p-4`}>
            <p className="text-sm font-semibold mb-3">By category</p>
            <div className="space-y-2">
              {byCat.map(([cat, e]) => {
                const pct = (credits + debits) > 0 ? (e.total / (credits + debits)) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className={`capitalize font-medium ${CAT_CLR[cat]}`}>{cat.replace("-", " ")} ({e.count})</span>
                      <span className="tabular-nums">{formatCurrency(Math.round(e.total))}</span>
                    </div>
                    <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full bg-[var(--color-primary)]/70 rounded-full" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-surface)]"><tr>{["Date", "Narration", "Category", "Amount"].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {lines.map((l, i) => (
                    <tr key={i} className="hover:bg-white/2">
                      <td className="px-4 py-2 text-xs text-[var(--color-muted)]">{l.date}</td>
                      <td className="px-4 py-2 text-xs truncate max-w-[240px]">{l.narration || "—"}</td>
                      <td className={`px-4 py-2 text-xs capitalize font-medium ${CAT_CLR[l.cat]}`}>{l.cat.replace("-", " ")}</td>
                      <td className={`px-4 py-2 tabular-nums text-xs ${l.amount < 0 ? "text-red-400" : "text-green-400"}`}>{formatCurrency(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Categorization is rule-based on the narration text — review before posting to your books. It does not write to the ledger.</p>
        </>
      )}
    </div>
  );
}

// ── 16. Beneficiary whitelist manager (penny-drop verified payees) ────────────────
type Beneficiary = { id: string; name: string; account: string; ifsc: string; verified: boolean };
function BeneficiaryWhitelist() {
  const [payees, setPayees] = useFeatureState<Beneficiary[]>("bank-beneficiaries", []);
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");

  const ifscOk = (v: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase());

  const add = () => {
    if (!name.trim() || !account.trim()) { toast.error("Enter beneficiary name and account number"); return; }
    if (ifsc && !ifscOk(ifsc)) { toast.error("IFSC looks invalid (e.g. HDFC0001234)"); return; }
    if (payees.some(p => p.account === account.trim())) { toast.error("This account is already whitelisted"); return; }
    setPayees([...payees, { id: crypto.randomUUID(), name: name.trim(), account: account.trim(), ifsc: ifsc.trim().toUpperCase(), verified: false }]);
    setName(""); setAccount(""); setIfsc("");
    toast.success("Beneficiary added — verify before first payment");
  };

  const verified = payees.filter(p => p.verified).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><UserCheck size={14} className="text-[var(--color-primary)]" /> Beneficiary Whitelist</h3>
        <p className="text-xs text-[var(--color-muted)]">Keep one verified payee master. Add an account, validate the IFSC format, then mark it verified once a penny-drop name check matches — so you never wire money to a wrong or fraudulent account.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Beneficiary name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Supplies Pvt Ltd" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account number</label>
            <input value={account} onChange={e => setAccount(e.target.value)} placeholder="50100123456789" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">IFSC</label>
            <input value={ifsc} onChange={e => setIfsc(e.target.value)} placeholder="HDFC0001234" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {payees.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Whitelisted payees", value: `${payees.length}`, color: "text-blue-400" },
              { label: "Verified", value: `${verified}`, color: "text-green-400" },
              { label: "Awaiting verification", value: `${payees.length - verified}`, color: payees.length - verified ? "text-yellow-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Name", "Account", "IFSC", "Status", "Action", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {payees.map(p => (
                    <tr key={p.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{p.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{p.account}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">{p.ifsc || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${p.verified ? "bg-green-950/30 text-green-400 border-green-800/40" : "bg-yellow-950/30 text-yellow-400 border-yellow-800/40"}`}>{p.verified ? "Verified" : "Unverified"}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setPayees(payees.map(x => x.id === p.id ? { ...x, verified: !x.verified } : x))} className="text-[10px] text-[var(--color-primary)] hover:underline">{p.verified ? "Mark unverified" : "Mark verified"}</button>
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setPayees(payees.filter(x => x.id !== p.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {payees.length - verified > 0 && (
            <Callout tone="warn" icon={ShieldAlert}>
              {payees.length - verified} payee(s) are unverified. Run a penny-drop / name check and confirm the account holder name before releasing any payment to them.
            </Callout>
          )}
        </>
      )}
    </div>
  );
}

// ── 17. Multi-account fund-transfer planner (cover shortfalls from surplus) ───────
function FundTransferPlanner() {
  const { store } = useApp();
  const accounts = store.bankAccounts;
  const [buffer, setBuffer] = useState("200000");

  const buf = parseFloat(buffer) || 0;
  const plan = useMemo(() => {
    const surplus = accounts.map(a => ({ id: a.id, name: a.name, free: a.balance - buf })).filter(a => a.free > 0).sort((x, y) => y.free - x.free);
    const deficit = accounts.map(a => ({ id: a.id, name: a.name, need: buf - a.balance })).filter(a => a.need > 0).sort((x, y) => y.need - x.need);
    const moves: { from: string; to: string; amount: number }[] = [];
    const src = surplus.map(s => ({ ...s }));
    for (const d of deficit) {
      let need = d.need;
      for (const s of src) {
        if (need <= 0) break;
        if (s.free <= 0) continue;
        const move = Math.min(s.free, need);
        moves.push({ from: s.name, to: d.name, amount: Math.round(move) });
        s.free -= move; need -= move;
      }
    }
    return { moves, deficit, surplus };
  }, [accounts, buf]);

  if (accounts.length < 2) return <EmptyHint text="Link at least two bank accounts to plan transfers that top up shortfall accounts from surplus ones." />;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Split size={14} className="text-[var(--color-primary)]" /> Fund-Transfer Planner</h3>
        <p className="text-xs text-[var(--color-muted)]">Set a target balance every account should hold. We work out the fewest transfers to top up accounts below the target using surplus from the others — handy before a payment run.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Target balance per account (₹)</label>
          <input type="number" value={buffer} onChange={e => setBuffer(e.target.value)} className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Accounts below target", value: `${plan.deficit.length}`, color: plan.deficit.length ? "text-red-400" : "text-green-400" },
          { label: "Accounts with surplus", value: `${plan.surplus.length}`, color: "text-green-400" },
          { label: "Transfers suggested", value: `${plan.moves.length}`, color: "text-blue-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {plan.moves.length > 0 ? (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Suggested transfers</p></div>
          <div className="divide-y divide-[var(--color-border)]">
            {plan.moves.map((m, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{m.from}</span>
                  <ArrowRight size={13} className="text-[var(--color-muted)] shrink-0" />
                  <span className="font-medium truncate">{m.to}</span>
                </div>
                <span className="tabular-nums font-semibold text-blue-400 shrink-0">{formatCurrency(m.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Callout tone="ok" icon={CheckCircle2}>
          {plan.deficit.length === 0 ? "Every account already meets the target balance — no transfers needed." : "No surplus is available to cover the shortfall. Bring in external funds or lower the target."}
        </Callout>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A plan only — execute transfers via your bank using the right rail (see the Payment-Rail Chooser). Intra-bank transfers are usually instant and free.</p>
    </div>
  );
}

// ── 18. Minimum-balance penalty checker ───────────────────────────────────────────
type MabAcct = { id: string; name: string; required: number; maintained: number };
function MinBalanceChecker() {
  const { store } = useApp();
  const [rows, setRows] = useFeatureState<MabAcct[]>("bank-mab", []);
  const [penaltyPer1000, setPenaltyPer1000] = useFeatureState<number>("bank-mab-penalty", 60);
  const [name, setName] = useState(store.bankAccounts[0]?.name ?? "");
  const [required, setRequired] = useState("10000");
  const [maintained, setMaintained] = useState("");

  const add = () => {
    const req = parseFloat(required); const mab = parseFloat(maintained);
    if (!name.trim() || isNaN(req) || req < 0 || isNaN(mab) || mab < 0) { toast.error("Enter account, required and maintained balance"); return; }
    setRows([...rows, { id: crypto.randomUUID(), name: name.trim(), required: req, maintained: mab }]);
    setMaintained("");
    toast.success("Account added");
  };

  const calc = rows.map(r => {
    const shortfallPct = r.required > 0 ? Math.max(0, (r.required - r.maintained) / r.required) * 100 : 0;
    const shortfall = Math.max(0, r.required - r.maintained);
    const penalty = Math.round((shortfall / 1000) * penaltyPer1000);
    return { ...r, shortfall, shortfallPct, penalty };
  });
  const totalPenalty = calc.reduce((s, r) => s + r.penalty, 0);
  const breaching = calc.filter(r => r.shortfall > 0).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Minimum-Balance Penalty Checker</h3>
        <p className="text-xs text-[var(--color-muted)]">Banks charge a non-maintenance penalty (typically a slab per ₹1,000 of shortfall against the average monthly balance). Enter each account&apos;s required vs maintained balance to estimate the hit and decide whether to consolidate.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Penalty per ₹1,000 shortfall (₹)</label>
          <input type="number" value={penaltyPer1000} onChange={e => setPenaltyPer1000(Math.max(0, Number(e.target.value) || 0))} className={INP} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Current A/C" className={INP} list="mab-accts" />
            <datalist id="mab-accts">{store.bankAccounts.map(a => <option key={a.id} value={a.name} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Required AMB (₹)</label>
            <input type="number" value={required} onChange={e => setRequired(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Maintained AMB (₹)</label>
            <input type="number" value={maintained} onChange={e => setMaintained(e.target.value)} placeholder="6500" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Accounts breaching MAB", value: `${breaching}`, color: breaching ? "text-red-400" : "text-green-400" },
              { label: "Estimated penalty / month", value: formatCurrency(totalPenalty), color: totalPenalty ? "text-red-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Account", "Required", "Maintained", "Shortfall", "Est. penalty", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {calc.map(r => (
                    <tr key={r.id} className={`hover:bg-white/2 ${r.shortfall > 0 ? "bg-red-950/10" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.required)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.maintained)}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${r.shortfall > 0 ? "text-red-400" : "text-green-400"}`}>{r.shortfall > 0 ? formatCurrency(r.shortfall) : "—"}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${r.penalty > 0 ? "text-red-400 font-semibold" : "text-green-400"}`}>{r.penalty > 0 ? formatCurrency(r.penalty) : "—"}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPenalty > 0 && (
            <Callout tone="warn" icon={AlertTriangle}>
              You risk about {formatCurrency(totalPenalty)} in non-maintenance charges this month plus GST. Either top up the average balance, switch to a zero-balance current account, or close redundant accounts.
            </Callout>
          )}
        </>
      )}
    </div>
  );
}

// ── 19. Interest-on-savings estimator (quarterly compounding) ─────────────────────
function SavingsInterestEstimator() {
  const [principal, setPrincipal] = useState("500000");
  const [rate, setRate] = useState("3.0");
  const [months, setMonths] = useState("12");

  const p = Math.max(0, parseFloat(principal) || 0);
  const r = parseFloat(rate) || 0;
  const m = Math.max(0, parseFloat(months) || 0);

  // Savings interest: calculated daily on closing balance, credited quarterly → compound quarterly.
  const quarters = m / 3;
  const qRate = r / 100 / 4;
  const maturity = p * Math.pow(1 + qRate, quarters);
  const interest = maturity - p;
  const effectiveYield = p > 0 && m > 0 ? (Math.pow(maturity / p, 12 / m) - 1) * 100 : 0;
  const tds = interest > 40000 ? interest * 0.10 : 0; // indicative: TDS on bank interest above ₹40k (Sec 194A)

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PiggyBank size={14} className="text-[var(--color-primary)]" /> Interest-on-Savings Estimator</h3>
        <p className="text-xs text-[var(--color-muted)]">Savings-account interest is calculated daily on the closing balance and credited quarterly. Estimate what a parked balance earns, the effective annual yield, and the indicative TDS once interest crosses ₹40,000 in a year.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Average balance held (₹)</label>
            <input type="number" value={principal} onChange={e => setPrincipal(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Savings rate (% p.a.)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Period (months)</label>
            <input type="number" value={months} onChange={e => setMonths(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Interest earned", value: formatCurrency(Math.round(interest)), color: "text-green-400" },
          { label: "Maturity value", value: formatCurrency(Math.round(maturity)), color: "text-[var(--color-text)]" },
          { label: "Effective yield", value: `${effectiveYield.toFixed(2)}%`, color: "text-blue-400" },
          { label: "Indicative TDS", value: tds > 0 ? formatCurrency(Math.round(tds)) : "—", color: tds > 0 ? "text-yellow-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <Callout tone="ok" icon={Coins}>
        A savings account at {r}% barely beats inflation. For idle business cash, an overnight/liquid fund or an auto-sweep FD usually yields more — compare in the Sweep Planner.
      </Callout>
      <p className="text-[10px] text-[var(--color-muted)]">Estimate only, assuming a steady average balance and quarterly compounding. TDS shown is indicative (10% u/s 194A above the ₹40,000 threshold; banks deduct on actual interest credited). Confirm with your bank and CA.</p>
    </div>
  );
}

// ── 20. Bank-holiday-aware payment date picker ────────────────────────────────────
const BANK_HOLIDAYS_2026 = [
  "2026-01-26", "2026-03-06", "2026-03-21", "2026-04-01", "2026-04-03",
  "2026-04-14", "2026-05-01", "2026-08-15", "2026-08-28", "2026-10-02",
  "2026-10-20", "2026-11-09", "2026-12-25",
];
function PaymentDatePicker() {
  const [startDate, setStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [extraRaw, setExtraRaw] = useState("");

  const extra = useMemo(() => extraRaw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean), [extraRaw]);
  const holidays = useMemo(() => new Set([...BANK_HOLIDAYS_2026, ...extra]), [extra]);

  const isHoliday = (d: Date) => {
    const day = d.getDay();
    if (day === 0) return { holiday: true, reason: "Sunday" };
    // 2nd & 4th Saturday are bank holidays in India
    if (day === 6) {
      const week = Math.ceil(d.getDate() / 7);
      if (week === 2 || week === 4) return { holiday: true, reason: `${week === 2 ? "2nd" : "4th"} Saturday` };
    }
    if (holidays.has(format(d, "yyyy-MM-dd"))) return { holiday: true, reason: "Bank holiday" };
    return { holiday: false, reason: "" };
  };

  const result = useMemo(() => {
    let d = parseISO(startDate);
    if (isNaN(d.getTime())) return null;
    const skipped: { date: string; reason: string }[] = [];
    let guard = 0;
    while (guard < 40) {
      const h = isHoliday(d);
      if (!h.holiday) break;
      skipped.push({ date: format(d, "yyyy-MM-dd"), reason: h.reason });
      d = new Date(d.getTime() + 86400000);
      guard++;
    }
    return { settles: format(d, "yyyy-MM-dd"), skipped };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, holidays]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Bank-Holiday-Aware Payment Date</h3>
        <p className="text-xs text-[var(--color-muted)]">NEFT/RTGS settle 24x7 now, but cheque clearing, NACH debits and many corporate cut-offs still follow the banking calendar. Pick a date and we roll it forward to the next working day, skipping Sundays, 2nd/4th Saturdays and holidays.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Intended date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Extra holiday dates (YYYY-MM-DD, comma/space separated)</label>
            <input value={extraRaw} onChange={e => setExtraRaw(e.target.value)} placeholder="2026-09-07, 2026-11-08" className={INP} />
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Effective working date", value: result.settles, color: result.skipped.length ? "text-yellow-400" : "text-green-400" },
              { label: "Non-working days skipped", value: `${result.skipped.length}`, color: result.skipped.length ? "text-yellow-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          {result.skipped.length > 0 ? (
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Skipped because</p></div>
              <div className="divide-y divide-[var(--color-border)]">
                {result.skipped.map(s => (
                  <div key={s.date} className="px-5 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-[var(--color-muted)]">{s.date}</span>
                    <span className="text-xs">{s.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Callout tone="ok" icon={CheckCircle2}>
              {result.settles} is a working day — your cheque/NACH instruction should be honoured on the date you intended.
            </Callout>
          )}
          <p className="text-[10px] text-[var(--color-muted)]">Holiday list is the common national set; state-specific RBI holidays vary by location — add them in the extra-dates field. Verify with your bank&apos;s holiday calendar.</p>
        </>
      )}
    </div>
  );
}

// ── 21. Bank balance-confirmation (BRS) letter generator ─────────────────────────
function BalanceConfirmationGenerator() {
  const { store } = useApp();
  const accounts = store.bankAccounts;
  const [acctId, setAcctId] = useState(accounts[0]?.id ?? "");
  const [entity, setEntity] = useState("");
  const [asOn, setAsOn] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const acct = accounts.find(a => a.id === acctId) ?? accounts[0] ?? null;

  const letter = useMemo(() => {
    if (!acct) return "";
    const dateStr = (() => { const d = parseISO(asOn); return isNaN(d.getTime()) ? asOn : format(d, "dd MMMM yyyy"); })();
    return [
      `To,`,
      `The Branch Manager`,
      `${acct.provider} Bank`,
      ``,
      `Date: ${format(new Date(), "dd MMMM yyyy")}`,
      ``,
      `Subject: Confirmation of bank balance as on ${dateStr}`,
      ``,
      `Dear Sir/Madam,`,
      ``,
      `For the purpose of our statutory audit, we request you to kindly confirm directly to our auditors the balance held in the following account as on ${dateStr}:`,
      ``,
      `   Account holder : ${entity.trim() || "[Entity name]"}`,
      `   Account name   : ${acct.name}`,
      `   Bank / provider: ${acct.provider}`,
      `   Balance per our books: ${formatCurrency(acct.balance)}`,
      ``,
      `Please also confirm any fixed deposits, overdraft/cash-credit limits, lien-marked amounts, and bank guarantees outstanding as on the above date.`,
      ``,
      `Thanking you,`,
      `For ${entity.trim() || "[Entity name]"}`,
      ``,
      `Authorised Signatory`,
    ].join("\n");
  }, [acct, entity, asOn]);

  if (accounts.length === 0) return <EmptyHint text="Link a bank account to generate a balance-confirmation request for your statutory audit." />;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck size={14} className="text-[var(--color-primary)]" /> Balance-Confirmation Letter</h3>
        <p className="text-xs text-[var(--color-muted)]">Auditors ask for an independent balance confirmation from each bank every year. Pick an account and date; we draft the request letter with the book balance pre-filled.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account</label>
            <select value={acctId} onChange={e => setAcctId(e.target.value)} className={INP}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Entity / account holder</label>
            <input value={entity} onChange={e => setEntity(e.target.value)} placeholder="Acme Industries Pvt Ltd" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Balance as on</label>
            <input type="date" value={asOn} onChange={e => setAsOn(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <p className="text-sm font-semibold">Draft letter</p>
          <button onClick={() => { navigator.clipboard?.writeText(letter); toast.success("Letter copied to clipboard"); }}
            className="text-[10px] text-[var(--color-primary)] hover:underline">Copy</button>
        </div>
        <pre className="px-5 py-4 text-xs font-mono whitespace-pre-wrap text-[var(--color-text)]">{letter}</pre>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">The bank confirms the balance directly to your auditor; the book balance shown is from your linked feed and may differ from the bank&apos;s record until reconciled.</p>
    </div>
  );
}

// ── 22. Forex conversion-cost / spread tracker ───────────────────────────────────
type FxDeal = { id: string; ccy: string; foreign: number; inrReceived: number; refRate: number; date: string };
function ForexSpreadTracker() {
  const [deals, setDeals] = useFeatureState<FxDeal[]>("bank-fx-deals", []);
  const [ccy, setCcy] = useState("USD");
  const [foreign, setForeign] = useState("");
  const [inrReceived, setInrReceived] = useState("");
  const [refRate, setRefRate] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const add = () => {
    const f = parseFloat(foreign), inr = parseFloat(inrReceived), r = parseFloat(refRate);
    if (!ccy.trim() || isNaN(f) || f <= 0 || isNaN(inr) || inr <= 0 || isNaN(r) || r <= 0) {
      toast.error("Enter currency, foreign amount, INR received and a reference rate"); return;
    }
    setDeals([...deals, { id: crypto.randomUUID(), ccy: ccy.trim().toUpperCase(), foreign: f, inrReceived: inr, refRate: r, date }]);
    setForeign(""); setInrReceived(""); setRefRate("");
    toast.success("FX deal logged");
  };

  const rows = useMemo(() => deals.map(d => {
    const bankRate = d.inrReceived / d.foreign;
    const spreadPaise = (d.refRate - bankRate) * 100; // paise per unit of foreign ccy
    const spreadPct = d.refRate > 0 ? ((d.refRate - bankRate) / d.refRate) * 100 : 0;
    const cost = (d.refRate - bankRate) * d.foreign; // INR lost vs reference
    return { ...d, bankRate, spreadPaise, spreadPct, cost };
  }), [deals]);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Globe size={14} className="text-[var(--color-primary)]" /> Forex Conversion-Cost Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Log each inward/outward FX conversion with the foreign amount, INR you actually got, and the interbank/reference rate that day. We compute the bank&apos;s effective rate and the spread you paid.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Currency</label>
            <input value={ccy} onChange={e => setCcy(e.target.value)} placeholder="USD" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Foreign amt</label>
            <input type="number" value={foreign} onChange={e => setForeign(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">INR received</label>
            <input type="number" value={inrReceived} onChange={e => setInrReceived(e.target.value)} placeholder="825000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Ref rate (₹/unit)</label>
            <input type="number" value={refRate} onChange={e => setRefRate(e.target.value)} placeholder="83.10" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Conversions logged", value: `${rows.length}`, color: "text-blue-400" },
              { label: "Total spread cost", value: formatCurrency(Math.round(totalCost)), color: totalCost > 0 ? "text-red-400" : "text-green-400" },
              { label: "Avg spread", value: `${(rows.reduce((s, r) => s + r.spreadPct, 0) / rows.length).toFixed(2)}%`, color: "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Date", "Ccy", "Foreign", "Bank rate", "Ref rate", "Spread", "Cost", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.date}</td>
                      <td className="px-4 py-2.5 font-medium">{r.ccy}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatAmount(r.foreign)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.bankRate.toFixed(4)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.refRate.toFixed(4)}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${r.spreadPct > 1 ? "text-red-400 font-semibold" : ""}`}>{r.spreadPaise.toFixed(1)}p ({r.spreadPct.toFixed(2)}%)</td>
                      <td className={`px-4 py-2.5 tabular-nums ${r.cost > 0 ? "text-red-400" : "text-green-400"}`}>{formatCurrency(Math.round(r.cost))}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setDeals(deals.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">A spread above ~0.5–1% over the interbank rate is high for business volumes — negotiate a finer card/TT rate or compare banks before your next remittance.</p>
        </>
      )}
    </div>
  );
}

// ── 23. Duplicate-payment detector (scans store transactions) ────────────────────
function DuplicatePaymentDetector() {
  const { store } = useApp();
  const [windowDays, setWindowDays] = useState(7);

  const groups = useMemo(() => {
    const debits = store.transactions.filter(t => t.amount < 0);
    const byKey = new Map<string, typeof debits>();
    for (const t of debits) {
      const key = `${Math.round(Math.abs(t.amount))}|${(t.counterparty || "").trim().toLowerCase()}`;
      const arr = byKey.get(key) ?? [];
      arr.push(t);
      byKey.set(key, arr);
    }
    const suspects: { key: string; counterparty: string; amount: number; txns: typeof debits }[] = [];
    for (const [key, arr] of byKey.entries()) {
      if (arr.length < 2) continue;
      const sorted = [...arr].sort((a, b) => a.date.localeCompare(b.date));
      let close = false;
      for (let i = 1; i < sorted.length; i++) {
        const d0 = parseISO(sorted[i - 1].date), d1 = parseISO(sorted[i].date);
        if (!isNaN(d0.getTime()) && !isNaN(d1.getTime()) && Math.abs(differenceInCalendarDays(d1, d0)) <= windowDays) { close = true; break; }
      }
      if (close) suspects.push({ key, counterparty: arr[0].counterparty || "—", amount: Math.abs(arr[0].amount), txns: sorted });
    }
    return suspects.sort((a, b) => b.amount - a.amount);
  }, [store.transactions, windowDays]);

  const exposure = groups.reduce((s, g) => s + g.amount * (g.txns.length - 1), 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CopyCheck size={14} className="text-[var(--color-primary)]" /> Duplicate-Payment Detector</h3>
        <p className="text-xs text-[var(--color-muted)]">Flags debits with the same amount to the same counterparty within a short window — the classic signature of an invoice paid twice across banks or rails.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Match window: same amount &amp; payee within <strong className="text-[var(--color-text)]">{windowDays}</strong> day(s)</label>
          <input type="range" min={1} max={30} step={1} value={windowDays} onChange={e => setWindowDays(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Suspected duplicate groups", value: `${groups.length}`, color: groups.length ? "text-red-400" : "text-green-400" },
          { label: "Potential over-payment", value: formatCurrency(Math.round(exposure)), color: exposure > 0 ? "text-red-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {groups.length === 0 ? (
        <EmptyHint text="No suspected duplicate payments in the current window. Widen the window or import more transactions to scan." />
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.key} className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                <p className="text-sm font-semibold">{g.counterparty} · {formatCurrency(g.amount)} <span className="text-[var(--color-muted)] font-normal">× {g.txns.length}</span></p>
                <span className="text-[10px] px-2 py-0.5 rounded-full border bg-red-950/30 text-red-400 border-red-800/40 font-medium">possible duplicate</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {g.txns.map(t => (
                  <div key={t.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="text-xs font-medium truncate">{t.description}</p><p className="text-[10px] text-[var(--color-muted)]">{t.date}</p></div>
                    <span className="text-xs tabular-nums font-semibold text-red-400">{formatCurrency(t.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Some repeats are legitimate (EMIs, identical recurring vendor bills). Confirm each group against the invoice/UTR before treating it as a double payment.</p>
    </div>
  );
}

// ── 24. Counterparty payable-receivable netting ──────────────────────────────────
type NetParty = { id: string; name: string; receivable: number; payable: number };
function CounterpartyNetting() {
  const [parties, setParties] = useFeatureState<NetParty[]>("bank-netting-parties", []);
  const [name, setName] = useState("");
  const [receivable, setReceivable] = useState("");
  const [payable, setPayable] = useState("");

  const add = () => {
    const r = parseFloat(receivable) || 0, p = parseFloat(payable) || 0;
    if (!name.trim() || (r <= 0 && p <= 0)) { toast.error("Enter a name and at least one amount"); return; }
    setParties([...parties, { id: crypto.randomUUID(), name: name.trim(), receivable: r, payable: p }]);
    setName(""); setReceivable(""); setPayable("");
    toast.success("Counterparty added");
  };

  const rows = useMemo(() => parties.map(p => ({ ...p, net: p.receivable - p.payable })), [parties]);
  const grossSettle = parties.reduce((s, p) => s + p.receivable + p.payable, 0);
  const netSettle = rows.reduce((s, r) => s + Math.abs(r.net), 0);
  const saved = grossSettle - netSettle;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ArrowLeftRight size={14} className="text-[var(--color-primary)]" /> Counterparty Netting</h3>
        <p className="text-xs text-[var(--color-muted)]">When a party is both your customer and your vendor, settle only the net difference instead of moving cash both ways. Enter what you owe and are owed per party.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Counterparty</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">They owe you (₹)</label>
            <input type="number" value={receivable} onChange={e => setReceivable(e.target.value)} placeholder="120000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">You owe them (₹)</label>
            <input type="number" value={payable} onChange={e => setPayable(e.target.value)} placeholder="80000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Gross to settle", value: formatCurrency(Math.round(grossSettle)), color: "text-[var(--color-text)]" },
              { label: "Net to settle", value: formatCurrency(Math.round(netSettle)), color: "text-blue-400" },
              { label: "Cash movement saved", value: formatCurrency(Math.round(saved)), color: saved > 0 ? "text-green-400" : "text-[var(--color-muted)]" },
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
                <thead className="border-b border-[var(--color-border)]"><tr>{["Counterparty", "They owe", "You owe", "Net position", "Action", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(r.receivable)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(r.payable)}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(r.net)}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.net > 0 ? "Collect net" : r.net < 0 ? "Pay net" : "Square-off"}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setParties(parties.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {saved > 0 && (
            <Callout tone="ok" icon={CheckCircle2}>
              Netting cuts cash movement by {formatCurrency(Math.round(saved))} — fewer transfers, lower fees and float retained. Agree a netting statement with each party before adjusting their ledger.
            </Callout>
          )}
        </>
      )}
    </div>
  );
}

// ── 25. Interest-certificate tracker (FD/loan interest certificates) ─────────────
type IntCert = { id: string; bank: string; type: "fd" | "loan" | "savings" | "od"; fy: string; amount: number; received: boolean };
function InterestCertificateTracker() {
  const [certs, setCerts] = useFeatureState<IntCert[]>("bank-interest-certs", []);
  const [bank, setBank] = useState("");
  const [type, setType] = useState<IntCert["type"]>("fd");
  const [fy, setFy] = useState("2025-26");
  const [amount, setAmount] = useState("");

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (!bank.trim()) { toast.error("Enter the bank name"); return; }
    setCerts([...certs, { id: crypto.randomUUID(), bank: bank.trim(), type, fy: fy.trim(), amount: amt, received: false }]);
    setBank(""); setAmount("");
    toast.success("Certificate tracked");
  };

  const pending = certs.filter(c => !c.received);
  const interestIncome = certs.filter(c => c.type === "fd" || c.type === "savings").reduce((s, c) => s + c.amount, 0);
  const interestPaid = certs.filter(c => c.type === "loan" || c.type === "od").reduce((s, c) => s + c.amount, 0);
  const TYPE_LABEL: Record<IntCert["type"], string> = { fd: "FD interest earned", savings: "Savings interest earned", loan: "Loan interest paid", od: "OD/CC interest paid" };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Award size={14} className="text-[var(--color-primary)]" /> Interest-Certificate Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">At year-end you need interest certificates from every bank — FD/savings interest (taxable income, TDS credit) and loan/OD interest (deductible). Track which are still pending.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Bank</label>
            <input value={bank} onChange={e => setBank(e.target.value)} placeholder="HDFC Bank" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as IntCert["type"])} className={INP}>
              <option value="fd">FD interest</option>
              <option value="savings">Savings interest</option>
              <option value="loan">Loan interest</option>
              <option value="od">OD/CC interest</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">FY</label>
            <input value={fy} onChange={e => setFy(e.target.value)} placeholder="2025-26" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="45000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {certs.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pending certificates", value: `${pending.length}`, color: pending.length ? "text-yellow-400" : "text-green-400" },
              { label: "Interest income (taxable)", value: formatAmount(interestIncome), color: "text-green-400" },
              { label: "Interest paid (deductible)", value: formatAmount(interestPaid), color: "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Bank", "Type", "FY", "Amount", "Status", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {certs.map(c => (
                    <tr key={c.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{c.bank}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{TYPE_LABEL[c.type]}</td>
                      <td className="px-4 py-2.5 text-xs">{c.fy}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${c.type === "loan" || c.type === "od" ? "text-red-400" : "text-green-400"}`}>{formatCurrency(c.amount)}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setCerts(certs.map(x => x.id === c.id ? { ...x, received: !x.received } : x))}
                          className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${c.received ? "bg-green-950/30 text-green-400 border-green-800/40" : "bg-yellow-950/30 text-yellow-400 border-yellow-800/40"}`}>
                          {c.received ? "Received" : "Pending"}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setCerts(certs.filter(x => x.id !== c.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {pending.length > 0 && (
            <Callout tone="warn" icon={AlertTriangle}>
              {pending.length} interest certificate(s) still to collect. Request them before filing — FD/savings interest must be declared and the TDS claimed; loan/OD interest reduces your taxable profit.
            </Callout>
          )}
        </>
      )}
    </div>
  );
}

// ── 26. Current-account opening document checklist ────────────────────────────────
type DocItem = { key: string; label: string; note: string };
const ENTITY_DOCS: Record<string, DocItem[]> = {
  proprietorship: [
    { key: "pan", label: "Proprietor PAN card", note: "Mandatory KYC" },
    { key: "aadhaar", label: "Proprietor Aadhaar / address proof", note: "Officially valid document" },
    { key: "gst", label: "GST registration certificate", note: "Proof of business" },
    { key: "shop-act", label: "Shop & Establishment / Udyam (MSME) certificate", note: "Activity proof #2" },
    { key: "photo", label: "Passport-size photographs", note: "Of the proprietor" },
    { key: "address", label: "Business address proof (utility bill / rent agreement)", note: "Not older than 2 months" },
  ],
  partnership: [
    { key: "deed", label: "Partnership deed", note: "Registered/notarised" },
    { key: "firm-pan", label: "Firm PAN card", note: "Mandatory KYC" },
    { key: "partner-kyc", label: "PAN + Aadhaar of all partners", note: "KYC of each partner" },
    { key: "gst", label: "GST registration certificate", note: "Proof of business" },
    { key: "resolution", label: "Authorisation letter / resolution to open account", note: "Signed by all partners" },
    { key: "address", label: "Business address proof", note: "Utility bill / rent agreement" },
  ],
  company: [
    { key: "coi", label: "Certificate of Incorporation", note: "From MCA" },
    { key: "moa", label: "MoA & AoA", note: "Charter documents" },
    { key: "company-pan", label: "Company PAN card", note: "Mandatory KYC" },
    { key: "board-res", label: "Board resolution to open account", note: "Naming signatories" },
    { key: "director-kyc", label: "PAN + Aadhaar of directors & signatories", note: "KYC of each" },
    { key: "gst", label: "GST registration certificate", note: "Proof of business" },
    { key: "address", label: "Registered-office address proof", note: "Utility bill / rent agreement" },
  ],
};
function AccountOpeningChecklist() {
  const [entityType, setEntityType] = useState<keyof typeof ENTITY_DOCS>("proprietorship");
  const [done, setDone] = useFeatureState<Record<string, boolean>>("bank-acopen-checklist", {});

  const docs = ENTITY_DOCS[entityType];
  const completed = docs.filter(d => done[`${entityType}:${d.key}`]).length;
  const pct = docs.length ? Math.round((completed / docs.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FolderCheck size={14} className="text-[var(--color-primary)]" /> Current-Account Opening Checklist</h3>
        <p className="text-xs text-[var(--color-muted)]">Banks reject account-opening forms over missing KYC. Pick your entity type and tick documents as you gather them — the list follows RBI KYC norms for business accounts.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Entity type</label>
          <select value={entityType} onChange={e => setEntityType(e.target.value as keyof typeof ENTITY_DOCS)} className={INP}>
            <option value="proprietorship">Sole proprietorship</option>
            <option value="partnership">Partnership / LLP</option>
            <option value="company">Private / Public company</option>
          </select>
        </div>
      </div>

      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">{completed} of {docs.length} documents ready</p>
          <span className={`text-sm font-bold tabular-nums ${pct === 100 ? "text-green-400" : "text-yellow-400"}`}>{pct}%</span>
        </div>
        <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden mb-4"><div className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-[var(--color-primary)]"}`} style={{ width: `${pct}%` }} /></div>
        <div className="divide-y divide-[var(--color-border)]">
          {docs.map(d => {
            const id = `${entityType}:${d.key}`;
            const checked = !!done[id];
            return (
              <label key={d.key} className="flex items-start gap-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => setDone({ ...done, [id]: !checked })} className="mt-0.5 accent-[var(--color-primary)]" />
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${checked ? "line-through text-[var(--color-muted)]" : ""}`}>{d.label}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{d.note}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {pct === 100 ? (
        <Callout tone="ok" icon={CheckCircle2}>All documents ready — book a branch appointment or start the online onboarding. Carry originals for verification.</Callout>
      ) : (
        <p className="text-[10px] text-[var(--color-muted)]">Requirements vary slightly by bank; some also ask for a cancelled cheque of an existing account or trade licences specific to your activity.</p>
      )}
    </div>
  );
}

// ── 27. Cash runway / burn-rate meter (live transactions) ─────────────────────────
function CashRunwayMeter() {
  const { store } = useApp();
  const cash = store.bankAccounts.reduce((s, a) => s + a.balance, 0);
  const [months, setMonths] = useState(3);

  const stats = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    const recent = store.transactions.filter(t => {
      const d = parseISO(t.date);
      return !isNaN(d.getTime()) && d >= cutoff && d <= now;
    });
    const inflow = recent.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const outflow = recent.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const netBurn = (outflow - inflow) / months; // positive = burning cash
    const grossBurn = outflow / months;
    return { inflow, outflow, netBurn, grossBurn, count: recent.length };
  }, [store.transactions, months]);

  const runwayMonths = stats.netBurn > 0 ? cash / stats.netBurn : Infinity;
  const runwayDays = runwayMonths === Infinity ? Infinity : Math.round(runwayMonths * 30);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Cash Runway &amp; Burn Rate</h3>
        <p className="text-xs text-[var(--color-muted)]">How long does your cash last at the current pace? We take net burn (outflows minus inflows) over a recent window and divide your bank balance by it.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Burn measured over the last <strong className="text-[var(--color-text)]">{months}</strong> month(s)</label>
          <input type="range" min={1} max={12} step={1} value={months} onChange={e => setMonths(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Cash on hand", value: formatCurrency(cash), color: "text-[var(--color-text)]" },
          { label: "Net monthly burn", value: stats.netBurn > 0 ? formatCurrency(Math.round(stats.netBurn)) : "Cash-positive", color: stats.netBurn > 0 ? "text-red-400" : "text-green-400" },
          { label: "Gross monthly spend", value: formatCurrency(Math.round(stats.grossBurn)), color: "text-[var(--color-muted)]" },
          { label: "Runway", value: runwayMonths === Infinity ? "∞" : `${runwayMonths.toFixed(1)} mo`, color: runwayMonths === Infinity ? "text-green-400" : runwayMonths < 3 ? "text-red-400" : runwayMonths < 6 ? "text-yellow-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {stats.count === 0 ? (
        <EmptyHint text="No transactions in the selected window to compute burn. Widen the window or import recent transactions." />
      ) : runwayMonths === Infinity ? (
        <Callout tone="ok" icon={CheckCircle2}>You are cash-flow positive over this window — inflows cover outflows, so your runway is not shrinking. Consider sweeping the surplus to earn yield.</Callout>
      ) : (
        <Callout tone={runwayMonths < 3 ? "warn" : "ok"} icon={runwayMonths < 3 ? AlertTriangle : CheckCircle2}>
          At the current net burn of {formatCurrency(Math.round(stats.netBurn))}/month, your cash lasts about {runwayMonths.toFixed(1)} months ({runwayDays === Infinity ? "—" : `${runwayDays} days`}).
          {runwayMonths < 3 ? " That is tight — accelerate collections, trim discretionary spend or arrange a line of credit now." : " Keep an eye on large upcoming debits that could shorten this."}
        </Callout>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Burn is an average over the window and treats one-off items the same as recurring ones; exclude exceptional inflows/outflows for a truer picture.</p>
    </div>
  );
}

// ── shared little components ──────────────────────────────────────────────────────
function EmptyHint({ text }: { text: string }) {
  return (
    <div className={`${CARD} border-dashed p-10 text-center`}>
      <Wallet size={22} className="mx-auto text-[var(--color-muted)] mb-3" />
      <p className="text-xs text-[var(--color-muted)] max-w-md mx-auto">{text}</p>
    </div>
  );
}

function Callout({ tone, icon: Icon, children }: { tone: "ok" | "warn"; icon: typeof CheckCircle2; children: ReactNode }) {
  const cls = tone === "ok" ? "border-green-800/40 bg-green-950/20 text-green-400" : "border-orange-800/40 bg-orange-950/20 text-orange-400";
  return (
    <div className={`rounded-lg p-4 border ${cls}`}>
      <p className="text-sm font-medium flex items-start gap-2"><Icon size={14} className="shrink-0 mt-0.5" /> <span>{children}</span></p>
    </div>
  );
}
