import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Gauge, TrendingUp, ArrowRight, Loader2 } from "lucide-react";

/**
 * Financing readiness — the embedded-working-capital wedge. Runs the same live
 * underwriting engine the lender uses (GET /api/credit/score: revenue, consistency,
 * runway, debt-service, payment behaviour) but PROACTIVELY, before any application,
 * so the owner sees "you're financing-ready for ₹X" + how to lift the score. Pairs
 * with the Forecast shortfall card ("shortfall on [date] → draw here").
 */
interface ScoreResult {
  score: number;
  approved_amount: number;
  recommended_product?: string;
  breakdown?: {
    monthly_revenue?: number;
    runway_months?: number;
    debt_service_ratio?: number;
    signals?: Record<string, number>;
  };
}

const SIGNAL_TIP: Record<string, string> = {
  s1: "Grow monthly revenue — higher, steadier sales lift eligibility most.",
  s2: "Even out month-to-month inflows — lumpy revenue lowers the score.",
  s3: "Business age helps — the score climbs past 12 months of history.",
  s4: "Reduce customer concentration — spread revenue across more customers.",
  s5: "Avoid overdrafts / negative balances on your accounts.",
  s6: "Bring down your debt-service ratio — pay down existing loans.",
  s7: "Extend cash runway above ~3 months of buffer.",
  s8: "Keep outgoing payments consistent and on time.",
};

export default function FinancingReadiness({ onApply }: { onApply?: () => void }) {
  const [data, setData] = useState<ScoreResult | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "forbidden" | "error">("loading");

  useEffect(() => {
    let on = true;
    api.get<ScoreResult>("/api/credit/score")
      .then(r => { if (on) { setData(r); setState("ok"); } })
      .catch(e => { if (on) setState(String(e?.message || "").includes("403") ? "forbidden" : "error"); });
    return () => { on = false; };
  }, []);

  if (state === "loading") return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 flex items-center gap-2 text-sm text-[var(--color-muted)]">
      <Loader2 size={14} className="animate-spin" /> Checking your financing readiness…
    </div>
  );
  if (state === "forbidden") return null; // only owner/admin can see the readiness score
  if (state === "error" || !data) return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-xs text-[var(--color-muted)]">
      Couldn't compute financing readiness right now — add a few months of transactions and bank balances, then refresh.
    </div>
  );

  const score = Math.round(data.score || 0);
  const band = score >= 75 ? { label: "Excellent", color: "text-green-400", ring: "border-green-500/40" }
    : score >= 60 ? { label: "Strong", color: "text-green-400", ring: "border-green-500/40" }
    : score >= 45 ? { label: "Building", color: "text-yellow-400", ring: "border-yellow-500/40" }
    : { label: "Early-stage", color: "text-orange-400", ring: "border-orange-500/40" };
  const signals = data.breakdown?.signals || {};
  const tips = Object.entries(signals)
    .filter(([k]) => SIGNAL_TIP[k])
    .sort((a, b) => (a[1] as number) - (b[1] as number))
    .slice(0, 2)
    .map(([k]) => SIGNAL_TIP[k]);

  return (
    <div className={`rounded-xl border ${band.ring} bg-[var(--color-surface)] p-5`}>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`w-16 h-16 rounded-full border-4 ${band.ring} flex items-center justify-center shrink-0`}>
            <span className={`text-xl font-bold tabular-nums ${band.color}`}>{score}</span>
          </div>
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5"><Gauge size={15} className="text-[var(--color-primary)]" /> Financing readiness</p>
            <p className={`text-xs font-medium ${band.color}`}>{band.label}</p>
          </div>
        </div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-[11px] text-[var(--color-muted)]">Indicative eligibility</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(data.approved_amount || 0))}</p>
          {data.recommended_product && <p className="text-[11px] text-[var(--color-muted)] mt-0.5 capitalize">Best fit: {String(data.recommended_product).replace(/_/g, " ")}</p>}
        </div>
        <button onClick={onApply}
          className="inline-flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 self-center">
          See loan options <ArrowRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        {[
          { label: "Monthly revenue", value: formatCurrency(Math.round(data.breakdown?.monthly_revenue || 0)) },
          { label: "Cash runway", value: `${data.breakdown?.runway_months ?? "—"} mo` },
          { label: "Debt-service ratio", value: `${Math.round((data.breakdown?.debt_service_ratio ?? 0) * 100)}%` },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[11px] text-[var(--color-muted)]">{s.label}</p>
            <p className="text-sm font-bold tabular-nums mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {tips.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] flex items-center gap-1 mb-1"><TrendingUp size={12} /> Lift your score</p>
          <ul className="space-y-1">
            {tips.map((t, i) => <li key={i} className="text-xs text-[var(--color-muted)] flex gap-1.5"><span className="text-[var(--color-primary)]">•</span> {t}</li>)}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Computed live from your cash flows on the same engine lenders underwrite on — no document uploads. Indicative only; final terms depend on the lender.</p>
    </div>
  );
}
