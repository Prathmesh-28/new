import { useState } from "react";
import { BASE } from "@/context/AuthContext";
import { KeyRound } from "lucide-react";
import type { AuthUser } from "@/data/types";

// Shared OTP-entry step for signup email verification (B2 gap audit 2026-07). Used by
// SignupPage/SignupAdvisorPage after a signup returns verify_required, and by LoginPage
// when a correct password hits an unverified account. On success it hands back the same
// {access, refresh, user} shape /auth/signup used to return directly, so callers just
// swap their "signup succeeded" branch for "verification succeeded".
export default function EmailVerifyStep({ email, onVerified }: { email: string; onVerified: (data: { access: string; refresh: string; user: AuthUser }) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== 6) { setError("Enter the 6-digit code"); return; }
    setError(""); setBusy(true);
    try {
      const res = await fetch(`${BASE}/auth/verify-signup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Verification failed"); return; }
      onVerified(data);
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setResent(false);
    const res = await fetch(`${BASE}/auth/resend-signup-otp`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    });
    if (res.ok) setResent(true);
    else setError((await res.json().catch(() => ({}))).error ?? "Couldn't resend — try again shortly");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={16} className="text-[var(--color-primary)]" /> Verify your email
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        We sent a 6-digit code to <span className="text-[var(--color-text)] font-medium">{email}</span>. Enter it below to finish setting up your account.
      </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000" inputMode="numeric" autoFocus
        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono outline-none focus:border-[var(--color-primary)]"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {resent && !error && <p className="text-xs text-green-500">Code resent — check your inbox.</p>}
      <button type="submit" disabled={busy}
        className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-bold rounded-lg py-3 text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40">
        {busy ? "Verifying…" : "Verify & continue →"}
      </button>
      <button type="button" onClick={resend} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:underline">
        Didn't get it? Resend code
      </button>
    </form>
  );
}
