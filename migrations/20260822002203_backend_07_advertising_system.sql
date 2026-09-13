/*
# Backend Architecture: Advertising System Refactor

## Purpose
Create a normalized advertising structure with campaigns, targeting, impressions, and clicks.
The existing `advertisements` table is kept as-is. New tables add structure around it.

## New Tables

### `ad_campaigns`
- Groups advertisements under an advertiser's campaign
- `id` (uuid PK), `advertiser_id` FK → advertisers, `name`, `description`, `budget_cents` (integer),
  `daily_budget_cents` (integer nullable), `start_date`, `end_date`, `status` (default 'draft'),
  `target_state`, `target_city`, `target_zip`, `target_district_id` FK → districts,
  `created_at`, `updated_at`

### `ad_targeting`
- Per-advertisement geographic targeting
- `id` (uuid PK), `advertisement_id` FK → advertisements, `state_id` FK → states,
  `city_id` FK → cities, `district_id` FK → districts, `zip_code` (text), `created_at`

### `ad_impressions`
- Individual impression tracking
- `id` (uuid PK), `advertisement_id` FK, `user_id` (nullable), `session_id` (nullable),
  `page_url` (nullable), `device_type` (nullable), `created_at`

### `ad_clicks`
- Individual click tracking
- `id` (uuid PK), `advertisement_id` FK, `user_id` (nullable), `session_id` (nullable),
  `page_url` (nullable), `destination_url`, `created_at`

## Security
- `ad_campaigns`: advertiser can CRUD own; admin can CRUD all; public read (active)
- `ad_targeting`: public read; advertiser+admin write
- `ad_impressions`: public insert; own+admin read
- `ad_clicks`: public insert; own+admin read

## Notes
1. Existing `advertisements` table and its data are fully preserved.
2. `ad_campaigns.budget_cents` is in cents (integer) — no float money.
3. Advertising placement never affects candidate rankings.
4. The existing `ad_events` table is preserved for backward compatibility.
*/

-- Ad campaigns
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  budget_cents integer,
  daily_budget_cents integer,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'active', 'paused', 'completed', 'rejected')),
  target_state text,
  target_city text,
  target_zip text,
  target_district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_active_campaigns" ON ad_campaigns;
CREATE POLICY "public_read_active_campaigns" ON ad_campaigns FOR SELECT
  TO anon, authenticated USING (
    status IN ('active', 'completed') OR
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = ad_campaigns.advertiser_id AND a.user_id = auth.uid()) OR
    is_admin()
  );

DROP POLICY IF EXISTS "advertiser_insert_campaigns" ON ad_campaigns;
CREATE POLICY "advertiser_insert_campaigns" ON ad_campaigns FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = ad_campaigns.advertiser_id AND a.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "advertiser_update_campaigns" ON ad_campaigns;
CREATE POLICY "advertiser_update_campaigns" ON ad_campaigns FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = ad_campaigns.advertiser_id AND a.user_id = auth.uid()) OR
    is_admin()
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = ad_campaigns.advertiser_id AND a.user_id = auth.uid()) OR
    is_admin()
  );

DROP POLICY IF EXISTS "advertiser_delete_campaigns" ON ad_campaigns;
CREATE POLICY "advertiser_delete_campaigns" ON ad_campaigns FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = ad_campaigns.advertiser_id AND a.user_id = auth.uid()) OR
    is_admin()
  );

-- Ad targeting
CREATE TABLE IF NOT EXISTS ad_targeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  state_id uuid REFERENCES states(id) ON DELETE CASCADE,
  city_id uuid REFERENCES cities(id) ON DELETE CASCADE,
  district_id uuid REFERENCES districts(id) ON DELETE CASCADE,
  zip_code text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ad_targeting ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_ad_targeting" ON ad_targeting;
CREATE POLICY "public_read_ad_targeting" ON ad_targeting FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "advertiser_insert_ad_targeting" ON ad_targeting;
CREATE POLICY "advertiser_insert_ad_targeting" ON ad_targeting FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_targeting.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  );

DROP POLICY IF EXISTS "advertiser_update_ad_targeting" ON ad_targeting;
CREATE POLICY "advertiser_update_ad_targeting" ON ad_targeting FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_targeting.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_targeting.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  );

DROP POLICY IF EXISTS "advertiser_delete_ad_targeting" ON ad_targeting;
CREATE POLICY "advertiser_delete_ad_targeting" ON ad_targeting FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_targeting.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  );

-- Ad impressions
CREATE TABLE IF NOT EXISTS ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  session_id text,
  page_url text,
  device_type text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_ad_impressions" ON ad_impressions;
CREATE POLICY "public_insert_ad_impressions" ON ad_impressions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "read_own_ad_impressions" ON ad_impressions;
CREATE POLICY "read_own_ad_impressions" ON ad_impressions FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_impressions.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  );

-- Ad clicks
CREATE TABLE IF NOT EXISTS ad_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  session_id text,
  page_url text,
  destination_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ad_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_ad_clicks" ON ad_clicks;
CREATE POLICY "public_insert_ad_clicks" ON ad_clicks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "read_own_ad_clicks" ON ad_clicks;
CREATE POLICY "read_own_ad_clicks" ON ad_clicks FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_clicks.advertisement_id AND a.user_id = auth.uid()
    ) OR is_admin()
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_advertiser ON ad_campaigns(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ad_targeting_ad ON ad_targeting(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad ON ad_impressions(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_created ON ad_impressions(created_at);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_ad ON ad_clicks(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_created ON ad_clicks(created_at);
