import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/services/social';
import type { AppNotification } from '@/types';

/**
 * A persistent, always-visible notification bell for the header. Previously,
 * notifications only appeared inside a section on the Feed page itself --
 * anyone browsing the rest of the app (their ballot, a candidate profile,
 * anywhere) had no way to know they had an unread notification unless they
 * specifically navigated to /feed and scrolled to that section.
 */
export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      const data = await getNotifications();
      if (!cancelled) setNotifications(data);
    }
    load();
    // Light polling so a notification created while the user is browsing
    // elsewhere in the app still surfaces without a full page reload.
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!user) return null;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function handleOpenNotification(n: AppNotification) {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    setOpen(false);
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors touch-target"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-background shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <Link
                  key={n.id}
                  to={n.candidate_id ? `/candidates/${n.candidate_id}` : '/feed'}
                  onClick={() => handleOpenNotification(n)}
                  className={`block px-4 py-3 text-sm border-b border-border last:border-0 hover:bg-secondary/50 transition-colors ${!n.is_read ? 'bg-primary/5' : ''}`}
                >
                  <p className="font-medium">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
