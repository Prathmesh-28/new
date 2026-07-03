import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import EmptyState from "@/components/EmptyState";
import TabStrip from "@/components/TabStrip";
import { Landmark, Gauge, Boxes, FileSpreadsheet, ShieldCheck, Globe2, Banknote, Plus } from "lucide-react";
import { toast } from "sonner";

// Bank-credit paperwork — the monthly grind for any SMB with a CC/OD limit. Drawing power, the
// bank stock & book-debt statement, a multi-year CMA summary, BG/LC register, 15CA/15CB remittance
// workflow, and the 194N cash-withdrawal monitor. All computed from the real ledger (/api/books/*).
const INR = (v: number) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const card = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4";
const INP = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]";

const TABS = [
  { id: "drawing-power", label: "Drawing Power", icon: Gauge },
  { id: "stock-statement", label: "Stock & Book-Debt", icon: Boxes },
  { id: "cma", label: "CMA Summary", icon: FileSpreadsheet },
  { id: "bg-lc", label: "BG / LC Register", icon: ShieldCheck },
  { id: "remittances", label: "15CA / 15CB", icon: Globe2 },
  { id: "194n", label: "194N Monitor", icon: Banknote },
  { id: "covenants", label: "Covenants & Consortium", icon: Landmark },
  { id: "passport", label: "Credit Passport", icon: ShieldCheck },
];

export default function BankCreditPage() {
  const [tab, setTab] = useState("drawing-power");
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Landmark size={20} className="text-[var(--color-primary)]" />
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Bank Credit</h1>
          <p className="text-sm text-[var(--color-muted)]">Drawing power, stock statements, CMA, BG/LC, foreign remittance & 194N — straight from your books.</p>
        </div>
      </div>
      <TabStrip tabs={TABS} active={tab} onChange={setTab} />
      {tab === "drawing-power" && <DrawingPower />}
      {tab === "stock-statement" && <StockStatement />}
      {tab === "cma" && <Cma />}
      {tab === "bg-lc" && <Guarantees />}
      {tab === "remittances" && <Remittances />}
      {tab === "194n" && <Section194N />}
      {tab === "covenants" && <CovenantsConsortium />}
      {tab === "passport" && <CreditPassport />}
    </div>
  );
}

/* ── generic fetch hook ── */
function useFetch<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    api.get<T>(path).then(setData).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload, setData };
}

