import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ShieldAlert, Plus, Trash2, Eye, EyeOff } from "lucide-react";

// Business-continuity vault UI (books/continuity.js). Emergency access instructions for
// family/partner. Owner-only; details are field-encrypted server-side and masked here until
// revealed.
interface Item { id: string; category: string; title: string; holder: string | null; detail: string | null; priority: number }
const CATS = ["contact", "account", "instruction", "document", "nominee", "other"];
const input = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const errMsg = (e: unknown) => (e as { message?: string })?.message || "Something went wrong";

export default function BooksContinuityTab() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);
  const [denied, setDenied] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [f, setF] = useState({ category: "contact", title: "", holder: "", detail: "", priority: "3" });

  const load = useCallback(async () => {
    setBusy(true);
    try { setItems(await api.get<Item[]>("/api/books/continuity")); setDenied(false); }
    catch (e) { if (/owner/i.test(errMsg(e))) setDenied(true); setItems([]); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!f.title.trim()) { toast.error("Title is required"); return; }
    try {
      await api.post("/api/books/continuity", { category: f.category, title: f.title.trim(), holder: f.holder.trim() || undefined, detail: f.detail.trim() || undefined, priority: Number(f.priority) || 3 });
      toast.success("Saved to the continuity vault"); setF({ category: f.category, title: "", holder: "", detail: "", priority: "3" }); await load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (id: string) => { try { await api.delete(`/api/books/continuity/${id}`); toast.success("Removed"); await load(); } catch (e) { toast.error(errMsg(e)); } };

  if (denied) return <p className="text-sm text-[var(--color-muted)] py-10 text-center border border-dashed border-[var(--color-border)] rounded-lg">The continuity vault is owner-only — it holds sensitive emergency access details.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2"><ShieldAlert size={18} className="text-[var(--color-primary)]" /> Business continuity vault</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">Emergency access instructions for your family or partner if you're unavailable — key contacts, bank/portal accounts, nominee details and where the documents live. Owner-only; details are encrypted at rest and hidden until you reveal them.</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Add an entry</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          <div><label className={labelCls}>Category</label><select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          <div><label className={labelCls}>Title</label><input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. HDFC current a/c" /></div>
          <div><label className={labelCls}>Holder / where</label><input className={input} value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} placeholder="bank / person" /></div>
          <div><label className={labelCls}>Priority (1=first)</label><input className={input} type="number" min={1} max={5} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} /></div>
          <div className="col-span-2 sm:col-span-5"><label className={labelCls}>Details (encrypted)</label><textarea className={input} rows={2} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} placeholder="Account numbers, access steps, contacts — kept encrypted" /></div>
        </div>
        <button onClick={add} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Save entry</button>
      </div>

      {busy ? <p className="text-sm text-[var(--color-muted)] py-6 text-center">Loading…</p>
        : items.length === 0 ? <p className="text-sm text-[var(--color-muted)] py-8 text-center border border-dashed border-[var(--color-border)] rounded-lg">Nothing stored yet.</p>
          : (
            <div className="space-y-2">
              {items.map((i) => (
                <div key={i.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-accent)] text-[var(--color-muted)] uppercase">{i.category}</span>
                      <span className="text-sm font-semibold">{i.title}</span>
                      {i.holder && <span className="text-xs text-[var(--color-muted)]">· {i.holder}</span>}
                      <span className="text-[10px] text-[var(--color-muted)]">P{i.priority}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {i.detail && <button onClick={() => setReveal((r) => ({ ...r, [i.id]: !r[i.id] }))} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title={reveal[i.id] ? "Hide" : "Reveal"}>{reveal[i.id] ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
                      <button onClick={() => remove(i.id)} className="text-[var(--color-muted)] hover:text-red-400" title="Remove"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {i.detail && <p className="text-xs mt-2 whitespace-pre-wrap font-mono text-[var(--color-muted)]">{reveal[i.id] ? i.detail : "••••••••••••••••"}</p>}
                </div>
              ))}
            </div>
          )}
    </div>
  );
}
