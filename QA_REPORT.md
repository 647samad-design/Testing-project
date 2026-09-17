# BallotLens — QA Pass & Full Project Review
_Sept 13, 2026_

## Automated tests added
No test framework existed before this pass. Added Vitest + React Testing Library
(`npm test` to run). 16 tests, all passing, covering the highest-risk new code:
- `src/services/__tests__/admin.test.ts` — candidate CRUD, audit logging (including
  that a logging failure never blocks the actual admin action), admin role RPC calls.
- `src/services/__tests__/stripe.test.ts` — checkout: no-session error, edge-function
  error surfaced, missing-URL error, successful redirect.
- `src/components/shared/__tests__/PhotoUpload.test.tsx` — file type/size validation,
  successful upload, upload failure handling, remove-photo flow.

This is a starting test suite, not full coverage — there's no test yet for React
Router pages end-to-end, RLS policies (needs a real Postgres instance to test
properly), or the Stripe webhook handler. Worth expanding before a wider launch.

## 🔴 Found & fixed: candidates could submit content, but nothing ever approved it
The Candidate Portal lets a verified candidate submit bio, photo, links, etc.
(`candidate_submissions` table, status `pending`). Nobody — no admin policy, no UI,
no function — could ever see or approve those submissions. Every self-service edit
a candidate made would sit invisible forever, and their profile would never actually
update. This directly undercuts the "claiming unlocks ownership of your profile"
promise from the pricing decision.

**Fixed:**
- Migration `20260913000400`: admin can now read/update `candidate_submissions`;
  new `apply_candidate_submission()` RPC approves a submission and, for the 8 fields
  that map to a real `candidates` column (bio, education, professional_background,
  previous_offices, military_service, public_service, website_url, photo_url),
  writes the value straight to the live profile. `reject_candidate_submission()`
  handles rejections with a note.
- New admin dashboard tab, **Content Submissions** — list, approve, reject.
- Candidate Portal overview tab now has a working **Profile Photo** upload that
  submits through this same review queue, and a **Candidate Management ($299)**
  upgrade button.

**Note:** fields like `social_facebook`, `campaign_email`, `position_statement`
don't have a destination column yet — approving those marks them approved but
flags it in the response so admins know to follow up manually. If these matter
for launch, they need a real destination (likely `candidate_profile_extras` or a
new table) — flagging as a follow-up, not fixed in this pass.

## 🟡 Found, fixed the type — UI still needed
`Subscription.plan` in `src/types/index.ts` only listed `'premium_monthly' |
'premium_yearly'`, which predates the confirmed Candidate/Pro pricing. Fixed the
type. However, **`AccountPage.tsx` has no subscription/billing display at all** —
a paying user currently can't see their plan, renewal date, or cancel from the
app. Not fixed in this pass (that page is already ~800 lines and gamification-heavy;
a rushed edit there risked breaking the streak/journey features). Recommend a
dedicated "Billing" tab as the next piece of work.

## Reviewed and confirmed OK (no action needed)
- `candidate_claims.status` values (`pending`/`verified`/`rejected`) match what the
  new Candidate Management RLS policy checks against.
- The old `candidate_services` table is now unused by the claim/management flow
  (replaced by `candidate_management_subscriptions`) — harmless to leave, safe to
  drop in a later cleanup migration if you want to tidy the schema.
- No stale references to the removed `STRIPE_CANDIDATE_CLAIM_PRICE_ID` anywhere
  in the codebase.
- Build, typecheck, and lint all pass with no new warnings from this batch of work.

## 🔴 Found & fixed while re-reviewing the Billing tab (Sept 14)
`getMySubscription()` and `getMyManagedCandidates()` (used by the new Account
→ Billing tab) queried their tables with no explicit `user_id`/ownership
filter, relying only on RLS to scope results to "my own" row. That's correct
for a regular user, but an **admin's** RLS policy is intentionally broader
(`is_admin() OR own row`) — so an admin opening their own Billing tab would
have pulled back *every* user's subscription row. `getMySubscription()` uses
`.maybeSingle()`, which throws if more than one row comes back, so this would
have crashed the Billing tab for any admin as soon as a second real
subscription existed in the database. `getMyManagedCandidates()` had the
matching bug — an admin would see every claimed candidate's management
status, not just their own.

