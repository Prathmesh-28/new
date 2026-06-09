import { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { Briefcase, TrendingUp, Users, Rocket, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { CapitalRaise } from "@/data/types";

const TRACK_LABEL: Record<CapitalRaise["track"], string> = {
  rev_share:  "Revenue Share",
  reg_cf:     "Reg CF Equity",
  reg_a_plus: "Reg A+ Mini-IPO",
};

const TRACK_COLOR: Record<CapitalRaise["track"], string> = {
  rev_share:  "bg-blue-900/30 text-blue-400 border-blue-800/30",
  reg_cf:     "bg-purple-900/30 text-purple-400 border-purple-800/30",
  reg_a_plus: "bg-[var(--color-primary)]/20 text-[var(--color-primary)] border-[var(--color-primary)]/30",
};

type PublicRaise = {
  id: string;
  name: string;
  raise_type: CapitalRaise["track"];
  target_amount: number;
  raised_amount: number;
  status: string;
  closes_at: string | null;
};

export default function InvestorPage() {
  const { user } = useAuth();
  const { store, addCapitalInvestment } = useApp();
  const { capitalRaises, capitalInvestments } = store;

  const [publicRaises,  setPublicRaises]  = useState<PublicRaise[]>([]);
  const [loadingRaises, setLoadingRaises] = useState(true);
  const [commitRaise,   setCommitRaise]   = useState<PublicRaise | null>(null);
  const [commitAmount,  setCommitAmount]  = useState("");
  const [agreed,        setAgreed]        = useState(false);
  const [committing,    setCommitting]    = useState(false);

  if (!user || !["investor", "super_admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const myInvestments = capitalInvestments.filter(i => i.investorEmail === user.email);
  const myRaiseIds    = new Set(myInvestments.map(i => i.raiseId));
  const myRaises      = capitalRaises.filter(r => myRaiseIds.has(r.id));

  const totalInvested = myInvestments.reduce((s, i) => s + i.amount, 0);
  const activeRaises  = myRaises.filter(r => r.status === "active").length;

  const loadRaises = () => {
    setLoadingRaises(true);
    api.get<PublicRaise[]>("/api/capital/raises/public")
      .then(r => setPublicRaises(r ?? []))
      .catch(() => setPublicRaises([]))
      .finally(() => setLoadingRaises(false));
  };

  useEffect(() => { loadRaises(); }, []);

  const handleCommit = async () => {
    if (!commitRaise || !commitAmount || !agreed) return;
    setCommitting(true);
    try {
      const amt      = Number(commitAmount);
      const result   = await api.post<{ id: string; equity_pct: number }>(
        `/api/capital/raises/${commitRaise.id}/commit`, { amount: amt }
      );
      const equityPct = result.equity_pct ?? (amt / commitRaise.target_amount) * 100;
      addCapitalInvestment({
        id:            result.id,
        raiseId:       commitRaise.id,
        investorEmail: user.email,
        amount:        amt,
        equityPct,
        status:        "confirmed",
        createdAt:     new Date().toISOString(),
      });
      toast.success("Investment committed! You'll receive a confirmation email.");
      setCommitRaise(null); setCommitAmount(""); setAgreed(false);
      loadRaises();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commitment failed");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Investor Portfolio</h1>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">{user.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Invested",   value: formatCurrency(totalInvested), icon: Briefcase },
          { label: "Active Raises",    value: activeRaises.toString(),        icon: TrendingUp },
          { label: "Investments",      value: myInvestments.length.toString(),icon: Users },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--color-muted)]">{label}</p>
              <Icon size={14} className="text-[var(--color-primary)] opacity-60" />
            </div>
            <p className="text-xl font-bold text-[var(--color-primary)]">{value}</p>
          </div>
        ))}
      </div>

      {/* My investments */}
      {myInvestments.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold mb-3">My Investments</h2>
          <div className="space-y-3">
            {myRaises.map(raise => {
              const inv = myInvestments.find(i => i.raiseId === raise.id)!;
              const pct = raise.targetAmount > 0 ? Math.min(100, (raise.raisedAmount / raise.targetAmount) * 100) : 0;
              return (
                <div key={raise.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TRACK_COLOR[raise.track]}`}>
                        {TRACK_LABEL[raise.track]}
                      </span>
                      <span className={`ml-2 text-xs ${raise.status === "active" ? "text-green-400" : "text-[var(--color-muted)]"}`}>{raise.status}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[var(--color-muted)]">My investment</p>
                      <p className="text-base font-bold text-[var(--color-primary)]">{formatCurrency(inv.amount)}</p>
                      <p className="text-xs text-[var(--color-muted)]">{inv.equityPct.toFixed(3)}% equity · {inv.status}</p>
                    </div>
                  </div>
                  <div className="mb-1 flex justify-between text-xs text-[var(--color-muted)]">
                    <span>Raise progress</span>
                    <span>{formatCurrency(raise.raisedAmount)} / {formatCurrency(raise.targetAmount)}</span>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-[var(--color-muted)] mt-1">{pct.toFixed(0)}% funded</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-[var(--color-border)] rounded-2xl p-8 text-center">
          <Briefcase size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <h2 className="text-base font-semibold mb-1">No investments yet</h2>
          <p className="text-sm text-[var(--color-muted)] mb-4 max-w-xs mx-auto">
            Browse live raises from verified Indian SMBs below and commit capital in minutes.
          </p>
        </div>
      )}

      {/* Marketplace */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Live Raises — Marketplace</h2>
          {!loadingRaises && (
            <span className="text-xs bg-green-900/20 text-green-400 border border-green-800/30 px-2 py-0.5 rounded-full">
              {publicRaises.length} available
            </span>
          )}
        </div>

        {loadingRaises ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : publicRaises.length === 0 ? (
          <div className="border border-dashed border-[var(--color-border)] rounded-2xl p-10 text-center">
            <Rocket size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No active raises at the moment. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {publicRaises.map(r => {
              const pct = r.target_amount > 0 ? Math.round((r.raised_amount / r.target_amount) * 100) : 0;
              const alreadyCommitted = capitalInvestments.some(i => i.raiseId === r.id && i.investorEmail === user.email);
              const trackKey = r.raise_type;
              return (
                <div key={r.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold mb-1">{r.name}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TRACK_COLOR[trackKey] ?? ""}`}>
                        {TRACK_LABEL[trackKey] ?? r.raise_type}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[var(--color-muted)]">Target</p>
                      <p className="text-sm font-bold text-[var(--color-primary)]">{formatCurrency(r.target_amount)}</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden mb-1">
                    <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-3">
                    <span>{formatCurrency(r.raised_amount)} raised · {pct}%</span>
                    {r.closes_at && <span>Closes {new Date(r.closes_at).toLocaleDateString("en-IN")}</span>}
                  </div>
                  {alreadyCommitted ? (
                    <div className="w-full text-center text-xs text-green-400 bg-green-900/20 border border-green-800/30 py-2 rounded-lg">
                      You have an active investment in this raise
                    </div>
                  ) : (
                    <button
                      onClick={() => { setCommitRaise(r); setCommitAmount(""); setAgreed(false); }}
                      className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold text-sm py-2 rounded-lg hover:opacity-90">
                      Express Interest
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Raise types explainer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { track: "rev_share" as const, icon: "📈", desc: "Repay from % of monthly revenue. No equity dilution. Up to ₹5Cr." },
          { track: "reg_cf"    as const, icon: "📄", desc: "Equity crowdfunding. Up to ₹50Cr per year under SEBI framework." },
          { track: "reg_a_plus"as const, icon: "🚀", desc: "Public mini-IPO. Shares tradeable. Full compliance layer." },
        ].map(({ track, icon, desc }) => (
          <div key={track} className="rounded-xl p-4 border border-[var(--color-border)] bg-[var(--color-surface)]">
            <span className="text-xl">{icon}</span>
            <p className="text-xs font-semibold mt-2 mb-1">{TRACK_LABEL[track]}</p>
            <p className="text-xs text-[var(--color-muted)]">{desc}</p>
          </div>
        ))}
      </div>

      {/* Express Interest modal */}
      {commitRaise && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Express Interest</h2>
              <button onClick={() => setCommitRaise(null)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
                <X size={16} />
              </button>
            </div>

            <div className="bg-[var(--color-bg)] rounded-xl p-3">
              <p className="text-xs text-[var(--color-muted)] mb-0.5">Raise</p>
              <p className="text-sm font-semibold">{commitRaise.name}</p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TRACK_COLOR[commitRaise.raise_type] ?? ""}`}>
                {TRACK_LABEL[commitRaise.raise_type] ?? commitRaise.raise_type}
              </span>
            </div>

            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Investment Amount (₹)</label>
              <input
                type="number" min="10000" step="10000" placeholder="e.g. 500000"
                value={commitAmount} onChange={e => setCommitAmount(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            {commitAmount && Number(commitAmount) > 0 && (
              <div className="bg-[var(--color-accent)] rounded-xl p-3 text-xs">
                <p className="text-[var(--color-muted)] mb-0.5">Estimated ownership</p>
                <p className="text-2xl font-bold text-[var(--color-primary)]">
                  {((Number(commitAmount) / commitRaise.target_amount) * 100).toFixed(3)}%
                </p>
                <p className="text-[var(--color-muted)] mt-1">
                  Based on full target of {formatCurrency(commitRaise.target_amount)}
                </p>
              </div>
            )}

            <label className="flex items-start gap-2 text-xs text-[var(--color-muted)] cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 accent-[var(--color-primary)]" />
              <span>
                I understand this is an expression of interest, not a binding commitment. KYC verification
                will be required before finalising. I confirm eligibility under applicable regulations.
              </span>
            </label>

            <div className="flex gap-2">
              <button onClick={handleCommit} disabled={!commitAmount || !agreed || committing}
                className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-xl text-sm hover:opacity-90 disabled:opacity-40">
                {committing ? "Committing…" : "Confirm Interest"}
              </button>
              <button onClick={() => setCommitRaise(null)}
                className="px-4 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] rounded-xl hover:bg-[var(--color-accent)]">
                Cancel
              </button>
            </div>

            <p className="text-[10px] text-center text-[var(--color-muted)]">
              This does not constitute an offer to sell or solicitation to buy securities. Subject to regulatory requirements.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
