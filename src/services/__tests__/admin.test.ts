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

import { updateCandidate, deleteCandidate, addCandidate, setAdminRole, compCandidateManagement, revokeCandidateManagement, getPendingClaims, approveClaim, rejectClaim } from '@/services/admin';

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
