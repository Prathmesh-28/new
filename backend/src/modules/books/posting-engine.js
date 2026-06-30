// §6 - THE POSTING ENGINE. The only path through which anything reaches the
// ledger. If postVoucher is correct, the books are correct. It knows nothing
// about invoices or GST - only ledgers, debits and credits.
const { pool } = require("../../db");
const { money, sum, toDb, eq } = require("./money");
const { financialYearFor, periodMonthFor } = require("./fy");

class PostError extends Error {
  constructor(code, message, http) {
    super(message || code);
    this.code = code;
    this.http = http || 422;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// §6.2 step 2 - the balance invariant, validated before we ever open a txn.
function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new PostError("EMPTY_VOUCHER", "A voucher needs at least one entry", 422);
  }
  for (const e of entries) {
    const d = money(e.debit || 0);
    const c = money(e.credit || 0);
    if (d.lessThan(0) || c.lessThan(0)) throw new PostError("BAD_LINE", "Amounts cannot be negative", 422);
    const dPos = d.greaterThan(0);
    const cPos = c.greaterThan(0);
    if (dPos === cPos) throw new PostError("BAD_LINE", "Each line must be exactly one of debit or credit", 422);
  }
  const totalDr = sum(entries.map((e) => e.debit || 0));
  const totalCr = sum(entries.map((e) => e.credit || 0));
  if (!eq(totalDr, totalCr)) throw new PostError("UNBALANCED", `Debits ${toDb(totalDr)} ≠ credits ${toDb(totalCr)}`, 422);
  if (!totalDr.greaterThan(0)) throw new PostError("EMPTY_VOUCHER", "Voucher total is zero", 422);
  return totalDr;
}

// Core insert, given an open client (so reverseVoucher can compose it atomically).
async function _post(client, tenantId, actorId, voucher, entries, opts = {}) {
  const fy = financialYearFor(voucher.voucherDate);
  const month = periodMonthFor(voucher.voucherDate);

  // 1. Idempotency - a retried request must not double-post.
  if (opts.idempotencyKey) {
    const { rows } = await client.query(
      "SELECT id, voucher_number, financial_year FROM book_vouchers WHERE tenant_id=$1 AND idempotency_key=$2",
      [tenantId, opts.idempotencyKey]
    );
    if (rows[0]) return { voucherId: rows[0].id, voucherNumber: Number(rows[0].voucher_number), financialYear: rows[0].financial_year, replayed: true };
  }

  // 3. Period must be open (absent row = OPEN by default).
  const { rows: per } = await client.query(
    "SELECT status FROM book_periods WHERE tenant_id=$1 AND financial_year=$2 AND period_month=$3",
    [tenantId, fy, month]
  );
  if (per[0] && per[0].status !== "OPEN") throw new PostError("PERIOD_LOCKED", `Period ${fy} M${month} is ${per[0].status}`, 409);

  // 4. Ledgers exist, active, same tenant.
  const ids = [...new Set(entries.map((e) => e.ledgerId))];
  const { rows: led } = await client.query(
    "SELECT id FROM book_ledgers WHERE tenant_id=$1 AND id = ANY($2::uuid[]) AND is_active = true",
    [tenantId, ids]
  );
  if (led.length !== ids.length) throw new PostError("UNKNOWN_LEDGER", "A ledger is missing, inactive or from another tenant", 422);

  // 5. Gap-free voucher number - atomic counter row, rolls back with the txn (§6.4).
  const { rows: cnt } = await client.query(
    `INSERT INTO book_voucher_counters(tenant_id, voucher_type, financial_year, next_number)
       VALUES($1,$2,$3,2)
     ON CONFLICT(tenant_id, voucher_type, financial_year)
       DO UPDATE SET next_number = book_voucher_counters.next_number + 1
     RETURNING next_number - 1 AS number`,
    [tenantId, voucher.voucherType, fy]
  );
  const number = Number(cnt[0].number);

  // 6. Header.
  const { rows: vh } = await client.query(
    `INSERT INTO book_vouchers
       (tenant_id, voucher_type, voucher_number, voucher_date, financial_year, narration, reference,
        party_ledger_id, reverses_voucher_id, idempotency_key, source, created_by, currency, fx_rate, branch_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [tenantId, voucher.voucherType, number, voucher.voucherDate, fy, voucher.narration || null, voucher.reference || null,
     voucher.partyLedgerId || null, opts.reversesVoucherId || null, opts.idempotencyKey || null, voucher.source || "api", actorId || null,
     voucher.currency || "INR", voucher.fxRate || 1, voucher.branchId || null]
  );
  const voucherId = vh[0].id;

  // 7. Lines.
  let order = 0;
  for (const e of entries) {
    await client.query(
      "INSERT INTO book_voucher_entries(tenant_id, voucher_id, ledger_id, debit, credit, entry_order, cost_centre_id, tags) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [tenantId, voucherId, e.ledgerId, toDb(e.debit || 0), toDb(e.credit || 0), order++, e.costCentreId || null, e.tags ? JSON.stringify(e.tags) : null]
    );
  }

  // 8. Tax side-records (authoritative breakdown captured at posting time).
  for (const t of opts.taxes || []) {
    await client.query(
      `INSERT INTO book_tax_entries(tenant_id, voucher_id, line_entry_id, tax_kind, rate, taxable_value, tax_amount, hsn_sac, is_input, place_of_supply, supply_type, counterparty_gstin)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [tenantId, voucherId, t.lineEntryId || null, t.taxKind, toDb(t.rate), toDb(t.taxableValue), toDb(t.taxAmount), t.hsnSac || null, !!t.isInput, t.placeOfSupply || null, t.supplyType || "REGULAR", t.counterpartyGstin || null]
    );
  }

  // 9. Incremental balance snapshots (debit-positive convention, §10.1).
  const byLedger = new Map();
  for (const e of entries) {
    const a = byLedger.get(e.ledgerId) || { d: money(0), c: money(0) };
    a.d = a.d.plus(money(e.debit || 0));
    a.c = a.c.plus(money(e.credit || 0));
    byLedger.set(e.ledgerId, a);
  }
  for (const [ledgerId, a] of byLedger) {
    await client.query(
      `INSERT INTO book_ledger_balances(tenant_id, ledger_id, financial_year, period_month, opening_signed, total_debit, total_credit, closing_signed, updated_at)
         VALUES($1,$2,$3,$4,0,$5,$6,$7,now())
       ON CONFLICT(tenant_id, ledger_id, financial_year, period_month)
         DO UPDATE SET total_debit = book_ledger_balances.total_debit + $5,
                       total_credit = book_ledger_balances.total_credit + $6,
                       closing_signed = book_ledger_balances.opening_signed
                                        + (book_ledger_balances.total_debit + $5)
                                        - (book_ledger_balances.total_credit + $6),
                       updated_at = now()`,
      [tenantId, ledgerId, fy, month, toDb(a.d), toDb(a.c), toDb(a.d.minus(a.c))]
    );
  }

  // 10. Audit.
  await client.query(
    "INSERT INTO book_audit_log(tenant_id, actor_id, action, entity, entity_id, detail) VALUES($1,$2,$3,$4,$5,$6)",
    [tenantId, actorId || null, opts.reversesVoucherId ? "voucher.reverse" : "voucher.post", "voucher", voucherId,
     JSON.stringify({ type: voucher.voucherType, number, fy, source: voucher.source || "api" })]
  );

  return { voucherId, voucherNumber: number, financialYear: fy };
}

