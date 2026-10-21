ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_email_login BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
DO $$
DECLARE account RECORD; candidate TEXT; suffix INTEGER;
BEGIN
  FOR account IN SELECT id,email FROM users WHERE role='rider' AND username IS NULL ORDER BY id LOOP
    candidate:='rider-'||account.id; suffix:=0;
    WHILE EXISTS(SELECT 1 FROM users WHERE LOWER(username)=LOWER(candidate)) LOOP
      suffix:=suffix+1; candidate:='rider-'||account.id||'-'||suffix;
    END LOOP;
    UPDATE users SET username=candidate,legacy_email_login=(NULLIF(BTRIM(email),'') IS NOT NULL) WHERE id=account.id;
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(LOWER(username)) WHERE username IS NOT NULL;
-- An old rider email link must not bypass the new administrator-assisted recovery policy.
UPDATE auth_password_resets SET used_at=clock_timestamp() WHERE used_at IS NULL AND user_id IN (SELECT id FROM users WHERE role='rider');
ALTER TABLE auth_security_events ADD COLUMN IF NOT EXISTS actor_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE auth_security_events ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
