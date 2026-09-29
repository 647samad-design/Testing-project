/*
# Candidate quiz answers: self-approval, and changed answers went live unreviewed

The candidate quiz page tells candidates "All answers are reviewed before going
live", and voter matching only counts status = 'approved'. But:
- team_update_candidate_answers allowed the submitter to UPDATE any column, so a
  candidate could set status = 'approved' on their own answers (reproduced on a
  full migration replay), and INSERT didn't restrict status either;
- once approved, changing an answer (the app upserts) kept status 'approved',
  so the new answer went live with no review.
(There was also no admin screen to approve them at all, so in practice nothing
ever reached 'approved' -- added in the app in the same change.)

Fix: every write from the candidate's side is 'pending'. Only admins set
approved/rejected. Invoker-rights trigger on purpose: it must see the caller's
role in current_user (see 20260913003500).
*/

CREATE OR REPLACE FUNCTION guard_candidate_quiz_answer()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_quiz_answers_guard ON candidate_quiz_answers;
CREATE TRIGGER candidate_quiz_answers_guard
  BEFORE INSERT OR UPDATE ON candidate_quiz_answers
  FOR EACH ROW EXECUTE FUNCTION guard_candidate_quiz_answer();
