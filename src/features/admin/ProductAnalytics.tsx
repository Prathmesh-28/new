import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Loader2, Activity, Filter, BarChart3, Send, MoonStar } from "lucide-react";

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
interface Dormant { tenant_id: string; last_seen: string; days_idle: number }
interface WinResult { scanned: number; channels: Record<string, number> }
const ROLES = ["owner", "finance_manager", "accountant", "sales", "operations_manager", "investor"];

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

  const loadDormant = () => api.get<{ dormant: Dormant[] }>("/api/analytics/dormant").then((r) => setDormant(r.dormant)).catch(() => setDormant(null));
  const runWinback = () => {
    setWinRunning(true); setWinMsg("");
    api.post<WinResult>("/api/analytics/winback/run", {})
      .then((r) => { const sent = Object.entries(r.channels).map(([k, v]) => `${v} ${k}`).join(", "); setWinMsg(r.scanned ? `Nudged ${r.scanned} business${r.scanned > 1 ? "es" : ""}${sent ? ` (${sent})` : ""}.` : "No dormant businesses to nudge right now."); loadDormant(); })
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
                  <div key={t.tenant_id} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs truncate">{t.tenant_id}</span>
                    <span className="text-[var(--color-muted)] text-xs shrink-0 ml-2">idle {t.days_idle}d</span>
                  </div>
                ))}
                {dormant.length > 8 && <p className="text-xs text-[var(--color-muted)]">+{dormant.length - 8} more</p>}
              </div>
            )}
            {winMsg && <p className="text-xs mt-3 text-[var(--color-primary)]">{winMsg}</p>}
          </div>
        </>
      )}
    </div>
  );
}
