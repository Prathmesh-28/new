"use strict";
// Pure cadence math for recurring invoices — NO DB. Separate file so the fiddly month-end
// clamping (31st → Feb 28, quarterly over year-end, leap years) is unit-testable.
const pad = (n) => String(n).padStart(2, "0");
const toISO = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`; // m 1-12
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 1-12

function parseISO(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error(`bad date: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

// One cadence step from `fromISO`. Monthly/quarterly anchor on `dayOfMonth` (falls back to the
// from-date's day), clamped to the target month's length so "bill on the 31st" degrades to the
// 28th/29th/30th instead of skipping months. Weekly ignores dayOfMonth.
function nextRunAfter(fromISO, cadence, dayOfMonth) {
  const { y, m, d } = parseISO(fromISO);
  if (cadence === "weekly") {
    const t = new Date(Date.UTC(y, m - 1, d + 7));
    return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const step = cadence === "quarterly" ? 3 : 1; // default monthly
  const anchor = Math.min(Math.max(Number(dayOfMonth) || d, 1), 31);
  const total = (y * 12 + (m - 1)) + step;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(anchor, daysInMonth(ny, nm)));
}

// Advance next_run PAST `todayISO`, one cadence step at a time. If the server slept through
// several periods, the missed ones are SKIPPED (one invoice per run, never a surprise
// back-catalogue); returns how many were skipped so the caller can log it honestly.
function advancePastToday(nextRunISO, todayISO, cadence, dayOfMonth) {
  let next = nextRunAfter(nextRunISO, cadence, dayOfMonth);
  let skipped = 0;
  while (next <= todayISO) { next = nextRunAfter(next, cadence, dayOfMonth); skipped++; }
  return { next, skipped };
}

module.exports = { nextRunAfter, advancePastToday };
