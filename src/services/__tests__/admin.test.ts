import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase client before importing the service under test, since the
// real client throws at import time if env vars aren't set (fine in prod/dev,
// not in a unit test).
const { rpcMock, singleMock, selectAfterInsertMock, eqMock, updateMock, deleteEqMock, deleteMock, insertMock, upsertMock, fromMock } = vi.hoisted(() => {
  const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
  const singleMock = vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null });
  const selectAfterInsertMock = vi.fn(() => ({ single: singleMock }));
  const eqMock = vi.fn().mockResolvedValue({ error: null });
  const updateMock = vi.fn(() => ({ eq: eqMock }));
  const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
  const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));
  const insertMock = vi.fn(() => ({ select: selectAfterInsertMock }));
  const upsertMock = vi.fn().mockResolvedValue({ error: null });
  const fromMock = vi.fn(() => ({
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    upsert: upsertMock,
  }));
  return { rpcMock, singleMock, selectAfterInsertMock, eqMock, updateMock, deleteEqMock, deleteMock, insertMock, upsertMock, fromMock };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

import { updateCandidate, deleteCandidate, addCandidate, setAdminRole, compCandidateManagement, revokeCandidateManagement, getPendingClaims, approveClaim, rejectClaim, approveEvent, rejectEvent, approveQuestionnaireResponse, rejectQuestionnaireResponse, getPendingAds, approveAd, rejectAd, bulkImportCandidates, expireOverdueComps, getUnresearchedClaims, assessClaimInLibrary, getRevenueSummary, searchBallotContests, linkCandidateToContest, getCandidateContests, unlinkCandidateFromContest, getSourceCountsForPositions, linkSourceToPosition, addClaimEvidence, getPendingProfileExtras, reviewProfileExtra, publishFactCheck, dismissFactCheck, addBallotContest, applyPromiseProposal, discardPromiseProposal, reviewClaimAnalysis, slugify, saveStory } from '@/services/admin';

describe('admin service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
    eqMock.mockResolvedValue({ error: null });
    deleteEqMock.mockResolvedValue({ error: null });
    singleMock.mockResolvedValue({ data: { id: 'new-id' }, error: null });
  });

  it('updateCandidate writes the update and logs an audit entry', async () => {
    await updateCandidate('cand-1', { first_name: 'Jane' });

    expect(fromMock).toHaveBeenCalledWith('candidates');
    expect(updateMock).toHaveBeenCalledWith({ first_name: 'Jane' });
    expect(eqMock).toHaveBeenCalledWith('id', 'cand-1');
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({
      p_action: 'update_candidate',
      p_target_table: 'candidates',
      p_target_id: 'cand-1',
    }));
  });

  it('updateCandidate throws and does NOT log when the update fails', async () => {
    eqMock.mockResolvedValueOnce({ error: new Error('db is down') });

    await expect(updateCandidate('cand-1', { first_name: 'Jane' })).rejects.toThrow('db is down');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('deleteCandidate deletes then logs the action', async () => {
    await deleteCandidate('cand-2');

    expect(deleteMock).toHaveBeenCalled();
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'cand-2');
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({
      p_action: 'delete_candidate',
      p_target_id: 'cand-2',
    }));
  });

  it('addCandidate inserts with is_demo defaulted to true and logs with the new id', async () => {
    await addCandidate({ first_name: 'John', last_name: 'Doe', party: 'Independent', bio: 'Bio' });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ is_demo: true, first_name: 'John' }));
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({
      p_action: 'add_candidate',
      p_target_id: 'new-id',
    }));
  });

  it('audit logging failure never blocks the underlying admin action', async () => {
    rpcMock.mockRejectedValueOnce(new Error('audit table unreachable'));

    // Should NOT throw even though the RPC call rejects.
    await expect(updateCandidate('cand-1', { first_name: 'Jane' })).resolves.toBeUndefined();
  });

  it('setAdminRole calls the set_admin_role RPC with the right args', async () => {
    await setAdminRole('user-1', true);
    expect(rpcMock).toHaveBeenCalledWith('set_admin_role', { target_user_id: 'user-1', new_is_admin: true });
  });

  it('setAdminRole surfaces an RPC error (e.g. self-demotion block)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('Admins cannot remove their own admin status') });
    await expect(setAdminRole('user-1', false)).rejects.toThrow('Admins cannot remove their own admin status');
  });

  it('compCandidateManagement upserts as active+comped and logs the reason', async () => {
    await compCandidateManagement('cand-1', 'Beta launch — first year free');

    expect(fromMock).toHaveBeenCalledWith('candidate_management_subscriptions');
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ candidate_id: 'cand-1', status: 'active', is_comped: true, comped_reason: 'Beta launch — first year free' }),
      { onConflict: 'candidate_id' }
    );
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'comp_candidate_management', p_target_id: 'cand-1' }));
  });

  it('compCandidateManagement sets a 1-year expiration, not an indefinite grant', async () => {
    const before = Date.now();
    await compCandidateManagement('cand-1', 'Beta launch');
    const call = upsertMock.mock.calls[upsertMock.mock.calls.length - 1][0];

    const periodEnd = new Date(call.current_period_end).getTime();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    // Allow a little slack for test execution time / leap years.
    expect(periodEnd - before).toBeGreaterThan(oneYearMs - 2 * 24 * 60 * 60 * 1000);
    expect(periodEnd - before).toBeLessThan(oneYearMs + 2 * 24 * 60 * 60 * 1000);
  });

  it('revokeCandidateManagement sets status to canceled', async () => {
    await revokeCandidateManagement('cand-1');

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'canceled' }));
    expect(eqMock).toHaveBeenCalledWith('candidate_id', 'cand-1');
  });
});

