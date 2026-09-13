/*
# Monetization + Candidate Portal Schema

## Summary
Adds the database infrastructure for three revenue streams and a
candidate self-service portal:

1. **Advertising** — advertisers create accounts, upload ad creative,
   target by geography/placement, and track impressions/clicks. Ads are
   completely separate from candidate rankings and editorial content.
2. **Sponsorship** — sponsors can underwrite election guides and civic
   education pages. Sponsorships are always clearly labeled.
3. **Candidate profile claiming** — candidates can claim their profile
   (like a Google Business listing), submit bio/website/social/contact
   info, position statements, questionnaire responses, and events. All
   submissions go through admin approval before becoming public. Paid
   profile management services are tracked but never affect rankings.
4. **Subscriptions** — premium voter subscriptions with Stripe
   integration tracking (customer/subscription IDs, plan, status).

## New tables
- `advertisers` — advertiser accounts (linked to auth user)
- `advertisements` — individual ad creatives with targeting + status
- `ad_events` — impression and click tracking (append-only)
- `sponsors` — sponsor profiles
- `sponsorships` — sponsorship placements on specific pages
- `sponsor_events` — impression/click tracking for sponsorships
- `candidate_claims` — a candidate's request to claim their profile
- `candidate_submissions` — candidate-provided info pending admin approval
- `candidate_events` — upcoming campaign events submitted by candidates
- `candidate_questionnaire_responses` — candidate answers to questionnaire items
- `subscriptions` — premium subscription records tied to Stripe
- `ad_plans` — admin-configurable advertising pricing tiers
- `candidate_service_plans` — admin-configurable candidate service pricing

## Security
- RLS enabled on every table.
- Public can read only active/published ads, sponsors, sponsorships,
  approved candidate submissions, and verified candidate claims.
- Advertisers can CRUD their own ads and read their own analytics.
- Candidates can read/submit their own claims, submissions, events,
  questionnaire responses — nothing is auto-published.
- Admins can manage everything.
- Subscription records are only visible to the owning user + admins.
- No secrets are stored in these tables (Stripe keys live in edge
  function secrets, not the DB).

## Notes
- Ad/sponsor placements never interact with candidate sorting or
  editorial content — they are rendered in dedicated ad slots only.
- Candidate submissions have a `status` column: pending → approved →
  rejected. Only `approved` rows are visible to the public.
- Candidate claims have a `status` column: pending → verified / rejected.
  A verified claim grants the candidate user ownership of that profile's
  submissions.
*/

-- =========================================================================
-- advertisers
-- =========================================================================
CREATE TABLE IF NOT EXISTS advertisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  logo_url text,
  website_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE advertisers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_advertiser" ON advertisers;
CREATE POLICY "select_own_advertiser" ON advertisers FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "insert_own_advertiser" ON advertisers;
CREATE POLICY "insert_own_advertiser" ON advertisers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_advertiser" ON advertisers;
CREATE POLICY "update_own_advertiser" ON advertisers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "admin_delete_advertiser" ON advertisers;
CREATE POLICY "admin_delete_advertiser" ON advertisers FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- advertisements
-- =========================================================================
CREATE TABLE IF NOT EXISTS advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  campaign_name text NOT NULL,
  ad_title text NOT NULL,
  ad_description text,
  image_url text,
  destination_url text NOT NULL,
  ad_type text NOT NULL CHECK (ad_type IN ('banner','square','sidebar','mobile','sponsored_content')) DEFAULT 'banner',
  placement text NOT NULL CHECK (placement IN
    ('homepage','candidates_page','candidate_profile','issues_page','election_page','news_page','search','mobile','footer','sidebar')) DEFAULT 'homepage',
  target_state text,
  target_city text,
  target_zip text,
  target_district text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  budget numeric(10,2),
  status text NOT NULL CHECK (status IN ('draft','pending','active','paused','rejected','expired')) DEFAULT 'draft',
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_advertiser ON advertisements(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ads_placement_status ON advertisements(placement, status);
CREATE INDEX IF NOT EXISTS idx_ads_target_state ON advertisements(target_state);

ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

-- Public can see only active, in-date-range ads
DROP POLICY IF EXISTS "public_read_active_ads" ON advertisements;
CREATE POLICY "public_read_active_ads" ON advertisements FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND start_date <= CURRENT_DATE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  );

