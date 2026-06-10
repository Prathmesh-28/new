import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Package, Zap, TrendingDown, Check } from "lucide-react";
import { toast } from "sonner";

interface SupplierOffer {
  id: string;
  supplier_name: string;
  invoice_amount: number;
  early_pay_discount: number;
  days_early: number;
  saving: number;
  due_date: string;
}

export default function SuppliersPage() {
  const [offers, setOffers]   = useState<SupplierOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState<Record<string, boolean>>({});
  const [paid, setPaid]       = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get<SupplierOffer[]>("/api/suppliers/marketplace")
      .then(setOffers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const payEarly = async (offer: SupplierOffer) => {
    setPaying(p => ({ ...p, [offer.id]: true }));
    try {
      await api.post("/api/suppliers/pay-early", { offer_id: offer.id });
      setPaid(s => new Set([...s, offer.id]));
      toast.success(`Early payment initiated to ${offer.supplier_name}. You saved ${formatCurrency(offer.saving)}.`);
    } catch {
      toast.error("Payment failed");
    } finally {
      setPaying(p => ({ ...p, [offer.id]: false }));
    }
  };

  const totalSavings = offers.filter(o => !paid.has(o.id)).reduce((s, o) => s + o.saving, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Supplier Early-Pay</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Pay early, save on invoice cost · Suppliers get paid today</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open Offers",       value: offers.filter(o => !paid.has(o.id)).length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Total Payable",     value: formatCurrency(offers.reduce((s,o)=>s+o.invoice_amount,0)), color: "text-[var(--color-muted)]" },
          { label: "Savings Available", value: formatCurrency(totalSavings), color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
            <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
      ) : offers.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Package size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No early-pay offers available right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map(offer => (
            <div key={offer.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 transition-all ${paid.has(offer.id) ? "border-green-700/40 opacity-60" : "border-[var(--color-border)]"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold">{offer.supplier_name}</p>
                    <span className="text-[10px] font-semibold bg-green-900/30 text-green-400 border border-green-800/30 px-2 py-0.5 rounded-full">
                      {offer.early_pay_discount}% discount
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--color-muted)]">
                    <span>Invoice: <span className="font-semibold text-[var(--color-text)]">{formatCurrency(offer.invoice_amount)}</span></span>
                    <span>Due in <span className="font-semibold text-yellow-400">{offer.days_early}d</span></span>
                    <span className="flex items-center gap-1">
                      <TrendingDown size={10} className="text-green-400" />
                      Save <span className="font-semibold text-green-400">{formatCurrency(offer.saving)}</span>
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums">{formatCurrency(offer.invoice_amount - offer.saving)}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">Pay today</p>
                  {paid.has(offer.id) ? (
                    <span className="flex items-center gap-1 text-xs text-green-400 mt-1"><Check size={11} /> Paid</span>
                  ) : (
                    <button onClick={() => payEarly(offer)} disabled={paying[offer.id]}
                      className="mt-2 flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
                      <Zap size={11} /> {paying[offer.id] ? "Paying…" : "Pay Early"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">How it works</p>
        <div className="space-y-2 text-xs text-[var(--color-muted)]">
          <p>1. Supplier offers a discount for immediate payment instead of waiting until due date.</p>
          <p>2. You pay today at the discounted amount — saving 1–2% on each invoice.</p>
          <p>3. Supplier gets paid same-day via NEFT. You earn ~18% annualized on idle cash deployed here.</p>
          <p>4. Every early payment strengthens your supplier relationships automatically.</p>
        </div>
      </div>
    </div>
  );
}