describe('candidate profile claim review — the actual approval queue, previously missing entirely', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getPendingClaims fetches only pending claims, oldest first', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [{ id: 'claim-1', status: 'pending', full_name: 'Jane Doe', candidate: { first_name: 'Jane', last_name: 'Doe' } }],
      error: null,
    });
    const eqPendingMock = vi.fn(() => ({ order: orderMock }));
    fromMock.mockReturnValueOnce({ select: () => ({ eq: eqPendingMock }) } as unknown as ReturnType<typeof fromMock>);

    const result = await getPendingClaims();

    expect(eqPendingMock).toHaveBeenCalledWith('status', 'pending');
    expect(result).toHaveLength(1);
  });

  it('approveClaim sets status to verified and logs the action', async () => {
    await approveClaim('claim-1');

    expect(fromMock).toHaveBeenCalledWith('candidate_claims');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'verified' }));
    expect(eqMock).toHaveBeenCalledWith('id', 'claim-1');
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'approve_claim', p_target_id: 'claim-1' }));
  });

  it('rejectClaim sets status to rejected with admin notes and logs the action', async () => {
    await rejectClaim('claim-2', 'Could not verify identity');

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', admin_notes: 'Could not verify identity' }));
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'reject_claim', p_target_id: 'claim-2' }));
  });
});

describe('event & questionnaire review — previously had zero admin access at all', () => {
  beforeEach(() => vi.clearAllMocks());

  it('approveEvent sets status to approved and logs the action', async () => {
    await approveEvent('event-1');
    expect(fromMock).toHaveBeenCalledWith('candidate_events');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'approve_event', p_target_id: 'event-1' }));
  });

  it('rejectEvent sets status to rejected and logs the action', async () => {
    await rejectEvent('event-2', 'Not a real event');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', admin_notes: 'Not a real event' }));
  });

  it('approveQuestionnaireResponse sets status to approved and logs the action', async () => {
    await approveQuestionnaireResponse('resp-1');
    expect(fromMock).toHaveBeenCalledWith('candidate_questionnaire_responses');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'approve_questionnaire_response', p_target_id: 'resp-1' }));
  });

  it('rejectQuestionnaireResponse sets status to rejected and logs the action', async () => {
    await rejectQuestionnaireResponse('resp-2');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
  });
});

describe('ad review — advertisers cannot self-activate, real admin approval required', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getPendingAds fetches only pending ads, oldest first', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [{ id: 'ad-1', ad_title: 'Vote for X', status: 'pending' }], error: null });
    const eqPendingMock = vi.fn(() => ({ order: orderMock }));
    fromMock.mockReturnValueOnce({ select: () => ({ eq: eqPendingMock }) } as unknown as ReturnType<typeof fromMock>);

    const result = await getPendingAds();

    expect(eqPendingMock).toHaveBeenCalledWith('status', 'pending');
    expect(result).toHaveLength(1);
  });

  it('approveAd sets status to active and logs the action', async () => {
    await approveAd('ad-1');
    expect(fromMock).toHaveBeenCalledWith('advertisements');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'approve_ad', p_target_id: 'ad-1' }));
  });

  it('rejectAd sets status to rejected with notes and logs the action', async () => {
    await rejectAd('ad-2', 'Misleading claim');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', admin_notes: 'Misleading claim' }));
  });
});

