/*
# Email notification preferences (client-confirmed spec)

## Client's design
- Instant emails (not user-configurable, always sent): account
  verification/password reset (handled natively by Supabase Auth already),
  security notifications, election reminders (registration deadlines,
  election day), and major updates to something the user specifically
  follows.
- Digest emails (grouped, configurable): new candidate positions, new
  articles/sources, updates to followed candidates/ballot measures,
  upcoming elections/deadlines, new elections added. Default frequency is
  weekly; user can switch to daily or turn categories off.
- A settings page should eventually let users control: instant alerts,
  daily digest, weekly digest, election reminders, candidate updates,
  ballot measure updates, news/article updates.

## Design notes
Account/security emails are NOT represented here — those go through
Supabase Auth's built-in email flows (signup confirmation, password reset),
which are unaffected by any of these preferences and always send regardless.
This table only governs the platform-content emails BallotLens itself sends.

## New table
`notification_preferences` — one row per user (auto-created on signup,
defaulting to the client's stated defaults: weekly digest, all categories
on, instant election reminders + followed-content updates on).
*/

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  digest_frequency text NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('daily', 'weekly', 'off')),
  instant_election_reminders boolean NOT NULL DEFAULT true,
  instant_followed_updates boolean NOT NULL DEFAULT true,
  digest_candidate_updates boolean NOT NULL DEFAULT true,
  digest_ballot_measure_updates boolean NOT NULL DEFAULT true,
  digest_news_updates boolean NOT NULL DEFAULT true,
  digest_new_elections boolean NOT NULL DEFAULT true,
  last_digest_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notification_prefs" ON notification_preferences;
CREATE POLICY "select_own_notification_prefs" ON notification_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "update_own_notification_prefs" ON notification_preferences;
CREATE POLICY "update_own_notification_prefs" ON notification_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notification_prefs" ON notification_preferences;
CREATE POLICY "insert_own_notification_prefs" ON notification_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create a default preferences row whenever a new profile is created,
-- same pattern as the existing handle_new_user() trigger for profiles.
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_notification_prefs ON profiles;
CREATE TRIGGER on_profile_created_notification_prefs
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_default_notification_preferences();

-- Backfill for existing users who signed up before this migration.
INSERT INTO notification_preferences (user_id)
SELECT id FROM profiles
ON CONFLICT (user_id) DO NOTHING;
