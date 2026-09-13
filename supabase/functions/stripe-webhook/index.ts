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

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
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
        JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eventId = event.id;
    const eventType = event.type;

    // IDEMPOTENCY: Check if this event has already been processed
    const { data: existingEvent } = await supabase
      .from("stripe_webhook_events")
      .select("id, processed")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingEvent) {
      return new Response(
        JSON.stringify({ received: true, duplicate: true, message: "Event already processed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store the webhook event
    const { error: insertError } = await supabase
      .from("stripe_webhook_events")
      .insert({
        event_id: eventId,
        event_type: eventType,
        processed: false,
        payload: event,
      });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to store webhook event", detail: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processingError: string | null = null;

    try {
      switch (eventType) {
        case "checkout.session.completed": {
          await handleCheckoutCompleted(supabase, event.data.object as Record<string, unknown>);
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          await handleSubscriptionChange(supabase, event.data.object as Record<string, unknown>);
          break;
        }
        case "invoice.paid": {
          await handleInvoicePaid(supabase, event.data.object as Record<string, unknown>);
          break;
        }
        case "invoice.payment_failed": {
          await handleInvoiceFailed(supabase, event.data.object as Record<string, unknown>);
          break;
        }
        case "payment_intent.succeeded": {
          await handlePaymentSucceeded(supabase, event.data.object as Record<string, unknown>);
          break;
        }
        case "payment_intent.payment_failed": {
          await handlePaymentFailed(supabase, event.data.object as Record<string, unknown>);
          break;
        }
        default: {
          break;
        }
      }
    } catch (err) {
      processingError = err.message;
    }

    await supabase
      .from("stripe_webhook_events")
      .update({
        processed: processingError === null,
        processed_at: new Date().toISOString(),
        error_message: processingError,
      })
      .eq("event_id", eventId);

    return new Response(
      JSON.stringify({ received: true, processed: processingError === null, error: processingError }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createClient>,
  session: Record<string, unknown>
): Promise<void> {
  const customerId = session.customer as string;
  const customerEmail = (session.customer_details as Record<string, unknown> | undefined)?.email as string | undefined;
  const mode = session.mode as string;

  if (mode === "subscription") {
    await ensureStripeCustomer(supabase, customerId, customerEmail);
  }
}

async function handleSubscriptionChange(
  supabase: ReturnType<typeof createClient>,
  subscription: Record<string, unknown>
): Promise<void> {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id as string;
  const status = subscription.status as string;
  const items = subscription.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  const priceId = items?.data?.[0]?.price?.id;
  const currentPeriodStart = subscription.current_period_start as number | undefined;
  const currentPeriodEnd = subscription.current_period_end as number | undefined;
  const cancelAtPeriodEnd = subscription.cancel_at_period_end as boolean | undefined;

  const { data: customer } = await supabase
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!customer) return;

  // Voter-facing tiers. NOTE: claiming a candidate profile is FREE (client decision,
  // Sept 2026) — there is no paid "claim" price ID anymore. Only Candidate Management
  // ($299, per claimed candidate profile) is a paid add-on, handled separately below
  // via candidate_management_subscriptions, not through this per-user table.
  const candidateMonthlyPriceId = Deno.env.get("STRIPE_CANDIDATE_MONTHLY_PRICE_ID");
  const candidateYearlyPriceId = Deno.env.get("STRIPE_CANDIDATE_YEARLY_PRICE_ID");
  const proMonthlyPriceId = Deno.env.get("STRIPE_PRO_MONTHLY_PRICE_ID");
  const proYearlyPriceId = Deno.env.get("STRIPE_PRO_YEARLY_PRICE_ID");
  const candidateMgmtPriceId = Deno.env.get("STRIPE_CANDIDATE_MANAGEMENT_PRICE_ID");

  if (priceId === candidateMgmtPriceId) {
    // Management is tied to a candidate profile (via metadata.candidate_id set at
    // checkout time), not to the voter's own `subscriptions` row.
    const candidateId = (subscription.metadata as Record<string, string> | undefined)?.candidate_id;
    if (candidateId) {
      await supabase.from("candidate_management_subscriptions").upsert({
        candidate_id: candidateId,
        status,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        current_period_start: currentPeriodStart ? new Date(currentPeriodStart * 1000).toISOString() : null,
        current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
        canceled_at: status === "canceled" ? new Date().toISOString() : null,
      }, { onConflict: "candidate_id" });
    }
    return;
  }

  let plan = "free";
  let billingInterval: string | null = null;

  if (priceId === candidateMonthlyPriceId) {
    plan = "candidate_monthly";
    billingInterval = "monthly";
  } else if (priceId === candidateYearlyPriceId) {
    plan = "candidate_yearly";
    billingInterval = "yearly";
  } else if (priceId === proMonthlyPriceId) {
    plan = "pro_monthly";
    billingInterval = "monthly";
  } else if (priceId === proYearlyPriceId) {
    plan = "pro_yearly";
    billingInterval = "yearly";
  }

  await supabase
    .from("subscriptions")
    .upsert({
      user_id: customer.user_id,
      plan,
      plan_type: plan,
      billing_interval: billingInterval,
      status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      current_period_start: currentPeriodStart ? new Date(currentPeriodStart * 1000).toISOString() : null,
      current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      cancel_at_period_end: cancelAtPeriodEnd ?? false,
    }, { onConflict: "user_id" });
}

async function handleInvoicePaid(
  supabase: ReturnType<typeof createClient>,
  invoice: Record<string, unknown>
): Promise<void> {
  const customerId = invoice.customer as string;
  const paymentIntentId = invoice.payment_intent as string;
  const invoiceId = invoice.id as string;
  const amountPaid = invoice.amount_paid as number;
  const currency = invoice.currency as string;

  const { data: customer } = await supabase
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  await supabase.from("payments").insert({
    user_id: customer?.user_id ?? null,
    stripe_customer_id: customerId,
    stripe_payment_intent_id: paymentIntentId,
    stripe_invoice_id: invoiceId,
    amount: amountPaid,
    currency,
    payment_type: "subscription",
    status: "succeeded",
  });

  if (customer) {
    await supabase.from("revenue_transactions").insert({
      transaction_type: "subscription",
      user_id: customer.user_id,
      stripe_payment_id: paymentIntentId,
      amount_cents: amountPaid,
      currency,
      status: "completed",
    });
  }
}

async function handleInvoiceFailed(
  supabase: ReturnType<typeof createClient>,
  invoice: Record<string, unknown>
): Promise<void> {
  const customerId = invoice.customer as string;
  const invoiceId = invoice.id as string;
  const amountDue = invoice.amount_due as number;

  const { data: customer } = await supabase
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  await supabase.from("payments").insert({
    user_id: customer?.user_id ?? null,
    stripe_customer_id: customerId,
    stripe_invoice_id: invoiceId,
    amount: amountDue,
    payment_type: "subscription",
    status: "failed",
  });
}

async function handlePaymentSucceeded(
  supabase: ReturnType<typeof createClient>,
  paymentIntent: Record<string, unknown>
): Promise<void> {
  const paymentIntentId = paymentIntent.id as string;
  const amount = paymentIntent.amount as number;
  const customerId = paymentIntent.customer as string | undefined;

  if (!customerId) return;

  const { data: customer } = await supabase
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (existing) return;

  await supabase.from("payments").insert({
    user_id: customer?.user_id ?? null,
    stripe_customer_id: customerId,
    stripe_payment_intent_id: paymentIntentId,
    amount,
    payment_type: "other",
    status: "succeeded",
  });
}

async function handlePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  paymentIntent: Record<string, unknown>
): Promise<void> {
  const paymentIntentId = paymentIntent.id as string;
  const amount = paymentIntent.amount as number;
  const customerId = paymentIntent.customer as string | undefined;

  if (!customerId) return;

  const { data: customer } = await supabase
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  await supabase.from("payments").insert({
    user_id: customer?.user_id ?? null,
    stripe_customer_id: customerId,
    stripe_payment_intent_id: paymentIntentId,
    amount,
    payment_type: "other",
    status: "failed",
  });
}

async function ensureStripeCustomer(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
  email?: string
): Promise<void> {
  if (!email) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!profile) return;

  await supabase
    .from("stripe_customers")
    .upsert({
      user_id: profile.id,
      stripe_customer_id: customerId,
    }, { onConflict: "user_id" });
}