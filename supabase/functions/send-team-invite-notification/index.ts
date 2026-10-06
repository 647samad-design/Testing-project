// Lets a regular candidate/team member (not just an admin) notify a
// newly-linked team invitee by email. Mirrors send-message-notification's
// pattern: send-email itself stays admin/service-role only, and this is the
// narrow, verified gateway for the one legitimate case a regular user needs
// it for. Verifies the caller actually has team access to the candidate in
// question, and that the target user is genuinely a linked team member for
// that same candidate, before sending anything.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { getUserLangs, teamInvite } from "../_shared/email-i18n.ts";

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
    const { candidateId, userId, role } = body as { candidateId?: string; userId?: string; role?: string };
    if (!candidateId || !userId) return json({ error: "candidateId and userId are required" }, 400);

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const [{ data: callerClaim }, { data: callerTeam }, { data: targetTeam }] = await Promise.all([
      admin.from("candidate_claims").select("id").eq("candidate_id", candidateId).eq("user_id", userData.user.id).eq("status", "verified").maybeSingle(),
      admin.from("campaign_team").select("id").eq("candidate_id", candidateId).eq("user_id", userData.user.id).eq("status", "active").maybeSingle(),
      admin.from("campaign_team").select("id").eq("candidate_id", candidateId).eq("user_id", userId).eq("status", "active").maybeSingle(),
    ]);

    if (!callerClaim && !callerTeam) return json({ error: "Not authorized for this candidate" }, 403);
    if (!targetTeam) return json({ error: "Target is not an active team member for this candidate" }, 403);

    // In the invitee's language; the role label is translated too.
    const invite = teamInvite((await getUserLangs(admin, [userId])).get(userId) ?? "en", role && ROLE_LABELS[role] ? role : null);
    const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        subject: invite.subject,
        html: invite.html,
      }),
    });

    if (!sendResponse.ok) return json({ error: `send-email failed: ${await sendResponse.text()}` }, 502);
    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// The role comes from the request body; only known roles are ever put into the
// email (previously the raw string was interpolated into the HTML).
const ROLE_LABELS: Record<string, string> = {
  candidate: "candidate",
  campaign_manager: "campaign manager",
  social_manager: "social media manager",
  volunteer_manager: "volunteer manager",
  staff: "staff member",
  volunteer: "volunteer",
};
