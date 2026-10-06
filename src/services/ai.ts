import type { AIResponse, ClaimAssessment, Source } from '@/types';
import { fetchAllRows } from '@/lib/fetch-all';
import { supabase } from '@/lib/supabase';
import { getCandidatePositions, getVotingRecord, getCandidateStatements } from './candidates';

/**
 * askBallotLensAI
 *
 * This is a MOCK AI service that answers ONLY from retrieved evidence.
 * It does not call an external LLM — it uses rule-based retrieval from the
 * database to construct a grounded response. In production, this would
 * send the question + retrieved evidence to an LLM with strict instructions
 * to answer only from the provided context.
 *
 * The AI NEVER:
 * - Invents candidate positions
 * - Invents voting records
 * - Invents quotes
 * - Invents sources
 * - Produces endorsements
 */
export interface AiUsageStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  isPaid: boolean;
}

/** Read-only check — does NOT consume a question. Use on page load to show
 * "3 of 5 questions left today" before the user asks anything. */
export async function getAiUsageStatus(): Promise<AiUsageStatus | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return null;
  const { data, error } = await supabase.rpc('get_ai_usage_status', { p_user_id: userData.user.id });
  if (error || !data) return null;
  return { allowed: data.allowed, remaining: data.remaining, limit: data.limit, isPaid: data.is_paid };
}

/** Atomically checks AND consumes one question against today's limit
 * (5/day free, 100/day paid — client-confirmed). Call this BEFORE actually
 * asking the AI a question; if `allowed` is false, show an upgrade prompt
 * instead of calling askBallotLensAI(). */
export async function consumeAiUsage(): Promise<AiUsageStatus> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { allowed: false, remaining: 0, limit: 5, isPaid: false };
  }
  const { data, error } = await supabase.rpc('check_and_increment_ai_usage', { p_user_id: userData.user.id });
  if (error || !data) {
    // Fail closed on an unexpected error — don't let a DB hiccup grant free
    // unlimited AI usage.
    return { allowed: false, remaining: 0, limit: 5, isPaid: false };
  }
  return { allowed: data.allowed, remaining: data.remaining, limit: data.limit, isPaid: data.is_paid };
}

