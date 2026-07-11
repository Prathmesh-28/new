import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

// Shared AP-aging data source (GET /api/vendor-bills/aging - see
// backend/src/modules/vendorBills.js::apAgingSummary). Aged from actual open
// PURCHASE vouchers' real due dates, not a manual guess. An audit found
// Operations' "Aged Payables" tab kept its own hand-entered bill list (KV
// "aged-payables") that could show different totals/buckets/MSME-at-risk than
// Vendors' "AP Aging" tab for the exact same company - this hook is now the
// ONE place either page reads payables aging from, so they can never diverge.
export interface ApAgingBill {
  voucherId: string; voucherType: "SALES" | "PURCHASE"; number: number; date: string; dueDate: string;
  gross: number; allocated: number; outstanding: number; daysOverdue: number;
}
export interface ApAgingVendorRow {
  vendorId: string; vendorLedgerId: string; vendorName: string;
  isMsme: boolean; msmeCategory: string | null; paymentTermsDays: number | null; total: number;
  buckets: { current: number; d30: number; d60: number; d60plus: number };
  bills: ApAgingBill[];
}
export interface ApAgingResponse {
  vendors: ApAgingVendorRow[];
  totals: { current: number; d30: number; d60: number; d60plus: number };
  grandTotal: number;
}
export const EMPTY_AGING: ApAgingResponse = { vendors: [], totals: { current: 0, d30: 0, d60: 0, d60plus: 0 }, grandTotal: 0 };

export const AP_BUCKET_KEYS: (keyof ApAgingResponse["totals"])[] = ["current", "d30", "d60", "d60plus"];
export const AP_BUCKET_META: Record<keyof ApAgingResponse["totals"], { label: string; color: string; chipCls: string }> = {
  current:  { label: "Current (not yet due)", color: "text-green-400",  chipCls: "bg-green-950/30 text-green-400 border-green-800/30" },
  d30:      { label: "1-30 days overdue",     color: "text-yellow-400", chipCls: "bg-yellow-950/30 text-yellow-400 border-yellow-800/30" },
  d60:      { label: "31-60 days overdue",    color: "text-orange-400", chipCls: "bg-orange-950/30 text-orange-400 border-orange-800/30" },
  d60plus:  { label: "60+ days overdue",      color: "text-red-400",    chipCls: "bg-red-950/30 text-red-400 border-red-800/30" },
};

export function useApAging() {
  const [aging, setAging] = useState<ApAgingResponse>(EMPTY_AGING);
  const [loading, setLoading] = useState(true);
  // A failed fetch used to look identical to "no open bills" - callers should
  // show `error` rather than silently rendering the empty state as if it were real.
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setAging(await api.get<ApAgingResponse>("/api/vendor-bills/aging")); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load payables aging"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { aging, loading, error, refresh };
}
