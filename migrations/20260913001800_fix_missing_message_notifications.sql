/*
# Fix: sending a message never notified the recipient

## What was found
`sendMessage()` inserts the message and bumps the conversation's
`last_message_at`, but never creates a notification or sends an email to
whoever it was sent to. A voter messaging a candidate's team, or a
candidate replying to a voter, had no way to know unless they happened to
have the Messages page open at that exact moment (the realtime subscription
only helps someone already viewing that specific conversation).

## Fix
Widen `notifications.type` to accept `new_message`, so the application code
(`sendMessage()` in `src/services/messaging.ts`) can notify the recipient
and send them an instant email — messages are a direct, personal
communication, not bulk content, so this happens regardless of digest
preferences (the same way a text message app doesn't ask if you want your
DMs "digested").
*/

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'position_change', 'new_post', 'question_answered', 'new_voting_record',
    'new_event', 'new_endorsement', 'new_follower', 'team_invite',
    'race_called', 'results_certified', 'election_reminder', 'new_message'
  ));
