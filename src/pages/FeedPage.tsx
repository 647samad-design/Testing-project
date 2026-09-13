import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Rss, Heart, MessageCircle, Calendar, MapPin, ExternalLink, Pin,
  Users, Scale, Bell, Share2, TrendingUp, Flame, Sparkles, Zap,
  Mic, Vote as VoteIcon, Newspaper, ChevronRight, UserPlus, Bookmark,
  CheckCircle2, ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import {
  getSocialFeed, getFollowedCandidates, getFollowedIssues,
  togglePostLike, getNotifications, getFollowerCount,
} from '@/services/social';
import { cn } from '@/lib/utils';
import type { FeedPost, Candidate, Issue, AppNotification, FeedPostType } from '@/types';

const POST_TYPE_STYLES: Record<FeedPostType, { label: string; icon: typeof Zap; color: string; bg: string; ring: string }> = {
  update: { label: 'Update', icon: Zap, color: 'text-primary', bg: 'bg-primary/5', ring: 'ring-primary/15' },
  event: { label: 'Event', icon: Calendar, color: 'text-accent', bg: 'bg-accent/5', ring: 'ring-accent/20' },
  position_change: { label: 'Position Change', icon: VoteIcon, color: 'text-warning', bg: 'bg-warning/5', ring: 'ring-warning/20' },
  endorsement: { label: 'Endorsement', icon: Sparkles, color: 'text-success', bg: 'bg-success/5', ring: 'ring-success/20' },
  election_result: { label: 'Race Called', icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/5', ring: 'ring-primary/20' },
  news: { label: 'News', icon: Newspaper, color: 'text-accent', bg: 'bg-accent/5', ring: 'ring-accent/15' },
};

const NOTIF_ICONS: Record<string, { icon: typeof Bell; color: string }> = {
  position_change: { icon: VoteIcon, color: 'text-warning' },
  new_post: { icon: Zap, color: 'text-primary' },
  question_answered: { icon: MessageCircle, color: 'text-accent' },
  new_voting_record: { icon: Scale, color: 'text-primary' },
  new_event: { icon: Calendar, color: 'text-accent' },
  new_endorsement: { icon: Sparkles, color: 'text-success' },
  new_follower: { icon: UserPlus, color: 'text-primary' },
  team_invite: { icon: Users, color: 'text-accent' },
};

export function FeedPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [followedCandidates, setFollowedCandidates] = useState<Candidate[]>([]);
  const [followedIssues, setFollowedIssues] = useState<Issue[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | FeedPostType>('all');
  const [likedAnim, setLikedAnim] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    async function load() {
      const [feed, candidates, issues, notifs] = await Promise.all([
        getSocialFeed(),
        getFollowedCandidates(),
        getFollowedIssues(),
        getNotifications(true),
      ]);
      setPosts(feed);
      setFollowedCandidates(candidates.map((f) => f.candidate).filter(Boolean) as Candidate[]);
      setFollowedIssues(issues.map((f) => f.issue).filter(Boolean) as Issue[]);
      setNotifications(notifs);
      setLoading(false);
    }
    load();
  }, [user]);

  if (!user) {
    return (
      <div className="mx-auto max-w-content px-4 sm:px-6 py-20 animate-fade-in">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 to-accent/15 animate-float">
            <Rss className="h-10 w-10 text-primary" />
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight mb-3">Civic Wire</h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Follow candidates and issues. Get their latest posts, election results, and news from trusted sources — all in one personalized feed.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link to="/signin">
              <Button size="lg" className="rounded-2xl w-full sm:w-auto gap-2 shadow-md shadow-primary/20">
                Sign In to Get Started
              </Button>
            </Link>
            <Link to="/candidates">
              <Button size="lg" variant="outline" className="rounded-2xl w-full sm:w-auto">
                Browse Candidates
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5 rounded-3xl animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-12 w-12 rounded-full bg-secondary" />
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-secondary" />
                  <div className="h-3 w-20 rounded bg-secondary" />
                </div>
              </div>
              <div className="h-4 w-full rounded bg-secondary mb-2" />
              <div className="h-4 w-3/4 rounded bg-secondary" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const unreadCount = notifications.length;
  const filteredPosts = filter === 'all' ? posts : posts.filter((p) => p.post_type === filter);

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-6 animate-fade-in">
      {/* Stories-style circles for followed candidates */}
      {followedCandidates.length > 0 && (
        <div className="mb-6 flex items-center gap-4 overflow-x-auto no-scrollbar pb-2">
          {followedCandidates.slice(0, 10).map((c, i) => (
            <Link
              key={c.id}
              to={`/candidates/${c.id}`}
              className="group flex flex-col items-center gap-1.5 shrink-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="relative">
                <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary to-accent opacity-60 group-hover:opacity-100 transition-opacity" />
                <Avatar className="relative h-16 w-16 border-2 border-background">
                  {c.photo_url ? (
                    <img src={c.photo_url} alt={`${c.first_name} ${c.last_name}`} className="h-full w-full object-cover" />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                      {c.first_name?.[0]}{c.last_name?.[0]}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
              <span className="text-[11px] font-semibold text-foreground max-w-[64px] truncate">
                {c.first_name}
              </span>
            </Link>
          ))}
          <Link
            to="/candidates"
            className="flex flex-col items-center gap-1.5 shrink-0"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors">
              <UserPlus className="h-5 w-5 text-muted-foreground" />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground">More</span>
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main feed column */}
        <div className="space-y-4">
          {/* Feed header with filter pills */}
          <div className="flex items-center justify-between gap-2 sticky top-16 z-10 bg-background/80 backdrop-blur-md py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {(['all', 'update', 'event', 'position_change', 'endorsement', 'election_result', 'news'] as const).map((f) => {
                const style = f === 'all' ? null : POST_TYPE_STYLES[f];
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'rounded-full px-3.5 py-1.5 text-xs font-bold transition-all touch-target whitespace-nowrap',
                      filter === f
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
                    )}
                  >
                    {f === 'all' ? 'All' : style?.label}
                  </button>
                );
              })}
            </div>
            {unreadCount > 0 && (
              <Link to="/account" className="shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5 rounded-full text-xs">
                  <Bell className="h-3.5 w-3.5 text-accent" />
                  <span className="bg-accent text-white rounded-full px-1.5 text-[10px] font-bold">{unreadCount}</span>
                </Button>
              </Link>
            )}
          </div>

          {filteredPosts.length === 0 ? (
            <EmptyFeed hasFollows={followedCandidates.length > 0 || followedIssues.length > 0} />
          ) : (
            filteredPosts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                likedAnim={likedAnim.has(post.id)}
                onLike={() => handleLike(post)}
                onShare={() => handleShare(post)}
              />
            ))
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* What's New — notifications */}
          {notifications.length > 0 && (
            <Card className="p-5 rounded-3xl border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15">
                  <Bell className="h-4 w-4 text-accent" />
                </div>
                <h3 className="font-bold text-sm">What's New</h3>
                <span className="ml-auto text-[10px] font-bold text-accent bg-accent/10 rounded-full px-2 py-0.5">
                  {unreadCount} unread
                </span>
              </div>
              <div className="space-y-1">
                {notifications.slice(0, 6).map((n) => {
                  const iconDef = NOTIF_ICONS[n.type] ?? { icon: Bell, color: 'text-muted-foreground' };
                  const Icon = iconDef.icon;
                  return (
                    <Link
                      key={n.id}
                      to={n.candidate_id ? `/candidates/${n.candidate_id}` : '/feed'}
                      className="group flex items-start gap-2.5 rounded-2xl p-2.5 hover:bg-secondary/50 transition-all"
                    >
                      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary/50', iconDef.color)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground leading-snug">{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      </div>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-foreground transition-colors mt-1" />
                    </Link>
                  );
                })}
              </div>
              {notifications.length > 6 && (
                <Link to="/account" className="mt-3 block text-center text-xs font-bold text-accent hover:underline">
                  View all notifications
                </Link>
              )}
            </Card>
          )}

          {/* Following stats — fun card */}
          <Card className="p-5 rounded-3xl overflow-hidden relative">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/8 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-bold text-sm">Your Network</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-primary/5 p-3 text-center">
                  <p className="text-2xl font-extrabold text-primary">{followedCandidates.length}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground">Candidates</p>
                </div>
                <div className="rounded-2xl bg-accent/5 p-3 text-center">
                  <p className="text-2xl font-extrabold text-accent">{followedIssues.length}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground">Issues</p>
                </div>
              </div>
              <Link to="/candidates" className="mt-3 flex items-center justify-center gap-1 text-xs font-bold text-primary hover:underline">
                Discover more <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </Card>

          {/* Followed candidates — compact list */}
          {followedCandidates.length > 0 && (
            <Card className="p-5 rounded-3xl">
              <h3 className="font-bold text-sm mb-3">Following</h3>
              <div className="space-y-1">
                {followedCandidates.slice(0, 6).map((c) => (
                  <Link
                    key={c.id}
                    to={`/candidates/${c.id}`}
                    className="group flex items-center gap-2.5 rounded-2xl p-2 hover:bg-secondary/50 transition-all"
                  >
                    <Avatar className="h-9 w-9 border border-border">
                      {c.photo_url ? (
                        <img src={c.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                          {c.first_name?.[0]}{c.last_name?.[0]}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">{c.first_name} {c.last_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{c.party}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Followed issues — colorful pills */}
          {followedIssues.length > 0 && (
            <Card className="p-5 rounded-3xl">
              <div className="flex items-center gap-2 mb-3">
                <Scale className="h-4 w-4 text-primary" />
                <h3 className="font-bold text-sm">Issues You Follow</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {followedIssues.map((issue) => (
                  <Link key={issue.id} to="/issues">
                    <Badge
                      variant="secondary"
                      className="rounded-xl cursor-pointer hover:scale-105 transition-transform font-semibold text-xs py-1.5 px-3"
                    >
                      {issue.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Trending — explore more */}
          <Card className="p-5 rounded-3xl border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                <Flame className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-bold text-sm">Explore BallotLens</h3>
            </div>
            <div className="space-y-2">
              <ExploreLink to="/candidates" icon={Users} label="Browse all candidates" />
              <ExploreLink to="/issues" icon={Scale} label="Follow more issues" />
              <ExploreLink to="/compare" icon={TrendingUp} label="Compare candidates" />
              <ExploreLink to="/ask" icon={Mic} label="Ask BallotLens AI" />
              <ExploreLink to="/stories" icon={Newspaper} label="Read civic stories" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  async function handleLike(post: FeedPost) {
    const newLiked = !post.liked_by_me;
    setPosts((prev) => prev.map((p) =>
      p.id === post.id
        ? { ...p, liked_by_me: newLiked, like_count: (p.like_count ?? 0) + (newLiked ? 1 : -1) }
        : p
    ));
    if (newLiked) {
      setLikedAnim((prev) => new Set(prev).add(post.id));
      setTimeout(() => setLikedAnim((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      }), 600);
    }
    await togglePostLike(post.id, newLiked);
  }

  function handleShare(post: FeedPost) {
    const candidate = post.candidate;
    const url = candidate ? `${window.location.origin}/candidates/${candidate.id}` : window.location.origin;
    if (navigator.share) {
      navigator.share({ title: candidate ? `${candidate.first_name} ${candidate.last_name}` : 'BallotLens', text: post.body, url });
    } else {
      navigator.clipboard.writeText(url);
    }
  }
}

function FeedPostCard({ post, onLike, onShare, likedAnim }: {
  post: FeedPost;
  onLike: () => void;
  onShare: () => void;
  likedAnim: boolean;
}) {
  const candidate = post.candidate;
  const typeStyle = POST_TYPE_STYLES[post.post_type];
  const TypeIcon = typeStyle.icon;
  const isEvent = post.post_type === 'event';
  const isElectionResult = post.post_type === 'election_result';
  const isNews = post.post_type === 'news';
  const isSourcePost = !candidate && (isElectionResult || isNews) && !!post.source_name;
  const sourceUrl = post.source_url ?? post.link_url;

  return (
    <Card className={cn(
      'rounded-3xl overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/5',
      typeStyle.bg,
      typeStyle.ring,
      'ring-1',
      post.is_pinned && 'ring-2 ring-primary/30'
    )}>
      {/* Pinned banner */}
      {post.is_pinned && (
        <div className="flex items-center gap-1.5 bg-primary/10 px-5 py-1.5 text-xs font-bold text-primary">
          <Pin className="h-3 w-3" />
          Pinned by campaign
        </div>
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          {isSourcePost ? (
            <div className="relative shrink-0">
              <div className={cn('flex h-12 w-12 items-center justify-center rounded-full border-2 border-border', typeStyle.bg)}>
                <TypeIcon className={cn('h-6 w-6', typeStyle.color)} />
              </div>
            </div>
          ) : (
            <Link to={candidate ? `/candidates/${candidate.id}` : '#'}>
              <div className="relative">
                <Avatar className="h-12 w-12 border-2 border-border">
                  {candidate?.photo_url ? (
                    <img src={candidate.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                      {candidate?.first_name?.[0]}{candidate?.last_name?.[0]}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
            </Link>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isSourcePost ? (
                <span className="font-bold text-sm flex items-center gap-1.5">
                  {isElectionResult && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                  {post.source_name}
                </span>
              ) : (
                <Link to={candidate ? `/candidates/${candidate.id}` : '#'} className="font-bold text-sm hover:underline">
                  {candidate?.first_name} {candidate?.last_name}
                </Link>
              )}
              {candidate?.party && (
                <span className="text-xs text-muted-foreground">{candidate.party}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground">{formatTimeAgo(post.created_at)}</p>
              <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider', typeStyle.color)}>
                <TypeIcon className="h-3 w-3" />
                {typeStyle.label}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <p className="text-[15px] leading-relaxed text-foreground mb-3 whitespace-pre-wrap">{post.body}</p>

        {/* Image */}
        {post.image_url && (
          <div className="relative rounded-2xl overflow-hidden mb-3 group">
            <img src={post.image_url} alt="" className="w-full max-h-96 object-cover" />
          </div>
        )}

        {/* Event card — colorful */}
        {isEvent && (post.event_date || post.event_location) && (
          <div className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/8 to-transparent p-4 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-accent" />
              <span className="text-xs font-bold uppercase tracking-wider text-accent">Upcoming Event</span>
            </div>
            {post.event_date && (
              <div className="flex items-center gap-2 text-sm mb-1">
                <span className="font-bold text-foreground">{formatDate(post.event_date)}</span>
                {post.event_start_time && (
                  <span className="text-muted-foreground">at {post.event_start_time}{post.event_end_time ? `–${post.event_end_time}` : ''}</span>
                )}
              </div>
            )}
            {post.event_location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {post.event_location}
              </div>
            )}
            {post.event_rsvp_count > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                <div className="flex -space-x-2">
                  {[...Array(Math.min(3, post.event_rsvp_count))].map((_, i) => (
                    <div key={i} className="h-6 w-6 rounded-full bg-accent/20 border-2 border-card" />
                  ))}
                </div>
                <p className="text-xs font-semibold text-accent">{post.event_rsvp_count} interested</p>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="rounded-xl gap-1.5 text-xs h-8">
                <Heart className="h-3.5 w-3.5" />
                Interested
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs h-8">
                <Calendar className="h-3.5 w-3.5" />
                Add to Calendar
              </Button>
            </div>
          </div>
        )}

        {/* Link preview / source link */}
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline mb-3 rounded-xl bg-secondary/30 p-2.5">
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">{sourceUrl}</span>
          </a>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-1 pt-3 border-t border-border/40">
          <button
            onClick={onLike}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-all touch-target',
              post.liked_by_me ? 'text-accent bg-accent/10' : 'text-muted-foreground hover:text-accent hover:bg-accent/5'
            )}
          >
            <Heart className={cn('h-4 w-4 transition-transform', post.liked_by_me && 'fill-current', likedAnim && 'scale-125')} />
            {post.like_count ?? 0}
          </button>
          {!isSourcePost && (
            <Link
              to={candidate ? `/candidates/${candidate.id}?tab=questions` : '#'}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all touch-target"
            >
              <MessageCircle className="h-4 w-4" />
              Ask
            </Link>
          )}
          <button
            onClick={onShare}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all touch-target"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all touch-target">
            <Bookmark className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function EmptyFeed({ hasFollows }: { hasFollows: boolean }) {
  return (
    <Card className="p-10 rounded-3xl text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10">
        {hasFollows ? (
          <Rss className="h-8 w-8 text-primary" />
        ) : (
          <UserPlus className="h-8 w-8 text-primary" />
        )}
      </div>
      <h3 className="font-bold text-lg mb-2">
        {hasFollows ? 'No posts match this filter' : 'Your feed is waiting!'}
      </h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto leading-relaxed">
        {hasFollows
          ? 'Try switching to "All" to see everything from the candidates you follow.'
          : 'Follow candidates and issues to get their latest updates, events, and positions right here.'}
      </p>
      <Link to="/candidates">
        <Button className="rounded-2xl gap-2">
          <Users className="h-4 w-4" />
          Discover Candidates
        </Button>
      </Link>
    </Card>
  );
}

function ExploreLink({ to, icon: Icon, label }: { to: string; icon: typeof Users; label: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2.5 rounded-2xl p-2.5 hover:bg-secondary/50 transition-all"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/8 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</span>
      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
    </Link>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
