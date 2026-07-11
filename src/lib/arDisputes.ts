// Shared invoice-dispute store. An audit found THREE separate per-page dispute
// trackers (Receivables "rec-disputes", Collections "col-disputes", Invoices
// "invoice-disputes"), each its own KV key/shape, so the same invoice could show
// as disputed on one page and clean on another. All three were the same concept
// (ring-fence a disputed amount on an invoice, reason + status, so the
// undisputed remainder keeps being chased) - this is now the one shared list.
// Still KV, not a real backend table (unlike credit limits, there's no existing
// ledger-level "dispute" column to hang this off) - but at least consistent.
export interface ArDispute {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
  customer: string;
  amount: number;
  reason: string;
  status: "open" | "in-review" | "resolved" | "written-off";
  raisedAt: string;
  resolution?: string;
}

// Union of the 3 previously-separate reason lists, deduplicated by meaning.
export const AR_DISPUTE_REASONS = [
  "Pricing", "Quality / damage", "Short delivery", "Freight", "Duplicate billing",
  "Quantity / short supply", "Tax / GST error", "Goods not received", "Other",
] as const;

export const AR_DISPUTES_KEY = "shared-ar-disputes";
