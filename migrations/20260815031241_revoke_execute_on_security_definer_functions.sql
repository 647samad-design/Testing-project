/*
# Fix: Revoke public EXECUTE on SECURITY DEFINER helper functions

## Summary
Two SECURITY DEFINER helper functions (`is_admin()` and `handle_new_user()`)
were callable by the `anon` and `authenticated` roles via the PostgREST RPC
endpoint (`/rest/v1/rpc/...`). This allowed any visitor or signed-in user to
invoke these privileged functions directly through the API, which is not
intended.

## Changes
- `REVOKE EXECUTE` on `public.is_admin()` from `PUBLIC`, `anon`,
  `authenticated`. This function is only used inside RLS policy predicates
  (evaluated server-side by the table owner) and must not be callable via REST.
- `REVOKE EXECUTE` on `public.handle_new_user()` from `PUBLIC`, `anon`,
  `authenticated`. This function is only fired by the `on_auth_user_created`
  trigger on `auth.users` (run by the trigger owner) and must not be callable
  via REST.

## Security
- Neither function is exposed via `/rest/v1/rpc/` after this change.
- `is_admin()` continues to work inside RLS policies because policy
  expressions are evaluated with the table owner's privileges.
- `handle_new_user()` continues to work as a trigger because triggers execute
  with the trigger owner's privileges.

## Notes
- `service_role` and `postgres` retain EXECUTE (they inherit via `PUBLIC`
  revocation only removing grants for anon/authenticated; the owner always has
  implicit EXECUTE). If needed, an explicit `GRANT EXECUTE TO service_role`
  can be added later, but the owner (postgres) always retains execution rights.
*/

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;