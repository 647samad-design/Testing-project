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

-- ───────── messaging (20260913003100) ─────────
SELECT rlstest.as_owner();
INSERT INTO candidates (id,first_name,last_name) VALUES ('11111111-0000-0000-0000-000000000003','Cand','Z');
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('[3100] voter CANNOT aim a conversation at a random user',
  rlstest.fails($$INSERT INTO conversations (voter_id,candidate_id,candidate_user_id) VALUES (auth.uid(),'11111111-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004')$$));
SELECT rlstest.check('[3100] voter cannot make themselves the other participant',
  rlstest.fails($$INSERT INTO conversations (voter_id,candidate_id,candidate_user_id) VALUES (auth.uid(),'11111111-0000-0000-0000-000000000001',auth.uid())$$));
SELECT rlstest.check('[3100] voter CAN message a candidate''s real verified claimant',
  rlstest.rc($$INSERT INTO conversations (id,voter_id,candidate_id,candidate_user_id) VALUES ('c0110000-0000-0000-0000-000000000001',auth.uid(),'11111111-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002')$$) = 1);
SELECT rlstest.check('[3100] voter CAN message an unclaimed candidate (no other participant yet)',
  rlstest.rc($$INSERT INTO conversations (voter_id,candidate_id,candidate_user_id) VALUES (auth.uid(),'11111111-0000-0000-0000-000000000003',NULL)$$) = 1);
SELECT rlstest.check('[3100] voter sends a message', rlstest.rc($$INSERT INTO messages (conversation_id,sender_id,sender_role,body) VALUES ('c0110000-0000-0000-0000-000000000001',auth.uid(),'voter','hello')$$) = 1);
SELECT rlstest.check('[3100] voter CANNOT label their message as the candidate''s',
  rlstest.rc($$INSERT INTO messages (conversation_id,sender_id,sender_role,body) VALUES ('c0110000-0000-0000-0000-000000000001',auth.uid(),'candidate','I am the candidate')$$) = 1
  AND rlstest.cnt($$SELECT count(*) FROM messages WHERE body='I am the candidate' AND sender_role='voter'$$) = 1);
SELECT rlstest.check('[3100] voter CANNOT redirect the conversation to another user',
  rlstest.fails($$UPDATE conversations SET candidate_user_id='dddddddd-0000-0000-0000-000000000004' WHERE id='c0110000-0000-0000-0000-000000000001'$$));
SELECT rlstest.check('[3100] voter can still mark it read', rlstest.rc($$UPDATE conversations SET voter_read_at=now() WHERE id='c0110000-0000-0000-0000-000000000001'$$) = 1);
SELECT rlstest.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT rlstest.check('[3100] claimant sees the conversation and replies', rlstest.rc($$INSERT INTO messages (conversation_id,sender_id,sender_role,body) VALUES ('c0110000-0000-0000-0000-000000000001',auth.uid(),'voter','thanks for writing')$$) = 1
  AND rlstest.cnt($$SELECT count(*) FROM messages WHERE body='thanks for writing' AND sender_role='candidate'$$) = 1);
SELECT rlstest.check('[3100] claimant can mark read + bump last_message_at', rlstest.rc($$UPDATE conversations SET candidate_read_at=now(), last_message_at=now() WHERE id='c0110000-0000-0000-0000-000000000001'$$) = 1);
SELECT rlstest.as_user('dddddddd-0000-0000-0000-000000000004');
SELECT rlstest.check('[3100] outsider sees no conversations or messages',
  rlstest.cnt($$SELECT count(*) FROM conversations$$) + rlstest.cnt($$SELECT count(*) FROM messages$$) = 0);
SELECT rlstest.check('[3100] outsider cannot post into someone else''s conversation',
  rlstest.fails($$INSERT INTO messages (conversation_id,sender_id,sender_role,body) VALUES ('c0110000-0000-0000-0000-000000000001',auth.uid(),'voter','intrude')$$));

-- ───────── Lens This self-publish (20260913003200) ─────────
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('[3200] user CANNOT self-publish a "true" fact check',
  rlstest.fails($$INSERT INTO fact_checks (claim_text, submitted_by_user_id, status, assessment, explanation) VALUES ('Candidate X is a criminal', auth.uid(), 'published', 'true', 'Verified by BallotLens')$$));
