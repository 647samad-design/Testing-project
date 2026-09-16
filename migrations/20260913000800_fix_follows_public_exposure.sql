/*
# Fix: two tables had personal/private data publicly exposed, and caused
  real query bugs as a result

## Finding 1 — follows table
`follows`' SELECT policy was `USING (true)` for both `anon` and `authenticated`
— meaning anyone, logged in or not, could read every user's follow
relationships via the public REST API (`GET /rest/v1/follows?select=*`),
including whose account (`user_id`) follows which candidates and issues. This
directly contradicts the platform's own privacy commitment (see the Privacy
Policy's "Political Content & Nonpartisanship" section) not to expose or
profile users' political interests.

It also caused two real, guaranteed-to-trigger bugs in `src/services/social.ts`
because neither query filtered by `user_id`, relying entirely on that
overly-broad RLS policy:
- `isFollowing()` uses `.maybeSingle()` with no user_id filter. As soon as a
  candidate or issue has more than one follower across the whole platform,
  this throws a "multiple (or no) rows returned" error for every user
  checking their own follow state on that item — not an edge case, this was
  going to happen on any popular candidate.
- `getFollowingIds()` had no user_id filter either, so it returned the
  followable_ids of EVERY user's follows for that type, not just the current
  user's — meaning "candidates you follow" UI could show items other people
  follow, not the signed-in user's own list.

No feature in the codebase actually needs public follow visibility (no
"N followers" counter reads this table), so this was purely a bug, not an
intentional design choice.

## Fix
1. Restrict `follows` SELECT to the row's own owner or an admin.
2. Add explicit `user_id` filters in `isFollowing()` and `getFollowingIds()`
   (in `social.ts`) so correctness doesn't depend solely on RLS.
*/

DROP POLICY IF EXISTS "read_follows" ON follows;
CREATE POLICY "read_own_follows" ON follows FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

/*
## Also found in the same sweep: campaign_team exposed personal emails publicly
`campaign_team.invited_email` (the personal email address of anyone invited to
a candidate's campaign team — staff, volunteers, managers) was readable by
literally anyone, including logged-out visitors, via
`GET /rest/v1/campaign_team?select=*`. No feature in the codebase needs public
visibility into who's on a campaign team or their contact emails — the
Candidate Portal's Team tab only needs to show this to the team itself.

Fix: restrict SELECT to the candidate's own (active) team members, the
verified claimant, or an admin.
*/
DROP POLICY IF EXISTS "read_campaign_team" ON campaign_team;
CREATE POLICY "read_own_campaign_team" ON campaign_team FOR SELECT
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM campaign_team ct2
      WHERE ct2.candidate_id = campaign_team.candidate_id
        AND ct2.user_id = auth.uid()
        AND ct2.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = campaign_team.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  );
