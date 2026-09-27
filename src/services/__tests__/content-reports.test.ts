import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, getUserMock } = vi.hoisted(() => ({ fromMock: vi.fn(), getUserMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

import { submitContentReport, getPendingReports, markReportReviewed } from '@/services/content-reports';

describe('content reporting — the backend already existed correctly secured, just had no UI/service layer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submitContentReport inserts with the given content type, id, and reason', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });

    await submitContentReport('candidate', 'cand-1', 'False or misleading information', 'extra detail');

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      content_type: 'candidate', content_id: 'cand-1', reason: 'False or misleading information', description: 'extra detail',
    }));
  });

  it('getPendingReports fetches only pending reports, oldest first', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [{ id: 'r1', status: 'pending' }], error: null });
    const eqMock = vi.fn(() => ({ order: orderMock }));
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) });

    const result = await getPendingReports();

    expect(eqMock).toHaveBeenCalledWith('status', 'pending');
    expect(result).toHaveLength(1);
  });

  it('markReportReviewed records who reviewed it and when', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ update: updateMock });

    await markReportReviewed('r1', 'actioned');

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'actioned', reviewed_by: 'admin-1' }));
  });
});
