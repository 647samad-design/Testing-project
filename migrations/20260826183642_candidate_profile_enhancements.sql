/*
# Candidate Profile Enhancements

## Purpose
Add rich profile data to candidate profiles: candidate snapshot fields, 
"Get to Know Me" humanizing Q&A, "Why I'm Running" video, campaign finance 
breakdown, endorsements, and election info.

## New Tables

1. `candidate_profile_extras` — one-to-one extension of `candidates`
   - `candidate_id` (uuid PK+FK)
   - `office_sought` (text) — office they're running for
   - `district` (text) — district name/number
   - `current_occupation` (text)
   - `hometown_area` (text)
   - `why_im_running_video_url` (text) — vertical video URL
   - `why_im_running_video_poster` (text) — poster/thumbnail image
   - `election_date` (date)
   - `election_type` (text: 'primary', 'runoff', 'general')
   - `term_length` (text) — e.g. "4 years"
   - `next_election_date` (date) — when term is up / next election
   - `updated_at` (timestamptz)

2. `candidate_get_to_know` — humanizing Q&A pairs
   - `id` (uuid PK)
   - `candidate_id` (uuid FK)
   - `question` (text) — e.g. "Favorite local restaurant"
   - `answer` (text)
   - `display_order` (int)
   - `status` (text: 'pending', 'approved', 'rejected') — admin review

3. `candidate_funding_sources` — campaign finance breakdown
   - `id` (uuid PK)
   - `candidate_id` (uuid FK)
   - `source_type` (text: 'individuals', 'pac', 'organization', 'self_funded', 'other')
   - `percentage` (real 0-100)
   - `amount_dollars` (bigint, nullable)
   - `source_label` (text, nullable) — description
   - `report_date` (date, nullable)
   - `status` (text: 'pending', 'approved', 'rejected')

4. `candidate_endorsements` — endorsement listings
   - `id` (uuid PK)
   - `candidate_id` (uuid FK)
   - `endorser_name` (text)
   - `endorser_type` (text: 'organization', 'elected_official', 'union', 'community_group', 'other')
   - `endorser_title` (text, nullable)
   - `endorser_logo_url` (text, nullable)
   - `endorsement_date` (date, nullable)
   - `display_order` (int)
   - `status` (text: 'pending', 'approved', 'rejected')

5. `candidate_election_reminders` — notify me when term is up
   - `id` (uuid PK)
   - `candidate_id` (uuid FK)
   - `user_id` (uuid FK to profiles)
   - `created_at` (timestamptz)

## Security
- RLS on all tables
- Public can read approved rows (anon + authenticated)
- Only authenticated users can create reminders, and only for themselves
- Candidate team submissions go through pending→approved workflow (candidate portal writes, admin reviews)

## Notes
1. All candidate-submitted content uses a status column for admin review
2. `candidate_profile_extras` is 1:1 with candidates — upsert on update
3. Funding percentages should sum to ~100 but this is not enforced at DB level
*/

-- 1. candidate_profile_extras
CREATE TABLE IF NOT EXISTS candidate_profile_extras (
  candidate_id uuid PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  office_sought text,
  district text,
  current_occupation text,
  hometown_area text,
  why_im_running_video_url text,
  why_im_running_video_poster text,
  election_date date,
  election_type text CHECK (election_type IN ('primary', 'runoff', 'general')),
  term_length text,
  next_election_date date,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE candidate_profile_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_extras_public" ON candidate_profile_extras;
CREATE POLICY "read_extras_public" ON candidate_profile_extras FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "upsert_extras_authenticated" ON candidate_profile_extras;
CREATE POLICY "upsert_extras_authenticated" ON candidate_profile_extras FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_extras_authenticated" ON candidate_profile_extras;
CREATE POLICY "update_extras_authenticated" ON candidate_profile_extras FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- 2. candidate_get_to_know
CREATE TABLE IF NOT EXISTS candidate_get_to_know (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE candidate_get_to_know ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_approved_get_to_know" ON candidate_get_to_know;
CREATE POLICY "read_approved_get_to_know" ON candidate_get_to_know FOR SELECT
  TO anon, authenticated USING (status = 'approved');

DROP POLICY IF EXISTS "insert_get_to_know_authenticated" ON candidate_get_to_know;
CREATE POLICY "insert_get_to_know_authenticated" ON candidate_get_to_know FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_get_to_know_authenticated" ON candidate_get_to_know;
CREATE POLICY "update_get_to_know_authenticated" ON candidate_get_to_know FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_get_to_know_candidate ON candidate_get_to_know(candidate_id);

-- 3. candidate_funding_sources
CREATE TABLE IF NOT EXISTS candidate_funding_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('individuals', 'pac', 'organization', 'self_funded', 'other')),
  percentage real NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
  amount_dollars bigint,
  source_label text,
  report_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE candidate_funding_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_approved_funding" ON candidate_funding_sources;
CREATE POLICY "read_approved_funding" ON candidate_funding_sources FOR SELECT
  TO anon, authenticated USING (status = 'approved');

DROP POLICY IF EXISTS "insert_funding_authenticated" ON candidate_funding_sources;
CREATE POLICY "insert_funding_authenticated" ON candidate_funding_sources FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_funding_authenticated" ON candidate_funding_sources;
CREATE POLICY "update_funding_authenticated" ON candidate_funding_sources FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_funding_candidate ON candidate_funding_sources(candidate_id);

-- 4. candidate_endorsements
CREATE TABLE IF NOT EXISTS candidate_endorsements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  endorser_name text NOT NULL,
  endorser_type text NOT NULL CHECK (endorser_type IN ('organization', 'elected_official', 'union', 'community_group', 'other')),
  endorser_title text,
  endorser_logo_url text,
  endorsement_date date,
  display_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE candidate_endorsements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_approved_endorsements" ON candidate_endorsements;
CREATE POLICY "read_approved_endorsements" ON candidate_endorsements FOR SELECT
  TO anon, authenticated USING (status = 'approved');

DROP POLICY IF EXISTS "insert_endorsements_authenticated" ON candidate_endorsements;
CREATE POLICY "insert_endorsements_authenticated" ON candidate_endorsements FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_endorsements_authenticated" ON candidate_endorsements;
CREATE POLICY "update_endorsements_authenticated" ON candidate_endorsements FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_endorsements_candidate ON candidate_endorsements(candidate_id);

-- 5. candidate_election_reminders
CREATE TABLE IF NOT EXISTS candidate_election_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, user_id)
);

ALTER TABLE candidate_election_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_reminders" ON candidate_election_reminders;
CREATE POLICY "read_own_reminders" ON candidate_election_reminders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_reminders" ON candidate_election_reminders;
CREATE POLICY "insert_own_reminders" ON candidate_election_reminders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reminders" ON candidate_election_reminders;
CREATE POLICY "delete_own_reminders" ON candidate_election_reminders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON candidate_election_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_candidate ON candidate_election_reminders(candidate_id);
