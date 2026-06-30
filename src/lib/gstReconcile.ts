// ── GSTR-2B ITC reconciliation ────────────────────────────────────────────────
// Matches a business's purchase register against the GSTN-auto-drafted GSTR-2B to
// surface where input-tax-credit (ITC) is at risk. Fully offline + deterministic -
// the user downloads their 2B JSON from the GST portal and uploads their purchase
// register (Excel/CSV); we reconcile by supplier GSTIN + invoice number.
//
// Buckets:
//   matched          - in both, tax agrees → ITC safe to claim
//   mismatch         - in both, tax differs → fix before claiming
//   missing_in_2b    - in your books, NOT in 2B → supplier hasn't filed; ITC blocked
//   missing_in_books - in 2B, NOT in your books → record it / claim available ITC

export interface ReconLine {
  gstin: string;
  party?: string;
  invoiceNo: string;
  date?: string;
  taxable: number;
  tax: number; // total GST (igst + cgst + sgst + cess)
}

export type ReconStatus = "matched" | "mismatch" | "missing_in_2b" | "missing_in_books";

export interface ReconResult {
  key: string;
  gstin: string;
  party?: string;
  invoiceNo: string;
  status: ReconStatus;
  registerTax: number;
  twoBTax: number;
  delta: number; // registerTax - twoBTax
}

export interface ReconSummary {
  counts: Record<ReconStatus, number>;
  registerTaxTotal: number;
  twoBTaxTotal: number;
  matchedTax: number;
  itcAtRisk: number;     // claimed in books but not (yet) in 2B → likely disallowed
  itcAvailableUnclaimed: number; // in 2B but not in your books → record + claim
  mismatchDelta: number; // net tax difference on mismatched invoices
}

const n = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v.replace(/[, ₹]/g, "")) : Number(v);
  return Number.isFinite(x) ? x : 0;
};

const keyOf = (gstin: string, inv: string) =>
  `${(gstin || "").toUpperCase().trim()}|${(inv || "").replace(/\s+/g, "").toUpperCase()}`;

// Parse the official GSTN GSTR-2B JSON (portal download). Tolerant of the tax
// living either at invoice level (igst/cgst/sgst/cess) or inside an items array.
export function parse2BJson(raw: string): ReconLine[] {
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw new Error("Not valid JSON - download the 2B as JSON from the GST portal."); }
  // Find the b2b array wherever it sits (data.docdata.b2b is the canonical path).
  const root = json as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const docdata = (data.docdata ?? data) as Record<string, unknown>;
  const b2b = (docdata.b2b ?? (data as Record<string, unknown>).b2b) as unknown[] | undefined;
  if (!Array.isArray(b2b)) throw new Error("Couldn't find B2B invoices in this file - is it a GSTR-2B JSON?");

  const out: ReconLine[] = [];
  for (const sup of b2b as Record<string, unknown>[]) {
    const gstin = String(sup.ctin ?? sup.gstin ?? "");
    const party = (sup.trdnm ?? sup.supname ?? sup.cfs) as string | undefined;
    const invs = (sup.inv ?? []) as Record<string, unknown>[];
    for (const inv of invs) {
      const items = (inv.itms ?? inv.items ?? []) as Record<string, unknown>[];
      let igst = n(inv.igst), cgst = n(inv.cgst), sgst = n(inv.sgst), cess = n(inv.cess), txval = n(inv.txval);
      if (items.length) {
        igst = cgst = sgst = cess = txval = 0;
        for (const it of items) {
          const d = (it.itm_det ?? it) as Record<string, unknown>;
          igst += n(d.igst); cgst += n(d.cgst); sgst += n(d.sgst); cess += n(d.cess); txval += n(d.txval);
        }
      }
      out.push({
        gstin,
        party,
        invoiceNo: String(inv.inum ?? inv.invoiceNo ?? ""),
        date: inv.dt ? String(inv.dt) : undefined,
        taxable: txval,
        tax: igst + cgst + sgst + cess,
      });
    }
  }
  return out;
}

