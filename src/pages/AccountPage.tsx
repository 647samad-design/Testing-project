import { useEffect, useState, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  User, MapPin, Heart, Bookmark, LogOut, Scale, Eye, Settings,
  TrendingUp, Users, MessageSquare, Sparkles, Zap, Award,
  Flame, Target, CheckCircle2, ChevronRight, Rss, Newspaper,
  Vote as VoteIcon, Calendar, Mic, BookOpen, GitCompare, Search,
  Activity, BarChart3, Trophy, Radio, ArrowRight, Bell, Clock,
  Layers, Gauge, Pin, Camera, Briefcase, GraduationCap, Home,
  CheckCircle, Circle, ArrowRight as ArrowRightIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { getLocation, getUserIssues, saveLocation, updateProfile } from '@/services/districts';
import { LoadingState } from '@/components/shared/StateComponents';
import { JOURNEY_STEPS, getJourneySteps, toggleJourneyStep, uploadProfilePhoto, removeProfilePhoto, changePassword } from '@/services/voter-profile';
import { getMySubscription, getMyManagedCandidates, openBillingPortal, startCheckout, type MySubscription, type MyManagedCandidate } from '@/services/stripe';
import { invalidateSubscriptionCache } from '@/services/subscription-cache';
import { getFollowedCandidates } from '@/services/social';
import { getNotificationPreferences, updateNotificationPreferences, type NotificationPreferences } from '@/services/notification-preferences';
import { toast } from 'sonner';
import type { Candidate, Issue, UserLocation, ElectionJourneyStep } from '@/types';
import { cn } from '@/lib/utils';
import { usePageMeta } from '@/hooks/use-page-meta';
import { getElections } from '@/services/civic';
import { parseDateOnly } from '@/lib/date-utils';

export function AccountPage() {
  usePageMeta({ title: 'Account', noindex: true });
  const { user, profile, signOut, isDemo, refreshProfile, loading: authLoading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [bio, setBio] = useState('');
  const [occupation, setOccupation] = useState('');
  const [education, setEducation] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [userIssues, setUserIssues] = useState<Issue[]>([]);
  const [savedCandidates, setSavedCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [streak, setStreak] = useState(1);
  const [civicScore, setCivicScore] = useState(85);
  const [journeySteps, setJourneySteps] = useState<ElectionJourneyStep[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'journey' | 'billing' | 'notifications'>(
    () => (new URLSearchParams(window.location.search).get('checkout') ? 'billing' : 'dashboard')
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setFullName(profile?.full_name ?? '');
    setZipCode(profile?.zip_code ?? '');
    setBio(profile?.bio ?? '');
    setOccupation(profile?.occupation ?? '');
    setEducation(profile?.education ?? '');
    setPhotoUrl(profile?.photo_url ?? null);
    setCivicScore(85 + (profile?.civic_xp ?? 0));

    // Load streak from localStorage
    const savedStreak = parseInt(localStorage.getItem('ballotlens_streak') ?? '1', 10);
    const lastVisit = localStorage.getItem('ballotlens_last_visit');
    const today = new Date().toDateString();
    if (lastVisit !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const newStreak = lastVisit === yesterday ? savedStreak + 1 : 1;
      setStreak(newStreak);
      localStorage.setItem('ballotlens_streak', String(newStreak));
      localStorage.setItem('ballotlens_last_visit', today);
    } else {
      setStreak(savedStreak);
    }

    async function load() {
      const [loc, issues, followedCandidates, journey] = await Promise.all([
        getLocation(),
        getUserIssues(),
        getFollowedCandidates(),
        isDemo ? Promise.resolve([]) : getJourneySteps(),
      ]);
      setLocation(loc);
      setUserIssues(issues);
      // Real "watchlist" — candidates the user has actually followed, not a
      // slice of every candidate in the database (which is what this used
      // to show, regardless of what the user had actually saved/followed).
      setSavedCandidates(
        followedCandidates.map((f) => f.candidate).filter((c): c is Candidate => !!c)
      );
      setJourneySteps(journey);
      setLoading(false);
    }
    load();
  }, [user, profile, isDemo]);

  // IMPORTANT: check authLoading BEFORE deciding the user is signed out.
  // On a fresh page load — e.g. the full-page redirect back from Stripe
  // Checkout to /account?checkout=success — the Supabase session hasn't
  // finished restoring from storage yet, so `user` starts out as null for
  // a moment even for a signed-in visitor. Redirecting to /signin on that
  // first render (as this used to do) would bounce a just-paid customer
  // straight to the sign-in page instead of their account.
  if (authLoading) return <LoadingState message="Loading your account…" />;
  if (!user) return <Navigate to="/signin" replace />;
  if (loading) return <LoadingState message="Loading your dashboard…" />;

  async function handleSave() {
    if (isDemo) {
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
      setSaving(false);
      setEditMode(false);
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        full_name: fullName, zip_code: zipCode, bio,
        occupation, education, photo_url: photoUrl ?? undefined,
      });
      if (zipCode) {
        const districts = await import('@/services/elections').then(m => m.getVoterDistricts(zipCode).catch(() => null));
        if (districts) {
          await saveLocation(zipCode, districts.municipal, districts.state, districts.county).catch(() => {});
          setLocation({ zip_code: zipCode, city: districts.municipal, state: districts.state, county: districts.county } as UserLocation);
        }
      }
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
      setEditMode(false);
    } catch {
      // ignore
    }
    setSaving(false);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isDemo) {
      const reader = new FileReader();
      reader.onload = () => setPhotoUrl(reader.result as string);
      reader.readAsDataURL(file);
      return;
    }
    setUploadingPhoto(true);
    const result = await uploadProfilePhoto(file);
    if (result.url) {
      setPhotoUrl(result.url);
      try {
        await updateProfile({ photo_url: result.url });
        await refreshProfile();
        toast.success('Profile photo updated.');
      } catch (err) {
        toast.error(`Photo uploaded but not saved to your profile: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    } else {
      // Previously ignored, so a failed upload showed nothing at all.
      toast.error(result.error ?? 'Photo upload failed. Please try again.');
    }
    setUploadingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleRemovePhoto() {
    if (!window.confirm('Remove your profile photo?')) return;
    setUploadingPhoto(true);
    const removed = await removeProfilePhoto();
    let saveError: string | undefined;
    try { await updateProfile({ photo_url: null }); await refreshProfile(); }
    catch (err) { saveError = err instanceof Error ? err.message : 'unknown error'; }
    setUploadingPhoto(false);
    if (removed.error || saveError) {
      toast.error(removed.error ?? saveError ?? 'Could not remove the photo.');
      return;
    }
    setPhotoUrl(null);
    toast.success('Profile photo removed.');
  }

  async function handleToggleStep(stepNumber: number, currentCompleted: boolean) {
    if (isDemo) {
      setJourneySteps(prev => {
        const existing = prev.find(s => s.step_number === stepNumber);
        if (existing) {
          return prev.map(s => s.step_number === stepNumber ? { ...s, completed: !currentCompleted } : s);
        }
        return [...prev, { id: 'demo', user_id: 'demo', step_number: stepNumber, completed: !currentCompleted, completed_at: !currentCompleted ? new Date().toISOString() : null, progress_detail: null }];
      });
      return;
    }
    const result = await toggleJourneyStep(stepNumber, !currentCompleted);
    if (result.success) {
      setJourneySteps(prev => {
        const existing = prev.find(s => s.step_number === stepNumber);
        if (existing) {
          return prev.map(s => s.step_number === stepNumber ? { ...s, completed: !currentCompleted, completed_at: !currentCompleted ? new Date().toISOString() : null } : s);
        }
        return [...prev, { id: 'new', user_id: user?.id ?? '', step_number: stepNumber, completed: !currentCompleted, completed_at: !currentCompleted ? new Date().toISOString() : null, progress_detail: null }];
      });
    }
  }

  // A real account without a name used to show "Demo Voter", which looked like
  // the user had been put in demo mode.
  const displayName = fullName || (isDemo ? 'Demo Voter' : (user?.email?.split('@')[0] ?? 'Your profile'));
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const quizDone = localStorage.getItem('ballotlens_quiz_done') === 'true';
  const civicLevel = profile?.civic_level ?? Math.floor(civicScore / 20) + 1;
  const joinedDate = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '2026';

  // Journey progress
  const completedSteps = journeySteps.filter(s => s.completed).length;
  const totalSteps = JOURNEY_STEPS.length;

  // Mock civic activity stats (would come from DB in production)
  const electionsFollowed = savedCandidates.length;
  const questionsAsked = parseInt(localStorage.getItem('ballotlens_questions_asked') ?? '0', 10);
  const questionsAnswered = parseInt(localStorage.getItem('ballotlens_questions_answered') ?? '0', 10);

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-6 animate-fade-in">
      {isDemo && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3">
          <Eye className="h-5 w-5 text-warning shrink-0" />
          <p className="text-sm text-warning font-medium">
            You're exploring in demo mode. Changes won't be saved. Sign out to connect a real account.
          </p>
        </div>
      )}

      {/* VOTER SNAPSHOT + PUBLIC PROFILE */}
      <Card className="overflow-hidden rounded-3xl mb-6">
        {/* Header with photo and identity */}
        <div className="relative bg-gradient-to-br from-primary/10 via-accent/5 to-transparent px-6 pt-8 pb-6">
          <div className="absolute top-4 right-4 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditMode(!editMode)} className="gap-1.5 rounded-xl touch-target">
              <Settings className="h-4 w-4" />
              {editMode ? 'Cancel' : 'Edit'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()} className="gap-1.5 rounded-xl touch-target text-muted-foreground" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Photo with upload */}
            <div className="relative shrink-0 group">
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                {photoUrl ? (
                  <AvatarImage src={photoUrl} alt={displayName} />
                ) : (
                  <AvatarFallback className="text-2xl font-extrabold bg-gradient-to-br from-primary to-accent text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                )}
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:scale-110 transition-transform touch-target"
                aria-label="Upload photo"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              {photoUrl && !isDemo && (
                <button
                  onClick={handleRemovePhoto}
                  disabled={uploadingPhoto}
                  className="mt-2 block w-24 text-center text-xs font-medium text-muted-foreground hover:text-destructive"
                >
                  Remove photo
                </button>
              )}
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-3xl font-bold tracking-tight">{displayName}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                {location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {location.city ?? 'Unknown'}, {location.state ?? 'Unknown'}
                  </span>
                )}
                <span className="flex items-center gap-1 font-bold text-accent">
                  <Trophy className="h-3.5 w-3.5" />
                  Civic Level {civicLevel}
                </span>
                <span className="flex items-center gap-1 font-bold text-warning">
                  <Flame className="h-3.5 w-3.5" />
                  {streak} day streak
                </span>
                <span className="text-xs">
                  Joined {joinedDate}
                </span>
              </div>

              {/* Public profile details */}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {occupation && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Briefcase className="h-3.5 w-3.5" />
                    {occupation}
                  </span>
                )}
                {education && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <GraduationCap className="h-3.5 w-3.5" />
                    {education}
                  </span>
                )}
              </div>

              {bio && (
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-lg">{bio}</p>
              )}
            </div>
          </div>
        </div>

        {/* Edit panel */}
        {editMode && (
          <div className="px-6 py-5 border-t border-border/50 animate-slide-up">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Display Name</label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className="rounded-xl h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">ZIP Code</label>
                <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="33101" maxLength={5} className="rounded-xl h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Occupation / Industry</label>
                <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="Software Engineer" className="rounded-xl h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Education</label>
                <Input value={education} onChange={(e) => setEducation(e.target.value)} placeholder="FIU, B.S. Political Science" className="rounded-xl h-11" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-semibold text-foreground">Bio</label>
                <Input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell people about yourself" className="rounded-xl h-11" maxLength={160} />
                <p className="text-xs text-muted-foreground">{bio.length}/160 characters</p>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="mt-4 w-full rounded-xl h-11 font-bold sm:w-auto">
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
            {savedMsg && <p className="text-sm text-success text-center font-semibold flex items-center justify-center gap-1 mt-3">
              <CheckCircle2 className="h-4 w-4" /> Saved successfully!
            </p>}
          </div>
        )}

        {/* Interested In */}
        {userIssues.length > 0 && (
          <div className="px-6 py-4 border-t border-border/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Interested In</p>
            <div className="flex flex-wrap gap-2">
              {userIssues.map((issue) => (
                <span
                  key={issue.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent"
                >
                  <Scale className="h-3 w-3" />
                  {issue.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Civic Activity */}
        <div className="px-6 py-4 border-t border-border/50 bg-secondary/20">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Civic Activity</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="font-display text-2xl font-extrabold text-primary">{electionsFollowed}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">Elections Followed</p>
            </div>
            <div className="text-center">
              <p className="font-display text-2xl font-extrabold text-accent">{questionsAsked}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">Questions Asked</p>
            </div>
            <div className="text-center">
              <p className="font-display text-2xl font-extrabold text-success">{questionsAnswered}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">Answered by Candidates</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-lg gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
              <Award className="h-3 w-3" /> Local Expert
            </Badge>
            <Badge className="rounded-lg gap-1 bg-accent/10 text-accent border-accent/20 hover:bg-accent/10">
              <BookOpen className="h-3 w-3" /> Policy Explorer
            </Badge>
            <Badge className="rounded-lg gap-1 bg-success/10 text-success border-success/20 hover:bg-success/10">
              <Users className="h-3 w-3" /> Community Contributor
            </Badge>
          </div>
        </div>
      </Card>

      {/* TABS: Dashboard / Election Journey */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'dashboard' | 'journey' | 'billing' | 'notifications')} className="mb-6">
        <TabsList className="w-full justify-start overflow-x-auto no-scrollbar">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="journey">
            Election Journey
            {completedSteps > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-extrabold text-primary">
                {completedSteps}/{totalSteps}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* DASHBOARD TAB */}
        <TabsContent value="dashboard" className="mt-6">
          {/* MAIN GRID: Dashboard + Sidebar */}
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left column — the daily dashboard */}
        <div className="space-y-6">
          {/* TODAY'S BRIEFING */}
          <Card className="overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between bg-secondary/40 px-5 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Radio className="h-4 w-4 text-primary" />
                  <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive animate-pulse" />
                </div>
                <h2 className="font-bold text-sm uppercase tracking-wide">Today's Briefing</h2>
              </div>
              <span className="text-[10px] font-bold text-muted-foreground">
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
              </span>
            </div>
            <div className="p-5 space-y-3">
              <BriefingItem
                icon={VoteIcon}
                color="text-primary"
                bg="bg-primary/10"
                title={`${Math.max(0, Math.ceil((new Date('2026-11-03').getTime() - Date.now()) / 86400000))} days to Election Day`}
                desc="Check your registration status and polling location."
                link="/ballot"
              />
              {quizDone ? (
                <BriefingItem
                  icon={CheckCircle2}
                  color="text-success"
                  bg="bg-success/10"
                  title="Quiz complete — see your matches"
                  desc="You've taken the issue quiz. Browse candidates to see alignment."
                  link="/candidates"
                />
              ) : (
                <BriefingItem
                  icon={Sparkles}
                  color="text-accent"
                  bg="bg-accent/10"
                  title="Take the issue quiz"
                  desc="8 quick questions to find candidates who share your views."
                  link="/onboarding"
                />
              )}
              <BriefingItem
                icon={Search}
                color="text-warning"
                bg="bg-warning/10"
                title="Fact-check something"
                desc="Paste a link or quote — we'll break down what's true."
                link="/lens"
              />
              <BriefingItem
                icon={Newspaper}
                color="text-muted-foreground"
                bg="bg-secondary"
                title="Catch up on Civic Wire"
                desc="Latest updates from candidates, election results, and news."
                link="/feed"
              />
            </div>
          </Card>

          {/* YOUR WATCHLIST */}
          <Card className="rounded-3xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-primary" />
                <h2 className="font-bold text-sm uppercase tracking-wide">Your Watchlist</h2>
              </div>
              <Link to="/candidates" className="text-xs font-bold text-primary hover:underline">
                Browse all
              </Link>
            </div>
            <div className="p-3">
              {savedCandidates.length > 0 ? (
                <div className="space-y-1">
                  {savedCandidates.map((c) => (
                    <Link
                      key={c.id}
                      to={`/candidates/${c.id}`}
                      className="flex items-center gap-3 rounded-2xl p-3 hover:bg-secondary/50 transition-all touch-target group"
                    >
                      <Avatar className="h-11 w-11 shrink-0 border border-border">
                        {c.photo_url ? (
                          <img src={c.photo_url} alt={`${c.first_name} ${c.last_name}`} className="h-full w-full object-cover" />
                        ) : (
                          <AvatarFallback className="text-sm font-bold bg-secondary">
                            {c.first_name?.[0]}{c.last_name?.[0]}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">
                          {c.first_name} {c.last_name}
                        </p>
                        <span className="text-xs text-muted-foreground">{c.party ?? 'Independent'}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-muted-foreground">Your watchlist is empty</p>
                  <p className="text-xs text-muted-foreground mt-1">Follow candidates to track them here.</p>
                  <Link to="/candidates" className="mt-3 inline-block">
                    <Button size="sm" variant="outline" className="rounded-xl gap-1.5">
                      Discover candidates <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </Card>

          {/* UPCOMING ELECTIONS — real data. This used to be a hardcoded
              "Trending Races" list with a pulsing LIVE badge and invented
              dates ("Florida Governor · Primary · Aug 18", "Tampa City
              Council · Runoff · Dec 1") shown to every user. */}
          <UpcomingElectionsCard />

          {/* QUICK ACTIONS */}
          <div>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Explore
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border border-border bg-card p-4 transition-all hover:shadow-md hover-lift touch-target',
                    action.hoverBg
                  )}
                >
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl mb-3 transition-transform group-hover:scale-110', action.bg)}>
                    <action.icon className={cn('h-5 w-5', action.color)} />
                  </div>
                  <p className="font-bold text-sm text-foreground">{action.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                  <ChevronRight className="absolute top-4 right-4 h-4 w-4 text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Alignment card */}
          <Card className="p-5 rounded-3xl bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                <Trophy className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-bold text-sm">Your Alignment</h3>
            </div>
            {quizDone ? (
              <div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Based on your quiz answers, here are your top issue alignments:
                </p>
                <div className="space-y-2.5">
                  {userIssues.slice(0, 3).map((issue, i) => (
                    <div key={issue.id} className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 shrink-0">
                        <Scale className="h-3.5 w-3.5 text-accent" />
                      </div>
                      <span className="text-xs font-bold flex-1 truncate">{issue.name}</span>
                      <span className="text-xs font-extrabold text-success">{85 - i * 5}%</span>
                    </div>
                  ))}
                </div>
                <Link to="/compare" className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-primary hover:underline">
                  Compare candidates <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Take the 8-question quiz to see how your views align with candidates.
                </p>
                <Link to="/onboarding">
                  <Button size="sm" className="w-full rounded-xl gap-1.5 font-bold">
                    <Sparkles className="h-3.5 w-3.5" />
                    Take the Quiz
                  </Button>
                </Link>
              </div>
            )}
          </Card>

          {/* Following */}
          <Card className="p-5 rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                <h3 className="font-bold">Following</h3>
              </div>
              <Link to="/candidates">
                <Button size="sm" variant="ghost" className="text-xs rounded-lg px-2">View all</Button>
              </Link>
            </div>
            {savedCandidates.length > 0 ? (
              <div className="space-y-2">
                {savedCandidates.slice(0, 4).map((c) => (
                  <Link
                    key={c.id}
                    to={`/candidates/${c.id}`}
                    className="flex items-center gap-3 rounded-xl p-2 -m-2 hover:bg-secondary/50 transition-colors touch-target"
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      {c.photo_url ? (
                        <img src={c.photo_url} alt={`${c.first_name} ${c.last_name}`} className="h-full w-full object-cover" />
                      ) : (
                        <AvatarFallback className="text-xs font-bold bg-secondary">
                          {c.first_name?.[0]}{c.last_name?.[0]}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{c.first_name} {c.last_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.party ?? 'Candidate'}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <Heart className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Not following anyone yet.</p>
                <Link to="/candidates" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
                  Browse candidates →
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>
        </TabsContent>

        {/* ELECTION JOURNEY TAB */}
        <TabsContent value="journey" className="mt-6">
          <Card className="rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between bg-gradient-to-r from-primary/10 to-accent/5 px-6 py-4 border-b border-border/50">
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight">Your 2026 Election Journey</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {completedSteps} of {totalSteps} steps completed
                </p>
              </div>
              <div className="relative">
                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" className="stroke-secondary" />
                  <circle
                    cx="32" cy="32" r="28" fill="none" strokeWidth="5"
                    className="stroke-primary transition-all duration-500"
                    strokeDasharray={`${(completedSteps / totalSteps) * 176} 176`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-primary">
                  {Math.round((completedSteps / totalSteps) * 100)}%
                </span>
              </div>
            </div>

            <div className="p-4">
              <div className="space-y-1">
                {JOURNEY_STEPS.map((step, idx) => {
                  const stepData = journeySteps.find(s => s.step_number === step.number);
                  const completed = stepData?.completed ?? false;
                  const isLast = idx === JOURNEY_STEPS.length - 1;
                  return (
                    <div key={step.number} className="flex items-stretch gap-3">
                      {/* Connector line + number circle */}
                      <div className="flex flex-col items-center shrink-0">
                        <button
                          onClick={() => handleToggleStep(step.number, completed)}
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all touch-target shrink-0',
                            completed
                              ? 'border-success bg-success text-success-foreground'
                              : 'border-border bg-card text-muted-foreground hover:border-primary'
                          )}
                        >
                          {completed ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : (
                            <span className="text-xs font-extrabold">{step.number}</span>
                          )}
                        </button>
                        {!isLast && (
                          <div className={cn(
                            'w-0.5 flex-1 min-h-[24px] my-1 transition-colors',
                            completed ? 'bg-success/40' : 'bg-border'
                          )} />
                        )}
                      </div>

                      {/* Content */}
                      <Link
                        to={step.link}
                        className={cn(
                          'flex-1 flex items-center justify-between rounded-xl px-3 py-2.5 mb-1 transition-all touch-target group',
                          completed ? 'bg-success/5' : 'hover:bg-secondary/40'
                        )}
                      >
                        <div>
                          <p className={cn(
                            'text-sm font-bold transition-colors',
                            completed ? 'text-success' : 'text-foreground group-hover:text-primary'
                          )}>
                            {step.label}
                          </p>
                          {stepData?.progress_detail && (
                            <p className="text-xs text-muted-foreground mt-0.5">{stepData.progress_detail}</p>
                          )}
                        </div>
                        {completed ? (
                          <Badge variant="outline" className="rounded-lg text-[9px] font-bold border-success/30 text-success shrink-0">
                            Done
                          </Badge>
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground transition-colors shrink-0" />
                        )}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* BILLING TAB */}
        <TabsContent value="billing" className="mt-6">
          <BillingTab />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <NotificationSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  candidate_monthly: 'Candidate (Monthly)',
  candidate_yearly: 'Candidate (Yearly)',
  pro_monthly: 'Pro (Monthly)',
  pro_yearly: 'Pro (Yearly)',
  premium_monthly: 'Premium (Monthly)',
  premium_yearly: 'Premium (Yearly)',
};

const FREE_FEATURES = [
  'See your full ballot',
  'Research candidates',
  'Compare positions',
  'Follow evidence sources',
  'Ask BallotLens AI — 5 questions/day',
  'Follow up to 5 candidates',
];

const CANDIDATE_FEATURES = [
  ...FREE_FEATURES.filter((f) => !f.includes('5 candidates')),
  'Follow unlimited candidates to your watchlist',
  'Get email alerts when new info is added',
  'Access advanced candidate comparison tools',
  'See voting records with plain-English summaries',
  'Track ballot measures with personalized notes',
  'Ad-free browsing experience',
];

const PRO_FEATURES = [
  ...CANDIDATE_FEATURES,
  'Expanded AI Research — up to 100 questions/day',
  'Early access to new tools',
];

/** What a plan actually unlocks, for the "what you get" list on the Billing
 * tab — so a user (or admin looking at their account) can see plainly what
 * access comes with what they've paid for, not just the plan's price. */
function featuresForPlan(plan: string): string[] {
  if (plan === 'pro_monthly' || plan === 'pro_yearly') return PRO_FEATURES;
  if (plan === 'candidate_monthly' || plan === 'candidate_yearly' || plan === 'premium_monthly' || plan === 'premium_yearly') return CANDIDATE_FEATURES;
  return FREE_FEATURES;
}

const DIGEST_LABELS: Record<NotificationPreferences['digest_frequency'], string> = {
  weekly: 'Weekly digest',
  daily: 'Daily digest',
  off: 'Off',
};

function NotificationSettingsTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getNotificationPreferences().then((p) => { setPrefs(p); setLoading(false); });
  }, []);

  async function handleChange(updates: Partial<NotificationPreferences>) {
    if (!prefs) return;
    const next = { ...prefs, ...updates };
    setPrefs(next);
    setSaving(true);
    try {
      await updateNotificationPreferences(updates);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preferences.');
      setPrefs(prefs); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  if (loading || !prefs) return <LoadingState message="Loading notification settings…" />;

  return (
    <div className="space-y-5">
      <Card className="p-6 rounded-2xl">
        <h3 className="font-bold text-lg">Instant Alerts</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Account security emails (verification, password resets) always send regardless of these settings.
        </p>
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Election reminders</p>
              <p className="text-xs text-muted-foreground">Registration deadlines and upcoming Election Day reminders.</p>
            </div>
            <input
              type="checkbox"
              checked={prefs.instant_election_reminders}
              onChange={(e) => handleChange({ instant_election_reminders: e.target.checked })}
              className="h-5 w-5 shrink-0 accent-primary"
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Updates on what you follow</p>
              <p className="text-xs text-muted-foreground">A major update to a candidate, election, or ballot measure you follow.</p>
            </div>
            <input
              type="checkbox"
              checked={prefs.instant_followed_updates}
              onChange={(e) => handleChange({ instant_followed_updates: e.target.checked })}
              className="h-5 w-5 shrink-0 accent-primary"
            />
          </label>
        </div>
      </Card>

      <Card className="p-6 rounded-2xl">
        <h3 className="font-bold text-lg">BallotLens Digest</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything else — new positions, articles, and profile updates — grouped into one email instead of many.
        </p>
        <div className="mt-4">
          <p className="text-sm font-medium mb-2">Frequency</p>
          <div className="flex gap-2">
            {(['weekly', 'daily', 'off'] as const).map((freq) => (
              <button
                key={freq}
                onClick={() => handleChange({ digest_frequency: freq })}
                className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                  prefs.digest_frequency === freq ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-secondary'
                }`}
              >
                {DIGEST_LABELS[freq]}
              </button>
            ))}
          </div>
        </div>

        {prefs.digest_frequency !== 'off' && (
          <div className="mt-5 space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium">Include in digest</p>
            {[
              { key: 'digest_candidate_updates' as const, label: 'Candidate updates', desc: 'New positions and profile changes for candidates you follow.' },
              { key: 'digest_ballot_measure_updates' as const, label: 'Ballot measure updates', desc: 'Changes to ballot measures you follow.' },
              { key: 'digest_news_updates' as const, label: 'News and article updates', desc: 'Recently added articles and sources.' },
              { key: 'digest_new_elections' as const, label: 'New elections', desc: 'Upcoming elections and important deadlines.' },
            ].map((row) => (
              <label key={row.key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs[row.key]}
                  onChange={(e) => handleChange({ [row.key]: e.target.checked })}
                  className="h-5 w-5 shrink-0 accent-primary"
                />
              </label>
            ))}
          </div>
        )}
      </Card>

      {saving && <p className="text-xs text-muted-foreground">Saving…</p>}

      <ChangePasswordCard />

      <DangerZoneCard />
    </div>
  );
}

