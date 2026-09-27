/*
# CRITICAL FIX: advertisers could self-activate ads with zero content review

## What was found
Same self-approval shape as the candidate_claims/submissions/events/
questionnaire findings: `update_own_ads` let an advertiser update their own
ad row with no restriction on the `status` field. An advertiser could set
status directly to 'active', and it would immediately start showing to
real voters (`public_read_active_ads` has no other gate beyond
`status = 'active'`). For a platform whose entire premise is nonpartisan,
unbiased information, a paid-ad channel with zero content moderation is a
real integrity risk -- anyone could pay for an ad slot and publish anything.

## Fix
Advertisers can still freely draft, submit for review ('pending'), or pause
their own ad -- only admins can ever move status to 'active' or 'rejected'.
*/

DROP POLICY IF EXISTS "update_own_ads" ON advertisements;

CREATE POLICY "advertiser_update_own_ad" ON advertisements FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
    AND status IN ('draft', 'pending', 'paused')
  );

CREATE POLICY "admin_update_any_ad" ON advertisements FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- No column existed to record why an ad was rejected — admins had no way
-- to leave the advertiser a reason, matching the admin_notes pattern
-- already used on candidate_claims/candidate_submissions.
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS admin_notes text;
