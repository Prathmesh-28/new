import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { formatCurrency, formatAmount } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { gstLedger } from "@/lib/finance";
import { Calculator, Calendar, FileText, CheckCircle2, Clock, AlertTriangle, Search, ShieldCheck, XCircle, RefreshCw, BookOpen, GitCompare, Upload, Download, Receipt } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { parse2BJson, parseRegisterRows, reconcile, type ReconResult, type ReconSummary } from "@/lib/gstReconcile";

interface Liability { month: number; year: number; output_tax: number; input_tax_credit: number; net_liability: number; breakdown: Record<string, number>; }
interface GstReturn  { id: string; return_type: string; period_month: number; period_year: number; output_tax: number; input_tax_credit: number; net_liability: number; status: string; filed_at?: string; gstn_arn?: string; }
interface CalDate    { label: string; due: string; penalty: string; }

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function GstPage() {
  const { store } = useApp();
  const firm = store.firm;
  const [tab, setTab]             = useState<"calculator" | "ledger" | "returns" | "calendar" | "verify" | "match" | "gstr1">("calculator");
  const [gstin, setGstin]         = useState("");
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; status: string; gstin?: string; state?: string; stateCode?: string; pan?: string; source?: string; message?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyHistory, setVerifyHistory] = useState<{ gstin: string; state?: string; status: string }[]>([]);
  const [liability, setLiability] = useState<Liability | null>(null);
  const [returns, setReturns]     = useState<GstReturn[]>([]);
  const [calendar, setCalendar]   = useState<CalDate[]>([]);
  const [loading, setLoading]     = useState(false);
  const [selMonth, setSelMonth]   = useState(() => { const n = new Date(); return { m: n.getMonth() + 1, y: n.getFullYear() }; });

  // ── GSTR-2B reconciliation state ──
  const [twoBCount, setTwoBCount]   = useState<number | null>(null);
  const [regCount, setRegCount]     = useState<number | null>(null);
  const [twoBLines, setTwoBLines]   = useState<ReturnType<typeof parse2BJson>>([]);
  const [regLines, setRegLines]     = useState<ReturnType<typeof parseRegisterRows>>([]);
  const [recon, setRecon]           = useState<{ summary: ReconSummary; lines: ReconResult[] } | null>(null);
  const [reconErr, setReconErr]     = useState("");

  const onUpload2B = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = parse2BJson(String(reader.result || ""));
        setTwoBLines(lines); setTwoBCount(lines.length); setReconErr("");
      } catch (e) { setReconErr(e instanceof Error ? e.message : "Failed to read 2B JSON"); setTwoBCount(null); }
    };
    reader.readAsText(file);
  };

  const onUploadRegister = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        const lines = parseRegisterRows(rows);
        if (!lines.length) { setReconErr("No rows with a GSTIN + invoice number found. Check the column headers."); setRegCount(null); return; }
        setRegLines(lines); setRegCount(lines.length); setReconErr("");
      } catch { setReconErr("Couldn't parse the register — upload an .xlsx or .csv export."); setRegCount(null); }
    };
    reader.readAsArrayBuffer(file);
  };

  const runReconcile = () => {
    if (!twoBLines.length || !regLines.length) { toast.error("Upload both the GSTR-2B and your purchase register first"); return; }
    setRecon(reconcile(regLines, twoBLines));
    setTab("match");
  };

  const downloadReconReport = () => {
    if (!recon) return;
    const header = ["Status", "Supplier GSTIN", "Party", "Invoice No", "Register Tax", "2B Tax", "Delta"];
    const rows = recon.lines.map(l => [l.status, l.gstin, l.party ?? "", l.invoiceNo, l.registerTax, l.twoBTax, l.delta]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "gstr2b-reconciliation.csv"; a.click();
  };

  // ── GSTR-1 outward supplies ──
  const gstr1Data = useMemo(() => {
    const gstRate = firm.gstRate ?? 18;
    const halfRate = gstRate / 2;
    const monthInvoices = store.invoices.filter(inv => {
      if (!inv.invoiceDate) return false;
      const d = new Date(inv.invoiceDate);
      return d.getMonth() + 1 === selMonth.m && d.getFullYear() === selMonth.y;
    });
    let taxableTotal = 0, cgstTotal = 0, sgstTotal = 0;
    const lines = monthInvoices.map(inv => {
      const taxable = inv.amount;
      const cgst = Math.round(taxable * halfRate) / 100;
      const sgst = cgst;
      taxableTotal += taxable; cgstTotal += cgst; sgstTotal += sgst;
      return { ...inv, taxable, cgst, sgst, total: taxable + cgst + sgst };
    });
    return { lines, taxableTotal, cgstTotal, sgstTotal, totalTax: cgstTotal + sgstTotal, totalWithTax: taxableTotal + cgstTotal + sgstTotal };
  }, [store.invoices, selMonth, firm.gstRate]);

  const downloadGstr1Csv = () => {
    const header = ["Invoice No", "Date", "Customer", "Description", "Taxable Value", "CGST", "SGST", "Invoice Total", "Status"];
    const rows = gstr1Data.lines.map(l => [
      l.invoiceNumber ?? "", l.invoiceDate, l.customer, l.description,
      l.taxable.toFixed(2), l.cgst.toFixed(2), l.sgst.toFixed(2), l.total.toFixed(2), l.status,
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `GSTR1-${MONTH_NAMES[selMonth.m - 1]}-${selMonth.y}.csv`; a.click();
  };

  const ledger = useMemo(() => gstLedger(store, firm.gstRate ?? 18, 12), [store, firm.gstRate]);
  const ledgerTotals = useMemo(() => ({
    output: ledger.reduce((s, r) => s + r.outputTax, 0),
    input:  ledger.reduce((s, r) => s + r.inputCredit, 0),
    cash:   ledger.reduce((s, r) => s + r.cashPayable, 0),
    carry:  ledger[ledger.length - 1]?.itcCarryForward ?? 0,
  }), [ledger]);

  useEffect(() => {
    api.get<CalDate[]>("/api/gst/calendar").then(setCalendar).catch(() => {});
    api.get<GstReturn[]>("/api/gst/returns").then(setReturns).catch(() => {});
  }, []);

  const computeLiability = async () => {
    setLoading(true);
    try {
      const data = await api.get<Liability>(`/api/gst/liability?month=${selMonth.m}&year=${selMonth.y}`);
      setLiability(data);
    } catch { toast.error("Failed to compute GST liability"); }
    finally { setLoading(false); }
  };

  const createReturn = async () => {
    setLoading(true);
    try {
      const ret = await api.post<GstReturn>("/api/gst/returns", { return_type: "GSTR-3B", period_month: selMonth.m, period_year: selMonth.y });
      setReturns(prev => {
        const without = prev.filter(r => !(r.period_month === ret.period_month && r.period_year === ret.period_year));
        return [ret, ...without];
      });
      toast.success(`GSTR-3B for ${MONTH_NAMES[selMonth.m - 1]} ${selMonth.y} computed`);
      setTab("returns");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to compute return");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">GST</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          {firm.gstRegistered ? `GSTIN: ${firm.gstNumber || "—"} · GST rate: ${firm.gstRate ?? 18}%` : "Not GST registered — update in Settings"}
        </p>
      </div>

      {!firm.gstRegistered && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
          <p>GST calculations use the rate configured in <strong>Settings → Business profile</strong>. Update your GSTIN and rate for accurate figures.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit flex-wrap">
        {([["calculator", "Calculator", Calculator], ["ledger", "Ledger", BookOpen], ["gstr1", "GSTR-1", Receipt], ["returns", `Returns (${returns.length})`, FileText], ["match", "2B Match", GitCompare], ["calendar", "Calendar", Calendar], ["verify", "Verify GSTIN", ShieldCheck]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id as typeof tab)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {/* ── LEDGER ── */}
      {tab === "ledger" && (
        <div className="space-y-4">
          {/* Summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Output tax (12 mo)", value: ledgerTotals.output, color: "text-red-400", sub: "GST collected on sales" },
              { label: "Input tax credit",   value: ledgerTotals.input,  color: "text-green-400", sub: "ITC on purchases" },
              { label: "Cash paid / payable", value: ledgerTotals.cash,   color: "text-[var(--color-text)]", sub: "After using credit" },
              { label: "ITC carry-forward",   value: ledgerTotals.carry,  color: "text-[var(--color-primary)]", sub: "Unused credit balance" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{formatAmount(k.value)}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold">GST Ledger · last 12 months</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Output tax minus input credit, with unused ITC carried forward each month — at {firm.gstRate ?? 18}% on operating transactions.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <tr>
                    {["Month", "Taxable sales", "Output tax", "Input credit", "Net", "ITC c/f", "Cash payable"].map((h, i) => (
                      <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {ledger.map((r, i) => (
                    <tr key={r.monthKey} className={`hover:bg-white/2 text-xs ${i === ledger.length - 1 ? "bg-[var(--color-accent)]/30" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{r.label}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{formatAmount(r.taxableSales)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-400">{formatAmount(r.outputTax)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{formatAmount(r.inputCredit)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${r.netThisMonth >= 0 ? "" : "text-green-400"}`}>{r.netThisMonth < 0 ? `(${formatAmount(Math.abs(r.netThisMonth))})` : formatAmount(r.netThisMonth)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{formatAmount(r.itcCarryForward)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatAmount(r.cashPayable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
            <AlertTriangle size={12} className="text-[var(--color-muted)] shrink-0 mt-px" />
            A surplus month (input &gt; output) adds to your ITC carry-forward, which automatically offsets cash payable in later months — just like the GST portal's electronic credit ledger.
          </div>
        </div>
      )}

      {/* ── CALCULATOR ── */}
      {tab === "calculator" && (
        <div className="max-w-lg space-y-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <select value={selMonth.m} onChange={e => setSelMonth(s => ({ ...s, m: parseInt(e.target.value) }))}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                  {MONTH_NAMES.map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
                </select>
                <select value={selMonth.y} onChange={e => setSelMonth(s => ({ ...s, y: parseInt(e.target.value) }))}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                  {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button onClick={computeLiability} disabled={loading}
                className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
                <Calculator size={13} /> {loading ? "Computing…" : "Compute"}
              </button>
            </div>

            {liability ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Output Tax", value: liability.output_tax, color: "text-red-400" },
                    { label: "Input Tax Credit", value: liability.input_tax_credit, color: "text-green-400" },
                    { label: "Net Liability", value: liability.net_liability, color: "text-[var(--color-primary)]" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-center">
                      <p className="text-[10px] text-[var(--color-muted)] mb-1">{label}</p>
                      <p className={`text-lg font-bold tabular-nums ${color}`}>{formatCurrency(value)}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                  <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">GSTR-3B Breakdown</p>
                  {[
                    ["Taxable turnover", liability.breakdown.taxable_turnover],
                    ["Output CGST", liability.breakdown.output_cgst],
                    ["Output SGST", liability.breakdown.output_sgst],
                    ["ITC CGST", liability.breakdown.itc_cgst],
                    ["ITC SGST", liability.breakdown.itc_sgst],
                    ["Net liability", liability.net_liability],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex justify-between text-xs py-1 border-b border-[var(--color-border)] last:border-0">
                      <span className="text-[var(--color-muted)]">{label}</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(Number(val))}</span>
                    </div>
                  ))}
                </div>

                <button onClick={createReturn} disabled={loading}
                  className="w-full text-sm border border-[var(--color-primary)]/40 text-[var(--color-primary)] font-semibold py-2.5 rounded-lg hover:bg-[var(--color-primary)]/5 disabled:opacity-50">
                  Save as GSTR-3B Draft
                </button>
                <p className="text-[11px] text-[var(--color-muted)] text-center">
                  v1: computed from transaction data. Masters India GSP integration in v2 for actual e-filing.
                </p>
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-[var(--color-muted)]">
                Select a month and click Compute to see your GSTR-3B figures.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RETURNS ── */}
      {tab === "returns" && (
        <div className="space-y-3">
          {returns.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center text-sm text-[var(--color-muted)]">
              No returns computed yet. Use the Calculator tab.
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>
                    {["Period", "Type", "Output Tax", "ITC", "Net Liability", "Status", "ARN"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {returns.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-3 font-medium">{MONTH_NAMES[r.period_month - 1]} {r.period_year}</td>
                      <td className="px-4 py-3 text-xs">{r.return_type}</td>
                      <td className="px-4 py-3 tabular-nums text-red-400">{formatCurrency(r.output_tax)}</td>
                      <td className="px-4 py-3 tabular-nums text-green-400">{formatCurrency(r.input_tax_credit)}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-[var(--color-primary)]">{formatCurrency(r.net_liability)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${r.status === "filed" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                          {r.status === "filed" ? <CheckCircle2 size={9} /> : <Clock size={9} />}{r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{r.gstn_arn ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CALENDAR ── */}
      {tab === "calendar" && (
        <div className="max-w-lg space-y-2">
          {calendar.map((c, i) => {
            const daysLeft = Math.ceil((new Date(c.due).getTime() - Date.now()) / 86400000);
            const urgent   = daysLeft <= 7;
            const soon     = daysLeft <= 30;
            return (
              <div key={i} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${urgent ? "border-red-700/60" : soon ? "border-yellow-700/50" : "border-[var(--color-border)]"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{c.label}</p>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">Due: {new Date(c.due).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                    <p className="text-[11px] text-[var(--color-muted)]/60 mt-0.5">{c.penalty}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${urgent ? "bg-red-900/30 text-red-400" : soon ? "bg-yellow-900/30 text-yellow-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>
                    {daysLeft === 0 ? "Today" : daysLeft < 0 ? `${Math.abs(daysLeft)}d late` : `${daysLeft}d`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* ── GSTR-2B ITC RECONCILIATION ── */}
      {tab === "match" && (
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-bold mb-1">GSTR-2B Reconciliation</h2>
            <p className="text-sm text-[var(--color-muted)]">
              Match your purchase register against the GSTN-auto-drafted 2B to catch ITC that's blocked (supplier hasn't filed) or unclaimed — before you file GSTR-3B.
            </p>
          </div>

          {/* Uploaders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-lg p-4 cursor-pointer hover:border-[var(--color-primary)]/50 transition-colors block">
              <div className="flex items-center gap-2 mb-1"><Upload size={14} className="text-[var(--color-primary)]" /><span className="text-sm font-semibold">GSTR-2B (JSON)</span></div>
              <p className="text-xs text-[var(--color-muted)]">Download from gst.gov.in → Returns → GSTR-2B → Download (JSON).</p>
              {twoBCount != null && <p className="text-xs text-green-400 mt-1">✓ {twoBCount} invoices loaded</p>}
              <input type="file" accept=".json,application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload2B(f); }} />
            </label>
            <label className="bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-lg p-4 cursor-pointer hover:border-[var(--color-primary)]/50 transition-colors block">
              <div className="flex items-center gap-2 mb-1"><Upload size={14} className="text-[var(--color-primary)]" /><span className="text-sm font-semibold">Purchase register (Excel/CSV)</span></div>
              <p className="text-xs text-[var(--color-muted)]">Columns: Supplier GSTIN, Invoice No, Taxable Value, IGST/CGST/SGST (or Total Tax).</p>
              {regCount != null && <p className="text-xs text-green-400 mt-1">✓ {regCount} rows loaded</p>}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUploadRegister(f); }} />
            </label>
          </div>

          {reconErr && (
            <div className="text-xs bg-red-950/30 border border-red-800/40 text-red-400 rounded-lg px-4 py-3">{reconErr}</div>
          )}

          <button onClick={runReconcile} disabled={!twoBCount || !regCount}
            className="text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5">
            <GitCompare size={14} /> Reconcile
          </button>

          {recon && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "ITC at risk", value: formatCurrency(recon.summary.itcAtRisk), sub: `${recon.summary.counts.missing_in_2b} not in 2B`, color: "text-red-400" },
                  { label: "Mismatched tax", value: formatCurrency(Math.abs(recon.summary.mismatchDelta)), sub: `${recon.summary.counts.mismatch} invoices`, color: "text-orange-400" },
                  { label: "Available, unclaimed", value: formatCurrency(recon.summary.itcAvailableUnclaimed), sub: `${recon.summary.counts.missing_in_books} only in 2B`, color: "text-yellow-400" },
                  { label: "Matched ITC", value: formatCurrency(recon.summary.matchedTax), sub: `${recon.summary.counts.matched} invoices`, color: "text-green-400" },
                ].map(s => (
                  <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                    <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
                    <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button onClick={downloadReconReport} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg">
                  <Download size={12} /> Download report (CSV)
                </button>
              </div>

              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-left px-3 py-2 font-medium">Supplier</th>
                        <th className="text-left px-3 py-2 font-medium">Invoice</th>
                        <th className="text-right px-3 py-2 font-medium">Register tax</th>
                        <th className="text-right px-3 py-2 font-medium">2B tax</th>
                        <th className="text-right px-3 py-2 font-medium">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recon.lines.slice(0, 200).map(l => {
                        const meta: Record<string, { label: string; cls: string }> = {
                          missing_in_2b:    { label: "Not in 2B",    cls: "bg-red-950/40 text-red-400 border-red-800/30" },
                          mismatch:         { label: "Mismatch",     cls: "bg-orange-950/40 text-orange-400 border-orange-800/30" },
                          missing_in_books: { label: "Only in 2B",   cls: "bg-yellow-950/40 text-yellow-400 border-yellow-800/30" },
                          matched:          { label: "Matched",      cls: "bg-green-950/40 text-green-400 border-green-800/30" },
                        };
                        const m = meta[l.status];
                        return (
                          <tr key={l.key} className="border-t border-[var(--color-border)]">
                            <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${m.cls}`}>{m.label}</span></td>
                            <td className="px-3 py-2"><span className="text-[var(--color-text)]">{l.party || "—"}</span><br /><span className="text-[10px] text-[var(--color-muted)] font-mono">{l.gstin}</span></td>
                            <td className="px-3 py-2 font-mono">{l.invoiceNo}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l.registerTax ? formatCurrency(l.registerTax) : "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l.twoBTax ? formatCurrency(l.twoBTax) : "—"}</td>
                            <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(l.delta) > 1 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{l.delta ? formatCurrency(l.delta) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {recon.lines.length > 200 && <p className="text-[10px] text-[var(--color-muted)] px-3 py-2">Showing first 200 of {recon.lines.length} — download the CSV for the full report.</p>}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── GSTR-1 OUTWARD SUPPLIES ── */}
      {tab === "gstr1" && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-bold">GSTR-1 — Outward Supplies</h2>
              <p className="text-sm text-[var(--color-muted)]">
                B2C/B2B outward supply summary from your invoice register. Select a month, verify figures, then export CSV for portal upload.
              </p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <select value={selMonth.m} onChange={e => setSelMonth(s => ({ ...s, m: parseInt(e.target.value) }))}
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                {MONTH_NAMES.map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
              </select>
              <select value={selMonth.y} onChange={e => setSelMonth(s => ({ ...s, y: parseInt(e.target.value) }))}
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={downloadGstr1Csv} disabled={!gstr1Data.lines.length}
                className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-2 rounded-lg disabled:opacity-40">
                <Download size={12} /> CSV
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Invoices", value: String(gstr1Data.lines.length), color: "text-[var(--color-primary)]", sub: `${MONTH_NAMES[selMonth.m - 1]} ${selMonth.y}` },
              { label: "Taxable turnover", value: formatCurrency(gstr1Data.taxableTotal), color: "text-[var(--color-text)]", sub: "excl. GST" },
              { label: "Output CGST + SGST", value: formatCurrency(gstr1Data.totalTax), color: "text-red-400", sub: `@ ${(firm.gstRate ?? 18) / 2}% each` },
              { label: "Total with GST", value: formatCurrency(gstr1Data.totalWithTax), color: "text-[var(--color-text)]", sub: "gross invoice value" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          {gstr1Data.lines.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center text-sm text-[var(--color-muted)]">
              No invoices found for {MONTH_NAMES[selMonth.m - 1]} {selMonth.y}. Add invoices in the Receivables page first.
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                    <tr>
                      {["Invoice #", "Date", "Customer", "Taxable", "CGST", "SGST", "Total", "Status"].map((h, i) => (
                        <th key={h} className={`px-3 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : i <= 2 ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gstr1Data.lines.map(l => (
                      <tr key={l.id} className="border-t border-[var(--color-border)] hover:bg-white/2">
                        <td className="px-3 py-2 font-mono text-[var(--color-muted)]">{l.invoiceNumber ?? "—"}</td>
                        <td className="px-3 py-2">{new Date(l.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                        <td className="px-3 py-2 max-w-[140px] truncate">{l.customer}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatAmount(l.taxable)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orange-400">{formatAmount(l.cgst)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orange-400">{formatAmount(l.sgst)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatAmount(l.total)}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${l.status === "paid" ? "bg-green-950/40 text-green-400 border-green-800/30" : l.status === "overdue" ? "bg-red-950/40 text-red-400 border-red-800/30" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                            {l.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                    <tr>
                      <td colSpan={3} className="px-3 py-2.5 text-xs font-bold">Total</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold">{formatAmount(gstr1Data.taxableTotal)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-orange-400">{formatAmount(gstr1Data.cgstTotal)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-orange-400">{formatAmount(gstr1Data.sgstTotal)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold">{formatAmount(gstr1Data.totalWithTax)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
            <AlertTriangle size={12} className="text-[var(--color-muted)] shrink-0 mt-px" />
            Amounts derive from your invoice register (taxable value × rate ÷ 2 for CGST/SGST). Review and correct GST rates per line on the portal before filing. Inter-state supplies (IGST) and HSN-wise B2B/B2C splits require GSP integration.
          </div>
        </div>
      )}

      {/* ── VERIFY GSTIN ── */}
      {tab === "verify" && (
        <div className="space-y-4 max-w-xl">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <h2 className="text-sm font-semibold mb-1">Verify vendor / customer GSTIN</h2>
            <p className="text-xs text-[var(--color-muted)] mb-4">Check if a GSTIN is valid and active before a transaction. Paying a suspended GST registrant can put your ITC at risk.</p>
            <div className="flex gap-2">
              <input
                value={gstin}
                onChange={e => setGstin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15))}
                placeholder="27AAAAA0000A1Z5"
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)] font-mono tracking-wider"
                maxLength={15}
              />
              <button
                onClick={async () => {
                  if (gstin.length !== 15) { toast.error("Enter a valid 15-character GSTIN"); return; }
                  setVerifying(true);
                  setVerifyResult(null);
                  try {
                    const res = await api.get<NonNullable<typeof verifyResult>>(`/api/gst/verify?gstin=${gstin}`);
                    setVerifyResult(res);
                    setVerifyHistory(h => [{ gstin, state: res.state, status: res.status }, ...h.filter(x => x.gstin !== gstin).slice(0, 9)]);
                  } catch (e) {
                    // Honest failure — never fabricate a trade name / status.
                    const msg = String((e as Error)?.message || "");
                    toast.error(msg.startsWith("400") ? "Not a valid GSTIN format." : "Couldn't verify GSTIN. Please try again.");
                  } finally { setVerifying(false); }
                }}
                disabled={verifying || gstin.length < 15}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-40"
              >
                {verifying ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                Verify
              </button>
            </div>

            {verifyResult && (
              <div className={`mt-4 rounded-lg border p-4 ${verifyResult.valid ? "bg-green-950/20 border-green-800/30" : "bg-red-950/20 border-red-800/30"}`}>
                <div className="flex items-center gap-2 mb-1">
                  {verifyResult.valid
                    ? <CheckCircle2 size={16} className="text-green-400" />
                    : <XCircle size={16} className="text-red-400" />}
                  <p className={`text-sm font-bold ${verifyResult.valid ? "text-green-300" : "text-red-300"}`}>
                    {verifyResult.valid ? "Format & check digit valid" : "Invalid GSTIN"}
                  </p>
                </div>
                {verifyResult.message && <p className="text-xs text-[var(--color-muted)] mb-3">{verifyResult.message}</p>}
                {verifyResult.valid && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ["GSTIN",      verifyResult.gstin ?? gstin],
                      ["State",      verifyResult.state],
                      ["State code", verifyResult.stateCode],
                      ["PAN",        verifyResult.pan],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="text-[var(--color-muted)]">{k}</p>
                        <p className="font-semibold text-[var(--color-text)]">{v}</p>
                      </div>
                    ))}
                  </div>
                )}
                {verifyResult.valid && verifyResult.source === "format" && (
                  <p className="text-[11px] text-[var(--color-muted)] mt-3">
                    ℹ This checks the GSTIN structure + check digit only (offline). Connect a GST verification provider for live trade name &amp; active/suspended status.
                  </p>
                )}
              </div>
            )}
          </div>

          {verifyHistory.length > 0 && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Recent verifications</h3>
              <div className="space-y-2">
                {verifyHistory.map(h => (
                  <div key={h.gstin} className="flex items-center gap-3 py-1.5 border-b border-[var(--color-border)] last:border-0">
                    {h.status !== "invalid"
                      ? <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                      : <XCircle size={12} className="text-red-400 shrink-0" />}
                    <span className="text-xs font-mono text-[var(--color-muted)] shrink-0">{h.gstin}</span>
                    <span className="text-xs text-[var(--color-text)] flex-1 truncate">{h.state ?? ""}</span>
                    <button onClick={() => setGstin(h.gstin)} className="text-[10px] text-[var(--color-primary)] hover:underline shrink-0">Re-verify</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">Why verify before payment?</h3>
            <div className="space-y-2 text-xs text-[var(--color-muted)]">
              {[
                "ITC claims on invoices from cancelled/suspended GSTINs are disallowed and may trigger notices",
                "Fake GSTIN vendors charge GST but don't deposit it — you lose the credit and face scrutiny",
                "GSTN reconciliation mismatches (GSTR-2A vs 2B) can block refunds for months",
              ].map(t => (
                <div key={t} className="flex items-start gap-2">
                  <ShieldCheck size={11} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
                  <p>{t}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
