import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, Columns3,
  Download, Printer, Rows3, Search, X,
} from "lucide-react";
import { toCsv, download } from "@/lib/csv";
import { exportExcel } from "@/lib/exporters";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import { usePref } from "@/hooks/usePrefs";
import { cn } from "@/lib/utils";

/**
 * The table the product never had.
 *
 * The gap audit found sortable headers on 3 of 72 pages, bulk-select on 3, column
 * pickers on 0, and "Showing 1-50 of 3,214" nowhere — because every page hand-rolled its
 * own `<table>` and stopped at the point where it worked for the author's ten test rows.
 *
 * One component, used two ways:
 *   • CLIENT mode (default) — pass `rows`; it sorts, searches and paginates in memory.
 *     Right for lists that are genuinely small and already loaded.
 *   • SERVER mode — pass `serverMode` plus `total`, and handle `onQueryChange`. Sorting,
 *     searching and paging become URL params against the /api list contract
 *     (lib/listQuery.js), so a tenant with 20,000 invoices fetches 50.
 *
 * Column visibility and row density persist per user via /api/prefs, keyed by `listKey`,
 * so they follow the user to their phone.
 */
export type Column<T> = {
  key: string;
  header: string;
  /** Cell content. Omit to render `row[key]`. */
  render?: (row: T) => ReactNode;
  /** Sort/search/export value. Defaults to `row[key]`. */
  value?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** Hidden by default, available in the column picker. */
  defaultHidden?: boolean;
  /** Never offered in the column picker (identity columns, the actions column). */
  locked?: boolean;
  /** Show a column total in the footer row. */
  total?: "sum" | "count";
  className?: string;
  headerClass?: string;
  /** Hide below md, as the existing pages do for secondary columns. */
  hideOnMobile?: boolean;
};

export type TableQuery = { page: number; limit: number; sort: string | null; order: "asc" | "desc"; q: string };

