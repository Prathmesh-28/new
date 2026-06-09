import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import { Search, Filter, Tag, Repeat, Flag, ChevronLeft, ChevronRight, Pencil, Check, X, Download } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/data/types";

const CATEGORIES = ["revenue", "expense", "payroll", "loan", "tax", "transfer"] as const;

const CAT_COLOR: Record<string, string> = {
  revenue:  "bg-green-900/30 text-green-400 border-green-800/40",
  expense:  "bg-red-900/30 text-red-400 border-red-800/40",
  payroll:  "bg-blue-900/30 text-blue-400 border-blue-800/40",
  loan:     "bg-purple-900/30 text-purple-400 border-purple-800/40",
  tax:      "bg-orange-900/30 text-orange-400 border-orange-800/40",
  transfer: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
};

const PAGE_SIZE = 20;

function computeCategoryAverages(txns: Transaction[]) {
  const sums: Record<string, { total: number; count: number }> = {};
  txns.forEach(t => {
    if (t.amount < 0) {
      if (!sums[t.category]) sums[t.category] = { total: 0, count: 0 };
      sums[t.category].total += Math.abs(t.amount);
      sums[t.category].count += 1;
    }
  });
  const avgs: Record<string, number> = {};
  for (const [cat, { total, count }] of Object.entries(sums)) {
    avgs[cat] = count > 0 ? total / count : 0;
  }
  return avgs;
}

