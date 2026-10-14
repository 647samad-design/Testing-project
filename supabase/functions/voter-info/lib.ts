// Pure helpers for voter-info (kept separate so they can be unit-tested).
export type CivicAddress = { locationName?: string; line1?: string; line2?: string; line3?: string; city?: string; state?: string; zip?: string };
export type CivicSite = {
  address?: CivicAddress; name?: string; notes?: string; pollingHours?: string;
  startDate?: string; endDate?: string; latitude?: number | string; longitude?: number | string;
};
export type CivicAdminBody = {
  name?: string; electionInfoUrl?: string; electionRegistrationUrl?: string;
  electionRegistrationConfirmationUrl?: string; absenteeVotingInfoUrl?: string;
  votingLocationFinderUrl?: string; ballotInfoUrl?: string;
};

export interface VotingSite {
  name: string;
  address: string;
  hours: string | null;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
  lat: number | null;
  lng: number | null;
}

export function formatAddress(a: CivicAddress | undefined): string {
  if (!a) return "";
  const street = [a.line1, a.line2, a.line3].filter((x) => x && x.trim()).join(", ");
  const cityLine = [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter((x) => x && String(x).trim()).join(", ");
  return [street, cityLine].filter(Boolean).join(", ");
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export function toSites(list: CivicSite[] | undefined, limit = 10): VotingSite[] {
  return (list ?? []).slice(0, limit).map((s) => ({
    name: s.address?.locationName || s.name || "",
    address: formatAddress(s.address),
    hours: s.pollingHours || null,
    notes: s.notes || null,
    startDate: s.startDate || null,
    endDate: s.endDate || null,
    lat: num(s.latitude),
    lng: num(s.longitude),
  })).filter((s) => s.address);
}

/** Only http(s) links from the API reach the browser. */
function safeLink(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function toLinks(body: CivicAdminBody | undefined) {
  return {
    officeName: body?.name ?? null,
    electionInfo: safeLink(body?.electionInfoUrl),
    registration: safeLink(body?.electionRegistrationUrl),
    registrationCheck: safeLink(body?.electionRegistrationConfirmationUrl),
    absentee: safeLink(body?.absenteeVotingInfoUrl),
    locationFinder: safeLink(body?.votingLocationFinderUrl),
    ballotInfo: safeLink(body?.ballotInfoUrl),
  };
}

