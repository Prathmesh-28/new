const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const razorpay = require("../lib/razorpay");
const { writeAudit } = require("../lib/audit");
const subscriptionInvoice = require("../lib/subscriptionInvoice");

const VALID_PLANS = ["starter", "growth", "pro"];

// Plan pricing in the smallest currency unit (paise for INR). Must match the
// amounts shown on the landing page / billing card (ex-GST; Razorpay test mode).
const PLAN_PRICING = {
  starter: { inr: 79900 },  // ₹799 / month
  growth:  { inr: 249900 }, // ₹2,499 / month
  pro:     { inr: 599900 }, // ₹5,999 / month
};

// Annual = 2 months free (Indian SaaS convention: 12mo priced as 10x monthly).
const ANNUAL_MONTHS_CHARGED = 10;
const annualAmount = (monthlyInr) => monthlyInr * ANNUAL_MONTHS_CHARGED;

// Founding-member launch offer: 50% off the ANNUAL price, first 100 tenants only.
// "Locked 12 months" falls out naturally - it's a discount on the annual (12mo) Plan,
// not a recurring discount applied to future renewals.
const FOUNDING_COUPON = "FOUNDING50";
const FOUNDING_DISCOUNT = 0.5;
const FOUNDING_MEMBER_CAP = 100;

// Total billing cycles requested from Razorpay when creating a subscription. The API
// requires a bound (a subscription isn't literally "forever"); ~10 years either way
// reads as "until cancelled" for any real SMB customer lifetime.
const TOTAL_CYCLES = { monthly: 120, annual: 10 };

// Get-or-create the (immutable) Razorpay Plan object for a given tier+cycle+coupon
// combination, caching the id so repeat checkouts never create duplicate Plans.
async function getOrCreatePlan(planKey, { period, interval, name, amount }) {
  const { rows } = await pool.query("SELECT plan_id, amount FROM razorpay_plans WHERE plan_key=$1", [planKey]);
  if (rows[0]) {
    if (Number(rows[0].amount) !== amount) {
      console.warn(`[billing] cached Razorpay plan "${planKey}" was created at ₹${rows[0].amount / 100} but current pricing is ₹${amount / 100} - Razorpay plans are immutable, so pricing.js changed after this plan existed. Bump planKey to mint a new one.`);
    }
    return rows[0].plan_id;
  }
  const created = await razorpay.createPlan({ period, interval, name, amount });
  await pool.query(
    "INSERT INTO razorpay_plans(plan_key, plan_id, amount) VALUES($1,$2,$3) ON CONFLICT (plan_key) DO NOTHING",
    [planKey, created.id, amount]
  );
  return created.id;
}

// Persist a plan to a tenant: updates the billing record AND every user in the
// tenant (so each team member's entitlements reflect the company subscription).
async function applyPlan(tenantId, plan, { provider = "razorpay", razorpayPaymentId, status, periodEnd } = {}) {
  await pool.query(`
    INSERT INTO tenant_billing(tenant_id, plan, provider, razorpay_payment_id, status, current_period_end, updated_at)
    VALUES($1,$2,$3,$4,$5,$6,now())
    ON CONFLICT(tenant_id) DO UPDATE SET
      plan=$2,
      provider=$3,
      razorpay_payment_id=COALESCE($4, tenant_billing.razorpay_payment_id),
      status=COALESCE($5, tenant_billing.status),
      current_period_end=COALESCE($6, tenant_billing.current_period_end),
      updated_at=now()
  `, [tenantId, plan, provider, razorpayPaymentId || null, status || null,
      periodEnd ? new Date(periodEnd * 1000).toISOString() : null]);
  await pool.query("UPDATE users SET subscription_plan=$1 WHERE tenant_id=$2", [plan, tenantId]);
}

// GET /api/billing/current - the tenant's current plan + status
router.get("/current", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT plan, status, current_period_end, provider, cycle, is_founding_member, razorpay_subscription_id IS NOT NULL AS has_subscription FROM tenant_billing WHERE tenant_id=$1",
    [req.user.tenant_id]
  );
  const b = rows[0] || {};
  res.json({
    plan: b.plan || req.user.subscription_plan || "free",
    status: b.status || null,
    current_period_end: b.current_period_end || null,
    provider: b.provider || null,
    is_trialing: b.status === "trialing",
    cycle: b.cycle || null,
    is_founding_member: !!b.is_founding_member,
    has_subscription: !!b.has_subscription,
    configured: razorpay.isConfigured(),
  });
});

