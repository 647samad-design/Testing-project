# Database tests

Reading SQL is not the same as running it. These scripts apply every migration to a real
throwaway PostgreSQL and test the row-level-security rules with real roles.

```
PSQL_AS=postgres ./db-tests/run.sh      # or plain ./db-tests/run.sh if your user can run psql
```

What it catches that code review and the TypeScript tests cannot:
- policies that recurse into each other forever (only fails when a query is planned)
- "fixes" that don't work at runtime (e.g. a column REVOKE that a table-level grant overrides)
- a new policy that is silently defeated by an older, more permissive one that was never dropped
- admin/claimant/voter/anonymous access checked against actual data

`supabase_stub.sql` is a minimal stand-in for Supabase's `auth`/`storage` schemas and roles
(`anon`, `authenticated`, `service_role`); it is not the real thing, so a passing run is strong
evidence but not a substitute for checking the live project (see the verification queries
in the project notes).

## API integration tests (real PostgREST)

```
PSQL_AS=postgres POSTGREST_BIN=/path/to/postgrest ./db-tests/run-api-tests.sh
```

Runs real app code (currently `getVoterBallot`) through a real PostgREST 12 --
the server Supabase uses -- configured with Supabase's 1,000-row response cap,
against a fixture with 1,200+ races in one state. This is what proved the old
ballot loader silently dropped races past row 1,000 (999 of 1,200 shown) and
missed a voter's own district race entirely. The vitest file skips itself
unless `PGRST_URL` is set, so the normal `npm test` run is unaffected.