**Fixed:** both functions now explicitly resolve the current user's id first
and filter by it, regardless of what RLS would additionally allow. Added 4
tests (`stripe.test.ts`) asserting the filter is always applied and that an
unauthenticated call fails fast instead of silently over-fetching.

**Pattern to watch for going forward:** any query written for a "my own
stuff" screen should filter explicitly by the current user's id in the
client code, not rely solely on RLS — because RLS for admins is often
intentionally wider, "correct for security" and "correct for a personal
dashboard" aren't the same thing. One pre-existing example of this same
shape exists in `src/services/advertising.ts:84` (`.from('advertisers')
.select('*').maybeSingle()` with no filter) — not touched in this pass since
it predates this work, but worth the same fix later.

## 🔴 Found & fixed live (Sept 14) — broken "follows" queries
`getFollowedCandidates()` and `getFollowedIssues()` (Feed page) used PostgREST's
embedded-resource syntax (`candidates!inner(...)`) on `follows.followable_id`.
That column is polymorphic (can point at a candidate OR an issue), so it has
no real foreign key — PostgREST can't auto-detect the join, and the query
always failed with a 400 "could not find relationship" error. Fixed by
fetching the follow rows and the target rows (candidates or issues)
separately and merging them in JS, in `src/services/social.ts`.

## 🔴 Found & fixed (Sept 14) — "invite build teams" was never actually built
The client's confirmed pricing decision (Option B) explicitly said Candidate
Management should unlock the ability to "invite build teams." The backend
functions (`inviteTeamMember`, `getTeamMembers`, etc. in `social.ts`) existed,
but **no UI anywhere in the app** called them — there was no way for a
candidate to actually invite anyone. Worse, the underlying database rule for
who's allowed to invite (`insert_campaign_team` RLS policy) only checked that
the caller had a *verified claim*, not that they'd paid for Management — a
free-tier candidate could already invite a team through the API even before
any UI existed for it.

**Fixed:**
- New **"Team"** tab in the Candidate Portal — shows an upgrade prompt if the
  candidate doesn't have an active Management subscription, or an invite
  form + team member list if they do.
- Migration `20260913000700_gate_team_invites_behind_management.sql` adds a
  real database-level check (`has_active_management()`) so the paywall can't
  be bypassed by calling the API directly, regardless of what UI exists.




## 🔴 Found & fixed (Sept 15) — full-app QA pass
Expanded automated test coverage beyond the initial admin/Stripe/photo-upload
pass, going through `messaging.ts`, `social.ts`, and `quiz.ts` — the areas
flagged as untested in the previous QA note (feed/follows, messaging, quiz).
27 new tests added (`messaging.test.ts`, `social.test.ts`, `quiz.test.ts`),
bringing the suite to 33 tests. This surfaced a serious, real bug along the
way: see the "public data exposure" finding in `SECURITY_AUDIT.md` (follows
and campaign_team tables were readable by anyone, and two `social.ts`
functions had no user filter — same root cause as the earlier Billing tab
bug). Both are fixed as part of this pass.

Still not covered by automated tests: feed post creation/moderation,
notifications, candidate-portal submission flow end-to-end, and most page
components (these were reviewed manually only). A full app still benefits
from broader integration/E2E tests before a large-scale launch.

## 🔴 Found & fixed (Sept 15) — legal pages had non-functional styling
The three legal pages (`Privacy`, `Terms`, `Disclaimer`) used Tailwind's
`prose` typography classes, but the `@tailwindcss/typography` plugin that
defines those classes was never installed or registered in
`tailwind.config.js` — meaning the styling classes were silently doing
nothing since these pages were first created. Fixed by installing the plugin
and registering it. Also substantially expanded the legal content itself
(added a table of contents, defined-terms structure, CCPA/California
section, cookies section, data retention, security, dispute
resolution/governing law, and other sections a reviewing attorney would
expect to see present or explicitly flagged as a placeholder) and improved
typography (serif display headings, larger reading size, proper heading
hierarchy) so the pages read as a professional draft rather than a bare
paragraph dump.