-- Advertisers can see their own ads (any status); admins see all
DROP POLICY IF EXISTS "read_own_ads" ON advertisements;
CREATE POLICY "read_own_ads" ON advertisements FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "insert_own_ads" ON advertisements;
CREATE POLICY "insert_own_ads" ON advertisements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_ads" ON advertisements;
CREATE POLICY "update_own_ads" ON advertisements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "delete_own_ads" ON advertisements;
CREATE POLICY "delete_own_ads" ON advertisements FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM advertisers a WHERE a.id = advertisements.advertiser_id AND a.user_id = auth.uid())
    OR is_admin()
  );

-- =========================================================================
-- ad_events (impression + click tracking, append-only)
-- =========================================================================
CREATE TABLE IF NOT EXISTS ad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression','click')),
  viewer_state text,
  viewer_zip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_events_ad ON ad_events(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_events_type ON ad_events(event_type);

ALTER TABLE ad_events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can log an impression or click
DROP POLICY IF EXISTS "public_insert_ad_events" ON ad_events;
CREATE POLICY "public_insert_ad_events" ON ad_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Advertisers and admins can read events for their own ads
DROP POLICY IF EXISTS "read_own_ad_events" ON ad_events;
CREATE POLICY "read_own_ad_events" ON ad_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM advertisements ad
      JOIN advertisers a ON a.id = ad.advertiser_id
      WHERE ad.id = ad_events.advertisement_id AND a.user_id = auth.uid()
    )
    OR is_admin()
  );

-- =========================================================================
-- sponsors
-- =========================================================================
CREATE TABLE IF NOT EXISTS sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  sponsor_name text NOT NULL,
  contact_email text NOT NULL,
  logo_url text,
  website_url text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_sponsors" ON sponsors;
CREATE POLICY "public_read_sponsors" ON sponsors FOR SELECT
  TO anon, authenticated USING (is_active = true OR is_admin());

DROP POLICY IF EXISTS "insert_sponsors" ON sponsors;
CREATE POLICY "insert_sponsors" ON sponsors FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "update_sponsors" ON sponsors;
CREATE POLICY "update_sponsors" ON sponsors FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "delete_sponsors" ON sponsors;
CREATE POLICY "delete_sponsors" ON sponsors FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- sponsorships
-- =========================================================================
CREATE TABLE IF NOT EXISTS sponsorships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  campaign_name text NOT NULL,
  placement text NOT NULL CHECK (placement IN
    ('election_guide','voter_education','election_calendar','educational_article','civic_page','ballot_page')),
  target_state text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  budget numeric(10,2),
  status text NOT NULL CHECK (status IN ('draft','pending','active','paused','expired')) DEFAULT 'draft',
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsorships_sponsor ON sponsorships(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sponsorships_placement_status ON sponsorships(placement, status);

ALTER TABLE sponsorships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_sponsorships" ON sponsorships;
CREATE POLICY "public_read_sponsorships" ON sponsorships FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND start_date <= CURRENT_DATE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  );

DROP POLICY IF EXISTS "read_all_sponsorships" ON sponsorships;
CREATE POLICY "read_all_sponsorships" ON sponsorships FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sponsors s WHERE s.id = sponsorships.sponsor_id AND s.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "insert_sponsorships" ON sponsorships;
CREATE POLICY "insert_sponsorships" ON sponsorships FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sponsors s WHERE s.id = sponsorships.sponsor_id AND s.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "update_sponsorships" ON sponsorships;
CREATE POLICY "update_sponsorships" ON sponsorships FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sponsors s WHERE s.id = sponsorships.sponsor_id AND s.user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM sponsors s WHERE s.id = sponsorships.sponsor_id AND s.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "delete_sponsorships" ON sponsorships;
CREATE POLICY "delete_sponsorships" ON sponsorships FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- sponsor_events (impression + click tracking)
-- =========================================================================
CREATE TABLE IF NOT EXISTS sponsor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsorship_id uuid NOT NULL REFERENCES sponsorships(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression','click')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_events_sponsorship ON sponsor_events(sponsorship_id);

ALTER TABLE sponsor_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_sponsor_events" ON sponsor_events;
CREATE POLICY "public_insert_sponsor_events" ON sponsor_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "read_own_sponsor_events" ON sponsor_events;
CREATE POLICY "read_own_sponsor_events" ON sponsor_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sponsorships sp
      JOIN sponsors s ON s.id = sp.sponsor_id
      WHERE sp.id = sponsor_events.sponsorship_id AND s.user_id = auth.uid()
    )
    OR is_admin()
  );

