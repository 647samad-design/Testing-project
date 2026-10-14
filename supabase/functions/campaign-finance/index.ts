// Campaign finance for a federal candidate from the FEC's OpenFEC API:
// money raised, spent, cash on hand and where it came from, for the latest
// two-year cycle. Key: FEC_API_KEY secret (free from api.data.gov); without it
// the heavily rate-limited DEMO_KEY is used. Results are cached in memory for
// 6 hours per function instance (the FEC updates filings at most daily).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { FEC_ID, toTotals } from "./lib.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; body: unknown }>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const fecId = typeof body.fecId === "string" ? body.fecId.trim().toUpperCase() : "";
  if (!FEC_ID.test(fecId)) return json({ status: "invalid_id" }, 400);

  const hit = cache.get(fecId);
  if (hit && Date.now() - hit.at < TTL_MS) return json(hit.body);

  const key = Deno.env.get("FEC_API_KEY") || "DEMO_KEY";
  const u = new URL(`https://api.open.fec.gov/v1/candidate/${fecId}/totals/`);
  u.searchParams.set("api_key", key);
  u.searchParams.set("sort", "-cycle");
  u.searchParams.set("per_page", "1");
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
    if (res.status === 429) return json({ status: "rate_limited" }, 503);
    if (!res.ok) return json({ status: "unavailable" }, 502);
    const data = await res.json();
    const totals = toTotals(data.results?.[0]);
    const out = {
      status: totals ? "ok" : "no_data",
      totals,
      fecUrl: `https://www.fec.gov/data/candidate/${fecId}/`,
    };
    cache.set(fecId, { at: Date.now(), body: out });
    return json(out);
  } catch {
    return json({ status: "unavailable" }, 502);
  }
});
