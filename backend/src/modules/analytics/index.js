"use strict";
// Product analytics data layer. track() is CONSENT-GATED (DPDP): it silently skips
// when the user has opted out of the 'analytics' purpose in the consents ledger.
// overview() powers the admin dashboard (funnel / active users / top events /
// segments), tenant-scoped for an owner or platform-wide for super_admin.
const { pool } = require("../../db");
const crypto = require("crypto");

class AnalyticsError extends Error {
  constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; }
}
const clampDays = (d) => Math.min(Math.max(parseInt(d, 10) || 30, 1), 365);

// Track unless the user explicitly opted OUT of analytics (legitimate first-party
// product-usage data defaults on; an explicit granted=false row turns it off).
async function hasAnalyticsConsent(userId) {
  if (!userId) return true;
  const { rows } = await pool.query(
    "SELECT granted FROM consents WHERE user_id=$1 AND purpose='analytics' LIMIT 1", [userId]
  ).catch(() => ({ rows: [] }));
  return rows[0] ? rows[0].granted !== false : true;
}

async function track(tenantId, userId, { event, props = {}, sessionId, path, ua } = {}) {
  const ev = String(event || "").trim().slice(0, 80);
  if (!ev) throw new AnalyticsError("BAD_INPUT", "event is required", 400);
  if (!(await hasAnalyticsConsent(userId))) return { skipped: "no-consent" };
  let p = props && typeof props === "object" && !Array.isArray(props) ? props : {};
  try { JSON.stringify(p); } catch { p = {}; }
  await pool.query(
    `INSERT INTO analytics_events(tenant_id,user_id,event,props,session_id,path,ua)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, userId || null, ev, JSON.stringify(p), sessionId ? String(sessionId).slice(0, 64) : null,
     path ? String(path).slice(0, 200) : null, ua ? String(ua).slice(0, 200) : null]
  );
  return { tracked: true };
}

// ── Onboarding profile ──────────────────────────────────────────────────────
const PROFILE_FIELDS = ["industry", "business_type", "gst_registered", "gstin", "turnover_band", "team_size", "city", "state", "primary_goal", "acquisition_source"];

async function saveProfile(tenantId, body = {}) {
  const cols = [], vals = [tenantId]; let i = 1;
  for (const f of PROFILE_FIELDS) {
    if (body[f] !== undefined) { cols.push(f); vals.push(f === "gst_registered" ? !!body[f] : (body[f] == null ? null : String(body[f]).slice(0, 200))); }
  }
  const sets = cols.map((c, k) => `${c}=$${k + 2}`);
  await pool.query(
    `INSERT INTO tenant_profile(tenant_id${cols.length ? "," + cols.join(",") : ""}, onboarded_at, updated_at)
       VALUES($1${cols.map((_, k) => `,$${k + 2}`).join("")}, now(), now())
     ON CONFLICT(tenant_id) DO UPDATE SET ${[...sets, "onboarded_at=COALESCE(tenant_profile.onboarded_at, now())", "updated_at=now()"].join(", ")}`,
    vals
  );
  return getProfile(tenantId);
}
async function getProfile(tenantId) {
  const { rows } = await pool.query("SELECT * FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
  return rows[0] || null;
}

// ── Overview (admin dashboard) ────────────────────────────────────────────────
// scopeTenantId null/undefined → platform-wide (super_admin); else tenant-scoped.
const FUNNEL_STEPS = [
  { key: "signup_completed",      label: "Signed up" },
  { key: "onboarding_completed",  label: "Onboarded" },
  { key: "invoice_created",       label: "Created an invoice" },
  { key: "forecast_run",          label: "Ran a forecast" },
];

async function overview(scopeTenantId, { days } = {}) {
  const d = clampDays(days);
  const scoped = !!scopeTenantId;
  const tFilter = scoped ? "AND tenant_id=$1" : "";
  const args = scoped ? [scopeTenantId] : [];
  const since = `created_at > now() - interval '${d} days'`;

  const activeRow = await pool.query(
    `SELECT
        COUNT(DISTINCT user_id) FILTER (WHERE created_at > now() - interval '1 day')  AS dau,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at > now() - interval '7 days')  AS wau,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at > now() - interval '30 days') AS mau,
        COUNT(*) FILTER (WHERE ${since}) AS events
     FROM analytics_events WHERE 1=1 ${tFilter}`, args
  );

  const funnel = [];
  for (const step of FUNNEL_STEPS) {
    const r = await pool.query(
      `SELECT COUNT(DISTINCT tenant_id) AS n FROM analytics_events WHERE event=$${args.length + 1} AND ${since} ${tFilter}`,
      [...args, step.key]
    );
    funnel.push({ ...step, count: Number(r.rows[0].n) });
  }

  const top = await pool.query(
    `SELECT event, COUNT(*) AS n, COUNT(DISTINCT tenant_id) AS tenants
     FROM analytics_events WHERE ${since} ${tFilter}
     GROUP BY event ORDER BY n DESC LIMIT 15`, args
  );

  // Behaviour by stakeholder (the role stamped on every event).
  const byRole = await pool.query(
    `SELECT props->>'role' AS role, COUNT(*) AS n, COUNT(DISTINCT user_id) AS users
     FROM analytics_events WHERE ${since} AND props->>'role' IS NOT NULL ${tFilter}
     GROUP BY role ORDER BY n DESC`, args
  );

  // Most-visited pages (from page_view events).
  const topPaths = await pool.query(
    `SELECT path, COUNT(*) AS n FROM analytics_events
     WHERE event='page_view' AND ${since} AND path IS NOT NULL ${tFilter}
     GROUP BY path ORDER BY n DESC LIMIT 12`, args
  );

  // Session engagement: duration = last - first event in a session_id.
  const sess = await pool.query(
    `SELECT COUNT(*)::int AS sessions, COALESCE(AVG(secs),0) AS avg_secs, COALESCE(AVG(evts),0) AS avg_events
     FROM (SELECT session_id, EXTRACT(epoch FROM (MAX(created_at)-MIN(created_at))) AS secs, COUNT(*) AS evts
           FROM analytics_events WHERE session_id IS NOT NULL AND ${since} ${tFilter}
           GROUP BY session_id) s`, args
  );
  const r1 = (x) => Math.round(Number(x) * 10) / 10;

  // Segments only meaningful platform-wide (an owner has one profile).
  const segBy = async (col) => {
    if (scoped) return [];
    const r = await pool.query(
      `SELECT COALESCE(${col},'(unknown)') AS k, COUNT(*) AS n FROM tenant_profile
       WHERE ${col} IS NOT NULL GROUP BY k ORDER BY n DESC LIMIT 10`
    ).catch(() => ({ rows: [] }));
    return r.rows.map((x) => ({ key: x.k, count: Number(x.n) }));
  };

  return {
    scope: scoped ? "tenant" : "platform",
    window_days: d,
    active: { dau: Number(activeRow.rows[0].dau), wau: Number(activeRow.rows[0].wau), mau: Number(activeRow.rows[0].mau), events: Number(activeRow.rows[0].events) },
    funnel,
    top_events: top.rows.map((r) => ({ event: r.event, count: Number(r.n), tenants: Number(r.tenants) })),
    by_role: byRole.rows.map((r) => ({ role: r.role, count: Number(r.n), users: Number(r.users) })),
    top_paths: topPaths.rows.map((r) => ({ path: r.path, count: Number(r.n) })),
    sessions: { count: Number(sess.rows[0].sessions), avg_minutes: r1(Number(sess.rows[0].avg_secs) / 60), avg_events: r1(sess.rows[0].avg_events) },
    segments: { industry: await segBy("industry"), turnover_band: await segBy("turnover_band"), primary_goal: await segBy("primary_goal"), acquisition_source: await segBy("acquisition_source") },
  };
}

// Weekly retention cohorts: group users by the week of their first event, then for
// each later week show what % of that cohort came back. Optional role filter →
// retention per stakeholder type.
async function retention(scopeTenantId, { weeks, role } = {}) {
  const w = Math.min(Math.max(parseInt(weeks, 10) || 8, 2), 26);
  const conds = ["user_id IS NOT NULL"]; const args = [];
  if (scopeTenantId) { args.push(scopeTenantId); conds.push(`tenant_id=$${args.length}`); }
  if (role) { args.push(role); conds.push(`props->>'role'=$${args.length}`); }
  const where = conds.join(" AND ");
  const { rows } = await pool.query(
    `WITH fs AS (
        SELECT user_id, date_trunc('week', MIN(created_at)) AS cohort_week
        FROM analytics_events WHERE ${where} GROUP BY user_id
     ), act AS (
        SELECT DISTINCT user_id, date_trunc('week', created_at) AS wk
        FROM analytics_events WHERE ${where}
     )
     SELECT fs.cohort_week::date AS cohort,
            (EXTRACT(epoch FROM (act.wk - fs.cohort_week)) / 604800)::int AS off,
            COUNT(DISTINCT act.user_id)::int AS n
     FROM fs JOIN act ON act.user_id = fs.user_id AND act.wk >= fs.cohort_week
     WHERE fs.cohort_week >= date_trunc('week', now()) - ($${args.length + 1}::int * interval '1 week')
     GROUP BY cohort, off ORDER BY cohort, off`,
    [...args, w]
  );
  const byCohort = {};
  for (const r of rows) {
    const c = (byCohort[r.cohort] ??= { cohort: r.cohort, size: 0, off: {} });
    c.off[r.off] = r.n;
    if (r.off === 0) c.size = r.n;
  }
  const cohorts = Object.values(byCohort)
    .sort((a, b) => (a.cohort < b.cohort ? -1 : 1))
    .map((c) => ({
      cohort: c.cohort, size: c.size,
      retention: Array.from({ length: w + 1 }, (_, k) => (c.size > 0 ? Math.round(((c.off[k] || 0) / c.size) * 100) : 0)),
    }));
  return { weeks: w, role: role || null, cohorts };
}

// ── Win-back: detect dormant businesses + nudge them ──────────────────────────
const ci = (v, d, lo, hi) => Math.min(Math.max(parseInt(v, 10) || d, lo), hi);
const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

// Reason-specific nudge copy. Channel-NEUTRAL on purpose (the email footer says
// "do not reply", so no reply CTAs) and TRUTHFUL — only the invoice reasons quote a
// ₹ amount (backed by SUM(total_amount)); none claim a feature the tenant may not
// have used. n=name, d=days idle, a=₹ amount.
const REASON_MSG = {
  overdue_invoices:    (n, d, a) => `Hi${n ? " " + n : ""}, you have ${inr(a)} in overdue invoices waiting to be collected on Headroom. Open the app to send a payment reminder in one tap - getting paid is the fastest reason to log back in.`,
  unpaid_invoices:     (n, d, a) => `Hi${n ? " " + n : ""}, you have ${inr(a)} in unpaid invoices on Headroom. Track who owes you and send a reminder - your receivables are one tap away.`,
  active_then_dropped: (n, d)    => `Hi${n ? " " + n : ""}, it's been ${d} days since you used Headroom. Everything is right where you left it - pop in for a 30-second check on where your business stands this week.`,
  never_onboarded:     (n)       => `Hi${n ? " " + n : ""}, you signed up for Headroom but haven't finished setting up your business yet. It takes 2 minutes - add a few basics and your cash dashboard, GST tracker and invoicing are ready to use.`,
  dormant_generic:     (n, d)    => `Hi${n ? " " + n : ""}, we haven't seen you on Headroom in ${d} days. Your cash dashboard, GST status and invoicing are ready whenever you are - log in any time to pick up where you left off.`,
};
const REASON_LABEL = {
  overdue_invoices: "Overdue invoices",
  unpaid_invoices: "Unpaid invoices",
  active_then_dropped: "Was active, went quiet",
  never_onboarded: "Never finished setup",
  dormant_generic: "General re-engagement",
};

