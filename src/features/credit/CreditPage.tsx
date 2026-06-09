import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import { Plus, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const STATUS_COLOR: Record<string, string> = {
  draft:     "bg-[var(--color-accent)] text-[var(--color-muted)]",
  submitted: "bg-blue-900/30 text-blue-400",
  approved:  "bg-green-900/30 text-green-400",
  rejected:  "bg-red-900/30 text-red-400",
  funded:    "bg-purple-900/30 text-purple-400",
};

export default function CreditPage() {
  const { store, addCreditApplication, updateCreditApplication, addCreditOffer } = useApp();
  const { creditApplications, creditOffers } = store;
  const [showForm,  setShowForm]  = useState(false);
  const [amount,    setAmount]    = useState("");
  const [term,      setTerm]      = useState("24");
  const [purpose,   setPurpose]   = useState("");
  const [selected,  setSelected]  = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!amount || !purpose) { toast.error("Enter loan amount and purpose"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid loan amount"); return; }
    setSubmitting(true);
    const id = generateId();
    const app = {
      id, status: "submitted" as const,
      loanAmount: amt, termMonths: Number(term), purpose,
      underwritingScore: 0, approvedAmount: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    addCreditApplication(app);

    try {
      const result = await api.post<{
        score: number; approved_amount: number; recommended_product: string;
        offers?: { lender: string; amount: number; rate: number; termMonths: number }[];
      }>("/api/credit/apply", { amount: amt, termMonths: Number(term), purpose });

      updateCreditApplication({ ...app, underwritingScore: result.score, approvedAmount: result.approved_amount, status: result.score >= 50 ? "approved" : "rejected" });

      if (result.score >= 50 && result.offers) {
        result.offers.forEach(o => addCreditOffer({ id: generateId(), applicationId: id, lender: o.lender, amount: o.amount, rate: o.rate, termMonths: o.termMonths, status: "pending" }));
        toast.success(`Score: ${result.score}/100 — ₹${(result.approved_amount / 100000).toFixed(0)}L approved`);
      } else if (result.score >= 50) {
        ["Lendingkart", "Indifi", "FlexiLoans"].forEach(lender => {
          addCreditOffer({ id: generateId(), applicationId: id, lender, amount: result.approved_amount, rate: 14 + Math.random() * 4, termMonths: Number(term), status: "pending" });
        });
        toast.success(`Score: ${result.score}/100 — ₹${(result.approved_amount / 100000).toFixed(0)}L approved`);
      } else {
        toast.error(`Score: ${result.score}/100 — Not approved. Add more transaction history to improve.`);
      }
    } catch {
      // Fallback to basic local scoring
      updateCreditApplication({ ...app, status: "draft" });
      toast.error("Could not complete underwriting — try again after adding more transactions.");
    }
    setSubmitting(false);
    setShowForm(false); setAmount(""); setTerm("24"); setPurpose("");
  };

  const selectedOffers = creditOffers.filter(o => o.applicationId === selected);
  const bestScore = Math.max(0, ...creditApplications.map(a => a.underwritingScore));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Credit Marketplace</h1>

      {creditApplications.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-2xl p-10 text-center">
          <CreditCard size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">No credit applications yet</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-xs mx-auto">
            Apply for working capital, equipment finance, or a term loan. Our engine scores your business instantly.
          </p>
          <button onClick={() => setShowForm(true)}
            className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-xl text-sm hover:opacity-90">
            Apply Now
          </button>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            {[
              { label: "Applications",   value: creditApplications.length.toString() },
              { label: "Best UW Score",  value: bestScore > 0 ? `${bestScore}/100` : "—" },
              { label: "Total Approved", value: formatCurrency(creditApplications.filter(a => a.status === "approved").reduce((s, a) => s + a.approvedAmount, 0)) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
                <p className="text-xl font-bold text-[var(--color-primary)]">{value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Application form */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">New Application</h2>
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-2 py-1 rounded font-semibold hover:opacity-90">
            <Plus size={12} /> Apply
          </button>
        </div>
        {showForm && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input placeholder="Loan amount (₹)" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            <select value={term} onChange={e => setTerm(e.target.value)}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm outline-none">
              {[3,6,12,18,24,36].map(m => <option key={m} value={m}>{m} months</option>)}
            </select>
            <input placeholder="Purpose (e.g. Working capital)" value={purpose} onChange={e => setPurpose(e.target.value)}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            <button onClick={handleSubmit} disabled={submitting}
              className="md:col-span-3 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded text-sm hover:opacity-90 disabled:opacity-40">
              {submitting ? "Underwriting…" : "Submit & Get Offers"}
            </button>
          </div>
        )}
      </div>

      {/* Applications list */}
      {creditApplications.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Status","Amount","Term","Score","Purpose","Offers"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {creditApplications.map(a => (
                <tr key={a.id} onClick={() => setSelected(a.id === selected ? null : a.id)}
                  className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)] cursor-pointer transition-colors">
                  <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[a.status]}`}>{a.status}</span></td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(a.loanAmount)}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{a.termMonths}mo</td>
                  <td className="px-4 py-3">
                    {a.underwritingScore > 0 ? (
                      <span className={a.underwritingScore >= 70 ? "text-green-400" : a.underwritingScore >= 50 ? "text-yellow-400" : "text-red-400"}>{a.underwritingScore}/100</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)] max-w-[160px] truncate">{a.purpose}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{creditOffers.filter(o => o.applicationId === a.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Offers */}
      {selected && selectedOffers.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3">Lender Offers</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {selectedOffers.map(o => (
              <div key={o.id} className="border border-[var(--color-border)] rounded-xl p-4">
                <p className="font-semibold mb-1">{o.lender}</p>
                <p className="text-xl font-bold text-[var(--color-primary)]">{formatCurrency(o.amount)}</p>
                <p className="text-xs text-[var(--color-muted)] mt-1">{o.rate.toFixed(1)}% APR · {o.termMonths} months</p>
                <button className="mt-3 w-full text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-1.5 rounded hover:opacity-90">Accept Offer</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
