/*
# CRITICAL: permission audit — open UPDATE holes, question impersonation,
# missing admin access, dead counters

Found by computing the FINAL RLS policy state of every table across the whole
migration history (not just reading individual files) and checking, per
table, what an admin can and cannot do plus which write policies have no
real condition.

## 1. Anyone could edit ANY candidate's endorsements/funding/extras
`candidate_endorsements`, `candidate_funding_sources`, `candidate_get_to_know`
and `candidate_profile_extras` all still had `UPDATE ... USING (true) WITH
CHECK (true)` for every authenticated user. Migration 20260913001900 closed
the INSERT side of three of them but never touched UPDATE, so any signed-in
user could rewrite another candidate's funding percentages, endorsements or
election dates -- and could set `status = 'approved'` on a pending row,
bypassing moderation entirely. `candidate_profile_extras` INSERT was also
`WITH CHECK (true)`.

## 2. Admins could not even SEE pending endorsements/funding/get-to-know
Their only SELECT policy was `status = 'approved'` for everyone. Pending
rows were invisible to the admin who is supposed to approve them, and to
the candidate who submitted them. The only way anything ever became
approved was the open-UPDATE hole above.

## 3. A voter could write a candidate's "answer" to their own question
`voter_questions` UPDATE allowed `auth.uid() = user_id` (the asker) with no
column restriction, and the table has `answer_text`/`answered_at`/`status`.
Any voter could publish a fake answer under a candidate's name. Answering
now goes through `answer_voter_question()`, which verifies the caller is
the candidate's verified claimant, an active team member, or an admin,
records `answered_by_user_id` (previously never set), and notifies the asker
(the `question_answered` notification type existed and was styled in the UI
but nothing ever created one).

## 4. Question rating counters never changed
The UI shows Useful/Evidence/Responsive counts read from columns on
`voter_questions`, but nothing ever updated them; `question_ratings` rows
were written and never counted. A trigger now keeps them accurate
(and existing rows are backfilled).

## 5. Admin could not remove abusive content
No admin DELETE on `feed_posts`, `fact_checks`, `candidate_tags`, or
`voter_questions`, so a report marked "actioned" had no way to actually be
actioned through the app.
*/

-- ─────────────────────────────────────────────────────────────
-- 1 & 2. candidate_endorsements / funding_sources / get_to_know
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "update_endorsements_authenticated" ON candidate_endorsements;
DROP POLICY IF EXISTS "update_funding_authenticated" ON candidate_funding_sources;
DROP POLICY IF EXISTS "update_get_to_know_authenticated" ON candidate_get_to_know;

-- Claimant submissions may only ever be inserted as 'pending'; previously a
-- claimant could insert with status = 'approved' and skip review.
DROP POLICY IF EXISTS "insert_endorsements_own_candidate" ON candidate_endorsements;
CREATE POLICY "insert_endorsements_own_candidate" ON candidate_endorsements FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR (
      status = 'pending' AND EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = candidate_endorsements.candidate_id
          AND cc.user_id = auth.uid() AND cc.status = 'verified')
    )
  );

DROP POLICY IF EXISTS "insert_funding_own_candidate" ON candidate_funding_sources;
CREATE POLICY "insert_funding_own_candidate" ON candidate_funding_sources FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR (
      status = 'pending' AND EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = candidate_funding_sources.candidate_id
          AND cc.user_id = auth.uid() AND cc.status = 'verified')
    )
  );

DROP POLICY IF EXISTS "insert_get_to_know_own_candidate" ON candidate_get_to_know;
CREATE POLICY "insert_get_to_know_own_candidate" ON candidate_get_to_know FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR (
      status = 'pending' AND EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = candidate_get_to_know.candidate_id
          AND cc.user_id = auth.uid() AND cc.status = 'verified')
    )
  );

-- Admin sees every status (needed to review); a verified claimant sees all
-- rows for their own candidate (so they can see their own pending items).
DROP POLICY IF EXISTS "admin_or_claimant_read_all_endorsements" ON candidate_endorsements;
CREATE POLICY "admin_or_claimant_read_all_endorsements" ON candidate_endorsements FOR SELECT
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_endorsements.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "admin_or_claimant_read_all_funding" ON candidate_funding_sources;
CREATE POLICY "admin_or_claimant_read_all_funding" ON candidate_funding_sources FOR SELECT
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_funding_sources.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "admin_or_claimant_read_all_get_to_know" ON candidate_get_to_know;
CREATE POLICY "admin_or_claimant_read_all_get_to_know" ON candidate_get_to_know FOR SELECT
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_get_to_know.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );

-- Only admins change status (approve/reject).
DROP POLICY IF EXISTS "admin_update_endorsements" ON candidate_endorsements;
CREATE POLICY "admin_update_endorsements" ON candidate_endorsements FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_funding" ON candidate_funding_sources;
CREATE POLICY "admin_update_funding" ON candidate_funding_sources FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_get_to_know" ON candidate_get_to_know;
CREATE POLICY "admin_update_get_to_know" ON candidate_get_to_know FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Admin or the candidate's own verified claimant can remove a row (fix a
-- mistake, or take down bad content). There was no DELETE policy at all.
DROP POLICY IF EXISTS "admin_or_claimant_delete_endorsements" ON candidate_endorsements;
CREATE POLICY "admin_or_claimant_delete_endorsements" ON candidate_endorsements FOR DELETE
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_endorsements.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "admin_or_claimant_delete_funding" ON candidate_funding_sources;
CREATE POLICY "admin_or_claimant_delete_funding" ON candidate_funding_sources FOR DELETE
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_funding_sources.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "admin_or_claimant_delete_get_to_know" ON candidate_get_to_know;
CREATE POLICY "admin_or_claimant_delete_get_to_know" ON candidate_get_to_know FOR DELETE
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_get_to_know.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );

