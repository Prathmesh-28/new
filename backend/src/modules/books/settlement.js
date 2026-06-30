// §M - Settlement-grade PSP payout reconciliation. Hyperswitch-style: a payment
// processor (Razorpay/Stripe/Cashfree/PayU) periodically dumps a *payout file* -
// one row per captured transaction carrying the customer's GROSS charge, the PSP
// FEE, the GST/TAX on that fee, the NET amount actually deposited to our bank, and
// the bank UTR of the batch deposit. Settlement reconciliation answers three
// questions, money-exactly:
//   1. Did the NET the PSP says it paid actually land in our bank?        (bank side)
//   2. Does the GROSS tie back to an invoice payment / receipt we booked? (book side)
//   3. Is fee + tax exactly gross − net, and within our negotiated rate?  (fee side)
// Any deviation becomes an auto-flagged EXCEPTION a human resolves in the UI.
//
// Design ported (not copied) from juspay/hyperswitch's reconciliation engine: a
// payout row moves through an EXPECTED → POSTED lifecycle, and matching is driven
// by *rules* with three clauses - a filter (When this rule applies), an identifier
// (How we find the counterpart) and a validation (What must hold for a match to be
// accepted). Rules carry a priority; the highest-priority rule that both applies
// and validates wins. firefly-iii contributes the filter/validate split; beancount
// the "every expected leg must find exactly one posted leg" invariant; getlago the
// fee/tax decomposition; erpnext the payment-entry reconciliation shape.
//
// This module NEVER mutates posted GL rows. It reads bank lines (recon.js) and
// receipt vouchers, and records its findings in its own tables. Booking the missing
// fee expense (when the user resolves a FEE exception) goes through postVoucher.
const { pool } = require("../../db");
const { money, toDb, toRupees, eq, gt } = require("./money");
const { PostError } = require("./posting-engine");
const { financialYearFor } = require("./fy");
const { daysBetween } = require("./recon"); // reuse the existing date-tolerance helper

// ── Provider fee profiles ──────────────────────────────────────────────────────
// Each PSP advertises a fee % + a GST rate on that fee. We don't hardcode money -
// only the negotiated *rate* used to sanity-check the fee column in the file. A
// tenant can override per provider later; these are conservative Indian defaults.
const PROVIDER_PROFILES = {
  razorpay: { feePct: "2.00", gstPct: "18", label: "Razorpay" },
  cashfree: { feePct: "1.95", gstPct: "18", label: "Cashfree" },
  payu:     { feePct: "2.00", gstPct: "18", label: "PayU" },
  stripe:   { feePct: "2.90", gstPct: "18", label: "Stripe" },
  manual:   { feePct: "0.00", gstPct: "0",  label: "Manual" },
};
const profileFor = (provider) => PROVIDER_PROFILES[String(provider || "manual").toLowerCase()] || PROVIDER_PROFILES.manual;

// ── §M.1 - the rule vocabulary (pure, testable) ─────────────────────────────────
// A settlement line is a plain object:
//   { gross, fee, tax, net, utr, txn_ref, order_id, settled_on, provider }
// A candidate is a thing we might match it to:
//   { kind:'BANK'|'RECEIPT', id, amount, date, reference }  (amount money-string)
//
// FILTERS (When): does this rule apply to the line at all?
const FILTERS = {
  always: () => true,
  has_utr: (line) => !!(line.utr && String(line.utr).trim()),
  has_txn_ref: (line) => !!(line.txn_ref && String(line.txn_ref).trim()),
  net_positive: (line) => gt(line.net, 0),
  // A UTR-bearing line MUST find its deposit by its own UTR (exact or band). If none
  // carries that UTR the line is genuinely MISSING_DEPOSIT - it must NOT fall through
  // to a UTR-agnostic amount-only rule and steal an unrelated line's same-amount
  // deposit. So the amount-only bank rules apply only to lines that lost their UTR.
  no_utr: (line) => gt(line.net, 0) && !(line.utr && String(line.utr).trim()),
};

// IDENTIFIERS (How): given a line, which candidates are plausible counterparts?
// Each returns the subset of `cands` worth validating. Pure string/number work.
const IDENTIFIERS = {
  // The PSP stamps its batch UTR onto the bank deposit narration/reference.
  by_utr: (line, cands) => {
    const u = String(line.utr || "").trim().toLowerCase();
    if (!u) return [];
    return cands.filter((c) => String(c.reference || "").toLowerCase().includes(u));
  },
  // The customer's transaction/order ref shows up on the booked receipt.
  by_txn_ref: (line, cands) => {
    const refs = [line.txn_ref, line.order_id].map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
    if (!refs.length) return [];
    return cands.filter((c) => refs.some((r) => String(c.reference || "").toLowerCase().includes(r)));
  },
  // Last resort: amount + date proximity (used when no reference survived the file).
  by_amount: (line, cands, target) => cands, // validation does the amount work
};

