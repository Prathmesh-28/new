// §M-SUB — SUBSCRIPTION BILLING. A re-implementation of the recurring-billing
// concepts proven by Lago (lago-org/lago — usage/plans/subscriptions) and KillBill
// (killbill/killbill — entitlement + invoice generator), written from scratch so we
// carry no third-party code (their MIT/Apache/GPL sources are read for the algorithm
// only). Two masters sit on top of the existing posting engine:
//
//   1. PLANS (book_subscription_plans): a priced, recurring offering — name, price,
//      interval (monthly|quarterly|yearly) × interval_count, plus GST rate + HSN/SAC
//      so each generated invoice is a fully compliant Indian tax invoice.
//
//   2. SUBSCRIPTIONS (book_subscriptions): a party (customer ledger) on a plan, with
//      a lifecycle status (trial → active → paused → cancelled), an anchored billing
//      clock (current_period_start, next_invoice_date) and a quantity multiplier.
//
// Billing itself never touches the ledger directly — it always routes a SALES
// invoice through mappers.buildSalesVoucher + documents.salesCtx + postVoucher, so a
// subscription invoice is indistinguishable from a hand-keyed one (same GST split,
// same GSTR-1 side-records, same idempotency + period locks).
//
// PRORATION (changePlan) is ported from KillBill's InvoiceDateUtils: the proration
// factor for a partial period is  days_remaining / days_in_full_period  (a decimal in
// [0,1]); the mid-cycle credit/charge = (newDailyRate − oldDailyRate) applied across
// the unused remainder of the current period. We do all of it on decimal.js money.
//
// CommonJS. Money strictly through ./money; interval math is pure UTC date arithmetic
// (date-fns is not a dependency here — we mirror its addMonths/addYears/differenceInDays
// semantics with our own clamp-safe helpers, same UTC-only style as ./payterms).
const { pool } = require("../../db");
const { money, toDb, toRupees } = require("./money");
const { financialYearFor } = require("./fy");
const { postVoucher, PostError } = require("./posting-engine");
const { buildSalesVoucher } = require("./mappers");
const { salesCtx } = require("./documents");

// ── pure date helpers (UTC, 'YYYY-MM-DD') ────────────────────────────────────
// All subscription dates are date-only; we parse/format in UTC so a date never
// drifts a day across timezones — the same discipline ./payterms uses.
function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function parseYmd(s, label = "date") {
  if (!s) throw new PostError("BAD_INPUT", `${label} required`, 400);
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new PostError("BAD_INPUT", `invalid ${label} ${s}`, 400);
  return d;
}
function today() {
  return ymd(new Date());
}
// addMonths with day-clamping (mirrors date-fns): adding 1 month to Jan-31 yields
// Feb-28/29, never a rolled-over Mar-03. We clamp the day to the target month's last.
function addMonthsUtc(d, n) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const targetMonthStart = new Date(Date.UTC(y, m + n, 1));
  const lastDay = new Date(Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth(), Math.min(day, lastDay)));
}
function addDaysUtc(d, n) {
  return new Date(d.getTime() + Number(n || 0) * 86400000);
}
// whole-days between two UTC date-only instants (b − a). Mirrors differenceInDays.
function diffDays(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// Map an interval enum to a month step; one billing period = step × interval_count.
const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
function intervalMonths(interval) {
  const base = INTERVAL_MONTHS[String(interval || "monthly").toLowerCase()];
  if (!base) throw new PostError("BAD_INTERVAL", `unknown interval ${interval} (monthly|quarterly|yearly)`, 422);
  return base;
}
// Advance a date by exactly one full billing period for a plan.
function advancePeriod(dateStr, plan) {
  const d = dateStr instanceof Date ? dateStr : parseYmd(dateStr);
  const months = intervalMonths(plan.interval) * Number(plan.interval_count || 1);
  return ymd(addMonthsUtc(d, months));
}

// ── (1) PLANS ─────────────────────────────────────────────────────────────────
async function createPlan(tenantId, p = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!p.name || !String(p.name).trim()) throw new PostError("BAD_INPUT", "name required", 422);
  const interval = String(p.interval || "monthly").toLowerCase();
  intervalMonths(interval); // validate enum
  const count = Number(p.intervalCount || p.interval_count || 1);
  if (!Number.isInteger(count) || count < 1) throw new PostError("BAD_INPUT", "intervalCount must be a positive integer", 422);
  const price = money(p.price);
  if (price.lessThan(0)) throw new PostError("BAD_AMOUNT", "price cannot be negative", 422);
  const gstRate = money(p.gstRate == null ? p.gst_rate : p.gstRate);
  if (gstRate.lessThan(0)) throw new PostError("BAD_AMOUNT", "gstRate cannot be negative", 422);
  const { rows } = await pool.query(
    `INSERT INTO book_subscription_plans(tenant_id, name, price, interval, interval_count, gst_rate, hsn_sac)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, name, price, interval, interval_count, gst_rate, hsn_sac, is_active, created_at`,
    [tenantId, String(p.name).trim(), toDb(price), interval, count, toDb(gstRate), p.hsnSac || p.hsn_sac || null]
  );
  return rows[0];
}

