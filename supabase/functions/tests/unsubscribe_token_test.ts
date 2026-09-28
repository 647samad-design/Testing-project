// Run: deno test --allow-read supabase/functions/tests/
// send-email (creates unsubscribe links) and email-unsubscribe (verifies them)
// each carry a copy of unsubscribeToken() so each function deploys on its own.
// If the copies ever drift, every unsubscribe link breaks -- this guards that.
function assert(cond: unknown, msg = "assertion failed"): asserts cond { if (!cond) throw new Error(msg); }
function assertEquals<T>(a: T, b: T) { if (a !== b) throw new Error(`expected ${String(b)}, got ${String(a)}`); }

const extract = (path: string) => {
  const src = Deno.readTextFileSync(new URL(path, import.meta.url));
  const m = src.match(/\/\/ ── unsubscribe token[\s\S]*?\/\/ ── end unsubscribe token ──/);
  assert(m, `unsubscribe token block missing in ${path}`);
  return m![0];
};

Deno.test("send-email and email-unsubscribe use an identical token function", () => {
  assertEquals(extract("../send-email/index.ts"), extract("../email-unsubscribe/index.ts"));
});
