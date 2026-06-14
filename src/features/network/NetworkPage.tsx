import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  Network, FileCheck2, GitCompareArrows, BookUser, Gauge, Search,
  MessageSquareWarning, PieChart, Star, FileSignature, CheckCircle2, AlertTriangle,
  Plus, Trash2, Building2, ShieldCheck, Link2, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays, parseISO, format } from "date-fns";

// ── shared styles (reuse TaxPage input class) ────────────────────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type TabId =
  | "overview" | "directory" | "confirm" | "recon" | "reference" | "scorecard"
  | "discovery" | "disputes" | "concentration" | "rating" | "balance-confirm";

const TABS = [
  ["overview", "Overview", Network],
  ["directory", "Buyer–Supplier Directory", BookUser],
  ["confirm", "Invoice Confirmation", FileCheck2],
  ["recon", "Counterparty Reconciliation", GitCompareArrows],
  ["reference", "Trade-Reference Book", FileSignature],
  ["scorecard", "Credit-Signal Scorecard", Gauge],
  ["discovery", "Supplier Discovery", Search],
  ["disputes", "Dispute Log", MessageSquareWarning],
  ["concentration", "Top-Counterparty Concentration", PieChart],
  ["rating", "Payment-Behaviour Rating", Star],
  ["balance-confirm", "Balance Confirmation", ShieldCheck],
] as const;

// Validate the structure of an Indian GSTIN (15 chars): 2-digit state + 10-char PAN + entity + Z + checksum.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
function gstinValid(g: string): boolean {
  return GSTIN_RE.test(g.trim().toUpperCase());
}

export default function NetworkPage() {
  const { store } = useApp();
  const [tab, setTab] = useState<TabId>("overview");

  // Derive a live counterparty list from transactions + invoices so the overview
  // and several tools are seeded with real names the user already trades with.
  const liveCounterparties = useMemo(() => {
    const map = new Map<string, { name: string; inflow: number; outflow: number; txns: number; invoiced: number }>();
    for (const t of store.transactions) {
      const name = (t.counterparty || "").trim();
      if (!name) continue;
      const e = map.get(name) ?? { name, inflow: 0, outflow: 0, txns: 0, invoiced: 0 };
      if (t.amount >= 0) e.inflow += t.amount; else e.outflow += Math.abs(t.amount);
      e.txns += 1;
      map.set(name, e);
    }
    for (const inv of store.invoices) {
      const name = (inv.customer || "").trim();
      if (!name) continue;
      const e = map.get(name) ?? { name, inflow: 0, outflow: 0, txns: 0, invoiced: 0 };
      e.invoiced += inv.amount;
      map.set(name, e);
    }
    return [...map.values()].sort((a, b) => (b.inflow + b.outflow + b.invoiced) - (a.inflow + a.outflow + a.invoiced));
  }, [store.transactions, store.invoices]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Network size={18} className="text-[var(--color-primary)]" /> B2B Network & Trade Graph
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Link every buyer and supplier into one trade graph — confirm invoices both ways, reconcile ledgers, score counterparties and discover new GST-verified partners across ONDC.
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

      {tab === "overview" && <Overview counterparties={liveCounterparties} />}
      {tab === "directory" && <Directory live={liveCounterparties} />}
      {tab === "confirm" && <InvoiceConfirmation />}
      {tab === "recon" && <CounterpartyReconciliation live={liveCounterparties} />}
      {tab === "reference" && <TradeReferenceBook />}
      {tab === "scorecard" && <CreditSignalScorecard live={liveCounterparties} />}
      {tab === "discovery" && <SupplierDiscovery />}
      {tab === "disputes" && <DisputeLog />}
      {tab === "concentration" && <Concentration live={liveCounterparties} />}
      {tab === "rating" && <PaymentBehaviourRating live={liveCounterparties} />}
      {tab === "balance-confirm" && <BalanceConfirmation live={liveCounterparties} />}
    </div>
  );
}