## 🔴 Found & fixed (Sept 15) — three gaps in the freshly-built Campaign feature
Re-reviewed the "launch campaigns" feature immediately after building it (same session) and found:
1. **Campaign visibility didn't track subscription status.** The public read
   policies on `campaigns`/`campaign_events` only checked the `is_active`
   flag, never whether the candidate's Management subscription was actually
   still active — a campaign page would stay publicly visible forever even
   after cancellation. Fixed in `20260913001000` by requiring
   `has_active_management()` on the public read side too, not just writes.
2. **No way to comp free Management access.** The client's stated plan is a
   free first beta year for all candidates, but there was no admin
   function or UI to grant Management without a real Stripe charge. Added
   `compCandidateManagement()` / `revokeCandidateManagement()` and a
   "Grant Free Management" / "Revoke Management" button in the admin
   "Manage Candidates" tab.
3. **No per-event visibility toggle** in the Candidate Portal's event form,
   even though the schema supported hiding individual events — every new
   event was hardcoded to `is_public: true`. Added the toggle.



## 🔴 Found & fixed (Sept 15) — final full-codebase sweep
Did a complete review pass across every remaining service file looking for
the two bug patterns established earlier in this project (missing
explicit user-id filters relying only on RLS, and `.maybeSingle()` calls
that assume at most one row when that isn't actually guaranteed). Found and
fixed:
- `advertising.ts`: `getMyAdvertiserProfile()` had no user filter — same
  root cause as the Billing tab bug. Fixed, with tests.
- `ai.ts`: `assessClaim()` used `.maybeSingle()` on an ILIKE fuzzy-text
  search — as soon as two claims in the database had similar wording, this
  would throw a "multiple rows returned" error instead of just picking the
  best match. Switched to `.limit(1)`.
- `voter-profile.ts`: `getJourneySteps()` queried a per-user table with no
  explicit user filter. RLS on this table happens to be strict enough that
  it wasn't exploitable in practice, but fixed anyway for consistency and
  defense-in-depth, matching the pattern used everywhere else in the
  codebase now.

Also reviewed (found safe, no change needed): `user_issues` queries in
`districts.ts` rely on RLS with no `is_admin()`-widened policy, so they're
provably scoped correctly today; `civic.ts`'s `getOfficeDescription()` uses
an exact-match ILIKE (not a wildcard search) so a multi-row collision is
much less likely, left as a minor known risk rather than a live bug.
`ads.ts` has the same missing-filter pattern but the entire file is unused
dead code (see earlier finding) so it was left alone.

Suite is now 56 tests, up from 53.

## 🔴 Found & fixed (Sept 17) — scroll position bug on navigation
Clicking any link (e.g. a footer link like "Premium") while scrolled down
landed on the new page still scrolled to the same position, instead of at
the top. React Router doesn't reset scroll on navigation by default. Fixed
with a `ScrollToTop` component that resets `window.scrollTo(0,0)` on every
route change.

## 🔴 Found & fixed (Sept 17) — paid-tier features were pure marketing copy, not enforced
The client raised a sharp question: what does a paying user actually get
that a free user doesn't? Auditing every promise on the Pricing page found:
- **"Ad-free browsing"** — `AdSlot` had zero subscription check; paid and
  free users saw identical ads. **Fixed**: paid users (any active
  Candidate/Pro tier) now skip ad fetching/rendering entirely, via a new
  `useIsPaidUser()` hook (`src/hooks/use-subscription.ts`) backed by a
  request-deduped cache (`src/services/subscription-cache.ts`) so multiple
  `<AdSlot>`s on one page share a single subscription lookup instead of each
  querying it separately.
- **"Save unlimited candidates"** — the free tier was *already* unlimited
  (no cap exists anywhere), so this "paid perk" was meaningless from day
  one. **Not fixed in this pass** — this is a product decision (should free
  actually be capped at some number, e.g. 10?), not something to guess at
  in code without the client weighing in.
- **"Email alerts when new info is added"** — there is no email-sending
  infrastructure in the codebase at all (no Resend/SendGrid/etc integration,
  no edge function for it). This is a fully unbuilt feature, not a gating
  bug. **Not built in this pass** — needs a real scoping conversation
  (which email provider, what triggers an alert, digest vs. instant).
- **"Priority AI research requests" / "Ask BallotLens AI (limited)"** —
  no rate limiting or tiering exists anywhere for AI usage; free and paid
  users get identical, unlimited access today. **Not fixed in this pass** —
  needs a decision on what the free-tier limit actually is (N requests/day?
  slower model?) before it can be built correctly.
- **"Advanced candidate comparison tools"** — the Compare page has no
  plan-based feature differences; reviewed and confirmed no separate
  "advanced" mode exists to gate.

**Bottom line, stated plainly:** before this fix, a paying customer got
billing/portal access and nothing else — none of the four other listed
perks were technically enforced. Ad-free is now real. The other three
(watchlist cap, email alerts, AI limits) need product decisions from the
client before they can be built correctly — recommend raising this with
them directly rather than guessing at limits.

## 🔴 Found & fixed (Sept 17) — no confirmation after a successful payment
After Stripe redirects back to `/account?checkout=success`, nothing told
the user their payment went through or which plan they landed on — the
Billing tab would just show whatever was already loaded, which could still
briefly say "Free" since the webhook that updates the plan can take a
second or two to arrive after the redirect. Fixed: the Billing tab now
detects the `checkout=success` param, briefly polls for the plan to update
(webhook lag), shows a toast confirming which plan is now active (or a
graceful "still finishing setup" message if the webhook is unusually slow),
invalidates the subscription cache so ad-free/etc. reflect immediately, and
opens directly on the Billing tab instead of the default Dashboard tab so
the confirmation is the first thing the user sees.

## 🔴 Found & fixed (Sept 17) — 6 footer links went nowhere
`About`, `How It Works`, `Methodology`, `Sources`, `Accessibility`, and
`Contact` were all linked in the footer, but none of those routes existed —
clicking any of them silently fell through to the wildcard route and
re-rendered the landing page, with no error and no indication anything was
wrong. Built real content pages for all 6 (`src/pages/company/`) and
registered the routes. `Sources` pulls live data from the `sources` table
rather than being static copy.

## 🔴 Found & fixed (Sept 17) — no way for an admin to reach the Admin Dashboard
There was no link to `/admin` anywhere in the UI — an admin had to know and
type the URL directly. Added a conditional "Admin" link (shown only when
`profile.is_admin` is true) to both the desktop header and the mobile menu.

## 🔴 Found & fixed (Sept 17) — a regression I introduced myself, plus a notifications bug
Two more issues while continuing to sweep the app:

1. **Regression from the earlier `follows` privacy fix.** Restricting `follows`
   SELECT to each user's own rows (correctly fixing the PII leak) broke
   `getFollowerCount()` — used by `FollowButton` to show "42 people follow
   this candidate" — because a direct table count now only counts the
   *current user's own* follow row under the new RLS, not the true public
   total. Fixed with the same pattern as the campaign RSVP counts: a
   SECURITY DEFINER RPC (`get_follow_count`) that returns just the count,
   keeping individual follow records private while the aggregate stays
   public. This is a good example of why every RLS tightening needs a check
   for "does anything legitimately need the old broader access, just in
   aggregate form" before shipping it.
2. **Notifications had no explicit user filter.** `getNotifications()` and
   `markAllNotificationsRead()` queried/updated the `notifications` table
   with no `user_id` filter, relying entirely on RLS. RLS here is strict
   (`auth.uid() = user_id`, no admin-widening clause) so this wasn't
   actually exploitable — but fixed anyway for consistency with the pattern
   used everywhere else, and because relying on "RLS happens to be strict
   today" is fragile if that policy is ever touched later.

5 new tests. Suite now 67.

## Still open (by design — needs your input, not more coding)



- Real Stripe/AP Elections/Supabase secrets (see previous message).
- Legal pages are now content-complete and properly styled, ready for lawyer review.
- Candidate photo *sourcing* from Ballotpedia/FL DOS at scale — infrastructure is
  ready (upload + review queue), but bulk-importing real people's photos/data from
  external sites needs a data-use decision, not just code.
- ~~A "Billing" view on the Account page~~ — done.
- ~~"Launch campaigns"~~ — done (campaign page + events + RSVP, gated behind Management).
- The app now has two separate "events" concepts (the original free,
  admin-moderated `candidate_events` and the new Management-gated
  `campaign_events`). Kept them separate to avoid changing existing behavior
  — worth a conversation with the client on whether to consolidate.
