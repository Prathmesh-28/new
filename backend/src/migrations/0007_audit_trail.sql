-- MCA Rule 3(1) tamper-proof, non-disableable audit trail.
-- The books ledger is already append-only (corrections are reversing vouchers), and
-- postVoucher writes book_audit_log inside the posting transaction. This hardens that
-- log into a compliant edit log:
--   * before/after snapshots + a per-tenant hash CHAIN (row_hash = H(prev_hash | row));
--     any edit OR deletion breaks the chain and is provable to an auditor (Rule 11(g)).
--   * a trigger that BLOCKS UPDATE / DELETE / TRUNCATE so the log cannot be disabled or
--     tampered with by any application user (incl. admins) and is retained by construction
--     (8-year retention = never deleted). The app DB role is non-superuser, so it cannot
--     bypass the trigger.
ALTER TABLE book_audit_log ADD COLUMN IF NOT EXISTS before    JSONB;
ALTER TABLE book_audit_log ADD COLUMN IF NOT EXISTS after     JSONB;
ALTER TABLE book_audit_log ADD COLUMN IF NOT EXISTS prev_hash TEXT;
ALTER TABLE book_audit_log ADD COLUMN IF NOT EXISTS row_hash  TEXT;

CREATE OR REPLACE FUNCTION book_audit_log_append_only() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'book_audit_log is append-only (MCA Rule 3(1)): % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_book_audit_log_append_only ON book_audit_log;
CREATE TRIGGER trg_book_audit_log_append_only
  BEFORE UPDATE OR DELETE ON book_audit_log
  FOR EACH ROW EXECUTE FUNCTION book_audit_log_append_only();

DROP TRIGGER IF EXISTS trg_book_audit_log_no_truncate ON book_audit_log;
CREATE TRIGGER trg_book_audit_log_no_truncate
  BEFORE TRUNCATE ON book_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION book_audit_log_append_only();
