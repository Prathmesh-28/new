import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Landmark, Download, RefreshCw, Calculator, FileJson, Receipt, Plus,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — response shapes mirror backend/src/modules/books/{gst,tds}.js
// ─────────────────────────────────────────────────────────────────────────────
interface SectionRec {
  voucherId: string;
  gstin: string | null;
  pos: string | null;
  rate: number;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  type?: string;
  noteType?: string;
}
interface B2csRec {
  rate: number;
  pos: string | null;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
}
interface Gstr1Sections {
  period: string;
  b2b: SectionRec[];
  b2cl: SectionRec[];
  b2cs: B2csRec[];
  cdnr: SectionRec[];
  exp: SectionRec[];
}
interface HsnRow {
  hsn: string;
  rate: number;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
}
interface HsnSummary {
  period: string;
  rows: HsnRow[];
}
interface Gstr3b {
  period: string;
  outputTax: string;
  inputTaxCredit: string;
  netLiability: string;
}
interface TdsReport {
  period: string;
  kind: string;
  base: string;
  amount: string;
  count: number | string;
}
interface TdsSection {
  section: string;
  description: string;
  rate: number;
  rateOther?: number;
  threshold?: number;
  aggregateThreshold?: number;
  noPan: number;
}
type TdsSections = Record<string, TdsSection>;
interface TdsCompute {
  section: string;
  rate: string;
  tdsAmount: string;
  netPayable: string;
}

