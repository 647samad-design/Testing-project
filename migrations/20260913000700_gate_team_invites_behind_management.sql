/*
# Fix: team invites had no Candidate Management paywall at all

## What was found
The client's confirmed pricing model (Option B) is explicit: claiming a
profile is free, and inviting a campaign team is a feature that only unlocks
with the paid Candidate Management ($299) tier. But `campaign_team`'s INSERT
policy only checked that the caller had a *verified claim* on the candidate —
any claimant, on the free tier, could already invite team members with no
Management subscription at all. There was also no UI anywhere in the app to
actually do this (fixed separately in the Candidate Portal).

## Fix
Add a `has_active_management(candidate_id)` helper and require it in the
`insert_campaign_team` policy for the person doing the inviting (the existing
"already-active team member with candidate/campaign_manager role" branch is
also gated the same way, since if the underlying subscription lapses, the
team should stop being able to add more people).
*/

CREATE OR REPLACE FUNCTION has_active_management(p_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM candidate_management_subscriptions
    WHERE candidate_id = p_candidate_id
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION has_active_management(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION has_active_management(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "insert_campaign_team" ON campaign_team;
CREATE POLICY "insert_campaign_team" ON campaign_team FOR INSERT
  TO authenticated WITH CHECK (
    has_active_management(campaign_team.candidate_id)
    AND (
      EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = campaign_team.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified'
      )
      OR EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = campaign_team.candidate_id AND ct.user_id = auth.uid()
          AND ct.status = 'active' AND ct.role IN ('candidate', 'campaign_manager')
      )
    )
  );
