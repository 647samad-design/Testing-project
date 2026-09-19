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
