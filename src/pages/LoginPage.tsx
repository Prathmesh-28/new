import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Wifi, WifiOff } from "lucide-react";

export default function LoginPage() {
  const { login, serverReady } = useAuth();
  const navigate    = useNavigate();
  const [params]    = useSearchParams();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const u = await login(email, password);
      if (u.first_login) {
        navigate("/set-password", { replace: true });
      } else {
        const defaultHome = u.role === "investor" ? "/capital" : "/dashboard";
        navigate(params.get("redirect") ?? defaultHome, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--color-bg)]">
      {/* Left panel — decorative */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-[var(--color-surface)] border-r border-[var(--color-border)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[var(--color-primary)]/8 blur-[120px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[var(--color-primary)]/5 blur-[100px] rounded-full pointer-events-none translate-x-1/2 translate-y-1/2" />

        <span className="relative text-xl font-bold">
          Head<span className="text-[var(--color-primary)]">room</span>
        </span>

        <div className="relative">
          {[
            { n: "₹4.2Cr",  l: "Total runway tracked"     },
            { n: "3 roles",  l: "Granular access control"  },
            { n: "90 days",  l: "Forecast horizon"         },
          ].map(({ n, l }) => (
            <div key={l} className="flex items-center gap-4 py-4 border-b border-[var(--color-border)] last:border-0">
              <span className="text-2xl font-bold text-[var(--color-primary)] w-24 shrink-0">{n}</span>
              <span className="text-sm text-[var(--color-muted)]">{l}</span>
            </div>
          ))}
        </div>

        <p className="relative text-xs text-[var(--color-muted)]">Financial OS for lean SMBs</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors mb-10"
          >
            <ArrowLeft size={12} /> Back to home
          </button>

          {/* Server status pill */}
          <div className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border mb-6 transition-all ${
            serverReady
              ? "bg-green-950/30 border-green-800/30 text-green-400"
              : "bg-yellow-950/30 border-yellow-800/30 text-yellow-500"
          }`}>
            {serverReady
              ? <><Wifi size={11} /> Server ready</>
              : <><WifiOff size={11} /> Server waking up — may take ~30 s on first sign-in</>
            }
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
            <p className="text-sm text-[var(--color-muted)]">Sign in to your workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="you@company.com"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
              />
            </div>

            {error && (
              <div className="text-xs bg-red-950/30 border border-red-800/40 text-red-400 rounded-xl px-4 py-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-bold rounded-xl py-3 text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[var(--color-bg)] border-t-transparent rounded-full animate-spin" />
                  {serverReady ? "Signing in…" : "Waking server… (~30 s)"}
                </span>
              ) : "Sign in →"}
            </button>
          </form>

          <p className="text-center text-xs text-[var(--color-muted)] mt-6">
            Don't have an account?{" "}
            <Link to="/signup" className="text-[var(--color-primary)] hover:underline font-medium">Sign up free</Link>
          </p>

          <p className="text-center text-xs text-[var(--color-muted)] mt-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3">
            Demo: <span className="text-[var(--color-primary)] font-medium">admin@headroom.app</span><br />
            Password: <span className="text-[var(--color-primary)] font-medium">Headroom@2024</span>
          </p>
        </div>
      </div>
    </div>
  );
}
