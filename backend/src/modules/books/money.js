// §4 — Money. The single most common way bookkeeping software corrupts itself is
// floating point. ALL money math goes through decimal.js. Never JS number.
const Decimal = require("decimal.js");
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

const money = (v) => new Decimal(v == null || v === "" ? 0 : v);
const ZERO = money(0);
const sum = (xs) => xs.reduce((a, b) => a.plus(money(b)), ZERO);
const toDb = (m) => money(m).toFixed(4);      // → NUMERIC(19,4)
const toRupees = (m) => money(m).toFixed(2);   // presentation
const eq = (a, b) => money(a).equals(money(b)); // EXACT equality, never epsilon
const gt = (a, b) => money(a).greaterThan(money(b));

module.exports = { Decimal, money, ZERO, sum, toDb, toRupees, eq, gt };
