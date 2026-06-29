## CA / Advisor Workspace (`/advisor`) — 18 tools

A multi-tenant CA practice console where an accountant manages a portfolio of client businesses — viewing each client's cash health, triaging cross-client alerts, batch-filing GST, tracking compliance deadlines and tasks, accepting matched leads, and invoicing — all white-labelled under the firm's branding. Stakeholders: accountant/CA, super_admin (gated by role; others redirect to `/dashboard`). Backend: `/api/advisor` (clients, alerts, gst-status, marketplace, report-preview) + browser `localStorage` (KV).

### Header / portfolio-wide
- **Firm Setup (branding modal)** — opens `FirmProfileModal`; inputs firm name (required), tagline, GSTIN → saved branding reused on white-label client reports; renders a one-time setup prompt banner when no firm name is set. _Persist: `localStorage["hr_ca_firm"]`._ _Class: KV._
- **Add Client (link tenant)** — form: client Tenant ID (required) + optional display name → `POST /api/advisor/clients` adds the business to the CA's portfolio, then reloads list. _Persist: Backend (live store)._ _Class: Backend._
- **Portfolio summary stats** — derived from loaded clients/alerts → four read-only cards: Total Clients, Need Attention (alerts>0 or runway<45d), Active Alerts (severity≠low), Pre-qualified count. _Persist: none._ _Class: Backend._

### Clients tab
- **Client list (At-Risk / Healthy buckets)** — `GET /api/advisor/clients` → renders `ClientCard`s split into "Needs Attention" (unread alerts or runway<45d) and "Healthy" sections, each showing balance, runway badge, alert count, UW credit score, pre-qualified badge, top-alert message. _Persist: Backend (live store)._ _Class: Backend._
- **Client → Forecast (multi-tenant switch)** — per-card "Forecast" button → `setSelectedClient(tenant_id, label)` then navigates to `/forecast`, impersonating that client's context. _Persist: AppContext (live store)._ _Class: Backend._
- **Client Report (white-label)** — per-card "Report" button opens `ReportModal`; `GET /api/advisor/clients/:tenantId/report-preview` → renders firm-letterhead monthly report (cash balance, revenue, expenses, net-position bar, active alerts). _Persist: none._ _Class: Preview._
- **Report Download PDF / Email Client** — modal buttons → toast only ("PDF will be emailed shortly" / "Report emailed to <client>"); no file/email actually generated. _Persist: none._ _Class: Simulated._
- **Remove client (unlink)** — per-card "Remove" button → `window.confirm` then `DELETE /api/advisor/clients/:tid`, reloads list. _Persist: Backend (live store)._ _Class: Backend._

### Alert Feed tab
- **Cross-client alert feed** — `GET /api/advisor/alerts` → read-only severity-coloured list (severity · client label · date · message) across the whole portfolio; tab badge counts non-low alerts. _Persist: Backend (live store)._ _Class: Backend._

### Bulk GST tab (`BulkGstTab`)
- **GSTR-3B status board** — `GET /api/advisor/gst-status` → per-client rows: status pill (filed/pending), net liability, GSTN ARN; expandable to a CGST/SGST/IGST split (CGST=SGST=50% of liability, IGST=0, computed client-side); header banner shows month, days-to-20th due date, pending/filed counts, total liability; footer totals. _Persist: Backend (live store) for status; breakdown computed locally._ _Class: Backend (liability split = Indicative)._
- **Prepare All** — header button → 1.5s artificial delay then success toast ("GSTR-3B prepared for all clients"); no filing performed. _Persist: none._ _Class: Simulated._
- **Prepare <client>'s GSTR-3B** — per-row expanded button → success toast directing to client's GST tab; no filing. _Persist: none._ _Class: Simulated._

### Practice tab (`PracticeTab`)
- **Compliance Calendar (deadline matrix)** — `complianceDeadlines(today)` generates next ~12 statutory deadlines (GSTR-3B 20th, TDS 7th, PF 15th, ROC Jun 30, Advance Tax Jun/Sep/Dec 15, ITR Jul 31) × every linked client, colour-coded by days-left. _Persist: none (computed from system date + client list)._ _Class: Indicative._
- **Document Requests** — for first 3 clients, static doc list (bank statement, sales invoices, TDS cert) each with "Send link" → success toast only. _Persist: none._ _Class: Simulated._
- **Task Board (kanban)** — add task (client dropdown, type gst/tds/audit/advisory/itr/roc/other, title, deadline); advance todo→inprogress→done; delete; To Do / In Progress / Done columns with overdue/due-today/days-left badges. _Persist: `localStorage["hr_ca_tasks"]`._ _Class: KV._

### Marketplace tab (`MarketplaceTab`)
- **Lead feed** — `GET /api/advisor/marketplace` → leads enriched client-side with synthetic reason, revenue tier, match score (70–99%), and est. annual fee (₹60k/120k/240k); shows name, city, industry, join date. _Persist: Backend (raw leads); enrichment computed locally._ _Class: Backend (enrichment = Indicative)._
- **Accept / Pass lead** — Accept → success toast w/ potential fee + marks accepted (in-memory Set); Pass → marks declined and hides (in-memory Set); neither persisted nor sent to backend. _Persist: none (component state only, lost on reload)._ _Class: Simulated._

### Billing tab (`BillingTab`)
- **Invoice management** — new invoice (client dropdown, amount, description, due date) → draft; advance draft→sent→paid; "UPI link" copies a payment-link toast; KPI cards Total Invoiced / Outstanding / Collected; table of all bills. _Persist: `localStorage["hr_ca_bills"]` (UPI link itself = Simulated toast)._ _Class: KV._
