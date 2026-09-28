// Lets a signed-in user permanently delete their own account and all
// associated data -- required for the CCPA "right to delete" commitment
// made in the Privacy Policy, which had no actual feature behind it
// anywhere in the app. Deleting the auth.users row cascades through
// profiles (ON DELETE CASCADE) and from there through nearly every other
// table that references a user, since they're built on the same pattern.
// Requires the service role (supabase.auth.admin.deleteUser is not
// available to a regular client), so this has to be an edge function, not
// something callable directly from the browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import Stripe from "npm:stripe@17.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    // The caller can only ever delete THEMSELVES -- there is no "userId"
    // parameter accepted from the request body, specifically so this can
    // never be used to delete anyone else's account.
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Cancel any live Stripe billing BEFORE deleting. Deleting the user
    // cascades away the stripe_customers row, which is the only link between
    // this account and its Stripe customer -- so if billing isn't stopped now,
    // Stripe keeps charging the card every period for an account that no
    // longer exists, and nothing in the app could ever find or cancel it.
    // If cancellation fails, refuse to delete rather than orphan a paying
    // subscription.
    const { data: customer } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (customer?.stripe_customer_id) {
      const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeSecretKey) {
        return json({ error: "Could not cancel your subscription automatically. Please cancel it from Billing first, then delete your account." }, 500);
      }
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
      try {
        const subs = await stripe.subscriptions.list({ customer: customer.stripe_customer_id, status: "all", limit: 100 });
        for (const sub of subs.data) {
          if (["active", "trialing", "past_due", "unpaid", "incomplete"].includes(sub.status)) {
            await stripe.subscriptions.cancel(sub.id);
          }
        }
      } catch (err) {
        return json({ error: `Could not cancel your subscription: ${err instanceof Error ? err.message : "unknown error"}. Your account was not deleted.` }, 502);
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
    if (deleteError) return json({ error: deleteError.message }, 500);

    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
