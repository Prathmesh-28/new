## Platform Admin (`/admin`) — 21 tools

Super-admin console giving platform-wide visibility and control across every tenant/company on the platform. Stakeholders: super_admin (guarded by `canAccess("admin")`, redirects to `/` otherwise). Backend: `/api/admin/*` (stats/companies/users-reset) + `/api/users` (CRUD/role) on `BASE`, plus `useFeatureState` KV (device-synced) for admin-config tools, and the live `useApp().store` for activity-derived views.

The console is a 21-tab array (`TABS`). Each tab below is one tool.

- **Platform Overview** (`overview`) — no inputs → renders 6 aggregate stat cards (Companies, Total Users, Aggregate Cash, Aggregate Revenue, Open Receivables, Transactions) and a "Users by role" distribution from `byRole`, sorted desc → platform-wide totals. _Persist: none (read-only)._ _Class: Backend._ Hits real `GET /api/admin/stats`.

- **Companies** (`companies`) — search box (company/owner/tenant) → loads company roster with per-tenant cash/revenue/receivables/txns/user_count; **Inspect** button calls `setSelectedClient(tenant_id, name)` and navigates to `/dashboard` to impersonate/edit that company → sortable table. _Persist: live (impersonation writes save to that company)._ _Class: Backend._ Hits real `GET /api/admin/companies`; Inspect mutates app context.

- **Users** (`users`) — search (email/tenant/role) + **Create user** form (email, role from `ROLE_META`, optional tenant_id); per-row inline role `<select>` (changeRole), **reset password** (KeyRound, reveals temp password once), **delete** (Trash2, confirm) → user roster table with status (Pending login / Active). _Persist: live store._ _Class: Backend._ Hits real `GET/POST/PATCH/DELETE /api/users`, `POST /api/admin/users/:id/reset`.

