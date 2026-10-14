/*
SECURITY: verified candidate claims exposed private fields to everyone.

"public_read_verified_claims" let anyone (even signed-out visitors) read
EVERY column of a verified claim through the API: the claimant's email,
admin_notes and verification_notes.

The public only needs to know WHO owns a profile (to show the verified badge,
the office, and to route voter messages). Now:
  - the table is readable only by the claimant and admins (existing policies);
  - public_verified_claims exposes just the safe columns of verified claims;
  - the conversation insert check uses is_verified_claimant(), which reads the
    table as its owner, instead of relying on the public row policy.
*/

DROP POLICY IF EXISTS "public_read_verified_claims" ON candidate_claims;

CREATE OR REPLACE VIEW public_verified_claims WITH (security_barrier = true) AS
  SELECT id, candidate_id, user_id, status, office, campaign_name, campaign_website
  FROM candidate_claims
  WHERE status = 'verified';
REVOKE ALL ON public_verified_claims FROM PUBLIC;
GRANT SELECT ON public_verified_claims TO anon, authenticated;

CREATE OR REPLACE FUNCTION is_verified_claimant(p_candidate_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM candidate_claims
    WHERE candidate_id = p_candidate_id AND user_id = p_user_id AND status = 'verified'
  );
$$;
REVOKE ALL ON FUNCTION is_verified_claimant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_verified_claimant(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = voter_id
    AND candidate_user_id IS DISTINCT FROM voter_id
    AND (
      candidate_user_id IS NULL
      OR is_verified_claimant(candidate_id, candidate_user_id)
    )
  );
