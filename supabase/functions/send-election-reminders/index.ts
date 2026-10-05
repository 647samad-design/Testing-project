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

// supabase-js can't infer table types without generated types; treat the
// client as untyped instead of fighting mismatched generics.
// deno-lint-ignore no-explicit-any
type Db = any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const REMINDER_WINDOW_DAYS = 14; // remind for elections within the next 2 weeks

async function requireAdmin(req: Request, supabaseUrl: string, adminClient: Db): Promise<Response | null> {
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
      const contests = await fetchAll<{ id: string }>((from, to) =>
        admin.from("ballot_contests").select("id").eq("election_id", election.id).order("id").range(from, to));
      const contestIds = contests.map((c) => c.id);
      if (contestIds.length === 0) continue;

      const offices = await fetchAllIn<{ candidate_id: string }>(contestIds, (chunk, from, to) =>
        admin.from("candidate_offices").select("candidate_id").in("contest_id", chunk).order("id").range(from, to));
      const candidateIds = [...new Set(offices.map((o) => o.candidate_id))];
      if (candidateIds.length === 0) continue;

      // Users who either explicitly set a reminder, or follow a candidate in this race.
      const explicitReminders = await fetchAllIn<{ user_id: string }>(candidateIds, (chunk, from, to) =>
        admin.from("candidate_election_reminders").select("user_id").in("candidate_id", chunk).order("id").range(from, to));
      const followers = await fetchAllIn<{ user_id: string }>(candidateIds, (chunk, from, to) =>
        admin.from("follows").select("user_id").eq("followable_type", "candidate").in("followable_id", chunk).order("id").range(from, to));
      const userIds = [...new Set([...explicitReminders.map((r) => r.user_id), ...followers.map((f) => f.user_id)])];
      if (userIds.length === 0) continue;

      // Only users who've opted into instant election reminders, and who
      // haven't already been reminded about this specific election.
      const prefs = await fetchAllIn<{ user_id: string }>(userIds, (chunk, from, to) =>
        admin.from("notification_preferences").select("user_id").in("user_id", chunk)
          .eq("instant_election_reminders", true).order("user_id").range(from, to));
      const eligibleUserIds = prefs.map((p) => p.user_id);

      const alreadySent = await fetchAllIn<{ user_id: string }>(eligibleUserIds, (chunk, from, to) =>
        admin.from("notifications").select("user_id").eq("election_id", election.id).eq("type", "election_reminder")
          .in("user_id", chunk).order("id").range(from, to));
      const alreadySentIds = new Set(alreadySent.map((n) => n.user_id));

      const toRemind = eligibleUserIds.filter((id) => !alreadySentIds.has(id));
      if (toRemind.length === 0) continue;

      const daysUntil = Math.ceil((new Date(election.election_date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const title = `${election.name} is in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
      const bodyText = `A candidate or race you follow is on the ballot for ${election.name} on ${election.election_date}. Check your ballot on Gov Search App to get ready.`;

      if (!dryRun) {
        for (let i = 0; i < toRemind.length; i += 500) {
          const { error: insErr } = await admin.from("notifications").insert(
            toRemind.slice(i, i + 500).map((userId) => ({ user_id: userId, type: "election_reminder", title, body: bodyText, election_id: election.id, is_read: false }))
          );
          if (insErr) errors.push(`notifications batch ${i}: ${insErr.message}`);
        }

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

// ── paging helpers (each edge function deploys standalone, so these live here) ──
// PostgREST returns at most 1,000 rows per request and silently drops the rest,
// and a long .in() list in a GET URL can be rejected by the gateway. Recipient
// lists here can exceed both.
type DbPage = { data: unknown; error: { message: string } | null };
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<DbPage>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
async function fetchAllIn<T>(ids: string[], page: (chunk: string[], from: number, to: number) => PromiseLike<DbPage>): Promise<T[]> {
  const unique = [...new Set(ids)];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += 150) {
    const chunk = unique.slice(i, i + 150);
    out.push(...await fetchAll<T>((from, to) => page(chunk, from, to)));
  }
  return out;
}
// ── end paging helpers ──
