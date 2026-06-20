import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Factory, Package, ListTree, ClipboardList, ShoppingCart,
  Plus, RefreshCw, ArrowDownToLine, ChevronDown, ChevronRight,
  Play, CheckCircle2, X, Trash2, Wrench, AlertTriangle, Timer, Boxes,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (response shapes — Books inventory + ERP endpoints)
// ─────────────────────────────────────────────────────────────────────────────
type ValuationMethod = "WAvg" | "FIFO";

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_qty: number | string;
  current_value?: number | string;
  reorder_level?: number | string;
  valuation_method: string;
}

interface BomComponent {
  id?: string;
  component_item_id: string;
  qty: number | string;
  sub_bom_id?: string | null;
}

interface BomOperation {
  id?: string;
  operation: string;
  workstation?: string | null;
  time_mins: number | string;
  hourly_rate: number | string;
}

interface BomRow {
  id: string;
  name: string;
  item_id: string;
  output_qty: number | string;
  raw_material_cost?: number | string;
  operating_cost?: number | string;
  total_cost?: number | string;
  components?: BomComponent[];
  operations?: BomOperation[];
}

interface ExplodedRow {
  itemId: string;
  name: string;
  unit: string;
  requiredQty: number;
  rate: number;
  amount: number;
}
interface ExplodeResponse {
  bomId: string;
  produceQty: number;
  rawMaterials: ExplodedRow[];
  rawMaterialCost: number;
}

type WoStatus = "NOT_STARTED" | "IN_PROCESS" | "COMPLETED" | "STOPPED" | "CANCELLED";

interface WorkOrder {
  id: string;
  bom_id: string;
  qty: number | string;
  status: string;
  finished_item_id?: string | null;
  material_transferred?: number | string;
  produced_qty?: number | string;
  planned_operating_cost?: number | string;
  actual_operating_cost?: number | string;
  raw_material_cost?: number | string;
  total_cogs?: number | string | null;
  produced_rate?: number | string | null;
}

interface WoItem { id: string; item_id: string; required_qty: number | string; transferred_qty: number | string; consumed_qty: number | string; rate: number | string; }
interface WoOperation { id: string; operation: string; workstation?: string | null; time_mins: number | string; hourly_rate: number | string; planned_operating_cost: number | string; actual_time_mins?: number | string; actual_operating_cost: number | string; completed_qty: number | string; status: string; }
interface JobCard { id: string; operation: string; workstation?: string | null; hourly_rate: number | string; for_qty: number | string; from_time?: string | null; to_time?: string | null; time_mins: number | string; operating_cost: number | string; completed_qty: number | string; status: string; }
interface WorkOrderDetail extends WorkOrder { requiredItems: WoItem[]; operations: WoOperation[]; jobCards: JobCard[]; }

interface MrItem { id: string; item_id: string; item_name?: string; unit?: string; qty: number | string; ordered_qty: number | string; projected_qty?: number | string | null; reorder_level?: number | string | null; }
interface MaterialRequest { id: string; request_type: string; status: string; source: string; note?: string | null; created_at: string; items?: MrItem[]; derivedStatus?: string; }

interface ReorderRow { itemId: string; name: string; unit: string; currentQty: number; reorderLevel: number; suggestedQty: number; }

