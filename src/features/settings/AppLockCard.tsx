import { useState, useEffect } from "react";
import { Lock, ShieldCheck, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { isLockEnabled, setPin, clearPin, isBiometricEnabled, setBiometricEnabled } from "@/lib/appLock";
import { biometricAvailable, biometricVerify } from "@/lib/biometric";

/* Settings card to turn on a 4-digit app-lock PIN (asked on launch + resume),
   with an optional Face ID / fingerprint fast-unlock on supported devices. */
export default function AppLockCard() {
  const [enabled, setEnabled] = useState(false);
  const [editing, setEditing] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [bioSupported, setBioSupported] = useState(false);
  const [bioOn, setBioOn] = useState(false);

  useEffect(() => { isLockEnabled().then(setEnabled); }, []);
  useEffect(() => { biometricAvailable().then(setBioSupported); isBiometricEnabled().then(setBioOn); }, []);

  const save = async () => {
    if (!/^\d{4}$/.test(p1)) { toast.error("PIN must be exactly 4 digits"); return; }
    if (p1 !== p2) { toast.error("PINs don't match"); return; }
    await setPin(p1);
    setEnabled(true); setEditing(false); setP1(""); setP2("");
    toast.success("App lock enabled — you'll be asked for your PIN on launch");
  };
  const disable = async () => { await clearPin(); await setBiometricEnabled(false); setBioOn(false); setEnabled(false); toast.success("App lock removed"); };

  const toggleBio = async () => {
    if (bioOn) { await setBiometricEnabled(false); setBioOn(false); toast.success("Biometric unlock turned off"); return; }
    if (!(await biometricVerify("Enable biometric unlock"))) { toast.error("Biometric check failed"); return; }
    await setBiometricEnabled(true); setBioOn(true);
    toast.success("Biometric unlock enabled");
  };

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

      {enabled && bioSupported && !editing && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center gap-2.5">
            <Fingerprint size={16} className="text-[var(--color-primary)]" />
            <div>
              <p className="text-sm font-medium">Biometric unlock</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Use Face ID / fingerprint instead of typing your PIN.</p>
            </div>
          </div>
          <button onClick={toggleBio}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${bioOn ? "border border-[var(--color-border)] hover:bg-[var(--color-accent)]" : "bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90"}`}>
            {bioOn ? "Turn off" : "Turn on"}
          </button>
        </div>
      )}

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
