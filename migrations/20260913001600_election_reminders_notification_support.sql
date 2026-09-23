/*
# Fix: "Election Reminder" toggle saved a preference but never sent anything

## What was found
`toggleElectionReminder()` (wired up correctly in `CandidateProfileExtras.tsx`)
lets a user opt in to a reminder for a candidate's race, and correctly saves
a row to `candidate_election_reminders`. But nothing anywhere — no edge
function, no cron, no digest — ever reads that table to actually send a
reminder. The toggle was a no-op from the user's perspective: they'd flip
it on and nothing would ever happen. This also left a gap in the client's
email spec, which explicitly lists "election reminders... upcoming Election
Day reminders" as an INSTANT (not digest) email category.

## Fix
Add `election_id` to `notifications` (so a reminder can be deduplicated per
user+election, the same way `candidate_id` already links other notification
types) and widen the type constraint to include `election_reminder`. The
`send-election-reminders` edge function (added alongside this migration)
does the actual sending.
*/

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS election_id uuid REFERENCES elections(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_election ON notifications(election_id);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'position_change', 'new_post', 'question_answered', 'new_voting_record',
    'new_event', 'new_endorsement', 'new_follower', 'team_invite',
    'race_called', 'results_certified', 'election_reminder'
  ));
