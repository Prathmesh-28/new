import { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, FileText, Printer, ChevronDown } from "lucide-react";
import { objectsToCsv, download } from "@/lib/csv";
import { exportExcel, exportPdf } from "@/lib/exporters";

export interface ExportColumn { key: string; label: string }

interface Props {
  filename: string;                       // base name (no extension)
  title?: string;                         // heading for PDF/print
  columns: ExportColumn[];
  // Accept any row-object array - typed feature interfaces lack an index signature
  // so we widen here rather than force every caller to cast.
  rows: any[];
  subtitle?: string;
  size?: "sm" | "md";
}

/**
 * Drop-in "Export ▾" menu - CSV / Excel / PDF / Print - for any table. Pass the
 * column defs ({key,label}) and the row objects already on screen; everything is
 * client-side (no backend round-trip). Built on src/lib/csv + src/lib/exporters.
 */
export default function ExportMenu({ filename, title, columns, rows, subtitle, size = "md" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const head = columns.map(c => c.label);
  const matrix = rows.map(r => columns.map(c => (r[c.key] ?? "") as string | number));
  const heading = title || filename;
  const sub = subtitle || new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const empty = rows.length === 0;

  const doCsv = () => { download(`${filename}.csv`, objectsToCsv(columns, rows)); setOpen(false); };
  const doXlsx = () => { exportExcel(`${filename}.xlsx`, [{ name: heading.slice(0, 31), rows: [head, ...matrix] }]); setOpen(false); };
  const doPdf = () => { exportPdf(`${filename}.pdf`, heading, sub, [{ head, body: matrix }]); setOpen(false); };
  const doPrint = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const cell = (v: unknown) => `<td>${String(v ?? "").replace(/</g, "&lt;")}</td>`;
    const th = head.map(h => `<th>${String(h).replace(/</g, "&lt;")}</th>`).join("");
    const body = matrix.map(r => `<tr>${r.map(cell).join("")}</tr>`).join("");
    w.document.write(`<!doctype html><html><head><title>${heading}</title><style>
      body{font:13px -apple-system,Segoe UI,Roboto,sans-serif;color:#111;padding:24px}
      h1{font-size:18px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin:0 0 16px}
      table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px}
      th{background:#1a6b55;color:#fff} tr:nth-child(even) td{background:#f5f7f6}
      @media print{@page{margin:14mm}}
    </style></head><body><h1>${heading}</h1><p class="sub">${sub}</p>
      <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
    setOpen(false);
  };

  const pad = size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs";
  const Item = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
    <button onClick={onClick} disabled={empty}
      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[var(--color-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed">
      {icon}{label}
    </button>
  );

  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen(o => !o)} disabled={empty} title={empty ? "Nothing to export" : "Export"}
        className={`inline-flex items-center gap-1.5 ${pad} rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed`}>
        <Download size={13} /> Export <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          <Item icon={<Download size={13} />} label="CSV" onClick={doCsv} />
          <Item icon={<FileSpreadsheet size={13} />} label="Excel (.xlsx)" onClick={doXlsx} />
          <Item icon={<FileText size={13} />} label="PDF" onClick={doPdf} />
          <Item icon={<Printer size={13} />} label="Print" onClick={doPrint} />
        </div>
      )}
    </div>
  );
}
