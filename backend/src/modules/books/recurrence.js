// §M-REC - RECURRENCE ENGINE. A Firefly-III-style Recurrence + RecurrenceRepetition
// model that generalises the legacy book_recurring (vouchertools/documents) into a
// proper schedule with: repetition TYPE (daily/weekly/monthly/yearly/ndom), a MOMENT
// (which weekday/day-of-month/etc.), SKIP-N (every Nth occurrence), a WEEKEND strategy
// (do-nothing/skip/prev-workday/next-workday), and an END (by-date / after-N).
//
// LOGIC ported (not copied) from firefly-iii's Recurrence/RecurrenceRepetition +
// RecurringMeta (its repetition_type / repetition_moment / repetition_skip / weekend),
// generalised over beancount-style explicit period stepping and erpnext's
// "auto-repeat" catch-up semantics.
//
// Materialisation reuses the EXISTING recurring/document posting path: a recurrence
// carries a `template_kind` + `template` exactly like book_recurring, and runDue()
// bottoms out in documents.salesCtx/purchaseCtx + posting-engine.postVoucher so the
// ledger invariant is never bypassed. Money stays as strings via ./money.
const { pool } = require("../../db");
const { postVoucher, PostError } = require("./posting-engine");
const { toDb } = require("./money");
const docs = require("./documents");
const { buildSalesVoucher, buildPurchaseVoucher } = require("./mappers");

// ── Constants ─────────────────────────────────────────────────────────────────
const REPETITION_TYPES = ["daily", "weekly", "monthly", "yearly", "ndom"];
const WEEKEND_MODES = ["do-nothing", "skip", "prev-workday", "next-workday"];
const TEMPLATE_KINDS = ["SALES_INVOICE", "BILL", "JOURNAL"];
const MAX_CATCHUP = 120; // hard cap so a long-dormant recurrence can't runaway-post

