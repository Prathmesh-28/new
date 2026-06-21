// Lightweight CSV in/out helpers shared by BulkUpload (import) and ExportMenu
// (download). Client-side only — no deps. Handles quoted fields, embedded commas,
// escaped quotes ("") and CRLF/CR/LF line endings.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      cur.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); rows.push(cur); cur = []; field = "";
    } else field += c;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  // Drop fully-empty rows (trailing newlines, blank lines).
  return rows.filter(r => r.some(x => x.trim() !== ""));
}

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: (string | number)[][]): string {
  return rows.map(r => r.map(esc).join(",")).join("\r\n");
}

export function download(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ExportCol { key: string; label: string }

/** Turn an array of row-objects into a CSV string given column definitions. */
export function objectsToCsv(columns: ExportCol[], rows: Record<string, unknown>[]): string {
  return toCsv([
    columns.map(c => c.label),
    ...rows.map(r => columns.map(c => (r[c.key] ?? "") as string | number)),
  ]);
}

export interface TemplateCol {
  key: string;          // the field name the API expects
  label: string;        // the CSV header shown to the user
  example?: string;     // sample value placed in the example row
  required?: boolean;
}

/** Build a 2-line (header + example) CSV template string. */
export function templateCsv(columns: TemplateCol[]): string {
  return toCsv([
    columns.map(c => c.label),
    columns.map(c => c.example ?? ""),
  ]);
}

/**
 * Map a parsed CSV (incl. header row) into row-objects keyed by the template's
 * `key`s. Matches header cells to columns by label (case/space-insensitive),
 * falling back to positional order when headers don't match the template.
 */
export function csvToObjects(
  parsed: string[][],
  columns: TemplateCol[],
): Record<string, string>[] {
  if (parsed.length === 0) return [];
  const norm = (s: string) => s.trim().toLowerCase().replace(/\*$/, "");
  const header = parsed[0].map(norm);
  // For each template column, find its index in the header (by label), else positional.
  const idx = columns.map((c, i) => {
    const byLabel = header.indexOf(norm(c.label));
    if (byLabel !== -1) return byLabel;
    const byKey = header.indexOf(norm(c.key));
    return byKey !== -1 ? byKey : i;
  });
  // If the first row doesn't look like a header (no label matched), treat all rows as data.
  const headerMatched = columns.some((c, i) => header[idx[i]] === norm(c.label) || header[idx[i]] === norm(c.key));
  const dataRows = headerMatched ? parsed.slice(1) : parsed;
  return dataRows.map(r => {
    const obj: Record<string, string> = {};
    columns.forEach((c, i) => { obj[c.key] = (r[idx[i]] ?? "").trim(); });
    return obj;
  });
}
