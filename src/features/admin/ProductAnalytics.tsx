import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Loader2, Activity, Filter, BarChart3, Send, MoonStar, RotateCcw, FlaskConical } from "lucide-react";

interface Seg { key: string; count: number }
interface Overview {
  scope: string; window_days: number;
  active: { dau: number; wau: number; mau: number; events: number };
  funnel: { key: string; label: string; count: number }[];
  top_events: { event: string; count: number; tenants: number }[];
  by_role: { role: string; count: number; users: number }[];
  top_paths: { path: string; count: number }[];
  sessions: { count: number; avg_minutes: number; avg_events: number };
  segments: Record<string, Seg[]>;
}
interface Retention { weeks: number; role: string | null; cohorts: { cohort: string; size: number; retention: number[] }[] }
interface Dormant { tenant_id: string; last_seen: string; days_idle: number; reason?: string; label?: string; amount?: number }
interface WinResult { scanned: number; channels: Record<string, number>; reasons: Record<string, number> }
interface ReactBucket { key: string | null; nudges: number; reactivated: number; rate: number | null; reliable: boolean; dry_run?: boolean }
interface Reactivation { scope: string; window_days: number; min_n: number; overall: ReactBucket; by_reason: ReactBucket[]; by_channel: ReactBucket[]; pending: number; disclaimer: string }
interface LiftArm { tenants: number; reactivated: number; rate: number | null; ci95: [number, number] | null }
interface Lift { scope: string; window_days: number; holdout_pct: number; status: "ok" | "building"; min_per_arm: number; treatment: LiftArm; control: LiftArm; lift_pp: number | null; lift_ci95: [number, number] | null; significant: boolean | null; p_value: number | null; mde_pp: number | null; caveat: string }
const ROLES = ["owner", "finance_manager", "accountant", "sales", "operations_manager", "investor"];
const REASON_LABELS: Record<string, string> = {
  overdue_invoices: "overdue invoices", unpaid_invoices: "unpaid invoices",
  active_then_dropped: "went quiet", never_onboarded: "never set up", dormant_generic: "general",
};

