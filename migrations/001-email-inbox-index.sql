-- Keeps exact-address inbox polling within the D1 free tier as the email table grows.
-- Verified against the live query plan on 2026-09-20.
CREATE INDEX IF NOT EXISTS idx_email_to_email_type_is_del_id
ON email(to_email COLLATE NOCASE, type, is_del, email_id DESC);
