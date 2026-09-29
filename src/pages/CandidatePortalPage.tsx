import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, FileText, Calendar, MessageSquare, Loader2, Plus, Sparkles, Users, X, Megaphone, Trash2, Pencil, Award, BarChart3 } from 'lucide-react';
import { parseDateOnly } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import { PhotoUpload } from '@/components/shared/PhotoUpload';
import { useAuth } from '@/hooks/use-auth';
import { getMyClaimedCandidates, submitCandidateContent, submitQuestionnaireResponse, submitEvent } from '@/services/candidate-portal';
import { getTeamMembers, inviteTeamMember, revokeTeamMember, updateTeamMemberRole, createFeedPost, getFeedPosts as getCandidateFeedPosts, deleteFeedPost, getCandidateAnalytics } from '@/services/social';
import { getMyManagedCandidates } from '@/services/stripe';
import {
  getCampaign, upsertCampaign, getAllCampaignEventsForManagement,
  addCampaignEvent, updateCampaignEvent, deleteCampaignEvent,
  type Campaign, type CampaignEvent,
} from '@/services/campaign';
import {
  getGetToKnow, submitGetToKnow, getFundingSources, submitFundingSource, getEndorsements, submitEndorsement,
  getProfileExtras, upsertProfileExtras,
} from '@/services/candidate-profile-extras';
import type { CampaignTeamMember, TeamRole, CandidateGetToKnow, CandidateFundingSource, CandidateEndorsement, FundingSourceType, EndorserType, FeedPost } from '@/types';
import { toast } from 'sonner';
import { usePageMeta } from '@/hooks/use-page-meta';

interface ClaimedCandidate {
  candidate_id: string;
  status: string;
  full_name: string;
}