export default function ProductAnalytics() {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [ret, setRet] = useState<Retention | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [dormant, setDormant] = useState<Dormant[] | null>(null);
  const [winRunning, setWinRunning] = useState(false);
  const [winMsg, setWinMsg] = useState("");
  const [react, setReact] = useState<Reactivation | null>(null);
  const [lift, setLift] = useState<Lift | null>(null);
  const [winDays, setWinDays] = useState(14);

  const loadDormant = () => api.get<{ dormant: Dormant[] }>("/api/analytics/dormant").then((r) => setDormant(r.dormant)).catch(() => setDormant(null));
  const runWinback = () => {
    setWinRunning(true); setWinMsg("");
    api.post<WinResult>("/api/analytics/winback/run", {})
      .then((r) => { const by = Object.entries(r.reasons || {}).map(([k, v]) => `${v} ${REASON_LABELS[k] || k}`).join(", "); setWinMsg(r.scanned ? `Nudged ${r.scanned} business${r.scanned > 1 ? "es" : ""}${by ? ` — ${by}` : ""}.` : "No dormant businesses to nudge right now."); loadDormant(); })
      .catch((e) => setWinMsg((e as { message?: string })?.message || "Could not run win-back."))
      .finally(() => setWinRunning(false));
  };

  useEffect(() => {
    setLoading(true); setErr("");
    api.get<Overview>(`/api/analytics/overview?days=${days}`)
      .then(setD).catch((e) => setErr((e as { message?: string })?.message || "Analytics is available to owners/admins."))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    api.get<Retention>(`/api/analytics/retention?weeks=8${roleFilter ? `&role=${roleFilter}` : ""}`).then(setRet).catch(() => setRet(null));
  }, [roleFilter]);

  useEffect(() => { loadDormant(); }, []);

  useEffect(() => {
    api.get<Reactivation>(`/api/analytics/reactivation?window_days=${winDays}`).then(setReact).catch(() => setReact(null));
    api.get<Lift>(`/api/analytics/winback/lift?window_days=${winDays}`).then(setLift).catch(() => setLift(null));
  }, [winDays, winMsg]);

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value.toLocaleString("en-IN")}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2"><BarChart3 size={20} className="text-[var(--color-primary)]" /> Product Analytics</h1>
        <div className="flex items-center gap-1.5 text-xs">
          <Filter size={13} className="text-[var(--color-muted)]" />
          {[7, 30, 90].map((n) => (
            <button key={n} onClick={() => setDays(n)} className={`px-2.5 py-1 rounded-lg border ${days === n ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{n}d</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-muted)] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : err ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-muted)]">{err}</div>
      ) : d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Daily active" value={d.active.dau} />
            <Stat label="Weekly active" value={d.active.wau} />
            <Stat label="Monthly active" value={d.active.mau} />
            <Stat label={`Events (${d.window_days}d)`} value={d.active.events} />
          </div>

          {d.sessions && d.sessions.count > 0 && (
            <p className="text-xs text-[var(--color-muted)]">
              Avg session <span className="text-[var(--color-text)] font-medium">{d.sessions.avg_minutes} min</span> · {d.sessions.avg_events} events/session · {d.sessions.count.toLocaleString("en-IN")} sessions in {d.window_days}d
            </p>
          )}

          {/* Activation funnel */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm font-semibold flex items-center gap-2 mb-3"><Activity size={15} className="text-[var(--color-primary)]" /> Activation funnel <span className="text-xs font-normal text-[var(--color-muted)]">(distinct businesses)</span></p>
            <div className="space-y-2">
              {d.funnel.map((f, i) => {
                const top = d.funnel[0]?.count || 0;
                const pct = top > 0 ? Math.round((f.count / top) * 100) : 0;
                const conv = i > 0 && d.funnel[i - 1].count > 0 ? Math.round((f.count / d.funnel[i - 1].count) * 100) : null;
                return (
                  <div key={f.key} className="flex items-center gap-3">
                    <span className="w-40 text-xs text-[var(--color-muted)] shrink-0">{f.label}</span>
                    <div className="flex-1 h-6 rounded bg-[var(--color-bg)] overflow-hidden relative">
                      <div className="h-full bg-[var(--color-primary)]/70" style={{ width: `${pct}%` }} />
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">{f.count.toLocaleString("en-IN")}</span>
                    </div>
                    <span className="w-12 text-right text-xs text-[var(--color-muted)] shrink-0">{conv != null ? `${conv}%` : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Behaviour by stakeholder */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="text-sm font-semibold mb-3">Activity by stakeholder</p>
              {d.by_role.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No activity yet.</p> : (
                <div className="space-y-1.5">
                  {d.by_role.map((r) => {
                    const max = d.by_role[0]?.count || 1;
                    return (
                      <div key={r.role || "?"} className="flex items-center gap-2 text-sm">
                        <span className="w-32 shrink-0 capitalize">{(r.role || "unknown").replace(/_/g, " ")}</span>
                        <div className="flex-1 h-4 rounded bg-[var(--color-bg)] overflow-hidden"><div className="h-full bg-[var(--color-primary)]/60" style={{ width: `${Math.round((r.count / max) * 100)}%` }} /></div>
                        <span className="w-24 text-right text-xs text-[var(--color-muted)]">{r.count.toLocaleString("en-IN")} · {r.users}u</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Top pages */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="text-sm font-semibold mb-3">Top pages</p>
              {d.top_paths.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No page views yet.</p> : (
                <div className="space-y-1.5">
                  {d.top_paths.map((p) => (
                    <div key={p.path} className="flex items-center justify-between text-sm"><span className="font-mono text-xs truncate">{p.path}</span><span className="text-[var(--color-muted)] text-xs shrink-0 ml-2">{p.count.toLocaleString("en-IN")}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Top events */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="text-sm font-semibold mb-3">Top events</p>
              {d.top_events.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No events yet.</p> : (
                <div className="space-y-1.5">
                  {d.top_events.map((e) => (
                    <div key={e.event} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs">{e.event}</span>
                      <span className="text-[var(--color-muted)] text-xs">{e.count.toLocaleString("en-IN")} · {e.tenants} biz</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Segments (platform scope only) */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="text-sm font-semibold mb-3">Segments {d.scope === "tenant" && <span className="text-xs font-normal text-[var(--color-muted)]">(platform-wide only)</span>}</p>
              {Object.entries(d.segments).every(([, v]) => v.length === 0) ? (
                <p className="text-xs text-[var(--color-muted)]">Segments appear once businesses complete onboarding.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(d.segments).map(([dim, vals]) => vals.length > 0 && (
                    <div key={dim}>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1">{dim.replace(/_/g, " ")}</p>
                      {vals.map((s) => <div key={s.key} className="flex justify-between text-xs"><span>{s.key}</span><span className="text-[var(--color-muted)]">{s.count}</span></div>)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Weekly retention cohorts */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-sm font-semibold">Weekly retention <span className="text-xs font-normal text-[var(--color-muted)]">(% of each cohort that returned)</span></p>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 outline-none">
                <option value="">All stakeholders</option>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            {!ret || ret.cohorts.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">Not enough data yet - cohorts build up after a couple of weeks of usage.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="text-[var(--color-muted)]">
                      <th className="text-left px-2 py-1 font-medium">Cohort week</th>
                      <th className="text-right px-2 py-1 font-medium">Users</th>
                      {Array.from({ length: ret.weeks + 1 }, (_, k) => <th key={k} className="px-2 py-1 text-center font-medium">W{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {ret.cohorts.map((c) => {
                      const elapsed = Math.floor((Date.now() - new Date(c.cohort).getTime()) / (7 * 864e5));
                      return (
                        <tr key={c.cohort}>
                          <td className="px-2 py-1 text-[var(--color-muted)] whitespace-nowrap">{c.cohort}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{c.size}</td>
                          {c.retention.map((pct, k) => k > elapsed ? <td key={k} className="px-2 py-1" /> : (
                            <td key={k} className="px-2 py-1 text-center tabular-nums" style={{ background: pct > 0 ? `rgba(47,227,155,${0.1 + (pct / 100) * 0.6})` : "transparent", color: pct > 55 ? "var(--color-bg)" : "var(--color-text)" }}>{pct}%</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Win-back: dormant businesses + one-click nudge */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-sm font-semibold flex items-center gap-2"><MoonStar size={15} className="text-[var(--color-primary)]" /> Win-back <span className="text-xs font-normal text-[var(--color-muted)]">(gone quiet 14+ days)</span></p>
              <button onClick={runWinback} disabled={winRunning || (dormant != null && dormant.length === 0)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-medium disabled:opacity-40">
                {winRunning ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send win-back nudges
              </button>
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-3">A daily job nudges these automatically via WhatsApp, email or an in-app alert — each business at most once a month. Use the button to run it now.</p>
            {dormant == null ? (
              <p className="text-xs text-[var(--color-muted)] flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading…</p>
            ) : dormant.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">No dormant businesses — everyone active has been seen recently. 🎉</p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs"><span className="text-[var(--color-text)] font-semibold">{dormant.length}</span> <span className="text-[var(--color-muted)]">awaiting a nudge</span></p>
                {dormant.slice(0, 8).map((t) => (
                  <div key={t.tenant_id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs truncate flex-1 min-w-0">{t.tenant_id}</span>
                    {t.label && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] shrink-0 whitespace-nowrap">{t.label}{t.amount ? ` · ₹${Math.round(t.amount).toLocaleString("en-IN")}` : ""}</span>}
                    <span className="text-[var(--color-muted)] text-xs shrink-0">idle {t.days_idle}d</span>
                  </div>
                ))}
                {dormant.length > 8 && <p className="text-xs text-[var(--color-muted)]">+{dormant.length - 8} more</p>}
              </div>
            )}
            {winMsg && <p className="text-xs mt-3 text-[var(--color-primary)]">{winMsg}</p>}
          </div>

          {/* Reactivation: did the nudges actually bring people back? */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <p className="text-sm font-semibold flex items-center gap-2"><RotateCcw size={15} className="text-[var(--color-primary)]" /> Reactivation <span className="text-xs font-normal text-[var(--color-muted)]">(% of nudges followed by a return)</span></p>
              <div className="flex items-center gap-1 text-xs">
                {[14, 30].map((n) => (
                  <button key={n} onClick={() => setWinDays(n)} className={`px-2 py-1 rounded-lg border ${winDays === n ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>within {n}d</button>
                ))}
              </div>
            </div>
            {!react || (react.overall.nudges === 0 && react.pending === 0) ? (
              <p className="text-xs text-[var(--color-muted)]">No win-back nudges sent yet — this fills in once nudges go out and their {winDays}-day window elapses.</p>
            ) : (
              <>
                {react.overall.reliable && react.overall.rate != null ? (
                  <p className="mt-1"><span className="text-3xl font-bold tabular-nums">{react.overall.rate}%</span> <span className="text-sm text-[var(--color-muted)]">returned within {react.window_days}d <span className="tabular-nums">({react.overall.reactivated}/{react.overall.nudges} nudges)</span></span></p>
                ) : (
                  <p className="mt-1 text-sm">Too few matured nudges to trust a rate — <span className="tabular-nums">{react.overall.reactivated} of {react.overall.nudges}</span> returned so far{react.overall.nudges > 0 ? ` (need ≥${react.min_n})` : ""}.</p>
                )}
                {react.pending > 0 && <p className="text-xs text-[var(--color-muted)] mt-1">{react.pending} nudge{react.pending > 1 ? "s" : ""} still maturing (sent &lt;{react.window_days}d ago) — not yet counted.</p>}

                {(["by_reason", "by_channel"] as const).map((dim) => react[dim].length > 0 && (
                  <div key={dim} className="mt-3">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5">{dim === "by_reason" ? "By reason" : "By channel"}</p>
                    <div className="space-y-1.5">
                      {react[dim].map((b) => (
                        <div key={b.key} className="flex items-center gap-2 text-sm">
                          <span className="w-36 shrink-0 text-xs capitalize">{dim === "by_reason" ? (REASON_LABELS[b.key || ""] || b.key) : (b.key || "?")}{b.dry_run && <span className="ml-1 text-[10px] text-[var(--color-muted)]">(dry-run)</span>}</span>
                          <div className="flex-1 h-3.5 rounded bg-[var(--color-bg)] overflow-hidden"><div className="h-full bg-[var(--color-primary)]/60" style={{ width: `${b.rate ?? 0}%` }} /></div>
                          <span className="w-24 text-right text-xs text-[var(--color-muted)] shrink-0">{b.reliable && b.rate != null ? `${b.rate}%` : "—"} · <span className="tabular-nums">{b.reactivated}/{b.nudges}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <p className="text-[11px] text-[var(--color-muted)] mt-3 leading-relaxed">{react.disclaimer}</p>
              </>
            )}
          </div>

          {/* Causal lift vs a randomized holdout */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm font-semibold flex items-center gap-2 mb-1"><FlaskConical size={15} className="text-[var(--color-primary)]" /> Causal lift <span className="text-xs font-normal text-[var(--color-muted)]">(vs {lift?.holdout_pct ?? 10}% randomized holdout)</span></p>
            {!lift || (lift.treatment.tenants === 0 && lift.control.tenants === 0) ? (
              <p className="text-xs text-[var(--color-muted)]">No holdout data yet — once the daily job runs with a holdout (set <span className="font-mono">WINBACK_HOLDOUT_PCT</span>), treated vs held-out returns are compared here.</p>
            ) : (
              <>
                {lift.status === "ok" ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-3xl font-bold tabular-nums">{lift.lift_pp != null && lift.lift_pp > 0 ? "+" : ""}{lift.lift_pp}pp</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${lift.significant ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" : "bg-[var(--color-bg)] text-[var(--color-muted)]"}`}>{lift.significant ? "significant (p<0.05)" : "not yet significant"}</span>
                    </p>
                    <p className="text-xs text-[var(--color-muted)] mt-1">95% CI {lift.lift_ci95?.[0]} to {lift.lift_ci95?.[1]}pp · Fisher p={lift.p_value} · can only detect lifts ≳{lift.mde_pp}pp at this sample</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm">Building — need ≥{lift.min_per_arm} businesses in each arm before a lift is meaningful (treated {lift.treatment.tenants}, holdout {lift.control.tenants}).</p>
                )}
                <div className="mt-3 space-y-1">
                  {([["Treated (nudged)", lift.treatment], ["Holdout (not nudged)", lift.control]] as const).map(([label, a]) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--color-muted)] text-xs">{label}</span>
                      <span className="tabular-nums text-xs">{a.rate != null ? `${a.rate}%` : "—"} {a.ci95 ? <span className="text-[var(--color-muted)]">(CI {a.ci95[0]}–{a.ci95[1]})</span> : null} · {a.reactivated}/{a.tenants}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--color-muted)] mt-3 leading-relaxed">{lift.caveat}</p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
