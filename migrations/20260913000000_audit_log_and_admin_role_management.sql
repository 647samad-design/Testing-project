/*
# Audit log + safe admin role management

## Purpose
1. Record every admin action (verify/flag/add/edit/delete/role-change) for accountability.
2. Let an existing admin grant/revoke admin status for another user WITHOUT reopening the
   privilege-escalation hole that was fixed in `fix_is_admin_privilege_escalation.sql`.
   The `profiles.is_admin` column stays locked down at the column-grant level; the only way
   to flip it is the `set_admin_role` SECURITY DEFINER function below, which re-checks
   `is_admin()` itself on every call.
3. Let admins list all profiles (needed for a "manage admins" screen) without granting
   blanket profile access to everyone.

## New Tables
### `audit_log`
- `id` (uuid PK), `admin_id` (uuid FK -> profiles, nullable so a deleted admin's history
  survives), `action` (text), `target_table` (text, nullable), `target_id` (text, nullable),
  `details` (jsonb, nullable), `created_at` (timestamptz)

## New Functions
- `log_admin_action(action, target_table, target_id, details)` — SECURITY DEFINER, callable
  by any authenticated admin; inserts a row with `admin_id = auth.uid()`.
- `set_admin_role(target_user_id, new_is_admin)` — SECURITY DEFINER. Verifies the caller is
  currently an admin, refuses to let an admin remove their own admin flag (prevents accidental
  lockout), updates `profiles.is_admin`, and writes an audit_log entry.

## Security
- `audit_log`: admin-only SELECT; no direct INSERT/UPDATE/DELETE grants — rows are only
  created via the `log_admin_action` SECURITY DEFINER function.
- `profiles`: adds an admin-read-all SELECT policy alongside the existing "select own" policy.
  This does NOT touch the column-level REVOKE on `is_admin` from the earlier migration —
  admins still cannot UPDATE the column directly through the Data API, only through
  `set_admin_role`.
*/

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_table text,
  target_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_audit_log" ON audit_log;
CREATE POLICY "admin_read_audit_log" ON audit_log FOR SELECT
  TO authenticated USING (is_admin());

-- No INSERT/UPDATE/DELETE policies for regular clients on purpose:
-- rows are only ever created via the SECURITY DEFINER function below,
-- which runs as the table owner and bypasses RLS.

CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_table, target_id);

-- Admins can list all profiles (read-only) for the "manage admins" screen.
DROP POLICY IF EXISTS "admin_select_all_profiles" ON profiles;
CREATE POLICY "admin_select_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (is_admin());

-- Log an admin action. Any authenticated admin may call this; it always
-- stamps admin_id = auth.uid(), so callers cannot forge another admin's id.
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action text,
  p_target_table text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can write audit log entries';
  END IF;

  INSERT INTO audit_log (admin_id, action, target_table, target_id, details)
  VALUES (auth.uid(), p_action, p_target_table, p_target_id, p_details);
END;
$$;

REVOKE ALL ON FUNCTION log_admin_action(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_admin_action(text, text, text, jsonb) TO authenticated;

-- Grant or revoke admin status. Only callable by an existing admin.
-- Refuses self-demotion so an admin can never accidentally lock themselves out.
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

  UPDATE profiles SET is_admin = new_is_admin, updated_at = now()
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
