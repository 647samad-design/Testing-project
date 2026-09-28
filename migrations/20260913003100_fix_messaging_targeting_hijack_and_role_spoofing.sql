/*
# Fix: voters could message (and email) ANY user, hijack conversations, and
# label their own messages as the candidate's

Reproduced on a full migration replay:

A. insert_own_conversations only checked `auth.uid() = voter_id`. The voter
   chose `candidate_user_id` freely, so they could open a conversation "with a
   candidate" whose other participant was any user id on the platform. That
   user then saw it in their inbox, and send-message-notification emails "the
   other participant" -- i.e. BallotLens-branded email to anyone. It also
   blocked the voter's legitimate conversation with that candidate (unique
   voter_id + candidate_id).

B. update_own_conversations let either participant change any column, so a
   conversation could be redirected afterwards by rewriting candidate_user_id,
   candidate_id or voter_id.

C. messages.sender_role was taken as given, so a voter could insert a message
   marked 'candidate'. The current UI decides "me vs them" by sender_id, but
   anything that trusts sender_role (exports, admin review, notifications)
   would show it as the candidate speaking.

## Fix
A. The other participant must be NULL (the candidate hasn't been claimed yet;
   the verified claimant can still see it via the existing claim clause) or
   the candidate's verified claimant, and never the voter themself.
B. A trigger rejects changes to voter_id / candidate_id / candidate_user_id
   from anon/authenticated. Read markers and last_message_at stay editable,
   which is all the app updates.
C. sender_role is derived from the conversation on insert and can't be set.
*/

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = voter_id
    AND candidate_user_id IS DISTINCT FROM voter_id
    AND (
      candidate_user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = conversations.candidate_id
          AND cc.user_id = conversations.candidate_user_id
          AND cc.status = 'verified'
      )
    )
  );

CREATE OR REPLACE FUNCTION protect_conversation_participants()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
       NEW.voter_id IS DISTINCT FROM OLD.voter_id
    OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
    OR NEW.candidate_user_id IS DISTINCT FROM OLD.candidate_user_id
  ) THEN
    RAISE EXCEPTION 'Conversation participants cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_protect_participants ON conversations;
CREATE TRIGGER conversations_protect_participants
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION protect_conversation_participants();

CREATE OR REPLACE FUNCTION set_message_sender_role()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_voter uuid;
BEGIN
  SELECT voter_id INTO v_voter FROM conversations WHERE id = NEW.conversation_id;
  NEW.sender_role := CASE WHEN NEW.sender_id = v_voter THEN 'voter' ELSE 'candidate' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_set_sender_role ON messages;
CREATE TRIGGER messages_set_sender_role
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION set_message_sender_role();
