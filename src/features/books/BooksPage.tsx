import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import {
  BookOpen, LayoutGrid, ListTree, FilePlus2, BarChart3, Repeat,
  Plus, RefreshCw, CheckCircle2, XCircle, Undo2, Sparkles, ArrowDownToLine,
  FileText, Trash2, Printer, Send, Receipt, Percent, SlidersHorizontal, Boxes,
  Landmark, Tag, CalendarClock, Layers,
  Lock, Split, FileBarChart, Coins, Building2, Workflow, ShieldCheck, Scale, Files,
} from "lucide-react";
import BooksReceivablesTab from "./BooksReceivablesTab";
import BooksGstTab from "./BooksGstTab";
import BooksAdminTab from "./BooksAdminTab";
import BooksInventoryTab from "./BooksInventoryTab";
import BooksTaxFilingTab from "./BooksTaxFilingTab";
import BooksPricingTab from "./BooksPricingTab";
import BooksPaymentTermsTab from "./BooksPaymentTermsTab";
import BooksSubscriptionsTab from "./BooksSubscriptionsTab";
import BooksClosingTab from "./BooksClosingTab";
import BooksDimensionsTab from "./BooksDimensionsTab";
import BooksReportsProTab from "./BooksReportsProTab";
import BooksFxTab from "./BooksFxTab";
import BooksAssetsTab from "./BooksAssetsTab";
import BooksAutomationTab from "./BooksAutomationTab";
import BooksComplianceTab from "./BooksComplianceTab";
import BooksSettlementTab from "./BooksSettlementTab";
import BooksDocumentsTab from "./BooksDocumentsTab";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (response shapes inlined — backend confirmed)
// ─────────────────────────────────────────────────────────────────────────────
type Nature = "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "EQUITY";

interface Group {
  id: string;
  name: string;
  parent_id: string | null;
  nature: Nature;
  affects_pl: boolean;
  is_system: boolean;
}

interface Ledger {
  id: string;
  name: string;
  group_id: string;
  is_party: boolean;
  is_bank: boolean;
  opening_balance: string;
  opening_is_debit: boolean;
  is_active: boolean;
}

interface VoucherRow {
  id: string;
  voucher_type: string;
  voucher_number: string;
  voucher_date: string;
  financial_year: string;
  narration: string | null;
  reference: string | null;
  is_cancelled: boolean;
  source: string | null;
}

interface TrialBalance {
  ledgers: { name: string; nature: string; debit: string; credit: string }[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
}

interface ProfitLoss {
  income: { name: string; amount: string }[];
  expense: { name: string; amount: string }[];
  totalIncome: string;
  totalExpense: string;
  netProfit: string;
}

interface BalanceSheet {
  assets: { name: string; amount: string }[];
  liabilities: { name: string; amount: string }[];
  equity: { name: string; amount: string }[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  balanced: boolean;
}

interface CashFlow {
  operating: string;
  investing: string;
  financing: string;
  netCashFlow: string;
}

interface ReconLine {
  id: string;
  txn_date: string;
  amount: string;
  description: string | null;
  suggestion: { kind: string } | null;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string | null;
  hsn_sac: string | null;
  gst_rate: string | null;
}

interface DocumentRow {
  id: string;
  doc_kind: string;
  doc_number: number | string;
  doc_date: string;
  status: string;
  subtotal: string;
  gst_rate: string;
  inter_state: boolean;
  reference: string | null;
  party_ledger_id: string | null;
}

type TabId = "overview" | "coa" | "entry" | "invoices" | "reports" | "reconcile" | "arap" | "gst" | "inventory" | "controls" | "taxfiling" | "pricing" | "payterms" | "subscriptions" | "closing" | "dimensions" | "finreports" | "fx" | "assets" | "automation" | "compliance" | "settlement" | "documents";
type ReportId = "tb" | "pl" | "bs" | "cf";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function currentFy(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 3
    ? `${y}-${String((y + 1) % 100).padStart(2, "0")}`
    : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Render an API money string (e.g. "11800.00") with a ₹ prefix, untouched.
function rupee(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s ? `₹${s}` : "₹0.00";
}

const NATURE_STYLE: Record<Nature, string> = {
  ASSET:     "bg-blue-900/30 text-blue-300 border border-blue-700/40",
  LIABILITY: "bg-amber-900/30 text-amber-300 border border-amber-700/40",
  INCOME:    "bg-green-900/30 text-green-300 border border-green-700/40",
  EXPENSE:   "bg-red-900/30 text-red-300 border border-red-700/40",
  EQUITY:    "bg-purple-900/30 text-purple-300 border border-purple-700/40",
};

const GST_RATES = [0, 5, 12, 18, 28] as const;
const WRITE_ROLES = new Set(["super_admin", "owner", "finance_manager", "accountant"]);

const DOC_KINDS = [
  { id: "INVOICE", label: "Tax Invoice" },
  { id: "ESTIMATE", label: "Estimate / Quote" },
] as const;
type DocKindId = (typeof DOC_KINDS)[number]["id"];

// ── Line-item editor types + math (mirrors backend mappers.splitGst) ──────────
interface LineDraft {
  key: string;
  itemId: string;
  description: string;
  qty: string;       // user string
  rate: string;      // user string (per-unit, pre-tax)
  discount: string;  // user string (absolute amount off the line)
  hsn: string;
  gstRate: number;   // per-line GST %
}

interface LineCalc {
  taxable: number;   // qty*rate - discount (>= 0)
  cgst: number;
  sgst: number;
  igst: number;
  gross: number;
}

function newLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    itemId: "", description: "", qty: "1", rate: "", discount: "", hsn: "", gstRate: 18,
  };
}

// Round HALF_UP to 2dp — display value; backend keeps 4dp at posting time.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Per-line split. Intra-state: CGST = SGST = taxable*rate/200; inter-state: IGST = taxable*rate/100.
function computeLine(l: LineDraft, interState: boolean): LineCalc {
  const qty = Number(l.qty) || 0;
  const rate = Number(l.rate) || 0;
  const disc = Number(l.discount) || 0;
  const taxable = Math.max(0, qty * rate - disc);
  const tax = (taxable * l.gstRate) / 100;
  if (interState) {
    return { taxable, cgst: 0, sgst: 0, igst: tax, gross: taxable + tax };
  }
  const half = tax / 2;
  return { taxable, cgst: half, sgst: half, igst: 0, gross: taxable + tax };
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL REUSABLE PIECES
// ─────────────────────────────────────────────────────────────────────────────
function NaturePill({ nature }: { nature: string }) {
  const key = (nature || "").toUpperCase() as Nature;
  const cls = NATURE_STYLE[key] ?? "bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{key || "—"}</span>;
}

function BalancedBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-900/30 text-green-300 border border-green-700/40">
      <CheckCircle2 size={12} /> Balanced
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-700/40">
      <XCircle size={12} /> Out of balance
    </span>
  );
}

