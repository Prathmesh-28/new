import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowRightLeft, Upload, X, CheckCircle2, AlertTriangle, FileUp, Database, Loader2 } from "lucide-react";
import { parseTallyMasters, type TallyParseResult } from "@/lib/tally";
import BulkUpload from "@/components/BulkUpload";

interface BulkResult { created?: number; failed?: number; errors?: { row?: number; error: string }[] }

// CSV column templates reused by the guided path (mirror the bulk endpoints).
const LEDGER_COLS = [
  { key: "name", label: "Name", example: "Mehta Traders", required: true },
  { key: "group", label: "Group", example: "Sundry Debtors", required: true },
  { key: "is_party", label: "Is Party", example: "true" },
  { key: "gstin", label: "GSTIN", example: "29ABCDE1234F1Z5" },
  { key: "pan", label: "PAN", example: "ABCDE1234F" },
  { key: "opening_balance", label: "Opening Balance", example: "50000" },
  { key: "opening_dir", label: "Dr/Cr", example: "debit" },
];
const ITEM_COLS = [
  { key: "name", label: "Name", example: "Steel Bolt M8", required: true },
  { key: "unit", label: "Unit", example: "Nos" },
  { key: "hsn_sac", label: "HSN/SAC", example: "7318" },
  { key: "gst_rate", label: "GST %", example: "18" },
  { key: "opening_qty", label: "Opening Qty", example: "500" },
  { key: "opening_value", label: "Opening Value", example: "25000" },
];
const INVOICE_COLS = [
  { key: "type", label: "Type", example: "SALES", required: true },
  { key: "party", label: "Party", example: "Mehta Traders", required: true },
  { key: "date", label: "Date", example: "2026-06-15", required: true },
  { key: "lineTotal", label: "Amount (pre-GST)", example: "100000", required: true },
  { key: "gstRate", label: "GST %", example: "18" },
  { key: "interState", label: "Inter-state", example: "false" },
  { key: "invoiceNumber", label: "Invoice No", example: "INV-001" },
];

