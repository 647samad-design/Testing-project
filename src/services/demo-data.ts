import type {
  Election, BallotContest, BallotMeasure, Candidate, District, Issue,
  NewsArticle, Video, SocialPost,
} from '@/types';

const ELECTION_ID = '849a8215-ec3b-49c3-af84-3ede7a3ee2ab';

export const demoElection: Election = {
  id: ELECTION_ID,
  name: '2026 General Election',
  election_date: '2026-11-03',
  description: 'DEMO DATA — General election for federal, state, county, municipal, judicial and school races, plus statewide and local ballot measures.',
};

const districts: Record<string, District> = {
  cong: { id: '42de5ffe-68ff-46a6-95e7-4f947dea0bc9', name: 'Congressional District 10', district_type: 'congressional', state: 'Florida' },
  ss: { id: '3efdf1a3-8438-4bd3-bade-6230efabc22d', name: 'State Senate District 15', district_type: 'state_senate', state: 'Florida' },
  sh: { id: '94ab31c3-e824-422b-b09d-34bc828af4ea', name: 'State House District 45', district_type: 'state_house', state: 'Florida' },
  county: { id: '8dc119d3-a9bb-4adb-94ae-b0f7cd35c612', name: 'Miami-Dade County', district_type: 'county', state: 'Florida' },
  muni: { id: 'c1f9b1a5-0167-46d6-b2f5-bc1ec8ebb2f4', name: 'City of Miami', district_type: 'municipal', state: 'Florida' },
  jud: { id: 'c4f7a9ac-c87e-4db4-b9f7-f3625d85ba1f', name: '11th Judicial Circuit', district_type: 'judicial', state: 'Florida' },
  sch: { id: 'f05f12e5-e543-4d79-b965-686420e5856f', name: 'Miami-Dade County Public Schools', district_type: 'school', state: 'Florida' },
};

export const demoDistricts: District[] = Object.values(districts);

function mkCand(id: string, first: string, last: string, party: string, bio: string): Candidate {
  return {
    id, first_name: first, last_name: last, party, photo_url: null, bio,
    education: null, professional_background: null, previous_offices: null,
    military_service: null, public_service: null, website_url: null, is_demo: true,
  };
}

export const demoCandidates: Candidate[] = [
  mkCand('55c9586b-1025-4fe6-aee2-ec50d4e62bef', 'Alex', 'Morgan', 'Independent', 'DEMO DATA — Fictional candidate created for illustration only. Alex Morgan is a small-business owner and former community college instructor running for Florida\'s 10th Congressional District.'),
  mkCand('32191e16-7606-4f6b-acf0-89599f7f311c', 'Taylor', 'Brooks', 'Republican Party', 'DEMO DATA — Fictional candidate created for illustration only. Taylor Brooks is a current state legislator and small business advocate.'),
  mkCand('f07ff45a-2884-4770-b4fe-cf474ec0b2dd', 'Jordan', 'Rivera', 'Democratic Party', 'DEMO DATA — Fictional candidate created for illustration only. Jordan Rivera is a current state legislator seeking to move to federal office.'),
  mkCand('0502798c-5341-46f4-9c24-b5acefcd6015', 'Casey', 'Whitfield', 'Democratic Party', 'DEMO DATA — Fictional candidate created for illustration only. Casey Whitfield is the mayor of a mid-size Florida city.'),
  mkCand('13aa2e14-eeae-4804-b5d9-48938e911292', 'Morgan', 'Ellis', 'Republican Party', 'DEMO DATA — Fictional candidate created for illustration only. Morgan Ellis currently serves as Lieutenant Governor.'),
  mkCand('711bd741-779a-4190-9575-6e0ace2f51d9', 'Riley', 'Chen', 'Independent', 'DEMO DATA — Fictional candidate created for illustration only. Riley Chen is a nurse practitioner running for State Senate.'),
  mkCand('def16c3a-d399-472e-a910-95f118442f30', 'Drew', 'Hastings', 'Democratic Party', 'DEMO DATA — Fictional candidate created for illustration only. Drew Hastings is a civil rights attorney running for Attorney General.'),
  mkCand('346d48ce-7118-4f27-b947-c64934d8e6fc', 'Sam', 'Delgado', 'Republican Party', 'DEMO DATA — Fictional candidate created for illustration only. Sam Delgado is a career prosecutor running for Attorney General.'),
  mkCand('204bb535-41af-46c4-90e9-f72d3bf3e793', 'Jamie', 'Okafor', 'Nonpartisan', 'DEMO DATA — Fictional candidate created for illustration only. Jamie Okafor is a local urban planner running for County Commission.'),
  mkCand('f04705a3-7c59-4dc1-a38a-edfa5eebedfc', 'Quinn', 'Alvarez', 'Nonpartisan', 'DEMO DATA — Fictional candidate created for illustration only. Quinn Alvarez is a parent and former teacher running for School Board.'),
  mkCand('54491b4a-a900-491d-b283-8f0eaa72ffe7', 'Robin', 'Vasquez', 'Nonpartisan', 'DEMO DATA — Fictional candidate created for illustration only. Robin Vasquez is a county court judge running for circuit court.'),
  mkCand('98418374-9268-4edd-b7ba-d5dfcf9f934d', 'Pat', 'Sullivan', 'Nonpartisan', 'DEMO DATA — Fictional candidate created for illustration only. Pat Sullivan is a sitting circuit court judge seeking re-election.'),
];

