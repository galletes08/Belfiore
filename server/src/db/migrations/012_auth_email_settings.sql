CREATE TABLE IF NOT EXISTS auth_email_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  suspicious_login_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  password_reset_emails BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO auth_email_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