describe('bulkImportCandidates — duplicate protection (previously none at all)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips a row matching an existing candidate name (case-insensitive) instead of creating a duplicate', async () => {
    fromMock.mockImplementationOnce(() => ({
      select: () => ({ order: () => ({ range: () => Promise.resolve({ data: [{ first_name: 'Jane', last_name: 'Doe' }], error: null }) }) }),
    }) as unknown as ReturnType<typeof fromMock>);

    const result = await bulkImportCandidates([
      { first_name: 'jane', last_name: 'DOE' }, // duplicate, different casing
      { first_name: 'John', last_name: 'Smith' }, // new
    ]);

    expect(result.skippedDuplicates).toEqual(['jane DOE']);
    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({ first_name: 'John', last_name: 'Smith' }),
    ]);
  });

  it('also catches a duplicate within the same import file, not just against existing data', async () => {
    fromMock.mockImplementationOnce(() => ({
      select: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }),
    }) as unknown as ReturnType<typeof fromMock>);
    insertMock.mockReturnValueOnce({ select: () => Promise.resolve({ data: [{ id: 'new-1' }], error: null }) } as unknown as ReturnType<typeof insertMock>);

    const result = await bulkImportCandidates([
      { first_name: 'Jane', last_name: 'Doe' },
      { first_name: 'jane', last_name: 'doe' }, // duplicate of the row above
    ]);

    expect(result.inserted).toBe(1);
    expect(result.skippedDuplicates).toEqual(['jane doe']);
  });

  it('does not call insert at all if every row is a duplicate', async () => {
    fromMock.mockImplementationOnce(() => ({
      select: () => ({ order: () => ({ range: () => Promise.resolve({ data: [{ first_name: 'Jane', last_name: 'Doe' }], error: null }) }) }),
    }) as unknown as ReturnType<typeof fromMock>);

    const result = await bulkImportCandidates([{ first_name: 'Jane', last_name: 'Doe' }]);

    expect(result.inserted).toBe(0);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('expireOverdueComps — comped Management previously had no expiration mechanism at all', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flips overdue comped grants to expired and reports who was affected', async () => {
    const ltMock = vi.fn().mockResolvedValue({
      data: [{ candidate_id: 'cand-1', candidates: { first_name: 'Jane', last_name: 'Doe' } }],
      error: null,
    });
    const eqStatusMock = vi.fn(() => ({ lt: ltMock }));
    const eqCompedMock = vi.fn(() => ({ eq: eqStatusMock }));
    const inMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementationOnce(() => ({
      select: () => ({ eq: eqCompedMock }),
    }) as unknown as ReturnType<typeof fromMock>);
    fromMock.mockImplementationOnce(() => ({
      update: () => ({ in: inMock }),
    }) as unknown as ReturnType<typeof fromMock>);

    const result = await expireOverdueComps();

    expect(eqCompedMock).toHaveBeenCalledWith('is_comped', true);
    expect(inMock).toHaveBeenCalledWith('candidate_id', ['cand-1']);
    expect(result).toEqual({ expiredCount: 1, expiredCandidateNames: ['Jane Doe'] });
  });

  it('returns zero without updating anything when nothing is overdue', async () => {
    fromMock.mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ eq: () => ({ lt: () => Promise.resolve({ data: [], error: null }) }) }) }),
    }) as unknown as ReturnType<typeof fromMock>);

    const result = await expireOverdueComps();

    expect(result).toEqual({ expiredCount: 0, expiredCandidateNames: [] });
  });
});

describe('Claims Library admin research — the library existed with correct RLS but zero UI anywhere', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getUnresearchedClaims fetches only insufficient_information claims, oldest first', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [{ id: 'claim-1', claim_text: 'Test claim' }], error: null });
    const eqMock = vi.fn(() => ({ order: orderMock }));
    fromMock.mockReturnValueOnce({ select: () => ({ eq: eqMock }) } as unknown as ReturnType<typeof fromMock>);

    const result = await getUnresearchedClaims();

    expect(eqMock).toHaveBeenCalledWith('assessment', 'insufficient_information');
    expect(result).toHaveLength(1);
  });

  it('assessClaimInLibrary updates assessment + explanation and logs the action', async () => {
    await assessClaimInLibrary('claim-1', 'supported', 'Verified against three independent sources.');

    expect(fromMock).toHaveBeenCalledWith('claims');
    expect(updateMock).toHaveBeenCalledWith({ assessment: 'supported', explanation: 'Verified against three independent sources.' });
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'assess_claim', p_target_id: 'claim-1' }));
  });
});

