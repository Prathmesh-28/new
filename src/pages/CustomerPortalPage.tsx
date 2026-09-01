import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, Building2, Download, FileText, Loader2, Receipt } from "lucide-react";
import { API_BASE } from "@/lib/apiBase";
import { formatCurrency } from "@/lib/utils";

/**
 * /portal/:token — PUBLIC. What a customer sees when their supplier sends them a link.
 *
 * The audit's highest-value money-hygiene gap: there was no way for a customer to see what
 * they owe, so every collection loop ended with a person re-attaching a PDF to an email.
 * No login, no account, no app — the token in the URL is the authorisation, and it only
 * ever reaches this customer's own documents.
 *
 * Deliberately plain: this is read by someone who has never seen the product and may be on
 * a phone, in a hurry, deciding whether to pay.
 */
type Invoice = {
  id: string; invoice_number: string; invoice_date: string | null; due_date: string | null;
  total_amount: string; paid_amount: string; credited_amount: string; outstanding: string;
  status: string; currency: string;
};
type ReceiptRow = { id: string; amount: string; mode: string; reference: string | null; received_at: string; receipt_number: string | null; invoice_number: string };
type Portal = {
  supplier: { name: string; gstin: string | null };
  customer: { name: string };
  summary: { total_due: number; overdue_amount: number; open_count: number; overdue_count: number; opening_balance: number };
  invoices: Invoice[];
  receipts: ReceiptRow[];
  as_of: string;
};

export default function CustomerPortalPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    // A plain fetch, not the authed api client: this page has no session and must not try
    // to acquire one.
    fetch(`${API_BASE}/api/portal/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "This link isn't working.");
        return body as Portal;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "This link isn't working."))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <Loader2 size={22} className="animate-spin text-[var(--color-muted)]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-[var(--color-border)]/40 flex items-center justify-center mb-4">
          <AlertCircle size={20} className="text-[var(--color-muted)]" />
        </div>
        <h1 className="text-lg font-bold mb-2">This link isn't working</h1>
        <p className="text-sm text-[var(--color-muted)] max-w-sm">{error}</p>
      </div>
    );
  }

  const open = data.invoices.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  const settled = data.invoices.filter((i) => i.status === "paid");

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-6">
        <header>
          <p className="text-xs text-[var(--color-muted)] flex items-center gap-1.5">
            <Building2 size={12} /> {data.supplier.name}{data.supplier.gstin ? ` · ${data.supplier.gstin}` : ""}
          </p>
          <h1 className="text-2xl font-bold mt-1">Your account</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">{data.customer.name}</p>
        </header>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <p className="text-xs text-[var(--color-muted)]">Total due</p>
          <p className={`text-4xl font-bold tabular-nums mt-1 ${data.summary.total_due > 0 ? "" : "text-[var(--color-primary)]"}`}>
            {formatCurrency(data.summary.total_due)}
          </p>
          {data.summary.total_due <= 0 ? (
            <p className="text-sm text-[var(--color-primary)] mt-2">Nothing outstanding — thank you.</p>
          ) : (
            <p className="text-sm text-[var(--color-muted)] mt-2">
              Across {data.summary.open_count} invoice{data.summary.open_count === 1 ? "" : "s"}
              {data.summary.overdue_count > 0 && (
                <span className="text-red-400">
                  {" "}· {formatCurrency(data.summary.overdue_amount)} of it is past its due date
                </span>
              )}
            </p>
          )}
          {data.summary.opening_balance > 0 && (
            <p className="text-xs text-[var(--color-muted)] mt-2">
              Includes an opening balance of {formatCurrency(data.summary.opening_balance)} carried forward from before these invoices.
            </p>
          )}
        </div>

        {open.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><FileText size={14} /> Invoices to pay</h2>
            <ul className="space-y-2">
              {open.map((inv) => {
                const overdue = inv.due_date && inv.due_date < today;
                return (
                  <li key={inv.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-medium">{inv.invoice_number}</p>
                        <p className="text-xs text-[var(--color-muted)] mt-0.5">
                          {inv.invoice_date ? `Dated ${inv.invoice_date}` : ""}
                          {inv.due_date && <span className={overdue ? "text-red-400" : ""}> · due {inv.due_date}{overdue ? " (overdue)" : ""}</span>}
                        </p>
                        {Number(inv.paid_amount) > 0 && (
                          <p className="text-xs text-[var(--color-muted)] mt-0.5">
                            {formatCurrency(Number(inv.paid_amount))} of {formatCurrency(Number(inv.total_amount))} already received
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold tabular-nums">{formatCurrency(Number(inv.outstanding))}</p>
                        <a
                          href={`${API_BASE}/api/portal/${encodeURIComponent(token)}/invoice/${inv.id}/pdf`}
                          className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline mt-1"
                        >
                          <Download size={11} /> Download the invoice
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {data.receipts.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Receipt size={14} /> Payments we've recorded from you</h2>
            <ul className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
              {data.receipts.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-[var(--color-muted)]">
                    {r.received_at} · {r.mode}{r.reference ? ` · ${r.reference}` : ""}
                    <span className="text-[var(--color-text)]"> against {r.invoice_number}</span>
                  </span>
                  <span className="tabular-nums text-[var(--color-primary)] shrink-0">{formatCurrency(Number(r.amount))}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-[var(--color-muted)] mt-2">
              If you've paid something that isn't listed here, reply to the email this link came from — it may not have been matched yet.
            </p>
          </section>
        )}

        {settled.length > 0 && (
          <details className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <summary className="text-sm font-semibold cursor-pointer">Settled invoices ({settled.length})</summary>
            <ul className="mt-3 divide-y divide-[var(--color-border)]">
              {settled.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-mono text-xs">{inv.invoice_number}<span className="font-sans text-[var(--color-muted)]"> · {inv.invoice_date}</span></span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="tabular-nums text-[var(--color-muted)]">{formatCurrency(Number(inv.total_amount))}</span>
                    <a href={`${API_BASE}/api/portal/${encodeURIComponent(token)}/invoice/${inv.id}/pdf`}
                      className="text-xs text-[var(--color-primary)] hover:underline">PDF</a>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <footer className="text-[11px] text-[var(--color-muted)] pt-2">
          <p>As at {new Date(data.as_of).toLocaleString("en-IN")}. This page is private to you — the link is the only way in, and {data.supplier.name} can turn it off at any time.</p>
        </footer>
      </div>
    </div>
  );
}
