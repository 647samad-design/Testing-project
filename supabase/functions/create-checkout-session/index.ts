// Creates a Stripe Checkout Session for a voter subscription (Candidate/Pro) or
// a Candidate Management purchase. The actual price IDs live in env secrets
// (added by the team in the Supabase dashboard) — this function never hardcodes
// a dollar amount, so pricing changes don't require a code deploy.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import Stripe from "npm:stripe@17.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type PlanKey =
  | "candidate_monthly"
  | "candidate_yearly"
  | "pro_monthly"
  | "pro_yearly"
  | "candidate_management";

const PLAN_ENV_VAR: Record<PlanKey, string> = {
  candidate_monthly: "STRIPE_CANDIDATE_MONTHLY_PRICE_ID",
  candidate_yearly: "STRIPE_CANDIDATE_YEARLY_PRICE_ID",
  pro_monthly: "STRIPE_PRO_MONTHLY_PRICE_ID",
  pro_yearly: "STRIPE_PRO_YEARLY_PRICE_ID",
  candidate_management: "STRIPE_CANDIDATE_MANAGEMENT_PRICE_ID",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://ballotlens.com";

    if (!stripeSecretKey) {
      return json({ error: "STRIPE_SECRET_KEY is not configured. Add it as an edge function secret." }, 503);
    }

    // Verify the caller's session (RLS-safe: uses the caller's own JWT, not service role)
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "Not authenticated" }, 401);
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const plan = body.plan as PlanKey | undefined;
    const candidateId = body.candidateId as string | undefined;

    if (!plan || !(plan in PLAN_ENV_VAR)) {
      return json({ error: `Invalid plan. Expected one of: ${Object.keys(PLAN_ENV_VAR).join(", ")}` }, 400);
    }

    if (plan === "candidate_management" && !candidateId) {
      return json({ error: "candidateId is required for the candidate_management plan" }, 400);
    }

    const priceId = Deno.env.get(PLAN_ENV_VAR[plan]);
    if (!priceId) {
      return json({ error: `${PLAN_ENV_VAR[plan]} is not configured. Add it as an edge function secret.` }, 503);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // For candidate_management: only the verified claimant of that candidate may buy it.
    if (plan === "candidate_management") {
      const { data: claim } = await admin
        .from("candidate_claims")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("user_id", user.id)
        .eq("status", "verified")
        .maybeSingle();
      if (!claim) {
        return json({ error: "You must have a verified claim on this candidate profile first." }, 403);
      }
    }

    // Reuse or create a Stripe customer for this user
    const { data: existingCustomer } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let stripeCustomerId = existingCustomer?.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await admin.from("stripe_customers").upsert(
        { user_id: user.id, stripe_customer_id: stripeCustomerId },
        { onConflict: "user_id" }
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: candidateId ? { candidate_id: candidateId, plan } : { plan },
      },
      success_url: `${siteUrl}/account?checkout=success`,
      cancel_url: `${siteUrl}/pricing?checkout=canceled`,
    });

    return json({ url: session.url });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
