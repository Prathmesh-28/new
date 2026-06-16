import { useState, useEffect, useCallback } from "react";
import { Mail, Check, X } from "lucide-react";
import { useAuth, BASE } from "@/context/AuthContext";
import { toast } from "sonner";

type Invite = { id: string; tenant_id: string; inviter_email: string | null; role: string };

/* In-platform team invites (no email): any signed-in user sees pending invites here and
   accepts/rejects in-app. Polls every 20s so it appears across web + iOS + Android without
   websockets. Renders nothing when there are no pending invites. */
export default function InviteBanner() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const token = () => localStorage.getItem("hr_access") ?? "";

  const load = useCallback(() => {
    if (!user) return;
    fetch(`${BASE}/api/invites`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => (r.ok ? r.json() : { incoming: [] }))
      .then(d => setInvites(d.incoming ?? []))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const act = async (id: string, action: "accept" | "reject") => {
    const res = await fetch(`${BASE}/api/invites/${id}/${action}`, {
      method: "POST", headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) {
      if (action === "accept") { toast.success("Joined the team 🎉"); setTimeout(() => window.location.reload(), 700); }
      else { toast.success("Invite declined"); load(); }
    } else {
      toast.error((await res.json().catch(() => ({}))).error ?? "Action failed");
    }
  };

  if (!user || invites.length === 0) return null;
  return (
    <div className="space-y-2 mb-4" data-no-print>
      {invites.map(inv => (
        <div key={inv.id} className="flex items-center justify-between gap-3 bg-[var(--color-primary)]/12 border border-[var(--color-primary)]/30 rounded-lg px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Mail size={15} className="text-[var(--color-primary)] shrink-0" />
            <span className="truncate">You've been invited to join a team as <strong>{inv.role.replace(/_/g, " ")}</strong>{inv.inviter_email ? <> by {inv.inviter_email}</> : null}.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => act(inv.id, "accept")} className="text-xs font-semibold px-3 py-1 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] flex items-center gap-1"><Check size={12} /> Accept</button>
            <button onClick={() => act(inv.id, "reject")} className="text-xs font-semibold px-3 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-red-400 flex items-center gap-1"><X size={12} /> Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}
