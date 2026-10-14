import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { matchContest, type ContestForMatch } from '@/services/admin';

const contests: ContestForMatch[] = [
  { id: 'sen', office_name: 'U.S. Senator', district: null },
  { id: 'hd17', office_name: 'State Representative', district: { name: 'State House District 17', state: 'Florida' } },
  { id: 'hd18', office_name: 'State Representative', district: { name: 'State House District 18', state: 'Florida' } },
];

describe('matchContest (CSV import)', () => {
  it('matches a statewide race by office alone', () => {
    expect(matchContest(contests, { first_name: 'a', last_name: 'b', office: 'u.s. senator' }).contest?.id).toBe('sen');
  });
  it('matches a district race by office + district, ignoring case and extra spaces', () => {
    expect(matchContest(contests, { first_name: 'a', last_name: 'b', office: 'State  Representative', district: 'state house district 18', state: 'FLORIDA' }).contest?.id).toBe('hd18');
  });
  it('reports a district race named without its district as ambiguous only when several exist', () => {
    expect(matchContest(contests, { first_name: 'a', last_name: 'b', office: 'State Representative' }).problem).toBe('not_found');
  });
  it('reports a wrong state or unknown office as not found', () => {
    expect(matchContest(contests, { first_name: 'a', last_name: 'b', office: 'State Representative', district: 'State House District 17', state: 'Texas' }).problem).toBe('not_found');
    expect(matchContest(contests, { first_name: 'a', last_name: 'b', office: 'Mayor' }).problem).toBe('not_found');
  });
  it('flags duplicates as ambiguous', () => {
    expect(matchContest([...contests, { id: 'sen2', office_name: 'U.S. Senator', district: null }], { first_name: 'a', last_name: 'b', office: 'U.S. Senator' }).problem).toBe('ambiguous');
  });
});
