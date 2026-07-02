// Base dictionary (source of truth) for the in-house i18n (#169). Every user-facing
// string gets a stable, namespaced key here; other locales translate a subset and fall
// back to this English base for anything not yet translated — so an untranslated screen
// shows English, never a broken key token. Add a key here first, then translate in the
// per-locale files. Interpolation uses {name}-style placeholders.
const en: Record<string, string> = {
  // Common actions / status (reusable across the app)
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.add": "Add",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.loading": "Loading…",
  "common.search": "Search…",
  "common.language": "Language",

  // Auth — login/signup entry
  "auth.backHome": "Back to home",
  "auth.login.title": "Welcome back",
  "auth.login.subtitle": "Sign in to your workspace",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.forgotPassword": "Forgot password?",
  "auth.signIn": "Sign in →",
  "auth.signingIn": "Signing in…",
  "auth.verify": "Verify →",
  "auth.verifying": "Verifying…",
  "auth.mfaLabel": "Authenticator code",
  "auth.mfaPlaceholder": "6-digit code",
  "auth.mfaHint": "Open your authenticator app, or enter a backup code.",
  "auth.mfaError": "That code didn't match. Try again, or use a backup code.",
  "auth.completeVerification": "Please complete the verification below.",
  "auth.enterMfa": "Enter the 6-digit code from your authenticator (or a backup code).",
  "auth.loginFailed": "Login failed",
  "auth.noAccount": "Don't have an account?",
  "auth.signUpFree": "Sign up free",
  "auth.caPrompt": "CA or accountant?",
  "auth.joinAdvisor": "Join as an advisor →",

  // Login left panel (value props + trust)
  "login.hero.title": "Know your cash. Before it knows you.",
  "login.hero.feat1.t": "Live cash clarity",
  "login.hero.feat1.d": "Runway, a 13-week forecast and a health score - in one view.",
  "login.hero.feat2.t": "Built for India",
  "login.hero.feat2.d": "GST, TDS and compliance baked in, not bolted on.",
  "login.hero.feat3.t": "Your whole team",
  "login.hero.feat3.d": "Role-based access for finance, your CA, sales and ops.",
  "login.trust.encrypted": "AES-256 encrypted",
  "login.trust.audit": "MCA audit trail",
  "login.trust.dpdp": "DPDP data controls",
  "login.tagline": "Financial OS for lean SMBs",

  // Sidebar footer + firm switcher
  "nav.profile": "Profile",
  "nav.signOut": "Sign out",
  "nav.adminConsole": "Admin Console",
  "firm.add": "Add a firm",
  "firm.switch": "Switch firm",
};
export default en;
