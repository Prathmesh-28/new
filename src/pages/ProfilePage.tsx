import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { User, Lock, Check } from "lucide-react";

function AvatarCircle({ name, email }: { name: string; email: string }) {
  const initials = name
    ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : email.slice(0, 2).toUpperCase();
  return (
    <div className="w-20 h-20 rounded-full bg-[var(--color-primary)]/20 border-2 border-[var(--color-primary)]/30 flex items-center justify-center">
      <span className="text-2xl font-bold text-[var(--color-primary)]">{initials}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [nameSaving,  setNameSaving]  = useState(false);

  const [curPwd,   setCurPwd]   = useState("");
  const [newPwd,   setNewPwd]   = useState("");
  const [confPwd,  setConfPwd]  = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  const saveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { toast.error("Name cannot be empty"); return; }
    setNameSaving(true);
    try {
      await api.put("/auth/profile", { display_name: displayName.trim() });
      toast.success("Name updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setNameSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (newPwd !== confPwd) { toast.error("Passwords do not match"); return; }
    setPwdSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: curPwd, new_password: newPwd });
      toast.success("Password changed");
      setCurPwd(""); setNewPwd(""); setConfPwd("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Incorrect current password");
    } finally {
      setPwdSaving(false);
    }
  };

  const card = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6";
  const inp  = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] transition-colors";
  const lbl  = "block text-xs font-medium text-[var(--color-muted)] mb-1.5";
  const btn  = "flex items-center gap-2 text-sm font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Profile</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Manage your account details</p>
      </div>

      {/* Avatar + identity */}
      <div className={`${card} flex items-center gap-5`}>
        <AvatarCircle name={displayName} email={user?.email ?? ""} />
        <div>
          <p className="font-semibold text-base">{displayName || user?.email}</p>
          <p className="text-sm text-[var(--color-muted)]">{user?.email}</p>
          <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/25">
            {user?.role ?? "owner"}
          </span>
        </div>
      </div>

      {/* Display name */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-4">
          <User size={14} className="text-[var(--color-primary)]" />
          <h2 className="font-semibold text-sm">Display Name</h2>
        </div>
        <form onSubmit={saveDisplayName} className="space-y-4">
          <div>
            <label className={lbl}>Name shown in the app</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your full name"
              className={inp}
              maxLength={64}
            />
          </div>
          <button type="submit" disabled={nameSaving || displayName.trim() === (user?.display_name ?? "")} className={btn}>
            {nameSaving ? "Saving…" : <><Check size={13} /> Save Name</>}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-4">
          <Lock size={14} className="text-[var(--color-primary)]" />
          <h2 className="font-semibold text-sm">Change Password</h2>
        </div>
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className={lbl}>Current password</label>
            <input type="password" value={curPwd} onChange={e => setCurPwd(e.target.value)} className={inp} autoComplete="current-password" />
          </div>
          <div>
            <label className={lbl}>New password (min 8 characters)</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} className={inp} autoComplete="new-password" />
          </div>
          <div>
            <label className={lbl}>Confirm new password</label>
            <input type="password" value={confPwd} onChange={e => setConfPwd(e.target.value)} className={inp} autoComplete="new-password" />
            {confPwd && newPwd !== confPwd && (
              <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
            )}
          </div>
          <button type="submit" disabled={pwdSaving || !curPwd || !newPwd || !confPwd} className={btn}>
            {pwdSaving ? "Saving…" : <><Lock size={13} /> Change Password</>}
          </button>
        </form>
      </div>
    </div>
  );
}
