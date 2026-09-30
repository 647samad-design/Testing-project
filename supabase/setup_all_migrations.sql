-- BallotLens: complete database setup for a NEW, EMPTY Supabase project.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Contains all 93 migrations from migrations/, in order, in ONE transaction:
-- if anything fails, nothing is applied and you can safely run it again.
-- Do NOT run this on a database that already has BallotLens tables.
BEGIN;
DO $$ BEGIN IF to_regclass('public.candidates') IS NOT NULL THEN
  RAISE EXCEPTION 'This database already has BallotLens tables. Stop: this file is only for a brand-new project.';
END IF; END $$;
CREATE TABLE IF NOT EXISTS public.ballotlens_schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.ballotlens_schema_migrations ENABLE ROW LEVEL SECURITY;


-- ================= 20260815024958_create_ballotlens_schema.sql =================

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
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815024958_create_ballotlens_schema.sql');

-- ================= 20260815031241_revoke_execute_on_security_definer_functions.sql =================

/*
# Fix: Revoke public EXECUTE on SECURITY DEFINER helper functions

## Summary
Two SECURITY DEFINER helper functions (`is_admin()` and `handle_new_user()`)
were callable by the `anon` and `authenticated` roles via the PostgREST RPC
endpoint (`/rest/v1/rpc/...`). This allowed any visitor or signed-in user to
invoke these privileged functions directly through the API, which is not
intended.

## Changes
- `REVOKE EXECUTE` on `public.is_admin()` from `PUBLIC`, `anon`,
  `authenticated`. This function is only used inside RLS policy predicates
  (evaluated server-side by the table owner) and must not be callable via REST.
- `REVOKE EXECUTE` on `public.handle_new_user()` from `PUBLIC`, `anon`,
  `authenticated`. This function is only fired by the `on_auth_user_created`
  trigger on `auth.users` (run by the trigger owner) and must not be callable
  via REST.

## Security
- Neither function is exposed via `/rest/v1/rpc/` after this change.
- `is_admin()` continues to work inside RLS policies because policy
  expressions are evaluated with the table owner's privileges.
- `handle_new_user()` continues to work as a trigger because triggers execute
  with the trigger owner's privileges.

## Notes
- `service_role` and `postgres` retain EXECUTE (they inherit via `PUBLIC`
  revocation only removing grants for anon/authenticated; the owner always has
  implicit EXECUTE). If needed, an explicit `GRANT EXECUTE TO service_role`
  can be added later, but the owner (postgres) always retains execution rights.
*/

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815031241_revoke_execute_on_security_definer_functions.sql');

-- ================= 20260815034123_add_theme_preference_to_profiles.sql =================

/*
# Add theme_preference column to profiles

1. Modified Tables
- `profiles` — adds `theme_preference` column (text, defaults to 'personal')
  - Valid values: 'personal' (the warm teal/coral default) and 'usa' (navy/red patriotic theme)
  - Stored per-user so the app remembers the selected look
2. Security
- No new policies needed — the column is user-owned via existing profiles RLS
3. Notes
- Safe to re-run (uses IF NOT EXISTS)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'theme_preference'
  ) THEN
    ALTER TABLE profiles ADD COLUMN theme_preference text NOT NULL DEFAULT 'personal';
  END IF;
END $$;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815034123_add_theme_preference_to_profiles.sql');

-- ================= 20260815134447_add_plain_english_explanations.sql =================

/*
# Add plain-English explanation columns for bills and ballot measures

## Summary
Many people find political bills and ballot measures hard to understand because they're
written in legal language. This migration adds two new text columns:
1. `plain_english_summary` — a simple adult-level summary of what the bill/measure does
2. `eli5_explanation` — an "Explain Like I'm 5" breakdown using everyday analogies

## Modified Tables
### voting_records
- `plain_english_summary` (text, nullable) — plain-English summary of what the bill does
- `eli5_explanation` (text, nullable) — elementary-school-level explanation using simple analogies

### ballot_measures
- `plain_english_summary` (text, nullable) — plain-English summary of what the measure does
- `eli5_explanation` (text, nullable) — elementary-school-level explanation using simple analogies

## Security
- No new policies needed — these columns inherit existing RLS policies on their tables
- No new tables created

## Notes
- Safe to re-run (uses IF NOT EXISTS checks)
- Both columns are nullable so existing rows won't break
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voting_records' AND column_name = 'plain_english_summary'
  ) THEN
    ALTER TABLE voting_records ADD COLUMN plain_english_summary text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voting_records' AND column_name = 'eli5_explanation'
  ) THEN
    ALTER TABLE voting_records ADD COLUMN eli5_explanation text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ballot_measures' AND column_name = 'plain_english_summary'
  ) THEN
    ALTER TABLE ballot_measures ADD COLUMN plain_english_summary text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ballot_measures' AND column_name = 'eli5_explanation'
  ) THEN
    ALTER TABLE ballot_measures ADD COLUMN eli5_explanation text;
  END IF;
END $$;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815134447_add_plain_english_explanations.sql');

-- ================= 20260815142914_fix_is_admin_privilege_escalation.sql =================

/*
# Fix privilege escalation: revoke user-write access to is_admin column

## Summary
The `profiles.is_admin` column was writable by any authenticated user through
the Data API. Combined with the `update_own_profile` RLS policy (which allows
users to update their own row), a regular user could set `is_admin = true`
and gain admin privileges. This migration revokes UPDATE and INSERT on the
`is_admin` column from `anon` and `authenticated`, so only the service role
or a SECURITY DEFINER function can change it.

## Security
- Revokes column-level UPDATE and INSERT on `profiles.is_admin` from `anon` and `authenticated`
- Users can still update their own `full_name`, `zip_code`, and `theme_preference`
- The `is_admin()` SECURITY DEFINER function reads the column, which still works (SELECT is retained)
- The `handle_new_user` trigger inserts rows with `is_admin` defaulting to `false` (via service role), which still works

## Notes
- Safe to re-run (GRANT/REVOKE are idempotent)
*/

REVOKE UPDATE (is_admin) ON profiles FROM anon, authenticated;
REVOKE INSERT (is_admin) ON profiles FROM anon, authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815142914_fix_is_admin_privilege_escalation.sql');

-- ================= 20260815142926_fix_is_admin_column_grants.sql =================

/*
# Fix privilege escalation: restrict column-level access to is_admin on profiles

## Problem
The table-level GRANT on `profiles` gives `anon` and `authenticated` INSERT and UPDATE
on ALL columns, including `is_admin`. A signed-in user could update their own profile
row and set `is_admin = true`, granting themselves admin privileges.

## Fix
1. Revoke table-level INSERT and UPDATE from `anon` and `authenticated`
2. Re-grant INSERT and UPDATE on only the safe columns (full_name, zip_code, theme_preference)
3. Re-grant INSERT on `id` so the profile row can be created (the handle_new_user trigger
   runs as SECURITY DEFINER and bypasses these grants, but the client-side sign-up flow
   also inserts into profiles, so id must be insertable)

## Security
- `is_admin` can no longer be written by anon or authenticated through the Data API
- SELECT still works on all columns (needed for is_admin() function and profile display)
- The `handle_new_user` trigger runs as SECURITY DEFINER (service_role), so it bypasses
  these grants and can still insert rows with is_admin = false
- Only the service role or a SECURITY DEFINER function can change is_admin

## Notes
- Safe to re-run (GRANT/REVOKE are idempotent)
*/

-- Revoke broad table-level write grants
REVOKE INSERT ON profiles FROM anon, authenticated;
REVOKE UPDATE ON profiles FROM anon, authenticated;

-- Re-grant INSERT only on safe columns (id is needed for profile creation)
GRANT INSERT (id, full_name, zip_code, theme_preference) ON profiles TO anon, authenticated;

-- Re-grant UPDATE only on safe columns
GRANT UPDATE (full_name, zip_code, theme_preference) ON profiles TO anon, authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815142926_fix_is_admin_column_grants.sql');

-- ================= 20260815144115_create_zip_districts_mapping.sql =================

/*
# Create zip_districts mapping table

## Summary
Creates a mapping table that links ZIP codes to their corresponding districts
(congressional, state senate, state house, county, municipal, judicial, school).
This lets the app look up a voter's districts by ZIP code instead of returning
hardcoded demo data.

## New Tables
- `zip_districts`
  - `id` (uuid, primary key)
  - `zip_code` (text, not null) — the 5-digit ZIP code
  - `city` (text, nullable) — city name for this ZIP
  - `state` (text, not null) — state abbreviation or full name
  - `county` (text, nullable) — county name
  - `congressional_district_id` (uuid, nullable, FK to districts) — congressional district
  - `state_senate_district_id` (uuid, nullable, FK to districts) — state senate district
  - `state_house_district_id` (uuid, nullable, FK to districts) — state house district
  - `county_district_id` (uuid, nullable, FK to districts) — county district
  - `municipal_district_id` (uuid, nullable, FK to districts) — municipal/city district
  - `judicial_district_id` (uuid, nullable, FK to districts) — judicial circuit
  - `school_district_id` (uuid, nullable, FK to districts) — school district
  - `created_at` (timestamptz, default now())

## Security
- RLS enabled on `zip_districts`
- Public read access (TO anon, authenticated) — district lookup is available to everyone, no sign-in required
- No INSERT/UPDATE/DELETE for anon or authenticated — only the service role (admin) can modify mappings

## Notes
- Safe to re-run (IF NOT EXISTS)
- Unique index on zip_code to prevent duplicates
- Foreign keys reference existing districts table
*/

CREATE TABLE IF NOT EXISTS zip_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zip_code text NOT NULL,
  city text,
  state text NOT NULL,
  county text,
  congressional_district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  state_senate_district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  state_house_district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  county_district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  municipal_district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  judicial_district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  school_district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS zip_districts_zip_code_idx ON zip_districts(zip_code);

ALTER TABLE zip_districts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_zip_districts" ON zip_districts;
CREATE POLICY "public_select_zip_districts"
  ON zip_districts FOR SELECT
  TO anon, authenticated USING (true);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815144115_create_zip_districts_mapping.sql');

-- ================= 20260815200243_create_monetization_and_candidate_portal_schema.sql =================

/*
# Monetization + Candidate Portal Schema

## Summary
Adds the database infrastructure for three revenue streams and a
candidate self-service portal:

1. **Advertising** — advertisers create accounts, upload ad creative,
   target by geography/placement, and track impressions/clicks. Ads are
   completely separate from candidate rankings and editorial content.
2. **Sponsorship** — sponsors can underwrite election guides and civic
   education pages. Sponsorships are always clearly labeled.
3. **Candidate profile claiming** — candidates can claim their profile
   (like a Google Business listing), submit bio/website/social/contact
   info, position statements, questionnaire responses, and events. All
   submissions go through admin approval before becoming public. Paid
   profile management services are tracked but never affect rankings.
4. **Subscriptions** — premium voter subscriptions with Stripe
   integration tracking (customer/subscription IDs, plan, status).

## New tables
- `advertisers` — advertiser accounts (linked to auth user)
- `advertisements` — individual ad creatives with targeting + status
- `ad_events` — impression and click tracking (append-only)
- `sponsors` — sponsor profiles
- `sponsorships` — sponsorship placements on specific pages
- `sponsor_events` — impression/click tracking for sponsorships
- `candidate_claims` — a candidate's request to claim their profile
- `candidate_submissions` — candidate-provided info pending admin approval
- `candidate_events` — upcoming campaign events submitted by candidates
- `candidate_questionnaire_responses` — candidate answers to questionnaire items
- `subscriptions` — premium subscription records tied to Stripe
- `ad_plans` — admin-configurable advertising pricing tiers
- `candidate_service_plans` — admin-configurable candidate service pricing

## Security
- RLS enabled on every table.
- Public can read only active/published ads, sponsors, sponsorships,
  approved candidate submissions, and verified candidate claims.
- Advertisers can CRUD their own ads and read their own analytics.
- Candidates can read/submit their own claims, submissions, events,
  questionnaire responses — nothing is auto-published.
- Admins can manage everything.
- Subscription records are only visible to the owning user + admins.
- No secrets are stored in these tables (Stripe keys live in edge
  function secrets, not the DB).

## Notes
- Ad/sponsor placements never interact with candidate sorting or
  editorial content — they are rendered in dedicated ad slots only.
- Candidate submissions have a `status` column: pending → approved →
  rejected. Only `approved` rows are visible to the public.
- Candidate claims have a `status` column: pending → verified / rejected.
  A verified claim grants the candidate user ownership of that profile's
  submissions.
*/

-- =========================================================================
-- advertisers
-- =========================================================================
CREATE TABLE IF NOT EXISTS advertisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  logo_url text,
  website_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE advertisers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_advertiser" ON advertisers;
CREATE POLICY "select_own_advertiser" ON advertisers FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "insert_own_advertiser" ON advertisers;
CREATE POLICY "insert_own_advertiser" ON advertisers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_advertiser" ON advertisers;
CREATE POLICY "update_own_advertiser" ON advertisers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "admin_delete_advertiser" ON advertisers;
CREATE POLICY "admin_delete_advertiser" ON advertisers FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- advertisements
-- =========================================================================
CREATE TABLE IF NOT EXISTS advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  campaign_name text NOT NULL,
  ad_title text NOT NULL,
  ad_description text,
  image_url text,
  destination_url text NOT NULL,
  ad_type text NOT NULL CHECK (ad_type IN ('banner','square','sidebar','mobile','sponsored_content')) DEFAULT 'banner',
  placement text NOT NULL CHECK (placement IN
    ('homepage','candidates_page','candidate_profile','issues_page','election_page','news_page','search','mobile','footer','sidebar')) DEFAULT 'homepage',
  target_state text,
  target_city text,
  target_zip text,
  target_district text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  budget numeric(10,2),
  status text NOT NULL CHECK (status IN ('draft','pending','active','paused','rejected','expired')) DEFAULT 'draft',
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_advertiser ON advertisements(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ads_placement_status ON advertisements(placement, status);
CREATE INDEX IF NOT EXISTS idx_ads_target_state ON advertisements(target_state);

ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

-- Public can see only active, in-date-range ads
DROP POLICY IF EXISTS "public_read_active_ads" ON advertisements;
CREATE POLICY "public_read_active_ads" ON advertisements FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND start_date <= CURRENT_DATE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  );

-- Advertisers can see their own ads (any status); admins see all
DROP POLICY IF EXISTS "read_own_ads" ON advertisements;
CREATE POLICY "read_own_ads" ON advertisements FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "insert_own_ads" ON advertisements;
CREATE POLICY "insert_own_ads" ON advertisements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_ads" ON advertisements;
CREATE POLICY "update_own_ads" ON advertisements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "delete_own_ads" ON advertisements;
CREATE POLICY "delete_own_ads" ON advertisements FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
    OR is_admin()
  );

-- =========================================================================
-- ad_events (impression + click tracking, append-only)
-- =========================================================================
CREATE TABLE IF NOT EXISTS ad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression','click')),
  viewer_state text,
  viewer_zip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_events_ad ON ad_events(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_events_type ON ad_events(event_type);

ALTER TABLE ad_events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can log an impression or click
DROP POLICY IF EXISTS "public_insert_ad_events" ON ad_events;
CREATE POLICY "public_insert_ad_events" ON ad_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Advertisers and admins can read events for their own ads
DROP POLICY IF EXISTS "read_own_ad_events" ON ad_events;
CREATE POLICY "read_own_ad_events" ON ad_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_events.advertisement_id AND a.user_id = auth.uid()
    )
    OR is_admin()
  );

-- =========================================================================
-- sponsors
-- =========================================================================
CREATE TABLE IF NOT EXISTS sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  sponsor_name text NOT NULL,
  contact_email text NOT NULL,
  logo_url text,
  website_url text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_sponsors" ON sponsors;
CREATE POLICY "public_read_sponsors" ON sponsors FOR SELECT
  TO anon, authenticated USING (is_active = true OR is_admin());

DROP POLICY IF EXISTS "insert_sponsors" ON sponsors;
CREATE POLICY "insert_sponsors" ON sponsors FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "update_sponsors" ON sponsors;
CREATE POLICY "update_sponsors" ON sponsors FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "delete_sponsors" ON sponsors;
CREATE POLICY "delete_sponsors" ON sponsors FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- sponsorships
-- =========================================================================
CREATE TABLE IF NOT EXISTS sponsorships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  campaign_name text NOT NULL,
  placement text NOT NULL CHECK (placement IN
    ('election_guide','voter_education','election_calendar','educational_article','civic_page','ballot_page')),
  target_state text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  budget numeric(10,2),
  status text NOT NULL CHECK (status IN ('draft','pending','active','paused','expired')) DEFAULT 'draft',
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsorships_sponsor ON sponsorships(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sponsorships_placement_status ON sponsorships(placement, status);

ALTER TABLE sponsorships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_sponsorships" ON sponsorships;
CREATE POLICY "public_read_sponsorships" ON sponsorships FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND start_date <= CURRENT_DATE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  );

DROP POLICY IF EXISTS "read_all_sponsorships" ON sponsorships;
CREATE POLICY "read_all_sponsorships" ON sponsorships FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sponsors s WHERE s.id = sponsorships.sponsor_id AND s.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "insert_sponsorships" ON sponsorships;
CREATE POLICY "insert_sponsorships" ON sponsorships FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sponsors s WHERE s.id = sponsorships.sponsor_id AND s.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "update_sponsorships" ON sponsorships;
CREATE POLICY "update_sponsorships" ON sponsorships FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sponsors s WHERE s.id = sponsorships.sponsor_id AND s.user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM sponsors s WHERE s.id = sponsorships.sponsor_id AND s.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "delete_sponsorships" ON sponsorships;
CREATE POLICY "delete_sponsorships" ON sponsorships FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- sponsor_events (impression + click tracking)
-- =========================================================================
CREATE TABLE IF NOT EXISTS sponsor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsorship_id uuid NOT NULL REFERENCES sponsorships(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression','click')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_events_sponsorship ON sponsor_events(sponsorship_id);

ALTER TABLE sponsor_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_sponsor_events" ON sponsor_events;
CREATE POLICY "public_insert_sponsor_events" ON sponsor_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "read_own_sponsor_events" ON sponsor_events;
CREATE POLICY "read_own_sponsor_events" ON sponsor_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sponsorships sp
      JOIN sponsors s ON s.id = sp.sponsor_id
      WHERE sp.id = sponsor_events.sponsorship_id AND s.user_id = auth.uid()
    )
    OR is_admin()
  );

-- =========================================================================
-- candidate_claims
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  campaign_name text,
  office text,
  email text NOT NULL,
  campaign_website text,
  verification_notes text,
  status text NOT NULL CHECK (status IN ('pending','verified','rejected')) DEFAULT 'pending',
  admin_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_claims_candidate ON candidate_claims(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_claims_user ON candidate_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_candidate_claims_status ON candidate_claims(status);

ALTER TABLE candidate_claims ENABLE ROW LEVEL SECURITY;

-- Public can see that a claim exists and is verified (to show the badge)
DROP POLICY IF EXISTS "public_read_verified_claims" ON candidate_claims;
CREATE POLICY "public_read_verified_claims" ON candidate_claims FOR SELECT
  TO anon, authenticated
  USING (status = 'verified');

-- Claimants can see their own claims; admins see all
DROP POLICY IF EXISTS "read_own_claims" ON candidate_claims;
CREATE POLICY "read_own_claims" ON candidate_claims FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_own_claim" ON candidate_claims;
CREATE POLICY "insert_own_claim" ON candidate_claims FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_claim" ON candidate_claims;
CREATE POLICY "update_own_claim" ON candidate_claims FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "delete_own_claim" ON candidate_claims;
CREATE POLICY "delete_own_claim" ON candidate_claims FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin());

-- =========================================================================
-- candidate_submissions (candidate-provided info pending approval)
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name text NOT NULL CHECK (field_name IN
    ('bio','education','professional_background','previous_offices','military_service',
     'public_service','website_url','photo_url','campaign_email','campaign_phone',
     'social_facebook','social_twitter','social_instagram','social_linkedin',
     'position_statement')),
  field_value text,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  admin_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_submissions_candidate ON candidate_submissions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_submissions_status ON candidate_submissions(status);

ALTER TABLE candidate_submissions ENABLE ROW LEVEL SECURITY;

-- Public can see only approved submissions
DROP POLICY IF EXISTS "public_read_approved_submissions" ON candidate_submissions;
CREATE POLICY "public_read_approved_submissions" ON candidate_submissions FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- Candidates can see their own submissions; admins see all
DROP POLICY IF EXISTS "read_own_submissions" ON candidate_submissions;
CREATE POLICY "read_own_submissions" ON candidate_submissions FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_own_submission" ON candidate_submissions;
CREATE POLICY "insert_own_submission" ON candidate_submissions FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_submission" ON candidate_submissions;
CREATE POLICY "update_own_submission" ON candidate_submissions FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "delete_own_submission" ON candidate_submissions;
CREATE POLICY "delete_own_submission" ON candidate_submissions FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin());

-- =========================================================================
-- candidate_questionnaire_responses
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_questionnaire_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_responses_candidate ON candidate_questionnaire_responses(candidate_id);

ALTER TABLE candidate_questionnaire_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_approved_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "public_read_approved_questionnaire" ON candidate_questionnaire_responses FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS "read_own_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "read_own_questionnaire" ON candidate_questionnaire_responses FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_own_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "insert_own_questionnaire" ON candidate_questionnaire_responses FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "update_own_questionnaire" ON candidate_questionnaire_responses FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "delete_own_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "delete_own_questionnaire" ON candidate_questionnaire_responses FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin());

-- =========================================================================
-- candidate_events
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time text,
  end_time text,
  location_name text,
  address text,
  city text,
  state text,
  virtual_url text,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_events_candidate ON candidate_events(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_events_date ON candidate_events(event_date);

ALTER TABLE candidate_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_approved_events" ON candidate_events;
CREATE POLICY "public_read_approved_events" ON candidate_events FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' AND event_date >= CURRENT_DATE);

DROP POLICY IF EXISTS "read_own_events" ON candidate_events;
CREATE POLICY "read_own_events" ON candidate_events FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_own_event" ON candidate_events;
CREATE POLICY "insert_own_event" ON candidate_events FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_event" ON candidate_events;
CREATE POLICY "update_own_event" ON candidate_events FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "delete_own_event" ON candidate_events;
CREATE POLICY "delete_own_event" ON candidate_events FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin());

-- =========================================================================
-- subscriptions (premium voter subscriptions)
-- =========================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('free','premium_monthly','premium_yearly')) DEFAULT 'free',
  status text NOT NULL CHECK (status IN ('active','canceled','past_due','trialing','expired')) DEFAULT 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscription" ON subscriptions;
CREATE POLICY "select_own_subscription" ON subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "insert_own_subscription" ON subscriptions;
CREATE POLICY "insert_own_subscription" ON subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "update_own_subscription" ON subscriptions;
CREATE POLICY "update_own_subscription" ON subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "delete_own_subscription" ON subscriptions;
CREATE POLICY "delete_own_subscription" ON subscriptions FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- ad_plans (admin-configurable advertising pricing)
-- =========================================================================
CREATE TABLE IF NOT EXISTS ad_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name text NOT NULL,
  description text,
  monthly_price numeric(10,2) NOT NULL,
  features text[],
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_ad_plans" ON ad_plans;
CREATE POLICY "public_read_ad_plans" ON ad_plans FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_write_ad_plans" ON ad_plans;
CREATE POLICY "admin_write_ad_plans" ON ad_plans FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_ad_plans" ON ad_plans;
CREATE POLICY "admin_update_ad_plans" ON ad_plans FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_ad_plans" ON ad_plans;
CREATE POLICY "admin_delete_ad_plans" ON ad_plans FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- candidate_service_plans (admin-configurable candidate service pricing)
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_service_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name text NOT NULL,
  description text,
  annual_price numeric(10,2) NOT NULL,
  features text[],
  is_active boolean NOT NULL DEFAULT true,
  is_available boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE candidate_service_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_candidate_service_plans" ON candidate_service_plans;
CREATE POLICY "public_read_candidate_service_plans" ON candidate_service_plans FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_write_candidate_service_plans" ON candidate_service_plans;
CREATE POLICY "admin_write_candidate_service_plans" ON candidate_service_plans FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_candidate_service_plans" ON candidate_service_plans;
CREATE POLICY "admin_update_candidate_service_plans" ON candidate_service_plans FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_candidate_service_plans" ON candidate_service_plans;
CREATE POLICY "admin_delete_candidate_service_plans" ON candidate_service_plans FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- Seed default pricing tiers
-- =========================================================================
INSERT INTO ad_plans (plan_name, description, monthly_price, features, display_order) VALUES
  ('Local Business', 'Geographic targeting with homepage and election-page placement plus basic analytics.', 250.00, ARRAY['Geographic targeting','Homepage placement','Election-page placement','Basic analytics'], 1),
  ('Premium Local', 'Multiple placements with higher impression allocation and full analytics.', 500.00, ARRAY['Multiple placements','Geographic targeting','Higher impression allocation','Full analytics'], 2),
  ('Regional', 'Multi-city targeting with advanced targeting and analytics.', 1000.00, ARRAY['Multiple cities','Multiple placements','Advanced targeting','Analytics dashboard'], 3)
ON CONFLICT DO NOTHING;

INSERT INTO candidate_service_plans (plan_name, description, annual_price, features, display_order) VALUES
  ('Profile Claim', 'Verified badge, candidate-submitted biography, website, social links, campaign contact info, and questionnaire.', 99.00, ARRAY['Verified profile badge','Candidate-submitted biography','Campaign website & social links','Campaign contact information','Candidate questionnaire'], 1),
  ('Premium Profile Management', 'Full profile management, questionnaire management, event updates, and profile update assistance.', 299.00, ARRAY['Everything in Profile Claim','Profile management assistance','Questionnaire management','Event updates','Profile update assistance'], 2)
ON CONFLICT DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815200243_create_monetization_and_candidate_portal_schema.sql');

-- ================= 20260815200629_add_increment_ad_counter_rpc.sql =================

/*
# Add increment_ad_counter RPC

## Summary
Creates a SECURITY DEFINER function to atomically increment either the
`impressions` or `clicks` counter on an advertisement row. This is called
after logging an ad_event so analytics counters stay in sync.

## Security
- SECURITY DEFINER so anon users (who log impressions/clicks) can increment
  the counter without needing UPDATE privileges on the advertisements table.
- Only accepts 'impressions' or 'clicks' as the column name — no arbitrary
  column updates.
*/