export async function askBallotLensAI(
  question: string,
  candidateId?: string,
  issueId?: string
): Promise<AIResponse> {
  await delay(500);

  // If no candidate specified, return a guidance response
  if (!candidateId) {
    // Try to find a candidate by name in the question
    const candidate = await findCandidateByName(question);
    if (candidate) {
      return askBallotLensAI(question, candidate.id, issueId);
    }
    const running = await answerWhoIsRunning(question);
    if (running) return running;

    return {
      answer:
        "I can help you research candidates, issues, voting records and sources. To give you a grounded answer, please specify a candidate or select one from a candidate page. I will only answer using verified evidence from the database.",
      evidence: [],
      sources: [],
      confidence: 'low',
      limitations: [
        'No specific candidate was identified in your question.',
        'I cannot answer general political questions without a specific candidate context.',
      ],
    };
  }

  // Retrieve evidence
  const { data: named } = await supabase.from('candidates').select('first_name, last_name').eq('id', candidateId).maybeSingle();
  const who = named ? `${named.first_name} ${named.last_name}` : 'this candidate';
  const positions = await getCandidatePositions(candidateId);
  const votingRecords = await getVotingRecord(candidateId);
  const statements = await getCandidateStatements(candidateId);

  // Try to match the question to an issue
  const issue = await findIssueInQuestion(question);
  const relevantPositions = issue
    ? positions.filter((p) => p.issue_id === issue.id)
    : positions;

  // Gather sources from relevant positions
  const sources: Source[] = [];
  const evidence: string[] = [];
  const seenSourceIds = new Set<string>();

  for (const pos of relevantPositions) {
    if (pos.sources) {
      for (const src of pos.sources) {
        if (!seenSourceIds.has(src.id)) {
          seenSourceIds.add(src.id);
          sources.push(src);
        }
      }
    }
  }

  // Determine what kind of question this is
  const q = question.toLowerCase();
  const asksAboutPosition = issue && relevantPositions.length > 0;
  const asksAboutVotes = q.includes('vote') || q.includes('voted') || q.includes('bill') || q.includes('voting record');
  const asksAboutSources = q.includes('source') || q.includes('evidence');

  if (asksAboutPosition && relevantPositions.length > 0) {
    const pos = relevantPositions[0];
    if (pos.verification_status === 'insufficient_information' || !pos.summary) {
      return {
        answer: `I couldn't find enough reliable evidence to verify ${who}'s position on ${pos.issue?.name ?? 'this issue'}.`,
        evidence: [],
        sources: [],
        confidence: 'low',
        limitations: [
          'Position not verified — insufficient reliable information available.',
        ],
      };
    }

    if (pos.verification_status === 'not_verified') {
      evidence.push(`Candidate position on ${pos.issue?.name}: ${pos.summary}`);
      return {
        answer: `The campaign states that ${who}'s position on ${pos.issue?.name} is: "${pos.summary}" However, this position has not yet been independently verified.`,
        evidence,
        sources,
        confidence: 'medium',
        limitations: [
          'This position is based on campaign statements and has not been independently verified.',
        ],
      };
    }

    evidence.push(`Verified candidate position on ${pos.issue?.name}: ${pos.summary}`);
    for (const stmt of statements.filter((s) => s.issue_id === pos.issue_id)) {
      evidence.push(`Candidate statement: ${stmt.statement_text}`);
    }

    return {
      answer: `Based on the available evidence, ${who}'s position on ${pos.issue?.name} is: "${pos.summary}"`,
      evidence,
      sources,
      confidence: sources.length > 0 ? 'high' : 'medium',
      limitations:
        sources.length === 0
          ? ['No primary sources are linked to this position.']
          : [],
    };
  }

  if (asksAboutVotes && votingRecords.length > 0) {
    evidence.push(...votingRecords.map((vr) => `Voting record: ${vr.bill_name} (${vr.bill_number ?? 'no number'}) — Vote: ${vr.vote ?? 'unknown'} on ${vr.vote_date ?? 'unknown date'}`));

    const voteSources = votingRecords
      .map((vr) => vr.source)
      .filter((s): s is Source => s !== null && s !== undefined)
      .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);

    return {
      answer: `${who} has ${votingRecords.length} voting record${votingRecords.length === 1 ? '' : 's'} on file. ${votingRecords.slice(0, 3).map((vr) => `Voted ${vr.vote ?? '—'} on ${vr.bill_name} (${vr.vote_date ?? 'date unknown'}).`).join(' ')}`,
      evidence,
      sources: voteSources,
      confidence: 'high',
      limitations:
        votingRecords.length > 3
          ? [`Showing 3 of ${votingRecords.length} records. See the candidate's full profile for all votes.`]
          : [],
    };
  }

  if (asksAboutSources && sources.length > 0) {
    return {
      answer: `There are ${sources.length} source${sources.length === 1 ? '' : 's'} supporting the information about ${who}. ${sources.slice(0, 3).map((s) => `"${s.title}" from ${s.publisher ?? 'unknown publisher'} (${s.source_type}).`).join(' ')}`,
      evidence: sources.map((s) => `Source: ${s.title} — ${s.publisher ?? 'Unknown'} — ${s.source_type}`),
      sources,
      confidence: 'high',
      limitations: [],
    };
  }

  // Asked about votes but there are none: say so (this used to fall through to
  // "ask about their voting record", which is what the voter had just done).
  if (asksAboutVotes && votingRecords.length === 0) {
    return {
      answer: `Gov Search App doesn't have any voting records on file for ${who}.`,
      evidence: [], sources: [], confidence: 'high',
      limitations: ['Candidates who have not held legislative office usually have no voting record.'],
    };
  }

  // Asked about a specific issue the candidate has no position on: say so.
  if (issue && relevantPositions.length === 0) {
    return {
      answer: `Gov Search App doesn't have a position on file for ${who} on ${issue.name}.`,
      evidence: [], sources: [], confidence: 'high',
      limitations: ['No position has been recorded or verified for this issue yet.'],
    };
  }

  // Fallback: summarize what we know
  if (positions.length > 0 || votingRecords.length > 0) {
    return {
      answer: `I found ${positions.length} position${positions.length === 1 ? '' : 's'} and ${votingRecords.length} voting record${votingRecords.length === 1 ? '' : 's'} for ${who}. Please ask about a specific issue (e.g., "What is their position on healthcare?") or ask about their voting record for a more detailed answer.`,
      evidence: [
        ...positions.slice(0, 3).map((p) => `Position on ${p.issue?.name ?? 'an issue'}: ${p.summary ?? 'Not verified'}`),
        ...votingRecords.slice(0, 3).map((vr) => `Voted ${vr.vote ?? '—'} on ${vr.bill_name}`),
      ],
      sources,
      confidence: 'medium',
      limitations: ['Your question did not match a specific issue or voting record. Try rephrasing.'],
    };
  }

  return {
    answer: `Gov Search App doesn't have any positions or voting records on file for ${who} yet, so I can't answer that.`,
    evidence: [],
    sources: [],
    confidence: 'low',
    limitations: [
      `No positions, statements or votes have been recorded for ${who}.`,
    ],
  };
}

