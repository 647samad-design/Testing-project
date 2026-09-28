/*
# Following a candidate never produced a single notification

## What was found
The notifications CHECK allows position_change, new_post, new_voting_record,
new_event, new_endorsement and new_follower, and Account settings offers an
"Updates on what you follow" toggle ("A major update to a candidate ... you
follow"), but nothing anywhere ever created any of those six types. Following
a candidate did nothing beyond adding them to a list.

## Fix
One SECURITY DEFINER function, notify_candidate_followers(), inserts a
notification for every follower of a candidate, and triggers call it when:

  feed_posts            a candidate post is published            -> new_post
  candidate_positions   a position is added or its text changes  -> position_change
  voting_records        a vote is recorded                       -> new_voting_record
  candidate_events      an event becomes approved                -> new_event
  campaign_events       a public campaign event is created       -> new_event
  candidate_endorsements an endorsement becomes approved          -> new_endorsement
  follows               someone follows a candidate               -> new_follower
                        (to that candidate's verified claimant only)

Rules:
- Respects notification_preferences.instant_followed_updates (no row = default on).
- Never notifies the person who made the change.
- Throttle: skips a follower who already has an UNREAD notification of the
  same type for the same candidate from the last 6 hours, so a bulk import of
  50 voting records produces one alert per follower, not 50.
- Only APPROVED events/endorsements notify (pending ones aren't public).
*/

CREATE OR REPLACE FUNCTION notify_candidate_followers(
  p_candidate_id uuid, p_type text, p_title text, p_body text
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  INSERT INTO notifications (user_id, type, title, body, candidate_id, is_read)
  SELECT f.user_id, p_type, p_title, p_body, p_candidate_id, false
  FROM follows f
  LEFT JOIN notification_preferences np ON np.user_id = f.user_id
  WHERE f.followable_type = 'candidate'
    AND f.followable_id = p_candidate_id
    AND f.user_id IS DISTINCT FROM auth.uid()
    AND COALESCE(np.instant_followed_updates, true)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = f.user_id AND n.type = p_type AND n.candidate_id = p_candidate_id
        AND n.is_read = false AND n.created_at > now() - interval '6 hours'
    );
$$;

REVOKE ALL ON FUNCTION notify_candidate_followers(uuid, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION candidate_display_name(p_candidate_id uuid)
RETURNS text SECURITY DEFINER STABLE SET search_path = public LANGUAGE sql AS $$
  SELECT trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) FROM candidates WHERE id = p_candidate_id;
$$;

CREATE OR REPLACE FUNCTION trg_notify_followers()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  who text;
BEGIN
  IF NEW.candidate_id IS NULL THEN RETURN NEW; END IF;
  who := coalesce(nullif(candidate_display_name(NEW.candidate_id), ''), 'A candidate you follow');

  IF TG_TABLE_NAME = 'feed_posts' THEN
    PERFORM notify_candidate_followers(NEW.candidate_id, 'new_post', who || ' posted an update', left(NEW.body, 140));

  ELSIF TG_TABLE_NAME = 'candidate_positions' THEN
    IF TG_OP = 'INSERT' OR NEW.summary IS DISTINCT FROM OLD.summary THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'position_change', who || ' has a new or updated position', left(NEW.summary, 140));
    END IF;

  ELSIF TG_TABLE_NAME = 'voting_records' THEN
    PERFORM notify_candidate_followers(NEW.candidate_id, 'new_voting_record', 'New vote recorded for ' || who, NEW.bill_name);

  ELSIF TG_TABLE_NAME = 'candidate_events' THEN
    IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'new_event', who || ' added an event', NEW.title);
    END IF;

  ELSIF TG_TABLE_NAME = 'campaign_events' THEN
    IF NEW.is_public THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'new_event', who || ' added an event', NEW.title);
    END IF;

  ELSIF TG_TABLE_NAME = 'candidate_endorsements' THEN
    IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'new_endorsement', who || ' was endorsed', NEW.endorser_name);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_followers_feed_posts ON feed_posts;
CREATE TRIGGER notify_followers_feed_posts AFTER INSERT ON feed_posts
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_positions ON candidate_positions;
CREATE TRIGGER notify_followers_positions AFTER INSERT OR UPDATE OF summary ON candidate_positions
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_voting_records ON voting_records;
CREATE TRIGGER notify_followers_voting_records AFTER INSERT ON voting_records
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_candidate_events ON candidate_events;
CREATE TRIGGER notify_followers_candidate_events AFTER INSERT OR UPDATE OF status ON candidate_events
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_campaign_events ON campaign_events;
CREATE TRIGGER notify_followers_campaign_events AFTER INSERT ON campaign_events
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_endorsements ON candidate_endorsements;
CREATE TRIGGER notify_followers_endorsements AFTER INSERT OR UPDATE OF status ON candidate_endorsements
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

-- new_follower: tell the candidate's verified claimant (not every follower).
CREATE OR REPLACE FUNCTION trg_notify_new_follower()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.followable_type <> 'candidate' THEN RETURN NEW; END IF;
  INSERT INTO notifications (user_id, type, title, body, candidate_id, is_read)
  SELECT cc.user_id, 'new_follower', 'You have a new follower',
         'A voter started following your profile.', NEW.followable_id, false
  FROM candidate_claims cc
  WHERE cc.candidate_id = NEW.followable_id AND cc.status = 'verified'
    AND cc.user_id IS DISTINCT FROM NEW.user_id
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = cc.user_id AND n.type = 'new_follower' AND n.candidate_id = NEW.followable_id
        AND n.is_read = false AND n.created_at > now() - interval '6 hours'
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_follower ON follows;
CREATE TRIGGER notify_new_follower AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION trg_notify_new_follower();
