// End-to-end test of the real email-unsubscribe function against a fake PostgREST.
// Run: deno run --allow-net --allow-env --allow-read supabase/functions/tests/email_unsubscribe_e2e.ts
// (uses ports 8000 and 54399)
const received: string[] = [];
const fakeDb = Deno.serve({ port: 54399, onListen() {} }, async (req) => {
  const u = new URL(req.url);
  received.push(`${req.method} ${u.pathname}?${u.searchParams} body=${await req.text()}`);
  return new Response("[]", { status: 201, headers: { "Content-Type": "application/json" } });
});
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54399");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc");
Deno.env.set("EMAIL_UNSUBSCRIBE_SECRET", "s3cret");
await import("../email-unsubscribe/index.ts"); // starts the real function on :8000
await new Promise((r) => setTimeout(r, 300));

async function tok(u: string, l: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("s3cret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${u}:${l}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const U = "11111111-1111-1111-1111-111111111111", V = "22222222-2222-2222-2222-222222222222", B = "http://127.0.0.1:8000";
const T = await tok(U, "digest"), TR = await tok(U, "reminders");
let fails = 0;
async function check(label: string, url: string, expectStatus: number, method = "GET", expectText?: string) {
  const r = await fetch(url, { method, body: method === "POST" ? "List-Unsubscribe=One-Click" : undefined, signal: AbortSignal.timeout(4000) });
  const text = await r.text();
  const ok = r.status === expectStatus && (!expectText || text.includes(expectText));
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  -> ${r.status}${expectText && !text.includes(expectText) ? "  missing: " + expectText : ""}`);
}
await check("valid digest link unsubscribes", `${B}/?u=${U}&l=digest&t=${T}`, 200, "GET", "unsubscribed from the BallotLens Digest");
await check("tampered token rejected", `${B}/?u=${U}&l=digest&t=${T.slice(0, -1)}0`, 400, "GET", "invalid");
await check("token reused for another user rejected", `${B}/?u=${V}&l=digest&t=${T}`, 400);
await check("digest token reused for reminders rejected", `${B}/?u=${U}&l=reminders&t=${T}`, 400);
await check("unknown list rejected", `${B}/?u=${U}&l=marketing&t=${T}`, 400);
await check("RFC 8058 one-click POST works", `${B}/?u=${U}&l=reminders&t=${TR}`, 200, "POST", "Unsubscribed");
console.log("--- database writes requested ---");
for (const r of received) console.log("  " + r);
const wrote = received.join("\n");
for (const re of [/digest_frequency":"off"/, /instant_election_reminders":false/]) {
  if (!re.test(wrote)) { fails++; console.log("FAIL  missing write " + re); }
}
if (received.length !== 2) { fails++; console.log(`FAIL  expected exactly 2 writes (only the valid requests), got ${received.length}`); }
console.log(fails === 0 ? "ALL UNSUBSCRIBE E2E CHECKS PASSED" : `${fails} FAILED`);
await fakeDb.shutdown();
Deno.exit(fails === 0 ? 0 : 1);
