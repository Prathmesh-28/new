import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, formatAmount } from "@/lib/utils";
import { Package, TrendingDown, TrendingUp, Search, ArrowUpDown, Send, Calendar, X } from "lucide-react";
import { toast } from "sonner";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

interface Vendor {
  name: string;
  category: string;
  totalSpend: number;
  lastPayment: string;
  txnCount: number;
  avgPayment: number;
  thisMonth: number;
  lastMonth: number;
  trend: "up" | "down" | "flat";
}

type SortKey = "totalSpend" | "lastPayment" | "thisMonth" | "txnCount";

const CATEGORY_LABEL: Record<string, string> = {
  expense:  "Operating",
  payroll:  "Payroll",
  tax:      "Tax",
  loan:     "Loan",
  transfer: "Transfer",
};

const CATEGORY_COLOR: Record<string, string> = {
  expense:  "bg-red-900/20 text-red-400 border-red-800/30",
  payroll:  "bg-orange-900/20 text-orange-400 border-orange-800/30",
  tax:      "bg-yellow-900/20 text-yellow-400 border-yellow-800/30",
  loan:     "bg-purple-900/20 text-purple-400 border-purple-800/30",
  transfer: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
};

function ScheduleModal({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const [amount, setAmount] = useState(vendor.avgPayment.toFixed(0));
  const [date,   setDate]   = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; });
  const [note,   setNote]   = useState("");

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success(`Payment of ${formatCurrency(parseFloat(amount))} to ${vendor.name} scheduled for ${new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Schedule Payment</h2>
          <button onClick={onClose}><X size={16} className="text-[var(--color-muted)]" /></button>
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-sm font-semibold">{vendor.name}</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{CATEGORY_LABEL[vendor.category] ?? vendor.category} · Avg payment: {formatAmount(vendor.avgPayment)}</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹) *</label>
            <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} required className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payment date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inp} min={new Date().toISOString().split("T")[0]} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} className={inp} placeholder="Invoice #, PO number…" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90">
              Schedule Payment
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const { store } = useApp();
  const { transactions, firm } = store;
  const [search,   setSearch]   = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [sortKey,  setSortKey]  = useState<SortKey>("totalSpend");
  const [sortAsc,  setSortAsc]  = useState(false);
  const [schedVendor, setSchedVendor] = useState<Vendor | null>(null);

  const now  = new Date();
  const m1s  = startOfMonth(now).toISOString().split("T")[0];
  const m1e  = endOfMonth(now).toISOString().split("T")[0];
  const m2s  = startOfMonth(subMonths(now, 1)).toISOString().split("T")[0];
  const m2e  = endOfMonth(subMonths(now, 1)).toISOString().split("T")[0];

  const vendors: Vendor[] = useMemo(() => {
    const map: Record<string, { txns: typeof transactions }> = {};
    transactions.filter(t => t.amount < 0 && t.counterparty).forEach(t => {
      if (!map[t.counterparty]) map[t.counterparty] = { txns: [] };
      map[t.counterparty].txns.push(t);
    });

    return Object.entries(map).map(([name, { txns }]) => {
      const totalSpend  = txns.reduce((s, t) => s + Math.abs(t.amount), 0);
      const sorted      = [...txns].sort((a, b) => b.date.localeCompare(a.date));
      const lastPayment = sorted[0]?.date ?? "";
      const category    = sorted[0]?.category ?? "expense";
      const txnCount    = txns.length;
      const avgPayment  = totalSpend / txnCount;
      const thisMonth   = txns.filter(t => t.date >= m1s && t.date <= m1e).reduce((s, t) => s + Math.abs(t.amount), 0);
      const lastMonth   = txns.filter(t => t.date >= m2s && t.date <= m2e).reduce((s, t) => s + Math.abs(t.amount), 0);
      const trend: Vendor["trend"] = thisMonth > lastMonth * 1.05 ? "up" : thisMonth < lastMonth * 0.95 ? "down" : "flat";
      return { name, category, totalSpend, lastPayment, txnCount, avgPayment, thisMonth, lastMonth, trend };
    });
  }, [transactions, m1s, m1e, m2s, m2e]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(vendors.map(v => v.category)))], [vendors]);

  const filtered = useMemo(() => {
    let v = vendors.filter(vend =>
      (catFilter === "all" || vend.category === catFilter) &&
      (!search || vend.name.toLowerCase().includes(search.toLowerCase()))
    );
    v = [...v].sort((a, b) => {
      const diff = sortKey === "lastPayment"
        ? a.lastPayment.localeCompare(b.lastPayment)
        : a[sortKey] - b[sortKey];
      return sortAsc ? diff : -diff;
    });
    return v;
  }, [vendors, catFilter, search, sortKey, sortAsc]);

  const totalSpend   = vendors.reduce((s, v) => s + v.totalSpend, 0);
  const thisMSpend   = vendors.reduce((s, v) => s + v.thisMonth, 0);
  const recurringN   = vendors.filter(v => v.txnCount >= 2).length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <ArrowUpDown size={10} className={`ml-1 ${sortKey === k ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`} />
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Vendors</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">All vendors derived from {transactions.filter(t=>t.amount<0&&t.counterparty).length} expense transactions</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Vendors",      value: vendors.length.toString(),         color: "text-[var(--color-primary)]" },
          { label: "Total Spend",        value: formatAmount(totalSpend),           color: "text-red-400" },
          { label: "This Month Spend",   value: formatAmount(thisMSpend),           color: "text-orange-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {categories.slice(0, 5).map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className={`px-2.5 py-1 text-xs rounded capitalize font-medium transition-colors ${catFilter === cat ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {CATEGORY_LABEL[cat] ?? cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Package size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No vendors found. Import transactions to populate the vendor directory.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">Vendor</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider hidden md:table-cell">Category</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--color-text)]" onClick={() => toggleSort("totalSpend")}>
                  Total Spend <SortIcon k="totalSpend" />
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--color-text)] hidden lg:table-cell" onClick={() => toggleSort("thisMonth")}>
                  This Month <SortIcon k="thisMonth" />
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider hidden lg:table-cell">Trend</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--color-text)] hidden md:table-cell" onClick={() => toggleSort("lastPayment")}>
                  Last Paid <SortIcon k="lastPayment" />
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtered.map((v, i) => (
                <tr key={i} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-sm">{v.name}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{v.txnCount} transaction{v.txnCount !== 1 ? "s" : ""} · avg {formatAmount(v.avgPayment)}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLOR[v.category]}`}>
                      {CATEGORY_LABEL[v.category] ?? v.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-400">{formatAmount(v.totalSpend)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)] hidden lg:table-cell">
                    {v.thisMonth > 0 ? formatAmount(v.thisMonth) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center hidden lg:table-cell">
                    {v.trend === "up" ? <span title="Spend up vs last month"><TrendingUp size={13} className="text-red-400 mx-auto" /></span>
                      : v.trend === "down" ? <span title="Spend down vs last month"><TrendingDown size={13} className="text-green-400 mx-auto" /></span>
                      : <span className="text-[var(--color-muted)] text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--color-muted)] hidden md:table-cell">
                    {v.lastPayment ? new Date(v.lastPayment).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSchedVendor(v)}
                      className="flex items-center gap-1 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 px-2.5 py-1.5 rounded-lg ml-auto transition-colors">
                      <Calendar size={11} /> Schedule
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 bg-[var(--color-bg)] border-t border-[var(--color-border)] flex items-center justify-between">
            <p className="text-xs text-[var(--color-muted)]">{filtered.length} vendors · {recurringN} recurring</p>
            <p className="text-xs text-[var(--color-muted)]">Total: <span className="font-semibold text-red-400">{formatAmount(filtered.reduce((s,v)=>s+v.totalSpend,0))}</span></p>
          </div>
        </div>
      )}

      {schedVendor && <ScheduleModal vendor={schedVendor} onClose={() => setSchedVendor(null)} />}
    </div>
  );
}