// Businesses whose last activity is idleDays-90d ago (active before, gone quiet now)
// and that haven't already been nudged within cooldownDays.
async function findDormant(scopeTenantId, { idleDays, cooldownDays } = {}) {
  const idle = ci(idleDays, 14, 1, 180), cool = ci(cooldownDays, 30, 1, 180);
  // last_seen counts REAL user activity only — our own nudge/holdout rows are not the
  // user being active, so they must not reset the dormancy clock.
  const args = []; let lastWhere = "WHERE event NOT IN ('winback_nudge','winback_holdout')";
  if (scopeTenantId) { args.push(scopeTenantId); lastWhere += ` AND tenant_id=$${args.length}`; }
  args.push(idle); const idleIdx = args.length;
  args.push(cool); const coolIdx = args.length;
  const { rows } = await pool.query(
    `WITH last AS (SELECT tenant_id, MAX(created_at) AS last_seen FROM analytics_events ${lastWhere} GROUP BY tenant_id),
          nudged AS (SELECT DISTINCT tenant_id FROM analytics_events WHERE event IN ('winback_nudge','winback_holdout') AND created_at > now() - ($${coolIdx} * interval '1 day'))
     SELECT l.tenant_id, l.last_seen, EXTRACT(day FROM now() - l.last_seen)::int AS days_idle
     FROM last l
     WHERE l.last_seen < now() - ($${idleIdx} * interval '1 day')
       AND l.last_seen > now() - interval '90 days'
       AND l.tenant_id NOT IN (SELECT tenant_id FROM nudged)
     ORDER BY l.last_seen ASC LIMIT 500`, args
  );
  return rows.map((r) => ({ tenant_id: r.tenant_id, last_seen: r.last_seen, days_idle: Number(r.days_idle) }));
}

