import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Boxes, Plus, RefreshCw, ArrowDownToLine, ArrowUpFromLine, Factory,
  ClipboardCheck, AlertTriangle, BarChart3, PackageX, Trash2,
  Hash, Layers, Package, ScanLine, Search, Wrench,
  History, Ship, RotateCcw, LifeBuoy,
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

type SubTab =
  | "items" | "moves" | "manufacture" | "adjust" | "alerts" | "summary"
  | "serials" | "variants" | "kits" | "barcode" | "repost" | "landed";

interface RepostRun {
  id?: string;
  item_id?: string;
  itemId?: string;
  warehouse_id?: string | null;
  from_date?: string | null;
  fromDate?: string | null;
  status?: string | null;
  detail?: Record<string, unknown> | string | null;
  voucher_id?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
}

interface LandedCostRow {
  voucher_id?: string;
  voucherId?: string;
  voucher_number?: string | null;
  voucherNumber?: string | null;
  lcv_date?: string | null;
  lcvDate?: string | null;
  reference?: string | null;
  narration?: string | null;
  total_charge?: string | number | null;
  totalCharge?: string | number | null;
  charges?: unknown;
  created_at?: string | null;
}

interface SerialRow {
  id?: string;
  serial_no?: string | null;
  serialNo?: string | null;
  status?: string | null;
  rate?: string | number | null;
  received_date?: string | null;
  receivedDate?: string | null;
}
interface VariantRow {
  id?: string;
  name?: string | null;
  attributes?: Record<string, unknown> | string | null;
  closing_qty?: string | number | null;
  closingQty?: string | number | null;
}
interface KitComponentRow {
  id?: string;
  component_item_id?: string;
  componentItemId?: string;
  component_name?: string | null;
  componentName?: string | null;
  qty?: string | number | null;
}

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
    { id: "serials", label: "Serial numbers", icon: <Hash size={14} /> },
    { id: "variants", label: "Variants", icon: <Layers size={14} /> },
    { id: "kits", label: "Kits / BOM", icon: <Package size={14} /> },
    { id: "barcode", label: "Barcode", icon: <ScanLine size={14} /> },
    { id: "repost", label: "Reposting", icon: <History size={14} /> },
    { id: "landed", label: "Landed cost", icon: <Ship size={14} /> },
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
      {sub === "serials" && <SerialsSection items={items} canWrite={canWrite} />}
      {sub === "variants" && <VariantsSection items={items} canWrite={canWrite} />}
      {sub === "kits" && <KitsSection items={items} canWrite={canWrite} onPosted={loadItems} />}
      {sub === "barcode" && <BarcodeSection items={items} canWrite={canWrite} />}
      {sub === "repost" && <RepostSection items={items} canWrite={canWrite} onPosted={loadItems} />}
      {sub === "landed" && <LandedCostSection items={items} canWrite={canWrite} onPosted={loadItems} />}
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

