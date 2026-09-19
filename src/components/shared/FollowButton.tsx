import { useEffect, useState } from 'react';
import { UserPlus, UserCheck, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { follow, unfollow, isFollowing, getFollowerCount } from '@/services/social';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { FollowableType } from '@/types';

export function FollowButton({
  followableType,
  followableId,
  size = 'sm',
  showCount = true,
}: {
  followableType: FollowableType;
  followableId: string;
  size?: 'sm' | 'default';
  showCount?: boolean;
}) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      const [f, c] = await Promise.all([
        user ? isFollowing(followableType, followableId) : false,
        showCount ? getFollowerCount(followableType, followableId) : Promise.resolve(0),
      ]);
      setFollowing(f);
      setCount(c);
      setLoading(false);
    }
    check();
  }, [user, followableType, followableId, showCount]);

  async function handleClick() {
    if (!user) return;
    const newFollowing = !following;
    setFollowing(newFollowing);
    setCount((c) => c + (newFollowing ? 1 : -1));
    try {
      if (newFollowing) {
        await follow(followableType, followableId);
      } else {
        await unfollow(followableType, followableId);
      }
    } catch (err) {
      setFollowing(!newFollowing);
      setCount((c) => c + (newFollowing ? -1 : 1));
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  if (!user) {
    return showCount && count > 0 ? (
      <span className="text-xs text-muted-foreground font-semibold">{count} followers</span>
    ) : null;
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleClick}
        disabled={loading}
        size={size}
        variant={following ? 'outline' : 'default'}
        className={cn('rounded-xl touch-target gap-2 font-semibold', following && 'text-primary')}
      >
        {following ? (
          <>
            <UserCheck className="h-4 w-4" />
            Following
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" />
            Follow
          </>
        )}
      </Button>
      {showCount && count > 0 && (
        <span className="text-xs text-muted-foreground font-semibold">{count}</span>
      )}
    </div>
  );
}

export function IssueFollowButton({ issueId, issueName }: { issueId: string; issueName: string }) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      if (!user) { setLoading(false); return; }
      const f = await isFollowing('issue', issueId);
      setFollowing(f);
      setLoading(false);
    }
    check();
  }, [user, issueId]);

  async function handleClick() {
    if (!user) return;
    const newFollowing = !following;
    setFollowing(newFollowing);
    try {
      if (newFollowing) await follow('issue', issueId);
      else await unfollow('issue', issueId);
    } catch {
      setFollowing(!newFollowing);
    }
  }

  if (!user) return null;

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      size="sm"
      variant={following ? 'outline' : 'default'}
      className={cn('rounded-xl touch-target gap-1.5', following && 'text-primary')}
    >
      <Heart className={cn('h-3.5 w-3.5', following && 'fill-current text-accent')} />
      {following ? 'Following' : `Follow ${issueName}`}
    </Button>
  );
}
