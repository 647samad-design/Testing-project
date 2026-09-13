import type {
  BallotContest, BallotMeasure, Candidate, Election, District,
} from '@/types';
import { demoElection, demoMeasures } from '@/services/demo-data';

export interface RegionConfig {
  state: string;
  county: string;
  congressional: string;
  state_senate: string;
  state_house: string;
  municipal: string;
  judicial: string;
  school: string;
}

interface RegionData {
  districts: Record<string, District>;
  candidates: Record<string, Candidate[]>;
  president: Candidate[];
  senate: Candidate[];
  house: Candidate[];
  governor: Candidate[];
  ag: Candidate[];
  stateSenate: Candidate[];
  stateHouse: Candidate[];
  countyMayor: Candidate[];
  countyCommission: Candidate[];
  cityCommission: Candidate[];
  schoolBoard: Candidate[];
  circuitJudge: Candidate[];
  countyJudge: Candidate[];
}

function mkCand(id: string, first: string, last: string, party: string, bio: string): Candidate {
  return {
    id, first_name: first, last_name: last, party, photo_url: null, bio,
    education: null, professional_background: null, previous_offices: null,
    military_service: null, public_service: null, website_url: null, is_demo: true,
  };
}

function buildRegionData(cfg: RegionConfig): RegionData {
  const stateCode = cfg.state.toLowerCase().replace(/\s/g, '-');

  const districts: Record<string, District> = {
    cong: { id: `${stateCode}-cong`, name: cfg.congressional, district_type: 'congressional', state: cfg.state },
    ss: { id: `${stateCode}-ss`, name: cfg.state_senate, district_type: 'state_senate', state: cfg.state },
    sh: { id: `${stateCode}-sh`, name: cfg.state_house, district_type: 'state_house', state: cfg.state },
    county: { id: `${stateCode}-county`, name: cfg.county, district_type: 'county', state: cfg.state },
    muni: { id: `${stateCode}-muni`, name: cfg.municipal, district_type: 'municipal', state: cfg.state },
    jud: { id: `${stateCode}-jud`, name: cfg.judicial, district_type: 'judicial', state: cfg.state },
    sch: { id: `${stateCode}-sch`, name: cfg.school, district_type: 'school', state: cfg.state },
  };

  const p = cfg.state.toLowerCase().replace(/[^a-z]/g, '');
  const suffix = (s: string) => `${p}-${s}`;

  return {
    districts,
    candidates: {},
    president: [
      mkCand(suffix('pres-1'), 'Maria', 'Conrad', 'Democratic Party', `DEMO DATA — Fictional candidate for President. Former senator from ${cfg.state} running on a platform of healthcare reform and climate action.`),
      mkCand(suffix('pres-2'), 'Robert', 'Haynes', 'Republican Party', `DEMO DATA — Fictional candidate for President. Former governor and business executive running on economic growth and national security.`),
      mkCand(suffix('pres-3'), 'Daniel', 'Voss', 'Independent', `DEMO DATA — Fictional candidate for President. Technology entrepreneur running as an independent on government reform.`),
    ],
    senate: [
      mkCand(suffix('sen-1'), 'Eleanor', 'Pike', 'Democratic Party', `DEMO DATA — Fictional candidate for U.S. Senate in ${cfg.state}. Current U.S. Representative advocating for workers' rights and education funding.`),
      mkCand(suffix('sen-2'), 'Marcus', 'Tate', 'Republican Party', `DEMO DATA — Fictional candidate for U.S. Senate in ${cfg.state}. Former state attorney general running on fiscal conservatism and border security.`),
    ],
    house: [
      mkCand(suffix('house-1'), 'Alex', 'Morgan', 'Independent', `DEMO DATA — Fictional candidate for ${cfg.congressional}. Small-business owner and former community college instructor.`),
      mkCand(suffix('house-2'), 'Taylor', 'Brooks', 'Republican Party', `DEMO DATA — Fictional candidate for ${cfg.congressional}. Current state legislator and small business advocate.`),
      mkCand(suffix('house-3'), 'Jordan', 'Rivera', 'Democratic Party', `DEMO DATA — Fictional candidate for ${cfg.congressional}. Current state legislator seeking to move to federal office.`),
    ],
    governor: [
      mkCand(suffix('gov-1'), 'Casey', 'Whitfield', 'Democratic Party', `DEMO DATA — Fictional candidate for Governor of ${cfg.state}. Mayor of a mid-size city focusing on infrastructure and education.`),
      mkCand(suffix('gov-2'), 'Morgan', 'Ellis', 'Republican Party', `DEMO DATA — Fictional candidate for Governor of ${cfg.state}. Current Lieutenant Governor running on the administration's record.`),
    ],
    ag: [
      mkCand(suffix('ag-1'), 'Drew', 'Hastings', 'Democratic Party', `DEMO DATA — Fictional candidate for Attorney General of ${cfg.state}. Civil rights attorney focused on criminal justice reform.`),
      mkCand(suffix('ag-2'), 'Sam', 'Delgado', 'Republican Party', `DEMO DATA — Fictional candidate for Attorney General of ${cfg.state}. Career prosecutor emphasizing public safety.`),
    ],
    stateSenate: [
      mkCand(suffix('ss-1'), 'Riley', 'Chen', 'Independent', `DEMO DATA — Fictional candidate for ${cfg.state_senate}. Nurse practitioner advocating for healthcare access.`),
      mkCand(suffix('ss-2'), 'Victor', 'Nash', 'Republican Party', `DEMO DATA — Fictional candidate for ${cfg.state_senate}. Small business owner focused on tax reform.`),
    ],
    stateHouse: [
      mkCand(suffix('sh-1'), 'Priya', 'Bhatt', 'Democratic Party', `DEMO DATA — Fictional candidate for ${cfg.state_house}. Community organizer and housing advocate.`),
      mkCand(suffix('sh-2'), 'Thomas', 'Reed', 'Republican Party', `DEMO DATA — Fictional candidate for ${cfg.state_house}. Former city council member focused on public safety.`),
    ],
    countyMayor: [
      mkCand(suffix('cm-1'), 'Lauren', 'Foster', 'Democratic Party', `DEMO DATA — Fictional candidate for Mayor of ${cfg.county}. Former deputy mayor with a focus on budget efficiency.`),
      mkCand(suffix('cm-2'), 'Greg', 'Marsh', 'Republican Party', `DEMO DATA — Fictional candidate for Mayor of ${cfg.county}. Business leader running on economic development.`),
    ],
    countyCommission: [
      mkCand(suffix('cc-1'), 'Jamie', 'Okafor', 'Nonpartisan', `DEMO DATA — Fictional candidate for County Commission in ${cfg.county}. Urban planner advocating for mixed-use zoning reform.`),
    ],
    cityCommission: [
      mkCand(suffix('city-1'), 'Nina', 'Castillo', 'Nonpartisan', `DEMO DATA — Fictional candidate for City Commission in ${cfg.municipal}. Neighborhood association president focused on park improvements.`),
    ],
    schoolBoard: [
      mkCand(suffix('sb-1'), 'Quinn', 'Alvarez', 'Nonpartisan', `DEMO DATA — Fictional candidate for School Board in ${cfg.school}. Parent and former teacher advocating for teacher pay and STEM curriculum.`),
    ],
    circuitJudge: [
      mkCand(suffix('cj-1'), 'Robin', 'Vasquez', 'Nonpartisan', `DEMO DATA — Fictional candidate for Circuit Court in ${cfg.judicial}. County court judge with 8 years of experience.`),
      mkCand(suffix('cj-2'), 'Pat', 'Sullivan', 'Nonpartisan', `DEMO DATA — Fictional candidate for Circuit Court in ${cfg.judicial}. Sitting circuit court judge seeking re-election with 12 years on the bench.`),
    ],
    countyJudge: [
      mkCand(suffix('dj-1'), 'Aisha', 'Bennett', 'Nonpartisan', `DEMO DATA — Fictional candidate for County Court in ${cfg.county}. Attorney with 15 years of civil litigation experience.`),
    ],
  };
}

