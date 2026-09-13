/*
# Fix re-opened privilege escalation via `profiles.role`

## What was found
`fix_is_admin_privilege_escalation.sql` (Aug 15) correctly revoked user write
access to `profiles.is_admin` after finding that any user could set it directly.

Later, `backend_01_profiles_roles_preferences.sql` (Aug 22) added a new `role`
column plus a trigger (`sync_is_admin_from_role`) that automatically sets
`is_admin = true` whenever `role` is 'admin' or 'super_admin'. Its own migration
notes claim "users can SELECT it but CANNOT update it (column-level restriction)... 
enforced via RLS UPDATE policy" — but no such restriction was actually added.
RLS policies filter which ROWS a query can touch, not which COLUMNS; the
existing `update_own_profile` policy only checks `auth.uid() = id`.

Net effect: any authenticated user could run
  UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
which passes RLS (it's their own row), and the trigger would then set
`is_admin = true` — silently reopening the exact bug that was already patched
once, through a different column.

## Fix
Apply the same column-level REVOKE pattern used for `is_admin` to `role`:
only the service role or a SECURITY DEFINER function may change it. The
`set_admin_role` RPC (added in this same batch of migrations) is updated to
keep `role` and `is_admin` in sync, since both are read in different places
in the codebase.

## Verification
After this migration, `UPDATE profiles SET role = 'admin' WHERE id = auth.uid()`
run as an authenticated user must fail with a permission error.
*/

REVOKE UPDATE (role) ON profiles FROM anon, authenticated;
REVOKE INSERT (role) ON profiles FROM anon, authenticated;

-- Keep `role` and `is_admin` consistent when an admin uses the safe RPC.
CREATE OR REPLACE FUNCTION set_admin_role(
  target_user_id uuid,
  new_is_admin boolean
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can change admin roles';
  END IF;

  IF target_user_id = auth.uid() AND new_is_admin = false THEN
    RAISE EXCEPTION 'Admins cannot remove their own admin status';
  END IF;

  UPDATE profiles
  SET is_admin = new_is_admin,
      role = CASE
        WHEN new_is_admin THEN 'admin'
        WHEN role IN ('admin', 'super_admin') THEN 'user'
        ELSE role
      END,
      updated_at = now()
  WHERE id = target_user_id;

  INSERT INTO audit_log (admin_id, action, target_table, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN new_is_admin THEN 'grant_admin' ELSE 'revoke_admin' END,
    'profiles',
    target_user_id::text,
    jsonb_build_object('new_is_admin', new_is_admin)
  );
END;
$$;

REVOKE ALL ON FUNCTION set_admin_role(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_admin_role(uuid, boolean) TO authenticated;
