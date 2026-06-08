import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [params]   = useSearchParams();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(email, password);
      navigate(params.get("redirect") ?? "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            Head<span className="text-[var(--color-primary)]">room</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoFocus placeholder="you@company.com"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs bg-red-950/30 border border-red-800/40 text-red-400 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold rounded-lg py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-40 mt-1"
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--color-muted)] mt-6">
          Demo: <span className="text-[var(--color-primary)]">admin@headroom.finance</span> / <span className="text-[var(--color-primary)]">admin123</span>
        </p>
      </div>
    </div>
  );
}