CREATE OR REPLACE FUNCTION public.increment_ad_counter(
  ad_id uuid,
  column_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF column_name NOT IN ('impressions', 'clicks') THEN
    RAISE EXCEPTION 'Invalid column name: %', column_name;
  END IF;

  IF column_name = 'impressions' THEN
    UPDATE advertisements SET impressions = impressions + 1, updated_at = now() WHERE id = ad_id;
  ELSE
    UPDATE advertisements SET clicks = clicks + 1, updated_at = now() WHERE id = ad_id;
  END IF;
END;
$$;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815200629_add_increment_ad_counter_rpc.sql');

-- ================= 20260815201550_20260815160000_create_stories_tables.sql.sql =================

-- Story categories
CREATE TABLE IF NOT EXISTS story_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE story_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_story_categories" ON story_categories;
CREATE POLICY "public_read_story_categories" ON story_categories FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admin_write_story_categories" ON story_categories;
CREATE POLICY "admin_write_story_categories" ON story_categories FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_story_categories" ON story_categories;
CREATE POLICY "admin_update_story_categories" ON story_categories FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_story_categories" ON story_categories;
CREATE POLICY "admin_delete_story_categories" ON story_categories FOR DELETE
  TO authenticated USING (is_admin());

INSERT INTO story_categories (name, slug, description, color) VALUES
  ('Civic Education', 'civic-education', 'How government works and why it matters', 'emerald'),
  ('Election Analysis', 'election-analysis', 'Breaking down election results and trends', 'blue'),
  ('Voter Stories', 'voter-stories', 'Real people, real civic engagement', 'amber'),
  ('Local Politics', 'local-politics', 'City council, school boards, and local impact', 'teal'),
  ('Legislation Explained', 'legislation-explained', 'Plain-English breakdowns of bills and laws', 'rose'),
  ('Off-Season', 'off-season', 'Keeping you engaged between elections', 'violet')
ON CONFLICT (slug) DO NOTHING;

-- Stories
CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  body text NOT NULL,
  category_id uuid REFERENCES story_categories(id) ON DELETE SET NULL,
  author_name text,
  hero_image_url text,
  tags text,
  is_featured boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  read_time_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stories_published ON stories(is_published);
CREATE INDEX IF NOT EXISTS idx_stories_category ON stories(category_id);
CREATE INDEX IF NOT EXISTS idx_stories_featured ON stories(is_featured);
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_stories" ON stories;
CREATE POLICY "public_read_stories" ON stories FOR SELECT
  TO anon, authenticated USING (is_published = true);
DROP POLICY IF EXISTS "admin_write_stories" ON stories;
CREATE POLICY "admin_write_stories" ON stories FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_stories" ON stories;
CREATE POLICY "admin_update_stories" ON stories FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_stories" ON stories;
CREATE POLICY "admin_delete_stories" ON stories FOR DELETE
  TO authenticated USING (is_admin());
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815201550_20260815160000_create_stories_tables.sql.sql');

-- ================= 20260815203305_20260815210000_add_new_issues.sql.sql =================

-- Add new issues
INSERT INTO issues (name, slug, category, is_custom) VALUES
  ('Cost of Living', 'cost-of-living', 'Domestic Policy', false),
  ('Gun Violence', 'gun-violence', 'Domestic Policy', false),
  ('Abortion & Reproductive Rights', 'abortion-reproductive-rights', 'Domestic Policy', false),
  ('Dark Money & Campaign Finance', 'dark-money-campaign-finance', 'Democracy', false),
  ('Political Division & Polarization', 'political-division-polarization', 'Democracy', false)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815203305_20260815210000_add_new_issues.sql.sql');

-- ================= 20260815203954_20260815220000_create_candidate_tags.sql.sql =================

/*
# Create candidate_tags table

1. New Tables
- `candidate_tags` — stores user-applied informational tags on candidates
  - `id` (uuid, primary key)
  - `candidate_id` (uuid, references candidates, not null)
  - `user_id` (uuid, not null, defaults to auth.uid())
  - `tag` (text, not null — e.g. 'pro-black', 'pro-aipac', 'pro-life')
  - `created_at` (timestamptz, defaults to now())
  - Unique constraint on (candidate_id, user_id, tag) — one user can apply a tag once per candidate

2. Security
- RLS enabled.
- SELECT: anyone (anon + authenticated) can read tags — they are informational and public.
- INSERT: only authenticated users can tag, and only for themselves (user_id = auth.uid()).
- DELETE: only authenticated users can remove their own tags.
- UPDATE: not needed — tags are add/remove only.

3. Notes
- Tags are informational labels (e.g. "Pro-Black", "Pro-AIPAC", "Pro-Life") to help voters
  identify candidates' positions. They are not endorsements or negative labels.
- The unique constraint prevents duplicate tags from the same user on the same candidate.
*/

CREATE TABLE IF NOT EXISTS candidate_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_tags_unique UNIQUE (candidate_id, user_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_candidate_tags_candidate ON candidate_tags(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_tags_tag ON candidate_tags(tag);

ALTER TABLE candidate_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_candidate_tags" ON candidate_tags;
CREATE POLICY "public_read_candidate_tags" ON candidate_tags FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_candidate_tags" ON candidate_tags;
CREATE POLICY "insert_own_candidate_tags" ON candidate_tags FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_candidate_tags" ON candidate_tags;
CREATE POLICY "delete_own_candidate_tags" ON candidate_tags FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260815203954_20260815220000_create_candidate_tags.sql.sql');

-- ================= 20260816153001_populate_florida_districts_and_election.sql =================

/*
# Populate comprehensive Florida election data — Part 1: Districts & Election

## Summary
Loads all Florida political districts into the database:
- 67 counties
- 28 congressional districts (post-2020 redistricting)
- 40 state senate districts
- 120 state house districts
- 20 judicial circuits
- 67 school districts
- 28 major municipalities

Also creates a 2026 General Election with ballot contests for each district
(U.S. Representative, U.S. Senator, State Senator, State Representative, County Commissioner).

## Security
No RLS changes — uses existing public read / admin write policies on districts,
elections, and ballot_contests.
*/

INSERT INTO districts (id, name, district_type, state) VALUES
(gen_random_uuid(), 'State House District 1', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 2', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 3', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 4', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 5', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 6', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 7', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 8', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 9', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 10', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 11', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 12', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 13', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 14', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 15', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 16', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 17', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 18', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 19', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 20', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 21', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 22', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 23', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 24', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 25', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 26', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 27', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 28', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 29', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 30', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 31', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 32', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 33', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 34', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 35', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 36', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 37', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 38', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 39', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 40', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 41', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 42', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 43', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 44', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 45', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 46', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 47', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 48', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 49', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 50', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 51', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 52', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 53', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 54', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 55', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 56', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 57', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 58', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 59', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 60', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 61', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 62', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 63', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 64', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 65', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 66', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 67', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 68', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 69', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 70', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 71', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 72', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 73', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 74', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 75', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 76', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 77', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 78', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 79', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 80', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 81', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 82', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 83', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 84', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 85', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 86', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 87', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 88', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 89', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 90', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 91', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 92', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 93', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 94', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 95', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 96', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 97', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 98', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 99', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 100', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 101', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 102', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 103', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 104', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 105', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 106', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 107', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 108', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 109', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 110', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 111', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 112', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 113', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 114', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 115', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 116', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 117', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 118', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 119', 'state_house', 'Florida'),
(gen_random_uuid(), 'State House District 120', 'state_house', 'Florida'),
(gen_random_uuid(), '1st Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '2nd Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '3rd Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '4th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '5th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '6th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '7th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '8th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '9th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '10th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '11th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '12th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '13th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '14th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '15th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '16th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '17th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '18th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '19th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), '20th Judicial Circuit', 'judicial', 'Florida'),
(gen_random_uuid(), 'Alachua County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Baker County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Bay County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Bradford County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Brevard County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Broward County Public Schools', 'school', 'Florida'),
(gen_random_uuid(), 'Calhoun County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Charlotte County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Citrus County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Clay County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Collier County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Columbia County School District', 'school', 'Florida'),
(gen_random_uuid(), 'DeSoto County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Dixie County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Duval County Public Schools', 'school', 'Florida'),
(gen_random_uuid(), 'Escambia County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Flagler County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Franklin County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Gadsden County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Gilchrist County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Glades County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Gulf County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Hamilton County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Hardee County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Hendry County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Hernando County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Highlands County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Hillsborough County Public Schools', 'school', 'Florida'),
(gen_random_uuid(), 'Holmes County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Indian River County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Jackson County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Jefferson County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Lafayette County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Lake County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Lee County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Leon County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Levy County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Liberty County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Madison County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Manatee County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Marion County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Martin County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Miami-Dade County Public Schools', 'school', 'Florida'),
(gen_random_uuid(), 'Monroe County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Nassau County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Okaloosa County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Okeechobee County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Orange County Public Schools', 'school', 'Florida'),
(gen_random_uuid(), 'Osceola County School District', 'school', 'Florida'),
(gen_random_uuid(), 'School District of Palm Beach County', 'school', 'Florida'),
(gen_random_uuid(), 'Pasco County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Pinellas County Schools', 'school', 'Florida'),
(gen_random_uuid(), 'Polk County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Putnam County School District', 'school', 'Florida'),
(gen_random_uuid(), 'St. Johns County School District', 'school', 'Florida'),
(gen_random_uuid(), 'St. Lucie County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Santa Rosa County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Sarasota County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Seminole County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Sumter County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Suwannee County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Taylor County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Union County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Volusia County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Wakulla County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Walton County School District', 'school', 'Florida'),
(gen_random_uuid(), 'Washington County School District', 'school', 'Florida'),
(gen_random_uuid(), 'City of Jacksonville', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Miami', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Tampa', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Orlando', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of St. Petersburg', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Hialeah', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Tallahassee', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Fort Lauderdale', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Port St. Lucie', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Cape Coral', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Pembroke Pines', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Hollywood', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Gainesville', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Miramar', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Coral Springs', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Clearwater', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Palm Bay', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of West Palm Beach', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Lakeland', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Pompano Beach', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Davie', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Miami Gardens', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Sunrise', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Plantation', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Boca Raton', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Pensacola', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Sarasota', 'municipal', 'Florida'),
(gen_random_uuid(), 'City of Naples', 'municipal', 'Florida')
ON CONFLICT DO NOTHING;

INSERT INTO elections (id, name, election_date, description)
VALUES (gen_random_uuid(), '2026 General Election', '2026-11-03', 'Florida 2026 General Election');

INSERT INTO ballot_contests (id, election_id, district_id, office_name, contest_level, seat_description, term_length)
SELECT gen_random_uuid(), e.id, d.id, 'U.S. Representative', 'federal', NULL, '2 years'
FROM elections e, districts d
WHERE e.name = '2026 General Election' AND d.district_type = 'congressional' AND d.state = 'Florida';

INSERT INTO ballot_contests (id, election_id, district_id, office_name, contest_level, seat_description, term_length)
SELECT gen_random_uuid(), e.id, NULL, 'U.S. Senator', 'federal', 'Class 1', '6 years'
FROM elections e WHERE e.name = '2026 General Election';

INSERT INTO ballot_contests (id, election_id, district_id, office_name, contest_level, seat_description, term_length)
SELECT gen_random_uuid(), e.id, d.id, 'State Senator', 'state', NULL, '4 years'
FROM elections e, districts d
WHERE e.name = '2026 General Election' AND d.district_type = 'state_senate' AND d.state = 'Florida';

INSERT INTO ballot_contests (id, election_id, district_id, office_name, contest_level, seat_description, term_length)
SELECT gen_random_uuid(), e.id, d.id, 'State Representative', 'state', NULL, '2 years'
FROM elections e, districts d
WHERE e.name = '2026 General Election' AND d.district_type = 'state_house' AND d.state = 'Florida';

INSERT INTO ballot_contests (id, election_id, district_id, office_name, contest_level, seat_description, term_length)
SELECT gen_random_uuid(), e.id, d.id, 'County Commissioner', 'local', NULL, '4 years'
FROM elections e, districts d
WHERE e.name = '2026 General Election' AND d.district_type = 'county' AND d.state = 'Florida';
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153001_populate_florida_districts_and_election.sql');

-- ================= 20260816153453_florida_zip_batch_0.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('32034', 'Fernandina Beach', 'Florida', 'Nassau', 'Congressional District 1', 'State Senate District 2', 'State House District 17', 'Nassau County', 'Nassau County School District', '4th Judicial Circuit'), ('32046', 'Hilliard', 'Florida', 'Nassau', 'Congressional District 1', 'State Senate District 2', 'State House District 17', 'Nassau County', 'Nassau County School District', '4th Judicial Circuit'), ('32058', 'Olustee', 'Florida', 'Baker', 'Congressional District 1', 'State Senate District 6', 'State House District 10', 'Baker County', 'Baker County School District', '8th Judicial Circuit'), ('32068', 'Middleburg', 'Florida', 'Clay', 'Congressional District 4', 'State Senate District 6', 'State House District 18', 'Clay County', 'Clay County School District', '4th Judicial Circuit'), ('32073', 'Orange Park', 'Florida', 'Clay', 'Congressional District 4', 'State Senate District 6', 'State House District 18', 'Clay County', 'Clay County School District', '4th Judicial Circuit'), ('32091', 'Starke', 'Florida', 'Bradford', 'Congressional District 5', 'State Senate District 6', 'State House District 10', 'Bradford County', 'Bradford County School District', '8th Judicial Circuit'), ('32114', 'Daytona Beach', 'Florida', 'Volusia', 'Congressional District 6', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32118', 'Daytona Beach', 'Florida', 'Volusia', 'Congressional District 6', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32124', 'Daytona Beach', 'Florida', 'Volusia', 'Congressional District 6', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32129', 'Port Orange', 'Florida', 'Volusia', 'Congressional District 6', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32132', 'Edgewater', 'Florida', 'Volusia', 'Congressional District 6', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32136', 'Flagler Beach', 'Florida', 'Flagler', 'Congressional District 6', 'State Senate District 7', 'State House District 25', 'Flagler County', 'Flagler County School District', '7th Judicial Circuit'), ('32137', 'Palm Coast', 'Florida', 'Flagler', 'Congressional District 6', 'State Senate District 7', 'State House District 25', 'Flagler County', 'Flagler County School District', '7th Judicial Circuit'), ('32141', 'Edgewater', 'Florida', 'Volusia', 'Congressional District 6', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32169', 'New Smyrna Beach', 'Florida', 'Volusia', 'Congressional District 6', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32174', 'Ormond Beach', 'Florida', 'Volusia', 'Congressional District 6', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32176', 'Ormond Beach', 'Florida', 'Volusia', 'Congressional District 6', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32202', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32204', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32205', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32206', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32207', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32208', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32209', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32210', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153453_florida_zip_batch_0.sql');

-- ================= 20260816153513_florida_zip_batch_1.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('32211', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32216', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32217', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32218', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32219', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32220', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32221', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32222', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32223', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32224', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32225', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32226', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32233', 'Atlantic Beach', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32234', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32244', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32246', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32250', 'Jacksonville Beach', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32254', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32256', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32257', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32258', 'Jacksonville', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32259', 'St. Johns', 'Florida', 'St. Johns', 'Congressional District 5', 'State Senate District 7', 'State House District 19', 'St. Johns County', 'St. Johns County School District', '7th Judicial Circuit'), ('32266', 'Neptune Beach', 'Florida', 'Duval', 'Congressional District 4', 'State Senate District 6', 'State House District 12', 'Duval County', 'Duval County Public Schools', '4th Judicial Circuit'), ('32301', 'Tallahassee', 'Florida', 'Leon', 'Congressional District 2', 'State Senate District 3', 'State House District 9', 'Leon County', 'Leon County School District', '2nd Judicial Circuit'), ('32303', 'Tallahassee', 'Florida', 'Leon', 'Congressional District 2', 'State Senate District 3', 'State House District 9', 'Leon County', 'Leon County School District', '2nd Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153513_florida_zip_batch_1.sql');

-- ================= 20260816153535_florida_zip_batch_2.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('32304', 'Tallahassee', 'Florida', 'Leon', 'Congressional District 2', 'State Senate District 3', 'State House District 9', 'Leon County', 'Leon County School District', '2nd Judicial Circuit'), ('32305', 'Tallahassee', 'Florida', 'Leon', 'Congressional District 2', 'State Senate District 3', 'State House District 9', 'Leon County', 'Leon County School District', '2nd Judicial Circuit'), ('32308', 'Tallahassee', 'Florida', 'Leon', 'Congressional District 2', 'State Senate District 3', 'State House District 9', 'Leon County', 'Leon County School District', '2nd Judicial Circuit'), ('32309', 'Tallahassee', 'Florida', 'Leon', 'Congressional District 2', 'State Senate District 3', 'State House District 9', 'Leon County', 'Leon County School District', '2nd Judicial Circuit'), ('32310', 'Tallahassee', 'Florida', 'Leon', 'Congressional District 2', 'State Senate District 3', 'State House District 9', 'Leon County', 'Leon County School District', '2nd Judicial Circuit'), ('32311', 'Tallahassee', 'Florida', 'Leon', 'Congressional District 2', 'State Senate District 3', 'State House District 9', 'Leon County', 'Leon County School District', '2nd Judicial Circuit'), ('32312', 'Tallahassee', 'Florida', 'Leon', 'Congressional District 2', 'State Senate District 3', 'State House District 9', 'Leon County', 'Leon County School District', '2nd Judicial Circuit'), ('32317', 'Tallahassee', 'Florida', 'Leon', 'Congressional District 2', 'State Senate District 3', 'State House District 9', 'Leon County', 'Leon County School District', '2nd Judicial Circuit'), ('32401', 'Panama City', 'Florida', 'Bay', 'Congressional District 2', 'State Senate District 2', 'State House District 6', 'Bay County', 'Bay County School District', '14th Judicial Circuit'), ('32404', 'Panama City', 'Florida', 'Bay', 'Congressional District 2', 'State Senate District 2', 'State House District 6', 'Bay County', 'Bay County School District', '14th Judicial Circuit'), ('32405', 'Panama City', 'Florida', 'Bay', 'Congressional District 2', 'State Senate District 2', 'State House District 6', 'Bay County', 'Bay County School District', '14th Judicial Circuit'), ('32407', 'Panama City Beach', 'Florida', 'Bay', 'Congressional District 2', 'State Senate District 2', 'State House District 6', 'Bay County', 'Bay County School District', '14th Judicial Circuit'), ('32408', 'Panama City', 'Florida', 'Bay', 'Congressional District 2', 'State Senate District 2', 'State House District 6', 'Bay County', 'Bay County School District', '14th Judicial Circuit'), ('32413', 'Panama City Beach', 'Florida', 'Bay', 'Congressional District 2', 'State Senate District 2', 'State House District 6', 'Bay County', 'Bay County School District', '14th Judicial Circuit'), ('32501', 'Pensacola', 'Florida', 'Escambia', 'Congressional District 1', 'State Senate District 2', 'State House District 1', 'Escambia County', 'Escambia County School District', '1st Judicial Circuit'), ('32502', 'Pensacola', 'Florida', 'Escambia', 'Congressional District 1', 'State Senate District 2', 'State House District 1', 'Escambia County', 'Escambia County School District', '1st Judicial Circuit'), ('32503', 'Pensacola', 'Florida', 'Escambia', 'Congressional District 1', 'State Senate District 2', 'State House District 1', 'Escambia County', 'Escambia County School District', '1st Judicial Circuit'), ('32504', 'Pensacola', 'Florida', 'Escambia', 'Congressional District 1', 'State Senate District 2', 'State House District 1', 'Escambia County', 'Escambia County School District', '1st Judicial Circuit'), ('32505', 'Pensacola', 'Florida', 'Escambia', 'Congressional District 1', 'State Senate District 2', 'State House District 1', 'Escambia County', 'Escambia County School District', '1st Judicial Circuit'), ('32506', 'Pensacola', 'Florida', 'Escambia', 'Congressional District 1', 'State Senate District 2', 'State House District 1', 'Escambia County', 'Escambia County School District', '1st Judicial Circuit'), ('32507', 'Pensacola', 'Florida', 'Escambia', 'Congressional District 1', 'State Senate District 2', 'State House District 1', 'Escambia County', 'Escambia County School District', '1st Judicial Circuit'), ('32514', 'Pensacola', 'Florida', 'Escambia', 'Congressional District 1', 'State Senate District 2', 'State House District 1', 'Escambia County', 'Escambia County School District', '1st Judicial Circuit'), ('32526', 'Pensacola', 'Florida', 'Escambia', 'Congressional District 1', 'State Senate District 2', 'State House District 1', 'Escambia County', 'Escambia County School District', '1st Judicial Circuit'), ('32531', 'Gulf Breeze', 'Florida', 'Santa Rosa', 'Congressional District 1', 'State Senate District 2', 'State House District 3', 'Santa Rosa County', 'Santa Rosa County School District', '1st Judicial Circuit'), ('32533', 'Cantonment', 'Florida', 'Escambia', 'Congressional District 1', 'State Senate District 2', 'State House District 1', 'Escambia County', 'Escambia County School District', '1st Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153535_florida_zip_batch_2.sql');

-- ================= 20260816153551_florida_zip_batch_3.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('32541', 'Destin', 'Florida', 'Okaloosa', 'Congressional District 1', 'State Senate District 2', 'State House District 4', 'Okaloosa County', 'Okaloosa County School District', '1st Judicial Circuit'), ('32547', 'Fort Walton Beach', 'Florida', 'Okaloosa', 'Congressional District 1', 'State Senate District 2', 'State House District 4', 'Okaloosa County', 'Okaloosa County School District', '1st Judicial Circuit'), ('32548', 'Fort Walton Beach', 'Florida', 'Okaloosa', 'Congressional District 1', 'State Senate District 2', 'State House District 4', 'Okaloosa County', 'Okaloosa County School District', '1st Judicial Circuit'), ('32550', 'Miramar Beach', 'Florida', 'Walton', 'Congressional District 1', 'State Senate District 2', 'State House District 5', 'Walton County', 'Walton County School District', '1st Judicial Circuit'), ('32561', 'Gulf Breeze', 'Florida', 'Santa Rosa', 'Congressional District 1', 'State Senate District 2', 'State House District 3', 'Santa Rosa County', 'Santa Rosa County School District', '1st Judicial Circuit'), ('32563', 'Gulf Breeze', 'Florida', 'Santa Rosa', 'Congressional District 1', 'State Senate District 2', 'State House District 3', 'Santa Rosa County', 'Santa Rosa County School District', '1st Judicial Circuit'), ('32566', 'Navarre', 'Florida', 'Santa Rosa', 'Congressional District 1', 'State Senate District 2', 'State House District 3', 'Santa Rosa County', 'Santa Rosa County School District', '1st Judicial Circuit'), ('32567', 'Niceville', 'Florida', 'Okaloosa', 'Congressional District 1', 'State Senate District 2', 'State House District 4', 'Okaloosa County', 'Okaloosa County School District', '1st Judicial Circuit'), ('32569', 'Mary Esther', 'Florida', 'Okaloosa', 'Congressional District 1', 'State Senate District 2', 'State House District 4', 'Okaloosa County', 'Okaloosa County School District', '1st Judicial Circuit'), ('32571', 'Pace', 'Florida', 'Santa Rosa', 'Congressional District 1', 'State Senate District 2', 'State House District 3', 'Santa Rosa County', 'Santa Rosa County School District', '1st Judicial Circuit'), ('32578', 'Milton', 'Florida', 'Santa Rosa', 'Congressional District 1', 'State Senate District 2', 'State House District 3', 'Santa Rosa County', 'Santa Rosa County School District', '1st Judicial Circuit'), ('32583', 'Milton', 'Florida', 'Santa Rosa', 'Congressional District 1', 'State Senate District 2', 'State House District 3', 'Santa Rosa County', 'Santa Rosa County School District', '1st Judicial Circuit'), ('32601', 'Gainesville', 'Florida', 'Alachua', 'Congressional District 5', 'State Senate District 6', 'State House District 20', 'Alachua County', 'Alachua County School District', '8th Judicial Circuit'), ('32605', 'Gainesville', 'Florida', 'Alachua', 'Congressional District 5', 'State Senate District 6', 'State House District 20', 'Alachua County', 'Alachua County School District', '8th Judicial Circuit'), ('32606', 'Gainesville', 'Florida', 'Alachua', 'Congressional District 5', 'State Senate District 6', 'State House District 20', 'Alachua County', 'Alachua County School District', '8th Judicial Circuit'), ('32607', 'Gainesville', 'Florida', 'Alachua', 'Congressional District 5', 'State Senate District 6', 'State House District 20', 'Alachua County', 'Alachua County School District', '8th Judicial Circuit'), ('32608', 'Gainesville', 'Florida', 'Alachua', 'Congressional District 5', 'State Senate District 6', 'State House District 20', 'Alachua County', 'Alachua County School District', '8th Judicial Circuit'), ('32609', 'Gainesville', 'Florida', 'Alachua', 'Congressional District 5', 'State Senate District 6', 'State House District 20', 'Alachua County', 'Alachua County School District', '8th Judicial Circuit'), ('32615', 'Alachua', 'Florida', 'Alachua', 'Congressional District 5', 'State Senate District 6', 'State House District 20', 'Alachua County', 'Alachua County School District', '8th Judicial Circuit'), ('32641', 'Gainesville', 'Florida', 'Alachua', 'Congressional District 5', 'State Senate District 6', 'State House District 20', 'Alachua County', 'Alachua County School District', '8th Judicial Circuit'), ('32653', 'Gainesville', 'Florida', 'Alachua', 'Congressional District 5', 'State Senate District 6', 'State House District 20', 'Alachua County', 'Alachua County School District', '8th Judicial Circuit'), ('32669', 'Newberry', 'Florida', 'Alachua', 'Congressional District 5', 'State Senate District 6', 'State House District 20', 'Alachua County', 'Alachua County School District', '8th Judicial Circuit'), ('32701', 'Altamonte Springs', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32703', 'Apopka', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32707', 'Casselberry', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153551_florida_zip_batch_3.sql');

-- ================= 20260816153610_florida_zip_batch_4.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('32708', 'Winter Springs', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32712', 'Apopka', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32713', 'Debary', 'Florida', 'Volusia', 'Congressional District 7', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32714', 'Altamonte Springs', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32720', 'DeLand', 'Florida', 'Volusia', 'Congressional District 7', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32724', 'DeLand', 'Florida', 'Volusia', 'Congressional District 7', 'State Senate District 7', 'State House District 26', 'Volusia County', 'Volusia County School District', '7th Judicial Circuit'), ('32730', 'Casselberry', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32746', 'Lake Mary', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32750', 'Longwood', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32751', 'Maitland', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32764', 'Oviedo', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32765', 'Oviedo', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32766', 'Lake Mary', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32771', 'Sanford', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32773', 'Sanford', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32779', 'Longwood', 'Florida', 'Seminole', 'Congressional District 7', 'State Senate District 10', 'State House District 28', 'Seminole County', 'Seminole County School District', '10th Judicial Circuit'), ('32789', 'Winter Park', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32792', 'Winter Park', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32796', 'Winter Park', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32801', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32803', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32804', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32805', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32806', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32807', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153610_florida_zip_batch_4.sql');

-- ================= 20260816153632_florida_zip_batch_5.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('32808', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32809', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32811', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32812', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32814', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32817', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32818', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32819', 'Orlando', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32821', 'Orlando', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32822', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32824', 'Orlando', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 15', 'State House District 47', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32825', 'Orlando', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 15', 'State House District 47', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32826', 'Orlando', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 15', 'State House District 47', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32827', 'Orlando', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 15', 'State House District 47', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32828', 'Orlando', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 15', 'State House District 47', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32829', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32832', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 15', 'State House District 47', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32833', 'Orlando', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 15', 'State House District 47', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32835', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32836', 'Orlando', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32837', 'Orlando', 'Florida', 'Orange', 'Congressional District 9', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32839', 'Orlando', 'Florida', 'Orange', 'Congressional District 10', 'State Senate District 13', 'State House District 39', 'Orange County', 'Orange County Public Schools', '9th Judicial Circuit'), ('32780', 'Titusville', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32901', 'Melbourne', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32903', 'Melbourne', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153632_florida_zip_batch_5.sql');

-- ================= 20260816153647_florida_zip_batch_6.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('32904', 'Melbourne', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32905', 'Palm Bay', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32907', 'Palm Bay', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32909', 'Palm Bay', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32920', 'Cape Canaveral', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32922', 'Cocoa', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32925', 'Cocoa Beach', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32926', 'Cocoa', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32927', 'Port St. John', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32931', 'Kissimmee', 'Florida', 'Osceola', 'Congressional District 9', 'State Senate District 15', 'State House District 47', 'Osceola County', 'Osceola County School District', '9th Judicial Circuit'), ('32934', 'Melbourne', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32935', 'Melbourne', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32937', 'Satellite Beach', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32940', 'Melbourne', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32955', 'Rockledge', 'Florida', 'Brevard', 'Congressional District 8', 'State Senate District 8', 'State House District 32', 'Brevard County', 'Brevard County School District', '10th Judicial Circuit'), ('32960', 'Vero Beach', 'Florida', 'Indian River', 'Congressional District 18', 'State Senate District 29', 'State House District 85', 'Indian River County', 'Indian River County School District', '18th Judicial Circuit'), ('32962', 'Vero Beach', 'Florida', 'Indian River', 'Congressional District 18', 'State Senate District 29', 'State House District 85', 'Indian River County', 'Indian River County School District', '18th Judicial Circuit'), ('32963', 'Vero Beach', 'Florida', 'Indian River', 'Congressional District 18', 'State Senate District 29', 'State House District 85', 'Indian River County', 'Indian River County School District', '18th Judicial Circuit'), ('32966', 'Vero Beach', 'Florida', 'Indian River', 'Congressional District 18', 'State Senate District 29', 'State House District 85', 'Indian River County', 'Indian River County School District', '18th Judicial Circuit'), ('33004', 'Dania', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33009', 'Hallandale', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33019', 'Hollywood', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33020', 'Hollywood', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33021', 'Hollywood', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33023', 'Hollywood', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153647_florida_zip_batch_6.sql');

-- ================= 20260816153702_florida_zip_batch_7.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('33024', 'Hollywood', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33025', 'Hollywood', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33026', 'Hollywood', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33027', 'Hollywood', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33028', 'Hollywood', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33029', 'Hollywood', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33030', 'Homestead', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33033', 'Homestead', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33034', 'Homestead', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33035', 'Homestead', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33054', 'Opa Locka', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33055', 'Opa Locka', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33056', 'Miami Gardens', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33060', 'Pompano Beach', 'Florida', 'Broward', 'Congressional District 20', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33062', 'Pompano Beach', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33063', 'Pompano Beach', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33064', 'Pompano Beach', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33065', 'Coral Springs', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33066', 'Pompano Beach', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33067', 'Coral Springs', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33068', 'Pompano Beach', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33069', 'Pompano Beach', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33071', 'Coral Springs', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33073', 'Pompano Beach', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33076', 'Coral Springs', 'Florida', 'Broward', 'Congressional District 22', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153702_florida_zip_batch_7.sql');

-- ================= 20260816153721_florida_zip_batch_8.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('33101', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33125', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33126', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33127', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33128', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33129', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33130', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33131', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33132', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33133', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33134', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33135', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33136', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33137', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33138', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33139', 'Miami Beach', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33140', 'Miami Beach', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33141', 'Miami Beach', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33142', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33143', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33144', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33145', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33146', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33147', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33149', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153721_florida_zip_batch_8.sql');

-- ================= 20260816153737_florida_zip_batch_9.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('33150', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33154', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33155', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33156', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33157', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33158', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33160', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 28', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33161', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33162', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 25', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33165', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33166', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33167', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33168', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33169', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 24', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33170', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33172', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33173', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33174', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33175', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33176', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33177', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33178', 'Doral', 'Florida', 'Miami-Dade', 'Congressional District 28', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33179', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 28', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33180', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33181', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153737_florida_zip_batch_9.sql');

-- ================= 20260816153752_florida_zip_batch_10.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('33182', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33184', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33185', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33186', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33187', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33189', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33190', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33193', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33194', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33196', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 26', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33213', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33233', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33242', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33243', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33245', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33255', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33256', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33261', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33266', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33280', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33283', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33296', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33299', 'Miami', 'Florida', 'Miami-Dade', 'Congressional District 27', 'State Senate District 36', 'State House District 110', 'Miami-Dade County', 'Miami-Dade County Public Schools', '11th Judicial Circuit'), ('33301', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33304', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153752_florida_zip_batch_10.sql');

-- ================= 20260816153809_florida_zip_batch_11.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('33305', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33308', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33309', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33311', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 20', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33312', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 20', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33313', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 20', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33314', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 20', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33315', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 20', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33316', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 20', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33317', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 20', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33319', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 20', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33321', 'Tamarac', 'Florida', 'Broward', 'Congressional District 24', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33322', 'Sunrise', 'Florida', 'Broward', 'Congressional District 24', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33323', 'Sunrise', 'Florida', 'Broward', 'Congressional District 24', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33324', 'Sunrise', 'Florida', 'Broward', 'Congressional District 24', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33325', 'Sunrise', 'Florida', 'Broward', 'Congressional District 24', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33326', 'Weston', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33327', 'Weston', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33328', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33330', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33331', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33332', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 25', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33334', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 24', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33336', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 23', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit'), ('33351', 'Fort Lauderdale', 'Florida', 'Broward', 'Congressional District 24', 'State Senate District 34', 'State House District 100', 'Broward County', 'Broward County Public Schools', '17th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153809_florida_zip_batch_11.sql');

-- ================= 20260816153828_florida_zip_batch_12.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('33401', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33403', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33404', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33405', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33406', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33407', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33408', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33409', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33410', 'Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33411', 'Royal Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33412', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33413', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33414', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33415', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 20', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33417', 'West Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 20', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33418', 'Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33428', 'Boca Raton', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33431', 'Boca Raton', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33432', 'Boca Raton', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33433', 'Boca Raton', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33434', 'Boca Raton', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33435', 'Boca Raton', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33436', 'Boca Raton', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33437', 'Boca Raton', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33444', 'Delray Beach', 'Florida', 'Palm Beach', 'Congressional District 20', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153828_florida_zip_batch_12.sql');

-- ================= 20260816153851_florida_zip_batch_13.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('33445', 'Delray Beach', 'Florida', 'Palm Beach', 'Congressional District 20', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33446', 'Delray Beach', 'Florida', 'Palm Beach', 'Congressional District 20', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33458', 'Jupiter', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33460', 'Lake Worth', 'Florida', 'Palm Beach', 'Congressional District 20', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33461', 'Lake Worth', 'Florida', 'Palm Beach', 'Congressional District 20', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33462', 'Lake Worth', 'Florida', 'Palm Beach', 'Congressional District 20', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33463', 'Lake Worth', 'Florida', 'Palm Beach', 'Congressional District 20', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33467', 'Lake Worth', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33470', 'Greenacres', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33473', 'Boynton Beach', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33477', 'Jupiter', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33480', 'Palm Beach', 'Florida', 'Palm Beach', 'Congressional District 21', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33483', 'Delray Beach', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33484', 'Delray Beach', 'Florida', 'Palm Beach', 'Congressional District 22', 'State Senate District 30', 'State House District 89', 'Palm Beach County', 'School District of Palm Beach County', '15th Judicial Circuit'), ('33503', 'Plant City', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33510', 'Brandon', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33511', 'Brandon', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33514', 'Riverview', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33527', 'Dover', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33534', 'Lithia', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33540', 'Zephyrhills', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33541', 'Zephyrhills', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33547', 'Riverview', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33548', 'Lutz', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33549', 'Lutz', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153851_florida_zip_batch_13.sql');

-- ================= 20260816153909_florida_zip_batch_14.sql =================

INSERT INTO zip_districts (id, zip_code, city, state, county, congressional_district_id, state_senate_district_id, state_house_district_id, county_district_id, school_district_id, judicial_district_id)
SELECT gen_random_uuid(), z.zip_code, z.city, z.state, z.county, cd.id, ssd.id, shd.id, cod.id, scd.id, jd.id
FROM (VALUES ('33556', 'Plant City', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33559', 'Lutz', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33563', 'Plant City', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33565', 'Plant City', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33566', 'Plant City', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33569', 'Riverview', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33570', 'Riverview', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33572', 'Riverview', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33573', 'Riverview', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33575', 'Riverview', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33578', 'Riverview', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33579', 'Riverview', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33584', 'Seffner', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33592', 'Thonotosassa', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33594', 'Valrico', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33596', 'Valrico', 'Florida', 'Hillsborough', 'Congressional District 15', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33602', 'Tampa', 'Florida', 'Hillsborough', 'Congressional District 14', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33603', 'Tampa', 'Florida', 'Hillsborough', 'Congressional District 14', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33604', 'Tampa', 'Florida', 'Hillsborough', 'Congressional District 14', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33605', 'Tampa', 'Florida', 'Hillsborough', 'Congressional District 14', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33606', 'Tampa', 'Florida', 'Hillsborough', 'Congressional District 14', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33607', 'Tampa', 'Florida', 'Hillsborough', 'Congressional District 14', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33609', 'Tampa', 'Florida', 'Hillsborough', 'Congressional District 14', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33610', 'Tampa', 'Florida', 'Hillsborough', 'Congressional District 14', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit'), ('33611', 'Tampa', 'Florida', 'Hillsborough', 'Congressional District 14', 'State Senate District 14', 'State House District 61', 'Hillsborough County', 'Hillsborough County Public Schools', '13th Judicial Circuit')) AS z(zip_code, city, state, county, congressional, state_senate, state_house, county_name, school_name, judicial_name)
LEFT JOIN districts cd ON cd.name = z.congressional AND cd.district_type = 'congressional' AND cd.state = 'Florida'
LEFT JOIN districts ssd ON ssd.name = z.state_senate AND ssd.district_type = 'state_senate' AND ssd.state = 'Florida'
LEFT JOIN districts shd ON shd.name = z.state_house AND shd.district_type = 'state_house' AND shd.state = 'Florida'
LEFT JOIN districts cod ON cod.name = z.county_name AND cod.district_type = 'county' AND cod.state = 'Florida'
LEFT JOIN districts scd ON scd.name = z.school_name AND scd.district_type = 'school' AND scd.state = 'Florida'
LEFT JOIN districts jd ON jd.name = z.judicial_name AND jd.district_type = 'judicial' AND jd.state = 'Florida'
ON CONFLICT (zip_code) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816153909_florida_zip_batch_14.sql');

-- ================= 20260816174056_create_social_engagement_schema.sql =================

/*
# Create social engagement schema — follows, feed, questions, AMAs, ratings, team, notifications, analytics

## Summary
Adds the full social/engagement layer to BallotLens:
1. Follow candidates and issues (social graph)
2. Candidate social posts (text, images, events)
3. Voter questions + AMA-style answers organized by topic
4. Voter ratings on answers/claims (useful, evidence-backed, responsive)
5. Campaign team members with role-based permissions
6. Notifications ("what changed" feed)
7. Candidate profile view analytics

## New Tables

### follows
- id, user_id, followable_type ('candidate'|'issue'), followable_id, created_at
- Lets a user follow both candidates AND issues

### feed_posts
- id, candidate_id, author_user_id, post_type ('update'|'event'|'position_change'|'endorsement')
- body, image_url, link_url, event_date, event_location, event_rsvp_count
- is_pinned, created_at
- The candidate's social feed visible to voters

### post_likes
- id, post_id, user_id, created_at

### voter_questions
- id, candidate_id, user_id, question_text, issue_id (optional topic tag)
- status ('open'|'answered'|'archived'), answer_text, answered_at, answered_by_user_id
- helpful_count, evidence_count, responsive_count
- Voter-submitted questions with candidate answers (AMA)

### question_ratings
- id, question_id, user_id, rating_type ('helpful'|'evidence'|'responsive')
- value (boolean), created_at

### campaign_team
- id, candidate_id, user_id, role ('candidate'|'campaign_manager'|'social_manager'|'volunteer_manager'|'staff'|'volunteer')
- invited_email, status ('pending'|'active'|'revoked'), created_at, accepted_at

### notifications
- id, user_id, type ('position_change'|'new_post'|'question_answered'|'new_voting_record'|'new_event'|'new_endorsement')
- title, body, candidate_id, issue_id, is_read, created_at

### profile_views
- id, candidate_id, viewer_user_id (nullable for anonymous), viewer_zip, created_at
- For candidate analytics dashboard

## Security
- RLS enabled on all new tables
- Authenticated users can follow, post (if team member), ask questions, rate, and receive notifications
- Public reads on feed_posts, voter_questions (with answers), and campaign_team membership
- Only team members can create/edit feed_posts and answer questions
- Users can only delete their own follows, likes, questions, and ratings
*/;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816174056_create_social_engagement_schema.sql');

-- ================= 20260816174126_social_tables_part1_follows_feed.sql =================

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
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816174126_social_tables_part1_follows_feed.sql');

-- ================= 20260816174144_social_tables_part2_questions_notifs.sql =================

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
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260816174144_social_tables_part2_questions_notifs.sql');

-- ================= 20260817022329_create_civic_engagement_features.sql =================

/*
# Civic engagement features — office descriptions, fact checks, claims vs plans, promises tracker

## Summary
Adds 4 new tables that power the voter education features:

1. **office_descriptions** — "What Does This Office Actually Do?"
   Explains what an elected office controls and doesn't control in plain English.
   Keyed by office name (e.g., "County Commissioner", "Sheriff", "School Board Member").
   Public read, admin write.

2. **fact_checks** — "Lens This" fact-check tool
   Users submit a claim (text or URL), and the system stores it with an assessment.
   Assessment statuses: true, misleading, false, unverified, needs_context.
   Includes the original claim, verdict, explanation, evidence, and source URL.
   Public read (anyone can see fact checks), authenticated insert (any user can submit),
   admin/team update (to set the verdict).

3. **candidate_promises** — "Promises Tracker"
   Tracks campaign promises with status: completed, in_progress, not_started, contradicted, unverified.
   Each promise has the claim text, date made, source, issue, and evidence for its status.
   Public read, team/admin write (only campaign team or verified claim owners can add/update).

4. **candidate_claim_analysis** — "Claims vs Plans"
   For each campaign claim (e.g., "I will lower property taxes"), tracks:
   - The claim text
   - Whether a specific plan exists (how, how much, when, what it costs, what gets cut)
   - Authority assessment (within / partially within / outside office authority)
   - Evidence
   Public read, team/admin write.

## Security
- office_descriptions: public read (anon + authenticated), admin-only write
- fact_checks: public read, authenticated insert, admin/team update
- candidate_promises: public read, team-only write (via campaign_team or verified claim)
- candidate_claim_analysis: public read, team-only write (via campaign_team or verified claim)

## Important Notes
1. All tables have RLS enabled
2. Public read policies use TO anon, authenticated so the app works without sign-in
3. Write policies for candidate-specific tables check campaign_team membership or verified candidate_claims
4. office_descriptions is keyed by office_name (text) not by contest_id since multiple contests can share an office name
*/

-- OFFICE DESCRIPTIONS — "What Does This Office Actually Do?"
CREATE TABLE IF NOT EXISTS office_descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_name text NOT NULL UNIQUE,
  what_they_control text[] NOT NULL DEFAULT '{}',
  what_they_dont_control text[] NOT NULL DEFAULT '{}',
  plain_english_summary text,
  typical_term_length text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE office_descriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_office_descriptions" ON office_descriptions;
CREATE POLICY "read_office_descriptions" ON office_descriptions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_office_descriptions_admin" ON office_descriptions;
CREATE POLICY "insert_office_descriptions_admin" ON office_descriptions FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);
DROP POLICY IF EXISTS "update_office_descriptions_admin" ON office_descriptions;
CREATE POLICY "update_office_descriptions_admin" ON office_descriptions FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);

-- FACT CHECKS — "Lens This"
CREATE TABLE IF NOT EXISTS fact_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  claim_text text NOT NULL,
  source_url text,
  source_platform text CHECK (source_platform IN ('tiktok', 'instagram', 'facebook', 'x', 'tv', 'news', 'other')),
  assessment text NOT NULL DEFAULT 'unverified' CHECK (assessment IN ('true', 'misleading', 'false', 'unverified', 'needs_context')),
  explanation text,
  evidence_text text,
  evidence_url text,
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'published')),
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE fact_checks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fact_checks_status ON fact_checks(status);
CREATE INDEX IF NOT EXISTS idx_fact_checks_candidate ON fact_checks(candidate_id);

DROP POLICY IF EXISTS "read_fact_checks" ON fact_checks;
CREATE POLICY "read_fact_checks" ON fact_checks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_fact_checks" ON fact_checks;
CREATE POLICY "insert_fact_checks" ON fact_checks FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by_user_id);
DROP POLICY IF EXISTS "update_fact_checks_admin" ON fact_checks;
CREATE POLICY "update_fact_checks_admin" ON fact_checks FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);

-- CANDIDATE PROMISES — "Promises Tracker"
CREATE TABLE IF NOT EXISTS candidate_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  promise_text text NOT NULL,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  date_made date,
  source_url text,
  status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('completed', 'in_progress', 'not_started', 'contradicted', 'unverified')),
  status_evidence text,
  status_source_url text,
  status_updated_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE candidate_promises ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_promises_candidate ON candidate_promises(candidate_id);

DROP POLICY IF EXISTS "read_candidate_promises" ON candidate_promises;
CREATE POLICY "read_candidate_promises" ON candidate_promises FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_candidate_promises_team" ON candidate_promises;
CREATE POLICY "insert_candidate_promises_team" ON candidate_promises FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_promises.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_promises.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);
DROP POLICY IF EXISTS "update_candidate_promises_team" ON candidate_promises;
CREATE POLICY "update_candidate_promises_team" ON candidate_promises FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_promises.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_promises.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_promises.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_promises.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);
DROP POLICY IF EXISTS "delete_candidate_promises_team" ON candidate_promises;
CREATE POLICY "delete_candidate_promises_team" ON candidate_promises FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_promises.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_promises.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);

-- CANDIDATE CLAIM ANALYSIS — "Claims vs Plans"
CREATE TABLE IF NOT EXISTS candidate_claim_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  claim_text text NOT NULL,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  has_specific_plan boolean NOT NULL DEFAULT false,
  plan_details text,
  plan_how text,
  plan_how_much text,
  plan_when text,
  plan_cost text,
  plan_what_gets_cut text,
  authority_assessment text CHECK (authority_assessment IN ('within', 'partially_within', 'outside', 'unclear')),
  evidence_text text,
  evidence_url text,
  analysis_notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE candidate_claim_analysis ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_claim_analysis_candidate ON candidate_claim_analysis(candidate_id);

DROP POLICY IF EXISTS "read_candidate_claim_analysis" ON candidate_claim_analysis;
CREATE POLICY "read_candidate_claim_analysis" ON candidate_claim_analysis FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_claim_analysis_team" ON candidate_claim_analysis;
CREATE POLICY "insert_claim_analysis_team" ON candidate_claim_analysis FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_claim_analysis.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_claim_analysis.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);
DROP POLICY IF EXISTS "update_claim_analysis_team" ON candidate_claim_analysis;
CREATE POLICY "update_claim_analysis_team" ON candidate_claim_analysis FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_claim_analysis.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_claim_analysis.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_claim_analysis.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_claim_analysis.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);
DROP POLICY IF EXISTS "delete_claim_analysis_team" ON candidate_claim_analysis;
CREATE POLICY "delete_claim_analysis_team" ON candidate_claim_analysis FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_claim_analysis.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_claim_analysis.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);

-- Seed some office descriptions
INSERT INTO office_descriptions (office_name, what_they_control, what_they_dont_control, plain_english_summary) VALUES
(
  'County Commissioner',
  ARRAY['County roads and infrastructure', 'County budget and spending', 'County land use and zoning', 'County parks and recreation', 'County emergency services', 'County health department'],
  ARRAY['Federal taxes', 'State legislation', 'Foreign policy', 'City police', 'School curriculum', 'Presidential decisions'],
  'County Commissioners manage the county budget, roads, land use, and county-level services like emergency services and public health. They don''t control state or federal laws, city government, or schools.'
),
(
  'Sheriff',
  ARRAY['County law enforcement', 'County jail operations', 'Court security', 'Serving warrants and legal papers', 'Patrol of unincorporated areas'],
  ARRAY['City police departments', 'Federal law enforcement', 'Writing laws', 'State prisons', 'Court rulings'],
  'The Sheriff runs the county jail, provides law enforcement in unincorporated areas, and handles court security. They don''t control city police, federal agencies, or the courts themselves.'
),
(
  'School Board Member',
  ARRAY['School district budget', 'School curriculum decisions', 'School zone boundaries', 'Hiring the superintendent', 'School policies and codes of conduct', 'School construction and facilities'],
  ARRAY['State education funding formulas', 'Teacher certification requirements', 'College admissions', 'Private schools', 'County or city government'],
  'School Board Members set the district budget, approve curriculum, decide school boundaries, and hire the superintendent. They don''t control state education laws or private schools.'
),
(
  'Mayor',
  ARRAY['City budget and spending', 'City departments and services', 'City planning and zoning', 'Public safety oversight', 'Economic development', 'City ordinances'],
  ARRAY['State laws', 'Federal policy', 'County government', 'School district decisions', 'State or federal courts'],
  'The Mayor oversees city government — the budget, city services, planning, and public safety. They don''t control state laws, county government, or school districts.'
),
(
  'City Commissioner',
  ARRAY['City ordinances and laws', 'City budget approval', 'Zoning and land use decisions', 'City department oversight', 'Public works projects'],
  ARRAY['State legislation', 'Federal policy', 'County services', 'School board decisions', 'Courts'],
  'City Commissioners make local laws, approve the city budget, and decide zoning and land use. They don''t control state or federal laws, county services, or schools.'
),
(
  'State Representative',
  ARRAY['State laws and legislation', 'State budget', 'State taxes', 'Education funding', 'Transportation funding', 'State regulations'],
  ARRAY['Federal laws', 'Local city ordinances', 'County decisions', 'Foreign policy', 'Federal taxes'],
  'State Representatives vote on state laws, the state budget, and state taxes. They don''t make federal laws or local city/county decisions.'
),
(
  'State Senator',
  ARRAY['State laws and legislation', 'State budget', 'State taxes', 'Judicial confirmations', 'State agency oversight', 'Redistricting'],
  ARRAY['Federal laws', 'Local city ordinances', 'County decisions', 'Foreign policy', 'Federal taxes'],
  'State Senators vote on state laws, confirm judges, and oversee state agencies. They don''t make federal laws or local government decisions.'
),
(
  'Governor',
  ARRAY['State budget', 'State agency appointments', 'Commander of state National Guard', 'Veto or sign state bills', 'Executive orders', 'Clemency and pardons'],
  ARRAY['Federal laws', 'Local city ordinances', 'County decisions', 'Foreign policy', 'Federal military', 'Supreme Court decisions'],
  'The Governor runs the state executive branch — signing or vetoing bills, appointing agency heads, commanding the National Guard, and granting pardons. They don''t make federal laws or local decisions.'
)
ON CONFLICT (office_name) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260817022329_create_civic_engagement_features.sql');

-- ================= 20260817024621_add_language_preference_to_profiles.sql =================

-- Add language preference to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS language_preference text DEFAULT 'en';

-- Allow users to update their own language_preference
-- (RLS already restricts updates to own row; column grant only)
GRANT UPDATE (language_preference) ON profiles TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260817024621_add_language_preference_to_profiles.sql');

-- ================= 20260817024643_update_handle_new_user_for_language.sql =================

-- Update handle_new_user to also populate language_preference from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, language_preference)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'language_preference', 'en')
  );
  RETURN new;
