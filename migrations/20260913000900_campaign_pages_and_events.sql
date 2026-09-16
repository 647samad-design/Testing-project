/*
# Candidate Campaign Pages + Events (Candidate Management feature)

## Purpose
Implements the "launch campaigns" half of the Candidate Management ($299)
promise (team invites were the other half, already built). Per the client:
Option 1 (a dedicated campaign page: message, goals, updates, live "while
they are running or while a race is going") + Option 2 (event/rally
listings), gated behind an active Management subscription, same as team
invites.

## New Tables
### `campaigns`
One row per candidate's active campaign message/page content.
- `candidate_id` (unique — one active campaign page per candidate)
- `headline`, `message` (the "why I'm running" pitch)
- `goals` (jsonb array of short goal strings, e.g. ["Lower property taxes", "..."])
- `is_active` (candidate/team can toggle the page visible/hidden without deleting it)

### `campaign_events`
Rally/event listings tied to a candidate's campaign.
- `title`, `description`, `location`, `event_date`, `is_public`

### `campaign_event_rsvps`
Voter RSVPs ("I'm Going") for an event.
- One row per (event, user). Attendee **counts** are public (social proof for
  the campaign); WHO attends is private — only visible to the candidate's own
  team and the voter's own record of their own RSVP, never to other voters or
  the public API.

## Security
- `campaigns` / `campaign_events`: public read (this is the candidate's own
  public-facing marketing content, same visibility level as their bio).
  Write access requires `has_active_management()` (reused from the team-invite
  migration) AND being a verified claimant or active team member — same
  pattern as `campaign_team`.
- `campaign_event_rsvps`: a voter can insert/delete their own RSVP and read
  their OWN row; the candidate's team can read all RSVPs for their own event
  (to see who's coming); nobody else can read individual rows. A public
  RPC (`get_event_rsvp_count`) exposes just the count.
*/

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
  headline text,
  message text,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_active_campaigns" ON campaigns;
CREATE POLICY "public_read_active_campaigns" ON campaigns FOR SELECT
  TO anon, authenticated USING (is_active = true OR is_admin());

DROP POLICY IF EXISTS "management_write_campaigns" ON campaigns;
CREATE POLICY "management_write_campaigns" ON campaigns FOR ALL
  TO authenticated USING (
    is_admin()
    OR (
      has_active_management(campaigns.candidate_id)
      AND EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = campaigns.candidate_id
          AND ct.user_id = auth.uid()
          AND ct.status = 'active'
      )
    )
  ) WITH CHECK (
    is_admin()
    OR (
      has_active_management(campaigns.candidate_id)
      AND EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = campaigns.candidate_id
          AND ct.user_id = auth.uid()
          AND ct.status = 'active'
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_campaigns_candidate ON campaigns(candidate_id);

CREATE TABLE IF NOT EXISTS campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  event_date timestamptz NOT NULL,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_campaign_events" ON campaign_events;
CREATE POLICY "public_read_campaign_events" ON campaign_events FOR SELECT
  TO anon, authenticated USING (is_public = true OR is_admin());

DROP POLICY IF EXISTS "management_write_campaign_events" ON campaign_events;
CREATE POLICY "management_write_campaign_events" ON campaign_events FOR ALL
  TO authenticated USING (
    is_admin()
    OR (
      has_active_management(campaign_events.candidate_id)
      AND EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = campaign_events.candidate_id
          AND ct.user_id = auth.uid()
          AND ct.status = 'active'
      )
    )
  ) WITH CHECK (
    is_admin()
    OR (
      has_active_management(campaign_events.candidate_id)
      AND EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = campaign_events.candidate_id
          AND ct.user_id = auth.uid()
          AND ct.status = 'active'
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_campaign_events_candidate ON campaign_events(candidate_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_date ON campaign_events(event_date);

CREATE TABLE IF NOT EXISTS campaign_event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES campaign_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE campaign_event_rsvps ENABLE ROW LEVEL SECURITY;

-- A voter can only ever see their OWN rsvp row (not who else is attending).
DROP POLICY IF EXISTS "read_own_rsvp" ON campaign_event_rsvps;
CREATE POLICY "read_own_rsvp" ON campaign_event_rsvps FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM campaign_events ce
      JOIN campaign_team ct ON ct.candidate_id = ce.candidate_id
      WHERE ce.id = campaign_event_rsvps.event_id
        AND ct.user_id = auth.uid()
        AND ct.status = 'active'
    )
  );

DROP POLICY IF EXISTS "insert_own_rsvp" ON campaign_event_rsvps;
CREATE POLICY "insert_own_rsvp" ON campaign_event_rsvps FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_rsvp" ON campaign_event_rsvps;
CREATE POLICY "delete_own_rsvp" ON campaign_event_rsvps FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rsvps_event ON campaign_event_rsvps(event_id);

-- Public, privacy-safe way to show "42 people going" without exposing who.
CREATE OR REPLACE FUNCTION get_event_rsvp_count(p_event_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::integer FROM campaign_event_rsvps WHERE event_id = p_event_id;
$$;

REVOKE ALL ON FUNCTION get_event_rsvp_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_event_rsvp_count(uuid) TO anon, authenticated;

-- Lets a voter check just their own "am I going?" status for a batch of events
-- without needing broad SELECT on the table (defense in depth on top of RLS).
CREATE OR REPLACE FUNCTION get_my_rsvp_event_ids(p_event_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(array_agg(event_id), ARRAY[]::uuid[])
  FROM campaign_event_rsvps
  WHERE user_id = auth.uid() AND event_id = ANY(p_event_ids);
$$;

REVOKE ALL ON FUNCTION get_my_rsvp_event_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_rsvp_event_ids(uuid[]) TO authenticated;
