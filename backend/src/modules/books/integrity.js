// §13 — INTEGRITY. A beancount-style assurance layer ON TOP of the posting engine
// (§6). It never mutates posted rows and never opens its own GL transaction by hand:
// every correcting entry it makes goes through ./posting-engine postVoucher, so the
// double-entry invariant, period locks, idempotency and audit trail all still apply.
//
// Three capabilities, ported in spirit (not code) from beancount + ERPNext + Tryton:
//   1. assertBalance  — beancount's `balance` directive: assert a ledger's running
//      balance equals a CONFIRMED figure (e.g. a bank statement) within an inferred
//      decimal tolerance. A mismatch is recorded (signed diff) for later review.
//   2. padOpening     — beancount's `pad` + Opening-Balances directive: auto-plug a
//      ledger to a target balance by posting the difference against an
//      "Opening Balance Equity" ledger (ERPNext's "Temporary Opening" account).
//   3. validation passes — duplicateVoucherCheck (Tryton/ERPNext duplicate-warning)
//      and leafOnlyCheck (beancount/Tally: never post to a parent/group account).
//
// Sign convention is the engine's: debit-positive (§10.1). A signed balance >0 is a
// net debit, <0 a net credit. `expected`/`target` are interpreted as SIGNED amounts
// unless an explicit {isDebit:true/false} (or "Dr"/"Cr") qualifier is supplied.
const { pool } = require("../../db");
const { Decimal, money, toDb, toRupees, eq } = require("./money");
const { postVoucher, PostError } = require("./posting-engine");
const { financialYearFor } = require("./fy");

// The equity account opening-balance plugs land against. ERPNext calls this the
// "Temporary Opening" / "Opening Balance Equity" account — a wash account that nets
// to zero once every opening balance is entered. Seeded lazily under Capital Account.
const OBE_LEDGER = "Opening Balance Equity";
const OBE_GROUP = "Capital Account"; // seeded EQUITY group (seed.js)

// ── helpers ──────────────────────────────────────────────────────────────────

// Resolve the SIGNED interpretation of a caller-supplied amount. We accept either a
// already-signed number/string, or a magnitude paired with a direction qualifier.
// signedFrom("1500", {isDebit:false}) → -1500 ; signedFrom("-1500") → -1500.
function signedFrom(amount, opts = {}) {
  const m = money(amount);
  if (opts.isDebit === true) return m.abs();
  if (opts.isDebit === false) return m.abs().neg();
  const dir = String(opts.dir || opts.direction || "").trim().toLowerCase();
  if (dir === "dr" || dir === "debit") return m.abs();
  if (dir === "cr" || dir === "credit") return m.abs().neg();
  return m; // already signed
}

// beancount tolerance inference: half of the smallest representable unit at the
// precision the caller WROTE the number to. "100.00" → 0.005 ; "100" → 0.5 ;
// "100.0" → 0.05. An explicit numeric tolerance always wins; a tolerance of 0 means
// EXACT equality (the engine's default elsewhere).
function inferTolerance(expectedRaw, explicit) {
  if (explicit != null && explicit !== "") return money(explicit).abs();
  const s = String(expectedRaw == null ? "" : expectedRaw).trim();
  const dot = s.indexOf(".");
  const decimals = dot === -1 ? 0 : s.length - dot - 1;
  // 0.5 * 10^-decimals, capped to the DB's NUMERIC(19,4) granularity.
  const half = new Decimal(5).times(new Decimal(10).pow(-(decimals + 1)));
  const floor = new Decimal("0.00005"); // tighter than the column can store
  return Decimal.max(half, floor);
}

// Resolve (and lazily create) the Opening Balance Equity ledger. Mirrors closing.js
// _reservesLedgerId: the group is seeded; create the ledger under it if absent.
async function _obeLedgerId(tenantId) {
  const found = await pool.query("SELECT id FROM book_ledgers WHERE tenant_id=$1 AND name=$2", [tenantId, OBE_LEDGER]);
  if (found.rows[0]) return found.rows[0].id;
  const { rows: g } = await pool.query("SELECT id FROM book_account_groups WHERE tenant_id=$1 AND name=$2", [tenantId, OBE_GROUP]);
  if (!g[0]) throw new PostError("NO_OBE_GROUP", `Group "${OBE_GROUP}" is not seeded; run seedBooks first`, 422);
  await pool.query(
    "INSERT INTO book_ledgers(tenant_id,name,group_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,name) DO NOTHING",
    [tenantId, OBE_LEDGER, g[0].id]
  );
  const again = await pool.query("SELECT id FROM book_ledgers WHERE tenant_id=$1 AND name=$2", [tenantId, OBE_LEDGER]);
  if (!again.rows[0]) throw new PostError("NO_OBE_LEDGER", "Could not create Opening Balance Equity ledger", 500);
  return again.rows[0].id;
}

