import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Boxes, Plus, RefreshCw, ArrowDownToLine, ArrowUpFromLine, Factory,
  ClipboardCheck, AlertTriangle, BarChart3, PackageX, Trash2,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (API responses typed loosely — backend shapes inferred from sibling tabs)
// ─────────────────────────────────────────────────────────────────────────────
interface Item {
  id: string;
  name: string;
  unit: string | null;
  hsn_sac?: string | null;
  hsn?: string | null;
  gst_rate?: string | number | null;
  gstRate?: string | number | null;
  valuation_method?: string | null;
  valuationMethod?: string | null;
  opening_qty?: string | number | null;
  closing_qty?: string | number | null;
  current_qty?: string | number | null;
}

interface NearExpiryLot {
  id?: string;
  item_id?: string;
  item_name?: string;
  itemName?: string;
  batch_no?: string | null;
  batchNo?: string | null;
  qty?: string | number | null;
  expiry_date?: string | null;
  expiryDate?: string | null;
  warehouse_id?: string | null;
}

interface LowStockRow {
  id?: string;
  item_id?: string;
  item_name?: string;
  itemName?: string;
  name?: string;
  qty?: string | number | null;
  current_qty?: string | number | null;
  reorder_level?: string | number | null;
  reorderLevel?: string | number | null;
}

interface StockSummaryRow {
  item_id?: string;
  itemId?: string;
  item_name?: string;
  itemName?: string;
  name?: string;
  unit?: string | null;
  opening_qty?: string | number | null;
  openingQty?: string | number | null;
  opening_value?: string | number | null;
  openingValue?: string | number | null;
  inward_qty?: string | number | null;
  inwardQty?: string | number | null;
  inward_value?: string | number | null;
  inwardValue?: string | number | null;
  outward_qty?: string | number | null;
  outwardQty?: string | number | null;
  outward_value?: string | number | null;
  outwardValue?: string | number | null;
  closing_qty?: string | number | null;
  closingQty?: string | number | null;
  closing_value?: string | number | null;
  closingValue?: string | number | null;
}

