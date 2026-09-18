import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { useAuthMock, getNotificationsMock, markAllNotificationsReadMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  getNotificationsMock: vi.fn(),
  markAllNotificationsReadMock: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({ useAuth: useAuthMock }));
vi.mock('@/services/social', () => ({
  getNotifications: getNotificationsMock,
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: markAllNotificationsReadMock,
}));

import { NotificationBell } from '@/components/shared/NotificationBell';

function renderBell() {
  return render(<MemoryRouter><NotificationBell /></MemoryRouter>);
}

describe('NotificationBell', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing for a signed-out user', () => {
    useAuthMock.mockReturnValue({ user: null });
    const { container } = renderBell();
    expect(container.firstChild).toBeNull();
    expect(getNotificationsMock).not.toHaveBeenCalled();
  });

  it('shows an unread count badge when there are unread notifications', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
    getNotificationsMock.mockResolvedValue([
      { id: 'n1', is_read: false, title: 'New position added', body: null, candidate_id: null, created_at: new Date().toISOString() },
      { id: 'n2', is_read: true, title: 'Old one', body: null, candidate_id: null, created_at: new Date().toISOString() },
    ]);
    renderBell();

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });

  it('opening the dropdown and clicking "Mark all read" clears the badge', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
    getNotificationsMock.mockResolvedValue([
      { id: 'n1', is_read: false, title: 'New position added', body: null, candidate_id: null, created_at: new Date().toISOString() },
    ]);
    markAllNotificationsReadMock.mockResolvedValue(undefined);
    renderBell();

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Notifications'));
    fireEvent.click(await screen.findByText('Mark all read'));

    await waitFor(() => expect(markAllNotificationsReadMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('1')).not.toBeInTheDocument());
  });
});
