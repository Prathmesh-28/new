import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { HandCoins, Plus, Check, Trash2 } from "lucide-react";

// Expense advances UI (wires backend/src/modules/books/ops.js grantAdvance/settleAdvance).
// Give an employee a cash advance, then settle it against their actual expense report; the
// balance is refunded (returned) or reimbursed (spent more). Each posts a balanced GL journal.
interface Ledger { id: string; name: string; group_id: string; is_bank: boolean }
interface Group { id: string; nature: string }
interface Advance { id: string; person: string; purpose: string | null; amount: number; settled_amount: number; refund_amount: number; reimburse_amount: number; status: string; created_at: string; settled_at: string | null }

const input = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const label = "text-xs text-[var(--color-muted)] block mb-1";
const btn = "inline-flex items-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed";
const rupee = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const errMsg = (e: unknown) => (e as { message?: string })?.message || "Something went wrong";

export default function BooksExpensesTab() {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [nature, setNature] = useState<Record<string, string>>({});
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [busy, setBusy] = useState(true);
  const [gPerson, setGPerson] = useState(""); const [gAmount, setGAmount] = useState("");
  const [gDate, setGDate] = useState(today()); const [gPaid, setGPaid] = useState(""); const [gPurpose, setGPurpose] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [lg, gr, adv] = await Promise.all([
        api.get<Ledger[]>("/api/books/ledgers").catch(() => []),
        api.get<Group[]>("/api/books/groups").catch(() => []),
        api.get<Advance[]>("/api/books/advances").catch(() => []),
      ]);
      setLedgers(lg || []);
      setNature(Object.fromEntries((gr || []).map((g) => [g.id, g.nature])));
      setAdvances(adv || []);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const expenseLedgers = ledgers.filter((l) => nature[l.group_id] === "EXPENSE");
  const payLedgers = ledgers.filter((l) => l.is_bank || nature[l.group_id] === "ASSET");

  const grant = async () => {
    if (!gPerson.trim() || !(Number(gAmount) > 0) || !gPaid) { toast.error("Person, amount and a pay-from account are required"); return; }
    try {
      await api.post("/api/books/advances", { person: gPerson.trim(), amount: Number(gAmount), date: gDate, paidFromLedgerId: gPaid, purpose: gPurpose.trim() || undefined });
      toast.success("Advance granted"); setGPerson(""); setGAmount(""); setGPurpose(""); await load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const open = advances.filter((a) => a.status === "open");
  const settled = advances.filter((a) => a.status === "settled");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <HandCoins size={18} className="text-[var(--color-primary)]" /> Expenses &amp; Advances
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">
          Give an employee a cash advance (Dr Employee Advances / Cr Bank), then settle it against their actual
          expense report. If they spent less, the balance is refunded; if more, the excess is reimbursed. Every step
          posts a balanced journal to the general ledger.
        </p>
      </div>

      {/* Grant an advance */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Grant an advance</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
          <div><label className={label}>Person</label><input className={input} value={gPerson} onChange={(e) => setGPerson(e.target.value)} placeholder="Employee name" /></div>
          <div><label className={label}>Amount ₹</label><input className={input} type="number" value={gAmount} onChange={(e) => setGAmount(e.target.value)} /></div>
          <div><label className={label}>Date</label><input className={input} type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} /></div>
          <div><label className={label}>Pay from</label><select className={input} value={gPaid} onChange={(e) => setGPaid(e.target.value)}><option value="">Select…</option>{payLedgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div><label className={label}>Purpose</label><input className={input} value={gPurpose} onChange={(e) => setGPurpose(e.target.value)} placeholder="optional" /></div>
        </div>
        <button className={`${btn} mt-3`} onClick={grant} disabled={busy}><Plus size={13} /> Grant advance</button>
      </div>

      {/* Open advances → settle */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Open advances {open.length > 0 && <span className="text-[var(--color-muted)] font-normal">({open.length})</span>}</h3>
        {busy ? <p className="text-sm text-[var(--color-muted)] py-4">Loading…</p>
          : open.length === 0 ? <p className="text-sm text-[var(--color-muted)] py-6 border border-dashed border-[var(--color-border)] rounded-lg text-center">No open advances.</p>
            : <div className="space-y-3">{open.map((a) => <SettleAdvance key={a.id} adv={a} expenseLedgers={expenseLedgers} payLedgers={payLedgers} onDone={load} />)}</div>}
      </div>

      {/* Settled history */}
      {settled.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Settled</h3>
          <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="border-b border-[var(--color-border)]"><tr>{["Person", "Advance", "Expenses", "Refund", "Reimburse", "Settled"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">{settled.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-medium">{a.person}</td>
                  <td className="px-3 py-2 tabular-nums">{rupee(a.amount)}</td>
                  <td className="px-3 py-2 tabular-nums">{rupee(a.settled_amount)}</td>
                  <td className="px-3 py-2 tabular-nums">{a.refund_amount > 0 ? rupee(a.refund_amount) : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{a.reimburse_amount > 0 ? rupee(a.reimburse_amount) : "—"}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">{a.settled_at?.slice(0, 10)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SettleAdvance({ adv, expenseLedgers, payLedgers, onDone }: {
  adv: Advance; expenseLedgers: Ledger[]; payLedgers: Ledger[]; onDone: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<{ cat: string; amt: string; note: string }[]>([{ cat: "", amt: "", note: "" }]);
  const [settleTo, setSettleTo] = useState("");
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((s, l) => s + (Number(l.amt) || 0), 0);
  const diff = adv.amount - total; // >0 refund, <0 reimburse
  const setLine = (i: number, patch: Partial<{ cat: string; amt: string; note: string }>) =>
    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    const expenses = lines.filter((l) => l.cat && Number(l.amt) > 0).map((l) => ({ categoryLedgerId: l.cat, amount: Number(l.amt), note: l.note || undefined }));
    if (!expenses.length) { toast.error("Add at least one expense line"); return; }
    if (Math.abs(diff) > 0.005 && !settleTo) { toast.error("Pick a cash/bank account for the refund/reimbursement"); return; }
    setBusy(true);
    try { await api.post(`/api/books/advances/${adv.id}/settle`, { date: today(), expenses, settleToLedgerId: settleTo || undefined }); toast.success("Advance settled"); await onDone(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold">{adv.person} · {rupee(adv.amount)}</p>
          {adv.purpose && <p className="text-xs text-[var(--color-muted)]">{adv.purpose}</p>}
        </div>
        <button className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-accent)]" onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "Settle"}</button>
      </div>
      {open && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3 space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-center">
              <select className={`${input} !w-auto flex-1 min-w-[150px]`} value={l.cat} onChange={(e) => setLine(i, { cat: e.target.value })}>
                <option value="">Expense category…</option>{expenseLedgers.map((le) => <option key={le.id} value={le.id}>{le.name}</option>)}
              </select>
              <input className={`${input} !w-28`} type="number" placeholder="₹" value={l.amt} onChange={(e) => setLine(i, { amt: e.target.value })} />
              <input className={`${input} !w-auto flex-1 min-w-[120px]`} placeholder="note (optional)" value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} />
              {lines.length > 1 && <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-[var(--color-muted)] hover:text-red-400" title="Remove line"><Trash2 size={14} /></button>}
            </div>
          ))}
          <button onClick={() => setLines((ls) => [...ls, { cat: "", amt: "", note: "" }])} className="text-xs text-[var(--color-primary)] hover:underline">+ Add expense line</button>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <span className="text-xs text-[var(--color-muted)]">Expenses <span className="tabular-nums font-semibold text-[var(--color-text)]">{rupee(total)}</span></span>
            <span className={`text-xs ${diff >= 0 ? "text-green-400" : "text-amber-400"}`}>{diff >= 0 ? `Refund ${rupee(diff)}` : `Reimburse ${rupee(-diff)}`}</span>
            {Math.abs(diff) > 0.005 && (
              <select className={`${input} !w-auto`} value={settleTo} onChange={(e) => setSettleTo(e.target.value)}>
                <option value="">Cash/Bank for the balance…</option>{payLedgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <button className={btn} disabled={busy} onClick={submit}><Check size={13} /> Confirm settlement</button>
          </div>
        </div>
      )}
    </div>
  );
}
