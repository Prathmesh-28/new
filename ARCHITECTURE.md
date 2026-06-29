# Headroom — Architecture Map

> India-first SMB finance super-app. This file is the map: **what** runs, **where** to find it, and **how** the pieces fit. Start here before diving into code.

## 1. Stack & where it runs

| Layer | Tech | Deployed to | Entry point |
|---|---|---|---|
| **Frontend** | React 19 · TypeScript · Vite · Tailwind | **Vercel** (web) + **Capacitor 7** (iOS/Android) | `src/main.tsx` → `src/App.tsx` |
| **Backend** | Node + Express (CommonJS) | **Render** | `backend/src/server.js` |
| **Database** | PostgreSQL (multi-tenant, single DB) | **Render Postgres** | `backend/src/db.js` |
| **Native shells** | Capacitor | App Store / Play Store | `ios/`, `android/` |

There is **exactly one backend** — the Node/Express app in `backend/`. (Older notes mention a Django service; it does not exist in this repo.)

## 2. Repo map (top level)

```
src/            Frontend React app (the web + mobile UI)
backend/        The Node/Express API + Postgres schema  ← the live backend
ios/ android/   Capacitor native shells (generated; rarely hand-edited)
public/         Static web assets served as-is
assets/         Brand/marketing assets
scripts/        Build/ops helper scripts
docs/           All planning, setup & reference docs (see docs/, docs/archive/)
*.config.* etc  Vite, TS, Tailwind, Capacitor, Vercel, Render config at root
```

## 3. Frontend (`src/`)

```
src/
  App.tsx          Route table (lazy-loaded pages) + auth/route guards
  main.tsx         React entry
  features/<x>/    ONE folder per feature/page (64 of them: dashboard, credit,
                   capital, gst, agents, flows, crowdfunding, lending, …)
  components/       Shared UI (layout/Sidebar.tsx = nav, ai/, PreviewBadge, …)
  context/          React context providers (AppContext, AuthContext, Capabilities…)
  pages/            Top-level non-feature pages (Login, Signup, Public* pages)
  lib/              api.ts (fetch wrapper), utils, apiBase
  data/             Static data, types, role config
  hooks/            Reusable hooks (useFeatureState, …)
```

- **Routing**: every page is `lazy(() => import("@/features/…"))` and wired in `src/App.tsx`. Public (no-auth) routes (`/login`, `/c/:token`, …) sit before the authed catch-all.
- **Navigation IA**: `src/components/layout/Sidebar.tsx` defines 7 job-named groups + a temporary "Extras" group. **Many routes are intentionally hidden from the sidebar but still live** and reachable via ⌘K search (`components/CommandPalette.tsx`) and direct URL — a missing nav item does **not** mean a deleted page.
- **API calls**: always through `src/lib/api.ts` (`api.get/post/patch/delete`), which adds the auth header and base URL.
- **Live vs Preview**: features whose backing credential isn't configured render a `<PreviewBadge>` instead of faking data (see `context/CapabilitiesContext.tsx`).

## 4. Backend (`backend/src/`)

```
backend/src/
  server.js          Express app: middleware + 48 `app.use("/api/…")` mounts. Read this to see every route group.
  db.js              PG pool + initDb() — applies every module's SCHEMA on boot.
  middleware/        auth.js (authenticate, role gates), security.js
  routes/            37 "flat" route files (the older style): one Express router each
                     (auth, invoices, gst, credit, capital, collections, …)
  modules/           The newer, self-contained domain modules (see pattern below)
  lib/               Cross-cutting helpers: razorpay, whatsapp, email, forecast,
                     underwriting (the SMB credit scorecard), jwt, audit, …
```

### The module pattern (`backend/src/modules/<name>/`)
The newer code is organized as **modules**, each a self-contained trio:

| File | Responsibility |
|---|---|
| `schema.js` | exports a `*_SCHEMA` SQL string; applied in `db.js` `initDb()` |
| `index.js` | data layer + business logic (tenant-scoped functions, a typed `*Error` class) |
| `http.js` | the Express router (`authenticate`, `tenantOf()`, per-domain `WRITE_ROLES`, `fail()`) — mounted in `server.js` |

**Modules:** `books` (double-entry GL — the accounting engine everything money-related posts to), `crm`, `erp`, `hrms`, `insights`, `collab` (team chat), `studio` (app builder), `flows` (workflow automation engine), `underwriting` (agentic credit engine), `crowdfunding` (rewards campaigns), `lending` (LOS/LMS + invoice financing).

> **`books` is the heart of money.** Any cash/revenue/liability event posts a balanced voucher via `modules/books/posting-engine.js` `postVoucher()`. New money features should post to the GL, not invent parallel state.

## 5. Cross-cutting conventions

- **Multi-tenancy**: every table has `tenant_id TEXT`; every query filters by it. `req.user.tenant_id` comes from the JWT (`middleware/auth.js`). super_admin can act cross-tenant via `?tenant_id=`.
- **Roles & write gates**: reads are open to members; writes use a **per-domain `WRITE_ROLES`** array in each `http.js` (NOT the older `requireOwnerOrAdmin`). Sensitive actions add tighter gates (e.g. vetting → super_admin/accountant).
- **Capabilities gating**: `routes/capabilities.js` reports which integrations are Live (credential present) vs Preview. **Never fake a gated integration** (money rails, KYC, bureau, WhatsApp) — degrade to manual/preview instead.
- **Idempotency**: money/webhook paths use idempotency keys (e.g. `postVoucher({idempotencyKey})`, unique `payment_ref`) so retries don't double-post.
- **Automation**: the `flows` module is the in-app workflow/BRE engine; events (`invoice.paid`, …) are emitted via `flows/runner.js`.

## 6. Two flows worth tracing

- **A typical request**: UI (`api.post`) → `server.js` mount → route/`http.js` → `authenticate` + `WRITE_ROLES` → `index.js` (tenant-scoped query) → JSON back.
- **A money event** (e.g. invoice paid): Razorpay webhook (`routes/collections.js`) → verify HMAC → mark paid → `postVoucher` (GL) → emit `invoice.paid` (Flows) → side effects (e.g. `lending.onInvoicePaid` auto-recovers an invoice advance).

## 7. "Where do I add / find X?"

| I want to… | Go to |
|---|---|
| Add a backend feature | a new `backend/src/modules/<name>/{schema,index,http}.js` + mount in `server.js` + schema in `db.js` |
| Add a page | `src/features/<name>/` + lazy route in `src/App.tsx` (+ nav in `Sidebar.tsx` if it should be visible) |
| Post to the ledger | `modules/books/posting-engine.js` `postVoucher()` |
| Gate a feature on a credential | add a flag in `routes/capabilities.js` + `<PreviewBadge>` in the UI |
| See every API route | `backend/src/server.js` (the `app.use` block) |
| Understand the credit scorecard | `backend/src/lib/underwriting.js` + `modules/underwriting/` |

## 8. Local dev

```bash
npm install
npm run dev          # Vite dev server (frontend)
npm run typecheck    # tsc -b   (root tsc --noEmit is a no-op — always use this)
npm test             # vitest
npm run build        # tsc -b && vite build  (the real gate before deploy)
# backend:
cd backend && npm install && node src/server.js   # needs DATABASE_URL + JWT_SECRET
```

Deploys are push-to-deploy: **Vercel** builds `src/` on push to `main`; **Render** builds `backend/`. Secrets live in Render/Vercel env (never in the repo — `.gitignore` blocks `.env`, `*.pem`, `*-adminsdk-*.json`).
