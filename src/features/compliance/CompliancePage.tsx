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

      {/* MSME / Udyam Checker */}
      <MsmeChecker />

      {/* Labour Law Checklist */}
      <LabourLawChecklist employeeCount={store.transactions.filter(t=>t.category==="payroll").length > 0 ? 15 : 0} />

      {/* Insurance Calendar */}
      <InsuranceCalendar />
    </div>
  );
}

function MsmeChecker() {
  const [plantMachinery, setPlantMachinery] = useState("");
  const [annualTurnover, setAnnualTurnover] = useState("");
  const [udyamNo, setUdyamNo] = useState("");
  const [registered, setRegistered] = useState(false);

  const pm = parseFloat(plantMachinery) || 0;
  const at = parseFloat(annualTurnover) || 0;

  type MsmeCategory = "Micro" | "Small" | "Medium" | "Not MSME";
  const getCategory = (): MsmeCategory => {
    if (pm <= 1000000 && at <= 5000000)   return "Micro";
    if (pm <= 10000000 && at <= 50000000) return "Small";
    if (pm <= 50000000 && at <= 250000000) return "Medium";
    return "Not MSME";
  };
  const category = getCategory();
  const isMsme = category !== "Not MSME";

  const CATEGORY_COLOR: Record<MsmeCategory, string> = {
    Micro: "text-green-400", Small: "text-blue-400", Medium: "text-yellow-400", "Not MSME": "text-red-400",
  };
  const BENEFITS = [
    "Priority lending under PSL (Priority Sector Lending)",
    "Collateral-free loans up to ₹10L (CGTMSE scheme)",
    "Interest subvention schemes (ECLGS, etc.)",
    "45-day payment protection under MSMED Act Sec 15-23",
    "1% stamp duty exemption (state-specific)",
    "Subsidy on ISO certification / barcode / patent",
    "GeM portal registration preference",
    "Delayed payment: 3× bank rate interest on default",
  ];

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc  = formatCurrency;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
        <ShieldCheck size={14} className="text-[var(--color-primary)]" />
        <p className="text-sm font-semibold">MSME / Udyam Registration Checker</p>
        {registered && udyamNo && (
          <span className="text-xs bg-green-950/30 text-green-400 font-semibold px-2 py-0.5 rounded-full">Registered: {udyamNo}</span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Plant & Machinery Investment (₹)</label>
            <input type="number" value={plantMachinery} onChange={e => setPlantMachinery(e.target.value)} placeholder="e.g. 500000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual Turnover (₹)</label>
            <input type="number" value={annualTurnover} onChange={e => setAnnualTurnover(e.target.value)} placeholder="e.g. 3000000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Udyam No. (if registered)</label>
            <input value={udyamNo} onChange={e => setUdyamNo(e.target.value)} placeholder="UDYAM-XX-00-0000000" className={inp} />
          </div>
          <div className="flex items-end">
            <button onClick={() => setRegistered(r => !r)}
              className={`w-full py-2 text-xs font-semibold rounded-lg border transition-colors ${registered ? "bg-green-950/30 text-green-400 border-green-800/40" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {registered ? "✓ Registered on Udyam Portal" : "Not Yet Registered"}
            </button>
          </div>
        </div>

        <div className={`rounded-lg p-4 border ${isMsme ? "border-[var(--color-primary)]/40 bg-[var(--color-accent)]" : "border-red-800/40 bg-red-950/20"}`}>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${CATEGORY_COLOR[category]}`}>{category}</span>
            {isMsme && (
              <div className="text-xs text-[var(--color-muted)]">
                <div>P&M: {fc(pm)} · Turnover: {fc(at)}</div>
                {!registered && <div className="text-yellow-400 mt-0.5">⚠ Not registered — register free at udyamregistration.gov.in</div>}
              </div>
            )}
            {!isMsme && <span className="text-xs text-red-400">Exceeds MSME thresholds. Not eligible for MSME benefits.</span>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Category","P&M Limit","Turnover Limit","Your Status"].map(h => (
                  <th key={h} className="text-left font-semibold text-[var(--color-muted)] px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                { cat: "Micro",  pm: 1000000,   at: 5000000   },
                { cat: "Small",  pm: 10000000,  at: 50000000  },
                { cat: "Medium", pm: 50000000,  at: 250000000 },
              ] as const).map(r => {
                const match = category === r.cat;
                return (
                  <tr key={r.cat} className={`border-b border-[var(--color-border)] last:border-0 ${match ? "bg-[var(--color-primary)]/5" : ""}`}>
                    <td className={`px-3 py-2.5 font-semibold ${CATEGORY_COLOR[r.cat]}`}>{r.cat}</td>
                    <td className="px-3 py-2.5">≤ {fc(r.pm)}</td>
                    <td className="px-3 py-2.5">≤ {fc(r.at)}</td>
                    <td className="px-3 py-2.5">{match ? <span className="font-bold text-[var(--color-primary)]">← You</span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isMsme && (
          <div>
            <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Benefits Available to MSME</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {BENEFITS.map(b => (
                <div key={b} className="flex items-start gap-2 text-xs text-[var(--color-muted)]">
                  <span className="text-green-400 mt-0.5 shrink-0">✓</span>{b}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LabourLawChecklist({ employeeCount }: { employeeCount: number }) {
  const [count, setCount] = useState(employeeCount > 0 ? employeeCount : 10);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  type Act = { id: string; name: string; threshold: number; desc: string; freq: string; risk: "high" | "medium" | "low" };

  const ACTS: Act[] = [
    { id: "pf",       name: "Employees' Provident Fund (EPF)",    threshold: 20, desc: "Mandatory PF @ 12% employee + 12% employer on wages up to ₹15K. Register on EPFO portal.",       freq: "Monthly",   risk: "high" },
    { id: "esi",      name: "Employees' State Insurance (ESI)",    threshold: 10, desc: "ESI @ 0.75% employee + 3.25% employer on wages up to ₹21K. File half-yearly return.",            freq: "Monthly",   risk: "high" },
    { id: "bonus",    name: "Payment of Bonus Act",                threshold: 20, desc: "Minimum 8.33% bonus on ₹7K ceiling (max 20%) to employees earning ≤₹21K/month.",               freq: "Annual",    risk: "high" },
    { id: "gratuity", name: "Payment of Gratuity Act",             threshold: 10, desc: "Gratuity of 15 days salary per year of service after 5 years. Fund or insure obligation.",      freq: "On exit",   risk: "medium" },
    { id: "minwage",  name: "Minimum Wages Act",                   threshold: 1,  desc: "Ensure all employees paid ≥ state minimum wage for their skill category. Revised periodically.", freq: "Ongoing",   risk: "high" },
    { id: "pt",       name: "Professional Tax",                    threshold: 1,  desc: "Deduct state PT from employee salary per applicable slab. Remit to state government.",          freq: "Monthly",   risk: "medium" },
    { id: "maternity",name: "Maternity Benefit Act",               threshold: 10, desc: "26 weeks paid maternity leave. Advance pay before leave, creche facilities if >50 employees.", freq: "As needed", risk: "medium" },
    { id: "shops",    name: "Shops & Establishments Act",          threshold: 1,  desc: "Register shop/office with labour department. Governs working hours, leave, holidays.",          freq: "Annual",    risk: "medium" },
    { id: "lwf",      name: "Labour Welfare Fund",                 threshold: 1,  desc: "State-specific contribution to LWF. Ranges from ₹3–₹60/employee per period.",                  freq: "Monthly",   risk: "low" },
    { id: "factories",name: "Factories Act",                       threshold: 10, desc: "Applicable if using power & ≥10 workers, or ≥20 workers without power. Safety compliance.",   freq: "Ongoing",   risk: "high" },
    { id: "contract", name: "Contract Labour (Regulation)",        threshold: 20, desc: "If engaging contract workers, obtain principal employer registration. Contractor needs licence.", freq: "Ongoing",  risk: "medium" },
    { id: "posh",     name: "POSH Act (Sexual Harassment)",        threshold: 10, desc: "Constitute Internal Complaints Committee. Display policy. Annual report to District Officer.",  freq: "Annual",    risk: "high" },
  ];

  const applicable = ACTS.filter(a => count >= a.threshold);
  const done        = applicable.filter(a => checked.has(a.id)).length;

  const RISK_STYLE: Record<Act["risk"], string> = {
    high:   "bg-red-900/30 text-red-400 border-red-800/40",
    medium: "bg-orange-900/30 text-orange-400 border-orange-800/40",
    low:    "bg-green-900/30 text-green-400 border-green-800/40",
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ShieldCheck size={14} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Labour Law Compliance Checklist</p>
          <span className={`text-xs font-semibold ${done === applicable.length ? "text-green-400" : "text-orange-400"}`}>{done}/{applicable.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-muted)]">Employees:</label>
          <input type="number" min={1} max={500} value={count} onChange={e => setCount(Number(e.target.value))}
            className="w-16 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]" />
        </div>
      </div>

      {applicable.length === 0 ? (
        <p className="p-6 text-sm text-[var(--color-muted)] text-center">Set your employee count above to see applicable labour laws.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {applicable.map(act => (
            <label key={act.id} className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-white/2 transition-colors">
              <input type="checkbox" checked={checked.has(act.id)} onChange={() => toggle(act.id)}
                className="mt-0.5 accent-[var(--color-primary)] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className={`text-sm font-medium ${checked.has(act.id) ? "line-through text-[var(--color-muted)]" : ""}`}>{act.name}</p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${RISK_STYLE[act.risk]}`}>{act.risk} risk</span>
                  <span className="text-[9px] bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">{act.freq}</span>
                </div>
                <p className="text-xs text-[var(--color-muted)]">{act.desc}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Applies from: {act.threshold} employee{act.threshold > 1 ? "s" : ""}</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {done === applicable.length && applicable.length > 0 && (
        <div className="px-5 py-3 bg-green-950/30 border-t border-green-800/40 text-sm text-green-400 flex items-center gap-2">
          <ShieldCheck size={14} /> All {applicable.length} applicable acts checked — review periodically as employee count grows.
        </div>
      )}
    </div>
  );
}

type InsurancePolicy = {
  id: string; name: string; type: string; insurer: string;
  premium: number; renewalDate: string; sumInsured: number; notes: string;
};

function InsuranceCalendar() {
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [showForm, setShowForm]  = useState(false);
  const [iName,  setIName]  = useState("");
  const [iType,  setIType]  = useState("Fire & Burglary");
  const [iInsurer, setIInsurer] = useState("");
  const [iPremium, setIPremium] = useState("");
  const [iRenewal, setIRenewal] = useState("");
  const [iSum,   setISum]   = useState("");
  const [iNotes, setINotes] = useState("");

  const TYPES = ["Fire & Burglary","Shopkeeper","Marine Cargo","Group Health","Group Personal Accident","Directors & Officers","Professional Indemnity","Vehicle Fleet","Workmen Compensation","Cyber Liability","Key Man","Other"];

  const addPolicy = () => {
    if (!iName || !iRenewal) return;
    setPolicies(prev => [...prev, { id: Math.random().toString(36).slice(2), name: iName, type: iType, insurer: iInsurer, premium: parseFloat(iPremium) || 0, renewalDate: iRenewal, sumInsured: parseFloat(iSum) || 0, notes: iNotes }]);
    setIName(""); setIInsurer(""); setIPremium(""); setIRenewal(""); setISum(""); setINotes("");
    setShowForm(false);
  };

  const today = new Date();
  const sorted = [...policies].sort((a, b) => new Date(a.renewalDate).getTime() - new Date(b.renewalDate).getTime());
  const totalPremium = policies.reduce((s, p) => s + p.premium, 0);
  const expiring30 = policies.filter(p => {
    const d = differenceInDays(new Date(p.renewalDate), today);
    return d >= 0 && d <= 30;
  });

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc  = formatCurrency;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Insurance Calendar</p>
          {expiring30.length > 0 && (
            <span className="text-xs bg-red-950/40 text-red-400 font-semibold px-2 py-0.5 rounded-full">
              {expiring30.length} renewing soon
            </span>
          )}
        </div>
        <button onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          <Plus size={11} /> Add policy
        </button>
      </div>

      {showForm && (
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-accent)]">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input value={iName}    onChange={e => setIName(e.target.value)}    placeholder="Policy name *" className={inp} />
            <select value={iType}   onChange={e => setIType(e.target.value)}    className={inp}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input value={iInsurer} onChange={e => setIInsurer(e.target.value)} placeholder="Insurer / broker" className={inp} />
            <input type="number" value={iPremium} onChange={e => setIPremium(e.target.value)} placeholder="Annual premium (₹)" className={inp} />
            <input type="number" value={iSum}    onChange={e => setISum(e.target.value)}    placeholder="Sum insured (₹)" className={inp} />
            <input type="date"   value={iRenewal} onChange={e => setIRenewal(e.target.value)} className={inp} />
            <input value={iNotes}  onChange={e => setINotes(e.target.value)}   placeholder="Notes (optional)" className={`${inp} md:col-span-3`} />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addPolicy} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-4 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
          </div>
        </div>
      )}

      {policies.length === 0 ? (
        <p className="p-6 text-sm text-[var(--color-muted)] text-center">No insurance policies tracked. Add fire, health, marine, vehicle or liability policies to get renewal alerts.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 p-4 border-b border-[var(--color-border)]">
            {[
              { label: "Policies",      value: policies.length.toString(),  color: "text-[var(--color-primary)]" },
              { label: "Annual Premium",value: fc(totalPremium),            color: "text-blue-400" },
              { label: "Renewing ≤30d", value: expiring30.length.toString(), color: expiring30.length > 0 ? "text-red-400" : "text-green-400" },
            ].map(c => (
              <div key={c.label} className="text-center">
                <p className="text-xs text-[var(--color-muted)]">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Policy","Type","Insurer","Premium","Sum Insured","Renewal","Status",""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => {
                  const daysLeft = differenceInDays(new Date(p.renewalDate), today);
                  const expired  = daysLeft < 0;
                  const urgent   = !expired && daysLeft <= 30;
                  const statusCls = expired ? "bg-red-950/30 text-red-400" : urgent ? "bg-yellow-950/30 text-yellow-400" : "bg-green-950/30 text-green-400";
                  const statusLabel = expired ? "Expired" : urgent ? `${daysLeft}d left` : "Active";
                  return (
                    <tr key={p.id} className={`border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)] ${expired ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3 font-semibold">{p.name}</td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{p.type}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">{p.insurer || "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{p.premium > 0 ? fc(p.premium) : "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{p.sumInsured > 0 ? fc(p.sumInsured) : "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{p.renewalDate}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setPolicies(prev => prev.filter(x => x.id !== p.id))} className="text-[var(--color-muted)] hover:text-red-400">
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
