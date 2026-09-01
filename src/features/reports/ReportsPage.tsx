import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, LineChart, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import Button from "@/components/ui/Button";

/**
 * /reports — the front door reports never had.
 *
 * Real reporting exists all over the product (statements, GST, ageing, payroll registers)
 * but was scattered across 72 pages with no index and nothing schedulable: the owner had
 * to remember to open the app to learn yesterday's number. The catalog comes from the
 * server so this page and the mailer can never disagree about what exists.
 */
type CatalogEntry = { key: string; title: string; group: string; desc: string; path?: string; schedulable?: boolean };
type Schedule = { id: string; report_key: string; cadence: "daily" | "weekly"; send_hour: number; last_sent_at: string | null };
type CompareRow = { label: string; current: number; previous: number; delta: number; pct: number | null; link?: string };
type Compare = { note: string; rows: CompareRow[]; drivers: { customer: string; current: number; previous: number; delta: number }[] };
type Consolidated = { firms: { tenant_id: string; name: string; receivables: number; overdue: number; cash_in_30d: number; cash_out_30d: number }[]; group: { receivables: number; overdue: number; cash_in_30d: number; cash_out_30d: number }; note?: string };

export default function ReportsPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [consolidated, setConsolidated] = useState<Consolidated | null>(null);

  const load = useCallback(() => {
    api.get<CatalogEntry[]>("/api/reports/catalog").then(setCatalog).catch(() => setCatalog([]));
    api.get<Schedule[]>("/api/reports/schedules").then(setSchedules).catch(() => setSchedules([]));
    api.get<Compare>("/api/reports/compare").then(setCompare).catch(() => setCompare(null));
    api.get<Consolidated>("/api/reports/consolidated").then(setConsolidated).catch(() => setConsolidated(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const schedOf = (key: string) => schedules.find((s) => s.report_key === key);

  const toggle = async (e: CatalogEntry) => {
    const cur = schedOf(e.key);
    setBusy(e.key);
    try {
      if (cur) { await api.delete(`/api/reports/schedules/${e.key}`); toast.success(`Stopped emailing "${e.title}"`); }
      else { await api.put(`/api/reports/schedules/${e.key}`, { cadence: "daily", sendHour: 8 }); toast.success(`"${e.title}" will arrive daily at 08:00`); }
      load();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't change that"); }
    finally { setBusy(null); }
  };

  const change = async (key: string, cadence: string, hour: number) => {
    try { await api.put(`/api/reports/schedules/${key}`, { cadence, sendHour: hour }); load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't change that"); }
  };

  const sendNow = async (e: CatalogEntry) => {
    setBusy(`send-${e.key}`);
    try {
      const r = await api.post<{ delivered: boolean }>(`/api/reports/send-now/${e.key}`, {});
      // Never claim delivery a missing SMTP key silently dropped.
      r.delivered ? toast.success(`"${e.title}" sent to your email`)
                  : toast.warning("Composed, but email isn't configured on this deployment — nothing was delivered.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't send it"); }
    finally { setBusy(null); }
  };

  const groups = Array.from(new Set(catalog.map((c) => c.group)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Reports</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Everything reportable, in one place — and the ones that can come to you by email on a schedule.
        </p>
      </div>

      {/* This month against last — with WHO moved the number, not just that it moved.
          Every report used to show one period in isolation. */}
      {compare && (
        <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold">This month vs last</h2>
          <p className="text-[11px] text-[var(--color-muted)] mb-3">{compare.note}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {compare.rows.map((r) => (
              <Link key={r.label} to={r.link || "#"} className="rounded-lg border border-[var(--color-border)] p-3 hover:border-[var(--color-primary)]/40">
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{r.label}</p>
                <p className="text-lg font-bold tabular-nums mt-0.5">
                  {r.label.includes("raised") ? r.current : formatCurrency(r.current)}
                </p>
                <p className={`text-[11px] tabular-nums ${r.delta > 0 ? "text-[var(--color-primary)]" : r.delta < 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>
                  {r.delta > 0 ? "▲" : r.delta < 0 ? "▼" : "•"} {r.label.includes("raised") ? Math.abs(r.delta) : formatCurrency(Math.abs(r.delta))}
                  {r.pct != null ? ` (${r.pct > 0 ? "+" : ""}${r.pct}%)` : ""} vs {r.label.includes("raised") ? r.previous : formatCurrency(r.previous)}
                </p>
              </Link>
            ))}
          </div>
          {compare.drivers.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-1.5">Who moved the invoiced number</p>
              <ul className="text-xs space-y-1">
                {compare.drivers.slice(0, 5).map((d) => (
                  <li key={d.customer} className="flex items-center justify-between gap-3">
                    <span className="truncate">{d.customer}</span>
                    <span className={`tabular-nums shrink-0 ${d.delta > 0 ? "text-[var(--color-primary)]" : "text-red-400"}`}>
                      {d.delta > 0 ? "+" : "−"}{formatCurrency(Math.abs(d.delta))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* The group view for multi-firm logins (#197): one login, N firms, no switching. */}
      {consolidated && consolidated.firms.length > 1 && (
        <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3">All your firms together</h2>
          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            {([["Receivables", consolidated.group.receivables], ["…overdue", consolidated.group.overdue],
               ["Cash in, 30d", consolidated.group.cash_in_30d], ["Cash out, 30d", consolidated.group.cash_out_30d]] as const).map(([l, v]) => (
              <div key={l}><p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{l}</p>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(v)}</p></div>
            ))}
          </div>
          <table className="w-full text-xs rcard">
            <thead><tr className="border-b border-[var(--color-border)]">
              {["Firm", "Receivables", "Overdue", "In 30d", "Out 30d"].map((h) => <th key={h} className="text-left py-1.5 pr-3 font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {consolidated.firms.map((f) => (
                <tr key={f.tenant_id}>
                  <td data-label="Firm" className="py-1.5 pr-3">{f.name}</td>
                  <td data-label="Receivables" className="py-1.5 pr-3 tabular-nums">{formatCurrency(f.receivables)}</td>
                  <td data-label="Overdue" className="py-1.5 pr-3 tabular-nums">{formatCurrency(f.overdue)}</td>
                  <td data-label="In 30d" className="py-1.5 pr-3 tabular-nums">{formatCurrency(f.cash_in_30d)}</td>
                  <td data-label="Out 30d" className="py-1.5 pr-3 tabular-nums">{formatCurrency(f.cash_out_30d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {groups.map((g) => (
        <section key={g}>
          <h2 className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-2 flex items-center gap-1.5">
            {g === "Email me" ? <Mail size={11} /> : <LineChart size={11} />}{g}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {catalog.filter((c) => c.group === g).map((e) => {
              const sched = schedOf(e.key);
              return (
                <div key={e.key} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 flex flex-col">
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-1 flex-1">{e.desc}</p>

                  {e.schedulable ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant={sched ? "secondary" : "primary"} loading={busy === e.key}
                          icon={<CalendarClock size={12} />} onClick={() => toggle(e)}>
                          {sched ? "Stop emailing" : "Email me this"}
                        </Button>
                        <Button size="sm" variant="ghost" loading={busy === `send-${e.key}`}
                          icon={<Send size={12} />} onClick={() => sendNow(e)} title="Send it to me right now">
                          Send now
                        </Button>
                      </div>
                      {sched && (
                        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                          <select value={sched.cadence} onChange={(ev) => change(e.key, ev.target.value, sched.send_hour)}
                            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 outline-none">
                            <option value="daily">Every day</option>
                            <option value="weekly">Mondays</option>
                          </select>
                          <span>at</span>
                          <select value={sched.send_hour} onChange={(ev) => change(e.key, sched.cadence, Number(ev.target.value))}
                            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 outline-none">
                            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                          </select>
                          <span>IST</span>
                        </div>
                      )}
                    </div>
                  ) : e.path ? (
                    <Link to={e.path} className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
                      Open <ArrowRight size={11} />
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
