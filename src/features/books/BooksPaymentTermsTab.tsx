import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  ListChecks, Layers, RefreshCw, Plus, Trash2, Zap, CheckCircle2, AlertTriangle,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (loose — backend response shapes inlined)
// ─────────────────────────────────────────────────────────────────────────────
type Basis = "days" | "month_end" | "months_after_month_end";

interface InstallmentDraft {
  key: string;
  pct: string;       // user string
  dueDays: string;   // user string
  basis: Basis;
}

interface InstallmentRow {
  pct: string | number;
  dueDays?: string | number;
  due_days?: string | number;
  basis?: string;
}

interface TermsTemplate {
  id: string;
  name: string;
  installments?: InstallmentRow[];
}

interface LedgerLite {
  id: string;
  name: string;
  is_party?: boolean;
}

interface UnappliedCredit {
  id?: string;
  voucherId?: string;
  voucherNumber?: string;
  date?: string;
  amount?: string | number;
  unapplied?: string | number;
}

interface OpenBill {
  id?: string;
  voucherId?: string;
  voucherNumber?: string;
  date?: string;
  amount?: string | number;
  outstanding?: string | number;
}

interface UnappliedResponse {
  credits?: UnappliedCredit[];
  unappliedCredits?: UnappliedCredit[];
  bills?: OpenBill[];
  openBills?: OpenBill[];
  totalCredit?: string | number;
  totalUnapplied?: string | number;
}

interface AutoApplyResponse {
  allocated?: string | number;
  allocations?: { voucherNumber?: string; amount?: string | number }[];
  remaining?: string | number;
  remainingCredit?: string | number;
}

const BASIS_OPTIONS: { id: Basis; label: string }[] = [
  { id: "days", label: "Days after invoice" },
  { id: "month_end", label: "End of invoice month" },
  { id: "months_after_month_end", label: "Months after month-end" },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v) || 0;
}