-- =========================================================================
-- candidate_claims
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  campaign_name text,
  office text,
  email text NOT NULL,
  campaign_website text,
  verification_notes text,
  status text NOT NULL CHECK (status IN ('pending','verified','rejected')) DEFAULT 'pending',
  admin_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_claims_candidate ON candidate_claims(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_claims_user ON candidate_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_candidate_claims_status ON candidate_claims(status);

ALTER TABLE candidate_claims ENABLE ROW LEVEL SECURITY;

-- Public can see that a claim exists and is verified (to show the badge)
DROP POLICY IF EXISTS "public_read_verified_claims" ON candidate_claims;
CREATE POLICY "public_read_verified_claims" ON candidate_claims FOR SELECT
  TO anon, authenticated
  USING (status = 'verified');

-- Claimants can see their own claims; admins see all
DROP POLICY IF EXISTS "read_own_claims" ON candidate_claims;
CREATE POLICY "read_own_claims" ON candidate_claims FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_own_claim" ON candidate_claims;
CREATE POLICY "insert_own_claim" ON candidate_claims FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_claim" ON candidate_claims;
CREATE POLICY "update_own_claim" ON candidate_claims FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "delete_own_claim" ON candidate_claims;
CREATE POLICY "delete_own_claim" ON candidate_claims FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin());

-- =========================================================================
-- candidate_submissions (candidate-provided info pending approval)
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name text NOT NULL CHECK (field_name IN
    ('bio','education','professional_background','previous_offices','military_service',
     'public_service','website_url','photo_url','campaign_email','campaign_phone',
     'social_facebook','social_twitter','social_instagram','social_linkedin',
     'position_statement')),
  field_value text,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  admin_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_submissions_candidate ON candidate_submissions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_submissions_status ON candidate_submissions(status);

ALTER TABLE candidate_submissions ENABLE ROW LEVEL SECURITY;

-- Public can see only approved submissions
DROP POLICY IF EXISTS "public_read_approved_submissions" ON candidate_submissions;
CREATE POLICY "public_read_approved_submissions" ON candidate_submissions FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- Candidates can see their own submissions; admins see all
DROP POLICY IF EXISTS "read_own_submissions" ON candidate_submissions;
CREATE POLICY "read_own_submissions" ON candidate_submissions FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_own_submission" ON candidate_submissions;
CREATE POLICY "insert_own_submission" ON candidate_submissions FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_submission" ON candidate_submissions;
CREATE POLICY "update_own_submission" ON candidate_submissions FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "delete_own_submission" ON candidate_submissions;
CREATE POLICY "delete_own_submission" ON candidate_submissions FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin());

-- =========================================================================
-- candidate_questionnaire_responses
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_questionnaire_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_responses_candidate ON candidate_questionnaire_responses(candidate_id);

ALTER TABLE candidate_questionnaire_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_approved_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "public_read_approved_questionnaire" ON candidate_questionnaire_responses FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS "read_own_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "read_own_questionnaire" ON candidate_questionnaire_responses FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_own_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "insert_own_questionnaire" ON candidate_questionnaire_responses FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "update_own_questionnaire" ON candidate_questionnaire_responses FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "delete_own_questionnaire" ON candidate_questionnaire_responses;
CREATE POLICY "delete_own_questionnaire" ON candidate_questionnaire_responses FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin());

-- =========================================================================
-- candidate_events
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time text,
  end_time text,
  location_name text,
  address text,
  city text,
  state text,
  virtual_url text,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_events_candidate ON candidate_events(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_events_date ON candidate_events(event_date);

ALTER TABLE candidate_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_approved_events" ON candidate_events;
CREATE POLICY "public_read_approved_events" ON candidate_events FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' AND event_date >= CURRENT_DATE);

DROP POLICY IF EXISTS "read_own_events" ON candidate_events;
CREATE POLICY "read_own_events" ON candidate_events FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_own_event" ON candidate_events;
CREATE POLICY "insert_own_event" ON candidate_events FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_event" ON candidate_events;
CREATE POLICY "update_own_event" ON candidate_events FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "delete_own_event" ON candidate_events;
CREATE POLICY "delete_own_event" ON candidate_events FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin());