type TabId = "items" | "boms" | "wos" | "requests";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}
function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function qtyStr(v: number | string | null | undefined): string {
  return num(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}
function rupee(v: number | string | null | undefined): string {
  return `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const WRITE_ROLES = new Set(["super_admin", "owner", "finance_manager", "operations_manager"]);

const WO_STYLE: Record<WoStatus, string> = {
  NOT_STARTED: "bg-blue-900/30 text-blue-300 border border-blue-700/40",
  IN_PROCESS:  "bg-amber-900/30 text-amber-300 border border-amber-700/40",
  COMPLETED:   "bg-green-900/30 text-green-300 border border-green-700/40",
  STOPPED:     "bg-red-900/30 text-red-300 border border-red-700/40",
  CANCELLED:   "bg-zinc-800 text-zinc-400 border border-zinc-700/50",
};
const MR_STYLE: Record<string, string> = {
  PENDING:            "bg-blue-900/30 text-blue-300 border border-blue-700/40",
  PARTIALLY_ORDERED:  "bg-amber-900/30 text-amber-300 border border-amber-700/40",
  ORDERED:            "bg-green-900/30 text-green-300 border border-green-700/40",
  DRAFT:              "bg-zinc-800 text-zinc-400 border border-zinc-700/50",
  CANCELLED:          "bg-zinc-800 text-zinc-400 border border-zinc-700/50",
};

// ─────────────────────────────────────────────────────────────────────────────
// SMALL REUSABLE PIECES
// ─────────────────────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";

function Pill({ label, cls }: { label: string; cls: string }) {
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}
function WoStatusPill({ status }: { status: string }) {
  const key = (status || "").toUpperCase() as WoStatus;
  const cls = WO_STYLE[key] ?? "bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]";
  return <Pill label={(key || "—").replace(/_/g, " ")} cls={cls} />;
}
function MrStatusPill({ status }: { status: string }) {
  const key = (status || "").toUpperCase();
  const cls = MR_STYLE[key] ?? "bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]";
  return <Pill label={(key || "—").replace(/_/g, " ")} cls={cls} />;
}

function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-[var(--color-border)]">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-3">
              <div className="h-3 rounded bg-[var(--color-border)] animate-pulse" style={{ width: `${40 + ((r + c) % 4) * 15}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-[var(--color-muted)] text-center py-10 border border-dashed border-[var(--color-border)] rounded-lg">
      {children}
    </p>
  );
}
function CostChip({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{rupee(value)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function ErpPage() {
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.has(user?.role ?? "");

  const [tab, setTab] = useState<TabId>("items");

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [boms, setBoms] = useState<BomRow[]>([]);
  const [wos, setWos] = useState<WorkOrder[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [reorder, setReorder] = useState<ReorderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [i, b, w, mr, ro] = await Promise.all([
        api.get<InventoryItem[]>("/api/books/inventory/items"),
        api.get<BomRow[]>("/api/erp/boms"),
        api.get<WorkOrder[]>("/api/erp/work-orders"),
        api.get<MaterialRequest[]>("/api/erp/material-requests"),
        api.get<ReorderRow[]>("/api/erp/reorder"),
      ]);
      setItems(Array.isArray(i) ? i : []);
      setBoms(Array.isArray(b) ? b : []);
      setWos(Array.isArray(w) ? w : []);
      setRequests(Array.isArray(mr) ? mr : []);
      setReorder(Array.isArray(ro) ? ro : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "items",    label: "Items",            icon: <Package size={14} /> },
    { id: "boms",     label: "BOMs",             icon: <ListTree size={14} /> },
    { id: "wos",      label: "Work Orders",      icon: <ClipboardList size={14} /> },
    { id: "requests", label: "Material Requests", icon: <ShoppingCart size={14} />, badge: reorder.length || undefined },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* HEADER */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Factory size={20} className="text-[var(--color-primary)]" />
          ERP — manufacturing
        </h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Multi-level BOMs · routing &amp; cost rollup · work-order lifecycle · material requests · built on Books inventory
        </p>
      </div>

      {/* PILL TAB BAR */}
      <div className="px-4 sm:px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/40">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors ${
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"
                }`}
              >
                {t.icon}
                {t.label}
                {t.badge ? (
                  <span className="ml-0.5 text-[10px] font-bold bg-amber-500 text-black rounded-full px-1.5 leading-4">{t.badge}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* BODY */}
      <div className="px-4 sm:px-6 py-5 pb-12">
        {tab === "items" && <ItemsTab loading={loading} items={items} canWrite={canWrite} onReload={loadAll} />}
        {tab === "boms" && <BomsTab loading={loading} boms={boms} items={items} canWrite={canWrite} onReload={loadAll} />}
        {tab === "wos" && <WorkOrdersTab loading={loading} wos={wos} boms={boms} items={items} canWrite={canWrite} onReload={loadAll} />}
        {tab === "requests" && <RequestsTab loading={loading} requests={requests} reorder={reorder} items={items} canWrite={canWrite} onReload={loadAll} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS TAB
// ─────────────────────────────────────────────────────────────────────────────
function ItemsTab({
  loading, items, canWrite, onReload,
}: { loading: boolean; items: InventoryItem[]; canWrite: boolean; onReload: () => Promise<void>; }) {
  const [openNew, setOpenNew] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [valuation, setValuation] = useState<ValuationMethod>("WAvg");
  const [reorderLevel, setReorderLevel] = useState("");
  const [saving, setSaving] = useState(false);

  const [recvItemId, setRecvItemId] = useState("");
  const [recvQty, setRecvQty] = useState("");
  const [recvRate, setRecvRate] = useState("");
  const [receiving, setReceiving] = useState(false);

  const createItem = async () => {
    if (!name.trim()) { toast.error("Enter an item name"); return; }
    if (!unit.trim()) { toast.error("Enter a unit (e.g. pcs, kg)"); return; }
    setSaving(true);
    try {
      await api.post<InventoryItem>("/api/books/inventory/items", {
        name: name.trim(), unit: unit.trim(), valuationMethod: valuation,
        reorderLevel: num(reorderLevel) || 0,
      });
      toast.success(`Item "${name.trim()}" created`);
      setName(""); setUnit(""); setValuation("WAvg"); setReorderLevel(""); setOpenNew(false);
      await onReload();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  const receiveStock = async () => {
    if (!recvItemId) { toast.error("Pick an item"); return; }
    const q = num(recvQty), r = num(recvRate);
    if (q <= 0) { toast.error("Enter a quantity above zero"); return; }
    if (r <= 0) { toast.error("Enter a rate above zero"); return; }
    setReceiving(true);
    try {
      await api.post("/api/books/inventory/receive", { itemId: recvItemId, qty: q, rate: r });
      toast.success(`Received ${qtyStr(q)} @ ${rupee(r)}`);
      setRecvQty(""); setRecvRate("");
      await onReload();
    } catch (e) { toast.error(errMsg(e)); } finally { setReceiving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{items.length} stock item(s)</p>
        {canWrite && (
          <button type="button" onClick={() => setOpenNew((o) => !o)} className={btnPrimary}>
            <Plus size={14} /> New item
          </button>
        )}
      </div>

      {openNew && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New stock item</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Item name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Steel sheet" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs / kg / ltr" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Valuation method</label>
              <select value={valuation} onChange={(e) => setValuation(e.target.value as ValuationMethod)} className={inputCls}>
                <option value="WAvg">Weighted average</option>
                <option value="FIFO">FIFO</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Reorder level</label>
              <input value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpenNew(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">Cancel</button>
            <button type="button" onClick={createItem} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Create item
            </button>
          </div>
        </div>
      )}

      {canWrite && items.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <ArrowDownToLine size={15} className="text-[var(--color-primary)]" /> Receive stock
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <label className={labelCls}>Item</label>
              <select value={recvItemId} onChange={(e) => setRecvItemId(e.target.value)} className={inputCls}>
                <option value="">Select item…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Quantity</label>
              <input value={recvQty} onChange={(e) => setRecvQty(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>Rate (per unit)</label>
              <input value={recvRate} onChange={(e) => setRecvRate(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button type="button" onClick={receiveStock} disabled={receiving} className={btnPrimary}>
              {receiving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />} Receive stock
            </button>
          </div>
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <Th>Item</Th><Th>Unit</Th><Th right>On-hand</Th><Th right>Reorder level</Th><Th>Valuation</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows cols={5} />
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-[var(--color-muted)]">No items yet — add raw materials first, then build a BOM.</td></tr>
            ) : (
              items.map((it) => {
                const low = num(it.reorder_level) > 0 && num(it.current_qty) <= num(it.reorder_level);
                return (
                  <tr key={it.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{it.name}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{it.unit}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${low ? "text-amber-400 font-semibold" : ""}`}>{qtyStr(it.current_qty)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{num(it.reorder_level) > 0 ? qtyStr(it.reorder_level) : "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]">
                        {it.valuation_method || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOMs TAB — builder with components + operations + live cost rollup
// ─────────────────────────────────────────────────────────────────────────────
interface DraftComponent { componentItemId: string; qty: string; subBomId: string; }
interface DraftOperation { operation: string; workstation: string; timeMins: string; hourlyRate: string; }

function BomsTab({
  loading, boms, items, canWrite, onReload,
}: { loading: boolean; boms: BomRow[]; items: InventoryItem[]; canWrite: boolean; onReload: () => Promise<void>; }) {
  const [openNew, setOpenNew] = useState(false);
  const [name, setName] = useState("");
  const [finishedItemId, setFinishedItemId] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [comps, setComps] = useState<DraftComponent[]>([{ componentItemId: "", qty: "", subBomId: "" }]);
  const [ops, setOps] = useState<DraftOperation[]>([]);
  const [saving, setSaving] = useState(false);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, BomRow>>({});
  const [exploded, setExploded] = useState<Record<string, ExplodeResponse>>({});
  const [detailBusy, setDetailBusy] = useState<string | null>(null);

  const itemName = useCallback((id: string) => items.find((it) => it.id === id)?.name ?? "Unknown item", [items]);
  const itemRate = useCallback((id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it) return 0;
    const q = num(it.current_qty);
    return q > 0 ? num(it.current_value) / q : 0;
  }, [items]);

  // live cost rollup of the draft BOM (mirrors backend rollupCost)
  const draftCost = useMemo(() => {
    let rm = 0;
    for (const c of comps) {
      if (!c.componentItemId || num(c.qty) <= 0) continue;
      // a component that points at a sub-BOM is valued at the sub-BOM's unit cost
      const sub = c.subBomId ? boms.find((b) => b.id === c.subBomId) : undefined;
      const rate = sub ? (num(sub.output_qty) > 0 ? num(sub.total_cost) / num(sub.output_qty) : 0) : itemRate(c.componentItemId);
      rm += rate * num(c.qty);
    }
    let op = 0;
    for (const o of ops) op += num(o.hourlyRate) * (num(o.timeMins) / 60);
    const total = rm + op;
    const batch = num(outputQty) > 0 ? num(outputQty) : 1;
    return { rm, op, total, unit: total / batch };
  }, [comps, ops, outputQty, boms, itemRate]);

  const addComp = () => setComps((r) => [...r, { componentItemId: "", qty: "", subBomId: "" }]);
  const removeComp = (i: number) => setComps((r) => (r.length === 1 ? r : r.filter((_, idx) => idx !== i)));
  const setComp = (i: number, patch: Partial<DraftComponent>) => setComps((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const addOp = () => setOps((r) => [...r, { operation: "", workstation: "", timeMins: "", hourlyRate: "" }]);
  const removeOp = (i: number) => setOps((r) => r.filter((_, idx) => idx !== i));
  const setOp = (i: number, patch: Partial<DraftOperation>) => setOps((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const resetForm = () => {
    setName(""); setFinishedItemId(""); setOutputQty("1");
    setComps([{ componentItemId: "", qty: "", subBomId: "" }]); setOps([]);
  };

  const createBom = async () => {
    if (!name.trim()) { toast.error("Enter a BOM name"); return; }
    if (!finishedItemId) { toast.error("Pick the finished item this BOM produces"); return; }
    if (num(outputQty) <= 0) { toast.error("Output quantity must be above zero"); return; }
    const components = comps
      .filter((r) => r.componentItemId && num(r.qty) > 0)
      .map((r) => ({ componentItemId: r.componentItemId, qty: num(r.qty), ...(r.subBomId ? { subBomId: r.subBomId } : {}) }));
    if (components.length === 0) { toast.error("Add at least one component with a quantity"); return; }
    const operations = ops
      .filter((o) => o.operation.trim())
      .map((o) => ({ operation: o.operation.trim(), workstation: o.workstation.trim() || null, timeMins: num(o.timeMins), hourlyRate: num(o.hourlyRate) }));

    setSaving(true);
    try {
      await api.post<BomRow>("/api/erp/boms", { name: name.trim(), itemId: finishedItemId, outputQty: num(outputQty), components, operations });
      toast.success(`BOM "${name.trim()}" created`);
      resetForm(); setOpenNew(false);
      await onReload();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  const toggleExpand = async (bom: BomRow) => {
    if (expanded === bom.id) { setExpanded(null); return; }
    setExpanded(bom.id);
    if (detail[bom.id]) return;
    setDetailBusy(bom.id);
    try {
      const [full, exp] = await Promise.all([
        api.get<BomRow>(`/api/erp/boms/${bom.id}`),
        api.get<ExplodeResponse>(`/api/erp/boms/${bom.id}/explode`),
      ]);
      setDetail((d) => ({ ...d, [bom.id]: full }));
      setExploded((d) => ({ ...d, [bom.id]: exp }));
    } catch (e) { toast.error(errMsg(e)); } finally { setDetailBusy(null); }
  };

  // sub-BOM options exclude BOMs producing the same finished item (avoid trivial self-ref)
  const subBomOptions = boms;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{boms.length} bill(s) of materials</p>
        {canWrite && (
          <button type="button" onClick={() => setOpenNew((o) => !o)} disabled={items.length === 0} className={btnPrimary} title={items.length === 0 ? "Add items first" : undefined}>
            <Plus size={14} /> New BOM
          </button>
        )}
      </div>

      {openNew && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New bill of materials</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>BOM name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chair assembly" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Finished item</label>
              <select value={finishedItemId} onChange={(e) => setFinishedItemId(e.target.value)} className={inputCls}>
                <option value="">Select finished item…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Output quantity (per batch)</label>
              <input value={outputQty} onChange={(e) => setOutputQty(e.target.value)} inputMode="decimal" placeholder="1" className={`${inputCls} font-mono tabular-nums`} />
            </div>
          </div>

          {/* COMPONENTS */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <label className={`${labelCls} mb-0 flex items-center gap-1.5`}><Boxes size={13} /> Components consumed</label>
              <button type="button" onClick={addComp} className="text-xs inline-flex items-center gap-1 text-[var(--color-primary)] hover:opacity-80"><Plus size={13} /> Add component</button>
            </div>
            <div className="space-y-2">
              {comps.map((row, i) => (
                <div key={i} className="flex gap-2 items-center flex-wrap md:flex-nowrap">
                  <select value={row.componentItemId} onChange={(e) => setComp(i, { componentItemId: e.target.value })} className={`${inputCls} flex-1 min-w-[140px]`}>
                    <option value="">Select component…</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
                  </select>
                  <input value={row.qty} onChange={(e) => setComp(i, { qty: e.target.value })} inputMode="decimal" placeholder="qty" className={`${inputCls} w-24 font-mono tabular-nums`} />
                  <select value={row.subBomId} onChange={(e) => setComp(i, { subBomId: e.target.value })} className={`${inputCls} w-44`} title="Treat this component as a sub-assembly built by another BOM (multi-level)">
                    <option value="">— raw material —</option>
                    {subBomOptions.map((b) => <option key={b.id} value={b.id}>sub: {b.name}</option>)}
                  </select>
                  <button type="button" onClick={() => removeComp(i)} disabled={comps.length === 1} className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed" title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* OPERATIONS / ROUTING */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <label className={`${labelCls} mb-0 flex items-center gap-1.5`}><Wrench size={13} /> Operations (routing — optional)</label>
              <button type="button" onClick={addOp} className="text-xs inline-flex items-center gap-1 text-[var(--color-primary)] hover:opacity-80"><Plus size={13} /> Add operation</button>
            </div>
            {ops.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">No operations — add cutting / welding / assembly etc. with time &amp; hourly rate to roll labour into cost.</p>
            ) : (
              <div className="space-y-2">
                {ops.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center flex-wrap md:flex-nowrap">
                    <input value={row.operation} onChange={(e) => setOp(i, { operation: e.target.value })} placeholder="Operation (e.g. Cutting)" className={`${inputCls} flex-1 min-w-[120px]`} />
                    <input value={row.workstation} onChange={(e) => setOp(i, { workstation: e.target.value })} placeholder="Workstation" className={`${inputCls} flex-1 min-w-[110px]`} />
                    <input value={row.timeMins} onChange={(e) => setOp(i, { timeMins: e.target.value })} inputMode="decimal" placeholder="mins" className={`${inputCls} w-20 font-mono tabular-nums`} />
                    <input value={row.hourlyRate} onChange={(e) => setOp(i, { hourlyRate: e.target.value })} inputMode="decimal" placeholder="₹/hr" className={`${inputCls} w-24 font-mono tabular-nums`} />
                    <button type="button" onClick={() => removeOp(i)} className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-red-400" title="Remove"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* LIVE COST ROLLUP */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <CostChip label="Raw materials" value={draftCost.rm} />
            <CostChip label="Operating cost" value={draftCost.op} />
            <CostChip label="Total / batch" value={draftCost.total} />
            <CostChip label="Cost / unit" value={draftCost.unit} />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => { setOpenNew(false); resetForm(); }} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">Cancel</button>
            <button type="button" onClick={createBom} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Create BOM
            </button>
          </div>
        </div>
      )}

      {/* BOM LIST */}
      {loading ? (
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
          <table className="w-full text-sm"><tbody><SkeletonRows cols={4} /></tbody></table>
        </div>
      ) : boms.length === 0 ? (
        <EmptyHint>{items.length === 0 ? "No BOMs yet — add raw materials in the Items tab first, then build a BOM." : "No BOMs yet — create one to define what a finished good is made of."}</EmptyHint>
      ) : (
        <div className="space-y-2">
          {boms.map((b) => {
            const isOpen = expanded === b.id;
            const full = detail[b.id];
            const compRows = full?.components ?? b.components ?? [];
            const opRows = full?.operations ?? b.operations ?? [];
            const exp = exploded[b.id];
            return (
              <div key={b.id} className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
                <button type="button" onClick={() => void toggleExpand(b)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg)]/50">
                  {isOpen ? <ChevronDown size={16} className="text-[var(--color-muted)]" /> : <ChevronRight size={16} className="text-[var(--color-muted)]" />}
                  <span className="font-medium flex-1">{b.name}</span>
                  <span className="text-xs text-[var(--color-muted)]">→ {itemName(b.item_id)} · <span className="tabular-nums">{qtyStr(b.output_qty)}</span> out</span>
                  <span className="text-[11px] text-[var(--color-primary)] tabular-nums whitespace-nowrap font-semibold">{rupee(b.total_cost)} / batch</span>
                </button>

                {isOpen && (
                  <div className="border-t border-[var(--color-border)] px-4 py-3 bg-[var(--color-bg)]/30 space-y-4">
                    {detailBusy === b.id ? (
                      <div className="space-y-2">{Array.from({ length: 3 }).map((_, k) => <div key={k} className="h-3 w-1/2 rounded bg-[var(--color-border)] animate-pulse" />)}</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <CostChip label="Raw materials" value={b.raw_material_cost} />
                          <CostChip label="Operating cost" value={b.operating_cost} />
                          <CostChip label="Total / batch" value={b.total_cost} />
                          <CostChip label="Cost / unit" value={num(b.output_qty) > 0 ? num(b.total_cost) / num(b.output_qty) : 0} />
                        </div>

                        {/* components */}
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5 flex items-center gap-1.5"><Boxes size={12} /> Components</p>
                          {compRows.length === 0 ? <p className="text-xs text-[var(--color-muted)]">None.</p> : (
                            <table className="w-full text-sm border-collapse">
                              <thead><tr className="border-b border-[var(--color-border)]"><Th>Component</Th><Th>Type</Th><Th right>Qty / batch</Th></tr></thead>
                              <tbody>
                                {compRows.map((c, idx) => (
                                  <tr key={c.id ?? `${c.component_item_id}-${idx}`} className="border-b border-[var(--color-border)] last:border-b-0">
                                    <td className="px-3 py-2">{itemName(c.component_item_id)}</td>
                                    <td className="px-3 py-2">{c.sub_bom_id ? <Pill label="sub-assembly" cls="bg-purple-900/30 text-purple-300 border border-purple-700/40" /> : <span className="text-xs text-[var(--color-muted)]">raw</span>}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{qtyStr(c.qty)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* operations */}
                        {opRows.length > 0 && (
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5 flex items-center gap-1.5"><Wrench size={12} /> Operations</p>
                            <table className="w-full text-sm border-collapse">
                              <thead><tr className="border-b border-[var(--color-border)]"><Th>Operation</Th><Th>Workstation</Th><Th right>Mins</Th><Th right>₹/hr</Th><Th right>Op cost</Th></tr></thead>
                              <tbody>
                                {opRows.map((o, idx) => (
                                  <tr key={o.id ?? idx} className="border-b border-[var(--color-border)] last:border-b-0">
                                    <td className="px-3 py-2">{o.operation}</td>
                                    <td className="px-3 py-2 text-[var(--color-muted)]">{o.workstation || "—"}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{qtyStr(o.time_mins)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{rupee(o.hourly_rate)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{rupee(num(o.hourly_rate) * (num(o.time_mins) / 60))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* exploded raw materials (multi-level) */}
                        {exp && (
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5 flex items-center gap-1.5"><ListTree size={12} /> Exploded raw materials (for {qtyStr(exp.produceQty)} unit batch)</p>
                            <table className="w-full text-sm border-collapse">
                              <thead><tr className="border-b border-[var(--color-border)]"><Th>Raw material</Th><Th right>Total qty</Th><Th right>Rate</Th><Th right>Amount</Th></tr></thead>
                              <tbody>
                                {exp.rawMaterials.map((r, idx) => (
                                  <tr key={`${r.itemId}-${idx}`} className="border-b border-[var(--color-border)] last:border-b-0">
                                    <td className="px-3 py-2">{r.name} <span className="text-[var(--color-muted)]">({r.unit})</span></td>
                                    <td className="px-3 py-2 text-right tabular-nums">{qtyStr(r.requiredQty)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{rupee(r.rate)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{rupee(r.amount)}</td>
                                  </tr>
                                ))}
                                <tr className="font-semibold"><td className="px-3 py-2" colSpan={3}>Total raw-material cost</td><td className="px-3 py-2 text-right tabular-nums">{rupee(exp.rawMaterialCost)}</td></tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WORK ORDERS TAB — lifecycle board (transfer → manufacture) + job cards
// ─────────────────────────────────────────────────────────────────────────────
function WorkOrdersTab({
  loading, wos, boms, items, canWrite, onReload,
}: { loading: boolean; wos: WorkOrder[]; boms: BomRow[]; items: InventoryItem[]; canWrite: boolean; onReload: () => Promise<void>; }) {
  const [openNew, setOpenNew] = useState(false);
  const [bomId, setBomId] = useState("");
  const [qty, setQty] = useState("1");
  const [finishedItemId, setFinishedItemId] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, WorkOrderDetail>>({});
  const [detailBusy, setDetailBusy] = useState<string | null>(null);

  const bomName = useCallback((id: string) => boms.find((b) => b.id === id)?.name ?? "Unknown BOM", [boms]);
  const itemName = useCallback((id: string | null | undefined) => (id ? items.find((it) => it.id === id)?.name ?? "—" : "—"), [items]);

  const refreshDetail = useCallback(async (id: string) => {
    try { const full = await api.get<WorkOrderDetail>(`/api/erp/work-orders/${id}`); setDetail((d) => ({ ...d, [id]: full })); }
    catch (e) { toast.error(errMsg(e)); }
  }, []);

  const createWo = async () => {
    if (!bomId) { toast.error("Pick a BOM"); return; }
    if (num(qty) <= 0) { toast.error("Quantity must be above zero"); return; }
    setSaving(true);
    try {
      await api.post<WorkOrder>("/api/erp/work-orders", { bomId, qty: num(qty), ...(finishedItemId ? { finishedItemId } : {}) });
      toast.success("Work order created");
      setBomId(""); setQty("1"); setFinishedItemId(""); setOpenNew(false);
      await onReload();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  const transferWo = async (wo: WorkOrder) => {
    setBusyId(wo.id);
    try { await api.post(`/api/erp/work-orders/${wo.id}/transfer`, {}); toast.success("Materials transferred to WIP"); await onReload(); if (expanded === wo.id) await refreshDetail(wo.id); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusyId(null); }
  };

  const manufactureWo = async (wo: WorkOrder) => {
    setBusyId(wo.id);
    try {
      const res = await api.post<{ producedRate?: number; operatingCost?: number }>(`/api/erp/work-orders/${wo.id}/manufacture`, {});
      toast.success(res?.producedRate != null ? `Manufactured — FG received @ ${rupee(res.producedRate)}/unit` : "Work order manufactured");
      await onReload(); if (expanded === wo.id) await refreshDetail(wo.id);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusyId(null); }
  };

  const toggleExpand = async (wo: WorkOrder) => {
    if (expanded === wo.id) { setExpanded(null); return; }
    setExpanded(wo.id);
    if (detail[wo.id]) return;
    setDetailBusy(wo.id);
    await refreshDetail(wo.id);
    setDetailBusy(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{wos.length} work order(s)</p>
        {canWrite && (
          <button type="button" onClick={() => setOpenNew((o) => !o)} disabled={boms.length === 0} className={btnPrimary} title={boms.length === 0 ? "Create a BOM first" : undefined}>
            <Plus size={14} /> New work order
          </button>
        )}
      </div>

      {openNew && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New work order</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>BOM</label>
              <select value={bomId} onChange={(e) => setBomId(e.target.value)} className={inputCls}>
                <option value="">Select BOM…</option>
                {boms.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Quantity to produce</label>
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="1" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>Finished item (optional)</label>
              <select value={finishedItemId} onChange={(e) => setFinishedItemId(e.target.value)} className={inputCls}>
                <option value="">Use BOM default</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpenNew(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">Cancel</button>
            <button type="button" onClick={createWo} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Create work order
            </button>
          </div>
        </div>
      )}

      {/* WO BOARD */}
      {loading ? (
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]"><table className="w-full text-sm"><tbody><SkeletonRows cols={5} rows={5} /></tbody></table></div>
      ) : wos.length === 0 ? (
        <EmptyHint>{boms.length === 0 ? "No work orders yet — create a BOM first, then raise a work order to build it." : "No work orders yet — create one to start manufacturing."}</EmptyHint>
      ) : (
        <div className="space-y-2">
          {wos.map((wo) => {
            const status = (wo.status || "").toUpperCase();
            const notStarted = status === "NOT_STARTED";
            const inProcess = status === "IN_PROCESS";
            const completed = status === "COMPLETED";
            const busy = busyId === wo.id;
            const isOpen = expanded === wo.id;
            const det = detail[wo.id];
            return (
              <div key={wo.id} className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => void toggleExpand(wo)} className="text-[var(--color-muted)]">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{bomName(wo.bom_id)} → {itemName(wo.finished_item_id)}</div>
                    <div className="text-[11px] text-[var(--color-muted)] tabular-nums">
                      qty {qtyStr(wo.qty)} · transferred {qtyStr(wo.material_transferred)} · produced {qtyStr(wo.produced_qty)}
                    </div>
                  </div>
                  <WoStatusPill status={wo.status} />
                  {completed && wo.total_cogs != null && (
                    <span className="text-[11px] text-[var(--color-muted)] tabular-nums hidden sm:inline">COGS {rupee(wo.total_cogs)}</span>
                  )}
                  <div className="flex items-center gap-2">
                    {canWrite && notStarted && (
                      <button type="button" onClick={() => void transferWo(wo)} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-40">
                        {busy ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />} Transfer
                      </button>
                    )}
                    {canWrite && inProcess && (
                      <button type="button" onClick={() => void manufactureWo(wo)} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40">
                        {busy ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Manufacture
                      </button>
                    )}
                    {completed && <span className="inline-flex items-center gap-1 text-xs text-green-400"><CheckCircle2 size={12} /> Done</span>}
                    {!canWrite && !completed && <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)]"><X size={11} /> View only</span>}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-[var(--color-border)] px-4 py-3 bg-[var(--color-bg)]/30 space-y-4">
                    {detailBusy === wo.id || !det ? (
                      <div className="space-y-2">{Array.from({ length: 3 }).map((_, k) => <div key={k} className="h-3 w-1/2 rounded bg-[var(--color-border)] animate-pulse" />)}</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <CostChip label="Raw material cost" value={det.raw_material_cost} />
                          <CostChip label="Operating (planned)" value={det.planned_operating_cost} />
                          <CostChip label="Operating (actual)" value={det.actual_operating_cost} />
                          <CostChip label="Total COGS" value={det.total_cogs} />
                        </div>

                        {/* required items */}
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5 flex items-center gap-1.5"><Boxes size={12} /> Required materials (exploded)</p>
                          <table className="w-full text-sm border-collapse">
                            <thead><tr className="border-b border-[var(--color-border)]"><Th>Material</Th><Th right>Required</Th><Th right>Transferred</Th><Th right>Consumed</Th></tr></thead>
                            <tbody>
                              {det.requiredItems.map((it) => (
                                <tr key={it.id} className="border-b border-[var(--color-border)] last:border-b-0">
                                  <td className="px-3 py-2">{itemName(it.item_id)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{qtyStr(it.required_qty)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{qtyStr(it.transferred_qty)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{qtyStr(it.consumed_qty)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* operations + job cards */}
                        {det.operations.length > 0 && (
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5 flex items-center gap-1.5"><Wrench size={12} /> Operations &amp; job cards</p>
                            <div className="space-y-2">
                              {det.operations.map((op) => (
                                <OperationRow key={op.id} woId={wo.id} op={op} canWrite={canWrite && !completed} jobCards={det.jobCards.filter((j) => j.operation === op.operation)} onChanged={() => { void onReload(); void refreshDetail(wo.id); }} />
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// One work-order operation with start/complete job-card controls.
function OperationRow({
  woId, op, jobCards, canWrite, onChanged,
}: { woId: string; op: WoOperation; jobCards: JobCard[]; canWrite: boolean; onChanged: () => void; }) {
  const [busy, setBusy] = useState(false);
  const openCard = jobCards.find((j) => j.status === "IN_PROGRESS");

  const start = async () => {
    setBusy(true);
    try { await api.post(`/api/erp/work-orders/${woId}/job-cards/start`, { woOperationId: op.id, forQty: 0 }); toast.success(`Started "${op.operation}"`); onChanged(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const complete = async () => {
    if (!openCard) return;
    setBusy(true);
    try { const res = await api.post<{ operatingCost?: number; timeMins?: number }>(`/api/erp/job-cards/${openCard.id}/complete`, {}); toast.success(`Completed — ${qtyStr(res?.timeMins)} min · ${rupee(res?.operatingCost)}`); onChanged(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-sm">{op.operation}</span>
        {op.workstation && <span className="text-[11px] text-[var(--color-muted)]">@ {op.workstation}</span>}
        <Pill label={op.status.replace(/_/g, " ")} cls={op.status === "COMPLETED" ? WO_STYLE.COMPLETED : op.status === "IN_PROGRESS" ? WO_STYLE.IN_PROCESS : WO_STYLE.NOT_STARTED} />
        <span className="text-[11px] text-[var(--color-muted)] tabular-nums ml-auto flex items-center gap-1"><Timer size={11} /> plan {qtyStr(op.time_mins)}m · {rupee(op.planned_operating_cost)} → actual {qtyStr(op.actual_time_mins ?? 0)}m · {rupee(op.actual_operating_cost)}</span>
        {canWrite && (op.status !== "COMPLETED") && (
          openCard ? (
            <button type="button" onClick={complete} disabled={busy} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40">
              {busy ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Complete card
            </button>
          ) : (
            <button type="button" onClick={start} disabled={busy} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-40">
              {busy ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />} Start card
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL REQUESTS TAB — reorder report + requests
// ─────────────────────────────────────────────────────────────────────────────
function RequestsTab({
  loading, requests, reorder, items, canWrite, onReload,
}: { loading: boolean; requests: MaterialRequest[]; reorder: ReorderRow[]; items: InventoryItem[]; canWrite: boolean; onReload: () => Promise<void>; }) {
  const [busy, setBusy] = useState(false);
  const [busyMr, setBusyMr] = useState<string | null>(null);

  // manual request builder
  const [openNew, setOpenNew] = useState(false);
  const [reqType, setReqType] = useState<"PURCHASE" | "TRANSFER" | "MANUFACTURE">("PURCHASE");
  const [rows, setRows] = useState<{ itemId: string; qty: string }[]>([{ itemId: "", qty: "" }]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const itemName = useCallback((id: string) => items.find((it) => it.id === id)?.name ?? "Unknown item", [items]);

  const raiseReorder = async () => {
    setBusy(true);
    try { const res = await api.post<{ raised: boolean; count: number }>("/api/erp/reorder/raise", {}); toast.success(res?.raised ? `Raised reorder request for ${res.count} item(s)` : "Nothing below reorder level"); await onReload(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const markOrdered = async (mr: MaterialRequest) => {
    setBusyMr(mr.id);
    try { await api.post(`/api/erp/material-requests/${mr.id}/order`, {}); toast.success("Marked as ordered"); await onReload(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusyMr(null); }
  };

  const addRow = () => setRows((r) => [...r, { itemId: "", qty: "" }]);
  const removeRow = (i: number) => setRows((r) => (r.length === 1 ? r : r.filter((_, idx) => idx !== i)));
  const setRow = (i: number, patch: Partial<{ itemId: string; qty: string }>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const createRequest = async () => {
    const reqItems = rows.filter((r) => r.itemId && num(r.qty) > 0).map((r) => ({ itemId: r.itemId, qty: num(r.qty) }));
    if (reqItems.length === 0) { toast.error("Add at least one item with a quantity"); return; }
    setSaving(true);
    try {
      await api.post("/api/erp/material-requests", { requestType: reqType, items: reqItems, note: note.trim() || undefined });
      toast.success("Material request created");
      setRows([{ itemId: "", qty: "" }]); setNote(""); setOpenNew(false);
      await onReload();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      {/* REORDER REPORT */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle size={15} className="text-amber-400" /> Reorder report</h3>
          {canWrite && reorder.length > 0 && (
            <button type="button" onClick={raiseReorder} disabled={busy} className={btnPrimary}>
              {busy ? <RefreshCw size={14} className="animate-spin" /> : <ShoppingCart size={14} />} Raise purchase request
            </button>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, k) => <div key={k} className="h-3 w-1/2 rounded bg-[var(--color-border)] animate-pulse" />)}</div>
        ) : reorder.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">All stock above reorder level. Set a reorder level on items to monitor them here.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead><tr className="border-b border-[var(--color-border)]"><Th>Item</Th><Th right>On-hand</Th><Th right>Reorder level</Th><Th right>Suggested order</Th></tr></thead>
            <tbody>
              {reorder.map((r) => (
                <tr key={r.itemId} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2 font-medium">{r.name} <span className="text-[var(--color-muted)]">({r.unit})</span></td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-400 font-semibold">{qtyStr(r.currentQty)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">{qtyStr(r.reorderLevel)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{qtyStr(r.suggestedQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MANUAL REQUEST BUILDER */}
      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ShoppingCart size={15} className="text-[var(--color-primary)]" /> Material requests</h3>
          {canWrite && (
            <button type="button" onClick={() => setOpenNew((o) => !o)} disabled={items.length === 0} className={btnPrimary}>
              <Plus size={14} /> New request
            </button>
          )}
        </div>

        {openNew && canWrite && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Request type</label>
                <select value={reqType} onChange={(e) => setReqType(e.target.value as typeof reqType)} className={inputCls}>
                  <option value="PURCHASE">Purchase</option>
                  <option value="TRANSFER">Material transfer</option>
                  <option value="MANUFACTURE">Manufacture</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Note (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / reference" className={inputCls} />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <label className={`${labelCls} mb-0`}>Items</label>
                <button type="button" onClick={addRow} className="text-xs inline-flex items-center gap-1 text-[var(--color-primary)] hover:opacity-80"><Plus size={13} /> Add item</button>
              </div>
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select value={row.itemId} onChange={(e) => setRow(i, { itemId: e.target.value })} className={`${inputCls} flex-1`}>
                      <option value="">Select item…</option>
                      {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
                    </select>
                    <input value={row.qty} onChange={(e) => setRow(i, { qty: e.target.value })} inputMode="decimal" placeholder="qty" className={`${inputCls} w-28 font-mono tabular-nums`} />
                    <button type="button" onClick={() => removeRow(i)} disabled={rows.length === 1} className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30" title="Remove"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setOpenNew(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">Cancel</button>
              <button type="button" onClick={createRequest} disabled={saving} className={btnPrimary}>
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Create request
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]"><table className="w-full text-sm"><tbody><SkeletonRows cols={4} /></tbody></table></div>
        ) : requests.length === 0 ? (
          <EmptyHint>No material requests yet — raise one from the reorder report, or create a manual request above.</EmptyHint>
        ) : (
          <div className="space-y-2">
            {requests.map((mr) => (
              <div key={mr.id} className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
                <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
                  <Pill label={mr.request_type} cls="bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]" />
                  <span className="text-xs text-[var(--color-muted)]">{(mr.items?.length ?? 0)} item(s)</span>
                  {mr.source === "reorder" && <Pill label="auto-reorder" cls="bg-purple-900/30 text-purple-300 border border-purple-700/40" />}
                  {mr.note && <span className="text-xs text-[var(--color-muted)] truncate max-w-[40%]">{mr.note}</span>}
                  <div className="ml-auto flex items-center gap-3">
                    <MrStatusPill status={mr.derivedStatus || mr.status} />
                    {canWrite && (mr.derivedStatus || mr.status) !== "ORDERED" && (
                      <button type="button" onClick={() => void markOrdered(mr)} disabled={busyMr === mr.id} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-40">
                        {busyMr === mr.id ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Mark ordered
                      </button>
                    )}
                  </div>
                </div>
                {(mr.items?.length ?? 0) > 0 && (
                  <div className="border-t border-[var(--color-border)] px-4 py-2 bg-[var(--color-bg)]/30">
                    <table className="w-full text-sm border-collapse">
                      <thead><tr className="border-b border-[var(--color-border)]"><Th>Item</Th><Th right>Qty</Th><Th right>Ordered</Th></tr></thead>
                      <tbody>
                        {mr.items!.map((it) => (
                          <tr key={it.id} className="border-b border-[var(--color-border)] last:border-b-0">
                            <td className="px-3 py-2">{it.item_name || itemName(it.item_id)}{it.unit ? ` (${it.unit})` : ""}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{qtyStr(it.qty)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{qtyStr(it.ordered_qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
