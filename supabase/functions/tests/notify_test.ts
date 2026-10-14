// Run: deno test --allow-env supabase/functions/tests/notify_test.ts
import { normalizeUsPhone, sendPushToUsers, smsConfigured } from "../_shared/notify.ts";

function assertEquals<T>(a: T, b: T) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

Deno.test("normalizes U.S. phone numbers to E.164", () => {
  assertEquals(normalizeUsPhone("(904) 555-0123"), "+19045550123");
  assertEquals(normalizeUsPhone("+1 904.555.0123"), "+19045550123");
  assertEquals(normalizeUsPhone("19045550123"), "+19045550123");
  assertEquals(normalizeUsPhone("555-0123"), null);
  assertEquals(normalizeUsPhone("(104) 555-0123"), null); // area codes can't start with 0/1
  assertEquals(normalizeUsPhone("+44 20 7946 0958"), null);
});

Deno.test("without secrets nothing is sent (and nothing throws)", async () => {
  Deno.env.delete("VAPID_PUBLIC_KEY");
  Deno.env.delete("TWILIO_ACCOUNT_SID");
  assertEquals(smsConfigured(), false);
  assertEquals(await sendPushToUsers({}, ["u1"], { title: "t", body: "b" }), 0);
});
