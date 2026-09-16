/*
# Fix: a canceled Candidate Management subscription didn't hide the campaign page

## What was found
The public SELECT policies on `campaigns` and `campaign_events` only checked
the `is_active` flag, never whether the candidate's Management subscription
was actually still active. Once created, a campaign page (and its events)
would stay publicly visible forever — even after the candidate canceled
Management — unless an admin manually flipped `is_active` to false by hand.
Since this is meant to be a paid, subscription-gated feature (like the rest
of Candidate Management), visibility should track the subscription the same
way write access already does.

## Fix
Add `has_active_management()` to both public read policies, alongside the
existing `is_active` flag. `is_active` still lets a candidate/team hide the
page themselves without losing their content; the subscription check now
also enforces the paywall on the read side, not just the write side.
*/

DROP POLICY IF EXISTS "public_read_active_campaigns" ON campaigns;
CREATE POLICY "public_read_active_campaigns" ON campaigns FOR SELECT
  TO anon, authenticated USING (
    is_admin()
    OR (is_active = true AND has_active_management(campaigns.candidate_id))
  );

DROP POLICY IF EXISTS "public_read_campaign_events" ON campaign_events;
CREATE POLICY "public_read_campaign_events" ON campaign_events FOR SELECT
  TO anon, authenticated USING (
    is_admin()
    OR (is_public = true AND has_active_management(campaign_events.candidate_id))
  );
