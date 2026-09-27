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
