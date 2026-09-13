/*
# Civic engagement features — office descriptions, fact checks, claims vs plans, promises tracker

## Summary
Adds 4 new tables that power the voter education features:

1. **office_descriptions** — "What Does This Office Actually Do?"
   Explains what an elected office controls and doesn't control in plain English.
   Keyed by office name (e.g., "County Commissioner", "Sheriff", "School Board Member").
   Public read, admin write.

2. **fact_checks** — "Lens This" fact-check tool
   Users submit a claim (text or URL), and the system stores it with an assessment.
   Assessment statuses: true, misleading, false, unverified, needs_context.
   Includes the original claim, verdict, explanation, evidence, and source URL.
   Public read (anyone can see fact checks), authenticated insert (any user can submit),
   admin/team update (to set the verdict).

3. **candidate_promises** — "Promises Tracker"
   Tracks campaign promises with status: completed, in_progress, not_started, contradicted, unverified.
   Each promise has the claim text, date made, source, issue, and evidence for its status.
   Public read, team/admin write (only campaign team or verified claim owners can add/update).

4. **candidate_claim_analysis** — "Claims vs Plans"
   For each campaign claim (e.g., "I will lower property taxes"), tracks:
   - The claim text
   - Whether a specific plan exists (how, how much, when, what it costs, what gets cut)
   - Authority assessment (within / partially within / outside office authority)
   - Evidence
   Public read, team/admin write.

## Security
- office_descriptions: public read (anon + authenticated), admin-only write
- fact_checks: public read, authenticated insert, admin/team update
- candidate_promises: public read, team-only write (via campaign_team or verified claim)
- candidate_claim_analysis: public read, team-only write (via campaign_team or verified claim)

## Important Notes
1. All tables have RLS enabled
2. Public read policies use TO anon, authenticated so the app works without sign-in
3. Write policies for candidate-specific tables check campaign_team membership or verified candidate_claims
4. office_descriptions is keyed by office_name (text) not by contest_id since multiple contests can share an office name
*/

-- OFFICE DESCRIPTIONS — "What Does This Office Actually Do?"
CREATE TABLE IF NOT EXISTS office_descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_name text NOT NULL UNIQUE,
  what_they_control text[] NOT NULL DEFAULT '{}',
  what_they_dont_control text[] NOT NULL DEFAULT '{}',
  plain_english_summary text,
  typical_term_length text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE office_descriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_office_descriptions" ON office_descriptions;
CREATE POLICY "read_office_descriptions" ON office_descriptions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_office_descriptions_admin" ON office_descriptions;
CREATE POLICY "insert_office_descriptions_admin" ON office_descriptions FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);
DROP POLICY IF EXISTS "update_office_descriptions_admin" ON office_descriptions;
CREATE POLICY "update_office_descriptions_admin" ON office_descriptions FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);

-- FACT CHECKS — "Lens This"
CREATE TABLE IF NOT EXISTS fact_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  claim_text text NOT NULL,
  source_url text,
  source_platform text CHECK (source_platform IN ('tiktok', 'instagram', 'facebook', 'x', 'tv', 'news', 'other')),
  assessment text NOT NULL DEFAULT 'unverified' CHECK (assessment IN ('true', 'misleading', 'false', 'unverified', 'needs_context')),
  explanation text,
  evidence_text text,
  evidence_url text,
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'published')),
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE fact_checks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fact_checks_status ON fact_checks(status);
CREATE INDEX IF NOT EXISTS idx_fact_checks_candidate ON fact_checks(candidate_id);

DROP POLICY IF EXISTS "read_fact_checks" ON fact_checks;
CREATE POLICY "read_fact_checks" ON fact_checks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_fact_checks" ON fact_checks;
CREATE POLICY "insert_fact_checks" ON fact_checks FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by_user_id);
DROP POLICY IF EXISTS "update_fact_checks_admin" ON fact_checks;
CREATE POLICY "update_fact_checks_admin" ON fact_checks FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);

-- CANDIDATE PROMISES — "Promises Tracker"
CREATE TABLE IF NOT EXISTS candidate_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  promise_text text NOT NULL,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  date_made date,
  source_url text,
  status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('completed', 'in_progress', 'not_started', 'contradicted', 'unverified')),
  status_evidence text,
  status_source_url text,
  status_updated_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE candidate_promises ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_promises_candidate ON candidate_promises(candidate_id);

DROP POLICY IF EXISTS "read_candidate_promises" ON candidate_promises;
CREATE POLICY "read_candidate_promises" ON candidate_promises FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_candidate_promises_team" ON candidate_promises;
CREATE POLICY "insert_candidate_promises_team" ON candidate_promises FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_promises.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_promises.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);
DROP POLICY IF EXISTS "update_candidate_promises_team" ON candidate_promises;
CREATE POLICY "update_candidate_promises_team" ON candidate_promises FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_promises.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_promises.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_promises.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_promises.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);
DROP POLICY IF EXISTS "delete_candidate_promises_team" ON candidate_promises;
CREATE POLICY "delete_candidate_promises_team" ON candidate_promises FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_promises.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_promises.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);

