import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { computeFinancialSnapshot, gstLatePenalty } from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { CalendarCheck, AlertTriangle, ArrowRight, ShieldCheck, FileText, Plus, X } from "lucide-react";
import { format, addMonths, setDate, isBefore, differenceInDays } from "date-fns";

interface ComplianceEvent {
  date: Date;
  label: string;
  kind: "gst" | "tds" | "advance_tax" | "payroll" | "obligation" | "roc";
  amount: number | null;
  path: string;
  note: string;
}

const KIND_STYLE: Record<ComplianceEvent["kind"], { chip: string; label: string }> = {
  gst:         { chip: "bg-blue-900/30 text-blue-400 border-blue-800/40",     label: "GST" },
  tds:         { chip: "bg-purple-900/30 text-purple-400 border-purple-800/40", label: "TDS" },
  advance_tax: { chip: "bg-orange-900/30 text-orange-400 border-orange-800/40", label: "Advance Tax" },
  payroll:     { chip: "bg-green-900/30 text-green-400 border-green-800/40",  label: "PF / ESI" },
  obligation:  { chip: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40", label: "Obligation" },
  roc:         { chip: "bg-pink-900/30 text-pink-400 border-pink-800/40",     label: "ROC / MCA" },
};

export default function CompliancePage() {
  const { store } = useApp();
  const navigate = useNavigate();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const [lateDays, setLateDays] = useState(15);

  type Contract = { id: string; name: string; party: string; kind: string; expiry: string; value: number; notes: string };
  const [contracts, setContracts]     = useState<Contract[]>([]);
  const [showContractForm, setShowContractForm] = useState(false);
  const [cName,    setCName]    = useState("");
  const [cParty,   setCParty]   = useState("");
  const [cKind,    setCKind]    = useState("Vendor");
  const [cExpiry,  setCExpiry]  = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split("T")[0]; });
  const [cValue,   setCValue]   = useState("");
  const [cNotes,   setCNotes]   = useState("");

  const addContract = () => {
    if (!cName || !cExpiry) return;
    setContracts(prev => [...prev, { id: Math.random().toString(36).slice(2), name: cName, party: cParty, kind: cKind, expiry: cExpiry, value: parseFloat(cValue) || 0, notes: cNotes }]);
    setCName(""); setCParty(""); setCKind("Vendor"); setCValue(""); setCNotes("");
    setShowContractForm(false);
  };

  const hasPayroll = store.transactions.some(t => t.category === "payroll");

  const events = useMemo<ComplianceEvent[]>(() => {
    const now = new Date();
    const out: ComplianceEvent[] = [];

    for (let offset = 0; offset < 6; offset++) {
      const base = addMonths(now, offset);
      const y = base.getFullYear(), m = base.getMonth();
      const push = (day: number, label: string, kind: ComplianceEvent["kind"], amount: number | null, path: string, note: string) => {
        const d = setDate(new Date(y, m, 1), day);
        if (!isBefore(d, now)) out.push({ date: d, label, kind, amount, path, note });
      };

      push(7,  "TDS deposit",  "tds", null, "/tax", "Tax deducted last month must reach the government");
      if (store.firm.gstRegistered ?? true) {
        push(11, "GSTR-1 filing",  "gst", null, "/gst", "Outward supplies return for last month");
        push(20, "GSTR-3B + payment", "gst", offset === 0 ? snap.gstThisMonth.netPayable : null, "/gst", "Summary return — net GST is payable with this");
      }
      if (hasPayroll) push(15, "PF & ESI deposit", "payroll", null, "/payroll", "Statutory payroll contributions for last month");
      if ([2, 5, 8, 11].includes(m)) {
        const inst = snap.advanceTax.find(a => new Date(a.dueDate).getMonth() === m);
        push(15, "Advance tax instalment", "advance_tax", inst?.installment ?? null, "/tax", inst ? `Cumulative ${inst.cumulativePct}% of estimated annual tax` : "Quarterly instalment");
      }
    }

    // ROC / MCA annual filings (fixed calendar, not month-rolling)
    const year = now.getFullYear();
    const rocDates: { day: number; month: number; label: string; note: string }[] = [
      { day: 30, month: 9,  label: "MGT-7 / MGT-7A — Annual Return", note: "File within 60 days of AGM (default: Sep 30). Private companies with turnover ≤₹2 crore use MGT-7A." },
      { day: 30, month: 9,  label: "AOC-4 / AOC-4 XBRL — Financial Statements", note: "File audited financials within 30 days of AGM (default: Sep 30 for Oct AGM deadline)." },
      { day: 30, month: 6,  label: "Form 11 — LLP Annual Return", note: "Annual return for LLPs — due June 30 every year." },
      { day: 30, month: 9,  label: "Form 8 — LLP Statement of Accounts", note: "LLP statement of accounts and solvency — due Oct 30 (offset 30 days after Oct 31 FY end)." },
      { day: 31, month: 3,  label: "DIR-3 KYC — Director KYC", note: "Annual KYC for every DIN holder — due March 31." },
      { day: 30, month: 11, label: "MSME Form-1 — Outstanding Payments Disclosure", note: "Half-yearly return: payments outstanding >45 days to MSME vendors (Apr–Sep due Oct 31, Oct–Mar due Apr 30)." },
    ];
    rocDates.forEach(({ day, month, label, note }) => {
      const d = new Date(year, month, day);
      if (!isBefore(d, now)) out.push({ date: d, label, kind: "roc", amount: null, path: "/compliance", note });
      // Also add next year's if it's already past
      else {
        const next = new Date(year + 1, month, day);
        out.push({ date: next, label, kind: "roc", amount: null, path: "/compliance", note });
      }
    });

    // User-defined obligations
    store.obligations.forEach(o => {
      const d = new Date(o.dueDate);
      if (differenceInDays(d, new Date()) >= -90) {
        out.push({ date: d, label: o.name, kind: "obligation", amount: o.amount, path: "/forecast", note: `${o.type} obligation` });
      }
    });

    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [store.obligations, store.firm.gstRegistered, hasPayroll, snap.gstThisMonth.netPayable, snap.advanceTax]);

  const next30 = events.filter(e => differenceInDays(e.date, new Date()) <= 30);
  const cashDue30 = next30.reduce((s, e) => s + (e.amount ?? 0), 0);
  const overdueObligations = events.filter(e => isBefore(e.date, new Date()));

  const penalty = gstLatePenalty(snap.gstThisMonth.netPayable, lateDays);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><CalendarCheck size={18} className="text-[var(--color-primary)]" /> Compliance Calendar</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Every statutory date — GST, TDS, advance tax, PF/ESI — derived from your firm profile and transactions, with cash amounts attached.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Deadlines · next 30 days", value: `${next30.length}`, sub: "Statutory + your own obligations", color: "text-[var(--color-text)]" },
          { label: "Cash due · next 30 days", value: formatAmount(cashDue30), sub: "Known amounts only", color: cashDue30 > snap.cash ? "text-red-400" : "text-yellow-400" },
          { label: "GST payable this month", value: formatAmount(snap.gstThisMonth.netPayable), sub: `Output ${formatAmount(snap.gstThisMonth.outputTax)} − ITC ${formatAmount(snap.gstThisMonth.inputCredit)}`, color: "text-blue-400" },
          { label: "Est. annual tax", value: formatAmount(snap.advanceTax[3]?.cumulativeTax ?? 0), sub: "25% on estimated profit", color: "text-orange-400" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {!store.firm.gstRegistered && (
        <div className="bg-yellow-950/30 border border-yellow-800/40 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm flex items-center gap-3">
            <ShieldCheck size={15} className="text-yellow-400 shrink-0" />
            Your firm isn't marked GST-registered. Above ₹40L turnover (₹20L for services) registration is mandatory.
          </p>
          <button onClick={() => navigate("/settings")} className="text-xs text-yellow-300 border border-yellow-800/40 bg-yellow-900/30 px-3 py-1.5 rounded-lg whitespace-nowrap hover:bg-yellow-900/50">
            Update firm profile →
          </button>
        </div>
      )}

      {overdueObligations.length > 0 && (
        <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={15} className="text-red-400 shrink-0" />
          <p className="text-sm">{overdueObligations.length} obligation(s) past due — interest and late fees are accruing.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar list */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden lg:col-span-2">
          <div className="px-5 py-3 border-b border-[var(--color-border)]">
            <p className="text-sm font-semibold">Next 6 Months</p>
          </div>
          <div className="divide-y divide-[var(--color-border)] max-h-[460px] overflow-y-auto">
            {events.length === 0 && <p className="p-6 text-sm text-[var(--color-muted)] text-center">No upcoming deadlines.</p>}
            {events.map((e, i) => {
              const days = differenceInDays(e.date, new Date());
              const urgent = days <= 7;
              const s = KIND_STYLE[e.kind];
              return (
                <button key={i} onClick={() => navigate(e.path)} className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/2 transition-colors">
                  <div className="w-12 text-center shrink-0">
                    <p className={`text-lg font-bold leading-none ${urgent ? "text-red-400" : "text-[var(--color-text)]"}`}>{format(e.date, "d")}</p>
                    <p className="text-[10px] text-[var(--color-muted)] uppercase">{format(e.date, "MMM")}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{e.label}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${s.chip}`}>{s.label}</span>
                    </div>
                    <p className="text-[10px] text-[var(--color-muted)] truncate">{e.note}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {e.amount !== null && e.amount > 0 && <p className="text-sm font-semibold tabular-nums">{formatAmount(e.amount)}</p>}
                    <p className={`text-[10px] ${urgent ? "text-red-400 font-semibold" : "text-[var(--color-muted)]"}`}>
                      {days < 0 ? `${-days}d overdue` : days === 0 ? "Today" : `in ${days}d`}
                    </p>
                  </div>
                  <ArrowRight size={12} className="text-[var(--color-muted)] shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {/* Advance tax */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Advance Tax (FY)</p>
              <button onClick={() => navigate("/tax")} className="text-[10px] text-[var(--color-primary)] hover:underline">Tax Autopilot →</button>
            </div>
            <div className="space-y-2.5">
              {snap.advanceTax.map(a => (
                <div key={a.label} className="flex items-center justify-between text-sm">
                  <div>
                    <span className={a.status === "paid_window" ? "text-[var(--color-muted)]" : ""}>{a.label}</span>
                    <span className="text-[10px] text-[var(--color-muted)] ml-2">{a.cumulativePct}% cum.</span>
                  </div>
                  <span className={`tabular-nums font-semibold ${a.status === "paid_window" ? "text-[var(--color-muted)]" : "text-orange-400"}`}>
                    {formatAmount(a.installment)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--color-muted)] mt-3 pt-3 border-t border-[var(--color-border)]">
              Based on estimated annual profit of {formatAmount(snap.estAnnualProfit)} at 25% corporate rate. Missing an instalment costs 1%/month interest (§234C).
            </p>
          </div>

          {/* Penalty estimator */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-1">Cost of Filing Late</p>
            <p className="text-xs text-[var(--color-muted)] mb-3">If this month's GSTR-3B slips by <strong className="text-[var(--color-text)]">{lateDays} days</strong>:</p>
            <input type="range" min={1} max={90} value={lateDays} onChange={e => setLateDays(Number(e.target.value))} className="w-full accent-[var(--color-primary)] mb-3" />
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Late fee (₹50/day)</span><span className="tabular-nums">{formatCurrency(penalty.lateFee)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Interest @18% p.a.</span><span className="tabular-nums">{formatCurrency(penalty.interest)}</span></div>
              <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
                <span className="font-semibold">Total penalty</span>
                <span className="font-bold tabular-nums text-red-400">{formatCurrency(penalty.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contract Expiry Tracker */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Contract Expiry Tracker</p>
            {contracts.filter(c => differenceInDays(new Date(c.expiry), new Date()) <= 30 && differenceInDays(new Date(c.expiry), new Date()) >= 0).length > 0 && (
              <span className="text-[9px] bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full font-semibold">
                {contracts.filter(c => differenceInDays(new Date(c.expiry), new Date()) <= 30 && differenceInDays(new Date(c.expiry), new Date()) >= 0).length} expiring soon
              </span>
            )}
          </div>
          <button onClick={() => setShowContractForm(f => !f)}
            className="flex items-center gap-1 text-xs text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2.5 py-1.5 rounded-lg hover:bg-[var(--color-primary)]/10">
            <Plus size={11} /> Add contract
          </button>
        </div>

        {showContractForm && (
          <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              <input value={cName} onChange={e=>setCName(e.target.value)} placeholder="Contract name *"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              <input value={cParty} onChange={e=>setCParty(e.target.value)} placeholder="Counterparty"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              <select value={cKind} onChange={e=>setCKind(e.target.value)}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
                {["Vendor","Customer","Employment","Lease/Rent","Service","NDA","Loan","Insurance","Other"].map(k => <option key={k}>{k}</option>)}
              </select>
              <input type="date" value={cExpiry} onChange={e=>setCExpiry(e.target.value)}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              <input type="number" value={cValue} onChange={e=>setCValue(e.target.value)} placeholder="Contract value (₹)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              <input value={cNotes} onChange={e=>setCNotes(e.target.value)} placeholder="Notes (optional)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div className="flex gap-2">
              <button onClick={addContract} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
              <button onClick={() => setShowContractForm(false)} className="text-xs text-[var(--color-muted)] px-4 py-2 rounded-lg border border-[var(--color-border)] hover:text-[var(--color-text)]">Cancel</button>
            </div>
          </div>
        )}

        {contracts.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted)] text-center">No contracts tracked yet. Add vendor agreements, leases, employment contracts, or NDAs to get expiry alerts.</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {contracts
              .slice()
              .sort((a,b) => a.expiry.localeCompare(b.expiry))
              .map(c => {
                const daysLeft = differenceInDays(new Date(c.expiry), new Date());
                const expired  = daysLeft < 0;
                const urgent   = !expired && daysLeft <= 30;
                const warning  = !expired && daysLeft <= 90;
                return (
                  <div key={c.id} className={`flex items-center gap-4 px-5 py-3.5 ${urgent ? "bg-red-950/10" : warning ? "bg-orange-950/10" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{c.name}</p>
                        <span className="text-[9px] bg-[var(--color-bg)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full text-[var(--color-muted)]">{c.kind}</span>
                        {expired && <span className="text-[9px] bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full font-semibold">Expired</span>}
                        {urgent  && <span className="text-[9px] bg-orange-900/30 text-orange-400 border border-orange-800/40 px-1.5 py-0.5 rounded-full font-semibold">Expiring soon</span>}
                      </div>
                      <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.party && `${c.party} · `}Expires {c.expiry}{c.value > 0 ? ` · ${formatCurrency(c.value)}` : ""}{c.notes ? ` · ${c.notes}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${expired ? "text-red-400" : urgent ? "text-orange-400" : warning ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>
                        {expired ? `${-daysLeft}d overdue` : `${daysLeft}d left`}
                      </p>
                    </div>
                    <button onClick={() => setContracts(prev => prev.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
