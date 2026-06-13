import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Check, Sparkles, ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PLAN_LABEL, PLAN_RANK, type PlanTier } from "@/data/types";
import { fetchBilling, startCheckout, confirmCheckout, openBillingPortal, regionCurrency, type BillingState } from "@/lib/billing";

const PLANS: { id: Exclude<PlanTier, "free">; inr: string; usd: string; tagline: string }[] = [
  { id: "growth", inr: "₹999",   usd: "$39", tagline: "Full visibility, benchmarks, scenarios & credit" },
  { id: "pro",    inr: "₹2,999", usd: "$99", tagline: "Capital raising, valuation & term sheets" },
];

export default function BillingCard() {
  const { user, refreshUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inr = regionCurrency() === "inr";

  const load = useCallback(() => { fetchBilling().then(setBilling).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  // Handle return from Stripe Checkout (success_url carries the session id).
  useEffect(() => {
    if (params.get("billing") === "success" && params.get("session_id")) {
      const sid = params.get("session_id")!;
      // Refresh both the billing card AND the AuthContext user so plan-gated
      // routes unlock immediately (no hard reload needed).
      confirmCheckout(sid).then(() => { load(); refreshUser(); });
      params.delete("billing"); params.delete("session_id");
      setParams(params, { replace: true });
    } else if (params.get("billing") === "cancelled") {
      params.delete("billing"); setParams(params, { replace: true });
    }
  }, [params, setParams, load, refreshUser]);

  const plan = (billing?.plan ?? user?.plan ?? "free") as PlanTier;
  const rank = PLAN_RANK[plan];

  const upgrade = async (id: Exclude<PlanTier, "free">) => { setBusy(id); await startCheckout(id, () => { load(); refreshUser(); }); setBusy(null); };
  const manage = async () => { setBusy("portal"); await openBillingPortal(); setBusy(null); };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
            <CreditCard size={16} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              Plan &amp; Billing
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                {PLAN_LABEL[plan]}
              </span>
            </h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {plan === "free"
                ? "You're on the free plan. Upgrade to unlock benchmarks, scenarios, valuation & capital."
                : `You're on ${PLAN_LABEL[plan]}.${billing?.current_period_end ? ` Renews ${new Date(billing.current_period_end).toLocaleDateString()}.` : ""}`}
            </p>
          </div>
        </div>
        {billing?.has_customer && (
          <button onClick={manage} disabled={busy === "portal"}
            className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-semibold hover:bg-[var(--color-accent)] disabled:opacity-50">
            {busy === "portal" ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />} Manage subscription
          </button>
        )}
      </div>

      {billing && !billing.configured && (
        <div className="mb-4 p-3 bg-[var(--color-accent)] rounded-lg text-xs text-[var(--color-muted)]">
          Payments aren't enabled on this environment yet (no Stripe key). Upgrade buttons are live once <code>STRIPE_SECRET_KEY</code> is set.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {PLANS.map(p => {
          const isCurrent = plan === p.id;
          const isDowngrade = PLAN_RANK[p.id] < rank;
          return (
            <div key={p.id} className={`rounded-xl border p-4 ${isCurrent ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5" : "border-[var(--color-border)]"}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  {p.id === "pro" && <Sparkles size={13} className="text-[var(--color-primary)]" />}
                  {PLAN_LABEL[p.id]}
                </span>
                <span className="text-sm font-bold">{inr ? p.inr : p.usd}<span className="text-[11px] font-normal text-[var(--color-muted)]">/mo</span></span>
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-1 mb-3 leading-relaxed">{p.tagline}</p>
              {isCurrent ? (
                <div className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] py-2">
                  <Check size={14} /> Current plan
                </div>
              ) : isDowngrade ? (
                <button onClick={manage} disabled={busy === "portal"}
                  className="w-full text-xs font-semibold border border-[var(--color-border)] py-2 rounded-lg hover:bg-[var(--color-accent)] disabled:opacity-50">
                  Manage in portal
                </button>
              ) : (
                <button onClick={() => upgrade(p.id)} disabled={busy === p.id}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-white py-2 rounded-lg hover:opacity-90 disabled:opacity-60">
                  {busy === p.id ? <Loader2 size={13} className="animate-spin" /> : `Upgrade to ${PLAN_LABEL[p.id]}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
