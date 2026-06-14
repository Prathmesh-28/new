import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { formatCurrency, formatAmount } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { gstLedger } from "@/lib/finance";
import { Calculator, Calendar, FileText, CheckCircle2, Clock, AlertTriangle, Search, ShieldCheck, XCircle, RefreshCw, BookOpen } from "lucide-react";
import { toast } from "sonner";

interface Liability { month: number; year: number; output_tax: number; input_tax_credit: number; net_liability: number; breakdown: Record<string, number>; }
interface GstReturn  { id: string; return_type: string; period_month: number; period_year: number; output_tax: number; input_tax_credit: number; net_liability: number; status: string; filed_at?: string; gstn_arn?: string; }
interface CalDate    { label: string; due: string; penalty: string; }

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function GstPage() {
  const { store } = useApp();
  const firm = store.firm;
  const [tab, setTab]             = useState<"calculator" | "ledger" | "returns" | "calendar" | "verify">("calculator");
  const [gstin, setGstin]         = useState("");
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; status: string; gstin?: string; state?: string; stateCode?: string; pan?: string; source?: string; message?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyHistory, setVerifyHistory] = useState<{ gstin: string; state?: string; status: string }[]>([]);
  const [liability, setLiability] = useState<Liability | null>(null);
  const [returns, setReturns]     = useState<GstReturn[]>([]);
  const [calendar, setCalendar]   = useState<CalDate[]>([]);
  const [loading, setLoading]     = useState(false);
  const [selMonth, setSelMonth]   = useState(() => { const n = new Date(); return { m: n.getMonth() + 1, y: n.getFullYear() }; });

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
        {([["calculator", "Calculator", Calculator], ["ledger", "Ledger", BookOpen], ["returns", `Returns (${returns.length})`, FileText], ["calendar", "Calendar", Calendar], ["verify", "Verify GSTIN", ShieldCheck]] as const).map(([id, label, Icon]) => (
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
