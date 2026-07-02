import { useState, useEffect, useCallback } from "react";
import { useT } from "@/i18n";
import { useAuth, BASE } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  Users, Trash2, Copy, CheckCircle2, Save, SlidersHorizontal, RotateCcw, ChevronDown,
  Eye, LogIn, CreditCard, Building2, History, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { ASSIGNABLE_ROLES, CONFIGURABLE_ROLES, TAB_CATALOG, TAB_GROUPS, roleLabel, roleBadge } from "@/data/roles";
import type { UserRole } from "@/data/types";
import BillingCard from "./BillingCard";
import {
  relTime, OwnerOnboardingCard, CompanyProfileCard, JoinCompanyCard, TeamInvitesCard,
  PermissionMatrixCard, ApprovalPolicyCard, BooksLockCard, AuditLogCard,
  DataRetentionCard, LocationsCard, OrgActivityCard, type TeamUser,
} from "./SettingsPage";

// ─────────────────────────────────────────────────────────────────────────────
// Organization console (/organization) - the company-admin surface, split out of
// personal Settings (Claude-style). Left sub-nav: Members · Roles & Access ·
// Billing · Company · Controls & Audit. Owner / super_admin only.
// Most cards are reused from SettingsPage; the team list, access editor and
// company/GST/tenant blocks live here (they were inline in Settings before).
// ─────────────────────────────────────────────────────────────────────────────

type OrgTab = "members" | "access" | "billing" | "company" | "audit";
const TABS: { id: OrgTab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "members", label: "Members",        icon: Users,            desc: "Invite, roles, remove" },
  { id: "access",  label: "Roles & Access", icon: SlidersHorizontal, desc: "Who can open what" },
  { id: "billing", label: "Billing & Plan", icon: CreditCard,       desc: "Plan, seats, upgrade" },
  { id: "company", label: "Company",        icon: Building2,         desc: "Identity, GST, branches" },
  { id: "audit",   label: "Controls & Audit", icon: History,        desc: "Books lock, log, retention" },
];