// GET /api/billing/entitlements - plan + seats + monthly usage vs quotas (+ whether
// enforcement is on). Powers the usage/limits UI; reflects the entitlements engine.
router.get("/entitlements", authenticate, async (req, res) => {
  try { res.json(await require("../lib/entitlements").snapshot(req.user.tenant_id, req.user.subscription_plan || "free")); }
  catch (e) { console.error("[billing] entitlements", e.message); res.status(500).json({ error: "Internal error" }); }
});

// ── Razorpay Standard Checkout (subscription upgrades) ──────────────────────
// India-first gateway: UPI / cards / netbanking / wallets. One-time Standard
// Checkout per period; the signature is verified server-side before the plan applies.

// POST /api/billing/razorpay/order - create an order for a plan (amount in paise, INR)
router.post("/razorpay/order", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { plan } = req.body || {};
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: "Invalid plan" });
  const problem = razorpay.configProblem();
  if (problem) return res.status(503).json({ error: problem });
  const amount = PLAN_PRICING[plan] && PLAN_PRICING[plan].inr; // paise, INR
  if (!amount || amount < 100) return res.status(400).json({ error: "Invalid amount" });
  try {
    const order = await razorpay.createOrder({
      amount,
      currency: "INR",
      receipt: `sub_${plan}_${Date.now()}`.slice(0, 40),
      notes: { tenant_id: req.user.tenant_id, plan },
    });
    // key_id is public and safe to return; the SECRET never leaves the server.
    res.json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: razorpay.keyId(), plan });
  } catch (e) {
    console.error("[billing] razorpay order", e.statusCode, e.message);
    if (e.statusCode === 401) return res.status(401).json({ error: "Razorpay auth failed - check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET on the server." });
    res.status(500).json({ error: `Razorpay: ${e.message || "could not create order"}` });
  }
});

// POST /api/billing/razorpay/verify - verify the payment signature, then apply the plan
router.post("/razorpay/verify", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { plan, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ error: "Missing payment fields" });
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: "Invalid plan" });
  const ok = razorpay.verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature });
  if (!ok) return res.status(400).json({ error: "Payment verification failed - signature mismatch." });
  // Verified - apply the plan (~30-day period for this one-time Standard Checkout).
  await applyPlan(req.user.tenant_id, plan, {
    provider: "razorpay",
    razorpayPaymentId: razorpay_payment_id,
    status: "active",
    periodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  });
  // Self-serve plan changes were never audited (only the admin-console override was) —
  // the same tenant.plan_change action the admin metrics dashboard's downgrade signal
  // reads, so a real self-serve upgrade now shows up in both the audit trail and,
  // eventually, downgrade detection once a cancel flow exists.
  writeAudit(req.user.id, "tenant.plan_change", "tenant", req.user.tenant_id, { plan, via: "razorpay_checkout" });
  await subscriptionInvoice.recordInvoice(req.user.tenant_id, {
    plan, cycle: "monthly", amountPaise: PLAN_PRICING[plan].inr, razorpayPaymentId: razorpay_payment_id,
  }).catch((e) => console.error("[billing] invoice record failed:", e.message));
  res.json({ ok: true, plan });
});

// ── Razorpay Subscriptions + UPI Autopay (real recurring billing) ───────────
// Unlike /razorpay/order above (one-time Standard Checkout, no auto-renew), this
// creates an actual recurring mandate: the customer authorizes UPI Autopay/an
// e-mandate ONCE, and Razorpay itself re-charges each cycle - no cron re-billing.

