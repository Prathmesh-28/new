// Live-forecast bridge (frontend). Fetches the real forecast drivers from the
// backend (GET /api/forecast/inputs — Books GL cash, open invoices, loan schedule)
// and merges them into the AppStore the forecast engine runs on, so the forecast
// reflects the tenant's ACTUAL money instead of the hand-kept KV store.
import { useEffect, useState } from "react";
import { api } from "./api";
import type { AppStore, Invoice, CashObligation, BankAccount } from "@/data/types";

export interface ForecastInputs {
  asOf: string;
  startBalance: number;
  startBalanceSource: "books" | "unavailable";
  receivables: {
    id: string;
    invoiceNumber?: string;
    customer: string;
    amount: number;
    dueDate: string | null;
    status: string;
  }[];
  obligations: {
    id: string;
    type: string;
    label: string;
    amount: number;
    dueDate: string | null;
  }[];
  meta?: { receivablesCount: number; obligationsCount: number; pending: string[] };
}

/** Fetch the live forecast inputs once on mount. Returns null until loaded / on error. */
export function useForecastInputs(): ForecastInputs | null {
  const [data, setData] = useState<ForecastInputs | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<ForecastInputs>("/api/forecast/inputs")
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, []);
  return data;
}

/** True when the bridge returned anything worth overlaying. */
export function hasLiveData(live: ForecastInputs | null): boolean {
  return !!live && (
    live.receivables.length > 0 ||
    live.obligations.length > 0 ||
    (live.startBalanceSource === "books" && live.startBalance > 0)
  );
}

/**
 * Overlay real backend data onto the store the forecast engine consumes.
 * - Open invoices → Invoice[] (source:"backend"), replacing any stale backend
 *   invoices while keeping the user's manual/imported ones.
 * - Loan installments → CashObligation[] (type:"loan"), replacing store loan
 *   obligations while keeping tax/payroll/other.
 * - Books GL cash → the forecast opening balance (only when available & positive,
 *   so it never double-counts with manually-entered bank balances).
 * Pure: returns a new store; leaves the original untouched.
 */
export function mergeForecastInputs(store: AppStore, live: ForecastInputs | null): AppStore {
  if (!live) return store;
  const asOf = live.asOf || new Date().toISOString().slice(0, 10);

  const realInvoices: Invoice[] = live.receivables.map((r) => ({
    id: r.id,
    customer: r.customer || "Customer",
    amount: r.amount,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: r.dueDate || asOf,
    dueDate: r.dueDate || asOf,
    description: "",
    status: r.status === "overdue" ? "overdue" : "pending",
    source: "backend",
  }));
  const invoices = live.receivables.length
    ? [...realInvoices, ...(store.invoices ?? []).filter((i) => i.source !== "backend")]
    : store.invoices ?? [];

  const realObligations: CashObligation[] = live.obligations.map((o) => ({
    id: o.id,
    name: o.label,
    amount: o.amount,
    dueDate: o.dueDate || asOf,
    type: "loan",
  }));
  const obligations = live.obligations.length
    ? [...(store.obligations ?? []).filter((o) => o.type !== "loan"), ...realObligations]
    : store.obligations ?? [];

  const bankAccounts: BankAccount[] =
    live.startBalanceSource === "books" && live.startBalance > 0
      ? [{
          id: "books-cash",
          name: "Cash & bank (Books)",
          provider: "Headroom Books",
          balance: live.startBalance,
          lastSync: asOf,
          status: "connected",
        }]
      : store.bankAccounts ?? [];

  return { ...store, invoices, obligations, bankAccounts };
}
