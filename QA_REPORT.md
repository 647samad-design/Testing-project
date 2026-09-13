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

## Still open (by design — needs your input, not more coding)
- Real Stripe/AP Elections/Supabase secrets (see previous message).
- Legal pages need an actual lawyer pass before launch.
- Candidate photo *sourcing* from Ballotpedia/FL DOS at scale — infrastructure is
  ready (upload + review queue), but bulk-importing real people's photos/data from
  external sites needs a data-use decision, not just code.
- A "Billing" view on the Account page (see above).
