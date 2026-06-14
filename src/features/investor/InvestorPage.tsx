import { useState, useEffect, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import {
  Briefcase, TrendingUp, Users, Rocket, X, ShieldCheck, AlertTriangle,
  Bell, Search, Filter, Plus, CheckCircle2, ArrowDownRight, ArrowUpRight,
  Eye, ChevronRight, TrendingDown,
  Mail, FolderLock, FileText, Layers, Copy, Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useFeatureState } from "@/hooks/useFeatureState";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { differenceInCalendarDays, format } from "date-fns";
import type { CapitalRaise } from "@/data/types";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// Simulated portfolio company monitoring data
type PortfolioCompany = {
  id: string;
  name: string;
  sector: string;
  invested: number;
  equity_pct: number;
  runway_days: number;
  monthly_burn: number;
  monthly_revenue: number;
  burn_trend: "up" | "down" | "flat";
  revenue_trend: "up" | "down" | "flat";
  aa_verified: boolean;
  last_alert: { severity: "critical" | "high" | "medium" | "low"; msg: string } | null;
  last_updated: string;
};

type Syndicate = {
  id: string;
  name: string;
  lead: string;
  raise_name: string;
  target: number;
  committed: number;
  members: number;
  min_check: number;
  closes_at: string;
};

const MOCK_PORTFOLIO: PortfolioCompany[] = [
  {
    id: "p1", name: "Raj Traders Pvt Ltd", sector: "Distribution", invested: 2500000,
    equity_pct: 2.5, runway_days: 142, monthly_burn: 380000, monthly_revenue: 520000,
    burn_trend: "down", revenue_trend: "up", aa_verified: true,
    last_alert: null, last_updated: "2026-06-10T10:00:00Z",
  },
  {
    id: "p2", name: "Priya Tech Services", sector: "SaaS", invested: 1000000,
    equity_pct: 1.2, runway_days: 38, monthly_burn: 610000, monthly_revenue: 480000,
    burn_trend: "up", revenue_trend: "flat", aa_verified: true,
    last_alert: { severity: "high", msg: "Cash runway below 45 days — fundraising urgency" },
    last_updated: "2026-06-11T08:30:00Z",
  },
  {
    id: "p3", name: "Greenfield Agro", sector: "AgriTech", invested: 5000000,
    equity_pct: 5.0, runway_days: 289, monthly_burn: 210000, monthly_revenue: 860000,
    burn_trend: "flat", revenue_trend: "up", aa_verified: true,
    last_alert: null, last_updated: "2026-06-11T06:00:00Z",
  },
  {
    id: "p4", name: "Urban Logistics Co", sector: "Logistics", invested: 750000,
    equity_pct: 0.8, runway_days: 22, monthly_burn: 920000, monthly_revenue: 760000,
    burn_trend: "up", revenue_trend: "down", aa_verified: false,
    last_alert: { severity: "critical", msg: "Runway critical — 22 days. Revenue declining MoM." },
    last_updated: "2026-06-11T09:15:00Z",
  },
];

const MOCK_SYNDICATES: Syndicate[] = [
  {
    id: "s1", name: "D2C Growth Fund I", lead: "Ramesh K.", raise_name: "Raj Traders — Reg CF",
    target: 5000000, committed: 3200000, members: 12, min_check: 100000,
    closes_at: "2026-07-15",
  },
  {
    id: "s2", name: "AgriTech Angels", lead: "Sunita M.", raise_name: "Greenfield Agro — Rev Share",
    target: 10000000, committed: 6700000, members: 28, min_check: 250000,
    closes_at: "2026-08-01",
  },
];

// ── Portfolio Monitoring ──────────────────────────────────────────────────────

function PortfolioTab({ portfolio }: { portfolio: PortfolioCompany[] }) {
  const atRisk  = portfolio.filter(c => c.runway_days < 60 || c.last_alert?.severity === "critical" || c.last_alert?.severity === "high");
  const healthy = portfolio.filter(c => !atRisk.includes(c));

  const totalInvested = portfolio.reduce((s, c) => s + c.invested, 0);
  const withAlerts    = portfolio.filter(c => c.last_alert).length;
  const avgRunway     = portfolio.length > 0 ? Math.round(portfolio.reduce((s, c) => s + c.runway_days, 0) / portfolio.length) : 0;
  const aaVerified    = portfolio.filter(c => c.aa_verified).length;

  return (
    <div className="space-y-4">
      {/* AA trust banner */}
      <div className="bg-[var(--color-primary)]/8 border border-[var(--color-primary)]/25 rounded-lg px-4 py-3">
        <div className="flex items-start gap-3">
          <ShieldCheck size={15} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">AA-Verified Financials — sample preview</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              The companies below are <span className="text-[var(--color-text)]">illustrative sample data</span> showing how portfolio monitoring works. Once a founder grants Account Aggregator consent, revenue, burn, and runway here are pulled directly from their bank — not typed into a deck —
              <span className="text-[var(--color-primary)] font-semibold"> so you see distress the same moment they do.</span>
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Deployed",   value: formatCurrency(totalInvested),         color: "text-[var(--color-primary)]" },
          { label: "Portfolio Companies", value: portfolio.length.toString(),           color: "text-[var(--color-text)]" },
          { label: "Avg Runway",       value: `${avgRunway}d`,                        color: avgRunway < 60 ? "text-red-400" : avgRunway < 90 ? "text-yellow-400" : "text-green-400" },
          { label: "Active Alerts",    value: withAlerts.toString(),                  color: withAlerts > 0 ? "text-red-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* At-risk companies */}
      {atRisk.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} /> Early Warning — Needs Attention ({atRisk.length})
          </h2>
          <div className="space-y-2">
            {atRisk.map(c => <CompanyCard key={c.id} company={c} />)}
          </div>
        </div>
      )}

      {/* Healthy companies */}
      {healthy.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-green-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <CheckCircle2 size={11} /> On Track ({healthy.length})
          </h2>
          <div className="space-y-2">
            {healthy.map(c => <CompanyCard key={c.id} company={c} />)}
          </div>
        </div>
      )}

      {portfolio.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Briefcase size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm font-semibold mb-1">No portfolio companies yet</p>
          <p className="text-sm text-[var(--color-muted)]">Invest in a raise to start monitoring in real time.</p>
        </div>
      )}

      <p className="text-[10px] text-[var(--color-muted)] text-center">
        Sample data · connect Account Aggregator to populate with live bank-verified metrics
      </p>
    </div>
  );
}

