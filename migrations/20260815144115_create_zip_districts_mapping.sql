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
