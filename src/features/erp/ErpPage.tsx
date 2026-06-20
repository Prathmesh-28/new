import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Factory, Package, ListTree, ClipboardList,
  Plus, RefreshCw, ArrowDownToLine, ChevronDown, ChevronRight,
  Play, CheckCircle2, X, Trash2,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (response shapes inlined — Books inventory + ERP endpoints)
// ─────────────────────────────────────────────────────────────────────────────
type ValuationMethod = "WAvg" | "FIFO";

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_qty: number | string;
  valuation_method: string;
}

interface BomComponent {
  component_item_id: string;
  qty: number | string;
}

interface BomRow {
  id: string;
  name: string;
  item_id: string;
  output_qty: number | string;
  components?: BomComponent[];
}

type WoStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED";

interface WorkOrder {
  id: string;
  bom_id: string;
  qty: number | string;
  status: string;
  finished_item_id?: string | null;
  cogs?: number | string | null;
}

type TabId = "items" | "boms" | "wos";

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

const WRITE_ROLES = new Set(["super_admin", "owner", "finance_manager", "accountant", "production_manager"]);

const WO_STYLE: Record<WoStatus, string> = {
  PLANNED:     "bg-blue-900/30 text-blue-300 border border-blue-700/40",
  IN_PROGRESS: "bg-amber-900/30 text-amber-300 border border-amber-700/40",
  COMPLETED:   "bg-green-900/30 text-green-300 border border-green-700/40",
};

// ─────────────────────────────────────────────────────────────────────────────
// SMALL REUSABLE PIECES
// ─────────────────────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-50 transition-colors";

function WoStatusPill({ status }: { status: string }) {
  const key = (status || "").toUpperCase() as WoStatus;
  const cls = WO_STYLE[key] ?? "bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{(key || "—").replace("_", " ")}</span>;
}