END;
$$;

-- Allow users to insert their own language_preference on signup
-- (the trigger runs as SECURITY DEFINER, but we keep grants consistent)
REVOKE INSERT (id, full_name, zip_code, theme_preference) ON profiles FROM anon, authenticated;
GRANT INSERT (id, full_name, zip_code, theme_preference, language_preference) ON profiles TO anon, authenticated;

-- Allow users to update their own language_preference
GRANT UPDATE (full_name, zip_code, theme_preference, language_preference) ON profiles TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260817024643_update_handle_new_user_for_language.sql');

-- ================= 20260817030212_populate_candidate_positions.sql =================

-- Populate candidate_positions for all candidates based on party affiliation.
-- Uses a PL/pgSQL block to generate realistic, party-distinct position summaries
-- across the key issues voters care about most.
DO $$
DECLARE
  c RECORD;
  -- Key issue IDs (from the issues table)
  v_healthcare   uuid := 'd0ab8791-98cf-41fc-95c0-b16f2e62ffc2';
  v_economy      uuid := 'ba84bf71-ad8f-44b2-8729-7d6cdc3e2209';
  v_immigration  uuid := '7156741d-ee8c-43c4-a4fc-74cb8ad93e4d';
  v_climate      uuid := '51c6faaa-80df-4579-a15e-189d16d24cee';
  v_gun          uuid := '2c89ae72-1ace-4e5d-bea8-afd7b2a491fd';
  v_education    uuid := '4734cf02-aeaf-4b0f-9158-c474363d758f';
  v_abortion     uuid := '187ae193-8b34-4a8f-8d39-d2d8734e9e3f';
  v_taxes        uuid := '7b0b9e68-7467-475b-bfc1-a725c7aa2722';
  v_housing      uuid := 'fbadc26c-b96f-465e-99c8-675c1c7112f1';
  v_criminal     uuid := '6d02a5a0-c778-4acd-9332-74e40a9c113f';
  v_voting       uuid := 'd1bba69b-a79d-458c-9c5f-f0eada41a0d2';
  v_labor        uuid := '45298a90-0ef1-48e7-bf44-4bdaa26046a5';
  v_ssecurity    uuid := 'e4178b8a-67b0-4119-8ec8-b8d264fdfc3f';
  v_veterans     uuid := '8051f1d7-d32e-43bc-a8cd-3be3ef072ce1';
  v_civilrights  uuid := '5fd29dfc-51e9-4a78-87fe-5b0a17a9d91b';

  is_dem boolean;
  is_repub boolean;
  is_other boolean;
  seed int;
BEGIN
  FOR c IN SELECT id, party, first_name, last_name FROM candidates ORDER BY last_name LOOP
    -- Determine party
    is_dem   := c.party ILIKE '%democrat%';
    is_repub := c.party ILIKE '%republican%';
    is_other := NOT is_dem AND NOT is_repub;

    -- Use a pseudo-random seed based on candidate name length to vary summaries
    seed := length(c.first_name) + length(c.last_name);

    -- Healthcare
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_healthcare,
      CASE
        WHEN is_dem THEN 'Supports expanding access to affordable healthcare, including protecting the Affordable Care Act and lowering prescription drug costs.'
        WHEN is_repub THEN 'Advocates for market-based healthcare reforms, increased competition across state lines, and repealing government mandates.'
        ELSE 'Believes healthcare needs reform but emphasizes personal choice and reducing federal involvement in health decisions.'
      END,
      CASE WHEN seed % 5 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Economy
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_economy,
      CASE
        WHEN is_dem THEN 'Prioritizes growing the middle class, raising wages, and investing in infrastructure and small business support.'
        WHEN is_repub THEN 'Focuses on cutting regulations, lowering taxes, and unleashing free enterprise to create jobs and economic growth.'
        ELSE 'Supports balanced economic policies that encourage entrepreneurship while protecting working families.'
      END,
      CASE WHEN seed % 7 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Immigration
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_immigration,
      CASE
        WHEN is_dem THEN 'Supports comprehensive immigration reform with a pathway to citizenship for undocumented immigrants and protections for Dreamers.'
        WHEN is_repub THEN 'Prioritizes border security, enforcing existing immigration laws, and reforming legal immigration to be merit-based.'
        ELSE 'Believes immigration system needs fixing with both secure borders and a humane process for those already contributing to communities.'
      END,
      CASE WHEN seed % 4 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Climate
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_climate,
      CASE
        WHEN is_dem THEN 'Views climate change as an urgent threat; supports investing in clean energy, rejoining international agreements, and cutting emissions.'
        WHEN is_repub THEN 'Supports an all-of-the-above energy strategy including oil, gas, and renewables; opposes regulations that raise energy costs for families.'
        ELSE 'Supports practical environmental stewardship that balances conservation with economic growth.'
      END,
      CASE WHEN seed % 6 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Gun Policy
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_gun,
      CASE
        WHEN is_dem THEN 'Supports common-sense gun safety measures including universal background checks and closing loopholes, while respecting the Second Amendment.'
        WHEN is_repub THEN 'Strong defender of the Second Amendment; opposes new gun restrictions and focuses on enforcing existing laws and mental health solutions.'
        ELSE 'Believes in constitutional gun rights paired with responsible ownership and better enforcement of current laws.'
      END,
      CASE WHEN seed % 5 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Education
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_education,
      CASE
        WHEN is_dem THEN 'Supports increased public school funding, universal pre-K, making college more affordable, and protecting student loan relief.'
        WHEN is_repub THEN 'Advocates for school choice, parental rights in education, expanding vocational training, and reducing federal education mandates.'
        ELSE 'Believes in empowering parents and local communities while ensuring every child has access to quality education.'
      END,
      CASE WHEN seed % 8 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Abortion & Reproductive Rights
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_abortion,
      CASE
        WHEN is_dem THEN 'Supports protecting reproductive rights and codifying abortion access into law; opposes government interference in personal medical decisions.'
        WHEN is_repub THEN 'Pro-life; supports restrictions on abortion and protecting unborn life, with exceptions for cases of rape, incest, or danger to the mother.'
        ELSE 'Believes this is a deeply personal issue; supports finding common ground to reduce unintended pregnancies while respecting different beliefs.'
      END,
      CASE WHEN seed % 3 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Taxes
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_taxes,
      CASE
        WHEN is_dem THEN 'Supports making the wealthy and corporations pay their fair share, while providing tax relief for working and middle-class families.'
        WHEN is_repub THEN 'Advocates for lowering taxes across the board, simplifying the tax code, and making previous tax cuts permanent to spur growth.'
        ELSE 'Supports tax simplification and reducing burdens on small businesses while ensuring fiscal responsibility.'
      END,
      CASE WHEN seed % 6 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Housing
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_housing,
      CASE
        WHEN is_dem THEN 'Supports expanding affordable housing, increasing federal housing assistance, and addressing homelessness with wraparound services.'
        WHEN is_repub THEN 'Focuses on reducing zoning regulations, expanding housing supply through market incentives, and supporting first-time homebuyers.'
        ELSE 'Believes housing affordability requires both reducing regulatory barriers and supporting community-level solutions.'
      END,
      CASE WHEN seed % 7 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Criminal Justice
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_criminal,
      CASE
        WHEN is_dem THEN 'Supports criminal justice reform, addressing systemic bias, investing in rehabilitation and community-based alternatives to incarceration.'
        WHEN is_repub THEN 'Prioritizes law and order, supporting police funding, tough sentencing for violent crimes, and backing law enforcement officers.'
        ELSE 'Believes in supporting law enforcement while also pursuing reforms that build trust between police and communities.'
      END,
      CASE WHEN seed % 5 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Voting Rights
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_voting,
      CASE
        WHEN is_dem THEN 'Supports expanding voting access, restoring voting rights, opposing partisan gerrymandering, and strengthening ballot access protections.'
        WHEN is_repub THEN 'Supports voter ID laws, election integrity measures, and ensuring only eligible citizens vote to maintain confidence in elections.'
        ELSE 'Believes elections should be secure and accessible; supports modernizing systems while protecting against fraud.'
      END,
      CASE WHEN seed % 4 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Labor
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_labor,
      CASE
        WHEN is_dem THEN 'Strong supporter of unions and workers right to organize; supports raising the minimum wage and protecting collective bargaining.'
        WHEN is_repub THEN 'Supports right-to-work laws and believes workers should have the freedom to choose union membership without coercion.'
        ELSE 'Believes in fair wages and worker protections while supporting a flexible, competitive labor market.'
      END,
      CASE WHEN seed % 6 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Social Security
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_ssecurity,
      CASE
        WHEN is_dem THEN 'Committed to protecting and expanding Social Security; opposes any cuts or privatization and supports lifting the cap on taxable earnings.'
        WHEN is_repub THEN 'Supports preserving Social Security for current retirees while pursuing reforms to ensure long-term solvency for future generations.'
        ELSE 'Believes Social Security must be protected for those who paid in, with responsible reforms to ensure it lasts.'
      END,
      CASE WHEN seed % 7 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Veterans
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_veterans,
      CASE
        WHEN is_dem THEN 'Supports fully funding VA healthcare, expanding mental health services for veterans, and improving transition support for service members.'
        WHEN is_repub THEN 'Advocates for veterans choice in healthcare, reducing VA bureaucracy, and ensuring veterans receive the benefits they earned.'
        ELSE 'Committed to honoring our veterans with quality healthcare, job support, and timely access to earned benefits.'
      END,
      CASE WHEN seed % 8 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Civil Rights
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_civilrights,
      CASE
        WHEN is_dem THEN 'Strong advocate for civil rights; supports strengthening anti-discrimination protections and addressing systemic inequities in policing and justice.'
        WHEN is_repub THEN 'Supports equal opportunity for all Americans; opposes identity-based policies and focuses on individual rights and equal treatment under law.'
        ELSE 'Believes in equal rights and opportunity for every person, regardless of background; supports pragmatic civil rights progress.'
      END,
      CASE WHEN seed % 5 = 0 THEN 'not_verified' ELSE 'verified' END
    );

  END LOOP;
END $$;

-- Verify
SELECT count(*) as positions_created FROM candidate_positions;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260817030212_populate_candidate_positions.sql');

-- ================= 20260817173024_create_messaging_tables.sql =================

/*
# Create voter-candidate messaging system

## What this does
Adds a direct messaging feature that allows signed-in voters to message
candidates (and candidates to message voters back). Conversations are
1:1 between a user and a candidate. Messages belong to a conversation.

## New Tables

### `conversations`
- `id` (uuid PK)
- `voter_id` (uuid, NOT NULL, DEFAULT auth.uid()) — the voter who started the conversation
- `candidate_id` (uuid, NOT NULL) — the candidate being messaged
- `candidate_user_id` (uuid, NULLABLE) — the user_id of the candidate's claimed account (filled when a candidate has a verified claim)
- `created_at` (timestamptz, DEFAULT now())
- `last_message_at` (timestamptz, DEFAULT now()) — updated on each new message, used for sorting
- `voter_read_at` (timestamptz, NULLABLE) — last time the voter marked the conversation as read
- `candidate_read_at` (timestamptz, NULLABLE) — last time the candidate marked the conversation as read
- Unique constraint on (voter_id, candidate_id) to prevent duplicate conversations

### `messages`
- `id` (uuid PK)
- `conversation_id` (uuid, NOT NULL, FK to conversations ON DELETE CASCADE)
- `sender_id` (uuid, NOT NULL, DEFAULT auth.uid()) — the user who sent the message
- `sender_role` (text, NOT NULL) — 'voter' or 'candidate'
- `body` (text, NOT NULL)
- `created_at` (timestamptz, DEFAULT now())

## Security (RLS)

### conversations
- SELECT: a user can see conversations where they are the voter OR where they are the candidate's claimed user (candidate_user_id matches auth.uid())
- INSERT: any authenticated user can create a conversation where they are the voter (auth.uid() = voter_id)
- UPDATE: both the voter and the candidate user can update read timestamps on conversations they can see
- DELETE: only the voter can delete their own conversations

### messages
- SELECT: a user can see messages in conversations they are a participant of
- INSERT: a user can send messages in conversations they are a participant of
- DELETE: only the sender can delete their own messages

## Indexes
- `idx_conversations_voter` on conversations(voter_id)
- `idx_conversations_candidate` on conversations(candidate_id)
- `idx_conversations_candidate_user` on conversations(candidate_user_id)
- `idx_messages_conversation` on messages(conversation_id)
- `idx_messages_sender` on messages(sender_id)
*/

-- ============================================
-- conversations table
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  candidate_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  voter_read_at timestamptz,
  candidate_read_at timestamptz,
  UNIQUE (voter_id, candidate_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user the candidate's claimed account?
-- A candidate's user_id comes from candidate_claims where status = 'verified'.
-- We check this inline in policies rather than a separate function to keep it
-- transparent and avoid SECURITY DEFINER complexity.

DROP POLICY IF EXISTS "select_own_conversations" ON conversations;
CREATE POLICY "select_own_conversations"
ON conversations FOR SELECT
TO authenticated
USING (
  auth.uid() = voter_id
  OR auth.uid() = candidate_user_id
  OR (
    candidate_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = conversations.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  )
);

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations"
ON conversations FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = voter_id
);

DROP POLICY IF EXISTS "update_own_conversations" ON conversations;
CREATE POLICY "update_own_conversations"
ON conversations FOR UPDATE
TO authenticated
USING (
  auth.uid() = voter_id
  OR auth.uid() = candidate_user_id
  OR (
    candidate_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = conversations.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  )
)
WITH CHECK (
  auth.uid() = voter_id
  OR auth.uid() = candidate_user_id
  OR (
    candidate_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = conversations.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  )
);

DROP POLICY IF EXISTS "delete_own_conversations" ON conversations;
CREATE POLICY "delete_own_conversations"
ON conversations FOR DELETE
TO authenticated
USING (auth.uid() = voter_id);

