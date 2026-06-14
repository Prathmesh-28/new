import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  Landmark, Wallet, GitCompareArrows, Hash, Receipt, Route,
  FileCheck2, ShieldAlert, AlertTriangle, Plus, CheckCircle2, ArrowRight,
  Banknote, Coins, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays, parseISO } from "date-fns";

// ── shared styles (mirrors TaxPage/DebtPage input + card classes) ────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type Tab =
  | "overview" | "balances" | "reconcile" | "cash-position" | "sweep"
  | "virtual-accounts" | "fees" | "rail" | "cheques" | "charge-recovery" | "idle-alert";

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
