import { useCallback, useEffect, useState } from "react";
import { Clock, Laptop, LogOut, ShieldAlert, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import Button from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Confirm";

/**
 * Where you're signed in, and how to stop being signed in there.
 *
 * Refresh tokens were stateless 7-day JWTs, so this screen could not exist: there was
 * nothing to list and nothing to revoke. A token copied off a shared machine stayed valid
 * for a week — even after a password change — and the account owner had no way to see it
 * or to end it. Sign-ins have also been recorded in login_events for months and shown to
 * nobody; the history below is that record, finally surfaced.
 */
type Session = {
  id: string; ip: string | null; user_agent: string | null; device_label: string | null;
  created_at: string; last_seen_at: string; expires_at: string; current: boolean;
};
type LoginEvent = { id: string; ip: string | null; device_label: string; new_device: boolean; created_at: string };

const when = (iso: string) => {
  const d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 90) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const isPhone = (label?: string | null) => /iPhone|iPad|Android/i.test(label || "");

export default function SessionsCard() {
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [history, setHistory] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<Session[]>("/auth/sessions").then(setSessions).catch(() => setSessions([])),
      api.get<LoginEvent[]>("/auth/login-history").then(setHistory).catch(() => setHistory([])),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const endOne = async (s: Session) => {
    if (!await confirm({
      title: `Sign out ${s.device_label || "this device"}?`,
      body: "That device will have to sign in again. Anything unsaved there is lost.",
      confirmLabel: "Sign it out", danger: true,
    })) return;
    setBusy(s.id);
    try { await api.delete(`/auth/sessions/${s.id}`); toast.success("Signed out"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't end that session"); }
    finally { setBusy(null); }
  };

  const endAll = async () => {
    const others = sessions.filter((s) => !s.current).length;
    if (!others) { toast.info("You're only signed in here."); return; }
    if (!await confirm({
      title: "Sign out of every other device?",
      body: `${others} other session${others === 1 ? "" : "s"} will end immediately. You'll stay signed in here.`,
      confirmLabel: "Sign them all out", danger: true,
    })) return;
    setBusy("all");
    try {
      const r = await api.post<{ ended: number }>("/auth/sessions/revoke-all", { keepCurrent: true });
      toast.success(`${r.ended} session${r.ended === 1 ? "" : "s"} ended`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't sign the others out"); }
    finally { setBusy(null); }
  };

  const unrecognised = history.filter((h) => h.new_device).length;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="font-semibold">Where you're signed in</h3>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Every device holding a valid sign-in. End one you don't recognise and it stops working immediately.
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={<LogOut size={13} />} loading={busy === "all"} onClick={endAll}>
          Sign out everywhere else
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--color-muted)] mt-4">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] mt-4">No active sessions found.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--color-border)]">
          {sessions.map((s) => {
            const Icon = isPhone(s.device_label) ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Icon size={16} className="text-[var(--color-muted)] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {s.device_label || "Unknown device"}
                      {s.current && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] font-semibold">This device</span>}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      Last used {when(s.last_seen_at)}{s.ip ? ` · ${s.ip}` : ""} · signed in {when(s.created_at)}
                    </p>
                  </div>
                </div>
                {!s.current && (
                  <Button size="sm" variant="ghost" loading={busy === s.id} onClick={() => endOne(s)}>Sign out</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 pt-4 border-t border-[var(--color-border)]">
        <button type="button" onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline">
          <Clock size={12} /> {showHistory ? "Hide" : "Show"} recent sign-ins
          {unrecognised > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
              <ShieldAlert size={9} /> {unrecognised} from a new device
            </span>
          )}
        </button>
        {showHistory && (
          <ul className="mt-3 space-y-1.5 max-h-56 overflow-y-auto">
            {history.length === 0 && <li className="text-xs text-[var(--color-muted)]">No sign-ins recorded yet.</li>}
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="truncate">
                  {h.device_label}
                  {h.new_device && <span className="ml-1.5 text-amber-400">new device</span>}
                </span>
                <span className="text-[var(--color-muted)] shrink-0">
                  {new Date(h.created_at).toLocaleString("en-IN")}{h.ip ? ` · ${h.ip}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-[var(--color-muted)] mt-3">
          We email you when your account is signed in to from a device we haven't seen before.
          If one of these wasn't you, change your password and sign out everywhere.
        </p>
      </div>
    </div>
  );
}
