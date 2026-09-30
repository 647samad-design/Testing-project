-- BallotLens: the 9 migrations the live database is still missing (2900 -> 3700).
-- For the EXISTING database (the one claimed from Bolt). Paste this whole file into
-- Supabase > SQL Editor > New query, then click Run. It runs as ONE transaction:
-- if anything fails, nothing is applied.
BEGIN;
DO $$
BEGIN
  -- 1. Must be the BallotLens database, already updated through migration 2800.
  IF to_regclass('public.candidates') IS NULL THEN
    RAISE EXCEPTION 'STOP: this is not the BallotLens database (no candidates table).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_protect_admin_columns') THEN
    RAISE EXCEPTION 'STOP: migration 20260913002700 is missing on this database. Apply 2500-2800 first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'bio') THEN
    RAISE EXCEPTION 'STOP: migration 20260913002800 (profiles.bio) is missing on this database.';
  END IF;
  -- 2. Must not have been run already.
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'candidate_quiz_answers_guard')
     OR EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'payments_stripe_payment_intent_id_key') THEN
    RAISE EXCEPTION 'STOP: these migrations are already applied. Nothing to do.';
  END IF;
END $$;


-- ================= 20260913002900_fix_account_deletion_blocked_by_reviewer_fk.sql =================

/*
# Fix: an admin who ever approved/rejected anything could never delete their account

## What was found
`reviewed_by` on candidate_claims, candidate_submissions,
candidate_questionnaire_responses and candidate_events references
auth.users(id) with the default ON DELETE NO ACTION. apply_candidate_submission()
and reject_candidate_submission() fill it with the reviewing admin's id. After
that, deleting that admin's auth user -- which is exactly what the
delete-my-account edge function does -- fails:

  ERROR: update or delete on table "users" violates foreign key constraint
         "candidate_submissions_reviewed_by_fkey"

Reproduced on a full migration replay. So "Delete My Account" (the Privacy
Policy's right-to-delete promise) silently stopped working for any admin
after their first review, and admins could not be removed at all.

## Fix
ON DELETE SET NULL: the review decision and reviewed_at stay; only the link to
a person who no longer exists is cleared. The audit_log entry for the action
is unaffected.
*/

ALTER TABLE candidate_claims DROP CONSTRAINT IF EXISTS candidate_claims_reviewed_by_fkey;
ALTER TABLE candidate_claims ADD CONSTRAINT candidate_claims_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE candidate_submissions DROP CONSTRAINT IF EXISTS candidate_submissions_reviewed_by_fkey;
ALTER TABLE candidate_submissions ADD CONSTRAINT candidate_submissions_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE candidate_questionnaire_responses DROP CONSTRAINT IF EXISTS candidate_questionnaire_responses_reviewed_by_fkey;
ALTER TABLE candidate_questionnaire_responses ADD CONSTRAINT candidate_questionnaire_responses_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE candidate_events DROP CONSTRAINT IF EXISTS candidate_events_reviewed_by_fkey;
ALTER TABLE candidate_events ADD CONSTRAINT candidate_events_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ================= 20260913003000_fix_stripe_webhook_statuses_and_duplicate_payments.sql =================

/*
# Fix: Stripe statuses rejected by CHECK constraints; subscription payments counted twice

## 1. Status values
Stripe subscription statuses are: incomplete, incomplete_expired, trialing,
active, past_due, canceled, unpaid, paused. `subscriptions.status` only
allowed active/canceled/past_due/trialing/expired and
`candidate_management_subscriptions.status` only active/canceled/past_due/
expired. The webhook writes Stripe's status verbatim, so any of the others
made the upsert fail -- and because the webhook never checked write errors,
the change was silently lost (e.g. a subscription going `unpaid`, or a
Management checkout that starts `incomplete`). All access checks require
status = 'active', so allowing the extra values never grants access.

## 2. Duplicate payment rows
For a subscription charge Stripe sends BOTH payment_intent.succeeded and
invoice.paid. handlePaymentSucceeded() only skipped when a row already
existed, and handleInvoicePaid() never checked at all, so whenever the
payment-intent event arrived first (the usual order) the same charge was
stored twice -- once as 'other', once as 'subscription'. The admin Total
Revenue card sums this table, so it would overstate revenue. The live
database already shows the pattern (14 payment rows vs 9 invoice-derived
revenue rows).

This removes the extra copies (keeping the invoice-linked row when one
exists) and adds unique indexes so the webhook can upsert idempotently.
NULLs stay allowed and distinct, so payments without a payment intent
(e.g. $0 invoices) are unaffected.
*/

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'expired',
                    'incomplete', 'incomplete_expired', 'unpaid', 'paused'));