const candById: Record<string, Candidate> = {};
demoCandidates.forEach((c) => { candById[c.id] = c; });

const contestCandidates: Record<string, Candidate[]> = {
  'dfe70a58-cd7b-4f7e-9596-c09bec2877bb': [],
  '717a654d-d1f8-459d-89aa-601a1a153316': [],
  '19be5df4-4761-4e79-a6e9-cabb3e582fd1': [candById['55c9586b-1025-4fe6-aee2-ec50d4e62bef'], candById['32191e16-7606-4f6b-acf0-89599f7f311c'], candById['f07ff45a-2884-4770-b4fe-cf474ec0b2dd']],
  '53f3ddce-85b8-4d18-b810-8277e7767274': [candById['0502798c-5341-46f4-9c24-b5acefcd6015'], candById['13aa2e14-eeae-4804-b5d9-48938e911292']],
  '94c3bb19-5498-415d-ac6e-ab73c2d001bb': [candById['def16c3a-d399-472e-a910-95f118442f30'], candById['346d48ce-7118-4f27-b947-c64934d8e6fc']],
  '253c53e3-2246-471c-896d-8d5684ded531': [candById['711bd741-779a-4190-9575-6e0ace2f51d9']],
  '9cfd02d9-815a-4f9d-b584-23b1fa535755': [],
  '6f02ba9a-1939-43d3-a4a8-40f1608f1c8f': [],
  '063457d7-9c23-4582-8e3d-c636ec979824': [candById['204bb535-41af-46c4-90e9-f72d3bf3e793']],
  '7cd67f70-0285-4ea5-898b-0f790dd29475': [],
  '8e2819d6-64a3-467c-ae63-373bdd91f31b': [candById['f04705a3-7c59-4dc1-a38a-edfa5eebedfc']],
  '609792b9-3749-4308-bb7d-684651f26549': [candById['54491b4a-a900-491d-b283-8f0eaa72ffe7'], candById['98418374-9268-4edd-b7ba-d5dfcf9f934d']],
  '288be0f6-3c07-4d9f-ba87-c21b35834b6a': [],
};

