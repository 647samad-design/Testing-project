/*
# CRITICAL FIX: any user could self-verify their own candidate claim

## What was found
`update_own_claim`'s WITH CHECK was `user_id = auth.uid() OR is_admin()` --
it verified the row belonged to the caller, but placed NO restriction on
WHICH FIELDS could change. This meant any authenticated user could:
  1. Submit a claim for any candidate (status defaults to 'pending')
  2. Immediately run their own UPDATE, setting status directly to
     'verified' -- completely bypassing admin review
  3. Gain full claimed-candidate access: team invites, feed posting,
     photo uploads, analytics, campaign pages, profile extras -- every
     "verified claimant" feature built in this project checks exactly
     this status field.

This is the same class of bug as the earlier profiles.role and
subscriptions self-write findings, except this one was never caught until
now, and is arguably more severe: it's the entry point to nearly every
paid and unpaid candidate-side feature in the app.

Also found in the same audit: the admin dashboard tab literally labeled
"Review Claims" doesn't review candidate_claims at all -- it shows
unverified candidate POSITIONS (a different concept entirely). There was
no admin UI anywhere to approve or reject an actual profile-ownership
claim. Fixed in the application code alongside this migration.

## Fix
Split the single overly-permissive UPDATE policy into two: a non-admin can
only touch their OWN claim while it stays pending, and only if it STAYS
pending (they can never set status to verified or rejected themselves) --
admins get a separate, unrestricted UPDATE policy.
*/

DROP POLICY IF EXISTS "update_own_claim" ON candidate_claims;

CREATE POLICY "update_own_pending_claim" ON candidate_claims FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "admin_update_any_claim" ON candidate_claims FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
