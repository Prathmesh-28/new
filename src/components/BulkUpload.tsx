import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Upload, Download, X, CheckCircle2, AlertTriangle, FileUp } from "lucide-react";
import { parseCsv, templateCsv, csvToObjects, download, type TemplateCol } from "@/lib/csv";

interface BulkResult {
  created?: number;
  failed?: number;
  errors?: { row?: number; error: string }[];
  [k: string]: unknown;
}

interface Props {
  title: string;                                   // e.g. "Bulk upload ledgers"
  templateName: string;                            // e.g. "ledgers-template"
  columns: TemplateCol[];                          // template/headers + mapping
  endpoint: string;                                // POST endpoint, e.g. "/api/books/ledgers/bulk"
  rowsKey?: string;                                // body key for the array (default "rows")
  transform?: (row: Record<string, string>) => Record<string, unknown>;  // map a parsed row to API shape
  hint?: string;                                   // extra help text
  label?: string;                                  // button label (default "Bulk upload")
  size?: "sm" | "md";
  canWrite?: boolean;
  onDone?: (result: BulkResult) => void;           // refresh callback
}

/**
 * Reusable "Bulk upload" button + modal. Gives the user a downloadable CSV
 * template, accepts a file (or pasted CSV), previews the parsed rows, then POSTs
 * them as { [rowsKey]: rows } to `endpoint`. The backend bulk endpoints return
 * { created, failed, errors:[{row,error}] }, which is surfaced row-by-row.
 */
export default function BulkUpload({
  title, templateName, columns, endpoint, rowsKey = "rows",
  transform, hint, label = "Bulk upload", size = "md", canWrite = true, onDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setRaw(""); setRows([]); setResult(null); };
  const close = () => { setOpen(false); reset(); };

  const ingest = (text: string) => {
    setRaw(text);
    setResult(null);
    try {
      const parsed = parseCsv(text);
      setRows(csvToObjects(parsed, columns));
    } catch {
      setRows([]);
      toast.error("Could not parse that CSV");
    }
  };

  const onFile = (f?: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = e => ingest(String(e.target?.result ?? ""));
    reader.readAsText(f);
  };

  const downloadTemplate = () => {
    download(`${templateName}.csv`, templateCsv(columns));
    toast.success("Template downloaded - fill it in and upload");
  };

  const submit = async () => {
    if (rows.length === 0) { toast.error("No rows to upload"); return; }
    setBusy(true);
    try {
      const payload = rows.map(r => (transform ? transform(r) : r));
      const res = await api.post<BulkResult>(endpoint, { [rowsKey]: payload });
      setResult(res || {});
      const created = res?.created ?? 0;
      const failed = res?.failed ?? (res?.errors?.length ?? 0);
      if (failed > 0) toast.warning(`${created} created, ${failed} failed - see details`);
      else toast.success(`${created} row(s) uploaded`);
      onDone?.(res || {});
    } catch (e: any) {
      toast.error(e?.message || "Bulk upload failed");
    } finally {
      setBusy(false);
    }
  };

  const pad = size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs";
  const preview = rows.slice(0, 8);

  return (
    <>
      <button onClick={() => setOpen(true)} disabled={!canWrite} title={canWrite ? "" : "Read-only"}
        className={`inline-flex items-center gap-1.5 ${pad} rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed`}>
        <FileUp size={13} /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="w-full max-w-2xl max-h-[88vh] overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">{hint || "Download the template, fill it in, then upload the CSV. Required columns are marked with *."}</p>
              </div>
              <button onClick={close} className="rounded-md p-1 hover:bg-[var(--color-surface-2)]"><X size={16} /></button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface-2)]">
                <Download size={13} /> Download template
              </button>
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface-2)]">
                <Upload size={13} /> Choose CSV file
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
              <span className="text-[11px] text-[var(--color-muted)]">Columns: {columns.map(c => c.label + (c.required ? "*" : "")).join(", ")}</span>
            </div>

            <textarea
              value={raw}
              onChange={e => ingest(e.target.value)}
              placeholder="…or paste CSV rows here"
              className="mt-3 h-24 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2 font-mono text-[11px]"
            />

            {rows.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium">{rows.length} row(s) parsed - preview:</p>
                <div className="max-h-48 overflow-auto rounded-lg border border-[var(--color-border)]">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-[var(--color-surface-2)]">
                      <tr>{columns.map(c => <th key={c.key} className="px-2 py-1 text-left font-medium">{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t border-[var(--color-border)]">
                          {columns.map(c => <td key={c.key} className="px-2 py-1">{r[c.key]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > preview.length && <p className="mt-1 text-[11px] text-[var(--color-muted)]">+{rows.length - preview.length} more…</p>}
              </div>
            )}

            {result && (
              <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3 text-xs">
                <p className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 size={14} className="text-[var(--color-success,#16a34a)]" /> {result.created ?? 0} created
                  {(result.failed ?? result.errors?.length ?? 0) > 0 && <span className="ml-2 flex items-center gap-1 text-[var(--color-warning,#d97706)]"><AlertTriangle size={14} /> {result.failed ?? result.errors?.length} failed</span>}
                </p>
                {result.errors && result.errors.length > 0 && (
                  <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-[11px] text-[var(--color-muted)]">
                    {result.errors.slice(0, 50).map((er, i) => <li key={i}>Row {er.row ?? i + 1}: {er.error}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={close} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs hover:bg-[var(--color-surface-2)]">Close</button>
              <button onClick={submit} disabled={busy || rows.length === 0 || !canWrite}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
                <Upload size={13} /> {busy ? "Uploading…" : `Upload ${rows.length || ""} row(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