// POST /api/billing/razorpay/subscription - create a subscription; frontend opens
// Razorpay Checkout in subscription mode with the returned subscription_id.
router.post("/razorpay/subscription", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { plan, cycle, coupon } = req.body || {};
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: "Invalid plan" });
  if (!["monthly", "annual"].includes(cycle)) return res.status(400).json({ error: "cycle must be 'monthly' or 'annual'" });
  const problem = razorpay.configProblem();
  if (problem) return res.status(503).json({ error: problem });
  const monthlyInr = PLAN_PRICING[plan]?.inr;
  if (!monthlyInr) return res.status(400).json({ error: "Invalid amount" });

  let amount = cycle === "annual" ? annualAmount(monthlyInr) : monthlyInr;
  let planKey = `${plan}_${cycle}`;
  let isFounding = false;

  if (coupon) {
    if (coupon !== FOUNDING_COUPON) return res.status(400).json({ error: "Unknown coupon code." });
    if (cycle !== "annual") return res.status(400).json({ error: "The founding-member offer applies to annual billing only." });
    const { rows: cnt } = await pool.query("SELECT count(*)::int AS n FROM tenant_billing WHERE is_founding_member=true");
    if ((cnt[0]?.n ?? 0) >= FOUNDING_MEMBER_CAP) return res.status(410).json({ error: "The founding-member offer is sold out." });
    isFounding = true;
    amount = Math.round(amount * FOUNDING_DISCOUNT);
    planKey = `founding_${plan}_annual`;
  }

  try {
    const planId = await getOrCreatePlan(planKey, {
      period: cycle === "annual" ? "yearly" : "monthly",
      interval: 1,
      name: `Headroom ${plan.charAt(0).toUpperCase() + plan.slice(1)} (${cycle}${isFounding ? ", founding member" : ""})`,
      amount,
    });
    const sub = await razorpay.createSubscription({
      planId, totalCount: TOTAL_CYCLES[cycle], tenantId: req.user.tenant_id, plan, cycle,
    });
    // Stash as 'created' (not yet paid/authorized) so verify/webhook can find this
    // tenant by subscription id once the customer completes the Checkout mandate.
    await pool.query(
      `INSERT INTO tenant_billing(tenant_id, plan, provider, status, razorpay_subscription_id, cycle, is_founding_member, updated_at)
       VALUES($1,$2,'razorpay','created',$3,$4,$5,now())
       ON CONFLICT (tenant_id) DO UPDATE SET
         plan=$2, provider='razorpay', status='created', razorpay_subscription_id=$3, cycle=$4, is_founding_member=$5, updated_at=now()`,
      [req.user.tenant_id, plan, sub.id, cycle, isFounding]
    );
    res.json({ subscription_id: sub.id, key_id: razorpay.keyId(), plan, cycle, amount, founding_member: isFounding });
  } catch (e) {
    console.error("[billing] razorpay subscription", e.statusCode, e.message);
    if (e.statusCode === 401) return res.status(401).json({ error: "Razorpay auth failed - check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET on the server." });
    res.status(500).json({ error: `Razorpay: ${e.message || "could not create subscription"}` });
  }
});

// POST /api/billing/razorpay/subscription/verify - verify the FIRST charge's
// signature (a different formula from Orders), then activate the subscription.
// Later renewals are handled entirely by the webhook (routes/collections.js) -
// this endpoint only ever runs once, right after the customer authorizes the mandate.
router.post("/razorpay/subscription/verify", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body || {};
  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) return res.status(400).json({ error: "Missing payment fields" });
  const ok = razorpay.verifySubscriptionSignature({ paymentId: razorpay_payment_id, subscriptionId: razorpay_subscription_id, signature: razorpay_signature });
  if (!ok) return res.status(400).json({ error: "Payment verification failed - signature mismatch." });
  // Must be THIS tenant's own pending subscription - never apply an arbitrary
  // subscription_id's success to the caller's tenant.
  const { rows } = await pool.query(
    "SELECT plan, cycle, is_founding_member FROM tenant_billing WHERE tenant_id=$1 AND razorpay_subscription_id=$2",
    [req.user.tenant_id, razorpay_subscription_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "No matching subscription for this account." });
  // Pull the authoritative current_end from Razorpay itself - never trust a
  // client-supplied period. Non-fatal if it fails; the webhook will catch up.
  let periodEndUnix = null;
  try { const sub = await razorpay.getSubscription(razorpay_subscription_id); periodEndUnix = sub.current_end || null; }
  catch (e) { console.warn("[billing] couldn't fetch subscription for period end:", e.message); }
  await pool.query(
    `UPDATE tenant_billing SET status='active', razorpay_payment_id=$1,
       current_period_end=COALESCE(to_timestamp($2::double precision), current_period_end), updated_at=now()
     WHERE tenant_id=$3`,
    [razorpay_payment_id, periodEndUnix, req.user.tenant_id]
  );
  await pool.query("UPDATE users SET subscription_plan=$1 WHERE tenant_id=$2", [rows[0].plan, req.user.tenant_id]);
  writeAudit(req.user.id, "tenant.plan_change", "tenant", req.user.tenant_id, { plan: rows[0].plan, cycle: rows[0].cycle, via: "razorpay_subscription" });
  // GST invoice for this first charge - the Plan object is immutable-priced, so the
  // cached amount IS what Razorpay actually charged for cycle #1.
  const planKey = rows[0].is_founding_member ? `founding_${rows[0].plan}_annual` : `${rows[0].plan}_${rows[0].cycle}`;
  const { rows: cachedPlan } = await pool.query("SELECT amount FROM razorpay_plans WHERE plan_key=$1", [planKey]);
  if (cachedPlan[0]) {
    await subscriptionInvoice.recordInvoice(req.user.tenant_id, {
      plan: rows[0].plan, cycle: rows[0].cycle, amountPaise: cachedPlan[0].amount, razorpayPaymentId: razorpay_payment_id,
    }).catch((e) => console.error("[billing] invoice record failed:", e.message));
  }
  res.json({ ok: true, plan: rows[0].plan });
});

