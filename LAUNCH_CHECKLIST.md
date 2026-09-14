# BallotLens — Launch Readiness Checklist
_Maps every item from `BallotLens_Recommendations.pdf` to the exact files that implement it, so you can verify each one yourself._

Legend: ✅ Code complete &nbsp; 🟡 Code complete, needs external input to go live &nbsp; ⏭️ Skipped per your instruction

---

## 1. Stripe / payment integration + subscription gating — 🟡
**Code:**
- `supabase/functions/create-checkout-session/index.ts` — creates a Stripe Checkout session for Candidate/Pro/Management plans
- `supabase/functions/stripe-webhook/index.ts` — handles subscription created/updated/canceled events, writes to `subscriptions` and `candidate_management_subscriptions`
- `src/services/stripe.ts` — client function that calls the checkout function and redirects to Stripe
- `src/pages/PricingPage.tsx` — pricing UI wired to real checkout, monthly/yearly toggle, confirmed prices ($9/$89 Candidate, $29/$289 Pro)
- `src/pages/CandidatePortalPage.tsx` — "Upgrade to Management — $299" button (Overview tab)
- `migrations/20260913000100_pricing_tiers_and_candidate_management.sql` — DB schema for new plan tiers + management subscriptions table

**What's missing before it actually processes money:** your real Stripe secret key + 5 price IDs added as Supabase Edge Function secrets (names listed in `.env.example`). Buttons will show a clear error toast until then — they won't silently fail.

## 2. Admin panel: edit/delete + manage list view — ✅
**Code:** `src/pages/AdminDashboardPage.tsx` → **"Manage Candidates"** tab (list, inline edit, delete, photo), **"Admins"** tab (grant/revoke), **"Content Submissions"** tab (approve/reject candidate self-edits), **"Activity Log"** tab (audit trail).
Backing functions: `src/services/admin.ts` (`updateCandidate`, `deleteCandidate`, `deleteSource`, `deleteElection`, `deleteBallotMeasure`, `listProfilesForAdmin`, `setAdminRole`, `listPendingSubmissions`, `approveSubmission`, `rejectSubmission`).

## 3. Candidate photo upload — ✅
**Code:** `src/components/shared/PhotoUpload.tsx` (validates type/size, uploads to Supabase Storage). Wired in two places:
- Admin: `AdminDashboardPage.tsx` → Manage Candidates tab, and Add Candidate form
- Self-service: `CandidatePortalPage.tsx` → Overview tab (goes through admin review, doesn't publish instantly)
**DB:** `migrations/20260913000200_candidate_photos_storage_bucket.sql` — bucket + RLS.

## 4. Admin role management UI — ✅
**Code:** `AdminDashboardPage.tsx` → **"Admins"** tab. Grant/revoke via the safe `set_admin_role()` RPC (`migrations/20260913000000...sql`), which blocks an admin from removing their own access.

## 5. Audit log for admin actions — ✅
**Code:** `audit_log` table + `log_admin_action()` RPC (`migrations/20260913000000...sql`). Every admin write (verify, flag, add, edit, delete, role change, submission approval) logs automatically — see `src/services/admin.ts`. Viewable in `AdminDashboardPage.tsx` → **"Activity Log"** tab.

## 6. Error handling + loading states (admin forms) — ✅
**Code:** All four "Add" forms and both new tabs in `AdminDashboardPage.tsx` now wrap saves in try/catch with a `toast.error(...)` on failure and a disabled/"Saving…" button state while in flight, instead of failing silently.

## 7. Legal pages (Privacy, Terms, Disclaimer) — 🟡
**Code:** `src/pages/legal/PrivacyPolicyPage.tsx`, `TermsOfServicePage.tsx`, `DisclaimerPage.tsx` — routed at `/privacy`, `/terms`, `/disclaimer`, linked from the footer (`src/components/shared/Layout.tsx`). Uses your provided LLC name, Miami address, and Florida jurisdiction.
**What's missing:** an actual attorney review — these are template drafts, and each page says so at the bottom.

## 8. Full security / RLS audit — ✅
**Full findings:** `SECURITY_AUDIT.md`. Headline: found and fixed a **live privilege-escalation bug** — any user could set their own `profiles.role = 'admin'` and a trigger would silently grant them admin (`migrations/20260913000300_fix_role_column_privilege_escalation.sql`). All 101 tables confirmed to have RLS enabled.

## 9. Logo + brand identity design — ⏭️ Skipped
Per your last instruction. Not touched.

## 10. QA / testing pass across the full app — 🟡
**Code:** Vitest + React Testing Library added (`npm test`), 16 tests in `src/services/__tests__/` and `src/components/shared/__tests__/`, covering the new admin/Stripe/photo-upload code. Full findings and what's *not* covered: `QA_REPORT.md`.
**What's missing:** this is a starting test suite, not exhaustive manual QA of every existing page/flow (onboarding, quiz, messaging, feed, etc. weren't in scope of this pass).

## 11. Custom domain + production deployment — ⏭️ Skipped
Per your last instruction. Also outside what I can do directly (infra/DNS step, not code).

## 12. Basic SEO setup — ✅
**Code:** `index.html` (meta description, keywords, canonical, Open Graph, Twitter card, JSON-LD), `public/robots.txt`, `public/sitemap.xml`.
**Note:** sitemap covers static top-level pages only — individual candidate/contest pages would need a dynamic sitemap generated at deploy time, not something a static file can do.

---

## Bonus fixes found during the audit (not on the original PDF list, but real bugs)
- **Candidate self-service submissions had no approval path at all** — a candidate could submit a new bio/photo and it would sit invisible forever. Fixed: `migrations/20260913000400_fix_candidate_submission_review_workflow.sql` + Admin "Content Submissions" tab. Full writeup in `QA_REPORT.md`.
- `Subscription.plan` TypeScript type still only listed the old placeholder pricing — updated to match the real tiers (`src/types/index.ts`).

## Still open — needs your input, not more code
- [ ] Stripe secret key + 5 price IDs → Supabase Edge Function secrets
- [ ] AP Elections API key → same
- [ ] Apply the 7 new SQL migrations to your live Supabase project (up to `20260913000600`)
- [ ] Lawyer review of the 3 legal pages
- [x] ~~A "Billing" view on the Account page~~ — done, see `/account` → Billing tab
- [ ] Real candidate photo sourcing from Ballotpedia / FL DOS at scale (upload infra is ready; bulk-pulling real people's data is a separate data-use decision)
