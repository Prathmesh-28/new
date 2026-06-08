/**
 * Forecast engine — Node.js implementation.
 *
 * Steps:
 * 1. Detect recurring transactions using sliding-window algorithm.
 * 2. Project recurring items 90 days forward.
 * 3. Compute variable spend per category (rolling 90-day average).
 * 4. Merge to produce daily P10/P50/P90 balance series.
 */

/**
 * @param {object[]} txns  Raw transactions sorted by date ascending
 * @param {number}   startBalance
 * @param {number}   horizonDays
 * @returns {{ date: string, p10: number, p50: number, p90: number, inflow: number, outflow: number }[]}
 */
function buildForecast(txns, startBalance, horizonDays = 90) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── 1. Detect recurring transactions ────────────────────────────────────────
  const recurring = detectRecurring(txns);

  // ── 2. Project recurring items forward ──────────────────────────────────────
  const projectedRecurring = projectRecurring(recurring, today, horizonDays);

  // ── 3. Variable spend baseline (rolling 90-day avg per category per day) ───
  const { avgDailyInflow, avgDailyOutflow, varianceInflow, varianceOutflow } = computeVariableBaseline(txns);

  // ── 4. Build daily series ───────────────────────────────────────────────────
  const datapoints = [];
  let balP50 = startBalance;
  let balP10 = startBalance;
  let balP90 = startBalance;

  for (let d = 1; d <= horizonDays; d++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() + d);
    const dateStr = dt.toISOString().slice(0, 10);

    // Recurring items on this date
    const dayRecurring = projectedRecurring.filter(r => r.date === dateStr);
    const recurringInflow  = dayRecurring.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const recurringOutflow = dayRecurring.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);

    // Variable (daily average)
    const varInflow  = avgDailyInflow;
    const varOutflow = avgDailyOutflow;

    const totalInflow  = recurringInflow  + varInflow;
    const totalOutflow = recurringOutflow + varOutflow;

    const netP50 = totalInflow - totalOutflow;
    const netP10 = (totalInflow * (1 - varianceInflow))  - (totalOutflow * (1 + varianceOutflow));
    const netP90 = (totalInflow * (1 + varianceInflow))  - (totalOutflow * (1 - varianceOutflow));

    balP50 += netP50;
    balP10 += netP10;
    balP90 += netP90;

    datapoints.push({
      date:   dateStr,
      p50:    Math.round(balP50),
      p10:    Math.round(Math.min(balP10, balP50)),
      p90:    Math.round(Math.max(balP90, balP50)),
      inflow:  Math.round(totalInflow),
      outflow: Math.round(totalOutflow),
    });
  }

  return datapoints;
}

/**
 * Detect recurring transactions:
 * Group by (merchant_name, amount_bucket, category).
 * Mark as recurring if 3+ occurrences with consistent interval.
 */
function detectRecurring(txns) {
  const groups = {};
  for (const t of txns) {
    const bucket = Math.round(Math.abs(t.amount) / 100) * 100;
    const key = `${(t.merchant_name || "").toLowerCase()}|${bucket}|${t.category}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  const recurring = [];
  for (const [, group] of Object.entries(groups)) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      const diffDays = (new Date(sorted[i].transaction_date) - new Date(sorted[i-1].transaction_date)) / 86400000;
      intervals.push(diffDays);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + Math.pow(v - avgInterval, 2), 0) / intervals.length;
    const cv = Math.sqrt(variance) / avgInterval; // coefficient of variation

    if (cv < 0.25) {
      const last = sorted[sorted.length - 1];
      const cadence = avgInterval <= 8 ? "weekly" : avgInterval <= 16 ? "biweekly" : avgInterval <= 35 ? "monthly" : avgInterval <= 100 ? "quarterly" : "annual";
      recurring.push({
        amount:         last.amount,
        merchant_name:  last.merchant_name,
        category:       last.category,
        cadence,
        intervalDays:   Math.round(avgInterval),
        lastDate:       last.transaction_date,
      });
    }
  }
  return recurring;
}

/**
 * Project recurring items into future dates within the horizon.
 */
function projectRecurring(recurring, today, horizonDays) {
  const projected = [];
  for (const r of recurring) {
    const last = new Date(r.lastDate);
    let next = new Date(last);
    next.setDate(next.getDate() + r.intervalDays);

    const end = new Date(today);
    end.setDate(today.getDate() + horizonDays);

    while (next <= end) {
      if (next > today) {
        projected.push({ date: next.toISOString().slice(0, 10), amount: r.amount, merchant_name: r.merchant_name });
      }
      next = new Date(next);
      next.setDate(next.getDate() + r.intervalDays);
    }
  }
  return projected;
}

/**
 * Compute rolling daily average inflow/outflow from historical transactions.
 */
function computeVariableBaseline(txns) {
  if (!txns.length) {
    return { avgDailyInflow: 0, avgDailyOutflow: 0, varianceInflow: 0.15, varianceOutflow: 0.15 };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const recent = txns.filter(t => new Date(t.transaction_date) >= cutoff);
  const days = 90;

  const totalInflow  = recent.filter(t => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
  const totalOutflow = recent.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const avgDailyInflow  = totalInflow  / days;
  const avgDailyOutflow = totalOutflow / days;

  // Variance approximation — measure day-level std dev
  const dailyInflows = {};
  const dailyOutflows = {};
  for (const t of recent) {
    const d = t.transaction_date.toString().slice(0, 10);
    if (t.amount > 0) dailyInflows[d]  = (dailyInflows[d]  || 0) + Number(t.amount);
    else              dailyOutflows[d] = (dailyOutflows[d] || 0) + Math.abs(Number(t.amount));
  }

  const inflowVals  = Object.values(dailyInflows);
  const outflowVals = Object.values(dailyOutflows);

  const varianceInflow  = avgDailyInflow  > 0 ? stdDev(inflowVals)  / avgDailyInflow  / days : 0.15;
  const varianceOutflow = avgDailyOutflow > 0 ? stdDev(outflowVals) / avgDailyOutflow / days : 0.15;

  return {
    avgDailyInflow,
    avgDailyOutflow,
    varianceInflow:  Math.min(varianceInflow,  0.35),
    varianceOutflow: Math.min(varianceOutflow, 0.35),
  };
}

function stdDev(arr) {
  if (!arr.length) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length);
}

module.exports = { buildForecast };
