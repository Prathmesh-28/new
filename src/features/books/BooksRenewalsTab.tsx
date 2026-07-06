import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CalendarClock, Plus, RefreshCw, Trash2 } from "lucide-react";
import DatePicker from "@/components/DatePicker";

// Renewals / expiry registry UI (books/expiry.js): licenses, DSCs, AMCs, agreements, insurance —
// anything with an expiry date. Shows days-to-expiry + status and lets you renew (carries the
// item forward) or cancel.
interface Item { id: string; kind: string; name: string; identifier: string | null; counterparty: string | null; amount: number | null; expires_on: string; days_to_expiry: number; expiry_status: string; status: string }
const KINDS = ["license", "dsc", "amc", "agreement", "registration", "insurance", "other"];
const input = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const label = "text-xs text-[var(--color-muted)] block mb-1";
const rupee = (n: number | null) => (n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const errMsg = (e: unknown) => (e as { message?: string })?.message || "Something went wrong";

export default function BooksRenewalsTab() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);
  const [f, setF] = useState({ kind: "license", name: "", identifier: "", counterparty: "", expires_on: "", amount: "" });
  const [renewing, setRenewing] = useState<string | null>(null);
  const [renewDate, setRenewDate] = useState("");
  // Agreement obligation extraction (#182).
  const [agText, setAgText] = useState(""); const [exBusy, setExBusy] = useState(false);
  const [obligations, setObligations] = useState<{ type: string; description: string; date: string | null; amount: number | null; term: string | null }[] | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try { setItems(await api.get<Item[]>("/api/books/expiry-items?status=active")); }
    catch { setItems([]); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!f.name.trim() || !f.expires_on) { toast.error("Name and expiry date are required"); return; }
    try {
      await api.post("/api/books/expiry-items", { kind: f.kind, name: f.name.trim(), identifier: f.identifier.trim() || undefined, counterparty: f.counterparty.trim() || undefined, expires_on: f.expires_on, amount: f.amount ? Number(f.amount) : undefined });
      toast.success("Added"); setF({ kind: f.kind, name: "", identifier: "", counterparty: "", expires_on: "", amount: "" }); await load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const renew = async (id: string) => {
    if (!renewDate) { toast.error("Pick the new expiry date"); return; }
    try { await api.post(`/api/books/expiry-items/${id}/renew`, { new_expires_on: renewDate }); toast.success("Renewed"); setRenewing(null); setRenewDate(""); await load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const cancel = async (id: string) => { try { await api.delete(`/api/books/expiry-items/${id}`); toast.success("Removed"); await load(); } catch (e) { toast.error(errMsg(e)); } };

  const toIso = (d: string | null) => {
    if (!d) return null;
    const m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) { let [, dd, mm, yy] = m; if (yy.length === 2) yy = "20" + yy; return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`; }
    const t = Date.parse(d); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
  };
  const extract = async () => {
    if (agText.trim().length < 10) { toast.error("Paste the agreement text"); return; }
    setExBusy(true);
    try { const r = await api.post<{ obligations: typeof obligations }>("/api/books/agreements/extract", { text: agText }); setObligations(r.obligations || []); }
    catch (e) { toast.error(errMsg(e)); } finally { setExBusy(false); }
  };
  const addObligation = async (ob: { type: string; description: string; date: string | null }) => {
    const iso = toIso(ob.date);
    if (!iso) { toast.error("No usable date on this obligation"); return; }
    try { await api.post("/api/books/expiry-items", { kind: "agreement", name: ob.description.slice(0, 80), expires_on: iso }); toast.success("Added to renewals"); await load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const badge = (s: string) => s === "expired" ? "bg-red-900/30 text-red-400" : s === "due" ? "bg-amber-900/30 text-amber-400" : "bg-green-900/30 text-green-400";
  const dueCount = items.filter((i) => i.expiry_status === "due" || i.expiry_status === "expired").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2"><CalendarClock size={18} className="text-[var(--color-primary)]" /> Renewals &amp; expiry</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">Track licenses, digital signatures (DSC), AMCs, agreements, registrations and insurance in one place. Each shows days to expiry and flags renewals due{dueCount > 0 ? ` — ${dueCount} need attention now` : ""}.</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Add an item</h3>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <div><label className={label}>Type</label><select className={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}</select></div>
          <div className="col-span-2 sm:col-span-1"><label className={label}>Name</label><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. FSSAI license" /></div>
          <div><label className={label}>Identifier</label><input className={input} value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} placeholder="no." /></div>
          <div><label className={label}>Counterparty</label><input className={input} value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} placeholder="optional" /></div>
          <div><label className={label}>Expires on</label><input className={input} type="date" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} /></div>
          <div><label className={label}>Amount ₹</label><input className={input} type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="optional" /></div>
        </div>
        <button onClick={add} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add</button>
      </div>

      {/* Agreement obligation extractor (#182) */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-2">Extract obligations from an agreement</h3>
        <p className="text-xs text-[var(--color-muted)] mb-2">Paste a lease/contract — we pull out lock-ins, renewals, escalations, notice periods, payments and penalties, and you can push dated ones into the renewals tracker above.</p>
        <textarea className={input} rows={3} value={agText} onChange={(e) => setAgText(e.target.value)} placeholder="Paste agreement text…" />
        <button onClick={extract} disabled={exBusy} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold border border-[var(--color-border)] px-3 py-2 rounded-lg hover:bg-[var(--color-accent)]">{exBusy ? "Extracting…" : "Extract obligations"}</button>
        {obligations && (
          obligations.length === 0 ? <p className="text-xs text-[var(--color-muted)] mt-3">No obligations detected.</p> : (
            <div className="mt-3 space-y-1.5">
              {obligations.map((o, i) => (
                <div key={i} className="flex items-start gap-2 text-xs border-t border-[var(--color-border)] pt-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-accent)] text-[var(--color-muted)] uppercase shrink-0">{o.type}</span>
                  <span className="flex-1">{o.description}{o.term ? ` · ${o.term}` : ""}{o.amount ? ` · ₹${o.amount.toLocaleString("en-IN")}` : ""}{o.date ? ` · ${o.date}` : ""}</span>
                  {o.date && <button onClick={() => addObligation(o)} className="text-[var(--color-primary)] hover:underline shrink-0">+ track</button>}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {busy ? <p className="text-sm text-[var(--color-muted)] py-6 text-center">Loading…</p>
        : items.length === 0 ? <p className="text-sm text-[var(--color-muted)] py-8 text-center border border-dashed border-[var(--color-border)] rounded-lg">Nothing tracked yet — add a license, DSC or AMC above.</p>
          : (
            <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Type", "Name", "Identifier", "Amount", "Expires", "Status", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] uppercase">{i.kind}</td>
                      <td className="px-3 py-2.5 font-medium">{i.name}{i.counterparty && <span className="text-[var(--color-muted)] font-normal"> · {i.counterparty}</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{i.identifier || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{rupee(i.amount)}</td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{i.expires_on?.slice(0, 10)}</td>
                      <td className="px-3 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${badge(i.expiry_status)}`}>{i.expiry_status === "expired" ? "expired" : i.expiry_status === "due" ? `due · ${i.days_to_expiry}d` : `${i.days_to_expiry}d`}</span></td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {renewing === i.id ? (
                          <span className="inline-flex items-center gap-1">
                            <DatePicker value={renewDate} onChange={setRenewDate} />
                            <button onClick={() => renew(i.id)} className="text-xs px-2 py-1 rounded bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold">Save</button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <button onClick={() => { setRenewing(i.id); setRenewDate(""); }} className="text-xs text-[var(--color-primary)] hover:underline inline-flex items-center gap-1"><RefreshCw size={12} /> Renew</button>
                            <button onClick={() => cancel(i.id)} className="text-[var(--color-muted)] hover:text-red-400" title="Remove"><Trash2 size={13} /></button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
}
