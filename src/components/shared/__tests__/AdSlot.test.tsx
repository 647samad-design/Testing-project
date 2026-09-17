import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const { useIsPaidUserMock, getActiveAdsMock } = vi.hoisted(() => ({
  useIsPaidUserMock: vi.fn(),
  getActiveAdsMock: vi.fn(),
}));

vi.mock('@/hooks/use-subscription', () => ({
  useIsPaidUser: useIsPaidUserMock,
}));

vi.mock('@/services/advertising', () => ({
  getActiveAds: getActiveAdsMock,
  trackAdEvent: vi.fn(),
}));

vi.mock('@/services/elections', () => ({
  getStoredRegion: () => ({ state: 'FL' }),
}));

import { AdSlot } from '@/components/shared/AdSlot';

describe('AdSlot — ad-free browsing gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never fetches ads for a paid user', async () => {
    useIsPaidUserMock.mockReturnValue({ isPaid: true, loading: false });
    const { container } = render(<AdSlot placement="homepage" />);

    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(getActiveAdsMock).not.toHaveBeenCalled();
  });

  it('fetches and can render ads for a free user', async () => {
    useIsPaidUserMock.mockReturnValue({ isPaid: false, loading: false });
    getActiveAdsMock.mockResolvedValue([]);
    render(<AdSlot placement="homepage" />);

    await waitFor(() => expect(getActiveAdsMock).toHaveBeenCalledWith('homepage', 'FL'));
  });
});
