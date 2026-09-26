/*
# Fix: any logged-in user could submit fake content for ANY candidate

## What was found
`candidate_get_to_know`, `candidate_funding_sources`, and
`candidate_endorsements` all had `WITH CHECK (true)` on their INSERT
policies — meaning any authenticated user, not just a verified claimant of
that specific candidate, could submit a "get to know" answer, a funding
source, or an endorsement for ANY candidate in the database. Submissions do
sit behind a `status = 'pending'` moderation gate before they're publicly
visible (so this wasn't an immediate public-facing exploit), but it still
meant literally anyone could spam the admin review queue with fabricated
content attributed to a candidate who has no relationship to the submitter
at all — e.g. a rival campaign submitting fake "endorsements" for another
candidate, or funding sources designed to look damaging.

## Fix
Restrict INSERT on all three tables to a verified claimant of that specific
candidate_id — the same ownership check already used correctly elsewhere
(`campaign_team`, `campaign_events`).
*/

DROP POLICY IF EXISTS "insert_get_to_know_authenticated" ON candidate_get_to_know;
CREATE POLICY "insert_get_to_know_own_candidate" ON candidate_get_to_know FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_get_to_know.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  );

DROP POLICY IF EXISTS "insert_funding_authenticated" ON candidate_funding_sources;
CREATE POLICY "insert_funding_own_candidate" ON candidate_funding_sources FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_funding_sources.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  );

DROP POLICY IF EXISTS "insert_endorsements_authenticated" ON candidate_endorsements;
CREATE POLICY "insert_endorsements_own_candidate" ON candidate_endorsements FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_endorsements.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  );
