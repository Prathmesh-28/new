import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Loader2, Activity, Filter, BarChart3 } from "lucide-react";

interface Seg { key: string; count: number }
interface Overview {
  scope: string; window_days: number;
  active: { dau: number; wau: number; mau: number; events: number };
  funnel: { key: string; label: string; count: number }[];
  top_events: { event: string; count: number; tenants: number }[];
  segments: Record<string, Seg[]>;
}

export default function ProductAnalytics() {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setErr("");
    api.get<Overview>(`/api/analytics/overview?days=${days}`)
      .then(setD).catch((e) => setErr((e as { message?: string })?.message || "Analytics is available to owners/admins."))
      .finally(() => setLoading(false));
  }, [days]);

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
        </>
      )}
    </div>
  );
}
