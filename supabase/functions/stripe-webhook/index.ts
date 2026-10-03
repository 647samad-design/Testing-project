import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import Stripe from "npm:stripe@17.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Stripe-Signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeWebhookSecret || !stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe secrets are not configured (STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY)" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rawBody = await req.text();
    const signature = req.headers.get("Stripe-Signature");

    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing Stripe-Signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // REAL signature verification. This is what prevents anyone from
    // POSTing a fake event to this endpoint and granting themselves
    // premium access without paying.
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        stripeWebhookSecret
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eventId = event.id;
    const eventType = event.type;

    // IDEMPOTENCY. Only a SUCCESSFULLY processed event is skipped. Previously
    // any stored event was skipped, so an event whose processing failed once
    // was answered "already processed" on every Stripe retry and never applied.
    const { data: existingEvent, error: lookupError } = await supabase
      .from("stripe_webhook_events")
      .select("id, processed")
      .eq("event_id", eventId)
      .maybeSingle();
    if (lookupError) return jsonResponse({ error: "Failed to look up webhook event", detail: lookupError.message }, 500);

    if (existingEvent?.processed) {
      return jsonResponse({ received: true, duplicate: true, message: "Event already processed" }, 200);
    }

    if (!existingEvent) {
      const { error: insertError } = await supabase
        .from("stripe_webhook_events")
        .insert({ event_id: eventId, event_type: eventType, processed: false, payload: event });
      if (insertError) return jsonResponse({ error: "Failed to store webhook event", detail: insertError.message }, 500);
    }

    let processingError: string | null = null;
    try {
      switch (eventType) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(supabase, event.data.object as unknown as Row);
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await handleSubscriptionChange(supabase, event.data.object as unknown as Row);
          break;
        case "invoice.paid":
          await handleInvoicePaid(supabase, event.data.object as unknown as Row);
          break;
        case "invoice.payment_failed":
          await handleInvoiceFailed(supabase, event.data.object as unknown as Row);
          break;
        case "payment_intent.succeeded":
          await handlePaymentSucceeded(supabase, event.data.object as unknown as Row);
          break;
        case "payment_intent.payment_failed":
          await handlePaymentFailed(supabase, event.data.object as unknown as Row);
          break;
        case "charge.refunded":
          await handleChargeRefunded(supabase, event.data.object as unknown as Row);
          break;
        default:
          break;
      }
    } catch (err) {
      processingError = err instanceof Error ? err.message : String(err);
    }

    await supabase
      .from("stripe_webhook_events")
      .update({
        processed: processingError === null,
        processed_at: new Date().toISOString(),
        error_message: processingError,
      })
      .eq("event_id", eventId);

    // A processing failure returns 500 so Stripe retries the event (it retries
    // with backoff for up to 3 days). Previously every failure returned 200,
    // which told Stripe "done" and silently dropped the change.
    return jsonResponse(
      { received: true, processed: processingError === null, error: processingError },
      processingError === null ? 200 : 500,
    );
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// deno-lint-ignore no-explicit-any
type Db = any;
type Row = Record<string, unknown>;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** supabase-js reports failures in `error` instead of throwing. Every write in
 * this webhook previously ignored it, so a failed write still got the event
 * marked processed. This turns a failed write into a thrown error. */
type DbResult = { data?: unknown; error: { message: string } | null };
// deno-lint-ignore no-explicit-any
async function must(op: PromiseLike<DbResult>, what: string): Promise<{ data: any }> {
  const result = await op;
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return { data: result.data ?? null };
}

