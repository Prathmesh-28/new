import { api } from "@/lib/api";
import { toast } from "sonner";
import type { PlanTier } from "@/data/types";
import { isNative, openCheckout, shareContent, haptic } from "@/lib/mobile";

// India-first currency detection — mirrors the landing page (Asia/Kolkata / India
// locale → INR; clear US signals → USD; everything else defaults to INR).
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

export type Gateway = "stripe" | "razorpay";

export interface BillingState {
  plan: PlanTier;
  status: string | null;
  current_period_end: string | null;
  provider: Gateway | null;
  has_customer: boolean;
  configured: boolean;
  live: boolean;
  gateways: { stripe: boolean; razorpay: boolean };
}

export async function fetchBilling(): Promise<BillingState> {
  return api.get<BillingState>("/api/billing/current");
}

// Default gateway by region: India → Razorpay (UPI/cards/netbanking), else Stripe.
export function defaultGateway(): Gateway {
  return regionCurrency() === "inr" ? "razorpay" : "stripe";
}

// Unified entry point — routes a plan upgrade through the chosen gateway.
export async function upgradePlan(
  plan: Exclude<PlanTier, "free">,
  opts: { gateway: Gateway; email?: string; name?: string; onComplete?: () => void } = { gateway: defaultGateway() },
): Promise<void> {
  if (opts.gateway === "razorpay") return startRazorpayCheckout(plan, opts);
  return startCheckout(plan, opts.onComplete);
}

// Start a subscription upgrade. On web this redirects to Stripe Checkout; on
// native it opens Checkout in an in-app browser and, when that closes, confirms
// the session (the native app is authenticated, so the plan applies without
// relying on a webhook) and fires onComplete so the UI can refresh entitlements.
export async function startCheckout(plan: Exclude<PlanTier, "free">, onComplete?: () => void): Promise<void> {
  try {
    haptic("medium");
    const { url, id } = await api.post<{ url: string; id: string }>("/api/billing/checkout-session", {
      plan,
      currency: regionCurrency(),
    });
    if (!url) { toast.error("Could not start checkout. Please try again."); return; }
    if (isNative()) {
      await openCheckout(url, async () => {
        await confirmCheckout(id);
        onComplete?.();
      });
    } else {
      window.location.href = url;
    }
  } catch (e) {
    toast.error(apiMessage(e) || "Payments aren't enabled yet — please try again later.");
  }
}

// Confirm a returning Checkout session (success_url) so the plan reflects
// immediately, even before the webhook fires. Returns the resolved plan.
export async function confirmCheckout(sessionId: string): Promise<PlanTier | null> {
  try {
    const { plan, applied } = await api.post<{ plan: PlanTier; applied: boolean }>("/api/billing/confirm", { session_id: sessionId });
    if (applied) { haptic("success"); toast.success("You're upgraded — welcome aboard! 🎉"); }
    return plan;
  } catch { return null; }
}

export async function openBillingPortal(): Promise<void> {
  try {
    const { url } = await api.post<{ url: string }>("/api/billing/portal", {});
    if (url) { window.location.href = url; return; }
  } catch (e) {
    toast.error(apiMessage(e) || "No active subscription to manage yet.");
  }
}

// Create a Stripe payment link for an invoice. On native, open the OS share
// sheet so the owner can send it to the customer (WhatsApp/SMS/email); on web,
// open it in a new tab.
export async function payInvoiceWithStripe(invoiceId: string): Promise<void> {
  try {
    haptic("light");
    const { url } = await api.post<{ url: string }>("/api/billing/invoice-link", {
      invoice_id: invoiceId,
      currency: regionCurrency(),
    });
    if (!url) { toast.error("Could not create a payment link."); return; }
    if (isNative()) {
      const res = await shareContent({ title: "Pay your invoice", text: "Here's a secure card payment link for your invoice:", url, dialogTitle: "Send payment link" });
      toast.success(res === "copied" ? "Payment link copied to clipboard" : "Payment link ready to share");
    } else {
      window.open(url, "_blank", "noopener");
      toast.success("Payment link opened — share it with your customer.");
    }
  } catch (e) {
    toast.error(apiMessage(e) || "Could not create a payment link.");
  }
}

// ── Razorpay Standard Checkout (subscription upgrades) ──────────────────────
interface RazorpaySuccess { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
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
      theme: { color: "#C9A227" },
      handler: async (resp: RazorpaySuccess) => {
        try {
          const v = await api.post<{ ok: boolean }>("/api/billing/razorpay/verify", {
            plan,
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          if (v.ok) { haptic("success"); toast.success("You're upgraded — welcome aboard! 🎉"); opts.onComplete?.(); }
          else { haptic("error"); toast.error("Payment couldn't be verified."); }
        } catch (e) {
          haptic("error");
          toast.error(apiMessage(e) || "Payment verification failed.");
        }
      },
      modal: { ondismiss: () => { /* user closed the modal — no charge */ } },
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

// The api client throws Error("<status>: <body>") — pull out the JSON .error field.
function apiMessage(e: unknown): string {
  if (!(e instanceof Error)) return "";
  const m = e.message.match(/^\d+:\s*(.+)$/s);
  const raw = m ? m[1] : e.message;
  try { return JSON.parse(raw).error || ""; } catch { return ""; }
}
