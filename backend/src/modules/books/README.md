# Books — double-entry accounting engine (`/api/books`)

The financial core of Headroom: a real **double-entry general ledger** plus everything that posts to it (invoices/bills, GST, inventory, TDS, payroll postings, fixed assets, reports). **Any money event anywhere in the app should post here** — other modules (crowdfunding, lending, …) call into this, never into the ledger tables directly.

**The one rule:** all posting goes through `posting-engine.js` → `postVoucher(tenantId, actorId, voucher, entries, opts)`. It validates that debits = credits, ledgers belong to the tenant, and the period is open. If `postVoucher` is correct, the books are correct.

**Public surface:** `index.js` — external code interacts only through it (§3.2), never the `book_*` tables.

**Key files**
- `posting-engine.js` — the only way to write to the ledger (idempotent via `opts.idempotencyKey`).
- `documents.js` — invoices/bills/receipts → balanced GST vouchers; `recordDeposit`, `ledgerIdByName`.
- `gst.js` · `reports.js` · `inventory.js` · `tds.js` · `incometax.js` — tax + statements + stock.
- `portal.js` — PUBLIC customer/vendor pages via HMAC `signToken/verifyToken` (+ exported for reuse).
- `payments.js` · `settlement.js` — payment links + gateway reconciliation.
- `llm.js` — the per-tenant LLM gateway (OpenRouter + Gemini fallback); `agents.js`/`agenttools.js` — the agent engine.
- `seed.js` / `demoseed.js` — chart of accounts + demo data.

**Tables:** `book_account_groups`, `book_ledgers`, `book_vouchers`, `book_voucher_entries`, `book_ledger_balances`, `book_periods`, `book_stock_*`, `book_payment_links`, `book_approvals`, `book_documents`, … (≈35).

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the module pattern and conventions.
