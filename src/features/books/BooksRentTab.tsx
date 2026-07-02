import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Home, Plus } from "lucide-react";

// Rent register + §194-I TDS UI (books/rent.js). Tracks rent agreements, the escalated current
// rent, the 194-I TDS (10%/2%, 20% no-PAN, above the ₹2.4L threshold) and net payable.
interface Agreement { id: string; landlord: string; landlord_pan: string | null; property: string | null; current_rent: number; annual_rent: number; net_payable: number; direction: string; status: string; tds: { applicable: boolean; rate: number; amount: number; no_pan?: boolean } }
const input = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const label = "text-xs text-[var(--color-muted)] block mb-1";
const rupee = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const errMsg = (e: unknown) => (e as { message?: string })?.message || "Something went wrong";

export default function BooksRentTab() {
  const [rows, setRows] = useState<Agreement[]>([]);
  const [busy, setBusy] = useState(true);
  const [f, setF] = useState({ landlord: "", landlord_pan: "", property: "", monthly_rent: "", start_date: "", escalation_pct: "", escalation_months: "12" });

  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await api.get<Agreement[]>("/api/books/rent")); } catch { setRows([]); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!f.landlord.trim() || !(Number(f.monthly_rent) > 0) || !f.start_date) { toast.error("Landlord, monthly rent and start date are required"); return; }
    try {
      await api.post("/api/books/rent", {
        landlord: f.landlord.trim(), landlord_pan: f.landlord_pan.trim() || undefined, property: f.property.trim() || undefined,
        monthly_rent: Number(f.monthly_rent), start_date: f.start_date,
        escalation_pct: f.escalation_pct ? Number(f.escalation_pct) : 0, escalation_months: Number(f.escalation_months) || 12,
      });
      toast.success("Agreement added"); setF({ landlord: "", landlord_pan: "", property: "", monthly_rent: "", start_date: "", escalation_pct: "", escalation_months: "12" }); await load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const active = rows.filter((r) => r.status === "active");
  const monthlyTds = active.reduce((s, r) => s + (r.tds?.amount || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2"><Home size={18} className="text-[var(--color-primary)]" /> Rent register &amp; §194-I TDS</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">Rent agreements with automatic escalation and §194-I TDS — 10% on land/building (2% plant &amp; machinery), 20% under §206AA when the landlord has no PAN, applied only above the ₹2,40,000/year threshold.{monthlyTds > 0 ? ` Current monthly TDS to deduct: ${rupee(monthlyTds)}.` : ""}</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Add a rent agreement</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <div><label className={label}>Landlord</label><input className={input} value={f.landlord} onChange={(e) => setF({ ...f, landlord: e.target.value })} /></div>
          <div><label className={label}>Landlord PAN</label><input className={input} value={f.landlord_pan} onChange={(e) => setF({ ...f, landlord_pan: e.target.value })} placeholder="for 10% (else 20%)" /></div>
          <div><label className={label}>Property</label><input className={input} value={f.property} onChange={(e) => setF({ ...f, property: e.target.value })} placeholder="optional" /></div>
          <div><label className={label}>Monthly rent ₹</label><input className={input} type="number" value={f.monthly_rent} onChange={(e) => setF({ ...f, monthly_rent: e.target.value })} /></div>
          <div><label className={label}>Start date</label><input className={input} type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
          <div><label className={label}>Escalation %</label><input className={input} type="number" value={f.escalation_pct} onChange={(e) => setF({ ...f, escalation_pct: e.target.value })} placeholder="e.g. 5" /></div>
          <div><label className={label}>Escalate every (months)</label><input className={input} type="number" value={f.escalation_months} onChange={(e) => setF({ ...f, escalation_months: e.target.value })} /></div>
        </div>
        <button onClick={add} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add agreement</button>
      </div>

      {busy ? <p className="text-sm text-[var(--color-muted)] py-6 text-center">Loading…</p>
        : rows.length === 0 ? <p className="text-sm text-[var(--color-muted)] py-8 text-center border border-dashed border-[var(--color-border)] rounded-lg">No rent agreements yet.</p>
          : (
            <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Landlord", "Property", "Monthly rent", "194-I TDS", "Net payable", "Annual", "Status"].map((h) => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2.5 font-medium">{r.landlord}{!r.landlord_pan && <span className="ml-1.5 text-[10px] text-amber-400">no PAN</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.property || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{rupee(r.current_rent)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.tds?.applicable ? <span>{rupee(r.tds.amount)} <span className="text-[10px] text-[var(--color-muted)]">@{r.tds.rate}%</span></span> : <span className="text-[var(--color-muted)]">— <span className="text-[10px]">below ₹2.4L</span></span>}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold">{rupee(r.net_payable)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{rupee(r.annual_rent)}</td>
                      <td className="px-3 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === "active" ? "bg-green-900/30 text-green-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>{r.direction === "received" ? "received" : r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
}
