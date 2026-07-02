import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useT } from "@/i18n";
import { useFeatureState } from "@/hooks/useFeatureState";
import { generateDemoData } from "@/lib/demoData";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Database, Upload, Download, FileSpreadsheet, Sparkles, Pencil, Trash2, ArrowLeftRight, Columns3, Building2, ShieldCheck, Plus, Clock, CheckCircle2, Copy, Replace, Bookmark, FileDown, Archive, Search, BarChart3, Braces, Coins, BadgeCheck, Table2, ReceiptText, CalendarRange, ScanSearch, FileJson } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import TransactionImportModal from "@/components/TransactionImportModal";
import MigrationWizard from "@/components/MigrationWizard";
import type { Transaction } from "@/data/types";

function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataPage() {
  const { store, setStore, canAccess, canEdit } = useApp();
  const tr = useT();
  const navigate = useNavigate();
  const [showImport, setShowImport] = useState(false);
  const [showMigrate, setShowMigrate] = useState(false);
  const [tab, setTab] = useState<"overview" | "tally" | "mapper" | "consolidate" | "backup" | "quality" | "dedupe" | "replace" | "templates-store" | "filings" | "archive" | "profiler" | "csv-json" | "number-clean" | "gstin-check" | "pivot" | "statement-parse" | "range-export" | "paste-dupes" | "json-fmt">("overview");

  if (!canAccess("data")) return <Navigate to="/dashboard" replace />;

  const editable = canEdit();
  const importAccountId = store.bankAccounts[0]?.id ?? "manual-import";

  const handleImport = (txns: Transaction[]) => {
    setStore(s => {
      // Ensure there's an account to attach imported rows to
      const accounts = s.bankAccounts.length > 0 ? s.bankAccounts : [{
        id: "manual-import", name: "Imported (manual)", provider: "manual", balance: 0,
        lastSync: new Date().toISOString(), status: "connected" as const,
      }];
      return { ...s, bankAccounts: accounts, transactions: [...txns, ...s.transactions] };
    });
  };

  const loadDemo = async () => {
    if (!window.confirm("Load the full demo dataset? This fills EVERY module - transactions, invoices, accounts, loans, GST, payroll, inventory, sales pipeline, treasury, compliance and more - with realistic sample data so you can walk through the whole platform.")) return;
    const demo = generateDemoData();
    // Spread the entire generated store: every top-level array (orders, inventory,
    // credit, capital, connectors, budgets, alerts…) plus the full featureData bag
    // that lights up all ~600 feature-page tools at once. firm is merged, not replaced.
    setStore(s => ({ ...s, ...demo, firm: { ...s.firm, ...demo.firm } }));
    toast.success(`Loaded ${demo.transactions?.length ?? 0} transactions + data across every module`);
    // Also seed the backend modules so the accounting books (GL/GST/inventory/
    // subscriptions) and the CRM sales pipeline show data too. Best-effort.
    toast.loading("Seeding backend accounting & CRM…", { id: "demo-backend" });
    const [books, crm] = await Promise.allSettled([
      api.post("/api/books/demo-seed", {}),
      api.post("/api/crm/demo-seed", {}),
    ]);
    const ok = [books, crm].filter(r => r.status === "fulfilled").length;
    if (ok > 0) toast.success(`Seeded ${ok === 2 ? "accounting books + CRM pipeline" : "backend module"}`, { id: "demo-backend" });
    else toast.error("Frontend demo loaded; backend seed unavailable (sign in to a workspace to seed books/CRM).", { id: "demo-backend" });
  };

  const clearAll = () => {
    if (!window.confirm("Clear ALL demo/financial data across every module (transactions, invoices, accounts, loans, and all feature tools)? This cannot be undone.")) return;
    setStore(s => ({
      ...s,
      transactions: [], invoices: [], bankAccounts: [], activeLoans: [], obligations: [],
      fixedAssets: [], orders: [], inventory: [], procurement: [], budgets: [],
      scenarios: [], alerts: [], creditApplications: [], creditOffers: [],
      capitalRaises: [], capitalInvestments: [], connectors: [], featureData: {},
    }));
    toast.success("All data cleared across every module");
  };

  const txnTemplate = "date,amount,description,counterparty\n01/06/2026,250000,Client payment,Mehta Corp\n03/06/2026,-120000,Office rent,Landlord\n05/06/2026,-410000,Monthly payroll,Team\n";
  const invTemplate = "customer,amount,invoice_number,invoice_date,due_date,status\nMehta Corp,250000,INV-001,01/06/2026,01/07/2026,pending\n";

  const stats = [
    { label: tr("data.statTransactions"), value: store.transactions.length },
    { label: tr("data.statInvoices"), value: store.invoices.length },
    { label: tr("data.statBankAccounts"), value: store.bankAccounts.length },
    { label: tr("data.statActiveLoans"), value: store.activeLoans.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <Database size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{tr("data.title")}</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{tr("data.subtitle")}</p>
        </div>
      </div>

      {/* Tool selector */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
        {([["overview", tr("data.tabOverview"), Database], ["tally", tr("data.tabTallyBridge"), ArrowLeftRight], ["mapper", tr("data.tabCsvMapper"), Columns3], ["consolidate", tr("data.tabConsolidation"), Building2], ["backup", tr("data.tabBackupExport"), ShieldCheck], ["quality", tr("data.tabDataQuality"), CheckCircle2], ["dedupe", "Dedupe", Copy], ["replace", "Find & Replace", Replace], ["templates-store", "Mapping Templates", Bookmark], ["filings", "Filing Templates", FileDown], ["archive", "Archive & Purge", Archive], ["profiler", "Column Profiler", BarChart3], ["csv-json", "CSV ↔ JSON", Braces], ["number-clean", "Number Cleanup", Coins], ["gstin-check", "GSTIN Validator", BadgeCheck], ["pivot", "Pivot Builder", Table2], ["statement-parse", "Statement Parser", ReceiptText], ["range-export", "Date-Range Export", CalendarRange], ["paste-dupes", "Paste Dedupe", ScanSearch], ["json-fmt", "JSON Formatter", FileJson]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {tab === "tally" && <TallyBridge editable={editable} onImport={handleImport} />}
      {tab === "mapper" && <CsvMapper editable={editable} onImport={handleImport} importAccountId={importAccountId} />}
      {tab === "consolidate" && <MultiEntityConsolidation />}
      {tab === "backup" && <ScheduledBackup />}
      {tab === "quality" && <DataQualityChecker />}
      {tab === "dedupe" && <TransactionDedupe editable={editable} />}
      {tab === "replace" && <BulkFindReplace editable={editable} />}
      {tab === "templates-store" && <MappingTemplateStore />}
      {tab === "filings" && <FilingTemplates />}
      {tab === "archive" && <ArchivePurge editable={editable} />}
      {tab === "profiler" && <ColumnProfiler />}
      {tab === "csv-json" && <CsvJsonConverter />}
      {tab === "number-clean" && <NumberCleanup />}
      {tab === "gstin-check" && <GstinValidator />}
      {tab === "pivot" && <PivotBuilder />}
      {tab === "statement-parse" && <StatementParser editable={editable} onImport={handleImport} importAccountId={importAccountId} />}
      {tab === "range-export" && <DateRangeExport />}
      {tab === "paste-dupes" && <PasteDuplicateFinder />}
      {tab === "json-fmt" && <JsonFormatter />}

      {tab === "overview" && <>
      {/* Current data snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{s.value}</p>
          </div>
        ))}
      </div>

      {!editable && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-4 py-3 text-sm">
          Your role has read-only access - importing and editing are disabled.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bulk CSV import */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Upload size={15} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Bulk import transactions</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">Upload a bank/accounting CSV. We auto-detect date, amount and description columns, guess categories, and let you preview before committing.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={!editable} onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40">
              <Upload size={13} /> {tr("data.uploadCsv")}
            </button>
            <button onClick={() => downloadCsv("transactions-template.csv", txnTemplate)}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)]">
              <Download size={13} /> Template
            </button>
          </div>
        </div>

        {/* Demo data */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={15} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Load sample data · FY23-FY28</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">Populate the whole app with six years of realistic financials - revenue, payroll, GST, a loan and live invoices - so every statement, chart and forecast comes to life.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={!editable} onClick={loadDemo}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40">
              <Sparkles size={13} /> {tr("data.loadDemoData")}
            </button>
            <button disabled={!editable} onClick={clearAll}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-red-400 disabled:opacity-40">
              <Trash2 size={13} /> Clear all
            </button>
          </div>
        </div>

        {/* Migrate / switch from Tally */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <ArrowLeftRight size={15} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Switch from Tally / bring your data</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">Already on Tally or a spreadsheet? Import your Masters export (one XML file → ledgers + stock items) or upload CSVs for ledgers, items and opening invoices - validated row-by-row.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={!editable} onClick={() => setShowMigrate(true)}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40">
              <ArrowLeftRight size={13} /> Migrate data
            </button>
          </div>
        </div>

        {/* Bulk edit */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Pencil size={15} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Edit in bulk</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">Select many transactions and re-categorise them at once, or save a rule so every future row from a vendor is categorised automatically.</p>
          <button onClick={() => navigate("/transactions")}
            className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-2 rounded-lg hover:border-[var(--color-primary)]">
            Open Transactions →
          </button>
        </div>

        {/* CSV templates */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet size={15} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">CSV templates</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">Start from a correctly-formatted file. Dates accept DD/MM/YYYY; negative amounts are expenses.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => downloadCsv("transactions-template.csv", txnTemplate)}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)]">
              <Download size={13} /> Transactions
            </button>
            <button onClick={() => downloadCsv("invoices-template.csv", invTemplate)}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)]">
              <Download size={13} /> Invoices
            </button>
          </div>
        </div>
      </div>
      </>}

      {showImport && (
        <TransactionImportModal
          bankAccountId={importAccountId}
          onClose={() => setShowImport(false)}
          onImport={handleImport}
        />
      )}
      {showMigrate && <MigrationWizard onClose={() => setShowMigrate(false)} />}
    </div>
  );
}

// ── Shared helpers for the Data tools ──────────────────────────────────────────
function downloadBlob(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
function xmlEscape(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// Robust single-line CSV splitter that honours double-quoted fields.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(c => c.trim());
}
// DD/MM/YYYY, YYYY-MM-DD or DD-MM-YYYY → ISO yyyy-mm-dd (best effort).
function toIsoDate(raw: string): string {
  const s = (raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0"), mm = m[2].padStart(2, "0");
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

const inpCls = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const taCls = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-[var(--color-primary)] min-h-[140px] resize-y";
const cardCls = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5";
const primaryBtn = "flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40";
const ghostBtn = "flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)]";

// ── #162 Tally Import/Export Bridge ────────────────────────────────────────────
// Client-side Tally XML: EXPORT live transactions as a Daybook (Tally.ERP9
// "Voucher" collection); IMPORT a pasted Tally voucher XML back into txns.
function TallyBridge({ editable, onImport }: { editable: boolean; onImport: (t: Transaction[]) => void }) {
  const { store } = useApp();
  const [xmlIn, setXmlIn] = useState("");
  const [parsed, setParsed] = useState<Transaction[] | null>(null);
  const [parseErr, setParseErr] = useState("");

  const exportTally = () => {
    const txns = store.transactions ?? [];
    if (txns.length === 0) { toast.error("No transactions to export"); return; }
    const company = xmlEscape(store.firm?.name ?? "Headroom");
    const vouchers = txns.map(t => {
      const amt = Math.abs(t.amount);
      const isIn = t.amount >= 0;
      // In Tally, a receipt debits Bank/Cash and credits the party (negative DR).
      const partyLedger = xmlEscape(t.counterparty || t.description || "Suspense");
      const bankLedger = "Bank Account";
      const date = (t.date || "").replace(/-/g, "");
      const vtype = isIn ? "Receipt" : "Payment";
      return `      <VOUCHER VCHTYPE="${vtype}" ACTION="Create">
        <DATE>${date}</DATE>
        <VOUCHERTYPENAME>${vtype}</VOUCHERTYPENAME>
        <NARRATION>${xmlEscape(t.description || "")}</NARRATION>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${partyLedger}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${isIn ? "No" : "Yes"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${isIn ? amt : -amt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${bankLedger}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${isIn ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${isIn ? -amt : amt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>`;
    }).join("\n");
    const xml = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES><SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY></STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    downloadBlob(`tally-daybook-${new Date().toISOString().slice(0, 10)}.xml`, xml, "application/xml");
    toast.success(`Exported ${txns.length} vouchers to Tally XML`);
  };

  const parseTally = () => {
    setParseErr("");
    setParsed(null);
    if (!xmlIn.trim()) { setParseErr("Paste Tally voucher XML first."); return; }
    try {
      const doc = new DOMParser().parseFromString(xmlIn, "application/xml");
      if (doc.querySelector("parsererror")) throw new Error("malformed");
      const vouchers = Array.from(doc.getElementsByTagName("VOUCHER"));
      if (vouchers.length === 0) { setParseErr("No <VOUCHER> elements found."); return; }
      const acct = store.bankAccounts[0]?.id ?? "manual-import";
      const out: Transaction[] = vouchers.map((v, i) => {
        const date = v.getElementsByTagName("DATE")[0]?.textContent?.trim() ?? "";
        const iso = /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : toIsoDate(date);
        const narr = v.getElementsByTagName("NARRATION")[0]?.textContent?.trim() ?? "";
        const vtype = (v.getElementsByTagName("VOUCHERTYPENAME")[0]?.textContent ?? "").toLowerCase();
        const entries = Array.from(v.getElementsByTagName("ALLLEDGERENTRIES.LIST"));
        // Pick the party entry (first non-bank/cash ledger); fall back to first.
        const party = entries.find(e => {
          const ln = (e.getElementsByTagName("LEDGERNAME")[0]?.textContent ?? "").toLowerCase();
          return !ln.includes("bank") && !ln.includes("cash");
        }) ?? entries[0];
        const partyName = party?.getElementsByTagName("LEDGERNAME")[0]?.textContent?.trim() ?? "Tally voucher";
        const rawAmt = parseFloat(party?.getElementsByTagName("AMOUNT")[0]?.textContent ?? "0") || 0;
        // Receipt → money in (positive); Payment → out. Use voucher type when clear.
        let amount: number;
        if (vtype.includes("payment") || vtype.includes("purchase")) amount = -Math.abs(rawAmt);
        else if (vtype.includes("receipt") || vtype.includes("sales")) amount = Math.abs(rawAmt);
        else amount = rawAmt; // unknown voucher type - trust the sign as exported
        const category: Transaction["category"] = amount >= 0 ? "revenue" : "expense";
        return {
          id: `tally-${Date.now()}-${i}`,
          date: iso,
          amount,
          description: narr || partyName,
          category,
          counterparty: partyName,
          isRecurring: false,
          bankAccountId: acct,
        };
      });
      setParsed(out);
    } catch {
      setParseErr("Could not parse XML. Ensure it is a valid Tally <ENVELOPE>/<VOUCHER> export.");
    }
  };

  const commit = () => {
    if (!parsed || parsed.length === 0) return;
    onImport(parsed);
    toast.success(`Imported ${parsed.length} vouchers from Tally`);
    setXmlIn(""); setParsed(null);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <ArrowLeftRight size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Tally Import / Export Bridge</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Move the 6M-strong Tally base in and out without re-keying. Export your live transactions as a Tally-importable Daybook XML, or paste a Tally voucher export to bring it into Headroom.</p>
        <button onClick={exportTally} className={primaryBtn}>
          <Download size={13} /> Export {store.transactions?.length ?? 0} txns → Tally XML
        </button>
      </div>

      <div className={cardCls}>
        <p className="text-sm font-semibold mb-2">Import from Tally</p>
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste the contents of a Tally voucher export (<code className="text-[var(--color-primary)]">&lt;ENVELOPE&gt;…&lt;VOUCHER&gt;</code>). We map DATE, NARRATION, VOUCHERTYPENAME and ledger AMOUNTs to transactions.</p>
        <textarea value={xmlIn} onChange={e => setXmlIn(e.target.value)} spellCheck={false}
          placeholder="<ENVELOPE>...</ENVELOPE>" className={taCls} />
        {parseErr && <p className="text-xs text-red-400 mt-2">{parseErr}</p>}
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={parseTally} className={ghostBtn}><Columns3 size={13} /> Preview</button>
          <button disabled={!editable || !parsed || parsed.length === 0} onClick={commit} className={primaryBtn}>
            <Plus size={13} /> Import {parsed ? `${parsed.length} ` : ""}vouchers
          </button>
        </div>
      </div>

      {parsed && parsed.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Date", "Counterparty", "Description", "Amount"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.slice(0, 50).map(t => (
                <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2 tabular-nums">{t.date}</td>
                  <td className="px-4 py-2">{t.counterparty}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">{t.description}</td>
                  <td className={`px-4 py-2 tabular-nums ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {parsed.length > 50 && <p className="text-[10px] text-[var(--color-muted)] px-4 py-2">Showing first 50 of {parsed.length}.</p>}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">XML is generated and parsed entirely in your browser - nothing is uploaded. Verify ledger mapping in Tally after import.</p>
    </div>
  );
}

// ── #163 Excel / CSV Mapping Importer ──────────────────────────────────────────
// Paste any CSV, pick which column maps to each transaction field, preview, import.
type MapField = "date" | "amount" | "description" | "counterparty" | "ignore";
function CsvMapper({ editable, onImport, importAccountId }: { editable: boolean; onImport: (t: Transaction[]) => void; importAccountId: string }) {
  const [raw, setRaw] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [debitNeg, setDebitNeg] = useState(false);
  const [mapping, setMapping] = useState<Record<number, MapField>>({});

  const rows = useMemo(() => raw.split(/\r?\n/).filter(l => l.trim().length > 0).map(splitCsvLine), [raw]);
  const headerRow = rows[0] ?? [];
  const colCount = headerRow.length;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const built = useMemo<Transaction[]>(() => {
    if (dataRows.length === 0) return [];
    const find = (f: MapField) => Number(Object.keys(mapping).find(k => mapping[Number(k)] === f) ?? -1);
    const cd = find("date"), ca = find("amount"), cdesc = find("description"), ccp = find("counterparty");
    if (ca < 0) return [];
    return dataRows.map((r, i) => {
      let amt = parseFloat((r[ca] ?? "").replace(/[^0-9.\-]/g, "")) || 0;
      if (debitNeg && amt > 0) amt = -amt;
      const category: Transaction["category"] = amt >= 0 ? "revenue" : "expense";
      return {
        id: `map-${Date.now()}-${i}`,
        date: cd >= 0 ? toIsoDate(r[cd] ?? "") : new Date().toISOString().slice(0, 10),
        amount: amt,
        description: cdesc >= 0 ? (r[cdesc] ?? "") : "Imported row",
        category,
        counterparty: ccp >= 0 ? (r[ccp] ?? "") : "",
        isRecurring: false,
        bankAccountId: importAccountId,
      };
    });
  }, [dataRows, mapping, debitNeg, importAccountId]);

  const hasAmount = Object.values(mapping).includes("amount");
  const FIELDS: MapField[] = ["date", "amount", "description", "counterparty", "ignore"];

  const commit = () => {
    if (built.length === 0) { toast.error("Map an Amount column first"); return; }
    onImport(built);
    toast.success(`Imported ${built.length} rows`);
    setRaw(""); setMapping({});
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <Columns3 size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Excel / CSV Mapping Importer</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste any sheet (copy cells from Excel/Sheets - tabs or commas both work after a quick paste-as-CSV). Then tell us which column is which. No fixed template required.</p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false}
          placeholder={"Date,Particulars,Party,Amount\n01/06/2026,Client payment,Mehta Corp,250000\n03/06/2026,Office rent,Landlord,120000"}
          className={taCls} />
        <div className="flex flex-wrap gap-4 mt-3">
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} className="accent-[var(--color-primary)]" />
            First row is a header
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input type="checkbox" checked={debitNeg} onChange={e => setDebitNeg(e.target.checked)} className="accent-[var(--color-primary)]" />
            Treat all amounts as expenses (negate)
          </label>
        </div>
      </div>

      {colCount > 0 && (
        <div className={cardCls}>
          <p className="text-sm font-semibold mb-3">Map columns</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: colCount }).map((_, c) => (
              <div key={c}>
                <label className="text-xs text-[var(--color-muted)] block mb-1 truncate">
                  Col {c + 1}{hasHeader && headerRow[c] ? ` · "${headerRow[c]}"` : ""}
                </label>
                <select value={mapping[c] ?? "ignore"} onChange={e => setMapping(m => ({ ...m, [c]: e.target.value as MapField }))} className={inpCls}>
                  {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!hasAmount && <p className="text-xs text-orange-400 mt-3">Map one column to <b>amount</b> to enable import.</p>}
        </div>
      )}

      {built.length > 0 && (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Date", "Counterparty", "Description", "Amount"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {built.slice(0, 50).map(t => (
                  <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2 tabular-nums">{t.date}</td>
                    <td className="px-4 py-2">{t.counterparty || "-"}</td>
                    <td className="px-4 py-2 text-[var(--color-muted)]">{t.description}</td>
                    <td className={`px-4 py-2 tabular-nums ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {built.length > 50 && <p className="text-[10px] text-[var(--color-muted)] px-4 py-2">Showing first 50 of {built.length}.</p>}
          </div>
          <button disabled={!editable} onClick={commit} className={primaryBtn}>
            <Plus size={13} /> Import {built.length} rows
          </button>
        </>
      )}
    </div>
  );
}

// ── #164 Multi-Entity Consolidation ────────────────────────────────────────────
// Maintain a list of group entities (their FY revenue/expense/cash + ownership %),
// then produce a consolidated group P&L - including minority-interest elimination.
interface Entity { id: string; name: string; ownership: number; revenue: number; expense: number; cash: number; }
function MultiEntityConsolidation() {
  const { store } = useApp();
  const [entities, setEntities] = useFeatureState<Entity[]>("data-consolidation-entities", []);
  const [name, setName] = useState("");
  const [own, setOwn] = useState("100");
  const [rev, setRev] = useState("");
  const [exp, setExp] = useState("");
  const [cash, setCash] = useState("");
  const [intercoElim, setIntercoElim] = useState("");
  const [unrealisedProfit, setUnrealisedProfit] = useState("");

  const addCurrentFirm = () => {
    const txns = store.transactions ?? [];
    const r = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const e = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const c = (store.bankAccounts ?? []).reduce((s, b) => s + (b.balance || 0), 0);
    setEntities(prev => [...prev, { id: `ent-${Date.now()}`, name: store.firm?.name ?? "This entity", ownership: 100, revenue: Math.round(r), expense: Math.round(e), cash: Math.round(c) }]);
    toast.success("Added current entity from live data");
  };

  const add = () => {
    if (!name.trim()) { toast.error("Entity name required"); return; }
    setEntities(prev => [...prev, {
      id: `ent-${Date.now()}`, name: name.trim(),
      ownership: Math.min(100, Math.max(0, parseFloat(own) || 100)),
      revenue: parseFloat(rev) || 0, expense: parseFloat(exp) || 0, cash: parseFloat(cash) || 0,
    }]);
    setName(""); setOwn("100"); setRev(""); setExp(""); setCash("");
  };
  const remove = (id: string) => setEntities(prev => prev.filter(e => e.id !== id));

  // Intra-group turnover: one entity's sale is another's purchase at the SAME value,
  // so eliminating it from both turnover (revenue) and cost (expense) is PBT-neutral by
  // design - this only removes double-counting from the topline, never from profit.
  const elim = Math.max(0, parseFloat(intercoElim) || 0);
  // Unrealised profit on intra-group stock: margin on goods sold within the group that
  // remain unsold in closing inventory. This is the genuine PBT-reducing elimination -
  // we remove it from revenue (and NOT from expense) so group PBT actually falls.
  const urp = Math.max(0, parseFloat(unrealisedProfit) || 0);
  const gross = entities.reduce((a, e) => ({ revenue: a.revenue + e.revenue, expense: a.expense + e.expense, cash: a.cash + e.cash }), { revenue: 0, expense: 0, cash: 0 });
  const consRevenue = gross.revenue - elim - urp;
  const consExpense = gross.expense - elim;
  const consPbt = consRevenue - consExpense; // = gross PBT - urp (intra-group turnover cancels)
  // Minority interest on profit: sum each entity's PBT × (1 - ownership%).
  const minorityInterest = Math.round(entities.reduce((a, e) => a + (e.revenue - e.expense) * (1 - e.ownership / 100), 0));
  const ownersProfit = consPbt - minorityInterest;
  const fc = formatCurrency;

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Multi-Entity Consolidation</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Roll up subsidiaries and group companies into one consolidated P&amp;L. Enter each entity's FY figures and ownership %; we eliminate intra-group turnover, strip unrealised profit on intra-group stock, and split out minority interest.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2"><label className="text-xs text-[var(--color-muted)] block mb-1">Entity name</label><input value={name} onChange={e => setName(e.target.value)} className={inpCls} placeholder="Subsidiary Pvt Ltd" /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Owned %</label><input type="number" value={own} onChange={e => setOwn(e.target.value)} className={inpCls} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Revenue ₹</label><input type="number" value={rev} onChange={e => setRev(e.target.value)} className={inpCls} placeholder="0" /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Expense ₹</label><input type="number" value={exp} onChange={e => setExp(e.target.value)} className={inpCls} placeholder="0" /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cash ₹</label><input type="number" value={cash} onChange={e => setCash(e.target.value)} className={inpCls} placeholder="0" /></div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={add} className={primaryBtn}><Plus size={13} /> Add entity</button>
          <button onClick={addCurrentFirm} className={ghostBtn}><Sparkles size={13} /> Add this firm from live data</button>
        </div>
      </div>

      {entities.length > 0 && (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Entity", "Owned %", "Revenue", "Expense", "PBT", "Cash", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entities.map(e => (
                  <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{e.name}</td>
                    <td className="px-4 py-2.5 tabular-nums">{e.ownership}%</td>
                    <td className="px-4 py-2.5 tabular-nums">{fc(e.revenue)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fc(e.expense)}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${e.revenue - e.expense >= 0 ? "text-green-400" : "text-red-400"}`}>{fc(e.revenue - e.expense)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fc(e.cash)}</td>
                    <td className="px-4 py-2.5"><button onClick={() => remove(e.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={cardCls}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl mb-4">
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Intra-group turnover ₹ (sales between group entities)</label>
                <input type="number" value={intercoElim} onChange={e => setIntercoElim(e.target.value)} className={inpCls} placeholder="0" />
                <p className="text-[10px] text-[var(--color-muted)] mt-1">Removed from both revenue &amp; cost - PBT-neutral (no double-counting).</p>
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Unrealised profit on intra-group stock ₹</label>
                <input type="number" value={unrealisedProfit} onChange={e => setUnrealisedProfit(e.target.value)} className={inpCls} placeholder="0" />
                <p className="text-[10px] text-[var(--color-muted)] mt-1">Margin on intra-group goods still in closing inventory - reduces Group PBT.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Consolidated Revenue", value: fc(consRevenue), color: "text-[var(--color-primary)]" },
                { label: "Group PBT", value: fc(consPbt), color: consPbt >= 0 ? "text-green-400" : "text-red-400" },
                { label: "Minority Interest", value: fc(minorityInterest), color: "text-orange-400" },
                { label: "Owners' Profit", value: fc(ownersProfit), color: "text-green-400" },
              ].map(c => (
                <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                  <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Indicative consolidation (AS-21 style). Intra-group turnover nets off revenue &amp; cost equally (PBT-neutral, by design); only unrealised profit on intra-group stock reduces Group PBT. Intra-group balances are not auto-detected. Verify with your CA.</p>
    </div>
  );
}

// ── #165 Scheduled Backup & Export ─────────────────────────────────────────────
// Full-data JSON/CSV export now, plus a saved cadence + log of exports (durable).
interface BackupLog { id: string; at: string; format: "json" | "csv"; records: number; }
function ScheduledBackup() {
  const { store } = useApp();
  const [cadence, setCadence] = useFeatureState<"off" | "daily" | "weekly" | "monthly">("data-backup-cadence", "off");
  const [log, setLog] = useFeatureState<BackupLog[]>("data-backup-log", []);

  const recordCount =
    (store.transactions?.length ?? 0) + (store.invoices?.length ?? 0) +
    (store.bankAccounts?.length ?? 0) + (store.activeLoans?.length ?? 0) +
    (store.obligations?.length ?? 0);

  const due = useMemo(() => {
    if (cadence === "off") return null;
    const last = log[0]?.at;
    if (!last) return "Never backed up - run one now.";
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    const limit = cadence === "daily" ? 1 : cadence === "weekly" ? 7 : 30;
    return days >= limit ? `Backup overdue - last run ${days}d ago (${cadence}).` : `Up to date - next ${cadence} backup in ${limit - days}d.`;
  }, [cadence, log]);

  const exportJson = () => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      firm: store.firm,
      bankAccounts: store.bankAccounts,
      transactions: store.transactions,
      invoices: store.invoices,
      activeLoans: store.activeLoans,
      obligations: store.obligations,
      featureData: store.featureData ?? {},
    };
    downloadBlob(`headroom-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot, null, 2), "application/json");
    setLog(prev => [{ id: `bk-${Date.now()}`, at: new Date().toISOString(), format: "json" as const, records: recordCount }, ...prev].slice(0, 30));
    toast.success(`Backed up ${recordCount} records (JSON)`);
  };

  const exportCsv = () => {
    const txns = store.transactions ?? [];
    const header = "date,amount,description,counterparty,category,bankAccountId";
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const body = txns.map(t => [t.date, t.amount, esc(t.description || ""), esc(t.counterparty || ""), t.category, t.bankAccountId].join(",")).join("\n");
    downloadBlob(`headroom-transactions-${new Date().toISOString().slice(0, 10)}.csv`, `${header}\n${body}`, "text/csv");
    setLog(prev => [{ id: `bk-${Date.now()}`, at: new Date().toISOString(), format: "csv" as const, records: txns.length }, ...prev].slice(0, 30));
    toast.success(`Exported ${txns.length} transactions (CSV)`);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Scheduled Backup &amp; Export</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Keep a safe copy of everything. Take a full JSON snapshot or a transactions CSV now, and set a cadence reminder so you never lose data. {recordCount} records currently stored.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportJson} className={primaryBtn}><Download size={13} /> Full backup (JSON)</button>
          <button onClick={exportCsv} className={ghostBtn}><FileSpreadsheet size={13} /> Transactions (CSV)</button>
        </div>
      </div>

      <div className={cardCls}>
        <p className="text-sm font-semibold mb-3">Backup cadence</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {(["off", "daily", "weekly", "monthly"] as const).map(c => (
            <button key={c} onClick={() => setCadence(c)}
              className={`px-3 py-1.5 text-xs rounded font-medium capitalize ${cadence === c ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {c}
            </button>
          ))}
        </div>
        {due && (
          <div className={`rounded-lg p-3 text-xs flex items-center gap-2 border ${due.includes("overdue") || due.includes("Never") ? "border-orange-800/40 bg-orange-950/20 text-orange-400" : "border-green-800/40 bg-green-950/20 text-green-400"}`}>
            <Clock size={13} /> {due}
          </div>
        )}
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Cadence is a reminder - the actual export is a one-click manual run (browser-only, no server uploads).</p>
      </div>

      {log.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="px-4 py-3 border-b border-[var(--color-border)] text-sm font-semibold">Export history</div>
          <table className="w-full text-sm min-w-[360px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["When", "Format", "Records"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map(l => (
                <tr key={l.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5">{format(new Date(l.at), "dd MMM yyyy, HH:mm")}</td>
                  <td className="px-4 py-2.5 uppercase text-xs text-[var(--color-muted)]">{l.format}</td>
                  <td className="px-4 py-2.5 tabular-nums">{l.records}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #166 Data Quality Checker ──────────────────────────────────────────────────
// Scans live transactions for missing fields, blank dates, zero amounts, and
// likely duplicates; surfaces a health score + per-issue counts. Read-only.
function DataQualityChecker() {
  const { store } = useApp();
  const report = useMemo(() => {
    const txns = store.transactions ?? [];
    const total = txns.length;
    const missingDesc = txns.filter(t => !t.description?.trim()).length;
    const missingCp = txns.filter(t => !t.counterparty?.trim()).length;
    const blankDate = txns.filter(t => !t.date || isNaN(new Date(t.date).getTime())).length;
    const zeroAmt = txns.filter(t => !t.amount || t.amount === 0).length;
    const future = txns.filter(t => new Date(t.date).getTime() > Date.now()).length;
    const noBank = txns.filter(t => !t.bankAccountId?.trim()).length;
    // Duplicate signature: same date + amount + counterparty.
    const seen = new Map<string, number>();
    txns.forEach(t => {
      const k = `${t.date}|${t.amount}|${(t.counterparty || "").toLowerCase()}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    });
    const dupes = Array.from(seen.values()).filter(n => n > 1).reduce((a, n) => a + (n - 1), 0);
    const issues = missingDesc + missingCp + blankDate + zeroAmt + noBank + dupes;
    const score = total === 0 ? 100 : Math.max(0, Math.round(100 - (issues / total) * 100));
    return { total, missingDesc, missingCp, blankDate, zeroAmt, future, noBank, dupes, issues, score };
  }, [store.transactions]);

  const rows: { label: string; count: number; tone: string }[] = [
    { label: "Missing description", count: report.missingDesc, tone: "text-orange-400" },
    { label: "Missing counterparty", count: report.missingCp, tone: "text-orange-400" },
    { label: "Invalid / blank date", count: report.blankDate, tone: "text-red-400" },
    { label: "Zero amount", count: report.zeroAmt, tone: "text-red-400" },
    { label: "Future-dated", count: report.future, tone: "text-[var(--color-muted)]" },
    { label: "No bank account linked", count: report.noBank, tone: "text-orange-400" },
    { label: "Likely duplicates", count: report.dupes, tone: "text-red-400" },
  ];
  const scoreTone = report.score >= 90 ? "text-green-400" : report.score >= 70 ? "text-orange-400" : "text-red-400";

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Data Quality Checker</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">A quick health scan of your {report.total} transactions before you file or forecast. Fix anything flagged in red on the Transactions page.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Health score</p>
            <p className={`text-2xl font-bold tabular-nums ${scoreTone}`}>{report.score}%</p>
          </div>
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Total rows</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--color-primary)]">{report.total}</p>
          </div>
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Total issues</p>
            <p className="text-2xl font-bold tabular-nums text-orange-400">{report.issues}</p>
          </div>
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Clean rows</p>
            <p className="text-2xl font-bold tabular-nums text-green-400">{Math.max(0, report.total - report.issues)}</p>
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[320px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Check", "Affected rows", "Status"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5">{r.label}</td>
                <td className={`px-4 py-2.5 tabular-nums ${r.count > 0 ? r.tone : ""}`}>{r.count}</td>
                <td className="px-4 py-2.5">{r.count === 0
                  ? <span className="text-green-400 text-xs">OK</span>
                  : <span className={`text-xs ${r.tone}`}>Review</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Duplicates are flagged on matching date + amount + counterparty. Use the Dedupe tool to remove them.</p>
    </div>
  );
}

// ── #167 Transaction Dedupe ────────────────────────────────────────────────────
// Detects duplicate transactions (same date + amount + counterparty) and removes
// all but the first occurrence of each group from the store.
function TransactionDedupe({ editable }: { editable: boolean }) {
  const { store, setStore } = useApp();
  const groups = useMemo(() => {
    const txns = store.transactions ?? [];
    const map = new Map<string, Transaction[]>();
    txns.forEach(t => {
      const k = `${t.date}|${t.amount}|${(t.counterparty || "").toLowerCase()}|${(t.description || "").toLowerCase()}`;
      const arr = map.get(k) ?? [];
      arr.push(t);
      map.set(k, arr);
    });
    return Array.from(map.values()).filter(g => g.length > 1);
  }, [store.transactions]);

  const removable = groups.reduce((a, g) => a + (g.length - 1), 0);

  const dedupe = () => {
    if (removable === 0) { toast.error("No duplicates found"); return; }
    if (!window.confirm(`Remove ${removable} duplicate transaction(s)? The first of each group is kept.`)) return;
    setStore(s => {
      const seen = new Set<string>();
      const kept = (s.transactions ?? []).filter(t => {
        const k = `${t.date}|${t.amount}|${(t.counterparty || "").toLowerCase()}|${(t.description || "").toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { ...s, transactions: kept };
    });
    toast.success(`Removed ${removable} duplicate transaction(s)`);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <Copy size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Transaction Dedupe</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Re-importing a bank statement often double-books rows. We group transactions with the same date, amount, counterparty and description, then keep one of each. Found {groups.length} duplicate group(s) covering {removable} removable row(s).</p>
        <button disabled={!editable || removable === 0} onClick={dedupe} className={primaryBtn}>
          <Trash2 size={13} /> Remove {removable} duplicate{removable === 1 ? "" : "s"}
        </button>
      </div>

      {groups.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Date", "Counterparty", "Description", "Amount", "Copies"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.slice(0, 50).map(g => (
                <tr key={g[0].id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2 tabular-nums">{g[0].date}</td>
                  <td className="px-4 py-2">{g[0].counterparty || "-"}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">{g[0].description || "-"}</td>
                  <td className={`px-4 py-2 tabular-nums ${g[0].amount >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(g[0].amount)}</td>
                  <td className="px-4 py-2 tabular-nums text-orange-400">×{g.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {groups.length > 50 && <p className="text-[10px] text-[var(--color-muted)] px-4 py-2">Showing first 50 of {groups.length} groups.</p>}
        </div>
      )}
    </div>
  );
}

// ── #168 Bulk Find & Replace ───────────────────────────────────────────────────
// Find a string in transaction description or counterparty and replace it across
// all matching rows in one pass. Case-insensitive match, preview count first.
function BulkFindReplace({ editable }: { editable: boolean }) {
  const { store, setStore } = useApp();
  const [field, setField] = useState<"counterparty" | "description">("counterparty");
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [whole, setWhole] = useState(false);

  const matches = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return [];
    return (store.transactions ?? []).filter(t => {
      const v = (t[field] || "").toLowerCase();
      return whole ? v === q : v.includes(q);
    });
  }, [store.transactions, field, find, whole]);

  const apply = () => {
    if (!find.trim()) { toast.error("Enter text to find"); return; }
    if (matches.length === 0) { toast.error("No matching rows"); return; }
    if (!window.confirm(`Replace "${find}" in ${matches.length} transaction(s)' ${field}?`)) return;
    const q = find.trim();
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    setStore(s => ({
      ...s,
      transactions: (s.transactions ?? []).map(t => {
        const v = t[field] || "";
        if (whole) {
          if (v.toLowerCase() !== q.toLowerCase()) return t;
          return { ...t, [field]: repl };
        }
        if (!v.toLowerCase().includes(q.toLowerCase())) return t;
        return { ...t, [field]: v.replace(re, repl) };
      }),
    }));
    toast.success(`Updated ${matches.length} transaction(s)`);
    setFind(""); setRepl("");
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <Replace size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Bulk Find &amp; Replace</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Standardise messy bank narrations - e.g. rename every "MEHTA CORP LTD" to "Mehta Corp" across all transactions at once. Match is case-insensitive.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Field</label>
            <select value={field} onChange={e => setField(e.target.value as "counterparty" | "description")} className={inpCls}>
              <option value="counterparty">Counterparty</option>
              <option value="description">Description</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Find</label>
            <input value={find} onChange={e => setFind(e.target.value)} className={inpCls} placeholder="MEHTA CORP LTD" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Replace with</label>
            <input value={repl} onChange={e => setRepl(e.target.value)} className={inpCls} placeholder="Mehta Corp" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-xs mt-3">
          <input type="checkbox" checked={whole} onChange={e => setWhole(e.target.checked)} className="accent-[var(--color-primary)]" />
          Match whole value only (replace entire field)
        </label>
        <div className="flex items-center gap-3 mt-4">
          <button disabled={!editable || matches.length === 0} onClick={apply} className={primaryBtn}>
            <Search size={13} /> Replace in {matches.length} row{matches.length === 1 ? "" : "s"}
          </button>
          {find.trim() && <span className="text-xs text-[var(--color-muted)]">{matches.length} match{matches.length === 1 ? "" : "es"} found</span>}
        </div>
      </div>

      {matches.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Date", "Current value", "Amount"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matches.slice(0, 50).map(t => (
                <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2 tabular-nums">{t.date}</td>
                  <td className="px-4 py-2">{t[field] || "-"}</td>
                  <td className={`px-4 py-2 tabular-nums ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {matches.length > 50 && <p className="text-[10px] text-[var(--color-muted)] px-4 py-2">Showing first 50 of {matches.length}.</p>}
        </div>
      )}
    </div>
  );
}

// ── #169 Mapping Template Store ────────────────────────────────────────────────
// Save reusable column-mapping presets (durable) for recurring bank/ERP CSV
// layouts, and export/import them as JSON to share between users.
interface MapTemplate { id: string; name: string; columns: string; createdAt: string; }
function MappingTemplateStore() {
  const [templates, setTemplates] = useFeatureState<MapTemplate[]>("data-mapping-templates", []);
  const [name, setName] = useState("");
  const [cols, setCols] = useState("");

  const save = () => {
    if (!name.trim()) { toast.error("Template name required"); return; }
    if (!cols.trim()) { toast.error("Describe the column order"); return; }
    setTemplates(prev => [{ id: `tpl-${Date.now()}`, name: name.trim(), columns: cols.trim(), createdAt: new Date().toISOString() }, ...prev]);
    toast.success(`Saved template "${name.trim()}"`);
    setName(""); setCols("");
  };
  const remove = (id: string) => setTemplates(prev => prev.filter(t => t.id !== id));
  const exportAll = () => {
    if (templates.length === 0) { toast.error("No templates to export"); return; }
    downloadBlob("mapping-templates.json", JSON.stringify(templates, null, 2), "application/json");
    toast.success(`Exported ${templates.length} template(s)`);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <Bookmark size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Mapping Templates</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Your HDFC, ICICI or Tally export always uses the same column order. Save that layout once so you (or your CA) can re-apply it on every import instead of re-mapping by hand.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Template name</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inpCls} placeholder="HDFC current account" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Column order (comma-separated)</label>
            <input value={cols} onChange={e => setCols(e.target.value)} className={inpCls} placeholder="date, description, counterparty, amount" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={save} className={primaryBtn}><Plus size={13} /> Save template</button>
          <button onClick={exportAll} className={ghostBtn}><Download size={13} /> Export all (JSON)</button>
        </div>
      </div>

      {templates.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Name", "Column order", "Saved", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{t.name}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)] font-mono text-xs">{t.columns}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{format(new Date(t.createdAt), "dd MMM yyyy")}</td>
                  <td className="px-4 py-2.5"><button onClick={() => remove(t.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #170 Filing Templates ──────────────────────────────────────────────────────
// One-click download of correctly-formatted CSV templates for common Indian
// filings/imports (GSTR-1, opening balances, fixed-asset register, vendor master).
function FilingTemplates() {
  const TEMPLATES: { id: string; name: string; desc: string; file: string; content: string }[] = [
    {
      id: "gstr1", name: "GSTR-1 (B2B outward supplies)",
      desc: "Outward B2B invoices for monthly GST return - GSTIN, invoice no, taxable value and rate.",
      file: "gstr1-b2b-template.csv",
      content: "gstin,invoice_no,invoice_date,invoice_value,taxable_value,rate,igst,cgst,sgst\n27ABCDE1234F1Z5,INV-001,01/06/2026,295000,250000,18,0,22500,22500\n",
    },
    {
      id: "opening", name: "Opening balances",
      desc: "Ledger opening balances to seed a new financial year - account, debit and credit.",
      file: "opening-balances-template.csv",
      content: "ledger,opening_debit,opening_credit\nCash,50000,0\nBank,1200000,0\nSundry Creditors,0,340000\n",
    },
    {
      id: "fixed-assets", name: "Fixed-asset register",
      desc: "Asset master for depreciation - name, category, purchase date, cost and rate.",
      file: "fixed-asset-register-template.csv",
      content: "asset,category,purchase_date,cost,depreciation_rate\nLaptops,Computers,01/04/2026,450000,40\nOffice furniture,Furniture,01/04/2026,180000,10\n",
    },
    {
      id: "vendor-master", name: "Vendor / counterparty master",
      desc: "Bulk-load suppliers and customers - name, GSTIN, PAN and payment terms.",
      file: "vendor-master-template.csv",
      content: "name,gstin,pan,payment_terms_days,category\nMehta Corp,27ABCDE1234F1Z5,ABCDE1234F,30,Customer\nLandlord,,XYZAB6789K,0,Vendor\n",
    },
  ];

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <FileDown size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Filing &amp; Import Templates</p>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Start from a correctly-structured CSV for the filings and bulk-loads SMBs do most often. Fill in Excel, save as CSV, then bring it back via the CSV Mapper.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TEMPLATES.map(t => (
          <div key={t.id} className={cardCls}>
            <p className="text-sm font-semibold mb-1">{t.name}</p>
            <p className="text-xs text-[var(--color-muted)] mb-4">{t.desc}</p>
            <button onClick={() => { downloadBlob(t.file, t.content, "text/csv"); toast.success(`Downloaded ${t.file}`); }} className={ghostBtn}>
              <Download size={13} /> Download CSV
            </button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Templates are indicative formats - confirm exact column requirements with the GST portal or your accounting software before filing.</p>
    </div>
  );
}

// ── #171 Archive & Purge ───────────────────────────────────────────────────────
// Download a CSV of transactions older than a chosen FY cut-off, then optionally
// purge them from the store to keep the working set lean.
function ArchivePurge({ editable }: { editable: boolean }) {
  const { store, setStore } = useApp();
  const [cutoff, setCutoff] = useState("2024-04-01");

  const { older, newer } = useMemo(() => {
    const t = new Date(cutoff).getTime();
    const txns = store.transactions ?? [];
    const older = txns.filter(x => new Date(x.date).getTime() < t);
    return { older, newer: txns.length - older.length };
  }, [store.transactions, cutoff]);

  const oldValue = older.reduce((a, t) => a + Math.abs(t.amount), 0);

  const archive = () => {
    if (older.length === 0) { toast.error("Nothing older than the cut-off"); return; }
    const header = "date,amount,description,counterparty,category,bankAccountId";
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const body = older.map(t => [t.date, t.amount, esc(t.description || ""), esc(t.counterparty || ""), t.category, t.bankAccountId].join(",")).join("\n");
    downloadBlob(`archive-before-${cutoff}.csv`, `${header}\n${body}`, "text/csv");
    toast.success(`Archived ${older.length} transaction(s) to CSV`);
  };

  const purge = () => {
    if (older.length === 0) { toast.error("Nothing older than the cut-off"); return; }
    if (!window.confirm(`Permanently remove ${older.length} transaction(s) dated before ${cutoff}? Download the archive first - this cannot be undone.`)) return;
    const t = new Date(cutoff).getTime();
    setStore(s => ({ ...s, transactions: (s.transactions ?? []).filter(x => new Date(x.date).getTime() >= t) }));
    toast.success(`Purged ${older.length} old transaction(s)`);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <Archive size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Archive &amp; Purge Old Data</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Years of stale transactions slow down charts and reports. Pick a cut-off, download everything older as a CSV archive, then purge it from the working set. Statutory records should be kept 8 years - store the archive safely.</p>
        <div className="max-w-xs mb-4">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Cut-off date (remove transactions before)</label>
          <input type="date" value={cutoff} onChange={e => setCutoff(e.target.value)} className={inpCls} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Older than cut-off</p>
            <p className="text-xl font-bold tabular-nums text-orange-400">{older.length}</p>
          </div>
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Kept</p>
            <p className="text-xl font-bold tabular-nums text-green-400">{newer}</p>
          </div>
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Archived value</p>
            <p className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(oldValue)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={older.length === 0} onClick={archive} className={primaryBtn}><Download size={13} /> Download archive CSV</button>
          <button disabled={!editable || older.length === 0} onClick={purge} className={ghostBtn}><Trash2 size={13} /> Purge {older.length} old row{older.length === 1 ? "" : "s"}</button>
        </div>
      </div>
    </div>
  );
}

// ── #172 Column Statistics Profiler ────────────────────────────────────────────
// Paste any CSV; for each column it reports fill rate, distinct values, and (for
// numeric columns) count/sum/mean/min/max/median. Read-only, browser-only.
interface ColProfile {
  name: string; index: number; filled: number; total: number; distinct: number;
  numeric: boolean; count: number; sum: number; mean: number; min: number; max: number; median: number;
}
function ColumnProfiler() {
  const [raw, setRaw] = useState("");
  const [hasHeader, setHasHeader] = useState(true);

  const rows = useMemo(() => raw.split(/\r?\n/).filter(l => l.trim().length > 0).map(splitCsvLine), [raw]);
  const headerRow = rows[0] ?? [];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);

  const profiles = useMemo<ColProfile[]>(() => {
    if (dataRows.length === 0) return [];
    const out: ColProfile[] = [];
    for (let c = 0; c < colCount; c++) {
      const cells = dataRows.map(r => (r[c] ?? "").trim());
      const filledCells = cells.filter(v => v.length > 0);
      const nums: number[] = [];
      filledCells.forEach(v => {
        const n = parseFloat(v.replace(/[₹,\s]/g, ""));
        if (!isNaN(n) && /^-?[₹,\d.\s]+$/.test(v)) nums.push(n);
      });
      const numeric = filledCells.length > 0 && nums.length >= filledCells.length * 0.8;
      const sorted = nums.slice().sort((a, b) => a - b);
      const sum = nums.reduce((a, n) => a + n, 0);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length === 0 ? 0 : sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      out.push({
        name: hasHeader && headerRow[c] ? headerRow[c] : `Col ${c + 1}`,
        index: c, filled: filledCells.length, total: dataRows.length,
        distinct: new Set(filledCells.map(v => v.toLowerCase())).size,
        numeric, count: nums.length, sum,
        mean: nums.length ? sum / nums.length : 0,
        min: sorted.length ? sorted[0] : 0,
        max: sorted.length ? sorted[sorted.length - 1] : 0,
        median,
      });
    }
    return out;
  }, [dataRows, colCount, hasHeader, headerRow]);

  const num = (n: number) => Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Column Statistics Profiler</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste any sheet to instantly understand it - see how complete each column is, how many distinct values it holds, and full stats (sum, mean, median, range) for numeric columns. Nothing is uploaded.</p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false}
          placeholder={"date,party,amount\n01/06/2026,Mehta Corp,250000\n03/06/2026,Landlord,120000"}
          className={taCls} />
        <label className="flex items-center gap-2 cursor-pointer text-xs mt-3">
          <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} className="accent-[var(--color-primary)]" />
          First row is a header
        </label>
      </div>

      {profiles.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="px-4 py-3 border-b border-[var(--color-border)] text-sm font-semibold">{dataRows.length} rows · {profiles.length} columns</div>
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Column", "Fill rate", "Distinct", "Type", "Sum", "Mean", "Median", "Min", "Max"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => {
                const pct = p.total === 0 ? 0 : Math.round((p.filled / p.total) * 100);
                return (
                  <tr key={p.index} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${pct < 100 ? "text-orange-400" : "text-green-400"}`}>{pct}%</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.distinct}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{p.numeric ? "Numeric" : "Text"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.numeric ? num(p.sum) : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.numeric ? num(p.mean) : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.numeric ? num(p.median) : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.numeric ? num(p.min) : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.numeric ? num(p.max) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A column is treated as numeric when ≥80% of its filled cells parse as numbers (₹ and thousands separators are stripped).</p>
    </div>
  );
}

// ── #173 CSV ↔ JSON Converter ──────────────────────────────────────────────────
// Two-way: paste CSV → download an array of objects as JSON; or paste a JSON
// array of objects → download a flattened CSV. All in-browser via Blob.
function CsvJsonConverter() {
  const [mode, setMode] = useState<"csv2json" | "json2csv">("csv2json");
  const [raw, setRaw] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");

  const convert = () => {
    setErr(""); setOut("");
    if (!raw.trim()) { setErr("Paste some data first."); return; }
    try {
      if (mode === "csv2json") {
        const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) { setErr("Need a header row plus at least one data row."); return; }
        const headers = splitCsvLine(lines[0]);
        const records = lines.slice(1).map(line => {
          const cells = splitCsvLine(line);
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h || `col${i + 1}`] = cells[i] ?? ""; });
          return obj;
        });
        setOut(JSON.stringify(records, null, 2));
      } else {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) { setErr("JSON must be an array of objects."); return; }
        const objs = parsed.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null && !Array.isArray(r));
        if (objs.length === 0) { setErr("No objects found in the array."); return; }
        const keys: string[] = [];
        objs.forEach(o => Object.keys(o).forEach(k => { if (!keys.includes(k)) keys.push(k); }));
        const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        const body = objs.map(o => keys.map(k => {
          const val = o[k];
          return esc(val === undefined || val === null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val));
        }).join(",")).join("\n");
        setOut(`${keys.map(esc).join(",")}\n${body}`);
      }
    } catch {
      setErr(mode === "csv2json" ? "Could not parse the CSV." : "Invalid JSON - check the syntax.");
    }
  };

  const download = () => {
    if (!out) return;
    if (mode === "csv2json") downloadBlob("converted.json", out, "application/json");
    else downloadBlob("converted.csv", out, "text/csv");
    toast.success("Downloaded converted file");
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <Braces size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">CSV ↔ JSON Converter</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Move data between spreadsheets and APIs. Convert a pasted CSV into a clean JSON array of objects, or a JSON array back into a flat CSV - everything happens in your browser.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {(["csv2json", "json2csv"] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setOut(""); setErr(""); }}
              className={`px-3 py-1.5 text-xs rounded font-medium ${mode === m ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {m === "csv2json" ? "CSV → JSON" : "JSON → CSV"}
            </button>
          ))}
        </div>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false}
          placeholder={mode === "csv2json" ? "date,party,amount\n01/06/2026,Mehta Corp,250000" : '[{"date":"01/06/2026","party":"Mehta Corp","amount":250000}]'}
          className={taCls} />
        {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={convert} className={primaryBtn}><ArrowLeftRight size={13} /> Convert</button>
          <button disabled={!out} onClick={download} className={ghostBtn}><Download size={13} /> Download {mode === "csv2json" ? "JSON" : "CSV"}</button>
        </div>
      </div>

      {out && (
        <div className={cardCls}>
          <p className="text-sm font-semibold mb-2">Output</p>
          <textarea readOnly value={out} spellCheck={false} className={taCls} />
        </div>
      )}
    </div>
  );
}

// ── #174 Number & Currency Cleanup ─────────────────────────────────────────────
// Paste a column of messy amounts (₹, commas, lakh/cr suffixes, brackets for
// negatives, trailing CR/DR) and get clean numbers back, with a running total.
function NumberCleanup() {
  const [raw, setRaw] = useState("");

  const parseAmount = (line: string): number | null => {
    let s = line.trim();
    if (!s) return null;
    let sign = 1;
    if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
    if (/(^|\s)dr$/i.test(s) || /-$/.test(s)) sign = -1;
    if (/(^|\s)cr$/i.test(s)) sign = 1;
    s = s.replace(/(cr|dr)$/i, "").trim();
    let mult = 1;
    if (/(lakh|lac|l)$/i.test(s)) { mult = 100000; s = s.replace(/(lakh|lac|l)$/i, "").trim(); }
    else if (/(cr|crore)$/i.test(s)) { mult = 10000000; s = s.replace(/(cr|crore)$/i, "").trim(); }
    else if (/k$/i.test(s)) { mult = 1000; s = s.replace(/k$/i, "").trim(); }
    const cleaned = s.replace(/[₹$,\s]/g, "");
    if (cleaned === "" || cleaned === "-") return null;
    const n = parseFloat(cleaned);
    if (isNaN(n)) return null;
    return sign * n * mult;
  };

  const result = useMemo(() => {
    const lines = raw.split(/\r?\n/);
    const rows = lines.map(l => ({ input: l, value: l.trim() ? parseAmount(l) : null }))
      .filter(r => r.input.trim().length > 0);
    const ok = rows.filter(r => r.value !== null);
    const total = ok.reduce((a, r) => a + (r.value ?? 0), 0);
    return { rows, parsed: ok.length, failed: rows.length - ok.length, total };
  }, [raw]);

  const downloadClean = () => {
    if (result.parsed === 0) { toast.error("Nothing to export"); return; }
    const body = result.rows.map(r => `${(r.input).replace(/[",\n]/g, " ").trim()},${r.value ?? ""}`).join("\n");
    downloadBlob("cleaned-amounts.csv", `original,cleaned\n${body}`, "text/csv");
    toast.success(`Exported ${result.parsed} cleaned amount(s)`);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <Coins size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Number &amp; Currency Cleanup</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste a column of messy amounts - "₹2,50,000", "1.5 lakh", "(12,000)", "45000 Cr" - and get clean signed numbers plus a running total. Handles ₹/$ symbols, separators, brackets, CR/DR and lakh/crore suffixes.</p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false}
          placeholder={"₹2,50,000\n1.5 lakh\n(12,000)\n45000 Cr\n3.2 cr"}
          className={taCls} />
      </div>

      {result.rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Parsed", value: String(result.parsed), color: "text-green-400" },
              { label: "Unparseable", value: String(result.failed), color: result.failed ? "text-red-400" : "text-[var(--color-muted)]" },
              { label: "Total", value: formatCurrency(result.total), color: "text-[var(--color-primary)]" },
              { label: "Rows", value: String(result.rows.length), color: "text-[var(--color-muted)]" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Original", "Cleaned", "Status"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{r.input.trim()}</td>
                    <td className={`px-4 py-2 tabular-nums ${r.value !== null && r.value < 0 ? "text-red-400" : ""}`}>{r.value !== null ? r.value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "-"}</td>
                    <td className="px-4 py-2">{r.value !== null ? <span className="text-green-400 text-xs">OK</span> : <span className="text-red-400 text-xs">Skipped</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.rows.length > 100 && <p className="text-[10px] text-[var(--color-muted)] px-4 py-2">Showing first 100 of {result.rows.length}.</p>}
          </div>
          <button onClick={downloadClean} className={primaryBtn}><Download size={13} /> Download cleaned CSV</button>
        </>
      )}
    </div>
  );
}

// ── #175 GSTIN Bulk Validator ──────────────────────────────────────────────────
// Paste a list of GSTINs (one per line); validates the 15-char format, the state
// code, PAN segment and the final checksum digit. Exports a pass/fail report.
const GST_STATES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};
function gstinChecksum(gstin: string): boolean {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = chars.indexOf(gstin[i]);
    if (v < 0) return false;
    const factor = i % 2 === 0 ? 1 : 2;
    const prod = v * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const checkVal = (36 - (sum % 36)) % 36;
  return chars[checkVal] === gstin[14];
}
interface GstinResult { gstin: string; valid: boolean; state: string; reason: string; }
function GstinValidator() {
  const [raw, setRaw] = useState("");

  const results = useMemo<GstinResult[]>(() => {
    const lines = raw.split(/\r?\n/).map(l => l.trim().toUpperCase()).filter(l => l.length > 0);
    const fmt = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
    return lines.map(g => {
      const state = GST_STATES[g.slice(0, 2)] ?? "";
      if (g.length !== 15) return { gstin: g, valid: false, state, reason: `Length ${g.length}, expected 15` };
      if (!fmt.test(g)) return { gstin: g, valid: false, state, reason: "Bad format" };
      if (!state) return { gstin: g, valid: false, state: "", reason: `Unknown state code ${g.slice(0, 2)}` };
      if (!gstinChecksum(g)) return { gstin: g, valid: false, state, reason: "Checksum failed" };
      return { gstin: g, valid: true, state, reason: "Valid" };
    });
  }, [raw]);

  const validCount = results.filter(r => r.valid).length;

  const downloadReport = () => {
    if (results.length === 0) { toast.error("Nothing to export"); return; }
    const body = results.map(r => [r.gstin, r.valid ? "VALID" : "INVALID", r.state, r.reason].join(",")).join("\n");
    downloadBlob("gstin-validation.csv", `gstin,status,state,reason\n${body}`, "text/csv");
    toast.success(`Exported ${results.length} result(s)`);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <BadgeCheck size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">GSTIN Bulk Validator</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste a list of GSTINs (one per line) to validate before you file. We check the 15-character structure, the state code, the embedded PAN and the official checksum digit - offline, no portal call.</p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false}
          placeholder={"27ABCDE1234F1Z5\n29AABCU9603R1ZM\n07AAAC...."}
          className={taCls} />
      </div>

      {results.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Valid", value: String(validCount), color: "text-green-400" },
              { label: "Invalid", value: String(results.length - validCount), color: results.length - validCount ? "text-red-400" : "text-[var(--color-muted)]" },
              { label: "Checked", value: String(results.length), color: "text-[var(--color-primary)]" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["GSTIN", "Status", "State", "Note"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{r.gstin}</td>
                    <td className="px-4 py-2">{r.valid ? <span className="text-green-400 text-xs">Valid</span> : <span className="text-red-400 text-xs">Invalid</span>}</td>
                    <td className="px-4 py-2 text-[var(--color-muted)]">{r.state || "-"}</td>
                    <td className="px-4 py-2 text-xs text-[var(--color-muted)]">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length > 100 && <p className="text-[10px] text-[var(--color-muted)] px-4 py-2">Showing first 100 of {results.length}.</p>}
          </div>
          <button onClick={downloadReport} className={primaryBtn}><Download size={13} /> Download report CSV</button>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Structural + checksum validation only - it does not confirm the GSTIN is active/registered on the GST portal.</p>
    </div>
  );
}

// ── #176 Pivot / Summary Builder ───────────────────────────────────────────────
// Paste a CSV, choose a group-by column and a numeric value column, and get a
// grouped summary (sum, count, average) plus a downloadable pivot CSV.
function PivotBuilder() {
  const [raw, setRaw] = useState("");
  const [groupCol, setGroupCol] = useState(0);
  const [valueCol, setValueCol] = useState(-1);

  const rows = useMemo(() => raw.split(/\r?\n/).filter(l => l.trim().length > 0).map(splitCsvLine), [raw]);
  const headerRow = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const colCount = headerRow.length;

  const pivot = useMemo(() => {
    if (dataRows.length === 0 || valueCol < 0) return [];
    const map = new Map<string, { sum: number; count: number }>();
    dataRows.forEach(r => {
      const key = (r[groupCol] ?? "").trim() || "(blank)";
      const n = parseFloat((r[valueCol] ?? "").replace(/[₹,\s]/g, "")) || 0;
      const cur = map.get(key) ?? { sum: 0, count: 0 };
      cur.sum += n; cur.count += 1;
      map.set(key, cur);
    });
    return Array.from(map.entries())
      .map(([group, v]) => ({ group, sum: v.sum, count: v.count, avg: v.count ? v.sum / v.count : 0 }))
      .sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));
  }, [dataRows, groupCol, valueCol]);

  const grandTotal = pivot.reduce((a, p) => a + p.sum, 0);

  const downloadPivot = () => {
    if (pivot.length === 0) { toast.error("Build a pivot first"); return; }
    const gName = headerRow[groupCol] || `col${groupCol + 1}`;
    const vName = headerRow[valueCol] || `col${valueCol + 1}`;
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const body = pivot.map(p => [esc(p.group), p.sum, p.count, p.avg.toFixed(2)].join(",")).join("\n");
    downloadBlob("pivot-summary.csv", `${esc(gName)},sum_${esc(vName)},count,average\n${body}`, "text/csv");
    toast.success(`Exported ${pivot.length} group(s)`);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <Table2 size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Pivot / Summary Builder</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste a CSV with a header row, pick a column to group by and a numeric column to total, and get an instant pivot - sum, count and average per group - ready to download. Great for spend-by-vendor or revenue-by-month.</p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false}
          placeholder={"date,party,category,amount\n01/06/2026,Mehta Corp,Sales,250000\n03/06/2026,Landlord,Rent,120000"}
          className={taCls} />
        {colCount > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Group by</label>
              <select value={groupCol} onChange={e => setGroupCol(Number(e.target.value))} className={inpCls}>
                {headerRow.map((h, i) => <option key={i} value={i}>{h || `Col ${i + 1}`}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Sum / average column (numeric)</label>
              <select value={valueCol} onChange={e => setValueCol(Number(e.target.value))} className={inpCls}>
                <option value={-1}>- select -</option>
                {headerRow.map((h, i) => <option key={i} value={i}>{h || `Col ${i + 1}`}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {pivot.length > 0 && (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <div className="px-4 py-3 border-b border-[var(--color-border)] text-sm font-semibold">{pivot.length} group(s) · total {formatCurrency(grandTotal)}</div>
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Group", "Sum", "Count", "Average"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pivot.slice(0, 100).map((p, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{p.group}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${p.sum < 0 ? "text-red-400" : ""}`}>{formatCurrency(p.sum)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.count}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(p.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pivot.length > 100 && <p className="text-[10px] text-[var(--color-muted)] px-4 py-2">Showing first 100 of {pivot.length} groups.</p>}
          </div>
          <button onClick={downloadPivot} className={primaryBtn}><Download size={13} /> Download pivot CSV</button>
        </>
      )}
    </div>
  );
}

// ── #178 Bank Statement Parser ─────────────────────────────────────────────────
// Paste a free-text/columnar bank statement (Debit/Credit columns or signed
// amount). We sniff the layout per line, build transactions and let you import.
function StatementParser({ editable, onImport, importAccountId }: { editable: boolean; onImport: (t: Transaction[]) => void; importAccountId: string }) {
  const [raw, setRaw] = useState("");

  const parsed = useMemo<Transaction[]>(() => {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const out: Transaction[] = [];
    lines.forEach((line, i) => {
      // Need a leading date token to treat the line as a statement row.
      const dm = line.match(/^(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})/);
      if (!dm) return;
      const iso = toIsoDate(dm[1]);
      const rest = line.slice(dm[1].length).trim();
      // Collect all money-looking numbers on the line (commas allowed).
      const nums = (rest.match(/-?\d[\d,]*\.?\d{0,2}/g) ?? []).map(n => parseFloat(n.replace(/,/g, ""))).filter(n => !isNaN(n));
      if (nums.length === 0) return;
      const lower = rest.toLowerCase();
      const isDebit = /\b(dr|debit|withdrawal|paid|wd)\b/.test(lower);
      const isCredit = /\b(cr|credit|deposit|received|recd)\b/.test(lower);
      // Amount = the largest-magnitude number (drop a trailing running balance heuristically when 3+ numbers).
      const candidates = nums.length >= 3 ? nums.slice(0, nums.length - 1) : nums;
      let amt = candidates.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, candidates[0] ?? 0);
      if (isDebit) amt = -Math.abs(amt);
      else if (isCredit) amt = Math.abs(amt);
      const desc = rest.replace(/-?\d[\d,]*\.?\d{0,2}/g, "").replace(/\b(dr|cr|debit|credit|withdrawal|deposit)\b/gi, "").replace(/\s+/g, " ").trim();
      const category: Transaction["category"] = amt >= 0 ? "revenue" : "expense";
      out.push({
        id: `stmt-${Date.now()}-${i}`,
        date: iso,
        amount: amt,
        description: desc || "Statement row",
        category,
        counterparty: desc.split(/\s{2,}|,/)[0]?.slice(0, 40) ?? "",
        isRecurring: false,
        bankAccountId: importAccountId,
      });
    });
    return out;
  }, [raw, importAccountId]);

  const credits = parsed.filter(t => t.amount >= 0).reduce((s, t) => s + t.amount, 0);
  const debits = parsed.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const commit = () => {
    if (parsed.length === 0) { toast.error("Nothing parsed - paste statement lines with a leading date"); return; }
    onImport(parsed);
    toast.success(`Imported ${parsed.length} statement row(s)`);
    setRaw("");
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <ReceiptText size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Bank Statement Parser</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste raw statement text - one transaction per line starting with a date. We detect Dr/Cr keywords, pick the transaction amount (ignoring a trailing running balance) and build importable rows. No fixed format needed.</p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false}
          placeholder={"01/06/2026  NEFT Mehta Corp  250,000 Cr  1,250,000\n03/06/2026  Office rent Landlord  120,000 Dr  1,130,000"}
          className={taCls} />
      </div>

      {parsed.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Rows parsed", value: String(parsed.length), color: "text-[var(--color-primary)]" },
              { label: "Total credits", value: formatCurrency(credits), color: "text-green-400" },
              { label: "Total debits", value: formatCurrency(debits), color: "text-red-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Date", "Counterparty", "Description", "Amount"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 50).map(t => (
                  <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2 tabular-nums">{t.date}</td>
                    <td className="px-4 py-2">{t.counterparty || "-"}</td>
                    <td className="px-4 py-2 text-[var(--color-muted)]">{t.description}</td>
                    <td className={`px-4 py-2 tabular-nums ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 50 && <p className="text-[10px] text-[var(--color-muted)] px-4 py-2">Showing first 50 of {parsed.length}.</p>}
          </div>
          <button disabled={!editable} onClick={commit} className={primaryBtn}>
            <Plus size={13} /> Import {parsed.length} row(s)
          </button>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Heuristic parser - verify amounts and Dr/Cr direction before importing. Lines without a leading date are skipped.</p>
    </div>
  );
}

// ── #179 Date-Range Export ─────────────────────────────────────────────────────
// Slice live transactions to a from/to window and export the subset as CSV.
function DateRangeExport() {
  const { store } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today);

  const matched = useMemo(() => {
    const txns = store.transactions ?? [];
    const fromT = from ? new Date(from).getTime() : -Infinity;
    const toT = to ? new Date(to).getTime() + 86399999 : Infinity;
    return txns.filter(t => {
      const d = new Date(t.date).getTime();
      return !isNaN(d) && d >= fromT && d <= toT;
    });
  }, [store.transactions, from, to]);

  const net = matched.reduce((s, t) => s + t.amount, 0);

  const exportCsv = () => {
    if (matched.length === 0) { toast.error("No transactions in this range"); return; }
    const header = "date,amount,description,counterparty,category";
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const body = matched.map(t => [t.date, t.amount, esc(t.description || ""), esc(t.counterparty || ""), t.category].join(",")).join("\n");
    downloadBlob(`transactions-${from || "start"}_to_${to || "end"}.csv`, `${header}\n${body}`, "text/csv");
    toast.success(`Exported ${matched.length} transaction(s)`);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <CalendarRange size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Date-Range Export</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Pull a clean CSV of just the transactions in a chosen window - handy for a quarter, a financial year, or an audit request. Leave "from" blank to start at the earliest record.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inpCls} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className={inpCls} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 max-w-md">
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Matched rows</p>
            <p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{matched.length}</p>
          </div>
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Net amount</p>
            <p className={`text-lg font-bold tabular-nums ${net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(net)}</p>
          </div>
        </div>
        <button onClick={exportCsv} className={`${primaryBtn} mt-4`}>
          <Download size={13} /> Export {matched.length} row(s) CSV
        </button>
      </div>
    </div>
  );
}

// ── #180 Paste Duplicate Finder ────────────────────────────────────────────────
// Paste any list (one value per line) and surface repeated values + counts.
// Pure client-side analysis; export the deduped/unique list as CSV.
function PasteDuplicateFinder() {
  const [raw, setRaw] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);

  const { dupes, uniqueCount, total } = useMemo(() => {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const counts = new Map<string, { display: string; n: number }>();
    lines.forEach(l => {
      const key = caseSensitive ? l : l.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.n += 1;
      else counts.set(key, { display: l, n: 1 });
    });
    const dupes = Array.from(counts.values()).filter(v => v.n > 1).sort((a, b) => b.n - a.n);
    return { dupes, uniqueCount: counts.size, total: lines.length };
  }, [raw, caseSensitive]);

  const exportUnique = () => {
    if (total === 0) { toast.error("Paste some values first"); return; }
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const seen = new Set<string>();
    const unique: string[] = [];
    lines.forEach(l => {
      const key = caseSensitive ? l : l.toLowerCase();
      if (!seen.has(key)) { seen.add(key); unique.push(l); }
    });
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    downloadBlob("unique-values.csv", `value\n${unique.map(esc).join("\n")}`, "text/csv");
    toast.success(`Exported ${unique.length} unique value(s)`);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <ScanSearch size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Paste Duplicate Finder</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste any list - invoice numbers, GSTINs, emails, vendor names (one per line). We count repeats so you can spot double entries before they reach your books, then export the de-duplicated list.</p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false}
          placeholder={"INV-001\nINV-002\nINV-001\nmehta@corp.in"}
          className={taCls} />
        <label className="flex items-center gap-2 cursor-pointer text-xs mt-3">
          <input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} className="accent-[var(--color-primary)]" />
          Case-sensitive matching
        </label>
      </div>

      {total > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total values", value: total, color: "text-[var(--color-primary)]" },
              { label: "Unique", value: uniqueCount, color: "text-green-400" },
              { label: "Duplicated", value: total - uniqueCount, color: "text-orange-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          {dupes.length > 0 && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[280px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {["Value", "Occurrences"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dupes.slice(0, 100).map((d, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{d.display}</td>
                      <td className="px-4 py-2 tabular-nums text-orange-400">×{d.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dupes.length > 100 && <p className="text-[10px] text-[var(--color-muted)] px-4 py-2">Showing first 100 of {dupes.length}.</p>}
            </div>
          )}
          <button onClick={exportUnique} className={primaryBtn}>
            <Download size={13} /> Export {uniqueCount} unique value(s)
          </button>
        </>
      )}
    </div>
  );
}

// ── #181 JSON Formatter ────────────────────────────────────────────────────────
// Validate, pretty-print or minify pasted JSON; copy or download the result.
function JsonFormatter() {
  const [raw, setRaw] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");

  const run = (mode: "pretty" | "minify") => {
    setErr(""); setOut("");
    if (!raw.trim()) { setErr("Paste some JSON first."); return; }
    try {
      const parsed = JSON.parse(raw);
      setOut(JSON.stringify(parsed, null, mode === "pretty" ? 2 : 0));
      toast.success(mode === "pretty" ? "Formatted" : "Minified");
    } catch (e) {
      setErr(e instanceof Error ? `Invalid JSON: ${e.message}` : "Invalid JSON");
    }
  };

  const copy = () => {
    if (!out) return;
    navigator.clipboard?.writeText(out);
    toast.success("Copied to clipboard");
  };
  const download = () => {
    if (!out) return;
    downloadBlob("formatted.json", out, "application/json");
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-2">
          <FileJson size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">JSON Formatter</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste JSON from an API response, a webhook payload or an export. Validate it, pretty-print for reading, or minify for sending - entirely in your browser.</p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false}
          placeholder={'{"invoice":"INV-001","amount":250000}'}
          className={taCls} />
        {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => run("pretty")} className={primaryBtn}><Braces size={13} /> Pretty-print</button>
          <button onClick={() => run("minify")} className={ghostBtn}><Braces size={13} /> Minify</button>
        </div>
      </div>

      {out && (
        <div className={cardCls}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Result</p>
            <div className="flex gap-2">
              <button onClick={copy} className={ghostBtn}><Copy size={13} /> Copy</button>
              <button onClick={download} className={ghostBtn}><Download size={13} /> Download</button>
            </div>
          </div>
          <pre className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-[400px] whitespace-pre-wrap">{out}</pre>
        </div>
      )}
    </div>
  );
}
