import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Banknote, X, ArrowRight } from "lucide-react";

// Proactive invoice-financing nudge (growth loop for the wedge). Surfaces "you could raise
// ₹X against your unpaid invoices" on the dashboard and deep-links into the offer flow with
// the largest invoice preselected. Data is REAL (GET /api/lending/financeable-invoices — the
// endpoint is gated to the lending plan, so a non-eligible tenant simply gets nothing here).
// Honest by construction: it points at an INDICATIVE offer; the offer page itself shows the
// disbursal rail's Live/Preview status. We deliberately avoid "money in 24h"-style claims.
interface FinInvoice { id: string; invoice_number: string; customer_name: string; total_amount: number; due_date: string | null; indicative_advance: number }

const SNOOZE_KEY = "hr_financing_nudge_snooze";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // dismiss = quiet for a week, then it can resurface
const THRESHOLD = 50_000; // only nudge when the total advance is material

export default function FinancingNudgeCard() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<FinInvoice[] | null>(null);
  const [snoozed, setSnoozed] = useState(() => {
    try {
      const ts = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      return ts > 0 && Date.now() - ts < SNOOZE_MS;
    } catch { return false; }
  });

  useEffect(() => {
    if (snoozed) return;
    let alive = true;
    api.get<FinInvoice[]>("/api/lending/financeable-invoices")
      .then((r) => { if (alive) setInvoices(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setInvoices([]); }); // 402 (not on the lending plan) / offline → hide
    return () => { alive = false; };
  }, [snoozed]);

  if (snoozed || !invoices || invoices.length === 0) return null;

  const totalAdvance = invoices.reduce((s, i) => s + (i.indicative_advance || 0), 0);
  if (totalAdvance < THRESHOLD) return null;

  const largest = invoices.reduce((a, b) => (b.indicative_advance > a.indicative_advance ? b : a));
  const dismiss = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* ignore */ }
    setSnoozed(true);
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <Banknote size={15} className="text-[var(--color-primary)]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Raise up to {formatCurrency(totalAdvance)} against {invoices.length} unpaid invoice{invoices.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-[var(--color-muted)] truncate">
            Advance a receivable and repay when your customer pays. Review an offer — no obligation.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => navigate(`/credit?invoice_id=${largest.id}`)}
          className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 whitespace-nowrap flex items-center gap-1">
          Review offer <ArrowRight size={12} />
        </button>
        <button onClick={dismiss} title="Dismiss for a week" className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)]">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
