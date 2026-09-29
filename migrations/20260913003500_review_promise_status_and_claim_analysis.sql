/*
# Candidates could grade their own promises and publish analysis of their own claims

## What was found
- candidate_promises: the verified claimant (or any active team member) could
  set `status` to 'completed' with their own evidence, and it was shown to
  voters as the tracker's verdict. On a nonpartisan accountability tool the
  candidate is grading themself.
- candidate_claim_analysis: whether a campaign claim has a specific plan and
  whether the office even has authority to do it (`has_specific_plan`,
  `authority_assessment`, `analysis_notes`) is analysis of the candidate, but
  the candidate could write and publish it directly.

## Fix -- same review pattern as endorsements, bio edits and events
Promises
- Candidates/teams may still ADD promises (their own public statements, with a
  source); new promises always start 'unverified'.
- They can no longer change status/evidence directly. Instead they fill
  proposed_status / proposed_evidence / proposed_source_url; an admin reviews
  and either applies it (copies it into status) or discards it.
Claim analysis
- New review_status (pending/published/rejected). Rows written by a candidate
  or team are always 'pending', and any later edit sends a published row back
  to 'pending'. The public only sees 'published'; the candidate's side and
  admins see everything.
Admins are unrestricted. Existing rows keep their current state.
*/

-- ── promises ─────────────────────────────────────────────────────────
ALTER TABLE candidate_promises
  ADD COLUMN IF NOT EXISTS proposed_status text
    CHECK (proposed_status IS NULL OR proposed_status IN ('completed','in_progress','not_started','contradicted','unverified')),
  ADD COLUMN IF NOT EXISTS proposed_evidence text,
  ADD COLUMN IF NOT EXISTS proposed_source_url text,
  ADD COLUMN IF NOT EXISTS proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- NOT security definer on purpose: the guard must see the CALLER's role in
-- current_user. Inside a SECURITY DEFINER function current_user is the owner,
-- so the "is this an ordinary user?" check would always be false and the guard
-- would never run (caught by db-tests).
CREATE OR REPLACE FUNCTION guard_candidate_promise_status()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'unverified';
    NEW.status_evidence := NULL;
    NEW.status_source_url := NULL;
    NEW.status_updated_at := NULL;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.status_evidence IS DISTINCT FROM OLD.status_evidence
       OR NEW.status_source_url IS DISTINCT FROM OLD.status_source_url
       OR NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at THEN
      RAISE EXCEPTION 'Only BallotLens reviewers can change a promise''s status. Submit a proposed status with evidence instead.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.proposed_status IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.proposed_status END)
     OR NEW.proposed_evidence IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.proposed_evidence END) THEN
    NEW.proposed_by := auth.uid();
    NEW.proposed_at := CASE WHEN NEW.proposed_status IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_promises_guard_status ON candidate_promises;
CREATE TRIGGER candidate_promises_guard_status
  BEFORE INSERT OR UPDATE ON candidate_promises
  FOR EACH ROW EXECUTE FUNCTION guard_candidate_promise_status();

-- ── claim analysis ───────────────────────────────────────────────────
ALTER TABLE candidate_claim_analysis
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'published'
    CHECK (review_status IN ('pending', 'published', 'rejected'));

-- NOT security definer on purpose: the guard must see the CALLER's role in
-- current_user. Inside a SECURITY DEFINER function current_user is the owner,
-- so the "is this an ordinary user?" check would always be false and the guard
-- would never run (caught by db-tests).
CREATE OR REPLACE FUNCTION guard_claim_analysis_review()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.review_status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_claim_analysis_guard_review ON candidate_claim_analysis;
CREATE TRIGGER candidate_claim_analysis_guard_review
  BEFORE INSERT OR UPDATE ON candidate_claim_analysis
  FOR EACH ROW EXECUTE FUNCTION guard_claim_analysis_review();

DROP POLICY IF EXISTS "read_candidate_claim_analysis" ON candidate_claim_analysis;
CREATE POLICY "read_candidate_claim_analysis" ON candidate_claim_analysis FOR SELECT
  TO anon, authenticated USING (
    review_status = 'published'
    OR is_admin()
    OR rls_is_verified_claimant(candidate_id)
    OR rls_is_active_team_member(candidate_id)
  );
