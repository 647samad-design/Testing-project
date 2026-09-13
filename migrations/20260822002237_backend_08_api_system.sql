/*
# Backend Architecture: API System (Clients, Keys, Usage, Plans, Subscriptions)

## Purpose
Create a complete API management system for third-party API access to BallotLens data.

## New Tables

### `api_clients`
- Organizations that use the API
- `id` (uuid PK), `organization_name`, `contact_name`, `email`, `plan_type`, `status` (default 'active'),
  `rate_limit` (int, requests per minute), `monthly_request_limit` (int), `stripe_customer_id` (nullable),
  `created_at`, `updated_at`

### `api_keys`
- API keys for each client — stores ONLY a hash, never the raw key
- `id` (uuid PK), `api_client_id` FK, `key_prefix` (text, first 8 chars for display),
  `key_hash` (text, bcrypt/SHA-256 hash), `name` (text), `last_used_at` (nullable),
  `expires_at` (nullable), `revoked_at` (nullable), `created_at`

### `api_usage`
- Per-request usage logging
- `id` (uuid PK), `api_client_id` FK, `endpoint`, `method`, `status_code` (int),
  `response_time_ms` (int), `request_count` (int default 1), `created_at`

### `api_plans`
- API pricing/feature plans
- `id` (uuid PK), `name`, `price_cents`, `monthly_request_limit`, `rate_limit_per_minute`,
  `stripe_price_id` (nullable), `features` (jsonb), `active` (boolean default true), `created_at`

### `api_subscriptions`
- Links API clients to plans with Stripe subscription tracking
- `id` (uuid PK), `api_client_id` FK, `api_plan_id` FK, `stripe_subscription_id` (nullable),
  `status`, `current_period_start`, `current_period_end`, `created_at`, `updated_at`

## Security
- `api_clients`: admin-only read/write (users don't self-register API clients)
- `api_keys`: admin-only read; admin-only insert/revoke; no delete (revoke instead)
- `api_usage`: admin-only read; edge function inserts via service role
- `api_plans`: public read (active); admin write
- `api_subscriptions`: admin-only read/write

## Notes
1. NEVER store raw API keys — only a secure hash (SHA-256). Show the complete key only once at creation.
2. Rate limiting is enforced at the edge function level, not the database.
3. API plans are seeded with starter, pro, and enterprise tiers.
*/

-- API clients
CREATE TABLE IF NOT EXISTS api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name text NOT NULL,
  contact_name text,
  email text NOT NULL,
  plan_type text NOT NULL DEFAULT 'starter' CHECK (plan_type IN ('starter', 'pro', 'enterprise')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'canceled')),
  rate_limit integer NOT NULL DEFAULT 60,
  monthly_request_limit integer NOT NULL DEFAULT 1000,
  stripe_customer_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE api_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_api_clients" ON api_clients;
CREATE POLICY "admin_read_api_clients" ON api_clients FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_api_clients" ON api_clients;
CREATE POLICY "admin_insert_api_clients" ON api_clients FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_api_clients" ON api_clients;
CREATE POLICY "admin_update_api_clients" ON api_clients FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- API keys — NEVER store raw keys
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  name text NOT NULL DEFAULT 'Default',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_api_keys" ON api_keys;
CREATE POLICY "admin_read_api_keys" ON api_keys FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_api_keys" ON api_keys;
CREATE POLICY "admin_insert_api_keys" ON api_keys FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_api_keys" ON api_keys;
CREATE POLICY "admin_update_api_keys" ON api_keys FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- API usage
CREATE TABLE IF NOT EXISTS api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer NOT NULL,
  response_time_ms integer,
  request_count integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_api_usage" ON api_usage;
CREATE POLICY "admin_read_api_usage" ON api_usage FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_api_usage" ON api_usage;
CREATE POLICY "admin_insert_api_usage" ON api_usage FOR INSERT
  TO authenticated WITH CHECK (is_admin());

-- API plans
CREATE TABLE IF NOT EXISTS api_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  monthly_request_limit integer NOT NULL DEFAULT 1000,
  rate_limit_per_minute integer NOT NULL DEFAULT 60,
  stripe_price_id text,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_api_plans" ON api_plans;
CREATE POLICY "public_read_api_plans" ON api_plans FOR SELECT
  TO anon, authenticated USING (active = true);

DROP POLICY IF EXISTS "admin_insert_api_plans" ON api_plans;
CREATE POLICY "admin_insert_api_plans" ON api_plans FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_api_plans" ON api_plans;
CREATE POLICY "admin_update_api_plans" ON api_plans FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_api_plans" ON api_plans;
CREATE POLICY "admin_delete_api_plans" ON api_plans FOR DELETE
  TO authenticated USING (is_admin());

-- API subscriptions
CREATE TABLE IF NOT EXISTS api_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  api_plan_id uuid NOT NULL REFERENCES api_plans(id) ON DELETE CASCADE,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'unpaid')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE api_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_api_subscriptions" ON api_subscriptions;
CREATE POLICY "admin_read_api_subscriptions" ON api_subscriptions FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_api_subscriptions" ON api_subscriptions;
CREATE POLICY "admin_insert_api_subscriptions" ON api_subscriptions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_api_subscriptions" ON api_subscriptions;
CREATE POLICY "admin_update_api_subscriptions" ON api_subscriptions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Seed API plans
INSERT INTO api_plans (name, price_cents, monthly_request_limit, rate_limit_per_minute, features) VALUES
  ('Starter', 9900, 5000, 60, '{"support": "email", "endpoints": "read_only"}'::jsonb),
  ('Pro', 49900, 50000, 300, '{"support": "priority", "endpoints": "read_only", "webhooks": true}'::jsonb),
  ('Enterprise', 0, 500000, 1000, '{"support": "dedicated", "endpoints": "all", "webhooks": true, "sla": "99.9"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_clients_status ON api_clients(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_client ON api_keys(api_client_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_usage_client ON api_usage(api_client_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_subscriptions_client ON api_subscriptions(api_client_id);
