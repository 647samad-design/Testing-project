# BallotLens — Security / RLS Audit Notes
_Pass performed Sept 13, 2026. This is a code-level review of the migrations in this repo, not a
full penetration test — a professional security review is still recommended before handling real
election data at scale (see "Recommended before launch" below)._

## 🔴 Critical finding — fixed in this batch (found via live testing, Sept 14)

**`is_admin()` was uncallable by regular users, breaking almost every RLS policy in the app.**
`20260815031241_revoke_execute_on_security_definer_functions.sql` revoked EXECUTE on
`is_admin()` from `anon`/`authenticated`, on the incorrect assumption that RLS policy
expressions run with the table owner's privileges. They don't — they run as part of the
querying role's own query, so that role still needs EXECUTE on any function the policy
calls, SECURITY DEFINER or not. Since nearly every policy in the schema calls `is_admin()`,
this broke almost all reads/writes for real users (confirmed live: `permission denied for
function is_admin`, SQL state 42501, on `profiles`, `advertisements`, and others).

**Fix applied:** `20260913000500_fix_is_admin_execute_permission.sql` re-grants EXECUTE on
`is_admin()` to `anon` and `authenticated`. Safe to do — the function takes no arguments and
only ever reports the caller's own admin status.

**Action needed from you:** run this migration on your live project — this is the one
actually causing the 403 errors you're seeing right now.

## 🔴 Critical finding — fixed in this batch (role-column privilege escalation)
The original `is_admin` privilege-escalation bug (Aug 15) was correctly patched by revoking
column-level UPDATE/INSERT on `profiles.is_admin` from regular users. When a `role` column was
added later (Aug 22) with a trigger that auto-syncs `is_admin` from `role`, the matching
column-level REVOKE was never actually applied — only claimed in a comment. Any authenticated
user could run `UPDATE profiles SET role = 'admin' WHERE id = auth.uid()` and become an admin.

**Fix applied:** `20260913000300_fix_role_column_privilege_escalation.sql` revokes user
write access to `role` the same way it was revoked for `is_admin`, and updates the new
`set_admin_role()` RPC to keep both columns in sync going forward.

**Action needed from you:** run the new migrations against the live Supabase project, then
verify with a non-admin test account that `UPDATE profiles SET role = 'admin' ...` fails.

## ✅ What's already solid
- All 101 tables in the schema have Row Level Security enabled — good baseline hygiene.
- Payment-sensitive tables (`payments`, `stripe_webhook_events`, `revenue_transactions`) are
  admin/service-role only, with no user-writable policies.
- The Stripe webhook verifies the signature before trusting any event (prevents forged
  "payment succeeded" calls).
- No hardcoded API keys, service-role keys, or Stripe secret keys anywhere in the codebase —
  everything server-side goes through environment/edge-function secrets.
- No exposed `.env` file was committed (only `.env.example` with placeholders).

## 🟡 Lower-priority recommendations (not urgent, worth doing before a wider launch)
1. **`SET search_path` on trigger functions.** `handle_new_user()` and
   `sync_is_admin_from_role()` are `SECURITY DEFINER` but don't pin `search_path`, which is a
   defense-in-depth best practice against search_path hijacking. Lower risk here since they're
   fired only by Supabase Auth/table triggers, not called with attacker-controlled arguments —
   but worth tidying up in a future migration.
2. **Storage bucket audit.** Only `candidate-photos` (added in this batch) has been reviewed in
   detail. If other buckets exist in the live project (avatars, attachments, etc.), they should
   get the same public-read / owner-or-admin-write review.
3. **Rate limiting on public write endpoints** (candidate claims, messages, feed posts) isn't
   visible at the SQL layer — worth confirming Supabase's built-in rate limits are enabled, or
   adding application-level throttling, before launch to reduce spam/abuse risk.
4. **Formal review of `SECURITY DEFINER` functions as a set.** There are 4 in the codebase
   (`handle_new_user`, `sync_is_admin_from_role`, `log_admin_action`, `set_admin_role`). Each
   was reviewed individually here; a second pass by another engineer before launch is good
   practice for anything that runs with elevated privileges.

## Recommended before launch
This pass covers the SQL/RLS layer only. A full pre-launch security review should also cover:
- Edge function input validation (beyond what's shown here) and abuse/rate-limit testing.
- Frontend auth flows (session handling, password reset, email verification).
- Dependency vulnerability scan (`npm audit` or similar) on the current package set.
- A basic penetration test pass once the app is on a staging domain.
