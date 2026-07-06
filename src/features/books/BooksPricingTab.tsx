import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import BulkUpload from "@/components/BulkUpload";
import ExportMenu from "@/components/ExportMenu";
import {
  Tag, Ticket, Truck, Plus, Trash2, RefreshCw, FlaskConical, Gift, Percent,
} from "lucide-react";
import DatePicker from "@/components/DatePicker";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES - response shapes mirror backend/src/modules/books/pricing.js
// (rows come back snake_case; the create/redeem endpoints read camelCase keys).
// ─────────────────────────────────────────────────────────────────────────────
interface PricingRule {
  id: string;
  title: string;
  applies_on: string;
  scope_value: string | null;
  party_scope: string;
  party_value: string | null;
  min_qty: string;
  max_qty: string | null;
  min_amount: string;
  action: string;
  value: string;
  scheme: string;
  free_item_id: string | null;
  free_qty: string;
  priority: number | string;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
}

interface AppliedLine {
  itemId?: string;
  qty?: string | number;
  rate?: string;
  appliedRuleId?: string | null;
  isFreeGood?: boolean;
}
interface AppliedTrail {
  lineItemId?: string;
  ruleId?: string;
  title?: string;
  action?: string;
  scheme?: string;
  oldRate?: string;
  newRate?: string;
  freeQty?: string;
}
interface ApplyResult {
  lines: AppliedLine[];
  applied: AppliedTrail[];
}

interface RedeemResult {
  discount: string;
  couponId: string;
  redeemed: number | string;
}

interface ShippingChargeResult {
  charge: string;
  accountLedgerId: string | null;
  basis: string;
}

type SubTab = "rules" | "coupons" | "shipping";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function rupee(v: string | number | null | undefined): string {
  const s = String(v ?? "").trim();
  return s ? `₹${s}` : "₹0.00";
}

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)] disabled:opacity-50 transition-colors";
const thLine = "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]";

