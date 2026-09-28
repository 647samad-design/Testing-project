// One-click email unsubscribe, no sign-in required.
//
// Bulk BallotLens emails (the digest and election reminders) previously only
// said "manage at ballotlens.com/account" -- plain text, and it required
// signing in. US CAN-SPAM requires a working opt-out that doesn't make people
// log in, and Gmail/Yahoo's 2024 bulk-sender rules require one-click
// unsubscribe (RFC 8058 List-Unsubscribe-Post), or mail gets spam-foldered.
//
// Links are signed (HMAC of user id + list), so nobody can unsubscribe someone
// else by guessing ids. GET shows a confirmation page; POST is the RFC 8058
// one-click request mail providers send.
//
// Deploy with JWT verification OFF (mail clients send no auth header), the
// same as stripe-webhook.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const LISTS = ["digest", "reminders"] as const;
type List = typeof LISTS[number];

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const list = (url.searchParams.get("l") ?? "") as List;
  const token = url.searchParams.get("t") ?? "";

  if (!/^[0-9a-f-]{36}$/i.test(userId) || !LISTS.includes(list) || !(await tokensEqual(token, await unsubscribeToken(userId, list)))) {
    return page("This unsubscribe link is invalid or has expired. You can manage emails any time from your BallotLens account settings.", 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const change = list === "digest" ? { digest_frequency: "off" } : { instant_election_reminders: false };
  const { error } = await admin
    .from("notification_preferences")
    .upsert({ user_id: userId, ...change, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return page("Something went wrong and you were not unsubscribed. Please try again, or turn emails off from your account settings.", 500);

  if (req.method === "POST") return new Response("Unsubscribed", { status: 200 });
  const what = list === "digest" ? "the BallotLens Digest" : "election reminder emails";
  return page(`You've been unsubscribed from ${what}. You can turn it back on any time from Account → Notifications.`, 200);
});

async function tokensEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function page(message: string, status: number): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BallotLens email preferences</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:64px auto;padding:0 20px;color:#222"><h1 style="font-size:20px">BallotLens</h1><p>${message}</p></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ── unsubscribe token (keep IDENTICAL in send-email and email-unsubscribe; a test enforces this) ──
async function unsubscribeToken(userId: string, list: string): Promise<string> {
  const secret = Deno.env.get("EMAIL_UNSUBSCRIBE_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}:${list}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// ── end unsubscribe token ──
