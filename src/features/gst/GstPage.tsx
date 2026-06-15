import { useState, useEffect, useMemo } from "react";
import { useFeatureState } from "@/hooks/useFeatureState";
import { api } from "@/lib/api";
import { formatCurrency, formatAmount } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { gstLedger } from "@/lib/finance";
import { Calculator, Calendar, FileText, CheckCircle2, Clock, AlertTriangle, Search, ShieldCheck, XCircle, RefreshCw, BookOpen, GitCompare, Upload, Download, Receipt, Truck, X, TrendingUp, MapPin, Building2, Percent, Ban, Divide, Star, Banknote, Wallet, Globe, Activity, Timer, Gauge, Scale, RotateCcw, CalendarClock, Coins, FileMinus, Flame, ClipboardCheck, Hammer, Network, ArrowLeftRight, Split, Users, Gift, UserCheck, ListChecks } from "lucide-react";
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
  const [tab, setTab]             = useState<"calculator" | "ledger" | "returns" | "calendar" | "verify" | "match" | "gstr1" | "eway" | "hsn" | "rcm" | "itc" | "gstr9" | "lut" | "refund" | "composition" | "qrmp" | "tdsgst" | "einvoice" | "notice" | "gstr3b-prep" | "itc-recon" | "liability-forecast" | "place-supply" | "multi-gstin" | "rate-impact" | "blocked-credit" | "itc-reversal" | "vendor-score" | "drc03" | "gst-advances" | "zero-rated" | "health-score" | "interest-fee" | "threshold" | "gstr1-3b" | "rule180" | "einv30" | "inverted" | "cdn-register" | "cess" | "gstr9c" | "jobwork" | "isd" | "branch-transfer" | "pmt09" | "cross-charge" | "free-samples" | "pure-agent" | "audit-ready">("calculator");
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
        {([["calculator", "Calculator", Calculator], ["ledger", "Ledger", BookOpen], ["gstr1", "GSTR-1", Receipt], ["returns", `Returns (${returns.length})`, FileText], ["match", "2B Match", GitCompare], ["calendar", "Calendar", Calendar], ["eway", "E-Way Bill", Truck], ["rcm", "RCM", AlertTriangle], ["hsn", "HSN Lookup", Search], ["verify", "Verify GSTIN", ShieldCheck], ["itc", "ITC Optimizer", CheckCircle2], ["gstr9", "GSTR-9", FileText], ["lut", "LUT Tracker", ShieldCheck], ["refund", "Refund Tracker", Download], ["composition", "Composition", ShieldCheck], ["qrmp", "QRMP", Calendar], ["tdsgst", "TDS/TCS-GST", FileText], ["einvoice", "e-Invoice", CheckCircle2], ["notice", "Notice Reply", AlertTriangle], ["gstr3b-prep", "3B Auto-Prep", FileText], ["itc-recon", "2B vs Books", GitCompare], ["liability-forecast", "Liability Forecast", TrendingUp], ["place-supply", "Place of Supply", MapPin], ["multi-gstin", "Multi-GSTIN", Building2], ["rate-impact", "Rate-Change", Percent], ["blocked-credit", "Blocked Credit", Ban], ["itc-reversal", "ITC Reversal", Divide], ["vendor-score", "Vendor Score", Star], ["drc03", "DRC-03", Banknote], ["gst-advances", "GST on Advances", Wallet], ["zero-rated", "Export/SEZ Kit", Globe], ["health-score", "Health Score", Activity], ["interest-fee", "Interest & Late Fee", Timer], ["threshold", "Registration Advisor", Gauge], ["gstr1-3b", "GSTR-1 vs 3B", Scale], ["rule180", "180-Day Reversal", RotateCcw], ["einv30", "e-Invoice 30-Day", CalendarClock], ["inverted", "Inverted-Duty Refund", Coins], ["cdn-register", "Credit/Debit Notes", FileMinus], ["cess", "Cess Calculator", Flame], ["gstr9c", "GSTR-9C Recon", ClipboardCheck], ["jobwork", "Job-Work ITC-04", Hammer], ["isd", "ISD Distributor", Network], ["branch-transfer", "Branch Transfer", ArrowLeftRight], ["pmt09", "PMT-09 Transfer", Split], ["cross-charge", "Cross-Charge", Users], ["free-samples", "Free Samples/Gifts", Gift], ["pure-agent", "Pure Agent", UserCheck], ["audit-ready", "Audit-Readiness", ListChecks]] as const).map(([id, label, Icon]) => (
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
        const [luts, setLuts]       = useFeatureState<Lut[]>("lut-register", []);
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

      {tab === "notice" && (() => {
        return <GstNoticeTemplates />;
      })()}

      {tab === "gstr3b-prep"        && <Gstr3bAutoPrep />}
      {tab === "itc-recon"          && <ItcBooksReconciliation />}
      {tab === "liability-forecast" && <GstLiabilityForecaster />}
      {tab === "place-supply"       && <PlaceOfSupplyDeterminer />}
      {tab === "multi-gstin"        && <MultiGstinConsolidator />}
      {tab === "rate-impact"        && <RateChangeSimulator />}
      {tab === "blocked-credit"     && <BlockedCreditChecker />}
      {tab === "itc-reversal"       && <ItcReversalCalculator />}
      {tab === "vendor-score"       && <VendorComplianceScore />}
      {tab === "drc03"              && <Drc03Helper />}
      {tab === "gst-advances"       && <GstAdvancesTracker />}
      {tab === "zero-rated"         && <ZeroRatedInvoiceKit />}
      {tab === "health-score"       && <GstHealthScore />}
      {tab === "interest-fee"       && <GstInterestLateFee />}
      {tab === "threshold"          && <RegistrationThresholdAdvisor />}
      {tab === "gstr1-3b"           && <Gstr1Vs3bReconciler />}
      {tab === "rule180"            && <Rule180ReversalTracker />}
      {tab === "einv30"             && <EInvoice30DayTracker />}
      {tab === "inverted"           && <InvertedDutyRefundCalculator />}
      {tab === "cdn-register"       && <CreditDebitNoteRegister />}
      {tab === "cess"               && <CompensationCessCalculator />}
      {tab === "gstr9c"             && <Gstr9cReconciliation />}
      {tab === "jobwork"            && <JobWorkItc04Tracker />}
      {tab === "isd"                && <IsdCreditDistributor />}
      {tab === "branch-transfer"    && <BranchTransferInvoicer />}
      {tab === "pmt09"              && <Pmt09FundTransfer />}
      {tab === "cross-charge"       && <CrossChargeCalculator />}
      {tab === "free-samples"       && <FreeSamplesItcReversal />}
      {tab === "pure-agent"         && <PureAgentTagger />}
      {tab === "audit-ready"        && <AuditReadinessChecklist />}
    </div>
  );
}

function GstRefundTracker() {
  type RefundStatus = "Draft" | "Filed" | "Acknowledged" | "Processing" | "Approved" | "Credited" | "Deficiency" | "Rejected";
  type RefundType   = "Export (LUT)" | "Inverted Duty" | "Excess Cash Ledger" | "IGST on Export" | "Deemed Export" | "Other";
  type RefundEntry  = { id: string; refNo: string; type: RefundType; period: string; claimed: number; status: RefundStatus; filedDate: string; notes: string };

  const [entries,   setEntries]   = useFeatureState<RefundEntry[]>("gst-refunds", []);
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
  const [entries,  setEntries]  = useFeatureState<TdsEntry[]>("tds-gst-entries", []);
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

function GstNoticeTemplates() {
  const [selected, setSelected] = useState(0);
  const [gstin,    setGstin]    = useState("");
  const [period,   setPeriod]   = useState("");
  const [amount,   setAmount]   = useState("");
  const [copied,   setCopied]   = useState(false);

  const TEMPLATES = [
    {
      title: "SCN — GSTR-1 vs GSTR-3B Mismatch",
      section: "Sec 61 / Rule 99",
      body: (g: string, p: string, a: string) => `GSTIN: ${g||"[GSTIN]"}   Period: ${p||"[Period]"}\n\nSub: Reply to SCN for discrepancy of ₹${a||"[Amount]"} between GSTR-1 and GSTR-3B\n\nDear Sir/Madam,\n\nThe discrepancy arose due to [reason — clerical error / amendment pending / debit note not captured].\n\nRelevant invoices are enclosed. We propose to rectify via [amendment / payment of differential tax with interest].\n\nWe request closure of this matter.\n\nYours faithfully,\n[Authorised Signatory] | [Company Name] | GSTIN: ${g||"[GSTIN]"}`,
    },
    {
      title: "Reply — Non-filing of GSTR-3B",
      section: "Sec 46 / Sec 122",
      body: (g: string, p: string, _: string) => `GSTIN: ${g||"[GSTIN]"}   Period: ${p||"[Period]"}\n\nSub: Reply to notice for non-filing of GSTR-3B for ${p||"[Period]"}\n\nDear Sir/Madam,\n\nWe acknowledge the notice. The delay was caused due to [reason — portal issues / illness / delayed data].\n\nThe return has now been filed on [Date], ARN: [ARN]. Late fee and interest have been paid. Proof of filing enclosed.\n\nWe assure compliance going forward.\n\nYours faithfully,\n[Authorised Signatory] | [Company Name] | GSTIN: ${g||"[GSTIN]"}`,
    },
    {
      title: "Reply — Demand (Sec 73 Short Payment)",
      section: "Sec 73 CGST Act",
      body: (g: string, p: string, a: string) => `GSTIN: ${g||"[GSTIN]"}   Period: ${p||"[Period]"}\n\nSub: Reply to demand for short payment of ₹${a||"[Amount]"} u/s 73 for ${p||"[Period]"}\n\nDear Sir/Madam,\n\nThe demand is disputed on the following grounds:\n1. [Ground 1 — supply is exempt / zero-rated / classified differently]\n2. Supporting invoices and contracts enclosed as Annexure A.\n\nWithout prejudice, we are willing to pay ₹[Undisputed Amount] as undisputed liability.\n\nWe request a personal hearing before the final order u/s 73(9).\n\nYours faithfully,\n[Authorised Signatory] | [Company Name] | GSTIN: ${g||"[GSTIN]"}`,
    },
    {
      title: "Reply — Excess ITC / Blocked Credit",
      section: "Sec 16(2) / Rule 36",
      body: (g: string, p: string, a: string) => `GSTIN: ${g||"[GSTIN]"}   Period: ${p||"[Period]"}\n\nSub: Reply to notice for excess ITC of ₹${a||"[Amount]"} for ${p||"[Period]"}\n\nDear Sir/Madam,\n\nThe ITC of ₹${a||"[Amount]"} was claimed on valid tax invoices from registered suppliers. Payment was made within 180 days (Rule 37). The credit does not fall under Sec 17(5) blocked list.\n\nSupporting invoices, GSTR-2B reconciliation, and payment proofs are enclosed.\n\nWe request withdrawal of the notice.\n\nYours faithfully,\n[Authorised Signatory] | [Company Name] | GSTIN: ${g||"[GSTIN]"}`,
    },
  ];

  const tmpl = TEMPLATES[selected];
  const text = tmpl.body(gstin, period, amount);
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">GST Notice Reply Templates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {TEMPLATES.map((t, i) => (
            <button key={i} onClick={() => setSelected(i)}
              className={`text-left p-3 rounded-lg border text-xs transition-colors ${selected === i ? "border-[var(--color-primary)]/60 bg-[var(--color-primary)]/10" : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"}`}>
              <div className="font-semibold mb-0.5">{t.title}</div>
              <div className="text-[var(--color-muted)]">{t.section}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Your GSTIN</label><input value={gstin} onChange={e=>setGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Tax Period</label><input value={period} onChange={e=>setPeriod(e.target.value)} placeholder="Apr 2024" className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label><input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="50000" className={inp} /></div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">{tmpl.title}</span>
          <button onClick={copy} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
            <FileText size={11} /> {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="p-4 text-xs font-mono text-[var(--color-muted)] whitespace-pre-wrap leading-relaxed">{text}</pre>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Templates are starting points — always review with your CA before submitting. Replace all [bracketed] fields. Attach supporting documents as annexures.</p>
    </div>
  );
}

// ── #1 GSTR-3B Auto-Prep ──────────────────────────────────────────────────────
function Gstr3bAutoPrep() {
  const { store } = useApp();
  const firm = store.firm;
  const rate = (firm.gstRate ?? 18) / 100;
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const data = useMemo(() => {
    const txns = (store.transactions ?? []).filter(t => t.date.slice(0, 7) === period);
    // Outward: revenue inflows are GST-inclusive sale receipts → back out taxable value.
    const outwardGross = txns.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount), 0);
    const outwardTaxable = Math.round(outwardGross / (1 + rate));
    const outputTax = outwardGross - outwardTaxable;
    // Inward: expense outflows eligible for ITC (exclude payroll/tax/loan/transfer).
    const inwardGross = txns.filter(t => t.category === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
    const inwardTaxable = Math.round(inwardGross / (1 + rate));
    const itc = inwardGross - inwardTaxable;
    const half = (n: number) => Math.round(n / 2);
    const net = Math.max(0, outputTax - itc);
    const itcCarry = Math.max(0, itc - outputTax);
    return { outwardGross, outwardTaxable, outputTax, inwardGross, inwardTaxable, itc, half, net, itcCarry };
  }, [store.transactions, period, rate]);

  const downloadCsv = () => {
    const rows = [
      ["GSTR-3B Draft", period],
      [],
      ["Table", "Particulars", "Taxable Value", "CGST", "SGST", "IGST", "Total Tax"],
      ["3.1(a)", "Outward taxable supplies", data.outwardTaxable, data.half(data.outputTax), data.half(data.outputTax), 0, data.outputTax],
      ["4(A)(5)", "ITC — all other ITC", data.inwardTaxable, data.half(data.itc), data.half(data.itc), 0, data.itc],
      ["5.1", "Net tax payable (in cash)", "", data.half(data.net), data.half(data.net), 0, data.net],
      ["", "ITC carried forward", "", "", "", "", data.itcCarry],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `GSTR3B-${period}.csv`; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">GSTR-3B Auto-Prep</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Auto-builds Table 3.1 (outward), Table 4 (ITC) and Table 5.1 (net cash) from your booked sales &amp; purchase transactions at {firm.gstRate ?? 18}%.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
            <button onClick={downloadCsv} className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-2 rounded-lg hover:bg-[var(--color-primary)]/10"><Download size={11} /> CSV</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Output tax (3.1a)", value: fc(data.outputTax), color: "text-red-400" },
            { label: "ITC (Table 4)", value: fc(data.itc), color: "text-green-400" },
            { label: "Net payable in cash (5.1)", value: fc(data.net), color: "text-[var(--color-primary)]" },
            { label: "ITC carry-forward", value: fc(data.itcCarry), color: "text-blue-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
            <tr>{["Table", "Particulars", "Taxable Value", "CGST", "SGST", "Total Tax"].map((h, i) => (
              <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i < 2 ? "text-left" : "text-right"}`}>{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] text-xs">
            <tr><td className="px-4 py-2.5 font-mono">3.1(a)</td><td className="px-4 py-2.5">Outward taxable supplies</td><td className="px-4 py-2.5 text-right tabular-nums">{fc(data.outwardTaxable)}</td><td className="px-4 py-2.5 text-right tabular-nums text-red-400">{fc(data.half(data.outputTax))}</td><td className="px-4 py-2.5 text-right tabular-nums text-red-400">{fc(data.half(data.outputTax))}</td><td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fc(data.outputTax)}</td></tr>
            <tr><td className="px-4 py-2.5 font-mono">4(A)(5)</td><td className="px-4 py-2.5">All other ITC</td><td className="px-4 py-2.5 text-right tabular-nums">{fc(data.inwardTaxable)}</td><td className="px-4 py-2.5 text-right tabular-nums text-green-400">{fc(data.half(data.itc))}</td><td className="px-4 py-2.5 text-right tabular-nums text-green-400">{fc(data.half(data.itc))}</td><td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fc(data.itc)}</td></tr>
            <tr className="bg-[var(--color-accent)]/40"><td className="px-4 py-2.5 font-mono">5.1</td><td className="px-4 py-2.5 font-semibold">Tax payable in cash</td><td className="px-4 py-2.5" /><td className="px-4 py-2.5 text-right tabular-nums">{fc(data.half(data.net))}</td><td className="px-4 py-2.5 text-right tabular-nums">{fc(data.half(data.net))}</td><td className="px-4 py-2.5 text-right tabular-nums font-bold text-[var(--color-primary)]">{fc(data.net)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">v1 estimate: treats revenue receipts as GST-inclusive and expenses as ITC-eligible at the firm rate. Exclude blocked credits (Sec 17(5)) and reconcile against GSTR-2B before filing. Inter-state (IGST) split needs place-of-supply data.</p>
    </div>
  );
}

// ── #2 GSTR-2B vs Books ITC Reconciliation (line-level verdict) ───────────────
function ItcBooksReconciliation() {
  type Row = { id: string; gstin: string; invoiceNo: string; party: string; booksTax: number; portalTax: number; supplierFiled: boolean };
  const [rows, setRows] = useFeatureState<Row[]>("itc-recon-books", []);
  const [gstin, setGstin] = useState("");
  const [invNo, setInvNo] = useState("");
  const [party, setParty] = useState("");
  const [booksTax, setBooksTax] = useState("");
  const [portalTax, setPortalTax] = useState("");
  const [filed, setFiled] = useState(true);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const add = () => {
    if (!gstin || !invNo) { toast.error("GSTIN and invoice no. required"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), gstin: gstin.toUpperCase(), invoiceNo: invNo, party, booksTax: parseFloat(booksTax) || 0, portalTax: parseFloat(portalTax) || 0, supplierFiled: filed }]);
    setGstin(""); setInvNo(""); setParty(""); setBooksTax(""); setPortalTax(""); setFiled(true);
  };

  const verdict = (r: Row): { label: string; cls: string; advice: string } => {
    if (r.portalTax === 0 || !r.supplierFiled) return { label: "Chase vendor", cls: "bg-red-950/40 text-red-400 border-red-800/30", advice: "Not in 2B — supplier hasn't filed. ITC blocked under Rule 36(4). Withhold payment / chase." };
    if (Math.abs(r.booksTax - r.portalTax) <= 1) return { label: "Claim now", cls: "bg-green-950/40 text-green-400 border-green-800/30", advice: "Matched in 2B — eligible to claim this period." };
    if (r.portalTax < r.booksTax) return { label: "Defer", cls: "bg-orange-950/40 text-orange-400 border-orange-800/30", advice: "Portal value lower — claim only the 2B amount; defer the balance till supplier amends." };
    return { label: "Claim (book ↑)", cls: "bg-yellow-950/40 text-yellow-400 border-yellow-800/30", advice: "Portal value higher than books — verify your booking, you may be under-claiming." };
  };

  const claimNow = rows.filter(r => verdict(r).label === "Claim now").reduce((s, r) => s + r.booksTax, 0);
  const chase = rows.filter(r => verdict(r).label === "Chase vendor").reduce((s, r) => s + r.booksTax, 0);
  const defer = rows.filter(r => verdict(r).label === "Defer").reduce((s, r) => s + (r.booksTax - r.portalTax), 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">GSTR-2B vs Books ITC Reconciliation</h2>
        <p className="text-xs text-[var(--color-muted)]">Enter each purchase invoice with its book ITC and the tax actually appearing in your GSTR-2B. The engine gives a line-level <strong>Claim now / Defer / Chase vendor</strong> verdict per Rule 36(4).</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="Supplier GSTIN *" className={`${inp} font-mono`} />
          <input value={invNo} onChange={e => setInvNo(e.target.value)} placeholder="Invoice no. *" className={inp} />
          <input value={party} onChange={e => setParty(e.target.value)} placeholder="Party name" className={inp} />
          <input type="number" value={booksTax} onChange={e => setBooksTax(e.target.value)} placeholder="Tax as per books (₹)" className={inp} />
          <input type="number" value={portalTax} onChange={e => setPortalTax(e.target.value)} placeholder="Tax in GSTR-2B (₹)" className={inp} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={filed} onChange={e => setFiled(e.target.checked)} className="accent-[var(--color-primary)]" /> Supplier filed GSTR-1</label>
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add invoice</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Claim now", value: fc(claimNow), color: "text-green-400" },
          { label: "Defer (gap)", value: fc(defer), color: "text-orange-400" },
          { label: "Chase vendor (at risk)", value: fc(chase), color: "text-red-400" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]">
                <tr>{["Verdict", "Supplier", "Invoice", "Books", "2B", "Advice", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(r => { const v = verdict(r); return (
                  <tr key={r.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${v.cls}`}>{v.label}</span></td>
                    <td className="px-3 py-2"><span>{r.party || "—"}</span><br /><span className="text-[10px] text-[var(--color-muted)] font-mono">{r.gstin}</span></td>
                    <td className="px-3 py-2 font-mono">{r.invoiceNo}</td>
                    <td className="px-3 py-2 tabular-nums">{fc(r.booksTax)}</td>
                    <td className="px-3 py-2 tabular-nums">{fc(r.portalTax)}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)] max-w-[260px]">{v.advice}</td>
                    <td className="px-3 py-2"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Rule 36(4): ITC restricted to invoices reflected in GSTR-2B. Defer the un-reflected portion to the period the supplier amends and your 2B updates.</p>
    </div>
  );
}

// ── #3 GST Liability Forecaster ───────────────────────────────────────────────
function GstLiabilityForecaster() {
  const { store } = useApp();
  const rate = (store.firm.gstRate ?? 18) / 100;
  const [months, setMonths] = useState(3);
  const [growth, setGrowth] = useState("0");
  const fc = formatCurrency;

  const base = useMemo(() => {
    const txns = store.transactions ?? [];
    // Average of last up-to-3 months of revenue & expense.
    const byMonth: Record<string, { rev: number; exp: number }> = {};
    txns.forEach(t => {
      const k = t.date.slice(0, 7);
      byMonth[k] = byMonth[k] ?? { rev: 0, exp: 0 };
      if (t.category === "revenue") byMonth[k].rev += Math.abs(t.amount);
      else if (t.category === "expense") byMonth[k].exp += Math.abs(t.amount);
    });
    const recent = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3).map(([, v]) => v);
    const n = Math.max(1, recent.length);
    const avgRev = recent.reduce((s, m) => s + m.rev, 0) / n;
    const avgExp = recent.reduce((s, m) => s + m.exp, 0) / n;
    // Open invoices in pipeline that will likely turn into outward supplies.
    const pipeline = (store.invoices ?? []).filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
    return { avgRev, avgExp, pipeline };
  }, [store.transactions, store.invoices]);

  const g = (parseFloat(growth) || 0) / 100;
  const proj = useMemo(() => {
    const out: { label: string; output: number; itc: number; net: number }[] = [];
    const now = new Date();
    for (let i = 1; i <= months; i++) {
      const factor = Math.pow(1 + g, i);
      const rev = base.avgRev * factor + (i === 1 ? base.pipeline * 0.5 : 0);
      const exp = base.avgExp * factor;
      const output = Math.round((rev / (1 + rate)) * rate);
      const itc = Math.round((exp / (1 + rate)) * rate);
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push({ label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }), output, itc, net: Math.max(0, output - itc) });
    }
    return out;
  }, [base, months, g, rate]);

  const totalNet = proj.reduce((s, p) => s + p.net, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">GST Liability Forecaster</h2>
        <p className="text-xs text-[var(--color-muted)]">Projects your net cash GST outgo for the coming months from recent run-rate + open invoice pipeline, so you can pre-fund the cash ledger.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Months ahead</label>
            <select value={months} onChange={e => setMonths(Number(e.target.value))} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
              {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly growth %</label>
            <input type="number" value={growth} onChange={e => setGrowth(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div className="flex items-end"><p className="text-xs text-[var(--color-muted)]">Open pipeline: <strong className="text-[var(--color-text)]">{fc(base.pipeline)}</strong></p></div>
        </div>
      </div>

      <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg px-4 py-3 flex items-center gap-3">
        <TrendingUp size={16} className="text-[var(--color-primary)] shrink-0" />
        <p className="text-sm">Projected net GST cash outgo over next {months} month{months > 1 ? "s" : ""}: <strong className="text-[var(--color-primary)]">{fc(totalNet)}</strong></p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
            <tr>{["Month", "Est. Output Tax", "Est. ITC", "Net Cash GST"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] text-xs">
            {proj.map(p => (
              <tr key={p.label} className="hover:bg-white/2">
                <td className="px-4 py-2.5 font-medium">{p.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-400">{fc(p.output)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{fc(p.itc)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[var(--color-primary)]">{fc(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Forecast assumes recent run-rate continues with the growth applied. Month 1 adds 50% of open invoice pipeline as expected billings. Actuals depend on collections and ITC timing.</p>
    </div>
  );
}

// ── #4 Place-of-Supply Determiner ─────────────────────────────────────────────
const STATE_CODES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu & Kashmir" }, { code: "02", name: "Himachal Pradesh" }, { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" }, { code: "05", name: "Uttarakhand" }, { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" }, { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" }, { code: "19", name: "West Bengal" }, { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" }, { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" }, { code: "32", name: "Kerala" }, { code: "33", name: "Tamil Nadu" },
  { code: "36", name: "Telangana" }, { code: "37", name: "Andhra Pradesh" },
];
function PlaceOfSupplyDeterminer() {
  const [supplyType, setSupplyType] = useState<"goods" | "services">("goods");
  const [supplier, setSupplier] = useState("27");
  const [recipient, setRecipient] = useState("27");
  const [sez, setSez] = useState(false);
  const [billShipDiff, setBillShipDiff] = useState(false);
  const [shipTo, setShipTo] = useState("27");
  const [amount, setAmount] = useState("100000");
  const [rate, setRate] = useState(18);
  const fc = formatCurrency;

  // Place of supply: for bill-to/ship-to of goods (Sec 10(1)(b)), POS = bill-to (recipient) location.
  const pos = recipient;
  const interState = sez || supplier !== pos;
  const taxable = parseFloat(amount) || 0;
  const tax = Math.round(taxable * rate / 100);
  const half = Math.round(tax / 2);
  const name = (c: string) => STATE_CODES.find(s => s.code === c)?.name ?? c;

  const Select = ({ v, set, label }: { v: string; set: (s: string) => void; label: string }) => (
    <div>
      <label className="text-xs text-[var(--color-muted)] block mb-1">{label}</label>
      <select value={v} onChange={e => set(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
        {STATE_CODES.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">Place-of-Supply Determiner</h2>
        <p className="text-xs text-[var(--color-muted)]">Determines inter vs intra-state supply and the CGST/SGST vs IGST split — including SEZ and bill-to/ship-to (Sec 10–12 IGST Act).</p>
        <div className="flex gap-2">
          {(["goods", "services"] as const).map(t => (
            <button key={t} onClick={() => setSupplyType(t)} className={`flex-1 py-2 text-xs font-semibold rounded-lg border capitalize transition-colors ${supplyType === t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{t}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select v={supplier} set={setSupplier} label="Supplier state (location)" />
          <Select v={recipient} set={setRecipient} label={supplyType === "goods" && billShipDiff ? "Bill-to state" : "Recipient state"} />
          {supplyType === "goods" && billShipDiff && <Select v={shipTo} set={setShipTo} label="Ship-to state" />}
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={sez} onChange={e => setSez(e.target.checked)} className="accent-[var(--color-primary)]" /> Supply to SEZ / export</label>
          {supplyType === "goods" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={billShipDiff} onChange={e => setBillShipDiff(e.target.checked)} className="accent-[var(--color-primary)]" /> Bill-to ≠ Ship-to</label>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Taxable value (₹)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">GST rate</label><select value={rate} onChange={e => setRate(Number(e.target.value))} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></div>
        </div>
      </div>

      <div className={`rounded-lg border p-5 ${interState ? "bg-blue-950/20 border-blue-800/40" : "bg-green-950/20 border-green-800/40"}`}>
        <div className="flex items-center gap-2 mb-2">
          <MapPin size={15} className={interState ? "text-blue-400" : "text-green-400"} />
          <p className="text-sm font-bold">{sez ? "Inter-State — Zero-rated (SEZ / Export)" : interState ? "Inter-State Supply → IGST" : "Intra-State Supply → CGST + SGST"}</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Place of supply: <strong className="text-[var(--color-text)]">{name(pos)}</strong> · Supplier: <strong className="text-[var(--color-text)]">{name(supplier)}</strong>{supplyType === "goods" && billShipDiff && <> · POS = bill-to location per Sec 10(1)(b)</>}</p>
        <div className="grid grid-cols-3 gap-3">
          {sez ? (
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-center col-span-3"><p className="text-[10px] text-[var(--color-muted)] mb-1">Tax (zero-rated — LUT or refund)</p><p className="text-lg font-bold tabular-nums text-green-400">{fc(0)}</p></div>
          ) : interState ? (
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-center col-span-3"><p className="text-[10px] text-[var(--color-muted)] mb-1">IGST @ {rate}%</p><p className="text-lg font-bold tabular-nums text-blue-400">{fc(tax)}</p></div>
          ) : (
            <>
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-center"><p className="text-[10px] text-[var(--color-muted)] mb-1">CGST @ {rate / 2}%</p><p className="text-lg font-bold tabular-nums text-orange-400">{fc(half)}</p></div>
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-center"><p className="text-[10px] text-[var(--color-muted)] mb-1">SGST @ {rate / 2}%</p><p className="text-lg font-bold tabular-nums text-orange-400">{fc(half)}</p></div>
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-center"><p className="text-[10px] text-[var(--color-muted)] mb-1">Total tax</p><p className="text-lg font-bold tabular-nums">{fc(tax)}</p></div>
            </>
          )}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Sec 7–8 (inter/intra) &amp; Sec 10–13 IGST Act (place of supply). SEZ/export = zero-rated inter-state. For goods with bill-to ≠ ship-to, POS is the bill-to (third party) location.</p>
    </div>
  );
}

// ── #5 Multi-GSTIN Consolidator ───────────────────────────────────────────────
function MultiGstinConsolidator() {
  type Unit = { id: string; gstin: string; state: string; output: number; itc: number; cashLedger: number };
  const [units, setUnits] = useFeatureState<Unit[]>("multi-gstin-units", []);
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("");
  const [output, setOutput] = useState("");
  const [itc, setItc] = useState("");
  const [cash, setCash] = useState("");
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const add = () => {
    if (gstin.length !== 15) { toast.error("Enter a 15-char GSTIN"); return; }
    setUnits(prev => [...prev, { id: crypto.randomUUID(), gstin: gstin.toUpperCase(), state: state || STATE_CODES.find(s => s.code === gstin.slice(0, 2))?.name || gstin.slice(0, 2), output: parseFloat(output) || 0, itc: parseFloat(itc) || 0, cashLedger: parseFloat(cash) || 0 }]);
    setGstin(""); setState(""); setOutput(""); setItc(""); setCash("");
  };

  const tOut = units.reduce((s, u) => s + u.output, 0);
  const tItc = units.reduce((s, u) => s + u.itc, 0);
  const tCash = units.reduce((s, u) => s + u.cashLedger, 0);
  const tNet = units.reduce((s, u) => s + Math.max(0, u.output - u.itc - u.cashLedger), 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">Multi-GSTIN Consolidator</h2>
        <p className="text-xs text-[var(--color-muted)]">Single dashboard across all your state GST registrations under one PAN. ITC cannot cross GSTINs — each unit settles separately.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input value={gstin} onChange={e => setGstin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15))} placeholder="GSTIN *" className={`${inp} font-mono`} maxLength={15} />
          <input value={state} onChange={e => setState(e.target.value)} placeholder="State (auto)" className={inp} />
          <input type="number" value={output} onChange={e => setOutput(e.target.value)} placeholder="Output tax ₹" className={inp} />
          <input type="number" value={itc} onChange={e => setItc(e.target.value)} placeholder="ITC ₹" className={inp} />
          <input type="number" value={cash} onChange={e => setCash(e.target.value)} placeholder="Cash ledger ₹" className={inp} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add GSTIN</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Registrations", value: String(units.length), color: "text-[var(--color-primary)]" },
          { label: "Total output tax", value: fc(tOut), color: "text-red-400" },
          { label: "Total ITC", value: fc(tItc), color: "text-green-400" },
          { label: "Net cash payable", value: fc(tNet), color: "text-[var(--color-primary)]" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
        ))}
      </div>

      {units.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["GSTIN", "State", "Output", "ITC", "Cash ledger", "Net payable", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {units.map(u => { const net = Math.max(0, u.output - u.itc - u.cashLedger); return (
                  <tr key={u.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 font-mono">{u.gstin}</td>
                    <td className="px-3 py-2">{u.state}</td>
                    <td className="px-3 py-2 tabular-nums text-red-400">{fc(u.output)}</td>
                    <td className="px-3 py-2 tabular-nums text-green-400">{fc(u.itc)}</td>
                    <td className="px-3 py-2 tabular-nums">{fc(u.cashLedger)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{fc(net)}</td>
                    <td className="px-3 py-2"><button onClick={() => setUnits(prev => prev.filter(x => x.id !== u.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Each GSTIN is a distinct registration — output, ITC and electronic cash/credit ledgers are state-specific. Cross-utilisation of ITC between GSTINs is not permitted (except via ISD distribution).</p>
    </div>
  );
}

// ── #6 GST Rate-Change Impact Simulator ───────────────────────────────────────
function RateChangeSimulator() {
  type Item = { id: string; name: string; base: number; oldRate: number; newRate: number; gstInclusive: boolean };
  const [items, setItems] = useFeatureState<Item[]>("rate-change-items", []);
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [oldRate, setOldRate] = useState(12);
  const [newRate, setNewRate] = useState(18);
  const [inclusive, setInclusive] = useState(true);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const add = () => {
    if (!name || !base) { toast.error("Item name and price required"); return; }
    setItems(prev => [...prev, { id: crypto.randomUUID(), name, base: parseFloat(base) || 0, oldRate, newRate, gstInclusive: inclusive }]);
    setName(""); setBase("");
  };

  // If price is GST-inclusive we hold the MRP and recompute taxable; else taxable held and gross moves.
  const calc = (it: Item) => {
    if (it.gstInclusive) {
      const taxableOld = it.base / (1 + it.oldRate / 100);
      const taxableNew = it.base / (1 + it.newRate / 100); // hold MRP → margin shrinks/grows
      const grossNew = it.base; // unchanged MRP
      return { grossOld: it.base, grossNew, taxableOld: Math.round(taxableOld), taxableNew: Math.round(taxableNew), marginDelta: Math.round(taxableNew - taxableOld) };
    }
    const grossOld = it.base * (1 + it.oldRate / 100);
    const grossNew = it.base * (1 + it.newRate / 100);
    return { grossOld: Math.round(grossOld), grossNew: Math.round(grossNew), taxableOld: it.base, taxableNew: it.base, marginDelta: 0, mrpDelta: Math.round(grossNew - grossOld) };
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">GST Rate-Change Impact Simulator</h2>
        <p className="text-xs text-[var(--color-muted)]">Re-prices your catalogue when a GST slab changes. Choose whether you hold the MRP (margin moves) or the base price (MRP moves).</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Item / SKU *" className={inp} />
          <input type="number" value={base} onChange={e => setBase(e.target.value)} placeholder={inclusive ? "Current MRP ₹ *" : "Base price ₹ *"} className={inp} />
          <select value={oldRate} onChange={e => setOldRate(Number(e.target.value))} className={inp}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>Old {r}%</option>)}</select>
          <select value={newRate} onChange={e => setNewRate(Number(e.target.value))} className={inp}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>New {r}%</option>)}</select>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={inclusive} onChange={e => setInclusive(e.target.checked)} className="accent-[var(--color-primary)]" /> Price is GST-inclusive</label>
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add item</button>
      </div>

      {items.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Item", "Mode", "Old → New", "Gross old", "Gross new", "Impact", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {items.map(it => { const c = calc(it); const impact = it.gstInclusive ? c.marginDelta : (c.grossNew - c.grossOld); return (
                  <tr key={it.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 font-medium">{it.name}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{it.gstInclusive ? "Hold MRP" : "Hold base"}</td>
                    <td className="px-3 py-2">{it.oldRate}% → {it.newRate}%</td>
                    <td className="px-3 py-2 tabular-nums">{fc(c.grossOld)}</td>
                    <td className="px-3 py-2 tabular-nums">{fc(c.grossNew)}</td>
                    <td className={`px-3 py-2 tabular-nums font-semibold ${impact >= 0 ? "text-green-400" : "text-red-400"}`}>{impact >= 0 ? "+" : ""}{fc(impact)} {it.gstInclusive ? "margin" : "MRP"}</td>
                    <td className="px-3 py-2"><button onClick={() => setItems(prev => prev.filter(x => x.id !== it.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Hold-MRP: customer price unchanged, your taxable margin moves with the rate. Hold-base: you pass the rate change to the customer. Re-print MRP stickers and update e-invoice masters on the effective date.</p>
    </div>
  );
}

// ── #7 Blocked Credit (Sec 17(5)) Checker ─────────────────────────────────────
function BlockedCreditChecker() {
  type Entry = { id: string; head: string; amount: number; blocked: boolean; reason: string };
  const HEADS: { key: string; label: string; blocked: boolean; reason: string }[] = [
    { key: "motor", label: "Motor vehicles (≤13 seats) — not for resale/transport/training", blocked: true, reason: "17(5)(a)" },
    { key: "food", label: "Food, beverages, outdoor catering", blocked: true, reason: "17(5)(b)(i)" },
    { key: "health", label: "Health services, cosmetic surgery, club membership", blocked: true, reason: "17(5)(b)(ii)" },
    { key: "rentcab", label: "Rent-a-cab, life/health insurance (non-mandatory)", blocked: true, reason: "17(5)(b)(iii)" },
    { key: "construction", label: "Works contract / goods for construction of immovable property", blocked: true, reason: "17(5)(c)/(d)" },
    { key: "csr", label: "CSR expenditure", blocked: true, reason: "17(5)(fa)" },
    { key: "personal", label: "Goods/services for personal consumption", blocked: true, reason: "17(5)(g)" },
    { key: "lost", label: "Goods lost, stolen, destroyed, written off, gifts/free samples", blocked: true, reason: "17(5)(h)" },
    { key: "inputs", label: "Raw materials / inputs for taxable supply", blocked: false, reason: "Eligible" },
    { key: "capital", label: "Plant & machinery for business", blocked: false, reason: "Eligible" },
    { key: "services", label: "Business services (audit, IT, rent of commercial premise)", blocked: false, reason: "Eligible" },
    { key: "resale", label: "Motor vehicle for resale / passenger transport business", blocked: false, reason: "Exception 17(5)(a)" },
  ];
  const [entries, setEntries] = useFeatureState<Entry[]>("blocked-credit-entries", []);
  const [head, setHead] = useState(HEADS[0].key);
  const [amount, setAmount] = useState("");
  const fc = formatCurrency;

  const add = () => {
    const h = HEADS.find(x => x.key === head)!;
    if (!amount) { toast.error("Enter ITC amount"); return; }
    setEntries(prev => [...prev, { id: crypto.randomUUID(), head: h.label, amount: parseFloat(amount) || 0, blocked: h.blocked, reason: h.reason }]);
    setAmount("");
  };

  const blocked = entries.filter(e => e.blocked).reduce((s, e) => s + e.amount, 0);
  const eligible = entries.filter(e => !e.blocked).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">Blocked Credit Checker — Sec 17(5)</h2>
        <p className="text-xs text-[var(--color-muted)]">Flag ineligible ITC before you file 3B. Claiming blocked credit attracts reversal + interest @18% + penalty.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select value={head} onChange={e => setHead(e.target.value)} className="md:col-span-2 w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            {HEADS.map(h => <option key={h.key} value={h.key}>{h.blocked ? "🚫 " : "✅ "}{h.label}</option>)}
          </select>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="ITC amount (₹)" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Check &amp; add</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Blocked ITC (must NOT claim)</p><p className="text-xl font-bold tabular-nums text-red-400">{fc(blocked)}</p></div>
        <div className="bg-green-950/20 border border-green-800/40 rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Eligible ITC</p><p className="text-xl font-bold tabular-nums text-green-400">{fc(eligible)}</p></div>
      </div>

      {entries.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Status", "Head", "Section", "ITC", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${e.blocked ? "bg-red-950/40 text-red-400 border-red-800/30" : "bg-green-950/40 text-green-400 border-green-800/30"}`}>{e.blocked ? "Blocked" : "Eligible"}</span></td>
                  <td className="px-3 py-2 max-w-[320px]">{e.head}</td>
                  <td className="px-3 py-2 font-mono text-[var(--color-muted)]">{e.reason}</td>
                  <td className="px-3 py-2 tabular-nums">{fc(e.amount)}</td>
                  <td className="px-3 py-2"><button onClick={() => setEntries(prev => prev.filter(x => x.id !== e.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Sec 17(5) CGST Act. Exceptions: motor vehicles &gt;13 seats, for resale, passenger transport, or driving school; food/insurance where statutorily obligatory for employer. Verify edge cases with your CA.</p>
    </div>
  );
}

// ── #8 ITC Reversal (Rule 42/43) Calculator ───────────────────────────────────
function ItcReversalCalculator() {
  const [common, setCommon] = useState("");
  const [exclTaxable, setExclTaxable] = useState("");
  const [exclExempt, setExclExempt] = useState("");
  const [taxableSupply, setTaxableSupply] = useState("");
  const [exemptSupply, setExemptSupply] = useState("");
  const [capital, setCapital] = useState("");
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  // Rule 42 (inputs/input services)
  const T = parseFloat(common) || 0;            // total ITC on common inputs (C2-relevant)
  const T2 = parseFloat(exclTaxable) || 0;       // ITC exclusively for taxable
  const T3 = parseFloat(exclExempt) || 0;        // ITC exclusively for exempt
  const taxable = parseFloat(taxableSupply) || 0;
  const exempt = parseFloat(exemptSupply) || 0;
  const totalTurnover = taxable + exempt;
  const C2 = Math.max(0, T - T2 - T3);           // common credit
  const ratio = totalTurnover > 0 ? exempt / totalTurnover : 0;
  const D1 = Math.round(C2 * ratio);             // exempt-attributable reversal
  const D2 = Math.round(C2 * 0.05);              // 5% deemed personal/non-business
  const eligibleCommon = C2 - D1 - D2;

  // Rule 43 (capital goods) — reversal over 60 months
  const Tc = parseFloat(capital) || 0;
  const monthlyCap = Tc / 60;
  const capReversalMonthly = Math.round(monthlyCap * ratio);

  const totalReversal = D1 + D2 + capReversalMonthly;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">ITC Reversal — Rule 42 / 43</h2>
        <p className="text-xs text-[var(--color-muted)]">Proportionate reversal of common ITC for exempt + non-business use. Rule 42 = inputs/services (monthly), Rule 43 = capital goods (over 60 months).</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Total ITC on common inputs/services — T (₹)</label><input type="number" value={common} onChange={e => setCommon(e.target.value)} className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">ITC exclusively for taxable — T2 (₹)</label><input type="number" value={exclTaxable} onChange={e => setExclTaxable(e.target.value)} className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">ITC exclusively for exempt — T3 (₹)</label><input type="number" value={exclExempt} onChange={e => setExclExempt(e.target.value)} className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Common capital-goods ITC — Tc (₹)</label><input type="number" value={capital} onChange={e => setCapital(e.target.value)} className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Taxable turnover (₹)</label><input type="number" value={taxableSupply} onChange={e => setTaxableSupply(e.target.value)} className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Exempt turnover (₹)</label><input type="number" value={exemptSupply} onChange={e => setExemptSupply(e.target.value)} className={inp} /></div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Computation</p>
        {[
          ["Common credit C2 = T − T2 − T3", C2],
          [`Exempt ratio (E/F) = ${(ratio * 100).toFixed(2)}%`, null],
          ["D1 — reversal for exempt supplies (C2 × ratio)", D1],
          ["D2 — deemed 5% non-business use", D2],
          ["Rule 43 — capital goods reversal this month (Tc/60 × ratio)", capReversalMonthly],
          ["Eligible common credit C3 = C2 − D1 − D2", eligibleCommon],
        ].map(([label, val]) => (
          <div key={String(label)} className="flex justify-between text-xs py-1.5 border-b border-[var(--color-border)] last:border-0">
            <span className="text-[var(--color-muted)]">{label}</span>
            {val !== null && <span className="font-semibold tabular-nums">{fc(Number(val))}</span>}
          </div>
        ))}
      </div>

      <div className="bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Divide size={15} className="text-red-400" /><p className="text-sm font-semibold">Total ITC to reverse this month (D1 + D2 + capital)</p></div>
        <p className="text-xl font-bold tabular-nums text-red-400">{fc(totalReversal)}</p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Rule 42/43 CGST Rules. Reverse via GSTR-3B Table 4(B)(1). Capital-goods reversal runs each month for 60 months from the date of use. Recompute and true-up annually before September of the next FY.</p>
    </div>
  );
}

// ── #9 Vendor GST Compliance Score ────────────────────────────────────────────
function VendorComplianceScore() {
  type Vendor = { id: string; name: string; gstin: string; filedOnTime: number; totalReturns: number; itcAtRisk: number; lastFiled: string };
  const [vendors, setVendors] = useFeatureState<Vendor[]>("vendor-gst-score", []);
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [filed, setFiled] = useState("");
  const [total, setTotal] = useState("");
  const [itc, setItc] = useState("");
  const [last, setLast] = useState("");
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const add = () => {
    if (!name) { toast.error("Vendor name required"); return; }
    setVendors(prev => [...prev, { id: crypto.randomUUID(), name, gstin: gstin.toUpperCase(), filedOnTime: parseInt(filed) || 0, totalReturns: parseInt(total) || 0, itcAtRisk: parseFloat(itc) || 0, lastFiled: last }]);
    setName(""); setGstin(""); setFiled(""); setTotal(""); setItc(""); setLast("");
  };

  const scoreOf = (v: Vendor) => {
    const filingRate = v.totalReturns > 0 ? v.filedOnTime / v.totalReturns : 0;
    let score = Math.round(filingRate * 80);
    // recency bonus (filed in last 60 days)
    if (v.lastFiled) {
      const days = (Date.now() - new Date(v.lastFiled).getTime()) / 86400000;
      score += days <= 60 ? 20 : days <= 120 ? 10 : 0;
    }
    return Math.min(100, score);
  };
  const grade = (s: number) => s >= 80 ? { label: "Low risk", cls: "text-green-400" } : s >= 50 ? { label: "Watch", cls: "text-yellow-400" } : { label: "High risk", cls: "text-red-400" };
  const totalAtRisk = vendors.filter(v => scoreOf(v) < 50).reduce((s, v) => s + v.itcAtRisk, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">Vendor GST Compliance Score</h2>
        <p className="text-xs text-[var(--color-muted)]">Ranks suppliers by filing regularity. A non-filing vendor blocks your ITC under Rule 36(4) — score them before you place orders.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Vendor name *" className={inp} />
          <input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="GSTIN" className={`${inp} font-mono`} />
          <input type="number" value={filed} onChange={e => setFiled(e.target.value)} placeholder="Returns filed on time" className={inp} />
          <input type="number" value={total} onChange={e => setTotal(e.target.value)} placeholder="Total returns due" className={inp} />
          <input type="number" value={itc} onChange={e => setItc(e.target.value)} placeholder="Your ITC exposure (₹)" className={inp} />
          <input type="date" value={last} onChange={e => setLast(e.target.value)} className={inp} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add vendor</button>
      </div>

      {totalAtRisk > 0 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3 flex items-center gap-3"><AlertTriangle size={15} className="text-red-400 shrink-0" /><p className="text-sm">{fc(totalAtRisk)} of ITC is exposed to high-risk (low-score) vendors.</p></div>
      )}

      {vendors.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Score", "Risk", "Vendor", "Filing rate", "ITC exposure", "Last filed", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {vendors.slice().sort((a, b) => scoreOf(a) - scoreOf(b)).map(v => { const s = scoreOf(v); const g = grade(s); return (
                <tr key={v.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2"><span className={`font-bold ${g.cls}`}>{s}</span><span className="text-[var(--color-muted)]">/100</span></td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-bold ${g.cls}`}>{g.label}</span></td>
                  <td className="px-3 py-2"><span className="font-medium">{v.name}</span><br /><span className="text-[10px] text-[var(--color-muted)] font-mono">{v.gstin}</span></td>
                  <td className="px-3 py-2">{v.totalReturns > 0 ? `${Math.round(v.filedOnTime / v.totalReturns * 100)}%` : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{fc(v.itcAtRisk)}</td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">{v.lastFiled || "—"}</td>
                  <td className="px-3 py-2"><button onClick={() => setVendors(prev => prev.filter(x => x.id !== v.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Score = 80% filing regularity + 20% recency. High-risk vendors should be put on payment-hold or asked to file before you claim their ITC. Cross-check filing status on the GST portal.</p>
    </div>
  );
}

// ── #10 DRC-03 Voluntary Payment Helper ───────────────────────────────────────
function Drc03Helper() {
  const [tax, setTax] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [cause, setCause] = useState<"short-payment" | "excess-itc" | "voluntary">("voluntary");
  const [copied, setCopied] = useState(false);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const t = parseFloat(tax) || 0;
  const days = dueDate && payDate ? Math.max(0, Math.ceil((new Date(payDate).getTime() - new Date(dueDate).getTime()) / 86400000)) : 0;
  const interest = Math.round(t * 0.18 * days / 365); // 18% p.a. Sec 50
  // Penalty: 15% if voluntary before SCN (Sec 73(5)); else higher. Voluntary self-ascertained = nil/low.
  const penalty = cause === "voluntary" ? 0 : Math.round(t * 0.15);
  const total = t + interest + penalty;

  const challan = `FORM GST DRC-03 — Voluntary Payment\n\nCause of payment: ${cause}\nTax (CGST+SGST/IGST): ${fc(t)}\nInterest @18% p.a. for ${days} day(s) u/s 50: ${fc(interest)}\nPenalty u/s 73(5)/74(5): ${fc(penalty)}\nTotal payable: ${fc(total)}\n\nDeclared and paid voluntarily before issuance of notice/order. Reference DRC-03 ARN to be quoted in subsequent correspondence.`;
  const copy = () => navigator.clipboard.writeText(challan).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">DRC-03 Voluntary Payment Helper</h2>
        <p className="text-xs text-[var(--color-muted)]">Computes interest @18% p.a. (Sec 50) and penalty, and drafts the DRC-03 challan note for a voluntary self-ascertained payment.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Tax shortfall (₹)</label><input type="number" value={tax} onChange={e => setTax(e.target.value)} className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cause</label>
            <select value={cause} onChange={e => setCause(e.target.value as typeof cause)} className={inp}>
              <option value="voluntary">Voluntary (self-ascertained, no SCN)</option>
              <option value="short-payment">Short payment after SCN</option>
              <option value="excess-itc">Excess ITC reversal</option>
            </select>
          </div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Original due date</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Payment date</label><input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={inp} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Tax", value: fc(t), color: "text-[var(--color-text)]" },
          { label: `Interest (${days}d @18%)`, value: fc(interest), color: "text-orange-400" },
          { label: "Penalty", value: fc(penalty), color: penalty > 0 ? "text-red-400" : "text-green-400" },
          { label: "Total payable", value: fc(total), color: "text-[var(--color-primary)]" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">DRC-03 Challan Note</span>
          <button onClick={copy} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90"><Banknote size={11} /> {copied ? "Copied!" : "Copy"}</button>
        </div>
        <pre className="p-4 text-xs font-mono text-[var(--color-muted)] whitespace-pre-wrap leading-relaxed">{challan}</pre>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Interest u/s 50 @18% p.a. on tax (24% on undue/excess ITC). Voluntary payment before SCN u/s 73(5) carries nil penalty; after SCN, 15%. File DRC-03 on the GST portal and quote the ARN in your reply.</p>
    </div>
  );
}

// ── #11 GST on Advances Tracker ───────────────────────────────────────────────
function GstAdvancesTracker() {
  type Adv = { id: string; customer: string; advance: number; rate: number; date: string; adjusted: boolean; invoiceNo: string };
  const [rows, setRows] = useFeatureState<Adv[]>("gst-advances", []);
  const [customer, setCustomer] = useState("");
  const [advance, setAdvance] = useState("");
  const [rate, setRate] = useState(18);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const add = () => {
    if (!customer || !advance) { toast.error("Customer and advance amount required"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), customer, advance: parseFloat(advance) || 0, rate, date, adjusted: false, invoiceNo: "" }]);
    setCustomer(""); setAdvance("");
  };
  // GST on advance is computed on a tax-inclusive basis: tax = advance × r/(100+r)
  const taxOn = (a: Adv) => Math.round(a.advance * a.rate / (100 + a.rate));
  const markAdjusted = (id: string, inv: string) => setRows(prev => prev.map(r => r.id === id ? { ...r, adjusted: true, invoiceNo: inv } : r));

  const totalTaxPaid = rows.reduce((s, r) => s + taxOn(r), 0);
  const unadjusted = rows.filter(r => !r.adjusted).reduce((s, r) => s + taxOn(r), 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">GST on Advances Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">For <strong>services</strong>, GST is payable on advance receipts (Sec 13) via a receipt voucher, then adjusted when the tax invoice is raised. Goods advances are exempt (Notfn 66/2017).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer *" className={inp} />
          <input type="number" value={advance} onChange={e => setAdvance(e.target.value)} placeholder="Advance received ₹ *" className={inp} />
          <select value={rate} onChange={e => setRate(Number(e.target.value))} className={inp}>{[5, 12, 18, 28].map(r => <option key={r} value={r}>{r}% GST</option>)}</select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Record advance</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Advances received", value: fc(rows.reduce((s, r) => s + r.advance, 0)), color: "text-[var(--color-text)]" },
          { label: "GST paid on advances", value: fc(totalTaxPaid), color: "text-orange-400" },
          { label: "Unadjusted (open) GST", value: fc(unadjusted), color: unadjusted > 0 ? "text-yellow-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Date", "Customer", "Advance", "Rate", "GST on advance", "Status", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 text-[var(--color-muted)]">{r.date}</td>
                  <td className="px-3 py-2 font-medium">{r.customer}</td>
                  <td className="px-3 py-2 tabular-nums">{fc(r.advance)}</td>
                  <td className="px-3 py-2">{r.rate}%</td>
                  <td className="px-3 py-2 tabular-nums text-orange-400">{fc(taxOn(r))}</td>
                  <td className="px-3 py-2">{r.adjusted ? <span className="text-[10px] text-green-400">Adjusted · {r.invoiceNo || "inv"}</span> : <button onClick={() => { const inv = prompt("Invoice no. against which advance is adjusted?") || ""; markAdjusted(r.id, inv); }} className="text-[10px] text-[var(--color-primary)] hover:underline">Mark adjusted</button>}</td>
                  <td className="px-3 py-2"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Sec 12/13 + Notfn 66/2017. Report advances in GSTR-1 Table 11A, and the adjustment in Table 11B. Issue a Receipt Voucher on advance and a Refund Voucher if the order is cancelled.</p>
    </div>
  );
}

// ── #12 Export/SEZ Zero-Rated Invoice Kit ─────────────────────────────────────
function ZeroRatedInvoiceKit() {
  type Exp = { id: string; invoiceNo: string; buyer: string; type: "export-goods" | "export-services" | "sez"; method: "lut" | "with-igst"; value: number; igst: number; firc: string; fircReceived: boolean };
  const [rows, setRows] = useFeatureState<Exp[]>("zero-rated-invoices", []);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [buyer, setBuyer] = useState("");
  const [type, setType] = useState<Exp["type"]>("export-services");
  const [method, setMethod] = useState<Exp["method"]>("lut");
  const [value, setValue] = useState("");
  const [rate, setRate] = useState(18);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const add = () => {
    if (!invoiceNo || !value) { toast.error("Invoice no. and value required"); return; }
    const v = parseFloat(value) || 0;
    const igst = method === "with-igst" ? Math.round(v * rate / 100) : 0;
    setRows(prev => [...prev, { id: crypto.randomUUID(), invoiceNo, buyer, type, method, value: v, igst, firc: "", fircReceived: false }]);
    setInvoiceNo(""); setBuyer(""); setValue("");
  };
  const toggleFirc = (id: string) => setRows(prev => prev.map(r => r.id === id ? { ...r, fircReceived: !r.fircReceived } : r));

  const totalExport = rows.reduce((s, r) => s + r.value, 0);
  const igstRefundable = rows.filter(r => r.method === "with-igst").reduce((s, r) => s + r.igst, 0);
  const firPending = rows.filter(r => !r.fircReceived).length;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">Export / SEZ Zero-Rated Invoice Kit</h2>
        <p className="text-xs text-[var(--color-muted)]">Track zero-rated supplies under LUT (without IGST) or with-IGST-and-refund, plus FIRC/BRC linkage for export proceeds (Sec 16 IGST Act).</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Export invoice no. *" className={inp} />
          <input value={buyer} onChange={e => setBuyer(e.target.value)} placeholder="Foreign buyer / SEZ unit" className={inp} />
          <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="Invoice value ₹ *" className={inp} />
          <select value={type} onChange={e => setType(e.target.value as Exp["type"])} className={inp}>
            <option value="export-goods">Export of goods</option>
            <option value="export-services">Export of services</option>
            <option value="sez">Supply to SEZ</option>
          </select>
          <select value={method} onChange={e => setMethod(e.target.value as Exp["method"])} className={inp}>
            <option value="lut">Under LUT (no IGST)</option>
            <option value="with-igst">With IGST (claim refund)</option>
          </select>
          {method === "with-igst" && <select value={rate} onChange={e => setRate(Number(e.target.value))} className={inp}>{[5, 12, 18, 28].map(r => <option key={r} value={r}>IGST {r}%</option>)}</select>}
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add export invoice</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total zero-rated turnover", value: fc(totalExport), color: "text-[var(--color-primary)]" },
          { label: "IGST refundable", value: fc(igstRefundable), color: "text-green-400" },
          { label: "FIRC/BRC pending", value: String(firPending), color: firPending > 0 ? "text-orange-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Invoice", "Buyer", "Type", "Method", "Value", "IGST", "FIRC", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 font-mono">{r.invoiceNo}</td>
                    <td className="px-3 py-2">{r.buyer || "—"}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{r.type.replace("-", " ")}</td>
                    <td className="px-3 py-2">{r.method === "lut" ? "LUT" : "With IGST"}</td>
                    <td className="px-3 py-2 tabular-nums">{fc(r.value)}</td>
                    <td className="px-3 py-2 tabular-nums text-green-400">{r.igst ? fc(r.igst) : "—"}</td>
                    <td className="px-3 py-2"><button onClick={() => toggleFirc(r.id)} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.fircReceived ? "bg-green-950/30 text-green-400" : "bg-yellow-950/30 text-yellow-400"}`}>{r.fircReceived ? "Received" : "Pending"}</button></td>
                    <td className="px-3 py-2"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Under LUT: export without paying IGST, claim refund of accumulated ITC (RFD-01). With IGST: pay tax, refund auto-flows from shipping bill (goods) or RFD-01 (services). FIRC/BRC from your bank is mandatory proof of realisation for service exports.</p>
    </div>
  );
}

// ── #13 GST Health Score & Filing Streak ──────────────────────────────────────
function GstHealthScore() {
  const { store } = useApp();
  type Filing = { id: string; period: string; type: "GSTR-1" | "GSTR-3B"; onTime: boolean };
  const [filings, setFilings] = useFeatureState<Filing[]>("gst-filing-log", []);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [type, setType] = useState<Filing["type"]>("GSTR-3B");
  const [onTime, setOnTime] = useState(true);

  const add = () => {
    setFilings(prev => [{ id: crypto.randomUUID(), period, type, onTime }, ...prev.filter(f => !(f.period === period && f.type === type))]);
  };

  const score = useMemo(() => {
    const total = filings.length;
    const onTimeCount = filings.filter(f => f.onTime).length;
    const filingScore = total > 0 ? (onTimeCount / total) * 50 : 30; // 50 pts filing punctuality
    // GSTIN configured (15 pts)
    const gstinScore = store.firm.gstNumber && store.firm.gstNumber.length === 15 ? 15 : 0;
    // Registered & rate set (10 pts)
    const regScore = store.firm.gstRegistered ? 10 : 0;
    // Recent activity (25 pts) — has a filing in the last 60 days
    const recent = filings.some(f => { const d = new Date(f.period + "-01"); return (Date.now() - d.getTime()) / 86400000 <= 75; });
    const recencyScore = recent ? 25 : (total > 0 ? 5 : 0);
    return Math.round(filingScore + gstinScore + regScore + recencyScore);
  }, [filings, store.firm]);

  // Filing streak: consecutive on-time 3B from most recent period backwards.
  const streak = useMemo(() => {
    const log = filings.filter(f => f.type === "GSTR-3B").sort((a, b) => b.period.localeCompare(a.period));
    let s = 0;
    for (const f of log) { if (f.onTime) s++; else break; }
    return s;
  }, [filings]);

  const band = score >= 80 ? { label: "Excellent", cls: "text-green-400", bar: "bg-green-400" } : score >= 60 ? { label: "Good", cls: "text-yellow-400", bar: "bg-yellow-400" } : score >= 40 ? { label: "Needs work", cls: "text-orange-400", bar: "bg-orange-400" } : { label: "At risk", cls: "text-red-400", bar: "bg-red-400" };

  const nudges: string[] = [];
  if (!store.firm.gstRegistered) nudges.push("Mark your firm GST-registered and set the rate in Settings.");
  if (!store.firm.gstNumber || store.firm.gstNumber.length !== 15) nudges.push("Add your 15-character GSTIN in Settings.");
  if (filings.some(f => !f.onTime)) nudges.push("Late filings detected — late fee ₹50/day (₹20 nil) + 18% interest applies. File before the 11th (GSTR-1) / 20th (3B).");
  if (filings.length === 0) nudges.push("Log your GSTR-1 & 3B filings to start building your streak.");
  if (streak >= 6) nudges.push(`On-time streak of ${streak} — eligible for a smoother refund/credit experience. Keep it up!`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 md:col-span-2">
          <div className="flex items-center gap-2 mb-2"><Activity size={15} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">GST Health Score</h2></div>
          <div className="flex items-end gap-3 mb-2">
            <p className={`text-4xl font-bold tabular-nums ${band.cls}`}>{score}</p>
            <p className="text-sm text-[var(--color-muted)] mb-1">/100 · <span className={`font-semibold ${band.cls}`}>{band.label}</span></p>
          </div>
          <div className="h-2 w-full bg-[var(--color-bg)] rounded-full overflow-hidden"><div className={`h-full ${band.bar}`} style={{ width: `${score}%` }} /></div>
          <p className="text-[11px] text-[var(--color-muted)] mt-2">Filing punctuality (50) · GSTIN configured (15) · Registration (10) · Recent activity (25).</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 flex flex-col items-center justify-center">
          <p className="text-xs text-[var(--color-muted)] mb-1">On-time GSTR-3B streak</p>
          <p className="text-4xl font-bold text-[var(--color-primary)]">{streak}</p>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">consecutive months</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Log a filing</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
          <select value={type} onChange={e => setType(e.target.value as Filing["type"])} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none"><option>GSTR-1</option><option>GSTR-3B</option></select>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={onTime} onChange={e => setOnTime(e.target.checked)} className="accent-[var(--color-primary)]" /> Filed on time</label>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Log filing</button>
        </div>
      </div>

      {nudges.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs font-semibold mb-2 text-[var(--color-muted)] uppercase tracking-wide">Nudges</p>
          <div className="space-y-2">
            {nudges.map(n => (
              <div key={n} className="flex items-start gap-2 text-xs"><CheckCircle2 size={12} className="text-[var(--color-primary)] shrink-0 mt-0.5" /><p>{n}</p></div>
            ))}
          </div>
        </div>
      )}

      {filings.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Period", "Return", "Status", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {filings.sort((a, b) => b.period.localeCompare(a.period)).map(f => (
                <tr key={f.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{f.period}</td>
                  <td className="px-3 py-2">{f.type}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${f.onTime ? "bg-green-950/30 text-green-400" : "bg-red-950/30 text-red-400"}`}>{f.onTime ? "On time" : "Late"}</span></td>
                  <td className="px-3 py-2"><button onClick={() => setFilings(prev => prev.filter(x => x.id !== f.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A single compliance score with actionable nudges. Late GSTR-3B: ₹50/day (₹20 if nil), capped, plus 18% interest on tax. A clean streak supports lender trust and smoother refunds.</p>
    </div>
  );
}

const GST_INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const GST_CARD  = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5";

// ── INTEREST & LATE-FEE CALCULATOR (Sec 50 + Sec 47) ──
function GstInterestLateFee() {
  const [taxDue, setTaxDue]   = useState("");
  const [dueDate, setDueDate] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [retType, setRetType] = useState<"GSTR-3B" | "GSTR-1">("GSTR-3B");
  const [isNil, setIsNil]     = useState(false);

  const result = useMemo(() => {
    const tax = parseFloat(taxDue) || 0;
    if (!dueDate || !payDate) return null;
    const d1 = new Date(dueDate).getTime();
    const d2 = new Date(payDate).getTime();
    const days = Math.max(0, Math.round((d2 - d1) / 86400000));
    // Sec 50: 18% p.a. simple interest on net cash tax paid late.
    const interest = Math.round((tax * 0.18 * days) / 365);
    // Sec 47 late fee: GSTR-3B/1 = ₹50/day (₹25 CGST + ₹25 SGST), ₹20/day for nil. Cap ₹5,000 per Act each side → ₹10,000 total (simplified).
    const perDay = isNil ? 20 : 50;
    const lateFee = Math.min(perDay * days, isNil ? 1000 : 10000);
    return { days, interest, lateFee, total: interest + lateFee, perDay };
  }, [taxDue, dueDate, payDate, isNil]);

  return (
    <div className="space-y-4 max-w-xl">
      <div className={GST_CARD}>
        <div className="flex items-center gap-2 mb-1"><Timer size={16} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">Interest &amp; Late-Fee Calculator</h2></div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Estimate Sec 50 interest (18% p.a. on net cash tax) and Sec 47 late fee (₹50/day, ₹20/day for nil) on a delayed return.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Net tax payable in cash (₹)</label>
            <input type="number" min={0} value={taxDue} onChange={e => setTaxDue(e.target.value)} placeholder="e.g. 48000" className={GST_INPUT} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Return</label>
            <select value={retType} onChange={e => setRetType(e.target.value as typeof retType)} className={GST_INPUT}>
              <option>GSTR-3B</option><option>GSTR-1</option>
            </select>
          </div>
          <label className="flex items-end gap-2 text-xs cursor-pointer pb-2">
            <input type="checkbox" checked={isNil} onChange={e => setIsNil(e.target.checked)} className="accent-[var(--color-primary)]" />
            <span>Nil return (₹20/day)</span>
          </label>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Original due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={GST_INPUT} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Actual / planned filing date</label>
            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={GST_INPUT} />
          </div>
        </div>
      </div>

      {result && (
        <div className="bg-[var(--color-surface)] border border-orange-700/40 rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">{result.days} day{result.days !== 1 ? "s" : ""} late · {retType}</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Interest (Sec 50)", value: result.interest, color: "text-orange-400" },
              { label: `Late fee @ ₹${result.perDay}/day`, value: result.lateFee, color: "text-red-400" },
              { label: "Total payable", value: result.total, color: "text-[var(--color-primary)]" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-center">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{formatCurrency(k.value)}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">Interest = tax × 18% × days ÷ 365 (simple). Late fee split equally between CGST &amp; SGST. Caps simplified — confirm current notification before paying.</p>
        </div>
      )}
    </div>
  );
}

// ── TURNOVER vs REGISTRATION-THRESHOLD ADVISOR ──
function RegistrationThresholdAdvisor() {
  const { store } = useApp();
  const [supplyType, setSupplyType] = useState<"goods" | "services">("goods");
  const [special, setSpecial]       = useState(false); // special-category state (₹10L/₹20L)
  const [manual, setManual]         = useState("");

  // Trailing-12-month turnover from positive transactions (inflows = outward supply proxy).
  const autoTurnover = useMemo(() => {
    const cutoff = Date.now() - 365 * 86400000;
    return store.transactions.filter(t => t.amount > 0 && new Date(t.date).getTime() >= cutoff).reduce((s, t) => s + t.amount, 0);
  }, [store.transactions]);

  const turnover = manual.trim() ? (parseFloat(manual) || 0) : autoTurnover;
  // Thresholds: goods ₹40L (₹20L special); services ₹20L (₹10L special). E-invoice ₹5cr, audit/9C ₹5cr.
  const regThreshold = supplyType === "goods" ? (special ? 2000000 : 4000000) : (special ? 1000000 : 2000000);
  const eInvoiceThreshold = 50000000;
  const compositionThreshold = supplyType === "goods" ? 15000000 : 5000000;
  const pct = Math.min(100, Math.round((turnover / regThreshold) * 100));
  const mustRegister = turnover >= regThreshold;

  const milestones = [
    { label: "GST registration", limit: regThreshold, crossed: turnover >= regThreshold, note: "Compulsory registration required." },
    { label: "Composition eligibility cap", limit: compositionThreshold, crossed: turnover >= compositionThreshold, note: "Above this you cannot opt for / must exit composition." },
    { label: "e-Invoicing (IRN) mandate", limit: eInvoiceThreshold, crossed: turnover >= eInvoiceThreshold, note: "B2B e-invoicing becomes mandatory." },
    { label: "GSTR-9C audit reconciliation", limit: 50000000, crossed: turnover >= 50000000, note: "Self-certified reconciliation (9C) required." },
  ];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={GST_CARD}>
        <div className="flex items-center gap-2 mb-1"><Gauge size={16} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">Registration &amp; Threshold Advisor</h2></div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Compares your aggregate turnover against GST registration, composition, e-invoice and audit thresholds. Auto-reads last-12-month inflows unless you override.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Supply type</label>
            <select value={supplyType} onChange={e => setSupplyType(e.target.value as typeof supplyType)} className={GST_INPUT}>
              <option value="goods">Goods</option><option value="services">Services / mixed</option>
            </select>
          </div>
          <label className="flex items-end gap-2 text-xs cursor-pointer pb-2">
            <input type="checkbox" checked={special} onChange={e => setSpecial(e.target.checked)} className="accent-[var(--color-primary)]" />
            <span>Special-category state (NE / hill states)</span>
          </label>
          <div className="col-span-2">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Aggregate turnover (₹) — leave blank to use last-12-month inflows ({formatAmount(autoTurnover)})</label>
            <input type="number" min={0} value={manual} onChange={e => setManual(e.target.value)} placeholder={String(Math.round(autoTurnover))} className={GST_INPUT} />
          </div>
        </div>
      </div>

      <div className={`rounded-lg border p-5 ${mustRegister ? "bg-red-950/20 border-red-800/40" : "bg-green-950/20 border-green-800/40"}`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">{mustRegister ? "Registration required" : "Below registration threshold"}</p>
          <p className="text-sm tabular-nums text-[var(--color-muted)]">{formatCurrency(turnover)} / {formatCurrency(regThreshold)}</p>
        </div>
        <div className="h-2 w-full bg-[var(--color-bg)] rounded-full overflow-hidden"><div className={`h-full ${mustRegister ? "bg-red-400" : pct > 80 ? "bg-orange-400" : "bg-green-400"}`} style={{ width: `${pct}%` }} /></div>
        <p className="text-[11px] text-[var(--color-muted)] mt-2">{mustRegister ? "You have crossed the limit — register within 30 days of crossing." : pct > 80 ? "Approaching the threshold — plan registration ahead of crossing." : "Voluntary registration still allowed to claim ITC and sell B2B."}</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Milestone", "Threshold", "Status", "Note"].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {milestones.map(m => (
              <tr key={m.label} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2 font-medium">{m.label}</td>
                <td className="px-3 py-2 tabular-nums">{formatCurrency(m.limit)}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${m.crossed ? "bg-red-950/30 text-red-400" : "bg-green-950/30 text-green-400"}`}>{m.crossed ? "Crossed" : "Within"}</span></td>
                <td className="px-3 py-2 text-[var(--color-muted)]">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── GSTR-1 vs GSTR-3B RECONCILIATION ──
function Gstr1Vs3bReconciler() {
  const { store } = useApp();
  const firm = store.firm;
  const rate = firm.gstRate ?? 18;
  const [g3bTaxable, setG3bTaxable] = useState("");
  const [g3bTax, setG3bTax]         = useState("");

  // GSTR-1 figures derived from invoice register (taxable + tax at firm rate).
  const g1 = useMemo(() => {
    const taxable = store.invoices.reduce((s, inv) => s + (inv.amount || 0), 0);
    const tax = Math.round(taxable * rate) / 100;
    return { taxable, tax };
  }, [store.invoices, rate]);

  const rec = useMemo(() => {
    const t3b = parseFloat(g3bTaxable) || 0;
    const tax3b = parseFloat(g3bTax) || 0;
    return {
      taxableDelta: g1.taxable - t3b,
      taxDelta: g1.tax - tax3b,
      taxableMatch: Math.abs(g1.taxable - t3b) < 1,
      taxMatch: Math.abs(g1.tax - tax3b) < 1,
    };
  }, [g1, g3bTaxable, g3bTax]);

  const ok = rec.taxableMatch && rec.taxMatch;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={GST_CARD}>
        <div className="flex items-center gap-2 mb-1"><Scale size={16} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">GSTR-1 vs GSTR-3B Reconciliation</h2></div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Liability declared in GSTR-3B (Table 3.1) must match outward supplies reported in GSTR-1. Mismatches are the top trigger for ASMT-10 scrutiny. GSTR-1 is computed from your invoice register; enter your filed 3B figures.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">GSTR-3B taxable value (₹)</label>
            <input type="number" min={0} value={g3bTaxable} onChange={e => setG3bTaxable(e.target.value)} placeholder={String(Math.round(g1.taxable))} className={GST_INPUT} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">GSTR-3B output tax (₹)</label>
            <input type="number" min={0} value={g3bTax} onChange={e => setG3bTax(e.target.value)} placeholder={String(Math.round(g1.tax))} className={GST_INPUT} />
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Particulars", "GSTR-1 (books)", "GSTR-3B (filed)", "Difference"].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {[
              { label: "Taxable outward supplies", a: g1.taxable, b: parseFloat(g3bTaxable) || 0, delta: rec.taxableDelta, match: rec.taxableMatch },
              { label: `Output tax @ ${rate}%`, a: g1.tax, b: parseFloat(g3bTax) || 0, delta: rec.taxDelta, match: rec.taxMatch },
            ].map(r => (
              <tr key={r.label}>
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 tabular-nums">{formatCurrency(r.a)}</td>
                <td className="px-4 py-3 tabular-nums">{formatCurrency(r.b)}</td>
                <td className={`px-4 py-3 tabular-nums font-semibold ${r.match ? "text-green-400" : "text-red-400"}`}>{r.delta >= 0 ? formatCurrency(r.delta) : `(${formatCurrency(Math.abs(r.delta))})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg border px-4 py-3 text-sm flex items-center gap-3 ${ok ? "bg-green-950/20 border-green-800/40" : "bg-orange-950/20 border-orange-800/40"}`}>
        {ok ? <CheckCircle2 size={16} className="text-green-400 shrink-0" /> : <AlertTriangle size={16} className="text-orange-400 shrink-0" />}
        <p>{ok ? "GSTR-1 and GSTR-3B reconcile — no liability mismatch." : "Mismatch detected. Reconcile before filing: under-reported 3B liability attracts interest; over-reported needs amendment in the next period."}</p>
      </div>
    </div>
  );
}

// ── 180-DAY ITC REVERSAL TRACKER (Rule 37 / Sec 16(2)) ──
function Rule180ReversalTracker() {
  type Bill = { id: string; supplier: string; invoiceNo: string; invoiceDate: string; amount: number; rate: number; paid: boolean };
  const [bills, setBills] = useFeatureState<Bill[]>("gst-rule180-bills", []);
  const [supplier, setSupplier] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(18);

  const add = () => {
    if (!supplier || !amount) { toast.error("Supplier and amount required"); return; }
    setBills(prev => [...prev, { id: crypto.randomUUID(), supplier, invoiceNo, invoiceDate, amount: parseFloat(amount) || 0, rate, paid: false }]);
    setSupplier(""); setInvoiceNo(""); setAmount("");
  };
  const togglePaid = (id: string) => setBills(prev => prev.map(b => b.id === id ? { ...b, paid: !b.paid } : b));
  const remove = (id: string) => setBills(prev => prev.filter(b => b.id !== id));

  const rows = bills.map(b => {
    const itc = Math.round(b.amount * b.rate / 100);
    const daysSince = Math.floor((Date.now() - new Date(b.invoiceDate).getTime()) / 86400000);
    const deadline = format(addDays(new Date(b.invoiceDate), 180), "d MMM yyyy");
    const overdue = !b.paid && daysSince > 180;
    const due = !b.paid && daysSince > 150 && daysSince <= 180;
    return { ...b, itc, daysSince, deadline, overdue, due };
  });
  const atRisk = rows.filter(r => r.overdue).reduce((s, r) => s + r.itc, 0);
  const dueSoon = rows.filter(r => r.due).reduce((s, r) => s + r.itc, 0);

  return (
    <div className="space-y-4">
      <div className="bg-orange-950/20 border border-orange-800/30 rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-orange-300">180-Day Payment Rule (Rule 37)</strong> — If you don't pay a supplier within 180 days of the invoice date, the ITC claimed must be reversed (with interest) and can be re-claimed only after payment.
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add purchase invoice</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier name *" className={GST_INPUT} />
          <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Invoice no" className={GST_INPUT} />
          <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={GST_INPUT} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Taxable amount (₹) *" className={GST_INPUT} />
          <select value={rate} onChange={e => setRate(Number(e.target.value))} className={GST_INPUT}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}% GST</option>)}</select>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--color-surface)] border border-red-800/30 rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">ITC to reverse (overdue &gt;180d)</p><p className="text-lg font-bold tabular-nums text-red-400">{formatCurrency(atRisk)}</p></div>
        <div className="bg-[var(--color-surface)] border border-orange-800/30 rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Due soon (151–180 days)</p><p className="text-lg font-bold tabular-nums text-orange-400">{formatCurrency(dueSoon)}</p></div>
      </div>

      {rows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Supplier", "Invoice", "Date", "ITC", "Days", "Reverse by", "Paid", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`border-t border-[var(--color-border)] ${r.overdue ? "bg-red-950/10" : r.due ? "bg-orange-950/10" : ""}`}>
                  <td className="px-3 py-2 font-medium">{r.supplier}</td>
                  <td className="px-3 py-2 font-mono text-[var(--color-muted)]">{r.invoiceNo || "—"}</td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">{r.invoiceDate}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(r.itc)}</td>
                  <td className={`px-3 py-2 tabular-nums ${r.overdue ? "text-red-400 font-semibold" : ""}`}>{r.paid ? "—" : r.daysSince}</td>
                  <td className="px-3 py-2">{r.paid ? "Paid" : r.deadline}</td>
                  <td className="px-3 py-2"><button onClick={() => togglePaid(r.id)} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.paid ? "bg-green-950/30 text-green-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>{r.paid ? "Paid" : "Mark paid"}</button></td>
                  <td className="px-3 py-2"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── E-INVOICE 30-DAY REPORTING DEADLINE TRACKER ──
function EInvoice30DayTracker() {
  type Inv = { id: string; invoiceNo: string; invoiceDate: string; value: number; reported: boolean };
  const [invs, setInvs] = useFeatureState<Inv[]>("gst-einv30-invoices", []);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [value, setValue] = useState("");

  const add = () => {
    if (!invoiceNo || !invoiceDate) { toast.error("Invoice no and date required"); return; }
    setInvs(prev => [...prev, { id: crypto.randomUUID(), invoiceNo, invoiceDate, value: parseFloat(value) || 0, reported: false }]);
    setInvoiceNo(""); setValue("");
  };
  const toggle = (id: string) => setInvs(prev => prev.map(i => i.id === id ? { ...i, reported: !i.reported } : i));
  const remove = (id: string) => setInvs(prev => prev.filter(i => i.id !== id));

  const rows = invs.map(i => {
    const daysSince = Math.floor((Date.now() - new Date(i.invoiceDate).getTime()) / 86400000);
    const daysLeft = 30 - daysSince;
    const deadline = format(addDays(new Date(i.invoiceDate), 30), "d MMM yyyy");
    const locked = !i.reported && daysLeft < 0;
    const urgent = !i.reported && daysLeft >= 0 && daysLeft <= 5;
    return { ...i, daysLeft, deadline, locked, urgent };
  }).sort((a, b) => a.daysLeft - b.daysLeft);

  const lockedCount = rows.filter(r => r.locked).length;
  const urgentCount = rows.filter(r => r.urgent).length;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">30-Day IRP Reporting Rule</strong> — Invoices must be reported to the Invoice Registration Portal within 30 days of the invoice date. After that the IRP rejects the IRN, blocking e-invoicing and the buyer's ITC. Track every invoice here.
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add invoice to track</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Invoice no *" className={GST_INPUT} />
          <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={GST_INPUT} />
          <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="Invoice value (₹)" className={GST_INPUT} />
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--color-surface)] border border-red-800/30 rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Locked out (deadline passed)</p><p className="text-lg font-bold tabular-nums text-red-400">{lockedCount}</p></div>
        <div className="bg-[var(--color-surface)] border border-orange-800/30 rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Report now (≤5 days left)</p><p className="text-lg font-bold tabular-nums text-orange-400">{urgentCount}</p></div>
      </div>

      {rows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Invoice", "Date", "Value", "Report by", "Days left", "IRN", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`border-t border-[var(--color-border)] ${r.locked ? "bg-red-950/10" : r.urgent ? "bg-orange-950/10" : ""}`}>
                  <td className="px-3 py-2 font-mono">{r.invoiceNo}</td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">{r.invoiceDate}</td>
                  <td className="px-3 py-2 tabular-nums">{r.value ? formatCurrency(r.value) : "—"}</td>
                  <td className="px-3 py-2">{r.reported ? "—" : r.deadline}</td>
                  <td className={`px-3 py-2 tabular-nums font-semibold ${r.locked ? "text-red-400" : r.urgent ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{r.reported ? "—" : r.locked ? `${Math.abs(r.daysLeft)}d over` : `${r.daysLeft}d`}</td>
                  <td className="px-3 py-2"><button onClick={() => toggle(r.id)} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.reported ? "bg-green-950/30 text-green-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>{r.reported ? "Reported" : "Mark reported"}</button></td>
                  <td className="px-3 py-2"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── INVERTED-DUTY REFUND CALCULATOR (Rule 89(5)) ──
function InvertedDutyRefundCalculator() {
  const [inwardItc, setInwardItc]       = useState(""); // total ITC on inputs
  const [inputItc, setInputItc]         = useState(""); // ITC on inputs only (goods, not services/cap goods)
  const [outwardTurnover, setOutwardTurnover] = useState(""); // turnover of inverted-rated supply
  const [totalTurnover, setTotalTurnover]     = useState("");
  const [outputTaxPaid, setOutputTaxPaid]     = useState("");

  const result = useMemo(() => {
    const netItc = parseFloat(inputItc) || 0;            // Net ITC (inputs only) per Rule 89(5)
    const invTurnover = parseFloat(outwardTurnover) || 0;
    const adjTotal = parseFloat(totalTurnover) || 0;
    const outTax = parseFloat(outputTaxPaid) || 0;
    if (adjTotal <= 0) return null;
    // Rule 89(5): Max Refund = (Turnover of inverted supply × Net ITC ÷ Adjusted Total Turnover) − tax payable on such inverted supply
    const maxRefund = Math.max(0, Math.round((invTurnover * netItc) / adjTotal - outTax));
    const totalItc = parseFloat(inwardItc) || 0;
    const ineligible = Math.max(0, totalItc - netItc); // services + capital goods ITC not refundable here
    return { maxRefund, netItc, ineligible };
  }, [inwardItc, inputItc, outwardTurnover, totalTurnover, outputTaxPaid]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={GST_CARD}>
        <div className="flex items-center gap-2 mb-1"><Coins size={16} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">Inverted-Duty Refund Calculator</h2></div>
        <p className="text-xs text-[var(--color-muted)] mb-4">When inputs are taxed higher than outputs, accumulated ITC can be refunded under Rule 89(5). Only ITC on input <em>goods</em> counts as Net ITC — services &amp; capital goods are excluded.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Total ITC availed (₹)</label><input type="number" min={0} value={inwardItc} onChange={e => setInwardItc(e.target.value)} placeholder="all inputs + services + cap goods" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Net ITC — input goods only (₹)</label><input type="number" min={0} value={inputItc} onChange={e => setInputItc(e.target.value)} placeholder="goods inputs only" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Turnover of inverted-rated supply (₹)</label><input type="number" min={0} value={outwardTurnover} onChange={e => setOutwardTurnover(e.target.value)} className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Adjusted total turnover (₹)</label><input type="number" min={0} value={totalTurnover} onChange={e => setTotalTurnover(e.target.value)} className={GST_INPUT} /></div>
          <div className="col-span-2"><label className="block text-xs text-[var(--color-muted)] mb-1">Output tax payable on inverted supply (₹)</label><input type="number" min={0} value={outputTaxPaid} onChange={e => setOutputTaxPaid(e.target.value)} className={GST_INPUT} /></div>
        </div>
      </div>

      {result && (
        <>
          <div className="bg-[var(--color-surface)] border border-green-800/40 rounded-lg p-5">
            <p className="text-sm font-semibold mb-2">Maximum refund (Rule 89(5) formula)</p>
            <p className="text-3xl font-bold tabular-nums text-green-400">{formatCurrency(result.maxRefund)}</p>
            <p className="text-[11px] text-[var(--color-muted)] mt-2">= (Inverted turnover × Net ITC ÷ Adjusted total turnover) − tax payable on inverted supply.</p>
          </div>
          {result.ineligible > 0 && (
            <div className="bg-orange-950/20 border border-orange-800/40 rounded-lg px-4 py-3 text-sm flex items-center gap-3">
              <AlertTriangle size={15} className="text-orange-400 shrink-0" />
              <p>{formatCurrency(result.ineligible)} of ITC (on services / capital goods) is excluded from Net ITC and not refundable under this route.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── CREDIT / DEBIT NOTE GST REGISTER ──
function CreditDebitNoteRegister() {
  type Note = { id: string; noteNo: string; kind: "credit" | "debit"; party: string; origInvoice: string; date: string; taxable: number; rate: number };
  const [notes, setNotes] = useFeatureState<Note[]>("gst-cdn-register", []);
  const [noteNo, setNoteNo]   = useState("");
  const [kind, setKind]       = useState<"credit" | "debit">("credit");
  const [party, setParty]     = useState("");
  const [origInvoice, setOrigInvoice] = useState("");
  const [date, setDate]       = useState(() => new Date().toISOString().split("T")[0]);
  const [taxable, setTaxable] = useState("");
  const [rate, setRate]       = useState(18);

  const add = () => {
    if (!noteNo || !taxable) { toast.error("Note number and taxable value required"); return; }
    setNotes(prev => [...prev, { id: crypto.randomUUID(), noteNo, kind, party, origInvoice, date, taxable: parseFloat(taxable) || 0, rate }]);
    setNoteNo(""); setParty(""); setOrigInvoice(""); setTaxable("");
  };
  const remove = (id: string) => setNotes(prev => prev.filter(n => n.id !== id));

  const taxOf = (n: Note) => Math.round(n.taxable * n.rate / 100);
  const creditTax = notes.filter(n => n.kind === "credit").reduce((s, n) => s + taxOf(n), 0);
  const debitTax  = notes.filter(n => n.kind === "debit").reduce((s, n) => s + taxOf(n), 0);
  const netAdj = debitTax - creditTax; // +ve increases output liability, -ve reduces it

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">Credit / Debit Notes (Sec 34)</strong> — Credit notes reduce your output GST liability (returns, discounts, overcharge); debit notes increase it (undercharge). Both must be reported in GSTR-1 and linked to the original invoice.
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add note</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={noteNo} onChange={e => setNoteNo(e.target.value)} placeholder="Note no *" className={GST_INPUT} />
          <select value={kind} onChange={e => setKind(e.target.value as typeof kind)} className={GST_INPUT}><option value="credit">Credit note</option><option value="debit">Debit note</option></select>
          <input value={party} onChange={e => setParty(e.target.value)} placeholder="Party name" className={GST_INPUT} />
          <input value={origInvoice} onChange={e => setOrigInvoice(e.target.value)} placeholder="Original invoice no" className={GST_INPUT} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={GST_INPUT} />
          <input type="number" value={taxable} onChange={e => setTaxable(e.target.value)} placeholder="Taxable value (₹) *" className={GST_INPUT} />
          <select value={rate} onChange={e => setRate(Number(e.target.value))} className={GST_INPUT}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}% GST</option>)}</select>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add note</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Credit-note GST (reduces liability)</p><p className="text-lg font-bold tabular-nums text-green-400">{formatCurrency(creditTax)}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Debit-note GST (adds liability)</p><p className="text-lg font-bold tabular-nums text-red-400">{formatCurrency(debitTax)}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Net liability adjustment</p><p className={`text-lg font-bold tabular-nums ${netAdj >= 0 ? "text-red-400" : "text-green-400"}`}>{netAdj >= 0 ? formatCurrency(netAdj) : `(${formatCurrency(Math.abs(netAdj))})`}</p></div>
      </div>

      {notes.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Note", "Type", "Party", "Orig. invoice", "Date", "Taxable", "GST", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {notes.slice().reverse().map(n => (
                <tr key={n.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 font-mono">{n.noteNo}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${n.kind === "credit" ? "bg-green-950/30 text-green-400" : "bg-red-950/30 text-red-400"}`}>{n.kind === "credit" ? "Credit" : "Debit"}</span></td>
                  <td className="px-3 py-2">{n.party || "—"}</td>
                  <td className="px-3 py-2 font-mono text-[var(--color-muted)]">{n.origInvoice || "—"}</td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">{n.date}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(n.taxable)}</td>
                  <td className={`px-3 py-2 tabular-nums font-semibold ${n.kind === "credit" ? "text-green-400" : "text-red-400"}`}>{formatCurrency(taxOf(n))}</td>
                  <td className="px-3 py-2"><button onClick={() => remove(n.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── COMPENSATION CESS CALCULATOR (sin / luxury goods) ──
function CompensationCessCalculator() {
  const ITEMS: { label: string; gst: number; cess: string; cessPct: number }[] = [
    { label: "Aerated / sugary drinks", gst: 28, cess: "12%", cessPct: 12 },
    { label: "Small petrol car (≤1200cc, ≤4m)", gst: 28, cess: "1%", cessPct: 1 },
    { label: "Small diesel car (≤1500cc, ≤4m)", gst: 28, cess: "3%", cessPct: 3 },
    { label: "Mid-size car (>1500cc)", gst: 28, cess: "17%", cessPct: 17 },
    { label: "SUV (>1500cc, >4m, >170mm clearance)", gst: 28, cess: "22%", cessPct: 22 },
    { label: "Cigarettes / tobacco products", gst: 28, cess: "36%", cessPct: 36 },
    { label: "Pan masala", gst: 28, cess: "60%", cessPct: 60 },
    { label: "Coal / lignite (per tonne basis)", gst: 5, cess: "₹400/tonne", cessPct: 0 },
  ];
  const [idx, setIdx]       = useState(0);
  const [value, setValue]   = useState("");

  const item = ITEMS[idx];
  const result = useMemo(() => {
    const base = parseFloat(value) || 0;
    const gst = Math.round(base * item.gst / 100);
    const cess = Math.round(base * item.cessPct / 100);
    return { base, gst, cess, total: base + gst + cess };
  }, [value, item]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={GST_CARD}>
        <div className="flex items-center gap-2 mb-1"><Flame size={16} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">Compensation Cess Calculator</h2></div>
        <p className="text-xs text-[var(--color-muted)] mb-4">GST compensation cess applies on top of GST for sin &amp; luxury goods (tobacco, aerated drinks, cars, coal). Pick a category and enter the taxable value.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Category</label>
            <select value={idx} onChange={e => setIdx(Number(e.target.value))} className={GST_INPUT}>
              {ITEMS.map((it, i) => <option key={it.label} value={i}>{it.label} — {it.gst}% GST + {it.cess} cess</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Taxable value (₹)</label>
            <input type="number" min={0} value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. 800000" className={GST_INPUT} />
          </div>
        </div>
      </div>

      {result.base > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Taxable value", value: result.base, color: "text-[var(--color-text)]" },
              { label: `GST @ ${item.gst}%`, value: result.gst, color: "text-orange-400" },
              { label: `Cess (${item.cess})`, value: result.cess, color: "text-red-400" },
              { label: "Total invoice value", value: result.total, color: "text-[var(--color-primary)]" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-center">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{formatCurrency(k.value)}</p>
              </div>
            ))}
          </div>
          {item.cessPct === 0 && <p className="text-[11px] text-[var(--color-muted)] mt-3">This item carries a specific (per-quantity) cess, not ad-valorem — the cess figure above is shown as ₹0; apply ₹400/tonne on quantity instead.</p>}
          <p className="text-[11px] text-[var(--color-muted)] mt-3">Cess is collected over and above GST and credited to the compensation fund. Rates are indicative — verify the current cess notification for your exact HSN.</p>
        </div>
      )}
    </div>
  );
}

// ── GSTR-9C RECONCILIATION HELPER (audited financials ↔ annual return) ──
function Gstr9cReconciliation() {
  const [bookTurnover, setBookTurnover]   = useState("");
  const [gstr9Turnover, setGstr9Turnover] = useState("");
  const [bookItc, setBookItc]             = useState("");
  const [gstr9Itc, setGstr9Itc]           = useState("");
  const [bookTax, setBookTax]             = useState("");
  const [gstr9Tax, setGstr9Tax]           = useState("");

  const r = useMemo(() => {
    const n = (v: string) => parseFloat(v) || 0;
    const toDiff   = n(bookTurnover) - n(gstr9Turnover);
    const itcDiff  = n(bookItc) - n(gstr9Itc);
    const taxDiff  = n(bookTax) - n(gstr9Tax);
    return { toDiff, itcDiff, taxDiff, anyGap: Math.abs(toDiff) > 1 || Math.abs(itcDiff) > 1 || Math.abs(taxDiff) > 1 };
  }, [bookTurnover, gstr9Turnover, bookItc, gstr9Itc, bookTax, gstr9Tax]);

  const rows: { label: string; book: string; ret: string; diff: number; note: string }[] = [
    { label: "Turnover (Table 5/7)", book: bookTurnover, ret: gstr9Turnover, diff: r.toDiff, note: "Un-reconciled turnover may attract demand under Sec 73/74." },
    { label: "ITC availed (Table 12)", book: bookItc, ret: gstr9Itc, diff: r.itcDiff, note: "Excess book ITC vs return = potential reversal with interest." },
    { label: "Tax paid (Table 9)", book: bookTax, ret: gstr9Tax, diff: r.taxDiff, note: "Shortfall is payable via DRC-03 with the 9C." },
  ];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">GSTR-9C Reconciliation (turnover &gt; ₹5 cr)</strong> — Links your audited books to the annual return (GSTR-9). Enter the figure as per books and as per the filed return for each head; any gap must be explained and any tax shortfall paid via DRC-03.
      </div>

      <div className={GST_CARD}>
        <div className="flex items-center gap-2 mb-4"><ClipboardCheck size={16} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">Reconciliation worksheet</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Turnover as per books (₹)</label><input type="number" value={bookTurnover} onChange={e => setBookTurnover(e.target.value)} placeholder="audited P&L" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Turnover as per GSTR-9 (₹)</label><input type="number" value={gstr9Turnover} onChange={e => setGstr9Turnover(e.target.value)} placeholder="annual return" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">ITC as per books (₹)</label><input type="number" value={bookItc} onChange={e => setBookItc(e.target.value)} placeholder="ledger" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">ITC as per GSTR-9 (₹)</label><input type="number" value={gstr9Itc} onChange={e => setGstr9Itc(e.target.value)} placeholder="Table 12" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Tax paid as per books (₹)</label><input type="number" value={bookTax} onChange={e => setBookTax(e.target.value)} placeholder="provision" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Tax paid as per GSTR-9 (₹)</label><input type="number" value={gstr9Tax} onChange={e => setGstr9Tax(e.target.value)} placeholder="Table 9" className={GST_INPUT} /></div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Head", "As per books", "As per return", "Difference", "Note"].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i >= 1 && i <= 3 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2 font-medium">{row.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(parseFloat(row.book) || 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(parseFloat(row.ret) || 0)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${Math.abs(row.diff) > 1 ? "text-orange-400" : "text-green-400"}`}>{row.diff === 0 ? "—" : (row.diff > 0 ? formatCurrency(row.diff) : `(${formatCurrency(Math.abs(row.diff))})`)}</td>
                <td className="px-3 py-2 text-[var(--color-muted)]">{Math.abs(row.diff) > 1 ? row.note : "Reconciled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg px-4 py-3 text-xs border ${r.anyGap ? "bg-orange-950/20 border-orange-800/40 text-orange-300" : "bg-green-950/20 border-green-800/40 text-green-300"}`}>
        {r.anyGap
          ? "Differences detected. Provide reasons for each un-reconciled amount in Part II/IV of the 9C, and pay any net tax shortfall through DRC-03 before submitting."
          : "All heads reconcile within tolerance — your GSTR-9C should sail through with no additional liability."}
      </div>
    </div>
  );
}

// ── JOB-WORK ITC-04 TRACKER (goods sent to / received from job worker) ──
function JobWorkItc04Tracker() {
  type Lot = { id: string; challanNo: string; jobWorker: string; goods: string; sentDate: string; value: number; type: "inputs" | "capital"; received: boolean };
  const [lots, setLots] = useFeatureState<Lot[]>("gst-jobwork-itc04", []);
  const [challanNo, setChallanNo] = useState("");
  const [jobWorker, setJobWorker] = useState("");
  const [goods, setGoods]         = useState("");
  const [sentDate, setSentDate]   = useState(() => new Date().toISOString().split("T")[0]);
  const [value, setValue]         = useState("");
  const [type, setType]           = useState<"inputs" | "capital">("inputs");

  const add = () => {
    if (!challanNo || !jobWorker) { toast.error("Challan number and job worker required"); return; }
    setLots(prev => [...prev, { id: crypto.randomUUID(), challanNo, jobWorker, goods, sentDate, value: parseFloat(value) || 0, type, received: false }]);
    setChallanNo(""); setJobWorker(""); setGoods(""); setValue("");
  };
  const toggleReceived = (id: string) => setLots(prev => prev.map(l => l.id === id ? { ...l, received: !l.received } : l));
  const remove = (id: string) => setLots(prev => prev.filter(l => l.id !== id));

  const limitDays = (t: Lot["type"]) => t === "inputs" ? 365 : 1095; // 1 yr inputs, 3 yrs capital goods
  const daysOut = (l: Lot) => Math.floor((Date.now() - new Date(l.sentDate).getTime()) / 86400000);
  const pending = lots.filter(l => !l.received);
  const overdue = pending.filter(l => daysOut(l) > limitDays(l.type));
  const atRiskValue = overdue.reduce((s, l) => s + l.value, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">Job-Work Tracker (ITC-04)</strong> — Goods sent to a job worker must return within <strong>1 year (inputs)</strong> or <strong>3 years (capital goods)</strong>, else it is treated as a deemed supply and GST becomes payable. File ITC-04 against delivery challans each period.
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Send goods out (delivery challan)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={challanNo} onChange={e => setChallanNo(e.target.value)} placeholder="Challan no *" className={GST_INPUT} />
          <input value={jobWorker} onChange={e => setJobWorker(e.target.value)} placeholder="Job worker *" className={GST_INPUT} />
          <input value={goods} onChange={e => setGoods(e.target.value)} placeholder="Goods / description" className={GST_INPUT} />
          <input type="date" value={sentDate} onChange={e => setSentDate(e.target.value)} className={GST_INPUT} />
          <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="Value (₹)" className={GST_INPUT} />
          <select value={type} onChange={e => setType(e.target.value as typeof type)} className={GST_INPUT}><option value="inputs">Inputs (1 yr)</option><option value="capital">Capital goods (3 yrs)</option></select>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 md:col-span-2">+ Add challan</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Open with job workers</p><p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{pending.length}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Past return window</p><p className="text-lg font-bold tabular-nums text-red-400">{overdue.length}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Deemed-supply value at risk</p><p className="text-lg font-bold tabular-nums text-red-400">{formatCurrency(atRiskValue)}</p></div>
      </div>

      {lots.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Challan", "Job worker", "Goods", "Sent", "Type", "Days out", "Value", "Status", ""].map(h => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {lots.slice().reverse().map(l => {
                const od = !l.received && daysOut(l) > limitDays(l.type);
                return (
                  <tr key={l.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 font-mono">{l.challanNo}</td>
                    <td className="px-3 py-2">{l.jobWorker}</td>
                    <td className="px-3 py-2 max-w-[140px] truncate">{l.goods || "—"}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{l.sentDate}</td>
                    <td className="px-3 py-2">{l.type === "inputs" ? "Inputs" : "Capital"}</td>
                    <td className={`px-3 py-2 tabular-nums ${od ? "text-red-400 font-semibold" : "text-[var(--color-muted)]"}`}>{l.received ? "—" : `${daysOut(l)}d`}</td>
                    <td className="px-3 py-2 tabular-nums">{formatCurrency(l.value)}</td>
                    <td className="px-3 py-2"><button onClick={() => toggleReceived(l.id)} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${l.received ? "bg-green-950/30 text-green-400" : od ? "bg-red-950/30 text-red-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>{l.received ? "Received" : od ? "Overdue" : "Pending"}</button></td>
                    <td className="px-3 py-2"><button onClick={() => remove(l.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ISD CREDIT DISTRIBUTOR (common input service credit across branches) ──
function IsdCreditDistributor() {
  type Branch = { id: string; name: string; turnover: number };
  const [branches, setBranches] = useFeatureState<Branch[]>("gst-isd-branches", []);
  const [name, setName]   = useState("");
  const [to, setTo]       = useState("");
  const [creditAmt, setCreditAmt] = useState("");

  const addBranch = () => {
    const t = parseFloat(to) || 0;
    if (!name) { toast.error("Branch name required"); return; }
    setBranches(prev => [...prev, { id: crypto.randomUUID(), name, turnover: t }]);
    setName(""); setTo("");
  };
  const remove = (id: string) => setBranches(prev => prev.filter(b => b.id !== id));

  const totalTo = branches.reduce((s, b) => s + b.turnover, 0);
  const credit = parseFloat(creditAmt) || 0;
  const distribution = branches.map(b => ({
    ...b,
    share: totalTo > 0 ? b.turnover / totalTo : 0,
    amount: totalTo > 0 ? Math.round(credit * b.turnover / totalTo) : 0,
  }));
  const distributed = distribution.reduce((s, d) => s + d.amount, 0);
  const rounding = credit - distributed; // assign to last branch in display

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">ISD Credit Distributor (Rule 39)</strong> — An Input Service Distributor allocates common input-service ITC (audit, software, head-office costs) to each branch GSTIN in the ratio of that branch's turnover to total turnover, reported via GSTR-6.
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add recipient branch</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Branch / unit name *" className={GST_INPUT} />
          <input type="number" value={to} onChange={e => setTo(e.target.value)} placeholder="Branch turnover (₹)" className={GST_INPUT} />
          <button onClick={addBranch} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add branch</button>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Common ITC to distribute (₹)</label>
          <input type="number" value={creditAmt} onChange={e => setCreditAmt(e.target.value)} placeholder="e.g. 90000" className={`${GST_INPUT} md:max-w-xs`} />
        </div>
      </div>

      {branches.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Branch", "Turnover", "Share %", "ITC allocated", ""].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i >= 1 && i <= 3 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {distribution.map((d, i) => (
                <tr key={d.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(d.turnover)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">{(d.share * 100).toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-green-400">{formatCurrency(d.amount + (i === distribution.length - 1 ? rounding : 0))}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => remove(d.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                <td className="px-3 py-2 font-bold">Total</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{formatCurrency(totalTo)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">100%</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-green-400">{formatCurrency(credit)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {branches.length > 0 && rounding !== 0 && (
        <p className="text-[11px] text-[var(--color-muted)]">A ₹{Math.abs(rounding)} rounding residual is assigned to the last branch so the total distributed equals the credit exactly.</p>
      )}
    </div>
  );
}

// ── BRANCH-TRANSFER STOCK INVOICING (cross-state stock between own GSTINs) ──
function BranchTransferInvoicer() {
  const [fromState, setFromState] = useState("");
  const [toState, setToState]     = useState("");
  const [cost, setCost]           = useState("");
  const [rate, setRate]           = useState(18);

  const r = useMemo(() => {
    const base = parseFloat(cost) || 0;
    // Rule 28 (2nd proviso): where recipient is eligible for full ITC, value declared in invoice is deemed open market value.
    const interState = fromState.trim() !== "" && toState.trim() !== "" && fromState.trim().toLowerCase() !== toState.trim().toLowerCase();
    const tax = Math.round(base * rate / 100);
    const half = Math.round(tax / 2);
    return { base, interState, tax, igst: interState ? tax : 0, cgst: interState ? 0 : half, sgst: interState ? 0 : tax - half, total: base + tax };
  }, [cost, rate, fromState, toState]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">Branch-Transfer Invoicing (Sch. I)</strong> — A stock transfer between two GSTINs of the same PAN in <strong>different states</strong> is a taxable supply even without consideration. Raise a tax invoice; under Rule 28 the invoice value is accepted if the receiving branch can claim full ITC (tax-neutral).
      </div>

      <div className={GST_CARD}>
        <div className="flex items-center gap-2 mb-4"><ArrowLeftRight size={16} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">Transfer valuation</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">From state (sending GSTIN)</label><input value={fromState} onChange={e => setFromState(e.target.value)} placeholder="e.g. Maharashtra" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">To state (receiving GSTIN)</label><input value={toState} onChange={e => setToState(e.target.value)} placeholder="e.g. Karnataka" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Cost / declared value (₹)</label><input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="e.g. 250000" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">GST rate</label><select value={rate} onChange={e => setRate(Number(e.target.value))} className={GST_INPUT}>{[0, 5, 12, 18, 28].map(x => <option key={x} value={x}>{x}%</option>)}</select></div>
        </div>
      </div>

      {r.base > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-[var(--color-muted)]">Supply type</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.interState ? "bg-blue-950/30 text-blue-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>{r.interState ? "Inter-state — IGST" : fromState && toState ? "Intra-state — CGST+SGST" : "Enter both states"}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Taxable value", value: r.base, color: "text-[var(--color-text)]" },
              ...(r.interState ? [{ label: `IGST @ ${rate}%`, value: r.igst, color: "text-blue-400" }] : [{ label: `CGST @ ${rate / 2}%`, value: r.cgst, color: "text-orange-400" }, { label: `SGST @ ${rate / 2}%`, value: r.sgst, color: "text-orange-400" }]),
              { label: "Invoice total", value: r.total, color: "text-[var(--color-primary)]" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-center">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-base font-bold tabular-nums ${k.color}`}>{formatCurrency(k.value)}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">If the receiving branch claims full ITC, the GST here is fully creditable — the transfer is cash-neutral overall but still requires a compliant tax invoice and e-way bill (value &gt; ₹50,000).</p>
        </div>
      )}
    </div>
  );
}

// ── PMT-09 FUND TRANSFER (move balance between cash-ledger heads) ──
function Pmt09FundTransfer() {
  const HEADS = ["IGST", "CGST", "SGST", "Cess"] as const;
  type Head = typeof HEADS[number];
  type Xfer = { id: string; from: Head; to: Head; minor: "Tax" | "Interest" | "Penalty" | "Fee" | "Other"; amount: number };
  const [xfers, setXfers] = useFeatureState<Xfer[]>("gst-pmt09-transfers", []);
  const [from, setFrom]   = useState<Head>("CGST");
  const [to, setTo]       = useState<Head>("IGST");
  const [minor, setMinor] = useState<Xfer["minor"]>("Tax");
  const [amount, setAmount] = useState("");

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { toast.error("Enter a positive amount"); return; }
    if (from === to) { toast.error("Source and destination heads must differ"); return; }
    setXfers(prev => [...prev, { id: crypto.randomUUID(), from, to, minor, amount: amt }]);
    setAmount("");
    toast.success(`Staged ₹${amt.toLocaleString("en-IN")} ${from} → ${to}`);
  };
  const remove = (id: string) => setXfers(prev => prev.filter(x => x.id !== id));

  const net: Record<Head, number> = { IGST: 0, CGST: 0, SGST: 0, Cess: 0 };
  for (const x of xfers) { net[x.from] -= x.amount; net[x.to] += x.amount; }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">PMT-09 Fund Transfer</strong> — Form PMT-09 moves an amount wrongly deposited under one head of the <strong>electronic cash ledger</strong> to the correct head (e.g. CGST → IGST), so you don't have to claim a refund. It only reshuffles cash already paid; it cannot touch the credit ledger.
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Stage a transfer</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">From head</label><select value={from} onChange={e => setFrom(e.target.value as Head)} className={GST_INPUT}>{HEADS.map(h => <option key={h} value={h}>{h}</option>)}</select></div>
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">To head</label><select value={to} onChange={e => setTo(e.target.value as Head)} className={GST_INPUT}>{HEADS.map(h => <option key={h} value={h}>{h}</option>)}</select></div>
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">Minor head</label><select value={minor} onChange={e => setMinor(e.target.value as Xfer["minor"])} className={GST_INPUT}>{["Tax", "Interest", "Penalty", "Fee", "Other"].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">Amount (₹)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 12000" className={GST_INPUT} /></div>
          <div className="flex items-end"><button onClick={add} className="w-full text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Stage</button></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {HEADS.map(h => (
          <div key={h} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{h} cash net change</p>
            <p className={`text-lg font-bold tabular-nums ${net[h] > 0 ? "text-green-400" : net[h] < 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{net[h] === 0 ? "—" : net[h] > 0 ? `+${formatCurrency(net[h])}` : `(${formatCurrency(Math.abs(net[h]))})`}</p>
          </div>
        ))}
      </div>

      {xfers.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["From", "To", "Minor head", "Amount", ""].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {xfers.slice().reverse().map(x => (
                <tr key={x.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 font-medium text-red-400">{x.from}</td>
                  <td className="px-3 py-2 font-medium text-green-400">{x.to}</td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">{x.minor}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(x.amount)}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => remove(x.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-[var(--color-muted)]">File the actual transfer at gst.gov.in → Services → Ledgers → Electronic Cash Ledger → File PMT-09. Each row above maps to one transfer line.</p>
    </div>
  );
}

// ── CROSS-CHARGE (distinct persons, Sch. I) — value HO/common costs charged to branches ──
function CrossChargeCalculator() {
  type Branch = { id: string; name: string; state: string; turnoverShare: number };
  const [branches, setBranches] = useFeatureState<Branch[]>("gst-crosscharge-branches", []);
  const [commonCost, setCommonCost] = useFeatureState<string>("gst-crosscharge-cost", "");
  const [markup, setMarkup]   = useState("0");
  const [rate, setRate]       = useState(18);
  const [hoState, setHoState] = useState("");
  const [bName, setBName]     = useState("");
  const [bState, setBState]   = useState("");
  const [bShare, setBShare]   = useState("");

  const addBranch = () => {
    if (!bName.trim() || !bState.trim()) { toast.error("Enter branch name and state"); return; }
    const share = parseFloat(bShare) || 0;
    if (share <= 0) { toast.error("Turnover share must be positive"); return; }
    setBranches(prev => [...prev, { id: crypto.randomUUID(), name: bName.trim(), state: bState.trim(), turnoverShare: share }]);
    setBName(""); setBState(""); setBShare("");
  };
  const removeBranch = (id: string) => setBranches(prev => prev.filter(b => b.id !== id));

  const result = useMemo(() => {
    const base = parseFloat(commonCost) || 0;
    const mk = parseFloat(markup) || 0;
    const totalShare = branches.reduce((s, b) => s + b.turnoverShare, 0);
    // Cross-charge value per branch (allocate common cost by turnover share, add notional markup if no full-ITC concession claimed).
    const lines = branches.map(b => {
      const portion = totalShare > 0 ? base * (b.turnoverShare / totalShare) : 0;
      const taxableValue = portion * (1 + mk / 100);
      const interState = hoState.trim() !== "" && b.state.trim().toLowerCase() !== hoState.trim().toLowerCase();
      const tax = Math.round(taxableValue * rate / 100);
      const half = Math.round(tax / 2);
      return { ...b, portion, taxableValue, interState, tax, igst: interState ? tax : 0, cgst: interState ? 0 : half, sgst: interState ? 0 : tax - half };
    });
    return { base, totalShare, lines, totalTax: lines.reduce((s, l) => s + l.tax, 0) };
  }, [commonCost, markup, branches, hoState, rate]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">Cross-Charge (distinct persons, Sch. I)</strong> — When a head office incurs a common cost (rent, software, in-house staff effort) that benefits its branches in other states, those branches are <strong>distinct persons</strong>. HO must raise a tax invoice cross-charging each branch (Circular 199/2023). Allocate by turnover share; if the branch claims full ITC it is tax-neutral.
      </div>

      <div className={GST_CARD}>
        <div className="flex items-center gap-2 mb-4"><Users size={16} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">Common cost to allocate</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Total common cost (₹)</label><input type="number" value={commonCost} onChange={e => setCommonCost(e.target.value)} placeholder="e.g. 1200000" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">HO state</label><input value={hoState} onChange={e => setHoState(e.target.value)} placeholder="e.g. Maharashtra" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Notional markup %</label><input type="number" value={markup} onChange={e => setMarkup(e.target.value)} placeholder="0" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">GST rate</label><select value={rate} onChange={e => setRate(Number(e.target.value))} className={GST_INPUT}>{[5, 12, 18, 28].map(x => <option key={x} value={x}>{x}%</option>)}</select></div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Recipient branches</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">Branch name</label><input value={bName} onChange={e => setBName(e.target.value)} placeholder="e.g. Bengaluru" className={GST_INPUT} /></div>
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">State</label><input value={bState} onChange={e => setBState(e.target.value)} placeholder="e.g. Karnataka" className={GST_INPUT} /></div>
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">Turnover share (any unit)</label><input type="number" value={bShare} onChange={e => setBShare(e.target.value)} placeholder="e.g. 40" className={GST_INPUT} /></div>
          <div className="flex items-end"><button onClick={addBranch} className="w-full text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add branch</button></div>
        </div>
      </div>

      {result.lines.length > 0 && result.base > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <p className="text-sm font-semibold">Cross-charge allocation</p>
            <p className="text-xs text-[var(--color-muted)]">Total GST: <span className="font-semibold text-[var(--color-text)]">{formatCurrency(result.totalTax)}</span></p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Branch", "State", "Supply", "Taxable value", "IGST", "CGST", "SGST", ""].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i >= 3 && i <= 6 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody>
                {result.lines.map(l => (
                  <tr key={l.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 font-medium">{l.name}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{l.state}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${l.interState ? "bg-blue-950/30 text-blue-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>{l.interState ? "IGST" : "CGST+SGST"}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.taxableValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-400">{l.igst ? formatCurrency(l.igst) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-orange-400">{l.cgst ? formatCurrency(l.cgst) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-orange-400">{l.sgst ? formatCurrency(l.sgst) : "—"}</td>
                    <td className="px-3 py-2 text-right"><button onClick={() => removeBranch(l.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-2.5 text-[11px] text-[var(--color-muted)] border-t border-[var(--color-border)]">Salary cost of HO employees serving branches need not carry a markup (Circular 199/2023); the cross-charge value can equal the cost. Each branch claims this GST as ITC where eligible.</p>
        </div>
      )}
    </div>
  );
}

// ── FREE SAMPLES / GIFTS — Sec 17(5)(h) ITC reversal ──
function FreeSamplesItcReversal() {
  type Item = { id: string; desc: string; kind: "Free sample" | "Gift / promo" | "Buy-one-get-one"; costPerUnit: number; qty: number; rate: number };
  const [items, setItems] = useFeatureState<Item[]>("gst-freesample-items", []);
  const [desc, setDesc]   = useState("");
  const [kind, setKind]   = useState<Item["kind"]>("Free sample");
  const [cost, setCost]   = useState("");
  const [qty, setQty]     = useState("");
  const [rate, setRate]   = useState(18);

  const add = () => {
    if (!desc.trim()) { toast.error("Describe the item"); return; }
    const c = parseFloat(cost) || 0; const q = parseFloat(qty) || 0;
    if (c <= 0 || q <= 0) { toast.error("Enter a positive cost and quantity"); return; }
    setItems(prev => [...prev, { id: crypto.randomUUID(), desc: desc.trim(), kind, costPerUnit: c, qty: q, rate }]);
    setDesc(""); setCost(""); setQty("");
  };
  const remove = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const totals = useMemo(() => items.reduce((s, i) => {
    const value = i.costPerUnit * i.qty;
    // BOGO is a single supply at one price (Circular 92/2018) → no ITC reversal; free samples & gifts → ITC must be reversed u/s 17(5)(h).
    const reversalRequired = i.kind !== "Buy-one-get-one";
    const itc = reversalRequired ? Math.round(value * i.rate / 100) : 0;
    return { value: s.value + value, itc: s.itc + itc };
  }, { value: 0, itc: 0 }), [items]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">Free Samples & Gifts — ITC reversal (Sec 17(5)(h))</strong> — Goods given away as free samples or gifts are not a taxable supply, but the input tax credit on those goods must be <strong>reversed</strong>. Exception: a genuine "buy-one-get-one" is a single composite supply (Circular 92/2018) — the extra unit is not free, so no reversal.
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add a giveaway</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="md:col-span-2"><label className="block text-[10px] text-[var(--color-muted)] mb-1">Description</label><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Trial sachets" className={GST_INPUT} /></div>
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">Type</label><select value={kind} onChange={e => setKind(e.target.value as Item["kind"])} className={GST_INPUT}>{(["Free sample", "Gift / promo", "Buy-one-get-one"] as const).map(k => <option key={k} value={k}>{k}</option>)}</select></div>
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">Cost/unit (₹)</label><input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="e.g. 80" className={GST_INPUT} /></div>
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">Qty given</label><input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 500" className={GST_INPUT} /></div>
          <div><label className="block text-[10px] text-[var(--color-muted)] mb-1">ITC rate</label><select value={rate} onChange={e => setRate(Number(e.target.value))} className={GST_INPUT}>{[5, 12, 18, 28].map(x => <option key={x} value={x}>{x}%</option>)}</select></div>
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Total giveaway cost</p><p className="text-lg font-bold tabular-nums">{formatCurrency(totals.value)}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">ITC to reverse u/s 17(5)(h)</p><p className="text-lg font-bold tabular-nums text-red-400">{formatCurrency(totals.itc)}</p></div>
      </div>

      {items.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]"><tr>{["Item", "Type", "Cost", "Qty", "Value", "ITC reversal", ""].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i >= 2 && i <= 5 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {items.slice().reverse().map(i => {
                const value = i.costPerUnit * i.qty;
                const reversalRequired = i.kind !== "Buy-one-get-one";
                const itc = reversalRequired ? Math.round(value * i.rate / 100) : 0;
                return (
                  <tr key={i.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 font-medium">{i.desc}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{i.kind}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(i.costPerUnit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatAmount(i.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(value)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${itc > 0 ? "text-red-400" : "text-green-400"}`}>{itc > 0 ? formatCurrency(itc) : "No reversal"}</td>
                    <td className="px-3 py-2 text-right"><button onClick={() => remove(i.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-[var(--color-muted)]">Report the reversal in GSTR-3B Table 4(B)(1). Keep proof of cost so the reversal is defensible. Promotional schemes structured as discounts on a taxable supply may avoid reversal — review each scheme's invoicing.</p>
    </div>
  );
}

// ── PURE-AGENT EXPENSE TAGGER — Rule 33 exclusion from taxable value ──
function PureAgentTagger() {
  const RULE33 = [
    { q: "You pay the third party only as authorised by the recipient.", k: "authorised" },
    { q: "The payment is separately indicated on your invoice (at actual, no markup).", k: "separate" },
    { q: "The supplies procured are in addition to your own services.", k: "additional" },
    { q: "You do not hold title to the goods/services so procured.", k: "noTitle" },
    { q: "You do not use the goods/services for your own benefit.", k: "noUse" },
  ] as const;
  type Key = typeof RULE33[number]["k"];
  const [checks, setChecks] = useState<Record<Key, boolean>>({ authorised: false, separate: false, additional: false, noTitle: false, noUse: false });
  const [ownFee, setOwnFee]   = useState("");
  const [reimburse, setReimburse] = useState("");
  const [rate, setRate]       = useState(18);

  const allMet = RULE33.every(r => checks[r.k]);
  const calc = useMemo(() => {
    const fee = parseFloat(ownFee) || 0;
    const reim = parseFloat(reimburse) || 0;
    const taxable = allMet ? fee : fee + reim; // reimbursement excluded only if pure-agent conditions are met
    const tax = Math.round(taxable * rate / 100);
    return { fee, reim, taxable, tax, total: taxable + tax + (allMet ? reim : 0) };
  }, [ownFee, reimburse, rate, allMet]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">Pure-Agent Expenses (Rule 33)</strong> — Costs you incur purely as an agent on behalf of your client (e.g. ROC fees, government stamp duty, port charges) are <strong>excluded from your taxable value</strong> if all five conditions are met. Otherwise the reimbursement is taxed along with your fee.
      </div>

      <div className={GST_CARD}>
        <div className="flex items-center gap-2 mb-3"><UserCheck size={16} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">Rule 33 conditions</h2></div>
        <div className="space-y-2">
          {RULE33.map(r => (
            <label key={r.k} className="flex items-start gap-2.5 text-xs cursor-pointer">
              <input type="checkbox" checked={checks[r.k]} onChange={e => setChecks(prev => ({ ...prev, [r.k]: e.target.checked }))} className="mt-0.5 accent-[var(--color-primary)]" />
              <span className={checks[r.k] ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"}>{r.q}</span>
            </label>
          ))}
        </div>
        <div className={`mt-3 text-[11px] font-semibold ${allMet ? "text-green-400" : "text-yellow-400"}`}>{allMet ? "Qualifies as pure agent — reimbursement excluded from taxable value." : "Not all conditions met — reimbursement is part of the taxable value."}</div>
      </div>

      <div className={GST_CARD}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Your own fee (₹)</label><input type="number" value={ownFee} onChange={e => setOwnFee(e.target.value)} placeholder="e.g. 15000" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Reimbursed cost (₹)</label><input type="number" value={reimburse} onChange={e => setReimburse(e.target.value)} placeholder="e.g. 40000" className={GST_INPUT} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">GST rate</label><select value={rate} onChange={e => setRate(Number(e.target.value))} className={GST_INPUT}>{[5, 12, 18, 28].map(x => <option key={x} value={x}>{x}%</option>)}</select></div>
        </div>
      </div>

      {(calc.fee > 0 || calc.reim > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Taxable value", value: calc.taxable, color: "text-[var(--color-text)]" },
            { label: `GST @ ${rate}%`, value: calc.tax, color: "text-orange-400" },
            { label: allMet ? "Pass-through (no GST)" : "Reimbursement (taxed)", value: calc.reim, color: allMet ? "text-green-400" : "text-red-400" },
            { label: "Invoice total", value: calc.total, color: "text-[var(--color-primary)]" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-center">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-base font-bold tabular-nums ${k.color}`}>{formatCurrency(k.value)}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[var(--color-muted)]">Show pure-agent recoveries as a distinct line on the invoice at actual cost. Treating a taxable reimbursement as pure-agent understates output tax and attracts interest on the shortfall.</p>
    </div>
  );
}

// ── GST AUDIT-READINESS CHECKLIST ──
function AuditReadinessChecklist() {
  const ITEMS = [
    { id: "recon1-3b", area: "Returns", text: "GSTR-1 turnover reconciles with GSTR-3B for every month of the year." },
    { id: "recon3b-books", area: "Returns", text: "GSTR-3B output tax reconciles with the books / sales ledger." },
    { id: "itc-2b", area: "ITC", text: "ITC claimed reconciles with GSTR-2B; mismatches are documented." },
    { id: "blocked", area: "ITC", text: "Sec 17(5) blocked credits identified and excluded from claims." },
    { id: "reversal", area: "ITC", text: "Rule 42/43 common-credit and 17(5)(h) giveaway reversals computed." },
    { id: "rule180", area: "ITC", text: "Invoices unpaid beyond 180 days have had ITC reversed." },
    { id: "rcm", area: "RCM", text: "All RCM liabilities discharged in cash and self-invoices raised." },
    { id: "einvoice", area: "Documents", text: "E-invoice IRN generated for every B2B invoice (where applicable)." },
    { id: "eway", area: "Documents", text: "E-way bills generated and matched to invoices > ₹50,000." },
    { id: "hsn", area: "Documents", text: "Correct HSN/SAC and rate applied; HSN summary tallies in GSTR-1." },
    { id: "annual", area: "Annual", text: "GSTR-9 / 9C filed and reconciled with audited financials." },
    { id: "ledger", area: "Records", text: "Electronic cash & credit ledger balances tally with books." },
    { id: "vendor", area: "Records", text: "Supplier GSTINs verified active; cancelled-dealer purchases flagged." },
    { id: "notices", area: "Records", text: "All notices (ASMT-10/DRC) responded to within deadline; copies filed." },
  ] as const;
  type ItemId = typeof ITEMS[number]["id"];
  const [done, setDone] = useFeatureState<Record<string, boolean>>("gst-audit-checklist", {});

  const toggle = (id: ItemId) => setDone(prev => ({ ...prev, [id]: !prev[id] }));
  const completed = ITEMS.filter(i => done[i.id]).length;
  const pct = Math.round((completed / ITEMS.length) * 100);
  const areas = Array.from(new Set(ITEMS.map(i => i.area)));

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">Audit-Readiness Checklist</strong> — A departmental audit (Sec 65) or scrutiny (Sec 61) can land with little notice. Keep these reconciliations and documents perpetually ready so a visit needs zero scramble. Your progress is saved locally.
      </div>

      <div className={GST_CARD}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2"><ListChecks size={16} className="text-[var(--color-primary)]" /><h2 className="text-sm font-semibold">Readiness</h2></div>
          <span className={`text-sm font-bold tabular-nums ${pct === 100 ? "text-green-400" : pct >= 60 ? "text-yellow-400" : "text-red-400"}`}>{pct}% · {completed}/{ITEMS.length}</span>
        </div>
        <div className="h-2 w-full bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className={`h-full transition-all ${pct === 100 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {areas.map(area => (
        <div key={area} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-5 py-2.5 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">{area}</div>
          <div className="divide-y divide-[var(--color-border)]">
            {ITEMS.filter(i => i.area === area).map(i => (
              <label key={i.id} className="flex items-start gap-3 px-5 py-3 text-xs cursor-pointer hover:bg-white/2">
                <input type="checkbox" checked={!!done[i.id]} onChange={() => toggle(i.id)} className="mt-0.5 accent-[var(--color-primary)]" />
                <span className={done[i.id] ? "text-[var(--color-muted)] line-through" : "text-[var(--color-text)]"}>{i.text}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
