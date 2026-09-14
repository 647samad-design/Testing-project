/*
# Fix: is_admin() EXECUTE revoke broke almost every RLS policy in the app

## What was found (live, via Supabase logs — SQL state 42501)
`20260815031241_revoke_execute_on_security_definer_functions.sql` revoked
EXECUTE on `public.is_admin()` from `anon` and `authenticated`, on the
assumption that "policy expressions are evaluated with the table owner's
privileges." That assumption is incorrect for PostgreSQL row-level security:
a USING/WITH CHECK expression runs as part of the querying role's own query
plan, so any function it calls — including one marked SECURITY DEFINER — must
still be directly EXECUTE-able by that role. SECURITY DEFINER only changes
whose privileges are used *inside* the function body (so it can read
`profiles` regardless of the caller's own RLS); it does not waive the
caller's need for EXECUTE to invoke the function at all.

Because nearly every RLS policy in this schema calls `is_admin()` in its
USING or WITH CHECK clause, revoking EXECUTE from anon/authenticated broke
almost all of them — every read or write on `profiles`, `advertisements`,
and most other tables fails with "permission denied for function is_admin"
(confirmed in the project's own Postgres logs, SQL state 42501). This is a
pre-existing bug from before this review, not something introduced by the
other migrations in this batch — it just hadn't been exercised against a
live project until now.

## Fix
Re-grant EXECUTE on `public.is_admin()` to `anon` and `authenticated`. This
is safe: the function takes no arguments and only ever reports the *calling*
user's own admin status via `auth.uid()` — being directly callable via
`/rest/v1/rpc/is_admin` doesn't expose anything a user doesn't already know
about themselves, and it's required for RLS policies to work at all for
non-superuser roles.

`handle_new_user()` is NOT touched here — that revoke was correct. It's only
invoked by the `on_auth_user_created` trigger, which doesn't require the
inserting session to hold EXECUTE on the trigger function, so it was never
part of this bug.
*/

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
