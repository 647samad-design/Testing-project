import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

// supabase-js can't infer table types without generated types; treat the
// client as untyped instead of fighting mismatched generics.
// deno-lint-ignore no-explicit-any
type Db = any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/** Returns a 401/403 Response if the caller isn't a signed-in admin, or null if they are. */
async function requireAdmin(
  req: Request,
  supabaseUrl: string,
  adminClient: Db
): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return new Response(
      JSON.stringify({ error: "Admin access required" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  return null;
}

interface APCandidate {
  candidateID: string;
  firstName: string;
  lastName: string;
  party: string;
  voteCount: number;
  votePercent: number;
  winner: string;
  incumbent: boolean;
}

interface APReportingUnit {
  level: string;
  statePostal: string;
  reportingUnits?: APReportingUnit[];
  candidates: APCandidate[];
}

interface APRace {
  raceID: string;
  raceType: string;
  raceTypeID: string;
  officeName: string;
  raceTitle: string;
  reportingUnits: APReportingUnit[];
  raceCallStatus?: string;
  tabulationStatus?: string;
  winnerDateTime?: string;
  lastUpdated?: string;
}

interface APResponse {
  races: APRace[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "fetch";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apApiKey = Deno.env.get("AP_ELECTIONS_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "fetch") {
      // Hits AP's paid/quota-limited API and writes to the DB — restrict to
      // admins so this can't be spammed by anyone who finds the URL (it
      // previously had no auth check of any kind).
      const adminCheck = await requireAdmin(req, supabaseUrl, supabase);
      if (adminCheck) return adminCheck;

      if (!apApiKey) {
        return new Response(
          JSON.stringify({ error: "AP_ELECTIONS_API_KEY secret is not configured. Add it in your Supabase project settings." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const electionDate = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
      const statePostal = url.searchParams.get("state");
      const resultsType = url.searchParams.get("resultsType") ?? "live";
      const winnerOnly = url.searchParams.get("winner") === "true";

      const params: Record<string, string> = {
        format: "json",
        resultsType,
        apikey: apApiKey,
      };

      if (statePostal) {
        params.level = statePostal === "US" ? "national" : "state";
        params.statePostal = statePostal;
      } else {
        params.level = "state";
      }

      if (winnerOnly) {
        params.winner = "X";
      }

      const apiUrl = `https://api.ap.org/v3/elections/${electionDate}`;
      const queryString = new URLSearchParams(params).toString();
      const fullUrl = `${apiUrl}?${queryString}`;

      const response = await fetch(fullUrl);
      if (!response.ok) {
        const errText = await response.text();
        return new Response(
          JSON.stringify({ error: `AP API returned ${response.status}`, detail: errText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data: APResponse = await response.json();
      const races = data.races ?? [];

      let processed = 0;
      let newWinners = 0;

      for (const race of races) {
        if (!race.raceID) continue;

        const stateLevelRU = race.reportingUnits?.find(
          (ru) => ru.level === "state" || ru.level === "national"
        );

        if (!stateLevelRU) continue;

        const statePostalFromRU = stateLevelRU.statePostal ?? statePostal ?? "US";
        const winnerCandidate = stateLevelRU.candidates?.find(
          (c) => c.winner === "X" || c.winner === "R"
        );

        const { data: existingRace } = await supabase
          .from("election_races")
          .select("id, winner_candidate_id, is_certified")
          .eq("ap_race_id", race.raceID)
          .maybeSingle();

        const raceRow = {
          ap_race_id: race.raceID,
          ap_election_date: electionDate,
          race_type_id: race.raceTypeID ?? "G",
          office_name: race.officeName ?? "Unknown Office",
          state_postal: statePostalFromRU,
          race_title: race.raceTitle ?? race.officeName,
          winner_candidate_id: winnerCandidate?.candidateID ?? null,
          winner_name: winnerCandidate
            ? `${winnerCandidate.firstName} ${winnerCandidate.lastName}`.trim()
            : null,
          winner_party: winnerCandidate?.party ?? null,
          race_call_status: race.raceCallStatus ?? null,
          tabulation_status: race.tabulationStatus ?? null,
          winner_datetime: race.winnerDateTime ?? null,
          is_certified: resultsType === "certified",
          certified_timestamp: resultsType === "certified" ? new Date().toISOString() : null,
          results_type: resultsType,
          last_updated: race.lastUpdated ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        let raceId: string;

        if (existingRace) {
          await supabase
            .from("election_races")
            .update(raceRow)
            .eq("id", existingRace.id);
          raceId = existingRace.id;
        } else {
          const { data: inserted } = await supabase
            .from("election_races")
            .insert(raceRow)
            .select("id")
            .single();
          raceId = inserted?.id ?? "";
          if (!raceId) continue;
        }

        const isNewWinner = winnerCandidate && existingRace?.winner_candidate_id !== winnerCandidate.candidateID;

        if (stateLevelRU.candidates) {
          for (const cand of stateLevelRU.candidates) {
            const candRow = {
              race_id: raceId,
              ap_candidate_id: cand.candidateID,
              candidate_name: `${cand.firstName} ${cand.lastName}`.trim(),
              party: cand.party ?? null,
              vote_count: cand.voteCount ?? 0,
              vote_percent: cand.votePercent ?? null,
              is_winner: cand.winner === "X",
              is_runoff: cand.winner === "R",
              incumbent: cand.incumbent ?? false,
              updated_at: new Date().toISOString(),
            };

            await supabase
              .from("election_candidate_results")
              .upsert(candRow, { onConflict: "race_id,ap_candidate_id" });
          }
        }

        if (isNewWinner && winnerCandidate) {
          newWinners++;
          await createNotificationsForState(supabase, raceId, raceRow, "race_called");
        }

        if (resultsType === "certified" && !existingRace?.is_certified) {
          await createNotificationsForState(supabase, raceId, raceRow, "results_certified");
        }

        processed++;
      }

      return new Response(
        JSON.stringify({
          success: true,
          date: electionDate,
          racesProcessed: processed,
          newWinnersCalled: newWinners,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "results") {
      const state = url.searchParams.get("state");
      const certified = url.searchParams.get("certified") === "true";

      let query = supabase
        .from("election_races")
        .select(`
          *,
          election_candidate_results(*)
        `)
        .order("updated_at", { ascending: false });

      if (state) {
        query = query.eq("state_postal", state.toUpperCase());
      }
      if (certified) {
        query = query.eq("is_certified", true);
      }

      const { data, error } = await query;

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ races: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use action=fetch or action=results" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createNotificationsForState(
  supabase: Db,
  raceId: string,
  race: Record<string, unknown>,
  type: "race_called" | "results_certified"
): Promise<void> {
  const statePostal = race.state_postal as string;
  const officeName = race.office_name as string;
  const winnerName = race.winner_name as string | null;
  const winnerParty = race.winner_party as string | null;

  const title =
    type === "race_called"
      ? `${winnerName} wins ${officeName} in ${statePostal}`
      : `${officeName} results certified in ${statePostal}`;

  const body =
    type === "race_called"
      ? `AP has called the ${officeName} race${winnerParty ? ` for ${winnerName} (${winnerParty})` : ` for ${winnerName}`}.`
      : `The ${officeName} race in ${statePostal} has been officially certified.`;

  // Create a feed post visible to all users
  const feedBody =
    type === "race_called"
      ? `${winnerName} has won the ${officeName} race in ${statePostal}${winnerParty ? ` (${winnerParty})` : ''}. AP has called the race.`
      : `The ${officeName} race in ${statePostal} has been officially certified. Final results are now available.`;

  const { error: feedErr } = await supabase.from("feed_posts").insert({
    post_type: "election_result",
    body: feedBody,
    source_name: type === "race_called" ? "AP Elections" : "AP Elections (Certified)",
    source_url: `https://apnews.com/hub/election-2026`,
    is_pinned: false,
  }).select("id").maybeSingle();
  // Previously unchecked -- and it always failed (see migration 20260913003800).
  // Log rather than throw so voters' notifications below still go out.
  if (feedErr) console.error(`ap-elections: could not save ${type} feed post: ${feedErr.message}`);

  // Send in-app notifications (to the bell in the header — notifications
  // table, NOT user_election_notifications, which nothing in the UI reads)
  // and instant emails (if the recipient has opted in) to users in this state.
  // locations.state holds the full state name ("Florida", from zip_districts)
  // but AP data uses the postal code ("FL"). Matching on the postal code alone
  // found nobody, so race-called / certified alerts reached no one. Match both.
  const stateNames = [statePostal, STATE_NAMES[statePostal.toUpperCase()]].filter(Boolean) as string[];
  const usersInState = await fetchAll<{ user_id: string }>((from, to) => supabase
    .from("locations")
    .select("user_id")
    .in("state", stateNames)
    .order("user_id")
    .range(from, to));

  if (usersInState.length === 0) return;

  const notifications = usersInState.map((u: { user_id: string }) => ({
    user_id: u.user_id,
    type,
    title,
    body,
    is_read: false,
  }));

  const { error: notifErr } = await supabase.from("notifications").insert(notifications);
  if (notifErr) console.error(`ap-elections: could not save ${type} notifications: ${notifErr.message}`);

  // Instant email — only to users who opted into election/followed-content
  // alerts. Best-effort: a failure here shouldn't block the notifications
  // above, which is why each send is wrapped and errors are swallowed.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userIds = usersInState.map((u: { user_id: string }) => u.user_id);
  const prefs = await fetchAllIn<{ user_id: string }>(userIds, (chunk, from, to) => supabase
    .from("notification_preferences")
    .select("user_id, instant_election_reminders, instant_followed_updates")
    .in("user_id", chunk)
    .or("instant_election_reminders.eq.true,instant_followed_updates.eq.true")
    .order("user_id")
    .range(from, to));

  for (const pref of prefs) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: (pref as { user_id: string }).user_id,
          subject: title,
          html: `<p>${body}</p><p style="color:#888;font-size:12px;">Manage alert preferences at ballotlens.com/account (Notifications tab).</p>`,
        }),
      });
    } catch {
      // Best-effort — one failed email shouldn't stop the rest.
    }
  }
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

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
