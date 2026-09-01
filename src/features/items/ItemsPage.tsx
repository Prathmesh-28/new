import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Package, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { SelectField, TextField } from "@/components/ui/Field";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import EmptyState from "@/components/EmptyState";

/**
 * /items — the item master, reachable at last.
 *
 * A real inventory engine (stock items, warehouses, FIFO/weighted-average valuation,
 * batch/serial, price lists) has existed inside the Books module for months — but the
 * only way to it was a sub-tab of a sub-tab on the Books page, so most firms typed item
 * names free-hand on every invoice instead. This is its front door: what you sell, what
 * it costs, what's running low.
 */
type Item = {
  id: string; name: string; unit: string; hsn_sac: string | null; gst_rate: string | null;
  valuation_method: string; reorder_level: string; current_qty: string; current_value: string; is_active: boolean;
};

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.get<Item[]>("/api/books/inventory/items")
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your items"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const low = items.filter((i) => Number(i.reorder_level) > 0 && Number(i.current_qty) <= Number(i.reorder_level));

  const COLUMNS: Column<Item>[] = [
    { key: "name", header: "Item", locked: true,
      render: (i) => (
        <>
          <p className="font-medium">{i.name}<span className="text-[var(--color-muted)] text-xs"> / {i.unit}</span></p>
          {i.hsn_sac && <p className="text-[10px] font-mono text-[var(--color-muted)]">HSN {i.hsn_sac}</p>}
        </>
      ) },
    { key: "current_qty", header: "In stock", align: "right", total: "sum",
      value: (i) => Number(i.current_qty),
      render: (i) => {
        const isLow = Number(i.reorder_level) > 0 && Number(i.current_qty) <= Number(i.reorder_level);
        return (
          <span className={`tabular-nums ${isLow ? "text-amber-400 font-semibold" : ""}`}>
            {Number(i.current_qty).toLocaleString("en-IN")}
            {isLow && <AlertTriangle size={11} className="inline ml-1 mb-0.5" aria-label="At or below reorder level" />}
          </span>
        );
      } },
    { key: "current_value", header: "Stock value", align: "right", total: "sum",
      value: (i) => Number(i.current_value),
      render: (i) => formatCurrency(Number(i.current_value)) },
    { key: "gst_rate", header: "GST", align: "right", hideOnMobile: true,
      render: (i) => i.gst_rate != null ? `${Number(i.gst_rate)}%` : <span className="text-[var(--color-muted)]">—</span> },
    { key: "valuation_method", header: "Valuation", defaultHidden: true, hideOnMobile: true,
      render: (i) => <span className="text-xs text-[var(--color-muted)]">{i.valuation_method === "FIFO" ? "FIFO" : "Weighted avg"}</span> },
    { key: "reorder_level", header: "Reorder at", align: "right", defaultHidden: true,
      value: (i) => Number(i.reorder_level),
      render: (i) => Number(i.reorder_level) > 0 ? Number(i.reorder_level).toLocaleString("en-IN") : <span className="text-[var(--color-muted)]">not set</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Items</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            What you sell and stock. Receipts, issues, batches and warehouses live in{" "}
            <Link to="/books?tab=inventory" className="text-[var(--color-primary)] hover:underline">Books → Inventory</Link>.
          </p>
        </div>
        <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setShowNew(true)}>New item</Button>
      </div>

      {low.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-300">
          {low.length} item{low.length === 1 ? " is" : "s are"} at or below reorder level: {low.slice(0, 5).map((i) => i.name).join(", ")}{low.length > 5 ? "…" : ""}
        </div>
      )}

      <DataTable<Item>
        listKey="items"
        exportName="items"
        columns={COLUMNS}
        rows={items}
        rowKey={(i) => i.id}
        loading={loading}
        error={error}
        onRetry={load}
        defaultSort={{ key: "name", order: "asc" }}
        searchPlaceholder="Find an item by name or HSN…"
        empty={
          <EmptyState icon={Package} title="No items yet"
            description="Add the things you sell so invoices can pick them instead of everyone re-typing names, rates and HSN codes."
            ctaText="Add an item" onCta={() => setShowNew(true)} />
        }
      />

      {showNew && <NewItemModal onClose={() => setShowNew(false)} onSaved={load} onDone={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewItemModal({ onClose, onSaved, onDone }: { onClose: () => void; onSaved: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", unit: "pcs", hsn: "", gstRate: "18", openingQty: "", openingValue: "", reorderLevel: "", valuationMethod: "WEIGHTED_AVG" });
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false); // "save and add another" — nobody creates just one item
  const dirty = !!(f.name || f.hsn || f.openingQty);
  const { guard } = useUnsavedChanges(dirty && !busy);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (addAnother: boolean) => {
    if (!f.name.trim()) { toast.error("Give the item a name"); return; }
    setBusy(true); setAgain(addAnother);
    try {
      await api.post("/api/books/inventory/items", {
        name: f.name.trim(), unit: f.unit || "pcs", hsn: f.hsn || undefined,
        gstRate: f.gstRate ? Number(f.gstRate) : undefined,
        openingQty: Number(f.openingQty) || 0, openingValue: Number(f.openingValue) || 0,
        reorderLevel: Number(f.reorderLevel) || 0, valuationMethod: f.valuationMethod,
      });
      toast.success(`${f.name.trim()} added`);
      if (addAnother) {
        // Keep the modal open with the sticky fields (unit, GST, valuation) intact —
        // nobody sets up exactly one item.
        setF((x) => ({ ...x, name: "", hsn: "", openingQty: "", openingValue: "" }));
        onSaved();
      } else {
        onDone();
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add that item"); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => void guard(onClose)} title="New item" size="md"
      description="Only a name and unit are required. Opening stock posts to the stock ledger."
      onBeforeClose={async () => !dirty || window.confirm("Discard this item?")}
      footer={<>
        <Button variant="ghost" onClick={() => void guard(onClose)}>Cancel</Button>
        <Button variant="secondary" loading={busy && again} onClick={() => save(true)}>Save & add another</Button>
        <Button variant="primary" loading={busy && !again} onClick={() => save(false)}>Save</Button>
      </>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <TextField label="Name" required value={f.name} onChange={set("name")} autoFocus placeholder="e.g. Steel bracket 40mm" />
        <TextField label="Unit" required value={f.unit} onChange={set("unit")} placeholder="pcs / kg / box" help="How you count it." />
        <TextField label="HSN / SAC" value={f.hsn} onChange={set("hsn")} help="Copied onto invoice lines that use this item." />
        <SelectField label="GST rate" value={f.gstRate} onChange={set("gstRate")}>
          {["0", "0.25", "3", "5", "12", "18", "28"].map((r) => <option key={r} value={r}>{r}%</option>)}
        </SelectField>
        <TextField label="Opening quantity" type="number" value={f.openingQty} onChange={set("openingQty")} />
        <TextField label="Opening value (total)" type="number" value={f.openingValue} onChange={set("openingValue")} help="What that opening stock cost, in rupees." />
        <TextField label="Reorder level" type="number" value={f.reorderLevel} onChange={set("reorderLevel")} help="Warns on the Items page when stock falls to this." />
        <SelectField label="Valuation" value={f.valuationMethod} onChange={set("valuationMethod")}>
          <option value="WEIGHTED_AVG">Weighted average</option>
          <option value="FIFO">FIFO</option>
        </SelectField>
      </div>
    </Modal>
  );
}