// ── Date helpers (UTC, ISO yyyy-mm-dd; never JS-local to avoid TZ drift) ────────
const iso = (d) => d.toISOString().slice(0, 10);
// Format a DATE value as it was READ BACK from pg. node-postgres parses a bare
// DATE into a JS Date at LOCAL midnight; calling toISOString() on that converts to
// UTC and rolls back a day in negative-offset zones (UTC midnight → previous local
// day). So format Dates from their LOCAL components, and slice strings directly.
const dateField = (v) => {
  if (v == null) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
};
const parse = (s) => {
  // accepts 'yyyy-mm-dd' or a Date; always anchored to UTC midnight.
  if (s instanceof Date) return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const addMonths = (d, n) => {
  // Month step that clamps to the last valid day (Jan 31 + 1mo → Feb 28/29).
  const x = new Date(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x;
};
const addYears = (d, n) => addMonths(d, 12 * n);
const dow = (d) => d.getUTCDay(); // 0=Sun … 6=Sat
const isWeekend = (d) => dow(d) === 0 || dow(d) === 6;

// nth (1..5) weekday-of-month, or nth=-1 → last weekday of the month.
function ndomDate(year, monthIdx0, weekday, nth) {
  if (nth === -1 || nth === 5) {
    // last `weekday` of the month
    const last = new Date(Date.UTC(year, monthIdx0 + 1, 0));
    let d = last;
    while (dow(d) !== weekday) d = addDays(d, -1);
    if (nth === -1) return d;
  }
  const first = new Date(Date.UTC(year, monthIdx0, 1));
  let offset = (weekday - dow(first) + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const dim = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
  if (day > dim) return null; // e.g. "5th Friday" in a month that has only four
  return new Date(Date.UTC(year, monthIdx0, day));
}

// Apply the weekend strategy to a candidate date. Returns a (possibly shifted)
// date, or null when the strategy says to drop this occurrence ('skip').
function applyWeekend(d, mode) {
  if (mode === "do-nothing" || !mode) return d;
  if (!isWeekend(d)) return d;
  if (mode === "skip") return null;
  if (mode === "prev-workday") { let x = d; while (isWeekend(x)) x = addDays(x, -1); return x; }
  if (mode === "next-workday") { let x = d; while (isWeekend(x)) x = addDays(x, 1); return x; }
  return d;
}

// Validate + normalise a recurrence's repetition config; throws PostError on bad input.
function normalizeRepetition(rep = {}) {
  const type = String(rep.type || "monthly").toLowerCase();
  if (!REPETITION_TYPES.includes(type)) throw new PostError("BAD_INPUT", `repetition.type must be one of ${REPETITION_TYPES.join("/")}`, 422);
  const skip = Number.isFinite(+rep.skip) && +rep.skip >= 0 ? Math.floor(+rep.skip) : 0; // 0 = every period
  const weekend = WEEKEND_MODES.includes(rep.weekend) ? rep.weekend : "do-nothing";
  let moment = rep.moment;
  if (type === "weekly") {
    moment = Number.isFinite(+moment) ? ((Math.floor(+moment) % 7) + 7) % 7 : 1; // 0=Sun..6=Sat; default Mon
  } else if (type === "monthly") {
    moment = Number.isFinite(+moment) ? Math.min(Math.max(Math.floor(+moment), 1), 31) : null; // day-of-month, null = anchor's day
  } else if (type === "ndom") {
    // moment encoded as "nth,weekday" e.g. "3,5" = 3rd Friday; nth=-1 = last.
    const [nthRaw, wdRaw] = String(moment == null ? "1,1" : moment).split(",").map((s) => s.trim());
    const nth = nthRaw === "-1" ? -1 : Math.min(Math.max(parseInt(nthRaw, 10) || 1, 1), 5);
    const wd = ((parseInt(wdRaw, 10) || 0) % 7 + 7) % 7;
    moment = { nth, weekday: wd };
  } else {
    moment = null; // daily/yearly ignore moment (yearly repeats on the anchor's month+day)
  }
  return { type, skip, weekend, moment };
}

// ── Occurrence generation ───────────────────────────────────────────────────────
// One raw step forward from `cur` per repetition type (skip is layered on top).
function stepBase(type, cur, anchor) {
  switch (type) {
    case "daily": return addDays(cur, 1);
    case "weekly": return addDays(cur, 7);
    case "monthly": return addMonths(cur, 1);
    case "ndom": return addMonths(cur, 1);
    case "yearly": return addYears(cur, 1);
    default: return addMonths(cur, 1);
  }
}

// Snap a date to the repetition's "moment" within its period (the canonical date
// firefly produces), independent of where the raw step landed.
function snapMoment(type, d, moment, anchor) {
  if (type === "weekly") {
    // land on the configured weekday in d's week
    const delta = (moment - dow(d) + 7) % 7;
    return addDays(d, delta);
  }
  if (type === "monthly") {
    const day = moment == null ? anchor.getUTCDate() : moment;
    const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(day, dim)));
  }
  if (type === "ndom") {
    return ndomDate(d.getUTCFullYear(), d.getUTCMonth(), moment.weekday, moment.nth);
  }
  if (type === "yearly") {
    const dim = new Date(Date.UTC(d.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(d.getUTCFullYear(), anchor.getUTCMonth(), Math.min(anchor.getUTCDate(), dim)));
  }
  return d; // daily
}

// nextOccurrences(rec, from, count): the next `count` occurrence dates (ISO strings)
// on or after `from`, honouring skip-N, weekend strategy, and the end condition.
// `rec` shape: { start, repetition:{type,moment,skip,weekend}, end:{ kind:'date'|'count'|'none', date, count } }
function nextOccurrences(rec, from, count = 12) {
  const repn = normalizeRepetition(rec.repetition || {});
  const anchor = parse(rec.start || from || new Date());
  const fromD = parse(from || rec.start || new Date());
  const end = rec.end || { kind: "none" };
  const endDate = end.kind === "date" && end.date ? parse(end.date) : null;
  const endCount = end.kind === "count" ? Math.max(0, Math.floor(+end.count || 0)) : null;

  const out = [];
  // We iterate the raw period grid from the anchor; `index` counts emitted periods
  // (for skip-N and after-N). Walk forward until we've collected `count` results
  // that are >= from, or we hit an end condition / a safety cap.
  let cur = anchor;
  let index = 0;       // 0-based period index from anchor
  let emittedTotal = 0; // periods that pass the skip filter (for after-N counting)
  const HARD = 5000;   // absolute iteration ceiling
  for (let i = 0; i < HARD && out.length < count; i++) {
    let occ = snapMoment(repn.type, cur, repn.moment, anchor);
    // ndom can yield null ("5th Friday" missing) → that period simply has no occurrence
    const keepPeriod = repn.skip === 0 ? true : index % (repn.skip + 1) === 0;
    if (occ && keepPeriod) {
      const shifted = applyWeekend(occ, repn.weekend);
      if (shifted) {
        if (endCount != null && emittedTotal >= endCount) break;
        if (endDate && shifted > endDate) break;
        if (shifted >= fromD) out.push(iso(shifted));
        emittedTotal += 1;
      } else {
        // weekend 'skip' still consumes an emission slot for after-N counting? In
        // firefly a skipped weekend does NOT produce a transaction, so it does not
        // count toward after-N. We leave emittedTotal unchanged.
      }
    }
    // advance the grid
    const nextCur = stepBase(repn.type, cur, anchor);
    if (endDate && snapMoment(repn.type, nextCur, repn.moment, anchor) > endDate && out.length === 0 && cur > endDate) break;
    cur = nextCur;
    index += 1;
  }
  return out;
}

// ── Persistence (CRUD) ──────────────────────────────────────────────────────────
function rowToRec(r) {
  return {
    id: r.id,
    name: r.name,
    template_kind: r.template_kind,
    template: r.template,
    start: dateField(r.start_date),
    repetition: {
      type: r.rep_type, moment: r.rep_moment, skip: r.rep_skip, weekend: r.rep_weekend,
    },
    end: { kind: r.end_kind, date: dateField(r.end_date), count: r.end_count },
    next_run: dateField(r.next_run),
    last_run: dateField(r.last_run),
    occurrences_done: Number(r.occurrences_done || 0),
    active: r.active,
    created_at: r.created_at,
  };
}

function validateInput(b) {
  if (!b.name) throw new PostError("BAD_INPUT", "name required", 400);
  if (!b.template_kind || !TEMPLATE_KINDS.includes(b.template_kind)) throw new PostError("BAD_INPUT", `template_kind must be one of ${TEMPLATE_KINDS.join("/")}`, 422);
  if (!b.start) throw new PostError("BAD_INPUT", "start (yyyy-mm-dd) required", 400);
  const rep = normalizeRepetition(b.repetition || {});
  const end = b.end || { kind: "none" };
  if (end.kind && !["none", "date", "count"].includes(end.kind)) throw new PostError("BAD_INPUT", "end.kind must be none/date/count", 422);
  if (end.kind === "date" && !end.date) throw new PostError("BAD_INPUT", "end.date required when end.kind=date", 422);
  if (end.kind === "count" && !(Math.floor(+end.count) > 0)) throw new PostError("BAD_INPUT", "end.count must be a positive integer", 422);
  return { rep, end };
}

// The first occurrence on/after start becomes next_run (so an as-of run knows when to fire).
function computeNextRun(start, repn, end) {
  const occ = nextOccurrences({ start, repetition: repn, end }, start, 1);
  return occ[0] || null;
}

async function createRecurrence(tenantId, actorId, b = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const { rep, end } = validateInput(b);
  const momentStr = rep.type === "ndom" ? `${rep.moment.nth},${rep.moment.weekday}` : (rep.moment == null ? null : String(rep.moment));
  // Pass the RAW user repetition to computeNextRun: nextOccurrences()
  // re-normalizes internally, and feeding it the already-normalized `rep` (whose
  // ndom moment is now an object) would double-normalize "3rd Friday" into "1st Sunday".
  const nextRun = computeNextRun(b.start, b.repetition || {}, end);
  const { rows } = await pool.query(
    `INSERT INTO book_recurrences
       (tenant_id, name, template_kind, template, start_date, rep_type, rep_moment, rep_skip, rep_weekend,
        end_kind, end_date, end_count, next_run, active, created_by)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [tenantId, b.name, b.template_kind, JSON.stringify(b.template || {}), b.start,
     rep.type, momentStr, rep.skip, rep.weekend,
     end.kind || "none", end.kind === "date" ? end.date : null, end.kind === "count" ? Math.floor(+end.count) : null,
     nextRun, b.active === false ? false : true, actorId || null]
  );
  return rowToRec(rows[0]);
}

async function listRecurrences(tenantId) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const { rows } = await pool.query("SELECT * FROM book_recurrences WHERE tenant_id=$1 ORDER BY next_run ASC NULLS LAST, name ASC", [tenantId]);
  return rows.map(rowToRec);
}

async function getRecurrence(tenantId, id) {
  if (!tenantId || !id) throw new PostError("BAD_INPUT", "tenantId and id required", 400);
  const { rows } = await pool.query("SELECT * FROM book_recurrences WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rows[0]) throw new PostError("NOT_FOUND", "Recurrence not found", 404);
  return rowToRec(rows[0]);
}

async function updateRecurrence(tenantId, id, b = {}) {
  const existing = await getRecurrence(tenantId, id); // 404s if missing
  // Merge then re-validate the whole thing so partial updates stay consistent.
  const merged = {
    name: b.name != null ? b.name : existing.name,
    template_kind: b.template_kind != null ? b.template_kind : existing.template_kind,
    template: b.template != null ? b.template : existing.template,
    start: b.start != null ? b.start : existing.start,
    repetition: b.repetition != null ? b.repetition : existing.repetition,
    end: b.end != null ? b.end : existing.end,
    active: b.active != null ? b.active : existing.active,
  };
  const { rep, end } = validateInput(merged);
  const momentStr = rep.type === "ndom" ? `${rep.moment.nth},${rep.moment.weekday}` : (rep.moment == null ? null : String(rep.moment));
  // Recompute next_run from last_run (or start) so schedule edits take effect but
  // already-materialised periods aren't re-fired.
  const fromForNext = existing.last_run ? iso(addDays(parse(existing.last_run), 1)) : merged.start;
  // RAW repetition (see createRecurrence): avoid double-normalizing ndom moment.
  const nextRun = computeNextRun(fromForNext, merged.repetition || {}, end) || computeNextRun(merged.start, merged.repetition || {}, end);
  const { rows } = await pool.query(
    `UPDATE book_recurrences SET
       name=$3, template_kind=$4, template=$5::jsonb, start_date=$6,
       rep_type=$7, rep_moment=$8, rep_skip=$9, rep_weekend=$10,
       end_kind=$11, end_date=$12, end_count=$13, next_run=$14, active=$15
     WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [tenantId, id, merged.name, merged.template_kind, JSON.stringify(merged.template || {}), merged.start,
     rep.type, momentStr, rep.skip, rep.weekend,
     end.kind || "none", end.kind === "date" ? end.date : null, end.kind === "count" ? Math.floor(+end.count) : null,
     nextRun, merged.active === false ? false : true]
  );
  return rowToRec(rows[0]);
}

async function deleteRecurrence(tenantId, id) {
  if (!tenantId || !id) throw new PostError("BAD_INPUT", "tenantId and id required", 400);
  const { rowCount } = await pool.query("DELETE FROM book_recurrences WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rowCount) throw new PostError("NOT_FOUND", "Recurrence not found", 404);
  return { deleted: true, id };
}

// preview(tenantId, id, count): the next `count` upcoming dates without posting.
async function preview(tenantId, id, count = 12) {
  const rec = await getRecurrence(tenantId, id);
  const from = rec.next_run || rec.start;
  return { id: rec.id, name: rec.name, from, occurrences: nextOccurrences(rec, from, Math.min(Math.max(+count || 12, 1), 60)) };
}

// ── Materialisation ───────────────────────────────────────────────────────────
// Post one occurrence for a recurrence on `runDate`, reusing the document/recurring
// posting path. Returns the postVoucher result. Throws PostError on a bad template.
async function postOccurrence(tenantId, actorId, rec, runDate) {
  const tmpl = rec.template || {};
  if (rec.template_kind === "SALES_INVOICE") {
    const ctx = await docs.salesCtx(tenantId, tmpl.customerLedgerId);
    const m = buildSalesVoucher({ ...tmpl, date: runDate }, ctx);
    return postVoucher(tenantId, actorId, m.voucher, m.entries, { taxes: m.taxes });
  }
  if (rec.template_kind === "BILL") {
    const ctx = await docs.purchaseCtx(tenantId, tmpl.vendorLedgerId);
    const m = buildPurchaseVoucher({ ...tmpl, date: runDate }, ctx);
    return postVoucher(tenantId, actorId, m.voucher, m.entries, { taxes: m.taxes });
  }
  if (rec.template_kind === "JOURNAL") {
    return postVoucher(tenantId, actorId,
      { voucherType: "JOURNAL", voucherDate: runDate, narration: tmpl.narration || rec.name, source: "api" },
      (tmpl.entries || []).map((e) => ({ ledgerId: e.ledgerId, debit: toDb(e.debit || 0), credit: toDb(e.credit || 0), costCentreId: e.costCentreId || null, tags: e.tags || null }))
    );
  }
  throw new PostError("BAD_INPUT", `Unknown template_kind ${rec.template_kind}`, 422);
}

// runDue(tenantId, asOfDate): materialise every active recurrence whose next_run is
// on/before asOf. Catches up EVERY missed occurrence (one voucher per occurrence
// dated at that occurrence), advancing next_run from the schedule (not from today)
// so downtime never silently drops periods. Capped at MAX_CATCHUP per recurrence.
// Honours the end condition (by-date / after-N) and stops a recurrence cleanly when
// it is exhausted (active=false). Stops catching up a recurrence on its first error
// so a retry can't double-post the surviving occurrences.
async function runDue(tenantId, asOfDate, actorId = null) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const today = asOfDate || iso(new Date());
  const { rows } = await pool.query(
    "SELECT * FROM book_recurrences WHERE tenant_id=$1 AND active=true AND next_run IS NOT NULL AND next_run<=$2",
    [tenantId, today]
  );
  const generated = [];
  for (const row of rows) {
    const rec = rowToRec(row);
    let done = rec.occurrences_done;
    const endCount = rec.end.kind === "count" ? Math.floor(+rec.end.count || 0) : null;
    // Generate the full schedule of occurrences from next_run forward, then take
    // those that fall on/before today (respecting the remaining after-N budget).
    const horizon = endCount != null ? Math.max(endCount - done, 0) : MAX_CATCHUP;
    const upcoming = nextOccurrences(rec, rec.next_run, Math.min(horizon || MAX_CATCHUP, MAX_CATCHUP) + 1);
    let lastRun = rec.last_run;
    let firstFuture = null; // first occurrence after today → becomes next_run
    let iterations = 0;
    let errored = false;
    for (const occDate of upcoming) {
      if (occDate > today) { firstFuture = occDate; break; }
      if (endCount != null && done >= endCount) break;
      if (iterations >= MAX_CATCHUP) break;
      iterations++;
      try {
        const res = await postOccurrence(tenantId, actorId, rec, occDate);
        done += 1;
        lastRun = occDate;
        generated.push({ recurrence: rec.id, name: rec.name, period: occDate, voucher: res });
      } catch (e) {
        generated.push({ recurrence: rec.id, name: rec.name, period: occDate, error: e.message });
        errored = true;
        break; // stop catching up this recurrence to avoid duplicating on retry
      }
    }
    if (errored) {
      // leave next_run pointing at the failed occurrence so the next run retries it
      await pool.query("UPDATE book_recurrences SET last_run=$2, occurrences_done=$3 WHERE id=$1", [rec.id, lastRun, done]);
      continue;
    }
    // Determine the new next_run: the first not-yet-materialised occurrence after today.
    let nextRun = firstFuture;
    if (nextRun == null) {
      // none of `upcoming` was beyond today → look further ahead from the last fired
      const after = lastRun ? iso(addDays(parse(lastRun), 1)) : rec.start;
      const more = nextOccurrences(rec, after, 1);
      nextRun = more[0] || null;
    }
    // Exhausted by after-N or by-date → deactivate.
    const exhausted = (endCount != null && done >= endCount) || nextRun == null;
    await pool.query(
      "UPDATE book_recurrences SET last_run=$2, next_run=$3, occurrences_done=$4, active=$5 WHERE id=$1",
      [rec.id, lastRun, exhausted ? null : nextRun, done, exhausted ? false : true]
    );
  }
  return { asOf: today, generated };
}

// Run due recurrences for every tenant that has an active recurrence (daily cron).
async function runAllDue(asOfDate) {
  const { rows } = await pool.query("SELECT DISTINCT tenant_id FROM book_recurrences WHERE active=true");
  const out = [];
  for (const r of rows) {
    try { const res = await runDue(r.tenant_id, asOfDate, null); out.push({ tenant: r.tenant_id, generated: res.generated.length }); }
    catch (e) { out.push({ tenant: r.tenant_id, error: e.message }); }
  }
  return { tenants: rows.length, results: out };
}

module.exports = {
  // pure helpers (selftest-friendly, no DB)
  nextOccurrences, normalizeRepetition, ndomDate, applyWeekend,
  REPETITION_TYPES, WEEKEND_MODES, TEMPLATE_KINDS,
  // CRUD + run
  createRecurrence, listRecurrences, getRecurrence, updateRecurrence, deleteRecurrence,
  preview, runDue, runAllDue,
};
