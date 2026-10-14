# New features — setup guide

Everything below is already in the code. Each feature needs at most a free API
key or two; without its key a feature switches itself off cleanly (the rest of
the site keeps working).

## 1. Run the new database migrations

In Supabase → **SQL Editor**, run these files from `migrations/` **in this order**
(each one is safe to run once; they only add things):

| File | What it adds |
|---|---|
| `20260915000100_hide_private_claim_fields_from_public.sql` | **Security fix** — hides claimants' emails and admin notes from the public |
| `20260915000200_ballot_picks.sql` | My Picks (private to each voter) |
| `20260915000300_candidate_external_data_ids.sql` | FEC + Open States IDs on candidates |
| `20260915000400_push_and_sms_reminders.sql` | Push subscriptions + verified SMS reminders |
| `20260915000500_partners_and_embed.sql` | Partner widget + partner stats |

## 2. Deploy the new edge functions

`voter-info`, `representatives`, `campaign-finance`, `sms-optin`, `ask-ai`
(and redeploy `send-election-reminders`, `send-message-notification`,
`send-digest-emails`, `send-team-invite-notification`, `ap-elections`, because
`_shared/` changed):

```
supabase functions deploy voter-info representatives campaign-finance sms-optin ask-ai \
  send-election-reminders send-message-notification send-digest-emails send-team-invite-notification ap-elections
```

## 3. Secrets (Supabase → Edge Functions → Secrets)

| Secret | Feature | Where to get it | Cost |
|---|---|---|---|
| `GOOGLE_CIVIC_API_KEY` | Where do I vote? (polling places, early voting, drop boxes) | Google Cloud Console → enable "Google Civic Information API" → Credentials → API key | Free |
| `OPENSTATES_API_KEY` | Who represents me + sponsored bills | open.pluralpolicy.com/accounts/profile (Open States) | Free |
| `FEC_API_KEY` | Campaign finance on profiles | api.data.gov/signup | Free (works with a low-limit demo key if unset) |
| `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) | Ask AI with a real language model | console.anthropic.com | Pay per use (small) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notifications | Run `npx web-push generate-vapid-keys`; subject = `mailto:your-support-email` | Free |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER`) | SMS election reminders | twilio.com (US texting needs A2P 10DLC registration) | Pay per text |

## 4. Netlify environment variable

| Variable | Value |
|---|---|
| `VITE_VAPID_PUBLIC_KEY` | the same **public** VAPID key as above (never the private one) |

Then redeploy. Netlify also picks up the new edge function
`netlify/edge-functions/embed-frame-headers.ts` automatically (it lets only the
partner widget be shown inside other websites).

## 5. Quick checks after deploying

- My Ballot → "Get ready to vote" → enter a real street address → polling place appears.
- Footer → "Who represents me?" → enter an address → members of Congress and state legislators.
- Admin → Manage Candidates → Edit → "Public data links" → add an FEC ID → profile shows Campaign finance.
- Admin → Partners → create a partner → "Preview widget".
- `curl -sI https://YOUR-SITE/embed | grep -i frame` should show `frame-ancestors *` and no `X-Frame-Options`;
  `curl -sI https://YOUR-SITE/ | grep -i frame` should show `X-Frame-Options: DENY`.
- Account → Notifications → turn on push on a phone (iPhone: add to Home Screen first).

## Feature list

1. **Election Day kit** — polling place / early voting / drop boxes, registration and vote-by-mail links per state, **My Picks** (print, share, add to calendar).
2. **Who represents me** — Congress + state legislators, contact info, recent sponsored bills.
3. **Campaign finance** — FEC totals: raised, spent, cash on hand, where the money came from.
4. **CSV import puts candidates on their race** (office, district, state, incumbent columns + template).
5. **Installable app (PWA)**, **push notifications**, **verified SMS reminders**.
6. **Partner widget** for other websites + **partner dashboard** (views, lookups, clicks, embed code, branding).
7. **Ask AI with a language model**, answering only from the site's evidence, with citations.
8. **10 languages**: English, Spanish, Portuguese, Haitian Creole, Russian, Chinese (Simplified), Vietnamese, Tagalog, Korean, Arabic (right-to-left).

Translations were written without a native-speaker review; have a native
speaker check the new five before a big launch.
