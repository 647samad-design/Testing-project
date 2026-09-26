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
    const { conversationId, userId, title, preview } = body as {
      conversationId?: string; userId?: string; title?: string; preview?: string;
    };
    if (!conversationId || !userId || !title) {
      return json({ error: "conversationId, userId, and title are required" }, 400);
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

    const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        subject: title,
        html: `<p>${preview ?? "You have a new message on BallotLens."}</p><p style="color:#888;font-size:12px;">Reply at ballotlens.com/messages</p>`,
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
