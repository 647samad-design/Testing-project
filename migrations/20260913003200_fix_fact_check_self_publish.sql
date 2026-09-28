/*
# CRITICAL: anyone could publish a "BallotLens verified" fact check directly

`insert_fact_checks` only checked `auth.uid() = submitted_by_user_id`. A
submitter could insert with status = 'published', assessment = 'true' and any
explanation, and it was immediately shown to everyone as a reviewed BallotLens
fact check -- e.g. "Candidate X is a criminal", verdict TRUE. Reproduced on a
full migration replay. Same self-approval shape as claims, submissions, events
and ads fixed earlier; 20260913001700 fixed who can READ unreviewed checks but
not what a submitter can INSERT.

Submissions must now start as pending/unverified with no verdict text; only an
admin (update_fact_checks_admin) can set the assessment, explanation and
publish. The app's submitFactCheck() already sends none of these fields, so
nothing legitimate changes.
*/

DROP POLICY IF EXISTS "insert_fact_checks" ON fact_checks;
CREATE POLICY "insert_fact_checks" ON fact_checks FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = submitted_by_user_id
    AND status = 'pending'
    AND assessment = 'unverified'
    AND explanation IS NULL
    AND evidence_text IS NULL
    AND evidence_url IS NULL
    AND reviewed_at IS NULL
  );
