import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Layers, Repeat, RefreshCw, Plus, Zap, PlayCircle, Pause, XCircle, ArrowLeftRight,
  Gauge, Send, BarChart3, Receipt,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (loose — backend response shapes inlined)
// ─────────────────────────────────────────────────────────────────────────────
type Interval = "monthly" | "quarterly" | "yearly";
type SubStatus = "trial" | "active" | "paused" | "cancelled";

interface Plan {
  id: string;
  name: string;
  price?: string | number;
  interval?: string;
  intervalCount?: string | number;
  interval_count?: string | number;
  gstRate?: string | number;
  gst_rate?: string | number;
  hsnSac?: string;
  hsn_sac?: string;
}

interface LedgerLite {
  id: string;
  name: string;
  is_party?: boolean;
}

interface Subscription {
  id: string;
  status?: string;
  qty?: string | number;
  party?: string;
  partyName?: string;
  party_name?: string;
  partyLedgerId?: string;
  plan?: string;
  planName?: string;
  plan_name?: string;
  planId?: string;
  nextInvoiceDate?: string;
  next_invoice_date?: string;
}

interface RunResponse {
  created?: string | number;
  count?: string | number;
  invoices?: unknown[];
}

const INTERVAL_OPTIONS: { id: Interval; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "yearly", label: "Yearly" },
];

const STATUS_FILTERS: { id: "" | SubStatus; label: string }[] = [
  { id: "", label: "All" },
  { id: "trial", label: "Trial" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "cancelled", label: "Cancelled" },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v) || 0;
}

function rupee(v: string | number | null | undefined): string {
  return `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function intervalLabel(p: Plan): string {
  const i = INTERVAL_OPTIONS.find((o) => o.id === p.interval)?.label ?? (p.interval ?? "—");
  const c = num(p.intervalCount ?? p.interval_count);
  return c > 1 ? `Every ${c} × ${i.toLowerCase()}` : i;
}

function partyOf(s: Subscription): string {
  return s.partyName ?? s.party_name ?? s.party ?? "—";
}
function planOf(s: Subscription): string {
  return s.planName ?? s.plan_name ?? s.plan ?? "—";
}
function nextOf(s: Subscription): string {
  return s.nextInvoiceDate ?? s.next_invoice_date ?? "—";
}

const STATUS_STYLE: Record<string, string> = {
  trial: "bg-blue-900/30 text-blue-300 border-blue-700/40",
  active: "bg-green-900/30 text-green-300 border-green-700/40",
  paused: "bg-amber-900/30 text-amber-300 border-amber-700/40",
  cancelled: "bg-red-900/30 text-red-300 border-red-700/40",
};

function StatusPill({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase();
  const cls = STATUS_STYLE[s] ?? "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]";
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${cls}`}>
      {s || "—"}
    </span>
  );
}

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)] disabled:opacity-40 transition-colors";

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
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

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

type Section = "plans" | "subscriptions" | "usage";