/**
 * assessClaim — Claim Explorer
 *
 * Searches existing claims in the database for a match. If found, returns
 * the structured assessment. If not found, returns an "insufficient information"
 * response — it does NOT fabricate an assessment.
 */
export async function assessClaim(claimText: string): Promise<ClaimAssessment> {
  await delay(600);

  // Search existing claims. Uses .limit(1) rather than .maybeSingle() because
  // an ILIKE fuzzy match can easily return more than one row once there's
  // real data — .maybeSingle() would throw a "multiple rows returned" error
  // in that case instead of just taking the best/first match.
  const { data: matches } = await supabase
    .from('claims')
    .select(`
      id, claim_text, assessment, explanation,
      candidate:candidates(id, first_name, last_name)
    `)
    .ilike('claim_text', `%${claimText.slice(0, 50)}%`)
    .limit(1);

  const data = matches?.[0];

  if (data) {
    const { data: evidenceData } = await supabase
      .from('claim_evidence')
      .select(`
        id, note,
        source:sources(id, title, url, publisher, source_type, publication_date, author, description, credibility_level)
      `)
      .eq('claim_id', data.id);

    const sources: Source[] = (evidenceData ?? [])
      .map((e: Record<string, unknown>) => {
        const src = e.source;
        if (Array.isArray(src)) return src[0] as Source;
        return src as Source | null;
      })
      .filter((s): s is Source => s !== null && s !== undefined);

    const evidence: string[] = (evidenceData ?? [])
      .filter((e: Record<string, unknown>) => e.note)
      .map((e: Record<string, unknown>) => e.note as string);

    return {
      claim: data.claim_text,
      assessment: data.assessment,
      explanation: data.explanation ?? '',
      evidence: evidence.length > 0 ? evidence : sources.map((s) => s.title),
      sources,
    };
  }

  // No matching claim found
  return {
    claim: claimText,
    assessment: 'insufficient_information',
    explanation:
      "This claim has not been assessed yet. Gov Search App does not label claims as true or false without examining the available evidence. Please check back later or review the candidate's voting records and public statements directly.",
    evidence: [],
    sources: [],
  };
}

// --- helpers ---

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text: string, word: string) =>
  word.trim().length > 1 && new RegExp(`(^|[^a-z0-9])${escapeRe(word.toLowerCase())}('s)?($|[^a-z0-9])`).test(text);

