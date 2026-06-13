import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import {
  bookValue, accumulatedDepreciation, wdvAnnualRate,
  totalGrossCost, totalNetBookValue, totalAccumulatedDepreciation,
} from "@/lib/depreciation";
import type { FixedAsset } from "@/data/types";
import { Plus, Trash2, Pencil, Building2, X, Info } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["Plant & Machinery", "Computers & IT", "Furniture & Fixtures", "Vehicles", "Office Equipment", "Buildings", "Intangibles"];

function blankAsset(): FixedAsset {
  return { id: "", name: "", category: "Plant & Machinery", cost: 0, purchaseDate: new Date().toISOString().slice(0, 10), usefulLifeYears: 5, method: "wdv", salvageValue: 0 };
}

export default function FixedAssetRegister() {
  const { store, addFixedAsset, updateFixedAsset, deleteFixedAsset, canEdit } = useApp();
  const assets = store.fixedAssets ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const editable = canEdit();
  const [draft, setDraft] = useState<FixedAsset | null>(null);

  const set = <K extends keyof FixedAsset>(k: K, v: FixedAsset[K]) => setDraft(d => d ? { ...d, [k]: v } : d);

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) { toast.error("Asset name is required"); return; }
    if (!draft.cost || draft.cost <= 0) { toast.error("Cost must be greater than 0"); return; }
    if (draft.id) { updateFixedAsset(draft); toast.success("Asset updated"); }
    else { addFixedAsset({ ...draft, id: crypto.randomUUID() }); toast.success("Asset added to register"); }
    setDraft(null);
  };

  const grossCost = totalGrossCost(assets, today);
  const accum = totalAccumulatedDepreciation(assets, today);
  const nbv = totalNetBookValue(assets, today);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Gross block (cost)", value: grossCost },
          { label: "Accumulated depreciation", value: accum },
          { label: "Net book value", value: nbv },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(s.value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-[var(--color-primary)]" />
            <div>
              <p className="text-sm font-semibold">Fixed-Asset Register</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Drives real depreciation in your P&amp;L and net fixed assets on the balance sheet.</p>
            </div>
          </div>
          {editable && !draft && (
            <button onClick={() => setDraft(blankAsset())}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
              <Plus size={13} /> Add asset
            </button>
          )}
        </div>

        {/* Add / edit form */}
        {draft && (
          <div className="mb-5 p-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{draft.id ? "Edit asset" : "New asset"}</h3>
              <button onClick={() => setDraft(null)}><X size={15} className="text-[var(--color-muted)]" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs text-[var(--color-muted)]">Asset name
                <input value={draft.name} onChange={e => set("name", e.target.value)} placeholder="e.g. CNC milling machine"
                  className="mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]" />
              </label>
              <label className="text-xs text-[var(--color-muted)]">Category
                <select value={draft.category} onChange={e => set("category", e.target.value)}
                  className="mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="text-xs text-[var(--color-muted)]">Cost (₹)
                <input type="number" value={draft.cost || ""} onChange={e => set("cost", Number(e.target.value))}
                  className="mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]" />
              </label>
              <label className="text-xs text-[var(--color-muted)]">Purchase date
                <input type="date" value={draft.purchaseDate} onChange={e => set("purchaseDate", e.target.value)}
                  className="mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none" />
              </label>
              <label className="text-xs text-[var(--color-muted)]">Depreciation method
                <select value={draft.method} onChange={e => set("method", e.target.value as FixedAsset["method"])}
                  className="mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none">
                  <option value="wdv">Written-down value (WDV)</option>
                  <option value="straight_line">Straight-line (SLM)</option>
                </select>
              </label>
              <label className="text-xs text-[var(--color-muted)]">Useful life (years)
                <input type="number" value={draft.usefulLifeYears || ""} onChange={e => set("usefulLifeYears", Number(e.target.value))}
                  className="mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none" />
              </label>
              <label className="text-xs text-[var(--color-muted)]">Salvage value (₹, optional)
                <input type="number" value={draft.salvageValue || ""} onChange={e => set("salvageValue", Number(e.target.value))}
                  className="mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none" />
              </label>
              <label className="text-xs text-[var(--color-muted)]">Disposal date (if sold/scrapped)
                <input type="date" value={draft.disposalDate || ""} onChange={e => set("disposalDate", e.target.value || undefined)}
                  className="mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none" />
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={save} className="bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90">
                {draft.id ? "Save changes" : "Add asset"}
              </button>
              <button onClick={() => setDraft(null)} className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-[var(--color-accent)]">Cancel</button>
            </div>
          </div>
        )}

        {/* Register table */}
        {assets.length === 0 ? (
          <div className="text-center py-10">
            <Building2 size={28} className="mx-auto text-[var(--color-muted)] mb-3" />
            <p className="text-sm font-medium">No fixed assets yet</p>
            <p className="text-xs text-[var(--color-muted)] mt-1 max-w-sm mx-auto">
              Add machinery, equipment, vehicles or computers to track real depreciation in your statements.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] border-b border-[var(--color-border)]">
                  <th className="text-left font-medium py-2 px-2">Asset</th>
                  <th className="text-right font-medium py-2 px-2">Cost</th>
                  <th className="text-left font-medium py-2 px-2">Purchased</th>
                  <th className="text-left font-medium py-2 px-2">Method</th>
                  <th className="text-right font-medium py-2 px-2">Accum. dep.</th>
                  <th className="text-right font-medium py-2 px-2">Net book value</th>
                  {editable && <th className="py-2 px-2"></th>}
                </tr>
              </thead>
              <tbody>
                {assets.map(a => {
                  const disposed = a.disposalDate && a.disposalDate < today;
                  return (
                    <tr key={a.id} className="border-b border-[var(--color-border)]/60 hover:bg-white/2">
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-[var(--color-text)]">{a.name}{disposed && <span className="ml-2 text-[10px] text-[var(--color-muted)]">(disposed)</span>}</div>
                        <div className="text-[11px] text-[var(--color-muted)]">{a.category}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{formatCurrency(a.cost)}</td>
                      <td className="py-2.5 px-2 text-[var(--color-muted)]">{a.purchaseDate}</td>
                      <td className="py-2.5 px-2 text-[var(--color-muted)]">
                        {a.method === "wdv" ? `WDV ${Math.round(wdvAnnualRate(a) * 100)}%` : `SLM ${a.usefulLifeYears}y`}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(accumulatedDepreciation(a, today)))}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-medium">{formatCurrency(Math.round(bookValue(a, today)))}</td>
                      {editable && (
                        <td className="py-2.5 px-2">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setDraft(a)} title="Edit" className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)] rounded"><Pencil size={13} /></button>
                            <button onClick={() => { deleteFixedAsset(a.id); toast.success("Asset removed"); }} title="Delete" className="p-1 text-[var(--color-muted)] hover:text-red-400 rounded"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg p-3 flex gap-2">
          <Info size={13} className="text-[var(--color-muted)] shrink-0 mt-px" />
          <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
            WDV (reducing-balance) follows Companies Act Schedule II; rate is derived from useful life and residual value.
            Straight-line spreads cost evenly over the life. Depreciation flows automatically into the P&amp;L for each period and reduces net fixed assets on the balance sheet.
          </p>
        </div>
      </div>
    </div>
  );
}