/* ── Drawing power ── */
interface DP {
  as_of: string; facility: { id: string; lender: string; facility_type: string; sanctioned_limit: number } | null;
  stock: { gross: number; less_creditors: number; base: number; margin_pct: number; eligible: number };
  book_debts: { gross: number; eligible_gross: number; excluded_over_limit: number; margin_pct: number; eligible: number; max_days: number };
  creditors: number; drawing_power: number; sanctioned_limit: number; drawable_limit: number; utilized: number; available: number; utilization_pct: number; note: string;
}
function DrawingPower() {
  const { isReadOnly } = useApp();
  const { data, error, reload } = useFetch<DP>("/api/books/drawing-power");
  const { data: facs, reload: reloadFacs } = useFetch<Array<{ id: string; lender: string; facility_type: string; sanctioned_limit: number; utilized: number }>>("/api/books/credit-facilities");
  const [f, setF] = useState({ lender: "", facility_type: "CC", sanctioned_limit: "", utilized: "" });

  const addFacility = async () => {
    if (!(Number(f.sanctioned_limit) > 0)) return toast.error("Enter a sanctioned limit");
    try { await api.post("/api/books/credit-facilities", { ...f, sanctioned_limit: Number(f.sanctioned_limit), utilized: Number(f.utilized) || 0 }); toast.success("Facility added"); setF({ lender: "", facility_type: "CC", sanctioned_limit: "", utilized: "" }); reloadFacs(); reload(); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState rows={5} />;
  const d = data;
  return (
    <div className="space-y-4">
      {!d.facility && (
        <div className={card + " border-dashed"}>
          <p className="text-sm font-semibold mb-1">No CC/OD facility yet</p>
          <p className="text-xs text-[var(--color-muted)] mb-3">Add your sanctioned limit so drawing power can be tracked against it. The numbers below still compute from your ledger.</p>
          {!isReadOnly && (
            <div className="flex flex-wrap gap-2 items-end">
              <input className={INP} placeholder="Lender" value={f.lender} onChange={(e) => setF({ ...f, lender: e.target.value })} />
              <select className={INP} value={f.facility_type} onChange={(e) => setF({ ...f, facility_type: e.target.value })}>
                <option value="CC">CC</option><option value="OD">OD</option><option value="WCDL">WCDL</option>
              </select>
              <input className={INP} type="number" placeholder="Sanctioned ₹" value={f.sanctioned_limit} onChange={(e) => setF({ ...f, sanctioned_limit: e.target.value })} />
              <input className={INP} type="number" placeholder="Utilized ₹" value={f.utilized} onChange={(e) => setF({ ...f, utilized: e.target.value })} />
              <button onClick={addFacility} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold"><Plus size={13} /> Add</button>
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Drawing Power" value={INR(d.drawing_power)} accent />
        <Kpi label="Sanctioned" value={d.sanctioned_limit ? INR(d.sanctioned_limit) : "—"} />
        <Kpi label="Utilized" value={INR(d.utilized)} />
        <Kpi label="Available" value={INR(d.available)} good={d.available >= 0} />
      </div>
      <div className={card}>
        <table className="w-full text-sm rcard">
          <tbody>
            <Row k={`Stock (closing value)`} v={INR(d.stock.gross)} />
            {d.stock.less_creditors > 0 && <Row k="Less: sundry creditors" v={"−" + INR(d.stock.less_creditors)} />}
            <Row k={`Eligible stock (after ${d.stock.margin_pct}% margin)`} v={INR(d.stock.eligible)} />
            <Row k={`Book debts (total)`} v={INR(d.book_debts.gross)} />
            <Row k={`Excluded (over ${d.book_debts.max_days} days)`} v={"−" + INR(d.book_debts.excluded_over_limit)} />
            <Row k={`Eligible book debts (after ${d.book_debts.margin_pct}% margin)`} v={INR(d.book_debts.eligible)} />
            <Row k="Drawing power" v={INR(d.drawing_power)} bold />
          </tbody>
        </table>
        <p className="text-[11px] text-[var(--color-muted)] mt-2">{d.note} As of {d.as_of}.</p>
      </div>
      {(facs?.length ?? 0) > 0 && (
        <div className={card}>
          <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Facilities</p>
          <table className="w-full text-sm rcard">
            <tbody>
              {facs!.map((x) => (
                <tr key={x.id} className="border-t border-[var(--color-border)]">
                  <td data-label="Lender" className="py-1.5">{x.lender || "—"} <span className="text-[var(--color-muted)]">({x.facility_type})</span></td>
                  <td data-label="Sanctioned" className="py-1.5">{INR(x.sanctioned_limit)}</td>
                  <td data-label="Utilized" className="py-1.5">{INR(x.utilized)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Stock & book-debt statement ── */
function StockStatement() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, error, reload } = useFetch<{ month: string; stock: { closing_value: number; items: Array<{ name: string; unit: string; closing_qty: number; closing_value: number }> }; book_debts: { total: number; buckets: Record<string, number>; eligible_within_90: number }; total_current_assets_paper: number }>(`/api/books/stock-book-debt-statement?month=${month}`, [month]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input type="month" className={INP} value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <LoadingState rows={5} /> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Stock value" value={INR(data.stock.closing_value)} />
            <Kpi label="Book debts" value={INR(data.book_debts.total)} />
            <Kpi label="Current assets (paper)" value={INR(data.total_current_assets_paper)} accent />
          </div>
          <div className={card}>
            <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Book-debt aging</p>
            <table className="w-full text-sm rcard"><tbody>
              {Object.entries(data.book_debts.buckets).map(([k, v]) => <Row key={k} k={k} v={INR(v)} />)}
              <Row k="Eligible (≤ 90 days)" v={INR(data.book_debts.eligible_within_90)} bold />
            </tbody></table>
          </div>
          <div className={card}>
            <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Stock (top items)</p>
            {data.stock.items.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No stock items tracked.</p> : (
              <table className="w-full text-sm rcard"><tbody>
                {data.stock.items.map((it, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td data-label="Item" className="py-1.5">{it.name}</td>
                    <td data-label="Qty" className="py-1.5">{it.closing_qty} {it.unit}</td>
                    <td data-label="Value" className="py-1.5">{INR(it.closing_value)}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── CMA multi-year summary ── */
function Cma() {
  const { data, error, reload } = useFetch<{ rows: Array<{ fy: string; sales: number; net_profit: number; total_assets: number; net_worth: number; net_profit_margin_pct: number; tol_tnw: number | null }>; note: string }>("/api/books/cma-summary");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState rows={4} />;
  return (
    <div className={card + " overflow-x-auto"}>
      <table className="w-full text-sm rcard min-w-[520px]">
        <thead className="text-left text-xs text-[var(--color-muted)]"><tr>
          <th className="py-2">FY</th><th className="py-2">Sales</th><th className="py-2">Net Profit</th><th className="py-2">NP %</th><th className="py-2">Total Assets</th><th className="py-2">Net Worth</th><th className="py-2">TOL/TNW</th>
        </tr></thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.fy} className="border-t border-[var(--color-border)]">
              <td data-label="FY" className="py-2 font-medium">{r.fy}</td>
              <td data-label="Sales" className="py-2">{INR(r.sales)}</td>
              <td data-label="Net Profit" className="py-2">{INR(r.net_profit)}</td>
              <td data-label="NP %" className="py-2">{r.net_profit_margin_pct}%</td>
              <td data-label="Total Assets" className="py-2">{INR(r.total_assets)}</td>
              <td data-label="Net Worth" className="py-2">{INR(r.net_worth)}</td>
              <td data-label="TOL/TNW" className="py-2">{r.tol_tnw ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-[var(--color-muted)] mt-2">{data.note}</p>
    </div>
  );
}

/* ── BG / LC register ── */
function Guarantees() {
  const { isReadOnly } = useApp();
  const { data, error, reload } = useFetch<Array<{ id: string; instrument: string; reference_no: string; bank: string; beneficiary: string; amount: number; margin_pct: number; expires_on: string; status: string; days_to_expiry: number | null }>>("/api/books/bank-guarantees");
  const [g, setG] = useState({ instrument: "BG", bank: "", beneficiary: "", amount: "", margin_pct: "", expires_on: "" });
  const add = async () => {
    if (!(Number(g.amount) > 0)) return toast.error("Enter an amount");
    try { await api.post("/api/books/bank-guarantees", { ...g, amount: Number(g.amount), margin_pct: Number(g.margin_pct) || 0 }); toast.success("Added"); setG({ instrument: "BG", bank: "", beneficiary: "", amount: "", margin_pct: "", expires_on: "" }); reload(); }
    catch (e) { toast.error((e as Error).message); }
  };
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      {!isReadOnly && (
        <div className={card + " flex flex-wrap gap-2 items-end"}>
          <select className={INP} value={g.instrument} onChange={(e) => setG({ ...g, instrument: e.target.value })}><option value="BG">BG</option><option value="LC">LC</option></select>
          <input className={INP} placeholder="Bank" value={g.bank} onChange={(e) => setG({ ...g, bank: e.target.value })} />
          <input className={INP} placeholder="Beneficiary" value={g.beneficiary} onChange={(e) => setG({ ...g, beneficiary: e.target.value })} />
          <input className={INP} type="number" placeholder="Amount ₹" value={g.amount} onChange={(e) => setG({ ...g, amount: e.target.value })} />
          <input className={INP} type="number" placeholder="Margin %" value={g.margin_pct} onChange={(e) => setG({ ...g, margin_pct: e.target.value })} />
          <input className={INP} type="date" value={g.expires_on} onChange={(e) => setG({ ...g, expires_on: e.target.value })} />
          <button onClick={add} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold"><Plus size={13} /> Add</button>
        </div>
      )}
      {!data ? <LoadingState rows={3} /> : data.length === 0 ? <EmptyState icon={ShieldCheck} title="No guarantees / LCs" description="Track your bank guarantees and inland LCs with margin held and expiry alerts." /> : (
        <div className={card}>
          <table className="w-full text-sm rcard"><tbody>
            {data.map((x) => (
              <tr key={x.id} className="border-t border-[var(--color-border)]">
                <td data-label="Type" className="py-2">{x.instrument} <span className="text-[var(--color-muted)]">{x.bank}</span></td>
                <td data-label="Beneficiary" className="py-2">{x.beneficiary || "—"}</td>
                <td data-label="Amount" className="py-2">{INR(x.amount)}</td>
                <td data-label="Margin" className="py-2">{x.margin_pct}%</td>
                <td data-label="Expiry" className="py-2">
                  {x.expires_on || "—"}
                  {x.days_to_expiry != null && x.days_to_expiry <= 90 && <span className={`ml-1 text-[11px] ${x.days_to_expiry <= 30 ? "text-red-400" : "text-amber-400"}`}>({x.days_to_expiry}d)</span>}
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

/* ── 15CA / 15CB remittances ── */
function Remittances() {
  const { isReadOnly } = useApp();
  const { data, error, reload } = useFetch<Array<{ id: string; beneficiary: string; country: string; currency: string; amount_inr: number; part: string; cb_required: boolean; status: string }>>("/api/books/remittances");
  const [r, setR] = useState({ beneficiary: "", country: "", currency: "USD", amount_fcy: "", amount_inr: "", nature: "", taxable: true });
  const add = async () => {
    if (!(Number(r.amount_inr) > 0)) return toast.error("Enter INR amount");
    try { await api.post("/api/books/remittances", { ...r, amount_fcy: Number(r.amount_fcy) || 0, amount_inr: Number(r.amount_inr) }); toast.success("Remittance drafted"); setR({ beneficiary: "", country: "", currency: "USD", amount_fcy: "", amount_inr: "", nature: "", taxable: true }); reload(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const certify = async (id: string) => {
    const ca_name = window.prompt("CA name:") ?? ""; if (!ca_name) return;
    const ca_membership_no = window.prompt("CA membership no:") ?? "";
    try { await api.post(`/api/books/remittances/${id}/certify`, { ca_name, ca_membership_no }); toast.success("15CB certified"); reload(); } catch (e) { toast.error((e as Error).message); }
  };
  const file = async (id: string) => {
    const ack_no = window.prompt("Acknowledgement no (optional):") ?? "";
    try { await api.post(`/api/books/remittances/${id}/file`, { ack_no: ack_no || undefined }); toast.success("Filed"); reload(); } catch (e) { toast.error((e as Error).message); }
  };
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      {!isReadOnly && (
        <div className={card + " flex flex-wrap gap-2 items-end"}>
          <input className={INP} placeholder="Beneficiary" value={r.beneficiary} onChange={(e) => setR({ ...r, beneficiary: e.target.value })} />
          <input className={INP} placeholder="Country" value={r.country} onChange={(e) => setR({ ...r, country: e.target.value })} />
          <input className={INP} placeholder="Nature (royalty…)" value={r.nature} onChange={(e) => setR({ ...r, nature: e.target.value })} />
          <input className={INP} type="number" placeholder="Amount ₹" value={r.amount_inr} onChange={(e) => setR({ ...r, amount_inr: e.target.value })} />
          <label className="text-xs text-[var(--color-muted)] flex items-center gap-1"><input type="checkbox" checked={r.taxable} onChange={(e) => setR({ ...r, taxable: e.target.checked })} /> taxable</label>
          <button onClick={add} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold"><Plus size={13} /> Draft</button>
        </div>
      )}
      {!data ? <LoadingState rows={3} /> : data.length === 0 ? <EmptyState icon={Globe2} title="No foreign remittances" description="Draft a 15CA and route to your CA for 15CB when the taxable remittance exceeds ₹5,00,000 in the year." /> : (
        <div className={card}>
          <table className="w-full text-sm rcard"><tbody>
            {data.map((x) => (
              <tr key={x.id} className="border-t border-[var(--color-border)]">
                <td data-label="Beneficiary" className="py-2">{x.beneficiary || "—"} <span className="text-[var(--color-muted)]">{x.country}</span></td>
                <td data-label="Amount" className="py-2">{INR(x.amount_inr)}</td>
                <td data-label="Form" className="py-2">15CA Part {x.part}{x.cb_required && " + 15CB"}</td>
                <td data-label="Status" className="py-2 capitalize">{x.status.replace("_", " ")}</td>
                {!isReadOnly && (
                  <td data-label="Action" className="py-2">
                    {x.status === "draft" && x.cb_required && <button onClick={() => certify(x.id)} className="text-[11px] text-sky-400 border border-sky-800/40 px-2 py-1 rounded-md mr-1">CA certify</button>}
                    {(x.status === "draft" || x.status === "ca_certified") && <button onClick={() => file(x.id)} className="text-[11px] text-emerald-400 border border-emerald-800/40 px-2 py-1 rounded-md">File</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

/* ── 194N monitor ── */
function Section194N() {
  const { isReadOnly } = useApp();
  const { data, error, reload } = useFetch<{ fy: string; accounts: Array<{ bank: string; account_last4: string; is_itr_filer: boolean; total_withdrawn: number; threshold: number; tds_applicable: number }>; total_tds_exposure: number }>("/api/books/cash-withdrawals/194n");
  const [w, setW] = useState({ bank: "", account_last4: "", amount: "", withdrawn_on: new Date().toISOString().slice(0, 10) });
  const add = async () => {
    if (!(Number(w.amount) > 0)) return toast.error("Enter amount");
    try { await api.post("/api/books/cash-withdrawals", { ...w, amount: Number(w.amount) }); toast.success("Recorded"); setW({ bank: "", account_last4: "", amount: "", withdrawn_on: new Date().toISOString().slice(0, 10) }); reload(); }
    catch (e) { toast.error((e as Error).message); }
  };
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState rows={3} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi label={`FY ${data.fy} — TDS exposure`} value={INR(data.total_tds_exposure)} accent={data.total_tds_exposure > 0} />
        <Kpi label="Accounts tracked" value={String(data.accounts.length)} />
      </div>
      {!isReadOnly && (
        <div className={card + " flex flex-wrap gap-2 items-end"}>
          <input className={INP} placeholder="Bank" value={w.bank} onChange={(e) => setW({ ...w, bank: e.target.value })} />
          <input className={INP} placeholder="A/c last4" value={w.account_last4} onChange={(e) => setW({ ...w, account_last4: e.target.value })} />
          <input className={INP} type="number" placeholder="Amount ₹" value={w.amount} onChange={(e) => setW({ ...w, amount: e.target.value })} />
          <input className={INP} type="date" value={w.withdrawn_on} onChange={(e) => setW({ ...w, withdrawn_on: e.target.value })} />
          <button onClick={add} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold"><Plus size={13} /> Record</button>
        </div>
      )}
      {data.accounts.length === 0 ? <EmptyState icon={Banknote} title="No cash withdrawals recorded" description="Log large cash withdrawals to monitor the ₹1 crore (₹20 lakh for non-filers) Section 194N TDS threshold." /> : (
        <div className={card}>
          <table className="w-full text-sm rcard"><tbody>
            {data.accounts.map((a, i) => (
              <tr key={i} className="border-t border-[var(--color-border)]">
                <td data-label="Account" className="py-2">{a.bank || "—"} ••{a.account_last4 || "----"}</td>
                <td data-label="Withdrawn" className="py-2">{INR(a.total_withdrawn)}</td>
                <td data-label="Threshold" className="py-2">{INR(a.threshold)}{!a.is_itr_filer && " (non-filer)"}</td>
                <td data-label="194N TDS" className={`py-2 font-medium ${a.tds_applicable > 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{INR(a.tds_applicable)}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

/* ── small presentational helpers ── */
function Kpi({ label, value, accent, good }: { label: string; value: string; accent?: boolean; good?: boolean }) {
  return (
    <div className={card}>
      <p className="text-[11px] text-[var(--color-muted)] uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-1 ${accent ? "text-[var(--color-primary)]" : good === false ? "text-red-400" : "text-[var(--color-text)]"}`}>{value}</p>
    </div>
  );
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <tr className={"border-t border-[var(--color-border)] " + (bold ? "font-semibold" : "")}>
      <td className="py-1.5 text-[var(--color-muted)]">{k}</td>
      <td className="py-1.5 text-right text-[var(--color-text)]">{v}</td>
    </tr>
  );
}

/* ── Covenant health (#24) + consortium pack (#21) + CC-vs-term optimizer (#20) + interest recon (#19) ── */
function CovenantsConsortium() {
  const { data: cov } = useFetch<{ note?: string; ratios: Record<string, number | null>; covenants: Array<{ name: string; metric: string; operator: string; threshold: number; actual: number | null; status: string }>; breaches: any[] }>("/api/books/covenant-health");
  const { data: cons } = useFetch<{ banks: string[]; facilities: Array<{ lender: string; facility_type: string; sanctioned: number; utilized: number; available: number; rate_pct: number }>; total_sanctioned: number; total_utilized: number; total_available: number; overall_utilization_pct: number; blended_rate_pct: number }>("/api/books/consortium-pack");
  const { data: opt } = useFetch<{ cc_headroom: number; suggestions: Array<{ from: string; shift_amount: number; annual_saving: number }>; total_annual_saving: number }>("/api/books/facility-optimizer");
  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-sm font-semibold mb-2">Covenant health (auto-computed)</p>
        {!cov ? <LoadingState rows={3} /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <Kpi label="Current ratio" value={cov.ratios.current_ratio != null ? String(cov.ratios.current_ratio) : "—"} />
              <Kpi label="Quick ratio" value={cov.ratios.quick_ratio != null ? String(cov.ratios.quick_ratio) : "—"} />
              <Kpi label="TOL / TNW" value={cov.ratios.tol_tnw != null ? String(cov.ratios.tol_tnw) : "—"} />
              <Kpi label="Net worth" value={INR(cov.ratios.net_worth ?? 0)} />
            </div>
            {cov.covenants.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No covenants recorded (add them under Debt). Ratios above are computed from your books.</p> : (
              <table className="w-full text-sm rcard"><tbody>
                {cov.covenants.map((c, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td data-label="Covenant" className="py-1.5">{c.name} <span className="text-[var(--color-muted)]">({c.metric})</span></td>
                    <td data-label="Threshold" className="py-1.5">{c.operator} {c.threshold}</td>
                    <td data-label="Actual" className="py-1.5">{c.actual ?? "—"}</td>
                    <td data-label="Status" className={`py-1.5 font-medium ${c.status === "breached" ? "text-red-400" : c.status === "met" ? "text-emerald-400" : "text-[var(--color-muted)]"}`}>{c.status}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
            <p className="text-[11px] text-[var(--color-muted)] mt-2">{(cov as any).note}</p>
          </>
        )}
      </div>

      <div className={card}>
        <p className="text-sm font-semibold mb-2">Consortium / multiple-banking pack</p>
        {!cons ? <LoadingState rows={2} /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <Kpi label="Total sanctioned" value={INR(cons.total_sanctioned)} />
              <Kpi label="Utilized" value={INR(cons.total_utilized)} />
              <Kpi label="Available" value={INR(cons.total_available)} good={cons.total_available >= 0} />
              <Kpi label="Blended rate" value={`${cons.blended_rate_pct}%`} />
            </div>
            {cons.facilities.length > 0 && (
              <table className="w-full text-sm rcard"><tbody>
                {cons.facilities.map((f, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td data-label="Bank" className="py-1.5">{f.lender || "—"} <span className="text-[var(--color-muted)]">({f.facility_type})</span></td>
                    <td data-label="Sanctioned" className="py-1.5">{INR(f.sanctioned)}</td>
                    <td data-label="Available" className="py-1.5">{INR(f.available)}</td>
                    <td data-label="Rate" className="py-1.5">{f.rate_pct}%</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </>
        )}
      </div>

      {opt && opt.suggestions.length > 0 && (
        <div className={card}>
          <p className="text-sm font-semibold mb-1">Interest-saving opportunity</p>
          <p className="text-xs text-[var(--color-muted)] mb-2">Unused CC headroom {INR(opt.cc_headroom)} could retire dearer term debt — est. saving <b className="text-emerald-400">{INR(opt.total_annual_saving)}/yr</b>.</p>
          {opt.suggestions.map((s, i) => <p key={i} className="text-xs text-[var(--color-muted)]">• {s.from} → shift {INR(s.shift_amount)} · save {INR(s.annual_saving)}/yr</p>)}
        </div>
      )}
    </div>
  );
}

/* ── Credit Passport (#90): generate a shareable, verified creditworthiness link for lenders ── */
function CreditPassport() {
  const { isReadOnly } = useApp();
  const [p, setP] = useState<{ token: string; link: string; include_score: boolean; include_financials: boolean; headline: string | null; status: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ include_score: true, include_financials: true, headline: "" });
  const load = useCallback(() => { api.get<any>("/api/credit/passport").then((d) => { setP(d); if (d) setForm({ include_score: d.include_score, include_financials: d.include_financials, headline: d.headline || "" }); setLoaded(true); }).catch(() => setLoaded(true)); }, []);
  useEffect(() => { load(); }, [load]);
  const save = async (regenerate = false) => {
    try { const d = await api.post<any>("/api/credit/passport", { ...form, regenerate }); setP(d); toast.success(regenerate ? "New link generated" : "Passport published"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const revoke = async () => { try { await api.post("/api/credit/passport/revoke", {}); toast.success("Passport revoked"); load(); } catch (e) { toast.error((e as Error).message); } };
  const fullLink = p ? (p.link.startsWith("http") ? p.link : `${window.location.origin}${p.link}`) : "";
  const copy = () => { navigator.clipboard.writeText(fullLink).then(() => toast.success("Link copied")); };

  if (!loaded) return <LoadingState rows={3} />;
  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-sm font-semibold mb-1">Shareable Credit Passport</p>
        <p className="text-xs text-[var(--color-muted)] mb-3">A verified, read-only creditworthiness profile (score, factors, eligible limit) computed from your own books & GST — share the link with a lender instead of emailing statements. Revoke any time.</p>
        {!isReadOnly && (
          <div className="space-y-3">
            <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Headline (optional) — e.g. Seeking a ₹25L working-capital line" className={INP} />
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.include_score} onChange={(e) => setForm({ ...form, include_score: e.target.checked })} /> Include score & factors</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.include_financials} onChange={(e) => setForm({ ...form, include_financials: e.target.checked })} /> Include top-line financials</label>
            </div>
            <button onClick={() => save(false)} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-semibold">{p && p.status === "active" ? "Update passport" : "Publish passport"}</button>
          </div>
        )}
      </div>
      {p && p.status === "active" && (
        <div className={card}>
          <p className="text-xs text-[var(--color-muted)] mb-1">Shareable link</p>
          <div className="flex flex-wrap gap-2 items-center">
            <code className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 flex-1 min-w-0 truncate">{fullLink}</code>
            <button onClick={copy} className="text-xs border border-[var(--color-border)] px-3 py-1.5 rounded-lg">Copy</button>
            <a href={fullLink} target="_blank" rel="noreferrer" className="text-xs border border-[var(--color-border)] px-3 py-1.5 rounded-lg">Preview</a>
            {!isReadOnly && <><button onClick={() => save(true)} className="text-xs border border-[var(--color-border)] px-3 py-1.5 rounded-lg">New link</button><button onClick={revoke} className="text-xs text-red-400 border border-red-800/40 px-3 py-1.5 rounded-lg">Revoke</button></>}
          </div>
        </div>
      )}
    </div>
  );
}
