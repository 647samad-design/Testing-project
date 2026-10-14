-- ============================================================================
-- Gov Search App: ALL pending database updates, in order, in ONE file.
-- Paste the whole file into Supabase -> SQL Editor -> Run.
-- Safe to run more than once: anything already applied is skipped/replaced.
-- Generated from migrations/ (20260913004200 .. 20260915000500).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 20260913004200_candidate_owner_can_manage_own_campaign.sql
-- ---------------------------------------------------------------------------
/*
# A candidate who bought the Management plan couldn't save their own campaign

Campaign writes required: active Management plan AND an active row in
campaign_team. But nothing ever adds the profile's owner (the verified
claimant) to campaign_team -- only invitees are inserted, by
invite_campaign_team_member(). So the paying candidate got
"new row violates row-level security policy for table campaigns" when saving
their campaign page or campaign events; only people they'd invited could.
Reproduced with the real app code against PostgREST
(candidate-data.integration.test.ts).

Same gap (team members allowed, owner not) in:
  - campaign_event_rsvps read: the owner couldn't see who RSVP'd to their events.
  - feed_posts update/delete: the owner couldn't edit or remove posts their
    team wrote on their profile (only their own).

Each now also allows the verified claimant, via the SECURITY DEFINER helper
rls_is_verified_claimant() (no policy recursion). Management gating is
unchanged: without an active plan, the owner still can't write campaign data.
*/

DROP POLICY IF EXISTS management_write_campaigns ON campaigns;
CREATE POLICY management_write_campaigns ON campaigns FOR ALL TO authenticated
  USING (is_admin() OR (has_active_management(candidate_id)
         AND (rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id))))
  WITH CHECK (is_admin() OR (has_active_management(candidate_id)
         AND (rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id))));

DROP POLICY IF EXISTS management_write_campaign_events ON campaign_events;
CREATE POLICY management_write_campaign_events ON campaign_events FOR ALL TO authenticated
  USING (is_admin() OR (has_active_management(candidate_id)
         AND (rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id))))
  WITH CHECK (is_admin() OR (has_active_management(candidate_id)
         AND (rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id))));

DROP POLICY IF EXISTS read_own_rsvp ON campaign_event_rsvps;
CREATE POLICY read_own_rsvp ON campaign_event_rsvps FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin() OR EXISTS (
    SELECT 1 FROM campaign_events ce
    WHERE ce.id = campaign_event_rsvps.event_id
      AND (rls_is_verified_claimant(ce.candidate_id) OR rls_is_active_team_member(ce.candidate_id))
  ));

DROP POLICY IF EXISTS update_feed_posts_team ON feed_posts;
CREATE POLICY update_feed_posts_team ON feed_posts FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id));

DROP POLICY IF EXISTS delete_feed_posts_team ON feed_posts;
CREATE POLICY delete_feed_posts_team ON feed_posts FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR rls_is_verified_claimant(candidate_id) OR rls_is_active_team_member(candidate_id));


-- ---------------------------------------------------------------------------
-- 20260913004300_track_payment_refunds.sql
-- ---------------------------------------------------------------------------
/*
# Refunds never reached the database, so admin revenue was overstated

The Stripe webhook handled checkout, subscription, invoice and payment-intent
events, but not charge.refunded. A refund issued from the Stripe dashboard (or
a dispute lost) left the payment as 'succeeded', and the admin Billing tab kept
counting it as revenue.

Adds payments.amount_refunded (cents). The webhook now records it on
charge.refunded (status 'refunded' when the full amount was returned), and the
admin revenue figures are net of refunds.

NOTE for deployment: add "charge.refunded" to the events the Stripe webhook
endpoint sends (Stripe Dashboard -> Developers -> Webhooks -> endpoint).
*/
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_refunded integer NOT NULL DEFAULT 0
  CHECK (amount_refunded >= 0);


-- ---------------------------------------------------------------------------
-- 20260913004400_rename_brand_in_promise_status_message.sql
-- ---------------------------------------------------------------------------
/*
# Product renamed to "Gov Search App"

The only user-facing occurrence of the old name in the database is this error
message (shown if a candidate tries to set a promise's status directly).
Same function as 20260913003500; only the message changes.
*/
CREATE OR REPLACE FUNCTION guard_candidate_promise_status()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'unverified';
    NEW.status_evidence := NULL;
    NEW.status_source_url := NULL;
    NEW.status_updated_at := NULL;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.status_evidence IS DISTINCT FROM OLD.status_evidence
       OR NEW.status_source_url IS DISTINCT FROM OLD.status_source_url
       OR NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at THEN
      RAISE EXCEPTION 'Only Gov Search App reviewers can change a promise''s status. Submit a proposed status with evidence instead.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.proposed_status IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.proposed_status END)
     OR NEW.proposed_evidence IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.proposed_evidence END) THEN
    NEW.proposed_by := auth.uid();
    NEW.proposed_at := CASE WHEN NEW.proposed_status IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 20260915000100_hide_private_claim_fields_from_public.sql
-- ---------------------------------------------------------------------------
/*
SECURITY: verified candidate claims exposed private fields to everyone.

"public_read_verified_claims" let anyone (even signed-out visitors) read
EVERY column of a verified claim through the API: the claimant's email,
admin_notes and verification_notes.

The public only needs to know WHO owns a profile (to show the verified badge,
the office, and to route voter messages). Now:
  - the table is readable only by the claimant and admins (existing policies);
  - public_verified_claims exposes just the safe columns of verified claims;
  - the conversation insert check uses is_verified_claimant(), which reads the
    table as its owner, instead of relying on the public row policy.
*/

DROP POLICY IF EXISTS "public_read_verified_claims" ON candidate_claims;

