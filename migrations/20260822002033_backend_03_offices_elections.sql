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
