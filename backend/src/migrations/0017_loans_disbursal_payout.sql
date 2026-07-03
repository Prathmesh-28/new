-- Link a loan to its disbursal on the shared payouts rail (modules/payouts). For invoice
-- financing this tracks the lender→SMB transfer that actually puts cash in the SMB's bank; the
-- SMB-side GL (Dr Bank / Cr Borrowings) is still posted by lending.postDisbursal. Existing DBs
-- get the column here; fresh DBs get it from lending/schema.js. Idempotent.
ALTER TABLE loans ADD COLUMN IF NOT EXISTS disbursal_payout_id UUID;
