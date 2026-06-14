import { useState, useEffect } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { isLockEnabled, setPin, clearPin } from "@/lib/appLock";

/* Settings card to turn on a 4-digit app-lock PIN (asked on launch + resume). */
export default function AppLockCard() {
  const [enabled, setEnabled] = useState(false);
  const [editing, setEditing] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");

  useEffect(() => { isLockEnabled().then(setEnabled); }, []);

  const save = async () => {
    if (!/^\d{4}$/.test(p1)) { toast.error("PIN must be exactly 4 digits"); return; }
    if (p1 !== p2) { toast.error("PINs don't match"); return; }
    await setPin(p1);
    setEnabled(true); setEditing(false); setP1(""); setP2("");
    toast.success("App lock enabled — you'll be asked for your PIN on launch");
  };
  const disable = async () => { await clearPin(); setEnabled(false); toast.success("App lock removed"); };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
            <ShieldCheck size={16} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">App Lock</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {enabled ? "On — a 4-digit PIN is required on launch and when you reopen the app." : "Require a 4-digit PIN to open the app — protects your cash data on a shared phone."}
            </p>
          </div>
        </div>
        {!editing && (
          enabled
            ? <button onClick={disable} className="text-xs font-semibold border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-accent)]">Turn off</button>
            : <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90"><Lock size={12} /> Set PIN</button>
        )}
      </div>

      {editing && (
        <div className="mt-4 p-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg space-y-3 max-w-xs">
          <input value={p1} onChange={e => setP1(e.target.value.replace(/\D/g, "").slice(0, 4))}
            type="password" inputMode="numeric" placeholder="New 4-digit PIN" autoFocus
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tracking-[0.4em] outline-none focus:border-[var(--color-primary)]" />
          <input value={p2} onChange={e => setP2(e.target.value.replace(/\D/g, "").slice(0, 4))}
            type="password" inputMode="numeric" placeholder="Confirm PIN"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tracking-[0.4em] outline-none focus:border-[var(--color-primary)]" />
          <div className="flex gap-2">
            <button onClick={save} className="bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90">Enable lock</button>
            <button onClick={() => { setEditing(false); setP1(""); setP2(""); }} className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-[var(--color-accent)]">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
