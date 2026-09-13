/*
# Pricing tiers: Candidate / Pro + Candidate Management upgrade

## Confirmed pricing (client, Sept 2026)
- Free — $0 (unchanged, no paywall on core ballot info)
- Candidate — $9/mo or $89/yr (renamed from the old placeholder "premium" tier)
- Pro — $29/mo or $289/yr
- Candidate Management — $299 (one-time or recurring, tied to a claimed candidate
  profile, not to the voter's own subscription). Claiming a profile itself stays
  FREE (Option B from the client: claim unlocks ownership + social features for
  free; Management is a further paid upgrade on top of a claimed profile that
  unlocks campaign launch, team invites, analytics, etc).

## Changes
1. Widen the `subscriptions.plan` check constraint to accept the new tier names
   without breaking any existing rows using the old `premium_monthly` / `premium_yearly`
   values (both old and new values are allowed side by side).
2. New table `candidate_management_subscriptions` — one row per claimed candidate
   profile that has purchased (or been comped) the Management tier.
   Includes `is_comped` / `comped_reason` so the team can honor the "first year
   free during beta" plan without needing a real Stripe charge yet.

## Security
- `candidate_management_subscriptions`: the verified claimant (via candidate_claims)
  and admins can read; only admins or the edge function (service role) can insert/update.
*/

-- 1. Widen allowed plan values (keep old ones for backward compatibility)
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN (
    'free',
    'premium_monthly', 'premium_yearly',   -- legacy names, kept for existing rows
    'candidate_monthly', 'candidate_yearly',
    'pro_monthly', 'pro_yearly'
  ));

-- 2. Candidate Management tier (per claimed candidate profile, not per user)
CREATE TABLE IF NOT EXISTS candidate_management_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES candidate_claims(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'expired')) DEFAULT 'active',
  is_comped boolean NOT NULL DEFAULT false,
  comped_reason text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);

ALTER TABLE candidate_management_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_candidate_management" ON candidate_management_subscriptions;
CREATE POLICY "read_own_candidate_management" ON candidate_management_subscriptions FOR SELECT
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM candidate_claims c
      WHERE c.candidate_id = candidate_management_subscriptions.candidate_id
        AND c.user_id = auth.uid()
        AND c.status = 'verified'
    )
  );

DROP POLICY IF EXISTS "admin_write_candidate_management" ON candidate_management_subscriptions;
CREATE POLICY "admin_write_candidate_management" ON candidate_management_subscriptions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_candidate_management" ON candidate_management_subscriptions;
CREATE POLICY "admin_update_candidate_management" ON candidate_management_subscriptions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE INDEX IF NOT EXISTS idx_candidate_mgmt_candidate ON candidate_management_subscriptions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_mgmt_status ON candidate_management_subscriptions(status);
