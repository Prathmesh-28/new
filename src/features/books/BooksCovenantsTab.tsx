import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Scale, Plus } from "lucide-react";
import DatePicker from "@/components/DatePicker";

// Debt covenant tracker UI (books/covenants.js — real table). Define loan covenants and record
// periodic readings; each is auto-evaluated met/breached against the operator + threshold.
interface Cov { id: string; name: string; lender: string | null; metric: string; operator: string; threshold: number; frequency: string; status: string; condition: string; current_status: string; latest_test: { as_of: string; actual_value: number; result: string } | null }
const OPS = [["gte", "≥"], ["lte", "≤"], ["gt", ">"], ["lt", "<"]];
const input = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const label = "text-xs text-[var(--color-muted)] block mb-1";
const errMsg = (e: unknown) => (e as { message?: string })?.message || "Something went wrong";

export default function BooksCovenantsTab() {
  const [rows, setRows] = useState<Cov[]>([]);
  const [busy, setBusy] = useState(true);
  const [f, setF] = useState({ name: "", lender: "", metric: "DSCR", operator: "gte", threshold: "", frequency: "quarterly" });
  const [testing, setTesting] = useState<string | null>(null);
  const [tVal, setTVal] = useState(""); const [tDate, setTDate] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await api.get<Cov[]>("/api/books/covenants")); } catch { setRows([]); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!f.name.trim() || !f.metric.trim() || f.threshold === "") { toast.error("Name, metric and threshold are required"); return; }
    try {
      await api.post("/api/books/covenants", { name: f.name.trim(), lender: f.lender.trim() || undefined, metric: f.metric.trim(), operator: f.operator, threshold: Number(f.threshold), frequency: f.frequency });
      toast.success("Covenant added"); setF({ ...f, name: "", lender: "", threshold: "" }); await load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const recordTest = async (id: string) => {
    if (tVal === "") { toast.error("Enter the actual value"); return; }
    try { const r = await api.post<{ result: string }>(`/api/books/covenants/${id}/test`, { actual_value: Number(tVal), as_of: tDate || undefined }); toast[r.result === "breached" ? "error" : "success"](r.result === "breached" ? "Recorded — covenant BREACHED" : "Recorded — covenant met"); setTesting(null); setTVal(""); setTDate(""); await load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const close = async (id: string) => { try { await api.post(`/api/books/covenants/${id}/close`, {}); toast.success("Closed"); await load(); } catch (e) { toast.error(errMsg(e)); } };

  const badge = (s: string) => s === "breached" ? "bg-red-900/30 text-red-400" : s === "met" ? "bg-green-900/30 text-green-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]";
  const breaches = rows.filter((r) => r.status === "active" && r.current_status === "breached").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2"><Scale size={18} className="text-[var(--color-primary)]" /> Debt covenants</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">Track loan covenants (DSCR ≥ 1.25, leverage ≤ 3, …) as real records. Record each period's actual value and it's auto-checked met vs breached.{breaches > 0 ? ` ${breaches} currently breached.` : ""}</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Add a covenant</h3>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <div><label className={label}>Name</label><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="DSCR covenant" /></div>
          <div><label className={label}>Lender</label><input className={input} value={f.lender} onChange={(e) => setF({ ...f, lender: e.target.value })} placeholder="optional" /></div>
          <div><label className={label}>Metric</label><input className={input} value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })} placeholder="DSCR" /></div>
          <div><label className={label}>Test</label><select className={input} value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value })}>{OPS.map(([v, s]) => <option key={v} value={v}>{s}</option>)}</select></div>
          <div><label className={label}>Threshold</label><input className={input} type="number" step="0.01" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} /></div>
          <div><label className={label}>Frequency</label><select className={input} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>{["quarterly", "annual", "monthly", "one_time"].map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
        </div>
        <button onClick={add} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add covenant</button>
      </div>

      {busy ? <p className="text-sm text-[var(--color-muted)] py-6 text-center">Loading…</p>
        : rows.length === 0 ? <p className="text-sm text-[var(--color-muted)] py-8 text-center border border-dashed border-[var(--color-border)] rounded-lg">No covenants tracked yet.</p>
          : (
            <div className="space-y-2">
              {rows.map((c) => (
                <div key={c.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-sm font-semibold">{c.name} <span className="text-[var(--color-muted)] font-normal">· {c.condition}</span>{c.lender && <span className="text-xs text-[var(--color-muted)]"> · {c.lender}</span>}</p>
                      <p className="text-xs text-[var(--color-muted)]">{c.latest_test ? `Last: ${c.metric} = ${c.latest_test.actual_value} on ${String(c.latest_test.as_of).slice(0, 10)}` : "No readings yet"} · {c.frequency}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${badge(c.current_status)}`}>{c.current_status}</span>
                      {c.status === "active" && <>
                        <button onClick={() => { setTesting(testing === c.id ? null : c.id); setTVal(""); setTDate(""); }} className="text-xs text-[var(--color-primary)] hover:underline">Record</button>
                        <button onClick={() => close(c.id)} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Close</button>
                      </>}
                    </div>
                  </div>
                  {testing === c.id && (
                    <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3 flex-wrap">
                      <input type="number" step="0.01" value={tVal} onChange={(e) => setTVal(e.target.value)} placeholder={`Actual ${c.metric}`} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm w-40 outline-none" />
                      <DatePicker value={tDate} onChange={setTDate} />
                      <button onClick={() => recordTest(c.id)} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold">Save reading</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
    </div>
  );
}
