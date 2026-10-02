#!/usr/bin/env bash
# Replays EVERY migration on a throwaway local Postgres (with a minimal stand-in for
# Supabase's auth/storage/roles), then runs:
#   1. detect_policy_errors.sql -- every operation on every table as authenticated + anon,
#      catching broken/recursive policies that only show up when a query is planned
#   2. rls_permissions.sql      -- who can and cannot read/write what, plus regression
#      tests for the security fixes
# Usage:  ./db-tests/run.sh            (needs PostgreSQL 14+ and permission to run psql)
# Set PSQL_AS to run psql as another OS user, e.g.  PSQL_AS=postgres ./db-tests/run.sh
set -u
cd "$(dirname "$0")/.."
DB=${DB_NAME:-bl_test}
run() { if [ -n "${PSQL_AS:-}" ]; then su "$PSQL_AS" -c "$*"; else sh -c "$*"; fi; }

if ! run "psql -d postgres -Atc 'select 1'" >/dev/null 2>&1; then
  echo "Cannot connect to PostgreSQL -- is the server running? (e.g. pg_ctlcluster 16 main start)"; exit 2
fi
run "dropdb --if-exists $DB && createdb $DB" >/dev/null 2>&1
run "psql -q -d $DB -f '$PWD/db-tests/supabase_stub.sql'" >/dev/null 2>&1

fail=0; n=0
for f in $(ls migrations/*.sql | sort); do
  n=$((n+1))
  if ! out=$(run "psql -q -d $DB -v ON_ERROR_STOP=1 --single-transaction -f '$PWD/$f'" 2>&1); then
    fail=$((fail+1)); echo "MIGRATION FAILED: $f"; echo "$out" | grep -E "ERROR|LINE" | head -3
  fi
done
echo "migrations: $n applied, $fail failed"
[ "$fail" -ne 0 ] && exit 1

echo "--- policy error detector ---"
run "psql -d $DB -f '$PWD/db-tests/detect_policy_errors.sql'" 2>&1 | grep -E "broken_table_ops|^ *[0-9]+$|ERROR|infinite|\|.*\|" | head -20
run "psql -d $DB -f '$PWD/db-tests/detect_policy_errors.sql'" >/dev/null 2>&1 || { echo "DETECTOR FAILED"; exit 1; }

echo "--- RLS permission suite ---"
run "psql -d $DB -f '$PWD/db-tests/rls_permissions.sql'" > /tmp/rls_suite.out 2>&1
grep -E "NOTICE:  FAIL" /tmp/rls_suite.out
echo "passed: $(grep -c 'NOTICE:  PASS' /tmp/rls_suite.out)  failed: $(grep -c 'NOTICE:  FAIL' /tmp/rls_suite.out)"
grep -q "NOTICE:  FAIL" /tmp/rls_suite.out && exit 1
grep -q "^psql:.*ERROR" /tmp/rls_suite.out && { grep "ERROR" /tmp/rls_suite.out | head -3; exit 1; }
echo "--- code vs schema cross-check ---"
if [ -n "${PSQL_AS:-}" ]; then
  su "$PSQL_AS" -c "cd '$PWD' && PSQL='psql -d $DB' python3 db-tests/schema_crosscheck.py" || exit 1
else
  PSQL="psql -d $DB" python3 db-tests/schema_crosscheck.py || exit 1
fi
echo "ALL DATABASE TESTS PASSED"
