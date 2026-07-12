import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, generateId } from "@/lib/utils";
import {
  Wifi, WifiOff, RefreshCw, Calculator, MapPin, Truck, Gauge, ClipboardList,
  Sun, Route, Camera, CloudUpload, CheckCircle2, Plus, Trash2, Signal, Smartphone,
  Clock, ShoppingCart, Receipt as ReceiptIcon, Wallet, PackagePlus, PenLine, PackageCheck, Target,
  Eraser, Navigation, Eye, Activity, AlertTriangle, FileText,
  BarChart3, Banknote, Percent, HeartPulse,
  Landmark, Repeat, Map, Boxes, CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import DatePicker from "@/components/DatePicker";
import { api } from "@/lib/api";
import { txnToApiBody, txnFromApi } from "@/lib/txnApi";

// shared styles (reused from TaxPage/DebtPage convention)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

// ── Shared offline-queue shape (used by several tools + day summary) ──────────────
type QueueKind = "sale" | "collection" | "visit" | "daysheet" | "receipt";
interface QueueItem {
  id: string;
  kind: QueueKind;
  label: string;
  amount: number;      // ₹ - 0 when not money
  at: string;          // ISO timestamp captured
  synced: boolean;
  meta?: string;       // optional extra context (gps, customer, note)
  // ── Real-sync fields (flushed to the ledger on "Sync now") ──────────────────────
  customer?: string;   // resolved customer name (matched to the store master list where possible)
  mode?: "cash" | "upi"; // money mode for a collection
  syncError?: string;  // last flush error - when present the item is still pending + retryable
  syncedAt?: string;   // ISO timestamp the item actually hit the ledger
  ledgerRef?: string;  // short human ref shown in the "synced to ledger" confirmation
}

// Narrow, typed access to navigator extras without `any`.
interface ConnectionLike { effectiveType?: string; saveData?: boolean; downlink?: number }
function getConnection(): ConnectionLike | null {
  const nav = navigator as Navigator & {
    connection?: ConnectionLike; mozConnection?: ConnectionLike; webkitConnection?: ConnectionLike;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
}

// ── Live connectivity hook (navigator.onLine + online/offline events) ─────────────
function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" && "onLine" in navigator ? navigator.onLine : true,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

type FieldTab =
  | "overview" | "connectivity" | "queue" | "quickbill" | "collection"
  | "daysheet" | "lowdata" | "visits" | "summary" | "beat" | "receipt"
  | "attendance" | "order" | "outstanding" | "expense" | "stockreq"
  | "signature" | "pod" | "target" | "km" | "intel" | "meter"
  | "issue" | "quote" | "routesales" | "handover" | "discount" | "synchealth"
  | "deposit" | "frequency" | "coverage" | "samples" | "callplan";

const TABS = [
  ["overview", "Overview", Smartphone],
  ["connectivity", "Connectivity", Signal],
  ["queue", "Offline Queue", CloudUpload],
  ["quickbill", "Kirana Quick-Bill", Calculator],
  ["collection", "Field Collection", MapPin],
  ["daysheet", "Van Day-Sheet", Truck],
  ["lowdata", "Low-Data Mode", Gauge],
  ["visits", "Visit Log", ClipboardList],
  ["summary", "Day Summary", Sun],
  ["beat", "Beat / Route", Route],
  ["receipt", "Receipt Capture", Camera],
  ["attendance", "Beat Check-In", Clock],
  ["order", "Order Booking", ShoppingCart],
  ["outstanding", "Beat Outstanding", ReceiptIcon],
  ["expense", "On-the-Go Expense", Wallet],
  ["stockreq", "Stock Request", PackagePlus],
  ["signature", "Signature Capture", PenLine],
  ["pod", "Proof of Delivery", PackageCheck],
  ["target", "Daily Target", Target],
  ["km", "KM Expense Claim", Navigation],
  ["intel", "Market Intel", Eye],
  ["meter", "Asset / Meter Log", Activity],
  ["issue", "Field Issue Ticket", AlertTriangle],
  ["quote", "On-Site Quotation", FileText],
  ["routesales", "Route-Wise Sales", BarChart3],
  ["handover", "Cash Handover", Banknote],
  ["discount", "Discount Approval", Percent],
  ["synchealth", "Sync Health", HeartPulse],
  ["deposit", "Deposit Recon", Landmark],
  ["frequency", "Visit Frequency", Repeat],
  ["coverage", "Territory Coverage", Map],
  ["samples", "Sample / Demo Stock", Boxes],
  ["callplan", "Daily-Call Planner", CalendarClock],
] as const;

export default function FieldPage() {
  const tr = useT();
  const [tab, setTab] = useState<FieldTab>("overview");
  const online = useOnline();
  const [queue] = useFeatureState<QueueItem[]>("field-queue", []);
  const pending = queue.filter(q => !q.synced).length;

  // Translated labels for the primary tabs only; the rest of the tool catalog
  // keeps its static English label.
  const PRIMARY_TAB_LABELS: Partial<Record<FieldTab, string>> = {
    overview: tr("field.tab.overview"),
    connectivity: tr("field.tab.connectivity"),
    queue: tr("field.tab.queue"),
    quickbill: tr("field.tab.quickbill"),
    collection: tr("field.tab.collection"),
    daysheet: tr("field.tab.daysheet"),
    lowdata: tr("field.tab.lowdata"),
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Smartphone size={18} className="text-[var(--color-primary)]" /> {tr("field.title")}
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {tr("field.subtitle")}
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{PRIMARY_TAB_LABELS[id] ?? label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview online={online} pending={pending} queueLen={queue.length} onJump={setTab} />}
      {tab === "connectivity" && <ConnectivityStatus online={online} />}
      {tab === "queue" && <OfflineQueue online={online} />}
      {tab === "quickbill" && <KiranaQuickBill />}
      {tab === "collection" && <FieldCollection />}
      {tab === "daysheet" && <VanDaySheet />}
      {tab === "lowdata" && <LowDataMode />}
      {tab === "visits" && <VisitLog />}
      {tab === "summary" && <DaySummary />}
      {tab === "beat" && <BeatPlan />}
      {tab === "receipt" && <ReceiptCapture />}
      {tab === "attendance" && <BeatCheckIn />}
      {tab === "order" && <OrderBooking />}
      {tab === "outstanding" && <BeatOutstanding />}
      {tab === "expense" && <FieldExpense />}
      {tab === "stockreq" && <StockRequest />}
      {tab === "signature" && <SignatureCapture />}
      {tab === "pod" && <ProofOfDelivery />}
      {tab === "target" && <DailyTarget />}
      {tab === "km" && <KmExpenseClaim />}
      {tab === "intel" && <MarketIntel />}
      {tab === "meter" && <MeterLog />}
      {tab === "issue" && <FieldIssueTicket />}
      {tab === "quote" && <OnSiteQuotation />}
      {tab === "routesales" && <RouteWiseSales />}
      {tab === "handover" && <CashHandover />}
      {tab === "discount" && <DiscountApproval />}
      {tab === "synchealth" && <SyncHealth online={online} />}
      {tab === "deposit" && <DepositRecon />}
      {tab === "frequency" && <VisitFrequency />}
      {tab === "coverage" && <TerritoryCoverage />}
      {tab === "samples" && <SampleStock />}
      {tab === "callplan" && <CallPlanner />}
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────────
function Overview({ online, pending, queueLen, onJump }: { online: boolean; pending: number; queueLen: number; onJump: (t: FieldTab) => void }) {
  const { store } = useApp();
  const firm = store.firm;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className={`${CARD} p-4`}>
          <p className="text-xs text-[var(--color-muted)] mb-1 flex items-center gap-1.5">
            {online ? <Wifi size={12} className="text-green-400" /> : <WifiOff size={12} className="text-red-400" />} Network
          </p>
          <p className={`text-xl font-bold ${online ? "text-green-400" : "text-red-400"}`}>{online ? "Online" : "Offline"}</p>
          <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{online ? "Entries sync as you save" : "Entries queue locally"}</p>
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-xs text-[var(--color-muted)] mb-1 flex items-center gap-1.5"><CloudUpload size={12} className="text-yellow-400" /> Pending sync</p>
          <p className="text-xl font-bold tabular-nums text-yellow-400">{pending}</p>
          <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{queueLen} total captured offline</p>
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-xs text-[var(--color-muted)] mb-1 flex items-center gap-1.5"><Smartphone size={12} className="text-[var(--color-primary)]" /> Field for</p>
          <p className="text-xl font-bold truncate">{firm?.name ?? "Your business"}</p>
          <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Counter, van &amp; doorstep tools</p>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-2">Built for Bharat field finance</h2>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          These tools work in the browser and inside a Capacitor wrapper. Connectivity, location, camera and the data-saver
          hint are all feature-detected - if a device can't do it, the tool degrades gracefully instead of breaking. Money
          captured while offline lands in the <span className="text-[var(--color-text)]">offline queue</span> and is honestly
          marked pending until you flush it; real backend sync happens automatically when you're back online.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {TABS.filter(([id]) => id !== "overview").map(([id, label, Icon]) => (
          <button key={id} onClick={() => onJump(id as FieldTab)}
            className={`${CARD} p-3 text-left hover:border-[var(--color-primary)]/40 transition-colors`}>
            <Icon size={15} className="text-[var(--color-primary)] mb-1.5" />
            <p className="text-xs font-medium">{label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── #1 Connectivity status ──────────────────────────────────────────────────────────
function ConnectivityStatus({ online }: { online: boolean }) {
  const [conn, setConn] = useState<ConnectionLike | null>(() => getConnection());
  const [lastChange, setLastChange] = useState<string>(() => new Date().toISOString());

  useEffect(() => { setLastChange(new Date().toISOString()); }, [online]);

  useEffect(() => {
    const c = getConnection();
    if (!c) return;
    const target = c as unknown as EventTarget;
    const onChange = () => setConn(getConnection());
    target.addEventListener?.("change", onChange);
    return () => target.removeEventListener?.("change", onChange);
  }, []);

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-6 flex items-center gap-4`}>
        <div className={`relative flex items-center justify-center w-14 h-14 rounded-full ${online ? "bg-green-950/40" : "bg-red-950/40"}`}>
          {online
            ? <Wifi size={26} className="text-green-400" />
            : <WifiOff size={26} className="text-red-400" />}
          <span className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--color-surface)] ${online ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
        </div>
        <div>
          <p className={`text-lg font-bold ${online ? "text-green-400" : "text-red-400"}`}>{online ? "You're online" : "You're offline"}</p>
          <p className="text-xs text-[var(--color-muted)]">
            {online ? "Saves push to the cloud and to your other devices." : "Work continues; everything queues locally and syncs on reconnect."}
          </p>
          <p className="text-[10px] text-[var(--color-muted)] mt-1">Changed at {format(new Date(lastChange), "h:mm:ss a")}</p>
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-2 text-sm`}>
        <p className="text-sm font-semibold mb-1">Connection detail</p>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">navigator.onLine</span><span className="tabular-nums">{String(online)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Effective type</span><span className="tabular-nums">{conn?.effectiveType ?? "Not reported"}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Downlink (est.)</span><span className="tabular-nums">{conn?.downlink != null ? `${conn.downlink} Mbps` : "Not reported"}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Data-saver on</span><span className="tabular-nums">{conn?.saveData != null ? String(conn.saveData) : "Not reported"}</span></div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">
        The Network Information API (effective type / downlink / saveData) is not available in every browser - fields show
        “Not reported” where the device doesn't expose them. Online/offline detection works everywhere via navigator.onLine.
      </p>
    </div>
  );
}

// ── #2 Offline action queue ──────────────────────────────────────────────────────────
function OfflineQueue({ online }: { online: boolean }) {
  const { store, addTransaction, updateInvoice } = useApp();
  const [queue, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<QueueKind>("sale");
  const [syncing, setSyncing] = useState(false);

  const pending = queue.filter(q => !q.synced);
  const bankAccountId = store.bankAccounts[0]?.id ?? "";

  // Match a queued entry's free-text customer back to a real customer in the store
  // master list (case-insensitive). Returns the canonical stored name when found so
  // the ledger entry + invoice settlement reference the same account.
  const resolveCustomer = (raw?: string): string | undefined => {
    if (!raw) return undefined;
    const want = raw.trim().toLowerCase();
    const hit = store.invoices.find(i => i.customer.trim().toLowerCase() === want);
    return hit?.customer ?? raw.trim();
  };

  const capture = () => {
    if (!label.trim()) { toast.error("Add a short description for the entry"); return; }
    const item: QueueItem = {
      id: crypto.randomUUID(), kind, label: label.trim(),
      amount: parseFloat(amount) || 0, at: new Date().toISOString(), synced: false,
    };
    setQueue(prev => [item, ...prev]);
    setLabel(""); setAmount("");
    toast.success("Captured offline - queued for sync");
  };

  // Flush ONE queued item to the real books. Money entries become a transaction in
  // the cash book; a collection additionally settles the customer's oldest open
  // invoice so their outstanding balance actually drops. Throws on failure so the
  // caller can keep the item pending + retryable.
  // Posts to the REAL server first (POST /api/transactions via the shared txnApi
  // mapping) and mirrors the returned row into KV - a KV-only addTransaction is
  // silently wiped the next time TransactionsPage rehydrates store.transactions
  // from the server, which would make a field rep's synced cash simply vanish.
  const postTxn = async (draft: Parameters<typeof addTransaction>[0]) => {
    const created = await api.post<Record<string, unknown>>("/api/transactions", txnToApiBody(draft));
    const row = Array.isArray(created) ? created[0] : created;
    addTransaction(row ? txnFromApi(row) : draft);
  };

  const flushOne = async (q: QueueItem, settledIds?: Set<string>): Promise<{ ledgerRef: string }> => {
    const when = (q.at || new Date().toISOString()).slice(0, 10);

    if (q.kind === "collection") {
      const customer = resolveCustomer(q.customer) ?? "Field collection";
      if (q.amount <= 0) throw new Error("collection has no amount");
      // 1) Cash book: a collection settles an existing receivable, so it is NOT new
      //    revenue - booking it as revenue would double-count the original sale.
      //    Post it as a transfer (cash movement) instead.
      await postTxn({
        id: generateId(), date: when, amount: Math.abs(q.amount),
        description: `Field collection${q.mode ? ` (${q.mode.toUpperCase()})` : ""} - ${customer}`,
        category: "transfer", counterparty: customer, isRecurring: false,
        bankAccountId, notes: q.meta,
      });
      // 2) Outstanding: apply against the customer's oldest unpaid invoice, through
      //    the REAL receipts endpoint so paid_amount/GL move - a KV-only status flip
      //    reverts the moment InvoicesPage refetches from the server. Falls back to
      //    the KV mirror only if the invoice has no server row.
      //    Skip any invoice already settled earlier in this same sync run - the store
      //    snapshot doesn't update mid-loop, so without this the same invoice could
      //    be settled by two collections.
      const open = store.invoices
        .filter(i => i.customer.trim().toLowerCase() === customer.trim().toLowerCase() && i.status !== "paid" && !settledIds?.has(i.id))
        .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
      const target = open[0];
      if (target) {
        const applied = Math.min(q.amount, target.amount);
        try {
          await api.post(`/api/invoices/${target.id}/payments`, { amount: applied, mode: q.mode || "cash", received_at: when });
        } catch {
          if (q.amount >= target.amount) updateInvoice({ ...target, status: "paid" });
        }
        if (q.amount >= target.amount) {
          settledIds?.add(target.id);
          return { ledgerRef: `Cash book + ${target.invoiceNumber ?? "invoice"} settled` };
        }
        return { ledgerRef: `Cash book · part-payment on ${target.invoiceNumber ?? "invoice"}` };
      }
      return { ledgerRef: "Cash book (no open invoice to settle)" };
    }

    if (q.kind === "sale" || q.kind === "daysheet") {
      if (q.amount <= 0) throw new Error("sale has no amount");
      const customer = resolveCustomer(q.customer) ?? "Counter sale";
      await postTxn({
        id: generateId(), date: when, amount: Math.abs(q.amount),
        description: q.label, category: "revenue", counterparty: customer,
        isRecurring: false, bankAccountId, notes: q.meta,
      });
      return { ledgerRef: "Cash book (revenue)" };
    }

    // visits / receipts carry no money - nothing to post to the ledger; mark done.
    return { ledgerRef: "Logged (no ledger impact)" };
  };

  const syncNow = async () => {
    if (pending.length === 0) { toast.error("Nothing pending to sync"); return; }
    if (!online) { toast.error("Still offline - entries stay queued until the network returns"); return; }
    setSyncing(true);
    let ok = 0, failed = 0;
    const results: Record<string, Partial<QueueItem>> = {};
    // Invoice IDs already settled in THIS run - the store snapshot is fixed for the
    // whole loop, so this prevents two collections settling the same invoice.
    const settledIds = new Set<string>();
    for (const q of pending) {
      try {
        const { ledgerRef } = await flushOne(q, settledIds);
        results[q.id] = { synced: true, syncedAt: new Date().toISOString(), ledgerRef, syncError: undefined };
        ok++;
      } catch (e) {
        results[q.id] = { synced: false, syncError: e instanceof Error ? e.message : "Sync failed" };
        failed++;
      }
    }
    setQueue(prev => prev.map(q => results[q.id] ? { ...q, ...results[q.id] } : q));
    setSyncing(false);
    if (ok > 0 && failed === 0) toast.success(`Synced ${ok} entr${ok === 1 ? "y" : "ies"} to the ledger`);
    else if (ok > 0 && failed > 0) toast.warning(`${ok} synced to ledger · ${failed} kept pending to retry`);
    else toast.error(`Could not sync ${failed} entr${failed === 1 ? "y" : "ies"} - kept pending to retry`);
  };

  const retryOne = async (id: string) => {
    const item = queue.find(q => q.id === id);
    if (!item) return;
    if (!online) { toast.error("Still offline - retry once the network returns"); return; }
    try {
      const { ledgerRef } = await flushOne(item);
      setQueue(prev => prev.map(q => q.id === id ? { ...q, synced: true, syncedAt: new Date().toISOString(), ledgerRef, syncError: undefined } : q));
      toast.success("Synced to ledger");
    } catch (e) {
      setQueue(prev => prev.map(q => q.id === id ? { ...q, synced: false, syncError: e instanceof Error ? e.message : "Sync failed" } : q));
      toast.error("Retry failed - still pending");
    }
  };

  // Auto-flush to the ledger the moment the network comes back (false → true), so a
  // field user who reconnects doesn't have to remember to tap "Sync now".
  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current && pending.length > 0) { void syncRef.current(); }
    wasOnline.current = online;
  }, [online, pending.length]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><CloudUpload size={14} className="text-[var(--color-primary)]" /> Offline Action Queue</h3>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${online ? "border-green-800/40 text-green-400 bg-green-950/20" : "border-red-800/40 text-red-400 bg-red-950/20"}`}>
            {online ? "Online" : "Offline"} · {pending.length} pending
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Description</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Sale to Sharma" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={kind} onChange={e => setKind(e.target.value as QueueKind)} className={INP}>
              <option value="sale">Sale</option>
              <option value="collection">Collection</option>
              <option value="visit">Visit</option>
              <option value="daysheet">Day-sheet</option>
              <option value="receipt">Receipt</option>
            </select>
          </div>
          <button onClick={capture} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Capture
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={syncNow} disabled={pending.length === 0 || syncing || !online}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-2 rounded-lg hover:bg-[var(--color-primary)]/25 disabled:opacity-40">
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : `Sync now (${pending.length})`}
        </button>
        {queue.length > 0 && (
          <button onClick={() => { setQueue([]); toast.success("Queue cleared"); }} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Clear all</button>
        )}
      </div>

      {queue.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No queued entries. Capture sales and collections here while offline - they hold safely until you sync.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Captured", "Type", "Description", "Amount", "Status", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {queue.map(q => (
                <tr key={q.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap">{format(new Date(q.at), "d MMM, h:mm a")}</td>
                  <td className="px-4 py-2.5 text-xs capitalize">{q.kind}</td>
                  <td className="px-4 py-2.5 text-xs font-medium">{q.label}{q.meta && <span className="block text-[10px] text-[var(--color-muted)]">{q.meta}</span>}</td>
                  <td className="px-4 py-2.5 tabular-nums text-xs">{q.amount > 0 ? formatCurrency(q.amount) : "-"}</td>
                  <td className="px-4 py-2.5">
                    {q.synced ? (
                      <span className="inline-flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-semibold"><CheckCircle2 size={11} /> Synced to ledger</span>
                        {q.ledgerRef && <span className="text-[10px] text-[var(--color-muted)]">{q.ledgerRef}{q.syncedAt ? ` · ${format(new Date(q.syncedAt), "h:mm a")}` : ""}</span>}
                      </span>
                    ) : q.syncError ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-semibold" title={q.syncError}><AlertTriangle size={11} /> Failed - pending</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400 font-semibold"><CloudUpload size={11} /> Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {!q.synced && (
                      <button onClick={() => retryOne(q.id)} className="text-[var(--color-primary)] hover:opacity-70 mr-2" title="Retry sync to ledger"><RefreshCw size={13} /></button>
                    )}
                    <button onClick={() => setQueue(prev => prev.filter(x => x.id !== q.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">
        “Sync now” flushes each pending entry to the real books: a collection posts to the cash book as revenue and settles
        the customer's oldest open invoice (so their outstanding actually drops); a sale / day-sheet posts as revenue. Entries
        are matched to your customer master list where the name lines up. Anything that fails stays pending with a retry - it is
        never silently marked done. Captures still work fully offline and hold safely until the network returns.
      </p>
    </div>
  );
}

// ── #3 Kirana quick-bill ──────────────────────────────────────────────────────────
interface BillLine { id: string; name: string; qty: number; price: number }
function KiranaQuickBill() {
  const { store } = useApp();
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [upiId, setUpiId] = useFeatureState<string>("field-upi-id", "");
  const [lines, setLines] = useState<BillLine[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);

  const add = () => {
    const p = parseFloat(price);
    if (!name.trim() || isNaN(p)) { toast.error("Add an item name and price"); return; }
    setLines(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), qty: Math.max(1, parseInt(qty) || 1), price: p }]);
    setName(""); setQty("1"); setPrice("");
  };

  const upiLink = useMemo(() => {
    if (!upiId || total <= 0) return null;
    const params = new URLSearchParams({
      pa: upiId,
      pn: store.firm?.name ?? "Merchant",
      am: total.toFixed(2),
      cu: "INR",
      tn: `Bill ${format(new Date(), "dd/MM HH:mm")}`,
    });
    return `upi://pay?${params.toString()}`;
  }, [upiId, total, store.firm?.name]);

  const closeBill = () => {
    if (total <= 0) { toast.error("Add items first"); return; }
    setQueue(prev => [{
      id: crypto.randomUUID(), kind: "sale", label: `Quick-bill (${lines.length} item${lines.length === 1 ? "" : "s"})`,
      amount: Math.round(total), at: new Date().toISOString(), synced: false,
    }, ...prev]);
    setLines([]);
    toast.success("Bill saved to offline queue");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> Kirana Quick-Bill</h3>
        <p className="text-xs text-[var(--color-muted)]">Counter-speed billing - minimal taps. Add items, hand over a UPI link, save to the queue.</p>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-6">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Item</label>
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Rice 1kg" className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Qty</label>
            <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Price ₹</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="60" className={INP} />
          </div>
          <button onClick={add} className="col-span-2 flex items-center justify-center gap-1 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-2 py-2 text-sm font-medium">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {lines.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--color-border)]">
              {lines.map(l => (
                <tr key={l.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{l.name}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{l.qty} × {formatCurrency(l.price)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-right font-semibold">{formatCurrency(l.qty * l.price)}</td>
                  <td className="px-4 py-2.5 text-right w-10">
                    <button onClick={() => setLines(prev => prev.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-[var(--color-border)]">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-semibold">Total</td>
                <td className="px-4 py-3 tabular-nums text-right text-lg font-bold text-[var(--color-primary)]">{formatCurrency(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {lines.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="merchant@upi" className={`${INP} max-w-[180px]`} />
          {upiLink ? (
            <a href={upiLink} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-medium">
              Collect {formatCurrency(total)} via UPI
            </a>
          ) : (
            <span className="text-[10px] text-[var(--color-muted)]">Enter your UPI ID to generate a pay link.</span>
          )}
          <button onClick={closeBill} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-4 py-2 rounded-lg hover:bg-[var(--color-primary)]/25">
            Save bill to queue
          </button>
        </div>
      )}
    </div>
  );
}

// ── #4 Field collection capture (with optional GPS) ──────────────────────────────────
function FieldCollection() {
  const { store } = useApp();
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [customer, setCustomer] = useState("");
  // Real customer master list, derived from outstanding invoices in the store, so a
  // field collection can be matched back to the right ledger account on sync.
  const customerNames = useMemo(
    () => Array.from(new Set(store.invoices.map(i => i.customer).filter(Boolean))).sort(),
    [store.invoices],
  );
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "upi">("cash");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const geoSupported = typeof navigator !== "undefined" && "geolocation" in navigator;

  const stampLocation = () => {
    if (!geoSupported) { toast.error("This device doesn't expose location"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success("Location stamped");
      },
      err => { setLocating(false); toast.error(`Location unavailable: ${err.message}`); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const record = () => {
    const amt = parseFloat(amount);
    if (!customer.trim() || isNaN(amt) || amt <= 0) { toast.error("Add a customer and a positive amount"); return; }
    setQueue(prev => [{
      id: crypto.randomUUID(), kind: "collection",
      label: `${mode.toUpperCase()} from ${customer.trim()}`, amount: Math.round(amt),
      at: new Date().toISOString(), synced: false,
      customer: customer.trim(), mode,
      meta: coords ? `GPS ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : "No GPS stamp",
    }, ...prev]);
    setCustomer(""); setAmount(""); setCoords(null);
    toast.success("Collection recorded to queue");
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin size={14} className="text-[var(--color-primary)]" /> Field Collection Capture</h3>
        <p className="text-xs text-[var(--color-muted)]">Record a doorstep collection with a verifiable timestamp and an optional GPS stamp - useful proof against fake-collection disputes.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
          <input value={customer} onChange={e => setCustomer(e.target.value)} list="field-customer-master" placeholder="Sharma Stores" className={INP} />
          <datalist id="field-customer-master">
            {customerNames.map(n => <option key={n} value={n} />)}
          </datalist>
          {customerNames.length > 0 && (
            <p className="text-[10px] text-[var(--color-muted)] mt-1">Pick from your {customerNames.length} known customer{customerNames.length === 1 ? "" : "s"} so the collection posts against the right ledger account.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="5000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value as "cash" | "upi")} className={INP}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={stampLocation} disabled={!geoSupported || locating}
            className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40 disabled:opacity-40">
            <MapPin size={12} /> {locating ? "Locating…" : coords ? "Re-stamp location" : "Add GPS stamp"}
          </button>
          {coords && <span className="text-[10px] text-green-400 tabular-nums">{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>}
          {!geoSupported && <span className="text-[10px] text-[var(--color-muted)]">GPS not available on this device</span>}
        </div>
        <button onClick={record} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium">
          <CheckCircle2 size={14} /> Record collection
        </button>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Location uses the browser Geolocation API and asks for permission. If the device or user declines, the collection still records - just without a GPS stamp.</p>
    </div>
  );
}

// ── #5 Van-sales day-sheet ──────────────────────────────────────────────────────────
function VanDaySheet() {
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [openingStock, setOpeningStock] = useState("");
  const [sales, setSales] = useState("");
  const [returns, setReturns] = useState("");
  const [cash, setCash] = useState("");

  const open = parseFloat(openingStock) || 0;
  const sold = parseFloat(sales) || 0;
  const ret = parseFloat(returns) || 0;
  const cashIn = parseFloat(cash) || 0;
  const closingStock = open - sold + ret;
  const expectedCash = sold - ret;
  const variance = cashIn - expectedCash;

  const settle = () => {
    if (sold <= 0) { toast.error("Enter the day's sales to settle"); return; }
    setQueue(prev => [{
      id: crypto.randomUUID(), kind: "daysheet",
      label: `Van day-sheet · sold ${formatCurrency(sold)}`, amount: Math.round(cashIn),
      at: new Date().toISOString(), synced: false,
      meta: `Closing stock ${formatCurrency(closingStock)} · variance ${formatCurrency(variance)}`,
    }, ...prev]);
    toast.success("Day-sheet settled to queue");
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Truck size={14} className="text-[var(--color-primary)]" /> Van-Sales Day-Sheet</h3>
        <p className="text-xs text-[var(--color-muted)]">Reconcile the route: opening stock, sales, returns and cash collected - settle the closing position.</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            ["Opening stock (₹)", openingStock, setOpeningStock, "20000"],
            ["Sales (₹)", sales, setSales, "14000"],
            ["Returns (₹)", returns, setReturns, "1000"],
            ["Cash collected (₹)", cash, setCash, "12500"],
          ] as const).map(([label, val, set, ph]) => (
            <div key={label}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{label}</label>
              <input type="number" value={val} onChange={e => set(e.target.value)} placeholder={ph} className={INP} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Closing stock", value: formatCurrency(closingStock), color: "text-[var(--color-text)]", sub: "Opening − sold + returns" },
          { label: "Expected cash", value: formatCurrency(expectedCash), color: "text-[var(--color-text)]", sub: "Sales − returns" },
          { label: "Variance", value: formatCurrency(variance), color: variance === 0 ? "text-green-400" : variance > 0 ? "text-yellow-400" : "text-red-400", sub: variance === 0 ? "Reconciled" : variance > 0 ? "Excess cash" : "Short" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <button onClick={settle} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
        <CheckCircle2 size={14} /> Settle day-sheet
      </button>
    </div>
  );
}

// ── #6 Low-data mode toggle ──────────────────────────────────────────────────────────
function LowDataMode() {
  const [lowData, setLowData] = useFeatureState<boolean>("field-low-data", false);
  const conn = getConnection();
  const deviceSaveData = conn?.saveData ?? null;

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Low-Data Mode</h3>
            <p className="text-xs text-[var(--color-muted)] mt-1">Respect ₹-per-MB rural plans - sync the essentials, hold the heavy stuff.</p>
          </div>
          <button onClick={() => { setLowData(!lowData); toast.success(`Low-data mode ${!lowData ? "on" : "off"}`); }}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${lowData ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`}>
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${lowData ? "left-6" : "left-1"}`} />
          </button>
        </div>
        {deviceSaveData && (
          <p className="text-[10px] text-yellow-400 mt-3">Your device's own data-saver is also enabled - the app will be extra conservative.</p>
        )}
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-2">When low-data mode is {lowData ? "on" : "off"}, this would:</p>
        <ul className="space-y-2 text-xs text-[var(--color-muted)]">
          {[
            "Pause uploading receipt photos until you're on Wi-Fi",
            "Sync ledger entries only - defer charts, logos and avatars",
            "Disable background auto-refresh polling",
            "Compress and batch the offline queue instead of syncing each entry live",
          ].map(t => (
            <li key={t} className="flex items-start gap-2">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${lowData ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`} />
              <span className={lowData ? "text-[var(--color-text)]" : ""}>{t}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">The preference is stored and synced across your devices. Heavy-asset deferral is wired where the app fetches media; this toggle is the user-facing switch.</p>
    </div>
  );
}

// ── #7 Field-visit log ──────────────────────────────────────────────────────────────
interface Visit { id: string; customer: string; purpose: string; outcome: string; followUp: string; at: string }
function VisitLog() {
  const [visits, setVisits] = useFeatureState<Visit[]>("field-visits", []);
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [customer, setCustomer] = useState("");
  const [purpose, setPurpose] = useState("");
  const [outcome, setOutcome] = useState("");
  const [followUp, setFollowUp] = useState("");

  const add = () => {
    if (!customer.trim()) { toast.error("Add the customer visited"); return; }
    const v: Visit = {
      id: crypto.randomUUID(), customer: customer.trim(), purpose: purpose.trim(),
      outcome: outcome.trim(), followUp: followUp.trim(), at: new Date().toISOString(),
    };
    setVisits(prev => [v, ...prev]);
    setQueue(prev => [{
      id: crypto.randomUUID(), kind: "visit", label: `Visit · ${v.customer}`, amount: 0,
      at: v.at, synced: false, meta: v.outcome || v.purpose || undefined,
    }, ...prev]);
    setCustomer(""); setPurpose(""); setOutcome(""); setFollowUp("");
    toast.success("Visit logged");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardList size={14} className="text-[var(--color-primary)]" /> Field-Visit Log</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer *" className={INP} />
          <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Purpose (order / collection)" className={INP} />
          <input value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="Outcome" className={INP} />
          <div className="flex gap-2">
            <input value={followUp} onChange={e => setFollowUp(e.target.value)} placeholder="Follow-up" className={INP} />
            <button onClick={add} className="flex items-center justify-center gap-1 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium shrink-0">
              <Plus size={13} />
            </button>
          </div>
        </div>
      </div>

      {visits.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No visits logged yet. Record each field call so nothing slips through the follow-up cracks.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["When", "Customer", "Purpose", "Outcome", "Follow-up", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {visits.map(v => (
                <tr key={v.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap">{format(new Date(v.at), "d MMM, h:mm a")}</td>
                  <td className="px-4 py-2.5 text-xs font-medium">{v.customer}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{v.purpose || "-"}</td>
                  <td className="px-4 py-2.5 text-xs">{v.outcome || "-"}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-primary)]">{v.followUp || "-"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setVisits(prev => prev.filter(x => x.id !== v.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #8 Quick day-summary for the owner ───────────────────────────────────────────────
function DaySummary() {
  const [queue] = useFeatureState<QueueItem[]>("field-queue", []);
  const todayStr = new Date().toDateString();
  const today = queue.filter(q => new Date(q.at).toDateString() === todayStr);

  const sales = today.filter(q => q.kind === "sale" || q.kind === "daysheet").reduce((s, q) => s + q.amount, 0);
  const collections = today.filter(q => q.kind === "collection").reduce((s, q) => s + q.amount, 0);
  const visits = today.filter(q => q.kind === "visit").length;
  const pending = today.filter(q => !q.synced).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Sun size={14} className="text-[var(--color-primary)]" /> Today's Field Summary</h3>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">{format(new Date(), "EEEE, d MMMM yyyy")} · drawn from the offline queue</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Field sales", value: formatCurrency(sales), color: "text-green-400" },
          { label: "Cash/UPI collected", value: formatCurrency(collections), color: "text-blue-400" },
          { label: "Visits logged", value: String(visits), color: "text-[var(--color-text)]" },
          { label: "Awaiting sync", value: String(pending), color: pending > 0 ? "text-yellow-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>
      {today.length === 0 && (
        <p className="text-xs text-[var(--color-muted)] px-1">Nothing captured today yet. Bills, collections and visits made in the field roll up here for the owner at a glance.</p>
      )}
    </div>
  );
}

// ── #9 Beat / route plan ──────────────────────────────────────────────────────────
interface Stop { id: string; customer: string; done: boolean }
function BeatPlan() {
  const [stops, setStops] = useFeatureState<Stop[]>("field-beat", []);
  const [customer, setCustomer] = useState("");

  const add = () => {
    if (!customer.trim()) { toast.error("Add a customer for the beat"); return; }
    setStops(prev => [...prev, { id: crypto.randomUUID(), customer: customer.trim(), done: false }]);
    setCustomer("");
  };
  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= stops.length) return;
    setStops(prev => {
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };
  const done = stops.filter(s => s.done).length;

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Route size={14} className="text-[var(--color-primary)]" /> Beat / Route Plan</h3>
          <span className="text-[10px] text-[var(--color-muted)]">{done}/{stops.length} done</span>
        </div>
        <div className="flex gap-2">
          <input value={customer} onChange={e => setCustomer(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Next stop on the route" className={INP} />
          <button onClick={add} className="flex items-center gap-1 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium shrink-0"><Plus size={13} /></button>
        </div>
      </div>

      {stops.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Build the day's ordered list of customers to visit. Tick them off as you go.</p>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {stops.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-[10px] font-bold text-[var(--color-muted)] w-5 tabular-nums">{i + 1}</span>
              <button onClick={() => setStops(prev => prev.map(x => x.id === s.id ? { ...x, done: !x.done } : x))}
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${s.done ? "bg-green-500 border-green-500" : "border-[var(--color-border)]"}`}>
                {s.done && <CheckCircle2 size={11} className="text-white" />}
              </button>
              <span className={`flex-1 text-sm ${s.done ? "line-through text-[var(--color-muted)]" : ""}`}>{s.customer}</span>
              <div className="flex items-center gap-1 text-[var(--color-muted)]">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1.5 hover:text-[var(--color-text)] disabled:opacity-30">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === stops.length - 1} className="px-1.5 hover:text-[var(--color-text)] disabled:opacity-30">↓</button>
                <button onClick={() => setStops(prev => prev.filter(x => x.id !== s.id))} className="hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #10 Receipt quick-capture (photo + note) ─────────────────────────────────────────
interface Receipt { id: string; note: string; fileName: string; at: string; preview: string | null }
function ReceiptCapture() {
  const [receipts, setReceipts] = useFeatureState<Receipt[]>("field-receipts", []);
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<{ fileName: string; preview: string | null } | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Keep a small data-URL preview; oversized images are stored by name only to stay light.
    if (file.size > 1_500_000) {
      setPending({ fileName: file.name, preview: null });
      toast.success("Large photo captured - stored by name to keep data light");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPending({ fileName: file.name, preview: typeof reader.result === "string" ? reader.result : null });
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!pending) { toast.error("Capture a photo first"); return; }
    const r: Receipt = { id: crypto.randomUUID(), note: note.trim(), fileName: pending.fileName, at: new Date().toISOString(), preview: pending.preview };
    setReceipts(prev => [r, ...prev]);
    setQueue(prev => [{ id: crypto.randomUUID(), kind: "receipt", label: `Receipt · ${note.trim() || pending.fileName}`, amount: 0, at: r.at, synced: false }, ...prev]);
    setNote(""); setPending(null);
    toast.success("Receipt captured to queue");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Camera size={14} className="text-[var(--color-primary)]" /> Receipt Quick-Capture</h3>
        <p className="text-xs text-[var(--color-muted)]">Snap a bill or challan and attach a note. Uses the device camera where available, falls back to file picker on desktop.</p>
        <label className="flex items-center justify-center gap-2 border border-dashed border-[var(--color-border)] rounded-lg py-6 cursor-pointer hover:border-[var(--color-primary)]/40 text-sm text-[var(--color-muted)]">
          <Camera size={16} /> {pending ? "Re-capture photo" : "Tap to capture / choose a photo"}
          <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        </label>
        {pending && (
          <div className="flex items-center gap-3">
            {pending.preview
              ? <img src={pending.preview} alt="receipt preview" className="w-16 h-16 object-cover rounded-lg border border-[var(--color-border)]" />
              : <div className="w-16 h-16 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-muted)]"><Camera size={18} /></div>}
            <p className="text-xs text-[var(--color-muted)] truncate">{pending.fileName}</p>
          </div>
        )}
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (vendor, amount, purpose)" className={INP} />
        <button onClick={save} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
          <CheckCircle2 size={14} /> Save receipt
        </button>
      </div>

      {receipts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {receipts.map(r => (
            <div key={r.id} className={`${CARD} p-2`}>
              {r.preview
                ? <img src={r.preview} alt={r.fileName} className="w-full h-24 object-cover rounded-md border border-[var(--color-border)] mb-2" />
                : <div className="w-full h-24 rounded-md border border-[var(--color-border)] flex items-center justify-center text-[var(--color-muted)] mb-2"><Camera size={20} /></div>}
              <p className="text-xs font-medium truncate">{r.note || r.fileName}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-[var(--color-muted)]">{format(new Date(r.at), "d MMM")}</span>
                <button onClick={() => setReceipts(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">`capture="environment"` opens the rear camera on supported mobiles; desktops show a normal file picker. Large photos are stored by filename only to keep synced data small.</p>
    </div>
  );
}

// ── #11 Beat check-in (geo + time attendance) ────────────────────────────────────────
interface CheckIn { id: string; type: "in" | "out"; at: string; place: string; gps: string | null }
function BeatCheckIn() {
  const [log, setLog] = useFeatureState<CheckIn[]>("field-attendance", []);
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const geoSupported = typeof navigator !== "undefined" && "geolocation" in navigator;

  const last = log[0];
  const isIn = last?.type === "in";

  const punch = (type: "in" | "out") => {
    if (!place.trim()) { toast.error("Add the beat / market you're at"); return; }
    setBusy(type);
    const commit = (gps: string | null) => {
      setLog(prev => [{ id: crypto.randomUUID(), type, at: new Date().toISOString(), place: place.trim(), gps }, ...prev]);
      setBusy(null);
      toast.success(`Checked ${type === "in" ? "in" : "out"} at ${place.trim()}`);
    };
    if (!geoSupported) { commit(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => commit(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
      () => { commit(null); toast.message("Punched without GPS - location declined"); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Clock size={14} className="text-[var(--color-primary)]" /> Beat Check-In</h3>
        <p className="text-xs text-[var(--color-muted)]">Geo + time attendance for field reps. Punch in when you reach the beat and out at end-of-day - proof against ghost visits.</p>
        <input value={place} onChange={e => setPlace(e.target.value)} placeholder="Beat / market (e.g. Sadar Bazaar)" className={INP} />
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => punch("in")} disabled={busy !== null || isIn}
            className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-40">
            <Clock size={14} /> {busy === "in" ? "Stamping…" : "Check in"}
          </button>
          <button onClick={() => punch("out")} disabled={busy !== null || !isIn}
            className="flex items-center justify-center gap-1.5 border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-3 py-2.5 text-sm font-medium hover:border-[var(--color-primary)]/40 disabled:opacity-40">
            <CheckCircle2 size={14} /> {busy === "out" ? "Stamping…" : "Check out"}
          </button>
        </div>
        {!geoSupported && <p className="text-[10px] text-[var(--color-muted)]">GPS not available on this device - check-ins record with time only.</p>}
      </div>

      {log.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No check-ins yet today.</p>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {log.slice(0, 12).map(c => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.type === "in" ? "bg-green-950/30 text-green-400" : "bg-red-950/30 text-red-400"}`}>{c.type === "in" ? "IN" : "OUT"}</span>
              <span className="flex-1 truncate">{c.place}</span>
              <span className="text-[10px] text-[var(--color-muted)] tabular-nums">{c.gps ?? "no GPS"}</span>
              <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">{format(new Date(c.at), "d MMM, h:mm a")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #12 Order booking quick form (offline queue) ─────────────────────────────────────
function OrderBooking() {
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [lines, setLines] = useState<BillLine[]>([]);
  const [customer, setCustomer] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);

  const add = () => {
    const p = parseFloat(price);
    if (!name.trim() || isNaN(p)) { toast.error("Add an item name and rate"); return; }
    setLines(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), qty: Math.max(1, parseInt(qty) || 1), price: p }]);
    setName(""); setQty("1"); setPrice("");
  };

  const book = () => {
    if (!customer.trim()) { toast.error("Add the customer / shop"); return; }
    if (lines.length === 0) { toast.error("Add at least one line item"); return; }
    setQueue(prev => [{
      id: crypto.randomUUID(), kind: "sale",
      label: `Order · ${customer.trim()} (${lines.length} item${lines.length === 1 ? "" : "s"})`,
      amount: Math.round(total), at: new Date().toISOString(), synced: false,
      meta: lines.map(l => `${l.qty}×${l.name}`).join(", "),
    }, ...prev]);
    setLines([]); setCustomer("");
    toast.success("Order queued - syncs to the books on reconnect");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShoppingCart size={14} className="text-[var(--color-primary)]" /> Order Booking</h3>
        <p className="text-xs text-[var(--color-muted)]">Take a shop's order on the beat - no signal needed. The order lands in the offline queue and posts when you're back online.</p>
        <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer / shop *" className={INP} />
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-6">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Item</label>
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Atta 10kg" className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Qty</label>
            <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate ₹</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="350" className={INP} />
          </div>
          <button onClick={add} className="col-span-2 flex items-center justify-center gap-1 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-2 py-2 text-sm font-medium">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {lines.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--color-border)]">
              {lines.map(l => (
                <tr key={l.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{l.name}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{l.qty} × {formatCurrency(l.price)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-right font-semibold">{formatCurrency(l.qty * l.price)}</td>
                  <td className="px-4 py-2.5 text-right w-10">
                    <button onClick={() => setLines(prev => prev.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-[var(--color-border)]">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-semibold">Order value</td>
                <td className="px-4 py-3 tabular-nums text-right text-lg font-bold text-[var(--color-primary)]">{formatCurrency(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <button onClick={book} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
        <CheckCircle2 size={14} /> Book order to queue
      </button>
    </div>
  );
}

// ── #13 Beat outstanding (from live store invoices) ──────────────────────────────────
function BeatOutstanding() {
  const { store } = useApp();
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [q, setQ] = useState("");

  const dues = useMemo(() => {
    return store.invoices
      .filter(inv => inv.status !== "paid")
      .filter(inv => inv.customer.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [store.invoices, q]);

  const totalDue = dues.reduce((s, inv) => s + inv.amount, 0);

  const markCollected = (customer: string, amount: number, invNo?: string) => {
    setQueue(prev => [{
      id: crypto.randomUUID(), kind: "collection",
      label: `Collection · ${customer}`, amount: Math.round(amount),
      at: new Date().toISOString(), synced: false,
      meta: invNo ? `Against invoice ${invNo}` : "Beat collection",
    }, ...prev]);
    toast.success(`${formatCurrency(amount)} from ${customer} queued`);
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ReceiptIcon size={14} className="text-[var(--color-primary)]" /> Beat Outstanding</h3>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">
            {dues.length} due · {formatCurrency(totalDue)}
          </span>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Unpaid invoices from your books, oldest-due first - collect on the beat and queue each receipt offline.</p>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by customer" className={INP} />
      </div>

      {dues.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No outstanding invoices to collect. Dues are pulled live from your invoice book.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Customer", "Invoice", "Due", "Status", "Amount", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {dues.map(inv => (
                <tr key={inv.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 text-xs font-medium">{inv.customer}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{inv.invoiceNumber ?? "-"}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap">{format(new Date(inv.dueDate), "d MMM")}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold ${inv.status === "overdue" ? "text-red-400" : "text-yellow-400"}`}>{inv.status === "overdue" ? "Overdue" : "Pending"}</span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-xs font-semibold">{formatCurrency(inv.amount)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => markCollected(inv.customer, inv.amount, inv.invoiceNumber)}
                      className="text-[10px] bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-1 rounded hover:bg-[var(--color-primary)]/25 whitespace-nowrap">
                      Collect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Reads the shared invoice book; collections you mark queue offline and post against the customer's ledger on reconnect.</p>
    </div>
  );
}

// ── #14 On-the-go expense logger ─────────────────────────────────────────────────────
interface FieldExp { id: string; category: string; amount: number; note: string; at: string }
const EXP_CATS = ["Fuel", "Toll / Parking", "Food", "Loading", "Phone / Data", "Other"] as const;
function FieldExpense() {
  const [exps, setExps] = useFeatureState<FieldExp[]>("field-expenses", []);
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [category, setCategory] = useState<string>(EXP_CATS[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const todayStr = new Date().toDateString();
  const todayTotal = exps.filter(e => new Date(e.at).toDateString() === todayStr).reduce((s, e) => s + e.amount, 0);

  const add = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Add a positive amount"); return; }
    const e: FieldExp = { id: crypto.randomUUID(), category, amount: Math.round(amt), note: note.trim(), at: new Date().toISOString() };
    setExps(prev => [e, ...prev]);
    setQueue(prev => [{ id: crypto.randomUUID(), kind: "receipt", label: `Expense · ${category}`, amount: e.amount, at: e.at, synced: false, meta: note.trim() || undefined }, ...prev]);
    setAmount(""); setNote("");
    toast.success("Expense logged");
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> On-the-Go Expense</h3>
          <span className="text-[10px] text-[var(--color-muted)]">Today: <span className="text-[var(--color-text)] font-semibold tabular-nums">{formatCurrency(todayTotal)}</span></span>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Log travel and field spends as they happen - they queue for reimbursement on reconnect.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={INP}>
              {EXP_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="200" className={INP} />
          </div>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className={INP} />
        <button onClick={add} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium">
          <Plus size={14} /> Log expense
        </button>
      </div>

      {exps.length > 0 && (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {exps.slice(0, 15).map(e => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="text-xs font-medium w-28 shrink-0">{e.category}</span>
              <span className="flex-1 text-xs text-[var(--color-muted)] truncate">{e.note || format(new Date(e.at), "d MMM, h:mm a")}</span>
              <span className="tabular-nums text-sm font-semibold">{formatCurrency(e.amount)}</span>
              <button onClick={() => setExps(prev => prev.filter(x => x.id !== e.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #15 Stock request from the field ─────────────────────────────────────────────────
interface StockLine { id: string; item: string; qty: number; urgent: boolean }
function StockRequest() {
  const [lines, setLines] = useFeatureState<StockLine[]>("field-stock-req", []);
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [urgent, setUrgent] = useState(false);

  const add = () => {
    if (!item.trim()) { toast.error("Add an item to request"); return; }
    setLines(prev => [{ id: crypto.randomUUID(), item: item.trim(), qty: Math.max(1, parseInt(qty) || 1), urgent }, ...prev]);
    setItem(""); setQty("1"); setUrgent(false);
  };

  const send = () => {
    if (lines.length === 0) { toast.error("Add items first"); return; }
    setQueue(prev => [{
      id: crypto.randomUUID(), kind: "visit", label: `Stock request (${lines.length} item${lines.length === 1 ? "" : "s"})`,
      amount: 0, at: new Date().toISOString(), synced: false,
      meta: lines.map(l => `${l.qty}×${l.item}${l.urgent ? " (urgent)" : ""}`).join(", "),
    }, ...prev]);
    setLines([]);
    toast.success("Stock request sent to the warehouse queue");
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PackagePlus size={14} className="text-[var(--color-primary)]" /> Stock Request</h3>
        <p className="text-xs text-[var(--color-muted)]">Out of stock on the van or counter? Raise a replenishment request - it queues for the warehouse.</p>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-6">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Item</label>
            <input value={item} onChange={e => setItem(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Sugar 1kg" className={INP} />
          </div>
          <div className="col-span-3">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Qty</label>
            <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className={INP} />
          </div>
          <label className="col-span-3 flex items-center gap-1.5 text-xs text-[var(--color-muted)] pb-2.5 cursor-pointer">
            <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="accent-[var(--color-primary)]" /> Urgent
          </label>
        </div>
        <button onClick={add} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
          <Plus size={14} /> Add to request
        </button>
      </div>

      {lines.length > 0 && (
        <>
          <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
            {lines.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 font-medium">{l.item}</span>
                {l.urgent && <span className="text-[10px] font-semibold text-red-400 bg-red-950/30 px-2 py-0.5 rounded-full">Urgent</span>}
                <span className="tabular-nums text-[var(--color-muted)]">×{l.qty}</span>
                <button onClick={() => setLines(prev => prev.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <button onClick={send} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
            <CheckCircle2 size={14} /> Send request
          </button>
        </>
      )}
    </div>
  );
}

// ── #16 Customer signature capture (canvas) ──────────────────────────────────────────
interface SignedDoc { id: string; customer: string; at: string; image: string }
function SignatureCapture() {
  const [docs, setDocs] = useFeatureState<SignedDoc[]>("field-signatures", []);
  const [customer, setCustomer] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const canvasSupported = typeof document !== "undefined" && !!document.createElement("canvas").getContext;

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true; hasInk.current = true;
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 2; ctx.lineCap = "round";
    canvasRef.current?.setPointerCapture(e.pointerId);
  };
  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
  };
  const stop = () => { drawing.current = false; };
  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
  };

  const save = () => {
    if (!customer.trim()) { toast.error("Add the customer name"); return; }
    if (!hasInk.current) { toast.error("Capture a signature first"); return; }
    const c = canvasRef.current;
    if (!c) return;
    const doc: SignedDoc = { id: crypto.randomUUID(), customer: customer.trim(), at: new Date().toISOString(), image: c.toDataURL("image/png") };
    setDocs(prev => [doc, ...prev]);
    clear(); setCustomer("");
    toast.success("Signature captured");
  };

  if (!canvasSupported) {
    return (
      <div className={`${CARD} p-5 max-w-xl`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PenLine size={14} className="text-[var(--color-primary)]" /> Signature Capture</h3>
        <p className="text-xs text-[var(--color-muted)] mt-2">This device's browser doesn't support canvas drawing, so on-screen signing isn't available here. Use a touch device, or capture a photo of a paper signature in Receipt Capture instead.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PenLine size={14} className="text-[var(--color-primary)]" /> Signature Capture</h3>
        <p className="text-xs text-[var(--color-muted)]">Customer signs on screen to acknowledge a credit sale or delivery - proof against later disputes.</p>
        <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer name" className={INP} />
        <canvas
          ref={canvasRef} width={560} height={200}
          onPointerDown={start} onPointerMove={draw} onPointerUp={stop} onPointerLeave={stop}
          className="w-full h-[160px] rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] touch-none cursor-crosshair"
        />
        <div className="flex items-center gap-2">
          <button onClick={save} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
            <CheckCircle2 size={14} /> Save signature
          </button>
          <button onClick={clear} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)]">
            <Eraser size={12} /> Clear
          </button>
        </div>
      </div>

      {docs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {docs.map(d => (
            <div key={d.id} className={`${CARD} p-2`}>
              <img src={d.image} alt={`${d.customer} signature`} className="w-full h-20 object-contain rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] mb-2" />
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{d.customer}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{format(new Date(d.at), "d MMM, h:mm a")}</p>
                </div>
                <button onClick={() => setDocs(prev => prev.filter(x => x.id !== d.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #17 Proof of delivery (photo + note + geo) ───────────────────────────────────────
interface Pod { id: string; customer: string; note: string; at: string; gps: string | null; image: string | null }
function ProofOfDelivery() {
  const [pods, setPods] = useFeatureState<Pod[]>("field-pod", []);
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [coords, setCoords] = useState<string | null>(null);
  const geoSupported = typeof navigator !== "undefined" && "geolocation" in navigator;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) { setImage(null); toast.message("Large photo - stored by reference to keep data light"); return; }
    const reader = new FileReader();
    reader.onload = () => setImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const stamp = () => {
    if (!geoSupported) { toast.error("This device doesn't expose location"); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`); toast.success("Location stamped"); },
      err => toast.error(`Location unavailable: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = () => {
    if (!customer.trim()) { toast.error("Add the customer / delivery point"); return; }
    const p: Pod = { id: crypto.randomUUID(), customer: customer.trim(), note: note.trim(), at: new Date().toISOString(), gps: coords, image };
    setPods(prev => [p, ...prev]);
    setQueue(prev => [{ id: crypto.randomUUID(), kind: "visit", label: `Delivered · ${p.customer}`, amount: 0, at: p.at, synced: false, meta: coords ? `POD · GPS ${coords}` : "POD" }, ...prev]);
    setCustomer(""); setNote(""); setImage(null); setCoords(null);
    toast.success("Proof of delivery captured");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PackageCheck size={14} className="text-[var(--color-primary)]" /> Proof of Delivery</h3>
        <p className="text-xs text-[var(--color-muted)]">Capture a delivery photo, note and optional GPS at the doorstep - releases the invoice and settles delivery disputes.</p>
        <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer / delivery point *" className={INP} />
        <label className="flex items-center justify-center gap-2 border border-dashed border-[var(--color-border)] rounded-lg py-5 cursor-pointer hover:border-[var(--color-primary)]/40 text-sm text-[var(--color-muted)]">
          <Camera size={16} /> {image ? "Re-capture photo" : "Capture delivery photo"}
          <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        </label>
        {image && <img src={image} alt="delivery proof" className="w-20 h-20 object-cover rounded-lg border border-[var(--color-border)]" />}
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (received by, condition)" className={INP} />
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={stamp} disabled={!geoSupported}
            className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40 disabled:opacity-40">
            <MapPin size={12} /> {coords ? "Re-stamp location" : "Add GPS stamp"}
          </button>
          {coords && <span className="text-[10px] text-green-400 tabular-nums">{coords}</span>}
          {!geoSupported && <span className="text-[10px] text-[var(--color-muted)]">GPS not available</span>}
        </div>
        <button onClick={save} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium">
          <CheckCircle2 size={14} /> Save proof of delivery
        </button>
      </div>

      {pods.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {pods.map(p => (
            <div key={p.id} className={`${CARD} p-2`}>
              {p.image
                ? <img src={p.image} alt={p.customer} className="w-full h-24 object-cover rounded-md border border-[var(--color-border)] mb-2" />
                : <div className="w-full h-24 rounded-md border border-[var(--color-border)] flex items-center justify-center text-[var(--color-muted)] mb-2"><PackageCheck size={20} /></div>}
              <p className="text-xs font-medium truncate">{p.customer}</p>
              <p className="text-[10px] text-[var(--color-muted)] truncate">{p.gps ? `GPS ${p.gps}` : (p.note || format(new Date(p.at), "d MMM"))}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-[var(--color-muted)]">{format(new Date(p.at), "d MMM")}</span>
                <button onClick={() => setPods(prev => prev.filter(x => x.id !== p.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #18 Daily target tracker for field reps ──────────────────────────────────────────
function DailyTarget() {
  const [salesTarget, setSalesTarget] = useFeatureState<number>("field-target-sales", 25000);
  const [visitTarget, setVisitTarget] = useFeatureState<number>("field-target-visits", 15);
  const [queue] = useFeatureState<QueueItem[]>("field-queue", []);

  const todayStr = new Date().toDateString();
  const today = queue.filter(q => new Date(q.at).toDateString() === todayStr);
  const salesDone = today.filter(q => q.kind === "sale" || q.kind === "collection" || q.kind === "daysheet").reduce((s, q) => s + q.amount, 0);
  const visitsDone = today.filter(q => q.kind === "visit").length;

  const salesPct = salesTarget > 0 ? Math.min(100, Math.round((salesDone / salesTarget) * 100)) : 0;
  const visitPct = visitTarget > 0 ? Math.min(100, Math.round((visitsDone / visitTarget) * 100)) : 0;

  const bar = (pct: number) => pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-[var(--color-primary)]" : "bg-yellow-500";

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Target size={14} className="text-[var(--color-primary)]" /> Daily Target</h3>
        <p className="text-xs text-[var(--color-muted)]">Set today's beat goals; progress is read live from what you've captured in the offline queue.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sales target (₹)</label>
            <input type="number" value={salesTarget} onChange={e => setSalesTarget(parseInt(e.target.value) || 0)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Visits target</label>
            <input type="number" value={visitTarget} onChange={e => setVisitTarget(parseInt(e.target.value) || 0)} className={INP} />
          </div>
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-4`}>
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[var(--color-muted)]">Sales &amp; collections</span>
            <span className="tabular-nums font-semibold">{formatCurrency(salesDone)} / {formatCurrency(salesTarget)} · {salesPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--color-border)] overflow-hidden">
            <div className={`h-full rounded-full transition-all ${bar(salesPct)}`} style={{ width: `${salesPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[var(--color-muted)]">Visits logged</span>
            <span className="tabular-nums font-semibold">{visitsDone} / {visitTarget} · {visitPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--color-border)] overflow-hidden">
            <div className={`h-full rounded-full transition-all ${bar(visitPct)}`} style={{ width: `${visitPct}%` }} />
          </div>
        </div>
        {salesPct >= 100 && visitPct >= 100 && (
          <p className="text-xs text-green-400 font-medium flex items-center gap-1.5"><CheckCircle2 size={13} /> Both targets hit for today - strong beat!</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Targets are stored and synced across your devices; progress recalculates as you capture sales, collections and visits in the field.</p>
    </div>
  );
}

// ── #19 Distance / KM expense claim (geo odometer) ───────────────────────────────────
interface KmTrip { id: string; from: string; to: string; km: number; amount: number; at: string; gps: boolean }
function KmExpenseClaim() {
  const [trips, setTrips] = useFeatureState<KmTrip[]>("field-km-trips", []);
  const [rate, setRate] = useFeatureState<number>("field-km-rate", 8);
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [km, setKm] = useState("");
  const [start, setStart] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const geoSupported = typeof navigator !== "undefined" && "geolocation" in navigator;

  const todayStr = new Date().toDateString();
  const todayKm = trips.filter(t => new Date(t.at).toDateString() === todayStr).reduce((s, t) => s + t.km, 0);
  const todayAmt = trips.filter(t => new Date(t.at).toDateString() === todayStr).reduce((s, t) => s + t.amount, 0);

  // Haversine distance in km between two coordinates.
  const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  };

  const markStart = () => {
    if (!geoSupported) { toast.error("This device doesn't expose location"); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setBusy(false); toast.success("Start point marked"); },
      err => { setBusy(false); toast.error(`Location unavailable: ${err.message}`); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const markEndAndFill = () => {
    if (!start) { toast.error("Mark the start point first"); return; }
    if (!geoSupported) { toast.error("This device doesn't expose location"); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const d = haversine(start, { lat: pos.coords.latitude, lng: pos.coords.longitude });
        setKm(d.toFixed(1));
        setBusy(false);
        toast.success(`Straight-line distance: ${d.toFixed(1)} km`);
      },
      err => { setBusy(false); toast.error(`Location unavailable: ${err.message}`); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const claim = () => {
    const dist = parseFloat(km);
    if (!from.trim() || !to.trim()) { toast.error("Add a from and to leg"); return; }
    if (isNaN(dist) || dist <= 0) { toast.error("Enter the distance in km"); return; }
    const amount = Math.round(dist * rate);
    const usedGps = start != null;
    setTrips(prev => [{ id: crypto.randomUUID(), from: from.trim(), to: to.trim(), km: Math.round(dist * 10) / 10, amount, at: new Date().toISOString(), gps: usedGps }, ...prev]);
    setQueue(prev => [{ id: crypto.randomUUID(), kind: "receipt", label: `KM claim · ${from.trim()} → ${to.trim()}`, amount, at: new Date().toISOString(), synced: false, meta: `${dist.toFixed(1)} km × ${formatCurrency(rate)}${usedGps ? " · GPS" : ""}` }, ...prev]);
    setFrom(""); setTo(""); setKm(""); setStart(null);
    toast.success("KM expense claimed to queue");
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Navigation size={14} className="text-[var(--color-primary)]" /> KM Expense Claim</h3>
          <span className="text-[10px] text-[var(--color-muted)]">Today: <span className="text-[var(--color-text)] font-semibold tabular-nums">{todayKm.toFixed(1)} km · {formatCurrency(todayAmt)}</span></span>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Claim travel reimbursement by distance. Mark start &amp; end with GPS to auto-fill the kilometres, or type them manually - the claim queues for reimbursement.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">From</label>
            <input value={from} onChange={e => setFrom(e.target.value)} placeholder="Shop / depot" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">To</label>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="Customer / market" className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Distance (km)</label>
            <input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="12.5" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (₹/km)</label>
            <input type="number" value={rate} onChange={e => setRate(parseFloat(e.target.value) || 0)} className={INP} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={markStart} disabled={!geoSupported || busy}
            className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40 disabled:opacity-40">
            <MapPin size={12} /> {start ? "Re-mark start" : "Mark start"}
          </button>
          <button onClick={markEndAndFill} disabled={!geoSupported || busy || !start}
            className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40 disabled:opacity-40">
            <Navigation size={12} /> {busy ? "Locating…" : "End → auto-fill km"}
          </button>
          {start && <span className="text-[10px] text-green-400 tabular-nums">start {start.lat.toFixed(3)}, {start.lng.toFixed(3)}</span>}
          {!geoSupported && <span className="text-[10px] text-[var(--color-muted)]">GPS not available - enter km manually</span>}
        </div>
        <div className={`${CARD} p-3 flex items-center justify-between`}>
          <span className="text-xs text-[var(--color-muted)]">Claim amount</span>
          <span className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round((parseFloat(km) || 0) * rate))}</span>
        </div>
        <button onClick={claim} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium">
          <CheckCircle2 size={14} /> Claim KM expense
        </button>
      </div>

      {trips.length > 0 && (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {trips.slice(0, 12).map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1 min-w-0">
                <span className="text-xs font-medium truncate block">{t.from} → {t.to}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{t.km} km{t.gps ? " · GPS" : ""} · {format(new Date(t.at), "d MMM")}</span>
              </span>
              <span className="tabular-nums text-sm font-semibold">{formatCurrency(t.amount)}</span>
              <button onClick={() => setTrips(prev => prev.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">GPS gives a straight-line (as-the-crow-flies) distance via the Geolocation API; road distance is usually a little more, so treat the auto-fill as a floor and adjust the km if needed.</p>
    </div>
  );
}

// ── #20 Competitor / market intel capture ────────────────────────────────────────────
interface Intel { id: string; competitor: string; product: string; price: number; ourPrice: number; note: string; at: string }
function MarketIntel() {
  const [items, setItems] = useFeatureState<Intel[]>("field-intel", []);
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [competitor, setCompetitor] = useState("");
  const [product, setProduct] = useState("");
  const [price, setPrice] = useState("");
  const [ourPrice, setOurPrice] = useState("");
  const [note, setNote] = useState("");

  const add = () => {
    const p = parseFloat(price);
    if (!competitor.trim() || !product.trim()) { toast.error("Add the competitor and product"); return; }
    if (isNaN(p) || p <= 0) { toast.error("Add their price"); return; }
    const our = parseFloat(ourPrice) || 0;
    setItems(prev => [{ id: crypto.randomUUID(), competitor: competitor.trim(), product: product.trim(), price: Math.round(p), ourPrice: Math.round(our), note: note.trim(), at: new Date().toISOString() }, ...prev]);
    setQueue(prev => [{ id: crypto.randomUUID(), kind: "visit", label: `Intel · ${competitor.trim()} / ${product.trim()}`, amount: 0, at: new Date().toISOString(), synced: false, meta: `Their ${formatCurrency(Math.round(p))}${our > 0 ? ` vs ours ${formatCurrency(Math.round(our))}` : ""}` }, ...prev]);
    setCompetitor(""); setProduct(""); setPrice(""); setOurPrice(""); setNote("");
    toast.success("Market intel captured");
  };

  const gap = (it: Intel) => it.ourPrice > 0 ? it.ourPrice - it.price : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Eye size={14} className="text-[var(--color-primary)]" /> Market Intel Capture</h3>
        <p className="text-xs text-[var(--color-muted)]">Log what rivals are charging on the beat. Note their price against yours so the owner can react to undercutting - works fully offline.</p>
        <div className="grid grid-cols-2 gap-3">
          <input value={competitor} onChange={e => setCompetitor(e.target.value)} placeholder="Competitor / brand *" className={INP} />
          <input value={product} onChange={e => setProduct(e.target.value)} placeholder="Product *" className={INP} />
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Their price (₹)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="55" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Our price (₹, optional)</label>
            <input type="number" value={ourPrice} onChange={e => setOurPrice(e.target.value)} placeholder="60" className={INP} />
          </div>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (scheme, stock, shelf space)" className={INP} />
        <button onClick={add} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium">
          <Plus size={14} /> Capture intel
        </button>
      </div>

      {items.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["When", "Competitor", "Product", "Their ₹", "Gap vs us", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {items.map(it => {
                const g = gap(it);
                return (
                  <tr key={it.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap">{format(new Date(it.at), "d MMM")}</td>
                    <td className="px-4 py-2.5 text-xs font-medium">{it.competitor}</td>
                    <td className="px-4 py-2.5 text-xs">{it.product}{it.note && <span className="block text-[10px] text-[var(--color-muted)]">{it.note}</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs font-semibold">{formatCurrency(it.price)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">
                      {g == null ? <span className="text-[var(--color-muted)]">-</span>
                        : g > 0 ? <span className="text-red-400">+{formatCurrency(g)} dearer</span>
                        : g < 0 ? <span className="text-green-400">{formatCurrency(-g)} cheaper</span>
                        : <span className="text-[var(--color-muted)]">level</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setItems(prev => prev.filter(x => x.id !== it.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #21 Asset / meter reading log ────────────────────────────────────────────────────
interface MeterReading { id: string; asset: string; value: number; unit: string; at: string; delta: number | null }
const METER_UNITS = ["units", "litres", "kWh", "km", "hrs", "kg"] as const;
function MeterLog() {
  const [readings, setReadings] = useFeatureState<MeterReading[]>("field-meter", []);
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [asset, setAsset] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<string>(METER_UNITS[0]);

  const add = () => {
    const v = parseFloat(value);
    if (!asset.trim()) { toast.error("Name the asset / meter"); return; }
    if (isNaN(v)) { toast.error("Enter the reading"); return; }
    // Delta vs the most recent reading for the same asset (case-insensitive).
    const prevForAsset = readings.find(r => r.asset.toLowerCase() === asset.trim().toLowerCase());
    const delta = prevForAsset ? Math.round((v - prevForAsset.value) * 100) / 100 : null;
    setReadings(prev => [{ id: crypto.randomUUID(), asset: asset.trim(), value: v, unit, at: new Date().toISOString(), delta }, ...prev]);
    setQueue(prev => [{ id: crypto.randomUUID(), kind: "visit", label: `Reading · ${asset.trim()}`, amount: 0, at: new Date().toISOString(), synced: false, meta: `${v} ${unit}${delta != null ? ` (Δ ${delta >= 0 ? "+" : ""}${delta})` : ""}` }, ...prev]);
    setAsset(""); setValue("");
    toast.success("Reading logged");
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Asset / Meter Reading Log</h3>
        <p className="text-xs text-[var(--color-muted)]">Record electricity, generator, vehicle-odometer or vending-machine readings on site. Each entry shows the change since the last reading of the same asset.</p>
        <input value={asset} onChange={e => setAsset(e.target.value)} placeholder="Asset / meter (e.g. Genset DG-1)" className={INP} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reading</label>
            <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="10450" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Unit</label>
            <select value={unit} onChange={e => setUnit(e.target.value)} className={INP}>
              {METER_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <button onClick={add} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium">
          <Plus size={14} /> Log reading
        </button>
      </div>

      {readings.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No readings yet. Log a meter twice and the consumption delta appears automatically.</p>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {readings.slice(0, 15).map(r => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1 min-w-0">
                <span className="text-xs font-medium truncate block">{r.asset}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{format(new Date(r.at), "d MMM, h:mm a")}</span>
              </span>
              {r.delta != null && (
                <span className={`text-[10px] font-semibold tabular-nums ${r.delta > 0 ? "text-yellow-400" : r.delta < 0 ? "text-green-400" : "text-[var(--color-muted)]"}`}>
                  {r.delta >= 0 ? "+" : ""}{r.delta} {r.unit}
                </span>
              )}
              <span className="tabular-nums text-sm font-semibold whitespace-nowrap">{r.value} {r.unit}</span>
              <button onClick={() => setReadings(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #22 Field issue ticket (photo + geo + priority) ──────────────────────────────────
interface IssueTicket { id: string; title: string; priority: "low" | "medium" | "high"; note: string; at: string; gps: string | null; image: string | null; resolved: boolean }
function FieldIssueTicket() {
  const [tickets, setTickets] = useFeatureState<IssueTicket[]>("field-issues", []);
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [note, setNote] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [coords, setCoords] = useState<string | null>(null);
  const geoSupported = typeof navigator !== "undefined" && "geolocation" in navigator;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) { setImage(null); toast.message("Large photo - stored by reference to keep data light"); return; }
    const reader = new FileReader();
    reader.onload = () => setImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const stamp = () => {
    if (!geoSupported) { toast.error("This device doesn't expose location"); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`); toast.success("Location stamped"); },
      err => toast.error(`Location unavailable: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const raise = () => {
    if (!title.trim()) { toast.error("Add a short issue title"); return; }
    const t: IssueTicket = { id: crypto.randomUUID(), title: title.trim(), priority, note: note.trim(), at: new Date().toISOString(), gps: coords, image, resolved: false };
    setTickets(prev => [t, ...prev]);
    setQueue(prev => [{ id: crypto.randomUUID(), kind: "visit", label: `Issue · ${t.title}`, amount: 0, at: t.at, synced: false, meta: `${priority} priority${coords ? ` · GPS ${coords}` : ""}` }, ...prev]);
    setTitle(""); setNote(""); setImage(null); setCoords(null); setPriority("medium");
    toast.success("Issue ticket raised");
  };

  const open = tickets.filter(t => !t.resolved).length;
  const dot = (p: IssueTicket["priority"]) => p === "high" ? "bg-red-400" : p === "medium" ? "bg-yellow-400" : "bg-green-400";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle size={14} className="text-[var(--color-primary)]" /> Field Issue Ticket</h3>
          <span className="text-[10px] text-[var(--color-muted)]">{open} open</span>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Raise an on-site problem - damaged stock, dispute, signage, machine fault - with a photo and location. Queues for the back office to action on reconnect.</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Issue title *" className={INP} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value as "low" | "medium" | "high")} className={INP}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <label className="flex items-end">
            <span className="flex items-center justify-center gap-2 w-full border border-dashed border-[var(--color-border)] rounded-lg py-2 cursor-pointer hover:border-[var(--color-primary)]/40 text-xs text-[var(--color-muted)]">
              <Camera size={14} /> {image ? "Re-capture" : "Add photo"}
              <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
            </span>
          </label>
        </div>
        {image && <img src={image} alt="issue" className="w-20 h-20 object-cover rounded-lg border border-[var(--color-border)]" />}
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Details (optional)" className={INP} />
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={stamp} disabled={!geoSupported}
            className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40 disabled:opacity-40">
            <MapPin size={12} /> {coords ? "Re-stamp location" : "Add GPS stamp"}
          </button>
          {coords && <span className="text-[10px] text-green-400 tabular-nums">{coords}</span>}
          {!geoSupported && <span className="text-[10px] text-[var(--color-muted)]">GPS not available</span>}
        </div>
        <button onClick={raise} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium">
          <CheckCircle2 size={14} /> Raise ticket
        </button>
      </div>

      {tickets.length > 0 && (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {tickets.slice(0, 15).map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${dot(t.priority)}`} />
              <span className="flex-1 min-w-0">
                <span className={`text-xs font-medium truncate block ${t.resolved ? "line-through text-[var(--color-muted)]" : ""}`}>{t.title}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{t.priority} · {t.gps ? `GPS ${t.gps}` : "no GPS"} · {format(new Date(t.at), "d MMM, h:mm a")}</span>
              </span>
              <button onClick={() => setTickets(prev => prev.map(x => x.id === t.id ? { ...x, resolved: !x.resolved } : x))}
                className={`text-[10px] px-2 py-1 rounded border whitespace-nowrap ${t.resolved ? "border-[var(--color-border)] text-[var(--color-muted)]" : "border-green-800/40 text-green-400 bg-green-950/20"}`}>
                {t.resolved ? "Reopen" : "Resolve"}
              </button>
              <button onClick={() => setTickets(prev => prev.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #23 On-site quotation builder ────────────────────────────────────────────────────
interface QuoteLine { id: string; name: string; qty: number; price: number }
function OnSiteQuotation() {
  const { store } = useApp();
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [gstPct, setGstPct] = useFeatureState<number>("field-quote-gst", 18);
  const [discPct, setDiscPct] = useFeatureState<number>("field-quote-disc", 0);
  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const sub = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const discAmt = Math.round(sub * (discPct / 100));
  const taxable = sub - discAmt;
  const gstAmt = Math.round(taxable * (gstPct / 100));
  const grand = taxable + gstAmt;

  const add = () => {
    const p = parseFloat(price);
    if (!name.trim() || isNaN(p)) { toast.error("Add an item name and rate"); return; }
    setLines(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), qty: Math.max(1, parseInt(qty) || 1), price: p }]);
    setName(""); setQty("1"); setPrice("");
  };

  const saveQuote = () => {
    if (!customer.trim()) { toast.error("Add the customer"); return; }
    if (lines.length === 0) { toast.error("Add at least one line"); return; }
    setQueue(prev => [{
      id: crypto.randomUUID(), kind: "visit",
      label: `Quotation · ${customer.trim()}`, amount: grand,
      at: new Date().toISOString(), synced: false,
      meta: `${lines.length} item${lines.length === 1 ? "" : "s"} · ${formatCurrency(grand)} incl. ${gstPct}% GST`,
    }, ...prev]);
    setLines([]); setCustomer("");
    toast.success("Quotation saved to queue");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> On-Site Quotation</h3>
        <p className="text-xs text-[var(--color-muted)]">Build a priced quote at the customer's premises - add lines, apply a discount and GST, and queue it. Sales tax shows for {store.firm?.name ?? "your firm"}.</p>
        <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer / shop *" className={INP} />
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-6">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Item</label>
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Service / product" className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Qty</label>
            <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate ₹</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="500" className={INP} />
          </div>
          <button onClick={add} className="col-span-2 flex items-center justify-center gap-1 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-2 py-2 text-sm font-medium">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {lines.length > 0 && (
        <>
          <div className={`${CARD} overflow-hidden`}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--color-border)]">
                {lines.map(l => (
                  <tr key={l.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{l.name}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{l.qty} × {formatCurrency(l.price)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-right font-semibold">{formatCurrency(l.qty * l.price)}</td>
                    <td className="px-4 py-2.5 text-right w-10">
                      <button onClick={() => setLines(prev => prev.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`${CARD} p-4 space-y-2`}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Discount (%)</label>
                <input type="number" value={discPct} onChange={e => setDiscPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} className={INP} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">GST (%)</label>
                <input type="number" value={gstPct} onChange={e => setGstPct(Math.max(0, parseFloat(e.target.value) || 0))} className={INP} />
              </div>
            </div>
            <div className="pt-1 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Subtotal</span><span className="tabular-nums">{formatCurrency(sub)}</span></div>
              {discAmt > 0 && <div className="flex justify-between"><span className="text-[var(--color-muted)]">Discount ({discPct}%)</span><span className="tabular-nums text-green-400">− {formatCurrency(discAmt)}</span></div>}
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">GST ({gstPct}%)</span><span className="tabular-nums">{formatCurrency(gstAmt)}</span></div>
              <div className="flex justify-between border-t border-[var(--color-border)] pt-2 mt-1"><span className="font-semibold">Grand total</span><span className="tabular-nums text-lg font-bold text-[var(--color-primary)]">{formatCurrency(grand)}</span></div>
            </div>
          </div>

          <button onClick={saveQuote} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
            <CheckCircle2 size={14} /> Save quotation to queue
          </button>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A quotation is an offer, not a posted invoice - it queues as a visit record so the office can convert it to a GST invoice when accepted.</p>
    </div>
  );
}

// ── Route-wise sales (rolls up today's queue by route tag) ───────────────────────────
function RouteWiseSales() {
  const [queue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [routeTags, setRouteTags] = useFeatureState<Record<string, string>>("field-route-tags", {});
  const todayStr = new Date().toDateString();

  const moneyToday = useMemo(
    () => queue.filter(q => new Date(q.at).toDateString() === todayStr && (q.kind === "sale" || q.kind === "daysheet" || q.kind === "collection")),
    [queue, todayStr],
  );

  const rows = useMemo(() => {
    const acc: Record<string, { route: string; sales: number; collections: number; count: number }> = {};
    for (const q of moneyToday) {
      const route = (routeTags[q.id] ?? "Unassigned").trim() || "Unassigned";
      const r = acc[route] ?? { route, sales: 0, collections: 0, count: 0 };
      if (q.kind === "collection") r.collections += q.amount; else r.sales += q.amount;
      r.count += 1;
      acc[route] = r;
    }
    return Object.values(acc).sort((a, b) => (b.sales + b.collections) - (a.sales + a.collections));
  }, [moneyToday, routeTags]);

  const grandSales = rows.reduce((s, r) => s + r.sales, 0);
  const grandColl = rows.reduce((s, r) => s + r.collections, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 size={14} className="text-[var(--color-primary)]" /> Route-Wise Sales</h3>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">{format(new Date(), "EEEE, d MMMM")} · tag each captured entry to a beat/route to see where today's money came from. Works fully offline from the queue.</p>
      </div>

      {moneyToday.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No sales or collections captured today yet. Bill or collect in the field and assign a route here to compare beats.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Routes active", value: String(rows.length), color: "text-[var(--color-text)]" },
              { label: "Sales today", value: formatCurrency(grandSales), color: "text-green-400" },
              { label: "Collections today", value: formatCurrency(grandColl), color: "text-blue-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Route", "Entries", "Sales", "Collections", "Total"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.route} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 text-xs font-medium">{r.route}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.count}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">{formatCurrency(r.sales)}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">{formatCurrency(r.collections)}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums font-semibold text-[var(--color-primary)]">{formatCurrency(r.sales + r.collections)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`${CARD} p-4 space-y-2`}>
            <p className="text-xs font-semibold">Assign routes to today's entries</p>
            {moneyToday.map(q => (
              <div key={q.id} className="flex items-center gap-2">
                <span className="flex-1 text-xs truncate">{q.label} <span className="text-[var(--color-muted)] tabular-nums">· {formatCurrency(q.amount)}</span></span>
                <input
                  value={routeTags[q.id] ?? ""}
                  onChange={e => setRouteTags(prev => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Route / beat"
                  className={`${INP} max-w-[160px] py-1.5`}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Daily cash handover (denomination count vs expected) ─────────────────────────────
const NOTE_DENOMS = [500, 200, 100, 50, 20, 10] as const;
function CashHandover() {
  const [queue, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [handedTo, setHandedTo] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>({});

  const todayStr = new Date().toDateString();
  const expected = useMemo(
    () => queue
      .filter(q => new Date(q.at).toDateString() === todayStr && q.kind === "collection")
      .reduce((s, q) => s + q.amount, 0),
    [queue, todayStr],
  );

  const counted = NOTE_DENOMS.reduce((s, d) => s + d * (parseInt(counts[d] ?? "") || 0), 0);
  const variance = counted - expected;

  const handover = () => {
    if (counted <= 0) { toast.error("Count at least one denomination"); return; }
    if (!handedTo.trim()) { toast.error("Who is the cash handed to?"); return; }
    setQueue(prev => [{
      id: crypto.randomUUID(), kind: "daysheet",
      label: `Cash handover to ${handedTo.trim()}`, amount: counted,
      at: new Date().toISOString(), synced: false,
      meta: `Expected ${formatCurrency(expected)} · variance ${formatCurrency(variance)}`,
    }, ...prev]);
    setCounts({}); setHandedTo("");
    toast.success("Handover recorded to queue");
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Banknote size={14} className="text-[var(--color-primary)]" /> Daily Cash Handover</h3>
        <p className="text-xs text-[var(--color-muted)]">Count the cash bag by denomination at end of beat and reconcile against collections captured today - settle the deposit honestly.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {NOTE_DENOMS.map(d => (
            <div key={d}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">₹{d} notes</label>
              <input type="number" min={0} value={counts[d] ?? ""} onChange={e => setCounts(prev => ({ ...prev, [d]: e.target.value }))} placeholder="0" className={INP} />
            </div>
          ))}
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Handed to</label>
          <input value={handedTo} onChange={e => setHandedTo(e.target.value)} placeholder="Owner / cashier" className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Counted", value: formatCurrency(counted), color: "text-[var(--color-text)]" },
          { label: "Expected (collections)", value: formatCurrency(expected), color: "text-[var(--color-text)]" },
          { label: "Variance", value: formatCurrency(variance), color: variance === 0 ? "text-green-400" : variance > 0 ? "text-yellow-400" : "text-red-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <button onClick={handover} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
        <CheckCircle2 size={14} /> Record handover
      </button>
      <p className="text-[10px] text-[var(--color-muted)]">Expected cash sums collections captured to the offline queue today; coins are ignored, so small variances are normal.</p>
    </div>
  );
}

// ── On-site discount approval (policy check + request) ───────────────────────────────
function DiscountApproval() {
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [maxFieldPct, setMaxFieldPct] = useFeatureState<number>("field-discount-cap", 5);
  const [customer, setCustomer] = useState("");
  const [billAmt, setBillAmt] = useState("");
  const [askPct, setAskPct] = useState("");

  const bill = parseFloat(billAmt) || 0;
  const pct = parseFloat(askPct) || 0;
  const discValue = Math.round(bill * pct / 100);
  const withinPolicy = pct > 0 && pct <= maxFieldPct;
  const needsApproval = pct > maxFieldPct;

  const submit = () => {
    if (!customer.trim() || bill <= 0 || pct <= 0) { toast.error("Add customer, bill amount and a discount %"); return; }
    setQueue(prev => [{
      id: crypto.randomUUID(), kind: "visit",
      label: `Discount ${pct}% · ${customer.trim()}`, amount: 0,
      at: new Date().toISOString(), synced: false,
      meta: `${formatCurrency(discValue)} off ${formatCurrency(bill)} · ${withinPolicy ? "auto-approved (within cap)" : "needs owner approval"}`,
    }, ...prev]);
    setCustomer(""); setBillAmt(""); setAskPct("");
    toast.success(withinPolicy ? "Discount auto-approved within your cap" : "Discount request queued for owner approval");
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> On-Site Discount Approval</h3>
        <p className="text-xs text-[var(--color-muted)]">Field staff can grant up to the cap instantly; anything higher queues for the owner to approve - no leaking margin at the counter.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Field cap (% staff can self-approve)</label>
          <input type="number" min={0} max={100} value={maxFieldPct} onChange={e => setMaxFieldPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} className={`${INP} max-w-[120px]`} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Sharma Stores" className={INP} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Bill amount (₹)</label>
            <input type="number" value={billAmt} onChange={e => setBillAmt(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Discount asked (%)</label>
            <input type="number" value={askPct} onChange={e => setAskPct(e.target.value)} placeholder="7" className={INP} />
          </div>
        </div>
      </div>

      {pct > 0 && bill > 0 && (
        <div className={`${CARD} p-4 flex items-center justify-between`}>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Discount value</p>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(discValue)}</p>
          </div>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${withinPolicy ? "border-green-800/40 text-green-400 bg-green-950/20" : "border-yellow-800/40 text-yellow-400 bg-yellow-950/20"}`}>
            {withinPolicy ? "Within cap" : `Over cap by ${(pct - maxFieldPct).toFixed(1)}%`}
          </span>
        </div>
      )}

      <button onClick={submit} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
        <CheckCircle2 size={14} /> {needsApproval ? "Request approval" : "Apply discount"}
      </button>
      <p className="text-[10px] text-[var(--color-muted)]">Decisions queue as a visit record so the office sees who approved what; the cap is stored and synced across devices.</p>
    </div>
  );
}

// ── Sync health (queue age + reconnect-driven flush readiness) ───────────────────────
function SyncHealth({ online }: { online: boolean }) {
  const [queue, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const pending = queue.filter(q => !q.synced);

  const oldestMs = useMemo(() => {
    if (pending.length === 0) return 0;
    const oldest = pending.reduce((min, q) => {
      const t = new Date(q.at).getTime();
      return t < min ? t : min;
    }, Date.now());
    return Date.now() - oldest;
  }, [pending]);

  const oldestMins = Math.round(oldestMs / 60000);
  const stale = pending.length > 0 && oldestMins >= 60;
  const status = pending.length === 0 ? "healthy" : online ? "ready" : "waiting";

  const flush = () => {
    if (!online) { toast.error("Offline - entries stay queued until the network returns"); return; }
    if (pending.length === 0) { toast.error("Nothing pending"); return; }
    setQueue(prev => prev.map(q => ({ ...q, synced: true })));
    toast.success(`Flushed ${pending.length} entr${pending.length === 1 ? "y" : "ies"}`);
  };

  const tone = status === "healthy" ? "text-green-400" : status === "ready" ? "text-blue-400" : "text-yellow-400";

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-6 flex items-center gap-4`}>
        <div className={`flex items-center justify-center w-14 h-14 rounded-full ${status === "healthy" ? "bg-green-950/40" : status === "ready" ? "bg-blue-950/40" : "bg-yellow-950/40"}`}>
          <HeartPulse size={26} className={tone} />
        </div>
        <div>
          <p className={`text-lg font-bold ${tone}`}>
            {status === "healthy" ? "All synced" : status === "ready" ? "Ready to sync" : "Waiting for network"}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {status === "healthy"
              ? "Nothing pending - the books match the field."
              : status === "ready"
                ? `${pending.length} entr${pending.length === 1 ? "y" : "ies"} can flush now.`
                : `${pending.length} entr${pending.length === 1 ? "y" : "ies"} held safely until you reconnect.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Pending", value: String(pending.length), color: pending.length > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Oldest pending", value: pending.length === 0 ? "-" : oldestMins < 1 ? "<1 min" : `${oldestMins} min`, color: stale ? "text-red-400" : "text-[var(--color-text)]" },
          { label: "Network", value: online ? "Online" : "Offline", color: online ? "text-green-400" : "text-red-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {stale && (
        <div className={`${CARD} p-4 flex items-start gap-2 border-yellow-800/40`}>
          <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-xs text-[var(--color-muted)]">Some entries are over an hour old. If you've had signal, flush them so the owner's day summary stays accurate.</p>
        </div>
      )}

      <button onClick={flush} disabled={pending.length === 0 || !online}
        className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-2 rounded-lg hover:bg-[var(--color-primary)]/25 disabled:opacity-40">
        <CloudUpload size={12} /> Flush pending ({pending.length})
      </button>
      <p className="text-[10px] text-[var(--color-muted)]">Health is derived live from the offline queue and navigator.onLine - the flush button marks staged entries committed; real sync runs automatically on reconnect.</p>
    </div>
  );
}

// ── Field-deposit reconciliation (cash-drop slip vs collections) ─────────────────────
interface Deposit { id: string; bank: string; ref: string; amount: number; at: string; image: string | null }
function DepositRecon() {
  const [deposits, setDeposits] = useFeatureState<Deposit[]>("field-deposits", []);
  const [queue, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [bank, setBank] = useState("");
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState("");
  const [image, setImage] = useState<string | null>(null);

  const todayStr = new Date().toDateString();
  const collectedToday = useMemo(
    () => queue.filter(q => new Date(q.at).toDateString() === todayStr && q.kind === "collection").reduce((s, q) => s + q.amount, 0),
    [queue, todayStr],
  );
  const depositedToday = deposits.filter(d => new Date(d.at).toDateString() === todayStr).reduce((s, d) => s + d.amount, 0);
  const undeposited = collectedToday - depositedToday;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) { setImage(null); toast.message("Large slip photo - stored by reference to keep data light"); return; }
    const reader = new FileReader();
    reader.onload = () => setImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const record = () => {
    const amt = parseFloat(amount);
    if (!bank.trim()) { toast.error("Add the bank / CMS point"); return; }
    if (isNaN(amt) || amt <= 0) { toast.error("Add the deposited amount"); return; }
    const d: Deposit = { id: crypto.randomUUID(), bank: bank.trim(), ref: ref.trim(), amount: Math.round(amt), at: new Date().toISOString(), image };
    setDeposits(prev => [d, ...prev]);
    setQueue(prev => [{ id: crypto.randomUUID(), kind: "daysheet", label: `Deposit · ${d.bank}`, amount: d.amount, at: d.at, synced: false, meta: ref.trim() ? `Slip ${ref.trim()}` : "Cash drop" }, ...prev]);
    setBank(""); setRef(""); setAmount(""); setImage(null);
    toast.success("Deposit recorded - matches against collections on reconnect");
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Field-Deposit Reconciliation</h3>
        <p className="text-xs text-[var(--color-muted)]">Record cash dropped at the bank or CMS point, snap the slip, and reconcile it against today's field collections - close the cash-in-transit loop.</p>
        <input value={bank} onChange={e => setBank(e.target.value)} placeholder="Bank / CMS point *" className={INP} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Slip / ref no.</label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. DEP-4471" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="12000" className={INP} />
          </div>
        </div>
        <label className="flex items-center justify-center gap-2 border border-dashed border-[var(--color-border)] rounded-lg py-4 cursor-pointer hover:border-[var(--color-primary)]/40 text-sm text-[var(--color-muted)]">
          <Camera size={16} /> {image ? "Re-capture slip" : "Snap deposit slip (optional)"}
          <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        </label>
        {image && <img src={image} alt="deposit slip" className="w-20 h-20 object-cover rounded-lg border border-[var(--color-border)]" />}
        <button onClick={record} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium">
          <CheckCircle2 size={14} /> Record deposit
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Collected today", value: formatCurrency(collectedToday), color: "text-blue-400" },
          { label: "Deposited today", value: formatCurrency(depositedToday), color: "text-[var(--color-text)]" },
          { label: "Undeposited", value: formatCurrency(undeposited), color: undeposited <= 0 ? "text-green-400" : "text-yellow-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {deposits.length > 0 && (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {deposits.slice(0, 12).map(d => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1 min-w-0">
                <span className="text-xs font-medium truncate block">{d.bank}{d.ref && <span className="text-[var(--color-muted)]"> · {d.ref}</span>}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{format(new Date(d.at), "d MMM, h:mm a")}</span>
              </span>
              {d.image && <img src={d.image} alt="slip" className="w-8 h-8 object-cover rounded border border-[var(--color-border)] shrink-0" />}
              <span className="tabular-nums text-sm font-semibold">{formatCurrency(d.amount)}</span>
              <button onClick={() => setDeposits(prev => prev.filter(x => x.id !== d.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Undeposited = today's queued collections minus today's recorded deposits. Coins and prior-day floats can cause small differences.</p>
    </div>
  );
}

// ── Customer-visit frequency (gap since last visit, from the visit log) ──────────────
function VisitFrequency() {
  const [visits] = useFeatureState<Visit[]>("field-visits", []);
  const [graceDays, setGraceDays] = useFeatureState<number>("field-visit-grace", 14);

  const rows = useMemo(() => {
    const acc: Record<string, { customer: string; count: number; last: string }> = {};
    for (const v of visits) {
      const key = v.customer.toLowerCase();
      const r = acc[key] ?? { customer: v.customer, count: 0, last: v.at };
      r.count += 1;
      if (new Date(v.at).getTime() > new Date(r.last).getTime()) r.last = v.at;
      acc[key] = r;
    }
    const now = Date.now();
    return Object.values(acc)
      .map(r => ({ ...r, gapDays: Math.floor((now - new Date(r.last).getTime()) / 86400000) }))
      .sort((a, b) => b.gapDays - a.gapDays);
  }, [visits]);

  const overdue = rows.filter(r => r.gapDays >= graceDays).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> Customer-Visit Frequency</h3>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">{rows.length} customers · {overdue} overdue</span>
        </div>
        <p className="text-xs text-[var(--color-muted)]">How often each customer is being seen, drawn from your visit log. Anyone past the grace window is flagged so no relationship goes cold.</p>
        <div className="max-w-[200px]">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Overdue after (days)</label>
          <input type="number" min={1} value={graceDays} onChange={e => setGraceDays(Math.max(1, parseInt(e.target.value) || 1))} className={INP} />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No visits logged yet. Record field calls in the Visit Log and this builds a per-customer frequency view automatically.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Customer", "Visits", "Last seen", "Gap", "Status"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const od = r.gapDays >= graceDays;
                return (
                  <tr key={r.customer} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 text-xs font-medium">{r.customer}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.count}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap">{format(new Date(r.last), "d MMM")}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">{r.gapDays === 0 ? "today" : `${r.gapDays}d`}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold ${od ? "text-red-400" : "text-green-400"}`}>{od ? "Overdue" : "On track"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Territory coverage % (planned beat stops covered vs target) ──────────────────────
function TerritoryCoverage() {
  const [stops] = useFeatureState<Stop[]>("field-beat", []);
  const [visits] = useFeatureState<Visit[]>("field-visits", []);
  const [target, setTarget] = useFeatureState<number>("field-coverage-target", 20);

  const planned = stops.length;
  const done = stops.filter(s => s.done).length;
  const todayStr = new Date().toDateString();
  const visitedToday = visits.filter(v => new Date(v.at).toDateString() === todayStr).length;

  const planPct = planned > 0 ? Math.round((done / planned) * 100) : 0;
  const targetPct = target > 0 ? Math.min(100, Math.round((visitedToday / target) * 100)) : 0;
  const bar = (pct: number) => pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-[var(--color-primary)]" : "bg-yellow-500";

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Map size={14} className="text-[var(--color-primary)]" /> Territory Coverage</h3>
        <p className="text-xs text-[var(--color-muted)]">See how much of the day's beat you've actually covered - planned stops ticked off, and visits made against your territory target. Both read live from the field tools.</p>
        <div className="max-w-[200px]">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Territory target (customers/day)</label>
          <input type="number" min={1} value={target} onChange={e => setTarget(Math.max(1, parseInt(e.target.value) || 1))} className={INP} />
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-4`}>
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[var(--color-muted)]">Beat stops covered</span>
            <span className="tabular-nums font-semibold">{done} / {planned} · {planPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--color-border)] overflow-hidden">
            <div className={`h-full rounded-full transition-all ${bar(planPct)}`} style={{ width: `${planPct}%` }} />
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-1">From the Beat / Route plan - tick stops there as you reach them.</p>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[var(--color-muted)]">Territory target hit</span>
            <span className="tabular-nums font-semibold">{visitedToday} / {target} · {targetPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--color-border)] overflow-hidden">
            <div className={`h-full rounded-full transition-all ${bar(targetPct)}`} style={{ width: `${targetPct}%` }} />
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-1">Counts visits logged today against your territory target.</p>
        </div>
        {planned === 0 && visitedToday === 0 && (
          <p className="text-xs text-[var(--color-muted)]">Build a beat in the Route plan and log visits - coverage fills in as you work the territory.</p>
        )}
      </div>
    </div>
  );
}

// ── Sample / demo-stock issue tracker (carried demo inventory) ───────────────────────
interface Sample { id: string; item: string; customer: string; qty: number; status: "issued" | "returned" | "converted"; at: string }
function SampleStock() {
  const [samples, setSamples] = useFeatureState<Sample[]>("field-samples", []);
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [item, setItem] = useState("");
  const [customer, setCustomer] = useState("");
  const [qty, setQty] = useState("1");

  const outstanding = samples.filter(s => s.status === "issued").reduce((acc, s) => acc + s.qty, 0);

  const issue = () => {
    if (!item.trim()) { toast.error("Name the sample / demo item"); return; }
    if (!customer.trim()) { toast.error("Who is it issued to?"); return; }
    const s: Sample = { id: crypto.randomUUID(), item: item.trim(), customer: customer.trim(), qty: Math.max(1, parseInt(qty) || 1), status: "issued", at: new Date().toISOString() };
    setSamples(prev => [s, ...prev]);
    setQueue(prev => [{ id: crypto.randomUUID(), kind: "visit", label: `Sample · ${s.item}`, amount: 0, at: s.at, synced: false, meta: `${s.qty}× to ${s.customer}` }, ...prev]);
    setItem(""); setCustomer(""); setQty("1");
    toast.success("Sample issued - tracked against your demo float");
  };

  const setStatus = (id: string, status: Sample["status"]) =>
    setSamples(prev => prev.map(s => s.id === id ? { ...s, status } : s));

  const badge = (st: Sample["status"]) =>
    st === "issued" ? "bg-yellow-950/30 text-yellow-400" : st === "returned" ? "bg-blue-950/30 text-blue-400" : "bg-green-950/30 text-green-400";

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Boxes size={14} className="text-[var(--color-primary)]" /> Sample / Demo-Stock Issue</h3>
          <span className="text-[10px] text-[var(--color-muted)]">Out on demo: <span className="text-[var(--color-text)] font-semibold tabular-nums">{outstanding}</span></span>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Track samples and demo units you hand out on the beat so the float reconciles - mark each returned or converted to a sale.</p>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-5">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Item</label>
            <input value={item} onChange={e => setItem(e.target.value)} placeholder="Demo blender" className={INP} />
          </div>
          <div className="col-span-5">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Issued to</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Sharma Stores" className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Qty</label>
            <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className={INP} />
          </div>
        </div>
        <button onClick={issue} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium">
          <Plus size={14} /> Issue sample
        </button>
      </div>

      {samples.length > 0 && (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {samples.slice(0, 15).map(s => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1 min-w-0">
                <span className="text-xs font-medium truncate block">{s.qty}× {s.item}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{s.customer} · {format(new Date(s.at), "d MMM")}</span>
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${badge(s.status)}`}>{s.status}</span>
              {s.status === "issued" && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setStatus(s.id, "returned")} className="text-[10px] border border-[var(--color-border)] text-[var(--color-muted)] px-2 py-1 rounded hover:text-[var(--color-text)]">Returned</button>
                  <button onClick={() => setStatus(s.id, "converted")} className="text-[10px] border border-green-800/40 text-green-400 bg-green-950/20 px-2 py-1 rounded">Sold</button>
                </div>
              )}
              <button onClick={() => setSamples(prev => prev.filter(x => x.id !== s.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Daily-call planner (next-visit plan with priority + status) ──────────────────────
interface PlannedCall { id: string; customer: string; reason: string; priority: "low" | "medium" | "high"; date: string; done: boolean }
function CallPlanner() {
  const [calls, setCalls] = useFeatureState<PlannedCall[]>("field-callplan", []);
  const [customer, setCustomer] = useState("");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [date, setDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));

  const rank = { high: 0, medium: 1, low: 2 } as const;
  const sorted = useMemo(
    () => [...calls].sort((a, b) =>
      a.date === b.date ? rank[a.priority] - rank[b.priority] : a.date.localeCompare(b.date)),
    [calls],
  );
  const pending = calls.filter(c => !c.done).length;

  const add = () => {
    if (!customer.trim()) { toast.error("Add the customer to call"); return; }
    if (!date) { toast.error("Pick a date"); return; }
    setCalls(prev => [{ id: crypto.randomUUID(), customer: customer.trim(), reason: reason.trim(), priority, date, done: false }, ...prev]);
    setCustomer(""); setReason(""); setPriority("medium");
    toast.success("Call planned");
  };

  const dot = (p: PlannedCall["priority"]) => p === "high" ? "bg-red-400" : p === "medium" ? "bg-yellow-400" : "bg-green-400";

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Daily-Call Planner</h3>
          <span className="text-[10px] text-[var(--color-muted)]">{pending} pending</span>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Plan tomorrow's calls tonight - schedule customers by date and priority so the beat starts with a clear list. Works fully offline.</p>
        <div className="grid grid-cols-2 gap-3">
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer *" className={INP} />
          <DatePicker value={date} onChange={setDate} />
        </div>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (order / collection / demo)" className={INP} />
        <div className="flex items-center gap-2">
          <select value={priority} onChange={e => setPriority(e.target.value as "low" | "medium" | "high")} className={`${INP} max-w-[140px]`}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button onClick={add} className="flex-1 flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={14} /> Plan call
          </button>
        </div>
      </div>

      {calls.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No calls planned. Build a date-ordered call list so no customer is missed on the beat.</p>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {sorted.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <button onClick={() => setCalls(prev => prev.map(x => x.id === c.id ? { ...x, done: !x.done } : x))}
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${c.done ? "bg-green-500 border-green-500" : "border-[var(--color-border)]"}`}>
                {c.done && <CheckCircle2 size={11} className="text-white" />}
              </button>
              <span className={`w-2 h-2 rounded-full shrink-0 ${dot(c.priority)}`} />
              <span className="flex-1 min-w-0">
                <span className={`text-xs font-medium truncate block ${c.done ? "line-through text-[var(--color-muted)]" : ""}`}>{c.customer}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{format(new Date(c.date), "EEE, d MMM")}{c.reason && ` · ${c.reason}`}</span>
              </span>
              <button onClick={() => setCalls(prev => prev.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
