import { supabase } from '@/lib/supabase';
import {
  demoElection, demoContests, demoMeasures,
} from '@/services/demo-data';
import { buildRegionBallot, type RegionConfig } from '@/services/regions';
import type {
  Election, BallotContest, District, BallotMeasure,
  DistrictResult, Candidate,
} from '@/types';

/**
 * getVoterDistricts — looks up the voter's districts by ZIP code from the
 * zip_districts mapping table. Falls back to a demo result if the ZIP code
 * is not in the database.
 */
export async function getVoterDistricts(address: string): Promise<DistrictResult> {
  const zip = extractZip(address);

  if (zip) {
    const { data, error } = await supabase
      .from('zip_districts')
      .select('*')
      .eq('zip_code', zip)
      .maybeSingle();

    if (!error && data) {
      const d = data as Record<string, unknown>;
      const districtIds = [
        d.congressional_district_id,
        d.state_senate_district_id,
        d.state_house_district_id,
        d.county_district_id,
        d.municipal_district_id,
        d.judicial_district_id,
        d.school_district_id,
      ].filter(Boolean) as string[];

      const districtNames: Record<string, string> = {};
      if (districtIds.length > 0) {
        const { data: districts } = await supabase
          .from('districts')
          .select('id, name')
          .in('id', districtIds);
        (districts ?? []).forEach((dist) => {
          districtNames[dist.id] = dist.name;
        });
      }

      const name = (id: unknown) => (id && districtNames[id as string]) ? districtNames[id as string] : null;

      return {
        state: d.state as string,
        county: (d.county as string) ?? name(d.county_district_id),
        congressional: name(d.congressional_district_id),
        state_senate: name(d.state_senate_district_id),
        state_house: name(d.state_house_district_id),
        municipal: name(d.municipal_district_id),
        judicial: name(d.judicial_district_id),
        school: name(d.school_district_id),
        special: [],
      };
    }
  }

  return getFallbackDistricts(zip);
}

interface ZipPrefixEntry {
  state: string;
  county: string;
  city: string;
}

// Florida-only ZIP prefix fallback. The database has 590 Florida ZIPs with
// full district mappings; this fallback covers any Florida ZIP not yet in
// the database by mapping the first 3 digits to the correct county.
const ZIP_PREFIX_MAP: Record<string, ZipPrefixEntry> = {
  '320': { state: 'Florida', county: 'Nassau County', city: 'Fernandina Beach' },
  '321': { state: 'Florida', county: 'Volusia County', city: 'Daytona Beach' },
  '322': { state: 'Florida', county: 'Duval County', city: 'Jacksonville' },
  '323': { state: 'Florida', county: 'Leon County', city: 'Tallahassee' },
  '324': { state: 'Florida', county: 'Bay County', city: 'Panama City' },
  '325': { state: 'Florida', county: 'Escambia County', city: 'Pensacola' },
  '326': { state: 'Florida', county: 'Alachua County', city: 'Gainesville' },
  '327': { state: 'Florida', county: 'Seminole County', city: 'Sanford' },
  '328': { state: 'Florida', county: 'Orange County', city: 'Orlando' },
  '329': { state: 'Florida', county: 'Brevard County', city: 'Melbourne' },
  '330': { state: 'Florida', county: 'Broward County', city: 'Fort Lauderdale' },
  '331': { state: 'Florida', county: 'Miami-Dade County', city: 'Miami' },
  '332': { state: 'Florida', county: 'Miami-Dade County', city: 'Miami' },
  '333': { state: 'Florida', county: 'Broward County', city: 'Fort Lauderdale' },
  '334': { state: 'Florida', county: 'Palm Beach County', city: 'West Palm Beach' },
  '335': { state: 'Florida', county: 'Hillsborough County', city: 'Tampa' },
  '336': { state: 'Florida', county: 'Hillsborough County', city: 'Tampa' },
  '337': { state: 'Florida', county: 'Pinellas County', city: 'St. Petersburg' },
  '338': { state: 'Florida', county: 'Polk County', city: 'Lakeland' },
  '339': { state: 'Florida', county: 'Lee County', city: 'Fort Myers' },
  '341': { state: 'Florida', county: 'Collier County', city: 'Naples' },
  '342': { state: 'Florida', county: 'Sarasota County', city: 'Sarasota' },
  '344': { state: 'Florida', county: 'Marion County', city: 'Ocala' },
  '346': { state: 'Florida', county: 'Pasco County', city: 'New Port Richey' },
  '347': { state: 'Florida', county: 'Lake County', city: 'Clermont' },
  '349': { state: 'Florida', county: 'St. Lucie County', city: 'Fort Pierce' },
};

function getFallbackDistricts(zip: string): DistrictResult {
  const prefix = zip.slice(0, 3);
  const entry = ZIP_PREFIX_MAP[prefix];

  if (entry) {
    return {
      state: entry.state,
      county: entry.county,
      congressional: null,
      state_senate: null,
      state_house: null,
      municipal: entry.city,
      judicial: null,
      school: null,
      special: [],
    };
  }

  // Unknown ZIP — return minimal info rather than guessing a wrong county
  return {
    state: '',
    county: '',
    congressional: null,
    state_senate: null,
    state_house: null,
    municipal: null,
    judicial: null,
    school: null,
    special: [],
  };
}

/**
 * getVoterBallot — returns all contests + measures for the latest election,
 * with candidates and districts attached. Uses flat queries to avoid nested
 * join ambiguity, then assembles results in JavaScript. Falls back to
 * embedded demo data if the database is unreachable.
 */
