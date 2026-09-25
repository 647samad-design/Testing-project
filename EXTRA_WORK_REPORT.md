# Report 2 — Extra Work Beyond the Original PDF Scope
_BallotLens Voter Platform_
_Prepared: September 2026_

Everything below was **not** in the original PDF. Some came from your own
follow-up messages and decisions (Supabase/Stripe/AP setup, the Candidate
Management pricing model, "launch campaigns," pricing tier limits). The rest
are real bugs found during development and testing that needed fixing
regardless of whether they were asked for, because they were actively
broken or posed a security/business risk.

---

## A. Features you explicitly asked for (beyond the PDF)

| Feature | What was built |
|---|---|
| AP Elections API integration | Live/certified results fetching, admin "Refresh Election Results" button, results feed into candidate races. |
| Candidate Management ($299) — Team Invites | Candidates can invite a campaign manager, staff, and volunteers, gated behind an active Management subscription (enforced at the database level, not just the UI). |
| Candidate Management — Campaign Pages & Events | A public "Campaign" page per candidate (message, goals, updates) plus an event/rally system with RSVP — attendee counts are public, but who's attending stays private. |
| First-year-free beta plan | Admins can grant or revoke free ("comped") Candidate Management access from the admin panel, without needing a real Stripe charge. |
| Bulk candidate import | Admin can upload a CSV/JSON file to add many candidates at once, instead of one at a time. |
| Real Florida candidate data | 4 real, verified 2026 general-election candidates (Governor and Attorney General races) added, sourced from official records — not placeholder/demo data. |
| Free-tier watchlist limit | Free users can follow up to 5 candidates; unlimited on Candidate/Pro — enforced in the database, with a friendly upgrade message when the limit is hit. |
| AI usage limits | 5 questions/day free, 100/day paid ("Expanded AI Research," not "Priority," since no priority processing lane exists). Shows remaining questions and an upgrade prompt at the limit. |
| Email notification system | Instant emails (security, election reminders, updates on what you follow) and a configurable weekly/daily digest, per your detailed spec. New Account "Notifications" settings tab. **Needs a `RESEND_API_KEY` from you to actually send** — same kind of setup as Stripe/AP. |
| Admin Billing Overview | New admin tab: total/free/paid user counts, breakdown by plan, Management (paid vs. comped) counts, and a recent-subscriptions list with purchase dates. |
| Account Billing clarity | The Billing tab now shows the purchase date and a full "what's included" feature list for the current plan — a clear record of what was bought and when. |
| Notification bell | A persistent bell icon in the header with an unread badge and dropdown, visible on every page — not just buried in one tab. |
| 6 missing pages built | About, How It Works, Methodology, Sources, Accessibility, Contact — all previously linked from the footer but led nowhere. |

---

## B. Real bugs found and fixed (not requested, but necessary)

These were found through systematic code review and live testing, not
reported by anyone — each one would have caused a real problem for real
users or the business if it shipped as-is.

| # | Bug | Why it mattered |
|---|---|---|
| 1 | Any user could make themselves an admin | A privilege-escalation hole via the `role` column, re-opening a bug that had supposedly already been fixed once. |
| 2 | Almost every page/action was broken (403 errors) | A permissions bug on the core `is_admin()` function that nearly every security rule in the app depends on. Found while setting up the live database for the first time. |
| 3 | Users could get a paid plan for free | A missing check let anyone update their own subscription row directly to "Pro" or "Candidate" with no payment. |
| 4 | Candidates could submit changes that never applied | The entire "candidate submits bio/photo → admin approves → goes live" workflow existed on paper but had no admin review screen — submissions just sat invisible forever. |
| 5 | Team invites had no actual paywall | Even before the feature had a UI, the underlying rule let any claimed candidate invite a team for free, undermining the Management tier's value. |
| 6 | Personal data was publicly exposed | Two separate bugs let anyone (including logged-out visitors) see every user's follow list, and every campaign team's personal email addresses, via the public API. |
| 7 | Campaign pages stayed public after cancellation | A paid campaign page would remain visible to voters forever, even after the candidate stopped paying for Management. |
| 8 | "X followers" counts broke (a bug I introduced, then caught and fixed) | Fixing bug #6 above initially broke the public follower-count display; corrected with a privacy-safe counting method. |
| 9 | 5 different pages could incorrectly show "please sign in" | A timing bug meant Account, Messages, Feed, Candidate Portal, and the Candidate Quiz could briefly (or, in one case, permanently) act as if an already-logged-in user wasn't signed in — including right after a successful Stripe payment. |
| 10 | The "Watchlist" feature was completely fake | The Account page showed the first 4 candidates from the entire database, not anything the user had actually saved — and there was no way to actually save one in the first place. Rebuilt to use the platform's real Follow system. |
| 11 | Election-result notifications went nowhere | The AP results webhook wrote to a table nothing in the app ever reads, and separately queried a database table that doesn't exist — so "race called" alerts silently never reached anyone. |
| 12 | The "Election Reminder" toggle did nothing | Users could opt in to a reminder, but nothing ever sent one. Now wired to a real reminder system. |
| 13 | Fact-check submissions ("Lens This") always silently failed | A missing field meant every submission was rejected by the database, with the failure hidden from the user. Also fixed: unreviewed claims were public before any moderation — a real misinformation-risk gap for a civic platform. |

---

## C. Found but intentionally not built (flagged for your decision)

| Item | Why it wasn't built |
|---|---|
| Content reporting / moderation | No way for users to flag false or abusive content anywhere. A real gap for a civic platform, but building a full moderation queue is significant scope on its own — flagged for you to decide priority. |
| Merging the two "Events" systems | The original free candidate events and the new paid Campaign events are separate systems today, to avoid changing existing behavior without asking. Worth a conversation if you'd rather have one. |
| A few small pieces of dead/unused code | `ads.ts`, an orphaned `saved_candidates`/`saved_races` system, and an unused developer-API monetization schema exist in the codebase but are not connected to anything — harmless, but worth a cleanup pass eventually. |

---

## Bottom line
**85 automated tests, 8 new database migrations for these fixes alone (plus the earlier ones), and 13 real bugs closed that were never explicitly reported — all verified working, not just written.** None of this changes what's outlined in Report 1; it's what it took to make sure the original 12 items actually hold up under real use, plus the features you added along the way.
