// Where-to-vote lookup for a voter's home address.
//
// Proxies Google's Civic Information API (voterinfo), whose polling places,
// early-vote sites and drop boxes come from election offices through the
// Voting Information Project. The API key stays on the server
// (GOOGLE_CIVIC_API_KEY secret). Only the fields the app shows are returned.
//
// No key configured, or no data for the address: the response says so with a
// `status`, and the app falls back to official state links.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { formatAddress, toLinks, toSites } from "./lib.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 200) : "";
  if (address.length < 5) return json({ status: "invalid_address" }, 400);

  const key = Deno.env.get("GOOGLE_CIVIC_API_KEY");
  if (!key) return json({ status: "not_configured" });

  const url = new URL("https://www.googleapis.com/civicinfo/v2/voterinfo");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  if (body.electionId && /^\d+$/.test(String(body.electionId))) url.searchParams.set("electionId", String(body.electionId));

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch {
    return json({ status: "unavailable" }, 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 400 = Google has no election data for this address right now (normal
    // outside election season, or the address couldn't be parsed).
    return json({ status: res.status === 400 ? "no_data" : "unavailable" }, res.status === 400 ? 200 : 502);
  }

  const state = Array.isArray(data.state) ? data.state[0] : undefined;
  const pollingLocations = toSites(data.pollingLocations);
  const earlyVoteSites = toSites(data.earlyVoteSites);
  const dropOffLocations = toSites(data.dropOffLocations);
  return json({
    status: pollingLocations.length + earlyVoteSites.length + dropOffLocations.length > 0 ? "ok" : "no_sites",
    election: data.election ? { name: data.election.name ?? null, day: data.election.electionDay ?? null } : null,
    normalizedAddress: formatAddress(data.normalizedInput),
    mailOnly: data.mailOnly === true,
    pollingLocations,
    earlyVoteSites,
    dropOffLocations,
    links: toLinks(state?.electionAdministrationBody),
  });
});