async function findUserIdForCustomer(supabase: Db, customerId: string): Promise<string | null> {
  const { data } = await must(
    supabase.from("stripe_customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle(),
    "look up stripe customer",
  );
  return (data as { user_id: string } | null)?.user_id ?? null;
}

function toIso(unixSeconds: unknown): string | null {
  return typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;
}

async function handleCheckoutCompleted(supabase: Db, session: Row): Promise<void> {
  const customerId = session.customer as string;
  const customerEmail = (session.customer_details as Row | undefined)?.email as string | undefined;
  if (session.mode === "subscription") {
    await ensureStripeCustomer(supabase, customerId, customerEmail);
  }
}

async function handleSubscriptionChange(supabase: Db, subscription: Row): Promise<void> {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id as string;
  const status = subscription.status as string;
  const items = subscription.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  const priceId = items?.data?.[0]?.price?.id;

  // Voter-facing tiers. Claiming a candidate profile is FREE (client decision,
  // Sept 2026). Candidate Management ($299, per claimed candidate profile) is
  // the only paid candidate add-on, stored per candidate, not per user.
  const candidateMgmtPriceId = Deno.env.get("STRIPE_CANDIDATE_MANAGEMENT_PRICE_ID");

  if (priceId && priceId === candidateMgmtPriceId) {
    const candidateId = (subscription.metadata as Record<string, string> | undefined)?.candidate_id;
    if (!candidateId) throw new Error(`Management subscription ${subscriptionId} has no candidate_id metadata`);
    await must(
      supabase.from("candidate_management_subscriptions").upsert({
        candidate_id: candidateId,
        status,
        is_comped: false,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        current_period_start: toIso(subscription.current_period_start),
        current_period_end: toIso(subscription.current_period_end),
        canceled_at: status === "canceled" ? new Date().toISOString() : null,
      }, { onConflict: "candidate_id" }),
      "upsert candidate_management_subscriptions",
    );
    return;
  }

  const userId = await findUserIdForCustomer(supabase, customerId);
  if (!userId) throw new Error(`No stripe_customers row for ${customerId}`);

  const planByPrice: Record<string, [string, string]> = {};
  for (const [envName, plan, interval] of [
    ["STRIPE_CANDIDATE_MONTHLY_PRICE_ID", "candidate_monthly", "monthly"],
    ["STRIPE_CANDIDATE_YEARLY_PRICE_ID", "candidate_yearly", "yearly"],
    ["STRIPE_PRO_MONTHLY_PRICE_ID", "pro_monthly", "monthly"],
    ["STRIPE_PRO_YEARLY_PRICE_ID", "pro_yearly", "yearly"],
  ]) {
    const id = Deno.env.get(envName);
    if (id) planByPrice[id] = [plan, interval];
  }
  const [plan, billingInterval] = (priceId && planByPrice[priceId]) || ["free", null];

  await must(
    supabase.from("subscriptions").upsert({
      user_id: userId,
      plan,
      plan_type: plan,
      billing_interval: billingInterval,
      status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      current_period_start: toIso(subscription.current_period_start),
      current_period_end: toIso(subscription.current_period_end),
      cancel_at_period_end: (subscription.cancel_at_period_end as boolean | undefined) ?? false,
    }, { onConflict: "user_id" }),
    "upsert subscriptions",
  );
}

// For subscription charges Stripe sends BOTH invoice.paid and
// payment_intent.succeeded. invoice.paid is the authoritative record for those;
// payment_intent.succeeded only records one-off charges that have no invoice.
// Both write keyed on the payment intent id (unique index), so neither order
// nor retries can store the same charge twice.
async function handleInvoicePaid(supabase: Db, invoice: Row): Promise<void> {
  const customerId = invoice.customer as string;
  const paymentIntentId = (invoice.payment_intent as string | null) ?? null;
  const invoiceId = invoice.id as string;
  const amountPaid = invoice.amount_paid as number;
  const currency = invoice.currency as string;
  const userId = await findUserIdForCustomer(supabase, customerId);

  const row = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_payment_intent_id: paymentIntentId,
    stripe_invoice_id: invoiceId,
    amount: amountPaid,
    currency,
    payment_type: "subscription",
    status: "succeeded",
  };

  if (paymentIntentId) {
    await must(supabase.from("payments").upsert(row, { onConflict: "stripe_payment_intent_id" }), "upsert payment");
  } else {
    // $0 invoices (e.g. fully discounted) have no payment intent; dedupe by invoice.
    const { data: existing } = await must(
      supabase.from("payments").select("id").eq("stripe_invoice_id", invoiceId).eq("status", "succeeded").maybeSingle(),
      "look up payment by invoice",
    );
    if (!existing) await must(supabase.from("payments").insert(row), "insert payment");
  }

  if (userId && paymentIntentId) {
    await must(
      supabase.from("revenue_transactions").upsert({
        transaction_type: "subscription",
        user_id: userId,
        stripe_payment_id: paymentIntentId,
        amount_cents: amountPaid,
        currency,
        status: "completed",
      }, { onConflict: "stripe_payment_id" }),
      "upsert revenue transaction",
    );
  }
}

async function handleInvoiceFailed(supabase: Db, invoice: Row): Promise<void> {
  const customerId = invoice.customer as string;
  const userId = await findUserIdForCustomer(supabase, customerId);
  await must(
    supabase.from("payments").insert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_invoice_id: invoice.id as string,
      amount: invoice.amount_due as number,
      payment_type: "subscription",
      status: "failed",
    }),
    "insert failed invoice payment",
  );
}

async function handlePaymentSucceeded(supabase: Db, paymentIntent: Row): Promise<void> {
  const customerId = paymentIntent.customer as string | undefined;
  if (!customerId) return;
  if (paymentIntent.invoice) return; // subscription charge: recorded by invoice.paid

  const userId = await findUserIdForCustomer(supabase, customerId);
  await must(
    supabase.from("payments").upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_payment_intent_id: paymentIntent.id as string,
      amount: paymentIntent.amount as number,
      payment_type: "other",
      status: "succeeded",
    }, { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true }),
    "record one-off payment",
  );
}

/** A refund (full or partial) issued in Stripe. Without this, refunded payments
 * stayed 'succeeded' and kept counting as revenue in the admin panel. */
async function handleChargeRefunded(supabase: Db, charge: Row): Promise<void> {
  const paymentIntentId = charge.payment_intent as string | null;
  if (!paymentIntentId) return;
  const amount = charge.amount as number;
  const refunded = (charge.amount_refunded as number) ?? 0;
  const full = charge.refunded === true || refunded >= amount;
  await must(
    supabase.from("payments")
      .update({ amount_refunded: refunded, status: full ? "refunded" : "succeeded" })
      .eq("stripe_payment_intent_id", paymentIntentId),
    "record refund",
  );
}

async function handlePaymentFailed(supabase: Db, paymentIntent: Row): Promise<void> {
  const customerId = paymentIntent.customer as string | undefined;
  if (!customerId) return;
  const userId = await findUserIdForCustomer(supabase, customerId);
  await must(
    supabase.from("payments").upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_payment_intent_id: paymentIntent.id as string,
      amount: paymentIntent.amount as number,
      payment_type: "other",
      status: "failed",
    }, { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true }),
    "record failed payment",
  );
}

async function ensureStripeCustomer(supabase: Db, customerId: string, email?: string): Promise<void> {
  if (!email) return;
  const { data: profile } = await must(
    supabase.from("profiles").select("id").eq("email", email).maybeSingle(),
    "look up profile by email",
  );
  if (!profile) return;
  await must(
    supabase.from("stripe_customers").upsert({ user_id: (profile as { id: string }).id, stripe_customer_id: customerId }, { onConflict: "user_id" }),
    "upsert stripe customer",
  );
}
