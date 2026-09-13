import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Calendar, BookOpen, TrendingUp, Heart, Scale, Vote, type LucideProps } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import { AdSlot } from '@/components/shared/AdSlot';
import { getFeaturedStories, getRecentStories, getStoryBySlug, getStoryCategories } from '@/services/stories';
import type { Story, StoryCategory } from '@/types';

const categoryColors: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  rose: 'bg-rose-100 text-rose-700 border-rose-200',
  violet: 'bg-violet-100 text-violet-700 border-violet-200',
};

const categoryIcons: Record<string, React.ComponentType<LucideProps>> = {
  'civic-education': BookOpen,
  'election-analysis': TrendingUp,
  'voter-stories': Heart,
  'local-politics': Vote,
  'legislation-explained': Scale,
  'off-season': Calendar,
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function StoriesPage() {
  const [featured, setFeatured] = useState<Story[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [categories, setCategories] = useState<StoryCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [feat, recent, cats] = await Promise.all([
        getFeaturedStories(3),
        getRecentStories(12),
        getStoryCategories(),
      ]);
      setFeatured(feat);
      setStories(recent);
      setCategories(cats);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (activeCategory) {
      getRecentStories(12, activeCategory).then(setStories);
    } else {
      getRecentStories(12).then(setStories);
    }
  }, [activeCategory]);

  if (loading) return <LoadingState message="Loading stories…" />;

  return (
    <div className="animate-fade-in">
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-background to-background" />
        <div className="absolute top-10 right-1/4 h-64 w-64 rounded-full bg-accent/8 blur-3xl animate-float" />
        <div className="relative mx-auto max-w-content px-4 sm:px-6 py-12 md:py-16">
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Civic Stories
          </h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-2xl">
            Stay informed and engaged between elections. Plain-English explainers,
            voter stories, and civic education — no partisan spin.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-content px-4 sm:px-6 py-10">
        {featured.length > 0 && !activeCategory && (
          <section className="mb-12">
            <h2 className="mb-5 text-2xl font-bold tracking-tight">Featured Stories</h2>
            <div className="grid gap-5 md:grid-cols-3">
              {featured.map((story, i) => {
                const cat = story.category;
                const colorClass = cat?.color ? categoryColors[cat.color] ?? 'bg-secondary text-foreground border-border' : 'bg-secondary text-foreground border-border';
                return (
                  <Link key={story.id} to={`/stories/${story.slug}`} className={`animate-slide-up stagger-${i + 1}`}>
                    <Card className="group h-full overflow-hidden rounded-2xl transition-all hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 hover-lift touch-target">
                      <div className="aspect-video bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                        {cat ? (() => {
                          const Icon = categoryIcons[cat.slug] ?? BookOpen;
                          return <Icon className="h-12 w-12 text-primary/30" strokeWidth={1.5} />;
                        })() : <BookOpen className="h-12 w-12 text-primary/30" strokeWidth={1.5} />}
                      </div>
                      <div className="p-5">
                        {cat && (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${colorClass}`}>
                            {cat.name}
                          </span>
                        )}
                        <h3 className="mt-3 font-bold text-lg leading-snug group-hover:text-primary transition-colors">{story.title}</h3>
                        {story.excerpt && (
                          <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{story.excerpt}</p>
                        )}
                        <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                          {story.read_time_minutes && (
                            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {story.read_time_minutes} min read</span>
                          )}
                          {story.published_at && (
                            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {formatDate(story.published_at)}</span>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className="mb-8 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              !activeCategory ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
            }`}
          >
            All Stories
          </button>
          {categories.map((cat) => {
            const colorClass = cat.color ? categoryColors[cat.color] ?? 'bg-secondary text-foreground border-border' : 'bg-secondary text-foreground border-border';
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                  activeCategory === cat.id ? colorClass + ' ring-2 ring-primary/20' : 'bg-secondary text-muted-foreground hover:bg-secondary/70 border-border'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>

        <div className="mb-8">
          <AdSlot placement="homepage" />
        </div>

        <section>
          <h2 className="mb-5 text-2xl font-bold tracking-tight">
            {activeCategory ? categories.find(c => c.id === activeCategory)?.name : 'Recent Stories'}
          </h2>
          {stories.length === 0 ? (
            <EmptyState title="No stories yet" description="Check back soon for new civic education content." icon={<BookOpen className="h-10 w-10" />} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {stories.map((story, i) => {
                const cat = story.category;
                const colorClass = cat?.color ? categoryColors[cat.color] ?? 'bg-secondary text-foreground border-border' : 'bg-secondary text-foreground border-border';
                return (
                  <Link key={story.id} to={`/stories/${story.slug}`} className={`animate-slide-up stagger-${Math.min(i + 1, 6)}`}>
                    <Card className="group h-full overflow-hidden rounded-2xl transition-all hover:shadow-lg hover:border-primary/30 hover-lift touch-target">
                      <div className="p-5">
                        {cat && (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${colorClass}`}>
                            {cat.name}
                          </span>
                        )}
                        <h3 className="mt-3 font-bold text-base leading-snug group-hover:text-primary transition-colors">{story.title}</h3>
                        {story.excerpt && (
                          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{story.excerpt}</p>
                        )}
                        <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                          {story.read_time_minutes && (
                            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {story.read_time_minutes} min</span>
                          )}
                          {story.published_at && <span>{formatDate(story.published_at)}</span>}
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function StoryDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    async function load() {
      setLoading(true);
      const data = await getStoryBySlug(slug!);
      setStory(data);
      setLoading(false);
    }
    load();
  }, [slug]);

  if (loading) return <LoadingState message="Loading story…" />;
  if (!story) return <EmptyState title="Story not found" description="This story may have been removed." icon={<BookOpen className="h-10 w-10" />} />;

  const cat = story.category;
  const colorClass = cat?.color ? categoryColors[cat.color] ?? 'bg-secondary text-foreground border-border' : 'bg-secondary text-foreground border-border';

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 animate-fade-in">
      <Link to="/stories" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="h-4 w-4" />
        All stories
      </Link>

      <article className="mt-6">
        {cat && (
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${colorClass}`}>
            {cat.name}
          </span>
        )}
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl leading-tight">{story.title}</h1>
        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          {story.author_name && <span>By {story.author_name}</span>}
          {story.published_at && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {formatDate(story.published_at)}</span>}
          {story.read_time_minutes && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {story.read_time_minutes} min read</span>}
        </div>

        {story.excerpt && (
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed font-medium border-l-4 border-primary/20 pl-4">
            {story.excerpt}
          </p>
        )}

        <div className="mt-8 prose prose-neutral max-w-none">
          {story.body.split('\n').map((para, i) => (
            <p key={i} className="mb-4 text-foreground leading-relaxed">{para}</p>
          ))}
        </div>

        {story.tags && (
          <div className="mt-8 flex flex-wrap gap-2">
            {story.tags.split(',').map((tag, i) => (
              <span key={i} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                #{tag.trim()}
              </span>
            ))}
          </div>
        )}
      </article>

      <div className="mt-10 border-t border-border pt-6">
        <p className="text-xs text-muted-foreground">
          This is editorial content from BallotLens. It does not endorse any
          candidate or political position. For candidate information, visit our{' '}
          <Link to="/candidates" className="text-primary hover:underline">Candidates page</Link>.
        </p>
      </div>

      <div className="mt-8">
        <AdSlot placement="homepage" />
      </div>
    </div>
  );
}