// VALIDATIONS (What): does a candidate actually settle this line? Money-exact on the
// relevant column, with a date tolerance. `target` selects which line column the
// candidate amount must equal - NET for bank deposits, GROSS for booked receipts.
function validateExact(line, cand, target, toleranceDays) {
  const want = target === "GROSS" ? money(line.gross) : money(line.net);
  const sideOk = eq(cand.amount, want);
  const dateOk = !line.settled_on || !cand.date || daysBetween(line.settled_on, cand.date) <= toleranceDays;
  return sideOk && dateOk;
}
// Amount-band validation: lets a near-miss match (then we flag the gap as SHORT/OVER
// rather than leaving the line orphaned). Tolerance is the fee itself, never silent.
function validateBand(line, cand, target, toleranceDays, band) {
  const want = target === "GROSS" ? money(line.gross) : money(line.net);
  const diff = money(cand.amount).minus(want).abs();
  const amtOk = diff.lessThanOrEqualTo(money(band));
  const dateOk = !line.settled_on || !cand.date || daysBetween(line.settled_on, cand.date) <= toleranceDays;
  return amtOk && dateOk;
}

// The default rule set, highest priority first. A real tenant could store overrides;
// keeping the shipped rules as data (not a switch) is what lets the engine stay one
// loop. Each rule names a filter, an identifier, a target column and a validator.
const DEFAULT_RULES = [
  { name: "bank-by-utr-exact",   priority: 100, filter: "has_utr",     identify: "by_utr",     target: "NET",   validate: "exact", scope: "BANK" },
  { name: "receipt-by-ref-exact",priority: 90,  filter: "has_txn_ref", identify: "by_txn_ref", target: "GROSS", validate: "exact", scope: "RECEIPT" },
  // UTR-confined band: a line's OWN-UTR deposit that is a near-miss (SHORT/OVER) must
  // beat any UTR-agnostic exact-NET deposit belonging to an UNRELATED line. Ranked just
  // below UTR-exact and above the amount-only rules so own-UTR always wins its band.
  { name: "bank-by-utr-band",    priority: 80,  filter: "has_utr",     identify: "by_utr",     target: "NET",   validate: "band",  scope: "BANK" },
  { name: "bank-by-amount",      priority: 50,  filter: "no_utr",      identify: "by_amount",  target: "NET",   validate: "exact", scope: "BANK" },
  { name: "receipt-by-amount",   priority: 40,  filter: "always",      identify: "by_amount",  target: "GROSS", validate: "exact", scope: "RECEIPT" },
  { name: "bank-by-amount-band", priority: 20,  filter: "no_utr",      identify: "by_amount",  target: "NET",   validate: "band",  scope: "BANK" },
];

// §M.2 - run the rule set for ONE line against ONE pool of candidates of a given
// scope. Returns { cand, rule } for the winning (highest-priority applying+validating)
// rule, or null. Pure: no DB. This is the heart Hyperswitch calls the "matcher".
function selectMatch(line, candidates, scope, opts = {}) {
  const toleranceDays = opts.toleranceDays == null ? 5 : opts.toleranceDays;
  const band = opts.feeBand == null ? toDb(money(line.gross).minus(money(line.net))) : opts.feeBand; // gap ≤ fee
  const rules = (opts.rules || DEFAULT_RULES)
    .filter((r) => r.scope === scope)
    .slice()
    .sort((a, b) => b.priority - a.priority);
  for (const rule of rules) {
    const f = FILTERS[rule.filter];
    if (f && !f(line)) continue;
    const ident = IDENTIFIERS[rule.identify];
    const pool_ = ident ? ident(line, candidates, rule.target) : candidates;
    for (const c of pool_) {
      const ok = rule.validate === "band"
        ? validateBand(line, c, rule.target, toleranceDays, band)
        : validateExact(line, c, rule.target, toleranceDays);
      if (ok) return { cand: c, rule, target: rule.target };
    }
  }
  return null;
}