// §6.1 - the public function. Wraps _post in a REPEATABLE READ txn with
// serialization-failure retry and idempotency-race handling.
async function postVoucher(tenantId, actorId, voucher, entries, opts = {}) {
  validateEntries(entries);
  let attempt = 0;
  for (;;) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const res = await _post(client, tenantId, actorId, voucher, entries, opts);
      await client.query("COMMIT");
      return res;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      // Idempotency race: a concurrent identical request inserted first → return it.
      if (err.code === "23505" && opts.idempotencyKey && /idempotency/i.test(`${err.constraint || ""}${err.detail || ""}`)) {
        const { rows } = await pool.query("SELECT id, voucher_number, financial_year FROM book_vouchers WHERE tenant_id=$1 AND idempotency_key=$2", [tenantId, opts.idempotencyKey]);
        if (rows[0]) return { voucherId: rows[0].id, voucherNumber: Number(rows[0].voucher_number), financialYear: rows[0].financial_year, replayed: true };
      }
      if (err.code === "40001" && attempt < 3) { attempt += 1; await sleep(20 * attempt); continue; } // serialization_failure
      throw err;
    } finally {
      client.release();
    }
  }
}

// §6.5 - the ONLY way to "edit" or "delete": post a mirror voucher and flag the
// original cancelled, atomically.
async function reverseVoucher(tenantId, actorId, voucherId, opts = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const { rows: vr } = await client.query("SELECT * FROM book_vouchers WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, voucherId]);
    const orig = vr[0];
    if (!orig) throw new PostError("NOT_FOUND", "Voucher not found", 404);
    if (orig.is_cancelled) throw new PostError("ALREADY_CANCELLED", "Voucher already reversed", 409);

    const { rows: ents } = await client.query("SELECT ledger_id, debit, credit FROM book_voucher_entries WHERE voucher_id=$1 ORDER BY entry_order", [voucherId]);
    const { rows: taxes } = await client.query("SELECT * FROM book_tax_entries WHERE voucher_id=$1", [voucherId]);

    // Mirror: swap every debit and credit.
    const mirror = ents.map((e) => ({ ledgerId: e.ledger_id, debit: toDb(e.credit), credit: toDb(e.debit) }));
    validateEntries(mirror); // balanced by construction; assert anyway
    const mirrorTaxes = taxes.map((t) => ({
      taxKind: t.tax_kind, rate: t.rate,
      taxableValue: money(t.taxable_value).neg(), taxAmount: money(t.tax_amount).neg(),
      hsnSac: t.hsn_sac, isInput: t.is_input, placeOfSupply: t.place_of_supply,
    }));

    const date = opts.date || new Date().toISOString().slice(0, 10);
    const res = await _post(client, tenantId, actorId, {
      voucherType: orig.voucher_type, voucherDate: date,
      narration: `Reversal of ${orig.voucher_type} #${orig.voucher_number}`,
      reference: orig.reference, partyLedgerId: orig.party_ledger_id, source: "manual",
    }, mirror, { taxes: mirrorTaxes, reversesVoucherId: voucherId });

    await client.query("UPDATE book_vouchers SET is_cancelled=true, cancelled_by_voucher_id=$2 WHERE id=$1", [voucherId, res.voucherId]);
    await client.query("COMMIT");
    return res;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { postVoucher, reverseVoucher, validateEntries, PostError };
