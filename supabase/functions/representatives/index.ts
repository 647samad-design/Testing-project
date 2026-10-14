// "Who represents me": current U.S. Congress members and state legislators for
// an address. Geocodes with the free U.S. Census geocoder, then asks Open States
// (OPENSTATES_API_KEY secret) who represents that point. With `personId`, it
// returns that legislator's most recent sponsored bills instead.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sortRepresentatives, toBill, toRepresentative, type OsBill, type OsPerson } from "./lib.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const OS = "https://v3.openstates.org";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function geocode(address: string): Promise<{ lat: number; lng: number; matched: string } | null> {
  const u = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  u.searchParams.set("address", address);
  u.searchParams.set("benchmark", "Public_AR_Current");
  u.searchParams.set("format", "json");
  const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const m = data?.result?.addressMatches?.[0];
  if (!m?.coordinates) return null;
  return { lat: Number(m.coordinates.y), lng: Number(m.coordinates.x), matched: String(m.matchedAddress ?? "") };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = Deno.env.get("OPENSTATES_API_KEY");
  if (!key) return json({ status: "not_configured" });
  const body = await req.json().catch(() => ({}));

  try {
    // Sponsored bills for one legislator.
    if (typeof body.personId === "string") {
      if (!/^ocd-person\/[0-9a-f-]{36}$/.test(body.personId) || typeof body.jurisdictionId !== "string" || !body.jurisdictionId.startsWith("ocd-jurisdiction/")) {
        return json({ status: "invalid_request" }, 400);
      }
      const u = new URL(`${OS}/bills`);
      u.searchParams.set("sponsor", body.personId);
      u.searchParams.set("jurisdiction", body.jurisdictionId);
      u.searchParams.set("sort", "latest_action_desc");
      u.searchParams.set("per_page", "10");
      const res = await fetch(u, { headers: { "X-API-KEY": key }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return json({ status: "unavailable" }, 502);
      const data = await res.json();
      return json({ status: "ok", bills: ((data.results ?? []) as OsBill[]).map(toBill) });
    }

    // Representatives for an address.
    const address = typeof body.address === "string" ? body.address.trim().slice(0, 200) : "";
    if (address.length < 5) return json({ status: "invalid_address" }, 400);
    const point = await geocode(address);
    if (!point) return json({ status: "no_match" });
    const u = new URL(`${OS}/people.geo`);
    u.searchParams.set("lat", String(point.lat));
    u.searchParams.set("lng", String(point.lng));
    u.searchParams.append("include", "links");
    u.searchParams.append("include", "offices");
    const res = await fetch(u, { headers: { "X-API-KEY": key }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return json({ status: "unavailable" }, 502);
    const data = await res.json();
    const people = sortRepresentatives(((data.results ?? []) as OsPerson[]).map(toRepresentative));
    return json({ status: people.length ? "ok" : "no_match", matchedAddress: point.matched, representatives: people });
  } catch {
    return json({ status: "unavailable" }, 502);
  }
});
