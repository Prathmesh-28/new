import { useState, useEffect, useCallback } from "react";
import { useAuth, BASE } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Navigate, useNavigate } from "react-router-dom";
import { UserPlus, Trash2, Copy, CheckCircle2, Save, MessageCircle, Unlink, Lock, Users, Eye, SlidersHorizontal, RotateCcw, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ROLE_META, ASSIGNABLE_ROLES, CONFIGURABLE_ROLES, TAB_CATALOG, TAB_GROUPS, roleLabel, roleBadge } from "@/data/roles";
import type { UserRole } from "@/data/types";

type TeamUser = {
  id: string;
  email: string;
  role: string;
  tenant_id: string;
  first_login: boolean;
};

function landingFor(role: string): string {
  if (role === "investor") return "/investor";
  if (role === "accountant") return "/advisor";
  return "/dashboard";
}

export default function SettingsPage() {
  const { user }  = useAuth();
  const { store, updateFirm, setPreviewRole, roleTabs, setRoleTabs, resetRole } = useApp();
  const navigate = useNavigate();
  const [openRole, setOpenRole] = useState<UserRole | null>(null);

  const startPreview = (role: UserRole) => {
    setPreviewRole(role);
    navigate(landingFor(role));
    toast.success(`Previewing as ${roleLabel(role)} — exit from the banner up top`);
  };
  const toggleTab = (role: UserRole, tab: string) => {
    const current = roleTabs(role);
    const next = current.includes(tab) ? current.filter(t => t !== tab) : [...current, tab];
    setRoleTabs(role, next);
  };
  const [users,    setUsers]    = useState<TeamUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email,    setEmail]    = useState("");
  const [role,     setRole]     = useState("finance_manager");
  const [inviting, setInviting] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  // Firm profile form state (synced from store.firm)
  const [firmName,     setFirmName]     = useState(store.firm.name ?? "");
  const [firmIndustry, setFirmIndustry] = useState(store.firm.industry ?? "");
  const [safetyDays,   setSafetyDays]   = useState(store.firm.safetyThresholdDays ?? 14);
  const [firmSaving,   setFirmSaving]   = useState(false);

  // GST settings
  const [gstRegistered, setGstRegistered] = useState(store.firm.gstRegistered ?? false);
  const [gstNumber,     setGstNumber]     = useState(store.firm.gstNumber ?? "");
  const [gstRate,       setGstRate]       = useState(store.firm.gstRate ?? 18);
  const [gstSaving,     setGstSaving]     = useState(false);

  const handleSaveGst = () => {
    setGstSaving(true);
    updateFirm({ gstRegistered, gstNumber, gstRate });
    toast.success("GST settings saved");
    setGstSaving(false);
  };

  // WhatsApp binding
  const [waPhone,      setWaPhone]      = useState("");
  const [waRegistered, setWaRegistered] = useState<string | null>(null);
  const [waLoading,    setWaLoading]    = useState(true);
  const [waConnecting, setWaConnecting] = useState(false);

  const tenantId = users.find(u => u.id === user?.id)?.tenant_id ?? "Loading…";

  const handleSaveFirm = () => {
    setFirmSaving(true);
    updateFirm({ name: firmName, industry: firmIndustry, safetyThresholdDays: safetyDays });
    toast.success("Business profile saved");
    setFirmSaving(false);
  };

  const loadWaStatus = useCallback(async () => {
    try {
      const res = await api.get<{ registered: boolean; phone: string | null }>("/api/whatsapp/status");
      setWaRegistered(res.phone);
    } catch { /* silently skip */ }
    finally { setWaLoading(false); }
  }, []);

  useEffect(() => { loadWaStatus(); }, [loadWaStatus]);

  const handleWaConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waPhone) return;
    setWaConnecting(true);
    try {
      await api.post("/api/whatsapp/register", { phone: waPhone });
      toast.success("WhatsApp connected — check your phone for a welcome message");
      setWaPhone("");
      loadWaStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect WhatsApp");
    } finally { setWaConnecting(false); }
  };

  const handleWaDisconnect = async () => {
    if (!window.confirm("Disconnect WhatsApp? You will stop receiving digests and alerts.")) return;
    try {
      await api.delete("/api/whatsapp/register");
      setWaRegistered(null);
      toast.success("WhatsApp disconnected");
    } catch {
      toast.error("Failed to disconnect");
    }
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

  const handleChangeRole = async (u: TeamUser, newRole: string) => {
    if (newRole === u.role) return;
    if (u.id === user.id) { toast.error("You can't change your own role"); return; }
    setSavingRoleId(u.id);
    try {
      const res = await fetch(`${BASE}/api/users/${u.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body:    JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(`${u.email} is now ${roleLabel(newRole)}`);
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSavingRoleId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      {/* Team Members */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
              <Users size={16} className="text-[var(--color-primary)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Your Team{users.length > 0 ? ` · ${users.length}` : ""}</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Bring your finance person, CA, sales and ops staff in — each sees only their part of Headroom.</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90"
          >
            <UserPlus size={13} /> Invite Member
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleInvite} className="mb-6 p-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg space-y-3">
            <h3 className="text-sm font-semibold">Invite a team member</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="email" required placeholder="name@yourbusiness.com"
                value={email} onChange={e => setEmail(e.target.value)}
                className="md:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              />
              <select
                value={role} onChange={e => setRole(e.target.value)}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none"
              >
                {ASSIGNABLE_ROLES.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Live preview of what the chosen role can do */}
            <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleBadge(role)}`}>{roleLabel(role)}</span>
                <span className="text-xs text-[var(--color-muted)]">{ROLE_META[role as keyof typeof ROLE_META]?.blurb}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {(ROLE_META[role as keyof typeof ROLE_META]?.scope ?? []).map(s => (
                  <span key={s} className="text-[11px] text-[var(--color-muted)] flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-[var(--color-primary)]/60 shrink-0" />{s}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-3 bg-[var(--color-accent)] rounded-lg text-xs text-[var(--color-muted)]">
              <strong className="text-[var(--color-text)]">What happens:</strong> a temporary password is emailed to them. They set their own password on first login and only ever see the parts of Headroom their role allows.
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
            {users.map(u => {
              const isSelf = u.id === user.id;
              return (
                <div key={u.id} className="flex items-center justify-between py-3.5 gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-sm font-bold text-[var(--color-primary)] shrink-0">
                      {u.email[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {u.email}
                        {isSelf && <span className="ml-2 text-[10px] text-[var(--color-muted)] font-normal">(you)</span>}
                      </p>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">
                        {u.first_login
                          ? <span className="text-yellow-500">Awaiting first login</span>
                          : ROLE_META[u.role as keyof typeof ROLE_META]?.blurb ?? "Active"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isSelf || u.role === "super_admin" ? (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${roleBadge(u.role)}`}>
                        {roleLabel(u.role)}
                      </span>
                    ) : (
                      <select
                        value={u.role}
                        disabled={savingRoleId === u.id}
                        onChange={e => handleChangeRole(u, e.target.value)}
                        className={`text-xs font-semibold rounded-lg border px-2.5 py-1 outline-none cursor-pointer disabled:opacity-50 ${roleBadge(u.role)}`}
                        title="Change this member's role"
                      >
                        {ASSIGNABLE_ROLES.map(r => (
                          <option key={r.id} value={r.id} className="bg-[var(--color-surface)] text-[var(--color-text)]">{r.label}</option>
                        ))}
                      </select>
                    )}
                    {!isSelf && (
                      <button
                        onClick={() => handleRemove(u)}
                        className="text-[var(--color-muted)] hover:text-red-400 transition-colors p-1"
                        title="Remove from workspace"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {users.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--color-muted)]">No team members yet — invite your finance person, accountant or sales staff above.</p>
            )}
          </div>
        )}
      </div>

      {/* Stakeholder Views & Permissions */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
            <SlidersHorizontal size={15} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Stakeholder Views &amp; Permissions</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">See the app exactly as each role does, and control which pages each one can open.</p>
          </div>
        </div>

        {/* Preview as */}
        <div className="mt-5">
          <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">Preview as</p>
          <div className="flex flex-wrap gap-2">
            {ASSIGNABLE_ROLES.map(r => (
              <button key={r.id} onClick={() => startPreview(r.id)}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors hover:border-[var(--color-primary)] ${roleBadge(r.id)}`}>
                <Eye size={12} /> {r.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-2">Opens the app as that stakeholder. A banner lets you exit back to your own view anytime.</p>
        </div>

        {/* Configure access */}
        <div className="mt-6">
          <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">Configure access</p>
          <div className="space-y-2">
            {CONFIGURABLE_ROLES.map(r => {
              const enabled = roleTabs(r.id);
              const isOpen = openRole === r.id;
              return (
                <div key={r.id} className="border border-[var(--color-border)] rounded-lg overflow-hidden">
                  <button onClick={() => setOpenRole(isOpen ? null : r.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${roleBadge(r.id)}`}>{r.label}</span>
                      <span className="text-xs text-[var(--color-muted)] truncate">{enabled.length} page{enabled.length !== 1 ? "s" : ""} enabled</span>
                    </div>
                    <ChevronDown size={15} className={`text-[var(--color-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-[var(--color-border)] p-4 bg-[var(--color-bg)]">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] text-[var(--color-muted)]">Tick a page to grant {r.label} access to it.</p>
                        <button onClick={() => resetRole(r.id)}
                          className="flex items-center gap-1 text-[10px] text-[var(--color-muted)] hover:text-[var(--color-primary)]">
                          <RotateCcw size={10} /> Reset to default
                        </button>
                      </div>
                      <div className="space-y-3">
                        {TAB_GROUPS.map(group => {
                          const tabs = TAB_CATALOG.filter(t => t.group === group);
                          if (tabs.length === 0) return null;
                          return (
                            <div key={group}>
                              <p className="text-[10px] font-semibold text-[var(--color-muted)]/70 uppercase tracking-wider mb-1.5">{group}</p>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                                {tabs.map(t => {
                                  const on = enabled.includes(t.tab);
                                  return (
                                    <label key={t.tab} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                                      <input type="checkbox" checked={on} onChange={() => toggleTab(r.id, t.tab)} className="accent-[var(--color-primary)] shrink-0" />
                                      <span className={on ? "" : "text-[var(--color-muted)]"}>{t.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Business profile */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
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
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
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

      {/* GST */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
        <h2 className="text-sm font-semibold mb-1">GST Settings</h2>
        <p className="text-xs text-[var(--color-muted)] mb-5">
          Used to estimate your monthly GSTR-3B liability from revenue transactions and surface it in the tax calendar and forecast.
        </p>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setGstRegistered(v => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${gstRegistered ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${gstRegistered ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm">I'm GST registered</span>
          </label>

          {gstRegistered && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">GSTIN</label>
                <input value={gstNumber} onChange={e => setGstNumber(e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] font-mono tracking-wide" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Primary output GST rate</label>
                <select value={gstRate} onChange={e => setGstRate(Number(e.target.value))}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                  <option value={0}>0% (Exempt / Nil rated)</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18% (most common)</option>
                  <option value={28}>28%</option>
                </select>
              </div>
            </div>
          )}

          {gstRegistered && (
            <div className="p-3 bg-[var(--color-accent)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-muted)]">
              Headroom will estimate your monthly GSTR-3B output tax as <strong className="text-[var(--color-text)]">revenue × {gstRate}%</strong> and
              show it in your tax calendar and forecast obligations. Actual liability is lower after input tax credit — this is a planning estimate.
            </div>
          )}
        </div>
        <button onClick={handleSaveGst} disabled={gstSaving}
          className="mt-5 flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40">
          <Save size={13} /> {gstSaving ? "Saving…" : "Save GST Settings"}
        </button>
      </div>

      {/* WhatsApp */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle size={15} className="text-green-400" />
          <h2 className="text-sm font-semibold">WhatsApp Alerts</h2>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-5">
          Get a 7am cash snapshot every morning and ask your numbers anytime — reply <strong className="text-[var(--color-text)]">cash</strong>, <strong className="text-[var(--color-text)]">runway</strong>, <strong className="text-[var(--color-text)]">alerts</strong>, or anything in plain language.
        </p>

        {waLoading ? (
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            Checking status…
          </div>
        ) : waRegistered ? (
          <div className="flex items-center justify-between gap-4 p-4 bg-green-950/20 border border-green-800/30 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-300">Connected</p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5 font-mono">{waRegistered}</p>
              </div>
            </div>
            <button onClick={handleWaDisconnect}
              className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors">
              <Unlink size={13} /> Disconnect
            </button>
          </div>
        ) : (
          <form onSubmit={handleWaConnect} className="flex gap-2">
            <div className="flex-1">
              <input
                type="tel" required value={waPhone} onChange={e => setWaPhone(e.target.value)}
                placeholder="+919876543210 (include country code)"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 font-mono"
              />
            </div>
            <button type="submit" disabled={waConnecting}
              className="flex items-center gap-1.5 bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-40 shrink-0">
              <MessageCircle size={13} /> {waConnecting ? "Connecting…" : "Connect WhatsApp"}
            </button>
          </form>
        )}

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { cmd: "cash",     desc: "Current balance" },
            { cmd: "runway",   desc: "Days of cash left" },
            { cmd: "alerts",   desc: "Unread alerts" },
            { cmd: "invoices", desc: "Overdue receivables" },
          ].map(({ cmd, desc }) => (
            <div key={cmd} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5">
              <p className="text-xs font-bold text-[var(--color-primary)] font-mono">"{cmd}"</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-[var(--color-muted)] mt-3">
          Powered by Twilio WhatsApp Business API · Uses the same Headroom number you'll set up in your Twilio dashboard ·{" "}
          Set <strong className="text-[var(--color-text)]">TWILIO_ACCOUNT_SID</strong>, <strong className="text-[var(--color-text)]">TWILIO_AUTH_TOKEN</strong>, and <strong className="text-[var(--color-text)]">TWILIO_WHATSAPP_FROM</strong> in backend .env
        </p>
      </div>

      {/* Role reference */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
        <h2 className="text-sm font-semibold mb-1">What each role can do</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Pick the role that matches the person's job. You can change it anytime from the list above.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ASSIGNABLE_ROLES.map(meta => (
            <div key={meta.id} className="border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.badge}`}>
                  {meta.label}
                </span>
                {meta.readOnly && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                    <Lock size={9} /> read-only
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-muted)] mb-2.5 leading-relaxed">{meta.blurb}</p>
              <ul className="space-y-1">
                {meta.scope.map(p => (
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
