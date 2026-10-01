/*
# Election-result and news posts could never be saved

The feed is built to show "source posts" that don't belong to a candidate:
AP race calls (ap-elections) and news items (civic-news). getSocialFeed()
explicitly loads posts where source_name is set, and FeedPage renders
post_type 'election_result' and 'news' without a candidate.

But feed_posts required candidate_id (NOT NULL) and its CHECK only allowed
update / event / position_change / endorsement. Every such insert was rejected,
and neither function checked the insert error -- civic-news even counted the
failed rows, so the admin "Refresh news" button reported posts that were never
saved. The live table has 0 posts.

Fix: candidate_id becomes optional, and the two source post types are allowed,
under a rule that a post is EITHER a candidate's post (candidate_id set) OR a
source post (no candidate, source_name set, type election_result/news).
Users can't create source posts: every user INSERT policy requires being the
claimant/team of candidate_id, which a NULL candidate_id never satisfies; only
the service role (the edge functions) can write them. Tested.
*/

ALTER TABLE feed_posts ALTER COLUMN candidate_id DROP NOT NULL;

ALTER TABLE feed_posts DROP CONSTRAINT IF EXISTS feed_posts_post_type_check;
ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_post_type_check
  CHECK (post_type IN ('update', 'event', 'position_change', 'endorsement', 'election_result', 'news'));

ALTER TABLE feed_posts DROP CONSTRAINT IF EXISTS feed_posts_candidate_or_source;
ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_candidate_or_source CHECK (
  (candidate_id IS NOT NULL AND post_type IN ('update', 'event', 'position_change', 'endorsement'))
  OR
  (candidate_id IS NULL AND source_name IS NOT NULL AND post_type IN ('election_result', 'news'))
);
