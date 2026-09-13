/*
# Fix privilege escalation: revoke user-write access to is_admin column

## Summary
The `profiles.is_admin` column was writable by any authenticated user through
the Data API. Combined with the `update_own_profile` RLS policy (which allows
users to update their own row), a regular user could set `is_admin = true`
and gain admin privileges. This migration revokes UPDATE and INSERT on the
`is_admin` column from `anon` and `authenticated`, so only the service role
or a SECURITY DEFINER function can change it.

## Security
- Revokes column-level UPDATE and INSERT on `profiles.is_admin` from `anon` and `authenticated`
- Users can still update their own `full_name`, `zip_code`, and `theme_preference`
- The `is_admin()` SECURITY DEFINER function reads the column, which still works (SELECT is retained)
- The `handle_new_user` trigger inserts rows with `is_admin` defaulting to `false` (via service role), which still works

## Notes
- Safe to re-run (GRANT/REVOKE are idempotent)
*/

REVOKE UPDATE (is_admin) ON profiles FROM anon, authenticated;
REVOKE INSERT (is_admin) ON profiles FROM anon, authenticated;
