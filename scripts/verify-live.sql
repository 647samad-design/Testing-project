-- Verification for the 20260913002900 .. 20260913003700 migrations.
-- Expected: m2900 = n, every other column = 1.
select
  (select confdeltype from pg_constraint where conname = 'candidate_submissions_reviewed_by_fkey')        as m2900_should_be_n,
  (select count(*) from pg_indexes  where indexname = 'payments_stripe_payment_intent_id_key')           as m3000_should_be_1,
  (select count(*) from pg_trigger  where tgname = 'conversations_protect_participants')                 as m3100_should_be_1,
  (select count(*) from pg_policies where policyname = 'insert_fact_checks' and with_check like '%pending%') as m3200_should_be_1,
  (select count(*) from pg_proc     where proname = 'notify_candidate_followers')                        as m3300_should_be_1,
  (select count(*) from pg_trigger  where tgname = 'messages_notify_recipient')                          as m3400_should_be_1,
  (select count(*) from pg_trigger  where tgname = 'candidate_promises_guard_status')                    as m3500_should_be_1,
  (select count(*) from pg_policies where policyname = 'admin_read_all_stories')                         as m3600_should_be_1,
  (select count(*) from pg_trigger  where tgname = 'candidate_quiz_answers_guard')                       as m3700_should_be_1;

select count(*) as total_zips,
       count(*) filter (where congressional_district_id is not null
                          or state_house_district_id is not null
                          or county_district_id is not null) as zips_linked_to_districts
from zip_districts;
