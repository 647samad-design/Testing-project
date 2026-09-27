/**
 * Safely parses a plain "YYYY-MM-DD" date-only string (no time component)
 * as a LOCAL calendar date, not UTC midnight.
 *
 * This fixes a genuinely critical bug: `election_date`, `event_date` (on
 * candidate_events and feed_posts), and `election_date`/`next_election_date`
 * (on candidate_profile_extras) are all plain SQL `date` columns with no
 * time or timezone. When a value like "2026-11-03" comes back from
 * Supabase and gets passed straight into `new Date("2026-11-03")`,
 * JavaScript parses date-only ISO strings as UTC MIDNIGHT — not local
 * midnight. For anyone in a timezone west of UTC (this includes the
 * entire United States), converting that UTC-midnight instant back to
 * local time for display shows the day BEFORE the actual date. On a
 * voting platform, that means Election Day itself — the single most
 * important date anywhere in the app — could display one full day
 * earlier than it actually is, along with every candidate event and
 * every "election reminder" countdown built on the same value.
 *
 * The fix: parse the year/month/day components directly and construct
 * the Date using the LOCAL-time constructor (`new Date(year, month, day)`),
 * which has no UTC-shift problem since there's no timezone conversion
 * involved in interpreting a calendar date this way.
 *
 * Do NOT use this for genuine timestamps that already include a time and
 * timezone (e.g. campaign_events.event_date, which is `timestamptz` and
 * correctly represents a specific moment in time) — only for plain
 * date-only values.
 */
export function parseDateOnly(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Formats a plain date-only string ("YYYY-MM-DD", no time/timezone) as
 * "Mon D, YYYY" for display — e.g. voting record dates, source publication
 * dates, statement dates, bar admission dates, social/news post dates.
 *
 * This exact implementation (new Date(dateStr) -> toLocaleDateString())
 * was independently duplicated, bug and all, in 5 separate files
 * (EvidenceCard, NewsCard, SourceCard, and local copies inside
 * CandidateProfilePage and NewsPage) — every one of them showed the wrong
 * calendar day for anyone in a timezone behind UTC, same root cause as
 * parseDateOnly's other callers. Consolidated into one correctly-
 * implemented function so this specific bug can't reappear the same way
 * in a sixth place later.
 */
export function formatDate(dateStr: string): string {
  const d = parseDateOnly(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
