-- Additive only: existing accounts, credentials and audit history are unchanged.
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_profile_image_path TEXT;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND conname='users_staff_photo_managed_key') THEN
  ALTER TABLE users ADD CONSTRAINT users_staff_photo_managed_key CHECK
   (staff_profile_image_path IS NULL OR staff_profile_image_path ~ '^staff/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$');
 END IF;
END $$;
