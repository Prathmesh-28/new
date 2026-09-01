import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { TableQuery } from "@/components/ui/DataTable";

/**
 * Keeps a list's page / sort / search / filters in the URL.
 *
 * Two gaps at once: filters were lost the moment you navigated away and came back, and
 * a filtered list could not be shared or bookmarked ("here are the 12 invoices I mean").
 * Putting the query in the URL fixes both, and makes Back behave the way people expect.
 *
 * Param names match the server list contract (lib/listQuery.js) exactly, so the same
 * object can be handed straight to the API.
 */
export type ListFilters = Record<string, string | undefined>;

export function useListQuery(defaults?: Partial<TableQuery>) {
  const [params, setParams] = useSearchParams();

  const query: TableQuery = useMemo(() => ({
    page:  Math.max(1, parseInt(params.get("page") || "", 10) || 1),
    limit: Math.min(200, parseInt(params.get("limit") || "", 10) || defaults?.limit || 50),
    sort:  params.get("sort") || defaults?.sort || null,
    order: (params.get("order") === "asc" ? "asc" : params.get("order") === "desc" ? "desc" : defaults?.order) || "desc",
    q:     params.get("q") || "",
  }), [params, defaults?.limit, defaults?.sort, defaults?.order]);

  const filters: ListFilters = useMemo(() => {
    const out: ListFilters = {};
    params.forEach((v, k) => { if (!["page", "limit", "sort", "order", "q", "tab", "t"].includes(k)) out[k] = v; });
    return out;
  }, [params]);

  const write = useCallback((patch: Record<string, string | number | null | undefined>, resetPage = false) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      if (resetPage) next.delete("page");
      return next;
    }, { replace: true });
  }, [setParams]);

  const setQuery = useCallback((q: TableQuery) => {
    write({ page: q.page > 1 ? q.page : null, limit: q.limit, sort: q.sort, order: q.order, q: q.q || null });
  }, [write]);

  const setFilter = useCallback((key: string, value?: string | null) => write({ [key]: value ?? null }, true), [write]);

  const clearFilters = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams();
      // Keep the tab you're on and the sort you chose; clear only the filtering.
      for (const keep of ["tab", "t", "sort", "order", "limit"]) { const v = prev.get(keep); if (v) next.set(keep, v); }
      return next;
    }, { replace: true });
  }, [setParams]);

  /** Ready-made query string for the API, filters included. */
  const toApiQuery = useCallback((extra?: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    sp.set("page", String(query.page));
    sp.set("limit", String(query.limit));
    if (query.sort) { sp.set("sort", query.sort); sp.set("order", query.order); }
    if (query.q) sp.set("q", query.q);
    for (const [k, v] of Object.entries(filters)) if (v) sp.set(k, v);
    for (const [k, v] of Object.entries(extra || {})) if (v !== undefined && v !== "") sp.set(k, String(v));
    return sp.toString();
  }, [query, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (query.q ? 1 : 0);

  return { query, setQuery, filters, setFilter, clearFilters, toApiQuery, activeFilterCount, write };
}

export default useListQuery;
