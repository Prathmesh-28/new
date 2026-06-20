import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import {
  FileText, Download, RefreshCw, Calculator, Plus, FileCheck2,
  ScrollText, ListChecks, Landmark, ExternalLink,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — loose response shapes (mirror backend/src/modules/books/tax.js)
// ─────────────────────────────────────────────────────────────────────────────
interface Ledger {
  id: string;
  name: string;
  is_party: boolean;
  is_bank: boolean;
}

interface TdsReturnResp {
  content: string;
  rowCount?: number | string;
  fileName?: string;
  form?: string;
}

interface TdsCertificate {
  id: string;
  partyLedgerId?: string;
  party_ledger_id?: string;
  partyName?: string;
  section: string;
  certificateNo?: string;
  certificate_no?: string;
  rate: string | number;
  thresholdLimit?: string | number;
  threshold_limit?: string | number;
  validFrom?: string;
  valid_from?: string;
  validTo?: string;
  valid_to?: string;
}

interface Recon26asResp {
  matched?: unknown[];
  unmatched?: unknown[];
  matchedCount?: number;
  unmatchedCount?: number;
}

interface AdvanceTaxInstalment {
  dueDate?: string;
  due_date?: string;
  label?: string;
  cumulativePercent?: number | string;
  percent?: number | string;
  cumulativeTax?: string | number;
  instalment?: string | number;
  amount?: string | number;
}

interface AdvanceTaxResp {
  totalTax?: string | number;
  instalments?: AdvanceTaxInstalment[];
}

interface ItrHead {
  head?: string;
  name?: string;
  amount?: string | number;
}

interface ItrSummaryResp {
  fy?: string;
  heads?: ItrHead[];
  grossTotalIncome?: string | number;
  totalDeductions?: string | number;
  totalIncome?: string | number;
  taxableIncome?: string | number;
  taxPayable?: string | number;
  regime?: string;
}

interface IncomeTaxResp {
  taxableIncome?: string | number;
  tax?: string | number;
  cess?: string | number;
  surcharge?: string | number;
  totalTax?: string | number;
  regime?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function currentFy(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 3
    ? `${y}-${String((y + 1) % 100).padStart(2, "0")}`
    : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function rupee(v: string | number | null | undefined): string {
  const s = String(v ?? "").trim();
  return s ? `₹${s}` : "₹0.00";
}

// Trigger a browser download of text content as a file.
function downloadText(content: string, fileName: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Open an authenticated GET (HTML/PDF) in a new tab — the endpoint can't read the
// Authorization header on window.open, so the bearer token rides as a query param.
function openAuthed(path: string) {
  const token = localStorage.getItem("hr_access");
  const url = `${API_BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token ?? "")}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
const TDS_FORMS = ["26Q", "27EQ"] as const;
const REGIMES = ["new", "old"] as const;
const ENTITY_TYPES = ["individual", "firm", "company", "huf"] as const;

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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
type SubId = "tds" | "form16a" | "ldc" | "recon26as" | "advance" | "itr";

const SUBS: { id: SubId; label: string; icon: React.ReactNode }[] = [
  { id: "tds",        label: "TDS Returns",        icon: <FileText size={14} /> },
  { id: "form16a",    label: "Form 16A",           icon: <FileCheck2 size={14} /> },
  { id: "ldc",        label: "Lower-deduction",    icon: <ScrollText size={14} /> },
  { id: "recon26as",  label: "26AS reconcile",     icon: <ListChecks size={14} /> },
  { id: "advance",    label: "Advance Tax",        icon: <Landmark size={14} /> },
  { id: "itr",        label: "Income Tax / ITR",   icon: <Calculator size={14} /> },
];

export default function BooksTaxFilingTab() {
  const [sub, setSub] = useState<SubId>("tds");
  const [parties, setParties] = useState<Ledger[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const l = await api.get<Ledger[]>("/api/books/ledgers");
        setParties(Array.isArray(l) ? l.filter((x) => x.is_party) : []);
      } catch {
        /* party list optional; the sub-tabs that need it surface their own state */
      }
    })();
  }, []);

  return (
    <div className="space-y-5">
      {/* PILL SUB-TABS */}
      <div className="flex gap-2 overflow-x-auto">
        {SUBS.map((s) => {
          const active = sub === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSub(s.id)}
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

      {sub === "tds" && <TdsReturnsSub />}
      {sub === "form16a" && <Form16aSub parties={parties} />}
      {sub === "ldc" && <LowerDeductionSub parties={parties} />}
      {sub === "recon26as" && <Recon26asSub />}
      {sub === "advance" && <AdvanceTaxSub />}
      {sub === "itr" && <IncomeTaxSub />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 — TDS RETURNS
// ─────────────────────────────────────────────────────────────────────────────
function TdsReturnsSub() {
  const [quarter, setQuarter] = useState<(typeof QUARTERS)[number]>("Q1");
  const [fy, setFy] = useState(currentFy());
  const [form, setForm] = useState<(typeof TDS_FORMS)[number]>("26Q");
  const [busy, setBusy] = useState(false);
  const [lastRows, setLastRows] = useState<number | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.post<TdsReturnResp>("/api/books/tax/tds-return", { quarter, fy, form });
      const content = res?.content ?? "";
      const rows = Number(res?.rowCount ?? 0) || 0;
      setLastRows(rows);
      const name = res?.fileName || `tds-${form}-${quarter}-${fy}.txt`;
      downloadText(content, name);
      toast.success(`${form} ${quarter} FY ${fy} generated · ${rows} row${rows === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="TDS return (e-TDS text file)" icon={<FileText size={15} />}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Quarter</label>
          <select value={quarter} onChange={(e) => setQuarter(e.target.value as (typeof QUARTERS)[number])} className={inputCls}>
            {QUARTERS.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Financial year</label>
          <input value={fy} onChange={(e) => setFy(e.target.value)} placeholder="2025-26" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Form</label>
          <select value={form} onChange={(e) => setForm(e.target.value as (typeof TDS_FORMS)[number])} className={inputCls}>
            {TDS_FORMS.map((f) => (
              <option key={f} value={f}>{f === "26Q" ? "26Q (non-salary TDS)" : "27EQ (TCS)"}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <button type="button" onClick={generate} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
          Generate &amp; download .txt
        </button>
        {lastRows !== null && (
          <span className="text-xs text-[var(--color-muted)] tabular-nums">
            Last run: {lastRows} deduction row{lastRows === 1 ? "" : "s"}.
          </span>
        )}
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mt-3">
        Produces the fixed-width e-TDS return file you upload to the TIN-FVU / TRACES utility.
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 — FORM 16A
// ─────────────────────────────────────────────────────────────────────────────
function Form16aSub({ parties }: { parties: Ledger[] }) {
  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [quarter, setQuarter] = useState<(typeof QUARTERS)[number]>("Q1");
  const [fy, setFy] = useState(currentFy());

  const open = () => {
    if (!partyLedgerId) {
      toast.error("Pick a party ledger");
      return;
    }
    const qs = `partyLedgerId=${encodeURIComponent(partyLedgerId)}&quarter=${encodeURIComponent(quarter)}&fy=${encodeURIComponent(fy)}`;
    openAuthed(`/api/books/tax/form16a?${qs}`);
  };

  return (
    <Card title="Form 16A — TDS certificate (HTML)" icon={<FileCheck2 size={15} />}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Party (deductee)</label>
          <select value={partyLedgerId} onChange={(e) => setPartyLedgerId(e.target.value)} className={inputCls}>
            <option value="">Select party…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Quarter</label>
          <select value={quarter} onChange={(e) => setQuarter(e.target.value as (typeof QUARTERS)[number])} className={inputCls}>
            {QUARTERS.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Financial year</label>
          <input value={fy} onChange={(e) => setFy(e.target.value)} placeholder="2025-26" className={inputCls} />
        </div>
      </div>
      <button type="button" onClick={open} className={`${btnPrimary} mt-4`}>
        <ExternalLink size={14} /> Open Form 16A
      </button>
      {parties.length === 0 && (
        <p className="text-[11px] text-[var(--color-muted)] mt-3">No party ledgers found — create one in Chart of Accounts.</p>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 — LOWER-DEDUCTION CERTIFICATES
// ─────────────────────────────────────────────────────────────────────────────
function LowerDeductionSub({ parties }: { parties: Ledger[] }) {
  const [certs, setCerts] = useState<TdsCertificate[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [section, setSection] = useState("");
  const [certificateNo, setCertificateNo] = useState("");
  const [rate, setRate] = useState("");
  const [thresholdLimit, setThresholdLimit] = useState("");
  const [validFrom, setValidFrom] = useState(todayIso());
  const [validTo, setValidTo] = useState("");

  const partyName = useCallback(
    (c: TdsCertificate) => {
      if (c.partyName) return c.partyName;
      const id = c.partyLedgerId ?? c.party_ledger_id;
      return parties.find((p) => p.id === id)?.name ?? "—";
    },
    [parties],
  );

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await api.get<TdsCertificate[]>("/api/books/tax/tds-certificates");
      setCerts(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!partyLedgerId) { toast.error("Pick a party ledger"); return; }
    if (!section.trim()) { toast.error("Enter a TDS section (e.g. 194C)"); return; }
    if (!certificateNo.trim()) { toast.error("Enter the certificate number"); return; }
    setSaving(true);
    try {
      await api.post<TdsCertificate>("/api/books/tax/tds-certificates", {
        partyLedgerId,
        section: section.trim(),
        certificateNo: certificateNo.trim(),
        rate: rate.trim() || "0",
        thresholdLimit: thresholdLimit.trim() || "0",
        validFrom,
        validTo: validTo || undefined,
      });
      toast.success(`Certificate ${certificateNo.trim()} saved`);
      setSection(""); setCertificateNo(""); setRate(""); setThresholdLimit(""); setValidTo("");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card title="New lower-deduction certificate (Sec 197)" icon={<ScrollText size={15} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Party</label>
            <select value={partyLedgerId} onChange={(e) => setPartyLedgerId(e.target.value)} className={inputCls}>
              <option value="">Select party…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>TDS section</label>
            <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="194C" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Certificate no.</label>
            <input value={certificateNo} onChange={(e) => setCertificateNo(e.target.value)} placeholder="e.g. 123ABC/2025" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Rate %</label>
              <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="0.50" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>Threshold limit</label>
              <input value={thresholdLimit} onChange={(e) => setThresholdLimit(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Valid from</label>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Valid to</label>
            <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className={inputCls} />
          </div>
        </div>
        <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} mt-4`}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          Save certificate
        </button>
      </Card>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Certificates on file</h3>
          <button type="button" onClick={() => void load()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Party</th>
                <th className={thCls}>Section</th>
                <th className={thCls}>Certificate no.</th>
                <th className={thR}>Rate</th>
                <th className={thR}>Threshold</th>
                <th className={thCls}>Valid</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">Loading…</td></tr>
              ) : certs.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">No certificates yet.</td></tr>
              ) : (
                certs.map((c) => {
                  const from = c.validFrom ?? c.valid_from ?? "—";
                  const to = c.validTo ?? c.valid_to ?? "—";
                  return (
                    <tr key={c.id} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-3 py-2.5 font-medium">{partyName(c)}</td>
                      <td className="px-3 py-2.5">{c.section}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.certificateNo ?? c.certificate_no ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{String(c.rate ?? "0")}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(c.thresholdLimit ?? c.threshold_limit)}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] text-xs whitespace-nowrap">{from} → {to}</td>
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
// 4 — 26AS RECONCILE
// ─────────────────────────────────────────────────────────────────────────────
// Parse pasted CSV into objects keyed by the header row.
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
    return row;
  });
}

// Minimal CSV cell splitter — handles double-quoted fields with embedded commas.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function Recon26asSub() {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Recon26asResp | null>(null);

  const reconcile = async () => {
    const rows = parseCsv(csv);
    if (rows.length === 0) {
      toast.error("Paste CSV with a header row and at least one data row");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<Recon26asResp>("/api/books/tax/26as-reconcile", { rows });
      setResult(res ?? null);
      const m = res?.matchedCount ?? res?.matched?.length ?? 0;
      const u = res?.unmatchedCount ?? res?.unmatched?.length ?? 0;
      toast.success(`Reconciled ${rows.length} rows · ${m} matched, ${u} unmatched`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const parsedCount = parseCsv(csv).length;
  const matchedCount = result?.matchedCount ?? result?.matched?.length ?? 0;
  const unmatchedCount = result?.unmatchedCount ?? result?.unmatched?.length ?? 0;

  return (
    <div className="space-y-5">
      <Card title="26AS reconciliation" icon={<ListChecks size={15} />}>
        <label className={labelCls}>Paste your Form 26AS export as CSV (first row = headers)</label>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          placeholder={"section,deductor,tan,amount,tds,date\n194C,Acme Pvt Ltd,DELA12345B,100000,1000,2025-05-10"}
          className={`${inputCls} font-mono text-xs resize-y`}
        />
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button type="button" onClick={reconcile} disabled={busy} className={btnPrimary}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <ListChecks size={14} />}
            Reconcile {parsedCount > 0 ? `(${parsedCount} rows)` : ""}
          </button>
          <span className="text-xs text-[var(--color-muted)] tabular-nums">{parsedCount} parsed row{parsedCount === 1 ? "" : "s"}</span>
        </div>
      </Card>

      {result && (
        <div className="flex flex-wrap gap-3">
          <StatCard label="Matched" value={String(matchedCount)} tint="green" />
          <StatCard label="Unmatched" value={String(unmatchedCount)} tint={unmatchedCount > 0 ? "red" : "green"} />
          <StatCard label="Total rows" value={String(matchedCount + unmatchedCount)} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 — ADVANCE TAX
// ─────────────────────────────────────────────────────────────────────────────
function AdvanceTaxSub() {
  const [projectedIncome, setProjectedIncome] = useState("");
  const [regime, setRegime] = useState<(typeof REGIMES)[number]>("new");
  const [entityType, setEntityType] = useState<(typeof ENTITY_TYPES)[number]>("individual");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AdvanceTaxResp | null>(null);

  const compute = async () => {
    const inc = Number(projectedIncome) || 0;
    if (inc <= 0) { toast.error("Enter projected income above zero"); return; }
    setBusy(true);
    try {
      const res = await api.post<AdvanceTaxResp>("/api/books/tax/advance-tax", {
        projectedIncome: inc,
        regime,
        entityType,
      });
      setResult(res ?? null);
      toast.success("Advance-tax schedule computed");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const instalments = result?.instalments ?? [];

  return (
    <div className="space-y-5">
      <Card title="Advance-tax estimator" icon={<Landmark size={15} />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Projected income</label>
            <input value={projectedIncome} onChange={(e) => setProjectedIncome(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Regime</label>
            <select value={regime} onChange={(e) => setRegime(e.target.value as (typeof REGIMES)[number])} className={inputCls}>
              {REGIMES.map((r) => (
                <option key={r} value={r}>{r === "new" ? "New regime" : "Old regime"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Entity type</label>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value as (typeof ENTITY_TYPES)[number])} className={inputCls}>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" onClick={compute} disabled={busy} className={`${btnPrimary} mt-4`}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />}
          Compute instalments
        </button>
      </Card>

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <StatCard label="Total tax for year" value={rupee(result.totalTax)} />
            <StatCard label="Instalments" value={String(instalments.length)} />
          </div>
          <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className={thCls}>Instalment</th>
                  <th className={thCls}>Due date</th>
                  <th className={thR}>Cumulative %</th>
                  <th className={thR}>Cumulative tax</th>
                  <th className={thR}>This instalment</th>
                </tr>
              </thead>
              <tbody>
                {instalments.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--color-muted)]">No instalments returned.</td></tr>
                ) : (
                  instalments.map((it, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-3 py-2.5">{it.label ?? `Instalment ${i + 1}`}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{it.dueDate ?? it.due_date ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{String(it.cumulativePercent ?? it.percent ?? "—")}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(it.cumulativeTax)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(it.instalment ?? it.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 — INCOME TAX / ITR
// ─────────────────────────────────────────────────────────────────────────────
function IncomeTaxSub() {
  const [fy, setFy] = useState(currentFy());
  const [otherIncome, setOtherIncome] = useState("");
  const [deductions, setDeductions] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ItrSummaryResp | null>(null);

  // quick calc
  const [taxableIncome, setTaxableIncome] = useState("");
  const [regime, setRegime] = useState<(typeof REGIMES)[number]>("new");
  const [calcBusy, setCalcBusy] = useState(false);
  const [calc, setCalc] = useState<IncomeTaxResp | null>(null);

  const loadSummary = async () => {
    setBusy(true);
    try {
      const qs = `fy=${encodeURIComponent(fy)}&otherIncome=${encodeURIComponent(otherIncome.trim() || "0")}&deductions=${encodeURIComponent(deductions.trim() || "0")}`;
      const res = await api.get<ItrSummaryResp>(`/api/books/tax/itr-summary?${qs}`);
      setSummary(res ?? null);
      toast.success(`ITR summary for FY ${fy} ready`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const quickCalc = async () => {
    const inc = Number(taxableIncome) || 0;
    if (inc <= 0) { toast.error("Enter taxable income above zero"); return; }
    setCalcBusy(true);
    try {
      const res = await api.post<IncomeTaxResp>("/api/books/tax/income-tax", { taxableIncome: inc, regime });
      setCalc(res ?? null);
      toast.success("Tax computed");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCalcBusy(false);
    }
  };

  const heads = summary?.heads ?? [];

  return (
    <div className="space-y-5">
      <Card title="ITR summary — head-wise computation" icon={<Calculator size={15} />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Financial year</label>
            <input value={fy} onChange={(e) => setFy(e.target.value)} placeholder="2025-26" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Other income</label>
            <input value={otherIncome} onChange={(e) => setOtherIncome(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Deductions (Ch. VI-A)</label>
            <input value={deductions} onChange={(e) => setDeductions(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
          </div>
        </div>
        <button type="button" onClick={loadSummary} disabled={busy} className={`${btnPrimary} mt-4`}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />}
          Build ITR summary
        </button>

        {summary && (
          <div className="mt-5 space-y-3">
            <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-bg)]">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className={thCls}>Head of income</th>
                    <th className={thR}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {heads.length === 0 ? (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-[var(--color-muted)]">No head-wise breakdown returned.</td></tr>
                  ) : (
                    heads.map((h, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                        <td className="px-3 py-2.5">{h.head ?? h.name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{rupee(h.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-3">
              <StatCard label="Gross total income" value={rupee(summary.grossTotalIncome)} />
              <StatCard label="Deductions" value={rupee(summary.totalDeductions)} />
              <StatCard label="Taxable income" value={rupee(summary.taxableIncome ?? summary.totalIncome)} />
              <StatCard label="Tax payable" value={rupee(summary.taxPayable)} tint="red" />
            </div>
          </div>
        )}
      </Card>

      <Card title="Quick tax calculator" icon={<Calculator size={15} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Taxable income</label>
            <input value={taxableIncome} onChange={(e) => setTaxableIncome(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Regime</label>
            <select value={regime} onChange={(e) => setRegime(e.target.value as (typeof REGIMES)[number])} className={inputCls}>
              {REGIMES.map((r) => (
                <option key={r} value={r}>{r === "new" ? "New regime" : "Old regime"}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" onClick={quickCalc} disabled={calcBusy} className={`${btnPrimary} mt-4`}>
          {calcBusy ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />}
          Calculate tax
        </button>
        {calc && (
          <div className="flex flex-wrap gap-3 mt-4">
            <StatCard label="Base tax" value={rupee(calc.tax)} />
            <StatCard label="Surcharge" value={rupee(calc.surcharge)} />
            <StatCard label="Cess" value={rupee(calc.cess)} />
            <StatCard label="Total tax" value={rupee(calc.totalTax)} tint="red" />
          </div>
        )}
      </Card>
    </div>
  );
}