// §M.3 - fee arithmetic (pure). The file claims fee+tax; we verify it equals
// gross−net to the paisa, and that the implied fee % is within the provider's
// negotiated band (we don't fail a tiny rounding drift, but anything material is
// a FEE exception). Returns { expectedFee, gap, ratePct, rateOk }.
function classifyFee(line, profile, tolerance = "1.00") {
  const gross = money(line.gross);
  const net = money(line.net);
  const feeTax = money(line.fee).plus(money(line.tax));        // what the file says it kept
  const impliedGap = gross.minus(net);                          // what it actually kept
  const gap = feeTax.minus(impliedGap).abs();                   // file-internal consistency
  const ratePct = gross.greaterThan(0) ? impliedGap.dividedBy(gross).times(100) : money(0);
  // Negotiated ceiling = feePct grossed up by GST, plus a small slack.
  const grossedRate = money(profile.feePct).times(money(profile.gstPct).dividedBy(100).plus(1));
  const rateOk = ratePct.lessThanOrEqualTo(grossedRate.plus("0.50"));
  return { expectedFee: toDb(impliedGap), gap: toDb(gap), ratePct: ratePct.toFixed(4), rateOk, consistent: gap.lessThanOrEqualTo(money(tolerance)) };
}

// ── §M.4 - ingest: load EXPECTED settlement lines from a parsed payout file ──────
// rows: [{ gross, fee, tax, net, utr, txn_ref, order_id, settled_on }]. We compute
// nothing the file already states except defaults (net = gross−fee−tax if absent).
// A line is keyed by (provider, utr, txn_ref) so re-uploading the same file is a
// no-op (ON CONFLICT DO NOTHING) - settlement files get re-sent constantly.
async function ingestPayout(tenantId, { provider, rows } = {}) {
  if (!provider) throw new PostError("BAD_INPUT", "provider required", 400);
  if (!Array.isArray(rows) || rows.length === 0) throw new PostError("BAD_INPUT", "rows[] required", 400);
  const prof = profileFor(provider);
  const fy = financialYearFor(new Date());
  let inserted = 0, skipped = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let order = 0;
    for (const r of rows) {
      order += 1;
      const gross = money(r.gross == null ? 0 : r.gross);
      const fee = money(r.fee == null ? 0 : r.fee);
      const tax = money(r.tax == null ? 0 : r.tax);
      const net = r.net == null ? gross.minus(fee).minus(tax) : money(r.net);
      if (!gross.greaterThan(0)) throw new PostError("BAD_LINE", `Row ${order}: gross must be > 0`, 422);
      if (net.greaterThan(gross)) throw new PostError("BAD_LINE", `Row ${order}: net ${toRupees(net)} exceeds gross ${toRupees(gross)}`, 422);
      // Dedup key: prefer txn_ref (per-transaction), fall back to utr+order so a
      // batch line without a per-txn ref still can't double-insert on re-upload.
      const extKey = String(r.txn_ref || r.order_id || `${r.utr || "noutr"}#${order}`).trim();
      const { rowCount } = await client.query(
        `INSERT INTO book_settlement_lines
           (tenant_id, provider, financial_year, ext_key, txn_ref, order_id, utr,
            gross, fee, tax, net, settled_on, status, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'EXPECTED',$13::jsonb)
         ON CONFLICT (tenant_id, provider, ext_key) DO NOTHING`,
        [tenantId, prof.label.toLowerCase(), fy, extKey, r.txn_ref || null, r.order_id || null, r.utr || null,
         toDb(gross), toDb(fee), toDb(tax), toDb(net), r.settled_on || null, JSON.stringify(r)]
      );
      if (rowCount === 1) inserted += 1; else skipped += 1;
    }
    await client.query("COMMIT");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
  return { ok: true, provider: prof.label.toLowerCase(), inserted, skipped, total: rows.length };
}

