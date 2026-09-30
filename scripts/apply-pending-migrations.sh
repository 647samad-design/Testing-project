#!/usr/bin/env bash
# Applies the migrations that are NOT yet on the live database, in order, each in
# its own transaction, stopping at the first error. Then runs the verification.
#
# Usage:
#   DATABASE_URL='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres' \
#     ./scripts/apply-pending-migrations.sh
#
# Get DATABASE_URL from Supabase Dashboard > Project Settings > Database >
# Connection string (URI). Keep it private; don't commit it or paste it in chat.
# Requires psql (PostgreSQL client) 14+.
#
# Safe to re-run: if a migration was already applied, the script detects it and
# skips it instead of applying it twice.
set -u
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Set DATABASE_URL first (see the comment at the top of this script)."; exit 2
fi
command -v psql >/dev/null || { echo "psql not found. Install the PostgreSQL client first."; exit 2; }

# migration file -> SQL that returns 1 when it is already applied
declare -a ORDER=(
  "20260913002900_fix_account_deletion_blocked_by_reviewer_fk.sql|select (confdeltype = 'n')::int from pg_constraint where conname = 'candidate_submissions_reviewed_by_fkey'"
  "20260913003000_fix_stripe_webhook_statuses_and_duplicate_payments.sql|select count(*) from pg_indexes where indexname = 'payments_stripe_payment_intent_id_key'"
  "20260913003100_fix_messaging_targeting_hijack_and_role_spoofing.sql|select count(*) from pg_trigger where tgname = 'conversations_protect_participants'"
  "20260913003200_fix_fact_check_self_publish.sql|select count(*) from pg_policies where policyname = 'insert_fact_checks' and with_check like '%pending%'"
  "20260913003300_notify_followers_of_candidate_updates.sql|select count(*) from pg_proc where proname = 'notify_candidate_followers'"
  "20260913003400_fix_message_notifications_blocked_by_rls.sql|select count(*) from pg_trigger where tgname = 'messages_notify_recipient'"
  "20260913003500_review_promise_status_and_claim_analysis.sql|select count(*) from pg_trigger where tgname = 'candidate_promises_guard_status'"
  "20260913003600_admin_can_read_draft_stories.sql|select count(*) from pg_policies where policyname = 'admin_read_all_stories'"
  "20260913003700_candidate_quiz_answers_reviewed.sql|select count(*) from pg_trigger where tgname = 'candidate_quiz_answers_guard'"
)

# Guard: the earlier migrations these depend on must already be live.
PRE=$(psql "$DATABASE_URL" -Atc "select count(*) from pg_trigger where tgname = 'profiles_protect_admin_columns'" 2>&1)
if [ "$PRE" != "1" ]; then
  echo "Stopping: migration 20260913002700 doesn't appear to be applied on this database"
  echo "(got: $PRE). Apply migrations up to 20260913002800 first."; exit 1
fi

applied=0; skipped=0
for entry in "${ORDER[@]}"; do
  file="${entry%%|*}"; check="${entry#*|}"
  done_already=$(psql "$DATABASE_URL" -Atc "$check" 2>/dev/null | head -1)
  if [ "${done_already:-0}" = "1" ]; then
    echo "skip   $file (already applied)"; skipped=$((skipped+1)); continue
  fi
  echo "apply  $file"
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -q -f "migrations/$file"; then
    echo; echo "FAILED on $file -- nothing from this file was applied (single transaction)."
    echo "Earlier files in this run WERE applied. Fix the error, then re-run; applied ones are skipped."
    exit 1
  fi
  now=$(psql "$DATABASE_URL" -Atc "$check" | head -1)
  [ "$now" = "1" ] || { echo "Applied $file but its check still fails (got '$now'). Stopping."; exit 1; }
  applied=$((applied+1))
done

echo; echo "Applied: $applied  Already there: $skipped"; echo
psql "$DATABASE_URL" -f scripts/verify-live.sql
