// Actually sends the election reminders that CandidateProfileExtras' toggle
// promises. Finds elections happening soon, works out who should be
// reminded (users who set a reminder on a candidate in that race, or follow
// one), and sends an instant email + in-app notification -- deduplicated so
// the same user/election pair is never reminded twice.
// Admin-triggered for now (same pattern as the other Data Feeds buttons);
// for production this should run daily on a schedule (Supabase Cron), since
// it's safe to call repeatedly — it only sends where a reminder for that
// user+election doesn't already exist.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const REMINDER_WINDOW_DAYS = 14; // remind for elections within the next 2 weeks

async function requireAdmin(req: Request, supabaseUrl: string, adminClient: ReturnType<typeof createClient>): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { data: profile } = await adminClient.from("profiles").select("is_admin").eq("id", userData.user.id).maybeSingle();
  if (!profile?.is_admin) return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const adminCheck = await requireAdmin(req, supabaseUrl, admin);
    if (adminCheck) return adminCheck;

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const { data: elections, error: electionsError } = await admin
      .from("elections")
      .select("id, name, election_date")
      .gte("election_date", now.toISOString().slice(0, 10))
      .lte("election_date", windowEnd.toISOString().slice(0, 10));

    if (electionsError) return json({ error: electionsError.message }, 500);
    if (!elections || elections.length === 0) return json({ success: true, electionsChecked: 0, remindersSent: 0 });

    let remindersSent = 0;
    const errors: string[] = [];

    for (const election of elections) {
      // Candidates running in this election.
      const { data: contests } = await admin.from("ballot_contests").select("id").eq("election_id", election.id);
      const contestIds = (contests ?? []).map((c: { id: string }) => c.id);
      if (contestIds.length === 0) continue;

      const { data: offices } = await admin.from("candidate_offices").select("candidate_id").in("contest_id", contestIds);
      const candidateIds = [...new Set((offices ?? []).map((o: { candidate_id: string }) => o.candidate_id))];
      if (candidateIds.length === 0) continue;

      // Users who either explicitly set a reminder, or follow a candidate in this race.
      const { data: explicitReminders } = await admin.from("candidate_election_reminders").select("user_id").in("candidate_id", candidateIds);
      const { data: followers } = await admin.from("follows").select("user_id").eq("followable_type", "candidate").in("followable_id", candidateIds);
      const userIds = [...new Set([
        ...(explicitReminders ?? []).map((r: { user_id: string }) => r.user_id),
        ...(followers ?? []).map((f: { user_id: string }) => f.user_id),
      ])];
      if (userIds.length === 0) continue;

      // Only users who've opted into instant election reminders, and who
      // haven't already been reminded about this specific election.
      const { data: prefs } = await admin
        .from("notification_preferences")
        .select("user_id")
        .in("user_id", userIds)
        .eq("instant_election_reminders", true);
      const eligibleUserIds = (prefs ?? []).map((p: { user_id: string }) => p.user_id);

      const { data: alreadySent } = await admin
        .from("notifications")
        .select("user_id")
        .eq("election_id", election.id)
        .eq("type", "election_reminder")
        .in("user_id", eligibleUserIds.length > 0 ? eligibleUserIds : ["00000000-0000-0000-0000-000000000000"]);
      const alreadySentIds = new Set((alreadySent ?? []).map((n: { user_id: string }) => n.user_id));

      const toRemind = eligibleUserIds.filter((id) => !alreadySentIds.has(id));
      if (toRemind.length === 0) continue;

      const daysUntil = Math.ceil((new Date(election.election_date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const title = `${election.name} is in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
      const bodyText = `A candidate or race you follow is on the ballot for ${election.name} on ${election.election_date}. Check your ballot on BallotLens to get ready.`;

      if (!dryRun) {
        await admin.from("notifications").insert(
          toRemind.map((userId) => ({ user_id: userId, type: "election_reminder", title, body: bodyText, election_id: election.id, is_read: false }))
        );

        for (const userId of toRemind) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ userId, subject: title, html: `<p>${escapeHtml(bodyText)}</p>`, unsubscribeList: "reminders" }),
            });
          } catch (e) {
            errors.push(`user ${userId}: ${e instanceof Error ? e.message : "send failed"}`);
          }
        }
      }
      remindersSent += toRemind.length;
    }

    return json({ success: true, electionsChecked: elections.length, remindersSent, errors, dryRun });
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
