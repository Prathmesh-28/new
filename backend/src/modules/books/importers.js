// §12 — Bank-statement file parsers. Pure parsing, NO DB. Every parser returns
// normalized rows of the shape recon.importLines consumes:
//   { date: 'YYYY-MM-DD', amount: signed-string (debit negative), description, reference }
// Amounts are emitted as strings via ./money so we never touch JS floats.
//
// OFX/QFX logic adapted from jseutter/ofxparse (MIT License) —
//   https://github.com/jseutter/ofxparse — SGML tag scan + DTPOSTED/TRNAMT mapping.
// QIF, MT940 (SWIFT) and camt.053 (ISO-20022) follow the published format specs;
// the XML walk is a deliberate light regex scan so we add no XML dependency.
const { money, toDb } = require("./money");

// ── shared helpers ───────────────────────────────────────────────────────────
const s = (v) => (v == null ? "" : String(v).trim());

// Signed amount → string. We keep 2 dp for bank lines (toDb gives 4dp NUMERIC,
// but a bank line is a presentation/import artefact; toDb keeps it lossless).
const amt = (v) => toDb(money(v));

// Normalize many date encodings → 'YYYY-MM-DD'. Returns "" if unparseable.
function normDate(raw) {
  let v = s(raw);
  if (!v) return "";
  // OFX/QFX: YYYYMMDD[HHMMSS][.XXX][gmt] → take leading 8 digits.
  const compact = v.replace(/[^0-9]/g, "");
  if (/^\d{8}/.test(compact) && !/[/.-]/.test(v.slice(0, 4))) {
    const y = compact.slice(0, 4), m = compact.slice(4, 6), d = compact.slice(6, 8);
    if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) return `${y}-${m}-${d}`;
  }
  // ISO already: YYYY-MM-DD
  let mm = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mm) return `${mm[1]}-${mm[2]}-${mm[3]}`;
  // D/M/Y or D-M-Y (QIF & CSV, assume day-first for Indian banks) and M/D/Y fallback.
  mm = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (mm) {
    let [, a, b, y] = mm;
    if (y.length === 2) y = (+y >= 70 ? "19" : "20") + y;
    let dd = +a, mo = +b;
    if (dd > 12 && mo <= 12) { /* day-first */ } else if (mo > 12 && dd <= 12) { [dd, mo] = [mo, dd]; }
    return `${y}-${String(mo).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  // MT940 :61: value date YYMMDD
  mm = v.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (mm) {
    const y = (+mm[1] >= 70 ? "19" : "20") + mm[1];
    return `${y}-${mm[2]}-${mm[3]}`;
  }
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

// ── (1) OFX / QFX ──────────────────────────────────────────────────────────────
// OFX is SGML-ish: tags may be unclosed (value runs to next tag). We pull the
// value of a tag inside a block by reading until the next '<'. Adapted from
// jseutter/ofxparse's tag-stripping approach (MIT).
function ofxTag(block, tag) {
  const re = new RegExp("<" + tag + ">([^<\\r\\n]*)", "i");
  const m = block.match(re);
  return m ? s(m[1]) : "";
}

function parseOfx(content) {
  const text = s(content);
  if (!text) return [];
  const rows = [];
  // Each transaction is delimited by <STMTTRN> ... </STMTTRN> (close may be
  // implicit before the next <STMTTRN> or </BANKTRANLIST>).
  const re = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>|$)/gi;
  let m;
  while ((m = re.exec(text))) {
    const block = m[1];
    const date = normDate(ofxTag(block, "DTPOSTED") || ofxTag(block, "DTUSER") || ofxTag(block, "DTAVAIL"));
    const rawAmt = ofxTag(block, "TRNAMT");
    if (!date && !rawAmt) continue;
    const name = ofxTag(block, "NAME");
    const memo = ofxTag(block, "MEMO");
    const trntype = ofxTag(block, "TRNTYPE");
    // OFX TRNAMT already carries the sign (debits negative). If only TRNTYPE
    // says DEBIT and amount is positive, honour the type.
    let a = money(rawAmt || 0);
    if (a.greaterThan(0) && /^(DEBIT|PAYMENT|FEE|SRVCHG|ATM|POS|CHECK|XFER)$/i.test(trntype) && /DEBIT|PAYMENT|FEE|SRVCHG/i.test(trntype)) {
      // Only flip when type is unambiguously a debit and sign was lost.
      if (/^(DEBIT|FEE|SRVCHG)$/i.test(trntype)) a = a.neg();
    }
    const description = [name, memo].filter(Boolean).join(" - ") || trntype || "";
    rows.push({ date, amount: amt(a), description, reference: ofxTag(block, "FITID") || "" });
  }
  return rows;
}

// ── (2) QIF ────────────────────────────────────────────────────────────────────
// QIF records are separated by a line containing only "^". Field codes:
//   D=date, T/U=amount, P=payee, M=memo, N=number/cheque ref.
function parseQif(content) {
  const text = s(content);
  if (!text) return [];
  const rows = [];
  let cur = null;
  const flush = () => {
    if (cur && (cur.D != null || cur.T != null || cur.U != null)) {
      const description = [cur.P, cur.M].map(s).filter(Boolean).join(" - ");
      rows.push({
        date: normDate(cur.D),
        amount: amt((cur.T != null ? cur.T : cur.U) || 0),
        description,
        reference: s(cur.N),
      });
    }
    cur = null;
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("!")) continue; // header / type marker
    if (line === "^") { flush(); continue; }
    if (!line) continue;
    const code = line[0];
    const val = line.slice(1);
    if (!cur) cur = {};
    if (code === "T" || code === "U") {
      // QIF amounts use commas as thousands separators; strip them.
      cur[code] = val.replace(/,/g, "").trim();
    } else if ("DPMN".includes(code)) {
      cur[code] = (cur[code] ? cur[code] + " " : "") + val;
    }
  }
  flush(); // trailing record without final ^
  return rows;
}

// ── (3) ISO-20022 camt.053 ───────────────────────────────────────────────────
// Light regex/string XML walk (no XML dependency). We carve out each <Ntry>…
// </Ntry> block. CdtDbtInd Cr/Dbt sets the sign; Amt is always unsigned in camt.
// Date prefers BookgDt then ValDt (Dt or DtTm child). Description from Ustrd
// (remittance) falling back to AddtlNtryInf. Reference: NtryRef then AcctSvcrRef.
function xmlTag(block, tag) {
  // Matches <tag>..</tag> and <ns:tag>..</ns:tag>, ignoring attributes.
  const re = new RegExp("<(?:\\w+:)?" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?" + tag + ">", "i");
  const m = block.match(re);
  return m ? s(m[1]) : "";
}
function xmlTagAll(block, tag) {
  const re = new RegExp("<(?:\\w+:)?" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?" + tag + ">", "gi");
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push(s(m[1]));
  return out;
}
function camtDate(block, tag) {
  const wrap = xmlTag(block, tag);
  if (!wrap) return "";
  return normDate(xmlTag(wrap, "Dt") || xmlTag(wrap, "DtTm") || wrap);
}

function parseCamt053(xml) {
  const text = s(xml);
  if (!text) return [];
  const rows = [];
  const re = /<(?:\w+:)?Ntry(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?Ntry>/gi;
  let m;
  while ((m = re.exec(text))) {
    const block = m[1];
    const ind = xmlTag(block, "CdtDbtInd").toUpperCase();
    let a = money(xmlTag(block, "Amt") || 0).abs();
    if (ind === "DBIT") a = a.neg();
    const date = camtDate(block, "BookgDt") || camtDate(block, "ValDt");
    const ustrd = xmlTagAll(block, "Ustrd").map(s).filter(Boolean).join(" ");
    const description = ustrd || xmlTag(block, "AddtlNtryInf") || "";
    const reference = xmlTag(block, "NtryRef") || xmlTag(block, "AcctSvcrRef") || "";
    rows.push({ date, amount: amt(a), description, reference });
  }
  return rows;
}

// ── (4) SWIFT MT940 ──────────────────────────────────────────────────────────
// Statement lines are :61: (value date YYMMDD, optional entry date MMDD, D/C
// mark, amount with comma decimal), each optionally followed by :86: info.
// :61: layout: <valuedate6><entrydate4?><DC><fundscode?><amount><N><type3><refs>
function parseMt940(content) {
  const text = s(content).replace(/\r\n/g, "\n");
  if (!text) return [];
  const rows = [];
  // Split into tag tokens; tags look like ":61:" / ":86:" at line start.
  // Build statement-line + following-86 pairs.
  const lines = text.split("\n");
  let i = 0;
  let cur = null;
  const flush = () => { if (cur) rows.push(cur); cur = null; };
  while (i < lines.length) {
    const line = lines[i];
    const m61 = line.match(/^:61:(.*)$/);
    if (m61) {
      flush();
      let body = m61[1].trim();
      // Continuation lines (no new tag) belong to :61: until next :tag:.
      while (i + 1 < lines.length && !/^:\d{2}[A-Z]?:/.test(lines[i + 1]) && !/^-/.test(lines[i + 1])) {
        body += lines[i + 1].trim();
        i++;
      }
      // value date (6) [entry date (4)] D|C[R for reversal] [funds 1] amount N type ...
      const vm = body.match(/^(\d{6})(\d{4})?(R?[DC])([A-Z])?([0-9.,]+)/i);
      if (vm) {
        const valDate = vm[1];
        const dc = vm[3].toUpperCase();
        let a = money(vm[5].replace(/\./g, "").replace(",", ".") || 0).abs();
        if (/D/.test(dc)) a = a.neg(); // RD reversal of debit handled as debit sign here
        // reference: after Ntype (e.g. NTRF) → //bankref or trailing.
        const refM = body.slice(vm[0].length).match(/N[A-Z0-9]{3}([^\n/]*)(?:\/\/(\S+))?/);
        const reference = refM ? s(refM[2] || refM[1]) : "";
        cur = { date: normDate(valDate), amount: amt(a), description: "", reference };
      }
      i++;
      continue;
    }
    const m86 = line.match(/^:86:(.*)$/);
    if (m86 && cur) {
      let info = m86[1];
      while (i + 1 < lines.length && !/^:\d{2}[A-Z]?:/.test(lines[i + 1]) && !/^-/.test(lines[i + 1])) {
        info += " " + lines[i + 1].trim();
        i++;
      }
      cur.description = s(info.replace(/\s+/g, " "));
      i++;
      continue;
    }
    i++;
  }
  flush();
  return rows;
}

// ── (5) CSV (simple comma parse with header mapping) ──────────────────────────
// Maps common header names → fields. Date and amount are required-ish; debit/
// credit columns are merged into one signed amount when present.
function splitCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s);
}
function parseCsv(content) {
  const text = s(content).replace(/\r\n/g, "\n");
  if (!text) return [];
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const find = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = find("date", "txn date", "value date", "posted");
  const iAmt = find("amount", "value", "transaction");
  const iDebit = find("debit", "withdrawal", "dr");
  const iCredit = find("credit", "deposit", "cr");
  const iDesc = find("description", "narration", "particulars", "payee", "details", "memo");
  const iRef = find("reference", "ref", "cheque", "chq", "utr");
  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    const cleanNum = (v) => s(v).replace(/[, ]/g, "");
    let a;
    if (iDebit >= 0 || iCredit >= 0) {
      const dr = iDebit >= 0 ? cleanNum(cols[iDebit]) : "";
      const cr = iCredit >= 0 ? cleanNum(cols[iCredit]) : "";
      if (cr) a = money(cr).abs();
      else if (dr) a = money(dr).abs().neg();
      else a = money(0);
    } else {
      a = money(iAmt >= 0 ? cleanNum(cols[iAmt]) : 0);
    }
    rows.push({
      date: normDate(iDate >= 0 ? cols[iDate] : ""),
      amount: amt(a),
      description: iDesc >= 0 ? s(cols[iDesc]) : "",
      reference: iRef >= 0 ? s(cols[iRef]) : "",
    });
  }
  return rows;
}

// ── dispatcher ────────────────────────────────────────────────────────────────
function parseStatement(format, content) {
  switch (s(format).toLowerCase()) {
    case "ofx":
    case "qfx": return parseOfx(content);
    case "qif": return parseQif(content);
    case "camt053":
    case "camt": return parseCamt053(content);
    case "mt940": return parseMt940(content);
    case "csv": return parseCsv(content);
    default: throw new Error(`unknown statement format: ${format}`);
  }
}

module.exports = { parseOfx, parseQif, parseCamt053, parseMt940, parseStatement };
