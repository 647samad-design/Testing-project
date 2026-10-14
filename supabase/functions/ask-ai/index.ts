// Ask AI with a real language model, grounded in our database only.
//
// For a signed-in user and a specific candidate: counts the question against
// the user's daily allowance (same RPC the app uses), gathers that candidate's
// evidence (profile, positions + sources, statements, votes), and asks Claude
// to answer ONLY from that numbered evidence, citing it. Citations that don't
// exist are dropped; sources shown are only the cited evidence's sources.
//
// Secrets: ANTHROPIC_API_KEY (required to enable), ANTHROPIC_MODEL (optional,
// default claude-haiku-4-5-20251001). Without the key the app falls back to the
// built-in rule-based answers.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { buildEvidence, buildPrompt, parseAnswer, type SourceRow } from "./lib.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ status: "not_configured" });

  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const candidateId = typeof body.candidateId === "string" && UUID.test(body.candidateId) ? body.candidateId : null;
  const lang = ["en", "es", "pt", "ht", "ru"].includes(body.lang) ? body.lang : "en";
  if (!question || question.length > 1000 || !candidateId) return json({ status: "invalid_request" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await caller.auth.getUser();
  if (!userData?.user) return json({ status: "unauthorized" }, 401);

  // Daily allowance, checked and counted as the user (the RPC refuses other ids).
  const { data: usage, error: usageErr } = await caller.rpc("check_and_increment_ai_usage", { p_user_id: userData.user.id });
  if (usageErr || !usage) return json({ status: "error" }, 500);
  const usageOut = { allowed: usage.allowed, remaining: usage.remaining, limit: usage.limit, isPaid: usage.is_paid };
  if (!usage.allowed) return json({ status: "limit", usage: usageOut });

  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: candidate } = await db.from("candidates")
    .select("id, first_name, last_name, party, bio, education, professional_background, previous_offices, is_incumbent, is_demo")
    .eq("id", candidateId).maybeSingle();
  if (!candidate) return json({ status: "invalid_request" }, 400);

  const [{ data: offices }, { data: positions }, { data: statements }, { data: votes }] = await Promise.all([
    db.from("candidate_offices").select("contest:ballot_contests(office_name, district:districts(name))").eq("candidate_id", candidateId),
    db.from("candidate_positions").select("id, summary, verification_status, issue:issues(name)").eq("candidate_id", candidateId),
    db.from("candidate_statements").select("statement_text, statement_date, source_id, issue:issues(name)").eq("candidate_id", candidateId).order("statement_date", { ascending: false }).limit(15),
    db.from("voting_records").select("bill_name, bill_number, vote, vote_date, description, source_id").eq("candidate_id", candidateId).order("vote_date", { ascending: false }).limit(20),
  ]);

  // Sources: via candidate_sources for positions, source_id for statements/votes.
  const posIds = (positions ?? []).map((p: { id: string }) => p.id);
  const { data: links } = posIds.length ? await db.from("candidate_sources").select("candidate_position_id, source_id").in("candidate_position_id", posIds) : { data: [] };
  const sourceIds = [...new Set([
    ...(links ?? []).map((l: { source_id: string }) => l.source_id),
    ...(statements ?? []).map((s: { source_id: string | null }) => s.source_id),
    ...(votes ?? []).map((v: { source_id: string | null }) => v.source_id),
  ].filter(Boolean))] as string[];
  const { data: srcRows } = sourceIds.length ? await db.from("sources").select("*").in("id", sourceIds) : { data: [] };
  const src = new Map<string, SourceRow>(((srcRows ?? []) as SourceRow[]).map((s) => [s.id, s]));

  const evidence = buildEvidence({
    candidate,
    // deno-lint-ignore no-explicit-any
    offices: (offices ?? []).map((o: any) => [o.contest?.office_name, o.contest?.district?.name].filter(Boolean).join(", ")).filter(Boolean),
    // deno-lint-ignore no-explicit-any
    positions: (positions ?? []).map((p: any) => ({ ...p, sources: (links ?? []).filter((l: { candidate_position_id: string }) => l.candidate_position_id === p.id).map((l: { source_id: string }) => src.get(l.source_id)).filter(Boolean) })),
    // deno-lint-ignore no-explicit-any
    statements: (statements ?? []).map((s: any) => ({ ...s, source: s.source_id ? src.get(s.source_id) ?? null : null })),
    // deno-lint-ignore no-explicit-any
    votes: (votes ?? []).map((v: any) => ({ ...v, source: v.source_id ? src.get(v.source_id) ?? null : null })),
  });
  const { system, user } = buildPrompt(question, evidence, lang);

  let text = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001",
        max_tokens: 700,
        temperature: 0,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return json({ status: "unavailable", usage: usageOut }, 502);
    const data = await res.json();
    text = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  } catch {
    return json({ status: "unavailable", usage: usageOut }, 502);
  }

  const parsed = parseAnswer(text, evidence.length);
  if (!parsed) return json({ status: "unavailable", usage: usageOut }, 502);
  const cited = parsed.cited.map((n) => evidence[n - 1]);
  const sources = [...new Map(cited.filter((e) => e.source).map((e) => [e.source!.id, e.source!])).values()];
  const limitations = [...parsed.limitations];
  if (candidate.is_demo) limitations.push("Sample data.");
  return json({
    status: "ok",
    usage: usageOut,
    response: { answer: parsed.answer, evidence: cited.map((e) => e.text), sources, confidence: parsed.confidence, limitations },
  });
});