export function buildRegionBallot(cfg: RegionConfig): {
  election: Election;
  contests: BallotContest[];
  measures: BallotMeasure[];
} {
  const r = buildRegionData(cfg);
  const eid = demoElection.id;

  const contests: BallotContest[] = [
    { id: `${cfg.state}-pres`, election_id: eid, district_id: null, office_name: 'President of the United States', contest_level: 'federal', seat_description: 'Head of the executive branch', term_length: '4 years', district: null, election: demoElection, candidates: r.president },
    { id: `${cfg.state}-senate`, election_id: eid, district_id: null, office_name: 'U.S. Senate', contest_level: 'federal', seat_description: `Statewide seat — ${cfg.state}`, term_length: '6 years', district: null, election: demoElection, candidates: r.senate },
    { id: `${cfg.state}-house`, election_id: eid, district_id: r.districts.cong.id, office_name: 'U.S. House of Representatives', contest_level: 'federal', seat_description: cfg.congressional, term_length: '2 years', district: r.districts.cong, election: demoElection, candidates: r.house },
    { id: `${cfg.state}-governor`, election_id: eid, district_id: null, office_name: 'Governor', contest_level: 'state', seat_description: `Statewide executive seat — ${cfg.state}`, term_length: '4 years', district: null, election: demoElection, candidates: r.governor },
    { id: `${cfg.state}-ag`, election_id: eid, district_id: null, office_name: 'Attorney General', contest_level: 'state', seat_description: `Statewide executive seat — ${cfg.state}`, term_length: '4 years', district: null, election: demoElection, candidates: r.ag },
    { id: `${cfg.state}-state-senate`, election_id: eid, district_id: r.districts.ss.id, office_name: 'State Senate', contest_level: 'state', seat_description: cfg.state_senate, term_length: '4 years', district: r.districts.ss, election: demoElection, candidates: r.stateSenate },
    { id: `${cfg.state}-state-house`, election_id: eid, district_id: r.districts.sh.id, office_name: 'State House', contest_level: 'state', seat_description: cfg.state_house, term_length: '2 years', district: r.districts.sh, election: demoElection, candidates: r.stateHouse },
    { id: `${cfg.state}-county-mayor`, election_id: eid, district_id: r.districts.county.id, office_name: 'County Mayor', contest_level: 'local', seat_description: `${cfg.county} executive seat`, term_length: '4 years', district: r.districts.county, election: demoElection, candidates: r.countyMayor },
    { id: `${cfg.state}-county-comm`, election_id: eid, district_id: r.districts.county.id, office_name: 'County Commission', contest_level: 'local', seat_description: `${cfg.county} seat`, term_length: '4 years', district: r.districts.county, election: demoElection, candidates: r.countyCommission },
    { id: `${cfg.state}-city-comm`, election_id: eid, district_id: r.districts.muni.id, office_name: 'City Commission', contest_level: 'local', seat_description: `${cfg.municipal} seat`, term_length: '4 years', district: r.districts.muni, election: demoElection, candidates: r.cityCommission },
    { id: `${cfg.state}-school-board`, election_id: eid, district_id: r.districts.sch.id, office_name: 'School Board', contest_level: 'local', seat_description: `${cfg.school} seat`, term_length: '4 years', district: r.districts.sch, election: demoElection, candidates: r.schoolBoard },
    { id: `${cfg.state}-circuit-judge`, election_id: eid, district_id: r.districts.jud.id, office_name: 'Circuit Court Judge', contest_level: 'judicial', seat_description: `${cfg.judicial} — Group 12`, term_length: '6 years', district: r.districts.jud, election: demoElection, candidates: r.circuitJudge },
    { id: `${cfg.state}-county-judge`, election_id: eid, district_id: r.districts.jud.id, office_name: 'County Court Judge', contest_level: 'judicial', seat_description: `${cfg.county} — Group 4`, term_length: '6 years', district: r.districts.jud, election: demoElection, candidates: r.countyJudge },
  ];

  const measures: BallotMeasure[] = [
    { id: `${cfg.state}-amend-1`, election_id: eid, district_id: null, title: `${cfg.state} Amendment: Land Conservation Fund`, measure_type: 'amendment', summary: `DEMO DATA — Fictional constitutional amendment for ${cfg.state} that would establish a dedicated trust fund for state conservation land acquisition.`, full_text_url: null, arguments_for: 'Supporters argue it preserves natural habitats without raising taxes.', arguments_against: 'Opponents argue it restricts future legislative budgeting flexibility.', plain_english_summary: 'This amendment would create a special fund to buy and protect natural areas like forests, wetlands, and parks. The money would come from a small tax on real estate transactions.', eli5_explanation: 'Imagine a piggy bank just for buying plants for a garden. Every time someone sells a house, a tiny bit of tax money goes in. The state uses it to buy parks so they stay beautiful.' },
    { id: `${cfg.state}-referendum-1`, election_id: eid, district_id: r.districts.county.id, title: `${cfg.county} Referendum: Transit Infrastructure Bond`, measure_type: 'local', summary: `DEMO DATA — Fictional ${cfg.county} referendum authorizing $500 million in bonds for public transit improvements.`, full_text_url: null, arguments_for: 'Supporters argue it will reduce congestion and modernize infrastructure.', arguments_against: 'Opponents argue it increases long-term county debt and property tax obligations.', plain_english_summary: 'This referendum would let the county borrow $500 million to improve public transportation — new bus routes, repaired train stations, and bike lanes. The county pays back the loan over 20 years.', eli5_explanation: 'Like borrowing money to fix the family car so everyone can get to work and school. The county borrows money to make buses and trains better, paying it back slowly over many years.' },
  ];

  return { election: demoElection, contests, measures };
}

