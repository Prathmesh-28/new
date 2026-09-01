"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const lq = require("./listQuery");

const req = (query) => ({ query });
const OPTS = {
  sortable: ["created_at", "total_amount", "due_date"],
  defaultSort: "created_at",
  searchable: ["invoice_number", "customer_name"],
};

test("defaults are a sane first page", () => {
  const p = lq.parseList(req({}), OPTS);
  assert.equal(p.page, 1);
  assert.equal(p.limit, 50);
  assert.equal(p.offset, 0);
  assert.equal(p.sort, "created_at");
  assert.equal(p.order, "DESC");
});

test("page/limit are clamped, so a client cannot ask for the whole table", () => {
  assert.equal(lq.parseList(req({ limit: "5000" }), OPTS).limit, lq.MAX_LIMIT);
  // Nonsense limits fall back to the default page size, not to a single row.
  assert.equal(lq.parseList(req({ limit: "0" }), OPTS).limit, 50);
  assert.equal(lq.parseList(req({ limit: "-5" }), OPTS).limit, 50);
  assert.equal(lq.parseList(req({ limit: "abc" }), OPTS).limit, 50);
  assert.equal(lq.parseList(req({ page: "-3" }), OPTS).page, 1);
  assert.equal(lq.parseList(req({ page: "abc" }), OPTS).page, 1);
});

test("offset follows page and limit", () => {
  const p = lq.parseList(req({ page: "4", limit: "25" }), OPTS);
  assert.equal(p.offset, 75);
});

test("sort is allowlist-only - an injected column falls back to the default", () => {
  const p = lq.parseList(req({ sort: "total_amount; DROP TABLE invoices" }), OPTS);
  assert.equal(p.sort, "created_at");
  assert.equal(lq.orderBy(p, "i"), "ORDER BY i.created_at DESC NULLS LAST");
});

test("an allowlisted sort is honoured, in both directions", () => {
  assert.equal(lq.orderBy(lq.parseList(req({ sort: "due_date", order: "asc" }), OPTS), "i"),
    "ORDER BY i.due_date ASC NULLS LAST");
  assert.equal(lq.orderBy(lq.parseList(req({ sort: "due_date", order: "nonsense" }), OPTS), "i"),
    "ORDER BY i.due_date DESC NULLS LAST");
});

test("search parameterises the term instead of interpolating it", () => {
  const p = lq.parseList(req({ q: "o'brien" }), OPTS);
  const s = lq.search(p, "i", 2);
  assert.match(s.clause, /i\.invoice_number::text,''\) ILIKE \$2/);
  assert.match(s.clause, /i\.customer_name/);
  assert.deepEqual(s.params, ["%o'brien%"]);
});

test("no search term produces no clause", () => {
  assert.deepEqual(lq.search(lq.parseList(req({}), OPTS), "i", 2), { clause: "", params: [] });
});

test("a very long search term is truncated rather than passed through", () => {
  const p = lq.parseList(req({ q: "x".repeat(500) }), OPTS);
  assert.equal(p.q.length, 120);
});

test("paginate emits the right placeholders and params", () => {
  const p = lq.parseList(req({ page: "2", limit: "10" }), OPTS);
  assert.deepEqual(lq.paginate(p, 3), { clause: "LIMIT $3 OFFSET $4", params: [10, 10] });
});

test("the envelope reports totals the UI can show verbatim", () => {
  const p = lq.parseList(req({ page: "2", limit: "10" }), OPTS);
  const e = lq.envelope([{ id: 1 }], 34, p);
  assert.equal(e.total, 34);
  assert.equal(e.pages, 4);
  assert.equal(e.hasMore, true);
  assert.equal(lq.envelope([], 20, p).hasMore, false); // page 2 of 2 is the last
});

test("all=1 is capped, single-page, and never claims there is more", () => {
  const p = lq.parseList(req({ all: "1" }), OPTS);
  assert.equal(p.limit, lq.ALL_CAP);
  assert.equal(p.offset, 0);
  const e = lq.envelope([], 999999, p);
  assert.equal(e.pages, 1);
  assert.equal(e.hasMore, false);
});
