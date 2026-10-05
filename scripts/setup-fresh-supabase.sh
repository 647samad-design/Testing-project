#!/usr/bin/env bash
# Builds the whole Gov Search App schema on a NEW, EMPTY Supabase project by applying
# every file in migrations/ in order. Each file runs in its own transaction; the
# script stops at the first error. Applied files are recorded in
# public.ballotlens_schema_migrations, so re-running continues where it stopped.
#
# Usage:
#   DATABASE_URL='postgresql://postgres:<password>@db.<new-project-ref>.supabase.co:5432/postgres' \
#     ./scripts/setup-fresh-supabase.sh
#
# NOT for the current (Bolt) database -- that already has everything up to
# 20260913002800; use ./scripts/apply-pending-migrations.sh there. This script
# refuses to run on a database that already has Gov Search App tables but no
# tracking table, to avoid re-applying 90+ migrations on top of live data.
set -u
cd "$(dirname "$0")/.."
[ -n "${DATABASE_URL:-}" ] || { echo "Set DATABASE_URL first."; exit 2; }
command -v psql >/dev/null || { echo "psql not found."; exit 2; }
q() { psql "$DATABASE_URL" -Atc "$1"; }

has_tracking=$(q "select to_regclass('public.ballotlens_schema_migrations') is not null")
has_app=$(q "select to_regclass('public.candidates') is not null")
if [ "$has_tracking" != "t" ] && [ "$has_app" = "t" ]; then
  echo "This database already has Gov Search App tables but was not set up by this script."
  echo "It looks like an existing database. Use ./scripts/apply-pending-migrations.sh instead."
  exit 1
fi

q "create table if not exists public.ballotlens_schema_migrations (filename text primary key, applied_at timestamptz not null default now())" >/dev/null
q "alter table public.ballotlens_schema_migrations enable row level security" >/dev/null

total=0; applied=0
for path in $(ls migrations/*.sql | sort); do
  f=$(basename "$path"); total=$((total+1))
  [ "$(q "select count(*) from public.ballotlens_schema_migrations where filename = '$f'")" = "1" ] && continue
  printf "apply  %s\n" "$f"
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -q \
        -c "\\i $path" -c "insert into public.ballotlens_schema_migrations (filename) values ('$f')" >/dev/null; then
    echo; echo "FAILED on $f (rolled back). Fix it and re-run; completed files are skipped."; exit 1
  fi
  applied=$((applied+1))
done
echo; echo "Migrations: $total total, $applied applied now."; echo
psql "$DATABASE_URL" -f scripts/verify-live.sql
