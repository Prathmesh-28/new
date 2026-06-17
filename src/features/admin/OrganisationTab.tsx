import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Building2, Users, Plug, AlertTriangle, Image as ImageIcon,
  Trash2, Download, RefreshCw, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { roleLabel, roleBadge } from "@/data/roles";

// ── Response shapes (per the admin org endpoints) ───────────────────────────
interface Seats {
  plan: string | null;
  used: number | null;
  limit: number | null;
  full: boolean | null;
  remaining: number | null;
  nextPlan: string | null;
}
interface OrgProfile {
  tenant_id: string | null;
  company_name: string | null;
  legal_name: string | null;
  logo_url: string | null;
  timezone: string | null;
  fiscal_year_start: string | null;
  base_currency: string | null;
  industry: string | null;
  gstin: string | null;
  pan: string | null;
  company_size: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  role_permissions: PermMatrix | null;
  status: string | null;
  seats: Seats | null;
}
interface TeamMember {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  first_login: boolean | null;
  status: string | null;
  last_login_at: string | null;
}
type PermMatrix = Record<string, Record<string, boolean>>;

// ── Select option catalogues ────────────────────────────────────────────────
const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC",
];
const FY_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CURRENCIES = ["INR", "USD", "EUR", "AED", "SGD"];
const INDUSTRIES = ["Manufacturing", "SaaS", "Retail", "Services", "F&B", "Other"];

// ── Permission matrix definition ─────────────────────────────────────────────
const MATRIX_ROLES = [
  "owner", "finance_manager", "accountant", "sales", "operations_manager", "viewer", "investor",
];
const MATRIX_TABS: { id: string; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "forecast", label: "Forecast" },
  { id: "credit", label: "Credit" },
  { id: "payroll", label: "Payroll" },
  { id: "gst", label: "GST" },
  { id: "admin", label: "Admin" },
];

// Reasonable defaults: everyone gets everything except admin (owner only); the
// viewer is read-only so it only reaches dashboard + forecast.
function defaultMatrix(): PermMatrix {
  const m: PermMatrix = {};
  for (const role of MATRIX_ROLES) {
    m[role] = {};
    for (const tab of MATRIX_TABS) {
      if (tab.id === "admin") m[role][tab.id] = role === "owner";
      else if (role === "viewer") m[role][tab.id] = tab.id === "dashboard" || tab.id === "forecast";
      else m[role][tab.id] = true;
    }
  }
  return m;
}

function rolesEqual(a: Record<string, boolean> | undefined, b: Record<string, boolean>): boolean {
  if (!a) return false;
  return MATRIX_TABS.every(t => !!a[t.id] === !!b[t.id]);
}

