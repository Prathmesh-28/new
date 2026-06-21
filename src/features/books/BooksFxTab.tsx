import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Globe, RefreshCw, Plus, ArrowRightLeft, Coins, Scale, Banknote,
  TrendingUp, TrendingDown, Calculator, Wallet,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — shapes mirror backend/src/modules/books/fx.js
// ─────────────────────────────────────────────────────────────────────────────
interface Ledger {
  id: string;
  name: string;
  is_party?: boolean;
  isParty?: boolean;
}
interface FxRateRow {
  id: string;
  currency: string;
  rateDate: string;
  rate: string;
}
interface OpenPositionRow {
  partyLedgerId: string;
  partyName: string | null;
  currency: string;
  kind: "RECEIVABLE" | "PAYABLE" | string;
  openFc: string;
  bookedBase: string;
  openItems: number;
}
interface SettlementResult {
  posted?: boolean;
  gainLoss?: string;
  voucher?: { voucherNumber?: string } | unknown;
}
interface RevalueLine {
  partyLedgerId: string;
  partyName: string | null;
  currency: string;
  kind: string;
  asOf: string;
  currentRate?: string;
  openFc?: string;
  bookedBase?: string;
  currentBase?: string;
  gainLoss?: string;
  posted?: boolean;
  skipped?: boolean;
  reason?: string;
}
interface RevalueAllResult {
  asOf: string;
  groups: number;
  posted: number;
  totalGainLoss: string;
  lines: RevalueLine[];
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
  const neg = num(v) < 0;
  const abs = Math.abs(num(v)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-₹" : "₹"}${abs}`;
}
function fc(v: string | number | null | undefined, currency: string): string {
  return `${num(v).toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${currency}`;
}
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    if (Array.isArray(r.rows)) return r.rows as T[];
    if (Array.isArray(r.data)) return r.data as T[];
  }
  return [];
}

