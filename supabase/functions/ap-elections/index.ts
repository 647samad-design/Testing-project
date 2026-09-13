import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
          .select("id, winner_candidate_id")
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
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createNotificationsForState(
  supabase: ReturnType<typeof createClient>,
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

  await supabase.from("feed_posts").insert({
    post_type: "election_result",
    body: feedBody,
    source_name: type === "race_called" ? "AP Elections" : "AP Elections (Certified)",
    source_url: `https://apnews.com/hub/election-2026`,
    is_pinned: false,
  }).select("id").maybeSingle();

  // Send notifications to users in this state
  const { data: usersInState } = await supabase
    .from("user_locations")
    .select("user_id")
    .eq("state", statePostal);

  if (!usersInState || usersInState.length === 0) return;

  const notifications = usersInState.map((u: { user_id: string }) => ({
    user_id: u.user_id,
    race_id: raceId,
    notification_type: type,
    title,
    body,
    is_read: false,
  }));

  await supabase.from("user_election_notifications").insert(notifications);
}
