// Shared alert-mute filtering. An audit found "Mute" rules (AlertsPage's Snooze/Mute
// tab) were computed and displayed ("Muted X for 24h") but never actually consulted
// by any notification surface - the Active tab, unread badges (nav bell, dashboard
// stat card, quick-actions widget), and escalation triggers all kept showing/acting
// on "muted" alerts unchanged. A mute suppresses these surfaces for the category
// (by alert `type`) until it expires; it does not delete the alert or hide it from
// History/compliance views that intentionally show everything.
export interface MuteRule { id: string; type: string; until: string; createdAt: string }

export function activeMuteTypes(rules: MuteRule[] | undefined, now = Date.now()): Set<string> {
  const set = new Set<string>();
  for (const r of rules ?? []) {
    if (r?.type && new Date(r.until).getTime() > now) set.add(r.type);
  }
  return set;
}

// Critical alerts are NEVER suppressed by a mute - the mute tab's own copy promises
// this ("Critical liquidity alerts will still surface"), so make it actually true.
export function unmuted<T extends { type?: string; severity?: string }>(alerts: T[], rules: MuteRule[] | undefined, now = Date.now()): T[] {
  const muted = activeMuteTypes(rules, now);
  if (muted.size === 0) return alerts;
  return alerts.filter((a) => a.severity === "critical" || !a.type || !muted.has(a.type));
}
