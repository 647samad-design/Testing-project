/*
# Admins couldn't read unpublished (draft) stories

stories has admin INSERT/UPDATE/DELETE, but the only SELECT policy is
`is_published = true`. An admin could write a draft and then never see it
again, so there was no way to build a draft -> publish workflow. (There was
also no story editor at all -- added in the app in the same change.)
*/

DROP POLICY IF EXISTS "admin_read_all_stories" ON stories;
CREATE POLICY "admin_read_all_stories" ON stories FOR SELECT
  TO authenticated USING (is_admin());
