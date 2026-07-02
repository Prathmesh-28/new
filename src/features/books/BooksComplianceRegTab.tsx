import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ListChecks, Plus, Check, Trash2 } from "lucide-react";

// Statutory compliance register UI (books/compliance.js — real table, not KV). Filings, meetings,
// resolutions, registers with a pending → done workflow; completing a recurring item auto-schedules
// the next occurrence.
interface Item { id: string; kind: string; title: string; authority: string | null; due_date: string; frequency: string; status: string; days_to_due: number; state: string; completed_on: string | null }
const KINDS = ["filing", "meeting", "resolution", "register", "payment", "other"];
const FREQ = ["one_time", "monthly", "quarterly", "annual"];
const input = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const label = "text-xs text-[var(--color-muted)] block mb-1";
const errMsg = (e: unknown) => (e as { message?: string })?.message || "Something went wrong";

export default function BooksComplianceRegTab() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [f, setF] = useState({ kind: "filing", title: "", authority: "", due_date: "", frequency: "one_time" });

  const load = useCallback(async () => {
    setBusy(true);
    try { setItems(await api.get<Item[]>("/api/books/compliance-items")); } catch { setItems([]); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!f.title.trim() || !f.due_date) { toast.error("Title and due date are required"); return; }
    try {
      await api.post("/api/books/compliance-items", { kind: f.kind, title: f.title.trim(), authority: f.authority.trim() || undefined, due_date: f.due_date, frequency: f.frequency });
      toast.success("Added"); setF({ kind: f.kind, title: "", authority: "", due_date: "", frequency: f.frequency }); await load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const complete = async (id: string) => { try { const r = await api.post<{ next?: { due_date: string } }>(`/api/books/compliance-items/${id}/complete`, {}); toast.success(r.next ? `Done — next due ${r.next.due_date}` : "Marked done"); await load(); } catch (e) { toast.error(errMsg(e)); } };
  const remove = async (id: string) => { try { await api.delete(`/api/books/compliance-items/${id}`); toast.success("Removed"); await load(); } catch (e) { toast.error(errMsg(e)); } };

  const badge = (s: string) => s === "overdue" ? "bg-red-900/30 text-red-400" : s === "due_soon" ? "bg-amber-900/30 text-amber-400" : s === "done" ? "bg-green-900/30 text-green-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]";
  const pending = items.filter((i) => i.status === "pending");
  const done = items.filter((i) => i.status === "done");
  const overdue = pending.filter((i) => i.state === "overdue").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2"><ListChecks size={18} className="text-[var(--color-primary)]" /> Statutory compliance register</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">Track statutory filings, board meetings, resolutions and registers as real records (queryable + reportable). Mark items done; recurring ones auto-schedule the next occurrence.{overdue > 0 ? ` ${overdue} overdue.` : ""}</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Add an obligation</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          <div><label className={label}>Type</label><select className={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          <div><label className={label}>Title</label><input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. GSTR-3B" /></div>
          <div><label className={label}>Authority</label><input className={input} value={f.authority} onChange={(e) => setF({ ...f, authority: e.target.value })} placeholder="GST / ROC / IT" /></div>
          <div><label className={label}>Due date</label><input className={input} type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
          <div><label className={label}>Frequency</label><select className={input} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>{FREQ.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select></div>
        </div>
        <button onClick={add} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add</button>
      </div>

      {busy ? <p className="text-sm text-[var(--color-muted)] py-6 text-center">Loading…</p>
        : pending.length === 0 && done.length === 0 ? <p className="text-sm text-[var(--color-muted)] py-8 text-center border border-dashed border-[var(--color-border)] rounded-lg">Nothing tracked yet.</p>
          : (
            <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Obligation", "Authority", "Type", "Due", "Status", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {(showDone ? items : pending).map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2.5 font-medium">{i.title}{i.frequency !== "one_time" && <span className="ml-1.5 text-[10px] text-[var(--color-muted)]">{i.frequency}</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{i.authority || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] capitalize">{i.kind}</td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{i.due_date?.slice(0, 10)}</td>
                      <td className="px-3 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${badge(i.state)}`}>{i.state === "done" ? "done" : i.state === "overdue" ? "overdue" : i.state === "due_soon" ? `due · ${i.days_to_due}d` : `${i.days_to_due}d`}</span></td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {i.status === "pending" ? (
                          <span className="inline-flex items-center gap-2">
                            <button onClick={() => complete(i.id)} className="text-xs text-green-400 hover:underline inline-flex items-center gap-1"><Check size={12} /> Done</button>
                            <button onClick={() => remove(i.id)} className="text-[var(--color-muted)] hover:text-red-400" title="Remove"><Trash2 size={13} /></button>
                          </span>
                        ) : <span className="text-[10px] text-[var(--color-muted)]">{i.completed_on?.slice(0, 10)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      {done.length > 0 && <button onClick={() => setShowDone((v) => !v)} className="text-xs text-[var(--color-primary)] hover:underline">{showDone ? "Hide completed" : `Show completed (${done.length})`}</button>}
    </div>
  );
}
