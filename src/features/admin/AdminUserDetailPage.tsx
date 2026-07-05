import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import {
  ArrowLeft, KeyRound, Eye, Monitor, ScrollText,
} from "lucide-react";
import {
  relTime, fmtINR, roleLabel, avatarBg, initials, userStatus, PlanPill, RolePill, CopyId,
  type AdminUser, type Company,
} from "./AdminPage";

// A2/A3 (2026-07 gap audit): the "360 view" as a real routed page instead of a modal —
// adds device/session login history and a per-user slice of the audit trail alongside
// everything the old UserDetailModal already showed. See server.js's
// GET /api/admin/users/:id/detail for why "this user's own invoices" isn't here: invoices
// have no per-user attribution column in this schema, so there's nothing honest to show
// beyond the org-wide financials already on the user record.
interface LoginEvent { ip: string | null; user_agent: string | null; created_at: string }
interface AuditRow { id: string; action: string; entity: string | null; entity_id: string | null; meta: unknown; created_at: string; actor_email: string | null }
interface Detail { recentLogins: LoginEvent[]; auditTrail: AuditRow[] }

function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/iphone|ipad/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/mac os x/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows";
  if (/linux/i.test(ua)) return "Linux";
  return ua.slice(0, 40);
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();
  const { setSelectedClient, setPreviewRole } = useApp();
  const navigate = useNavigate();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetInfo, setResetInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [users, companies, d] = await Promise.all([
        api.get<AdminUser[]>("/api/users"),
        api.get<Company[]>("/api/admin/companies"),
        api.get<Detail>(`/api/admin/users/${id}/detail`),
      ]);
      const u = users.find((x) => x.id === id) || null;
      setUser(u);
      setCompany(u ? companies.find((c) => c.tenant_id === u.tenant_id) || null : null);
      setDetail(d);
    } catch {
      toast.error("Couldn't load user");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!me) return null;
  if (me.role !== "super_admin") return <Navigate to="/dashboard" replace />;

  const viewAs = async () => {
    if (!user) return;
    try {
      await api.post("/api/admin/preview-role", { targetUserId: user.id, role: user.role });
      setSelectedClient(user.tenant_id, user.display_name || user.email);
      setPreviewRole(user.role as Parameters<typeof setPreviewRole>[0]);
      toast.success(`Viewing as ${roleLabel(user.role)} — ${user.display_name || user.email}`);
      navigate("/dashboard");
    } catch {
      toast.error("Failed");
    }
  };

  const resetPassword = async () => {
    if (!user) return;
    try {
      const { password } = await api.post<{ password: string }>(`/api/admin/users/${user.id}/reset`, {});
      setResetInfo(password);
    } catch {
      toast.error("Failed to reset password");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
        <ArrowLeft size={13} /> Back to admin console
      </Link>

      {loading && <p className="text-sm text-[var(--color-muted)]">Loading…</p>}
      {!loading && !user && <p className="text-sm text-[var(--color-muted)]">User not found.</p>}

      {user && (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className={`w-12 h-12 rounded-full ${avatarBg(user.email)} text-white text-base font-semibold flex items-center justify-center shrink-0`}>{initials(user)}</span>
                <div>
                  <p className="font-semibold text-lg flex items-center gap-1.5">
                    {user.display_name || user.email.split("@")[0]}
                    {user.id === me.id && <span className="text-[10px] text-[var(--color-muted)] font-normal">(you)</span>}
                  </p>
                  <p className="text-sm text-[var(--color-muted)]">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <RolePill role={user.role} />
                <PlanPill plan={user.subscription_plan ?? "free"} />
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><dt className="text-xs text-[var(--color-muted)]">Status</dt><dd className="mt-0.5">{userStatus(user) === "active" ? "Active" : userStatus(user) === "pending" ? "Pending setup" : "Suspended"}</dd></div>
              <div><dt className="text-xs text-[var(--color-muted)]">Workspace</dt><dd className="mt-0.5"><CopyId id={user.tenant_id} chars={20} /></dd></div>
              <div><dt className="text-xs text-[var(--color-muted)]">Company</dt><dd className="mt-0.5">{company?.company_name || "-"}</dd></div>
              <div><dt className="text-xs text-[var(--color-muted)]">Joined</dt><dd className="mt-0.5">{format(new Date(user.created_at), "d MMM yyyy")}</dd></div>
              <div><dt className="text-xs text-[var(--color-muted)]">Total logins</dt><dd className="mt-0.5">{user.login_count ?? 0}</dd></div>
              <div><dt className="text-xs text-[var(--color-muted)]">Last active</dt><dd className="mt-0.5">{relTime(user.last_active_at)}</dd></div>
              {company && (
                <>
                  <div><dt className="text-xs text-[var(--color-muted)]">Org cash</dt><dd className="mt-0.5 tabular-nums">{fmtINR(company.cash)}</dd></div>
                  <div><dt className="text-xs text-[var(--color-muted)]">Org revenue</dt><dd className="mt-0.5 tabular-nums">{fmtINR(company.revenue)}</dd></div>
                  <div><dt className="text-xs text-[var(--color-muted)]">Billing</dt><dd className="mt-0.5">{company.billing_provider ? `${company.billing_provider}${company.billing_status ? ` · ${company.billing_status}` : ""}` : "Never billed"}</dd></div>
                </>
              )}
            </dl>

            <div className="flex justify-end gap-2 mt-5 flex-wrap">
              {user.id !== me.id && (
                <button onClick={viewAs} className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]`}>
                  <Eye size={13} /> View as {roleLabel(user.role)}
                </button>
              )}
              <button onClick={resetPassword} className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]`}>
                <KeyRound size={13} /> Reset password
              </button>
            </div>
            {resetInfo && (
              <div className="mt-3 text-xs rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-bg)]">
                Temporary password: <code className="font-mono text-[var(--color-primary)]">{resetInfo}</code> — share this with the user directly; it isn't emailed.
              </div>
            )}
          </div>

          {/* A3: real device/session history, not just a single last-login timestamp */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Monitor size={15} className="text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold">Login history</h2>
            </div>
            {!detail?.recentLogins.length ? (
              <p className="text-xs text-[var(--color-muted)]">No recorded logins yet (login history capture started 2026-07 — earlier sessions aren't retroactively available).</p>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {detail.recentLogins.map((l, i) => (
                  <div key={i} className="flex items-center justify-between py-2 text-xs gap-3">
                    <span className="text-[var(--color-text)]">{deviceLabel(l.user_agent)}</span>
                    <span className="text-[var(--color-muted)] font-mono">{l.ip || "-"}</span>
                    <span className="text-[var(--color-muted)] shrink-0">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* A2: per-user slice of the audit trail — actions this user took, and actions
              taken ON this user by an admin (role/plan changes, resets, preview-role, etc). */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <ScrollText size={15} className="text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold">Audit trail</h2>
            </div>
            {!detail?.auditTrail.length ? (
              <p className="text-xs text-[var(--color-muted)]">No recorded actions for this user yet.</p>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {detail.auditTrail.map((a) => (
                  <div key={a.id} className="py-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[var(--color-primary)]">{a.action}</span>
                      <span className="text-[var(--color-muted)] shrink-0">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                    </div>
                    {a.actor_email && <p className="text-[var(--color-muted)] mt-0.5">by {a.actor_email}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