const COMMON_CCY = ["USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD"] as const;
const KINDS = [
  { id: "RECEIVABLE", label: "Receivable (export / they owe us)" },
  { id: "PAYABLE", label: "Payable (import / we owe them)" },
] as const;

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

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 flex flex-col">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        <span className="text-[var(--color-primary)]">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const recv = kind === "RECEIVABLE";
  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
        recv
          ? "bg-green-900/30 text-green-300 border-green-700/40"
          : "bg-amber-900/30 text-amber-300 border-amber-700/40"
      }`}
    >
      {recv ? "Receivable" : "Payable"}
    </span>
  );
}

function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      list="fx-currency-list"
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      placeholder="USD"
      maxLength={3}
      className={`${inputCls} font-mono uppercase`}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksFxTab() {
  const [parties, setParties] = useState<Ledger[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const l = await api.get<Ledger[]>("/api/books/ledgers");
        const list = Array.isArray(l) ? l : asArray<Ledger>(l);
        setParties(list.filter((x) => x.is_party ?? x.isParty));
      } catch {
        /* party list optional */
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      {/* shared currency autocomplete list */}
      <datalist id="fx-currency-list">
        {COMMON_CCY.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* HEADER + HOW TO USE */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Globe size={17} className="text-[var(--color-primary)]" /> Multi-currency (FX)
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-2 leading-relaxed">
          The ledger always carries base currency (INR). A foreign voucher keeps its original currency
          + rate, and the open foreign-currency balance per party is tracked in a subledger. Use the tools
          below to maintain the dated rate master, convert amounts, see what is still open in each currency,
          run a period-end revaluation (unrealised gain/loss), and post a realised FX settlement.
        </p>
        <p className="text-[11px] text-[var(--color-muted)] mt-3">
          How to use: 1) keep the <strong>rate master</strong> current for each currency · 2) review the
          <strong> open position</strong> · 3) at period end run <strong>Revalue all</strong> to mark open
          items to the as-of rate · 4) on actual receipt/payment at a new rate, post an
          <strong> FX settlement</strong> for the realised gain/loss.
        </p>
      </div>

      {/* RATE MASTER + CONVERTER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FxRateMaster />
        <FxConverter />
      </div>

      {/* OPEN POSITION */}
      <OpenPositionCard parties={parties} />

      {/* REVALUE ALL + SETTLEMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevalueAllCard />
        <FxSettlementCard parties={parties} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RATE MASTER — dated exchange-rate per currency (GET/POST /fx/rates)
// ─────────────────────────────────────────────────────────────────────────────
function FxRateMaster() {
  const [currency, setCurrency] = useState("USD");
  const [rows, setRows] = useState<FxRateRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rateDate, setRateDate] = useState(todayIso());
  const [rate, setRate] = useState("");

  const load = useCallback(async (ccy: string) => {
    if (!ccy.trim()) {
      setRows([]);
      return;
    }
    setBusy(true);
    try {
      const r = await api.get<FxRateRow[]>(`/api/books/fx/rates?currency=${encodeURIComponent(ccy.trim())}`);
      setRows(Array.isArray(r) ? r : asArray<FxRateRow>(r));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(currency);
  }, [load, currency]);

  const submit = async () => {
    if (!currency.trim()) {
      toast.error("Enter a currency code");
      return;
    }
    if (!rateDate) {
      toast.error("Pick a rate date");
      return;
    }
    if ((Number(rate) || 0) <= 0) {
      toast.error("Enter a rate above zero");
      return;
    }
    setSaving(true);
    try {
      await api.post<FxRateRow>("/api/books/fx/rates", {
        currency: currency.trim().toUpperCase(),
        rateDate,
        rate: Number(rate),
      });
      toast.success(`Rate saved: 1 ${currency.trim().toUpperCase()} = ₹${rate}`);
      setRate("");
      await load(currency);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Exchange-rate master (dated)" icon={<Coins size={15} />}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Currency</label>
            <CurrencyInput value={currency} onChange={setCurrency} />
          </div>
          <div>
            <label className={labelCls}>Rate date</label>
            <input type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Rate (₹ per 1 unit)</label>
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              placeholder="83.250000"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Save rate
          </button>
          <button type="button" onClick={() => void load(currency)} className={btnGhost} title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Currency</th>
                <th className={thCls}>Rate date</th>
                <th className={thR}>₹ per unit</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-[var(--color-muted)]">No rates for {currency || "this currency"} yet.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-mono text-xs">{r.currency}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{r.rateDate}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.rate)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">
          The latest rate on or before a transaction date is the one applied. Newest first.
        </p>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERTER — foreign → base (GET /fx/convert?amount=&rate=)
// ─────────────────────────────────────────────────────────────────────────────
function FxConverter() {
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [base, setBase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const useLatestRate = async () => {
    if (!currency.trim()) {
      toast.error("Enter a currency code");
      return;
    }
    try {
      const rs = await api.get<FxRateRow[]>(`/api/books/fx/rates?currency=${encodeURIComponent(currency.trim())}`);
      const list = Array.isArray(rs) ? rs : asArray<FxRateRow>(rs);
      if (list.length === 0) {
        toast.error(`No rate on file for ${currency.trim().toUpperCase()}`);
        return;
      }
      setRate(list[0].rate);
      toast.success(`Loaded latest ${currency.trim().toUpperCase()} rate (${list[0].rateDate})`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const convert = async () => {
    if ((Number(amount) || 0) <= 0) {
      toast.error("Enter a foreign amount above zero");
      return;
    }
    if ((Number(rate) || 0) <= 0) {
      toast.error("Enter a rate above zero");
      return;
    }
    setBusy(true);
    try {
      const res = await api.get<{ base: string }>(
        `/api/books/fx/convert?amount=${encodeURIComponent(amount)}&rate=${encodeURIComponent(rate)}`,
      );
      setBase(res?.base ?? null);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Currency converter" icon={<ArrowRightLeft size={15} />}>
      <div className="space-y-3 flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Currency</label>
            <CurrencyInput value={currency} onChange={setCurrency} />
          </div>
          <div>
            <label className={labelCls}>Foreign amount</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label className={labelCls}>Rate (₹ per unit)</label>
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              placeholder="83.25"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={convert} disabled={busy} className={btnPrimary}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />} Convert
          </button>
          <button type="button" onClick={useLatestRate} className={btnGhost} title="Use latest rate from master">
            <Coins size={14} /> Use latest rate
          </button>
        </div>

        {base != null && (
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">{fc(amount, currency.trim().toUpperCase() || "FC")} @ {rate}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--color-border)] pt-1 mt-1 font-semibold">
              <span>Base value</span>
              <span className="tabular-nums text-[var(--color-primary)]">{rupee(base)}</span>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mt-3">
        Converts a foreign amount to base (INR) at the given rate. Server rounds to 2 decimals.
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OPEN POSITION — net open FC per party/currency (GET /fx/open-position)
// ─────────────────────────────────────────────────────────────────────────────
function OpenPositionCard({ parties }: { parties: Ledger[] }) {
  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [currency, setCurrency] = useState("");
  const [rows, setRows] = useState<OpenPositionRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (party: string, ccy: string) => {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (party) qs.set("partyLedgerId", party);
      if (ccy.trim()) qs.set("currency", ccy.trim());
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const r = await api.get<OpenPositionRow[]>(`/api/books/fx/open-position${suffix}`);
      setRows(Array.isArray(r) ? r : asArray<OpenPositionRow>(r));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(partyLedgerId, currency);
  }, [load, partyLedgerId, currency]);

  const totalBookedBase = rows.reduce((a, r) => a + num(r.bookedBase), 0);

  return (
    <Card title="Open foreign-currency position" icon={<Wallet size={15} />}>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-[220px]">
          <label className={labelCls}>Party (optional)</label>
          <select value={partyLedgerId} onChange={(e) => setPartyLedgerId(e.target.value)} className={inputCls}>
            <option value="">All parties</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className={labelCls}>Currency (optional)</label>
          <CurrencyInput value={currency} onChange={setCurrency} />
        </div>
        <button type="button" onClick={() => void load(partyLedgerId, currency)} className={btnGhost} title="Refresh">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>Party</th>
              <th className={thCls}>Currency</th>
              <th className={thCls}>Kind</th>
              <th className={thR}>Open FC</th>
              <th className={thR}>Booked base</th>
              <th className={thR}>Open items</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">No open foreign-currency positions.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.partyLedgerId}-${r.currency}-${r.kind}-${i}`} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5 font-medium">{r.partyName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{r.currency}</td>
                  <td className="px-3 py-2.5"><KindBadge kind={r.kind} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fc(r.openFc, r.currency)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.bookedBase)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{r.openItems}</td>
                </tr>
              ))
            )}
          </tbody>
          {!busy && rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] font-semibold bg-[var(--color-bg)]/40">
                <td className="px-3 py-2.5" colSpan={4}>Total booked base</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{rupee(totalBookedBase)}</td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mt-2">
        Booked base = open FC valued at the rate each item was originally booked at. Revaluation marks this to the as-of rate.
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REVALUE ALL — period-end mark-to-market (POST /fx/revalue-all {asOf})
// ─────────────────────────────────────────────────────────────────────────────
function RevalueAllCard() {
  const [asOf, setAsOf] = useState(todayIso());
  const [result, setResult] = useState<RevalueAllResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!asOf) {
      toast.error("Pick an as-of date");
      return;
    }
    if (!window.confirm(`Run exchange-rate revaluation as of ${asOf}? This posts unrealised gain/loss journals for each open position.`)) return;
    setBusy(true);
    try {
      const res = await api.post<RevalueAllResult>("/api/books/fx/revalue-all", { asOf });
      setResult(res);
      toast.success(`Revalued ${res?.groups ?? 0} group(s) · ${res?.posted ?? 0} posted`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const total = num(result?.totalGainLoss);

  return (
    <Card title="Exchange-rate revaluation" icon={<Scale size={15} />}>
      <div className="space-y-3 flex-1">
        <div className="flex items-end gap-3">
          <div>
            <label className={labelCls}>As of date</label>
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputCls} />
          </div>
          <button type="button" onClick={run} disabled={busy} className={btnPrimary}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Scale size={14} />} Revalue all
          </button>
        </div>

        {result && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap gap-3">
              <StatCard label="Groups" value={String(result.groups)} />
              <StatCard label="Posted" value={String(result.posted)} tint="green" />
              <StatCard
                label="Net gain / loss"
                value={rupee(result.totalGainLoss)}
                tint={total >= 0 ? "green" : "red"}
              />
            </div>
            <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className={thCls}>Party</th>
                    <th className={thCls}>Ccy</th>
                    <th className={thR}>Rate</th>
                    <th className={thR}>Gain / loss</th>
                    <th className={thCls}>State</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-5 text-center text-[var(--color-muted)]">No open positions to revalue.</td></tr>
                  ) : (
                    result.lines.map((l, i) => {
                      const g = num(l.gainLoss);
                      return (
                        <tr key={`${l.partyLedgerId}-${l.currency}-${i}`} className="border-b border-[var(--color-border)] last:border-b-0">
                          <td className="px-3 py-2.5 font-medium">{l.partyName || "—"}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{l.currency}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{l.currentRate ?? "—"}</td>
                          <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${g >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {rupee(l.gainLoss)}
                          </td>
                          <td className="px-3 py-2.5">
                            {l.skipped ? (
                              <span className="text-[10px] text-[var(--color-muted)]" title={l.reason}>Skipped</span>
                            ) : l.posted ? (
                              <span className="text-[10px] font-semibold text-green-300">Posted</span>
                            ) : (
                              <span className="text-[10px] text-[var(--color-muted)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mt-3">
        Marks every open foreign balance to its dated rate and posts the unrealised gain/loss per party/currency. The subledger stays booked at its original rate until actually settled.
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FX SETTLEMENT — post a realised gain/loss against a party (POST /fx/settlement)
// ─────────────────────────────────────────────────────────────────────────────
function FxSettlementCard({ parties }: { parties: Ledger[] }) {
  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [gainLoss, setGainLoss] = useState("");
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  const g = num(gainLoss);

  const submit = async () => {
    if (!partyLedgerId) {
      toast.error("Pick a party ledger");
      return;
    }
    if (g === 0) {
      toast.error("Enter a non-zero gain (+) or loss (-)");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<SettlementResult>("/api/books/fx/settlement", {
        partyLedgerId,
        gainLoss: g,
        date,
      });
      if (res?.posted === false) {
        toast.error("Nothing to post (zero gain/loss)");
      } else {
        toast.success(`Realised forex ${g >= 0 ? "gain" : "loss"} of ${rupee(Math.abs(g))} posted`);
        setGainLoss("");
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Post FX settlement (realised)" icon={<Banknote size={15} />}>
      <div className="space-y-3 flex-1">
        <div>
          <label className={labelCls}>Party ledger</label>
          <select value={partyLedgerId} onChange={(e) => setPartyLedgerId(e.target.value)} className={inputCls}>
            <option value="">Select party…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Gain (+) / loss (−)</label>
            <input
              value={gainLoss}
              onChange={(e) => setGainLoss(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 1250 or -800"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-muted)]">Effect</span>
            <span className={`inline-flex items-center gap-1 font-semibold ${g >= 0 ? "text-green-400" : "text-red-400"}`}>
              {g >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {g >= 0 ? "Forex gain — party debited" : "Forex loss — party credited"}
            </span>
          </div>
          <p className="text-[var(--color-muted)] pt-1">
            Posts a journal between the party and the "Forex Gain/Loss" ledger for the realised swing on settlement at a different rate.
          </p>
        </div>
        <button type="button" onClick={submit} disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Banknote size={14} />} Post settlement
        </button>
      </div>
    </Card>
  );
}
