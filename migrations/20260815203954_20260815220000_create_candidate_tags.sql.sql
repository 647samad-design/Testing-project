/*
# Create candidate_tags table

1. New Tables
- `candidate_tags` — stores user-applied informational tags on candidates
  - `id` (uuid, primary key)
  - `candidate_id` (uuid, references candidates, not null)
  - `user_id` (uuid, not null, defaults to auth.uid())
  - `tag` (text, not null — e.g. 'pro-black', 'pro-aipac', 'pro-life')
  - `created_at` (timestamptz, defaults to now())
  - Unique constraint on (candidate_id, user_id, tag) — one user can apply a tag once per candidate

2. Security
- RLS enabled.
- SELECT: anyone (anon + authenticated) can read tags — they are informational and public.
- INSERT: only authenticated users can tag, and only for themselves (user_id = auth.uid()).
- DELETE: only authenticated users can remove their own tags.
- UPDATE: not needed — tags are add/remove only.

3. Notes
- Tags are informational labels (e.g. "Pro-Black", "Pro-AIPAC", "Pro-Life") to help voters
  identify candidates' positions. They are not endorsements or negative labels.
- The unique constraint prevents duplicate tags from the same user on the same candidate.
*/

CREATE TABLE IF NOT EXISTS candidate_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_tags_unique UNIQUE (candidate_id, user_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_candidate_tags_candidate ON candidate_tags(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_tags_tag ON candidate_tags(tag);

ALTER TABLE candidate_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_candidate_tags" ON candidate_tags;
CREATE POLICY "public_read_candidate_tags" ON candidate_tags FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_candidate_tags" ON candidate_tags;
CREATE POLICY "insert_own_candidate_tags" ON candidate_tags FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_candidate_tags" ON candidate_tags;
CREATE POLICY "delete_own_candidate_tags" ON candidate_tags FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
