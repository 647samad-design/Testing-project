/*
# Add increment_ad_counter RPC

## Summary
Creates a SECURITY DEFINER function to atomically increment either the
`impressions` or `clicks` counter on an advertisement row. This is called
after logging an ad_event so analytics counters stay in sync.

## Security
- SECURITY DEFINER so anon users (who log impressions/clicks) can increment
  the counter without needing UPDATE privileges on the advertisements table.
- Only accepts 'impressions' or 'clicks' as the column name — no arbitrary
  column updates.
*/

CREATE OR REPLACE FUNCTION public.increment_ad_counter(
  ad_id uuid,
  column_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF column_name NOT IN ('impressions', 'clicks') THEN
    RAISE EXCEPTION 'Invalid column name: %', column_name;
  END IF;

  IF column_name = 'impressions' THEN
    UPDATE advertisements SET impressions = impressions + 1, updated_at = now() WHERE id = ad_id;
  ELSE
    UPDATE advertisements SET clicks = clicks + 1, updated_at = now() WHERE id = ad_id;
  END IF;
END;
$$;