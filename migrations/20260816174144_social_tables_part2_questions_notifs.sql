/*
# Social engagement tables — Part 2: voter_questions, question_ratings, notifications, profile_views

## Tables
### voter_questions
Voters submit questions to candidates. Candidates/campaign answer them (AMA style).
Questions can be tagged with an issue for topic organization.
Status flows: open → answered → archived.
Answer counts towards the candidate's transparency score.

### question_ratings
Voters rate answers on 3 dimensions: helpful, evidence-backed, responsive.
Each rating is a boolean (thumbs up/down). Aggregated counts on voter_questions.

### notifications
Per-user notification feed. Types: position_change, new_post, question_answered,
new_voting_record, new_event, new_endorsement.
Generated when followed candidates/issues have activity.

### profile_views
Tracks candidate profile views for analytics. viewer_user_id nullable for anonymous views.

## Security
- voter_questions: public read, authenticated insert, team-only update (to answer)
- question_ratings: public read, owner-scoped insert/delete
- notifications: owner-scoped full CRUD
- profile_views: public insert (anyone viewing a profile), candidate/team read
*/

-- VOTER QUESTIONS
CREATE TABLE IF NOT EXISTS voter_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'archived')),
  answer_text text,
  answered_at timestamptz,
  answered_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  helpful_count integer NOT NULL DEFAULT 0,
  evidence_count integer NOT NULL DEFAULT 0,
  responsive_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE voter_questions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_questions_candidate ON voter_questions(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_status ON voter_questions(status);

DROP POLICY IF EXISTS "read_voter_questions" ON voter_questions;
CREATE POLICY "read_voter_questions" ON voter_questions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_voter_questions" ON voter_questions;
CREATE POLICY "insert_own_voter_questions" ON voter_questions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_voter_questions_team" ON voter_questions;
CREATE POLICY "update_voter_questions_team" ON voter_questions FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = voter_questions.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = voter_questions.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR auth.uid() = user_id
) WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = voter_questions.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = voter_questions.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR auth.uid() = user_id
);
DROP POLICY IF EXISTS "delete_own_voter_questions" ON voter_questions;
CREATE POLICY "delete_own_voter_questions" ON voter_questions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- QUESTION RATINGS
CREATE TABLE IF NOT EXISTS question_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES voter_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  rating_type text NOT NULL CHECK (rating_type IN ('helpful', 'evidence', 'responsive')),
  value boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(question_id, user_id, rating_type)
);
ALTER TABLE question_ratings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_qratings_question ON question_ratings(question_id);

DROP POLICY IF EXISTS "read_question_ratings" ON question_ratings;
CREATE POLICY "read_question_ratings" ON question_ratings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_question_ratings" ON question_ratings;
CREATE POLICY "insert_own_question_ratings" ON question_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_question_ratings" ON question_ratings;
CREATE POLICY "delete_own_question_ratings" ON question_ratings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('position_change', 'new_post', 'question_answered', 'new_voting_record', 'new_event', 'new_endorsement', 'new_follower', 'team_invite')),
  title text NOT NULL,
  body text,
  candidate_id uuid REFERENCES candidates(id) ON DELETE CASCADE,
  issue_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);

DROP POLICY IF EXISTS "read_own_notifications" ON notifications;
CREATE POLICY "read_own_notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- PROFILE VIEWS (analytics)
CREATE TABLE IF NOT EXISTS profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  viewer_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  viewer_zip text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_views_candidate ON profile_views(candidate_id, created_at DESC);

DROP POLICY IF EXISTS "insert_profile_views" ON profile_views;
CREATE POLICY "insert_profile_views" ON profile_views FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "read_profile_views_team" ON profile_views;
CREATE POLICY "read_profile_views_team" ON profile_views FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = profile_views.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = profile_views.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
);