const AGGREGATION_OPTIONS: { id: string; label: string }[] = [
  { id: "SUM", label: "Sum" },
  { id: "COUNT", label: "Count" },
  { id: "MAX", label: "Max" },
  { id: "UNIQUE_COUNT", label: "Unique" },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksSubscriptionsTab() {
  const [section, setSection] = useState<Section>("plans");

  const sections: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "plans", label: "Plans", icon: <Layers size={14} /> },
    { id: "subscriptions", label: "Subscriptions", icon: <Repeat size={14} /> },
    { id: "usage", label: "Usage", icon: <Gauge size={14} /> },
  ];

  return (
    <div className="space-y-5">
      {/* inner tab bar */}
      <div className="flex gap-2 overflow-x-auto">
        {sections.map((s) => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors ${
                active
                  ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"
              }`}
            >
              {s.icon}
              {s.label}
            </button>
          );
        })}
      </div>

      {section === "plans" && <PlansSection />}
      {section === "subscriptions" && <SubscriptionsSection />}
      {section === "usage" && <UsageSection />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLANS
// ─────────────────────────────────────────────────────────────────────────────
function PlansSection() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(true);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<Interval>("monthly");
  const [intervalCount, setIntervalCount] = useState("1");
  const [gstRate, setGstRate] = useState("18");
  const [hsnSac, setHsnSac] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await api.get<Plan[]>("/api/books/subscription-plans");
      setPlans(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
      setPlans([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reset = () => {
    setName(""); setPrice(""); setInterval("monthly");
    setIntervalCount("1"); setGstRate("18"); setHsnSac("");
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter a plan name"); return; }
    if (!(num(price) > 0)) { toast.error("Enter a price greater than 0"); return; }
    setSaving(true);
    try {
      await api.post<Plan>("/api/books/subscription-plans", {
        name: name.trim(),
        price: num(price),
        interval,
        intervalCount: Math.max(1, Math.trunc(num(intervalCount)) || 1),
        gstRate: num(gstRate),
        hsnSac: hsnSac.trim(),
      });
      toast.success(`Plan "${name.trim()}" created`);
      reset();
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* CREATE FORM */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Plus size={15} className="text-[var(--color-primary)]" /> New subscription plan
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className={labelCls}>Plan name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pro plan"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Price (₹)</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label className={labelCls}>Interval</label>
            <select value={interval} onChange={(e) => setInterval(e.target.value as Interval)} className={inputCls}>
              {INTERVAL_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Interval count</label>
            <input
              value={intervalCount}
              onChange={(e) => setIntervalCount(e.target.value)}
              inputMode="numeric"
              placeholder="1"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label className={labelCls}>GST rate (%)</label>
            <input
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
              inputMode="decimal"
              placeholder="18"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label className={labelCls}>HSN / SAC</label>
            <input
              value={hsnSac}
              onChange={(e) => setHsnSac(e.target.value)}
              placeholder="e.g. 998314"
              className={`${inputCls} font-mono`}
            />
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Create plan
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Plans</h3>
          <button type="button" onClick={() => void load()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Name</Th>
                <Th right>Price</Th>
                <Th>Interval</Th>
                <Th right>GST</Th>
                <Th>HSN / SAC</Th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={5} />
              ) : plans.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted)]">No plans yet — create one above.</td></tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{p.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(p.price)}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{intervalLabel(p)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{num(p.gstRate ?? p.gst_rate)}%</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-muted)]">{p.hsnSac ?? p.hsn_sac ?? "—"}</td>
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

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────
function SubscriptionsSection() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [busy, setBusy] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | SubStatus>("");

  const [plans, setPlans] = useState<Plan[]>([]);
  const [parties, setParties] = useState<LedgerLite[]>([]);

  // create form
  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [planId, setPlanId] = useState("");
  const [qty, setQty] = useState("1");
  const [trialDays, setTrialDays] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);

  const [running, setRunning] = useState(false);

  const load = useCallback(async (status: "" | SubStatus) => {
    setBusy(true);
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const rows = await api.get<Subscription[]>(`/api/books/subscriptions${qs}`);
      setSubs(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
      setSubs([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(statusFilter); }, [statusFilter, load]);

  // load plans + party ledgers (for the create form)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pl, lg] = await Promise.all([
          api.get<Plan[]>("/api/books/subscription-plans"),
          api.get<LedgerLite[]>("/api/books/ledgers"),
        ]);
        if (cancelled) return;
        setPlans(Array.isArray(pl) ? pl : []);
        setParties((Array.isArray(lg) ? lg : []).filter((l) => l.is_party));
      } catch (e) {
        if (!cancelled) toast.error(errMsg(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const planById = useMemo(() => {
    const m: Record<string, Plan> = {};
    for (const p of plans) m[p.id] = p;
    return m;
  }, [plans]);

  const resetForm = () => {
    setPartyLedgerId(""); setPlanId(""); setQty("1"); setTrialDays("0"); setStartDate("");
  };

  const submit = async () => {
    if (!partyLedgerId) { toast.error("Pick a party"); return; }
    if (!planId) { toast.error("Pick a plan"); return; }
    if (!(num(qty) > 0)) { toast.error("Quantity must be at least 1"); return; }
    setSaving(true);
    try {
      await api.post<Subscription>("/api/books/subscriptions", {
        partyLedgerId,
        planId,
        qty: Math.max(1, Math.trunc(num(qty)) || 1),
        trialDays: Math.max(0, Math.trunc(num(trialDays)) || 0),
        ...(startDate ? { startDate } : {}),
      });
      toast.success("Subscription created");
      resetForm();
      await load(statusFilter);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const changePlan = async (sub: Subscription) => {
    const choices = plans.filter((p) => p.id !== sub.planId);
    if (choices.length === 0) { toast.error("No other plan available"); return; }
    const promptText =
      "Change to which plan? Enter the number:\n" +
      choices.map((p, i) => `${i + 1}. ${p.name} (${rupee(p.price)})`).join("\n");
    const raw = window.prompt(promptText);
    if (raw == null) return;
    const idx = Math.trunc(Number(raw)) - 1;
    const target = choices[idx];
    if (!target) { toast.error("Invalid selection"); return; }
    const prorate = window.confirm(
      `Change to "${target.name}"?\n\nOK = prorate the switch (credit/charge the unused portion).\nCancel = no proration.`,
    );
    try {
      await api.post(`/api/books/subscriptions/${sub.id}/change-plan`, {
        newPlanId: target.id,
        prorate,
      });
      toast.success(`Plan changed to "${target.name}"${prorate ? " (prorated)" : ""}`);
      await load(statusFilter);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const cancel = async (sub: Subscription) => {
    const atPeriodEnd = window.confirm(
      `Cancel subscription for ${partyOf(sub)}?\n\nOK = cancel at period end (keeps access until next invoice date).\nCancel = cancel immediately.`,
    );
    try {
      await api.post(`/api/books/subscriptions/${sub.id}/cancel`, { atPeriodEnd });
      toast.success(atPeriodEnd ? "Subscription will cancel at period end" : "Subscription cancelled");
      await load(statusFilter);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const runDue = async () => {
    setRunning(true);
    try {
      const res = await api.post<RunResponse>("/api/books/subscriptions/run", {});
      const created =
        res?.created != null ? num(res.created)
          : res?.count != null ? num(res.count)
            : Array.isArray(res?.invoices) ? res.invoices.length
              : 0;
      toast.success(`Generated ${created} invoice${created === 1 ? "" : "s"}`);
      await load(statusFilter);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* CREATE FORM */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Plus size={15} className="text-[var(--color-primary)]" /> New subscription
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className={labelCls}>Party</label>
            <select value={partyLedgerId} onChange={(e) => setPartyLedgerId(e.target.value)} className={inputCls}>
              <option value="">Select a party…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Plan</label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls}>
              <option value="">Select a plan…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {rupee(p.price)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Quantity</label>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="numeric"
              placeholder="1"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label className={labelCls}>Trial days</label>
            <input
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label className={labelCls}>Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Create subscription
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.id;
            return (
              <button
                key={f.id || "all"}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap border transition-colors ${
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load(statusFilter)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
          <button type="button" onClick={runDue} disabled={running} className={btnPrimary}>
            {running ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
            Generate due invoices now
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Party</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Next invoice</Th>
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={5} />
              ) : subs.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted)]">No subscriptions{statusFilter ? ` with status "${statusFilter}"` : ""} yet.</td></tr>
              ) : (
                subs.map((s) => {
                  const plan = s.planId ? planById[s.planId] : undefined;
                  const cancelled = (s.status ?? "").toLowerCase() === "cancelled";
                  return (
                    <tr key={s.id} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{partyOf(s)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {plan?.name ?? planOf(s)}
                        {num(s.qty) > 1 && <span className="text-[var(--color-muted)]"> × {num(s.qty)}</span>}
                      </td>
                      <td className="px-3 py-2.5"><StatusPill status={s.status} /></td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap tabular-nums">{nextOf(s)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => void changePlan(s)} disabled={cancelled} className={btnGhost} title="Change plan (prorates)">
                            <ArrowLeftRight size={12} /> Change plan
                          </button>
                          <button type="button" onClick={() => void cancel(s)} disabled={cancelled} className={btnGhost} title="Cancel">
                            <XCircle size={12} /> Cancel
                          </button>
                        </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// USAGE / METERED BILLING
// ─────────────────────────────────────────────────────────────────────────────
interface AggregateResponse {
  metric?: string;
  aggregation?: string;
  units?: string | number;
}
interface UsageChargeResponse {
  metric?: string;
  units?: string | number;
  unitPrice?: string | number;
  amount?: string | number;
}

function subLabel(s: Subscription): string {
  return `${partyOf(s)} — ${planOf(s)}`;
}

function UsageSection() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [busy, setBusy] = useState(true);

  // ingest form
  const [iSub, setISub] = useState("");
  const [iMetric, setIMetric] = useState("");
  const [iValue, setIValue] = useState("1");
  const [iDedup, setIDedup] = useState("");
  const [ingesting, setIngesting] = useState(false);

  // aggregate viewer
  const [aSub, setASub] = useState("");
  const [aMetric, setAMetric] = useState("");
  const [aFrom, setAFrom] = useState("");
  const [aTo, setATo] = useState("");
  const [aAgg, setAAgg] = useState("SUM");
  const [aLoading, setALoading] = useState(false);
  const [aResult, setAResult] = useState<AggregateResponse | null>(null);

  // usage charge lookup
  const [cSub, setCSub] = useState("");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [cLoading, setCLoading] = useState(false);
  const [cResult, setCResult] = useState<UsageChargeResponse | null>(null);
  const [cNotMetered, setCNotMetered] = useState(false);

  const loadSubs = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await api.get<Subscription[]>("/api/books/subscriptions");
      setSubs(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
      setSubs([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void loadSubs(); }, [loadSubs]);

  const ingest = async () => {
    if (!iSub) { toast.error("Pick a subscription"); return; }
    if (!iMetric.trim()) { toast.error("Enter a metric"); return; }
    if (num(iValue) < 0) { toast.error("Value cannot be negative"); return; }
    setIngesting(true);
    try {
      const res = await api.post<{ deduplicated?: boolean }>("/api/books/usage/ingest", {
        subscriptionId: iSub,
        metric: iMetric.trim(),
        value: num(iValue),
        ...(iDedup.trim() ? { dedupKey: iDedup.trim() } : {}),
      });
      toast.success(res?.deduplicated ? "Duplicate event ignored (dedup)" : "Usage event recorded");
      setIValue("1"); setIDedup("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setIngesting(false);
    }
  };

  const runAggregate = async () => {
    if (!aSub) { toast.error("Pick a subscription"); return; }
    if (!aMetric.trim()) { toast.error("Enter a metric"); return; }
    setALoading(true);
    setAResult(null);
    try {
      const qs = new URLSearchParams({
        subscriptionId: aSub,
        metric: aMetric.trim(),
        aggregation: aAgg,
      });
      if (aFrom) qs.set("from", aFrom);
      if (aTo) qs.set("to", aTo);
      const res = await api.get<AggregateResponse>(`/api/books/usage/aggregate?${qs.toString()}`);
      setAResult(res ?? null);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setALoading(false);
    }
  };

  const runCharge = async () => {
    if (!cSub) { toast.error("Pick a subscription"); return; }
    setCLoading(true);
    setCResult(null);
    setCNotMetered(false);
    try {
      const qs = new URLSearchParams();
      if (cFrom) qs.set("from", cFrom);
      if (cTo) qs.set("to", cTo);
      const q = qs.toString();
      const res = await api.get<UsageChargeResponse | null>(
        `/api/books/subscriptions/${cSub}/usage-charge${q ? `?${q}` : ""}`,
      );
      if (res == null) { setCNotMetered(true); }
      else { setCResult(res); }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCLoading(false);
    }
  };

  const subSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">Select a subscription…</option>
      {subs.map((s) => (
        <option key={s.id} value={s.id}>{subLabel(s)}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5">
      {/* INGEST */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Send size={15} className="text-[var(--color-primary)]" /> Record usage event
          </h3>
          <button type="button" onClick={() => void loadSubs()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh subscriptions">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className={labelCls}>Subscription</label>
            {subSelect(iSub, setISub)}
          </div>
          <div>
            <label className={labelCls}>Metric</label>
            <input
              value={iMetric}
              onChange={(e) => setIMetric(e.target.value)}
              placeholder="e.g. api_calls"
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>Value</label>
            <input
              value={iValue}
              onChange={(e) => setIValue(e.target.value)}
              inputMode="decimal"
              placeholder="1"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
          <div className="lg:col-span-2">
            <label className={labelCls}>Dedup key (optional)</label>
            <input
              value={iDedup}
              onChange={(e) => setIDedup(e.target.value)}
              placeholder="Idempotency key — a repeat is ignored"
              className={`${inputCls} font-mono`}
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={ingest} disabled={ingesting} className={btnPrimary}>
            {ingesting ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            Record event
          </button>
        </div>
      </div>

      {/* AGGREGATE */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <BarChart3 size={15} className="text-[var(--color-primary)]" /> Aggregate usage
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className={labelCls}>Subscription</label>
            {subSelect(aSub, setASub)}
          </div>
          <div>
            <label className={labelCls}>Metric</label>
            <input
              value={aMetric}
              onChange={(e) => setAMetric(e.target.value)}
              placeholder="e.g. api_calls"
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>Aggregation</label>
            <select value={aAgg} onChange={(e) => setAAgg(e.target.value)} className={inputCls}>
              {AGGREGATION_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>From</label>
            <input type="date" value={aFrom} onChange={(e) => setAFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" value={aTo} onChange={(e) => setATo(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 mt-4">
          <div className="text-sm">
            {aResult ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-[var(--color-muted)]">{aResult.metric} · {aResult.aggregation}</span>
                <span className="font-mono tabular-nums font-semibold text-base">{num(aResult.units).toLocaleString("en-IN")}</span>
                <span className="text-[var(--color-muted)]">units</span>
              </span>
            ) : (
              <span className="text-[var(--color-muted)]">Run to see aggregated units for the window.</span>
            )}
          </div>
          <button type="button" onClick={runAggregate} disabled={aLoading} className={btnPrimary}>
            {aLoading ? <RefreshCw size={14} className="animate-spin" /> : <BarChart3 size={14} />}
            Aggregate
          </button>
        </div>
      </div>

      {/* USAGE CHARGE FOR PERIOD */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Receipt size={15} className="text-[var(--color-primary)]" /> Usage charge for period
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-3">
            <label className={labelCls}>Subscription</label>
            {subSelect(cSub, setCSub)}
          </div>
          <div>
            <label className={labelCls}>From</label>
            <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 mt-4">
          <button type="button" onClick={runCharge} disabled={cLoading} className={btnPrimary}>
            {cLoading ? <RefreshCw size={14} className="animate-spin" /> : <Receipt size={14} />}
            Compute charge
          </button>
        </div>
        {cNotMetered && (
          <p className="text-sm text-[var(--color-muted)] mt-4">This subscription's plan is not metered — only the base fee applies.</p>
        )}
        {cResult && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">Metric</div>
              <div className="text-sm font-mono">{cResult.metric ?? "—"}</div>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">Units</div>
              <div className="text-sm font-mono tabular-nums">{num(cResult.units).toLocaleString("en-IN")}</div>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">Unit price</div>
              <div className="text-sm font-mono tabular-nums">{rupee(cResult.unitPrice)}</div>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">Amount</div>
              <div className="text-sm font-mono tabular-nums font-semibold">{rupee(cResult.amount)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
