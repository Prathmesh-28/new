import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import {
  BarChart3, RefreshCw, Wallet, TrendingUp, TrendingDown, Coins,
  Target, Briefcase, Trophy, Users, Receipt, LayoutDashboard, Plus,
  Trash2, X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (inline, TS strict)
// ─────────────────────────────────────────────────────────────────────────────
interface FinanceBlock {
  income: string;
  expense: string;
  netProfit: string;
  cash: string;
}
interface SalesBlock {
  pipelineWeighted: number;
  openDeals: number;
  wonValue: number;
}
interface PeopleBlock {
  headcount: number;
  lastPayrollNet: string;
}
interface Overview {
  financialYear: string;
  finance: FinanceBlock;
  sales: SalesBlock;
  people: PeopleBlock;
}

interface Metric {
  key: string;
  label: string;
  group: string;
}

interface DashboardWidget {
  metric: string;
  title: string;
}
interface Dashboard {
  id: string;
  name: string;
  widgets: DashboardWidget[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function currentFY(): string {
  const y = new Date().getFullYear();
  const m = new Date().getMonth();
  return m >= 3
    ? `${y}-${String((y + 1) % 100).padStart(2, "0")}`
    : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

function errMsg(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Failed";
}

// Parse a string/number amount into a finite number (chart + KPI use only).
function toNum(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtINR(v: string | number | null | undefined): string {
  return toNum(v).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function fmtNum(v: number | null | undefined): string {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return n.toLocaleString("en-IN");
}

// Resolve a metric key against the loaded overview into a display value.
function metricValue(key: string, ov: Overview | null): { value: string; money: boolean } {
  if (!ov) return { value: "—", money: false };
  switch (key) {
    case "income":           return { value: fmtINR(ov.finance.income), money: true };
    case "expense":          return { value: fmtINR(ov.finance.expense), money: true };
    case "netProfit":        return { value: fmtINR(ov.finance.netProfit), money: true };
    case "cash":             return { value: fmtINR(ov.finance.cash), money: true };
    case "pipelineWeighted": return { value: fmtINR(ov.sales.pipelineWeighted), money: true };
    case "openDeals":        return { value: fmtNum(ov.sales.openDeals), money: false };
    case "wonValue":         return { value: fmtINR(ov.sales.wonValue), money: true };
    case "headcount":        return { value: fmtNum(ov.people.headcount), money: false };
    case "lastPayrollNet":   return { value: fmtINR(ov.people.lastPayrollNet), money: true };
    default:                 return { value: "—", money: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE BITS
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, money, icon,
}: {
  label: string;
  value: string;
  money?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 min-w-[150px] flex-1">
      <div className="flex items-center gap-1.5 mb-1 text-[var(--color-muted)]">
        {icon}
        <p className="text-[11px]">{label}</p>
      </div>
      <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">
        {money ? value : value}
      </p>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 min-w-[150px] flex-1">
      <div className="h-3 w-20 rounded bg-[var(--color-border)] animate-pulse mb-2" />
      <div className="h-5 w-24 rounded bg-[var(--color-border)] animate-pulse" />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-2 mt-4">
      {children}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const { user } = useAuth();

  const [fy, setFy] = useState<string>(currentFY());
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ovLoading, setOvLoading] = useState(true);

  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [openDash, setOpenDash] = useState<string | null>(null);

  // New-dashboard form state.
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Fetch overview (re-runs when FY changes) ─────────────────────────────────
  const loadOverview = useCallback(async (year: string) => {
    setOvLoading(true);
    try {
      const ov = await api.get<Overview>(`/api/insights/overview?fy=${encodeURIComponent(year)}`);
      setOverview(ov ?? null);
    } catch (e) {
      toast.error(errMsg(e));
      setOverview(null);
    } finally {
      setOvLoading(false);
    }
  }, []);

  // ── Fetch metrics + dashboards ───────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([
        api.get<Metric[]>("/api/insights/metrics"),
        api.get<Dashboard[]>("/api/insights/dashboards"),
      ]);
      setMetrics(Array.isArray(m) ? m : []);
      setDashboards(Array.isArray(d) ? d : []);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void loadOverview(fy);
  }, [fy, loadOverview]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  // ── Mutations (reload after) ─────────────────────────────────────────────────
  const createDashboard = useCallback(async () => {
    const name = newName.trim();
    if (!name) { toast.error("Name the dashboard first"); return; }
    if (picked.length === 0) { toast.error("Pick at least one metric"); return; }
    setSaving(true);
    try {
      const widgets: DashboardWidget[] = picked.map((key) => {
        const m = metrics.find((x) => x.key === key);
        return { metric: key, title: m ? m.label : key };
      });
      await api.post("/api/insights/dashboards", { name, widgets });
      toast.success("Dashboard created");
      setNewName("");
      setPicked([]);
      setShowForm(false);
      await loadMeta();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }, [newName, picked, metrics, loadMeta]);

  const deleteDashboard = useCallback(async (id: string) => {
    if (!window.confirm("Delete this dashboard?")) return;
    try {
      await api.delete(`/api/insights/dashboards/${id}`);
      toast.success("Dashboard deleted");
      if (openDash === id) setOpenDash(null);
      await loadMeta();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [openDash, loadMeta]);

  const togglePick = useCallback((key: string) => {
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }, []);

  // ── Chart data ("Where the money is") ────────────────────────────────────────
  const chartData = overview
    ? [
        { name: "Income", value: toNum(overview.finance.income) },
        { name: "Expense", value: toNum(overview.finance.expense) },
        { name: "Net Profit", value: toNum(overview.finance.netProfit) },
        { name: "Cash", value: toNum(overview.finance.cash) },
      ]
    : [];

  // Group metrics for the picker.
  const metricGroups = metrics.reduce<Record<string, Metric[]>>((acc, m) => {
    const g = m.group || "Other";
    (acc[g] ||= []).push(m);
    return acc;
  }, {});

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* HEADER */}
      <div className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 sm:px-6 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 size={20} className="text-[var(--color-primary)]" />
              Insights
            </h1>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Cross-module analytics{user?.email ? ` · ${user.email}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-muted)]">FY</label>
            <input
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              placeholder="2026-27"
              className="w-28 px-2.5 py-1.5 text-sm rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none tabular-nums"
            />
            <button
              type="button"
              onClick={() => void loadOverview(fy)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-primary)] transition-colors"
            >
              <RefreshCw size={13} className={ovLoading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 pb-10">
        {/* COMPANY AT A GLANCE */}
        <h2 className="text-sm font-semibold">Company at a glance</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          {overview ? `Financial year ${overview.financialYear}` : `Financial year ${fy}`}
        </p>

        {/* Finance */}
        <SectionLabel>Finance</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {ovLoading ? (
            <>
              <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
            </>
          ) : (
            <>
              <KpiCard label="Net Profit" money value={fmtINR(overview?.finance.netProfit)} icon={<TrendingUp size={13} />} />
              <KpiCard label="Income" money value={fmtINR(overview?.finance.income)} icon={<Coins size={13} />} />
              <KpiCard label="Expense" money value={fmtINR(overview?.finance.expense)} icon={<TrendingDown size={13} />} />
              <KpiCard label="Cash" money value={fmtINR(overview?.finance.cash)} icon={<Wallet size={13} />} />
            </>
          )}
        </div>

        {/* Sales */}
        <SectionLabel>Sales</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {ovLoading ? (
            <>
              <KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
            </>
          ) : (
            <>
              <KpiCard label="Weighted Pipeline" money value={fmtINR(overview?.sales.pipelineWeighted)} icon={<Target size={13} />} />
              <KpiCard label="Open Deals" value={fmtNum(overview?.sales.openDeals)} icon={<Briefcase size={13} />} />
              <KpiCard label="Won Value" money value={fmtINR(overview?.sales.wonValue)} icon={<Trophy size={13} />} />
            </>
          )}
        </div>

        {/* People */}
        <SectionLabel>People</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {ovLoading ? (
            <>
              <KpiSkeleton /><KpiSkeleton />
            </>
          ) : (
            <>
              <KpiCard label="Headcount" value={fmtNum(overview?.people.headcount)} icon={<Users size={13} />} />
              <KpiCard label="Last Payroll Net" money value={fmtINR(overview?.people.lastPayrollNet)} icon={<Receipt size={13} />} />
            </>
          )}
        </div>

        {/* WHERE THE MONEY IS */}
        <div className="mt-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-1">Where the money is</h3>
          <p className="text-xs text-[var(--color-muted)] mb-3">Income vs Expense vs Net Profit vs Cash</p>
          {ovLoading ? (
            <div className="h-[220px] rounded bg-[var(--color-border)]/40 animate-pulse" />
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <XAxis
                    type="number"
                    tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                    tickFormatter={(v: number) => fmtINR(v)}
                    stroke="var(--color-border)"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                    width={84}
                    stroke="var(--color-border)"
                  />
                  <Tooltip
                    cursor={{ fill: "var(--color-bg)" }}
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-text)",
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [fmtINR(v), "Amount"]}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={d.name}
                        fill={d.value < 0 ? "var(--color-muted)" : "var(--color-primary)"}
                        fillOpacity={i % 2 === 0 ? 1 : 0.7}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* SAVED DASHBOARDS */}
        <div className="mt-8 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <LayoutDashboard size={16} className="text-[var(--color-primary)]" />
            Saved dashboards
          </h2>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold hover:opacity-90 transition-opacity"
          >
            {showForm ? <X size={13} /> : <Plus size={13} />}
            {showForm ? "Cancel" : "New dashboard"}
          </button>
        </div>

        {/* NEW DASHBOARD FORM */}
        {showForm && (
          <div className="mt-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Dashboard name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Board summary"
              className="w-full max-w-sm mb-4 px-2.5 py-1.5 text-sm rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none"
            />

            <label className="block text-xs text-[var(--color-muted)] mb-2">Metrics</label>
            {metrics.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">No metrics available.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(metricGroups).map(([group, list]) => (
                  <div key={group}>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">{group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((m) => {
                        const on = picked.includes(m.key);
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => togglePick(m.key)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              on
                                ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                                : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                            }`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-4">
              <span className="mr-auto text-xs text-[var(--color-muted)] tabular-nums">
                {picked.length} selected
              </span>
              <button
                type="button"
                onClick={() => { setShowForm(false); setNewName(""); setPicked([]); }}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--color-border)] hover:bg-[var(--color-bg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void createDashboard()}
                className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Create"}
              </button>
            </div>
          </div>
        )}

        {/* DASHBOARD LIST */}
        <div className="mt-3 space-y-2">
          {dashboards.length === 0 ? (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 text-center">
              <LayoutDashboard size={26} className="mx-auto text-[var(--color-muted)] mb-2" />
              <p className="text-sm font-medium">No saved dashboards yet</p>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Create one to pin the metrics you care about.
              </p>
            </div>
          ) : (
            dashboards.map((d) => {
              const open = openDash === d.id;
              const widgets = Array.isArray(d.widgets) ? d.widgets : [];
              return (
                <div key={d.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOpenDash(open ? null : d.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-medium truncate">{d.name || "Untitled"}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {widgets.length === 0 ? (
                          <span className="text-[11px] text-[var(--color-muted)]">No metrics</span>
                        ) : (
                          widgets.map((w, i) => (
                            <span
                              key={`${w.metric}-${i}`}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]"
                            >
                              {w.title || w.metric}
                            </span>
                          ))
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      title="Delete dashboard"
                      onClick={() => void deleteDashboard(d.id)}
                      className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-red-400 flex-shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Opened: render chosen metrics as cards pulled from overview */}
                  {open && (
                    <div className="border-t border-[var(--color-border)] px-4 py-4">
                      {widgets.length === 0 ? (
                        <p className="text-xs text-[var(--color-muted)]">This dashboard has no metrics.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {widgets.map((w, i) => {
                            const mv = metricValue(w.metric, overview);
                            return (
                              <KpiCard
                                key={`${w.metric}-${i}`}
                                label={w.title || w.metric}
                                money={mv.money}
                                value={mv.value}
                                icon={<BarChart3 size={13} />}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
