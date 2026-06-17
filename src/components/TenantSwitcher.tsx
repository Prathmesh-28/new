import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Building2, ChevronDown, Check, Globe, Search, Loader2, Eye, SlidersHorizontal } from "lucide-react";
import { PLAN_LABEL, type PlanTier } from "@/data/types";

interface Company {
  tenant_id: string;
  company_name: string | null;
  owner_email: string | null;
  user_count: number;
  cash?: number;
  plan?: PlanTier;
  status?: string;
}

// Plan colour so you can read who's on what at a glance (= what they can access).
const PLAN_STYLE: Record<string, string> = {
  pro:     "bg-purple-900/40 text-purple-300 border-purple-700/50",
  growth:  "bg-blue-900/40 text-blue-300 border-blue-700/50",
  starter: "bg-amber-900/40 text-amber-300 border-amber-700/50",
  free:    "bg-white/5 text-[var(--color-muted)] border-[var(--color-border)]",
};
const PLANS: PlanTier[] = ["free", "starter", "growth", "pro"];

/* Platform super_admin only — switch the whole app to view/manage any company's
   data, filter by plan, and change a plan inline. Renders nothing for other roles. */
export default function TenantSwitcher() {
  const { user } = useAuth();
  const { selectedClientTenantId, selectedClientLabel, setSelectedClient } = useApp();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | PlanTier>("all");
  const isSuper = user?.role === "super_admin";

  useEffect(() => {
    if (!isSuper) return;
    setLoading(true);
    api.get<Company[]>("/api/admin/companies")
      .then(rows => setCompanies(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isSuper]);

  const counts = useMemo(() => {
    const by: Record<string, number> = { all: companies.length, free: 0, starter: 0, growth: 0, pro: 0 };
    let users = 0, paid = 0;
    for (const c of companies) {
      const p = c.plan || "free";
      by[p] = (by[p] || 0) + 1;
      users += c.user_count || 0;
      if (p !== "free") paid += 1;
    }
    return { by, users, paid };
  }, [companies]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return companies.filter(c => {
      if (planFilter !== "all" && (c.plan || "free") !== planFilter) return false;
      if (!t) return true;
      return (c.company_name || "").toLowerCase().includes(t) ||
        (c.owner_email || "").toLowerCase().includes(t) ||
        c.tenant_id.toLowerCase().includes(t);
    });
  }, [companies, q, planFilter]);

  if (!isSuper) return null;

  const label = (c: Company) => c.company_name || c.owner_email || c.tenant_id;
  const current = selectedClientTenantId ? (selectedClientLabel || "Selected company") : "Platform view — all companies";

  const pick = (c: Company | null) => {
    if (c) setSelectedClient(c.tenant_id, label(c)); else setSelectedClient(null);
    setOpen(false); setQ("");
  };
  const manage = (c: Company) => { setSelectedClient(c.tenant_id, label(c)); setOpen(false); navigate("/admin"); };
  const setPlan = async (tid: string, plan: PlanTier) => {
    try {
      await api.post(`/api/admin/tenants/${tid}/plan`, { plan });
      setCompanies(prev => prev.map(c => c.tenant_id === tid ? { ...c, plan } : c));
      toast.success(`Plan → ${PLAN_LABEL[plan]}`);
    } catch { toast.error("Failed to set plan"); }
  };

  return (
    <div className="bg-purple-950/40 border-b border-purple-800/40 px-4 py-2 flex items-center gap-3">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-purple-300 shrink-0">
        <Globe size={13} /> Super admin
      </span>
      <div className="relative flex-1 min-w-0">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full md:w-auto inline-flex items-center gap-2 max-w-full text-xs bg-purple-900/40 border border-purple-700/50 text-purple-100 px-3 py-1.5 rounded-lg hover:bg-purple-900/70 transition-colors"
        >
          <Building2 size={13} className="shrink-0" />
          <span className="truncate font-medium">{current}</span>
          <ChevronDown size={13} className="shrink-0 opacity-70" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-40 w-96 max-w-[92vw] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xl overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2">
                  <Search size={13} className="text-[var(--color-muted)]" />
                  <input
                    autoFocus value={q} onChange={e => setQ(e.target.value)}
                    placeholder="Search company or owner…"
                    className="flex-1 bg-transparent py-2 text-sm outline-none text-[var(--color-text)]"
                  />
                </div>
              </div>

              {/* Plan filter chips + summary */}
              <div className="px-2 py-2 border-b border-[var(--color-border)] space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {(["all", ...PLANS] as const).map(p => (
                    <button key={p} onClick={() => setPlanFilter(p as "all" | PlanTier)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${planFilter === p ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                      {p === "all" ? "All" : PLAN_LABEL[p as PlanTier]} ({counts.by[p] ?? 0})
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--color-muted)]">{companies.length} companies · {counts.users} users · {counts.paid} on paid plans</p>
              </div>

              <div className="max-h-72 overflow-y-auto">
                <button onClick={() => pick(null)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-white/5 border-b border-[var(--color-border)]">
                  <span className="flex items-center gap-2"><Globe size={14} className="text-[var(--color-primary)]" /> Platform view (all)</span>
                  {!selectedClientTenantId && <Check size={14} className="text-[var(--color-primary)]" />}
                </button>
                {loading && <div className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--color-muted)]"><Loader2 size={13} className="animate-spin" /> Loading companies…</div>}
                {!loading && visible.length === 0 && <p className="px-3 py-4 text-xs text-[var(--color-muted)]">No companies match.</p>}
                {visible.map(c => (
                  <div key={c.tenant_id} className={`flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-white/5 ${selectedClientTenantId === c.tenant_id ? "bg-[var(--color-primary)]/5" : ""}`}>
                    <button onClick={() => pick(c)} className="flex-1 min-w-0 text-left">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium truncate text-[var(--color-text)]">{label(c)}</span>
                        {c.status === "suspended" && <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full border bg-red-900/30 text-red-400 border-red-800/40 shrink-0">Suspended</span>}
                        {selectedClientTenantId === c.tenant_id && <Check size={12} className="text-[var(--color-primary)] shrink-0" />}
                      </span>
                      <span className="block text-[11px] text-[var(--color-muted)] truncate">
                        {c.owner_email && c.company_name ? c.owner_email + " · " : ""}{c.user_count} user{c.user_count === 1 ? "" : "s"}
                      </span>
                    </button>
                    <span className="flex items-center gap-1 shrink-0">
                      <select value={c.plan || "free"} onClick={e => e.stopPropagation()} onChange={e => setPlan(c.tenant_id, e.target.value as PlanTier)}
                        title="Set plan" className={`text-[9px] font-semibold uppercase tracking-wide rounded-full border px-1.5 py-0.5 outline-none cursor-pointer ${PLAN_STYLE[c.plan || "free"]}`}>
                        {PLANS.map(p => <option key={p} value={p} className="bg-[var(--color-surface)] text-[var(--color-text)] normal-case">{PLAN_LABEL[p]}</option>)}
                      </select>
                      <button onClick={() => pick(c)} title="Open company" className="p-1 text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Eye size={13} /></button>
                      <button onClick={() => manage(c)} title="Manage in admin console" className="p-1 text-[var(--color-muted)] hover:text-[var(--color-primary)]"><SlidersHorizontal size={13} /></button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {selectedClientTenantId && (
        <button onClick={() => pick(null)}
          className="text-[11px] font-semibold bg-purple-800/60 text-purple-100 border border-purple-600/50 px-2.5 py-1 rounded-md hover:bg-purple-800/90 whitespace-nowrap shrink-0">
          Exit to platform
        </button>
      )}
    </div>
  );
}
