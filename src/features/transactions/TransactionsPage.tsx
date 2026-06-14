import { useState, useMemo, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import { Search, Filter, ChevronLeft, ChevronRight, Download, Tag, X, ScanLine, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/data/types";
import { capturePhoto } from "@/lib/nativeFeatures";
import { api } from "@/lib/api";
import ReconcileModal from "./ReconcileModal";

const CATEGORIES = ["revenue", "expense", "payroll", "loan", "tax", "transfer"] as const;
const PAGE_SIZE  = 50;

const CAT_COLOR: Record<string, string> = {
  revenue:  "bg-green-900/30 text-green-400 border-green-800/40",
  expense:  "bg-red-900/30 text-red-400 border-red-800/40",
  payroll:  "bg-blue-900/30 text-blue-400 border-blue-800/40",
  loan:     "bg-purple-900/30 text-purple-400 border-purple-800/40",
  tax:      "bg-orange-900/30 text-orange-400 border-orange-800/40",
  transfer: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
};

const CAT_DOT: Record<string, string> = {
  revenue: "bg-green-400", expense: "bg-red-400", payroll: "bg-blue-400",
  loan: "bg-purple-400", tax: "bg-orange-400", transfer: "bg-[var(--color-muted)]",
};

type SortField = "date" | "description" | "amount";
type SortDir   = "asc" | "desc";

function getRules(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem("hr_cat_rules") ?? "{}"); } catch { return {}; }
}
function saveRules(rules: Record<string, string>) {
  localStorage.setItem("hr_cat_rules", JSON.stringify(rules));
}

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
  for (const [cat, { total, count }] of Object.entries(sums)) avgs[cat] = count > 0 ? total / count : 0;
  return avgs;
}