describe('getRevenueSummary — payments.amount is in cents, previously never summed or shown anywhere', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sums succeeded payments into total, last-30-days, and by-type breakdowns', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const orderMock = vi.fn().mockResolvedValue({
      data: [
        { id: 'p1', amount: 900, payment_type: 'subscription', description: null, created_at: recent },
        { id: 'p2', amount: 2500, payment_type: 'advertising', description: null, created_at: old },
      ],
      error: null,
    });
    const eqMock = vi.fn(() => ({ order: orderMock }));
    fromMock.mockReturnValueOnce({ select: () => ({ eq: eqMock }) } as unknown as ReturnType<typeof fromMock>);

    const result = await getRevenueSummary();

    expect(eqMock).toHaveBeenCalledWith('status', 'succeeded');
    expect(result.totalCents).toBe(3400);
    expect(result.last30DaysCents).toBe(900);
    expect(result.byType).toEqual({ subscription: 900, advertising: 2500 });
    expect(result.recentPayments).toHaveLength(2);
  });

  it('returns all zeros without erroring when there are no succeeded payments yet', async () => {
    fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) } as unknown as ReturnType<typeof fromMock>);
    const result = await getRevenueSummary();
    expect(result.totalCents).toBe(0);
    expect(result.byType).toEqual({});
  });
});

describe('candidate-to-race linking — previously the "Add Candidate" form had no way to do this at all', () => {
  beforeEach(() => vi.clearAllMocks());

  it('linkCandidateToContest inserts into candidate_offices and logs the action', async () => {
    await linkCandidateToContest('cand-1', 'contest-1');

    expect(fromMock).toHaveBeenCalledWith('candidate_offices');
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ candidate_id: 'cand-1', contest_id: 'contest-1', incumbent: false }));
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'link_candidate_to_contest', p_target_id: 'cand-1' }));
  });

  it('searchBallotContests filters by office name when a query is given', async () => {
    const ilikeMock = vi.fn().mockResolvedValue({ data: [{ id: 'c1', office_name: 'City Council' }], error: null });
    const limitMock = vi.fn(() => ({ ilike: ilikeMock }));
    const orderMock = vi.fn(() => ({ limit: limitMock }));
    fromMock.mockReturnValueOnce({ select: () => ({ order: orderMock }) } as unknown as ReturnType<typeof fromMock>);

    const result = await searchBallotContests('council');

    expect(ilikeMock).toHaveBeenCalledWith('office_name', '%council%');
    expect(result).toHaveLength(1);
  });

  it('getCandidateContests returns the contests a candidate is linked to', async () => {
    const eqMock = vi.fn().mockResolvedValue({
      data: [{ contest: { id: 'c1', office_name: 'Mayor' } }],
      error: null,
    });
    fromMock.mockReturnValueOnce({ select: () => ({ eq: eqMock }) } as unknown as ReturnType<typeof fromMock>);

    const result = await getCandidateContests('cand-1');

    expect(result).toEqual([{ id: 'c1', office_name: 'Mayor' }]);
  });

  it('unlinkCandidateFromContest deletes the matching candidate_offices row and logs it', async () => {
    const eq2Mock = vi.fn().mockResolvedValue({ error: null });
    const eq1Mock = vi.fn(() => ({ eq: eq2Mock }));
    fromMock.mockReturnValueOnce({ delete: () => ({ eq: eq1Mock }) } as unknown as ReturnType<typeof fromMock>);

    await unlinkCandidateFromContest('cand-1', 'contest-1');

    expect(eq1Mock).toHaveBeenCalledWith('candidate_id', 'cand-1');
    expect(eq2Mock).toHaveBeenCalledWith('contest_id', 'contest-1');
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'unlink_candidate_from_contest' }));
  });
});

