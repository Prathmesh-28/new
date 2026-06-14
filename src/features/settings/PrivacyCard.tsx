import { useState, useEffect } from "react";
import { ShieldCheck, Download, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";

interface Consent { purpose: string; granted: boolean; required: boolean; updated_at: string | null; }

const LABELS: Record<string, { title: string; desc: string }> = {
  essential:        { title: "Essential processing", desc: "Required to run your account, forecasts and alerts." },
  marketing:        { title: "Product updates & tips", desc: "Occasional emails about features and best practices." },
  lending_partners: { title: "Share with lending partners", desc: "Let vetted lenders see AA-verified financials when you apply for credit." },
  analytics:        { title: "Usage analytics", desc: "Anonymous usage data to improve the product." },
};

const GRIEVANCE_EMAIL = "grievance@headroom.app";

/* DPDP-aligned data & privacy controls: consent ledger, data export (right to
   access), and account-deletion request (right to erasure). */
export default function PrivacyCard() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pwd, setPwd] = useState("");

  useEffect(() => { api.get<Consent[]>("/api/account/consent").then(setConsents).catch(() => {}); }, []);

  const toggle = async (c: Consent) => {
    if (c.required) return;
    const next = !c.granted;
    setConsents((cs) => cs.map((x) => (x.purpose === c.purpose ? { ...x, granted: next } : x)));
    try { await api.post("/api/account/consent", { purpose: c.purpose, granted: next }); }
    catch { toast.error("Could not save preference"); setConsents((cs) => cs.map((x) => (x.purpose === c.purpose ? { ...x, granted: !next } : x))); }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/account/export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("hr_access") ?? ""}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "headroom-data.json"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Your data export has downloaded");
    } catch { toast.error("Export failed — please try again"); }
    finally { setBusy(false); }
  };

  const requestDeletion = async () => {
    if (!pwd) { toast.error("Enter your password to confirm"); return; }
    setBusy(true);
    try {
      const r = await api.post<{ status: string }>("/api/account/deletion-request", { password: pwd });
      toast.success(r.status === "already_pending" ? "A deletion request is already on file." : "Deletion request submitted. We'll confirm by email.");
      setConfirmDelete(false); setPwd("");
    } catch (e) { toast.error(e instanceof Error && /401/.test(e.message) ? "Password is incorrect" : "Could not submit request"); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <ShieldCheck size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Privacy & Data</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Your rights under India's DPDP Act — consent, access and erasure.</p>
        </div>
      </div>

      {/* Consent toggles */}
      <div className="space-y-2 mb-5">
        {consents.map((c) => {
          const meta = LABELS[c.purpose] ?? { title: c.purpose, desc: "" };
          return (
            <div key={c.purpose} className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{meta.title} {c.required && <span className="text-[10px] text-[var(--color-muted)]">(required)</span>}</p>
                <p className="text-xs text-[var(--color-muted)]">{meta.desc}</p>
              </div>
              <button onClick={() => toggle(c)} disabled={c.required} aria-label={`Toggle ${meta.title}`}
                className={`w-10 h-6 rounded-full shrink-0 transition relative ${c.granted ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"} ${c.required ? "opacity-50" : ""}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${c.granted ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Data rights */}
      <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
        <button onClick={exportData} disabled={busy}
          className="flex items-center gap-1.5 text-xs font-semibold border border-[var(--color-border)] px-3 py-2 rounded-lg hover:bg-[var(--color-accent)] disabled:opacity-50">
          <Download size={13} /> Export my data
        </button>
        <button onClick={() => setConfirmDelete((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold border border-red-500/40 text-red-400 px-3 py-2 rounded-lg hover:bg-red-500/10">
          <Trash2 size={13} /> Request account deletion
        </button>
      </div>

      {confirmDelete && (
        <div className="mt-3 p-4 bg-[var(--color-bg)] border border-red-500/30 rounded-lg space-y-3 max-w-sm">
          <p className="text-xs text-[var(--color-muted)]">
            We'll erase your data, except records we're legally required to retain (e.g. RBI/tax-mandated financial records), which are purged after the statutory period. Enter your password to confirm.
          </p>
          <input value={pwd} onChange={(e) => setPwd(e.target.value)} type="password" placeholder="Your password" autoFocus
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500" />
          <div className="flex gap-2">
            <button onClick={requestDeletion} disabled={busy}
              className="flex items-center gap-1.5 bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
              <Check size={14} /> Confirm request
            </button>
            <button onClick={() => { setConfirmDelete(false); setPwd(""); }} className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-[var(--color-accent)]">Cancel</button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-[var(--color-muted)] mt-4">
        Grievance Officer: <a href={`mailto:${GRIEVANCE_EMAIL}`} className="text-[var(--color-primary)]">{GRIEVANCE_EMAIL}</a> · We respond within 30 days as required by the DPDP Act.
      </p>
    </div>
  );
}
