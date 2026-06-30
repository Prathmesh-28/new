import { useState, useEffect, useCallback } from "react";
import { Delete, Lock, Fingerprint } from "lucide-react";
import { isLockEnabled, verifyPin, isBiometricEnabled } from "@/lib/appLock";
import { biometricAvailable, biometricVerify } from "@/lib/biometric";
import { onAppResume } from "@/lib/mobile";
import { LogoMark } from "@/components/Logo";

/* Wraps the authenticated app. When a PIN is set, the app is locked on launch and
   again whenever it returns to the foreground - until the correct PIN is entered. */
export default function AppLockGate({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(true);

  useEffect(() => { isLockEnabled().then(e => { setEnabled(e); setLocked(e); }); }, []);
  useEffect(() => onAppResume(() => { isLockEnabled().then(e => { if (e) setLocked(true); }); }), []);

  if (enabled === null || !enabled || !locked) return <>{children}</>;
  return <LockScreen onUnlock={() => setLocked(false)} />;
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const [bio, setBio] = useState(false);

  const tryBiometric = useCallback(async () => {
    if (await biometricVerify("Unlock Headroom")) onUnlock();
  }, [onUnlock]);

  // Auto-prompt biometrics on lock when enabled + supported; PIN stays available.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = (await isBiometricEnabled()) && (await biometricAvailable());
      if (cancelled || !ok) return;
      setBio(true);
      tryBiometric();
    })();
    return () => { cancelled = true; };
  }, [tryBiometric]);

  const submit = useCallback(async (value: string) => {
    if (await verifyPin(value)) onUnlock();
    else { setErr(true); setPin(""); setTimeout(() => setErr(false), 500); }
  }, [onUnlock]);

  const press = (d: string) => {
    setErr(false);
    setPin(p => {
      const next = (p + d).slice(0, 4);
      if (next.length === 4) submit(next);
      return next;
    });
  };
  const del = () => setPin(p => p.slice(0, -1));

  // hardware keyboard support (web)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") del();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--color-bg)] flex flex-col items-center justify-center px-8 select-none">
      <div className="text-[var(--color-text)] mb-6"><LogoMark size={40} /></div>
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] mb-2"><Lock size={12} /> App locked</div>
      <p className="text-sm text-[var(--color-muted)] mb-7">Enter your PIN to unlock</p>

      <div className={`flex gap-3 mb-9 ${err ? "animate-pulse" : ""}`}>
        {[0, 1, 2, 3].map(i => (
          <span key={i} className={`w-3.5 h-3.5 rounded-full border ${i < pin.length ? "bg-[var(--color-primary)] border-[var(--color-primary)]" : err ? "border-red-500" : "border-[var(--color-border)]"}`} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-[260px] w-full">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
          <button key={d} onClick={() => press(d)}
            className="aspect-square rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-2xl font-medium text-[var(--color-text)] hover:bg-[var(--color-accent)] active:scale-95 transition">
            {d}
          </button>
        ))}
        <span />
        <button onClick={() => press("0")}
          className="aspect-square rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-2xl font-medium text-[var(--color-text)] hover:bg-[var(--color-accent)] active:scale-95 transition">0</button>
        <button onClick={del} aria-label="Delete"
          className="aspect-square rounded-full flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-text)]">
          <Delete size={22} />
        </button>
      </div>

      {bio && (
        <button onClick={tryBiometric}
          className="mt-8 flex items-center gap-2 text-sm text-[var(--color-primary)] hover:opacity-80">
          <Fingerprint size={18} /> Unlock with biometrics
        </button>
      )}
    </div>
  );
}
