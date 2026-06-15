import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  Network, FileCheck2, GitCompareArrows, BookUser, Gauge, Search,
  MessageSquareWarning, PieChart, Star, FileSignature, CheckCircle2, AlertTriangle,
  Plus, Trash2, Building2, ShieldCheck, Link2, Copy,
  ClipboardList, Handshake, FileSpreadsheet, History, UserPlus, Tags,
  ClipboardCheck, Users, Send, ShieldAlert, CalendarClock, Scale,
  Award, Timer, Megaphone, ArrowLeftRight, TrendingUp, Smile,
  LineChart, Split, CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays, parseISO, format } from "date-fns";

// ── shared styles (reuse TaxPage input class) ────────────────────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type TabId =
  | "overview" | "directory" | "confirm" | "recon" | "reference" | "scorecard"
  | "discovery" | "disputes" | "concentration" | "rating" | "balance-confirm"
  | "onboarding" | "terms" | "joint-recon" | "pay-timeline" | "referrals"
  | "price-list" | "sla" | "group-buy" | "intro" | "watchlist" | "meeting-log"
  | "netting" | "tiers" | "terms-bench" | "co-market" | "intros-ledger"
  | "forecast-share" | "partner-nps"
  | "spend-share-trend" | "jv-split" | "pay-reliability";

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
  ["onboarding", "Onboarding Checklist", ClipboardList],
  ["terms", "Trade-Terms Tracker", Handshake],
  ["joint-recon", "Joint-Recon Export", FileSpreadsheet],
  ["pay-timeline", "Payment-History Timeline", History],
  ["referrals", "Referral Tracker", UserPlus],
  ["price-list", "Price-List Manager", Tags],
  ["sla", "Partner SLA Scorecard", ClipboardCheck],
  ["group-buy", "Group-Buy Calculator", Users],
  ["intro", "Warm-Intro Requester", Send],
  ["watchlist", "Risk Watchlist", ShieldAlert],
  ["meeting-log", "Meeting Log", CalendarClock],
  ["netting", "Mutual-Credit Netting", Scale],
  ["tiers", "Partner-Tier Scheme", Award],
  ["terms-bench", "Payment-Terms Benchmark", Timer],
  ["co-market", "Co-Marketing Planner", Megaphone],
  ["intros-ledger", "Introductions Ledger", ArrowLeftRight],
  ["forecast-share", "Collaborative Forecast", TrendingUp],
  ["partner-nps", "Partner NPS", Smile],
  ["spend-share-trend", "Spend-Share Trend", LineChart],
  ["jv-split", "Joint-Venture P&L Split", Split],
  ["pay-reliability", "Payment Reliability", CheckCheck],
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
      {tab === "onboarding" && <OnboardingChecklist live={liveCounterparties} />}
      {tab === "terms" && <TradeTermsTracker live={liveCounterparties} />}
      {tab === "joint-recon" && <JointReconExport live={liveCounterparties} />}
      {tab === "pay-timeline" && <PaymentTimeline live={liveCounterparties} />}
      {tab === "referrals" && <ReferralTracker />}
      {tab === "price-list" && <PriceListManager />}
      {tab === "sla" && <PartnerSLAScorecard live={liveCounterparties} />}
      {tab === "group-buy" && <GroupBuyCalculator />}
      {tab === "intro" && <WarmIntroRequester live={liveCounterparties} />}
      {tab === "watchlist" && <RiskWatchlist live={liveCounterparties} />}
      {tab === "meeting-log" && <MeetingLog live={liveCounterparties} />}
      {tab === "netting" && <MutualNetting />}
      {tab === "tiers" && <PartnerTierScheme live={liveCounterparties} />}
      {tab === "terms-bench" && <PaymentTermsBenchmark />}
      {tab === "co-market" && <CoMarketingPlanner live={liveCounterparties} />}
      {tab === "intros-ledger" && <IntroductionsLedger />}
      {tab === "forecast-share" && <CollaborativeForecast live={liveCounterparties} />}
      {tab === "partner-nps" && <PartnerNPS live={liveCounterparties} />}
      {tab === "spend-share-trend" && <SpendShareTrend />}
      {tab === "jv-split" && <JointVentureSplit live={liveCounterparties} />}
      {tab === "pay-reliability" && <PaymentReliability />}
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

