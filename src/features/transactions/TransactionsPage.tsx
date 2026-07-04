import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, generateId } from "@/lib/utils";
import { Search, Filter, ChevronLeft, ChevronRight, Download, Tag, X, ScanLine, CheckCheck, FileText, Repeat, Wand2, GitCompareArrows, Split, Layers, ArrowLeftRight, FolderTree, Scale, NotebookPen, Calculator, BookOpen, BookText, Wallet, Eraser, Lock, ListTree, Percent, Receipt, Banknote, Target, Users, Trash2, RefreshCw, CloudOff, Link2, UploadCloud } from "lucide-react";
import { parseStatementCsv, guessCategory, type ParsedLine } from "@/lib/statementParse";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Transaction, Invoice } from "@/data/types";
import { capturePhoto } from "@/lib/nativeFeatures";
import { api } from "@/lib/api";
import { useT } from "@/i18n";
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

// ── BACKEND WIRING (routes/transactions.js) ─────────────────────────────────
// The server stores transactions in Postgres with snake_case columns and a
// wider category set than the UI's 6 buckets. These helpers translate between
// the API row shape and the frontend `Transaction` type so the existing UI +
// every sub-view (which read `store.transactions`) keep working unchanged.
const TXN_PAGE_LIMIT = 200; // backend caps page size at 200

