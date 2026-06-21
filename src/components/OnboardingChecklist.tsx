import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ClipboardList, CheckCircle2, ArrowRight, Loader2, Sparkles } from "lucide-react";

const DEFAULT_FIRM = "Headroom";

/**
 * First-run activation checklist shown on the Dashboard for owners / finance
 * managers. Unlike a demo dataset, this drives the user through setting up their
 * OWN business — including the one step that's easy to miss: seeding the chart of
 * accounts (POST /api/books/seed), without which the books module is empty. Each
 * step's "done" state is detected from real data (store + backend), so it ticks
 * itself off as the user works. Auto-hides once complete; dismissable; shares the
 * `ownerOnboardingDismissed` flag with the Settings card.
 */
export default function OnboardingChecklist() {
  const { user } = useAuth();
  const { store } = useApp();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useFeatureState<boolean>("ownerOnboardingDismissed", false);
  const [ledgerCount, setLedgerCount] = useState<number | null>(null);
  const [partyCount, setPartyCount] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [seeding, setSeeding] = useState(false);

  const role = user?.role;
  const show = (role === "owner" || role === "finance_manager") && !dismissed;

  const refresh = useCallback(async () => {
    try {
      const ledgers = await api.get<any[]>("/api/books/ledgers");
      if (Array.isArray(ledgers)) {
        setLedgerCount(ledgers.length);
        setPartyCount(ledgers.filter((l) => l?.is_party).length);
      } else setLedgerCount(0);
    } catch { setLedgerCount(0); }
    try {
      const items = await api.get<any[]>("/api/books/inventory/items");
      if (Array.isArray(items)) setItemCount(items.length);
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => { if (show) refresh(); }, [show, refresh]);

  if (!show) return null;

  const firm: any = (store as any).firm || {};
  const businessSet = !!firm.gstNumber || (!!firm.name && firm.name !== DEFAULT_FIRM);
  const booksSet = (ledgerCount ?? 0) > 0;
  const bankSet = Array.isArray((store as any).bankAccounts) && (store as any).bankAccounts.length > 0;
  const partyOrItem = partyCount > 0 || itemCount > 0;
  const hasInvoice = Array.isArray((store as any).invoices) && (store as any).invoices.length > 0;

  const seedBooks = async () => {
    setSeeding(true);
    try {
      await api.post("/api/books/seed", {});
      toast.success("Chart of accounts created — your books are ready");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not set up books");
    } finally {
      setSeeding(false);
    }
  };

  const steps: { done: boolean; label: string; hint: string; cta: string; act: () => void; busy?: boolean }[] = [
    { done: businessSet, label: "Set up your business", hint: "Name, GSTIN & financial year", cta: "Open settings", act: () => navigate("/settings") },
    { done: booksSet, label: "Set up your books", hint: "Create your chart of accounts — one click", cta: seeding ? "Setting up…" : "Create chart of accounts", act: seedBooks, busy: seeding },
    { done: bankSet, label: "Add your bank balance", hint: "So cash position & runway are real", cta: "Add bank", act: () => navigate("/banking") },
    { done: partyOrItem, label: "Add customers & products", hint: "Type a few — or bulk-upload a CSV", cta: "Open books", act: () => navigate("/books") },
    { done: hasInvoice, label: "Raise your first invoice", hint: "Start tracking receivables & GST", cta: "New invoice", act: () => navigate("/invoices") },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  if (doneCount === steps.length) return null; // nothing left — hide

  return (
    <div className="rounded-xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Get your business set up <span className="text-[var(--color-muted)] font-normal">· {doneCount}/{steps.length}</span></h2>
            <p className="text-[11px] text-[var(--color-muted)]">A few quick steps to make Headroom yours. You don't need the demo data — set up your own in minutes.</p>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="shrink-0 text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)]">Dismiss</button>
      </div>

      {/* progress bar */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {steps.map((s, i) => (
          <div key={s.label}
            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${s.done ? "border-[var(--color-border)] opacity-70" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
            <div className="flex min-w-0 items-start gap-2.5">
              {s.done
                ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
                : <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-muted)] text-[9px] font-semibold text-[var(--color-muted)]">{i + 1}</span>}
              <div className="min-w-0">
                <p className={`text-sm font-medium ${s.done ? "line-through" : ""}`}>{s.label}</p>
                <p className="text-[11px] text-[var(--color-muted)]">{s.hint}</p>
              </div>
            </div>
            {!s.done && (
              <button onClick={s.act} disabled={s.busy}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2.5 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50">
                {s.busy ? <Loader2 size={12} className="animate-spin" /> : null}{s.cta}{!s.busy && <ArrowRight size={12} />}
              </button>
            )}
          </div>
        ))}
      </div>

      {doneCount >= 1 && doneCount < steps.length && (
        <p className="mt-3 flex items-center gap-1 text-[11px] text-[var(--color-muted)]"><Sparkles size={11} className="text-[var(--color-primary)]" /> Nice — {pct}% there. Finish setup to unlock accurate cash, GST and forecasts.</p>
      )}
    </div>
  );
}