// ── #11 Partner Onboarding Checklist ─────────────────────────────────────────
const ONBOARD_STEPS = [
  "Collect GSTIN & verify on portal",
  "Verify bank account (penny drop)",
  "Sign trade-terms / payment-terms agreement",
  "Exchange PAN & address proof (KYB)",
  "Set & share credit limit",
  "Add AP/AR contact details",
  "Link ledgers / share opening balance",
  "First invoice raised & confirmed",
] as const;
type OnboardRecord = { id: string; party: string; gstin: string; done: number[]; startedAt: string };
function OnboardingChecklist({ live }: { live: Live[] }) {
  const [records, setRecords] = useFeatureState<OnboardRecord[]>("net-onboarding", []);
  const [party, setParty] = useState("");
  const [gstin, setGstin] = useState("");

  const add = () => {
    if (!party.trim()) { toast.error("Enter a counterparty name"); return; }
    const g = gstin.trim().toUpperCase();
    if (g && !gstinValid(g)) { toast.error("That GSTIN doesn't look valid"); return; }
    setRecords([...records, { id: crypto.randomUUID(), party: party.trim(), gstin: g, done: [], startedAt: new Date().toISOString().split("T")[0] }]);
    setParty(""); setGstin("");
    toast.success("Onboarding started");
  };
  const toggleStep = (id: string, step: number) => setRecords(records.map(r =>
    r.id === id ? { ...r, done: r.done.includes(step) ? r.done.filter(s => s !== step) : [...r.done, step] } : r));
  const remove = (id: string) => setRecords(records.filter(r => r.id !== id));

  const options = useMemo(() => live.map(l => l.name).filter(n => !records.some(r => r.party.toLowerCase() === n.toLowerCase())), [live, records]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardList size={14} className="text-[var(--color-primary)]" /> Partner Onboarding Checklist</h3>
        <p className="text-xs text-[var(--color-muted)]">Run every new counterparty through the same {ONBOARD_STEPS.length}-step onboarding — verification, KYB, terms and ledger linking — so nothing is skipped before you start trading.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Counterparty</label>
            <input list="net-onboard-parties" value={party} onChange={e => setParty(e.target.value)} placeholder="New partner name" className={INP} />
            <datalist id="net-onboard-parties">{options.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GSTIN</label>
            <input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="optional" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Start onboarding</button>
        </div>
      </div>

      {records.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No onboardings in progress. Add a new partner to run the checklist.</p>
      ) : (
        <div className="space-y-3">
          {records.map(r => {
            const pct = Math.round((r.done.length / ONBOARD_STEPS.length) * 100);
            const complete = r.done.length === ONBOARD_STEPS.length;
            return (
              <div key={r.id} className={`${CARD} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{r.party} {r.gstin && <span className="text-[10px] text-[var(--color-muted)] font-normal tabular-nums">· {r.gstin}</span>}</p>
                    <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Started {r.startedAt} · {r.done.length}/{ONBOARD_STEPS.length} done</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold tabular-nums ${complete ? "text-green-400" : "text-[var(--color-text)]"}`}>{pct}%</span>
                    <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden my-3">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: complete ? "#22c55e" : "var(--color-primary)" }} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {ONBOARD_STEPS.map((s, idx) => {
                    const isDone = r.done.includes(idx);
                    return (
                      <label key={idx} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={isDone} onChange={() => toggleStep(r.id, idx)} className="accent-[var(--color-primary)]" />
                        <span className={isDone ? "line-through text-[var(--color-muted)]" : ""}>{s}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── #12 Trade-Terms Agreement Tracker ────────────────────────────────────────
type TradeTerm = { id: string; party: string; creditDays: number; creditLimit: number; earlyPayDiscPct: number; latePenaltyPct: number; effectiveFrom: string; reviewOn: string; status: "draft" | "agreed"; note: string };
function TradeTermsTracker({ live }: { live: Live[] }) {
  const [terms, setTerms] = useFeatureState<TradeTerm[]>("net-trade-terms", []);
  const [party, setParty] = useState("");
  const [creditDays, setCreditDays] = useState("30");
  const [creditLimit, setCreditLimit] = useState("");
  const [earlyPay, setEarlyPay] = useState("");
  const [latePenalty, setLatePenalty] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().split("T")[0]);
  const [reviewOn, setReviewOn] = useState("");
  const [note, setNote] = useState("");

  const add = () => {
    if (!party.trim()) { toast.error("Enter a counterparty"); return; }
    setTerms([...terms, {
      id: crypto.randomUUID(), party: party.trim(),
      creditDays: Math.max(0, Math.round(parseFloat(creditDays) || 0)),
      creditLimit: Math.max(0, parseFloat(creditLimit) || 0),
      earlyPayDiscPct: Math.max(0, parseFloat(earlyPay) || 0),
      latePenaltyPct: Math.max(0, parseFloat(latePenalty) || 0),
      effectiveFrom, reviewOn, status: "draft", note: note.trim(),
    }]);
    setParty(""); setCreditLimit(""); setEarlyPay(""); setLatePenalty(""); setReviewOn(""); setNote("");
    toast.success("Trade terms recorded");
  };
  const agree = (id: string) => { setTerms(terms.map(t => t.id === id ? { ...t, status: "agreed" } : t)); toast.success("Terms marked agreed"); };
  const remove = (id: string) => setTerms(terms.filter(t => t.id !== id));

  const options = useMemo(() => live.map(l => l.name), [live]);
  const dueForReview = (t: TradeTerm) => t.reviewOn && differenceInCalendarDays(parseISO(t.reviewOn), new Date()) <= 14;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Handshake size={14} className="text-[var(--color-primary)]" /> Trade-Terms Agreement Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Record the credit days, limit, early-pay discount and late penalty agreed with each partner — so aging and reminders use the real terms, not guesses, and you know when each is due for review.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="col-span-2 md:col-span-1">
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Counterparty</label>
            <input list="net-terms-parties" value={party} onChange={e => setParty(e.target.value)} placeholder="Party name" className={INP} />
            <datalist id="net-terms-parties">{options.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Credit days</label><input type="number" value={creditDays} onChange={e => setCreditDays(e.target.value)} className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Credit limit (₹)</label><input type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="500000" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Early-pay disc %</label><input type="number" value={earlyPay} onChange={e => setEarlyPay(e.target.value)} placeholder="2" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Late penalty %/mo</label><input type="number" value={latePenalty} onChange={e => setLatePenalty(e.target.value)} placeholder="1.5" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Effective from</label><input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Review on</label><input type="date" value={reviewOn} onChange={e => setReviewOn(e.target.value)} className={INP} /></div>
          <div className="flex items-end"><button onClick={add} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Record</button></div>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className={INP} />
      </div>

      {terms.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No trade terms recorded yet.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Party", "Credit", "Limit", "Early-pay", "Late penalty", "Review", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {terms.map(t => (
                  <tr key={t.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{t.party}{t.note && <span className="block text-[10px] text-[var(--color-muted)] font-normal">{t.note}</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums">{t.creditDays}d</td>
                    <td className="px-4 py-2.5 tabular-nums">{t.creditLimit > 0 ? formatAmount(t.creditLimit) : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{t.earlyPayDiscPct > 0 ? `${t.earlyPayDiscPct}%` : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{t.latePenaltyPct > 0 ? `${t.latePenaltyPct}%/mo` : "—"}</td>
                    <td className="px-4 py-2.5">
                      {t.reviewOn
                        ? <span className={dueForReview(t) ? "text-orange-400 font-medium" : "text-[var(--color-muted)]"}>{t.reviewOn}{dueForReview(t) ? " ⚠" : ""}</span>
                        : <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.status === "agreed"
                        ? <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-semibold"><CheckCircle2 size={11} /> Agreed</span>
                        : <button onClick={() => agree(t.id)} className="text-[10px] text-[var(--color-primary)] hover:underline">Mark agreed</button>}
                    </td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => remove(t.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
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

// ── #13 Joint-Reconciliation Statement Export ────────────────────────────────
function JointReconExport({ live }: { live: Live[] }) {
  const { store } = useApp();
  const { firm } = store;
  const [party, setParty] = useState("");
  const [asOf, setAsOf] = useState(() => new Date().toISOString().split("T")[0]);

  const options = useMemo(() => live.map(l => l.name), [live]);

  const lines = useMemo(() => {
    if (!party) return [] as { date: string; ref: string; debit: number; credit: number }[];
    const p = party.toLowerCase();
    const rows: { date: string; ref: string; debit: number; credit: number }[] = [];
    for (const i of store.invoices.filter(i => i.customer.toLowerCase() === p)) {
      rows.push({ date: i.invoiceDate, ref: i.invoiceNumber ?? `INV-${i.id.slice(0, 6)}`, debit: i.amount, credit: 0 });
    }
    for (const t of store.transactions.filter(t => t.counterparty.toLowerCase() === p)) {
      if (t.amount >= 0) rows.push({ date: t.date, ref: t.description.slice(0, 28), debit: 0, credit: t.amount });
      else rows.push({ date: t.date, ref: t.description.slice(0, 28), debit: Math.abs(t.amount), credit: 0 });
    }
    return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [party, store.invoices, store.transactions]);

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    return { debit, credit, balance: debit - credit };
  }, [lines]);

  const csv = useMemo(() => {
    if (!party) return "";
    const header = ["Date", "Reference", "Debit", "Credit", "Running Balance"];
    let run = 0;
    const body = lines.map(l => { run += l.debit - l.credit; return [l.date, `"${l.ref.replace(/"/g, "'")}"`, l.debit.toFixed(2), l.credit.toFixed(2), run.toFixed(2)].join(","); });
    return [
      `Statement of Account between ${firm?.legalName || firm?.name || "Our company"} and ${party} as on ${asOf}`,
      header.join(","),
      ...body,
      ["", "TOTAL", totals.debit.toFixed(2), totals.credit.toFixed(2), totals.balance.toFixed(2)].join(","),
    ].join("\n");
  }, [party, lines, totals, asOf, firm]);

  const download = () => {
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `joint-soa-${party.replace(/\s+/g, "-").toLowerCase()}-${asOf}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Statement exported as CSV");
  };
  const copyCsv = () => { if (!csv) return; navigator.clipboard?.writeText(csv).then(() => toast.success("Copied"), () => toast.error("Couldn't copy")); };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileSpreadsheet size={14} className="text-[var(--color-primary)]" /> Joint-Reconciliation Statement Export</h3>
        <p className="text-xs text-[var(--color-muted)]">Generate a clean statement of account with a running balance for a counterparty and export it as CSV — send it across so both sides reconcile against one shared document.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Counterparty</label>
            <input list="net-jr-parties" value={party} onChange={e => setParty(e.target.value)} placeholder="Select or type" className={INP} />
            <datalist id="net-jr-parties">{options.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">As on date</label>
            <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      {!party ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Select a counterparty to build a joint statement.</p>
      ) : lines.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No ledger movements found for {party}.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total debit", value: formatAmount(totals.debit), color: "text-[var(--color-text)]" },
              { label: "Total credit", value: formatAmount(totals.credit), color: "text-[var(--color-text)]" },
              { label: "Closing balance", value: formatAmount(Math.abs(totals.balance)), color: totals.balance >= 0 ? "text-green-400" : "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={download} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><FileSpreadsheet size={13} /> Download CSV</button>
            <button onClick={copyCsv} className="flex items-center gap-1.5 border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-4 py-2 text-sm font-medium"><Copy size={13} /> Copy</button>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Date", "Reference", "Debit", "Credit", "Balance"].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {(() => { let run = 0; return lines.map((l, idx) => { run += l.debit - l.credit; return (
                    <tr key={idx} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{l.date}</td>
                      <td className="px-4 py-2.5">{l.ref}</td>
                      <td className="px-4 py-2.5 tabular-nums">{l.debit > 0 ? formatCurrency(l.debit) : "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{l.credit > 0 ? formatCurrency(l.credit) : "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums font-medium">{formatCurrency(run)}</td>
                    </tr>
                  ); }); })()}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── #14 Counterparty Payment-History Timeline ────────────────────────────────
function PaymentTimeline({ live }: { live: Live[] }) {
  const { store } = useApp();
  const [party, setParty] = useState("");
  const options = useMemo(() => live.map(l => l.name), [live]);

  const events = useMemo(() => {
    if (!party) return [] as { date: string; label: string; amount: number; kind: "in" | "out" | "invoice" }[];
    const p = party.toLowerCase();
    const evs: { date: string; label: string; amount: number; kind: "in" | "out" | "invoice" }[] = [];
    for (const i of store.invoices.filter(i => i.customer.toLowerCase() === p)) {
      evs.push({ date: i.invoiceDate, label: `Invoice ${i.invoiceNumber ?? i.id.slice(0, 6)} raised`, amount: i.amount, kind: "invoice" });
    }
    for (const t of store.transactions.filter(t => t.counterparty.toLowerCase() === p)) {
      evs.push({ date: t.date, label: t.description.slice(0, 40), amount: Math.abs(t.amount), kind: t.amount >= 0 ? "in" : "out" });
    }
    return evs.sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [party, store.invoices, store.transactions]);

  const stats = useMemo(() => {
    const inflow = events.filter(e => e.kind === "in").reduce((s, e) => s + e.amount, 0);
    const outflow = events.filter(e => e.kind === "out").reduce((s, e) => s + e.amount, 0);
    const dates = events.map(e => e.date).filter(Boolean).sort();
    const firstSeen = dates[0];
    const monthsActive = firstSeen ? Math.max(1, Math.round(differenceInCalendarDays(new Date(), parseISO(firstSeen)) / 30)) : 0;
    return { inflow, outflow, count: events.length, monthsActive, firstSeen };
  }, [events]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><History size={14} className="text-[var(--color-primary)]" /> Counterparty Payment-History Timeline</h3>
        <p className="text-xs text-[var(--color-muted)]">A chronological feed of every invoice and payment with one counterparty — see the full trade history at a glance instead of scrolling through scattered transactions.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Counterparty</label>
          <input list="net-pt-parties" value={party} onChange={e => setParty(e.target.value)} placeholder="Select or type" className={`${INP} max-w-md`} />
          <datalist id="net-pt-parties">{options.map(o => <option key={o} value={o} />)}</datalist>
        </div>
      </div>

      {!party ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Select a counterparty to view their history.</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No history found for {party}.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Money in", value: formatAmount(stats.inflow), color: "text-green-400", sub: "" },
              { label: "Money out", value: formatAmount(stats.outflow), color: "text-red-400", sub: "" },
              { label: "Events", value: String(stats.count), color: "text-[var(--color-text)]", sub: "" },
              { label: "Relationship", value: stats.monthsActive ? `${stats.monthsActive} mo` : "—", color: "text-[var(--color-text)]", sub: stats.firstSeen ? `since ${stats.firstSeen}` : "" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>{k.sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>}</div>
            ))}
          </div>
          <div className={`${CARD} p-4`}>
            <div className="relative pl-4 border-l border-[var(--color-border)] space-y-4">
              {events.map((e, idx) => (
                <div key={idx} className="relative">
                  <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ${e.kind === "in" ? "bg-green-400" : e.kind === "out" ? "bg-red-400" : "bg-[var(--color-primary)]"}`} />
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{e.label}</p>
                      <p className="text-[10px] text-[var(--color-muted)]">{e.date} · {e.kind === "in" ? "Payment received" : e.kind === "out" ? "Payment made" : "Invoice"}</p>
                    </div>
                    <p className={`text-sm font-bold tabular-nums ${e.kind === "in" ? "text-green-400" : e.kind === "out" ? "text-red-400" : "text-[var(--color-text)]"}`}>{formatCurrency(e.amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── #15 Network Referral Tracker ─────────────────────────────────────────────
type Referral = { id: string; referredBy: string; newParty: string; expectedValue: number; rewardType: "discount" | "cash" | "credit-note" | "none"; rewardAmount: number; status: "pending" | "converted" | "rewarded"; date: string };
function ReferralTracker() {
  const [refs, setRefs] = useFeatureState<Referral[]>("net-referrals", []);
  const [referredBy, setReferredBy] = useState("");
  const [newParty, setNewParty] = useState("");
  const [expectedValue, setExpectedValue] = useState("");
  const [rewardType, setRewardType] = useState<Referral["rewardType"]>("discount");
  const [rewardAmount, setRewardAmount] = useState("");

  const add = () => {
    if (!referredBy.trim() || !newParty.trim()) { toast.error("Enter referrer and new party"); return; }
    setRefs([...refs, {
      id: crypto.randomUUID(), referredBy: referredBy.trim(), newParty: newParty.trim(),
      expectedValue: Math.max(0, parseFloat(expectedValue) || 0), rewardType,
      rewardAmount: Math.max(0, parseFloat(rewardAmount) || 0), status: "pending", date: new Date().toISOString().split("T")[0],
    }]);
    setReferredBy(""); setNewParty(""); setExpectedValue(""); setRewardAmount("");
    toast.success("Referral logged");
  };
  const advance = (id: string, status: Referral["status"]) => setRefs(refs.map(r => r.id === id ? { ...r, status } : r));
  const remove = (id: string) => setRefs(refs.filter(r => r.id !== id));

  const converted = refs.filter(r => r.status !== "pending");
  const pipeline = refs.filter(r => r.status === "pending").reduce((s, r) => s + r.expectedValue, 0);
  const rewardsOwed = refs.filter(r => r.status === "converted").reduce((s, r) => s + r.rewardAmount, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><UserPlus size={14} className="text-[var(--color-primary)]" /> Network Referral Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Track who in your network introduced which new counterparty, the expected trade value, and any reward owed — so referrals are credited and incentives never get lost.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Referred by</label><input value={referredBy} onChange={e => setReferredBy(e.target.value)} placeholder="Existing partner" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">New party</label><input value={newParty} onChange={e => setNewParty(e.target.value)} placeholder="New lead" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Expected value (₹)</label><input type="number" value={expectedValue} onChange={e => setExpectedValue(e.target.value)} placeholder="100000" className={INP} /></div>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Reward</label>
            <select value={rewardType} onChange={e => setRewardType(e.target.value as Referral["rewardType"])} className={INP}>
              <option value="discount">Discount</option><option value="cash">Cash</option><option value="credit-note">Credit note</option><option value="none">None</option>
            </select>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Reward amt (₹)</label><input type="number" value={rewardAmount} onChange={e => setRewardAmount(e.target.value)} placeholder="2000" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Log referral</button>
      </div>

      {refs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pipeline value", value: formatAmount(pipeline), color: "text-[var(--color-text)]" },
            { label: "Converted", value: `${converted.length}/${refs.length}`, color: "text-green-400" },
            { label: "Rewards owed", value: formatAmount(rewardsOwed), color: "text-yellow-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
          ))}
        </div>
      )}

      {refs.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No referrals logged yet.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Referred by", "New party", "Expected", "Reward", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {refs.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.referredBy}</td>
                    <td className="px-4 py-2.5">{r.newParty}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.expectedValue > 0 ? formatAmount(r.expectedValue) : "—"}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.rewardType === "none" ? "—" : `${r.rewardType}${r.rewardAmount > 0 ? ` · ${formatAmount(r.rewardAmount)}` : ""}`}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${r.status === "rewarded" ? "bg-green-900/30 text-green-400 border-green-800/40" : r.status === "converted" ? "bg-blue-900/30 text-blue-400 border-blue-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {r.status === "pending" && <button onClick={() => advance(r.id, "converted")} className="text-[10px] text-blue-400 hover:underline mr-2">Converted</button>}
                      {r.status === "converted" && <button onClick={() => advance(r.id, "rewarded")} className="text-[10px] text-green-400 hover:underline mr-2">Rewarded</button>}
                      <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                    </td>
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

// ── #16 Shared Price-List Manager ────────────────────────────────────────────
type PriceItem = { id: string; sku: string; name: string; unit: string; price: number; gstPct: number };
function PriceListManager() {
  const [items, setItems] = useFeatureState<PriceItem[]>("net-price-list", []);
  const [version, setVersion] = useFeatureState<string>("net-price-list-version", new Date().toISOString().split("T")[0]);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [price, setPrice] = useState("");
  const [gstPct, setGstPct] = useState("18");

  const add = () => {
    if (!name.trim() || !price) { toast.error("Enter item name and price"); return; }
    setItems([...items, { id: crypto.randomUUID(), sku: sku.trim(), name: name.trim(), unit: unit.trim() || "pcs", price: Math.max(0, parseFloat(price) || 0), gstPct: Math.max(0, parseFloat(gstPct) || 0) }]);
    setSku(""); setName(""); setPrice("");
    setVersion(new Date().toISOString().split("T")[0]);
    toast.success("Item added — price list re-versioned");
  };
  const remove = (id: string) => { setItems(items.filter(i => i.id !== id)); setVersion(new Date().toISOString().split("T")[0]); };

  const exportCsv = () => {
    if (items.length === 0) { toast.error("Add items first"); return; }
    const csv = ["SKU,Item,Unit,Price,GST%,Price incl GST", ...items.map(i =>
      [`"${i.sku}"`, `"${i.name.replace(/"/g, "'")}"`, i.unit, i.price.toFixed(2), i.gstPct.toFixed(1), (i.price * (1 + i.gstPct / 100)).toFixed(2)].join(","))].join("\n");
    const blob = new Blob([`Price List v${version}\n${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `price-list-${version}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Price list exported");
  };

  const totalCatalogValue = items.reduce((s, i) => s + i.price, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><Tags size={14} className="text-[var(--color-primary)]" /> Shared Price-List Manager</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Maintain one versioned price list you share with buyers so invoice prices never get disputed. Export and send the latest version to every partner.</p>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-accent)] text-[var(--color-muted)] border border-[var(--color-border)]">Version {version}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">SKU</label><input value={sku} onChange={e => setSku(e.target.value)} placeholder="SKU-01" className={INP} /></div>
          <div className="col-span-2"><label className="text-[10px] text-[var(--color-muted)] block mb-1">Item</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Product name" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Unit</label><input value={unit} onChange={e => setUnit(e.target.value)} placeholder="pcs/kg" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Price (₹)</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="100" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">GST %</label><input type="number" value={gstPct} onChange={e => setGstPct(e.target.value)} className={INP} /></div>
        </div>
        <div className="flex gap-2">
          <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add item</button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-4 py-2 text-sm font-medium"><FileSpreadsheet size={13} /> Export & share</button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No items in your price list yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Items</p><p className="text-xl font-bold tabular-nums">{items.length}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Catalog list value</p><p className="text-xl font-bold tabular-nums">{formatAmount(totalCatalogValue)}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["SKU", "Item", "Unit", "Price", "GST", "Incl GST", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {items.map(i => (
                    <tr key={i.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 text-[var(--color-muted)] tabular-nums">{i.sku || "—"}</td>
                      <td className="px-4 py-2.5 font-medium">{i.name}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{i.unit}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(i.price)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{i.gstPct}%</td>
                      <td className="px-4 py-2.5 tabular-nums font-medium">{formatCurrency(i.price * (1 + i.gstPct / 100))}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => remove(i.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
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

// ── #17 Partner SLA Scorecard ────────────────────────────────────────────────
type SLARecord = { id: string; party: string; onTimeDelivery: number; quality: number; responsiveness: number; orders: number };
function PartnerSLAScorecard({ live }: { live: Live[] }) {
  const [records, setRecords] = useFeatureState<SLARecord[]>("net-sla", []);
  const [party, setParty] = useState("");
  const [onTime, setOnTime] = useState("90");
  const [quality, setQuality] = useState("90");
  const [resp, setResp] = useState("90");
  const [orders, setOrders] = useState("");

  const add = () => {
    if (!party.trim()) { toast.error("Enter a partner name"); return; }
    const clamp = (v: string) => Math.min(100, Math.max(0, parseFloat(v) || 0));
    setRecords([...records, { id: crypto.randomUUID(), party: party.trim(), onTimeDelivery: clamp(onTime), quality: clamp(quality), responsiveness: clamp(resp), orders: Math.max(0, Math.round(parseFloat(orders) || 0)) }]);
    setParty(""); setOrders("");
    toast.success("SLA scorecard saved");
  };
  const remove = (id: string) => setRecords(records.filter(r => r.id !== id));

  const options = useMemo(() => live.map(l => l.name), [live]);
  const scored = useMemo(() => records.map(r => {
    // Weighted SLA: delivery 40%, quality 40%, responsiveness 20%.
    const score = Math.round(r.onTimeDelivery * 0.4 + r.quality * 0.4 + r.responsiveness * 0.2);
    const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
    const color = score >= 85 ? "text-green-400" : score >= 70 ? "text-yellow-400" : score >= 55 ? "text-orange-400" : "text-red-400";
    return { ...r, score, grade, color };
  }).sort((a, b) => b.score - a.score), [records]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck size={14} className="text-[var(--color-primary)]" /> Partner SLA Scorecard</h3>
        <p className="text-xs text-[var(--color-muted)]">Score suppliers on on-time delivery, quality and responsiveness to build an objective vendor track record — and decide who keeps your business at renewal.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Partner</label>
            <input list="net-sla-parties" value={party} onChange={e => setParty(e.target.value)} placeholder="Supplier" className={INP} />
            <datalist id="net-sla-parties">{options.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">On-time %</label><input type="number" value={onTime} onChange={e => setOnTime(e.target.value)} className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Quality %</label><input type="number" value={quality} onChange={e => setQuality(e.target.value)} className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Responsiveness %</label><input type="number" value={resp} onChange={e => setResp(e.target.value)} className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Orders</label><input type="number" value={orders} onChange={e => setOrders(e.target.value)} placeholder="12" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Save scorecard</button>
      </div>

      {scored.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No partner scorecards yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {scored.map(r => (
            <div key={r.id} className={`${CARD} p-4`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2"><span className={`text-2xl font-bold ${r.color}`}>{r.grade}</span><div><p className="text-sm font-semibold">{r.party}</p><p className="text-[10px] text-[var(--color-muted)]">SLA score {r.score}/100 · {r.orders} orders</p></div></div>
                <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
              </div>
              <div className="mt-3 space-y-2">
                {[
                  { l: "On-time delivery", v: r.onTimeDelivery },
                  { l: "Quality", v: r.quality },
                  { l: "Responsiveness", v: r.responsiveness },
                ].map(m => (
                  <div key={m.l}>
                    <div className="flex items-center justify-between text-[11px] mb-0.5"><span>{m.l}</span><span className="tabular-nums">{m.v}%</span></div>
                    <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${m.v}%`, background: m.v >= 85 ? "#22c55e" : m.v >= 70 ? "#f59e0b" : "#ef4444" }} /></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #18 Group-Buy / Consortium Calculator ────────────────────────────────────
type BuyMember = { id: string; name: string; qty: number };
function GroupBuyCalculator() {
  const [members, setMembers] = useState<BuyMember[]>([{ id: crypto.randomUUID(), name: "My firm", qty: 100 }]);
  const [soloPrice, setSoloPrice] = useState("100");
  const [groupPrice, setGroupPrice] = useState("85");
  const [minQty, setMinQty] = useState("500");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");

  const addMember = () => {
    if (!name.trim() || !qty) { toast.error("Enter member name and quantity"); return; }
    setMembers([...members, { id: crypto.randomUUID(), name: name.trim(), qty: Math.max(0, parseFloat(qty) || 0) }]);
    setName(""); setQty("");
  };
  const remove = (id: string) => setMembers(members.filter(m => m.id !== id));

  const calc = useMemo(() => {
    const totalQty = members.reduce((s, m) => s + m.qty, 0);
    const solo = parseFloat(soloPrice) || 0;
    const group = parseFloat(groupPrice) || 0;
    const min = parseFloat(minQty) || 0;
    const qualifies = totalQty >= min;
    const effPrice = qualifies ? group : solo;
    const totalSavings = qualifies ? (solo - group) * totalQty : 0;
    const perMember = members.map(m => ({
      ...m,
      soloCost: m.qty * solo,
      groupCost: m.qty * effPrice,
      saving: qualifies ? m.qty * (solo - group) : 0,
    }));
    return { totalQty, qualifies, min, effPrice, totalSavings, perMember, solo, group };
  }, [members, soloPrice, groupPrice, minQty]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Group-Buy / Consortium Calculator</h3>
        <p className="text-xs text-[var(--color-muted)]">Pool orders with other small buyers to clear a supplier's volume tier and unlock a lower price — see exactly how much each member saves once you cross the threshold.</p>
        <div className="grid grid-cols-3 gap-2">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Solo price / unit (₹)</label><input type="number" value={soloPrice} onChange={e => setSoloPrice(e.target.value)} className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Group price / unit (₹)</label><input type="number" value={groupPrice} onChange={e => setGroupPrice(e.target.value)} className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Min qty for tier</label><input type="number" value={minQty} onChange={e => setMinQty(e.target.value)} className={INP} /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Add member</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Buyer name" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Quantity</label><input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="200" className={INP} /></div>
          <button onClick={addMember} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add to pool</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pooled quantity", value: formatAmount(calc.totalQty), color: "text-[var(--color-text)]", sub: `tier needs ${formatAmount(calc.min)}` },
          { label: "Tier status", value: calc.qualifies ? "Qualifies" : "Below tier", color: calc.qualifies ? "text-green-400" : "text-yellow-400", sub: calc.qualifies ? "" : `${formatAmount(Math.max(0, calc.min - calc.totalQty))} more` },
          { label: "Effective price", value: formatCurrency(calc.effPrice), color: "text-[var(--color-primary)]", sub: `vs ${formatCurrency(calc.solo)} solo` },
          { label: "Total pool saving", value: formatAmount(calc.totalSavings), color: "text-green-400", sub: "across all members" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>{k.sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>}</div>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Member", "Qty", "Solo cost", "Group cost", "Saving", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {calc.perMember.map(m => (
                <tr key={m.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{m.name}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatAmount(m.qty)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(m.soloCost)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(m.groupCost)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-green-400">{m.saving > 0 ? formatCurrency(m.saving) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">{m.name !== "My firm" && <button onClick={() => remove(m.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── #19 Warm-Intro / Connection Requester ────────────────────────────────────
function WarmIntroRequester({ live }: { live: Live[] }) {
  const { store } = useApp();
  const { firm } = store;
  const [connector, setConnector] = useState("");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [tone, setTone] = useState<"formal" | "friendly">("friendly");

  const options = useMemo(() => live.map(l => l.name), [live]);
  const me = firm?.legalName || firm?.name || "our firm";

  const message = useMemo(() => {
    if (!connector.trim() || !target.trim()) return "";
    const greeting = tone === "formal" ? `Dear ${connector.trim()},` : `Hi ${connector.trim()},`;
    const ask = tone === "formal"
      ? `I am writing to request a warm introduction to ${target.trim()}.`
      : `Hope you're well! Could you do me a favour and introduce me to ${target.trim()}?`;
    const why = reason.trim() ? ` ${reason.trim()}` : ` We're keen to explore a trade relationship with them.`;
    const close = tone === "formal"
      ? `If you are comfortable making this connection, I would be grateful. Happy to share more context for you to forward.`
      : `If you're up for connecting us, that'd be great — happy to send a blurb you can just forward on.`;
    return [greeting, "", `${ask}${why}`, "", close, "", `Thanks a lot,`, me].join("\n");
  }, [connector, target, reason, tone, me]);

  const copy = () => { if (!message) { toast.error("Pick a connector and target first"); return; } navigator.clipboard?.writeText(message).then(() => toast.success("Intro message copied"), () => toast.error("Couldn't copy")); };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Send size={14} className="text-[var(--color-primary)]" /> Warm-Intro / Connection Requester</h3>
        <p className="text-xs text-[var(--color-muted)]">Compose a ready-to-send message asking a partner in your network to introduce you to a new counterparty — warm intros convert far better than cold outreach.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Ask (existing partner)</label>
            <input list="net-intro-conn" value={connector} onChange={e => setConnector(e.target.value)} placeholder="Who can connect you" className={INP} />
            <datalist id="net-intro-conn">{options.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Target (who you want to meet)</label>
            <input value={target} onChange={e => setTarget(e.target.value)} placeholder="New counterparty" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tone</label>
            <select value={tone} onChange={e => setTone(e.target.value as "formal" | "friendly")} className={INP}>
              <option value="friendly">Friendly</option><option value="formal">Formal</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Reason / context (optional)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. We supply packaging and they're scaling fast." className={INP} />
        </div>
      </div>

      {!message ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Pick a connector and a target to draft the message.</p>
      ) : (
        <>
          <button onClick={copy} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Copy size={13} /> Copy message</button>
          <div className={`${CARD} p-4`}><p className="text-xs font-semibold mb-2 text-[var(--color-muted)]">Draft intro request</p><pre className="text-sm whitespace-pre-wrap font-sans text-[var(--color-text)] leading-relaxed">{message}</pre></div>
        </>
      )}
    </div>
  );
}

// ── #20 Partner Risk Watchlist ───────────────────────────────────────────────
type WatchItem = { id: string; party: string; risk: "low" | "medium" | "high"; reason: string; exposure: number; action: string; addedAt: string };
function RiskWatchlist({ live }: { live: Live[] }) {
  const { store } = useApp();
  const [items, setItems] = useFeatureState<WatchItem[]>("net-watchlist", []);
  const [party, setParty] = useState("");
  const [risk, setRisk] = useState<WatchItem["risk"]>("medium");
  const [reason, setReason] = useState("Slow payments");
  const [action, setAction] = useState("");

  const REASONS = ["Slow payments", "Stopped GST filing", "Bounced cheque", "Disputed invoice", "Bank-detail change", "Insolvency signal", "Over credit limit", "Other"] as const;

  // Suggest exposure from open invoices for the selected party.
  const exposureFor = (name: string) => store.invoices.filter(i => i.customer.toLowerCase() === name.toLowerCase() && i.status !== "paid").reduce((s, i) => s + i.amount, 0);

  const add = () => {
    if (!party.trim()) { toast.error("Enter a counterparty"); return; }
    setItems([...items, { id: crypto.randomUUID(), party: party.trim(), risk, reason, exposure: exposureFor(party.trim()), action: action.trim(), addedAt: new Date().toISOString().split("T")[0] }]);
    setParty(""); setAction("");
    toast.success("Added to risk watchlist");
  };
  const setRiskLevel = (id: string, r: WatchItem["risk"]) => setItems(items.map(i => i.id === id ? { ...i, risk: r } : i));
  const remove = (id: string) => setItems(items.filter(i => i.id !== id));

  const options = useMemo(() => live.map(l => l.name), [live]);
  const highExposure = items.filter(i => i.risk === "high").reduce((s, i) => s + i.exposure, 0);
  const riskColor = (r: WatchItem["risk"]) => r === "high" ? "bg-red-900/30 text-red-400 border-red-800/40" : r === "medium" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-green-900/30 text-green-400 border-green-800/40";

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Partner Risk Watchlist</h3>
        <p className="text-xs text-[var(--color-muted)]">Flag counterparties showing distress signals — slow pay, filing gaps, bank-detail changes — with your exposure and the action to take. Your early-warning list before bad debt hits.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Counterparty</label>
            <input list="net-wl-parties" value={party} onChange={e => setParty(e.target.value)} placeholder="Party name" className={INP} />
            <datalist id="net-wl-parties">{options.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Risk</label>
            <select value={risk} onChange={e => setRisk(e.target.value as WatchItem["risk"])} className={INP}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
          </div>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Signal</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className={INP}>{REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Watch</button>
        </div>
        <input value={action} onChange={e => setAction(e.target.value)} placeholder="Action to take (e.g. move to advance payment, hold orders)" className={INP} />
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "On watchlist", value: String(items.length), color: "text-[var(--color-text)]" },
            { label: "High risk", value: String(items.filter(i => i.risk === "high").length), color: "text-red-400" },
            { label: "High-risk exposure", value: formatAmount(highExposure), color: "text-red-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No partners on the watchlist. Flag a risky counterparty above.</p>
      ) : (
        <div className="space-y-2">
          {items.map(i => (
            <div key={i.id} className={`${CARD} p-4`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold">{i.party} <span className={`ml-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${riskColor(i.risk)}`}>{i.risk} risk</span></p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{i.reason} · flagged {i.addedAt}{i.action ? ` · Action: ${i.action}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-red-400">{i.exposure > 0 ? formatCurrency(i.exposure) : "—"}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">open exposure</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[10px] text-[var(--color-muted)]">Set risk:</span>
                {(["low", "medium", "high"] as const).map(r => (
                  <button key={r} onClick={() => setRiskLevel(i.id, r)} className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${i.risk === r ? riskColor(r) : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{r}</button>
                ))}
                <button onClick={() => remove(i.id)} className="ml-auto text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #21 Networking Event / Meeting Log ───────────────────────────────────────
type MeetingEntry = { id: string; party: string; date: string; channel: "in-person" | "call" | "video" | "event"; summary: string; followUp: string; followUpDone: boolean };
function MeetingLog({ live }: { live: Live[] }) {
  const [entries, setEntries] = useFeatureState<MeetingEntry[]>("net-meetings", []);
  const [party, setParty] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [channel, setChannel] = useState<MeetingEntry["channel"]>("call");
  const [summary, setSummary] = useState("");
  const [followUp, setFollowUp] = useState("");

  const add = () => {
    if (!party.trim()) { toast.error("Enter a counterparty"); return; }
    setEntries([{ id: crypto.randomUUID(), party: party.trim(), date, channel, summary: summary.trim(), followUp: followUp.trim(), followUpDone: false }, ...entries]);
    setParty(""); setSummary(""); setFollowUp("");
    toast.success("Meeting logged");
  };
  const toggleFollowUp = (id: string) => setEntries(entries.map(e => e.id === id ? { ...e, followUpDone: !e.followUpDone } : e));
  const remove = (id: string) => setEntries(entries.filter(e => e.id !== id));

  const options = useMemo(() => live.map(l => l.name), [live]);
  const openFollowUps = entries.filter(e => e.followUp && !e.followUpDone).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Networking Event / Meeting Log</h3>
        <p className="text-xs text-[var(--color-muted)]">Keep a running CRM-style log of every meeting and call with partners — what was discussed and the follow-up due — so relationships never go cold and nothing slips.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Counterparty</label>
            <input list="net-ml-parties" value={party} onChange={e => setParty(e.target.value)} placeholder="Party name" className={INP} />
            <datalist id="net-ml-parties">{options.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} /></div>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as MeetingEntry["channel"])} className={INP}><option value="call">Call</option><option value="video">Video</option><option value="in-person">In-person</option><option value="event">Event</option></select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Log</button>
        </div>
        <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="What was discussed?" className={INP} />
        <input value={followUp} onChange={e => setFollowUp(e.target.value)} placeholder="Follow-up action (optional)" className={INP} />
      </div>

      {entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Logged interactions</p><p className="text-xl font-bold tabular-nums">{entries.length}</p></div>
          <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Open follow-ups</p><p className={`text-xl font-bold tabular-nums ${openFollowUps > 0 ? "text-yellow-400" : "text-green-400"}`}>{openFollowUps}</p></div>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No meetings logged yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <div key={e.id} className={`${CARD} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{e.party} <span className="text-[10px] text-[var(--color-muted)] font-normal capitalize">· {e.channel} · {e.date}</span></p>
                  {e.summary && <p className="text-[11px] text-[var(--color-muted)] mt-1">{e.summary}</p>}
                </div>
                <button onClick={() => remove(e.id)} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
              </div>
              {e.followUp && (
                <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={e.followUpDone} onChange={() => toggleFollowUp(e.id)} className="accent-[var(--color-primary)]" />
                  <span className={e.followUpDone ? "line-through text-[var(--color-muted)]" : "text-[var(--color-text)]"}>Follow-up: {e.followUp}</span>
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #22 Mutual-Credit Netting Calculator ─────────────────────────────────────
type NetEntry = { id: string; party: string; theyOweMe: number; iOweThem: number };
function MutualNetting() {
  const [entries, setEntries] = useFeatureState<NetEntry[]>("net-netting", []);
  const [party, setParty] = useState("");
  const [theyOweMe, setTheyOweMe] = useState("");
  const [iOweThem, setIOweThem] = useState("");

  const add = () => {
    if (!party.trim()) { toast.error("Enter a counterparty"); return; }
    setEntries([...entries, { id: crypto.randomUUID(), party: party.trim(), theyOweMe: Math.max(0, parseFloat(theyOweMe) || 0), iOweThem: Math.max(0, parseFloat(iOweThem) || 0) }]);
    setParty(""); setTheyOweMe(""); setIOweThem("");
    toast.success("Position added");
  };
  const remove = (id: string) => setEntries(entries.filter(e => e.id !== id));

  const calc = useMemo(() => {
    const rows = entries.map(e => {
      const net = e.theyOweMe - e.iOweThem;
      return { ...e, net, gross: e.theyOweMe + e.iOweThem };
    });
    const grossReceivable = rows.reduce((s, r) => s + r.theyOweMe, 0);
    const grossPayable = rows.reduce((s, r) => s + r.iOweThem, 0);
    const grossSettlement = grossReceivable + grossPayable;
    const netSettlement = rows.reduce((s, r) => s + Math.abs(r.net), 0);
    const reduction = grossSettlement > 0 ? 1 - netSettlement / grossSettlement : 0;
    return { rows, grossReceivable, grossPayable, grossSettlement, netSettlement, reduction };
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Mutual-Credit Netting Calculator</h3>
        <p className="text-xs text-[var(--color-muted)]">When you both buy from and sell to the same partner, net the two positions so only the difference moves — fewer payments, less working capital tied up, lower transfer cost.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Counterparty</label><input value={party} onChange={e => setParty(e.target.value)} placeholder="Party name" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">They owe me (₹)</label><input type="number" value={theyOweMe} onChange={e => setTheyOweMe(e.target.value)} placeholder="80000" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">I owe them (₹)</label><input type="number" value={iOweThem} onChange={e => setIOweThem(e.target.value)} placeholder="55000" className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add a partner you both owe and are owed to see the netting benefit.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Gross to move", value: formatAmount(calc.grossSettlement), color: "text-[var(--color-text)]", sub: "without netting" },
              { label: "Net to move", value: formatAmount(calc.netSettlement), color: "text-[var(--color-primary)]", sub: "after netting" },
              { label: "Payments avoided", value: formatAmount(calc.grossSettlement - calc.netSettlement), color: "text-green-400", sub: "cash kept in hand" },
              { label: "Settlement reduction", value: `${Math.round(calc.reduction * 100)}%`, color: "text-green-400", sub: "fewer rupees transferred" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p><p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p></div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Counterparty", "They owe me", "I owe them", "Net position", "Who pays", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {calc.rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.party}</td>
                      <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(r.theyOweMe)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(r.iOweThem)}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-medium ${r.net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.abs(r.net))}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.net === 0 ? "Square" : r.net > 0 ? "They pay me" : "I pay them"}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
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

// ── #24 Partner-Tier Scheme ──────────────────────────────────────────────────
// Volume-based tier bands (Bronze/Silver/Gold/Platinum) with editable thresholds and
// per-tier perks. Each live counterparty is assigned a tier from its total trade value.
type TierBand = { id: string; name: string; minVolume: number; perk: string };
const DEFAULT_TIERS: TierBand[] = [
  { id: "bronze", name: "Bronze", minVolume: 0, perk: "Standard terms" },
  { id: "silver", name: "Silver", minVolume: 500000, perk: "Net-15 terms" },
  { id: "gold", name: "Gold", minVolume: 2000000, perk: "Net-30 + 1% rebate" },
  { id: "platinum", name: "Platinum", minVolume: 5000000, perk: "Net-45 + 2% rebate, priority stock" },
];
function PartnerTierScheme({ live }: { live: Live[] }) {
  const [tiers, setTiers] = useFeatureState<TierBand[]>("net-tier-scheme", DEFAULT_TIERS);

  const sorted = useMemo(() => [...tiers].sort((a, b) => a.minVolume - b.minVolume), [tiers]);
  const tierFor = (vol: number): TierBand => {
    let chosen = sorted[0];
    for (const t of sorted) { if (vol >= t.minVolume) chosen = t; }
    return chosen;
  };

  const ranked = useMemo(() => {
    return live.map(l => {
      const vol = l.inflow + l.outflow + l.invoiced;
      return { name: l.name, vol, tier: tierFor(vol) };
    }).sort((a, b) => b.vol - a.vol);
  }, [live, sorted]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of ranked) m.set(r.tier.id, (m.get(r.tier.id) ?? 0) + 1);
    return m;
  }, [ranked]);

  const setMin = (id: string, v: string) =>
    setTiers(tiers.map(t => t.id === id ? { ...t, minVolume: Math.max(0, parseFloat(v) || 0) } : t));
  const setPerk = (id: string, v: string) =>
    setTiers(tiers.map(t => t.id === id ? { ...t, perk: v } : t));

  const tierColor = (id: string) =>
    id === "platinum" ? "text-cyan-400" : id === "gold" ? "text-yellow-400" : id === "silver" ? "text-slate-300" : "text-amber-600";

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Award size={14} className="text-[var(--color-primary)]" /> Partner-Tier Scheme</h3>
        <p className="text-xs text-[var(--color-muted)]">Set volume bands and the perk each tier earns. Headroom places every counterparty from your books into a tier by their total trade value — use it to reward your best partners with better terms.</p>
        <div className="space-y-2">
          {sorted.map(t => (
            <div key={t.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
              <p className={`md:col-span-2 text-sm font-semibold ${tierColor(t.id)}`}>{t.name}</p>
              <div className="md:col-span-3">
                <label className="text-[10px] text-[var(--color-muted)] block mb-1">Min trade volume (₹)</label>
                <input type="number" value={t.minVolume} onChange={e => setMin(t.id, e.target.value)} className={INP} />
              </div>
              <div className="md:col-span-6">
                <label className="text-[10px] text-[var(--color-muted)] block mb-1">Perk</label>
                <input value={t.perk} onChange={e => setPerk(t.id, e.target.value)} className={INP} />
              </div>
              <p className="md:col-span-1 text-xs text-[var(--color-muted)] text-right tabular-nums">{counts.get(t.id) ?? 0}</p>
            </div>
          ))}
        </div>
      </div>

      {ranked.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No counterparties yet — import transactions or invoices and partners will be tiered automatically.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Partners by tier</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Partner", "Trade volume", "Tier", "Perk earned"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {ranked.slice(0, 20).map(r => (
                  <tr key={r.name} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatAmount(r.vol)}</td>
                    <td className={`px-4 py-2.5 font-semibold ${tierColor(r.tier.id)}`}>{r.tier.name}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.tier.perk}</td>
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

// ── #25 Network Payment-Terms Benchmark ──────────────────────────────────────
// Log the agreed days-to-pay per partner, then see where each sits against your own
// network average and a sector reference, so you can renegotiate outliers (feature #79/#82).
type TermsEntry = { id: string; party: string; agreedDays: number; actualDays: number };
function PaymentTermsBenchmark() {
  const [entries, setEntries] = useFeatureState<TermsEntry[]>("net-terms-bench", []);
  const [party, setParty] = useState("");
  const [agreedDays, setAgreedDays] = useState("");
  const [actualDays, setActualDays] = useState("");
  const [sector, setSector] = useState("45");

  const add = () => {
    if (!party.trim()) { toast.error("Enter a partner name"); return; }
    setEntries([...entries, {
      id: crypto.randomUUID(), party: party.trim(),
      agreedDays: Math.max(0, Math.round(parseFloat(agreedDays) || 0)),
      actualDays: Math.max(0, Math.round(parseFloat(actualDays) || 0)),
    }]);
    setParty(""); setAgreedDays(""); setActualDays("");
    toast.success("Partner term logged");
  };
  const remove = (id: string) => setEntries(entries.filter(e => e.id !== id));

  const sectorRef = Math.max(0, Math.round(parseFloat(sector) || 0));
  const stats = useMemo(() => {
    if (entries.length === 0) return { avgAgreed: 0, avgActual: 0, slippage: 0 };
    const avgAgreed = Math.round(entries.reduce((s, e) => s + e.agreedDays, 0) / entries.length);
    const avgActual = Math.round(entries.reduce((s, e) => s + e.actualDays, 0) / entries.length);
    return { avgAgreed, avgActual, slippage: avgActual - avgAgreed };
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Timer size={14} className="text-[var(--color-primary)]" /> Payment-Terms Benchmark</h3>
        <p className="text-xs text-[var(--color-muted)]">Log the agreed and actual days-to-pay for each partner and benchmark them against your network average and a sector reference. Outliers paying far slower than agreed are renegotiation candidates.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Partner</label><input value={party} onChange={e => setParty(e.target.value)} placeholder="Buyer / supplier" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Agreed days</label><input type="number" value={agreedDays} onChange={e => setAgreedDays(e.target.value)} placeholder="30" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Actual days</label><input type="number" value={actualDays} onChange={e => setActualDays(e.target.value)} placeholder="42" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Sector ref (days)</label><input type="number" value={sector} onChange={e => setSector(e.target.value)} className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Log</button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No terms logged yet. Add a partner's agreed and actual days-to-pay to start benchmarking.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Avg agreed", value: `${stats.avgAgreed} d`, color: "text-[var(--color-text)]" },
              { label: "Avg actual", value: `${stats.avgActual} d`, color: "text-[var(--color-text)]" },
              { label: "Avg slippage", value: `${stats.slippage >= 0 ? "+" : ""}${stats.slippage} d`, color: stats.slippage > 0 ? "text-red-400" : "text-green-400" },
              { label: "Sector reference", value: `${sectorRef} d`, color: "text-[var(--color-primary)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Partner", "Agreed", "Actual", "Slippage", "vs sector", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {[...entries].sort((a, b) => (b.actualDays - b.agreedDays) - (a.actualDays - a.agreedDays)).map(e => {
                    const slip = e.actualDays - e.agreedDays;
                    const vsSector = e.actualDays - sectorRef;
                    return (
                      <tr key={e.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{e.party}</td>
                        <td className="px-4 py-2.5 tabular-nums">{e.agreedDays} d</td>
                        <td className="px-4 py-2.5 tabular-nums">{e.actualDays} d</td>
                        <td className={`px-4 py-2.5 tabular-nums font-medium ${slip > 0 ? "text-red-400" : "text-green-400"}`}>{slip >= 0 ? "+" : ""}{slip} d</td>
                        <td className={`px-4 py-2.5 tabular-nums ${vsSector > 0 ? "text-red-400" : "text-green-400"}`}>{vsSector >= 0 ? "+" : ""}{vsSector} d</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => remove(e.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── #26 Co-Marketing / Joint-Campaign Planner ────────────────────────────────
type Campaign = { id: string; partner: string; title: string; channel: string; myBudget: number; theirBudget: number; date: string; status: "planned" | "live" | "done" };
function CoMarketingPlanner({ live }: { live: Live[] }) {
  const [items, setItems] = useFeatureState<Campaign[]>("net-co-market", []);
  const [partner, setPartner] = useState("");
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("WhatsApp");
  const [myBudget, setMyBudget] = useState("");
  const [theirBudget, setTheirBudget] = useState("");
  const [date, setDate] = useState("");

  const add = () => {
    if (!partner.trim() || !title.trim()) { toast.error("Enter a partner and campaign title"); return; }
    setItems([...items, {
      id: crypto.randomUUID(), partner: partner.trim(), title: title.trim(), channel,
      myBudget: Math.max(0, parseFloat(myBudget) || 0), theirBudget: Math.max(0, parseFloat(theirBudget) || 0),
      date: date || format(new Date(), "yyyy-MM-dd"), status: "planned",
    }]);
    setPartner(""); setTitle(""); setMyBudget(""); setTheirBudget(""); setDate("");
    toast.success("Joint campaign added");
  };
  const cycle = (id: string) => setItems(items.map(c => c.id === id
    ? { ...c, status: c.status === "planned" ? "live" : c.status === "live" ? "done" : "planned" } : c));
  const remove = (id: string) => setItems(items.filter(c => c.id !== id));

  const totalMine = items.reduce((s, c) => s + c.myBudget, 0);
  const totalTheirs = items.reduce((s, c) => s + c.theirBudget, 0);
  const partyOptions = [...new Set(live.map(l => l.name))];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Megaphone size={14} className="text-[var(--color-primary)]" /> Co-Marketing / Joint-Campaign Planner</h3>
        <p className="text-xs text-[var(--color-muted)]">Plan joint promotions with a trade partner — split the spend, pick a channel and date, and track each campaign from planned to live to done. Shared budgets let small firms market like big ones.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Partner</label>
            <input list="net-comarket-parties" value={partner} onChange={e => setPartner(e.target.value)} placeholder="Co-brand partner" className={INP} />
            <datalist id="net-comarket-parties">{partyOptions.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Diwali bundle" className={INP} /></div>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value)} className={INP}>
              {["WhatsApp", "Email", "ONDC", "In-store", "Social", "Event"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">My budget (₹)</label><input type="number" value={myBudget} onChange={e => setMyBudget(e.target.value)} placeholder="20000" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Their budget (₹)</label><input type="number" value={theirBudget} onChange={e => setTheirBudget(e.target.value)} placeholder="20000" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add campaign</button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No joint campaigns yet. Plan one with a partner above.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Campaigns", value: String(items.length), color: "text-[var(--color-text)]", sub: `${items.filter(c => c.status === "live").length} live` },
              { label: "My committed spend", value: formatAmount(totalMine), color: "text-[var(--color-text)]", sub: "" },
              { label: "Partner committed", value: formatAmount(totalTheirs), color: "text-[var(--color-primary)]", sub: `${formatAmount(totalMine + totalTheirs)} combined` },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>{k.sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>}</div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map(c => (
              <div key={c.id} className={`${CARD} p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{c.title}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">with {c.partner} · {c.channel} · {c.date}</p>
                  </div>
                  <button onClick={() => remove(c.id)} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-[11px] text-[var(--color-muted)]">Mine <span className="text-[var(--color-text)] tabular-nums">{formatAmount(c.myBudget)}</span> · Theirs <span className="text-[var(--color-text)] tabular-nums">{formatAmount(c.theirBudget)}</span></p>
                  <button onClick={() => cycle(c.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${
                      c.status === "done" ? "bg-green-900/30 text-green-400 border-green-800/40" :
                      c.status === "live" ? "bg-blue-900/30 text-blue-400 border-blue-800/40" :
                      "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                    {c.status}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── #27 Introductions Given / Received Ledger ────────────────────────────────
// Track warm introductions you make and receive across the network — reciprocity at a
// glance, so relationships stay balanced (feature #52, distinct from referral incentives).
type Intro = { id: string; date: string; direction: "given" | "received"; partner: string; toWhom: string; outcome: "pending" | "deal" | "dropped"; note: string };
function IntroductionsLedger() {
  const [intros, setIntros] = useFeatureState<Intro[]>("net-intros-ledger", []);
  const [direction, setDirection] = useState<Intro["direction"]>("given");
  const [partner, setPartner] = useState("");
  const [toWhom, setToWhom] = useState("");
  const [note, setNote] = useState("");

  const add = () => {
    if (!partner.trim() || !toWhom.trim()) { toast.error("Enter both parties"); return; }
    setIntros([{ id: crypto.randomUUID(), date: format(new Date(), "yyyy-MM-dd"), direction, partner: partner.trim(), toWhom: toWhom.trim(), outcome: "pending", note: note.trim() }, ...intros]);
    setPartner(""); setToWhom(""); setNote("");
    toast.success(direction === "given" ? "Introduction given logged" : "Introduction received logged");
  };
  const setOutcome = (id: string, outcome: Intro["outcome"]) => setIntros(intros.map(i => i.id === id ? { ...i, outcome } : i));
  const remove = (id: string) => setIntros(intros.filter(i => i.id !== id));

  const given = intros.filter(i => i.direction === "given").length;
  const received = intros.filter(i => i.direction === "received").length;
  const deals = intros.filter(i => i.outcome === "deal").length;
  const balance = given - received;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ArrowLeftRight size={14} className="text-[var(--color-primary)]" /> Introductions Ledger</h3>
        <p className="text-xs text-[var(--color-muted)]">Track the warm introductions you give and receive across your network. Keeping the give/receive balance visible keeps relationships reciprocal — the quiet engine of a referral network.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Direction</label>
            <select value={direction} onChange={e => setDirection(e.target.value as Intro["direction"])} className={INP}>
              <option value="given">I introduced</option>
              <option value="received">I was introduced</option>
            </select>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">{direction === "given" ? "Connector / me" : "Connector"}</label><input value={partner} onChange={e => setPartner(e.target.value)} placeholder="Who connected" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">To whom</label><input value={toWhom} onChange={e => setToWhom(e.target.value)} placeholder="New contact" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Note</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="Context (optional)" className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Log</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Given", value: String(given), color: "text-green-400" },
          { label: "Received", value: String(received), color: "text-blue-400" },
          { label: "Reciprocity", value: balance === 0 ? "Balanced" : balance > 0 ? `+${balance} given` : `${-balance} owed back`, color: balance >= 0 ? "text-green-400" : "text-yellow-400" },
          { label: "Turned into deals", value: String(deals), color: "text-[var(--color-primary)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
        ))}
      </div>

      {intros.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No introductions logged yet.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Date", "Direction", "Connector", "To whom", "Outcome", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {intros.map(i => (
                  <tr key={i.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 text-[var(--color-muted)] tabular-nums">{i.date}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${i.direction === "given" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-blue-900/30 text-blue-400 border-blue-800/40"}`}>
                        {i.direction === "given" ? "Given" : "Received"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium">{i.partner}</td>
                    <td className="px-4 py-2.5">{i.toWhom}{i.note && <span className="block text-[10px] text-[var(--color-muted)] font-normal">{i.note}</span>}</td>
                    <td className="px-4 py-2.5">
                      <select value={i.outcome} onChange={e => setOutcome(i.id, e.target.value as Intro["outcome"])} className="bg-transparent text-xs outline-none cursor-pointer">
                        <option value="pending">Pending</option>
                        <option value="deal">Became a deal</option>
                        <option value="dropped">Dropped</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => remove(i.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
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

// ── #28 Collaborative-Forecast Sharing ───────────────────────────────────────
// Share a forward demand forecast with a supplier so they can plan production — reduces
// the bullwhip effect (feature #78). Tracks forecast vs the last actual you commit.
type ForecastRow = { id: string; partner: string; month: string; forecastQty: number; lastActual: number };
function CollaborativeForecast({ live }: { live: Live[] }) {
  const [rows, setRows] = useFeatureState<ForecastRow[]>("net-forecast-share", []);
  const [partner, setPartner] = useState("");
  const [month, setMonth] = useState("");
  const [forecastQty, setForecastQty] = useState("");
  const [lastActual, setLastActual] = useState("");

  const add = () => {
    if (!partner.trim() || !month.trim()) { toast.error("Enter a partner and month"); return; }
    setRows([...rows, {
      id: crypto.randomUUID(), partner: partner.trim(), month: month.trim(),
      forecastQty: Math.max(0, parseFloat(forecastQty) || 0), lastActual: Math.max(0, parseFloat(lastActual) || 0),
    }]);
    setPartner(""); setMonth(""); setForecastQty(""); setLastActual("");
    toast.success("Forecast shared");
  };
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  const totalForecast = rows.reduce((s, r) => s + r.forecastQty, 0);
  const partyOptions = [...new Set(live.map(l => l.name))];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /> Collaborative-Forecast Sharing</h3>
        <p className="text-xs text-[var(--color-muted)]">Share a forward demand forecast with a supplier so they can plan production and hold the right stock. Comparing your forecast against the last actual exposes bias and tames the bullwhip effect.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Supplier</label>
            <input list="net-forecast-parties" value={partner} onChange={e => setPartner(e.target.value)} placeholder="Supplier" className={INP} />
            <datalist id="net-forecast-parties">{partyOptions.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Month</label><input value={month} onChange={e => setMonth(e.target.value)} placeholder="2026-07" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Forecast qty</label><input type="number" value={forecastQty} onChange={e => setForecastQty(e.target.value)} placeholder="1200" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Last actual</label><input type="number" value={lastActual} onChange={e => setLastActual(e.target.value)} placeholder="1000" className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Share</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No forecasts shared yet. Give a supplier a forward view of your demand.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Forecasts shared", value: String(rows.length), color: "text-[var(--color-text)]" },
              { label: "Total forecast qty", value: formatAmount(totalForecast), color: "text-[var(--color-primary)]" },
              { label: "Suppliers covered", value: String(new Set(rows.map(r => r.partner)).size), color: "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Supplier", "Month", "Forecast", "Last actual", "Change", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const pct = r.lastActual > 0 ? Math.round(((r.forecastQty - r.lastActual) / r.lastActual) * 100) : 0;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.partner}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.month}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatAmount(r.forecastQty)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.lastActual > 0 ? formatAmount(r.lastActual) : "—"}</td>
                        <td className={`px-4 py-2.5 tabular-nums font-medium ${pct > 0 ? "text-green-400" : pct < 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{r.lastActual > 0 ? `${pct >= 0 ? "+" : ""}${pct}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── #29 Partner NPS ──────────────────────────────────────────────────────────
// Capture a 0–10 "how likely to recommend" score per partner, compute Net Promoter Score
// (promoters − detractors), and flag detractors that need attention.
type NPSEntry = { id: string; partner: string; score: number; comment: string };
function PartnerNPS({ live }: { live: Live[] }) {
  const [entries, setEntries] = useFeatureState<NPSEntry[]>("net-partner-nps", []);
  const [partner, setPartner] = useState("");
  const [score, setScore] = useState("8");
  const [comment, setComment] = useState("");

  const add = () => {
    if (!partner.trim()) { toast.error("Enter a partner name"); return; }
    const s = Math.min(10, Math.max(0, Math.round(parseFloat(score) || 0)));
    setEntries([{ id: crypto.randomUUID(), partner: partner.trim(), score: s, comment: comment.trim() }, ...entries]);
    setPartner(""); setComment(""); setScore("8");
    toast.success("Partner score recorded");
  };
  const remove = (id: string) => setEntries(entries.filter(e => e.id !== id));

  const nps = useMemo(() => {
    if (entries.length === 0) return { value: 0, promoters: 0, passives: 0, detractors: 0 };
    const promoters = entries.filter(e => e.score >= 9).length;
    const detractors = entries.filter(e => e.score <= 6).length;
    const passives = entries.length - promoters - detractors;
    const value = Math.round(((promoters - detractors) / entries.length) * 100);
    return { value, promoters, passives, detractors };
  }, [entries]);

  const partyOptions = [...new Set(live.map(l => l.name))];
  const cat = (s: number) => s >= 9 ? "Promoter" : s <= 6 ? "Detractor" : "Passive";
  const catColor = (s: number) => s >= 9 ? "text-green-400" : s <= 6 ? "text-red-400" : "text-yellow-400";

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Smile size={14} className="text-[var(--color-primary)]" /> Partner NPS</h3>
        <p className="text-xs text-[var(--color-muted)]">Record how likely each partner is to recommend working with you (0–10) and Headroom computes a Net Promoter Score. Detractors are the relationships to repair before they churn.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Partner</label>
            <input list="net-nps-parties" value={partner} onChange={e => setPartner(e.target.value)} placeholder="Buyer / supplier" className={INP} />
            <datalist id="net-nps-parties">{partyOptions.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Score (0–10)</label><input type="number" min={0} max={10} value={score} onChange={e => setScore(e.target.value)} className={INP} /></div>
          <div className="md:col-span-2"><label className="text-[10px] text-[var(--color-muted)] block mb-1">Comment</label><input value={comment} onChange={e => setComment(e.target.value)} placeholder="What they said (optional)" className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Record</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Net Promoter Score", value: String(nps.value), color: nps.value >= 50 ? "text-green-400" : nps.value >= 0 ? "text-yellow-400" : "text-red-400" },
          { label: "Promoters (9–10)", value: String(nps.promoters), color: "text-green-400" },
          { label: "Passives (7–8)", value: String(nps.passives), color: "text-yellow-400" },
          { label: "Detractors (0–6)", value: String(nps.detractors), color: "text-red-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No partner scores yet. Record one above to compute your NPS.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Partner", "Score", "Category", "Comment", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{e.partner}</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold">{e.score}/10</td>
                    <td className={`px-4 py-2.5 font-medium ${catColor(e.score)}`}>{cat(e.score)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{e.comment || "—"}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => remove(e.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
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

// ── #30 Partner Spend-Share Trend ────────────────────────────────────────────
// Tracks how each supplier's share of total monthly spend moves over time, so you
// can spot a partner you're leaning on more (or less) every month — built purely
// from outflow transactions already in the books.
function SpendShareTrend() {
  const { store } = useApp();
  const [party, setParty] = useState("");

  const monthly = useMemo(() => {
    const months = new Map<string, { total: number; byParty: Map<string, number> }>();
    for (const t of store.transactions) {
      if (t.amount >= 0) continue; // spend only
      const name = (t.counterparty || "").trim();
      if (!name || !t.date) continue;
      const m = t.date.slice(0, 7);
      const e = months.get(m) ?? { total: 0, byParty: new Map<string, number>() };
      const amt = Math.abs(t.amount);
      e.total += amt;
      e.byParty.set(name, (e.byParty.get(name) ?? 0) + amt);
      months.set(m, e);
    }
    return [...months.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-12);
  }, [store.transactions]);

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    for (const [, e] of monthly) for (const n of e.byParty.keys()) set.add(n);
    return [...set].sort();
  }, [monthly]);

  const series = useMemo(() => {
    if (!party) return [] as { month: string; share: number; spend: number }[];
    return monthly.map(([month, e]) => {
      const spend = e.byParty.get(party) ?? 0;
      return { month, spend, share: e.total > 0 ? (spend / e.total) * 100 : 0 };
    });
  }, [party, monthly]);

  const latest = series.length ? series[series.length - 1] : null;
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const delta = latest && prev ? latest.share - prev.share : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><LineChart size={14} className="text-[var(--color-primary)]" /> Partner Spend-Share Trend</h3>
        <p className="text-xs text-[var(--color-muted)]">See what share of your monthly spend goes to one supplier and how that share is trending — a rising line means growing dependence on a single partner.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Supplier</label>
          <input list="net-sst-parties" value={party} onChange={e => setParty(e.target.value)} placeholder="Select or type" className={`${INP} max-w-md`} />
          <datalist id="net-sst-parties">{suppliers.map(s => <option key={s} value={s} />)}</datalist>
        </div>
      </div>

      {!party ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Select a supplier to chart their spend-share over the last 12 months.</p>
      ) : series.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No outflow transactions found for {party}.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Latest share", value: latest ? `${latest.share.toFixed(1)}%` : "—", color: latest && latest.share > 30 ? "text-red-400" : "text-[var(--color-text)]" },
              { label: "Month-on-month", value: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pp`, color: delta > 0 ? "text-red-400" : delta < 0 ? "text-green-400" : "text-[var(--color-muted)]" },
              { label: "Latest spend", value: latest ? formatAmount(latest.spend) : "—", color: "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
            ))}
          </div>
          <div className={`${CARD} p-4 space-y-2`}>
            {series.map(s => (
              <div key={s.month}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-[var(--color-muted)] tabular-nums">{s.month}</span>
                  <span className="tabular-nums">{formatAmount(s.spend)} · {s.share.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, s.share)}%`, background: s.share > 30 ? "#ef4444" : s.share > 15 ? "#f59e0b" : "var(--color-primary)" }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Share is this supplier's spend divided by your total spend that month. A steadily rising share signals concentration risk worth diversifying.</p>
        </>
      )}
    </div>
  );
}

// ── #31 Joint-Venture P&L Split ──────────────────────────────────────────────
// Splits a shared venture's revenue, cost and profit between you and a partner by
// an agreed ownership percentage, with a per-deal settlement breakdown.
type JvDeal = { id: string; partner: string; revenue: number; cost: number; mySharePct: number; note: string };
function JointVentureSplit({ live }: { live: Live[] }) {
  const [deals, setDeals] = useFeatureState<JvDeal[]>("net-jv-split", []);
  const [partner, setPartner] = useState("");
  const [revenue, setRevenue] = useState("");
  const [cost, setCost] = useState("");
  const [mySharePct, setMySharePct] = useState("50");
  const [note, setNote] = useState("");

  const options = useMemo(() => live.map(l => l.name), [live]);

  const add = () => {
    if (!partner.trim()) { toast.error("Enter the JV partner"); return; }
    setDeals([...deals, {
      id: crypto.randomUUID(), partner: partner.trim(),
      revenue: Math.max(0, parseFloat(revenue) || 0),
      cost: Math.max(0, parseFloat(cost) || 0),
      mySharePct: Math.min(100, Math.max(0, parseFloat(mySharePct) || 0)),
      note: note.trim(),
    }]);
    setPartner(""); setRevenue(""); setCost(""); setMySharePct("50"); setNote("");
    toast.success("Joint venture recorded");
  };
  const remove = (id: string) => setDeals(deals.filter(d => d.id !== id));

  const split = (d: JvDeal) => {
    const profit = d.revenue - d.cost;
    const mine = profit * (d.mySharePct / 100);
    return { profit, mine, theirs: profit - mine };
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Split size={14} className="text-[var(--color-primary)]" /> Joint-Venture P&L Split</h3>
        <p className="text-xs text-[var(--color-muted)]">For a shared deal or co-owned venture, enter the revenue, cost and your ownership share — Headroom splits the profit between you and the partner so settlement is unambiguous.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">JV partner</label>
            <input list="net-jv-parties" value={partner} onChange={e => setPartner(e.target.value)} placeholder="Partner name" className={INP} />
            <datalist id="net-jv-parties">{options.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Revenue (₹)</label><input type="number" value={revenue} onChange={e => setRevenue(e.target.value)} placeholder="800000" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Cost (₹)</label><input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="500000" className={INP} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">My share %</label><input type="number" value={mySharePct} onChange={e => setMySharePct(e.target.value)} className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className={INP} />
      </div>

      {deals.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No joint ventures recorded yet. Add one above to split its P&L.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Partner", "Revenue", "Cost", "Profit", "My share", "My P&L", "Their P&L", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {deals.map(d => {
                  const s = split(d);
                  return (
                    <tr key={d.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{d.partner}{d.note && <span className="block text-[10px] text-[var(--color-muted)] font-normal">{d.note}</span>}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(d.revenue)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(d.cost)}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-medium ${s.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(s.profit)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{d.mySharePct}%</td>
                      <td className="px-4 py-2.5 tabular-nums font-medium">{formatCurrency(s.mine)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(s.theirs)}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => remove(d.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
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

// ── #32 Partner Payment-Reliability ──────────────────────────────────────────
// Scores how reliably each buyer pays vs their invoice due dates, using paid +
// overdue invoice data already in the books. Distinct from the per-buyer grade in
// Payment-Behaviour Rating: this ranks reliability as an on-time percentage.
function PaymentReliability() {
  const { store } = useApp();
  const today = new Date();

  const rows = useMemo(() => {
    const byParty = new Map<string, { name: string; paid: number; overdue: number; pending: number; total: number; overdueDays: number }>();
    for (const inv of store.invoices) {
      const name = (inv.customer || "").trim();
      if (!name) continue;
      const e = byParty.get(name) ?? { name, paid: 0, overdue: 0, pending: 0, total: 0, overdueDays: 0 };
      e.total += 1;
      if (inv.status === "paid") e.paid += 1;
      else if (inv.status === "overdue") {
        e.overdue += 1;
        if (inv.dueDate) e.overdueDays += Math.max(0, differenceInCalendarDays(today, parseISO(inv.dueDate)));
      } else e.pending += 1;
      byParty.set(name, e);
    }
    return [...byParty.values()].map(e => {
      const settled = e.paid + e.overdue;
      const onTimePct = settled > 0 ? (e.paid / settled) * 100 : 100;
      const avgLate = e.overdue > 0 ? Math.round(e.overdueDays / e.overdue) : 0;
      const reliable = onTimePct >= 80 && avgLate <= 7;
      return { ...e, onTimePct, avgLate, reliable };
    }).sort((a, b) => a.onTimePct - b.onTimePct);
  }, [store.invoices, today]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><CheckCheck size={14} className="text-[var(--color-primary)]" /> Partner Payment-Reliability</h3>
        <p className="text-xs text-[var(--color-muted)]">Ranks each buyer by the share of settled invoices they cleared on time and their average lateness — a quick read on who you can trust on open credit.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No invoice history yet. Raise and track invoices to measure how reliably each buyer pays.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Buyer", "On-time %", "Reliability", "Avg days late", "Paid", "Overdue", "Open"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.name} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 bg-[var(--color-bg)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${r.onTimePct}%`, background: r.onTimePct >= 80 ? "#22c55e" : r.onTimePct >= 50 ? "#f59e0b" : "#ef4444" }} />
                        </div>
                        <span className="tabular-nums text-xs">{r.onTimePct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${r.reliable ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                        {r.reliable ? <CheckCheck size={10} /> : <AlertTriangle size={10} />} {r.reliable ? "Reliable" : "Watch"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{r.avgLate > 0 ? `${r.avgLate}d` : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-400">{r.paid}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400">{r.overdue}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">On-time % counts cleared (paid) invoices against all settled ones (paid + overdue). Reliable = 80%+ on time and 7 days or less average lateness.</p>
    </div>
  );
}