function rupee(v: string | number | null | undefined): string {
  return `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function basisLabel(b?: string): string {
  return BASIS_OPTIONS.find((o) => o.id === b)?.label ?? (b ?? "—");
}

function newInstallment(pct = "100"): InstallmentDraft {
  return { key: Math.random().toString(36).slice(2), pct, dueDays: "0", basis: "days" };
}

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-[var(--color-border)]">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-3">
              <div
                className="h-3 rounded bg-[var(--color-border)] animate-pulse"
                style={{ width: `${40 + ((r + c) % 4) * 15}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

type Section = "templates" | "reconcile";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksPaymentTermsTab() {
  const [section, setSection] = useState<Section>("templates");

  const sections: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "templates", label: "Templates", icon: <Layers size={14} /> },
    { id: "reconcile", label: "Reconciliation", icon: <ListChecks size={14} /> },
  ];

  return (
    <div className="space-y-5">
      {/* inner tab bar */}
      <div className="flex gap-2 overflow-x-auto">
        {sections.map((s) => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors ${
                active
                  ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"
              }`}
            >
              {s.icon}
              {s.label}
            </button>
          );
        })}
      </div>

      {section === "templates" && <TemplatesSection />}
      {section === "reconcile" && <ReconciliationSection />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────
function TemplatesSection() {
  const [templates, setTemplates] = useState<TermsTemplate[]>([]);
  const [busy, setBusy] = useState(true);

  const [name, setName] = useState("");
  const [lines, setLines] = useState<InstallmentDraft[]>([newInstallment("100")]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await api.get<TermsTemplate[]>("/api/books/payment-terms");
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
      setTemplates([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setLine = (key: string, patch: Partial<InstallmentDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, newInstallment("0")]);
  const removeLine = (key: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  const pctSum = useMemo(
    () => lines.reduce((a, l) => a + (Number(l.pct) || 0), 0),
    [lines],
  );
  const pctOk = Math.abs(pctSum - 100) < 0.005;

  const reset = () => {
    setName("");
    setLines([newInstallment("100")]);
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter a template name"); return; }
    if (!pctOk) { toast.error(`Installment percentages must sum to 100 (currently ${pctSum.toFixed(2)})`); return; }
    setSaving(true);
    try {
      await api.post<TermsTemplate>("/api/books/payment-terms", {
        name: name.trim(),
        installments: lines.map((l) => ({
          pct: Number(l.pct) || 0,
          dueDays: Number(l.dueDays) || 0,
          basis: l.basis,
        })),
      });
      toast.success(`Template "${name.trim()}" created`);
      reset();
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* CREATE FORM */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Plus size={15} className="text-[var(--color-primary)]" /> New payment-terms template
        </h3>

        <div className="max-w-sm mb-4">
          <label className={labelCls}>Template name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 50% advance, 50% on 30 days"
            className={inputCls}
          />
        </div>

        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>#</Th>
                <Th right>Percentage</Th>
                <Th right>Due (value)</Th>
                <Th>Basis</Th>
                <Th right>—</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2 text-[var(--color-muted)] tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      value={l.pct}
                      onChange={(e) => setLine(l.key, { pct: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      className={`${inputCls} font-mono tabular-nums text-right max-w-[110px] ml-auto`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      value={l.dueDays}
                      onChange={(e) => setLine(l.key, { dueDays: e.target.value })}
                      inputMode="numeric"
                      placeholder="0"
                      className={`${inputCls} font-mono tabular-nums text-right max-w-[100px] ml-auto`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={l.basis}
                      onChange={(e) => setLine(l.key, { basis: e.target.value as Basis })}
                      className={inputCls}
                    >
                      {BASIS_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      disabled={lines.length === 1}
                      className="text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Remove installment"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
          >
            <Plus size={14} /> Add installment
          </button>

          {/* LIVE PREVIEW — pcts must sum to 100 */}
          <div
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
              pctOk
                ? "bg-green-900/30 text-green-300 border-green-700/40"
                : "bg-amber-900/30 text-amber-300 border-amber-700/40"
            }`}
          >
            {pctOk ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            <span className="tabular-nums">Total {pctSum.toFixed(2)}%</span>
            {pctOk ? <span>· sums to 100</span> : <span>· must be 100</span>}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button type="button" onClick={submit} disabled={saving || !pctOk} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Create template
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Templates</h3>
          <button type="button" onClick={() => void load()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Name</Th>
                <Th>Installments</Th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={2} />
              ) : templates.length === 0 ? (
                <tr><td colSpan={2} className="px-3 py-8 text-center text-[var(--color-muted)]">No templates yet — create one above.</td></tr>
              ) : (
                templates.map((t) => {
                  const insts = Array.isArray(t.installments) ? t.installments : [];
                  return (
                    <tr key={t.id} className="border-b border-[var(--color-border)] last:border-b-0 align-top">
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{t.name}</td>
                      <td className="px-3 py-2.5">
                        {insts.length === 0 ? (
                          <span className="text-[var(--color-muted)]">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {insts.map((ins, i) => (
                              <span
                                key={i}
                                className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]"
                              >
                                <span className="tabular-nums text-[var(--color-text)]">{num(ins.pct)}%</span>
                                {" · "}
                                <span className="tabular-nums">{num(ins.dueDays ?? ins.due_days)}</span>
                                {" "}{basisLabel(ins.basis)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIATION
// ─────────────────────────────────────────────────────────────────────────────
function ReconciliationSection() {
  const [parties, setParties] = useState<LedgerLite[]>([]);
  const [partyId, setPartyId] = useState("");

  const [credits, setCredits] = useState<UnappliedCredit[]>([]);
  const [bills, setBills] = useState<OpenBill[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<AutoApplyResponse | null>(null);

  // load party ledgers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get<LedgerLite[]>("/api/books/ledgers");
        if (cancelled) return;
        const all = Array.isArray(rows) ? rows : [];
        setParties(all.filter((l) => l.is_party));
      } catch (e) {
        if (!cancelled) toast.error(errMsg(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) { setCredits([]); setBills([]); setLoaded(false); return; }
    setBusy(true);
    setResult(null);
    try {
      const res = await api.get<UnappliedResponse>(`/api/books/parties/${id}/unapplied`);
      setCredits(res?.credits ?? res?.unappliedCredits ?? []);
      setBills(res?.bills ?? res?.openBills ?? []);
      setLoaded(true);
    } catch (e) {
      toast.error(errMsg(e));
      setCredits([]); setBills([]); setLoaded(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(partyId); }, [partyId, load]);

  const totalCredit = useMemo(
    () => credits.reduce((a, c) => a + num(c.unapplied ?? c.amount), 0),
    [credits],
  );
  const totalOpen = useMemo(
    () => bills.reduce((a, b) => a + num(b.outstanding ?? b.amount), 0),
    [bills],
  );

  const autoApply = async () => {
    if (!partyId) { toast.error("Pick a party first"); return; }
    setApplying(true);
    try {
      const res = await api.post<AutoApplyResponse>(`/api/books/parties/${partyId}/auto-apply`, {});
      setResult(res ?? {});
      const allocated = num(res?.allocated);
      toast.success(`Allocated ${rupee(allocated)} (FIFO)`);
      await load(partyId);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px]">
          <label className={labelCls}>Party (customer / vendor)</label>
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className={inputCls}>
            <option value="">Select a party…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load(partyId)}
          disabled={!partyId}
          className="text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30 pb-2.5"
          title="Refresh"
        >
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          onClick={autoApply}
          disabled={!partyId || applying || (loaded && (credits.length === 0 || bills.length === 0))}
          className={btnPrimary}
        >
          {applying ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
          Auto-apply (FIFO)
        </button>
      </div>

      {!partyId ? (
        <p className="text-sm text-[var(--color-muted)] text-center py-10 border border-dashed border-[var(--color-border)] rounded-lg">
          Pick a party to see unapplied credits and open bills.
        </p>
      ) : (
        <>
          {/* RESULT BANNER */}
          {result && (
            <div className="rounded-lg px-4 py-3 text-sm border bg-green-900/30 text-green-300 border-green-700/40">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 size={16} /> Allocated {rupee(result.allocated)} · remaining credit {rupee(result.remaining ?? result.remainingCredit)}
              </div>
              {Array.isArray(result.allocations) && result.allocations.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {result.allocations.map((a, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]">
                      #{a.voucherNumber ?? "—"} · <span className="tabular-nums text-[var(--color-text)]">{rupee(a.amount)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* UNAPPLIED CREDITS */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                <h3 className="text-sm font-semibold">Unapplied credits</h3>
                <span className="text-xs text-[var(--color-muted)] tabular-nums">{rupee(totalCredit)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <Th>Date</Th>
                      <Th>Voucher</Th>
                      <Th right>Unapplied</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {busy ? (
                      <SkeletonRows cols={3} rows={4} />
                    ) : credits.length === 0 ? (
                      <tr><td colSpan={3} className="px-3 py-8 text-center text-[var(--color-muted)]">No unapplied credits.</td></tr>
                    ) : (
                      credits.map((c, i) => (
                        <tr key={c.id ?? c.voucherId ?? i} className="border-b border-[var(--color-border)] last:border-b-0">
                          <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{c.date ?? "—"}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{c.voucherNumber ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{rupee(c.unapplied ?? c.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* OPEN BILLS */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                <h3 className="text-sm font-semibold">Open bills</h3>
                <span className="text-xs text-[var(--color-muted)] tabular-nums">{rupee(totalOpen)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <Th>Date</Th>
                      <Th>Voucher</Th>
                      <Th right>Outstanding</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {busy ? (
                      <SkeletonRows cols={3} rows={4} />
                    ) : bills.length === 0 ? (
                      <tr><td colSpan={3} className="px-3 py-8 text-center text-[var(--color-muted)]">No open bills.</td></tr>
                    ) : (
                      bills.map((b, i) => (
                        <tr key={b.id ?? b.voucherId ?? i} className="border-b border-[var(--color-border)] last:border-b-0">
                          <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{b.date ?? "—"}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{b.voucherNumber ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{rupee(b.outstanding ?? b.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