export function CandidatePortalPage() {
  usePageMeta({ title: 'Candidate Portal', noindex: true });
  const { user, loading: authLoading } = useAuth();
  const [claimed, setClaimed] = useState<ClaimedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'bio' | 'questionnaire' | 'events' | 'quiz' | 'team' | 'campaign' | 'extras' | 'analytics'>('overview');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Bio form
  const [bioForm, setBioForm] = useState({ field: 'bio' as const, value: '' });
  // Questionnaire form
  const [qForm, setQForm] = useState({ question: '', answer: '' });
  // Event form
  const [evForm, setEvForm] = useState({ title: '', description: '', event_date: '', start_time: '', location_name: '', city: '', state: '' });

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }

      // Returning from Stripe Checkout for Candidate Management. This used to
      // land on /account (the voter plan screen), which then said "payment is
      // finishing setup" because the voter plan never changes for a
      // Management purchase. Wait briefly for the webhook, then confirm here.
      const checkoutResult = new URLSearchParams(window.location.search).get('checkout');
      if (checkoutResult === 'success') {
        let managed = await getMyManagedCandidates().catch(() => []);
        for (let i = 0; i < 5 && !managed.some((m) => m.status === 'active'); i++) {
          await new Promise((r) => setTimeout(r, 1200));
          managed = await getMyManagedCandidates().catch(() => []);
        }
        if (managed.some((m) => m.status === 'active')) {
          toast.success('Payment successful — Candidate Management is active. Your Team and Campaign tools are unlocked.');
        } else {
          toast.success("Payment received — Candidate Management is finishing setup. Refresh in a minute if the tools aren't unlocked yet.");
        }
        window.history.replaceState({}, '', window.location.pathname);
      } else if (checkoutResult === 'canceled') {
        toast('Checkout was canceled — no charge was made.');
        window.history.replaceState({}, '', window.location.pathname);
      }

      const data = await getMyClaimedCandidates();
      setClaimed(data);
      setLoading(false);
    }
    load();
  }, [user]);

  // Check authLoading BEFORE deciding the user is signed out — on a fresh
  // page load the session hasn't finished restoring yet, so `user` starts
  // null for a moment even for an already-signed-in visitor. Without this,
  // the page would briefly show "Sign in required" (and its Sign In button)
  // to someone who is actually already logged in.
  if (authLoading) {
    return (
      <div className="mx-auto max-w-content px-4 sm:px-6 py-16">
        <LoadingState message="Loading…" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-content px-4 sm:px-6 py-16">
        <EmptyState
          title="Sign in required"
          description="You need an account to access the candidate portal."
          icon={<ShieldCheck className="h-10 w-10" />}
          action={<Link to="/signin"><Button>Sign In</Button></Link>}
        />
      </div>
    );
  }

  if (loading) return <LoadingState message="Loading your portal…" />;

  const verifiedClaim = claimed.find((c) => c.status === 'verified');

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Candidate Portal</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Manage your candidate profile. All submissions are reviewed by our team before going live.
      </p>

      {claimed.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="No claimed profiles yet"
            description="Find your candidate profile and click 'Is this your profile?' to claim it."
            icon={<ShieldCheck className="h-10 w-10" />}
            action={<Link to="/candidates"><Button>Browse Candidates</Button></Link>}
          />
        </div>
      )}

      {claimed.length > 0 && (
        <>
          <div className="mt-6 space-y-3">
            {claimed.map((c) => (
              <Card key={c.candidate_id} className="p-4 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-foreground">{c.full_name}</p>
                    <span className={`mt-1 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      c.status === 'verified' ? 'bg-success/10 text-success' : c.status === 'pending' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'
                    }`}>
                      {c.status === 'verified' && <ShieldCheck className="h-3 w-3" />}
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  </div>
                  {c.status === 'verified' && (
                    <Link to={`/candidates/${c.candidate_id}`}>
                      <Button variant="outline" size="sm" className="rounded-xl">View Profile</Button>
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {verifiedClaim && (
            <>
              <div className="mt-8 flex gap-2 rounded-xl border border-border bg-secondary/30 p-1">
                {([
                  { id: 'overview', label: 'Overview', icon: FileText },
                  { id: 'bio', label: 'Update Bio', icon: FileText },
                  { id: 'questionnaire', label: 'Questionnaire', icon: MessageSquare },
                  { id: 'events', label: 'Events', icon: Calendar },
                  { id: 'quiz', label: 'Issue Quiz', icon: Sparkles },
                  { id: 'team', label: 'Team', icon: Users },
                  { id: 'campaign', label: 'Campaign', icon: Megaphone },
                  { id: 'extras', label: 'Profile Extras', icon: Award },
                  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                      activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                {message && (
                  <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {message}
                  </div>
                )}

                {activeTab === 'overview' && (
                  <Card className="p-6 rounded-2xl">
                    <h3 className="font-bold text-lg">Portal Overview</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Use the tabs above to submit updates to your profile. All changes go through admin review before appearing publicly.
                      Your payments never affect your ranking, placement, or editorial content.
                    </p>

                    <div className="mt-6 border-t border-border pt-6">
                      <Label className="text-sm font-semibold">Profile Photo</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Upload a photo, then submit it for review. It goes live once approved.
                      </p>
                      <div className="mt-3">
                        <PhotoUpload
                          candidateId={verifiedClaim.candidate_id}
                          onUploaded={async (url) => {
                            if (!url) return;
                            setSubmitting(true);
                            const r = await submitCandidateContent(verifiedClaim.candidate_id, 'photo_url', url);
                            setSubmitting(false);
                            setMessage(r.success ? 'Photo submitted for review.' : (r.error ?? 'Failed to submit photo.'));
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-6 border-t border-border pt-6">
                      <Label className="text-sm font-semibold">Post an Update</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Share a campaign update with voters who follow you — appears in their Feed immediately (no review needed, unlike bio/photo edits).
                      </p>
                      <PostUpdateForm candidateId={verifiedClaim.candidate_id} />
                    </div>

                    <div className="mt-6 border-t border-border pt-6">
                      <Label className="text-sm font-semibold">Candidate Management</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Upgrade to launch campaign tools, invite a team, and unlock analytics for your profile.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 rounded-xl gap-1.5"
                        onClick={async () => {
                          try {
                            const { startCheckout } = await import('@/services/stripe');
                            await startCheckout('candidate_management', verifiedClaim.candidate_id);
                          } catch (err) {
                            setMessage(err instanceof Error ? err.message : 'Could not start checkout.');
                          }
                        }}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Upgrade to Management — $299
                      </Button>
                    </div>
                  </Card>
                )}

                {activeTab === 'bio' && (
                  <Card className="p-6 rounded-2xl">
                    <h3 className="font-bold text-lg">Update Your Biography</h3>
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="bio-value">Biography</Label>
                        <Textarea
                          id="bio-value"
                          value={bioForm.value}
                          onChange={(e) => setBioForm({ ...bioForm, value: e.target.value })}
                          placeholder="Tell voters about yourself…"
                          rows={6}
                        />
                      </div>
                      <Button
                        onClick={async () => {
                          if (!bioForm.value.trim()) return;
                          setSubmitting(true);
                          const r = await submitCandidateContent(verifiedClaim.candidate_id, 'bio', bioForm.value);
                          setSubmitting(false);
                          if (r.success) { setMessage('Biography submitted for review.'); setBioForm({ field: 'bio', value: '' }); }
                          else setMessage(r.error ?? 'Failed to submit.');
                        }}
                        disabled={submitting || !bioForm.value.trim()}
                        className="rounded-xl"
                      >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Submit for Review</>}
                      </Button>
                    </div>
                  </Card>
                )}

                {activeTab === 'questionnaire' && (
                  <Card className="p-6 rounded-2xl">
                    <h3 className="font-bold text-lg">Candidate Questionnaire</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Answer questions voters may have. Responses appear after admin approval.</p>
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="q-question">Question</Label>
                        <Input id="q-question" value={qForm.question} onChange={(e) => setQForm({ ...qForm, question: e.target.value })} placeholder="e.g., What is your position on education funding?" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="q-answer">Your Answer</Label>
                        <Textarea id="q-answer" value={qForm.answer} onChange={(e) => setQForm({ ...qForm, answer: e.target.value })} placeholder="Your response…" rows={4} />
                      </div>
                      <Button
                        onClick={async () => {
                          if (!qForm.question.trim()) return;
                          setSubmitting(true);
                          const r = await submitQuestionnaireResponse(verifiedClaim.candidate_id, qForm.question, qForm.answer);
                          setSubmitting(false);
                          if (r.success) { setMessage('Questionnaire response submitted for review.'); setQForm({ question: '', answer: '' }); }
                          else setMessage(r.error ?? 'Failed to submit.');
                        }}
                        disabled={submitting || !qForm.question.trim()}
                        className="rounded-xl"
                      >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Submit for Review</>}
                      </Button>
                    </div>
                  </Card>
                )}

                {activeTab === 'events' && (
                  <Card className="p-6 rounded-2xl">
                    <h3 className="font-bold text-lg">Add a Campaign Event</h3>
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="ev-title">Event Title</Label>
                        <Input id="ev-title" value={evForm.title} onChange={(e) => setEvForm({ ...evForm, title: e.target.value })} placeholder="Town Hall Meeting" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ev-desc">Description</Label>
                        <Input id="ev-desc" value={evForm.description} onChange={(e) => setEvForm({ ...evForm, description: e.target.value })} placeholder="Meet and greet with voters" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="ev-date">Date</Label>
                          <Input id="ev-date" type="date" value={evForm.event_date} onChange={(e) => setEvForm({ ...evForm, event_date: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ev-time">Time</Label>
                          <Input id="ev-time" type="time" value={evForm.start_time} onChange={(e) => setEvForm({ ...evForm, start_time: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="ev-loc">Location</Label>
                          <Input id="ev-loc" value={evForm.location_name} onChange={(e) => setEvForm({ ...evForm, location_name: e.target.value })} placeholder="Community Center" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ev-city">City</Label>
                          <Input id="ev-city" value={evForm.city} onChange={(e) => setEvForm({ ...evForm, city: e.target.value })} placeholder="City" />
                        </div>
                      </div>
                      <Button
                        onClick={async () => {
                          if (!evForm.title.trim() || !evForm.event_date) return;
                          setSubmitting(true);
                          const r = await submitEvent(verifiedClaim.candidate_id, evForm);
                          setSubmitting(false);
                          if (r.success) { setMessage('Event submitted for review.'); setEvForm({ title: '', description: '', event_date: '', start_time: '', location_name: '', city: '', state: '' }); }
                          else setMessage(r.error ?? 'Failed to submit.');
                        }}
                        disabled={submitting || !evForm.title.trim() || !evForm.event_date}
                        className="rounded-xl"
                      >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Submit Event</>}
                      </Button>
                    </div>
                  </Card>
                )}
                {activeTab === 'quiz' && (
                  <Card className="p-6 rounded-2xl">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-accent" />
                      Issue Positions Quiz
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      Answer the same questions voters answer during onboarding. This lets voters see where you stand on key issues and find alignment with your campaign. All answers go through admin review before going public.
                    </p>
                    <Link to="/candidate-quiz">
                      <Button className="mt-4 rounded-xl gap-2 font-bold">
                        <Sparkles className="h-4 w-4" />
                        Take the Quiz
                      </Button>
                    </Link>
                  </Card>
                )}
                {activeTab === 'team' && (
                  <TeamTab candidateId={verifiedClaim.candidate_id} />
                )}
                {activeTab === 'campaign' && (
                  <CampaignManagementTab candidateId={verifiedClaim.candidate_id} />
                )}
                {activeTab === 'extras' && (
                  <ProfileExtrasTab candidateId={verifiedClaim.candidate_id} />
                )}
                {activeTab === 'analytics' && (
                  <AnalyticsTab candidateId={verifiedClaim.candidate_id} />
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const TEAM_ROLES: { value: TeamRole; label: string }[] = [
  { value: 'campaign_manager', label: 'Campaign Manager' },
  { value: 'social_manager', label: 'Social Media Manager' },
  { value: 'volunteer_manager', label: 'Volunteer Manager' },
  { value: 'staff', label: 'Staff' },
  { value: 'volunteer', label: 'Volunteer' },
];

function TeamTab({ candidateId }: { candidateId: string }) {
  const [hasManagement, setHasManagement] = useState<boolean | null>(null);
  const [members, setMembers] = useState<CampaignTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('volunteer');
  const [inviting, setInviting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const managed = await getMyManagedCandidates();
      const active = managed.some((m) => m.candidate_id === candidateId && m.status === 'active');
      setHasManagement(active);
      if (active) setMembers(await getTeamMembers(candidateId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load team info.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [candidateId]);

  async function handleInvite() {
    if (!email.trim()) return;
    setInviting(true);
    try {
      const result = await inviteTeamMember(candidateId, email.trim(), role);
      if (result.linkedImmediately) {
        toast.success(`${email} already has a BallotLens account — they've been added and notified by email.`);
      } else {
        toast.success(`Invited ${email}. They don't have a BallotLens account yet — let them know to sign up with this exact email address, and they'll automatically get access.`);
      }
      setEmail('');
      setMembers(await getTeamMembers(candidateId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(id: string, memberEmail: string) {
    if (!window.confirm(`Revoke access for ${memberEmail}? They'll immediately lose access to this campaign.`)) return;
    try {
      await revokeTeamMember(id);
      toast.success('Access revoked.');
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'revoked' } : m)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke access.');
    }
  }

  async function handleRoleChange(id: string, role: TeamRole) {
    try {
      await updateTeamMemberRole(id, role);
      toast.success('Role updated.');
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role.');
    }
  }

  if (loading) return <LoadingState message="Loading team…" />;

  if (!hasManagement) {
    return (
      <Card className="p-6 rounded-2xl text-center">
        <Users className="h-8 w-8 mx-auto text-muted-foreground" />
        <h3 className="mt-3 font-bold text-lg">Team invites are a Candidate Management feature</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Upgrade to Candidate Management to invite a campaign manager, staff, and volunteers to help run your profile.
        </p>
        <Button
          className="mt-4 rounded-xl gap-1.5"
          onClick={async () => {
            try {
              const { startCheckout } = await import('@/services/stripe');
              await startCheckout('candidate_management', candidateId);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Could not start checkout.');
            }
          }}
        >
          <Sparkles className="h-4 w-4" /> Upgrade to Management — $299
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6 rounded-2xl">
        <h3 className="font-bold text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Invite a Team Member</h3>
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            placeholder="teammate@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as TeamRole)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {TEAM_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <Button onClick={handleInvite} disabled={!email.trim() || inviting} className="gap-1.5">
            {inviting ? 'Inviting…' : <><Plus className="h-4 w-4" /> Invite</>}
          </Button>
        </div>
      </Card>

      <Card className="p-6 rounded-2xl">
        <h3 className="font-bold text-lg mb-3">Team Members</h3>
        {members.filter((m) => m.status !== 'revoked').length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members yet — invite someone above.</p>
        ) : (
          <div className="space-y-2">
            {members.filter((m) => m.status !== 'revoked').map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{m.invited_email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value as TeamRole)}
                      className="text-xs rounded-md border border-input bg-background px-1.5 py-0.5"
                    >
                      {TEAM_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <span className="text-xs text-muted-foreground">· {m.status}</span>
                  </div>
                </div>
                <button onClick={() => handleRevoke(m.id, m.invited_email ?? 'this team member')} className="text-muted-foreground hover:text-destructive shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const EMPTY_EVENT_DRAFT = { title: '', description: '', location: '', event_date: '', is_public: true };

function CampaignManagementTab({ candidateId }: { candidateId: string }) {
  const [hasManagement, setHasManagement] = useState<boolean | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [headline, setHeadline] = useState('');
  const [message, setMessage] = useState('');
  const [goalsText, setGoalsText] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState(EMPTY_EVENT_DRAFT);
  const [savingEvent, setSavingEvent] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const managed = await getMyManagedCandidates();
      const active = managed.some((m) => m.candidate_id === candidateId && m.status === 'active');
      setHasManagement(active);
      if (active) {
        const [camp, evs] = await Promise.all([
          getCampaign(candidateId),
          getAllCampaignEventsForManagement(candidateId),
        ]);
        setCampaign(camp);
        setEvents(evs);
        setHeadline(camp?.headline ?? '');
        setMessage(camp?.message ?? '');
        setGoalsText((camp?.goals ?? []).join('\n'));
        setIsActive(camp?.is_active ?? true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load campaign info.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [candidateId]);

  async function handleSaveCampaign() {
    setSaving(true);
    try {
      const goals = goalsText.split('\n').map((g) => g.trim()).filter(Boolean);
      await upsertCampaign(candidateId, { headline, message, goals, is_active: isActive });
      toast.success('Campaign page saved.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save campaign page.');
    } finally {
      setSaving(false);
    }
  }

  function startEditEvent(e?: CampaignEvent) {
    if (e) {
      setEditingEventId(e.id);
      setEventDraft({
        title: e.title,
        description: e.description ?? '',
        location: e.location ?? '',
        event_date: e.event_date.slice(0, 16),
        is_public: e.is_public,
      });
    } else {
      setEditingEventId('new');
      setEventDraft(EMPTY_EVENT_DRAFT);
    }
  }

  async function handleSaveEvent() {
    if (!eventDraft.title.trim() || !eventDraft.event_date) return;
    setSavingEvent(true);
    try {
      const payload = {
        title: eventDraft.title.trim(),
        description: eventDraft.description.trim() || undefined,
        location: eventDraft.location.trim() || undefined,
        event_date: new Date(eventDraft.event_date).toISOString(),
        is_public: eventDraft.is_public,
      };
      if (editingEventId && editingEventId !== 'new') {
        await updateCampaignEvent(editingEventId, payload);
      } else {
        await addCampaignEvent(candidateId, payload);
      }
      toast.success('Event saved.');
      setEditingEventId(null);
      setEventDraft(EMPTY_EVENT_DRAFT);
      setEvents(await getAllCampaignEventsForManagement(candidateId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save event.');
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleDeleteEvent(id: string) {
    if (!window.confirm('Delete this event?')) return;
    try {
      await deleteCampaignEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      toast.success('Event deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete event.');
    }
  }

  if (loading) return <LoadingState message="Loading campaign…" />;

  if (!hasManagement) {
    return (
      <Card className="p-6 rounded-2xl text-center">
        <Megaphone className="h-8 w-8 mx-auto text-muted-foreground" />
        <h3 className="mt-3 font-bold text-lg">Campaign pages are a Candidate Management feature</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Upgrade to launch a public campaign page with your message, goals, and events for voters
          to follow while your race is active.
        </p>
        <Button
          className="mt-4 rounded-xl gap-1.5"
          onClick={async () => {
            try {
              const { startCheckout } = await import('@/services/stripe');
              await startCheckout('candidate_management', candidateId);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Could not start checkout.');
            }
          }}
        >
          <Sparkles className="h-4 w-4" /> Upgrade to Management — $299
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><Megaphone className="h-5 w-5" /> Campaign Page</h3>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Visible to voters
          </label>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Headline</Label>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Fighting for [district]'s future" />
          </div>
          <div>
            <Label className="text-xs">Campaign Message</Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Why you're running…"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Goals (one per line)</Label>
            <textarea
              value={goalsText}
              onChange={(e) => setGoalsText(e.target.value)}
              rows={3}
              placeholder={'Lower property taxes\nInvest in local schools'}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <Button onClick={handleSaveCampaign} disabled={saving} className="gap-1.5">
            {saving ? 'Saving…' : 'Save Campaign Page'}
          </Button>
        </div>
      </Card>

      <Card className="p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg flex items-center gap-2"><Calendar className="h-5 w-5" /> Events</h3>
          {editingEventId === null && (
            <Button size="sm" variant="outline" onClick={() => startEditEvent()} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Event
            </Button>
          )}
        </div>

        {editingEventId !== null && (
          <div className="mb-4 space-y-2 rounded-lg border border-border p-4">
            <Input placeholder="Event title" value={eventDraft.title} onChange={(e) => setEventDraft((d) => ({ ...d, title: e.target.value }))} />
            <Input type="datetime-local" value={eventDraft.event_date} onChange={(e) => setEventDraft((d) => ({ ...d, event_date: e.target.value }))} />
            <Input placeholder="Location" value={eventDraft.location} onChange={(e) => setEventDraft((d) => ({ ...d, location: e.target.value }))} />
            <Input placeholder="Description (optional)" value={eventDraft.description} onChange={(e) => setEventDraft((d) => ({ ...d, description: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={eventDraft.is_public} onChange={(e) => setEventDraft((d) => ({ ...d, is_public: e.target.checked }))} />
              Visible to voters
            </label>
            <div className="flex gap-2">
              <Button size="sm" disabled={savingEvent || !eventDraft.title.trim() || !eventDraft.event_date} onClick={handleSaveEvent}>
                {savingEvent ? 'Saving…' : 'Save Event'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingEventId(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                <div>
                  <p className="font-medium">{e.title}{!e.is_public && ' (Hidden)'}</p>
                  <p className="text-xs text-muted-foreground">{parseDateOnly(e.event_date).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEditEvent(e)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDeleteEvent(e.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const FUNDING_SOURCE_TYPES: { value: FundingSourceType; label: string }[] = [
  { value: 'individuals', label: 'Individual donors' },
  { value: 'pac', label: 'PAC' },
  { value: 'organization', label: 'Organization' },
  { value: 'self_funded', label: 'Self-funded' },
  { value: 'other', label: 'Other' },
];

const ENDORSER_TYPES: { value: EndorserType; label: string }[] = [
  { value: 'organization', label: 'Organization' },
  { value: 'elected_official', label: 'Elected Official' },
  { value: 'union', label: 'Union' },
  { value: 'community_group', label: 'Community Group' },
  { value: 'other', label: 'Other' },
];

function ProfileDetailsEditor({ candidateId }: { candidateId: string }) {
  const [form, setForm] = useState({
    office_sought: '', district: '', current_occupation: '', hometown_area: '',
    election_date: '', election_type: '', term_length: '', next_election_date: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfileExtras(candidateId).then((ex) => {
      if (ex) {
        setForm({
          office_sought: ex.office_sought ?? '', district: ex.district ?? '',
          current_occupation: ex.current_occupation ?? '', hometown_area: ex.hometown_area ?? '',
          election_date: ex.election_date ?? '', election_type: ex.election_type ?? '',
          term_length: ex.term_length ?? '', next_election_date: ex.next_election_date ?? '',
        });
      }
      setLoading(false);
    });
  }, [candidateId]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const blankToNull = (v: string) => (v.trim() === '' ? null : v.trim());
    const result = await upsertProfileExtras(candidateId, {
      office_sought: blankToNull(form.office_sought),
      district: blankToNull(form.district),
      current_occupation: blankToNull(form.current_occupation),
      hometown_area: blankToNull(form.hometown_area),
      election_date: blankToNull(form.election_date),
      election_type: (blankToNull(form.election_type) as 'primary' | 'runoff' | 'general' | null),
      term_length: blankToNull(form.term_length),
      next_election_date: blankToNull(form.next_election_date),
    });
    setSaving(false);
    if (result.success) toast.success('Profile details saved.');
    else toast.error(result.error ?? 'Failed to save profile details.');
  }

  if (loading) return <LoadingState message="Loading profile details…" />;

  return (
    <Card className="p-6 rounded-2xl">
      <h3 className="font-bold text-lg mb-1">Profile Details</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Shown on your public profile right away (these are factual details, not reviewed like endorsements).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label className="text-xs">Office sought</Label><Input value={form.office_sought} onChange={(e) => set('office_sought', e.target.value)} placeholder="e.g. City Council" /></div>
        <div><Label className="text-xs">District</Label><Input value={form.district} onChange={(e) => set('district', e.target.value)} placeholder="e.g. District 3" /></div>
        <div><Label className="text-xs">Current occupation</Label><Input value={form.current_occupation} onChange={(e) => set('current_occupation', e.target.value)} /></div>
        <div><Label className="text-xs">Hometown / area</Label><Input value={form.hometown_area} onChange={(e) => set('hometown_area', e.target.value)} /></div>
        <div><Label className="text-xs">Election date</Label><Input type="date" value={form.election_date} onChange={(e) => set('election_date', e.target.value)} /></div>
        <div>
          <Label className="text-xs">Election type</Label>
          <select value={form.election_type} onChange={(e) => set('election_type', e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="">Not set</option>
            <option value="primary">Primary</option>
            <option value="runoff">Runoff</option>
            <option value="general">General</option>
          </select>
        </div>
        <div><Label className="text-xs">Term length</Label><Input value={form.term_length} onChange={(e) => set('term_length', e.target.value)} placeholder="e.g. 4 years" /></div>
        <div><Label className="text-xs">Next election date</Label><Input type="date" value={form.next_election_date} onChange={(e) => set('next_election_date', e.target.value)} /></div>
      </div>
      <Button onClick={handleSave} disabled={saving} className="mt-4">{saving ? 'Saving…' : 'Save Details'}</Button>
    </Card>
  );
}

function ProfileExtrasTab({ candidateId }: { candidateId: string }) {
  const [getToKnow, setGetToKnow] = useState<CandidateGetToKnow[]>([]);
  const [funding, setFunding] = useState<CandidateFundingSource[]>([]);
  const [endorsements, setEndorsements] = useState<CandidateEndorsement[]>([]);
  const [loading, setLoading] = useState(true);

  const [gtkQuestion, setGtkQuestion] = useState('');
  const [gtkAnswer, setGtkAnswer] = useState('');
  const [savingGtk, setSavingGtk] = useState(false);

  const [fundType, setFundType] = useState<FundingSourceType>('individuals');
  const [fundPercentage, setFundPercentage] = useState('');
  const [fundLabel, setFundLabel] = useState('');
  const [savingFund, setSavingFund] = useState(false);

  const [endorserName, setEndorserName] = useState('');
  const [endorserType, setEndorserType] = useState<EndorserType>('organization');
  const [endorserTitle, setEndorserTitle] = useState('');
  const [savingEndorsement, setSavingEndorsement] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [gtk, fund, end] = await Promise.all([
        getGetToKnow(candidateId),
        getFundingSources(candidateId),
        getEndorsements(candidateId),
      ]);
      setGetToKnow(gtk);
      setFunding(fund);
      setEndorsements(end);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load profile extras.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [candidateId]);

  async function handleSubmitGtk() {
    if (!gtkQuestion.trim() || !gtkAnswer.trim()) return;
    setSavingGtk(true);
    const result = await submitGetToKnow(candidateId, gtkQuestion.trim(), gtkAnswer.trim(), getToKnow.length);
    setSavingGtk(false);
    if (result.success) {
      toast.success('Submitted for review.');
      setGtkQuestion(''); setGtkAnswer('');
      load();
    } else {
      toast.error(result.error ?? 'Failed to submit.');
    }
  }

  async function handleSubmitFunding() {
    const pct = parseFloat(fundPercentage);
    if (!fundPercentage || isNaN(pct)) return;
    setSavingFund(true);
    const result = await submitFundingSource(candidateId, {
      source_type: fundType,
      percentage: pct,
      amount_dollars: null,
      source_label: fundLabel.trim() || null,
      report_date: null,
    });
    setSavingFund(false);
    if (result.success) {
      toast.success('Submitted for review.');
      setFundPercentage(''); setFundLabel('');
      load();
    } else {
      toast.error(result.error ?? 'Failed to submit.');
    }
  }

  async function handleSubmitEndorsement() {
    if (!endorserName.trim()) return;
    setSavingEndorsement(true);
    const result = await submitEndorsement(candidateId, {
      endorser_name: endorserName.trim(),
      endorser_type: endorserType,
      endorser_title: endorserTitle.trim() || null,
      endorser_logo_url: null,
      endorsement_date: null,
      display_order: endorsements.length,
    });
    setSavingEndorsement(false);
    if (result.success) {
      toast.success('Submitted for review.');
      setEndorserName(''); setEndorserTitle('');
      load();
    } else {
      toast.error(result.error ?? 'Failed to submit.');
    }
  }

  if (loading) return <LoadingState message="Loading profile extras…" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Get-to-know answers, funding sources and endorsements go through admin review before they
        appear on your public profile. The lists below show what's already approved; a new submission
        shows up here once an admin approves it.
      </p>
      <ProfileDetailsEditor candidateId={candidateId} />

      <Card className="p-6 rounded-2xl">
        <h3 className="font-bold text-lg mb-2">Get to Know You (Q&amp;A)</h3>
        <div className="space-y-2 mb-4">
          <Input placeholder="Question (e.g. What's your favorite local spot?)" value={gtkQuestion} onChange={(e) => setGtkQuestion(e.target.value)} />
          <Input placeholder="Your answer" value={gtkAnswer} onChange={(e) => setGtkAnswer(e.target.value)} />
          <Button size="sm" onClick={handleSubmitGtk} disabled={savingGtk || !gtkQuestion.trim() || !gtkAnswer.trim()}>
            {savingGtk ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
        {getToKnow.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {getToKnow.map((g) => (
              <div key={g.id} className="text-sm border-b border-border/50 pb-2 last:border-0">
                <p className="font-medium">{g.question} <span className="text-xs font-normal text-muted-foreground">({g.status})</span></p>
                <p className="text-muted-foreground">{g.answer}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 rounded-2xl">
        <h3 className="font-bold text-lg mb-2">Funding Sources</h3>
        <div className="space-y-2 mb-4">
          <select value={fundType} onChange={(e) => setFundType(e.target.value as FundingSourceType)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {FUNDING_SOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Input type="number" placeholder="Percentage (e.g. 40)" value={fundPercentage} onChange={(e) => setFundPercentage(e.target.value)} />
          <Input placeholder="Label (optional, e.g. 'Local small businesses')" value={fundLabel} onChange={(e) => setFundLabel(e.target.value)} />
          <Button size="sm" onClick={handleSubmitFunding} disabled={savingFund || !fundPercentage}>
            {savingFund ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
        {funding.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {funding.map((f) => (
              <div key={f.id} className="flex justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                <span>{FUNDING_SOURCE_TYPES.find((t) => t.value === f.source_type)?.label} {f.source_label ? `— ${f.source_label}` : ''}</span>
                <span className="font-medium">{f.percentage}% <span className="text-xs font-normal text-muted-foreground">({f.status})</span></span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 rounded-2xl">
        <h3 className="font-bold text-lg mb-2">Endorsements</h3>
        <div className="space-y-2 mb-4">
          <Input placeholder="Endorser name" value={endorserName} onChange={(e) => setEndorserName(e.target.value)} />
          <select value={endorserType} onChange={(e) => setEndorserType(e.target.value as EndorserType)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {ENDORSER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Input placeholder="Title (optional, e.g. 'Mayor of...')" value={endorserTitle} onChange={(e) => setEndorserTitle(e.target.value)} />
          <Button size="sm" onClick={handleSubmitEndorsement} disabled={savingEndorsement || !endorserName.trim()}>
            {savingEndorsement ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
        {endorsements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {endorsements.map((e) => (
              <div key={e.id} className="text-sm border-b border-border/50 pb-2 last:border-0">
                <p className="font-medium">{e.endorser_name}{e.endorser_title ? `, ${e.endorser_title}` : ''}</p>
                <p className="text-xs text-muted-foreground">{ENDORSER_TYPES.find((t) => t.value === e.endorser_type)?.label} · {e.status}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PostUpdateForm({ candidateId }: { candidateId: string }) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setPosts(await getCandidateFeedPosts(candidateId));
    } catch {
      // Best-effort — the form still works even if the recent-posts list fails to load.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [candidateId]);

  async function handlePost() {
    if (!body.trim()) return;
    setPosting(true);
    try {
      await createFeedPost(candidateId, body.trim(), 'update');
      toast.success('Posted to your feed.');
      setBody('');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post update.');
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(postId: string) {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deleteFeedPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete post.');
    }
  }

  return (
    <div className="mt-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="What's happening in your campaign?"
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />
      <Button size="sm" className="mt-2 gap-1.5" onClick={handlePost} disabled={posting || !body.trim()}>
        {posting ? 'Posting…' : 'Post to Feed'}
      </Button>

      {!loading && posts.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent posts</p>
          {posts.slice(0, 5).map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 text-sm border-b border-border/50 pb-2 last:border-0">
              <p className="text-muted-foreground">{p.body}</p>
              <button onClick={() => handleDelete(p.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsTab({ candidateId }: { candidateId: string }) {
  const [hasManagement, setHasManagement] = useState<boolean | null>(null);
  const [stats, setStats] = useState<{ profileViews: number; followers: number; questionCount: number; answeredCount: number; postCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const managed = await getMyManagedCandidates();
        const active = managed.some((m) => m.candidate_id === candidateId && m.status === 'active');
        setHasManagement(active);
        if (active) setStats(await getCandidateAnalytics(candidateId));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load analytics.');
      } finally {
        setLoading(false);
      }
    })();
  }, [candidateId]);

  if (loading) return <LoadingState message="Loading analytics…" />;

  if (!hasManagement) {
    return (
      <Card className="p-8 rounded-2xl text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 font-bold text-lg">Analytics is a Management feature</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upgrade to Candidate Management to see profile views, followers, and engagement stats.
        </p>
        <Button
          size="sm"
          className="mt-4 rounded-xl gap-1.5"
          onClick={async () => {
            try {
              const { startCheckout } = await import('@/services/stripe');
              await startCheckout('candidate_management', candidateId);
            } catch {
              toast.error('Could not start checkout.');
            }
          }}
        >
          <Sparkles className="h-3.5 w-3.5" /> Upgrade to Management — $299
        </Button>
      </Card>
    );
  }

  if (!stats) return <p className="text-sm text-muted-foreground">Could not load analytics.</p>;

  const cards = [
    { label: 'Profile Views', value: stats.profileViews },
    { label: 'Followers', value: stats.followers },
    { label: 'Voter Questions', value: stats.questionCount },
    { label: 'Questions Answered', value: stats.answeredCount },
    { label: 'Feed Posts', value: stats.postCount },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-5 rounded-2xl">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-2xl font-bold">{c.value}</p>
        </Card>
      ))}
    </div>
  );
}