async function firmContact(tenantId) {
  const { rows } = await pool.query(
    "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='app' AND key='store' LIMIT 1", [tenantId]
  ).catch(() => ({ rows: [] }));
  const firm = rows[0]?.value?.value?.firm ?? {};
  return { name: firm.name || null, phone: firm.phone || null, email: firm.email || null };
}

// Why did this business go quiet? Returns { reason, label, amount? } from data we
// already capture — two tenant-scoped, indexed queries run concurrently; never
// throws (a missing invoices/users table degrades to the generic reason). Precedence
// (first match wins): money owed → was-active → never-set-up → generic. Money-backed
// reasons win because a concrete ₹ figure is the most actionable thing to log in for.
async function classifyReason(tenantId, daysIdle) {
  const [q1, q2] = await Promise.all([
    pool.query(
      `SELECT (MIN(p.onboarded_at) IS NULL) AS not_onboarded,
              bool_or(ae.event='onboarding_completed') AS completed_ev,
              bool_or(ae.event IN ('invoice_created','forecast_run','loan_accepted','campaign_published')) AS reached_value,
              (SELECT bool_or(u.role='owner') FROM users u WHERE u.tenant_id=$1) AS has_owner
       FROM analytics_events ae LEFT JOIN tenant_profile p ON p.tenant_id=ae.tenant_id
       WHERE ae.tenant_id=$1 AND ae.event <> 'winback_nudge'`, [tenantId]
    ).catch(() => ({ rows: [{}] })),
    pool.query(
      `SELECT count(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('paid','cancelled','draft')) AS overdue_count,
              COALESCE(SUM(total_amount) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('paid','cancelled','draft')),0) AS overdue_amount,
              count(*) FILTER (WHERE status NOT IN ('paid','cancelled','draft')) AS unpaid_count,
              COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('paid','cancelled','draft')),0) AS unpaid_amount
       FROM invoices WHERE tenant_id=$1`, [tenantId]
    ).catch(() => ({ rows: [{ overdue_count: 0, unpaid_count: 0, overdue_amount: 0, unpaid_amount: 0 }] })),
  ]);
  const a = q1.rows[0] || {}, b = q2.rows[0] || {};
  let reason, amount;
  if (Number(b.overdue_count) > 0) { reason = "overdue_invoices"; amount = Number(b.overdue_amount); }
  else if (Number(b.unpaid_count) > 0) { reason = "unpaid_invoices"; amount = Number(b.unpaid_amount); }
  else if (a.reached_value) reason = "active_then_dropped";
  else if (a.has_owner && a.not_onboarded && !a.completed_ev) reason = "never_onboarded";
  else reason = "dormant_generic";
  return { reason, label: REASON_LABEL[reason], ...(amount ? { amount } : {}) };
}

