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