export async function getVoterBallot(address: string): Promise<{
  election: Election | null;
  contests: BallotContest[];
  measures: BallotMeasure[];
  error: string | null;
}> {
  const districts = await getVoterDistricts(address);
  const cfg: RegionConfig = {
    state: districts.state,
    county: districts.county ?? districts.state,
    congressional: districts.congressional ?? 'Congressional District 1',
    state_senate: districts.state_senate ?? 'State Senate District 1',
    state_house: districts.state_house ?? 'State House District 1',
    municipal: districts.municipal ?? 'City',
    judicial: districts.judicial ?? 'Judicial Circuit',
    school: districts.school ?? 'County Schools',
  };
  sessionStorage.setItem('ballotlens_region', JSON.stringify(cfg));

  try {
    const result = await loadBallotFromDB(cfg.state);
    if (result) return result;
  } catch {
    // Database unreachable — fall through to demo data
  }
  const regionBallot = buildRegionBallot(cfg);
  return {
    election: regionBallot.election,
    contests: regionBallot.contests,
    measures: regionBallot.measures,
    error: null,
  };
}

async function loadBallotFromDB(voterState: string): Promise<{
  election: Election | null;
  contests: BallotContest[];
  measures: BallotMeasure[];
  error: string | null;
} | null> {
  const { data: elections, error: eErr } = await supabase
    .from('elections')
    .select('*')
    .order('election_date', { ascending: false })
    .limit(1);

  if (eErr) throw eErr;
  if (!elections || elections.length === 0) return null;

  const election = elections[0] as Election;

  const [contestsRes, measuresRes, districtsRes] = await Promise.all([
    supabase.from('ballot_contests')
      .select('id, election_id, district_id, office_name, contest_level, seat_description, term_length')
      .eq('election_id', election.id)
      .order('contest_level')
      .order('office_name'),
    supabase.from('ballot_measures')
      .select('*')
      .eq('election_id', election.id)
      .order('title'),
    supabase.from('districts')
      .select('id, name, district_type, state'),
  ]);

  if (contestsRes.error) throw contestsRes.error;

  const contests = contestsRes.data ?? [];
  const measures = (measuresRes.data ?? []) as BallotMeasure[];
  const districts = districtsRes.data ?? [];

  if (contests.length === 0 && measures.length === 0) return null;

  const districtMap: Record<string, District> = {};
  districts.forEach((d) => {
    districtMap[d.id] = d as District;
  });

  // Filter to contests whose districts match the voter's state.
  // Statewide contests (district_id = null) are only included if the
  // database actually has district-scoped contests for this state —
  // otherwise the DB doesn't cover this state at all and we should
  // fall back to region demo data.
  const voterStateLower = voterState.toLowerCase();
  const stateMatches = (d: District | undefined | null): boolean => {
    if (!d) return true; // statewide contest
    return (d.state ?? '').toLowerCase() === voterStateLower;
  };

  const districtScopedMatches = contests.filter((c) =>
    c.district_id && stateMatches(districtMap[c.district_id] ?? null)
  );

  // If no district-scoped contests match the voter's state, the DB
  // doesn't have data for this state — fall back to region demo data.
  if (districtScopedMatches.length === 0) return null;

  const filteredContests = contests.filter((c) => {
    if (!c.district_id) return true; // statewide — include since DB covers this state
    return stateMatches(districtMap[c.district_id] ?? null);
  });

  const contestIds = filteredContests.map((c) => c.id);
  let candidatesByContest: Record<string, Candidate[]> = {};

  if (contestIds.length > 0) {
    const { data: offices } = await supabase
      .from('candidate_offices')
      .select('candidate_id, contest_id, incumbent')
      .in('contest_id', contestIds);

    const candidateIds = (offices ?? []).map((o) => o.candidate_id);
    let candidateMap: Record<string, Candidate> = {};

    if (candidateIds.length > 0) {
      const { data: cands } = await supabase
        .from('candidates')
        .select('*')
        .in('id', candidateIds);
      (cands ?? []).forEach((c) => {
        candidateMap[c.id] = c as Candidate;
      });
    }

    (offices ?? []).forEach((o) => {
      const c = candidateMap[o.candidate_id];
      if (c) {
        if (!candidatesByContest[o.contest_id]) candidatesByContest[o.contest_id] = [];
        candidatesByContest[o.contest_id].push(c);
      }
    });
  }

  const enrichedContests: BallotContest[] = filteredContests.map((c) => ({
    ...c,
    district: c.district_id ? districtMap[c.district_id] ?? null : null,
    election,
    candidates: candidatesByContest[c.id] ?? [],
  })) as unknown as BallotContest[];

  // Also filter measures to the voter's state
  const filteredMeasures = measures.filter((m) => {
    if (!m.district_id) return true;
    return stateMatches(districtMap[m.district_id] ?? null);
  });

  return { election, contests: enrichedContests, measures: filteredMeasures, error: null };
}

export async function getElection(electionId: string): Promise<Election | null> {
  const { data } = await supabase
    .from('elections')
    .select('*')
    .eq('id', electionId)
    .maybeSingle();
  return data as Election | null;
}

export async function getElections(): Promise<Election[]> {
  const { data } = await supabase
    .from('elections')
    .select('*')
    .order('election_date', { ascending: false });
  return (data ?? []) as Election[];
}

export async function getDistricts(): Promise<District[]> {
  const { data } = await supabase.from('districts').select('*').order('name');
  return (data ?? []) as District[];
}

export function getStoredRegion(): RegionConfig | null {
  try {
    const raw = sessionStorage.getItem('ballotlens_region');
    if (!raw) return null;
    return JSON.parse(raw) as RegionConfig;
  } catch {
    return null;
  }
}

// --- helpers ---

function extractZip(input: string): string {
  const match = input.match(/\b(\d{5})\b/);
  return match ? match[1] : '';
}