// Nudge each dormant business via WhatsApp → email → in-app alert (whichever is
// available), and record a 'winback_nudge' event so we don't re-nudge within the
// cooldown. dryRun records the decision without actually sending (used by tests).
// Holdout assignment: a stable, deterministic per-tenant bucket [0,99] (md5 of the
// id, unsigned). A business is CONTROL iff bucket < holdoutPct — same business every
// run, so it never flips arms. Permanent (not per-episode) so a tenant's own past
// nudges can never contaminate a later holdout episode.
function holdoutBucket(tenantId) {
  const h = crypto.createHash("md5").update("winback:" + String(tenantId).trim()).digest();
  return (h.readUInt32BE(0) >>> 0) % 100;
}
function holdoutPctEnv() {
  const v = parseInt(process.env.WINBACK_HOLDOUT_PCT ?? "10", 10); // 0 disables; unset → 10
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), 50) : 10;
}

async function runWinback({ idleDays, cooldownDays, dryRun = false, scopeTenantId = null } = {}) {
  const dormant = await findDormant(scopeTenantId, { idleDays, cooldownDays });
  const waLive = !!(process.env.TWILIO_ACCOUNT_SID && String(process.env.TWILIO_ACCOUNT_SID).trim());
  const mailLive = !!(process.env.SMTP_USER && String(process.env.SMTP_USER).trim());
  const holdoutPct = holdoutPctEnv();
  const channels = {}, reasons = {};
  let treated = 0, held = 0;
  for (const t of dormant) {
    const { reason, amount } = await classifyReason(t.tenant_id, t.days_idle);
    // CONTROL: record a symmetric decision row but send nothing, so lift can compare
    // returns at the same decision point. (holdoutPct=0 disables → everyone treated.)
    if (holdoutPct > 0 && holdoutBucket(t.tenant_id) < holdoutPct) {
      held++;
      await track(t.tenant_id, null, { event: "winback_holdout", props: { reason, days_idle: t.days_idle, group: "control", holdout_pct: holdoutPct, ...(amount ? { amount } : {}) } }).catch(() => {});
      continue;
    }
    const c = await firmContact(t.tenant_id);
    const msg = (REASON_MSG[reason] || REASON_MSG.dormant_generic)(c.name, t.days_idle, amount);
    let channel = "alert";
    if (dryRun) channel = "dry";
    else {
      try {
        if (waLive && c.phone) { await require("../../lib/whatsapp").sendWhatsApp(c.phone, msg); channel = "whatsapp"; }
        else if (mailLive && c.email) { await require("../../lib/email").sendMail({ to: c.email, subject: "We miss you at Headroom", html: `<p>${msg}</p>` }); channel = "email"; }
        else { await pool.query("INSERT INTO alerts(tenant_id, rule_id, severity, title, message, meta) VALUES($1,NULL,'info',$2,$3,$4)", [t.tenant_id, "We miss you", msg, JSON.stringify({ kind: "winback", days_idle: t.days_idle, reason })]).catch(() => {}); channel = "alert"; }
      } catch (e) { try { console.warn("[winback] send failed", t.tenant_id, e.message); } catch {} channel = "failed"; }
    }
    treated++;
    channels[channel] = (channels[channel] || 0) + 1;
    reasons[reason] = (reasons[reason] || 0) + 1;
    // Don't burn the 30-day cooldown on a failed send — leave the tenant eligible for retry.
    if (channel !== "failed") await track(t.tenant_id, null, { event: "winback_nudge", props: { channel, days_idle: t.days_idle, reason, holdout_pct: holdoutPct, ...(amount ? { amount } : {}) } }).catch(() => {});
  }
  return { scanned: dormant.length, treated, holdout: held, holdout_pct: holdoutPct, channels, reasons };
}

