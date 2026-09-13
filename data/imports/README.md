# Real Candidate Data — Sourcing Notes

## What's in `fl_2026_general_candidates.csv`
Four confirmed candidates from the November 3, 2026 Florida general election
(both statewide races with a settled ballot as of Sept 2026):

- **Governor:** Byron Donalds (R) vs. David Jolly (D)
- **Attorney General:** James Uthmeier (R, incumbent) vs. José Javier Rodríguez (D)

All facts (offices held, education, career background, primary results) were
verified against official/primary sources: House.gov, history.house.gov,
Congress.gov, and campaign websites, cross-checked against news coverage
(AP, NBC, WLRN, Florida Phoenix) from Aug–Sept 2026. Bios are written
originally for BallotLens, not copied from Ballotpedia or any other source —
BallotLens (like this codebase generally) doesn't reproduce other sites' text.

## How to import it
1. Go to **Admin Dashboard → Import Candidates**
2. Upload this CSV file
3. Review the preview, then click Import

## Why there are no photos
Deliberately left blank, for two reasons:
1. **Rights.** Most readily-available candidate photos (Ballotpedia, campaign
   sites) are campaign-submitted or copyrighted press photos — not something
   this platform has the right to rehost. The one clean exception is that
   **official U.S. government works — like a sitting member of Congress's
   official portrait — are public domain** under U.S. copyright law. Byron
   Donalds' official 117th Congress portrait, for example, is on Wikimedia
   Commons (a repository that only hosts confirmed public-domain/free-license
   images) and could be added safely: search "Byron Donalds official photo"
   on commons.wikimedia.org and verify the license tag before using it.
   The other three candidates here don't have a comparably clean public-domain
   photo available (Jolly and Rodríguez are no longer sitting members of
   Congress/the legislature; Uthmeier is a state, not federal, official).
2. **The platform already has a better path.** Once claimed, a candidate can
   upload their own photo through the Candidate Portal (goes through admin
   review before publishing) — see `src/pages/CandidatePortalPage.tsx`. That's
   both more reliable and avoids any rights question, since the candidate is
   supplying their own image.

## If you want broader coverage than these 4 races
This was a deliberately small, hand-verified sample — not a scraper. Florida
has hundreds of federal, state, and local races on the 2026 ballot. Scaling
this up for real would mean either:
- A paid data feed (this is exactly what the AP Elections API you signed up
  for is for — it includes candidate names/offices, not just results), or
- A proper scraping pipeline against Florida's Division of Elections
  candidate database with a human review step before anything goes live,
  since filing data varies in quality and completeness county by county.

Both are real projects, not something to bolt on casually — happy to scope
either one out with you when you're ready.
