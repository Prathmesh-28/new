import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

// Shared real per-customer credit-limit source (GET/POST /api/books/customers/credit*,
// backed by book_ledgers.credit_limit - the same column documents.js's convertDocument
// already enforces). An audit found THREE separate KV credit-limit trackers
// (Receivables/Collections/Invoices), each keyed by customer name, that could each
// show a different limit for the exact same customer and none of which the real
// invoice-send credit-limit gate ever saw. This is now the one place any page
// reads/writes a customer's real credit limit and real outstanding exposure.
export interface CustomerCreditRow { ledgerId: string; name: string; creditLimit: number; outstanding: number; }

export function useCustomerCredit() {
  const [credit, setCredit] = useState<CustomerCreditRow[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed fetch used to look identical to "no credit limits configured" - an
  // empty array either way, no error surfaced - so a network blip could quietly
  // hide every customer's real limit/exposure. Callers should show `error` rather
  // than silently rendering the empty state.
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setCredit(await api.get<CustomerCreditRow[]>("/api/books/customers/credit")); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load customer credit data"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { credit, loading, error, refresh };
}

export function setCustomerCreditLimit(name: string, limit: number) {
  return api.post<{ id: string; name: string; credit_limit: string }>("/api/books/customers/credit-limit", { name, limit });
}
