import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// PUBLIC landing the SSO callback redirects to with tokens in the URL fragment (#access=&refresh=).
// Mirrors how the login page stores tokens, then bounces into the app. Fragment (not query) so the
// tokens never hit the server logs.
export default function SsoCallbackPage() {
  const [msg, setMsg] = useState("Signing you in…");
  useEffect(() => {
    try {
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access = h.get("access"), refresh = h.get("refresh");
      if (access) {
        localStorage.setItem("hr_access", access);
        if (refresh) localStorage.setItem("hr_refresh", refresh);
        window.history.replaceState(null, "", "/sso-callback"); // scrub tokens from the URL
        window.location.replace("/dashboard");
      } else {
        setMsg("Sign-in link was missing its token. Redirecting…");
        setTimeout(() => window.location.replace("/login?sso_error=missing_token"), 1200);
      }
    } catch { window.location.replace("/login?sso_error=callback"); }
  }, []);
  return (
    <div style={{ minHeight: "100vh" }} className="flex items-center justify-center bg-[#0d1117] text-slate-400 gap-2">
      <Loader2 className="animate-spin" size={18} /> {msg}
    </div>
  );
}
