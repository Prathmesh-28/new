import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis,
  ResponsiveContainer, Cell, Tooltip, Legend, CartesianGrid,
} from "recharts";
import {
  BarChart3, RefreshCw, Wallet, TrendingUp, TrendingDown, Coins,
  Target, Briefcase, Trophy, Users, Receipt, LayoutDashboard, Plus,
  Trash2, X, Database, Play, Save, Table as TableIcon,
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
  metric?: string;       // KPI widget
  chartId?: string;      // saved-chart widget
  title: string;
}
interface Dashboard {
  id: string;
  name: string;
  widgets: DashboardWidget[];
}

// Query engine types ----------------------------------------------------------
type AggKind = "none" | "sum" | "avg" | "min" | "max" | "count";
type OpKind = "=" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "like" | "between";
type ColType = "string" | "number" | "boolean" | "date" | "datetime";

interface DatasetColumn { column: string; type: ColType; }
interface Dataset {
  key: string;
  label: string;
  description: string;
  columns: DatasetColumn[];
}

interface QueryColumn { column?: string; aggregate: AggKind; }
// Builder-side filter: `value` is the raw text the user typed (comma lists for
// in/between). The stored/wire model uses StoredFilter where `value` may be an array.
interface QueryFilter { column: string; op: OpKind; value: string; }
interface StoredFilter { column: string; op: OpKind; value: string | string[]; }
interface QueryOrder { column: string; dir: "asc" | "desc"; }
interface QueryModel {
  source: string;
  columns: QueryColumn[];
  filters: StoredFilter[];
  group_by: string[];
  order_by: QueryOrder[];
  limit: number;
}

interface SavedQuery {
  id: string;
  name: string;
  source: string;
  model: QueryModel;
}

type CellValue = string | number | boolean | null;
interface QueryResult {
  columns: string[];
  rows: Record<string, CellValue>[];
  rowCount: number;
}

