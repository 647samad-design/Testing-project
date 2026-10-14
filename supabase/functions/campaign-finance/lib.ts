// Pure helpers for campaign-finance (unit-tested separately).

export const FEC_ID = /^[HSP][0-9A-Z]{8}$/;

/** FEC numbers come as numbers (or occasionally null/strings); keep finite ones. */
function money(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// deno-lint-ignore no-explicit-any
export function toTotals(r: any) {
  if (!r) return null;
  return {
    cycle: Number(r.cycle ?? r.two_year_period ?? r.candidate_election_year) || null,
    receipts: money(r.receipts),
    disbursements: money(r.disbursements),
    cashOnHand: money(r.last_cash_on_hand_end_period ?? r.cash_on_hand_end_period),
    debts: money(r.last_debts_owed_by_committee ?? r.debts_owed_by_committee),
    individual: money(r.individual_contributions ?? r.individual_itemized_contributions),
    pac: money(r.other_political_committee_contributions),
    partyAndSelf: money((Number(r.political_party_committee_contributions) || 0) + (Number(r.candidate_contribution) || 0)),
    coverageEnd: typeof r.coverage_end_date === "string" ? r.coverage_end_date.slice(0, 10) : null,
  };
}
