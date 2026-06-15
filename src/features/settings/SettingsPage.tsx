import { useState, useEffect, useCallback } from "react";
import { useAuth, BASE } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Navigate, useNavigate } from "react-router-dom";
import { UserPlus, Trash2, Copy, CheckCircle2, Save, MessageCircle, Unlink, Lock, Users, Eye, SlidersHorizontal, RotateCcw, ChevronDown, Grid3x3, GitBranch, Plus, CalendarClock, History, ShieldQuestion, LogIn, FileText, Globe, Image, BellRing, Hash, Palette } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api";
import { ROLE_META, ASSIGNABLE_ROLES, CONFIGURABLE_ROLES, TAB_CATALOG, TAB_GROUPS, roleLabel, roleBadge } from "@/data/roles";
import type { UserRole } from "@/data/types";
import BillingCard from "./BillingCard";
import AppLockCard from "./AppLockCard";
import NotificationsCard from "./NotificationsCard";
import PrivacyCard from "./PrivacyCard";

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

/* ── #170 Role & Permission Matrix ─────────────────────────────────────────
   Team roles × permission grid, persisted. A simple grant table the owner can
   tune per role, separate from the page-level "stakeholder views" above. */
const MATRIX_ROLES = [
  { id: "finance", label: "Finance" },
  { id: "ca", label: "CA / Accountant" },
  { id: "sales", label: "Sales" },
  { id: "ops", label: "Operations" },
] as const;
const MATRIX_PERMS = [
  { id: "view_cash", label: "View cash & runway" },
  { id: "edit_txn", label: "Add / edit transactions" },
  { id: "approve_pay", label: "Approve payments" },
  { id: "manage_invoices", label: "Manage invoices" },
  { id: "view_reports", label: "View reports & exports" },
  { id: "manage_team", label: "Manage team & settings" },
] as const;
type MatrixRoleId = (typeof MATRIX_ROLES)[number]["id"];
type MatrixPermId = (typeof MATRIX_PERMS)[number]["id"];
type PermMatrix = Record<string, boolean>;
const matrixKey = (r: MatrixRoleId, p: MatrixPermId) => `${r}:${p}`;
const DEFAULT_MATRIX: PermMatrix = {
  "finance:view_cash": true, "finance:edit_txn": true, "finance:manage_invoices": true, "finance:view_reports": true,
  "ca:view_cash": true, "ca:view_reports": true,
  "sales:manage_invoices": true,
  "ops:view_cash": true, "ops:edit_txn": true,
};