function exportCsv(filtered: Transaction[], bankAccounts: { id: string; name: string }[]) {
  const headers = ["Date", "Description", "Category", "Counterparty", "Amount", "Account", "Recurring", "Unusual", "Notes"];
  const rows = filtered.map(t => {
    const acct = bankAccounts.find(a => a.id === t.bankAccountId)?.name ?? "";
    return [
      t.date, t.description, t.category, t.counterparty,
      t.amount.toFixed(2), acct,
      t.isRecurring ? "Yes" : "No",
      (t as unknown as Record<string, unknown>).flagged ? "Yes" : "No",
      (t.notes ?? ""),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  const csv   = [headers.map(h => `"${h}"`).join(","), ...rows].join("\n");
  const blob  = new Blob([csv], { type: "text/csv" });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href      = url;
  a.download  = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TransactionsPage() {
  const { store, updateTransaction, canExport } = useApp();
  const { transactions, bankAccounts } = store;

  const [search,     setSearch]     = useState("");
  const [filterCat,  setFilterCat]  = useState<string>("all");
  const [filterAcct, setFilterAcct] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo,   setFilterTo]   = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page,       setPage]       = useState(1);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [editNote,   setEditNote]   = useState("");
  const [editCat,    setEditCat]    = useState<Transaction["category"]>("expense");

  const catAvgs = useMemo(() => computeCategoryAverages(transactions), [transactions]);

  const filtered = useMemo(() => {
    let list = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
    if (search)      list = list.filter(t => t.description.toLowerCase().includes(search.toLowerCase()) || t.counterparty.toLowerCase().includes(search.toLowerCase()));
    if (filterCat  !== "all") list = list.filter(t => t.category === filterCat);
    if (filterAcct !== "all") list = list.filter(t => t.bankAccountId === filterAcct);
    if (filterFrom) list = list.filter(t => t.date >= filterFrom);
    if (filterTo)   list = list.filter(t => t.date <= filterTo);
    return list;
  }, [transactions, search, filterCat, filterAcct, filterFrom, filterTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalIn  = filtered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const startEdit = (t: Transaction) => {
    setEditId(t.id);
    setEditNote(t.notes ?? "");
    setEditCat(t.category);
  };

  const saveEdit = (t: Transaction) => {
    updateTransaction({ ...t, notes: editNote, category: editCat });
    toast.success("Transaction updated");
    setEditId(null);
  };

  const isUnusual = (t: Transaction) => {
    if (t.amount >= 0) return false;
    const avg = catAvgs[t.category] ?? 0;
    return avg > 0 && Math.abs(t.amount) > avg * 2.5;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Transaction Feed</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">{filtered.length} transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-green-400 font-semibold text-sm">{formatCurrency(totalIn)} in</span>
          <span className="text-[var(--color-muted)] text-sm">/</span>
          <span className="text-red-400 font-semibold text-sm">{formatCurrency(totalOut)} out</span>
          {canExport() && (
            <button onClick={() => { exportCsv(filtered, bankAccounts); toast.success("CSV downloaded"); }}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by description or counterparty…"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <button onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition-colors ${showFilters ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)]"}`}>
          <Filter size={12} /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Category</label>
            <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
              <option value="all">All categories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account</label>
            <select value={filterAcct} onChange={e => { setFilterAcct(e.target.value); setPage(1); }}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
              <option value="all">All accounts</option>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">From</label>
            <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1); }}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">To</label>
            <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1); }}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
        </div>
      )}

      {/* Category quick-filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => { setFilterCat("all"); setPage(1); }}
          className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${filterCat === "all" ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
          All
        </button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => { setFilterCat(c); setPage(1); }}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${filterCat === c ? CAT_COLOR[c] + " border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      {filtered.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-2xl p-10 text-center text-sm text-[var(--color-muted)]">
          {transactions.length === 0 ? "No transactions yet. Add an account and import transactions from the Dashboard." : "No transactions match your filters."}
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl divide-y divide-[var(--color-border)]">
          {paginated.map(t => {
            const unusual = isUnusual(t);
            const acct = bankAccounts.find(a => a.id === t.bankAccountId);
            const isEditing = editId === t.id;

            return (
              <div key={t.id} className={`px-4 py-3 hover:bg-[var(--color-accent)] transition-colors ${unusual ? "border-l-2 border-orange-500" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      {t.isRecurring && (
                        <span className="flex items-center gap-0.5 text-[10px] text-blue-400 bg-blue-900/20 border border-blue-800/30 px-1.5 py-0.5 rounded-full">
                          <Repeat size={9} /> recurring
                        </span>
                      )}
                      {unusual && (
                        <span className="flex items-center gap-0.5 text-[10px] text-orange-400 bg-orange-900/20 border border-orange-800/30 px-1.5 py-0.5 rounded-full">
                          <Flag size={9} /> unusual spend
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-[var(--color-muted)]">{t.date}</span>
                      {acct && <span className="text-xs text-[var(--color-muted)]">· {acct.name}</span>}
                      {t.counterparty && <span className="text-xs text-[var(--color-muted)]">· {t.counterparty}</span>}
                    </div>
                    {/* Category tag — inline editable */}
                    <div className="mt-1.5">
                      {isEditing ? (
                        <select value={editCat} onChange={e => setEditCat(e.target.value as Transaction["category"])}
                          className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-0.5 outline-none">
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${CAT_COLOR[t.category]}`}>
                          <Tag size={9} /> {t.category}
                        </span>
                      )}
                    </div>
                    {/* Notes */}
                    {isEditing ? (
                      <input value={editNote} onChange={e => setEditNote(e.target.value)}
                        placeholder="Add note (visible to linked CA)…"
                        className="mt-2 w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 outline-none focus:border-[var(--color-primary)]" />
                    ) : t.notes ? (
                      <p className="mt-1 text-xs text-[var(--color-muted)] italic">📝 {t.notes}</p>
                    ) : null}
                  </div>

                  <div className="flex items-start gap-2 shrink-0">
                    <span className={`text-sm font-bold tabular-nums ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.amount >= 0 ? "+" : ""}{formatCurrency(t.amount)}
                    </span>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => saveEdit(t)} className="p-1 text-green-400 hover:bg-green-900/20 rounded"><Check size={13} /></button>
                        <button onClick={() => setEditId(null)} className="p-1 text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded"><X size={13} /></button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(t)} className="p-1 text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-accent)] rounded transition-colors">
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-xs text-[var(--color-muted)]">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30">
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = page <= 3 ? i + 1 : page - 2 + i;
              if (pg < 1 || pg > totalPages) return null;
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium border transition-colors ${pg === page ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                  {pg}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
