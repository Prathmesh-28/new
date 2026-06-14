import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { ShieldCheck, TrendingUp, Landmark, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import PreviewBadge from "@/components/PreviewBadge";

interface Application {
  id: string;
  business_name: string;
  city: string;
  industry: string;
  loan_amount: number;
  revenue_monthly: number;
  credit_score: number;
  aa_verified: boolean;
  requested_at: string;
}

function BidModal({ app, onClose, onBid }: { app: Application; onClose: () => void; onBid: () => void }) {
  const [rate, setRate]   = useState("");
  const [fee, setFee]     = useState("");
  const [bidding, setBidding] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBidding(true);
    try {
      await api.post("/api/lenders/bid", { application_id: app.id, interest_rate: parseFloat(rate), processing_fee: parseFloat(fee || "0") });
      toast.success(`Bid placed at ${rate}% p.a. You'll be notified of the borrower's decision within 48 hours.`);
      onBid();
      onClose();
    } catch {
      toast.error("Bid failed");
    } finally { setBidding(false); }
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Place Bid</h2>
          <button onClick={onClose}><X size={16} className="text-[var(--color-muted)]" /></button>
        </div>
        <div className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
          <p className="text-sm font-semibold">{app.business_name}</p>
          <div className="flex gap-3 mt-1 text-xs text-[var(--color-muted)]">
            <span>{app.city} · {app.industry}</span>
            <span>Loan: <span className="text-[var(--color-text)] font-semibold">{formatCurrency(app.loan_amount)}</span></span>
            {app.aa_verified && <span className="text-green-400 flex items-center gap-0.5"><ShieldCheck size={10} /> AA Verified</span>}
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Interest rate (% p.a.) *</label>
            <input type="number" min="8" max="36" step="0.25" value={rate} onChange={e => setRate(e.target.value)} required className={inp} placeholder="e.g. 14.5" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Processing fee (%)</label>
            <input type="number" min="0" max="5" step="0.1" value={fee} onChange={e => setFee(e.target.value)} className={inp} placeholder="e.g. 1.5" />
          </div>
          {rate && (
            <div className="bg-[var(--color-accent)] rounded-lg p-3 text-xs">
              <p className="text-[var(--color-muted)] mb-1">Monthly interest income (estimated)</p>
              <p className="text-xl font-bold text-[var(--color-primary)]">
                {formatCurrency(app.loan_amount * (parseFloat(rate)/100) / 12)}
              </p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={bidding || !rate}
              className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-40">
              {bidding ? "Placing bid…" : "Place Bid"}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] rounded-lg hover:bg-[var(--color-accent)]">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LendersPage() {
  const { user } = useAuth();
  if (!user || !["investor", "super_admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const [apps, setApps]       = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidApp, setBidApp]   = useState<Application | null>(null);
  const [bids, setBids]       = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get<Application[]>("/api/lenders/queue")
      .then(setApps)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">Lender Dashboard <PreviewBadge capability="lenderMarketplace" /></h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">AA-verified credit applications · Bid on loans · Best rate wins</p>
      </div>

      <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3">
        <p className="text-sm font-semibold text-blue-300 mb-1">Co-lending Auction</p>
        <p className="text-xs text-[var(--color-muted)]">Every application goes to 3–5 lenders simultaneously. The business picks the lowest rate. You only pay acquisition cost when you win — no cold-calling, no relationship-building from scratch. All financials are AA-verified, not founder-reported.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "In Queue",      value: apps.length.toString(),                                   color: "text-[var(--color-primary)]" },
          { label: "AA-Verified",   value: apps.filter(a=>a.aa_verified).length.toString(),          color: "text-green-400" },
          { label: "Total Volume",  value: formatCurrency(apps.reduce((s,a)=>s+a.loan_amount,0)),    color: "text-[var(--color-muted)]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
            <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
      ) : apps.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Landmark size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No applications in the queue right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map(app => (
            <div key={app.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${bids.has(app.id) ? "border-green-700/40" : "border-[var(--color-border)]"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-sm font-semibold">{app.business_name}</p>
                    {app.aa_verified && (
                      <span className="flex items-center gap-0.5 text-[10px] bg-green-900/30 text-green-400 border border-green-800/30 px-1.5 py-0.5 rounded-full">
                        <ShieldCheck size={9} /> AA Verified
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
                    <span>{app.city} · {app.industry}</span>
                    <span>Revenue: <span className="font-semibold text-[var(--color-text)]">{formatCurrency(app.revenue_monthly)}/mo</span></span>
                    <span>Score: <span className={`font-bold ${app.credit_score >= 70 ? "text-green-400" : app.credit_score >= 55 ? "text-yellow-400" : "text-red-400"}`}>{app.credit_score}/100</span></span>
                    <span>Asked: {new Date(app.requested_at).toLocaleDateString("en-IN")}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(app.loan_amount)}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mb-2">loan requested</p>
                  {bids.has(app.id) ? (
                    <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 size={11} /> Bid placed</span>
                  ) : (
                    <button onClick={() => setBidApp(app)}
                      className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
                      <TrendingUp size={11} /> Place Bid
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {bidApp && <BidModal app={bidApp} onClose={() => setBidApp(null)} onBid={() => setBids(s => new Set([...s, bidApp!.id]))} />}
    </div>
  );
}