interface Ledger {
  id: string;
  name: string;
  is_party: boolean;
  is_bank: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function rupee(v: string | number | null | undefined): string {
  const s = String(v ?? "").trim();
  return s ? `₹${s}` : "₹0.00";
}

const GST_RATES = [0, 5, 12, 18, 28] as const;

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const thCls =
  "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]";
const thR = `${thCls} text-right`;

// ─────────────────────────────────────────────────────────────────────────────
// SMALL PIECES
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, tint }: { label: string; value: string; tint?: "green" | "red" }) {
  const color =
    tint === "green" ? "text-green-400" : tint === "red" ? "text-red-400" : "text-[var(--color-primary)]";
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex-1 min-w-[140px]">
      <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        <span className="text-[var(--color-primary)]">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function SectionTable({
  title, count, rows,
}: {
  title: string;
  count: number;
  rows: (SectionRec | B2csRec)[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] tabular-nums">
          {count}
        </span>
      </div>
      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>GSTIN / PoS</th>
              <th className={thR}>Rate</th>
              <th className={thR}>Taxable</th>
              <th className={thR}>CGST</th>
              <th className={thR}>SGST</th>
              <th className={thR}>IGST</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">
                  No records in this section.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const gstin = "gstin" in r ? r.gstin : null;
                return (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs">{gstin || r.pos || "—"}</span>
                      {"noteType" in r && r.noteType && (
                        <span className="ml-2 text-[10px] text-[var(--color-muted)]">{r.noteType}</span>
                      )}
                      {"type" in r && r.type && (
                        <span className="ml-2 text-[10px] text-[var(--color-muted)]">{r.type}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.rate}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.taxable)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.cgst)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.sgst)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.igst)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksGstTab() {
  const [period, setPeriod] = useState(currentPeriod());

  // GSTR-1
  const [sections, setSections] = useState<Gstr1Sections | null>(null);
  const [hsn, setHsn] = useState<HsnSummary | null>(null);
  const [gstr1Busy, setGstr1Busy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // GSTR-3B + TDS summaries
  const [gstr3b, setGstr3b] = useState<Gstr3b | null>(null);
  const [tdsReport, setTdsReport] = useState<TdsReport | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);

  // Vendor ledgers (for RCM bill)
  const [vendors, setVendors] = useState<Ledger[]>([]);

  const loadGstr1 = useCallback(async (p: string) => {
    setGstr1Busy(true);
    try {
      const [s, h] = await Promise.all([
        api.get<Gstr1Sections>(`/api/books/gst/gstr1-sections?period=${encodeURIComponent(p)}`),
        api.get<HsnSummary>(`/api/books/gst/hsn-summary?period=${encodeURIComponent(p)}`),
      ]);
      setSections(s);
      setHsn(h);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setGstr1Busy(false);
    }
  }, []);

  const loadSummaries = useCallback(async (p: string) => {
    setSummaryBusy(true);
    try {
      const [g, t] = await Promise.all([
        api.get<Gstr3b>(`/api/books/gst/gstr3b?period=${encodeURIComponent(p)}`),
        api.get<TdsReport>(`/api/books/gst/tds?period=${encodeURIComponent(p)}`),
      ]);
      setGstr3b(g);
      setTdsReport(t);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSummaryBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadGstr1(period);
    void loadSummaries(period);
  }, [period, loadGstr1, loadSummaries]);

  useEffect(() => {
    (async () => {
      try {
        const l = await api.get<Ledger[]>("/api/books/ledgers");
        setVendors(Array.isArray(l) ? l.filter((x) => x.is_party) : []);
      } catch {
        /* vendor list optional */
      }
    })();
  }, []);

  const downloadJson = useCallback(async () => {
    setDownloading(true);
    try {
      const data = await api.get<unknown>(`/api/books/gst/gstr1-json?period=${encodeURIComponent(period)}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gstr1-${period}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded gstr1-${period}.json`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDownloading(false);
    }
  }, [period]);

  const refresh = () => {
    void loadGstr1(period);
    void loadSummaries(period);
  };

  return (
    <div className="space-y-6">
      {/* PERIOD PICKER + ACTIONS */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className={labelCls}>Tax period (month)</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value || currentPeriod())}
            className={inputCls}
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]"
        >
          <RefreshCw size={14} className={gstr1Busy || summaryBusy ? "animate-spin" : ""} /> Refresh
        </button>
        <button type="button" onClick={downloadJson} disabled={downloading} className={`${btnPrimary} ml-auto`}>
          {downloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
          Download GSTR-1 JSON
        </button>
      </div>

      {/* GSTR-3B + TDS SUMMARY */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="GSTR-3B output tax" value={rupee(gstr3b?.outputTax)} />
        <StatCard label="Input tax credit" value={rupee(gstr3b?.inputTaxCredit)} tint="green" />
        <StatCard
          label="Net GST liability"
          value={rupee(gstr3b?.netLiability)}
          tint={Number(gstr3b?.netLiability ?? 0) > 0 ? "red" : "green"}
        />
        <StatCard label="TDS deducted" value={rupee(tdsReport?.amount)} />
        <StatCard label="TDS base / count" value={`${rupee(tdsReport?.base)} · ${tdsReport?.count ?? 0}`} />
      </div>

      {/* GSTR-1 SECTIONS */}
      <Card title="GSTR-1 sections" icon={<Landmark size={15} />}>
        {gstr1Busy ? (
          <p className="text-sm text-[var(--color-muted)] py-6 text-center">Loading sections…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
              <StatCard label="B2B" value={String(sections?.b2b.length ?? 0)} />
              <StatCard label="B2CL" value={String(sections?.b2cl.length ?? 0)} />
              <StatCard label="B2CS" value={String(sections?.b2cs.length ?? 0)} />
              <StatCard label="CDNR" value={String(sections?.cdnr.length ?? 0)} />
              <StatCard label="EXP" value={String(sections?.exp.length ?? 0)} />
            </div>
            <SectionTable title="B2B" count={sections?.b2b.length ?? 0} rows={sections?.b2b ?? []} />
            <SectionTable title="B2CL" count={sections?.b2cl.length ?? 0} rows={sections?.b2cl ?? []} />
            <SectionTable title="B2CS" count={sections?.b2cs.length ?? 0} rows={sections?.b2cs ?? []} />
            <SectionTable title="CDNR (credit/debit notes)" count={sections?.cdnr.length ?? 0} rows={sections?.cdnr ?? []} />
            <SectionTable title="EXP / SEZ" count={sections?.exp.length ?? 0} rows={sections?.exp ?? []} />
          </div>
        )}
      </Card>

      {/* HSN SUMMARY */}
      <Card title="HSN / SAC summary (Table 12)" icon={<FileJson size={15} />}>
        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>HSN / SAC</th>
                <th className={thR}>Rate</th>
                <th className={thR}>Taxable</th>
                <th className={thR}>CGST</th>
                <th className={thR}>SGST</th>
                <th className={thR}>IGST</th>
                <th className={thR}>Total tax</th>
              </tr>
            </thead>
            <tbody>
              {(hsn?.rows.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--color-muted)]">
                    {gstr1Busy ? "Loading…" : "No HSN data for this period."}
                  </td>
                </tr>
              ) : (
                hsn!.rows.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-mono text-xs">{r.hsn || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.rate}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.taxable)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.cgst)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.sgst)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.igst)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rupee(r.totalTax)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* TDS CALCULATOR + RCM BILL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TdsCalculator />
        <RcmBillForm vendors={vendors} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TDS CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
function TdsCalculator() {
  const [sections, setSections] = useState<TdsSections>({});
  const [section, setSection] = useState("");
  const [amount, setAmount] = useState("");
  const [panAvailable, setPanAvailable] = useState(true);
  const [result, setResult] = useState<TdsCompute | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.get<TdsSections>("/api/books/tds/sections");
        setSections(s || {});
        const first = Object.keys(s || {})[0];
        if (first) setSection(first);
      } catch (e) {
        toast.error(errMsg(e));
      }
    })();
  }, []);

  const sectionList = useMemo(() => Object.values(sections), [sections]);

  const compute = async () => {
    if (!section) {
      toast.error("Pick a TDS section");
      return;
    }
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      toast.error("Enter an amount above zero");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<TdsCompute>("/api/books/tds/compute", {
        section,
        amount: amt,
        panAvailable,
      });
      setResult(res);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const selected = sections[section];

  return (
    <Card title="TDS calculator" icon={<Calculator size={15} />}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Section</label>
          <select value={section} onChange={(e) => { setSection(e.target.value); setResult(null); }} className={inputCls}>
            <option value="">Select section…</option>
            {sectionList.map((s) => (
              <option key={s.section} value={s.section}>
                {s.section} — {s.description} ({s.rate}%)
              </option>
            ))}
          </select>
          {selected && (
            <p className="text-[11px] text-[var(--color-muted)] mt-1">
              Base rate {selected.rate}% · no-PAN {selected.noPan}%
              {selected.threshold ? ` · threshold ₹${selected.threshold}` : ""}
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Amount (gross)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={`${inputCls} font-mono tabular-nums`}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={panAvailable}
            onChange={(e) => setPanAvailable(e.target.checked)}
            className="accent-[var(--color-primary)] w-4 h-4"
          />
          PAN available (uncheck for §206AA penal rate)
        </label>
        <button type="button" onClick={compute} disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />}
          Compute TDS
        </button>

        {result && (
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Rate</span>
              <span className="tabular-nums">{result.rate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">TDS amount</span>
              <span className="tabular-nums text-red-400">{rupee(result.tdsAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--color-border)] pt-1 mt-1 font-semibold">
              <span>Net payable</span>
              <span className="tabular-nums text-[var(--color-primary)]">{rupee(result.netPayable)}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RCM BILL (reverse charge purchase)
// ─────────────────────────────────────────────────────────────────────────────
function RcmBillForm({ vendors }: { vendors: Ledger[] }) {
  const [vendorLedgerId, setVendorLedgerId] = useState("");
  const [lineTotal, setLineTotal] = useState("");
  const [gstRate, setGstRate] = useState<number>(18);
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const base = Number(lineTotal) || 0;
  const tax = (base * gstRate) / 100;

  const submit = async () => {
    if (!vendorLedgerId) {
      toast.error("Pick a vendor ledger");
      return;
    }
    if (base <= 0) {
      toast.error("Enter a line total above zero");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ voucherNumber?: string }>("/api/books/documents/rcm-bill", {
        vendorLedgerId,
        lineTotal: base,
        gstRate,
        date,
      });
      toast.success(res?.voucherNumber ? `Posted RCM bill #${res.voucherNumber}` : "RCM bill posted");
      setLineTotal("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Reverse-charge (RCM) bill" icon={<Receipt size={15} />}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Vendor</label>
          <select value={vendorLedgerId} onChange={(e) => setVendorLedgerId(e.target.value)} className={inputCls}>
            <option value="">Select vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Line total</label>
            <input
              value={lineTotal}
              onChange={(e) => setLineTotal(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label className={labelCls}>GST rate</label>
            <select value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} className={inputCls}>
              {GST_RATES.map((r) => (
                <option key={r} value={r}>{r}%</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Taxable</span><span className="tabular-nums">₹{base.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">RCM GST @ {gstRate}%</span><span className="tabular-nums">₹{tax.toFixed(2)}</span></div>
          <p className="text-[var(--color-muted)] pt-1">Under reverse charge you self-account both output (payable) and input GST.</p>
        </div>
        <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} w-full`}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          Post RCM bill
        </button>
      </div>
    </Card>
  );
}
