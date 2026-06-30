// Parse a Tally "Masters" XML export (Gateway of Tally → Export → Masters) into
// rows our bulk endpoints accept. Dependency-free string/regex walk (Tally XML is
// large but flat). Best-effort + defensive: unknown tags are ignored, blank names
// skipped, so a messy export still imports the rows it can.

function decode(s: string): string {
  return (s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#4;/g, "")
    .trim();
}

// First <TAG>…</TAG> inner text within a block.
function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}

// NAME="…" attribute on the opening element (Tally puts the master name here).
function nameAttr(openTag: string): string {
  const m = openTag.match(/\bNAME\s*=\s*"([^"]*)"/i);
  return m ? decode(m[1]) : "";
}

function num(s: string): number {
  const n = parseFloat(String(s || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export interface TallyLedgerRow {
  name: string; group: string; is_party: boolean; is_bank: boolean;
  gstin: string; pan: string; opening_balance: number; opening_dir: "debit" | "credit";
}
export interface TallyItemRow {
  name: string; unit: string; hsn_sac: string; gst_rate: number;
  opening_qty: number; opening_value: number;
}

export interface TallyParseResult {
  ledgers: TallyLedgerRow[];
  items: TallyItemRow[];
}

const PARTY_RE = /debtor|creditor|sundry|customer|supplier|vendor/i;
const BANK_RE = /\bbank\b|cash-in-hand|cash in hand/i;

export function parseTallyMasters(xml: string): TallyParseResult {
  const ledgers: TallyLedgerRow[] = [];
  const items: TallyItemRow[] = [];
  if (!xml || typeof xml !== "string") return { ledgers, items };

  // Ledgers - <LEDGER NAME="…"> … </LEDGER>
  const ledgerRe = /<LEDGER\b([^>]*)>([\s\S]*?)<\/LEDGER>/gi;
  let m: RegExpExecArray | null;
  while ((m = ledgerRe.exec(xml))) {
    const block = m[2];
    const name = nameAttr(m[1]) || tag(block, "NAME");
    if (!name) continue;
    const group = tag(block, "PARENT");
    const ob = num(tag(block, "OPENINGBALANCE"));
    // Tally stores credit balances as negative on the master.
    ledgers.push({
      name,
      group,
      is_party: PARTY_RE.test(group),
      is_bank: BANK_RE.test(group),
      gstin: tag(block, "PARTYGSTIN") || tag(block, "GSTIN") || tag(block, "GSTREGISTRATIONNUMBER"),
      pan: tag(block, "INCOMETAXNUMBER") || tag(block, "PANNO"),
      opening_balance: Math.abs(ob),
      opening_dir: ob < 0 ? "credit" : "debit",
    });
  }

  // Stock items - <STOCKITEM NAME="…"> … </STOCKITEM>
  const itemRe = /<STOCKITEM\b([^>]*)>([\s\S]*?)<\/STOCKITEM>/gi;
  while ((m = itemRe.exec(xml))) {
    const block = m[2];
    const name = nameAttr(m[1]) || tag(block, "NAME");
    if (!name) continue;
    // GST rate can live in a few places depending on Tally version.
    const rate = num(tag(block, "GSTRATE") || tag(block, "RATEOFGST") || tag(block, "IGSTRATE"));
    items.push({
      name,
      unit: tag(block, "BASEUNITS") || tag(block, "BASICUNITS") || "Nos",
      hsn_sac: tag(block, "HSNCODE") || tag(block, "HSN"),
      gst_rate: rate,
      opening_qty: num(tag(block, "OPENINGBALANCE")),
      opening_value: num(tag(block, "OPENINGVALUE")),
    });
  }

  return { ledgers, items };
}
