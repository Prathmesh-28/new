import { useState } from "react";
import { useSeo } from "@/lib/seo";
import { Link } from "react-router-dom";
import { useAuth, BASE } from "@/context/AuthContext";
import { ArrowLeft, Wifi, WifiOff } from "lucide-react";
import type { AuthUser } from "@/data/types";
import Logo from "@/components/Logo";

export default function SignupAdvisorPage() {
  useSeo({ title: "Headroom for CAs & Accountants — run your client book in one console", description: "Link every client, track GST/TDS/ITR filings, chase documents and send white-label reports — the CA practice console inside Headroom. Free to start." });
  const { serverReady } = useAuth();
  const [email,    setEmail]    = useState("");
  const [firm,     setFirm]     = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/signup`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          email,
          password,
          role: "accountant",
          company_name: firm.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Signup failed"); return; }
      const { access, refresh } = data as { access: string; refresh: string; user: AuthUser };
      localStorage.setItem("hr_access", access);
      localStorage.setItem("hr_refresh", refresh);
      window.location.href = "/advisor";
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--color-bg)]">
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-[var(--color-surface)] border-r border-[var(--color-border)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[var(--color-primary)]/8 blur-[120px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[var(--color-primary)]/5 blur-[100px] rounded-full pointer-events-none translate-x-1/2 translate-y-1/2" />

        <div className="relative flex items-center">
          <Link to="/" aria-label="Headroom home" className="hover:opacity-80 transition-opacity">
            <Logo variant="horizontal" size={22} className="text-[var(--color-text)]" />
          </Link>
          <span className="ml-2 text-xs text-[var(--color-muted)] bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 px-2 py-0.5 rounded-full">
            Advisor
          </span>
        </div>

        <div className="relative space-y-1">
          <p className="text-sm text-[var(--color-muted)] mb-6">
            One dashboard for all your clients' cash health.
          </p>
          {[
            { n: "Free",       l: "Forever, for CAs and CFOs"          },
            { n: "Unlimited",  l: "Clients under one advisor portal"    },
            { n: "Daily",      l: "Morning brief across every client"   },
            { n: "5 min",      l: "Onboard a new client in minutes"     },
          ].map(({ n, l }) => (
            <div key={l} className="flex items-center gap-4 py-4 border-b border-[var(--color-border)] last:border-0">
              <span className="text-2xl font-bold text-[var(--color-primary)] w-24 shrink-0">{n}</span>
              <span className="text-sm text-[var(--color-muted)]">{l}</span>
            </div>
          ))}
        </div>

        <p className="relative text-xs text-[var(--color-muted)]">
          Built for Indian CAs managing SMB clients
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 sm:p-8 shadow-xl">
          <Link
            to="/login"
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors mb-10"
          >
            <ArrowLeft size={12} /> Back to sign in
          </Link>

          <div className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border mb-6 ${
            serverReady
              ? "bg-green-950/30 border-green-800/30 text-green-400"
              : "bg-yellow-950/30 border-yellow-800/30 text-yellow-500"
          }`}>
            {serverReady
              ? <><Wifi size={11} /> Server ready</>
              : <><WifiOff size={11} /> Server waking up…</>
            }
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">Join as a CA</h1>
            <p className="text-sm text-[var(--color-muted)]">
              Free forever · No credit card · Your clients' cash at a glance
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="you@cafirm.com"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                Firm / Practice Name <span className="normal-case text-[var(--color-muted)]/60 font-normal">(optional)</span>
              </label>
              <input
                type="text" value={firm} onChange={e => setFirm(e.target.value)}
                placeholder="Shah & Associates"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} placeholder="At least 8 characters"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <input
                type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                required placeholder="Repeat password"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
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
                  {serverReady ? "Creating account…" : "Waking server… (~30 s)"}
                </span>
              ) : "Create advisor account →"}
            </button>

            <p className="text-center text-xs text-[var(--color-muted)]">
              Already have an account?{" "}
              <Link to="/login" className="text-[var(--color-primary)] hover:underline font-medium">Sign in</Link>
            </p>

            <p className="text-center text-xs text-[var(--color-muted)]">
              Signing up for a business?{" "}
              <Link to="/signup" className="text-[var(--color-primary)] hover:underline font-medium">Business signup →</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
