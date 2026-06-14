import { useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

/* Verify push delivery once Firebase is configured. On native the device's token
   is registered on launch; this sends a test push to every device in the tenant. */
export default function NotificationsCard() {
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ sent: number; mock?: boolean }>("/api/push/test", {});
      if (r.mock) toast.message("Push isn't enabled on the server yet — set FCM_SERVER_KEY to turn it on.");
      else if (r.sent > 0) toast.success(`Test notification sent to ${r.sent} device${r.sent > 1 ? "s" : ""}.`);
      else toast.message("No devices registered yet — open the app on your phone and allow notifications first.");
    } catch { toast.error("Couldn't send the test notification."); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
            <Bell size={16} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Push Notifications</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Cash-pressure alerts, payment + GST reminders land on your phone's lock screen.</p>
          </div>
        </div>
        <button onClick={test} disabled={busy}
          className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-semibold hover:bg-[var(--color-accent)] disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />} Send test
        </button>
      </div>
    </div>
  );
}
