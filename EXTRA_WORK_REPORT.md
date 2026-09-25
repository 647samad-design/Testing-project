# Report 2 — Extra Work Beyond the Original PDF Scope
_BallotLens Voter Platform_

## A. New functionality added (beyond the original PDF)

- AP Elections API integration (live/certified results + admin refresh button)
- Candidate Management ($299) — Team Invites feature
- Candidate Management — Campaign Pages & Events (with RSVP)
- Admin: grant/revoke free "comped" Candidate Management access
- Bulk candidate import (CSV/JSON upload)
- Real Florida 2026 candidate data added (Governor + Attorney General races)
- Free-tier watchlist limit (5 candidates free, unlimited paid)
- AI usage limits (5/day free, 100/day paid) — "Expanded AI Research"
- Email notification system (instant alerts + daily/weekly digest, settings page)
- Admin Billing Overview tab
- Account Billing tab — purchase date + full feature list per plan
- Persistent notification bell in the header
- 6 missing pages built (About, How It Works, Methodology, Sources, Accessibility, Contact)
- Logo + brand identity — done

## B. Bugs found and fixed (not requested, found during development/testing)

- Privilege escalation — any user could make themselves an admin
- `is_admin()` permission bug breaking almost every page/action
- Payment fraud — users could get a paid plan for free
- Candidate content submissions had no review workflow (never went live)
- Team invites had no real paywall enforcement
- Personal data (follow lists, campaign team emails) publicly exposed
- Campaign pages stayed public after subscription cancellation
- Follower counts broke, then fixed
- 5 pages incorrectly showing "please sign in" for logged-in users
- "Watchlist" feature was completely fake (showed random candidates)
- Election-result notifications never reached anyone
- "Election Reminder" toggle did nothing
- Fact-check submissions ("Lens This") always silently failed

## C. Found, not built (flagged for a future decision)

- Content reporting / moderation system
- Two separate "Events" systems (original free + new paid) — could be merged
- A few pieces of dead/unused code in the schema (harmless, cleanup item)
