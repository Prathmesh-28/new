import { api } from "@/lib/api";
import { toast } from "sonner";
import type { PlanTier } from "@/data/types";

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

// Start a subscription upgrade — redirects the browser to Stripe Checkout.
export async function startCheckout(plan: Exclude<PlanTier, "free">): Promise<void> {
  try {
    const { url } = await api.post<{ url: string }>("/api/billing/checkout-session", {
      plan,
      currency: regionCurrency(),
    });
    if (url) { window.location.href = url; return; }
    toast.error("Could not start checkout. Please try again.");
  } catch (e) {
    toast.error(apiMessage(e) || "Payments aren't enabled yet — please try again later.");
  }
}

// Confirm a returning Checkout session (success_url) so the plan reflects
// immediately, even before the webhook fires. Returns the resolved plan.
export async function confirmCheckout(sessionId: string): Promise<PlanTier | null> {
  try {
    const { plan, applied } = await api.post<{ plan: PlanTier; applied: boolean }>("/api/billing/confirm", { session_id: sessionId });
    if (applied) toast.success("You're upgraded — welcome aboard! 🎉");
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

// Create a Stripe payment link for an invoice and open it in a new tab.
export async function payInvoiceWithStripe(invoiceId: string): Promise<void> {
  try {
    const { url } = await api.post<{ url: string }>("/api/billing/invoice-link", {
      invoice_id: invoiceId,
      currency: regionCurrency(),
    });
    if (url) { window.open(url, "_blank", "noopener"); toast.success("Payment link opened — share it with your customer."); return; }
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
