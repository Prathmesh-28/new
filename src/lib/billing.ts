import { api, authHeaders } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import { toast } from "sonner";
import type { PlanTier } from "@/data/types";
import { haptic } from "@/lib/mobile";

// India-first currency detection (kept for display; Razorpay subscriptions are INR).
export function regionCurrency(): "inr" | "usd" {
  if (typeof window === "undefined") return "inr";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana|Kentucky|Boise|Juneau|Sitka|Nome|Adak|Menominee|North_Dakota)/.test(tz)) return "usd";
    if (/Pacific\/(Honolulu|Pago_Pago)/.test(tz)) return "usd";
    const lang = (navigator.language || "").toLowerCase();
    if (lang === "en-us" || lang === "es-us") return "usd";
  } catch { /* ignore */ }
  return "inr";
}

export interface BillingState {
  plan: PlanTier;
  status: string | null;
  current_period_end: string | null;
  provider: string | null;
  is_trialing: boolean;
  cycle: "monthly" | "annual" | null;
  is_founding_member: boolean;
  has_subscription: boolean;
  configured: boolean; // Razorpay keys present on the server
}

export interface FoundingMemberStatus { cap: number; claimed: number; remaining: number; sold_out: boolean }

export async function fetchBilling(): Promise<BillingState> {
  return api.get<BillingState>("/api/billing/current");
}

export async function fetchFoundingMemberStatus(): Promise<FoundingMemberStatus> {
  return api.get<FoundingMemberStatus>("/api/billing/founding-member-status");
}

export interface SubscriptionInvoice {
  id: string; invoice_number: string; plan: string; cycle: string;
  base_amount: string; gst_amount: string; total_amount: string; created_at: string;
}

export async function fetchSubscriptionInvoices(): Promise<SubscriptionInvoice[]> {
  return api.get<SubscriptionInvoice[]>("/api/billing/invoices");
}

// Auth-gated PDF download - fetch as a blob (a plain <a href> can't carry the token).
export async function downloadSubscriptionInvoice(inv: SubscriptionInvoice): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/billing/invoices/${inv.id}/pdf`, { headers: authHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${inv.invoice_number}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    toast.error("Couldn't download the invoice.");
  }
}

// Unified upgrade entry point - real recurring billing (Razorpay Subscriptions +
// UPI Autopay/e-mandate): the customer authorizes once, Razorpay re-charges each
// cycle itself - no cron re-billing, no "forgot to renew" churn.
export async function upgradePlan(
  plan: Exclude<PlanTier, "free">,
  opts: { email?: string; name?: string; cycle?: "monthly" | "annual"; coupon?: string; onComplete?: () => void } = {},
): Promise<void> {
  return startSubscriptionCheckout(plan, { ...opts, cycle: opts.cycle ?? "monthly" });
}

// ── Razorpay Standard Checkout (legacy one-time order path - kept for anything
// still calling it directly; upgradePlan no longer uses this) ───────────────
interface RazorpaySuccess { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
interface RazorpaySubscriptionSuccess { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }
interface RazorpayInstance { open: () => void; on: (event: string, handler: (resp: { error?: { description?: string } }) => void) => void }
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let rzpScriptPromise: Promise<boolean> | null = null;
function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (rzpScriptPromise) return rzpScriptPromise;
  rzpScriptPromise = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { rzpScriptPromise = null; resolve(false); };
    document.body.appendChild(s);
  });
  return rzpScriptPromise;
}

// Create an order, open the Razorpay modal, verify the signature server-side, then
// reflect the upgrade. Handles user-dismiss and payment.failed gracefully.
export async function startRazorpayCheckout(
  plan: Exclude<PlanTier, "free">,
  opts: { email?: string; name?: string; onComplete?: () => void } = {},
): Promise<void> {
  try {
    haptic("medium");
    const order = await api.post<{ order_id: string; amount: number; currency: string; key_id: string }>(
      "/api/billing/razorpay/order", { plan },
    );
    const ready = await loadRazorpay();
    if (!ready || !window.Razorpay) {
      toast.error("Couldn't load Razorpay. Check your connection and try again.");
      return;
    }
    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: "Headroom",
      description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan`,
      order_id: order.order_id,
      prefill: { email: opts.email || undefined, name: opts.name || undefined },
      theme: { color: "#5FBE7C" },
      handler: async (resp: RazorpaySuccess) => {
        try {
          const v = await api.post<{ ok: boolean }>("/api/billing/razorpay/verify", {
            plan,
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          if (v.ok) { haptic("success"); toast.success("You're upgraded - welcome aboard! 🎉"); opts.onComplete?.(); }
          else { haptic("error"); toast.error("Payment couldn't be verified."); }
        } catch (e) {
          haptic("error");
          toast.error(apiMessage(e) || "Payment verification failed.");
        }
      },
      modal: { ondismiss: () => { /* user closed the modal - no charge */ } },
    });
    rzp.on("payment.failed", (resp) => {
      haptic("error");
      toast.error(resp?.error?.description || "Payment failed. Please try again.");
    });
    rzp.open();
  } catch (e) {
    toast.error(apiMessage(e) || "Couldn't start Razorpay checkout.");
  }
}

