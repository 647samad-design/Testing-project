/*
# Backend Architecture: Admin Analytics Views

## Purpose
Create database views for admin analytics dashboards. Views aggregate revenue, user activity,
advertising performance, and API usage data.

## Views Created

1. `monthly_revenue` — total revenue by month, split by type
2. `subscription_revenue` — subscription payments by month
3. `advertising_revenue` — advertising payments by month
4. `monthly_active_users` — count of users active per month (based on profile activity)
5. `premium_subscribers` — count of active premium subscriptions
6. `advertising_performance` — ad impressions vs clicks by advertisement
7. `api_usage_summary` — API usage by client and endpoint
8. `candidate_profile_views` — profile views by candidate

## Security
- Views are NOT directly accessible via RLS — they inherit from underlying tables
- Admin access is enforced through the underlying table RLS policies
- Views are read-only (no INSTEAD OF triggers)

## Notes
1. Views are created with `OR REPLACE` for idempotency.
2. Revenue views aggregate from `revenue_transactions` and `payments`.
3. `monthly_active_users` is a proxy based on profile creation/update timestamps.
*/

-- 1. Monthly revenue
CREATE OR REPLACE VIEW monthly_revenue AS
SELECT
  date_trunc('month', created_at) AS month,
  transaction_type,
  COUNT(*) AS transaction_count,
  SUM(amount_cents) AS total_cents
FROM revenue_transactions
WHERE status = 'completed'
GROUP BY month, transaction_type
ORDER BY month DESC;

-- 2. Subscription revenue
CREATE OR REPLACE VIEW subscription_revenue AS
SELECT
  date_trunc('month', created_at) AS month,
  COUNT(*) AS transaction_count,
  SUM(amount_cents) AS total_cents
FROM revenue_transactions
WHERE transaction_type = 'subscription' AND status = 'completed'
GROUP BY month
ORDER BY month DESC;

-- 3. Advertising revenue
CREATE OR REPLACE VIEW advertising_revenue AS
SELECT
  date_trunc('month', created_at) AS month,
  COUNT(*) AS transaction_count,
  SUM(amount_cents) AS total_cents
FROM revenue_transactions
WHERE transaction_type = 'advertising' AND status = 'completed'
GROUP BY month
ORDER BY month DESC;

-- 4. Monthly active users (proxy)
CREATE OR REPLACE VIEW monthly_active_users AS
SELECT
  date_trunc('month', updated_at) AS month,
  COUNT(DISTINCT id) AS active_users
FROM profiles
WHERE deleted_at IS NULL
GROUP BY month
ORDER BY month DESC;

-- 5. Premium subscribers
CREATE OR REPLACE VIEW premium_subscribers AS
SELECT
  plan,
  status,
  COUNT(*) AS subscriber_count
FROM subscriptions
WHERE plan IN ('premium_monthly', 'premium_yearly')
  AND status = 'active'
GROUP BY plan, status;

-- 6. Advertising performance
CREATE OR REPLACE VIEW advertising_performance AS
SELECT
  ad.id AS advertisement_id,
  ad.ad_title,
  ad.status,
  ad.impressions,
  ad.clicks,
  CASE WHEN ad.impressions > 0 THEN ROUND(ad.clicks::numeric / ad.impressions * 100, 2) ELSE 0 END AS ctr_percent,
  a.organization_name AS advertiser_name
FROM advertisements ad
JOIN advertisers a ON a.id = ad.advertiser_id
ORDER BY ad.impressions DESC;

-- 7. API usage summary
CREATE OR REPLACE VIEW api_usage_summary AS
SELECT
  ac.organization_name,
  au.endpoint,
  au.method,
  COUNT(*) AS request_count,
  AVG(au.response_time_ms) AS avg_response_time_ms,
  MAX(au.created_at) AS last_request
FROM api_usage au
JOIN api_clients ac ON ac.id = au.api_client_id
GROUP BY ac.organization_name, au.endpoint, au.method
ORDER BY request_count DESC;

-- 8. Candidate profile views
CREATE OR REPLACE VIEW candidate_profile_views AS
SELECT
  c.id AS candidate_id,
  c.display_name,
  COUNT(pv.id) AS total_views,
  COUNT(DISTINCT pv.viewer_user_id) AS unique_viewers,
  COUNT(CASE WHEN pv.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) AS views_last_30_days
FROM candidates c
LEFT JOIN profile_views pv ON pv.candidate_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.display_name
ORDER BY total_views DESC;
