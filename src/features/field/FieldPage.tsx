import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Wifi, WifiOff, RefreshCw, Calculator, MapPin, Truck, Gauge, ClipboardList,
  Sun, Route, Camera, CloudUpload, CheckCircle2, Plus, Trash2, Signal, Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// shared styles (reused from TaxPage/DebtPage convention)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

// ── Shared offline-queue shape (used by several tools + day summary) ──────────────
type QueueKind = "sale" | "collection" | "visit" | "daysheet" | "receipt";
interface QueueItem {
  id: string;
  kind: QueueKind;
  label: string;
  amount: number;      // ₹ — 0 when not money
  at: string;          // ISO timestamp captured
  synced: boolean;
  meta?: string;       // optional extra context (gps, customer, note)
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
  | "daysheet" | "lowdata" | "visits" | "summary" | "beat" | "receipt";

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
] as const;

export default function FieldPage() {
  const [tab, setTab] = useState<FieldTab>("overview");
  const online = useOnline();
  const [queue] = useFeatureState<QueueItem[]>("field-queue", []);
  const pending = queue.filter(q => !q.synced).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Smartphone size={18} className="text-[var(--color-primary)]" /> Field &amp; Offline
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Bill, collect and reconcile at the counter, in the van, on a weak signal — then sync when the network returns.
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
          hint are all feature-detected — if a device can't do it, the tool degrades gracefully instead of breaking. Money
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
        The Network Information API (effective type / downlink / saveData) is not available in every browser — fields show
        “Not reported” where the device doesn't expose them. Online/offline detection works everywhere via navigator.onLine.
      </p>
    </div>
  );
}

// ── #2 Offline action queue ──────────────────────────────────────────────────────────
function OfflineQueue({ online }: { online: boolean }) {
  const [queue, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<QueueKind>("sale");

  const pending = queue.filter(q => !q.synced);

  const capture = () => {
    if (!label.trim()) { toast.error("Add a short description for the entry"); return; }
    const item: QueueItem = {
      id: crypto.randomUUID(), kind, label: label.trim(),
      amount: parseFloat(amount) || 0, at: new Date().toISOString(), synced: false,
    };
    setQueue(prev => [item, ...prev]);
    setLabel(""); setAmount("");
    toast.success("Captured offline — queued for sync");
  };

  const syncNow = () => {
    if (pending.length === 0) { toast.error("Nothing pending to sync"); return; }
    if (!online) { toast.error("Still offline — entries stay queued until the network returns"); return; }
    setQueue(prev => prev.map(q => ({ ...q, synced: true })));
    toast.success(`Flushed ${pending.length} entr${pending.length === 1 ? "y" : "ies"} to the books`);
  };

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
        <button onClick={syncNow} disabled={pending.length === 0}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-2 rounded-lg hover:bg-[var(--color-primary)]/25 disabled:opacity-40">
          <RefreshCw size={12} /> Sync now ({pending.length})
        </button>
        {queue.length > 0 && (
          <button onClick={() => { setQueue([]); toast.success("Queue cleared"); }} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Clear all</button>
        )}
      </div>

      {queue.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No queued entries. Capture sales and collections here while offline — they hold safely until you sync.</p>
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
                  <td className="px-4 py-2.5 tabular-nums text-xs">{q.amount > 0 ? formatCurrency(q.amount) : "—"}</td>
                  <td className="px-4 py-2.5">
                    {q.synced
                      ? <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-semibold"><CheckCircle2 size={11} /> Synced</span>
                      : <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400 font-semibold"><CloudUpload size={11} /> Pending</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setQueue(prev => prev.filter(x => x.id !== q.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">
        Honest note: “Sync now” marks queued items as committed locally to simulate the flush. Real server sync happens
        automatically through the app's sync engine once you're back online — this view lets you stage entries in the meantime.
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
        <p className="text-xs text-[var(--color-muted)]">Counter-speed billing — minimal taps. Add items, hand over a UPI link, save to the queue.</p>
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
  const [, setQueue] = useFeatureState<QueueItem[]>("field-queue", []);
  const [customer, setCustomer] = useState("");
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
      meta: coords ? `GPS ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : "No GPS stamp",
    }, ...prev]);
    setCustomer(""); setAmount(""); setCoords(null);
    toast.success("Collection recorded to queue");
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin size={14} className="text-[var(--color-primary)]" /> Field Collection Capture</h3>
        <p className="text-xs text-[var(--color-muted)]">Record a doorstep collection with a verifiable timestamp and an optional GPS stamp — useful proof against fake-collection disputes.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Sharma Stores" className={INP} />
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
      <p className="text-[10px] text-[var(--color-muted)]">Location uses the browser Geolocation API and asks for permission. If the device or user declines, the collection still records — just without a GPS stamp.</p>
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
        <p className="text-xs text-[var(--color-muted)]">Reconcile the route: opening stock, sales, returns and cash collected — settle the closing position.</p>
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
            <p className="text-xs text-[var(--color-muted)] mt-1">Respect ₹-per-MB rural plans — sync the essentials, hold the heavy stuff.</p>
          </div>
          <button onClick={() => { setLowData(!lowData); toast.success(`Low-data mode ${!lowData ? "on" : "off"}`); }}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${lowData ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`}>
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${lowData ? "left-6" : "left-1"}`} />
          </button>
        </div>
        {deviceSaveData && (
          <p className="text-[10px] text-yellow-400 mt-3">Your device's own data-saver is also enabled — the app will be extra conservative.</p>
        )}
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-2">When low-data mode is {lowData ? "on" : "off"}, this would:</p>
        <ul className="space-y-2 text-xs text-[var(--color-muted)]">
          {[
            "Pause uploading receipt photos until you're on Wi-Fi",
            "Sync ledger entries only — defer charts, logos and avatars",
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
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{v.purpose || "—"}</td>
                  <td className="px-4 py-2.5 text-xs">{v.outcome || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-primary)]">{v.followUp || "—"}</td>
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
      toast.success("Large photo captured — stored by name to keep data light");
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
