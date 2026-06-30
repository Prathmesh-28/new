import { useState } from "react";
import { useSeo } from "@/lib/seo";
import { Link } from "react-router-dom";
import { BASE } from "@/context/AuthContext";
import { ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  useSeo({ title: "Reset your password - Headroom", noindex: true });
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await fetch(`${BASE}/auth/forgot-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      setSent(true); // always show success (don't leak email existence)
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-5">
      <div className="w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 sm:p-8 shadow-xl">
        <Link
          to="/login"
          className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors mb-10"
        >
          <ArrowLeft size={12} /> Back to sign in
        </Link>

        {sent ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={22} className="text-green-400" />
            </div>
            <h1 className="text-xl font-bold mb-2">Check your email</h1>
            <p className="text-sm text-[var(--color-muted)] mb-6">
              If <span className="text-[var(--color-text)]">{email}</span> has an account,
              we've sent a 6-digit OTP. It expires in 10 minutes.
            </p>
            <p className="text-xs text-[var(--color-muted)] mb-4">
              Use the OTP as your temporary password to sign in, then set a new password from your account settings.
            </p>
            <Link
              to="/login"
              className="inline-block w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-bold rounded-lg py-3 text-sm hover:opacity-90 text-center"
            >
              Go to sign in →
            </Link>
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-8">
            <h1 className="text-2xl font-bold mb-1">Forgot password?</h1>
            <p className="text-sm text-[var(--color-muted)] mb-8">
              Enter your email and we'll send a one-time password to reset access.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus placeholder="you@company.com"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
                />
              </div>

              {error && (
                <div className="text-xs bg-red-950/30 border border-red-800/40 text-red-400 rounded-lg px-4 py-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-bold rounded-lg py-3 text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[var(--color-bg)] border-t-transparent rounded-full animate-spin" />
                    Sending…
                  </span>
                ) : "Send reset OTP →"}
              </button>

              <p className="text-center text-xs text-[var(--color-muted)]">
                Remember your password?{" "}
                <Link to="/login" className="text-[var(--color-primary)] hover:underline font-medium">Sign in</Link>
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
