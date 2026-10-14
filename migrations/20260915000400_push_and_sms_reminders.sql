/*
Phone and browser notifications for election reminders and messages.

push_subscriptions: one row per browser/device a user turned notifications
on for (Web Push). Only the owner can see or remove their rows; the sending
edge functions use the service role.

SMS: a user adds a phone number, proves it's theirs with a 6-digit code
(sms_verifications, hashed, 10-minute expiry, never readable by clients), and
opts into text reminders. Consent time is recorded for compliance.
*/

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint ~ '^https://'),
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_push" ON push_subscriptions;
CREATE POLICY "select_own_push" ON push_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "insert_own_push" ON push_subscriptions;
CREATE POLICY "insert_own_push" ON push_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "delete_own_push" ON push_subscriptions;
CREATE POLICY "delete_own_push" ON push_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON push_subscriptions FROM anon;
GRANT SELECT, INSERT, DELETE ON push_subscriptions TO authenticated;

-- SMS preferences live with the other notification preferences.
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_phone text CHECK (sms_phone IS NULL OR sms_phone ~ '^\+1[2-9][0-9]{9}$');
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_phone_verified boolean NOT NULL DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_election_reminders boolean NOT NULL DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz;

-- A client may only turn SMS reminders off, or on when the number is already
-- verified; the number and its verified flag are set by the sms-optin edge
-- function (service role) after the code check.
CREATE OR REPLACE FUNCTION protect_sms_preferences()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN -- service role / owner (edge functions)
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.sms_phone := NULL;
    NEW.sms_phone_verified := false;
    NEW.sms_election_reminders := false;
    NEW.sms_consent_at := NULL;
    RETURN NEW;
  END IF;
  NEW.sms_phone_verified := OLD.sms_phone_verified;
  NEW.sms_consent_at := OLD.sms_consent_at;
  -- Removing the number is allowed (and turns texts off); changing it is not.
  IF NEW.sms_phone IS DISTINCT FROM OLD.sms_phone THEN
    IF NEW.sms_phone IS NULL THEN
      NEW.sms_phone_verified := false;
      NEW.sms_election_reminders := false;
    ELSE
      NEW.sms_phone := OLD.sms_phone;
    END IF;
  END IF;
  IF NEW.sms_election_reminders AND NOT (NEW.sms_phone IS NOT NULL AND NEW.sms_phone_verified) THEN
    NEW.sms_election_reminders := false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_sms_preferences ON notification_preferences;
CREATE TRIGGER trg_protect_sms_preferences BEFORE INSERT OR UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION protect_sms_preferences();

CREATE TABLE IF NOT EXISTS sms_verifications (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE sms_verifications ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge function) touches this table.
REVOKE ALL ON sms_verifications FROM anon, authenticated;
