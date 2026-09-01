import { useState, useEffect } from "react";
import { useSeo } from "@/lib/seo";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth, BASE } from "@/context/AuthContext";
import { ArrowLeft, Wifi, WifiOff, Lock, ShieldCheck, KeyRound } from "lucide-react";
import type { AuthUser } from "@/data/types";
import Logo from "@/components/Logo";
import Turnstile, { turnstileEnabled } from "@/components/Turnstile";
import PasswordInput from "@/components/PasswordInput";
import EmailVerifyStep from "@/components/EmailVerifyStep";

const ROLE_OPTIONS = [
  {
    value: "owner",
    label: "Business Owner",
    description: "Manage your company's cash flow, credit, and capital",
  },
  {
    value: "accountant",
    label: "Accountant / CA / CFO",
    description: "Review forecasts and financial data for your clients",
  },
  {
    value: "investor",
    label: "Investor / Banker",
    description: "Track capital raises and investment opportunities",
  },
];

export default function SignupPage() {
  useSeo({ title: "Start free - Headroom | GST Billing & Accounting for SMBs", description: "Create your free Headroom account - GST billing, accounting, invoicing, collections, payroll and cash-flow forecasts for Indian SMBs. No credit card." });
  const { serverReady } = useAuth();
  // Carry-through from the homepage: the bottom-CTA email and the pricing card the
  // visitor clicked (?plan=growth|pro). Both used to be silently dropped here - the
  // typed email vanished and every paid-plan click produced the identical free signup.
  const [params] = useSearchParams();
  const [email,       setEmail]       = useState(() => params.get("email") || "");
  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [company,     setCompany]     = useState("");
  const [role,        setRole]        = useState("owner");
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [tsToken,     setTsToken]     = useState("");
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  // Real trial length (backend lib/billingLifecycle.js TRIAL_DAYS), fetched from the
  // same source of truth as the rest of the app - never a second hardcoded number
  // that can drift (an audit found this page claiming a 90-day trial elsewhere in
  // the app claimed the real 14 days).
  const [trialDays, setTrialDays] = useState(14);
  useEffect(() => {
    fetch(`${BASE}/api/billing/plans`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.trialDays) setTrialDays(d.trialDays); })
      .catch(() => { /* keep the 14-day default */ });
  }, []);

  // Paid-plan intent from the pricing page survives signup + verification: stash it
  // now, OnboardingWizard routes to Settings -> Plan & Billing when it's set.
  useEffect(() => {
    const plan = params.get("plan");
    if (plan === "growth" || plan === "pro") sessionStorage.setItem("hr_signup_plan", plan);
  }, [params]);

  const enterApp = (user: AuthUser, access: string, refresh: string) => {
    localStorage.setItem("hr_access", access);
    localStorage.setItem("hr_refresh", refresh);
    // Reload so AuthProvider picks up the new token from localStorage
    const home = user.role === "investor" ? "/capital" : user.role === "accountant" ? "/advisor" : "/onboarding";
    window.location.href = home;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (turnstileEnabled && !tsToken) { setError("Please complete the verification below."); return; }
    setError(""); setLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (tsToken) headers["cf-turnstile-response"] = tsToken;  // Cloudflare Turnstile (no-op until configured)
      const res = await fetch(`${BASE}/auth/signup`, {
        method:  "POST",
        headers,
        body:    JSON.stringify({ email, password, company_name: company || undefined, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Signup failed"); return; }
      if (data.verify_required) { setVerifyEmail(data.email); return; }
      const { access, refresh, user } = data as { access: string; refresh: string; user: AuthUser };
      enterApp(user, access, refresh);
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

        <Link to="/" aria-label="Headroom home" className="relative hover:opacity-80 transition-opacity">
          <Logo variant="horizontal" size={24} className="text-[var(--color-text)]" />
        </Link>

        <div className="relative space-y-6">
          {[
            { n: "10-layer",  l: "Cash flow intelligence"         },
            { n: "90 days",   l: "Forecast horizon with P10/P90"  },
            { n: "3 tracks",  l: "Capital raise pathways"         },
            { n: "Free",      l: `First ${trialDays} days, no card needed`  },
          ].map(({ n, l }) => (
            <div key={l} className="flex items-center gap-4 py-4 border-b border-[var(--color-border)] last:border-0">
              <span className="text-2xl font-bold text-[var(--color-primary)] w-24 shrink-0">{n}</span>
              <span className="text-sm text-[var(--color-muted)]">{l}</span>
            </div>
          ))}
        </div>

        <div className="relative space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { icon: Lock,        label: "AES-256 encrypted" },
              { icon: ShieldCheck, label: "MCA audit trail" },
              { icon: KeyRound,    label: "DPDP data controls" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-muted)] border border-[var(--color-border)] rounded-full px-2.5 py-1">
                <Icon size={12} className="text-[var(--color-primary)]" /> {label}
              </span>
            ))}
          </div>
          <p className="text-xs text-[var(--color-muted)]">Financial OS for lean Indian SMBs</p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 sm:p-8 shadow-xl">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors mb-10"
          >
            <ArrowLeft size={12} /> Back to home
          </Link>

          {/* Server status */}
          <div className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border mb-6 ${
            serverReady
              ? "bg-green-950/30 border-green-800/30 text-green-400"
              : "bg-yellow-950/30 border-yellow-800/30 text-yellow-500"
          }`}>
            {serverReady ? <><Wifi size={11} /> Server ready</> : <><WifiOff size={11} /> Server waking up…</>}
          </div>

          {verifyEmail ? (
            <EmailVerifyStep email={verifyEmail} onVerified={(d) => enterApp(d.user, d.access, d.refresh)} />
          ) : (
          <>
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">Create your account</h1>
            <p className="text-sm text-[var(--color-muted)]">
              Free for {trialDays} days · No credit card
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Role picker */}
            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
                I am a…
              </label>
              <div className="grid grid-cols-1 gap-2">
                {ROLE_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      role === opt.value
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/8"
                        : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"
                    }`}
                  >
                    <input
                      type="radio" name="role" value={opt.value}
                      checked={role === opt.value} onChange={e => setRole(e.target.value)}
                      className="mt-0.5 accent-[var(--color-primary)]"
                    />
                    <div>
                      <p className="text-sm font-semibold leading-snug">{opt.label}</p>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Company name (owners only) */}
            {role === "owner" && (
              <div>
                <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                  Company Name
                </label>
                <input
                  type="text" value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="Acme Pvt. Ltd."
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus={role !== "owner"} placeholder="you@company.com"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                Password
              </label>
              <PasswordInput showStrength
                value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} placeholder="At least 8 characters"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <PasswordInput
                value={confirm} onChange={e => setConfirm(e.target.value)}
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

            <Turnstile onVerify={setTsToken} onExpire={() => setTsToken("")} className="flex justify-center" />

            <button
              type="submit" disabled={loading}
              className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-bold rounded-lg py-3 text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[var(--color-bg)] border-t-transparent rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : "Create account →"}
            </button>

            <p className="text-center text-[10px] text-[var(--color-muted)]">
              By creating an account you agree to our{" "}
              <Link to="/privacy-policy" target="_blank" className="text-[var(--color-primary)] hover:underline">Privacy Policy</Link>.
            </p>

            <p className="text-center text-xs text-[var(--color-muted)]">
              Already have an account?{" "}
              <Link to="/login" className="text-[var(--color-primary)] hover:underline font-medium">Sign in</Link>
            </p>
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
