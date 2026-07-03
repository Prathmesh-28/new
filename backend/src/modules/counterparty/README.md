# Counterparty intelligence

One surface for knowing who you trade with. Mounted at `/api/counterparty`.

## What's real now (from the tenant's own ledger)
- **Entity-group dedup** (`/dedupe-groups`) — PAN extracted from GSTIN groups multi-GSTIN entities
  and name-variant duplicates (`lib/counterpartyDedupe.js`).
- **Payment-behaviour scores** (`/scores`) — per-customer grade / on-time % / outstanding +
  portfolio receivables quality (`lib/customerScore.js`).
- **Risk summary** (`/risk-summary`) — dedup summary + receivables quality in one call.
- **Anchor-led invites** (`/invite`, `/invites`) — invite a dealer/supplier; sent best-effort over
  whatever messaging channel is configured (email / WhatsApp), recorded either way with a join link.

## Gated (never faked)
- **Registry enrichment** (`/enrich`, `/enrichments`) — GSTN filing status, MCA extract, GSP GSTIN
  validation, Udyam lookup. Each needs `<KIND>_API_KEY` + `<KIND>_API_BASE`; without them a lookup
  is recorded as `gated` (we never fabricate registry data). When configured, `providers.js` performs
  a real HTTP GET against the operator's endpoint and caches the result (TTL) in
  `counterparty_enrichments`. `/providers` reports live-vs-off honestly.

## Storage
`counterparty_enrichments` + `counterparty_invites` are FORCE-RLS (migration `0019`); all access via
`q(tenantId, …)`.

## UI
`src/features/network/NetworkPage.tsx` → "Counterparty Intelligence" tab: dedup/score KPIs, worst-payer
table, gated enrichment lookup, and the invite loop.
