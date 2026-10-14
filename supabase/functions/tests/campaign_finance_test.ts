// Run: deno test supabase/functions/tests/campaign_finance_test.ts
import { FEC_ID, toTotals } from "../campaign-finance/lib.ts";

function assertEquals<T>(a: T, b: T) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

Deno.test("accepts real FEC candidate ID shapes only", () => {
  assertEquals(FEC_ID.test("S6FL00123"), true);
  assertEquals(FEC_ID.test("H2CA12345"), true);
  assertEquals(FEC_ID.test("P00000001"), true);
  assertEquals(FEC_ID.test("X12"), false);
  assertEquals(FEC_ID.test("S6FL00123/../x"), false);
});

Deno.test("maps OpenFEC totals, preferring the 'last_' cash on hand", () => {
  const t = toTotals({ cycle: 2026, receipts: 1234567.891, disbursements: 1000000, last_cash_on_hand_end_period: 250000, cash_on_hand_end_period: 1, individual_contributions: 900000, other_political_committee_contributions: 200000, political_party_committee_contributions: 5000, candidate_contribution: 1000, coverage_end_date: "2026-09-30T00:00:00" });
  assertEquals(t!.cycle, 2026);
  assertEquals(t!.receipts, 1234567.89);
  assertEquals(t!.cashOnHand, 250000);
  assertEquals(t!.partyAndSelf, 6000);
  assertEquals(t!.coverageEnd, "2026-09-30");
});

Deno.test("no results -> null", () => {
  assertEquals(toTotals(undefined), null);
});