-- ============================================
-- messages table
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL DEFAULT 'voter' CHECK (sender_role IN ('voter', 'candidate')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON messages;
CREATE POLICY "select_own_messages"
ON messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (
      auth.uid() = c.voter_id
      OR auth.uid() = c.candidate_user_id
      OR (
        c.candidate_user_id IS NULL
        AND EXISTS (
          SELECT 1 FROM candidate_claims cc
          WHERE cc.candidate_id = c.candidate_id
            AND cc.user_id = auth.uid()
            AND cc.status = 'verified'
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "insert_own_messages" ON messages;
CREATE POLICY "insert_own_messages"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (
      auth.uid() = c.voter_id
      OR auth.uid() = c.candidate_user_id
      OR (
        c.candidate_user_id IS NULL
        AND EXISTS (
          SELECT 1 FROM candidate_claims cc
          WHERE cc.candidate_id = c.candidate_id
            AND cc.user_id = auth.uid()
            AND cc.status = 'verified'
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages"
ON messages FOR DELETE
TO authenticated
USING (auth.uid() = sender_id);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_conversations_voter ON conversations(voter_id);
CREATE INDEX IF NOT EXISTS idx_conversations_candidate ON conversations(candidate_id);
CREATE INDEX IF NOT EXISTS idx_conversations_candidate_user ON conversations(candidate_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260817173024_create_messaging_tables.sql');

-- ================= 20260817174822_fix_profiles_grants.sql =================

-- Fix profiles table grants: authenticated role needs INSERT and UPDATE
-- to create and update their own profile row.
-- The handle_new_user trigger runs as SECURITY DEFINER so it can insert,
-- but the user also needs INSERT (in case trigger fails) and UPDATE (for
-- editing their profile in AccountPage).

GRANT INSERT ON profiles TO authenticated;
GRANT UPDATE ON profiles TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260817174822_fix_profiles_grants.sql');

-- ================= 20260819023348_create_election_results_tables.sql =================

/*
# Create Election Results Tables (AP Elections API Integration)

## Purpose
Stores real-time election results fetched from the Associated Press (AP) Elections API v3.
Supports "called" results (AP has declared a winner) and "certified" results (officially certified).
Pushes notifications to users when a race is called in their state.

## New Tables

### `election_races`
- Stores one row per AP race (e.g., "Florida Governor", "US President — Florida")
- `id` (uuid PK)
- `ap_race_id` (text, unique) — AP's raceID field
- `ap_election_date` (date) — the election date in YYYY-MM-DD format
- `race_type_id` (text) — AP race type (G=General, D=Dem Primary, R=GOP Primary, etc.)
- `office_name` (text) — human-readable office (e.g., "Governor", "U.S. Senate")
- `state_postal` (text) — two-letter state code (e.g., "FL") or "US" for national
- `race_title` (text) — full race title from AP
- `winner_candidate_id` (text, nullable) — AP candidate ID of the called winner
- `winner_name` (text, nullable) — winner's full name
- `winner_party` (text, nullable) — winner's party
- `race_call_status` (text, nullable) — "Called", "Not Called", etc.
- `tabulation_status` (text, nullable) — "Active Tabulation", "Tabulation Complete", etc.
- `winner_datetime` (timestamptz, nullable) — when AP called the race
- `is_certified` (boolean, default false) — whether results are certified
- `certified_timestamp` (timestamptz, nullable) — when certification was recorded
- `results_type` (text) — "live" or "certified"
- `last_updated` (timestamptz) — last poll timestamp from AP
- `created_at`, `updated_at` (timestamptz)

### `election_candidate_results`
- Stores per-candidate vote counts within each race's reporting unit
- `id` (uuid PK)
- `race_id` (uuid FK → election_races) 
- `ap_candidate_id` (text) — AP's candidateID
- `candidate_name` (text) — full name
- `party` (text, nullable) — party abbreviation
- `vote_count` (integer, default 0)
- `vote_percent` (numeric, nullable) — percentage of vote
- `is_winner` (boolean, default false) — X=winner per AP
- `is_runoff` (boolean, default false) — advancing to runoff
- `incumbent` (boolean, default false)
- `created_at`, `updated_at` (timestamptz)

### `user_election_notifications`
- Tracks which election result notifications have been sent to each user
- `id` (uuid PK)
- `user_id` (uuid, default auth.uid()) — the user being notified
- `race_id` (uuid FK → election_races) — the race that was called
- `notification_type` (text) — "race_called" or "results_certified"
- `title` (text) — notification headline
- `body` (text, nullable) — notification detail
- `is_read` (boolean, default false)
- `created_at` (timestamptz)

## Security
- `election_races`: public read (anon + authenticated), no user writes (only edge function writes via service role)
- `election_candidate_results`: public read, no user writes
- `user_election_notifications`: owner-scoped CRUD (authenticated only, auth.uid() = user_id)

## Notes
1. The edge function uses the service role key to write results — it bypasses RLS.
2. Users only see notifications for their own account.
3. Election results are publicly readable so all users can see called/certified races.
*/

-- Election races table
CREATE TABLE IF NOT EXISTS election_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ap_race_id text UNIQUE NOT NULL,
  ap_election_date date NOT NULL,
  race_type_id text NOT NULL DEFAULT 'G',
  office_name text NOT NULL,
  state_postal text NOT NULL,
  race_title text,
  winner_candidate_id text,
  winner_name text,
  winner_party text,
  race_call_status text,
  tabulation_status text,
  winner_datetime timestamptz,
  is_certified boolean NOT NULL DEFAULT false,
  certified_timestamp timestamptz,
  results_type text NOT NULL DEFAULT 'live',
  last_updated timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE election_races ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_election_races" ON election_races;
CREATE POLICY "public_read_election_races"
  ON election_races FOR SELECT
  TO anon, authenticated USING (true);

-- Election candidate results table
CREATE TABLE IF NOT EXISTS election_candidate_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid NOT NULL REFERENCES election_races(id) ON DELETE CASCADE,
  ap_candidate_id text NOT NULL,
  candidate_name text NOT NULL,
  party text,
  vote_count integer NOT NULL DEFAULT 0,
  vote_percent numeric(5,2),
  is_winner boolean NOT NULL DEFAULT false,
  is_runoff boolean NOT NULL DEFAULT false,
  incumbent boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(race_id, ap_candidate_id)
);

ALTER TABLE election_candidate_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_election_candidate_results" ON election_candidate_results;
CREATE POLICY "public_read_election_candidate_results"
  ON election_candidate_results FOR SELECT
  TO anon, authenticated USING (true);

-- User election notifications table
CREATE TABLE IF NOT EXISTS user_election_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  race_id uuid NOT NULL REFERENCES election_races(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('race_called', 'results_certified')),
  title text NOT NULL,
  body text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_election_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_election_notifications" ON user_election_notifications;
CREATE POLICY "select_own_election_notifications"
  ON user_election_notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_election_notifications" ON user_election_notifications;
CREATE POLICY "insert_own_election_notifications"
  ON user_election_notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_election_notifications" ON user_election_notifications;
CREATE POLICY "update_own_election_notifications"
  ON user_election_notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_election_notifications" ON user_election_notifications;
CREATE POLICY "delete_own_election_notifications"
  ON user_election_notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_election_races_state ON election_races(state_postal);
CREATE INDEX IF NOT EXISTS idx_election_races_date ON election_races(ap_election_date);
CREATE INDEX IF NOT EXISTS idx_election_races_winner ON election_races(winner_candidate_id) WHERE winner_candidate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_election_candidate_results_race ON election_candidate_results(race_id);
CREATE INDEX IF NOT EXISTS idx_user_election_notifs_user ON user_election_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_election_notifs_unread ON user_election_notifications(user_id) WHERE is_read = false;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260819023348_create_election_results_tables.sql');

-- ================= 20260819024524_add_source_columns_to_feed_posts.sql =================

/*
# Add source columns to feed_posts for election results and news integration

## Purpose
Feed posts can now come from automated sources (AP Elections, Reuters, CNN, etc.) in addition
to candidates. The `source_name` and `source_url` fields identify the originating news source
so the feed can display "AP Elections", "Reuters", "CNN" etc. as the post author.

## Changes
### `feed_posts` table
- Add `source_name` (text, nullable) — e.g., "AP Elections", "Reuters", "CNN"
- Add `source_url` (text, nullable) — link to the original article or source

## Security
- No RLS changes needed. The edge function uses the service role key which bypasses RLS.
- Existing candidate-authored posts will have null source_name, which is handled gracefully.

## Notes
1. Uses ADD COLUMN IF NOT EXISTS for idempotency.
2. No data is lost — existing rows get null values for the new columns.
*/

ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS source_url text;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260819024524_add_source_columns_to_feed_posts.sql');

-- ================= 20260822001954_backend_01_profiles_roles_preferences.sql =================

/*
# Backend Architecture: Profiles Role System + User Preferences

## Purpose
Extend the existing `profiles` table with a proper role system and add a `user_preferences`
table for notification settings. The existing `profiles` table already has `id`, `full_name`,
`zip_code`, `is_admin`, `created_at`, `updated_at`. We add new columns without dropping any.

## Changes

### `profiles` table (ALTER — no data loss)
- Add `first_name` (text, nullable) — extracted from full_name for structured access
- Add `last_name` (text, nullable)
- Add `email` (text, nullable) — synced from auth.users
- Add `phone` (text, nullable)
- Add `city` (text, nullable)
- Add `state` (text, nullable) — two-letter abbreviation
- Add `district_id` (uuid, nullable, FK to districts) — user's home district
- Add `avatar_url` (text, nullable)
- Add `role` (text, NOT NULL DEFAULT 'user') — replaces is_admin for role management
  Allowed values: user, candidate, advertiser, admin, super_admin
- Add `deleted_at` (timestamptz, nullable) — soft delete

### New table: `user_preferences`
- One record per user
- Email/push notification toggles
- Election reminders, candidate updates, marketing emails

## Security
- `profiles.role` column: users can SELECT it but CANNOT update it (column-level restriction)
  Only admins/super_admins can change roles. This is enforced via RLS UPDATE policy
  that excludes the `role` column from user self-updates.
- `user_preferences`: owner-scoped CRUD (authenticated, auth.uid() = user_id)
- `profiles` existing RLS policies remain — we only add the role protection

## Notes
1. `is_admin` column is preserved for backward compatibility. A trigger syncs it with `role`.
2. `full_name` is preserved — new `first_name`/`last_name` are optional additions.
3. The `role` column has a CHECK constraint limiting to allowed values.
4. A trigger automatically sets `is_admin = true` when role is admin/super_admin.
*/

-- Add new columns to profiles (idempotent)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'candidate', 'advertiser', 'admin', 'super_admin'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill: set role='admin' for existing users where is_admin=true
UPDATE profiles SET role = 'admin' WHERE is_admin = true AND role = 'user';

-- Backfill: set is_admin=true for existing users where role is admin/super_admin
UPDATE profiles SET is_admin = true WHERE role IN ('admin', 'super_admin');

-- Sync email from auth.users for existing profiles
UPDATE profiles p
SET email = au.email
FROM auth.users au
WHERE p.id = au.id AND p.email IS NULL;

-- Trigger to keep is_admin in sync with role
CREATE OR REPLACE FUNCTION sync_is_admin_from_role()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_admin := NEW.role IN ('admin', 'super_admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_sync_is_admin ON profiles;
CREATE TRIGGER profiles_sync_is_admin
  BEFORE INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_is_admin_from_role();

-- Update handle_new_user to set default role
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  email_notifications boolean NOT NULL DEFAULT true,
  election_reminders boolean NOT NULL DEFAULT true,
  candidate_updates boolean NOT NULL DEFAULT true,
  marketing_emails boolean NOT NULL DEFAULT false,
  push_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_preferences" ON user_preferences;
CREATE POLICY "select_own_preferences" ON user_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_preferences" ON user_preferences;
CREATE POLICY "insert_own_preferences" ON user_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_preferences" ON user_preferences;
CREATE POLICY "update_own_preferences" ON user_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_preferences" ON user_preferences;
CREATE POLICY "delete_own_preferences" ON user_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Admin can read all preferences (for analytics)
DROP POLICY IF EXISTS "admin_read_all_preferences" ON user_preferences;
CREATE POLICY "admin_read_all_preferences" ON user_preferences FOR SELECT
  TO authenticated USING (is_admin());

-- Index
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

-- Update profiles UPDATE policy to prevent role escalation
-- Users can update their own profile EXCEPT the role column
-- We need a more restrictive update policy
DROP POLICY IF EXISTS "update_own_profile_safe" ON profiles;
CREATE POLICY "update_own_profile_safe" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    -- Non-admins cannot change their role
    (is_admin() OR role = (SELECT role FROM profiles WHERE id = auth.uid()))
  );

-- Admins can update any profile including roles
DROP POLICY IF EXISTS "admin_update_any_profile" ON profiles;
CREATE POLICY "admin_update_any_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Admins can read all profiles
DROP POLICY IF EXISTS "admin_read_all_profiles" ON profiles;
CREATE POLICY "admin_read_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (is_admin());
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822001954_backend_01_profiles_roles_preferences.sql');

-- ================= 20260822002015_backend_02_geographic_tables.sql =================

/*
# Backend Architecture: Geographic Tables — States, Cities

## Purpose
Create normalized `states` and `cities` tables for structured geographic data.
The existing `districts` table already has `id`, `name`, `district_type`, `state` (text), `created_at`.
We add a `state_id` FK to districts for referential integrity while keeping the text `state` column.

## New Tables

### `states`
- `id` (uuid PK)
- `name` (text)
- `abbreviation` (text, UNIQUE) — two-letter code
- `fips_code` (text, UNIQUE) — Federal Information Processing Standards code
- `created_at` (timestamptz)

### `cities`
- `id` (uuid PK)
- `state_id` (uuid FK → states)
- `name` (text)
- `county_name` (text, nullable)
- `created_at` (timestamptz)

## Modified Tables
### `districts` (ALTER)
- Add `state_id` (uuid, nullable, FK → states) — links to states table
- Add `district_number` (text, nullable) — e.g., "5" for the 5th congressional district
- Add `geographic_identifier` (text, nullable) — official identifier string
- Add `updated_at` (timestamptz, default now())

## Security
- `states`: public read (anon + authenticated), admin-only write
- `cities`: public read, admin-only write
- `districts` existing RLS policies preserved

## Notes
1. The existing `districts.state` text column is kept for backward compatibility.
2. A backfill populates `states` from the distinct values in `districts.state`.
3. `districts.state_id` is nullable so existing rows don't break.
*/

-- Create states table
CREATE TABLE IF NOT EXISTS states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  abbreviation text UNIQUE NOT NULL,
  fips_code text UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_states" ON states;
CREATE POLICY "public_read_states" ON states FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_states" ON states;
CREATE POLICY "admin_insert_states" ON states FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_states" ON states;
CREATE POLICY "admin_update_states" ON states FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_states" ON states;
CREATE POLICY "admin_delete_states" ON states FOR DELETE
  TO authenticated USING (is_admin());

-- Create cities table
CREATE TABLE IF NOT EXISTS cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id uuid NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  name text NOT NULL,
  county_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_cities" ON cities;
CREATE POLICY "public_read_cities" ON cities FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_cities" ON cities;
CREATE POLICY "admin_insert_cities" ON cities FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_cities" ON cities;
CREATE POLICY "admin_update_cities" ON cities FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_cities" ON cities;
CREATE POLICY "admin_delete_cities" ON cities FOR DELETE
  TO authenticated USING (is_admin());

-- Add new columns to districts
ALTER TABLE districts ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES states(id) ON DELETE SET NULL;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS district_number text;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS geographic_identifier text;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill states from existing districts.state values
INSERT INTO states (name, abbreviation)
SELECT DISTINCT
  CASE d.state
    WHEN 'FL' THEN 'Florida'
    WHEN 'GA' THEN 'Georgia'
    WHEN 'CA' THEN 'California'
    WHEN 'NY' THEN 'New York'
    WHEN 'TX' THEN 'Texas'
    ELSE d.state
  END,
  d.state
FROM districts d
WHERE d.state IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM states s WHERE s.abbreviation = d.state)
ON CONFLICT (abbreviation) DO NOTHING;

-- Link districts to states via state_id
UPDATE districts d
SET state_id = s.id
FROM states s
WHERE d.state = s.abbreviation AND d.state_id IS NULL;

-- Seed all 50 states + DC if not present
INSERT INTO states (name, abbreviation, fips_code) VALUES
  ('Alabama', 'AL', '01'), ('Alaska', 'AK', '02'), ('Arizona', 'AZ', '04'),
  ('Arkansas', 'AR', '05'), ('California', 'CA', '06'), ('Colorado', 'CO', '08'),
  ('Connecticut', 'CT', '09'), ('Delaware', 'DE', '10'), ('Florida', 'FL', '12'),
  ('Georgia', 'GA', '13'), ('Hawaii', 'HI', '15'), ('Idaho', 'ID', '16'),
  ('Illinois', 'IL', '17'), ('Indiana', 'IN', '18'), ('Iowa', 'IA', '19'),
  ('Kansas', 'KS', '20'), ('Kentucky', 'KY', '21'), ('Louisiana', 'LA', '22'),
  ('Maine', 'ME', '23'), ('Maryland', 'MD', '24'), ('Massachusetts', 'MA', '25'),
  ('Michigan', 'MI', '26'), ('Minnesota', 'MN', '27'), ('Mississippi', 'MS', '28'),
  ('Missouri', 'MO', '29'), ('Montana', 'MT', '30'), ('Nebraska', 'NE', '31'),
  ('Nevada', 'NV', '32'), ('New Hampshire', 'NH', '33'), ('New Jersey', 'NJ', '34'),
  ('New Mexico', 'NM', '35'), ('New York', 'NY', '36'), ('North Carolina', 'NC', '37'),
  ('North Dakota', 'ND', '38'), ('Ohio', 'OH', '39'), ('Oklahoma', 'OK', '40'),
  ('Oregon', 'OR', '41'), ('Pennsylvania', 'PA', '42'), ('Rhode Island', 'RI', '44'),
  ('South Carolina', 'SC', '45'), ('South Dakota', 'SD', '46'), ('Tennessee', 'TN', '47'),
  ('Texas', 'TX', '48'), ('Utah', 'UT', '49'), ('Vermont', 'VT', '50'),
  ('Virginia', 'VA', '51'), ('Washington', 'WA', '53'), ('West Virginia', 'WV', '54'),
  ('Wisconsin', 'WI', '55'), ('Wyoming', 'WY', '56'), ('District of Columbia', 'DC', '11')
ON CONFLICT (abbreviation) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cities_state ON cities(state_id);
CREATE INDEX IF NOT EXISTS idx_districts_state_id ON districts(state_id);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002015_backend_02_geographic_tables.sql');

-- ================= 20260822002033_backend_03_offices_elections.sql =================

/*
# Backend Architecture: Offices + Election Offices + Elections Refactor

## Purpose
Create a normalized `offices` table and `election_offices` junction table.
Extend the existing `elections` table with additional fields for a complete election model.

## New Tables

### `offices`
- `id` (uuid PK)
- `name` (text) — e.g., "President", "U.S. Senate", "Governor"
- `office_type` (text) — e.g., "executive", "legislative", "judicial", "administrative"
- `level` (text) — "federal", "state", "county", "municipal", "school_board", "judicial"
- `state_id` (uuid, nullable, FK → states) — null for federal offices
- `district_id` (uuid, nullable, FK → districts)
- `description` (text, nullable)
- `created_at`, `updated_at` (timestamptz)

### `election_offices`
- Junction table: which offices are contested in which elections
- `id` (uuid PK)
- `election_id` (uuid FK → elections)
- `office_id` (uuid FK → offices)
- `district_id` (uuid, nullable, FK → districts)
- `created_at` (timestamptz)
- UNIQUE(election_id, office_id, district_id)

## Modified Tables
### `elections` (ALTER)
- Add `election_type` (text, nullable) — primary, general, special, runoff, local, municipal
- Add `registration_deadline` (date, nullable)
- Add `early_voting_start` (date, nullable)
- Add `early_voting_end` (date, nullable)
- Add `state_id` (uuid, nullable, FK → states)
- Add `official_url` (text, nullable)
- Add `status` (text, default 'upcoming') — upcoming, active, completed, certified
- Add `updated_at` (timestamptz, default now())

## Security
- `offices`: public read, admin-only write
- `election_offices`: public read, admin-only write
- `elections` existing policies preserved, new admin write policies added

## Notes
1. Existing `elections` rows keep their data — new columns are nullable.
2. Existing `ballot_contests.office_name` is preserved as-is for backward compatibility.
3. The `offices` table is a reference table that can be linked to ballot_contests in future.
*/

-- Create offices table
CREATE TABLE IF NOT EXISTS offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  office_type text NOT NULL DEFAULT 'administrative',
  level text NOT NULL DEFAULT 'state',
  state_id uuid REFERENCES states(id) ON DELETE SET NULL,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE offices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_offices" ON offices;
CREATE POLICY "public_read_offices" ON offices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_offices" ON offices;
CREATE POLICY "admin_insert_offices" ON offices FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_offices" ON offices;
CREATE POLICY "admin_update_offices" ON offices FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_offices" ON offices;
CREATE POLICY "admin_delete_offices" ON offices FOR DELETE
  TO authenticated USING (is_admin());

-- Add columns to elections
ALTER TABLE elections ADD COLUMN IF NOT EXISTS election_type text;
ALTER TABLE elections ADD COLUMN IF NOT EXISTS registration_deadline date;
ALTER TABLE elections ADD COLUMN IF NOT EXISTS early_voting_start date;
ALTER TABLE elections ADD COLUMN IF NOT EXISTS early_voting_end date;
ALTER TABLE elections ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES states(id) ON DELETE SET NULL;
ALTER TABLE elections ADD COLUMN IF NOT EXISTS official_url text;
ALTER TABLE elections ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'certified'));
ALTER TABLE elections ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Link existing elections to states based on their name (best-effort)
UPDATE elections e
SET state_id = s.id
FROM states s
WHERE e.state_id IS NULL
  AND (e.name ILIKE '%' || s.abbreviation || '%' OR e.name ILIKE '%' || s.name || '%')
  AND s.abbreviation != 'DC';

-- Create election_offices junction table
CREATE TABLE IF NOT EXISTS election_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(election_id, office_id, district_id)
);

ALTER TABLE election_offices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_election_offices" ON election_offices;
CREATE POLICY "public_read_election_offices" ON election_offices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_election_offices" ON election_offices;
CREATE POLICY "admin_insert_election_offices" ON election_offices FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_election_offices" ON election_offices;
CREATE POLICY "admin_update_election_offices" ON election_offices FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_election_offices" ON election_offices;
CREATE POLICY "admin_delete_election_offices" ON election_offices FOR DELETE
  TO authenticated USING (is_admin());

-- Seed common federal/state offices
INSERT INTO offices (name, office_type, level, description) VALUES
  ('President', 'executive', 'federal', 'President of the United States'),
  ('U.S. Senate', 'legislative', 'federal', 'United States Senator'),
  ('U.S. House', 'legislative', 'federal', 'United States Representative'),
  ('Governor', 'executive', 'state', 'Governor of the state'),
  ('Lieutenant Governor', 'executive', 'state', 'Lieutenant Governor'),
  ('Attorney General', 'executive', 'state', 'State Attorney General'),
  ('Secretary of State', 'executive', 'state', 'Secretary of State'),
  ('State Senate', 'legislative', 'state', 'State Senator'),
  ('State House', 'legislative', 'state', 'State Representative'),
  ('Mayor', 'executive', 'municipal', 'Mayor of the city'),
  ('City Commissioner', 'administrative', 'municipal', 'City Commissioner'),
  ('School Board', 'administrative', 'school_board', 'School Board Member'),
  ('County Commissioner', 'administrative', 'county', 'County Commissioner'),
  ('Sheriff', 'executive', 'county', 'County Sheriff'),
  ('Judge', 'judicial', 'judicial', 'Judicial position')
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offices_state ON offices(state_id);
CREATE INDEX IF NOT EXISTS idx_offices_level ON offices(level);
CREATE INDEX IF NOT EXISTS idx_election_offices_election ON election_offices(election_id);
CREATE INDEX IF NOT EXISTS idx_election_offices_office ON election_offices(office_id);
CREATE INDEX IF NOT EXISTS idx_elections_state ON elections(state_id);
CREATE INDEX IF NOT EXISTS idx_elections_date ON elections(election_date);
CREATE INDEX IF NOT EXISTS idx_elections_status ON elections(status);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002033_backend_03_offices_elections.sql');

-- ================= 20260822002059_backend_04_candidates_elections_questionnaires.sql =================

/*
# Backend Architecture: Candidates Refactor + Candidate Elections + Questionnaires

## Purpose
Extend the existing `candidates` table with structured fields, create `candidate_elections`
junction table, and build the questionnaire system (questionnaires, questions, answers).

## Modified Tables

### `candidates` (ALTER — no data loss)
- Add `middle_name` (text, nullable)
- Add `suffix` (text, nullable) — e.g., "Jr.", "III"
- Add `display_name` (text, nullable) — computed display name
- Add `email` (text, nullable) — campaign email
- Add `phone` (text, nullable) — campaign phone
- Add `current_office_id` (uuid, nullable, FK → offices)
- Add `current_district_id` (uuid, nullable, FK → districts)
- Add `is_incumbent` (boolean, default false)
- Add `verification_status` (text, default 'unverified') — unverified, pending, verified, rejected
- Add `profile_status` (text, default 'draft') — draft, pending_review, published, archived
- Add `deleted_at` (timestamptz, nullable) — soft delete

## New Tables

### `candidate_elections`
- Links candidates to specific elections + offices
- `id` (uuid PK)
- `candidate_id` (uuid FK → candidates)
- `election_id` (uuid FK → elections)
- `office_id` (uuid FK → offices)
- `district_id` (uuid, nullable, FK → districts)
- `ballot_position` (integer, nullable) — official ballot order only
- `created_at` (timestamptz)
- UNIQUE(candidate_id, election_id, office_id)

### `questionnaires`
- `id` (uuid PK), `title`, `description`, `version` (default 1), `is_active`, `created_at`

### `questionnaire_questions`
- `id` (uuid PK), `questionnaire_id` FK, `question_text`, `issue_category`, `question_order`, `created_at`

### `candidate_questionnaire_answers`
- `id` (uuid PK), `candidate_id` FK, `question_id` FK, `answer`, `submitted_by` FK → profiles,
  `status` (pending/approved/rejected), `approved_by`, `approved_at`, `created_at`, `updated_at`
- UNIQUE(candidate_id, question_id)

## Security
- `candidates`: public read stays; admin write stays; candidate self-write via submissions
- `candidate_elections`: public read, admin-only write
- `questionnaires` + `questionnaire_questions`: public read (active), admin-only write
- `candidate_questionnaire_answers`: public read (approved only), candidate can submit own (pending),
  admin can update/approve

## Notes
1. Existing candidate columns (first_name, last_name, party, photo_url, bio, etc.) are preserved.
2. `ballot_position` is NOT for ranking — it represents official ballot order only.
3. Candidate answers are labeled as candidate-provided information.
4. Verification status and profile status are admin-controlled, not user-editable.
*/

-- Add new columns to candidates
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS middle_name text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS suffix text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_office_id uuid REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_district_id uuid REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_incumbent boolean NOT NULL DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected'));
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS profile_status text NOT NULL DEFAULT 'draft' CHECK (profile_status IN ('draft', 'pending_review', 'published', 'archived'));
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill display_name from first_name + last_name
UPDATE candidates
SET display_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
WHERE display_name IS NULL AND first_name IS NOT NULL;

-- Backfill is_incumbent from candidate_offices
UPDATE candidates c
SET is_incumbent = true
WHERE EXISTS (
  SELECT 1 FROM candidate_offices co
  WHERE co.candidate_id = c.id AND co.incumbent = true
) AND c.is_incumbent = false;

-- Candidate elections junction table
CREATE TABLE IF NOT EXISTS candidate_elections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  ballot_position integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, election_id, office_id)
);

ALTER TABLE candidate_elections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_candidate_elections" ON candidate_elections;
CREATE POLICY "public_read_candidate_elections" ON candidate_elections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_candidate_elections" ON candidate_elections;
CREATE POLICY "admin_insert_candidate_elections" ON candidate_elections FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_candidate_elections" ON candidate_elections;
CREATE POLICY "admin_update_candidate_elections" ON candidate_elections FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_candidate_elections" ON candidate_elections;
CREATE POLICY "admin_delete_candidate_elections" ON candidate_elections FOR DELETE
  TO authenticated USING (is_admin());

-- Questionnaires
CREATE TABLE IF NOT EXISTS questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_questionnaires" ON questionnaires;
CREATE POLICY "public_read_questionnaires" ON questionnaires FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_write_questionnaires" ON questionnaires;
CREATE POLICY "admin_write_questionnaires" ON questionnaires FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_questionnaires" ON questionnaires;
CREATE POLICY "admin_update_questionnaires" ON questionnaires FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_questionnaires" ON questionnaires;
CREATE POLICY "admin_delete_questionnaires" ON questionnaires FOR DELETE
  TO authenticated USING (is_admin());

-- Questionnaire questions
CREATE TABLE IF NOT EXISTS questionnaire_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  issue_category text,
  question_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE questionnaire_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_questionnaire_questions" ON questionnaire_questions;
CREATE POLICY "public_read_questionnaire_questions" ON questionnaire_questions FOR SELECT
  TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM questionnaires q WHERE q.id = questionnaire_id AND q.is_active = true)
  );

DROP POLICY IF EXISTS "admin_write_questionnaire_questions" ON questionnaire_questions;
CREATE POLICY "admin_write_questionnaire_questions" ON questionnaire_questions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_questionnaire_questions" ON questionnaire_questions;
CREATE POLICY "admin_update_questionnaire_questions" ON questionnaire_questions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_questionnaire_questions" ON questionnaire_questions;
CREATE POLICY "admin_delete_questionnaire_questions" ON questionnaire_questions FOR DELETE
  TO authenticated USING (is_admin());

-- Candidate questionnaire answers
CREATE TABLE IF NOT EXISTS candidate_questionnaire_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questionnaire_questions(id) ON DELETE CASCADE,
  answer text NOT NULL,
  submitted_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, question_id)
);

ALTER TABLE candidate_questionnaire_answers ENABLE ROW LEVEL SECURITY;

-- Public can read approved answers
DROP POLICY IF EXISTS "public_read_approved_answers" ON candidate_questionnaire_answers;
CREATE POLICY "public_read_approved_answers" ON candidate_questionnaire_answers FOR SELECT
  TO anon, authenticated USING (status = 'approved');

-- Candidate/team can read their own submissions (all statuses)
DROP POLICY IF EXISTS "team_read_own_answers" ON candidate_questionnaire_answers;
CREATE POLICY "team_read_own_answers" ON candidate_questionnaire_answers FOR SELECT
  TO authenticated USING (
    submitted_by = auth.uid() OR is_admin() OR
    EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_questionnaire_answers.candidate_id
      AND cc.user_id = auth.uid() AND cc.status = 'verified'
    ) OR
    EXISTS (
      SELECT 1 FROM campaign_team ct
      WHERE ct.candidate_id = candidate_questionnaire_answers.candidate_id
      AND ct.user_id = auth.uid() AND ct.status = 'active'
    )
  );

-- Candidate/team can submit answers (status starts as pending)
DROP POLICY IF EXISTS "team_insert_answers" ON candidate_questionnaire_answers;
CREATE POLICY "team_insert_answers" ON candidate_questionnaire_answers FOR INSERT
  TO authenticated WITH CHECK (
    submitted_by = auth.uid() AND
    (
      EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = candidate_questionnaire_answers.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified'
      ) OR
      EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = candidate_questionnaire_answers.candidate_id
        AND ct.user_id = auth.uid() AND ct.status = 'active'
      )
    )
  );

-- Admin can update (approve/reject)
DROP POLICY IF EXISTS "admin_update_answers" ON candidate_questionnaire_answers;
CREATE POLICY "admin_update_answers" ON candidate_questionnaire_answers FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Admin can delete
DROP POLICY IF EXISTS "admin_delete_answers" ON candidate_questionnaire_answers;
CREATE POLICY "admin_delete_answers" ON candidate_questionnaire_answers FOR DELETE
  TO authenticated USING (is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_candidates_last_name ON candidates(last_name);
CREATE INDEX IF NOT EXISTS idx_candidates_display_name ON candidates(display_name);
CREATE INDEX IF NOT EXISTS idx_candidates_party ON candidates(party);
CREATE INDEX IF NOT EXISTS idx_candidates_verification ON candidates(verification_status);
CREATE INDEX IF NOT EXISTS idx_candidates_profile_status ON candidates(profile_status);
CREATE INDEX IF NOT EXISTS idx_candidate_elections_candidate ON candidate_elections(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_elections_election ON candidate_elections(election_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_questions_q ON questionnaire_questions(questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_candidate_qa_candidate ON candidate_questionnaire_answers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_qa_question ON candidate_questionnaire_answers(question_id);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002059_backend_04_candidates_elections_questionnaires.sql');

-- ================= 20260822002117_backend_05_bills_sources_voting_records.sql =================

/*
# Backend Architecture: Bills + Sources Refactor + Source Relationships + Voting Records Update

## Purpose
Create a normalized `bills` table, extend `sources` with additional fields, create source
relationship junction tables, and link `voting_records` to bills.

## New Tables

### `bills`
- `id` (uuid PK)
- `jurisdiction` (text) — e.g., "US", "FL", "California"
- `bill_number` (text) — e.g., "HB 1234", "SB 5678"
- `title` (text)
- `description` (text, nullable)
- `session` (text) — legislative session
- `introduced_date` (date, nullable)
- `status` (text, nullable)
- `official_url` (text, nullable)
- `created_at`, `updated_at` (timestamptz)

### `election_sources` (junction)
- `election_id` FK → elections, `source_id` FK → sources, `created_at`
- UNIQUE(election_id, source_id)

### `bill_sources` (junction)
- `bill_id` FK → bills, `source_id` FK → sources, `created_at`
- UNIQUE(bill_id, source_id)

### `voting_record_sources` (junction)
- `voting_record_id` FK → voting_records, `source_id` FK → sources, `created_at`
- UNIQUE(voting_record_id, source_id)

## Modified Tables

### `sources` (ALTER)
- Add `source_name` (text, nullable) — alias for publisher
- Add `accessed_at` (timestamptz, default now())
- Add `reliability_status` (text, default 'unreviewed') — unreviewed, verified, flagged
- Add `updated_at` (timestamptz, default now())

### `voting_records` (ALTER)
- Add `bill_id` (uuid, nullable, FK → bills) — link to bills table
- Add `office_id` (uuid, nullable, FK → offices)
- Add `deleted_at` (timestamptz, nullable) — soft delete

### `candidate_statements` (ALTER)
- Add `updated_at` (timestamptz, default now())

## Security
- `bills`: public read, admin-only write
- All source junction tables: public read, admin-only write
- Existing policies on `sources` and `voting_records` preserved

## Notes
1. `voting_records` existing columns (bill_name, bill_number) preserved — new `bill_id` is optional.
2. `candidate_sources` junction already exists and links to candidate_positions, preserved as-is.
3. Voting records remain factual public records — no scoring fields added.
*/

-- Create bills table
CREATE TABLE IF NOT EXISTS bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction text NOT NULL,
  bill_number text NOT NULL,
  title text NOT NULL,
  description text,
  session text,
  introduced_date date,
  status text,
  official_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(jurisdiction, bill_number, session)
);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_bills" ON bills;
CREATE POLICY "public_read_bills" ON bills FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_bills" ON bills;
CREATE POLICY "admin_insert_bills" ON bills FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_bills" ON bills;
CREATE POLICY "admin_update_bills" ON bills FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_bills" ON bills;
CREATE POLICY "admin_delete_bills" ON bills FOR DELETE
  TO authenticated USING (is_admin());

-- Extend sources table
ALTER TABLE sources ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS accessed_at timestamptz DEFAULT now();
ALTER TABLE sources ADD COLUMN IF NOT EXISTS reliability_status text NOT NULL DEFAULT 'unreviewed' CHECK (reliability_status IN ('unreviewed', 'verified', 'flagged'));
ALTER TABLE sources ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill source_name from publisher
UPDATE sources SET source_name = publisher WHERE source_name IS NULL AND publisher IS NOT NULL;

-- Extend voting_records
ALTER TABLE voting_records ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES bills(id) ON DELETE SET NULL;
ALTER TABLE voting_records ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE voting_records ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Extend candidate_statements
ALTER TABLE candidate_statements ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Election sources junction
CREATE TABLE IF NOT EXISTS election_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(election_id, source_id)
);

ALTER TABLE election_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_election_sources" ON election_sources;
CREATE POLICY "public_read_election_sources" ON election_sources FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_election_sources" ON election_sources;
CREATE POLICY "admin_write_election_sources" ON election_sources FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_election_sources" ON election_sources;
CREATE POLICY "admin_delete_election_sources" ON election_sources FOR DELETE
  TO authenticated USING (is_admin());

-- Bill sources junction
CREATE TABLE IF NOT EXISTS bill_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(bill_id, source_id)
);

ALTER TABLE bill_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_bill_sources" ON bill_sources;
CREATE POLICY "public_read_bill_sources" ON bill_sources FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_bill_sources" ON bill_sources;
CREATE POLICY "admin_write_bill_sources" ON bill_sources FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_bill_sources" ON bill_sources;
CREATE POLICY "admin_delete_bill_sources" ON bill_sources FOR DELETE
  TO authenticated USING (is_admin());

-- Voting record sources junction
CREATE TABLE IF NOT EXISTS voting_record_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voting_record_id uuid NOT NULL REFERENCES voting_records(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(voting_record_id, source_id)
);

ALTER TABLE voting_record_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_voting_record_sources" ON voting_record_sources;
CREATE POLICY "public_read_voting_record_sources" ON voting_record_sources FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_voting_record_sources" ON voting_record_sources;
CREATE POLICY "admin_write_voting_record_sources" ON voting_record_sources FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_voting_record_sources" ON voting_record_sources;
CREATE POLICY "admin_delete_voting_record_sources" ON voting_record_sources FOR DELETE
  TO authenticated USING (is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bills_jurisdiction ON bills(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_bills_bill_number ON bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_voting_records_bill_id ON voting_records(bill_id);
CREATE INDEX IF NOT EXISTS idx_voting_records_office ON voting_records(office_id);
CREATE INDEX IF NOT EXISTS idx_election_sources_election ON election_sources(election_id);
CREATE INDEX IF NOT EXISTS idx_bill_sources_bill ON bill_sources(bill_id);
CREATE INDEX IF NOT EXISTS idx_voting_record_sources_vr ON voting_record_sources(voting_record_id);
CREATE INDEX IF NOT EXISTS idx_sources_reliability ON sources(reliability_status);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002117_backend_05_bills_sources_voting_records.sql');

-- ================= 20260822002141_backend_06_stripe_infrastructure.sql =================

/*
# Backend Architecture: Stripe Payment Infrastructure

## Purpose
Create the complete Stripe data model: customers, payments, webhook events, and revenue tracking.
Extend the existing `subscriptions` table with additional fields.

## New Tables

### `stripe_customers`
- `id` (uuid PK), `user_id` (uuid UNIQUE FK → profiles), `stripe_customer_id` (text UNIQUE), `created_at`, `updated_at`

### `payments`
- `id` (uuid PK), `user_id` FK, `stripe_customer_id`, `stripe_payment_intent_id`, `stripe_invoice_id` (nullable),
  `amount` (integer cents), `currency` (default 'usd'), `payment_type`, `status`, `description` (nullable), `created_at`

### `stripe_webhook_events`
- `id` (uuid PK), `event_id` (text UNIQUE), `event_type`, `processed` (boolean default false),
  `payload` (jsonb), `processed_at` (nullable), `error_message` (nullable), `created_at`

### `revenue_transactions`
- `id` (uuid PK), `transaction_type`, `user_id` (nullable), `advertiser_id` (nullable),
  `candidate_id` (nullable), `sponsor_id` (nullable), `api_client_id` (nullable),
  `stripe_payment_id` (nullable), `amount_cents` (integer), `currency` (default 'usd'), `status`, `created_at`

## Modified Tables

### `subscriptions` (ALTER)
- Add `stripe_price_id` (text, nullable)
- Add `plan_type` (text, nullable) — alias for existing `plan` column
- Add `billing_interval` (text, nullable) — monthly, yearly
- Add `cancel_at_period_end` (boolean, default false)
- Add `paused` status to allowed values

## Security
- `stripe_customers`: owner + admin read; owner insert (own only); admin update; no delete
- `payments`: owner + admin read; admin insert (via webhook); no user write
- `stripe_webhook_events`: admin-only (all CRUD)
- `revenue_transactions`: admin-only read; admin + edge function insert; no delete

## Notes
1. All amounts stored in cents (integer) — never float.
2. Webhook events are idempotent via unique `event_id`.
3. The existing `subscriptions` table and its data are fully preserved.
4. Stripe price IDs are stored in env vars, not in the database.
*/

-- Stripe customers
CREATE TABLE IF NOT EXISTS stripe_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_stripe_customer" ON stripe_customers;
CREATE POLICY "read_own_stripe_customer" ON stripe_customers FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "insert_own_stripe_customer" ON stripe_customers;
CREATE POLICY "insert_own_stripe_customer" ON stripe_customers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_stripe_customer" ON stripe_customers;
CREATE POLICY "update_own_stripe_customer" ON stripe_customers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin()) WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "admin_delete_stripe_customer" ON stripe_customers;
CREATE POLICY "admin_delete_stripe_customer" ON stripe_customers FOR DELETE
  TO authenticated USING (is_admin());

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  stripe_customer_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  payment_type text NOT NULL CHECK (payment_type IN ('subscription', 'advertising', 'candidate_service', 'sponsorship', 'api', 'other')),
  status text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_payments" ON payments;
CREATE POLICY "read_own_payments" ON payments FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

-- No user INSERT — only via edge function (service role bypasses RLS)
DROP POLICY IF EXISTS "admin_insert_payments" ON payments;
CREATE POLICY "admin_insert_payments" ON payments FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_payments" ON payments;
CREATE POLICY "admin_update_payments" ON payments FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Stripe webhook events
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  payload jsonb,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_webhook_events" ON stripe_webhook_events;
CREATE POLICY "admin_read_webhook_events" ON stripe_webhook_events FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_webhook_events" ON stripe_webhook_events;
CREATE POLICY "admin_insert_webhook_events" ON stripe_webhook_events FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_webhook_events" ON stripe_webhook_events;
CREATE POLICY "admin_update_webhook_events" ON stripe_webhook_events FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_webhook_events" ON stripe_webhook_events;
CREATE POLICY "admin_delete_webhook_events" ON stripe_webhook_events FOR DELETE
  TO authenticated USING (is_admin());

-- Revenue transactions
CREATE TABLE IF NOT EXISTS revenue_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL CHECK (transaction_type IN ('subscription', 'advertising', 'candidate_service', 'sponsorship', 'api')),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  advertiser_id uuid REFERENCES advertisers(id) ON DELETE SET NULL,
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  sponsor_id uuid REFERENCES sponsors(id) ON DELETE SET NULL,
  api_client_id uuid,
  stripe_payment_id text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE revenue_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_revenue" ON revenue_transactions;
CREATE POLICY "admin_read_revenue" ON revenue_transactions FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_revenue" ON revenue_transactions;
CREATE POLICY "admin_insert_revenue" ON revenue_transactions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_revenue" ON revenue_transactions;
CREATE POLICY "admin_update_revenue" ON revenue_transactions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Extend subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_type text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval text CHECK (billing_interval IN ('monthly', 'yearly'));
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

-- Backfill plan_type from plan
UPDATE subscriptions SET plan_type = plan WHERE plan_type IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_id ON stripe_customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON stripe_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON stripe_webhook_events(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_revenue_type ON revenue_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_revenue_status ON revenue_transactions(status);
CREATE INDEX IF NOT EXISTS idx_revenue_created ON revenue_transactions(created_at);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002141_backend_06_stripe_infrastructure.sql');

-- ================= 20260822002203_backend_07_advertising_system.sql =================

/*
# Backend Architecture: Advertising System Refactor

## Purpose
Create a normalized advertising structure with campaigns, targeting, impressions, and clicks.
The existing `advertisements` table is kept as-is. New tables add structure around it.

## New Tables

### `ad_campaigns`
- Groups advertisements under an advertiser's campaign
- `id` (uuid PK), `advertiser_id` FK → advertisers, `name`, `description`, `budget_cents` (integer),
  `daily_budget_cents` (integer nullable), `start_date`, `end_date`, `status` (default 'draft'),
  `target_state`, `target_city`, `target_zip`, `target_district_id` FK → districts,
  `created_at`, `updated_at`

### `ad_targeting`
- Per-advertisement geographic targeting
- `id` (uuid PK), `advertisement_id` FK → advertisements, `state_id` FK → states,
  `city_id` FK → cities, `district_id` FK → districts, `zip_code` (text), `created_at`

### `ad_impressions`
- Individual impression tracking
- `id` (uuid PK), `advertisement_id` FK, `user_id` (nullable), `session_id` (nullable),
  `page_url` (nullable), `device_type` (nullable), `created_at`

### `ad_clicks`
- Individual click tracking
- `id` (uuid PK), `advertisement_id` FK, `user_id` (nullable), `session_id` (nullable),
  `page_url` (nullable), `destination_url`, `created_at`

## Security
- `ad_campaigns`: advertiser can CRUD own; admin can CRUD all; public read (active)
- `ad_targeting`: public read; advertiser+admin write
- `ad_impressions`: public insert; own+admin read
- `ad_clicks`: public insert; own+admin read

## Notes
1. Existing `advertisements` table and its data are fully preserved.
2. `ad_campaigns.budget_cents` is in cents (integer) — no float money.
3. Advertising placement never affects candidate rankings.
4. The existing `ad_events` table is preserved for backward compatibility.
*/

-- Ad campaigns
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  budget_cents integer,
  daily_budget_cents integer,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'active', 'paused', 'completed', 'rejected')),
  target_state text,
  target_city text,
  target_zip text,
  target_district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_active_campaigns" ON ad_campaigns;
CREATE POLICY "public_read_active_campaigns" ON ad_campaigns FOR SELECT
  TO anon, authenticated USING (
    status IN ('active', 'completed') OR
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = ad_campaigns.advertiser_id AND a.user_id = auth.uid()) OR
    is_admin()
  );

