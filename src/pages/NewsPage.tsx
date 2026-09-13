import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Newspaper, Video, MessageCircle, Play, ArrowLeft, User } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NewsCard } from '@/components/shared/NewsCard';
import { DemoBanner } from '@/components/shared/DemoBanner';
import { AdSlot } from '@/components/shared/AdSlot';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import { getMediaByTab } from '@/services/news';
import { getCandidate } from '@/services/candidates';
import type { NewsArticle, Video as VideoType, SocialPost, Candidate } from '@/types';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'news', label: 'News' },
  { id: 'local-news', label: 'Local News' },
  { id: 'investigations', label: 'Investigations' },
  { id: 'video', label: 'Video' },
  { id: 'debates', label: 'Debates' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'speeches', label: 'Speeches' },
  { id: 'town-halls', label: 'Town Halls' },
  { id: 'social', label: 'Social' },
  { id: 'podcasts', label: 'Podcasts' },
];

export function NewsPage() {
  const [searchParams] = useSearchParams();
  const candidateId = searchParams.get('c') ?? undefined;
  const [activeTab, setActiveTab] = useState('all');
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [videos, setVideos] = useState<VideoType[]>([]);
  const [social, setSocial] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidate, setCandidate] = useState<Candidate | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (candidateId) {
        const cand = await getCandidate(candidateId);
        setCandidate(cand);
      } else {
        setCandidate(null);
      }
      const result = await getMediaByTab(activeTab, candidateId);
      setNews(result.news);
      setVideos(result.videos);
      setSocial(result.social);
      setLoading(false);
    }
    load();
  }, [activeTab, candidateId]);

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">News & Media</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Coverage from multiple source types. BallotLens clearly distinguishes reporting from opinion.
        </p>
        <div className="mt-4">
          <DemoBanner compact />
        </div>
      </div>

      {/* Candidate context banner */}
      {candidate && (
        <Card className="mb-6 p-4 rounded-2xl">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border border-border bg-secondary shrink-0">
              <AvatarFallback className="bg-secondary text-sm font-semibold">
                {candidate.first_name[0] ?? ''}{candidate.last_name[0] ?? ''}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Showing media for</p>
              <p className="font-bold text-foreground truncate">{candidate.first_name} {candidate.last_name}</p>
            </div>
            <Link to={`/candidates/${candidate.id}`}>
              <button className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary touch-target">
                <User className="h-4 w-4" />
                View Profile
              </button>
            </Link>
          </div>
        </Card>
      )}

      {/* Back to news link when filtered */}
      {candidateId && (
        <Link to="/news" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          All news & media
        </Link>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto no-scrollbar h-auto flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="shrink-0">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {loading ? (
          <LoadingState message="Loading media…" />
        ) : (
          <div className="mt-6 space-y-6">
            {/* News articles */}
            {news.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <Newspaper className="h-4 w-4" />
                  Articles
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {news.map((article) => (
                    <div key={article.id} className="space-y-1">
                      <NewsCard article={article} />
                      {article.candidate && !candidateId && (
                        <Link to={`/candidates/${article.candidate.id}`} className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          <User className="h-3 w-3" />
                          {article.candidate.first_name} {article.candidate.last_name}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Videos */}
            {videos.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <Video className="h-4 w-4" />
                  Videos
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {videos.map((video) => (
                    <VideoCard key={video.id} video={video} />
                  ))}
                </div>
              </section>
            )}

            {/* Social posts */}
            {social.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <MessageCircle className="h-4 w-4" />
                  Social Posts
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {social.map((post) => (
                    <SocialCard key={post.id} post={post} />
                  ))}
                </div>
              </section>
            )}

            {news.length === 0 && videos.length === 0 && social.length === 0 && (
              <EmptyState
                title="No media in this category"
                description="There are no items in this category yet. Try another tab."
                icon={<Newspaper className="h-10 w-10" />}
              />
            )}
          </div>
        )}
      </Tabs>

      <div className="mt-8">
        <AdSlot placement="news_page" />
      </div>
    </div>
  );
}

function VideoCard({ video }: { video: VideoType }) {
  return (
    <a href={video.url ?? '#'} target="_blank" rel="noopener noreferrer" className="block">
      <Card className="group p-4 transition-all hover:border-primary/30 hover:shadow-sm">
        <div className="flex items-start gap-3">
          <div className="relative flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-secondary overflow-hidden">
            {video.thumbnail_url ? (
              <img src={video.thumbnail_url} alt={video.title} className="h-full w-full object-cover" />
            ) : (
              <Play className="h-6 w-6 text-muted-foreground" />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
              <Play className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {video.video_type && (
                <span className="text-xs font-medium uppercase text-muted-foreground">{video.video_type.replace(/_/g, ' ')}</span>
              )}
            </div>
            <h3 className="mt-1 font-medium text-foreground leading-snug group-hover:text-primary transition-colors">
              {video.title}
            </h3>
            {video.publisher && (
              <p className="mt-1 text-xs text-muted-foreground">{video.publisher}</p>
            )}
          </div>
        </div>
      </Card>
    </a>
  );
}

function SocialCard({ post }: { post: SocialPost }) {
  return (
    <a href={post.url ?? '#'} target="_blank" rel="noopener noreferrer" className="block">
      <Card className="group p-4 transition-all hover:border-primary/30 hover:shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50">
            <MessageCircle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {post.platform && (
                <span className="text-xs font-medium text-muted-foreground">{post.platform}</span>
              )}
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                Social Media
              </span>
            </div>
            {post.candidate && (
              <p className="mt-1 text-sm font-medium text-foreground">
                {post.candidate.first_name} {post.candidate.last_name}
              </p>
            )}
            {post.content && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{post.content}</p>
            )}
            {post.posted_date && (
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(post.posted_date)}</p>
            )}
          </div>
        </div>
      </Card>
    </a>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