// Fetch a ledger row (and its group nature) or throw. Used by everything below.
async function _ledger(tenantId, ledgerId) {
  const { rows } = await pool.query(
    `SELECT l.id, l.name, l.opening_balance, l.opening_is_debit, l.is_active, l.group_id, g.affects_pl
       FROM book_ledgers l JOIN book_account_groups g ON g.id = l.group_id
      WHERE l.tenant_id=$1 AND l.id=$2`,
    [tenantId, ledgerId]
  );
  if (!rows[0]) throw new PostError("UNKNOWN_LEDGER", "Ledger not found for this tenant", 422);
  return rows[0];
}

// The CONFIRMED signed running balance of one ledger as-of a date. Reproduces the
// carry-forward rule in reports._ledgerClosings (which is not exported): permanent
// (non-P&L) ledgers carry their book opening + ALL prior-FY net movement; P&L
// ledgers reset each FY to the book opening. Movement is summed only from
// NON-cancelled vouchers dated <= asOfDate. Debit-positive.
async function _signedBalanceAsOf(tenantId, ledger, asOfDate) {
  const fy = financialYearFor(asOfDate);
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN v.financial_year=$3 AND v.is_cancelled=false AND v.voucher_date<=$4 THEN e.debit  ELSE 0 END),0) AS dr,
       COALESCE(SUM(CASE WHEN v.financial_year=$3 AND v.is_cancelled=false AND v.voucher_date<=$4 THEN e.credit ELSE 0 END),0) AS cr,
       COALESCE(SUM(CASE WHEN v.financial_year<$3 AND v.is_cancelled=false THEN e.debit  ELSE 0 END),0) AS prior_dr,
       COALESCE(SUM(CASE WHEN v.financial_year<$3 AND v.is_cancelled=false THEN e.credit ELSE 0 END),0) AS prior_cr
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id=e.voucher_id AND v.tenant_id=e.tenant_id
      WHERE e.tenant_id=$1 AND e.ledger_id=$2`,
    [tenantId, ledger.id, fy, asOfDate]
  );
  const r = rows[0];
  const bookOpening = ledger.opening_is_debit ? money(ledger.opening_balance) : money(ledger.opening_balance).neg();
  const opening = ledger.affects_pl ? bookOpening : bookOpening.plus(money(r.prior_dr)).minus(money(r.prior_cr));
  return opening.plus(money(r.dr)).minus(money(r.cr));
}

// ── 1. assertBalance ───────────────────────────────────────────────────────────
// beancount `balance` directive. Compares the ledger's signed balance as-of a date
// against a confirmed figure within an inferred tolerance. Records EVERY assertion
// (pass or fail) in book_balance_assertions with the signed diff (actual − expected).
async function assertBalance(tenantId, params = {}) {
  const { ledgerId, asOfDate, expected, tolerance, isDebit, dir, note } = params;
  if (!ledgerId) throw new PostError("BAD_INPUT", "ledgerId is required", 400);
  if (!asOfDate) throw new PostError("BAD_INPUT", "asOfDate is required", 400);
  if (expected == null || expected === "") throw new PostError("BAD_INPUT", "expected balance is required", 400);

  const ledger = await _ledger(tenantId, ledgerId);
  const actual = await _signedBalanceAsOf(tenantId, ledger, asOfDate);
  const expectedSigned = signedFrom(expected, { isDebit, dir });
  const tol = inferTolerance(expected, tolerance);
  const diff = actual.minus(expectedSigned); // signed: +ve = ledger over-stated vs confirmed
  const passed = diff.abs().lessThanOrEqualTo(tol);

  const { rows } = await pool.query(
    `INSERT INTO book_balance_assertions
       (tenant_id, ledger_id, as_of_date, expected_signed, actual_signed, diff_signed, tolerance, passed, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, created_at`,
    [tenantId, ledgerId, asOfDate, toDb(expectedSigned), toDb(actual), toDb(diff), toDb(tol), passed, note || null]
  );

  return {
    assertionId: rows[0].id,
    ledgerId,
    ledger: ledger.name,
    asOfDate,
    expected: toRupees(expectedSigned),
    actual: toRupees(actual),
    diff: toRupees(diff),
    tolerance: toRupees(tol),
    passed,
    createdAt: rows[0].created_at,
  };
}

// ── 2. padOpening ───────────────────────────────────────────────────────────────
// beancount `pad` + ERPNext "Opening Entry". Posts a JOURNAL that moves the ledger's
// as-of balance to `target`, balancing the plug against Opening Balance Equity. The
// plug = target(signed) − current(signed). If already within an exact match, no-op.
// Idempotent via the supplied idempotencyKey (the engine dedupes on it).
async function padOpening(tenantId, actorId, params = {}, opts = {}) {
  const { ledgerId, asOfDate, target, isDebit, dir, narration } = params;
  if (!ledgerId) throw new PostError("BAD_INPUT", "ledgerId is required", 400);
  if (!asOfDate) throw new PostError("BAD_INPUT", "asOfDate is required", 400);
  if (target == null || target === "") throw new PostError("BAD_INPUT", "target balance is required", 400);

  const ledger = await _ledger(tenantId, ledgerId);
  if (!ledger.is_active) throw new PostError("UNKNOWN_LEDGER", "Ledger is inactive", 422);
  const obeId = await _obeLedgerId(tenantId);
  if (obeId === ledger.id) throw new PostError("BAD_INPUT", "Cannot pad the Opening Balance Equity ledger against itself", 422);

  const current = await _signedBalanceAsOf(tenantId, ledger, asOfDate);
  const targetSigned = signedFrom(target, { isDebit, dir });
  const plug = targetSigned.minus(current); // signed amount the ledger must move by

  if (eq(plug, 0)) {
    return { padded: false, reason: "already at target", ledgerId, ledger: ledger.name, asOfDate, current: toRupees(current), target: toRupees(targetSigned) };
  }

  // A positive plug means the ledger must gain net DEBIT → debit the ledger, credit
  // OBE. A negative plug is the mirror. The OBE leg always balances the voucher.
  const mag = toDb(plug.abs());
  const ledgerLeg = plug.greaterThan(0) ? { ledgerId, debit: mag } : { ledgerId, credit: mag };
  const obeLeg = plug.greaterThan(0) ? { ledgerId: obeId, credit: mag } : { ledgerId: obeId, debit: mag };

  const res = await postVoucher(
    tenantId,
    actorId,
    {
      voucherType: "JOURNAL",
      voucherDate: asOfDate,
      narration: narration || `Opening balance pad for "${ledger.name}" to ${toRupees(targetSigned)} [opening-pad]`,
      source: "opening-pad",
    },
    [ledgerLeg, obeLeg],
    { idempotencyKey: opts.idempotencyKey }
  );

  return {
    padded: true,
    voucherId: res.voucherId,
    voucherNumber: res.voucherNumber,
    financialYear: res.financialYear,
    replayed: !!res.replayed,
    ledgerId,
    ledger: ledger.name,
    asOfDate,
    current: toRupees(current),
    target: toRupees(targetSigned),
    plug: toRupees(plug),
    obeLedger: OBE_LEDGER,
  };
}

// ── 3. validation passes ─────────────────────────────────────────────────────────

// duplicateVoucherCheck — Tryton/ERPNext "duplicate warning". Finds groups of
// non-cancelled vouchers that share (party_ledger_id, voucher_type, voucher_date)
// AND post the same total amount (sum of debits). These are likely double-entered
// bills/receipts. Read-only: it reports, it never deletes (reversal is the user's call).
async function duplicateVoucherCheck(tenantId, opts = {}) {
  const { fy, from, to, limit } = opts;
  const params = [tenantId];
  let where = "v.tenant_id=$1 AND v.is_cancelled=false AND v.party_ledger_id IS NOT NULL";
  if (fy) { params.push(fy); where += ` AND v.financial_year=$${params.length}`; }
  if (from) { params.push(from); where += ` AND v.voucher_date>=$${params.length}`; }
  if (to) { params.push(to); where += ` AND v.voucher_date<=$${params.length}`; }
  const cap = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);

  // Per-voucher total = sum of debit legs (== credit legs by the balance invariant).
  const { rows } = await pool.query(
    `WITH totals AS (
       SELECT v.id, v.voucher_type, v.voucher_number, v.voucher_date, v.party_ledger_id,
              COALESCE(SUM(e.debit),0) AS amount
         FROM book_vouchers v
         JOIN book_voucher_entries e ON e.voucher_id=v.id AND e.tenant_id=v.tenant_id
        WHERE ${where}
        GROUP BY v.id, v.voucher_type, v.voucher_number, v.voucher_date, v.party_ledger_id
     )
     SELECT t.party_ledger_id, pl.name AS party, t.voucher_type, t.voucher_date, t.amount,
            COUNT(*) AS n,
            json_agg(json_build_object('voucherId', t.id, 'voucherNumber', t.voucher_number) ORDER BY t.voucher_number) AS vouchers
       FROM totals t
       LEFT JOIN book_ledgers pl ON pl.id=t.party_ledger_id
      GROUP BY t.party_ledger_id, pl.name, t.voucher_type, t.voucher_date, t.amount
     HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, t.amount DESC
      LIMIT $${params.length + 1}`,
    [...params, cap]
  );
  return rows.map((r) => ({
    party: r.party,
    partyLedgerId: r.party_ledger_id,
    voucherType: r.voucher_type,
    voucherDate: r.voucher_date,
    amount: toRupees(r.amount),
    count: Number(r.n),
    vouchers: r.vouchers,
  }));
}

// leafOnlyCheck — beancount/Tally: postings must hit LEAF accounts, never a parent.
// Ledgers here have no child ledgers, so a "parent" is a ledger whose GROUP still has
// CHILD GROUPS (a structural/roll-up group that should not directly carry txns — a
// more specific sub-group exists). Reports each offending ledger with its posting
// count so the user can re-map entries to a leaf group.
async function leafOnlyCheck(tenantId, opts = {}) {
  const { fy } = opts;
  const params = [tenantId];
  let movementFilter = "v.is_cancelled=false";
  if (fy) { params.push(fy); movementFilter += ` AND v.financial_year=$${params.length}`; }
  const { rows } = await pool.query(
    `SELECT l.id AS ledger_id, l.name AS ledger, g.id AS group_id, g.name AS group_name,
            COUNT(e.id) AS postings
       FROM book_ledgers l
       JOIN book_account_groups g ON g.id=l.group_id
      WHERE l.tenant_id=$1
        AND EXISTS (SELECT 1 FROM book_account_groups c WHERE c.tenant_id=l.tenant_id AND c.parent_id=g.id)
        AND EXISTS (
          SELECT 1 FROM book_voucher_entries e2
            JOIN book_vouchers v ON v.id=e2.voucher_id
           WHERE e2.ledger_id=l.id AND e2.tenant_id=l.tenant_id AND ${movementFilter})
       LEFT JOIN book_voucher_entries e ON e.ledger_id=l.id AND e.tenant_id=l.tenant_id
      GROUP BY l.id, l.name, g.id, g.name
      ORDER BY COUNT(e.id) DESC`,
    params
  );
  return rows.map((r) => ({
    ledgerId: r.ledger_id,
    ledger: r.ledger,
    groupId: r.group_id,
    group: r.group_name,
    postings: Number(r.postings),
    issue: "Posts to a group account that has sub-groups; re-map to a leaf group.",
  }));
}

// Convenience aggregate for GET /integrity/checks — runs both passes and the recent
// failed assertions in one shot.
async function runChecks(tenantId, opts = {}) {
  const [duplicates, nonLeaf, assertions] = await Promise.all([
    duplicateVoucherCheck(tenantId, opts),
    leafOnlyCheck(tenantId, opts),
    recentAssertions(tenantId, { ...opts, onlyFailed: true }),
  ]);
  return {
    duplicates,
    nonLeafPostings: nonLeaf,
    failedAssertions: assertions,
    clean: duplicates.length === 0 && nonLeaf.length === 0 && assertions.length === 0,
  };
}

// Recent balance assertions (for the checks dashboard / audit).
async function recentAssertions(tenantId, opts = {}) {
  const params = [tenantId];
  let where = "a.tenant_id=$1";
  if (opts.ledgerId) { params.push(opts.ledgerId); where += ` AND a.ledger_id=$${params.length}`; }
  if (opts.onlyFailed) where += " AND a.passed=false";
  const cap = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), 500);
  const { rows } = await pool.query(
    `SELECT a.id, a.ledger_id, l.name AS ledger, a.as_of_date, a.expected_signed, a.actual_signed,
            a.diff_signed, a.tolerance, a.passed, a.note, a.created_at
       FROM book_balance_assertions a
       LEFT JOIN book_ledgers l ON l.id=a.ledger_id
      WHERE ${where}
      ORDER BY a.created_at DESC
      LIMIT $${params.length + 1}`,
    [...params, cap]
  );
  return rows.map((r) => ({
    assertionId: r.id,
    ledgerId: r.ledger_id,
    ledger: r.ledger,
    asOfDate: r.as_of_date,
    expected: toRupees(r.expected_signed),
    actual: toRupees(r.actual_signed),
    diff: toRupees(r.diff_signed),
    tolerance: toRupees(r.tolerance),
    passed: r.passed,
    note: r.note,
    createdAt: r.created_at,
  }));
}

module.exports = {
  assertBalance,
  padOpening,
  duplicateVoucherCheck,
  leafOnlyCheck,
  runChecks,
  recentAssertions,
  // exported for tests / reuse
  inferTolerance,
  signedFrom,
  OBE_LEDGER,
};