// ─────────────────────────────────────────────────────────────────────────────
// SERIAL NUMBERS SECTION — receive serials, issue serials, list per item
// ─────────────────────────────────────────────────────────────────────────────
function SerialsSection({ items, canWrite }: { items: Item[]; canWrite: boolean }) {
  const [itemId, setItemId] = useState("");
  const [serials, setSerials] = useState<SerialRow[]>([]);
  const [busy, setBusy] = useState(false);

  // receive form
  const [recSerials, setRecSerials] = useState("");
  const [recRate, setRecRate] = useState("");
  const [recDate, setRecDate] = useState(todayIso());
  const [recSaving, setRecSaving] = useState(false);

  // issue form
  const [issSerials, setIssSerials] = useState("");
  const [issDate, setIssDate] = useState(todayIso());
  const [issSaving, setIssSaving] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) { setSerials([]); return; }
    setBusy(true);
    try {
      const res = await api.get<unknown>(`/api/books/inventory/items/${id}/serials`);
      setSerials(asArray<SerialRow>(res));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(itemId);
  }, [load, itemId]);

  const parseSerials = (raw: string): { serialNo: string }[] =>
    raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((serialNo) => ({ serialNo }));

  const receive = async () => {
    if (!itemId) { toast.error("Pick an item"); return; }
    const list = parseSerials(recSerials);
    if (list.length === 0) { toast.error("Enter at least one serial number"); return; }
    setRecSaving(true);
    try {
      await api.post("/api/books/inventory/receive-serials", {
        itemId,
        serials: list,
        rate: Number(recRate) || 0,
        date: recDate,
      });
      toast.success(`${list.length} serial${list.length === 1 ? "" : "s"} received`);
      setRecSerials(""); setRecRate("");
      await load(itemId);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRecSaving(false);
    }
  };

  const issue = async () => {
    if (!itemId) { toast.error("Pick an item"); return; }
    const list = parseSerials(issSerials);
    if (list.length === 0) { toast.error("Enter at least one serial number"); return; }
    setIssSaving(true);
    try {
      await api.post("/api/books/inventory/issue-serials", {
        itemId,
        serials: list,
        date: issDate,
      });
      toast.success(`${list.length} serial${list.length === 1 ? "" : "s"} issued`);
      setIssSerials("");
      await load(itemId);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setIssSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <ItemSelect items={items} value={itemId} onChange={setItemId} label="Item (serial-tracked)" />
      </div>

      {canWrite ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Receive serials (inward)" icon={<ArrowDownToLine size={15} />}>
            <div className="space-y-3 flex-1">
              <div>
                <label className={labelCls}>Serial numbers (one per line or comma-separated)</label>
                <textarea value={recSerials} onChange={(e) => setRecSerials(e.target.value)} rows={4} placeholder="SN-0001&#10;SN-0002" className={`${inputCls} font-mono`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Rate (per unit)</label>
                  <input value={recRate} onChange={(e) => setRecRate(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>
            <button type="button" onClick={receive} disabled={recSaving || !itemId} className={`${btnPrimary} mt-4 w-full`}>
              {recSaving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
              Receive serials
            </button>
          </Card>

          <Card title="Issue serials (outward)" icon={<ArrowUpFromLine size={15} />}>
            <div className="space-y-3 flex-1">
              <div>
                <label className={labelCls}>Serial numbers (one per line or comma-separated)</label>
                <textarea value={issSerials} onChange={(e) => setIssSerials(e.target.value)} rows={4} placeholder="SN-0001&#10;SN-0002" className={`${inputCls} font-mono`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={issDate} onChange={(e) => setIssDate(e.target.value)} className={inputCls} />
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-muted)]">Marks the listed serials as issued / sold.</p>
            </div>
            <button type="button" onClick={issue} disabled={issSaving || !itemId} className={`${btnPrimary} mt-4 w-full`}>
              {issSaving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowUpFromLine size={14} />}
              Issue serials
            </button>
          </Card>
        </div>
      ) : (
        <NoWrite what="receive or issue serials" />
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Hash size={15} className="text-[var(--color-primary)]" /> Serials
            {itemId ? <span className="text-[var(--color-muted)] tabular-nums font-normal">· {serials.length}</span> : null}
          </h3>
          <button type="button" onClick={() => void load(itemId)} disabled={!itemId} className="text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Serial no</Th>
                <Th>Status</Th>
                <Th right>Rate</Th>
                <Th right>Received</Th>
              </tr>
            </thead>
            <tbody>
              {!itemId ? (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-[var(--color-muted)]">Pick an item to view its serials.</td></tr>
              ) : busy ? (
                <SkeletonRows cols={4} rows={5} />
              ) : serials.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-[var(--color-muted)]">No serials for this item yet.</td></tr>
              ) : (
                serials.map((s, i) => (
                  <tr key={s.id ?? i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-mono text-xs">{s.serial_no ?? s.serialNo ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] capitalize">{(s.status ?? "—").toString().toLowerCase()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{s.rate != null ? rupee(s.rate) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)] whitespace-nowrap">{s.received_date ?? s.receivedDate ?? "—"}</td>
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
// VARIANTS SECTION — create + list variants under an item
// ─────────────────────────────────────────────────────────────────────────────
function VariantsSection({ items, canWrite }: { items: Item[]; canWrite: boolean }) {
  const [itemId, setItemId] = useState("");
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [attrs, setAttrs] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) { setVariants([]); return; }
    setBusy(true);
    try {
      const res = await api.get<unknown>(`/api/books/inventory/items/${id}/variants`);
      setVariants(asArray<VariantRow>(res));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(itemId);
  }, [load, itemId]);

  // Parse "Color: Red, Size: L" -> { Color: "Red", Size: "L" }; falls back to raw JSON.
  const parseAttrs = (raw: string): Record<string, string> | undefined => {
    const t = raw.trim();
    if (!t) return undefined;
    if (t.startsWith("{")) {
      try { return JSON.parse(t); } catch { /* fall through */ }
    }
    const out: Record<string, string> = {};
    for (const pair of t.split(",")) {
      const [k, ...rest] = pair.split(":");
      if (k && rest.length) out[k.trim()] = rest.join(":").trim();
    }
    return Object.keys(out).length ? out : undefined;
  };

  const submit = async () => {
    if (!itemId) { toast.error("Pick an item"); return; }
    if (!name.trim()) { toast.error("Enter a variant name"); return; }
    setSaving(true);
    try {
      await api.post(`/api/books/inventory/items/${itemId}/variants`, {
        name: name.trim(),
        attributes: parseAttrs(attrs) ?? {},
      });
      toast.success(`Variant "${name.trim()}" added`);
      setName(""); setAttrs("");
      await load(itemId);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const fmtAttrs = (a: VariantRow["attributes"]): string => {
    if (!a) return "—";
    if (typeof a === "string") return a;
    return Object.entries(a).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") || "—";
  };

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <ItemSelect items={items} value={itemId} onChange={setItemId} label="Parent item" />
      </div>

      {canWrite ? (
        <Card title="Add variant" icon={<Layers size={15} />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Variant name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Red / Large" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Attributes (key: value, comma-separated, or JSON)</label>
              <input value={attrs} onChange={(e) => setAttrs(e.target.value)} placeholder="Color: Red, Size: L" className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button type="button" onClick={submit} disabled={saving || !itemId} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Add variant
            </button>
          </div>
        </Card>
      ) : (
        <NoWrite what="add variants" />
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Layers size={15} className="text-[var(--color-primary)]" /> Variants
            {itemId ? <span className="text-[var(--color-muted)] tabular-nums font-normal">· {variants.length}</span> : null}
          </h3>
          <button type="button" onClick={() => void load(itemId)} disabled={!itemId} className="text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Variant</Th>
                <Th>Attributes</Th>
                <Th right>Closing qty</Th>
              </tr>
            </thead>
            <tbody>
              {!itemId ? (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-[var(--color-muted)]">Pick an item to view its variants.</td></tr>
              ) : busy ? (
                <SkeletonRows cols={3} rows={4} />
              ) : variants.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-[var(--color-muted)]">No variants for this item yet.</td></tr>
              ) : (
                variants.map((v, i) => (
                  <tr key={v.id ?? i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{v.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{fmtAttrs(v.attributes)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {(v.closing_qty ?? v.closingQty) != null ? qtyFmt(v.closing_qty ?? v.closingQty) : "—"}
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
// KITS SECTION — define a bill-of-materials + build the kit
// ─────────────────────────────────────────────────────────────────────────────
interface KitLine { key: string; componentItemId: string; qty: string }
function newKitLine(): KitLine {
  return { key: Math.random().toString(36).slice(2), componentItemId: "", qty: "" };
}

function KitsSection({
  items, canWrite, onPosted,
}: {
  items: Item[];
  canWrite: boolean;
  onPosted: () => Promise<void>;
}) {
  const [kitItemId, setKitItemId] = useState("");
  const [components, setComponents] = useState<KitComponentRow[]>([]);
  const [busy, setBusy] = useState(false);

  // define-kit form
  const [lines, setLines] = useState<KitLine[]>([newKitLine()]);
  const [savingKit, setSavingKit] = useState(false);

  // build-kit form
  const [buildQty, setBuildQty] = useState("");
  const [buildDate, setBuildDate] = useState(todayIso());
  const [building, setBuilding] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) { setComponents([]); return; }
    setBusy(true);
    try {
      // backend exposes the components on the item; tolerate either a kit list shape or 404
      const res = await api.get<unknown>(`/api/books/inventory/items/${id}/kit`);
      setComponents(asArray<KitComponentRow>(res));
    } catch {
      setComponents([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(kitItemId);
  }, [load, kitItemId]);

  const setLine = (key: string, patch: Partial<KitLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, newKitLine()]);
  const removeLine = (key: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  const saveKit = async () => {
    if (!kitItemId) { toast.error("Pick the kit item"); return; }
    const comps = lines
      .filter((l) => l.componentItemId && (Number(l.qty) || 0) > 0)
      .map((l) => ({ componentItemId: l.componentItemId, qty: Number(l.qty) || 0 }));
    if (comps.length === 0) { toast.error("Add at least one component"); return; }
    setSavingKit(true);
    try {
      await api.post(`/api/books/inventory/items/${kitItemId}/kit`, { components: comps });
      toast.success("Kit definition saved");
      setLines([newKitLine()]);
      await load(kitItemId);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSavingKit(false);
    }
  };

  const buildKit = async () => {
    if (!kitItemId) { toast.error("Pick the kit item"); return; }
    if ((Number(buildQty) || 0) <= 0) { toast.error("Enter a build quantity above zero"); return; }
    setBuilding(true);
    try {
      await api.post("/api/books/inventory/build-kit", {
        kitItemId,
        qty: Number(buildQty) || 0,
        date: buildDate,
      });
      toast.success("Kit built — components consumed, kit stock added");
      setBuildQty("");
      await Promise.all([load(kitItemId), onPosted()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBuilding(false);
    }
  };

  const compName = (c: KitComponentRow): string => {
    if (c.component_name ?? c.componentName) return (c.component_name ?? c.componentName) as string;
    const id = c.component_item_id ?? c.componentItemId;
    return items.find((i) => i.id === id)?.name ?? (id ? `#${id}` : "—");
  };

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <ItemSelect items={items} value={kitItemId} onChange={setKitItemId} label="Kit item (finished good)" />
      </div>

      {canWrite ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Define kit (bill of materials)" icon={<Wrench size={15} />}>
            <div className="space-y-2 flex-1">
              {lines.map((l) => (
                <div key={l.key} className="flex items-end gap-2">
                  <div className="flex-1">
                    <select value={l.componentItemId} onChange={(e) => setLine(l.key, { componentItemId: e.target.value })} className={inputCls}>
                      <option value="">Component item…</option>
                      {items.filter((i) => i.id !== kitItemId).map((i) => <option key={i.id} value={i.id}>{itemName(i)}</option>)}
                    </select>
                  </div>
                  <div className="w-24">
                    <input value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} inputMode="decimal" placeholder="Qty" className={`${inputCls} text-right tabular-nums`} />
                  </div>
                  <button type="button" onClick={() => removeLine(l.key)} disabled={lines.length <= 1} className="px-2 py-2.5 text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30" title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addLine} className={btnGhost}>
                <Plus size={14} /> Add component
              </button>
            </div>
            <button type="button" onClick={saveKit} disabled={savingKit || !kitItemId} className={`${btnPrimary} mt-4 w-full`}>
              {savingKit ? <RefreshCw size={14} className="animate-spin" /> : <Wrench size={14} />}
              Save kit definition
            </button>
          </Card>

          <Card title="Build kit" icon={<Package size={15} />}>
            <div className="space-y-3 flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Build quantity</label>
                  <input value={buildQty} onChange={(e) => setBuildQty(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={buildDate} onChange={(e) => setBuildDate(e.target.value)} className={inputCls} />
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-muted)]">
                Consumes each component (qty × build quantity) and adds the assembled kit to stock.
              </p>
            </div>
            <button type="button" onClick={buildKit} disabled={building || !kitItemId} className={`${btnPrimary} mt-4 w-full`}>
              {building ? <RefreshCw size={14} className="animate-spin" /> : <Package size={14} />}
              Build kit
            </button>
          </Card>
        </div>
      ) : (
        <NoWrite what="define or build kits" />
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Package size={15} className="text-[var(--color-primary)]" /> Components
            {kitItemId ? <span className="text-[var(--color-muted)] tabular-nums font-normal">· {components.length}</span> : null}
          </h3>
          <button type="button" onClick={() => void load(kitItemId)} disabled={!kitItemId} className="text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Component</Th>
                <Th right>Qty per kit</Th>
              </tr>
            </thead>
            <tbody>
              {!kitItemId ? (
                <tr><td colSpan={2} className="px-3 py-8 text-center text-[var(--color-muted)]">Pick a kit item to view its components.</td></tr>
              ) : busy ? (
                <SkeletonRows cols={2} rows={4} />
              ) : components.length === 0 ? (
                <tr><td colSpan={2} className="px-3 py-8 text-center text-[var(--color-muted)]">No kit defined for this item yet.</td></tr>
              ) : (
                components.map((c, i) => (
                  <tr key={c.id ?? i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{compName(c)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{qtyFmt(c.qty)}</td>
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
// BARCODE SECTION — assign a barcode to an item + lookup by code
// ─────────────────────────────────────────────────────────────────────────────
function BarcodeSection({ items, canWrite }: { items: Item[]; canWrite: boolean }) {
  // assign
  const [itemId, setItemId] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  // lookup
  const [lookupCode, setLookupCode] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [looking, setLooking] = useState(false);

  const assign = async () => {
    if (!itemId) { toast.error("Pick an item"); return; }
    if (!code.trim()) { toast.error("Enter a barcode"); return; }
    setSaving(true);
    try {
      await api.post(`/api/books/inventory/items/${itemId}/barcode`, { barcode: code.trim() });
      toast.success("Barcode assigned");
      setCode("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const lookup = async () => {
    const c = lookupCode.trim();
    if (!c) { toast.error("Enter a barcode to look up"); return; }
    setLooking(true);
    setResult(null);
    try {
      const res = await api.get<unknown>(`/api/books/inventory/barcode/${encodeURIComponent(c)}`);
      const obj = (res && typeof res === "object" && !Array.isArray(res)) ? (res as Record<string, unknown>) : null;
      if (!obj || Object.keys(obj).length === 0) {
        toast.error("No item found for that barcode");
      } else {
        setResult(obj);
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLooking(false);
    }
  };

  const resName = result
    ? String(result.name ?? result.item_name ?? result.itemName ?? "—")
    : "—";
  const resUnit = result ? (result.unit ?? null) : null;
  const resQty = result ? (result.closing_qty ?? result.current_qty ?? result.qty ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {canWrite ? (
          <Card title="Assign barcode" icon={<ScanLine size={15} />}>
            <div className="space-y-3 flex-1">
              <ItemSelect items={items} value={itemId} onChange={setItemId} />
              <div>
                <label className={labelCls}>Barcode</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan or type code" className={`${inputCls} font-mono`} />
              </div>
            </div>
            <button type="button" onClick={assign} disabled={saving || !itemId} className={`${btnPrimary} mt-4 w-full`}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <ScanLine size={14} />}
              Assign barcode
            </button>
          </Card>
        ) : (
          <div><NoWrite what="assign barcodes" /></div>
        )}

        <Card title="Lookup by barcode" icon={<Search size={15} />}>
          <div className="space-y-3 flex-1">
            <div>
              <label className={labelCls}>Barcode</label>
              <input
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void lookup(); }}
                placeholder="Scan or type code"
                className={`${inputCls} font-mono`}
              />
            </div>
            {result && (
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Item</span><span className="font-medium">{resName}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Unit</span><span>{resUnit ? String(resUnit) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Closing qty</span><span className="tabular-nums">{resQty != null ? qtyFmt(resQty as string | number) : "—"}</span></div>
              </div>
            )}
          </div>
          <button type="button" onClick={lookup} disabled={looking} className={`${btnPrimary} mt-4 w-full`}>
            {looking ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            Lookup
          </button>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPOSTING SECTION — re-run stock valuation from a date + recover failed runs
// ─────────────────────────────────────────────────────────────────────────────
function repostDetail(d: RepostRun["detail"]): Record<string, unknown> {
  if (!d) return {};
  if (typeof d === "string") { try { return JSON.parse(d); } catch { return {}; } }
  return d as Record<string, unknown>;
}

function RepostStatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === "POSTED"
      ? "bg-green-900/30 text-green-300 border-green-700/40"
      : s === "REWRITTEN"
      ? "bg-sky-900/30 text-sky-300 border-sky-700/40"
      : s === "FAILED"
      ? "bg-red-900/30 text-red-300 border-red-700/40"
      : "bg-amber-900/30 text-amber-300 border-amber-700/40";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{s}</span>;
}

function RepostSection({
  items, canWrite, onPosted,
}: {
  items: Item[];
  canWrite: boolean;
  onPosted: () => Promise<void>;
}) {
  // run form
  const [mode, setMode] = useState<"item" | "allOpen">("allOpen");
  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [fromDate, setFromDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [running, setRunning] = useState(false);
  const [recovering, setRecovering] = useState(false);

  // history
  const [runs, setRuns] = useState<RepostRun[]>([]);
  const [filterItemId, setFilterItemId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (fItem: string, fStatus: string) => {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (fItem) qs.set("itemId", fItem);
      if (fStatus) qs.set("status", fStatus);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const res = await api.get<unknown>(`/api/books/inventory/repost${suffix}`);
      setRuns(asArray<RepostRun>(res));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(filterItemId, filterStatus);
  }, [load, filterItemId, filterStatus]);

  const itemNameById = useCallback(
    (id: string | null | undefined): string => {
      if (!id) return "—";
      return items.find((i) => i.id === id)?.name ?? `#${id}`;
    },
    [items],
  );

  const run = async () => {
    if (mode === "item" && !itemId) { toast.error("Pick an item, or switch to all open"); return; }
    if (!fromDate) { toast.error("Pick a from-date"); return; }
    setRunning(true);
    try {
      const body: Record<string, unknown> = { fromDate, reason: reason.trim() || undefined };
      if (mode === "allOpen") {
        body.allOpen = true;
      } else {
        body.itemId = itemId;
        body.warehouseId = warehouseId.trim() || undefined;
      }
      const res = await api.post<any>("/api/books/inventory/repost", body);
      if (mode === "allOpen") {
        const n = res?.items ?? (Array.isArray(res?.reposted) ? res.reposted.length : 0);
        const errs = Array.isArray(res?.errors) ? res.errors.length : 0;
        toast.success(`Reposted ${n} item${n === 1 ? "" : "s"}${errs ? ` · ${errs} failed` : ""}`);
      } else {
        toast.success(`Reposted — ${res?.rowsRewritten ?? 0} rows, Δ ${rupee(res?.delta)}`);
      }
      await Promise.all([load(filterItemId, filterStatus), onPosted()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  const recover = async () => {
    setRecovering(true);
    try {
      const res = await api.post<any>("/api/books/inventory/repost/recover", {});
      const rec = res?.recovered ?? 0;
      const still = Array.isArray(res?.stillFailing) ? res.stillFailing.length : 0;
      toast.success(`Recovered ${rec} run${rec === 1 ? "" : "s"}${still ? ` · ${still} still failing` : ""}`);
      await Promise.all([load(filterItemId, filterStatus), onPosted()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)]">
        Reposting replays an item's stock ledger from a date so a back-dated receipt, a rate correction or a
        landed-cost charge re-prices every downstream issue and posts the net valuation correction to the GL.
        Use it after fixing historic movements, then check the history below for any failed runs to recover.
      </p>

      {canWrite ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Run a repost" icon={<History size={15} />}>
            <div className="space-y-3 flex-1">
              <div>
                <label className={labelCls}>Scope</label>
                <select value={mode} onChange={(e) => setMode(e.target.value as "item" | "allOpen")} className={inputCls}>
                  <option value="allOpen">All items with movements on/after the date</option>
                  <option value="item">A single item</option>
                </select>
              </div>
              {mode === "item" && (
                <>
                  <ItemSelect items={items} value={itemId} onChange={setItemId} />
                  <div>
                    <label className={labelCls}>Warehouse (optional)</label>
                    <input value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} placeholder="Warehouse id" className={inputCls} />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>From date</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Reason (optional)</label>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. back-dated receipt" className={inputCls} />
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-muted)]">
                Replays from the opening balance, so it is safe to re-run; a net valuation delta posts a
                Stock-in-hand / Stock Adjustment correction.
              </p>
            </div>
            <button type="button" onClick={run} disabled={running} className={`${btnPrimary} mt-4 w-full`}>
              {running ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Repost {mode === "allOpen" ? "all open" : "item"}
            </button>
          </Card>

          <Card title="Recover failed reposts" icon={<LifeBuoy size={15} />}>
            <div className="space-y-3 flex-1">
              <p className="text-sm text-[var(--color-muted)]">
                Re-runs every repost that previously failed (status FAILED in the history). Each retry replays
                from the opening balance, so transient failures self-heal — safe to run repeatedly.
              </p>
            </div>
            <button type="button" onClick={recover} disabled={recovering} className={`${btnPrimary} mt-4 w-full`}>
              {recovering ? <RefreshCw size={14} className="animate-spin" /> : <LifeBuoy size={14} />}
              Recover failed runs
            </button>
          </Card>
        </div>
      ) : (
        <NoWrite what="run or recover stock reposts" />
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <History size={15} className="text-[var(--color-primary)]" /> Repost history
            <span className="text-[var(--color-muted)] tabular-nums font-normal">· {runs.length}</span>
          </h3>
          <div className="flex items-center gap-2">
            <select value={filterItemId} onChange={(e) => setFilterItemId(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm outline-none">
              <option value="">All items</option>
              {items.map((i) => <option key={i.id} value={i.id}>{itemName(i)}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm outline-none">
              <option value="">Any status</option>
              <option value="POSTED">Posted</option>
              <option value="REWRITTEN">Rewritten</option>
              <option value="FAILED">Failed</option>
            </select>
            <button type="button" onClick={() => void load(filterItemId, filterStatus)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Item</Th>
                <Th>From date</Th>
                <Th>Status</Th>
                <Th right>Rows rewritten</Th>
                <Th right>Δ value</Th>
                <Th>Reason</Th>
                <Th right>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={7} rows={6} />
              ) : runs.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--color-muted)]">No repost runs yet.</td></tr>
              ) : (
                runs.map((r, i) => {
                  const d = repostDetail(r.detail);
                  const err = typeof d.error === "string" ? d.error : null;
                  return (
                    <tr key={r.id ?? i} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-3 py-2.5 font-medium">{itemNameById(r.item_id ?? r.itemId)}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{r.from_date ?? r.fromDate ?? "—"}</td>
                      <td className="px-3 py-2.5"><RepostStatusPill status={String(r.status ?? "—")} /></td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{d.rowsRewritten != null ? qtyFmt(d.rowsRewritten as number) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{d.delta != null ? rupee(d.delta as string | number) : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{err ? <span className="text-red-400">{err}</span> : (d.reason ? String(d.reason) : "—")}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-[var(--color-muted)] whitespace-nowrap">{(r.updated_at ?? r.updatedAt ?? "").toString().slice(0, 19).replace("T", " ") || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LANDED COST SECTION — capitalise freight/customs/insurance into stock value
// ─────────────────────────────────────────────────────────────────────────────
interface LcItemLine { key: string; itemId: string; qty: string; amount: string; weight: string }
interface LcChargeLine { key: string; ledgerName: string; amount: string; basis: string }
function newLcItem(): LcItemLine {
  return { key: Math.random().toString(36).slice(2), itemId: "", qty: "", amount: "", weight: "" };
}
function newLcCharge(): LcChargeLine {
  return { key: Math.random().toString(36).slice(2), ledgerName: "", amount: "", basis: "qty" };
}
const LC_BASES = [
  { id: "qty", label: "By quantity" },
  { id: "amount", label: "By amount / value" },
  { id: "weight", label: "By weight" },
] as const;

function LandedCostSection({
  items, canWrite, onPosted,
}: {
  items: Item[];
  canWrite: boolean;
  onPosted: () => Promise<void>;
}) {
  // form
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [lcItems, setLcItems] = useState<LcItemLine[]>([newLcItem()]);
  const [charges, setCharges] = useState<LcChargeLine[]>([newLcCharge()]);
  const [saving, setSaving] = useState(false);

  // history
  const fyStart = (() => {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-04-01`;
  })();
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<LandedCostRow[]>([]);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (f: string, t: string) => {
    setBusy(true);
    try {
      const res = await api.get<unknown>(`/api/books/inventory/landed-cost?from=${f}&to=${t}`);
      setRows(asArray<LandedCostRow>(res));
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

  const totalCharges = useMemo(
    () => charges.reduce((a, c) => a + (Number(c.amount) || 0), 0),
    [charges],
  );

  const setItemLine = (key: string, patch: Partial<LcItemLine>) =>
    setLcItems((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setChargeLine = (key: string, patch: Partial<LcChargeLine>) =>
    setCharges((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async () => {
    const its = lcItems
      .filter((l) => l.itemId && (Number(l.qty) || 0) > 0)
      .map((l) => ({
        itemId: l.itemId,
        qty: Number(l.qty) || 0,
        amount: Number(l.amount) || 0,
        ...(l.weight.trim() ? { weight: Number(l.weight) || 0 } : {}),
      }));
    const chs = charges
      .filter((c) => c.ledgerName.trim() && (Number(c.amount) || 0) > 0)
      .map((c) => ({ ledgerName: c.ledgerName.trim(), amount: Number(c.amount) || 0, basis: c.basis }));
    if (its.length === 0) { toast.error("Add at least one received item"); return; }
    if (chs.length === 0) { toast.error("Add at least one charge above zero"); return; }
    setSaving(true);
    try {
      const res = await api.post<any>("/api/books/inventory/landed-cost", {
        date,
        reference: reference.trim() || undefined,
        narration: narration.trim() || undefined,
        items: its,
        charges: chs,
      });
      toast.success(`Landed cost posted — ${rupee(res?.totalCharge)} capitalised across ${its.length} item${its.length === 1 ? "" : "s"}`);
      setReference(""); setNarration("");
      setLcItems([newLcItem()]);
      setCharges([newLcCharge()]);
      await Promise.all([load(from, to), onPosted()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)]">
        A landed-cost voucher capitalises freight, customs duty and insurance into the value of received stock,
        so item cost (and downstream COGS) reflects the true landed price. Charge ledgers must already exist
        (e.g. Freight Payable, Customs Duty Payable) — the entry posts Dr Stock-in-hand / Cr each charge ledger
        and reposts the affected items.
      </p>

      {canWrite ? (
        <Card title="New landed-cost voucher" icon={<Ship size={15} />}>
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Reference (optional)</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. BOE / freight bill no" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Narration (optional)</label>
                <input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Notes" className={inputCls} />
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">Received items (cost basis)</h4>
              <div className="space-y-2">
                {lcItems.map((l) => (
                  <div key={l.key} className="flex items-end gap-2">
                    <div className="flex-1">
                      <select value={l.itemId} onChange={(e) => setItemLine(l.key, { itemId: e.target.value })} className={inputCls}>
                        <option value="">Select item…</option>
                        {items.map((i) => <option key={i.id} value={i.id}>{itemName(i)}</option>)}
                      </select>
                    </div>
                    <div className="w-24">
                      <input value={l.qty} onChange={(e) => setItemLine(l.key, { qty: e.target.value })} inputMode="decimal" placeholder="Qty" className={`${inputCls} text-right tabular-nums`} />
                    </div>
                    <div className="w-28">
                      <input value={l.amount} onChange={(e) => setItemLine(l.key, { amount: e.target.value })} inputMode="decimal" placeholder="Item value" className={`${inputCls} text-right tabular-nums`} />
                    </div>
                    <div className="w-24">
                      <input value={l.weight} onChange={(e) => setItemLine(l.key, { weight: e.target.value })} inputMode="decimal" placeholder="Weight" className={`${inputCls} text-right tabular-nums`} />
                    </div>
                    <button type="button" onClick={() => setLcItems((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lcItems.length <= 1} className="px-2 py-2.5 text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setLcItems((ls) => [...ls, newLcItem()])} className={btnGhost}>
                  <Plus size={14} /> Add item
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">Charges (freight / customs / insurance)</h4>
              <div className="space-y-2">
                {charges.map((c) => (
                  <div key={c.key} className="flex items-end gap-2">
                    <div className="flex-1">
                      <input value={c.ledgerName} onChange={(e) => setChargeLine(c.key, { ledgerName: e.target.value })} placeholder="Charge ledger (e.g. Freight Payable)" className={inputCls} />
                    </div>
                    <div className="w-28">
                      <input value={c.amount} onChange={(e) => setChargeLine(c.key, { amount: e.target.value })} inputMode="decimal" placeholder="Amount" className={`${inputCls} text-right tabular-nums`} />
                    </div>
                    <div className="w-40">
                      <select value={c.basis} onChange={(e) => setChargeLine(c.key, { basis: e.target.value })} className={inputCls}>
                        {LC_BASES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={() => setCharges((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== c.key) : ls))} disabled={charges.length <= 1} className="px-2 py-2.5 text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setCharges((ls) => [...ls, newLcCharge()])} className={btnGhost}>
                  <Plus size={14} /> Add charge
                </button>
              </div>
            </div>

            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm flex justify-between">
              <span className="text-[var(--color-muted)]">Total charges to capitalise</span>
              <span className="tabular-nums font-semibold text-[var(--color-primary)]">{rupee(totalCharges)}</span>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Ship size={14} />}
                Post landed cost
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <NoWrite what="post landed-cost vouchers" />
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Ship size={15} className="text-[var(--color-primary)]" /> Landed-cost vouchers
            <span className="text-[var(--color-muted)] tabular-nums font-normal">· {rows.length}</span>
          </h3>
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm outline-none" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm outline-none" />
            <button type="button" onClick={() => void load(from, to)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[680px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Date</Th>
                <Th>Voucher</Th>
                <Th>Reference</Th>
                <Th>Narration</Th>
                <Th right>Total charge</Th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={5} rows={5} />
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted)]">No landed-cost vouchers in this range.</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.voucher_id ?? r.voucherId ?? i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{r.lcv_date ?? r.lcvDate ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{r.voucher_number ?? r.voucherNumber ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{r.reference || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.narration || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[var(--color-primary)]">{rupee(r.total_charge ?? r.totalCharge)}</td>
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