-- CANDIDATE CLAIM ANALYSIS — "Claims vs Plans"
CREATE TABLE IF NOT EXISTS candidate_claim_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  claim_text text NOT NULL,
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  has_specific_plan boolean NOT NULL DEFAULT false,
  plan_details text,
  plan_how text,
  plan_how_much text,
  plan_when text,
  plan_cost text,
  plan_what_gets_cut text,
  authority_assessment text CHECK (authority_assessment IN ('within', 'partially_within', 'outside', 'unclear')),
  evidence_text text,
  evidence_url text,
  analysis_notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE candidate_claim_analysis ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_claim_analysis_candidate ON candidate_claim_analysis(candidate_id);

DROP POLICY IF EXISTS "read_candidate_claim_analysis" ON candidate_claim_analysis;
CREATE POLICY "read_candidate_claim_analysis" ON candidate_claim_analysis FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_claim_analysis_team" ON candidate_claim_analysis;
CREATE POLICY "insert_claim_analysis_team" ON candidate_claim_analysis FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_claim_analysis.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_claim_analysis.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);
DROP POLICY IF EXISTS "update_claim_analysis_team" ON candidate_claim_analysis;
CREATE POLICY "update_claim_analysis_team" ON candidate_claim_analysis FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_claim_analysis.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_claim_analysis.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_claim_analysis.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_claim_analysis.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);
DROP POLICY IF EXISTS "delete_claim_analysis_team" ON candidate_claim_analysis;
CREATE POLICY "delete_claim_analysis_team" ON candidate_claim_analysis FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_claim_analysis.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
  OR
  EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_claim_analysis.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  OR
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
);

-- Seed some office descriptions
INSERT INTO office_descriptions (office_name, what_they_control, what_they_dont_control, plain_english_summary) VALUES
(
  'County Commissioner',
  ARRAY['County roads and infrastructure', 'County budget and spending', 'County land use and zoning', 'County parks and recreation', 'County emergency services', 'County health department'],
  ARRAY['Federal taxes', 'State legislation', 'Foreign policy', 'City police', 'School curriculum', 'Presidential decisions'],
  'County Commissioners manage the county budget, roads, land use, and county-level services like emergency services and public health. They don''t control state or federal laws, city government, or schools.'
),
(
  'Sheriff',
  ARRAY['County law enforcement', 'County jail operations', 'Court security', 'Serving warrants and legal papers', 'Patrol of unincorporated areas'],
  ARRAY['City police departments', 'Federal law enforcement', 'Writing laws', 'State prisons', 'Court rulings'],
  'The Sheriff runs the county jail, provides law enforcement in unincorporated areas, and handles court security. They don''t control city police, federal agencies, or the courts themselves.'
),
(
  'School Board Member',
  ARRAY['School district budget', 'School curriculum decisions', 'School zone boundaries', 'Hiring the superintendent', 'School policies and codes of conduct', 'School construction and facilities'],
  ARRAY['State education funding formulas', 'Teacher certification requirements', 'College admissions', 'Private schools', 'County or city government'],
  'School Board Members set the district budget, approve curriculum, decide school boundaries, and hire the superintendent. They don''t control state education laws or private schools.'
),
(
  'Mayor',
  ARRAY['City budget and spending', 'City departments and services', 'City planning and zoning', 'Public safety oversight', 'Economic development', 'City ordinances'],
  ARRAY['State laws', 'Federal policy', 'County government', 'School district decisions', 'State or federal courts'],
  'The Mayor oversees city government — the budget, city services, planning, and public safety. They don''t control state laws, county government, or school districts.'
),
(
  'City Commissioner',
  ARRAY['City ordinances and laws', 'City budget approval', 'Zoning and land use decisions', 'City department oversight', 'Public works projects'],
  ARRAY['State legislation', 'Federal policy', 'County services', 'School board decisions', 'Courts'],
  'City Commissioners make local laws, approve the city budget, and decide zoning and land use. They don''t control state or federal laws, county services, or schools.'
),
(
  'State Representative',
  ARRAY['State laws and legislation', 'State budget', 'State taxes', 'Education funding', 'Transportation funding', 'State regulations'],
  ARRAY['Federal laws', 'Local city ordinances', 'County decisions', 'Foreign policy', 'Federal taxes'],
  'State Representatives vote on state laws, the state budget, and state taxes. They don''t make federal laws or local city/county decisions.'
),
(
  'State Senator',
  ARRAY['State laws and legislation', 'State budget', 'State taxes', 'Judicial confirmations', 'State agency oversight', 'Redistricting'],
  ARRAY['Federal laws', 'Local city ordinances', 'County decisions', 'Foreign policy', 'Federal taxes'],
  'State Senators vote on state laws, confirm judges, and oversee state agencies. They don''t make federal laws or local government decisions.'
),
(
  'Governor',
  ARRAY['State budget', 'State agency appointments', 'Commander of state National Guard', 'Veto or sign state bills', 'Executive orders', 'Clemency and pardons'],
  ARRAY['Federal laws', 'Local city ordinances', 'County decisions', 'Foreign policy', 'Federal military', 'Supreme Court decisions'],
  'The Governor runs the state executive branch — signing or vetoing bills, appointing agency heads, commanding the National Guard, and granting pardons. They don''t make federal laws or local decisions.'
)
ON CONFLICT (office_name) DO NOTHING;