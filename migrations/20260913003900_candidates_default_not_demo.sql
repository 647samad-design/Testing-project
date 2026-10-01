/*
# New candidates were "demo" by default

candidates.is_demo defaulted to true, and the admin "Add Candidate" form never
sent it, so every candidate an admin added by hand was flagged demo -- and the
profile then told voters the candidate was fictional. (Bulk import already sent
is_demo = false.) New rows now default to false. Existing rows are unchanged:
genuine sample data stays flagged.
*/
ALTER TABLE candidates ALTER COLUMN is_demo SET DEFAULT false;