type Live = { name: string; inflow: number; outflow: number; txns: number; invoiced: number };

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ counterparties }: { counterparties: Live[] }) {
  const [partners] = useFeatureState<DirEntry[]>("net-directory", []);
  const [refs] = useFeatureState<TradeRef[]>("net-trade-refs", []);
  const [disputes] = useFeatureState<Dispute[]>("net-disputes", []);

  const buyers = counterparties.filter(c => c.inflow > 0 || c.invoiced > 0).length;
  const suppliers = counterparties.filter(c => c.outflow > 0).length;
  const linked = partners.filter(p => p.linked).length;
  const openDisputes = disputes.filter(d => d.status === "open").length;

  const cards = [
    { label: "Counterparties seen", value: String(counterparties.length), color: "text-[var(--color-text)]", sub: `${buyers} buyers · ${suppliers} suppliers` },
    { label: "Linked partners", value: String(linked), color: "text-[var(--color-primary)]", sub: `${partners.length} in your directory` },
    { label: "Trade references", value: String(refs.length), color: "text-blue-400", sub: `${refs.filter(r => r.status === "confirmed").length} confirmed` },
    { label: "Open disputes", value: String(openDisputes), color: openDisputes > 0 ? "text-red-400" : "text-green-400", sub: `${disputes.length} logged total` },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Network size={14} className="text-[var(--color-primary)]" /> Your trade graph, in one place</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          Headroom reads the counterparties from your transactions and invoices and turns them into a working network. Link a GSTIN, confirm invoices both ways, reconcile your ledger against theirs, and build a portable trade-reference book that lenders trust.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: FileCheck2, t: "Two-sided confirmation", d: "Both buyer and supplier accept each invoice, so the same amount sits on both ledgers." },
            { icon: GitCompareArrows, t: "Self-reconciling", d: "Match your ledger line-by-line against a counterparty statement and see only the true differences." },
            { icon: Gauge, t: "Network credit signal", d: "Real trade activity and on-time payment build a cash-flow score usable in loan applications." },
          ].map(f => (
            <div key={f.t} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
              <f.icon size={16} className="text-[var(--color-primary)] mb-2" />
              <p className="text-sm font-medium mb-0.5">{f.t}</p>
              <p className="text-[11px] text-[var(--color-muted)]">{f.d}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">Top counterparties (live, from your books)</p>
        </div>
        {counterparties.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] p-5">No counterparties yet — import transactions or invoices and your trade partners will appear here automatically.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Counterparty", "Money in", "Money out", "Invoiced", "Txns"].map(h =>
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {counterparties.slice(0, 8).map(c => (
                  <tr key={c.name} className="hover:bg-white/2">
                    <td className="px-5 py-2.5 font-medium">{c.name}</td>
                    <td className="px-5 py-2.5 tabular-nums text-green-400">{c.inflow > 0 ? formatAmount(c.inflow) : "—"}</td>
                    <td className="px-5 py-2.5 tabular-nums text-red-400">{c.outflow > 0 ? formatAmount(c.outflow) : "—"}</td>
                    <td className="px-5 py-2.5 tabular-nums">{c.invoiced > 0 ? formatAmount(c.invoiced) : "—"}</td>
                    <td className="px-5 py-2.5 tabular-nums text-[var(--color-muted)]">{c.txns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── #1 Buyer–Supplier Directory ──────────────────────────────────────────────
type DirEntry = { id: string; name: string; gstin: string; role: "buyer" | "supplier" | "both"; state: string; linked: boolean };
function Directory({ live }: { live: Live[] }) {
  const [dir, setDir] = useFeatureState<DirEntry[]>("net-directory", []);
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [role, setRole] = useState<DirEntry["role"]>("supplier");
  const [state, setState] = useState("");
  const [filter, setFilter] = useState<"all" | "buyer" | "supplier" | "both">("all");

  const add = () => {
    if (!name.trim()) { toast.error("Enter a counterparty name"); return; }
    const g = gstin.trim().toUpperCase();
    if (g && !gstinValid(g)) { toast.error("That GSTIN doesn't look valid (15 chars)"); return; }
    setDir([...dir, { id: crypto.randomUUID(), name: name.trim(), gstin: g, role, state: state.trim(), linked: false }]);
    setName(""); setGstin(""); setState("");
    toast.success("Counterparty added to directory");
  };
  const toggleLink = (id: string) =>
    setDir(dir.map(d => d.id === id ? { ...d, linked: !d.linked } : d));
  const remove = (id: string) => setDir(dir.filter(d => d.id !== id));

  const importLive = (l: Live) => {
    if (dir.some(d => d.name.toLowerCase() === l.name.toLowerCase())) { toast.error("Already in directory"); return; }
    const r: DirEntry["role"] = l.outflow > 0 && (l.inflow > 0 || l.invoiced > 0) ? "both" : l.outflow > 0 ? "supplier" : "buyer";
    setDir(d => [...d, { id: crypto.randomUUID(), name: l.name, gstin: "", role: r, state: "", linked: false }]);
    toast.success(`${l.name} imported`);
  };

  const unimported = live.filter(l => !dir.some(d => d.name.toLowerCase() === l.name.toLowerCase())).slice(0, 8);
  const shown = filter === "all" ? dir : dir.filter(d => d.role === filter || d.role === "both");

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><BookUser size={14} className="text-[var(--color-primary)]" /> Buyer–Supplier Directory</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sharma Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GSTIN</label>
            <input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="27ABCDE1234F1Z5" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Role</label>
            <select value={role} onChange={e => setRole(e.target.value as DirEntry["role"])} className={INP}>
              <option value="supplier">Supplier</option>
              <option value="buyer">Buyer</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">State</label>
            <input value={state} onChange={e => setState(e.target.value)} placeholder="Maharashtra" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
        {unimported.length > 0 && (
          <div className="pt-1">
            <p className="text-[10px] text-[var(--color-muted)] mb-1.5">From your books — tap to import:</p>
            <div className="flex gap-1 flex-wrap">
              {unimported.map(l => (
                <button key={l.name} onClick={() => importLive(l)}
                  className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]">
                  + {l.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1">
        {(["all", "buyer", "supplier", "both"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full border capitalize ${filter === f ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
            {f}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No counterparties yet. Add them above or import from your books.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Name", "GSTIN", "Role", "State", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {shown.map(d => (
                  <tr key={d.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{d.name}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] tabular-nums">{d.gstin || "—"}</td>
                    <td className="px-4 py-2.5 capitalize">{d.role}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{d.state || "—"}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggleLink(d.id)}
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${d.linked ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                        <Link2 size={10} /> {d.linked ? "Linked" : "Not linked"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => remove(d.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
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

// ── #2 Two-Sided Invoice Confirmation Tracker ────────────────────────────────
type ConfirmState = "sent" | "confirmed" | "disputed";
function InvoiceConfirmation() {
  const { store } = useApp();
  const [statuses, setStatuses] = useFeatureState<Record<string, ConfirmState>>("net-invoice-confirm", {});

  const open = store.invoices.filter(i => i.status !== "paid");
  const set = (id: string, s: ConfirmState) => {
    setStatuses({ ...statuses, [id]: s });
    toast.success(s === "confirmed" ? "Marked confirmed by counterparty" : s === "disputed" ? "Flagged as disputed" : "Confirmation request sent");
  };

  const counts = open.reduce((acc, i) => {
    const s = statuses[i.id] ?? "sent";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {} as Record<ConfirmState, number>);
  const confirmedValue = open.filter(i => statuses[i.id] === "confirmed").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><FileCheck2 size={14} className="text-[var(--color-primary)]" /> Two-Sided Invoice Confirmation</h3>
        <p className="text-xs text-[var(--color-muted)]">
          Track which open invoices the buyer has confirmed on their side. A confirmed invoice sits at the same amount on both ledgers, so month-end reconciliation is clean.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Open invoices", value: String(open.length), color: "text-[var(--color-text)]" },
          { label: "Confirmed", value: String(counts.confirmed ?? 0), color: "text-green-400" },
          { label: "Awaiting / sent", value: String(counts.sent ?? 0), color: "text-yellow-400" },
          { label: "Confirmed value", value: formatAmount(confirmedValue), color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {open.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No open invoices. Raise invoices in the Receivables module and they'll appear here for two-sided confirmation.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Invoice", "Amount", "Due", "Counterparty status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {open.map(i => {
                  const s = statuses[i.id] ?? "sent";
                  return (
                    <tr key={i.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{i.customer}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{i.invoiceNumber ?? "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(i.amount)}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{i.dueDate}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                          s === "confirmed" ? "bg-green-900/30 text-green-400 border-green-800/40" :
                          s === "disputed" ? "bg-red-900/30 text-red-400 border-red-800/40" :
                          "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                          {s === "confirmed" ? <CheckCircle2 size={10} /> : s === "disputed" ? <AlertTriangle size={10} /> : <FileCheck2 size={10} />}
                          {s === "sent" ? "Awaiting" : s.charAt(0).toUpperCase() + s.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => set(i.id, "confirmed")} className="text-[10px] text-green-400 hover:underline mr-2">Confirm</button>
                        <button onClick={() => set(i.id, "disputed")} className="text-[10px] text-red-400 hover:underline mr-2">Dispute</button>
                        <button onClick={() => set(i.id, "sent")} className="text-[10px] text-[var(--color-muted)] hover:underline">Reset</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── #3 Counterparty Reconciliation (my ledger vs their statement) ────────────
type StmtLine = { id: string; ref: string; amount: number };
function CounterpartyReconciliation({ live }: { live: Live[] }) {
  const { store } = useApp();
  const [party, setParty] = useState("");
  const [raw, setRaw] = useState("");

  // Parse the pasted counterparty statement: one "ref, amount" per line.
  const theirLines = useMemo<StmtLine[]>(() => {
    return raw.split("\n").map(line => line.trim()).filter(Boolean).map((line, idx) => {
      const parts = line.split(/[,\t]/).map(p => p.trim());
      const amt = parseFloat((parts[parts.length - 1] || "").replace(/[^0-9.-]/g, "")) || 0;
      const ref = parts.length > 1 ? parts.slice(0, -1).join(" ") : `Line ${idx + 1}`;
      return { id: `${idx}`, ref, amount: amt };
    }).filter(l => l.amount !== 0);
  }, [raw]);

  // My ledger view: this counterparty's invoices + transactions.
  const myLines = useMemo(() => {
    if (!party) return [] as StmtLine[];
    const p = party.toLowerCase();
    const inv = store.invoices.filter(i => i.customer.toLowerCase() === p)
      .map(i => ({ id: `inv-${i.id}`, ref: i.invoiceNumber ?? i.id.slice(0, 6), amount: i.amount }));
    const txn = store.transactions.filter(t => t.counterparty.toLowerCase() === p)
      .map(t => ({ id: `txn-${t.id}`, ref: t.description.slice(0, 24), amount: Math.abs(t.amount) }));
    return [...inv, ...txn];
  }, [party, store.invoices, store.transactions]);

  const myTotal = myLines.reduce((s, l) => s + l.amount, 0);
  const theirTotal = theirLines.reduce((s, l) => s + l.amount, 0);
  const diff = myTotal - theirTotal;

  // Amount-based matching: for each of their lines find an unused mine with the same value.
  const matches = useMemo(() => {
    const usedMine = new Set<string>();
    const rows = theirLines.map(t => {
      const m = myLines.find(x => !usedMine.has(x.id) && Math.round(x.amount) === Math.round(t.amount));
      if (m) usedMine.add(m.id);
      return { their: t, mine: m ?? null };
    });
    const unmatchedMine = myLines.filter(x => !usedMine.has(x.id));
    return { rows, unmatchedMine };
  }, [theirLines, myLines]);

  const partyOptions = useMemo(() => {
    const fromBooks = new Set(live.map(l => l.name));
    return [...fromBooks];
  }, [live]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><GitCompareArrows size={14} className="text-[var(--color-primary)]" /> Counterparty Reconciliation</h3>
        <p className="text-xs text-[var(--color-muted)]">Pick a counterparty to pull your ledger, then paste their statement of account (one <code>reference, amount</code> per line). We match by amount and surface only the true differences.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Counterparty</label>
            <input list="net-recon-parties" value={party} onChange={e => setParty(e.target.value)} placeholder="Select or type a name" className={INP} />
            <datalist id="net-recon-parties">{partyOptions.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Their statement (ref, amount per line)</label>
            <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={4}
              placeholder={"INV-1001, 45000\nINV-1002, 32000"} className={`${INP} font-mono text-xs resize-y`} />
          </div>
        </div>
      </div>

      {!party ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Select a counterparty to begin reconciliation.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "My ledger total", value: formatAmount(myTotal), color: "text-[var(--color-text)]", sub: `${myLines.length} line(s)` },
              { label: "Their statement total", value: formatAmount(theirTotal), color: "text-[var(--color-text)]", sub: `${theirLines.length} line(s)` },
              { label: "Difference", value: formatAmount(Math.abs(diff)), color: Math.abs(diff) < 1 ? "text-green-400" : "text-red-400", sub: Math.abs(diff) < 1 ? "Ledgers agree" : diff > 0 ? "I show more" : "They show more" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          {theirLines.length > 0 && (
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Line-by-line match</p></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[var(--color-border)]">
                    <tr>{["Their ref", "Their amount", "My match", "My amount", "Status"].map(h =>
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {matches.rows.map(r => (
                      <tr key={r.their.id} className={`hover:bg-white/2 ${r.mine ? "" : "bg-red-950/20"}`}>
                        <td className="px-4 py-2.5">{r.their.ref}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.their.amount)}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.mine?.ref ?? "—"}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.mine ? formatCurrency(r.mine.amount) : "—"}</td>
                        <td className="px-4 py-2.5">
                          {r.mine
                            ? <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-semibold"><CheckCircle2 size={11} /> Matched</span>
                            : <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-semibold"><AlertTriangle size={11} /> Not in my books</span>}
                        </td>
                      </tr>
                    ))}
                    {matches.unmatchedMine.map(m => (
                      <tr key={m.id} className="hover:bg-white/2 bg-yellow-950/20">
                        <td className="px-4 py-2.5 text-[var(--color-muted)]">—</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted)]">—</td>
                        <td className="px-4 py-2.5">{m.ref}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(m.amount)}</td>
                        <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 text-[10px] text-yellow-400 font-semibold"><AlertTriangle size={11} /> Not on their statement</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-[10px] text-[var(--color-muted)]">Matching is by exact amount. Differences usually mean a timing gap (cheque in transit), an unbooked credit note, or a TDS deduction. Resolve them before signing a balance confirmation.</p>
        </>
      )}
    </div>
  );
}

// ── #4 Trade-Reference Book ──────────────────────────────────────────────────
type TradeRef = { id: string; party: string; gstin: string; relMonths: number; avgDays: number; creditLimit: number; status: "requested" | "confirmed"; note: string };
function TradeReferenceBook() {
  const [refs, setRefs] = useFeatureState<TradeRef[]>("net-trade-refs", []);
  const [party, setParty] = useState("");
  const [gstin, setGstin] = useState("");
  const [relMonths, setRelMonths] = useState("");
  const [avgDays, setAvgDays] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [note, setNote] = useState("");

  const add = () => {
    if (!party.trim()) { toast.error("Enter the referring party"); return; }
    setRefs([...refs, {
      id: crypto.randomUUID(), party: party.trim(), gstin: gstin.trim().toUpperCase(),
      relMonths: Math.max(0, Math.round(parseFloat(relMonths) || 0)),
      avgDays: Math.max(0, Math.round(parseFloat(avgDays) || 0)),
      creditLimit: Math.max(0, parseFloat(creditLimit) || 0),
      status: "requested", note: note.trim(),
    }]);
    setParty(""); setGstin(""); setRelMonths(""); setAvgDays(""); setCreditLimit(""); setNote("");
    toast.success("Trade reference requested");
  };
  const confirm = (id: string) => { setRefs(refs.map(r => r.id === id ? { ...r, status: "confirmed" } : r)); toast.success("Reference confirmed"); };
  const remove = (id: string) => setRefs(refs.filter(r => r.id !== id));

  const confirmed = refs.filter(r => r.status === "confirmed");
  const avgRelationship = confirmed.length ? Math.round(confirmed.reduce((s, r) => s + r.relMonths, 0) / confirmed.length) : 0;
  const totalVouchedLimit = confirmed.reduce((s, r) => s + r.creditLimit, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileSignature size={14} className="text-[var(--color-primary)]" /> Trade-Reference Book</h3>
        <p className="text-xs text-[var(--color-muted)]">Build a portable record of counterparties who vouch for your payment history — attach it to a loan or credit-limit application.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Referring party</label>
            <input value={party} onChange={e => setParty(e.target.value)} placeholder="Supplier name" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GSTIN</label>
            <input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="optional" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Relationship (mo)</label>
            <input type="number" value={relMonths} onChange={e => setRelMonths(e.target.value)} placeholder="24" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Avg days to pay</label>
            <input type="number" value={avgDays} onChange={e => setAvgDays(e.target.value)} placeholder="32" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Credit extended (₹)</label>
            <input type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Request
          </button>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional) — e.g. always pays within terms" className={INP} />
      </div>

      {refs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Confirmed references", value: String(confirmed.length), color: "text-green-400" },
            { label: "Avg relationship", value: avgRelationship ? `${avgRelationship} mo` : "—", color: "text-[var(--color-text)]" },
            { label: "Total credit vouched", value: formatAmount(totalVouchedLimit), color: "text-[var(--color-primary)]" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {refs.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No trade references yet. Request one from a long-standing supplier or buyer.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Party", "GSTIN", "Relationship", "Avg pay", "Credit", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {refs.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.party}{r.note && <span className="block text-[10px] text-[var(--color-muted)] font-normal">{r.note}</span>}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] tabular-nums">{r.gstin || "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.relMonths} mo</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.avgDays} d</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.creditLimit > 0 ? formatAmount(r.creditLimit) : "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.status === "confirmed"
                        ? <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-semibold"><CheckCircle2 size={11} /> Confirmed</span>
                        : <button onClick={() => confirm(r.id)} className="text-[10px] text-[var(--color-primary)] hover:underline">Mark confirmed</button>}
                    </td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
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

// ── #5 Network Credit-Signal Scorecard ───────────────────────────────────────
function CreditSignalScorecard({ live }: { live: Live[] }) {
  const { store } = useApp();
  const [refs] = useFeatureState<TradeRef[]>("net-trade-refs", []);

  const signal = useMemo(() => {
    const buyers = live.filter(c => c.inflow > 0 || c.invoiced > 0);
    const suppliers = live.filter(c => c.outflow > 0);
    const totalInflow = live.reduce((s, c) => s + c.inflow, 0);

    // Diversity: how concentrated is revenue across buyers (Herfindahl-style, inverted).
    const shares = buyers.map(b => (totalInflow > 0 ? (b.inflow + b.invoiced) / Math.max(1, totalInflow + live.reduce((s, c) => s + c.invoiced, 0)) : 0));
    const hhi = shares.reduce((s, x) => s + x * x, 0);
    const diversityScore = Math.round((1 - Math.min(1, hhi)) * 100);

    // Counterparty depth: more distinct verified partners = stronger graph.
    const depthScore = Math.min(100, buyers.length * 8 + suppliers.length * 6);

    // Trade references confirmed lift trust.
    const refScore = Math.min(100, refs.filter(r => r.status === "confirmed").length * 25);

    // On-time signal from invoices not overdue.
    const totalInv = store.invoices.length;
    const overdue = store.invoices.filter(i => i.status === "overdue").length;
    const ontimeScore = totalInv > 0 ? Math.round((1 - overdue / totalInv) * 100) : 60;

    const composite = Math.round(diversityScore * 0.25 + depthScore * 0.25 + refScore * 0.2 + ontimeScore * 0.3);
    const band = composite >= 75 ? "Strong" : composite >= 50 ? "Moderate" : "Thin";
    const bandColor = composite >= 75 ? "text-green-400" : composite >= 50 ? "text-yellow-400" : "text-red-400";
    return { diversityScore, depthScore, refScore, ontimeScore, composite, band, bandColor, buyers: buyers.length, suppliers: suppliers.length };
  }, [live, refs, store.invoices]);

  const factors = [
    { label: "Buyer diversity", value: signal.diversityScore, weight: "25%", hint: "Revenue spread across many buyers, not one" },
    { label: "Counterparty depth", value: signal.depthScore, weight: "25%", hint: `${signal.buyers} buyers + ${signal.suppliers} suppliers in your graph` },
    { label: "Confirmed references", value: signal.refScore, weight: "20%", hint: "Peers who vouch for your payment behaviour" },
    { label: "On-time invoicing", value: signal.ontimeScore, weight: "30%", hint: "Share of invoices not overdue" },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Gauge size={14} className="text-[var(--color-primary)]" /> Network Credit-Signal Scorecard</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">A cash-flow credit signal derived from your live trade graph — the kind lenders look at under OCEN/cash-flow-based lending. Built only from data already in Headroom.</p>
        <div className="flex items-end gap-4">
          <div>
            <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Composite signal</p>
            <p className={`text-4xl font-bold tabular-nums ${signal.bandColor}`}>{signal.composite}<span className="text-base text-[var(--color-muted)]">/100</span></p>
          </div>
          <span className={`mb-2 text-xs font-semibold px-2.5 py-1 rounded-full border ${signal.composite >= 75 ? "bg-green-900/30 text-green-400 border-green-800/40" : signal.composite >= 50 ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-red-900/30 text-red-400 border-red-800/40"}`}>
            {signal.band} signal
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {factors.map(f => (
          <div key={f.label} className={`${CARD} p-4`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">{f.label} <span className="text-[10px] text-[var(--color-muted)]">({f.weight})</span></p>
              <span className="text-sm font-bold tabular-nums">{f.value}</span>
            </div>
            <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden mb-1.5">
              <div className="h-full rounded-full transition-all" style={{ width: `${f.value}%`, background: f.value >= 70 ? "#22c55e" : f.value >= 45 ? "#f59e0b" : "#ef4444" }} />
            </div>
            <p className="text-[10px] text-[var(--color-muted)]">{f.hint}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">This is an internal indicative signal, not a credit bureau score. Lenders apply their own underwriting. Improve it by diversifying buyers, collecting confirmed trade references, and invoicing on time.</p>
    </div>
  );
}

// ── #6 Supplier Discovery Shortlist ──────────────────────────────────────────
type Prospect = { id: string; name: string; gstin: string; category: string; state: string; ondc: boolean; gstRating: number; minOrder: number; notes: string };
function SupplierDiscovery() {
  const [list, setList] = useFeatureState<Prospect[]>("net-discovery", []);
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");
  const [ondc, setOndc] = useState(false);
  const [gstRating, setGstRating] = useState("4");
  const [minOrder, setMinOrder] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const add = () => {
    if (!name.trim()) { toast.error("Enter a supplier name"); return; }
    const g = gstin.trim().toUpperCase();
    if (g && !gstinValid(g)) { toast.error("That GSTIN doesn't look valid"); return; }
    setList([...list, {
      id: crypto.randomUUID(), name: name.trim(), gstin: g, category: category.trim(), state: state.trim(),
      ondc, gstRating: Math.min(5, Math.max(0, parseFloat(gstRating) || 0)), minOrder: Math.max(0, parseFloat(minOrder) || 0), notes: notes.trim(),
    }]);
    setName(""); setGstin(""); setCategory(""); setState(""); setOndc(false); setMinOrder(""); setNotes("");
    toast.success("Supplier shortlisted");
  };
  const remove = (id: string) => setList(list.filter(p => p.id !== id));

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = q ? list.filter(p => [p.name, p.category, p.state].some(v => v.toLowerCase().includes(q))) : list;
    return [...base].sort((a, b) => b.gstRating - a.gstRating);
  }, [list, search]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Search size={14} className="text-[var(--color-primary)]" /> Supplier Discovery Shortlist</h3>
        <p className="text-xs text-[var(--color-muted)]">Build and rank a shortlist of verified suppliers by GST compliance rating, ONDC presence and minimum order — sourcing alternatives before you commit.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Supplier name" className={INP} />
          <input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="GSTIN (optional)" className={INP} />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category / product" className={INP} />
          <input value={state} onChange={e => setState(e.target.value)} placeholder="State" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">GST rating (0–5)</label>
            <input type="number" min={0} max={5} step={0.5} value={gstRating} onChange={e => setGstRating(e.target.value)} className={INP} />
          </div>
          <input type="number" value={minOrder} onChange={e => setMinOrder(e.target.value)} placeholder="Min order (₹)" className={INP} />
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" className={INP} />
          <label className="flex items-center gap-2 text-xs cursor-pointer px-1">
            <input type="checkbox" checked={ondc} onChange={e => setOndc(e.target.checked)} className="accent-[var(--color-primary)]" /> On ONDC
          </label>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add to shortlist</button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search shortlist by name, category or state…" className={`${INP} max-w-md`} />

      {filtered.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">{list.length === 0 ? "No suppliers shortlisted yet." : "No matches for your search."}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => (
            <div key={p.id} className={`${CARD} p-4`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 size={15} className="text-[var(--color-primary)] shrink-0" />
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                </div>
                <button onClick={() => remove(p.id)} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
              </div>
              <div className="flex items-center gap-1 mt-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star key={n} size={12} className={n <= Math.round(p.gstRating) ? "text-yellow-400 fill-yellow-400" : "text-[var(--color-border)]"} />
                ))}
                <span className="text-[10px] text-[var(--color-muted)] ml-1">GST {p.gstRating.toFixed(1)}</span>
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-[var(--color-muted)]">
                {p.category && <p>Category: <span className="text-[var(--color-text)]">{p.category}</span></p>}
                {p.state && <p>State: <span className="text-[var(--color-text)]">{p.state}</span></p>}
                {p.minOrder > 0 && <p>Min order: <span className="text-[var(--color-text)]">{formatAmount(p.minOrder)}</span></p>}
                {p.gstin && <p className="tabular-nums">{p.gstin}</p>}
                {p.notes && <p className="italic">{p.notes}</p>}
              </div>
              {p.ondc && <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30">ONDC</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #7 Dispute Log / Mediation Tracker ───────────────────────────────────────
type Dispute = { id: string; party: string; invoiceRef: string; amount: number; reason: string; status: "open" | "mediating" | "resolved"; openedAt: string; proposed: number; note: string };
function DisputeLog() {
  const [disputes, setDisputes] = useFeatureState<Dispute[]>("net-disputes", []);
  const [party, setParty] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("Price mismatch");
  const [note, setNote] = useState("");

  const REASONS = ["Price mismatch", "Short delivery", "Quality issue", "Duplicate invoice", "Unapplied credit note", "TDS difference", "Other"] as const;

  const add = () => {
    if (!party.trim() || !amount) { toast.error("Enter party and disputed amount"); return; }
    setDisputes([...disputes, {
      id: crypto.randomUUID(), party: party.trim(), invoiceRef: invoiceRef.trim(), amount: parseFloat(amount) || 0,
      reason, status: "open", openedAt: new Date().toISOString().split("T")[0], proposed: 0, note: note.trim(),
    }]);
    setParty(""); setInvoiceRef(""); setAmount(""); setNote("");
    toast.success("Dispute logged");
  };
  const advance = (id: string, status: Dispute["status"]) => setDisputes(disputes.map(d => d.id === id ? { ...d, status } : d));
  const setProposed = (id: string, v: number) => setDisputes(disputes.map(d => d.id === id ? { ...d, proposed: v } : d));
  const remove = (id: string) => setDisputes(disputes.filter(d => d.id !== id));

  const open = disputes.filter(d => d.status !== "resolved");
  const openValue = open.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><MessageSquareWarning size={14} className="text-[var(--color-primary)]" /> Dispute Log & Mediation Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Central queue of every open dispute across counterparties, with a settlement proposal to close it. No more disputes buried in email threads.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Counterparty</label>
            <input value={party} onChange={e => setParty(e.target.value)} placeholder="Party name" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice ref</label>
            <input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="INV-1001" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Disputed (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="12000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className={INP}>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Log</button>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note / evidence reference (optional)" className={INP} />
      </div>

      {disputes.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Open disputes", value: String(open.length), color: open.length > 0 ? "text-red-400" : "text-green-400" },
            { label: "Value at stake", value: formatAmount(openValue), color: "text-[var(--color-text)]" },
            { label: "Resolved", value: String(disputes.length - open.length), color: "text-green-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {disputes.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No disputes logged. Flag a contested invoice above to start tracking it.</p>
      ) : (
        <div className="space-y-2">
          {disputes.map(d => {
            const age = differenceInCalendarDays(new Date(), parseISO(d.openedAt));
            return (
              <div key={d.id} className={`${CARD} p-4`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold">{d.party} <span className="text-[var(--color-muted)] font-normal">· {d.invoiceRef || "no ref"}</span></p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{d.reason} · opened {age}d ago{d.note ? ` · ${d.note}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums text-red-400">{formatCurrency(d.amount)}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      d.status === "resolved" ? "bg-green-900/30 text-green-400 border-green-800/40" :
                      d.status === "mediating" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" :
                      "bg-red-900/30 text-red-400 border-red-800/40"}`}>
                      {d.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <input type="number" value={d.proposed || ""} onChange={e => setProposed(d.id, parseFloat(e.target.value) || 0)} placeholder="Settle at ₹" className={`${INP} max-w-[160px]`} />
                  {d.proposed > 0 && d.proposed < d.amount && <span className="text-[10px] text-green-400">Concede {formatAmount(d.amount - d.proposed)}</span>}
                  <div className="ml-auto flex gap-2">
                    {d.status === "open" && <button onClick={() => advance(d.id, "mediating")} className="text-[10px] text-yellow-400 hover:underline">Start mediation</button>}
                    {d.status !== "resolved" && <button onClick={() => advance(d.id, "resolved")} className="text-[10px] text-green-400 hover:underline">Resolve</button>}
                    <button onClick={() => remove(d.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── #8 Top-Counterparty Concentration ────────────────────────────────────────
function Concentration({ live }: { live: Live[] }) {
  const [side, setSide] = useState<"buyers" | "suppliers">("buyers");

  const data = useMemo(() => {
    const rows = side === "buyers"
      ? live.map(c => ({ name: c.name, value: c.inflow + c.invoiced })).filter(r => r.value > 0)
      : live.map(c => ({ name: c.name, value: c.outflow })).filter(r => r.value > 0);
    const total = rows.reduce((s, r) => s + r.value, 0);
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const top1 = sorted[0] ? sorted[0].value / total : 0;
    const top3 = sorted.slice(0, 3).reduce((s, r) => s + r.value, 0) / (total || 1);
    const hhi = total > 0 ? sorted.reduce((s, r) => s + Math.pow(r.value / total, 2), 0) : 0;
    return { sorted, total, top1, top3, hhi };
  }, [live, side]);

  const SAFE_TOP1 = 0.3;
  const concentrated = data.top1 > SAFE_TOP1;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> Top-Counterparty Concentration</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">How much of your {side === "buyers" ? "revenue" : "spend"} depends on a single counterparty — your concentration risk.</p>
          </div>
          <div className="flex gap-1">
            {(["buyers", "suppliers"] as const).map(s => (
              <button key={s} onClick={() => setSide(s)}
                className={`text-xs px-3 py-1 rounded-full border capitalize ${side === s ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      {data.sorted.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No {side === "buyers" ? "revenue inflows / invoices" : "supplier spend"} in your books yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Largest counterparty", value: `${Math.round(data.top1 * 100)}%`, color: concentrated ? "text-red-400" : "text-green-400", sub: data.sorted[0]?.name ?? "" },
              { label: "Top 3 combined", value: `${Math.round(data.top3 * 100)}%`, color: data.top3 > 0.6 ? "text-yellow-400" : "text-[var(--color-text)]", sub: "of total" },
              { label: "HHI (concentration)", value: data.hhi.toFixed(2), color: data.hhi > 0.25 ? "text-red-400" : "text-green-400", sub: data.hhi > 0.25 ? "Concentrated" : "Diversified" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5 truncate">{k.sub}</p>
              </div>
            ))}
          </div>

          {concentrated && (
            <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20">
              <p className="text-sm font-bold text-orange-400 flex items-center gap-2"><AlertTriangle size={14} /> {data.sorted[0]?.name} accounts for {Math.round(data.top1 * 100)}% of your {side === "buyers" ? "revenue" : "spend"}. Losing this relationship would hit hard — diversify before it becomes a single point of failure.</p>
            </div>
          )}

          <div className={`${CARD} p-4 space-y-2`}>
            {data.sorted.slice(0, 10).map(r => {
              const pct = data.total > 0 ? (r.value / data.total) * 100 : 0;
              return (
                <div key={r.name}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-medium truncate pr-2">{r.name}</span>
                    <span className="tabular-nums text-[var(--color-muted)]">{formatAmount(r.value)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct > 30 ? "#ef4444" : pct > 15 ? "#f59e0b" : "var(--color-primary)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── #9 Payment-Behaviour Rating per Partner ──────────────────────────────────
function PaymentBehaviourRating({ live }: { live: Live[] }) {
  const { store } = useApp();
  const today = new Date();

  const ratings = useMemo(() => {
    // Group invoices per customer and derive days-to-pay behaviour.
    const byParty = new Map<string, { name: string; total: number; overdue: number; overdueAmt: number; paid: number; pending: number; worstDays: number }>();
    for (const inv of store.invoices) {
      const name = (inv.customer || "").trim();
      if (!name) continue;
      const e = byParty.get(name) ?? { name, total: 0, overdue: 0, overdueAmt: 0, paid: 0, pending: 0, worstDays: 0 };
      e.total += 1;
      if (inv.status === "paid") e.paid += 1;
      else if (inv.status === "overdue") {
        e.overdue += 1; e.overdueAmt += inv.amount;
        const days = inv.dueDate ? differenceInCalendarDays(today, parseISO(inv.dueDate)) : 0;
        e.worstDays = Math.max(e.worstDays, days);
      } else e.pending += 1;
      byParty.set(name, e);
    }
    return [...byParty.values()].map(e => {
      const overdueRate = e.total > 0 ? e.overdue / e.total : 0;
      // Score: penalise overdue rate and aging severity. 100 = always on time.
      const agingPenalty = Math.min(40, e.worstDays / 3);
      const score = Math.max(0, Math.round(100 - overdueRate * 60 - agingPenalty));
      const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";
      const gradeColor = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : score >= 40 ? "text-orange-400" : "text-red-400";
      return { ...e, overdueRate, score, grade, gradeColor };
    }).sort((a, b) => a.score - b.score);
  }, [store.invoices, today]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Star size={14} className="text-[var(--color-primary)]" /> Payment-Behaviour Rating</h3>
        <p className="text-xs text-[var(--color-muted)]">Each buyer gets a days-to-pay grade from your invoice history — so you know who to extend credit to and who to put on advance.</p>
      </div>

      {ratings.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No invoice history yet. Raise and track invoices to rate how each buyer pays.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Buyer", "Grade", "Score", "Invoices", "Overdue", "Worst aging", "Overdue value"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {ratings.map(r => (
                  <tr key={r.name} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className={`px-4 py-2.5 font-bold text-lg ${r.gradeColor}`}>{r.grade}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.score}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.total}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.overdue} <span className="text-[var(--color-muted)]">({Math.round(r.overdueRate * 100)}%)</span></td>
                    <td className="px-4 py-2.5 tabular-nums">{r.worstDays > 0 ? `${r.worstDays}d` : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400">{r.overdueAmt > 0 ? formatAmount(r.overdueAmt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Grade A = consistently on time; D = chronically overdue. Based on this firm's own invoices only — it is a private rating, not shared with the counterparty.</p>
    </div>
  );
}

// ── #10 Shared-Balance Confirmation Generator ────────────────────────────────
function BalanceConfirmation({ live }: { live: Live[] }) {
  const { store } = useApp();
  const { firm } = store;
  const [party, setParty] = useState("");
  const [asOf, setAsOf] = useState(() => new Date().toISOString().split("T")[0]);
  const [adjust, setAdjust] = useState("");

  const partyOptions = useMemo(() => live.map(l => l.name), [live]);

  const balance = useMemo(() => {
    if (!party) return null;
    const p = party.toLowerCase();
    const invTotal = store.invoices.filter(i => i.customer.toLowerCase() === p && i.status !== "paid")
      .reduce((s, i) => s + i.amount, 0);
    const adj = parseFloat(adjust) || 0;
    return invTotal + adj;
  }, [party, store.invoices, adjust]);

  const letter = useMemo(() => {
    if (!party || balance === null) return "";
    const dateLabel = (() => { try { return format(parseISO(asOf), "d MMMM yyyy"); } catch { return asOf; } })();
    return [
      `To: ${party}`,
      `From: ${firm?.legalName || firm?.name || "Our company"}${firm?.gstNumber ? ` (GSTIN ${firm.gstNumber})` : ""}`,
      ``,
      `Subject: Balance Confirmation as on ${dateLabel}`,
      ``,
      `Dear Sir / Madam,`,
      ``,
      `As per our books of account, the balance ${balance >= 0 ? "receivable from" : "payable to"} you as on ${dateLabel} is ${formatCurrency(Math.abs(balance))} (${balance >= 0 ? "Dr" : "Cr"}).`,
      ``,
      `We request you to confirm whether the above balance agrees with your records. If there is any difference, kindly intimate the same with supporting details so that the accounts can be reconciled.`,
      ``,
      `Please sign and return a copy of this letter in token of confirmation.`,
      ``,
      `Confirmed: ____________________   Date: ____________`,
      ``,
      `For ${firm?.legalName || firm?.name || "Our company"}`,
      `Authorised Signatory`,
    ].join("\n");
  }, [party, balance, asOf, firm]);

  const copy = () => {
    if (!letter) return;
    navigator.clipboard?.writeText(letter).then(
      () => toast.success("Confirmation letter copied"),
      () => toast.error("Couldn't copy to clipboard"),
    );
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--color-primary)]" /> Shared-Balance Confirmation Generator</h3>
        <p className="text-xs text-[var(--color-muted)]">Generate a standard balance-confirmation letter (the one auditors and CAs ask for at year-end) for a counterparty, pre-filled from your open ledger.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Counterparty</label>
            <input list="net-bc-parties" value={party} onChange={e => setParty(e.target.value)} placeholder="Select or type" className={INP} />
            <datalist id="net-bc-parties">{partyOptions.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">As on date</label>
            <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Manual adjustment (₹)</label>
            <input type="number" value={adjust} onChange={e => setAdjust(e.target.value)} placeholder="+/- to open AR" className={INP} />
          </div>
        </div>
      </div>

      {!party ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Select a counterparty to draft a confirmation letter.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">Open balance (from your books)</p>
              <p className={`text-xl font-bold tabular-nums ${(balance ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.abs(balance ?? 0))}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{(balance ?? 0) >= 0 ? "Receivable (Dr)" : "Payable (Cr)"}</p>
            </div>
            <div className={`${CARD} p-4 flex flex-col justify-center`}>
              <button onClick={copy} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
                <Copy size={13} /> Copy letter
              </button>
            </div>
          </div>

          <div className={`${CARD} p-4`}>
            <p className="text-xs font-semibold mb-2 text-[var(--color-muted)]">Draft confirmation letter</p>
            <pre className="text-xs whitespace-pre-wrap font-mono text-[var(--color-text)] leading-relaxed">{letter}</pre>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Balance is the sum of this counterparty's open (unpaid) invoices plus any manual adjustment. Reconcile differences in the Counterparty Reconciliation tool before sending.</p>
        </>
      )}
    </div>
  );
}