export const demoContests: BallotContest[] = [
  { id: 'dfe70a58-cd7b-4f7e-9596-c09bec2877bb', election_id: ELECTION_ID, district_id: null, office_name: 'President of the United States', contest_level: 'federal', seat_description: 'Head of the executive branch', term_length: '4 years', district: null, election: demoElection, candidates: contestCandidates['dfe70a58-cd7b-4f7e-9596-c09bec2877bb'] },
  { id: '717a654d-d1f8-459d-89aa-601a1a153316', election_id: ELECTION_ID, district_id: null, office_name: 'U.S. Senate', contest_level: 'federal', seat_description: 'Statewide seat', term_length: '6 years', district: null, election: demoElection, candidates: contestCandidates['717a654d-d1f8-459d-89aa-601a1a153316'] },
  { id: '19be5df4-4761-4e79-a6e9-cabb3e582fd1', election_id: ELECTION_ID, district_id: districts.cong.id, office_name: 'U.S. House of Representatives', contest_level: 'federal', seat_description: 'District 10 seat', term_length: '2 years', district: districts.cong, election: demoElection, candidates: contestCandidates['19be5df4-4761-4e79-a6e9-cabb3e582fd1'] },
  { id: '53f3ddce-85b8-4d18-b810-8277e7767274', election_id: ELECTION_ID, district_id: null, office_name: 'Governor', contest_level: 'state', seat_description: 'Statewide executive seat', term_length: '4 years', district: null, election: demoElection, candidates: contestCandidates['53f3ddce-85b8-4d18-b810-8277e7767274'] },
  { id: '94c3bb19-5498-415d-ac6e-ab73c2d001bb', election_id: ELECTION_ID, district_id: null, office_name: 'Attorney General', contest_level: 'state', seat_description: 'Statewide executive seat', term_length: '4 years', district: null, election: demoElection, candidates: contestCandidates['94c3bb19-5498-415d-ac6e-ab73c2d001bb'] },
  { id: '253c53e3-2246-471c-896d-8d5684ded531', election_id: ELECTION_ID, district_id: districts.ss.id, office_name: 'State Senate', contest_level: 'state', seat_description: 'District 15 seat', term_length: '4 years', district: districts.ss, election: demoElection, candidates: contestCandidates['253c53e3-2246-471c-896d-8d5684ded531'] },
  { id: '9cfd02d9-815a-4f9d-b584-23b1fa535755', election_id: ELECTION_ID, district_id: districts.sh.id, office_name: 'State House', contest_level: 'state', seat_description: 'District 45 seat', term_length: '2 years', district: districts.sh, election: demoElection, candidates: contestCandidates['9cfd02d9-815a-4f9d-b584-23b1fa535755'] },
  { id: '6f02ba9a-1939-43d3-a4a8-40f1608f1c8f', election_id: ELECTION_ID, district_id: districts.county.id, office_name: 'Mayor', contest_level: 'local', seat_description: 'County executive seat', term_length: '4 years', district: districts.county, election: demoElection, candidates: contestCandidates['6f02ba9a-1939-43d3-a4a8-40f1608f1c8f'] },
  { id: '063457d7-9c23-4582-8e3d-c636ec979824', election_id: ELECTION_ID, district_id: districts.county.id, office_name: 'County Commission', contest_level: 'local', seat_description: 'District 7 seat', term_length: '4 years', district: districts.county, election: demoElection, candidates: contestCandidates['063457d7-9c23-4582-8e3d-c636ec979824'] },
  { id: '7cd67f70-0285-4ea5-898b-0f790dd29475', election_id: ELECTION_ID, district_id: districts.muni.id, office_name: 'City Commission', contest_level: 'local', seat_description: 'Citywide seat', term_length: '4 years', district: districts.muni, election: demoElection, candidates: contestCandidates['7cd67f70-0285-4ea5-898b-0f790dd29475'] },
  { id: '8e2819d6-64a3-467c-ae63-373bdd91f31b', election_id: ELECTION_ID, district_id: districts.sch.id, office_name: 'School Board', contest_level: 'local', seat_description: 'District 3 seat', term_length: '4 years', district: districts.sch, election: demoElection, candidates: contestCandidates['8e2819d6-64a3-467c-ae63-373bdd91f31b'] },
  { id: '609792b9-3749-4308-bb7d-684651f26549', election_id: ELECTION_ID, district_id: districts.jud.id, office_name: 'Circuit Court Judge', contest_level: 'judicial', seat_description: 'Group 12', term_length: '6 years', district: districts.jud, election: demoElection, candidates: contestCandidates['609792b9-3749-4308-bb7d-684651f26549'] },
  { id: '288be0f6-3c07-4d9f-ba87-c21b35834b6a', election_id: ELECTION_ID, district_id: districts.jud.id, office_name: 'County Court Judge', contest_level: 'judicial', seat_description: 'Group 4', term_length: '6 years', district: districts.jud, election: demoElection, candidates: contestCandidates['288be0f6-3c07-4d9f-ba87-c21b35834b6a'] },
];

