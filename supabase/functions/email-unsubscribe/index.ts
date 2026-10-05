// One-click email unsubscribe, no sign-in required.
//
// Bulk Gov Search App emails (the digest and election reminders) previously only
// said "manage at ballotlens.com/account" -- plain text, and it required
// signing in. US CAN-SPAM requires a working opt-out that doesn't make people
// log in, and Gmail/Yahoo's 2024 bulk-sender rules require one-click
// unsubscribe (RFC 8058 List-Unsubscribe-Post), or mail gets spam-foldered.
//
// Links are signed (HMAC of user id + list), so nobody can unsubscribe someone
// else by guessing ids. POST is the RFC 8058 one-click request mail providers
// send. GET (a person clicking the link) redirects to the site's /unsubscribe
// page: Supabase serves function responses on *.supabase.co as text/plain, so
// an HTML page returned from here showed up as raw HTML source in the browser.
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

  const isPost = req.method === "POST";
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !LISTS.includes(list) || !(await tokensEqual(token, await unsubscribeToken(userId, list)))) {
    return isPost ? new Response("Invalid unsubscribe link", { status: 400 }) : result("invalid", list);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const change = list === "digest" ? { digest_frequency: "off" } : { instant_election_reminders: false };
  const { error } = await admin
    .from("notification_preferences")
    .upsert({ user_id: userId, ...change, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return isPost ? new Response("Could not unsubscribe", { status: 500 }) : result("error", list);

  if (isPost) return new Response("Unsubscribed", { status: 200 });
  return result("ok", list);
});

/** Sends a person to the site's /unsubscribe page with the outcome. Falls back
 * to a plain-text message if SITE_URL isn't configured. */
function result(status: "ok" | "invalid" | "error", list: string): Response {
  const site = (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
  if (site) {
    const to = `${site}/unsubscribe?status=${status}&list=${encodeURIComponent(LISTS.includes(list as List) ? list : "")}`;
    return new Response(null, { status: 303, headers: { Location: to } });
  }
  const text = status === "ok"
    ? "You've been unsubscribed. You can turn these emails back on any time from Account > Notifications."
    : status === "invalid"
    ? "This unsubscribe link is invalid or has expired. You can manage emails from your Gov Search App account settings."
    : "Something went wrong and you were not unsubscribed. Please try again, or turn emails off from your account settings.";
  return new Response(text, { status: status === "ok" ? 200 : status === "invalid" ? 400 : 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function tokensEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


// ── unsubscribe token (keep IDENTICAL in send-email and email-unsubscribe; a test enforces this) ──
async function unsubscribeToken(userId: string, list: string): Promise<string> {
  const secret = Deno.env.get("EMAIL_UNSUBSCRIBE_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}:${list}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// ── end unsubscribe token ──