// ── Did the nudges work? Win-back → reactivation funnel ───────────────────────
// Per-NUDGE attribution: a nudge counts as "reactivated" if the tenant did a REAL
// (non-nudge) event STRICTLY after it, within windowDays — AND before any follow-up
// nudge to that tenant (the LEAD cap), so one return is never double-credited across
// overlapping windows at any windowDays. Only nudges whose window has fully elapsed
// ("matured") enter the rate; fresher ones are "pending" (neither hit nor miss yet).
// Dry-run nudges are excluded from the headline rate (never actually sent) but kept
// visible in by_channel. HONESTY: there is no control group, so this is the share of
// nudges FOLLOWED BY a return (correlation), not causal lift — some would return anyway.
const WINBACK_MIN_N = 5; // below this a percentage is noise; surface the raw fraction instead
async function reactivation(scopeTenantId, { windowDays } = {}) {
  const w = ci(windowDays, 14, 1, 180);
  const { rows } = await pool.query(
    `WITH nudges AS (
       SELECT wn.id, wn.tenant_id, wn.created_at,
              COALESCE(wn.props->>'reason','unknown')  AS reason,
              COALESCE(wn.props->>'channel','unknown') AS channel,
              LEAD(wn.created_at) OVER (PARTITION BY wn.tenant_id ORDER BY wn.created_at) AS next_nudge_at,
              (wn.created_at <= now() - ($2::int * interval '1 day')) AS matured
       FROM analytics_events wn
       WHERE wn.event='winback_nudge' AND ($1::text IS NULL OR wn.tenant_id=$1::text)
     ), scored AS (
       SELECT n.reason, n.channel, n.matured,
              EXISTS (SELECT 1 FROM analytics_events ae
                      WHERE ae.tenant_id=n.tenant_id AND ae.event NOT IN ('winback_nudge','winback_holdout')
                        AND ae.created_at >  n.created_at
                        AND ae.created_at <= n.created_at + ($2::int * interval '1 day')
                        AND ae.created_at <  COALESCE(n.next_nudge_at, 'infinity'::timestamptz)) AS reactivated
       FROM nudges n
     )
     SELECT 'reason'  AS kind, reason  AS key, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE reactivated)::int AS reactivated
       FROM scored WHERE matured AND channel <> 'dry' GROUP BY reason
     UNION ALL
     SELECT 'channel', channel, COUNT(*)::int, COUNT(*) FILTER (WHERE reactivated)::int
       FROM scored WHERE matured GROUP BY channel
     UNION ALL
     SELECT 'overall', NULL, COUNT(*) FILTER (WHERE channel <> 'dry')::int, COUNT(*) FILTER (WHERE reactivated AND channel <> 'dry')::int
       FROM scored WHERE matured
     UNION ALL
     SELECT 'pending', NULL, COUNT(*) FILTER (WHERE NOT matured)::int, 0
       FROM scored`, [scopeTenantId || null, w]
  );
  const pct = (r, n) => (n > 0 ? Math.round((r / n) * 1000) / 10 : null); // null (not 0%) when n=0
  const mk = (r) => { const n = Number(r.n); return { key: r.key, nudges: n, reactivated: Number(r.reactivated), rate: pct(Number(r.reactivated), n), reliable: n >= WINBACK_MIN_N }; };
  const o = rows.find((r) => r.kind === "overall") || { n: 0, reactivated: 0 };
  return {
    scope: scopeTenantId ? "tenant" : "platform",
    window_days: w, min_n: WINBACK_MIN_N,
    overall: mk(o),
    by_reason: rows.filter((r) => r.kind === "reason").map(mk).sort((a, b) => b.nudges - a.nudges),
    by_channel: rows.filter((r) => r.kind === "channel").map((r) => ({ ...mk(r), dry_run: r.key === "dry" })).sort((a, b) => b.nudges - a.nudges),
    pending: Number((rows.find((r) => r.kind === "pending") || {}).n || 0),
    disclaimer: `Correlation, not causal lift. With no control group some businesses would have returned anyway — read this as the share of nudges followed by a return within ${w} days (an upper bound on the nudge's effect), not the share of businesses the nudge brought back.`,
  };
}

