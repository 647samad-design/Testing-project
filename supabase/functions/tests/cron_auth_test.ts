// Run: deno test --allow-env supabase/functions/tests/cron_auth_test.ts
import { isCronRequest } from "../_shared/cron-auth.ts";

function assertEquals<T>(a: T, b: T) { if (a !== b) throw new Error(`expected ${String(b)}, got ${String(a)}`); }
const req = (h?: string) => new Request("https://x/", { headers: h ? { "x-cron-secret": h } : {} });
const SECRET = "0123456789abcdef0123456789abcdef";

Deno.test("cron calls are refused when CRON_SECRET is unset or too short", () => {
  Deno.env.delete("CRON_SECRET");
  assertEquals(isCronRequest(req("")), false);
  Deno.env.set("CRON_SECRET", "short");
  assertEquals(isCronRequest(req("short")), false);
});

Deno.test("only the exact secret is accepted", () => {
  Deno.env.set("CRON_SECRET", SECRET);
  assertEquals(isCronRequest(req(SECRET)), true);
  assertEquals(isCronRequest(req(SECRET.slice(0, -1) + "0")), false);
  assertEquals(isCronRequest(req()), false);
});