function ChangePasswordCard() {
  const { isDemo } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const mismatch = confirm.length > 0 && next !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) return;
    setSaving(true);
    const { error } = await changePassword(current, next);
    setSaving(false);
    if (error) { toast.error(error); return; }
    setCurrent(''); setNext(''); setConfirm('');
    toast.success('Password changed.');
  }

  if (isDemo) return null;
  return (
    <Card className="p-6 rounded-3xl">
      <h3 className="font-bold text-lg">Change password</h3>
      <p className="mt-1 text-sm text-muted-foreground">Use at least 8 characters. You'll stay signed in on this device.</p>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:max-w-md">
        <div>
          <Label htmlFor="pw-current" className="text-xs">Current password</Label>
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="pw-new" className="text-xs">New password</Label>
          <Input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="pw-confirm" className="text-xs">Confirm new password</Label>
          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          {mismatch && <p className="mt-1 text-xs text-destructive">Passwords don't match.</p>}
        </div>
        <Button type="submit" disabled={saving || !current || next.length < 8 || mismatch} className="w-fit">
          {saving ? 'Changing…' : 'Change password'}
        </Button>
      </form>
    </Card>
  );
}

function DangerZoneCard() {
  const { deleteAccount, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const { error } = await deleteAccount();
      if (error) {
        toast.error(error);
        setDeleting(false);
        return;
      }
      toast.success('Your account has been permanently deleted.');
      await signOut();
      window.location.href = '/';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account.');
      setDeleting(false);
    }
  }

  return (
    <Card className="p-6 rounded-2xl border-destructive/30">
      <h3 className="font-bold text-lg text-destructive">Danger Zone</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Permanently delete your account and all associated data — saved candidates, messages,
        notes, and any candidate profile claims. This cannot be undone.
      </p>
      {!open ? (
        <Button variant="outline" className="mt-4 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
          Delete My Account
        </Button>
      ) : (
        <div className="mt-4 space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">
            Type <span className="font-mono font-bold">DELETE</span> to confirm. This is permanent and cannot be reversed.
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="max-w-xs"
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={confirmText !== 'DELETE' || deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
            </Button>
            <Button variant="outline" onClick={() => { setOpen(false); setConfirmText(''); }}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function BillingTab() {
  const [subscription, setSubscription] = useState<MySubscription | null>(null);
  const [managedCandidates, setManagedCandidates] = useState<MyManagedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    const checkoutResult = new URLSearchParams(window.location.search).get('checkout');

    (async () => {
      try {
        // Straight after Stripe redirects back, the webhook that updates our
        // `subscriptions` row may not have finished processing yet (it's a
        // separate async call from Stripe to our servers). Rather than show
        // "Free" for a moment and confuse a customer who just paid, poll
        // briefly for the plan to change before settling.
        let sub = await getMySubscription();
        if (checkoutResult === 'success') {
          invalidateSubscriptionCache();
          for (let attempt = 0; attempt < 5 && (!sub || sub.plan === 'free'); attempt++) {
            await new Promise((r) => setTimeout(r, 1200));
            invalidateSubscriptionCache();
            sub = await getMySubscription();
          }
          invalidateSubscriptionCache(); // so <AdSlot> etc. also pick up the new plan
          if (sub && sub.plan !== 'free') {
            toast.success(`Payment successful! You're now on the ${PLAN_LABELS[sub.plan] ?? sub.plan} plan.`);
          } else {
            toast.success("Payment received — it's finishing setup and should appear here shortly. Refresh in a moment if it doesn't.");
          }
          // Strip the query param so refreshing the page doesn't re-trigger this.
          window.history.replaceState({}, '', window.location.pathname);
        } else if (checkoutResult === 'canceled') {
          toast('Checkout was canceled — no charge was made.');
          window.history.replaceState({}, '', window.location.pathname);
        }

        const managed = await getMyManagedCandidates();
        setSubscription(sub);
        setManagedCandidates(managed);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load billing info.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      await openBillingPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open billing portal.');
      setPortalLoading(false);
    }
  }

  async function handleUpgrade(plan: 'pro_monthly') {
    try {
      await startCheckout(plan);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start checkout.');
    }
  }

  if (loading) return <LoadingState message="Loading billing info…" />;

  const planLabel = subscription ? (PLAN_LABELS[subscription.plan] ?? subscription.plan) : 'Free';
  const isPaid = !!subscription && subscription.plan !== 'free';

  return (
    <div className="space-y-5">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Plan</p>
            <h3 className="mt-1 text-2xl font-bold flex items-center gap-2">
              {planLabel}
              {isPaid && (
                <Badge variant={subscription?.status === 'active' ? 'default' : 'destructive'} className="text-xs">
                  {subscription?.status}
                </Badge>
              )}
            </h3>
            {isPaid && subscription?.current_period_end && (
              <p className="mt-1 text-sm text-muted-foreground">
                {subscription.cancel_at_period_end ? 'Cancels' : 'Renews'} on{' '}
                {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            )}
            {isPaid && subscription?.created_at && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Purchased {new Date(subscription.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
              </p>
            )}
            {!isPaid && (
              <p className="mt-1 text-sm text-muted-foreground">
                You're on the free plan — core ballot info is always free.
              </p>
            )}
          </div>

          {isPaid ? (
            <Button variant="outline" className="rounded-xl gap-1.5" disabled={portalLoading} onClick={handleManageBilling}>
              {portalLoading ? 'Opening…' : 'Manage Billing'}
            </Button>
          ) : (
            <Button className="rounded-xl gap-1.5" onClick={() => handleUpgrade('pro_monthly')}>
              <Sparkles className="h-4 w-4" /> Upgrade to Pro
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-6 rounded-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          What's included with {planLabel}
        </p>
        <ul className="space-y-2">
          {featuresForPlan(subscription?.plan ?? 'free').map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span className="text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
        {!isPaid && (
          <p className="mt-4 text-xs text-muted-foreground">
            You won't get Candidate or Pro features until you subscribe — nothing extra unlocks automatically.
          </p>
        )}
      </Card>

      {managedCandidates.length > 0 && (
        <Card className="p-6 rounded-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Candidate Management
          </p>
          <div className="space-y-3">
            {managedCandidates.map((c) => (
              <div key={c.candidate_id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                <span className="font-medium">{c.first_name} {c.last_name}</span>
                <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                  {c.is_comped ? (c.status === 'active' ? 'Comped (free)' : `Comped — ${c.status}`) : c.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Need to update your payment method, download an invoice, or cancel? Use "Manage Billing" above —
        it opens Stripe's secure billing portal.
      </p>
    </div>
  );
}

function BriefingItem({
  icon: Icon, color, bg, title, desc, link,
}: {
  icon: typeof Zap;
  color: string;
  bg: string;
  title: string;
  desc: string;
  link: string;
}) {
  return (
    <Link
      to={link}
      className="flex items-start gap-3 rounded-2xl p-3 hover:bg-secondary/40 transition-all touch-target group"
    >
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', bg)}>
        <Icon className={cn('h-4.5 w-4.5', color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
    </Link>
  );
}

// ─── Static data ───────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { to: '/feed', label: 'Civic Wire', desc: 'Live results & news', icon: Rss, color: 'text-primary', bg: 'bg-primary/10', hoverBg: 'hover:bg-primary/15' },
  { to: '/messages', label: 'Messages', desc: 'Chat with candidates', icon: MessageSquare, color: 'text-accent', bg: 'bg-accent/10', hoverBg: 'hover:bg-accent/15' },
  { to: '/ballot', label: 'My Ballot', desc: 'View your races', icon: Scale, color: 'text-success', bg: 'bg-success/10', hoverBg: 'hover:bg-success/15' },
  { to: '/ask', label: 'Ask AI', desc: 'Get instant answers', icon: Sparkles, color: 'text-warning', bg: 'bg-warning/10', hoverBg: 'hover:bg-warning/15' },
  { to: '/compare', label: 'Compare', desc: 'Side-by-side candidates', icon: GitCompare, color: 'text-primary', bg: 'bg-primary/10', hoverBg: 'hover:bg-primary/15' },
  { to: '/lens', label: 'Lens This', desc: 'Fact-check anything', icon: Search, color: 'text-accent', bg: 'bg-accent/10', hoverBg: 'hover:bg-accent/15' },
];


function UpcomingElectionsCard() {
  const [elections, setElections] = useState<{ id: string; name: string; election_date: string }[] | null>(null);

  useEffect(() => {
    getElections()
      .then((all) => {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        setElections(all.filter((e) => e.election_date >= today).slice(0, 4));
      })
      .catch(() => setElections([]));
  }, []);

  if (!elections || elections.length === 0) return null;

  return (
    <Card className="rounded-3xl">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50">
        <Activity className="h-4 w-4 text-warning" />
        <h2 className="font-bold text-sm uppercase tracking-wide">Upcoming Elections</h2>
      </div>
      <div className="p-3 space-y-1">
        {elections.map((e) => {
          const date = parseDateOnly(e.election_date);
          const days = Math.round((date.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
          return (
            <Link key={e.id} to="/ballot" className="flex items-center gap-3 rounded-2xl p-3 hover:bg-secondary/50 transition-all touch-target group">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{e.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <Badge variant="outline" className="rounded-lg text-[10px] font-bold border-warning/30 text-warning">
                {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`}
              </Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
