/*
# Fix: AP election notifications wrote to a table nothing ever reads

## What was found
The AP Elections webhook (`createNotificationsForState`) wrote "race called"
and "results certified" notifications into `user_election_notifications`.
A client function (`getElectionNotifications` in `election-results.ts`)
exists to read that table, but it is never called from any page or
component — it's orphaned, same shape as the `saved_candidates` and
`ads.ts` findings from earlier audits. Meanwhile, the actual notification
bell in the header (`NotificationBell`) reads from a *different* table,
`notifications`. The two systems never talk to each other, so a user could
follow a race, have it get called by AP, and never see any notification
about it anywhere in the app.

## Fix
Widen the `notifications.type` check constraint to accept `race_called` and
`results_certified` (previously only had position_change / new_post / etc),
so the AP webhook can write directly into the table the bell actually reads
from, instead of the disconnected one.
*/

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'position_change', 'new_post', 'question_answered', 'new_voting_record',
    'new_event', 'new_endorsement', 'new_follower', 'team_invite',
    'race_called', 'results_certified'
  ));
