import { useState } from "react";
import { Lock, Sparkles, Check, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { FEATURE_PITCH, PLAN_LABEL, type PlanTier } from "@/data/types";
import { upgradePlan, regionCurrency } from "@/lib/billing";

const PRICE: Record<Exclude<PlanTier, "free">, { inr: string; usd: string }> = {
  growth: { inr: "₹999", usd: "$39" },
  pro:    { inr: "₹2,999", usd: "$99" },
};

/* Full-screen upsell shown by RouteGuard when the tenant's plan can't reach a
   premium feature. The carrot: clear value, social proof, one-click upgrade to
   Stripe Checkout. super_admin never sees this (handled upstream). */
export default function UpsellGate({ feature, requiredPlan }: { feature: string; requiredPlan: Exclude<PlanTier, "free"> }) {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const inr = regionCurrency() === "inr";
  const pitch = FEATURE_PITCH[feature] ?? { title: "This feature", blurb: "Unlock more of Headroom.", perks: [] };
  const price = PRICE[requiredPlan];
  const currentPlan = (user?.plan ?? "free") as PlanTier;

  const upgrade = async () => {
    setLoading(true);
    await upgradePlan(requiredPlan, { email: user?.email, name: user?.display_name, onComplete: refreshUser });
    setLoading(false); // reached after the Razorpay modal opens / closes
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        {/* Banner */}
        <div className="relative px-8 py-10 text-center border-b border-[var(--color-border)] bg-gradient-to-b from-[var(--color-primary)]/12 to-transparent">
          <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-[var(--color-primary)]/15 flex items-center justify-center">
            <Lock size={22} className="text-[var(--color-primary)]" />
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-primary)] mb-2">
            <Sparkles size={13} /> {PLAN_LABEL[requiredPlan]} plan
          </div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">{pitch.title}</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)] max-w-md mx-auto leading-relaxed">{pitch.blurb}</p>
        </div>

        {/* Perks + pricing */}
        <div className="px-8 py-8 grid md:grid-cols-2 gap-8 items-center">
          <ul className="space-y-3">
            {pitch.perks.map(p => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-[var(--color-text)]">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
                  <Check size={11} className="text-[var(--color-primary)]" />
                </span>
                {p}
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-[var(--color-border)] p-6 text-center">
            <div className="text-3xl font-semibold text-[var(--color-text)]">
              {inr ? price.inr : price.usd}<span className="text-sm font-normal text-[var(--color-muted)]">/mo</span>
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-1">billed yearly · cancel anytime</p>

            <button
              onClick={upgrade}
              disabled={loading}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] text-white font-semibold text-sm py-3 hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <>Upgrade to {PLAN_LABEL[requiredPlan]} <ArrowRight size={15} /></>}
            </button>
            <p className="text-[11px] text-[var(--color-muted)] mt-3">
              You're on the <span className="font-semibold capitalize">{PLAN_LABEL[currentPlan]}</span> plan · 🔒 UPI · cards · netbanking via Razorpay
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
