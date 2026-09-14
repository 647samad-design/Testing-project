/*
# Fix: users could give themselves a free paid subscription

## What was found
`subscriptions` (the table that records what plan a user is on) had RLS
policies letting a user INSERT or UPDATE their *own* row with `USING/WITH
CHECK (auth.uid() = user_id OR is_admin())` — this only checks row
*ownership*, not which values are being written. Any signed-in user could
run, from the browser:

  UPDATE subscriptions SET plan = 'pro_yearly', status = 'active' WHERE user_id = auth.uid();

...and grant themselves a paid tier without ever going through Stripe. The
Stripe webhook (which is the only thing that should ever write this table)
runs with the service role and bypasses RLS entirely, so it never needed
these self-write policies in the first place — they were a pure liability.

## Fix
Remove the "self" clause from INSERT and UPDATE policies, leaving only
`is_admin()`. SELECT is untouched (a user reading their own billing status is
correct and necessary — that's exactly what the new Account "Billing" tab
uses). DELETE was already admin-only.

## Verification
After this migration, as a non-admin user:
  UPDATE subscriptions SET plan = 'pro_yearly' WHERE user_id = auth.uid();
must fail (0 rows affected / RLS violation), while
  SELECT * FROM subscriptions WHERE user_id = auth.uid();
must still return their own row.
*/

DROP POLICY IF EXISTS "insert_own_subscription" ON subscriptions;
CREATE POLICY "admin_insert_subscription" ON subscriptions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "update_own_subscription" ON subscriptions;
CREATE POLICY "admin_update_subscription" ON subscriptions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