- **CA Workspace** (`ca-workspace`, #174) — invite form (name*, email*, firm, role: ca/advisor/bookkeeper) → adds advisor (status "invited"), per-advisor toggle client-tenant access chips (from real companies list), Mark active, Remove (confirm) → advisor cards + 4 stat cards (Advisors/Active/Pending/Client Mappings). _Persist: KV `admin-ca-advisors`._ _Class: KV._ Reads companies via `/api/admin/companies`; advisor records are KV-only, not real auth grants.

- **Usage Analytics** (`usage`, #175) → 4 stat cards (Active 7d/30d via `last_activity`, Dormant, Total Txns), "Most Engaged Companies" ranked bar chart (score = txns + users×5, top 8), "Platform Adoption Signals" bars → engagement view. _Persist: none._ _Class: Backend (derived)._ Hits real `GET /api/admin/stats` and `/api/admin/companies`; rankings/scores computed client-side.

- **Data Retention** (`retention`, #176) — 4 numeric inputs (transaction years, invoice years, audit-log days, inactive-user days) + 4 toggles (auto-purge, encrypt-at-rest, consent tracking, data localisation) + DPO email; **Save & mark reviewed** stamps `lastReviewed`; emits IT-Act/GST/DPDP compliance warnings → policy form. _Persist: KV `admin-retention-policy`._ _Class: Indicative._ No backend; controls are advisory ("Confirm with your CA before enabling auto-purge").

- **Feature Flags** (`flags`, #177) — per-flag enable/disable toggle + rollout % slider (0–100) for 6 seeded flags (ai-copilot, whatsapp-bot, aa-underwriting, b2b-bnpl, tally-plugin, multi-currency) → 4 stat cards (Total/Enabled/Disabled/Avg Rollout) + flag list. _Persist: KV `adm-feature-flags`._ _Class: KV._ No backend; flags stored in KV only, not enforced server-side.

- **Announcements** (`announce`, #178) — compose form (title, message, severity: info/warning/critical) → publishes platform banner (active), per-item Unpublish/Republish + Delete → announcement cards. _Persist: KV `adm-announcements`._ _Class: KV._ "Published to all tenants" is KV-local; no broadcast backend.

- **Audit Log** (`audit-log`, #179) — filter (All/Transactions/Invoices) → reconstructs financial-event log from `store.transactions` + `store.invoices`, newest-first, max 200 → table (When/Type/Actor/Event). _Persist: none._ _Class: Indicative._ Sourced from synced store, not a true server audit trail.

- **Seats & Quotas** (`quotas`, #180) — editable numeric limits for seats / companies / transactions → 3 usage meters comparing live stat consumption vs editable caps (over-limit highlighted). _Persist: KV `adm-seat-limit`, `adm-company-limit`, `adm-txn-quota`._ _Class: KV (usage from Backend)._ Usage from `/api/admin/stats` (passed-in `stats`); limits KV-only, "enforcement happens server-side on the billing plan" (not actually wired).

- **System Health** (`health`, #181) — **Re-run checks** button → live-probes 3 APIs (`/api/admin/stats`, `/api/admin/companies`, `/api/users`) measuring OK/FAIL + latency ms, computes all-ok banner + avg ms; plus Data Footprint cards from `stats` → health board. _Persist: none._ _Class: Backend._ Genuine live fetch probes against real endpoints.

- **Maintenance** (`maintenance`, #182) — Enable/Disable toggle (stamps `since`), editable tenant notice textarea, "allow super-admins through" checkbox, live banner preview → maintenance state. _Persist: KV `adm-maintenance`._ _Class: Simulated._ Toggle/notice are KV-only; tenants are not actually gated.

- **Role Permissions** (`permissions`, #183) — pick a role (from `ROLE_META`) → toggle 7 capabilities (view_finance, edit_txns, manage_invoices, file_compliance, manage_team, export_data, manage_capital) with per-role defaults; super_admin locked to all-allowed; Reset to defaults → capability matrix. _Persist: KV `adm-role-permissions`._ _Class: Indicative._ "Advisory in the client; server-side enforcement follows your plan."

- **Login History** (`login-history`, #184) — no inputs → synthesises one most-recent sign-in per user from the live roster, deterministic via a hash of id/email (device, city, ts, ~1-in-9 failed, never-logged-in for first_login) → 4 stat cards + table. _Persist: none._ _Class: Simulated._ Roster is real (`GET /api/users`) but device/location/timestamps/outcomes are fabricated; "Wire to your auth provider's session log for full history."

- **Import Jobs** (`import-jobs`, #185) — enqueue form (file name, source: csv/tally/bank/gst, rows) → queue job (status queued→running→completed via Advance, Fail, Retry, Remove) → 4 status stat cards + jobs table. _Persist: KV `adm-import-jobs`._ _Class: Simulated._ No real import pipeline; statuses are manually stepped, no rows processed.

- **Config Snapshot** (`config-snapshot`, #186) — no inputs → assembles read-only JSON of platform stats + KV admin settings (quotas, maintenance, retention, feature flags); **Copy** to clipboard + **Download JSON** file → JSON `<pre>` + 4 summary cards. _Persist: none (reads KV + stats)._ _Class: Backend + KV._ Platform block from real `stats`; rest read from KV stores.

- **Error Log** (`error-log`, #187) — filter (All/Errors/Warnings) → derives operational signals from `store` (bank-sync error/pending, overdue invoices, flagged transactions), newest-first max 200 → 4 stat cards (Errors/Warnings/Total/Health) + table. _Persist: none._ _Class: Indicative._ Derived from synced store data, not a real error/exception log.

- **Notification Templates** (`notify-templates`, #197) — per-template Edit (subject/body with `{{tokens}}`) + Enable/Disable toggle for 3 seeded templates (welcome email, invoice-due WhatsApp, password-reset email) → template cards. _Persist: KV `adm-notify-templates`._ _Class: KV._ Templates stored in KV; not connected to a real send pipeline.

- **Plan Usage** (`plan-usage`, #198) — plan tier `<select>` (Starter/Growth/Scale) → 4 stat cards (Active Plan + MRR, Seats Used vs cap, Companies vs cap, Transactions) + consumption bars vs plan caps with near-limit warning. _Persist: KV `adm-active-plan`._ _Class: Backend + KV._ Usage from real `stats`/`companies`; tier selection & pricing are KV/static (no billing backend).

- **API Keys** (`api-keys`, #199) — create form (label, scope: read / read-write) → client-generates `sk_live_…` secret (revealed once), table of keys with prefix/scope/created/status; Revoke (confirm) + Delete → key list. _Persist: KV `adm-api-keys`._ _Class: Simulated._ Secrets are `Math.random`-generated client-side; no server-issued, functional API credentials.

- **Onboarding** (`onboarding`, #200) — 6-item go-live checklist (owner invited, company profile, bank connected, team added, data imported, production-ready); 4 items auto-tick ("auto" badge, disabled) from live `stats`/`store`, others manually toggled → progress bar + checklist. _Persist: KV `adm-onboarding-checklist`._ _Class: Backend (auto-derive) + KV._ Auto items derive from real `stats.users`/`store.bankAccounts`/`store.transactions`/`store.invoices`; manual ticks in KV.

### Classification summary
- **Backend (real `/api/admin` or `/api/users`):** Platform Overview, Companies, Users, System Health (live probes).
- **Backend-derived (real data, client-computed):** Usage Analytics, Plan Usage (usage side), Onboarding (auto items), Config Snapshot (platform block).
- **KV (device-synced settings, no backend enforcement):** CA Workspace, Feature Flags, Announcements, Seats & Quotas (limits), Notification Templates, Role Permissions, Data Retention.
- **Indicative (advisory / reconstructed-from-store):** Data Retention, Audit Log, Error Log, Role Permissions.
- **Simulated (fabricated or non-functional):** Maintenance, Login History, Import Jobs, API Keys.
