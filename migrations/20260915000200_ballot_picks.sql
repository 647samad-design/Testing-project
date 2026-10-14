/*
My Picks: a voter's private choices on their ballot (a candidate per race,
yes/no per measure), so they can print or share a cheat sheet to take to the
polls. Signed-out voters keep picks on their device; signed-in voters' picks
are saved here and are visible ONLY to themselves (not even to admins:
how someone plans to vote is nobody else's business).
*/

CREATE TABLE IF NOT EXISTS ballot_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contest_id uuid REFERENCES ballot_contests(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES candidates(id) ON DELETE CASCADE,
  measure_id uuid REFERENCES ballot_measures(id) ON DELETE CASCADE,
  measure_choice text CHECK (measure_choice IN ('yes', 'no')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ballot_picks_one_kind CHECK (
    (contest_id IS NOT NULL AND candidate_id IS NOT NULL AND measure_id IS NULL AND measure_choice IS NULL)
    OR (measure_id IS NOT NULL AND measure_choice IS NOT NULL AND contest_id IS NULL AND candidate_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ballot_picks_user_contest ON ballot_picks (user_id, contest_id) WHERE contest_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ballot_picks_user_measure ON ballot_picks (user_id, measure_id) WHERE measure_id IS NOT NULL;

ALTER TABLE ballot_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_picks" ON ballot_picks;
CREATE POLICY "select_own_picks" ON ballot_picks FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_picks" ON ballot_picks;
CREATE POLICY "insert_own_picks" ON ballot_picks FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_picks" ON ballot_picks;
CREATE POLICY "update_own_picks" ON ballot_picks FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_picks" ON ballot_picks;
CREATE POLICY "delete_own_picks" ON ballot_picks FOR DELETE
  TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON ballot_picks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ballot_picks TO authenticated;
