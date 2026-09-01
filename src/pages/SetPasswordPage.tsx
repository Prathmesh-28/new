import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, BASE } from "@/context/AuthContext";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import PasswordInput from "@/components/PasswordInput";

export default function SetPasswordPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords don't match"); return; }
    if (password.length < 8)  { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/set-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("hr_access")}` },
        body:    JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error("Failed to set password");
      toast.success("Password set - welcome!");
      const home = user?.role === "investor" ? "/capital" : "/dashboard";
      navigate(home, { replace: true });
    } catch {
      toast.error("Failed to set password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-6">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-8">
          <div className="mb-8">
            <Logo variant="horizontal" size={22} className="text-[var(--color-text)]" />
            <h1 className="text-2xl font-bold mt-6 mb-1">Set your password</h1>
            <p className="text-sm text-[var(--color-muted)]">
              Welcome, <span className="text-[var(--color-text)]">{user?.email}</span>. Choose a password to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                New Password
              </label>
              <PasswordInput showStrength
                value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} autoFocus placeholder="At least 8 characters"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <PasswordInput
                value={confirm} onChange={e => setConfirm(e.target.value)}
                required placeholder="Repeat password"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-bold rounded-lg py-3 text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 mt-2"
            >
              {loading
                ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-[var(--color-bg)] border-t-transparent rounded-full animate-spin" />Setting password…</span>
                : "Set password & continue →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
