import { safeUrl } from '@/lib/safe-url';

/** Official / nonpartisan places to register, check registration, vote by mail
 * and find a polling place. Vote.gov (U.S. government) has a page per state
 * with the state's registration deadlines; vote.org covers the lookups
 * vote.gov doesn't. State election office links from Google's Civic API win
 * when we have them, since they go straight to the official tool. */
export interface VoteLinks {
  register: string;
  checkRegistration: string;
  voteByMail: string;
  pollingPlace: string;
  electionOffice: string | null;
}

export interface OfficialLinks {
  registration?: string | null;
  registrationCheck?: string | null;
  absentee?: string | null;
  locationFinder?: string | null;
  electionInfo?: string | null;
}

export function voteLinksFor(statePostal: string | undefined, official?: OfficialLinks | null): VoteLinks {
  const st = statePostal && /^[A-Z]{2}$/.test(statePostal) ? statePostal.toLowerCase() : null;
  const pick = (u: string | null | undefined, fallback: string) => safeUrl(u) ?? fallback;
  return {
    register: pick(official?.registration, st ? `https://vote.gov/register/${st}/` : 'https://vote.gov/'),
    checkRegistration: pick(official?.registrationCheck, 'https://www.vote.org/am-i-registered-to-vote/'),
    voteByMail: pick(official?.absentee, 'https://www.vote.org/absentee-ballot/'),
    pollingPlace: pick(official?.locationFinder, 'https://www.vote.org/polling-place-locator/'),
    electionOffice: safeUrl(official?.electionInfo) ?? null,
  };
}

/** Google Maps directions to a voting site (no API key needed). */
export function directionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}
