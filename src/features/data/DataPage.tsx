import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { generateDemoData } from "@/lib/demoData";
import { formatCurrency } from "@/lib/utils";
import { Database, Upload, Download, FileSpreadsheet, Sparkles, Pencil, Trash2, ArrowLeftRight, Columns3, Building2, ShieldCheck, Plus, Clock, CheckCircle2, Copy, Replace, Bookmark, FileDown, Archive, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import TransactionImportModal from "@/components/TransactionImportModal";
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
  const navigate = useNavigate();
  const [showImport, setShowImport] = useState(false);
  const [tab, setTab] = useState<"overview" | "tally" | "mapper" | "consolidate" | "backup" | "quality" | "dedupe" | "replace" | "templates-store" | "filings" | "archive">("overview");

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

  const loadDemo = () => {
    if (!window.confirm("Load the FY23–FY28 demo dataset? This replaces your current transactions, invoices, accounts, loans and obligations with realistic sample data.")) return;
    const demo = generateDemoData();
    setStore(s => ({
      ...s,
      firm: { ...s.firm, ...demo.firm },
      bankAccounts: demo.bankAccounts ?? s.bankAccounts,
      transactions: demo.transactions ?? s.transactions,
      invoices: demo.invoices ?? s.invoices,
      activeLoans: demo.activeLoans ?? s.activeLoans,
      obligations: demo.obligations ?? s.obligations,
    }));
    toast.success(`Loaded ${demo.transactions?.length ?? 0} transactions across FY23–FY28`);
  };

  const clearAll = () => {
    if (!window.confirm("Clear ALL financial data (transactions, invoices, accounts, loans)? This cannot be undone.")) return;
    setStore(s => ({ ...s, transactions: [], invoices: [], bankAccounts: [], activeLoans: [], obligations: [] }));
    toast.success("All financial data cleared");
  };

  const txnTemplate = "date,amount,description,counterparty\n01/06/2026,250000,Client payment,Mehta Corp\n03/06/2026,-120000,Office rent,Landlord\n05/06/2026,-410000,Monthly payroll,Team\n";
  const invTemplate = "customer,amount,invoice_number,invoice_date,due_date,status\nMehta Corp,250000,INV-001,01/06/2026,01/07/2026,pending\n";

  const stats = [
    { label: "Transactions", value: store.transactions.length },
    { label: "Invoices", value: store.invoices.length },
    { label: "Bank accounts", value: store.bankAccounts.length },
    { label: "Active loans", value: store.activeLoans.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <Database size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Data &amp; Import</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Bring your numbers in fast — upload a CSV, load sample data, or edit in bulk.</p>
        </div>
      </div>

      {/* Tool selector */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
        {([["overview", "Overview", Database], ["tally", "Tally Bridge", ArrowLeftRight], ["mapper", "CSV Mapper", Columns3], ["consolidate", "Consolidation", Building2], ["backup", "Backup & Export", ShieldCheck], ["quality", "Data Quality", CheckCircle2], ["dedupe", "Dedupe", Copy], ["replace", "Find & Replace", Replace], ["templates-store", "Mapping Templates", Bookmark], ["filings", "Filing Templates", FileDown], ["archive", "Archive & Purge", Archive]] as const).map(([id, label, Icon]) => (
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
          Your role has read-only access — importing and editing are disabled.
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
              <Upload size={13} /> Upload CSV
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
            <p className="text-sm font-semibold">Load sample data · FY23–FY28</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">Populate the whole app with six years of realistic financials — revenue, payroll, GST, a loan and live invoices — so every statement, chart and forecast comes to life.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={!editable} onClick={loadDemo}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40">
              <Sparkles size={13} /> Load demo data
            </button>
            <button disabled={!editable} onClick={clearAll}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-red-400 disabled:opacity-40">
              <Trash2 size={13} /> Clear all
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
        else amount = rawAmt; // unknown voucher type — trust the sign as exported
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
      <p className="text-[10px] text-[var(--color-muted)]">XML is generated and parsed entirely in your browser — nothing is uploaded. Verify ledger mapping in Tally after import.</p>
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
        <p className="text-xs text-[var(--color-muted)] mb-3">Paste any sheet (copy cells from Excel/Sheets — tabs or commas both work after a quick paste-as-CSV). Then tell us which column is which. No fixed template required.</p>
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
                    <td className="px-4 py-2">{t.counterparty || "—"}</td>
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
// then produce a consolidated group P&L — including minority-interest elimination.
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

  const elim = parseFloat(intercoElim) || 0;
  const gross = entities.reduce((a, e) => ({ revenue: a.revenue + e.revenue, expense: a.expense + e.expense, cash: a.cash + e.cash }), { revenue: 0, expense: 0, cash: 0 });
  const consRevenue = gross.revenue - elim;
  const consExpense = gross.expense - elim;
  const consPbt = consRevenue - consExpense;
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Roll up subsidiaries and group companies into one consolidated P&amp;L. Enter each entity's FY figures and ownership %; we eliminate inter-company turnover and split out minority interest.</p>
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
            <div className="max-w-xs mb-4">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Inter-company eliminations ₹ (sales between group entities)</label>
              <input type="number" value={intercoElim} onChange={e => setIntercoElim(e.target.value)} className={inpCls} placeholder="0" />
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
      <p className="text-[10px] text-[var(--color-muted)]">Indicative consolidation (AS-21 style). Eliminations are applied to both revenue and expense equally; intra-group balances and unrealised profit on stock are not auto-detected. Verify with your CA.</p>
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
    if (!last) return "Never backed up — run one now.";
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    const limit = cadence === "daily" ? 1 : cadence === "weekly" ? 7 : 30;
    return days >= limit ? `Backup overdue — last run ${days}d ago (${cadence}).` : `Up to date — next ${cadence} backup in ${limit - days}d.`;
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
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Cadence is a reminder — the actual export is a one-click manual run (browser-only, no server uploads).</p>
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
                  <td className="px-4 py-2">{g[0].counterparty || "—"}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">{g[0].description || "—"}</td>
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Standardise messy bank narrations — e.g. rename every "MEHTA CORP LTD" to "Mehta Corp" across all transactions at once. Match is case-insensitive.</p>
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
                  <td className="px-4 py-2">{t[field] || "—"}</td>
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
      desc: "Outward B2B invoices for monthly GST return — GSTIN, invoice no, taxable value and rate.",
      file: "gstr1-b2b-template.csv",
      content: "gstin,invoice_no,invoice_date,invoice_value,taxable_value,rate,igst,cgst,sgst\n27ABCDE1234F1Z5,INV-001,01/06/2026,295000,250000,18,0,22500,22500\n",
    },
    {
      id: "opening", name: "Opening balances",
      desc: "Ledger opening balances to seed a new financial year — account, debit and credit.",
      file: "opening-balances-template.csv",
      content: "ledger,opening_debit,opening_credit\nCash,50000,0\nBank,1200000,0\nSundry Creditors,0,340000\n",
    },
    {
      id: "fixed-assets", name: "Fixed-asset register",
      desc: "Asset master for depreciation — name, category, purchase date, cost and rate.",
      file: "fixed-asset-register-template.csv",
      content: "asset,category,purchase_date,cost,depreciation_rate\nLaptops,Computers,01/04/2026,450000,40\nOffice furniture,Furniture,01/04/2026,180000,10\n",
    },
    {
      id: "vendor-master", name: "Vendor / counterparty master",
      desc: "Bulk-load suppliers and customers — name, GSTIN, PAN and payment terms.",
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
      <p className="text-[10px] text-[var(--color-muted)]">Templates are indicative formats — confirm exact column requirements with the GST portal or your accounting software before filing.</p>
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
    if (!window.confirm(`Permanently remove ${older.length} transaction(s) dated before ${cutoff}? Download the archive first — this cannot be undone.`)) return;
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Years of stale transactions slow down charts and reports. Pick a cut-off, download everything older as a CSV archive, then purge it from the working set. Statutory records should be kept 8 years — store the archive safely.</p>
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