// ── Causal lift: win-back vs a randomized holdout ─────────────────────────────
// Small-sample-correct statistics (the rates here live at small n and boundary
// proportions, where the normal/Wald approximations break):
//   • significance  → Fisher's exact test (exact at any n; no large-sample assumption)
//   • lift CI        → Agresti-Caffo (add-1-success/1-failure per arm; robust at 0%/100%)
//   • per-arm CI     → Wilson score (honest bounds when an arm is 0/n or n/n)
// The unit is ONE observation per tenant per arm (a tenant is re-recorded each cooldown;
// counting each row would be pseudo-replication and inflate significance), so the
// outcome is "did this business return at least once after a decision".
function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015;
  for (let j = 0; j < 6; j++) s += c[j] / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
const lnFact = (n) => lnGamma(n + 1);
const lnChoose = (n, k) => (k < 0 || k > n ? -Infinity : lnFact(n) - lnFact(k) - lnFact(n - k));
// Two-tailed Fisher exact for the 2×2 [[a,b],[c,d]] with fixed margins.
function fisherExact(a, b, c, d) {
  const n = a + b + c + d, r1 = a + b, c1 = a + c;
  if (n === 0) return 1;
  const lp = (x) => lnChoose(r1, x) + lnChoose(n - r1, c1 - x) - lnChoose(n, c1);
  const obs = lp(a), thr = obs + Math.log(1 + 1e-7);
  const lo = Math.max(0, c1 - (n - r1)), hi = Math.min(r1, c1);
  let p = 0;
  for (let x = lo; x <= hi; x++) { const v = lp(x); if (v <= thr) p += Math.exp(v); }
  return Math.min(1, p);
}
function wilson(x, n) { // 95% score interval, returned as percent [lo,hi]
  if (n === 0) return null;
  const z = 1.96, p = x / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z / d) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, Math.round((c - h) * 1000) / 10), Math.min(100, Math.round((c + h) * 1000) / 10)];
}
function acDiff(a, n1, c, n2) { // Agresti-Caffo 95% CI for p1−p2, returned as percentage points
  const p1 = (a + 1) / (n1 + 2), p2 = (c + 1) / (n2 + 2);
  const se = Math.sqrt(p1 * (1 - p1) / (n1 + 2) + p2 * (1 - p2) / (n2 + 2)), dlt = p1 - p2;
  return [Math.round(Math.max(-1, dlt - 1.96 * se) * 1000) / 10, Math.round(Math.min(1, dlt + 1.96 * se) * 1000) / 10];
}
const WINBACK_LIFT_MIN = 5; // per-arm floor below which we show "building", not a rate
function liftStats(a, n1, c, n2) {
  const rate = (x, n) => (n > 0 ? Math.round((x / n) * 1000) / 10 : null);
  const treatment = { tenants: n1, reactivated: a, rate: rate(a, n1), ci95: wilson(a, n1) };
  const control = { tenants: n2, reactivated: c, rate: rate(c, n2), ci95: wilson(c, n2) };
  if (n1 < WINBACK_LIFT_MIN || n2 < WINBACK_LIFT_MIN) {
    return { status: "building", min_per_arm: WINBACK_LIFT_MIN, treatment, control, lift_pp: null, lift_ci95: null, significant: null, p_value: null, mde_pp: null };
  }
  const p = fisherExact(a, n1 - a, c, n2 - c);
  const pPool = (a + c) / (n1 + n2);
  const mde = 2.80 * Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2)); // ≈(z.975+z.80)·SE, 80% power
  return {
    status: "ok", min_per_arm: WINBACK_LIFT_MIN, treatment, control,
    lift_pp: Math.round((a / n1 - c / n2) * 1000) / 10,
    lift_ci95: acDiff(a, n1, c, n2),
    significant: p < 0.05, p_value: Math.round(p * 1e4) / 1e4,
    mde_pp: Math.round(mde * 1000) / 10,
  };
}

