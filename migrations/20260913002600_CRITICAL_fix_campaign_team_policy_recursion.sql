/*
# CRITICAL: infinite recursion in campaign_team RLS broke 10+ tables for
# every signed-in user

## What was found
Replaying every migration against a real Postgres and then running a
SELECT/INSERT/UPDATE/DELETE against every table as `authenticated` produced:

    ERROR: infinite recursion detected in policy for relation "campaign_team"

Root cause: campaign_team's own policies (SELECT `read_own_campaign_team`,
and INSERT/UPDATE/DELETE) contained `EXISTS (SELECT 1 FROM campaign_team ...)`.
A subquery on a table that has RLS re-applies that table's policies, which
contain the same subquery, forever. The SELECT policy was introduced by
20260913000800 when closing the invited_email privacy leak: the leak fix was
right, the way it was written was not.

Because RLS expansion happens when a query is planned -- not per row -- a
policy that mentions campaign_team fails for *every* query touching that
table, regardless of data. Every other table whose policy checks team
membership inherited the failure. For signed-in (not anonymous) users this
broke:
  campaign_team            (the Team tab)
  campaigns / campaign_events / campaign_event_rsvps   (candidate Campaign tab)
  feed_posts               (posting, editing, deleting updates)
  candidate_promises, candidate_claim_analysis
  candidate_quiz_answers, candidate_questionnaire_answers  (quiz matching)
  profile_views            (analytics)
Logged-out browsing was unaffected, which is why it never showed up in
casual testing, and several callers swallow errors and render an empty state.

## Note on the live database
On the live project this recursion was first patched directly through Bolt
(helpers named is_campaign_team_member / is_verified_claimant). The helpers
here use an rls_ prefix so this migration can't collide with those (CREATE OR
REPLACE fails if an existing function's parameter names differ), and applying
it makes the live policies match the repository again.

## Fix
Membership checks move into SECURITY DEFINER functions. They read
campaign_team/candidate_claims as the table owner, so they don't re-enter
RLS, and every policy calls the function instead of subquerying the table.
The policies keep exactly the same meaning as before:
  SELECT : admin, an active team member of that candidate, or its verified claimant
  INSERT : Management must be active AND (verified claimant OR team manager)
  UPDATE/DELETE : verified claimant OR team manager
*/

CREATE OR REPLACE FUNCTION rls_is_verified_claimant(p_candidate_id uuid)
RETURNS boolean SECURITY DEFINER STABLE SET search_path = public LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM candidate_claims cc
    WHERE cc.candidate_id = p_candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified'
  );
$$;

CREATE OR REPLACE FUNCTION rls_is_active_team_member(p_candidate_id uuid)
RETURNS boolean SECURITY DEFINER STABLE SET search_path = public LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaign_team ct
    WHERE ct.candidate_id = p_candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION rls_is_team_manager(p_candidate_id uuid)
RETURNS boolean SECURITY DEFINER STABLE SET search_path = public LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaign_team ct
    WHERE ct.candidate_id = p_candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active'
      AND ct.role IN ('candidate', 'campaign_manager')
  );
$$;

REVOKE ALL ON FUNCTION rls_is_verified_claimant(uuid), rls_is_active_team_member(uuid), rls_is_team_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rls_is_verified_claimant(uuid), rls_is_active_team_member(uuid), rls_is_team_manager(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "read_own_campaign_team" ON campaign_team;
CREATE POLICY "read_own_campaign_team" ON campaign_team FOR SELECT
  TO authenticated USING (
    is_admin() OR rls_is_active_team_member(candidate_id) OR rls_is_verified_claimant(candidate_id)
  );

DROP POLICY IF EXISTS "insert_campaign_team" ON campaign_team;
CREATE POLICY "insert_campaign_team" ON campaign_team FOR INSERT
  TO authenticated WITH CHECK (
    has_active_management(candidate_id)
    AND (rls_is_verified_claimant(candidate_id) OR rls_is_team_manager(candidate_id))
  );

DROP POLICY IF EXISTS "update_campaign_team" ON campaign_team;
CREATE POLICY "update_campaign_team" ON campaign_team FOR UPDATE
  TO authenticated
  USING (rls_is_verified_claimant(candidate_id) OR rls_is_team_manager(candidate_id))
  WITH CHECK (rls_is_verified_claimant(candidate_id) OR rls_is_team_manager(candidate_id));

DROP POLICY IF EXISTS "delete_campaign_team" ON campaign_team;
CREATE POLICY "delete_campaign_team" ON campaign_team FOR DELETE
  TO authenticated USING (rls_is_verified_claimant(candidate_id) OR rls_is_team_manager(candidate_id));
