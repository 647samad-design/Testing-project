import { supabase } from '@/lib/supabase';

export interface FinanceTotals {
  cycle: number | null;
  receipts: number | null;
  disbursements: number | null;
  cashOnHand: number | null;
  debts: number | null;
  individual: number | null;
  pac: number | null;
  partyAndSelf: number | null;
  coverageEnd: string | null;
}

export interface CampaignFinance {
  status: 'ok' | 'no_data' | 'invalid_id' | 'rate_limited' | 'unavailable';
  totals?: FinanceTotals | null;
  fecUrl?: string;
}

/** Latest-cycle FEC totals for a federal candidate (live from OpenFEC). */
export async function getCampaignFinance(fecId: string): Promise<CampaignFinance> {
  const { data, error } = await supabase.functions.invoke<CampaignFinance>('campaign-finance', { body: { fecId } });
  if (error || !data) return { status: 'unavailable' };
  return data;
}
