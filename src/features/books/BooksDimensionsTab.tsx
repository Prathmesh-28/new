import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Layers, Building2, FolderKanban, Tags, Plus, RefreshCw, BarChart3,
  Pencil, Check, X, Scale,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — shapes mirror backend/src/modules/books/{costcentres,reports,ops}.js
// (loose: snake_case from raw SQL rows, camelCase from report builders)
// ─────────────────────────────────────────────────────────────────────────────
interface CostCentre {
  id: string;
  name: string;
  parent_id?: string | null;
  category?: string | null;
  is_active?: boolean;
}
interface CostCentreReportRow {
  id: string;
  name: string;
  category?: string | null;
  income: string;
  expense: string;
  net: string;
}
interface Project {
  id: string;
  name: string;
  customer_ledger_id?: string | null;
  status?: string | null;
}
interface BillableSummary {
  projectId: string;
  unbilledHours: string | number;
  unbilledAmount: string;
}
interface ProjectPlRow {
  projectId: string;
  name: string;
  status?: string | null;
  revenue: string;
  cost: string;
  grossMargin: string;
  marginPct: string;
}
interface ProjectPl {
  financialYear: string;
  rows: ProjectPlRow[];
  totals: { revenue: string; cost: string; grossMargin: string; marginPct: string };
}
interface Branch {
  id: string;
  name: string;
  gstin?: string | null;
  state_code?: string | null;
}
interface BranchPlRow { name: string; amount: string }
interface BranchPl {
  financialYear: string;
  branchId: string;
  asOf: string | null;
  income: BranchPlRow[];
  expense: BranchPlRow[];
  totalIncome: string;
  totalExpense: string;
  netProfit: string;
}
interface BranchTbLedger {
  ledgerId: string;
  name: string;
  nature: string;
  debit: string;
  credit: string;
}
interface BranchTb {
  financialYear: string;
  branchId: string;
  asOf: string | null;
  ledgers: BranchTbLedger[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
}
interface TagReportRow { tag: string; netProfit: string }
interface TagReport {
  financialYear: string;
  dimension: string;
  rows: TagReportRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function rupee(v: string | number | null | undefined): string {
  return `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    if (Array.isArray(r.rows)) return r.rows as T[];
  }
  return [];
}

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]";
const thCls =
  "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]";
const thR = `${thCls} text-right`;

const TAG_DIMENSIONS = ["project", "customer", "billable", "department", "region", "campaign"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SMALL PIECES
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, tint }: { label: string; value: string; tint?: "green" | "red" }) {
  const color =
    tint === "green" ? "text-green-400" : tint === "red" ? "text-red-400" : "text-[var(--color-primary)]";
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex-1 min-w-[140px]">
      <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function Card({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="text-[var(--color-primary)]">{icon}</span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

type SubTab = "costcentres" | "projects" | "branches" | "tags";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksDimensionsTab({ canWrite = true }: { canWrite?: boolean }) {
  const [sub, setSub] = useState<SubTab>("costcentres");

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "costcentres", label: "Cost centres", icon: <Layers size={14} /> },
    { id: "projects", label: "Projects", icon: <FolderKanban size={14} /> },
    { id: "branches", label: "Branches / GSTINs", icon: <Building2 size={14} /> },
    { id: "tags", label: "Tag reports", icon: <Tags size={14} /> },
  ];

  return (
    <div className="space-y-5">
      {/* HOW TO USE */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <Layers size={15} className="text-[var(--color-primary)]" /> Dimensional accounting
        </h2>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          Slice your books along extra dimensions beyond the chart of accounts. Tag voucher lines with a
          <span className="font-medium text-[var(--color-text)]"> cost centre</span>,
          <span className="font-medium text-[var(--color-text)]"> project</span>,
          <span className="font-medium text-[var(--color-text)]"> branch</span> or free-form
          <span className="font-medium text-[var(--color-text)]"> tag</span>, then read profitability per dimension here.
          Reports are scoped to the active financial year.
        </p>
      </div>

      {/* SUB-TAB BAR */}
      <div className="flex gap-2 overflow-x-auto">
        {subTabs.map((t) => {
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSub(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors ${
                active
                  ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {sub === "costcentres" && <CostCentresSection canWrite={canWrite} />}
      {sub === "projects" && <ProjectsSection canWrite={canWrite} />}
      {sub === "branches" && <BranchesSection canWrite={canWrite} />}
      {sub === "tags" && <TagsSection canWrite={canWrite} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COST CENTRES — list / create / patch (rename + activate) + cost-centre P&L
// ─────────────────────────────────────────────────────────────────────────────
function CostCentresSection({ canWrite }: { canWrite: boolean }) {
  const [list, setList] = useState<CostCentre[]>([]);
  const [report, setReport] = useState<CostCentreReportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  // create form
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);

  // inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadList = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get<CostCentre[]>("/api/books/cost-centres");
      setList(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    setReportBusy(true);
    try {
      const r = await api.get<CostCentreReportRow[]>("/api/books/cost-centres/report");
      setReport(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setReportBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
    void loadReport();
  }, [loadList, loadReport]);

  const create = async () => {
    if (!name.trim()) { toast.error("Enter a cost-centre name"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/cost-centres", {
        name: name.trim(),
        category: category.trim() || undefined,
        parentId: parentId || undefined,
      });
      toast.success(`Cost centre "${name.trim()}" saved`);
      setName(""); setCategory(""); setParentId("");
      await Promise.all([loadList(), loadReport()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (cc: CostCentre) => {
    if (!editName.trim()) { toast.error("Name cannot be empty"); return; }
    try {
      await api.patch(`/api/books/cost-centres/${cc.id}`, { name: editName.trim() });
      toast.success("Cost centre renamed");
      setEditId(null);
      await loadList();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const toggleActive = async (cc: CostCentre) => {
    try {
      await api.patch(`/api/books/cost-centres/${cc.id}`, { isActive: !(cc.is_active !== false) });
      toast.success(cc.is_active !== false ? "Cost centre deactivated" : "Cost centre activated");
      await loadList();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const totals = report.reduce(
    (a, r) => ({ income: a.income + num(r.income), expense: a.expense + num(r.expense), net: a.net + num(r.net) }),
    { income: 0, expense: 0, net: 0 },
  );

  return (
    <div className="space-y-5">
      {/* CREATE */}
      {canWrite && (
        <Card title="New cost centre" icon={<Plus size={15} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <label className={labelCls}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mumbai branch" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Category (optional)</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Region" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Parent (optional)</label>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputCls}>
                <option value="">— none —</option>
                {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button type="button" onClick={create} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Save
            </button>
          </div>
        </Card>
      )}

      {/* LIST */}
      <Card
        title="Cost centres"
        icon={<Layers size={15} />}
        action={
          <button type="button" onClick={() => void loadList()} className={btnGhost} title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
        }
      >
        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Name</th>
                <th className={thCls}>Category</th>
                <th className={thCls}>Status</th>
                {canWrite && <th className={thR}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr><td colSpan={canWrite ? 4 : 3} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={canWrite ? 4 : 3} className="px-3 py-6 text-center text-[var(--color-muted)]">No cost centres yet.</td></tr>
              ) : (
                list.map((c) => {
                  const active = c.is_active !== false;
                  const editing = editId === c.id;
                  return (
                    <tr key={c.id} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-3 py-2.5 font-medium">
                        {editing ? (
                          <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`${inputCls} py-1`} autoFocus />
                        ) : c.name}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)]">{c.category || "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          active
                            ? "bg-green-900/30 text-green-300 border-green-700/40"
                            : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"
                        }`}>{active ? "Active" : "Inactive"}</span>
                      </td>
                      {canWrite && (
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {editing ? (
                            <div className="inline-flex gap-1">
                              <button type="button" onClick={() => void saveEdit(c)} className="px-2 py-1 text-green-400 hover:bg-[var(--color-bg)] rounded" title="Save"><Check size={14} /></button>
                              <button type="button" onClick={() => setEditId(null)} className="px-2 py-1 text-[var(--color-muted)] hover:bg-[var(--color-bg)] rounded" title="Cancel"><X size={14} /></button>
                            </div>
                          ) : (
                            <div className="inline-flex gap-1">
                              <button type="button" onClick={() => { setEditId(c.id); setEditName(c.name); }} className="px-2 py-1 text-[var(--color-muted)] hover:text-[var(--color-primary)] rounded" title="Rename"><Pencil size={14} /></button>
                              <button type="button" onClick={() => void toggleActive(c)} className="px-2 py-1 text-[var(--color-muted)] hover:text-[var(--color-text)] rounded" title={active ? "Deactivate" : "Activate"}>{active ? <X size={14} /> : <Check size={14} />}</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* COST-CENTRE P&L */}
      <Card
        title="Cost-centre P&L (this FY)"
        icon={<BarChart3 size={15} />}
        action={
          <button type="button" onClick={() => void loadReport()} className={btnGhost} title="Refresh">
            <RefreshCw size={14} className={reportBusy ? "animate-spin" : ""} /> Refresh
          </button>
        }
      >
        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Cost centre</th>
                <th className={thCls}>Category</th>
                <th className={thR}>Income</th>
                <th className={thR}>Expense</th>
                <th className={thR}>Net</th>
              </tr>
            </thead>
            <tbody>
              {reportBusy ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
              ) : report.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--color-muted)]">No tagged postings for this FY.</td></tr>
              ) : (
                report.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{r.category || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-green-400">{rupee(r.income)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{rupee(r.expense)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${num(r.net) >= 0 ? "text-green-400" : "text-red-400"}`}>{rupee(r.net)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!reportBusy && report.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] font-semibold bg-[var(--color-bg)]/40">
                  <td className="px-3 py-2.5" colSpan={2}>Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-green-400">{rupee(totals.income)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{rupee(totals.expense)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${totals.net >= 0 ? "text-green-400" : "text-red-400"}`}>{rupee(totals.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS — list / create / per-project billable + project P&L (FY)
// ─────────────────────────────────────────────────────────────────────────────
function ProjectsSection({ canWrite }: { canWrite: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [pl, setPl] = useState<ProjectPl | null>(null);
  const [plBusy, setPlBusy] = useState(false);

  // create form
  const [name, setName] = useState("");
  const [customerLedgerId, setCustomerLedgerId] = useState("");
  const [saving, setSaving] = useState(false);

  // billable lookup
  const [billProjectId, setBillProjectId] = useState("");
  const [billable, setBillable] = useState<BillableSummary | null>(null);
  const [billBusy, setBillBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get<Project[]>("/api/books/projects");
      setProjects(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadPl = useCallback(async () => {
    setPlBusy(true);
    try {
      const r = await api.get<ProjectPl>("/api/books/reports/profitability/project");
      setPl(r);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPlBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
    void loadPl();
  }, [loadProjects, loadPl]);

  const create = async () => {
    if (!name.trim()) { toast.error("Enter a project name"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/projects", {
        name: name.trim(),
        customerLedgerId: customerLedgerId.trim() || undefined,
      });
      toast.success(`Project "${name.trim()}" created`);
      setName(""); setCustomerLedgerId("");
      await Promise.all([loadProjects(), loadPl()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const loadBillable = async (id: string) => {
    setBillProjectId(id);
    setBillable(null);
    if (!id) return;
    setBillBusy(true);
    try {
      const r = await api.get<BillableSummary>(`/api/books/projects/${id}/billable`);
      setBillable(r);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBillBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* CREATE */}
      {canWrite && (
        <Card title="New project" icon={<Plus size={15} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
            <div>
              <label className={labelCls}>Project name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ACME website build" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Customer ledger id (optional)</label>
              <input value={customerLedgerId} onChange={(e) => setCustomerLedgerId(e.target.value)} placeholder="ledger UUID" className={`${inputCls} font-mono`} />
            </div>
            <button type="button" onClick={create} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Create project
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-2">
            Linking a customer ledger lets project P&L pull that customer's sales revenue automatically.
          </p>
        </Card>
      )}

      {/* LIST + BILLABLE LOOKUP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Projects"
          icon={<FolderKanban size={15} />}
          action={
            <button type="button" onClick={() => void loadProjects()} className={btnGhost} title="Refresh">
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
            </button>
          }
        >
          <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className={thCls}>Name</th>
                  <th className={thCls}>Status</th>
                </tr>
              </thead>
              <tbody>
                {busy ? (
                  <tr><td colSpan={2} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
                ) : projects.length === 0 ? (
                  <tr><td colSpan={2} className="px-3 py-6 text-center text-[var(--color-muted)]">No projects yet.</td></tr>
                ) : (
                  projects.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-3 py-2.5 font-medium">{p.name}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] capitalize">{(p.status || "active").toString().toLowerCase()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Unbilled (billable) summary" icon={<Scale size={15} />}>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Project</label>
              <select value={billProjectId} onChange={(e) => void loadBillable(e.target.value)} className={inputCls}>
                <option value="">Select project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {billBusy ? (
              <p className="text-sm text-[var(--color-muted)] py-4 text-center">Loading…</p>
            ) : billable ? (
              <div className="flex flex-wrap gap-3">
                <StatCard label="Unbilled hours" value={num(billable.unbilledHours).toLocaleString("en-IN", { maximumFractionDigits: 2 })} />
                <StatCard label="Unbilled amount" value={rupee(billable.unbilledAmount)} tint="green" />
              </div>
            ) : (
              <p className="text-[11px] text-[var(--color-muted)]">Pick a project to see uninvoiced billable hours from its timesheets.</p>
            )}
          </div>
        </Card>
      </div>

      {/* PROJECT P&L */}
      <Card
        title="Project profitability (this FY)"
        icon={<BarChart3 size={15} />}
        action={
          <button type="button" onClick={() => void loadPl()} className={btnGhost} title="Refresh">
            <RefreshCw size={14} className={plBusy ? "animate-spin" : ""} /> Refresh
          </button>
        }
      >
        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Project</th>
                <th className={thCls}>Status</th>
                <th className={thR}>Revenue</th>
                <th className={thR}>Cost</th>
                <th className={thR}>Gross margin</th>
                <th className={thR}>Margin %</th>
              </tr>
            </thead>
            <tbody>
              {plBusy ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
              ) : (pl?.rows.length ?? 0) === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">No project activity this FY.</td></tr>
              ) : (
                pl!.rows.map((r) => (
                  <tr key={r.projectId} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] capitalize">{(r.status || "active").toString().toLowerCase()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-green-400">{rupee(r.revenue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{rupee(r.cost)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${num(r.grossMargin) >= 0 ? "text-green-400" : "text-red-400"}`}>{rupee(r.grossMargin)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{r.marginPct}%</td>
                  </tr>
                ))
              )}
            </tbody>
            {!plBusy && (pl?.rows.length ?? 0) > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] font-semibold bg-[var(--color-bg)]/40">
                  <td className="px-3 py-2.5" colSpan={2}>Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-green-400">{rupee(pl!.totals.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{rupee(pl!.totals.cost)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${num(pl!.totals.grossMargin) >= 0 ? "text-green-400" : "text-red-400"}`}>{rupee(pl!.totals.grossMargin)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{pl!.totals.marginPct}%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BRANCHES — list / create + branch P&L + branch trial balance
// ─────────────────────────────────────────────────────────────────────────────
function BranchesSection({ canWrite }: { canWrite: boolean }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [busy, setBusy] = useState(false);

  // create form
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [saving, setSaving] = useState(false);

  // report controls
  const [branchId, setBranchId] = useState("");
  const [asOf, setAsOf] = useState(todayIso());
  const [pl, setPl] = useState<BranchPl | null>(null);
  const [tb, setTb] = useState<BranchTb | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  const loadBranches = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get<Branch[]>("/api/books/branches");
      setBranches(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void loadBranches(); }, [loadBranches]);

  const create = async () => {
    if (!name.trim()) { toast.error("Enter a branch name"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/branches", {
        name: name.trim(),
        gstin: gstin.trim() || undefined,
        stateCode: stateCode.trim() || undefined,
      });
      toast.success(`Branch "${name.trim()}" saved`);
      setName(""); setGstin(""); setStateCode("");
      await loadBranches();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const runReports = async () => {
    if (!branchId) { toast.error("Pick a branch"); return; }
    setReportBusy(true);
    try {
      const q = `branchId=${encodeURIComponent(branchId)}${asOf ? `&asOf=${encodeURIComponent(asOf)}` : ""}`;
      const [p, t] = await Promise.all([
        api.get<BranchPl>(`/api/books/reports/branch-pl?${q}`),
        api.get<BranchTb>(`/api/books/reports/branch-trial-balance?${q}`),
      ]);
      setPl(p);
      setTb(t);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* CREATE */}
      {canWrite && (
        <Card title="New branch / GSTIN" icon={<Plus size={15} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <label className={labelCls}>Branch name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pune unit" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>GSTIN (optional)</label>
              <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="15-char GSTIN" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>State code (optional)</label>
              <input value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="e.g. 27" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <button type="button" onClick={create} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Save branch
            </button>
          </div>
        </Card>
      )}

      {/* LIST */}
      <Card
        title="Branches"
        icon={<Building2 size={15} />}
        action={
          <button type="button" onClick={() => void loadBranches()} className={btnGhost} title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
        }
      >
        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Name</th>
                <th className={thCls}>GSTIN</th>
                <th className={thCls}>State</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
              ) : branches.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-[var(--color-muted)]">No branches yet.</td></tr>
              ) : (
                branches.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{b.name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-muted)]">{b.gstin || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{b.state_code || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* REPORT CONTROLS */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <label className={labelCls}>Branch</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
            <option value="">Select branch…</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>As of (optional)</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputCls} />
        </div>
        <button type="button" onClick={runReports} disabled={reportBusy} className={btnPrimary}>
          {reportBusy ? <RefreshCw size={14} className="animate-spin" /> : <BarChart3 size={14} />} Run branch reports
        </button>
      </div>

      {/* BRANCH P&L */}
      <Card title="Branch P&L" icon={<BarChart3 size={15} />}>
        {!pl ? (
          <p className="text-sm text-[var(--color-muted)] py-4 text-center">Pick a branch and run reports above.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <StatCard label="Total income" value={rupee(pl.totalIncome)} tint="green" />
              <StatCard label="Total expense" value={rupee(pl.totalExpense)} tint="red" />
              <StatCard label="Net profit" value={rupee(pl.netProfit)} tint={num(pl.netProfit) >= 0 ? "green" : "red"} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">Income</h4>
                <BranchPlLines rows={pl.income} />
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">Expense</h4>
                <BranchPlLines rows={pl.expense} />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* BRANCH TRIAL BALANCE */}
      <Card title="Branch trial balance" icon={<Scale size={15} />}>
        {!tb ? (
          <p className="text-sm text-[var(--color-muted)] py-4 text-center">Pick a branch and run reports above.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px]">
              {tb.balanced
                ? <span className="text-green-400 font-medium">Balanced ✓</span>
                : <span className="text-red-400 font-medium">Out of balance ⚠</span>}
            </p>
            <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className={thCls}>Ledger</th>
                    <th className={thCls}>Nature</th>
                    <th className={thR}>Debit</th>
                    <th className={thR}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {tb.ledgers.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-[var(--color-muted)]">No balances for this branch.</td></tr>
                  ) : (
                    tb.ledgers.map((l) => (
                      <tr key={l.ledgerId} className="border-b border-[var(--color-border)] last:border-b-0">
                        <td className="px-3 py-2.5 font-medium">{l.name}</td>
                        <td className="px-3 py-2.5 text-[var(--color-muted)] capitalize">{(l.nature || "—").toString().toLowerCase()}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(l.debit) ? rupee(l.debit) : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(l.credit) ? rupee(l.credit) : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--color-border)] font-semibold bg-[var(--color-bg)]/40">
                    <td className="px-3 py-2.5" colSpan={2}>Total</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(tb.totalDebit)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(tb.totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function BranchPlLines({ rows }: { rows: BranchPlRow[] }) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
      <table className="w-full text-sm border-collapse">
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="px-3 py-4 text-center text-[var(--color-muted)]" colSpan={2}>None.</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                <td className="px-3 py-2.5">{r.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.amount)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAGS — net profit by free-form dimension + register a tag value
// ─────────────────────────────────────────────────────────────────────────────
function TagsSection({ canWrite }: { canWrite: boolean }) {
  const [dimension, setDimension] = useState<string>(TAG_DIMENSIONS[0]);
  const [report, setReport] = useState<TagReport | null>(null);
  const [busy, setBusy] = useState(false);

  // register tag form
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (dim: string) => {
    if (!dim.trim()) return;
    setBusy(true);
    try {
      const r = await api.get<unknown>(`/api/books/reports/by-tag?dimension=${encodeURIComponent(dim.trim())}`);
      const rows = asArray<TagReportRow>(r);
      const dimVal = (r && typeof r === "object" && "dimension" in r) ? String((r as TagReport).dimension) : dim.trim();
      const fy = (r && typeof r === "object" && "financialYear" in r) ? String((r as TagReport).financialYear) : "";
      setReport({ dimension: dimVal, financialYear: fy, rows });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(dimension); }, [load, dimension]);

  const registerTag = async () => {
    if (!dimension.trim()) { toast.error("Pick a dimension"); return; }
    if (!newValue.trim()) { toast.error("Enter a tag value"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/tags", { dimension: dimension.trim(), value: newValue.trim() });
      toast.success(`Tag "${newValue.trim()}" registered under ${dimension.trim()}`);
      setNewValue("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const total = report?.rows.reduce((a, r) => a + num(r.netProfit), 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* CONTROLS */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <label className={labelCls}>Dimension</label>
          <select value={dimension} onChange={(e) => setDimension(e.target.value)} className={inputCls}>
            {TAG_DIMENSIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => void load(dimension)} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <BarChart3 size={14} />} Run tag report
        </button>
        <p className="text-[11px] text-[var(--color-muted)] basis-full">
          Net profit grouped by the value stored in each voucher line's <span className="font-mono">tags.{dimension}</span> for this FY. Untagged lines roll up under "(untagged)".
        </p>
      </div>

      {/* REGISTER TAG */}
      {canWrite && (
        <Card title="Register a tag value" icon={<Plus size={15} />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className={labelCls}>Dimension</label>
              <input value={dimension} disabled className={`${inputCls} opacity-70`} />
            </div>
            <div>
              <label className={labelCls}>New value</label>
              <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. North zone" className={inputCls} />
            </div>
            <button type="button" onClick={registerTag} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Register tag
            </button>
          </div>
        </Card>
      )}

      {/* REPORT */}
      <Card title={`Net profit by "${dimension}"`} icon={<Tags size={15} />}>
        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Tag value</th>
                <th className={thR}>Net profit</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr><td colSpan={2} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
              ) : (report?.rows.length ?? 0) === 0 ? (
                <tr><td colSpan={2} className="px-3 py-6 text-center text-[var(--color-muted)]">No tagged postings for this dimension.</td></tr>
              ) : (
                report!.rows.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{r.tag}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${num(r.netProfit) >= 0 ? "text-green-400" : "text-red-400"}`}>{rupee(r.netProfit)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!busy && (report?.rows.length ?? 0) > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] font-semibold bg-[var(--color-bg)]/40">
                  <td className="px-3 py-2.5">Total</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${total >= 0 ? "text-green-400" : "text-red-400"}`}>{rupee(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}
