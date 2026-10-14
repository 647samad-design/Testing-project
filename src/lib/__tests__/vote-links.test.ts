import { describe, it, expect } from 'vitest';
import { voteLinksFor, directionsUrl } from '@/lib/vote-links';

describe('voteLinksFor', () => {
  it('uses the vote.gov page for the state when there are no official links', () => {
    const l = voteLinksFor('FL');
    expect(l.register).toBe('https://vote.gov/register/fl/');
    expect(l.checkRegistration).toContain('vote.org');
    expect(l.electionOffice).toBeNull();
  });
  it('falls back to vote.gov home for an unknown state', () => {
    expect(voteLinksFor(undefined).register).toBe('https://vote.gov/');
    expect(voteLinksFor('florida').register).toBe('https://vote.gov/');
  });
  it('prefers the state election office links from the Civic API', () => {
    const l = voteLinksFor('FL', { registrationCheck: 'https://registration.elections.myflorida.com/CheckVoterStatus', absentee: 'https://dos.fl.gov/elections/for-voters/voting/vote-by-mail/' });
    expect(l.checkRegistration).toBe('https://registration.elections.myflorida.com/CheckVoterStatus');
    expect(l.voteByMail).toContain('dos.fl.gov');
  });
  it('never uses an unsafe official link', () => {
    expect(voteLinksFor('FL', { registration: 'javascript:alert(1)' }).register).toBe('https://vote.gov/register/fl/');
  });
  it('builds a Google Maps directions link', () => {
    expect(directionsUrl('1 Main St, Town, FL')).toBe('https://www.google.com/maps/dir/?api=1&destination=1%20Main%20St%2C%20Town%2C%20FL');
  });
});
