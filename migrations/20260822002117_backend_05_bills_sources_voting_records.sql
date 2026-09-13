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