type SubTab = "items" | "moves" | "manufacture" | "adjust" | "alerts" | "summary";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function qtyFmt(v: string | number | null | undefined): string {
  return num(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}
function rupee(v: string | number | null | undefined): string {
  return `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function itemName(i: Item): string {
  return i.name || "—";
}
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    if (Array.isArray(r.rows)) return r.rows as T[];
    if (Array.isArray(r.items)) return r.items as T[];
    if (Array.isArray(r.data)) return r.data as T[];
  }
  return [];
}

const GST_RATES = [0, 5, 12, 18, 28] as const;
const VALUATION_METHODS = [
  { id: "FIFO", label: "FIFO" },
  { id: "WEIGHTED_AVG", label: "Weighted average" },
  { id: "LIFO", label: "LIFO" },
] as const;

// shared styles (mirror BooksPage conventions)
const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]";

// ─────────────────────────────────────────────────────────────────────────────
// SMALL PIECES
// ─────────────────────────────────────────────────────────────────────────────
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

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 flex flex-col">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        <span className="text-[var(--color-primary)]">{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

function NoWrite({ what }: { what: string }) {
  return (
    <p className="text-sm text-[var(--color-muted)] text-center py-10 border border-dashed border-[var(--color-border)] rounded-lg">
      You need an owner / finance / accountant role to {what}.
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksInventoryTab({ canWrite = true }: { canWrite?: boolean }) {
  const [sub, setSub] = useState<SubTab>("items");
  const [items, setItems] = useState<Item[]>([]);
  const [itemsBusy, setItemsBusy] = useState(true);

  const loadItems = useCallback(async () => {
    setItemsBusy(true);
    try {
      const res = await api.get<unknown>("/api/books/inventory/items");
      setItems(asArray<Item>(res));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setItemsBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "items", label: "Items", icon: <Boxes size={14} /> },
    { id: "moves", label: "Receive / Issue", icon: <ArrowDownToLine size={14} /> },
    { id: "manufacture", label: "Manufacture", icon: <Factory size={14} /> },
    { id: "adjust", label: "Physical adjust", icon: <ClipboardCheck size={14} /> },
    { id: "alerts", label: "Alerts", icon: <AlertTriangle size={14} /> },
    { id: "summary", label: "Stock summary", icon: <BarChart3 size={14} /> },
  ];

  return (
    <div className="space-y-5">
      {/* SUB-TAB BAR */}
      <div className="flex gap-2 overflow-x-auto">
        {subTabs.map((t) => {
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSub(t.id)}
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

      {sub === "items" && (
        <ItemsSection items={items} busy={itemsBusy} canWrite={canWrite} onReload={loadItems} />
      )}
      {sub === "moves" && (
        <MovesSection items={items} canWrite={canWrite} onPosted={loadItems} />
      )}
      {sub === "manufacture" && (
        <ManufactureSection items={items} canWrite={canWrite} onPosted={loadItems} />
      )}
      {sub === "adjust" && (
        <AdjustSection items={items} canWrite={canWrite} onPosted={loadItems} />
      )}
      {sub === "alerts" && <AlertsSection />}
      {sub === "summary" && <SummarySection />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS SECTION — list + create
// ─────────────────────────────────────────────────────────────────────────────
function ItemsSection({
  items, busy, canWrite, onReload,
}: {
  items: Item[];
  busy: boolean;
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("Nos");
  const [hsn, setHsn] = useState("");
  const [gstRate, setGstRate] = useState<number>(18);
  const [valuationMethod, setValuationMethod] = useState<string>("FIFO");
  const [openingQty, setOpeningQty] = useState("");
  const [openingValue, setOpeningValue] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Enter an item name");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/books/inventory/items", {
        name: name.trim(),
        unit: unit.trim() || undefined,
        hsn: hsn.trim() || undefined,
        gstRate,
        valuationMethod,
        openingQty: Number(openingQty) || 0,
        openingValue: Number(openingValue) || 0,
      });
      toast.success(`Item "${name.trim()}" created`);
      setName("");
      setHsn("");
      setOpeningQty("");
      setOpeningValue("");
      setOpen(false);
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{items.length} items</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void onReload()} className={btnGhost} title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
          {canWrite && (
            <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>
              <Plus size={14} /> New item
            </button>
          )}
        </div>
      </div>

      {open && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New item</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Item name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Steel rod 12mm" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Nos / Kg / Ltr" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>HSN / SAC</label>
              <input value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="HSN" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>GST rate</label>
              <select value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} className={inputCls}>
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Valuation method</label>
              <select value={valuationMethod} onChange={(e) => setValuationMethod(e.target.value)} className={inputCls}>
                {VALUATION_METHODS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Opening qty</label>
                <input value={openingQty} onChange={(e) => setOpeningQty(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
              </div>
              <div>
                <label className={labelCls}>Opening value</label>
                <input value={openingValue} onChange={(e) => setOpeningValue(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Create item
            </button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Item</Th>
                <Th>Unit</Th>
                <Th>HSN</Th>
                <Th right>GST%</Th>
                <Th>Valuation</Th>
                <Th right>Closing qty</Th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={6} rows={6} />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">
                    No items yet — create one above.
                  </td>
                </tr>
              ) : (
                items.map((i) => (
                  <tr key={i.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{itemName(i)}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{i.unit || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-muted)]">{i.hsn_sac ?? i.hsn ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">
                      {(i.gst_rate ?? i.gstRate) != null ? `${num(i.gst_rate ?? i.gstRate)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">
                      {(i.valuation_method ?? i.valuationMethod ?? "—").toString().replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {(i.closing_qty ?? i.current_qty ?? i.opening_qty) != null
                        ? qtyFmt(i.closing_qty ?? i.current_qty ?? i.opening_qty)
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVES SECTION — receive + issue
// ─────────────────────────────────────────────────────────────────────────────
function MovesSection({
  items, canWrite, onPosted,
}: {
  items: Item[];
  canWrite: boolean;
  onPosted: () => Promise<void>;
}) {
  if (!canWrite) return <NoWrite what="record stock movements" />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ReceiveCard items={items} onPosted={onPosted} />
      <IssueCard items={items} onPosted={onPosted} />
    </div>
  );
}

function ItemSelect({
  items, value, onChange, label = "Item",
}: {
  items: Item[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Select item…</option>
        {items.map((i) => <option key={i.id} value={i.id}>{itemName(i)}</option>)}
      </select>
    </div>
  );
}

function ReceiveCard({ items, onPosted }: { items: Item[]; onPosted: () => Promise<void> }) {
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!itemId) { toast.error("Pick an item"); return; }
    if ((Number(qty) || 0) <= 0) { toast.error("Enter a quantity above zero"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/inventory/receive", {
        itemId,
        qty: Number(qty) || 0,
        rate: Number(rate) || 0,
        warehouseId: warehouseId.trim() || undefined,
        batchNo: batchNo.trim() || undefined,
        mfgDate: mfgDate || undefined,
        expiryDate: expiryDate || undefined,
      });
      toast.success("Stock received");
      setQty(""); setRate(""); setBatchNo(""); setMfgDate(""); setExpiryDate("");
      await onPosted();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Receive stock (inward)" icon={<ArrowDownToLine size={15} />}>
      <div className="space-y-3 flex-1">
        <ItemSelect items={items} value={itemId} onChange={setItemId} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Quantity</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Rate (per unit)</label>
            <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Warehouse (optional)</label>
            <input value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} placeholder="Warehouse id" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Batch no (optional)</label>
            <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="Batch" className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Mfg date (optional)</label>
            <input type="date" value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Expiry date (optional)</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>
      <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} mt-4 w-full`}>
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
        Receive
      </button>
    </Card>
  );
}

function IssueCard({ items, onPosted }: { items: Item[]; onPosted: () => Promise<void> }) {
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [fefo, setFefo] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!itemId) { toast.error("Pick an item"); return; }
    if ((Number(qty) || 0) <= 0) { toast.error("Enter a quantity above zero"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/inventory/issue", {
        itemId,
        qty: Number(qty) || 0,
        warehouseId: warehouseId.trim() || undefined,
        fefo,
      });
      toast.success("Stock issued");
      setQty("");
      await onPosted();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Issue stock (outward)" icon={<ArrowUpFromLine size={15} />}>
      <div className="space-y-3 flex-1">
        <ItemSelect items={items} value={itemId} onChange={setItemId} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Quantity</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Warehouse (optional)</label>
            <input value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} placeholder="Warehouse id" className={inputCls} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
          <input type="checkbox" checked={fefo} onChange={(e) => setFefo(e.target.checked)} className="accent-[var(--color-primary)] w-4 h-4" />
          FEFO (issue earliest-expiring lots first)
        </label>
        <p className="text-[11px] text-[var(--color-muted)]">
          Consumes stock from existing lots; valuation follows the item's method.
        </p>
      </div>
      <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} mt-4 w-full`}>
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowUpFromLine size={14} />}
        Issue
      </button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUFACTURE SECTION — stock entry (consumes → produces)
// ─────────────────────────────────────────────────────────────────────────────
interface MoveLine { key: string; itemId: string; qty: string; rate: string }
function newMoveLine(): MoveLine {
  return { key: Math.random().toString(36).slice(2), itemId: "", qty: "", rate: "" };
}

function ManufactureSection({
  items, canWrite, onPosted,
}: {
  items: Item[];
  canWrite: boolean;
  onPosted: () => Promise<void>;
}) {
  const [date, setDate] = useState(todayIso());
  const [consumes, setConsumes] = useState<MoveLine[]>([newMoveLine()]);
  const [produces, setProduces] = useState<MoveLine[]>([newMoveLine()]);
  const [saving, setSaving] = useState(false);

  if (!canWrite) return <NoWrite what="post manufacturing entries" />;

  const setLine = (
    side: "c" | "p",
    key: string,
    patch: Partial<MoveLine>,
  ) => {
    const upd = (ls: MoveLine[]) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l));
    if (side === "c") setConsumes(upd); else setProduces(upd);
  };
  const addLine = (side: "c" | "p") =>
    side === "c" ? setConsumes((ls) => [...ls, newMoveLine()]) : setProduces((ls) => [...ls, newMoveLine()]);
  const removeLine = (side: "c" | "p", key: string) => {
    const upd = (ls: MoveLine[]) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls);
    if (side === "c") setConsumes(upd); else setProduces(upd);
  };

  const submit = async () => {
    const c = consumes
      .filter((l) => l.itemId && (Number(l.qty) || 0) > 0)
      .map((l) => ({ itemId: l.itemId, qty: Number(l.qty) || 0 }));
    const p = produces
      .filter((l) => l.itemId && (Number(l.qty) || 0) > 0)
      .map((l) => ({
        itemId: l.itemId,
        qty: Number(l.qty) || 0,
        ...(l.rate.trim() ? { rate: Number(l.rate) || 0 } : {}),
      }));
    if (c.length === 0) { toast.error("Add at least one consumed item"); return; }
    if (p.length === 0) { toast.error("Add at least one produced item"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/inventory/stock-entry", { consumes: c, produces: p, date });
      toast.success("Stock entry posted");
      setConsumes([newMoveLine()]);
      setProduces([newMoveLine()]);
      await onPosted();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const LineGrid = ({ side, lines, withRate }: { side: "c" | "p"; lines: MoveLine[]; withRate: boolean }) => (
    <div className="space-y-2">
      {lines.map((l) => (
        <div key={l.key} className="flex items-end gap-2">
          <div className="flex-1">
            <select value={l.itemId} onChange={(e) => setLine(side, l.key, { itemId: e.target.value })} className={inputCls}>
              <option value="">Select item…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{itemName(i)}</option>)}
            </select>
          </div>
          <div className="w-24">
            <input value={l.qty} onChange={(e) => setLine(side, l.key, { qty: e.target.value })} inputMode="decimal" placeholder="Qty" className={`${inputCls} text-right tabular-nums`} />
          </div>
          {withRate && (
            <div className="w-28">
              <input value={l.rate} onChange={(e) => setLine(side, l.key, { rate: e.target.value })} inputMode="decimal" placeholder="Rate (opt)" className={`${inputCls} text-right tabular-nums`} />
            </div>
          )}
          <button type="button" onClick={() => removeLine(side, l.key)} disabled={lines.length <= 1} className="px-2 py-2.5 text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30" title="Remove">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => addLine(side)} className={btnGhost}>
        <Plus size={14} /> Add line
      </button>
    </div>
  );

  return (
    <Card title="Manufacture / stock entry" icon={<Factory size={15} />}>
      <div className="space-y-5">
        <div className="md:w-1/3">
          <label className={labelCls}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">Consumes (raw materials out)</h4>
          <LineGrid side="c" lines={consumes} withRate={false} />
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">Produces (finished goods in)</h4>
          <LineGrid side="p" lines={produces} withRate={true} />
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Factory size={14} />}
            Post stock entry
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADJUST SECTION — physical count adjustment
// ─────────────────────────────────────────────────────────────────────────────
function AdjustSection({
  items, canWrite, onPosted,
}: {
  items: Item[];
  canWrite: boolean;
  onPosted: () => Promise<void>;
}) {
  const [itemId, setItemId] = useState("");
  const [countedQty, setCountedQty] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  if (!canWrite) return <NoWrite what="adjust physical stock" />;

  const submit = async () => {
    if (!itemId) { toast.error("Pick an item"); return; }
    if (countedQty.trim() === "" || !Number.isFinite(Number(countedQty))) {
      toast.error("Enter the counted quantity");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/books/inventory/physical-adjust", {
        itemId,
        countedQty: Number(countedQty),
        warehouseId: warehouseId.trim() || undefined,
        date,
      });
      toast.success("Physical adjustment posted");
      setCountedQty("");
      await onPosted();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl">
      <Card title="Physical stock adjustment" icon={<ClipboardCheck size={15} />}>
        <div className="space-y-3">
          <ItemSelect items={items} value={itemId} onChange={setItemId} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Counted qty</label>
              <input value={countedQty} onChange={(e) => setCountedQty(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Warehouse (optional)</label>
            <input value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} placeholder="Warehouse id" className={inputCls} />
          </div>
          <p className="text-[11px] text-[var(--color-muted)]">
            Posts the difference between the system quantity and your physical count as a stock gain/loss.
          </p>
        </div>
        <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} mt-4 w-full`}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
          Post adjustment
        </button>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS SECTION — near-expiry + low-stock
// ─────────────────────────────────────────────────────────────────────────────
function AlertsSection() {
  const [days, setDays] = useState(30);
  const [expiry, setExpiry] = useState<NearExpiryLot[]>([]);
  const [low, setLow] = useState<LowStockRow[]>([]);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (d: number) => {
    setBusy(true);
    try {
      const [exp, ls] = await Promise.all([
        api.get<unknown>(`/api/books/inventory/near-expiry?days=${d}`),
        api.get<unknown>("/api/books/inventory/low-stock"),
      ]);
      setExpiry(asArray<NearExpiryLot>(exp));
      setLow(asArray<LowStockRow>(ls));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  return (
    <div className="space-y-5">
      {/* LOW STOCK */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <PackageX size={15} className="text-[var(--color-primary)]" /> Low stock
          </h3>
          <button type="button" onClick={() => void load(days)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Item</Th>
                <Th right>Current qty</Th>
                <Th right>Reorder level</Th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={3} rows={4} />
              ) : low.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-[var(--color-muted)]">No items below reorder level.</td></tr>
              ) : (
                low.map((r, i) => (
                  <tr key={r.id ?? r.item_id ?? i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{r.item_name ?? r.itemName ?? r.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-400">{qtyFmt(r.current_qty ?? r.qty)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{qtyFmt(r.reorder_level ?? r.reorderLevel)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEAR EXPIRY */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle size={15} className="text-[var(--color-primary)]" /> Near-expiry lots
          </h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-muted)]">Within</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm outline-none"
            >
              {[7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Item</Th>
                <Th>Batch</Th>
                <Th right>Qty</Th>
                <Th right>Expiry</Th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={4} rows={4} />
              ) : expiry.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-[var(--color-muted)]">No lots expiring within {days} days.</td></tr>
              ) : (
                expiry.map((r, i) => (
                  <tr key={r.id ?? i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{r.item_name ?? r.itemName ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-muted)]">{r.batch_no ?? r.batchNo ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{qtyFmt(r.qty)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-400 whitespace-nowrap">{r.expiry_date ?? r.expiryDate ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY SECTION — item-wise opening/inward/outward/closing
// ─────────────────────────────────────────────────────────────────────────────
function SummarySection() {
  const fyStart = (() => {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-04-01`;
  })();

  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<StockSummaryRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (f: string, t: string) => {
    setBusy(true);
    try {
      const res = await api.get<unknown>(`/api/books/reports/stock-summary?from=${f}&to=${t}`);
      setRows(asArray<StockSummaryRow>(res));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        openQty: a.openQty + num(r.opening_qty ?? r.openingQty),
        openVal: a.openVal + num(r.opening_value ?? r.openingValue),
        inQty: a.inQty + num(r.inward_qty ?? r.inwardQty),
        inVal: a.inVal + num(r.inward_value ?? r.inwardValue),
        outQty: a.outQty + num(r.outward_qty ?? r.outwardQty),
        outVal: a.outVal + num(r.outward_value ?? r.outwardValue),
        closeQty: a.closeQty + num(r.closing_qty ?? r.closingQty),
        closeVal: a.closeVal + num(r.closing_value ?? r.closingValue),
      }),
      { openQty: 0, openVal: 0, inQty: 0, inVal: 0, outQty: 0, outVal: 0, closeQty: 0, closeVal: 0 },
    );
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className={labelCls}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        <button type="button" onClick={() => void load(from, to)} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <BarChart3 size={14} />}
          Run report
        </button>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Item</Th>
                <Th right>Opening qty</Th>
                <Th right>Opening ₹</Th>
                <Th right>Inward qty</Th>
                <Th right>Inward ₹</Th>
                <Th right>Outward qty</Th>
                <Th right>Outward ₹</Th>
                <Th right>Closing qty</Th>
                <Th right>Closing ₹</Th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={9} rows={6} />
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-[var(--color-muted)]">No stock movement in this range.</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.item_id ?? r.itemId ?? i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{r.item_name ?? r.itemName ?? r.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{qtyFmt(r.opening_qty ?? r.openingQty)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{rupee(r.opening_value ?? r.openingValue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-green-400">{qtyFmt(r.inward_qty ?? r.inwardQty)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{rupee(r.inward_value ?? r.inwardValue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{qtyFmt(r.outward_qty ?? r.outwardQty)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{rupee(r.outward_value ?? r.outwardValue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{qtyFmt(r.closing_qty ?? r.closingQty)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[var(--color-primary)]">{rupee(r.closing_value ?? r.closingValue)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!busy && rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] font-semibold bg-[var(--color-bg)]/40">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{qtyFmt(totals.openQty)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(totals.openVal)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-green-400">{qtyFmt(totals.inQty)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(totals.inVal)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{qtyFmt(totals.outQty)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(totals.outVal)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{qtyFmt(totals.closeQty)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{rupee(totals.closeVal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
