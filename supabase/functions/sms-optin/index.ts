// Text-message reminders opt-in: proves a phone number belongs to the signed-in
// user with a 6-digit code before any reminder is texted to it.
//   { action: "start", phone }  -> texts a code (max 3 per hour per user)
//   { action: "confirm", code } -> saves the verified number and turns on SMS reminders
// Codes are stored hashed, expire after 10 minutes and allow 5 attempts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { normalizeUsPhone, sendSms, smsConfigured } from "../_shared/notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 3;
const MAX_ATTEMPTS = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!smsConfigured()) return json({ status: "not_configured" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ status: "unauthorized" }, 401);
  const caller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await caller.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ status: "unauthorized" }, 401);
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const pepper = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(-16);

  const body = await req.json().catch(() => ({}));

  if (body.action === "start") {
    const phone = typeof body.phone === "string" ? normalizeUsPhone(body.phone) : null;
    if (!phone) return json({ status: "invalid_phone" }, 400);
    const { data: prev } = await admin.from("sms_verifications").select("sent_count, window_start").eq("user_id", user.id).maybeSingle();
    const inWindow = prev && Date.now() - new Date(prev.window_start).getTime() < 60 * 60 * 1000;
    if (inWindow && prev.sent_count >= MAX_SENDS_PER_HOUR) return json({ status: "too_many" }, 429);
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    await admin.from("sms_verifications").upsert({
      user_id: user.id,
      phone,
      code_hash: await sha256(`${user.id}:${phone}:${code}:${pepper}`),
      attempts: 0,
      sent_count: inWindow ? prev.sent_count + 1 : 1,
      window_start: inWindow ? prev.window_start : new Date().toISOString(),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    try {
      await sendSms(phone, `Your Gov Search App code is ${code}. It expires in 10 minutes. If you didn't ask for this, ignore this text.`);
    } catch {
      return json({ status: "send_failed" }, 502);
    }
    return json({ status: "sent", phoneLast4: phone.slice(-4) });
  }

  if (body.action === "confirm") {
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    const { data: v } = await admin.from("sms_verifications").select("*").eq("user_id", user.id).maybeSingle();
    if (!v || new Date(v.expires_at).getTime() < Date.now()) return json({ status: "expired" }, 400);
    if (v.attempts >= MAX_ATTEMPTS) return json({ status: "too_many" }, 429);
    if (code.length !== 6 || (await sha256(`${user.id}:${v.phone}:${code}:${pepper}`)) !== v.code_hash) {
      await admin.from("sms_verifications").update({ attempts: v.attempts + 1 }).eq("user_id", user.id);
      return json({ status: "wrong_code" }, 400);
    }
    const { error } = await admin.from("notification_preferences").upsert({
      user_id: user.id,
      sms_phone: v.phone,
      sms_phone_verified: true,
      sms_election_reminders: true,
      sms_consent_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) return json({ status: "error" }, 500);
    await admin.from("sms_verifications").delete().eq("user_id", user.id);
    return json({ status: "verified", phoneLast4: v.phone.slice(-4) });
  }

  return json({ status: "invalid_request" }, 400);
});