ALTER TABLE candidate_management_subscriptions DROP CONSTRAINT IF EXISTS candidate_management_subscriptions_status_check;
ALTER TABLE candidate_management_subscriptions ADD CONSTRAINT candidate_management_subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'expired',
                    'incomplete', 'incomplete_expired', 'unpaid', 'paused'));

-- Remove duplicate payment rows for the same payment intent, keeping the best
-- one: an invoice-linked row first, then the earliest.
DELETE FROM payments p
USING (
  SELECT id, row_number() OVER (
           PARTITION BY stripe_payment_intent_id
           ORDER BY (stripe_invoice_id IS NULL), created_at, id
         ) AS rn
  FROM payments
  WHERE stripe_payment_intent_id IS NOT NULL
) d
WHERE p.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_payment_intent_id_key
  ON payments (stripe_payment_intent_id);

DELETE FROM revenue_transactions r
USING (
  SELECT id, row_number() OVER (PARTITION BY stripe_payment_id ORDER BY created_at, id) AS rn
  FROM revenue_transactions
  WHERE stripe_payment_id IS NOT NULL
) d
WHERE r.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS revenue_transactions_stripe_payment_id_key
  ON revenue_transactions (stripe_payment_id);

-- ================= 20260913003100_fix_messaging_targeting_hijack_and_role_spoofing.sql =================

/*
# Fix: voters could message (and email) ANY user, hijack conversations, and
# label their own messages as the candidate's

Reproduced on a full migration replay:

A. insert_own_conversations only checked `auth.uid() = voter_id`. The voter
   chose `candidate_user_id` freely, so they could open a conversation "with a
   candidate" whose other participant was any user id on the platform. That
   user then saw it in their inbox, and send-message-notification emails "the
   other participant" -- i.e. BallotLens-branded email to anyone. It also
   blocked the voter's legitimate conversation with that candidate (unique
   voter_id + candidate_id).

B. update_own_conversations let either participant change any column, so a
   conversation could be redirected afterwards by rewriting candidate_user_id,
   candidate_id or voter_id.

C. messages.sender_role was taken as given, so a voter could insert a message
   marked 'candidate'. The current UI decides "me vs them" by sender_id, but
   anything that trusts sender_role (exports, admin review, notifications)
   would show it as the candidate speaking.

## Fix
A. The other participant must be NULL (the candidate hasn't been claimed yet;
   the verified claimant can still see it via the existing claim clause) or
   the candidate's verified claimant, and never the voter themself.
B. A trigger rejects changes to voter_id / candidate_id / candidate_user_id
   from anon/authenticated. Read markers and last_message_at stay editable,
   which is all the app updates.
C. sender_role is derived from the conversation on insert and can't be set.
*/

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = voter_id
    AND candidate_user_id IS DISTINCT FROM voter_id
    AND (
      candidate_user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = conversations.candidate_id
          AND cc.user_id = conversations.candidate_user_id
          AND cc.status = 'verified'
      )
    )
  );

CREATE OR REPLACE FUNCTION protect_conversation_participants()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
       NEW.voter_id IS DISTINCT FROM OLD.voter_id
    OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
    OR NEW.candidate_user_id IS DISTINCT FROM OLD.candidate_user_id
  ) THEN
    RAISE EXCEPTION 'Conversation participants cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_protect_participants ON conversations;
