# Crowdfunding — rewards (pre-order) campaigns (`/api/campaigns`)

Rewards crowdfunding: an SMB pre-sells a product/perk to raise money. A **backer is a customer, not an investor** (own tables — never touches the equity cap-table). **A paid pledge is a LIABILITY (advance), recognised as INCOME only on fulfilment** — posted to the books GL.

**Money model & gating:** Keep-it-All ships today (immediate capture); All-or-Nothing authorize-hold + refunds + creator payout are credential-gated. GL postings are best-effort + idempotent and degrade (`gl_voucher_id` null) when the tenant's chart of accounts isn't seeded. The Razorpay webhook (`routes/collections.js`) settles paid pledges by `notes.campaign_id`.

**Files:** `index.js` (lifecycle + GL) · `http.js` (tenant routes + PUBLIC token routes) · `schema.js`.

**Public (no auth):** `GET /public/:token`, `POST /public/:token/pledge` — reuses `books/portal` `signToken/verifyToken`. The frontend backer page is `/c/:token`.

**Lifecycle:** `draft → pending_review → approved → active|preview → closed_pending_settlement → funded | refunding → …` (the `status` enum is the state machine).

**Tables:** `crowd_campaigns`, `crowd_perks`, `crowd_backers`.

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the module pattern.
