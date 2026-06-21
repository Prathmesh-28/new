import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ClipboardList, CheckCircle2, ArrowRight, Loader2, Sparkles } from "lucide-react";
import type { UserRole } from "@/data/types";

const DEFAULT_FIRM = "Headroom";

// Signals detected once from store + backend; each step's `done` reads from here.
interface Signals {
  businessSet: boolean; booksSet: boolean; bankSet: boolean;
  partyOrItem: boolean; itemCount: number; hasInvoice: boolean; hasClients: boolean;
}

type Action = "seedBooks";
interface Step {
  id: string; label: string; hint: string; cta: string;
  to?: string; action?: Action;
  done: (s: Signals) => boolean;
}

// Per-role first-run flow. Every step's `done` is data-detected so it ticks itself
// off as the user works — no manual marking. Each role gets steps it can actually
// complete (signals we can read), so the progress bar reaches 100%.
const ROLE_FLOWS: Partial<Record<UserRole, { intro: string; steps: Step[] }>> = {
  owner: {
    intro: "A few steps to make Headroom yours — you don't need the demo data.",
    steps: [
      { id: "biz", label: "Set up your business", hint: "Name, GSTIN & financial year", cta: "Open settings", to: "/settings", done: s => s.businessSet },
      { id: "books", label: "Set up your books", hint: "Create your chart of accounts — one click", cta: "Create chart of accounts", action: "seedBooks", done: s => s.booksSet },
      { id: "bank", label: "Add your bank balance", hint: "So cash position & runway are real", cta: "Add bank", to: "/banking", done: s => s.bankSet },
      { id: "party", label: "Add customers & products", hint: "Type a few — or bulk-upload a CSV", cta: "Open books", to: "/books", done: s => s.partyOrItem },
      { id: "inv", label: "Raise your first invoice", hint: "Start tracking receivables & GST", cta: "New invoice", to: "/invoices", done: s => s.hasInvoice },
    ],
  },
  finance_manager: {
    intro: "Get the books live so cash, AR/AP and GST are accurate.",
    steps: [
      { id: "books", label: "Set up the books", hint: "Create the chart of accounts — one click", cta: "Create chart of accounts", action: "seedBooks", done: s => s.booksSet },
      { id: "bank", label: "Add bank balances", hint: "So cash & runway are real", cta: "Add bank", to: "/banking", done: s => s.bankSet },
      { id: "party", label: "Import customers, vendors & items", hint: "Bulk-upload a CSV in Books", cta: "Open books", to: "/books", done: s => s.partyOrItem },
      { id: "inv", label: "Record the first invoice", hint: "Start AR & GST tracking", cta: "New invoice", to: "/invoices", done: s => s.hasInvoice },
    ],
  },
  accountant: {
    intro: "Set up the workspace and bring your clients in — your practice, one console.",
    steps: [
      { id: "books", label: "Set up the books", hint: "Chart of accounts for this workspace — one click", cta: "Create chart of accounts", action: "seedBooks", done: s => s.booksSet },
      { id: "client", label: "Add your first client", hint: "Link a client tenant to your CA portal", cta: "Open CA portal", to: "/advisor", done: s => s.hasClients },
      { id: "data", label: "Import the trial balance / ledgers", hint: "Bulk-upload opening ledgers in Books", cta: "Open books", to: "/books", done: s => s.partyOrItem },
      { id: "gst", label: "Review GST for filing", hint: "GSTR-1 / 2B / 3B from the ledger", cta: "Open GST", to: "/gst", done: s => s.hasInvoice },
    ],
  },
  sales: {
    intro: "Get from lead to paid — set up your pipeline and billing.",
    steps: [
      { id: "leads", label: "Add customers / leads", hint: "Build your pipeline (or bulk-upload)", cta: "Open CRM", to: "/crm", done: s => s.partyOrItem },
      { id: "inv", label: "Raise your first invoice", hint: "Bill a customer & start AR", cta: "New invoice", to: "/invoices", done: s => s.hasInvoice },
      { id: "collect", label: "Set up collection reminders", hint: "WhatsApp / UPI nudges for overdue", cta: "Open collections", to: "/collections", done: s => s.hasInvoice },
    ],
  },
  operations_manager: {
    intro: "Stand up your products, stock and suppliers.",
    steps: [
      { id: "items", label: "Add your products", hint: "Item master — type a few or bulk-upload", cta: "Open books", to: "/books", done: s => s.itemCount > 0 },
      { id: "wh", label: "Set up warehouses & BOMs", hint: "Locations, putaway and manufacturing", cta: "Open ERP", to: "/erp", done: s => s.itemCount > 0 },
      { id: "vendors", label: "Add vendors & a purchase order", hint: "Procurement and supplier terms", cta: "Open vendors", to: "/vendors", done: s => s.partyOrItem },
    ],
  },
};

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const { store } = useApp();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useFeatureState<boolean>("ownerOnboardingDismissed", false);
  const [ledgerCount, setLedgerCount] = useState<number | null>(null);
  const [partyCount, setPartyCount] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [clientCount, setClientCount] = useState(0);
  const [seeding, setSeeding] = useState(false);

  const role = user?.role as UserRole | undefined;
  const flow = role ? ROLE_FLOWS[role] : undefined;
  const show = !!flow && !dismissed;

  const refresh = useCallback(async () => {
    try {
      const ledgers = await api.get<any[]>("/api/books/ledgers");
      if (Array.isArray(ledgers)) { setLedgerCount(ledgers.length); setPartyCount(ledgers.filter(l => l?.is_party).length); }
      else setLedgerCount(0);
    } catch { setLedgerCount(0); }
    try { const items = await api.get<any[]>("/api/books/inventory/items"); if (Array.isArray(items)) setItemCount(items.length); } catch { /* best-effort */ }
    if (role === "accountant") {
      try { const r = await api.get<any>("/api/advisor/clients"); const c = Array.isArray(r) ? r : (r?.clients ?? []); setClientCount(c.length); } catch { /* best-effort */ }
    }
  }, [role]);

  useEffect(() => { if (show) refresh(); }, [show, refresh]);

  if (!show || !flow) return null;

  const firm: any = (store as any).firm || {};
  const sig: Signals = {
    businessSet: !!firm.gstNumber || (!!firm.name && firm.name !== DEFAULT_FIRM),
    booksSet: (ledgerCount ?? 0) > 0,
    bankSet: Array.isArray((store as any).bankAccounts) && (store as any).bankAccounts.length > 0,
    partyOrItem: partyCount > 0 || itemCount > 0,
    itemCount,
    hasInvoice: Array.isArray((store as any).invoices) && (store as any).invoices.length > 0,
    hasClients: clientCount > 0,
  };

  const seedBooks = async () => {
    setSeeding(true);
    try { await api.post("/api/books/seed", {}); toast.success("Chart of accounts created — your books are ready"); await refresh(); }
    catch (e: any) { toast.error(e?.message || "Could not set up books"); }
    finally { setSeeding(false); }
  };

  const run = (step: Step) => { if (step.action === "seedBooks") seedBooks(); else if (step.to) navigate(step.to); };

  const doneCount = flow.steps.filter(s => s.done(sig)).length;
  const total = flow.steps.length;
  const pct = Math.round((doneCount / total) * 100);
  if (doneCount === total) return null;

  return (
    <div className="rounded-xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Get set up <span className="font-normal text-[var(--color-muted)]">· {doneCount}/{total}</span></h2>
            <p className="text-[11px] text-[var(--color-muted)]">{flow.intro}</p>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="shrink-0 text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)]">Dismiss</button>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {flow.steps.map((s, i) => {
          const done = s.done(sig);
          const busy = s.action === "seedBooks" && seeding;
          return (
            <div key={s.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${done ? "border-[var(--color-border)] opacity-70" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
              <div className="flex min-w-0 items-start gap-2.5">
                {done
                  ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
                  : <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-muted)] text-[9px] font-semibold text-[var(--color-muted)]">{i + 1}</span>}
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${done ? "line-through" : ""}`}>{s.label}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">{s.hint}</p>
                </div>
              </div>
              {!done && (
                <button onClick={() => run(s)} disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2.5 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 size={12} className="animate-spin" /> : null}{busy ? "Setting up…" : s.cta}{!busy && <ArrowRight size={12} />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {doneCount >= 1 && doneCount < total && (
        <p className="mt-3 flex items-center gap-1 text-[11px] text-[var(--color-muted)]"><Sparkles size={11} className="text-[var(--color-primary)]" /> {pct}% there — finish setup to unlock accurate cash, GST and forecasts.</p>
      )}
    </div>
  );
}