// POST /api/billing/razorpay/subscription/cancel - self-serve cancel. Access
// continues through the period already paid for (cancel_at_cycle_end); the daily
// expiry sweep reverts to Free once that period actually ends.
router.post("/razorpay/subscription/cancel", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT razorpay_subscription_id FROM tenant_billing WHERE tenant_id=$1", [req.user.tenant_id]
  );
  const subId = rows[0]?.razorpay_subscription_id;
  if (!subId) return res.status(400).json({ error: "No active subscription to cancel." });
  try {
    await razorpay.cancelSubscription(subId, { cancelAtCycleEnd: true });
    await pool.query("UPDATE tenant_billing SET status='cancelled', updated_at=now() WHERE tenant_id=$1", [req.user.tenant_id]);
    writeAudit(req.user.id, "tenant.plan_change", "tenant", req.user.tenant_id, { via: "razorpay_cancel" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[billing] cancel subscription", e.statusCode, e.message);
    res.status(500).json({ error: `Razorpay: ${e.message || "could not cancel subscription"}` });
  }
});

// GET /api/billing/founding-member-status - remaining slots, for the pricing page
// to show real scarcity (never a fake/hardcoded countdown).
router.get("/founding-member-status", async (req, res) => {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM tenant_billing WHERE is_founding_member=true");
  const claimed = rows[0]?.n ?? 0;
  res.json({ cap: FOUNDING_MEMBER_CAP, claimed, remaining: Math.max(0, FOUNDING_MEMBER_CAP - claimed), sold_out: claimed >= FOUNDING_MEMBER_CAP });
});

// GET /api/billing/plans - PUBLIC. The single real source for trial length, plan
// prices, and the founding-member terms, read directly from the constants that
// actually govern checkout/enforcement above - never a second, editable copy that
// could drift (an audit found the marketing site showing three different price
// sets: its own hardcoded numbers, a stale unused platform_settings.pricing group,
// and what Razorpay actually charges. This endpoint is the fix: there is now
// exactly one number for each fact, and every surface reads it from here).
router.get("/plans", async (req, res) => {
  const { TRIAL_DAYS, TRIAL_PLAN } = require("../lib/billingLifecycle");
  const plans = {};
  for (const plan of VALID_PLANS) {
    const monthlyInr = PLAN_PRICING[plan].inr / 100;
    plans[plan] = { monthlyInr, annualInr: annualAmount(PLAN_PRICING[plan].inr) / 100, annualMonthlyEquivalentInr: Math.round(annualAmount(PLAN_PRICING[plan].inr) / 100 / 12) };
  }
  res.json({
    trialDays: TRIAL_DAYS,
    trialPlan: TRIAL_PLAN,
    plans,
    annualMonthsCharged: ANNUAL_MONTHS_CHARGED,
    foundingMemberCap: FOUNDING_MEMBER_CAP,
    foundingDiscountPct: Math.round((1 - FOUNDING_DISCOUNT) * 100),
  });
});

// ── GST invoices for Headroom's OWN subscription charges (B2B ITC compliance) ──

// GET /api/billing/invoices - this tenant's subscription-charge invoice history.
router.get("/invoices", authenticate, async (req, res) => {
  try { res.json(await subscriptionInvoice.listInvoices(req.user.tenant_id)); }
  catch (e) { console.error("[billing] list invoices", e.message); res.status(500).json({ error: "Internal error" }); }
});

