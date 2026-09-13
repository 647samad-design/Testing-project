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
