/*
# Fix privilege escalation: restrict column-level access to is_admin on profiles

## Problem
The table-level GRANT on `profiles` gives `anon` and `authenticated` INSERT and UPDATE
on ALL columns, including `is_admin`. A signed-in user could update their own profile
row and set `is_admin = true`, granting themselves admin privileges.

## Fix
1. Revoke table-level INSERT and UPDATE from `anon` and `authenticated`
2. Re-grant INSERT and UPDATE on only the safe columns (full_name, zip_code, theme_preference)
3. Re-grant INSERT on `id` so the profile row can be created (the handle_new_user trigger
   runs as SECURITY DEFINER and bypasses these grants, but the client-side sign-up flow
   also inserts into profiles, so id must be insertable)

## Security
- `is_admin` can no longer be written by anon or authenticated through the Data API
- SELECT still works on all columns (needed for is_admin() function and profile display)
- The `handle_new_user` trigger runs as SECURITY DEFINER (service_role), so it bypasses
  these grants and can still insert rows with is_admin = false
- Only the service role or a SECURITY DEFINER function can change is_admin

## Notes
- Safe to re-run (GRANT/REVOKE are idempotent)
*/

-- Revoke broad table-level write grants
REVOKE INSERT ON profiles FROM anon, authenticated;
REVOKE UPDATE ON profiles FROM anon, authenticated;

-- Re-grant INSERT only on safe columns (id is needed for profile creation)
GRANT INSERT (id, full_name, zip_code, theme_preference) ON profiles TO anon, authenticated;

-- Re-grant UPDATE only on safe columns
GRANT UPDATE (full_name, zip_code, theme_preference) ON profiles TO anon, authenticated;