// ── §M.5 - reconcile: drive every EXPECTED line through the matcher ──────────────
// For each EXPECTED line we look for (a) a bank deposit of NET and (b) a booked
// receipt of GROSS, then check the fee decomposition. Outcome per line:
//   • bank ✓ + receipt ✓ + fee ✓        → POSTED (fully reconciled), no exception.
//   • bank ✓ + receipt ✓ + fee drift     → POSTED + FEE exception.
//   • bank near-miss (band)               → POSTED + SHORT/OVER exception.
//   • bank ✗                              → stays EXPECTED + MISSING_DEPOSIT exception.
//   • receipt ✗                           → MISSING_RECEIPT exception (bank may still tie).
// A line is only POSTED once its NET deposit is found (the money actually moved).
// Exceptions are upserted by (line, kind) so a re-run refreshes, never duplicates.
async function reconcile(tenantId, opts = {}) {
  // Load all open settlement lines for this tenant.
  const { rows: lines } = await pool.query(
    "SELECT * FROM book_settlement_lines WHERE tenant_id=$1 AND status IN ('EXPECTED','POSTED') ORDER BY settled_on NULLS LAST, created_at",
    [tenantId]
  );
  if (lines.length === 0) return { scanned: 0, posted: 0, exceptions: 0 };

  // Candidate pool 1 - bank deposits: unposted-against-settlement bank lines, +inflow.
  // We exclude lines already consumed by another settlement line (settlement_line_id).
  const { rows: bankRows } = await pool.query(
    `SELECT id, txn_date AS date, amount, COALESCE(reference,'') || ' ' || COALESCE(description,'') AS reference, settlement_line_id
       FROM book_bank_lines
      WHERE tenant_id=$1 AND amount > 0`,
    [tenantId]
  );
  // Candidate pool 2 - booked receipts: RECEIPT vouchers (gross customer payment).
  // Amount = net bank/undeposited movement on the voucher (debit-positive).
  const { rows: rcptRows } = await pool.query(
    `SELECT v.id, v.voucher_date AS date,
            COALESCE(SUM(e.debit),0) AS amount,
            COALESCE(v.reference,'') AS reference
       FROM book_vouchers v
       JOIN book_voucher_entries e ON e.voucher_id=v.id
       JOIN book_ledgers l ON l.id=e.ledger_id
       JOIN book_account_groups g ON g.id=l.group_id
      WHERE v.tenant_id=$1 AND v.voucher_type='RECEIPT' AND v.is_cancelled=false
        AND (l.is_bank=true OR g.name ILIKE '%cash%' OR l.name ILIKE '%undeposited%')
      GROUP BY v.id, v.voucher_date, v.reference`,
    [tenantId]
  );

  // Mutable pools so a candidate is consumed by at most one line (beancount 1:1 leg).
  const bankPool = bankRows.map((r) => ({ ...r, amount: money(r.amount).toFixed(4) }));
  const rcptPool = rcptRows.map((r) => ({ ...r, amount: money(r.amount).toFixed(4) }));
  // Idempotency: a bank line already stamped (settlement_line_id) is owned by THAT
  // line. We must NOT blanket-exclude it - on a re-run the very line being matched has
  // to re-admit its own deposit as a candidate, or it loses its match and corrupts.
  // So remember the owner per bank line; the per-line candidate filter (below) admits a
  // stamped line iff it is owned by the line currently being matched, excludes it
  // otherwise. usedBank then only tracks lines consumed within THIS run.
  const ownerByBank = new Map(bankPool.filter((b) => b.settlement_line_id).map((b) => [b.id, b.settlement_line_id]));
  const usedBank = new Set();
  const usedRcpt = new Set();

  let posted = 0, exceptions = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const line of lines) {
      const prof = profileFor(line.provider);
      const fee = classifyFee(line, prof);

      // (a) bank deposit of NET. A bank line stamped to ANOTHER line stays excluded;
      // a line stamped to THIS line is re-admitted (idempotent re-run); within this run,
      // usedBank prevents two lines consuming the same deposit.
      const bankCands = bankPool.filter((b) => {
        if (usedBank.has(b.id)) return false;
        const owner = ownerByBank.get(b.id);
        return !owner || owner === line.id;
      });
      const bankHit = selectMatch(line, bankCands, "BANK", opts);
      // (b) booked receipt of GROSS
      const rcptCands = rcptPool.filter((r) => !usedRcpt.has(r.id));
      const rcptHit = selectMatch(line, rcptCands, "RECEIPT", opts);

      const exList = [];
      let bankLineId = null, receiptVoucherId = null, newStatus = line.status;

      if (bankHit) {
        bankLineId = bankHit.cand.id;
        usedBank.add(bankLineId);
        // Was this a band (near-miss) match? then the bank got less/more than NET.
        const got = money(bankHit.cand.amount), want = money(line.net);
        if (!eq(got, want)) {
          const kind = got.lessThan(want) ? "SHORT" : "OVER";
          exList.push({ kind, detail: { expectedNet: toDb(want), received: toDb(got), diff: toDb(got.minus(want)), bankLineId } });
        }
        newStatus = "POSTED"; // the money is in the bank → the line is settled
      } else {
        exList.push({ kind: "MISSING_DEPOSIT", detail: { expectedNet: toDb(line.net), utr: line.utr || null } });
      }

      if (rcptHit) { receiptVoucherId = rcptHit.cand.id; usedRcpt.add(receiptVoucherId); }
      else exList.push({ kind: "MISSING_RECEIPT", detail: { expectedGross: toDb(line.gross), txnRef: line.txn_ref || null } });

      // Fee consistency: only assert when we actually have both legs to compare; an
      // internally-inconsistent file (fee+tax ≠ gross−net) or an out-of-band rate is
      // always worth a flag regardless of matching.
      if (!fee.consistent) exList.push({ kind: "FEE", detail: { reason: "file_inconsistent", fee: line.fee, tax: line.tax, impliedGap: fee.expectedFee, gap: fee.gap } });
      else if (!fee.rateOk) exList.push({ kind: "FEE", detail: { reason: "rate_above_band", ratePct: fee.ratePct, expectedFeePct: prof.feePct } });

      // Persist line outcome (link the matched legs; flip to POSTED if banked).
      await client.query(
        `UPDATE book_settlement_lines
            SET status=$3, bank_line_id=$4, receipt_voucher_id=$5, reconciled_at=now()
          WHERE tenant_id=$1 AND id=$2`,
        [tenantId, line.id, newStatus, bankLineId, receiptVoucherId]
      );
      // Stamp the bank line so it isn't re-consumed by recon.js or another run.
      if (bankLineId) {
        await client.query(
          "UPDATE book_bank_lines SET settlement_line_id=$3 WHERE tenant_id=$1 AND id=$2 AND settlement_line_id IS NULL",
          [tenantId, bankLineId, line.id]
        );
      }
      if (newStatus === "POSTED") posted += 1;

      // Upsert exceptions. Resolve any prior exception kinds no longer present so a
      // re-run after a fix clears stale flags (mark RESOLVED, never delete history).
      const liveKinds = new Set(exList.map((e) => e.kind));
      await client.query(
        `UPDATE book_settlement_exceptions SET status='RESOLVED', resolved_at=now()
          WHERE tenant_id=$1 AND settlement_line_id=$2 AND status='OPEN' AND kind <> ALL($3::text[])`,
        [tenantId, line.id, exList.length ? Array.from(liveKinds) : ["__none__"]]
      );
      for (const ex of exList) {
        const r = await client.query(
          `INSERT INTO book_settlement_exceptions
             (tenant_id, settlement_line_id, kind, status, amount, detail)
           VALUES ($1,$2,$3,'OPEN',$4,$5::jsonb)
           ON CONFLICT (tenant_id, settlement_line_id, kind)
             DO UPDATE SET status='OPEN', amount=EXCLUDED.amount, detail=EXCLUDED.detail, resolved_at=NULL
           RETURNING (xmax = 0) AS inserted`,
          [tenantId, line.id, ex.kind, ex.detail.diff != null ? toDb(ex.detail.diff) : (ex.detail.gap != null ? toDb(ex.detail.gap) : null), JSON.stringify(ex.detail)]
        );
        if (r.rows[0] && r.rows[0].inserted) exceptions += 1;
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
  return { scanned: lines.length, posted, exceptions };
}

// ── §M.6 - exceptions for the UI ─────────────────────────────────────────────────
async function listExceptions(tenantId, { status = "OPEN", kind, limit = 500 } = {}) {
  const params = [tenantId];
  let where = "x.tenant_id=$1";
  if (status && status !== "ALL") { params.push(status); where += ` AND x.status=$${params.length}`; }
  if (kind) { params.push(kind); where += ` AND x.kind=$${params.length}`; }
  params.push(Math.min(Number(limit) || 500, 1000));
  const { rows } = await pool.query(
    `SELECT x.id, x.kind, x.status, x.amount, x.detail, x.created_at, x.resolved_at,
            l.provider, l.utr, l.txn_ref, l.gross, l.fee, l.tax, l.net, l.settled_on, l.status AS line_status
       FROM book_settlement_exceptions x
       JOIN book_settlement_lines l ON l.id=x.settlement_line_id
      WHERE ${where}
      ORDER BY x.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => ({
    id: r.id, kind: r.kind, status: r.status,
    amount: r.amount == null ? null : toRupees(r.amount),
    detail: r.detail,
    line: {
      provider: r.provider, utr: r.utr, txnRef: r.txn_ref, status: r.line_status,
      gross: toRupees(r.gross), fee: toRupees(r.fee), tax: toRupees(r.tax), net: toRupees(r.net),
      settledOn: r.settled_on,
    },
    createdAt: r.created_at, resolvedAt: r.resolved_at,
  }));
}

module.exports = {
  // pure (matcher + fee arithmetic) - selftest-able without a DB
  PROVIDER_PROFILES, profileFor, FILTERS, IDENTIFIERS,
  validateExact, validateBand, selectMatch, classifyFee, DEFAULT_RULES,
  // DB lifecycle
  ingestPayout, reconcile, listExceptions,
};
