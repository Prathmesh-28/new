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
const GRADE_C: Record<string, string> = { A: "#16a34a", B: "#65a30d", C: "#ca8a04", D: "#ea580c", E: "#dc2626" };
interface Health { score: number; grade: string; factors: Array<{ label: string; score: number; detail: string }>; top_actions: Array<{ area: string; detail: string }> }

export default function FraudSentinelPage() {
  const [data, setData] = useState<Scan | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null); setData(null); setHealth(null);
    api.get<Scan>("/api/books/fraud-scan").then(setData).catch((e) => setError(e.message));
    api.get<Health>("/api/books/health-score").then(setHealth).catch(() => {});
  }, []);
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
            <h1 className="text-xl font-bold text-[var(--color-text)]">Books Integrity</h1>
            <p className="text-sm text-[var(--color-muted)]">Bookkeeping-quality score + forensic scans (ghost vendors, structured cash, round-tripping, duplicate payments).</p>
          </div>
        </div>
        <button onClick={load} className="text-xs border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-accent)]">Re-scan</button>
      </div>

      {/* Books Health Score (#52) */}
      {health && (
        <div className={card}>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shrink-0" style={{ background: (GRADE_C[health.grade] || "#64748b") + "22", color: GRADE_C[health.grade] || "#64748b", border: `2px solid ${GRADE_C[health.grade] || "#64748b"}` }}>{health.grade}</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-text)]">Books health {health.score}/100</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
                {health.factors.map((f, i) => (
                  <div key={i} title={f.detail}>
                    <div className="flex justify-between text-[10px] mb-0.5"><span className="text-[var(--color-muted)] truncate">{f.label}</span><span>{f.score}</span></div>
                    <div className="h-1 rounded bg-[var(--color-border)]"><div className="h-1 rounded" style={{ width: `${Math.max(3, f.score)}%`, background: f.score >= 60 ? "#16a34a" : f.score >= 40 ? "#ca8a04" : "#dc2626" }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {health.top_actions.length > 0 && <p className="text-[11px] text-[var(--color-muted)] mt-3">Fix first: {health.top_actions.slice(0, 3).map((a) => `${a.area} (${a.detail})`).join(" · ")}</p>}
        </div>
      )}

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
