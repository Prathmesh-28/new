import { useRef, useState } from "react";
import { Upload, X, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { generateId } from "@/lib/utils";
import type { Transaction } from "@/data/types";

function parseCSV(text: string): string[][] {
  return text.trim().split("\n").map(line => {
    const cols: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === "," && !inQuotes) { cols.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    cols.push(cur.trim());
    return cols;
  });
}

function guessCategory(desc: string): Transaction["category"] {
  const d = desc.toLowerCase();
  if (/salary|payroll|hr|wages/.test(d)) return "payroll";
  if (/tax|gst|tds|income tax/.test(d)) return "tax";
  if (/loan|emi|repay|interest/.test(d)) return "loan";
  if (/transfer|neft|imps|rtgs/.test(d)) return "transfer";
  if (/revenue|sale|invoice|receipt/.test(d)) return "revenue";
  return "expense";
}

interface Props {
  bankAccountId: string;
  onClose: () => void;
  onImport: (txns: Transaction[]) => void;
}

export default function TransactionImportModal({ bankAccountId, onClose, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]     = useState<Transaction[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [step, setStep]     = useState<"upload" | "preview">("upload");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) { toast.error("Upload a .csv file"); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const all = parseCSV(text);
      if (all.length < 2) { toast.error("CSV has no data rows"); return; }

      const header = all[0].map(h => h.toLowerCase().replace(/\s/g, "_"));
      const dateIdx   = header.findIndex(h => /date/.test(h));
      const amtIdx    = header.findIndex(h => /amount|amt/.test(h));
      const descIdx   = header.findIndex(h => /desc|narration|particular|detail|remark/.test(h));

      if (dateIdx === -1 || amtIdx === -1) {
        toast.error("CSV must have columns: date, amount, and optionally description");
        return;
      }

      const parsed: Transaction[] = [];
      const errs: string[] = [];

      all.slice(1).forEach((cols, i) => {
        const rawDate = cols[dateIdx]?.trim() ?? "";
        const rawAmt  = cols[amtIdx]?.trim().replace(/,/g, "") ?? "";
        const desc    = descIdx >= 0 ? (cols[descIdx]?.trim() ?? "") : `Row ${i + 2}`;

        let date = rawDate;
        if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(date)) {
          const [d, m, y] = date.split(/[-/]/);
          date = `${y}-${m}-${d}`;
        } else if (/^\d{2}[-/]\d{2}[-/]\d{2}$/.test(date)) {
          const [d, m, y] = date.split(/[-/]/);
          date = `20${y}-${m}-${d}`;
        }

        if (!date || isNaN(Date.parse(date))) {
          errs.push(`Row ${i + 2}: invalid date "${rawDate}"`);
          return;
        }

        const amount = parseFloat(rawAmt);
        if (isNaN(amount) || amount === 0) {
          errs.push(`Row ${i + 2}: invalid amount "${rawAmt}"`);
          return;
        }

        parsed.push({
          id: generateId(), date, description: desc, amount,
          category: guessCategory(desc),
          counterparty: "", isRecurring: false, bankAccountId,
        });
      });

      setRows(parsed);
      setErrors(errs);
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (rows.length === 0) { toast.error("No valid rows to import"); return; }
    onImport(rows);
    toast.success(`${rows.length} transaction${rows.length === 1 ? "" : "s"} imported`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">Import Transactions (CSV)</h2>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={18} /></button>
        </div>

        {step === "upload" && (
          <div className="flex-1">
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-lg p-10 text-center cursor-pointer transition-colors">
              <Upload size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-50" />
              <p className="text-sm font-medium mb-1">Click to upload a CSV file</p>
              <p className="text-xs text-[var(--color-muted)]">Required columns: date, amount - optional: description / narration</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            <div className="mt-4 p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-muted)] font-semibold mb-2 uppercase tracking-wide">Expected format</p>
              <code className="text-xs text-[var(--color-primary)]">date,amount,description</code>
              <br />
              <code className="text-xs text-[var(--color-muted)]">01/06/2025,50000,Client payment</code>
              <br />
              <code className="text-xs text-[var(--color-muted)]">03/06/2025,-12000,Office rent</code>
              <p className="text-xs text-[var(--color-muted)] mt-2">Dates: DD/MM/YYYY or DD-MM-YYYY. Negative amounts are expenses.</p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <>
            <div className="flex items-center gap-4 mb-3">
              <span className="flex items-center gap-1.5 text-xs text-green-400"><Check size={12} />{rows.length} valid rows</span>
              {errors.length > 0 && <span className="flex items-center gap-1.5 text-xs text-yellow-400"><AlertTriangle size={12} />{errors.length} skipped</span>}
            </div>

            {errors.length > 0 && (
              <div className="mb-3 p-2 bg-yellow-950/20 border border-yellow-800/30 rounded-lg">
                {errors.slice(0, 3).map((e, i) => <p key={i} className="text-xs text-yellow-400">{e}</p>)}
                {errors.length > 3 && <p className="text-xs text-yellow-400">…and {errors.length - 3} more</p>}
              </div>
            )}

            <div className="flex-1 overflow-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-surface)]">
                    {["Date", "Description", "Amount", "Category"].map(h => (
                      <th key={h} className="text-left font-semibold text-[var(--color-muted)] px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map(r => (
                    <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-2 text-[var(--color-muted)]">{r.date}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate">{r.description || "-"}</td>
                      <td className={`px-3 py-2 font-medium ${r.amount > 0 ? "text-green-400" : "text-red-400"}`}>
                        {r.amount > 0 ? "+" : ""}₹{Math.abs(r.amount).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-muted)]">{r.category}</td>
                    </tr>
                  ))}
                  {rows.length > 50 && (
                    <tr><td colSpan={4} className="px-3 py-2 text-center text-[var(--color-muted)]">…and {rows.length - 50} more rows</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => { setStep("upload"); setRows([]); setErrors([]); }} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg py-2">Back</button>
              <button onClick={handleImport}
                className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90">
                Import {rows.length} Transaction{rows.length === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
