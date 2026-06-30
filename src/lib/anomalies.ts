import type { Transaction } from "@/data/types";

// ── Anomaly radar ─────────────────────────────────────────────────────────────
// Deterministic, offline detection over the tenant's real transaction stream.
// No ML black box and no fabricated data - every finding points at specific
// transactions the user can open and verify.

export type AnomalyType = "duplicate" | "spike" | "subscription_creep" | "new_vendor";

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  amount: number; // rupees involved (positive)
  date: string; // most relevant ISO date
  counterparty: string;
  txnIds: string[];
}

const name = (t: Transaction) => (t.counterparty || t.description || "Unknown").trim();
const daysBetween = (a: string, b: string) => Math.abs((+new Date(a) - +new Date(b)) / 86400000);

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function percentile(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

/**
 * Scan transactions for spend anomalies.
 * - duplicate: same payee + same amount within `dupWindowDays` (likely double pay)
 * - spike: an outflow far above that payee's own history (mean + 2.5σ)
 * - subscription_creep: a recurring payee whose latest charge jumped vs its norm
 * - new_vendor: a brand-new payee in the recent window paid a materially large sum
 */
export function detectAnomalies(
  transactions: Transaction[],
  opts: { now?: Date; recentDays?: number; dupWindowDays?: number; minMaterial?: number } = {}
): Anomaly[] {
  const now = opts.now ?? new Date();
  const recentDays = opts.recentDays ?? 90;
  const dupWindowDays = opts.dupWindowDays ?? 7;
  // Material floor scales to the business: 1% of the median expense, min ₹2,000.
  const expenses = transactions.filter(t => t.amount < 0);
  const absAll = expenses.map(t => Math.abs(t.amount));
  const minMaterial = opts.minMaterial ?? Math.max(2000, Math.round(median(absAll) * 0.5));

  const out: Anomaly[] = [];
  const cutoff = +now - recentDays * 86400000;
  const inRecent = (d: string) => +new Date(d) >= cutoff;

  // Group expenses by payee
  const byPayee = new Map<string, Transaction[]>();
  for (const t of expenses) {
    const k = name(t).toLowerCase();
    (byPayee.get(k) ?? byPayee.set(k, []).get(k)!).push(t);
  }

  for (const [, txns] of byPayee) {
    const sorted = [...txns].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    const amts = sorted.map(t => Math.abs(t.amount));
    const payee = name(sorted[0]);

    // ── Duplicates: same amount within the window ──
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i], b = sorted[j];
        if (Math.round(Math.abs(a.amount)) !== Math.round(Math.abs(b.amount))) continue;
        if (daysBetween(a.date, b.date) > dupWindowDays) continue;
        if (Math.abs(a.amount) < minMaterial) continue;
        if (!inRecent(b.date)) continue;
        out.push({
          id: `dup-${a.id}-${b.id}`,
          type: "duplicate",
          severity: "high",
          title: `Possible duplicate payment to ${payee}`,
          detail: `Two payments of ${fmt(Math.abs(a.amount))} ${Math.round(daysBetween(a.date, b.date))} day(s) apart - check for a double-pay.`,
          amount: Math.abs(a.amount),
          date: b.date,
          counterparty: payee,
          txnIds: [a.id, b.id],
        });
      }
    }

    // ── Spike: a recent outflow far above this payee's own history. Use the
    //    median (robust - the outlier itself doesn't inflate the baseline the
    //    way mean+σ would). ──
    if (sorted.length >= 4) {
      const med = median(amts);
      for (const t of sorted) {
        const v = Math.abs(t.amount);
        if (med > 0 && v > 3 * med && v >= minMaterial && inRecent(t.date)) {
          out.push({
            id: `spike-${t.id}`,
            type: "spike",
            severity: "medium",
            title: `Unusually large payment to ${payee}`,
            detail: `${fmt(v)} vs a typical ${fmt(med)} for this payee (${(v / med).toFixed(1)}× normal).`,
            amount: v,
            date: t.date,
            counterparty: payee,
            txnIds: [t.id],
          });
        }
      }
    }

    // ── Subscription creep: roughly-monthly payee whose latest charge jumped ──
    if (sorted.length >= 3) {
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i].date, sorted[i - 1].date));
      const monthlyish = median(gaps) >= 20 && median(gaps) <= 40;
      const recurringFlag = sorted.some(t => t.isRecurring);
      if (monthlyish || recurringFlag) {
        const last = amts[amts.length - 1];
        const priorMed = median(amts.slice(0, -1));
        // A 15%+ jump that's a non-trivial fraction of the recurring charge - not
        // gated by the larger minMaterial floor (a creep on a small subscription
        // still matters).
        if (priorMed > 0 && last > priorMed * 1.15 && last - priorMed >= Math.max(500, priorMed * 0.1) && inRecent(sorted[sorted.length - 1].date)) {
          out.push({
            id: `creep-${sorted[sorted.length - 1].id}`,
            type: "subscription_creep",
            severity: "low",
            title: `Recurring charge to ${payee} increased`,
            detail: `Latest ${fmt(last)} is ${Math.round(((last - priorMed) / priorMed) * 100)}% above its usual ${fmt(priorMed)}.`,
            amount: last - priorMed,
            date: sorted[sorted.length - 1].date,
            counterparty: payee,
            txnIds: [sorted[sorted.length - 1].id],
          });
        }
      }
    }
  }

  // ── New large vendor: a payee whose first-ever payment lands in the recent
  //    window and is large vs the overall spend distribution. Only meaningful
  //    once there's enough history that "new" actually means something. ──
  const p90 = percentile(absAll, 90);
  const enoughHistory = expenses.length >= 12 && byPayee.size >= 6;
  for (const [, txns] of (enoughHistory ? byPayee : new Map())) {
    const sorted = [...txns].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    const first = sorted[0];
    const v = Math.abs(first.amount);
    if (inRecent(first.date) && v >= Math.max(p90, minMaterial) && v >= minMaterial) {
      out.push({
        id: `newvendor-${first.id}`,
        type: "new_vendor",
        severity: "low",
        title: `New payee: ${name(first)}`,
        detail: `First payment of ${fmt(v)} - a large outflow to a payee not seen before.`,
        amount: v,
        date: first.date,
        counterparty: name(first),
        txnIds: [first.id],
      });
    }
  }

  // De-dupe (a txn can trip both spike and new_vendor); keep the higher severity.
  const rank = { high: 0, medium: 1, low: 2 };
  return out
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.amount - a.amount)
    .filter((a, _i, arr) => {
      // drop a lower-severity finding whose single txn is already covered by a higher one
      if (a.txnIds.length !== 1) return true;
      const higher = arr.find(x => x !== a && rank[x.severity] < rank[a.severity] && x.txnIds.includes(a.txnIds[0]));
      return !higher;
    });
}

function fmt(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${Math.round(n)}`;
}
