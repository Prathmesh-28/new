import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";
import {
  Landmark, Download, RefreshCw, Calculator, FileJson, Receipt, Plus,
  Percent, Banknote, ShieldAlert, Ban, GitCompareArrows,
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

// ── New: GST rate master · PMT-06 challans · liability vs paid · blocked ITC ──
interface GstRateRow {
  hsn: string;
  rate: number | string;
  cessRate: number | string;
  description?: string | null;
}
interface ChallanRow {
  id: string;
  period: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
  cin: string | null;
  bankRef: string | null;
  paidOn: string | null;
  status: string;
  createdAt?: string;
}
type HeadMap = { CGST: string; SGST: string; IGST: string; CESS: string };
interface LiabilityVsPaid {
  period: string;
  liability: HeadMap;
  paid: HeadMap;
  netToPay: HeadMap;
}
interface BlockedItc {
  period: string;
  basis: string;
  byHead: HeadMap;
  totalBlocked: string;
}

// ── New: GSTR-2B ITC match (invoice-level) ──
interface Gstr2bMatchRow {
  gstin?: string | null;
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  taxable?: string | number | null;
  tax?: string | number | null;
  diff?: string | number | null;
  reason?: string | null;
}
interface Gstr2bMatchResult {
  period?: string;
  matched?: Gstr2bMatchRow[];
  probable?: Gstr2bMatchRow[];
  missingInBooks?: Gstr2bMatchRow[];
  missingInPortal?: Gstr2bMatchRow[];
  summary?: { itcAtRisk?: string | number };
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
        <div className="ml-auto">
          <ExportMenu
            size="sm"
            filename={`gstr1-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
            title={`GSTR-1 ${title}`}
            columns={[
              { key: "gstin", label: "GSTIN" },
              { key: "pos", label: "PoS" },
              { key: "rate", label: "Rate %" },
              { key: "taxable", label: "Taxable" },
              { key: "cgst", label: "CGST" },
              { key: "sgst", label: "SGST" },
              { key: "igst", label: "IGST" },
            ]}
            rows={rows as unknown as Record<string, unknown>[]}
          />
        </div>
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

  // GSTR-3B + TDS summary as exportable rows (mirrors the StatCards on screen)
  const summaryRows: Record<string, unknown>[] = [
    { metric: "GSTR-3B output tax", value: rupee(gstr3b?.outputTax) },
    { metric: "Input tax credit", value: rupee(gstr3b?.inputTaxCredit) },
    { metric: "Net GST liability", value: rupee(gstr3b?.netLiability) },
    { metric: "TDS deducted", value: rupee(tdsReport?.amount) },
    { metric: "TDS base", value: rupee(tdsReport?.base) },
    { metric: "TDS count", value: String(tdsReport?.count ?? 0) },
  ];

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
        <div className="ml-auto flex items-center gap-2">
          <ExportMenu
            filename={`gst-summary-${period}`}
            title={`GST summary · ${period}`}
            columns={[
              { key: "metric", label: "Metric" },
              { key: "value", label: "Value" },
            ]}
            rows={summaryRows}
          />
          <button type="button" onClick={downloadJson} disabled={downloading} className={btnPrimary}>
            {downloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            Download GSTR-1 JSON
          </button>
        </div>
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
        <div className="flex justify-end mb-3 -mt-2">
          <ExportMenu
            size="sm"
            filename={`hsn-summary-${period}`}
            title={`HSN / SAC summary · ${period}`}
            columns={[
              { key: "hsn", label: "HSN / SAC" },
              { key: "rate", label: "Rate %" },
              { key: "taxable", label: "Taxable" },
              { key: "cgst", label: "CGST" },
              { key: "sgst", label: "SGST" },
              { key: "igst", label: "IGST" },
              { key: "totalTax", label: "Total tax" },
            ]}
            rows={(hsn?.rows ?? []) as unknown as Record<string, unknown>[]}
          />
        </div>
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

      {/* LIABILITY vs PAID (PMT-06 net-to-pay) + BLOCKED ITC */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LiabilityVsPaidCard period={period} />
        <BlockedItcCard period={period} />
      </div>

      {/* GSTR-2B ITC MATCH (invoice-level) */}
      <Gstr2bMatchCard period={period} />

      {/* GST CHALLAN (PMT-06) REGISTER */}
      <GstChallanCard period={period} />

      {/* GST RATE MASTER (HSN ↔ rate / cess) */}
      <GstRateMaster />

      {/* E-INVOICE CANCEL (IRN) */}
      <EinvoiceCancelCard />
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

// ─────────────────────────────────────────────────────────────────────────────
// LIABILITY vs PAID — electronic-cash-ledger net-to-pay for the period
// ─────────────────────────────────────────────────────────────────────────────
const HEADS = ["CGST", "SGST", "IGST", "CESS"] as const;

function LiabilityVsPaidCard({ period }: { period: string }) {
  const [data, setData] = useState<LiabilityVsPaid | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const d = await api.get<LiabilityVsPaid>(
          `/api/books/gst/liability-vs-paid?period=${encodeURIComponent(period)}`,
        );
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) toast.error(errMsg(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const totalNet = HEADS.reduce((a, h) => a + (Number(data?.netToPay?.[h]) || 0), 0);

  return (
    <Card title="Net GST to pay (PMT-06)" icon={<Banknote size={15} />}>
      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>Head</th>
              <th className={thR}>Liability</th>
              <th className={thR}>Paid</th>
              <th className={thR}>Net to pay</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
            ) : (
              HEADS.map((h) => {
                const net = Number(data?.netToPay?.[h]) || 0;
                return (
                  <tr key={h} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{h}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(data?.liability?.[h])}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-green-400">{rupee(data?.paid?.[h])}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${net > 0 ? "text-red-400" : "text-green-400"}`}>
                      {rupee(data?.netToPay?.[h])}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mt-2">
        Net-to-pay this period: <span className={`font-semibold ${totalNet > 0 ? "text-red-400" : "text-green-400"}`}>₹{totalNet.toFixed(2)}</span>. Record a PMT-06 challan below to settle it.
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKED ITC (s.17(5)) — input credit that cannot be claimed
// ─────────────────────────────────────────────────────────────────────────────
function BlockedItcCard({ period }: { period: string }) {
  const [data, setData] = useState<BlockedItc | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const d = await api.get<BlockedItc>(
          `/api/books/gst/blocked-itc?period=${encodeURIComponent(period)}`,
        );
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) toast.error(errMsg(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  return (
    <Card title="Blocked ITC — s.17(5)" icon={<ShieldAlert size={15} />}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          {HEADS.map((h) => (
            <StatCard key={h} label={h} value={rupee(data?.byHead?.[h])} tint="red" />
          ))}
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between font-semibold">
            <span>Total blocked credit</span>
            <span className="tabular-nums text-red-400">{busy ? "…" : rupee(data?.totalBlocked)}</span>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] pt-1">
            Basis: {data?.basis === "VOUCHER_IDS" ? "explicit vouchers" : "supply_type = BLOCKED"}. This credit is excluded from claimable ITC and must not be set off against output tax.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GST CHALLAN (PMT-06) REGISTER — record a challan + list for the period
// ─────────────────────────────────────────────────────────────────────────────
function GstChallanCard({ period }: { period: string }) {
  const [rows, setRows] = useState<ChallanRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const [cgst, setCgst] = useState("");
  const [sgst, setSgst] = useState("");
  const [igst, setIgst] = useState("");
  const [cess, setCess] = useState("");
  const [cin, setCin] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [paidOn, setPaidOn] = useState("");

  const load = useCallback(async (p: string) => {
    setBusy(true);
    try {
      const r = await api.get<ChallanRow[]>(`/api/books/gst/challans?period=${encodeURIComponent(p)}`);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(period); }, [period, load]);

  const reset = () => {
    setCgst(""); setSgst(""); setIgst(""); setCess(""); setCin(""); setBankRef(""); setPaidOn("");
  };

  const submit = async () => {
    const num = (v: string) => Number(v) || 0;
    if (num(cgst) + num(sgst) + num(igst) + num(cess) <= 0) {
      toast.error("Enter at least one tax head above zero");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<ChallanRow>("/api/books/gst/challans", {
        period,
        cgst: num(cgst),
        sgst: num(sgst),
        igst: num(igst),
        cess: num(cess),
        cin: cin.trim() || undefined,
        bankRef: bankRef.trim() || undefined,
        paidOn: paidOn || undefined,
      });
      toast.success(res?.status === "PAID" ? "Challan recorded (PAID)" : "Challan recorded (PENDING)");
      reset();
      setOpen(false);
      await load(period);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="GST challans (PMT-06)" icon={<Receipt size={15} />}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-xs text-[var(--color-muted)]">A challan is marked PAID once it has both a CIN and a paid-on date.</p>
        <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>
          <Plus size={14} /> New challan
        </button>
      </div>

      {open && (
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className={labelCls}>CGST</label><input value={cgst} onChange={(e) => setCgst(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} /></div>
            <div><label className={labelCls}>SGST</label><input value={sgst} onChange={(e) => setSgst(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} /></div>
            <div><label className={labelCls}>IGST</label><input value={igst} onChange={(e) => setIgst(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} /></div>
            <div><label className={labelCls}>Cess</label><input value={cess} onChange={(e) => setCess(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={labelCls}>CIN (challan id)</label><input value={cin} onChange={(e) => setCin(e.target.value)} placeholder="optional" className={inputCls} /></div>
            <div><label className={labelCls}>Bank ref</label><input value={bankRef} onChange={(e) => setBankRef(e.target.value)} placeholder="optional" className={inputCls} /></div>
            <div><label className={labelCls}>Paid on</label><input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputCls} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setOpen(false); reset(); }} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Record challan
            </button>
          </div>
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>CIN / Bank ref</th>
              <th className={thCls}>Paid on</th>
              <th className={thR}>CGST</th>
              <th className={thR}>SGST</th>
              <th className={thR}>IGST</th>
              <th className={thR}>Cess</th>
              <th className={thCls}>Status</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--color-muted)]">No challans for this period.</td></tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs">{c.cin || "—"}</span>
                    {c.bankRef && <span className="ml-2 text-[10px] text-[var(--color-muted)]">{c.bankRef}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{c.paidOn || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(c.cgst)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(c.sgst)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(c.igst)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(c.cess)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      c.status === "PAID"
                        ? "bg-green-900/30 text-green-300 border-green-700/40"
                        : "bg-amber-900/30 text-amber-300 border-amber-700/40"
                    }`}>{c.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GST RATE MASTER — HSN/SAC ↔ GST rate + cess (upsert + list)
// ─────────────────────────────────────────────────────────────────────────────
function GstRateMaster() {
  const [rows, setRows] = useState<GstRateRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [hsn, setHsn] = useState("");
  const [rate, setRate] = useState<number>(18);
  const [cessRate, setCessRate] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get<GstRateRow[]>("/api/books/gst/rates");
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!hsn.trim()) {
      toast.error("Enter an HSN / SAC code");
      return;
    }
    setSaving(true);
    try {
      await api.post<GstRateRow>("/api/books/gst/rates", {
        hsn: hsn.trim(),
        rate,
        cessRate: Number(cessRate) || 0,
        description: description.trim() || undefined,
      });
      toast.success(`Saved rate for HSN ${hsn.trim()}`);
      setHsn(""); setCessRate(""); setDescription(""); setRate(18);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="GST rate master (HSN / SAC)" icon={<Percent size={15} />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end mb-4">
        <div>
          <label className={labelCls}>HSN / SAC</label>
          <input value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="e.g. 9983" className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className={labelCls}>GST rate</label>
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className={inputCls}>
            {GST_RATES.map((r) => (<option key={r} value={r}>{r}%</option>))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Cess %</label>
          <input value={cessRate} onChange={(e) => setCessRate(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
        </div>
        <div className="lg:col-span-1">
          <label className={labelCls}>Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" className={inputCls} />
        </div>
        <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Save rate
        </button>
      </div>

      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>HSN / SAC</th>
              <th className={thR}>GST rate</th>
              <th className={thR}>Cess</th>
              <th className={thCls}>Description</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-[var(--color-muted)]">No rates configured yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.hsn} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5 font-mono text-xs">{r.hsn}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.rate}%</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{Number(r.cessRate) ? `${r.cessRate}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-[var(--color-muted)]">{r.description || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GSTR-2B ITC MATCH (invoice-level) — paste portal 2B CSV, reconcile vs books
// ─────────────────────────────────────────────────────────────────────────────
const GSTR2B_PLACEHOLDER =
  "gstin,invoiceNo,invoiceDate,taxable,tax\n29AABCT1234A1Z5,INV-001,2026-05-03,10000,1800\n27AAACX5678B1Z2,INV-014,2026-05-11,5000,900";

function parseGstr2bCsv(text: string): Gstr2bMatchRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  // detect + skip a header row if it names known columns
  const first = lines[0].toLowerCase();
  const hasHeader = /gstin|invoice|taxable|tax/.test(first);
  const body = hasHeader ? lines.slice(1) : lines;
  const rows: Gstr2bMatchRow[] = [];
  for (const line of body) {
    const c = line.split(",").map((x) => x.trim());
    if (c.every((x) => !x)) continue;
    rows.push({
      gstin: c[0] || null,
      invoiceNo: c[1] || null,
      invoiceDate: c[2] || null,
      taxable: c[3] ?? null,
      tax: c[4] ?? null,
    });
  }
  return rows;
}

function Gstr2bBucketTable({ title, rows, tint }: { title: string; rows: Gstr2bMatchRow[]; tint?: "green" | "red" | "amber" }) {
  const dot =
    tint === "green" ? "bg-green-400" : tint === "red" ? "bg-red-400" : tint === "amber" ? "bg-amber-400" : "bg-[var(--color-primary)]";
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] tabular-nums">
          {rows.length}
        </span>
        <div className="ml-auto">
          <ExportMenu
            size="sm"
            filename={`gstr2b-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
            title={`GSTR-2B · ${title}`}
            columns={[
              { key: "gstin", label: "GSTIN" },
              { key: "invoiceNo", label: "Invoice" },
              { key: "invoiceDate", label: "Date" },
              { key: "taxable", label: "Taxable" },
              { key: "tax", label: "Tax" },
              { key: "reason", label: "Reason" },
            ]}
            rows={rows as unknown as Record<string, unknown>[]}
          />
        </div>
      </div>
      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>GSTIN</th>
              <th className={thCls}>Invoice</th>
              <th className={thCls}>Date</th>
              <th className={thR}>Taxable</th>
              <th className={thR}>Tax</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-5 text-center text-[var(--color-muted)]">None.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5 font-mono text-xs">{r.gstin || "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs">{r.invoiceNo || "—"}</span>
                    {r.reason && <span className="ml-2 text-[10px] text-[var(--color-muted)]">{r.reason}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{r.invoiceDate || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.taxable as string)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.tax as string)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Gstr2bMatchCard({ period }: { period: string }) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<Gstr2bMatchResult | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseGstr2bCsv(csv), [csv]);

  const run = async () => {
    if (parsed.length === 0) {
      toast.error("Paste at least one 2B invoice row");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<Gstr2bMatchResult>("/api/books/gst/gstr2b/match", {
        period,
        portalInvoices: parsed,
      });
      setResult(res);
      toast.success(`Matched ${res?.matched?.length ?? 0} · ${parsed.length} portal invoices`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="GSTR-2B ITC match (invoice-level)" icon={<GitCompareArrows size={15} />}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Paste portal 2B invoices (CSV: gstin, invoiceNo, invoiceDate, taxable, tax)</label>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            placeholder={GSTR2B_PLACEHOLDER}
            className={`${inputCls} font-mono text-xs resize-y`}
          />
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            {parsed.length} invoice{parsed.length === 1 ? "" : "s"} parsed · a header row is auto-detected and skipped.
          </p>
        </div>
        <button type="button" onClick={run} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <GitCompareArrows size={14} />} Match against books
        </button>

        {result && (
          <div className="space-y-4 pt-1">
            <div className="flex flex-wrap gap-3">
              <StatCard label="Matched" value={String(result.matched?.length ?? 0)} tint="green" />
              <StatCard label="Probable" value={String(result.probable?.length ?? 0)} />
              <StatCard label="Missing in books" value={String(result.missingInBooks?.length ?? 0)} tint="red" />
              <StatCard label="Missing in portal" value={String(result.missingInPortal?.length ?? 0)} tint="red" />
            </div>
            <div className="bg-[var(--color-bg)] border border-red-700/40 rounded-lg p-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-red-300">ITC at risk</span>
              <span className="text-xl font-bold tabular-nums text-red-400">{rupee(result.summary?.itcAtRisk)}</span>
            </div>
            <Gstr2bBucketTable title="Matched" rows={result.matched ?? []} tint="green" />
            <Gstr2bBucketTable title="Probable (fuzzy / amount mismatch)" rows={result.probable ?? []} tint="amber" />
            <Gstr2bBucketTable title="Missing in books (in 2B, not booked)" rows={result.missingInBooks ?? []} tint="red" />
            <Gstr2bBucketTable title="Missing in portal (booked, not in 2B)" rows={result.missingInPortal ?? []} tint="red" />
          </div>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// E-INVOICE CANCEL — cancel an IRN within the 24h GSP window
// ─────────────────────────────────────────────────────────────────────────────
const CANCEL_REASONS = [
  { code: "1", label: "1 — Duplicate" },
  { code: "2", label: "2 — Data entry mistake" },
  { code: "3", label: "3 — Order cancelled" },
  { code: "4", label: "4 — Other" },
] as const;

function EinvoiceCancelCard() {
  const [voucherId, setVoucherId] = useState("");
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0].code);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!voucherId.trim()) {
      toast.error("Enter the voucher id of the e-invoice");
      return;
    }
    if (!window.confirm("Cancel this e-invoice IRN? This is irreversible and only valid within 24h of generation.")) return;
    setBusy(true);
    try {
      const res = await api.post<{ status?: string; configured?: boolean; reason?: string }>(
        `/api/books/einvoice/${encodeURIComponent(voucherId.trim())}/cancel`,
        { reason, remarks: remarks.trim() || undefined },
      );
      if (res?.configured === false) {
        toast.error(res.reason || "GSP not configured — cannot cancel");
      } else {
        toast.success(res?.status === "CANCELLED" ? "E-invoice cancelled" : "Cancellation submitted");
        setVoucherId(""); setRemarks("");
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Cancel e-invoice (IRN)" icon={<Ban size={15} />}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
        <div className="lg:col-span-1">
          <label className={labelCls}>Voucher id</label>
          <input value={voucherId} onChange={(e) => setVoucherId(e.target.value)} placeholder="voucher UUID" className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className={labelCls}>Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
            {CANCEL_REASONS.map((r) => (<option key={r.code} value={r.code}>{r.label}</option>))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Remarks</label>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="optional" className={inputCls} />
        </div>
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mt-2">
        IRN cancellation is only allowed within 24 hours of generation and requires a configured GSP. The credit/debit note flow is used after that window.
      </p>
      <button type="button" onClick={submit} disabled={busy} className={`${btnPrimary} mt-3`}>
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <Ban size={14} />} Cancel IRN
      </button>
    </Card>
  );
}