-- ─────────────────────────────────────────────────────────────
-- candidate_profile_extras: verified claimant or admin only
-- (public read stays as-is; there's no moderation status on this table)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "upsert_extras_authenticated" ON candidate_profile_extras;
DROP POLICY IF EXISTS "update_extras_authenticated" ON candidate_profile_extras;

DROP POLICY IF EXISTS "claimant_or_admin_insert_extras" ON candidate_profile_extras;
CREATE POLICY "claimant_or_admin_insert_extras" ON candidate_profile_extras FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_profile_extras.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "claimant_or_admin_update_extras" ON candidate_profile_extras;
CREATE POLICY "claimant_or_admin_update_extras" ON candidate_profile_extras FOR UPDATE
  TO authenticated
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_profile_extras.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  )
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_profile_extras.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "admin_delete_extras" ON candidate_profile_extras;
CREATE POLICY "admin_delete_extras" ON candidate_profile_extras FOR DELETE
  TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────
-- 3. voter_questions: answering goes through a checked function
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "update_voter_questions_team" ON voter_questions;

DROP POLICY IF EXISTS "admin_update_voter_questions" ON voter_questions;
CREATE POLICY "admin_update_voter_questions" ON voter_questions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_voter_questions" ON voter_questions;
CREATE POLICY "admin_delete_voter_questions" ON voter_questions FOR DELETE
  TO authenticated USING (is_admin());

CREATE OR REPLACE FUNCTION answer_voter_question(p_question_id uuid, p_answer text)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidate uuid;
  v_asker uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_answer IS NULL OR length(trim(p_answer)) = 0 THEN
    RAISE EXCEPTION 'Answer cannot be empty';
  END IF;

  SELECT candidate_id, user_id INTO v_candidate, v_asker
  FROM voter_questions WHERE id = p_question_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  IF NOT (
    is_admin()
    OR EXISTS (SELECT 1 FROM candidate_claims cc
               WHERE cc.candidate_id = v_candidate AND cc.user_id = auth.uid() AND cc.status = 'verified')
    OR EXISTS (SELECT 1 FROM campaign_team ct
               WHERE ct.candidate_id = v_candidate AND ct.user_id = auth.uid() AND ct.status = 'active')
  ) THEN
    RAISE EXCEPTION 'Not authorized to answer questions for this candidate';
  END IF;

  UPDATE voter_questions
  SET answer_text = trim(p_answer),
      answered_at = now(),
      status = 'answered',
      answered_by_user_id = auth.uid()
  WHERE id = p_question_id;

  -- A reply to a question the user personally asked is direct communication,
  -- so (like a message) it isn't gated by digest preferences.
  IF v_asker IS NOT NULL AND v_asker <> auth.uid() THEN
    INSERT INTO notifications (user_id, type, title, body, candidate_id, is_read)
    VALUES (v_asker, 'question_answered', 'Your question was answered',
            'A candidate answered a question you asked. Open their profile to read the answer.',
            v_candidate, false);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION answer_voter_question(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION answer_voter_question(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Keep the Useful/Evidence/Responsive counters accurate
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_question_rating_counts()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  qid uuid := COALESCE(NEW.question_id, OLD.question_id);
BEGIN
  UPDATE voter_questions SET
    helpful_count    = (SELECT count(*) FROM question_ratings WHERE question_id = qid AND rating_type = 'helpful'    AND value),
    evidence_count   = (SELECT count(*) FROM question_ratings WHERE question_id = qid AND rating_type = 'evidence'   AND value),
    responsive_count = (SELECT count(*) FROM question_ratings WHERE question_id = qid AND rating_type = 'responsive' AND value)
  WHERE id = qid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_question_ratings_counts ON question_ratings;
CREATE TRIGGER trg_question_ratings_counts
  AFTER INSERT OR UPDATE OR DELETE ON question_ratings
  FOR EACH ROW EXECUTE FUNCTION refresh_question_rating_counts();

-- Backfill any ratings already recorded.
UPDATE voter_questions q SET
  helpful_count    = (SELECT count(*) FROM question_ratings r WHERE r.question_id = q.id AND r.rating_type = 'helpful'    AND r.value),
  evidence_count   = (SELECT count(*) FROM question_ratings r WHERE r.question_id = q.id AND r.rating_type = 'evidence'   AND r.value),
  responsive_count = (SELECT count(*) FROM question_ratings r WHERE r.question_id = q.id AND r.rating_type = 'responsive' AND r.value);

-- ─────────────────────────────────────────────────────────────
-- 5. Admin can remove abusive content
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_delete_feed_posts" ON feed_posts;
CREATE POLICY "admin_delete_feed_posts" ON feed_posts FOR DELETE
  TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_delete_fact_checks" ON fact_checks;
CREATE POLICY "admin_delete_fact_checks" ON fact_checks FOR DELETE
  TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_delete_candidate_tags" ON candidate_tags;
CREATE POLICY "admin_delete_candidate_tags" ON candidate_tags FOR DELETE
  TO authenticated USING (is_admin());
