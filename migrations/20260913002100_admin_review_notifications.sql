/*
# Fix: admins had zero notification when something needed review

## What was found
Across every "submit for review" flow in the app (candidate claims,
candidate content/bio/photo submissions, and the funding source /
endorsement / get-to-know profile extras built in an earlier pass), nothing
ever told an admin that something new was waiting. The admin dashboard's
review tabs work correctly once opened, but there is no notifyAdmins()
mechanism anywhere — an admin only finds out by manually re-checking every
tab periodically. For candidate claims specifically, a delayed review means
a candidate can't manage their own profile during what may be a critical
campaign window.

## Fix
Widen notifications.type to accept `admin_review_needed`, so the
application code can notify every admin (via the same notification bell
already built for regular users) the moment a candidate claim or content
submission comes in — the two highest-priority review queues.
*/

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'position_change', 'new_post', 'question_answered', 'new_voting_record',
    'new_event', 'new_endorsement', 'new_follower', 'team_invite',
    'race_called', 'results_certified', 'election_reminder', 'new_message',
    'admin_review_needed'
  ));

-- notifications' INSERT policy is auth.uid() = user_id, correctly
-- preventing a regular user from writing a notification into anyone else's
-- inbox — which also blocks the legitimate case of "tell every admin
-- something needs review." This SECURITY DEFINER function is the narrow,
-- safe exception: it only ever creates admin_review_needed notifications,
-- addressed to actual admins, so it can't be used to spam or impersonate.
CREATE OR REPLACE FUNCTION notify_admins_of_pending_review(p_title text, p_body text)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, is_read)
  SELECT id, 'admin_review_needed', p_title, p_body, false
  FROM profiles
  WHERE is_admin = true;
END;
$$;

REVOKE ALL ON FUNCTION notify_admins_of_pending_review(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify_admins_of_pending_review(text, text) TO authenticated;
