import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { Building2, ChevronDown, Check, Globe, Search, Loader2 } from "lucide-react";

interface Company {
  tenant_id: string;
  company_name: string | null;
  owner_email: string | null;
  user_count: number;
  cash?: number;
}

/* Platform super_admin only — switch the whole app to view/manage any company's
   data. Reuses setSelectedClient (super_admin can read+write any tenant via the
   KV role gate). Renders nothing for every other role. */
export default function TenantSwitcher() {
  const { user } = useAuth();
  const { selectedClientTenantId, selectedClientLabel, setSelectedClient } = useApp();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const isSuper = user?.role === "super_admin";

  useEffect(() => {
    if (!isSuper) return;
    setLoading(true);
    api.get<Company[]>("/api/admin/companies")
      .then(rows => setCompanies(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isSuper]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return companies;
    return companies.filter(c =>
      (c.company_name || "").toLowerCase().includes(t) ||
      (c.owner_email || "").toLowerCase().includes(t) ||
      c.tenant_id.toLowerCase().includes(t));
  }, [companies, q]);

  if (!isSuper) return null;

  const label = (c: Company) => c.company_name || c.owner_email || c.tenant_id;
  const current = selectedClientTenantId ? (selectedClientLabel || "Selected company") : "Platform view — all companies";

  const pick = (c: Company | null) => {
    if (c) setSelectedClient(c.tenant_id, label(c));
    else setSelectedClient(null);
    setOpen(false);
    setQ("");
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
            <div className="absolute left-0 top-full mt-1 z-40 w-80 max-w-[90vw] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xl overflow-hidden">
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
              <div className="max-h-72 overflow-y-auto">
                <button onClick={() => pick(null)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-white/5 border-b border-[var(--color-border)]">
                  <span className="flex items-center gap-2"><Globe size={14} className="text-[var(--color-primary)]" /> Platform view (all)</span>
                  {!selectedClientTenantId && <Check size={14} className="text-[var(--color-primary)]" />}
                </button>
                {loading && <div className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--color-muted)]"><Loader2 size={13} className="animate-spin" /> Loading companies…</div>}
                {!loading && filtered.length === 0 && <p className="px-3 py-4 text-xs text-[var(--color-muted)]">No companies match.</p>}
                {filtered.map(c => (
                  <button key={c.tenant_id} onClick={() => pick(c)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/5">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate text-[var(--color-text)]">{label(c)}</span>
                      <span className="block text-[11px] text-[var(--color-muted)] truncate">
                        {c.owner_email && c.company_name ? c.owner_email + " · " : ""}{c.user_count} user{c.user_count === 1 ? "" : "s"}
                      </span>
                    </span>
                    {selectedClientTenantId === c.tenant_id && <Check size={14} className="text-[var(--color-primary)] shrink-0" />}
                  </button>
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