describe('evidence sourcing for positions — previously no way to attach a source to a position at all', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getSourceCountsForPositions tallies candidate_sources rows per position', async () => {
    const inMock = vi.fn().mockResolvedValue({
      data: [
        { candidate_position_id: 'pos-1' },
        { candidate_position_id: 'pos-1' },
        { candidate_position_id: 'pos-2' },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce({ select: () => ({ in: inMock }) } as unknown as ReturnType<typeof fromMock>);

    const result = await getSourceCountsForPositions(['pos-1', 'pos-2']);

    expect(result).toEqual({ 'pos-1': 2, 'pos-2': 1 });
  });

  it('getSourceCountsForPositions returns empty without querying for an empty list', async () => {
    const result = await getSourceCountsForPositions([]);
    expect(result).toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('linkSourceToPosition inserts the candidate_sources row', async () => {
    await linkSourceToPosition('pos-1', 'source-1');
    expect(fromMock).toHaveBeenCalledWith('candidate_sources');
    expect(insertMock).toHaveBeenCalledWith({ candidate_position_id: 'pos-1', source_id: 'source-1' });
  });
});

describe('addClaimEvidence — published Claims Library assessments previously always had empty evidence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a claim_evidence row with the note trimmed, and logs it', async () => {
    await addClaimEvidence('claim-1', 'source-1', '  Shows the vote tally  ');
    expect(fromMock).toHaveBeenCalledWith('claim_evidence');
    expect(insertMock).toHaveBeenCalledWith({ claim_id: 'claim-1', source_id: 'source-1', note: 'Shows the vote tally' });
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'add_claim_evidence' }));
  });

  it('stores a null note when none is given', async () => {
    await addClaimEvidence('claim-1', 'source-1');
    expect(insertMock).toHaveBeenCalledWith({ claim_id: 'claim-1', source_id: 'source-1', note: null });
  });
});

describe('profile extras review — admins could not even read pending rows before migration 2500', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges pending endorsements, funding and get-to-know into one oldest-first list', async () => {
    const byTable: Record<string, unknown[]> = {
      candidate_endorsements: [{ id: 'e1', candidate_id: 'c1', created_at: '2026-01-03', endorser_name: 'Teachers Union', endorser_title: null, endorser_type: 'union' }],
      candidate_funding_sources: [{ id: 'f1', candidate_id: 'c1', created_at: '2026-01-01', source_type: 'self_funded', percentage: 40, amount_dollars: 12000, source_label: null }],
      candidate_get_to_know: [{ id: 'g1', candidate_id: 'c1', created_at: '2026-01-02', question: 'Favorite book?', answer: 'Dune' }],
    };
    const eqSpy = vi.fn();
    const impl = ((table: string) => ({
      select: () => ({ eq: (col: string, val: string) => { eqSpy(table, col, val); return { order: () => Promise.resolve({ data: byTable[table], error: null }) }; } }),
    })) as unknown as Parameters<typeof fromMock.mockImplementationOnce>[0];
    fromMock.mockImplementationOnce(impl).mockImplementationOnce(impl).mockImplementationOnce(impl);

    const result = await getPendingProfileExtras();

    expect(eqSpy).toHaveBeenCalledWith('candidate_endorsements', 'status', 'pending');
    expect(result.map((r) => r.id)).toEqual(['f1', 'g1', 'e1']);
    expect(result[0].summary).toContain('self funded: 40%');
    expect(result[0].summary).toContain('$12,000');
    expect(result[2].summary).toContain('Teachers Union');
  });

  it('reviewProfileExtra updates the right table and logs the decision', async () => {
    await reviewProfileExtra('funding', 'f1', 'approved');
    expect(fromMock).toHaveBeenCalledWith('candidate_funding_sources');
    expect(updateMock).toHaveBeenCalledWith({ status: 'approved' });
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'approve_funding', p_target_id: 'f1' }));
  });
});

describe('Lens This review — only admins can publish, and there was no UI to do it', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publishFactCheck sets published + verdict + trimmed explanation and logs it', async () => {
    await publishFactCheck('fc1', { assessment: 'misleading', explanation: '  Numbers are from 2019.  ', evidence_url: ' https://x.gov ' });
    expect(fromMock).toHaveBeenCalledWith('fact_checks');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'published', assessment: 'misleading', explanation: 'Numbers are from 2019.', evidence_url: 'https://x.gov',
    }));
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'publish_fact_check' }));
  });

  it('refuses to publish without an explanation', async () => {
    await expect(publishFactCheck('fc1', { assessment: 'true', explanation: '   ' })).rejects.toThrow('explanation');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('dismissFactCheck marks reviewed (kept private)', async () => {
    await dismissFactCheck('fc2');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'reviewed' }));
  });
});

describe('addBallotContest — now audit-logged', () => {
  beforeEach(() => vi.clearAllMocks());
  it('inserts the race and logs it', async () => {
    insertMock.mockReturnValueOnce(Promise.resolve({ error: null }) as unknown as ReturnType<typeof insertMock>);
    await addBallotContest({ election_id: 'e1', office_name: 'City Council Seat 3', contest_level: 'local', district_id: 'd1' });
    expect(fromMock).toHaveBeenCalledWith('ballot_contests');
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'add_ballot_contest' }));
  });
});

