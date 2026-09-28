/*
# Fix: the recipient of a message never got an in-app notification

20260913001800 ("sending a message never notified the recipient") only added
'new_message' to the allowed notification types. The notification itself is
inserted by sendMessage() in the browser, for the OTHER participant -- but the
notifications INSERT policy is `auth.uid() = user_id`, so that insert is always
rejected by RLS. sendMessage() didn't check the error, so it failed silently:
reproduced on a full migration replay ("new row violates row-level security
policy for table notifications"). The bell never showed a single message.

The notification is now created by the database when a message is inserted,
which is also safer than trusting title/body text sent from a browser:
- recipient = the conversation's other side (the voter, or the candidate user;
  if the conversation predates the claim, the candidate's verified claimant)
- title/body built server-side from the candidate's name and the message text
- never notifies the sender
The browser-side insert is removed in the same change.
*/

CREATE OR REPLACE FUNCTION notify_message_recipient()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  c record;
  recipient uuid;
  sender_label text;
BEGIN
  SELECT cv.voter_id, cv.candidate_id, cv.candidate_user_id INTO c
  FROM conversations cv WHERE cv.id = NEW.conversation_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.sender_id = c.voter_id THEN
    recipient := COALESCE(
      c.candidate_user_id,
      (SELECT cc.user_id FROM candidate_claims cc
        WHERE cc.candidate_id = c.candidate_id AND cc.status = 'verified'
        ORDER BY cc.reviewed_at DESC NULLS LAST LIMIT 1));
    sender_label := 'a voter';
  ELSE
    recipient := c.voter_id;
    sender_label := COALESCE(NULLIF(candidate_display_name(c.candidate_id), ''), 'the candidate');
  END IF;

  IF recipient IS NULL OR recipient = NEW.sender_id THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, type, title, body, is_read)
  VALUES (recipient, 'new_message', 'New message from ' || sender_label,
          CASE WHEN length(NEW.body) > 140 THEN left(NEW.body, 140) || '…' ELSE NEW.body END,
          false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_notify_recipient ON messages;
CREATE TRIGGER messages_notify_recipient
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_message_recipient();
