/*
# Product renamed to "Gov Search App"

The only user-facing occurrence of the old name in the database is this error
message (shown if a candidate tries to set a promise's status directly).
Same function as 20260913003500; only the message changes.
*/
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
      RAISE EXCEPTION 'Only Gov Search App reviewers can change a promise''s status. Submit a proposed status with evidence instead.'
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
