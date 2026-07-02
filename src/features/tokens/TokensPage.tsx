import { useMemo, useState } from "react";
import { useFeatureState } from "@/hooks/useFeatureState";
import { useApp } from "@/context/AppContext";
import { useT } from "@/i18n";

import { formatCurrency } from "@/lib/utils";
import {
  Coins, Wallet, GitBranch, Lock, Layers, Boxes, ArrowLeftRight,
  CalendarClock, ClipboardCheck, BookOpen, PieChart, Plus, Copy,
  CheckCircle2, AlertTriangle, ArrowDownRight, ArrowUpRight, Trash2,
  Download, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Real-store helpers (local to this page; reads store.invoices / store.transactions) ──
type RealInvoiceOption = { id: string; number: string; customer: string; amount: number; dueDate: string; status: string };

/** Outstanding (pending/overdue) invoices from the shared store, for dropdown pickers. */
function useOutstandingInvoices(): RealInvoiceOption[] {
  const { store } = useApp();
  return useMemo(() => {
    try {
      const invs = store.invoices ?? [];
      return invs
        .filter(i => i.status === "pending" || i.status === "overdue")
        .map(i => ({
          id: i.id,
          number: i.invoiceNumber || i.id.slice(0, 8),
          customer: i.customer,
          amount: i.amount,
          dueDate: i.dueDate,
          status: i.status,
        }))
        .sort((a, b) => b.amount - a.amount);
    } catch {
      return [];
    }
  }, [store.invoices]);
}

/** Distinct counterparties derived from invoices (customers) and expense transactions (vendors). */
function useCounterparties(): string[] {
  const { store } = useApp();
  return useMemo(() => {
    try {
      const seen: Record<string, true> = {};
      const out: string[] = [];
      const push = (n?: string) => {
        const name = (n || "").trim();
        if (!name || seen[name.toLowerCase()]) return;
        seen[name.toLowerCase()] = true;
        out.push(name);
      };
      (store.invoices ?? []).forEach(i => push(i.customer));
      (store.transactions ?? []).forEach(t => { if (t.amount < 0) push(t.counterparty); });
      return out.sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }, [store.invoices, store.transactions]);
}

/** Client-side JSON download. */
function downloadJson(filename: string, data: unknown) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Designs exported");
  } catch {
    toast.error("Could not export designs");
  }
}

// ── shared styles (mirrors TaxPage / DebtPage input class) ───────────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

const TABS = [
  ["overview", "Overview", Coins, "tok.tabOverview"],
  ["erupee", "e-Rupee Ledger", Wallet, "tok.tabErupee"],
  ["rule", "Payment Rule Designer", GitBranch, "tok.tabRule"],
  ["escrow", "Escrow Designer", Lock, "tok.tabEscrow"],
  ["invoice", "Tokenized Invoice", Layers, "tok.tabInvoice"],
  ["registry", "Asset Registry", Boxes, "tok.tabRegistry"],
  ["atomic", "Atomic Settlement", ArrowLeftRight, "tok.tabAtomic"],
  ["disbursal", "Conditional Disbursal", CalendarClock, "tok.tabDisbursal"],
  ["captable", "Token Cap-Table", PieChart, "tok.tabCaptable"],
  ["readiness", "Settlement Readiness", ClipboardCheck, "tok.tabReadiness"],
  ["glossary", "Glossary", BookOpen, "tok.tabGlossary"],
] as const;

type TabId = (typeof TABS)[number][0];

