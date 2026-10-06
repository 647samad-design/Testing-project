// Run: deno test --allow-env supabase/functions/tests/email_i18n_test.ts
// Tiny local asserts (no network dependency).
function assert(c: unknown, msg = "assertion failed"): asserts c { if (!c) throw new Error(msg); }
function assertEquals<T>(a: T, b: T) { if (a !== b) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertStringIncludes(s: string, part: string) { if (!s.includes(part)) throw new Error(`expected "${s}" to include "${part}"`); }
import { asLang, days, electionReminder, formatDate, manageFooter, raceResult, siteLink, teamInvite, tr, unsubscribeFooter } from "../_shared/email-i18n.ts";

const LANGS = ["en", "es", "pt", "ht", "ru"] as const;

Deno.test("unknown or missing language falls back to English", () => {
  assertEquals(asLang(null), "en");
  assertEquals(asLang("fr"), "en");
  assertEquals(asLang("ru"), "ru");
});

Deno.test("every language has its own subject and footer text", () => {
  const subjects = new Set(LANGS.map((l) => tr("digestSubject", l)));
  assertEquals(subjects.size, 5);
  assertStringIncludes(unsubscribeFooter("es", "https://x/u"), "Darse de baja");
  assertStringIncludes(unsubscribeFooter("ru", "https://x/u"), "Отписаться");
});

Deno.test("Russian day counts use the right plural", () => {
  assertEquals(days("ru", 1), "1 день");
  assertEquals(days("ru", 3), "3 дня");
  assertEquals(days("ru", 5), "5 дней");
  assertEquals(days("ru", 11), "11 дней");
  assertEquals(days("ru", 22), "22 дня");
  assertEquals(days("en", 1), "1 day");
  assertEquals(days("es", 2), "2 días");
});

Deno.test("dates are written per language and never shift a day", () => {
  assertEquals(formatDate("en", "2026-11-03"), "November 3, 2026");
  assertStringIncludes(formatDate("es", "2026-11-03"), "noviembre");
  assertStringIncludes(formatDate("ru", "2026-11-03"), "ноября");
  assertEquals(formatDate("en", "not-a-date"), "not-a-date");
});

Deno.test("election reminder and race result are localized", () => {
  const es = electionReminder("es", "Elección General", "2026-11-03", 7);
  assertStringIncludes(es.title, "7 días");
  assertStringIncludes(es.body, "boleta");
  const ru = raceResult("ru", "race_called", "Governor", "FL", "Jane Doe", "Democratic");
  assertStringIncludes(ru.body, "Jane Doe");
  assertStringIncludes(raceResult("pt", "race_certified", "Governor", "FL", null, null).title, "certificados");
});

Deno.test("links point at the reader's language and are omitted without SITE_URL", () => {
  Deno.env.delete("SITE_URL");
  assertEquals(siteLink("es", "/messages"), "");
  assert(manageFooter("en").endsWith(".</p>"));
  Deno.env.set("SITE_URL", "https://govsearch.test/");
  assertEquals(siteLink("es", "/messages"), "https://govsearch.test/es/messages");
  assertEquals(siteLink("en", "/messages"), "https://govsearch.test/messages");
  assertEquals(siteLink("ru", "/"), "https://govsearch.test/ru");
  assertStringIncludes(manageFooter("pt"), "https://govsearch.test/pt/account");
});

Deno.test("team invite translates the role and falls back for unknown roles", () => {
  assertStringIncludes(teamInvite("es", "campaign_manager").html, "director de campaña");
  assertStringIncludes(teamInvite("ht", "nonsense").html, "manm ekip");
  assertStringIncludes(teamInvite("en", null).html, "team member");
});
