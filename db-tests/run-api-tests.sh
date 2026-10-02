#!/usr/bin/env bash
# Integration tests of real app code against a real PostgREST (the server
# Supabase runs), configured with Supabase's 1,000-row response cap.
# Prereqs: PostgreSQL running, `postgrest` binary on PATH (or POSTGREST_BIN),
# and the migrated database from ./db-tests/run.sh.
# Usage: PSQL_AS=postgres ./db-tests/run-api-tests.sh
set -u
cd "$(dirname "$0")/.."
DB=${DB_NAME:-bl_test}; PORT=${PGRST_PORT:-3210}
BIN=${POSTGREST_BIN:-$(command -v postgrest || echo /tmp/postgrest)}
run() { if [ -n "${PSQL_AS:-}" ]; then su "$PSQL_AS" -c "$*"; else sh -c "$*"; fi; }

./db-tests/run.sh >/dev/null 2>&1 || { echo "db-tests/run.sh failed; fix that first"; exit 1; }
run "psql -q -d $DB -v ON_ERROR_STOP=1" >/dev/null <<SQL || { echo "fixture setup failed"; exit 1; }
DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN
  CREATE ROLE authenticator LOGIN PASSWORD 'pw' NOINHERIT; END IF; END \$\$;
GRANT anon, authenticated TO authenticator;
\i $PWD/db-tests/api_fixture.sql
SQL

CONF=$(mktemp)
cat > "$CONF" <<CFG
db-uri = "postgres://authenticator:pw@127.0.0.1:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
db-max-rows = 1000
server-port = $PORT
jwt-secret = "a-string-secret-at-least-32-characters-long"
CFG
"$BIN" "$CONF" >/tmp/postgrest-test.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -f "$CONF"' EXIT
for i in $(seq 1 60); do
  [ "$(curl -s -m 1 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/issues?select=id&limit=1")" = "200" ] && break; sleep 0.5
done
PGRST_URL="http://127.0.0.1:$PORT" npx vitest run src/services/__tests__/*.integration.test.ts
