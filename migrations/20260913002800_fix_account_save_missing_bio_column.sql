/*
# Fix: Account page "Save" always failed -- profiles has no `bio` column

## What was found
AccountPage sends `bio` on every save (it's an editable field with a
160-character counter), and updateProfile() passes it straight to
`profiles.update(...)`. No migration ever created `profiles.bio`. PostgREST
rejects an update naming an unknown column ("Could not find the 'bio' column
of 'profiles' in the schema cache"), so saving name, ZIP, occupation, education
-- anything on that page -- failed together, every time.

## Column-level grants
On the live project, the role-escalation bug was patched through Bolt by
narrowing UPDATE on profiles to an explicit list of columns. A new column is
NOT in that list, so adding `bio` alone would leave Save failing with
"permission denied". This grants UPDATE on exactly the columns users edit
themselves, which is harmless if a table-level grant already exists and
required if it doesn't. `role` and `is_admin` are deliberately excluded (and
additionally guarded by the trigger from 20260913002700).
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_bio_length;
ALTER TABLE profiles ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 160);

GRANT UPDATE (
  full_name, zip_code, bio, occupation, education, photo_url, avatar_url,
  language_preference, theme_preference, first_name, last_name, phone,
  city, state, district_id, updated_at
) ON profiles TO authenticated;
