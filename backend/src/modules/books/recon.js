// §11 — Bank reconciliation bridge. Imported bank lines auto-match to vouchers;
// unmatched lines get a suggested RECEIPT/PAYMENT the user confirms in one tap,
// which posts a balanced voucher. Keeps the ledger pristine while feeling effortless.
const { pool } = require("../../db");
const { money, toDb, toRupees, eq } = require("./money");
const { postVoucher, PostError } = require("./posting-engine");
const rulesEngine = require("./rules");

// ── Pure helpers (testable) ──────────────────────────────────────────────────
const classifyLine = (amount) => (money(amount).greaterThan(0) ? "RECEIPT" : "PAYMENT");
function daysBetween(a, b) {
  return Math.abs(Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000));
}
// A bank line matches a voucher's bank-ledger entry when the amount lines up on
// the correct side and the dates are within tolerance.
function lineMatches(line, entry, voucherDate, toleranceDays) {
  const amt = money(line.amount);
  const sideOk = amt.greaterThan(0) ? eq(entry.debit, amt) : eq(entry.credit, amt.neg());
  return sideOk && daysBetween(line.txn_date, voucherDate) <= toleranceDays;
}

// ── Import + match ───────────────────────────────────────────────────────────
async function importLines(tenantId, bankLedgerId, lines) {
  if (!bankLedgerId || !Array.isArray(lines)) throw new PostError("BAD_INPUT", "bankLedgerId and lines[] required", 400);
  // Build normalised row objects the TransactionRules engine understands, run the
  // tenant's active rule_groups/rules over them, then persist the result. This
  // replaces the old read-only keyword matcher with a full Firefly-III-style engine:
  // import now auto-categorises (category / suggested ledger / tags / flag).
  const rowObjs = lines.map((l) => ({
    bank_ledger_id: bankLedgerId,
    txn_date: l.date,
    amount: toDb(l.amount),
    description: l.description || null,
    reference: l.reference || null,
    category: null,
    suggested_ledger_id: null,
    tags: [],
    flagged: false,
  }));
  const { rows: categorised, fired } = await rulesEngine.applyRules(tenantId, rowObjs);
  // Map each row index → the LAST rule that fired on it (the one whose actions stuck).
  const lastRuleByRow = {};
  for (const f of fired) lastRuleByRow[f.index] = f.ruleId;

  let inserted = 0;
  for (let i = 0; i < categorised.length; i++) {
    const r = categorised[i];
    await pool.query(
      `INSERT INTO book_bank_lines
         (tenant_id,bank_ledger_id,txn_date,amount,description,reference,category,suggested_ledger_id,tags,flagged,applied_rule_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        tenantId, bankLedgerId, r.txn_date, toDb(r.amount), r.description, r.reference,
        r.category || null, r.suggested_ledger_id || null,
        Array.isArray(r.tags) ? r.tags : [], !!r.flagged,
        lastRuleByRow[i] || null,
      ]
    );
    inserted += 1;
  }
  return { inserted, autoCategorised: fired.length };
}

async function autoMatch(tenantId, toleranceDays = 3) {
  const { rows: lines } = await pool.query("SELECT * FROM book_bank_lines WHERE tenant_id=$1 AND status='UNMATCHED'", [tenantId]);
  let matched = 0;
  for (const line of lines) {
    const { rows: cand } = await pool.query(
      `SELECT v.id, v.voucher_date, e.debit, e.credit
         FROM book_voucher_entries e
         JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false
        WHERE e.tenant_id=$1 AND e.ledger_id=$2
          AND v.id NOT IN (SELECT voucher_id FROM book_bank_lines WHERE voucher_id IS NOT NULL)
          AND v.voucher_date BETWEEN ($3::date - $5::int) AND ($3::date + $5::int)`,
      [tenantId, line.bank_ledger_id, line.txn_date, line.amount, toleranceDays]
    );
    const hit = cand.find((c) => lineMatches(line, c, c.voucher_date, toleranceDays));
    if (hit) { await pool.query("UPDATE book_bank_lines SET status='MATCHED', voucher_id=$2 WHERE id=$1", [line.id, hit.id]); matched += 1; }
  }
  return { matched, scanned: lines.length };
}

async function inbox(tenantId) {
  const { rows } = await pool.query("SELECT * FROM book_bank_lines WHERE tenant_id=$1 AND status='UNMATCHED' ORDER BY txn_date DESC LIMIT 500", [tenantId]);
  return rows.map((l) => ({ ...l, suggestion: { kind: classifyLine(l.amount) } }));
}

// One-tap confirm: build the suggested RECEIPT/PAYMENT against a counter ledger and post.
async function confirmLine(tenantId, actorId, lineId, counterLedgerId) {
  if (!counterLedgerId) throw new PostError("BAD_INPUT", "counterLedgerId required", 400);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the line so concurrent confirms can't both read it as UNMATCHED and double-post.
    const { rows: lr } = await client.query("SELECT * FROM book_bank_lines WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, lineId]);
    const line = lr[0];
    if (!line) throw new PostError("NOT_FOUND", "Bank line not found", 404);
    // Reject any line that isn't still UNMATCHED — MATCHED lines already carry a voucher,
    // POSTED/IGNORED are terminal — re-posting any of them would double-count cash.
    if (line.status !== "UNMATCHED") throw new PostError("BAD_STATE", "Line already " + line.status, 409);
    const amt = money(line.amount);
    const isReceipt = amt.greaterThan(0);
    const abs = toDb(amt.abs());
    const entries = isReceipt
      ? [{ ledgerId: line.bank_ledger_id, debit: abs, credit: "0" }, { ledgerId: counterLedgerId, debit: "0", credit: abs }]
      : [{ ledgerId: counterLedgerId, debit: abs, credit: "0" }, { ledgerId: line.bank_ledger_id, debit: "0", credit: abs }];
    const r = await postVoucher(
      tenantId,
      actorId,
      { voucherType: isReceipt ? "RECEIPT" : "PAYMENT", voucherDate: line.txn_date, narration: line.description || "Bank reconciliation", reference: line.reference, source: "import" },
      entries,
      { idempotencyKey: "recon:" + lineId }
    );
    // Conditional update: only flip to POSTED if the row is still UNMATCHED.
    const { rowCount } = await client.query(
      "UPDATE book_bank_lines SET status='POSTED', voucher_id=$2 WHERE id=$1 AND status='UNMATCHED'",
      [lineId, r.voucherId]
    );
    if (rowCount !== 1) throw new PostError("BAD_STATE", "Line already posted", 409);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

// Manually reconcile a known bank/cash voucher WITHOUT an imported statement line.
// We don't carry a per-voucher "reconciled" flag, and bankRecStatement treats any
// book_bank_line in ('MATCHED','POSTED') as reconciled — so we materialise a single
// POSTED line (amount = the voucher's net bank-side movement) linked to the voucher.
// Idempotent: if a book_bank_line already references this voucher, do nothing.
async function markCleared(tenantId, { voucherId } = {}) {
  if (!voucherId) throw new PostError("BAD_INPUT", "voucherId required", 400);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the voucher so two concurrent markCleared calls can't both insert.
    const { rows: vr } = await client.query(
      "SELECT id, voucher_date FROM book_vouchers WHERE tenant_id=$1 AND id=$2 AND is_cancelled=false FOR UPDATE",
      [tenantId, voucherId]
    );
    const v = vr[0];
    if (!v) throw new PostError("NOT_FOUND", "Voucher not found", 404);
    // Already reconciled? bail out idempotently with the existing line.
    const { rows: existing } = await client.query(
      "SELECT * FROM book_bank_lines WHERE tenant_id=$1 AND voucher_id=$2",
      [tenantId, voucherId]
    );
    if (existing[0]) { await client.query("COMMIT"); return { ok: true, alreadyCleared: true, lineId: existing[0].id, bankLedgerId: existing[0].bank_ledger_id }; }
    // Find the voucher's bank/cash-side entry. book_ledgers has no "kind" — banks
    // carry is_bank=true; cash ledgers live under a Cash group (name ILIKE %cash%).
    // Net it (debit - credit) so the sign matches imported lines (+inflow/-outflow).
    const { rows: bankEntries } = await client.query(
      `SELECT e.ledger_id, COALESCE(SUM(e.debit),0)-COALESCE(SUM(e.credit),0) AS net
         FROM book_voucher_entries e
         JOIN book_ledgers l ON l.id=e.ledger_id
         JOIN book_account_groups g ON g.id=l.group_id
        WHERE e.tenant_id=$1 AND e.voucher_id=$2 AND (l.is_bank=true OR g.name ILIKE '%cash%')
        GROUP BY e.ledger_id`,
      [tenantId, voucherId]
    );
    if (bankEntries.length === 0) throw new PostError("BAD_STATE", "Voucher has no bank/cash entry to clear", 409);
    if (bankEntries.length > 1) throw new PostError("BAD_STATE", "Voucher touches multiple bank/cash ledgers; clear via statement import", 409);
    const be = bankEntries[0];
    const { rows: ins } = await client.query(
      "INSERT INTO book_bank_lines(tenant_id,bank_ledger_id,txn_date,amount,description,reference,status,voucher_id) VALUES($1,$2,$3,$4,$5,$6,'POSTED',$7) RETURNING id",
      [tenantId, be.ledger_id, v.voucher_date, toDb(money(be.net)), "Manually cleared", null, voucherId]
    );
    await client.query("COMMIT");
    return { ok: true, alreadyCleared: false, lineId: ins[0].id, bankLedgerId: be.ledger_id };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

// Read-only rule engine: auto-categorise imported lines by keyword→ledger rules.
// rules = [{ match, ledgerId }]; match is a case-insensitive substring tested
// against the line description/reference. First matching rule wins. Pure
// suggestion — never posts. Returns each line with a suggestedLedgerId (or null)
// plus the inherited RECEIPT/PAYMENT kind from classifyLine.
function applyRules(tenantId, lines, rules) {
  const ls = Array.isArray(lines) ? lines : [];
  const rs = (Array.isArray(rules) ? rules : []).filter((r) => r && r.match && r.ledgerId);
  const norm = rs.map((r) => ({ needle: String(r.match).toLowerCase(), ledgerId: r.ledgerId }));
  return ls.map((l) => {
    const hay = ((l.description || "") + " " + (l.reference || "")).toLowerCase();
    const hit = norm.find((r) => hay.includes(r.needle));
    return { ...l, suggestedLedgerId: hit ? hit.ledgerId : null, suggestedKind: classifyLine(l.amount) };
  });
}

async function ignoreLine(tenantId, lineId) {
  await pool.query("UPDATE book_bank_lines SET status='IGNORED' WHERE tenant_id=$1 AND id=$2", [tenantId, lineId]);
  return { ok: true };
}

// Bank reconciliation statement: book balance (from entries) vs reconciled lines.
async function bankRecStatement(tenantId, bankLedgerId) {
  const { rows: bk } = await pool.query(
    "SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) AS bal FROM book_voucher_entries e JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false WHERE e.tenant_id=$1 AND e.ledger_id=$2",
    [tenantId, bankLedgerId]
  );
  const { rows: rc } = await pool.query(
    "SELECT COALESCE(SUM(amount),0) AS rec FROM book_bank_lines WHERE tenant_id=$1 AND bank_ledger_id=$2 AND status IN ('MATCHED','POSTED')",
    [tenantId, bankLedgerId]
  );
  const { rows: un } = await pool.query("SELECT COUNT(*)::int AS n FROM book_bank_lines WHERE tenant_id=$1 AND bank_ledger_id=$2 AND status='UNMATCHED'", [tenantId, bankLedgerId]);
  const bookBal = money(bk[0].bal), reconciled = money(rc[0].rec);
  return { bankLedgerId, bookBalance: toRupees(bookBal), reconciledStatementBalance: toRupees(reconciled), difference: toRupees(bookBal.minus(reconciled)), unmatchedLines: un[0].n };
}

module.exports = { classifyLine, daysBetween, lineMatches, importLines, autoMatch, inbox, confirmLine, ignoreLine, bankRecStatement, markCleared, applyRules };