CREATE TRIGGER conversations_protect_participants
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION protect_conversation_participants();

CREATE OR REPLACE FUNCTION set_message_sender_role()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_voter uuid;
BEGIN
  SELECT voter_id INTO v_voter FROM conversations WHERE id = NEW.conversation_id;
  NEW.sender_role := CASE WHEN NEW.sender_id = v_voter THEN 'voter' ELSE 'candidate' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_set_sender_role ON messages;
CREATE TRIGGER messages_set_sender_role
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION set_message_sender_role();

-- ================= 20260913003200_fix_fact_check_self_publish.sql =================

/*
# CRITICAL: anyone could publish a "BallotLens verified" fact check directly

`insert_fact_checks` only checked `auth.uid() = submitted_by_user_id`. A
submitter could insert with status = 'published', assessment = 'true' and any
explanation, and it was immediately shown to everyone as a reviewed BallotLens
fact check -- e.g. "Candidate X is a criminal", verdict TRUE. Reproduced on a
full migration replay. Same self-approval shape as claims, submissions, events
and ads fixed earlier; 20260913001700 fixed who can READ unreviewed checks but
not what a submitter can INSERT.

Submissions must now start as pending/unverified with no verdict text; only an
admin (update_fact_checks_admin) can set the assessment, explanation and
publish. The app's submitFactCheck() already sends none of these fields, so
nothing legitimate changes.
*/

DROP POLICY IF EXISTS "insert_fact_checks" ON fact_checks;
CREATE POLICY "insert_fact_checks" ON fact_checks FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = submitted_by_user_id
    AND status = 'pending'
    AND assessment = 'unverified'
    AND explanation IS NULL
    AND evidence_text IS NULL
    AND evidence_url IS NULL
    AND reviewed_at IS NULL
  );

-- ================= 20260913003300_notify_followers_of_candidate_updates.sql =================

/*
# Following a candidate never produced a single notification

## What was found
The notifications CHECK allows position_change, new_post, new_voting_record,
new_event, new_endorsement and new_follower, and Account settings offers an
"Updates on what you follow" toggle ("A major update to a candidate ... you
follow"), but nothing anywhere ever created any of those six types. Following
a candidate did nothing beyond adding them to a list.

## Fix
One SECURITY DEFINER function, notify_candidate_followers(), inserts a
notification for every follower of a candidate, and triggers call it when:

  feed_posts            a candidate post is published            -> new_post
  candidate_positions   a position is added or its text changes  -> position_change
  voting_records        a vote is recorded                       -> new_voting_record
  candidate_events      an event becomes approved                -> new_event
  campaign_events       a public campaign event is created       -> new_event
  candidate_endorsements an endorsement becomes approved          -> new_endorsement
  follows               someone follows a candidate               -> new_follower
                        (to that candidate's verified claimant only)

Rules:
- Respects notification_preferences.instant_followed_updates (no row = default on).
- Never notifies the person who made the change.
- Throttle: skips a follower who already has an UNREAD notification of the
  same type for the same candidate from the last 6 hours, so a bulk import of
  50 voting records produces one alert per follower, not 50.
- Only APPROVED events/endorsements notify (pending ones aren't public).
*/

CREATE OR REPLACE FUNCTION notify_candidate_followers(
  p_candidate_id uuid, p_type text, p_title text, p_body text
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  INSERT INTO notifications (user_id, type, title, body, candidate_id, is_read)
  SELECT f.user_id, p_type, p_title, p_body, p_candidate_id, false
  FROM follows f
  LEFT JOIN notification_preferences np ON np.user_id = f.user_id
  WHERE f.followable_type = 'candidate'
    AND f.followable_id = p_candidate_id
    AND f.user_id IS DISTINCT FROM auth.uid()
    AND COALESCE(np.instant_followed_updates, true)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = f.user_id AND n.type = p_type AND n.candidate_id = p_candidate_id
        AND n.is_read = false AND n.created_at > now() - interval '6 hours'
    );
$$;

