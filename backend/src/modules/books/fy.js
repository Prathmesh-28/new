// §6.3 - Indian financial year runs 1 Apr → 31 Mar. A date in Jan-Mar belongs to
// the FY that started the previous calendar year. We read the date in UTC so a
// date-only string ("2026-06-15") never shifts a day due to local timezone.
function asDate(d) {
  return d instanceof Date ? d : new Date(d);
}

function financialYearFor(d) {
  const dt = asDate(d);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth(); // 0 = Jan
  const start = m >= 3 ? y : y - 1; // Apr (m=3) onwards belongs to this year
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`; // "2026-27"
}

// Period month with April as 1 … March as 12.
function periodMonthFor(d) {
  return ((asDate(d).getUTCMonth() - 3 + 12) % 12) + 1;
}

module.exports = { financialYearFor, periodMonthFor };
