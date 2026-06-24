import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CalendarClock, ArrowDownRight, ArrowUpRight } from "lucide-react";

/**
 * Obligations runway — the 2026 cash-intelligence play. Outflows are now legally
 * time-boxed (43B(h) MSME deadlines, the 20th GST liability, bill due dates, EMIs),
 * so we can project a forward running balance from today's cash + expected
 * receivables, find the FIRST date cash goes negative, and recommend the lever
 * (chase receivables / defer a payable in-terms / draw credit) — not just a chart.
 */
interface BillLite { id: string; vendorName?: string; dueDate: string; amount: number; status: string }
type EventKind = "in" | "out";

export default function ObligationsShortfall() {
  const { store } = useApp();
  const [bills] = useFeatureState<BillLite[]>("payables-bills", []);

  const d = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const horizon = new Date(today.getTime() + 90 * 86400000);
    const cash = (store.bankAccounts ?? []).reduce((s, a) => s + (a.balance ?? 0), 0);
    const events: { date: Date; amount: number; label: string; kind: EventKind }[] = [];

    // Inflows — open invoices on their due date (overdue → collectable from today).
    for (const inv of (store.invoices ?? [])) {
      if (inv.status === "paid") continue;
      const due = new Date(inv.dueDate); if (isNaN(due.getTime())) continue;
      const when = due < today ? today : due;
      if (when <= horizon) events.push({ date: when, amount: inv.amount || 0, label: `Receivable · ${inv.customer || "customer"}`, kind: "in" });
    }
    // Outflows — scheduled obligations.
    for (const o of (store.obligations ?? [])) {
      const due = new Date(o.dueDate); if (isNaN(due.getTime())) continue;
      if (due >= today && due <= horizon) events.push({ date: due, amount: -(o.amount || 0), label: o.name || "Obligation", kind: "out" });
    }
    // Outflows — unpaid bills (their due date; 43B(h) detail lives in Vendors).
    for (const b of (bills ?? [])) {
      if (b.status !== "unpaid") continue;
      const due = new Date(b.dueDate); if (isNaN(due.getTime())) continue;
      const when = due < today ? today : due;
      if (when <= horizon) events.push({ date: when, amount: -(b.amount || 0), label: `Payable · ${b.vendorName || "vendor"}`, kind: "out" });
    }
    // Outflows — loan EMIs over the next 3 months.
    for (const l of (store.activeLoans ?? []) as { monthlyEmi?: number; emi?: number; lender?: string }[]) {
      const emi = l.monthlyEmi ?? l.emi; if (!emi) continue;
      for (let m = 1; m <= 3; m++) {
        const due = new Date(today.getFullYear(), today.getMonth() + m, 5);
        if (due <= horizon) events.push({ date: due, amount: -emi, label: `EMI · ${l.lender || "loan"}`, kind: "out" });
      }
    }

    events.sort((a, b) => a.date.getTime() - b.date.getTime());
    let bal = cash;
    let shortfall: { date: Date; gap: number } | null = null;
    let low = { date: today, bal: cash };
    const timeline = events.map(e => {
      bal += e.amount;
      if (bal < low.bal) low = { date: e.date, bal };
      if (bal < 0 && !shortfall) shortfall = { date: e.date, gap: -bal };
      return { ...e, running: bal };
    });
    const overdueRecv = (store.invoices ?? [])
      .filter(i => i.status !== "paid" && new Date(i.dueDate) < today)
      .reduce((s, i) => s + (i.amount || 0), 0);
    return { cash, timeline, shortfall: shortfall as { date: Date; gap: number } | null, low, overdueRecv, count: events.length };
  }, [store, bills]);

  const fmtDate = (dt: Date) => dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  if (d.count === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/40 px-5 py-6 text-center">
        <CalendarClock size={22} className="mx-auto mb-2 text-[var(--color-muted)] opacity-50" />
        <p className="text-sm font-semibold">Obligations runway</p>
        <p className="text-xs text-[var(--color-muted)] mt-1 max-w-md mx-auto">Add bank balances, unpaid bills (Vendors → Bills) and receivables, and we'll project your first cash shortfall against your dated obligations — and tell you what to do about it.</p>
      </div>
    );
  }

  const hasShortfall = !!d.shortfall;
  return (
    <div className={`rounded-xl border p-5 ${hasShortfall ? "border-red-800/40 bg-red-950/10" : "border-[var(--color-primary)]/30 bg-[var(--color-surface)]"}`}>
      <div className="flex items-start gap-2 mb-3">
        {hasShortfall ? <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" /> : <CheckCircle2 size={18} className="text-green-400 shrink-0 mt-0.5" />}
        <div>
          <h3 className="text-sm font-semibold">Obligations runway — next 90 days</h3>
          {hasShortfall ? (
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Projected <span className="text-red-400 font-semibold">shortfall of {formatCurrency(Math.round(d.shortfall!.gap))}</span> on{" "}
              <span className="text-[var(--color-text)] font-medium">{fmtDate(d.shortfall!.date)}</span> if nothing changes.
              {d.overdueRecv > 0
                ? <> Collecting your <Link to="/collections" className="text-[var(--color-primary)] underline">{formatCurrency(Math.round(d.overdueRecv))} overdue</Link> would {d.overdueRecv >= d.shortfall!.gap ? "cover it" : "narrow the gap"}.</>
                : <> Consider <Link to="/credit" className="text-[var(--color-primary)] underline">a working-capital line</Link> or deferring a payable within its terms.</>}
            </p>
          ) : (
            <p className="text-xs text-[var(--color-muted)] mt-0.5">No shortfall projected. Lowest balance <span className="text-[var(--color-text)] font-medium">{formatCurrency(Math.round(d.low.bal))}</span> around {fmtDate(d.low.date)}.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-[11px] text-[var(--color-muted)]">Cash today</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">{formatCurrency(Math.round(d.cash))}</p>
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-[11px] text-[var(--color-muted)]">Lowest projected</p>
          <p className={`text-lg font-bold tabular-nums mt-0.5 ${d.low.bal < 0 ? "text-red-400" : d.low.bal < d.cash * 0.2 ? "text-orange-400" : "text-[var(--color-text)]"}`}>{formatCurrency(Math.round(d.low.bal))}</p>
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-[11px] text-[var(--color-muted)]">Overdue to collect</p>
          <p className="text-lg font-bold tabular-nums mt-0.5 text-yellow-400">{formatCurrency(Math.round(d.overdueRecv))}</p>
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg">
        {d.timeline.slice(0, 30).map((e, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
            <span className="w-12 shrink-0 text-[var(--color-muted)]">{fmtDate(e.date)}</span>
            {e.kind === "in" ? <ArrowUpRight size={12} className="text-green-400 shrink-0" /> : <ArrowDownRight size={12} className="text-red-400 shrink-0" />}
            <span className="flex-1 min-w-0 truncate">{e.label}</span>
            <span className={`tabular-nums shrink-0 ${e.kind === "in" ? "text-green-400" : "text-[var(--color-muted)]"}`}>{e.kind === "in" ? "+" : ""}{formatCurrency(Math.round(e.amount))}</span>
            <span className={`tabular-nums shrink-0 w-20 text-right font-medium ${e.running < 0 ? "text-red-400" : "text-[var(--color-text)]"}`}>{formatCurrency(Math.round(e.running))}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mt-2">Running balance from today's cash + expected receivables − scheduled obligations, bills and EMIs over 90 days.</p>
    </div>
  );
}
