"use strict";
// Product analytics data layer. track() is CONSENT-GATED (DPDP): it silently skips
// when the user has opted out of the 'analytics' purpose in the consents ledger.
// overview() powers the admin dashboard (funnel / active users / top events /
// segments), tenant-scoped for an owner or platform-wide for super_admin.
const { pool } = require("../../db");

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

module.exports = { AnalyticsError, track, saveProfile, getProfile, overview, retention, hasAnalyticsConsent };
