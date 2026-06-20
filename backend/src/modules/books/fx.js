// §M7 — Multi-currency. The ledger always stores base currency (INR); a foreign
// voucher carries its original currency + fx_rate. On settlement at a different
// rate we post the realised gain/loss to "Forex Gain/Loss".
const { money, toDb } = require("./money");
const { postVoucher, PostError } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");

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

module.exports = { fxConvert, realizedFx, postFxSettlement };
