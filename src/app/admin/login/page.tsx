"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import emailjs from "@emailjs/browser";
import Script from "next/script";
import { useAppStore } from "@/lib/store";
import { DJANGO_URL } from "@/lib/query";

// ── EmailJS config ────────────────────────────────────────────────
const EMAILJS_PUBLIC_KEY       = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY       ?? "";
const EMAILJS_SERVICE_ID       = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID       ?? "";
const EMAILJS_OTP_TEMPLATE     = process.env.NEXT_PUBLIC_EMAILJS_OTP_TEMPLATE     ?? "";
const EMAILJS_CONFIRM_TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_CONFIRM_TEMPLATE ?? "";

type Step = "email" | "otp" | "confirmed";

export default function LoginPage() {
  const router  = useRouter();
  const setUser  = useAppStore((s) => s.setUser);
  const setToken = useAppStore((s) => s.setToken);

  const [step, setStep]       = useState<Step>("email");
  const [email, setEmail]     = useState("");
  const [otp, setOtp]         = useState(["", "", "", "", "", ""]);
  const [sentOtp, setSentOtp] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [googleLoading, setGoogleLoading] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer for resend
  useEffect(() => {
    if (resendIn <= 0) return;
    timerRef.current = setInterval(() => {
      setResendIn(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [resendIn]);

  // ── Google Sign-In ───────────────────────────────────────────────
  const handleGoogleCredential = useCallback(async (credential: string) => {
    setError(""); setGoogleLoading(true);
    try {
      const res  = await fetch(`${DJANGO_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Google sign-in failed"); return; }

      setToken(data.access_token);
      setUser({
        id:        data.user.id,
        email:     data.user.email,
        role:      data.user.role,
        tenant_id: data.user.tenant_id,
      });
      setStep("confirmed");
      setTimeout(() => router.push("/dashboard/"), 1800);
    } catch {
      setError("Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }, [router, setToken, setUser]);

  const initGoogle = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !(window as any).google) return;
    (window as any).google.accounts.id.initialize({
      client_id: clientId,
      callback:  (res: any) => handleGoogleCredential(res.credential),
    });
    (window as any).google.accounts.id.renderButton(
      document.getElementById("google-signin-btn"),
      { theme: "filled_black", size: "large", shape: "rectangular", width: 400 },
    );
  }, [handleGoogleCredential]);

  // ── Step 1: send OTP via Django → EmailJS ────────────────────────
  const handleSendOtp = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setError(""); setLoading(true);

    try {
      const res  = await fetch(`${DJANGO_URL}/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to send code"); return; }

      const code: string = data.otp ?? "";
      setSentOtp(code);

      if (EMAILJS_SERVICE_ID && EMAILJS_OTP_TEMPLATE && EMAILJS_PUBLIC_KEY && code) {
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_OTP_TEMPLATE,
          { to_email: email.trim(), otp_code: code, valid_minutes: "5" },
          EMAILJS_PUBLIC_KEY,
        );
      }

      setStep("otp");
      setResendIn(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setError("Failed to send verification code. Try again.");
    } finally {
      setLoading(false);
    }
  }, [email]);

  // ── OTP input handlers ───────────────────────────────────────────
  function handleOtpChange(idx: number, val: string) {
    const digit = val.replace(/\D/, "").slice(-1);
    const next  = [...otp]; next[idx] = digit; setOtp(next);
    if (digit && idx < 5) inputRefs.current[idx + 1]?.focus();
  }

  function handleOtpKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === "Enter" && otp.every(d => d)) handleVerifyOtp();
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    const next = [...otp]; digits.forEach((d, i) => { next[i] = d; }); setOtp(next);
    inputRefs.current[Math.min(digits.length, 5)]?.focus();
  }

  // ── Step 2: verify OTP → get Django JWT ─────────────────────────
  async function handleVerifyOtp() {
    const code = otp.join("");
    if (code.length < 6) { setError("Enter the 6-digit code"); return; }
    setError(""); setLoading(true);

    try {
      const res  = await fetch(`${DJANGO_URL}/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Verification failed"); return; }

      setToken(data.access_token);
      setUser({
        id:        data.user.id,
        email:     data.user.email,
        role:      data.user.role,
        tenant_id: data.user.tenant_id,
      });

      if (EMAILJS_SERVICE_ID && EMAILJS_CONFIRM_TEMPLATE && EMAILJS_PUBLIC_KEY) {
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_CONFIRM_TEMPLATE,
          {
            to_email:     email.trim(),
            login_time:   new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            login_device: navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop",
          },
          EMAILJS_PUBLIC_KEY,
        );
      }

      setStep("confirmed");
      setTimeout(() => router.push("/dashboard/"), 1800);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <>
    <Script
      src="https://accounts.google.com/gsi/client"
      strategy="afterInteractive"
      onLoad={initGoogle}
    />
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--olive-deepest)" }}
    >
      <div className="pointer-events-none fixed inset-0" style={{
        background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(201,162,39,0.08) 0%, transparent 70%)",
      }} />

      <div className="relative w-full max-w-sm rounded-2xl p-8 shadow-2xl"
        style={{ backgroundColor: "var(--olive-deep)", border: "1px solid var(--olive-mid)" }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold font-serif text-white" style={{ letterSpacing: "-0.02em" }}>
            Head<span style={{ color: "var(--gold)" }}>room</span>
          </span>
          <p className="text-xs mt-1.5 font-medium tracking-widest uppercase" style={{ color: "var(--olive-wash)" }}>
            {step === "email" ? "Sign in to your workspace" :
             step === "otp"   ? "Enter verification code" :
                                "You're in — redirecting…"}
          </p>
        </div>

        {/* ── Step: email ── */}
        {step === "email" && (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
              <>
                <div id="google-signin-btn" className="w-full flex justify-center" />
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--olive-mid)" }} />
                  <span className="text-xs" style={{ color: "var(--olive-pale)" }}>or continue with email</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--olive-mid)" }} />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "var(--olive-pale)" }}>
                Work email
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus autoComplete="email" placeholder="you@company.com"
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-all focus:ring-2"
                style={{
                  backgroundColor: "var(--olive-deepest)", border: "1px solid var(--olive-mid)",
                  color: "var(--white)", "--tw-ring-color": "var(--gold)",
                } as React.CSSProperties}
              />
            </div>
            <ErrorBox msg={error} />
            <button type="submit" disabled={loading || !email.trim()}
              className="mt-1 w-full rounded-lg py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--gold)", color: "var(--olive-deepest)" }}>
              {loading ? <Spinner /> : null}
              {loading ? "Sending code…" : "Continue with email →"}
            </button>
          </form>
        )}

        {/* ── Step: OTP ── */}
        {step === "otp" && (
          <div className="flex flex-col gap-5">
            <p className="text-xs text-center" style={{ color: "var(--olive-wash)" }}>
              We sent a 6-digit code to{" "}
              <span className="font-semibold" style={{ color: "var(--gold-light)" }}>{email}</span>
            </p>
            <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input key={i} ref={el => { inputRefs.current[i] = el; }}
                  type="text" inputMode="numeric" maxLength={1} value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  className="w-11 h-12 text-center text-xl font-bold rounded-lg outline-none transition-all focus:ring-2"
                  style={{
                    backgroundColor: digit ? "rgba(201,162,39,0.15)" : "var(--olive-deepest)",
                    border: digit ? "1.5px solid var(--gold)" : "1px solid var(--olive-mid)",
                    color: "var(--white)", "--tw-ring-color": "var(--gold)",
                  } as React.CSSProperties}
                />
              ))}
            </div>
            <ErrorBox msg={error} />
            <button onClick={handleVerifyOtp} disabled={loading || otp.some(d => !d)}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--gold)", color: "var(--olive-deepest)" }}>
              {loading ? <Spinner /> : null}
              {loading ? "Verifying…" : "Verify & Sign in"}
            </button>
            <div className="flex items-center justify-between text-xs" style={{ color: "var(--olive-wash)" }}>
              <button className="hover:underline transition-opacity"
                style={{ color: "var(--olive-pale)", opacity: resendIn > 0 ? 0.4 : 1 }}
                disabled={resendIn > 0} onClick={() => handleSendOtp()}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </button>
              <button className="hover:underline" style={{ color: "var(--olive-pale)" }}
                onClick={() => { setStep("email"); setOtp(["","","","","",""]); setError(""); }}>
                Change email
              </button>
            </div>
          </div>
        )}

        {/* ── Step: confirmed ── */}
        {step === "confirmed" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
              style={{ backgroundColor: "rgba(201,162,39,0.15)", border: "1.5px solid var(--gold)" }}>
              ✓
            </div>
            <p className="text-sm font-semibold" style={{ color: "var(--olive-wash)" }}>
              Identity verified — a confirmation was sent to your inbox.
            </p>
            <div className="w-full rounded-full h-1 overflow-hidden" style={{ backgroundColor: "var(--olive-mid)" }}>
              <div className="h-full rounded-full animate-progress"
                style={{ backgroundColor: "var(--gold)", animationDuration: "1.8s" }} />
            </div>
          </div>
        )}

        {step !== "confirmed" && (
          <div className="flex justify-center gap-2 mt-6">
            {(["email", "otp"] as Step[]).map(s => (
              <div key={s} className="h-1 rounded-full transition-all duration-300"
                style={{ width: step === s ? "24px" : "8px", backgroundColor: step === s ? "var(--gold)" : "var(--olive-mid)" }} />
            ))}
          </div>
        )}
      </div>
      <style>{`@keyframes progress { from { width: 0% } to { width: 100% } } .animate-progress { animation: progress linear forwards; }`}</style>
    </div>
    </>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="text-xs rounded-lg px-3 py-2.5"
       style={{ backgroundColor: "rgba(180,40,40,0.15)", border: "1px solid rgba(180,40,40,0.4)", color: "#f87171" }}>
      {msg}
    </p>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
