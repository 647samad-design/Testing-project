-- Story categories
CREATE TABLE IF NOT EXISTS story_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE story_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_story_categories" ON story_categories;
CREATE POLICY "public_read_story_categories" ON story_categories FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admin_write_story_categories" ON story_categories;
CREATE POLICY "admin_write_story_categories" ON story_categories FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_story_categories" ON story_categories;
CREATE POLICY "admin_update_story_categories" ON story_categories FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_story_categories" ON story_categories;
CREATE POLICY "admin_delete_story_categories" ON story_categories FOR DELETE
  TO authenticated USING (is_admin());

INSERT INTO story_categories (name, slug, description, color) VALUES
  ('Civic Education', 'civic-education', 'How government works and why it matters', 'emerald'),
  ('Election Analysis', 'election-analysis', 'Breaking down election results and trends', 'blue'),
  ('Voter Stories', 'voter-stories', 'Real people, real civic engagement', 'amber'),
  ('Local Politics', 'local-politics', 'City council, school boards, and local impact', 'teal'),
  ('Legislation Explained', 'legislation-explained', 'Plain-English breakdowns of bills and laws', 'rose'),
  ('Off-Season', 'off-season', 'Keeping you engaged between elections', 'violet')
ON CONFLICT (slug) DO NOTHING;

-- Stories
CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  body text NOT NULL,
  category_id uuid REFERENCES story_categories(id) ON DELETE SET NULL,
  author_name text,
  hero_image_url text,
  tags text,
  is_featured boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  read_time_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stories_published ON stories(is_published);
CREATE INDEX IF NOT EXISTS idx_stories_category ON stories(category_id);
CREATE INDEX IF NOT EXISTS idx_stories_featured ON stories(is_featured);
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_stories" ON stories;
CREATE POLICY "public_read_stories" ON stories FOR SELECT
  TO anon, authenticated USING (is_published = true);
DROP POLICY IF EXISTS "admin_write_stories" ON stories;
CREATE POLICY "admin_write_stories" ON stories FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_stories" ON stories;
CREATE POLICY "admin_update_stories" ON stories FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_stories" ON stories;
CREATE POLICY "admin_delete_stories" ON stories FOR DELETE
  TO authenticated USING (is_admin());