function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-[var(--color-border)]">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-3">
              <div
                className="h-3 rounded bg-[var(--color-border)] animate-pulse"
                style={{ width: `${40 + ((r + c) % 4) * 15}%` }}
              />
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
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [i, b, w] = await Promise.all([
        api.get<InventoryItem[]>("/api/books/inventory/items"),
        api.get<BomRow[]>("/api/erp/boms"),
        api.get<WorkOrder[]>("/api/erp/work-orders"),
      ]);
      setItems(Array.isArray(i) ? i : []);
      setBoms(Array.isArray(b) ? b : []);
      setWos(Array.isArray(w) ? w : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "items", label: "Items",       icon: <Package size={14} /> },
    { id: "boms",  label: "BOMs",        icon: <ListTree size={14} /> },
    { id: "wos",   label: "Work Orders", icon: <ClipboardList size={14} /> },
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
          Stock items, bills of materials &amp; work orders · built on Books inventory
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
              </button>
            );
          })}
        </div>
      </div>

      {/* BODY */}
      <div className="px-4 sm:px-6 py-5 pb-12">
        {tab === "items" && (
          <ItemsTab loading={loading} items={items} canWrite={canWrite} onReload={loadAll} />
        )}
        {tab === "boms" && (
          <BomsTab loading={loading} boms={boms} items={items} canWrite={canWrite} onReload={loadAll} />
        )}
        {tab === "wos" && (
          <WorkOrdersTab loading={loading} wos={wos} boms={boms} items={items} canWrite={canWrite} onReload={loadAll} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS TAB
// ─────────────────────────────────────────────────────────────────────────────
function ItemsTab({
  loading, items, canWrite, onReload,
}: {
  loading: boolean;
  items: InventoryItem[];
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const [openNew, setOpenNew] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [valuation, setValuation] = useState<ValuationMethod>("WAvg");
  const [saving, setSaving] = useState(false);

  // receive-stock mini form
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
        name: name.trim(),
        unit: unit.trim(),
        valuationMethod: valuation,
      });
      toast.success(`Item "${name.trim()}" created`);
      setName("");
      setUnit("");
      setValuation("WAvg");
      setOpenNew(false);
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const receiveStock = async () => {
    if (!recvItemId) { toast.error("Pick an item"); return; }
    const q = num(recvQty);
    const r = num(recvRate);
    if (q <= 0) { toast.error("Enter a quantity above zero"); return; }
    if (r <= 0) { toast.error("Enter a rate above zero"); return; }
    setReceiving(true);
    try {
      await api.post("/api/books/inventory/receive", { itemId: recvItemId, qty: q, rate: r });
      toast.success(`Received ${qtyStr(q)} @ ${rupee(r)}`);
      setRecvQty("");
      setRecvRate("");
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setReceiving(false);
    }
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

      {/* NEW ITEM FORM */}
      {openNew && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New stock item</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpenNew(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              Cancel
            </button>
            <button type="button" onClick={createItem} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Create item
            </button>
          </div>
        </div>
      )}

      {/* RECEIVE STOCK MINI FORM */}
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
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>
                ))}
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
              {receiving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
              Receive stock
            </button>
          </div>
        </div>
      )}

      {/* ITEMS TABLE */}
      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <Th>Item</Th>
              <Th>Unit</Th>
              <Th right>On-hand</Th>
              <Th>Valuation</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows cols={4} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-[var(--color-muted)]">
                  No items yet — add raw materials first, then build a BOM.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5 font-medium">{it.name}</td>
                  <td className="px-3 py-2.5 text-[var(--color-muted)]">{it.unit}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{qtyStr(it.current_qty)}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]">
                      {it.valuation_method || "—"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOMs TAB
// ─────────────────────────────────────────────────────────────────────────────
interface DraftComponent {
  componentItemId: string;
  qty: string;
}

function BomsTab({
  loading, boms, items, canWrite, onReload,
}: {
  loading: boolean;
  boms: BomRow[];
  items: InventoryItem[];
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const [openNew, setOpenNew] = useState(false);
  const [name, setName] = useState("");
  const [finishedItemId, setFinishedItemId] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [rows, setRows] = useState<DraftComponent[]>([{ componentItemId: "", qty: "" }]);
  const [saving, setSaving] = useState(false);

  // expand state + lazily-loaded full BOM (with components)
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, BomRow>>({});
  const [detailBusy, setDetailBusy] = useState<string | null>(null);

  const itemName = useCallback((id: string) => items.find((it) => it.id === id)?.name ?? "Unknown item", [items]);

  const addRow = () => setRows((r) => [...r, { componentItemId: "", qty: "" }]);
  const removeRow = (i: number) => setRows((r) => (r.length === 1 ? r : r.filter((_, idx) => idx !== i)));
  const setRow = (i: number, patch: Partial<DraftComponent>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const resetForm = () => {
    setName("");
    setFinishedItemId("");
    setOutputQty("1");
    setRows([{ componentItemId: "", qty: "" }]);
  };

  const createBom = async () => {
    if (!name.trim()) { toast.error("Enter a BOM name"); return; }
    if (!finishedItemId) { toast.error("Pick the finished item this BOM produces"); return; }
    if (num(outputQty) <= 0) { toast.error("Output quantity must be above zero"); return; }
    const components = rows
      .filter((r) => r.componentItemId && num(r.qty) > 0)
      .map((r) => ({ componentItemId: r.componentItemId, qty: num(r.qty) }));
    if (components.length === 0) { toast.error("Add at least one component with a quantity"); return; }

    setSaving(true);
    try {
      await api.post<BomRow>("/api/erp/boms", {
        name: name.trim(),
        itemId: finishedItemId,
        outputQty: num(outputQty),
        components,
      });
      toast.success(`BOM "${name.trim()}" created`);
      resetForm();
      setOpenNew(false);
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = async (bom: BomRow) => {
    if (expanded === bom.id) { setExpanded(null); return; }
    setExpanded(bom.id);
    if (detail[bom.id] || (bom.components && bom.components.length > 0)) {
      if (!detail[bom.id] && bom.components) setDetail((d) => ({ ...d, [bom.id]: bom }));
      return;
    }
    setDetailBusy(bom.id);
    try {
      const full = await api.get<BomRow>(`/api/erp/boms/${bom.id}`);
      setDetail((d) => ({ ...d, [bom.id]: full }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDetailBusy(null);
    }
  };

  const compCount = (b: BomRow) => detail[b.id]?.components?.length ?? b.components?.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{boms.length} bill(s) of materials</p>
        {canWrite && (
          <button
            type="button"
            onClick={() => setOpenNew((o) => !o)}
            disabled={items.length === 0}
            className={btnPrimary}
            title={items.length === 0 ? "Add items first" : undefined}
          >
            <Plus size={14} /> New BOM
          </button>
        )}
      </div>

      {/* NEW BOM FORM */}
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
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Output quantity</label>
              <input value={outputQty} onChange={(e) => setOutputQty(e.target.value)} inputMode="decimal" placeholder="1" className={`${inputCls} font-mono tabular-nums`} />
            </div>
          </div>

          {/* DYNAMIC COMPONENT ROWS */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <label className={`${labelCls} mb-0`}>Components consumed</label>
              <button type="button" onClick={addRow} className="text-xs inline-flex items-center gap-1 text-[var(--color-primary)] hover:opacity-80">
                <Plus size={13} /> Add component
              </button>
            </div>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={row.componentItemId}
                    onChange={(e) => setRow(i, { componentItemId: e.target.value })}
                    className={`${inputCls} flex-1`}
                  >
                    <option value="">Select component…</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>
                    ))}
                  </select>
                  <input
                    value={row.qty}
                    onChange={(e) => setRow(i, { qty: e.target.value })}
                    inputMode="decimal"
                    placeholder="qty"
                    className={`${inputCls} w-28 font-mono tabular-nums`}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove row"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => { setOpenNew(false); resetForm(); }} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              Cancel
            </button>
            <button type="button" onClick={createBom} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Create BOM
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
        <EmptyHint>
          {items.length === 0
            ? "No BOMs yet — add raw materials in the Items tab first, then build a BOM."
            : "No BOMs yet — create one to define what a finished good is made of."}
        </EmptyHint>
      ) : (
        <div className="space-y-2">
          {boms.map((b) => {
            const isOpen = expanded === b.id;
            const full = detail[b.id];
            const comps = full?.components ?? b.components ?? [];
            return (
              <div key={b.id} className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
                <button
                  type="button"
                  onClick={() => void toggleExpand(b)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg)]/50"
                >
                  {isOpen ? <ChevronDown size={16} className="text-[var(--color-muted)]" /> : <ChevronRight size={16} className="text-[var(--color-muted)]" />}
                  <span className="font-medium flex-1">{b.name}</span>
                  <span className="text-xs text-[var(--color-muted)]">
                    → {itemName(b.item_id)} · <span className="tabular-nums">{qtyStr(b.output_qty)}</span> out
                  </span>
                  <span className="text-[11px] text-[var(--color-muted)] tabular-nums whitespace-nowrap">
                    {compCount(b)} component(s)
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-[var(--color-border)] px-4 py-3 bg-[var(--color-bg)]/30">
                    {detailBusy === b.id ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, k) => (
                          <div key={k} className="h-3 w-1/2 rounded bg-[var(--color-border)] animate-pulse" />
                        ))}
                      </div>
                    ) : comps.length === 0 ? (
                      <p className="text-xs text-[var(--color-muted)]">No components recorded for this BOM.</p>
                    ) : (
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <Th>Component</Th>
                            <Th right>Qty per batch</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {comps.map((c, idx) => (
                            <tr key={`${c.component_item_id}-${idx}`} className="border-b border-[var(--color-border)] last:border-b-0">
                              <td className="px-3 py-2">{itemName(c.component_item_id)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{qtyStr(c.qty)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
// WORK ORDERS TAB
// ─────────────────────────────────────────────────────────────────────────────
function WorkOrdersTab({
  loading, wos, boms, items, canWrite, onReload,
}: {
  loading: boolean;
  wos: WorkOrder[];
  boms: BomRow[];
  items: InventoryItem[];
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const [openNew, setOpenNew] = useState(false);
  const [bomId, setBomId] = useState("");
  const [qty, setQty] = useState("1");
  const [finishedItemId, setFinishedItemId] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const bomName = useCallback((id: string) => boms.find((b) => b.id === id)?.name ?? "Unknown BOM", [boms]);
  const itemName = useCallback((id: string | null | undefined) => (id ? items.find((it) => it.id === id)?.name ?? "—" : "—"), [items]);

  const createWo = async () => {
    if (!bomId) { toast.error("Pick a BOM"); return; }
    if (num(qty) <= 0) { toast.error("Quantity must be above zero"); return; }
    setSaving(true);
    try {
      await api.post<WorkOrder>("/api/erp/work-orders", {
        bomId,
        qty: num(qty),
        ...(finishedItemId ? { finishedItemId } : {}),
      });
      toast.success("Work order created");
      setBomId("");
      setQty("1");
      setFinishedItemId("");
      setOpenNew(false);
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const startWo = async (wo: WorkOrder) => {
    setBusyId(wo.id);
    try {
      await api.post(`/api/erp/work-orders/${wo.id}/start`, {});
      toast.success("Work order started");
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const completeWo = async (wo: WorkOrder) => {
    setBusyId(wo.id);
    try {
      const res = await api.post<{ cogs?: number | string }>(`/api/erp/work-orders/${wo.id}/complete`, {});
      const cogs = res?.cogs;
      toast.success(cogs != null ? `Completed — produced cost ${rupee(cogs)}` : "Work order completed");
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{wos.length} work order(s)</p>
        {canWrite && (
          <button
            type="button"
            onClick={() => setOpenNew((o) => !o)}
            disabled={boms.length === 0}
            className={btnPrimary}
            title={boms.length === 0 ? "Create a BOM first" : undefined}
          >
            <Plus size={14} /> New work order
          </button>
        )}
      </div>

      {/* NEW WO FORM */}
      {openNew && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New work order</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>BOM</label>
              <select value={bomId} onChange={(e) => setBomId(e.target.value)} className={inputCls}>
                <option value="">Select BOM…</option>
                {boms.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
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
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpenNew(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              Cancel
            </button>
            <button type="button" onClick={createWo} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Create work order
            </button>
          </div>
        </div>
      )}

      {/* WO LIST */}
      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <Th>BOM</Th>
              <Th>Finished item</Th>
              <Th right>Qty</Th>
              <Th>Status</Th>
              <Th right>COGS</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows cols={6} rows={5} />
            ) : wos.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[var(--color-muted)]">
                  {boms.length === 0
                    ? "No work orders yet — create a BOM first, then raise a work order to build it."
                    : "No work orders yet — create one to start manufacturing."}
                </td>
              </tr>
            ) : (
              wos.map((wo) => {
                const status = (wo.status || "").toUpperCase();
                const isPlanned = status === "PLANNED";
                const isInProgress = status === "IN_PROGRESS";
                const isCompleted = status === "COMPLETED";
                const busy = busyId === wo.id;
                return (
                  <tr key={wo.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{bomName(wo.bom_id)}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{itemName(wo.finished_item_id)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{qtyStr(wo.qty)}</td>
                    <td className="px-3 py-2.5"><WoStatusPill status={wo.status} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {isCompleted && wo.cogs != null ? rupee(wo.cogs) : <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        {canWrite && isPlanned && (
                          <button
                            type="button"
                            onClick={() => void startWo(wo)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-40"
                          >
                            {busy ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />} Start
                          </button>
                        )}
                        {canWrite && isInProgress && (
                          <button
                            type="button"
                            onClick={() => void completeWo(wo)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40"
                          >
                            {busy ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Complete
                          </button>
                        )}
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 size={12} /> Done
                          </span>
                        )}
                        {!canWrite && !isCompleted && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                            <X size={11} /> View only
                          </span>
                        )}
                      </div>
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