function StatCard({ label, value, tint }: { label: string; value: string; tint?: "green" | "red" }) {
  const color =
    tint === "green" ? "text-green-400" : tint === "red" ? "text-red-400" : "text-[var(--color-primary)]";
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex-1 min-w-[150px]">
      <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-[var(--color-border)]">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-3">
              <div
                className="h-3 rounded bg-[var(--color-border)] animate-pulse"
                style={{ width: `${40 + ((r + c) % 4) * 15}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex-1 min-w-[150px]">
          <div className="h-3 w-20 rounded bg-[var(--color-border)] animate-pulse" />
          <div className="h-5 w-24 rounded bg-[var(--color-border)] animate-pulse mt-2" />
        </div>
      ))}
    </div>
  );
}

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksPage() {
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.has(user?.role ?? "");

  const [tab, setTab] = useState<TabId>("overview");

  const [groups, setGroups] = useState<Group[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // ── shared data load ─────────────────────────────────────────────────────────
  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [g, l] = await Promise.all([
        api.get<Group[]>("/api/books/groups"),
        api.get<Ledger[]>("/api/books/ledgers"),
      ]);
      setGroups(Array.isArray(g) ? g : []);
      setLedgers(Array.isArray(l) ? l : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const seed = useCallback(async () => {
    setSeeding(true);
    try {
      const res = await api.post<{ ok: boolean; groups: number; ledgers: number }>("/api/books/seed", {});
      toast.success(`Books set up · ${res?.groups ?? 0} groups, ${res?.ledgers ?? 0} ledgers`);
      await loadBase();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSeeding(false);
    }
  }, [loadBase]);

  const needsSetup = loaded && !loading && groups.length === 0;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "overview",  label: "Overview",          icon: <LayoutGrid size={14} /> },
    { id: "coa",       label: "Chart of Accounts", icon: <ListTree size={14} /> },
    { id: "entry",     label: "New entry",         icon: <FilePlus2 size={14} /> },
    { id: "invoices",  label: "Invoices",          icon: <FileText size={14} /> },
    { id: "reports",   label: "Reports",           icon: <BarChart3 size={14} /> },
    { id: "reconcile", label: "Reconcile",         icon: <Repeat size={14} /> },
    { id: "arap",      label: "Receivables/Payables", icon: <Receipt size={14} /> },
    { id: "gst",       label: "GST & Tax",         icon: <Percent size={14} /> },
    { id: "inventory", label: "Inventory",         icon: <Boxes size={14} /> },
    { id: "controls",  label: "Controls",          icon: <SlidersHorizontal size={14} /> },
    { id: "taxfiling", label: "Tax Filing",        icon: <Landmark size={14} /> },
    { id: "pricing",   label: "Pricing",           icon: <Tag size={14} /> },
    { id: "payterms",  label: "Payment Terms",     icon: <CalendarClock size={14} /> },
    { id: "subscriptions", label: "Subscriptions", icon: <Layers size={14} /> },
    { id: "documents", label: "Documents",         icon: <Files size={14} /> },
    { id: "closing",   label: "Closing",           icon: <Lock size={14} /> },
    { id: "dimensions", label: "Cost Centres",     icon: <Split size={14} /> },
    { id: "finreports", label: "Financial Reports", icon: <FileBarChart size={14} /> },
    { id: "fx",        label: "Multi-Currency",    icon: <Coins size={14} /> },
    { id: "assets",    label: "Fixed Assets",      icon: <Building2 size={14} /> },
    { id: "compliance", label: "Compliance",       icon: <ShieldCheck size={14} /> },
    { id: "settlement", label: "Settlements",      icon: <Scale size={14} /> },
    { id: "automation", label: "Automation",       icon: <Workflow size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* HEADER */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BookOpen size={20} className="text-[var(--color-primary)]" />
          Books — double-entry ledger
        </h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Tally-grade GL · GST-ready</p>
      </div>

      {/* PILL TAB BAR */}
      <div className="px-4 sm:px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/40">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                disabled={needsSetup && t.id !== "overview"}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
      </div>

      {/* BODY */}
      <div className="px-4 sm:px-6 py-5 pb-12">
        {needsSetup ? (
          <EmptyState onSeed={seed} seeding={seeding} canWrite={canWrite} />
        ) : (
          <>
            {tab === "overview" && <OverviewTab loading={loading} />}
            {tab === "coa" && (
              <ChartOfAccountsTab
                loading={loading}
                groups={groups}
                ledgers={ledgers}
                canWrite={canWrite}
                onReload={loadBase}
              />
            )}
            {tab === "entry" && (
              <NewEntryTab ledgers={ledgers} canWrite={canWrite} />
            )}
            {tab === "invoices" && (
              <InvoicesTab ledgers={ledgers} canWrite={canWrite} />
            )}
            {tab === "reports" && <ReportsTab />}
            {tab === "reconcile" && (
              <ReconcileTab ledgers={ledgers} canWrite={canWrite} />
            )}
            {tab === "arap" && <BooksReceivablesTab />}
            {tab === "gst" && <BooksGstTab />}
            {tab === "inventory" && <BooksInventoryTab canWrite={canWrite} />}
            {tab === "controls" && <BooksAdminTab />}
            {tab === "taxfiling" && <BooksTaxFilingTab />}
            {tab === "pricing" && <BooksPricingTab />}
            {tab === "payterms" && <BooksPaymentTermsTab />}
            {tab === "subscriptions" && <BooksSubscriptionsTab />}
            {tab === "documents" && <BooksDocumentsTab canWrite={canWrite} />}
            {tab === "closing" && <BooksClosingTab />}
            {tab === "dimensions" && <BooksDimensionsTab canWrite={canWrite} />}
            {tab === "finreports" && <BooksReportsProTab />}
            {tab === "fx" && <BooksFxTab />}
            {tab === "assets" && <BooksAssetsTab />}
            {tab === "compliance" && <BooksComplianceTab canWrite={canWrite} />}
            {tab === "settlement" && <BooksSettlementTab />}
            {tab === "automation" && <BooksAutomationTab />}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ onSeed, seeding, canWrite }: { onSeed: () => void; seeding: boolean; canWrite: boolean }) {
  return (
    <div className="max-w-md mx-auto text-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-8 mt-8">
      <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/15 flex items-center justify-center mx-auto mb-4">
        <BookOpen size={24} className="text-[var(--color-primary)]" />
      </div>
      <h2 className="text-lg font-semibold">Set up your books</h2>
      <p className="text-sm text-[var(--color-muted)] mt-2">
        Create the chart of accounts — 28 account groups and the default ledgers — so you can start
        posting double-entry vouchers.
      </p>
      <button type="button" onClick={onSeed} disabled={seeding || !canWrite} className={`${btnPrimary} mt-5 mx-auto`}>
        {seeding ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
        {seeding ? "Setting up…" : "Set up my books"}
      </button>
      {!canWrite && (
        <p className="text-[11px] text-[var(--color-muted)] mt-3">
          You need an owner / finance / accountant role to set up the books.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ loading }: { loading: boolean }) {
  const fy = currentFy();
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [pl, setPl] = useState<ProfitLoss | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const [t, p] = await Promise.all([
          api.get<TrialBalance>(`/api/books/reports/trial-balance?fy=${fy}`),
          api.get<ProfitLoss>(`/api/books/reports/profit-loss?fy=${fy}`),
        ]);
        if (!cancelled) {
          setTb(t);
          setPl(p);
        }
      } catch (e) {
        if (!cancelled) toast.error(errMsg(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fy]);

  if (loading || busy) return <CardSkeleton />;

  const balanced = !!tb?.balanced;

  return (
    <div className="space-y-5">
      <div
        className={`rounded-lg px-4 py-3 text-sm font-medium border ${
          balanced
            ? "bg-green-900/30 text-green-300 border-green-700/40"
            : "bg-red-900/30 text-red-300 border-red-700/40"
        }`}
      >
        {balanced ? (
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 size={16} /> Books are balanced — debits equal credits for FY {fy}.
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <XCircle size={16} /> Books are out of balance for FY {fy}.
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <StatCard label="Total debit" value={rupee(tb?.totalDebit)} />
        <StatCard label="Total credit" value={rupee(tb?.totalCredit)} />
        <StatCard
          label="Trial balance"
          value={balanced ? "Balanced ✓" : "Off ✗"}
          tint={balanced ? "green" : "red"}
        />
        <StatCard
          label="Net profit"
          value={rupee(pl?.netProfit)}
          tint={Number(pl?.netProfit ?? 0) < 0 ? "red" : "green"}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART OF ACCOUNTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function ChartOfAccountsTab({
  loading, groups, ledgers, canWrite, onReload,
}: {
  loading: boolean;
  groups: Group[];
  ledgers: Ledger[];
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [isBank, setIsBank] = useState(false);
  const [isParty, setIsParty] = useState(false);
  const [opening, setOpening] = useState("");
  const [openingIsDebit, setOpeningIsDebit] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Enter a ledger name");
      return;
    }
    if (!groupId) {
      toast.error("Pick an account group");
      return;
    }
    setSaving(true);
    try {
      await api.post<Ledger>("/api/books/ledgers", {
        name: name.trim(),
        group_id: groupId,
        is_party: isParty,
        is_bank: isBank,
        opening_balance: opening.trim() || "0",
        opening_is_debit: openingIsDebit,
      });
      toast.success(`Ledger "${name.trim()}" created`);
      setName("");
      setGroupId("");
      setIsBank(false);
      setIsParty(false);
      setOpening("");
      setOpeningIsDebit(true);
      setOpen(false);
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
        <table className="w-full text-sm">
          <tbody>
            <SkeletonRows cols={3} />
          </tbody>
        </table>
      </div>
    );
  }

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? "Ungrouped";
  const groupNature = (id: string) => groups.find((g) => g.id === id)?.nature ?? "ASSET";

  // group ledgers by their account group, preserving the order groups arrive in
  const byGroup = groups
    .map((g) => ({ group: g, items: ledgers.filter((l) => l.group_id === g.id) }))
    .filter((s) => s.items.length > 0);
  const orphanLedgers = ledgers.filter((l) => !groups.some((g) => g.id === l.group_id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">
          {ledgers.length} ledgers · {groups.length} groups
        </p>
        {canWrite && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>
            <Plus size={14} /> New ledger
          </button>
        )}
      </div>

      {open && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New ledger</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Ledger name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Pvt Ltd" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Account group</label>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
                <option value="">Select a group…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.nature})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Opening balance</label>
              <div className="flex gap-2">
                <input
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`${inputCls} font-mono tabular-nums`}
                />
                <select
                  value={openingIsDebit ? "dr" : "cr"}
                  onChange={(e) => setOpeningIsDebit(e.target.value === "dr")}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="dr">Dr</option>
                  <option value="cr">Cr</option>
                </select>
              </div>
            </div>
            <div className="flex items-end gap-5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={isBank} onChange={(e) => setIsBank(e.target.checked)} className="accent-[var(--color-primary)] w-4 h-4" />
                Bank / cash
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={isParty} onChange={(e) => setIsParty(e.target.checked)} className="accent-[var(--color-primary)] w-4 h-4" />
                Party (customer/vendor)
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Create ledger
            </button>
          </div>
        </div>
      )}

      {ledgers.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)] text-center py-10 border border-dashed border-[var(--color-border)] rounded-lg">
          No ledgers yet.
        </p>
      ) : (
        <div className="space-y-5">
          {byGroup.map(({ group, items }) => (
            <div key={group.id}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold">{group.name}</h3>
                <NaturePill nature={group.nature} />
                <span className="text-[11px] text-[var(--color-muted)] tabular-nums">{items.length}</span>
              </div>
              <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {items.map((l) => (
                      <tr key={l.id} className="border-b border-[var(--color-border)] last:border-b-0">
                        <td className="px-3 py-2.5">
                          <span className="font-medium">{l.name}</span>
                          {!l.is_active && <span className="ml-2 text-[10px] text-[var(--color-muted)]">(inactive)</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1.5">
                            {l.is_bank && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]">Bank</span>}
                            {l.is_party && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]">Party</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">
                          {rupee(l.opening_balance)} {l.opening_is_debit ? "Dr" : "Cr"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {orphanLedgers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold">Ungrouped</h3>
              </div>
              <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {orphanLedgers.map((l) => (
                      <tr key={l.id} className="border-b border-[var(--color-border)] last:border-b-0">
                        <td className="px-3 py-2.5 font-medium">{l.name}</td>
                        <td className="px-3 py-2.5 text-[var(--color-muted)] text-xs">
                          {groupName(l.group_id)} · <NaturePill nature={groupNature(l.group_id)} />
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">
                          {rupee(l.opening_balance)} {l.opening_is_debit ? "Dr" : "Cr"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW ENTRY TAB
// ─────────────────────────────────────────────────────────────────────────────
function NewEntryTab({ ledgers, canWrite }: { ledgers: Ledger[]; canWrite: boolean }) {
  const [recent, setRecent] = useState<VoucherRow[]>([]);
  const [recentBusy, setRecentBusy] = useState(true);

  const partyLedgers = ledgers.filter((l) => l.is_party);
  const customerOptions = partyLedgers.length > 0 ? partyLedgers : ledgers;
  const bankLedgers = ledgers.filter((l) => l.is_bank || /cash/i.test(l.name));
  const bankOptions = bankLedgers.length > 0 ? bankLedgers : ledgers;

  const loadRecent = useCallback(async () => {
    setRecentBusy(true);
    try {
      const v = await api.get<VoucherRow[]>("/api/books/vouchers");
      setRecent(Array.isArray(v) ? v.slice(0, 10) : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRecentBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const reverse = useCallback(
    async (v: VoucherRow) => {
      if (!window.confirm(`Reverse voucher ${v.voucher_type} #${v.voucher_number}? This posts a reversing entry.`)) return;
      try {
        await api.post<{ voucherId: string }>(`/api/books/vouchers/${v.id}/reverse`, {});
        toast.success(`Reversed #${v.voucher_number}`);
        await loadRecent();
      } catch (e) {
        toast.error(errMsg(e));
      }
    },
    [loadRecent],
  );

  if (!canWrite) {
    return (
      <p className="text-sm text-[var(--color-muted)] text-center py-10 border border-dashed border-[var(--color-border)] rounded-lg">
        You need an owner / finance / accountant role to post entries.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SalesCard customers={customerOptions} onPosted={loadRecent} />
        <ReceiptPaymentCard kind="receipt" banks={bankOptions} parties={customerOptions} onPosted={loadRecent} />
        <ReceiptPaymentCard kind="payment" banks={bankOptions} parties={customerOptions} onPosted={loadRecent} />
      </div>

      {/* RECENT VOUCHERS */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent vouchers</h3>
          <button type="button" onClick={() => void loadRecent()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={recentBusy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Date</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Type</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Number</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Narration</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentBusy ? (
                <SkeletonRows cols={5} rows={5} />
              ) : recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted)]">No vouchers yet.</td>
                </tr>
              ) : (
                recent.map((v) => (
                  <tr key={v.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{v.voucher_date}</td>
                    <td className="px-3 py-2.5 capitalize">{v.voucher_type}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{v.voucher_number}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] truncate max-w-[220px]">
                      {v.is_cancelled ? <span className="text-red-400">Cancelled · </span> : null}
                      {v.narration || v.reference || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => reverse(v)}
                        disabled={v.is_cancelled}
                        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={v.is_cancelled ? "Already cancelled" : "Reverse"}
                      >
                        <Undo2 size={13} /> Reverse
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Sales invoice card ─────────────────────────────────────────────────────────
function SalesCard({ customers, onPosted }: { customers: Ledger[]; onPosted: () => Promise<void> }) {
  const [customerLedgerId, setCustomerLedgerId] = useState("");
  const [lineTotal, setLineTotal] = useState("");
  const [gstRate, setGstRate] = useState<number>(18);
  const [interState, setInterState] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const base = Number(lineTotal) || 0;
  const taxAmt = (base * gstRate) / 100;
  const half = taxAmt / 2;
  const gross = base + taxAmt;
  const fmt = (n: number) => `₹${n.toFixed(2)}`;

  const submit = async () => {
    if (!customerLedgerId) {
      toast.error("Pick a customer ledger");
      return;
    }
    if (base <= 0) {
      toast.error("Enter a line total above zero");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ voucherId: string; voucherNumber: string }>("/api/books/documents/sales", {
        customerLedgerId,
        lineTotal: base,
        gstRate,
        interState,
        date,
        reference: reference.trim() || undefined,
      });
      toast.success(`Posted voucher #${res?.voucherNumber ?? ""}`);
      setLineTotal("");
      setReference("");
      await onPosted();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 flex flex-col">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        <FilePlus2 size={15} className="text-[var(--color-primary)]" /> Sales invoice
      </h3>
      <div className="space-y-3 flex-1">
        <div>
          <label className={labelCls}>Customer</label>
          <select value={customerLedgerId} onChange={(e) => setCustomerLedgerId(e.target.value)} className={inputCls}>
            <option value="">Select customer…</option>
            {customers.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Line total</label>
            <input value={lineTotal} onChange={(e) => setLineTotal(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>GST rate</label>
            <select value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} className={inputCls}>
              {GST_RATES.map((r) => (
                <option key={r} value={r}>{r}%</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
            <input type="checkbox" checked={interState} onChange={(e) => setInterState(e.target.checked)} className="accent-[var(--color-primary)] w-4 h-4" />
            Inter-state
          </label>
        </div>
        <div>
          <label className={labelCls}>Reference (optional)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO / note" className={inputCls} />
        </div>

        {/* live GST split preview */}
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Taxable</span><span className="tabular-nums">{fmt(base)}</span></div>
          {interState ? (
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">IGST @ {gstRate}%</span><span className="tabular-nums">{fmt(taxAmt)}</span></div>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">CGST @ {gstRate / 2}%</span><span className="tabular-nums">{fmt(half)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">SGST @ {gstRate / 2}%</span><span className="tabular-nums">{fmt(half)}</span></div>
            </>
          )}
          <div className="flex justify-between border-t border-[var(--color-border)] pt-1 mt-1 font-semibold">
            <span>Gross</span><span className="tabular-nums text-[var(--color-primary)]">{fmt(gross)}</span>
          </div>
        </div>
      </div>
      <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} mt-4 w-full`}>
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
        Post sales invoice
      </button>
    </div>
  );
}

// ── Receipt / Payment card (same shape) ──────────────────────────────────────
function ReceiptPaymentCard({
  kind, banks, parties, onPosted,
}: {
  kind: "receipt" | "payment";
  banks: Ledger[];
  parties: Ledger[];
  onPosted: () => Promise<void>;
}) {
  const [bankLedgerId, setBankLedgerId] = useState("");
  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const isReceipt = kind === "receipt";
  const title = isReceipt ? "Receipt" : "Payment";

  const submit = async () => {
    if (!bankLedgerId) {
      toast.error("Pick a bank / cash ledger");
      return;
    }
    if (!partyLedgerId) {
      toast.error("Pick a party ledger");
      return;
    }
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      toast.error("Enter an amount above zero");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ voucherId?: string; voucherNumber?: string }>(
        `/api/books/documents/${kind}`,
        { bankLedgerId, partyLedgerId, amount: amt, date, reference: reference.trim() || undefined },
      );
      toast.success(res?.voucherNumber ? `Posted voucher #${res.voucherNumber}` : `${title} posted`);
      setAmount("");
      setReference("");
      await onPosted();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 flex flex-col">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        {isReceipt ? <ArrowDownToLine size={15} className="text-[var(--color-primary)]" /> : <FilePlus2 size={15} className="text-[var(--color-primary)]" />}
        {title}
      </h3>
      <div className="space-y-3 flex-1">
        <div>
          <label className={labelCls}>Bank / cash</label>
          <select value={bankLedgerId} onChange={(e) => setBankLedgerId(e.target.value)} className={inputCls}>
            <option value="">Select account…</option>
            {banks.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Party</label>
          <select value={partyLedgerId} onChange={(e) => setPartyLedgerId(e.target.value)} className={inputCls}>
            <option value="">Select party…</option>
            {parties.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Amount</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Reference (optional)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / note" className={inputCls} />
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">
          {isReceipt
            ? "Money received into the bank/cash account from the party."
            : "Money paid out of the bank/cash account to the party."}
        </p>
      </div>
      <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} mt-4 w-full`}>
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
        Post {title.toLowerCase()}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICES TAB — real multi-line document editor (estimate / tax invoice)
// ─────────────────────────────────────────────────────────────────────────────
function InvoicesTab({ ledgers, canWrite }: { ledgers: Ledger[]; canWrite: boolean }) {
  const partyLedgers = ledgers.filter((l) => l.is_party);
  const customerOptions = partyLedgers.length > 0 ? partyLedgers : ledgers;

  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [listBusy, setListBusy] = useState(true);

  const loadDocs = useCallback(async () => {
    setListBusy(true);
    try {
      const rows = await api.get<DocumentRow[]>("/api/books/documents");
      setDocs(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setListBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  if (!canWrite) {
    return (
      <p className="text-sm text-[var(--color-muted)] text-center py-10 border border-dashed border-[var(--color-border)] rounded-lg">
        You need an owner / finance / accountant role to create documents.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <DocumentEditor customers={customerOptions} onSaved={loadDocs} />
      <DocumentList docs={docs} busy={listBusy} onReload={loadDocs} />
    </div>
  );
}

// Open an authenticated GET in a new tab by passing the bearer token as a query
// param (the print/PDF endpoint can't see the Authorization header on window.open).
function openAuthed(path: string) {
  const token = localStorage.getItem("hr_access");
  const url = `${API_BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token ?? "")}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function DocumentList({ docs, busy, onReload }: { docs: DocumentRow[]; busy: boolean; onReload: () => Promise<void> }) {
  const [sendingId, setSendingId] = useState<string | null>(null);

  const send = async (d: DocumentRow) => {
    setSendingId(d.id);
    try {
      await api.post<{ ok: boolean }>(`/api/books/documents/${d.id}/send`, {});
      toast.success(`Sent ${d.doc_kind} #${d.doc_number}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <h3 className="text-sm font-semibold">Documents</h3>
        <button type="button" onClick={() => void onReload()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <Th>Date</Th>
              <Th>Kind</Th>
              <Th>Number</Th>
              <Th>Status</Th>
              <Th right>Subtotal</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <SkeletonRows cols={6} rows={5} />
            ) : docs.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">No documents yet — create one above.</td></tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{d.doc_date}</td>
                  <td className="px-3 py-2.5 capitalize">{String(d.doc_kind).toLowerCase().replace(/_/g, " ")}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{d.doc_number}</td>
                  <td className="px-3 py-2.5 text-xs">{d.status}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(d.subtotal)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openAuthed(`/api/books/documents/${d.id}/print`)}
                      className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] mr-3"
                      title="Print / PDF"
                    >
                      <Printer size={13} /> Print
                    </button>
                    <button
                      type="button"
                      onClick={() => send(d)}
                      disabled={sendingId === d.id}
                      className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] disabled:opacity-40"
                      title="Send by email / WhatsApp"
                    >
                      {sendingId === d.id ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />} Send
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thLine = "px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] text-left";
const tdLineInput =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]";

function DocumentEditor({ customers, onSaved }: { customers: Ledger[]; onSaved: () => Promise<void> }) {
  const [docKind, setDocKind] = useState<DocKindId>("INVOICE");
  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [docDate, setDocDate] = useState(todayIso());
  const [interState, setInterState] = useState(false);
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Load the inventory items for the item picker (optional — silent if unavailable).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get<InventoryItem[]>("/api/books/inventory/items");
        if (!cancelled) setItems(Array.isArray(rows) ? rows : []);
      } catch {
        /* items list optional; ignore */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, newLine()]);
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  const pickItem = (key: string, itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    if (!it) { setLine(key, { itemId: "" }); return; }
    const rate = Number(it.gst_rate);
    setLine(key, {
      itemId,
      description: it.name,
      hsn: it.hsn_sac ?? "",
      gstRate: GST_RATES.includes(rate as (typeof GST_RATES)[number]) ? rate : 18,
    });
  };

  // Live per-line + document totals (rounded once per line, then summed — mirrors
  // how the backend posts each line at full precision and presents at 2dp).
  const calcs = useMemo(() => lines.map((l) => computeLine(l, interState)), [lines, interState]);
  const totals = useMemo(() => {
    const t = calcs.reduce(
      (a, c) => ({
        taxable: a.taxable + c.taxable,
        cgst: a.cgst + c.cgst,
        sgst: a.sgst + c.sgst,
        igst: a.igst + c.igst,
        gross: a.gross + c.gross,
      }),
      { taxable: 0, cgst: 0, sgst: 0, igst: 0, gross: 0 },
    );
    return {
      taxable: round2(t.taxable),
      cgst: round2(t.cgst),
      sgst: round2(t.sgst),
      igst: round2(t.igst),
      grand: round2(t.gross),
    };
  }, [calcs]);

  // A single representative GST rate for the legacy single-rate posting path.
  const uniformRate = useMemo(() => {
    const rates = new Set(lines.map((l) => l.gstRate));
    return rates.size === 1 ? [...rates][0] : null;
  }, [lines]);

  const fmt = (n: number) => `₹${n.toFixed(2)}`;

  const submit = async () => {
    if (!partyLedgerId) { toast.error("Pick a customer"); return; }
    const filled = lines.filter((l) => (Number(l.qty) || 0) > 0 && (Number(l.rate) || 0) > 0);
    if (filled.length === 0) { toast.error("Add at least one line with qty and rate"); return; }
    if (filled.some((l) => !l.description.trim())) { toast.error("Each line needs a description"); return; }
    setSaving(true);
    try {
      // BACKWARD-COMPATIBLE payload: always send subtotal (sum of taxable) +
      // gst_rate (uniform rate, else 0) + inter_state — the exact single-line
      // shape today's backend posts from. lines[] is extra detail it stores as-is.
      const payload = {
        docKind,
        docDate,
        partyLedgerId,
        subtotal: totals.taxable,
        gstRate: uniformRate ?? 0,
        interState,
        hsn: filled[0]?.hsn || undefined,
        reference: reference.trim() || undefined,
        narration: narration.trim() || undefined,
        lines: filled.map((l, i) => {
          const c = calcs[lines.indexOf(l)];
          return {
            itemId: l.itemId || undefined,
            description: l.description.trim(),
            qty: Number(l.qty) || 0,
            rate: Number(l.rate) || 0,
            discount: Number(l.discount) || 0,
            hsn: l.hsn || undefined,
            gstRate: l.gstRate,
            taxable: round2(c.taxable),
            cgst: round2(c.cgst),
            sgst: round2(c.sgst),
            igst: round2(c.igst),
            amount: round2(c.gross),
            lineNo: i + 1,
          };
        }),
      };
      const res = await api.post<{ id?: string; doc_number?: number | string }>("/api/books/documents", payload);
      toast.success(res?.doc_number ? `Saved ${docKind} #${res.doc_number}` : "Document saved");
      setLines([newLine()]);
      setReference("");
      setNarration("");
      await onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText size={15} className="text-[var(--color-primary)]" /> New document
        </h3>
      </div>

      {/* HEADER FIELDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Document type</label>
          <select value={docKind} onChange={(e) => setDocKind(e.target.value as DocKindId)} className={inputCls}>
            {DOC_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Customer</label>
          <select value={partyLedgerId} onChange={(e) => setPartyLedgerId(e.target.value)} className={inputCls}>
            <option value="">Select customer…</option>
            {customers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Reference (optional)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO / note" className={inputCls} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={interState} onChange={(e) => setInterState(e.target.checked)} className="accent-[var(--color-primary)] w-4 h-4" />
        Inter-state supply (IGST)
      </label>

      {/* LINE ITEMS */}
      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[820px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/40">
              <th className={thLine}>Item / Description</th>
              <th className={thLine}>HSN/SAC</th>
              <th className={`${thLine} text-right`}>Qty</th>
              <th className={`${thLine} text-right`}>Rate</th>
              <th className={`${thLine} text-right`}>Disc</th>
              <th className={`${thLine} text-right`}>GST%</th>
              <th className={`${thLine} text-right`}>Amount</th>
              <th className={thLine}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const c = computeLine(l, interState);
              return (
                <tr key={l.key} className="border-b border-[var(--color-border)] last:border-b-0 align-top">
                  <td className="px-2 py-2 min-w-[220px]">
                    {items.length > 0 && (
                      <select
                        value={l.itemId}
                        onChange={(e) => pickItem(l.key, e.target.value)}
                        className={`${tdLineInput} mb-1`}
                      >
                        <option value="">Pick item (optional)…</option>
                        {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                      </select>
                    )}
                    <input
                      value={l.description}
                      onChange={(e) => setLine(l.key, { description: e.target.value })}
                      placeholder="Description"
                      className={tdLineInput}
                    />
                  </td>
                  <td className="px-2 py-2 w-[100px]">
                    <input value={l.hsn} onChange={(e) => setLine(l.key, { hsn: e.target.value })} placeholder="HSN" className={`${tdLineInput} font-mono`} />
                  </td>
                  <td className="px-2 py-2 w-[80px]">
                    <input value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} inputMode="decimal" className={`${tdLineInput} text-right tabular-nums`} />
                  </td>
                  <td className="px-2 py-2 w-[100px]">
                    <input value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${tdLineInput} text-right tabular-nums`} />
                  </td>
                  <td className="px-2 py-2 w-[90px]">
                    <input value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} inputMode="decimal" placeholder="0" className={`${tdLineInput} text-right tabular-nums`} />
                  </td>
                  <td className="px-2 py-2 w-[80px]">
                    <select value={l.gstRate} onChange={(e) => setLine(l.key, { gstRate: Number(e.target.value) })} className={`${tdLineInput} text-right`}>
                      {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap w-[110px]">{fmt(round2(c.gross))}</td>
                  <td className="px-2 py-2 text-right w-[36px]">
                    <button type="button" onClick={() => removeLine(l.key)} className="text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30" disabled={lines.length <= 1} title="Remove line">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]">
        <Plus size={14} /> Add line
      </button>

      {/* TOTALS + NARRATION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div>
          <label className={labelCls}>Narration (optional)</label>
          <textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={3} placeholder="Notes shown on the document" className={`${inputCls} resize-y`} />
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Subtotal (taxable)</span><span className="tabular-nums">{fmt(totals.taxable)}</span></div>
          {interState ? (
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">IGST</span><span className="tabular-nums">{fmt(totals.igst)}</span></div>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">CGST</span><span className="tabular-nums">{fmt(totals.cgst)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">SGST</span><span className="tabular-nums">{fmt(totals.sgst)}</span></div>
            </>
          )}
          <div className="flex justify-between border-t border-[var(--color-border)] pt-1 mt-1 font-semibold text-base">
            <span>Grand total</span><span className="tabular-nums text-[var(--color-primary)]">{fmt(totals.grand)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          Save {docKind === "INVOICE" ? "invoice" : "estimate"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function ReportsTab() {
  const [report, setReport] = useState<ReportId>("tb");
  const [fy, setFy] = useState(currentFy());
  const [from, setFrom] = useState(`${fy.slice(0, 4)}-04-01`);
  const [to, setTo] = useState(todayIso());

  const [busy, setBusy] = useState(false);
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [pl, setPl] = useState<ProfitLoss | null>(null);
  const [bs, setBs] = useState<BalanceSheet | null>(null);
  const [cf, setCf] = useState<CashFlow | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      if (report === "tb") {
        setTb(await api.get<TrialBalance>(`/api/books/reports/trial-balance?fy=${fy}`));
      } else if (report === "pl") {
        setPl(await api.get<ProfitLoss>(`/api/books/reports/profit-loss?fy=${fy}`));
      } else if (report === "bs") {
        setBs(await api.get<BalanceSheet>(`/api/books/reports/balance-sheet?fy=${fy}`));
      } else {
        setCf(await api.get<CashFlow>(`/api/books/reports/cash-flow?from=${from}&to=${to}`));
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [report, fy, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const reportTabs: { id: ReportId; label: string }[] = [
    { id: "tb", label: "Trial Balance" },
    { id: "pl", label: "P&L" },
    { id: "bs", label: "Balance Sheet" },
    { id: "cf", label: "Cash Flow" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {reportTabs.map((r) => {
            const active = report === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setReport(r.id)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {report === "cf" ? (
            <>
              <div>
                <span className="text-[10px] text-[var(--color-muted)] block">From</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                <span className="text-[10px] text-[var(--color-muted)] block">To</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
              </div>
            </>
          ) : (
            <div>
              <span className="text-[10px] text-[var(--color-muted)] block">Financial year</span>
              <input value={fy} onChange={(e) => setFy(e.target.value)} placeholder="2026-27" className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] font-mono w-28" />
            </div>
          )}
          <button type="button" onClick={() => void load()} className="self-end p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {busy ? (
          <table className="w-full text-sm">
            <tbody>
              <SkeletonRows cols={3} />
            </tbody>
          </table>
        ) : report === "tb" ? (
          <TrialBalanceTable tb={tb} />
        ) : report === "pl" ? (
          <ProfitLossTable pl={pl} />
        ) : report === "bs" ? (
          <BalanceSheetTable bs={bs} />
        ) : (
          <CashFlowTable cf={cf} />
        )}
      </div>
    </div>
  );
}

function ReportHeader({ title, badge }: { title: string; badge?: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
      <h3 className="text-sm font-semibold">{title}</h3>
      {badge}
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function TrialBalanceTable({ tb }: { tb: TrialBalance | null }) {
  const rows = tb?.ledgers ?? [];
  return (
    <>
      <ReportHeader title="Trial Balance" badge={tb ? <BalancedBadge ok={tb.balanced} /> : null} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <Th>Ledger</Th>
              <Th>Nature</Th>
              <Th right>Debit</Th>
              <Th right>Credit</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-[var(--color-muted)]">No balances.</td></tr>
            ) : (
              rows.map((l, i) => (
                <tr key={`${l.name}-${i}`} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2.5 font-medium">{l.name}</td>
                  <td className="px-3 py-2.5"><NaturePill nature={l.nature} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(l.debit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(l.credit)}</td>
                </tr>
              ))
            )}
          </tbody>
          {tb && (
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] font-semibold">
                <td className="px-3 py-2.5" colSpan={2}>Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{rupee(tb.totalDebit)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{rupee(tb.totalCredit)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

function SectionTable({ title, rows, totalLabel, total }: { title: string; rows: { name: string; amount: string }[]; totalLabel: string; total: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <Th>{title}</Th>
            <Th right>Amount</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={2} className="px-3 py-6 text-center text-[var(--color-muted)]">None.</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-b border-[var(--color-border)]">
                <td className="px-3 py-2.5">{r.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.amount)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--color-border)] font-semibold">
            <td className="px-3 py-2.5">{totalLabel}</td>
            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{rupee(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ProfitLossTable({ pl }: { pl: ProfitLoss | null }) {
  const net = Number(pl?.netProfit ?? 0);
  return (
    <>
      <ReportHeader title="Profit & Loss" />
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--color-border)]">
        <SectionTable title="Income" rows={pl?.income ?? []} totalLabel="Total income" total={pl?.totalIncome ?? "0.00"} />
        <SectionTable title="Expense" rows={pl?.expense ?? []} totalLabel="Total expense" total={pl?.totalExpense ?? "0.00"} />
      </div>
      <div className={`px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-between text-sm font-semibold ${net < 0 ? "text-red-400" : "text-green-400"}`}>
        <span>{net < 0 ? "Net loss" : "Net profit"}</span>
        <span className="tabular-nums">{rupee(pl?.netProfit)}</span>
      </div>
    </>
  );
}

function BalanceSheetTable({ bs }: { bs: BalanceSheet | null }) {
  return (
    <>
      <ReportHeader title="Balance Sheet" badge={bs ? <BalancedBadge ok={bs.balanced} /> : null} />
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--color-border)]">
        <SectionTable title="Assets" rows={bs?.assets ?? []} totalLabel="Total assets" total={bs?.totalAssets ?? "0.00"} />
        <SectionTable title="Liabilities" rows={bs?.liabilities ?? []} totalLabel="Total liabilities" total={bs?.totalLiabilities ?? "0.00"} />
        <SectionTable title="Equity" rows={bs?.equity ?? []} totalLabel="Total equity" total={bs?.totalEquity ?? "0.00"} />
      </div>
    </>
  );
}

function CashFlowTable({ cf }: { cf: CashFlow | null }) {
  const rows: { label: string; value: string | undefined }[] = [
    { label: "Operating activities", value: cf?.operating },
    { label: "Investing activities", value: cf?.investing },
    { label: "Financing activities", value: cf?.financing },
  ];
  return (
    <>
      <ReportHeader title="Cash Flow" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <Th>Activity</Th>
              <Th right>Net cash</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-[var(--color-border)]">
                <td className="px-3 py-2.5">{r.label}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border)] font-semibold">
              <td className="px-3 py-2.5">Net cash flow</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${Number(cf?.netCashFlow ?? 0) < 0 ? "text-red-400" : "text-green-400"}`}>
                {rupee(cf?.netCashFlow)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILE TAB
// ─────────────────────────────────────────────────────────────────────────────
interface ParsedLine {
  date: string;
  amount: number;
  description: string;
}

function parseStatement(raw: string): ParsedLine[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",");
      const date = (parts[0] ?? "").trim();
      const amount = Number((parts[1] ?? "").trim());
      const description = parts.slice(2).join(",").trim();
      return { date, amount, description };
    })
    .filter((l) => l.date && Number.isFinite(l.amount));
}

function ReconcileTab({ ledgers, canWrite }: { ledgers: Ledger[]; canWrite: boolean }) {
  const bankLedgers = ledgers.filter((l) => l.is_bank || /cash/i.test(l.name));
  const bankOptions = bankLedgers.length > 0 ? bankLedgers : ledgers;
  const counterOptions = ledgers;

  const [bankLedgerId, setBankLedgerId] = useState("");
  const [raw, setRaw] = useState("");
  const [importing, setImporting] = useState(false);
  const [matching, setMatching] = useState(false);
  // --- Import bank statement file ---
  const [fileFormat, setFileFormat] = useState("OFX");
  const [fileBankLedgerId, setFileBankLedgerId] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileImporting, setFileImporting] = useState(false);
  const [inboxBusy, setInboxBusy] = useState(false);
  const [inbox, setInbox] = useState<ReconLine[]>([]);
  const [counters, setCounters] = useState<Record<string, string>>({});

  const parsed = parseStatement(raw);

  const loadInbox = useCallback(async () => {
    setInboxBusy(true);
    try {
      const rows = await api.get<ReconLine[]>("/api/books/recon/inbox");
      setInbox(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setInboxBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const doImport = async () => {
    if (!bankLedgerId) {
      toast.error("Pick a bank ledger first");
      return;
    }
    if (parsed.length === 0) {
      toast.error("Paste at least one line as date,amount,description");
      return;
    }
    setImporting(true);
    try {
      const res = await api.post<{ inserted: number }>("/api/books/recon/import", {
        bankLedgerId,
        lines: parsed.map((p) => ({ date: p.date, amount: p.amount, description: p.description })),
      });
      toast.success(`Imported ${res?.inserted ?? parsed.length} lines`);
      setRaw("");
      await loadInbox();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setImporting(false);
    }
  };

  const onFilePick = (e: { target: HTMLInputElement }) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setFileContent(typeof reader.result === "string" ? reader.result : "");
      } catch (err) {
        toast.error(errMsg(err));
      }
    };
    reader.onerror = () => toast.error("Could not read file");
    reader.readAsText(f);
  };

  const doImportFile = async () => {
    if (!fileBankLedgerId) {
      toast.error("Pick a bank ledger first");
      return;
    }
    if (!fileContent.trim()) {
      toast.error("Choose a file or paste statement contents");
      return;
    }
    setFileImporting(true);
    try {
      const res = await api.post<{ parsed?: number; imported?: number; inserted?: number }>(
        "/api/books/recon/import-file",
        { format: fileFormat, content: fileContent, bankLedgerId: fileBankLedgerId },
      );
      const imported = res?.imported ?? res?.inserted ?? 0;
      const parsedCount = res?.parsed ?? imported;
      toast.success(`Parsed ${parsedCount} · imported ${imported} line(s)`);
      setFileContent("");
      setFileName("");
      await loadInbox();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setFileImporting(false);
    }
  };

  const autoMatch = async () => {
    setMatching(true);
    try {
      const res = await api.post<{ matched: number; scanned: number }>("/api/books/recon/auto-match", {});
      toast.success(`Matched ${res?.matched ?? 0} of ${res?.scanned ?? 0} scanned`);
      await loadInbox();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setMatching(false);
    }
  };

  const confirm = async (line: ReconLine) => {
    const counterLedgerId = counters[line.id];
    if (!counterLedgerId) {
      toast.error("Pick a counter ledger");
      return;
    }
    try {
      await api.post<{ voucherId: string }>("/api/books/recon/confirm", { lineId: line.id, counterLedgerId });
      toast.success("Confirmed — voucher posted");
      setInbox((rows) => rows.filter((r) => r.id !== line.id));
      setCounters((c) => {
        const next = { ...c };
        delete next[line.id];
        return next;
      });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  if (!canWrite) {
    return (
      <p className="text-sm text-[var(--color-muted)] text-center py-10 border border-dashed border-[var(--color-border)] rounded-lg">
        You need an owner / finance / accountant role to reconcile.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4">Import bank statement</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className={labelCls}>Bank ledger</label>
            <select value={bankLedgerId} onChange={(e) => setBankLedgerId(e.target.value)} className={inputCls}>
              <option value="">Select account…</option>
              {bankOptions.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Statement lines · one per row as date,amount,description (+ inflow / − outflow)</label>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={5}
              placeholder={"2026-06-01,11800.00,NEFT from Acme\n2026-06-02,-5000.00,Rent payment"}
              className={`${inputCls} font-mono resize-y`}
            />
            <p className="text-[11px] text-[var(--color-muted)] mt-1 tabular-nums">{parsed.length} valid line(s) parsed</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" onClick={doImport} disabled={importing} className={btnPrimary}>
            {importing ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
            Import
          </button>
          <button
            type="button"
            onClick={autoMatch}
            disabled={matching}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-50"
          >
            {matching ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Auto-match
          </button>
        </div>
      </div>

      {/* IMPORT STATEMENT FILE */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4 inline-flex items-center gap-1.5">
          <FileText size={14} className="text-[var(--color-primary)]" /> Import bank statement file
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className={labelCls}>Format</label>
            <select value={fileFormat} onChange={(e) => setFileFormat(e.target.value)} className={inputCls}>
              <option value="OFX">OFX / QFX</option>
              <option value="QIF">QIF</option>
              <option value="CAMT.053">CAMT.053 (ISO 20022)</option>
              <option value="MT940">MT940 (SWIFT)</option>
              <option value="CSV">CSV</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <label className={labelCls}>Bank ledger</label>
            <select value={fileBankLedgerId} onChange={(e) => setFileBankLedgerId(e.target.value)} className={inputCls}>
              <option value="">Select account…</option>
              {bankOptions.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className={labelCls}>Statement file</label>
            <input
              type="file"
              accept=".ofx,.qfx,.qif,.xml,.sta,.txt,.csv,text/*"
              onChange={onFilePick}
              className="block w-full text-xs text-[var(--color-muted)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[var(--color-border)] file:bg-[var(--color-bg)] file:text-[var(--color-text)] file:text-xs file:font-semibold hover:file:border-[var(--color-primary)] file:cursor-pointer"
            />
            {fileName && <p className="text-[11px] text-[var(--color-muted)] mt-1 truncate">Loaded: {fileName}</p>}
          </div>
        </div>
        <div className="mt-4">
          <label className={labelCls}>…or paste file contents</label>
          <textarea
            value={fileContent}
            onChange={(e) => { setFileContent(e.target.value); if (fileName) setFileName(""); }}
            rows={5}
            placeholder="Paste raw OFX / QIF / CAMT.053 / MT940 / CSV here, or pick a file above"
            className={`${inputCls} font-mono resize-y`}
          />
          <p className="text-[11px] text-[var(--color-muted)] mt-1 tabular-nums">{fileContent.length} char(s)</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" onClick={doImportFile} disabled={fileImporting} className={btnPrimary}>
            {fileImporting ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
            Import file
          </button>
        </div>
      </div>

      {/* INBOX */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Unmatched lines <span className="text-[var(--color-muted)] tabular-nums">({inbox.length})</span></h3>
          <button type="button" onClick={() => void loadInbox()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={inboxBusy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Date</Th>
                <Th right>Amount</Th>
                <Th>Description</Th>
                <Th>Suggestion</Th>
                <Th>Counter ledger</Th>
                <Th right>Action</Th>
              </tr>
            </thead>
            <tbody>
              {inboxBusy ? (
                <SkeletonRows cols={6} rows={4} />
              ) : inbox.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">Nothing to reconcile — import statement lines above.</td></tr>
              ) : (
                inbox.map((line) => {
                  const inflow = Number(line.amount) >= 0;
                  return (
                    <tr key={line.id} className="border-b border-[var(--color-border)] last:border-b-0 align-middle">
                      <td className="px-3 py-2.5 whitespace-nowrap text-[var(--color-muted)]">{line.txn_date}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${inflow ? "text-green-400" : "text-red-400"}`}>{rupee(line.amount)}</td>
                      <td className="px-3 py-2.5 truncate max-w-[200px]">{line.description || "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] uppercase">
                          {line.suggestion?.kind || (inflow ? "RECEIPT" : "PAYMENT")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={counters[line.id] ?? ""}
                          onChange={(e) => setCounters((c) => ({ ...c, [line.id]: e.target.value }))}
                          className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] min-w-[150px]"
                        >
                          <option value="">Select ledger…</option>
                          {counterOptions.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => confirm(line)}
                          disabled={!counters[line.id]}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <CheckCircle2 size={12} /> Confirm
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
