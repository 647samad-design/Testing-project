/*
# CRITICAL FIX: the same self-verification exploit existed in 3 more tables

## What was found
Immediately after fixing candidate_claims' self-verification hole
(20260913002200), audited every other table with the same
"WITH CHECK (user_id = auth.uid() OR is_admin())" ownership-only pattern for
a status/moderation field. Found the identical vulnerability in three more
tables that are actively used (unlike advertisers/sponsors, which have the
same loose pattern but are orphaned dead code with no UI at all, so not
fixed here — nothing currently exercises them):

- candidate_submissions (bio/photo/website edits) — a candidate could set
  their own submission directly to `status = 'approved'`, bypassing the
  admin's apply_candidate_submission() review entirely. The
  20260913000400 migration added the correct admin path (SELECT/UPDATE
  policies + apply/reject RPCs) but never removed the original insecure
  self-update policy sitting alongside it — Postgres OR's multiple
  permissive policies together, so the old hole stayed wide open even
  after the "fix." A self-approved submission wouldn't actually change the
  live candidate profile (only the RPC does that), but it would falsely
  mark the item "approved" in the admin queue, hiding it from review while
  the content never actually goes live — silent, confusing data corruption
  at minimum, and an RLS design flaw that needed closing regardless.
- candidate_questionnaire_responses (candidate Q&A) — identical shape:
  self-write directly to 'approved'.
- candidate_events (campaign events) — identical shape.

## Fix
Same split as candidate_claims: a non-admin can only update their OWN row
while it stays pending and MUST remain pending; admins get a separate,
unrestricted UPDATE policy for actually reviewing and approving/rejecting.
*/

DROP POLICY IF EXISTS "update_own_submission" ON candidate_submissions;
CREATE POLICY "update_own_pending_submission" ON candidate_submissions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "update_own_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "update_own_pending_questionnaire" ON candidate_questionnaire_responses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "update_own_event" ON candidate_events;
CREATE POLICY "update_own_pending_event" ON candidate_events FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- candidate_questionnaire_responses and candidate_events had NO admin
-- SELECT/UPDATE policy at all (unlike candidate_submissions, which at
-- least got one in an earlier fix) — meaning even after closing the
-- self-approval hole above, nothing could ever legitimately approve a
-- candidate-submitted event or Q&A response either. Both features were
-- silently 100% non-functional past the initial pending insert.
DROP POLICY IF EXISTS "admin_select_all_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "admin_select_all_questionnaire" ON candidate_questionnaire_responses FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_update_all_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "admin_update_all_questionnaire" ON candidate_questionnaire_responses FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_select_all_events" ON candidate_events;
CREATE POLICY "admin_select_all_events" ON candidate_events FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_update_all_events" ON candidate_events;
CREATE POLICY "admin_update_all_events" ON candidate_events FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
