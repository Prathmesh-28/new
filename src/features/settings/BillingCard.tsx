import { useState, useEffect, useCallback } from "react";
import { CreditCard, Check, Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PLAN_LABEL, PLAN_RANK, type PlanTier } from "@/data/types";
import { fetchBilling, upgradePlan, regionCurrency, type BillingState } from "@/lib/billing";

const PLANS: { id: Exclude<PlanTier, "free">; inr: string; usd: string; tagline: string }[] = [
  { id: "starter", inr: "₹799",   usd: "$9",  tagline: "Unlimited invoicing + WhatsApp/UPI collections & GST prep" },
  { id: "growth",  inr: "₹2,499", usd: "$29", tagline: "Payroll, cash forecast, analytics & your AI CFO" },
  { id: "pro",     inr: "₹5,999", usd: "$69", tagline: "Credit, treasury, valuation/cap-table & API" },
];

export default function BillingCard() {
  const { user, refreshUser } = useAuth();
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inr = regionCurrency() === "inr";

  const load = useCallback(() => { fetchBilling().then(setBilling).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const plan = (billing?.plan ?? user?.plan ?? "free") as PlanTier;
  const rank = PLAN_RANK[plan];

  const upgrade = async (id: Exclude<PlanTier, "free">) => {
    setBusy(id);
    await upgradePlan(id, { email: user?.email, name: user?.display_name, onComplete: () => { load(); refreshUser(); } });
    setBusy(null);
  };

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
      </div>

      {billing && !billing.configured && (
        <div className="mb-4 p-3 bg-[var(--color-accent)] rounded-lg text-xs text-[var(--color-muted)]">
          Payments aren't enabled on this environment yet. Upgrades go live once <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> are set on the server.
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
                <div className="w-full text-center text-xs text-[var(--color-muted)] py-2">Included in your plan</div>
              ) : (
                <button onClick={() => upgrade(p.id)} disabled={busy === p.id || (billing != null && !billing.configured)}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-white py-2 rounded-lg hover:opacity-90 disabled:opacity-60">
                  {busy === p.id ? <Loader2 size={13} className="animate-spin" /> : `Upgrade to ${PLAN_LABEL[p.id]}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-[var(--color-muted)] mt-4 text-center">🔒 UPI · cards · netbanking · wallets - secure checkout by Razorpay</p>
    </div>
  );
}
