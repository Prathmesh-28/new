// §11 — Bank reconciliation bridge. Imported bank lines auto-match to vouchers;
// unmatched lines get a suggested RECEIPT/PAYMENT the user confirms in one tap,
// which posts a balanced voucher. Keeps the ledger pristine while feeling effortless.
const { pool } = require("../../db");
const { money, toDb, toRupees, eq } = require("./money");
const { postVoucher, PostError } = require("./posting-engine");

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
  let inserted = 0;
  for (const l of lines) {
    await pool.query(
      "INSERT INTO book_bank_lines(tenant_id,bank_ledger_id,txn_date,amount,description,reference) VALUES($1,$2,$3,$4,$5,$6)",
      [tenantId, bankLedgerId, l.date, toDb(l.amount), l.description || null, l.reference || null]
    );
    inserted += 1;
  }
  return { inserted };
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

module.exports = { classifyLine, daysBetween, lineMatches, importLines, autoMatch, inbox, confirmLine, ignoreLine, bankRecStatement };