SELECT rlstest.check('[3200] user cannot pre-fill a verdict on a pending submission',
  rlstest.fails($$INSERT INTO fact_checks (claim_text, submitted_by_user_id, assessment) VALUES ('x', auth.uid(), 'false')$$));
SELECT rlstest.check('[3200] a normal submission still works (what the app sends)',
  rlstest.rc($$INSERT INTO fact_checks (id, claim_text, source_url, source_platform, submitted_by_user_id) VALUES ('fc000000-0000-0000-0000-000000000001','Taxes doubled last year','https://example.com','x',auth.uid())$$) = 1);
SELECT rlstest.check('[3200] submitter cannot publish it afterwards either', rlstest.rc($$UPDATE fact_checks SET status='published'$$) = 0);
SELECT rlstest.as_user('dddddddd-0000-0000-0000-000000000004');
SELECT rlstest.check('[3200] others cannot see the pending submission', rlstest.cnt($$SELECT count(*) FROM fact_checks WHERE id='fc000000-0000-0000-0000-000000000001'$$) = 0);
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('[3200] admin CAN publish with a verdict',
  rlstest.rc($$UPDATE fact_checks SET status='published', assessment='misleading', explanation='Rates rose 8%, not 100%.', reviewed_at=now() WHERE id='fc000000-0000-0000-0000-000000000001'$$) = 1);
SELECT rlstest.as_anon();
SELECT rlstest.check('[3200] published check is public', rlstest.cnt($$SELECT count(*) FROM fact_checks WHERE id='fc000000-0000-0000-0000-000000000001' AND status='published'$$) = 1);

-- ───────── follower notifications (20260913003300) ─────────
SELECT rlstest.as_owner();
INSERT INTO auth.users (id,email) VALUES
 ('f0110000-0000-0000-0000-000000000001','fan1@t.io'),
 ('f0220000-0000-0000-0000-000000000002','fan2_optout@t.io'),
 ('f0330000-0000-0000-0000-000000000003','claim5@t.io');
