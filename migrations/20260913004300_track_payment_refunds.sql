/*
# Refunds never reached the database, so admin revenue was overstated

The Stripe webhook handled checkout, subscription, invoice and payment-intent
events, but not charge.refunded. A refund issued from the Stripe dashboard (or
a dispute lost) left the payment as 'succeeded', and the admin Billing tab kept
counting it as revenue.

Adds payments.amount_refunded (cents). The webhook now records it on
charge.refunded (status 'refunded' when the full amount was returned), and the
admin revenue figures are net of refunds.

NOTE for deployment: add "charge.refunded" to the events the Stripe webhook
endpoint sends (Stripe Dashboard -> Developers -> Webhooks -> endpoint).
*/
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_refunded integer NOT NULL DEFAULT 0
  CHECK (amount_refunded >= 0);
