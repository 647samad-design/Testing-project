/*
Partners: newsrooms, nonprofits, schools and campaigns that put the
"Find your ballot" widget on their own websites (white-label embed).

partners              - one per organization; admins create them and pick
                        the owner account. The owner can edit branding only.
partner_daily_stats   - widget views / ZIP lookups / click-throughs per day.
                        Written only through track_partner_event() (no direct
                        writes), read only through partner_stats() by the
                        partner's owner or an admin.
public_partners       - the branding the public widget needs, nothing else.
*/

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$'),
  website text CHECK (website IS NULL OR website ~ '^https?://'),
  brand_color text NOT NULL DEFAULT '#15776c' CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text CHECK (logo_url IS NULL OR logo_url ~ '^https://'),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_partners" ON partners;
CREATE POLICY "admin_all_partners" ON partners FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "owner_read_partner" ON partners;
CREATE POLICY "owner_read_partner" ON partners FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "owner_update_partner" ON partners;
CREATE POLICY "owner_update_partner" ON partners FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
REVOKE ALL ON partners FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON partners TO authenticated;

-- Owners may change branding, never the slug, owner or active flag.
CREATE OR REPLACE FUNCTION protect_partner_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT is_admin() THEN
    NEW.slug := OLD.slug;
    NEW.owner_user_id := OLD.owner_user_id;
    NEW.is_active := OLD.is_active;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_partner_fields ON partners;
CREATE TRIGGER trg_protect_partner_fields BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION protect_partner_fields();

CREATE OR REPLACE VIEW public_partners WITH (security_barrier = true) AS
  SELECT slug, name, website, brand_color, logo_url FROM partners WHERE is_active;
REVOKE ALL ON public_partners FROM PUBLIC;
GRANT SELECT ON public_partners TO anon, authenticated;

CREATE TABLE IF NOT EXISTS partner_daily_stats (
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  lookups integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (partner_id, day)
);
ALTER TABLE partner_daily_stats ENABLE ROW LEVEL SECURITY;
-- No policies: only the two functions below touch it.
REVOKE ALL ON partner_daily_stats FROM anon, authenticated;

CREATE OR REPLACE FUNCTION track_partner_event(p_slug text, p_event text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  IF p_event NOT IN ('view', 'lookup', 'click') THEN RETURN; END IF;
  SELECT id INTO pid FROM partners WHERE slug = p_slug AND is_active;
  IF pid IS NULL THEN RETURN; END IF;
  INSERT INTO partner_daily_stats (partner_id, day, views, lookups, clicks)
  VALUES (pid, current_date, (p_event = 'view')::int, (p_event = 'lookup')::int, (p_event = 'click')::int)
  ON CONFLICT (partner_id, day) DO UPDATE SET
    views = partner_daily_stats.views + EXCLUDED.views,
    lookups = partner_daily_stats.lookups + EXCLUDED.lookups,
    clicks = partner_daily_stats.clicks + EXCLUDED.clicks;
END $$;
REVOKE ALL ON FUNCTION track_partner_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION track_partner_event(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION partner_stats(p_partner_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (day date, views integer, lookups integer, clicks integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin() OR EXISTS (SELECT 1 FROM partners WHERE id = p_partner_id AND owner_user_id = auth.uid())) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.day, s.views, s.lookups, s.clicks FROM partner_daily_stats s
    WHERE s.partner_id = p_partner_id AND s.day > current_date - LEAST(GREATEST(p_days, 1), 366)
    ORDER BY s.day;
END $$;
REVOKE ALL ON FUNCTION partner_stats(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_stats(uuid, integer) TO authenticated;
