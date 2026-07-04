// Bank-statement CSV parsing — pure functions, no I/O — so the fiddly parts (Indian date
// formats, lakh-comma amounts, Debit/Credit vs single-Amount layouts, quoted narrations with
// embedded commas) are unit-testable. Used by the Transactions "Import Statement" tool.

export interface ParsedLine {
  date: string;        // ISO YYYY-MM-DD
  description: string;
  amount: number;      // +inflow / -outflow (app convention)
}
export interface ParseResult {
  lines: ParsedLine[];
  skipped: number;     // non-empty rows we could not read
  columns: { date: number; desc: number; debit: number; credit: number; amount: number };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

// "31/03/2026", "31-03-26", "31 Mar 2026", "2026-03-31", "31.03.2026" → ISO. Indian banks are
// DD-first; a leading 4-digit year is the only YYYY-first form accepted.
export function parseIndianDate(raw: string): string | null {
  const s = String(raw).trim().replace(/["']/g, "");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);                    // ISO already
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);          // DD/MM/YYYY | DD-MM-YY
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
    return null;
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{2,4})$/);        // 31 Mar 2026 / 31-Mar-26
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (mo) return `${y}-${pad(mo)}-${pad(+m[1])}`;
  }
  return null;
}

// "1,23,456.78", "₹ 2,500.00", "(500)" (negative), "500 Cr"/"500 Dr" → number (sign per marker).
export function parseAmount(raw: string): number | null {
  let s = String(raw).trim().replace(/[₹\s]/g, "").replace(/,/g, "");
  if (!s || s === "-") return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  const marker = s.match(/(cr|dr)\.?$/i);
  if (marker) { if (marker[1].toLowerCase() === "dr") sign = -1; s = s.slice(0, -marker[0].length); }
  const n = parseFloat(s);
  return Number.isFinite(n) ? sign * n : null;
}

// Split one CSV line honoring double-quoted fields (narrations contain commas).
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === delim && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const H = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const DATE_HEADS = ["date", "txndate", "transactiondate", "valuedate", "postdate", "trandate"];
const DESC_HEADS = ["narration", "description", "particulars", "remarks", "transactiondetails", "details", "chequeref"];
const DEBIT_HEADS = ["withdrawalamt", "withdrawal", "debit", "debitamount", "dr", "withdrawals"];
const CREDIT_HEADS = ["depositamt", "deposit", "credit", "creditamount", "cr", "deposits"];
const AMOUNT_HEADS = ["amount", "amountinr", "transactionamount", "amt"];

// Parse a whole statement file. Detects delimiter, finds the header row (banks often prefix
// account metadata), maps columns by common Indian-bank header names, and reads every data row.
// Debit/Credit columns → outflow negative / inflow positive; single Amount column keeps its sign
// (with Dr/Cr suffix support).
export function parseStatementCsv(text: string): ParseResult {
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const empty: ParseResult = { lines: [], skipped: 0, columns: { date: -1, desc: -1, debit: -1, credit: -1, amount: -1 } };
  if (!rawLines.length) return empty;

  // Delimiter = whichever candidate appears most across the first few lines (default comma).
  const sample = rawLines.slice(0, 5).join("\n");
  const delim = [",", ";", "\t", "|"]
    .map((d) => ({ d, n: sample.split(d).length - 1 }))
    .sort((a, b) => b.n - a.n)[0].d || ",";

  // Header row = first row where a date-ish and desc-ish header both match.
  let headerIdx = -1;
  let cols = { date: -1, desc: -1, debit: -1, credit: -1, amount: -1 };
  for (let i = 0; i < Math.min(rawLines.length, 12); i++) {
    const cells = splitCsvLine(rawLines[i], delim).map(H);
    const c = {
      date: cells.findIndex((x) => DATE_HEADS.some((h) => x.startsWith(h))),
      desc: cells.findIndex((x) => DESC_HEADS.some((h) => x.startsWith(h))),
      debit: cells.findIndex((x) => DEBIT_HEADS.some((h) => x === h || x.startsWith(h))),
      credit: cells.findIndex((x) => CREDIT_HEADS.some((h) => x === h || x.startsWith(h))),
      amount: cells.findIndex((x) => AMOUNT_HEADS.some((h) => x === h || x.startsWith(h))),
    };
    if (c.date >= 0 && c.desc >= 0 && (c.amount >= 0 || c.debit >= 0 || c.credit >= 0)) { headerIdx = i; cols = c; break; }
  }
  // Headerless fallback: assume date, description, amount as the first three columns.
  if (headerIdx === -1) {
    const first = splitCsvLine(rawLines[0], delim);
    if (first.length >= 3 && parseIndianDate(first[0])) { headerIdx = -1; cols = { date: 0, desc: 1, debit: -1, credit: -1, amount: first.length - 1 }; }
    else return empty;
  }

  const lines: ParsedLine[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const cells = splitCsvLine(rawLines[i], delim);
    const date = parseIndianDate(cells[cols.date] ?? "");
    if (!date) { skipped++; continue; }
    const description = (cells[cols.desc] ?? "").replace(/\s+/g, " ").trim() || "Imported transaction";
    let amount: number | null = null;
    if (cols.debit >= 0 || cols.credit >= 0) {
      const dr = cols.debit >= 0 ? parseAmount(cells[cols.debit] ?? "") : null;
      const cr = cols.credit >= 0 ? parseAmount(cells[cols.credit] ?? "") : null;
      if (cr != null && cr !== 0) amount = Math.abs(cr);
      else if (dr != null && dr !== 0) amount = -Math.abs(dr);
    } else if (cols.amount >= 0) {
      amount = parseAmount(cells[cols.amount] ?? "");
    }
    if (amount == null || amount === 0) { skipped++; continue; }
    lines.push({ date, description, amount });
  }
  return { lines, skipped, columns: cols };
}

// Keyword auto-categorisation into the app's six buckets (display buckets; the server keeps
// the full category). Deliberately conservative — anything unclear stays "expense".
export function guessCategory(desc: string, amount: number): "revenue" | "expense" | "payroll" | "loan" | "tax" | "transfer" {
  const d = desc.toLowerCase();
  if (/salary|payroll|wages|stipend/.test(d)) return "payroll";
  if (/gst|tds|income tax|advance tax|challan|tax/.test(d)) return "tax";
  if (/emi|loan|repay|nbfc|bajaj fin|hdfc ltd/.test(d)) return "loan";
  if (/neft.*self|own account|internal|sweep|transfer to fd|rd installment/.test(d)) return "transfer";
  if (amount > 0) return "revenue";
  return "expense";
}
