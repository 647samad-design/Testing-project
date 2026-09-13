import type { AIResponse, ClaimAssessment, Source, CandidatePosition, VotingRecord, CandidateStatement } from '@/types';
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
        answer: `I couldn't find enough reliable evidence to verify this candidate's position on ${pos.issue?.name ?? 'this issue'}.`,
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
        answer: `The campaign states that this candidate's position on ${pos.issue?.name} is: "${pos.summary}" However, this position has not yet been independently verified.`,
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
      answer: `Based on the available evidence, this candidate's position on ${pos.issue?.name} is: "${pos.summary}"`,
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
      answer: `This candidate has ${votingRecords.length} voting record${votingRecords.length === 1 ? '' : 's'} on file. ${votingRecords.slice(0, 3).map((vr) => `Voted ${vr.vote ?? '—'} on ${vr.bill_name} (${vr.vote_date ?? 'date unknown'}).`).join(' ')}`,
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
      answer: `There are ${sources.length} source${sources.length === 1 ? '' : 's'} supporting the information about this candidate. ${sources.slice(0, 3).map((s) => `"${s.title}" from ${s.publisher ?? 'unknown publisher'} (${s.source_type}).`).join(' ')}`,
      evidence: sources.map((s) => `Source: ${s.title} — ${s.publisher ?? 'Unknown'} — ${s.source_type}`),
      sources,
      confidence: 'high',
      limitations: [],
    };
  }

  // Fallback: summarize what we know
  if (positions.length > 0 || votingRecords.length > 0) {
    return {
      answer: `I found ${positions.length} position${positions.length === 1 ? '' : 's'} and ${votingRecords.length} voting record${votingRecords.length === 1 ? '' : 's'} for this candidate. Please ask about a specific issue (e.g., "What is their position on healthcare?") or ask about their voting record for a more detailed answer.`,
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
    answer: "I don't have enough reliable evidence to answer that confidently.",
    evidence: [],
    sources: [],
    confidence: 'low',
    limitations: [
      'Insufficient reliable information available for this candidate.',
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

  // Search existing claims
  const { data } = await supabase
    .from('claims')
    .select(`
      id, claim_text, assessment, explanation,
      candidate:candidates(id, first_name, last_name)
    `)
    .ilike('claim_text', `%${claimText.slice(0, 50)}%`)
    .maybeSingle();

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
      "This claim has not been assessed yet. BallotLens does not label claims as true or false without examining the available evidence. Please check back later or review the candidate's voting records and public statements directly.",
    evidence: [],
    sources: [],
  };
}

// --- helpers ---

async function findCandidateByName(question: string): Promise<{ id: string } | null> {
  const { data } = await supabase.from('candidates').select('id, first_name, last_name');
  if (!data) return null;
  const q = question.toLowerCase();
  for (const c of data) {
    if (q.includes(c.first_name.toLowerCase()) || q.includes(c.last_name.toLowerCase())) {
      return { id: c.id };
    }
  }
  return null;
}

async function findIssueInQuestion(question: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase.from('issues').select('id, name, slug').eq('is_custom', false);
  if (!data) return null;
  const q = question.toLowerCase();
  for (const issue of data) {
    if (q.includes(issue.name.toLowerCase()) || q.includes(issue.slug.replace(/-/g, ' '))) {
      return { id: issue.id, name: issue.name };
    }
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