-- =========================================================================
-- subscriptions (premium voter subscriptions)
-- =========================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('free','premium_monthly','premium_yearly')) DEFAULT 'free',
  status text NOT NULL CHECK (status IN ('active','canceled','past_due','trialing','expired')) DEFAULT 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscription" ON subscriptions;
CREATE POLICY "select_own_subscription" ON subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "insert_own_subscription" ON subscriptions;
CREATE POLICY "insert_own_subscription" ON subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "update_own_subscription" ON subscriptions;
CREATE POLICY "update_own_subscription" ON subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "delete_own_subscription" ON subscriptions;
CREATE POLICY "delete_own_subscription" ON subscriptions FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- ad_plans (admin-configurable advertising pricing)
-- =========================================================================
CREATE TABLE IF NOT EXISTS ad_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name text NOT NULL,
  description text,
  monthly_price numeric(10,2) NOT NULL,
  features text[],
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_ad_plans" ON ad_plans;
CREATE POLICY "public_read_ad_plans" ON ad_plans FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_write_ad_plans" ON ad_plans;
CREATE POLICY "admin_write_ad_plans" ON ad_plans FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_ad_plans" ON ad_plans;
CREATE POLICY "admin_update_ad_plans" ON ad_plans FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_ad_plans" ON ad_plans;
CREATE POLICY "admin_delete_ad_plans" ON ad_plans FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- candidate_service_plans (admin-configurable candidate service pricing)
-- =========================================================================
CREATE TABLE IF NOT EXISTS candidate_service_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name text NOT NULL,
  description text,
  annual_price numeric(10,2) NOT NULL,
  features text[],
  is_active boolean NOT NULL DEFAULT true,
  is_available boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE candidate_service_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_candidate_service_plans" ON candidate_service_plans;
CREATE POLICY "public_read_candidate_service_plans" ON candidate_service_plans FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_write_candidate_service_plans" ON candidate_service_plans;
CREATE POLICY "admin_write_candidate_service_plans" ON candidate_service_plans FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_update_candidate_service_plans" ON candidate_service_plans;
CREATE POLICY "admin_update_candidate_service_plans" ON candidate_service_plans FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_candidate_service_plans" ON candidate_service_plans;
CREATE POLICY "admin_delete_candidate_service_plans" ON candidate_service_plans FOR DELETE
  TO authenticated USING (is_admin());

-- =========================================================================
-- Seed default pricing tiers
-- =========================================================================
INSERT INTO ad_plans (plan_name, description, monthly_price, features, display_order) VALUES
  ('Local Business', 'Geographic targeting with homepage and election-page placement plus basic analytics.', 250.00, ARRAY['Geographic targeting','Homepage placement','Election-page placement','Basic analytics'], 1),
  ('Premium Local', 'Multiple placements with higher impression allocation and full analytics.', 500.00, ARRAY['Multiple placements','Geographic targeting','Higher impression allocation','Full analytics'], 2),
  ('Regional', 'Multi-city targeting with advanced targeting and analytics.', 1000.00, ARRAY['Multiple cities','Multiple placements','Advanced targeting','Analytics dashboard'], 3)
ON CONFLICT DO NOTHING;

INSERT INTO candidate_service_plans (plan_name, description, annual_price, features, display_order) VALUES
  ('Profile Claim', 'Verified badge, candidate-submitted biography, website, social links, campaign contact info, and questionnaire.', 99.00, ARRAY['Verified profile badge','Candidate-submitted biography','Campaign website & social links','Campaign contact information','Candidate questionnaire'], 1),
  ('Premium Profile Management', 'Full profile management, questionnaire management, event updates, and profile update assistance.', 299.00, ARRAY['Everything in Profile Claim','Profile management assistance','Questionnaire management','Event updates','Profile update assistance'], 2)
ON CONFLICT DO NOTHING;