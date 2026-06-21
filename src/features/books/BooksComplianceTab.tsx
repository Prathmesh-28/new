import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ScrollText, FileJson, Ship, Truck, RefreshCw, Download, Plus,
  Calculator, ClipboardList, FileCheck2, Pencil, UserCog, CalendarClock, Ban,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — shapes mirror backend/src/modules/books/{gst,itr,billofentry,ewaybill}.js
// ─────────────────────────────────────────────────────────────────────────────
type SubTab = "gstr9" | "itr" | "imports" | "eway";

interface ItrFormDef {
  form: string;
  label: string;
  schedules: string[];
  assessmentYears: string[];
  useWhen: string;
}
interface ItrForms {
  assessmentYears: string[];
  forms: ItrFormDef[];
}

interface BoeRow {
  id: string;
  boe_no: string;
  boe_date: string;
  port_code: string | null;
  assessable_value: string;
  bcd: string;
  sws: string;
  import_igst: string;
  landed_cost: string;
  customs_payable: string;
  hsn_sac: string | null;
}
interface Itc04Row {
  id: string;
  direction: string;
  challan_no: string;
  challan_date: string;
  job_worker_gstin: string | null;
  job_worker_name: string | null;
  item_description: string | null;
  hsn_sac: string | null;
  qty: string;
  uom: string | null;
  taxable_value: string;
  goods_type: string | null;
}
interface Ledger {
  id: string;
  name: string;
  is_party: boolean;
}
interface EwbState {
  voucherId: string;
  ewbNo: string | null;
  status?: string;
  ewayStatus?: string;
  validUpto?: string | null;
  vehicleNo?: string | null;
  transporterId?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function currentFy(): string {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${y + 1}`;
}
function fyOptions(): string[] {
  const cur = Number(currentFy().split("-")[0]);
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = cur - i;
    out.push(`${a}-${a + 1}`);
  }
  return out;
}
function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function rupee(v: string | number | null | undefined): string {
  return `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// shared styles (mirror sibling Books tabs)
const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]";
const thCls =
  "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]";
const thR = `${thCls} text-right`;

// ─────────────────────────────────────────────────────────────────────────────
// SMALL PIECES
// ─────────────────────────────────────────────────────────────────────────────
function Card({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="text-[var(--color-primary)]">{icon}</span> {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-[11px] text-[var(--color-muted)] leading-relaxed">
      {children}
    </div>
  );
}

// Render a `{ taxable, cgst, sgst, igst, cess }`-ish bucket as a row.
function bucketCells(b: Record<string, unknown> | undefined) {
  const g = (k: string) => rupee((b?.[k] as string) ?? 0);
  return (
    <>
      <td className="px-3 py-2.5 text-right tabular-nums">{b?.taxable != null ? rupee(b.taxable as string) : "—"}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{g("cgst")}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{g("sgst")}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{g("igst")}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{g("cess")}</td>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksComplianceTab({ canWrite = true }: { canWrite?: boolean }) {
  const [sub, setSub] = useState<SubTab>("gstr9");

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "gstr9", label: "GSTR-9 / 9C", icon: <ScrollText size={14} /> },
    { id: "itr", label: "ITR JSON", icon: <FileJson size={14} /> },
    { id: "imports", label: "Imports (BoE / ITC-04)", icon: <Ship size={14} /> },
    { id: "eway", label: "E-way bill lifecycle", icon: <Truck size={14} /> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <FileCheck2 size={17} className="text-[var(--color-primary)]" /> Annual returns &amp; compliance
        </h2>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          GSTR-9/9C annual returns, portal-ready ITR JSON, import Bills of Entry + ITC-04 job-work, and the e-way bill lifecycle. Nothing here files on your behalf — every output is a draft you review and upload yourself.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {subTabs.map((t) => {
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSub(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors ${
                active
                  ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {sub === "gstr9" && <Gstr9Section />}
      {sub === "itr" && <ItrSection />}
      {sub === "imports" && <ImportsSection canWrite={canWrite} />}
      {sub === "eway" && <EwaySection canWrite={canWrite} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) GSTR-9 / GSTR-9C — annual return + reconciliation
// ─────────────────────────────────────────────────────────────────────────────
function Gstr9Section() {
  const [fy, setFy] = useState(currentFy());
  const [nine, setNine] = useState<any>(null);
  const [nineC, setNineC] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [busyC, setBusyC] = useState(false);

  const loadNine = useCallback(async (f: string) => {
    setBusy(true);
    try {
      const d = await api.get<any>(`/api/books/gst/gstr9?fy=${encodeURIComponent(f)}`);
      setNine(d);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadNineC = useCallback(async (f: string) => {
    setBusyC(true);
    try {
      const d = await api.get<any>(`/api/books/gst/gstr9c?fy=${encodeURIComponent(f)}`);
      setNineC(d);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyC(false);
    }
  }, []);

  useEffect(() => {
    void loadNine(fy);
    void loadNineC(fy);
  }, [fy, loadNine, loadNineC]);

  // POST recompute (server-recorded computation, same engine as GET).
  const recompute = async () => {
    setBusy(true);
    try {
      const d = await api.post<any>("/api/books/gst/gstr9", { fy });
      setNine(d);
      toast.success(`GSTR-9 recomputed for FY ${fy}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const recomputeC = async () => {
    setBusyC(true);
    try {
      const d = await api.post<any>("/api/books/gst/gstr9c", { fy });
      setNineC(d);
      toast.success(`GSTR-9C recomputed for FY ${fy}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyC(false);
    }
  };

  const t4 = nine?.partII_outward?.table4_taxable as Record<string, any> | undefined;
  const t6 = nine?.partIII_itc?.table6_availed as Record<string, any> | undefined;
  const t7 = nine?.partIII_itc?.table7_reversed as Record<string, any> | undefined;
  const t9 = nine?.partIV_taxPaid?.table9 as Record<string, any> | undefined;
  const t4Labels: [string, string][] = [
    ["4A_b2c", "4A — B2C supplies"],
    ["4B_b2b", "4B — B2B supplies"],
    ["4C_exports", "4C — Exports"],
    ["4D_sez", "4D — SEZ supplies"],
    ["4F_advances", "4F — Advances received"],
    ["4G_rcm_payable", "4G — Inward RCM (payable)"],
    ["4I_credit_notes", "4I — Credit notes"],
    ["4J_debit_notes", "4J — Debit notes"],
    ["4N_total", "4N — Total (net)"],
  ];
  const itcLabels: { label: string; b?: Record<string, any> }[] = [
    { label: "6A — ITC as per GSTR-3B", b: t6?.["6A_as_per_3b"] },
    { label: "6B — Inputs", b: t6?.["6B_inputs"] },
    { label: "6D — RCM (registered)", b: t6?.["6D_rcm_registered"] },
    { label: "6O — Total availed", b: t6?.["6O_total"] },
    { label: "7E — Blocked s.17(5)", b: t7?.["7E_blocked_17_5"] },
    { label: "7J — Total reversed", b: t7?.["7J_total_reversed"] },
  ];

  return (
    <div className="space-y-5">
      <Card
        title="GSTR-9 annual return"
        icon={<ScrollText size={15} />}
        action={
          <div className="flex items-center gap-2">
            <select value={fy} onChange={(e) => setFy(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm outline-none">
              {fyOptions().map((f) => <option key={f} value={f}>FY {f}</option>)}
            </select>
            <button type="button" onClick={() => void loadNine(fy)} className={btnGhost} title="Refresh">
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
            </button>
            <button type="button" onClick={recompute} disabled={busy} className={btnPrimary}>
              <Calculator size={14} /> Recompute
            </button>
          </div>
        }
      >
        <Hint>
          GSTR-9 is the consolidated annual GST return. Pt II (Table 4/5) is outward supplies, Pt III (Tables 6-8) is ITC availed/reversed/reconciled, Pt IV (Table 9) is tax paid. Caller-supplied figures (Pt V amendments, demands) default to zero. Download the portal envelope to upload to the GST offline tool.
        </Hint>

        {/* Table 4 — outward */}
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">Pt II · Table 4 — outward supplies (tax payable)</h4>
          <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
            <table className="w-full text-sm border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className={thCls}>Row</th>
                  <th className={thR}>Taxable</th>
                  <th className={thR}>CGST</th>
                  <th className={thR}>SGST</th>
                  <th className={thR}>IGST</th>
                  <th className={thR}>Cess</th>
                </tr>
              </thead>
              <tbody>
                {busy ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
                ) : !t4 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">No data.</td></tr>
                ) : (
                  t4Labels.map(([k, label]) => (
                    <tr key={k} className={`border-b border-[var(--color-border)] last:border-b-0 ${k === "4N_total" ? "font-semibold bg-[var(--color-bg)]/40" : ""}`}>
                      <td className="px-3 py-2.5">{label}</td>
                      {bucketCells(t4[k])}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tables 6/7 — ITC */}
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">Pt III · Tables 6-7 — ITC availed / reversed</h4>
          <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
            <table className="w-full text-sm border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className={thCls}>Row</th>
                  <th className={thR}>CGST</th>
                  <th className={thR}>SGST</th>
                  <th className={thR}>IGST</th>
                  <th className={thR}>Cess</th>
                </tr>
              </thead>
              <tbody>
                {busy || !t6 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--color-muted)]">{busy ? "Loading…" : "No data."}</td></tr>
                ) : (
                  itcLabels.map((r) => (
                    <tr key={r.label} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-3 py-2.5">{r.label}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.b?.cgst)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.b?.sgst)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.b?.igst)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.b?.cess)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 9 — tax paid */}
        {t9 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TaxPaidMini label="9 — Payable" b={t9["9_payable"]} />
            <TaxPaidMini label="9 — Paid in cash" b={t9["9_paid_cash"]} tint="green" />
            <TaxPaidMini label="9 — Paid via ITC" b={t9["9_paid_itc"]} tint="green" />
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={!nine?.portalJson}
            onClick={() => { downloadJson(nine.portalJson, `gstr9-${fy}.json`); toast.success(`Downloaded gstr9-${fy}.json`); }}
            className={btnPrimary}
          >
            <Download size={14} /> Download GSTR-9 portal JSON
          </button>
        </div>
      </Card>

      {/* GSTR-9C */}
      <Card
        title="GSTR-9C reconciliation statement"
        icon={<ClipboardList size={15} />}
        action={
          <button type="button" onClick={recomputeC} disabled={busyC} className={btnPrimary}>
            <Calculator size={14} className={busyC ? "animate-spin" : ""} /> Recompute
          </button>
        }
      >
        <Hint>
          GSTR-9C reconciles your audited financials against the GSTR-9 figures: turnover (Pt II), tax paid (Pt III), and ITC (Pt IV). The audited side comes from caller-supplied figures and defaults to zero here — surface the books side so you can spot the unreconciled gaps before your auditor signs off.
        </Hint>
        {busyC ? (
          <p className="text-sm text-[var(--color-muted)] py-6 text-center">Loading…</p>
        ) : nineC ? (
          <div className="mt-4 space-y-4">
            <ReconBlock
              title="Pt II — turnover reconciliation"
              rows={[
                ["5A — Audited turnover", nineC.turnoverReconciliation?.["5A_audited_turnover"]],
                ["5P — Turnover after adjustments", nineC.turnoverReconciliation?.["5P_turnover_after_adjustments"]],
                ["5Q — Turnover per returns", nineC.turnoverReconciliation?.["5Q_turnover_per_returns"]],
                ["6 — Unreconciled", nineC.turnoverReconciliation?.["6_unreconciled"]],
                ["7 — Taxable turnover per returns", nineC.turnoverReconciliation?.["7_taxable_turnover_per_returns"]],
              ]}
            />
            <ReconBlock
              title="Pt III — tax paid reconciliation"
              rows={[
                ["9 — Tax payable (audited)", nineC.taxPaidReconciliation?.["9_tax_payable_audited"]],
                ["9 — Tax paid per returns", nineC.taxPaidReconciliation?.["9_tax_paid_per_returns"]],
                ["10 — Unreconciled tax", nineC.taxPaidReconciliation?.["10_unreconciled_tax"]],
              ]}
            />
            <ReconBlock
              title="Pt IV — ITC reconciliation"
              rows={[
                ["12 — ITC per accounts", nineC.itcReconciliation?.["12_itc_per_accounts"]],
                ["14 — ITC per returns", nineC.itcReconciliation?.["14_itc_per_returns"]],
                ["15 — Unreconciled ITC", nineC.itcReconciliation?.["15_unreconciled_itc"]],
              ]}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { downloadJson(nineC, `gstr9c-${fy}.json`); toast.success(`Downloaded gstr9c-${fy}.json`); }}
                className={btnPrimary}
              >
                <Download size={14} /> Download GSTR-9C JSON
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)] py-6 text-center">No data.</p>
        )}
      </Card>
    </div>
  );
}

function TaxPaidMini({ label, b, tint }: { label: string; b?: Record<string, any>; tint?: "green" }) {
  const color = tint === "green" ? "text-green-400" : "text-[var(--color-text)]";
  return (
    <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
      <p className="text-[11px] text-[var(--color-muted)] mb-1">{label}</p>
      <div className="text-xs space-y-0.5">
        {(["cgst", "sgst", "igst", "cess"] as const).map((k) => (
          <div key={k} className="flex justify-between">
            <span className="text-[var(--color-muted)] uppercase">{k}</span>
            <span className={`tabular-nums ${color}`}>{rupee(b?.[k])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReconBlock({ title, rows }: { title: string; rows: [string, any][] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">{title}</h4>
      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <tbody>
            {rows.map(([label, val], i) => {
              const isGap = /unreconciled/i.test(label) && num(val) !== 0;
              return (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5">{label}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${isGap ? "text-amber-400 font-semibold" : ""}`}>{rupee(val)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (2) ITR JSON — form + regime pickers, JSON preview + download
// ─────────────────────────────────────────────────────────────────────────────
function ItrSection() {
  const [forms, setForms] = useState<ItrForms | null>(null);
  const [form, setForm] = useState("");
  const [ay, setAy] = useState("");
  const [regime, setRegime] = useState<"new" | "old">("new");
  const [otherIncome, setOtherIncome] = useState("");
  const [capitalGains, setCapitalGains] = useState("");
  const [deductions, setDeductions] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const f = await api.get<ItrForms>("/api/books/tax/itr-forms");
        setForms(f);
        if (f.forms[0]) setForm(f.forms[0].form);
        if (f.assessmentYears[0]) setAy(f.assessmentYears[f.assessmentYears.length - 1]);
      } catch (e) {
        toast.error(errMsg(e));
      }
    })();
  }, []);

  const selected = forms?.forms.find((f) => f.form === form);

  const build = async () => {
    if (!form) { toast.error("Pick an ITR form"); return; }
    if (!ay) { toast.error("Pick an assessment year"); return; }
    setBusy(true);
    try {
      const res = await api.post<any>("/api/books/tax/itr-json", {
        form,
        ay,
        regime,
        otherIncome: Number(otherIncome) || 0,
        capitalGains: Number(capitalGains) || 0,
        deductions: Number(deductions) || 0,
      });
      setResult(res);
      if (res?.schema?.valid === false) {
        toast.error(`JSON built but ${res.schema.errors?.length || 0} required field(s) missing — review before upload`);
      } else {
        toast.success(`${form} JSON built for AY ${ay}`);
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="ITR JSON assembler" icon={<FileJson size={15} />}>
      <Hint>
        Builds portal-ready ITR JSON from your books (P&amp;L → business income via the income-tax engine) plus TDS/TCS credits and advance-tax challans. ITR-3 is regular books; ITR-4 SUGAM is the 44AD/44ADA presumptive scheme. This is a draft for you to review and upload to the e-filing utility — it is never filed automatically.
      </Hint>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        <div>
          <label className={labelCls}>Form</label>
          <select value={form} onChange={(e) => { setForm(e.target.value); setResult(null); }} className={inputCls}>
            <option value="">Select form…</option>
            {forms?.forms.map((f) => <option key={f.form} value={f.form}>{f.form}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Assessment year</label>
          <select value={ay} onChange={(e) => { setAy(e.target.value); setResult(null); }} className={inputCls}>
            <option value="">Select AY…</option>
            {(selected?.assessmentYears ?? forms?.assessmentYears ?? []).map((y) => <option key={y} value={y}>AY {y}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Tax regime</label>
          <select value={regime} onChange={(e) => setRegime(e.target.value as "new" | "old")} className={inputCls}>
            <option value="new">New regime (default)</option>
            <option value="old">Old regime</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Other income (₹)</label>
          <input value={otherIncome} onChange={(e) => setOtherIncome(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
        </div>
        <div>
          <label className={labelCls}>Capital gains (₹)</label>
          <input value={capitalGains} onChange={(e) => setCapitalGains(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
        </div>
        <div>
          <label className={labelCls}>Chapter VI-A deductions (₹)</label>
          <input value={deductions} onChange={(e) => setDeductions(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
        </div>
      </div>

      {selected && (
        <p className="text-[11px] text-[var(--color-muted)] mt-2">
          {selected.label} · schedules: {selected.schedules.join(", ")}. {selected.useWhen}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={build} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <FileJson size={14} />} Build ITR JSON
        </button>
        {result?.itr && (
          <button
            type="button"
            onClick={() => { downloadJson(result.itr, `${form}-AY${ay}.json`); toast.success(`Downloaded ${form}-AY${ay}.json`); }}
            className={btnGhost}
          >
            <Download size={14} /> Download JSON
          </button>
        )}
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-3 text-xs">
            <span className={`px-2 py-1 rounded-full border font-semibold ${result.schema?.valid ? "bg-green-900/30 text-green-300 border-green-700/40" : "bg-amber-900/30 text-amber-300 border-amber-700/40"}`}>
              {result.schema?.valid ? "Schema valid" : `${result.schema?.errors?.length || 0} missing field(s)`}
            </span>
            <span className="px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">Regime: {result.regime}</span>
            <span className="px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">FY {result.financialYear}</span>
            <span className="px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">
              {result.sources?.tdsCredits ?? 0} TDS · {result.sources?.advanceChallans ?? 0} advance challans
            </span>
          </div>
          {result.schema?.errors?.length > 0 && (
            <ul className="text-[11px] text-amber-300 list-disc pl-5 space-y-0.5">
              {result.schema.errors.map((er: string, i: number) => <li key={i} className="font-mono">{er}</li>)}
            </ul>
          )}
          {result.note && <p className="text-[11px] text-[var(--color-muted)]">{result.note}</p>}
          <div>
            <label className={labelCls}>JSON preview</label>
            <pre className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-[11px] font-mono overflow-x-auto max-h-96 overflow-y-auto leading-relaxed">
              {JSON.stringify(result.itr, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (3) IMPORTS — Bill of Entry + ITC-04 job-work
// ─────────────────────────────────────────────────────────────────────────────
function ImportsSection({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="space-y-5">
      <BoeCard canWrite={canWrite} />
      <Itc04Card canWrite={canWrite} />
    </div>
  );
}

function BoeCard({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<BoeRow[]>([]);
  const [vendors, setVendors] = useState<Ledger[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const [vendorLedgerId, setVendorLedgerId] = useState("");
  const [boeNo, setBoeNo] = useState("");
  const [boeDate, setBoeDate] = useState(todayIso());
  const [portCode, setPortCode] = useState("");
  const [assessableValue, setAssessableValue] = useState("");
  const [bcd, setBcd] = useState("");
  const [sws, setSws] = useState("");
  const [importIgst, setImportIgst] = useState("");
  const [hsn, setHsn] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get<BoeRow[]>("/api/books/boe");
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    (async () => {
      try {
        const l = await api.get<Ledger[]>("/api/books/ledgers");
        setVendors(Array.isArray(l) ? l.filter((x) => x.is_party) : []);
      } catch { /* optional */ }
    })();
  }, [load]);

  const reset = () => {
    setBoeNo(""); setPortCode(""); setAssessableValue(""); setBcd(""); setSws(""); setImportIgst(""); setHsn("");
  };

  const submit = async () => {
    if (!vendorLedgerId) { toast.error("Pick the import supplier (vendor ledger)"); return; }
    if (!boeNo.trim()) { toast.error("Enter the Bill of Entry number"); return; }
    if ((Number(assessableValue) || 0) <= 0) { toast.error("Enter the assessable (CIF) value"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/boe", {
        vendorLedgerId,
        boeNo: boeNo.trim(),
        boeDate,
        portCode: portCode.trim() || undefined,
        assessableValue: Number(assessableValue) || 0,
        bcd: Number(bcd) || 0,
        sws: Number(sws) || 0,
        importIgst: Number(importIgst) || 0,
        hsn: hsn.trim() || undefined,
      });
      toast.success(`Bill of Entry ${boeNo.trim()} posted`);
      reset();
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const a = Number(assessableValue) || 0;
  const landed = a + (Number(bcd) || 0) + (Number(sws) || 0);

  return (
    <Card
      title="Bill of Entry (imports)"
      icon={<Ship size={15} />}
      action={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} className={btnGhost}><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh</button>
          {canWrite && <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}><Plus size={14} /> New BoE</button>}
        </div>
      }
    >
      <Hint>
        Imports carry no GST on the supplier invoice — duties are assessed at the customs port. BCD and Social Welfare Surcharge are non-creditable (capitalised into landed cost); import IGST on (assessable + BCD + SWS) is creditable ITC flowing to GSTR-3B 4(A)(1). Posting a BoE books a balanced purchase voucher automatically.
      </Hint>

      {open && canWrite && (
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 mt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Import supplier</label>
              <select value={vendorLedgerId} onChange={(e) => setVendorLedgerId(e.target.value)} className={inputCls}>
                <option value="">Select vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>BoE number</label><input value={boeNo} onChange={(e) => setBoeNo(e.target.value)} placeholder="e.g. 1234567" className={`${inputCls} font-mono`} /></div>
            <div><label className={labelCls}>BoE date</label><input type="date" value={boeDate} onChange={(e) => setBoeDate(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Port code</label><input value={portCode} onChange={(e) => setPortCode(e.target.value)} placeholder="e.g. INNSA1" className={`${inputCls} font-mono`} /></div>
            <div><label className={labelCls}>HSN</label><input value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="optional" className={`${inputCls} font-mono`} /></div>
            <div><label className={labelCls}>Assessable value (CIF)</label><input value={assessableValue} onChange={(e) => setAssessableValue(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} /></div>
            <div><label className={labelCls}>BCD (₹)</label><input value={bcd} onChange={(e) => setBcd(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} /></div>
            <div><label className={labelCls}>SWS (₹)</label><input value={sws} onChange={(e) => setSws(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} /></div>
            <div><label className={labelCls}>Import IGST (₹)</label><input value={importIgst} onChange={(e) => setImportIgst(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} /></div>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-xs flex flex-wrap gap-4">
            <span className="text-[var(--color-muted)]">Landed cost (goods): <span className="text-[var(--color-text)] tabular-nums font-semibold">{rupee(landed)}</span></span>
            <span className="text-[var(--color-muted)]">Creditable IGST ITC: <span className="text-green-400 tabular-nums font-semibold">{rupee(Number(importIgst) || 0)}</span></span>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setOpen(false); reset(); }} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Post Bill of Entry
            </button>
          </div>
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)] mt-4">
        <table className="w-full text-sm border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>BoE no / port</th>
              <th className={thCls}>Date</th>
              <th className={thR}>Assessable</th>
              <th className={thR}>BCD</th>
              <th className={thR}>SWS</th>
              <th className={thR}>Import IGST</th>
              <th className={thR}>Landed cost</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--color-muted)]">No Bills of Entry recorded yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs">{r.boe_no}</span>
                    {r.port_code && <span className="ml-2 text-[10px] text-[var(--color-muted)]">{r.port_code}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{r.boe_date}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.assessable_value)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.bcd)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.sws)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-green-400">{rupee(r.import_igst)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rupee(r.landed_cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Itc04Card({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Itc04Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"" | "SENT" | "RECEIVED">("");

  const [direction, setDirection] = useState<"SENT" | "RECEIVED">("SENT");
  const [challanNo, setChallanNo] = useState("");
  const [challanDate, setChallanDate] = useState(todayIso());
  const [jobWorkerGstin, setJobWorkerGstin] = useState("");
  const [jobWorkerName, setJobWorkerName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [hsn, setHsn] = useState("");
  const [qty, setQty] = useState("");
  const [uom, setUom] = useState("");
  const [taxableValue, setTaxableValue] = useState("");
  const [goodsType, setGoodsType] = useState<"INPUT" | "CAPITAL">("INPUT");

  const load = useCallback(async (dir: string) => {
    setBusy(true);
    try {
      const q = dir ? `?direction=${dir}` : "";
      const r = await api.get<Itc04Row[]>(`/api/books/itc04${q}`);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  const reset = () => {
    setChallanNo(""); setJobWorkerGstin(""); setJobWorkerName(""); setItemDescription("");
    setHsn(""); setQty(""); setUom(""); setTaxableValue("");
  };

  const submit = async () => {
    if (!challanNo.trim()) { toast.error("Enter the challan number"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/itc04", {
        direction,
        challanNo: challanNo.trim(),
        challanDate,
        jobWorkerGstin: jobWorkerGstin.trim() || undefined,
        jobWorkerName: jobWorkerName.trim() || undefined,
        itemDescription: itemDescription.trim() || undefined,
        hsn: hsn.trim() || undefined,
        qty: Number(qty) || 0,
        uom: uom.trim() || undefined,
        taxableValue: Number(taxableValue) || 0,
        goodsType,
      });
      toast.success(`ITC-04 challan ${challanNo.trim()} recorded (${direction})`);
      reset();
      setOpen(false);
      await load(filter);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="ITC-04 — job-work challans"
      icon={<ClipboardList size={15} />}
      action={
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm outline-none">
            <option value="">All</option>
            <option value="SENT">Sent (Table 4)</option>
            <option value="RECEIVED">Received (Table 5A)</option>
          </select>
          {canWrite && <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}><Plus size={14} /> New challan</button>}
        </div>
      }
    >
      <Hint>
        Form ITC-04 declares goods sent to (Table 4) and received back from (Table 5A) a job-worker. Sending goods on a delivery challan for job-work is not a supply — it carries no GST and posts no voucher. These rows are tracked purely for the ITC-04 return.
      </Hint>

      {open && canWrite && (
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 mt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as "SENT" | "RECEIVED")} className={inputCls}>
                <option value="SENT">Sent to job-worker (Table 4)</option>
                <option value="RECEIVED">Received back (Table 5A)</option>
              </select>
            </div>
            <div><label className={labelCls}>Challan no</label><input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} placeholder="Challan number" className={`${inputCls} font-mono`} /></div>
            <div><label className={labelCls}>Challan date</label><input type="date" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Job-worker GSTIN</label><input value={jobWorkerGstin} onChange={(e) => setJobWorkerGstin(e.target.value)} placeholder="optional" className={`${inputCls} font-mono`} /></div>
            <div><label className={labelCls}>Job-worker name</label><input value={jobWorkerName} onChange={(e) => setJobWorkerName(e.target.value)} placeholder="optional" className={inputCls} /></div>
            <div>
              <label className={labelCls}>Goods type</label>
              <select value={goodsType} onChange={(e) => setGoodsType(e.target.value as "INPUT" | "CAPITAL")} className={inputCls}>
                <option value="INPUT">Inputs</option>
                <option value="CAPITAL">Capital goods</option>
              </select>
            </div>
            <div><label className={labelCls}>Item description</label><input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="optional" className={inputCls} /></div>
            <div><label className={labelCls}>HSN</label><input value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="optional" className={`${inputCls} font-mono`} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Qty</label><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} /></div>
              <div><label className={labelCls}>UoM</label><input value={uom} onChange={(e) => setUom(e.target.value)} placeholder="Nos" className={inputCls} /></div>
            </div>
            <div><label className={labelCls}>Taxable value (₹)</label><input value={taxableValue} onChange={(e) => setTaxableValue(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setOpen(false); reset(); }} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Record challan
            </button>
          </div>
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)] mt-4">
        <table className="w-full text-sm border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>Challan no / date</th>
              <th className={thCls}>Direction</th>
              <th className={thCls}>Job-worker</th>
              <th className={thCls}>Item</th>
              <th className={thR}>Qty</th>
              <th className={thR}>Taxable</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">No ITC-04 challans recorded yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs">{r.challan_no}</span>
                    <span className="ml-2 text-[10px] text-[var(--color-muted)]">{r.challan_date}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      r.direction === "SENT"
                        ? "bg-blue-900/30 text-blue-300 border-blue-700/40"
                        : "bg-green-900/30 text-green-300 border-green-700/40"
                    }`}>{r.direction === "SENT" ? "Sent" : "Received"}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span>{r.job_worker_name || "—"}</span>
                    {r.job_worker_gstin && <span className="ml-2 text-[10px] font-mono text-[var(--color-muted)]">{r.job_worker_gstin}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--color-muted)] text-xs">{r.item_description || r.hsn_sac || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.qty).toLocaleString("en-IN", { maximumFractionDigits: 3 })}{r.uom ? ` ${r.uom}` : ""}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.taxable_value)}</td>
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
// (4) E-WAY BILL LIFECYCLE — update vehicle / transporter, extend, cancel
// ─────────────────────────────────────────────────────────────────────────────
type EwayAction = "update-vehicle" | "update-transporter" | "extend" | "cancel";

const CANCEL_REASONS = [
  { code: "1", label: "1 — Duplicate" },
  { code: "2", label: "2 — Order cancelled" },
  { code: "3", label: "3 — Data entry mistake" },
  { code: "4", label: "4 — Others" },
] as const;
const TRANS_MODES = [
  { code: "1", label: "1 — Road" },
  { code: "2", label: "2 — Rail" },
  { code: "3", label: "3 — Air" },
  { code: "4", label: "4 — Ship" },
] as const;

function EwaySection({ canWrite }: { canWrite: boolean }) {
  const [voucherId, setVoucherId] = useState("");
  const [state, setState] = useState<EwbState | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const fetchStatus = useCallback(async (id: string) => {
    if (!id.trim()) { setState(null); return; }
    setLoadingStatus(true);
    try {
      const s = await api.get<EwbState>(`/api/books/documents/${encodeURIComponent(id.trim())}/eway/status`);
      setState(s);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  return (
    <div className="space-y-5">
      <Card title="E-way bill lifecycle" icon={<Truck size={15} />}>
        <Hint>
          Once an e-way bill is generated for a dispatch document you can update its vehicle (Part-B), assign a transporter, extend validity before it expires, or cancel within 24 hours. Each action builds the NIC-shaped payload and routes through the GSP when configured — with no GSP credentials the call returns honestly that the rail is not configured rather than faking a portal action.
        </Hint>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[260px]">
            <label className={labelCls}>Dispatch document (voucher id)</label>
            <input value={voucherId} onChange={(e) => setVoucherId(e.target.value)} placeholder="voucher UUID" className={`${inputCls} font-mono`} />
          </div>
          <button type="button" onClick={() => void fetchStatus(voucherId)} disabled={!voucherId.trim() || loadingStatus} className={btnPrimary}>
            {loadingStatus ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />} Load status
          </button>
        </div>

        {state && (
          <div className="mt-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 text-sm grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KV label="EWB no" value={state.ewbNo || "— none generated —"} mono />
            <KV label="Status" value={state.ewayStatus || state.status || "—"} />
            <KV label="Valid upto" value={state.validUpto || "—"} />
            <KV label="Vehicle" value={state.vehicleNo || "—"} mono />
            <KV label="Transporter" value={state.transporterId || "—"} mono />
            <KV label="Cancelled" value={state.cancelledAt || "—"} />
          </div>
        )}
      </Card>

      {!canWrite ? (
        <p className="text-sm text-[var(--color-muted)] text-center py-10 border border-dashed border-[var(--color-border)] rounded-lg">
          You need an owner / finance / accountant role to run e-way bill lifecycle actions.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <UpdateVehicleCard voucherId={voucherId} onDone={() => void fetchStatus(voucherId)} />
          <UpdateTransporterCard voucherId={voucherId} onDone={() => void fetchStatus(voucherId)} />
          <ExtendValidityCard voucherId={voucherId} onDone={() => void fetchStatus(voucherId)} />
          <CancelEwbCard voucherId={voucherId} onDone={() => void fetchStatus(voucherId)} />
        </div>
      )}
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
      <p className={`mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}

// Shared post-helper for eway lifecycle: handles configured:false honestly.
async function postEway(voucherId: string, action: EwayAction, body: Record<string, unknown>): Promise<boolean> {
  const res = await api.post<{ configured?: boolean; ok?: boolean; reason?: string }>(
    `/api/books/documents/${encodeURIComponent(voucherId.trim())}/eway/${action}`,
    body,
  );
  if (res?.configured === false) {
    toast.error(res.reason || "GSP/EWB rail not configured");
    return false;
  }
  return true;
}

function requireVoucher(voucherId: string): boolean {
  if (!voucherId.trim()) {
    toast.error("Enter the dispatch document voucher id above first");
    return false;
  }
  return true;
}

function UpdateVehicleCard({ voucherId, onDone }: { voucherId: string; onDone: () => void }) {
  const [vehicleNo, setVehicleNo] = useState("");
  const [vehicleType, setVehicleType] = useState("R");
  const [transMode, setTransMode] = useState("1");
  const [reasonCode, setReasonCode] = useState<string>("1");
  const [reasonRem, setReasonRem] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!requireVoucher(voucherId)) return;
    if (!vehicleNo.trim()) { toast.error("Enter the vehicle number"); return; }
    setBusy(true);
    try {
      const ok = await postEway(voucherId, "update-vehicle", {
        vehicleNo: vehicleNo.trim(),
        vehicleType,
        transMode,
        reasonCode,
        reasonRem: reasonRem.trim() || undefined,
      });
      if (ok) { toast.success(`Vehicle updated to ${vehicleNo.trim()}`); onDone(); }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Update vehicle (Part-B)" icon={<Pencil size={15} />}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Vehicle no</label><input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="MH12AB1234" className={`${inputCls} font-mono`} /></div>
          <div>
            <label className={labelCls}>Vehicle type</label>
            <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputCls}>
              <option value="R">Regular</option>
              <option value="O">Over-dimensional cargo</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Transport mode</label>
            <select value={transMode} onChange={(e) => setTransMode(e.target.value)} className={inputCls}>
              {TRANS_MODES.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Reason</label>
            <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className={inputCls}>
              <option value="1">Due to break-down</option>
              <option value="2">Due to transhipment</option>
              <option value="3">Others</option>
              <option value="4">First time</option>
            </select>
          </div>
        </div>
        <div><label className={labelCls}>Remarks</label><input value={reasonRem} onChange={(e) => setReasonRem(e.target.value)} placeholder="optional" className={inputCls} /></div>
      </div>
      <button type="button" onClick={submit} disabled={busy} className={`${btnPrimary} mt-4 w-full`}>
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <Pencil size={14} />} Update vehicle
      </button>
    </Card>
  );
}

function UpdateTransporterCard({ voucherId, onDone }: { voucherId: string; onDone: () => void }) {
  const [transporterId, setTransporterId] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!requireVoucher(voucherId)) return;
    if (!transporterId.trim()) { toast.error("Enter the transporter ID (GSTIN / TRANSIN)"); return; }
    setBusy(true);
    try {
      const ok = await postEway(voucherId, "update-transporter", { transporterId: transporterId.trim() });
      if (ok) { toast.success("Transporter assigned"); onDone(); }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Assign transporter" icon={<UserCog size={15} />}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Transporter ID (GSTIN / 15-digit TRANSIN)</label>
          <input value={transporterId} onChange={(e) => setTransporterId(e.target.value)} placeholder="29ABCDE1234F1Z5" className={`${inputCls} font-mono`} />
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">Assigns the transporter who will further update Part-B vehicle details on the portal.</p>
      </div>
      <button type="button" onClick={submit} disabled={busy} className={`${btnPrimary} mt-4 w-full`}>
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <UserCog size={14} />} Assign transporter
      </button>
    </Card>
  );
}

function ExtendValidityCard({ voucherId, onDone }: { voucherId: string; onDone: () => void }) {
  const [remainingDistance, setRemainingDistance] = useState("");
  const [consignmentStatus, setConsignmentStatus] = useState("M");
  const [transitType, setTransitType] = useState("R");
  const [vehicleNo, setVehicleNo] = useState("");
  const [transMode, setTransMode] = useState("1");
  const [reasonCode, setReasonCode] = useState<string>("1");
  const [reasonRem, setReasonRem] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!requireVoucher(voucherId)) return;
    if ((Number(remainingDistance) || 0) <= 0) { toast.error("Enter the remaining distance (km)"); return; }
    setBusy(true);
    try {
      const ok = await postEway(voucherId, "extend", {
        remainingDistance: Number(remainingDistance) || 0,
        consignmentStatus,
        transitType: consignmentStatus === "T" ? transitType : undefined,
        vehicleNo: vehicleNo.trim() || undefined,
        transMode,
        reasonCode,
        reasonRem: reasonRem.trim() || undefined,
      });
      if (ok) { toast.success("Validity extended"); onDone(); }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Extend validity" icon={<CalendarClock size={15} />}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Remaining distance (km)</label><input value={remainingDistance} onChange={(e) => setRemainingDistance(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} /></div>
          <div>
            <label className={labelCls}>Consignment status</label>
            <select value={consignmentStatus} onChange={(e) => setConsignmentStatus(e.target.value)} className={inputCls}>
              <option value="M">In movement</option>
              <option value="T">In transit</option>
            </select>
          </div>
          {consignmentStatus === "T" && (
            <div>
              <label className={labelCls}>Transit type</label>
              <select value={transitType} onChange={(e) => setTransitType(e.target.value)} className={inputCls}>
                <option value="R">Road</option>
                <option value="W">Warehouse</option>
                <option value="O">Others</option>
              </select>
            </div>
          )}
          <div><label className={labelCls}>Vehicle no</label><input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="optional" className={`${inputCls} font-mono`} /></div>
          <div>
            <label className={labelCls}>Transport mode</label>
            <select value={transMode} onChange={(e) => setTransMode(e.target.value)} className={inputCls}>
              {TRANS_MODES.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Reason</label>
            <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className={inputCls}>
              <option value="1">Natural calamity</option>
              <option value="2">Law &amp; order</option>
              <option value="3">Transhipment</option>
              <option value="4">Accident</option>
              <option value="5">Others</option>
            </select>
          </div>
        </div>
        <div><label className={labelCls}>Remarks</label><input value={reasonRem} onChange={(e) => setReasonRem(e.target.value)} placeholder="optional" className={inputCls} /></div>
      </div>
      <button type="button" onClick={submit} disabled={busy} className={`${btnPrimary} mt-4 w-full`}>
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <CalendarClock size={14} />} Extend validity
      </button>
    </Card>
  );
}

function CancelEwbCard({ voucherId, onDone }: { voucherId: string; onDone: () => void }) {
  const [reasonCode, setReasonCode] = useState<string>(CANCEL_REASONS[0].code);
  const [reasonRem, setReasonRem] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!requireVoucher(voucherId)) return;
    if (!window.confirm("Cancel this e-way bill? This is only allowed within 24 hours of generation and cannot be undone.")) return;
    setBusy(true);
    try {
      const ok = await postEway(voucherId, "cancel", {
        reasonCode,
        reasonRem: reasonRem.trim() || undefined,
      });
      if (ok) { toast.success("E-way bill cancelled"); onDone(); }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Cancel e-way bill" icon={<Ban size={15} />}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Reason</label>
          <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className={inputCls}>
            {CANCEL_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Remarks</label><input value={reasonRem} onChange={(e) => setReasonRem(e.target.value)} placeholder="optional" className={inputCls} /></div>
        <p className="text-[11px] text-[var(--color-muted)]">Cancellation is only valid within 24 hours of generation. After that, raise a credit/debit note instead.</p>
      </div>
      <button type="button" onClick={submit} disabled={busy} className={`${btnPrimary} mt-4 w-full`}>
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <Ban size={14} />} Cancel e-way bill
      </button>
    </Card>
  );
}
