/*
Links a candidate profile to public data sources so the app can show live
records automatically:
  - openstates_person_id / openstates_jurisdiction_id: Open States legislator
    (state legislators and members of Congress) -> recent sponsored bills
  - fec_candidate_id: Federal Election Commission candidate ID (e.g. S6FL00123)
    -> money raised, spent and cash on hand
Set by admins in Manage Candidates. Readable by everyone like the rest of the
public profile; only admins can write candidates (existing policies).
*/
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS openstates_person_id text
  CHECK (openstates_person_id IS NULL OR openstates_person_id ~ '^ocd-person/[0-9a-f-]{36}$');
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS openstates_jurisdiction_id text
  CHECK (openstates_jurisdiction_id IS NULL OR openstates_jurisdiction_id ~ '^ocd-jurisdiction/[a-z0-9:/_-]+$');
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS fec_candidate_id text
  CHECK (fec_candidate_id IS NULL OR fec_candidate_id ~ '^[HSP][0-9A-Z]{8}$');