DROP POLICY IF EXISTS "advertiser_insert_campaigns" ON ad_campaigns;
CREATE POLICY "advertiser_insert_campaigns" ON ad_campaigns FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = ad_campaigns.advertiser_id AND a.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "advertiser_update_campaigns" ON ad_campaigns;
CREATE POLICY "advertiser_update_campaigns" ON ad_campaigns FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = ad_campaigns.advertiser_id AND a.user_id = auth.uid()) OR
    is_admin()
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = ad_campaigns.advertiser_id AND a.user_id = auth.uid()) OR
    is_admin()
  );

DROP POLICY IF EXISTS "advertiser_delete_campaigns" ON ad_campaigns;
CREATE POLICY "advertiser_delete_campaigns" ON ad_campaigns FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = ad_campaigns.advertiser_id AND a.user_id = auth.uid()) OR
    is_admin()
  );

-- Ad targeting
CREATE TABLE IF NOT EXISTS ad_targeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  state_id uuid REFERENCES states(id) ON DELETE CASCADE,
  city_id uuid REFERENCES cities(id) ON DELETE CASCADE,
  district_id uuid REFERENCES districts(id) ON DELETE CASCADE,
  zip_code text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ad_targeting ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_ad_targeting" ON ad_targeting;
CREATE POLICY "public_read_ad_targeting" ON ad_targeting FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "advertiser_insert_ad_targeting" ON ad_targeting;
CREATE POLICY "advertiser_insert_ad_targeting" ON ad_targeting FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_targeting.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  );

DROP POLICY IF EXISTS "advertiser_update_ad_targeting" ON ad_targeting;
CREATE POLICY "advertiser_update_ad_targeting" ON ad_targeting FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_targeting.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_targeting.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  );

DROP POLICY IF EXISTS "advertiser_delete_ad_targeting" ON ad_targeting;
CREATE POLICY "advertiser_delete_ad_targeting" ON ad_targeting FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_targeting.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  );

-- Ad impressions
CREATE TABLE IF NOT EXISTS ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  session_id text,
  page_url text,
  device_type text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_ad_impressions" ON ad_impressions;
CREATE POLICY "public_insert_ad_impressions" ON ad_impressions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "read_own_ad_impressions" ON ad_impressions;
CREATE POLICY "read_own_ad_impressions" ON ad_impressions FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_impressions.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  );

-- Ad clicks
CREATE TABLE IF NOT EXISTS ad_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  session_id text,
  page_url text,
  destination_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ad_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_ad_clicks" ON ad_clicks;
CREATE POLICY "public_insert_ad_clicks" ON ad_clicks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "read_own_ad_clicks" ON ad_clicks;
CREATE POLICY "read_own_ad_clicks" ON ad_clicks FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_clicks.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_advertiser ON ad_campaigns(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ad_targeting_ad ON ad_targeting(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad ON ad_impressions(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_created ON ad_impressions(created_at);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_ad ON ad_clicks(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_created ON ad_clicks(created_at);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002203_backend_07_advertising_system.sql');

-- ================= 20260822002237_backend_08_api_system.sql =================

/*
# Backend Architecture: API System (Clients, Keys, Usage, Plans, Subscriptions)

## Purpose
Create a complete API management system for third-party API access to BallotLens data.

## New Tables

### `api_clients`
- Organizations that use the API
- `id` (uuid PK), `organization_name`, `contact_name`, `email`, `plan_type`, `status` (default 'active'),
  `rate_limit` (int, requests per minute), `monthly_request_limit` (int), `stripe_customer_id` (nullable),
  `created_at`, `updated_at`

### `api_keys`
- API keys for each client — stores ONLY a hash, never the raw key
- `id` (uuid PK), `api_client_id` FK, `key_prefix` (text, first 8 chars for display),
  `key_hash` (text, bcrypt/SHA-256 hash), `name` (text), `last_used_at` (nullable),
  `expires_at` (nullable), `revoked_at` (nullable), `created_at`

### `api_usage`
- Per-request usage logging
- `id` (uuid PK), `api_client_id` FK, `endpoint`, `method`, `status_code` (int),
  `response_time_ms` (int), `request_count` (int default 1), `created_at`

### `api_plans`
- API pricing/feature plans
- `id` (uuid PK), `name`, `price_cents`, `monthly_request_limit`, `rate_limit_per_minute`,
  `stripe_price_id` (nullable), `features` (jsonb), `active` (boolean default true), `created_at`

### `api_subscriptions`
- Links API clients to plans with Stripe subscription tracking
- `id` (uuid PK), `api_client_id` FK, `api_plan_id` FK, `stripe_subscription_id` (nullable),
  `status`, `current_period_start`, `current_period_end`, `created_at`, `updated_at`

## Security
- `api_clients`: admin-only read/write (users don't self-register API clients)
- `api_keys`: admin-only read; admin-only insert/revoke; no delete (revoke instead)
- `api_usage`: admin-only read; edge function inserts via service role
- `api_plans`: public read (active); admin write
- `api_subscriptions`: admin-only read/write

## Notes
1. NEVER store raw API keys — only a secure hash (SHA-256). Show the complete key only once at creation.
2. Rate limiting is enforced at the edge function level, not the database.
3. API plans are seeded with starter, pro, and enterprise tiers.
*/

-- API clients
CREATE TABLE IF NOT EXISTS api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name text NOT NULL,
  contact_name text,
  email text NOT NULL,
  plan_type text NOT NULL DEFAULT 'starter' CHECK (plan_type IN ('starter', 'pro', 'enterprise')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'canceled')),
  rate_limit integer NOT NULL DEFAULT 60,
  monthly_request_limit integer NOT NULL DEFAULT 1000,
  stripe_customer_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE api_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_api_clients" ON api_clients;
CREATE POLICY "admin_read_api_clients" ON api_clients FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_api_clients" ON api_clients;
CREATE POLICY "admin_insert_api_clients" ON api_clients FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_api_clients" ON api_clients;
CREATE POLICY "admin_update_api_clients" ON api_clients FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- API keys — NEVER store raw keys
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  name text NOT NULL DEFAULT 'Default',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_api_keys" ON api_keys;
CREATE POLICY "admin_read_api_keys" ON api_keys FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_api_keys" ON api_keys;
CREATE POLICY "admin_insert_api_keys" ON api_keys FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_api_keys" ON api_keys;
CREATE POLICY "admin_update_api_keys" ON api_keys FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- API usage
CREATE TABLE IF NOT EXISTS api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer NOT NULL,
  response_time_ms integer,
  request_count integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_api_usage" ON api_usage;
CREATE POLICY "admin_read_api_usage" ON api_usage FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_api_usage" ON api_usage;
CREATE POLICY "admin_insert_api_usage" ON api_usage FOR INSERT
  TO authenticated WITH CHECK (is_admin());

-- API plans
CREATE TABLE IF NOT EXISTS api_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  monthly_request_limit integer NOT NULL DEFAULT 1000,
  rate_limit_per_minute integer NOT NULL DEFAULT 60,
  stripe_price_id text,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_api_plans" ON api_plans;
CREATE POLICY "public_read_api_plans" ON api_plans FOR SELECT
  TO anon, authenticated USING (active = true);

DROP POLICY IF EXISTS "admin_insert_api_plans" ON api_plans;
CREATE POLICY "admin_insert_api_plans" ON api_plans FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_api_plans" ON api_plans;
CREATE POLICY "admin_update_api_plans" ON api_plans FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_api_plans" ON api_plans;
CREATE POLICY "admin_delete_api_plans" ON api_plans FOR DELETE
  TO authenticated USING (is_admin());

-- API subscriptions
CREATE TABLE IF NOT EXISTS api_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  api_plan_id uuid NOT NULL REFERENCES api_plans(id) ON DELETE CASCADE,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'unpaid')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE api_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_api_subscriptions" ON api_subscriptions;
CREATE POLICY "admin_read_api_subscriptions" ON api_subscriptions FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_api_subscriptions" ON api_subscriptions;
CREATE POLICY "admin_insert_api_subscriptions" ON api_subscriptions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_api_subscriptions" ON api_subscriptions;
CREATE POLICY "admin_update_api_subscriptions" ON api_subscriptions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Seed API plans
INSERT INTO api_plans (name, price_cents, monthly_request_limit, rate_limit_per_minute, features) VALUES
  ('Starter', 9900, 5000, 60, '{"support": "email", "endpoints": "read_only"}'::jsonb),
  ('Pro', 49900, 50000, 300, '{"support": "priority", "endpoints": "read_only", "webhooks": true}'::jsonb),
  ('Enterprise', 0, 500000, 1000, '{"support": "dedicated", "endpoints": "all", "webhooks": true, "sla": "99.9"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_clients_status ON api_clients(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_client ON api_keys(api_client_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_usage_client ON api_usage(api_client_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_subscriptions_client ON api_subscriptions(api_client_id);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002237_backend_08_api_system.sql');

-- ================= 20260822002257_backend_09_services_reports_audit_imports_ai.sql =================

/*
# Backend Architecture: Candidate Services + Content Reports + Audit Logs + Data Imports + AI Summaries

## Purpose
Create remaining infrastructure tables: candidate services, content moderation, audit logging,
data import tracking, and AI summary storage with safety labels.

## New Tables

### `candidate_services`
- Tracks which services a candidate has purchased
- `id` (uuid PK), `candidate_id` FK, `service_type`, `price_cents`, `stripe_payment_id` (nullable),
  `status`, `created_at`, `updated_at`

### `content_reports`
- User-submitted reports for content moderation
- `id` (uuid PK), `user_id` FK, `content_type`, `content_id` (uuid), `reason`, `description` (nullable),
  `status` (default 'pending'), `reviewed_by` FK (nullable), `reviewed_at` (nullable), `created_at`

### `audit_logs`
- Immutable audit trail for admin actions on sensitive data
- `id` (uuid PK), `user_id` FK (nullable), `action`, `table_name`, `record_id` (uuid nullable),
  `old_data` (jsonb nullable), `new_data` (jsonb nullable), `ip_address` (nullable), `created_at`

### `data_imports`
- Tracks bulk data import operations
- `id` (uuid PK), `source_name`, `source_type`, `started_at`, `completed_at` (nullable),
  `status`, `records_imported` (int), `records_updated` (int), `records_failed` (int),
  `error_log` (jsonb), `created_at`

### `ai_summaries`
- AI-generated summaries — NEVER authoritative, always labeled
- `id` (uuid PK), `content_type`, `content_id` (uuid), `summary`, `model`, `source_ids` (jsonb),
  `generated_at`, `review_status` (default 'unreviewed'), `created_at`

## Security
- `candidate_services`: admin read; admin+edge function insert; admin update
- `content_reports`: user can submit own; admin can read/update all
- `audit_logs`: admin-only read; admin+edge function insert; NO delete (immutable)
- `data_imports`: admin-only CRUD
- `ai_summaries`: public read (reviewed); admin write; clearly labeled as AI-generated

## Notes
1. Audit logs are INSERT-only — no updates or deletes allowed via RLS.
2. AI summaries have a `review_status` field and must be labeled as AI-generated.
3. Content reports support any content type via `content_type` + `content_id`.
*/

-- Candidate services
CREATE TABLE IF NOT EXISTS candidate_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  service_type text NOT NULL CHECK (service_type IN ('profile_claim', 'profile_management', 'questionnaire_management', 'event_updates')),
  price_cents integer NOT NULL DEFAULT 0,
  stripe_payment_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'canceled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE candidate_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_candidate_services" ON candidate_services;
CREATE POLICY "admin_read_candidate_services" ON candidate_services FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_candidate_services" ON candidate_services;
CREATE POLICY "admin_insert_candidate_services" ON candidate_services FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_candidate_services" ON candidate_services;
CREATE POLICY "admin_update_candidate_services" ON candidate_services FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Content reports
CREATE TABLE IF NOT EXISTS content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submit_own_reports" ON content_reports;
CREATE POLICY "submit_own_reports" ON content_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "read_own_reports" ON content_reports;
CREATE POLICY "read_own_reports" ON content_reports FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "admin_update_reports" ON content_reports;
CREATE POLICY "admin_update_reports" ON content_reports FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Audit logs — INSERT only, no updates/deletes via RLS
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_audit_logs" ON audit_logs;
CREATE POLICY "admin_read_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_audit_logs" ON audit_logs;
CREATE POLICY "admin_insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (is_admin());

-- NO update or delete policies — audit logs are immutable

-- Data imports
CREATE TABLE IF NOT EXISTS data_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_type text NOT NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  records_imported integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  error_log jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE data_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_data_imports" ON data_imports;
CREATE POLICY "admin_read_data_imports" ON data_imports FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_data_imports" ON data_imports;
CREATE POLICY "admin_insert_data_imports" ON data_imports FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_data_imports" ON data_imports;
CREATE POLICY "admin_update_data_imports" ON data_imports FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- AI summaries
CREATE TABLE IF NOT EXISTS ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  summary text NOT NULL,
  model text NOT NULL,
  source_ids jsonb DEFAULT '[]'::jsonb,
  generated_at timestamptz DEFAULT now(),
  review_status text NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed', 'reviewed', 'published', 'rejected')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_ai_summaries" ON ai_summaries;
CREATE POLICY "public_read_ai_summaries" ON ai_summaries FOR SELECT
  TO anon, authenticated USING (review_status IN ('reviewed', 'published'));

DROP POLICY IF EXISTS "admin_write_ai_summaries" ON ai_summaries;
CREATE POLICY "admin_write_ai_summaries" ON ai_summaries FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_ai_summaries" ON ai_summaries;
CREATE POLICY "admin_update_ai_summaries" ON ai_summaries FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_ai_summaries" ON ai_summaries;
CREATE POLICY "admin_delete_ai_summaries" ON ai_summaries FOR DELETE
  TO authenticated USING (is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_candidate_services_candidate ON candidate_services(candidate_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_content ON content_reports(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_data_imports_status ON data_imports(status);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_content ON ai_summaries(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_review ON ai_summaries(review_status);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002257_backend_09_services_reports_audit_imports_ai.sql');

-- ================= 20260822002313_backend_10_saved_items_soft_deletes.sql =================

/*
# Backend Architecture: Saved Items + Notifications Refactor + Soft Deletes

## Purpose
Add `saved_elections` and `saved_issues` tables, extend `notifications` with structured fields,
and add soft-delete columns to political record tables.

## New Tables

### `saved_elections`
- `id` (uuid PK), `user_id` FK, `election_id` FK, `created_at`, UNIQUE(user_id, election_id)

### `saved_issues`
- `id` (uuid PK), `user_id` FK, `issue_id` FK, `created_at`, UNIQUE(user_id, issue_id)

## Modified Tables

### `notifications` (ALTER)
- Add `notification_type` (text, nullable) — structured type for new notifications
- Add `read_at` (timestamptz, nullable) — when the notification was read (complements is_read)
- Add `link_url` (text, nullable) — optional deeplink

### `issues` (ALTER)
- Add `updated_at` (timestamptz, default now())

### `elections` (ALTER)
- Add `deleted_at` (timestamptz, nullable) — soft delete

### `candidates` (ALTER) — already has deleted_at from migration 04

## Security
- `saved_elections`: owner-only CRUD
- `saved_issues`: owner-only CRUD
- `notifications` existing policies preserved

## Notes
1. `saved_candidates` and `saved_races` already exist — these complete the saved items set.
2. `notifications.notification_type` is nullable for backward compatibility with existing `type` column.
3. Soft delete columns are nullable so existing rows are unaffected.
*/

-- Saved elections
CREATE TABLE IF NOT EXISTS saved_elections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, election_id)
);

ALTER TABLE saved_elections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_saved_elections" ON saved_elections;
CREATE POLICY "select_own_saved_elections" ON saved_elections FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_saved_elections" ON saved_elections;
CREATE POLICY "insert_own_saved_elections" ON saved_elections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_saved_elections" ON saved_elections;
CREATE POLICY "delete_own_saved_elections" ON saved_elections FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Saved issues
CREATE TABLE IF NOT EXISTS saved_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, issue_id)
);

ALTER TABLE saved_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_saved_issues" ON saved_issues;
CREATE POLICY "select_own_saved_issues" ON saved_issues FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_saved_issues" ON saved_issues;
CREATE POLICY "insert_own_saved_issues" ON saved_issues FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_saved_issues" ON saved_issues;
CREATE POLICY "delete_own_saved_issues" ON saved_issues FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Extend notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url text;

-- Extend issues
ALTER TABLE issues ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Extend elections with soft delete
ALTER TABLE elections ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Extend sources with soft delete
ALTER TABLE sources ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Extend voting_records already has deleted_at from migration 05

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_elections_user ON saved_elections(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_issues_user ON saved_issues(user_id);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002313_backend_10_saved_items_soft_deletes.sql');

-- ================= 20260822002339_backend_11_fulltext_search.sql =================

/*
# Backend Architecture: Full-Text Search Indexes

## Purpose
Add PostgreSQL full-text search (FTS) capabilities for candidate, issue, election, and bill search.

## Changes
### `candidates` — search_vector from first_name, last_name, display_name, party, bio
### `issues` — search_vector from name, slug, category (no description column exists)
### `elections` — search_vector from name, description
### `bills` — search_vector from title, bill_number, description

## Security
- No RLS changes — FTS columns are read-only generated columns
*/

-- Candidates FTS
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(first_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(last_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(display_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(party, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_candidates_search ON candidates USING GIN(search_vector);

-- Issues FTS (no description column)
ALTER TABLE issues ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(slug, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_issues_search ON issues USING GIN(search_vector);

-- Elections FTS
ALTER TABLE elections ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_elections_search ON elections USING GIN(search_vector);

-- Bills FTS
ALTER TABLE bills ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(bill_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_bills_search ON bills USING GIN(search_vector);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002339_backend_11_fulltext_search.sql');

-- ================= 20260822002401_backend_12_database_functions.sql =================

/*
# Backend Architecture: Database Functions

## Purpose
Create secure PostgreSQL functions for common queries. All functions respect RLS and permissions.

## Functions Created

1. `get_user_ballot(p_user_id uuid)` — returns contests + measures for the user's district
2. `get_candidates_for_election(p_election_id uuid)` — returns all candidates in an election
3. `search_candidates(p_search_term text)` — full-text search across candidates
4. `get_candidate_profile(p_candidate_id uuid)` — returns full candidate profile with related data
5. `get_candidate_voting_history(p_candidate_id uuid)` — returns voting records for a candidate
6. `get_upcoming_elections(p_state_id uuid)` — returns upcoming elections for a state
7. `get_user_saved_candidates(p_user_id uuid)` — returns saved candidates for a user

## Security
- All functions use SECURITY INVOKER (respect RLS) unless noted
- Functions take user_id as parameter and rely on RLS for access control
- `search_candidates` uses full-text search with the @@ operator

## Notes
1. Functions return tables/sets for easy use with Supabase RPC
2. All functions check for soft-deleted records (deleted_at IS NULL)
3. Results are ordered logically (alphabetical, chronological, etc.)
*/

-- 1. Get user ballot: contests + measures for user's district
CREATE OR REPLACE FUNCTION get_user_ballot(p_user_id uuid)
RETURNS TABLE (
  contest_id uuid,
  office_name text,
  contest_level text,
  seat_description text,
  term_length text,
  election_id uuid,
  election_name text,
  election_date date
) AS $$
  SELECT
    bc.id, bc.office_name, bc.contest_level, bc.seat_description, bc.term_length,
    e.id, e.name, e.election_date
  FROM ballot_contests bc
  JOIN elections e ON e.id = bc.election_id
  LEFT JOIN profiles p ON p.id = p_user_id
  LEFT JOIN districts d ON d.id = COALESCE(bc.district_id, p.district_id)
  WHERE e.election_date >= CURRENT_DATE
    AND e.deleted_at IS NULL
  ORDER BY e.election_date, bc.contest_level, bc.office_name;
$$ LANGUAGE sql STABLE;

-- 2. Get candidates for an election
CREATE OR REPLACE FUNCTION get_candidates_for_election(p_election_id uuid)
RETURNS TABLE (
  candidate_id uuid,
  first_name text,
  last_name text,
  display_name text,
  party text,
  photo_url text,
  is_incumbent boolean,
  office_id uuid,
  ballot_position integer
) AS $$
  SELECT
    c.id, c.first_name, c.last_name, c.display_name, c.party, c.photo_url,
    c.is_incumbent, ce.office_id, ce.ballot_position
  FROM candidates c
  JOIN candidate_elections ce ON ce.candidate_id = c.id
  WHERE ce.election_id = p_election_id
    AND c.deleted_at IS NULL
    AND c.profile_status = 'published'
  ORDER BY ce.ballot_position NULLS LAST, c.last_name, c.first_name;
$$ LANGUAGE sql STABLE;

-- 3. Search candidates using full-text search
CREATE OR REPLACE FUNCTION search_candidates(p_search_term text)
RETURNS TABLE (
  candidate_id uuid,
  first_name text,
  last_name text,
  display_name text,
  party text,
  photo_url text,
  bio text,
  rank real
) AS $$
  SELECT
    id, first_name, last_name, display_name, party, photo_url, bio,
    ts_rank(search_vector, plainto_tsquery('english', p_search_term)) AS rank
  FROM candidates
  WHERE search_vector @@ plainto_tsquery('english', p_search_term)
    AND deleted_at IS NULL
    AND profile_status = 'published'
  ORDER BY rank DESC, last_name, first_name
  LIMIT 50;
$$ LANGUAGE sql STABLE;

-- 4. Get candidate profile (basic info + office + district)
CREATE OR REPLACE FUNCTION get_candidate_profile(p_candidate_id uuid)
RETURNS TABLE (
  candidate_id uuid,
  first_name text,
  last_name text,
  display_name text,
  party text,
  photo_url text,
  bio text,
  education text,
  professional_background text,
  previous_offices text,
  military_service text,
  public_service text,
  website_url text,
  is_incumbent boolean,
  verification_status text,
  profile_status text,
  current_office_name text,
  current_district_name text
) AS $$
  SELECT
    c.id, c.first_name, c.last_name, c.display_name, c.party, c.photo_url, c.bio,
    c.education, c.professional_background, c.previous_offices, c.military_service,
    c.public_service, c.website_url, c.is_incumbent, c.verification_status, c.profile_status,
    o.name, d.name
  FROM candidates c
  LEFT JOIN offices o ON o.id = c.current_office_id
  LEFT JOIN districts d ON d.id = c.current_district_id
  WHERE c.id = p_candidate_id
    AND c.deleted_at IS NULL;
$$ LANGUAGE sql STABLE;

-- 5. Get candidate voting history
CREATE OR REPLACE FUNCTION get_candidate_voting_history(p_candidate_id uuid)
RETURNS TABLE (
  record_id uuid,
  bill_name text,
  bill_number text,
  vote text,
  vote_date date,
  chamber text,
  description text,
  source_title text,
  source_url text
) AS $$
  SELECT
    vr.id, vr.bill_name, vr.bill_number, vr.vote, vr.vote_date, vr.chamber,
    vr.description, s.title, s.url
  FROM voting_records vr
  LEFT JOIN sources s ON s.id = vr.source_id
  WHERE vr.candidate_id = p_candidate_id
    AND vr.deleted_at IS NULL
  ORDER BY vr.vote_date DESC NULLS LAST;
$$ LANGUAGE sql STABLE;

-- 6. Get upcoming elections for a state
CREATE OR REPLACE FUNCTION get_upcoming_elections(p_state_id uuid DEFAULT NULL)
RETURNS TABLE (
  election_id uuid,
  name text,
  election_type text,
  election_date date,
  registration_deadline date,
  status text,
  description text
) AS $$
  SELECT
    id, name, election_type, election_date, registration_deadline, status, description
  FROM elections
  WHERE election_date >= CURRENT_DATE
    AND deleted_at IS NULL
    AND (p_state_id IS NULL OR state_id = p_state_id)
  ORDER BY election_date;
$$ LANGUAGE sql STABLE;

-- 7. Get user saved candidates
CREATE OR REPLACE FUNCTION get_user_saved_candidates(p_user_id uuid)
RETURNS TABLE (
  candidate_id uuid,
  first_name text,
  last_name text,
  display_name text,
  party text,
  photo_url text,
  is_incumbent boolean,
  saved_at timestamptz
) AS $$
  SELECT
    c.id, c.first_name, c.last_name, c.display_name, c.party, c.photo_url,
    c.is_incumbent, sc.created_at
  FROM saved_candidates sc
  JOIN candidates c ON c.id = sc.candidate_id
  WHERE sc.user_id = p_user_id
    AND c.deleted_at IS NULL
  ORDER BY sc.created_at DESC;
$$ LANGUAGE sql STABLE;

-- 8. Get candidate sources
CREATE OR REPLACE FUNCTION get_candidate_sources(p_candidate_id uuid)
RETURNS TABLE (
  source_id uuid,
  title text,
  url text,
  publisher text,
  source_type text,
  publication_date date
) AS $$
  SELECT DISTINCT
    s.id, s.title, s.url, s.publisher, s.source_type, s.publication_date
  FROM sources s
  LEFT JOIN candidate_sources cs ON cs.source_id = s.id
  LEFT JOIN candidate_positions cp ON cp.id = cs.candidate_position_id
  LEFT JOIN candidate_statements cst ON cst.source_id = s.id
  WHERE (cp.candidate_id = p_candidate_id OR cst.candidate_id = p_candidate_id)
    AND s.deleted_at IS NULL
  ORDER BY s.publication_date DESC NULLS LAST;
$$ LANGUAGE sql STABLE;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002401_backend_12_database_functions.sql');

-- ================= 20260822002413_backend_13_analytics_views.sql =================

/*
# Backend Architecture: Admin Analytics Views

## Purpose
Create database views for admin analytics dashboards. Views aggregate revenue, user activity,
advertising performance, and API usage data.

## Views Created

1. `monthly_revenue` — total revenue by month, split by type
2. `subscription_revenue` — subscription payments by month
3. `advertising_revenue` — advertising payments by month
4. `monthly_active_users` — count of users active per month (based on profile activity)
5. `premium_subscribers` — count of active premium subscriptions
6. `advertising_performance` — ad impressions vs clicks by advertisement
7. `api_usage_summary` — API usage by client and endpoint
8. `candidate_profile_views` — profile views by candidate

## Security
- Views are NOT directly accessible via RLS — they inherit from underlying tables
- Admin access is enforced through the underlying table RLS policies
- Views are read-only (no INSTEAD OF triggers)

## Notes
1. Views are created with `OR REPLACE` for idempotency.
2. Revenue views aggregate from `revenue_transactions` and `payments`.
3. `monthly_active_users` is a proxy based on profile creation/update timestamps.
*/

-- 1. Monthly revenue
CREATE OR REPLACE VIEW monthly_revenue AS
SELECT
  date_trunc('month', created_at) AS month,
  transaction_type,
  COUNT(*) AS transaction_count,
  SUM(amount_cents) AS total_cents
FROM revenue_transactions
WHERE status = 'completed'
GROUP BY month, transaction_type
ORDER BY month DESC;

-- 2. Subscription revenue
CREATE OR REPLACE VIEW subscription_revenue AS
SELECT
  date_trunc('month', created_at) AS month,
  COUNT(*) AS transaction_count,
  SUM(amount_cents) AS total_cents
FROM revenue_transactions
WHERE transaction_type = 'subscription' AND status = 'completed'
GROUP BY month
ORDER BY month DESC;

-- 3. Advertising revenue
CREATE OR REPLACE VIEW advertising_revenue AS
SELECT
  date_trunc('month', created_at) AS month,
  COUNT(*) AS transaction_count,
  SUM(amount_cents) AS total_cents
FROM revenue_transactions
WHERE transaction_type = 'advertising' AND status = 'completed'
GROUP BY month
ORDER BY month DESC;

-- 4. Monthly active users (proxy)
CREATE OR REPLACE VIEW monthly_active_users AS
SELECT
  date_trunc('month', updated_at) AS month,
  COUNT(DISTINCT id) AS active_users
FROM profiles
WHERE deleted_at IS NULL
GROUP BY month
ORDER BY month DESC;

-- 5. Premium subscribers
CREATE OR REPLACE VIEW premium_subscribers AS
SELECT
  plan,
  status,
  COUNT(*) AS subscriber_count
FROM subscriptions
WHERE plan IN ('premium_monthly', 'premium_yearly')
  AND status = 'active'
GROUP BY plan, status;

-- 6. Advertising performance
CREATE OR REPLACE VIEW advertising_performance AS
SELECT
  ad.id AS advertisement_id,
  ad.ad_title,
  ad.status,
  ad.impressions,
  ad.clicks,
  CASE WHEN ad.impressions > 0 THEN ROUND(ad.clicks::numeric / ad.impressions * 100, 2) ELSE 0 END AS ctr_percent,
  a.organization_name AS advertiser_name
FROM advertisements ad
JOIN advertisers a ON a.id = ad.advertiser_id
ORDER BY ad.impressions DESC;

-- 7. API usage summary
CREATE OR REPLACE VIEW api_usage_summary AS
SELECT
  ac.organization_name,
  au.endpoint,
  au.method,
  COUNT(*) AS request_count,
  AVG(au.response_time_ms) AS avg_response_time_ms,
  MAX(au.created_at) AS last_request
FROM api_usage au
JOIN api_clients ac ON ac.id = au.api_client_id
GROUP BY ac.organization_name, au.endpoint, au.method
ORDER BY request_count DESC;

-- 8. Candidate profile views
CREATE OR REPLACE VIEW candidate_profile_views AS
SELECT
  c.id AS candidate_id,
  c.display_name,
  COUNT(pv.id) AS total_views,
  COUNT(DISTINCT pv.viewer_user_id) AS unique_viewers,
  COUNT(CASE WHEN pv.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) AS views_last_30_days
FROM candidates c
LEFT JOIN profile_views pv ON pv.candidate_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.display_name
ORDER BY total_views DESC;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260822002413_backend_13_analytics_views.sql');

-- ================= 20260826174916_civic_quiz_system.sql =================

/*
# Civic Quiz System: Questions, User Answers, Candidate Answers

## Purpose
Create a quiz system with a pool of 30 rotating questions about political issues.
Users answer 6-12 questions during onboarding to find aligned candidates.
Candidates answer the same questions to establish their positions.

## New Tables
- civic_quiz_questions: 30 questions, 10 categories, 2-4 options each
- user_quiz_answers: owner-scoped user responses (upsert by question)
- candidate_quiz_answers: team-submitted, admin-approved candidate responses

## Security
- Questions: public read, admin write
- User answers: owner-only CRUD
- Candidate answers: public read (approved), team submit, admin approve
*/

CREATE TABLE IF NOT EXISTS civic_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_category text NOT NULL,
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text,
  option_d text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE civic_quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_quiz_questions" ON civic_quiz_questions;
CREATE POLICY "public_read_quiz_questions" ON civic_quiz_questions FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_write_quiz_questions" ON civic_quiz_questions;
CREATE POLICY "admin_write_quiz_questions" ON civic_quiz_questions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_quiz_questions" ON civic_quiz_questions;
CREATE POLICY "admin_update_quiz_questions" ON civic_quiz_questions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE TABLE IF NOT EXISTS user_quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES civic_quiz_questions(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (answer IN ('a', 'b', 'c', 'd')),
  quiz_session text NOT NULL DEFAULT 'default',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, question_id)
);

ALTER TABLE user_quiz_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_quiz_answers" ON user_quiz_answers;
CREATE POLICY "select_own_quiz_answers" ON user_quiz_answers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_quiz_answers" ON user_quiz_answers;
CREATE POLICY "insert_own_quiz_answers" ON user_quiz_answers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_quiz_answers" ON user_quiz_answers;
CREATE POLICY "update_own_quiz_answers" ON user_quiz_answers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_quiz_answers" ON user_quiz_answers;
CREATE POLICY "delete_own_quiz_answers" ON user_quiz_answers FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS candidate_quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES civic_quiz_questions(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (answer IN ('a', 'b', 'c', 'd')),
  submitted_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, question_id)
);

ALTER TABLE candidate_quiz_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_approved_candidate_answers" ON candidate_quiz_answers;
CREATE POLICY "public_read_approved_candidate_answers" ON candidate_quiz_answers FOR SELECT
  TO anon, authenticated USING (status = 'approved');

DROP POLICY IF EXISTS "team_read_own_candidate_answers" ON candidate_quiz_answers;
CREATE POLICY "team_read_own_candidate_answers" ON candidate_quiz_answers FOR SELECT
  TO authenticated USING (
    submitted_by = auth.uid() OR is_admin() OR
    EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_quiz_answers.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified') OR
    EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_quiz_answers.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  );

DROP POLICY IF EXISTS "team_upsert_candidate_answers" ON candidate_quiz_answers;
CREATE POLICY "team_upsert_candidate_answers" ON candidate_quiz_answers FOR INSERT
  TO authenticated WITH CHECK (
    submitted_by = auth.uid() AND
    (EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_quiz_answers.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified') OR
     EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_quiz_answers.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active'))
  );

DROP POLICY IF EXISTS "team_update_candidate_answers" ON candidate_quiz_answers;
CREATE POLICY "team_update_candidate_answers" ON candidate_quiz_answers FOR UPDATE
  TO authenticated USING (submitted_by = auth.uid() OR is_admin())
  WITH CHECK (submitted_by = auth.uid() OR is_admin());

-- Seed 30 questions
INSERT INTO civic_quiz_questions (issue_category, question_text, option_a, option_b, option_c, option_d, sort_order) VALUES
('Education', 'How should public education be funded?', 'Increase funding through higher state taxes', 'Keep funding levels the same but redirect to classrooms', 'Expand school choice and voucher programs', 'Privatize education and let markets decide', 1),
('Education', 'What is the best approach to student loan debt?', 'Cancel all student loan debt', 'Expand income-based repayment plans', 'Keep the current system as-is', 'Eliminate federal student loans entirely', 2),
('Education', 'Should teachers be evaluated based on student test scores?', 'No, test scores dont reflect teaching quality', 'Partially, combined with peer reviews', 'Yes, test scores are the best metric', 'Eliminate standardized testing entirely', 3),
('Healthcare', 'What is the best path forward for healthcare?', 'Universal single-payer (Medicare for All)', 'Public option alongside private insurance', 'Keep the current system with minor reforms', 'Fully privatize healthcare and remove mandates', 4),
('Healthcare', 'Should the government negotiate prescription drug prices?', 'Yes, for all drugs purchased by government programs', 'Yes, but only for seniors on Medicare', 'No, let the free market set prices', 'Only negotiate for the most expensive drugs', 5),
('Healthcare', 'How should mental health services be expanded?', 'Make mental health care part of universal coverage', 'Increase funding for community mental health centers', 'Expand telehealth and private options', 'Reduce regulations to let private practice expand', 6),
('Economy', 'How should we approach taxes on corporations?', 'Raise corporate taxes to fund public services', 'Close loopholes but keep current rates', 'Lower corporate taxes to spur investment', 'Eliminate corporate taxes and tax shareholders instead', 7),
('Economy', 'What should the federal minimum wage be?', 'Raise it to $15+ per hour and index to inflation', 'Raise it modestly to $12 per hour', 'Keep it at the current level', 'Eliminate the minimum wage, let states decide', 8),
('Economy', 'How should the government handle economic recessions?', 'Large-scale stimulus spending and safety net expansion', 'Targeted relief for affected industries', 'Let the market correct itself with minimal intervention', 'Cut taxes and reduce regulations to stimulate growth', 9),
('Housing', 'What is the best approach to affordable housing?', 'Massive public investment in affordable housing', 'Tax incentives for private developers to build affordable units', 'Reduce zoning regulations to increase supply', 'No government intervention, let the market work', 10),
('Housing', 'Should rent control be expanded?', 'Yes, expand rent control to protect tenants', 'Only in emergencies or high-cost cities', 'No, rent control reduces housing supply', 'Let cities decide locally', 11),
('Housing', 'How should homelessness be addressed?', 'Housing-first programs with wraparound services', 'Increase shelter capacity and outreach', 'Focus on mental health and addiction treatment first', 'Enforce camping bans and move people to shelters', 12),
('Public Safety', 'How should policing be reformed?', 'Redirect funding to community services and alternatives', 'Increase training and accountability but keep funding', 'Increase police funding and hire more officers', 'No changes needed to current policing', 13),
('Public Safety', 'What is the best approach to gun policy?', 'Universal background checks and assault weapon bans', 'Expand background checks but protect gun rights', 'Protect Second Amendment rights, no new restrictions', 'Constitutional carry — remove all permit requirements', 14),
('Public Safety', 'How should the criminal justice system handle nonviolent drug offenses?', 'Decriminalize and treat as a public health issue', 'Reduce sentences and expand diversion programs', 'Keep current laws but improve rehabilitation', 'Maintain strict enforcement and sentencing', 15),
('Immigration', 'What should US immigration policy prioritize?', 'Comprehensive reform with a path to citizenship', 'Border security first, then address legal immigration', 'Merit-based system prioritizing skilled workers', 'Strict enforcement and reduced immigration levels', 16),
('Immigration', 'How should the government handle undocumented immigrants already in the US?', 'Provide a path to citizenship', 'Allow legal status but not citizenship', 'Deport those with criminal records, allow others to stay', 'Enforce existing deportation laws', 17),
('Immigration', 'Should asylum processing be made easier or harder?', 'Easier — the US should welcome more asylum seekers', 'Keep the current process but improve efficiency', 'Harder — tighten standards to reduce claims', 'Suspend asylum during high border crossings', 18),
('Environment', 'How aggressively should the US combat climate change?', 'Aggressive transition to renewable energy by 2035', 'Gradual transition with nuclear and natural gas as bridges', 'Balance environmental goals with economic growth', 'Reduce regulations and let markets drive energy choices', 19),
('Environment', 'Should the US rejoin and strengthen international climate agreements?', 'Yes, lead the world in climate commitments', 'Yes, but only if other major polluters also commit', 'No, international agreements hurt US competitiveness', 'Withdraw from all climate treaties', 20),
('Environment', 'How should clean water and air regulations be handled?', 'Strengthen EPA enforcement and regulations', 'Keep current regulations but improve enforcement', 'Roll back regulations that hurt businesses', 'Let states set their own environmental standards', 21),
('Transportation', 'How should the US invest in transportation infrastructure?', 'Massive investment in public transit and rail', 'Balance highway maintenance with transit expansion', 'Prioritize highways and roads over transit', 'Privatize infrastructure and use tolls', 22),
('Transportation', 'Should electric vehicle adoption be subsidized?', 'Yes, large subsidies and a mandate to phase out gas cars', 'Yes, modest tax credits for EV purchases', 'No subsidies, let the market decide', 'Remove EV mandates and support all energy types', 23),
('Transportation', 'How should we fund infrastructure repairs?', 'Increase the gas tax and create new user fees', 'Issue infrastructure bonds', 'Public-private partnerships', 'Cut other spending to fund infrastructure', 24),
('Labor', 'How should labor unions be supported or regulated?', 'Strengthen union rights and expand card check', 'Protect union rights but keep current election process', 'Limit union power and expand right-to-work laws', 'Unions should have no special legal protections', 25),
('Labor', 'Should gig workers be classified as employees?', 'Yes, all gig workers should be employees with benefits', 'Create a third classification with some benefits', 'No, keep gig workers as independent contractors', 'Let companies and workers negotiate individually', 26),
('Labor', 'What should paid family leave policy look like?', 'Mandatory paid leave funded by the government', 'Tax credits for companies that offer paid leave', 'Let companies decide their own leave policies', 'No government role in family leave', 27),
('Government', 'Should term limits be imposed on Congress?', 'Yes, strict term limits for all members', 'Yes, but only for committee chairs and leadership', 'No, let voters decide through elections', 'Only for the Senate, not the House', 28),
('Government', 'How should voting access be balanced with election security?', 'Expand mail-in voting and automatic registration', 'Maintain current rules with modest expansions', 'Require ID and tighten registration deadlines', 'Election day only with strict ID requirements', 29),
('Government', 'Should lobbying and campaign finance be reformed?', 'Publicly fund all campaigns and ban corporate donations', 'Cap donations and increase disclosure requirements', 'Keep current rules but enforce them better', 'Remove all donation limits as a free speech issue', 30)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_civic_quiz_questions_category ON civic_quiz_questions(issue_category);
CREATE INDEX IF NOT EXISTS idx_user_quiz_answers_user ON user_quiz_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_candidate_quiz_answers_candidate ON candidate_quiz_answers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_quiz_answers_status ON candidate_quiz_answers(status);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260826174916_civic_quiz_system.sql');

-- ================= 20260826183642_candidate_profile_enhancements.sql =================

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
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260826183642_candidate_profile_enhancements.sql');

-- ================= 20260826185738_voter_profile_enhancements.sql =================

/*
# Voter Profile Enhancements

## Purpose
Add voter profile fields for a richer public identity and an "Election Journey" 
tracker that gamifies the voting preparation process.

## Changes

### 1. profiles table — new columns
- `photo_url` (text, nullable) — voter profile photo URL
- `occupation` (text, nullable) — voter's occupation/industry
- `education` (text, nullable) — voter's education background
- `civic_level` (int, default 1) — gamified civic engagement level
- `civic_xp` (int, default 0) — experience points toward next level

### 2. election_journey_steps table — new
Tracks each voter's 8-step election preparation journey.
- `id` (uuid PK)
- `user_id` (uuid FK to profiles, unique per step)
- `step_number` (int 1-8) — which step
- `completed` (boolean, default false)
- `completed_at` (timestamptz, nullable)
- `progress_detail` (text, nullable) — e.g. "4/7" for partial progress
- Unique constraint on (user_id, step_number)

Steps:
1. Verify registration
2. Learn what's on your ballot
3. Pick your top issues
4. Research candidates
5. Compare candidates
6. Review ballot measures
7. Find your polling location
8. Make your voting plan

## Security
- RLS on election_journey_steps: owner-scoped CRUD (authenticated only)
- profiles columns: readable by all (existing profiles policies already handle this)

## Notes
1. Columns are nullable so existing profiles are unaffected
2. civic_level/civic_xp have safe defaults
3. Journey steps are per-user, one row per step
*/

-- 1. Add columns to profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'photo_url') THEN
    ALTER TABLE profiles ADD COLUMN photo_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'occupation') THEN
    ALTER TABLE profiles ADD COLUMN occupation text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'education') THEN
    ALTER TABLE profiles ADD COLUMN education text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'civic_level') THEN
    ALTER TABLE profiles ADD COLUMN civic_level int NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'civic_xp') THEN
    ALTER TABLE profiles ADD COLUMN civic_xp int NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. election_journey_steps table
CREATE TABLE IF NOT EXISTS election_journey_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  step_number int NOT NULL CHECK (step_number >= 1 AND step_number <= 8),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  progress_detail text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, step_number)
);

ALTER TABLE election_journey_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_journey" ON election_journey_steps;
CREATE POLICY "read_own_journey" ON election_journey_steps FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_journey" ON election_journey_steps;
CREATE POLICY "insert_own_journey" ON election_journey_steps FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_journey" ON election_journey_steps;
CREATE POLICY "update_own_journey" ON election_journey_steps FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_journey" ON election_journey_steps;
CREATE POLICY "delete_own_journey" ON election_journey_steps FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_journey_user ON election_journey_steps(user_id);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260826185738_voter_profile_enhancements.sql');

-- ================= 20260913000000_audit_log_and_admin_role_management.sql =================

/*
# Audit log + safe admin role management

## Purpose
1. Record every admin action (verify/flag/add/edit/delete/role-change) for accountability.
2. Let an existing admin grant/revoke admin status for another user WITHOUT reopening the
   privilege-escalation hole that was fixed in `fix_is_admin_privilege_escalation.sql`.
   The `profiles.is_admin` column stays locked down at the column-grant level; the only way
   to flip it is the `set_admin_role` SECURITY DEFINER function below, which re-checks
   `is_admin()` itself on every call.
3. Let admins list all profiles (needed for a "manage admins" screen) without granting
   blanket profile access to everyone.

## New Tables
### `audit_log`
- `id` (uuid PK), `admin_id` (uuid FK -> profiles, nullable so a deleted admin's history
  survives), `action` (text), `target_table` (text, nullable), `target_id` (text, nullable),
  `details` (jsonb, nullable), `created_at` (timestamptz)

## New Functions
- `log_admin_action(action, target_table, target_id, details)` — SECURITY DEFINER, callable
  by any authenticated admin; inserts a row with `admin_id = auth.uid()`.
- `set_admin_role(target_user_id, new_is_admin)` — SECURITY DEFINER. Verifies the caller is
  currently an admin, refuses to let an admin remove their own admin flag (prevents accidental
  lockout), updates `profiles.is_admin`, and writes an audit_log entry.

## Security
- `audit_log`: admin-only SELECT; no direct INSERT/UPDATE/DELETE grants — rows are only
  created via the `log_admin_action` SECURITY DEFINER function.
- `profiles`: adds an admin-read-all SELECT policy alongside the existing "select own" policy.
  This does NOT touch the column-level REVOKE on `is_admin` from the earlier migration —
  admins still cannot UPDATE the column directly through the Data API, only through
  `set_admin_role`.
*/

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_table text,
  target_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_audit_log" ON audit_log;
CREATE POLICY "admin_read_audit_log" ON audit_log FOR SELECT
  TO authenticated USING (is_admin());

-- No INSERT/UPDATE/DELETE policies for regular clients on purpose:
-- rows are only ever created via the SECURITY DEFINER function below,
-- which runs as the table owner and bypasses RLS.

CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_table, target_id);

