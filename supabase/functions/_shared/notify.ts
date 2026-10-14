// Phone/browser notifications shared by the sending edge functions:
// Web Push (VAPID) and SMS (Twilio). Both are optional: with their secrets
// unset, nothing is sent and email/in-app notifications still work.
//   Push: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: URL)
//   SMS:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER
import webpush from "npm:web-push@3.6.7";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path to open when tapped, e.g. "/ballot". */
  url?: string;
  tag?: string;
}

let vapidReady: boolean | null = null;
function setupVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return (vapidReady = false);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:support@example.com", pub, priv);
  return (vapidReady = true);
}

/** Sends a push to every device of each user. Subscriptions the browser has
 * revoked (404/410) are deleted. Returns how many pushes were delivered. */
export async function sendPushToUsers(admin: Db, userIds: string[], payload: PushPayload | ((userId: string) => PushPayload)): Promise<number> {
  if (userIds.length === 0 || !setupVapid()) return 0;
  let sent = 0;
  for (let i = 0; i < userIds.length; i += 150) {
    const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds.slice(i, i + 150));
    for (const s of (subs ?? []) as { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[]) {
      const p = typeof payload === "function" ? payload(s.user_id) : payload;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return sent;
}

export function smsConfigured(): boolean {
  return !!(Deno.env.get("TWILIO_ACCOUNT_SID") && Deno.env.get("TWILIO_AUTH_TOKEN") && (Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") || Deno.env.get("TWILIO_FROM_NUMBER")));
}

/** Sends one text message. Throws on failure. */
export async function sendSms(to: string, body: string): Promise<void> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID"), token = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!sid || !token) throw new Error("SMS is not configured");
  const form = new URLSearchParams({ To: to, Body: body });
  const svc = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
  if (svc) form.set("MessagingServiceSid", svc); else form.set("From", Deno.env.get("TWILIO_FROM_NUMBER") ?? "");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}`);
}

/** Verified phone numbers of the users who opted into text election reminders. */
export async function smsReminderPhones(admin: Db, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += 150) {
    const { data } = await admin.from("notification_preferences").select("user_id, sms_phone")
      .in("user_id", userIds.slice(i, i + 150)).eq("sms_election_reminders", true).eq("sms_phone_verified", true).not("sms_phone", "is", null);
    for (const r of (data ?? []) as { user_id: string; sms_phone: string }[]) out.set(r.user_id, r.sms_phone);
  }
  return out;
}

/** "(904) 555-0123", "904.555.0123", "+1 904 555 0123" -> "+19045550123"; null if not a valid U.S. number. */
export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(ten) ? `+1${ten}` : null;
}
