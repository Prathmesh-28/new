-- Posting-engine DB hardening (architecture doc §4.2 "every voucher balances, enforced at
-- write time"). The engine already validates balance in validateEntries, and the DB already
-- enforces per-line integrity (chk_book_one_side) + idempotency (UNIQUE tenant_id,
-- idempotency_key). This adds the last invariant at the database: a voucher's debits MUST
-- equal its credits. It is a DEFERRABLE constraint trigger (checked at COMMIT) because the
-- rule spans multiple rows — all of a voucher's lines are inserted before commit, so valid
-- postings pass and any future code path that bypasses the engine cannot leave an unbalanced
-- voucher in the ledger.
CREATE OR REPLACE FUNCTION book_voucher_balanced() RETURNS trigger AS $fn$
DECLARE d NUMERIC; c NUMERIC;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c
    FROM book_voucher_entries WHERE voucher_id = NEW.voucher_id;
  IF d <> c THEN
    RAISE EXCEPTION 'voucher % is unbalanced: debit % <> credit %', NEW.voucher_id, d, c
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_book_voucher_balanced ON book_voucher_entries;
CREATE CONSTRAINT TRIGGER trg_book_voucher_balanced
  AFTER INSERT ON book_voucher_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION book_voucher_balanced();
