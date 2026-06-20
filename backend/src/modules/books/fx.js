// §M7 — Multi-currency. The ledger always stores base currency (INR); a foreign
// voucher carries its original currency + fx_rate. On settlement at a different
// rate we post the realised gain/loss to "Forex Gain/Loss".
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

module.exports = { fxConvert, realizedFx, postFxSettlement, setRate, getRate, listRates, revalue };
