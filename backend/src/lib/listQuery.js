"use strict";
// ── Shared list contract for every collection endpoint ───────────────────────
// The audit found 42 of 44 route files returned UNBOUNDED result sets: GET /api/invoices
// selected every invoice for the tenant, joined every line item, and let the browser
// filter. That is a latency cliff, a memory cliff, and it made a generic table component
// impossible because no two lists spoke the same language.
//
// This module is that language. One parser, one envelope, one allowlist-checked ORDER BY:
//
//   ?page=1&limit=50&sort=total_amount&order=desc&q=acme
//   → { data: [...], page, limit, total, pages, hasMore, sort, order, q }
//
// Sorting is ALLOWLIST-ONLY (never interpolate a client string into SQL), and `?all=1`
// exists solely for legacy aggregate callers that genuinely need the whole set — it is
// hard-capped, so it can never become another unbounded query.

const MAX_LIMIT = 200;
const ALL_CAP   = 10000;

/**
 * Parse the standard list params off a request.
 * @param {object} req  express request
 * @param {object} opts { sortable[], defaultSort, defaultOrder, searchable[], maxLimit }
 */
function parseList(req, opts = {}) {
  const sortable    = opts.sortable || [];
  const searchable  = opts.searchable || [];
  const maxLimit    = Math.min(opts.maxLimit || MAX_LIMIT, MAX_LIMIT);
  const qs          = req.query || {};

  const all   = qs.all === "1" || qs.all === "true";
  const page  = Math.max(1, parseInt(qs.page, 10) || 1);
  // Anything that isn't a positive number (0, -5, "abc", absent) means "no opinion" and
  // gets the default page size — clamping a nonsense limit to 1 row is technically
  // correct and practically useless.
  const rawLimit = parseInt(qs.limit, 10);
  const limit = all
    ? ALL_CAP
    : (Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(maxLimit, rawLimit) : (opts.defaultLimit || 50));

  const wanted = String(qs.sort || opts.defaultSort || "").trim();
  const sort   = sortable.includes(wanted) ? wanted : (opts.defaultSort || sortable[0] || null);
  const order  = String(qs.order || opts.defaultOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const q = String(qs.q || "").trim().slice(0, 120);

  return { all, page, limit, offset: all ? 0 : (page - 1) * limit, sort, order, q, sortable, searchable };
}

/** `ORDER BY <alias>.<col> <dir>` — column already validated against the allowlist. */
function orderBy(parsed, alias = "") {
  if (!parsed.sort) return "";
  const col = alias ? `${alias}.${parsed.sort}` : parsed.sort;
  // NULLS LAST on DESC keeps empty due-dates at the bottom rather than the top, which is
  // what a human means by "most recent first".
  return `ORDER BY ${col} ${parsed.order} NULLS LAST`;
}

/**
 * Case-insensitive OR-search across the allowlisted columns.
 * @returns {{clause: string, params: any[]}} clause is "" when there is nothing to search.
 */
function search(parsed, alias = "", nextParamIndex = 1) {
  if (!parsed.q || !parsed.searchable.length) return { clause: "", params: [] };
  const i  = nextParamIndex;
  const ors = parsed.searchable
    .map((c) => `COALESCE(${alias ? `${alias}.${c}` : c}::text,'') ILIKE $${i}`)
    .join(" OR ");
  return { clause: `(${ors})`, params: [`%${parsed.q}%`] };
}

/** `LIMIT $n OFFSET $n+1` plus its params. */
function paginate(parsed, nextParamIndex) {
  return { clause: `LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}`, params: [parsed.limit, parsed.offset] };
}

/** The response body every list endpoint returns. */
function envelope(data, total, parsed) {
  const t = Number(total) || 0;
  return {
    data,
    page: parsed.all ? 1 : parsed.page,
    limit: parsed.limit,
    total: t,
    pages: parsed.all ? 1 : Math.max(1, Math.ceil(t / parsed.limit)),
    hasMore: parsed.all ? false : parsed.page * parsed.limit < t,
    sort: parsed.sort,
    order: parsed.order.toLowerCase(),
    q: parsed.q || undefined,
  };
}

module.exports = { parseList, orderBy, search, paginate, envelope, MAX_LIMIT, ALL_CAP };
