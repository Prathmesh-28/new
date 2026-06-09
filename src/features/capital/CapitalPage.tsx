import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import { Plus, Rocket } from "lucide-react";
import { toast } from "sonner";
import type { CapitalRaise } from "@/data/types";

const TRACK_LABEL: Record<CapitalRaise["track"], string> = {
  rev_share:  "Revenue Share ($10K–$500K)",
  reg_cf:     "Reg CF Equity (up to $5M)",
  reg_a_plus: "Reg A+ Mini-IPO (up to $75M)",
};

const STATUS_COLOR: Record<string, string> = {
  draft:  "bg-[var(--color-accent)] text-[var(--color-muted)]",
  active: "bg-green-900/30 text-green-400",
  closed: "bg-[var(--color-accent)] text-[var(--color-muted)]",
  funded: "bg-purple-900/30 text-purple-400",
};

export default function CapitalPage() {
  const { store, addCapitalRaise, updateCapitalRaise, addCapitalInvestment } = useApp();
  const { capitalRaises, capitalInvestments } = store;
  const [showRaiseForm,   setShowRaiseForm]   = useState(false);
  const [showInvestForm,  setShowInvestForm]  = useState<string | null>(null);
  const [track,           setTrack]           = useState<CapitalRaise["track"]>("reg_cf");
  const [target,          setTarget]          = useState("");
  const [investorEmail,   setInvestorEmail]   = useState("");
  const [investAmount,    setInvestAmount]    = useState("");

  const handleCreateRaise = () => {
    if (!target) { toast.error("Enter a target amount"); return; }
    const amt = parseFloat(target);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid target amount"); return; }
    addCapitalRaise({ id: generateId(), track, targetAmount: amt, raisedAmount: 0, status: "draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    toast.success("Capital raise created");
    setShowRaiseForm(false); setTarget("");
  };

  const handlePublish = (r: CapitalRaise) => {
    updateCapitalRaise({ ...r, status: "active", updatedAt: new Date().toISOString() });
    toast.success("Raise published — investor portal live");
  };

  const handleInvest = (raiseId: string) => {
    if (!investorEmail || !investAmount) { toast.error("Enter investor email and amount"); return; }
    const amt = parseFloat(investAmount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid investment amount"); return; }
    const raise = capitalRaises.find(r => r.id === raiseId)!;
    const equityPct = (amt / raise.targetAmount) * 10;
    addCapitalInvestment({ id: generateId(), raiseId, investorEmail, amount: amt, equityPct, status: "pending", createdAt: new Date().toISOString() });
    updateCapitalRaise({ ...raise, raisedAmount: raise.raisedAmount + amt, updatedAt: new Date().toISOString() });
    toast.success(`Investment of ${formatCurrency(amt)} recorded`);
    setShowInvestForm(null); setInvestorEmail(""); setInvestAmount("");
  };

  const totalRaised = capitalRaises.reduce((a, r) => a + r.raisedAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Capital Raising</h1>
        <button onClick={() => setShowRaiseForm(v => !v)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
          <Plus size={12} /> New Raise
        </button>
      </div>

      {/* Empty state */}
      {capitalRaises.length === 0 && !showRaiseForm && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Rocket size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">No capital raises yet</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-sm mx-auto">
            Choose a fundraising track — Revenue Share, Reg CF equity, or Reg A+ Mini-IPO — and start accepting investors.
          </p>
          <button onClick={() => setShowRaiseForm(true)}
            className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">
            Start a Capital Raise
          </button>
        </div>
      )}

      {/* Stats — only when data exists */}
      {capitalRaises.length > 0 && (
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {[
            { label: "Active Raises",   value: capitalRaises.filter(r => r.status === "active").length.toString() },
            { label: "Total Raised",    value: formatCurrency(totalRaised) },
            { label: "Total Investors", value: capitalInvestments.length.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
              <p className="text-xl font-bold text-[var(--color-primary)]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* New raise form */}
      {showRaiseForm && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">New Capital Raise</h2>
          <select value={track} onChange={e => setTrack(e.target.value as CapitalRaise["track"])}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            {(Object.entries(TRACK_LABEL) as [CapitalRaise["track"], string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder="Target amount (₹)" type="number" min="1" value={target} onChange={e => setTarget(e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <div className="flex gap-2">
            <button onClick={handleCreateRaise} className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded-lg text-sm hover:opacity-90">Create Raise</button>
            <button onClick={() => setShowRaiseForm(false)} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Raises list */}
      <div className="space-y-4">
        {capitalRaises.map(r => {
          const pct = r.targetAmount > 0 ? Math.min(100, (r.raisedAmount / r.targetAmount) * 100) : 0;
          const investors = capitalInvestments.filter(i => i.raiseId === r.id);
          return (
            <div key={r.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mr-2 ${STATUS_COLOR[r.status]}`}>{r.status}</span>
                  <span className="text-xs text-[var(--color-muted)]">{TRACK_LABEL[r.track]}</span>
                </div>
                <div className="flex gap-2">
                  {r.status === "draft" && (
                    <button onClick={() => handlePublish(r)} className="text-xs bg-green-900/40 text-green-400 border border-green-800/40 px-2 py-1 rounded hover:bg-green-900/60">Publish</button>
                  )}
                  {r.status === "active" && (
                    <button onClick={() => setShowInvestForm(showInvestForm === r.id ? null : r.id)} className="text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-1 rounded">+ Investor</button>
                  )}
                </div>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-bold text-[var(--color-primary)]">{formatCurrency(r.raisedAmount)}</span>
                <span className="text-[var(--color-muted)]">of {formatCurrency(r.targetAmount)}</span>
              </div>
              <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-1">{pct.toFixed(0)}% funded · {investors.length} investors</p>

              {showInvestForm === r.id && (
                <div className="mt-3 p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] space-y-2">
                  <input placeholder="Investor email" type="email" value={investorEmail} onChange={e => setInvestorEmail(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  <input placeholder="Investment (₹)" type="number" min="1" value={investAmount} onChange={e => setInvestAmount(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  <button onClick={() => handleInvest(r.id)} className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-1.5 rounded text-sm hover:opacity-90">Record Investment</button>
                </div>
              )}

              {investors.length > 0 && (
                <div className="mt-3 space-y-1">
                  {investors.map(i => (
                    <div key={i.id} className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                      <span>{i.investorEmail}</span>
                      <span>{formatCurrency(i.amount)} · {i.equityPct.toFixed(2)}% · <span className={i.status === "confirmed" ? "text-green-400" : "text-yellow-400"}>{i.status}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