/**
 * Finds the candidate a question is about. Whole words only, preferring the
 * full name, then a unique last name, then a unique first name. It used to take
 * the first candidate whose first OR last name appeared anywhere as a
 * substring, so with real data "What WILL..." or "...HOPE..." would pick a
 * candidate named Will or Hope.
 */
async function findCandidateByName(question: string): Promise<{ id: string; name: string } | null> {
  const data = await fetchAllRows<{ id: string; first_name: string; last_name: string; is_demo?: boolean }>((from, to) =>
    supabase.from('candidates').select('id, first_name, last_name, is_demo').order('id').range(from, to)).catch(() => null);
  if (!data) return null;
  const q = question.toLowerCase();
  const pool = data.filter((c) => !c.is_demo && c.first_name && c.last_name);
  const full = pool.filter((c) => hasWord(q, `${c.first_name} ${c.last_name}`));
  const pick = (list: typeof pool) => (list.length === 1 ? { id: list[0].id, name: `${list[0].first_name} ${list[0].last_name}` } : null);
  if (full.length >= 1) return pick(full.slice(0, 1));
  const byLast = pool.filter((c) => c.last_name.length > 2 && hasWord(q, c.last_name));
  if (byLast.length === 1) return pick(byLast);
  const byFirst = pool.filter((c) => c.first_name.length > 2 && hasWord(q, c.first_name));
  return pick(byFirst);
}

/** Matches an issue by its name, slug, or any significant word in its name
 * (singular or plural): "guns" -> Gun Violence, "taxes" -> Taxes. */
async function findIssueInQuestion(question: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase.from('issues').select('id, name, slug').eq('is_custom', false);
  if (!data) return null;
  const q = question.toLowerCase();
  const STOP = new Set(['and', 'the', 'of', 'for', 'policy', 'reform', 'issues', 'rights', 'public']);
  for (const issue of data) if (q.includes(issue.name.toLowerCase()) || q.includes(issue.slug.replace(/-/g, ' '))) return { id: issue.id, name: issue.name };
  for (const issue of data) {
    const words = issue.name.toLowerCase().split(/[^a-z]+/).filter((w: string) => w.length > 2 && !STOP.has(w));
    if (words.some((w: string) => hasWord(q, w) || hasWord(q, w.endsWith('s') ? w.slice(0, -1) : `${w}s`))) return { id: issue.id, name: issue.name };
  }
  return null;
}

/** "Who is running for State Representative?" -- answers from real races. */
async function answerWhoIsRunning(question: string): Promise<AIResponse | null> {
  const q = question.toLowerCase();
  if (!/(who('s| is| are)? (running|on the ballot)|candidates? (for|in)|running for)/.test(q)) return null;
  const { getAllContestsWithCandidates } = await import('./candidates');
  const contests = await getAllContestsWithCandidates().catch(() => []);
  const matches = contests.filter((c) => {
    const office = c.office_name.toLowerCase();
    return q.includes(office) || office.split(/\s+/).filter((w) => w.length > 3).every((w) => q.includes(w));
  });
  if (matches.length === 0) return null;
  const shown = matches.slice(0, 8);
  const lines = shown.map((c) => {
    const where = (c as typeof c & { district?: { name: string } | null }).district?.name ?? c.seat_description ?? '';
    const names = (c.candidates ?? []).map((x) => `${x.first_name} ${x.last_name}${x.party ? ` (${x.party})` : ''}`).join(', ');
    return `${c.office_name}${where ? ` — ${where}` : ''}: ${names}`;
  });
  return {
    answer: `Here's who is running, from the races Gov Search App has on file:\n${lines.join('\n')}`,
    evidence: lines,
    sources: [],
    confidence: 'high',
    limitations: [
      ...(matches.length > shown.length ? [`Showing ${shown.length} of ${matches.length} races. Enter your ZIP on My Ballot to see only your district.`] : ['Enter your ZIP on My Ballot to see only the races in your district.']),
      'Candidate lists can change; always confirm with your official election office.',
    ],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
