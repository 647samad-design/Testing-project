-- ============================================================================
-- Gov Search App: automatic daily jobs (Supabase Cron).
--
-- Without this, election reminders, email digests and election-night results
-- only go out when an admin presses the buttons in Admin -> Data Feeds.
--
-- BEFORE RUNNING:
--   1. Supabase -> Edge Functions -> Secrets: add CRON_SECRET = a long random
--      value (at least 32 characters; e.g. run `openssl rand -hex 32`).
--   2. Replace the three values in STEP 1 below:
--        YOUR-PROJECT-REF  -> from your Supabase URL (https://YOUR-PROJECT-REF.supabase.co)
--        YOUR-ANON-KEY     -> Supabase -> Settings -> API -> anon public key
--        YOUR-CRON-SECRET  -> the same value you put in CRON_SECRET
--   3. Paste this whole file into Supabase -> SQL Editor -> Run.
-- Safe to run again (it replaces the jobs and secrets instead of duplicating).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- STEP 1: store the values in Supabase Vault (encrypted), not in the job text.
do $$
declare
  vals text[][] := array[
    array['govsearch_project_url', 'https://YOUR-PROJECT-REF.supabase.co'],
    array['govsearch_anon_key',    'YOUR-ANON-KEY'],
    array['govsearch_cron_secret', 'YOUR-CRON-SECRET']
  ];
  i int;
  existing uuid;
begin
  for i in 1 .. array_length(vals, 1) loop
    if vals[i][2] like 'YOUR-%' or vals[i][2] like 'https://YOUR-%' then
      raise exception 'Replace % in STEP 1 before running this file.', vals[i][1];
    end if;
    select id into existing from vault.secrets where name = vals[i][1];
    if existing is null then
      perform vault.create_secret(vals[i][2], vals[i][1]);
    else
      perform vault.update_secret(existing, vals[i][2], vals[i][1]);
    end if;
  end loop;
end $$;

-- STEP 2: a helper that calls one of our edge functions with the cron secret.
create or replace function public.govsearch_call_function(fn text, query text default '')
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'govsearch_project_url')
           || '/functions/v1/' || fn || query,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'govsearch_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'govsearch_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;
revoke all on function public.govsearch_call_function(text, text) from public, anon, authenticated;

-- STEP 3: the schedules (times are UTC; 14:00 UTC = 9-10 AM US Eastern).
select cron.unschedule(jobid) from cron.job
 where jobname in ('govsearch-election-reminders', 'govsearch-digest-emails', 'govsearch-election-night-results');

-- Election reminders: every day. Each user is reminded once per election
-- (elections within the next 14 days), so running daily never double-sends.
select cron.schedule('govsearch-election-reminders', '0 14 * * *',
  $$ select public.govsearch_call_function('send-election-reminders') $$);

-- Email digests: every day. Each user still gets theirs only at the frequency
-- they chose (daily or weekly).
select cron.schedule('govsearch-digest-emails', '0 13 * * *',
  $$ select public.govsearch_call_function('send-digest-emails') $$);

-- Election night (Nov 3-4, 2026): pull AP results every 10 minutes.
-- Needs the AP_ELECTIONS_API_KEY secret (paid AP plan); skip if you don't have it.
-- For a later election, change the day/month in the schedule.
select cron.schedule('govsearch-election-night-results', '*/10 * 3-4 11 *',
  $$ select public.govsearch_call_function('ap-elections', '?action=fetch&date=2026-11-03') $$);

-- Check: select jobname, schedule, active from cron.job;
-- Last runs: select * from cron.job_run_details order by start_time desc limit 20;
-- Turn one off: select cron.unschedule('govsearch-digest-emails');
