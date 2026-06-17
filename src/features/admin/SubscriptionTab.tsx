import { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  Check,
  Minus,
  Download,
  Users,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { PLAN_LABEL, type PlanTier } from "@/data/types";

// ── Endpoint shapes ─────────────────────────────────────────────────────────
interface Subscription {
  tenant_id: string;
  plan: PlanTier;
  status: string;
  price_monthly_inr: number;
  cycle: "monthly";
  renewal: string | null;
  provider: string | null;
  seats: { used: number; limit: number };
}

interface Invoice {
  id: string;
  date: string;
  description: string;
  amount_inr: number;
  status: string;
}

interface PaymentMethod {
  method: null | { brand: string; last4: string; exp: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const PLAN_BADGE: Record<PlanTier, string> = {
  free: "bg-zinc-800/60 text-zinc-300 border-zinc-600/40",
  starter: "bg-blue-900/30 text-blue-300 border-blue-700/40",
  growth: "bg-purple-900/30 text-purple-300 border-purple-700/40",
  pro: "bg-amber-900/30 text-amber-300 border-amber-700/40",
};

function statusPill(status: string): { cls: string; label: string } {
  const s = status.toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "active") return { cls: "bg-green-900/30 text-green-300 border-green-700/40", label: "Active" };
  if (s === "trialling" || s === "trialing" || s === "trial")
    return { cls: "bg-amber-900/30 text-amber-300 border-amber-700/40", label: "Trialling" };
  if (s === "past_due" || s === "pastdue")
    return { cls: "bg-red-900/30 text-red-300 border-red-700/40", label: "Past due" };
  if (s === "cancelled" || s === "canceled")
    return { cls: "bg-zinc-800/60 text-zinc-300 border-zinc-600/40", label: "Cancelled" };
  return { cls: "bg-zinc-800/60 text-zinc-300 border-zinc-600/40", label: status || "—" };
}

function invoiceStatusPill(status: string): { cls: string; label: string } {
  const s = status.toLowerCase();
  if (s === "paid") return { cls: "bg-green-900/30 text-green-300 border-green-700/40", label: "Paid" };
  if (s === "pending") return { cls: "bg-amber-900/30 text-amber-300 border-amber-700/40", label: "Pending" };
  if (s === "failed") return { cls: "bg-red-900/30 text-red-300 border-red-700/40", label: "Failed" };
  return { cls: "bg-zinc-800/60 text-zinc-300 border-zinc-600/40", label: status || "—" };
}

// ── Plan comparison matrix ──────────────────────────────────────────────────
const PLAN_COLS: { id: PlanTier; price: string; seats: string }[] = [
  { id: "free", price: "₹0", seats: "1 seat" },
  { id: "starter", price: "₹799", seats: "2 seats" },
  { id: "growth", price: "₹2,499", seats: "5 seats" },
  { id: "pro", price: "₹5,999", seats: "10 seats" },
];

// Each row: which plans include the feature.
const FEATURE_ROWS: { label: string; on: Record<PlanTier, boolean> }[] = [
  { label: "Cash Forecast",     on: { free: true,  starter: true,  growth: true,  pro: true } },
  { label: "Cash Health",       on: { free: true,  starter: true,  growth: true,  pro: true } },
  { label: "Analytics",         on: { free: false, starter: false, growth: true,  pro: true } },
  { label: "Payroll",           on: { free: false, starter: false, growth: true,  pro: true } },
  { label: "Credit & Lending",  on: { free: false, starter: false, growth: false, pro: true } },
  { label: "AI CFO brief",      on: { free: false, starter: false, growth: true,  pro: true } },
  { label: "Connectors",        on: { free: true,  starter: true,  growth: true,  pro: true } },
  { label: "Priority support",  on: { free: false, starter: false, growth: false, pro: true } },
  { label: "SLA",               on: { free: false, starter: false, growth: false, pro: true } },
];

// ── Small primitives ─────────────────────────────────────────────────────────
function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--color-border)] ${className}`} />;
}

function ProgressBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-[var(--color-bg)] overflow-hidden">
      <div
        className="h-full rounded-full bg-[var(--color-primary)] transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  muted,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--color-muted)] mb-2">
        <Icon size={14} />
        {label}
      </div>
      <div className={`text-xl font-semibold ${muted ? "text-[var(--color-muted)]" : "text-[var(--color-text)]"}`}>
        {value}
      </div>
      {sub && <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{sub}</p>}
      {children}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function SubscriptionTab() {
  const { selectedClientTenantId } = useApp();
  const q = selectedClientTenantId ? `?tenant_id=${encodeURIComponent(selectedClientTenantId)}` : "";

  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [pm, setPm] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, inv, p] = await Promise.all([
        api.get<Subscription>(`/api/admin/subscription${q}`),
        api.get<Invoice[]>(`/api/admin/subscription/invoices${q}`),
        api.get<PaymentMethod>(`/api/admin/subscription/payment-method${q}`),
      ]);
      setSub(s);
      setInvoices(inv);
      setPm(p);
    } catch {
      toast.error("Couldn't load subscription details");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (loading || !sub) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <SkeletonBar className="h-6 w-40 mb-3" />
          <SkeletonBar className="h-10 w-56 mb-4" />
          <SkeletonBar className="h-3 w-full max-w-md mb-2" />
          <SkeletonBar className="h-3 w-2/3" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <SkeletonBar className="h-3 w-20 mb-3" />
              <SkeletonBar className="h-6 w-24" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <SkeletonBar className="h-4 w-48 mb-4" />
          <SkeletonBar className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const { plan, status, price_monthly_inr, renewal, seats } = sub;
  const annualPrice = price_monthly_inr * 12 * 0.8;
  const displayPrice = billingCycle === "annual" ? inr(annualPrice) : inr(price_monthly_inr);
  const priceSuffix = billingCycle === "annual" ? "/yr" : "/mo";
  const status_ = statusPill(status);
  const isUpgradeable = plan === "free" || plan === "starter";

  return (
    <div className="space-y-6">
      {/* ── A) Current Plan ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-semibold text-[var(--color-text)]">{PLAN_LABEL[plan]}</h2>
              <span className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${PLAN_BADGE[plan]}`}>
                {PLAN_LABEL[plan]}
              </span>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${status_.cls}`}>
                {status_.label}
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-[var(--color-text)]">{displayPrice}</span>
              <span className="text-sm text-[var(--color-muted)]">{priceSuffix}</span>
              {billingCycle === "annual" && (
                <span className="text-[11px] font-semibold text-green-300">save 20%</span>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Renews on {fmtDate(renewal)}</p>

            {/* Billing-cycle toggle */}
            <div className="mt-4 inline-flex rounded-lg border border-[var(--color-border)] p-0.5 bg-[var(--color-bg)]">
              {(["monthly", "annual"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setBillingCycle(c)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
                    billingCycle === c
                      ? "bg-[var(--color-primary)] text-white"
                      : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {c === "monthly" ? "Monthly" : "Annual (save 20%)"}
                </button>
              ))}
            </div>
          </div>

          {/* Seats + CTA */}
          <div className="w-full lg:w-72 shrink-0">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-2">
                <span>
                  {seats.used} of {seats.limit} seats used
                </span>
                <Users size={14} />
              </div>
              <ProgressBar used={seats.used} limit={seats.limit} />
            </div>
            <button
              onClick={() => toast("Opening billing…")}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-white font-semibold text-sm py-2.5 hover:opacity-90 transition"
            >
              {isUpgradeable ? <Sparkles size={15} /> : <CreditCard size={15} />}
              {isUpgradeable ? "Upgrade plan" : "Manage billing"}
            </button>
          </div>
        </div>
      </div>

      {/* ── B) Plan comparison ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Compare plans</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th className="text-left align-bottom pb-3 pr-4 w-44" />
                {PLAN_COLS.map((col) => {
                  const isCurrent = col.id === plan;
                  return (
                    <th
                      key={col.id}
                      className={`align-bottom pb-3 px-3 text-center ${
                        isCurrent ? "border-x border-t border-[var(--color-primary)] rounded-t-lg" : ""
                      }`}
                    >
                      {isCurrent && (
                        <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)] mb-1">
                          Current
                        </div>
                      )}
                      <div className="text-sm font-semibold text-[var(--color-text)]">{PLAN_LABEL[col.id]}</div>
                      <div className="text-base font-bold text-[var(--color-text)] mt-0.5">
                        {col.price}
                        <span className="text-[11px] font-normal text-[var(--color-muted)]">/mo</span>
                      </div>
                      <div className="text-[11px] text-[var(--color-muted)] mt-0.5">{col.seats}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row, ri) => (
                <tr key={row.label} className="border-t border-[var(--color-border)]">
                  <td className="py-2.5 pr-4 text-[var(--color-text)]">{row.label}</td>
                  {PLAN_COLS.map((col) => {
                    const isCurrent = col.id === plan;
                    const isLast = ri === FEATURE_ROWS.length - 1;
                    return (
                      <td
                        key={col.id}
                        className={`py-2.5 px-3 text-center ${
                          isCurrent ? `border-x border-[var(--color-primary)] ${isLast ? "" : ""}` : ""
                        }`}
                      >
                        {row.on[col.id] ? (
                          <Check size={16} className="inline text-[var(--color-primary)]" />
                        ) : (
                          <Minus size={16} className="inline text-[var(--color-muted)]" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Select-plan buttons */}
              <tr className="border-t border-[var(--color-border)]">
                <td className="py-3 pr-4" />
                {PLAN_COLS.map((col) => {
                  const isCurrent = col.id === plan;
                  if (col.id === "free") {
                    return (
                      <td
                        key={col.id}
                        className={`py-3 px-3 text-center align-top ${
                          isCurrent ? "border-x border-b border-[var(--color-primary)] rounded-b-lg" : ""
                        }`}
                      >
                        {isCurrent && (
                          <span className="text-[11px] font-semibold text-[var(--color-primary)]">Current</span>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col.id}
                      className={`py-3 px-3 text-center align-top ${
                        isCurrent ? "border-x border-b border-[var(--color-primary)] rounded-b-lg" : ""
                      }`}
                    >
                      <button
                        disabled={isCurrent}
                        onClick={() => toast(`Selecting ${PLAN_LABEL[col.id]} plan…`)}
                        className={`w-full text-xs font-semibold py-2 px-2 rounded-lg transition ${
                          isCurrent
                            ? "border border-[var(--color-primary)] text-[var(--color-primary)] cursor-default"
                            : "bg-[var(--color-primary)] text-white hover:opacity-90"
                        }`}
                      >
                        {isCurrent ? "Current" : "Select plan"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── C) Usage this period ────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Usage this period</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={Users} label="Seats" value={`${seats.used} / ${seats.limit}`}>
            <div className="mt-3">
              <ProgressBar used={seats.used} limit={seats.limit} />
            </div>
          </MetricCard>
          <MetricCard icon={Users} label="Active users" value={`${seats.used}`} sub="Provisioned seats in use" />
          <MetricCard icon={Sparkles} label="API calls" value="—" sub="Not metered yet" muted />
          <MetricCard icon={Download} label="Exports" value="—" sub="Not metered yet" muted />
        </div>
      </div>

      {/* ── D) Billing history ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Billing history</h3>
        {invoices && invoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--color-muted)]">
                  <th className="font-medium pb-2 pr-4">Date</th>
                  <th className="font-medium pb-2 pr-4">Description</th>
                  <th className="font-medium pb-2 pr-4">Amount</th>
                  <th className="font-medium pb-2 pr-4">Status</th>
                  <th className="font-medium pb-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((row) => {
                  const pill = invoiceStatusPill(row.status);
                  return (
                    <tr key={row.id} className="border-t border-[var(--color-border)]">
                      <td className="py-3 pr-4 text-[var(--color-text)] whitespace-nowrap">{fmtDate(row.date)}</td>
                      <td className="py-3 pr-4 text-[var(--color-text)]">{row.description}</td>
                      <td className="py-3 pr-4 text-[var(--color-text)] whitespace-nowrap">{inr(row.amount_inr)}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${pill.cls}`}>
                          {pill.label}
                        </span>
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => toast("Invoice download coming soon")}
                          aria-label="Download invoice"
                          className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
                        >
                          <Download size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-sm text-[var(--color-muted)]">No billing history yet.</div>
        )}
      </div>

      {/* ── E) Payment method ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Payment method</h3>
        {pm?.method ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
                <CreditCard size={18} className="text-[var(--color-primary)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {pm.method.brand} ending in {pm.method.last4}
                </p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">Expires {pm.method.exp}</p>
              </div>
            </div>
            <button
              onClick={() => toast("Card update coming soon")}
              className="text-xs font-semibold px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)] transition"
            >
              Update card
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-bg)] flex items-center justify-center shrink-0">
                <CreditCard size={18} className="text-[var(--color-muted)]" />
              </div>
              <p className="text-sm text-[var(--color-muted)]">No payment method on file</p>
            </div>
            <button
              onClick={() => toast("Add card coming soon")}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition"
            >
              Add card
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