// "3d ago" / "2h ago" / "Never" — compact last-seen labels.
function relTime(iso?: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "Never";
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type SaveState = "idle" | "saving" | "saved" | "error";

const skeleton = (w: string) => (
  <div className={`h-9 ${w} rounded-lg bg-[var(--color-border)]/60 animate-pulse`} />
);

const cardCls = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6";
const inputCls = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] text-[var(--color-text)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";

export default function OrganisationTab() {
  const { selectedClientTenantId, store } = useApp();
  const q = selectedClientTenantId ? `?tenant_id=${encodeURIComponent(selectedClientTenantId)}` : "";
  // tenant_id to include in PATCH/DELETE bodies (omit the field when not in client view)
  const tenantBody = selectedClientTenantId ? { tenant_id: selectedClientTenantId } : {};

  // ── Profile (Workspace card) ───────────────────────────────────────────────
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const profileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Team + matrix ──────────────────────────────────────────────────────────
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [matrix, setMatrix] = useState<PermMatrix>(defaultMatrix);
  const matrixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Load profile ───────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const p = await api.get<OrgProfile>(`/api/admin/org${q}`);
      setProfile(p);
      if (p.role_permissions && typeof p.role_permissions === "object") {
        // Merge stored permissions over defaults so missing roles/tabs stay sensible.
        const base = defaultMatrix();
        for (const role of MATRIX_ROLES) {
          for (const tab of MATRIX_TABS) {
            const stored = p.role_permissions[role]?.[tab.id];
            if (typeof stored === "boolean") base[role][tab.id] = stored;
          }
        }
        setMatrix(base);
      }
    } catch {
      toast.error("Couldn't load organisation profile.");
    } finally {
      setLoadingProfile(false);
    }
  }, [q]);

  const loadTeam = useCallback(async () => {
    setLoadingTeam(true);
    try {
      const rows = await api.get<TeamMember[]>(`/api/admin/org/team${q}`);
      setTeam(Array.isArray(rows) ? rows : []);
    } catch {
      toast.error("Couldn't load team members.");
    } finally {
      setLoadingTeam(false);
    }
  }, [q]);

  useEffect(() => { loadProfile(); loadTeam(); }, [loadProfile, loadTeam]);
  useEffect(() => () => {
    if (profileTimer.current) clearTimeout(profileTimer.current);
    if (matrixTimer.current) clearTimeout(matrixTimer.current);
  }, []);

  // ── Debounced profile auto-save (600ms) ────────────────────────────────────
  const patchField = (field: keyof OrgProfile, value: string) => {
    setProfile(prev => (prev ? { ...prev, [field]: value } : prev));
    setSaveState("saving");
    if (profileTimer.current) clearTimeout(profileTimer.current);
    profileTimer.current = setTimeout(async () => {
      try {
        const updated = await api.patch<OrgProfile>("/api/admin/org", { ...tenantBody, [field]: value });
        // Keep tenant_id/seats fresh but don't stomp the user's in-flight typing.
        setProfile(prev => (prev ? { ...prev, ...updated } : updated));
        setSaveState("saved");
      } catch {
        setSaveState("error");
        toast.error("Couldn't save workspace changes.");
      }
    }, 600);
  };

  // ── Debounced permission-matrix save (600ms) ───────────────────────────────
  const persistMatrix = (next: PermMatrix) => {
    if (matrixTimer.current) clearTimeout(matrixTimer.current);
    matrixTimer.current = setTimeout(async () => {
      try {
        await api.patch("/api/admin/org/permissions", { ...tenantBody, permissions: next });
      } catch {
        toast.error("Couldn't save permission changes.");
      }
    }, 600);
  };
  const toggleCell = (role: string, tab: string) => {
    setMatrix(prev => {
      const next: PermMatrix = { ...prev, [role]: { ...prev[role], [tab]: !prev[role]?.[tab] } };
      persistMatrix(next);
      return next;
    });
  };

  // ── Remove a team member ───────────────────────────────────────────────────
  const confirmRemove = async () => {
    if (!removeTarget) return;
    const u = removeTarget;
    setRemoveTarget(null);
    try {
      await api.delete(`/api/admin/team/${encodeURIComponent(u.id)}`);
      toast.success(`${u.display_name || u.email} removed`);
      loadTeam();
    } catch {
      toast.error("Couldn't remove that member.");
    }
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api.get<unknown>(`/api/admin/org/export${q}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `org-export-${(profile?.company_name || "headroom").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed — please try again.");
    } finally {
      setExporting(false);
    }
  };

  // ── Delete the whole organisation ──────────────────────────────────────────
  const orgName = profile?.company_name || "";
  const canDelete = orgName.length > 0 && deleteConfirm.trim() === orgName.trim();
  const deleteOrg = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/org${q}`);
      toast.success("Organisation deleted");
      setShowDelete(false);
      setDeleteConfirm("");
      setProfile(null);
      setTeam([]);
    } catch {
      toast.error("Couldn't delete the organisation.");
    } finally {
      setDeleting(false);
    }
  };

  // Connectors (read-only, from store)
  const connectors = Array.isArray((store as { connectors?: unknown[] }).connectors)
    ? ((store as { connectors?: unknown[] }).connectors as Array<{
        id?: string; label?: string; accountName?: string; status?: string; lastSync?: string | null;
      }>)
    : [];

  const SavePill = () => {
    if (saveState === "saving") return <span className="text-[11px] font-medium text-[var(--color-muted)]">Saving…</span>;
    if (saveState === "saved") return <span className="text-[11px] font-semibold text-green-400">Saved ✓</span>;
    if (saveState === "error") return <span className="text-[11px] font-semibold text-red-400">Save failed</span>;
    return null;
  };

  return (
    <div className="space-y-6">
      {/* ── A) Workspace ───────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
              <Building2 size={16} className="text-[var(--color-primary)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Workspace</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Organisation identity and regional defaults. Changes save automatically.</p>
            </div>
          </div>
          <SavePill />
        </div>

        {loadingProfile ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {skeleton("w-full")}{skeleton("w-full")}{skeleton("w-full")}{skeleton("w-full")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Organisation name</label>
              <input value={profile?.company_name ?? ""} onChange={e => patchField("company_name", e.target.value)}
                placeholder="Acme Pvt Ltd" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Logo URL</label>
              <div className="flex items-center gap-2">
                <input value={profile?.logo_url ?? ""} onChange={e => patchField("logo_url", e.target.value)}
                  placeholder="https://…/logo.png" className={inputCls} />
                <div className="w-9 h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-center overflow-hidden shrink-0">
                  {profile?.logo_url
                    ? <img src={profile.logo_url} alt="Logo" className="w-full h-full object-contain"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : <ImageIcon size={15} className="text-[var(--color-muted)]" />}
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>Primary timezone</label>
              <select value={profile?.timezone ?? "Asia/Kolkata"} onChange={e => patchField("timezone", e.target.value)} className={inputCls}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz === "Asia/Kolkata" ? "IST — Asia/Kolkata" : tz}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Fiscal year start month</label>
              <select value={profile?.fiscal_year_start ?? "April"} onChange={e => patchField("fiscal_year_start", e.target.value)} className={inputCls}>
                {FY_MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Base currency</label>
              <select value={profile?.base_currency ?? "INR"} onChange={e => patchField("base_currency", e.target.value)} className={inputCls}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Industry vertical</label>
              <select value={profile?.industry ?? "Other"} onChange={e => patchField("industry", e.target.value)} className={inputCls}>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── B) Team & Roles ────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
            <Users size={16} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Team &amp; Roles</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Members of this workspace and what each role can reach.</p>
          </div>
        </div>

        {/* Team list */}
        {loadingTeam ? (
          <div className="space-y-2">{skeleton("w-full")}{skeleton("w-full")}{skeleton("w-full")}</div>
        ) : team.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-lg">
            No team members yet.
          </p>
        ) : (
          <div className="space-y-2">
            {team.map(u => {
              const name = u.display_name || u.email;
              return (
                <div key={u.id} className="flex items-center justify-between gap-3 p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] flex items-center justify-center text-xs font-semibold shrink-0">
                      {initials(name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">{name}</p>
                      <p className="text-xs text-[var(--color-muted)] truncate">
                        {u.email}{u.last_login_at !== undefined ? <span className="ml-1.5">· {relTime(u.last_login_at)}</span> : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${roleBadge(u.role)}`}>
                      {roleLabel(u.role)}
                    </span>
                    <button onClick={() => setRemoveTarget(u)} title="Remove member"
                      className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors px-1.5 py-1">
                      <Trash2 size={13} /> <span className="hidden sm:inline">Remove</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Permission matrix */}
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">Role permissions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[560px]">
              <thead>
                <tr>
                  <th className="text-left font-semibold text-[var(--color-muted)] uppercase tracking-wider py-2 pr-3">Role</th>
                  {MATRIX_TABS.map(t => (
                    <th key={t.id} className="text-center font-semibold text-[var(--color-muted)] py-2 px-2 whitespace-nowrap">{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {MATRIX_ROLES.map(role => {
                  const custom = !rolesEqual(matrix[role], defaultMatrix()[role]);
                  return (
                    <tr key={role}>
                      <td className="py-2.5 pr-3 text-[var(--color-text)] whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {roleLabel(role)}
                          {custom && (
                            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full border bg-[var(--color-primary)]/15 text-[var(--color-primary)] border-[var(--color-primary)]/30">
                              Custom
                            </span>
                          )}
                        </span>
                      </td>
                      {MATRIX_TABS.map(t => (
                        <td key={t.id} className="text-center py-2.5 px-2">
                          <input type="checkbox" checked={!!matrix[role]?.[t.id]} onChange={() => toggleCell(role, t.id)}
                            aria-label={`${roleLabel(role)} — ${t.label}`}
                            className="accent-[var(--color-primary)] w-4 h-4 cursor-pointer" />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── C) Integrations & Connectors ───────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
            <Plug size={16} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Integrations &amp; Connectors</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Bank, gateway, POS and accounting feeds linked to this workspace.</p>
          </div>
        </div>

        {connectors.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-lg">
            No connectors linked yet.
          </p>
        ) : (
          <div className="space-y-2">
            {connectors.map((c, i) => {
              const dot = c.status === "connected" ? "bg-green-400"
                : c.status === "error" ? "bg-red-400" : "bg-[var(--color-muted)]";
              return (
                <div key={c.id || i} className="flex items-center justify-between gap-3 p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">{c.label || c.accountName || "Connector"}</p>
                      {c.lastSync && <p className="text-xs text-[var(--color-muted)] truncate">Last sync {relTime(c.lastSync)}</p>}
                    </div>
                  </div>
                  <button onClick={() => toast.success("Disconnected")}
                    className="text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors px-2 py-1 shrink-0">
                    Disconnect
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <Link to="/connectors" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] hover:opacity-80">
          <Plus size={13} /> Add connector →
        </Link>
      </div>

      {/* ── D) Danger Zone ─────────────────────────────────────────────────── */}
      <div className="bg-[var(--color-surface)] border border-red-800/40 rounded-lg p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg bg-red-900/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-red-400">Danger Zone</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Irreversible and high-impact actions.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 border-b border-[var(--color-border)]">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text)]">Export all data</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Download a full JSON snapshot of this organisation.</p>
          </div>
          <button onClick={exportData} disabled={exporting}
            className="flex items-center gap-1.5 text-sm font-semibold border border-[var(--color-border)] text-[var(--color-text)] px-4 py-2 rounded-lg hover:bg-white/5 disabled:opacity-50 shrink-0">
            {exporting ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text)]">Delete organisation</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">All data — users, transactions, settings — will be permanently deleted. This cannot be undone.</p>
          </div>
          <button onClick={() => { setDeleteConfirm(""); setShowDelete(true); }}
            className="flex items-center gap-1.5 text-sm font-semibold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shrink-0">
            <Trash2 size={13} /> Delete organisation
          </button>
        </div>
      </div>

      {/* ── Remove member confirmation modal ───────────────────────────────── */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRemoveTarget(null)}>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Remove member</h3>
            <p className="text-xs text-[var(--color-muted)] mt-2">
              Remove <strong className="text-[var(--color-text)]">{removeTarget.display_name || removeTarget.email}</strong> from this workspace? They'll immediately lose access.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setRemoveTarget(null)}
                className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-white/5">Cancel</button>
              <button onClick={confirmRemove}
                className="text-sm font-semibold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">Yes, delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete organisation modal ──────────────────────────────────────── */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowDelete(false)}>
          <div className="bg-[var(--color-surface)] border border-red-800/40 rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
              <AlertTriangle size={15} /> Delete organisation
            </h3>
            <p className="text-xs text-[var(--color-muted)] mt-3">
              All data — users, transactions, settings — will be permanently deleted. This cannot be undone.
            </p>
            <label className="text-xs text-[var(--color-muted)] block mt-4 mb-1">
              Type <strong className="text-[var(--color-text)] font-mono">{orgName || "the organisation name"}</strong> to confirm
            </label>
            <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={orgName}
              className={inputCls} autoFocus />
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowDelete(false)}
                className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-white/5">Cancel</button>
              <button onClick={deleteOrg} disabled={!canDelete || deleting}
                className="text-sm font-semibold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