REVOKE ALL ON FUNCTION notify_candidate_followers(uuid, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION candidate_display_name(p_candidate_id uuid)
RETURNS text SECURITY DEFINER STABLE SET search_path = public LANGUAGE sql AS $$
  SELECT trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) FROM candidates WHERE id = p_candidate_id;
$$;

CREATE OR REPLACE FUNCTION trg_notify_followers()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  who text;
BEGIN
  IF NEW.candidate_id IS NULL THEN RETURN NEW; END IF;
  who := coalesce(nullif(candidate_display_name(NEW.candidate_id), ''), 'A candidate you follow');

  IF TG_TABLE_NAME = 'feed_posts' THEN
    PERFORM notify_candidate_followers(NEW.candidate_id, 'new_post', who || ' posted an update', left(NEW.body, 140));

  ELSIF TG_TABLE_NAME = 'candidate_positions' THEN
    IF TG_OP = 'INSERT' OR NEW.summary IS DISTINCT FROM OLD.summary THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'position_change', who || ' has a new or updated position', left(NEW.summary, 140));
    END IF;

  ELSIF TG_TABLE_NAME = 'voting_records' THEN
    PERFORM notify_candidate_followers(NEW.candidate_id, 'new_voting_record', 'New vote recorded for ' || who, NEW.bill_name);

  ELSIF TG_TABLE_NAME = 'candidate_events' THEN
    IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'new_event', who || ' added an event', NEW.title);
    END IF;

  ELSIF TG_TABLE_NAME = 'campaign_events' THEN
    IF NEW.is_public THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'new_event', who || ' added an event', NEW.title);
    END IF;

  ELSIF TG_TABLE_NAME = 'candidate_endorsements' THEN
    IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
      PERFORM notify_candidate_followers(NEW.candidate_id, 'new_endorsement', who || ' was endorsed', NEW.endorser_name);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_followers_feed_posts ON feed_posts;
CREATE TRIGGER notify_followers_feed_posts AFTER INSERT ON feed_posts
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_positions ON candidate_positions;
CREATE TRIGGER notify_followers_positions AFTER INSERT OR UPDATE OF summary ON candidate_positions
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_voting_records ON voting_records;
CREATE TRIGGER notify_followers_voting_records AFTER INSERT ON voting_records
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_candidate_events ON candidate_events;
CREATE TRIGGER notify_followers_candidate_events AFTER INSERT OR UPDATE OF status ON candidate_events
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_campaign_events ON campaign_events;
CREATE TRIGGER notify_followers_campaign_events AFTER INSERT ON campaign_events
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

DROP TRIGGER IF EXISTS notify_followers_endorsements ON candidate_endorsements;
CREATE TRIGGER notify_followers_endorsements AFTER INSERT OR UPDATE OF status ON candidate_endorsements
  FOR EACH ROW EXECUTE FUNCTION trg_notify_followers();

-- new_follower: tell the candidate's verified claimant (not every follower).
CREATE OR REPLACE FUNCTION trg_notify_new_follower()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.followable_type <> 'candidate' THEN RETURN NEW; END IF;
  INSERT INTO notifications (user_id, type, title, body, candidate_id, is_read)
  SELECT cc.user_id, 'new_follower', 'You have a new follower',
         'A voter started following your profile.', NEW.followable_id, false
  FROM candidate_claims cc
  WHERE cc.candidate_id = NEW.followable_id AND cc.status = 'verified'
    AND cc.user_id IS DISTINCT FROM NEW.user_id
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = cc.user_id AND n.type = 'new_follower' AND n.candidate_id = NEW.followable_id
        AND n.is_read = false AND n.created_at > now() - interval '6 hours'
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_follower ON follows;
CREATE TRIGGER notify_new_follower AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION trg_notify_new_follower();

-- ================= 20260913003400_fix_message_notifications_blocked_by_rls.sql =================