function PermissionMatrixCard() {
  const [matrix, setMatrix] = useFeatureState<PermMatrix>("settings-permission-matrix", DEFAULT_MATRIX);
  const toggle = (r: MatrixRoleId, p: MatrixPermId) => {
    const k = matrixKey(r, p);
    setMatrix(m => ({ ...m, [k]: !m[k] }));
  };
  const grantedFor = (r: MatrixRoleId) => MATRIX_PERMS.filter(p => matrix[matrixKey(r, p.id)]).length;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <Grid3x3 size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Role &amp; Permission Matrix</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Tick exactly what each team type can do. Changes save automatically and sync across devices.</p>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left font-semibold text-[var(--color-muted)] uppercase tracking-wider py-2 pr-3">Permission</th>
              {MATRIX_ROLES.map(r => (
                <th key={r.id} className="text-center font-semibold py-2 px-2 whitespace-nowrap">
                  {r.label}
                  <span className="block text-[10px] font-normal text-[var(--color-muted)]">{grantedFor(r.id)}/{MATRIX_PERMS.length}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {MATRIX_PERMS.map(p => (
              <tr key={p.id}>
                <td className="py-2.5 pr-3 text-[var(--color-text)]">{p.label}</td>
                {MATRIX_ROLES.map(r => {
                  const on = !!matrix[matrixKey(r.id, p.id)];
                  return (
                    <td key={r.id} className="text-center py-2.5 px-2">
                      <input type="checkbox" checked={on} onChange={() => toggle(r.id, p.id)}
                        aria-label={`${r.label} — ${p.label}`}
                        className="accent-[var(--color-primary)] w-4 h-4 cursor-pointer" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── #171 Approval-Policy Builder ──────────────────────────────────────────
   Value-threshold maker-checker rules: above a rupee amount, a payment needs
   approval from a chosen role. Stored as an ordered list of rules. */
type ApprovalRule = { id: string; threshold: number; approver: MatrixRoleId; note: string };

function ApprovalPolicyCard() {
  const [rules, setRules] = useFeatureState<ApprovalRule[]>("settings-approval-rules", []);
  const [threshold, setThreshold] = useState("");
  const [approver, setApprover] = useState<MatrixRoleId>("finance");
  const [note, setNote] = useState("");

  const addRule = () => {
    const amt = Number(threshold);
    if (!amt || amt <= 0) { toast.error("Enter a threshold amount above zero"); return; }
    const rule: ApprovalRule = { id: crypto.randomUUID(), threshold: amt, approver, note: note.trim() };
    setRules(rs => [...rs, rule].sort((a, b) => a.threshold - b.threshold));
    setThreshold(""); setNote("");
    toast.success(`Payments over ${formatCurrency(amt)} now need ${MATRIX_ROLES.find(r => r.id === approver)?.label} approval`);
  };
  const removeRule = (id: string) => setRules(rs => rs.filter(r => r.id !== id));

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <GitBranch size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Approval Policy</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Maker-checker rules — require a second approver once a payment crosses an amount.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-4">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Payments above (₹)</label>
          <input type="number" min="1" value={threshold} onChange={e => setThreshold(e.target.value)}
            placeholder="50000"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <div className="md:col-span-4">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Need approval from</label>
          <select value={approver} onChange={e => setApprover(e.target.value as MatrixRoleId)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            {MATRIX_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div className="md:col-span-4">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. vendor payouts"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
      </div>
      <button onClick={addRule}
        className="mt-3 flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90">
        <Plus size={13} /> Add rule
      </button>

      <div className="mt-5 space-y-2">
        {rules.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] py-3 text-center border border-dashed border-[var(--color-border)] rounded-lg">
            No rules yet — every payment is auto-approved. Add a threshold above to require sign-off.
          </p>
        ) : rules.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Over <span className="text-[var(--color-primary)] font-semibold">{formatCurrency(r.threshold)}</span> → {MATRIX_ROLES.find(x => x.id === r.approver)?.label} approves
              </p>
              {r.note && <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">{r.note}</p>}
            </div>
            <button onClick={() => removeRule(r.id)} title="Delete rule"
              className="text-[var(--color-muted)] hover:text-red-400 transition-colors p-1 shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── #172 Financial-Year & Books-Lock ──────────────────────────────────────
   Set the financial-year start month and a books-lock date; entries on or
   before the lock date are treated as closed (post-filing). */
const FY_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type BooksConfig = { fyStartMonth: number; lockDate: string | null };

function BooksLockCard() {
  const [cfg, setCfg] = useFeatureState<BooksConfig>("settings-books-lock", { fyStartMonth: 3, lockDate: null });
  const [lockInput, setLockInput] = useState(cfg.lockDate ?? "");

  const setFy = (m: number) => setCfg(c => ({ ...c, fyStartMonth: m }));
  const applyLock = () => {
    if (!lockInput) { toast.error("Pick a lock date first"); return; }
    setCfg(c => ({ ...c, lockDate: lockInput }));
    toast.success(`Books locked up to ${format(new Date(lockInput), "dd MMM yyyy")}`);
  };
  const clearLock = () => { setCfg(c => ({ ...c, lockDate: null })); setLockInput(""); toast.success("Books unlocked"); };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <CalendarClock size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Financial Year &amp; Books Lock</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Set your FY start and lock periods after filing so closed months can't be edited.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Financial year starts in</label>
          <select value={cfg.fyStartMonth} onChange={e => setFy(Number(e.target.value))}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            {FY_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <p className="text-[10px] text-[var(--color-muted)] mt-1">India's standard FY runs April–March.</p>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Lock books up to &amp; including</label>
          <input type="date" value={lockInput} onChange={e => setLockInput(e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={applyLock}
          className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90">
          <Lock size={13} /> Lock books
        </button>
        {cfg.lockDate && (
          <button onClick={clearLock}
            className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-[var(--color-accent)]">
            Unlock
          </button>
        )}
      </div>

      <div className={`mt-4 p-3 rounded-lg text-xs border ${cfg.lockDate ? "bg-[var(--color-accent)] border-[var(--color-border)] text-[var(--color-muted)]" : "border-dashed border-[var(--color-border)] text-[var(--color-muted)]"}`}>
        {cfg.lockDate
          ? <>Books are <strong className="text-[var(--color-text)]">locked through {format(new Date(cfg.lockDate), "dd MMM yyyy")}</strong>. Entries dated on or before this are treated as filed and closed.</>
          : <>No lock set — all periods are open for edits.</>}
      </div>
    </div>
  );
}

/* ── #173 Audit Log / Login History ────────────────────────────────────────
   Security review list. Reads recent live sign-in / settings events the app
   has recorded; falls back to the current session if none exist yet. */
type AuditEvent = { id: string; type: "login" | "permission" | "lock" | "policy"; label: string; at: string; meta?: string };

function AuditLogCard() {
  const { user } = useAuth();
  const [events] = useFeatureState<AuditEvent[]>("settings-audit-log", []);

  const sessionEntry: AuditEvent = {
    id: "current-session",
    type: "login",
    label: `Signed in${user?.email ? ` as ${user.email}` : ""}`,
    at: new Date().toISOString(),
    meta: "This device · current session",
  };
  const rows = [sessionEntry, ...[...events].sort((a, b) => b.at.localeCompare(a.at))];

  const icon = (t: AuditEvent["type"]) =>
    t === "login" ? <LogIn size={13} className="text-[var(--color-primary)]" />
    : t === "permission" ? <Grid3x3 size={13} className="text-[var(--color-primary)]" />
    : t === "lock" ? <CalendarClock size={13} className="text-[var(--color-primary)]" />
    : <GitBranch size={13} className="text-[var(--color-primary)]" />;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <History size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Audit Log &amp; Login History</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Recent sign-ins and security-relevant changes, for access review.</p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-[var(--color-border)]">
        {rows.map(e => (
          <div key={e.id} className="flex items-center gap-3 py-3">
            <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0">
              {icon(e.type)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{e.label}</p>
              {e.meta && <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">{e.meta}</p>}
            </div>
            <span className="text-[11px] text-[var(--color-muted)] shrink-0 font-mono">
              {format(new Date(e.at), "dd MMM, HH:mm")}
            </span>
          </div>
        ))}
      </div>

      {events.length === 0 && (
        <p className="text-[11px] text-[var(--color-muted)] mt-3 flex items-center gap-1.5">
          <ShieldQuestion size={12} /> Showing your current session — older history appears here as it's recorded.
        </p>
      )}
    </div>
  );
}

/* ── #174 Invoice Defaults ─────────────────────────────────────────────────
   Prefix, next number, payment terms, and a default footer note pre-filled on
   every new invoice the SMB creates. */
type InvoiceDefaults = { prefix: string; nextNumber: number; termsDays: number; footerNote: string };
const INVOICE_TERMS = [0, 7, 15, 30, 45, 60, 90] as const;

function InvoiceDefaultsCard() {
  const [cfg, setCfg] = useFeatureState<InvoiceDefaults>("set-invoice-defaults", {
    prefix: "INV-", nextNumber: 1, termsDays: 30, footerNote: "Thank you for your business.",
  });
  const set = <K extends keyof InvoiceDefaults>(k: K, v: InvoiceDefaults[K]) => setCfg(c => ({ ...c, [k]: v }));
  const preview = `${cfg.prefix}${String(cfg.nextNumber).padStart(4, "0")}`;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <FileText size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Invoice Defaults</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Pre-fill the numbering series, payment terms and footer on every new invoice.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice prefix</label>
          <input value={cfg.prefix} onChange={e => set("prefix", e.target.value)} placeholder="INV-"
            maxLength={12}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] font-mono" />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Next number</label>
          <input type="number" min="1" value={cfg.nextNumber}
            onChange={e => set("nextNumber", Math.max(1, Number(e.target.value) || 1))}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Payment terms</label>
          <select value={cfg.termsDays} onChange={e => set("termsDays", Number(e.target.value))}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            {INVOICE_TERMS.map(d => <option key={d} value={d}>{d === 0 ? "Due on receipt" : `Net ${d} days`}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4">
        <label className="text-xs text-[var(--color-muted)] block mb-1">Default footer note</label>
        <textarea value={cfg.footerNote} onChange={e => set("footerNote", e.target.value)} rows={2}
          placeholder="Thank you for your business."
          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] resize-none" />
      </div>
      <div className="mt-4 p-3 bg-[var(--color-accent)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-muted)]">
        Your next invoice will be numbered <strong className="text-[var(--color-text)] font-mono">{preview}</strong>, due in {cfg.termsDays === 0 ? "on receipt" : `${cfg.termsDays} days`}. Saved automatically.
      </div>
    </div>
  );
}

/* ── #175 Currency & Locale ────────────────────────────────────────────────
   Number grouping (Indian lakh/crore vs international), symbol position and
   decimal places used when amounts are shown across the app. */
type LocaleCfg = { grouping: "indian" | "international"; decimals: 0 | 2; symbolBefore: boolean };

function CurrencyLocaleCard() {
  const [cfg, setCfg] = useFeatureState<LocaleCfg>("set-currency-locale", { grouping: "indian", decimals: 2, symbolBefore: true });
  const set = <K extends keyof LocaleCfg>(k: K, v: LocaleCfg[K]) => setCfg(c => ({ ...c, [k]: v }));

  const sample = (() => {
    const n = 1234567.5;
    const locale = cfg.grouping === "indian" ? "en-IN" : "en-US";
    const body = n.toLocaleString(locale, { minimumFractionDigits: cfg.decimals, maximumFractionDigits: cfg.decimals });
    return cfg.symbolBefore ? `₹${body}` : `${body} ₹`;
  })();

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <Globe size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Currency &amp; Locale</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">How rupee amounts are grouped and formatted when shown across Headroom.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Number grouping</label>
          <select value={cfg.grouping} onChange={e => set("grouping", e.target.value as LocaleCfg["grouping"])}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            <option value="indian">Indian (lakh / crore)</option>
            <option value="international">International (thousands)</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Decimal places</label>
          <select value={cfg.decimals} onChange={e => set("decimals", Number(e.target.value) as LocaleCfg["decimals"])}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            <option value={0}>0 — whole rupees</option>
            <option value={2}>2 — paise</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Symbol position</label>
          <select value={cfg.symbolBefore ? "before" : "after"} onChange={e => set("symbolBefore", e.target.value === "before")}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            <option value="before">Before (₹1,000)</option>
            <option value="after">After (1,000 ₹)</option>
          </select>
        </div>
      </div>
      <div className="mt-4 p-3 bg-[var(--color-accent)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-muted)]">
        Preview: <strong className="text-[var(--color-text)] font-mono">{sample}</strong>
      </div>
    </div>
  );
}

/* ── #176 Document Branding ────────────────────────────────────────────────
   Logo URL, signatory name and a footer line stamped on invoices, statements
   and exported PDFs. */
type BrandingCfg = { logoUrl: string; signatory: string; footer: string };

function DocumentBrandingCard() {
  const [cfg, setCfg] = useFeatureState<BrandingCfg>("set-document-branding", { logoUrl: "", signatory: "", footer: "" });
  const set = <K extends keyof BrandingCfg>(k: K, v: BrandingCfg[K]) => setCfg(c => ({ ...c, [k]: v }));
  const [err, setErr] = useState(false);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <Image size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Document Branding</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Logo, signatory and footer stamped on invoices, statements and PDF exports.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col md:flex-row gap-4 items-start">
        <div className="w-20 h-20 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-center overflow-hidden shrink-0">
          {cfg.logoUrl && !err
            ? <img src={cfg.logoUrl} alt="Logo preview" onError={() => setErr(true)} className="w-full h-full object-contain" />
            : <Image size={20} className="text-[var(--color-muted)]" />}
        </div>
        <div className="flex-1 w-full space-y-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Logo URL</label>
            <input value={cfg.logoUrl} onChange={e => { setErr(false); set("logoUrl", e.target.value); }}
              placeholder="https://…/logo.png"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Authorised signatory</label>
              <input value={cfg.signatory} onChange={e => set("signatory", e.target.value)} placeholder="e.g. Raj Mehta, Director"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Footer line</label>
              <input value={cfg.footer} onChange={e => set("footer", e.target.value)} placeholder="Reg office · GSTIN · contact"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
          </div>
        </div>
      </div>
      {err && <p className="text-[10px] text-red-400 mt-2">Couldn't load that image — check the URL is public.</p>}
    </div>
  );
}

/* ── #177 Reminder Cadence ─────────────────────────────────────────────────
   When automatic payment reminders go out relative to an invoice due date. */
type ReminderCfg = { enabled: boolean; beforeDue: number; onDue: boolean; afterDue: number; channel: "whatsapp" | "email" | "both" };

function ReminderCadenceCard() {
  const [cfg, setCfg] = useFeatureState<ReminderCfg>("set-reminder-cadence", {
    enabled: true, beforeDue: 3, onDue: true, afterDue: 7, channel: "whatsapp",
  });
  const set = <K extends keyof ReminderCfg>(k: K, v: ReminderCfg[K]) => setCfg(c => ({ ...c, [k]: v }));

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <BellRing size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Payment Reminder Cadence</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Default schedule for chasing unpaid invoices, applied to new receivables.</p>
        </div>
      </div>

      <label className="mt-5 flex items-center gap-3 cursor-pointer">
        <div onClick={() => set("enabled", !cfg.enabled)}
          className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${cfg.enabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </div>
        <span className="text-sm">Send automatic reminders</span>
      </label>

      {cfg.enabled && (
        <>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Days before due</label>
              <input type="number" min="0" max="30" value={cfg.beforeDue}
                onChange={e => set("beforeDue", Math.max(0, Number(e.target.value) || 0))}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Days after due</label>
              <input type="number" min="0" max="60" value={cfg.afterDue}
                onChange={e => set("afterDue", Math.max(0, Number(e.target.value) || 0))}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Channel</label>
              <select value={cfg.channel} onChange={e => set("channel", e.target.value as ReminderCfg["channel"])}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="both">WhatsApp + Email</option>
              </select>
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={cfg.onDue} onChange={e => set("onDue", e.target.checked)}
              className="accent-[var(--color-primary)] w-4 h-4" />
            Also remind on the due date itself
          </label>
        </>
      )}
    </div>
  );
}

/* ── #178 Number Format & Rounding ─────────────────────────────────────────
   Rounding rule and unit scaling used when totals are computed and displayed. */
type RoundingCfg = { mode: "none" | "nearest" | "up" | "down"; nearest: 1 | 5 | 10; displayUnit: "full" | "thousands" | "lakhs" };

function NumberRoundingCard() {
  const [cfg, setCfg] = useFeatureState<RoundingCfg>("set-number-rounding", { mode: "nearest", nearest: 1, displayUnit: "full" });
  const set = <K extends keyof RoundingCfg>(k: K, v: RoundingCfg[K]) => setCfg(c => ({ ...c, [k]: v }));

  const example = (() => {
    const raw = 12347.6;
    let r = raw;
    if (cfg.mode === "nearest") r = Math.round(raw / cfg.nearest) * cfg.nearest;
    else if (cfg.mode === "up") r = Math.ceil(raw / cfg.nearest) * cfg.nearest;
    else if (cfg.mode === "down") r = Math.floor(raw / cfg.nearest) * cfg.nearest;
    return formatCurrency(r);
  })();

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <Hash size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Number Format &amp; Rounding</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">How computed totals are rounded and scaled in summaries and reports.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Rounding rule</label>
          <select value={cfg.mode} onChange={e => set("mode", e.target.value as RoundingCfg["mode"])}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            <option value="none">No rounding</option>
            <option value="nearest">Round to nearest</option>
            <option value="up">Always round up</option>
            <option value="down">Always round down</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Round to</label>
          <select value={cfg.nearest} onChange={e => set("nearest", Number(e.target.value) as RoundingCfg["nearest"])}
            disabled={cfg.mode === "none"}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50">
            <option value={1}>₹1</option>
            <option value={5}>₹5</option>
            <option value={10}>₹10</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Display unit</label>
          <select value={cfg.displayUnit} onChange={e => set("displayUnit", e.target.value as RoundingCfg["displayUnit"])}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            <option value="full">Full amount</option>
            <option value="thousands">In thousands (K)</option>
            <option value="lakhs">In lakhs (L)</option>
          </select>
        </div>
      </div>
      <div className="mt-4 p-3 bg-[var(--color-accent)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-muted)]">
        Example: {formatCurrency(12347.6)} shown as <strong className="text-[var(--color-text)]">{example}</strong>.
      </div>
    </div>
  );
}

/* ── #179 Theme & Density ──────────────────────────────────────────────────
   Visual preferences — appearance, layout density and motion. Saved so the
   choice follows the user across devices. */
type AppearanceCfg = { theme: "system" | "dark" | "light"; density: "comfortable" | "compact"; reduceMotion: boolean };

function ThemeDensityCard() {
  const [cfg, setCfg] = useFeatureState<AppearanceCfg>("set-theme-density", { theme: "system", density: "comfortable", reduceMotion: false });
  const set = <K extends keyof AppearanceCfg>(k: K, v: AppearanceCfg[K]) => setCfg(c => ({ ...c, [k]: v }));
  const THEMES = [
    { id: "system", label: "System" },
    { id: "dark", label: "Dark" },
    { id: "light", label: "Light" },
  ] as const;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <Palette size={16} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Theme &amp; Density</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Appearance and layout preferences, remembered across your devices.</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs text-[var(--color-muted)] mb-2">Appearance</p>
        <div className="flex flex-wrap gap-2">
          {THEMES.map(t => (
            <button key={t.id} onClick={() => set("theme", t.id)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${cfg.theme === t.id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs text-[var(--color-muted)] mb-2">Layout density</p>
        <div className="flex flex-wrap gap-2">
          {(["comfortable", "compact"] as const).map(d => (
            <button key={d} onClick={() => set("density", d)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors capitalize ${cfg.density === d ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]"}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-5 flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={cfg.reduceMotion} onChange={e => set("reduceMotion", e.target.checked)}
          className="accent-[var(--color-primary)] w-4 h-4" />
        Reduce motion and animations
      </label>
    </div>
  );
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

      {/* Plan & Billing */}
      <BillingCard />

      {/* App lock */}
      <AppLockCard />

      {/* Push notifications */}
      <NotificationsCard />

      {/* Privacy & data rights (DPDP) */}
      <PrivacyCard />

      {/* #170 Role & permission matrix */}
      <PermissionMatrixCard />

      {/* #171 Approval-policy builder */}
      <ApprovalPolicyCard />

      {/* #172 Financial-year & books-lock */}
      <BooksLockCard />

      {/* #173 Audit log / login history */}
      <AuditLogCard />

      {/* #174 Invoice defaults */}
      <InvoiceDefaultsCard />

      {/* #175 Currency & locale */}
      <CurrencyLocaleCard />

      {/* #176 Document branding */}
      <DocumentBrandingCard />

      {/* #177 Payment reminder cadence */}
      <ReminderCadenceCard />

      {/* #178 Number format & rounding */}
      <NumberRoundingCard />

      {/* #179 Theme & density */}
      <ThemeDensityCard />

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