export function getAllRegionCandidates(cfg: RegionConfig): Candidate[] {
  const r = buildRegionData(cfg);
  return [
    ...r.president, ...r.senate, ...r.house,
    ...r.governor, ...r.ag,
    ...r.stateSenate, ...r.stateHouse,
    ...r.countyMayor, ...r.countyCommission, ...r.cityCommission,
    ...r.schoolBoard,
    ...r.circuitJudge, ...r.countyJudge,
  ];
}

export const ALL_REGION_CONFIGS: RegionConfig[] = [
  { state: 'Florida', county: 'Orange County', congressional: 'Congressional District 10', state_senate: 'State Senate District 15', state_house: 'State House District 45', municipal: 'City of Orlando', judicial: '9th Judicial Circuit', school: 'Orange County Public Schools' },
  { state: 'New York', county: 'New York County', congressional: 'Congressional District 12', state_senate: 'State Senate District 28', state_house: 'State Assembly District 66', municipal: 'City of New York', judicial: '1st Judicial District', school: 'New York City Public Schools' },
  { state: 'California', county: 'Los Angeles County', congressional: 'Congressional District 34', state_senate: 'State Senate District 24', state_house: 'State Assembly District 52', municipal: 'City of Los Angeles', judicial: 'Los Angeles County Superior Court', school: 'Los Angeles Unified School District' },
  { state: 'Illinois', county: 'Cook County', congressional: 'Congressional District 7', state_senate: 'State Senate District 13', state_house: 'State House District 9', municipal: 'City of Chicago', judicial: 'Cook County Circuit Court', school: 'Chicago Public Schools' },
  { state: 'Texas', county: 'Travis County', congressional: 'Congressional District 37', state_senate: 'State Senate District 14', state_house: 'State House District 46', municipal: 'City of Austin', judicial: '3rd Court of Appeals', school: 'Austin ISD' },
  { state: 'Colorado', county: 'Denver County', congressional: 'Congressional District 1', state_senate: 'State Senate District 34', state_house: 'State House District 4', municipal: 'City and County of Denver', judicial: '2nd Judicial District', school: 'Denver Public Schools' },
  { state: 'Washington', county: 'King County', congressional: 'Congressional District 7', state_senate: 'State Senate District 43', state_house: 'State House District 43', municipal: 'City of Seattle', judicial: 'King County Superior Court', school: 'Seattle Public Schools' },
  { state: 'Georgia', county: 'Fulton County', congressional: 'Congressional District 5', state_senate: 'State Senate District 39', state_house: 'State House District 60', municipal: 'City of Atlanta', judicial: 'Atlanta Judicial Circuit', school: 'Atlanta Public Schools' },
];

export function getAllStatesCandidates(): Candidate[] {
  return ALL_REGION_CONFIGS.flatMap(getAllRegionCandidates);
}

export function getAllStatesBallots(): { contests: BallotContest[]; measures: BallotMeasure[] } {
  const contests: BallotContest[] = [];
  const measures: BallotMeasure[] = [];
  for (const cfg of ALL_REGION_CONFIGS) {
    const ballot = buildRegionBallot(cfg);
    contests.push(...ballot.contests);
    measures.push(...ballot.measures);
  }
  return { contests, measures };
}
