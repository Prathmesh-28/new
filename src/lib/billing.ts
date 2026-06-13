import { api } from "@/lib/api";
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
  configured: boolean; // Razorpay keys present on the server
}

export async function fetchBilling(): Promise<BillingState> {
  return api.get<BillingState>("/api/billing/current");
}

// Unified upgrade entry point — Razorpay Standard Checkout.
export async function upgradePlan(
  plan: Exclude<PlanTier, "free">,
  opts: { email?: string; name?: string; onComplete?: () => void } = {},
): Promise<void> {
  return startRazorpayCheckout(plan, opts);
}

// ── Razorpay Standard Checkout ──────────────────────────────────────────────
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