CREATE OR REPLACE VIEW public_verified_claims WITH (security_barrier = true) AS
  SELECT id, candidate_id, user_id, status, office, campaign_name, campaign_website
  FROM candidate_claims
  WHERE status = 'verified';
REVOKE ALL ON public_verified_claims FROM PUBLIC;
GRANT SELECT ON public_verified_claims TO anon, authenticated;

CREATE OR REPLACE FUNCTION is_verified_claimant(p_candidate_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM candidate_claims
    WHERE candidate_id = p_candidate_id AND user_id = p_user_id AND status = 'verified'
  );
$$;
REVOKE ALL ON FUNCTION is_verified_claimant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_verified_claimant(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = voter_id
    AND candidate_user_id IS DISTINCT FROM voter_id
    AND (
      candidate_user_id IS NULL
      OR is_verified_claimant(candidate_id, candidate_user_id)
    )
  );


-- ---------------------------------------------------------------------------
-- 20260915000200_ballot_picks.sql
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 20260915000300_candidate_external_data_ids.sql
-- ---------------------------------------------------------------------------
/*
Links a candidate profile to public data sources so the app can show live
records automatically:
  - openstates_person_id / openstates_jurisdiction_id: Open States legislator
    (state legislators and members of Congress) -> recent sponsored bills
  - fec_candidate_id: Federal Election Commission candidate ID (e.g. S6FL00123)
    -> money raised, spent and cash on hand
Set by admins in Manage Candidates. Readable by everyone like the rest of the
public profile; only admins can write candidates (existing policies).
*/
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS openstates_person_id text
  CHECK (openstates_person_id IS NULL OR openstates_person_id ~ '^ocd-person/[0-9a-f-]{36}$');
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS openstates_jurisdiction_id text
  CHECK (openstates_jurisdiction_id IS NULL OR openstates_jurisdiction_id ~ '^ocd-jurisdiction/[a-z0-9:/_-]+$');
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS fec_candidate_id text
  CHECK (fec_candidate_id IS NULL OR fec_candidate_id ~ '^[HSP][0-9A-Z]{8}$');


-- ---------------------------------------------------------------------------
-- 20260915000400_push_and_sms_reminders.sql
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 20260915000500_partners_and_embed.sql
-- ---------------------------------------------------------------------------
/*
Partners: newsrooms, nonprofits, schools and campaigns that put the
"Find your ballot" widget on their own websites (white-label embed).

partners              - one per organization; admins create them and pick
                        the owner account. The owner can edit branding only.
partner_daily_stats   - widget views / ZIP lookups / click-throughs per day.
                        Written only through track_partner_event() (no direct
                        writes), read only through partner_stats() by the
                        partner's owner or an admin.
public_partners       - the branding the public widget needs, nothing else.
*/

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$'),
  website text CHECK (website IS NULL OR website ~ '^https?://'),
  brand_color text NOT NULL DEFAULT '#15776c' CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text CHECK (logo_url IS NULL OR logo_url ~ '^https://'),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_partners" ON partners;
CREATE POLICY "admin_all_partners" ON partners FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "owner_read_partner" ON partners;
CREATE POLICY "owner_read_partner" ON partners FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "owner_update_partner" ON partners;
CREATE POLICY "owner_update_partner" ON partners FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
REVOKE ALL ON partners FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON partners TO authenticated;

-- Owners may change branding, never the slug, owner or active flag.
CREATE OR REPLACE FUNCTION protect_partner_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT is_admin() THEN
    NEW.slug := OLD.slug;
    NEW.owner_user_id := OLD.owner_user_id;
    NEW.is_active := OLD.is_active;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_partner_fields ON partners;
CREATE TRIGGER trg_protect_partner_fields BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION protect_partner_fields();

CREATE OR REPLACE VIEW public_partners WITH (security_barrier = true) AS
  SELECT slug, name, website, brand_color, logo_url FROM partners WHERE is_active;
REVOKE ALL ON public_partners FROM PUBLIC;
GRANT SELECT ON public_partners TO anon, authenticated;

CREATE TABLE IF NOT EXISTS partner_daily_stats (
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  lookups integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (partner_id, day)
);
ALTER TABLE partner_daily_stats ENABLE ROW LEVEL SECURITY;
-- No policies: only the two functions below touch it.
REVOKE ALL ON partner_daily_stats FROM anon, authenticated;

CREATE OR REPLACE FUNCTION track_partner_event(p_slug text, p_event text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  IF p_event NOT IN ('view', 'lookup', 'click') THEN RETURN; END IF;
  SELECT id INTO pid FROM partners WHERE slug = p_slug AND is_active;
  IF pid IS NULL THEN RETURN; END IF;
  INSERT INTO partner_daily_stats (partner_id, day, views, lookups, clicks)
  VALUES (pid, current_date, (p_event = 'view')::int, (p_event = 'lookup')::int, (p_event = 'click')::int)
  ON CONFLICT (partner_id, day) DO UPDATE SET
    views = partner_daily_stats.views + EXCLUDED.views,
    lookups = partner_daily_stats.lookups + EXCLUDED.lookups,
    clicks = partner_daily_stats.clicks + EXCLUDED.clicks;
END $$;
REVOKE ALL ON FUNCTION track_partner_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION track_partner_event(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION partner_stats(p_partner_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (day date, views integer, lookups integer, clicks integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin() OR EXISTS (SELECT 1 FROM partners WHERE id = p_partner_id AND owner_user_id = auth.uid())) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.day, s.views, s.lookups, s.clicks FROM partner_daily_stats s
    WHERE s.partner_id = p_partner_id AND s.day > current_date - LEAST(GREATEST(p_days, 1), 366)
    ORDER BY s.day;
END $$;
REVOKE ALL ON FUNCTION partner_stats(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_stats(uuid, integer) TO authenticated;

