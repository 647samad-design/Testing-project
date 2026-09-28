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
