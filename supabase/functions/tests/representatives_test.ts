// Run: deno test supabase/functions/tests/representatives_test.ts
import { https, sortRepresentatives, toBill, toRepresentative } from "../representatives/lib.ts";

function assertEquals<T>(a: T, b: T) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const senator = toRepresentative({ id: "ocd-person/1", name: "Zed Senator", party: "Independent", jurisdiction: { classification: "country", name: "United States", id: "ocd-jurisdiction/country:us/government" }, current_role: { title: "Senator", org_classification: "upper", district: "FL" } });
const houseRep = toRepresentative({ id: "ocd-person/2", name: "Ann House", jurisdiction: { classification: "country" }, current_role: { org_classification: "lower", district: 4 } });
const stateRep = toRepresentative({ id: "ocd-person/3", name: "Bo State", jurisdiction: { classification: "state", name: "Florida" }, current_role: { title: "Representative", org_classification: "lower", district: "17" }, offices: [{ voice: "850-555-0100" }], email: "bo@example.gov", image: "http://example.gov/bo.jpg" });

Deno.test("maps Open States people to the app's shape", () => {
  assertEquals(senator.level, "federal");
  assertEquals(senator.chamber, "upper");
  assertEquals(houseRep.title, "Representative"); // derived when the API has no title
  assertEquals(houseRep.district, "4");
  assertEquals(stateRep.level, "state");
  assertEquals(stateRep.phone, "850-555-0100");
  assertEquals(stateRep.photo, "https://example.gov/bo.jpg"); // upgraded to https
});

Deno.test("rejects bad emails and non-web links", () => {
  assertEquals(toRepresentative({ id: "x", name: "x", email: "not-an-email" }).email, null);
  assertEquals(https("javascript:alert(1)"), null);
});

Deno.test("orders U.S. Senate, U.S. House, state senate, state house", () => {
  assertEquals(sortRepresentatives([stateRep, houseRep, senator]).map((r) => r.name), ["Zed Senator", "Ann House", "Bo State"]);
});

Deno.test("maps bills", () => {
  assertEquals(toBill({ identifier: "HB 101", title: "Schools", latest_action_date: "2026-03-01T00:00:00", openstates_url: "https://openstates.org/fl/bills/2026/HB101/" }).latestActionDate, "2026-03-01");
});