/*
# Fix: the recipient of a message never got an in-app notification

20260913001800 ("sending a message never notified the recipient") only added
'new_message' to the allowed notification types. The notification itself is
inserted by sendMessage() in the browser, for the OTHER participant -- but the
notifications INSERT policy is `auth.uid() = user_id`, so that insert is always
rejected by RLS. sendMessage() didn't check the error, so it failed silently:
reproduced on a full migration replay ("new row violates row-level security
policy for table notifications"). The bell never showed a single message.

The notification is now created by the database when a message is inserted,
which is also safer than trusting title/body text sent from a browser:
- recipient = the conversation's other side (the voter, or the candidate user;
  if the conversation predates the claim, the candidate's verified claimant)
- title/body built server-side from the candidate's name and the message text
- never notifies the sender
The browser-side insert is removed in the same change.
*/

CREATE OR REPLACE FUNCTION notify_message_recipient()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  c record;
  recipient uuid;
  sender_label text;
BEGIN
  SELECT cv.voter_id, cv.candidate_id, cv.candidate_user_id INTO c
  FROM conversations cv WHERE cv.id = NEW.conversation_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.sender_id = c.voter_id THEN
    recipient := COALESCE(
      c.candidate_user_id,
      (SELECT cc.user_id FROM candidate_claims cc
        WHERE cc.candidate_id = c.candidate_id AND cc.status = 'verified'
        ORDER BY cc.reviewed_at DESC NULLS LAST LIMIT 1));
    sender_label := 'a voter';
  ELSE
    recipient := c.voter_id;
    sender_label := COALESCE(NULLIF(candidate_display_name(c.candidate_id), ''), 'the candidate');
  END IF;

  IF recipient IS NULL OR recipient = NEW.sender_id THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, type, title, body, is_read)
  VALUES (recipient, 'new_message', 'New message from ' || sender_label,
          CASE WHEN length(NEW.body) > 140 THEN left(NEW.body, 140) || '…' ELSE NEW.body END,
          false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_notify_recipient ON messages;
CREATE TRIGGER messages_notify_recipient
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_message_recipient();

-- ================= 20260913003500_review_promise_status_and_claim_analysis.sql =================

/*
# Candidates could grade their own promises and publish analysis of their own claims

## What was found
- candidate_promises: the verified claimant (or any active team member) could
  set `status` to 'completed' with their own evidence, and it was shown to
  voters as the tracker's verdict. On a nonpartisan accountability tool the
  candidate is grading themself.
- candidate_claim_analysis: whether a campaign claim has a specific plan and
  whether the office even has authority to do it (`has_specific_plan`,
  `authority_assessment`, `analysis_notes`) is analysis of the candidate, but
  the candidate could write and publish it directly.

## Fix -- same review pattern as endorsements, bio edits and events
Promises
- Candidates/teams may still ADD promises (their own public statements, with a
  source); new promises always start 'unverified'.
- They can no longer change status/evidence directly. Instead they fill
  proposed_status / proposed_evidence / proposed_source_url; an admin reviews
  and either applies it (copies it into status) or discards it.
Claim analysis
- New review_status (pending/published/rejected). Rows written by a candidate
  or team are always 'pending', and any later edit sends a published row back
  to 'pending'. The public only sees 'published'; the candidate's side and
  admins see everything.
Admins are unrestricted. Existing rows keep their current state.
*/

-- ── promises ─────────────────────────────────────────────────────────
ALTER TABLE candidate_promises
  ADD COLUMN IF NOT EXISTS proposed_status text
    CHECK (proposed_status IS NULL OR proposed_status IN ('completed','in_progress','not_started','contradicted','unverified')),
  ADD COLUMN IF NOT EXISTS proposed_evidence text,
  ADD COLUMN IF NOT EXISTS proposed_source_url text,
  ADD COLUMN IF NOT EXISTS proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- NOT security definer on purpose: the guard must see the CALLER's role in
-- current_user. Inside a SECURITY DEFINER function current_user is the owner,
-- so the "is this an ordinary user?" check would always be false and the guard
-- would never run (caught by db-tests).
CREATE OR REPLACE FUNCTION guard_candidate_promise_status()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'unverified';
    NEW.status_evidence := NULL;
    NEW.status_source_url := NULL;
    NEW.status_updated_at := NULL;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.status_evidence IS DISTINCT FROM OLD.status_evidence
       OR NEW.status_source_url IS DISTINCT FROM OLD.status_source_url
       OR NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at THEN
      RAISE EXCEPTION 'Only BallotLens reviewers can change a promise''s status. Submit a proposed status with evidence instead.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.proposed_status IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.proposed_status END)
     OR NEW.proposed_evidence IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.proposed_evidence END) THEN
    NEW.proposed_by := auth.uid();
    NEW.proposed_at := CASE WHEN NEW.proposed_status IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_promises_guard_status ON candidate_promises;
