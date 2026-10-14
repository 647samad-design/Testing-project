// Pure helpers for the representatives function (unit-tested separately).

export interface OsPerson {
  id: string;
  name: string;
  party?: string;
  image?: string;
  email?: string;
  openstates_url?: string;
  current_role?: { title?: string; org_classification?: string; district?: string | number };
  jurisdiction?: { id?: string; name?: string; classification?: string };
  links?: { url?: string; note?: string }[];
  offices?: { voice?: string; address?: string; classification?: string }[];
}

export interface Representative {
  id: string;
  name: string;
  party: string | null;
  title: string;
  level: "federal" | "state";
  chamber: "upper" | "lower" | "other";
  district: string | null;
  jurisdiction: string | null;
  jurisdictionId: string | null;
  photo: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  profileUrl: string | null;
}

export function https(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.toString() : url.protocol === "http:" ? url.toString().replace(/^http:/, "https:") : null;
  } catch {
    return null;
  }
}

function email(e: string | undefined): string | null {
  return e && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e) ? e : null;
}

export function toRepresentative(p: OsPerson): Representative {
  const org = p.current_role?.org_classification;
  const level = p.jurisdiction?.classification === "country" ? "federal" : "state";
  return {
    id: p.id,
    name: p.name,
    party: p.party ?? null,
    title: p.current_role?.title ?? (org === "upper" ? "Senator" : org === "lower" ? "Representative" : "Legislator"),
    level,
    chamber: org === "upper" ? "upper" : org === "lower" ? "lower" : "other",
    district: p.current_role?.district != null ? String(p.current_role.district) : null,
    jurisdiction: p.jurisdiction?.name ?? null,
    jurisdictionId: p.jurisdiction?.id ?? null,
    photo: https(p.image),
    email: email(p.email),
    phone: p.offices?.find((o) => o.voice)?.voice ?? null,
    website: https(p.links?.[0]?.url),
    profileUrl: https(p.openstates_url),
  };
}

/** U.S. Senate, U.S. House, then state senate, state house. */
export function sortRepresentatives(list: Representative[]): Representative[] {
  const rank = (r: Representative) => (r.level === "federal" ? 0 : 2) + (r.chamber === "upper" ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export interface OsBill {
  identifier?: string;
  title?: string;
  latest_action_date?: string;
  latest_action_description?: string;
  openstates_url?: string;
  session?: string;
}

export function toBill(b: OsBill) {
  return {
    identifier: b.identifier ?? "",
    title: b.title ?? "",
    session: b.session ?? null,
    latestActionDate: b.latest_action_date ? b.latest_action_date.slice(0, 10) : null,
    latestAction: b.latest_action_description ?? null,
    url: https(b.openstates_url),
  };
}
