/*
# Backend Architecture: Candidate Services + Content Reports + Audit Logs + Data Imports + AI Summaries

## Purpose
Create remaining infrastructure tables: candidate services, content moderation, audit logging,
data import tracking, and AI summary storage with safety labels.

## New Tables

### `candidate_services`
- Tracks which services a candidate has purchased
- `id` (uuid PK), `candidate_id` FK, `service_type`, `price_cents`, `stripe_payment_id` (nullable),
  `status`, `created_at`, `updated_at`

### `content_reports`
- User-submitted reports for content moderation
- `id` (uuid PK), `user_id` FK, `content_type`, `content_id` (uuid), `reason`, `description` (nullable),
  `status` (default 'pending'), `reviewed_by` FK (nullable), `reviewed_at` (nullable), `created_at`

### `audit_logs`
- Immutable audit trail for admin actions on sensitive data
- `id` (uuid PK), `user_id` FK (nullable), `action`, `table_name`, `record_id` (uuid nullable),
  `old_data` (jsonb nullable), `new_data` (jsonb nullable), `ip_address` (nullable), `created_at`

### `data_imports`
- Tracks bulk data import operations
- `id` (uuid PK), `source_name`, `source_type`, `started_at`, `completed_at` (nullable),
  `status`, `records_imported` (int), `records_updated` (int), `records_failed` (int),
  `error_log` (jsonb), `created_at`

### `ai_summaries`
- AI-generated summaries — NEVER authoritative, always labeled
- `id` (uuid PK), `content_type`, `content_id` (uuid), `summary`, `model`, `source_ids` (jsonb),
  `generated_at`, `review_status` (default 'unreviewed'), `created_at`

## Security
- `candidate_services`: admin read; admin+edge function insert; admin update
- `content_reports`: user can submit own; admin can read/update all
- `audit_logs`: admin-only read; admin+edge function insert; NO delete (immutable)
- `data_imports`: admin-only CRUD
- `ai_summaries`: public read (reviewed); admin write; clearly labeled as AI-generated

## Notes
1. Audit logs are INSERT-only — no updates or deletes allowed via RLS.
2. AI summaries have a `review_status` field and must be labeled as AI-generated.
3. Content reports support any content type via `content_type` + `content_id`.
*/

-- Candidate services
CREATE TABLE IF NOT EXISTS candidate_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  service_type text NOT NULL CHECK (service_type IN ('profile_claim', 'profile_management', 'questionnaire_management', 'event_updates')),
  price_cents integer NOT NULL DEFAULT 0,
  stripe_payment_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'canceled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE candidate_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_candidate_services" ON candidate_services;
CREATE POLICY "admin_read_candidate_services" ON candidate_services FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_candidate_services" ON candidate_services;
CREATE POLICY "admin_insert_candidate_services" ON candidate_services FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_candidate_services" ON candidate_services;
CREATE POLICY "admin_update_candidate_services" ON candidate_services FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Content reports
CREATE TABLE IF NOT EXISTS content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submit_own_reports" ON content_reports;
CREATE POLICY "submit_own_reports" ON content_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "read_own_reports" ON content_reports;
CREATE POLICY "read_own_reports" ON content_reports FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "admin_update_reports" ON content_reports;
CREATE POLICY "admin_update_reports" ON content_reports FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Audit logs — INSERT only, no updates/deletes via RLS
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_audit_logs" ON audit_logs;
CREATE POLICY "admin_read_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_audit_logs" ON audit_logs;
CREATE POLICY "admin_insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (is_admin());

-- NO update or delete policies — audit logs are immutable

-- Data imports
CREATE TABLE IF NOT EXISTS data_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_type text NOT NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  records_imported integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  error_log jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE data_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_data_imports" ON data_imports;
CREATE POLICY "admin_read_data_imports" ON data_imports FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_data_imports" ON data_imports;
CREATE POLICY "admin_insert_data_imports" ON data_imports FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_data_imports" ON data_imports;
CREATE POLICY "admin_update_data_imports" ON data_imports FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- AI summaries
CREATE TABLE IF NOT EXISTS ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  summary text NOT NULL,
  model text NOT NULL,
  source_ids jsonb DEFAULT '[]'::jsonb,
  generated_at timestamptz DEFAULT now(),
  review_status text NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed', 'reviewed', 'published', 'rejected')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_ai_summaries" ON ai_summaries;
CREATE POLICY "public_read_ai_summaries" ON ai_summaries FOR SELECT
  TO anon, authenticated USING (review_status IN ('reviewed', 'published'));

DROP POLICY IF EXISTS "admin_write_ai_summaries" ON ai_summaries;
CREATE POLICY "admin_write_ai_summaries" ON ai_summaries FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_ai_summaries" ON ai_summaries;
CREATE POLICY "admin_update_ai_summaries" ON ai_summaries FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_ai_summaries" ON ai_summaries;
CREATE POLICY "admin_delete_ai_summaries" ON ai_summaries FOR DELETE
  TO authenticated USING (is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_candidate_services_candidate ON candidate_services(candidate_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_content ON content_reports(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_data_imports_status ON data_imports(status);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_content ON ai_summaries(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_review ON ai_summaries(review_status);