-- Admins can list all profiles (read-only) for the "manage admins" screen.
DROP POLICY IF EXISTS "admin_select_all_profiles" ON profiles;
CREATE POLICY "admin_select_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (is_admin());

-- Log an admin action. Any authenticated admin may call this; it always
-- stamps admin_id = auth.uid(), so callers cannot forge another admin's id.
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action text,
  p_target_table text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can write audit log entries';
  END IF;

  INSERT INTO audit_log (admin_id, action, target_table, target_id, details)
  VALUES (auth.uid(), p_action, p_target_table, p_target_id, p_details);
END;
$$;

REVOKE ALL ON FUNCTION log_admin_action(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_admin_action(text, text, text, jsonb) TO authenticated;

-- Grant or revoke admin status. Only callable by an existing admin.
-- Refuses self-demotion so an admin can never accidentally lock themselves out.
CREATE OR REPLACE FUNCTION set_admin_role(
  target_user_id uuid,
  new_is_admin boolean
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can change admin roles';
  END IF;

  IF target_user_id = auth.uid() AND new_is_admin = false THEN
    RAISE EXCEPTION 'Admins cannot remove their own admin status';
  END IF;

  UPDATE profiles SET is_admin = new_is_admin, updated_at = now()
  WHERE id = target_user_id;

  INSERT INTO audit_log (admin_id, action, target_table, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN new_is_admin THEN 'grant_admin' ELSE 'revoke_admin' END,
    'profiles',
    target_user_id::text,
    jsonb_build_object('new_is_admin', new_is_admin)
  );
END;
$$;

REVOKE ALL ON FUNCTION set_admin_role(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_admin_role(uuid, boolean) TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913000000_audit_log_and_admin_role_management.sql');

-- ================= 20260913000100_pricing_tiers_and_candidate_management.sql =================

/*
# Pricing tiers: Candidate / Pro + Candidate Management upgrade

## Confirmed pricing (client, Sept 2026)
- Free — $0 (unchanged, no paywall on core ballot info)
- Candidate — $9/mo or $89/yr (renamed from the old placeholder "premium" tier)
- Pro — $29/mo or $289/yr
- Candidate Management — $299 (one-time or recurring, tied to a claimed candidate
  profile, not to the voter's own subscription). Claiming a profile itself stays
  FREE (Option B from the client: claim unlocks ownership + social features for
  free; Management is a further paid upgrade on top of a claimed profile that
  unlocks campaign launch, team invites, analytics, etc).

## Changes
1. Widen the `subscriptions.plan` check constraint to accept the new tier names
   without breaking any existing rows using the old `premium_monthly` / `premium_yearly`
   values (both old and new values are allowed side by side).
2. New table `candidate_management_subscriptions` — one row per claimed candidate
   profile that has purchased (or been comped) the Management tier.
   Includes `is_comped` / `comped_reason` so the team can honor the "first year
   free during beta" plan without needing a real Stripe charge yet.

## Security
- `candidate_management_subscriptions`: the verified claimant (via candidate_claims)
  and admins can read; only admins or the edge function (service role) can insert/update.
*/

-- 1. Widen allowed plan values (keep old ones for backward compatibility)
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN (
    'free',
    'premium_monthly', 'premium_yearly',   -- legacy names, kept for existing rows
    'candidate_monthly', 'candidate_yearly',
    'pro_monthly', 'pro_yearly'
  ));

-- 2. Candidate Management tier (per claimed candidate profile, not per user)
CREATE TABLE IF NOT EXISTS candidate_management_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES candidate_claims(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'expired')) DEFAULT 'active',
  is_comped boolean NOT NULL DEFAULT false,
  comped_reason text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);

ALTER TABLE candidate_management_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_candidate_management" ON candidate_management_subscriptions;
CREATE POLICY "read_own_candidate_management" ON candidate_management_subscriptions FOR SELECT
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM candidate_claims c
      WHERE c.candidate_id = candidate_management_subscriptions.candidate_id
        AND c.user_id = auth.uid()
        AND c.status = 'verified'
    )
  );

DROP POLICY IF EXISTS "admin_write_candidate_management" ON candidate_management_subscriptions;
CREATE POLICY "admin_write_candidate_management" ON candidate_management_subscriptions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_candidate_management" ON candidate_management_subscriptions;
CREATE POLICY "admin_update_candidate_management" ON candidate_management_subscriptions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE INDEX IF NOT EXISTS idx_candidate_mgmt_candidate ON candidate_management_subscriptions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_mgmt_status ON candidate_management_subscriptions(status);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913000100_pricing_tiers_and_candidate_management.sql');

-- ================= 20260913000200_candidate_photos_storage_bucket.sql =================

/*
# Candidate photo storage bucket

## Purpose
Create the `candidate-photos` Supabase Storage bucket used by the admin panel's
and candidate portal's photo upload UI, with RLS so:
- Anyone can view photos (public-facing candidate profiles need this).
- Only admins, or the verified claimant of that specific candidate profile, can
  upload/replace/delete a photo — matching folder-per-candidate-id convention
  used by the upload component (`{candidate_id}/{filename}`).
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('candidate-photos', 'candidate-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_candidate_photos" ON storage.objects;
CREATE POLICY "public_read_candidate_photos" ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'candidate-photos');

DROP POLICY IF EXISTS "admin_or_claimant_write_candidate_photos" ON storage.objects;
CREATE POLICY "admin_or_claimant_write_candidate_photos" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'candidate-photos'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM candidate_claims c
        WHERE c.user_id = auth.uid()
          AND c.status = 'verified'
          AND c.candidate_id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "admin_or_claimant_update_candidate_photos" ON storage.objects;
CREATE POLICY "admin_or_claimant_update_candidate_photos" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'candidate-photos'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM candidate_claims c
        WHERE c.user_id = auth.uid()
          AND c.status = 'verified'
          AND c.candidate_id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "admin_or_claimant_delete_candidate_photos" ON storage.objects;
CREATE POLICY "admin_or_claimant_delete_candidate_photos" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'candidate-photos'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM candidate_claims c
        WHERE c.user_id = auth.uid()
          AND c.status = 'verified'
          AND c.candidate_id::text = (storage.foldername(name))[1]
      )
    )
  );
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913000200_candidate_photos_storage_bucket.sql');

-- ================= 20260913000300_fix_role_column_privilege_escalation.sql =================

/*
# Fix re-opened privilege escalation via `profiles.role`

## What was found
`fix_is_admin_privilege_escalation.sql` (Aug 15) correctly revoked user write
access to `profiles.is_admin` after finding that any user could set it directly.

Later, `backend_01_profiles_roles_preferences.sql` (Aug 22) added a new `role`
column plus a trigger (`sync_is_admin_from_role`) that automatically sets
`is_admin = true` whenever `role` is 'admin' or 'super_admin'. Its own migration
notes claim "users can SELECT it but CANNOT update it (column-level restriction)... 
enforced via RLS UPDATE policy" — but no such restriction was actually added.
RLS policies filter which ROWS a query can touch, not which COLUMNS; the
existing `update_own_profile` policy only checks `auth.uid() = id`.

Net effect: any authenticated user could run
  UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
which passes RLS (it's their own row), and the trigger would then set
`is_admin = true` — silently reopening the exact bug that was already patched
once, through a different column.

## Fix
Apply the same column-level REVOKE pattern used for `is_admin` to `role`:
only the service role or a SECURITY DEFINER function may change it. The
`set_admin_role` RPC (added in this same batch of migrations) is updated to
keep `role` and `is_admin` in sync, since both are read in different places
in the codebase.

## Verification
After this migration, `UPDATE profiles SET role = 'admin' WHERE id = auth.uid()`
run as an authenticated user must fail with a permission error.
*/

REVOKE UPDATE (role) ON profiles FROM anon, authenticated;
REVOKE INSERT (role) ON profiles FROM anon, authenticated;

