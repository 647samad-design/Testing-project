/*
# Social engagement tables — Part 1: campaign_team, follows, feed_posts, post_likes

## Tables
### campaign_team
Campaign team members with role-based permissions. Roles: candidate, campaign_manager,
social_manager, volunteer_manager, staff, volunteer. The 'candidate' role is auto-assigned
when a candidate claim is verified.

### follows
Users follow candidates and/or issues. Unique constraint prevents duplicate follows.

### feed_posts
Candidate's social feed. Only campaign team members can post.
post_type distinguishes updates, events, position changes, endorsements.

### post_likes
Voters like posts. Unique per user per post.

## Security
- campaign_team: public read (voters can see team), insert/update/delete by candidate or campaign_manager
- follows: owner-scoped (user follows), public read
- feed_posts: public read, team-only write (checked via campaign_team or verified claim)
- post_likes: owner-scoped, public read
*/

-- CAMPAIGN TEAM
CREATE TABLE IF NOT EXISTS campaign_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('candidate', 'campaign_manager', 'social_manager', 'volunteer_manager', 'staff', 'volunteer')),
  invited_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);
ALTER TABLE campaign_team ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_team_candidate ON campaign_team(candidate_id);
CREATE INDEX IF NOT EXISTS idx_team_user ON campaign_team(user_id);

DROP POLICY IF EXISTS "read_campaign_team" ON campaign_team;
CREATE POLICY "read_campaign_team" ON campaign_team FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_campaign_team" ON campaign_team;
CREATE POLICY "insert_campaign_team" ON campaign_team FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = campaign_team.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = campaign_team.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active' AND ct.role IN ('candidate', 'campaign_manager'))
);
DROP POLICY IF EXISTS "update_campaign_team" ON campaign_team;
CREATE POLICY "update_campaign_team" ON campaign_team FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = campaign_team.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = campaign_team.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active' AND ct.role IN ('candidate', 'campaign_manager'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = campaign_team.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = campaign_team.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active' AND ct.role IN ('candidate', 'campaign_manager'))
);
DROP POLICY IF EXISTS "delete_campaign_team" ON campaign_team;
CREATE POLICY "delete_campaign_team" ON campaign_team FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = campaign_team.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = campaign_team.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active' AND ct.role IN ('candidate', 'campaign_manager'))
);

-- FOLLOWS
CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  followable_type text NOT NULL CHECK (followable_type IN ('candidate', 'issue')),
  followable_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, followable_type, followable_id)
);
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_follows_user ON follows(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_target ON follows(followable_type, followable_id);

DROP POLICY IF EXISTS "read_follows" ON follows;
CREATE POLICY "read_follows" ON follows FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_follows" ON follows;
CREATE POLICY "insert_own_follows" ON follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_follows" ON follows;
CREATE POLICY "delete_own_follows" ON follows FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- FEED POSTS
CREATE TABLE IF NOT EXISTS feed_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  post_type text NOT NULL DEFAULT 'update' CHECK (post_type IN ('update', 'event', 'position_change', 'endorsement')),
  body text NOT NULL,
  image_url text,
  link_url text,
  event_date date,
  event_location text,
  event_start_time text,
  event_end_time text,
  event_rsvp_count integer NOT NULL DEFAULT 0,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_feed_posts_candidate ON feed_posts(candidate_id, created_at DESC);

DROP POLICY IF EXISTS "read_feed_posts" ON feed_posts;
CREATE POLICY "read_feed_posts" ON feed_posts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_feed_posts_team" ON feed_posts;
CREATE POLICY "insert_feed_posts_team" ON feed_posts FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = feed_posts.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = feed_posts.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
);
DROP POLICY IF EXISTS "update_feed_posts_team" ON feed_posts;
CREATE POLICY "update_feed_posts_team" ON feed_posts FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = feed_posts.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR author_user_id = auth.uid()
) WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = feed_posts.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR author_user_id = auth.uid()
);
DROP POLICY IF EXISTS "delete_feed_posts_team" ON feed_posts;
CREATE POLICY "delete_feed_posts_team" ON feed_posts FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = feed_posts.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR author_user_id = auth.uid()
);

-- POST LIKES
CREATE TABLE IF NOT EXISTS post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);

DROP POLICY IF EXISTS "read_post_likes" ON post_likes;
CREATE POLICY "read_post_likes" ON post_likes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_post_likes" ON post_likes;
CREATE POLICY "insert_own_post_likes" ON post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_post_likes" ON post_likes;
CREATE POLICY "delete_own_post_likes" ON post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);