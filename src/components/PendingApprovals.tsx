import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";

interface Approval { id: string; entity_type: string; amount: string | number; requested_by?: string; created_at?: string }

const rupee = (n: unknown) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const APPROVER_ROLES = ["owner", "finance_manager", "super_admin"];

/**
 * Surfaces the pending-approval queue where finance/owner actually land (the
 * Dashboard), instead of buried in Books → Controls. Approve/reject inline.
 * Hidden when there's nothing pending or the role can't approve.
 */
export default function PendingApprovals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Approval[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canApprove = !!user && APPROVER_ROLES.includes(user.role);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Approval[]>("/api/books/approvals?status=PENDING");
      setRows(Array.isArray(r) ? r : []);
    } catch { setRows([]); }
  }, []);

  useEffect(() => { if (canApprove) load(); }, [canApprove, load]);

  if (!canApprove || !rows || rows.length === 0) return null;

  const decide = async (id: string, approve: boolean) => {
    setBusyId(id);
    try {
      await api.post(`/api/books/approvals/${id}/decide`, { approve });
      toast.success(approve ? "Approved" : "Rejected");
      setRows(prev => (prev ?? []).filter(r => r.id !== id));
    } catch (e: any) {
      toast.error(e?.message || "Could not record decision");
    } finally { setBusyId(null); }
  };

  const shown = rows.slice(0, 5);

  return (
    <div className="rounded-xl border border-[var(--color-warning,#d97706)]/30 bg-[var(--color-warning,#d97706)]/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-[var(--color-warning,#d97706)]" />
          <p className="text-sm font-semibold">{rows.length} pending approval{rows.length > 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => navigate("/books")} className="inline-flex items-center gap-1 text-[11px] text-[var(--color-primary)] hover:underline">
          Open Controls <ArrowRight size={11} />
        </button>
      </div>
      <div className="space-y-1.5">
        {shown.map(a => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{(a.entity_type || "Item").replace(/_/g, " ")} · {rupee(a.amount)}</p>
              {a.created_at && <p className="text-[11px] text-[var(--color-muted)]">{new Date(a.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</p>}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button onClick={() => decide(a.id, true)} disabled={busyId === a.id}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2.5 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busyId === a.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Approve
              </button>
              <button onClick={() => decide(a.id, false)} disabled={busyId === a.id}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] hover:bg-[var(--color-surface-2)] disabled:opacity-50">
                <XCircle size={11} /> Reject
              </button>
            </div>
          </div>
        ))}
        {rows.length > shown.length && (
          <button onClick={() => navigate("/books")} className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-1.5 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]">
            +{rows.length - shown.length} more in Controls →
          </button>
        )}
      </div>
    </div>
  );
}
