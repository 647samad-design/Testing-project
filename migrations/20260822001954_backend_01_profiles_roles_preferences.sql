/*
# Backend Architecture: Profiles Role System + User Preferences

## Purpose
Extend the existing `profiles` table with a proper role system and add a `user_preferences`
table for notification settings. The existing `profiles` table already has `id`, `full_name`,
`zip_code`, `is_admin`, `created_at`, `updated_at`. We add new columns without dropping any.

## Changes

### `profiles` table (ALTER — no data loss)
- Add `first_name` (text, nullable) — extracted from full_name for structured access
- Add `last_name` (text, nullable)
- Add `email` (text, nullable) — synced from auth.users
- Add `phone` (text, nullable)
- Add `city` (text, nullable)
- Add `state` (text, nullable) — two-letter abbreviation
- Add `district_id` (uuid, nullable, FK to districts) — user's home district
- Add `avatar_url` (text, nullable)
- Add `role` (text, NOT NULL DEFAULT 'user') — replaces is_admin for role management
  Allowed values: user, candidate, advertiser, admin, super_admin
- Add `deleted_at` (timestamptz, nullable) — soft delete

### New table: `user_preferences`
- One record per user
- Email/push notification toggles
- Election reminders, candidate updates, marketing emails

## Security
- `profiles.role` column: users can SELECT it but CANNOT update it (column-level restriction)
  Only admins/super_admins can change roles. This is enforced via RLS UPDATE policy
  that excludes the `role` column from user self-updates.
- `user_preferences`: owner-scoped CRUD (authenticated, auth.uid() = user_id)
- `profiles` existing RLS policies remain — we only add the role protection

## Notes
1. `is_admin` column is preserved for backward compatibility. A trigger syncs it with `role`.
2. `full_name` is preserved — new `first_name`/`last_name` are optional additions.
3. The `role` column has a CHECK constraint limiting to allowed values.
4. A trigger automatically sets `is_admin = true` when role is admin/super_admin.
*/

-- Add new columns to profiles (idempotent)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'candidate', 'advertiser', 'admin', 'super_admin'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill: set role='admin' for existing users where is_admin=true
UPDATE profiles SET role = 'admin' WHERE is_admin = true AND role = 'user';

-- Backfill: set is_admin=true for existing users where role is admin/super_admin
UPDATE profiles SET is_admin = true WHERE role IN ('admin', 'super_admin');

-- Sync email from auth.users for existing profiles
UPDATE profiles p
SET email = au.email
FROM auth.users au
WHERE p.id = au.id AND p.email IS NULL;

-- Trigger to keep is_admin in sync with role
CREATE OR REPLACE FUNCTION sync_is_admin_from_role()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_admin := NEW.role IN ('admin', 'super_admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_sync_is_admin ON profiles;
CREATE TRIGGER profiles_sync_is_admin
  BEFORE INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_is_admin_from_role();

-- Update handle_new_user to set default role
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  email_notifications boolean NOT NULL DEFAULT true,
  election_reminders boolean NOT NULL DEFAULT true,
  candidate_updates boolean NOT NULL DEFAULT true,
  marketing_emails boolean NOT NULL DEFAULT false,
  push_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_preferences" ON user_preferences;
CREATE POLICY "select_own_preferences" ON user_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_preferences" ON user_preferences;
CREATE POLICY "insert_own_preferences" ON user_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_preferences" ON user_preferences;
CREATE POLICY "update_own_preferences" ON user_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_preferences" ON user_preferences;
CREATE POLICY "delete_own_preferences" ON user_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Admin can read all preferences (for analytics)
DROP POLICY IF EXISTS "admin_read_all_preferences" ON user_preferences;
CREATE POLICY "admin_read_all_preferences" ON user_preferences FOR SELECT
  TO authenticated USING (is_admin());

-- Index
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

-- Update profiles UPDATE policy to prevent role escalation
-- Users can update their own profile EXCEPT the role column
-- We need a more restrictive update policy
DROP POLICY IF EXISTS "update_own_profile_safe" ON profiles;
CREATE POLICY "update_own_profile_safe" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    -- Non-admins cannot change their role
    (is_admin() OR role = (SELECT role FROM profiles WHERE id = auth.uid()))
  );

-- Admins can update any profile including roles
DROP POLICY IF EXISTS "admin_update_any_profile" ON profiles;
CREATE POLICY "admin_update_any_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Admins can read all profiles
DROP POLICY IF EXISTS "admin_read_all_profiles" ON profiles;
CREATE POLICY "admin_read_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (is_admin());