describe('bulkImportCandidates past 1,000 existing candidates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pages through ALL existing names, so a duplicate of candidate #1,500 is still caught', async () => {
    const existing = Array.from({ length: 1500 }, (_, i) => ({ first_name: `First${i}`, last_name: `Last${i}` }));
    const rangeCalls: Array<[number, number]> = [];
    fromMock.mockImplementationOnce(() => ({
      select: () => ({ order: () => ({ range: (from: number, to: number) => {
        rangeCalls.push([from, to]);
        return Promise.resolve({ data: existing.slice(from, to + 1), error: null });
      } }) }),
    }) as unknown as ReturnType<typeof fromMock>);
    fromMock.mockImplementationOnce(() => ({
      select: () => ({ order: () => ({ range: (from: number, to: number) => {
        rangeCalls.push([from, to]);
        return Promise.resolve({ data: existing.slice(from, to + 1), error: null });
      } }) }),
    }) as unknown as ReturnType<typeof fromMock>);

    const result = await bulkImportCandidates([{ first_name: 'First1499', last_name: 'Last1499' }]);

    expect(rangeCalls).toEqual([[0, 999], [1000, 1999]]);
    expect(result.skippedDuplicates).toEqual(['First1499 Last1499']);
    expect(result.inserted).toBe(0);
  });
});

describe('candidate self-reports are admin-reviewed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applyPromiseProposal copies the proposal into the public status and clears it', async () => {
    await applyPromiseProposal({ id: 'p1', promise_text: 'x', status: 'unverified', proposed_status: 'completed',
      proposed_evidence: 'Ribbon cutting', proposed_source_url: 'https://city.gov', proposed_at: null });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed', status_evidence: 'Ribbon cutting', status_source_url: 'https://city.gov',
      proposed_status: null, proposed_evidence: null, proposed_source_url: null,
    }));
    expect(rpcMock).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({ p_action: 'apply_promise_proposal' }));
  });

  it('discardPromiseProposal clears only the proposal', async () => {
    await discardPromiseProposal('p1');
    expect(updateMock).toHaveBeenCalledWith({ proposed_status: null, proposed_evidence: null, proposed_source_url: null });
  });

  it('reviewClaimAnalysis sets review_status', async () => {
    await reviewClaimAnalysis('a1', 'published');
    expect(fromMock).toHaveBeenCalledWith('candidate_claim_analysis');
    expect(updateMock).toHaveBeenCalledWith({ review_status: 'published' });
  });
});

describe('story editor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('slugify makes clean URLs', () => {
    expect(slugify('How a Bill Becomes Law: A Plain-English Guide!')).toBe('how-a-bill-becomes-law-a-plain-english-guide');
    expect(slugify('  Café  Elección  ')).toBe('cafe-eleccion');
  });

  const base = { title: 'Why local races matter', slug: '', excerpt: '', body: 'word '.repeat(440), category_id: null,
    author_name: 'BallotLens Editorial', hero_image_url: '', is_featured: false, is_published: true };

  it('stamps published_at and read time on first publish', async () => {
    insertMock.mockReturnValueOnce(Promise.resolve({ error: null }) as unknown as ReturnType<typeof insertMock>);
    await saveStory(base);
    const row = insertMock.mock.calls[0][0];
    expect(row.slug).toBe('why-local-races-matter');
    expect(row.read_time_minutes).toBe(2);
    expect(typeof row.published_at).toBe('string');
  });

  it('keeps the original published_at when an already-published story is edited', async () => {
    await saveStory(base, { id: 's1', published_at: '2026-01-01T00:00:00Z', read_time_minutes: 2, ...base, slug: 'why-local-races-matter', excerpt: null, hero_image_url: null });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ published_at: '2026-01-01T00:00:00Z' }));
  });

  it('refuses an empty body', async () => {
    await expect(saveStory({ ...base, body: '  ' })).rejects.toThrow('empty');
  });

  it('explains a duplicate URL clearly', async () => {
    insertMock.mockReturnValueOnce(Promise.resolve({ error: { message: 'duplicate key value violates unique constraint "stories_slug_key"' } }) as unknown as ReturnType<typeof insertMock>);
    await expect(saveStory(base)).rejects.toThrow('already uses the URL');
  });
});
