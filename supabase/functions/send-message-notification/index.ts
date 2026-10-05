// Lets a regular signed-in user (not just an admin) trigger a "you have a
// new message" email to the OTHER party of a conversation they're actually
// part of. send-email itself is admin/service-role only by design (it can
// email anyone, which would be dangerous to expose broadly) -- this function
// is the narrow, safe gateway for the one case a regular user legitimately
// needs: notifying whoever they just messaged. It verifies the caller is
// really a participant in that specific conversation before sending
// anything, then calls send-email internally using the service-role bearer
// (the same server-to-server pattern used by the other notification flows).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

// Links in emails point at the configured site (SITE_URL secret), never a hard-coded domain.
const SITE = (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");

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

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await callerClient.auth.getUser();
    if (!userData?.user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const { conversationId, userId } = body as { conversationId?: string; userId?: string };
    if (!conversationId || !userId) {
      return json({ error: "conversationId and userId are required" }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the caller is actually a participant in this conversation, and
    // that userId is the OTHER participant — not an arbitrary third party.
    const { data: conv } = await admin
      .from("conversations")
      .select("voter_id, candidate_user_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) return json({ error: "Conversation not found" }, 404);

    const isCallerParticipant = conv.voter_id === userData.user.id || conv.candidate_user_id === userData.user.id;
    const isTargetTheOtherParticipant =
      (userId === conv.voter_id && userData.user.id !== conv.voter_id) ||
      (userId === conv.candidate_user_id && userData.user.id !== conv.candidate_user_id);
    if (!isCallerParticipant || !isTargetTheOtherParticipant) {
      return json({ error: "Not authorized to notify this user about this conversation" }, 403);
    }

    // Build the email from the database, not from the request. `title` and
    // `preview` used to be taken from the caller's request body and placed
    // raw into the subject and HTML of an email sent from Gov Search App's own
    // domain -- any participant could send the other one arbitrary HTML
    // (fake buttons, links) that looked like an official Gov Search App email.
    // Now: fixed subject, and the preview is the caller's own latest message
    // in this conversation, HTML-escaped and truncated. `title`/`preview`
    // from the request are ignored.
    const { data: latest } = await admin
      .from("messages")
      .select("body")
      .eq("conversation_id", conversationId)
      .eq("sender_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) return json({ error: "No message from you in this conversation" }, 400);

    const raw = String(latest.body ?? "");
    const snippet = raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;

    const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        subject: "You have a new message on Gov Search App",
        html: `<p>You have a new message on Gov Search App:</p><blockquote style="border-left:3px solid #ddd;margin:0;padding-left:12px;color:#444;">${escapeHtml(snippet)}</blockquote><p style="color:#888;font-size:12px;">${SITE ? `Reply at ${SITE}/messages` : "Reply from the Messages page."}</p>`,
      }),
    });

    if (!sendResponse.ok) {
      return json({ error: `send-email failed: ${await sendResponse.text()}` }, 502);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
