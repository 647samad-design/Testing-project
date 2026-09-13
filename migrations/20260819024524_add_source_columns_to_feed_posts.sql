/*
# Add source columns to feed_posts for election results and news integration

## Purpose
Feed posts can now come from automated sources (AP Elections, Reuters, CNN, etc.) in addition
to candidates. The `source_name` and `source_url` fields identify the originating news source
so the feed can display "AP Elections", "Reuters", "CNN" etc. as the post author.

## Changes
### `feed_posts` table
- Add `source_name` (text, nullable) — e.g., "AP Elections", "Reuters", "CNN"
- Add `source_url` (text, nullable) — link to the original article or source

## Security
- No RLS changes needed. The edge function uses the service role key which bypasses RLS.
- Existing candidate-authored posts will have null source_name, which is handled gracefully.

## Notes
1. Uses ADD COLUMN IF NOT EXISTS for idempotency.
2. No data is lost — existing rows get null values for the new columns.
*/

ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS source_url text;
