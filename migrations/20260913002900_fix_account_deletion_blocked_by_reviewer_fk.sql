/*
# Fix: an admin who ever approved/rejected anything could never delete their account

## What was found
`reviewed_by` on candidate_claims, candidate_submissions,
candidate_questionnaire_responses and candidate_events references
auth.users(id) with the default ON DELETE NO ACTION. apply_candidate_submission()
and reject_candidate_submission() fill it with the reviewing admin's id. After
that, deleting that admin's auth user -- which is exactly what the
delete-my-account edge function does -- fails:

  ERROR: update or delete on table "users" violates foreign key constraint
         "candidate_submissions_reviewed_by_fkey"

Reproduced on a full migration replay. So "Delete My Account" (the Privacy
Policy's right-to-delete promise) silently stopped working for any admin
after their first review, and admins could not be removed at all.

## Fix
ON DELETE SET NULL: the review decision and reviewed_at stay; only the link to
a person who no longer exists is cleared. The audit_log entry for the action
is unaffected.
*/

ALTER TABLE candidate_claims DROP CONSTRAINT IF EXISTS candidate_claims_reviewed_by_fkey;
ALTER TABLE candidate_claims ADD CONSTRAINT candidate_claims_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE candidate_submissions DROP CONSTRAINT IF EXISTS candidate_submissions_reviewed_by_fkey;
ALTER TABLE candidate_submissions ADD CONSTRAINT candidate_submissions_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE candidate_questionnaire_responses DROP CONSTRAINT IF EXISTS candidate_questionnaire_responses_reviewed_by_fkey;
ALTER TABLE candidate_questionnaire_responses ADD CONSTRAINT candidate_questionnaire_responses_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE candidate_events DROP CONSTRAINT IF EXISTS candidate_events_reviewed_by_fkey;
ALTER TABLE candidate_events ADD CONSTRAINT candidate_events_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
