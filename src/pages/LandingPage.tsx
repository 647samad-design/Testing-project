import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, MapPin, Navigation, ShieldCheck, Scale, FileText, ArrowRight, Sparkles, Heart, Clock, MessageCircle, Rss } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DemoBanner } from '@/components/shared/DemoBanner';
import { AdSlot } from '@/components/shared/AdSlot';
import { getFeaturedStories } from '@/services/stories';
import type { Story } from '@/types';
import { getVoterDistricts } from '@/services/elections';
import { saveLocation, getLocation } from '@/services/districts';
import { useAuth } from '@/hooks/use-auth';

export function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);

  useEffect(() => {
    getFeaturedStories(3).then(setStories);
  }, []);

  useEffect(() => {
    if (!user) return;
    getLocation().then((loc) => {
      if (loc) {
        const saved = loc.city ? `${loc.city}, ${loc.state} ${loc.zip_code}` : loc.zip_code;
        setAddress(saved);
      }
    });
  }, [user]);

  async function handleFindBallot() {
    if (!address.trim()) {
      setError('Please enter your address or ZIP code.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const districts = await getVoterDistricts(address);
      if (!districts.state) {
        setError("We couldn't find that ZIP code. Please enter a valid ZIP code.");
        setLoading(false);
        return;
      }
      if (!districts.state) {
        setError("We couldn't find that location. Please check your address and try again.");
        setLoading(false);
        return;
      }
      sessionStorage.setItem('ballotlens_address', address);
      if (user) {
        const zip = address.match(/\b(\d{5})\b/)?.[1];
        await saveLocation(zip ?? address, districts.municipal, districts.state, districts.county).catch(() => {});
      }
      navigate('/ballot');
    } catch {
      setError("We couldn't find that address. Check the address and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-background to-background" />
        {/* Decorative blobs */}
        <div className="absolute top-10 right-1/4 h-72 w-72 rounded-full bg-accent/8 blur-3xl animate-float" />
        <div className="absolute top-20 left-1/4 h-64 w-64 rounded-full bg-primary/10 blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />

        <div className="relative mx-auto max-w-content px-4 sm:px-6 py-16 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 flex justify-center">
              <DemoBanner compact />
            </div>
            <h1 className="font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl md:text-7xl leading-[1.05]">
              Know what's on
              <br />
              <span className="text-primary">your ballot.</span>
            </h1>
            <p className="mt-7 text-lg text-muted-foreground sm:text-xl leading-relaxed max-w-2xl mx-auto">
              Research the candidates, issues and decisions on your ballot —
              with evidence from reliable sources, not opinions.
            </p>

            {/* Address search */}
            <div className="mt-10 mx-auto max-w-2xl">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Enter your ZIP code"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFindBallot()}
                    className="pl-12 h-14 text-base rounded-2xl shadow-sm border-border/60 bg-card"
                    aria-label="Enter your address or ZIP code"
                  />
                </div>
                <Button
                  size="lg"
                  onClick={handleFindBallot}
                  disabled={loading}
                  className="h-14 px-7 rounded-2xl text-base font-bold touch-target shadow-md shadow-primary/20"
                >
                  {loading ? 'Finding…' : 'Find My Ballot'}
                </Button>
              </div>
              {error && (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>

            {/* Quick CTA buttons */}
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" variant="outline" onClick={() => navigate('/candidates')} className="rounded-2xl font-semibold touch-target">
                Explore Candidates
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="ghost" onClick={() => navigate('/ask')} className="rounded-2xl font-semibold text-accent hover:text-accent/80 touch-target">
                <Sparkles className="mr-2 h-4 w-4" />
                Ask AI
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* YOUR BALLOT IS PERSONAL */}
      <section className="mx-auto max-w-content px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <MapPin className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-3xl font-bold sm:text-4xl tracking-tight">Your ballot is personal.</h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            People living close to one another can have different ballots because
            of congressional, state, county, municipal, judicial, school and
            special districts. BallotLens looks up the races and measures that
            apply to your specific location.
          </p>
        </div>
      </section>

      {/* RESEARCH. DON'T GUESS. */}
      <section className="bg-secondary/30 border-y border-border/60">
        <div className="mx-auto max-w-content px-4 sm:px-6 py-20">
          <div className="text-center">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl tracking-tight">
              Research. Don't guess.
            </h2>
            <p className="mt-3 text-muted-foreground text-lg">
              Three things BallotLens gives you for every race.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <Card className="p-8 text-center hover:shadow-xl hover:shadow-primary/5 transition-all rounded-2xl touch-target">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <FileText className="h-8 w-8 text-primary" strokeWidth={1.8} />
              </div>
              <h3 className="mt-5 font-bold text-xl">Your Ballot</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                See the races and ballot measures that actually apply to you.
              </p>
            </Card>

            <Card className="p-8 text-center hover:shadow-xl hover:shadow-primary/5 transition-all rounded-2xl touch-target">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
                <Scale className="h-8 w-8 text-accent" strokeWidth={1.8} />
              </div>
              <h3 className="mt-5 font-bold text-xl">The Candidates</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Explore biographies, positions, voting records and public statements.
              </p>
            </Card>

            <Card className="p-8 text-center hover:shadow-xl hover:shadow-primary/5 transition-all rounded-2xl touch-target">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
                <ShieldCheck className="h-8 w-8 text-success" strokeWidth={1.8} />
              </div>
              <h3 className="mt-5 font-bold text-xl">The Evidence</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Follow the source behind every claim. Always.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* SOCIAL FEED SHOWCASE */}
      <section className="mx-auto max-w-content px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl tracking-tight">
            More than research. It's a movement.
          </h2>
          <p className="mt-3 text-muted-foreground text-lg max-w-2xl mx-auto">
            Follow candidates, track issues, ask questions, and get updates — all in your personalized feed.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {/* Follow card */}
          <Card className="p-6 rounded-3xl hover:shadow-lg hover:shadow-primary/5 transition-all animate-slide-up stagger-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Heart className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-2">Follow What Matters</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Follow candidates AND issues — from Housing to Public Safety to Education. Your feed gets personal.
            </p>
            <div className="flex flex-wrap gap-2">
              {['Housing', 'Education', 'Taxes', 'Climate', 'Public Safety'].map((t) => (
                <span key={t} className="rounded-full bg-primary/5 border border-primary/15 px-3 py-1 text-xs font-bold text-primary">{t}</span>
              ))}
            </div>
          </Card>

          {/* Ask questions card */}
          <Card className="p-6 rounded-3xl hover:shadow-lg hover:shadow-accent/5 transition-all animate-slide-up stagger-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 mb-4">
              <MessageCircle className="h-6 w-6 text-accent" />
            </div>
            <h3 className="font-bold text-lg mb-2">Ask Candidates Directly</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Submit questions and get answers. Browse a searchable knowledge base organized by topic.
            </p>
            <div className="space-y-2">
              <div className="rounded-xl bg-secondary/40 p-2.5 text-xs">
                <p className="font-bold text-foreground">Q: What's your plan for affordable housing?</p>
                <p className="text-muted-foreground mt-1">A: We need mixed-income zoning reform...</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-semibold text-success">Useful (24)</span>
                <span className="flex items-center gap-1 font-semibold text-primary">Evidence (18)</span>
              </div>
            </div>
          </Card>

          {/* Live feed card */}
          <Card className="p-6 rounded-3xl hover:shadow-lg hover:shadow-success/5 transition-all animate-slide-up stagger-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 mb-4">
              <Rss className="h-6 w-6 text-success" />
            </div>
            <h3 className="font-bold text-lg mb-2">Never Miss an Update</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Candidates post updates, events, and position changes. You see it all in one place.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-secondary/40 p-2.5">
                <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-primary to-accent" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">Sen. Smith posted an update</p>
                  <p className="text-[10px] text-muted-foreground">2h ago</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-secondary/40 p-2.5">
                <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-accent to-warning" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">New town hall event Thursday</p>
                  <p className="text-[10px] text-muted-foreground">5h ago</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-10 text-center">
          <Link to="/feed">
            <Button size="lg" variant="outline" className="rounded-2xl gap-2 touch-target">
              <Rss className="h-4 w-4" />
              Explore the Feed
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* HOMEPAGE AD SLOT */}
      <section className="mx-auto max-w-content px-4 sm:px-6 py-8">
        <AdSlot placement="homepage" />
      </section>

      {/* BUILT FOR VOTERS, NOT CAMPAIGNS */}
      <section className="mx-auto max-w-content px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <Heart className="h-7 w-7 text-accent" />
          </div>
          <h2 className="text-3xl font-bold sm:text-4xl tracking-tight">Built for voters, not campaigns.</h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            BallotLens doesn't tell you who to vote for. It gives you the
            information to decide for yourself.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {['No endorsements', 'No political scores', 'No left/right rankings', 'Evidence-based only'].map((tag) => (
              <span key={tag} className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* HOW BALLOTLENS WORKS */}
      <section className="bg-secondary/30 border-y border-border/60">
        <div className="mx-auto max-w-content px-4 sm:px-6 py-20">
          <h2 className="text-center font-display text-3xl font-semibold sm:text-4xl tracking-tight">
            How it works
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {[
              { step: 1, title: 'Enter your location', icon: MapPin },
              { step: 2, title: 'Find your ballot', icon: FileText },
              { step: 3, title: 'Choose issues you care about', icon: Scale },
              { step: 4, title: 'Research candidates', icon: Search },
              { step: 5, title: 'Follow the evidence', icon: ShieldCheck },
              { step: 6, title: 'Make your decision', icon: Navigation },
            ].map((s) => (
              <Card key={s.step} className="p-6 text-center rounded-2xl hover:shadow-lg transition-all">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-sm shadow-primary/20">
                  {s.step}
                </div>
                <s.icon className="mx-auto mt-4 h-6 w-6 text-primary" strokeWidth={1.8} />
                <p className="mt-3 text-sm font-semibold text-foreground leading-snug">{s.title}</p>
              </Card>
            ))}
          </div>
          <p className="mt-10 text-center text-sm font-semibold text-muted-foreground">
            BallotLens does not tell you who to vote for.
          </p>
        </div>
      </section>

      {/* CIVIC STORIES — keep users engaged year-round */}
      {stories.length > 0 && (
        <section className="bg-secondary/30 border-y border-border/60">
          <div className="mx-auto max-w-content px-4 sm:px-6 py-16">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="font-display text-3xl font-semibold sm:text-4xl tracking-tight">
                  Stay engaged between elections.
                </h2>
                <p className="mt-2 text-muted-foreground text-lg">
                  Plain-English explainers, voter stories, and civic education.
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-2 rounded-xl touch-target shrink-0" onClick={() => navigate('/stories')}>
                All Stories <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {stories.map((story, i) => (
                <Link key={story.id} to={`/stories/${story.slug}`} className={`animate-slide-up stagger-${i + 1}`}>
                  <Card className="group h-full overflow-hidden rounded-2xl transition-all hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 hover-lift touch-target">
                    <div className="aspect-video bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                      <div className="text-center">
                        {story.category?.color === 'emerald' && <span className="text-4xl">📚</span>}
                        {story.category?.color === 'blue' && <span className="text-4xl">📊</span>}
                        {story.category?.color === 'amber' && <span className="text-4xl">💛</span>}
                        {story.category?.color === 'teal' && <span className="text-4xl">🏛️</span>}
                        {story.category?.color === 'rose' && <span className="text-4xl">⚖️</span>}
                        {story.category?.color === 'violet' && <span className="text-4xl">🌙</span>}
                        {!story.category?.color && <span className="text-4xl">📖</span>}
                      </div>
                    </div>
                    <div className="p-5">
                      {story.category && (
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">
                          {story.category.name}
                        </span>
                      )}
                      <h3 className="mt-2 font-bold text-lg leading-snug group-hover:text-primary transition-colors">{story.title}</h3>
                      {story.excerpt && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{story.excerpt}</p>
                      )}
                      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                        {story.read_time_minutes && (
                          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {story.read_time_minutes} min read</span>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FINAL CTA */}
      <section className="mx-auto max-w-content px-4 sm:px-6 py-20 text-center">
        <h2 className="font-display text-3xl font-semibold sm:text-4xl tracking-tight">
          Ready to see your ballot?
        </h2>
        <p className="mt-3 text-lg text-muted-foreground">
          Enter your address and start researching in seconds.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={handleFindBallot} disabled={loading} className="h-14 px-8 rounded-2xl text-base font-bold touch-target shadow-md shadow-primary/20">
            See My Ballot
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate('/candidates')} className="h-14 px-8 rounded-2xl text-base font-semibold touch-target">
            Explore Candidates
          </Button>
        </div>
      </section>
    </div>
  );
}