function exportCsv(filtered: Transaction[], bankAccounts: { id: string; name: string }[]) {
  const headers = ["Date", "Description", "Category", "Counterparty", "Amount", "Account"];
  const rows = filtered.map(t => {
    const acct = bankAccounts.find(a => a.id === t.bankAccountId)?.name ?? "";
    return [t.date, t.description, t.category, t.counterparty, t.amount.toFixed(2), acct]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  const csv  = [headers.map(h => `"${h}"`).join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: `transactions-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <span className="opacity-20 ml-0.5">↕</span>;
  return <span className="ml-0.5 text-[var(--color-primary)]">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

export default function TransactionsPage() {
  const { store, updateTransaction, addTransaction, canExport, canEdit } = useApp();
  const { transactions, bankAccounts } = store;

  const [scanning, setScanning] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  // Snap a receipt/bill → Claude vision extracts vendor/amount/date/category →
  // drop a prefilled transaction in for review.
  const handleScanReceipt = useCallback(async () => {
    setScanning(true);
    try {
      const image = await capturePhoto();
      if (!image) { setScanning(false); return; }
      const r = await api.post<{ vendor: string; amount: number; date: string | null; category: Transaction["category"]; description: string }>("/api/ai/scan-receipt", { image });
      if (!r.amount) { toast.error("Couldn't read an amount — try a clearer photo."); setScanning(false); return; }
      const sign = r.category === "revenue" ? 1 : -1;
      addTransaction({
        id: generateId(), date: r.date || new Date().toISOString().slice(0, 10),
        amount: sign * Math.abs(r.amount), description: r.description || r.vendor || "Scanned receipt",
        category: r.category, counterparty: r.vendor || "Scanned", isRecurring: false,
        bankAccountId: bankAccounts[0]?.id ?? "",
      });
      toast.success(`Scanned: ${formatCurrency(Math.abs(r.amount))} · ${r.vendor || "receipt"} — review below`);
    } catch {
      toast.error("Receipt scan failed. Check your connection and try again.");
    } finally { setScanning(false); }
  }, [addTransaction, bankAccounts]);

  const [search,      setSearch]      = useState("");
  const [filterCat,   setFilterCat]   = useState<string>("all");
  const [filterAcct,  setFilterAcct]  = useState<string>("all");
  const [filterFrom,  setFilterFrom]  = useState("");
  const [filterTo,    setFilterTo]    = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page,        setPage]        = useState(1);
  const [sortField,   setSortField]   = useState<SortField>("date");
  const [sortDir,     setSortDir]     = useState<SortDir>("desc");
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [bulkCat,     setBulkCat]     = useState<Transaction["category"]>("expense");
  const [editCatId,   setEditCatId]   = useState<string | null>(null);

  const catAvgs = useMemo(() => computeCategoryAverages(transactions), [transactions]);

  const isUnusual = useCallback((t: Transaction) => {
    if (t.amount >= 0) return false;
    const avg = catAvgs[t.category] ?? 0;
    return avg > 0 && Math.abs(t.amount) > avg * 2.5;
  }, [catAvgs]);

  const filtered = useMemo(() => {
    let list = [...transactions];
    if (search)          list = list.filter(t => t.description.toLowerCase().includes(search.toLowerCase()) || t.counterparty.toLowerCase().includes(search.toLowerCase()));
    if (filterCat !== "all") list = list.filter(t => t.category === filterCat);
    if (filterAcct !== "all") list = list.filter(t => t.bankAccountId === filterAcct);
    if (filterFrom)      list = list.filter(t => t.date >= filterFrom);
    if (filterTo)        list = list.filter(t => t.date <= filterTo);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "date")        cmp = a.date.localeCompare(b.date);
      if (sortField === "description") cmp = a.description.localeCompare(b.description);
      if (sortField === "amount")      cmp = a.amount - b.amount;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [transactions, search, filterCat, filterAcct, filterFrom, filterTo, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalIn    = filtered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut   = filtered.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const allOnPageSelected = paginated.length > 0 && paginated.every(t => selected.has(t.id));
  const toggleAll = () => {
    if (allOnPageSelected) setSelected(prev => { const next = new Set(prev); paginated.forEach(t => next.delete(t.id)); return next; });
    else setSelected(prev => { const next = new Set(prev); paginated.forEach(t => next.add(t.id)); return next; });
  };

  const applyBulkCat = () => {
    let count = 0;
    transactions.forEach(t => {
      if (selected.has(t.id) && t.category !== bulkCat) {
        updateTransaction({ ...t, category: bulkCat });
        count++;
      }
    });
    toast.success(`Updated ${count} transaction${count !== 1 ? "s" : ""} to "${bulkCat}"`);
    setSelected(new Set());
  };

  const applyRule = (counterparty: string) => {
    if (!counterparty) { toast.error("No counterparty on selected transactions"); return; }
    const rules = getRules();
    rules[counterparty.toLowerCase()] = bulkCat;
    saveRules(rules);
    const matching = transactions.filter(t => t.counterparty.toLowerCase() === counterparty.toLowerCase() && t.category !== bulkCat);
    matching.forEach(t => updateTransaction({ ...t, category: bulkCat }));
    toast.success(`Rule saved: all "${counterparty}" → ${bulkCat} (${matching.length} updated)`);
    setSelected(new Set());
  };

  const selectedCounterparties = useMemo(() => {
    const set = new Set<string>();
    transactions.filter(t => selected.has(t.id) && t.counterparty).forEach(t => set.add(t.counterparty));
    return [...set];
  }, [selected, transactions]);

  const intelligence = useMemo(() => {
    const now = new Date();
    const cutoff30 = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
    const cutoff7  = new Date(now.getTime() -  7 * 86400000).toISOString().split("T")[0];
    const spend30  = transactions.filter(t => t.amount < 0 && t.date >= cutoff30).reduce((s, t) => s + Math.abs(t.amount), 0);
    const spend7   = transactions.filter(t => t.amount < 0 && t.date >= cutoff7).reduce((s, t) => s + Math.abs(t.amount), 0);
    const daily30  = spend30 / 30;
    const daily7   = spend7  / 7;
    const velChange = daily30 > 0 ? Math.round(((daily7 - daily30) / daily30) * 100) : 0;
    const thisKey  = now.toISOString().slice(0, 7);
    const lastKey  = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
    const biggestExpense = transactions.filter(t => t.amount < 0 && t.date.startsWith(thisKey)).sort((a, b) => a.amount - b.amount)[0] ?? null;
    const dupIds = new Set<string>();
    for (let i = 0; i < transactions.length; i++) {
      for (let j = i + 1; j < transactions.length; j++) {
        const a = transactions[i], b = transactions[j];
        const daysDiff = Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) / 86400000;
        if (daysDiff <= 3 && a.amount === b.amount && a.counterparty && a.counterparty === b.counterparty) {
          dupIds.add(a.id); dupIds.add(b.id);
        }
      }
    }
    const catThis: Record<string, number> = {};
    const catLast: Record<string, number> = {};
    transactions.filter(t => t.amount < 0 && t.date.startsWith(thisKey)).forEach(t => { catThis[t.category] = (catThis[t.category] ?? 0) + Math.abs(t.amount); });
    transactions.filter(t => t.amount < 0 && t.date.startsWith(lastKey)).forEach(t => { catLast[t.category] = (catLast[t.category] ?? 0) + Math.abs(t.amount); });
    const spike = Object.entries(catThis)
      .map(([cat, val]) => ({ cat, val, prev: catLast[cat] ?? 0, pct: catLast[cat] > 0 ? Math.round(((val - catLast[cat]) / catLast[cat]) * 100) : 0 }))
      .filter(s => s.pct > 20 && s.prev > 0).sort((a, b) => b.pct - a.pct)[0] ?? null;
    return { daily7, daily30, velChange, biggestExpense, dupCount: dupIds.size, spike };
  }, [transactions]);

  const thCls = "px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider select-none whitespace-nowrap";
  const thSortCls = `${thCls} cursor-pointer hover:text-[var(--color-text)] transition-colors`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Transactions</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5 tabular-nums">
            {filtered.length} transactions · <span className="text-green-400">{formatCurrency(totalIn)} in</span> · <span className="text-red-400">{formatCurrency(totalOut)} out</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit() && (
            <button onClick={handleScanReceipt} disabled={scanning}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 transition-colors">
              <ScanLine size={12} /> {scanning ? "Scanning…" : "Scan receipt"}
            </button>
          )}
          <button onClick={() => setShowReconcile(true)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
            <CheckCheck size={12} /> Reconcile
          </button>
          {canExport() && (
            <button onClick={() => { exportCsv(filtered, bankAccounts); toast.success("CSV downloaded"); }}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {showReconcile && <ReconcileModal onClose={() => setShowReconcile(false)} />}

      {/* Financial Intelligence Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          {
            label: "Spend Velocity (7d vs 30d avg)",
            value: intelligence.daily7 > 0 ? `${formatCurrency(intelligence.daily7)}/day` : "—",
            sub: intelligence.velChange === 0 ? "Stable spending pattern" : intelligence.velChange > 0 ? `+${intelligence.velChange}% acceleration — watch` : `${intelligence.velChange}% slowing down`,
            color: intelligence.velChange > 20 ? "text-red-400" : intelligence.velChange > 10 ? "text-yellow-400" : "text-green-400",
          },
          {
            label: "Largest Expense This Month",
            value: intelligence.biggestExpense ? formatCurrency(Math.abs(intelligence.biggestExpense.amount)) : "—",
            sub: intelligence.biggestExpense?.description ?? "No expenses this month",
            color: "text-red-400",
          },
          {
            label: "Potential Duplicates Detected",
            value: intelligence.dupCount.toString(),
            sub: intelligence.dupCount > 0 ? "Same amount + party within 3 days" : "No duplicates found",
            color: intelligence.dupCount > 0 ? "text-yellow-400" : "text-green-400",
          },
          {
            label: "Category Spend Spike",
            value: intelligence.spike ? `${intelligence.spike.cat.charAt(0).toUpperCase() + intelligence.spike.cat.slice(1)} +${intelligence.spike.pct}%` : "None",
            sub: intelligence.spike ? `${formatCurrency(intelligence.spike.val)} vs ${formatCurrency(intelligence.spike.prev)} last month` : "All categories normal",
            color: intelligence.spike ? "text-yellow-400" : "text-green-400",
          },
        ] as { label: string; value: string; sub: string; color: string }[]).map(({ label, value, sub, color }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1.5">{label}</p>
            <p className={`text-sm font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5 truncate">{sub}</p>
          </div>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search description or counterparty…"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <button onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition-colors ${showFilters ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)]"}`}>
          <Filter size={12} /> Filters {showFilters && (filterCat !== "all" || filterAcct !== "all" || filterFrom || filterTo) ? "·" : ""}
        </button>
      </div>

      {showFilters && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {/* Category pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => { setFilterCat("all"); setPage(1); }}
          className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${filterCat === "all" ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/40"}`}>
          All
        </button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => { setFilterCat(c === filterCat ? "all" : c); setPage(1); }}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${filterCat === c ? `${CAT_COLOR[c]} border-transparent` : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/40"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${CAT_DOT[c]}`} />
            {c}
          </button>
        ))}
      </div>

      {/* Dense table */}
      {filtered.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center text-sm text-[var(--color-muted)]">
          {transactions.length === 0 ? "No transactions yet. Add an account and import transactions from the Dashboard." : "No transactions match your filters."}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll}
                      className="accent-[var(--color-primary)] cursor-pointer" title="Select all on this page" />
                  </th>
                  <th className={thSortCls} onClick={() => toggleSort("date")}>
                    Date <SortIcon field="date" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th className={thSortCls} onClick={() => toggleSort("description")}>
                    Description <SortIcon field="description" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th className={thCls}>Category</th>
                  <th className={`${thCls} hidden md:table-cell`}>Account</th>
                  <th className={`${thCls} text-right`} style={{ cursor: "pointer" }} onClick={() => toggleSort("amount")}>
                    Amount <SortIcon field="amount" sortField={sortField} sortDir={sortDir} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {paginated.map(t => {
                  const acct    = bankAccounts.find(a => a.id === t.bankAccountId);
                  const unusual = isUnusual(t);
                  const isSel   = selected.has(t.id);
                  const editingCat = editCatId === t.id;

                  return (
                    <tr
                      key={t.id}
                      className={`h-10 transition-colors ${isSel ? "bg-[var(--color-primary)]/5" : "hover:bg-white/3"} ${unusual ? "border-l-2 border-orange-500/60" : ""}`}
                    >
                      <td className="px-3">
                        <input type="checkbox" checked={isSel} onChange={() => toggleSelect(t.id)}
                          className="accent-[var(--color-primary)] cursor-pointer" />
                      </td>
                      <td className="px-3 text-xs text-[var(--color-muted)] tabular-nums whitespace-nowrap">{t.date}</td>
                      <td className="px-3 max-w-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate font-medium text-sm">{t.description}</span>
                          {t.isRecurring && <span className="text-[9px] text-blue-400 bg-blue-900/20 border border-blue-800/30 px-1 py-0.5 rounded shrink-0">REC</span>}
                          {unusual && <span className="text-[9px] text-orange-400 bg-orange-900/20 border border-orange-800/30 px-1 py-0.5 rounded shrink-0">!</span>}
                        </div>
                        {t.counterparty && <p className="text-[10px] text-[var(--color-muted)] truncate leading-tight">{t.counterparty}</p>}
                      </td>
                      <td className="px-3">
                        {editingCat ? (
                          <select
                            value={t.category}
                            autoFocus
                            onChange={e => {
                              updateTransaction({ ...t, category: e.target.value as Transaction["category"] });
                              toast.success("Category updated");
                              setEditCatId(null);
                            }}
                            onBlur={() => setEditCatId(null)}
                            className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-0.5 outline-none"
                          >
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditCatId(t.id)}
                            title="Click to change category"
                            className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity ${CAT_COLOR[t.category]}`}>
                            <Tag size={8} /> {t.category}
                          </button>
                        )}
                      </td>
                      <td className="px-3 hidden md:table-cell text-xs text-[var(--color-muted)] max-w-[120px] truncate">{acct?.name ?? "—"}</td>
                      <td className="px-3 text-right tabular-nums font-semibold whitespace-nowrap">
                        <span className={t.amount >= 0 ? "text-green-400" : "text-[var(--color-text)]"}>
                          {t.amount >= 0 ? "+" : ""}{formatCurrency(t.amount)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-xs text-[var(--color-muted)]">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
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

      {/* Floating bulk-action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-xl px-5 py-3 shadow-2xl">
          <span className="text-sm font-semibold text-[var(--color-text)]">{selected.size} selected</span>

          <div className="flex items-center gap-1">
            <Tag size={12} className="text-[var(--color-muted)]" />
            <select
              value={bulkCat}
              onChange={e => setBulkCat(e.target.value as Transaction["category"])}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2 py-1 text-xs outline-none"
            >
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <button
            onClick={applyBulkCat}
            className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-md hover:opacity-90"
          >
            Apply to {selected.size}
          </button>

          {selectedCounterparties.length === 1 && (
            <button
              onClick={() => applyRule(selectedCounterparties[0])}
              title={`Always categorize "${selectedCounterparties[0]}" as ${bulkCat}`}
              className="text-xs border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-md hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40 transition-colors"
            >
              + Create rule
            </button>
          )}

          <button onClick={() => setSelected(new Set())} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
