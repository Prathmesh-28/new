# CRM — leads → deals pipeline (`/api/crm`)

Sales CRM: accounts & contacts, leads → deals (pipeline) → won/lost, SLAs, tasks, notes, and a unified activity timeline. Domain logic ported from **Frappe CRM** (SLA business-hours calc, lead→deal conversion, status-change logging).

**Files:** `index.js` (data layer) · `http.js` (routes) · `schema.js`.

**Key routes:** `GET /pipeline`, accounts/contacts/leads/deals CRUD, `POST /leads/:id/convert`, `POST /deals/:id/stage`, `GET /leads/:id/timeline`.

**Tables:** `crm_accounts`, `crm_contacts`, `crm_leads`, `crm_deals`, `crm_tasks`, `crm_notes`, `crm_slas`, `crm_status_change_log`, `crm_activities`.

Note: the deal pipeline shares `crm_deals` with the `/sales` page (`SalesHub` folds CRM + Pipeline into tabs).

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the module pattern.
