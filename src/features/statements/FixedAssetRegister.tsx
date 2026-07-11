import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import {
  bookValue, accumulatedDepreciation, wdvAnnualRate,
  totalGrossCost, totalNetBookValue, totalAccumulatedDepreciation,
} from "@/lib/depreciation";
import { Building2, Info, ArrowUpRight } from "lucide-react";

export default function FixedAssetRegister() {
  const { store } = useApp();
  const navigate = useNavigate();
  const assets = store.fixedAssets ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const grossCost = totalGrossCost(assets, today);
  const accum = totalAccumulatedDepreciation(assets, today);
  const nbv = totalNetBookValue(assets, today);

  return (
    <div className="space-y-4">
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
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Live mirror of Books &rarr; Fixed Assets - the same register that drives the depreciation posted to your ledger.
              </p>
            </div>
          </div>
          <button onClick={() => navigate("/books")}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
            Manage in Books <ArrowUpRight size={13} />
          </button>
        </div>

        {assets.length === 0 ? (
          <div className="text-center py-10">
            <Building2 size={28} className="mx-auto text-[var(--color-muted)] mb-3" />
            <p className="text-sm font-medium">No fixed assets registered</p>
            <p className="text-xs text-[var(--color-muted)] mt-1 max-w-sm mx-auto">
              Register machinery, equipment, vehicles or computers in Books &rarr; Fixed Assets to see them - and real depreciation - here.
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
                </tr>
              </thead>
              <tbody>
                {assets.map(a => {
                  const disposed = a.disposalDate && a.disposalDate < today;
                  return (
                    <tr key={a.id} className="border-b border-[var(--color-border)]/60 hover:bg-white/2">
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-[var(--color-text)]">{a.name}{disposed && <span className="ml-2 text-[10px] text-[var(--color-muted)]">(disposed)</span>}</div>
                        {a.category && <div className="text-[11px] text-[var(--color-muted)]">{a.category}</div>}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{formatCurrency(a.cost)}</td>
                      <td className="py-2.5 px-2 text-[var(--color-muted)]">{a.purchaseDate}</td>
                      <td className="py-2.5 px-2 text-[var(--color-muted)]">
                        {a.method === "wdv" ? `WDV ${Math.round(wdvAnnualRate(a) * 100)}%` : `SLM ${a.usefulLifeYears}y`}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(accumulatedDepreciation(a, today)))}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-medium">{formatCurrency(Math.round(bookValue(a, today)))}</td>
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
            This register is read-only here - add, edit, dispose or run depreciation from Books &rarr; Fixed Assets, and it
            appears everywhere in Statements automatically. WDV (reducing-balance) follows Companies Act Schedule II;
            straight-line spreads cost evenly over the life. Net book value above is estimated from each asset's cost,
            rate and purchase date for any date you view the statements at - open Books &rarr; Fixed Assets for the exact
            posted depreciation and ledger balances.
          </p>
        </div>
      </div>
    </div>
  );
}