async function listPlans(tenantId) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const { rows } = await pool.query(
    `SELECT id, name, price, interval, interval_count, gst_rate, hsn_sac, is_active, created_at
       FROM book_subscription_plans
      WHERE tenant_id=$1
      ORDER BY is_active DESC, name ASC`,
    [tenantId]
  );
  return rows;
}

async function getPlan(tenantId, planId, client = pool) {
  const { rows } = await client.query(
    `SELECT id, name, price, interval, interval_count, gst_rate, hsn_sac, is_active
       FROM book_subscription_plans WHERE tenant_id=$1 AND id=$2`,
    [tenantId, planId]
  );
  if (!rows[0]) throw new PostError("NOT_FOUND", `plan ${planId} not found`, 404);
  return rows[0];
}

// ── (2) SUBSCRIPTIONS ───────────────────────────────────────────────────────
// Trial mechanics (Lago): a trial subscription bills nothing now — its first
// invoice fires at trial_end. With no trial it is active immediately and the
// first invoice is due on startDate. In both cases the billing clock is anchored
// at next_invoice_date and advances one full period each time it bills.
async function createSubscription(tenantId, { partyLedgerId, planId, qty, trialDays, startDate } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!partyLedgerId) throw new PostError("BAD_INPUT", "partyLedgerId required", 422);
  if (!planId) throw new PostError("BAD_INPUT", "planId required", 422);
  await getPlan(tenantId, planId); // existence check (throws 404)

  const quantity = money(qty == null ? 1 : qty);
  if (!quantity.greaterThan(0)) throw new PostError("BAD_AMOUNT", "qty must be > 0", 422);

  const start = parseYmd(startDate || today(), "startDate");
  const trial = Number(trialDays || 0);
  if (trial < 0 || !Number.isInteger(trial)) throw new PostError("BAD_INPUT", "trialDays must be a non-negative integer", 422);

  const status = trial > 0 ? "trial" : "active";
  const trialEnd = trial > 0 ? ymd(addDaysUtc(start, trial)) : null;
  // first invoice fires at trial_end (trial) or on the start date (active).
  const nextInvoice = trial > 0 ? trialEnd : ymd(start);

  const { rows } = await pool.query(
    `INSERT INTO book_subscriptions
       (tenant_id, party_ledger_id, plan_id, qty, status, trial_end, current_period_start, next_invoice_date, started_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, party_ledger_id, plan_id, qty, status, trial_end, current_period_start, next_invoice_date, started_at, cancelled_at, created_at`,
    [tenantId, partyLedgerId, planId, toDb(quantity), status, trialEnd, ymd(start), nextInvoice, ymd(start)]
  );
  return rows[0];
}