type Props<T> = {
  listKey: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: ReactNode;
  /** Row click — give this a permalink navigation, not a modal. */
  onRowClick?: (row: T) => void;
  /**
   * The row's permalink. Supplying it makes ⌘/Ctrl-click and middle-click open the record
   * in a new tab, and shows the destination in the browser's status bar — which a
   * div-with-an-onClick cannot do, so "open in a new tab" was impossible on every list.
   */
  rowHref?: (row: T) => string;
  /** Enables the checkbox column and the bulk bar. */
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  toolbar?: ReactNode;
  searchPlaceholder?: string;
  defaultSort?: { key: string; order: "asc" | "desc" };
  pageSize?: number;
  /** Server-driven list: `rows` is the current page, `total` the full count. */
  serverMode?: boolean;
  total?: number;
  query?: TableQuery;
  onQueryChange?: (q: TableQuery) => void;
  exportName?: string;
  className?: string;
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export default function DataTable<T>({
  listKey, columns, rows, rowKey, loading, error, onRetry, empty, onRowClick, rowHref,
  bulkActions, toolbar, searchPlaceholder = "Search this list…", defaultSort,
  pageSize = 25, serverMode, total, query, onQueryChange, exportName, className,
}: Props<T>) {
  // ── Persisted per-user view settings ──────────────────────────────────────
  const [hidden, setHidden] = usePref<string[]>(`table.${listKey}.hidden`,
    columns.filter((c) => c.defaultHidden).map((c) => c.key));
  const [density, setDensity] = usePref<"comfortable" | "compact">(`table.${listKey}.density`, "comfortable");

  // ── Local (client-mode) query state ───────────────────────────────────────
  const [localQ, setLocalQ] = useState("");
  const [localPage, setLocalPage] = useState(1);
  const [localSort, setLocalSort] = useState<{ key: string; order: "asc" | "desc" } | null>(defaultSort ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCols, setShowCols] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const colsBtnRef = useRef<HTMLDivElement>(null);

  const q     = serverMode ? (query?.q ?? "") : localQ;
  const page  = serverMode ? (query?.page ?? 1) : localPage;
  const limit = serverMode ? (query?.limit ?? pageSize) : pageSize;
  const sort  = serverMode
    ? (query?.sort ? { key: query.sort, order: query.order } : null)
    : localSort;

  const emit = useCallback((patch: Partial<TableQuery>) => {
    if (!serverMode) return;
    onQueryChange?.({
      page: patch.page ?? query?.page ?? 1,
      limit: patch.limit ?? query?.limit ?? pageSize,
      sort: patch.sort !== undefined ? patch.sort : (query?.sort ?? null),
      order: patch.order ?? query?.order ?? "desc",
      q: patch.q !== undefined ? patch.q : (query?.q ?? ""),
    });
  }, [serverMode, onQueryChange, query, pageSize]);

  // Debounce typing so server mode does not fire a request per keystroke.
  const [typed, setTyped] = useState(q);
  useEffect(() => { setTyped(q); }, [q]);
  useEffect(() => {
    if (!serverMode) { setLocalQ(typed); setLocalPage(1); return; }
    const t = setTimeout(() => { if (typed !== (query?.q ?? "")) emit({ q: typed, page: 1 }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  // Close the column popover on outside click / Escape.
  useEffect(() => {
    if (!showCols) return;
    const onDown = (e: MouseEvent) => { if (!colsBtnRef.current?.contains(e.target as Node)) setShowCols(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowCols(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [showCols]);

  const visible = useMemo(() => columns.filter((c) => !hidden.includes(c.key)), [columns, hidden]);
  const valueOf = useCallback((row: T, c: Column<T>) =>
    c.value ? c.value(row) : (row as Record<string, unknown>)[c.key] as string | number | null | undefined,
  []);

  // ── Client-mode: search → sort → page ─────────────────────────────────────
  const searched = useMemo(() => {
    if (serverMode || !q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => visible.some((c) => String(valueOf(r, c) ?? "").toLowerCase().includes(needle)));
  }, [rows, q, serverMode, visible, valueOf]);

  const sorted = useMemo(() => {
    if (serverMode || !sort) return searched;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return searched;
    const dir = sort.order === "asc" ? 1 : -1;
    return [...searched].sort((a, b) => {
      const av = valueOf(a, col), bv = valueOf(b, col);
      // Blanks always sink, in both directions — "sort by due date" should not surface
      // every invoice that has no due date.
      if (av == null || av === "") return 1;
      if (bv == null || bv === "") return -1;
      const an = num(av), bn = num(bv);
      if (an !== null && bn !== null) return (an - bn) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
  }, [searched, sort, serverMode, columns, valueOf]);

  const count = serverMode ? (total ?? rows.length) : sorted.length;
  const pages = Math.max(1, Math.ceil(count / limit));
  const pageRows = serverMode ? rows : sorted.slice((page - 1) * limit, page * limit);

  // A filter change can strand the user on a page that no longer exists.
  useEffect(() => { if (!serverMode && page > pages) setLocalPage(pages); }, [pages, page, serverMode]);

  const goPage = (p: number) => {
    const next = Math.min(Math.max(1, p), pages);
    if (serverMode) emit({ page: next }); else setLocalPage(next);
    setFocusIdx(-1);
  };

  const toggleSort = (c: Column<T>) => {
    if (c.sortable === false) return;
    const isCur = sort?.key === c.key;
    const order: "asc" | "desc" = isCur && sort?.order === "asc" ? "desc" : "asc";
    if (serverMode) emit({ sort: c.key, order, page: 1 });
    else { setLocalSort({ key: c.key, order }); setLocalPage(1); }
  };

  // ── Selection ─────────────────────────────────────────────────────────────
  const pageKeys = pageRows.map(rowKey);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const someOnPage = pageKeys.some((k) => selected.has(k));
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allOnPage) pageKeys.forEach((k) => next.delete(k));
    else pageKeys.forEach((k) => next.add(k));
    return next;
  });
  const selectedRows = pageRows.filter((r) => selected.has(rowKey(r)));
  const clearSel = () => setSelected(new Set());

  // ── Export what you're actually looking at ────────────────────────────────
  const exportRows = () => {
    const cols = visible.filter((c) => c.key !== "__actions");
    const head = cols.map((c) => c.header);
    const body = (serverMode ? rows : sorted).map((r) =>
      cols.map((c) => { const v = valueOf(r, c); return v == null ? "" : (typeof v === "number" ? v : String(v)); }));
    return { head, body };
  };
  const doCsv = () => {
    const { head, body } = exportRows();
    download(`${exportName || listKey}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([head, ...body]));
  };
  const doXlsx = () => {
    const { head, body } = exportRows();
    exportExcel(`${exportName || listKey}-${new Date().toISOString().slice(0, 10)}`, [{ name: listKey.slice(0, 28), rows: [head, ...body] }]);
  };

  // ── Footer totals ─────────────────────────────────────────────────────────
  const totalsRow = useMemo(() => {
    if (!visible.some((c) => c.total)) return null;
    const base = serverMode ? rows : sorted;
    return visible.map((c) => {
      if (c.total === "count") return String(base.length);
      if (c.total !== "sum") return "";
      const sum = base.reduce((s, r) => s + (num(valueOf(r, c)) ?? 0), 0);
      return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(sum);
    });
  }, [visible, sorted, rows, serverMode, valueOf]);

  const pad = density === "compact" ? "px-3 py-1.5" : "px-4 py-3";
  const from = count === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(count, (page - 1) * limit + pageRows.length);

  // ── Keyboard row navigation ───────────────────────────────────────────────
  const onGridKey = (e: React.KeyboardEvent) => {
    if (!pageRows.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(pageRows.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && focusIdx >= 0) { e.preventDefault(); onRowClick?.(pageRows[focusIdx]); }
    else if (e.key === " " && focusIdx >= 0 && bulkActions) {
      e.preventDefault();
      const k = rowKey(pageRows[focusIdx]);
      setSelected((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2" data-no-print>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" aria-hidden="true" />
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-9 pr-8 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          {typed && (
            <button type="button" onClick={() => setTyped("")} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-text)]">
              <X size={13} />
            </button>
          )}
        </div>

        {toolbar}

        <button type="button" onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
          title={density === "compact" ? "Comfortable rows" : "Compact rows"} aria-label="Toggle row density"
          className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]">
          <Rows3 size={14} />
        </button>

        <div className="relative" ref={colsBtnRef}>
          <button type="button" onClick={() => setShowCols((v) => !v)} aria-expanded={showCols} aria-haspopup="true"
            title="Choose columns"
            className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]">
            <Columns3 size={14} />
          </button>
          {showCols && (
            <div role="menu" className="absolute right-0 mt-1 z-30 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-1.5 max-h-72 overflow-y-auto">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] px-2 py-1.5">Columns</p>
              {columns.filter((c) => !c.locked).map((c) => {
                const on = !hidden.includes(c.key);
                return (
                  <button key={c.key} type="button" role="menuitemcheckbox" aria-checked={on}
                    onClick={() => setHidden(on ? [...hidden, c.key] : hidden.filter((k) => k !== c.key))}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-[var(--color-accent)]">
                    <span className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                      on ? "bg-[var(--color-primary)] border-[var(--color-primary)]" : "border-[var(--color-border)]")}>
                      {on && <Check size={10} className="text-[var(--color-bg)]" />}
                    </span>
                    {c.header}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button type="button" onClick={doCsv} title="Export this view as CSV" aria-label="Export CSV"
          className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]">
          <Download size={14} />
        </button>
        <button type="button" onClick={doXlsx} title="Export this view to Excel"
          className="px-2 py-2 rounded-lg border border-[var(--color-border)] text-[10px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]">
          XLSX
        </button>
        <button type="button" onClick={() => window.print()} title="Print this view" aria-label="Print"
          className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]">
          <Printer size={14} />
        </button>
      </div>

      {/* ── Bulk bar ────────────────────────────────────────────────────── */}
      {bulkActions && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg px-3 py-2" data-no-print>
          <span className="text-xs font-semibold">{selected.size} selected</span>
          <button type="button" onClick={clearSel} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline">Clear</button>
          <div className="flex-1" />
          {bulkActions(selectedRows, clearSel)}
        </div>
      )}

      {/* ── The table ───────────────────────────────────────────────────── */}
      {loading ? <LoadingState rows={5} label="Loading" />
      : error ? <ErrorState message={error} onRetry={onRetry} />
      : count === 0 ? (empty ?? (
          <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center">
            <p className="text-sm text-[var(--color-muted)]">
              {q ? `Nothing matches "${q}".` : "Nothing here yet."}
            </p>
            {q && <button type="button" onClick={() => setTyped("")} className="mt-3 text-xs text-[var(--color-primary)] hover:underline">Clear the search</button>}
          </div>
        ))
      : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto"
             onKeyDown={onGridKey} tabIndex={0} role="region" aria-label={`${listKey} table`}>
          <table className="w-full text-sm rcard">
            <thead className="bg-[var(--color-surface)] sticky top-0 z-10 border-b border-[var(--color-border)]">
              <tr>
                {bulkActions && (
                  <th className={cn(pad, "w-10")}>
                    <input type="checkbox" checked={allOnPage}
                      ref={(el) => { if (el) el.indeterminate = !allOnPage && someOnPage; }}
                      onChange={toggleAll} aria-label="Select all rows on this page"
                      className="accent-[var(--color-primary)] cursor-pointer" />
                  </th>
                )}
                {visible.map((c) => {
                  const active = sort?.key === c.key;
                  const sortState = active ? (sort!.order === "asc" ? "ascending" : "descending") : "none";
                  return (
                    <th key={c.key}
                      aria-sort={c.sortable === false ? undefined : sortState}
                      className={cn(pad, "text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider",
                        c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                        c.hideOnMobile && "hidden md:table-cell", c.headerClass)}>
                      {c.sortable === false ? c.header : (
                        <button type="button" onClick={() => toggleSort(c)}
                          className={cn("inline-flex items-center gap-1 hover:text-[var(--color-text)] transition-colors",
                            c.align === "right" && "flex-row-reverse")}>
                          {c.header}
                          {active ? (sort!.order === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                                  : <ArrowUpDown size={11} className="opacity-30" />}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {pageRows.map((row, i) => {
                const k = rowKey(row);
                const isSel = selected.has(k);
                return (
                  <tr key={k}
                    onClick={(e) => {
                      // Honour the browser's own conventions for opening in a new tab
                      // before falling back to in-app navigation.
                      const href = rowHref?.(row);
                      if (href && (e.metaKey || e.ctrlKey)) { window.open(href, "_blank", "noopener"); return; }
                      onRowClick?.(row);
                    }}
                    onAuxClick={(e) => {
                      const href = rowHref?.(row);
                      if (href && e.button === 1) { e.preventDefault(); window.open(href, "_blank", "noopener"); }
                    }}
                    aria-selected={isSel || undefined}
                    className={cn("transition-colors",
                      onRowClick && "cursor-pointer",
                      isSel ? "bg-[var(--color-primary)]/8" : "hover:bg-white/2",
                      focusIdx === i && "ring-1 ring-inset ring-[var(--color-primary)]/50")}>
                    {bulkActions && (
                      <td data-label="" className={pad} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSel}
                          onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                          aria-label={`Select row ${i + 1}`}
                          className="accent-[var(--color-primary)] cursor-pointer" />
                      </td>
                    )}
                    {visible.map((c) => (
                      <td key={c.key} data-label={c.header}
                        className={cn(pad,
                          c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : "text-left",
                          c.hideOnMobile && "hidden md:table-cell", c.className)}>
                        {c.render ? c.render(row) : String(valueOf(row, c) ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {totalsRow && (
              <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]/40">
                <tr>
                  {bulkActions && <td className={pad} />}
                  {totalsRow.map((v, i) => (
                    <td key={visible[i].key} data-label={v ? `Total ${visible[i].header}` : ""}
                      className={cn(pad, "text-xs font-bold",
                        visible[i].align === "right" ? "text-right tabular-nums" : "text-left",
                        visible[i].hideOnMobile && "hidden md:table-cell")}>
                      {i === 0 && !v ? "Total" : v}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── Count + pager ───────────────────────────────────────────────── */}
      {count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-muted)]" data-no-print>
          <p aria-live="polite">
            Showing <span className="text-[var(--color-text)] font-medium tabular-nums">{from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")}</span>
            {" of "}<span className="text-[var(--color-text)] font-medium tabular-nums">{count.toLocaleString("en-IN")}</span>
          </p>
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => goPage(page - 1)} disabled={page <= 1} aria-label="Previous page"
                className="p-1.5 rounded border border-[var(--color-border)] disabled:opacity-30 hover:bg-[var(--color-accent)]">
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 tabular-nums">Page {page} of {pages}</span>
              <button type="button" onClick={() => goPage(page + 1)} disabled={page >= pages} aria-label="Next page"
                className="p-1.5 rounded border border-[var(--color-border)] disabled:opacity-30 hover:bg-[var(--color-accent)]">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
