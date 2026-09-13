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
