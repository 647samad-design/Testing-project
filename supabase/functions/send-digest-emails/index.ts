// Generates and sends the BallotLens Digest email. Groups new candidate
// positions, articles/sources, ballot measure updates, and new elections
// since the user's last digest, respecting their per-category preferences.
// Manually triggered for now (via the admin Data Feeds tab, same pattern as
// the AP Elections / Civic News refresh buttons) — for production this
// should run on a schedule instead (Supabase Cron calling this daily; the
// function itself only processes users whose `digest_frequency` matches
// today, so it's safe to call it every day and let it sort out who's due).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Prefs {
  user_id: string;
  digest_frequency: "daily" | "weekly" | "off";
  digest_candidate_updates: boolean;
  digest_ballot_measure_updates: boolean;
  digest_news_updates: boolean;
  digest_new_elections: boolean;
  last_digest_sent_at: string | null;
}

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

    let allPrefs: Prefs[];
    try {
      allPrefs = await fetchAll<Prefs>((from, to) => admin
        .from("notification_preferences")
        .select("user_id, digest_frequency, digest_candidate_updates, digest_ballot_measure_updates, digest_news_updates, digest_new_elections, last_digest_sent_at")
        .neq("digest_frequency", "off")
        .order("user_id")
        .range(from, to));
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Failed to load preferences" }, 500);
    }

    // Due = enough time has passed since this user's last digest. This used to
    // be "weekly users only on a UTC Monday" -- but the digest is run manually
    // from the admin panel (there is no scheduler), so running it on any other
    // day silently skipped every weekly subscriber. Elapsed time works whether
    // it's triggered by hand or by a future cron, and never double-sends.
    const HOUR = 60 * 60 * 1000;
    const minGap = (f: string) => (f === "daily" ? 20 * HOUR : 6.5 * 24 * HOUR);
    const due = allPrefs.filter((p) =>
      (p.digest_frequency === "daily" || p.digest_frequency === "weekly") &&
      (!p.last_digest_sent_at || now.getTime() - new Date(p.last_digest_sent_at).getTime() >= minGap(p.digest_frequency)));

    let sent = 0;
    let skippedEmpty = 0;
    const errors: string[] = [];

    for (const pref of due) {
      const since = pref.last_digest_sent_at ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const sections: string[] = [];

      if (pref.digest_candidate_updates) {
        const { data: followedCandidateRows } = await admin.from("follows").select("followable_id").eq("user_id", pref.user_id).eq("followable_type", "candidate");
        const candidateIds = (followedCandidateRows ?? []).map((r: { followable_id: string }) => r.followable_id);
        if (candidateIds.length > 0) {
          const { data: positions } = await admin
            .from("candidate_positions")
            .select("summary, candidates(first_name, last_name)")
            .in("candidate_id", candidateIds)
            .eq("verification_status", "verified")
            .gt("updated_at", since)
            .limit(10);
          if (positions && positions.length > 0) {
            sections.push(renderSection("Candidate updates", positions.map((p: any) =>
              `${p.candidates?.first_name ?? ""} ${p.candidates?.last_name ?? ""}: ${(p.summary ?? "").slice(0, 140)}`
            )));
          }
        }
      }

      if (pref.digest_ballot_measure_updates) {
        const { data: location } = await admin.from("locations").select("state").eq("user_id", pref.user_id).maybeSingle();
        if (location?.state) {
          const { data: measures } = await admin
            .from("ballot_measures")
            .select("title, districts(state)")
            .gt("updated_at", since)
            .limit(20);
          const relevant = (measures ?? []).filter((m: any) => !m.districts || m.districts.state === location.state);
          if (relevant.length > 0) {
            sections.push(renderSection("Ballot measure updates", relevant.slice(0, 10).map((m: any) => m.title)));
          }
        }
      }

      if (pref.digest_news_updates) {
        const { data: sources } = await admin
          .from("sources")
          .select("title, publisher")
          .gt("created_at", since)
          .order("created_at", { ascending: false })
          .limit(10);
        if (sources && sources.length > 0) {
          sections.push(renderSection("Recently added articles", sources.map((s: any) => `${s.title}${s.publisher ? ` — ${s.publisher}` : ""}`)));
        }
      }

      if (pref.digest_new_elections) {
        const { data: elections } = await admin
          .from("elections")
          .select("name, election_date")
          .gt("created_at", since)
          .limit(10);
        if (elections && elections.length > 0) {
          sections.push(renderSection("New elections added", elections.map((e: any) => `${e.name} — ${e.election_date}`)));
        }
      }

      if (sections.length === 0) {
        skippedEmpty++;
        continue;
      }

      if (!dryRun) {
        const html = `<h1>Your BallotLens Digest</h1>${sections.join("")}<p style="color:#888;font-size:12px;margin-top:24px;">Manage what you receive at ballotlens.com/account (Notifications tab).</p>`;
        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ userId: pref.user_id, subject: "Your BallotLens Digest", html, unsubscribeList: "digest" }),
        });
        if (!sendResponse.ok) {
          errors.push(`user ${pref.user_id}: ${await sendResponse.text()}`);
          continue;
        }
        await admin.from("notification_preferences").update({ last_digest_sent_at: now.toISOString() }).eq("user_id", pref.user_id);
      }
      sent++;
    }

    return json({ success: true, usersChecked: due.length, sent, skippedEmpty, errors, dryRun });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function renderSection(title: string, items: string[]): string {
  return `<h2 style="font-size:16px;margin-top:20px;">${title}</h2><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
