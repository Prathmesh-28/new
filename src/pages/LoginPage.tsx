import { useState } from "react";
import { useSeo } from "@/lib/seo";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Lock, ShieldCheck, KeyRound } from "lucide-react";
import Logo from "@/components/Logo";
import Turnstile, { turnstileEnabled } from "@/components/Turnstile";
import PasswordInput from "@/components/PasswordInput";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useI18n } from "@/i18n";

export default function LoginPage() {
  useSeo({ title: "Log in - Headroom", description: "Log in to Headroom - your all-in-one GST billing, accounting and cash-flow workspace for Indian SMBs." });
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate    = useNavigate();
  const [params]    = useSearchParams();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [tsToken, setTsToken]   = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode]   = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (turnstileEnabled && !tsToken) { setError(t("auth.completeVerification")); return; }
    if (mfaRequired && !/^\d{6}$/.test(mfaCode.trim()) && mfaCode.trim().length < 6) { setError(t("auth.enterMfa")); return; }
    setError(""); setLoading(true);
    try {
      const u = await login(email, password, tsToken, mfaRequired ? mfaCode.trim() : undefined);
      if (u.first_login) {
        navigate("/set-password", { replace: true });
      } else {
        const defaultHome = u.role === "investor" ? "/investor" : "/dashboard";
        navigate(params.get("redirect") ?? defaultHome, { replace: true });
      }
    } catch (err) {
      if ((err as { mfaRequired?: boolean })?.mfaRequired) {
        setMfaRequired(true);
        setError(mfaCode ? t("auth.mfaError") : "");
      } else {
        setError(err instanceof Error ? err.message : t("auth.loginFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--color-bg)]">
      {/* Left panel - decorative */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-[var(--color-surface)] border-r border-[var(--color-border)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[var(--color-primary)]/8 blur-[120px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[var(--color-primary)]/5 blur-[100px] rounded-full pointer-events-none translate-x-1/2 translate-y-1/2" />

        <Link to="/" aria-label="Headroom home" className="relative hover:opacity-80 transition-opacity">
          <Logo variant="horizontal" size={24} className="text-[var(--color-text)]" />
        </Link>

        <div className="relative space-y-6">
          <h2 className="text-2xl font-bold leading-tight max-w-xs">{t("login.hero.title")}</h2>
          {[
            { title: t("login.hero.feat1.t"), d: t("login.hero.feat1.d") },
            { title: t("login.hero.feat2.t"), d: t("login.hero.feat2.d") },
            { title: t("login.hero.feat3.t"), d: t("login.hero.feat3.d") },
          ].map(({ title, d }) => (
            <div key={title} className="border-l-2 border-[var(--color-primary)]/40 pl-4">
              <p className="text-base font-semibold text-[var(--color-text)]">{title}</p>
              <p className="text-sm text-[var(--color-muted)] mt-0.5 max-w-xs">{d}</p>
            </div>
          ))}
        </div>

        <div className="relative space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { icon: Lock,        label: t("login.trust.encrypted") },
              { icon: ShieldCheck, label: t("login.trust.audit") },
              { icon: KeyRound,    label: t("login.trust.dpdp") },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-muted)] border border-[var(--color-border)] rounded-full px-2.5 py-1">
                <Icon size={12} className="text-[var(--color-primary)]" /> {label}
              </span>
            ))}
          </div>
          <p className="text-xs text-[var(--color-muted)]">{t("login.tagline")}</p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between mb-10">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              <ArrowLeft size={12} /> {t("auth.backHome")}
            </button>
            <LanguageSwitcher compact />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">{t("auth.login.title")}</h1>
            <p className="text-sm text-[var(--color-muted)]">{t("auth.login.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                {t("auth.email")}
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="you@company.com"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                {t("auth.password")}
              </label>
              <PasswordInput
                value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50"
              />
            </div>

            {mfaRequired && (
              <div>
                <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                  {t("auth.mfaLabel")}
                </label>
                <input
                  type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus
                  value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 16))}
                  placeholder={t("auth.mfaPlaceholder")}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--color-muted)]/50 text-center tracking-[0.3em]"
                />
                <p className="text-[11px] text-[var(--color-muted)] mt-1.5">{t("auth.mfaHint")}</p>
              </div>
            )}

            {error && (
              <div className="text-xs bg-red-950/30 border border-red-800/40 text-red-400 rounded-lg px-4 py-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors">
                {t("auth.forgotPassword")}
              </Link>
            </div>

            <Turnstile onVerify={setTsToken} onExpire={() => setTsToken("")} className="flex justify-center" />

            <button
              type="submit" disabled={loading}
              className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-bold rounded-lg py-3 text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[var(--color-bg)] border-t-transparent rounded-full animate-spin" />
                  {mfaRequired ? t("auth.verifying") : t("auth.signingIn")}
                </span>
              ) : (mfaRequired ? t("auth.verify") : t("auth.signIn"))}
            </button>
          </form>

          <p className="text-center text-xs text-[var(--color-muted)] mt-6">
            {t("auth.noAccount")}{" "}
            <Link to="/signup" className="text-[var(--color-primary)] hover:underline font-medium">{t("auth.signUpFree")}</Link>
          </p>

          <p className="text-center text-xs text-[var(--color-muted)] mt-2">
            {t("auth.caPrompt")}{" "}
            <Link to="/signup-advisor" className="text-[var(--color-primary)] hover:underline font-medium">{t("auth.joinAdvisor")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
