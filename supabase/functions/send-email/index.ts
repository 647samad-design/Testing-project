// Generic transactional email sender used by both instant alerts and the
// digest job. Uses Resend (resend.com) — needs RESEND_API_KEY as an Edge
// Function secret, the same pattern as STRIPE_SECRET_KEY / AP_ELECTIONS_API_KEY.
// Admin-only: this is called by other server-side code (webhooks, the digest
// job), never directly by a browser, so it authenticates the caller as an
// admin rather than accepting arbitrary "send email to anyone" requests from
// the client.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Must be an address on a domain verified in Resend. Configurable so a
// different domain doesn't require a code change (every send fails if the
// domain here isn't verified).
// Set EMAIL_FROM to an address on your verified Resend domain. The default is
// Resend's shared test sender, which only delivers to your own Resend account email.
const FROM_ADDRESS = Deno.env.get("EMAIL_FROM") ?? "Gov Search App <onboarding@resend.dev>";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return json({ error: "RESEND_API_KEY is not configured. Add it as an Edge Function secret." }, 503);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const bearerToken = authHeader.replace(/^Bearer\s+/i, "");
    const isInternalServiceCall = bearerToken === supabaseServiceKey;

    if (!isInternalServiceCall) {
      // A direct call from the browser (e.g. an admin "send test email"
      // button) must be an authenticated admin. A call from another Edge
      // Function or the digest cron job presents the service role key
      // directly and skips this check — that's how server-to-server calls
      // within Supabase authenticate themselves, since there's no "signed
      // in user" for a webhook or scheduled job to be.
      const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await callerClient.auth.getUser();
      if (!userData?.user) return json({ error: "Not authenticated" }, 401);

      const admin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", userData.user.id).maybeSingle();
      if (!profile?.is_admin) return json({ error: "Admin access required" }, 403);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { userId, subject, html, unsubscribeList } = body as {
      userId?: string; subject?: string; html?: string; unsubscribeList?: "digest" | "reminders";
    };

    if (!userId || !subject || !html) {
      return json({ error: "userId, subject, and html are required" }, 400);
    }

    // Look up the recipient's email — profiles doesn't store it, auth.users does.
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
    if (authUserError || !authUser?.user?.email) {
      return json({ error: "Could not find an email address for that user" }, 404);
    }

    // Bulk emails (digest, reminders) get a signed one-click unsubscribe link
    // in the body plus List-Unsubscribe headers (CAN-SPAM; Gmail/Yahoo bulk
    // sender rules). Direct, personal emails (a new message, a team invite)
    // don't pass unsubscribeList.
    let finalHtml = html;
    let extraHeaders: Record<string, string> | undefined;
    if (unsubscribeList === "digest" || unsubscribeList === "reminders") {
      const t = await unsubscribeToken(userId, unsubscribeList);
      const link = `${supabaseUrl}/functions/v1/email-unsubscribe?u=${encodeURIComponent(userId)}&l=${unsubscribeList}&t=${t}`;
      finalHtml = `${html}<p style="color:#888;font-size:12px;margin-top:24px;">Don't want these emails? <a href="${link}">Unsubscribe</a>.</p>`;
      extraHeaders = {
        "List-Unsubscribe": `<${link}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: authUser.user.email,
        subject,
        html: finalHtml,
        ...(extraHeaders ? { headers: extraHeaders } : {}),
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      return json({ error: `Resend API error: ${resendResponse.status}`, detail: errText }, 502);
    }

    return json({ success: true });
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

// ── unsubscribe token (keep IDENTICAL in send-email and email-unsubscribe; a test enforces this) ──
async function unsubscribeToken(userId: string, list: string): Promise<string> {
  const secret = Deno.env.get("EMAIL_UNSUBSCRIBE_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}:${list}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// ── end unsubscribe token ──