// Map already-parsed spreadsheet rows (objects keyed by header) into ReconLines.
// Header matching is fuzzy so common purchase-register layouts work.
export function parseRegisterRows(rows: Record<string, unknown>[]): ReconLine[] {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const find = (...needles: string[]) =>
    headers.find(h => needles.some(nd => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(nd)));
  const hGstin = find("gstin", "ctin", "suppliergst");
  const hInv   = find("invoiceno", "invno", "billno", "invoicenumber", "documentno");
  const hParty = find("supplier", "party", "vendor", "name", "trade");
  const hDate  = find("invoicedate", "date", "billdate");
  const hTaxable = find("taxablevalue", "taxable", "amount", "value");
  // Resolve the total-tax column AFTER taxable so a "Taxable Value" header (which
  // contains "tax") isn't mistaken for the tax amount.
  const hTax   = headers.find(h => h !== hTaxable &&
    ["totaltax", "taxamount", "gstamount", "totaltaxamount", "tax"].some(nd => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(nd)));
  const hIgst  = find("igst");
  const hCgst  = find("cgst");
  const hSgst  = find("sgst");
  const hCess  = find("cess");

  return rows
    .map(r => {
      const tax = hTax && r[hTax] != null && n(r[hTax]) !== 0
        ? n(r[hTax])
        : n(hIgst && r[hIgst]) + n(hCgst && r[hCgst]) + n(hSgst && r[hSgst]) + n(hCess && r[hCess]);
      return {
        gstin: hGstin ? String(r[hGstin] ?? "") : "",
        party: hParty ? String(r[hParty] ?? "") : undefined,
        invoiceNo: hInv ? String(r[hInv] ?? "") : "",
        date: hDate ? String(r[hDate] ?? "") : undefined,
        taxable: hTaxable ? n(r[hTaxable]) : 0,
        tax,
      };
    })
    .filter(l => l.gstin && l.invoiceNo);
}

export function reconcile(register: ReconLine[], twoB: ReconLine[]): { summary: ReconSummary; lines: ReconResult[] } {
  const regMap = new Map<string, ReconLine>();
  for (const l of register) regMap.set(keyOf(l.gstin, l.invoiceNo), l);
  const twoBMap = new Map<string, ReconLine>();
  for (const l of twoB) twoBMap.set(keyOf(l.gstin, l.invoiceNo), l);

  const lines: ReconResult[] = [];
  const keys = new Set([...regMap.keys(), ...twoBMap.keys()]);
  const tol = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, 0.01 * Math.max(Math.abs(a), Math.abs(b)));

  for (const key of keys) {
    const r = regMap.get(key);
    const b = twoBMap.get(key);
    const src = r ?? b!;
    const registerTax = r ? r.tax : 0;
    const twoBTax = b ? b.tax : 0;
    let status: ReconStatus;
    if (r && b) status = tol(registerTax, twoBTax) ? "matched" : "mismatch";
    else if (r) status = "missing_in_2b";
    else status = "missing_in_books";
    lines.push({
      key, gstin: src.gstin, party: src.party, invoiceNo: src.invoiceNo,
      status, registerTax, twoBTax, delta: registerTax - twoBTax,
    });
  }

  const counts: Record<ReconStatus, number> = { matched: 0, mismatch: 0, missing_in_2b: 0, missing_in_books: 0 };
  let matchedTax = 0, itcAtRisk = 0, itcAvailableUnclaimed = 0, mismatchDelta = 0;
  for (const l of lines) {
    counts[l.status]++;
    if (l.status === "matched") matchedTax += l.twoBTax;
    else if (l.status === "missing_in_2b") itcAtRisk += l.registerTax;
    else if (l.status === "missing_in_books") itcAvailableUnclaimed += l.twoBTax;
    else if (l.status === "mismatch") mismatchDelta += l.delta;
  }

  // Order: problems first (at-risk, then mismatch, then available), matched last.
  const rank: Record<ReconStatus, number> = { missing_in_2b: 0, mismatch: 1, missing_in_books: 2, matched: 3 };
  lines.sort((a, b) => rank[a.status] - rank[b.status] || Math.abs(b.delta) - Math.abs(a.delta));

  return {
    summary: {
      counts,
      registerTaxTotal: register.reduce((s, l) => s + l.tax, 0),
      twoBTaxTotal: twoB.reduce((s, l) => s + l.tax, 0),
      matchedTax, itcAtRisk, itcAvailableUnclaimed, mismatchDelta,
    },
    lines,
  };
}
