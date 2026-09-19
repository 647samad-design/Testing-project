/*
# Free-tier watchlist limit (client-confirmed: 5 followed candidates)

## Important correction
"Save a candidate to your watchlist" on the Pricing page maps to the
`follows` table (followable_type='candidate') via <FollowButton> on the
candidate profile page — NOT the separate `saved_candidates` table, which
has a service function (`saveCandidate` in districts.ts) but is never
called from any UI and has no button anywhere. `saved_candidates` is dead
code (same shape as the `ads.ts` finding from an earlier audit); the real,
working "save to watchlist" feature is Follow.

## Purpose
Client decision: free users can follow up to 5 candidates; Candidate/Pro
subscribers get unlimited. Enforced at the database level (not just in the
UI) so it can't be bypassed by calling the API directly. Following issues
(the other `follows` type) is NOT limited — this cap applies to candidates only.

## New function
`can_follow_more_candidates(p_user_id)` — true if the user has an active
paid plan, OR currently follows fewer than 5 candidates.

## Changed policy
`insert_own_follows` on `follows` now also requires
`followable_type != 'candidate' OR can_follow_more_candidates(auth.uid())`
— so following issues is unaffected, only candidates are capped.
*/

CREATE OR REPLACE FUNCTION can_follow_more_candidates(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = p_user_id
        AND status = 'active'
        AND plan IN ('candidate_monthly', 'candidate_yearly', 'pro_monthly', 'pro_yearly', 'premium_monthly', 'premium_yearly')
    )
    OR (
      SELECT COUNT(*) FROM follows
      WHERE user_id = p_user_id AND followable_type = 'candidate'
    ) < 5;
$$;

REVOKE ALL ON FUNCTION can_follow_more_candidates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_follow_more_candidates(uuid) TO authenticated;

DROP POLICY IF EXISTS "insert_own_follows" ON follows;
CREATE POLICY "insert_own_follows" ON follows FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND (followable_type != 'candidate' OR can_follow_more_candidates(auth.uid()))
  );
