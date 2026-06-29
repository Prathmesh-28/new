# Insights — KPIs + no-code BI (`/api/insights`)

Two layers:
1. **Cross-module KPI overview** — finance (from `books`), sales (from `crm`), people (from `hrms`), computed **live** so it always reconciles with the source modules.
2. **No-code BI** — saved dashboards, queries (run against curated datasets), and charts.

**Files:** `index.js` (KPI computation + query runner) · `http.js` · `schema.js`.

**Key routes:** `GET /overview`, `GET /metrics`, dashboards CRUD, `POST /query/run`, saved queries + `POST /queries/:id/run`, charts.

**Tables:** `insights_dashboards`, `insights_queries`, `insights_charts` (the overview itself is computed, not stored).

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the module pattern.