export default function OrganizationPage() {
  const tr = useT();
  const { user } = useAuth();
  const { store, updateFirm, setPreviewRole, roleTabs, setRoleTabs, resetRole } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  // Tab + deep-link (#members / #access / … and legacy #team → members).
  const validTabs: OrgTab[] = ["members", "access", "billing", "company", "audit"];
  const [tab, setTab] = useState<OrgTab>("members");
  useEffect(() => {
    const h = location.hash.replace("#", "");
    if (h === "team") setTab("members");
    else if ((validTabs as string[]).includes(h)) setTab(h as OrgTab);
  }, [location.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  // Team
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openRole, setOpenRole] = useState<UserRole | null>(null);

  // Firm profile + GST (saved to the firm store / /api separately)
  const [firmName, setFirmName] = useState(store.firm.name ?? "");
  const [firmIndustry, setFirmIndustry] = useState(store.firm.industry ?? "");
  const [safetyDays, setSafetyDays] = useState(store.firm.safetyThresholdDays ?? 14);
  const [firmSaving, setFirmSaving] = useState(false);
  const [gstRegistered, setGstRegistered] = useState(store.firm.gstRegistered ?? false);
  const [gstNumber, setGstNumber] = useState(store.firm.gstNumber ?? "");
  const [gstRate, setGstRate] = useState(store.firm.gstRate ?? 18);
  const [gstSaving, setGstSaving] = useState(false);

  // Re-sync form fields when store.firm loads/changes (AppContext merges the KV
  // firm record post-mount; without this the initial-mount values are stale and
  // would overwrite the real firm on Save).
  useEffect(() => {
    setFirmName(store.firm.name ?? "");
    setFirmIndustry(store.firm.industry ?? "");
    setSafetyDays(store.firm.safetyThresholdDays ?? 14);
    setGstRegistered(store.firm.gstRegistered ?? false);
    setGstNumber(store.firm.gstNumber ?? "");
    setGstRate(store.firm.gstRate ?? 18);
  }, [store.firm]);

  const token = () => localStorage.getItem("hr_access") ?? "";
  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/users`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) setUsers(await res.json());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const tenantId = users.find(u => u.id === user?.id)?.tenant_id ?? "Loading…";

  if (!user || !["super_admin", "owner"].includes(user.role)) return <Navigate to="/dashboard" replace />;
  const isOwner = user.role === "owner" || user.role === "super_admin";

  const handleRemove = async (u: TeamUser) => {
    if (u.id === user.id) { toast.error("You can't remove yourself"); return; }
    if (!window.confirm(`Remove ${u.email} from the workspace?`)) return;
    const res = await fetch(`${BASE}/api/users/${u.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
    if (res.ok) { toast.success("User removed"); loadUsers(); } else toast.error("Failed to remove user");
  };
  const handleChangeRole = async (u: TeamUser, newRole: string) => {
    if (newRole === u.role) return;
    if (u.id === user.id) { toast.error("You can't change your own role"); return; }
    setSavingRoleId(u.id);
    try {
      const res = await fetch(`${BASE}/api/users/${u.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(`${u.email} is now ${roleLabel(newRole)}`);
      loadUsers();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to update role"); }
    finally { setSavingRoleId(null); }
  };
  const makeOwner = async (u: TeamUser) => {
    if (!window.confirm(`Make ${u.email} an owner too? They'll get full control of this workspace.`)) return;
    const res = await fetch(`${BASE}/api/users/${u.id}/make-owner`, { method: "POST", headers: { Authorization: `Bearer ${token()}` } });
    if (res.ok) { toast.success(`${u.email} is now an owner`); loadUsers(); }
    else toast.error((await res.json().catch(() => ({}))).error ?? "Failed");
  };
  const leaveTeam = async () => {
    if (!window.confirm("Leave this workspace? You'll get a fresh empty one of your own. Your team's data stays with them.")) return;
    const res = await fetch(`${BASE}/api/users/leave`, { method: "POST", headers: { Authorization: `Bearer ${token()}` } });
    if (res.ok) { toast.success("You've left. Reloading your new workspace…"); setTimeout(() => window.location.reload(), 800); }
    else toast.error((await res.json().catch(() => ({}))).error ?? "Failed to leave");
  };

  const handleSaveFirm = () => {
    setFirmSaving(true);
    updateFirm({ name: firmName, industry: firmIndustry, safetyThresholdDays: safetyDays });
    toast.success("Business profile saved");
    setFirmSaving(false);
  };
  const handleSaveGst = () => {
    setGstSaving(true);
    updateFirm({ gstRegistered, gstNumber, gstRate });
    toast.success("GST settings saved");
    setGstSaving(false);
  };
  const copyTenantId = () => {
    navigator.clipboard.writeText(tenantId).then(() => {
      setCopied(true); toast.success("Tenant ID copied"); setTimeout(() => setCopied(false), 2000);
    });
  };
  const startPreview = (role: UserRole) => {
    setPreviewRole(role);
    navigate(role === "investor" ? "/investor" : role === "accountant" ? "/advisor" : "/dashboard");
    toast.success(`Previewing as ${roleLabel(role)} - exit from the banner up top`);
  };
  const toggleTab = (role: UserRole, t: string) => {
    const current = roleTabs(role);
    setRoleTabs(role, current.includes(t) ? current.filter(x => x !== t) : [...current, t]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{tr("org.title")}</h1>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">Manage the people, access, billing and identity of your company. For your own preferences, see <button onClick={() => navigate("/settings")} className="text-[var(--color-primary)] hover:underline">Settings</button>.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left sub-nav */}
        <aside className="md:w-52 shrink-0">
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0">
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); if (location.hash) navigate("/organization", { replace: true }); }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0 md:w-full text-left ${active ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/4"}`}
                >
                  <t.icon size={15} className="shrink-0" />
                  <span className="flex flex-col min-w-0">
                    <span className="truncate">{t.label}</span>
                    <span className="text-[10px] font-normal text-[var(--color-muted)]/70 hidden md:block truncate">{t.desc}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-6">
          {tab === "members" && (
            <>
              <OwnerOnboardingCard users={users} firmName={store.firm.name} />
              <TeamInvitesCard />

              {/* Team Members */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
                <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
                      <Users size={16} className="text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold">{tr("org.yourTeam")}{users.length > 0 ? ` · ${users.length}` : ""}</h2>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">Bring your finance person, CA, sales and ops staff in - each sees only their part of Headroom.</p>
                    </div>
                  </div>
                  {user.role !== "super_admin" && (
                    <button onClick={leaveTeam} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-red-400 hover:border-red-400/50 px-3 py-1.5 rounded-lg font-semibold transition-colors">
                      <LogIn size={13} className="rotate-180" /> {tr("org.leaveTeam")}
                    </button>
                  )}
                </div>

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
                              <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                {u.display_name || u.email}
                                {u.role === "owner" && <CheckCircle2 size={12} className="text-[var(--color-primary)]" aria-label="Primary owner" />}
                                {isSelf && <span className="text-[10px] text-[var(--color-muted)] font-normal">(you)</span>}
                              </p>
                              <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate flex items-center gap-2">
                                {u.status === "suspended"
                                  ? <span className="text-red-400">Suspended</span>
                                  : u.first_login
                                    ? <span className="text-yellow-500">Awaiting first login</span>
                                    : <span className="text-green-500">Active</span>}
                                <span>· last seen {relTime(u.last_login_at)}</span>
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
                            {isOwner && !isSelf && u.role !== "owner" && u.role !== "super_admin" && (
                              <button onClick={() => makeOwner(u)} className="text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors p-1" title="Make owner (backup admin)">
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                            {!isSelf && (
                              <button onClick={() => handleRemove(u)} className="text-[var(--color-muted)] hover:text-red-400 transition-colors p-1" title="Remove from workspace">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {users.length === 0 && (
                      <p className="py-8 text-center text-sm text-[var(--color-muted)]">No team members yet - invite your finance person, accountant or sales staff above.</p>
                    )}
                  </div>
                )}
              </div>

              <JoinCompanyCard />
            </>
          )}

          {tab === "access" && (
            <>
              <PermissionMatrixCard />

              {/* Stakeholder Views & Permissions */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
                    <SlidersHorizontal size={15} className="text-[var(--color-primary)]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">{tr("org.stakeholderViews")}</h2>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">See the app exactly as each role does, and control which pages each one can open.</p>
                  </div>
                </div>

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

              <ApprovalPolicyCard />

              {/* Role reference */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
                <h2 className="text-sm font-semibold mb-1">{tr("org.whatEachRoleCanDo")}</h2>
                <p className="text-xs text-[var(--color-muted)] mb-4">Pick the role that matches the person's job. You can change it anytime from the Members list.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ASSIGNABLE_ROLES.map(meta => (
                    <div key={meta.id} className="border border-[var(--color-border)] rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.badge}`}>{meta.label}</span>
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
            </>
          )}

          {tab === "billing" && <BillingCard />}

          {tab === "company" && (
            <>
              <CompanyProfileCard />

              {/* Business profile (industry / risk threshold) */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
                <h2 className="text-sm font-semibold mb-1">{tr("org.businessProfile")}</h2>
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
                      Safety threshold - alert when runway drops below <span className="text-[var(--color-text)] font-semibold">{safetyDays} days</span>
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
                  <Save size={13} /> {firmSaving ? "Saving…" : tr("org.saveProfile")}
                </button>
              </div>

              {/* GST */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
                <h2 className="text-sm font-semibold mb-1">{tr("org.gstSettings")}</h2>
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
                          placeholder="22AAAAA0000A1Z5" maxLength={15}
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
                      show it in your tax calendar and forecast obligations. Actual liability is lower after input tax credit - this is a planning estimate.
                    </div>
                  )}
                </div>
                <button onClick={handleSaveGst} disabled={gstSaving}
                  className="mt-5 flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40">
                  <Save size={13} /> {gstSaving ? "Saving…" : tr("org.saveGstSettings")}
                </button>
              </div>

              {/* Tenant ID */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
                <h2 className="text-sm font-semibold mb-1">{tr("org.tenantId")}</h2>
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

              <LocationsCard />
            </>
          )}

          {tab === "audit" && (
            <>
              <BooksLockCard />
              <AuditLogCard />
              <OrgActivityCard />
              <DataRetentionCard />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
