import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import { Sparkles, TrendingUp, Crown, CalendarHeart, Receipt, Users } from "lucide-react";

// Business Wrapped (#199) — a ledger-computed "year in review". Fun, shareable (screenshot it).
interface Wrapped {
  fy: string; revenue: number; net_profit: number; prior_revenue: number; growth_pct: number | null;
  invoices_raised: number; best_month: { month: string; revenue: number }; top_customer: { name: string; revenue: number } | null;
  biggest_invoice: { party: string; amount: number } | null; unique_customers: number; gst_collected: number;
  collection_on_time_pct: number | null; monthly_revenue: Array<{ month: string; revenue: number }>; note: string;
}
const INR = (v: number) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function WrappedPage() {
  const [sp] = useSearchParams();
  const [w, setW] = useState<Wrapped | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fyQ = sp.get("fy");
  useEffect(() => { setError(null); api.get<Wrapped>(`/api/books/wrapped${fyQ ? `?fy=${fyQ}` : ""}`).then(setW).catch((e) => setError(e.message)); }, [fyQ]);

  if (error) return <ErrorState message={error} />;
  if (!w) return <LoadingState rows={6} />;
  const maxM = Math.max(1, ...w.monthly_revenue.map((m) => m.revenue));
  const Tile = ({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: boolean }) => (
    <div className={`rounded-2xl p-5 border ${accent ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/40" : "bg-[var(--color-surface)] border-[var(--color-border)]"}`}>
      <Icon size={18} className="text-[var(--color-primary)]" />
      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mt-2">{label}</p>
      <p className={`text-2xl font-extrabold mt-0.5 ${accent ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--color-muted)] mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center py-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-1 rounded-full"><Sparkles size={13} /> FY {w.fy} Wrapped</p>
        <h1 className="text-3xl font-extrabold text-[var(--color-text)] mt-3">Your year in business</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">{w.note}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile icon={TrendingUp} label="Revenue" value={INR(w.revenue)} sub={w.growth_pct != null ? `${w.growth_pct >= 0 ? "▲" : "▼"} ${Math.abs(w.growth_pct)}% vs last year` : undefined} accent />
        <Tile icon={Sparkles} label="Net profit" value={INR(w.net_profit)} />
        <Tile icon={CalendarHeart} label="Best month" value={w.best_month.month} sub={INR(w.best_month.revenue)} />
        <Tile icon={Receipt} label="Invoices raised" value={String(w.invoices_raised)} sub={`${w.unique_customers} customers`} />
        {w.top_customer && <Tile icon={Crown} label="Top customer" value={w.top_customer.name} sub={INR(w.top_customer.revenue)} />}
        <Tile icon={Users} label="GST collected" value={INR(w.gst_collected)} sub={w.collection_on_time_pct != null ? `${w.collection_on_time_pct}% paid on time` : undefined} />
      </div>

      {/* Monthly revenue bars */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
        <p className="text-sm font-semibold mb-3">Revenue by month</p>
        <div className="flex items-end gap-1.5 h-32">
          {w.monthly_revenue.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t bg-[var(--color-primary)]/70" style={{ height: `${Math.max(2, (m.revenue / maxM) * 100)}%` }} title={INR(m.revenue)} />
              <span className="text-[9px] text-[var(--color-muted)]">{m.month}</span>
            </div>
          ))}
        </div>
      </div>

      {w.biggest_invoice && <p className="text-center text-sm text-[var(--color-muted)]">Your biggest single sale: <b className="text-[var(--color-text)]">{INR(w.biggest_invoice.amount)}</b> to {w.biggest_invoice.party} 🎉</p>}
      <p className="text-center text-[11px] text-[var(--color-muted)]">Computed from your own books · screenshot &amp; share</p>
    </div>
  );
}
