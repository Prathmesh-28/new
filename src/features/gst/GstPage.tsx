import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { formatCurrency, formatAmount } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { gstLedger } from "@/lib/finance";
import { Calculator, Calendar, FileText, CheckCircle2, Clock, AlertTriangle, Search, ShieldCheck, XCircle, RefreshCw, BookOpen, GitCompare, Upload, Download, Receipt, Truck, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { parse2BJson, parseRegisterRows, reconcile, type ReconResult, type ReconSummary } from "@/lib/gstReconcile";
import { addDays, format } from "date-fns";

interface Liability { month: number; year: number; output_tax: number; input_tax_credit: number; net_liability: number; breakdown: Record<string, number>; }
interface GstReturn  { id: string; return_type: string; period_month: number; period_year: number; output_tax: number; input_tax_credit: number; net_liability: number; status: string; filed_at?: string; gstn_arn?: string; }
interface CalDate    { label: string; due: string; penalty: string; }

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function GstPage() {
  const { store } = useApp();
  const firm = store.firm;
  const [tab, setTab]             = useState<"calculator" | "ledger" | "returns" | "calendar" | "verify" | "match" | "gstr1" | "eway" | "hsn" | "rcm" | "itc" | "gstr9" | "lut" | "refund" | "composition" | "qrmp" | "tdsgst" | "einvoice">("calculator");
  const [gstin, setGstin]         = useState("");
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; status: string; gstin?: string; state?: string; stateCode?: string; pan?: string; source?: string; message?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyHistory, setVerifyHistory] = useState<{ gstin: string; state?: string; status: string }[]>([]);
  const [liability, setLiability] = useState<Liability | null>(null);
  const [returns, setReturns]     = useState<GstReturn[]>([]);
  const [calendar, setCalendar]   = useState<CalDate[]>([]);
  const [loading, setLoading]     = useState(false);
  const [selMonth, setSelMonth]   = useState(() => { const n = new Date(); return { m: n.getMonth() + 1, y: n.getFullYear() }; });

  // ── E-Way Bill state ──
  const [ewayValue, setEwayValue]         = useState<number>(0);
  const [ewayDist, setEwayDist]           = useState<number>(0);
  const [ewayOdc, setEwayOdc]             = useState<boolean>(false);
  const [ewayCancelled, setEwayCancelled] = useState<boolean>(false);

  const ewayResult = useMemo(() => {
    const required = ewayValue > 50000 && !ewayCancelled;
    if (!required) return { required: false } as const;
    const validity = Math.max(1, Math.ceil(ewayDist / (ewayOdc ? 20 : 200)));
    const expiry   = format(addDays(new Date(), validity), "d MMM yyyy");
    return { required: true, validity, expiry } as const;
  }, [ewayValue, ewayDist, ewayOdc, ewayCancelled]);

  // ── RCM state ──
  const [rcmEntries, setRcmEntries] = useState<{ id: string; desc: string; supplier: string; amount: number; rate: number; date: string }[]>([]);
  const [rcmDesc, setRcmDesc]       = useState("");
  const [rcmSupplier, setRcmSupplier] = useState("");
  const [rcmAmount, setRcmAmount]   = useState("");
  const [rcmRate, setRcmRate]       = useState(18);
  const [rcmDate, setRcmDate]       = useState(() => new Date().toISOString().split("T")[0]);

  // ── HSN Lookup state ──
  const [hsnSearch, setHsnSearch] = useState("");

  const HSN_CODES: { code: string; desc: string; rate: number; type: "goods" | "service" }[] = [
    { code: "0101", desc: "Live horses, asses, mules, hinnies", rate: 0, type: "goods" },
    { code: "0401", desc: "Milk and cream, not concentrated or sweetened", rate: 0, type: "goods" },
    { code: "0901", desc: "Coffee (roasted, green)", rate: 5, type: "goods" },
    { code: "0902", desc: "Tea (black, green, oolong)", rate: 5, type: "goods" },
    { code: "1001", desc: "Wheat and meslin", rate: 0, type: "goods" },
    { code: "1701", desc: "Cane or beet sugar (granulated, raw)", rate: 5, type: "goods" },
    { code: "2101", desc: "Coffee/tea extracts, instant coffee, chicory", rate: 18, type: "goods" },
    { code: "2106", desc: "Food preparations NEC (protein powders, health drinks)", rate: 18, type: "goods" },
    { code: "3004", desc: "Medicaments — packed for retail sale", rate: 12, type: "goods" },
    { code: "3006", desc: "Pharmaceutical goods — bandages, dental cements", rate: 12, type: "goods" },
    { code: "3401", desc: "Soap, surface-active products for washing", rate: 18, type: "goods" },
    { code: "3402", desc: "Detergents, surface-active agents (non-soap)", rate: 18, type: "goods" },
    { code: "3808", desc: "Insecticides, disinfectants, fungicides, herbicides", rate: 18, type: "goods" },
    { code: "3923", desc: "Plastic packing articles — boxes, bags, bottles", rate: 18, type: "goods" },
    { code: "4011", desc: "New pneumatic tyres of rubber", rate: 28, type: "goods" },
    { code: "4802", desc: "Uncoated paper and paperboard for writing/printing", rate: 12, type: "goods" },
    { code: "4819", desc: "Cartons, boxes, bags of paper (packing material)", rate: 18, type: "goods" },
    { code: "5208", desc: "Woven fabrics of cotton ≤200 g/m²", rate: 5, type: "goods" },
    { code: "6109", desc: "T-shirts, singlets and other knitted vests", rate: 5, type: "goods" },
    { code: "6203", desc: "Men's suits, ensembles, jackets, trousers", rate: 12, type: "goods" },
    { code: "7108", desc: "Gold (including gold plated with platinum)", rate: 3, type: "goods" },
    { code: "7113", desc: "Articles of jewellery and parts — gold, silver", rate: 3, type: "goods" },
    { code: "8413", desc: "Pumps for liquids (hand pumps, power pumps)", rate: 18, type: "goods" },
    { code: "8418", desc: "Refrigerators, freezers, A/C units, heat pumps", rate: 28, type: "goods" },
    { code: "8471", desc: "Computers, laptops, desktops and peripherals", rate: 18, type: "goods" },
    { code: "8517", desc: "Telephones, smartphones, feature phones", rate: 18, type: "goods" },
    { code: "8528", desc: "Monitors, projectors, televisions", rate: 28, type: "goods" },
    { code: "8544", desc: "Insulated wire and cable (electric)", rate: 18, type: "goods" },
    { code: "8704", desc: "Motor vehicles for goods transport — trucks, lorries", rate: 28, type: "goods" },
    { code: "8708", desc: "Parts and accessories for motor vehicles", rate: 28, type: "goods" },
    { code: "9401", desc: "Seats — chairs, sofas, car seats", rate: 18, type: "goods" },
    { code: "9403", desc: "Furniture — tables, shelves, office furniture", rate: 18, type: "goods" },
    { code: "9405", desc: "Lamps, lighting fittings, illuminated signs", rate: 18, type: "goods" },
    { code: "9954", desc: "Construction services — works contracts, civil", rate: 18, type: "service" },
    { code: "9963", desc: "Food and beverage services — restaurants, hotels", rate: 5, type: "service" },
    { code: "9971", desc: "Financial and related services — banking, insurance", rate: 18, type: "service" },
    { code: "9972", desc: "Real estate services — renting, property management", rate: 18, type: "service" },
    { code: "9983", desc: "IT and computer services — software, consulting", rate: 18, type: "service" },
    { code: "9984", desc: "Telecommunications and related services", rate: 18, type: "service" },
    { code: "9985", desc: "Business support services — BPO, KPO, call centres", rate: 18, type: "service" },
    { code: "9986", desc: "Agriculture, forestry and fishing support services", rate: 0, type: "service" },
    { code: "9987", desc: "Maintenance, repair and installation services", rate: 18, type: "service" },
    { code: "9988", desc: "Manufacturing services on physical inputs (job work)", rate: 18, type: "service" },
    { code: "9992", desc: "Education services", rate: 0, type: "service" },
    { code: "9993", desc: "Human health and social care services", rate: 0, type: "service" },
    { code: "9997", desc: "Other miscellaneous services NEC", rate: 18, type: "service" },
    { code: "9961", desc: "Wholesale trade services — commission agents", rate: 18, type: "service" },
    { code: "9973", desc: "Leasing and rental services — machinery, equipment", rate: 18, type: "service" },
  ];

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
        {([["calculator", "Calculator", Calculator], ["ledger", "Ledger", BookOpen], ["gstr1", "GSTR-1", Receipt], ["returns", `Returns (${returns.length})`, FileText], ["match", "2B Match", GitCompare], ["calendar", "Calendar", Calendar], ["eway", "E-Way Bill", Truck], ["rcm", "RCM", AlertTriangle], ["hsn", "HSN Lookup", Search], ["verify", "Verify GSTIN", ShieldCheck], ["itc", "ITC Optimizer", CheckCircle2], ["gstr9", "GSTR-9", FileText], ["lut", "LUT Tracker", ShieldCheck], ["refund", "Refund Tracker", Download], ["composition", "Composition", ShieldCheck], ["qrmp", "QRMP", Calendar], ["tdsgst", "TDS/TCS-GST", FileText], ["einvoice", "e-Invoice", CheckCircle2]] as const).map(([id, label, Icon]) => (
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

      {/* ── E-WAY BILL ── */}
      {tab === "eway" && (
        <div className="space-y-4 max-w-xl">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <Truck size={16} className="text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold">E-Way Bill Estimator</h2>
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-4">Check if you need an e-way bill and how long it's valid. All calculations are offline.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Invoice value (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={ewayValue || ""}
                  onChange={e => setEwayValue(Number(e.target.value))}
                  placeholder="e.g. 75000"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Distance (km)</label>
                <input
                  type="number"
                  min={0}
                  value={ewayDist || ""}
                  onChange={e => setEwayDist(Number(e.target.value))}
                  placeholder="e.g. 350"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={ewayOdc}
                  onChange={e => setEwayOdc(e.target.checked)}
                  className="accent-[var(--color-primary)]"
                />
                <span>ODC (Oversized / Over-dimensional cargo)</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={ewayCancelled}
                  onChange={e => setEwayCancelled(e.target.checked)}
                  className="accent-[var(--color-primary)]"
                />
                <span>Exempted goods (gold, jewellery, currency, cancelled invoice)</span>
              </label>
            </div>
          </div>

          {ewayValue > 0 && (
            <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${ewayResult.required ? "border-orange-700/40" : "border-green-700/40"}`}>
              <h3 className="text-sm font-semibold mb-3">Result</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--color-muted)]">E-way bill required</span>
                  {ewayResult.required
                    ? <span className="text-xs font-bold text-orange-400 flex items-center gap-1"><AlertTriangle size={11} /> Yes</span>
                    : <span className="text-xs font-bold text-green-400 flex items-center gap-1"><CheckCircle2 size={11} /> No</span>}
                </div>
                {ewayResult.required && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--color-muted)]">Validity</span>
                      <span className="text-xs font-semibold text-[var(--color-text)]">{ewayResult.validity} day{ewayResult.validity !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--color-muted)]">Expires on</span>
                      <span className="text-xs font-semibold text-[var(--color-primary)]">{ewayResult.expiry}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--color-muted)]">Formula used</span>
                      <span className="text-xs text-[var(--color-muted)]">1 day per {ewayOdc ? "20" : "200"} km{ewayOdc ? " (ODC)" : ""}</span>
                    </div>
                  </>
                )}
                {!ewayResult.required && !ewayCancelled && (
                  <p className="text-xs text-[var(--color-muted)]">Invoice value ₹{ewayValue.toLocaleString("en-IN")} is at or below the ₹50,000 threshold.</p>
                )}
                {!ewayResult.required && ewayCancelled && (
                  <p className="text-xs text-[var(--color-muted)]">Goods are in an exempted category — no e-way bill needed.</p>
                )}
              </div>
            </div>
          )}

          <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
            <AlertTriangle size={12} className="text-[var(--color-muted)] shrink-0 mt-px" />
            E-way bill rules: required for goods worth &gt; ₹50,000 transported &gt; 50 km (own vehicle) or any distance (common carrier). Verify current exemptions at ewaybillgst.gov.in.
          </div>
        </div>
      )}

      {/* ── RCM (REVERSE CHARGE MECHANISM) ── */}
      {tab === "rcm" && (() => {
        const RCM_SERVICES = [
          { desc: "Legal services from advocate", rate: 18 },
          { desc: "Goods Transport Agency (GTA) — road freight", rate: 5 },
          { desc: "Sponsorship services", rate: 18 },
          { desc: "Security services (unregistered supplier)", rate: 18 },
          { desc: "Renting of motor vehicle", rate: 5 },
          { desc: "Import of services (OIDAR)", rate: 18 },
          { desc: "Director services to company", rate: 18 },
          { desc: "Supply from unregistered dealer (notified)", rate: 18 },
          { desc: "Insurance agent services", rate: 18 },
          { desc: "Works contract from non-GST body", rate: 12 },
        ];

        const addEntry = () => {
          if (!rcmDesc || !rcmAmount) { toast.error("Description and amount required"); return; }
          const tax = Math.round(parseFloat(rcmAmount) * rcmRate / 100);
          setRcmEntries(e => [...e, { id: crypto.randomUUID(), desc: rcmDesc, supplier: rcmSupplier, amount: parseFloat(rcmAmount), rate: rcmRate, date: rcmDate }]);
          setRcmDesc(""); setRcmSupplier(""); setRcmAmount("");
          toast.success(`RCM entry added — ₹${tax.toLocaleString("en-IN")} tax liability`);
        };

        const totalRcmTax = rcmEntries.reduce((s, e) => s + Math.round(e.amount * e.rate / 100), 0);
        const totalRcmItc = totalRcmTax; // RCM tax paid = eligible ITC (for business use)

        const downloadCsv = () => {
          const rows = [["Date","Description","Supplier","Taxable Amount","GST Rate","RCM Tax","ITC Claimable"],
            ...rcmEntries.map(e => [e.date, e.desc, e.supplier, e.amount, `${e.rate}%`, Math.round(e.amount * e.rate / 100), Math.round(e.amount * e.rate / 100)])
          ];
          const csv = rows.map(r => r.join(",")).join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "RCM_Register.csv"; a.click();
        };

        return (
          <div className="space-y-4">
            <div className="bg-orange-950/20 border border-orange-800/30 rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
              <strong className="text-orange-300">Reverse Charge Mechanism (RCM)</strong> — You (the recipient) pay GST on behalf of the unregistered/exempt supplier directly to the government. RCM tax paid is eligible for ITC in the same month (for business use).
            </div>

            {/* Common RCM services quick-fill */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs font-semibold text-[var(--color-muted)] mb-2 uppercase tracking-wide">Common RCM Categories — click to fill</p>
              <div className="flex flex-wrap gap-2">
                {RCM_SERVICES.map(s => (
                  <button key={s.desc} onClick={() => { setRcmDesc(s.desc); setRcmRate(s.rate); }}
                    className="text-[10px] px-2.5 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text)] transition-colors">
                    {s.desc} · {s.rate}%
                  </button>
                ))}
              </div>
            </div>

            {/* Add entry form */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">Add RCM Entry</h3>
              <div className="grid grid-cols-2 gap-3">
                <input value={rcmDesc} onChange={e => setRcmDesc(e.target.value)} placeholder="Service description *"
                  className="col-span-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <input value={rcmSupplier} onChange={e => setRcmSupplier(e.target.value)} placeholder="Supplier name"
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <input value={rcmDate} type="date" onChange={e => setRcmDate(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <input type="number" value={rcmAmount} onChange={e => setRcmAmount(e.target.value)} placeholder="Taxable amount (₹) *"
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <select value={rcmRate} onChange={e => setRcmRate(Number(e.target.value))}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
                  {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}% GST</option>)}
                </select>
              </div>
              {rcmAmount && parseFloat(rcmAmount) > 0 && (
                <div className="flex items-center gap-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-muted)]">
                  <span>RCM Tax Payable: <strong className="text-orange-400">₹{Math.round(parseFloat(rcmAmount) * rcmRate / 100).toLocaleString("en-IN")}</strong></span>
                  <span>ITC Claimable (same month): <strong className="text-green-400">₹{Math.round(parseFloat(rcmAmount) * rcmRate / 100).toLocaleString("en-IN")}</strong></span>
                </div>
              )}
              <button onClick={addEntry} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
                <Receipt size={11} /> Add Entry
              </button>
            </div>

            {/* Register */}
            {rcmEntries.length > 0 && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
                  <h3 className="text-sm font-semibold">RCM Register ({rcmEntries.length} entries)</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-orange-400 font-semibold">Tax: {formatCurrency(totalRcmTax)}</span>
                    <span className="text-xs text-green-400 font-semibold">ITC: {formatCurrency(totalRcmItc)}</span>
                    <button onClick={downloadCsv} className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline ml-2">
                      <Download size={11} /> CSV
                    </button>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {["Date","Description","Supplier","Taxable","Rate","RCM Tax","ITC",""].map(h => (
                        <th key={h} className="text-left text-[var(--color-muted)] font-semibold px-3 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rcmEntries.map(e => (
                      <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                        <td className="px-3 py-2.5 text-[var(--color-muted)]">{e.date}</td>
                        <td className="px-3 py-2.5 font-medium max-w-[180px] truncate">{e.desc}</td>
                        <td className="px-3 py-2.5 text-[var(--color-muted)]">{e.supplier || "—"}</td>
                        <td className="px-3 py-2.5 tabular-nums">{formatCurrency(e.amount)}</td>
                        <td className="px-3 py-2.5">{e.rate}%</td>
                        <td className="px-3 py-2.5 tabular-nums text-orange-400 font-semibold">{formatCurrency(Math.round(e.amount * e.rate / 100))}</td>
                        <td className="px-3 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(e.amount * e.rate / 100))}</td>
                        <td className="px-3 py-2.5"><button onClick={() => setRcmEntries(prev => prev.filter(x => x.id !== e.id))} className="text-[var(--color-muted)] hover:text-red-400">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── HSN LOOKUP ── */}
      {tab === "hsn" && (() => {
        const q = hsnSearch.trim().toLowerCase();
        const results = q.length < 2
          ? HSN_CODES
          : HSN_CODES.filter(h => h.code.includes(q) || h.desc.toLowerCase().includes(q));

        const RATE_CHIP: Record<number, string> = {
          0:  "bg-green-950/30 text-green-400 border-green-800/30",
          3:  "bg-yellow-950/30 text-yellow-400 border-yellow-800/30",
          5:  "bg-blue-950/30 text-blue-400 border-blue-800/30",
          12: "bg-purple-950/30 text-purple-400 border-purple-800/30",
          18: "bg-orange-950/30 text-orange-400 border-orange-800/30",
          28: "bg-red-950/30 text-red-400 border-red-800/30",
        };

        return (
          <div className="space-y-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <h2 className="text-sm font-semibold mb-1">HSN / SAC Code Lookup</h2>
              <p className="text-xs text-[var(--color-muted)] mb-3">Search by code number or description. HSN = goods, SAC = services. GST rates shown are standard rates — verify on GST portal for exceptions.</p>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                <input
                  value={hsnSearch}
                  onChange={e => setHsnSearch(e.target.value)}
                  placeholder="Search: 8517, laptop, software, restaurant…"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)]">
                <BookOpen size={12} className="text-[var(--color-primary)]" />
                <span className="text-xs font-semibold">{results.length} codes</span>
                <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                  {[0, 5, 12, 18, 28].map(r => (
                    <span key={r} className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${RATE_CHIP[r]}`}>{r}%</span>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-[var(--color-border)] max-h-[480px] overflow-y-auto">
                {results.length === 0 && (
                  <div className="py-8 text-center text-sm text-[var(--color-muted)]">No codes match "{hsnSearch}"</div>
                )}
                {results.map(h => (
                  <div key={h.code} className="flex items-center gap-4 px-4 py-2.5 hover:bg-[var(--color-accent)] transition-colors">
                    <span className="font-mono text-sm font-semibold text-[var(--color-primary)] w-16 shrink-0">{h.code}</span>
                    <span className="flex-1 text-sm text-[var(--color-text)]">{h.desc}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold shrink-0 ${RATE_CHIP[h.rate] ?? "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{h.rate}% GST</span>
                    <span className="text-[10px] text-[var(--color-muted)] shrink-0 w-12 text-right">{h.type === "service" ? "SAC" : "HSN"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
              <AlertTriangle size={12} className="shrink-0 mt-px" />
              Rates shown are standard GST rates. Concessional rates, exemptions, and state-specific notifications may apply. Always verify at gstn.gov.in before filing.
            </div>
          </div>
        );
      })()}

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

      {tab === "itc" && (() => {
        const purchaseTxns = store.transactions.filter(t => t.amount < 0);

        // Group by month
        const monthMap: Record<string, { month: string; purchase: number; estimatedItc: number; claimed: number }> = {};
        purchaseTxns.forEach(t => {
          const key = t.date.slice(0, 7);
          const d = new Date(t.date + "-01");
          const label = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
          if (!monthMap[key]) monthMap[key] = { month: label, purchase: 0, estimatedItc: 0, claimed: 0 };
          const amt = Math.abs(t.amount);
          monthMap[key].purchase += amt;
          monthMap[key].estimatedItc += Math.round(amt * 0.18 / 1.18); // assume 18% GST on purchases
        });

        const months = Object.entries(monthMap).sort((a,b) => a[0].localeCompare(b[0])).map(([,v]) => v);
        const totalPurchase   = months.reduce((s,m) => s + m.purchase, 0);
        const totalEstItc     = months.reduce((s,m) => s + m.estimatedItc, 0);

        // ITC aging buckets: current month, 1-3 months, >3 months
        const now = new Date();
        const itcAging = months.map(m => {
          const key = Object.keys(monthMap).find(k => monthMap[k].month === m.month)!;
          const ageMonths = (now.getFullYear() - 2000) * 12 + now.getMonth() - (parseInt(key.slice(2,4)) * 12 + parseInt(key.slice(5,7)) - 1);
          const bucket = ageMonths === 0 ? "Current" : ageMonths <= 3 ? "1–3 months" : ageMonths <= 24 ? ">3 months" : "Lapsed (>2yr)";
          return { ...m, ageMonths, bucket };
        });

        const lapsedItc = itcAging.filter(m => m.bucket === "Lapsed (>2yr)").reduce((s,m) => s + m.estimatedItc, 0);
        const urgentItc = itcAging.filter(m => m.bucket === ">3 months").reduce((s,m) => s + m.estimatedItc, 0);

        return (
          <div className="space-y-5">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-1">ITC Optimizer</h2>
              <p className="text-xs text-[var(--color-muted)] mb-4">Estimated ITC available from your purchase transactions (assumes avg 18% GST). Claim within 2 years of invoice date — after that, ITC lapses under Sec 16(4).</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total purchases (all time)", value: formatAmount(totalPurchase), color: "text-[var(--color-text)]" },
                  { label: "Estimated ITC available", value: formatAmount(totalEstItc), color: "text-green-400" },
                  { label: "Urgent (>3 months unclaimed)", value: formatAmount(urgentItc), color: urgentItc > 0 ? "text-orange-400" : "text-[var(--color-muted)]" },
                  { label: "Lapsed (>2 years)", value: formatAmount(lapsedItc), color: lapsedItc > 0 ? "text-red-400" : "text-green-400" },
                ].map(k => (
                  <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                    <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                    <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {urgentItc > 0 && (
              <div className="bg-orange-950/30 border border-orange-800/40 rounded-lg px-4 py-3 flex items-center gap-3">
                <AlertTriangle size={15} className="text-orange-400 shrink-0" />
                <p className="text-sm">{formatAmount(urgentItc)} in estimated ITC is older than 3 months — claim it in your next GSTR-3B before the 2-year limit expires.</p>
              </div>
            )}

            {lapsedItc > 0 && (
              <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3 flex items-center gap-3">
                <AlertTriangle size={15} className="text-red-400 shrink-0" />
                <p className="text-sm">{formatAmount(lapsedItc)} in ITC has likely lapsed (invoices older than 2 years). These credits can no longer be claimed.</p>
              </div>
            )}

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--color-border)]">
                <p className="text-sm font-semibold">Month-wise ITC Summary</p>
              </div>
              {months.length === 0 ? (
                <p className="p-6 text-sm text-[var(--color-muted)] text-center">No transactions found. Add purchase transactions to see ITC estimates.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        {["Month","Total Purchases","Est. ITC @ 18%","Age","Status"].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {itcAging.slice().reverse().map((m, i) => (
                        <tr key={i} className="hover:bg-white/2">
                          <td className="px-4 py-3 font-medium">{m.month}</td>
                          <td className="px-4 py-3 tabular-nums">{formatAmount(m.purchase)}</td>
                          <td className="px-4 py-3 tabular-nums text-green-400 font-semibold">{formatAmount(m.estimatedItc)}</td>
                          <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{m.ageMonths === 0 ? "Current" : `${m.ageMonths}mo`}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
                              m.bucket === "Current" ? "bg-green-900/30 text-green-400 border-green-800/40" :
                              m.bucket === "1–3 months" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" :
                              m.bucket === ">3 months" ? "bg-orange-900/30 text-orange-400 border-orange-800/40" :
                              "bg-red-900/30 text-red-400 border-red-800/40"
                            }`}>{m.bucket}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <h3 className="text-sm font-semibold mb-3">ITC Eligibility Quick Reference</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {[
                  { title: "Blocked credits (Sec 17(5))", items: ["Motor vehicles for personal use", "Food & beverages, outdoor catering", "Club memberships, health services", "Travel for personal purposes"] },
                  { title: "Eligible credits", items: ["Raw materials & inputs for production", "Capital goods for business use", "Services used in business operations", "Goods/services for further supply (trading)"] },
                ].map(({ title, items }) => (
                  <div key={title}>
                    <p className="font-semibold mb-2 text-[var(--color-text)]">{title}</p>
                    <ul className="space-y-1">
                      {items.map(item => <li key={item} className="text-[var(--color-muted)] flex items-start gap-1.5"><span className="shrink-0 mt-0.5">•</span>{item}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {tab === "gstr9" && (() => {
        // Aggregate annual data from transactions
        const fy = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
        const fyStart = `${fy}-04-01`;
        const fyEnd   = `${fy + 1}-03-31`;
        const fyTxns  = store.transactions.filter(t => t.date >= fyStart && t.date <= fyEnd);

        const outwardTaxable = fyTxns.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
        const outputTax      = Math.round(outwardTaxable * 0.18);
        const inwardPurchase = fyTxns.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
        const itcAvailable   = Math.round(inwardPurchase * 0.18 / 1.18);
        const netPayable     = Math.max(0, outputTax - itcAvailable);
        const excessCredit   = Math.max(0, itcAvailable - outputTax);

        // Monthly breakdown for Table 5 (outward supplies) and Table 6 (ITC)
        const monthlyMap: Record<string, { out: number; inp: number }> = {};
        fyTxns.forEach(t => {
          const key = t.date.slice(0, 7);
          if (!monthlyMap[key]) monthlyMap[key] = { out: 0, inp: 0 };
          if (t.amount > 0) monthlyMap[key].out += t.amount;
          else monthlyMap[key].inp += Math.abs(t.amount);
        });
        const months = Object.entries(monthlyMap).sort((a,b) => a[0].localeCompare(b[0])).map(([key, v]) => {
          const d = new Date(key + "-01");
          return { label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }), ...v };
        });

        const downloadCsv = () => {
          const rows = [
            ["GSTR-9 Annual Return — Draft", `FY ${fy}-${fy+1}`],
            [],
            ["Table", "Description", "Amount (₹)"],
            ["4A", "Outward taxable supplies (excl. zero-rated)", outwardTaxable],
            ["4B", "Output GST (18% est.)", outputTax],
            ["6B", "ITC on inward supplies", itcAvailable],
            ["7", "Net GST payable / (refundable)", netPayable || -excessCredit],
            [],
            ["Month", "Outward Sales", "Purchases", "Est. Output GST", "Est. ITC"],
            ...months.map(m => [m.label, m.out, m.inp, Math.round(m.out * 0.18), Math.round(m.inp * 0.18 / 1.18)]),
          ];
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([rows.map(r=>r.join(",")).join("\n")], { type: "text/csv" }));
          a.download = `GSTR9-FY${fy}-${fy+1}.csv`; a.click();
        };

        return (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">GSTR-9 Annual Return Builder</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">Draft annual summary for FY {fy}–{fy+1} (Apr–Mar). Figures are estimates based on your transactions at 18% avg GST — verify against filed GSTR-1/3B before submission.</p>
              </div>
              <button onClick={downloadCsv} className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--color-primary)]/10">
                <Download size={11} /> Export CSV
              </button>
            </div>

            {/* Summary tables */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">Part II — Outward Supplies (Table 4)</p>
                <div className="space-y-2.5">
                  {[
                    { ref: "4A", label: "Taxable outward supplies",          value: outwardTaxable, color: "text-green-400" },
                    { ref: "4B", label: "Zero-rated / nil-rated supplies",    value: 0,              color: "text-[var(--color-muted)]" },
                    { ref: "9",  label: "Total output GST (est. 18%)",        value: outputTax,      color: "text-blue-400", bold: true },
                  ].map(r => (
                    <div key={r.ref} className={`flex items-center justify-between text-sm pb-2.5 border-b border-[var(--color-border)] last:border-0 last:pb-0 ${r.bold ? "pt-1" : ""}`}>
                      <span className="text-xs text-[var(--color-muted)]"><span className="font-mono mr-2">{r.ref}</span>{r.label}</span>
                      <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color}`}>{formatAmount(r.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">Part III — ITC (Table 6 & 7)</p>
                <div className="space-y-2.5">
                  {[
                    { ref: "6B",  label: "ITC on inward supplies",              value: itcAvailable, color: "text-green-400" },
                    { ref: "6C",  label: "ITC on import of services",           value: 0,            color: "text-[var(--color-muted)]" },
                    { ref: "7",   label: "ITC reversed (blocked credits)",      value: 0,            color: "text-red-400" },
                    { ref: "Net", label: "Net ITC available",                   value: itcAvailable, color: "text-[var(--color-primary)]", bold: true },
                  ].map(r => (
                    <div key={r.ref} className={`flex items-center justify-between text-sm pb-2.5 border-b border-[var(--color-border)] last:border-0 last:pb-0 ${r.bold ? "pt-1" : ""}`}>
                      <span className="text-xs text-[var(--color-muted)]"><span className="font-mono mr-2">{r.ref}</span>{r.label}</span>
                      <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color}`}>{formatAmount(r.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Net position */}
            <div className={`rounded-lg border p-5 ${netPayable > 0 ? "bg-red-950/20 border-red-800/40" : "bg-green-950/20 border-green-800/40"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{netPayable > 0 ? "Net GST Payable (Table 9)" : "Excess ITC / Refund Eligible"}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">Output tax {formatAmount(outputTax)} − ITC {formatAmount(itcAvailable)}</p>
                </div>
                <p className={`text-2xl font-bold tabular-nums ${netPayable > 0 ? "text-red-400" : "text-green-400"}`}>
                  {formatAmount(netPayable || excessCredit)}
                </p>
              </div>
            </div>

            {/* Monthly table */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--color-border)]">
                <p className="text-sm font-semibold">Monthly Breakdown — FY {fy}–{fy+1}</p>
              </div>
              {months.length === 0 ? (
                <p className="p-6 text-sm text-[var(--color-muted)] text-center">No transactions found for this financial year.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        {["Month","Outward Sales","Output GST (18%)","Purchases","ITC (18%)","Net"].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {months.map(m => {
                        const out = Math.round(m.out * 0.18);
                        const itc = Math.round(m.inp * 0.18 / 1.18);
                        return (
                          <tr key={m.label} className="hover:bg-white/2">
                            <td className="px-4 py-3 font-medium">{m.label}</td>
                            <td className="px-4 py-3 tabular-nums text-green-400">{formatAmount(m.out)}</td>
                            <td className="px-4 py-3 tabular-nums text-blue-400">{formatAmount(out)}</td>
                            <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{formatAmount(m.inp)}</td>
                            <td className="px-4 py-3 tabular-nums text-purple-400">{formatAmount(itc)}</td>
                            <td className={`px-4 py-3 tabular-nums font-semibold ${out - itc >= 0 ? "text-red-400" : "text-green-400"}`}>
                              {out - itc >= 0 ? formatAmount(out - itc) : `(${formatAmount(itc - out)})`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
              GSTR-9 is due by Dec 31 for the preceding FY. These are estimated figures — actual figures must match your filed GSTR-1 and GSTR-3B returns. A CA must sign the audit report (GSTR-9C) if turnover exceeds ₹5 crore.
            </div>
          </div>
        );
      })()}

      {tab === "lut" && (() => {
        type Lut = { id: string; refNo: string; fy: string; filedDate: string; exportType: "goods" | "services" | "both"; status: "active" | "expired" | "pending" };

        const currentFy = (() => { const y = new Date().getFullYear(); return new Date().getMonth() >= 3 ? `${y}-${y+1}` : `${y-1}-${y}`; })();
        const [luts, setLuts]       = useState<Lut[]>([]);
        const [refNo, setRefNo]     = useState("");
        const [fy,    setFy]        = useState(currentFy);
        const [filed, setFiled]     = useState(() => new Date().toISOString().split("T")[0]);
        const [expType, setExpType] = useState<"goods"|"services"|"both">("goods");

        const addLut = () => {
          if (!refNo) return;
          const fyEnd = `${fy.split("-")[1]}-03-31`;
          const status: Lut["status"] = new Date(fyEnd) < new Date() ? "expired" : "active";
          setLuts(prev => [...prev, { id: Math.random().toString(36).slice(2), refNo, fy, filedDate: filed, exportType: expType, status }]);
          setRefNo("");
        };

        const activeLut   = luts.find(l => l.fy === currentFy && l.status === "active");
        const today       = new Date();
        const fyEndDate   = new Date(`${currentFy.split("-")[1]}-03-31`);
        const daysToExpiry = Math.ceil((fyEndDate.getTime() - today.getTime()) / 86400000);

        return (
          <div className="space-y-4 max-w-xl">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-1">LUT Tracker — Letter of Undertaking</h2>
              <p className="text-xs text-[var(--color-muted)] mb-4">Exporters must file LUT (Form GST RFD-11) on GST portal every financial year to export without paying IGST. LUT is valid for the FY it is filed in.</p>

              <div className={`rounded-lg border p-4 mb-4 ${activeLut ? "bg-green-950/20 border-green-800/40" : "bg-red-950/20 border-red-800/40"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck size={14} className={activeLut ? "text-green-400" : "text-red-400"} />
                  <p className="text-sm font-semibold">{activeLut ? `LUT Active — FY ${currentFy}` : `No LUT for FY ${currentFy}`}</p>
                </div>
                {activeLut ? (
                  <p className="text-xs text-[var(--color-muted)]">Ref: {activeLut.refNo} · Expires Mar 31 · {daysToExpiry > 0 ? `${daysToExpiry} days remaining` : "Expired"}</p>
                ) : (
                  <p className="text-xs text-[var(--color-muted)]">File LUT on GST portal (RFD-11) before making any zero-rated export without IGST payment.</p>
                )}
                {activeLut && daysToExpiry <= 45 && daysToExpiry > 0 && (
                  <p className="text-xs text-orange-400 mt-1 font-semibold">⚠ Renew LUT for next FY before April 1 to avoid disruption to exports.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <input value={refNo} onChange={e=>setRefNo(e.target.value)} placeholder="LUT reference number *"
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <input value={fy} onChange={e=>setFy(e.target.value)} placeholder="Financial year (e.g. 2025-2026)"
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <input type="date" value={filed} onChange={e=>setFiled(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
                <div className="flex gap-2">
                  {(["goods","services","both"] as const).map(t => (
                    <button key={t} onClick={()=>setExpType(t)}
                      className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-colors capitalize ${expType===t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={addLut} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add LUT</button>
            </div>

            {luts.length > 0 && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">LUT History</p></div>
                <div className="divide-y divide-[var(--color-border)]">
                  {luts.slice().reverse().map(l => (
                    <div key={l.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium font-mono">{l.refNo}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${l.status === "active" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{l.status}</span>
                          <span className="text-[9px] text-[var(--color-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full capitalize">{l.exportType}</span>
                        </div>
                        <p className="text-[10px] text-[var(--color-muted)] mt-0.5">FY {l.fy} · Filed {l.filedDate}</p>
                      </div>
                      <button onClick={()=>setLuts(prev=>prev.filter(x=>x.id!==l.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-xs space-y-2">
              <p className="font-semibold">LUT vs Bond — When to use what?</p>
              {[
                { label: "LUT (RFD-11)", desc: "For exporters with no GST prosecution in preceding 5 years. No financial security needed. File online on GST portal." },
                { label: "Bond (RFD-11)", desc: "For new exporters or those with prior prosecution. Requires bank guarantee or surety. More compliance burden." },
                { label: "IGST Payment", desc: "Pay IGST on export invoice and claim refund later. Ties up working capital — avoid if LUT is available." },
              ].map(r => (
                <div key={r.label} className="flex gap-2">
                  <span className="font-semibold shrink-0 text-[var(--color-primary)]">{r.label}:</span>
                  <span className="text-[var(--color-muted)]">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {tab === "refund" && (() => {
        return <GstRefundTracker />;
      })()}

      {tab === "composition" && (() => {
        return <CompositionChecker />;
      })()}

      {tab === "qrmp" && (() => {
        return <QrmpChecker />;
      })()}

      {tab === "tdsgst" && (() => {
        return <TdsUnderGst />;
      })()}

      {tab === "einvoice" && (() => {
        return <EInvoiceReadiness />;
      })()}
    </div>
  );
}

function GstRefundTracker() {
  type RefundStatus = "Draft" | "Filed" | "Acknowledged" | "Processing" | "Approved" | "Credited" | "Deficiency" | "Rejected";
  type RefundType   = "Export (LUT)" | "Inverted Duty" | "Excess Cash Ledger" | "IGST on Export" | "Deemed Export" | "Other";
  type RefundEntry  = { id: string; refNo: string; type: RefundType; period: string; claimed: number; status: RefundStatus; filedDate: string; notes: string };

  const [entries,   setEntries]   = useState<RefundEntry[]>([]);
  const [showForm,  setShowForm]  = useState(false);
  const [rType,     setRType]     = useState<RefundType>("Export (LUT)");
  const [rPeriod,   setRPeriod]   = useState("");
  const [rClaimed,  setRClaimed]  = useState("");
  const [rStatus,   setRStatus]   = useState<RefundStatus>("Draft");
  const [rFiled,    setRFiled]    = useState("");
  const [rNotes,    setRNotes]    = useState("");

  const TYPES: RefundType[]   = ["Export (LUT)", "Inverted Duty", "Excess Cash Ledger", "IGST on Export", "Deemed Export", "Other"];
  const STATUSES: RefundStatus[] = ["Draft","Filed","Acknowledged","Processing","Approved","Credited","Deficiency","Rejected"];
  const STATUS_COLOR: Record<RefundStatus, string> = {
    Draft: "text-[var(--color-muted)]", Filed: "text-blue-400", Acknowledged: "text-blue-400",
    Processing: "text-yellow-400", Approved: "text-green-400", Credited: "text-green-400",
    Deficiency: "text-orange-400", Rejected: "text-red-400",
  };

  const addEntry = () => {
    if (!rPeriod || !rClaimed) return;
    setEntries(prev => [...prev, { id: Math.random().toString(36).slice(2), refNo: `RFD-${Math.floor(Math.random()*90000+10000)}`, type: rType, period: rPeriod, claimed: parseFloat(rClaimed) || 0, status: rStatus, filedDate: rFiled, notes: rNotes }]);
    setRPeriod(""); setRClaimed(""); setRFiled(""); setRNotes(""); setShowForm(false);
  };

  const updateStatus = (id: string, s: RefundStatus) => setEntries(prev => prev.map(e => e.id === id ? { ...e, status: s } : e));

  const totalClaimed  = entries.reduce((s, e) => s + e.claimed, 0);
  const totalCredited = entries.filter(e => e.status === "Credited").reduce((s, e) => s + e.claimed, 0);
  const pending       = entries.filter(e => !["Credited","Rejected"].includes(e.status)).length;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc  = formatCurrency;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Download size={14} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">GST Refund Tracker</p>
            {pending > 0 && <span className="text-xs bg-yellow-950/30 text-yellow-400 font-semibold px-2 py-0.5 rounded-full">{pending} in progress</span>}
          </div>
          <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
            <X size={11} className={showForm ? "" : "rotate-45"} /> {showForm ? "Cancel" : "Add claim"}
          </button>
        </div>

        {showForm && (
          <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-accent)]">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Refund Type</label>
                <select value={rType} onChange={e => setRType(e.target.value as RefundType)} className={inp}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Tax Period (e.g. Apr 2024)</label>
                <input value={rPeriod} onChange={e => setRPeriod(e.target.value)} placeholder="Apr 2024" className={inp} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Amount Claimed (₹)</label>
                <input type="number" value={rClaimed} onChange={e => setRClaimed(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Status</label>
                <select value={rStatus} onChange={e => setRStatus(e.target.value as RefundStatus)} className={inp}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Filed Date</label>
                <input type="date" value={rFiled} onChange={e => setRFiled(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Notes</label>
                <input value={rNotes} onChange={e => setRNotes(e.target.value)} placeholder="ARN, officer name, etc." className={inp} />
              </div>
            </div>
            <button onClick={addEntry} className="mt-3 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 p-4 border-b border-[var(--color-border)]">
          {[
            { label: "Total Claimed",  value: fc(totalClaimed),   color: "text-[var(--color-primary)]" },
            { label: "Credited",       value: fc(totalCredited),  color: "text-green-400" },
            { label: "In Progress",    value: pending.toString(), color: "text-yellow-400" },
          ].map(c => (
            <div key={c.label} className="text-center">
              <p className="text-xs text-[var(--color-muted)]">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {entries.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No refund claims yet. Add export refunds, inverted duty refunds, or excess cash ledger claims.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Ref No","Type","Period","Claimed","Filed","Status",""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-3 font-mono text-xs">{e.refNo}</td>
                    <td className="px-4 py-3 text-xs">{e.type}</td>
                    <td className="px-4 py-3">{e.period}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{fc(e.claimed)}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{e.filedDate || "—"}</td>
                    <td className="px-4 py-3">
                      <select value={e.status} onChange={ev => updateStatus(e.id, ev.target.value as RefundStatus)}
                        className={`text-xs font-semibold bg-transparent border-0 outline-none cursor-pointer ${STATUS_COLOR[e.status]}`}>
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setEntries(prev => prev.filter(x => x.id !== e.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold mb-2 text-[var(--color-muted)]">Refund Timeline (Rule 91/92)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { step: "File RFD-01", days: "Day 0", note: "Attach ARN + docs" },
            { step: "Acknowledgement", days: "≤15 days", note: "RFD-02 issued" },
            { step: "Provisional (Export)", days: "7 days", note: "90% of eligible ITC" },
            { step: "Final Order", days: "60 days", note: "RFD-06; interest if delayed" },
          ].map(s => (
            <div key={s.step} className="bg-[var(--color-accent)] rounded-lg p-3">
              <p className="font-semibold text-[var(--color-primary)]">{s.step}</p>
              <p className="font-bold text-xs mt-1">{s.days}</p>
              <p className="text-[var(--color-muted)] mt-0.5">{s.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompositionChecker() {
  const { store } = useApp();
  const [scheme, setScheme] = useState<"regular" | "composition">("regular");
  const [customTurnover, setCustomTurnover] = useState("");

  const annualSales = useMemo(() => {
    const txns = store.transactions ?? [];
    const rev = txns.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount), 0);
    const months = Math.max(txns.length / 30, 1);
    return rev * 12 / months;
  }, [store.transactions]);

  const turnover = parseFloat(customTurnover) || annualSales;

  const COMP_RATES = [
    { type: "Manufacturer / Trader",       limit: 15000000, rate: 1,   note: "CGST 0.5% + SGST 0.5% on turnover" },
    { type: "Restaurant (no alcohol)",     limit: 15000000, rate: 5,   note: "CGST 2.5% + SGST 2.5%" },
    { type: "Service provider (CSCS)",     limit:  5000000, rate: 6,   note: "CGST 3% + SGST 3%; max ₹50L turnover" },
  ];

  const fc = formatCurrency;
  const eligible = turnover <= 15000000;

  const regularGst  = turnover * 0.18; // average blended estimate
  const compGst     = turnover * 0.01; // trader at 1%
  const saving      = regularGst - compGst;

  const pros = ["No invoice-level GST compliance", "Quarterly tax payment (PMT-08)", "Lower tax rate", "No input tax credit complexity"];
  const cons = ["Cannot claim ITC", "Cannot make inter-state supplies", "Cannot supply exempt goods or services (not in list)", "B2B buyers cannot claim ITC from you — lose competitiveness", "Cannot issue tax invoice"];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold">Composition Scheme Eligibility Check</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual Turnover (₹) — auto from transactions</label>
            <input type="number" value={customTurnover} onChange={e => setCustomTurnover(e.target.value)}
              placeholder={`Auto: ${fc(annualSales)}`}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Compare</label>
            <div className="flex gap-2">
              {(["regular","composition"] as const).map(s => (
                <button key={s} onClick={() => setScheme(s)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${scheme === s ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                  {s === "regular" ? "Regular Scheme" : "Composition"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`rounded-lg p-4 border ${eligible ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-bold ${eligible ? "text-green-400" : "text-red-400"}`}>
              {eligible ? "✓ Eligible for Composition Scheme" : "✗ Not Eligible — Turnover exceeds ₹1.5 Crore"}
            </span>
          </div>
          {eligible && (
            <p className="text-xs text-[var(--color-muted)]">Estimated tax saving vs 18% blended regular: <span className="font-bold text-green-400">{fc(saving)}/yr</span></p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COMP_RATES.map(r => (
          <div key={r.type} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${turnover <= r.limit ? "border-[var(--color-primary)]/40" : "border-[var(--color-border)] opacity-50"}`}>
            <p className="text-xs font-semibold mb-1">{r.type}</p>
            <p className="text-2xl font-bold text-[var(--color-primary)]">{r.rate}%</p>
            <p className="text-xs text-[var(--color-muted)] mt-1">{r.note}</p>
            <p className={`text-xs mt-2 font-semibold ${turnover <= r.limit ? "text-green-400" : "text-red-400"}`}>
              Limit: {fc(r.limit)} — {turnover <= r.limit ? "Eligible" : "Exceeds"}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs font-semibold text-green-400 mb-2">Pros</p>
          <ul className="space-y-1">
            {pros.map(p => <li key={p} className="text-xs text-[var(--color-muted)] flex gap-2"><span className="text-green-400">✓</span>{p}</li>)}
          </ul>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs font-semibold text-red-400 mb-2">Cons</p>
          <ul className="space-y-1">
            {cons.map(c => <li key={c} className="text-xs text-[var(--color-muted)] flex gap-2"><span className="text-red-400">✗</span>{c}</li>)}
          </ul>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Sec 10 CGST Act. Composition not available for ice cream, pan masala, tobacco. Interstate supply prohibited. Opt in via CMP-02 before start of FY.</p>
    </div>
  );
}

function QrmpChecker() {
  const { store } = useApp();
  const [customTurnover, setCustomTurnover] = useState("");

  const annualTurnover = useMemo(() => {
    const txns = store.transactions ?? [];
    const rev = txns.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount), 0);
    const months = Math.max(txns.length / 30, 1);
    return rev * 12 / months;
  }, [store.transactions]);

  const turnover = parseFloat(customTurnover) || annualTurnover;
  const qrmpEligible = turnover <= 50000000; // ₹5 crore
  const fc = formatCurrency;

  const QUARTERS = ["Q1 (Apr–Jun)", "Q2 (Jul–Sep)", "Q3 (Oct–Dec)", "Q4 (Jan–Mar)"];
  const MONTHLY_DUE  = { gstr1: "11th", gstr3b: "20th" };
  const QRMP_DUE     = { iff: "13th of M2", pmt06: "25th of M1 & M2", gstr3b_q: "22nd/24th of M3" };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">QRMP Suitability Check</h3>
        <div className="max-w-sm">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Annual Aggregate Turnover (₹)</label>
          <input type="number" value={customTurnover} onChange={e => setCustomTurnover(e.target.value)}
            placeholder={`Auto: ${fc(annualTurnover)}`}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <div className={`mt-4 rounded-lg p-4 border ${qrmpEligible ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
          <p className={`text-sm font-bold ${qrmpEligible ? "text-green-400" : "text-red-400"}`}>
            {qrmpEligible ? "✓ Eligible for QRMP Scheme" : "✗ Not Eligible — Turnover exceeds ₹5 Crore"}
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            {qrmpEligible
              ? "You can opt for quarterly GSTR-1 + GSTR-3B filing via QRMP. File GSTR-1 quarterly with IFF for B2B in months 1 & 2."
              : "Businesses with turnover > ₹5 Cr must file GSTR-1 and GSTR-3B monthly."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
            <span className="text-xs font-semibold">Monthly Filing (Current)</span>
            <span className="text-xs text-[var(--color-muted)]">24 filings/yr</span>
          </div>
          <div className="p-4 space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">GSTR-1</span><span className="font-semibold">By {MONTHLY_DUE.gstr1} each month</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">GSTR-3B</span><span className="font-semibold">By {MONTHLY_DUE.gstr3b} each month</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Annual filings</span><span className="font-semibold text-red-400">24 (12+12)</span></div>
          </div>
        </div>
        <div className={`bg-[var(--color-surface)] border rounded-lg overflow-hidden ${qrmpEligible ? "border-[var(--color-primary)]/40" : "border-[var(--color-border)] opacity-50"}`}>
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-primary)]">QRMP Scheme</span>
            <span className="text-xs text-[var(--color-muted)]">~13 filings/yr</span>
          </div>
          <div className="p-4 space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">IFF (B2B)</span><span className="font-semibold">By {QRMP_DUE.iff} (optional)</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">PMT-06 (tax)</span><span className="font-semibold">By {QRMP_DUE.pmt06}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">GSTR-3B (Q)</span><span className="font-semibold">By {QRMP_DUE.gstr3b_q}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Annual filings</span><span className="font-semibold text-green-400">~13 (4+4+PMT)</span></div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold mb-3">Quarterly Filing Calendar</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {QUARTERS.map(q => (
            <div key={q} className="bg-[var(--color-accent)] rounded-lg p-3 text-xs">
              <p className="font-semibold text-[var(--color-primary)]">{q}</p>
              <p className="text-[var(--color-muted)] mt-1">IFF: 13th M1, M2</p>
              <p className="text-[var(--color-muted)]">PMT-06: 25th M1, M2</p>
              <p className="text-[var(--color-muted)]">3B: 22nd/24th M3</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">QRMP opt-in via GST portal between 1st–31st of first month of each quarter. Category I taxpayers: 20th; Category II: 22nd/24th for GSTR-3B.</p>
    </div>
  );
}

function TdsUnderGst() {
  type TdsEntry = { id: string; deductor: string; contract: string; amount: number; tdsAmt: number; month: string; credited: boolean };
  const [entries,  setEntries]  = useState<TdsEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fDeduct,  setFDeduct]  = useState("");
  const [fContract,setFContract]= useState("");
  const [fAmount,  setFAmount]  = useState("");
  const [fMonth,   setFMonth]   = useState("");

  const TDS_RATE = 0.02; // 2% (1% CGST + 1% SGST) or 2% IGST

  const addEntry = () => {
    if (!fDeduct || !fAmount) return;
    const amt = parseFloat(fAmount) || 0;
    setEntries(prev => [...prev, { id: Math.random().toString(36).slice(2), deductor: fDeduct, contract: fContract, amount: amt, tdsAmt: Math.round(amt * TDS_RATE), month: fMonth, credited: false }]);
    setFDeduct(""); setFContract(""); setFAmount(""); setFMonth(""); setShowForm(false);
  };

  const toggle = (id: string) => setEntries(prev => prev.map(e => e.id === id ? { ...e, credited: !e.credited } : e));

  const totalTds    = entries.reduce((s, e) => s + e.tdsAmt, 0);
  const pendingTds  = entries.filter(e => !e.credited).reduce((s, e) => s + e.tdsAmt, 0);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total TDS Deducted", value: fc(totalTds),   color: "text-[var(--color-primary)]" },
          { label: "Pending Credit",     value: fc(pendingTds), color: pendingTds > 0 ? "text-red-400" : "text-green-400" },
          { label: "TDS Rate",           value: "2%",           color: "text-blue-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <FileText size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">TDS under GST (Sec 51)</span>
          </div>
          <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
            <X size={11} className={showForm ? "" : "rotate-45"} /> {showForm ? "Cancel" : "Add entry"}
          </button>
        </div>

        {showForm && (
          <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-accent)]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input value={fDeduct} onChange={e => setFDeduct(e.target.value)} placeholder="Deductor name *" className={inp} />
              <input value={fContract} onChange={e => setFContract(e.target.value)} placeholder="Contract / PO ref" className={inp} />
              <input type="number" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="Contract value (₹) *" className={inp} />
              <input value={fMonth} onChange={e => setFMonth(e.target.value)} placeholder="Month (e.g. Apr 2024)" className={inp} />
            </div>
            {fAmount && <p className="text-xs text-[var(--color-muted)] mt-2">TDS = {fc(Math.round((parseFloat(fAmount)||0) * TDS_RATE))} (2% of {fc(parseFloat(fAmount)||0)})</p>}
            <button onClick={addEntry} className="mt-2 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No TDS entries. Government departments/PSUs/local authorities deduct 2% GST TDS on contracts &gt; ₹2.5L. Track credit here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Deductor","Contract","Month","Contract Value","TDS (2%)","Status",""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-3 font-semibold">{e.deductor}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{e.contract || "—"}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{e.month || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{fc(e.amount)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-orange-400">{fc(e.tdsAmt)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggle(e.id)} className={`text-xs font-bold px-2 py-0.5 rounded-full ${e.credited ? "bg-green-950/30 text-green-400" : "bg-yellow-950/30 text-yellow-400"}`}>
                        {e.credited ? "Credited in GSTR-2B" : "Pending"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setEntries(prev => prev.filter(x => x.id !== e.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-xs space-y-2">
        <p className="font-semibold text-[var(--color-muted)]">Who deducts? When does it apply?</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { title: "Who must deduct",  body: "Govt departments, PSUs, local authorities, Panchayats, Municipalities — when total contract value > ₹2.5 lakh" },
            { title: "Rate",             body: "2% of taxable value (1% CGST + 1% SGST for intra-state; 2% IGST for inter-state)" },
            { title: "GSTR-7",          body: "Deductor files GSTR-7 by 10th of next month. TDS reflected in your GSTR-2B." },
            { title: "Claim credit",     body: "Claim TDS credit in GSTR-3B (Table 8C). If unaccepted in 2B, follow up with deductor." },
          ].map(r => (
            <div key={r.title} className="bg-[var(--color-accent)] rounded-lg p-3">
              <p className="font-semibold text-[var(--color-primary)] mb-1">{r.title}</p>
              <p className="text-[var(--color-muted)]">{r.body}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Sec 51 CGST Act. TDS not applicable on exempt supplies, transactions between govt entities, or if supplier's GSTIN is not furnished. TDS ≠ TCS — TCS under Sec 52 is by e-commerce operators.</p>
    </div>
  );
}

function EInvoiceReadiness() {
  const { store } = useApp();
  const [customTurnover, setCustomTurnover] = useState("");

  const annualRevenue = useMemo(() => {
    const txns = store.transactions ?? [];
    const rev = txns.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount), 0);
    const months = Math.max(txns.length / 30, 1);
    return rev * 12 / months;
  }, [store.transactions]);

  const turnover = parseFloat(customTurnover) || annualRevenue;
  const threshold = 50000000; // ₹5 Cr — current mandatory threshold
  const mandatory = turnover >= threshold;
  const fc = formatCurrency;

  const CHECKLIST = [
    { id: "gstin",   label: "Valid GSTIN and e-invoice registration on IRP",             critical: true },
    { id: "api",     label: "ERP/billing software supports IRN generation via IRP API",  critical: true },
    { id: "qr",      label: "QR code printing on invoice",                               critical: true },
    { id: "irn",     label: "IRN (Invoice Reference Number) generated before supply",    critical: true },
    { id: "cancel",  label: "Cancellation process within 24 hours of IRN generation",    critical: true },
    { id: "b2b",     label: "e-Invoice required only for B2B, exports, and SEZ — not B2C", critical: false },
    { id: "eway",    label: "e-Way Bill auto-generated from e-Invoice for consignments > ₹50K", critical: false },
    { id: "archive", label: "IRN records archived for 8 years (CGST Rule 56)",           critical: false },
    { id: "test",    label: "Tested on sandbox IRP before go-live",                      critical: false },
  ];

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const critical  = CHECKLIST.filter(c => c.critical);
  const criticalDone = critical.filter(c => checked.has(c.id)).length;
  const totalDone    = CHECKLIST.filter(c => checked.has(c.id)).length;
  const ready = criticalDone === critical.length;

  const IRP_PORTALS = ["NIC (einvoice1.gst.gov.in)", "IRIS Business", "Clear (Defmacro)", "EY", "Deloitte", "GSTN (NIC2)"];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">e-Invoice Readiness (Sec 68 / Rule 48(4))</h3>
        <div className="max-w-sm">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Annual Aggregate Turnover (₹)</label>
          <input type="number" value={customTurnover} onChange={e => setCustomTurnover(e.target.value)}
            placeholder={`Auto: ${fc(annualRevenue)}`}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <div className={`rounded-lg p-4 border ${mandatory ? "border-orange-800/40 bg-orange-950/20" : "border-green-800/40 bg-green-950/20"}`}>
          <p className={`text-sm font-bold ${mandatory ? "text-orange-400" : "text-green-400"}`}>
            {mandatory
              ? `⚠ e-Invoice is MANDATORY — turnover ${fc(turnover)} ≥ ₹5 Cr threshold`
              : `✓ e-Invoice not yet mandatory — turnover ${fc(turnover)} below ₹5 Cr threshold`}
          </p>
          {!mandatory && (
            <p className="text-xs text-[var(--color-muted)] mt-1">Prepare anyway — threshold has been dropping every 2 years (₹500Cr → ₹100Cr → ₹50Cr → ₹20Cr → ₹10Cr → ₹5Cr).</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Checklist Done",    value: `${totalDone}/${CHECKLIST.length}`, color: "text-[var(--color-primary)]" },
          { label: "Critical Items",    value: `${criticalDone}/${critical.length}`, color: criticalDone === critical.length ? "text-green-400" : "text-red-400" },
          { label: "Status",            value: ready ? "Ready" : "Not Ready",       color: ready ? "text-green-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Implementation Checklist</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {CHECKLIST.map(item => (
            <label key={item.id} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--color-accent)]">
              <input type="checkbox" checked={checked.has(item.id)} onChange={() => toggle(item.id)} className="accent-[var(--color-primary)] mt-0.5" />
              <span className={`text-sm ${checked.has(item.id) ? "line-through text-[var(--color-muted)]" : ""}`}>
                {item.label}
                {item.critical && <span className="ml-2 text-[10px] bg-red-950/30 text-red-400 px-1.5 py-0.5 rounded font-semibold">Critical</span>}
              </span>
            </label>
          ))}
        </div>
        {ready && (
          <div className="px-4 py-3 bg-green-950/20 border-t border-green-800/40 text-sm text-green-400 flex items-center gap-2">
            <CheckCircle2 size={14} /> All critical items complete — your system is e-Invoice ready!
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Approved IRP Portals</p>
        <div className="flex flex-wrap gap-2">
          {IRP_PORTALS.map(p => <span key={p} className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-2 py-1 rounded">{p}</span>)}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">e-Invoice mandatory for B2B + export + SEZ supplies. Not for B2C, nil-rated, exempt, or RCM inward. IRN valid for 30 days from generation. Failure: invalid invoice = ITC blocked for buyer.</p>
    </div>
  );
}
