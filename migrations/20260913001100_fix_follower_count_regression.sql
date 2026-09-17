/*
# Fix regression: follower counts broke when follows privacy was fixed

## What happened
`20260913000800_fix_follows_public_exposure.sql` correctly restricted
`follows` SELECT to the row's own owner (fixing a real PII leak — anyone
could previously read every user's follow list). But `getFollowerCount()`
(used by `FollowButton` to show "42 people follow this candidate") does a
direct `count: 'exact'` query against that same table — which, after the
privacy fix, now only counts the CURRENT user's own follow row (0 or 1)
instead of the true total across all users, since RLS hides everyone else's
rows from a regular user.

This is the same shape as the RSVP privacy design used for campaign events:
the individual rows (who follows what) should stay private, but a simple
count is fine to expose publicly.

## Fix
A SECURITY DEFINER RPC that returns only the count, bypassing RLS row
visibility the same way `get_event_rsvp_count()` does.
*/

CREATE OR REPLACE FUNCTION get_follow_count(p_followable_type text, p_followable_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::integer FROM follows
  WHERE followable_type = p_followable_type AND followable_id = p_followable_id;
$$;

REVOKE ALL ON FUNCTION get_follow_count(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_follow_count(text, uuid) TO anon, authenticated;
