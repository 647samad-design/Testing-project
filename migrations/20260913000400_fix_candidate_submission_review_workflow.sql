/*
# Fix: candidates could submit content, but nobody could ever approve it

## What was found
`candidate_submissions` (bio, photo, website, social links, etc. submitted by a
verified candidate through the Candidate Portal) has RLS policies for the
submitting user to insert/update/read their OWN rows, but there is no policy
letting an admin see or act on submissions at all, and no function applies an
approved submission's value to the live `candidates` row. In practice: a
candidate could submit a new bio or photo, it would sit in `pending` status
forever, and it would never reach their public profile — because nothing in
the codebase reviewed or applied it.

## Fix
1. Add admin SELECT/UPDATE policies on `candidate_submissions`.
2. Add `apply_candidate_submission(submission_id)` — SECURITY DEFINER, admin-only.
   Marks the submission approved and, for the 8 fields that map directly to a
   `candidates` column (bio, education, professional_background,
   previous_offices, military_service, public_service, website_url, photo_url),
   writes the value onto the live candidate row. Other field types (social
   links, campaign contact info, position_statement) don't yet have a
   dedicated destination column/table — those are marked approved but flagged
   in the return value so the admin UI can tell the difference and follow up
   manually. Logs to audit_log either way.
3. Add `reject_candidate_submission(submission_id, notes)` — SECURITY DEFINER,
   admin-only. Marks rejected with admin_notes, logs to audit_log.
*/

DROP POLICY IF EXISTS "admin_select_all_submissions" ON candidate_submissions;
CREATE POLICY "admin_select_all_submissions" ON candidate_submissions FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_update_all_submissions" ON candidate_submissions;
CREATE POLICY "admin_update_all_submissions" ON candidate_submissions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION apply_candidate_submission(
  p_submission_id uuid
) RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  sub record;
  applied boolean := false;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve submissions';
  END IF;

  SELECT * INTO sub FROM candidate_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF sub.field_name IN (
    'bio', 'education', 'professional_background', 'previous_offices',
    'military_service', 'public_service', 'website_url', 'photo_url'
  ) THEN
    EXECUTE format('UPDATE candidates SET %I = $1, updated_at = now() WHERE id = $2', sub.field_name)
      USING sub.field_value, sub.candidate_id;
    applied := true;
  END IF;

  UPDATE candidate_submissions
  SET status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = p_submission_id;

  INSERT INTO audit_log (admin_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'approve_candidate_submission', 'candidate_submissions', p_submission_id::text,
    jsonb_build_object('field_name', sub.field_name, 'candidate_id', sub.candidate_id, 'applied_to_candidates', applied));

  RETURN jsonb_build_object('applied_to_candidates', applied, 'field_name', sub.field_name);
END;
$$;

REVOKE ALL ON FUNCTION apply_candidate_submission(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_candidate_submission(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION reject_candidate_submission(
  p_submission_id uuid,
  p_notes text DEFAULT NULL
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can reject submissions';
  END IF;

  UPDATE candidate_submissions
  SET status = 'rejected', admin_notes = p_notes, reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = p_submission_id;

  INSERT INTO audit_log (admin_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'reject_candidate_submission', 'candidate_submissions', p_submission_id::text,
    jsonb_build_object('notes', p_notes));
END;
$$;

REVOKE ALL ON FUNCTION reject_candidate_submission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reject_candidate_submission(uuid, text) TO authenticated;
