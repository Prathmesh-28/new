import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Loader2, Mail, MonitorSmartphone, Moon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import Button from "@/components/ui/Button";

/**
 * Notification preferences — which events reach you, and how.
 *
 * There were none. Every alert went to the whole firm on whichever channel the code
 * happened to use, which is why people end up muting a product entirely rather than
 * tuning it. The matrix below is rendered from the server's own event catalogue, so a new
 * event type appears here without a second edit.
 *
 * Quiet hours are separate and deliberately so: they govern messages to CUSTOMERS
 * (reminders, statements), not the firm's own alerts — a cash warning at 22:00 is exactly
 * when it matters.
 */
type EventDef = { id: string; group: string; label: string; locked?: boolean };
type Channels = { inApp: boolean; email: boolean; push: boolean };
type Prefs = { digest: "off" | "daily" | "weekly"; digestHour: number; events: Record<string, Channels> };

const CHANNELS: { key: keyof Channels; label: string; icon: typeof Bell }[] = [
  { key: "inApp", label: "In app", icon: Bell },
  { key: "email", label: "Email", icon: Mail },
  { key: "push", label: "Push", icon: MonitorSmartphone },
];

export default function NotificationsCard() {
  const [events, setEvents] = useState<EventDef[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [quiet, setQuiet] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<{ events: EventDef[]; preferences: Prefs }>("/api/notifications/preferences")
        .then((r) => { setEvents(r.events); setPrefs(r.preferences); })
        .catch(() => { setEvents([]); setPrefs(null); }),
      api.get<{ start: number | null; end: number | null }>("/api/notifications/quiet-hours")
        .then(setQuiet).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (eventId: string, channel: keyof Channels) => {
    setPrefs((p) => {
      if (!p) return p;
      const cur = p.events[eventId] ?? { inApp: true, email: false, push: false };
      return { ...p, events: { ...p.events, [eventId]: { ...cur, [channel]: !cur[channel] } } };
    });
    setDirty(true);
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try { await api.put("/api/notifications/preferences", prefs); toast.success("Notification settings saved"); setDirty(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save those settings"); }
    finally { setSaving(false); }
  };

  const saveQuiet = async (start: number | null, end: number | null) => {
    setQuiet({ start, end });
    try { await api.put("/api/notifications/quiet-hours", { start, end }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save quiet hours"); }
  };

  const test = async () => {
    setTesting(true);
    try {
      // Says exactly which channels went out — a preference or a missing SMTP/FCM key
      // silently dropping one is precisely what this button is for.
      const r = await api.post<{ note: string }>("/api/notifications/test", {});
      toast.success(`Test sent via: ${r.note}`);
    } catch { toast.error("Couldn't send the test notification."); }
    finally { setTesting(false); }
  };

  const groups = Array.from(new Set(events.map((e) => e.group)));

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 space-y-5" id="notifications">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
            <Bell size={16} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Notifications</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Choose what reaches you, and where. These are your settings — they don't change anyone else's.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" loading={testing} onClick={test} icon={<Bell size={13} />}>Send a test</Button>
          {dirty && <Button size="sm" variant="primary" loading={saving} onClick={save} icon={<Check size={13} />}>Save</Button>}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--color-muted)] flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</p>
      ) : !prefs ? (
        <p className="text-xs text-[var(--color-muted)]">Couldn't load your notification settings.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[440px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-2 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Tell me when…</th>
                  {CHANNELS.map((c) => (
                    <th key={c.key} className="py-2 w-20 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider text-center">
                      <span className="inline-flex items-center gap-1"><c.icon size={11} />{c.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <>
                    <tr key={`g-${g}`}>
                      <td colSpan={4} className="pt-4 pb-1 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{g}</td>
                    </tr>
                    {events.filter((e) => e.group === g).map((e) => {
                      const chans = prefs.events[e.id] ?? { inApp: true, email: false, push: false };
                      return (
                        <tr key={e.id} className="border-b border-[var(--color-border)]/50">
                          <td className="py-2 pr-3">
                            {e.label}
                            {e.locked && <span className="ml-2 text-[10px] text-[var(--color-muted)]">always emailed</span>}
                          </td>
                          {CHANNELS.map((c) => (
                            <td key={c.key} className="py-2 text-center">
                              <input
                                type="checkbox"
                                checked={e.locked && c.key === "email" ? true : chans[c.key]}
                                disabled={e.locked && c.key === "email"}
                                onChange={() => toggle(e.id, c.key)}
                                aria-label={`${e.label} — ${c.label}`}
                                className="accent-[var(--color-primary)] cursor-pointer disabled:opacity-50"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <label htmlFor="digest" className="text-xs text-[var(--color-muted)]">Summary email</label>
              <select id="digest" value={prefs.digest}
                onChange={(e) => { setPrefs({ ...prefs, digest: e.target.value as Prefs["digest"] }); setDirty(true); }}
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]">
                <option value="off">Don't send one</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              {prefs.digest !== "off" && (
                <select value={prefs.digestHour}
                  onChange={(e) => { setPrefs({ ...prefs, digestHour: Number(e.target.value) }); setDirty(true); }}
                  aria-label="Hour to send the summary"
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-1">
              <Moon size={14} className="text-[var(--color-muted)]" />
              <h3 className="text-sm font-semibold">Quiet hours for customer messages</h3>
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              Payment reminders and statements won't be sent to customers inside this window. Your own alerts are unaffected — a cash warning at 22:00 is exactly when it matters.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select value={quiet.start ?? ""} aria-label="Quiet hours start"
                onChange={(e) => saveQuiet(e.target.value === "" ? null : Number(e.target.value), quiet.end ?? 8)}
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 outline-none focus:border-[var(--color-primary)]">
                <option value="">No quiet hours</option>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
              {quiet.start !== null && (
                <>
                  <span className="text-[var(--color-muted)]">to</span>
                  <select value={quiet.end ?? 8} aria-label="Quiet hours end"
                    onChange={(e) => saveQuiet(quiet.start, Number(e.target.value))}
                    className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 outline-none focus:border-[var(--color-primary)]">
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                  <span className="text-[var(--color-muted)]">IST</span>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