// Treatment-vs-holdout lift. One Bernoulli per tenant per arm (collapsed via bool_or),
// arm tagged by the RECORDED event type (never re-hashed, so changing the holdout %
// can't relabel history). Same attribution as reactivation() (real event strictly
// after the decision, within window, before the next decision). dry-run excluded.
async function winbackLift(scopeTenantId, { windowDays } = {}) {
  const w = ci(windowDays, 14, 1, 180);
  const { rows } = await pool.query(
    `WITH decisions AS (
       SELECT ae.tenant_id, ae.created_at,
              CASE WHEN ae.event='winback_holdout' THEN 'control' ELSE 'treatment' END AS grp,
              COALESCE(ae.props->>'channel','') AS channel,
              LEAD(ae.created_at) OVER (PARTITION BY ae.tenant_id ORDER BY ae.created_at) AS next_at,
              (ae.created_at <= now() - ($2::int * interval '1 day')) AS matured
       FROM analytics_events ae
       WHERE ae.event IN ('winback_nudge','winback_holdout') AND ($1::text IS NULL OR ae.tenant_id=$1::text)
     ), scored AS (
       SELECT d.tenant_id, d.grp,
              EXISTS (SELECT 1 FROM analytics_events r
                      WHERE r.tenant_id=d.tenant_id AND r.event NOT IN ('winback_nudge','winback_holdout')
                        AND r.created_at >  d.created_at
                        AND r.created_at <= d.created_at + ($2::int * interval '1 day')
                        AND r.created_at <  COALESCE(d.next_at,'infinity'::timestamptz)) AS reactivated
       FROM decisions d WHERE d.matured AND d.channel <> 'dry'
     ), per_tenant AS (
       SELECT tenant_id, grp, bool_or(reactivated) AS reactivated FROM scored GROUP BY tenant_id, grp
     )
     SELECT grp, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE reactivated)::int AS reactivated
       FROM per_tenant GROUP BY grp`, [scopeTenantId || null, w]
  );
  const arm = (g) => rows.find((r) => r.grp === g) || { n: 0, reactivated: 0 };
  const tr = arm("treatment"), co = arm("control");
  const holdout_pct = holdoutPctEnv();
  return {
    scope: scopeTenantId ? "tenant" : "platform", window_days: w, holdout_pct,
    ...liftStats(Number(tr.reactivated), Number(tr.n), Number(co.reactivated), Number(co.n)),
    caveat: `Incremental lift of the win-back message vs a permanent randomized holdout (~${holdout_pct}% of businesses, assigned by a stable hash of business id — never sent the nudge). It is the EXTRA returns the message produces on top of the daily cash digest and overdue-invoice reminders, which every business including the holdout still receives — not nudge-vs-silence. Measured among businesses dormant 14-90 days, each counted once. Significance is Fisher's exact on the overall comparison only; arm balance is assumed, not enforced. The holdout is a real, ongoing cost: those businesses are deliberately not nudged so we can keep measuring whether the nudge works.`,
  };
}

module.exports = { AnalyticsError, track, saveProfile, getProfile, overview, retention, findDormant, classifyReason, runWinback, reactivation, liftStats, winbackLift, holdoutBucket, hasAnalyticsConsent };