// backend category → one of the UI's six buckets
function catFromApi(c: string | null | undefined): Transaction["category"] {
  switch (c) {
    case "revenue":        return "revenue";
    case "payroll":        return "payroll";
    case "tax":            return "tax";
    case "transfer":       return "transfer";
    case "loan_repayment": return "loan";
    default:               return "expense"; // rent/software/inventory/utilities/marketing/uncategorized
  }
}
// UI bucket → backend category (used on create/update). When the row already carries a full
// backend category whose bucket MATCHES what's being written, preserve it — before this, any
// edit (merchant fix, bulk action, rule) silently corrupted rent/software/inventory/… back to
// "uncategorized". Only a deliberate bucket CHANGE re-maps.
function catToApi(c: Transaction["category"], apiCategory?: string): string {
  if (apiCategory && catFromApi(apiCategory) === c) return apiCategory;
  switch (c) {
    case "revenue":  return "revenue";
    case "payroll":  return "payroll";
    case "tax":      return "tax";
    case "transfer": return "transfer";
    case "loan":     return "loan_repayment";
    case "expense":  return "uncategorized";
    default:         return "uncategorized";
  }
}
// API row → frontend Transaction
function txnFromApi(r: any): Transaction {
  return {
    id:            String(r.id),
    date:          (r.transaction_date ?? "").toString().slice(0, 10),
    amount:        Number(r.amount) || 0,
    description:   r.description_raw ?? r.account_name ?? "Transaction",
    category:      catFromApi(r.category),
    apiCategory:   r.category ?? undefined, // full backend category, preserved for round-trips
    counterparty:  r.merchant_name ?? "",
    isRecurring:   !!r.is_recurring,
    bankAccountId: r.bank_account_id ? String(r.bank_account_id) : "",
    notes:         r.notes ?? undefined,
  };
}
// frontend Transaction → POST body
function txnToApiBody(t: Transaction) {
  return {
    bank_account_id:  t.bankAccountId || undefined,
    amount:           t.amount,
    description_raw:  t.description,
    merchant_name:    t.counterparty || undefined,
    category:         catToApi(t.category, t.apiCategory),
    is_recurring:     t.isRecurring,
    transaction_date: t.date,
    source:           "manual",
  };
}

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
  const tr = useT();
  const { store, setStore, updateTransaction, addTransaction, deleteTransaction, canExport, canEdit } = useApp();
  const { transactions, bankAccounts } = store;

  // ── Backend hydration ──────────────────────────────────────────────────────
  // On mount (and on refresh) pull the real ledger from routes/transactions.js
  // and mirror it into the AppContext store, so the main table *and* every
  // downstream tool view (which read `store.transactions`) reflect server data.
  // If the API is unreachable we keep whatever is already in the KV-backed store
  // - the page stays fully usable offline.
  const [apiState, setApiState] = useState<"idle" | "loading" | "online" | "offline">("idle");
  const [serverTotal, setServerTotal] = useState<number | null>(null);

  const loadFromServer = useCallback(async () => {
    setApiState("loading");
    try {
      // Pull pages until we've fetched everything (or hit a safety cap).
      const all: Transaction[] = [];
      let page = 1;
      let pages = 1;
      let total = 0;
      do {
        const res = await api.get<{ data: any[]; total: number; pages: number }>(
          `/api/transactions?page=${page}&limit=${TXN_PAGE_LIMIT}`,
        );
        (res.data ?? []).forEach(r => all.push(txnFromApi(r)));
        pages = res.pages || 1;
        total = res.total ?? all.length;
        page += 1;
      } while (page <= pages && page <= 25); // cap at 5,000 rows
      setServerTotal(total);
      setApiState("online");
      // Mirror into the shared store so sub-views stay consistent.
      setStore(s => ({ ...s, transactions: all }));
    } catch {
      setApiState("offline");
      // Graceful fallback: leave the existing store.transactions in place.
    }
  }, [setStore]);

  useEffect(() => { void loadFromServer(); }, [loadFromServer]);

  const [view, setView] = useState<"transactions" | "import" | "pdc" | "bounce" | "upi" | "recon" | "recurring" | "cat-rules" | "recon-workbench" | "split-txn" | "bulk-tag" | "transfer-detect" | "cost-center" | "cash-accrual" | "journal-entry" | "trial-balance" | "day-book" | "ledger-account" | "opening-balance" | "write-off" | "period-lock" | "chart-of-accounts" | "gst-ledger" | "tds-ledger" | "cash-bank-split" | "counterparty-360" | "budget-actual" | "cash-application">("transactions");
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
      if (!r.amount) { toast.error("Couldn't read an amount - try a clearer photo."); setScanning(false); return; }
      const sign = r.category === "revenue" ? 1 : -1;
      const draft: Transaction = {
        id: generateId(), date: r.date || new Date().toISOString().slice(0, 10),
        amount: sign * Math.abs(r.amount), description: r.description || r.vendor || "Scanned receipt",
        category: r.category, counterparty: r.vendor || "Scanned", isRecurring: false,
        bankAccountId: bankAccounts[0]?.id ?? "",
      };
      // Review gate: never commit the parsed receipt straight to the ledger. Show
      // the extracted fields and let the user confirm before anything is written.
      const ok = window.confirm(
        `Review scanned receipt before adding to your ledger:\n\n` +
        `Vendor:   ${draft.counterparty}\n` +
        `Amount:   ${draft.amount < 0 ? "−" : "+"}${formatCurrency(Math.abs(draft.amount))}\n` +
        `Date:     ${draft.date}\n` +
        `Category: ${draft.category}\n\n` +
        `Add this transaction? You can edit any field on the row afterward.`,
      );
      if (!ok) { toast("Scan discarded - nothing was added."); setScanning(false); return; }
      // Persist server-side so the row computes into summaries and survives reload.
      try {
        const created = await api.post<any>("/api/transactions", txnToApiBody(draft));
        const saved = Array.isArray(created) ? created[0] : created;
        addTransaction(saved ? txnFromApi(saved) : draft);
      } catch {
        addTransaction(draft); // offline fallback: keep it locally
      }
      toast.success(`Added: ${formatCurrency(Math.abs(r.amount))} · ${r.vendor || "receipt"} - review on the row below`);
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
  // Holds the rows most recently removed by a bulk delete so the Undo toast can
  // re-add them. Cleared after the undo window so a stale click can't resurrect.
  const lastDeletedRef = useRef<Transaction[]>([]);

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

  // Update a single transaction's category: optimistic store write, then PATCH
  // the backend (only when we know the server is reachable).
  const persistCategory = useCallback(async (t: Transaction, category: Transaction["category"]) => {
    updateTransaction({ ...t, category });
    if (apiState === "offline") return;
    try {
      await api.patch(`/api/transactions/${t.id}`, { category: catToApi(category, t.apiCategory) });
    } catch {
      toast.error("Saved locally - couldn't sync category to the server.");
    }
  }, [updateTransaction, apiState]);

  const applyBulkCat = async () => {
    const targets = transactions.filter(t => selected.has(t.id) && t.category !== bulkCat);
    if (targets.length === 0) { setSelected(new Set()); return; }
    // Snapshot prior categories so Undo can restore each row exactly.
    const prior = targets.map(t => ({ txn: t, category: t.category }));
    targets.forEach(t => updateTransaction({ ...t, category: bulkCat }));
    setSelected(new Set());

    // Revert: put each row back to its original category (store + server).
    const undo = () => {
      prior.forEach(p => updateTransaction({ ...p.txn, category: p.category }));
      if (apiState !== "offline") {
        Promise.allSettled(prior.map(p => api.patch(`/api/transactions/${p.txn.id}`, { category: catToApi(p.category, p.txn.apiCategory) })))
          .then(rs => { const f = rs.filter(r => r.status === "rejected").length; if (f) toast.error(`${f} categor${f !== 1 ? "ies" : "y"} couldn't sync to the server`); });
      }
      toast.success(`Reverted ${prior.length} categor${prior.length !== 1 ? "ies" : "y"}`);
    };

    if (apiState !== "offline") {
      const results = await Promise.allSettled(
        targets.map(t => api.patch(`/api/transactions/${t.id}`, { category: catToApi(bulkCat, t.apiCategory) })),
      );
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed) toast.error(`${failed} of ${targets.length} categor${failed !== 1 ? "ies" : "y"} saved locally but not synced to the server.`);
    }
    toast.success(`Updated ${targets.length} transaction${targets.length !== 1 ? "s" : ""} to "${bulkCat}"`, {
      action: { label: "Undo", onClick: undo },
      duration: 10000,
    });
  };

  // Delete selected transactions on the server (DELETE /api/transactions/:id),
  // then drop them from the store. Falls back to a local-only delete offline.
  const deleteSelected = async () => {
    const rows = transactions.filter(t => selected.has(t.id));
    if (rows.length === 0) return;
    // Richer confirm: show what's about to go - count, net total, and a few names -
    // not just an opaque ID list.
    const total = rows.reduce((s, t) => s + Math.abs(t.amount), 0);
    const names = rows
      .map(t => t.counterparty || t.description)
      .filter(Boolean)
      .slice(0, 3);
    const namePreview = names.length
      ? `\n${names.join(", ")}${rows.length > names.length ? `, +${rows.length - names.length} more` : ""}`
      : "";
    if (!window.confirm(
      `Delete ${rows.length} transaction${rows.length !== 1 ? "s" : ""} totalling ${formatCurrency(total)}?${namePreview}\n\nYou'll have a few seconds to undo.`,
    )) return;

    const ids = rows.map(t => t.id);
    setSelected(new Set());

    // Re-add the removed rows. Within the undo window we still hold the original
    // objects, so we can restore them to the store and (online) re-POST them.
    const undo = (deleted: Transaction[]) => {
      if (lastDeletedRef.current.length === 0) return; // window elapsed / already undone
      lastDeletedRef.current = [];
      deleted.forEach(t => addTransaction(t));
      if (apiState !== "offline") {
        Promise.allSettled(deleted.map(async t => {
          const created = await api.post<any>("/api/transactions", txnToApiBody(t));
          const saved = Array.isArray(created) ? created[0] : created;
          if (saved) { deleteTransaction(t.id); addTransaction(txnFromApi(saved)); }
        })).then(rs => { const f = rs.filter(r => r.status === "rejected").length; if (f) toast.error(`${f} transaction${f !== 1 ? "s" : ""} couldn't be restored on the server`); });
      }
      setServerTotal(prev => (prev == null ? prev : prev + deleted.length));
      toast.success(`Restored ${deleted.length} transaction${deleted.length !== 1 ? "s" : ""}`);
    };

    if (apiState === "offline") {
      ids.forEach(id => deleteTransaction(id));
      lastDeletedRef.current = rows;
      setTimeout(() => { lastDeletedRef.current = []; }, 10000);
      toast.success(`Removed ${rows.length} locally (offline)`, {
        action: { label: "Undo", onClick: () => undo(rows) },
        duration: 10000,
      });
      return;
    }
    const results = await Promise.allSettled(ids.map(id => api.delete(`/api/transactions/${id}`)));
    let ok = 0;
    const deleted: Transaction[] = [];
    results.forEach((r, i) => { if (r.status === "fulfilled") { deleteTransaction(ids[i]); ok++; deleted.push(rows[i]); } });
    setServerTotal(prev => (prev == null ? prev : Math.max(0, prev - ok)));
    if (ok === 0) { toast.error(`Couldn't delete - all ${ids.length} failed.`); return; }
    lastDeletedRef.current = deleted;
    setTimeout(() => { lastDeletedRef.current = []; }, 10000);
    const msg = ok === ids.length
      ? `Deleted ${ok} transaction${ok !== 1 ? "s" : ""}`
      : `Deleted ${ok} of ${ids.length} - the rest failed.`;
    const opts = { action: { label: "Undo", onClick: () => undo(deleted) }, duration: 10000 };
    ok === ids.length ? toast.success(msg, opts) : toast.error(msg, opts);
  };

  const applyRule = (counterparty: string) => {
    if (!counterparty) { toast.error("No counterparty on selected transactions"); return; }
    const rules = getRules();
    rules[counterparty.toLowerCase()] = bulkCat;
    saveRules(rules);
    const matching = transactions.filter(t => t.counterparty.toLowerCase() === counterparty.toLowerCase() && t.category !== bulkCat);
    matching.forEach(t => updateTransaction({ ...t, category: bulkCat }));
    setSelected(new Set());
    if (apiState !== "offline") {
      Promise.allSettled(matching.map(t => api.patch(`/api/transactions/${t.id}`, { category: catToApi(bulkCat, t.apiCategory) })))
        .then(rs => { const f = rs.filter(r => r.status === "rejected").length; if (f) toast.error(`${f} of ${matching.length} couldn't sync to the server`); });
    }
    toast.success(`Rule saved: all "${counterparty}" → ${bulkCat} (${matching.length} updated)`);
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
    // Bucket by amount + counterparty in one O(n) pass, then only compare dates within each bucket.
    const dupBuckets: Record<string, Transaction[]> = {};
    for (const t of transactions) {
      if (!t.counterparty) continue;
      const key = `${t.amount}|${t.counterparty.toLowerCase()}`;
      (dupBuckets[key] ??= []).push(t);
    }
    for (const bucket of Object.values(dupBuckets)) {
      if (bucket.length < 2) continue;
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i], b = bucket[j];
          const daysDiff = Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) / 86400000;
          if (daysDiff <= 3) {
            dupIds.add(a.id); dupIds.add(b.id);
          }
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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{tr("txn.title")}</h1>
            {apiState === "offline" && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-orange-800/40 bg-orange-900/20 text-orange-400" title="The server is unreachable - showing locally cached data. Changes are kept on this device and will not sync until you reconnect.">
                <CloudOff size={10} /> Offline
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-0.5 tabular-nums">
            {filtered.length} transactions{serverTotal != null && serverTotal !== filtered.length ? ` of ${serverTotal.toLocaleString("en-IN")}` : ""} · <span className="text-green-400">{formatCurrency(totalIn)} in</span> · <span className="text-red-400">{formatCurrency(totalOut)} out</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => void loadFromServer()} disabled={apiState === "loading"}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors disabled:opacity-50"
            title="Reload transactions from the server">
            <RefreshCw size={12} className={apiState === "loading" ? "animate-spin" : ""} /> {tr("txn.refresh")}
          </button>
          {canEdit() && (
            <button onClick={handleScanReceipt} disabled={scanning}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 transition-colors">
              <ScanLine size={12} /> {scanning ? "Scanning…" : "Scan receipt"}
            </button>
          )}
          <button onClick={() => setShowReconcile(true)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
            <CheckCheck size={12} /> {tr("txn.reconcile")}
          </button>
          <button onClick={() => setView(v => v === "cash-application" ? "transactions" : "cash-application")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${view === "cash-application" ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}
            title="Match received cash to open customer invoices and mark them paid">
            <Link2 size={12} /> {tr("txn.cashApplication")}
          </button>
          {canExport() && (
            <button onClick={() => { exportCsv(filtered, bankAccounts); toast.success("CSV downloaded"); }}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
              <Download size={12} /> {tr("txn.exportCsv")}
            </button>
          )}
          <button onClick={() => setView(v => v === "import" ? "transactions" : "import")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${view === "import" ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}>
            <UploadCloud size={12} /> Import Statement
          </button>
          <button onClick={() => setView(v => v === "pdc" ? "transactions" : "pdc")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${view === "pdc" ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}>
            <FileText size={12} /> PDC Register
          </button>
          <button onClick={() => setView(v => v === "bounce" ? "transactions" : "bounce")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${view === "bounce" ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}>
            <X size={12} /> Bounce Tracker
          </button>
          <button onClick={() => setView(v => v === "upi" ? "transactions" : "upi")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${view === "upi" ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}>
            <ScanLine size={12} /> UPI Dashboard
          </button>
          <button onClick={() => setView(v => v === "recon" ? "transactions" : "recon")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${view === "recon" ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}>
            <CheckCheck size={12} /> Bank Recon
          </button>
          <button onClick={() => setView(v => v === "recurring" ? "transactions" : "recurring")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${view === "recurring" ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}>
            <Repeat size={12} /> Recurring
          </button>
        </div>
      </div>

      {/* Advanced tools tab strip */}
      <div className="flex items-center gap-1.5 flex-wrap border-t border-[var(--color-border)] pt-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold mr-1">{tr("txn.tools")}</span>
        {([
          ["cat-rules",        "Auto-Categorise",  Wand2],
          ["recon-workbench",  "Recon Workbench",  GitCompareArrows],
          ["split-txn",        "Split Txn",        Split],
          ["bulk-tag",         "Bulk Tag",         Layers],
          ["transfer-detect",  "Transfer Detect",  ArrowLeftRight],
          ["cost-center",      "Cost Centers",     FolderTree],
          ["cash-accrual",     "Cash / Accrual",   Scale],
          ["journal-entry",    "Journal Entry",    NotebookPen],
          ["trial-balance",    "Trial Balance",    Calculator],
          ["day-book",         "Day Book",         BookOpen],
          ["ledger-account",   "Party Ledger",     BookText],
          ["opening-balance",  "Opening Balance",  Wallet],
          ["write-off",        "Write-Off",        Eraser],
          ["period-lock",      "Period Lock",      Lock],
          ["chart-of-accounts","Chart of Accounts",ListTree],
          ["gst-ledger",       "GST Ledger",       Percent],
          ["tds-ledger",       "TDS Ledger",       Receipt],
          ["cash-bank-split",  "Cash / Bank Split",Banknote],
          ["counterparty-360", "Counterparty 360", Users],
          ["budget-actual",    "Budget vs Actual", Target],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setView(v => v === id ? "transactions" : id)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${view === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {showReconcile && <ReconcileModal onClose={() => setShowReconcile(false)} />}

      {view === "import"          && <StatementImportTool bankAccounts={bankAccounts} onImported={() => { setView("transactions"); loadFromServer(); }} />}
      {view === "cat-rules"       && <CategorisationRulesEngine />}
      {view === "recon-workbench" && <ReconciliationWorkbench />}
      {view === "split-txn"       && <SplitTransactionTool />}
      {view === "bulk-tag"        && <BulkTaggingTool />}
      {view === "transfer-detect" && <TransferDetection />}
      {view === "cost-center"     && <CostCenterTagging />}
      {view === "cash-accrual"    && <CashAccrualToggle />}
      {view === "journal-entry"     && <JournalEntryComposer />}
      {view === "trial-balance"     && <TrialBalanceView />}
      {view === "day-book"          && <DayBook />}
      {view === "ledger-account"    && <PartyLedger />}
      {view === "opening-balance"   && <OpeningBalanceSetup />}
      {view === "write-off"         && <WriteOffComposer />}
      {view === "period-lock"       && <PeriodLockManager />}
      {view === "chart-of-accounts" && <ChartOfAccounts />}
      {view === "gst-ledger"        && <GstLedger />}
      {view === "tds-ledger"        && <TdsLedger />}
      {view === "cash-bank-split"   && <CashBankSplit />}
      {view === "counterparty-360"  && <Counterparty360 />}
      {view === "budget-actual"     && <BudgetVsActual />}
      {view === "cash-application"  && <CashApplication />}

      {view === "pdc" && <PDCRegister />}
      {view === "bounce" && <BounceTracker />}
      {view === "upi" && <UpiDashboard />}
      {view === "recon" && <BankReconStatement />}
      {view === "recurring" && <RecurringTemplates />}

      {view === "transactions" && <>
      {/* Financial Intelligence Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          {
            label: tr("txn.stat.velocity"),
            value: intelligence.daily7 > 0 ? `${formatCurrency(intelligence.daily7)}/day` : "-",
            sub: intelligence.velChange === 0 ? "Stable spending pattern" : intelligence.velChange > 0 ? `+${intelligence.velChange}% acceleration - watch` : `${intelligence.velChange}% slowing down`,
            color: intelligence.velChange > 20 ? "text-red-400" : intelligence.velChange > 10 ? "text-yellow-400" : "text-green-400",
          },
          {
            label: tr("txn.stat.largestExpense"),
            value: intelligence.biggestExpense ? formatCurrency(Math.abs(intelligence.biggestExpense.amount)) : "-",
            sub: intelligence.biggestExpense?.description ?? "No expenses this month",
            color: "text-red-400",
          },
          {
            label: tr("txn.stat.duplicates"),
            value: intelligence.dupCount.toString(),
            sub: intelligence.dupCount > 0 ? "Same amount + party within 3 days" : "No duplicates found",
            color: intelligence.dupCount > 0 ? "text-yellow-400" : "text-green-400",
          },
          {
            label: tr("txn.stat.spike"),
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
          {apiState === "loading" && transactions.length === 0
            ? tr("txn.loading")
            : transactions.length === 0
              ? tr("txn.empty")
              : tr("txn.noMatch")}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse rcard">
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
                      <td data-label="" className="px-3">
                        <input type="checkbox" checked={isSel} onChange={() => toggleSelect(t.id)}
                          className="accent-[var(--color-primary)] cursor-pointer" />
                      </td>
                      <td data-label="Date" className="px-3 text-xs text-[var(--color-muted)] tabular-nums whitespace-nowrap">{t.date}</td>
                      <td data-label="Description" className="px-3 max-w-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate font-medium text-sm">{t.description}</span>
                          {t.isRecurring && <span className="text-[9px] text-blue-400 bg-blue-900/20 border border-blue-800/30 px-1 py-0.5 rounded shrink-0">REC</span>}
                          {unusual && <span className="text-[9px] text-orange-400 bg-orange-900/20 border border-orange-800/30 px-1 py-0.5 rounded shrink-0">!</span>}
                        </div>
                        {t.counterparty && <p className="text-[10px] text-[var(--color-muted)] truncate leading-tight">{t.counterparty}</p>}
                      </td>
                      <td data-label="Category" className="px-3">
                        {editingCat ? (
                          <select
                            value={t.category}
                            autoFocus
                            onChange={e => {
                              void persistCategory(t, e.target.value as Transaction["category"]);
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
                      <td data-label="Account" className="px-3 hidden md:table-cell text-xs text-[var(--color-muted)] max-w-[120px] truncate">{acct?.name ?? "-"}</td>
                      <td data-label="Amount" className="px-3 text-right tabular-nums font-semibold whitespace-nowrap">
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
            {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
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

          {canEdit() && (
            <button
              onClick={deleteSelected}
              title={`Delete ${selected.size} transaction${selected.size !== 1 ? "s" : ""}`}
              className="flex items-center gap-1 text-xs border border-red-800/40 text-red-400 px-3 py-1.5 rounded-md hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}

          <button onClick={() => setSelected(new Set())} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
            <X size={14} />
          </button>
        </div>
      )}
      </>}
    </div>
  );
}

function PDCRegister() {
  type PDC = { id: string; party: string; amount: number; chequeNo: string; bank: string; dueDate: string; type: "receive" | "issue"; status: "pending" | "cleared" | "bounced" };
  const [cheques, setCheques] = useFeatureState<PDC[]>("pdc-register", []);
  const [party,     setParty]     = useState("");
  const [amount,    setAmount]    = useState("");
  const [chequeNo,  setChequeNo]  = useState("");
  const [bank,      setBank]      = useState("");
  const [dueDate,   setDueDate]   = useState(() => new Date().toISOString().split("T")[0]);
  const [type,      setType]      = useState<"receive" | "issue">("receive");
  const [filter,    setFilter]    = useState<"all" | "receive" | "issue">("all");

  const addCheque = () => {
    if (!party || !amount || !chequeNo || !dueDate) return;
    setCheques(prev => [...prev, { id: Math.random().toString(36).slice(2), party, amount: parseFloat(amount), chequeNo, bank, dueDate, type, status: "pending" }]);
    setParty(""); setAmount(""); setChequeNo(""); setBank("");
  };

  const updateStatus = (id: string, status: PDC["status"]) => setCheques(prev => prev.map(c => c.id === id ? { ...c, status } : c));

  const visible = cheques.filter(c => filter === "all" || c.type === filter);
  const totalReceivable = cheques.filter(c => c.type === "receive" && c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const totalPayable    = cheques.filter(c => c.type === "issue"  && c.status === "pending").reduce((s, c) => s + c.amount, 0);

  const today = new Date().toISOString().split("T")[0];

  const downloadCsv = () => {
    const rows = [["Party","Cheque No","Bank","Amount","Type","Due Date","Status"], ...visible.map(c => [c.party, c.chequeNo, c.bank, c.amount, c.type, c.dueDate, c.status])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map(r=>r.join(",")).join("\n")], { type: "text/csv" }));
    a.download = "pdc-register.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "PDC Receivable (pending)", value: formatCurrency(totalReceivable), color: "text-green-400" },
          { label: "PDC Payable (pending)",    value: formatCurrency(totalPayable),    color: "text-red-400" },
          { label: "Total cheques",            value: cheques.length.toString(),       color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Add Post-Dated Cheque</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={party} onChange={e=>setParty(e.target.value)} placeholder="Party / counterparty"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input value={chequeNo} onChange={e=>setChequeNo(e.target.value)} placeholder="Cheque number"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input value={bank} onChange={e=>setBank(e.target.value)} placeholder="Bank name"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount (₹)"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <div className="flex items-center gap-2">
            {(["receive","issue"] as const).map(t => (
              <button key={t} onClick={()=>setType(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${type===t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                {t === "receive" ? "Receive" : "Issue"}
              </button>
            ))}
          </div>
        </div>
        <button onClick={addCheque} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
          + Add Cheque
        </button>
      </div>

      {cheques.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              {(["all","receive","issue"] as const).map(f => (
                <button key={f} onClick={()=>setFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filter===f ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                  {f === "all" ? "All" : f === "receive" ? "Receivable" : "Payable"}
                </button>
              ))}
            </div>
            <button onClick={downloadCsv} className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
              <Download size={10} /> CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Party","Cheque No","Bank","Amount","Due Date","Type","Status",""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {visible.map(c => {
                  const overdue = c.status === "pending" && c.dueDate < today;
                  return (
                    <tr key={c.id} className={`hover:bg-white/2 ${overdue ? "bg-red-950/20" : ""}`}>
                      <td className="px-4 py-3 font-medium">{c.party}</td>
                      <td className="px-4 py-3 font-mono text-xs">{c.chequeNo}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">{c.bank || "-"}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold">{formatCurrency(c.amount)}</td>
                      <td className={`px-4 py-3 tabular-nums text-xs ${overdue ? "text-red-400 font-semibold" : ""}`}>{c.dueDate}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${c.type === "receive" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-red-900/30 text-red-400 border-red-800/40"}`}>
                          {c.type === "receive" ? "Receivable" : "Payable"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${c.status === "cleared" ? "bg-green-900/30 text-green-400 border-green-800/40" : c.status === "bounced" ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {c.status === "pending" && <>
                            <button onClick={()=>updateStatus(c.id,"cleared")} className="text-[9px] text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded hover:bg-green-900/20">Clear</button>
                            <button onClick={()=>updateStatus(c.id,"bounced")} className="text-[9px] text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded hover:bg-red-900/20">Bounce</button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cheques.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <FileText size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No post-dated cheques recorded yet. Add your first PDC above.</p>
        </div>
      )}
    </div>
  );
}

function BounceTracker() {
  type BounceReason = "insufficient_funds" | "signature_mismatch" | "account_closed" | "payment_stopped" | "other";
  type BounceStatus = "open" | "represented" | "recovered" | "legal";
  type Bounce = { id: string; party: string; chequeNo: string; bank: string; amount: number; bounceDate: string; reason: BounceReason; status: BounceStatus; representDate: string; notes: string };

  const REASONS: Record<BounceReason, string> = {
    insufficient_funds: "Insufficient funds",
    signature_mismatch: "Signature mismatch",
    account_closed:     "Account closed",
    payment_stopped:    "Payment stopped",
    other:              "Other",
  };

  const [records, setRecords]     = useFeatureState<Bounce[]>("bounce-cases", []);
  const [party,       setParty]       = useState("");
  const [chequeNo,    setChequeNo]    = useState("");
  const [bank,        setBank]        = useState("");
  const [amount,      setAmount]      = useState("");
  const [bounceDate,  setBounceDate]  = useState(() => new Date().toISOString().split("T")[0]);
  const [reason,      setReason]      = useState<BounceReason>("insufficient_funds");
  const [notes,       setNotes]       = useState("");

  const addBounce = () => {
    if (!party || !amount || !chequeNo) return;
    const presentAfter = new Date(bounceDate);
    presentAfter.setDate(presentAfter.getDate() + 30);
    setRecords(prev => [...prev, {
      id: Math.random().toString(36).slice(2), party, chequeNo, bank, amount: parseFloat(amount),
      bounceDate, reason, status: "open",
      representDate: presentAfter.toISOString().split("T")[0],
      notes,
    }]);
    setParty(""); setChequeNo(""); setBank(""); setAmount(""); setNotes("");
  };

  const updateStatus = (id: string, status: BounceStatus) =>
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status } : r));

  const totalBounced   = records.reduce((s,r) => s + r.amount, 0);
  const totalRecovered = records.filter(r => r.status === "recovered").reduce((s,r) => s + r.amount, 0);
  const openCount      = records.filter(r => r.status === "open" || r.status === "represented").length;

  const STATUS_STYLE: Record<BounceStatus, string> = {
    open:        "bg-red-900/30 text-red-400 border-red-800/40",
    represented: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    recovered:   "bg-green-900/30 text-green-400 border-green-800/40",
    legal:       "bg-purple-900/30 text-purple-400 border-purple-800/40",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total bounced",    value: formatCurrency(totalBounced),   color: "text-red-400" },
          { label: "Recovered",        value: formatCurrency(totalRecovered), color: "text-green-400" },
          { label: "Open / pending",   value: openCount.toString(),           color: openCount > 0 ? "text-orange-400" : "text-[var(--color-muted)]" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Record Bounced Cheque</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={party} onChange={e=>setParty(e.target.value)} placeholder="Party name *"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input value={chequeNo} onChange={e=>setChequeNo(e.target.value)} placeholder="Cheque number *"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input value={bank} onChange={e=>setBank(e.target.value)} placeholder="Bank"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount (₹) *"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="date" value={bounceDate} onChange={e=>setBounceDate(e.target.value)}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <select value={reason} onChange={e=>setReason(e.target.value as BounceReason)}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
            {(Object.entries(REASONS) as [BounceReason, string][]).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes / memo reference"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] col-span-2" />
        </div>
        <button onClick={addBounce} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
          + Record bounce
        </button>
      </div>

      {records.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <X size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No bounced cheques recorded. Use this tracker to follow up on bounces and manage recovery.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Party","Cheque","Bank","Amount","Bounce Date","Reason","Status","Actions"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-3 font-medium">{r.party}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.chequeNo}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)] text-xs">{r.bank || "-"}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-red-400">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">{r.bounceDate}</td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{REASONS[r.reason]}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {r.status === "open" && <button onClick={()=>updateStatus(r.id,"represented")} className="text-[9px] text-yellow-400 border border-yellow-800/40 px-1.5 py-0.5 rounded hover:bg-yellow-900/20">Re-present</button>}
                        {(r.status === "open" || r.status === "represented") && <button onClick={()=>updateStatus(r.id,"recovered")} className="text-[9px] text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded hover:bg-green-900/20">Recovered</button>}
                        {r.status !== "legal" && r.status !== "recovered" && <button onClick={()=>updateStatus(r.id,"legal")} className="text-[9px] text-purple-400 border border-purple-800/40 px-1.5 py-0.5 rounded hover:bg-purple-900/20">Legal</button>}
                        <button onClick={()=>setRecords(prev=>prev.filter(x=>x.id!==r.id))} className="text-[9px] text-[var(--color-muted)] hover:text-red-400 px-1">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Under Sec 138 of the Negotiable Instruments Act, a bounced cheque is a criminal offence. File a complaint within 30 days of receiving the bank memo - after a 15-day notice to the drawer. Keep the original cheque, bank memo, and courier receipts.
      </div>
    </div>
  );
}

function UpiDashboard() {
  const { store } = useApp();
  type UpiEntry = { id: string; vpa: string; name: string; amount: number; type: "received" | "paid"; ref: string; date: string; note: string };
  const [entries, setEntries] = useState<UpiEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fVpa,    setFVpa]    = useState("");
  const [fName,   setFName]   = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fType,   setFType]   = useState<"received" | "paid">("received");
  const [fRef,    setFRef]    = useState("");
  const [fDate,   setFDate]   = useState("");
  const [fNote,   setFNote]   = useState("");

  const addEntry = () => {
    if (!fVpa || !fAmount) return;
    setEntries(prev => [...prev, { id: generateId(), vpa: fVpa, name: fName, amount: parseFloat(fAmount)||0, type: fType, ref: fRef, date: fDate, note: fNote }]);
    setFVpa(""); setFName(""); setFAmount(""); setFRef(""); setFDate(""); setFNote(""); setShowForm(false);
  };

  const txnUpi = useMemo(() => {
    return (store.transactions ?? []).filter(t => t.notes?.toLowerCase().includes("upi") || t.description?.toLowerCase().includes("upi"));
  }, [store.transactions]);

  const allEntries = [...entries, ...txnUpi.map(t => ({
    id: t.id, vpa: "-", name: t.counterparty ?? t.description, amount: Math.abs(t.amount),
    type: (t.category === "revenue" ? "received" : "paid") as "received" | "paid",
    ref: t.id.slice(0, 12), date: t.date, note: t.notes ?? "",
  }))];

  const totalReceived = allEntries.filter(e => e.type === "received").reduce((s, e) => s + e.amount, 0);
  const totalPaid     = allEntries.filter(e => e.type === "paid").reduce((s, e) => s + e.amount, 0);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const topVpas = useMemo(() => {
    const m: Record<string, number> = {};
    allEntries.forEach(e => { m[e.name] = (m[e.name] ?? 0) + e.amount; });
    return Object.entries(m).sort((a,b) => b[1]-a[1]).slice(0, 5);
  }, [allEntries]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Transactions", value: allEntries.length.toString(),   color: "text-[var(--color-primary)]" },
          { label: "Received via UPI",   value: fc(totalReceived),              color: "text-green-400" },
          { label: "Paid via UPI",       value: fc(totalPaid),                  color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {topVpas.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs font-semibold text-[var(--color-muted)] mb-3">Top Counterparties</p>
          <div className="space-y-2">
            {topVpas.map(([name, amt]) => {
              const max = topVpas[0][1];
              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs w-32 truncate">{name}</span>
                  <div className="flex-1 h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${(amt/max)*100}%` }} />
                  </div>
                  <span className="text-xs tabular-nums font-semibold w-24 text-right">{fc(amt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <ScanLine size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">UPI Transactions</span>
          </div>
          <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
            <X size={11} className={showForm ? "" : "rotate-45"} /> {showForm ? "Cancel" : "Add entry"}
          </button>
        </div>

        {showForm && (
          <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-accent)]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input value={fVpa}    onChange={e => setFVpa(e.target.value)}    placeholder="VPA / UPI ID *" className={inp} />
              <input value={fName}   onChange={e => setFName(e.target.value)}   placeholder="Name / merchant" className={inp} />
              <input type="number" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="Amount (₹) *" className={inp} />
              <select value={fType} onChange={e => setFType(e.target.value as "received"|"paid")} className={inp}>
                <option value="received">Received</option>
                <option value="paid">Paid</option>
              </select>
              <input value={fRef}  onChange={e => setFRef(e.target.value)}   placeholder="UPI ref / UTR" className={inp} />
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className={inp} />
              <input value={fNote} onChange={e => setFNote(e.target.value)}  placeholder="Note" className={`${inp} md:col-span-2`} />
            </div>
            <button onClick={addEntry} className="mt-3 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
          </div>
        )}

        {allEntries.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No UPI transactions found. Transactions tagged "UPI" in notes auto-appear here, or add manually.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["VPA / Party","Amount","Type","UTR / Ref","Date","Note"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allEntries.slice().reverse().map(e => (
                  <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-3"><div className="font-semibold">{e.name || e.vpa}</div><div className="text-xs text-[var(--color-muted)]">{e.vpa !== "-" ? e.vpa : ""}</div></td>
                    <td className={`px-4 py-3 tabular-nums font-semibold ${e.type === "received" ? "text-green-400" : "text-orange-400"}`}>{e.type === "received" ? "+" : "−"}{fc(e.amount)}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${e.type === "received" ? "bg-green-950/30 text-green-400" : "bg-orange-950/30 text-orange-400"}`}>{e.type}</span></td>
                    <td className="px-4 py-3 text-xs font-mono text-[var(--color-muted)]">{e.ref || "-"}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{e.date || "-"}</td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{e.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BankReconStatement() {
  const { store } = useApp();
  type StatementRow = { id: string; date: string; description: string; debit: number; credit: number; matched: boolean };
  const [stmtRows, setStmtRows]   = useState<StatementRow[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [fDate,    setFDate]      = useState("");
  const [fDesc,    setFDesc]      = useState("");
  const [fDebit,   setFDebit]     = useState("");
  const [fCredit,  setFCredit]    = useState("");
  const [openingBal, setOpeningBal] = useState("");

  const addRow = () => {
    if (!fDate || (!fDebit && !fCredit)) return;
    setStmtRows(prev => [...prev, { id: generateId(), date: fDate, description: fDesc, debit: parseFloat(fDebit)||0, credit: parseFloat(fCredit)||0, matched: false }]);
    setFDate(""); setFDesc(""); setFDebit(""); setFCredit(""); setShowForm(false);
  };

  const toggleMatch = (id: string) => setStmtRows(prev => prev.map(r => r.id === id ? { ...r, matched: !r.matched } : r));

  const bookTxns = useMemo(() => store.transactions ?? [], [store.transactions]);

  const opening = parseFloat(openingBal) || 0;
  const stmtClosing = stmtRows.reduce((s, r) => s + r.credit - r.debit, opening);
  const bookBalance = bookTxns.reduce((s, t) => s + t.amount, opening);
  const unmatchedStmt = stmtRows.filter(r => !r.matched).length;
  const difference = stmtClosing - bookBalance;
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Bank Reconciliation Statement</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Opening Balance as per Bank Statement (₹)</label>
            <input type="number" value={openingBal} onChange={e => setOpeningBal(e.target.value)} placeholder="e.g. 500000" className={inp} />
          </div>
          <div className={`rounded-lg p-3 border text-xs ${Math.abs(difference) < 1 ? "border-green-800/40 bg-green-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
            <div className="flex justify-between mb-1"><span className="text-[var(--color-muted)]">Bank Statement Balance</span><span className="font-bold">{fc(stmtClosing)}</span></div>
            <div className="flex justify-between mb-1"><span className="text-[var(--color-muted)]">Book Balance (Headroom)</span><span className="font-bold">{fc(bookBalance)}</span></div>
            <div className={`flex justify-between font-bold ${Math.abs(difference) < 1 ? "text-green-400" : "text-orange-400"}`}>
              <span>Difference</span><span>{fc(Math.abs(difference))} {Math.abs(difference) < 1 ? "✓ Reconciled" : unmatchedStmt > 0 ? `(${unmatchedStmt} unmatched)` : ""}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <CheckCheck size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Bank Statement Entries</span>
          </div>
          <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
            <X size={11} className={showForm ? "" : "rotate-45"} /> {showForm ? "Cancel" : "Add row"}
          </button>
        </div>

        {showForm && (
          <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-accent)]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input type="date" value={fDate}   onChange={e => setFDate(e.target.value)}   className={inp} />
              <input value={fDesc}  onChange={e => setFDesc(e.target.value)}  placeholder="Description *" className={inp} />
              <input type="number" value={fDebit}  onChange={e => setFDebit(e.target.value)}  placeholder="Debit (₹)" className={inp} />
              <input type="number" value={fCredit} onChange={e => setFCredit(e.target.value)} placeholder="Credit (₹)" className={inp} />
            </div>
            <button onClick={addRow} className="mt-3 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Add</button>
          </div>
        )}

        {stmtRows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">Enter your bank statement rows to reconcile against Headroom book entries. Mark matched items to identify timing differences.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Date","Description","Debit","Credit","Matched",""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stmtRows.map(r => (
                  <tr key={r.id} className={`border-b border-[var(--color-border)] last:border-0 ${r.matched ? "opacity-50" : "hover:bg-[var(--color-accent)]"}`}>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{r.date}</td>
                    <td className="px-4 py-3">{r.description}</td>
                    <td className="px-4 py-3 tabular-nums text-red-400">{r.debit > 0 ? fc(r.debit) : "-"}</td>
                    <td className="px-4 py-3 tabular-nums text-green-400">{r.credit > 0 ? fc(r.credit) : "-"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleMatch(r.id)} className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.matched ? "bg-green-950/30 text-green-400" : "bg-[var(--color-accent)] text-[var(--color-muted)] border border-[var(--color-border)]"}`}>
                        {r.matched ? "✓ Matched" : "Unmatched"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setStmtRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-bold">Closing Balance</td>
                  <td className="px-4 py-2.5 tabular-nums font-bold text-red-400">{fc(stmtRows.reduce((s,r)=>s+r.debit,0))}</td>
                  <td className="px-4 py-2.5 tabular-nums font-bold text-green-400">{fc(stmtRows.reduce((s,r)=>s+r.credit,0))}</td>
                  <td colSpan={2} className="px-4 py-2.5 tabular-nums font-bold">{fc(stmtClosing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Mark items as matched once verified in both bank statement and books. Unmatched items = timing differences (outstanding cheques, deposits in transit) or errors requiring investigation.</p>
    </div>
  );
}

function RecurringTemplates() {
  type Freq = "monthly" | "quarterly" | "annual";
  type Template = { id: string; description: string; amount: number; direction: "income" | "expense"; category: string; frequency: Freq; nextDate: string; counterparty: string; active: boolean };
  const [templates, setTemplates] = useFeatureState<Template[]>("recurring-templates", []);
  const [showForm, setShowForm] = useState(false);
  const [fDesc, setFDesc] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fDir, setFDir] = useState<"income" | "expense">("expense");
  const [fCat, setFCat] = useState("expense");
  const [fFreq, setFFreq] = useState<Freq>("monthly");
  const [fNext, setFNext] = useState("");
  const [fParty, setFParty] = useState("");

  const CATEGORIES = ["revenue", "expense", "payroll", "loan", "tax"];
  const monthsOf = (f: Freq) => f === "monthly" ? 1 : f === "quarterly" ? 3 : 12;
  const monthlyEquiv = (t: Template) => t.amount / monthsOf(t.frequency);

  const addTemplate = () => {
    if (!fDesc || !fAmount) return;
    setTemplates(prev => [...prev, { id: generateId(), description: fDesc, amount: parseFloat(fAmount) || 0, direction: fDir, category: fCat, frequency: fFreq, nextDate: fNext || new Date().toISOString().slice(0, 10), counterparty: fParty, active: true }]);
    setFDesc(""); setFAmount(""); setFParty(""); setFNext(""); setShowForm(false);
  };
  const toggle = (id: string) => setTemplates(prev => prev.map(t => t.id === id ? { ...t, active: !t.active } : t));

  const active = templates.filter(t => t.active);
  const monthlyIncome = active.filter(t => t.direction === "income").reduce((s, t) => s + monthlyEquiv(t), 0);
  const monthlyExpense = active.filter(t => t.direction === "expense").reduce((s, t) => s + monthlyEquiv(t), 0);
  const netMonthly = monthlyIncome - monthlyExpense;

  // Upcoming occurrences in next 90 days
  const today = new Date();
  const horizon = new Date(today.getTime() + 90 * 86400000);
  const upcoming: { date: Date; description: string; signed: number }[] = [];
  for (const t of active) {
    let d = new Date(t.nextDate);
    if (isNaN(d.getTime())) continue;
    let guard = 0;
    while (d <= horizon && guard < 12) {
      if (d >= today) upcoming.push({ date: new Date(d), description: t.description, signed: t.direction === "income" ? t.amount : -t.amount });
      d = new Date(d.getFullYear(), d.getMonth() + monthsOf(t.frequency), d.getDate());
      guard++;
    }
  }
  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());

  const fc = formatCurrency;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Monthly Recurring Income", value: fc(monthlyIncome), color: "text-green-400" },
          { label: "Monthly Recurring Expense", value: fc(monthlyExpense), color: "text-red-400" },
          { label: "Net Monthly Recurring", value: fc(netMonthly), color: netMonthly >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Active Templates", value: active.length.toString(), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Repeat size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Recurring Templates</span>
          </div>
          <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
            <Repeat size={11} /> Add template
          </button>
        </div>

        {showForm && (
          <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Description *" className={inp} />
              <input type="number" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="Amount (₹) *" className={inp} />
              <select value={fDir} onChange={e => setFDir(e.target.value as "income" | "expense")} className={inp}>
                <option value="expense">Expense</option><option value="income">Income</option>
              </select>
              <select value={fCat} onChange={e => setFCat(e.target.value)} className={inp}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={fFreq} onChange={e => setFFreq(e.target.value as Freq)} className={inp}>
                <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
              </select>
              <div><label className="text-[10px] text-[var(--color-muted)] block">Next date</label><input type="date" value={fNext} onChange={e => setFNext(e.target.value)} className={inp} /></div>
              <input value={fParty} onChange={e => setFParty(e.target.value)} placeholder="Counterparty" className={`${inp} md:col-span-2`} />
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={addTemplate} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
              <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
            </div>
          </div>
        )}

        {templates.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No recurring templates. Add recurring rent, salaries, subscriptions, or retainer income to plan your cash flow.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Description", "Counterparty", "Category", "Amount", "Frequency", "Next", "Monthly Equiv", "Active", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} className={`border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface)] ${!t.active ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2.5 font-medium">
                      {t.description}
                      <span className={`ml-2 text-[9px] px-1 py-0.5 rounded ${t.direction === "income" ? "text-green-400 bg-green-950/30" : "text-red-400 bg-red-950/30"}`}>{t.direction}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{t.counterparty || "-"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{t.category}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fc(t.amount)}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] capitalize">{t.frequency}</td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{t.nextDate}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fc(monthlyEquiv(t))}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggle(t.id)} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.active ? "bg-green-950/30 text-green-400" : "bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)]"}`}>{t.active ? "Active" : "Paused"}</button>
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => setTemplates(prev => prev.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-sm font-semibold mb-3">Upcoming (next 90 days)</p>
          <div className="space-y-1.5">
            {upcoming.slice(0, 20).map((u, i) => (
              <div key={i} className="flex items-center justify-between text-xs border-b border-[var(--color-border)] last:border-0 pb-1.5">
                <span className="text-[var(--color-muted)] w-24">{format(u.date, "dd MMM yyyy")}</span>
                <span className="flex-1">{u.description}</span>
                <span className={`tabular-nums font-semibold ${u.signed >= 0 ? "text-green-400" : "text-red-400"}`}>{u.signed >= 0 ? "+" : "−"}{fc(Math.abs(u.signed))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Templates are for cash-flow planning only and are not booked to the ledger automatically. Monthly equivalent: monthly = amount, quarterly = amount/3, annual = amount/12.</p>
    </div>
  );
}

// ── #186 AUTO-CATEGORISATION RULES ENGINE ───────────────────────────────────
// Build payee/amount rules → preview the transactions each would re-classify.
function CategorisationRulesEngine() {
  const { store } = useApp();
  type Field = "counterparty" | "description";
  type Op = "contains" | "equals";
  type Rule = { id: string; field: Field; op: Op; needle: string; minAmount: string; maxAmount: string; category: Transaction["category"] };
  const [rules, setRules] = useFeatureState<Rule[]>("txn-cat-rules", []);
  const [field, setField]   = useState<Field>("counterparty");
  const [op, setOp]         = useState<Op>("contains");
  const [needle, setNeedle] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [cat, setCat]       = useState<Transaction["category"]>("expense");

  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const matchesRule = useCallback((r: Rule, t: Transaction) => {
    const hay = (r.field === "counterparty" ? t.counterparty : t.description).toLowerCase();
    const n = r.needle.toLowerCase();
    const textOk = r.op === "equals" ? hay === n : hay.includes(n);
    const abs = Math.abs(t.amount);
    const lo = parseFloat(r.minAmount); const hi = parseFloat(r.maxAmount);
    const loOk = isNaN(lo) || abs >= lo;
    const hiOk = isNaN(hi) || abs <= hi;
    return r.needle !== "" && textOk && loOk && hiOk;
  }, []);

  const addRule = () => {
    if (!needle.trim()) { toast.error("Enter text to match on payee/description"); return; }
    setRules(prev => [...prev, { id: generateId(), field, op, needle: needle.trim(), minAmount: minAmt, maxAmount: maxAmt, category: cat }]);
    setNeedle(""); setMinAmt(""); setMaxAmt("");
    toast.success("Rule added");
  };
  const removeRule = (id: string) => setRules(prev => prev.filter(r => r.id !== id));

  // First-match-wins evaluation across the ledger (preview only - does not write).
  const preview = useMemo(() => {
    return txns.map(t => {
      const hit = rules.find(r => matchesRule(r, t));
      return hit && hit.category !== t.category ? { t, to: hit.category } : null;
    }).filter((x): x is { t: Transaction; to: Transaction["category"] } => x !== null);
  }, [txns, rules, matchesRule]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><Wand2 size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Auto-Categorisation Rules</h3></div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <select value={field} onChange={e => setField(e.target.value as Field)} className={inp}>
            <option value="counterparty">Payee</option><option value="description">Description</option>
          </select>
          <select value={op} onChange={e => setOp(e.target.value as Op)} className={inp}>
            <option value="contains">contains</option><option value="equals">equals</option>
          </select>
          <input value={needle} onChange={e => setNeedle(e.target.value)} placeholder="Text to match" className={`${inp} md:col-span-2`} />
          <input type="number" value={minAmt} onChange={e => setMinAmt(e.target.value)} placeholder="Min ₹" className={inp} />
          <input type="number" value={maxAmt} onChange={e => setMaxAmt(e.target.value)} placeholder="Max ₹" className={inp} />
          <select value={cat} onChange={e => setCat(e.target.value as Transaction["category"])} className={`${inp} md:col-span-2`}>
            {CATEGORIES.map(c => <option key={c} value={c}>→ {c}</option>)}
          </select>
          <button onClick={addRule} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 md:col-span-2">+ Add rule</button>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Rules are evaluated top-to-bottom; the first match decides the category. Amount bounds compare absolute value.</p>
      </div>

      {rules.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Field","Match","Value","Amount range","Category",""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-2.5 capitalize">{r.field === "counterparty" ? "Payee" : "Description"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.op}</td>
                  <td className="px-4 py-2.5 font-medium">{r.needle}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.minAmount || maxLabel(r.maxAmount) ? `${r.minAmount ? fc(parseFloat(r.minAmount)) : "0"} - ${r.maxAmount ? fc(parseFloat(r.maxAmount)) : "∞"}` : "any"}</td>
                  <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded border ${CAT_COLOR[r.category]}`}>{r.category}</span></td>
                  <td className="px-4 py-2.5"><button onClick={() => removeRule(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-sm font-semibold mb-2">Would re-classify <span className="text-[var(--color-primary)]">{preview.length}</span> transaction{preview.length !== 1 ? "s" : ""}</p>
        {preview.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No transactions match your rules (or they already carry the target category). Add rules above to preview.</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {preview.slice(0, 100).map(({ t, to }) => (
              <div key={t.id} className="flex items-center justify-between text-xs border-b border-[var(--color-border)] last:border-0 pb-1.5">
                <span className="flex-1 truncate">{t.date} · {t.description}{t.counterparty ? ` · ${t.counterparty}` : ""}</span>
                <span className="flex items-center gap-1 shrink-0"><span className={`text-[9px] px-1.5 py-0.5 rounded border ${CAT_COLOR[t.category]}`}>{t.category}</span>→<span className={`text-[9px] px-1.5 py-0.5 rounded border ${CAT_COLOR[to]}`}>{to}</span></span>
                <span className="tabular-nums font-semibold w-24 text-right">{fc(Math.abs(t.amount))}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Preview only - review changes here, then apply categories on the main Transactions table or via Bulk Tag.</p>
      </div>
    </div>
  );
}
function maxLabel(v: string) { return v !== ""; }

// ── #187 BANK RECONCILIATION WORKBENCH ──────────────────────────────────────
// Paste/enter bank lines, auto-match to book txns by amount+date proximity,
// clear the unmatched ones manually.
function ReconciliationWorkbench() {
  const { store } = useApp();
  type BankLine = { id: string; date: string; amount: string; narration: string };
  const [lines, setLines] = useState<BankLine[]>([]);
  const [bDate, setBDate] = useState("");
  const [bAmt, setBAmt]   = useState("");
  const [bNar, setBNar]   = useState("");
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const addLine = () => {
    if (!bDate || !bAmt) { toast.error("Date and amount required"); return; }
    setLines(prev => [...prev, { id: generateId(), date: bDate, amount: bAmt, narration: bNar }]);
    setBDate(""); setBAmt(""); setBNar("");
  };

  // Match: same signed amount and date within 3 days. One book txn per bank line.
  const matched = useMemo(() => {
    const usedBook = new Set<string>();
    const out: Record<string, Transaction | null> = {};
    for (const l of lines) {
      const amt = parseFloat(l.amount);
      const ld = new Date(l.date).getTime();
      const hit = txns.find(t => !usedBook.has(t.id) && Math.abs(t.amount - amt) < 0.5 &&
        Math.abs(new Date(t.date).getTime() - ld) <= 3 * 86400000);
      if (hit) usedBook.add(hit.id);
      out[l.id] = hit ?? null;
    }
    return out;
  }, [lines, txns]);

  const matchedBookIds = useMemo(() => new Set(Object.values(matched).filter(Boolean).map(t => (t as Transaction).id)), [matched]);
  const unmatchedLines = lines.filter(l => !matched[l.id] && !cleared.has(l.id));
  const unmatchedBook  = txns.filter(t => !matchedBookIds.has(t.id));
  const toggleClear = (id: string) => setCleared(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Bank lines", value: lines.length.toString(), color: "text-[var(--color-text)]" },
          { label: "Auto-matched", value: Object.values(matched).filter(Boolean).length.toString(), color: "text-green-400" },
          { label: "Unmatched (bank)", value: unmatchedLines.length.toString(), color: unmatchedLines.length ? "text-orange-400" : "text-green-400" },
          { label: "Book txns w/o bank line", value: unmatchedBook.length.toString(), color: unmatchedBook.length ? "text-yellow-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><GitCompareArrows size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Add Bank Statement Line</h3></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input type="date" value={bDate} onChange={e => setBDate(e.target.value)} className={inp} />
          <input type="number" value={bAmt} onChange={e => setBAmt(e.target.value)} placeholder="Amount ± (₹)" className={inp} />
          <input value={bNar} onChange={e => setBNar(e.target.value)} placeholder="Narration" className={inp} />
          <button onClick={addLine} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add line</button>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Use a negative amount for debits/payments. Lines auto-match a book transaction with the same amount within ±3 days.</p>
      </div>

      {lines.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Bank date","Amount","Narration","Match status","Matched book txn",""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
            <tbody>
              {lines.map(l => {
                const m = matched[l.id];
                const isCleared = cleared.has(l.id);
                return (
                  <tr key={l.id} className={`border-b border-[var(--color-border)] last:border-0 ${m || isCleared ? "opacity-60" : "hover:bg-[var(--color-accent)]"}`}>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{l.date}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-semibold ${parseFloat(l.amount) >= 0 ? "text-green-400" : "text-red-400"}`}>{fc(parseFloat(l.amount) || 0)}</td>
                    <td className="px-4 py-2.5 text-xs">{l.narration || "-"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${m ? "bg-green-950/30 text-green-400" : isCleared ? "bg-blue-950/30 text-blue-400" : "bg-orange-950/30 text-orange-400"}`}>{m ? "Auto-matched" : isCleared ? "Cleared" : "Unmatched"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{m ? `${m.description} (${m.date})` : "-"}</td>
                    <td className="px-4 py-2.5">{!m && <button onClick={() => toggleClear(l.id)} className="text-[9px] border border-[var(--color-border)] text-[var(--color-muted)] px-2 py-0.5 rounded hover:text-[var(--color-text)]">{isCleared ? "Reopen" : "Clear"}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {unmatchedBook.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-sm font-semibold mb-2 text-yellow-400">Book transactions with no bank line ({unmatchedBook.length})</p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {unmatchedBook.slice(0, 100).map(t => (
              <div key={t.id} className="flex items-center justify-between text-xs border-b border-[var(--color-border)] last:border-0 pb-1">
                <span className="flex-1 truncate">{t.date} · {t.description}</span>
                <span className={`tabular-nums font-semibold ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>{fc(t.amount)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-2">These are deposits-in-transit / outstanding cheques, or items still to appear on the bank feed.</p>
        </div>
      )}
    </div>
  );
}

// ── #188 SPLIT-TRANSACTION TOOL ─────────────────────────────────────────────
// Take one payment and split it across multiple categories/heads.
function SplitTransactionTool() {
  const { store } = useApp();
  type Leg = { id: string; category: Transaction["category"]; label: string; amount: string };
  const [txnId, setTxnId] = useState("");
  const [legs, setLegs] = useState<Leg[]>([{ id: generateId(), category: "expense", label: "", amount: "" }]);

  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const selected = txns.find(t => t.id === txnId) ?? null;
  const total = selected ? Math.abs(selected.amount) : 0;
  const allocated = legs.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const remaining = total - allocated;
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const addLeg = () => setLegs(prev => [...prev, { id: generateId(), category: "expense", label: "", amount: "" }]);
  const updateLeg = (id: string, patch: Partial<Leg>) => setLegs(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  const removeLeg = (id: string) => setLegs(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  const splitEqually = () => {
    if (!selected || legs.length === 0) return;
    const each = Math.round((total / legs.length) * 100) / 100;
    setLegs(prev => prev.map((l, i) => ({ ...l, amount: String(i === prev.length - 1 ? Math.round((total - each * (prev.length - 1)) * 100) / 100 : each) })));
    toast.success("Split equally");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><Split size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Split a Transaction Across Heads</h3></div>
        <label className="text-xs text-[var(--color-muted)] block mb-1">Pick a transaction</label>
        <select value={txnId} onChange={e => setTxnId(e.target.value)} className={inp}>
          <option value="">- select -</option>
          {txns.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200).map(t => (
            <option key={t.id} value={t.id}>{t.date} · {t.description} · {fc(t.amount)}</option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total to split", value: fc(total), color: "text-[var(--color-text)]" },
              { label: "Allocated", value: fc(allocated), color: "text-[var(--color-primary)]" },
              { label: "Remaining", value: fc(remaining), color: Math.abs(remaining) < 0.5 ? "text-green-400" : remaining < 0 ? "text-red-400" : "text-orange-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
            {legs.map(l => (
              <div key={l.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                <select value={l.category} onChange={e => updateLeg(l.id, { category: e.target.value as Transaction["category"] })} className={`${inp} md:col-span-3`}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={l.label} onChange={e => updateLeg(l.id, { label: e.target.value })} placeholder="Head / memo" className={`${inp} md:col-span-5`} />
                <input type="number" value={l.amount} onChange={e => updateLeg(l.id, { amount: e.target.value })} placeholder="Amount ₹" className={`${inp} md:col-span-3`} />
                <button onClick={() => removeLeg(l.id)} className="text-[var(--color-muted)] hover:text-red-400 md:col-span-1 justify-self-end"><X size={14} /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={addLeg} className="text-xs border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)]">+ Add split</button>
              <button onClick={splitEqually} className="text-xs border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)]">Split equally</button>
            </div>
            <div className={`rounded-lg p-3 border text-xs ${Math.abs(remaining) < 0.5 ? "border-green-800/40 bg-green-950/20 text-green-400" : "border-orange-800/40 bg-orange-950/20 text-orange-400"}`}>
              {Math.abs(remaining) < 0.5 ? "✓ Splits balance to the transaction total." : `Splits are off by ${fc(Math.abs(remaining))} - adjust the legs to balance.`}
            </div>
          </div>
        </>
      )}
      {!selected && <p className="text-xs text-[var(--color-muted)]">Select a transaction to break it into multiple expense / project heads.</p>}
    </div>
  );
}

// ── #189 BULK EDIT / TAGGING ────────────────────────────────────────────────
// Filter the ledger, select many, re-categorise in one shot.
function BulkTaggingTool() {
  const { store, updateTransaction } = useApp();
  const [q, setQ] = useState("");
  const [fromCat, setFromCat] = useState<string>("all");
  const [toCat, setToCat] = useState<Transaction["category"]>("expense");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const filtered = useMemo(() => txns.filter(t => {
    const qOk = !q || t.description.toLowerCase().includes(q.toLowerCase()) || t.counterparty.toLowerCase().includes(q.toLowerCase());
    const cOk = fromCat === "all" || t.category === fromCat;
    return qOk && cOk;
  }), [txns, q, fromCat]);

  const allSel = filtered.length > 0 && filtered.every(t => sel.has(t.id));
  const toggleAll = () => setSel(allSel ? new Set() : new Set(filtered.map(t => t.id)));
  const toggle = (id: string) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const apply = () => {
    let count = 0;
    txns.forEach(t => { if (sel.has(t.id) && t.category !== toCat) { updateTransaction({ ...t, category: toCat }); count++; } });
    toast.success(`Re-categorised ${count} transaction${count !== 1 ? "s" : ""} → ${toCat}`);
    setSel(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><Layers size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Bulk Edit / Tagging</h3></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search payee / description" className={`${inp} md:col-span-2`} />
          <select value={fromCat} onChange={e => setFromCat(e.target.value)} className={inp}>
            <option value="all">From: all categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>From: {c}</option>)}
          </select>
          <select value={toCat} onChange={e => setToCat(e.target.value as Transaction["category"])} className={inp}>
            {CATEGORIES.map(c => <option key={c} value={c}>To: {c}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-[var(--color-muted)]">{filtered.length} match filter · {sel.size} selected</span>
          <button onClick={apply} disabled={sel.size === 0} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40">Apply → {toCat} ({sel.size})</button>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead><tr className="border-b border-[var(--color-border)]">
            <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allSel} onChange={toggleAll} className="accent-[var(--color-primary)] cursor-pointer" /></th>
            {["Date","Description","Category","Amount"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5">{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.slice(0, 300).map(t => (
              <tr key={t.id} className={`border-b border-[var(--color-border)] last:border-0 ${sel.has(t.id) ? "bg-[var(--color-primary)]/5" : "hover:bg-[var(--color-accent)]"}`}>
                <td className="px-3 py-2"><input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} className="accent-[var(--color-primary)] cursor-pointer" /></td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted)] tabular-nums">{t.date}</td>
                <td className="px-3 py-2"><span className="font-medium">{t.description}</span>{t.counterparty && <span className="text-[var(--color-muted)] text-xs"> · {t.counterparty}</span>}</td>
                <td className="px-3 py-2"><span className={`text-[9px] px-1.5 py-0.5 rounded border ${CAT_COLOR[t.category]}`}>{t.category}</span></td>
                <td className="px-3 py-2 tabular-nums text-right font-semibold">{fc(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="p-8 text-sm text-[var(--color-muted)] text-center">No transactions match this filter.</p>}
      </div>
    </div>
  );
}

// ── #190 INTER-ACCOUNT TRANSFER DETECTION ───────────────────────────────────
// Find offsetting debit/credit pairs (self-transfers) so they aren't double
// counted in revenue/spend.
function TransferDetection() {
  const { store, updateTransaction } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;

  // Pair an outflow with an inflow of the same magnitude, opposite sign,
  // within 2 days, across different bank accounts.
  const pairs = useMemo(() => {
    const out: { debit: Transaction; credit: Transaction }[] = [];
    const used = new Set<string>();
    const debits = txns.filter(t => t.amount < 0);
    const credits = txns.filter(t => t.amount > 0);
    for (const d of debits) {
      if (used.has(d.id)) continue;
      const c = credits.find(c =>
        !used.has(c.id) &&
        Math.abs(c.amount + d.amount) < 0.5 &&
        c.bankAccountId !== d.bankAccountId &&
        Math.abs(new Date(c.date).getTime() - new Date(d.date).getTime()) <= 2 * 86400000);
      if (c) { out.push({ debit: d, credit: c }); used.add(d.id); used.add(c.id); }
    }
    return out;
  }, [txns]);

  const acctName = (id: string) => store.bankAccounts.find(a => a.id === id)?.name ?? "-";
  const netAmount = pairs.reduce((s, p) => s + Math.abs(p.debit.amount), 0);

  const markTransfer = (p: { debit: Transaction; credit: Transaction }) => {
    if (p.debit.category !== "transfer") updateTransaction({ ...p.debit, category: "transfer" });
    if (p.credit.category !== "transfer") updateTransaction({ ...p.credit, category: "transfer" });
    toast.success("Both legs tagged as transfer (excluded from revenue/spend)");
  };
  const markAll = () => { pairs.forEach(markTransfer); toast.success(`Tagged ${pairs.length} transfer pair${pairs.length !== 1 ? "s" : ""}`); };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Suspected transfer pairs", value: pairs.length.toString(), color: pairs.length ? "text-orange-400" : "text-green-400" },
          { label: "Gross value moved", value: fc(netAmount), color: "text-[var(--color-text)]" },
          { label: "Already tagged transfer", value: pairs.filter(p => p.debit.category === "transfer" && p.credit.category === "transfer").length.toString(), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2"><ArrowLeftRight size={14} className="text-[var(--color-primary)]" /><span className="text-sm font-semibold">Detected Self-Transfers</span></div>
          {pairs.length > 0 && <button onClick={markAll} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">Tag all as transfer</button>}
        </div>
        {pairs.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No offsetting debit/credit pairs found across your accounts. Self-transfers show up as a matched payment-out and receipt-in within 2 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Out (from)","In (to)","Amount","Dates","Status",""].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
              <tbody>
                {pairs.map(p => {
                  const done = p.debit.category === "transfer" && p.credit.category === "transfer";
                  return (
                    <tr key={p.debit.id + p.credit.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                      <td className="px-4 py-2.5 text-xs">{acctName(p.debit.bankAccountId)}<div className="text-[var(--color-muted)]">{p.debit.description}</div></td>
                      <td className="px-4 py-2.5 text-xs">{acctName(p.credit.bankAccountId)}<div className="text-[var(--color-muted)]">{p.credit.description}</div></td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold">{fc(Math.abs(p.debit.amount))}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] tabular-nums">{p.debit.date} → {p.credit.date}</td>
                      <td className="px-4 py-2.5">{done ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-950/30 text-green-400">Tagged</span> : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-950/30 text-orange-400">Counted twice</span>}</td>
                      <td className="px-4 py-2.5">{!done && <button onClick={() => markTransfer(p)} className="text-[9px] border border-[var(--color-border)] text-[var(--color-muted)] px-2 py-0.5 rounded hover:text-[var(--color-text)]">Tag</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Tagging both legs as "transfer" nets them out of revenue and spend totals so moving money between your own accounts isn't double-counted.</p>
    </div>
  );
}

// ── #191 PROJECT / COST-CENTER TAGGING ──────────────────────────────────────
// Assign txns to projects/cost-centres, then read a P&L per project.
function CostCenterTagging() {
  const { store } = useApp();
  type Assign = Record<string, string>; // txnId -> projectId
  const [projects, setProjects] = useFeatureState<{ id: string; name: string }[]>("txn-cost-centers", []);
  const [assign, setAssign] = useFeatureState<Assign>("txn-cost-center-map", {});
  const [name, setName] = useState("");

  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const addProject = () => {
    if (!name.trim()) return;
    setProjects(prev => [...prev, { id: generateId(), name: name.trim() }]);
    setName("");
  };
  const setTxnProject = (txnId: string, projectId: string) => setAssign(prev => {
    const next = { ...prev };
    if (projectId) next[txnId] = projectId; else delete next[txnId];
    return next;
  });

  // P&L per project: revenue (positive) vs cost (negative) of assigned txns.
  const pnl = useMemo(() => {
    const acc: Record<string, { rev: number; cost: number }> = {};
    projects.forEach(p => { acc[p.id] = { rev: 0, cost: 0 }; });
    txns.forEach(t => {
      const pid = assign[t.id];
      if (pid && acc[pid]) { if (t.amount >= 0) acc[pid].rev += t.amount; else acc[pid].cost += Math.abs(t.amount); }
    });
    return acc;
  }, [projects, assign, txns]);

  const projName = (id?: string) => projects.find(p => p.id === id)?.name ?? "";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><FolderTree size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Projects / Cost Centres</h3></div>
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="New project / job / cost-centre name" className={inp} />
          <button onClick={addProject} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 shrink-0">+ Add</button>
        </div>
      </div>

      {projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {projects.map(p => {
            const r = pnl[p.id] ?? { rev: 0, cost: 0 };
            const net = r.rev - r.cost;
            return (
              <div key={p.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <button onClick={() => { setProjects(prev => prev.filter(x => x.id !== p.id)); setAssign(prev => { const n = { ...prev }; Object.keys(n).forEach(k => { if (n[k] === p.id) delete n[k]; }); return n; }); }} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                </div>
                <div className="space-y-0.5 text-xs">
                  <div className="flex justify-between"><span className="text-[var(--color-muted)]">Revenue</span><span className="text-green-400 tabular-nums">{fc(r.rev)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--color-muted)]">Cost</span><span className="text-red-400 tabular-nums">{fc(r.cost)}</span></div>
                  <div className="flex justify-between font-semibold border-t border-[var(--color-border)] pt-0.5 mt-0.5"><span>Net P&amp;L</span><span className={`tabular-nums ${net >= 0 ? "text-green-400" : "text-red-400"}`}>{fc(net)}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Date","Description","Amount","Project / Cost-centre"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {txns.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300).map(t => (
              <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-3 py-2 text-xs text-[var(--color-muted)] tabular-nums">{t.date}</td>
                <td className="px-3 py-2"><span className="font-medium">{t.description}</span>{assign[t.id] && <span className="ml-2 text-[9px] px-1 py-0.5 rounded bg-[var(--color-primary)]/15 text-[var(--color-primary)]">{projName(assign[t.id])}</span>}</td>
                <td className={`px-3 py-2 tabular-nums font-semibold ${t.amount >= 0 ? "text-green-400" : "text-[var(--color-text)]"}`}>{fc(t.amount)}</td>
                <td className="px-3 py-2">
                  <select value={assign[t.id] ?? ""} onChange={e => setTxnProject(t.id, e.target.value)} disabled={projects.length === 0}
                    className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-0.5 outline-none disabled:opacity-50">
                    <option value="">- unassigned -</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {projects.length === 0 && <p className="p-6 text-xs text-[var(--color-muted)] text-center">Add a project above to start tagging transactions.</p>}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Assignments are saved and synced across devices. P&amp;L per project = revenue (inflows) minus cost (outflows) of assigned transactions.</p>
    </div>
  );
}

// ── #192 CASH vs ACCRUAL TOGGLE ─────────────────────────────────────────────
// View the period P&L on a cash basis (booked txns) or accrual basis
// (cash adjusted for open invoices/bills awaiting settlement).
function CashAccrualToggle() {
  const { store } = useApp();
  type Basis = "cash" | "accrual";
  const [basis, setBasis] = useState<Basis>("cash");
  const [months, setMonths] = useState<3 | 6 | 12>(6);

  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const invoices = useMemo(() => store.invoices ?? [], [store.invoices]);
  const fc = formatCurrency;

  const cutoff = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
  }, [months]);

  // Cash basis: actual inflows/outflows in the window.
  const cashRev = useMemo(() => txns.filter(t => t.amount > 0 && t.category === "revenue" && t.date >= cutoff).reduce((s, t) => s + t.amount, 0), [txns, cutoff]);
  const cashExp = useMemo(() => txns.filter(t => t.amount < 0 && t.date >= cutoff).reduce((s, t) => s + Math.abs(t.amount), 0), [txns, cutoff]);

  // Accrual adjustment: add unpaid invoiced revenue (earned, not yet received).
  const openInvoiced = useMemo(() => invoices
    .filter(i => i.status !== "paid" && (i.invoiceDate ?? "") >= cutoff)
    .reduce((s, i) => s + (i.amount ?? 0), 0), [invoices, cutoff]);

  const accrualRev = cashRev + openInvoiced;
  const rev = basis === "cash" ? cashRev : accrualRev;
  const exp = cashExp; // expense accrual would need open bills; cash expenses shown on both
  const net = rev - exp;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><Scale size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Cash vs Accrual P&amp;L</h3></div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            {(["cash", "accrual"] as const).map(b => (
              <button key={b} onClick={() => setBasis(b)} className={`px-4 py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors ${basis === b ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>{b} basis</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {([3, 6, 12] as const).map(m => (
              <button key={m} onClick={() => setMonths(m)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${months === m ? "bg-[var(--color-accent)] text-[var(--color-text)] border-[var(--color-primary)]/40" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>{m}M</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: `Revenue (${basis})`, value: fc(rev), color: "text-green-400" },
          { label: "Expenses", value: fc(exp), color: "text-red-400" },
          { label: `Net (${basis})`, value: fc(net), color: net >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Accrual adjustment", value: fc(openInvoiced), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Particulars", "Cash basis", "Accrual basis"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Revenue received (cash)", c: cashRev, a: cashRev },
              { label: "Add: unpaid invoiced revenue", c: 0, a: openInvoiced },
              { label: "Total revenue", c: cashRev, a: accrualRev, bold: true },
              { label: "Less: expenses paid", c: -cashExp, a: -cashExp },
              { label: "Net profit", c: cashRev - cashExp, a: accrualRev - cashExp, bold: true },
            ].map(r => (
              <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.c < 0 ? `(${fc(Math.abs(r.c))})` : fc(r.c)}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.a < 0 ? `(${fc(Math.abs(r.a))})` : fc(r.a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Window: last {months} months. Cash basis counts money actually received/paid; accrual adds revenue you've invoiced but not yet collected. Expense-side accrual (open bills) is not modelled here. Indicative - confirm your method with your CA.</p>
    </div>
  );
}

// ── #193 MANUAL JOURNAL-ENTRY COMPOSER ──────────────────────────────────────
// Compose a balanced double-entry voucher (debits = credits) before posting.
// Stored as durable JV records; does not touch the cash ledger.
function JournalEntryComposer() {
  type Leg = { id: string; account: string; debit: string; credit: string };
  type JV = { id: string; voucherNo: string; date: string; narration: string; legs: { account: string; debit: number; credit: number }[]; total: number };
  const [journals, setJournals] = useFeatureState<JV[]>("txn-manual-journals", []);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState("");
  const [legs, setLegs] = useState<Leg[]>([
    { id: generateId(), account: "", debit: "", credit: "" },
    { id: generateId(), account: "", debit: "", credit: "" },
  ]);
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const totalDr = legs.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCr = legs.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.5 && totalDr > 0;

  const updateLeg = (id: string, patch: Partial<Leg>) => setLegs(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  const addLeg = () => setLegs(prev => [...prev, { id: generateId(), account: "", debit: "", credit: "" }]);
  const removeLeg = (id: string) => setLegs(prev => prev.length > 2 ? prev.filter(l => l.id !== id) : prev);

  const post = () => {
    if (!balanced) { toast.error("Debits must equal credits and be non-zero"); return; }
    if (legs.some(l => !l.account.trim())) { toast.error("Every leg needs an account name"); return; }
    const voucherNo = `JV-${String(journals.length + 1).padStart(4, "0")}`;
    setJournals(prev => [{
      id: generateId(), voucherNo, date, narration,
      legs: legs.map(l => ({ account: l.account.trim(), debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 })),
      total: totalDr,
    }, ...prev]);
    setLegs([{ id: generateId(), account: "", debit: "", credit: "" }, { id: generateId(), account: "", debit: "", credit: "" }]);
    setNarration("");
    toast.success(`${voucherNo} posted · ${fc(totalDr)}`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><NotebookPen size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Manual Journal Voucher</h3></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} /></div>
          <input value={narration} onChange={e => setNarration(e.target.value)} placeholder="Narration / being…" className={`${inp} md:col-span-2 self-end`} />
        </div>
        <div className="space-y-2">
          {legs.map(l => (
            <div key={l.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
              <input value={l.account} onChange={e => updateLeg(l.id, { account: e.target.value })} placeholder="Account / ledger" className={`${inp} md:col-span-6`} />
              <input type="number" value={l.debit} onChange={e => updateLeg(l.id, { debit: e.target.value, credit: "" })} placeholder="Debit ₹" className={`${inp} md:col-span-2`} />
              <input type="number" value={l.credit} onChange={e => updateLeg(l.id, { credit: e.target.value, debit: "" })} placeholder="Credit ₹" className={`${inp} md:col-span-3`} />
              <button onClick={() => removeLeg(l.id)} className="text-[var(--color-muted)] hover:text-red-400 md:col-span-1 justify-self-end"><X size={14} /></button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button onClick={addLeg} className="text-xs border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)]">+ Add line</button>
          <span className="text-xs tabular-nums text-[var(--color-muted)]">Dr {fc(totalDr)} · Cr {fc(totalCr)}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${balanced ? "bg-green-950/30 text-green-400" : "bg-orange-950/30 text-orange-400"}`}>{balanced ? "✓ Balanced" : `Out by ${fc(Math.abs(totalDr - totalCr))}`}</span>
          <button onClick={post} disabled={!balanced} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 ml-auto">Post voucher</button>
        </div>
      </div>

      {journals.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--color-border)] text-sm font-semibold">Posted Journals ({journals.length})</div>
          <div className="divide-y divide-[var(--color-border)]">
            {journals.map(j => (
              <div key={j.id} className="px-5 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-[var(--color-primary)]">{j.voucherNo}</span>
                    <span className="text-[var(--color-muted)]">{j.date}</span>
                    {j.narration && <span className="text-[var(--color-muted)] italic truncate max-w-xs">- {j.narration}</span>}
                  </div>
                  <button onClick={() => setJournals(prev => prev.filter(x => x.id !== j.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {j.legs.map((leg, i) => (
                      <tr key={i}>
                        <td className={`py-0.5 ${leg.credit > 0 ? "pl-8 text-[var(--color-muted)]" : "font-medium"}`}>{leg.account}</td>
                        <td className="py-0.5 text-right tabular-nums w-28">{leg.debit > 0 ? fc(leg.debit) : ""}</td>
                        <td className="py-0.5 text-right tabular-nums w-28">{leg.credit > 0 ? fc(leg.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Manual vouchers for adjustments, depreciation, provisions, and corrections. Each must balance (debits = credits). These are kept as JV records and don't move your cash/bank ledger.</p>
    </div>
  );
}

// ── #194 LIVE TRIAL BALANCE ─────────────────────────────────────────────────
// Re-foots on every posting: each category's net is shown as a debit or credit
// so total debits always equal total credits.
function TrialBalanceView() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;

  // Net per category: positive = inflow (credit-natured income/liability),
  // negative = outflow (debit-natured expense). Plus a Cash/Bank control account
  // that absorbs the net movement so the sheet self-balances.
  const rows = useMemo(() => {
    const net: Record<string, number> = {};
    let cash = 0;
    txns.forEach(t => { net[t.category] = (net[t.category] ?? 0) + t.amount; cash += t.amount; });
    const ledgers = Object.entries(net).map(([cat, v]) => {
      // A positive net (net inflow) lands on the credit side, a negative net
      // (net outflow) on the debit side, so the columns mirror the cash control.
      return { account: cat.charAt(0).toUpperCase() + cat.slice(1), debit: Math.max(0, -v), credit: Math.max(0, v) };
    });
    // Cash & bank control: net of all movements (a debit balance when positive).
    ledgers.unshift({ account: "Cash & Bank (control)", debit: Math.max(0, cash), credit: Math.max(0, -cash) });
    return ledgers;
  }, [txns]);

  const totalDr = rows.reduce((s, r) => s + r.debit, 0);
  const totalCr = rows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDr - totalCr) < 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total Debits", value: fc(totalDr), color: "text-[var(--color-text)]" },
          { label: "Total Credits", value: fc(totalCr), color: "text-[var(--color-text)]" },
          { label: "Tie-out", value: balanced ? "✓ Balanced" : `Off ${fc(Math.abs(totalDr - totalCr))}`, color: balanced ? "text-green-400" : "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--color-border)]"><Calculator size={14} className="text-[var(--color-primary)]" /><span className="text-sm font-semibold">Trial Balance (live)</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Ledger account", "Debit", "Credit"].map(h => <th key={h} className={`px-5 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider ${h === "Ledger account" ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.account} className="hover:bg-[var(--color-accent)]">
                  <td className="px-5 py-2.5 font-medium">{r.account}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{r.debit > 0 ? fc(r.debit) : "-"}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{r.credit > 0 ? fc(r.credit) : "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)] font-bold">
                <td className="px-5 py-2.5">Total</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{fc(totalDr)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{fc(totalCr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A simplified, single-entry-derived trial balance: each category nets to a debit or credit and a Cash & Bank control account absorbs the movement so the sheet ties out. For a full statutory TB, post your opening balances and manual journals first.</p>
    </div>
  );
}

// ── #195 DAY BOOK / CASH BOOK ───────────────────────────────────────────────
// Chronological book of all postings for a chosen day with a running balance.
function DayBook() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const [day, setDay] = useState(() => {
    const dates = (store.transactions ?? []).map(t => t.date).sort();
    return dates.length ? dates[dates.length - 1] : new Date().toISOString().slice(0, 10);
  });
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  // Opening = sum of everything before the chosen day; rows = that day, ordered.
  const opening = useMemo(() => txns.filter(t => t.date < day).reduce((s, t) => s + t.amount, 0), [txns, day]);
  const rows = useMemo(() => txns.filter(t => t.date === day).slice().sort((a, b) => a.id.localeCompare(b.id)), [txns, day]);

  let running = opening;
  const receipts = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const payments = rows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  const closing = opening + receipts - payments;

  const shift = (delta: number) => {
    const d = new Date(day); d.setDate(d.getDate() + delta);
    setDay(d.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><BookOpen size={14} className="text-[var(--color-primary)]" /><span className="text-sm font-semibold">Day Book / Cash Book</span></div>
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"><ChevronLeft size={14} /></button>
          <input type="date" value={day} onChange={e => setDay(e.target.value)} className={inp} />
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"><ChevronRight size={14} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Opening balance", value: fc(opening), color: opening >= 0 ? "text-[var(--color-text)]" : "text-red-400" },
          { label: "Receipts (Dr)", value: fc(receipts), color: "text-green-400" },
          { label: "Payments (Cr)", value: fc(payments), color: "text-red-400" },
          { label: "Closing balance", value: fc(closing), color: closing >= 0 ? "text-green-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">No entries on {day}. Use the arrows or date picker to find a day with postings.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Particulars", "Receipt", "Payment", "Running balance"].map(h => <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider ${h === "Particulars" ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(t => {
                  running += t.amount;
                  return (
                    <tr key={t.id} className="hover:bg-[var(--color-accent)]">
                      <td className="px-4 py-2.5"><span className="font-medium">{t.description}</span>{t.counterparty && <span className="text-[var(--color-muted)] text-xs"> · {t.counterparty}</span>}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{t.amount > 0 ? fc(t.amount) : "-"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-400">{t.amount < 0 ? fc(Math.abs(t.amount)) : "-"}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${running >= 0 ? "" : "text-red-400"}`}>{fc(running)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A single-day book showing the opening balance carried forward, every receipt and payment, and the running balance after each line.</p>
    </div>
  );
}

// ── #196 PARTY LEDGER ───────────────────────────────────────────────────────
// Per-counterparty statement of account with a running balance.
function PartyLedger() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const [party, setParty] = useState("");
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const parties = useMemo(() => {
    const map: Record<string, number> = {};
    txns.forEach(t => { if (t.counterparty) map[t.counterparty] = (map[t.counterparty] ?? 0) + 1; });
    return Object.keys(map).sort((a, b) => a.localeCompare(b));
  }, [txns]);

  const rows = useMemo(() => party ? txns.filter(t => t.counterparty === party).slice().sort((a, b) => a.date.localeCompare(b.date)) : [], [txns, party]);
  const totalDebit = rows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  const totalCredit = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const closing = totalCredit - totalDebit;
  let running = 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><BookText size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Party / Counterparty Ledger</h3></div>
        <label className="text-xs text-[var(--color-muted)] block mb-1">Select a party</label>
        <select value={party} onChange={e => setParty(e.target.value)} className={inp}>
          <option value="">- select counterparty -</option>
          {parties.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {party && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total received", value: fc(totalCredit), color: "text-green-400" },
              { label: "Total paid", value: fc(totalDebit), color: "text-red-400" },
              { label: "Net balance", value: fc(closing), color: closing >= 0 ? "text-green-400" : "text-red-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Date", "Particulars", "Debit", "Credit", "Balance"].map(h => <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider ${h === "Date" || h === "Particulars" ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(t => {
                  running += t.amount;
                  return (
                    <tr key={t.id} className="hover:bg-[var(--color-accent)]">
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] tabular-nums whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-2.5"><span className="font-medium">{t.description}</span><span className={`ml-2 text-[9px] px-1 py-0.5 rounded border ${CAT_COLOR[t.category]}`}>{t.category}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-400">{t.amount < 0 ? fc(Math.abs(t.amount)) : "-"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{t.amount > 0 ? fc(t.amount) : "-"}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${running >= 0 ? "" : "text-red-400"}`}>{fc(running)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!party && <p className="text-xs text-[var(--color-muted)]">Pick a counterparty to see their full statement of account with a running balance - handy for sending ledger confirmations.</p>}
    </div>
  );
}

// ── #197 OPENING-BALANCE SETUP ──────────────────────────────────────────────
// Record per-bank-account opening balances at the start of the period and see
// the implied current balance after booked transactions.
function OpeningBalanceSetup() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const accounts = store.bankAccounts;
  const fc = formatCurrency;
  const [openings, setOpenings] = useFeatureState<Record<string, number>>("txn-opening-balances", {});
  const [asOf, setAsOf] = useFeatureState<string>("txn-opening-asof", new Date().toISOString().slice(0, 10));

  const setOpening = (id: string, value: string) => setOpenings(prev => ({ ...prev, [id]: parseFloat(value) || 0 }));

  const movement = useMemo(() => {
    const m: Record<string, number> = {};
    txns.forEach(t => { if (t.date >= asOf) m[t.bankAccountId] = (m[t.bankAccountId] ?? 0) + t.amount; });
    return m;
  }, [txns, asOf]);

  const totalOpening = accounts.reduce((s, a) => s + (openings[a.id] ?? 0), 0);
  const totalCurrent = accounts.reduce((s, a) => s + (openings[a.id] ?? 0) + (movement[a.id] ?? 0), 0);
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] tabular-nums";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /><span className="text-sm font-semibold">Opening Balance Setup</span></div>
          <label className="text-xs text-[var(--color-muted)] ml-auto">Opening as of</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Wallet size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No bank accounts yet. Add an account from the Dashboard, then set its opening balance here.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Account", "Opening balance (₹)", "Movement since", "Current balance"].map(h => <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider ${h === "Account" ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {accounts.map(a => {
                const op = openings[a.id] ?? 0;
                const mv = movement[a.id] ?? 0;
                const cur = op + mv;
                return (
                  <tr key={a.id} className="hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 font-medium">{a.name}</td>
                    <td className="px-4 py-2.5 text-right"><input type="number" value={openings[a.id] ?? ""} onChange={e => setOpening(a.id, e.target.value)} placeholder="0" className={`${inp} text-right max-w-[160px] ml-auto`} /></td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${mv >= 0 ? "text-green-400" : "text-red-400"}`}>{mv >= 0 ? "+" : ""}{fc(mv)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${cur >= 0 ? "" : "text-red-400"}`}>{fc(cur)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)] font-bold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fc(totalOpening)}</td>
                <td className="px-4 py-2.5"></td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fc(totalCurrent)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Enter the balance each account held on your chosen start date (e.g. when migrating from Tally). The current balance adds every booked transaction dated on/after that date. Values are saved and synced.</p>
    </div>
  );
}

// ── #198 WRITE-OFF / BAD-DEBT REGISTER ──────────────────────────────────────
// Record amounts written off (bad debts, short receipts, discounts) against a
// party with a reason; track the cumulative impact.
function WriteOffComposer() {
  const { store } = useApp();
  type Reason = "bad_debt" | "short_receipt" | "discount" | "rounding" | "other";
  type WriteOff = { id: string; date: string; party: string; amount: number; reason: Reason; notes: string };
  const REASONS: Record<Reason, string> = {
    bad_debt: "Bad debt", short_receipt: "Short receipt", discount: "Discount allowed", rounding: "Rounding off", other: "Other",
  };
  const [records, setRecords] = useFeatureState<WriteOff[]>("txn-write-offs", []);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<Reason>("bad_debt");
  const [notes, setNotes] = useState("");
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const parties = useMemo(() => {
    const set = new Set<string>();
    (store.transactions ?? []).forEach(t => { if (t.counterparty) set.add(t.counterparty); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [store.transactions]);

  const add = () => {
    const amt = parseFloat(amount);
    if (!party.trim() || !amt || amt <= 0) { toast.error("Party and a positive amount are required"); return; }
    setRecords(prev => [{ id: generateId(), date, party: party.trim(), amount: amt, reason, notes: notes.trim() }, ...prev]);
    setParty(""); setAmount(""); setNotes("");
    toast.success(`Wrote off ${fc(amt)} · ${REASONS[reason]}`);
  };

  const total = records.reduce((s, r) => s + r.amount, 0);
  const byReason = useMemo(() => {
    const m: Record<string, number> = {};
    records.forEach(r => { m[r.reason] = (m[r.reason] ?? 0) + r.amount; });
    return m;
  }, [records]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total written off", value: fc(total), color: "text-red-400" },
          { label: "Bad debts", value: fc(byReason.bad_debt ?? 0), color: "text-orange-400" },
          { label: "Entries", value: records.length.toString(), color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><Eraser size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Record a Write-Off</h3></div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
          <input value={party} onChange={e => setParty(e.target.value)} placeholder="Party *" list="writeoff-parties" className={inp} />
          <datalist id="writeoff-parties">{parties.map(p => <option key={p} value={p} />)}</datalist>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹) *" className={inp} />
          <select value={reason} onChange={e => setReason(e.target.value as Reason)} className={inp}>
            {(Object.entries(REASONS) as [Reason, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" className={`${inp} md:col-span-2`} />
        </div>
        <button onClick={add} className="mt-3 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Write off</button>
      </div>

      {records.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Eraser size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No write-offs recorded. Use this to track irrecoverable receivables, discounts allowed, and rounding differences.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Date", "Party", "Reason", "Notes", "Amount", ""].map(h => <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] tabular-nums">{r.date}</td>
                  <td className="px-4 py-2.5 font-medium">{r.party}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{REASONS[r.reason]}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)] max-w-[200px] truncate">{r.notes || "-"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-red-400">{fc(r.amount)}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => setRecords(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A register of amounts written off the books - bad debts, short receipts, discounts, and rounding. Discuss bad-debt deductibility and GST credit-note treatment with your CA before claiming.</p>
    </div>
  );
}

// ── #199 PERIOD-LOCK MANAGER ────────────────────────────────────────────────
// Lock accounting periods up to a cut-off date; flag any transactions that fall
// inside a locked period as needing a reversal rather than an edit.
function PeriodLockManager() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const [lockedUpto, setLockedUpto] = useFeatureState<string>("txn-period-lock-upto", "");
  const [draft, setDraft] = useState(lockedUpto);

  const lockedTxns = useMemo(() => lockedUpto ? txns.filter(t => t.date <= lockedUpto) : [], [txns, lockedUpto]);
  const openTxns = useMemo(() => lockedUpto ? txns.filter(t => t.date > lockedUpto) : txns, [txns, lockedUpto]);
  const lockedValue = lockedTxns.reduce((s, t) => s + Math.abs(t.amount), 0);
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const lock = () => {
    if (!draft) { toast.error("Pick a lock-up-to date"); return; }
    setLockedUpto(draft);
    toast.success(`Period locked up to ${draft}`);
  };
  const unlock = () => { setLockedUpto(""); setDraft(""); toast.success("Period lock removed"); };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><Lock size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Period Lock</h3></div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--color-muted)]">Lock all entries up to and including</label>
          <input type="date" value={draft} onChange={e => setDraft(e.target.value)} className={inp} />
          <button onClick={lock} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Lock period</button>
          {lockedUpto && <button onClick={unlock} className="text-xs border border-[var(--color-border)] text-[var(--color-muted)] px-4 py-2 rounded-lg hover:text-[var(--color-text)]">Unlock</button>}
        </div>
      </div>

      <div className={`rounded-lg p-4 border text-sm flex items-center gap-3 ${lockedUpto ? "border-orange-800/40 bg-orange-950/20" : "border-green-800/40 bg-green-950/20"}`}>
        <Lock size={16} className={lockedUpto ? "text-orange-400" : "text-green-400"} />
        {lockedUpto
          ? <span className="text-orange-400 font-medium">Books are locked through <span className="tabular-nums">{lockedUpto}</span>. Entries on or before this date should be corrected with a reversing journal, not edited in place.</span>
          : <span className="text-green-400 font-medium">No period lock is active - all transactions are open for editing.</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Locked entries", value: lockedTxns.length.toString(), color: "text-orange-400" },
          { label: "Value locked", value: fc(lockedValue), color: "text-[var(--color-text)]" },
          { label: "Open entries", value: openTxns.length.toString(), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A soft lock and indicator for closed periods. It marks which entries sit inside a closed period so you and your CA treat post-close changes as reversals with an audit trail, in line with the MCA audit-trail expectation.</p>
    </div>
  );
}

// ── #200 CHART OF ACCOUNTS MANAGER ──────────────────────────────────────────
// Maintain a chart of accounts grouped under the five primary heads, with live
// usage counts mapped from the transaction categories.
function ChartOfAccounts() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  type Group = "asset" | "liability" | "equity" | "income" | "expense";
  type Account = { id: string; code: string; name: string; group: Group };
  const GROUPS: Record<Group, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" };
  // Seed from the transaction categories so the CoA is grounded in real data.
  const seed: Account[] = [
    { id: "seed-cash", code: "1000", name: "Cash & Bank", group: "asset" },
    { id: "seed-rev", code: "4000", name: "Revenue", group: "income" },
    { id: "seed-exp", code: "5000", name: "Expense", group: "expense" },
    { id: "seed-pay", code: "5100", name: "Payroll", group: "expense" },
    { id: "seed-loan", code: "2000", name: "Loan", group: "liability" },
    { id: "seed-tax", code: "2100", name: "Tax payable", group: "liability" },
  ];
  const [accounts, setAccounts] = useFeatureState<Account[]>("txn-chart-of-accounts", seed);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [group, setGroup] = useState<Group>("expense");
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  // Map a transaction category onto its account name for usage stats.
  const catToName: Record<string, string> = { revenue: "Revenue", expense: "Expense", payroll: "Payroll", loan: "Loan", tax: "Tax payable", transfer: "Cash & Bank" };
  const usage = useMemo(() => {
    const m: Record<string, { count: number; value: number }> = {};
    txns.forEach(t => {
      const nm = catToName[t.category] ?? t.category;
      if (!m[nm]) m[nm] = { count: 0, value: 0 };
      m[nm].count += 1; m[nm].value += Math.abs(t.amount);
    });
    return m;
  }, [txns]);

  const add = () => {
    if (!name.trim()) { toast.error("Account name required"); return; }
    setAccounts(prev => [...prev, { id: generateId(), code: code.trim() || "-", name: name.trim(), group }]);
    setCode(""); setName("");
    toast.success(`Added "${name.trim()}" under ${GROUPS[group]}`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><ListTree size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Chart of Accounts</h3></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Code (e.g. 5200)" className={inp} />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Account name *" className={`${inp} md:col-span-2`} />
          <select value={group} onChange={e => setGroup(e.target.value as Group)} className={inp}>
            {(Object.entries(GROUPS) as [Group, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button onClick={add} className="mt-3 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add account</button>
      </div>

      {(Object.keys(GROUPS) as Group[]).map(g => {
        const list = accounts.filter(a => a.group === g);
        if (list.length === 0) return null;
        return (
          <div key={g} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-5 py-2.5 border-b border-[var(--color-border)] text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{GROUPS[g]}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <tbody className="divide-y divide-[var(--color-border)]">
                  {list.map(a => {
                    const u = usage[a.name];
                    return (
                      <tr key={a.id} className="hover:bg-[var(--color-accent)]">
                        <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-muted)] w-20">{a.code}</td>
                        <td className="px-5 py-2.5 font-medium">{a.name}</td>
                        <td className="px-5 py-2.5 text-right text-xs text-[var(--color-muted)] tabular-nums">{u ? `${u.count} txns · ${fc(u.value)}` : "unused"}</td>
                        <td className="px-5 py-2.5 text-right w-10"><button onClick={() => setAccounts(prev => prev.filter(x => x.id !== a.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-[var(--color-muted)]">A starter chart of accounts grouped under the five primary heads. Usage counts are mapped live from your transaction categories so you can see which ledgers are active. Saved and synced across devices.</p>
    </div>
  );
}

// ── #201 GST OUTPUT/INPUT LEDGER ────────────────────────────────────────────
// Back-computes the GST embedded in revenue (output) and expense (input) lines
// at a chosen slab, giving an indicative net GST payable for the period.
function GstLedger() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const [rate, setRate] = useFeatureState<number>("txn-gst-ledger-rate", 18);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const rows = useMemo(() => txns.filter(t => t.date.startsWith(month)), [txns, month]);
  // GST = gross × rate / (100 + rate), since shown amounts are tax-inclusive.
  const factor = rate / (100 + rate);
  const output = useMemo(() => rows.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount), 0) * factor, [rows, factor]);
  const input = useMemo(() => rows.filter(t => t.category === "expense").reduce((s, t) => s + Math.abs(t.amount), 0) * factor, [rows, factor]);
  const net = output - input;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><Percent size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">GST Output / Input Ledger</h3></div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--color-muted)]">Month</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inp} />
          <label className="text-xs text-[var(--color-muted)]">Slab %</label>
          <select value={rate} onChange={e => setRate(Number(e.target.value))} className={inp}>
            {[5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: `Output GST (on revenue, ${rate}%)`, value: fc(output), color: "text-green-400" },
          { label: `Input GST / ITC (on expense, ${rate}%)`, value: fc(input), color: "text-blue-400" },
          { label: net >= 0 ? "Net GST payable" : "Net ITC carry-forward", value: fc(Math.abs(net)), color: net >= 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">An indicative GSTR-3B-style summary. It back-computes the tax embedded in revenue and expense lines at a single slab assuming amounts are tax-inclusive - real returns need line-level rates, ineligible-ITC exclusions and RCM. Use as a directional estimate and confirm with your CA.</p>
    </div>
  );
}

// ── #202 TDS-DEDUCTED LEDGER ────────────────────────────────────────────────
// Estimates TDS on qualifying expense payments at a chosen section rate and
// totals the deduction per counterparty for the period.
function TdsLedger() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const SECTIONS = { "194C": 2, "194J": 10, "194H": 5, "194I": 10, "194Q": 0.1 } as const;
  type Section = keyof typeof SECTIONS;
  const [section, setSection] = useFeatureState<Section>("txn-tds-ledger-section", "194C");
  const [threshold, setThreshold] = useFeatureState<number>("txn-tds-ledger-threshold", 30000);
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const rate = SECTIONS[section];
  const byParty = useMemo(() => {
    const m: Record<string, { gross: number; count: number }> = {};
    txns.filter(t => (t.category === "expense" || t.category === "payroll") && t.amount < 0 && t.counterparty).forEach(t => {
      const k = t.counterparty;
      if (!m[k]) m[k] = { gross: 0, count: 0 };
      m[k].gross += Math.abs(t.amount); m[k].count += 1;
    });
    return Object.entries(m)
      .map(([party, v]) => ({ party, gross: v.gross, count: v.count, tds: v.gross >= threshold ? v.gross * rate / 100 : 0 }))
      .filter(r => r.tds > 0)
      .sort((a, b) => b.tds - a.tds);
  }, [txns, rate, threshold]);
  const totalTds = byParty.reduce((s, r) => s + r.tds, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><Receipt size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">TDS-Deducted Ledger</h3></div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--color-muted)]">Section</label>
          <select value={section} onChange={e => setSection(e.target.value as Section)} className={inp}>
            {(Object.entries(SECTIONS) as [Section, number][]).map(([k, v]) => <option key={k} value={k}>{k} · {v}%</option>)}
          </select>
          <label className="text-xs text-[var(--color-muted)]">Threshold ₹</label>
          <input type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className={inp} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Parties above threshold", value: byParty.length.toString(), color: "text-[var(--color-text)]" },
          { label: `Estimated TDS (${rate}%)`, value: fc(totalTds), color: "text-orange-400" },
          { label: "Gross deductible spend", value: fc(byParty.reduce((s, r) => s + r.gross, 0)), color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {byParty.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Receipt size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No counterparty crosses the {fc(threshold)} threshold for this section yet.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Counterparty", "Payments", "Gross paid", `TDS @ ${rate}%`].map(h => <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider ${h === "Counterparty" ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {byParty.map(r => (
                <tr key={r.party} className="hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-2.5 font-medium">{r.party}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--color-muted)] tabular-nums">{r.count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fc(r.gross)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-orange-400">{fc(r.tds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">An indicative TDS estimate on expense and payroll payments per counterparty, applied above a section threshold. Actual TDS depends on PAN/payee status, aggregate-during-year limits and exact section applicability - treat this as a working estimate and confirm with your CA before depositing.</p>
    </div>
  );
}

// ── #203 CASH vs BANK SPLIT ─────────────────────────────────────────────────
// Splits balances and flows between cash-type and bank-type accounts so the
// owner sees the true cash-in-hand position alongside bank money.
function CashBankSplit() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const accounts = useMemo(() => store.bankAccounts ?? [], [store.bankAccounts]);
  const fc = formatCurrency;

  const isCash = useCallback((id: string) => {
    const a = accounts.find(x => x.id === id);
    if (!a) return true; // unassigned/no account → treat as cash in hand
    const hay = `${a.name} ${a.provider}`.toLowerCase();
    return hay.includes("cash") || hay.includes("petty") || hay.includes("wallet");
  }, [accounts]);

  const split = useMemo(() => {
    let cashIn = 0, cashOut = 0, bankIn = 0, bankOut = 0;
    txns.forEach(t => {
      const cash = isCash(t.bankAccountId);
      if (t.amount >= 0) { if (cash) cashIn += t.amount; else bankIn += t.amount; }
      else { const v = Math.abs(t.amount); if (cash) cashOut += v; else bankOut += v; }
    });
    return { cashIn, cashOut, bankIn, bankOut, cashNet: cashIn - cashOut, bankNet: bankIn - bankOut };
  }, [txns, isCash]);

  const Card = ({ title, net, inFlow, outFlow, color }: { title: string; net: number; inFlow: number; outFlow: number; color: string }) => (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3"><Banknote size={14} className={color} /><h3 className="text-sm font-semibold">{title}</h3></div>
      <p className={`text-2xl font-bold tabular-nums ${net >= 0 ? "text-green-400" : "text-red-400"}`}>{fc(net)}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div><p className="text-[var(--color-muted)]">In</p><p className="tabular-nums text-green-400 font-medium">{fc(inFlow)}</p></div>
        <div><p className="text-[var(--color-muted)]">Out</p><p className="tabular-nums text-red-400 font-medium">{fc(outFlow)}</p></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Cash in hand" net={split.cashNet} inFlow={split.cashIn} outFlow={split.cashOut} color="text-orange-400" />
        <Card title="Bank accounts" net={split.bankNet} inFlow={split.bankIn} outFlow={split.bankOut} color="text-blue-400" />
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-sm flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="text-[var(--color-muted)]">Total movement net</span>
        <span className={`tabular-nums font-bold ${(split.cashNet + split.bankNet) >= 0 ? "text-green-400" : "text-red-400"}`}>{fc(split.cashNet + split.bankNet)}</span>
        <span className="text-[var(--color-muted)]">Cash share of outflow</span>
        <span className="tabular-nums font-semibold">{(split.cashOut + split.bankOut) > 0 ? Math.round(split.cashOut / (split.cashOut + split.bankOut) * 100) : 0}%</span>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Splits flows between cash-type accounts (name or provider contains cash, petty or wallet - plus any transaction with no account) and bank accounts, so you can see true cash-in-hand against bank money. Rename a petty-cash account to include "cash" to have it counted here.</p>
    </div>
  );
}

// ── #204 COUNTERPARTY 360 ───────────────────────────────────────────────────
// A ranked, one-screen profile of every counterparty: net position, money in
// vs out, transaction count, and last-seen date - sortable by net exposure.
function Counterparty360() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const [sortBy, setSortBy] = useState<"net" | "out" | "in" | "count">("out");

  const parties = useMemo(() => {
    const m: Record<string, { in: number; out: number; count: number; last: string }> = {};
    txns.filter(t => t.counterparty).forEach(t => {
      const k = t.counterparty;
      if (!m[k]) m[k] = { in: 0, out: 0, count: 0, last: t.date };
      if (t.amount >= 0) m[k].in += t.amount; else m[k].out += Math.abs(t.amount);
      m[k].count += 1;
      if (t.date > m[k].last) m[k].last = t.date;
    });
    const list = Object.entries(m).map(([party, v]) => ({ party, in: v.in, out: v.out, net: v.in - v.out, count: v.count, last: v.last }));
    list.sort((a, b) => sortBy === "net" ? Math.abs(b.net) - Math.abs(a.net) : sortBy === "in" ? b.in - a.in : sortBy === "count" ? b.count - a.count : b.out - a.out);
    return list;
  }, [txns, sortBy]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3"><Users size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Counterparty 360</h3></div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-[var(--color-muted)] mr-1">Sort by</span>
          {([["out", "Most paid"], ["in", "Most received"], ["net", "Net exposure"], ["count", "Activity"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setSortBy(k)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${sortBy === k ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {parties.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Users size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No counterparties found on your transactions yet.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Counterparty", "Txns", "Last seen", "Received", "Paid", "Net"].map(h => <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider ${h === "Counterparty" ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {parties.map(p => (
                <tr key={p.party} className="hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">{p.party}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--color-muted)] tabular-nums">{p.count}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--color-muted)] tabular-nums">{p.last}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{fc(p.in)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-400">{fc(p.out)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${p.net >= 0 ? "text-green-400" : "text-red-400"}`}>{fc(p.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A complete relationship view for every counterparty in your books - money received, money paid, net position, activity, and last-seen date - built live from transactions. A positive net means you have received more than you have paid them.</p>
    </div>
  );
}

// ── #205 EXPENSE BUDGET vs ACTUAL ───────────────────────────────────────────
// Set a monthly budget per spend category; the tool compares it to actual spend
// for the chosen month and flags overruns with a utilisation bar.
function BudgetVsActual() {
  const { store } = useApp();
  const txns = useMemo(() => store.transactions ?? [], [store.transactions]);
  const fc = formatCurrency;
  const SPEND_CATS = ["expense", "payroll", "tax", "loan"] as const;
  const [budgets, setBudgets] = useFeatureState<Record<string, number>>("txn-budget-actual", {});
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] w-36";

  const actuals = useMemo(() => {
    const m: Record<string, number> = {};
    txns.filter(t => t.amount < 0 && t.date.startsWith(month)).forEach(t => { m[t.category] = (m[t.category] ?? 0) + Math.abs(t.amount); });
    return m;
  }, [txns, month]);

  const rows = SPEND_CATS.map(cat => {
    const budget = budgets[cat] ?? 0;
    const actual = actuals[cat] ?? 0;
    const pct = budget > 0 ? Math.round(actual / budget * 100) : 0;
    return { cat, budget, actual, pct, over: budget > 0 && actual > budget };
  });
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2"><Target size={14} className="text-[var(--color-primary)]" /><h3 className="text-sm font-semibold">Budget vs Actual</h3></div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-muted)]">Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
        </div>
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.cat}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${CAT_COLOR[r.cat]}`}><Tag size={8} /> {r.cat}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--color-muted)] tabular-nums">{fc(r.actual)} / {fc(r.budget)}</span>
                  <input type="number" placeholder="Budget ₹" value={budgets[r.cat] ?? ""}
                    onChange={e => setBudgets(prev => ({ ...prev, [r.cat]: Number(e.target.value) || 0 }))}
                    className={inp} />
                </div>
              </div>
              <div className="h-2 rounded-full bg-[var(--color-accent)] overflow-hidden">
                <div className={`h-full rounded-full ${r.over ? "bg-red-400" : r.pct > 80 ? "bg-yellow-400" : "bg-green-400"}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
              </div>
              {r.over && <p className="text-[10px] text-red-400 mt-0.5">Over budget by {fc(r.actual - r.budget)} ({r.pct}%)</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total budget", value: fc(totalBudget), color: "text-[var(--color-text)]" },
          { label: "Total actual", value: fc(totalActual), color: "text-[var(--color-text)]" },
          { label: totalActual <= totalBudget ? "Remaining" : "Over budget", value: fc(Math.abs(totalBudget - totalActual)), color: totalActual <= totalBudget ? "text-green-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Set a monthly budget per spend category and compare it against actual outflow for the chosen month. Budgets are saved and synced across devices; the bar turns amber past 80% and red on overrun.</p>
    </div>
  );
}

// ── #206 CASH APPLICATION - MATCH PAYMENTS TO INVOICES ──────────────────────
// The finance manager's core reconciliation loop: received cash (revenue
// transactions) and open customer invoices live in separate lists and never
// link, so invoices get marked paid by hand. This view auto-suggests which
// payment settles which invoice (exact = high confidence, ±5% / ±₹500 = medium),
// then on "Match" stamps the transaction's invoiceId and flips the invoice to
// paid - closing AR against the ledger in one click. Pure store writes:
// updateTransaction (set invoiceId) + updateInvoice (status → paid).
type CashMatch = {
  invoice: Invoice;
  txn: Transaction;
  confidence: "high" | "medium";
  diff: number; // signed: txn.amount − invoice.amount
};

function CashApplication() {
  const { store, updateTransaction, updateInvoice } = useApp();
  const fc = formatCurrency;
  const transactions = useMemo(() => store.transactions ?? [], [store.transactions]);
  const invoices     = useMemo(() => store.invoices ?? [], [store.invoices]);

  // Received cash with no invoice linked yet. Treat category 'revenue' or any
  // positive (money-in) transaction as a candidate receipt.
  const unmatchedReceipts = useMemo(
    () => transactions.filter(t => !t.invoiceId && (t.category === "revenue" || t.amount > 0)),
    [transactions],
  );
  const openInvoices = useMemo(
    () => invoices.filter(i => i.status !== "paid"),
    [invoices],
  );

  // Auto-suggest one best candidate receipt per open invoice. A receipt is only
  // a candidate if it lands on/after the invoice date (you don't get paid before
  // you bill). Exact amount (within ₹1) is high confidence; within ±5% OR ±₹500
  // is medium. Each receipt can back only one invoice - greedily assign the
  // strongest matches first so a single payment isn't double-counted.
  const suggestions = useMemo<CashMatch[]>(() => {
    const used = new Set<string>();
    const out: CashMatch[] = [];
    // High-confidence (exact) pass first, then medium - so exact matches win the
    // receipt before a looser invoice can claim it.
    const ranked = [...openInvoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const findFor = (inv: Invoice, want: "high" | "medium"): CashMatch | null => {
      const tol = Math.max(inv.amount * 0.05, 500);
      let best: CashMatch | null = null;
      for (const t of unmatchedReceipts) {
        if (used.has(t.id)) continue;
        if (t.date < inv.invoiceDate) continue; // payment can't predate the bill
        const diff = t.amount - inv.amount;
        const abs = Math.abs(diff);
        const isHigh = abs <= 1;
        const isMedium = abs <= tol;
        if (want === "high" ? !isHigh : !(isMedium && !isHigh)) continue;
        const cand: CashMatch = { invoice: inv, txn: t, confidence: want, diff };
        // Prefer the closest amount, then the earliest payment after the invoice.
        if (!best || abs < Math.abs(best.diff) || (abs === Math.abs(best.diff) && t.date < best.txn.date)) best = cand;
      }
      return best;
    };
    for (const inv of ranked) {
      const hit = findFor(inv, "high");
      if (hit) { used.add(hit.txn.id); out.push(hit); }
    }
    for (const inv of ranked) {
      if (out.some(m => m.invoice.id === inv.id)) continue; // already matched exactly
      const hit = findFor(inv, "medium");
      if (hit) { used.add(hit.txn.id); out.push(hit); }
    }
    return out;
  }, [openInvoices, unmatchedReceipts]);

  const highMatches = useMemo(() => suggestions.filter(m => m.confidence === "high"), [suggestions]);

  // Summary metrics.
  const unmatchedCashTotal = useMemo(() => unmatchedReceipts.reduce((s, t) => s + t.amount, 0), [unmatchedReceipts]);
  const openInvoiceTotal   = useMemo(() => openInvoices.reduce((s, i) => s + i.amount, 0), [openInvoices]);
  const totalInvoices      = invoices.length;
  const paidInvoices       = invoices.filter(i => i.status === "paid").length;
  const pctReconciled      = totalInvoices > 0 ? Math.round((paidInvoices / totalInvoices) * 100) : 0;

  // Apply one match: stamp the receipt with the invoice id and mark the invoice
  // paid. Toast offers Undo (revert both writes) within the standard window.
  const applyMatch = useCallback((m: CashMatch, silent = false) => {
    const priorTxn = m.txn;
    const priorInv = m.invoice;
    updateTransaction({ ...priorTxn, invoiceId: priorInv.id });
    updateInvoice({ ...priorInv, status: "paid" });
    if (silent) return;
    toast.success(`Matched ${fc(priorTxn.amount)} → ${priorInv.customer}'s invoice - marked paid`, {
      action: {
        label: "Undo",
        onClick: () => {
          updateTransaction({ ...priorTxn, invoiceId: undefined });
          updateInvoice({ ...priorInv });
          toast.success("Match undone");
        },
      },
      duration: 10000,
    });
  }, [updateTransaction, updateInvoice, fc]);

  // Apply every high-confidence (exact) match in one go, with a batched Undo.
  const autoMatchAll = useCallback(() => {
    if (highMatches.length === 0) return;
    const batch = highMatches;
    batch.forEach(m => applyMatch(m, true));
    toast.success(`Auto-matched ${batch.length} exact payment${batch.length !== 1 ? "s" : ""} to invoices`, {
      action: {
        label: "Undo all",
        onClick: () => {
          batch.forEach(m => {
            updateTransaction({ ...m.txn, invoiceId: undefined });
            updateInvoice({ ...m.invoice });
          });
          toast.success(`Reverted ${batch.length} match${batch.length !== 1 ? "es" : ""}`);
        },
      },
      duration: 10000,
    });
  }, [highMatches, applyMatch, updateTransaction, updateInvoice]);

  const suggForInvoice = useCallback((invId: string) => suggestions.find(m => m.invoice.id === invId) ?? null, [suggestions]);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Unmatched received cash", value: fc(unmatchedCashTotal), sub: `${unmatchedReceipts.length} receipt${unmatchedReceipts.length !== 1 ? "s" : ""} unapplied`, color: unmatchedReceipts.length ? "text-yellow-400" : "text-green-400" },
          { label: "Open invoices", value: fc(openInvoiceTotal), sub: `${openInvoices.length} awaiting payment`, color: openInvoices.length ? "text-orange-400" : "text-green-400" },
          { label: "Suggested matches", value: suggestions.length.toString(), sub: `${highMatches.length} exact · ${suggestions.length - highMatches.length} approximate`, color: suggestions.length ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]" },
          { label: "Invoices reconciled", value: `${pctReconciled}%`, sub: `${paidInvoices} of ${totalInvoices} marked paid`, color: pctReconciled >= 100 ? "text-green-400" : "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Title + auto-match action */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-[var(--color-primary)]" />
            <div>
              <h3 className="text-sm font-semibold">Match payments to invoices</h3>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Suggestions pair received cash with the open invoice it most likely settles. Matching stamps the payment with the invoice and marks the invoice paid.</p>
            </div>
          </div>
          <button onClick={autoMatchAll} disabled={highMatches.length === 0}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
            <CheckCheck size={12} /> Auto-match {highMatches.length} exact
          </button>
        </div>
      </div>

      {/* Two-column board: open invoices (left) ↔ unmatched receipts (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Open invoices with suggestions */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
            <Receipt size={13} className="text-orange-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Open invoices ({openInvoices.length})</h4>
          </div>
          {openInvoices.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[var(--color-muted)]">No open invoices - everything is reconciled.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border)] max-h-[28rem] overflow-y-auto">
              {[...openInvoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(inv => {
                const sugg = suggForInvoice(inv.id);
                return (
                  <div key={inv.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{inv.customer}</p>
                        <p className="text-[10px] text-[var(--color-muted)] truncate">
                          {inv.invoiceNumber ? `${inv.invoiceNumber} · ` : ""}{inv.description || "Invoice"} · due {inv.dueDate}
                          <span className={`ml-1.5 ${inv.status === "overdue" ? "text-red-400" : "text-yellow-400"}`}>{inv.status}</span>
                        </p>
                      </div>
                      <span className="tabular-nums font-semibold text-sm whitespace-nowrap">{fc(inv.amount)}</span>
                    </div>
                    {sugg ? (
                      <div className="mt-2 flex items-center justify-between gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${sugg.confidence === "high" ? "bg-green-950/40 text-green-400" : "bg-yellow-950/40 text-yellow-400"}`}>
                              {sugg.confidence === "high" ? "Exact match" : "Likely match"}
                            </span>
                            {sugg.diff !== 0 && <span className="text-[9px] text-[var(--color-muted)] tabular-nums">{sugg.diff > 0 ? "+" : "−"}{fc(Math.abs(sugg.diff))} vs invoice</span>}
                          </div>
                          <p className="text-[10px] text-[var(--color-muted)] truncate mt-0.5">
                            {sugg.txn.date} · {sugg.txn.description}{sugg.txn.counterparty ? ` · ${sugg.txn.counterparty}` : ""} · <span className="text-green-400 tabular-nums">{fc(sugg.txn.amount)}</span>
                          </p>
                        </div>
                        <button onClick={() => applyMatch(sugg)}
                          className="shrink-0 text-[10px] bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity">
                          Match
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-[10px] text-[var(--color-muted)]">No matching receipt found yet.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Unmatched receipts */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
            <Banknote size={13} className="text-green-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Unmatched received cash ({unmatchedReceipts.length})</h4>
          </div>
          {unmatchedReceipts.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[var(--color-muted)]">Every received payment is applied to an invoice.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border)] max-h-[28rem] overflow-y-auto">
              {[...unmatchedReceipts].sort((a, b) => b.date.localeCompare(a.date)).map(t => {
                const linkedSugg = suggestions.find(m => m.txn.id === t.id);
                return (
                  <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      <p className="text-[10px] text-[var(--color-muted)] truncate">
                        {t.date}{t.counterparty ? ` · ${t.counterparty}` : ""}
                        {linkedSugg && <span className="ml-1.5 text-[var(--color-primary)]">→ suggested for {linkedSugg.invoice.customer}</span>}
                      </p>
                    </div>
                    <span className="tabular-nums font-semibold text-sm text-green-400 whitespace-nowrap">+{fc(t.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        Candidates only include payments dated on or after the invoice. Exact amounts (within ₹1) are high-confidence; amounts within ±5% or ±₹500 are flagged as approximate so you can confirm before applying. Matching is reversible from the toast.
      </p>
    </div>
  );
}

// ── Import Statement (CSV) ────────────────────────────────────────────────────
// Real file-based bank-statement import: parse (Indian date/amount formats, HDFC/ICICI/SBI
// style Debit-Credit or single-Amount layouts) → preview with per-row category + include
// toggles → bulk POST with source:"import". The SERVER dedupes on (date|amount|description),
// so re-importing an overlapping statement never double-counts.
interface ImportRow extends ParsedLine {
  include: boolean;
  category: Transaction["category"];
}
function StatementImportTool({ bankAccounts, onImported }: { bankAccounts: { id: string; name: string }[]; onImported: () => void }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseSkipped, setParseSkipped] = useState(0);
  const [accountId, setAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [importing, setImporting] = useState(false);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const parsed = parseStatementCsv(text);
    if (!parsed.lines.length) { toast.error("Couldn't read any transactions from that file — expected a CSV with date, description and amount (or debit/credit) columns."); return; }
    setFileName(f.name);
    setParseSkipped(parsed.skipped);
    setRows(parsed.lines.map(l => ({ ...l, include: true, category: guessCategory(l.description, l.amount) })));
  };

  const included = rows.filter(r => r.include);
  const inflow  = included.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const outflow = included.filter(r => r.amount < 0).reduce((s, r) => s - r.amount, 0);

  const doImport = async () => {
    if (!included.length) { toast.error("Nothing selected to import"); return; }
    setImporting(true);
    try {
      // Chunked so a 2,000-row statement doesn't ride one giant request.
      let inserted = 0, skipped = 0, errored = 0;
      for (let i = 0; i < included.length; i += 500) {
        const chunk = included.slice(i, i + 500).map(r => ({
          bank_account_id: accountId || undefined,
          amount: r.amount,
          description_raw: r.description,
          category: catToApi(r.category),
          transaction_date: r.date,
          source: "import",
        }));
        const res = await api.post<{ inserted: unknown[]; skipped_duplicates: number; skipped_errors: number }>("/api/transactions", chunk);
        inserted += res.inserted?.length ?? 0;
        skipped += res.skipped_duplicates ?? 0;
        errored += res.skipped_errors ?? 0;
      }
      const parts = [`Imported ${inserted} transaction${inserted === 1 ? "" : "s"}`];
      if (skipped) parts.push(`${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`);
      if (errored) parts.push(`${errored} row${errored === 1 ? "" : "s"} failed`);
      if (errored) toast.warning(parts.join(" · ")); else toast.success(parts.join(" · "));
      setRows([]); setFileName("");
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally { setImporting(false); }
  };

  const CATS: Transaction["category"][] = ["revenue", "expense", "payroll", "loan", "tax", "transfer"];

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2"><UploadCloud size={14} className="text-[var(--color-primary)]" /> Import Bank Statement (CSV)</h2>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs bg-[var(--color-bg)] border border-dashed border-[var(--color-border)] rounded-lg px-4 py-3 cursor-pointer hover:border-[var(--color-primary)]">
          <UploadCloud size={14} className="text-[var(--color-muted)]" />
          {fileName || "Choose your bank's CSV export (HDFC / ICICI / SBI / any date-description-amount file)"}
          <input type="file" accept=".csv,.txt" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
        </label>
        {bankAccounts.length > 0 && (
          <select value={accountId} onChange={e => setAccountId(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs">
            {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>
      {rows.length > 0 && (
        <>
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <span className="text-[var(--color-muted)]">{included.length} of {rows.length} rows selected</span>
            <span className="text-green-400 tabular-nums">+{formatCurrency(inflow)} in</span>
            <span className="text-red-400 tabular-nums">−{formatCurrency(outflow)} out</span>
            {parseSkipped > 0 && <span className="text-[var(--color-muted)]">({parseSkipped} unreadable row{parseSkipped === 1 ? "" : "s"} skipped at parse)</span>}
          </div>
          <div className="max-h-80 overflow-y-auto border border-[var(--color-border)] rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--color-surface)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left w-8"><input type="checkbox" checked={included.length === rows.length} onChange={e => setRows(p => p.map(r => ({ ...r, include: e.target.checked })))} /></th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--color-muted)] uppercase tracking-wider">Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--color-muted)] uppercase tracking-wider">Description</th>
                  <th className="px-3 py-2 text-right font-semibold text-[var(--color-muted)] uppercase tracking-wider">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--color-muted)] uppercase tracking-wider">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((r, i) => (
                  <tr key={i} className={r.include ? "" : "opacity-40"}>
                    <td className="px-3 py-1.5"><input type="checkbox" checked={r.include} onChange={e => setRows(p => p.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))} /></td>
                    <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-1.5 max-w-[280px] truncate" title={r.description}>{r.description}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.amount > 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(r.amount)}</td>
                    <td className="px-3 py-1.5">
                      <select value={r.category} onChange={e => setRows(p => p.map((x, j) => j === i ? { ...x, category: e.target.value as Transaction["category"] } : x))}
                        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs">
                        {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={doImport} disabled={importing || included.length === 0}
            className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
            {importing ? "Importing…" : `Import ${included.length} transaction${included.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">
        Reads your bank's CSV export directly - Indian date formats, lakh commas and Debit/Credit or single-Amount layouts. The server skips rows that already exist (same date + amount + description), so re-importing an overlapping period is safe.
      </p>
    </div>
  );
}
