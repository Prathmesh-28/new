// §M7 — Multi-currency. The ledger always stores base currency (INR); a foreign
// voucher carries its original currency + fx_rate. On settlement at a different
// rate we post the realised gain/loss to "Forex Gain/Loss".
//
// Wave-7 (ERPNext exchange_rate_revaluation): the ledger alone can't tell us how
// much *foreign currency* a party still owes nor at what rate each open item was
// booked — base-currency balances lose that. So we maintain a per-party foreign
// outstanding SUBLEDGER (book_fx_open_position): one row per open FC item with its
// booked FC amount + booked rate. FC invoices/bills ADD a positive position;
// FC receipts/payments CONSUME it FIFO (oldest booked rate first), which is also
// where the *realised* gain/loss falls out. What remains open is what revalueAll()
// marks to the as-of rate, posting the *unrealised* gain/loss per party/currency.
const { pool } = require("../../db");
const { money, toDb } = require("./money");
const { postVoucher, PostError } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");

const FX_RATE_DP = 6; // book_fx_rates.rate is NUMERIC(18,6)
const toRate = (r) => money(r).toFixed(FX_RATE_DP);

const fxConvert = (foreignAmount, rate) => money(foreignAmount).mul(rate);                 // foreign → base
const realizedFx = (foreignAmount, fromRate, toRate) => money(foreignAmount).mul(money(toRate).minus(fromRate));

// Post a realised forex gain/loss against a party (gain>0 ⇒ party owed more base).
async function postFxSettlement(tenantId, actorId, { partyLedgerId, gainLoss, date }) {
  const fxLedger = await ledgerIdByName(tenantId, "Forex Gain/Loss");
  if (!fxLedger) throw new PostError("NOT_SEEDED", "Forex Gain/Loss ledger missing — seed first", 422);
  if (!partyLedgerId) throw new PostError("BAD_INPUT", "partyLedgerId required", 400);
  const g = money(gainLoss);
  if (g.isZero()) return { posted: false };
  const amt = toDb(g.abs());
  const entries = g.greaterThan(0)
    ? [{ ledgerId: partyLedgerId, debit: amt, credit: "0" }, { ledgerId: fxLedger, debit: "0", credit: amt }]
    : [{ ledgerId: fxLedger, debit: amt, credit: "0" }, { ledgerId: partyLedgerId, debit: "0", credit: amt }];
  const r = await postVoucher(tenantId, actorId, { voucherType: "JOURNAL", voucherDate: date, narration: "Realised forex gain/loss", source: "api", partyLedgerId }, entries);
  return { posted: true, gainLoss: toDb(g), voucher: r };
}