export default function TokensPage() {
  const tr = useT();
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Coins size={18} className="text-[var(--color-primary)]" /> {tr("tok.title")}
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {tr("tok.subtitle")}
          </p>
        </div>
        <div className="flex gap-1 flex-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {TABS.map(([id, , Icon, labelKey]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{tr(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2 bg-[var(--color-accent)]/40 border border-[var(--color-border)]">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        <span>{tr("tok.honestNote")}</span>
      </div>

      {tab === "overview" && <Overview onPick={setTab} />}
      {tab === "erupee" && <ERupeeLedger />}
      {tab === "rule" && <RuleDesigner />}
      {tab === "escrow" && <EscrowDesigner />}
      {tab === "invoice" && <InvoiceTokenizer />}
      {tab === "registry" && <AssetRegistry />}
      {tab === "atomic" && <AtomicSettlement />}
      {tab === "disbursal" && <ConditionalDisbursal />}
      {tab === "captable" && <TokenCapTable />}
      {tab === "readiness" && <ReadinessChecklist />}
      {tab === "glossary" && <Glossary />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────────
function Overview({ onPick }: { onPick: (t: TabId) => void }) {
  const tr = useT();
  const cards: { id: TabId; title: string; desc: string; Icon: typeof Coins }[] = [
    { id: "erupee", title: tr("tok.ovErupeeTitle"), desc: tr("tok.ovErupeeDesc"), Icon: Wallet },
    { id: "rule", title: tr("tok.ovRuleTitle"), desc: tr("tok.ovRuleDesc"), Icon: GitBranch },
    { id: "escrow", title: tr("tok.ovEscrowTitle"), desc: tr("tok.ovEscrowDesc"), Icon: Lock },
    { id: "invoice", title: tr("tok.ovInvoiceTitle"), desc: tr("tok.ovInvoiceDesc"), Icon: Layers },
    { id: "registry", title: tr("tok.ovRegistryTitle"), desc: tr("tok.ovRegistryDesc"), Icon: Boxes },
    { id: "atomic", title: tr("tok.ovAtomicTitle"), desc: tr("tok.ovAtomicDesc"), Icon: ArrowLeftRight },
    { id: "disbursal", title: tr("tok.ovDisbursalTitle"), desc: tr("tok.ovDisbursalDesc"), Icon: CalendarClock },
    { id: "captable", title: tr("tok.ovCaptableTitle"), desc: tr("tok.ovCaptableDesc"), Icon: PieChart },
    { id: "readiness", title: tr("tok.ovReadinessTitle"), desc: tr("tok.ovReadinessDesc"), Icon: ClipboardCheck },
    { id: "glossary", title: tr("tok.ovGlossaryTitle"), desc: tr("tok.ovGlossaryDesc"), Icon: BookOpen },
  ];
  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1">{tr("tok.buildTodayHeading")}</h2>
        <p className="text-xs text-[var(--color-muted)]">
          {tr("tok.buildTodayBody")}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(c => (
          <button key={c.id} onClick={() => onPick(c.id)}
            className={`${CARD} p-4 text-left hover:border-[var(--color-primary)]/50 transition-colors group`}>
            <div className="flex items-center gap-2 mb-2">
              <c.Icon size={15} className="text-[var(--color-primary)]" />
              <p className="text-sm font-semibold group-hover:text-[var(--color-primary)]">{c.title}</p>
            </div>
            <p className="text-xs text-[var(--color-muted)]">{c.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── e-Rupee (CBDC) Ledger Tracker ─────────────────────────────────────────────────
type ERupeeEntry = { id: string; date: string; direction: "in" | "out"; amount: number; note: string };

function ERupeeLedger() {
  const tr = useT();
  const [opening, setOpening] = useFeatureState<number>("tok-erupee-opening", 0);
  const [entries, setEntries] = useFeatureState<ERupeeEntry[]>("tok-erupee-entries", []);
  const [openingInput, setOpeningInput] = useState("");
  const [dir, setDir] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    [entries],
  );
  const withRunning = useMemo(() => {
    let bal = opening;
    return sorted.map(e => {
      bal += e.direction === "in" ? e.amount : -e.amount;
      return { ...e, running: bal };
    });
  }, [sorted, opening]);
  const balance = withRunning.length ? withRunning[withRunning.length - 1].running : opening;
  const totalIn = entries.filter(e => e.direction === "in").reduce((s, e) => s + e.amount, 0);
  const totalOut = entries.filter(e => e.direction === "out").reduce((s, e) => s + e.amount, 0);

  const setOpeningBal = () => {
    const v = parseFloat(openingInput);
    if (isNaN(v) || v < 0) { toast.error("Enter a valid opening balance"); return; }
    setOpening(v);
    toast.success("Opening balance set");
  };
  const addEntry = () => {
    const v = parseFloat(amount);
    if (isNaN(v) || v <= 0) { toast.error("Enter a valid amount"); return; }
    setEntries([...entries, { id: crypto.randomUUID(), date, direction: dir, amount: v, note: note.trim() }]);
    setAmount(""); setNote("");
    toast.success(`${dir === "in" ? "Credit" : "Debit"} recorded`);
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> {tr("tok.erupeeHeading")}</h3>
        <p className="text-xs text-[var(--color-muted)]">{tr("tok.erupeeDesc")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Opening balance (₹) - current set: {formatCurrency(opening)}</label>
            <input type="number" value={openingInput} onChange={e => setOpeningInput(e.target.value)} placeholder="e.g. 50000" className={INP} />
          </div>
          <button onClick={setOpeningBal} className="bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm font-medium hover:border-[var(--color-primary)]/40">{tr("tok.setOpening")}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: tr("tok.currentBalance"), value: formatCurrency(balance), color: balance >= 0 ? "text-[var(--color-text)]" : "text-red-400" },
          { label: tr("tok.opening"), value: formatCurrency(opening), color: "text-[var(--color-muted)]" },
          { label: tr("tok.totalIn"), value: formatCurrency(totalIn), color: "text-green-400" },
          { label: tr("tok.totalOut"), value: formatCurrency(totalOut), color: "text-red-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4 space-y-3`}>
        <p className="text-sm font-semibold">{tr("tok.recordMovement")}</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Direction</label>
            <select value={dir} onChange={e => setDir(e.target.value as "in" | "out")} className={INP}>
              <option value="in">Credit (in)</option>
              <option value="out">Debit (out)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Vendor payment" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={addEntry} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> {tr("tok.add")}</button>
        </div>
      </div>

      {withRunning.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">{tr("tok.erupeeEmpty")}</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Date", "Note", "In", "Out", "Running", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {withRunning.map(e => (
                  <tr key={e.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 text-xs">{format(new Date(e.date), "d MMM yyyy")}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{e.note || "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs text-green-400">{e.direction === "in" ? <span className="inline-flex items-center gap-1"><ArrowDownRight size={11} />{formatCurrency(e.amount)}</span> : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs text-red-400">{e.direction === "out" ? <span className="inline-flex items-center gap-1"><ArrowUpRight size={11} />{formatCurrency(e.amount)}</span> : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs font-semibold">{formatCurrency(e.running)}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setEntries(entries.filter(x => x.id !== e.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Copyable JSON block ────────────────────────────────────────────────────────────
function JsonBlock({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
        <p className="text-xs font-semibold">Spec (JSON)</p>
        <button onClick={() => { void navigator.clipboard?.writeText(json); toast.success("Copied JSON spec"); }}
          className="flex items-center gap-1 text-[10px] text-[var(--color-primary)] hover:underline"><Copy size={11} /> Copy</button>
      </div>
      <pre className="p-4 text-[11px] leading-relaxed overflow-x-auto text-[var(--color-text)] whitespace-pre">{json}</pre>
    </div>
  );
}

// ── Programmable-Payment Rule Designer ─────────────────────────────────────────────
function RuleDesigner() {
  const tr = useT();
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [trigger, setTrigger] = useState<"milestone" | "date" | "delivery" | "approval">("milestone");
  const [condition, setCondition] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saved, setSaved] = useFeatureState<{ id: string; vendor: string; amount: number; trigger: string; condition: string; purpose: string }[]>("tok-rules", []);

  const counterparties = useCounterparties();
  const outstanding = useOutstandingInvoices();

  // Pre-fill the rule from a real outstanding invoice (amount + a sensible default condition).
  const prefillFromInvoice = (id: string) => {
    try {
      if (!id) return;
      const inv = outstanding.find(i => i.id === id);
      if (!inv) return;
      setVendor(inv.customer);
      setAmount(String(inv.amount));
      setTrigger("delivery");
      setCondition(`Invoice ${inv.number} (${inv.customer}) is delivered & accepted`);
      toast.success(`Loaded invoice ${inv.number}`);
    } catch {
      toast.error("Could not load that invoice");
    }
  };

  const amt = parseFloat(amount) || 0;
  const triggerVerb: Record<typeof trigger, string> = {
    milestone: "milestone is verified", date: "the date is reached", delivery: "delivery is confirmed", approval: "manager approval is signed",
  };
  const readable = vendor && amt > 0 && condition
    ? `Release ${formatCurrency(amt)} to "${vendor}" WHEN ${condition} (${triggerVerb[trigger]})${purpose ? `, usable only for ${purpose}` : ""}.`
    : null;
  const spec = readable && {
    type: "programmable_payment_rule",
    payee: vendor,
    amount: amt,
    currency: "INR-eRupee",
    trigger: { kind: trigger, condition },
    purposeBound: purpose || null,
    status: "draft",
  };

  const save = () => {
    if (!readable || !spec) { toast.error("Fill vendor, amount and condition"); return; }
    setSaved([...saved, { id: crypto.randomUUID(), vendor, amount: amt, trigger, condition, purpose }]);
    toast.success("Rule saved");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><GitBranch size={14} className="text-[var(--color-primary)]" /> {tr("tok.ruleHeading")}</h3>
        <p className="text-xs text-[var(--color-muted)]">{tr("tok.ruleDesc")}</p>
        {outstanding.length > 0 && (
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Pre-fill from a real outstanding invoice</label>
            <select defaultValue="" onChange={e => { prefillFromInvoice(e.target.value); e.target.value = ""; }} className={INP}>
              <option value="">Select an invoice…</option>
              {outstanding.map(i => (
                <option key={i.id} value={i.id}>{i.number} · {i.customer} · {formatCurrency(i.amount)} · {i.status}</option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Pay to (vendor / payee)</label>
            <input list="tok-rule-counterparties" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Acme Supplies Pvt Ltd" className={INP} />
            <datalist id="tok-rule-counterparties">
              {counterparties.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="250000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Trigger type</label>
            <select value={trigger} onChange={e => setTrigger(e.target.value as typeof trigger)} className={INP}>
              <option value="milestone">Milestone verified</option>
              <option value="delivery">Delivery confirmed</option>
              <option value="date">Date reached</option>
              <option value="approval">Manager approval</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Condition (the "WHEN")</label>
            <input value={condition} onChange={e => setCondition(e.target.value)} placeholder="Phase-2 inspection passes" className={INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purpose-bind (optional)</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="raw-material purchase only" className={INP} />
          </div>
        </div>
        <button onClick={save} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit"><Plus size={13} /> {tr("tok.saveRule")}</button>
      </div>

      {readable && (
        <div className="rounded-lg p-4 border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10">
          <p className="text-sm font-medium text-[var(--color-text)]">{readable}</p>
        </div>
      )}
      {spec && <JsonBlock data={spec} />}

      {saved.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-4 py-2.5 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{tr("tok.savedRules")}</p></div>
          <div className="divide-y divide-[var(--color-border)]">
            {saved.map(r => (
              <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-xs"><span className="font-medium">{formatCurrency(r.amount)}</span> → {r.vendor} <span className="text-[var(--color-muted)]">when {r.condition}</span></p>
                <button onClick={() => setSaved(saved.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Smart-Contract Escrow Designer ─────────────────────────────────────────────────
type EscrowStatus = "draft" | "funded" | "released";
type Escrow = { id: string; payer: string; payee: string; amount: number; arbiter: string; conditions: string; status: EscrowStatus };

function EscrowDesigner() {
  const tr = useT();
  const [payer, setPayer] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [arbiter, setArbiter] = useState("");
  const [conditions, setConditions] = useState("");
  const [escrows, setEscrows] = useFeatureState<Escrow[]>("tok-escrows", []);

  const amt = parseFloat(amount) || 0;
  const draftSpec = payer && payee && amt > 0 && conditions ? {
    type: "smart_contract_escrow",
    payer, payee, arbiter: arbiter || "none",
    amount: amt, currency: "INR-eRupee",
    releaseConditions: conditions, status: "draft" as EscrowStatus,
  } : null;

  const create = () => {
    if (!draftSpec) { toast.error("Fill payer, payee, amount and release conditions"); return; }
    setEscrows([...escrows, { id: crypto.randomUUID(), payer, payee, amount: amt, arbiter, conditions, status: "draft" }]);
    setPayer(""); setPayee(""); setAmount(""); setArbiter(""); setConditions("");
    toast.success("Escrow drafted");
  };
  const advance = (id: string) => setEscrows(escrows.map(e =>
    e.id === id ? { ...e, status: e.status === "draft" ? "funded" : e.status === "funded" ? "released" : "released" } : e));

  const STATUS_COLOR: Record<EscrowStatus, string> = {
    draft: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
    funded: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40",
    released: "bg-green-950/30 text-green-400 border-green-800/40",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Lock size={14} className="text-[var(--color-primary)]" /> {tr("tok.escrowHeading")}</h3>
        <p className="text-xs text-[var(--color-muted)]">{tr("tok.escrowDesc")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payer</label>
            <input value={payer} onChange={e => setPayer(e.target.value)} placeholder="Your firm" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payee</label>
            <input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Contractor" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Arbiter (optional)</label>
            <input value={arbiter} onChange={e => setArbiter(e.target.value)} placeholder="CA / neutral party" className={INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Release conditions</label>
            <input value={conditions} onChange={e => setConditions(e.target.value)} placeholder="Goods delivered & inspected within 30 days" className={INP} />
          </div>
        </div>
        <button onClick={create} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit"><Plus size={13} /> {tr("tok.draftEscrow")}</button>
      </div>

      {draftSpec && <JsonBlock data={draftSpec} />}

      {escrows.length > 0 && (
        <div className="space-y-3">
          {escrows.map(e => (
            <div key={e.id} className={`${CARD} p-4`}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm font-semibold">{e.payer} → {e.payee}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold capitalize ${STATUS_COLOR[e.status]}`}>{e.status}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-[var(--color-muted)]">
                <span>Amount: <span className="text-[var(--color-text)] font-semibold tabular-nums">{formatCurrency(e.amount)}</span></span>
                <span>Arbiter: <span className="text-[var(--color-text)]">{e.arbiter || "none"}</span></span>
                <span className="md:col-span-1">Release: <span className="text-[var(--color-text)]">{e.conditions}</span></span>
              </div>
              <div className="flex gap-2 mt-3">
                {e.status !== "released" && (
                  <button onClick={() => advance(e.id)} className="text-[10px] bg-[var(--color-accent)] border border-[var(--color-border)] px-2.5 py-1 rounded-lg hover:border-[var(--color-primary)]/40">
                    {e.status === "draft" ? "Simulate fund →" : "Simulate release →"}
                  </button>
                )}
                <button onClick={() => setEscrows(escrows.filter(x => x.id !== e.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400 px-2.5 py-1">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">{tr("tok.escrowNote")}</p>
    </div>
  );
}

// ── Tokenized-Invoice Simulator ────────────────────────────────────────────────────
type InvestorSplit = { name: string; tokens: number };

function InvoiceTokenizer() {
  const tr = useT();
  const [face, setFace] = useState("");
  const [tokenCount, setTokenCount] = useState("100");
  const [discountPct, setDiscountPct] = useState("0");
  const [investors, setInvestors] = useState<InvestorSplit[]>([]);
  const [invName, setInvName] = useState("");
  const [invTokens, setInvTokens] = useState("");
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);

  const outstanding = useOutstandingInvoices();

  // Load a real outstanding invoice's face value into the tokenizer.
  const prefillFromInvoice = (id: string) => {
    try {
      if (!id) { setSourceLabel(null); return; }
      const inv = outstanding.find(i => i.id === id);
      if (!inv) return;
      setFace(String(inv.amount));
      setSourceLabel(`${inv.number} · ${inv.customer}`);
      toast.success(`Loaded invoice ${inv.number}`);
    } catch {
      toast.error("Could not load that invoice");
    }
  };

  const faceV = parseFloat(face) || 0;
  const tokens = Math.max(1, Math.round(parseFloat(tokenCount) || 0));
  const discount = Math.min(100, Math.max(0, parseFloat(discountPct) || 0));
  const perToken = faceV / tokens;
  const perTokenPrice = perToken * (1 - discount / 100);
  const allocated = investors.reduce((s, i) => s + i.tokens, 0);
  const remaining = tokens - allocated;

  const addInvestor = () => {
    const t = Math.round(parseFloat(invTokens) || 0);
    if (!invName.trim() || t <= 0) { toast.error("Enter investor name and token count"); return; }
    if (t > remaining) { toast.error(`Only ${remaining} tokens left`); return; }
    setInvestors([...investors, { name: invName.trim(), tokens: t }]);
    setInvName(""); setInvTokens("");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> {tr("tok.invoiceHeading")}</h3>
        <p className="text-xs text-[var(--color-muted)]">{tr("tok.invoiceDesc")}</p>
        {outstanding.length > 0 && (
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tokenize a real outstanding invoice{sourceLabel ? ` - loaded: ${sourceLabel}` : ""}</label>
            <select defaultValue="" onChange={e => { prefillFromInvoice(e.target.value); }} className={INP}>
              <option value="">Select an invoice…</option>
              {outstanding.map(i => (
                <option key={i.id} value={i.id}>{i.number} · {i.customer} · {formatCurrency(i.amount)} · {i.status}</option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice face value (₹)</label>
            <input type="number" value={face} onChange={e => { setFace(e.target.value); setSourceLabel(null); }} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Number of tokens</label>
            <input type="number" value={tokenCount} onChange={e => setTokenCount(e.target.value)} placeholder="100" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Early-funding discount (%)</label>
            <input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="3" className={INP} />
          </div>
        </div>
      </div>

      {faceV > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: tr("tok.tokensMinted"), value: `${tokens}`, color: "text-[var(--color-text)]" },
              { label: tr("tok.perTokenFace"), value: formatCurrency(perToken), color: "text-[var(--color-text)]" },
              { label: tr("tok.perTokenPrice"), value: formatCurrency(perTokenPrice), color: "text-green-400" },
              { label: tr("tok.investorOutlay"), value: formatCurrency(perTokenPrice * tokens), color: "text-blue-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className={`${CARD} p-4 space-y-3`}>
            <p className="text-sm font-semibold">Investor split - {remaining} of {tokens} tokens unallocated</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs text-[var(--color-muted)] block mb-1">Investor</label>
                <input value={invName} onChange={e => setInvName(e.target.value)} placeholder="Investor name" className={INP} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Tokens</label>
                <input type="number" value={invTokens} onChange={e => setInvTokens(e.target.value)} placeholder="25" className={INP} />
              </div>
              <button onClick={addInvestor} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> {tr("tok.add")}</button>
            </div>

            {investors.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[var(--color-border)]">
                    <tr>{["Investor", "Tokens", "Share %", "Funds in", "On maturity", ""].map(h =>
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {investors.map((iv, idx) => (
                      <tr key={`${iv.name}-${idx}`} className="hover:bg-white/2">
                        <td className="px-3 py-2.5 font-medium text-xs">{iv.name}</td>
                        <td className="px-3 py-2.5 tabular-nums text-xs">{iv.tokens}</td>
                        <td className="px-3 py-2.5 tabular-nums text-xs">{((iv.tokens / tokens) * 100).toFixed(1)}%</td>
                        <td className="px-3 py-2.5 tabular-nums text-xs text-blue-400">{formatCurrency(iv.tokens * perTokenPrice)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-xs text-green-400">{formatCurrency(iv.tokens * perToken)}</td>
                        <td className="px-3 py-2.5 text-right"><button onClick={() => setInvestors(investors.filter((_, i) => i !== idx))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tokenized-Asset Registry ────────────────────────────────────────────────────────
type AssetKind = "invoice" | "inventory" | "equity";
type TokenAsset = { id: string; name: string; kind: AssetKind; faceValue: number; tokenCount: number; date: string };

function AssetRegistry() {
  const tr = useT();
  const [assets, setAssets] = useFeatureState<TokenAsset[]>("tok-assets", []);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetKind>("invoice");
  const [faceValue, setFaceValue] = useState("");
  const [tokenCount, setTokenCount] = useState("");

  const add = () => {
    const fv = parseFloat(faceValue) || 0;
    const tc = Math.round(parseFloat(tokenCount) || 0);
    if (!name.trim() || fv <= 0 || tc <= 0) { toast.error("Enter name, face value and token count"); return; }
    setAssets([...assets, { id: crypto.randomUUID(), name: name.trim(), kind, faceValue: fv, tokenCount: tc, date: new Date().toISOString().split("T")[0] }]);
    setName(""); setFaceValue(""); setTokenCount("");
    toast.success("Asset tokenized (simulated)");
  };

  const totalFace = assets.reduce((s, a) => s + a.faceValue, 0);
  const totalTokens = assets.reduce((s, a) => s + a.tokenCount, 0);
  const KIND_LABEL: Record<AssetKind, string> = { invoice: "Invoice", inventory: "Inventory", equity: "Equity" };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Boxes size={14} className="text-[var(--color-primary)]" /> {tr("tok.registryHeading")}</h3>
        <p className="text-xs text-[var(--color-muted)]">{tr("tok.registryDesc")}</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Asset name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="INV-2041" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Kind</label>
            <select value={kind} onChange={e => setKind(e.target.value as AssetKind)} className={INP}>
              <option value="invoice">Invoice</option>
              <option value="inventory">Inventory</option>
              <option value="equity">Equity</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Face value (₹)</label>
            <input type="number" value={faceValue} onChange={e => setFaceValue(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Token count</label>
            <input type="number" value={tokenCount} onChange={e => setTokenCount(e.target.value)} placeholder="500" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> {tr("tok.tokenize")}</button>
        </div>
      </div>

      {assets.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">{tr("tok.registryEmpty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: tr("tok.assets"), value: `${assets.length}`, color: "text-[var(--color-text)]" },
              { label: tr("tok.totalFaceValue"), value: formatCurrency(totalFace), color: "text-green-400" },
              { label: tr("tok.totalTokens"), value: `${totalTokens}`, color: "text-blue-400" },
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
                  <tr>{["Asset", "Kind", "Face value", "Tokens", "Per token", "Tokenized", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {assets.map(a => (
                    <tr key={a.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium text-xs">{a.name}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{KIND_LABEL[a.kind]}</td>
                      <td className="px-4 py-2.5 tabular-nums text-xs">{formatCurrency(a.faceValue)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-xs">{a.tokenCount}</td>
                      <td className="px-4 py-2.5 tabular-nums text-xs">{formatCurrency(a.faceValue / a.tokenCount)}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{format(new Date(a.date), "d MMM yyyy")}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setAssets(assets.filter(x => x.id !== a.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
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

// ── Atomic-Settlement Simulator ─────────────────────────────────────────────────────
function AtomicSettlement() {
  const tr = useT();
  const [partyA, setPartyA] = useState("");
  const [legAItem, setLegAItem] = useState("");
  const [legAValue, setLegAValue] = useState("");
  const [partyB, setPartyB] = useState("");
  const [legBItem, setLegBItem] = useState("");
  const [legBValue, setLegBValue] = useState("");
  const [aReady, setAReady] = useState(false);
  const [bReady, setBReady] = useState(false);

  const aV = parseFloat(legAValue) || 0;
  const bV = parseFloat(legBValue) || 0;
  const ready = Boolean(partyA && partyB && legAItem && legBItem && aV > 0 && bV > 0);
  const wouldSettle = ready && aReady && bReady;
  const valueMatch = aV === bV;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ArrowLeftRight size={14} className="text-[var(--color-primary)]" /> {tr("tok.atomicHeading")}</h3>
        <p className="text-xs text-[var(--color-muted)]">{tr("tok.atomicDesc")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold">{tr("tok.legA")}</p>
            <input value={partyA} onChange={e => setPartyA(e.target.value)} placeholder="Party A (e.g. Buyer)" className={INP} />
            <input value={legAItem} onChange={e => setLegAItem(e.target.value)} placeholder="What A gives (e.g. ₹ e-rupee)" className={INP} />
            <input type="number" value={legAValue} onChange={e => setLegAValue(e.target.value)} placeholder="Value (₹)" className={INP} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold">{tr("tok.legB")}</p>
            <input value={partyB} onChange={e => setPartyB(e.target.value)} placeholder="Party B (e.g. Seller)" className={INP} />
            <input value={legBItem} onChange={e => setLegBItem(e.target.value)} placeholder="What B gives (e.g. goods)" className={INP} />
            <input type="number" value={legBValue} onChange={e => setLegBValue(e.target.value)} placeholder="Value (₹)" className={INP} />
          </div>
        </div>
      </div>

      {ready && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className={`${CARD} p-4 flex items-center gap-3 cursor-pointer`}>
              <input type="checkbox" checked={aReady} onChange={e => setAReady(e.target.checked)} className="accent-[var(--color-primary)]" />
              <span className="text-sm"><span className="font-medium">{partyA}</span> has committed {legAItem} ({formatCurrency(aV)})</span>
            </label>
            <label className={`${CARD} p-4 flex items-center gap-3 cursor-pointer`}>
              <input type="checkbox" checked={bReady} onChange={e => setBReady(e.target.checked)} className="accent-[var(--color-primary)]" />
              <span className="text-sm"><span className="font-medium">{partyB}</span> has committed {legBItem} ({formatCurrency(bV)})</span>
            </label>
          </div>

          {!valueMatch && (
            <div className="rounded-lg p-3 border border-yellow-800/40 bg-yellow-950/20 text-xs text-yellow-400 flex items-center gap-2">
              <AlertTriangle size={12} /> Legs have unequal value ({formatCurrency(aV)} vs {formatCurrency(bV)}) - confirm this swap is intentional.
            </div>
          )}

          <div className={`rounded-lg p-5 border ${wouldSettle ? "border-green-800/40 bg-green-950/20" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
            {wouldSettle ? (
              <p className="text-sm font-bold text-green-400 flex items-center gap-2">
                <CheckCircle2 size={14} /> Both legs committed - settlement would execute atomically: {partyA} → {legAItem} and {partyB} → {legBItem} clear in one indivisible step.
              </p>
            ) : (
              <p className="text-sm text-[var(--color-muted)] flex items-center gap-2">
                <Lock size={14} /> Pending - {!aReady && !bReady ? "neither leg" : !aReady ? `${partyA}'s leg` : `${partyB}'s leg`} not yet committed. Nothing moves until both are ready.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Conditional-Disbursal Builder ────────────────────────────────────────────────────
type Milestone = { id: string; name: string; pct: number };

function ConditionalDisbursal() {
  const tr = useT();
  const [total, setTotal] = useState("");
  const [milestones, setMilestones] = useFeatureState<Milestone[]>("tok-milestones", []);
  const [mName, setMName] = useState("");
  const [mPct, setMPct] = useState("");

  const totalV = parseFloat(total) || 0;
  const allocatedPct = milestones.reduce((s, m) => s + m.pct, 0);
  const remainingPct = 100 - allocatedPct;

  const add = () => {
    const p = parseFloat(mPct) || 0;
    if (!mName.trim() || p <= 0) { toast.error("Enter milestone name and a positive %"); return; }
    if (p > remainingPct) { toast.error(`Only ${remainingPct}% left to allocate`); return; }
    setMilestones([...milestones, { id: crypto.randomUUID(), name: mName.trim(), pct: p }]);
    setMName(""); setMPct("");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> {tr("tok.disbursalHeading")}</h3>
        <p className="text-xs text-[var(--color-muted)]">{tr("tok.disbursalDesc")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total payout (₹)</label>
            <input type="number" value={total} onChange={e => setTotal(e.target.value)} placeholder="2000000" className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Milestone</label>
            <input value={mName} onChange={e => setMName(e.target.value)} placeholder="Design sign-off" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">% of total ({remainingPct}% left)</label>
            <input type="number" value={mPct} onChange={e => setMPct(e.target.value)} placeholder="25" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> {tr("tok.add")}</button>
        </div>
      </div>

      {milestones.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
            <p className="text-sm font-semibold">{tr("tok.disbursalSchedule")}</p>
            <span className={`text-[10px] font-semibold ${allocatedPct === 100 ? "text-green-400" : "text-yellow-400"}`}>{allocatedPct}% allocated</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["#", "Milestone", "%", "Tranche", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {milestones.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 tabular-nums text-xs">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-xs">{m.name}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{m.pct}%</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs text-green-400">{totalV > 0 ? formatCurrency(totalV * m.pct / 100) : "-"}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setMilestones(milestones.filter(x => x.id !== m.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Token Cap-Table Mini ──────────────────────────────────────────────────────────
type Holder = { id: string; name: string; tokens: number };

function TokenCapTable() {
  const tr = useT();
  const [issued, setIssued] = useFeatureState<number>("tok-captable-issued", 0);
  const [holders, setHolders] = useFeatureState<Holder[]>("tok-captable-holders", []);
  const [issuedInput, setIssuedInput] = useState("");
  const [hName, setHName] = useState("");
  const [hTokens, setHTokens] = useState("");

  const held = holders.reduce((s, h) => s + h.tokens, 0);
  const unissued = Math.max(0, issued - held);

  const setIssuedTotal = () => {
    const v = Math.round(parseFloat(issuedInput) || 0);
    if (v <= 0) { toast.error("Enter total tokens issued"); return; }
    if (v < held) { toast.error(`Holders already hold ${held} tokens`); return; }
    setIssued(v);
    toast.success("Issued supply set");
  };
  const addHolder = () => {
    const t = Math.round(parseFloat(hTokens) || 0);
    if (!hName.trim() || t <= 0) { toast.error("Enter holder and token count"); return; }
    if (t > unissued) { toast.error(`Only ${unissued} tokens unissued`); return; }
    setHolders([...holders, { id: crypto.randomUUID(), name: hName.trim(), tokens: t }]);
    setHName(""); setHTokens("");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> {tr("tok.captableHeading")}</h3>
        <p className="text-xs text-[var(--color-muted)]">{tr("tok.captableDesc")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total tokens issued - current: {issued}</label>
            <input type="number" value={issuedInput} onChange={e => setIssuedInput(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <button onClick={setIssuedTotal} className="bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm font-medium hover:border-[var(--color-primary)]/40">{tr("tok.setIssued")}</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: tr("tok.issued"), value: `${issued}`, color: "text-[var(--color-text)]" },
          { label: tr("tok.held"), value: `${held}`, color: "text-blue-400" },
          { label: tr("tok.unissued"), value: `${unissued}`, color: "text-[var(--color-muted)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4 space-y-3`}>
        <p className="text-sm font-semibold">{tr("tok.addHolder")}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Holder</label>
            <input value={hName} onChange={e => setHName(e.target.value)} placeholder="Founder / Investor / ESOP" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tokens</label>
            <input type="number" value={hTokens} onChange={e => setHTokens(e.target.value)} placeholder="2500" className={INP} />
          </div>
          <button onClick={addHolder} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> {tr("tok.add")}</button>
        </div>
      </div>

      {holders.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Holder", "Tokens", "Ownership %", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {holders.map(h => (
                  <tr key={h.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium text-xs">{h.name}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{h.tokens}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{issued > 0 ? `${((h.tokens / issued) * 100).toFixed(2)}%` : "-"}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setHolders(holders.filter(x => x.id !== h.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settlement-Readiness Checklist ───────────────────────────────────────────────────
type CheckItem = { id: string; label: string; desc: string };
const READINESS_ITEMS: CheckItem[] = [
  { id: "erupee-wallet", label: "e-Rupee wallet onboarded", desc: "Bank-issued CBDC wallet activated for the firm via a participating bank." },
  { id: "kyc-binding", label: "Verified business identity (KYC)", desc: "DigiLocker / Aadhaar-bound identity so only KYC'd parties hold tokens." },
  { id: "bank-rail", label: "Participating-bank rail access", desc: "A bank or PSP that supports programmable / purpose-bound e-rupee disbursal." },
  { id: "counterparty", label: "Counterparties on the same rail", desc: "Vendors / investors able to receive tokens on a compatible network." },
  { id: "legal", label: "Legal & contract templates", desc: "Escrow, milestone and tokenization agreements reviewed by counsel." },
  { id: "accounting", label: "Accounting treatment agreed", desc: "CA sign-off on how tokenized assets and settlements hit the books." },
  { id: "gift-city", label: "GIFT-City / cross-border setup", desc: "For tokenized cross-border settlement, IFSC entity and rails in place." },
  { id: "audit-trail", label: "Audit-trail & reconciliation", desc: "Process to reconcile on-chain token movements with the GL each period." },
];

function ReadinessChecklist() {
  const tr = useT();
  const [done, setDone] = useFeatureState<string[]>("tok-readiness", []);
  // Read-only access to the other tabs' saved specs so we can bundle a shareable brief.
  const [savedRules] = useFeatureState<{ id: string; vendor: string; amount: number; trigger: string; condition: string; purpose: string }[]>("tok-rules", []);
  const [escrows] = useFeatureState<Escrow[]>("tok-escrows", []);
  const [assets] = useFeatureState<TokenAsset[]>("tok-assets", []);
  const { store } = useApp();
  // doneList instead of `new Set()` - avoids any lucide global shadowing and keeps it simple.
  const doneList = Array.isArray(done) ? done : [];
  const isDoneId = (id: string) => doneList.includes(id);
  const toggle = (id: string) => setDone(isDoneId(id) ? doneList.filter(x => x !== id) : [...doneList, id]);
  const completed = READINESS_ITEMS.filter(i => isDoneId(i.id)).length;
  const pct = Math.round((completed / READINESS_ITEMS.length) * 100);

  const buildBrief = () => {
    const firmName = (() => { try { return store.firm?.name ?? "Your firm"; } catch { return "Your firm"; } })();
    return {
      type: "programmable_money_readiness_brief",
      firm: firmName,
      generatedAt: new Date().toISOString(),
      readiness: {
        completed,
        total: READINESS_ITEMS.length,
        percent: pct,
        items: READINESS_ITEMS.map(i => ({ id: i.id, label: i.label, done: isDoneId(i.id) })),
      },
      paymentRules: savedRules,
      escrows,
      tokenizedAssets: assets,
    };
  };

  const exportDesigns = () => {
    try {
      downloadJson(`tokens-readiness-brief-${new Date().toISOString().split("T")[0]}.json`, buildBrief());
    } catch {
      toast.error("Could not export designs");
    }
  };

  const printBrief = () => {
    try {
      const b = buildBrief();
      const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
      const row = (cells: string[]) => `<tr>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
      const rulesRows = b.paymentRules.length
        ? b.paymentRules.map(r => row([esc(formatCurrency(r.amount)), esc(r.vendor), esc(r.condition), esc(r.purpose || "-")])).join("")
        : row(["-", "No payment rules saved", "", ""]);
      const escrowRows = b.escrows.length
        ? b.escrows.map(e => row([esc(`${e.payer} → ${e.payee}`), esc(formatCurrency(e.amount)), esc(e.conditions), esc(e.status)])).join("")
        : row(["No escrows drafted", "", "", ""]);
      const assetRows = b.tokenizedAssets.length
        ? b.tokenizedAssets.map(a => row([esc(a.name), esc(a.kind), esc(formatCurrency(a.faceValue)), esc(String(a.tokenCount))])).join("")
        : row(["No tokenized assets logged", "", "", ""]);
      const checklistRows = b.readiness.items.map(i => row([i.done ? "✓" : "○", esc(i.label)])).join("");
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Programmable-Money Readiness Brief</title>
        <style>
          body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px;font-size:13px}
          h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:24px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}
          .meta{color:#666;font-size:12px;margin-bottom:8px}
          table{border-collapse:collapse;width:100%;margin-top:4px} td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px}
          th{background:#f4f4f4} .pct{font-weight:700}
        </style></head><body>
        <h1>Programmable-Money Readiness Brief</h1>
        <div class="meta">${esc(b.firm)} · Generated ${esc(format(new Date(b.generatedAt), "d MMM yyyy, HH:mm"))}</div>
        <div class="pct">Readiness: ${b.readiness.completed}/${b.readiness.total} (${b.readiness.percent}%)</div>
        <h2>Readiness checklist</h2>
        <table><tbody>${checklistRows}</tbody></table>
        <h2>Payment rules</h2>
        <table><thead><tr><th>Amount</th><th>Payee</th><th>Condition</th><th>Purpose</th></tr></thead><tbody>${rulesRows}</tbody></table>
        <h2>Escrows</h2>
        <table><thead><tr><th>Parties</th><th>Amount</th><th>Release condition</th><th>Status</th></tr></thead><tbody>${escrowRows}</tbody></table>
        <h2>Tokenized assets</h2>
        <table><thead><tr><th>Asset</th><th>Kind</th><th>Face value</th><th>Tokens</th></tr></thead><tbody>${assetRows}</tbody></table>
        </body></html>`;
      const w = window.open("", "_blank");
      if (!w) { toast.error("Allow pop-ups to print the brief"); return; }
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    } catch {
      toast.error("Could not open printable brief");
    }
  };

  const designCount = savedRules.length + escrows.length + assets.length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck size={14} className="text-[var(--color-primary)]" /> {tr("tok.readinessHeading")}</h3>
          <div className="flex items-center gap-2">
            <button onClick={exportDesigns} className="flex items-center gap-1.5 text-[10px] bg-[var(--color-accent)] border border-[var(--color-border)] px-2.5 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40"><Download size={11} /> {tr("tok.exportDesigns")}</button>
            <button onClick={printBrief} className="flex items-center gap-1.5 text-[10px] bg-[var(--color-accent)] border border-[var(--color-border)] px-2.5 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40"><Printer size={11} /> {tr("tok.printBrief")}</button>
            <span className="text-xs font-bold tabular-nums">{completed}/{READINESS_ITEMS.length} · {pct}%</span>
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] mb-2">Bundles {designCount} saved design{designCount === 1 ? "" : "s"} ({savedRules.length} rule{savedRules.length === 1 ? "" : "s"}, {escrows.length} escrow{escrows.length === 1 ? "" : "s"}, {assets.length} asset{assets.length === 1 ? "" : "s"}) plus this checklist into a shareable financing / escrow brief.</p>
        <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : "var(--color-primary)" }} />
        </div>
      </div>
      <div className="space-y-2">
        {READINESS_ITEMS.map(item => {
          const isDone = isDoneId(item.id);
          return (
            <button key={item.id} onClick={() => toggle(item.id)}
              className={`${CARD} w-full p-4 text-left flex items-start gap-3 hover:border-[var(--color-primary)]/40 transition-colors`}>
              <CheckCircle2 size={16} className={`shrink-0 mt-0.5 ${isDone ? "text-green-400" : "text-[var(--color-border)]"}`} />
              <div>
                <p className={`text-sm font-medium ${isDone ? "text-green-400" : "text-[var(--color-text)]"}`}>{item.label}</p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">{item.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
      {pct === 100 && (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20 text-sm font-bold text-green-400 flex items-center gap-2">
          <CheckCircle2 size={14} /> All readiness items checked - your designs can move to live rails as they become available.
        </div>
      )}
    </div>
  );
}

// ── Programmable-Money Glossary ───────────────────────────────────────────────────────
function Glossary() {
  const terms: { term: string; body: string }[] = [
    { term: "e-Rupee (CBDC)", body: "RBI's central-bank digital currency - a digital form of the rupee that's a direct liability of the central bank, unlike bank-account balances." },
    { term: "Programmable money", body: "Money that carries rules: it can be locked to a purpose, released only on a condition, or expire - enforced by code rather than trust." },
    { term: "Purpose-bound payment", body: "An e-rupee transfer restricted to a specific use (e.g. payroll, GST, a vendor category) and rejected for anything else." },
    { term: "Smart-contract escrow", body: "Funds held by code that release automatically when an agreed condition (delivery, milestone, arbiter decision) is met." },
    { term: "Atomic settlement (DvP)", body: "Delivery-versus-payment: two legs of a trade clear in one indivisible step - both succeed or neither does, removing counterparty risk." },
    { term: "Tokenization", body: "Representing a real-world asset (invoice, inventory, equity, property) as digital tokens that can be split, transferred and tracked." },
    { term: "Fractionalization", body: "Splitting one asset's value into many tokens so multiple investors can each own a fraction of it." },
    { term: "GIFT-City / IFSC", body: "India's International Financial Services Centre, the likely venue for regulated tokenized cross-border and stablecoin settlement." },
    { term: "On-chain provenance", body: "An immutable record of every mint, transfer and burn - a tamper-evident audit trail for CAs and lenders." },
    { term: "Settlement rail", body: "The underlying network (bank/PSP/CBDC infrastructure) that actually moves value when a programmed condition fires." },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {terms.map(t => (
        <div key={t.term} className={`${CARD} p-4`}>
          <p className="text-sm font-semibold mb-1 flex items-center gap-2"><BookOpen size={13} className="text-[var(--color-primary)]" /> {t.term}</p>
          <p className="text-xs text-[var(--color-muted)] leading-relaxed">{t.body}</p>
        </div>
      ))}
    </div>
  );
}
