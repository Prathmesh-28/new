# Lending — SMB embedded credit (`/api/lending`)

SMB embedded lending built on the existing scorecard + books GL: **LOS** (offers + RBI-style Key Fact Statement) and **LMS** (loans, amortization/bullet schedule, repayments, DPD buckets), anchored on the **invoice-financing wedge** (self-liquidating — the loan links to a `source_invoice_id` and auto-recovers when that invoice is paid, via `onInvoicePaid`, hooked from the Razorpay `invoice.paid` path).

**Eligibility** reuses the deterministic scorecard (`lib/underwriting.js`). **GL is SMB-side** (disbursal `Dr Bank / Cr Borrowings`; repayment `Dr Borrowings + Dr Interest Expense / Cr Bank`), best-effort + idempotent, degrading when the chart isn't seeded. Disbursal / e-NACH / payout rails are **credential-gated** (capabilities) and never faked.

**Files:** `index.js` (KFS, amortize/bullet, offers, loans, repayment allocation, DPD, auto-collect, guarded GL) · `http.js` · `schema.js`.

**Key routes:** `GET /eligibility`, offers (`POST /offers`, `/offers/:id/accept|decline`), loans (`GET /loans/:id`, `POST /loans/:id/repay`).

**Tables:** `loan_offers`, `loans`, `loan_schedule`, `loan_repayments`.

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the module pattern.
