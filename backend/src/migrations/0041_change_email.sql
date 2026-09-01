-- Wave 14 leftovers: changing your sign-in email, safely. There was no way to do it at
-- all — a founder who lost access to an old work address was stuck. The new address must
-- prove it can receive mail BEFORE it becomes the login, and the old address is told.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email_otp        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email_otp_expiry TIMESTAMPTZ;
