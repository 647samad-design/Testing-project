/*
# Admins could not reject candidate events or questionnaire answers

rejectEvent() and rejectQuestionnaireResponse() save the admin's reason in
`admin_notes`, but neither candidate_events nor
candidate_questionnaire_responses has that column. PostgREST rejects the whole
update ("Could not find the 'admin_notes' column ... in the schema cache",
HTTP 400 -- reproduced against a real PostgREST), so every Reject click failed
and the item stayed pending. Found by cross-checking every table/column the
code writes against the migrated schema.

Adds the column (same as candidate_submissions.admin_notes), so the reason is
kept and can be shown to the candidate.
*/
ALTER TABLE candidate_events ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE candidate_questionnaire_responses ADD COLUMN IF NOT EXISTS admin_notes text;
