import { useState, useEffect } from "react";
import { ShieldCheck, ShieldOff, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PasswordInput from "@/components/PasswordInput";

// Two-factor authentication (TOTP). Enroll: setup → verify a code → save backup codes.
// Backend enforces it on login only for users who turn it on, so this is opt-in.
type Phase = "idle" | "setup" | "backup";
// authFetch throws "<status>: <body>"; pull out the JSON error for a clean message.
const errMsg = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); const i = m.indexOf("{"); if (i >= 0) { try { return JSON.parse(m.slice(i)).error || m; } catch { /* fall through */ } } return m.replace(/^\d+:\s*/, ""); };

export default function SecurityCard() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState<string[]>([]);
  const [showDisable, setShowDisable] = useState(false);
  const [dPass, setDPass] = useState("");
  const [dCode, setDCode] = useState("");

  const load = () => api.get<{ enabled: boolean; backup_codes_remaining: number }>("/auth/mfa/status")
    .then((s) => { setEnabled(s.enabled); setRemaining(s.backup_codes_remaining); }).catch(() => setEnabled(false));
  useEffect(() => { load(); }, []);

  const startSetup = async () => {
    setBusy(true);
    try { const r = await api.post<{ secret: string; otpauth_url: string }>("/auth/mfa/setup", {}); setSecret(r.secret); setCode(""); setPhase("setup"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const enable = async () => {
    setBusy(true);
    try { const r = await api.post<{ backup_codes: string[] }>("/auth/mfa/enable", { code: code.trim() }); setBackup(r.backup_codes); setPhase("backup"); setEnabled(true); toast.success("Two-factor authentication is on"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try { await api.post("/auth/mfa/disable", { password: dPass, code: dCode.trim() }); setEnabled(false); setShowDisable(false); setDPass(""); setDCode(""); toast.success("Two-factor authentication turned off"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const finishBackup = () => { setPhase("idle"); setBackup([]); setSecret(""); setCode(""); load(); };

  const field = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center gap-2 mb-1">
        {enabled ? <ShieldCheck size={18} className="text-[var(--color-primary)]" /> : <KeyRound size={18} className="text-[var(--color-muted)]" />}
        <h3 className="font-semibold">Two-factor authentication</h3>
        {enabled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">On</span>}
      </div>
      <p className="text-sm text-[var(--color-muted)] mb-4">A second step at login — a code from your authenticator app — so a stolen password isn't enough to get in.</p>

      {enabled === null ? (
        <p className="text-xs text-[var(--color-muted)] flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading…</p>
      ) : enabled ? (
        // ── Enabled: show status + disable ──
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-muted)]">{remaining} backup code{remaining === 1 ? "" : "s"} remaining. Each works once if you lose your authenticator.</p>
          {!showDisable ? (
            <button onClick={() => setShowDisable(true)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"><ShieldOff size={13} /> Turn off 2FA</button>
          ) : (
            <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
              <p className="text-xs text-[var(--color-muted)]">Confirm with your password and a current code (or a backup code).</p>
              <PasswordInput value={dPass} onChange={(e) => setDPass(e.target.value)} placeholder="Account password" className={field} />
              <input value={dCode} onChange={(e) => setDCode(e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 16))} placeholder="Authenticator or backup code" className={field} />
              <div className="flex gap-2">
                <button disabled={busy || !dPass || !dCode} onClick={disable} className="text-xs px-3 py-1.5 rounded-lg bg-red-600/90 text-white font-medium disabled:opacity-40">{busy ? "Turning off…" : "Turn off 2FA"}</button>
                <button onClick={() => { setShowDisable(false); setDPass(""); setDCode(""); }} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)]">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : phase === "setup" ? (
        // ── Setup: manual key entry + verify ──
        <div className="space-y-3">
          <ol className="text-xs text-[var(--color-muted)] space-y-1 list-decimal pl-4">
            <li>In your authenticator app (Google Authenticator, Authy, 1Password…), add an account → <span className="text-[var(--color-text)]">enter a setup key</span>.</li>
            <li>Account: <span className="font-mono text-[var(--color-text)]">{user?.email}</span> · Type: <span className="text-[var(--color-text)]">time-based</span>.</li>
            <li>Paste this key:</li>
          </ol>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 break-all tracking-wider">{secret.replace(/(.{4})/g, "$1 ").trim()}</code>
            <button onClick={() => { navigator.clipboard?.writeText(secret); toast.success("Key copied"); }} className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Copy"><Copy size={14} /></button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-muted)] mb-1">Enter the 6-digit code it shows</label>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" autoFocus className={`${field} text-center tracking-[0.3em]`} />
          </div>
          <div className="flex gap-2">
            <button disabled={busy || code.length !== 6} onClick={enable} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-medium disabled:opacity-40">{busy ? "Verifying…" : "Verify & turn on"}</button>
            <button onClick={() => { setPhase("idle"); setSecret(""); setCode(""); }} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)]">Cancel</button>
          </div>
        </div>
      ) : phase === "backup" ? (
        // ── Backup codes (shown once) ──
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text)] font-medium">Save these backup codes somewhere safe — they're shown only once. Each lets you in once if you lose your authenticator.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {backup.map((c) => <code key={c} className="text-xs font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-center tracking-wider">{c}</code>)}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { navigator.clipboard?.writeText(backup.join("\n")); toast.success("Backup codes copied"); }} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"><Copy size={13} /> Copy all</button>
            <button onClick={finishBackup} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-medium">I've saved them</button>
          </div>
        </div>
      ) : (
        // ── Idle: enable ──
        <button disabled={busy} onClick={startSetup} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-medium disabled:opacity-40">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Enable 2FA
        </button>
      )}
    </div>
  );
}