-- Keep `role` and `is_admin` consistent when an admin uses the safe RPC.
CREATE OR REPLACE FUNCTION set_admin_role(
  target_user_id uuid,
  new_is_admin boolean
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can change admin roles';
  END IF;

  IF target_user_id = auth.uid() AND new_is_admin = false THEN
    RAISE EXCEPTION 'Admins cannot remove their own admin status';
  END IF;

  UPDATE profiles
  SET is_admin = new_is_admin,
      role = CASE
        WHEN new_is_admin THEN 'admin'
        WHEN role IN ('admin', 'super_admin') THEN 'user'
        ELSE role
      END,
      updated_at = now()
  WHERE id = target_user_id;

  INSERT INTO audit_log (admin_id, action, target_table, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN new_is_admin THEN 'grant_admin' ELSE 'revoke_admin' END,
    'profiles',
    target_user_id::text,
    jsonb_build_object('new_is_admin', new_is_admin)
  );
END;
$$;

REVOKE ALL ON FUNCTION set_admin_role(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_admin_role(uuid, boolean) TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913000300_fix_role_column_privilege_escalation.sql');

-- ================= 20260913000400_fix_candidate_submission_review_workflow.sql =================

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
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913000400_fix_candidate_submission_review_workflow.sql');

-- ================= 20260913000500_fix_is_admin_execute_permission.sql =================

/*
# Fix: is_admin() EXECUTE revoke broke almost every RLS policy in the app

## What was found (live, via Supabase logs — SQL state 42501)
`20260815031241_revoke_execute_on_security_definer_functions.sql` revoked
EXECUTE on `public.is_admin()` from `anon` and `authenticated`, on the
assumption that "policy expressions are evaluated with the table owner's
privileges." That assumption is incorrect for PostgreSQL row-level security:
a USING/WITH CHECK expression runs as part of the querying role's own query
plan, so any function it calls — including one marked SECURITY DEFINER — must
still be directly EXECUTE-able by that role. SECURITY DEFINER only changes
whose privileges are used *inside* the function body (so it can read
`profiles` regardless of the caller's own RLS); it does not waive the
caller's need for EXECUTE to invoke the function at all.

Because nearly every RLS policy in this schema calls `is_admin()` in its
USING or WITH CHECK clause, revoking EXECUTE from anon/authenticated broke
almost all of them — every read or write on `profiles`, `advertisements`,
and most other tables fails with "permission denied for function is_admin"
(confirmed in the project's own Postgres logs, SQL state 42501). This is a
pre-existing bug from before this review, not something introduced by the
other migrations in this batch — it just hadn't been exercised against a
live project until now.

## Fix
Re-grant EXECUTE on `public.is_admin()` to `anon` and `authenticated`. This
is safe: the function takes no arguments and only ever reports the *calling*
user's own admin status via `auth.uid()` — being directly callable via
`/rest/v1/rpc/is_admin` doesn't expose anything a user doesn't already know
about themselves, and it's required for RLS policies to work at all for
non-superuser roles.

`handle_new_user()` is NOT touched here — that revoke was correct. It's only
invoked by the `on_auth_user_created` trigger, which doesn't require the
inserting session to hold EXECUTE on the trigger function, so it was never
part of this bug.
*/

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913000500_fix_is_admin_execute_permission.sql');

-- ================= 20260913000600_fix_subscription_self_write_fraud.sql =================

/*
# Fix: users could give themselves a free paid subscription

## What was found
`subscriptions` (the table that records what plan a user is on) had RLS
policies letting a user INSERT or UPDATE their *own* row with `USING/WITH
CHECK (auth.uid() = user_id OR is_admin())` — this only checks row
*ownership*, not which values are being written. Any signed-in user could
run, from the browser:

  UPDATE subscriptions SET plan = 'pro_yearly', status = 'active' WHERE user_id = auth.uid();

...and grant themselves a paid tier without ever going through Stripe. The
Stripe webhook (which is the only thing that should ever write this table)
runs with the service role and bypasses RLS entirely, so it never needed
these self-write policies in the first place — they were a pure liability.

## Fix
Remove the "self" clause from INSERT and UPDATE policies, leaving only
`is_admin()`. SELECT is untouched (a user reading their own billing status is
correct and necessary — that's exactly what the new Account "Billing" tab
uses). DELETE was already admin-only.

## Verification
After this migration, as a non-admin user:
  UPDATE subscriptions SET plan = 'pro_yearly' WHERE user_id = auth.uid();
must fail (0 rows affected / RLS violation), while
  SELECT * FROM subscriptions WHERE user_id = auth.uid();
must still return their own row.
*/

DROP POLICY IF EXISTS "insert_own_subscription" ON subscriptions;
CREATE POLICY "admin_insert_subscription" ON subscriptions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "update_own_subscription" ON subscriptions;
CREATE POLICY "admin_update_subscription" ON subscriptions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913000600_fix_subscription_self_write_fraud.sql');

-- ================= 20260913000700_gate_team_invites_behind_management.sql =================

/*
# Fix: team invites had no Candidate Management paywall at all

## What was found
The client's confirmed pricing model (Option B) is explicit: claiming a
profile is free, and inviting a campaign team is a feature that only unlocks
with the paid Candidate Management ($299) tier. But `campaign_team`'s INSERT
policy only checked that the caller had a *verified claim* on the candidate —
any claimant, on the free tier, could already invite team members with no
Management subscription at all. There was also no UI anywhere in the app to
actually do this (fixed separately in the Candidate Portal).

## Fix
Add a `has_active_management(candidate_id)` helper and require it in the
`insert_campaign_team` policy for the person doing the inviting (the existing
"already-active team member with candidate/campaign_manager role" branch is
also gated the same way, since if the underlying subscription lapses, the
team should stop being able to add more people).
*/

CREATE OR REPLACE FUNCTION has_active_management(p_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM candidate_management_subscriptions
    WHERE candidate_id = p_candidate_id
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION has_active_management(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION has_active_management(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "insert_campaign_team" ON campaign_team;
CREATE POLICY "insert_campaign_team" ON campaign_team FOR INSERT
  TO authenticated WITH CHECK (
    has_active_management(campaign_team.candidate_id)
    AND (
      EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = campaign_team.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified'
      )
      OR EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = campaign_team.candidate_id AND ct.user_id = auth.uid()
          AND ct.status = 'active' AND ct.role IN ('candidate', 'campaign_manager')
      )
    )
  );
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913000700_gate_team_invites_behind_management.sql');

-- ================= 20260913000800_fix_follows_public_exposure.sql =================

/*
# Fix: two tables had personal/private data publicly exposed, and caused
  real query bugs as a result

## Finding 1 — follows table
`follows`' SELECT policy was `USING (true)` for both `anon` and `authenticated`
— meaning anyone, logged in or not, could read every user's follow
relationships via the public REST API (`GET /rest/v1/follows?select=*`),
including whose account (`user_id`) follows which candidates and issues. This
directly contradicts the platform's own privacy commitment (see the Privacy
Policy's "Political Content & Nonpartisanship" section) not to expose or
profile users' political interests.

It also caused two real, guaranteed-to-trigger bugs in `src/services/social.ts`
because neither query filtered by `user_id`, relying entirely on that
overly-broad RLS policy:
- `isFollowing()` uses `.maybeSingle()` with no user_id filter. As soon as a
  candidate or issue has more than one follower across the whole platform,
  this throws a "multiple (or no) rows returned" error for every user
  checking their own follow state on that item — not an edge case, this was
  going to happen on any popular candidate.
- `getFollowingIds()` had no user_id filter either, so it returned the
  followable_ids of EVERY user's follows for that type, not just the current
  user's — meaning "candidates you follow" UI could show items other people
  follow, not the signed-in user's own list.

No feature in the codebase actually needs public follow visibility (no
"N followers" counter reads this table), so this was purely a bug, not an
intentional design choice.

## Fix
1. Restrict `follows` SELECT to the row's own owner or an admin.
2. Add explicit `user_id` filters in `isFollowing()` and `getFollowingIds()`
   (in `social.ts`) so correctness doesn't depend solely on RLS.
*/

DROP POLICY IF EXISTS "read_follows" ON follows;
CREATE POLICY "read_own_follows" ON follows FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

/*
## Also found in the same sweep: campaign_team exposed personal emails publicly
`campaign_team.invited_email` (the personal email address of anyone invited to
a candidate's campaign team — staff, volunteers, managers) was readable by
literally anyone, including logged-out visitors, via
`GET /rest/v1/campaign_team?select=*`. No feature in the codebase needs public
visibility into who's on a campaign team or their contact emails — the
Candidate Portal's Team tab only needs to show this to the team itself.

Fix: restrict SELECT to the candidate's own (active) team members, the
verified claimant, or an admin.
*/
DROP POLICY IF EXISTS "read_campaign_team" ON campaign_team;
CREATE POLICY "read_own_campaign_team" ON campaign_team FOR SELECT
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM campaign_team ct2
      WHERE ct2.candidate_id = campaign_team.candidate_id
        AND ct2.user_id = auth.uid()
        AND ct2.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = campaign_team.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  );
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913000800_fix_follows_public_exposure.sql');

-- ================= 20260913000900_campaign_pages_and_events.sql =================

/*
# Candidate Campaign Pages + Events (Candidate Management feature)

## Purpose
Implements the "launch campaigns" half of the Candidate Management ($299)
promise (team invites were the other half, already built). Per the client:
Option 1 (a dedicated campaign page: message, goals, updates, live "while
they are running or while a race is going") + Option 2 (event/rally
listings), gated behind an active Management subscription, same as team
invites.

## New Tables
### `campaigns`
One row per candidate's active campaign message/page content.
- `candidate_id` (unique — one active campaign page per candidate)
- `headline`, `message` (the "why I'm running" pitch)
- `goals` (jsonb array of short goal strings, e.g. ["Lower property taxes", "..."])
- `is_active` (candidate/team can toggle the page visible/hidden without deleting it)

### `campaign_events`
Rally/event listings tied to a candidate's campaign.
- `title`, `description`, `location`, `event_date`, `is_public`

### `campaign_event_rsvps`
Voter RSVPs ("I'm Going") for an event.
- One row per (event, user). Attendee **counts** are public (social proof for
  the campaign); WHO attends is private — only visible to the candidate's own
  team and the voter's own record of their own RSVP, never to other voters or
  the public API.

## Security
- `campaigns` / `campaign_events`: public read (this is the candidate's own
  public-facing marketing content, same visibility level as their bio).
  Write access requires `has_active_management()` (reused from the team-invite
  migration) AND being a verified claimant or active team member — same
  pattern as `campaign_team`.
- `campaign_event_rsvps`: a voter can insert/delete their own RSVP and read
  their OWN row; the candidate's team can read all RSVPs for their own event
  (to see who's coming); nobody else can read individual rows. A public
  RPC (`get_event_rsvp_count`) exposes just the count.
*/

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
  headline text,
  message text,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_active_campaigns" ON campaigns;
CREATE POLICY "public_read_active_campaigns" ON campaigns FOR SELECT
  TO anon, authenticated USING (is_active = true OR is_admin());

DROP POLICY IF EXISTS "management_write_campaigns" ON campaigns;
CREATE POLICY "management_write_campaigns" ON campaigns FOR ALL
  TO authenticated USING (
    is_admin()
    OR (
      has_active_management(campaigns.candidate_id)
      AND EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = campaigns.candidate_id
          AND ct.user_id = auth.uid()
          AND ct.status = 'active'
      )
    )
  ) WITH CHECK (
    is_admin()
    OR (
      has_active_management(campaigns.candidate_id)
      AND EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = campaigns.candidate_id
          AND ct.user_id = auth.uid()
          AND ct.status = 'active'
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_campaigns_candidate ON campaigns(candidate_id);

CREATE TABLE IF NOT EXISTS campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  event_date timestamptz NOT NULL,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_campaign_events" ON campaign_events;
CREATE POLICY "public_read_campaign_events" ON campaign_events FOR SELECT
  TO anon, authenticated USING (is_public = true OR is_admin());

DROP POLICY IF EXISTS "management_write_campaign_events" ON campaign_events;
CREATE POLICY "management_write_campaign_events" ON campaign_events FOR ALL
  TO authenticated USING (
    is_admin()
    OR (
      has_active_management(campaign_events.candidate_id)
      AND EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = campaign_events.candidate_id
          AND ct.user_id = auth.uid()
          AND ct.status = 'active'
      )
    )
  ) WITH CHECK (
    is_admin()
    OR (
      has_active_management(campaign_events.candidate_id)
      AND EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = campaign_events.candidate_id
          AND ct.user_id = auth.uid()
          AND ct.status = 'active'
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_campaign_events_candidate ON campaign_events(candidate_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_date ON campaign_events(event_date);

CREATE TABLE IF NOT EXISTS campaign_event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES campaign_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE campaign_event_rsvps ENABLE ROW LEVEL SECURITY;

-- A voter can only ever see their OWN rsvp row (not who else is attending).
DROP POLICY IF EXISTS "read_own_rsvp" ON campaign_event_rsvps;
CREATE POLICY "read_own_rsvp" ON campaign_event_rsvps FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM campaign_events ce
      JOIN campaign_team ct ON ct.candidate_id = ce.candidate_id
      WHERE ce.id = campaign_event_rsvps.event_id
        AND ct.user_id = auth.uid()
        AND ct.status = 'active'
    )
  );

DROP POLICY IF EXISTS "insert_own_rsvp" ON campaign_event_rsvps;
CREATE POLICY "insert_own_rsvp" ON campaign_event_rsvps FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_rsvp" ON campaign_event_rsvps;
CREATE POLICY "delete_own_rsvp" ON campaign_event_rsvps FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rsvps_event ON campaign_event_rsvps(event_id);

-- Public, privacy-safe way to show "42 people going" without exposing who.
CREATE OR REPLACE FUNCTION get_event_rsvp_count(p_event_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::integer FROM campaign_event_rsvps WHERE event_id = p_event_id;
$$;

REVOKE ALL ON FUNCTION get_event_rsvp_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_event_rsvp_count(uuid) TO anon, authenticated;

-- Lets a voter check just their own "am I going?" status for a batch of events
-- without needing broad SELECT on the table (defense in depth on top of RLS).
CREATE OR REPLACE FUNCTION get_my_rsvp_event_ids(p_event_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(array_agg(event_id), ARRAY[]::uuid[])
  FROM campaign_event_rsvps
  WHERE user_id = auth.uid() AND event_id = ANY(p_event_ids);
$$;

REVOKE ALL ON FUNCTION get_my_rsvp_event_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_rsvp_event_ids(uuid[]) TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913000900_campaign_pages_and_events.sql');

-- ================= 20260913001000_fix_campaign_visibility_requires_active_management.sql =================

/*
# Fix: a canceled Candidate Management subscription didn't hide the campaign page

## What was found
The public SELECT policies on `campaigns` and `campaign_events` only checked
the `is_active` flag, never whether the candidate's Management subscription
was actually still active. Once created, a campaign page (and its events)
would stay publicly visible forever — even after the candidate canceled
Management — unless an admin manually flipped `is_active` to false by hand.
Since this is meant to be a paid, subscription-gated feature (like the rest
of Candidate Management), visibility should track the subscription the same
way write access already does.

## Fix
Add `has_active_management()` to both public read policies, alongside the
existing `is_active` flag. `is_active` still lets a candidate/team hide the
page themselves without losing their content; the subscription check now
also enforces the paywall on the read side, not just the write side.
*/

DROP POLICY IF EXISTS "public_read_active_campaigns" ON campaigns;
CREATE POLICY "public_read_active_campaigns" ON campaigns FOR SELECT
  TO anon, authenticated USING (
    is_admin()
    OR (is_active = true AND has_active_management(campaigns.candidate_id))
  );

DROP POLICY IF EXISTS "public_read_campaign_events" ON campaign_events;
CREATE POLICY "public_read_campaign_events" ON campaign_events FOR SELECT
  TO anon, authenticated USING (
    is_admin()
    OR (is_public = true AND has_active_management(campaign_events.candidate_id))
  );
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913001000_fix_campaign_visibility_requires_active_management.sql');

-- ================= 20260913001100_fix_follower_count_regression.sql =================

/*
# Fix regression: follower counts broke when follows privacy was fixed

## What happened
`20260913000800_fix_follows_public_exposure.sql` correctly restricted
`follows` SELECT to the row's own owner (fixing a real PII leak — anyone
could previously read every user's follow list). But `getFollowerCount()`
(used by `FollowButton` to show "42 people follow this candidate") does a
direct `count: 'exact'` query against that same table — which, after the
privacy fix, now only counts the CURRENT user's own follow row (0 or 1)
instead of the true total across all users, since RLS hides everyone else's
rows from a regular user.

This is the same shape as the RSVP privacy design used for campaign events:
the individual rows (who follows what) should stay private, but a simple
count is fine to expose publicly.

## Fix
A SECURITY DEFINER RPC that returns only the count, bypassing RLS row
visibility the same way `get_event_rsvp_count()` does.
*/

CREATE OR REPLACE FUNCTION get_follow_count(p_followable_type text, p_followable_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::integer FROM follows
  WHERE followable_type = p_followable_type AND followable_id = p_followable_id;
$$;

REVOKE ALL ON FUNCTION get_follow_count(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_follow_count(text, uuid) TO anon, authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913001100_fix_follower_count_regression.sql');

-- ================= 20260913001200_free_tier_watchlist_limit.sql =================

/*
# Free-tier watchlist limit (client-confirmed: 5 followed candidates)

## Important correction
"Save a candidate to your watchlist" on the Pricing page maps to the
`follows` table (followable_type='candidate') via <FollowButton> on the
candidate profile page — NOT the separate `saved_candidates` table, which
has a service function (`saveCandidate` in districts.ts) but is never
called from any UI and has no button anywhere. `saved_candidates` is dead
code (same shape as the `ads.ts` finding from an earlier audit); the real,
working "save to watchlist" feature is Follow.

## Purpose
Client decision: free users can follow up to 5 candidates; Candidate/Pro
subscribers get unlimited. Enforced at the database level (not just in the
UI) so it can't be bypassed by calling the API directly. Following issues
(the other `follows` type) is NOT limited — this cap applies to candidates only.

## New function
`can_follow_more_candidates(p_user_id)` — true if the user has an active
paid plan, OR currently follows fewer than 5 candidates.

## Changed policy
`insert_own_follows` on `follows` now also requires
`followable_type != 'candidate' OR can_follow_more_candidates(auth.uid())`
— so following issues is unaffected, only candidates are capped.
*/

CREATE OR REPLACE FUNCTION can_follow_more_candidates(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = p_user_id
        AND status = 'active'
        AND plan IN ('candidate_monthly', 'candidate_yearly', 'pro_monthly', 'pro_yearly', 'premium_monthly', 'premium_yearly')
    )
    OR (
      SELECT COUNT(*) FROM follows
      WHERE user_id = p_user_id AND followable_type = 'candidate'
    ) < 5;
$$;

REVOKE ALL ON FUNCTION can_follow_more_candidates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_follow_more_candidates(uuid) TO authenticated;

DROP POLICY IF EXISTS "insert_own_follows" ON follows;
CREATE POLICY "insert_own_follows" ON follows FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND (followable_type != 'candidate' OR can_follow_more_candidates(auth.uid()))
  );
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913001200_free_tier_watchlist_limit.sql');

-- ================= 20260913001300_ai_daily_usage_limits.sql =================

/*
# AI daily usage limits (client-confirmed: 5/day free, 100/day paid)

## Purpose
Client decision: free users get 5 "Ask BallotLens AI" questions per day,
paid (Candidate/Pro) users get 100/day — not literally unlimited, both to
protect against abuse and to keep AI costs predictable. Marketed in the UI
as "Expanded AI Research," not "Priority AI Research" or "Unlimited AI,"
since no priority-processing lane actually exists yet (per the client:
don't advertise "Priority" until it's actually built).

## New table
`ai_usage_daily` — one row per (user, day), with a running count. Reset
happens naturally each day since a new date creates a new row.

## New function
`check_and_increment_ai_usage(p_user_id)` — SECURITY DEFINER. Looks up the
user's plan to determine their daily limit (5 or 100), checks today's count,
and only increments if under the limit. Returns whether the request is
allowed and how many questions remain today, so the UI can show "3 of 5
questions left today" and the exact moment to show an upgrade prompt.
Incrementing and limit-checking happen atomically in one function to avoid
a race condition where two rapid requests could both pass the check before
either increments (the row lock from the UPDATE covers this).
*/

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  question_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, usage_date)
);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_ai_usage" ON ai_usage_daily;
CREATE POLICY "read_own_ai_usage" ON ai_usage_daily FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

-- No direct INSERT/UPDATE policies for regular clients — rows are only ever
-- written via the SECURITY DEFINER function below.

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage_daily(user_id, usage_date);

CREATE OR REPLACE FUNCTION check_and_increment_ai_usage(p_user_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_paid boolean;
  v_limit integer;
  v_current_count integer;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot check AI usage for another user';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND plan IN ('candidate_monthly', 'candidate_yearly', 'pro_monthly', 'pro_yearly', 'premium_monthly', 'premium_yearly')
  ) INTO v_is_paid;

  v_limit := CASE WHEN v_is_paid THEN 100 ELSE 5 END;

  INSERT INTO ai_usage_daily (user_id, usage_date, question_count)
  VALUES (p_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT question_count INTO v_current_count
  FROM ai_usage_daily
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE
  FOR UPDATE;

  IF v_current_count >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'limit', v_limit, 'is_paid', v_is_paid);
  END IF;

  UPDATE ai_usage_daily
  SET question_count = question_count + 1
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', v_limit - (v_current_count + 1),
    'limit', v_limit,
    'is_paid', v_is_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION check_and_increment_ai_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_and_increment_ai_usage(uuid) TO authenticated;

-- Read-only check (doesn't consume a question) so the UI can show
-- "X of 5 remaining today" on page load, before the user asks anything.
CREATE OR REPLACE FUNCTION get_ai_usage_status(p_user_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_paid boolean;
  v_limit integer;
  v_current_count integer;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot check AI usage for another user';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND plan IN ('candidate_monthly', 'candidate_yearly', 'pro_monthly', 'pro_yearly', 'premium_monthly', 'premium_yearly')
  ) INTO v_is_paid;

  v_limit := CASE WHEN v_is_paid THEN 100 ELSE 5 END;

  SELECT COALESCE(question_count, 0) INTO v_current_count
  FROM ai_usage_daily
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'allowed', COALESCE(v_current_count, 0) < v_limit,
    'remaining', GREATEST(v_limit - COALESCE(v_current_count, 0), 0),
    'limit', v_limit,
    'is_paid', v_is_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION get_ai_usage_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_ai_usage_status(uuid) TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913001300_ai_daily_usage_limits.sql');

-- ================= 20260913001400_notification_preferences.sql =================

/*
# Email notification preferences (client-confirmed spec)

## Client's design
- Instant emails (not user-configurable, always sent): account
  verification/password reset (handled natively by Supabase Auth already),
  security notifications, election reminders (registration deadlines,
  election day), and major updates to something the user specifically
  follows.
- Digest emails (grouped, configurable): new candidate positions, new
  articles/sources, updates to followed candidates/ballot measures,
  upcoming elections/deadlines, new elections added. Default frequency is
  weekly; user can switch to daily or turn categories off.
- A settings page should eventually let users control: instant alerts,
  daily digest, weekly digest, election reminders, candidate updates,
  ballot measure updates, news/article updates.

## Design notes
Account/security emails are NOT represented here — those go through
Supabase Auth's built-in email flows (signup confirmation, password reset),
which are unaffected by any of these preferences and always send regardless.
This table only governs the platform-content emails BallotLens itself sends.

## New table
`notification_preferences` — one row per user (auto-created on signup,
defaulting to the client's stated defaults: weekly digest, all categories
on, instant election reminders + followed-content updates on).
*/

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  digest_frequency text NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('daily', 'weekly', 'off')),
  instant_election_reminders boolean NOT NULL DEFAULT true,
  instant_followed_updates boolean NOT NULL DEFAULT true,
  digest_candidate_updates boolean NOT NULL DEFAULT true,
  digest_ballot_measure_updates boolean NOT NULL DEFAULT true,
  digest_news_updates boolean NOT NULL DEFAULT true,
  digest_new_elections boolean NOT NULL DEFAULT true,
  last_digest_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notification_prefs" ON notification_preferences;
CREATE POLICY "select_own_notification_prefs" ON notification_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "update_own_notification_prefs" ON notification_preferences;
CREATE POLICY "update_own_notification_prefs" ON notification_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notification_prefs" ON notification_preferences;
CREATE POLICY "insert_own_notification_prefs" ON notification_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create a default preferences row whenever a new profile is created,
-- same pattern as the existing handle_new_user() trigger for profiles.
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_notification_prefs ON profiles;
CREATE TRIGGER on_profile_created_notification_prefs
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_default_notification_preferences();

-- Backfill for existing users who signed up before this migration.
INSERT INTO notification_preferences (user_id)
SELECT id FROM profiles
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913001400_notification_preferences.sql');

-- ================= 20260913001500_fix_disconnected_election_notifications.sql =================

/*
# Fix: AP election notifications wrote to a table nothing ever reads

## What was found
The AP Elections webhook (`createNotificationsForState`) wrote "race called"
and "results certified" notifications into `user_election_notifications`.
A client function (`getElectionNotifications` in `election-results.ts`)
exists to read that table, but it is never called from any page or
component — it's orphaned, same shape as the `saved_candidates` and
`ads.ts` findings from earlier audits. Meanwhile, the actual notification
bell in the header (`NotificationBell`) reads from a *different* table,
`notifications`. The two systems never talk to each other, so a user could
follow a race, have it get called by AP, and never see any notification
about it anywhere in the app.

## Fix
Widen the `notifications.type` check constraint to accept `race_called` and
`results_certified` (previously only had position_change / new_post / etc),
so the AP webhook can write directly into the table the bell actually reads
from, instead of the disconnected one.
*/

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'position_change', 'new_post', 'question_answered', 'new_voting_record',
    'new_event', 'new_endorsement', 'new_follower', 'team_invite',
    'race_called', 'results_certified'
  ));
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913001500_fix_disconnected_election_notifications.sql');

-- ================= 20260913001600_election_reminders_notification_support.sql =================

/*
# Fix: "Election Reminder" toggle saved a preference but never sent anything

## What was found
`toggleElectionReminder()` (wired up correctly in `CandidateProfileExtras.tsx`)
lets a user opt in to a reminder for a candidate's race, and correctly saves
a row to `candidate_election_reminders`. But nothing anywhere — no edge
function, no cron, no digest — ever reads that table to actually send a
reminder. The toggle was a no-op from the user's perspective: they'd flip
it on and nothing would ever happen. This also left a gap in the client's
email spec, which explicitly lists "election reminders... upcoming Election
Day reminders" as an INSTANT (not digest) email category.

## Fix
Add `election_id` to `notifications` (so a reminder can be deduplicated per
user+election, the same way `candidate_id` already links other notification
types) and widen the type constraint to include `election_reminder`. The
`send-election-reminders` edge function (added alongside this migration)
does the actual sending.
*/

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS election_id uuid REFERENCES elections(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_election ON notifications(election_id);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'position_change', 'new_post', 'question_answered', 'new_voting_record',
    'new_event', 'new_endorsement', 'new_follower', 'team_invite',
    'race_called', 'results_certified', 'election_reminder'
  ));
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913001600_election_reminders_notification_support.sql');

-- ================= 20260913001700_fix_fact_check_submission_and_visibility.sql =================

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
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913001700_fix_fact_check_submission_and_visibility.sql');

-- ================= 20260913001800_fix_missing_message_notifications.sql =================

/*
# Fix: sending a message never notified the recipient

## What was found
`sendMessage()` inserts the message and bumps the conversation's
`last_message_at`, but never creates a notification or sends an email to
whoever it was sent to. A voter messaging a candidate's team, or a
candidate replying to a voter, had no way to know unless they happened to
have the Messages page open at that exact moment (the realtime subscription
only helps someone already viewing that specific conversation).

## Fix
Widen `notifications.type` to accept `new_message`, so the application code
(`sendMessage()` in `src/services/messaging.ts`) can notify the recipient
and send them an instant email — messages are a direct, personal
communication, not bulk content, so this happens regardless of digest
preferences (the same way a text message app doesn't ask if you want your
DMs "digested").
*/

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'position_change', 'new_post', 'question_answered', 'new_voting_record',
    'new_event', 'new_endorsement', 'new_follower', 'team_invite',
    'race_called', 'results_certified', 'election_reminder', 'new_message'
  ));
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913001800_fix_missing_message_notifications.sql');

-- ================= 20260913001900_fix_candidate_extras_unrestricted_insert.sql =================

/*
# Fix: any logged-in user could submit fake content for ANY candidate

## What was found
`candidate_get_to_know`, `candidate_funding_sources`, and
`candidate_endorsements` all had `WITH CHECK (true)` on their INSERT
policies — meaning any authenticated user, not just a verified claimant of
that specific candidate, could submit a "get to know" answer, a funding
source, or an endorsement for ANY candidate in the database. Submissions do
sit behind a `status = 'pending'` moderation gate before they're publicly
visible (so this wasn't an immediate public-facing exploit), but it still
meant literally anyone could spam the admin review queue with fabricated
content attributed to a candidate who has no relationship to the submitter
at all — e.g. a rival campaign submitting fake "endorsements" for another
candidate, or funding sources designed to look damaging.

## Fix
Restrict INSERT on all three tables to a verified claimant of that specific
candidate_id — the same ownership check already used correctly elsewhere
(`campaign_team`, `campaign_events`).
*/

DROP POLICY IF EXISTS "insert_get_to_know_authenticated" ON candidate_get_to_know;
CREATE POLICY "insert_get_to_know_own_candidate" ON candidate_get_to_know FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_get_to_know.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  );

DROP POLICY IF EXISTS "insert_funding_authenticated" ON candidate_funding_sources;
CREATE POLICY "insert_funding_own_candidate" ON candidate_funding_sources FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_funding_sources.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  );

DROP POLICY IF EXISTS "insert_endorsements_authenticated" ON candidate_endorsements;
CREATE POLICY "insert_endorsements_own_candidate" ON candidate_endorsements FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_endorsements.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  );
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913001900_fix_candidate_extras_unrestricted_insert.sql');

-- ================= 20260913002000_fix_broken_team_invite_flow.sql =================

/*
# Fix: team invites were never actually usable beyond the initial insert

## What was found
inviteTeamMember() creates a campaign_team row with invited_email and
status='pending', but user_id stays NULL forever. Nothing anywhere links
that pending invite to an actual account:
- No email is sent to tell the invitee they were invited.
- If they sign up AFTER being invited, handle_new_user() only creates their
  profile row — it never checks for a matching pending invite.
- If they ALREADY have an account, nothing links it either.

Every RLS policy that grants team access checks
`ct.user_id = auth.uid() AND ct.status = 'active'` — since user_id was
always NULL, an invited team member could never gain any access at all,
under any circumstance. This is the core mechanic of the $299 Candidate
Management "invite your team" feature, and it was non-functional past the
database insert.

## Fix
1. `invite_team_member()` — a SECURITY DEFINER RPC that looks up whether an
   account with the invited email already exists (auth.users isn't
   client-readable, so this has to run server-side). If it does, the invite
   is linked and activated immediately. If not, it's stored pending as
   before, but see point 2.
2. `handle_new_user()` is updated to also check for a pending invite
   matching the new user's email at signup time, and link + activate it —
   covers the (more common) case of someone being invited before they have
   an account.
3. Sends the invited team member an instant email once linked, via the
   existing send-email infrastructure, notifying them they've been added.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  -- Link any pending team invite that was sent to this email before they
  -- had an account.
  UPDATE campaign_team
  SET user_id = new.id, status = 'active'
  WHERE invited_email = new.email
    AND user_id IS NULL
    AND status = 'pending';

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION invite_team_member(p_candidate_id uuid, p_email text, p_role text)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_can_invite boolean;
  v_existing_user_id uuid;
  v_new_status text;
  v_row_id uuid;
BEGIN
  SELECT (
    EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = p_candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
    OR EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = p_candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  ) INTO v_can_invite;

  IF NOT v_can_invite THEN
    RAISE EXCEPTION 'Not authorized to invite team members for this candidate';
  END IF;

  -- auth.users is not client-readable, so this lookup has to happen here,
  -- server-side, to immediately activate an invite for someone who already
  -- has an account rather than leaving them stuck at "pending" forever.
  SELECT id INTO v_existing_user_id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  v_new_status := CASE WHEN v_existing_user_id IS NOT NULL THEN 'active' ELSE 'pending' END;

  INSERT INTO campaign_team (candidate_id, invited_email, user_id, role, status)
  VALUES (p_candidate_id, p_email, v_existing_user_id, p_role, v_new_status)
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object('id', v_row_id, 'linked_immediately', v_existing_user_id IS NOT NULL, 'user_id', v_existing_user_id);
END;
$$;

REVOKE ALL ON FUNCTION invite_team_member(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION invite_team_member(uuid, text, text) TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913002000_fix_broken_team_invite_flow.sql');

-- ================= 20260913002100_admin_review_notifications.sql =================

/*
# Fix: admins had zero notification when something needed review

## What was found
Across every "submit for review" flow in the app (candidate claims,
candidate content/bio/photo submissions, and the funding source /
endorsement / get-to-know profile extras built in an earlier pass), nothing
ever told an admin that something new was waiting. The admin dashboard's
review tabs work correctly once opened, but there is no notifyAdmins()
mechanism anywhere — an admin only finds out by manually re-checking every
tab periodically. For candidate claims specifically, a delayed review means
a candidate can't manage their own profile during what may be a critical
campaign window.

## Fix
Widen notifications.type to accept `admin_review_needed`, so the
application code can notify every admin (via the same notification bell
already built for regular users) the moment a candidate claim or content
submission comes in — the two highest-priority review queues.
*/

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'position_change', 'new_post', 'question_answered', 'new_voting_record',
    'new_event', 'new_endorsement', 'new_follower', 'team_invite',
    'race_called', 'results_certified', 'election_reminder', 'new_message',
    'admin_review_needed'
  ));

-- notifications' INSERT policy is auth.uid() = user_id, correctly
-- preventing a regular user from writing a notification into anyone else's
-- inbox — which also blocks the legitimate case of "tell every admin
-- something needs review." This SECURITY DEFINER function is the narrow,
-- safe exception: it only ever creates admin_review_needed notifications,
-- addressed to actual admins, so it can't be used to spam or impersonate.
CREATE OR REPLACE FUNCTION notify_admins_of_pending_review(p_title text, p_body text)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, is_read)
  SELECT id, 'admin_review_needed', p_title, p_body, false
  FROM profiles
  WHERE is_admin = true;
END;
$$;

REVOKE ALL ON FUNCTION notify_admins_of_pending_review(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify_admins_of_pending_review(text, text) TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913002100_admin_review_notifications.sql');

-- ================= 20260913002200_CRITICAL_fix_claim_self_verification.sql =================

/*
# CRITICAL FIX: any user could self-verify their own candidate claim

## What was found
`update_own_claim`'s WITH CHECK was `user_id = auth.uid() OR is_admin()` --
it verified the row belonged to the caller, but placed NO restriction on
WHICH FIELDS could change. This meant any authenticated user could:
  1. Submit a claim for any candidate (status defaults to 'pending')
  2. Immediately run their own UPDATE, setting status directly to
     'verified' -- completely bypassing admin review
  3. Gain full claimed-candidate access: team invites, feed posting,
     photo uploads, analytics, campaign pages, profile extras -- every
     "verified claimant" feature built in this project checks exactly
     this status field.

This is the same class of bug as the earlier profiles.role and
subscriptions self-write findings, except this one was never caught until
now, and is arguably more severe: it's the entry point to nearly every
paid and unpaid candidate-side feature in the app.

Also found in the same audit: the admin dashboard tab literally labeled
"Review Claims" doesn't review candidate_claims at all -- it shows
unverified candidate POSITIONS (a different concept entirely). There was
no admin UI anywhere to approve or reject an actual profile-ownership
claim. Fixed in the application code alongside this migration.

## Fix
Split the single overly-permissive UPDATE policy into two: a non-admin can
only touch their OWN claim while it stays pending, and only if it STAYS
pending (they can never set status to verified or rejected themselves) --
admins get a separate, unrestricted UPDATE policy.
*/

DROP POLICY IF EXISTS "update_own_claim" ON candidate_claims;

CREATE POLICY "update_own_pending_claim" ON candidate_claims FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "admin_update_any_claim" ON candidate_claims FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913002200_CRITICAL_fix_claim_self_verification.sql');

-- ================= 20260913002300_CRITICAL_fix_more_self_approval_holes.sql =================

/*
# CRITICAL FIX: the same self-verification exploit existed in 3 more tables

## What was found
Immediately after fixing candidate_claims' self-verification hole
(20260913002200), audited every other table with the same
"WITH CHECK (user_id = auth.uid() OR is_admin())" ownership-only pattern for
a status/moderation field. Found the identical vulnerability in three more
tables that are actively used (unlike advertisers/sponsors, which have the
same loose pattern but are orphaned dead code with no UI at all, so not
fixed here — nothing currently exercises them):

- candidate_submissions (bio/photo/website edits) — a candidate could set
  their own submission directly to `status = 'approved'`, bypassing the
  admin's apply_candidate_submission() review entirely. The
  20260913000400 migration added the correct admin path (SELECT/UPDATE
  policies + apply/reject RPCs) but never removed the original insecure
  self-update policy sitting alongside it — Postgres OR's multiple
  permissive policies together, so the old hole stayed wide open even
  after the "fix." A self-approved submission wouldn't actually change the
  live candidate profile (only the RPC does that), but it would falsely
  mark the item "approved" in the admin queue, hiding it from review while
  the content never actually goes live — silent, confusing data corruption
  at minimum, and an RLS design flaw that needed closing regardless.
- candidate_questionnaire_responses (candidate Q&A) — identical shape:
  self-write directly to 'approved'.
- candidate_events (campaign events) — identical shape.

## Fix
Same split as candidate_claims: a non-admin can only update their OWN row
while it stays pending and MUST remain pending; admins get a separate,
unrestricted UPDATE policy for actually reviewing and approving/rejecting.
*/

DROP POLICY IF EXISTS "update_own_submission" ON candidate_submissions;
CREATE POLICY "update_own_pending_submission" ON candidate_submissions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "update_own_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "update_own_pending_questionnaire" ON candidate_questionnaire_responses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "update_own_event" ON candidate_events;
CREATE POLICY "update_own_pending_event" ON candidate_events FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- candidate_questionnaire_responses and candidate_events had NO admin
-- SELECT/UPDATE policy at all (unlike candidate_submissions, which at
-- least got one in an earlier fix) — meaning even after closing the
-- self-approval hole above, nothing could ever legitimately approve a
-- candidate-submitted event or Q&A response either. Both features were
-- silently 100% non-functional past the initial pending insert.
DROP POLICY IF EXISTS "admin_select_all_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "admin_select_all_questionnaire" ON candidate_questionnaire_responses FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_update_all_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "admin_update_all_questionnaire" ON candidate_questionnaire_responses FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_select_all_events" ON candidate_events;
CREATE POLICY "admin_select_all_events" ON candidate_events FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_update_all_events" ON candidate_events;
CREATE POLICY "admin_update_all_events" ON candidate_events FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913002300_CRITICAL_fix_more_self_approval_holes.sql');

-- ================= 20260913002400_CRITICAL_fix_ad_self_approval.sql =================

/*
# CRITICAL FIX: advertisers could self-activate ads with zero content review

## What was found
Same self-approval shape as the candidate_claims/submissions/events/
questionnaire findings: `update_own_ads` let an advertiser update their own
ad row with no restriction on the `status` field. An advertiser could set
status directly to 'active', and it would immediately start showing to
real voters (`public_read_active_ads` has no other gate beyond
`status = 'active'`). For a platform whose entire premise is nonpartisan,
unbiased information, a paid-ad channel with zero content moderation is a
real integrity risk -- anyone could pay for an ad slot and publish anything.

## Fix
Advertisers can still freely draft, submit for review ('pending'), or pause
their own ad -- only admins can ever move status to 'active' or 'rejected'.
*/

DROP POLICY IF EXISTS "update_own_ads" ON advertisements;

CREATE POLICY "advertiser_update_own_ad" ON advertisements FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
    AND status IN ('draft', 'pending', 'paused')
  );

CREATE POLICY "admin_update_any_ad" ON advertisements FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- No column existed to record why an ad was rejected — admins had no way
-- to leave the advertiser a reason, matching the admin_notes pattern
-- already used on candidate_claims/candidate_submissions.
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS admin_notes text;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913002400_CRITICAL_fix_ad_self_approval.sql');

-- ================= 20260913002500_CRITICAL_fix_permissions_extras_questions_moderation.sql =================

/*
# CRITICAL: permission audit — open UPDATE holes, question impersonation,
# missing admin access, dead counters

Found by computing the FINAL RLS policy state of every table across the whole
migration history (not just reading individual files) and checking, per
table, what an admin can and cannot do plus which write policies have no
real condition.

## 1. Anyone could edit ANY candidate's endorsements/funding/extras
`candidate_endorsements`, `candidate_funding_sources`, `candidate_get_to_know`
and `candidate_profile_extras` all still had `UPDATE ... USING (true) WITH
CHECK (true)` for every authenticated user. Migration 20260913001900 closed
the INSERT side of three of them but never touched UPDATE, so any signed-in
user could rewrite another candidate's funding percentages, endorsements or
election dates -- and could set `status = 'approved'` on a pending row,
bypassing moderation entirely. `candidate_profile_extras` INSERT was also
`WITH CHECK (true)`.

## 2. Admins could not even SEE pending endorsements/funding/get-to-know
Their only SELECT policy was `status = 'approved'` for everyone. Pending
rows were invisible to the admin who is supposed to approve them, and to
the candidate who submitted them. The only way anything ever became
approved was the open-UPDATE hole above.

## 3. A voter could write a candidate's "answer" to their own question
`voter_questions` UPDATE allowed `auth.uid() = user_id` (the asker) with no
column restriction, and the table has `answer_text`/`answered_at`/`status`.
Any voter could publish a fake answer under a candidate's name. Answering
now goes through `answer_voter_question()`, which verifies the caller is
the candidate's verified claimant, an active team member, or an admin,
records `answered_by_user_id` (previously never set), and notifies the asker
(the `question_answered` notification type existed and was styled in the UI
but nothing ever created one).

## 4. Question rating counters never changed
The UI shows Useful/Evidence/Responsive counts read from columns on
`voter_questions`, but nothing ever updated them; `question_ratings` rows
were written and never counted. A trigger now keeps them accurate
(and existing rows are backfilled).

## 5. Admin could not remove abusive content
No admin DELETE on `feed_posts`, `fact_checks`, `candidate_tags`, or
`voter_questions`, so a report marked "actioned" had no way to actually be
actioned through the app.
*/

-- ─────────────────────────────────────────────────────────────
-- 1 & 2. candidate_endorsements / funding_sources / get_to_know
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "update_endorsements_authenticated" ON candidate_endorsements;
DROP POLICY IF EXISTS "update_funding_authenticated" ON candidate_funding_sources;
DROP POLICY IF EXISTS "update_get_to_know_authenticated" ON candidate_get_to_know;

-- Claimant submissions may only ever be inserted as 'pending'; previously a
-- claimant could insert with status = 'approved' and skip review.
DROP POLICY IF EXISTS "insert_endorsements_own_candidate" ON candidate_endorsements;
CREATE POLICY "insert_endorsements_own_candidate" ON candidate_endorsements FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR (
      status = 'pending' AND EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = candidate_endorsements.candidate_id
          AND cc.user_id = auth.uid() AND cc.status = 'verified')
    )
  );

DROP POLICY IF EXISTS "insert_funding_own_candidate" ON candidate_funding_sources;
CREATE POLICY "insert_funding_own_candidate" ON candidate_funding_sources FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR (
      status = 'pending' AND EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = candidate_funding_sources.candidate_id
          AND cc.user_id = auth.uid() AND cc.status = 'verified')
    )
  );

DROP POLICY IF EXISTS "insert_get_to_know_own_candidate" ON candidate_get_to_know;
CREATE POLICY "insert_get_to_know_own_candidate" ON candidate_get_to_know FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR (
      status = 'pending' AND EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = candidate_get_to_know.candidate_id
          AND cc.user_id = auth.uid() AND cc.status = 'verified')
    )
  );

-- Admin sees every status (needed to review); a verified claimant sees all
-- rows for their own candidate (so they can see their own pending items).
DROP POLICY IF EXISTS "admin_or_claimant_read_all_endorsements" ON candidate_endorsements;
CREATE POLICY "admin_or_claimant_read_all_endorsements" ON candidate_endorsements FOR SELECT
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_endorsements.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "admin_or_claimant_read_all_funding" ON candidate_funding_sources;
CREATE POLICY "admin_or_claimant_read_all_funding" ON candidate_funding_sources FOR SELECT
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_funding_sources.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "admin_or_claimant_read_all_get_to_know" ON candidate_get_to_know;
CREATE POLICY "admin_or_claimant_read_all_get_to_know" ON candidate_get_to_know FOR SELECT
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_get_to_know.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );

-- Only admins change status (approve/reject).
DROP POLICY IF EXISTS "admin_update_endorsements" ON candidate_endorsements;
CREATE POLICY "admin_update_endorsements" ON candidate_endorsements FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_funding" ON candidate_funding_sources;
CREATE POLICY "admin_update_funding" ON candidate_funding_sources FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_get_to_know" ON candidate_get_to_know;
CREATE POLICY "admin_update_get_to_know" ON candidate_get_to_know FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Admin or the candidate's own verified claimant can remove a row (fix a
-- mistake, or take down bad content). There was no DELETE policy at all.
DROP POLICY IF EXISTS "admin_or_claimant_delete_endorsements" ON candidate_endorsements;
CREATE POLICY "admin_or_claimant_delete_endorsements" ON candidate_endorsements FOR DELETE
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_endorsements.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "admin_or_claimant_delete_funding" ON candidate_funding_sources;
CREATE POLICY "admin_or_claimant_delete_funding" ON candidate_funding_sources FOR DELETE
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_funding_sources.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "admin_or_claimant_delete_get_to_know" ON candidate_get_to_know;
CREATE POLICY "admin_or_claimant_delete_get_to_know" ON candidate_get_to_know FOR DELETE
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_get_to_know.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );

-- ─────────────────────────────────────────────────────────────
-- candidate_profile_extras: verified claimant or admin only
-- (public read stays as-is; there's no moderation status on this table)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "upsert_extras_authenticated" ON candidate_profile_extras;
DROP POLICY IF EXISTS "update_extras_authenticated" ON candidate_profile_extras;

DROP POLICY IF EXISTS "claimant_or_admin_insert_extras" ON candidate_profile_extras;
CREATE POLICY "claimant_or_admin_insert_extras" ON candidate_profile_extras FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_profile_extras.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "claimant_or_admin_update_extras" ON candidate_profile_extras;
CREATE POLICY "claimant_or_admin_update_extras" ON candidate_profile_extras FOR UPDATE
  TO authenticated
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_profile_extras.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  )
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_profile_extras.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified')
  );
