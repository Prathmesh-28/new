import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import { ShieldAlert, UserX, Layers, ArrowLeftRight, Copy, CheckCircle2 } from "lucide-react";

// Fraud Sentinel — read-only forensic scans over the ledger (ghost vendors, structured cash,
// round-tripping, duplicate payments). Flags to review, not proof; every one ties to real vouchers.
interface Finding { name?: string; party?: string; total_paid?: number; total?: number; amount?: number; payments?: number; count?: number; date?: string; sales?: number; purchase?: number; risk: string }
interface Scan {
  scanned_at: string; risk_level: string;
  summary: { ghost_vendors: number; structured_cash: number; round_tripping: number; duplicate_payments: number; total_findings: number };
  ghost_vendors: Finding[]; structured_cash: Finding[]; round_tripping: Finding[]; duplicate_payments: Finding[]; note: string;
}
const INR = (v?: number) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const card = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4";
const RISK: Record<string, string> = { clean: "text-emerald-400", low: "text-emerald-400", medium: "text-amber-400", high: "text-red-400" };

export default function FraudSentinelPage() {
  const [data, setData] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { setError(null); setData(null); api.get<Scan>("/api/books/fraud-scan").then(setData).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  const Section = ({ icon: Icon, title, rows, render }: { icon: any; title: string; rows: Finding[]; render: (f: Finding) => React.ReactNode }) => (
    <div className={card}>
      <p className="text-sm font-semibold mb-2 flex items-center gap-2"><Icon size={14} className={rows.length ? "text-red-400" : "text-[var(--color-muted)]"} /> {title} <span className="text-[var(--color-muted)] font-normal">({rows.length})</span></p>
      {rows.length === 0 ? <p className="text-xs text-emerald-400">Nothing flagged.</p> : (
        <table className="w-full text-sm rcard"><tbody>{rows.map((f, i) => <tr key={i} className="border-t border-[var(--color-border)]">{render(f)}</tr>)}</tbody></table>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert size={20} className="text-[var(--color-primary)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Fraud Sentinel</h1>
            <p className="text-sm text-[var(--color-muted)]">Forensic scans over your ledger — ghost vendors, structured cash, round-tripping, duplicate payments.</p>
          </div>
        </div>
        <button onClick={load} className="text-xs border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-accent)]">Re-scan</button>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : !data ? <LoadingState rows={6} /> : (
        <>
          <div className={card + " flex items-center gap-3"}>
            {data.summary.total_findings === 0 ? <CheckCircle2 size={18} className="text-emerald-400" /> : <ShieldAlert size={18} className="text-red-400" />}
            <p className="text-sm">Risk level: <b className={RISK[data.risk_level] || ""}>{data.risk_level}</b> · <span className="text-[var(--color-muted)]">{data.summary.total_findings} finding(s)</span></p>
          </div>
          <Section icon={UserX} title="Ghost vendors (no GSTIN/PAN)" rows={data.ghost_vendors} render={(f) => (<>
            <td data-label="Vendor" className="py-1.5">{f.name}</td><td data-label="Payments" className="py-1.5">{f.payments}</td><td data-label="Total paid" className="py-1.5">{INR(f.total_paid)}</td>
          </>)} />
          <Section icon={Layers} title="Structured cash (40A(3) gaming)" rows={data.structured_cash} render={(f) => (<>
            <td data-label="Party" className="py-1.5">{f.party}</td><td data-label="Date" className="py-1.5">{f.date}</td><td data-label="Payments" className="py-1.5">{f.payments}</td><td data-label="Total" className="py-1.5">{INR(f.total)}</td>
          </>)} />
          <Section icon={ArrowLeftRight} title="Round-tripping (customer = vendor)" rows={data.round_tripping} render={(f) => (<>
            <td data-label="Party" className="py-1.5">{f.name}</td><td data-label="Sales" className="py-1.5">{INR(f.sales)}</td><td data-label="Purchase" className="py-1.5">{INR(f.purchase)}</td>
          </>)} />
          <Section icon={Copy} title="Duplicate payments" rows={data.duplicate_payments} render={(f) => (<>
            <td data-label="Party" className="py-1.5">{f.party}</td><td data-label="Amount" className="py-1.5">{INR(f.amount)}</td><td data-label="Times" className="py-1.5">{f.count}</td>
          </>)} />
          <p className="text-[11px] text-[var(--color-muted)]">{data.note}</p>
        </>
      )}
    </div>
  );
}