// ── Dated exchange-rate master ──────────────────────────────────────────────
// Upsert a rate for (tenant, currency, rateDate). ERPNext keeps a Currency
// Exchange row per date; the latest on/before a txn date is the one used.
async function setRate(tenantId, { currency, rateDate, rate }) {
  if (!currency) throw new PostError("BAD_INPUT", "currency required", 400);
  if (!rateDate) throw new PostError("BAD_INPUT", "rateDate required", 400);
  const r = money(rate);
  if (!r.greaterThan(0)) throw new PostError("BAD_INPUT", "rate must be > 0", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_fx_rates(tenant_id, currency, rate_date, rate)
       VALUES($1,$2,$3,$4)
     ON CONFLICT(tenant_id, currency, rate_date) DO UPDATE SET rate = EXCLUDED.rate
     RETURNING id, currency, rate_date AS "rateDate", rate`,
    [tenantId, String(currency).toUpperCase(), rateDate, toRate(r)]
  );
  return rows[0];
}

// Latest rate on/before onDate; returns the rate as a string, or null if none.
async function getRate(tenantId, currency, onDate) {
  if (!currency) return null;
  const { rows } = await pool.query(
    `SELECT rate FROM book_fx_rates
      WHERE tenant_id=$1 AND currency=$2 AND rate_date <= $3
      ORDER BY rate_date DESC LIMIT 1`,
    [tenantId, String(currency).toUpperCase(), onDate]
  );
  return rows.length ? toRate(rows[0].rate) : null;
}

// All rates for a currency, newest first.
async function listRates(tenantId, currency) {
  const { rows } = await pool.query(
    `SELECT id, currency, rate_date AS "rateDate", rate FROM book_fx_rates
      WHERE tenant_id=$1 AND currency=$2 ORDER BY rate_date DESC`,
    [tenantId, String(currency || "").toUpperCase()]
  );
  return rows.map((x) => ({ ...x, rate: toRate(x.rate) }));
}

// Exchange-Rate Revaluation (ERPNext): an open foreign balance is unrealised.
// Mark it to the current dated rate and post the UNREALISED gain/loss vs its
// originally-booked base value. Caller passes either the booked base value
// (`bookedBase`) or the rate it was booked at (`bookedRate`); we derive the
// other from `foreignOutstanding`. If `post` is false we just return the
// computed gainLoss for the caller to post. Money stays a string throughout.
async function revalue(tenantId, actorId, { partyLedgerId, currency, foreignOutstanding, asOf, bookedRate, bookedBase, post = true }) {
  if (!partyLedgerId) throw new PostError("BAD_INPUT", "partyLedgerId required", 400);
  if (!currency) throw new PostError("BAD_INPUT", "currency required", 400);
  const currentRate = await getRate(tenantId, currency, asOf);
  if (currentRate == null) throw new PostError("NO_RATE", `No fx rate for ${currency} on/before ${asOf}`, 422);
  const fo = money(foreignOutstanding);
  const currentBase = fxConvert(fo, currentRate);                 // foreign → base at today's rate
  const bookedBaseVal = bookedBase != null
    ? money(bookedBase)
    : (bookedRate != null ? fxConvert(fo, bookedRate) : null);
  if (bookedBaseVal == null) throw new PostError("BAD_INPUT", "bookedBase or bookedRate required", 400);
  // gain>0 ⇒ the asset (party owes us) is now worth more base → debit party, credit forex.
  const gainLoss = currentBase.minus(bookedBaseVal);
  const result = {
    currency: String(currency).toUpperCase(),
    asOf,
    currentRate,
    foreignOutstanding: toDb(fo),
    bookedBase: toDb(bookedBaseVal),
    currentBase: toDb(currentBase),
    gainLoss: toDb(gainLoss),
  };
  if (!post) return result;
  const settlement = await postFxSettlement(tenantId, actorId, { partyLedgerId, gainLoss, date: asOf });
  return { ...result, ...settlement };
}

// ── Foreign-currency outstanding subledger ───────────────────────────────────
// One row per open FC item per party/currency. `kind` mirrors AR/AP sign:
//   RECEIVABLE (sales/exports) → party owes us FC; PAYABLE (imports) → we owe FC.
// `fc_amount` is the booked FC, `booked_rate` the rate it was booked at,
// `fc_settled` how much FC has since been consumed by receipts/payments (FIFO).
// Open FC on an item = fc_amount − fc_settled; it is fully open while >0.

// Round-half-up to FC currency precision (4dp like base, decimal-safe).
const fcDp = (m) => toDb(m);

// (a) Book a new open FC position as an FC invoice/bill posts. `refVoucherId`
// (the SALES/PURCHASE voucher) makes the row idempotent: re-posting the same
// voucher updates rather than duplicates. Returns the persisted row.
async function bookPosition(tenantId, { partyLedgerId, currency, kind, fcAmount, bookedRate, asOf, refVoucherId } = {}, client = pool) {
  if (!partyLedgerId) throw new PostError("BAD_INPUT", "partyLedgerId required", 400);
  if (!currency) throw new PostError("BAD_INPUT", "currency required", 400);
  const k = String(kind || "").toUpperCase();
  if (k !== "RECEIVABLE" && k !== "PAYABLE") throw new PostError("BAD_INPUT", "kind must be RECEIVABLE or PAYABLE", 400);
  const fc = money(fcAmount);
  if (!fc.greaterThan(0)) throw new PostError("BAD_INPUT", "fcAmount must be > 0", 400);
  const br = money(bookedRate);
  if (!br.greaterThan(0)) throw new PostError("BAD_INPUT", "bookedRate must be > 0", 400);
  if (!asOf) throw new PostError("BAD_INPUT", "asOf (booking date) required", 400);
  const cur = String(currency).toUpperCase();
  // Idempotent on (tenant, ref_voucher_id) when a ref is supplied; otherwise insert.
  if (refVoucherId) {
    const { rows } = await client.query(
      `INSERT INTO book_fx_open_position(tenant_id, party_ledger_id, currency, kind, fc_amount, booked_rate, booked_date, ref_voucher_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(tenant_id, ref_voucher_id) WHERE ref_voucher_id IS NOT NULL
         DO UPDATE SET fc_amount=EXCLUDED.fc_amount, booked_rate=EXCLUDED.booked_rate,
                       booked_date=EXCLUDED.booked_date, kind=EXCLUDED.kind, currency=EXCLUDED.currency
       RETURNING id, currency, kind, fc_amount, booked_rate, fc_settled, booked_date`,
      [tenantId, partyLedgerId, cur, k, fcDp(fc), toRate(br), asOf, refVoucherId]
    );
    return rows[0];
  }
  const { rows } = await client.query(
    `INSERT INTO book_fx_open_position(tenant_id, party_ledger_id, currency, kind, fc_amount, booked_rate, booked_date)
       VALUES($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, currency, kind, fc_amount, booked_rate, fc_settled, booked_date`,
    [tenantId, partyLedgerId, cur, k, fcDp(fc), toRate(br), asOf]
  );
  return rows[0];
}

// (b) Consume FC settlement (an FC receipt/payment) against this party/currency's
// open items FIFO (oldest booked first). Returns the FC actually settled and the
// realised gain/loss vs the booked rate of each consumed slice, valued at
// `settleRate`. Caller posts the realised gain/loss (or pass post:true).
async function settlePosition(tenantId, actorId, { partyLedgerId, currency, kind, fcAmount, settleRate, asOf, post = false } = {}) {
  if (!partyLedgerId) throw new PostError("BAD_INPUT", "partyLedgerId required", 400);
  if (!currency) throw new PostError("BAD_INPUT", "currency required", 400);
  const k = String(kind || "").toUpperCase();
  if (k !== "RECEIVABLE" && k !== "PAYABLE") throw new PostError("BAD_INPUT", "kind must be RECEIVABLE or PAYABLE", 400);
  let remaining = money(fcAmount);
  if (!remaining.greaterThan(0)) throw new PostError("BAD_INPUT", "fcAmount must be > 0", 400);
  const sr = money(settleRate);
  if (!sr.greaterThan(0)) throw new PostError("BAD_INPUT", "settleRate must be > 0", 400);
  const cur = String(currency).toUpperCase();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: open } = await client.query(
      `SELECT id, fc_amount, fc_settled, booked_rate
         FROM book_fx_open_position
        WHERE tenant_id=$1 AND party_ledger_id=$2 AND currency=$3 AND kind=$4
          AND fc_amount > fc_settled
        ORDER BY booked_date ASC, created_at ASC
        FOR UPDATE`,
      [tenantId, partyLedgerId, cur, k]
    );
    let realized = money(0);
    let settledFc = money(0);
    for (const it of open) {
      if (!remaining.greaterThan(0)) break;
      const itemOpen = money(it.fc_amount).minus(it.fc_settled);
      const take = remaining.lessThan(itemOpen) ? remaining : itemOpen;
      // realised gain on a RECEIVABLE: settle worth more base than booked ⇒ gain.
      // On a PAYABLE the sign flips (a higher rate means we pay more ⇒ loss).
      const perFc = sr.minus(it.booked_rate);
      const slice = take.mul(perFc);
      realized = realized.plus(k === "PAYABLE" ? slice.neg() : slice);
      settledFc = settledFc.plus(take);
      await client.query(
        `UPDATE book_fx_open_position SET fc_settled = fc_settled + $2, updated_at=now() WHERE id=$1`,
        [it.id, fcDp(take)]
      );
      remaining = remaining.minus(take);
    }
    await client.query("COMMIT");
    const result = {
      currency: cur, kind: k, settleRate: toRate(sr),
      fcSettled: fcDp(settledFc), fcUnsettled: fcDp(remaining), realizedGainLoss: toDb(realized),
    };
    if (!post || money(realized).isZero()) return result;
    const settlement = await postFxSettlement(tenantId, actorId, { partyLedgerId, gainLoss: realized, date: asOf });
    return { ...result, ...settlement };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// (c) The current net open FC position per party/currency (what is still open).
//   bookedBase = Σ open_fc × booked_rate of each item (its carrying base value).
//   So an item's open base is marked at the rate it was booked at, exactly as
//   ERPNext's revaluation carries it before revaluing.
async function openPosition(tenantId, { partyLedgerId, currency } = {}) {
  const params = [tenantId];
  const where = ["tenant_id=$1", "fc_amount > fc_settled"];
  if (partyLedgerId) { params.push(partyLedgerId); where.push(`party_ledger_id=$${params.length}`); }
  if (currency) { params.push(String(currency).toUpperCase()); where.push(`currency=$${params.length}`); }
  const { rows } = await pool.query(
    `SELECT p.party_ledger_id,
            l.name AS party_name,
            p.currency,
            p.kind,
            SUM(p.fc_amount - p.fc_settled)                       AS open_fc,
            SUM((p.fc_amount - p.fc_settled) * p.booked_rate)     AS booked_base,
            COUNT(*)                                              AS open_items
       FROM book_fx_open_position p
       LEFT JOIN book_ledgers l ON l.id=p.party_ledger_id AND l.tenant_id=p.tenant_id
      WHERE ${where.join(" AND ")}
      GROUP BY p.party_ledger_id, l.name, p.currency, p.kind
      ORDER BY l.name NULLS LAST, p.currency, p.kind`,
    params
  );
  return rows.map((r) => ({
    partyLedgerId: r.party_ledger_id,
    partyName: r.party_name,
    currency: r.currency,
    kind: r.kind,
    openFc: fcDp(r.open_fc),
    bookedBase: toDb(r.booked_base),
    openItems: Number(r.open_items),
  }));
}

// (d) revalueAll — ERPNext Exchange Rate Revaluation. Query the open FC position
// itself, mark each party/currency group to the as-of rate, and post the
// UNREALISED gain/loss per party/currency. Returns one line per group with the
// posted voucher (or skipped:true when the swing is zero). Does NOT mutate the
// subledger — revaluation is a reporting/period entry; the position stays booked
// at its original rate until actually settled.
async function revalueAll(tenantId, actorId, asOf) {
  if (!asOf) throw new PostError("BAD_INPUT", "asOfDate required", 400);
  const groups = await openPosition(tenantId, {});
  const results = [];
  for (const g of groups) {
    const currentRate = await getRate(tenantId, g.currency, asOf);
    if (currentRate == null) {
      results.push({ ...g, asOf, skipped: true, reason: `No fx rate for ${g.currency} on/before ${asOf}` });
      continue;
    }
    const openFc = money(g.openFc);
    const currentBase = fxConvert(openFc, currentRate);
    const bookedBase = money(g.bookedBase);
    // RECEIVABLE: it's an asset → gain when current base > booked base.
    // PAYABLE: it's a liability → a higher base value is a LOSS, so flip sign.
    const swing = currentBase.minus(bookedBase);
    const gainLoss = g.kind === "PAYABLE" ? swing.neg() : swing;
    const line = {
      partyLedgerId: g.partyLedgerId, partyName: g.partyName, currency: g.currency, kind: g.kind,
      asOf, currentRate, openFc: fcDp(openFc), bookedBase: toDb(bookedBase),
      currentBase: toDb(currentBase), gainLoss: toDb(gainLoss),
    };
    if (money(gainLoss).isZero()) { results.push({ ...line, skipped: true, reason: "No revaluation swing" }); continue; }
    const settlement = await postFxSettlement(tenantId, actorId, { partyLedgerId: g.partyLedgerId, gainLoss, date: asOf });
    results.push({ ...line, ...settlement });
  }
  const totalGainLoss = results.reduce((a, r) => a.plus(money(r.gainLoss || 0)), money(0));
  return { asOf, groups: results.length, posted: results.filter((r) => r.posted).length, totalGainLoss: toDb(totalGainLoss), lines: results };
}

module.exports = {
  fxConvert, realizedFx, postFxSettlement, setRate, getRate, listRates, revalue,
  bookPosition, settlePosition, openPosition, revalueAll,
};
