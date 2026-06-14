import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useApp } from "@/context/AppContext";

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEV_DOT: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-400", medium: "bg-yellow-400", low: "bg-[var(--color-muted)]",
};

/* Quick-access notification center: unread alert count + a dropdown of the most
   pressing alerts, reusing the existing alert store. Fixed top-right, out of the
   way of the mobile top bar's menu button. */
export default function NotificationBell() {
  const { store, markAlertRead } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const alerts = store.alerts ?? [];
  const unread = alerts.filter((a) => !a.isRead).length;
  const top = useMemo(
    () => [...alerts]
      .sort((a, b) => (a.isRead === b.isRead ? (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)
        : a.isRead ? 1 : -1) || (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 6),
    [alerts]
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const go = (id: string) => { markAlertRead(id); setOpen(false); navigate("/alerts"); };

  return (
    <div ref={ref} className="fixed z-50 top-1.5 right-14 md:top-4 md:right-6">
      <button onClick={() => setOpen((v) => !v)} aria-label="Notifications"
        className="relative w-9 h-9 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-text)] shadow-sm">
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && <span className="text-xs text-[var(--color-muted)]">{unread} unread</span>}
          </div>
          <div className="max-h-[60vh] overflow-auto">
            {top.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">You're all caught up.</div>
            ) : top.map((a) => (
              <button key={a.id} onClick={() => go(a.id)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)] flex gap-3 ${a.isRead ? "opacity-60" : ""}`}>
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEV_DOT[a.severity] ?? "bg-[var(--color-muted)]"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{a.title}</span>
                  <span className="block text-xs text-[var(--color-muted)] line-clamp-2">{a.message}</span>
                </span>
              </button>
            ))}
          </div>
          <button onClick={() => { setOpen(false); navigate("/alerts"); }}
            className="w-full text-center text-xs font-semibold text-[var(--color-primary)] py-2.5 hover:bg-[var(--color-accent)]">
            View all alerts
          </button>
        </div>
      )}
    </div>
  );
}