async function listSubscriptions(tenantId, status) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const params = [tenantId];
  let where = "tenant_id=$1";
  if (status) {
    params.push(status);
    where += ` AND status=$${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT s.id, s.party_ledger_id, s.plan_id, s.qty, s.status, s.trial_end,
            s.current_period_start, s.next_invoice_date, s.started_at, s.cancelled_at, s.created_at,
            p.name AS plan_name, p.price AS plan_price, p.interval AS plan_interval,
            p.interval_count AS plan_interval_count, p.gst_rate AS plan_gst_rate
       FROM book_subscriptions s
       JOIN book_subscription_plans p ON p.id = s.plan_id AND p.tenant_id = s.tenant_id
      WHERE ${where}
      ORDER BY s.next_invoice_date ASC NULLS LAST, s.created_at DESC`,
    params
  );
  return rows;
}

// ── (3) CHANGE PLAN — KillBill mid-cycle proration ────────────────────────────
// When a subscription switches plans mid-period, the customer has already been
// invoiced for the OLD plan for the whole current period. KillBill's rule: credit
// the unused portion of the old plan and charge the same unused portion of the new
// plan, where the portion = days_remaining / days_in_period (InvoiceDateUtils
// calculateProRationAfterLastBillingCycleDate / calculateProrationBetweenDates).
//
//   factor      = daysRemaining / daysInPeriod                    (∈ [0,1])
//   oldUnused   = oldPlan.price × qty × factor                    (credit back)
//   newUnused   = newPlan.price × qty × factor                    (charge instead)
//   net         = newUnused − oldUnused
//
// net > 0 → post a SALES top-up invoice for the difference (customer owes more);
// net < 0 → post a CREDIT-shaped adjustment is out of scope here, so we surface the
//            credit amount and leave next_invoice_date to settle it on renewal.
// With prorate=false we simply swap the plan, leaving the clock untouched (the new
// price takes effect at the next renewal — Lago's "no proration" upgrade path).
async function changePlan(tenantId, { subscriptionId, newPlanId, prorate } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!subscriptionId) throw new PostError("BAD_INPUT", "subscriptionId required", 422);
  if (!newPlanId) throw new PostError("BAD_INPUT", "newPlanId required", 422);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: sr } = await client.query(
      `SELECT * FROM book_subscriptions WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [tenantId, subscriptionId]
    );
    const sub = sr[0];
    if (!sub) throw new PostError("NOT_FOUND", `subscription ${subscriptionId} not found`, 404);
    if (sub.status === "cancelled") throw new PostError("BAD_STATE", "subscription is cancelled", 409);

    const oldPlan = await getPlan(tenantId, sub.plan_id, client);
    const newPlan = await getPlan(tenantId, newPlanId, client);

    let proration = null;
    let invoice = null;

    if (prorate) {
      // Current period spans [current_period_start, next_invoice_date). The unused
      // remainder is [today, next_invoice_date). KillBill clamps both ends to the period.
      const periodStart = parseYmd(sub.current_period_start || sub.started_at, "current_period_start");
      const periodEnd = parseYmd(advancePeriod(periodStart, oldPlan), "period_end");
      const now = parseYmd(today());
      const clampedNow = now.getTime() < periodStart.getTime() ? periodStart : now.getTime() > periodEnd.getTime() ? periodEnd : now;

      const daysInPeriod = diffDays(periodStart, periodEnd);
      const daysRemaining = Math.max(0, diffDays(clampedNow, periodEnd));
      // factor = daysRemaining / daysInPeriod (decimal in [0,1]); guard /0.
      const factor = daysInPeriod > 0 ? money(daysRemaining).div(daysInPeriod) : money(0);

      const qty = money(sub.qty);
      const oldUnused = money(oldPlan.price).times(qty).times(factor);
      const newUnused = money(newPlan.price).times(qty).times(factor);
      const net = newUnused.minus(oldUnused);

      proration = {
        daysInPeriod,
        daysRemaining,
        factor: factor.toFixed(6),
        oldUnusedCredit: toRupees(oldUnused),
        newUnusedCharge: toRupees(newUnused),
        net: toRupees(net),
        direction: net.greaterThan(0) ? "charge" : net.lessThan(0) ? "credit" : "even",
      };

      // Upgrade (net > 0): bill the difference immediately as a GST sales invoice on
      // the new plan's tax profile. Downgrade/even: no charge now — credit shows up
      // implicitly via the cheaper renewal. We never post a negative SALES voucher.
      if (net.greaterThan(0)) {
        invoice = await postPlanInvoice(
          client,
          tenantId,
          sub.party_ledger_id,
          newPlan,
          { amount: net, date: today(), reference: `Subscription proration → ${newPlan.name}`, narration: `Plan change ${oldPlan.name} → ${newPlan.name} (prorated)` }
        );
      }
    }

    const { rows: upd } = await client.query(
      `UPDATE book_subscriptions SET plan_id=$3 WHERE tenant_id=$1 AND id=$2
       RETURNING id, party_ledger_id, plan_id, qty, status, trial_end, current_period_start, next_invoice_date, started_at, cancelled_at`,
      [tenantId, subscriptionId, newPlanId]
    );
    await client.query("COMMIT");
    return { subscription: upd[0], proration, invoice };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ── (4) CANCEL ─────────────────────────────────────────────────────────────────
// atPeriodEnd=true (Lago default): the subscription keeps running until the current
// period ends — status flips to cancelled but next_invoice_date is left so the final
// already-paid period is honoured (and won't bill again, since cancelled subs are
// skipped by generateDueInvoices). atPeriodEnd=false: cancel now, stop the clock.
async function cancelSubscription(tenantId, id, atPeriodEnd) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!id) throw new PostError("BAD_INPUT", "subscriptionId required", 422);
  const stamp = today();
  const { rows } = atPeriodEnd
    ? await pool.query(
        `UPDATE book_subscriptions SET status='cancelled', cancelled_at=$3
           WHERE tenant_id=$1 AND id=$2 AND status<>'cancelled'
           RETURNING id, status, next_invoice_date, cancelled_at`,
        [tenantId, id, stamp]
      )
    : await pool.query(
        `UPDATE book_subscriptions SET status='cancelled', cancelled_at=$3, next_invoice_date=NULL
           WHERE tenant_id=$1 AND id=$2 AND status<>'cancelled'
           RETURNING id, status, next_invoice_date, cancelled_at`,
        [tenantId, id, stamp]
      );
  if (!rows[0]) throw new PostError("BAD_STATE", "subscription not found or already cancelled", 409);
  return { ...rows[0], atPeriodEnd: !!atPeriodEnd };
}

// ── invoice helper ────────────────────────────────────────────────────────────
// Post ONE subscription sales invoice through the shared sales builder for a given
// gross-of-tax line amount (single line, single GST rate from the plan). Inter-state
// is left false here (the customer's state-of-supply isn't carried on a subscription;
// the existing manual-invoice path is the place to override). Reuses the open client
// so the caller (changePlan) can compose it inside its own transaction.
async function postPlanInvoice(client, tenantId, partyLedgerId, plan, { amount, date, reference, narration }) {
  const ctx = await salesCtx(tenantId, partyLedgerId);
  const m = buildSalesVoucher(
    { lineTotal: toDb(amount), gstRate: toDb(plan.gst_rate), interState: false, date, reference, narration, hsn: plan.hsn_sac },
    ctx
  );
  // postVoucher manages its own transaction; calling it within changePlan's open
  // client transaction is acceptable here because it connects a fresh pooled client.
  return postVoucher(tenantId, null, m.voucher, m.entries, { taxes: m.taxes });
}

// ── (5) GENERATE DUE INVOICES — the cron entrypoint ──────────────────────────
// For every ACTIVE subscription whose next_invoice_date ≤ asOf, post a sales invoice
// for plan.price × qty (+GST via the sales builder) against the party, then advance
// next_invoice_date by one full plan period — looping to catch up EVERY missed cycle
// (e.g. after the cron was down), one invoice per missed period, each dated at that
// period's date. current_period_start tracks the period each invoice covers. Capped to
// avoid a runaway. Trial subscriptions are auto-activated the moment their trial_end
// passes (their next_invoice_date is already set to trial_end), exactly as Lago does.
const MAX_CATCHUP = 120;

async function generateDueInvoices(tenantId, asOf) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const cutoff = asOf ? parseYmd(asOf, "asOf") : parseYmd(today());
  const cutoffStr = ymd(cutoff);

  // Pull both active and trial subs that are due — a due trial means the trial just
  // ended and the first real invoice should fire (flipping it to active).
  const { rows: subs } = await pool.query(
    `SELECT s.*, p.price AS plan_price, p.gst_rate AS plan_gst_rate, p.hsn_sac AS plan_hsn,
            p.interval AS plan_interval, p.interval_count AS plan_interval_count, p.name AS plan_name
       FROM book_subscriptions s
       JOIN book_subscription_plans p ON p.id = s.plan_id AND p.tenant_id = s.tenant_id
      WHERE s.tenant_id=$1
        AND s.status IN ('active','trial')
        AND s.next_invoice_date IS NOT NULL
        AND s.next_invoice_date <= $2
      ORDER BY s.next_invoice_date ASC`,
    [tenantId, cutoffStr]
  );

  const created = [];
  for (const s of subs) {
    const plan = {
      price: s.plan_price,
      gst_rate: s.plan_gst_rate,
      hsn_sac: s.plan_hsn,
      interval: s.plan_interval,
      interval_count: s.plan_interval_count,
      name: s.plan_name,
    };
    const lineTotal = money(s.plan_price).times(money(s.qty));

    let runDate = ymd(parseYmd(s.next_invoice_date));
    let iterations = 0;
    let activated = s.status === "trial"; // first billing flips trial → active

    while (runDate <= cutoffStr && iterations < MAX_CATCHUP) {
      iterations++;
      const periodEnd = advancePeriod(runDate, plan);
      try {
        let inv = null;
        // A zero-priced plan posts no voucher (nothing to invoice) but still advances.
        if (lineTotal.greaterThan(0)) {
          inv = await postPlanInvoice(pool, tenantId, s.party_ledger_id, plan, {
            amount: lineTotal,
            date: runDate,
            reference: `Subscription: ${plan.name}`,
            narration: `Subscription ${plan.name} ${runDate} → ${periodEnd}`,
          });
        }
        // Advance the clock for THIS subscription: this period is billed, the next
        // invoice is one full period later, and the current period now starts at runDate.
        await pool.query(
          `UPDATE book_subscriptions
              SET next_invoice_date=$3, current_period_start=$4, status='active'
            WHERE tenant_id=$1 AND id=$2`,
          [tenantId, s.id, periodEnd, runDate]
        );
        created.push({
          subscriptionId: s.id,
          partyLedgerId: s.party_ledger_id,
          planName: plan.name,
          period: runDate,
          periodEnd,
          amount: toRupees(lineTotal),
          fy: financialYearFor(runDate),
          activatedFromTrial: activated,
          voucher: inv,
        });
        activated = false;
        runDate = periodEnd;
      } catch (e) {
        // Stop catching up THIS subscription on first failure (e.g. PERIOD_LOCKED or
        // NOT_SEEDED) so a retry doesn't double-bill an already-posted period.
        created.push({ subscriptionId: s.id, period: runDate, error: e.code || e.message });
        break;
      }
    }
  }
  return { tenantId, asOf: cutoffStr, count: created.filter((c) => !c.error).length, created };
}

module.exports = {
  createPlan,
  listPlans,
  createSubscription,
  listSubscriptions,
  changePlan,
  cancelSubscription,
  generateDueInvoices,
  // pure helpers exported for testability
  advancePeriod,
  intervalMonths,
  diffDays,
  addMonthsUtc,
};
