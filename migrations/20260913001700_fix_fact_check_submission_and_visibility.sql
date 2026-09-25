/*
# Fix: "Lens This" fact-check submissions always failed, and unreviewed
  claims were publicly visible before any moderation

## Bug 1 — every submission failed
`submitFactCheck()` (used by the "Lens This" page) never set
`submitted_by_user_id` in its insert payload, and that column has no
`DEFAULT auth.uid()`. The INSERT policy requires
`auth.uid() = submitted_by_user_id` — since the column was always NULL,
this check could never pass (NULL never equals anything). Every fact-check
submission through the UI has been failing with an RLS violation since this
feature was built. Fixed in the application code
(`src/services/civic.ts`) to explicitly set the column; this migration adds
a `DEFAULT auth.uid()` as a second line of defense so the same class of bug
can't recur if a future insert forgets to set it explicitly.

## Bug 2 — unreviewed claims were public immediately
`read_fact_checks` was `USING (true)` regardless of `status`, so a
submission sitting in `status = 'pending'` (not yet reviewed by anyone) was
just as publicly visible as one an admin had reviewed and published. For a
civic platform, showing unverified claims (default assessment:
'unverified') to the public before any human review defeats the purpose of
having a moderation status at all, and is a real misinformation-risk
surface. Restricted public SELECT to `status = 'published'`; the submitter
can still see their own pending submission, and admins can see everything.
*/

ALTER TABLE fact_checks ALTER COLUMN submitted_by_user_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "read_fact_checks" ON fact_checks;
CREATE POLICY "read_published_fact_checks" ON fact_checks FOR SELECT
  TO anon, authenticated USING (
    status = 'published'
    OR auth.uid() = submitted_by_user_id
    OR is_admin()
  );
