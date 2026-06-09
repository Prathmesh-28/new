import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { Briefcase, TrendingUp, Users, Rocket } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
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

export default function InvestorPage() {
  const { user } = useAuth();
  const { store } = useApp();
  const { capitalRaises, capitalInvestments } = store;

  if (!user || !["investor", "super_admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const myInvestments = capitalInvestments.filter(i => i.investorEmail === user.email);
  const myRaiseIds    = new Set(myInvestments.map(i => i.raiseId));
  const myRaises      = capitalRaises.filter(r => myRaiseIds.has(r.id));

  const totalInvested = myInvestments.reduce((s, i) => s + i.amount, 0);
  const activeRaises  = myRaises.filter(r => r.status === "active").length;

  const SHOWCASE_RAISES: {
    title: string; track: CapitalRaise["track"]; sector: string;
    target: number; raised: number; investors: number; tagline: string;
  }[] = [
    { title: "GreenLeaf Bakeries", track: "rev_share", sector: "F&B", target: 2000000, raised: 1200000, investors: 43, tagline: "20-year family brand. 3 outlets. Revenue share at 8%." },
    { title: "TechMerch India",    track: "reg_cf",    sector: "D2C", target: 10000000, raised: 4800000, investors: 182, tagline: "India's largest tech merchandise platform. SEC Reg CF." },
    { title: "Apex Solar Mfg",     track: "reg_a_plus",sector: "Manufacturing", target: 75000000, raised: 28000000, investors: 612, tagline: "Greenfield solar panel plant. Reg A+ qualified." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Investor Portfolio</h1>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">{user.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Invested",   value: formatCurrency(totalInvested),           icon: Briefcase },
          { label: "Active Raises",    value: activeRaises.toString(),                  icon: TrendingUp },
          { label: "Investments",      value: myInvestments.length.toString(),          icon: Users },
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
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TRACK_COLOR[raise.track]}`}>{TRACK_LABEL[raise.track]}</span>
                        <span className={`text-xs ${raise.status === "active" ? "text-green-400" : "text-[var(--color-muted)]"}`}>{raise.status}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[var(--color-muted)]">My investment</p>
                      <p className="text-base font-bold text-[var(--color-primary)]">{formatCurrency(inv.amount)}</p>
                      <p className="text-xs text-[var(--color-muted)]">{inv.equityPct.toFixed(2)}% equity · {inv.status}</p>
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
          <span className="text-xs bg-green-900/20 text-green-400 border border-green-800/30 px-2 py-0.5 rounded-full">3 available</span>
        </div>
        <div className="space-y-3">
          {SHOWCASE_RAISES.map(r => {
            const pct = Math.round((r.raised / r.target) * 100);
            return (
              <div key={r.title} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold">{r.title}</p>
                      <span className="text-xs text-[var(--color-muted)]">{r.sector}</span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TRACK_COLOR[r.track]}`}>{TRACK_LABEL[r.track]}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--color-muted)]">Target</p>
                    <p className="text-sm font-bold text-[var(--color-primary)]">{formatCurrency(r.target)}</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--color-muted)] mb-3">{r.tagline}</p>
                <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                  <span>{formatCurrency(r.raised)} raised · {pct}%</span>
                  <span>{r.investors} investors</span>
                </div>
                <button className="mt-3 w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold text-sm py-2 rounded-lg hover:opacity-90">
                  Express Interest
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Raise types explainer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { track: "rev_share" as const, icon: "📈", desc: "Repay from % of monthly revenue. No equity dilution. Up to $500K." },
          { track: "reg_cf"    as const, icon: "📄", desc: "Equity crowdfunding under SEC Reg CF framework. Up to $5M per year." },
          { track: "reg_a_plus"as const, icon: "🚀", desc: "Public mini-IPO. Shares tradeable. Up to $75M. Full compliance layer." },
        ].map(({ track, icon, desc }) => (
          <div key={track} className={`rounded-xl p-4 border ${TRACK_COLOR[track].replace("text-", "border-").split(" ").slice(0, 2).join(" ")} bg-[var(--color-surface)]`}>
            <span className="text-xl">{icon}</span>
            <p className="text-xs font-semibold mt-2 mb-1">{TRACK_LABEL[track]}</p>
            <p className="text-xs text-[var(--color-muted)]">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
