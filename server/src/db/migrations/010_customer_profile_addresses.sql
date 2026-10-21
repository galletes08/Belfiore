-- Existing customer forms previously persisted these objects only in the browser.
-- Store the same shapes against the authenticated user; no legacy ownership is guessed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_profile JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS saved_addresses JSONB NOT NULL DEFAULT '[]';
