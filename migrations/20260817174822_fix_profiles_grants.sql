-- Fix profiles table grants: authenticated role needs INSERT and UPDATE
-- to create and update their own profile row.
-- The handle_new_user trigger runs as SECURITY DEFINER so it can insert,
-- but the user also needs INSERT (in case trigger fails) and UPDATE (for
-- editing their profile in AccountPage).

GRANT INSERT ON profiles TO authenticated;
GRANT UPDATE ON profiles TO authenticated;