// GET /api/billing/invoices/:id/pdf - download one, tenant-scoped.
router.get("/invoices/:id/pdf", authenticate, async (req, res) => {
  const inv = await subscriptionInvoice.getInvoice(req.user.tenant_id, req.params.id);
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const { rows: profRows } = await pool.query("SELECT legal_name FROM tenant_profile WHERE tenant_id=$1 LIMIT 1", [req.user.tenant_id]).catch(() => ({ rows: [] }));
  const { rows: kvRows } = await pool.query("SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='app' AND key='store' LIMIT 1", [req.user.tenant_id]);
  const firm = kvRows[0]?.value?.value?.firm ?? {};
  const buyerName = profRows[0]?.legal_name || firm.name || "Customer";

  const PDFDoc = require("pdfkit");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${inv.invoice_number}.pdf"`);
  const doc = new PDFDoc({ margin: 50, size: "A4" });
  doc.pipe(res);

  doc.fontSize(20).font("Helvetica-Bold").text("TAX INVOICE", 50, 50);
  doc.fontSize(10).font("Helvetica").fillColor("#666")
    .text(inv.invoice_number, 50, 76)
    .text(`Date: ${new Date(inv.created_at).toLocaleDateString("en-IN")}`, 50, 90);

  const right = 350;
  doc.fillColor("#000").font("Helvetica-Bold").text(subscriptionInvoice.platformLegalName(), right, 50, { align: "right", width: 200 });
  doc.font("Helvetica").fillColor("#666")
    .text(subscriptionInvoice.platformAddress(), right, 66, { align: "right", width: 200 })
    .text(subscriptionInvoice.platformGstin() ? `GSTIN: ${subscriptionInvoice.platformGstin()}` : "GSTIN not configured", right, 80, { align: "right", width: 200 });

  doc.fillColor("#000").font("Helvetica-Bold").text("Billed To:", 50, 140);
  doc.font("Helvetica").text(buyerName, 50, 156);
  if (inv.buyer_gstin) doc.text(`GSTIN: ${inv.buyer_gstin}`, 50, 170);
  doc.fillColor("#666").fontSize(9)
    .text(inv.inter_state ? "Inter-state supply (IGST)" : "Intra-state supply (CGST+SGST)", 50, inv.buyer_gstin ? 184 : 170)
    .fillColor("#000").fontSize(10);

  const tableTop = 220;
  doc.fillColor("#1A6B55").rect(50, tableTop, 500, 22).fill();
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9)
    .text("Description", 55, tableTop + 6, { width: 300 })
    .text("Amount", 480, tableTop + 6, { width: 60, align: "right" });

  const planLabel = inv.plan.charAt(0).toUpperCase() + inv.plan.slice(1);
  doc.fillColor("#000").font("Helvetica").fontSize(10)
    .text(`Headroom ${planLabel} Plan Subscription (${inv.cycle})`, 55, tableTop + 30, { width: 300 })
    .text(`Rs. ${Number(inv.base_amount).toFixed(2)}`, 480, tableTop + 30, { width: 60, align: "right" });

  let y = tableTop + 55;
  doc.fontSize(9).fillColor("#666");
  if (inv.inter_state) {
    doc.text(`IGST (${Number(inv.gst_rate).toFixed(0)}%)`, 55, y, { width: 300 }).text(`Rs. ${Number(inv.gst_amount).toFixed(2)}`, 480, y, { width: 60, align: "right" });
    y += 16;
  } else {
    const half = Number(inv.gst_amount) / 2;
    doc.text(`CGST (${(Number(inv.gst_rate) / 2).toFixed(1)}%)`, 55, y, { width: 300 }).text(`Rs. ${half.toFixed(2)}`, 480, y, { width: 60, align: "right" });
    y += 16;
    doc.text(`SGST (${(Number(inv.gst_rate) / 2).toFixed(1)}%)`, 55, y, { width: 300 }).text(`Rs. ${half.toFixed(2)}`, 480, y, { width: 60, align: "right" });
    y += 16;
  }
  doc.moveTo(50, y + 4).lineTo(550, y + 4).strokeColor("#ddd").stroke();
  doc.font("Helvetica-Bold").fillColor("#000").fontSize(11)
    .text("Total", 55, y + 12, { width: 300 })
    .text(`Rs. ${Number(inv.total_amount).toFixed(2)}`, 480, y + 12, { width: 60, align: "right" });

  doc.fontSize(8).fillColor("#999")
    .text("This is a computer-generated tax invoice for a SaaS subscription and does not require a signature.", 50, y + 50, { width: 500 });

  doc.end();
});

module.exports = router;
