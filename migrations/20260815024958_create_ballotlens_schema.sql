/*
# BallotLens initial schema

## Summary
Creates the full database structure for BallotLens, a neutral voter-information
platform. Two kinds of tables exist:

1. Public reference data (elections, districts, candidates, positions, sources,
   voting records, ballot measures, news, video, social posts, judicial records,
   claims) — readable by everyone (including signed-out visitors), writable only
   by an admin account.
2. Personal account data (profiles, saved location, selected issues, saved
   candidates, saved races) — visible and editable only by the signed-in owner.

## New tables
- `profiles` — one row per user account (name, zip code, admin flag)
- `locations` — a user's saved ballot-lookup location (city/state/zip only, no
  street address is persisted)
- `districts` — reference list of demo congressional/state/county/judicial/etc districts
- `elections` — election name + date
- `ballot_contests` — a race in an election, tied to a district
- `candidates` — candidate profile (bio, background, demo flag)
- `candidate_offices` — links a candidate to the contest they are running in
- `issues` — the shared list of issues voters can select, plus user-created custom issues
- `user_issues` — a user's private selected issues
- `sources` — every citable piece of evidence (article, record, statement, etc.)
- `candidate_positions` — a candidate's stated position on an issue, with a verification status
- `candidate_sources` — evidence links between a position and its sources
- `candidate_statements` — direct quotes/statements attributed to a candidate
- `voting_records` — legislative votes cast by a candidate
- `ballot_measures` — amendments/referendums/local measures
- `news_articles` — news/opinion/campaign coverage, clearly labeled by type
- `videos` — debates, interviews, speeches, town halls
- `social_posts` — official social media posts
- `judicial_records` — judicial-candidate-specific background
- `claims` — fact-check style claims for the Claim Explorer
- `claim_evidence` — sources backing a claim's assessment
- `saved_candidates` — a user's bookmarked candidates
- `saved_races` — a user's bookmarked contests

## Security
- Row Level Security is enabled on every table.
- Reference/public tables: anyone (signed in or not) can read; only an admin
  account (`profiles.is_admin = true`) can insert/update/delete.
- Personal tables: only the owning user (`auth.uid()`) can read or write their
  own rows.
- A `is_admin()` helper function centralizes the admin check so policies stay
  simple and avoid recursive lookups.
- A trigger automatically creates a `profiles` row whenever someone signs up.

## Notes
- No street address is stored — only city, state and zip, to minimize personal
  data collection per the product's privacy requirement.
- All demo/fictional records inserted later are flagged with `is_demo = true`
  where applicable so the UI can label them "DEMO DATA".
*/

-- =========================================================================
-- profiles
-- =========================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  zip_code text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- =========================================================================
-- Helper function: is the current user an admin?
-- SECURITY DEFINER so it can read profiles regardless of the caller's RLS.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false);
$$;

