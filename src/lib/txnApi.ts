import type { Transaction } from "@/data/types";

// Shared Transaction ⇄ /api/transactions mapping. Extracted from TransactionsPage so
// every surface that creates transactions (Dashboard quick-add, CSV import, receipts)
// persists through the SAME server path - an audit found the Dashboard's Add/Import
// modals writing only to the client KV store, whose rows a later TransactionsPage
// mount silently replaced with server rows: data loss behind a success toast.

// backend category → one of the UI's six buckets
export function catFromApi(c: string | null | undefined): Transaction["category"] {
  switch (c) {
    case "revenue":        return "revenue";
    case "payroll":        return "payroll";
    case "tax":            return "tax";
    case "transfer":       return "transfer";
    case "loan_repayment": return "loan";
    default:               return "expense"; // rent/software/inventory/utilities/marketing/uncategorized
  }
}

// UI bucket → backend category (used on create/update). When the row already carries a
// full backend category whose bucket MATCHES what's being written, preserve it - only a
// deliberate bucket CHANGE re-maps (protects rent/software/... from silent corruption).
export function catToApi(c: Transaction["category"], apiCategory?: string): string {
  if (apiCategory && catFromApi(apiCategory) === c) return apiCategory;
  switch (c) {
    case "revenue":  return "revenue";
    case "payroll":  return "payroll";
    case "tax":      return "tax";
    case "transfer": return "transfer";
    case "loan":     return "loan_repayment";
    case "expense":  return "uncategorized";
    default:         return "uncategorized";
  }
}

// API row → frontend Transaction
export function txnFromApi(r: any): Transaction {
  return {
    id:            String(r.id),
    date:          (r.transaction_date ?? "").toString().slice(0, 10),
    amount:        Number(r.amount) || 0,
    description:   r.description_raw ?? r.account_name ?? "Transaction",
    category:      catFromApi(r.category),
    apiCategory:   r.category ?? undefined, // full backend category, preserved for round-trips
    counterparty:  r.merchant_name ?? "",
    isRecurring:   !!r.is_recurring,
    bankAccountId: r.bank_account_id ? String(r.bank_account_id) : "",
    notes:         r.notes ?? undefined,
  };
}

// frontend Transaction → POST body
export function txnToApiBody(t: Transaction) {
  return {
    bank_account_id:  t.bankAccountId || undefined,
    amount:           t.amount,
    description_raw:  t.description,
    merchant_name:    t.counterparty || undefined,
    category:         catToApi(t.category, t.apiCategory),
    is_recurring:     t.isRecurring,
    transaction_date: t.date,
    source:           "manual",
  };
}