export const demoMeasures: BallotMeasure[] = [
  { id: 'c173544d-8109-4276-8d84-2d9b2f086e67', election_id: ELECTION_ID, district_id: null, title: 'Amendment 1: State Land Conservation Fund', measure_type: 'amendment', summary: 'DEMO DATA — Fictional constitutional amendment that would establish a dedicated trust fund for state conservation land acquisition using a portion of documentary stamp tax revenue.', full_text_url: null, arguments_for: 'Supporters argue it preserves natural habitats and water resources without raising taxes.', arguments_against: 'Opponents argue it restricts future legislative budgeting flexibility.', plain_english_summary: 'This amendment would create a special fund to buy and protect natural areas like forests, wetlands, and parks. The money would come from a small tax on real estate transactions. Once the money is in the fund, it can only be used for conservation — not for other government spending.', eli5_explanation: 'Imagine you have a piggy bank just for buying plants for your garden. Every time someone sells a house, a tiny bit of the tax money goes into this piggy bank. Then the state uses it to buy forests and parks so they stay beautiful and aren\'t turned into parking lots or buildings. The money can ONLY be used for protecting nature.' },
  { id: '196aa3d2-9897-40da-b831-788003449f1a', election_id: ELECTION_ID, district_id: districts.county.id, title: 'Local Referendum: Transit Infrastructure Bond', measure_type: 'local', summary: 'DEMO DATA — Fictional county referendum authorizing $500 million in general obligation bonds for public transit improvements.', full_text_url: null, arguments_for: 'Supporters argue it will reduce congestion and modernize aging infrastructure.', arguments_against: 'Opponents argue it increases long-term county debt and property tax obligations.', plain_english_summary: 'This referendum would let the county borrow $500 million to improve public transportation — building new bus routes, repairing train stations, and adding bike lanes. The county would pay back the loan over 20 years using a small increase in property taxes.', eli5_explanation: 'Think of it like your family borrowing money to fix the car so everyone can get to work and school. The county wants to borrow money to make buses and trains better so people can get around more easily. They\'ll pay it back slowly over many years, and it might cost homeowners a little more in taxes each year.' },
];