CREATE TRIGGER candidate_promises_guard_status
  BEFORE INSERT OR UPDATE ON candidate_promises
  FOR EACH ROW EXECUTE FUNCTION guard_candidate_promise_status();

-- ── claim analysis ───────────────────────────────────────────────────
ALTER TABLE candidate_claim_analysis
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'published'
    CHECK (review_status IN ('pending', 'published', 'rejected'));

-- NOT security definer on purpose: the guard must see the CALLER's role in
-- current_user. Inside a SECURITY DEFINER function current_user is the owner,
-- so the "is this an ordinary user?" check would always be false and the guard
-- would never run (caught by db-tests).
CREATE OR REPLACE FUNCTION guard_claim_analysis_review()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.review_status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_claim_analysis_guard_review ON candidate_claim_analysis;
CREATE TRIGGER candidate_claim_analysis_guard_review
  BEFORE INSERT OR UPDATE ON candidate_claim_analysis
  FOR EACH ROW EXECUTE FUNCTION guard_claim_analysis_review();

DROP POLICY IF EXISTS "read_candidate_claim_analysis" ON candidate_claim_analysis;
CREATE POLICY "read_candidate_claim_analysis" ON candidate_claim_analysis FOR SELECT
  TO anon, authenticated USING (
    review_status = 'published'
    OR is_admin()
    OR rls_is_verified_claimant(candidate_id)
    OR rls_is_active_team_member(candidate_id)
  );

-- ================= 20260913003600_admin_can_read_draft_stories.sql =================

/*
# Admins couldn't read unpublished (draft) stories

stories has admin INSERT/UPDATE/DELETE, but the only SELECT policy is
`is_published = true`. An admin could write a draft and then never see it
again, so there was no way to build a draft -> publish workflow. (There was
also no story editor at all -- added in the app in the same change.)
*/

DROP POLICY IF EXISTS "admin_read_all_stories" ON stories;
CREATE POLICY "admin_read_all_stories" ON stories FOR SELECT
  TO authenticated USING (is_admin());

-- ================= 20260913003700_candidate_quiz_answers_reviewed.sql =================

/*
# Candidate quiz answers: self-approval, and changed answers went live unreviewed

The candidate quiz page tells candidates "All answers are reviewed before going
live", and voter matching only counts status = 'approved'. But:
- team_update_candidate_answers allowed the submitter to UPDATE any column, so a
  candidate could set status = 'approved' on their own answers (reproduced on a
  full migration replay), and INSERT didn't restrict status either;
- once approved, changing an answer (the app upserts) kept status 'approved',
  so the new answer went live with no review.
(There was also no admin screen to approve them at all, so in practice nothing
ever reached 'approved' -- added in the app in the same change.)

Fix: every write from the candidate's side is 'pending'. Only admins set
approved/rejected. Invoker-rights trigger on purpose: it must see the caller's
role in current_user (see 20260913003500).
*/

CREATE OR REPLACE FUNCTION guard_candidate_quiz_answer()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_quiz_answers_guard ON candidate_quiz_answers;
CREATE TRIGGER candidate_quiz_answers_guard
  BEFORE INSERT OR UPDATE ON candidate_quiz_answers
  FOR EACH ROW EXECUTE FUNCTION guard_candidate_quiz_answer();

COMMIT;

-- ================= VERIFICATION =================
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
