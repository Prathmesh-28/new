# Payouts — the shared money-rail

The single module every "money out to a beneficiary" feature calls. Before this, the four callers
each had a stub/comment and no real lifecycle:

- **lending disbursal** (`modules/lending/index.js` → `acceptOffer`) — tracks the lender→SMB transfer
- **BNPL supplier payout** (`routes/bnpl.js` → `/drawdown`)
- **EWA advance** (`routes/ewa.js` → `/request`)
- **treasury sweep** (`routes/treasury.js` → `/sweep`)
- generic **vendor/refund** payouts (`POST /api/payouts/:kind/request`)

## Design

- **State machine**: `pending → queued → processing → settled / failed / reversed / cancelled`.
- **Idempotent** on the caller's business key (`disburse:<loan>`, `bnpl:<drawdown>`, `ewa:<emp>:<YYYY-MM>`)
  via `uq_payout_requests_idem` — a retry never double-sends.
- **Provider seam** (`providers.js`): RazorpayX (`lib/razorpayx.js`) + Setu (`lib/setuPayout.js`).
  Both are **gated** on env creds. With none, `resolve()` returns `manual` and the payout stays
  `pending` until an operator confirms it (`POST /api/payouts/:id/settle`). **We never fabricate a
  settlement.** This mirrors `lending/mandates.js`.
- **GL on confirmed settlement only** (`postSettlementGl`, idempotent `payout:<id>`):
  - `ewa` → Dr Employee Advances / Cr Bank
  - `treasury` → Dr Investments / Cr Bank
  - `bnpl` → Dr Sundry Creditors / Cr Borrowings (lender fronts it; no bank leg)
  - `vendor`/`refund`/`other` → Dr Sundry Creditors / Cr Bank
  - `disbursal` → **skipped** (the lending module already books cash-in / Borrowings)
  Best-effort: degrades to no-op when the chart isn't seeded (mirrors lending).
- **Webhook** (`/webhook/payout`, public): fail-closed HMAC verify over `req.rawBody`; reads
  `notes.tenant_id` + provider ref off the signed payload and advances the payout idempotently.
- **RLS**: `payout_requests` + `payout_events` are FORCE-RLS (migration `0016`); all access via
  `q(tenantId, …)`.

## Env (all optional — absence = manual mode)

- `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAYX_ACCOUNT_NUMBER`, `RAZORPAYX_WEBHOOK_SECRET`
- `SETU_CLIENT_ID` + `SETU_CLIENT_SECRET` (+ `SETU_PAYOUT_PRODUCT_INSTANCE_ID`, `SETU_PAYOUT_BASE`), `SETU_WEBHOOK_SECRET`

## UI

`src/features/payouts/PayoutsPage.tsx` (route `/payouts`, nav under *Money & Books*): rail status
(Live vs Manual), payout history, and — the live path in manual mode — operator **Settle / Fail /
Retry** actions.