INSERT INTO candidates (id,first_name,last_name) VALUES ('55555555-0000-0000-0000-000000000005','Maria','Lopez');
INSERT INTO candidate_claims (candidate_id,user_id,full_name,email,status) VALUES ('55555555-0000-0000-0000-000000000005','f0330000-0000-0000-0000-000000000003','Maria','claim5@t.io','verified');
UPDATE notification_preferences SET instant_followed_updates = false WHERE user_id = 'f0220000-0000-0000-0000-000000000002';
SELECT rlstest.as_user('f0110000-0000-0000-0000-000000000001');
SELECT rlstest.rc($$INSERT INTO follows (followable_type, followable_id) VALUES ('candidate','55555555-0000-0000-0000-000000000005')$$);
SELECT rlstest.as_user('f0220000-0000-0000-0000-000000000002');
SELECT rlstest.rc($$INSERT INTO follows (followable_type, followable_id) VALUES ('candidate','55555555-0000-0000-0000-000000000005')$$);
SELECT rlstest.as_owner();
SELECT rlstest.check('[3300] claimant told about a new follower (throttled to one)',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0330000-0000-0000-0000-000000000003' AND type='new_follower'$$) = 1);

SELECT rlstest.as_user('f0330000-0000-0000-0000-000000000003');
SELECT rlstest.rc($$INSERT INTO feed_posts (candidate_id, author_user_id, post_type, body) VALUES ('55555555-0000-0000-0000-000000000005', auth.uid(), 'update', 'Town hall Thursday at 6pm')$$);
SELECT rlstest.as_owner();
SELECT rlstest.check('[3300] follower gets new_post with candidate name and post text',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0110000-0000-0000-0000-000000000001' AND type='new_post' AND title='Maria Lopez posted an update' AND body LIKE 'Town hall%'$$) = 1);
SELECT rlstest.check('[3300] follower who turned updates OFF gets nothing',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0220000-0000-0000-0000-000000000002' AND type='new_post'$$) = 0);
SELECT rlstest.check('[3300] the poster is not notified about their own post',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0330000-0000-0000-0000-000000000003' AND type='new_post'$$) = 0);

INSERT INTO voting_records (candidate_id, bill_name, vote) SELECT '55555555-0000-0000-0000-000000000005', 'Bill '||g, 'yes' FROM generate_series(1,20) g;
SELECT rlstest.check('[3300] bulk import of 20 votes -> ONE alert per follower, not 20',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0110000-0000-0000-0000-000000000001' AND type='new_voting_record'$$) = 1);

INSERT INTO candidate_endorsements (id, candidate_id, endorser_name, endorser_type, status) VALUES ('e5000000-0000-0000-0000-000000000005','55555555-0000-0000-0000-000000000005','Teachers Union','union','pending');
SELECT rlstest.check('[3300] pending endorsement notifies nobody',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0110000-0000-0000-0000-000000000001' AND type='new_endorsement'$$) = 0);
UPDATE candidate_endorsements SET status='approved' WHERE id='e5000000-0000-0000-0000-000000000005';
SELECT rlstest.check('[3300] approving it notifies the follower',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0110000-0000-0000-0000-000000000001' AND type='new_endorsement' AND body='Teachers Union'$$) = 1);

INSERT INTO candidate_positions (candidate_id, issue_id, summary) SELECT '55555555-0000-0000-0000-000000000005', id, 'Supports more affordable housing' FROM issues LIMIT 1;
SELECT rlstest.check('[3300] new position notifies the follower',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0110000-0000-0000-0000-000000000001' AND type='position_change'$$) = 1);
UPDATE notifications SET is_read = true WHERE user_id='f0110000-0000-0000-0000-000000000001';
UPDATE candidate_positions SET verification_status = 'verified' WHERE candidate_id='55555555-0000-0000-0000-000000000005';
SELECT rlstest.check('[3300] a status-only change (verification) does NOT re-notify',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0110000-0000-0000-0000-000000000001' AND type='position_change'$$) = 1);
UPDATE candidate_positions SET summary = 'Now also supports rent caps' WHERE candidate_id='55555555-0000-0000-0000-000000000005';
SELECT rlstest.check('[3300] a changed position text notifies again once the old alert was read',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0110000-0000-0000-0000-000000000001' AND type='position_change'$$) = 2);

-- ───────── message notifications (20260913003400) ─────────
SELECT rlstest.as_owner();
INSERT INTO auth.users (id,email) VALUES ('ab000000-0000-0000-0000-000000000001','msgvoter@t.io');
SELECT rlstest.as_user('ab000000-0000-0000-0000-000000000001');
SELECT rlstest.rc($$INSERT INTO conversations (id, voter_id, candidate_id, candidate_user_id)
  VALUES ('cb000000-0000-0000-0000-000000000001', auth.uid(), '55555555-0000-0000-0000-000000000005', 'f0330000-0000-0000-0000-000000000003')$$);
SELECT rlstest.check('[3400] voter sends a message', rlstest.rc($$INSERT INTO messages (conversation_id, sender_id, sender_role, body) VALUES ('cb000000-0000-0000-0000-000000000001', auth.uid(), 'voter', 'When is the town hall?')$$) = 1);
SELECT rlstest.check('[3400] browser still cannot write a notification into someone else''s bell',
  rlstest.fails($$INSERT INTO notifications (user_id, type, title) VALUES ('f0330000-0000-0000-0000-000000000003', 'new_message', 'Click here to verify your account')$$));
SELECT rlstest.as_owner();
SELECT rlstest.check('[3400] candidate gets the message in their bell (was always blocked by RLS)',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='f0330000-0000-0000-0000-000000000003' AND type='new_message' AND title='New message from a voter' AND body='When is the town hall?'$$) = 1);
SELECT rlstest.check('[3400] sender is not notified of their own message',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='ab000000-0000-0000-0000-000000000001' AND type='new_message'$$) = 0);
SELECT rlstest.as_user('f0330000-0000-0000-0000-000000000003');
SELECT rlstest.rc($$INSERT INTO messages (conversation_id, sender_id, sender_role, body) VALUES ('cb000000-0000-0000-0000-000000000001', auth.uid(), 'candidate', 'Thursday at 6')$$);
SELECT rlstest.as_owner();
SELECT rlstest.check('[3400] voter gets the reply, labelled with the candidate''s name',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='ab000000-0000-0000-0000-000000000001' AND type='new_message' AND title='New message from Maria Lopez'$$) = 1);
-- conversation started before the candidate was claimed: candidate_user_id NULL
SELECT rlstest.as_user('ab000000-0000-0000-0000-000000000001');
SELECT rlstest.rc($$INSERT INTO conversations (id, voter_id, candidate_id, candidate_user_id) VALUES ('cb000000-0000-0000-0000-000000000002', auth.uid(), '11111111-0000-0000-0000-000000000001', NULL)$$);
SELECT rlstest.rc($$INSERT INTO messages (conversation_id, sender_id, sender_role, body) VALUES ('cb000000-0000-0000-0000-000000000002', auth.uid(), 'voter', 'Early question')$$);
SELECT rlstest.as_owner();
SELECT rlstest.check('[3400] pre-claim conversation still reaches the verified claimant',
  rlstest.cnt($$SELECT count(*) FROM notifications WHERE user_id='bbbbbbbb-0000-0000-0000-000000000002' AND type='new_message' AND body='Early question'$$) = 1);

-- ───────── promises & claim analysis review (20260913003500) ─────────
-- claimant f0330000 manages candidate 55555555 (Maria Lopez)
SELECT rlstest.as_user('f0330000-0000-0000-0000-000000000003');
SELECT rlstest.check('[3500] candidate can add a promise; it starts unverified even if they send "completed"',
  rlstest.rc($$INSERT INTO candidate_promises (id, candidate_id, promise_text, status) VALUES ('9e000000-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000005','Build 500 homes','completed')$$) = 1
  AND rlstest.cnt($$SELECT count(*) FROM candidate_promises WHERE id='9e000000-0000-0000-0000-000000000001' AND status='unverified'$$) = 1);
SELECT rlstest.check('[3500] candidate CANNOT mark their own promise completed',
  rlstest.fails($$UPDATE candidate_promises SET status='completed', status_evidence='trust me' WHERE id='9e000000-0000-0000-0000-000000000001'$$));
SELECT rlstest.check('[3500] candidate CAN propose a status with evidence',
  rlstest.rc($$UPDATE candidate_promises SET proposed_status='completed', proposed_evidence='Ribbon cutting 3 May', proposed_source_url='https://city.gov/x' WHERE id='9e000000-0000-0000-0000-000000000001'$$) = 1);
SELECT rlstest.as_anon();
SELECT rlstest.check('[3500] public still sees "unverified" while the proposal is pending',
  rlstest.cnt($$SELECT count(*) FROM candidate_promises WHERE id='9e000000-0000-0000-0000-000000000001' AND status='unverified'$$) = 1);
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('[3500] admin applies the proposal',
  rlstest.rc($$UPDATE candidate_promises SET status=proposed_status, status_evidence=proposed_evidence, status_source_url=proposed_source_url, status_updated_at=now(), proposed_status=NULL, proposed_evidence=NULL, proposed_source_url=NULL WHERE id='9e000000-0000-0000-0000-000000000001'$$) = 1
  AND rlstest.cnt($$SELECT count(*) FROM candidate_promises WHERE id='9e000000-0000-0000-0000-000000000001' AND status='completed' AND proposed_status IS NULL$$) = 1);

SELECT rlstest.as_user('f0330000-0000-0000-0000-000000000003');
SELECT rlstest.check('[3500] candidate''s claim analysis is saved as pending even if they send published',
  rlstest.rc($$INSERT INTO candidate_claim_analysis (id, candidate_id, claim_text, has_specific_plan, authority_assessment, review_status) VALUES ('9a000000-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000005','I will cut taxes 50%',true,'within','published')$$) = 1
  AND rlstest.cnt($$SELECT count(*) FROM candidate_claim_analysis WHERE id='9a000000-0000-0000-0000-000000000001' AND review_status='pending'$$) = 1);
SELECT rlstest.as_anon();
SELECT rlstest.check('[3500] public cannot see pending analysis', rlstest.cnt($$SELECT count(*) FROM candidate_claim_analysis WHERE id='9a000000-0000-0000-0000-000000000001'$$) = 0);
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('[3500] admin publishes it', rlstest.rc($$UPDATE candidate_claim_analysis SET review_status='published' WHERE id='9a000000-0000-0000-0000-000000000001'$$) = 1);
SELECT rlstest.as_anon();
SELECT rlstest.check('[3500] now public', rlstest.cnt($$SELECT count(*) FROM candidate_claim_analysis WHERE id='9a000000-0000-0000-0000-000000000001'$$) = 1);
SELECT rlstest.as_user('f0330000-0000-0000-0000-000000000003');
SELECT rlstest.rc($$UPDATE candidate_claim_analysis SET authority_assessment='within', analysis_notes='edited' WHERE id='9a000000-0000-0000-0000-000000000001'$$);
SELECT rlstest.as_anon();
SELECT rlstest.check('[3500] a candidate edit sends a published analysis back to review', rlstest.cnt($$SELECT count(*) FROM candidate_claim_analysis WHERE id='9a000000-0000-0000-0000-000000000001'$$) = 0);

-- ───────── stories drafts (20260913003600) ─────────
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('[3600] admin creates a draft story',
  rlstest.rc($$INSERT INTO stories (id, title, slug, body, is_published) VALUES ('5700a000-0000-0000-0000-000000000001','Draft piece','draft-piece','body',false)$$) = 1);
SELECT rlstest.check('[3600] admin can read the draft back (previously invisible)',
  rlstest.cnt($$SELECT count(*) FROM stories WHERE id='5700a000-0000-0000-0000-000000000001'$$) = 1);
SELECT rlstest.as_anon();
SELECT rlstest.check('[3600] public cannot see drafts', rlstest.cnt($$SELECT count(*) FROM stories WHERE id='5700a000-0000-0000-0000-000000000001'$$) = 0);
SELECT rlstest.as_user('cccccccc-0000-0000-0000-000000000003');
SELECT rlstest.check('[3600] non-admin cannot write stories',
  rlstest.fails($$INSERT INTO stories (title, slug, body, is_published) VALUES ('x','x-voter','x',true)$$));
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('[3600] admin publishes it', rlstest.rc($$UPDATE stories SET is_published=true, published_at=now() WHERE id='5700a000-0000-0000-0000-000000000001'$$) = 1);
SELECT rlstest.as_anon();
SELECT rlstest.check('[3600] published story is public', rlstest.cnt($$SELECT count(*) FROM stories WHERE slug='draft-piece'$$) = 1);

-- ───────── candidate quiz answers review (20260913003700) ─────────
SELECT rlstest.as_owner();
CREATE TEMP TABLE IF NOT EXISTS rlstest_q AS SELECT id FROM civic_quiz_questions ORDER BY id LIMIT 1;
GRANT SELECT ON rlstest_q TO authenticated, anon;
SELECT rlstest.as_user('f0330000-0000-0000-0000-000000000003');
SELECT rlstest.check('[3700] candidate saves a quiz answer (what the app sends)',
  rlstest.rc($$INSERT INTO candidate_quiz_answers (candidate_id, question_id, answer) SELECT '55555555-0000-0000-0000-000000000005', id, 'a' FROM rlstest_q$$) = 1);
SELECT rlstest.check('[3700] candidate CANNOT approve their own answers (was UPDATE 1)',
  rlstest.rc($$UPDATE candidate_quiz_answers SET status='approved' WHERE candidate_id='55555555-0000-0000-0000-000000000005'$$) >= 0
  AND rlstest.cnt($$SELECT count(*) FROM candidate_quiz_answers WHERE candidate_id='55555555-0000-0000-0000-000000000005' AND status='approved'$$) = 0);
SELECT rlstest.check('[3700] cannot insert pre-approved either',
  rlstest.cnt($$SELECT count(*) FROM candidate_quiz_answers WHERE candidate_id='55555555-0000-0000-0000-000000000005' AND status='pending'$$) = 1);
SELECT rlstest.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT rlstest.check('[3700] admin approves', rlstest.rc($$UPDATE candidate_quiz_answers SET status='approved' WHERE candidate_id='55555555-0000-0000-0000-000000000005'$$) = 1);
SELECT rlstest.as_anon();
SELECT rlstest.check('[3700] approved answer is public (used for voter matching)', rlstest.cnt($$SELECT count(*) FROM candidate_quiz_answers WHERE candidate_id='55555555-0000-0000-0000-000000000005'$$) = 1);
SELECT rlstest.as_user('f0330000-0000-0000-0000-000000000003');
SELECT rlstest.rc($$INSERT INTO candidate_quiz_answers (candidate_id, question_id, answer) SELECT '55555555-0000-0000-0000-000000000005', id, 'd' FROM rlstest_q
  ON CONFLICT (candidate_id, question_id) DO UPDATE SET answer = EXCLUDED.answer$$);
SELECT rlstest.as_anon();
SELECT rlstest.check('[3700] changing an approved answer sends it back to review (was live unreviewed)',
  rlstest.cnt($$SELECT count(*) FROM candidate_quiz_answers WHERE candidate_id='55555555-0000-0000-0000-000000000005'$$) = 0);

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