export const demoIssues: Issue[] = [
  { id: 'issue-healthcare', name: 'Healthcare', slug: 'healthcare', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-education', name: 'Education', slug: 'education', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-economy', name: 'Economy & Jobs', slug: 'economy-jobs', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-environment', name: 'Environment & Climate', slug: 'environment-climate', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-public-safety', name: 'Public Safety & Criminal Justice', slug: 'public-safety-criminal-justice', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-immigration', name: 'Immigration', slug: 'immigration', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-housing', name: 'Housing & Homelessness', slug: 'housing-homelessness', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-infrastructure', name: 'Infrastructure & Transportation', slug: 'infrastructure-transportation', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-civil-rights', name: 'Civil Rights & Liberties', slug: 'civil-rights-liberties', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-foreign-policy', name: 'Foreign Policy & National Security', slug: 'foreign-policy-national-security', category: 'Foreign Policy', is_custom: false, created_by: null },
  { id: 'issue-elections', name: 'Elections & Voting Rights', slug: 'elections-voting-rights', category: 'Democracy', is_custom: false, created_by: null },
  { id: 'issue-government', name: 'Government Reform', slug: 'government-reform', category: 'Democracy', is_custom: false, created_by: null },
  { id: 'issue-cost-of-living', name: 'Cost of Living', slug: 'cost-of-living', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-gun-violence', name: 'Gun Violence', slug: 'gun-violence', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-abortion', name: 'Abortion & Reproductive Rights', slug: 'abortion-reproductive-rights', category: 'Domestic Policy', is_custom: false, created_by: null },
  { id: 'issue-dark-money', name: 'Dark Money & Campaign Finance', slug: 'dark-money-campaign-finance', category: 'Democracy', is_custom: false, created_by: null },
  { id: 'issue-political-division', name: 'Political Division & Polarization', slug: 'political-division-polarization', category: 'Democracy', is_custom: false, created_by: null },
];

export function getDemoContestById(id: string): BallotContest | null {
  return demoContests.find((c) => c.id === id) ?? null;
}

export function getDemoMeasureById(id: string): BallotMeasure | null {
  return demoMeasures.find((m) => m.id === id) ?? null;
}

const now = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function mkNews(id: string, candId: string, title: string, publisher: string, summary: string, category: string, articleType: string, daysOld: number): NewsArticle {
  return {
    id, candidate_id: candId, issue_id: null, title,
    url: `https://example.com/news/${id}`,
    publisher, article_type: articleType as NewsArticle['article_type'],
    media_category: category as NewsArticle['media_category'],
    summary, published_date: daysAgo(daysOld),
    candidate: candById[candId] ?? null,
  };
}

function mkVideo(id: string, candId: string, title: string, publisher: string, videoType: string, daysOld: number): Video {
  return {
    id, candidate_id: candId, title,
    url: `https://example.com/video/${id}`,
    thumbnail_url: null, video_type: videoType,
    publisher, description: null, published_date: daysAgo(daysOld),
    candidate: candById[candId] ?? null,
  };
}

function mkSocial(id: string, candId: string, platform: string, content: string, daysOld: number): SocialPost {
  return {
    id, candidate_id: candId, platform, content,
    url: `https://${platform.toLowerCase()}.com/post/${id}`,
    posted_date: daysAgo(daysOld),
    candidate: candById[candId] ?? null,
  };
}

export const demoNewsArticles: NewsArticle[] = [
  mkNews('n-001', '55c9586b-1025-4fe6-aee2-ec50d4e62bef', 'Alex Morgan launches congressional campaign in District 10', 'Miami Herald', 'DEMO DATA — Fictional article. Alex Morgan formally announced their candidacy for Florida\'s 10th Congressional District at a rally in Orlando.', 'news', 'reporting', 5),
  mkNews('n-002', '55c9586b-1025-4fe6-aee2-ec50d4e62bef', 'Morgan proposes small-business tax reform plan', 'Orlando Sentinel', 'DEMO DATA — Fictional article. The candidate outlined a plan to simplify tax filing for businesses with fewer than 50 employees.', 'local_news', 'reporting', 3),
  mkNews('n-003', '55c9586b-1025-4fe6-aee2-ec50d4e62bef', 'Opinion: Morgan is the independent voice District 10 needs', 'Tampa Bay Times', 'DEMO DATA — Fictional opinion piece arguing that an independent candidate can break partisan gridlock.', 'news', 'opinion', 8),

  mkNews('n-004', '32191e16-7606-4f6b-acf0-89599f7f311c', 'Taylor Brooks pushes for deregulation in state legislature', 'Florida Politics', 'DEMO DATA — Fictional article. State legislator Taylor Brooks filed three bills aimed at reducing business regulations.', 'news', 'reporting', 4),
  mkNews('n-005', '32191e16-7606-4f6b-acf0-89599f7f311c', 'Brooks faces questions about campaign finance records', 'Tallahassee Democrat', 'DEMO DATA — Fictional investigation. A watchdog group raised questions about late filings in Brooks\'s campaign finance reports.', 'investigation', 'reporting', 12),
  mkNews('n-006', '32191e16-7606-4f6b-acf0-89599f7f311c', 'Brooks releases first TV ad of congressional race', 'News4Jax', 'DEMO DATA — Fictional campaign material. The 30-second spot focuses on Brooks\'s record on small business issues.', 'news', 'campaign_material', 2),

  mkNews('n-007', 'f07ff45a-2884-4770-b4fe-cf474ec0b2dd', 'Jordan Rivera champions healthcare access expansion', 'Sun Sentinel', 'DEMO DATA — Fictional article. Rivera proposed expanding state health insurance coverage to gig economy workers.', 'news', 'reporting', 6),
  mkNews('n-008', 'f07ff45a-2884-4770-b4fe-cf474ec0b2dd', 'Rivera and Brooks clash over housing policy at forum', 'Orlando Sentinel', 'DEMO DATA — Fictional article. The two candidates for Congress debated affordable housing funding at a community forum.', 'local_news', 'reporting', 1),
  mkNews('n-009', 'f07ff45a-2884-4770-b4fe-cf474ec0b2dd', 'Opinion: Rivera\'s voting record tells a different story', 'Florida Today', 'DEMO DATA — Fictional opinion piece critiquing Rivera\'s legislative voting patterns.', 'news', 'opinion', 9),

  mkNews('n-010', '0502798c-5341-46f4-9c24-b5acefcd6015', 'Casey Whitfield announces gubernatorial run', 'Tampa Bay Times', 'DEMO DATA — Fictional article. Mayor Whitfield announced a campaign for governor focusing on infrastructure and education.', 'news', 'reporting', 15),
  mkNews('n-011', '0502798c-5341-46f4-9c24-b5acefcd6015', 'Whitfield unveils statewide transit plan', 'Miami Herald', 'DEMO DATA — Fictional article. The gubernatorial candidate proposed a $2 billion transit modernization initiative.', 'news', 'reporting', 7),
  mkNews('n-012', '0502798c-5341-46f4-9c24-b5acefcd6015', 'Investigation: Whitfield\'s city contracts under scrutiny', 'Florida Center for Investigative Reporting', 'DEMO DATA — Fictional investigation examining city contracting practices during Whitfield\'s mayoral tenure.', 'investigation', 'reporting', 10),

  mkNews('n-013', '13aa2e14-eeae-4804-b5d9-48938e911292', 'Morgan Ellis defends administration\'s education budget', 'News4Jax', 'DEMO DATA — Fictional article. Lieutenant Governor Ellis defended increased education spending in the state budget.', 'news', 'reporting', 4),
  mkNews('n-014', '13aa2e14-eeae-4804-b5d9-48938e911292', 'Ellis and Whitfield trade barbs over economic policy', 'Florida Politics', 'DEMO DATA — Fictional article. The two gubernatorial candidates clashed over tax policy in a televised exchange.', 'news', 'reporting', 3),

  mkNews('n-015', 'def16c3a-d399-472e-a910-95f118442f30', 'Drew Hastings files suit over voting access', 'Tallahassee Democrat', 'DEMO DATA — Fictional article. Civil rights attorney Hastings filed a lawsuit challenging absentee ballot restrictions.', 'news', 'reporting', 6),
  mkNews('n-016', 'def16c3a-d399-472e-a910-95f118442f30', 'Hastings campaign focuses on criminal justice reform', 'Sun Sentinel', 'DEMO DATA — Fictional article. The AG candidate laid out a plan to reduce mandatory minimum sentences.', 'local_news', 'reporting', 5),

  mkNews('n-017', '346d48ce-7118-4f27-b947-c64934d8e6fc', 'Sam Delgado announces bid for Attorney General', 'Florida Politics', 'DEMO DATA — Fictional article. Career prosecutor Delgado launched his campaign emphasizing public safety.', 'news', 'reporting', 14),
  mkNews('n-018', '346d48ce-7118-4f27-b947-c64934d8e6fc', 'Delgado proposes opioid crisis task force', 'Orlando Sentinel', 'DEMO DATA — Fictional article. The AG candidate proposed a statewide task force to combat the opioid epidemic.', 'news', 'reporting', 7),

  mkNews('n-019', '711bd741-779a-4190-9575-6e0ace2f51d9', 'Riley Chen enters State Senate race as independent', 'Miami Herald', 'DEMO DATA — Fictional article. Nurse practitioner Riley Chen launched an independent campaign for State Senate District 15.', 'local_news', 'reporting', 5),
  mkNews('n-020', '711bd741-779a-4190-9575-6e0ace2f51d9', 'Chen advocates for healthcare workforce expansion', 'Tampa Bay Times', 'DEMO DATA — Fictional article. The candidate proposed incentives to address nursing shortages statewide.', 'news', 'reporting', 3),

  mkNews('n-021', '204bb535-41af-46c4-90e9-f72d3bf3e793', 'Jamie Okafor runs on urban planning reform', 'Orlando Sentinel', 'DEMO DATA — Fictional article. County commission candidate Okafor proposed updating zoning laws to allow more mixed-use development.', 'local_news', 'reporting', 4),
  mkNews('n-022', '204bb535-41af-46c4-90e9-f72d3bf3e793', 'Okafor launches community engagement initiative', 'Florida Today', 'DEMO DATA — Fictional article. The candidate started a series of neighborhood town halls to gather constituent input.', 'local_news', 'reporting', 2),

  mkNews('n-023', 'f04705a3-7c59-4dc1-a38a-edfa5eebedfc', 'Quinn Alvarez advocates for teacher pay raises', 'Sun Sentinel', 'DEMO DATA — Fictional article. School board candidate Alvarez proposed a 10% teacher salary increase funded by budget reallocation.', 'local_news', 'reporting', 6),
  mkNews('n-024', 'f04705a3-7c59-4dc1-a38a-edfa5eebedfc', 'Alvarez pushes for expanded STEM curriculum', 'Miami Herald', 'DEMO DATA — Fictional article. The candidate outlined a plan to add computer science to all middle school curricula.', 'local_news', 'reporting', 3),

  mkNews('n-025', '54491b4a-a900-491d-b283-8f0eaa72ffe7', 'Robin Vasquez seeks elevation to circuit court', 'Daily Business Review', 'DEMO DATA — Fictional article. County court judge Vasquez announced a bid for the circuit court, citing experience in civil litigation.', 'news', 'reporting', 8),
  mkNews('n-026', '54491b4a-a900-491d-b283-8f0eaa72ffe7', 'Vasquez praised for courtroom efficiency', 'Florida Bar News', 'DEMO DATA — Fictional article. A judicial performance review highlighted Vasquez\'s case management improvements.', 'news', 'reporting', 5),

  mkNews('n-027', '98418374-9268-4edd-b7ba-d5dfcf9f934d', 'Pat Sullivan seeks re-election to circuit court', 'Daily Business Review', 'DEMO DATA — Fictional article. Sitting circuit court judge Sullivan filed for re-election, touting 12 years on the bench.', 'news', 'reporting', 9),
  mkNews('n-028', '98418374-9268-4edd-b7ba-d5dfcf9f934d', 'Sullivan\'s rulings on property rights upheld on appeal', 'Florida Law Weekly', 'DEMO DATA — Fictional article. An appellate court affirmed Judge Sullivan\'s ruling in a landmark eminent domain case.', 'news', 'reporting', 11),
];

export const demoVideos: Video[] = [
  mkVideo('v-001', '55c9586b-1025-4fe6-aee2-ec50d4e62bef', 'Alex Morgan — Campaign Launch Speech', 'YouTube', 'speech', 5),
  mkVideo('v-002', '55c9586b-1025-4fe6-aee2-ec50d4e62bef', 'Morgan interviewed on small business policy', 'Local 6 News', 'interview', 3),
  mkVideo('v-003', '32191e16-7606-4f6b-acf0-89599f7f311c', 'Brooks vs Rivera — Candidate Debate', 'League of Women Voters', 'debate', 1),
  mkVideo('v-004', 'f07ff45a-2884-4770-b4fe-cf474ec0b2dd', 'Jordan Rivera at healthcare town hall', 'YouTube', 'town_hall', 4),
  mkVideo('v-005', '0502798c-5341-46f4-9c24-b5acefcd6015', 'Casey Whitfield — Gubernatorial Announcement', 'YouTube', 'speech', 15),
  mkVideo('v-006', '13aa2e14-eeae-4804-b5d9-48938e911292', 'Ellis and Whitfield — Governor Debate Highlights', 'WFLA News', 'debate', 3),
  mkVideo('v-007', 'def16c3a-d399-472e-a910-95f118442f30', 'Drew Hastings on criminal justice reform', 'YouTube', 'interview', 6),
  mkVideo('v-008', '346d48ce-7118-4f27-b947-c64934d8e6fc', 'Sam Delgado — AG Campaign Launch', 'YouTube', 'speech', 14),
  mkVideo('v-009', '0502798c-5341-46f4-9c24-b5acefcd6015', 'Whitfield town hall on infrastructure', 'Local 10 News', 'town_hall', 7),
  mkVideo('v-010', '711bd741-779a-4190-9575-6e0ace2f51d9', 'Riley Chen — State Senate town hall', 'YouTube', 'town_hall', 5),
];

export const demoSocialPosts: SocialPost[] = [
  mkSocial('s-001', '55c9586b-1025-4fe6-aee2-ec50d4e62bef', 'Instagram', 'DEMO DATA — Thrilled to announce my candidacy for Congress in FL-10! Join us at the launch rally this Saturday. Together we can bring independent leadership to Washington. #FL10', 5),
  mkSocial('s-002', '55c9586b-1025-4fe6-aee2-ec50d4e62bef', 'Twitter', 'DEMO DATA — Small businesses are the backbone of our economy. My tax reform plan would simplify filing for businesses with under 50 employees. Read more: example.com/morgan-plan', 3),
  mkSocial('s-003', '55c9586b-1025-4fe6-aee2-ec50d4e62bef', 'Instagram', 'DEMO DATA — Great turnout at today\'s community forum in Orlando! Thank you to everyone who came out to share their concerns about housing affordability.', 2),
  mkSocial('s-004', '32191e16-7606-4f6b-acf0-89599f7f311c', 'Twitter', 'DEMO DATA — Proud to file three bills this session to cut red tape for Florida businesses. Government should work for you, not against you. #LessRegulation', 4),
  mkSocial('s-005', '32191e16-7606-4f6b-acf0-89599f7f311c', 'Instagram', 'DEMO DATA — My new TV ad is live! Watch how we\'re fighting for small business owners across District 10. #BrooksForCongress', 2),
  mkSocial('s-006', 'f07ff45a-2884-4770-b4fe-cf474ec0b2dd', 'Instagram', 'DEMO DATA — Healthcare is a right, not a privilege. My plan would expand coverage to gig workers who currently fall through the cracks. #HealthcareForAll', 6),
  mkSocial('s-007', 'f07ff45a-2884-4770-b4fe-cf474ec0b2dd', 'Twitter', 'DEMO DATA — Enjoyed a vigorous debate with @TaylorBrooks on housing policy today. Voters deserve to hear where we stand. That\'s how democracy works.', 1),
  mkSocial('s-008', '0502798c-5341-46f4-9c24-b5acefcd6015', 'Instagram', 'DEMO DATA — Today I\'m announcing my run for Governor of Florida. It\'s time for new leadership that invests in our communities, our schools, and our future. Join us!', 15),
  mkSocial('s-009', '0502798c-5341-46f4-9c24-b5acefcd6015', 'Twitter', 'DEMO DATA — My $2 billion transit plan would create jobs, reduce congestion, and modernize Florida\'s infrastructure for the 21st century. Details: example.com/whitfield-transit', 7),
  mkSocial('s-010', '13aa2e14-eeae-4804-b5d9-48938e911292', 'Twitter', 'DEMO DATA — Florida\'s education budget is at a record high. We\'re investing in our students and our future. #FloridaEducation #RecordFunding', 4),
  mkSocial('s-011', 'def16c3a-d399-472e-a910-95f118442f30', 'Instagram', 'DEMO DATA — Today I filed suit to protect absentee voting rights. Every eligible voter deserves access to the ballot box. #VotingRights #AttorneyGeneral', 6),
  mkSocial('s-012', '346d48ce-7118-4f27-b947-c64934d8e6fc', 'Twitter', 'DEMO DATA — As your Attorney General, I\'ll create a statewide opioid task force to fight the crisis devastating our communities. Public safety is my top priority.', 7),
  mkSocial('s-013', '711bd741-779a-4190-9575-6e0ace2f51d9', 'Instagram', 'DEMO DATA — As a nurse, I see what happens when healthcare is out of reach. I\'m running for State Senate to fight for patients and healthcare workers. #FLSenate', 5),
  mkSocial('s-014', '204bb535-41af-46c4-90e9-f72d3bf3e793', 'Twitter', 'DEMO DATA — Our zoning laws are stuck in the 1970s. It\'s time to allow mixed-use development so our neighborhoods can be walkable, affordable, and vibrant. #SmartGrowth', 4),
  mkSocial('s-015', 'f04705a3-7c59-4dc1-a38a-edfa5eebedfc', 'Instagram', 'DEMO DATA — Teachers are the heart of our schools. My plan: 10% raise, smaller class sizes, and computer science in every middle school. #SupportTeachers', 6),
  mkSocial('s-016', '54491b4a-a900-491d-b283-8f0eaa72ffe7', 'Twitter', 'DEMO DATA — 8 years on the county bench, 2000+ cases resolved efficiently. I\'m ready to bring that experience to the circuit court. #ExperienceMatters', 8),
  mkSocial('s-017', '98418374-9268-4edd-b7ba-d5dfcf9f934d', 'Instagram', 'DEMO DATA — Honored to serve the people of the 11th Judicial Circuit for 12 years. Asking for your vote to continue the work. #ReElectSullivan', 9),
];

export function getDemoNewsByCandidate(candidateId: string): NewsArticle[] {
  return demoNewsArticles.filter((a) => a.candidate_id === candidateId);
}

export function getDemoVideosByCandidate(candidateId: string): Video[] {
  return demoVideos.filter((v) => v.candidate_id === candidateId);
}

export function getDemoSocialByCandidate(candidateId: string): SocialPost[] {
  return demoSocialPosts.filter((s) => s.candidate_id === candidateId);
}