type ChartType = "bar" | "line" | "pie" | "number" | "table";
interface ChartConfig { type: ChartType; x?: string; y?: string; }
interface SavedChart {
  id: string;
  name: string;
  query_id: string;
  query_name: string;
  query_source: string;
  config: ChartConfig;
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

function fmtCell(v: CellValue): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
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

const OPERATORS: { op: OpKind; label: string }[] = [
  { op: "=", label: "=" }, { op: "!=", label: "≠" },
  { op: ">", label: ">" }, { op: ">=", label: "≥" },
  { op: "<", label: "<" }, { op: "<=", label: "≤" },
  { op: "in", label: "in (a,b,c)" }, { op: "like", label: "contains" },
  { op: "between", label: "between (a,b)" },
];
const AGGS: AggKind[] = ["none", "sum", "avg", "min", "max", "count"];
const CHART_COLORS = ["var(--color-primary)", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];

// Build the value to send for a filter: split comma lists for in/between, else raw.
function filterValueForApi(f: QueryFilter): string | string[] {
  if (f.op === "in" || f.op === "between") {
    return f.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
  return f.value;
}

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE BITS
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, icon,
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
      <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">{value}</p>
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

const inputCls =
  "px-2.5 py-1.5 text-sm rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none";

// ─────────────────────────────────────────────────────────────────────────────
// CHART RENDERER (used by saved-chart cards and dashboard widgets)
// ─────────────────────────────────────────────────────────────────────────────
function ChartRender({ config, result }: { config: ChartConfig; result: QueryResult | null }) {
  if (!result) {
    return <div className="h-[200px] rounded bg-[var(--color-border)]/40 animate-pulse" />;
  }
  const { type, x, y } = config;
  const rows = result.rows;

  if (type === "number") {
    const col = y || x || result.columns[0];
    const v = rows.length > 0 && col ? rows[0][col] : null;
    return (
      <div className="flex items-center justify-center h-[120px]">
        <p className="text-3xl font-bold text-[var(--color-primary)] tabular-nums">
          {typeof v === "number" ? fmtNum(v) : fmtCell(v)}
        </p>
      </div>
    );
  }

  if (type === "table") {
    return <ResultTable result={result} maxRows={50} />;
  }

  const xKey = x || result.columns[0];
  const yKey = y || result.columns.find((c) => c !== xKey) || result.columns[0];
  const data = rows.map((r) => ({ name: fmtCell(xKey ? r[xKey] : null), value: toNum(r[yKey] as number | string) }));

  const axisTick = { fill: "var(--color-muted)", fontSize: 11 };
  const tooltipStyle = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    color: "var(--color-text)",
    fontSize: 12,
  };

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        {type === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
              {data.map((d, i) => (
                <Cell key={`${d.name}-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        ) : type === "line" ? (
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="name" tick={axisTick} stroke="var(--color-border)" />
            <YAxis tick={axisTick} stroke="var(--color-border)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="name" tick={axisTick} stroke="var(--color-border)" />
            <YAxis tick={axisTick} stroke="var(--color-border)" />
            <Tooltip cursor={{ fill: "var(--color-bg)" }} contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={`${d.name}-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function ResultTable({ result, maxRows = 100 }: { result: QueryResult; maxRows?: number }) {
  if (result.columns.length === 0) {
    return <p className="text-xs text-[var(--color-muted)]">No columns.</p>;
  }
  return (
    <div className="overflow-x-auto border border-[var(--color-border)] rounded-md">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[var(--color-bg)] text-left">
            {result.columns.map((c) => (
              <th key={c} className="px-2.5 py-1.5 font-semibold text-[var(--color-muted)] whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, maxRows).map((r, i) => (
            <tr key={i} className="border-t border-[var(--color-border)]">
              {result.columns.map((c) => (
                <td key={c} className="px-2.5 py-1.5 tabular-nums whitespace-nowrap">{fmtCell(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 && (
        <p className="px-2.5 py-3 text-xs text-[var(--color-muted)]">No rows.</p>
      )}
    </div>
  );
}

// A self-contained card that runs a saved chart's query and renders it.
function SavedChartCard({ chart, onDelete }: { chart: SavedChart; onDelete: (id: string) => void }) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .post<QueryResult>(`/api/insights/queries/${chart.query_id}/run`, {})
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e) => { if (!cancelled) setErr(errMsg(e)); });
    return () => { cancelled = true; };
  }, [chart.query_id]);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{chart.name}</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {chart.config.type} · {chart.query_name}
          </p>
        </div>
        <button
          type="button"
          title="Delete chart"
          onClick={() => onDelete(chart.id)}
          className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-red-400 flex-shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {err ? (
        <p className="text-xs text-red-400">{err}</p>
      ) : (
        <ChartRender config={chart.config} result={result} />
      )}
    </div>
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
  const [pickedCharts, setPickedCharts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Query builder state ──────────────────────────────────────────────────────
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [source, setSource] = useState<string>("");
  const [qCols, setQCols] = useState<QueryColumn[]>([]);
  const [qFilters, setQFilters] = useState<QueryFilter[]>([]);
  const [qGroupBy, setQGroupBy] = useState<string[]>([]);
  const [qOrder, setQOrder] = useState<QueryOrder | null>(null);
  const [qLimit, setQLimit] = useState<number>(100);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [charts, setCharts] = useState<SavedChart[]>([]);

  // Save-as-chart form.
  const [chartName, setChartName] = useState("");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [chartX, setChartX] = useState("");
  const [chartY, setChartY] = useState("");
  const [savedQueryName, setSavedQueryName] = useState("");

  const activeDataset = useMemo(
    () => datasets.find((d) => d.key === source) ?? null,
    [datasets, source]
  );

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

  // ── Fetch metrics + dashboards + datasets + queries + charts ─────────────────
  const loadMeta = useCallback(async () => {
    try {
      const [m, d, ds, q, c] = await Promise.all([
        api.get<Metric[]>("/api/insights/metrics"),
        api.get<Dashboard[]>("/api/insights/dashboards"),
        api.get<Dataset[]>("/api/insights/datasets"),
        api.get<SavedQuery[]>("/api/insights/queries"),
        api.get<SavedChart[]>("/api/insights/charts"),
      ]);
      setMetrics(Array.isArray(m) ? m : []);
      setDashboards(Array.isArray(d) ? d : []);
      setDatasets(Array.isArray(ds) ? ds : []);
      setSavedQueries(Array.isArray(q) ? q : []);
      setCharts(Array.isArray(c) ? c : []);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);

  useEffect(() => { void loadOverview(fy); }, [fy, loadOverview]);
  useEffect(() => { void loadMeta(); }, [loadMeta]);

  // ── Mutations (reload after) ─────────────────────────────────────────────────
  const createDashboard = useCallback(async () => {
    const name = newName.trim();
    if (!name) { toast.error("Name the dashboard first"); return; }
    if (picked.length === 0 && pickedCharts.length === 0) { toast.error("Pick at least one metric or chart"); return; }
    setSaving(true);
    try {
      const metricWidgets: DashboardWidget[] = picked.map((key) => {
        const m = metrics.find((x) => x.key === key);
        return { metric: key, title: m ? m.label : key };
      });
      const chartWidgets: DashboardWidget[] = pickedCharts.map((id) => {
        const ch = charts.find((x) => x.id === id);
        return { chartId: id, title: ch ? ch.name : id };
      });
      await api.post("/api/insights/dashboards", { name, widgets: [...metricWidgets, ...chartWidgets] });
      toast.success("Dashboard created");
      setNewName(""); setPicked([]); setPickedCharts([]); setShowForm(false);
      await loadMeta();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }, [newName, picked, pickedCharts, metrics, charts, loadMeta]);

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
  const togglePickChart = useCallback((id: string) => {
    setPickedCharts((cur) => (cur.includes(id) ? cur.filter((k) => k !== id) : [...cur, id]));
  }, []);

  // ── Query builder actions ────────────────────────────────────────────────────
  const resetBuilder = useCallback(() => {
    setQCols([]); setQFilters([]); setQGroupBy([]); setQOrder(null);
    setQLimit(100); setResult(null); setChartX(""); setChartY("");
  }, []);

  const onPickSource = useCallback((key: string) => {
    setSource(key);
    resetBuilder();
  }, [resetBuilder]);

  const buildModel = useCallback((): QueryModel => ({
    source,
    columns: qCols,
    filters: qFilters.map((f): StoredFilter => ({ column: f.column, op: f.op, value: filterValueForApi(f) })),
    group_by: qGroupBy,
    order_by: qOrder ? [qOrder] : [],
    limit: qLimit,
  }), [source, qCols, qFilters, qGroupBy, qOrder, qLimit]);

  const runQuery = useCallback(async () => {
    if (!source) { toast.error("Pick a dataset first"); return; }
    setRunning(true);
    try {
      const r = await api.post<QueryResult>("/api/insights/query/run", buildModel());
      setResult(r);
      // Default chart axes to first two result columns.
      if (r.columns.length > 0) {
        setChartX((x) => x || r.columns[0]);
        setChartY((y) => y || r.columns.find((c) => c !== r.columns[0]) || r.columns[0]);
      }
    } catch (e) {
      toast.error(errMsg(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [source, buildModel]);

  const saveQuery = useCallback(async () => {
    const name = savedQueryName.trim();
    if (!name) { toast.error("Name the query"); return; }
    if (!source) { toast.error("Pick a dataset first"); return; }
    try {
      await api.post("/api/insights/queries", { name, ...buildModel() });
      toast.success("Query saved");
      setSavedQueryName("");
      await loadMeta();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [savedQueryName, source, buildModel, loadMeta]);

  const loadSavedQuery = useCallback((q: SavedQuery) => {
    setSource(q.source);
    setQCols(Array.isArray(q.model.columns) ? q.model.columns : []);
    setQGroupBy(Array.isArray(q.model.group_by) ? q.model.group_by : []);
    setQOrder(Array.isArray(q.model.order_by) && q.model.order_by[0] ? q.model.order_by[0] : null);
    setQLimit(q.model.limit || 100);
    // Filters: collapse array values back to comma strings for the UI.
    setQFilters(
      (Array.isArray(q.model.filters) ? q.model.filters : []).map((f): QueryFilter => ({
        column: f.column,
        op: f.op,
        value: Array.isArray(f.value) ? f.value.join(", ") : String(f.value ?? ""),
      }))
    );
    setResult(null);
    toast.success(`Loaded "${q.name}"`);
  }, []);

  const saveChart = useCallback(async () => {
    const name = chartName.trim();
    if (!name) { toast.error("Name the chart"); return; }
    // The chart needs a saved query to reference. Save the current model first.
    if (!source) { toast.error("Build and run a query first"); return; }
    try {
      const qName = savedQueryName.trim() || `${name} (query)`;
      const q = await api.post<SavedQuery>("/api/insights/queries", { name: qName, ...buildModel() });
      await api.post("/api/insights/charts", {
        name,
        queryId: q.id,
        config: { type: chartType, x: chartX, y: chartY },
      });
      toast.success("Chart saved");
      setChartName("");
      await loadMeta();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [chartName, source, savedQueryName, buildModel, chartType, chartX, chartY, loadMeta]);

  const deleteChart = useCallback(async (id: string) => {
    if (!window.confirm("Delete this chart?")) return;
    try {
      await api.delete(`/api/insights/charts/${id}`);
      toast.success("Chart deleted");
      await loadMeta();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [loadMeta]);

  // Column-row mutators for the builder.
  const addColumn = useCallback(() => {
    const first = activeDataset?.columns[0]?.column;
    if (!first) return;
    setQCols((c) => [...c, { column: first, aggregate: "none" }]);
  }, [activeDataset]);
  const updateColumn = useCallback((i: number, patch: Partial<QueryColumn>) => {
    setQCols((c) => c.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }, []);
  const removeColumn = useCallback((i: number) => {
    setQCols((c) => c.filter((_, idx) => idx !== i));
  }, []);

  const addFilter = useCallback(() => {
    const first = activeDataset?.columns[0]?.column;
    if (!first) return;
    setQFilters((f) => [...f, { column: first, op: "=", value: "" }]);
  }, [activeDataset]);
  const updateFilter = useCallback((i: number, patch: Partial<QueryFilter>) => {
    setQFilters((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }, []);
  const removeFilter = useCallback((i: number) => {
    setQFilters((f) => f.filter((_, idx) => idx !== i));
  }, []);

  const toggleGroupBy = useCallback((col: string) => {
    setQGroupBy((g) => (g.includes(col) ? g.filter((c) => c !== col) : [...g, col]));
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

  const colNames = activeDataset?.columns.map((c) => c.column) ?? [];

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
              className={`w-28 tabular-nums ${inputCls}`}
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
            <><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /></>
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
            <><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /></>
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
            <><KpiSkeleton /><KpiSkeleton /></>
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

        {/* ───────────────────────── QUERY BUILDER ───────────────────────── */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Database size={16} className="text-[var(--color-primary)]" />
            Query builder
          </h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Build a safe query over your own data — pick a dataset, columns, filters and group-by, then Run.
          </p>

          <div className="mt-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
            {/* Dataset picker */}
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Dataset</label>
              <select value={source} onChange={(e) => onPickSource(e.target.value)} className={`w-full max-w-md ${inputCls}`}>
                <option value="">Select a dataset…</option>
                {datasets.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
              {activeDataset && (
                <p className="text-[11px] text-[var(--color-muted)] mt-1">{activeDataset.description}</p>
              )}
            </div>

            {activeDataset && (
              <>
                {/* Columns + aggregates */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-[var(--color-muted)]">Columns &amp; aggregates</label>
                    <button type="button" onClick={addColumn} className="text-[11px] inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline">
                      <Plus size={11} /> Add column
                    </button>
                  </div>
                  {qCols.length === 0 ? (
                    <p className="text-[11px] text-[var(--color-muted)]">No columns picked — all whitelisted columns will be returned.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {qCols.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 flex-wrap">
                          <select
                            value={c.column ?? ""}
                            onChange={(e) => updateColumn(i, { column: e.target.value })}
                            disabled={c.aggregate === "count"}
                            className={`${inputCls} disabled:opacity-40`}
                          >
                            {colNames.map((cn) => <option key={cn} value={cn}>{cn}</option>)}
                          </select>
                          <select value={c.aggregate} onChange={(e) => updateColumn(i, { aggregate: e.target.value as AggKind })} className={inputCls}>
                            {AGGS.map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                          <button type="button" onClick={() => removeColumn(i)} className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-red-400">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Filters */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-[var(--color-muted)]">Filters</label>
                    <button type="button" onClick={addFilter} className="text-[11px] inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline">
                      <Plus size={11} /> Add filter
                    </button>
                  </div>
                  {qFilters.length === 0 ? (
                    <p className="text-[11px] text-[var(--color-muted)]">No filters.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {qFilters.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 flex-wrap">
                          <select value={f.column} onChange={(e) => updateFilter(i, { column: e.target.value })} className={inputCls}>
                            {colNames.map((cn) => <option key={cn} value={cn}>{cn}</option>)}
                          </select>
                          <select value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value as OpKind })} className={inputCls}>
                            {OPERATORS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                          </select>
                          <input
                            value={f.value}
                            onChange={(e) => updateFilter(i, { value: e.target.value })}
                            placeholder={f.op === "in" ? "a, b, c" : f.op === "between" ? "from, to" : "value"}
                            className={`flex-1 min-w-[120px] ${inputCls}`}
                          />
                          <button type="button" onClick={() => removeFilter(i)} className="p-1.5 rounded-md hover:bg-[var(--color-bg)] text-red-400">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Group-by */}
                <div>
                  <label className="block text-xs text-[var(--color-muted)] mb-1">Group by</label>
                  <div className="flex flex-wrap gap-1.5">
                    {colNames.map((cn) => {
                      const on = qGroupBy.includes(cn);
                      return (
                        <button
                          key={cn}
                          type="button"
                          onClick={() => toggleGroupBy(cn)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            on
                              ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                              : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                          }`}
                        >
                          {cn}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Order-by + limit + run */}
                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <label className="block text-xs text-[var(--color-muted)] mb-1">Order by</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={qOrder?.column ?? ""}
                        onChange={(e) => setQOrder(e.target.value ? { column: e.target.value, dir: qOrder?.dir ?? "asc" } : null)}
                        className={inputCls}
                      >
                        <option value="">(none)</option>
                        {colNames.map((cn) => <option key={cn} value={cn}>{cn}</option>)}
                      </select>
                      <select
                        value={qOrder?.dir ?? "asc"}
                        disabled={!qOrder}
                        onChange={(e) => setQOrder(qOrder ? { ...qOrder, dir: e.target.value as "asc" | "desc" } : null)}
                        className={`${inputCls} disabled:opacity-40`}
                      >
                        <option value="asc">asc</option>
                        <option value="desc">desc</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-muted)] mb-1">Limit (≤ 1000)</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={qLimit}
                      onChange={(e) => setQLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 100)))}
                      className={`w-28 tabular-nums ${inputCls}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void runQuery()}
                    disabled={running || !source}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold hover:opacity-90 disabled:opacity-40"
                  >
                    <Play size={13} className={running ? "animate-pulse" : ""} /> {running ? "Running…" : "Run"}
                  </button>
                  <div className="flex items-center gap-2">
                    <input
                      value={savedQueryName}
                      onChange={(e) => setSavedQueryName(e.target.value)}
                      placeholder="Save query as…"
                      className={`w-40 ${inputCls}`}
                    />
                    <button
                      type="button"
                      onClick={() => void saveQuery()}
                      className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-[var(--color-border)] hover:border-[var(--color-primary)]"
                    >
                      <Save size={13} /> Save
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Saved queries quick-load */}
          {savedQueries.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[var(--color-muted)]">Saved queries:</span>
              {savedQueries.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => loadSavedQuery(q)}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]"
                >
                  {q.name}
                </button>
              ))}
            </div>
          )}

          {/* RESULTS */}
          {result && (
            <div className="mt-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <TableIcon size={14} /> Results
                  <span className="text-[11px] font-normal text-[var(--color-muted)]">{result.rowCount} rows</span>
                </h3>
              </div>
              <ResultTable result={result} />

              {/* Save-as-chart */}
              <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                <p className="text-xs text-[var(--color-muted)] mb-2">Save these results as a chart</p>
                <div className="flex items-end gap-2 flex-wrap">
                  <div>
                    <label className="block text-[11px] text-[var(--color-muted)] mb-1">Type</label>
                    <select value={chartType} onChange={(e) => setChartType(e.target.value as ChartType)} className={inputCls}>
                      {(["bar", "line", "pie", "number", "table"] as ChartType[]).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--color-muted)] mb-1">X / label</label>
                    <select value={chartX} onChange={(e) => setChartX(e.target.value)} className={inputCls}>
                      {result.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--color-muted)] mb-1">Y / value</label>
                    <select value={chartY} onChange={(e) => setChartY(e.target.value)} className={inputCls}>
                      {result.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <input
                    value={chartName}
                    onChange={(e) => setChartName(e.target.value)}
                    placeholder="Chart name"
                    className={`w-40 ${inputCls}`}
                  />
                  <button
                    type="button"
                    onClick={() => void saveChart()}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold hover:opacity-90"
                  >
                    <Save size={13} /> Save chart
                  </button>
                </div>
                {/* Live preview */}
                <div className="mt-3">
                  <ChartRender config={{ type: chartType, x: chartX, y: chartY }} result={result} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ───────────────────────── SAVED CHARTS ───────────────────────── */}
        {charts.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 size={16} className="text-[var(--color-primary)]" />
              Saved charts
            </h2>
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {charts.map((c) => (
                <SavedChartCard key={c.id} chart={c} onDelete={(id) => void deleteChart(id)} />
              ))}
            </div>
          </div>
        )}

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
              className={`w-full max-w-sm mb-4 ${inputCls}`}
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

            {/* Saved charts as dashboard widgets */}
            {charts.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">Charts</p>
                <div className="flex flex-wrap gap-1.5">
                  {charts.map((c) => {
                    const on = pickedCharts.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => togglePickChart(c.id)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          on
                            ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                            : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-4">
              <span className="mr-auto text-xs text-[var(--color-muted)] tabular-nums">
                {picked.length + pickedCharts.length} selected
              </span>
              <button
                type="button"
                onClick={() => { setShowForm(false); setNewName(""); setPicked([]); setPickedCharts([]); }}
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
                Create one to pin the metrics and charts you care about.
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
                          <span className="text-[11px] text-[var(--color-muted)]">No items</span>
                        ) : (
                          widgets.map((w, i) => (
                            <span
                              key={`${w.metric ?? w.chartId}-${i}`}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]"
                            >
                              {w.title || w.metric || w.chartId}
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

                  {/* Opened: render KPI widgets + chart widgets */}
                  {open && (
                    <div className="border-t border-[var(--color-border)] px-4 py-4 space-y-3">
                      {widgets.length === 0 ? (
                        <p className="text-xs text-[var(--color-muted)]">This dashboard has no items.</p>
                      ) : (
                        <>
                          {/* KPI cards */}
                          {widgets.some((w) => w.metric) && (
                            <div className="flex flex-wrap gap-2">
                              {widgets.filter((w) => w.metric).map((w, i) => {
                                const mv = metricValue(w.metric as string, overview);
                                return (
                                  <KpiCard
                                    key={`${w.metric}-${i}`}
                                    label={w.title || (w.metric as string)}
                                    money={mv.money}
                                    value={mv.value}
                                    icon={<BarChart3 size={13} />}
                                  />
                                );
                              })}
                            </div>
                          )}
                          {/* Chart widgets */}
                          {widgets.some((w) => w.chartId) && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              {widgets.filter((w) => w.chartId).map((w, i) => {
                                const ch = charts.find((c) => c.id === w.chartId);
                                if (!ch) {
                                  return (
                                    <div key={`${w.chartId}-${i}`} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 text-xs text-[var(--color-muted)]">
                                      {w.title || "Chart"} (deleted)
                                    </div>
                                  );
                                }
                                return <SavedChartCard key={ch.id} chart={ch} onDelete={(id) => void deleteChart(id)} />;
                              })}
                            </div>
                          )}
                        </>
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
