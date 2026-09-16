import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, FileText, Calendar, MessageSquare, Loader2, Plus, Sparkles, Users, X, Megaphone, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import { PhotoUpload } from '@/components/shared/PhotoUpload';
import { useAuth } from '@/hooks/use-auth';
import { getMyClaimedCandidates, submitCandidateContent, submitQuestionnaireResponse, submitEvent } from '@/services/candidate-portal';
import { getTeamMembers, inviteTeamMember, revokeTeamMember } from '@/services/social';
import { getMyManagedCandidates } from '@/services/stripe';
import {
  getCampaign, upsertCampaign, getAllCampaignEventsForManagement,
  addCampaignEvent, updateCampaignEvent, deleteCampaignEvent,
  type Campaign, type CampaignEvent,
} from '@/services/campaign';
import type { CampaignTeamMember, TeamRole } from '@/types';
import { toast } from 'sonner';

interface ClaimedCandidate {
  candidate_id: string;
  status: string;
  full_name: string;
}

export function CandidatePortalPage() {
  const { user } = useAuth();
  const [claimed, setClaimed] = useState<ClaimedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'bio' | 'questionnaire' | 'events' | 'quiz' | 'team' | 'campaign'>('overview');
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
      const data = await getMyClaimedCandidates();
      setClaimed(data);
      setLoading(false);
    }
    load();
  }, [user]);

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
      const active = managed.some((m) => m.candidate_id === candidateId && (m.status === 'active' || m.is_comped));
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
      await inviteTeamMember(candidateId, email.trim(), role);
      toast.success(`Invited ${email}.`);
      setEmail('');
      setMembers(await getTeamMembers(candidateId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeTeamMember(id);
      toast.success('Access revoked.');
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'revoked' } : m)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke access.');
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
                <div>
                  <p className="font-medium">{m.invited_email}</p>
                  <p className="text-xs text-muted-foreground">
                    {TEAM_ROLES.find((r) => r.value === m.role)?.label ?? m.role} · {m.status}
                  </p>
                </div>
                <button onClick={() => handleRevoke(m.id)} className="text-muted-foreground hover:text-destructive">
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
      const active = managed.some((m) => m.candidate_id === candidateId && (m.status === 'active' || m.is_comped));
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
                  <p className="text-xs text-muted-foreground">{new Date(e.event_date).toLocaleString()}</p>
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
