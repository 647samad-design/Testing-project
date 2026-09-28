import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, getUserMock } = vi.hoisted(() => ({ fromMock: vi.fn(), getUserMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

import { submitContentReport, getPendingReports, markReportReviewed, getReportedContentPreview, removeReportedFeedPost } from '@/services/content-reports';

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

describe('report review helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('previews a reported feed post by its body instead of a bare UUID', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { body: 'spam spam' }, error: null }) }) }) });
    expect(await getReportedContentPreview('feed_post', 'p1')).toBe('Feed post: "spam spam"');
  });

  it('returns null when the reported content no longer exists', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) });
    expect(await getReportedContentPreview('candidate', 'gone')).toBeNull();
  });

  it('returns null for content types without a preview', async () => {
    expect(await getReportedContentPreview('message', 'm1')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('removeReportedFeedPost deletes by id and throws on failure', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ delete: () => ({ eq: eqMock }) });
    await removeReportedFeedPost('p1');
    expect(fromMock).toHaveBeenCalledWith('feed_posts');
    expect(eqMock).toHaveBeenCalledWith('id', 'p1');

    fromMock.mockReturnValue({ delete: () => ({ eq: vi.fn().mockResolvedValue({ error: new Error('not allowed') }) }) });
    await expect(removeReportedFeedPost('p1')).rejects.toThrow('not allowed');
  });
});