export default function MigrationWizard({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const [mode, setMode] = useState<"choose" | "tally" | "csv">("choose");
  const [parsed, setParsed] = useState<TallyParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ledgers?: BulkResult; items?: BulkResult } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onTallyFile = (f?: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const res = parseTallyMasters(String(e.target?.result ?? ""));
        setParsed(res);
        setResult(null);
        if (res.ledgers.length === 0 && res.items.length === 0)
          toast.warning("No ledgers or stock items found - is this a Tally Masters export?");
        else toast.success(`Found ${res.ledgers.length} ledgers, ${res.items.length} items`);
      } catch { toast.error("Could not read that Tally export"); }
    };
    reader.readAsText(f);
  };

  const importTally = async () => {
    if (!parsed) return;
    setBusy(true);
    const out: { ledgers?: BulkResult; items?: BulkResult } = {};
    try {
      if (parsed.ledgers.length) out.ledgers = await api.post<BulkResult>("/api/books/ledgers/bulk", { rows: parsed.ledgers });
      if (parsed.items.length) out.items = await api.post<BulkResult>("/api/books/inventory/items/bulk", { rows: parsed.items });
      setResult(out);
      const created = (out.ledgers?.created ?? 0) + (out.items?.created ?? 0);
      const failed = (out.ledgers?.failed ?? 0) + (out.items?.failed ?? 0);
      if (failed) toast.warning(`${created} imported, ${failed} skipped - see details`);
      else toast.success(`Imported ${created} records from Tally`);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || "Tally import failed");
    } finally { setBusy(false); }
  };

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">{children}</div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold"><ArrowRightLeft size={16} className="text-[var(--color-primary)]" /> Bring your data in</h3>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">Switch from Tally in one file, or upload CSVs. Everything posts through the same validated bulk import - bad rows are skipped with reasons, good rows go through.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[var(--color-surface-2)]"><X size={16} /></button>
        </div>

        {mode === "choose" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button onClick={() => setMode("tally")} className="rounded-lg border border-[var(--color-border)] p-4 text-left hover:border-[var(--color-primary)]">
              <Database size={18} className="text-[var(--color-primary)]" />
              <p className="mt-2 text-sm font-medium">Switch from Tally</p>
              <p className="text-[11px] text-[var(--color-muted)]">Export Masters from Tally (Gateway → Export → Masters, XML) and drop the file here. We split ledgers + stock items automatically.</p>
            </button>
            <button onClick={() => setMode("csv")} className="rounded-lg border border-[var(--color-border)] p-4 text-left hover:border-[var(--color-primary)]">
              <FileUp size={18} className="text-[var(--color-primary)]" />
              <p className="mt-2 text-sm font-medium">Upload CSVs</p>
              <p className="text-[11px] text-[var(--color-muted)]">Download a template for ledgers, items, opening balances or invoices, fill it in, and upload - with a live preview.</p>
            </button>
          </div>
        )}

        {mode === "tally" && (
          <div className="space-y-3">
            <button onClick={() => { setMode("choose"); setParsed(null); setResult(null); }} className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]">← back</button>
            <Card>
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface-2)]">
                <Upload size={13} /> Choose Tally Masters .xml
              </button>
              <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={e => onTallyFile(e.target.files?.[0])} />
              <p className="mt-2 text-[11px] text-[var(--color-muted)]">In Tally: Gateway of Tally → Display → List of Accounts → Export (or Export → Masters) → choose XML.</p>
            </Card>

            {parsed && (parsed.ledgers.length > 0 || parsed.items.length > 0) && (
              <Card>
                <p className="mb-2 text-xs font-medium">Found in your export:</p>
                <div className="flex gap-3">
                  <div className="flex-1 rounded-lg bg-[var(--color-surface-2)] p-3 text-center">
                    <p className="text-xl font-semibold">{parsed.ledgers.length}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">ledgers / parties</p>
                  </div>
                  <div className="flex-1 rounded-lg bg-[var(--color-surface-2)] p-3 text-center">
                    <p className="text-xl font-semibold">{parsed.items.length}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">stock items</p>
                  </div>
                </div>
                {!result && (
                  <button onClick={importTally} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {busy ? "Importing…" : "Import into Headroom"}
                  </button>
                )}
              </Card>
            )}

            {result && (
              <Card>
                {(["ledgers", "items"] as const).map(k => result[k] && (
                  <p key={k} className="flex items-center gap-1.5 text-xs">
                    <CheckCircle2 size={14} className="text-[var(--color-success,#16a34a)]" /> {result[k]!.created ?? 0} {k} created
                    {(result[k]!.failed ?? 0) > 0 && <span className="ml-1 flex items-center gap-1 text-[var(--color-warning,#d97706)]"><AlertTriangle size={13} /> {result[k]!.failed} skipped</span>}
                  </p>
                ))}
                {(result.ledgers?.errors?.length || result.items?.errors?.length) ? (
                  <ul className="mt-2 max-h-28 space-y-0.5 overflow-auto text-[11px] text-[var(--color-muted)]">
                    {[...(result.ledgers?.errors ?? []), ...(result.items?.errors ?? [])].slice(0, 40).map((e, i) => <li key={i}>Row {e.row ?? i + 1}: {e.error}</li>)}
                  </ul>
                ) : null}
              </Card>
            )}
          </div>
        )}

        {mode === "csv" && (
          <div className="space-y-3">
            <button onClick={() => setMode("choose")} className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]">← back</button>
            <p className="text-xs text-[var(--color-muted)]">Import in this order so references resolve (ledgers → items → invoices):</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Card><p className="mb-2 text-sm font-medium">1 · Chart of accounts & parties</p><BulkUpload title="Bulk upload ledgers" templateName="ledgers-template" columns={LEDGER_COLS} endpoint="/api/books/ledgers/bulk" onDone={onDone} /></Card>
              <Card><p className="mb-2 text-sm font-medium">2 · Stock items</p><BulkUpload title="Bulk upload items" templateName="items-template" columns={ITEM_COLS} endpoint="/api/books/inventory/items/bulk" onDone={onDone} /></Card>
              <Card><p className="mb-2 text-sm font-medium">3 · Opening invoices</p><BulkUpload title="Bulk upload invoices" templateName="invoices-template" columns={INVOICE_COLS} endpoint="/api/books/documents/bulk" hint="SALES or PURCHASE per row - each posts a balanced GST voucher." onDone={onDone} /></Card>
              <Card><p className="mb-2 text-sm font-medium">Opening balances</p><p className="text-[11px] text-[var(--color-muted)]">Use the Books → Closing tab to import a trial-balance CSV of opening balances.</p></Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