function CompanyCard({ company: c }: { company: PortfolioCompany }) {
  const runwayColor = c.runway_days < 30 ? "text-red-400" : c.runway_days < 60 ? "text-yellow-400" : "text-green-400";
  const severityColor: Record<string, string> = {
    critical: "text-red-400 border-red-800/40 bg-red-950/20",
    high:     "text-orange-400 border-orange-800/40 bg-orange-950/20",
    medium:   "text-yellow-400 border-yellow-800/40 bg-yellow-950/20",
    low:      "text-green-400 border-green-800/40 bg-green-950/20",
  };

  return (
    <div className={`bg-[var(--color-surface)] border rounded-lg p-4 ${c.last_alert?.severity === "critical" ? "border-red-700/50" : c.last_alert?.severity === "high" ? "border-orange-700/40" : "border-[var(--color-border)]"}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <p className="text-sm font-semibold">{c.name}</p>
            {c.aa_verified && (
              <span className="flex items-center gap-0.5 text-[10px] bg-green-900/30 text-green-400 border border-green-800/30 px-1.5 py-0.5 rounded-full">
                <ShieldCheck size={8} /> Sample
              </span>
            )}
            {!c.aa_verified && (
              <span className="text-[10px] text-yellow-400 border border-yellow-800/30 bg-yellow-950/20 px-1.5 py-0.5 rounded-full">
                Self-reported
              </span>
            )}
            <span className="text-[10px] text-[var(--color-muted)] bg-[var(--color-accent)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">{c.sector}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-[var(--color-muted)]">Runway</p>
              <p className={`text-sm font-bold tabular-nums ${runwayColor}`}>{c.runway_days}d</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--color-muted)]">Monthly Revenue</p>
              <div className="flex items-center gap-1">
                <p className="text-sm font-bold tabular-nums text-green-400">{formatCurrency(c.monthly_revenue)}</p>
                {c.revenue_trend === "up"   ? <ArrowUpRight size={10} className="text-green-400" />
                 : c.revenue_trend === "down" ? <ArrowDownRight size={10} className="text-red-400" />
                 : null}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[var(--color-muted)]">Monthly Burn</p>
              <div className="flex items-center gap-1">
                <p className="text-sm font-bold tabular-nums text-red-400">{formatCurrency(c.monthly_burn)}</p>
                {c.burn_trend === "up"   ? <ArrowUpRight size={10} className="text-red-400" />
                 : c.burn_trend === "down" ? <ArrowDownRight size={10} className="text-green-400" />
                 : null}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[var(--color-muted)]">My Investment</p>
              <p className="text-sm font-bold tabular-nums">{formatCurrency(c.invested)}</p>
              <p className="text-[10px] text-[var(--color-muted)]">{c.equity_pct}% equity</p>
            </div>
          </div>

          {c.last_alert && (
            <div className={`mt-2 text-xs rounded-lg px-2.5 py-1.5 border flex items-start gap-1.5 ${severityColor[c.last_alert.severity]}`}>
              <Bell size={10} className="mt-0.5 shrink-0" />
              <span>{c.last_alert.msg}</span>
            </div>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[10px] text-[var(--color-muted)]">Updated</p>
          <p className="text-[10px] text-[var(--color-muted)]">{format(new Date(c.last_updated), "d MMM HH:mm")}</p>
        </div>
      </div>
    </div>
  );
}

// ── Deal Flow Tab ─────────────────────────────────────────────────────────────

const SECTORS = ["All", "SaaS", "D2C", "AgriTech", "Logistics", "Manufacturing", "Distribution", "HealthTech", "EdTech"];
const REV_BANDS = ["All", "₹5L–50L", "₹50L–2Cr", "₹2Cr–10Cr", "₹10Cr+"];

function DealFlowTab({ publicRaises, loading, user, onCommit, capitalInvestments }: {
  publicRaises: PublicRaise[];
  loading: boolean;
  user: { email: string };
  onCommit: (r: PublicRaise) => void;
  capitalInvestments: { raiseId: string; investorEmail: string }[];
}) {
  const [sectorFilter, setSectorFilter] = useState("All");
  const [revFilter, setRevFilter]       = useState("All");
  const [search, setSearch]             = useState("");
  const [trackFilter, setTrackFilter]   = useState<string>("all");

  const filtered = useMemo(() => {
    return publicRaises.filter(r => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (trackFilter !== "all" && r.raise_type !== trackFilter) return false;
      return true;
    });
  }, [publicRaises, search, trackFilter]);

  // Add mock enriched metadata to raises
  const enriched = useMemo(() => filtered.map((r, i) => ({
    ...r,
    sector:     SECTORS[(i % (SECTORS.length - 1)) + 1],
    revenue_verified: Math.round(800000 + i * 340000),
    growth_pct: Math.round(8 + i * 4),
    dso_days:   Math.round(28 + i * 7),
    employee_count: Math.round(8 + i * 6),
    founded_year: 2019 + (i % 5),
    use_of_funds: i % 3 === 0 ? "Working capital" : i % 3 === 1 ? "Team expansion" : "Product & marketing",
  })), [filtered]);

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search raises…"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {["all", "rev_share", "reg_cf", "reg_a_plus"].map(t => (
            <button key={t} onClick={() => setTrackFilter(t)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${trackFilter === t ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {t === "all" ? "All" : TRACK_LABEL[t as CapitalRaise["track"]]}
            </button>
          ))}
        </div>
        <span className="text-xs text-[var(--color-muted)] ml-auto">{enriched.length} raises</span>
      </div>

      {enriched.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Rocket size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No active raises match your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {enriched.map(r => {
            const pct = r.target_amount > 0 ? Math.round((r.raised_amount / r.target_amount) * 100) : 0;
            const alreadyIn = capitalInvestments.some(i => i.raiseId === r.id && i.investorEmail === user.email);
            const daysLeft = r.closes_at ? differenceInCalendarDays(new Date(r.closes_at), new Date()) : null;
            return (
              <div key={r.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-semibold">{r.name}</p>
                      <span className="flex items-center gap-0.5 text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">
                        <ShieldCheck size={8} /> Sample
                      </span>
                      <span className="text-[10px] text-[var(--color-muted)] bg-[var(--color-accent)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">{r.sector}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TRACK_COLOR[r.raise_type]}`}>
                        {TRACK_LABEL[r.raise_type]}
                      </span>
                      <span className="text-xs text-[var(--color-muted)]">Founded {r.founded_year}</span>
                      <span className="text-xs text-[var(--color-muted)]">{r.employee_count} employees</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-[var(--color-muted)]">Target</p>
                    <p className="text-sm font-bold text-[var(--color-primary)]">{formatCurrency(r.target_amount)}</p>
                    {daysLeft !== null && (
                      <p className={`text-xs font-semibold ${daysLeft <= 7 ? "text-red-400" : daysLeft <= 21 ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>
                        {daysLeft}d left
                      </p>
                    )}
                  </div>
                </div>

                {/* Illustrative sample metrics (until AA-connected) */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: "MRR (sample)",    value: formatCurrency(r.revenue_verified),  color: "text-green-400" },
                    { label: "MoM Growth",      value: `+${r.growth_pct}%`,                color: "text-[var(--color-primary)]" },
                    { label: "Use of funds",    value: r.use_of_funds,                      color: "text-[var(--color-text)]" },
                  ].map(m => (
                    <div key={m.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2 text-center">
                      <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{m.label}</p>
                      <p className={`text-xs font-bold ${m.color} truncate`}>{m.value}</p>
                    </div>
                  ))}
                </div>

                <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden mb-1.5">
                  <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-3">
                  <span>{formatCurrency(r.raised_amount)} raised · {pct}% funded</span>
                </div>

                {alreadyIn ? (
                  <div className="w-full text-center text-xs text-green-400 bg-green-900/20 border border-green-800/30 py-2 rounded-lg">
                    You have an active investment in this raise
                  </div>
                ) : (
                  <button onClick={() => onCommit(r)}
                    className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold text-sm py-2 rounded-lg hover:opacity-90">
                    Express Interest →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Explainer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
        {[
          { track: "rev_share"  as const, icon: "📈", desc: "Repay from % of monthly revenue. No equity dilution. Up to ₹5Cr." },
          { track: "reg_cf"     as const, icon: "📄", desc: "Equity crowdfunding. Up to ₹50Cr per year under SEBI framework." },
          { track: "reg_a_plus" as const, icon: "🚀", desc: "Public mini-IPO. Shares tradeable. Full compliance layer." },
        ].map(({ track, icon, desc }) => (
          <div key={track} className="rounded-lg p-3 border border-[var(--color-border)] bg-[var(--color-surface)]">
            <span className="text-lg">{icon}</span>
            <p className="text-xs font-semibold mt-1 mb-0.5">{TRACK_LABEL[track]}</p>
            <p className="text-xs text-[var(--color-muted)]">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Syndicates Tab ────────────────────────────────────────────────────────────

function SyndicatesTab({ user }: { user: { email: string } }) {
  const [syndicates, setSyndicates] = useState<Syndicate[]>(MOCK_SYNDICATES);
  const [joined, setJoined]         = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState("");
  const [newMin, setNewMin]         = useState("100000");

  const join = (id: string, name: string) => {
    setJoined(s => new Set([...s, id]));
    toast.success(`Joined syndicate "${name}". Lead investor will contact you for KYC.`);
  };

  const createSyndicate = () => {
    if (!newName) { toast.error("Enter a syndicate name"); return; }
    const s: Syndicate = {
      id: crypto.randomUUID(), name: newName, lead: user.email.split("@")[0],
      raise_name: "Pending — will be linked to a raise",
      target: 5000000, committed: 0, members: 1, min_check: parseFloat(newMin),
      closes_at: new Date(Date.now() + 45 * 86400000).toISOString().split("T")[0],
    };
    setSyndicates(prev => [s, ...prev]);
    setNewName(""); setShowCreate(false);
    toast.success("Syndicate created! Other investors can now join your deal.");
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Syndicates — the AngelList play for Indian SMBs</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            A lead investor creates a syndicate on a verified raise. Smaller checks ride along on one term sheet.
            Headroom handles the cap table entry. ₹25L–₹2Cr deals, accessible to angel-sized investors.
          </p>
        </div>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 whitespace-nowrap">
          <Plus size={11} /> Create Syndicate
        </button>
      </div>

      {showCreate && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">New Syndicate</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Syndicate name *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Mumbai SaaS Angels" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Min check size (₹)</label>
              <input type="number" value={newMin} onChange={e => setNewMin(e.target.value)} className={inp} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createSyndicate} className="bg-[var(--color-primary)] text-[var(--color-bg)] text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90">
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {syndicates.map(s => {
          const pct = Math.round((s.committed / s.target) * 100);
          const isJoined = joined.has(s.id);
          const daysLeft = differenceInCalendarDays(new Date(s.closes_at), new Date());
          return (
            <div key={s.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">Lead: {s.lead} · {s.raise_name}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.members} investors · min {formatCurrency(s.min_check)} · {daysLeft}d to close</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-[var(--color-muted)]">Target</p>
                  <p className="text-sm font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(s.target)}</p>
                </div>
              </div>
              <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden mb-1">
                <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-3">
                <span>{formatCurrency(s.committed)} committed · {pct}%</span>
                <span>{formatCurrency(s.target - s.committed)} remaining</span>
              </div>
              {isJoined ? (
                <div className="text-center text-xs text-green-400 bg-green-900/20 border border-green-800/30 py-2 rounded-lg">
                  You're in this syndicate
                </div>
              ) : (
                <button onClick={() => join(s.id, s.name)}
                  className="w-full text-xs border border-[var(--color-primary)]/40 text-[var(--color-primary)] py-2 rounded-lg hover:bg-[var(--color-primary)]/10 font-medium">
                  Join Syndicate · min {formatCurrency(s.min_check)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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
  const [tab,           setTab]           = useState<"portfolio" | "dealflow" | "syndicates" | "update-composer" | "data-room" | "tearsheet" | "exit-waterfall">("portfolio");

  if (!user || !["investor", "super_admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const myInvestments = capitalInvestments.filter(i => i.investorEmail === user.email);

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
      const amt    = Number(commitAmount);
      const result = await api.post<{ id: string; equity_pct: number }>(
        `/api/capital/raises/${commitRaise.id}/commit`, { amount: amt }
      );
      const equityPct = result.equity_pct ?? (amt / commitRaise.target_amount) * 100;
      addCapitalInvestment({
        id: result.id, raiseId: commitRaise.id, investorEmail: user.email,
        amount: amt, equityPct, status: "confirmed", createdAt: new Date().toISOString(),
      });
      toast.success("Investment committed! You'll receive a confirmation email.");
      setCommitRaise(null); setCommitAmount(""); setAgreed(false);
      loadRaises();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commitment failed");
    } finally { setCommitting(false); }
  };

  const TABS = [
    { id: "portfolio"       as const, label: `Portfolio (${MOCK_PORTFOLIO.length})`, badge: MOCK_PORTFOLIO.filter(c => c.last_alert?.severity === "critical").length || undefined },
    { id: "dealflow"        as const, label: `Deal Flow${publicRaises.length > 0 ? ` (${publicRaises.length})` : ""}`, badge: undefined },
    { id: "syndicates"      as const, label: "Syndicates",        badge: undefined },
    { id: "update-composer" as const, label: "Investor Update",   badge: undefined },
    { id: "data-room"       as const, label: "Data Room",         badge: undefined },
    { id: "tearsheet"       as const, label: "KPI Tearsheet",     badge: undefined },
    { id: "exit-waterfall"  as const, label: "Exit Waterfall",    badge: undefined },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Investor Portal</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          AA-verified portfolio monitoring · Live deal flow · Syndicates · {user.email}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
        {TABS.map(({ id, label, badge }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors flex items-center gap-1.5 ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {label}
            {badge !== undefined && badge > 0 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${tab === id ? "bg-white/20 text-white" : "bg-red-900/40 text-red-400"}`}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "portfolio"  && <PortfolioTab portfolio={MOCK_PORTFOLIO} />}
      {tab === "dealflow"   && (
        <DealFlowTab
          publicRaises={publicRaises}
          loading={loadingRaises}
          user={user}
          onCommit={r => { setCommitRaise(r); setCommitAmount(""); setAgreed(false); }}
          capitalInvestments={myInvestments}
        />
      )}
      {tab === "syndicates" && <SyndicatesTab user={user} />}
      {tab === "update-composer" && <InvestorUpdateComposer user={user} />}
      {tab === "data-room"       && <DataRoomBuilder user={user} />}
      {tab === "tearsheet"       && <KpiTearsheet />}
      {tab === "exit-waterfall"  && <ExitWaterfall />}

      {/* Express interest modal */}
      {commitRaise && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Express Interest</h2>
              <button onClick={() => setCommitRaise(null)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
            </div>
            <div className="bg-[var(--color-bg)] rounded-lg p-3 flex items-center gap-2">
              <ShieldCheck size={13} className="text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{commitRaise.name}</p>
                <p className="text-xs text-[var(--color-muted)]">Sample financials · connect Account Aggregator for bank-verified data</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Investment Amount (₹)</label>
              <input type="number" min="10000" step="10000" placeholder="e.g. 500000"
                value={commitAmount} onChange={e => setCommitAmount(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            {commitAmount && Number(commitAmount) > 0 && (
              <div className="bg-[var(--color-accent)] rounded-lg p-3 text-xs">
                <p className="text-[var(--color-muted)] mb-0.5">Estimated ownership</p>
                <p className="text-2xl font-bold text-[var(--color-primary)]">
                  {((Number(commitAmount) / commitRaise.target_amount) * 100).toFixed(3)}%
                </p>
              </div>
            )}
            <label className="flex items-start gap-2 text-xs text-[var(--color-muted)] cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 accent-[var(--color-primary)]" />
              <span>I understand this is an expression of interest, not a binding commitment. KYC verification will be required before finalising.</span>
            </label>
            <div className="flex gap-2">
              <button onClick={handleCommit} disabled={!commitAmount || !agreed || committing}
                className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-40">
                {committing ? "Committing…" : "Confirm Interest"}
              </button>
              <button onClick={() => setCommitRaise(null)} className="px-4 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] rounded-lg hover:bg-[var(--color-accent)]">
                Cancel
              </button>
            </div>
            <p className="text-[10px] text-center text-[var(--color-muted)]">
              Not a solicitation to buy securities. Subject to regulatory requirements.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── #113 Investor Update Auto-Composer ─────────────────────────────────────────

function InvestorUpdateComposer({ user }: { user: { email: string } }) {
  const { store } = useApp();
  const firmName = store.firm?.name || "Our Company";
  const txns = store.transactions ?? [];

  // Derive live MRR / burn / runway from transactions
  const metrics = useMemo(() => {
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthTxns = txns.filter(t => t.date.startsWith(m));
    const mrr = monthTxns.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount), 0);
    const burn = monthTxns.filter(t => t.category === "expense" || t.category === "payroll").reduce((s, t) => s + Math.abs(t.amount), 0);
    const cash = txns.reduce((s, t) => s + t.amount, 0);
    const netBurn = Math.max(0, burn - mrr);
    const runwayMonths = netBurn > 0 ? Math.floor(cash / netBurn) : Infinity;
    return { mrr, burn, cash, netBurn, runwayMonths };
  }, [txns]);

  const [highlights, setHighlights] = useState("");
  const [asks, setAsks] = useState("");

  const runwayLabel = metrics.runwayMonths === Infinity ? "cash-flow positive" : `${metrics.runwayMonths} months`;
  const monthLabel = format(new Date(), "MMMM yyyy");

  const draft = useMemo(() => {
    const lines = [
      `Subject: ${firmName} — Investor Update, ${monthLabel}`,
      ``,
      `Hi all,`,
      ``,
      `Here is our update for ${monthLabel}.`,
      ``,
      `Headline metrics:`,
      `• MRR: ${formatCurrency(metrics.mrr)}`,
      `• Monthly burn: ${formatCurrency(metrics.burn)}`,
      `• Net burn: ${formatCurrency(metrics.netBurn)}`,
      `• Cash in bank: ${formatCurrency(metrics.cash)}`,
      `• Runway: ${runwayLabel}`,
      ``,
      `Highlights:`,
      highlights.trim() ? highlights.trim() : `• (add highlights above)`,
      ``,
      `Where we need help:`,
      asks.trim() ? asks.trim() : `• (add asks above)`,
      ``,
      `Thanks for your continued support,`,
      user.email.split("@")[0],
    ];
    return lines.join("\n");
  }, [firmName, monthLabel, metrics, runwayLabel, highlights, asks, user.email]);

  const copy = () => {
    navigator.clipboard.writeText(draft).then(
      () => toast.success("Update copied to clipboard"),
      () => toast.error("Could not copy")
    );
  };
  const mailto = () => {
    const subject = encodeURIComponent(`${firmName} — Investor Update, ${monthLabel}`);
    const body = encodeURIComponent(draft);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Mail size={14} className="text-[var(--color-primary)]" /> Investor Update Composer</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">MRR, burn and runway are pulled live from your transactions. Add highlights and asks, then copy or email the draft.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "MRR (this month)", value: formatCurrency(metrics.mrr), color: "text-green-400" },
          { label: "Monthly Burn", value: formatCurrency(metrics.burn), color: "text-red-400" },
          { label: "Net Burn", value: formatCurrency(metrics.netBurn), color: "text-orange-400" },
          { label: "Runway", value: runwayLabel, color: metrics.runwayMonths !== Infinity && metrics.runwayMonths < 6 ? "text-red-400" : "text-[var(--color-primary)]" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Highlights (one per line)</label>
          <textarea value={highlights} onChange={e => setHighlights(e.target.value)} rows={4}
            placeholder={"• Closed 3 new enterprise logos\n• Shipped v2 of the dashboard"}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] resize-y" />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Where we need help (one per line)</label>
          <textarea value={asks} onChange={e => setAsks(e.target.value)} rows={4}
            placeholder={"• Intros to retail distribution partners\n• 2 backend engineering hires"}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] resize-y" />
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Draft</span>
          <div className="flex gap-2">
            <button onClick={copy} className="flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] px-3 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40">
              <Copy size={11} /> Copy
            </button>
            <button onClick={mailto} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
              <Mail size={11} /> Email
            </button>
          </div>
        </div>
        <pre className="px-4 py-3 text-xs text-[var(--color-text)] whitespace-pre-wrap font-mono leading-relaxed">{draft}</pre>
      </div>
    </div>
  );
}

// ── #114 Data Room Builder ─────────────────────────────────────────────────────

type DataRoomItem = { id: string; category: string; label: string; status: "missing" | "in_progress" | "ready" };

const DATA_ROOM_TEMPLATE: { category: string; label: string }[] = [
  { category: "Corporate", label: "Certificate of Incorporation" },
  { category: "Corporate", label: "Memorandum & Articles of Association" },
  { category: "Corporate", label: "Shareholders' Agreement" },
  { category: "Corporate", label: "Board & shareholder resolutions" },
  { category: "Cap Table", label: "Current cap table" },
  { category: "Cap Table", label: "ESOP pool & grant register" },
  { category: "Financials", label: "Audited financial statements (3 yrs)" },
  { category: "Financials", label: "Management accounts (latest)" },
  { category: "Financials", label: "Financial model / projections" },
  { category: "Tax", label: "GST returns & registration" },
  { category: "Tax", label: "Income tax returns (3 yrs)" },
  { category: "Legal", label: "Material customer contracts" },
  { category: "Legal", label: "Key vendor / supplier agreements" },
  { category: "Legal", label: "IP assignments & trademarks" },
  { category: "HR", label: "Employment agreements & policies" },
  { category: "HR", label: "Founder employment / vesting terms" },
];

function DataRoomBuilder({ user: _user }: { user: { email: string } }) {
  const [items, setItems] = useFeatureState<DataRoomItem[]>(
    "investor-data-room",
    DATA_ROOM_TEMPLATE.map((t, i) => ({ id: `dr-${i}`, category: t.category, label: t.label, status: "missing" as const }))
  );

  const cycle = (id: string) => {
    const next: Record<DataRoomItem["status"], DataRoomItem["status"]> = { missing: "in_progress", in_progress: "ready", ready: "missing" };
    setItems(prev => prev.map(it => it.id === id ? { ...it, status: next[it.status] } : it));
  };
  const reset = () => setItems(DATA_ROOM_TEMPLATE.map((t, i) => ({ id: `dr-${i}`, category: t.category, label: t.label, status: "missing" as const })));

  const ready = items.filter(i => i.status === "ready").length;
  const pct = items.length > 0 ? Math.round((ready / items.length) * 100) : 0;
  const categories = [...new Set(items.map(i => i.category))];

  const STATUS_STYLE: Record<DataRoomItem["status"], string> = {
    missing: "bg-red-900/30 text-red-400 border-red-800/40",
    in_progress: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    ready: "bg-green-900/30 text-green-400 border-green-800/40",
  };
  const STATUS_LABEL: Record<DataRoomItem["status"], string> = { missing: "Missing", in_progress: "In progress", ready: "Ready" };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><FolderLock size={14} className="text-[var(--color-primary)]" /> Due-Diligence Data Room</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Track readiness of every document an investor will request. Click a status to advance it. Saved across devices.</p>
        </div>
        <button onClick={reset} className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-red-400 px-2 py-1.5 rounded-lg hover:bg-[var(--color-accent)] whitespace-nowrap">
          <Trash2 size={11} /> Reset
        </button>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-medium">Data room readiness</span>
          <span className="tabular-nums font-bold text-[var(--color-primary)]">{ready}/{items.length} · {pct}%</span>
        </div>
        <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-3">
        {categories.map(cat => (
          <div key={cat} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center gap-2">
              <Layers size={12} className="text-[var(--color-primary)]" />
              <span className="text-sm font-semibold">{cat}</span>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {items.filter(i => i.category === cat).map(it => (
                <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-sm">{it.label}</span>
                  <button onClick={() => cycle(it.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLE[it.status]}`}>
                    {STATUS_LABEL[it.status]}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── #115 KPI / Metric Tearsheet ────────────────────────────────────────────────

function KpiTearsheet() {
  const { store } = useApp();
  const firmName = store.firm?.name || "Company";
  const txns = store.transactions ?? [];

  const m = useMemo(() => {
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
    const rev = (mm: string) => txns.filter(t => t.category === "revenue" && t.date.startsWith(mm)).reduce((s, t) => s + Math.abs(t.amount), 0);
    const exp = (mm: string) => txns.filter(t => (t.category === "expense" || t.category === "payroll") && t.date.startsWith(mm)).reduce((s, t) => s + Math.abs(t.amount), 0);
    const mrr = rev(cur);
    const prevMrr = rev(prev);
    const burn = exp(cur);
    const cash = txns.reduce((s, t) => s + t.amount, 0);
    const netBurn = Math.max(0, burn - mrr);
    const runway = netBurn > 0 ? Math.floor(cash / netBurn) : Infinity;
    const grossMargin = mrr > 0 ? Math.round(((mrr - burn) / mrr) * 100) : 0;
    const momGrowth = prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 100) : 0;
    const arr = mrr * 12;
    return { mrr, arr, burn, cash, netBurn, runway, grossMargin, momGrowth };
  }, [txns]);

  const runwayLabel = m.runway === Infinity ? "Profitable" : `${m.runway} mo`;
  const fc = formatCurrency;

  const cells = [
    { label: "MRR", value: fc(m.mrr), color: "text-green-400" },
    { label: "ARR", value: fc(m.arr), color: "text-[var(--color-primary)]" },
    { label: "MoM Growth", value: `${m.momGrowth >= 0 ? "+" : ""}${m.momGrowth}%`, color: m.momGrowth >= 0 ? "text-green-400" : "text-red-400" },
    { label: "Monthly Burn", value: fc(m.burn), color: "text-red-400" },
    { label: "Net Burn", value: fc(m.netBurn), color: "text-orange-400" },
    { label: "Cash in Bank", value: fc(m.cash), color: "text-[var(--color-text)]" },
    { label: "Runway", value: runwayLabel, color: m.runway !== Infinity && m.runway < 6 ? "text-red-400" : "text-[var(--color-primary)]" },
    { label: "Gross Margin", value: `${m.grossMargin}%`, color: m.grossMargin >= 0 ? "text-green-400" : "text-red-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> KPI Tearsheet — {firmName}</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">A one-pager of headline metrics, computed live from your transactions. Updated {format(new Date(), "d MMM yyyy")}.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cells.map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[var(--color-muted)] text-center">
        Derived from live transactions · MRR = current-month revenue · burn = expenses + payroll · runway = cash ÷ net burn
      </p>
    </div>
  );
}

// ── #116 Cap-Table Exit Waterfall ──────────────────────────────────────────────

type ShareClassRow = { id: string; name: string; type: "pref" | "common"; invested: number; shares: number; multiple: number };

function ExitWaterfall() {
  const [classes, setClasses] = useFeatureState<ShareClassRow[]>("investor-exit-waterfall", [
    { id: "sc-1", name: "Series A Preferred", type: "pref", invested: 50000000, shares: 2000000, multiple: 1 },
    { id: "sc-2", name: "Seed Preferred", type: "pref", invested: 15000000, shares: 1500000, multiple: 1 },
    { id: "sc-3", name: "Founders (Common)", type: "common", invested: 0, shares: 6000000, multiple: 1 },
    { id: "sc-4", name: "ESOP Pool (Common)", type: "common", invested: 0, shares: 500000, multiple: 1 },
  ]);
  const [exitValueInput, setExitValueInput] = useState("250000000");

  const exitValue = parseFloat(exitValueInput) || 0;
  const totalShares = classes.reduce((s, c) => s + c.shares, 0);

  // Non-participating preferred: each pref takes max(liquidation preference, as-converted pro-rata)
  const payouts = useMemo(() => {
    const prefs = classes.filter(c => c.type === "pref");
    const totalLiqPref = prefs.reduce((s, c) => s + c.invested * c.multiple, 0);

    if (exitValue <= 0 || totalShares <= 0) {
      return classes.map(c => ({ ...c, payout: 0, treatment: "—" }));
    }

    // If exit can't cover all preferences, prefs share pro-rata to their preference amount
    if (exitValue <= totalLiqPref) {
      return classes.map(c => {
        if (c.type !== "pref") return { ...c, payout: 0, treatment: "Preference (shortfall)" };
        const pref = c.invested * c.multiple;
        const payout = totalLiqPref > 0 ? (pref / totalLiqPref) * exitValue : 0;
        return { ...c, payout, treatment: "Preference (pro-rata)" };
      });
    }

    // Exit covers preferences; decide per pref class: take preference OR convert to common
    const commonShares = classes.filter(c => c.type === "common").reduce((s, c) => s + c.shares, 0);
    // Iteratively: a pref converts if its as-converted share of (value after non-converting prefs) beats its preference.
    const converting = new Set<string>();
    for (let pass = 0; pass < prefs.length + 1; pass++) {
      const nonConvPref = prefs.filter(c => !converting.has(c.id)).reduce((s, c) => s + c.invested * c.multiple, 0);
      const residual = exitValue - nonConvPref;
      const convShares = commonShares + prefs.filter(c => converting.has(c.id)).reduce((s, c) => s + c.shares, 0);
      let changed = false;
      for (const p of prefs) {
        if (converting.has(p.id)) continue;
        const asConverted = convShares + p.shares > 0 ? (p.shares / (convShares + p.shares)) * (residual) : 0;
        if (asConverted > p.invested * p.multiple) { converting.add(p.id); changed = true; }
      }
      if (!changed) break;
    }

    const nonConvPref = prefs.filter(c => !converting.has(c.id)).reduce((s, c) => s + c.invested * c.multiple, 0);
    const residual = exitValue - nonConvPref;
    const convCommonShares = commonShares + prefs.filter(c => converting.has(c.id)).reduce((s, c) => s + c.shares, 0);

    return classes.map(c => {
      if (c.type === "pref" && !converting.has(c.id)) {
        return { ...c, payout: c.invested * c.multiple, treatment: "Took preference" };
      }
      const sh = c.shares;
      const payout = convCommonShares > 0 ? (sh / convCommonShares) * residual : 0;
      return { ...c, payout, treatment: c.type === "pref" ? "Converted to common" : "Common pro-rata" };
    });
  }, [classes, exitValue, totalShares]);

  const totalPayout = payouts.reduce((s, p) => s + p.payout, 0);

  const update = (id: string, field: keyof ShareClassRow, value: string) => {
    setClasses(prev => prev.map(c => {
      if (c.id !== id) return c;
      if (field === "name") return { ...c, name: value };
      if (field === "type") return { ...c, type: value === "pref" ? "pref" : "common" };
      return { ...c, [field]: parseFloat(value) || 0 };
    }));
  };
  const addRow = () => setClasses(prev => [...prev, { id: crypto.randomUUID(), name: "New class", type: "pref", invested: 0, shares: 0, multiple: 1 }]);
  const removeRow = (id: string) => setClasses(prev => prev.filter(c => c.id !== id));

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Exit Waterfall</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Models payout by share class at an exit value, assuming non-participating preferred (each pref takes the greater of its liquidation preference or its as-converted common share). Saved across devices.</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 max-w-sm">
        <label className="text-xs text-[var(--color-muted)] block mb-1">Exit / acquisition value (₹)</label>
        <input type="number" value={exitValueInput} onChange={e => setExitValueInput(e.target.value)} placeholder="e.g. 250000000"
          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] tabular-nums" />
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Share Class", "Type", "Invested (₹)", "Shares", "Pref ×", "Treatment", "Payout", "% of Exit", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {payouts.map(p => (
              <tr key={p.id}>
                <td className="px-3 py-2"><input value={p.name} onChange={e => update(p.id, "name", e.target.value)} className={inp.replace("tabular-nums", "")} /></td>
                <td className="px-3 py-2">
                  <select value={p.type} onChange={e => update(p.id, "type", e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]">
                    <option value="pref">Preferred</option>
                    <option value="common">Common</option>
                  </select>
                </td>
                <td className="px-3 py-2"><input type="number" value={p.invested || ""} onChange={e => update(p.id, "invested", e.target.value)} className={inp} placeholder="0" /></td>
                <td className="px-3 py-2"><input type="number" value={p.shares || ""} onChange={e => update(p.id, "shares", e.target.value)} className={inp} placeholder="0" /></td>
                <td className="px-3 py-2"><input type="number" step="0.5" value={p.multiple || ""} onChange={e => update(p.id, "multiple", e.target.value)} className={`${inp} w-16`} placeholder="1" /></td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted)] whitespace-nowrap">{p.treatment}</td>
                <td className="px-3 py-2 tabular-nums text-xs font-semibold text-green-400 whitespace-nowrap">{formatCurrency(Math.round(p.payout))}</td>
                <td className="px-3 py-2 tabular-nums text-xs text-[var(--color-muted)]">{exitValue > 0 ? ((p.payout / exitValue) * 100).toFixed(1) : "0.0"}%</td>
                <td className="px-3 py-2"><button onClick={() => removeRow(p.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--color-border)]">
              <td className="px-3 py-2.5 text-xs font-semibold" colSpan={6}>Total distributed</td>
              <td className="px-3 py-2.5 tabular-nums text-xs font-bold text-[var(--color-primary)] whitespace-nowrap">{formatCurrency(Math.round(totalPayout))}</td>
              <td className="px-3 py-2.5 tabular-nums text-xs text-[var(--color-muted)]">{exitValue > 0 ? ((totalPayout / exitValue) * 100).toFixed(0) : "0"}%</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button onClick={addRow} className="flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] px-3 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40">
        <Plus size={11} /> Add share class
      </button>

      <p className="text-[10px] text-[var(--color-muted)]">
        Simplified model: non-participating preferred, single liquidation preference per class, no participation cap or accrued dividends. For indicative planning only — confirm with your cap-table/legal advisor.
      </p>
    </div>
  );
}
