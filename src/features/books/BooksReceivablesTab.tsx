import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";
import {
  Wallet, RefreshCw, ArrowLeftRight, FileText, Receipt, Undo2, Plus, Link2,
} from "lucide-react";
import DatePicker from "@/components/DatePicker";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (loose - backend response shapes inlined)
// ─────────────────────────────────────────────────────────────────────────────
interface LedgerLite {
  id: string;
  name: string;
  is_party?: boolean;
  is_bank?: boolean;
}

interface AgingRow {
  ledgerId?: string;
  party: string;
  notDue: string | number;
  d0_30: string | number;
  d31_60: string | number;
  d61_90: string | number;
  d90_plus: string | number;
  total: string | number;
}

interface AgingReport {
  rows: AgingRow[];
  totals?: Partial<AgingRow>;
}

interface StatementLine {
  date: string;
  voucher: string;
  debit: string | number;
  credit: string | number;
  balance: string | number;
}

interface PartyStatement {
  opening: string | number;
  closing: string | number;
  lines: StatementLine[];
}

interface OpenBill {
  voucherId: string;
  voucherNumber: string;
  date: string;
  amount: string | number;
  outstanding: string | number;
  kind?: string;
}

type Section = "aging" | "statement" | "bills" | "docs";
type AgingKind = "ar" | "ap";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfFyIso(): string {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-04-01`;
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v) || 0;
}

function rupee(v: string | number | null | undefined): string {
  return `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const GST_RATES = [0, 5, 12, 18, 28] as const;

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksReceivablesTab() {
  const [section, setSection] = useState<Section>("aging");
  const [parties, setParties] = useState<LedgerLite[]>([]);
  const [banks, setBanks] = useState<LedgerLite[]>([]);

  // shared ledger load (for party pickers + bank pickers)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get<LedgerLite[]>("/api/books/ledgers");
        if (cancelled) return;
        const all = Array.isArray(rows) ? rows : [];
        setParties(all.filter((l) => l.is_party));
        setBanks(all.filter((l) => l.is_bank || /cash/i.test(l.name)));
      } catch (e) {
        if (!cancelled) toast.error(errMsg(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sections: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "aging",     label: "Aging",            icon: <Wallet size={14} /> },
    { id: "statement", label: "Party statement",  icon: <FileText size={14} /> },
    { id: "bills",     label: "Open bills",       icon: <Link2 size={14} /> },
    { id: "docs",      label: "Debit note / refund", icon: <Receipt size={14} /> },
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

      {section === "aging" && <AgingSection />}
      {section === "statement" && <StatementSection parties={parties} />}
      {section === "bills" && <OpenBillsSection parties={parties} />}
      {section === "docs" && <DocsSection parties={parties} banks={banks} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AGING (AR / AP)
// ─────────────────────────────────────────────────────────────────────────────
function AgingSection() {
  const [kind, setKind] = useState<AgingKind>("ar");
  const [asOf, setAsOf] = useState(todayIso());
  const [data, setData] = useState<AgingReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const path = kind === "ar" ? "ar-aging" : "ap-aging";
      const res = await api.get<AgingReport | AgingRow[]>(
        `/api/books/reports/${path}?asOf=${encodeURIComponent(asOf)}`,
      );
      // tolerate either { rows, totals } or a bare array
      const norm: AgingReport = Array.isArray(res)
        ? { rows: res }
        : { rows: res?.rows ?? [], totals: res?.totals };
      setData(norm);
    } catch (e) {
      toast.error(errMsg(e));
      setData({ rows: [] });
    } finally {
      setBusy(false);
    }
  }, [kind, asOf]);

  useEffect(() => { void load(); }, [load]);

  const rows = data?.rows ?? [];

  // compute totals if backend didn't supply them
  const totals = useMemo(() => {
    if (data?.totals) {
      return {
        notDue: num(data.totals.notDue), d0_30: num(data.totals.d0_30),
        d31_60: num(data.totals.d31_60), d61_90: num(data.totals.d61_90),
        d90_plus: num(data.totals.d90_plus), total: num(data.totals.total),
      };
    }
    return rows.reduce(
      (a, r) => ({
        notDue: a.notDue + num(r.notDue),
        d0_30: a.d0_30 + num(r.d0_30),
        d31_60: a.d31_60 + num(r.d31_60),
        d61_90: a.d61_90 + num(r.d61_90),
        d90_plus: a.d90_plus + num(r.d90_plus),
        total: a.total + num(r.total),
      }),
      { notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 },
    );
  }, [data, rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden">
          {(["ar", "ap"] as AgingKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                kind === k
                  ? "bg-[var(--color-primary)] text-[var(--color-bg)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {k === "ar" ? "Receivables (AR)" : "Payables (AP)"}
            </button>
          ))}
        </div>
        <div>
          <label className={labelCls}>As of</label>
          <DatePicker value={asOf} onChange={setAsOf} />
        </div>
        <button type="button" onClick={() => void load()} className="text-[var(--color-muted)] hover:text-[var(--color-text)] pb-2.5" title="Refresh">
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold">
            {kind === "ar" ? "Accounts Receivable aging" : "Accounts Payable aging"} · as of {asOf}
          </h3>
          <ExportMenu
            size="sm"
            filename={`${kind === "ar" ? "ar" : "ap"}-aging-${asOf}`}
            title={`${kind === "ar" ? "Accounts Receivable aging" : "Accounts Payable aging"} · as of ${asOf}`}
            columns={[
              { key: "party", label: "Party" },
              { key: "notDue", label: "Not Due" },
              { key: "d0_30", label: "0-30" },
              { key: "d31_60", label: "31-60" },
              { key: "d61_90", label: "61-90" },
              { key: "d90_plus", label: "90+" },
              { key: "total", label: "Total" },
            ]}
            rows={rows.map((r) => ({
              party: r.party,
              notDue: rupee(r.notDue),
              d0_30: rupee(r.d0_30),
              d31_60: rupee(r.d31_60),
              d61_90: rupee(r.d61_90),
              d90_plus: rupee(r.d90_plus),
              total: rupee(r.total),
            }))}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Party</Th>
                <Th right>Not Due</Th>
                <Th right>0-30</Th>
                <Th right>31-60</Th>
                <Th right>61-90</Th>
                <Th right>90+</Th>
                <Th right>Total</Th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={7} rows={6} />
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--color-muted)]">Nothing outstanding as of {asOf}.</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.ledgerId ?? `${r.party}-${i}`} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{r.party}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.notDue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.d0_30)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.d31_60)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.d61_90)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{rupee(r.d90_plus)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rupee(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!busy && rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)] font-semibold">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(totals.notDue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(totals.d0_30)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(totals.d31_60)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(totals.d61_90)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{rupee(totals.d90_plus)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{rupee(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTY STATEMENT
// ─────────────────────────────────────────────────────────────────────────────
function StatementSection({ parties }: { parties: LedgerLite[] }) {
  const [ledgerId, setLedgerId] = useState("");
  const [from, setFrom] = useState(firstOfFyIso());
  const [to, setTo] = useState(todayIso());
  const [data, setData] = useState<PartyStatement | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ledgerId) { toast.error("Pick a party"); return; }
    setBusy(true);
    try {
      const res = await api.get<PartyStatement | StatementLine[]>(
        `/api/books/reports/party-statement?ledgerId=${encodeURIComponent(ledgerId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      const norm: PartyStatement = Array.isArray(res)
        ? { opening: 0, closing: 0, lines: res }
        : { opening: res?.opening ?? 0, closing: res?.closing ?? 0, lines: res?.lines ?? [] };
      setData(norm);
    } catch (e) {
      toast.error(errMsg(e));
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [ledgerId, from, to]);

  const lines = data?.lines ?? [];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className={labelCls}>Party</label>
            <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} className={inputCls}>
              <option value="">Select party…</option>
              {parties.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>From</label>
            <DatePicker value={from} onChange={setFrom} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <DatePicker value={to} onChange={setTo} />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={() => void load()} disabled={busy} className={btnPrimary}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
            Run statement
          </button>
        </div>
      </div>

      {data && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold">Statement · {from} → {to}</h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-[var(--color-muted)]">Opening: <span className="tabular-nums text-[var(--color-text)]">{rupee(data.opening)}</span></span>
              <span className="text-[var(--color-muted)]">Closing: <span className="tabular-nums text-[var(--color-primary)] font-semibold">{rupee(data.closing)}</span></span>
              <ExportMenu
                size="sm"
                filename={`party-statement-${from}_${to}`}
                title={`Party statement · ${from} → ${to}`}
                subtitle={`Opening ${rupee(data.opening)} · Closing ${rupee(data.closing)}`}
                columns={[
                  { key: "date", label: "Date" },
                  { key: "voucher", label: "Voucher" },
                  { key: "debit", label: "Debit" },
                  { key: "credit", label: "Credit" },
                  { key: "balance", label: "Balance" },
                ]}
                rows={lines.map((l) => ({
                  date: l.date,
                  voucher: l.voucher,
                  debit: num(l.debit) ? rupee(l.debit) : "",
                  credit: num(l.credit) ? rupee(l.credit) : "",
                  balance: rupee(l.balance),
                }))}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <Th>Date</Th>
                  <Th>Voucher</Th>
                  <Th right>Debit</Th>
                  <Th right>Credit</Th>
                  <Th right>Balance</Th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <td className="px-3 py-2.5 text-[var(--color-muted)] italic" colSpan={4}>Opening balance</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{rupee(data.opening)}</td>
                </tr>
                {busy ? (
                  <SkeletonRows cols={5} rows={5} />
                ) : lines.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted)]">No transactions in this period.</td></tr>
                ) : (
                  lines.map((l, i) => (
                    <tr key={`${l.date}-${i}`} className="border-b border-[var(--color-border)]">
                      <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{l.date}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{l.voucher}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{num(l.debit) ? rupee(l.debit) : "-"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{num(l.credit) ? rupee(l.credit) : "-"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(l.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {!busy && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)] font-semibold">
                    <td className="px-3 py-2.5" colSpan={4}>Closing balance</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{rupee(data.closing)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OPEN BILLS + ALLOCATION
// ─────────────────────────────────────────────────────────────────────────────
function OpenBillsSection({ parties }: { parties: LedgerLite[] }) {
  const [partyId, setPartyId] = useState("");
  const [bills, setBills] = useState<OpenBill[]>([]);
  const [busy, setBusy] = useState(false);

  // allocation form
  const [sourceVoucherId, setSourceVoucherId] = useState("");
  const [targetVoucherId, setTargetVoucherId] = useState("");
  const [amount, setAmount] = useState("");
  const [allocating, setAllocating] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) { setBills([]); return; }
    setBusy(true);
    try {
      const res = await api.get<OpenBill[]>(`/api/books/parties/${encodeURIComponent(id)}/open-bills`);
      setBills(Array.isArray(res) ? res : []);
    } catch (e) {
      toast.error(errMsg(e));
      setBills([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(partyId); }, [partyId, load]);

  const allocate = async () => {
    if (!sourceVoucherId || !targetVoucherId) { toast.error("Pick both a source and a target bill"); return; }
    if (sourceVoucherId === targetVoucherId) { toast.error("Source and target must differ"); return; }
    const amt = Number(amount) || 0;
    if (amt <= 0) { toast.error("Enter an amount above zero"); return; }
    setAllocating(true);
    try {
      await api.post<{ ok: boolean }>("/api/books/allocations", {
        sourceVoucherId,
        targetVoucherId,
        amount: amt,
      });
      toast.success("Allocation posted");
      setAmount("");
      setSourceVoucherId("");
      setTargetVoucherId("");
      await load(partyId);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setAllocating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <label className={labelCls}>Party</label>
        <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className={inputCls}>
          <option value="">Select party…</option>
          {parties.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Open bills</h3>
          <div className="flex items-center gap-2">
            <ExportMenu
              size="sm"
              filename="open-bills"
              title="Open bills"
              columns={[
                { key: "date", label: "Date" },
                { key: "voucherNumber", label: "Voucher" },
                { key: "kind", label: "Kind" },
                { key: "amount", label: "Amount" },
                { key: "outstanding", label: "Outstanding" },
              ]}
              rows={bills.map((b) => ({
                date: b.date,
                voucherNumber: b.voucherNumber,
                kind: b.kind ?? "",
                amount: rupee(b.amount),
                outstanding: rupee(b.outstanding),
              }))}
            />
            <button type="button" onClick={() => void load(partyId)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Date</Th>
                <Th>Voucher</Th>
                <Th>Kind</Th>
                <Th right>Amount</Th>
                <Th right>Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {!partyId ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted)]">Pick a party to see open bills.</td></tr>
              ) : busy ? (
                <SkeletonRows cols={5} rows={5} />
              ) : bills.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted)]">No open bills for this party.</td></tr>
              ) : (
                bills.map((b) => (
                  <tr key={b.voucherId} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{b.date}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{b.voucherNumber}</td>
                    <td className="px-3 py-2.5 capitalize text-xs">{b.kind ?? "-"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(b.amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rupee(b.outstanding)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* allocation form */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <ArrowLeftRight size={15} className="text-[var(--color-primary)]" /> Settle a bill against an advance / credit
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Source (advance / credit)</label>
            <select value={sourceVoucherId} onChange={(e) => setSourceVoucherId(e.target.value)} className={inputCls}>
              <option value="">Select source bill…</option>
              {bills.map((b) => (
                <option key={b.voucherId} value={b.voucherId}>
                  #{b.voucherNumber} · {rupee(b.outstanding)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Target (bill to settle)</label>
            <select value={targetVoucherId} onChange={(e) => setTargetVoucherId(e.target.value)} className={inputCls}>
              <option value="">Select target bill…</option>
              {bills.map((b) => (
                <option key={b.voucherId} value={b.voucherId}>
                  #{b.voucherNumber} · {rupee(b.outstanding)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Amount</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={allocate} disabled={allocating || !partyId} className={btnPrimary}>
            {allocating ? <RefreshCw size={14} className="animate-spin" /> : <Link2 size={14} />}
            Allocate
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBIT NOTE / REFUND
// ─────────────────────────────────────────────────────────────────────────────
function DocsSection({ parties, banks }: { parties: LedgerLite[]; banks: LedgerLite[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <DebitNoteCard parties={parties} />
      <RefundCard parties={parties} banks={banks} />
    </div>
  );
}

function DebitNoteCard({ parties }: { parties: LedgerLite[] }) {
  const [vendorLedgerId, setVendorLedgerId] = useState("");
  const [lineTotal, setLineTotal] = useState("");
  const [gstRate, setGstRate] = useState<number>(18);
  const [hsn, setHsn] = useState("");
  const [interState, setInterState] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const base = Number(lineTotal) || 0;
  const tax = (base * gstRate) / 100;
  const gross = base + tax;
  const fmt = (n: number) => `₹${n.toFixed(2)}`;

  const submit = async () => {
    if (!vendorLedgerId) { toast.error("Pick a vendor ledger"); return; }
    if (base <= 0) { toast.error("Enter a line total above zero"); return; }
    setSaving(true);
    try {
      const res = await api.post<{ voucherNumber?: string }>("/api/books/documents/debit-note", {
        vendorLedgerId,
        lineTotal: base,
        gstRate,
        hsn: hsn.trim() || undefined,
        interState,
        date,
      });
      toast.success(res?.voucherNumber ? `Posted debit note #${res.voucherNumber}` : "Debit note posted");
      setLineTotal("");
      setHsn("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 flex flex-col">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        <Undo2 size={15} className="text-[var(--color-primary)]" /> Debit note (vendor)
      </h3>
      <div className="space-y-3 flex-1">
        <div>
          <label className={labelCls}>Vendor</label>
          <select value={vendorLedgerId} onChange={(e) => setVendorLedgerId(e.target.value)} className={inputCls}>
            <option value="">Select vendor…</option>
            {parties.map((l) => (
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
            <label className={labelCls}>HSN / SAC</label>
            <input value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="optional" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={interState} onChange={(e) => setInterState(e.target.checked)} className="accent-[var(--color-primary)] w-4 h-4" />
          Inter-state
        </label>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Taxable</span><span className="tabular-nums">{fmt(base)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">GST @ {gstRate}%</span><span className="tabular-nums">{fmt(tax)}</span></div>
          <div className="flex justify-between border-t border-[var(--color-border)] pt-1 mt-1 font-semibold">
            <span>Gross</span><span className="tabular-nums text-[var(--color-primary)]">{fmt(gross)}</span>
          </div>
        </div>
      </div>
      <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} mt-4 w-full`}>
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
        Post debit note
      </button>
    </div>
  );
}

function RefundCard({ parties, banks }: { parties: LedgerLite[]; banks: LedgerLite[] }) {
  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [paidFromLedgerId, setPaidFromLedgerId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!partyLedgerId) { toast.error("Pick a party ledger"); return; }
    if (!paidFromLedgerId) { toast.error("Pick a bank / cash ledger to pay from"); return; }
    const amt = Number(amount) || 0;
    if (amt <= 0) { toast.error("Enter an amount above zero"); return; }
    setSaving(true);
    try {
      const res = await api.post<{ voucherNumber?: string }>("/api/books/documents/refund", {
        partyLedgerId,
        paidFromLedgerId,
        amount: amt,
        date,
      });
      toast.success(res?.voucherNumber ? `Posted refund #${res.voucherNumber}` : "Refund posted");
      setAmount("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 flex flex-col">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        <Receipt size={15} className="text-[var(--color-primary)]" /> Refund to party
      </h3>
      <div className="space-y-3 flex-1">
        <div>
          <label className={labelCls}>Party</label>
          <select value={partyLedgerId} onChange={(e) => setPartyLedgerId(e.target.value)} className={inputCls}>
            <option value="">Select party…</option>
            {parties.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Paid from (bank / cash)</label>
          <select value={paidFromLedgerId} onChange={(e) => setPaidFromLedgerId(e.target.value)} className={inputCls}>
            <option value="">Select account…</option>
            {banks.map((l) => (
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
            <DatePicker value={date} onChange={setDate} />
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">
          Money paid back out of the bank/cash account to the party (e.g. against an advance or a credit balance).
        </p>
      </div>
      <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} mt-4 w-full`}>
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
        Post refund
      </button>
    </div>
  );
}
