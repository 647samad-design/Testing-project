-- Executable RLS test suite. Run against a database with ALL migrations applied
-- (see db-tests/README.md). Every check prints PASS or FAIL; a FAIL exits non-zero.
\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
CREATE SCHEMA rlstest;
GRANT USAGE ON SCHEMA rlstest TO anon, authenticated;

CREATE FUNCTION rlstest.as_user(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub', u::text, true); SET LOCAL ROLE authenticated; END $$;
CREATE FUNCTION rlstest.as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub', '', true); SET LOCAL ROLE anon; END $$;
CREATE FUNCTION rlstest.as_owner() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RESET ROLE; END $$;
CREATE FUNCTION rlstest.rc(q text) RETURNS int LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN EXECUTE q; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;
CREATE FUNCTION rlstest.fails(q text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN EXECUTE q; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END $$;
CREATE FUNCTION rlstest.cnt(q text) RETURNS int LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN EXECUTE q INTO n; RETURN n; END $$;
CREATE TABLE rlstest.results(label text, ok boolean);
GRANT ALL ON rlstest.results TO anon, authenticated;
CREATE FUNCTION rlstest.check(label text, ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO rlstest.results VALUES (label, ok); RAISE NOTICE '% : %', CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, label; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA rlstest TO anon, authenticated;

-- ───────── fixtures (as superuser; RLS bypassed) ─────────
INSERT INTO auth.users (id,email) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','admin@t.io'),
 ('bbbbbbbb-0000-0000-0000-000000000002','claimant@t.io'),
 ('cccccccc-0000-0000-0000-000000000003','voter@t.io'),
 ('dddddddd-0000-0000-0000-000000000004','other@t.io');
UPDATE profiles SET is_admin = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO candidates (id,first_name,last_name) VALUES
 ('11111111-0000-0000-0000-000000000001','Cand','X'),
 ('11111111-0000-0000-0000-000000000002','Cand','Y');
INSERT INTO candidate_claims (candidate_id,user_id,full_name,email,status)
 VALUES ('11111111-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','Claimant B','claimant@t.io','verified');
INSERT INTO candidate_endorsements (id,candidate_id,endorser_name,endorser_type,status)
 VALUES ('e0000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Seed Org','organization','pending');
INSERT INTO voter_questions (id,candidate_id,user_id,question_text)
 VALUES ('90000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003','What is your plan?');

-- ───────── 1. candidate endorsements/funding/get-to-know: no open UPDATE ─────────
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('voter cannot approve/edit ANY endorsement (was USING true)',
  rlstest.rc($$UPDATE candidate_endorsements SET status='approved', endorser_name='HACKED'$$) = 0);
SELECT rlstest.check('voter cannot delete endorsements', rlstest.rc($$DELETE FROM candidate_endorsements$$) = 0);
SELECT rlstest.check('voter sees no pending endorsement', rlstest.cnt($$SELECT count(*) FROM candidate_endorsements$$) = 0);
SELECT rlstest.check('voter cannot insert endorsement for a candidate they do not own',
  rlstest.fails($$INSERT INTO candidate_endorsements (candidate_id,endorser_name,endorser_type) VALUES ('11111111-0000-0000-0000-000000000001','Fake','other')$$));

SELECT rlstest.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT rlstest.check('claimant can insert a PENDING endorsement for own candidate',
  rlstest.rc($$INSERT INTO candidate_endorsements (candidate_id,endorser_name,endorser_type) VALUES ('11111111-0000-0000-0000-000000000001','Mine','other')$$) = 1);
SELECT rlstest.check('claimant CANNOT insert an already-approved endorsement (skips review)',
  rlstest.fails($$INSERT INTO candidate_endorsements (candidate_id,endorser_name,endorser_type,status) VALUES ('11111111-0000-0000-0000-000000000001','Self','other','approved')$$));
SELECT rlstest.check('claimant cannot insert for a different candidate',
  rlstest.fails($$INSERT INTO candidate_endorsements (candidate_id,endorser_name,endorser_type) VALUES ('11111111-0000-0000-0000-000000000002','Nope','other')$$));
SELECT rlstest.check('claimant cannot self-approve (UPDATE status)',
  rlstest.rc($$UPDATE candidate_endorsements SET status='approved'$$) = 0);
SELECT rlstest.check('claimant sees own pending rows', rlstest.cnt($$SELECT count(*) FROM candidate_endorsements WHERE status='pending'$$) >= 2);

SELECT rlstest.as_anon();
SELECT rlstest.check('anon sees no pending endorsements', rlstest.cnt($$SELECT count(*) FROM candidate_endorsements$$) = 0);

SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('admin CAN see pending endorsements (previously invisible)', rlstest.cnt($$SELECT count(*) FROM candidate_endorsements WHERE status='pending'$$) >= 2);
SELECT rlstest.check('admin can approve', rlstest.rc($$UPDATE candidate_endorsements SET status='approved' WHERE id='e0000000-0000-0000-0000-000000000001'$$) = 1);

SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('approved endorsement now public to voters', rlstest.cnt($$SELECT count(*) FROM candidate_endorsements$$) = 1);

SELECT rlstest.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT rlstest.check('claimant can delete a row on their own candidate', rlstest.rc($$DELETE FROM candidate_endorsements WHERE endorser_name='Mine'$$) = 1);

-- funding + get_to_know share the identical policy shape; spot-check both
SELECT rlstest.as_owner();
INSERT INTO candidate_funding_sources (id,candidate_id,source_type,percentage,status) VALUES ('f0000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','pac',50,'pending');
INSERT INTO candidate_get_to_know (id,candidate_id,question,answer,status) VALUES ('a0000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Q','A','pending');
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('voter cannot rewrite funding percentages', rlstest.rc($$UPDATE candidate_funding_sources SET percentage = 0, status='approved'$$) = 0);
SELECT rlstest.check('voter cannot rewrite get-to-know', rlstest.rc($$UPDATE candidate_get_to_know SET answer='HACKED', status='approved'$$) = 0);
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('admin can approve funding', rlstest.rc($$UPDATE candidate_funding_sources SET status='approved'$$) = 1);
SELECT rlstest.check('admin can approve get-to-know', rlstest.rc($$UPDATE candidate_get_to_know SET status='approved'$$) = 1);

-- ───────── 2. candidate_profile_extras ─────────
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('voter cannot create extras for any candidate (was WITH CHECK true)',
  rlstest.fails($$INSERT INTO candidate_profile_extras (candidate_id, election_date) VALUES ('11111111-0000-0000-0000-000000000001','2026-11-03')$$));
SELECT rlstest.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT rlstest.check('claimant can create extras for own candidate',
  rlstest.rc($$INSERT INTO candidate_profile_extras (candidate_id, election_date) VALUES ('11111111-0000-0000-0000-000000000001','2026-11-03')$$) = 1);
SELECT rlstest.check('claimant cannot create extras for someone else''s candidate',
  rlstest.fails($$INSERT INTO candidate_profile_extras (candidate_id, election_date) VALUES ('11111111-0000-0000-0000-000000000002','2026-11-03')$$));
SELECT rlstest.check('claimant can update own extras', rlstest.rc($$UPDATE candidate_profile_extras SET term_length='4 years'$$) = 1);
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('voter cannot overwrite election date', rlstest.rc($$UPDATE candidate_profile_extras SET election_date='2020-01-01'$$) = 0);
SELECT rlstest.check('extras stay publicly readable', rlstest.cnt($$SELECT count(*) FROM candidate_profile_extras$$) = 1);

-- ───────── 3. voter_questions: no impersonation, counters, notification ─────────
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('asker cannot write a fake candidate answer directly',
  rlstest.rc($$UPDATE voter_questions SET answer_text='I promise free money', status='answered'$$) = 0);
SELECT rlstest.check('asker cannot answer via the function either',
  rlstest.fails($$SELECT answer_voter_question('90000000-0000-0000-0000-000000000001','fake')$$));
SELECT rlstest.as_user('dddddddd-0000-0000-0000-000000000004');
SELECT rlstest.check('random user cannot answer', rlstest.fails($$SELECT answer_voter_question('90000000-0000-0000-0000-000000000001','fake')$$));
SELECT rlstest.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT rlstest.check('empty answer rejected', rlstest.fails($$SELECT answer_voter_question('90000000-0000-0000-0000-000000000001','   ')$$));
SELECT rlstest.check('verified claimant CAN answer', NOT rlstest.fails($$SELECT answer_voter_question('90000000-0000-0000-0000-000000000001','Here is my plan')$$));
SELECT rlstest.as_owner();
SELECT rlstest.check('answer recorded with attribution (answered_by_user_id set)',
  rlstest.cnt($$SELECT count(*) FROM voter_questions WHERE status='answered' AND answer_text='Here is my plan' AND answered_by_user_id='bbbbbbbb-0000-0000-0000-000000000002' AND answered_at IS NOT NULL$$) = 1);
SELECT rlstest.check('asker was notified (question_answered)',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='cccccccc-0000-0000-0000-000000000003' AND type='question_answered'$$) = 1);

SELECT rlstest.as_user('dddddddd-0000-0000-0000-000000000004');
SELECT rlstest.check('rating insert allowed', rlstest.rc($$INSERT INTO question_ratings (question_id,rating_type) VALUES ('90000000-0000-0000-0000-000000000001','helpful')$$) = 1);
SELECT rlstest.check('re-rating (ON CONFLICT DO NOTHING) does not error',
  NOT rlstest.fails($$INSERT INTO question_ratings (question_id,rating_type) VALUES ('90000000-0000-0000-0000-000000000001','helpful') ON CONFLICT DO NOTHING$$));
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('second rater', rlstest.rc($$INSERT INTO question_ratings (question_id,rating_type) VALUES ('90000000-0000-0000-0000-000000000001','helpful')$$) = 1);
SELECT rlstest.as_owner();
SELECT rlstest.check('helpful_count = 2 (counter now maintained)', rlstest.cnt($$SELECT helpful_count FROM voter_questions WHERE id='90000000-0000-0000-0000-000000000001'$$) = 2);
SELECT rlstest.as_user('dddddddd-0000-0000-0000-000000000004');
SELECT rlstest.check('un-rate', rlstest.rc($$DELETE FROM question_ratings WHERE rating_type='helpful'$$) = 1);
SELECT rlstest.as_owner();
SELECT rlstest.check('helpful_count back to 1', rlstest.cnt($$SELECT helpful_count FROM voter_questions WHERE id='90000000-0000-0000-0000-000000000001'$$) = 1);

-- ───────── 5. admin moderation ─────────
INSERT INTO feed_posts (id,candidate_id,author_user_id,post_type,body) VALUES ('c0000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','update','post body');
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('voter cannot delete a candidate feed post', rlstest.rc($$DELETE FROM feed_posts$$) = 0);
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('admin CAN remove an abusive feed post (reports were unactionable)', rlstest.rc($$DELETE FROM feed_posts$$) = 1);
SELECT rlstest.check('admin can delete a voter question', rlstest.rc($$DELETE FROM voter_questions$$) = 1);

-- ───────── campaign_team recursion regression (20260913002600) ─────────
SELECT rlstest.as_owner();
INSERT INTO candidate_management_subscriptions (candidate_id,status,is_comped) VALUES ('11111111-0000-0000-0000-000000000001','active',true);
INSERT INTO campaign_team (candidate_id,user_id,invited_email,role,status)
  VALUES ('11111111-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','other@t.io','volunteer','active');
SELECT rlstest.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT rlstest.check('[2600] claimant can list their team (was infinite recursion)', NOT rlstest.fails($$SELECT count(*) FROM campaign_team$$));
SELECT rlstest.check('[2600] claimant sees the team member', rlstest.cnt($$SELECT count(*) FROM campaign_team WHERE candidate_id='11111111-0000-0000-0000-000000000001'$$) = 1);
SELECT rlstest.check('[2600] claimant can invite a team member (Management active)',
  rlstest.rc($$INSERT INTO campaign_team (candidate_id,invited_email,role) VALUES ('11111111-0000-0000-0000-000000000001','new@t.io','volunteer')$$) = 1);
SELECT rlstest.check('[2600] claimant can change a member role', rlstest.rc($$UPDATE campaign_team SET role='social_manager' WHERE invited_email='new@t.io'$$) = 1);
SELECT rlstest.check('[2600] claimant can create a feed post (was infinite recursion)',
  rlstest.rc($$INSERT INTO feed_posts (candidate_id,author_user_id,post_type,body) VALUES ('11111111-0000-0000-0000-000000000001',auth.uid(),'update','hello voters')$$) = 1);
SELECT rlstest.as_user('dddddddd-0000-0000-0000-000000000004');
SELECT rlstest.check('[2600] active team member can read their own membership', rlstest.cnt($$SELECT count(*) FROM campaign_team WHERE user_id=auth.uid()$$) = 1);
SELECT rlstest.check('[2600] team member sees only their candidate''s team, not other candidates''', rlstest.cnt($$SELECT count(*) FROM campaign_team WHERE candidate_id='11111111-0000-0000-0000-000000000002'$$) = 0);
SELECT rlstest.check('[2600] plain team member (volunteer) cannot invite others',
  rlstest.fails($$INSERT INTO campaign_team (candidate_id,invited_email,role) VALUES ('11111111-0000-0000-0000-000000000001','sneaky@t.io','volunteer')$$));
SELECT rlstest.check('[2600] team member can post a feed update', rlstest.rc($$INSERT INTO feed_posts (candidate_id,author_user_id,post_type,body) VALUES ('11111111-0000-0000-0000-000000000001',auth.uid(),'update','team post')$$) = 1);
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('[2600] a plain voter sees NO team rows (invited_email stays private)', rlstest.cnt($$SELECT count(*) FROM campaign_team$$) = 0);
SELECT rlstest.check('[2600] voter can still read candidate quiz answers table without error (was recursion)', NOT rlstest.fails($$SELECT count(*) FROM candidate_quiz_answers$$));
SELECT rlstest.check('[2600] voter can still log a profile view (was recursion)', NOT rlstest.fails($$INSERT INTO profile_views (candidate_id) VALUES ('11111111-0000-0000-0000-000000000001')$$));
SELECT rlstest.as_anon();
SELECT rlstest.check('[2600] anon sees no team rows', rlstest.cnt($$SELECT count(*) FROM campaign_team$$) = 0);

-- ───────── account deletion (20260913002900) ─────────
SELECT rlstest.as_owner();
SELECT rlstest.check('[2900] no FK to auth.users/profiles can block deleting a user (NO ACTION/RESTRICT)',
  rlstest.cnt($$SELECT count(*) FROM pg_constraint WHERE contype='f'
    AND confrelid IN ('auth.users'::regclass,'public.profiles'::regclass) AND confdeltype IN ('a','r')$$) = 0);

INSERT INTO auth.users (id,email) VALUES ('eeeeeeee-0000-0000-0000-000000000005','reviewer@t.io');
UPDATE profiles SET is_admin=true, role='admin' WHERE id='eeeeeeee-0000-0000-0000-000000000005';
INSERT INTO candidate_submissions (id,candidate_id,user_id,field_name,field_value)
  VALUES ('50000000-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','bio','reviewed bio');
SELECT rlstest.as_user('eeeeeeee-0000-0000-0000-000000000005');
SELECT rlstest.check('[2900] reviewer admin approves a submission', NOT rlstest.fails($$SELECT apply_candidate_submission('50000000-0000-0000-0000-000000000005')$$));
SELECT rlstest.as_owner();
SELECT rlstest.check('[2900] admin who reviewed something CAN delete their account (was FK error)',
  NOT rlstest.fails($$DELETE FROM auth.users WHERE id='eeeeeeee-0000-0000-0000-000000000005'$$));
SELECT rlstest.check('[2900] the review decision survives, reviewer link cleared',
  rlstest.cnt($$SELECT count(*) FROM candidate_submissions WHERE id='50000000-0000-0000-0000-000000000005' AND status='approved' AND reviewed_by IS NULL$$) = 1);

-- A voter with data spread across the app must delete cleanly (delete-my-account).
INSERT INTO auth.users (id,email) VALUES ('ffffffff-0000-0000-0000-000000000006','busyvoter@t.io');
SELECT rlstest.as_user('ffffffff-0000-0000-0000-000000000006');
SELECT rlstest.rc($$INSERT INTO follows (followable_type, followable_id) VALUES ('candidate','11111111-0000-0000-0000-000000000001')$$);
SELECT rlstest.rc($$INSERT INTO voter_questions (candidate_id, question_text) VALUES ('11111111-0000-0000-0000-000000000001','Delete me later?')$$);
SELECT rlstest.rc($$INSERT INTO question_ratings (question_id, rating_type) SELECT id,'helpful' FROM voter_questions WHERE question_text='Delete me later?'$$);
SELECT rlstest.rc($$INSERT INTO content_reports (content_type, content_id, reason) VALUES ('candidate','11111111-0000-0000-0000-000000000001','Spam')$$);
SELECT rlstest.rc($$INSERT INTO candidate_claims (candidate_id, full_name, email) VALUES ('11111111-0000-0000-0000-000000000002','Busy','busyvoter@t.io')$$);
SELECT rlstest.as_owner();
SELECT rlstest.check('[2900] voter with follows/questions/ratings/reports/claims deletes cleanly',
  NOT rlstest.fails($$DELETE FROM auth.users WHERE id='ffffffff-0000-0000-0000-000000000006'$$));
SELECT rlstest.check('[2900] ...and their personal rows are gone',
  rlstest.cnt($$SELECT count(*) FROM follows WHERE user_id='ffffffff-0000-0000-0000-000000000006'$$)
  + rlstest.cnt($$SELECT count(*) FROM profiles WHERE id='ffffffff-0000-0000-0000-000000000006'$$) = 0);

-- ───────── Stripe payment idempotency + statuses (20260913003000) ─────────
SELECT rlstest.as_owner();
-- order A: payment_intent.succeeded first (usual), then invoice.paid
INSERT INTO payments (stripe_customer_id, stripe_payment_intent_id, amount, payment_type, status)
  VALUES ('cus_A','pi_A',900,'other','succeeded') ON CONFLICT (stripe_payment_intent_id) DO NOTHING;
INSERT INTO payments (stripe_customer_id, stripe_payment_intent_id, stripe_invoice_id, amount, currency, payment_type, status)
  VALUES ('cus_A','pi_A','in_A',900,'usd','subscription','succeeded')
  ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET stripe_invoice_id=EXCLUDED.stripe_invoice_id, payment_type=EXCLUDED.payment_type, currency=EXCLUDED.currency;
SELECT rlstest.check('[3000] PI-then-invoice stores ONE row (was two -> revenue double-counted)',
  rlstest.cnt($$SELECT count(*) FROM payments WHERE stripe_payment_intent_id='pi_A'$$) = 1);
SELECT rlstest.check('[3000] ...and it is the invoice-linked subscription row',
  rlstest.cnt($$SELECT count(*) FROM payments WHERE stripe_payment_intent_id='pi_A' AND payment_type='subscription' AND stripe_invoice_id='in_A'$$) = 1);
-- order B: invoice.paid first, then payment_intent.succeeded (handler skips when PI has an invoice; even if it didn't, DO NOTHING)
INSERT INTO payments (stripe_customer_id, stripe_payment_intent_id, stripe_invoice_id, amount, payment_type, status)
  VALUES ('cus_B','pi_B','in_B',2900,'subscription','succeeded') ON CONFLICT (stripe_payment_intent_id) DO NOTHING;
INSERT INTO payments (stripe_customer_id, stripe_payment_intent_id, amount, payment_type, status)
  VALUES ('cus_B','pi_B',2900,'other','succeeded') ON CONFLICT (stripe_payment_intent_id) DO NOTHING;
SELECT rlstest.check('[3000] invoice-then-PI stores ONE row', rlstest.cnt($$SELECT count(*) FROM payments WHERE stripe_payment_intent_id='pi_B'$$) = 1);
-- Stripe retry of invoice.paid
INSERT INTO revenue_transactions (transaction_type, stripe_payment_id, amount_cents, currency, status) VALUES ('subscription','pi_B',2900,'usd','completed')
  ON CONFLICT (stripe_payment_id) DO NOTHING;
INSERT INTO revenue_transactions (transaction_type, stripe_payment_id, amount_cents, currency, status) VALUES ('subscription','pi_B',2900,'usd','completed')
  ON CONFLICT (stripe_payment_id) DO NOTHING;
SELECT rlstest.check('[3000] retried invoice.paid does not duplicate revenue', rlstest.cnt($$SELECT count(*) FROM revenue_transactions WHERE stripe_payment_id='pi_B'$$) = 1);
SELECT rlstest.check('[3000] $0 invoices (no payment intent) still allowed, NULLs not unique-clashing',
  NOT rlstest.fails($$INSERT INTO payments (stripe_customer_id, amount, payment_type, status) VALUES ('cus_C',0,'subscription','succeeded'),('cus_C',0,'subscription','succeeded')$$));
SELECT rlstest.check('[3000] subscriptions accepts Stripe status "unpaid" (was CHECK violation)',
  NOT rlstest.fails($$INSERT INTO subscriptions (user_id, plan, status) VALUES ('bbbbbbbb-0000-0000-0000-000000000002','pro_monthly','unpaid') ON CONFLICT (user_id) DO UPDATE SET status='unpaid'$$));
SELECT rlstest.check('[3000] management accepts Stripe status "incomplete" (checkout start)',
  NOT rlstest.fails($$UPDATE candidate_management_subscriptions SET status='incomplete' WHERE candidate_id='11111111-0000-0000-0000-000000000001'$$));
SELECT rlstest.check('[3000] "incomplete" management does NOT grant access', NOT has_active_management('11111111-0000-0000-0000-000000000001'));
UPDATE candidate_management_subscriptions SET status='active' WHERE candidate_id='11111111-0000-0000-0000-000000000001';
SELECT rlstest.check('[3000] unpaid subscription does NOT count as paid for watchlist limit',
  rlstest.cnt($$SELECT count(*) FROM subscriptions WHERE user_id='bbbbbbbb-0000-0000-0000-000000000002' AND status='active'$$) = 0);

-- ───────── email-unsubscribe upsert shape (no prior preferences row) ─────────
SELECT rlstest.as_owner();
SELECT rlstest.check('[unsub] digest opt-out works for a user with NO preferences row yet',
  rlstest.rc($$INSERT INTO notification_preferences (user_id, digest_frequency, updated_at) VALUES ('cccccccc-0000-0000-0000-000000000003','off',now())
    ON CONFLICT (user_id) DO UPDATE SET digest_frequency=EXCLUDED.digest_frequency, updated_at=EXCLUDED.updated_at$$) = 1);
SELECT rlstest.check('[unsub] reminders opt-out updates only that column on an existing row',
  rlstest.rc($$INSERT INTO notification_preferences (user_id, instant_election_reminders, updated_at) VALUES ('cccccccc-0000-0000-0000-000000000003',false,now())
    ON CONFLICT (user_id) DO UPDATE SET instant_election_reminders=EXCLUDED.instant_election_reminders, updated_at=EXCLUDED.updated_at$$) = 1);
SELECT rlstest.check('[unsub] both opt-outs stuck', rlstest.cnt($$SELECT count(*) FROM notification_preferences WHERE user_id='cccccccc-0000-0000-0000-000000000003' AND digest_frequency='off' AND instant_election_reminders = false$$) = 1);

-- ───────── regression: earlier security fixes still hold ─────────
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('[2200] voter can submit a pending claim',
  rlstest.rc($$INSERT INTO candidate_claims (candidate_id,full_name,email) VALUES ('11111111-0000-0000-0000-000000000002','Voter C','voter@t.io')$$) = 1);
SELECT rlstest.check('[2200] voter CANNOT self-verify their claim',
  rlstest.fails($$UPDATE candidate_claims SET status='verified' WHERE user_id='cccccccc-0000-0000-0000-000000000003'$$));
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('[2200] admin CAN verify a claim', rlstest.rc($$UPDATE candidate_claims SET status='verified' WHERE user_id='cccccccc-0000-0000-0000-000000000003'$$) = 1);

SELECT rlstest.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT rlstest.check('[2300] claimant submission starts pending',
  rlstest.rc($$INSERT INTO candidate_submissions (candidate_id,field_name,field_value) VALUES ('11111111-0000-0000-0000-000000000001','bio','new bio')$$) = 1);
SELECT rlstest.check('[2300] claimant CANNOT self-approve a submission',
  rlstest.fails($$UPDATE candidate_submissions SET status='approved'$$));

SELECT rlstest.as_user('dddddddd-0000-0000-0000-000000000004');
SELECT rlstest.check('[2400] advertiser profile can be created',
  rlstest.rc($$INSERT INTO advertisers (organization_name,contact_email) VALUES ('Acme','a@acme.io')$$) = 1);
SELECT rlstest.check('[2400] draft ad can be created',
  rlstest.rc($$INSERT INTO advertisements (advertiser_id,campaign_name,ad_title,destination_url,ad_type,placement) SELECT id,'c','t','https://x.io','banner','homepage' FROM advertisers WHERE user_id=auth.uid()$$) = 1);
SELECT rlstest.check('[2400] advertiser CANNOT self-activate an ad',
  rlstest.fails($$UPDATE advertisements SET status='active'$$));
SELECT rlstest.check('[2400] advertiser can submit for review', rlstest.rc($$UPDATE advertisements SET status='pending'$$) = 1);

SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('[2700] user cannot set is_admin=true on themselves',
  rlstest.fails($$UPDATE profiles SET is_admin = true WHERE id = auth.uid()$$));
SELECT rlstest.check('[2700] user cannot set role=admin on themselves',
  rlstest.fails($$UPDATE profiles SET role = 'admin' WHERE id = auth.uid()$$));
SELECT rlstest.check('[2700] user cannot set role=super_admin',
  rlstest.fails($$UPDATE profiles SET role = 'super_admin' WHERE id = auth.uid()$$));
SELECT rlstest.check('[2700] user cannot change another user''s profile at all',
  rlstest.rc($$UPDATE profiles SET full_name='HACKED' WHERE id <> auth.uid()$$) = 0);
SELECT rlstest.check('[2800] Account page save (incl. bio) works -- bio column was missing entirely',
  rlstest.rc($$UPDATE profiles SET full_name='Real Name', zip_code='33101', bio='Local voter', occupation='Teacher', education='BA', photo_url=NULL WHERE id = auth.uid()$$) = 1);
SELECT rlstest.check('[2800] bio longer than 160 chars rejected',
  rlstest.fails($$UPDATE profiles SET bio = repeat('x', 161) WHERE id = auth.uid()$$));
SELECT rlstest.check('[2800] language switch saves', rlstest.rc($$UPDATE profiles SET language_preference='es' WHERE id = auth.uid()$$) = 1);
SELECT rlstest.check('[2700] user CAN still edit their own name/zip (normal settings save)',
  rlstest.rc($$UPDATE profiles SET full_name='Real Name', zip_code='33101' WHERE id = auth.uid()$$) = 1);
SELECT rlstest.check('[2700] user still not admin after all attempts',
  rlstest.cnt($$SELECT count(*) FROM profiles WHERE id = auth.uid() AND (is_admin OR role <> 'user')$$) = 0);
SELECT rlstest.check('[2700] cannot INSERT a profile with is_admin=true',
  rlstest.fails($$INSERT INTO profiles (id, is_admin) VALUES (gen_random_uuid(), true)$$));
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('[2700] admin CAN promote via set_admin_role() (legitimate path still works)',
  NOT rlstest.fails($$SELECT set_admin_role('dddddddd-0000-0000-0000-000000000004', true)$$));
SELECT rlstest.as_owner();
SELECT rlstest.check('[2700] ...and the promotion took effect (role + is_admin in sync)',
  rlstest.cnt($$SELECT count(*) FROM profiles WHERE id='dddddddd-0000-0000-0000-000000000004' AND is_admin AND role='admin'$$) = 1);
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('[2700] admin CAN demote via set_admin_role()',
  NOT rlstest.fails($$SELECT set_admin_role('dddddddd-0000-0000-0000-000000000004', false)$$));
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('[2700] non-admin cannot call set_admin_role()',
  rlstest.fails($$SELECT set_admin_role(auth.uid(), true)$$));

SELECT rlstest.as_owner();
INSERT INTO subscriptions (user_id,plan,status) VALUES ('cccccccc-0000-0000-0000-000000000003','free','active') ON CONFLICT DO NOTHING;
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('[600] user cannot upgrade their own plan for free',
  rlstest.fails($$UPDATE subscriptions SET plan='pro_yearly', status='active' WHERE user_id=auth.uid()$$)
  OR rlstest.cnt($$SELECT count(*) FROM subscriptions WHERE user_id=auth.uid() AND plan='pro_yearly'$$) = 0);

SELECT rlstest.as_owner();
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM rlstest.results;
DO $$ BEGIN IF (SELECT count(*) FROM rlstest.results WHERE NOT ok) > 0 THEN RAISE EXCEPTION 'RLS TEST SUITE FAILED'; END IF; END $$;
ROLLBACK;
