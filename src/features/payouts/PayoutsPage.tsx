import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import EmptyState from "@/components/EmptyState";
import { Send, CheckCircle2, XCircle, RefreshCw, Radio, HandCoins } from "lucide-react";
import { toast } from "sonner";

// Payouts control surface for the shared money-rail (lending disbursal / BNPL / EWA / treasury /
// vendor). In MANUAL mode (no RazorpayX/Setu creds) this is where an operator confirms an offline
// transfer landed — the only way those payouts leave 'pending'. Everything is real backend data
// (/api/payouts); nothing is faked.
interface Payout {
  id: string;
  kind: string;
  beneficiary_name: string | null;
  amount: number;
  currency: string;
  status: "pending" | "queued" | "processing" | "settled" | "failed" | "reversed" | "cancelled";
  provider: "manual" | "razorpayx" | "setu";
  provider_configured: boolean;
  utr: string | null;
  failure_reason: string | null;
  ref_type: string | null;
  created_at: string;
}
interface ProviderStatus { configured: boolean; problem: string | null }
type Providers = Record<string, ProviderStatus>;

const INR = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const STATUS_COLOR: Record<string, string> = {
  settled: "text-emerald-400", queued: "text-sky-400", processing: "text-sky-400",
  pending: "text-amber-400", failed: "text-red-400", reversed: "text-red-400", cancelled: "text-[var(--color-muted)]",
};

export default function PayoutsPage() {
  const { isReadOnly } = useApp();
  const [rows, setRows] = useState<Payout[] | null>(null);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.get<Payout[]>("/api/payouts"), api.get<Providers>("/api/payouts/providers")])
      .then(([p, prov]) => { setRows(p); setProviders(prov); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const settle = async (id: string) => {
    const utr = window.prompt("Bank UTR / reference for this transfer (optional):") ?? "";
    setBusy(id);
    try {
      await api.post(`/api/payouts/${id}/settle`, { utr: utr.trim() || undefined });
      toast.success("Payout marked settled — GL posted");
      load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const markFailed = async (id: string) => {
    const reason = window.prompt("Reason for failure:") ?? "";
    setBusy(id);
    try { await api.post(`/api/payouts/${id}/fail`, { reason: reason.trim() || undefined }); toast.success("Payout marked failed"); load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const retry = async () => {
    setBusy("retry");
    try { const r = await api.post<{ retried: number }>("/api/payouts/retry", {}); toast.success(`Retried ${r.retried} pending payout(s)`); load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  if (error) return <div className="space-y-6"><Header /><ErrorState message={error} onRetry={load} /></div>;
  if (!rows) return <div className="space-y-6"><Header /><LoadingState rows={6} /></div>;

  const anyLiveRail = providers ? Object.entries(providers).some(([k, v]) => k !== "manual" && v.configured) : false;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const pendingCount = rows.filter((r) => ["pending", "queued", "processing"].includes(r.status)).length;

  return (
    <div className="space-y-6">
      <Header />

      {/* Rail status — honest Live vs Manual */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-start gap-3">
        <Radio size={18} className={anyLiveRail ? "text-emerald-400 mt-0.5" : "text-amber-400 mt-0.5"} />
        <div className="text-sm">
          <p className="font-semibold text-[var(--color-text)]">
            {anyLiveRail ? "Live payout rail connected" : "Manual mode — no payout rail configured"}
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">
            {anyLiveRail
              ? "Settlements confirm automatically via the provider webhook."
              : "Payouts are recorded and their GL posts when you confirm the transfer landed. Connect RazorpayX or Setu to automate transfers."}
          </p>
          {providers && (
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(providers).map(([name, s]) => (
                <span key={name} className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">
                  {name}: <b className={s.configured ? "text-emerald-400" : "text-[var(--color-muted)]"}>{s.configured ? "live" : "off"}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filter + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {["all", "pending", "settled", "failed"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg border capitalize ${filter === f ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent font-semibold" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {f}{f === "pending" && pendingCount ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </div>
        {!isReadOnly && (
          <button onClick={retry} disabled={busy === "retry"}
            className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-accent)] disabled:opacity-50">
            <RefreshCw size={13} className={busy === "retry" ? "animate-spin" : ""} /> Retry pending
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={HandCoins} title="No payouts yet"
          description="Payouts appear here when you disburse an advance, pay a supplier via BNPL, approve an earned-wage advance, or sweep idle cash." />
      ) : (
        <table className="w-full rcard text-sm">
          <thead className="text-left text-xs text-[var(--color-muted)]">
            <tr>
              <th className="py-2 font-medium">Kind</th>
              <th className="py-2 font-medium">Beneficiary</th>
              <th className="py-2 font-medium">Amount</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Provider</th>
              <th className="py-2 font-medium">UTR</th>
              {!isReadOnly && <th className="py-2 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="border-t border-[var(--color-border)]">
                <td data-label="Kind" className="py-2 capitalize">{p.kind}</td>
                <td data-label="Beneficiary" className="py-2">{p.beneficiary_name || "—"}</td>
                <td data-label="Amount" className="py-2 font-medium">{INR(p.amount)}</td>
                <td data-label="Status" className={`py-2 capitalize font-medium ${STATUS_COLOR[p.status] || ""}`}>
                  {p.status}
                  {p.status === "failed" && p.failure_reason && <span className="block text-[11px] text-[var(--color-muted)] font-normal">{p.failure_reason}</span>}
                </td>
                <td data-label="Provider" className="py-2 text-xs text-[var(--color-muted)]">{p.provider}</td>
                <td data-label="UTR" className="py-2 text-xs text-[var(--color-muted)]">{p.utr || "—"}</td>
                {!isReadOnly && (
                  <td data-label="Action" className="py-2">
                    {["pending", "queued", "processing"].includes(p.status) ? (
                      <div className="flex gap-1.5">
                        <button onClick={() => settle(p.id)} disabled={busy === p.id}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-800/40 px-2 py-1 rounded-md hover:bg-emerald-950/30 disabled:opacity-50">
                          <CheckCircle2 size={12} /> Settle
                        </button>
                        <button onClick={() => markFailed(p.id)} disabled={busy === p.id}
                          className="inline-flex items-center gap-1 text-[11px] text-red-400 border border-red-800/40 px-2 py-1 rounded-md hover:bg-red-950/30 disabled:opacity-50">
                          <XCircle size={12} /> Fail
                        </button>
                      </div>
                    ) : <span className="text-xs text-[var(--color-muted)]">—</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <Send size={20} className="text-[var(--color-primary)]" />
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Payouts</h1>
        <p className="text-sm text-[var(--color-muted)]">Outbound transfers — disbursals, supplier BNPL, wage advances, treasury sweeps. Confirm & reconcile.</p>
      </div>
    </div>
  );
}
