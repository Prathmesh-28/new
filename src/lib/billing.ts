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

export interface BillingState {
  plan: PlanTier;
  status: string | null;
  current_period_end: string | null;
  has_customer: boolean;
  configured: boolean;
  live: boolean;
}

export async function fetchBilling(): Promise<BillingState> {
  return api.get<BillingState>("/api/billing/current");
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

// The api client throws Error("<status>: <body>") — pull out the JSON .error field.
function apiMessage(e: unknown): string {
  if (!(e instanceof Error)) return "";
  const m = e.message.match(/^\d+:\s*(.+)$/s);
  const raw = m ? m[1] : e.message;
  try { return JSON.parse(raw).error || ""; } catch { return ""; }
}
