// Run: deno test supabase/functions/tests/voter_info_test.ts
import { formatAddress, toLinks, toSites } from "../voter-info/lib.ts";

function assertEquals<T>(a: T, b: T) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

Deno.test("formats a Civic API address on one line", () => {
  assertEquals(formatAddress({ line1: "1 Main St", line2: "Suite 2", city: "Yulee", state: "FL", zip: "32097" }), "1 Main St, Suite 2, Yulee, FL 32097");
  assertEquals(formatAddress(undefined), "");
});

Deno.test("keeps only the fields the app shows, drops sites without an address", () => {
  const sites = toSites([
    { address: { locationName: "Library", line1: "25 N 4th St", city: "Fernandina Beach", state: "FL", zip: "32034" }, pollingHours: "7am-7pm", latitude: "30.67", longitude: -81.46 },
    { address: {} },
  ]);
  assertEquals(sites.length, 1);
  assertEquals(sites[0].name, "Library");
  assertEquals(sites[0].lat, 30.67);
  assertEquals(sites[0].lng, -81.46);
  assertEquals(sites[0].hours, "7am-7pm");
});

Deno.test("only passes http(s) election office links to the browser", () => {
  const links = toLinks({ electionRegistrationUrl: "https://registertovoteflorida.gov", absenteeVotingInfoUrl: "javascript:alert(1)" });
  assertEquals(links.registration, "https://registertovoteflorida.gov/");
  assertEquals(links.absentee, null);
});
