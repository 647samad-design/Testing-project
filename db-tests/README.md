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
