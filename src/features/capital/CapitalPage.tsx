import { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, generateId } from "@/lib/utils";
import { api } from "@/lib/api";
import { Plus, Rocket, Gauge, FileSignature, Landmark, Wallet, Trash2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import AiInsight from "@/components/ai/AiInsight";
import CampaignsTab from "@/features/capital/CampaignsTab";

// ── Backend-shaped types (rows from /api/capital/raises) ──────────────────────
// Defined locally to avoid touching the shared data/types.ts. The Raises tab now
// persists against the Node backend instead of the local store.
type RaiseType = "equity" | "ccps" | "safe" | "convertible_note" | "rbf";

interface ApiRaise {
  id: string;
  name: string;
  raise_type: string;            // RaiseType, but backend stores free text
  target_amount: number | string;
  raised_amount: number | string;
  status: "draft" | "active" | "closed" | "funded";
  closes_at?: string | null;
  created_at?: string;
}

interface ApiInvestor {
  id: string;
  raise_id: string;
  name: string;
  email?: string | null;
  amount: number | string;
  status: string;
}

// India-relevant fundraising instruments (₹). Replaces the US Reg CF / Reg A+ tracks.
const RAISE_TYPE_LABEL: Record<RaiseType, string> = {
  equity:           "Equity (priced round)",
  ccps:             "CCPS (Compulsorily Convertible Pref. Shares)",
  safe:             "SAFE (India / iSAFE)",
  convertible_note: "Convertible Note",
  rbf:              "Revenue-Based Financing",
};
const RAISE_TYPES = Object.keys(RAISE_TYPE_LABEL) as RaiseType[];
// Instruments where issuing equity now needs a pre-money valuation to compute dilution.
const PRICED_TYPES: RaiseType[] = ["equity", "ccps"];

const STATUS_COLOR: Record<string, string> = {
  draft:  "bg-[var(--color-accent)] text-[var(--color-muted)]",
  active: "bg-green-900/30 text-green-400",
  closed: "bg-[var(--color-accent)] text-[var(--color-muted)]",
  funded: "bg-purple-900/30 text-purple-400",
};

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const raiseTypeLabel = (t: string): string => RAISE_TYPE_LABEL[t as RaiseType] ?? t;

// The backend `capital_raises` table has no pre-money column, so we stash the
// pre-money valuation inside the raise name as a machine-readable suffix and
// strip it for display. Real equity % = amount / (preMoney + amount).
const PM_RE = /\s*⟨pm:(\d+(?:\.\d+)?)⟩$/;
const encodeName = (name: string, preMoney: number): string =>
  preMoney > 0 ? `${name} ⟨pm:${preMoney}⟩` : name;
const decodeName = (raw: string): string => raw.replace(PM_RE, "").trim();
const decodePreMoney = (raw: string): number => {
  const m = raw.match(PM_RE);
  return m ? parseFloat(m[1]) : 0;
};
// equity% for a single ₹amount against a pre-money valuation (post-money method)
const equityPctOf = (amount: number, preMoney: number): number =>
  preMoney + amount > 0 ? (amount / (preMoney + amount)) * 100 : 0;

export default function CapitalPage() {
  // Raise-management writes (create / publish / add-investor) POST/PATCH to
  // owner/super_admin-only endpoints - an `investor` role 403s. Gate the write
  // controls on the effective role; everyone keeps the read-only raises view.
  const { effectiveRole } = useApp();
  const canManageRaises = effectiveRole === "owner" || effectiveRole === "super_admin";

  const [capTab, setCapTab] = useState<"raises" | "campaigns" | "runway" | "safe" | "grants" | "use-of-funds">("raises");
  const [showRaiseForm,   setShowRaiseForm]   = useState(false);
  const [showInvestForm,  setShowInvestForm]  = useState<string | null>(null);
  const [raiseType,       setRaiseType]       = useState<RaiseType>("equity");
  const [raiseName,       setRaiseName]       = useState("");
  const [target,          setTarget]          = useState("");
  const [preMoney,        setPreMoney]        = useState("");
  const [investorName,    setInvestorName]    = useState("");
  const [investorEmail,   setInvestorEmail]   = useState("");
  const [investAmount,    setInvestAmount]    = useState("");
  const [busy,            setBusy]            = useState(false);

  // Backend-backed state, with optimistic local updates.
  const [raises, setRaises] = useState<ApiRaise[]>([]);
  const [investorsByRaise, setInvestorsByRaise] = useState<Record<string, ApiInvestor[]>>({});

  // Load raises from the backend on mount; fall back to empty list if offline.
  useEffect(() => {
    let alive = true;
    api.get<ApiRaise[]>("/api/capital/raises")
      .then(rows => { if (alive) setRaises(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) toast.error("Couldn't load capital raises - working offline"); });
    return () => { alive = false; };
  }, []);

  // Lazy-load investors for a raise the first time its panel needs them.
  const loadInvestors = (raiseId: string) => {
    if (investorsByRaise[raiseId]) return;
    api.get<{ raise: ApiRaise; investors: ApiInvestor[] }>(`/api/capital/raises/${raiseId}`)
      .then(res => setInvestorsByRaise(prev => ({ ...prev, [raiseId]: res.investors ?? [] })))
      .catch(() => {/* non-fatal: list still renders without investor detail */});
  };

  const handleCreateRaise = async () => {
    const name = raiseName.trim();
    if (!name) { toast.error("Enter a name for the raise"); return; }
    const amt = parseFloat(target);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid target amount"); return; }
    const pm = parseFloat(preMoney) || 0;
    if (PRICED_TYPES.includes(raiseType) && pm <= 0) {
      toast.error("Enter a pre-money valuation to compute equity"); return;
    }
    setBusy(true);
    try {
      const created = await api.post<ApiRaise>("/api/capital/raises", {
        name: encodeName(name, pm),
        raise_type: raiseType,
        target_amount: amt,
      });
      setRaises(prev => [created, ...prev]);
      toast.success("Capital raise created");
      setShowRaiseForm(false); setRaiseName(""); setTarget(""); setPreMoney("");
    } catch {
      toast.error("Couldn't save the raise - check your connection");
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async (r: ApiRaise) => {
    const prev = raises;
    setRaises(rs => rs.map(x => x.id === r.id ? { ...x, status: "active" } : x)); // optimistic
    try {
      const updated = await api.patch<ApiRaise>(`/api/capital/raises/${r.id}`, { status: "active" });
      setRaises(rs => rs.map(x => x.id === r.id ? updated : x));
      toast.success("Raise published - now accepting investors");
    } catch {
      setRaises(prev); // rollback
      toast.error("Couldn't publish the raise");
    }
  };

  const handleInvest = async (raiseId: string) => {
    const name = investorName.trim();
    const amt = parseFloat(investAmount);
    if (!name) { toast.error("Enter the investor's name"); return; }
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid investment amount"); return; }
    setBusy(true);
    try {
      const inv = await api.post<ApiInvestor>(`/api/capital/raises/${raiseId}/investors`, {
        name, email: investorEmail.trim() || undefined, amount: amt, status: "committed",
      });
      setInvestorsByRaise(prev => ({ ...prev, [raiseId]: [inv, ...(prev[raiseId] ?? [])] }));
      // Reflect new raised_amount optimistically (backend recomputes the sum).
      setRaises(rs => rs.map(x => x.id === raiseId ? { ...x, raised_amount: num(x.raised_amount) + amt } : x));
      toast.success(`Commitment of ${formatCurrency(amt)} recorded`);
      setShowInvestForm(null); setInvestorName(""); setInvestorEmail(""); setInvestAmount("");
    } catch {
      toast.error("Couldn't record the investor - check your connection");
    } finally {
      setBusy(false);
    }
  };

  const totalInvestors = Object.values(investorsByRaise).reduce((a, list) => a + list.length, 0);
  const totalRaised = raises.reduce((a, r) => a + num(r.raised_amount), 0);
  const showPreMoney = PRICED_TYPES.includes(raiseType);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Capital</h1>
        {capTab === "raises" && canManageRaises && (
          <button onClick={() => setShowRaiseForm(v => !v)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
            <Plus size={12} /> New Raise
          </button>
        )}
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
        {([["raises", "Raises", Rocket], ["campaigns", "Crowdfunding", Megaphone], ["runway", "Runway Planner", Gauge], ["safe", "SAFE / Note Modeller", FileSignature], ["grants", "Grant / Subsidy Finder", Landmark], ["use-of-funds", "Use of Funds", Wallet]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setCapTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${capTab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      <AiInsight
        collapsed
        title="✨ AI insight - capital"
        question="Based on my capital structure and funding progress, what should I prioritise and what are the key risks or opportunities?"
        context={{
          totalRaised,
          activeRaises: raises.filter(r => r.status === "active").length,
          totalInvestors,
          raises: raises.slice(0, 20).map(r => ({
            name: decodeName(r.name),
            type: raiseTypeLabel(r.raise_type),
            status: r.status,
            target: num(r.target_amount),
            raised: num(r.raised_amount),
          })),
        }}
      />

      {capTab === "campaigns"    && <CampaignsTab />}
      {capTab === "runway"       && <RunwayExtensionPlanner />}
      {capTab === "safe"         && <SafeNoteModeller />}
      {capTab === "grants"       && <GrantSubsidyFinder />}
      {capTab === "use-of-funds" && <UseOfFundsTracker />}

      {capTab === "raises" && <>
      {/* Empty state */}
      {raises.length === 0 && !showRaiseForm && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Rocket size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">No capital raises yet</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-sm mx-auto">
            {canManageRaises
              ? "Pick an instrument - Equity, CCPS, SAFE, Convertible Note or Revenue-Based Financing - set a target in ₹, and start tracking investor commitments."
              : "No capital raises have been set up yet. They'll appear here once the owner creates one."}
          </p>
          {canManageRaises && (
            <button onClick={() => setShowRaiseForm(true)}
              className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">
              Start a Capital Raise
            </button>
          )}
        </div>
      )}

      {/* Stats - only when data exists */}
      {raises.length > 0 && (
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {[
            { label: "Active Raises",   value: raises.filter(r => r.status === "active").length.toString() },
            { label: "Total Raised",    value: formatCurrency(totalRaised) },
            { label: "Total Investors", value: totalInvestors.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
              <p className="text-xl font-bold text-[var(--color-primary)]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* New raise form */}
      {showRaiseForm && canManageRaises && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">New Capital Raise</h2>
          <input placeholder="Raise name (e.g. Seed 2026)" value={raiseName} onChange={e => setRaiseName(e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <select value={raiseType} onChange={e => setRaiseType(e.target.value as RaiseType)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            {RAISE_TYPES.map(v => <option key={v} value={v}>{RAISE_TYPE_LABEL[v]}</option>)}
          </select>
          <input placeholder="Target amount (₹)" type="number" min="1" value={target} onChange={e => setTarget(e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          {showPreMoney && (
            <div>
              <input placeholder="Pre-money valuation (₹)" type="number" min="1" value={preMoney} onChange={e => setPreMoney(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              {(parseFloat(target) > 0 && parseFloat(preMoney) > 0) && (
                <p className="text-[11px] text-[var(--color-muted)] mt-1">
                  At target, investors take <span className="font-semibold text-[var(--color-text)]">{equityPctOf(parseFloat(target), parseFloat(preMoney)).toFixed(2)}%</span> equity (post-money {formatCurrency(parseFloat(preMoney) + parseFloat(target))}).
                </p>
              )}
            </div>
          )}
          {!showPreMoney && (
            <p className="text-[11px] text-[var(--color-muted)]">{raiseTypeLabel(raiseType)} - no equity issued upfront, so no pre-money needed here.</p>
          )}
          <div className="flex gap-2">
            <button onClick={handleCreateRaise} disabled={busy} className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">{busy ? "Saving…" : "Create Raise"}</button>
            <button onClick={() => setShowRaiseForm(false)} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Raises list */}
      <div className="space-y-4">
        {raises.map(r => {
          const targetAmount = num(r.target_amount);
          const raisedAmount = num(r.raised_amount);
          const pm = decodePreMoney(r.name);
          const isPriced = PRICED_TYPES.includes(r.raise_type as RaiseType);
          const pct = targetAmount > 0 ? Math.min(100, (raisedAmount / targetAmount) * 100) : 0;
          const investors = investorsByRaise[r.id] ?? [];
          return (
            <div key={r.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mr-2 ${STATUS_COLOR[r.status]}`}>{r.status}</span>
                  <span className="text-sm font-medium">{decodeName(r.name)}</span>
                  <span className="text-xs text-[var(--color-muted)] ml-2">{raiseTypeLabel(r.raise_type)}</span>
                </div>
                {canManageRaises && (
                  <div className="flex gap-2 shrink-0">
                    {r.status === "draft" && (
                      <button onClick={() => handlePublish(r)} className="text-xs bg-green-900/40 text-green-400 border border-green-800/40 px-2 py-1 rounded hover:bg-green-900/60">Publish</button>
                    )}
                    {r.status === "active" && (
                      <button onClick={() => { const next = showInvestForm === r.id ? null : r.id; setShowInvestForm(next); if (next) loadInvestors(r.id); }} className="text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-1 rounded">+ Investor</button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-bold text-[var(--color-primary)]">{formatCurrency(raisedAmount)}</span>
                <span className="text-[var(--color-muted)]">of {formatCurrency(targetAmount)}</span>
              </div>
              <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                {pct.toFixed(0)}% funded · {investors.length} investor{investors.length === 1 ? "" : "s"}
                {isPriced && pm > 0 && <> · pre-money {formatCurrency(pm)} · {equityPctOf(targetAmount, pm).toFixed(2)}% equity at target</>}
              </p>

              {showInvestForm === r.id && canManageRaises && (
                <div className="mt-3 p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] space-y-2">
                  <input placeholder="Investor name" value={investorName} onChange={e => setInvestorName(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  <input placeholder="Investor email (optional)" type="email" value={investorEmail} onChange={e => setInvestorEmail(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  <input placeholder="Commitment (₹)" type="number" min="1" value={investAmount} onChange={e => setInvestAmount(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  {isPriced && pm > 0 && parseFloat(investAmount) > 0 && (
                    <p className="text-[11px] text-[var(--color-muted)]">≈ {equityPctOf(parseFloat(investAmount), pm).toFixed(2)}% equity (at {formatCurrency(pm)} pre-money).</p>
                  )}
                  <button onClick={() => handleInvest(r.id)} disabled={busy} className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-1.5 rounded text-sm hover:opacity-90 disabled:opacity-50">{busy ? "Saving…" : "Record Commitment"}</button>
                </div>
              )}

              {investors.length > 0 && (
                <div className="mt-3 space-y-1">
                  {investors.map(i => {
                    const amt = num(i.amount);
                    return (
                      <div key={i.id} className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                        <span>{i.name}{i.email ? ` · ${i.email}` : ""}</span>
                        <span>{formatCurrency(amt)}{isPriced && pm > 0 ? ` · ${equityPctOf(amt, pm).toFixed(2)}%` : ""} · <span className={i.status === "confirmed" ? "text-green-400" : "text-yellow-400"}>{i.status}</span></span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>}
    </div>
  );
}

// ── #105 RUNWAY-EXTENSION PLANNER ────────────────────────────────────────────
function RunwayExtensionPlanner() {
  const { store } = useApp();
  // Derive a sensible starting burn/cash from live data, editable by the user.
  const last90 = (() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    const txns = store.transactions.filter(t => new Date(t.date) >= cutoff);
    const out = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return Math.round(out / 3); // avg monthly outflow
  })();
  const cashOnHand = store.transactions.reduce((s, t) => s + t.amount, 0);

  const [cash,      setCash]      = useState(cashOnHand > 0 ? String(Math.round(cashOnHand)) : "");
  const [burn,      setBurn]      = useState(last90 > 0 ? String(last90) : "");
  const [target,    setTarget]    = useState("18");
  const [costCut,   setCostCut]   = useState("0");   // % monthly cost reduction
  const [raise,     setRaise]     = useState("0");   // one-time capital injection

  const c   = parseFloat(cash)    || 0;
  const b   = parseFloat(burn)    || 0;
  const tgt = parseFloat(target)  || 0;
  const cut = Math.min(100, Math.max(0, parseFloat(costCut) || 0));
  const inj = parseFloat(raise)   || 0;

  const adjustedBurn = b * (1 - cut / 100);
  const baseRunway   = b > 0 ? c / b : Infinity;
  const newCash      = c + inj;
  const newRunway    = adjustedBurn > 0 ? newCash / adjustedBurn : Infinity;
  const hitsTarget   = newRunway >= tgt;

  // Solve: extra one-time cash needed at current adjusted burn to hit target.
  const cashNeeded   = adjustedBurn > 0 ? Math.max(0, tgt * adjustedBurn - c) : 0;
  // Solve: % cost cut needed (no new raise) to hit target.
  const burnForTarget = tgt > 0 ? c / tgt : 0;
  const cutNeeded    = b > 0 && burnForTarget < b ? Math.round((1 - burnForTarget / b) * 100) : 0;

  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const months = (m: number) => m === Infinity ? "∞" : `${m.toFixed(1)} mo`;

  return (
    <section className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Runway-Extension Planner</h2>
          <p className="text-xs text-[var(--color-muted)] mt-1">Pull the cut-cost and raise-capital levers to hit your target runway. Cash &amp; burn pre-filled from your last 90 days - override anytime.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cash on hand (₹)</label><input type="number" min={0} value={cash} onChange={e => setCash(e.target.value)} placeholder="e.g. 5000000" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly burn (₹)</label><input type="number" min={0} value={burn} onChange={e => setBurn(e.target.value)} placeholder="e.g. 800000" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Target runway (months)</label><input type="number" min={0} value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 18" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Lever: cost cut (%)</label><input type="number" min={0} max={100} value={costCut} onChange={e => setCostCut(e.target.value)} placeholder="0" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Lever: capital raise (₹)</label><input type="number" min={0} value={raise} onChange={e => setRaise(e.target.value)} placeholder="0" className={inp} /></div>
        </div>
      </div>

      {b > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Current runway",    value: months(baseRunway),  color: "text-[var(--color-muted)]" },
            { label: "Adjusted burn",     value: fc(Math.round(adjustedBurn)), color: "text-blue-400" },
            { label: "Projected runway",  value: months(newRunway),   color: hitsTarget ? "text-green-400" : "text-orange-400" },
            { label: "Vs target",         value: hitsTarget ? `+${(newRunway - tgt).toFixed(1)} mo` : `${(newRunway - tgt).toFixed(1)} mo`, color: hitsTarget ? "text-green-400" : "text-red-400" },
          ].map(c2 => (
            <div key={c2.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c2.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c2.color}`}>{c2.value}</p>
            </div>
          ))}
        </div>
      )}

      {b > 0 && tgt > 0 && (
        <div className={`rounded-lg p-4 border ${hitsTarget ? "border-green-800/40 bg-green-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
          <p className={`text-sm font-bold mb-2 ${hitsTarget ? "text-green-400" : "text-orange-400"}`}>
            {hitsTarget ? `✓ Plan reaches ${tgt} months of runway` : `⚠ Plan falls short of ${tgt} months - close the gap with either lever:`}
          </p>
          {!hitsTarget && (
            <ul className="space-y-1 text-xs text-[var(--color-muted)]">
              <li>• Raise an extra <span className="font-semibold text-[var(--color-text)]">{fc(Math.round(cashNeeded))}</span> at the current adjusted burn, or</li>
              <li>• Cut monthly costs by <span className="font-semibold text-[var(--color-text)]">{cutNeeded}%</span> (with no new raise).</li>
            </ul>
          )}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Runway = cash ÷ monthly burn. Cost-cut reduces burn proportionally; a raise is a one-time cash injection. Excludes revenue growth and timing - treat as a planning estimate.</p>
    </section>
  );
}

// ── #106 SAFE / CONVERTIBLE-NOTE MODELLER ────────────────────────────────────
function SafeNoteModeller() {
  const [instrument, setInstrument] = useState<"safe" | "note">("safe");
  const [invest,    setInvest]    = useState("");      // investment amount
  const [cap,       setCap]       = useState("");      // valuation cap
  const [discount,  setDiscount]  = useState("20");    // discount %
  const [round,     setRound]     = useState("");      // priced-round pre-money valuation
  const [preShares, setPreShares] = useState("10000000"); // fully-diluted shares pre-round
  const [interest,  setInterest]  = useState("8");     // note interest %
  const [years,     setYears]     = useState("1.5");   // note term to conversion

  const inv  = parseFloat(invest)   || 0;
  const capV = parseFloat(cap)      || 0;
  const disc = Math.min(100, Math.max(0, parseFloat(discount) || 0));
  const rnd  = parseFloat(round)    || 0;
  const sh   = parseFloat(preShares) || 0;
  const intR = parseFloat(interest) || 0;
  const yrs  = parseFloat(years)    || 0;

  // Convertible notes accrue interest; SAFEs do not.
  const principalPlusInterest = instrument === "note" ? inv * (1 + (intR / 100) * yrs) : inv;

  // Price per share in the priced round (pre-money / pre-round fully-diluted shares).
  const roundPPS = sh > 0 && rnd > 0 ? rnd / sh : 0;
  // Discount price and cap price; investor converts at the lower (better) of the two.
  const discountPPS = roundPPS > 0 ? roundPPS * (1 - disc / 100) : 0;
  const capPPS      = capV > 0 && sh > 0 ? capV / sh : 0;
  const candidates  = [discountPPS, capPPS].filter(p => p > 0);
  const conversionPPS = candidates.length ? Math.min(...candidates) : 0;
  const sharesIssued  = conversionPPS > 0 ? principalPlusInterest / conversionPPS : 0;
  const effValuation  = conversionPPS > 0 ? conversionPPS * sh : 0;
  const ownershipPct   = sh > 0 && sharesIssued > 0 ? (sharesIssued / (sh + sharesIssued)) * 100 : 0;
  const usedCap = capPPS > 0 && capPPS <= discountPPS;

  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <section className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2"><FileSignature size={14} className="text-[var(--color-primary)]" /> SAFE / Convertible-Note Modeller</h2>
          <div className="flex gap-2">
            {(["safe", "note"] as const).map(t => (
              <button key={t} onClick={() => setInstrument(t)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors ${instrument === t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                {t === "safe" ? "SAFE" : "Convertible Note"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Models conversion at the next priced round. Investor converts at the lower of the discount price and the cap price.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Investment (₹)</label><input type="number" min={0} value={invest} onChange={e => setInvest(e.target.value)} placeholder="e.g. 5000000" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Valuation cap (₹)</label><input type="number" min={0} value={cap} onChange={e => setCap(e.target.value)} placeholder="e.g. 80000000" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Discount (%)</label><input type="number" min={0} max={100} value={discount} onChange={e => setDiscount(e.target.value)} placeholder="20" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Priced-round pre-money (₹)</label><input type="number" min={0} value={round} onChange={e => setRound(e.target.value)} placeholder="e.g. 200000000" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Pre-round shares (FD)</label><input type="number" min={0} value={preShares} onChange={e => setPreShares(e.target.value)} placeholder="e.g. 10000000" className={inp} /></div>
          {instrument === "note" && <>
            <div><label className="text-xs text-[var(--color-muted)] block mb-1">Interest p.a. (%)</label><input type="number" min={0} value={interest} onChange={e => setInterest(e.target.value)} placeholder="8" className={inp} /></div>
            <div><label className="text-xs text-[var(--color-muted)] block mb-1">Term to conversion (yrs)</label><input type="number" min={0} step="0.5" value={years} onChange={e => setYears(e.target.value)} placeholder="1.5" className={inp} /></div>
          </>}
        </div>
      </div>

      {inv > 0 && rnd > 0 && sh > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Amount converting", value: fc(Math.round(principalPlusInterest)), color: "text-[var(--color-primary)]" },
            { label: "Conversion price/sh", value: conversionPPS > 0 ? `₹${conversionPPS.toFixed(3)}` : "-", color: "text-blue-400" },
            { label: "Shares issued", value: Math.round(sharesIssued).toLocaleString("en-IN"), color: "text-[var(--color-text)]" },
            { label: "Ownership", value: `${ownershipPct.toFixed(2)}%`, color: "text-orange-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {inv > 0 && rnd > 0 && sh > 0 && conversionPPS > 0 && (
        <div className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-accent)]/40">
          <p className="text-sm font-semibold mb-1">
            Converts via the <span className="text-[var(--color-primary)]">{usedCap ? "valuation cap" : `${disc}% discount`}</span> ({usedCap ? "cap price is the lower of the two" : "discount price beats the cap"}).
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            Effective pre-money for this investor: {fc(Math.round(effValuation))}.
            {usedCap ? " The cap protects against a high round price." : " No cap benefit at this round price."}
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Simplified pre-money method: ignores the new-money and option-pool shuffle and any MFN/pro-rata terms. SAFEs do not accrue interest; notes do. Use for indicative dilution only.</p>
    </section>
  );
}

// ── #107 GRANT / SUBSIDY FINDER (MSME schemes) ───────────────────────────────
type Scheme = {
  name: string; level: "Central" | "State"; benefit: string;
  test: (p: GrantProfile) => boolean; why: string;
};
type GrantProfile = {
  udyam: boolean; category: "micro" | "small" | "medium";
  manufacturing: boolean; women: boolean; sc_st: boolean;
  exporter: boolean; tech: boolean; ageYears: number; dpiit: boolean;
};
const GRANT_SCHEMES: Scheme[] = [
  { name: "CGTMSE Collateral-Free Credit Guarantee", level: "Central", benefit: "Up to ₹5 cr collateral-free term/working-capital loan", why: "Udyam-registered micro/small enterprise", test: p => p.udyam && p.category !== "medium" },
  { name: "PMEGP (Margin-Money Subsidy)", level: "Central", benefit: "15-35% capital subsidy on new manufacturing/service units", why: "New manufacturing unit, Udyam-eligible", test: p => p.manufacturing && p.ageYears <= 1 },
  { name: "Credit-Linked Capital Subsidy (CLCSS)", level: "Central", benefit: "15% subsidy (cap ₹15 lakh) on plant & machinery upgrade", why: "Manufacturing MSME upgrading technology", test: p => p.manufacturing && p.tech },
  { name: "Startup India Seed Fund (DPIIT)", level: "Central", benefit: "Up to ₹50 lakh seed funding / grant", why: "DPIIT-recognised startup, under 2 years old", test: p => p.dpiit && p.ageYears <= 2 },
  { name: "Stand-Up India", level: "Central", benefit: "₹10 lakh-₹1 cr loan for greenfield enterprise", why: "Women / SC-ST entrepreneur, manufacturing or services", test: p => (p.women || p.sc_st) && p.ageYears <= 1 },
  { name: "MSE-CDP / Export Promotion (MEIS-successor)", level: "Central", benefit: "Market-access & export-incentive support", why: "Exporting MSME", test: p => p.exporter && p.udyam },
  { name: "State Capital-Investment Subsidy", level: "State", benefit: "10-25% subsidy on fixed-capital investment (state-specific)", why: "Manufacturing unit registered in a state MSME policy", test: p => p.manufacturing && p.udyam },
  { name: "State Power-Tariff / SGST Reimbursement", level: "State", benefit: "Electricity-duty exemption & SGST reimbursement for early years", why: "New manufacturing unit in eligible district", test: p => p.manufacturing && p.ageYears <= 3 },
];
function GrantSubsidyFinder() {
  const [p, setP] = useState<GrantProfile>({
    udyam: true, category: "micro", manufacturing: true, women: false,
    sc_st: false, exporter: false, tech: false, ageYears: 1, dpiit: false,
  });
  const eligible = GRANT_SCHEMES.filter(s => s.test(p));
  const set = <K extends keyof GrantProfile>(k: K, v: GrantProfile[K]) => setP(prev => ({ ...prev, [k]: v }));
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const toggles: [keyof GrantProfile, string][] = [
    ["udyam", "Udyam (MSME) registered"], ["manufacturing", "Manufacturing unit"],
    ["women", "Women-led"], ["sc_st", "SC/ST entrepreneur"],
    ["exporter", "Exporter"], ["tech", "Upgrading plant/technology"], ["dpiit", "DPIIT-recognised startup"],
  ];

  return (
    <section className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Grant / Subsidy Finder</h2>
          <p className="text-xs text-[var(--color-muted)] mt-1">Tick what applies to your enterprise to surface central &amp; state MSME schemes you likely qualify for.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">MSME category</label>
            <select value={p.category} onChange={e => set("category", e.target.value as GrantProfile["category"])} className={inp}>
              <option value="micro">Micro</option><option value="small">Small</option><option value="medium">Medium</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Years in operation</label>
            <input type="number" min={0} value={p.ageYears} onChange={e => set("ageYears", parseFloat(e.target.value) || 0)} className={inp} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {toggles.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={p[k] as boolean} onChange={e => set(k, e.target.checked as never)} className="accent-[var(--color-primary)]" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold mb-3">{eligible.length} scheme{eligible.length === 1 ? "" : "s"} matched</p>
        {eligible.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No schemes matched - get Udyam-registered and revisit; most central subsidies require it.</p>
        ) : (
          <div className="space-y-2">
            {eligible.map(s => (
              <div key={s.name} className="flex items-start gap-3 p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 mt-0.5 ${s.level === "Central" ? "bg-blue-950/30 text-blue-400 border-blue-800/40" : "bg-purple-950/30 text-purple-400 border-purple-800/40"}`}>{s.level}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-[var(--color-primary)] mt-0.5">{s.benefit}</p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">Why you qualify: {s.why}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Indicative eligibility only - final approval depends on scheme guidelines, district notifications &amp; documentation. State subsidies vary by state policy. Verify on the relevant portal before applying.</p>
    </section>
  );
}

// ── #108 USE-OF-FUNDS TRACKER ────────────────────────────────────────────────
type FundLine = { id: string; category: string; committed: number; deployed: number };
function UseOfFundsTracker() {
  const [lines, setLines] = useFeatureState<FundLine[]>("capital-use-of-funds", []);
  const [raised, setRaised] = useFeatureState<string>("capital-total-raised", "");
  const [cat, setCat] = useState("");
  const [committed, setCommitted] = useState("");
  const [deployed, setDeployed] = useState("");

  const totalRaised    = parseFloat(raised) || 0;
  const totalCommitted = lines.reduce((s, l) => s + l.committed, 0);
  const totalDeployed  = lines.reduce((s, l) => s + l.deployed, 0);
  const uncommitted    = totalRaised - totalCommitted;
  const remaining      = totalCommitted - totalDeployed;

  const addLine = () => {
    const cm = parseFloat(committed) || 0;
    const dp = parseFloat(deployed) || 0;
    if (!cat.trim() || cm <= 0) { toast.error("Enter a category and committed amount"); return; }
    if (dp > cm) { toast.error("Deployed cannot exceed committed"); return; }
    setLines(prev => [...prev, { id: generateId(), category: cat.trim(), committed: cm, deployed: dp }]);
    setCat(""); setCommitted(""); setDeployed("");
    toast.success("Allocation added");
  };

  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <section className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Use-of-Funds Tracker</h2>
          <p className="text-xs text-[var(--color-muted)] mt-1">Track committed vs deployed vs remaining capital against the total you raised.</p>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Total capital raised (₹)</label>
          <input type="number" min={0} value={raised} onChange={e => setRaised(e.target.value)} placeholder="e.g. 50000000" className={inp} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="md:col-span-2"><label className="text-xs text-[var(--color-muted)] block mb-1">Allocation category</label><input value={cat} onChange={e => setCat(e.target.value)} placeholder="e.g. Hiring / Marketing" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Committed (₹)</label><input type="number" min={0} value={committed} onChange={e => setCommitted(e.target.value)} placeholder="0" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Deployed (₹)</label><input type="number" min={0} value={deployed} onChange={e => setDeployed(e.target.value)} placeholder="0" className={inp} /></div>
        </div>
        <button onClick={addLine} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add allocation</button>
      </div>

      {totalRaised > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Committed",   value: fc(totalCommitted), color: "text-blue-400" },
            { label: "Deployed",    value: fc(totalDeployed),  color: "text-orange-400" },
            { label: "Remaining (committed)", value: fc(remaining), color: "text-yellow-400" },
            { label: "Uncommitted", value: fc(uncommitted), color: uncommitted < 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {totalRaised > 0 && uncommitted < 0 && (
        <div className="rounded-lg p-3 border border-red-800/40 bg-red-950/20 text-xs text-red-400 font-medium">
          ⚠ Over-committed by {fc(Math.abs(uncommitted))} - allocations exceed total capital raised.
        </div>
      )}

      {lines.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Category", "Committed", "Deployed", "Remaining", "Progress", ""].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {lines.map(l => {
                  const pct = l.committed > 0 ? Math.min(100, (l.deployed / l.committed) * 100) : 0;
                  return (
                    <tr key={l.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 font-medium text-xs">{l.category}</td>
                      <td className="px-3 py-2.5 tabular-nums text-xs">{fc(l.committed)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-xs text-orange-400">{fc(l.deployed)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-xs text-yellow-400">{fc(l.committed - l.deployed)}</td>
                      <td className="px-3 py-2.5 w-32">
                        <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-[var(--color-muted)]">{pct.toFixed(0)}% deployed</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => setLines(prev => prev.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Committed = earmarked for a purpose; deployed = actually spent. Uncommitted = raised minus committed - capital still free to allocate.</p>
    </section>
  );
}