-- Auto-create a profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- locations (user's saved ballot-lookup location — no street address stored)
-- =========================================================================
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  city text,
  state text,
  zip_code text NOT NULL,
  county text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_location" ON locations;
CREATE POLICY "select_own_location" ON locations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_location" ON locations;
CREATE POLICY "insert_own_location" ON locations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_location" ON locations;
CREATE POLICY "update_own_location" ON locations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_location" ON locations;
CREATE POLICY "delete_own_location" ON locations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- =========================================================================
-- districts (public reference data)
-- =========================================================================
CREATE TABLE IF NOT EXISTS districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  district_type text NOT NULL CHECK (district_type IN
    ('congressional','state_senate','state_house','county','municipal','judicial','school','special')),
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE districts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_districts" ON districts;
CREATE POLICY "public_read_districts" ON districts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_districts" ON districts;
CREATE POLICY "admin_write_districts" ON districts FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_districts" ON districts;
CREATE POLICY "admin_update_districts" ON districts FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_districts" ON districts;
CREATE POLICY "admin_delete_districts" ON districts FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- elections
-- =========================================================================
CREATE TABLE IF NOT EXISTS elections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  election_date date NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE elections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_elections" ON elections;
CREATE POLICY "public_read_elections" ON elections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_elections" ON elections;
CREATE POLICY "admin_write_elections" ON elections FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_elections" ON elections;
CREATE POLICY "admin_update_elections" ON elections FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_elections" ON elections;
CREATE POLICY "admin_delete_elections" ON elections FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- ballot_contests
-- =========================================================================
CREATE TABLE IF NOT EXISTS ballot_contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  office_name text NOT NULL,
  contest_level text NOT NULL CHECK (contest_level IN ('federal','state','local','judicial')),
  seat_description text,
  term_length text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ballot_contests_election ON ballot_contests(election_id);
CREATE INDEX IF NOT EXISTS idx_ballot_contests_district ON ballot_contests(district_id);

ALTER TABLE ballot_contests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_contests" ON ballot_contests;
CREATE POLICY "public_read_contests" ON ballot_contests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_contests" ON ballot_contests;
CREATE POLICY "admin_write_contests" ON ballot_contests FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_contests" ON ballot_contests;
CREATE POLICY "admin_update_contests" ON ballot_contests FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_contests" ON ballot_contests;
CREATE POLICY "admin_delete_contests" ON ballot_contests FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- candidates
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  party text,
  photo_url text,
  bio text,
  education text,
  professional_background text,
  previous_offices text,
  military_service text,
  public_service text,
  website_url text,
  is_demo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_candidates" ON candidates;
CREATE POLICY "public_read_candidates" ON candidates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_candidates" ON candidates;
CREATE POLICY "admin_write_candidates" ON candidates FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_candidates" ON candidates;
CREATE POLICY "admin_update_candidates" ON candidates FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_candidates" ON candidates;
CREATE POLICY "admin_delete_candidates" ON candidates FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- candidate_offices
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  contest_id uuid NOT NULL REFERENCES ballot_contests(id) ON DELETE CASCADE,
  incumbent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_offices_candidate ON candidate_offices(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_offices_contest ON candidate_offices(contest_id);

ALTER TABLE candidate_offices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_candidate_offices" ON candidate_offices;
CREATE POLICY "public_read_candidate_offices" ON candidate_offices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_candidate_offices" ON candidate_offices;
CREATE POLICY "admin_write_candidate_offices" ON candidate_offices FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_candidate_offices" ON candidate_offices;
CREATE POLICY "admin_update_candidate_offices" ON candidate_offices FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_candidate_offices" ON candidate_offices;
CREATE POLICY "admin_delete_candidate_offices" ON candidate_offices FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- issues (shared list + user-created custom issues)
-- =========================================================================
CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  category text,
  is_custom boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_issues" ON issues;
CREATE POLICY "read_issues" ON issues FOR SELECT
  TO anon, authenticated USING (is_custom = false OR created_by = auth.uid());

DROP POLICY IF EXISTS "insert_issues" ON issues;
CREATE POLICY "insert_issues" ON issues FOR INSERT
  TO authenticated WITH CHECK (
    (is_custom = true AND created_by = auth.uid()) OR is_admin()
  );

DROP POLICY IF EXISTS "update_issues" ON issues;
CREATE POLICY "update_issues" ON issues FOR UPDATE
  TO authenticated USING (created_by = auth.uid() OR is_admin())
  WITH CHECK (created_by = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "delete_issues" ON issues;
CREATE POLICY "delete_issues" ON issues FOR DELETE
  TO authenticated USING (created_by = auth.uid() OR is_admin());

-- =========================================================================
-- user_issues (private issue selections)
-- =========================================================================
CREATE TABLE IF NOT EXISTS user_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, issue_id)
);

CREATE INDEX IF NOT EXISTS idx_user_issues_user ON user_issues(user_id);

ALTER TABLE user_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_user_issues" ON user_issues;
CREATE POLICY "select_own_user_issues" ON user_issues FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_user_issues" ON user_issues;
CREATE POLICY "insert_own_user_issues" ON user_issues FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_user_issues" ON user_issues;
CREATE POLICY "update_own_user_issues" ON user_issues FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_user_issues" ON user_issues;
CREATE POLICY "delete_own_user_issues" ON user_issues FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- =========================================================================
-- sources
-- =========================================================================
CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text,
  publisher text,
  source_type text NOT NULL CHECK (source_type IN
    ('government','candidate','campaign','legislative','court','news','interview','debate','video','social','opinion','other')),
  publication_date date,
  author text,
  description text,
  credibility_level text NOT NULL CHECK (credibility_level IN ('primary','secondary','other')) DEFAULT 'secondary',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_sources" ON sources;
CREATE POLICY "public_read_sources" ON sources FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_sources" ON sources;
CREATE POLICY "admin_write_sources" ON sources FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_sources" ON sources;
CREATE POLICY "admin_update_sources" ON sources FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_sources" ON sources;
CREATE POLICY "admin_delete_sources" ON sources FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- candidate_positions
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  summary text,
  verification_status text NOT NULL CHECK (verification_status IN
    ('verified','not_verified','insufficient_information')) DEFAULT 'not_verified',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_positions_candidate ON candidate_positions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_positions_issue ON candidate_positions(issue_id);

ALTER TABLE candidate_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_positions" ON candidate_positions;
CREATE POLICY "public_read_positions" ON candidate_positions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_positions" ON candidate_positions;
CREATE POLICY "admin_write_positions" ON candidate_positions FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_positions" ON candidate_positions;
CREATE POLICY "admin_update_positions" ON candidate_positions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_positions" ON candidate_positions;
CREATE POLICY "admin_delete_positions" ON candidate_positions FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- candidate_sources (evidence linking positions to sources)
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_position_id uuid NOT NULL REFERENCES candidate_positions(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_sources_position ON candidate_sources(candidate_position_id);

ALTER TABLE candidate_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_candidate_sources" ON candidate_sources;
CREATE POLICY "public_read_candidate_sources" ON candidate_sources FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_candidate_sources" ON candidate_sources;
CREATE POLICY "admin_write_candidate_sources" ON candidate_sources FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_candidate_sources" ON candidate_sources;
CREATE POLICY "admin_update_candidate_sources" ON candidate_sources FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_candidate_sources" ON candidate_sources;
CREATE POLICY "admin_delete_candidate_sources" ON candidate_sources FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- candidate_statements
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  statement_text text NOT NULL,
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  statement_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_statements_candidate ON candidate_statements(candidate_id);

ALTER TABLE candidate_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_statements" ON candidate_statements;
CREATE POLICY "public_read_statements" ON candidate_statements FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_statements" ON candidate_statements;
CREATE POLICY "admin_write_statements" ON candidate_statements FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_statements" ON candidate_statements;
CREATE POLICY "admin_update_statements" ON candidate_statements FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_statements" ON candidate_statements;
CREATE POLICY "admin_delete_statements" ON candidate_statements FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- voting_records
-- =========================================================================
CREATE TABLE IF NOT EXISTS voting_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  bill_name text NOT NULL,
  bill_number text,
  vote text CHECK (vote IN ('yes','no','abstain','absent')),
  vote_date date,
  chamber text,
  description text,
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voting_records_candidate ON voting_records(candidate_id);

ALTER TABLE voting_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_voting_records" ON voting_records;
CREATE POLICY "public_read_voting_records" ON voting_records FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_voting_records" ON voting_records;
CREATE POLICY "admin_write_voting_records" ON voting_records FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_voting_records" ON voting_records;
CREATE POLICY "admin_update_voting_records" ON voting_records FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_voting_records" ON voting_records;
CREATE POLICY "admin_delete_voting_records" ON voting_records FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- ballot_measures
-- =========================================================================
CREATE TABLE IF NOT EXISTS ballot_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  title text NOT NULL,
  measure_type text NOT NULL CHECK (measure_type IN ('amendment','referendum','local')),
  summary text,
  full_text_url text,
  arguments_for text,
  arguments_against text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ballot_measures_election ON ballot_measures(election_id);

ALTER TABLE ballot_measures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_measures" ON ballot_measures;
CREATE POLICY "public_read_measures" ON ballot_measures FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_measures" ON ballot_measures;
CREATE POLICY "admin_write_measures" ON ballot_measures FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_measures" ON ballot_measures;
CREATE POLICY "admin_update_measures" ON ballot_measures FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_measures" ON ballot_measures;
CREATE POLICY "admin_delete_measures" ON ballot_measures FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- news_articles
-- =========================================================================
CREATE TABLE IF NOT EXISTS news_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES candidates(id) ON DELETE CASCADE,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  title text NOT NULL,
  url text,
  publisher text,
  article_type text NOT NULL CHECK (article_type IN ('reporting','opinion','campaign_material','social_media')),
  media_category text NOT NULL CHECK (media_category IN
    ('news','local_news','investigation','video','debate','interview','speech','town_hall','social','podcast')),
  summary text,
  published_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_articles_candidate ON news_articles(candidate_id);

ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_news" ON news_articles;
CREATE POLICY "public_read_news" ON news_articles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_news" ON news_articles;
CREATE POLICY "admin_write_news" ON news_articles FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_news" ON news_articles;
CREATE POLICY "admin_update_news" ON news_articles FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_news" ON news_articles;
CREATE POLICY "admin_delete_news" ON news_articles FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- videos
-- =========================================================================
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES candidates(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text,
  thumbnail_url text,
  video_type text,
  publisher text,
  description text,
  published_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_videos_candidate ON videos(candidate_id);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_videos" ON videos;
CREATE POLICY "public_read_videos" ON videos FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_videos" ON videos;
CREATE POLICY "admin_write_videos" ON videos FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_videos" ON videos;
CREATE POLICY "admin_update_videos" ON videos FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_videos" ON videos;
CREATE POLICY "admin_delete_videos" ON videos FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- social_posts
-- =========================================================================
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  platform text,
  content text,
  url text,
  posted_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_candidate ON social_posts(candidate_id);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_social_posts" ON social_posts;
CREATE POLICY "public_read_social_posts" ON social_posts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_social_posts" ON social_posts;
CREATE POLICY "admin_write_social_posts" ON social_posts FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_social_posts" ON social_posts;
CREATE POLICY "admin_update_social_posts" ON social_posts FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_social_posts" ON social_posts;
CREATE POLICY "admin_delete_social_posts" ON social_posts FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- judicial_records
-- =========================================================================
CREATE TABLE IF NOT EXISTS judicial_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
  current_position text,
  bar_admission_date date,
  bar_number text,
  previous_judicial_experience text,
  notable_decisions text,
  disciplinary_records text,
  endorsements text,
  campaign_contributions_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE judicial_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_judicial_records" ON judicial_records;
CREATE POLICY "public_read_judicial_records" ON judicial_records FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_judicial_records" ON judicial_records;
CREATE POLICY "admin_write_judicial_records" ON judicial_records FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_judicial_records" ON judicial_records;
CREATE POLICY "admin_update_judicial_records" ON judicial_records FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_judicial_records" ON judicial_records;
CREATE POLICY "admin_delete_judicial_records" ON judicial_records FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- claims + claim_evidence (Claim Explorer)
-- =========================================================================
CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text text NOT NULL,
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  assessment text NOT NULL CHECK (assessment IN
    ('requires_context','supported','unsupported','insufficient_information')) DEFAULT 'insufficient_information',
  explanation text,
  submitted_by uuid DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_claims" ON claims;
CREATE POLICY "public_read_claims" ON claims FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_claims" ON claims;
CREATE POLICY "authenticated_insert_claims" ON claims FOR INSERT
  TO authenticated WITH CHECK (submitted_by = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "admin_update_claims" ON claims;
CREATE POLICY "admin_update_claims" ON claims FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_claims" ON claims;
CREATE POLICY "admin_delete_claims" ON claims FOR DELETE
  TO authenticated USING (is_admin());

CREATE TABLE IF NOT EXISTS claim_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON claim_evidence(claim_id);

ALTER TABLE claim_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_claim_evidence" ON claim_evidence;
CREATE POLICY "public_read_claim_evidence" ON claim_evidence FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_claim_evidence" ON claim_evidence;
CREATE POLICY "admin_write_claim_evidence" ON claim_evidence FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_claim_evidence" ON claim_evidence;
CREATE POLICY "admin_update_claim_evidence" ON claim_evidence FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_claim_evidence" ON claim_evidence;
CREATE POLICY "admin_delete_claim_evidence" ON claim_evidence FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- saved_candidates / saved_races (personal bookmarks)
-- =========================================================================
CREATE TABLE IF NOT EXISTS saved_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_candidates_user ON saved_candidates(user_id);

ALTER TABLE saved_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_saved_candidates" ON saved_candidates;
CREATE POLICY "select_own_saved_candidates" ON saved_candidates FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_saved_candidates" ON saved_candidates;
CREATE POLICY "insert_own_saved_candidates" ON saved_candidates FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_saved_candidates" ON saved_candidates;
CREATE POLICY "delete_own_saved_candidates" ON saved_candidates FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS saved_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  contest_id uuid NOT NULL REFERENCES ballot_contests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, contest_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_races_user ON saved_races(user_id);

ALTER TABLE saved_races ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_saved_races" ON saved_races;
CREATE POLICY "select_own_saved_races" ON saved_races FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_saved_races" ON saved_races;
CREATE POLICY "insert_own_saved_races" ON saved_races FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_saved_races" ON saved_races;
CREATE POLICY "delete_own_saved_races" ON saved_races FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
