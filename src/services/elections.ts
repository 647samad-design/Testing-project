import { supabase } from '@/lib/supabase';
import {
  demoElection, demoContests, demoMeasures,
} from '@/services/demo-data';
import { buildRegionBallot, type RegionConfig } from '@/services/regions';
import { fetchAllRows, fetchInChunks } from '@/lib/fetch-all';
import { isDemoMode } from '@/lib/demo-mode';
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
    // zip_code has no UNIQUE constraint at the database level -- some real
    // ZIP codes genuinely span more than one county/district, so more than
    // one row for the same zip_code is a legitimate possibility, not just
    // a data error. .maybeSingle() throws a "multiple rows" error in that
    // case, which would silently break the ballot lookup for that address
    // (the single most core feature of the platform) with no indication
    // to the user of what went wrong. .limit(1) takes the first match
    // instead of failing outright.
    const { data: rows, error } = await supabase
      .from('zip_districts')
      .select('*')
      .eq('zip_code', zip)
      .limit(1);
    const data = rows?.[0] ?? null;

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
        district_ids: districtIds,
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
  scope?: BallotScope;
  /** True when this is the generated sample ballot (no real data for the area). */
  isDemo?: boolean;
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
    const result = await loadBallotFromDB(cfg.state, districts.district_ids ?? []);
    if (result) {
      const isDemo = result.contests.some((c) => (c.candidates ?? []).some((cand) => cand.is_demo));
      return { ...result, isDemo };
    }
  } catch {
    // The database didn't answer. Say so instead of presenting a generated
    // sample ballot, which during an outage told Florida voters "we don't
    // cover your area". Samples on failure only in demo mode.
    if (!isDemoMode()) {
      return { election: null, contests: [], measures: [], error: "We couldn’t load your ballot right now. Please check your connection and try again in a moment." };
    }
  }
  const regionBallot = buildRegionBallot(cfg);
  return {
    election: regionBallot.election,
    contests: regionBallot.contests,
    measures: regionBallot.measures,
    error: null,
    isDemo: true,
  };
}

export type BallotScope = 'district' | 'state';

async function loadBallotFromDB(voterState: string, voterDistrictIds: string[]): Promise<{
  election: Election | null;
  contests: BallotContest[];
  measures: BallotMeasure[];
  error: string | null;
  scope: BallotScope;
} | null> {
  const { data: elections, error: eErr } = await supabase
    .from('elections')
    .select('*')
    .order('election_date', { ascending: false })
    .limit(1);

  if (eErr) throw eErr;
  if (!elections || elections.length === 0) return null;

  const election = elections[0] as Election;

  // Every query here is scoped on the SERVER and paged. This function used to
  // load every race of the election and every district in the database, then
  // filter in JavaScript -- and PostgREST caps each response at 1,000 rows
  // without any error. Verified against a real PostgREST with that cap: 1,621
  // races -> 1,000 returned, 1,735 districts -> 1,000 returned. Past that size
  // races silently vanished from ballots, and districts missing from the map
  // were treated as "statewide", pulling other states' races onto the ballot.
  const scope: BallotScope = voterDistrictIds.length > 0 ? 'district' : 'state';
  const contestCols = 'id, election_id, district_id, office_name, contest_level, seat_description, term_length';
  const districtCols = 'id, name, district_type, state';

  type ContestRow = { id: string; election_id: string; district_id: string | null; office_name: string; contest_level: string; seat_description: string | null; term_length: string | null };
  type WithDistrict<T> = T & { district: District };

  // Does the database cover this state at all? (Otherwise fall back to the
  // region demo ballot, as before.)
  const { count: stateCoverage, error: covErr } = await supabase
    .from('ballot_contests')
    .select('id, district:districts!inner(state)', { count: 'exact', head: true })
    .eq('election_id', election.id)
    .ilike('district.state', voterState);
  if (covErr) throw covErr;
  if (!stateCoverage) return null;

  const statewideContests = await fetchAllRows<ContestRow>((from, to) =>
    supabase.from('ballot_contests').select(contestCols)
      .eq('election_id', election.id).is('district_id', null)
      .order('id').range(from, to));

  let scopedContests: ContestRow[];
  let scopedDistricts: District[];
  if (scope === 'district') {
    scopedContests = await fetchInChunks<ContestRow>(voterDistrictIds, (chunk) =>
      supabase.from('ballot_contests').select(contestCols)
        .eq('election_id', election.id).in('district_id', chunk));
    scopedDistricts = await fetchInChunks<District>(voterDistrictIds, (chunk) =>
      supabase.from('districts').select(districtCols).in('id', chunk));
  } else {
    const rows = await fetchAllRows<WithDistrict<ContestRow>>((from, to) =>
      supabase.from('ballot_contests').select(`${contestCols}, district:districts!inner(${districtCols})`)
        .eq('election_id', election.id).ilike('district.state', voterState)
        .order('id').range(from, to));
    scopedContests = rows.map(({ district: _d, ...c }) => c);
    scopedDistricts = rows.map((r) => r.district);
  }

  type MeasureRow = BallotMeasure & { district: District | null };
  const measureRows = await fetchAllRows<MeasureRow>((from, to) =>
    supabase.from('ballot_measures').select(`*, district:districts(${districtCols})`)
      .eq('election_id', election.id).order('id').range(from, to));
  const ownDistricts = new Set(voterDistrictIds);
  const filteredMeasures: BallotMeasure[] = measureRows
    .filter((m) => {
      if (!m.district_id) return true; // statewide
      return scope === 'district'
        ? ownDistricts.has(m.district_id)
        : (m.district?.state ?? '').toLowerCase() === voterState.toLowerCase();
    })
    .map(({ district: _d, ...m }) => m as BallotMeasure);

  const districtMap: Record<string, District> = {};
  scopedDistricts.forEach((d) => { districtMap[d.id] = d; });

  const filteredContests = [...scopedContests, ...statewideContests].sort((a, b) =>
    a.contest_level.localeCompare(b.contest_level) || a.office_name.localeCompare(b.office_name));

  const contestIds = filteredContests.map((c) => c.id);
  const candidatesByContest: Record<string, Candidate[]> = {};

  if (contestIds.length > 0) {
    const offices = await fetchInChunks<{ candidate_id: string; contest_id: string; incumbent: boolean }>(contestIds, (chunk) =>
      supabase.from('candidate_offices').select('candidate_id, contest_id, incumbent').in('contest_id', chunk));

    const candidateMap: Record<string, Candidate> = {};
    const cands = await fetchInChunks<Candidate>(offices.map((o) => o.candidate_id), (chunk) =>
      // Sample (is_demo) candidates never appear on a real ballot outside demo mode.
      isDemoMode()
        ? supabase.from('candidates').select('*').in('id', chunk)
        : supabase.from('candidates').select('*').in('id', chunk).eq('is_demo', false));
    cands.forEach((c) => { candidateMap[c.id] = c; });

    offices.forEach((o) => {
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

  return { election, contests: enrichedContests, measures: filteredMeasures, error: null, scope };
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
  return fetchAllRows<District>((from, to) =>
    supabase.from('districts').select('*').order('name').order('id').range(from, to)).catch(() => []);
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
