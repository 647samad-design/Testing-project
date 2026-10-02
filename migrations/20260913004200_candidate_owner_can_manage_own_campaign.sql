/*
# A candidate who bought the Management plan couldn't save their own campaign

Campaign writes required: active Management plan AND an active row in
campaign_team. But nothing ever adds the profile's owner (the verified
claimant) to campaign_team -- only invitees are inserted, by
invite_campaign_team_member(). So the paying candidate got
"new row violates row-level security policy for table campaigns" when saving
their campaign page or campaign events; only people they'd invited could.
Reproduced with the real app code against PostgREST
(candidate-data.integration.test.ts).

Same gap (team members allowed, owner not) in:
  - campaign_event_rsvps read: the owner couldn't see who RSVP'd to their events.
  - feed_posts update/delete: the owner couldn't edit or remove posts their
    team wrote on their profile (only their own).

Each now also allows the verified claimant, via the SECURITY DEFINER helper
rls_is_verified_claimant() (no policy recursion). Management gating is
unchanged: without an active plan, the owner still can't write campaign data.
*/

DROP POLICY IF EXISTS management_write_campaigns ON campaigns;
CREATE POLICY management_write_campaigns ON campaigns FOR ALL TO authenticated
  USING (is_admin() OR (has_active_management(candidate_id)
         AND (rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id))))
  WITH CHECK (is_admin() OR (has_active_management(candidate_id)
         AND (rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id))));

DROP POLICY IF EXISTS management_write_campaign_events ON campaign_events;
CREATE POLICY management_write_campaign_events ON campaign_events FOR ALL TO authenticated
  USING (is_admin() OR (has_active_management(candidate_id)
         AND (rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id))))
  WITH CHECK (is_admin() OR (has_active_management(candidate_id)
         AND (rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id))));

DROP POLICY IF EXISTS read_own_rsvp ON campaign_event_rsvps;
CREATE POLICY read_own_rsvp ON campaign_event_rsvps FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin() OR EXISTS (
    SELECT 1 FROM campaign_events ce
    WHERE ce.id = campaign_event_rsvps.event_id
      AND (rls_is_verified_claimant(ce.candidate_id) OR rls_is_active_team_member(ce.candidate_id))
  ));

DROP POLICY IF EXISTS update_feed_posts_team ON feed_posts;
CREATE POLICY update_feed_posts_team ON feed_posts FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id));

DROP POLICY IF EXISTS delete_feed_posts_team ON feed_posts;
CREATE POLICY delete_feed_posts_team ON feed_posts FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id));
