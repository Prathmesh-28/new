# Headroom

India-first **SMB finance super-app**: a single place for an Indian small-business owner (and their finance/CA/sales/ops team) to run cash flow, accounting, GST, invoicing, credit & capital — plus AI agents, automation, and an app builder on top.

> 🧭 **Read [ARCHITECTURE.md](ARCHITECTURE.md) first** — it's the map of what runs where, the directory layout, the module pattern, and a "where do I find/add X" table.

## What it does

- **Money & books** — double-entry general ledger, invoices/bills, GST returns, TDS, inventory, financial statements.
- **Cash & planning** — 90-day forecast, runway, budgets, scenarios, treasury.
- **Get paid** — invoices, receivables, collections (UPI/Razorpay links, WhatsApp nudges).
- **Credit & capital** — own SMB underwriting scorecard, embedded lending (LOS/LMS + invoice financing), rewards crowdfunding, fundraise/cap-table.
- **Run the business** — CRM/sales pipeline, ERP/manufacturing, HRMS/payroll.
- **AI & automation** — per-tenant AI agents (Agent Studio), a native workflow engine (Flows), an app builder (Studio), team chat (Collab), and a no-code BI/insights layer.

India-first rails: **Razorpay, GST/e-invoice, UPI, Account Aggregator**. Integrations that need a partner credential degrade to a "Preview" state instead of faking data.

## Stack

| Layer | Tech | Hosting |
|---|---|---|
| Frontend | React 19 · TypeScript · Vite · Tailwind | **Vercel** (web) |
| Mobile | Capacitor 7 (iOS + Android shells) | App Store / Play Store |
| Backend | Node + Express (CommonJS) | **Render** |
| Database | PostgreSQL (multi-tenant, single DB) | **Render Postgres** |

One frontend (`src/`), one backend (`backend/`). See [ARCHITECTURE.md](ARCHITECTURE.md) for the full layout.

## Backend modules

The newer backend code is organized as self-contained modules (`schema.js` + `index.js` + `http.js`), each with its own README:

| Module | What | Mount |
|---|---|---|
| [books](backend/src/modules/books/) | Double-entry GL + invoices, GST, inventory, TDS, reports — the money engine | `/api/books` |
| [crm](backend/src/modules/crm/) | Leads → deals pipeline, SLAs, tasks | `/api/crm` |
| [erp](backend/src/modules/erp/) | Manufacturing: BOMs, work orders, job cards | `/api/erp` |
| [hrms](backend/src/modules/hrms/) | Employees, attendance, leave, payroll | `/api/hrms` |
| [insights](backend/src/modules/insights/) | Cross-module KPIs + no-code BI | `/api/insights` |
| [collab](backend/src/modules/collab/) | Teams-style chat (FORCE RLS) | `/api/collab` |
| [studio](backend/src/modules/studio/) | App Builder (LLM codegen) | `/api/studio` |
| [flows](backend/src/modules/flows/) | Native workflow automation engine | `/api/flows` |
| [crowdfunding](backend/src/modules/crowdfunding/) | Rewards (pre-order) campaigns | `/api/campaigns` |
| [lending](backend/src/modules/lending/) | Embedded credit: LOS/LMS + invoice financing | `/api/lending` |
| [underwriting](backend/src/modules/underwriting/) | Agentic credit engine (library, called by `/api/credit`) | — |

Older flat routes live in `backend/src/routes/*.js`; the credit scorecard is `backend/src/lib/underwriting.js`. The full route list is the `app.use(...)` block in `backend/src/server.js`.

## Quick start

```bash
npm install
npm run dev          # Vite dev server (frontend)
npm run typecheck    # tsc -b   (root `tsc --noEmit` is a no-op — always use this)
npm test             # vitest
npm run build        # tsc -b && vite build  — the real gate before deploy

# Backend (needs DATABASE_URL + JWT_SECRET in env):
cd backend && npm install && node src/server.js

# Mobile:
npm run mobile:ios   # build + cap sync + open Xcode  (also :android)
```

## Multi-tenancy, roles & gating

- Every table has `tenant_id`; every query filters by it (`req.user.tenant_id` from the JWT). super_admin can act cross-tenant.
- Roles: `super_admin · owner · finance_manager · accountant · sales · operations_manager · viewer · investor`. Reads are open to members; **writes use a per-domain `WRITE_ROLES`** array in each module's `http.js`.
- All money posts through `books` `postVoucher()` (idempotent). Credentialed integrations are reported by `routes/capabilities.js` (Live vs Preview).

See [ARCHITECTURE.md](ARCHITECTURE.md) for details and request/money-flow traces.

## Deploy

Push-to-deploy on `main`: **Vercel** builds the frontend, **Render** builds the backend. Secrets live in Render/Vercel env — never in the repo (`.gitignore` blocks `.env`, `*.pem`, `*-adminsdk-*.json`, keystores, etc.).

## Docs

All planning, setup & reference docs live in **[`docs/`](docs/)** (operational guides at the top, historical plans/audits under `docs/archive/`).

## License

Proprietary — all rights reserved.