const APPLIES_ON = ["all", "item", "group", "brand"] as const;
const PARTY_SCOPE = ["all", "customer", "group", "territory"] as const;
const ACTIONS = [
  { id: "discount_pct", label: "Discount %" },
  { id: "discount_amt", label: "Discount amount" },
  { id: "rate", label: "Override rate" },
  { id: "margin", label: "Margin % markup" },
] as const;
const SCHEMES = [
  { id: "none", label: "None" },
  { id: "bxgy", label: "Buy X Get Y (free goods)" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function BooksPricingTab({ canWrite = true }: { canWrite?: boolean } = {}) {
  const [sub, setSub] = useState<SubTab>("rules");

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "rules", label: "Pricing rules", icon: <Tag size={14} /> },
    { id: "coupons", label: "Coupons", icon: <Ticket size={14} /> },
    { id: "shipping", label: "Shipping rules", icon: <Truck size={14} /> },
  ];

  return (
    <div className="space-y-5">
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

      {sub === "rules" && <PricingRulesPanel canWrite={canWrite} />}
      {sub === "coupons" && <CouponsPanel />}
      {sub === "shipping" && <ShippingPanel />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING RULES
// ─────────────────────────────────────────────────────────────────────────────
function PricingRulesPanel({ canWrite }: { canWrite: boolean }) {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [busy, setBusy] = useState(true);

  const [title, setTitle] = useState("");
  const [appliesOn, setAppliesOn] = useState<string>("all");
  const [scopeValue, setScopeValue] = useState("");
  const [partyScope, setPartyScope] = useState<string>("all");
  const [partyValue, setPartyValue] = useState("");
  const [minQty, setMinQty] = useState("");
  const [action, setAction] = useState<string>("discount_pct");
  const [value, setValue] = useState("");
  const [scheme, setScheme] = useState<string>("none");
  const [freeItemId, setFreeItemId] = useState("");
  const [freeQty, setFreeQty] = useState("");
  const [priority, setPriority] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await api.get<PricingRule[]>("/api/books/pricing-rules");
      setRules(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setTitle(""); setAppliesOn("all"); setScopeValue(""); setPartyScope("all");
    setPartyValue(""); setMinQty(""); setAction("discount_pct"); setValue("");
    setScheme("none"); setFreeItemId(""); setFreeQty(""); setPriority("");
    setValidFrom(""); setValidTo("");
  };

  const create = async () => {
    if (!title.trim()) { toast.error("Enter a rule title"); return; }
    if (scheme === "bxgy" && !freeItemId.trim()) {
      toast.error("BXGY scheme needs a free item id");
      return;
    }
    setSaving(true);
    try {
      await api.post<PricingRule>("/api/books/pricing-rules", {
        title: title.trim(),
        appliesOn,
        scopeValue: scopeValue.trim() || undefined,
        partyScope,
        partyValue: partyValue.trim() || undefined,
        minQty: minQty.trim() || 0,
        action,
        value: value.trim() || 0,
        scheme,
        freeItemId: freeItemId.trim() || undefined,
        freeQty: freeQty.trim() || 0,
        priority: priority.trim() || 0,
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
      });
      toast.success(`Rule "${title.trim()}" created`);
      resetForm();
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: PricingRule) => {
    if (!window.confirm(`Delete pricing rule "${r.title}"?`)) return;
    try {
      await api.delete(`/api/books/pricing-rules/${r.id}`);
      toast.success("Rule deleted");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="space-y-5">
      {/* CREATE */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <Tag size={15} className="text-[var(--color-primary)]" /> New pricing rule
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diwali 10% off" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <input value={priority} onChange={(e) => setPriority(e.target.value)} inputMode="numeric" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
          </div>

          <div>
            <label className={labelCls}>Applies on</label>
            <select value={appliesOn} onChange={(e) => setAppliesOn(e.target.value)} className={inputCls}>
              {APPLIES_ON.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Scope value {appliesOn === "all" ? "(n/a)" : ""}</label>
            <input value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} disabled={appliesOn === "all"} placeholder="item / group / brand id" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Min qty</label>
            <input value={minQty} onChange={(e) => setMinQty(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
          </div>

          <div>
            <label className={labelCls}>Party scope</label>
            <select value={partyScope} onChange={(e) => setPartyScope(e.target.value)} className={inputCls}>
              {PARTY_SCOPE.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Party value {partyScope === "all" ? "(n/a)" : ""}</label>
            <input value={partyValue} onChange={(e) => setPartyValue(e.target.value)} disabled={partyScope === "all"} placeholder="customer ledger / group / territory" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value)} className={inputCls}>
              {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Value {action.includes("pct") || action === "margin" ? "(%)" : "(₹)"}</label>
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Scheme</label>
            <select value={scheme} onChange={(e) => setScheme(e.target.value)} className={inputCls}>
              {SCHEMES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          {scheme === "bxgy" && (
            <>
              <div>
                <label className={labelCls}>Free item id</label>
                <input value={freeItemId} onChange={(e) => setFreeItemId(e.target.value)} placeholder="inventory item id" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Free qty (0 = match line qty)</label>
                <input value={freeQty} onChange={(e) => setFreeQty(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
              </div>
              <div />
            </>
          )}

          <div>
            <label className={labelCls}>Valid from</label>
            <DatePicker value={validFrom} onChange={setValidFrom} />
          </div>
          <div>
            <label className={labelCls}>Valid to</label>
            <DatePicker value={validTo} onChange={setValidTo} />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={create} disabled={saving} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Create rule
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Pricing rules <span className="text-[var(--color-muted)] tabular-nums">· {rules.length}</span></h3>
          <div className="flex items-center gap-2">
            <BulkUpload
              title="Bulk upload pricing rules"
              templateName="pricing-rules-template"
              size="sm"
              columns={[
                { key: "title", label: "Title", example: "Diwali 10% off", required: true },
                { key: "appliesOn", label: "Applies on", example: "all" },
                { key: "scopeValue", label: "Scope value", example: "" },
                { key: "partyScope", label: "Party scope", example: "all" },
                { key: "partyValue", label: "Party value", example: "" },
                { key: "minQty", label: "Min qty", example: "0" },
                { key: "maxQty", label: "Max qty", example: "" },
                { key: "minAmount", label: "Min amount", example: "0" },
                { key: "action", label: "Action", example: "discount_pct" },
                { key: "value", label: "Value", example: "10" },
                { key: "scheme", label: "Scheme", example: "none" },
                { key: "freeItemId", label: "Free item id", example: "" },
                { key: "freeQty", label: "Free qty", example: "0" },
                { key: "priority", label: "Priority", example: "0" },
                { key: "validFrom", label: "Valid from", example: "" },
                { key: "validTo", label: "Valid to", example: "" },
              ]}
              endpoint="/api/books/pricing/bulk"
              transform={(row) => ({
                title: (row.title || "").trim(),
                appliesOn: (row.appliesOn || "").trim() || "all",
                scopeValue: (row.scopeValue || "").trim() || undefined,
                partyScope: (row.partyScope || "").trim() || "all",
                partyValue: (row.partyValue || "").trim() || undefined,
                minQty: (row.minQty || "").trim() || 0,
                maxQty: (row.maxQty || "").trim() || undefined,
                minAmount: (row.minAmount || "").trim() || 0,
                action: (row.action || "").trim() || "discount_pct",
                value: (row.value || "").trim() || 0,
                scheme: (row.scheme || "").trim() || "none",
                freeItemId: (row.freeItemId || "").trim() || undefined,
                freeQty: (row.freeQty || "").trim() || 0,
                priority: (row.priority || "").trim() || 0,
                validFrom: (row.validFrom || "").trim() || undefined,
                validTo: (row.validTo || "").trim() || undefined,
              })}
              canWrite={canWrite}
              onDone={() => void load()}
            />
            <ExportMenu
              filename="pricing-rules"
              title="Pricing rules"
              size="sm"
              columns={[
                { key: "title", label: "Title" },
                { key: "applies_on", label: "Applies on" },
                { key: "scope_value", label: "Scope value" },
                { key: "party_scope", label: "Party scope" },
                { key: "party_value", label: "Party value" },
                { key: "action", label: "Action" },
                { key: "value", label: "Value" },
                { key: "scheme", label: "Scheme" },
                { key: "priority", label: "Priority" },
                { key: "is_active", label: "Active" },
              ]}
              rows={rules.map((r) => ({
                title: r.title,
                applies_on: r.applies_on,
                scope_value: r.scope_value || "",
                party_scope: r.party_scope,
                party_value: r.party_value || "",
                action: r.action,
                value: r.value,
                scheme: r.scheme,
                priority: String(r.priority),
                is_active: r.is_active ? "Yes" : "No",
              }))}
            />
            <button type="button" onClick={() => void load()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thLine}>Title</th>
                <th className={thLine}>Applies</th>
                <th className={thLine}>Party</th>
                <th className={thLine}>Action</th>
                <th className={thLine}>Scheme</th>
                <th className={`${thLine} text-right`}>Priority</th>
                <th className={`${thLine} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--color-muted)]">Loading…</td></tr>
              ) : rules.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--color-muted)]">No pricing rules yet - create one above.</td></tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">
                      {r.title}
                      {!r.is_active && <span className="ml-2 text-[10px] text-[var(--color-muted)]">(inactive)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] text-xs">
                      {r.applies_on}{r.scope_value ? ` · ${r.scope_value}` : ""}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] text-xs">
                      {r.party_scope}{r.party_value ? ` · ${r.party_value}` : ""}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.action} · {r.value}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.scheme === "bxgy" ? (
                        <span className="inline-flex items-center gap-1"><Gift size={12} /> BXGY</span>
                      ) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{String(r.priority)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PricingTestPanel />
    </div>
  );
}

// ── Pricing test panel: POST /api/books/pricing/apply with a couple sample lines ──
function PricingTestPanel() {
  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [date, setDate] = useState("");
  const [l1Item, setL1Item] = useState("");
  const [l1Qty, setL1Qty] = useState("10");
  const [l1Rate, setL1Rate] = useState("100");
  const [l2Item, setL2Item] = useState("");
  const [l2Qty, setL2Qty] = useState("2");
  const [l2Rate, setL2Rate] = useState("250");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const run = async () => {
    const lines = [
      { itemId: l1Item.trim() || undefined, qty: Number(l1Qty) || 0, rate: Number(l1Rate) || 0 },
      { itemId: l2Item.trim() || undefined, qty: Number(l2Qty) || 0, rate: Number(l2Rate) || 0 },
    ].filter((l) => l.qty > 0 && l.rate > 0);
    if (lines.length === 0) {
      toast.error("Add at least one line with qty and rate");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<ApplyResult>("/api/books/pricing/apply", {
        lines,
        partyLedgerId: partyLedgerId.trim() || undefined,
        date: date || undefined,
      });
      setResult(res ?? { lines: [], applied: [] });
      toast.success("Pricing applied");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const freeGoods = (result?.lines ?? []).filter((l) => l.isFreeGood);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
        <FlaskConical size={15} className="text-[var(--color-primary)]" /> Test pricing
      </h3>
      <p className="text-[11px] text-[var(--color-muted)] mb-4">
        Posts two sample lines to <code>/pricing/apply</code> and shows the adjusted rates + any free goods.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>Party ledger id (optional)</label>
          <input value={partyLedgerId} onChange={(e) => setPartyLedgerId(e.target.value)} placeholder="ledger id" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Date (optional)</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
      </div>
      <div className="space-y-2">
        {[
          { item: l1Item, setItem: setL1Item, qty: l1Qty, setQty: setL1Qty, rate: l1Rate, setRate: setL1Rate, n: 1 },
          { item: l2Item, setItem: setL2Item, qty: l2Qty, setQty: setL2Qty, rate: l2Rate, setRate: setL2Rate, n: 2 },
        ].map((row) => (
          <div key={row.n} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-6">
              {row.n === 1 && <label className={labelCls}>Item id</label>}
              <input value={row.item} onChange={(e) => row.setItem(e.target.value)} placeholder={`line ${row.n} item id`} className={inputCls} />
            </div>
            <div className="col-span-3">
              {row.n === 1 && <label className={labelCls}>Qty</label>}
              <input value={row.qty} onChange={(e) => row.setQty(e.target.value)} inputMode="decimal" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <div className="col-span-3">
              {row.n === 1 && <label className={labelCls}>Rate</label>}
              <input value={row.rate} onChange={(e) => row.setRate(e.target.value)} inputMode="decimal" className={`${inputCls} font-mono tabular-nums`} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-4">
        <button type="button" onClick={run} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <FlaskConical size={14} />}
          Apply pricing
        </button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-bg)]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className={thLine}>Item</th>
                  <th className={`${thLine} text-right`}>Qty</th>
                  <th className={`${thLine} text-right`}>Rate</th>
                  <th className={thLine}>Note</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((l, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs">{l.itemId || "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{String(l.qty ?? "")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(l.rate)}</td>
                    <td className="px-3 py-2 text-xs">
                      {l.isFreeGood ? (
                        <span className="inline-flex items-center gap-1 text-green-400"><Gift size={12} /> Free good</span>
                      ) : l.appliedRuleId ? (
                        <span className="text-[var(--color-primary)]">Rule applied</span>
                      ) : <span className="text-[var(--color-muted)]">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {freeGoods.length > 0 && (
            <p className="text-xs text-green-400 flex items-center gap-1.5">
              <Gift size={13} /> {freeGoods.length} free-goods line(s) added by BXGY schemes.
            </p>
          )}
          {result.applied.length === 0 && (
            <p className="text-xs text-[var(--color-muted)]">No rules matched these lines.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COUPONS
// ─────────────────────────────────────────────────────────────────────────────
function CouponsPanel() {
  const [code, setCode] = useState("");
  const [discType, setDiscType] = useState<string>("pct");
  const [value, setValue] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [oncePerCustomer, setOncePerCustomer] = useState(false);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!code.trim()) { toast.error("Enter a coupon code"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/coupons", {
        code: code.trim(),
        discType,
        value: value.trim() || 0,
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
        maxRedemptions: maxRedemptions.trim() ? Number(maxRedemptions) : undefined,
        oncePerCustomer,
      });
      toast.success(`Coupon "${code.trim().toUpperCase()}" saved`);
      setCode(""); setValue(""); setValidFrom(""); setValidTo("");
      setMaxRedemptions(""); setOncePerCustomer(false); setDiscType("pct");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <Ticket size={15} className="text-[var(--color-primary)]" /> New coupon
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DIWALI10" className={`${inputCls} uppercase`} />
          </div>
          <div>
            <label className={labelCls}>Discount type</label>
            <select value={discType} onChange={(e) => setDiscType(e.target.value)} className={inputCls}>
              <option value="pct">Percent (%)</option>
              <option value="amt">Flat amount (₹)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Value {discType === "pct" ? "(%)" : "(₹)"}</label>
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Valid from</label>
            <DatePicker value={validFrom} onChange={setValidFrom} />
          </div>
          <div>
            <label className={labelCls}>Valid to</label>
            <DatePicker value={validTo} onChange={setValidTo} />
          </div>
          <div>
            <label className={labelCls}>Max redemptions (blank = ∞)</label>
            <input value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} inputMode="numeric" placeholder="∞" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div className="flex items-end md:col-span-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={oncePerCustomer} onChange={(e) => setOncePerCustomer(e.target.checked)} className="accent-[var(--color-primary)] w-4 h-4" />
              Once per customer
            </label>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={create} disabled={saving} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Save coupon
          </button>
        </div>
      </div>

      <CouponRedeemTester />
    </div>
  );
}

function CouponRedeemTester() {
  const [code, setCode] = useState("");
  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);

  const run = async () => {
    if (!code.trim()) { toast.error("Enter a coupon code"); return; }
    setBusy(true);
    try {
      const res = await api.post<RedeemResult>("/api/books/coupons/redeem", {
        code: code.trim(),
        partyLedgerId: partyLedgerId.trim() || undefined,
        amount: Number(amount) || 0,
      });
      setResult(res ?? null);
      toast.success(`Discount ${rupee(res?.discount)}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
        <FlaskConical size={15} className="text-[var(--color-primary)]" /> Redeem tester
      </h3>
      <p className="text-[11px] text-[var(--color-muted)] mb-4">
        Posts to <code>/coupons/redeem</code> - this counts a real redemption.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DIWALI10" className={`${inputCls} uppercase`} />
        </div>
        <div>
          <label className={labelCls}>Party ledger id</label>
          <input value={partyLedgerId} onChange={(e) => setPartyLedgerId(e.target.value)} placeholder="ledger id" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Order amount</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button type="button" onClick={run} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Percent size={14} />}
          Redeem
        </button>
      </div>
      {result && (
        <div className="mt-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Discount</span><span className="tabular-nums text-[var(--color-primary)] font-semibold">{rupee(result.discount)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Times redeemed</span><span className="tabular-nums">{String(result.redeemed)}</span></div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIPPING RULES
// ─────────────────────────────────────────────────────────────────────────────
interface SlabDraft { key: string; from: string; to: string; charge: string; }
function newSlab(): SlabDraft {
  return { key: Math.random().toString(36).slice(2), from: "", to: "", charge: "" };
}

function ShippingPanel() {
  const [name, setName] = useState("");
  const [basis, setBasis] = useState<string>("amount");
  const [slabs, setSlabs] = useState<SlabDraft[]>([newSlab()]);
  const [createdId, setCreatedId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const setSlab = (key: string, patch: Partial<SlabDraft>) =>
    setSlabs((s) => s.map((sl) => (sl.key === key ? { ...sl, ...patch } : sl)));
  const addSlab = () => setSlabs((s) => [...s, newSlab()]);
  const removeSlab = (key: string) => setSlabs((s) => (s.length > 1 ? s.filter((sl) => sl.key !== key) : s));

  const create = async () => {
    if (!name.trim()) { toast.error("Enter a rule name"); return; }
    const filled = slabs
      .filter((sl) => sl.charge.trim() !== "")
      .map((sl) => ({
        from: Number(sl.from) || 0,
        to: sl.to.trim() === "" ? undefined : Number(sl.to),
        charge: Number(sl.charge) || 0,
      }));
    if (filled.length === 0) { toast.error("Add at least one slab with a charge"); return; }
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>("/api/books/shipping-rules", {
        name: name.trim(),
        basis,
        slabs: filled,
      });
      setCreatedId(res?.id ?? "");
      toast.success(`Shipping rule "${name.trim()}" created`);
      setName("");
      setSlabs([newSlab()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <Truck size={15} className="text-[var(--color-primary)]" /> New shipping rule
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard freight" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Basis</label>
            <select value={basis} onChange={(e) => setBasis(e.target.value)} className={inputCls}>
              <option value="amount">Order amount</option>
              <option value="weight">Weight</option>
              <option value="qty">Quantity</option>
            </select>
          </div>
        </div>

        <label className={labelCls}>Slabs (leave "to" blank for an open-ended top slab)</label>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-[var(--color-muted)] px-1">
            <span className="col-span-4">From</span>
            <span className="col-span-4">To</span>
            <span className="col-span-3">Charge</span>
            <span className="col-span-1" />
          </div>
          {slabs.map((sl) => (
            <div key={sl.key} className="grid grid-cols-12 gap-2 items-center">
              <input value={sl.from} onChange={(e) => setSlab(sl.key, { from: e.target.value })} inputMode="decimal" placeholder="0" className={`${inputCls} col-span-4 font-mono tabular-nums`} />
              <input value={sl.to} onChange={(e) => setSlab(sl.key, { to: e.target.value })} inputMode="decimal" placeholder="∞" className={`${inputCls} col-span-4 font-mono tabular-nums`} />
              <input value={sl.charge} onChange={(e) => setSlab(sl.key, { charge: e.target.value })} inputMode="decimal" placeholder="0" className={`${inputCls} col-span-3 font-mono tabular-nums`} />
              <button type="button" onClick={() => removeSlab(sl.key)} className="col-span-1 text-[var(--color-muted)] hover:text-red-400 flex justify-center" title="Remove slab">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4">
          <button type="button" onClick={addSlab} className={btnGhost}>
            <Plus size={14} /> Add slab
          </button>
          <button type="button" onClick={create} disabled={saving} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Create rule
          </button>
        </div>
        {createdId && (
          <p className="text-[11px] text-[var(--color-muted)] mt-3">
            Created rule id <code className="text-[var(--color-text)]">{createdId}</code> - paste it into the charge tester below.
          </p>
        )}
      </div>

      <ShippingChargeTester presetRuleId={createdId} />
    </div>
  );
}

function ShippingChargeTester({ presetRuleId }: { presetRuleId: string }) {
  const [ruleId, setRuleId] = useState("");
  const [basisValue, setBasisValue] = useState("1500");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShippingChargeResult | null>(null);

  useEffect(() => {
    if (presetRuleId) setRuleId(presetRuleId);
  }, [presetRuleId]);

  const run = async () => {
    if (!ruleId.trim()) { toast.error("Enter a shipping rule id"); return; }
    setBusy(true);
    try {
      const res = await api.post<ShippingChargeResult>("/api/books/shipping/charge", {
        ruleId: ruleId.trim(),
        basisValue: Number(basisValue) || 0,
      });
      setResult(res ?? null);
      toast.success(`Charge ${rupee(res?.charge)}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
        <FlaskConical size={15} className="text-[var(--color-primary)]" /> Charge tester
      </h3>
      <p className="text-[11px] text-[var(--color-muted)] mb-4">
        Posts to <code>/shipping/charge</code> and resolves the matching slab.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Shipping rule id</label>
          <input value={ruleId} onChange={(e) => setRuleId(e.target.value)} placeholder="rule id" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Basis value</label>
          <input value={basisValue} onChange={(e) => setBasisValue(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button type="button" onClick={run} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Truck size={14} />}
          Get charge
        </button>
      </div>
      {result && (
        <div className="mt-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Freight charge</span><span className="tabular-nums text-[var(--color-primary)] font-semibold">{rupee(result.charge)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Basis</span><span>{result.basis}</span></div>
          {result.accountLedgerId && (
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Freight ledger</span><span className="font-mono text-xs">{result.accountLedgerId}</span></div>
          )}
        </div>
      )}
    </div>
  );
}

export default BooksPricingTab;
