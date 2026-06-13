import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─────────────────────────────────────────────────────────────────────────────
// Shared export helpers — turn statement/analytics data into downloadable
// Excel workbooks (multi-sheet) and branded PDFs (multi-table). Client-side only.
// ─────────────────────────────────────────────────────────────────────────────

type Cell = string | number;

export interface Sheet { name: string; rows: Cell[][] }   // rows[0] is the header

export function exportExcel(filename: string, sheets: Sheet[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export interface PdfTable { title?: string; head: string[]; body: Cell[][] }

export function exportPdf(filename: string, title: string, subtitle: string, tables: PdfTable[]) {
  const doc = new jsPDF();
  doc.setFontSize(16); doc.setTextColor(20); doc.text(title, 14, 18);
  doc.setFontSize(10); doc.setTextColor(120); doc.text(subtitle, 14, 24.5);
  let y = 32;
  for (const t of tables) {
    if (t.title) { doc.setFontSize(12); doc.setTextColor(30); doc.text(t.title, 14, y); y += 4; }
    autoTable(doc, {
      startY: y,
      head: [t.head],
      body: t.body.map(r => r.map(c => String(c))),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [26, 107, 85], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 246] },
      margin: { left: 14, right: 14 },
    });
    // jspdf-autotable stashes the final Y on the doc instance
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }
  doc.save(filename);
}
