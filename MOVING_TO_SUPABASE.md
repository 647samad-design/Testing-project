# Moving the database off Bolt / updating the live database

## 0. First check: you may not need to move anything
Bolt's Supabase integration creates the project **in your own Supabase account**.
Open https://supabase.com/dashboard and look for project
`afmabpxjfdvvjglbsbna`. If it's listed there, you already own the live database.
You can keep using it and skip section B entirely — just run section A against it.

## A. Update an existing database (the current live one)
It already has migrations up to `20260913002800`. Apply the rest:

```bash
# Dashboard > Project Settings > Database > Connection string (URI)
export DATABASE_URL='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres'
./scripts/apply-pending-migrations.sh
```
Applies 2900 → 3700 in order (each in its own transaction), stops at the first
error, skips anything already applied, then prints the verification
(`m2900 = n`, every other column `1`).

## B. Set up a brand-new Supabase project
1. Build the schema (all migrations, in order, resumable):
   ```bash
   export DATABASE_URL='<new project connection string>'
   ./scripts/setup-fresh-supabase.sh
   ```
   Refuses to run on a database that already has BallotLens tables.
2. Copy the data (users, candidates, payments…) from the old project — data
   only, since the schema is already built:
   ```bash
   pg_dump "$OLD_DATABASE_URL" --data-only --schema=public --schema=auth \
     --exclude-table=public.ballotlens_schema_migrations \
     --disable-triggers -f ballotlens-data.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ballotlens-data.sql
   ```
   Copying `auth` keeps every user's login and password. `--disable-triggers`
   stops follower/message triggers from re-sending old notifications.
3. Copy uploaded photos: Storage bucket `candidate-photos` isn't in the SQL
   dump — download from the old project and upload to the new one (Dashboard
   > Storage, or the Supabase CLI).

## C. After either A or B
- **Edge functions** (Supabase CLI, `supabase login` first):
  ```bash
  P=<project-ref>
  for f in create-checkout-session create-portal-session delete-my-account ap-elections \
           send-email send-message-notification send-team-invite-notification \
           send-election-reminders send-digest-emails civic-news; do
    supabase functions deploy $f --project-ref $P
  done
  supabase functions deploy stripe-webhook    --project-ref $P --no-verify-jwt
  supabase functions deploy email-unsubscribe --project-ref $P --no-verify-jwt
  ```
- **Secrets** (Dashboard > Edge Functions > Secrets): `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, the five `STRIPE_*_PRICE_ID`s, `RESEND_API_KEY`,
  `AP_ELECTIONS_API_KEY`, `SITE_URL`, optional `EMAIL_UNSUBSCRIBE_SECRET`.
  See `.env.example`.
- **Stripe webhook** (only if the project changed): point it at
  `https://<project-ref>.supabase.co/functions/v1/stripe-webhook` and put the new
  signing secret in `STRIPE_WEBHOOK_SECRET`.
- **Auth URLs** (Dashboard > Authentication > URL Configuration): Site URL =
  your domain; add `https://<domain>/**` to Redirect URLs. Otherwise password-
  reset and confirmation emails link to the wrong place.
- **Frontend env** (only if the project changed): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`.

Both scripts were tested on a replay of every migration: A applies 9/9 then
skips 9/9 on re-run; B builds 93/93, re-runs as 0, and refuses an existing DB.
