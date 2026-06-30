import type { FixedAsset } from "@/data/types";

// ─────────────────────────────────────────────────────────────────────────────
// Depreciation engine - supports Straight-Line (SLM) and Written-Down-Value (WDV,
// the reducing-balance method India's Companies Act Schedule II uses).
//
// Everything is expressed through a single primitive: bookValue(asset, date).
// Depreciation recognised in any window [start,end] is then just
//   bookValue(start) − bookValue(end)
// which is exact for BOTH methods and telescopes correctly across consecutive
// periods (no double counting, correct partial first period).
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function monthsBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO).getTime();
  const to = new Date(toISO).getTime();
  if (!isFinite(from) || !isFinite(to) || to <= from) return 0;
  return (to - from) / MS_PER_DAY / (365.25 / 12);
}

function salvageOf(a: FixedAsset): number {
  // Schedule II assumes a 5% residual when none is given (used for the WDV rate).
  return a.salvageValue && a.salvageValue > 0 ? a.salvageValue : 0;
}

/** Annual WDV depreciation rate (fraction 0-1) derived from useful life + residual. */
export function wdvAnnualRate(a: FixedAsset): number {
  if (a.wdvRate && a.wdvRate > 0) return Math.min(0.99, a.wdvRate / 100);
  const life = Math.max(1, a.usefulLifeYears || 1);
  const residual = (a.salvageValue && a.salvageValue > 0 ? a.salvageValue : a.cost * 0.05) / a.cost;
  // r = 1 − (residual)^(1/life)  → the Schedule II reducing-balance rate
  return Math.min(0.99, Math.max(0.01, 1 - Math.pow(Math.max(residual, 1e-4), 1 / life)));
}

/** Net book value of an asset at a given date (never below salvage; frozen at disposal). */
export function bookValue(a: FixedAsset, asOfISO: string): number {
  if (!a || !a.cost || !a.purchaseDate) return 0;
  // Freeze depreciation at disposal date.
  const effective = a.disposalDate && a.disposalDate < asOfISO ? a.disposalDate : asOfISO;
  const months = monthsBetween(a.purchaseDate, effective);
  if (months <= 0) return a.cost; // not yet in service / acquired exactly now

  if (a.method === "wdv") {
    const annual = wdvAnnualRate(a);
    const bv = a.cost * Math.pow(1 - annual, months / 12);
    const floor = salvageOf(a) || a.cost * 0.05;
    return Math.max(bv, floor);
  }
  // Straight-line
  const salvage = salvageOf(a);
  const monthlyDep = (a.cost - salvage) / (Math.max(1, a.usefulLifeYears) * 12);
  const bv = a.cost - monthlyDep * months;
  return Math.max(bv, salvage);
}

export function accumulatedDepreciation(a: FixedAsset, asOfISO: string): number {
  return Math.max(0, a.cost - bookValue(a, asOfISO));
}

/** Depreciation expense recognised for one asset within [start,end]. */
export function depreciationBetween(a: FixedAsset, startISO: string, endISO: string): number {
  return Math.max(0, bookValue(a, startISO) - bookValue(a, endISO));
}

// ── Portfolio aggregates ──────────────────────────────────────────────────────
const isActive = (a: FixedAsset, asOfISO: string) => !a.disposalDate || a.disposalDate >= asOfISO;

export function totalDepreciation(assets: FixedAsset[], startISO: string, endISO: string): number {
  return (assets || []).reduce((s, a) => s + depreciationBetween(a, startISO, endISO), 0);
}

export function totalNetBookValue(assets: FixedAsset[], asOfISO: string): number {
  return (assets || []).filter(a => isActive(a, asOfISO)).reduce((s, a) => s + bookValue(a, asOfISO), 0);
}

export function totalGrossCost(assets: FixedAsset[], asOfISO: string): number {
  return (assets || []).filter(a => isActive(a, asOfISO)).reduce((s, a) => s + (a.cost || 0), 0);
}

export function totalAccumulatedDepreciation(assets: FixedAsset[], asOfISO: string): number {
  return (assets || []).filter(a => isActive(a, asOfISO)).reduce((s, a) => s + accumulatedDepreciation(a, asOfISO), 0);
}
