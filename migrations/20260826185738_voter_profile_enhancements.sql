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
