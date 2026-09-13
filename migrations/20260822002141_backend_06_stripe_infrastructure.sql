/*
# Backend Architecture: Stripe Payment Infrastructure

## Purpose
Create the complete Stripe data model: customers, payments, webhook events, and revenue tracking.
Extend the existing `subscriptions` table with additional fields.

## New Tables

### `stripe_customers`
- `id` (uuid PK), `user_id` (uuid UNIQUE FK → profiles), `stripe_customer_id` (text UNIQUE), `created_at`, `updated_at`

### `payments`
- `id` (uuid PK), `user_id` FK, `stripe_customer_id`, `stripe_payment_intent_id`, `stripe_invoice_id` (nullable),
  `amount` (integer cents), `currency` (default 'usd'), `payment_type`, `status`, `description` (nullable), `created_at`

### `stripe_webhook_events`
- `id` (uuid PK), `event_id` (text UNIQUE), `event_type`, `processed` (boolean default false),
  `payload` (jsonb), `processed_at` (nullable), `error_message` (nullable), `created_at`

### `revenue_transactions`
- `id` (uuid PK), `transaction_type`, `user_id` (nullable), `advertiser_id` (nullable),
  `candidate_id` (nullable), `sponsor_id` (nullable), `api_client_id` (nullable),
  `stripe_payment_id` (nullable), `amount_cents` (integer), `currency` (default 'usd'), `status`, `created_at`

## Modified Tables

### `subscriptions` (ALTER)
- Add `stripe_price_id` (text, nullable)
- Add `plan_type` (text, nullable) — alias for existing `plan` column
- Add `billing_interval` (text, nullable) — monthly, yearly
- Add `cancel_at_period_end` (boolean, default false)
- Add `paused` status to allowed values

## Security
- `stripe_customers`: owner + admin read; owner insert (own only); admin update; no delete
- `payments`: owner + admin read; admin insert (via webhook); no user write
- `stripe_webhook_events`: admin-only (all CRUD)
- `revenue_transactions`: admin-only read; admin + edge function insert; no delete

## Notes
1. All amounts stored in cents (integer) — never float.
2. Webhook events are idempotent via unique `event_id`.
3. The existing `subscriptions` table and its data are fully preserved.
4. Stripe price IDs are stored in env vars, not in the database.
*/

-- Stripe customers
CREATE TABLE IF NOT EXISTS stripe_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_stripe_customer" ON stripe_customers;
CREATE POLICY "read_own_stripe_customer" ON stripe_customers FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "insert_own_stripe_customer" ON stripe_customers;
CREATE POLICY "insert_own_stripe_customer" ON stripe_customers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_stripe_customer" ON stripe_customers;
CREATE POLICY "update_own_stripe_customer" ON stripe_customers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin()) WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "admin_delete_stripe_customer" ON stripe_customers;
CREATE POLICY "admin_delete_stripe_customer" ON stripe_customers FOR DELETE
  TO authenticated USING (is_admin());

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  stripe_customer_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  payment_type text NOT NULL CHECK (payment_type IN ('subscription', 'advertising', 'candidate_service', 'sponsorship', 'api', 'other')),
  status text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_payments" ON payments;
CREATE POLICY "read_own_payments" ON payments FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

-- No user INSERT — only via edge function (service role bypasses RLS)
DROP POLICY IF EXISTS "admin_insert_payments" ON payments;
CREATE POLICY "admin_insert_payments" ON payments FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_payments" ON payments;
CREATE POLICY "admin_update_payments" ON payments FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Stripe webhook events
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  payload jsonb,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_webhook_events" ON stripe_webhook_events;
CREATE POLICY "admin_read_webhook_events" ON stripe_webhook_events FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_webhook_events" ON stripe_webhook_events;
CREATE POLICY "admin_insert_webhook_events" ON stripe_webhook_events FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_webhook_events" ON stripe_webhook_events;
CREATE POLICY "admin_update_webhook_events" ON stripe_webhook_events FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_webhook_events" ON stripe_webhook_events;
CREATE POLICY "admin_delete_webhook_events" ON stripe_webhook_events FOR DELETE
  TO authenticated USING (is_admin());

-- Revenue transactions
CREATE TABLE IF NOT EXISTS revenue_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL CHECK (transaction_type IN ('subscription', 'advertising', 'candidate_service', 'sponsorship', 'api')),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  advertiser_id uuid REFERENCES advertisers(id) ON DELETE SET NULL,
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  sponsor_id uuid REFERENCES sponsors(id) ON DELETE SET NULL,
  api_client_id uuid,
  stripe_payment_id text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE revenue_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_revenue" ON revenue_transactions;
CREATE POLICY "admin_read_revenue" ON revenue_transactions FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_revenue" ON revenue_transactions;
CREATE POLICY "admin_insert_revenue" ON revenue_transactions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_revenue" ON revenue_transactions;
CREATE POLICY "admin_update_revenue" ON revenue_transactions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Extend subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_type text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval text CHECK (billing_interval IN ('monthly', 'yearly'));
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

-- Backfill plan_type from plan
UPDATE subscriptions SET plan_type = plan WHERE plan_type IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_id ON stripe_customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON stripe_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON stripe_webhook_events(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_revenue_type ON revenue_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_revenue_status ON revenue_transactions(status);
CREATE INDEX IF NOT EXISTS idx_revenue_created ON revenue_transactions(created_at);
