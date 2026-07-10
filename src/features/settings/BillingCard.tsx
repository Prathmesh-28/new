import { useState, useEffect, useCallback } from "react";
import { CreditCard, Check, Sparkles, Loader2, Clock, Gift, X, Download, Receipt } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PLAN_LABEL, PLAN_RANK, type PlanTier } from "@/data/types";
import {
  fetchBilling, fetchFoundingMemberStatus, upgradePlan, cancelSubscription, regionCurrency,
  fetchSubscriptionInvoices, downloadSubscriptionInvoice,
  type BillingState, type FoundingMemberStatus, type SubscriptionInvoice,
} from "@/lib/billing";

const PLANS: { id: Exclude<PlanTier, "free">; inr: number; usd: string; tagline: string }[] = [
  { id: "starter", inr: 799,  usd: "$9",  tagline: "Unlimited invoicing + WhatsApp/UPI collections & GST prep" },
  { id: "growth",  inr: 2499, usd: "$29", tagline: "Payroll, cash forecast, analytics & your AI CFO" },
  { id: "pro",     inr: 5999, usd: "$69", tagline: "Credit, treasury, valuation/cap-table & API" },
];
const ANNUAL_MONTHS_CHARGED = 10; // 2 months free
const FOUNDING_COUPON = "FOUNDING50";

function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

export default function BillingCard() {
  const { user, refreshUser } = useAuth();
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [founding, setFounding] = useState<FoundingMemberStatus | null>(null);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const inr = regionCurrency() === "inr";

  const load = useCallback(() => { fetchBilling().then(setBilling).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchFoundingMemberStatus().then(setFounding).catch(() => {}); }, []);
  useEffect(() => { fetchSubscriptionInvoices().then(setInvoices).catch(() => {}); }, [billing]);

  const plan = (billing?.plan ?? user?.plan ?? "free") as PlanTier;
  const rank = PLAN_RANK[plan];
  const trialDaysLeft = billing?.is_trialing ? daysLeft(billing.current_period_end) : 0;
  const applyFoundingCoupon = cycle === "annual" && !!founding && !founding.sold_out;

  const upgrade = async (id: Exclude<PlanTier, "free">) => {
    setBusy(id);
    await upgradePlan(id, {
      email: user?.email, name: user?.display_name, cycle,
      coupon: applyFoundingCoupon ? FOUNDING_COUPON : undefined,
      onComplete: () => { load(); refreshUser(); fetchFoundingMemberStatus().then(setFounding).catch(() => {}); },
    });
    setBusy(null);
  };

  const cancel = async () => {
    setBusy("cancel");
    await cancelSubscription(() => { load(); refreshUser(); });
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
                : `You're on ${PLAN_LABEL[plan]}.${billing?.current_period_end ? ` ${billing.status === "cancelled" ? "Access until" : "Renews"} ${new Date(billing.current_period_end).toLocaleDateString()}.` : ""}`}
            </p>
          </div>
        </div>
        {billing?.has_subscription && billing.status === "active" && (
          <button onClick={cancel} disabled={busy === "cancel"}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)] hover:text-red-400 px-2 py-1">
            {busy === "cancel" ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Cancel subscription
          </button>
        )}
      </div>

      {billing?.is_trialing && (
        <div className="mb-4 p-3 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-lg text-xs flex items-center gap-2">
          <Clock size={14} className="text-[var(--color-primary)] shrink-0" />
          <span><b>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left</b> in your free trial of {PLAN_LABEL["growth"]} - pick a plan below to keep everything after it ends.</span>
        </div>
      )}

      {billing && !billing.configured && (
        <div className="mb-4 p-3 bg-[var(--color-accent)] rounded-lg text-xs text-[var(--color-muted)]">
          Payments aren't enabled on this environment yet. Upgrades go live once <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> are set on the server.
        </div>
      )}

      <div className="flex items-center justify-center gap-1 mb-4 p-1 bg-[var(--color-accent)] rounded-lg w-fit mx-auto">
        <button onClick={() => setCycle("monthly")} className={`text-xs font-semibold px-3 py-1.5 rounded-md ${cycle === "monthly" ? "bg-[var(--color-surface)] shadow-sm" : "text-[var(--color-muted)]"}`}>Monthly</button>
        <button onClick={() => setCycle("annual")} className={`text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1 ${cycle === "annual" ? "bg-[var(--color-surface)] shadow-sm" : "text-[var(--color-muted)]"}`}>
          Annual <span className="text-[10px] text-[var(--color-primary)] font-bold">2 months free</span>
        </button>
      </div>

      {cycle === "annual" && founding && !founding.sold_out && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs flex items-center gap-2">
          <Gift size={14} className="text-amber-500 shrink-0" />
          <span><b>Founding-member offer applied:</b> 50% off your first annual term - {founding.remaining} of {founding.cap} spots left.</span>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {PLANS.map(p => {
          const isCurrent = plan === p.id;
          const isDowngrade = PLAN_RANK[p.id] < rank;
          const monthlyPrice = inr ? p.inr : null;
          const displayed = cycle === "annual" && monthlyPrice != null
            ? Math.round((applyFoundingCoupon ? monthlyPrice * ANNUAL_MONTHS_CHARGED * 0.5 : monthlyPrice * ANNUAL_MONTHS_CHARGED) / 12)
            : monthlyPrice;
          return (
            <div key={p.id} className={`rounded-xl border p-4 ${isCurrent ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5" : "border-[var(--color-border)]"}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  {p.id === "pro" && <Sparkles size={13} className="text-[var(--color-primary)]" />}
                  {PLAN_LABEL[p.id]}
                </span>
                <span className="text-sm font-bold">
                  {inr && displayed != null ? `₹${displayed.toLocaleString("en-IN")}` : p.usd}
                  <span className="text-[11px] font-normal text-[var(--color-muted)]">/mo</span>
                </span>
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

      <p className="text-[11px] text-[var(--color-muted)] mt-4 text-center">🔒 UPI Autopay · cards · netbanking · wallets - auto-renews securely via Razorpay, cancel anytime</p>

      {invoices.length > 0 && (
        <div className="mt-6 pt-5 border-t border-[var(--color-border)]">
          <h3 className="text-xs font-semibold flex items-center gap-1.5 mb-3"><Receipt size={13} /> GST invoices</h3>
          <div className="space-y-1.5">
            {invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-[var(--color-border)] last:border-0">
                <div className="min-w-0">
                  <p className="font-mono font-medium truncate">{inv.invoice_number}</p>
                  <p className="text-[var(--color-muted)]">{new Date(inv.created_at).toLocaleDateString("en-IN")} · {PLAN_LABEL[inv.plan as PlanTier] ?? inv.plan} ({inv.cycle})</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-semibold tabular-nums">₹{Number(inv.total_amount).toLocaleString("en-IN")}</span>
                  <button onClick={() => void downloadSubscriptionInvoice(inv)} className="text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="Download PDF">
                    <Download size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