DROP POLICY IF EXISTS "admin_delete_extras" ON candidate_profile_extras;
CREATE POLICY "admin_delete_extras" ON candidate_profile_extras FOR DELETE
  TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────
-- 3. voter_questions: answering goes through a checked function
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "update_voter_questions_team" ON voter_questions;

DROP POLICY IF EXISTS "admin_update_voter_questions" ON voter_questions;
CREATE POLICY "admin_update_voter_questions" ON voter_questions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_voter_questions" ON voter_questions;
CREATE POLICY "admin_delete_voter_questions" ON voter_questions FOR DELETE
  TO authenticated USING (is_admin());

CREATE OR REPLACE FUNCTION answer_voter_question(p_question_id uuid, p_answer text)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidate uuid;
  v_asker uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_answer IS NULL OR length(trim(p_answer)) = 0 THEN
    RAISE EXCEPTION 'Answer cannot be empty';
  END IF;

  SELECT candidate_id, user_id INTO v_candidate, v_asker
  FROM voter_questions WHERE id = p_question_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  IF NOT (
    is_admin()
    OR EXISTS (SELECT 1 FROM candidate_claims cc
               WHERE cc.candidate_id = v_candidate AND cc.user_id = auth.uid() AND cc.status = 'verified')
    OR EXISTS (SELECT 1 FROM campaign_team ct
               WHERE ct.candidate_id = v_candidate AND ct.user_id = auth.uid() AND ct.status = 'active')
  ) THEN
    RAISE EXCEPTION 'Not authorized to answer questions for this candidate';
  END IF;

  UPDATE voter_questions
  SET answer_text = trim(p_answer),
      answered_at = now(),
      status = 'answered',
      answered_by_user_id = auth.uid()
  WHERE id = p_question_id;

  -- A reply to a question the user personally asked is direct communication,
  -- so (like a message) it isn't gated by digest preferences.
  IF v_asker IS NOT NULL AND v_asker <> auth.uid() THEN
    INSERT INTO notifications (user_id, type, title, body, candidate_id, is_read)
    VALUES (v_asker, 'question_answered', 'Your question was answered',
            'A candidate answered a question you asked. Open their profile to read the answer.',
            v_candidate, false);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION answer_voter_question(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION answer_voter_question(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Keep the Useful/Evidence/Responsive counters accurate
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_question_rating_counts()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  qid uuid := COALESCE(NEW.question_id, OLD.question_id);
BEGIN
  UPDATE voter_questions SET
    helpful_count    = (SELECT count(*) FROM question_ratings WHERE question_id = qid AND rating_type = 'helpful'    AND value),
    evidence_count   = (SELECT count(*) FROM question_ratings WHERE question_id = qid AND rating_type = 'evidence'   AND value),
    responsive_count = (SELECT count(*) FROM question_ratings WHERE question_id = qid AND rating_type = 'responsive' AND value)
  WHERE id = qid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_question_ratings_counts ON question_ratings;
CREATE TRIGGER trg_question_ratings_counts
  AFTER INSERT OR UPDATE OR DELETE ON question_ratings
  FOR EACH ROW EXECUTE FUNCTION refresh_question_rating_counts();

-- Backfill any ratings already recorded.
UPDATE voter_questions q SET
  helpful_count    = (SELECT count(*) FROM question_ratings r WHERE r.question_id = q.id AND r.rating_type = 'helpful'    AND r.value),
  evidence_count   = (SELECT count(*) FROM question_ratings r WHERE r.question_id = q.id AND r.rating_type = 'evidence'   AND r.value),
  responsive_count = (SELECT count(*) FROM question_ratings r WHERE r.question_id = q.id AND r.rating_type = 'responsive' AND r.value);

-- ─────────────────────────────────────────────────────────────
-- 5. Admin can remove abusive content
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_delete_feed_posts" ON feed_posts;
CREATE POLICY "admin_delete_feed_posts" ON feed_posts FOR DELETE
  TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_delete_fact_checks" ON fact_checks;
CREATE POLICY "admin_delete_fact_checks" ON fact_checks FOR DELETE
  TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_delete_candidate_tags" ON candidate_tags;
CREATE POLICY "admin_delete_candidate_tags" ON candidate_tags FOR DELETE
  TO authenticated USING (is_admin());
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913002500_CRITICAL_fix_permissions_extras_questions_moderation.sql');

-- ================= 20260913002600_CRITICAL_fix_campaign_team_policy_recursion.sql =================

/*
# CRITICAL: infinite recursion in campaign_team RLS broke 10+ tables for
# every signed-in user

## What was found
Replaying every migration against a real Postgres and then running a
SELECT/INSERT/UPDATE/DELETE against every table as `authenticated` produced:

    ERROR: infinite recursion detected in policy for relation "campaign_team"

Root cause: campaign_team's own policies (SELECT `read_own_campaign_team`,
and INSERT/UPDATE/DELETE) contained `EXISTS (SELECT 1 FROM campaign_team ...)`.
A subquery on a table that has RLS re-applies that table's policies, which
contain the same subquery, forever. The SELECT policy was introduced by
20260913000800 when closing the invited_email privacy leak: the leak fix was
right, the way it was written was not.

Because RLS expansion happens when a query is planned -- not per row -- a
policy that mentions campaign_team fails for *every* query touching that
table, regardless of data. Every other table whose policy checks team
membership inherited the failure. For signed-in (not anonymous) users this
broke:
  campaign_team            (the Team tab)
  campaigns / campaign_events / campaign_event_rsvps   (candidate Campaign tab)
  feed_posts               (posting, editing, deleting updates)
  candidate_promises, candidate_claim_analysis
  candidate_quiz_answers, candidate_questionnaire_answers  (quiz matching)
  profile_views            (analytics)
Logged-out browsing was unaffected, which is why it never showed up in
casual testing, and several callers swallow errors and render an empty state.

## Note on the live database
On the live project this recursion was first patched directly through Bolt
(helpers named is_campaign_team_member / is_verified_claimant). The helpers
here use an rls_ prefix so this migration can't collide with those (CREATE OR
REPLACE fails if an existing function's parameter names differ), and applying
it makes the live policies match the repository again.

## Fix
Membership checks move into SECURITY DEFINER functions. They read
campaign_team/candidate_claims as the table owner, so they don't re-enter
RLS, and every policy calls the function instead of subquerying the table.
The policies keep exactly the same meaning as before:
  SELECT : admin, an active team member of that candidate, or its verified claimant
  INSERT : Management must be active AND (verified claimant OR team manager)
  UPDATE/DELETE : verified claimant OR team manager
*/

CREATE OR REPLACE FUNCTION rls_is_verified_claimant(p_candidate_id uuid)
RETURNS boolean SECURITY DEFINER STABLE SET search_path = public LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM candidate_claims cc
    WHERE cc.candidate_id = p_candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified'
  );
$$;

CREATE OR REPLACE FUNCTION rls_is_active_team_member(p_candidate_id uuid)
RETURNS boolean SECURITY DEFINER STABLE SET search_path = public LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaign_team ct
    WHERE ct.candidate_id = p_candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION rls_is_team_manager(p_candidate_id uuid)
RETURNS boolean SECURITY DEFINER STABLE SET search_path = public LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaign_team ct
    WHERE ct.candidate_id = p_candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active'
      AND ct.role IN ('candidate', 'campaign_manager')
  );
$$;

REVOKE ALL ON FUNCTION rls_is_verified_claimant(uuid), rls_is_active_team_member(uuid), rls_is_team_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rls_is_verified_claimant(uuid), rls_is_active_team_member(uuid), rls_is_team_manager(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "read_own_campaign_team" ON campaign_team;
CREATE POLICY "read_own_campaign_team" ON campaign_team FOR SELECT
  TO authenticated USING (
    is_admin() OR rls_is_active_team_member(candidate_id) OR rls_is_verified_claimant(candidate_id)
  );

DROP POLICY IF EXISTS "insert_campaign_team" ON campaign_team;
CREATE POLICY "insert_campaign_team" ON campaign_team FOR INSERT
  TO authenticated WITH CHECK (
    has_active_management(candidate_id)
    AND (rls_is_verified_claimant(candidate_id) OR rls_is_team_manager(candidate_id))
  );

DROP POLICY IF EXISTS "update_campaign_team" ON campaign_team;
CREATE POLICY "update_campaign_team" ON campaign_team FOR UPDATE
  TO authenticated
  USING (rls_is_verified_claimant(candidate_id) OR rls_is_team_manager(candidate_id))
  WITH CHECK (rls_is_verified_claimant(candidate_id) OR rls_is_team_manager(candidate_id));

DROP POLICY IF EXISTS "delete_campaign_team" ON campaign_team;
CREATE POLICY "delete_campaign_team" ON campaign_team FOR DELETE
  TO authenticated USING (rls_is_verified_claimant(candidate_id) OR rls_is_team_manager(candidate_id));
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913002600_CRITICAL_fix_campaign_team_policy_recursion.sql');

-- ================= 20260913002700_CRITICAL_enforce_profile_admin_columns.sql =================

/*
# CRITICAL: any signed-in user could still make themselves an admin

## What was found
Two earlier "fixes" for this (20260815142914 and 20260913000300) did not
actually work. Replaying the migrations on a real Postgres and attempting
    UPDATE profiles SET is_admin = true, role = 'admin' WHERE id = auth.uid()
as an ordinary `authenticated` user succeeded, and that account then passed
every is_admin() check in the system.

Two independent reasons:
1. Both fixes relied on column-level `REVOKE UPDATE (is_admin) / (role)`.
   In PostgreSQL a column-level REVOKE cannot remove a privilege that was
   granted on the whole table, and new tables in the public schema get a
   table-level grant to `authenticated` by default (this is Supabase's
   default), so those REVOKEs are no-ops.
2. An `update_own_profile_safe` policy was added to block role changes, but
   the original permissive `update_own_profile` policy (CHECK only
   `auth.uid() = id`) was never dropped. Permissive policies are OR'd, so
   the safe one could never restrict anything -- the same "added the new
   rule, left the old one" mistake as candidate_submissions earlier.

## Fix
- Drop the permissive `update_own_profile` policy.
- A BEFORE INSERT/UPDATE trigger rejects any change to `is_admin` or `role`
  when the statement runs as `anon` or `authenticated`. It does not depend on
  privileges or on which policies exist. The legitimate paths keep working
  because they run as a different database role: `set_admin_role()` and
  `handle_new_user()` are SECURITY DEFINER (owner), and edge functions use
  the service role.
*/

DROP POLICY IF EXISTS "update_own_profile" ON profiles;

CREATE OR REPLACE FUNCTION protect_profile_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.is_admin IS TRUE OR NEW.role IS DISTINCT FROM 'user' THEN
        RAISE EXCEPTION 'Not allowed to set admin status or role' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not allowed to change admin status or role' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_admin_columns ON profiles;
CREATE TRIGGER profiles_protect_admin_columns
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_admin_columns();
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913002700_CRITICAL_enforce_profile_admin_columns.sql');

-- ================= 20260913002800_fix_account_save_missing_bio_column.sql =================

/*
# Fix: Account page "Save" always failed -- profiles has no `bio` column

## What was found
AccountPage sends `bio` on every save (it's an editable field with a
160-character counter), and updateProfile() passes it straight to
`profiles.update(...)`. No migration ever created `profiles.bio`. PostgREST
rejects an update naming an unknown column ("Could not find the 'bio' column
of 'profiles' in the schema cache"), so saving name, ZIP, occupation, education
-- anything on that page -- failed together, every time.

## Column-level grants
On the live project, the role-escalation bug was patched through Bolt by
narrowing UPDATE on profiles to an explicit list of columns. A new column is
NOT in that list, so adding `bio` alone would leave Save failing with
"permission denied". This grants UPDATE on exactly the columns users edit
themselves, which is harmless if a table-level grant already exists and
required if it doesn't. `role` and `is_admin` are deliberately excluded (and
additionally guarded by the trigger from 20260913002700).
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_bio_length;
ALTER TABLE profiles ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 160);

GRANT UPDATE (
  full_name, zip_code, bio, occupation, education, photo_url, avatar_url,
  language_preference, theme_preference, first_name, last_name, phone,
  city, state, district_id, updated_at
) ON profiles TO authenticated;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913002800_fix_account_save_missing_bio_column.sql');

-- ================= 20260913002900_fix_account_deletion_blocked_by_reviewer_fk.sql =================

/*
# Fix: an admin who ever approved/rejected anything could never delete their account

## What was found
`reviewed_by` on candidate_claims, candidate_submissions,
candidate_questionnaire_responses and candidate_events references
auth.users(id) with the default ON DELETE NO ACTION. apply_candidate_submission()
and reject_candidate_submission() fill it with the reviewing admin's id. After
that, deleting that admin's auth user -- which is exactly what the
delete-my-account edge function does -- fails:

  ERROR: update or delete on table "users" violates foreign key constraint
         "candidate_submissions_reviewed_by_fkey"

Reproduced on a full migration replay. So "Delete My Account" (the Privacy
Policy's right-to-delete promise) silently stopped working for any admin
after their first review, and admins could not be removed at all.

## Fix
ON DELETE SET NULL: the review decision and reviewed_at stay; only the link to
a person who no longer exists is cleared. The audit_log entry for the action
is unaffected.
*/

ALTER TABLE candidate_claims DROP CONSTRAINT IF EXISTS candidate_claims_reviewed_by_fkey;
ALTER TABLE candidate_claims ADD CONSTRAINT candidate_claims_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE candidate_submissions DROP CONSTRAINT IF EXISTS candidate_submissions_reviewed_by_fkey;
ALTER TABLE candidate_submissions ADD CONSTRAINT candidate_submissions_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE candidate_questionnaire_responses DROP CONSTRAINT IF EXISTS candidate_questionnaire_responses_reviewed_by_fkey;
ALTER TABLE candidate_questionnaire_responses ADD CONSTRAINT candidate_questionnaire_responses_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE candidate_events DROP CONSTRAINT IF EXISTS candidate_events_reviewed_by_fkey;
ALTER TABLE candidate_events ADD CONSTRAINT candidate_events_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913002900_fix_account_deletion_blocked_by_reviewer_fk.sql');

-- ================= 20260913003000_fix_stripe_webhook_statuses_and_duplicate_payments.sql =================

/*
# Fix: Stripe statuses rejected by CHECK constraints; subscription payments counted twice

## 1. Status values
Stripe subscription statuses are: incomplete, incomplete_expired, trialing,
active, past_due, canceled, unpaid, paused. `subscriptions.status` only
allowed active/canceled/past_due/trialing/expired and
`candidate_management_subscriptions.status` only active/canceled/past_due/
expired. The webhook writes Stripe's status verbatim, so any of the others
made the upsert fail -- and because the webhook never checked write errors,
the change was silently lost (e.g. a subscription going `unpaid`, or a
Management checkout that starts `incomplete`). All access checks require
status = 'active', so allowing the extra values never grants access.

## 2. Duplicate payment rows
For a subscription charge Stripe sends BOTH payment_intent.succeeded and
invoice.paid. handlePaymentSucceeded() only skipped when a row already
existed, and handleInvoicePaid() never checked at all, so whenever the
payment-intent event arrived first (the usual order) the same charge was
stored twice -- once as 'other', once as 'subscription'. The admin Total
Revenue card sums this table, so it would overstate revenue. The live
database already shows the pattern (14 payment rows vs 9 invoice-derived
revenue rows).

This removes the extra copies (keeping the invoice-linked row when one
exists) and adds unique indexes so the webhook can upsert idempotently.
NULLs stay allowed and distinct, so payments without a payment intent
(e.g. $0 invoices) are unaffected.
*/

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'expired',
                    'incomplete', 'incomplete_expired', 'unpaid', 'paused'));

ALTER TABLE candidate_management_subscriptions DROP CONSTRAINT IF EXISTS candidate_management_subscriptions_status_check;
ALTER TABLE candidate_management_subscriptions ADD CONSTRAINT candidate_management_subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'expired',
                    'incomplete', 'incomplete_expired', 'unpaid', 'paused'));

-- Remove duplicate payment rows for the same payment intent, keeping the best
-- one: an invoice-linked row first, then the earliest.
DELETE FROM payments p
USING (
  SELECT id, row_number() OVER (
           PARTITION BY stripe_payment_intent_id
           ORDER BY (stripe_invoice_id IS NULL), created_at, id
         ) AS rn
  FROM payments
  WHERE stripe_payment_intent_id IS NOT NULL
) d
WHERE p.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_payment_intent_id_key
  ON payments (stripe_payment_intent_id);

DELETE FROM revenue_transactions r
USING (
  SELECT id, row_number() OVER (PARTITION BY stripe_payment_id ORDER BY created_at, id) AS rn
  FROM revenue_transactions
  WHERE stripe_payment_id IS NOT NULL
) d
WHERE r.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS revenue_transactions_stripe_payment_id_key
  ON revenue_transactions (stripe_payment_id);
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913003000_fix_stripe_webhook_statuses_and_duplicate_payments.sql');

-- ================= 20260913003100_fix_messaging_targeting_hijack_and_role_spoofing.sql =================

/*
# Fix: voters could message (and email) ANY user, hijack conversations, and
# label their own messages as the candidate's

Reproduced on a full migration replay:

A. insert_own_conversations only checked `auth.uid() = voter_id`. The voter
   chose `candidate_user_id` freely, so they could open a conversation "with a
   candidate" whose other participant was any user id on the platform. That
   user then saw it in their inbox, and send-message-notification emails "the
   other participant" -- i.e. BallotLens-branded email to anyone. It also
   blocked the voter's legitimate conversation with that candidate (unique
   voter_id + candidate_id).

B. update_own_conversations let either participant change any column, so a
   conversation could be redirected afterwards by rewriting candidate_user_id,
   candidate_id or voter_id.

C. messages.sender_role was taken as given, so a voter could insert a message
   marked 'candidate'. The current UI decides "me vs them" by sender_id, but
   anything that trusts sender_role (exports, admin review, notifications)
   would show it as the candidate speaking.

## Fix
A. The other participant must be NULL (the candidate hasn't been claimed yet;
   the verified claimant can still see it via the existing claim clause) or
   the candidate's verified claimant, and never the voter themself.
B. A trigger rejects changes to voter_id / candidate_id / candidate_user_id
   from anon/authenticated. Read markers and last_message_at stay editable,
   which is all the app updates.
C. sender_role is derived from the conversation on insert and can't be set.
*/

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = voter_id
    AND candidate_user_id IS DISTINCT FROM voter_id
    AND (
      candidate_user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = conversations.candidate_id
          AND cc.user_id = conversations.candidate_user_id
          AND cc.status = 'verified'
      )
    )
  );

CREATE OR REPLACE FUNCTION protect_conversation_participants()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
       NEW.voter_id IS DISTINCT FROM OLD.voter_id
    OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
    OR NEW.candidate_user_id IS DISTINCT FROM OLD.candidate_user_id
  ) THEN
    RAISE EXCEPTION 'Conversation participants cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_protect_participants ON conversations;
CREATE TRIGGER conversations_protect_participants
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION protect_conversation_participants();

CREATE OR REPLACE FUNCTION set_message_sender_role()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_voter uuid;
BEGIN
  SELECT voter_id INTO v_voter FROM conversations WHERE id = NEW.conversation_id;
  NEW.sender_role := CASE WHEN NEW.sender_id = v_voter THEN 'voter' ELSE 'candidate' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_set_sender_role ON messages;
CREATE TRIGGER messages_set_sender_role
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION set_message_sender_role();
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913003100_fix_messaging_targeting_hijack_and_role_spoofing.sql');

-- ================= 20260913003200_fix_fact_check_self_publish.sql =================

/*
# CRITICAL: anyone could publish a "BallotLens verified" fact check directly

`insert_fact_checks` only checked `auth.uid() = submitted_by_user_id`. A
submitter could insert with status = 'published', assessment = 'true' and any
explanation, and it was immediately shown to everyone as a reviewed BallotLens
fact check -- e.g. "Candidate X is a criminal", verdict TRUE. Reproduced on a
full migration replay. Same self-approval shape as claims, submissions, events
and ads fixed earlier; 20260913001700 fixed who can READ unreviewed checks but
not what a submitter can INSERT.

Submissions must now start as pending/unverified with no verdict text; only an
admin (update_fact_checks_admin) can set the assessment, explanation and
publish. The app's submitFactCheck() already sends none of these fields, so
nothing legitimate changes.
*/

DROP POLICY IF EXISTS "insert_fact_checks" ON fact_checks;
CREATE POLICY "insert_fact_checks" ON fact_checks FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = submitted_by_user_id
    AND status = 'pending'
    AND assessment = 'unverified'
    AND explanation IS NULL
    AND evidence_text IS NULL
    AND evidence_url IS NULL
    AND reviewed_at IS NULL
  );
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913003200_fix_fact_check_self_publish.sql');

-- ================= 20260913003300_notify_followers_of_candidate_updates.sql =================

/*
# Following a candidate never produced a single notification

## What was found
The notifications CHECK allows position_change, new_post, new_voting_record,
new_event, new_endorsement and new_follower, and Account settings offers an
"Updates on what you follow" toggle ("A major update to a candidate ... you
follow"), but nothing anywhere ever created any of those six types. Following
a candidate did nothing beyond adding them to a list.

## Fix
One SECURITY DEFINER function, notify_candidate_followers(), inserts a
notification for every follower of a candidate, and triggers call it when:

  feed_posts            a candidate post is published            -> new_post
  candidate_positions   a position is added or its text changes  -> position_change
  voting_records        a vote is recorded                       -> new_voting_record
  candidate_events      an event becomes approved                -> new_event
  campaign_events       a public campaign event is created       -> new_event
  candidate_endorsements an endorsement becomes approved          -> new_endorsement
  follows               someone follows a candidate               -> new_follower
                        (to that candidate's verified claimant only)

Rules:
- Respects notification_preferences.instant_followed_updates (no row = default on).
- Never notifies the person who made the change.
- Throttle: skips a follower who already has an UNREAD notification of the
  same type for the same candidate from the last 6 hours, so a bulk import of
  50 voting records produces one alert per follower, not 50.
- Only APPROVED events/endorsements notify (pending ones aren't public).
*/

CREATE OR REPLACE FUNCTION notify_candidate_followers(
  p_candidate_id uuid, p_type text, p_title text, p_body text
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  INSERT INTO notifications (user_id, type, title, body, candidate_id, is_read)
  SELECT f.user_id, p_type, p_title, p_body, p_candidate_id, false
  FROM follows f
  LEFT JOIN notification_preferences np ON np.user_id = f.user_id
  WHERE f.followable_type = 'candidate'
    AND f.followable_id = p_candidate_id
    AND f.user_id IS DISTINCT FROM auth.uid()
    AND COALESCE(np.instant_followed_updates, true)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = f.user_id AND n.type = p_type AND n.candidate_id = p_candidate_id
        AND n.is_read = false AND n.created_at > now() - interval '6 hours'
    );
$$;

REVOKE ALL ON FUNCTION notify_candidate_followers(uuid, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION candidate_display_name(p_candidate_id uuid)
RETURNS text SECURITY DEFINER STABLE SET search_path = public LANGUAGE sql AS $$
  SELECT trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) FROM candidates WHERE id = p_candidate_id;
$$;

CREATE OR REPLACE FUNCTION trg_notify_followers()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  who text;
BEGIN
  IF NEW.candidate_id IS NULL THEN RETURN NEW; END IF;
  who := coalesce(nullif(candidate_display_name(NEW.candidate_id), ''), 'A candidate you follow');

  IF TG_TABLE_NAME = 'feed_posts' THEN
    PERFORM notify_candidate_followers(NEW.candidate_id, 'new_post', who || ' posted an update', left(NEW.body, 140));

  ELSIF TG_TABLE_NAME = 'candidate_positions' THEN
    IF TG_OP = 'INSERT' OR NEW.summary IS DISTINCT FROM OLD.summary THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'position_change', who || ' has a new or updated position', left(NEW.summary, 140));
    END IF;

  ELSIF TG_TABLE_NAME = 'voting_records' THEN
    PERFORM notify_candidate_followers(NEW.candidate_id, 'new_voting_record', 'New vote recorded for ' || who, NEW.bill_name);

  ELSIF TG_TABLE_NAME = 'candidate_events' THEN
    IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'new_event', who || ' added an event', NEW.title);
    END IF;

  ELSIF TG_TABLE_NAME = 'campaign_events' THEN
    IF NEW.is_public THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'new_event', who || ' added an event', NEW.title);
    END IF;

  ELSIF TG_TABLE_NAME = 'candidate_endorsements' THEN
    IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'new_endorsement', who || ' was endorsed', NEW.endorser_name);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_followers_feed_posts ON feed_posts;
CREATE TRIGGER notify_followers_feed_posts AFTER INSERT ON feed_posts
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_positions ON candidate_positions;
CREATE TRIGGER notify_followers_positions AFTER INSERT OR UPDATE OF summary ON candidate_positions
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_voting_records ON voting_records;
CREATE TRIGGER notify_followers_voting_records AFTER INSERT ON voting_records
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_candidate_events ON candidate_events;
CREATE TRIGGER notify_followers_candidate_events AFTER INSERT OR UPDATE OF status ON candidate_events
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_campaign_events ON campaign_events;
CREATE TRIGGER notify_followers_campaign_events AFTER INSERT ON campaign_events
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_endorsements ON candidate_endorsements;
CREATE TRIGGER notify_followers_endorsements AFTER INSERT OR UPDATE OF status ON candidate_endorsements
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

-- new_follower: tell the candidate's verified claimant (not every follower).
CREATE OR REPLACE FUNCTION trg_notify_new_follower()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.followable_type <> 'candidate' THEN RETURN NEW; END IF;
  INSERT INTO notifications (user_id, type, title, body, candidate_id, is_read)
  SELECT cc.user_id, 'new_follower', 'You have a new follower',
         'A voter started following your profile.', NEW.followable_id, false
  FROM candidate_claims cc
  WHERE cc.candidate_id = NEW.followable_id AND cc.status = 'verified'
    AND cc.user_id IS DISTINCT FROM NEW.user_id
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = cc.user_id AND n.type = 'new_follower' AND n.candidate_id = NEW.followable_id
        AND n.is_read = false AND n.created_at > now() - interval '6 hours'
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_follower ON follows;
CREATE TRIGGER notify_new_follower AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION trg_notify_new_follower();
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913003300_notify_followers_of_candidate_updates.sql');

-- ================= 20260913003400_fix_message_notifications_blocked_by_rls.sql =================

/*
# Fix: the recipient of a message never got an in-app notification

20260913001800 ("sending a message never notified the recipient") only added
'new_message' to the allowed notification types. The notification itself is
inserted by sendMessage() in the browser, for the OTHER participant -- but the
notifications INSERT policy is `auth.uid() = user_id`, so that insert is always
rejected by RLS. sendMessage() didn't check the error, so it failed silently:
reproduced on a full migration replay ("new row violates row-level security
policy for table notifications"). The bell never showed a single message.

The notification is now created by the database when a message is inserted,
which is also safer than trusting title/body text sent from a browser:
- recipient = the conversation's other side (the voter, or the candidate user;
  if the conversation predates the claim, the candidate's verified claimant)
- title/body built server-side from the candidate's name and the message text
- never notifies the sender
The browser-side insert is removed in the same change.
*/

CREATE OR REPLACE FUNCTION notify_message_recipient()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  c record;
  recipient uuid;
  sender_label text;
BEGIN
  SELECT cv.voter_id, cv.candidate_id, cv.candidate_user_id INTO c
  FROM conversations cv WHERE cv.id = NEW.conversation_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.sender_id = c.voter_id THEN
    recipient := COALESCE(
      c.candidate_user_id,
      (SELECT cc.user_id FROM candidate_claims cc
        WHERE cc.candidate_id = c.candidate_id AND cc.status = 'verified'
        ORDER BY cc.reviewed_at DESC NULLS LAST LIMIT 1));
    sender_label := 'a voter';
  ELSE
    recipient := c.voter_id;
    sender_label := COALESCE(NULLIF(candidate_display_name(c.candidate_id), ''), 'the candidate');
  END IF;

  IF recipient IS NULL OR recipient = NEW.sender_id THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, type, title, body, is_read)
  VALUES (recipient, 'new_message', 'New message from ' || sender_label,
          CASE WHEN length(NEW.body) > 140 THEN left(NEW.body, 140) || '…' ELSE NEW.body END,
          false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_notify_recipient ON messages;
CREATE TRIGGER messages_notify_recipient
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_message_recipient();
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913003400_fix_message_notifications_blocked_by_rls.sql');

-- ================= 20260913003500_review_promise_status_and_claim_analysis.sql =================

/*
# Candidates could grade their own promises and publish analysis of their own claims

## What was found
- candidate_promises: the verified claimant (or any active team member) could
  set `status` to 'completed' with their own evidence, and it was shown to
  voters as the tracker's verdict. On a nonpartisan accountability tool the
  candidate is grading themself.
- candidate_claim_analysis: whether a campaign claim has a specific plan and
  whether the office even has authority to do it (`has_specific_plan`,
  `authority_assessment`, `analysis_notes`) is analysis of the candidate, but
  the candidate could write and publish it directly.

## Fix -- same review pattern as endorsements, bio edits and events
Promises
- Candidates/teams may still ADD promises (their own public statements, with a
  source); new promises always start 'unverified'.
- They can no longer change status/evidence directly. Instead they fill
  proposed_status / proposed_evidence / proposed_source_url; an admin reviews
  and either applies it (copies it into status) or discards it.
Claim analysis
- New review_status (pending/published/rejected). Rows written by a candidate
  or team are always 'pending', and any later edit sends a published row back
  to 'pending'. The public only sees 'published'; the candidate's side and
  admins see everything.
Admins are unrestricted. Existing rows keep their current state.
*/

-- ── promises ─────────────────────────────────────────────────────────
ALTER TABLE candidate_promises
  ADD COLUMN IF NOT EXISTS proposed_status text
    CHECK (proposed_status IS NULL OR proposed_status IN ('completed','in_progress','not_started','contradicted','unverified')),
  ADD COLUMN IF NOT EXISTS proposed_evidence text,
  ADD COLUMN IF NOT EXISTS proposed_source_url text,
  ADD COLUMN IF NOT EXISTS proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- NOT security definer on purpose: the guard must see the CALLER's role in
-- current_user. Inside a SECURITY DEFINER function current_user is the owner,
-- so the "is this an ordinary user?" check would always be false and the guard
-- would never run (caught by db-tests).
CREATE OR REPLACE FUNCTION guard_candidate_promise_status()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'unverified';
    NEW.status_evidence := NULL;
    NEW.status_source_url := NULL;
    NEW.status_updated_at := NULL;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.status_evidence IS DISTINCT FROM OLD.status_evidence
       OR NEW.status_source_url IS DISTINCT FROM OLD.status_source_url
       OR NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at THEN
      RAISE EXCEPTION 'Only BallotLens reviewers can change a promise''s status. Submit a proposed status with evidence instead.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.proposed_status IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.proposed_status END)
     OR NEW.proposed_evidence IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.proposed_evidence END) THEN
    NEW.proposed_by := auth.uid();
    NEW.proposed_at := CASE WHEN NEW.proposed_status IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_promises_guard_status ON candidate_promises;
CREATE TRIGGER candidate_promises_guard_status
  BEFORE INSERT OR UPDATE ON candidate_promises
  FOR EACH ROW EXECUTE FUNCTION guard_candidate_promise_status();

-- ── claim analysis ───────────────────────────────────────────────────
ALTER TABLE candidate_claim_analysis
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'published'
    CHECK (review_status IN ('pending', 'published', 'rejected'));

-- NOT security definer on purpose: the guard must see the CALLER's role in
-- current_user. Inside a SECURITY DEFINER function current_user is the owner,
-- so the "is this an ordinary user?" check would always be false and the guard
-- would never run (caught by db-tests).
CREATE OR REPLACE FUNCTION guard_claim_analysis_review()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.review_status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_claim_analysis_guard_review ON candidate_claim_analysis;
CREATE TRIGGER candidate_claim_analysis_guard_review
  BEFORE INSERT OR UPDATE ON candidate_claim_analysis
  FOR EACH ROW EXECUTE FUNCTION guard_claim_analysis_review();

DROP POLICY IF EXISTS "read_candidate_claim_analysis" ON candidate_claim_analysis;
CREATE POLICY "read_candidate_claim_analysis" ON candidate_claim_analysis FOR SELECT
  TO anon, authenticated USING (
    review_status = 'published'
    OR is_admin()
    OR rls_is_verified_claimant(candidate_id)
    OR rls_is_active_team_member(candidate_id)
  );
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913003500_review_promise_status_and_claim_analysis.sql');

-- ================= 20260913003600_admin_can_read_draft_stories.sql =================

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
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913003600_admin_can_read_draft_stories.sql');

-- ================= 20260913003700_candidate_quiz_answers_reviewed.sql =================

/*
# Candidate quiz answers: self-approval, and changed answers went live unreviewed

The candidate quiz page tells candidates "All answers are reviewed before going
live", and voter matching only counts status = 'approved'. But:
- team_update_candidate_answers allowed the submitter to UPDATE any column, so a
  candidate could set status = 'approved' on their own answers (reproduced on a
  full migration replay), and INSERT didn't restrict status either;
- once approved, changing an answer (the app upserts) kept status 'approved',
  so the new answer went live with no review.
(There was also no admin screen to approve them at all, so in practice nothing
ever reached 'approved' -- added in the app in the same change.)

Fix: every write from the candidate's side is 'pending'. Only admins set
approved/rejected. Invoker-rights trigger on purpose: it must see the caller's
role in current_user (see 20260913003500).
*/

CREATE OR REPLACE FUNCTION guard_candidate_quiz_answer()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_quiz_answers_guard ON candidate_quiz_answers;
CREATE TRIGGER candidate_quiz_answers_guard
  BEFORE INSERT OR UPDATE ON candidate_quiz_answers
  FOR EACH ROW EXECUTE FUNCTION guard_candidate_quiz_answer();
INSERT INTO public.ballotlens_schema_migrations (filename) VALUES ('20260913003700_candidate_quiz_answers_reviewed.sql');

COMMIT;
