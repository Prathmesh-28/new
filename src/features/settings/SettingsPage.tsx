import { useState, useEffect, useCallback } from "react";
import { useAuth, BASE } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Navigate } from "react-router-dom";
import { UserPlus, Trash2, Copy, CheckCircle2, Save } from "lucide-react";
import { toast } from "sonner";

type TeamUser = {
  id: string;
  email: string;
  role: string;
  tenant_id: string;
  first_login: boolean;
};

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-purple-900/30 text-purple-400 border-purple-800/30",
  owner:       "bg-[var(--color-primary)]/20 text-[var(--color-primary)] border-[var(--color-primary)]/30",
  accountant:  "bg-blue-900/30 text-blue-400 border-blue-800/30",
  investor:    "bg-green-900/30 text-green-400 border-green-800/30",
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  owner:       "Business Owner",
  accountant:  "Accountant / CA / CFO",
  investor:    "Investor / Banker",
};

export default function SettingsPage() {
  const { user }  = useAuth();
  const { store, updateFirm } = useApp();
  const [users,    setUsers]    = useState<TeamUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email,    setEmail]    = useState("");
  const [role,     setRole]     = useState("accountant");
  const [inviting, setInviting] = useState(false);
  const [copied,   setCopied]   = useState(false);

  // Firm profile form state (synced from store.firm)
  const [firmName,     setFirmName]     = useState(store.firm.name ?? "");
  const [firmIndustry, setFirmIndustry] = useState(store.firm.industry ?? "");
  const [safetyDays,   setSafetyDays]   = useState(store.firm.safetyThresholdDays ?? 14);
  const [firmSaving,   setFirmSaving]   = useState(false);

  const tenantId = users.find(u => u.id === user?.id)?.tenant_id ?? "Loading…";

  const handleSaveFirm = () => {
    setFirmSaving(true);
    updateFirm({ name: firmName, industry: firmIndustry, safetyThresholdDays: safetyDays });
    toast.success("Business profile saved");
    setFirmSaving(false);
  };

  const copyTenantId = () => {
    navigator.clipboard.writeText(tenantId).then(() => {
      setCopied(true);
      toast.success("Tenant ID copied");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!user || !["super_admin", "owner"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const token = () => localStorage.getItem("hr_access") ?? "";

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/users`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setInviting(true);
    try {
      const res = await fetch(`${BASE}/api/users`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body:    JSON.stringify({ email: email.toLowerCase(), role }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(`Invite sent to ${email} — a temporary password was emailed to them`);
      setEmail(""); setShowForm(false);
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (u: TeamUser) => {
    if (u.id === user.id) { toast.error("You can't remove yourself"); return; }
    if (!window.confirm(`Remove ${u.email} from the workspace?`)) return;
    const res = await fetch(`${BASE}/api/users/${u.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) { toast.success("User removed"); loadUsers(); }
    else toast.error("Failed to remove user");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      {/* Team Members */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-sm font-semibold">Team Members</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Manage who has access to your workspace</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90"
          >
            <UserPlus size={13} /> Invite Member
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleInvite} className="mb-6 p-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl space-y-3">
            <h3 className="text-sm font-semibold">Invite Team Member</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="email" required placeholder="email@company.com"
                value={email} onChange={e => setEmail(e.target.value)}
                className="md:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              />
              <select
                value={role} onChange={e => setRole(e.target.value)}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="owner">Business Owner</option>
                <option value="accountant">Accountant / CA / CFO</option>
                <option value="investor">Investor / Banker</option>
              </select>
            </div>
            <div className="p-3 bg-[var(--color-accent)] rounded-lg text-xs text-[var(--color-muted)]">
              <strong className="text-[var(--color-text)]">What happens:</strong> A temporary password is emailed to them. They'll set their own password on first login.
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={inviting}
                className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40">
                <UserPlus size={13} /> {inviting ? "Sending…" : "Send Invite"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-[var(--color-accent)]">
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-sm font-bold text-[var(--color-primary)] shrink-0">
                    {u.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.email}</p>
                    {u.first_login && (
                      <p className="text-xs text-yellow-500 mt-0.5">Awaiting first login</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${ROLE_BADGE[u.role] ?? ""}`}>
                    {ROLE_LABEL[u.role] ?? u.role}
                  </span>
                  {u.id !== user.id && (
                    <button
                      onClick={() => handleRemove(u)}
                      className="text-[var(--color-muted)] hover:text-red-400 transition-colors p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--color-muted)]">No team members yet</p>
            )}
          </div>
        )}
      </div>

      {/* Business profile */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
        <h2 className="text-sm font-semibold mb-1">Business Profile</h2>
        <p className="text-xs text-[var(--color-muted)] mb-5">Used in credit underwriting and advisor reports.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Business name</label>
            <input value={firmName} onChange={e => setFirmName(e.target.value)}
              placeholder="e.g. Raj Traders Pvt Ltd"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Industry</label>
            <select value={firmIndustry} onChange={e => setFirmIndustry(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
              <option value="">Select industry…</option>
              {["Retail", "Manufacturing", "Food & Beverage", "Technology", "Healthcare", "Logistics", "Construction", "Services", "Agriculture", "Education", "Other"].map(i => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">
              Safety threshold — alert when runway drops below <span className="text-[var(--color-text)] font-semibold">{safetyDays} days</span>
            </label>
            <input type="range" min="7" max="60" step="1" value={safetyDays}
              onChange={e => setSafetyDays(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]" />
            <div className="flex justify-between text-xs text-[var(--color-muted)] mt-1">
              <span>7 days</span><span>60 days</span>
            </div>
          </div>
        </div>
        <button onClick={handleSaveFirm} disabled={firmSaving}
          className="mt-5 flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40">
          <Save size={13} /> {firmSaving ? "Saving…" : "Save Profile"}
        </button>
      </div>

      {/* Tenant ID card */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
        <h2 className="text-sm font-semibold mb-1">Your Tenant ID</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Share this with your CA, CFO, or banker so they can link your account to their Advisor Portal and get live cash visibility.</p>
        <div className="flex items-center gap-3">
          <code className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm font-mono tracking-wide truncate">
            {tenantId}
          </code>
          <button onClick={copyTenantId}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2.5 rounded-lg font-semibold hover:opacity-90 shrink-0">
            {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-3">
          Your advisor will use this in their <strong className="text-[var(--color-text)]">My Clients</strong> panel to add you to their portfolio. You can revoke access at any time by contacting support.
        </p>
      </div>

      {/* Role reference */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
        <h2 className="text-sm font-semibold mb-4">Role Permissions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { r: "owner",       label: "Business Owner",        perms: ["Dashboard", "Forecast", "Credit", "Capital", "Operations", "Connectors", "Invite users"] },
            { r: "accountant",  label: "Accountant / CA / CFO", perms: ["Dashboard", "Forecast", "Operations", "Advisor portal (My Clients)"] },
            { r: "investor",    label: "Investor / Banker",      perms: ["Investor portfolio", "Live raises marketplace"] },
            { r: "super_admin", label: "Super Admin",            perms: ["All tabs", "All tenants", "Admin panel", "Connectors"] },
          ].map(({ r, label, perms }) => (
            <div key={r} className="border border-[var(--color-border)] rounded-xl p-4">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ROLE_BADGE[r] ?? ""}`}>
                {ROLE_LABEL[r]}
              </span>
              <p className="text-sm font-medium mt-2 mb-2">{label}</p>
              <ul className="space-y-1">
                {perms.map(p => (
                  <li key={p} className="text-xs text-[var(--color-muted)] flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-[var(--color-primary)]/60 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