// Create a subscription, open Razorpay Checkout in subscription mode (the customer
// sets up UPI Autopay / an e-mandate on this first charge), verify server-side, then
// reflect the upgrade. Every later renewal is charged by Razorpay itself and applied
// by the webhook - nothing further to do client-side after this call succeeds.
export async function startSubscriptionCheckout(
  plan: Exclude<PlanTier, "free">,
  opts: { email?: string; name?: string; cycle?: "monthly" | "annual"; coupon?: string; onComplete?: () => void } = {},
): Promise<void> {
  try {
    haptic("medium");
    const cycle = opts.cycle ?? "monthly";
    const sub = await api.post<{ subscription_id: string; key_id: string; amount: number; founding_member: boolean }>(
      "/api/billing/razorpay/subscription", { plan, cycle, coupon: opts.coupon || undefined },
    );
    const ready = await loadRazorpay();
    if (!ready || !window.Razorpay) {
      toast.error("Couldn't load Razorpay. Check your connection and try again.");
      return;
    }
    const rzp = new window.Razorpay({
      key: sub.key_id,
      subscription_id: sub.subscription_id,
      name: "Headroom",
      description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan - ${cycle}${sub.founding_member ? " (founding member)" : ""}`,
      prefill: { email: opts.email || undefined, name: opts.name || undefined },
      theme: { color: "#5FBE7C" },
      handler: async (resp: RazorpaySubscriptionSuccess) => {
        try {
          const v = await api.post<{ ok: boolean }>("/api/billing/razorpay/subscription/verify", {
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_subscription_id: resp.razorpay_subscription_id,
            razorpay_signature: resp.razorpay_signature,
          });
          if (v.ok) { haptic("success"); toast.success("You're upgraded - welcome aboard! 🎉"); opts.onComplete?.(); }
          else { haptic("error"); toast.error("Payment couldn't be verified."); }
        } catch (e) {
          haptic("error");
          toast.error(apiMessage(e) || "Payment verification failed.");
        }
      },
      modal: { ondismiss: () => { /* user closed the modal - no charge, no mandate created */ } },
    });
    rzp.on("payment.failed", (resp) => {
      haptic("error");
      toast.error(resp?.error?.description || "Payment failed. Please try again.");
    });
    rzp.open();
  } catch (e) {
    toast.error(apiMessage(e) || "Couldn't start Razorpay checkout.");
  }
}

export async function cancelSubscription(onComplete?: () => void): Promise<void> {
  try {
    await api.post<{ ok: boolean }>("/api/billing/razorpay/subscription/cancel", {});
    toast.success("Subscription cancelled - you'll keep access until the current period ends.");
    onComplete?.();
  } catch (e) {
    toast.error(apiMessage(e) || "Couldn't cancel the subscription.");
  }
}

// The api client throws Error("<status>: <body>") - pull out the JSON .error field.
function apiMessage(e: unknown): string {
  if (!(e instanceof Error)) return "";
  const m = e.message.match(/^\d+:\s*(.+)$/s);
  const raw = m ? m[1] : e.message;
  try { return JSON.parse(raw).error || ""; } catch { return ""; }
}
