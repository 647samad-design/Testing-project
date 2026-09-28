/*
# CRITICAL: any signed-in user could still make themselves an admin

## What was found
Two earlier "fixes" for this (20260815142914 and 20260913000300) did not
actually work. Replaying the migrations on a real Postgres and attempting
    UPDATE profiles SET is_admin = true, role = 'admin' WHERE id = auth.uid()
as an ordinary `authenticated` user succeeded, and that account then passed
every is_admin() check in the system.

Two independent reasons:
1. Both fixes relied on column-level `REVOKE UPDATE (is_admin) / (role)`.
   In PostgreSQL a column-level REVOKE cannot remove a privilege that was
   granted on the whole table, and new tables in the public schema get a
   table-level grant to `authenticated` by default (this is Supabase's
   default), so those REVOKEs are no-ops.
2. An `update_own_profile_safe` policy was added to block role changes, but
   the original permissive `update_own_profile` policy (CHECK only
   `auth.uid() = id`) was never dropped. Permissive policies are OR'd, so
   the safe one could never restrict anything -- the same "added the new
   rule, left the old one" mistake as candidate_submissions earlier.

## Fix
- Drop the permissive `update_own_profile` policy.
- A BEFORE INSERT/UPDATE trigger rejects any change to `is_admin` or `role`
  when the statement runs as `anon` or `authenticated`. It does not depend on
  privileges or on which policies exist. The legitimate paths keep working
  because they run as a different database role: `set_admin_role()` and
  `handle_new_user()` are SECURITY DEFINER (owner), and edge functions use
  the service role.
*/

DROP POLICY IF EXISTS "update_own_profile" ON profiles;

CREATE OR REPLACE FUNCTION protect_profile_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.is_admin IS TRUE OR NEW.role IS DISTINCT FROM 'user' THEN
        RAISE EXCEPTION 'Not allowed to set admin status or role' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not allowed to change admin status or role' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_admin_columns ON profiles;
CREATE TRIGGER profiles_protect_admin_columns
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_admin_columns();
