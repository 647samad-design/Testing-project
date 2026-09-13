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
